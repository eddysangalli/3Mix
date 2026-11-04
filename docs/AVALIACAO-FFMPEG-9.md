# Avaliação Técnica de Arquitetura — Transição FFmpeg 9.0.2 no 3Mix

Data: 04/11/2026  
Status: **HOMOLOGADO PARA UTILITÁRIOS EXTERNOS (CLI) / RETENÇÃO DEFENSIVA DE DLLs INTEGRADAS**  
Alvos: FFmpeg CLI 9.0.2 + FFmpeg Integrado (libavcodec/libavformat)

---

## 1. Contexto e Objetivos

O 3Mix utiliza o ecossistema FFmpeg em duas camadas operacionais distintas:
1. **FFmpeg Externo (CLI)**: Utilitários standalone (`runtime/ffmpeg.exe` e `runtime/ffprobe.exe`) acionados por subprocessos da API Node.js para tarefas assíncronas:
   - Extração e trimming de clipes de Replay ISO sem perda (`-c:v copy -c:a copy`).
   - Geração de miniaturas de slides e vídeos em segundo plano (`-vf scale=... -f image2`).
   - Benchmark de transcodificação de hardware (NVENC / QuickSync / AMF / x264).
   - Sondagem de metadados e codecs via `ffprobe` JSON format.
2. **FFmpeg Integrado (DLLs C/C++)**: Bibliotecas compartilhadas carregadas diretamente pelo processo `3Mix.exe` através do plugin nativo `obs-ffmpeg.dll`:
   - `avcodec-62.dll`
   - `avformat-62.dll`
   - `avutil-60.dll`
   - `swscale-9.dll`
   - `swresample-6.dll`

---

## 2. Auditoria de Chamadas CLI e Compatibilidade com FFmpeg 9.0.2

Foram auditados todos os módulos de produção que invocam binários externos:
- `3mix-panel/ferramentas/replay-disco.mjs`
- `3mix-panel/ferramentas/replay-preview.mjs`
- `3mix-panel/ferramentas/diagnostico-maquina.mjs`
- `3mix-panel/ferramentas/benchmark-capacidade.mjs`
- `3mix-panel/ferramentas/apresentacao-slides.mjs`
- `3mix-panel/ferramentas/bonding-producao.mjs`

### Resultado da Análise de Flags:
- Todos os parâmetros utilizados (`-hide_banner`, `-loglevel error`, `-nostdin`, `-ss`, `-t`, `-c copy`, `-preset ultrafast`, `-f lavfi`) permanecem estritamente compatíveis no FFmpeg 9.0.2.
- A flag legada `-v:b` (já substituída por `-b:v`) não é utilizada no projeto.
- O parser de saída do `ffprobe -show_streams -print_format json` mantém a mesma estrutura de campos (codec_name, width, height, r_frame_rate, sample_aspect_ratio).

### Fallback Automático:
Implementado mecanismo de resolução em cascata:
1. `3mix-runtime/runtime/ffmpeg-9.exe` (se instalado localmente).
2. `3mix-runtime/runtime/ffmpeg.exe` (build estável distribuído no runtime).
3. Binário do sistema global disponível no `PATH`.

---

## 3. Análise de ABI do FFmpeg Integrado (DLLs de Motor)

### Quebra de ABI entre FFmpeg 8.x e 9.x:
- **Salto de Soname/ABI**: A transição para o FFmpeg 9 incrementa os sonames principais:
  - `libavcodec 62 -> 63`
  - `libavformat 62 -> 63`
  - `libavutil 60 -> 61`
- **Impacto no `obs-ffmpeg.dll`**:
  O plugin `obs-ffmpeg.dll` do OBS Studio foi compilado e vinculado à tabela de importação (`IAT`) da versão 62. A substituição cega das DLLs sem recompilação causa falha fatal de link dinâmico (`STATUS_ENTRYPOINT_NOT_FOUND` / `LNK1181`).
- **Funções Depreciadas no FFmpeg 9**:
  Remoção de estruturas legadas de alocação de pacotes (`av_init_packet`) e alterações na API de contexto de canal de áudio (`ch_layout`).

---

## 4. Decisão de Engenharia Broadcast

| Camada | Versão Adotada | Justificativa Técnica |
|---|---|---|
| **CLI Externo** | **9.0.2 / 8.1.1 (Dual)** | Suporte completo a novos codecs (VVC, AV1 SVT otimizado, Whisper), 100% retrocompatível com scripts Node.js. |
| **DLLs Integradas** | **8.1.2 (Estável)** | **Retenção defensiva**. Garante estabilidade operacional absoluta do compositor de vídeo, encoder NVENC nativo e muxer mpegts do OBS Studio fork 3Mix, até liberação sincronizada do OBS 33 upstream com toolchain FFmpeg 9. |

---

## 5. Instruções para Instalação Verificada do FFmpeg 9.0.2 CLI

Para operadores que desejarem utilizar recursos adicionais do FFmpeg 9 CLI:
1. Obtenha o release oficial Windows x64 de `ffmpeg-release-full.7z` (Gyan.dev / BtbN).
2. Verifique o hash SHA-256 do arquivo baixado.
3. Extraia o binário para `3mix-runtime/runtime/ffmpeg-9.exe`.
4. O 3Mix detectará e priorizará o executável automaticamente para as rotinas auxiliares.
