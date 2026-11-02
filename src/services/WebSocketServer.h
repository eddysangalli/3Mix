/**
 * FreeMix WebSocket Server
 * Expõe o StateEngine via WebSocket para clientes remotos (painel remoto, Companion, etc.)
 */

#pragma once

#include <QObject>
#include <QWebSocketServer>
#include <QWebSocket>
#include <QMap>
#include <QJsonObject>
#include <QJsonDocument>
#include <QTimer>

namespace freemix {
    class StateEngine;
}

class WebSocketServer : public QObject {
    Q_OBJECT

public:
    explicit WebSocketServer(freemix::StateEngine* stateEngine, QObject* parent = nullptr);
    ~WebSocketServer() override;

    bool start(quint16 port = 8080);
    void stop();

    int connectedClients() const { return m_clients.size(); }

signals:
    void clientConnected(const QString& clientId);
    void clientDisconnected(const QString& clientId);
    void messageReceived(const QString& clientId, const QJsonObject& message);
    void errorOccurred(const QString& message);

private slots:
    void onNewConnection();
    void onClientDisconnected();
    void onTextMessageReceived(const QString& message);
    void onBinaryMessageReceived(const QByteArray& message);
    void onStateChanged(const QJsonObject& state, qint64 rev);

private:
    void sendToClient(QWebSocket* client, const QJsonObject& message);
    void broadcastState(const QJsonObject& state, qint64 rev);
    void handleCommand(QWebSocket* client, const QJsonObject& msg);
    void handleSubscribe(QWebSocket* client, const QJsonObject& msg);
    void handleResync(QWebSocket* client, const QJsonObject& msg);
    void handlePing(QWebSocket* client, const QJsonObject& msg);

    freemix::StateEngine* m_stateEngine = nullptr;
    QWebSocketServer* m_server = nullptr;
    QMap<QWebSocket*, QString> m_clients; // socket -> clientId
    QMap<QString, qint64> m_clientRevs;   // clientId -> last known rev
    QTimer* m_broadcastTimer = nullptr;
};