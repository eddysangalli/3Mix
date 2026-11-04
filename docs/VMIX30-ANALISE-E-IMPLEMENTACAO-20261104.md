# 3Mix — análise técnica da Preview vMix 30 (04/11/2026)

**Referência externa:** [vMix 30 Preview 30.0.0.22 — anúncio e changelog oficiais](https://forums.vmix.com/posts/t34492-vMix-30-Preview-Released). **Base 3Mix:** `main` em `7fd1b327` (02/11/2026). Este é um plano de engenharia para recursos próprios do 3Mix, não uma especificação para copiar interfaces, código ou restrições comerciais do vMix.

## Semântica do levantamento

- **Base:** há subsistema semelhante na fonte do 3Mix, sem implicar paridade nem homologação.
- **Parcial:** há uma implementação ou contrato incompleto para o comportamento solicitado.
- **Novo:** não foi encontrada implementação equivalente no escopo inspecionado; confirmar com busca ampliada antes da codificação.
- **Dependência:** exige motor C/C++, SDK, driver, firmware, GPU, hardware ou licença de terceiros e teste real.
- **Pronto nesta branch:** o código foi escrito e testado localmente, mas **não** instalado no runtime Windows do operador.

Não se deve prometer “suporta” a partir de um botão, mockup ou teste de unidade. Ler `docs/LIMITES-CONHECIDOS.md` antes de declarar uma função concluída. A tabela distingue novidade do vMix de lacuna do 3Mix; a versão numérica de bibliotecas de terceiros não é uma funcionalidade em si.

## Matriz de paridade e ações

| Frente da Preview 30 | Situação do 3Mix nas fontes | Implementação/aceite exigido | Fase |
|---|---|---|---|
| Áudio: supressão de ruído por entrada/bus, RNNoise, RTX denoiser/dereverb | Base: mixer, filtros, buses e VST3; não presumir que o RTX esteja integrado | Adaptador de filtro com estado e bypass, controle de latência, feature detection e A/B PCM com CPU/GPU/sem RTX | 3, dependência |
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
| Replay: jog acelerado, exportação e comandos por ID | Base: replay/cadence/atalhos | Três curvas de aceleração configuráveis, exportar todos/selecionados, seleção/edição por ID, ACK e rejeições | 2–3 |
| Replay: autoplay ao mover velocidade acima de zero | Base: reprodução e timeline | Opção desabilitada por padrão, transições de estado e teste de zero↔jog↔play | 2 |
| Browser: Chromium 152 | Dependência de CEF/OBS, não simples troca de string | Verificar compatibilidade do CEF embarcado, GPU e sites; atualizar via projeto upstream e smoke test | 4, dependência |
| Saídas: 8 simultâneas | Base: Central de Saídas, multiRTMP, AUX/M/E e SDI | Separar oito rotas lógicas de oito encoders/saídas físicas; perfis de capacidade e medição real | 4, dependência |
| DeckLink IP: 8→10 bits | Dependência SDK/placa | Negociação do formato e conversão controlada; padrões HDR/SDR e receptor real antes de liberar | 4 |
| Captura: AJA IP25/Kona X/Corvid 88 G3, DeckLink 16CH | Dependência SDK/driver/física | Matriz de descoberta, 16 canais, mapeamento e sincronização; nunca simular suporte à placa | 4 |
| NDI 6.3.2 e futuro NDI 6.4/MKV original | Base: `ndi-producao.mjs`/runtime; SDK/licença pendentes | Primeiro inventário da versão real; só depois gravação MKV que preserve metadata, vídeo e áudio, com roundtrip | 4, dependência |
| Vídeo: AV1 e FFmpeg recente | Base: motor OBS/FFmpeg | Detectar versão efetiva por binário e verificar 8/10 bits, alpha, áudio, seek e performance em amostras AV1 | 3 |
| PowerPoint sem Office e Presenter Mode | Novo/parcial: playout e slideshow | Importador isolado em sandbox, render determinístico, preview/PGM independentes, fontes/animações e sem Office | 4 |
| Listas: scroll, POS/REM/DUR, toggles e atalhos | Base: `media-playout-engine.mjs`/painel playout | Contadores por item habilitado e Auto Next, scroll sem mudar seleção, comandos e testes de fronteira | 2 |
| Fontes de dados: texto/número/milissegundos/data-hora | Base: `fontes-dados.mjs` e `painel/remoto/dados.js` | Formatação opcional por campo, locale/fuso explícitos, validação e persistência; manter API anterior | 2 |
| Mix Inputs: tally passthrough inclusive camadas | Parcial: mix-effects, signal registry, tally | Grafo de fontes realmente usadas, deduplicação/ciclos, evento de tally e testes multi-M/E | 3 |
| Production Clock: mensagem, menu de configuração e atalhos | Base: `painel/topbar.html`/`mesa.html` e relógios persistentes | **Mensagem curta por slot implementada nesta branch**; ainda faltam atalhos remotos e teste no Windows/CEF | 1 / 2 |
| MultiView: layouts 10/12/24 | Base: `multiview-engine.mjs`/montagens | Presets configuráveis conforme aspecto, sem preview duplicado nem limitação artificial a 8; carga em 24 fontes | 2–4 |
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

## Limites do trabalho nesta branch

Este levantamento **não** declara as outras frentes implementadas. Algumas evidências históricas do repositório têm escopos ou datas conflitantes; verificar o runtime atual antes de editar o motor nativo. A Preview do vMix 30 é software de teste e suas escolhas de SDK, modelo comercial ou interface não devem ser reproduzidas automaticamente no 3Mix.
