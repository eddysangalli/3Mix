#include "FreeMixPreferences.hpp"
#include "OBSBasic.hpp"
#include "../../plugins/obs-websocket/lib/obs-websocket-api.h"
#include <obs-frontend-api.h>
#include <obs.hpp>
#include <util/config-file.h>
#include <QMetaObject>
#include <QFileDialog>
#include <QPointer>
#include <QUuid>
#include <QMenu>
#include <QAction>
#include <atomic>
#include <cmath>
#include <cstdlib>
#include <set>
#include <string>
#include <vector>
#include <exception>
#include <cstdio>

namespace {
enum Target { PROFILE, USER, APP };
struct Field { const char *category, *name, *label; Target target; const char *section, *key, *type, *fallback, *choices; double min=0,max=0; };
const Field fields[] = {
 {"general","warnStartStream","Confirmar antes de transmitir",USER,"BasicWindow","WarnBeforeStartingStream","bool","true",""},
 {"general","warnStopStream","Confirmar antes de parar transmissão",USER,"BasicWindow","WarnBeforeStoppingStream","bool","true",""},
 {"general","warnStopRecord","Confirmar antes de parar gravação",USER,"BasicWindow","WarnBeforeStoppingRecord","bool","true",""},
 {"general","confirmExit","Confirmar ao fechar",USER,"General","ConfirmOnExit","bool","true",""},
 {"general","doubleClickTransition","Transição com duplo clique",USER,"BasicWindow","TransitionOnDoubleClick","bool","false",""},
 {"general","snapping","Encaixe automático de fontes",USER,"BasicWindow","SnappingEnabled","bool","true",""},
 {"general","snapDistance","Distância de encaixe (px)",USER,"BasicWindow","SnapDistance","number","10","",0,100},
 {"general","safeAreas","Guias de área segura",USER,"BasicWindow","ShowSafeAreas","bool","false",""},
 {"general","projectorOnTop","Projetores sempre à frente",USER,"BasicWindow","ProjectorAlwaysOnTop","bool","false",""},
 {"general","hideProjectorCursor","Ocultar cursor no projetor",USER,"BasicWindow","HideProjectorCursor","bool","true",""},
 {"appearance","fontScale","Escala das fontes do motor",USER,"Appearance","FontScale","integer","10","",-5,50},
 {"appearance","density","Densidade dos controles",USER,"Appearance","Density","integer","1","",0,2},
 {"audio","sampleRate","Taxa de amostragem (Hz)",PROFILE,"Audio","SampleRate","string","48000","44100|48000"},
 {"audio","channels","Canais da produção",PROFILE,"Audio","ChannelSetup","string","Stereo","Mono|Stereo|2.1|4.0|4.1|5.1|7.1"},
 {"audio","meterDecay","Decaimento dos medidores",PROFILE,"Audio","MeterDecayRate","number","23.53","",1,100},
 {"audio","peakMeter","Medidor de pico",PROFILE,"Audio","PeakMeterType","integer","0","",0,1},
 {"audio","lowLatency","Buffer de áudio com baixa latência",USER,"Audio","LowLatencyAudioBuffering","bool","false",""},
 {"advanced","priority","Prioridade do processo",APP,"General","ProcessPriority","string","Normal","Normal|AboveNormal|High|BelowNormal|Idle"},
 {"advanced","browserAcceleration","Aceleração de hardware do navegador",APP,"General","BrowserHWAccel","bool","true",""},
 {"advanced","disableDucking","Impedir redução automática do áudio no Windows",APP,"Audio","DisableAudioDucking","bool","true",""},
 {"advanced","hotkeyFocus","Atalhos conforme foco",USER,"General","HotkeyFocusType","string","NeverDisableHotkeys","NeverDisableHotkeys|DisableHotkeysInFocus|DisableHotkeysOutOfFocus"},
 {"advanced","colorFormat","Formato de cor",PROFILE,"Video","ColorFormat","string","NV12","NV12|I420|I444|P010|I010|P216|P416|BGRA"},
 {"advanced","colorSpace","Espaço de cor",PROFILE,"Video","ColorSpace","string","709","601|709|sRGB|2100PQ|2100HLG"},
 {"advanced","colorRange","Faixa de cor",PROFILE,"Video","ColorRange","string","Partial","Partial|Full"},
 {"outputAdvanced","mode","Modo de saída",PROFILE,"Output","Mode","string","Simple","Simple|Advanced"},
 {"outputAdvanced","streamVideoEncoder","Encoder de vídeo da transmissão avançada",PROFILE,"AdvOut","Encoder","string","obs_x264","@video"},
 {"outputAdvanced","streamAudioEncoder","Encoder de áudio da transmissão avançada",PROFILE,"AdvOut","AudioEncoder","string","ffmpeg_aac","@audio"},
 {"outputAdvanced","recordVideoEncoder","Encoder de vídeo da gravação avançada",PROFILE,"AdvOut","RecEncoder","string","obs_x264","@recordVideo"},
 {"outputAdvanced","recordAudioEncoder","Encoder de áudio da gravação avançada",PROFILE,"AdvOut","RecAudioEncoder","string","ffmpeg_aac","@audio"},
 {"outputAdvanced","streamTrack","Trilha de áudio da transmissão",PROFILE,"AdvOut","TrackIndex","integer","1","",1,6},
 {"outputAdvanced","recordTracks","Trilhas da gravação (máscara 1 a 63)",PROFILE,"AdvOut","RecTracks","integer","1","",1,63},
 {"outputAdvanced","recordFormat","Formato avançado de gravação",PROFILE,"AdvOut","RecFormat2","string","mkv","flv|mkv|mp4|mov|hybrid_mp4|hybrid_mov|fragmented_mp4|fragmented_mov|mpegts|hls"},
 {"outputAdvanced","rescaleRecord","Reescalar gravação avançada",PROFILE,"AdvOut","RecRescale","bool","false",""},
 {"outputAdvanced","replaySeconds","Replay buffer (segundos)",PROFILE,"AdvOut","RecRBTime","integer","20","",1,3600},
 {"outputAdvanced","replayMegabytes","Replay buffer (MB)",PROFILE,"AdvOut","RecRBSize","integer","512","",1,32768},
 {"general","snapScreen","Encaixar nas bordas do quadro",USER,"BasicWindow","ScreenSnapping","bool","true",""},
 {"general","snapSources","Encaixar nas outras fontes",USER,"BasicWindow","SourceSnapping","bool","true",""},
 {"general","snapCenters","Encaixar no centro",USER,"BasicWindow","CenterSnapping","bool","false",""},
 {"general","spacingHelpers","Mostrar distâncias entre fontes",USER,"BasicWindow","SpacingHelpersEnabled","bool","true",""},
 {"general","automaticSearch","Buscar arquivos da coleção automaticamente",USER,"General","AutomaticCollectionSearch","bool","false",""},
 {"general","recordWhenStreaming","Gravar ao iniciar transmissão",USER,"BasicWindow","RecordWhenStreaming","bool","false",""},
 {"general","keepRecording","Continuar gravando ao parar transmissão",USER,"BasicWindow","KeepRecordingWhenStreamStops","bool","false",""},
 {"general","replayWhileStreaming","Replay buffer ao transmitir",USER,"BasicWindow","ReplayBufferWhileStreaming","bool","false",""},
 {"general","keepReplay","Continuar buffer ao parar transmissão",USER,"BasicWindow","KeepReplayBufferStreamStops","bool","false",""},
 {"appearance","trayEnabled","Ícone na bandeja do Windows",USER,"BasicWindow","SysTrayEnabled","bool","true",""},
 {"appearance","trayAtStart","Iniciar minimizado na bandeja",USER,"BasicWindow","SysTrayWhenStarted","bool","false",""},
 {"appearance","minimizeTray","Minimizar para bandeja",USER,"BasicWindow","SysTrayMinimizeToTray","bool","false",""},
 {"appearance","studioPortrait","Organização vertical do modo estúdio",USER,"BasicWindow","StudioPortraitLayout","bool","false",""},
 {"appearance","studioLabels","Nomes de Preview e Programa",USER,"BasicWindow","StudioModeLabels","bool","true",""},
 {"projectors","saveProjectors","Restaurar projetores ao abrir",USER,"BasicWindow","SaveProjectors","bool","false",""},
 {"projectors","closeProjectors","Fechar projetor existente ao abrir outro",USER,"BasicWindow","CloseExistingProjectors","bool","false",""},
 {"projectors","multiviewSwitch","Trocar entrada com mouse no multiview",USER,"BasicWindow","MultiviewMouseSwitch","bool","true",""},
 {"projectors","multiviewNames","Nomes no multiview",USER,"BasicWindow","MultiviewDrawNames","bool","true",""},
 {"projectors","multiviewAreas","Áreas seguras no multiview",USER,"BasicWindow","MultiviewDrawAreas","bool","true",""},
 {"projectors","multiviewLayout","Layout do multiview",USER,"BasicWindow","MultiviewLayout","integer","0","",0,7},
 {"advanced","sdrWhiteLevel","Branco SDR (nits)",PROFILE,"Video","SdrWhiteLevel","integer","300","",80,480},
 {"advanced","hdrPeakLevel","Pico nominal HDR (nits)",PROFILE,"Video","HdrNominalPeakLevel","integer","1000","",400,10000},
 {"performance","scaleType","Filtro de redução de imagem",PROFILE,"Video","ScaleType","string","bicubic","bilinear|bicubic|lanczos|area"},
 {"performance","newSocketLoop","Loop de socket otimizado (Windows)",PROFILE,"Output","NewSocketLoopEnable","bool","false",""},
 {"performance","networkLowLatency","Baixa latência de rede",PROFILE,"Output","LowLatencyEnable","bool","false",""},
 {"networkOutput","dynamicBitrate","Bitrate dinâmico em congestionamento",PROFILE,"Output","DynamicBitrate","bool","false",""},
 {"networkOutput","reconnectEnabled","Reconectar automaticamente",PROFILE,"Output","Reconnect","bool","true",""},
 {"networkOutput","reconnectDelay","Espera entre reconexões (s)",PROFILE,"Output","RetryDelay","integer","2","",1,120},
 {"networkOutput","reconnectRetries","Tentativas de reconexão",PROFILE,"Output","MaxRetries","integer","25","",0,10000},
 {"networkOutput","streamDelayEnabled","Atraso de transmissão",PROFILE,"Output","DelayEnable","bool","false",""},
 {"networkOutput","streamDelaySeconds","Atraso (s)",PROFILE,"Output","DelaySec","integer","20","",0,1800},
 {"networkOutput","preserveDelay","Preservar atraso ao reconectar",PROFILE,"Output","DelayPreserve","bool","true",""},
 {"networkOutput","ipFamily","Família de endereços",PROFILE,"Output","IPFamily","string","IPv4+IPv6","IPv4+IPv6|IPv4|IPv6"},
 {"files","filenamePattern","Padrão do nome do arquivo",PROFILE,"Output","FilenameFormatting","text","%CCYY-%MM-%DD %hh-%mm-%ss",""},
 {"files","overwriteFiles","Sobrescrever arquivo existente",PROFILE,"Output","OverwriteIfExists","bool","false",""},
 {"files","autoRemux","Remux automático para MP4",PROFILE,"Video","AutoRemux","bool","false",""},
 {"files","replayPrefix","Prefixo dos clipes de buffer",PROFILE,"SimpleOutput","RecRBPrefix","text","Replay",""},
 {"files","replaySuffix","Sufixo dos clipes de buffer",PROFILE,"SimpleOutput","RecRBSuffix","text","",""},
 {"outputAdvanced","recordPath","Pasta da gravação avançada",PROFILE,"AdvOut","RecFilePath","text","",""},
};

void FreeMixPreferencesInit()
{
 // Preferences are registered with OBS via the fields array above.
 // Actual registration happens in OBSBasic::InitializePreferences().
}