# 3Mix — Central de Saídas, Roteamento e Vídeo Profissional

> Estado conferido em 08/10/2026: este documento descreve a arquitetura alvo. A matriz independente completa ainda não foi entregue. Executável atual: projetores e câmera virtual reais; RTMP principal e até quatro destinos extras com vídeo/áudio/encoders compartilhados. Escolher conteúdo/qualidade por destino, mixes horizontal/vertical e transportes profissionais permanecem na lista `PENDENCIAS.md`. Não interpretar as capacidades projetadas abaixo como recursos homologados.

## 1. Visão Geral da Arquitetura

A Central de Saídas projetada deve desacoplar a **Origem de Conteúdo** do **Meio de Transporte (Destino)**.

Em produções ao vivo profissionais (padrão broadcast/vMix), a mesa de corte não deve limitar o envio de sinais apenas ao sinal de Programa principal. A Central de Saídas gerencia múltiplos feeds simultâneos com canais de áudio, resoluções, taxas de quadros e opções de canal alfa (Fill + Key) específicos por destino.

---

## 2. Matriz de Roteamento: Conteúdo vs Transporte

### 2.1 Origens de Vídeo Suportadas
| Origem | Comportamento e Roteamento | Canal Alfa | Tratamento de Áudio |
|---|---|---|---|
| **Program** | Sinal final no ar incluindo cortes, transições e sobreposições ativas de Downstream Keyer (DSK). | Opcional | Master Bus |
| **Preview** | Próxima entrada preparada para entrar no ar. | Não | Mute (padrão) |
| **Clean Feed** | Sinal do Programa limpo, contendo os mesmos cortes de câmeras e mídias, porém **sem logotipos, placares ou lower-thirds do DSK**. Mapeado para a cena base ativa sem as sobreposições de overlay. | Sim (se cena permitir) | Master Bus |
| **Multiview** | Mosaico composto de câmeras, preview, programa e medidores de áudio para direção de TV. | Não | Mute |
| **Entrada / Cena Específica** | Feed isolado (ISO) de uma câmera, convidado remoto (3Mix Call) ou vídeo dedicado. | Depende da fonte | Canal isolado da entrada |

### 2.2 Destinos de Transporte e Mapeamento de APIs

| Destino | Mecanismo OBS / API | Capacidade Real | Limitação Técnica / Nota de Engenharia |
|---|---|---|---|
| **Monitores e Projetores** | `OpenVideoMixProjector`<br>`OpenSourceProjector`<br>`GetMonitorList` | Fullscreen em monitores reais (0..N) ou Janela Flutuante (-1). Suporta Program, Preview, Multiview e Fontes/Cenas. | OBS WebSocket v5 **não** possui chamada para fechar projetores abertos. O ciclo de vida fechamento/reposicionamento avançado requer gestão pelo plugin nativo 3Mix. |
| **Câmera Virtual** | `StartVirtualCam`<br>`StopVirtualCam`<br>`GetVirtualCamStatus` | DirectShow Virtual Device para Teams, Zoom, vMix e navegadores web (1080p, sem áudio). | 1 saída global por instância OBS. |
| **Transmissão (RTMP / SRT)** | `StartStream`<br>`StopStream`<br>`GetStreamStatus` | Transmissão primária com codificação por hardware (NVENC/QSV/x264). Métricas reais: bitrate, timecode, drops, congestionamento. | Configurada no perfil de streaming ativo. |
| **Multistream** | `FreeMixMultistream.cpp`, outputs RTMP nativos | Principal + quatro extras compartilham vídeo, áudio e encoders. | Origem, qualidade e áudio independentes ainda precisam de implementação e recepção simultânea de dois conteúdos distintos. |
| **DeckLink / SDI** | `decklink.dll` / `decklink-output-ui.dll` | Saída SDI/HDMI em placas Blackmagic Design. Suporta vídeo normal, Fill + Key Externo (2 canais SDI síncronos) e Keyer Interno. | **Requer hardware físico e drivers Blackmagic Desktop Video**. Quando ausente, a Central reporta estado `indisponível` com diagnóstico explícito. |
| **NDI (DistroAV)** | DistroAV 6.2.1 portátil x64, OBS 31.1.1+, NDI Runtime 6.3+ | Plugin oficial baixado e hash conferido; ainda não carregado no 3Mix. | Nesta máquina foram detectados runtimes 5.5.4 e 4.5.1; runtime 6.3+ não confirmado. DLL/dados do plugin e runtime são dependências distintas. Validação de recepção/envio/áudio/tally/alpha ainda pendente. |
| **OMT (Open Media Transport)** | `omtplugin.dll` | Transporte IP ultrarrápido aberto com áudio multicanal e suporte a transparência. | Requer módulo compilado do OMT no diretório de plugins. |

---

## 3. Estados Operacionais Padronizados

Cada saída possui uma máquina de estados rigorosa:
- **`indisponível`**: Hardware ausente (ex: DeckLink sem placa instalada) ou plugin/runtime não carregado. A interface impede comandos inválidos e explica a limitação.
- **`parada`**: Saída configurada e pronta, mas atualmente inativa.
- **`iniciando`**: Comando aceito pelo 3Mix; aguardando confirmação empírica de início do transporte.
- **`ativa`**: Transporte confirmado como transmitindo ativamente (com métricas reais quando fornecidas pelo backend).
- **`reconectando`**: Queda temporária de link de rede ou buffer esgotado (ex: RTMP stream congestionado).
- **`falha`**: Erro fatal de inicialização, conflito de dispositivo ou rejeição pelo hardware.

---

## 4. Fill + Key para Caracteres (GC) Externos

Quando operando com DeckLink ou NDI para geradores de caracteres externos:
1. **Composição com Alpha**: A cena/fonte de GC contém elementos com transparência nativa (PNG com alfa, HTML/Browser com background transparente).
2. **Fill + Key Externo**: 
   - Canal SDI A (Fill): Imagem RGB com corte e cores pré-multiplicadas.
   - Canal SDI B (Key): Canal alfa extraído em escala de cinza de alta precisão (0..255).
   - O sincronismo entre Fill e Key é travado quadro a quadro pelo hardware da placa DeckLink.
