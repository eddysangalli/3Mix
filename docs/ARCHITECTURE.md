# 3Mix Architecture & Technical Design

## 1. Diretriz Central de Arquitetura

> **“O 3Mix é um aplicativo próprio, com executável, interface e distribuição próprios, usando a biblioteca libobs como motor interno.”**

Esta especificação define formalmente a arquitetura de entrega do 3Mix e substitui qualquer concepção anterior que tratasse o produto final como OBS portátil com tema, Web Dock ou script de personalização.

O usuário final instala e executa o **3Mix** (`FreeMix.exe` — binário interno, exige rebuild do motor para renomear) e realiza toda a operação broadcast dentro da sua interface integrada.

```
+-----------------------------------------------------------------------+
|                         3Mix Studio App                               |
|                            (FreeMix.exe)                              |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |             Interface Operacional de Produção (Qt6)             |  |
|  |  - Barra Superior: Fullscreen, Multiview, Aux 1/2, Status, Time |  |
|  |  - Monitores Centrais: Preview (Laranja) & Program (Verde)      |  |
|  |  - Console Central de Transição: Cut, Fade, Zoom, T-Bar         |  |
|  |  - Mesa de Corte: Entradas, Câmeras, Mídias, Call WebRTC        |  |
|  |  - Mixer Broadcast: Faders dB, Master, Fones, Delay, Pan, VST   |  |
|  +-----------------------------------------------------------------+  |
|                                  |                                    |
|                                  v                                    |
|  +-----------------------------------------------------------------+  |
|  |                  Camada de Serviços do 3Mix                     |  |
|  |  - OutputManager: MultiStream NVENC, DeckLink SDI, NDI, OMT     |  |
|  |  - AudioBusManager: Master, Aux A Mix-Minus, Aux B Headphones    |  |
|  |  - CanvasMixManager: Múltiplos renders e composições paralelas   |  |
|  |  - MultiviewManager: Mosaico de confiança e sinalização Tally   |  |
|  |  - ProjectManager: Projetos, cenas e persistência própria       |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
                                   |
                  (Chamadas Diretas de API C / C++)
                                   v
+-----------------------------------------------------------------------+
|                    libobs (Core Media Engine)                         |
|  - Render Pipeline: Direct3D 11, shaders de vídeo, texturas GPU       |
|  - Audio Engine: libobs-audio, resampling, mixers, canais 7.1/estéreo |
|  - Hardware Video Encoders: NVENC, Intel QuickSync, AMD AMF, Apple VT |
|  - Capture Framework: DirectShow, Wasapi, Media Foundation, PipeWire  |
|  - Protocol Outputs: RTMP, SRT, RIST, MPEG-TS                         |
+-----------------------------------------------------------------------+
```

---

## 2. Princípios de Execução e Fronteiras do Aplicativo

### 2.1 Executável e Identidade Própria
1. O produto é entregue como o executável nativo Windows **`FreeMix.exe`** (nome de binário interno; renomear exige rebuild do motor), compilado a partir do código C++/Qt do projeto.
2. Metadados de versão, ícone (`IDI_ICON1`), manifesto com suporte a High-DPI e janelas pertencem exclusivamente ao 3Mix.
3. Não são aceitos:
   - Scripts que abrem o OBS e aplicam tema ou títulos via Win32 posterior.
   - Navegadores Edge/Chrome abrindo a mesa isolada fora do software de vídeo.
   - Telas de configuração ou caixas de diálogo operacionais antigas do OBS original.

### 2.2 Gerenciamento do Motor via `libobs`
O aplicativo 3Mix utiliza a `libobs` seguindo a documentação oficial de frontends (`https://docs.obsproject.com/frontends`):
- `obs_startup()`: Inicializa o subsistema de áudio e vídeo com resolução e taxa de quadros definidas pela produção.
- `obs_load_all_modules()`: Carrega os módulos de captura, efeitos e encoders selecionados pelo 3Mix.
- `obs_display_create()`: Cria os viewports nativos de Preview e Program ancorados nos widgets centrais da janela principal.
- `obs_set_output_source()`: Define as saídas de vídeo e transições comutadas pela mesa de corte.

### 2.3 Central de Configurações 3Mix
Ao clicar em "Configurações" ou na engrenagem de qualquer elemento, abre-se a **Central de Configurações 3Mix**:
- **Projeto & Vídeo**: Resolução base (1080p, 4K, 720p) e framerate (60fps, 59.94, 50, 30).
- **Entradas**: Painel com propriedades dinâmicas do hardware capturado, sem interfaces legadas.
- **Áudio & Barramentos**: Roteamento matricial do Master, retorno de convidados (Mix-Minus) e fone da direção.
- **Saídas & MultiStream**: Gerenciador de múltiplos destinos RTMP/SRT com encoder compartilhado.

---

## 3. Gestão de Licenças e Conformidade

O 3Mix é desenvolvido sob a **GPL-2.0**.
- A biblioteca `libobs` e módulos compatíveis são utilizados preservando os créditos de seus autores originais e o cumprimento estrito das exigências da licença de código aberto.
- O código-fonte de modificações e do aplicativo é integralmente versionado no repositório.
