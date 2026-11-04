# Relatório de Arquitetura — Migração para OBS Studio 33.0.1 e CEF Modernizado

Data: 04/11/2026  
Status: **PLANO TÉCNICO E MAPA DE PATCHES CONCLUÍDO**  
Versão Atual do Motor: **3Mix Engine 32.2.2 Pro** (Fork OBS Studio)  
Versão Alvo de Homologação: **3Mix Engine 33.0.1 Pro**  
Chromium/CEF Alvo: **CEF 150 (Chromium 150 - Base Homologável OBS 33) / Meta CEF 156 (Chromium 156, Branch 8078)**

---

## 1. Inventário de Patches e Customizações do 3Mix sobre o OBS

O fork do 3Mix (`3mix-engine`) agrega customizações broadcast de alta densidade técnica que devem ser preservadas integralmente na transição para o OBS 33.0.1:

| Patch / Commit | Componente Afetado | Funcionalidade Broadcast 3Mix |
|---|---|---|
| `ca9b44b` | `libobs/`, `frontend/` | Arquitetura Multi-M/E nativa (M/E 1 a 4 independentes com barramentos P/P) |
| `45a1287` | `frontend/widgets/` | Entradas de loopback inteligente: "PGM M/E N" como fonte de vídeo sem atraso |
| `3f35d62` | `plugins/decklink/` | Até 16 saídas físicas Blackmagic DeckLink independentes simultâneas |
| `f72408b` | `plugins/obs-vst/` | Filtro VST3 x64 nativo com SDK oficial Steinberg |
| `cbb6609` | `frontend/api/` | Abertura e telemetria de GUI de plug-ins VST2/VST3 sob demanda do painel web |
| `0009` a `0024` | `plugins/obs-ffmpeg/` | SRT 4:4:4 nativo, Fill/Key sincronizado, SRT HDR (Rec.2100 PQ/HLG) |
| `PluginManager` | `frontend/plugin-manager/` | Isolamento em `3mix-plugins/%module%`, verificação PE x64 e Safe Mode defensivo |
| `103e16f` | `plugins/freed/` | Conector nativo de rastreamento de câmeras robóticas PTZ FreeD (UDP) |

---

## 2. Análise de Mudanças de ABI do libobs no OBS 33

### 2.1. Estrutura `obs_source_info`
No OBS 33.0.1, a estrutura central de registro de fontes e filtros recebe extensões para:
- Espaço de cores dinâmico (`video_get_color_space`).
- Metadados HDR estendidos (`video_get_mastering_display`).
- O 3Mix já possui conformidade estrutural com essas chamadas nos módulos de SRT HDR e Multi-M/E.

### 2.2. Renderizador Gráfico
- Direct3D 11 é preservado como pipeline gráfico padrão de baixa latência para broadcast.
- O renderizador foi mantido livre de chamadas diretas que dependam de shaders não retrocompatíveis.

---

## 3. Matriz CEF (Chromium Embedded Framework)

| Componente | Versão Baseline | Alvo Homologado | Meta Futura |
|---|---|---|---|
| **CEF / Chromium** | CEF 127 (Chromium 127) | **CEF 150 (Chromium 150)** | CEF 156 (Chromium 156, branch 8078) |
| **libcef.dll** | 127.145.7 (213 MB) | **150.x (Chromium 150)** | 156.x (Chromium 156) |
| **obs-browser** | 2.24.1 | **2.25.0 (OBS 33)** | 2.26.0+ |
| **Recursos Web** | CSS Grid / ES2023 | CSS Color 4, WebGPU, OffscreenCanvas | Web Codecs v2 |

### Diagnóstico e Fallback:
O endpoint `/api/diagnostico` expõe em tempo real o subsistema CEF ativo. O carregamento defensivo do `obs-browser` garante que, se uma versão experimental do CEF apresentar incompatibilidade de IPC de processo (`obs-browser-page.exe`), o runtime opera com a versão estável homologada.

---

## 4. Roteiro de Build para Alpha Testers

1. **Compilação do Motor OBS 33**:
   - Dependências: `obs-deps-2026-07-15-x64` + `obs-deps-qt6-2026-07-15-x64` + `srt.dll 1.5.7`.
   - Toolchain: MSVC v143 (VS 2022) ou v144 (VS 2026), CMake 3.28+.
   - Flags obrigatórias:
     ```bash
     cmake -S 3mix-engine -B build_33 -G "Visual Studio 18 2026" -A x64 \
       -DENABLE_VLC=OFF \
       -DENABLE_NEW_MPEGTS_OUTPUT=ON \
       -DENABLE_DECKLINK=ON
     ```
2. **Instalação e Validação de Plugins**:
   - Utilizar o **Gerenciador de Plugins OBS** da Mesa para importar qualquer plugin legado ou novo em sandbox isolada sem tocar na pasta global `obs-plugins/`.
