cmake_minimum_required(VERSION 3.16)
project(FreeMix VERSION 1.0.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Habilita compilação de MOC e recursos Qt automaticamente
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

if(WIN32)
    add_compile_definitions(WIN32 _WINDOWS UNICODE _UNICODE NOMINMAX)
endif()

# Localização de pacotes Qt6
find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets Network WebSockets)

# Localização do SDK libobs
# Pode ser fornecido via -DOBS_DIR="caminho" ou variáveis de ambiente
if(NOT OBS_INCLUDE_DIR)
    set(OBS_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../obs-vmix/include" CACHE PATH "Caminho dos headers libobs")
    if(NOT EXISTS "${OBS_INCLUDE_DIR}")
        set(OBS_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../studiopro-src/switcher-studio/libcre8" CACHE PATH "Caminho alternativo libobs")
    endif()
endif()

if(NOT OBS_LIB_DIR)
    set(OBS_LIB_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../obs-vmix/bin/64bit" CACHE PATH "Caminho das bibliotecas libobs")
endif()

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${OBS_INCLUDE_DIR}
)

link_directories(
    ${OBS_LIB_DIR}
)

# Recursos Win32 (Ícone, Nome do Programa, Versão)
set(FREEMIX_RESOURCES "")
if(WIN32)
    set(FREEMIX_RESOURCES "src/resources/freemix.rc")
endif()

# Fontes do Aplicativo FreeMix
set(FREEMIX_SOURCES
    src/app/main.cpp
    src/app/FreeMixApp.cpp
    src/app/FreeMixApp.h
    src/ui/FreeMixMainWindow.cpp
    src/ui/FreeMixMainWindow.h
    src/ui/VideoDisplayWidget.cpp
    src/ui/VideoDisplayWidget.h
    src/services/StateEngine.cpp
    src/services/StateEngine.h
    src/services/OutputManager.cpp
    src/services/OutputManager.h
    src/services/AudioBusManager.cpp
    src/services/AudioBusManager.h
    src/services/CanvasMixManager.cpp
    src/services/CanvasMixManager.h
    src/services/MultiviewManager.cpp
    src/services/MultiviewManager.h
    src/services/ProjectManager.cpp
    src/services/ProjectManager.h
    src/services/InputManager.cpp
    src/services/InputManager.h
    src/services/NetworkBondingManager.cpp
    src/services/NetworkBondingManager.h
    src/services/GraphicsManager.cpp
    src/services/GraphicsManager.h
    src/ui/dialogs/AudioMatrixDialog.cpp
    src/ui/dialogs/AudioMatrixDialog.h
    src/ui/dialogs/OutputsDialog.cpp
    src/ui/dialogs/OutputsDialog.h
    src/ui/dialogs/GeneralSettingsDialog.cpp
    src/ui/dialogs/GeneralSettingsDialog.h
    src/ui/dialogs/InputPropertiesDialog.cpp
    src/ui/dialogs/InputPropertiesDialog.h
    src/ui/dialogs/AddInputDialog.cpp
    src/ui/dialogs/AddInputDialog.h
    src/ui/dialogs/GraphicsStudioDialog.cpp
    src/ui/dialogs/GraphicsStudioDialog.h
    ${FREEMIX_RESOURCES}
)

# Alvo Executável Principal: FreeMix.exe
add_executable(FreeMix WIN32 ${FREEMIX_SOURCES})

target_link_libraries(FreeMix PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Network
    Qt6::WebSockets
    obs
)

set_target_properties(FreeMix PROPERTIES
    OUTPUT_NAME "FreeMix"
    WIN32_EXECUTABLE TRUE
)

# Copia o executável compilado e arquivos auxiliares para o diretório de distribuição
install(TARGETS FreeMix RUNTIME DESTINATION bin)
