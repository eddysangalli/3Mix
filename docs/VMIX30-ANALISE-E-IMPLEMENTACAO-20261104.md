# 3Mix — análise técnica da Preview vMix 30 (04/11/2026)

**Referência externa:** [vMix 30 Preview 30.0.0.22 — anúncio e changelog oficiais](https://forums.vmix.com/posts/t34492-vMix-30-Preview-Released). **Base 3Mix:** `main` em `7fd1b327` (02/11/2026). Este é um plano de engenharia para recursos próprios do 3Mix, não uma especificação para copiar interfaces, código ou restrições comerciais do vMix.

## Semântica do levantamento

- **Base:** há subsistema semelhante na fonte do 3Mix, sem implicar paridade nem homologação.
- **Parcial:** há uma implementação ou contrato incompleto para o comportamento solicitado.
- **Novo:** não foi encontrada implementação equivalente no escopo inspecionado; confirmar com busca ampliada antes da codificação.
- **Dependência:** exige motor C/C++, SDK, driver, firmware, GPU, hardware ou licença de terceiros e teste real.
- **Pronto nesta branch:** o código foi escrito e testado localmente, mas **não** instalado no runtime Windows do operador.

Não se deve prometer “suporta” a partir de um botão, mockup ou teste de unidade. Ler `docs/LIMITES-CONHECIDOS.md` antes de declarar uma função concluída. A tabela distingue novidade do vMix de lacuna do 3Mix; a versão numérica de bibliotecas de terceiros não é uma funcionalidade em si.

## Correção de auditoria — 2ª rodada (04/11/2026, tarde)

**Esta seção não substitui a matriz original abaixo; ela corrige classificações que a 1ª rodada
acertou de forma incompleta, com evidência concreta em código.** A matriz original é mantida
intacta por histórico; cada linha corrigida aqui recebeu uma marca `⚠️ ver correção` apontando
para este bloco. Estados usam o vocabulário de 8 categorias do superprompt de auditoria
(EXISTE E ESTÁ BOM / EXISTE E É SUPERIOR / EXISTE, MAS PODE MELHORAR / PARCIAL / CÓDIGO NÃO
INTEGRADO / NÃO EXISTE / DEPENDÊNCIA EXTERNA / NÃO COMPENSA).

### 1. MultiView — a 1ª rodada citou o arquivo errado como evidência

A linha original diz "Base: `multiview-engine.mjs`/montagens". Isso mistura **dois sistemas
diferentes**:

- **`painel/remoto/multiview-montagem.js` + `multiview-modelos.js` + `multiview.js`** (servido em
  `/multiview` e `/configuracoes?category=multiview`): é o MultiView **realmente usado**.
  Composição livre por arrastar/redimensionar com imã a bordas e a outros monitores
  (`imantar()`), até 48 tiles por montagem e 16 montagens salvas (`multiview-montagens.mjs`,
  `MAX_TILES=48`, `MAX_MONTAGENS=16`), qualquer tile pode ser Programa/Preview/Automático/
  Relógio/Entrada específica, formato 16:9/9:16/livre por tile, desfazer (pilha de 60 passos),
  guias de área segura, persistência atômica em `config/multiview-montagens.json`
  (`writeFile`+`rename`). **Classificação correta: EXISTE E É SUPERIOR** — já ultrapassa os
  layouts fixos de 10/12/24 do vMix 30, porque não limita a composição a um número fixo de
  caixas iguais.
- **`ferramentas/multiview-engine.mjs`** (classe `MultiViewEngine`, layouts
  `HORIZONTAL_16_9_STANDARD`/`STUDIO12`/`VERTICAL_9_16_MOBILE`/`VERTICAL_9_16_SOCIAL_FEED`/
  `QUAD_SPLIT`): está registrado em `/api/multiview` (`servidor-api.mjs:630-637`), mas **nenhuma
  tela do painel chama essa rota** (confirmado por busca em todo `painel/`: as únicas
  referências a `/api/multiview` fora do próprio servidor são na documentação estática
  `docs/api/indice-acoes.json` e `docs/api.html`). **Classificação correta: CÓDIGO NÃO
  INTEGRADO.** Não é "recurso ausente" — existe, roda, tem testes de módulo próprios — mas não
  está ligado a nenhuma interface, e **não compensa integrá-lo**: o sistema livre já cobre e
  supera o caso de uso que ele serviria (grades fixas), e conectar os dois criaria duas fontes
  de verdade para a mesma função.

**Implementado nesta rodada:** presets de grade rápidos (6, 8, 10, 12, 16, 24 entradas) em
`multiview-modelos.js`, como pontos de partida editáveis dentro do sistema livre — exatamente a
ressalva do superprompt ("se forem úteis, devem funcionar como pontos de partida editáveis"),
sem impor layout fechado. Ver seção "Lote de implementação" abaixo.

### 2. Áudio: RNNoise e NVIDIA — já é um gerenciador único, não dois

A linha original ("Base: mixer, filtros, buses e VST3; não presumir que o RTX esteja
integrado") é tecnicamente cautelosa mas subestima o que já existe:

- **RNNoise**: filtro nativo real `motor/plugins/obs-filters/noise-suppress-filter.c`
  (`noise_suppress_filter`, com RNNoise vendorizado em `rnnoise/src/denoise.c`), exposto no
  mesmo gerenciador único `AUDIO_FILTERS`/`filterSettings()` de
  `ferramentas/audio-routing-producao.mjs`, com UI em `painel/remoto/audio.html`/`audio.js`
  (opção RNNoise + 3 presets prontos: "Voz broadcast", "Limpeza neural", "Ambiente ruidoso").
  **EXISTE E ESTÁ BOM — preservar.**
- **NVIDIA Denoiser/Dereverb**: filtro nativo real `motor/plugins/nv-filters/nvidia-audiofx-filter.c`,
  com os 3 métodos (`denoiser`/`dereverb`/`dereverb_denoiser`) definidos em `nvafx-load.h` e
  troca de modelo em tempo real confirmada no `update()` nativo (`strcmp(ng->fx, method) != 0`
  reinicializa de verdade, não é campo cosmético). A detecção de hardware/SDK é real e nunca
  simulada: `FreeMixNvSdkPolicy.c` fixa hash SHA-256 das DLLs aprovadas por caminho absoluto, e
  o painel só habilita o filtro quando `GetSourceFilterKindList` confirma o `kind` disponível
  no motor conectado (`audio-routing-producao.mjs:88,111,158` — nunca um `enabled:true` sem essa
  checagem). **Isto já é o "único gerenciador de efeitos de áudio" que o superprompt pediu** —
  não há dois sistemas paralelos para corrigir.
- **Nota de coordenação importante:** no momento desta auditoria, uma **sessão paralela em
  execução simultânea** já havia exposto o enum `method` (Denoiser/Dereverb/Dereverb+Denoiser)
  na UI e no `filterSettings()`, além de desentrelaçamento de entrada e presets de transporte
  SRT — tudo registrado em `docs/STATUS-CREW-BROADCAST.md` (entradas de ~09:3x–10:2x de
  04/11/2026) e com teste próprio (`ferramentas/test-audio-filters-nvidia-method.mjs`, 8/8
  PASS citado nesse log). **Esse trabalho estava no working tree, não commitado**, no instante
  desta auditoria. Esta rodada não duplicou nem tocou esses arquivos (`audio-routing-producao.mjs`,
  `entradas-producao.mjs`, `audio.js`, `iniciar-3mix.mjs`) exatamente para não colidir com commit
  em andamento; a integração formal (commit/push) dessa frente é trabalho da sessão que a fez,
  não desta rodada de auditoria.
- **Headphones pós-Master-Fader**: não auditado a fundo nesta rodada por restrição de tempo.
  Não classificar como ausente nem como presente — registrar como **pendente de verificação**,
  não "NÃO EXISTE" por suposição.

### 3. Tally transitivo (Mix Inputs → M/E → saída) — mais maduro do que "Parcial" sugere

A linha original diz "Parcial: mix-effects, signal registry, tally". Evidência real:

- `ferramentas/controle-producao.mjs` (`visibleTree()`) percorre recursivamente a árvore de
  cenas do MAIN (grupos e cenas aninhadas, com guarda `visited.has(name)` contra ciclo).
- `ferramentas/registro-sinais-producao.mjs` (`meTally()`) faz **exatamente o mesmo algoritmo**
  para M/E 2–4, usando o Program/Preview UUID de cada M/E — não é um cálculo separado ou
  aproximado, é o mesmo método reaplicado por destino.
- `ferramentas/crew-tally-producao.mjs` (`CrewTallyEngine`) combina os dois por câmera
  (`input.key`, não por cena interna — o operador pensa "estou no ar", não "minha cena está em
  algum M/E"), resolve PROGRAM > PREVIEW quando uma câmera está em destinos diferentes
  simultaneamente, e devolve `DESCONECTADO` explícito (nunca um estado inventado) para
  dispositivos monitorando um M/E que não existe mais. Já existe suíte de teste dedicada e
  **exatamente o cenário do exemplo do superprompt** (câmera usada dentro de uma composição que
  está no Programa do M/E 2):
  `qa-finalizacao/inventario-crew-broadcast-20261103/testar-crew-tally-engine.mjs` (9/9 PASS,
  cobre prioridade PROGRAM>PREVIEW entre MAIN e M/E 2, e destino inexistente).
- Proteção contra ciclo/referência circular: existe no código (guarda `visited`), mas **sem
  teste dedicado que force um ciclo real** — lacuna pequena e específica, não do recurso todo.
- Tally físico (ESP32) consulta por nome de câmera e destino (`main`/`me2`/`me3`), mas nunca foi
  confirmado contra M/E 2–4 em hardware real nesta auditoria.

**Classificação correta: EXISTE E ESTÁ BOM** para o grafo de tally transitivo em software
(não é cálculo só de interface — lê o estado real do motor); **DEPENDÊNCIA EXTERNA** para a
confirmação física do tally passthrough em hardware de M/E 2–4; **EXISTE, MAS PODE MELHORAR**
para adicionar um teste que force um ciclo real (hoje só a guarda de código comprova a proteção).

### 4. Replay: jog/IDs/compatibilidade vMix já comitados; exportação de eventos é a lacuna real

A linha original agrupa "jog acelerado, exportação e comandos por ID" como um único item
"Base". Comitado em `3093ae1` (04/11, antes desta auditoria): swap, jump por segundos/quadros
com arredondamento racional de frame rate, jump-to-now, seleção de câmera, seleção/navegação de
evento, mark-in-out, e mapeamento completo dos comandos TCP do vMix (`ReplayJumpFrames`,
`ReplaySetSpeedChannelA/B`, `ReplaySelectCamera1-4` etc. — `servidor-api.mjs`, função `vmix()`),
com teste dedicado (`test-replay-vmix-api.mjs`). **EXISTE E ESTÁ BOM** para essa parte.

Busca explícita por exportação de eventos (todos ou selecionados) em `replay-disco.mjs` e
`servidor-api.mjs`: **não encontrada**. Não há ação `export`/`export-all`/`export-selected` para
eventos de Replay (distinto de `framespeed_exportar_takes`, que exporta takes de uma timeline de
edição, outro módulo). **Classificação correta: NÃO EXISTE** especificamente para exportação de
eventos — lacuna real, candidata a próxima rodada, não implementada nesta sessão por escopo.

### 5. Central de Saídas: "8 simultâneas" mistura duas perguntas diferentes

A arquitetura real tem mais saídas simultâneas no total do que a pergunta "4 ou 8" sugere: MAIN
M/E sempre ativo (fora da contagem das 4), M/E 2–4, AUX bus router, SDI com até 16 slots
(`outputs_sdi`, valida `slot` 0–15), NDI/OMT com até 4 senders cada, adaptador multi-RTMP
externo. **EXISTE E É SUPERIOR** em amplitude de transporte simultâneo. Mas o banco específico
de "destinos genéricos totalmente configuráveis" (protocolo/servidor/chave/encoder à escolha,
como o vMix oferece) está travado em 4 (`Array.from({length:4},...)` em
`saidas-producao.mjs:64`) — **PARCIAL** para esse sub-caso específico. Não alterado nesta rodada:
subir esse número exige medir throughput de encoder/rede reais, que o superprompt
explicitamente veda fazer sem essa comprovação ("Não aumente limites numéricos sem garantir que
as saídas funcionam").

## Matriz de paridade e ações

| Frente da Preview 30 | Situação do 3Mix nas fontes | Implementação/aceite exigido | Fase |
|---|---|---|---|
| Áudio: supressão de ruído por entrada/bus, RNNoise, RTX denoiser/dereverb ⚠️ ver correção §2 | Base: mixer, filtros, buses e VST3; não presumir que o RTX esteja integrado | RNNoise e NVIDIA (3 métodos) já no mesmo gerenciador único `AUDIO_FILTERS`, com detecção real de SDK/hardware — não recriar | 3, dependência |
| Áudio: escuta pós-fader Master | Base: roteamento/ASIO/WASAPI | Opção pré/pós separada para Headphones, ganho previsível e teste de monitor sem alterar o master no ar | 2 |
| Áudio: indicadores dinâmicos de pico | Base: medidores | Peak hold/decay com referência dBFS, clipping e limite de re-render; teste de queda de quadros | 1 |
| GT: espaçamento entre letras | Base: GC HTML/GTZIP/editor | Propriedade opcional no modelo de texto, render e persistência sem deformar templates existentes | 2 |
| GT: máscara alta qualidade/invertida | Parcial: `composicao-advanced-masks.mjs`, shaders e compositor | Inversão/alpha com teste de borda, premultiplicação, Fill/Key e GPU/CPU | 3 |
| GT: copiar propriedade de um elemento para vários | Base: editores de GC/composição | Comando transacional com seleção múltipla, undo e preservação do restante do template | 2 |
| GT: conta-gotas global | Novo/dependência Windows/CEF | Captura autorizada da tela/cor, com seleção visual e checagem de DPI/multimonitor | 3 |
| GT: edição múltipla e campo de cor vinculado a dados | Base: GC e `fontes-dados.mjs` | Edição em lote, `Text.Fill.Color` controlado por dados validados (CSS seguro); testes de persistência | 2 |
| Replay: 16 câmeras | Base: `replay-disco.mjs`, replay A/B | Capacidade real por perfil, limites SSD/CPU/encoder, 8/12/16 com retenção e teste de perda de quadros | 4, dependência |
| Replay: importação de clipes em canal dedicado | Base: playout/replay | Canal de clips distinto das capturas vivas, transcodificação sob demanda, timecode e A/V sync | 3 |
| Replay: API de eventos e tempos | Base: API/recuperação de eventos | Leitura estável/paginada por ID, duração, ângulos, timestamp, sem efeitos colaterais; versão de contrato | 2 |
| Replay: jog acelerado, exportação e comandos por ID ⚠️ ver correção §4 | Jog/ID/swap/jump: comitado (`3093ae1`), EXISTE E ESTÁ BOM. Exportação de eventos: busca confirmou NÃO EXISTE | Exportação de eventos (todos/selecionados) ainda não implementada — resto do item já entregue | 2–3 |
| Replay: autoplay ao mover velocidade acima de zero | Base: reprodução e timeline | Opção desabilitada por padrão, transições de estado e teste de zero↔jog↔play | 2 |
| Browser: Chromium 152 | Dependência de CEF/OBS, não simples troca de string | Verificar compatibilidade do CEF embarcado, GPU e sites; atualizar via projeto upstream e smoke test | 4, dependência |
| Saídas: 8 simultâneas ⚠️ ver correção §5 | EXISTE E É SUPERIOR em amplitude total (MAIN+M/E2-4+AUX+SDI 16 slots+NDI/OMT+multiRTMP); PARCIAL só no banco de 4 destinos genéricos configuráveis | Separar oito rotas lógicas de oito encoders/saídas físicas; perfis de capacidade e medição real | 4, dependência |
| DeckLink IP: 8→10 bits | Dependência SDK/placa | Negociação do formato e conversão controlada; padrões HDR/SDR e receptor real antes de liberar | 4 |
| Captura: AJA IP25/Kona X/Corvid 88 G3, DeckLink 16CH | Dependência SDK/driver/física | Matriz de descoberta, 16 canais, mapeamento e sincronização; nunca simular suporte à placa | 4 |
| NDI 6.3.2 e futuro NDI 6.4/MKV original | Base: `ndi-producao.mjs`/runtime; SDK/licença pendentes | Primeiro inventário da versão real; só depois gravação MKV que preserve metadata, vídeo e áudio, com roundtrip | 4, dependência |
| Vídeo: AV1 e FFmpeg recente | Base: motor OBS/FFmpeg | Detectar versão efetiva por binário e verificar 8/10 bits, alpha, áudio, seek e performance em amostras AV1 | 3 |
| PowerPoint sem Office e Presenter Mode | Novo/parcial: playout e slideshow | Importador isolado em sandbox, render determinístico, preview/PGM independentes, fontes/animações e sem Office | 4 |
| Listas: scroll, POS/REM/DUR, toggles e atalhos | Base: `media-playout-engine.mjs`/painel playout | Contadores por item habilitado e Auto Next, scroll sem mudar seleção, comandos e testes de fronteira | 2 |
| Fontes de dados: texto/número/milissegundos/data-hora | Base: `fontes-dados.mjs` e `painel/remoto/dados.js` | Formatação opcional por campo, locale/fuso explícitos, validação e persistência; manter API anterior | 2 |
| Mix Inputs: tally passthrough inclusive camadas ⚠️ ver correção §3 | EXISTE E ESTÁ BOM (grafo real via `visibleTree`/`meTally`/`CrewTallyEngine`, com teste do cenário exato câmera→composição→M/E→saída) | Teste dedicado de proteção a ciclo real; confirmação física do passthrough em M/E 2-4 | 3 |
| Production Clock: mensagem, menu de configuração e atalhos | Base: `painel/topbar.html`/`mesa.html` e relógios persistentes | **Mensagem curta por slot implementada nesta branch**; ainda faltam atalhos remotos e teste no Windows/CEF | 1 / 2 |
| MultiView: layouts 10/12/24 ⚠️ ver correção §1 | EXISTE E É SUPERIOR: composição livre real em `multiview-montagem.js` (não `multiview-engine.mjs`, que é CÓDIGO NÃO INTEGRADO — nenhuma tela chama `/api/multiview`) | **Implementado nesta rodada:** presets de grade 6/8/10/12/16/24 em `multiview-modelos.js`, como ponto de partida editável no sistema livre | 2–4 |
| Overlays: designer PiP, formas, bordas e alpha | Base: DSK, overlays e compositor | Geometria normalizada, máscaras, presets, preview real/PGM real e FPS sob múltiplos DSK | 3 |
| SRT 1.5.7, aspecto custom e streaming srt:// | Base: `saidas-srt.mjs`, RTMP/SRT e `configuracoes-producao.mjs` | Distinguir saída ponto-a-ponto de streaming para plataforma, validação de URI, monitor/ACK e receptor | 3 |
| Títulos: reordenação e exclusão em lote de presets | Base: GC e presets | IDs estáveis, desfazer/exclusão confirmada, preservação do projeto | 2 |
| Vídeo: 119,88 fps | Dependência do motor, captura e saída | Pipeline racional 120000/1001, timestamps e gravação/reprodução sem arredondar para 120 | 4 |
| Camadas: atalho SetLayerDynamic | Base: camadas, macros e atalhos | Comando 100% validado por ID/cena, indexação explícita e confirmação no motor | 2 |
| Editor de entrada: rolagem na visualização com zoom | Base: editor de entrada | Pan/scroll sem alterar Crop/Scale e controle de DPI/mousepad | 1 |
| Desentrelaçamento 1080i/576i/480i | Dependência FFmpeg/GPU | YADIF/BWDIF ou equivalente conforme motor; teste 50i→50p, latência e artefatos | 4 |

## Sequência técnica (não lançar tudo como um único toggle)

1. **Fase 1 — UX de baixo risco:** mensagens nos relógios, medidores com pico, navegação/zoom. Não alterar o caminho crítico AV. Mensagem implementada nesta branch, pendente CEF.
2. **Fase 2 — produtividade operacional:** dados tipados, listas, GT/editor, atalhos, Replay API e jog; versionar contratos e testes sem equipamento.
3. **Fase 3 — composição/replay em desenvolvimento:** máscaras, overlays, tally por M/E, supressão de ruído, clipes de Replay, SRT. Performance, latência e retrocompatibilidade obrigatórias.
4. **Fase 4 — arquitetura/hardware:** 8 saídas físicas, 16 câmeras Replay, NDI/MKV, DeckLink/AJA 16CH, Chromium/CEF, AV1/FFmpeg e 119,88 fps. Cada família exige uma máquina de teste, mídia de referência e relatório independente.

## Gates obrigatórios para considerar cada recurso entregue

1. **Código integrado** ao launcher/instalador real (não só em `painel/`, `ferramentas/` ou mockup).
2. **Contrato backend↔UI**: sucesso, erro, indisponibilidade, comando repetido, timeout e recuperação após reiniciar o motor.
3. **Não regressão**: MAIN M/E, Preview/PGM, DSK, áudio, replay, projeto e gravação antigos idênticos quando recurso desligado.
4. **Medição**: latência, CPU/GPU, memória, I/O e perdas de quadro segundo o tipo da função; nunca substituir teste de placa/CEF por mock.
5. **Produto**: documentação, teste de primeiro uso, migração de preset e rollback antes de publicar atualização a terceiros.

## Lote de implementação inicial — relógio com mensagem

- Adicionado tipo `message` à escolha de cada um dos três relógios, campo de 40 caracteres e persistência no slot já existente `freemix_clocks`.
- Atualização em tempo real continua usando `BroadcastCustomEvent`; renderização via `textContent`, protegendo contra HTML do operador.
- Indicador âmbar e truncamento visual em painéis compactos.
- `node ferramentas/test-clock-message.mjs` cobre normalização, truncamento, configuração presente e sintaxe das telas. **Não representa teste de CEF/OBS nativo**.
- Gate ainda aberto: rodar `ferramentas/test-relogios.mjs` com o motor real no Windows, incluindo reinício, janela flutuante e restauração da configuração anterior.

## Lote de implementação — 2ª rodada (04/11/2026, tarde): presets de grade no MultiView livre

- **O que foi feito:** 6 novos presets em `painel/remoto/multiview-modelos.js` (`MODELOS`):
  `h-6`, `h-8`, `h-10`, `h-12`, `h-16`, `h-24` — grades iguais de 6/8/10/12/16/24 tiles tipo
  `auto` (entrada automática pela ordem da mesa), monitor horizontal, cobrindo exatamente
  1920×1080 sem sobreposição. Cobrem a lacuna real (vMix 30 anuncia 10/12/24; o 3Mix já tinha 4
  e 9, mas não 6/8/10/12/16/24) sem impor limite — continuam sendo o ponto de partida de uma
  montagem 100% editável (arrastar, redimensionar, trocar formato por tile, salvar com outro
  nome), nunca um layout fechado.
- **O que NÃO foi feito, por decisão explícita:** nenhum preset vertical novo (o superprompt e a
  correção §1 só citam a lacuna em monitor horizontal; os verticais existentes — `v-empilhado`,
  `v-1-4`, `v-916` — já cobrem o uso real observado); nenhuma alteração em
  `multiview-montagem.js`/`multiview.js` (a UI de edição e a janela de exibição já suportam
  qualquer contagem de tiles sem mudança — só a lista de pontos de partida precisava crescer);
  nenhuma integração de `multiview-engine.mjs` (código não integrado, não compensa conectar —
  ver correção §1).
- **Teste:** `ferramentas/test-multiview-presets.mjs` (novo). Importa o arquivo de produção real
  via `node:vm` (mesmo padrão de `test-clock-message.mjs`, não um clone), e confirma: IDs sem
  colisão, os 9 presets pré-existentes intactos (zero regressão), as 6 grades novas com a
  contagem exata de tiles, geometria sem estouro de monitor nem sobreposição entre tiles, e
  `novaMontagem()` funcionando com o novo id. **12 asserções, todas PASS** (`node
  ferramentas/test-multiview-presets.mjs`). **Não é teste de motor/CEF** — a tela real
  (arrastar, salvar, abrir em `/multiview`) continua pendente de verificação visual com o motor
  ligado, registrado aqui como não homologado, não escondido.
- **Risco:** nenhum para projetos existentes — só adiciona entradas a um array de presets;
  nenhuma montagem salva é lida ou alterada por este código (presets só são aplicados quando o
  operador escolhe um no seletor "Modelo" da tela de edição).

## Limites do trabalho nesta branch

Este levantamento **não** declara as outras frentes implementadas. Algumas evidências históricas do repositório têm escopos ou datas conflitantes; verificar o runtime atual antes de editar o motor nativo. A Preview do vMix 30 é software de teste e suas escolhas de SDK, modelo comercial ou interface não devem ser reproduzidas automaticamente no 3Mix.
