cmake_minimum_required(VERSION 3.28...3.30)

# Downstream Keyer by Exeldro (GPL-2.0), https://github.com/exeldro/obs-downstream-keyer, version 0.4.4,
# built as part of FreeMix instead of being shipped as a separate binary.
# FreeMix changes to the upstream code:
#   - DownstreamKeyer::hideAfter starts at zero (downstream-keyer.hpp);
#   - new request "dsk_set_hide_after" (downstream-keyer-dock.cpp).

find_package(Qt6 REQUIRED Core Widgets)

add_library(downstream-keyer MODULE)
add_library(OBS::downstream-keyer ALIAS downstream-keyer)

target_sources(
  downstream-keyer
  PRIVATE
    downstream-keyer-dock.cpp
    downstream-keyer-dock.hpp
    downstream-keyer.cpp
    downstream-keyer.hpp
    name-dialog.cpp
    name-dialog.hpp
    obs-websocket-api.h
    output-source.c
    version.h
)

target_link_libraries(downstream-keyer PRIVATE OBS::libobs OBS::frontend-api Qt::Core Qt::Widgets)

# Third-party code: its warnings must not stop the build.
target_compile_options(downstream-keyer PRIVATE $<$<C_COMPILER_ID:MSVC>:/WX->)

set_target_properties_obs(
  downstream-keyer
  PROPERTIES FOLDER plugins/freemix
             PREFIX ""
             AUTOMOC ON
             AUTOUIC ON
             AUTORCC ON
)
