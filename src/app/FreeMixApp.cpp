#include "FreeMixApp.h"
#include "ui/FreeMixMainWindow.h"
#include "services/OutputManager.h"
#include "services/AudioBusManager.h"
#include "services/CanvasMixManager.h"
#include "services/MultiviewManager.h"
#include "services/ProjectManager.h"
#include "services/InputManager.h"
#include "services/NetworkBondingManager.h"
#include "services/GraphicsManager.h"
#include "services/StateEngine.h"

#include <obs.h>
#include <QDir>
#include <QStandardPaths>
#include <QIcon>
#include <QStyleFactory>
#include <QDebug>

FreeMixApp::FreeMixApp(int &argc, char **argv)
    : QApplication(argc, argv)
{
    setApplicationName("FreeMix Studio");
    setApplicationVersion("1.0.0");
    setOrganizationName("FreeMix Project");
    setOrganizationDomain("freemix.studio");

    setWindowIcon(QIcon(":/freemix.ico"));

    setupPaths();
    applyApplicationTheme();
}

FreeMixApp::~FreeMixApp()
{
    shutdownEngine();
}

void FreeMixApp::setupPaths()
{
    m_appDir = applicationDirPath();
    
    // Suporte a modo portátil e pasta local do usuário
    QString portableConfig = m_appDir + "/config/freemix";
    if (QDir(portableConfig).exists() || QDir(m_appDir + "/config").exists()) {
        m_configPath = portableConfig;
    } else {
        m_configPath = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + "/FreeMix";
    }

    QDir().mkpath(m_configPath);
    QDir().mkpath(m_configPath + "/logs");
    QDir().mkpath(m_configPath + "/projects");
}

void FreeMixApp::applyApplicationTheme()
{
    setStyle(QStyleFactory::create("Fusion"));

    // Paleta Dark Broadcast profissional
    setStyleSheet(R"(
        QWidget {
            background-color: #121820;
            color: #dce3ed;
            font-family: 'Segoe UI', -apple-system, sans-serif;
            font-size: 12px;
        }
        QMainWindow {
            background-color: #0b0e14;
        }
        QMenuBar {
            background-color: #0f141c;
            border-bottom: 1px solid #1c2633;
        }
        QMenuBar::item:selected {
            background-color: #1e293b;
            color: #ffffff;
        }
        QMenu {
            background-color: #151d27;
            border: 1px solid #28384a;
        }
        QMenu::item:selected {
            background-color: #0078d4;
            color: #ffffff;
        }
        QStatusBar {
            background-color: #0d1219;
            border-top: 1px solid #1c2633;
            color: #8fa0b5;
        }
    )");
}

bool FreeMixApp::initializeEngine()
{
    if (m_engineInitialized) return true;

    // 1. Inicializa o núcleo da libobs
    std::string locale = "pt-BR";
    std::string moduleConfigPath = (m_configPath + "/modules").toStdString();
    
    if (!obs_startup(locale.c_str(), moduleConfigPath.c_str(), nullptr)) {
        qCritical() << "[FreeMix] Falha critica ao inicializar o motor libobs!";
        return false;
    }

    // 2. Inicializa subsistemas de áudio e vídeo
    if (!initializeAudio(48000)) {
        qWarning() << "[FreeMix] Aviso: Falha ao inicializar subsistema de áudio.";
    }

    if (!initializeVideo(1920, 1080, 60, 1)) {
        qCritical() << "[FreeMix] Falha ao inicializar subsistema de vídeo Direct3D/OpenGL!";
        obs_shutdown();
        return false;
    }

    // 3. Carrega os módulos de captura e encoding
    obs_load_all_modules();
    obs_post_load_modules();

    // 4. Instancia a camada de serviços internos do FreeMix
    m_outputManager = std::make_unique<freemix::OutputManager>();
    m_outputManager->initialize();

    m_audioBusManager = std::make_unique<freemix::AudioBusManager>();
    m_audioBusManager->initialize();

    m_canvasMixManager = std::make_unique<freemix::CanvasMixManager>();
    m_canvasMixManager->initialize();

    m_multiviewManager = std::make_unique<freemix::MultiviewManager>();
    m_multiviewManager->initialize();

    m_projectManager = std::make_unique<freemix::ProjectManager>();

    m_inputManager = std::make_unique<freemix::InputManager>();
    m_inputManager->initialize();

    m_bondingManager = std::make_unique<freemix::NetworkBondingManager>();
    m_bondingManager->initialize();

    m_graphicsManager = std::make_unique<freemix::GraphicsManager>();
    m_graphicsManager->initialize(m_appDir + "/assets/graphics");

    // State Engine - central state management
    m_stateEngine = std::make_unique<freemix::StateEngine>();

    m_engineInitialized = true;
    qInfo() << "[FreeMix] Motor libobs e subsistemas inicializados com sucesso!";
    return true;
}

bool FreeMixApp::initializeVideo(uint32_t width, uint32_t height, uint32_t fpsNum, uint32_t fpsDen)
{
    struct obs_video_info ovi = {};
    ovi.graphics_module = "libobs-d3d11";
    ovi.fps_num = fpsNum;
    ovi.fps_den = fpsDen;
    ovi.base_width = width;
    ovi.base_height = height;
    ovi.output_width = width;
    ovi.output_height = height;
    ovi.output_format = VIDEO_FORMAT_NV12;
    ovi.colorspace = VIDEO_CS_709;
    ovi.range = VIDEO_RANGE_PARTIAL;
    ovi.adapter = 0;
    ovi.gpu_conversion = true;
    ovi.scale_type = OBS_SCALE_BICUBIC;

    int res = obs_reset_video(&ovi);
    return (res == OBS_VIDEO_SUCCESS);
}

bool FreeMixApp::initializeAudio(uint32_t sampleRate)
{
    struct obs_audio_info oai = {};
    oai.samples_per_sec = sampleRate;
    oai.speakers = SPEAKERS_STEREO;

    return obs_reset_audio(&oai);
}

void FreeMixApp::shutdownEngine()
{
    if (!m_engineInitialized) return;

    if (m_outputManager) m_outputManager->shutdown();
    if (m_audioBusManager) m_audioBusManager->shutdown();
    if (m_canvasMixManager) m_canvasMixManager->shutdown();
    if (m_multiviewManager) m_multiviewManager->shutdown();
    if (m_inputManager) m_inputManager->shutdown();
    if (m_bondingManager) m_bondingManager->shutdown();

    m_outputManager.reset();
    m_audioBusManager.reset();
    m_canvasMixManager.reset();
    m_multiviewManager.reset();
    m_inputManager.reset();
    m_projectManager.reset();
    m_bondingManager.reset();
    m_graphicsManager.reset();
    m_stateEngine.reset();

    obs_shutdown();
    m_engineInitialized = false;
    qInfo() << "[FreeMix] Motor libobs finalizado com segurança.";
}
