#include "WebSocketServer.h"
#include "StateEngine.h"
#include <QWebSocket>
#include <QUuid>
#include <QJsonDocument>
#include <QDebug>

WebSocketServer::WebSocketServer(freemix::StateEngine* stateEngine, QObject* parent)
    : QObject(parent), m_stateEngine(stateEngine) {
    m_server = new QWebSocketServer("FreeMix State Engine", QWebSocketServer::NonSecureMode, this);
    connect(m_server, &QWebSocketServer::newConnection, this, &WebSocketServer::onNewConnection);

    // Connect to StateEngine state changes
    connect(m_stateEngine, &freemix::StateEngine::stateChanged,
            this, &WebSocketServer::onStateChanged);

    // Periodic broadcast for clients that need full state sync
    m_broadcastTimer = new QTimer(this);
    m_broadcastTimer->setInterval(1000); // 1 Hz full state broadcast
    connect(m_broadcastTimer, &QTimer::timeout, this, [this]() {
        broadcastState(m_stateEngine->state(), m_stateEngine->currentRev());
    });
}

WebSocketServer::~WebSocketServer() {
    stop();
}

bool WebSocketServer::start(quint16 port) {
    if (m_server->listen(QHostAddress::Any, port)) {
        qInfo() << "[WebSocketServer] Listening on port" << port;
        m_broadcastTimer->start();
        return true;
    } else {
        qCritical() << "[WebSocketServer] Failed to listen on port" << port << ":" << m_server->errorString();
        emit errorOccurred(m_server->errorString());
        return false;
    }
}

void WebSocketServer::stop() {
    m_broadcastTimer->stop();
    if (m_server) {
        m_server->close();
        qDeleteAll(m_clients.keys());
        m_clients.clear();
        m_clientRevs.clear();
    }
}

void WebSocketServer::onNewConnection() {
    QWebSocket* client = m_server->nextPendingConnection();
    if (!client) return;

    const QString clientId = QUuid::createUuid().toString(QUuid::WithoutBraces);
    m_clients[client] = clientId;
    m_clientRevs[clientId] = 0;

    connect(client, &QWebSocket::disconnected, this, &WebSocketServer::onClientDisconnected);
    connect(client, &QWebSocket::textMessageReceived, this, &WebSocketServer::onTextMessageReceived);
    connect(client, &QWebSocket::binaryMessageReceived, this, &WebSocketServer::onBinaryMessageReceived);

    qInfo() << "[WebSocketServer] Client connected:" << clientId << "(" << m_clients.size() << "clients)";
    emit clientConnected(clientId);

    // Send initial state
    QJsonObject initMsg;
    initMsg["type"] = "init";
    initMsg["clientId"] = clientId;
    initMsg["rev"] = m_stateEngine->currentRev();
    initMsg["data"] = m_stateEngine->state();
    sendToClient(client, initMsg);
}

void WebSocketServer::onClientDisconnected() {
    QWebSocket* client = qobject_cast<QWebSocket*>(sender());
    if (!client) return;

    const QString clientId = m_clients.value(client);
    m_clients.remove(client);
    m_clientRevs.remove(clientId);

    client->deleteLater();

    qInfo() << "[WebSocketServer] Client disconnected:" << clientId << "(" << m_clients.size() << "clients)";
    emit clientDisconnected(clientId);
}

void WebSocketServer::onTextMessageReceived(const QString& message) {
    QWebSocket* client = qobject_cast<QWebSocket*>(sender());
    if (!client) return;

    QJsonParseError error;
    const QJsonDocument doc = QJsonDocument::fromJson(message.toUtf8(), &error);
    if (error.error != QJsonParseError::NoError) {
        qWarning() << "[WebSocketServer] Invalid JSON from" << m_clients.value(client) << ":" << error.errorString();
        return;
    }

    const QJsonObject msg = doc.object();
    const QString type = msg["type"].toString();

    if (type == "command") {
        handleCommand(client, msg);
    } else if (type == "subscribe") {
        handleSubscribe(client, msg);
    } else if (type == "resync") {
        handleResync(client, msg);
    } else if (type == "ping") {
        handlePing(client, msg);
    } else {
        qWarning() << "[WebSocketServer] Unknown message type:" << type << "from" << m_clients.value(client);
    }

    emit messageReceived(m_clients.value(client), msg);
}

void WebSocketServer::onBinaryMessageReceived(const QByteArray& message) {
    QWebSocket* client = qobject_cast<QWebSocket*>(sender());
    if (!client) return;

    QJsonParseError error;
    const QJsonDocument doc = QJsonDocument::fromJson(message, &error);
    if (error.error != QJsonParseError::NoError) {
        qWarning() << "[WebSocketServer] Invalid binary JSON from" << m_clients.value(client);
        return;
    }
    onTextMessageReceived(doc.toJson(QJsonDocument::Compact));
}

void WebSocketServer::onStateChanged(const QJsonObject& state, qint64 rev) {
    // Broadcast to all connected clients
    broadcastState(state, rev);
}

void WebSocketServer::sendToClient(QWebSocket* client, const QJsonObject& message) {
    if (!client || client->state() != QAbstractSocket::ConnectedState) return;

    const QJsonDocument doc(message);
    client->sendTextMessage(doc.toJson(QJsonDocument::Compact));
}

void WebSocketServer::broadcastState(const QJsonObject& state, qint64 rev) {
    if (m_clients.isEmpty()) return;

    QJsonObject msg;
    msg["type"] = "state";
    msg["rev"] = rev;
    msg["data"] = state;

    for (auto it = m_clients.begin(); it != m_clients.end(); ++it) {
        QWebSocket* client = it.key();
        const QString clientId = it.value();

        // Only send if client needs update (simple approach: always send for now)
        sendToClient(client, msg);
        m_clientRevs[clientId] = rev;
    }
}

void WebSocketServer::handleCommand(QWebSocket* client, const QJsonObject& msg) {
    const QString command = msg["command"].toString();
    const QJsonObject payload = msg["payload"].toObject();
    const QString requestId = msg["requestId"].toString();

    if (command.isEmpty()) {
        QJsonObject errorResp;
        errorResp["type"] = "error";
        errorResp["requestId"] = requestId;
        errorResp["error"] = "Missing command";
        sendToClient(client, errorResp);
        return;
    }

    const QJsonObject result = m_stateEngine->executeCommand(command, payload);

    QJsonObject resp;
    resp["type"] = "command_result";
    resp["requestId"] = requestId;
    resp["command"] = command;
    resp["success"] = result.value("success").toBool(true);
    if (result.contains("error")) resp["error"] = result["error"];
    if (result.contains("data")) resp["data"] = result["data"];

    sendToClient(client, resp);
}

void WebSocketServer::handleSubscribe(QWebSocket* client, const QJsonObject& msg) {
    const QString path = msg["path"].toString();
    const QString requestId = msg["requestId"].toString();

    // For now, just acknowledge - full subscription handling would require
    // tracking per-client subscriptions
    QJsonObject resp;
    resp["type"] = "subscribe_ack";
    resp["requestId"] = requestId;
    resp["path"] = path;
    sendToClient(client, resp);
}

void WebSocketServer::handleResync(QWebSocket* client, const QJsonObject& msg) {
    const qint64 clientRev = msg["rev"].toVariant().toLongLong();
    const QString requestId = msg["requestId"].toString();

    const QJsonObject resyncData = m_stateEngine->resync(clientRev);

    QJsonObject resp;
    resp["type"] = "resync";
    resp["requestId"] = requestId;
    resp["patches"] = resyncData["patches"];
    resp["rev"] = resyncData["rev"];
    resp["state"] = resyncData["state"];

    sendToClient(client, resp);

    // Update client's known rev
    const QString clientId = m_clients.value(client);
    m_clientRevs[clientId] = resyncData["rev"].toVariant().toLongLong();
}

void WebSocketServer::handlePing(QWebSocket* client, const QJsonObject& msg) {
    QJsonObject resp;
    resp["type"] = "pong";
    resp["requestId"] = msg["requestId"].toString();
    resp["timestamp"] = QDateTime::currentMSecsSinceEpoch();
    sendToClient(client, resp);
}