# 3Mix — Matriz de Integração e Arquitetura do Núcleo Nativo

> Revisão de 08/10/2026: decisões de arquitetura e integrações propostas. Aitum, Branch Output, multiview livre, OMT, bonding e mixes independentes não foram incorporados ao executável atual. Multistream atual usa código 3Mix e encoders compartilhados; ISO usa Source Record. DistroAV 6.2.1 está apenas em staging, exige NDI Runtime 6.3+ e ainda não foi homologado no fork. Consulte `PENDENCIAS.md` para o estado verificável.

## 1. Visão Geral e Princípios Arquiteturais

O 3Mix evolui de um conjunto de scripts e painéis visuais para um ecossistema broadcast profissional estruturado sobre o OBS Studio 32 portátil. A premissa central é a **separação estrita de responsabilidades**, a **eliminação de controles cosméticos sem ação de motor** e o **desacoplamento formal entre conteúdo/composição e protocolo de transporte**.

```
                           +-------------------------------------+
                           |       Mesa de Operação 3Mix         |
                           |   (HTML / WebSocket / Native Qt)    |
                           +------------------+------------------+
                                              |
                   +--------------------------+--------------------------+
                   |                                                     |
       +-----------v-----------+                             +-----------v-----------+
       |   Matriz de Vídeo     |                             |    Matriz de Áudio    |
       +-----------+-----------+                             +-----------+-----------+
                   |                                                     |
      +------------+------------+                           +------------+------------+
      |            |            |                           |            |            |
   [ PGM ]      [ PVW ]     [ AUX 1/2 ]                  [ Master ]  [ Aux A: N-1 ] [ Aux B: Fones ]
 (Mix Princ.) (Mix Indep.) (Encaminhamento)               (Pista 1)    (Pista 2)      (Pista 3)
      |            |            |                           |            |            |
      +------------+------------+                           +------------+------------+
                   |                                                     |
                   +--------------------------+--------------------------+
                                              |
                             +----------------v----------------+
                             | Gerenciador Único de Saídas     |
                             | (Outputs & Transport Router)    |
                             +----------------+----------------+
                                              |
            +-----------------+---------------+-----------------+-----------------+
            |                 |               |                 |                 |
      [ Monitores ]     [ Câm. Virtual ]   [ Stream ]       [ DeckLink ]     [ NDI / OMT ]
      (Janela / Full)    (DirectShow)    (RTMP / SRT)       (SDI / 4K)       (IP Broadcast)
```

---

## 2. Diferenciação dos Três Recursos Fundamentais

Antes da integração de código de terceiros, a arquitetura do 3Mix distingue três conceitos frequentemente confundidos:

| Recurso | O que faz | Exemplo no 3Mix | Implementação no 3Mix |
| :--- | :--- | :--- | :--- |
| **AUX de Vídeo** | Encaminha uma fonte, cena ou corte selecionado diretamente para um destino físico ou virtual, sem composições ou cortes intermediários. | Telão do palco exibindo a Câmera 2 ou um PPT enquanto o PGM transmite outra cena. | Seletores `AUX 1` e `AUX 2` no topo da mesa conectam o sinal ao projetor ou canal NDI correspondente. |
| **Mix de Vídeo Independente** | Composição com ciclo de vida próprio, canais de Preview, Program, cortes, DVE e transições autônomas. | Produção simultânea de sinal horizontal (16:9 1080p) e sinal vertical (9:16 para redes sociais). | Abstração de múltiplos canvases (inspirada na estrutura do Aitum Stream Suite), desacoplada do canvas principal. |
| **Bus de Áudio** | Pista de soma que agrupa fontes selecionadas com controles de envio, fader master, mute e processamento dedicado antes da entrega ao destino. | Master (PGM), Aux A (Retorno Convidado com Mix-Minus N-1) e Aux B (Fones do Diretor). | Pistas de áudio do motor OBS (Tracks 1 a 6) acionadas via `SetInputAudioTracks` e gerenciamento no mixer. |

---

## 3. Inventário Técnico dos Projetos e Decisões de Integração

A reutilização de código segue critérios rigorosos de **responsabilidade única**, **compatibilidade de licença** e **ausência de dependências parasitárias**:

| Projeto de Referência | Parte de Interesse | Licença | Decisão de Integração no 3Mix | Justificativa Técnica |
| :--- | :--- | :--- | :--- | :--- |
| **Aitum Stream Suite** | Múltiplos canvases, gerenciamento de pipelines de saída. | GPL-2.0 | **Adotar como modelo de múltiplos mixes de vídeo independentes.** Extrair a lógica central de renderização em canvas secundário, dispensando interfaces de usuário em Qt duplicadas. | Permite saídas verticais e secundárias limpas sem interferir no render loop principal do OBS. |
| **obs-multi-rtmp** | Gerenciamento de múltiplos endpoints RTMP e compartilhamento de encoder de vídeo. | GPL-2.0 | **Incorporar ao gerenciador central de saídas.** Apenas a camada de despacho e multiplexação de streams; não manter painel flutuante separado. | Compartilha o mesmo encoder NVENC/QuickSync entre múltiplos servidores (YouTube, Twitch, CDN privada). |
| **Branch Output** | Filtro de saída isolada por fonte ou cena específica (gravação/streaming de elemento unitário). | GPL-2.0 | **Aproveitar para canais dedicados de gravação ISO e saídas pontuais.** Integrar ao subsistema MultiCorder do 3Mix. | Permite que uma câmera seja transmitida via SRT ou gravada em disco sem passar pela composição de cena. |
| **OBS Advanced Multiview** | Composição de layouts em grade flexíveis, medidores de áudio na tela e sinalização de Tally. | GPL-2.0 | **Reaproveitar a composição de mosaico para a saída MULTIVIEW da Central de Saídas.** | Evita que o 3Mix precise reinstrumentar a renderização de matriz multiview. Conecta a grade diretamente ao projetor ou NDI. |
| **DistroAV (obs-ndi)** | Descoberta (mDNS), recepção e emissão de pacotes NDI de alta performance. | GPL-2.0 (código) + NDI EULA (runtime) | **Integrar o backend de envio NDI na Central de Saídas.** Compatibilidade com runtime NDI 5/6 instalado no sistema. | O operador ativa o NDI com suporte a canal alfa (transparência Fill + Key para gerador de caracteres). |
| **omtplugin / libomt** | Transporte Open Media Transport (OMT) de altíssima fidelidade e ultra-baixa latência. | GPL-2.0 | **Priorizar a integração via `libomt` como backend nativo de rede.** | Formato moderno de transporte broadcast IP de código aberto, livre de royalties e com desempenho superior em redes locais. |
| **Decklink Output Filter** | Saída para placas Blackmagic Design DeckLink (SDI / HDMI). | GPL-2.0 (código) + BM SDK | **Integrar ao backend da Central de Saídas com diagnóstico estrito.** Se os drivers do Desktop Video não estiverem presentes, o 3Mix marca o canal como indisponível e explica a razão. | Não simular hardware ausente nem travar o OBS caso a placa não esteja conectada. |
| **atkAudio** | Audio Source Mixer e grafo PluginHost2. | **AGPL-3.0 + JUCE** | **NÃO incorporar código diretamente.** O uso de JUCE e AGPL-3.0 traz risco de contaminação viral e overhead excessivo de memória. **Modelar submixes nativamente via `libobs-audio`**. | O 3Mix permanece limpo sob GPLv2 e com dependências estritamente controladas. |
| **MixTrack2Source** | Conversão de faixas de áudio em fontes utilizáveis para encadeamento de filtros. | GPL-2.0 | **Referência para inserção de compressores e limiters em buses de saída.** | Permite tratar a soma do bus (Aux A ou Master) com equalização ou limiter antes da transmissão. |
| **Audio Monitor** | Roteamento de áudio para dispositivos físicos Wasapi/DirectSound sem interferir no PGM. | GPL-2.0 | **Backend de monitoração da saída Aux B (Fones do Operador / Direção).** | Garante que o diretor possa ouvir qualquer fonte ou bus de retorno sem alterar a mixagem do ar. |

---

## 4. Matriz de Buses de Áudio e Mix-Minus (N-1 Real)

### O Problema do Eco em Chamadas Remotas
Quando um convidado remoto (via VDO.Ninja ou WebRTC) participa da transmissão:
1. Se ele receber o áudio **Master (PGM)** puro, ele ouvirá sua própria voz com atraso de rede (latência de ida e volta), tornando a conversa inviável.
2. A exclusão de sua voz **NUNCA** deve ser feita subtraindo o áudio após compressores ou no destino, pois o processamento dinâmico altera a forma de onda e cria artefatos.
3. A exclusão deve ser feita na matriz de soma: **a fonte de áudio do próprio convidado é desmarcada do envio para a pista de retorno (Aux A)**.

### Matriz Mínima de Produção (2 Convidados + Estúdio + VT)

| Fonte de Áudio | Master (PGM - Pista 1) | Retorno Convidado A (Aux A - Pista 2) | Retorno Convidado B (Aux A' / Pista 4) | Fones Direção (Aux B - Pista 3) |
| :--- | :---: | :---: | :---: | :---: |
| **Microfone Estúdio** | SIM (No Ar) | SIM | SIM | SIM |
| **VT / Trilha / Mídia** | SIM (No Ar) | SIM | SIM | SIM |
| **Convidado A (Remoto)**| SIM (No Ar) | **NÃO (Mix-Minus)** | SIM | SIM |
| **Convidado B (Remoto)**| SIM (No Ar) | SIM | **NÃO (Mix-Minus)** | SIM |
| **Talkback Direção** | NÃO (Fora do Ar) | Sob Comando | Sob Comando | SIM |

### Implementação Concreta no 3Mix
- **Pista 1 (Master / M)**: Transmissão principal para RTMP, Gravação e Saídas PGM.
- **Pista 2 (Aux A / A)**: Bus de Retorno com Mix-Minus ativo.
- **Pista 3 (Aux B / B)**: Monitoração independente de controle/fones.
- **Automação de 1 Clique**: No modal 3Mix Call, o botão `⚡ Aplicar Mix-Minus Automático` configura dinamicamente `SetInputAudioTracks` via WebSocket em todas as fontes ativas:
  - Fonte da chamada: `Tracks = { "1": true, "2": false, "3": true }`.
  - Demais fontes: `Tracks = { "1": true, "2": true, "3": true }`.
- **Links WebRTC**: O link de retorno é emitido com `&view=${id}_ret&mixminus=1`, ativando o cancelamento complementar de eco no cliente WebRTC.

---

## 5. Gerenciador Único de Saídas (Outputs Manager)

O 3Mix centraliza todas as saídas no modal `Central de Saídas (External)` e nos seletores de topo `AUX 1` e `AUX 2`:

1. **Ciclo de Vida Formal**:
   - `stopped`: Saída configurada, porém inativa.
   - `starting`: Inicialização de hardware ou handshake de rede em curso.
   - `active`: Quadro e áudio transmitidos no ar (badge verde e contador ativo).
   - `reconnecting`: Tentativa de reconexão automática de rede.
   - `failed`: Erro de transmissão com código diagnóstico.
   - `unavailable`: Hardware ou driver não encontrado no host (ex: DeckLink sem placa conectada).
2. **Clean Feed de Vídeo**:
   - Opção de rotear o corte base do switcher desconsiderando os canais DSK 1 a 4 (GC, placar, logotipos), entregando um sinal limpo para telões e gravações de arquivo.
3. **Persistência**:
   - As configurações de cada saída (origem, destino, resolução, taxa de quadros e rota de áudio) são persistidas localmente no perfil operacional.
