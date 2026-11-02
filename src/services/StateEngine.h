/**
 * FreeMix State Engine (C++)
 * Estado centralizado com revision + JSON Patch + resync
 * Exposto via WebSocket para clientes remotos
 */

#pragma once

#include <QObject>
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonDocument>
#include <QMap>
#include <QSet>
#include <QMutex>
#include <QTimer>
#include <functional>
#include <memory>
#include <vector>

class StateEngine : public QObject {
    Q_OBJECT

public:
    struct Patch {
        QString op;      // "add" | "replace" | "remove"
        QString path;    // JSON pointer path
        QJsonValue value;
    };

    struct HistoryEntry {
        qint64 rev;
        Patch patch;
        qint64 timestamp;
    };

    explicit StateEngine(QObject* parent = nullptr);
    ~StateEngine() override = default;

    // ===== STATE ACCESS =====

    QJsonObject state() const;
    QJsonValue get(const QString& path) const;
    bool set(const QString& path, const QJsonValue& value);

    // ===== COMMANDS =====

    using CommandHandler = std::function<QJsonObject(const QJsonObject&, StateEngine*)>;
    void registerCommand(const QString& name, CommandHandler handler);
    QJsonObject executeCommand(const QString& name, const QJsonObject& payload);

    // ===== SUBSCRIPTIONS =====

    using ChangeCallback = std::function<void(const QJsonValue&, const Patch*, qint64)>;
    std::function<void()> subscribe(const QString& path, ChangeCallback callback);

    // ===== PATCH / SYNC =====

    QJsonArray getPatches(qint64 fromRev, qint64 toRev = -1) const;
    void applyPatches(const QJsonArray& patches);
    QJsonObject resync(qint64 clientRev) const;

    // ===== SNAPSHOTS =====

    QJsonObject snapshot() const;
    void restore(const QJsonObject& snapshot, qint64 newRev = -1);

    // ===== SERVER INTEGRATION =====

    void broadcastState(const QString& clientId = QString());
    void broadcastMeters(const QJsonObject& meters);

    qint64 currentRev() const { return m_rev; }
    void setMaxHistory(int max) { m_maxHistory = max; }

signals:
    void stateChanged(const QJsonObject& state, qint64 rev);
    void commandExecuted(const QString& command, const QJsonObject& payload, const QJsonObject& result, qint64 rev);
    void clientConnected(const QString& clientId);
    void clientDisconnected(const QString& clientId);

private:
    // Internal state
    QJsonObject m_state;
    qint64 m_rev = 0;
    QVector<HistoryEntry> m_history;
    int m_maxHistory = 1000;

    // Command handlers
    QMap<QString, CommandHandler> m_commandHandlers;

    // Subscriptions (path -> list of callbacks with IDs)
    struct Subscription {
        QString path;
        ChangeCallback callback;
        QUuid id;
    };
    QVector<Subscription> m_subscriptions;

    // Clients
    QMap<QString, qint64> m_clientRevs;

    // Thread safety
    mutable QMutex m_mutex;

    // ===== INTERNAL METHODS =====

    QJsonValue _getPath(const QJsonObject& obj, const QString& path) const;
    void _setPath(QJsonObject& obj, const QString& path, const QJsonValue& value);
    void _removePath(QJsonObject& obj, const QString& path);
    Patch _createPatch(const QString& path, const QJsonValue& oldValue, const QJsonValue& newValue);
    void _applyPatch(QJsonObject& obj, const Patch& patch);
    void _commit(const Patch& patch);
    void _notifySubscriptions(const Patch& patch);
    void _trimHistory();
    bool _equals(const QJsonValue& a, const QJsonValue& b) const;
    bool _pathMatches(const QString& listenPath, const QString& eventPath) const;
};