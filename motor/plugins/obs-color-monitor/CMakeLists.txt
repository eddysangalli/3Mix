cmake_minimum_required(VERSION 3.28...3.30)

# Color Monitor by Norihiro Kamae (GPL-2.0), https://github.com/norihiro/obs-color-monitor, version 0.9.6,
# built as part of FreeMix instead of being shipped as a separate binary. It provides the vectorscope, waveform,
# histogram, zebra, false colour and focus peaking sources; FreeMix shows them from the Preview title bar
# (frontend/widgets/FreeMixScope.cpp).
# No changes to the upstream code. Only this build file and plugin-macros.generated.h (which upstream generates
# from src/plugin-macros.h.in) were written for the in-tree build.

find_package(Qt6 REQUIRED Core Widgets Gui)

add_library(obs-color-monitor MODULE)
add_library(OBS::obs-color-monitor ALIAS obs-color-monitor)

target_sources(
  obs-color-monitor
  PRIVATE
    plugin-macros.generated.h
    src/plugin-main.c
    src/vectorscope.c
    src/waveform.c
    src/histogram.c
    src/zebra.c
    src/focuspeaking.c
    src/roi.c
    src/common.c
    src/util.c
    src/util-cpp.cc
    src/obs-convenience.c
    src/scope-dock.cpp
    src/scope-dock-new-dialog.cpp
    src/scope-widget.cpp
    src/scope-widget-properties.cpp
    src/SurfaceEventFilter.cpp
    src/ScopeWidgetInteractiveEventFilter.cpp
    src-obsstudio/properties-view.cpp
    src-obsstudio/vertical-scroll-area.cpp
    src-obsstudio/combobox-ignorewheel.cpp
    src-obsstudio/spinbox-ignorewheel.cpp
    src-obsstudio/double-slider.cpp
    src-obsstudio/slider-ignorewheel.cpp
    src-obsstudio/qt-wrappers.cpp
)

target_include_directories(obs-color-monitor PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}" src-obsstudio)

target_link_libraries(
  obs-color-monitor
  PRIVATE OBS::libobs OBS::frontend-api OBS::w32-pthreads Qt::Core Qt::Widgets Qt::Gui
)

# Third-party code: its warnings must not stop the build.
target_compile_options(obs-color-monitor PRIVATE $<$<C_COMPILER_ID:MSVC>:/WX->)

set_target_properties_obs(
  obs-color-monitor
  PROPERTIES FOLDER plugins/freemix
             PREFIX ""
             AUTOMOC ON
             AUTOUIC ON
             AUTORCC ON
)
