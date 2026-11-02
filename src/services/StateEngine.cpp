#include "StateEngine.h"
#include <QUuid>
#include <QJsonDocument>
#include <QDebug>
#include <QMutexLocker>

StateEngine::StateEngine(QObject* parent) : QObject(parent) {
    // Initialize default state
    m_state = QJsonObject{
        {"rev", 0},
        {"inputs", QJsonObject{}},
        {"audio", QJsonObject{
            {"buses", QJsonObject{
                {"M", QJsonObject{}},
                {"A", QJsonObject{}},
                {"B", QJsonObject{}}
            }},
            {"master", QJsonObject{{"gain", 0}, {"mute", false}}}
        }},
        {"mixer", QJsonObject{{"strips", QJsonObject{}}}},
        {"replay", QJsonObject{{"status", "idle"}, {"events", QJsonArray{}}, {"timeline", QJsonArray{}}}},
        {"calls", QJsonObject{}},
        {"outputs", QJsonObject{}},
        {"graphics", QJsonObject{}},
        {"recording", QJsonObject{{"status", "idle"}}},
        {"streaming", QJsonObject{{"status", "idle"}}},
        {"multiview", QJsonObject{{"layout", "standard"}}},
        {"preview", QJsonObject{{"inputId", QJsonValue::Null}}},
        {"program", QJsonObject{{"inputId", QJsonValue::Null}}},
        {"transition", QJsonObject{{"type", "cut"}, {"duration", 300}, {"progress", 0.0}}},
        {"ftb", QJsonObject{{"active", false}}},
        {"project", QJsonObject{{"name", "Novo Projeto"}, {"modified", false}}},
        {"workspace", QJsonObject{{"layout", "default"}, {"panels", QJsonObject{}}}}
    };
}

QJsonObject StateEngine::state() const {
    QMutexLocker locker(&m_mutex);
    return m_state;
}

QJsonValue StateEngine::get(const QString& path) const {
    QMutexLocker locker(&m_mutex);
    return _getPath(m_state, path);
}

bool StateEngine::set(const QString& path, const QJsonValue& value) {
    QMutexLocker locker(&m_mutex);
    const QJsonValue oldValue = _getPath(m_state, path);
    if (_equals(oldValue, value)) return false;

    const Patch patch = _createPatch(path, oldValue, value);
    _applyPatch(m_state, patch);
    _commit(patch);
    return true;
}

void StateEngine::registerCommand(const QString& name, CommandHandler handler) {
    QMutexLocker locker(&m_mutex);
    m_commandHandlers[name] = std::move(handler);
}

QJsonObject StateEngine::executeCommand(const QString& name, const QJsonObject& payload) {
    QMutexLocker locker(&m_mutex);
    auto it = m_commandHandlers.find(name);
    if (it == m_commandHandlers.end()) {
        return QJsonObject{{"success", false}, {"error", QString("Command not found: %1").arg(name)}};
    }

    const QJsonObject result = it.value()(payload, this);
    emit commandExecuted(name, payload, result, m_rev);
    return result;
}

std::function<void()> StateEngine::subscribe(const QString& path, ChangeCallback callback) {
    QMutexLocker locker(&m_mutex);
    const QUuid id = QUuid::createUuid();
    m_subscriptions.append({path, std::move(callback), id});
    return [this, id]() {
        QMutexLocker locker(&m_mutex);
        for (int i = 0; i < m_subscriptions.size(); ++i) {
            if (m_subscriptions[i].id == id) {
                m_subscriptions.removeAt(i);
                break;
            }
        }
    };
}

QJsonArray StateEngine::getPatches(qint64 fromRev, qint64 toRev) const {
    QMutexLocker locker(const_cast<QMutex*>(&m_mutex));
    if (toRev < 0) toRev = m_rev;
    if (fromRev >= toRev) return QJsonArray();

    QJsonArray patches;
    for (qint64 i = fromRev; i < toRev && i < m_history.size(); ++i) {
        const auto& entry = m_history[i];
        QJsonObject patchObj;
        patchObj["op"] = entry.patch.op;
        patchObj["path"] = entry.patch.path;
        if (entry.patch.op != "remove") {
            patchObj["value"] = entry.patch.value;
        }
        patches.append(patchObj);
    }
    return patches;
}

void StateEngine::applyPatches(const QJsonArray& patches) {
    QMutexLocker locker(&m_mutex);
    for (const auto& patchVal : patches) {
        const QJsonObject patchObj = patchVal.toObject();
        Patch patch;
        patch.op = patchObj["op"].toString();
        patch.path = patchObj["path"].toString();
        patch.value = patchObj["value"];
        _applyPatch(m_state, patch);
        m_rev++;
        m_history.append({m_rev, patch, QDateTime::currentMSecsSinceEpoch()});
        _notifySubscriptions(patch);
    }
    _trimHistory();
}

QJsonObject StateEngine::resync(qint64 clientRev) const {
    QMutexLocker locker(const_cast<QMutex*>(&m_mutex));
    if (clientRev >= m_rev) {
        return QJsonObject{{"patches", QJsonArray{}}, {"rev", m_rev}, {"state", m_state}};
    }
    return QJsonObject{
        {"patches", getPatches(clientRev)},
        {"rev", m_rev},
        {"state", m_state}
    };
}

QJsonObject StateEngine::snapshot() const {
    QMutexLocker locker(const_cast<QMutex*>(&m_mutex));
    return QJsonDocument(m_state).object(); // deep copy
}

void StateEngine::restore(const QJsonObject& snapshot, qint64 newRev) {
    QMutexLocker locker(&m_mutex);
    m_state = QJsonDocument(snapshot).object(); // deep copy
    m_rev = (newRev >= 0) ? newRev : m_rev + 1;
    m_history.clear();
    // Notify all subscribers
    for (const auto& sub : m_subscriptions) {
        const QJsonValue value = _getPath(m_state, sub.path);
        if (!value.isUndefined()) {
            sub.callback(value, nullptr, m_rev);
        }
    }
}

void StateEngine::broadcastState(const QString& clientId) {
    QMutexLocker locker(&m_mutex);
    QJsonObject msg;
    msg["type"] = clientId.isEmpty() ? "state" : "init";
    msg["data"] = m_state;
    msg["rev"] = m_rev;
    emit stateChanged(msg, m_rev);
}

void StateEngine::broadcastMeters(const QJsonObject& meters) {
    QJsonObject msg;
    msg["type"] = "meters";
    msg["inputs"] = meters;
    emit stateChanged(msg, m_rev); // Reuse signal for meters
}

// ===== INTERNAL =====

QJsonValue StateEngine::_getPath(const QJsonObject& obj, const QString& path) const {
    if (path.isEmpty()) return obj;
    QStringList keys = path.split('.');
    QJsonValue current = obj;
    for (const QString& key : keys) {
        if (current.isObject()) {
            current = current.toObject()[key];
        } else if (current.isArray()) {
            bool ok;
            int idx = key.toInt(&ok);
            if (ok && idx >= 0 && idx < current.toArray().size()) {
                current = current.toArray()[idx];
            } else {
                return QJsonValue::Undefined;
            }
        } else {
            return QJsonValue::Undefined;
        }
    }
    return current;
}

void StateEngine::_setPath(QJsonObject& obj, const QString& path, const QJsonValue& value) {
    QStringList keys = path.split('.');
    if (keys.isEmpty()) return;

    QString lastKey = keys.takeLast();
    QJsonObject* current = &obj;

    for (const QString& key : keys) {
        if (!current->contains(key) || !(*current)[key].isObject()) {
            (*current)[key] = QJsonObject{};
        }
        current = &(*current)[key].toObject();
    }
    (*current)[lastKey] = value;
}

void StateEngine::_removePath(QJsonObject& obj, const QString& path) {
    QStringList keys = path.split('.');
    if (keys.isEmpty()) return;

    QString lastKey = keys.takeLast();
    QJsonObject* current = &obj;

    for (const QString& key : keys) {
        if (!current->contains(key) || !(*current)[key].isObject()) {
            return;
        }
        current = &(*current)[key].toObject();
    }
    current->remove(lastKey);
}

StateEngine::Patch StateEngine::_createPatch(const QString& path, const QJsonValue& oldValue, const QJsonValue& newValue) {
    Patch patch;
    patch.path = path;
    if (newValue.isUndefined()) {
        patch.op = "remove";
    } else if (oldValue.isUndefined()) {
        patch.op = "add";
        patch.value = newValue;
    } else {
        patch.op = "replace";
        patch.value = newValue;
    }
    return patch;
}

void StateEngine::_applyPatch(QJsonObject& obj, const Patch& patch) {
    if (patch.op == "add" || patch.op == "replace") {
        _setPath(obj, patch.path, patch.value);
    } else if (patch.op == "remove") {
        _removePath(obj, patch.path);
    }
}

void StateEngine::_commit(const Patch& patch) {
    m_rev++;
    m_history.append({m_rev, patch, QDateTime::currentMSecsSinceEpoch()});
    _notifySubscriptions(patch);
    _trimHistory();
}

void StateEngine::_notifySubscriptions(const Patch& patch) {
    const QString eventPath = patch.path;
    for (const auto& sub : m_subscriptions) {
        if (_pathMatches(sub.path, eventPath)) {
            const QJsonValue value = _getPath(m_state, sub.path);
            if (!value.isUndefined()) {
                sub.callback(value, &patch, m_rev);
            }
        }
    }
}

void StateEngine::_trimHistory() {
    if (m_history.size() > m_maxHistory) {
        m_history = m_history.mid(m_history.size() - m_maxHistory);
    }
}

bool StateEngine::_equals(const QJsonValue& a, const QJsonValue& b) const {
    return QJsonDocument(a).toJson() == QJsonDocument(b).toJson();
}

bool StateEngine::_pathMatches(const QString& listenPath, const QString& eventPath) const {
    if (listenPath.isEmpty() || listenPath == "*") return true;
    if (eventPath.isEmpty()) return false;
    return eventPath.startsWith(listenPath + ".") || eventPath == listenPath;
}