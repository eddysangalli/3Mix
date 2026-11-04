# Matriz de Dependências, Componentes e Baseline do Motor Broadcast 3Mix

> **Data:** 04 de Novembro de 2026  
> **Escopo:** Auditoria física em processo e em disco dos componentes do 3Mix Pro  
> **Status:** Baseline Homologado / Pré-Migração OBS 33

---

## 1. Identificação Geral do Ambiente

- **Sistema Operacional:** Windows 10/11 x64 (Build 26300 64-bit)
- **Hardware Host:** Intel Core i7-13650HX (14 cores / 20 threads), 64 GB RAM, NVIDIA GeForce RTX GPU
- **Diretório Raiz do Runtime:** `D:\DRIVE\IA\antigravity\3Mix\3mix-runtime`
- **Diretório do Painel / Web API:** `D:\DRIVE\IA\antigravity\3Mix\3mix-panel`
- **Diretório do Motor C/C++ Fork:** `D:\DRIVE\IA\antigravity\3Mix\3mix-engine`
- **Executável Principal do Motor:** `3mix-runtime/bin/64bit/3Mix.exe`

---

## 2. Repositórios Git, Branches e PRs

| Repositório | Branch Ativa | Commit HEAD | Origem / Remoto | Situação de PRs |
| :--- | :--- | :--- | :--- | :--- |
| **3mix-engine** | `main` | `103e16f` | `https://github.com/obsproject/obs-studio.git` | Fork C/C++ nativo com modificações locais em `PluginManager.cpp/hpp` e `OBSBasic.cpp`. |
| **3mix-panel** | `feat/superprompt-evolucao-broadcast` | `6e76094` | `https://github.com/eddysangalli/3Mix.git` | **PR #9 mesclada com sucesso** (`Merge pull request #9`). PRs #1 e #8 anteriormente mescladas. |
| **3mix-desk** | `master` | `4c8ea91` | `https://github.com/eddysangalli/3mix-desk.git` | Estrutura de integração de controladora física. |

---

## 3. Matriz Completa de Componentes e Dependências

| Componente | Versão no Disco | Versão Efetiva em Processo | Localização Exata | Consumidores / Dependências | Risco de Migração | Plano de Teste / Rollback |
| :--- | :---: | :---: | :--- | :--- | :---: | :--- |
| **OBS Studio / libobs** | `32.2.2` | `32.2.2` | `bin/64bit/3Mix.exe`<br/>`bin/64bit/obs.dll` | Todo o compositor, cenas, fontes, mixers e plugins nativos. | **Alto** (Mudança de ABI de plugins e caminhos no OBS 33). | Build isolado; manter binários 32.2.2 em backup antes de substituir. |
| **Chromium / CEF** | `127.145.7`<br/>(Chr. 127) | `127.145.7` | `obs-plugins/64bit/libcef.dll`<br/>`obs-browser.dll` | Browser Sources, DSK 1–4, GC HTML5, SlideEngine, Painéis Web. | **Alto** (OBS 33 upstream usa CEF 150; CEF 156 requer compilação dedicada de obs-browser). | Validar CEF 150 como fallback estável garantido; testar CEF 156 em paralelo. |
| **FFmpeg Externo** | `8.1.1` (gyan.dev) | `8.1.1` | `ffmpeg.exe`<br/>(WinGet Links / PATH) | Replay Disco, transcodificação offline, geração de thumbnails, áudio de teste. | **Médio** (Descontinuação de opções legadas de NVENC e filtros). | Preservar executável 8.1.1 como fallback; validar flags CLI no 9.0.2. |
| **FFmpeg Integrado** | `n8.1.2`<br/>(avcodec-62) | `n8.1.2` | `bin/64bit/avcodec-62.dll`<br/>`bin/64bit/avformat-62.dll`<br/>`bin/64bit/avutil-60.dll` | Gravação local, streaming RTMP/SRT, Media Sources e Playout. | **Crítico** (Salto de ABI para FFmpeg 9 quebra `obs-ffmpeg.dll` compilado contra v8). | Manter DLLs v8 até recompilação de `obs-ffmpeg.dll` para v9. |
| **SRT Library** | `1.5.2` | `1.5.2` | `bin/64bit/srt.dll` | Recepção e transmissão SRT (Caller, Listener, Rendezvous), OBS outputs e FFmpeg. | **Crítico (Segurança)** (v1.5.2 vulnerável a CVE-2026-55869 e CVE-2026-55868). | **Upgrade imediato para 1.5.7** compatível; testar criptografia AES e reconexão. |
| **NDI Runtime** | `6.3.2` | `6.3.2` | `runtime/ndi-v6/Processing.NDI.Lib.x64.dll`<br/>`obs-plugins/64bit/distroav.dll` (6.2.1) | Entradas NDI, saídas NDI Program/Preview, retorno de estúdio. | **Baixo** (Runtime NDI v6.3.2 estável e homologado; preservar). | Preservar NDI 6.3.2 intacto conforme instrução do usuário. |
| **OMT Native** | `1.0.0.19` | `1.0.0.19` | `obs-plugins/64bit/libomt.dll`<br/>`obs-plugins/64bit/omtplugin.dll` | Transporte de vídeo OMT em baixa latência para o ecossistema 3Mix. | **Baixo a Médio** | Preservar integridade; testar recepção e gravação no 3Mix. |
| **OBS WebSocket** | `5.5.x` | `5.5.x` (Porta 4466) | `obs-plugins/64bit/obs-websocket.dll` | Comunicação bidirecional da Mesa 3Mix, SlideEngine, Telemetria e Macros. | **Médio** (Preservar protocolo v5 e senha de autenticação em `config.json`). | Testar suíte de comandos do WebSocket após cada inicialização. |

---

## 4. Inventário Detalhado dos Plugins Integrados

Foram auditados **74 binários PE x64** na pasta `obs-plugins/64bit/`:
- **46 Módulos Nativos / Plugins com `obs_module_load`**:
  - `advanced-scene-switcher.dll` (v1.36.1) — Automação de cenas, relógios e macros
  - `move-transition.dll` (v3.2.1) — Transições de movimento e Merge
  - `downstream-keyer.dll` — Barramentos DSK 1 a 4
  - `distroav.dll` (v6.2.1) — Integração NDI 6
  - `omtplugin.dll` (v1.0.0.19) — Transporte OMT
  - `obs-shaderfilter.dll` (v2.6.0) — Efeitos de cor e shaders customizados
  - `obs-advanced-masks.dll` (v1.5.4) — Máscaras e recortes alfa
  - `obs-asio.dll` (v3.2.1) — Áudio profissional multicanal ASIO
  - `audio-monitor.dll` (v0.10.1) — Monitoramento auxiliar de áudio (PFL / Solo)
  - `source-dock.dll` (v0.5.1) — Docks de monitoração de fontes
  - `source-record.dll` — Gravação ISO por fonte
  - `replay-source.dll` (v1.8.1) — Buffer de replay contínuo
  - `obs-browser.dll` (32.2.2) — Browser Source Chromium
  - `obs-ffmpeg.dll` (32.2.2) — Encoders e decoders de vídeo/áudio
  - `obs-localvocal.dll` (v0.6.2) — Legendas e transcrição por IA (Whisper)
  - `3mix-vst3.dll` — Processamento de áudio VST3
- **26 Bibliotecas Auxiliares (Não-plugins)**:
  - `libcef.dll`, `chrome_elf.dll`, `icudt76.dll`, `libEGL.dll`, `libGLESv2.dll` (CEF)
  - `onnxruntime.dll`, `ctranslate2.dll`, `whisper.dll`, `ggml*.dll` (Modelos de IA)
  - `libomt.dll`, `libvmx.dll` (OMT Runtime)

---

## 5. Diretrizes para a Transição de Pastas no OBS 33

O OBS 33 introduz uma separação estrita de arquitetura:
1. **Core / Módulos Nativos do Sistema**: permanecem em pastas do pacote base.
2. **Plugins de Terceiros e Gerenciados**:
   - Layout Portátil OBS 33: `plugins/<id>/<id>.dll` e `plugins/<id>/data/`.
   - Layout Isolado 3Mix: `3mix-plugins/<id>/<id>.dll` e `3mix-plugins/<id>/data/`.
   - **Regra:** O carregador nativo do fork 3Mix em `OBSBasic.cpp` já registra o caminho `3mix-plugins/%module%`, isolando os plugins gerenciados de interferências do OBS Studio convencional instalado na máquina do usuário.
