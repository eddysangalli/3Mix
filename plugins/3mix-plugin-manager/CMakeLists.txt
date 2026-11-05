cmake_minimum_required(VERSION 3.28...3.30)

# 3Mix Plugin Manager — Native OBS plugin for plugin lifecycle management
# Provides: plugin installation, safe mode, vendor request API

find_package(Qt6 REQUIRED Core)
find_package(nlohmann_json REQUIRED)

add_library(3mix-plugin-manager MODULE)
add_library(OBS::3mix-plugin-manager ALIAS 3mix-plugin-manager)

target_sources(
  3mix-plugin-manager
  PRIVATE
    plugin-manager.cpp
    plugin-manager.hpp
)

target_link_libraries(3mix-plugin-manager PRIVATE OBS::libobs OBS::frontend-api Qt::Core nlohmann_json::nlohmann_json)

set_target_properties_obs(
  3mix-plugin-manager
  PROPERTIES FOLDER plugins/freemix
             PREFIX ""
             AUTOMOC ON
             AUTOUIC ON
             AUTORCC ON
)