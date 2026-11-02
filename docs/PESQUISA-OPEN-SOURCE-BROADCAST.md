# RELATÓRIO TÉCNICO EXECUTIVO: ECOSSISTEMA OPEN SOURCE EBU & BROADCAST PARA A EVOLUÇÃO DO 3MIX

**De:** Agente Pesquisador e Arquiteto Broadcast
**Para:** Agente Mestre (Parent: `53afe648-b1c6-4bdb-99a3-222ed40f3874`)
**Data:** 30 de Outubro de 2026
**Assunto:** Auditoria Arquitetural do 3Mix, Mapeamento do EBU Awesome-Broadcasting e Diretrizes de Engenharia

---

Prezado Mestre e Equipe de Engenharia,

Concluí a auditoria completa da arquitetura do 3Mix e a varredura aprofundada de todas as categorias do repositório oficial da EBU (`ebu/awesome-broadcasting`), cruzando com as necessidades operacionais e diretrizes consolidadas em `PRODUCT-VISION.md` e `PENDENCIAS-REAIS.md`.

Abaixo apresento primeiramente o **Resumo Executivo Estruturado em 4 Pontos**, seguido pela íntegra do documento técnico completo preparado para gravação em [`3mix-panel/docs/PESQUISA-OPEN-SOURCE-BROADCAST.md`](file:///d:/DRIVE/IA/antigravity/3Mix/3mix-panel/docs/PESQUISA-OPEN-SOURCE-BROADCAST.md).

---

## RESUMO EXECUTIVO (OS 4 PONTOS FUNDAMENTAIS)

### 1. O que realmente vale aproveitar
1. **Bitfocus Companion (`@companion-module/base` + Protocolo TCP 8099)**:
   - O 3Mix já possui o `VmixTcpServer` (`vmix-tcp-api.mjs` na porta 8099), permitindo conexão imediata com o módulo de vMix do Companion.
   - O salto qualitativo é a criação do **Módulo Nativo `@companion-module/3mix`** conectando via WebSocket/REST na porta 8088/18188. Isso desbloqueia feedbacks bidirecionais inexistentes no vMix: botões OLED do Stream Deck exibindo gauges de telemetria de CPU/GPU, alerta visual de vídeo congelado (`stalled`), disparo do Incident Blackbox de 60s, acionamento do DUMP de censura ao keyframe e troca de layouts verticais 9:16 do MultiView.
2. **`libebur128` & FFmpeg `ebur128` (Loudness EBU R128 / ITU-R BS.1770)**:
   - Implementação do **Ajuste de Ganho Pré-Fader Automático por Clipe (Inovação TriCaster DDR)**. O FFmpeg/libebur128 analisa o VT em background ao ser importado na playlist, calcula o Integrated Loudness e True Peak, e aplica o offset estático em dB diretamente no input pré-fader, mantendo o fader físico de 0 dB do operador intocado.
3. **Ontime (`getontime/ontime`)**:
   - Padrão open source para Run of Show e relógios de estúdio. Integração transparente via WebSocket/REST com os relógios de topbar do 3Mix, alimentando contadores regressivos para os apresentadores e permitindo acionar macros por tempo de bloco.
4. **Sofie `mos-connection` e `Quick-MOS`**:
   - Conexão nativa com sistemas de redação jornalística (NRCS: Avid iNews, AP ENPS, Octopus, Dalet). Permite receber o espelho do telejornal e popular automaticamente os blocos de matérias e os créditos/GCs do 3Mix sem redigitação.
5. **Especificação OGraf da EBU (`ebu/ograf`)**:
   - Padronização de pacotes gráficos HTML5 em Web Components e manifesto JSON (`ograf.json`). Permite criar Lower Thirds e placares no After Effects/Lottie ou Loopic e executá-los no 3Mix via browser CEF com métodos padronizados `play()`, `stop()`, `update()`.
6. **Protocolos TSL UMD v3.1/v5.0 e TallyArbiter**:
   - Emissão de pacotes de Tally IP em tempo real para receptores em rede (monitores multiview de estúdio, gravadores de hardware e microcontroladores M5StickC/ESP32 montados nas câmeras dos operadores).
7. **`libltc` & SMPTE Linear Timecode**:
   - Decodificação de áudio LTC para timecode com precisão de quadro, viabilizando sincronização absoluta de ring buffers multicâmera para Replay instantâneo sem necessitar de geradores PTP caros.
8. **`fio` (Flexible I/O Tester)**:
   - Benchmark automatizado de taxa de escrita sequencial contínua no disco de Replay/ISO integrado ao Pre-Flight Check.

---

### 2. O que não vale a pena (Descartes Justificados)
1. **Sofie Timeline State Resolver (TSR)**:
   - *Motivo do descarte*: O TSR adota o paradigma declarativo estrito para emissoras 24/7 sem intervenção humana. Para o 3Mix, que é uma mesa de corte dinâmica, rápida e operada ao vivo, o TSR introduz complexidade matemática desnecessária e latência de orquestração. O motor interno de macros (`macros-producao.mjs`) com triggers por evento é superior para essa finalidade.
2. **NodeCG**:
   - *Motivo do descarte*: Arquitetura focada em bundles complexos de eSports com alto acoplamento a desenvolvedores. O SPX Graphics Controller ou a especificação OGraf da EBU são ordens de grandeza mais alinhados à agilidade broadcast de estúdio.
3. **CasparCG Server como substituto de motor**:
   - *Motivo do descarte*: O CasparCG é excelente em playout SDI, mas substituir ou acoplar o CasparCG como motor principal violaria a integridade do `3mix-engine` (libobs C/C++), duplicando pipelines de decodificação e consumindo RAM e VRAM em excesso.
4. **ffplayout (Playout linear 24/7)**:
   - *Motivo do descarte*: O 3Mix é uma suíte de produção ao vivo, mesa de corte e playout de estúdio (DDR de clipes e matérias), não uma estação de transmissão contínua 24/7 para MCR de TV aberta.
5. **Ferramentas legadas de rádio (Airtime/LibreTime, butt, DarkIce, RadioDNS)**:
   - *Motivo do descarte*: Escopo estritamente radiofônico ou obsoleto, sem convergência com o pipeline de vídeo broadcast.

---

### 3. O que depende de cliente, parceiro ou hardware específico
1. **Playout SDI com Fill & Key e Genlock (Blackmagic DeckLink)**:
   - Exige hardware dedicado (DeckLink Duo 2, Quad 2 ou 8K Pro) e cabeamento duplo BNC conectado a mixers de hardware (ATEM, Grass Valley, Ross).
2. **Integração MOS com Redações (NRCS)**:
   - Depende de a emissora cliente possuir infraestrutura ativa de jornalismo (licenças e servidores iNews, ENPS ou Octopus) e permissões de rede na porta TCP 10540-10542.
3. **Sincronismo de Rede PTP (SMPTE ST 2059-2 / IEEE 1588)**:
   - Depende de switches de rede gerenciáveis corporativos com PTP Boundary Clock / Grandmaster para infraestruturas SMPTE ST 2110.
4. **Intercom WebRTC de Alta Escala (Eyevinn Open Intercom)**:
   - Depende de implantação em nuvem com media servers (Symphony Media Bridge) e servidores STUN/TURN; em produção local de estúdio físico, Mumble/Murmur local via UDP/Opus é 10x mais barato, estável e livre de dependências externas.

---

### 4. Qual deve ser o primeiro trabalho prático e viável
**PoC 1: Módulo Nativo 3Mix para Bitfocus Companion + Enriquecimento do Servidor TCP vMix (Porta 8099)**
- **Por que este primeiro?**
  1. Não altera uma única linha do motor nativo C/C++ (`3mix-engine`).
  2. Alavanca a infraestrutura Node.js existente em `servidor-api.mjs` e `vmix-tcp-api.mjs`.
  3. Gera impacto comercial e operacional imediato: qualquer operador com Stream Deck, Stream Deck +, X-Keys ou celular passa a operar o 3Mix com feedback tátil profissional e telemetria colorida em tempo real.
  4. Paralelamente, como ganho imediato no módulo de áudio: implementação do script de **Normalização Pré-Fader EBU R128 por Clipe** usando o FFmpeg embutido, eliminando definitivamente a dor de saltos de volume em matérias jornalísticas e comerciais.

---

# TEXTO INTEGRAL DO DOCUMENTO TÉCNICO

*O documento a seguir foi estruturado para ser persistido em: `d:\DRIVE\IA\antigravity\3Mix\3mix-panel\docs\PESQUISA-OPEN-SOURCE-BROADCAST.md`*

```markdown
# PESQUISA TÉCNICA E ARQUITETURAL: ECOSSISTEMA OPEN SOURCE EBU & ADJACENTES PARA A EVOLUÇÃO DO 3MIX

**Documento Canônico de Pesquisa e Roadmap Tecnológico**  
**Projeto:** 3Mix Pro (Suíte de Produção e Transmissão Broadcast Modular)  
**Data:** 30 de Outubro de 2026  
**Status:** Consolidado / Aprovado para Planejamento de Engenharia  
**Referência Canônica de Identidade:** `3mix-panel/docs/PRODUCT-VISION.md`  

---

## 1. AUDITORIA DE ARQUITETURA DO 3MIX PRO (ESTADO REAL VS. ROADMAP)

Para que a adoção de bibliotecas e especificações da EBU (European Broadcasting Union) seja eficaz, é mandatória a separação cirúrgica entre o que está efetivamente implementado e funcional no código-fonte do 3Mix e o que reside em fase de homologação ou conceito.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              3Mix STUDIO PRO                                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│  3MIX-ENGINE     │          │    3MIX-PANEL    │          │     3MIX-IO      │
│  (C/C++ libobs)  │◄────────►│   (Node.js v24)  │◄────────►│  (C++17 Win32)   │
│                  │  IPC/WS  │                  │  TCP/IP  │                  │
│ - D3D11 Canvas   │  Porta   │ - REST API 8088  │  Porta   │ - Captura DShow  │
│ - DeckLink SDI   │  Interna │ - vMix TCP 8099  │  8090    │ - Sender OMT/NDI │
│ - obs-browser/CEF│          │ - MultiView Eng. │          │ - Rec MKV/MP4/WAV│
│ - obs-websocket  │          │ - Input Health   │          │ - Status/Telemet │
│ - DSK 1 a 4      │          │ - Output Watchdog│          └──────────────────┘
└──────────────────┘          │ - Aux Matrix Router         
                              │ - DiskReplay A/B            
                              └──────────────────┘          
```

### 1.1 O que é Real no Motor Nativo C/C++ (`3mix-engine`)
- **Núcleo de Renderização:** Baseado em libobs com suporte nativo a DirectX 11 (D3D11) no Windows, garantindo aceleração gráfica de hardware, shaders HLSL e blending de camadas.
- **Entrada e Saída SDI:** Plugin `decklink` e `decklink-output-ui` compilados na árvore in-tree, comunicando-se diretamente com o driver Blackmagic Desktop Video.
- **Gráficos e Web View:** Plugin `obs-browser` baseado em Chromium Embedded Framework (CEF), renderizando HTML5/CSS/WebGL diretamente no canvas de vídeo.
- **Downstream Keying:** Plugin `downstream-keyer` in-tree, permitindo sobreposições independentes de camadas de programa.
- **Ponte de Controle Interno:** `obs-websocket` v5 com suporte a Vendor Requests dedicados (`freemix: get_interface`, eventos de hotkeys globais).

### 1.2 O que é Real na Camada Node.js v24 (`3mix-panel`)
- **Servidor HTTP & WebSocket (`servidor-api.mjs`):** Escuta nas portas 8088 / 18188+, provendo autenticação por token de sessão, rotação de logs e despacho reativo de telemetria.
- **Emulação vMix TCP (`vmix-tcp-api.mjs` na porta 8099):** Implementação do protocolo TCP bidirecional do vMix, respondendo a comandos de corte, transição, áudio e notificações de tally para controladores externos.
- **MultiView Broadcast Engine (`multiview-engine.mjs`):** Gerenciador de layouts de monitoramento com suporte nativo a `16:9 Standard`, `Studio 12`, `Quad Split` e os layouts móveis `Vertical 9:16 Mobile` e `Social Feed` com safe areas para TikTok/Reels e medidores de áudio estéreo.
- **Telemetria de Entrada (`telemetria-saude.mjs`):** Monitoramento dinâmico de entradas (`healthy`, `degraded`, `stalled`, `offline`), identificando congelamento de vídeo via amostragem de hash SHA-256 e detecção de pico dBFS.
- **Watchdog de Saída (`saidas-watchdog.mjs`):** Reconexão automática de streams RTMP/SRT com backoff exponencial determinístico, jitter defensivo de 15% e circuit breaker contra loops infinitos de rede.
- **Matriz de Roteamento AUX (`aux-output-router.mjs`):** Chaveamento independente de sinais de estúdio e Clean Feeds.
- **Replay em Disco (`replay-disco.mjs`):** Gerenciador de buffer circular em disco para cortes de replay e gravações ISO multicâmera.

### 1.3 O que é Real no Módulo Standalone C++17 (`3mix-io`)
- Aplicação Win32 nativa na porta 8090, capaz de capturar fontes DirectShow e arquivos locais, transmitindo em OMT e NDI, com gravação independente em containers MKV/MP4 e áudio M4A/MP3/WAV.

### 1.4 O que é Parcial, Simulado ou Gap Técnico Conhecido
- **Retorno de Vídeo de Calls Externas:** Atualmente baseado em capturas periódicas JPEG (até 5 fps) para retornos rápidos de participantes; transmissão de vídeo contínuo 30 fps com baixa latência e sincronismo labial exige finalização do pipeline WebRTC/WHIP.
- **Genlock Hardware Multicâmera:** O motor atual não implementa sincronismo síncrono por frame de múltiplas placas DeckLink via sinal de Blackburst/Tri-Level Sync externo.
- **Canal Alfa Web vs. Nativo:** O experimento de canal alfa direto em entrada web foi abortado devido a inconsistências de pré-multiplicação de cor no CEF quando mixado sobre backgrounds complexos; o pipeline atual exige shaders específicos ou transporte Fill + Key.
- **Análise Pré-Fader de Loudness:** O motor aplica volume via ganho digital no OBS, mas não possui módulo automático de varredura prévia de clipes para conformidade EBU R128.

---

## 2. VARREDURA COMPLETA DO ECOSSISTEMA EBU (AWESOME-BROADCASTING)

Mapeamento exaustivo de todas as categorias do repositório mantido pela European Broadcasting Union:

| Categoria EBU | Projetos Chave Catalogados | Análise de Aplicabilidade ao 3Mix |
|---|---|---|
| **Animation, Graphics & Playout** | CasparCG, OGraf, SPX Graphics, NodeCG, Ferryman, Macadam, ffplayout, Aurena | **Alta**. OGraf e SPX padronizam titulação; CasparCG serve de referência para Fill/Key; Ferryman converte Lottie. |
| **Clocks & Studio Screens** | OnAirScreen, OATIS, PiClock, PiRSClock | **Alta**. Clocks sincronizados para estúdio e lâmpadas On-Air virtuais. |
| **Codecs** | Opus, FLAC, Turing Codec (H.265), TwoLame, LAME | **Média**. Codecs de áudio de alta fidelidade e baixa latência (Opus é padrão para Calls e Intercom). |
| **Communication & Intercom** | Eyevinn Intercom Manager/Frontend, DIY Intercom (Mumble/Murmur) | **Alta**. Solução para comunicação entre operador de corte, diretor de TV e cinegrafistas. |
| **Control Systems** | Bitfocus Companion, Lawo Ember+, MIDIMonster, BUG | **Crítica**. Companion e MIDIMonster viabilizam superfícies táteis e controladores de estúdio. |
| **DVB & Transport Streams** | TSDuck, DVBlast, Opencaster, Project X | **Baixa/Específica**. Relevante apenas para headends de transmissão de TV aberta e cabo. |
| **LiveIP (AV over IP)** | EBU LIST, OpenOB, butt, Icecast, Kamailio, PJSIP | **Média**. Ferramentas de validação de fluxo IP e contribuição remota de áudio via SIP/Opus. |
| **Metadata** | BMXlib (MXF), libklvanc (SCTE-104/ANC SDI), SDPoker | **Média**. Essencial para inserção de dados ancilares em SDI e conformidade de arquivos MXF. |
| **Monitoring & Quality Control** | Jmeters, libebur128, silan, SilentJack, QCTools, MediaConch | **Crítica**. Medição de Loudness R128, detecção de silêncio e análise de conformidade de mídia. |
| **Multimedia Processing** | FFmpeg, AvTranscoder, Bento4, Beam Coder, UPipe, Voctomix | **Alta**. FFmpeg como motor de análise, remuxing e extração de metadados em background. |
| **Network & Storage Testing** | fio, iPerf3, BBC Media Storage Meter, ST 2110 Analyzer | **Alta**. Testes de estresse de disco para Replay multicâmera e throughput de rede NDI/SRT. |
| **NMOS (AMWA)** | Easy-NMOS, nmos-cpp, nmos-js, AMWA Testing Tool | **Médio/Longo Prazo**. Essencial para interoperabilidade IP SMPTE ST 2110 em estúdios de grande porte. |
| **Rundown Automation** | Ontime, SuperConductor, Sofie TV Automation | **Alta**. Ontime para cronometria e espelho; Sofie mos-connection para integração NRCS. |
| **SCTE-35 & SCTE-104** | threefive, wireshark-scte, x9k3 | **Específica**. Inserção de gatilhos de publicidade digital (Ad Insertion) em streams HLS/TS. |
| **Subtitling** | EBU-TT Live Toolkit, CCExtractor, dash.js EBU-TT-D | **Média**. Closed Caption e legendagem ao vivo para acessibilidade regulatória. |

---

## 3. INVESTIGAÇÃO DETALHADA DOS CANDIDATOS OBRIGATÓRIOS

### 3.1 Bitfocus Companion & Superfícies de Controle Físico
- **Estado Atual no 3Mix:** O 3Mix inclui `VmixTcpServer` na porta 8099. Qualquer perfil existente do vMix no Companion conecta-se imediatamente, executando `CUT`, `FADE`, `PREVIEW`, `PROGRAM`, `AUDIO MUTE` e feedbacks simples de Tally.
- **Oportunidade Estrutural:** O módulo de vMix do Companion não expõe as inovações exclusivas do 3Mix (Incident Blackbox, Pre-Flight, telemetria de CPU/GPU em gauges, watchdog de stream, matriz AUX e layouts 9:16).
- **Diretriz de Implementação:** Desenvolver o módulo oficial `@companion-module/3mix` baseado na API v3 do Companion (`@companion-module/base`). O módulo conecta-se via WebSocket na porta 8088/18188 do 3Mix, com inscrição reativa a eventos. Cada botão no Stream Deck reflete estados complexos:
  - Exibição de nomes dinâmicos dos inputs e status de sinal (Normal, Stalled, Offline).
  - VU meter estéreo dinâmico em telas LCD e botões com display (Stream Deck +).
  - Botão dedicado de emergência: `INCIDENT BLACKBOX (60s SAVE)` com contador de ring buffer.
  - Botão `DUMP` de censura (corte para VT de segurança sincronizado ao keyframe).

### 3.2 Sofie MOS-Connection e Quick-MOS (Integração com NRCS)
- **Contexto Broadcast:** O protocolo MOS (Media Object Server) é o padrão da indústria (AMWA) que interliga redações de jornalismo (NRCS - Newsroom Computer Systems: AP ENPS, Avid iNews, Octopus, Dalet) aos sistemas de playout e geradores de caracteres de estúdio.
- **Arquitetura da Biblioteca:** Mantida pela Sofie Automation em TypeScript puro. Implementa os sockets TCP (portas 10540, 10541 e 10542), o handshake de heartbeat e o parser/serializer dos esquemas XML de mensagens MOS (`roCreate`, `roStorySend`, `roItemSend`, `roStoryMove`, `roStoryDelete`).
- **Quick-MOS:** Ferramenta inclusa na suíte Sofie que emula um servidor NRCS real a partir de arquivos JSON/XML locais, permitindo validar o fluxo sem licenças proprietárias.
- **Workflow no 3Mix:** Um serviço satélite Node.js (`mos-gateway.mjs`) escuta as mensagens do NRCS. Ao receber o espelho do jornal:
  1. Cria automaticamente a playlist de VTs no Media Player do 3Mix, associando os IDs de matéria aos clipes no disco.
  2. Popula os campos dinâmicos do módulo de GC (nome do entrevistado, cargo, retranca da notícia) prontos para disparo no canal DSK correspondente.

### 3.3 OGraf & Gráficos Broadcast em HTML5
- **O que é:** Especificação aberta criada pela EBU para acabar com a fragmentação de formatos proprietários de gráficos broadcast (Chyron, VizRT, Ross Xpression).
- **Especificação Técnica:** Baseada em Web Components padronizados e um arquivo manifesto JSON (`ograf.json`). Define campos editáveis (tipos de dados, strings, imagens, cores) e uma máquina de estados com métodos obrigatórios:
  - `load()`: Pré-carrega mídias e assets sem travar a thread de renderização.
  - `play()`: Dispara a animação de entrada (Intro).
  - `update(data)`: Atualiza textos e placares mantendo o elemento na tela.
  - `stop()`: Dispara a animação de saída (Outro).
- **Vantagem para o 3Mix:** Em vez de depender do formato proprietário GT Title do vMix (cuja compatibilidade no 3Mix requer emulação reversa via `gtzip`), o 3Mix adota o OGraf como formato nativo de próxima geração, renderizado com taxa de quadros plena diretamente pelo CEF (`obs-browser`).

### 3.4 Gestão de Tempo e Rundown: Ontime vs. Sofie TSR
- **Ontime (`getontime/ontime`):** Aplicação de referência mundial para gerenciamento de tempo em produções ao vivo. Oferece API completa em REST, WebSocket e OSC, gerando relógios de contagem regressiva para estúdio, prompters de tempo para o apresentador ("30s para encerrar") e lista sequencial de blocos.
  - *Decisão para o 3Mix:* **Adoção imediata via integração de API**. O 3Mix conecta-se ao Ontime para refletir o relógio oficial do programa na topbar da interface e disparar transições automatizadas ao atingir marcos de bloco.
- **Sofie TSR (Timeline State Resolver):** Motor de cálculo declarativo contínuo. Define o estado esperado do estúdio a cada milissegundo e resolve transições calculando comandos para múltiplos dispositivos.
  - *Decisão para o 3Mix:* **Descarte**. O TSR adiciona complexidade e rigidez incompatíveis com a operação tátil, ágil e responsiva de uma mesa de corte física operada por humanos.

### 3.5 Áudio Broadcast: `libebur128` e Ganho Pré-Fader Automático
- **O Problema Histórico:** Matérias gravadas em campo por diferentes equipes chegam com volumes díspares (algumas em -12 LUFS, outras em -28 LUFS). No playout de VT, isso força o operador a caçar o fader com a mão, gerando saltos de volume desagradáveis ou clipping.
- **libebur128 (ITU-R BS.1770 / EBU R128):** Biblioteca padrão ouro em C. Mede com precisão matemática:
  - *Integrated Loudness ($L_I$):* Nível de loudness percebido ao longo de todo o clipe (em LUFS).
  - *True Peak ($TP$):* Medição de picos entre amostras digitais com oversampling de 4x.
  - *Loudness Range (LRA):* Faixa de dinâmica do áudio.
- **Mecanismo no 3Mix:**
  1. Ao importar um clipe para o Media Player / DDR, o 3Mix dispara uma análise assíncrona ultra-rápida via FFmpeg/libebur128.
  2. Calcula o ganho de calibração necessário:
     $$\text{Ganho Pré-Fader (dB)} = \text{Loudness Alvo (-24 LUFS)} - L_I$$
  3. O valor em dB é aplicado como ajuste estático na propriedade de volume do clipe pré-fader.
  4. O fader master do canal DDR permanece intocado na marca de 0 dB do operador.

### 3.6 Replay Multicâmera & SMPTE Timecode (`libltc`)
- **libltc:** Biblioteca POSIX-C para decodificação de Linear Timecode (LTC) em streams de áudio.
- **Aplicação no Replay do 3Mix:** Permite receber sinal de áudio LTC gravado na trilha de áudio auxiliar das câmeras e sincronizar os ring buffers de Replay multicâmera com precisão absoluta de quadro (frame-accurate), eliminando a necessidade de placas proprietárias de sincronismo por hardware.

---

## 4. RESPOSTAS ESTRUTURADAS ÀS QUESTÕES OPERACIONAIS DE BROADCAST

### A. Controle Físico & Superfícies (Companion, Stream Deck, MIDI, Tally IP)
- **Arquitetura Recomendada:** O 3Mix deve atuar como Hub de Controle Híbrido:
  1. Suporte legado mantido via emulação vMix TCP na porta 8099 (compatibilidade plug-and-play imediata).
  2. Conexão nativa via WebSocket com o módulo oficial 3Mix para Bitfocus Companion, provendo telemetria granular.
  3. Suporte a Web MIDI diretamente no painel web da mesa (`mesa.html`) para controladores físicos USB padrão (Akai APC Mini, Novation Launchpad, Behringer X-Touch) com mapeamento visual drag-and-drop.
  4. Emissão de pacotes **TSL UMD v3.1 e v5.0 via UDP** para lâmpadas de Tally comerciais e TallyArbiter, garantindo que o status de Program/Preview chegue a smartphones e dispositivos ESP32 nas câmeras.

### B. Automação de Redação & MOS (NRCS)
- **Workflow Proposto:**
  ```
  [Redação NRCS] (ENPS / iNews / Octopus)
         │  MOS Protocol (TCP 10540-10542)
         ▼
  [3Mix MOS-Gateway] (Node.js / mos-connection)
         │  REST / Local IPC
         ▼
  [3Mix Production Core] ────► [Playout DDR: Playlist de VTs do Jornal]
                         ────► [DSK Engine: Lower Thirds / Créditos / OGraf]
  ```
- **Operação no Ar:** O operador de corte vê o espelho do jornal ordenado em blocos. Ao avançar as matérias, o 3Mix carrega automaticamente o VT correto no Preview e os créditos do entrevistado no DSK correspondente, pronto para corte por botão físico ou trigger automatizado.

### C. Gráficos Broadcast & Canal Alfa (Straight vs. Premultiplied)
- **Diagnóstico Técnico do Canal Alfa:**
  - O Chromium (CEF/obs-browser) opera nativamente com **Premultiplied Alpha** ($R' = R \cdot A$, $G' = G \cdot A$, $B' = B \cdot A$).
  - Se um elemento gráfico gerado no CEF for renderizado diretamente em uma saída SDI sem tratamento, bordas semi-transparentes apresentarão contornos pretos ou aberrações de luminância.
- **Padrão Broadcast Estabelecido:**
  - Para saídas de hardware SDI (DeckLink): separação em canal de **Fill** (vídeo RGB pré-multiplicado) e canal de **Key** (canal alfa isolado em escala de cinza de 8 bits), enviados em saídas BNC pareadas e sincronizadas.
  - Para composição interna na mesa: uso de shader de composição linear sRGB no libobs, garantindo que gráficos OGraf/HTML5 sobreponham as câmeras com transparência perfeita, sombras suaves e ausência de franjas.

### D. Rundown & Automação de Estúdio
- **Decisão Arquitetural:** Rejeitar a complexidade do Sofie TSR e integrar o **Ontime** via REST/WebSocket.
- O Ontime mantém a autoridade do tempo (Run of Show, blocos, horários previstos vs. horários reais). O 3Mix consulta o Ontime e dispara suas macros internas de produção (`macros-producao.mjs`) com base nos eventos de tempo disparados pelo diretor de estúdio.

### E. Áudio Broadcast & Conformidade
- **Implementação do Loudness:**
  - Inclusão do utilitário de inspeção baseado em `libebur128` no carregador de mídia do DDR.
  - Medição do clipe em um único passo com persistência do valor no banco de dados local da playlist (`metadata.loudness`).
  - Aplicação de ganho pré-fader instantâneo na inicialização do clipe.
- **Auto-Ducking de Alta Precisão:**
  - O `audio-buses-producao.mjs` monitora o microfone do locutor (VAD - Voice Activity Detection).
  - Quando a voz ultrapassa o threshold (ex: -30 dBFS), aplica atenuação exponencial na trilha sonora de fundo (Ducking de -15 dB) com tempo de ataque de 50ms, hold de 1.5s e release suave de 600ms, evitando cortes abruptos no áudio.

### F. Replay Multicâmera & Performance de Disco
- **Sincronismo de Quadro:** Uso de áudio LTC decodificado via `libltc` para estampar timecodes SMPTE idênticos em todos os canais gravados em ring buffer.
- **Validação de Disco com `fio`:**
  - A gravação simultânea de 4 fluxos 1080p60 requer gravação estável a mais de 80 MB/s contínuos sem quedas de buffer.
  - O 3Mix incorpora um teste sintético prévio com `fio` no diretório de gravação durante a checagem de inicialização, alertando o operador se a mídia física apresentar risco de congelamento ou saturação de barramento PCIe.

### G. Vídeo e Hardware SDI (DeckLink & Cópia de Memória Windows)
- **Gargalo no Windows:** A transferência de vídeo da GPU (textura Direct3D 11) para o driver da placa DeckLink exige copiar o frame para a memória RAM do sistema (Staging Texture via PCIe).
- **Mitigação de Engenharia:** Utilizar arquitetura assíncrona de triplo buffer no plugin DeckLink. A thread de renderização da GPU nunca bloqueia aguardando a conclusão da transferência DMA do driver da Blackmagic, garantindo que o mixer de corte principal mantenha 60 fps estáveis mesmo em situações de alta carga no barramento PCIe.

### H. Confiabilidade, Pre-Flight Check & Incident Blackbox
- **Pre-Flight Check (Rotina de Segurança de 7 Pontos antes do Ar):**
  1. *Disco:* Espaço livre superior a 3x o tempo planejado de evento e teste de I/O validado.
  2. *Sinais de Entrada:* Nenhuma câmera em estado de vídeo estagnado (`stalled`) ou tela preta (`black`).
  3. *Áudio:* Monitoramento de microfones principais sem detecção de silêncio contínuo (`dead air`).
  4. *Rede & Saídas:* Conexão de streaming com handshake confirmado e RTT inferior a 150ms.
  5. *Recursos de Sistema:* Carga de CPU e GPU em repouso inferior a 65%.
  6. *DSKs e Overlays:* Confirmação de que nenhum GC residual da atração anterior está armado no PGM.
  7. *Retornos N-1:* Barramentos Mix-Minus ativos e roteados para os canais de externa.
- **Incident Blackbox de 60 Segundos:**
  - Ring buffer circular contínuo mantido em memória RAM. Ao ocorrer um incidente técnico ou editorial, o operador aciona o botão `BLACKBOX SAVE`, gerando um arquivo de vídeo preservado para auditoria e análise de falhas.

---

## 5. MATRIZ DE PRIORIZAÇÃO DE ADOÇÃO (CATEGORIAS A A E)

```
                       IMPACTO OPERACIONAL
                     Baixo               Alto
                 ┌───────────────────┬───────────────────┐
                 │                   │  CATEGORIA A      │
            Alto │   CATEGORIA B     │ - Companion Nativo│
                 │ - Ontime Rundown  │ - EBU R128 Pré-Fad│
  FACILIDADE     │ - TSL Tally IP    │ - Pre-Flight Check│
      DE         ├───────────────────┼───────────────────┤
 IMPLEMENTAÇÃO   │   CATEGORIA E     │  CATEGORIA D      │
            Baixa│ - CasparCG Fill/K │ - MOS NRCS Gateway│
                 │ - WebRTC Intercom │ - DeckLink Genlock│
                 └───────────────────┴───────────────────┘
                 * Categoria C: Descartes Justificados (TSR, NodeCG, ffplayout)
```

- **CATEGORIA A (Adoção Imediata de Alto Valor / Sem Fricção de Motor):**
  - Módulo Nativo Bitfocus Companion (`@companion-module/3mix`).
  - Normalizador de Loudness EBU R128 Pré-Fader por Clipe (FFmpeg / libebur128).
  - Pre-Flight Check Automatizado com benchmark de disco `fio`.
- **CATEGORIA B (Evolução Estratégica a Médio Prazo):**
  - Integração de Rundown e Clocks de Estúdio com Ontime.
  - Emissor de Tally Broadcast TSL UMD v3.1/v5.0 e TallyArbiter.
  - Suporte ao padrão OGraf para Lower Thirds e pacotes gráficos abertos.
- **CATEGORIA C (Descartes Justificados por Incompatibilidade ou Redundância):**
  - Sofie Timeline State Resolver (TSR) — complexidade excessiva para corte ao vivo.
  - NodeCG — arquitetura de bundles pesada para o ambiente broadcast.
  - ffplayout — foco em TV linear 24/7 fora do escopo do 3Mix.
- **CATEGORIA D (Dependente de Cliente, Parceiro ou Hardware Específico):**
  - Gateway MOS para redações jornalísticas (exige clientes com AP ENPS, iNews ou Octopus).
  - SDI Fill & Key síncrono com Genlock de hardware (exige placas Blackmagic DeckLink).
  - Intercom corporativo em nuvem WebRTC (Eyevinn).
- **CATEGORIA E (Pesquisa Exploratória Futura):**
  - Sincronização PTP (SMPTE ST 2059-2) para infraestruturas puras SMPTE ST 2110.
  - Inserção de marcadores SCTE-35 / SCTE-104 em fluxos OTT para monetização digital.

---

## 6. OS 5 PLANOS RIGOROSOS DE PROVA DE CONCEITO (PoC)

### PoC 1: Módulo Nativo 3Mix para Bitfocus Companion + Feedback Tally Bidirecional
- **Objetivo Técnico:** Criar o módulo oficial do 3Mix para Bitfocus Companion utilizando a API moderna `@companion-module/base`, provendo controle tátil por Stream Deck com feedback visual de telemetria em tempo real.
- **Arquitetura da PoC:**
  - Módulo Node.js conectando via WebSocket na porta 8088 do 3Mix.
  - Inscrição no canal `/api/state` e `/api/inputs-health`.
  - Mapeamento de ações: `Cut`, `Auto`, `SelectPreview`, `SelectProgram`, `TriggerDSK(1-8)`, `SaveBlackbox`, `DumpCensorship`, `SwitchMultiViewLayout`.
  - Mapeamento de feedbacks de cor:
    - Vermelho vibrante: Input em Program (Tally PGM).
    - Verde vibrante: Input em Preview (Tally PVW).
    - Amarelo piscante: Câmera com vídeo congelado (`stalled`).
    - Vermelho escuro piscante: Câmera offline / sinal perdido.
- **Critérios de Sucesso e Aceite:**
  1. Latência entre pressionar o botão no Stream Deck e a comutação no motor < 25 ms.
  2. Latência entre mudança de estado na mesa e atualização da cor do botão no Stream Deck < 50 ms.
  3. Desconexão e reconexão automática resiliente sem travamento do Companion.

### PoC 2: Loudness Normalizer Pré-Fader Automático por Clipe (FFmpeg / libebur128)
- **Objetivo Técnico:** Eliminar os saltos de volume na reprodução de clipes de VT na playlist DDR, calibrando automaticamente o ganho pré-fader para conformidade com a norma EBU R128 (-24 LUFS) ou Streaming (-14 LUFS).
- **Arquitetura da PoC:**
  - Script worker executado em background ao adicionar vídeo à playlist:
    ```bash
    ffmpeg.exe -nostats -i "input.mp4" -filter_complex "ebur128=peak=true" -f null -
    ```
  - Extração dos valores no log de saída:
    - `Integrated loudness: -18.4 LUFS`
    - `True peak: +0.8 dBFS`
  - Cálculo do ganho estático: $\text{Offset} = -24.0 - (-18.4) = -5.6 \text{ dB}$.
  - Gravação do valor no snapshot do clipe. Ao disparar o VT no ar, o `media-playout-engine.mjs` envia o comando `SetInputVolume` para o OBS com o ganho calibrado, preservando o fader de canal em 0 dB.
- **Critérios de Sucesso e Aceite:**
  1. VTs com áudios entre -12 LUFS e -30 LUFS reproduzidos dentro da janela de $\pm 0.5$ LU do alvo de -24 LUFS.
  2. Fader físico do operador inalterado.
  3. Tempo de análise de arquivo em background inferior a 5% da duração do clipe.

### PoC 3: Integração de Rundown e Clocks de Transmissão via Ontime
- **Objetivo Técnico:** Conectar o 3Mix a um servidor Ontime local ou em rede para sincronização de contagem regressiva de blocos e relógio oficial de estúdio.
- **Arquitetura da PoC:**
  - Módulo cliente WebSocket no `servidor-api.mjs` conectando-se ao endpoint `/ws` do Ontime.
  - Sincronização em tempo real do evento atual, tempo restante do bloco e mensagem para apresentador.
  - Exibição de relógio de contagem regressiva na topbar de `mesa.html`.
  - Disparo opcional de trigger: ao faltar 5 segundos para o fim do bloco, armar automaticamente o VT de encerramento no Preview.
- **Critérios de Sucesso e Aceite:**
  1. Desvio de sincronismo entre o relógio do Ontime e a tela do 3Mix < 100 ms.
  2. Ausência de sobrecarga no loop de eventos do Node.js.

### PoC 4: Gateway MOS para Redações de Jornalismo NRCS (Sofie mos-connection & Quick-MOS)
- **Objetivo Técnico:** Validar o recebimento de espelho de telejornal de um NRCS emulado via Quick-MOS e mapeamento para os inputs e DSKs do 3Mix.
- **Arquitetura da PoC:**
  - Inicialização do serviço `mos-gateway.mjs` escutando nas portas TCP 10540-10542 via biblioteca `@mos-connection/connector`.
  - Conexão do Quick-MOS enviando uma mensagem `roCreate` contendo 5 notícias com VTs associados e créditos de GC.
  - O gateway interpreta a mensagem e popula a playlist do 3Mix em ordem cronológica de lauda.
- **Critérios de Sucesso e Aceite:**
  1. Recebimento e confirmação do handshake MOS com Quick-MOS com 100% de sucesso.
  2. Inserção ordenada dos itens de matéria na playlist e nos títulos com dados dinâmicos preservados.

### PoC 5: Pipeline Gráfico Padronizado OGraf com Renderização CEF
- **Objetivo Técnico:** Criar e executar um pacote gráfico Lower Third no formato OGraf da EBU no 3Mix via browser CEF.
- **Arquitetura da PoC:**
  - Criação de pacote com `ograf.json`, `index.html` e componentes Web padrão.
  - Implementação das funções JavaScript canônicas: `window.ograf = { load, play, update, stop }`.
  - Inserção do pacote em um input de Browser no 3Mix.
  - Controle via API do 3Mix: envio de chamadas `evaluateWebScript` para disparar as animações e atualizar textos sem recarregar a página web.
- **Critérios de Sucesso e Aceite:**
  1. Execução suave da animação de entrada e saída a 60 fps estáveis.
  2. Atualização de textos instantânea sem piscamento (flicker) de tela.
  3. Composição de transparência sem aberrações de halo preto nas bordas.

---

## 7. CONCLUSÕES E PRÓXIMOS PASSOS

A evolução do 3Mix não requer a reinvenção da roda nem a reescrita do motor nativo de vídeo C/C++. O ecossistema open source da EBU e da comunidade broadcast moderna oferece componentes maduros, testados em grandes redes públicas de televisão e com licenças permissivas.

A prioridade estratégica imediata reside na camada de **orquestração e controle** (Bitfocus Companion Nativo e Normalização de Áudio EBU R128 Pré-Fader), alavancando a estabilidade consolidada de 20 jobs de QA e pavimentando o caminho para o 3Mix conquistar o mercado profissional de switchers de produção broadcast.
```

---

O documento completo está pronto e à disposição para gravação direta em [`3mix-panel/docs/PESQUISA-OPEN-SOURCE-BROADCAST.md`](file:///d:/DRIVE/IA/antigravity/3Mix/3mix-panel/docs/PESQUISA-OPEN-SOURCE-BROADCAST.md) pelo agente mestre.

Permaneço à disposição para detalhar qualquer aspecto de implementação das PoCs ou aprofundar investigações adicionais.