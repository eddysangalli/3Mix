cmake_minimum_required(VERSION 3.28...3.30)

add_library(3mix-vst3 MODULE)
add_library(OBS::3mix-vst3 ALIAS 3mix-vst3)

find_package(Qt6 REQUIRED Widgets)

set(VST3SDK "${CMAKE_SOURCE_DIR}/deps/vst3sdk")

set(
  VST3SDK_SOURCES
  ${VST3SDK}/base/source/baseiids.cpp
  ${VST3SDK}/base/source/fbuffer.cpp
  ${VST3SDK}/base/source/fdebug.cpp
  ${VST3SDK}/base/source/fobject.cpp
  ${VST3SDK}/base/source/fstreamer.cpp
  ${VST3SDK}/base/source/fstring.cpp
  ${VST3SDK}/base/source/updatehandler.cpp
  ${VST3SDK}/base/thread/source/flock.cpp
  ${VST3SDK}/pluginterfaces/base/conststringtable.cpp
  ${VST3SDK}/pluginterfaces/base/coreiids.cpp
  ${VST3SDK}/pluginterfaces/base/funknown.cpp
  ${VST3SDK}/pluginterfaces/base/ustring.cpp
  ${VST3SDK}/public.sdk/source/common/commonstringconvert.cpp
  ${VST3SDK}/public.sdk/source/common/memorystream.cpp
  ${VST3SDK}/public.sdk/source/common/threadchecker_win32.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/connectionproxy.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/eventlist.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/hostclasses.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/module.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/module_win32.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/parameterchanges.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/pluginterfacesupport.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/plugprovider.cpp
  ${VST3SDK}/public.sdk/source/vst/hosting/processdata.cpp
  ${VST3SDK}/public.sdk/source/vst/utility/stringconvert.cpp
  ${VST3SDK}/public.sdk/source/vst/vstinitiids.cpp
)

target_sources(3mix-vst3 PRIVATE vst3-filter.cpp ${VST3SDK_SOURCES})

# O SDK é de terceiros: compila com as regras dele, sem os avisos do projeto.
set_source_files_properties(${VST3SDK_SOURCES} PROPERTIES COMPILE_OPTIONS "/W0;/WX-" SKIP_PRECOMPILE_HEADERS ON)

target_include_directories(3mix-vst3 PRIVATE ${VST3SDK})
target_compile_definitions(3mix-vst3 PRIVATE RELEASE=1 UNICODE _UNICODE NOMINMAX)
target_compile_features(3mix-vst3 PRIVATE cxx_std_20)
target_compile_options(3mix-vst3 PRIVATE /WX- /wd4100 /wd4458 /wd4244 /wd4267)

target_link_libraries(3mix-vst3 PRIVATE OBS::libobs OBS::frontend-api Qt6::Widgets ole32 shell32)

set_target_properties(
  3mix-vst3
  PROPERTIES AUTOMOC OFF AUTOUIC OFF AUTORCC OFF PREFIX "" FOLDER plugins
)
set_target_properties_obs(3mix-vst3 PROPERTIES PREFIX "")
