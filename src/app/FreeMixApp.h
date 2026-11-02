#pragma once

#include <QApplication>
#include <QString>
#include <memory>

class FreeMixMainWindow;
namespace freemix {
    class OutputManager;
    class AudioBusManager;
    class CanvasMixManager;
    class MultiviewManager;
    class ProjectManager;
    class InputManager;
    class NetworkBondingManager;
    class GraphicsManager;
    class StateEngine;
}

/**
 * @brief FreeMixApp gerencia o ciclo de vida da aplicação nativa FreeMix e do motor libobs.
 */
class FreeMixApp : public QApplication {
    Q_OBJECT

public:
    FreeMixApp(int &argc, char **argv);
    ~FreeMixApp() override;

    bool initializeEngine();
    void shutdownEngine();

    // Acesso aos serviços internos do FreeMix
    freemix::OutputManager* outputManager() const { return m_outputManager.get(); }
    freemix::AudioBusManager* audioBusManager() const { return m_audioBusManager.get(); }
    freemix::CanvasMixManager* canvasMixManager() const { return m_canvasMixManager.get(); }
    freemix::MultiviewManager* multiviewManager() const { return m_multiviewManager.get(); }
    freemix::ProjectManager* projectManager() const { return m_projectManager.get(); }
    freemix::InputManager* inputManager() const { return m_inputManager.get(); }
    freemix::NetworkBondingManager* bondingManager() const { return m_bondingManager.get(); }
    freemix::GraphicsManager* graphicsManager() const { return m_graphicsManager.get(); }
    freemix::StateEngine* stateEngine() const { return m_stateEngine.get(); }

    QString configPath() const { return m_configPath; }
    static FreeMixApp* instance() { return qobject_cast<FreeMixApp*>(QApplication::instance()); }

private:
    void setupPaths();
    bool initializeVideo(uint32_t width, uint32_t height, uint32_t fpsNum, uint32_t fpsDen);
    bool initializeAudio(uint32_t sampleRate);
    void applyApplicationTheme();

    QString m_appDir;
    QString m_configPath;

    std::unique_ptr<freemix::OutputManager> m_outputManager;
    std::unique_ptr<freemix::AudioBusManager> m_audioBusManager;
    std::unique_ptr<freemix::CanvasMixManager> m_canvasMixManager;
    std::unique_ptr<freemix::MultiviewManager> m_multiviewManager;
    std::unique_ptr<freemix::ProjectManager> m_projectManager;
    std::unique_ptr<freemix::InputManager> m_inputManager;
    std::unique_ptr<freemix::NetworkBondingManager> m_bondingManager;
    std::unique_ptr<freemix::GraphicsManager> m_graphicsManager;
    std::unique_ptr<freemix::StateEngine> m_stateEngine;

    FreeMixMainWindow* m_mainWindow = nullptr;
    bool m_engineInitialized = false;
};