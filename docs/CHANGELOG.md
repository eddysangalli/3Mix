## Alpha 0.1.1 · 03/11/2026

- Atraso e DUMP de verdade: a transmissão sai com alguns segundos de atraso e o DUMP descarta o trecho que ainda não foi ao ar. Botão na barra da mesa e na Mesa de corte, com dois cliques, e configuração em Configurações › Transmissão › Atraso e DUMP.
- Depois do DUMP a imagem fica parada por cerca do tempo do atraso e volta já protegida. Com o atraso ligado, a transmissão usa keyframe a cada 2 s quando estava em automático.
- O DUMP só confirma quando o motor descartou de fato; sem atraso ativo, ele avisa e não finge.
- Configurações abrem mesmo em computador sem câmera virtual.

## Alpha 0.1.0 · 02/11/2026

- Primeira versão numerada do 3Mix, com instalador próprio.
- Multi-M/E: até 3 M/Es além do Programa, em aba própria ou janela separada, com formato, transição e duração por M/E.
- O PGM de cada M/E vira uma entrada, reutilizável em outros M/Es, composições, Patch e Multiview.
- Botoeiras escolhem PV ou PGM e o M/E de cada uma, com botoeiras extras e monitores que podem ser desligados.
- Saídas por M/E: transmissão, gravação, NDI, SRT e câmera virtual escolhem o conteúdo.
- Até 16 saídas DeckLink, cada uma com placa, modo, conteúdo e áudio próprios. Ainda sem teste com placa.
- Atraso de áudio e de vídeo por entrada, no menu da entrada.
- Plugins VST3 de 64 bits no mixer e nos barramentos, com a janela do próprio plugin.
- master_me e PodcastPlugins embutidos no mixer.
- Mixer com inspetor compacto: efeitos do canal sempre à vista, e cada canal mostra quantos estão ativos.
- Multiview com montagem livre em Configurações, monitor vertical e relógio de produção.
- Faixa de estado na mesa: gravação, Replay, transmissão, saídas, câmera virtual e retornos.
- Remoto com o endereço de rede e o QR de cada módulo.
- Corrigido: M/Es paravam de aceitar comandos depois de cerca de 128 cortes, e a faixa travava depois de um comando recusado.
- Corrigido: M/E com transição escolhida parava de cortar depois de reabrir o 3Mix.
- Corrigido: a janela dos plugins VST2, como PodcastPlugins e master_me, ficava congelada, sem medidores nem animação.

## Antes do Alpha 0.1.0

## 02/11/2026 — Multi-M/E no programa e nomes 3Mix

- Aba M/E ao lado de Fontes e seletor de M/E nas botoeiras do topo. O botão antigo "M/E Strips" ficava dentro de uma barra escondida e nunca aparecia.
- Motor compilado do `main` instalado, com o núcleo de M/E e nesting.
- Cenas, fontes e filtros internos passam de "FreeMix ..." para "3Mix ...". Projetos existentes migram ao abrir, com cópia `.pre-3mix`. Identificadores de formato de arquivo e de protocolo não mudam.
- O Programa de cada M/E vira a entrada "PGM M/E N", reutilizável em outros M/Es, composições, Patch e Multiview.
- Abas Entradas, Composições e M/E; cada botoeira escolhe PV ou PGM e o M/E, com botoeiras extras e miniaturas desligáveis; M/E em janela separada, com monitores desligáveis.
- O 3Mix abre com a janela visível, não mais escondido na bandeja. A mesa volta a carregar a Strip dentro do motor.
- Formato, transição e duração por M/E na aba M/E; seletor de M/E na Mesa de corte em janela.
- M/E nasce no formato da produção; formato diferente entra inteiro no quadro, sem cortar.
- A saída do M/E mantém a imagem depois de reconfigurar, trocar de projeto e reiniciar; antes ficava preta até o próximo corte.
- Rotas em ciclo entre M/Es são recusadas. AUTO deixa de bloquear o M/E enquanto a transição termina. O Patch salva o projeto ao concluir.
- AUX avisa quando a saída no ar recusou a troca de sinal.
- Entrada só de áudio mede e entra na mistura sem depender de corte; mic junto de câmera segue a cena dela e entrada criada no ar nasce muda.
- Fontes do motor passam a ficar em `motor/`, no mesmo repositório.
- master_me e PodcastPlugins (Track e Master) embutidos: rack DSP, aba Plugins do mixer, inclusive no Master e nos barramentos, com a janela própria de cada um.
- Corrigido: o M/E com transição escolhida parava de cortar depois de reabrir o 3Mix, porque o identificador da transição muda a cada abertura. Agora ele a recupera pelo nome e, se ela não existir mais, volta à padrão.
- Corrigido: depois de cerca de 128 cortes na mesma sessão, os M/Es paravam de aceitar comandos até reiniciar o 3Mix. Corrigido também: depois de um comando recusado, a faixa do M/E não enviava mais nada.
- Mixer: inspetor compacto, com Ganho, Pan e Delay lado a lado e os efeitos do canal sempre à vista, na ordem real, para ligar, ajustar, abrir e remover. Cada canal mostra quantos efeitos estão ativos.
- Câmera virtual escolhe o conteúdo: Programa, entrada ou PGM de M/E.
- Até 16 saídas DeckLink, cada uma com placa, modo, conteúdo e áudio próprios, incluindo o PGM de qualquer M/E. A tela de Saídas passa a chamar os mixes de M/E. Ainda sem teste com placa.
- Plugins VST3 de 64 bits no mixer e nos barramentos, com a janela do próprio plugin e ajuste preservado depois de uma queda do motor.
- Atraso de áudio e vídeo por entrada, no menu da entrada, medido quadro a quadro em gravação.
- Pacote alpha em ZIP: projeto inicial "3Mix", instruções para quem testa e logs pelo WhatsApp.
- `aux.html` e `aux.js` passam a `aux-router`, porque AUX é nome reservado no Windows. O endereço `/aux` não muda.

## 02/11/2026 — Hub, Mesa de corte, Composições, GC, Rede e reorganização de Efeitos

- Hub/Remoto: cartões com ícone, seletor no alto entre este computador, cada rede (com o nome do adaptador) e internet. O IP público só é consultado (api.ipify.org) quando o operador escolhe Internet.
- Mesa de corte: Preview e Programa com imagem real e na proporção da produção; entradas com miniatura; DUMP com confirmação em dois cliques; Pre-Flight abre a janela própria.
- Composições: galeria corrigida (cartões sobrepostos), miniaturas neutras, imagem da composição no alto.
- GC e placar: redesenhado no padrão; monitor em 16:9 ou 9:16 com transparência quadriculada; o fundo verde era a classe de tally `.preview`.
- Rede Multipath: tela refeita e nova aba em Configurações › Sistema; saiu do Hub.
- Qualidade de imagem foi para o Color Studio (aba Qualidade), e o menu de cada entrada abre "Cor e qualidade" naquela entrada. Face Tracker foi para a tela de PTZ. Efeitos fica com Voz, Legendas e Efeitos criativos.
- Telas `.vd` passam ao padrão pelo `vmix-dialogo.css`: janela inteira, sem caixa flutuante, e a marca no cabeçalho das que têm faixa de título.
- Corrigido: "Configurar" e "Filtros" no menu da entrada recusavam toda entrada ("cena não confirmada"), porque a checagem lia o nome da fonte em vez do dono.
- Nova coleção "Demonstracao Compacta": CAM 1 a 4, VT, Replay A e B, Legendas locais.

## 02/11/2026 — Multi-M/E: Fade, Patch e Switcher Strip aplicados ao runtime, todos confirmados reais

- Switcher Strip atualizada (Bank por categoria, Audio Bus por M/E, Tally recursivo) copiada ao runtime do operador — a versão anterior (sem esses recursos) foi substituída, com backup.
- Fade real em M/E confirmado de ponta a ponta contra o motor do operador: comando aceito (`accepted-in-flight`), transição completa confirmada (`programUuid` atualizado, `transitioning:false` ao final).
- Patch confirmado de ponta a ponta: um Input recebeu o conteúdo de outro signal de verdade (confirmado pela leitura direta da cena, não só pelo registro de metadado) e o registro persistiu (`GET /api/patch`).
- Com isso, Preview/Cut/Fade/Patch de M/E 2-4 estão todos confirmados funcionando no motor real. Resta como pendência separada só a decisão sobre o binário com proxy/nesting (não aplicado ao runtime).
- Detalhe completo: `qa-beta/STATUS-BETA.md`, `FreeMix/docs/LIMITES-CONHECIDOS.md` seção 4.

## 02/11/2026 — Coleta do alpha, Hub e limpeza do nome

- Relatar problema: formulário com o que aconteceu, passos, esperado, impacto, frequência, nome e contato; o pacote agora traz `RELATO.txt`, placa de vídeo e driver, disco, estado no momento, últimas ações da sessão, erros das telas, resumo dos crashes e hash dos binários. Destino configurável em `config/suporte.json`; botão para abrir a pasta do ZIP.
- Toda tela do painel registra os próprios erros em `logs/painel-erros.ndjson` (`/api/panel-log`). Páginas de GC que vão ao ar ficam de fora.
- Mesa: aviso **ERRO NA ÚLTIMA SESSÃO** depois de um fechamento com erro ainda não relatado.
- Hub: corrigido o erro que abria os módulos pelo IP da rede com o acesso pela rede desligado. Neste computador os módulos abrem pelo endereço local; endereço, QR e código só aparecem quando a rede responde; botão **Ligar rede** (`/api/network-enable`, confirmação do Windows, vale ao reabrir).
- Nome: textos da bandeja e dos menus do motor na instalação, mensagens do servidor, instalador, desinstalador, atalhos, nomes dos `.cmd` do pacote e textos nativos passam a 3Mix. Os textos nativos valem na próxima compilação. Ficam `FreeMix.exe` e os nomes de contrato (fontes de áudio, filtros, formato de arquivo).
- Sobre e Hub deixam de apontar para o manual técnico interno.
- Verificação em `qa-interface/alpha-coleta-20261102/` e `qa-interface/nome-3mix-20261102/`.

## 02/11/2026 — Multi-M/E: camada JS integrada ao runtime, Preview/Cut confirmados no motor real

- Rotas `/api/mix-effects`, `/api/signals`, `/api/patch` e `/api/mix-audio` (antes sempre retornavam erro na instalação do operador) agora respondem com sucesso: os 5 módulos JS (`mix-effects-producao.mjs`, `mix-effects-http.mjs`, `registro-sinais-producao.mjs`, `patch-registry-producao.mjs`, `mix-audio-producao.mjs`) e `controle-producao.mjs` foram copiados da fonte ao runtime, com backup e validação de sintaxe/import antes de aplicar.
- `MixEffectsEngine` unificado: `OutputEngine` e `SignalRegistryEngine` agora compartilham uma única instância (antes cada um criava a sua, divergindo o estado de recibos entre o caminho HTTP e o Signal Registry).
- Preview e Cut reais confirmados contra o motor do operador (não só em QA isolado): M/E 2 recebeu preview + cut de uma câmera real, M/E 3 teve seu preview corrigido (estava apontando para uma UUID órfã de um teste anterior). Os dois estados **persistiram através de dois reinícios completos do motor**, confirmando que o M/E 2-4 (já existente no motor como código legado do fork, antes desta frente) preserva corretamente program/preview entre restarts.
- Fade, Patch de ponta a ponta e a Switcher Strip atualizada (ainda na versão antiga no runtime — sem Bank por categoria, Audio Bus ou Tally — cópia pendente de autorização) continuam sem prova funcional completa nesta instalação.
- O núcleo nativo com proxy/nesting (identidade pública estável por M/E, permitindo usá-lo como fonte) continua só em binário de QA isolado; não foi aplicado ao runtime — decisão separada, ainda pendente.
- Detalhe completo, recibos e hashes: `qa-beta/STATUS-BETA.md`, `qa-beta/recibos/auditoria-multi-me-20261101.md`, `qa-beta/recibos/watchdog-reabertura-motor-20261102.json`.

## 02/11/2026 — Montagem do Multiview, Sobre e suporte, docks e faixa de estado

- Configurações › Multiview virou a tela de montagem (monitor horizontal ou vertical, posição e conteúdo de cada monitor, relógio, modelos, várias montagens). A janela /multiview só exibe a montagem salva em `config/multiview-montagens.json`, novo módulo `ferramentas/multiview-montagens.mjs`.
- Última categoria "Sobre e suporte" reúne versão, atualizações, diagnóstico, novidades e créditos; os scripts antigos aceitam prefixo de id.
- Remoto: lista de módulos com endereço de rede, copiar e QR por módulo. Só entram páginas medidas pelo IP com `testar-rede.mjs`.
- Servidor: `/api/qr.svg` aceita páginas conhecidas desta máquina; dispositivo sem código que abre um módulo vai ao Hub e volta ao módulo depois de parear (`?next=`, só caminho local).
- Replay abre fora do computador (sem `crypto.randomUUID` em HTTP).
- Mesa: faixa de estado no rodapé; docks com divisão livre, fechamento independente, botões e abas iguais, botões de reabrir quando tudo está fechado.
- Composições: a galeria de layouts tinha parado de carregar porque a página perdeu `.workspace` e `compor.css`; estrutura restaurada.
- Efeitos: removido o quadro "Suíte de IA", que era só texto sem função.
- Paleta azul trocada por grafite nas janelas restantes; controles de janela falsos removidos.
- Verificação em `qa-interface/padrao-20261101/`.

## 01/11/2026 — Padrão único das telas de Configurações e menu da mesa

- Novo `painel/remoto/3mix-padrao.css`: a mesma linguagem de Configurações para DSK, Multiview, Atalhos, Automação, Recuperação, Diagnóstico, Atualizações, Patch, Módulos e Hub. A pintura azul injetada em `settings.js` saiu; o que ainda é injetado ficou neutro.
- Configurações: categoria com editor próprio não mostra rodapé de Aplicar nem prévia; sumiram a faixa "página embutida", as descrições do topo e a frase genérica sob cada campo (a ajuda específica virou dica ao passar o mouse). Selo do projeto corrigido.
- Navegação: "Monitores e saídas" virou Monitores; Retornos SRT e N-1 e Matriz AUX entraram em Saídas; Checklist virou Pre-Flight (o endereço antigo continua funcionando).
- Mesa: menu hambúrguer refeito (Mixer de áudio e Hub não abriam nada); Modular Studio removido do menu, da barra e do Hub.
- DSK refeito: a entrada escolhida não some mais na atualização da tela; TAKE usa o que está na tela; canal sem entrada não vai ao ar com a primeira da lista.
- Multiview refeito: imagem real do motor, monitores exatamente 16:9 ou 9:16, escolha de entrada por monitor, medidores corrigidos. É quadro a quadro, não vídeo contínuo.
- `thumbs-engine.mjs`: rodízio justo; antes só as 2 primeiras entradas recebiam miniatura.
- Patch de Sinais e Checklist davam 404 porque nunca foram copiados da fonte para `3mix-runtime`.
- Verificação em `qa-interface/padrao-20261101/`.

## 12/10/2026 23:51 UTC — Replay ainda fora do pacote; falha TS preservada e QA arquivado

O prazo de teste às19h30 terminou sem entrega do pacote completo ou EXE novo. A prévia entregue era DOM real/API simulada, com JPEG sintético fixo e Native0. Flags por ângulo, ordem da lista, CUT/FADE400, salvar e preparar curva foram exercitados somente no modelo. O servidor R5 encerrou pelo limite de30min; no fim houve128 recusas ao atingir o limite do histórico de requisições. A captura inicial não prova uma sessão inteira saudável. O CMD antigo depende daquela sessão encerrada e não é mais uma entrada utilizável. O novo launcher reabrível ainda está em qualificação: R3 falhou na sintaxe PowerShell antes de iniciar e R4 falhou na substituição do registro no WindowsPowerShell5 antes de iniciar Node; originais preservados.

No ensaio Native39 TEST_ONLY R5, identidade/API passou e quatro capturas reais de entrada/cena mostraram os contadores esperados com mídia PLAYING, sem alterar Program/Preview. A prova do TS gravado falhou: “TS seek counter does not match its actual relative PTS/frame index”. As etapas de navegador posteriores não foram abertas. A causa permanece desconhecida; o helper já usa contador inicial relativo, portanto a hipótese de assumir contador zero foi refutada. Um diagnóstico offline finito de18 trabalhos está em revisão, com PTS/contadores antes de qualquer conclusão e sem relaxar tolerâncias. Native14 e Replay completo continuam sem aprovação.

API e Native do R5 fecharam cooperativamente com código0, observador restaurado e recursos pendentes zero. Pós-observação22:54 confirmou29 IDs próprios ausentes e quatro portas livres; pinos e alocações foram conferidos. Quatro falhas transitórias dos helpers CIM permanecem registradas, sem transformar todos os testes em PASS. Nenhuma instalação ou processo do operador foi alterado.

O usuário arquivou178 pastas de QA da raizD: para archived/qa-raiz-d-20261012, preservando o conteúdo; MANIFESTO registra pending0/remaining0. Novas fontes, casos e saídas ficam dentro do projeto em qa-replay/qa-finalizacao. Referências antigas em recibos continuam históricas; sucessores exigem vínculos explícitos e pinos novos. Fontes do launcher e do diagnóstico foram adaptadas, sem reescrever o arquivo em massa.

A pesquisa compartilhável de codecs está em entregas/PESQUISA-CODECS-REPLAY-20261012.md, atualizada com os resultados públicos paralelos V3 e seus limites. Não há codec escolhido pelo Root nem bancada Root nova aprovada. O retorno Kilo de autoria de integração tinha somente59bytes/incompleto; a revisão completa rejeitou o R20 por contabilidade agregada e falta de conexão dos escritores/contador RGB ao benchmark. Código de saída0 não equivale a fonte completa ou contrato aprovado. Claude permanece bloqueado até a estimativa13/10 00:30UTC; horários não garantem disponibilidade.

SRT está corrigido na fonte do Externo e passou na prévia simulada; transmissão e instalação ainda são provas separadas. Empacotador R13 falhou em guarda de payload previamente selado; R14 preparatório não foi executado. Quatro vídeos Topaz separados foram solicitados pelo usuário para ensaio multicâmera sincronizado, mas os arquivos finais ainda não foram fornecidos. Reprodução simultânea/frame sync e carga de quatro entradas precisam ser medidos.

Prova pública sanitizada: docs/evidencias/20261012-replay-native-r5-status-root/ROOT-STATUS.json. Trabalho humano nos dois diretórios experimentais de codec permanece intacto e fora deste commit.


## 12/10/2026 21:29 UTC — SRT acessível no Externo e bloqueio real do empacotador

O usuário apontou SRT ausente na janela Externo. A fonte oferecia somente NDI e OMT na linha Tipo; SRT estava no editor completo. Agora o botão SRT abre diretamente /saidas?context=external&transport=srt, conserva rascunhos NDI/OMT e respeita operação pendente. Prévia isolada com DOM real/API simulada confirmou botão visível, navegação e saída livre com protocolo SRT, Caller/Listener, IP e porta. Zero comandos mutantes, console sem erros, servidor/aba encerrados e PID próprio ausente. Não é teste de transmissão/receptor, alteração da instalação do operador ou pacote entregue.

Root compôs backend169+UI27 em190 arquivos próprios;47 caminhos canônicos novos/alterados, antigo editor636701 substituído explicitamente pelo4f9e23 de flags. Fonte composta ainda aguarda revisão/QA Native14, sem integração canônica do Replay. O pedido humano agora é pacote completo com novas telas funcionando e CMD após qualificação.

Uma execução real do empacotador externo R13 com HEAD83d439a, Native39 e3DLLs terminou FAIL: a base assinada contém canonical-source-pins.json antigo; o builder o herdou e aplicar-fontes-payload recusou corretamente um payload já sobreposto. SHA34fc8a6f7cbf19ff7c48c758f975097c405d4cda2b9173ade6654528e3b7e73c coincide na base e na cópia. Candidato parcial próprio preservado, sem retomar, selar, ZIP, EXE ou instalação. Correção de autoria/revisão de pacote permanece externa. Nenhum Native/API/codecbench começou nesta rodada.

AGY três FULLtasks21:16 terminaram429/0B; próxima tentativa por modelo>=22:16:51/53UTC. Claude>=13/10 00:30UTC. Humano autorizou investigar/executar agentes gratuitos Kilo/OpenCode e instalou o CLI oficial; disponibilidade de inferência ainda precisa comprovação, nunca usar modelo pago por fallback. Trabalho humano em experimentos/replay-codec-bench-20261012 permanece fora dos arquivos deste commit. Provas públicas: docs/evidencias/20261012-srt-access-package-root.


## 12/10/2026 20:12 UTC — Novo limite do Claude; codecR19 materializado, ainda não qualificado

O Claude entregou os13patches completos que faltavam: todos os anchors ocorreram uma vez contra R18, arquivoR19 reconstruído58.150B/SHA5620267f2cb32a35f4fe52041a217bfb4437c9f786dd6fd401bf358e618e921a e sintaxe0. O retorno anterior somente tail permanece preservado e não foi aplicado. R19 é fonte não admitida: helpers/CPU/revisão integral/bancada ainda pendentes.

A afirmação de que -fs no limite exato garante100MiB durante escrita contradiz a documentação primária do FFmpeg, que admite saída ligeiramente maior que o valor solicitado ([opção -fs](https://ffmpeg.org/ffmpeg.html#Main-options)). Root não alterou o algoritmo por conta própria e encaminhou correçãoR20 ao autor, exigindo limite de escrita real, fechamento cooperativo e contrato do contador decodificado. A tentativaR20 encerrou20:10:08UTC exit1/isErrortrue66B por limite de sessão: estimativa21h30SP/13/10 00:30UTC, posterior ao prazo de entrega, sem garantia. Nenhum resultadoR20, nenhuma nova bancada ou codec escolhido. TodosCLIs desta rodada encerrados; saldo desconhecido.

Replay mantém CPU11PASS e provas públicas do classificador. Novo UI/backend ainda experimental; não há aprovação Native completa nem instalação/pacote. Mesa e operador preservados. A automação foi enxugada para o estado atual e guardas indispensáveis, removendo checkpoints obsoletos repetidos para poupar contexto; supervisão20min e checksAGY horários mantidos. Prazo12/10 às19hSP não autoriza declarar100% ou concluir incompleto. Provas sanitizadas: docs/evidencias/20261012-clis-codec-r19-root.


## 12/10/2026 19:45 UTC — Claude retomado; classificador da agulha validado em CPU

O Claude voltou a produzir respostas completas após a janela estimada: autor codecR18 retornou50.996B, revisão independente codec8.526B e revisão Replay9.358B. São respostas de fonte; saldo desconhecido. Gemini, Opus e Sonnet continuam429 nos últimos checks horários, todos encerrados. Nenhum processo do operador foi alterado.

Replay: a primeira resposta foi parcial e não autorizou execução. A continuação leu o roteiro inteiro, nove dependências e a cadeia C/C++ selecionada; manteve Native bloqueado pelo binding nulo. A hipótese de fixture offair com restart_on_activate foi sustentada em fonte, sem provar retroativamente a causa do FAIL. Revisão apontou diferença entre editorR15 e manifesto169R14 e ofereceu endurecimento do hash do marker; composição final/revisão/QA Native continuam pendentes. Foi admitido apenas o helper CPU puro: uma execução própria passou11grupos de RGB/counter/intervalos circulares, exit0, stderr0, fontes originais e cópias com hashes iguais e PID128712 ausente em CIM. Não houve Native, FFmpeg, sockets ou mídia real nesse teste.

CodecR18 foi materializado literalmente de um único bloco JS e dois anchors de helpers; sintaxe passou. A revisão admitiu os helpers e a bancada em fonte, mas reconheceu que o seek verifica PTS sem conferir o contador visual pedido, e o tamanho do gerador continua estimativa. Root não executou R18 nem relaxou o contrato: pediu ao autorR19 contador binário decodificável sem depender de fonte e limites durante escrita, preservando2s1080p59.94/PCM/2threads/100MiBporarquivo/750MiBagregado. O primeiro FAIL real R14 e seus arquivos permanecem intactos; zero candidatos comparados, nenhum codec escolhido. A contagem4PIDs inclui3comandos FFmpeg e o Node pai, sem discrepância de fechamento.

O novo Replay continua experimental, fora da instalação e do pacote. Tela cheia e dock compartilham a fábrica A/B; aprovação visual1:1, feeds reais, agulha/INOUT/persistência no Native e novo pacote completo ainda pendentes. Mesa externa ao Replay preservada. Prazo12/10 às19h America/Sao_Paulo mantido, sem conclusão pelo relógio. Provas CPU sanitizadas: docs/evidencias/20261012-replay-background-cpu-root.


## 12/10/2026 15:25 UTC — Replay: estrutura das referências e flags validadas na prévia; CLIs novamente limitados

R15 alterou somente apresentação JS/CSS; common/editor e outros25arquivos permanecem R14. Revisão integral independente e guardas27pinos/nlink1/noLinks/realpath passaram antes de uma prévia própria. DOM real/API simulada: fullscreen950×534 com oito colunas e linhas9px; dock950×250 sem monitores, linhas13px e rolagem para câmeras7/8. Capturas posteriores confirmaram ambos JPEG sintéticos320×180 decodificados. Estrutura/posições foram comparadas às referências; dados, controles específicos e oito feeds reais ainda diferem. Não é aprovação pixel1:1, Native ou instalação.

Flags3→Listas em ordem, reordenação Cam1/Cam3/Cam2, FADE400 após poll/nome, statusLista salva e preparação explícita habilitada. Dock também montou Cam4/Cam2 em ordem. Matriz e Tools preservam seletor/carregamento original; carga foi gesto explícito. Console0. Contagem mock:235historyPOSTs de leitura,1playlist-save e1load; nenhuma preparação/ida ao ar automática. Abas/servidor próprios fecharam cooperativamente, PID ausente e27pinos iguais. Provas: docs/evidencias/20261012-replay-referencia-r15-root. Fonte experimental isolada, fora do produto.

Codec: helperR17 e watchdogR14 passaram42assertions CPU reais, filhos encerrados/CIMausentes. A primeira bancada FFmpegR14 executou uma vez e falhou no gerador: fonte112.023.382B excedeu104.857.600B; três comandos encerraram, todos quatroPIDs ausentes e zero candidatos comparados. FAIL e mídia sintética próprios preservados. Não há codec escolhido. Correção R18 e revisão NativeR10a foram encaminhadas ao Claude, mas ambas retornaram limite às15:16UTC, previsão de retomada19:20UTC/16h20SP, sem garantia. Gemini/Opus também429 às15:12UTC, Sonnet às14:35UTC; saldo desconhecido. SemCLI ativo. Atendendo ao pedido humano de poupar Codex, novas revisões de agentes encerradas; próximos trabalhos de fonte priorizam CLIs disponíveis, mantendo retomadas espaçadas.

NativeR10a permanece plano nulo não executável: exige imagem/status/counter antesREC e pixels/PTS do TS, fixture offair sem ativaçãoMAIN, ownership antes receipts, dependências pinadas e dock sem monitores. Nenhum novo Native/API/operador iniciado nesta rodada. Produto/Mesa/instalação/pacote continuam sem o novo Replay; empacotamento final precisa integração qualificada e HEAD/pinos atuais. Prazo12/10 às19hSP mantido, sem100% ou conclusão pelo relógio.


## 12/10/2026 14:38 UTC — Replay: flags e ordem reais na interface; fidelidade e Native ainda pendentes

A seleção de ângulos agora transfere as flags marcadas para o rascunho real de Listas, em ordem de seleção. Na prévia isolada, Cam3/Cam1 do primeiro lance e Cam2 do segundo entraram nessa ordem; reordenação colocou Cam1/Cam3/Cam2. CUT/FADE são editáveis e FADE400ms permaneceu após atualização periódica e edição do nome; salvar foi explícito e confirmado pela API simulada. O dock também montou Cam4/Cam2 de um lance na ordem escolhida. As duas superfícies usam a mesma fábrica, somente A/B; o dock não mostra os monitores. Trinta casos CPU do código real passaram, incluindo identidade dos handlers em clones e reordens de itens iguais.

Escopo executado: DOM real, API simulada e JPEG sintético320×180, viewportCSS950×534/950×250; não é Native/CEF, gravação, reprodução sequenciada no ar ou qualidade audiovisual. Console sem erros. Apenas um POST mutante simulado (playlist-save),79historyPOSTs de leitura, nenhuma preparação/ida ao ar automática. Servidor e abas próprios encerrados cooperativamente; PIDs próprios ausentes e27pinos iguais. R11 preservou falha FADE400→300; R14 corrigiu e revalidou o campo. As capturas ainda diferem das referências em densidade/posição dos comandos: fidelidade1:1 NÃO aprovada, ajuste visual separado em preparação. O catálogo de câmeras não equivale a oito feeds de vídeo reais.

Diagnóstico offline dos TS próprios do ensaio NativeR9:24jobs FFmpeg/ffprobe encerraram, mas quatro comparações oracle/produto mostraram quadros pretos sem cor/contador esperado. Isso não confirma erro de seek nem câmera gravada corretamente. O gate2 anterior prova início/fim/arquivo, não pixels corretos. A receita falhou depois em guarda do helper CIM; FAIL preservado e pós-consulta independente confirmou24PIDs ausentes. Fonte sugere fixture fria com restart_on_activate:true e vista AUX sem ativação MAIN; hipótese ainda não comprovada. Próximo ensaio exigirá status/imagem sintética antesREC e pixels/contador do TS, preservando gravação fora do ar e PGM/Preview. Não ativar áudio MAIN nem esconder o preto forçando câmera ao ar.

Claude voltou a entregar revisão completa de fonte: benchmarkcodecR14 aceito em fonte, helperCPU rejeitado e quatro correções materializadas literalmente emR15/sintaxe, revisão cruzada pendente. Nenhum benchmark de codec executado. AGY continua429 em tarefas completas; saldo desconhecido. Produto canônico/Mesa, operador e pacote permanecem sem esta integração. Prazo12/10 às19h America/Sao_Paulo mantido, sem100% ou conclusão pelo relógio.

Provas sanitizadas: docs/evidencias/20261012-replay-angulos-root; código experimental: experimentos/replay-interface-angulos-20261012-r14.


## 12/10/2026 12:33 UTC — Replay: prévias A/B reais passaram; agulha bloqueia a qualificação

O ensaio próprio Native39 R9 passou sete gates: identidade/API; gravação SourceRecord de duas câmeras sintéticas; CEF real da Mesa e janela separada com a mesma fábrica A/B; navegação 60s sem mutações com players vazios; importação própria e carregamento A/B com recusa de C/D antes do Native; JPEG A/B com contador decodificado nas duas superfícies CEF; e mais 60s de navegação com os players carregados, sem comandos mutantes, saves ou novos jobs. O oitavo gate falhou ao confirmar o quadro buscado pela agulha contra o contador extraído do TS. A causa ainda não está comprovada. Os seis gates posteriores de IN/OUT completo, metadados/autosave, preparação/lista no ar, persistência e fechamento da sequência não foram qualificados. FAIL original preservado.

Fechamento cooperativo concluído: a resposta inicial da API ficou pending; uma reconsulta do closer existente confirmou depois o drain real, retirada do observador e desconexão IPC legítima. Parent encerrou naturalmente com exit1/EOF; 28 identidades próprias ausentes, nenhum executável/listener da cópia, 2085pinos Native +3DLLs +169fontes +10arquivos do roteiro +2fixtures iguais, alocações zero e nenhum crash. Native exit0; código de saída da API desconhecido. Um primeiro pós-check encontrou reutilização de PID por outro processo e foi preservado, sem tocá-lo; verificação fresh posterior confirmou todos os PIDs próprios ausentes. Nenhum operador alterado.

Nova referência humana: reproduzir a tela cheia do Instant Replay 1:1 a partir da captura fornecida, com A/B à esquerda, câmeras à direita, tabela central e comandos/agulha no rodapé. Preservar a Mesa acoplada aprovada e o mesmo controlador; não fabricar monitores ou APIs. Layout novo permanece em preparação isolada. Novo Replay/Native39/DLLs ainda não estão instalados nem no novo pacote completo. Codec R14 aguarda revisão independente; nenhum benchmark executado. Claude informou limite até14:20UTC (estimativa); AGY segue indisponível em tarefas completas.

Provas públicas: `docs/evidencias/20261012-replay-native39-r9-root`. Prazo humano12/10 às19h America/Sao_Paulo mantido, sem conclusão automática nem100%.

## 12/10/2026 10:55 UTC — Replay: gravação e interface comum passaram no Native; qualificação ainda pendente

O ensaio próprio Native39 R7 passou identidade/API, gravação SourceRecord de duas câmeras sintéticas (histórico parado de8,988s) e abertura CEF real da Mesa e janela separada com a mesma fábrica de interface, somente A/B. O quarto gate falhou antes do checkpoint de navegação: o observador do roteiro manteve um erro de fechamento HTTP. A permanência60s sem mutações não começou; os dez gates posteriores, incluindo quadros carregados A/B, agulha, IN/OUT, persistência, autosave e reinício, NÃO foram executados. Isso não comprova falha funcional desses recursos, nem qualifica a entrega. O recibo FAIL original permanece imutável.

Fechamento cooperativo e pós-observação independente concluídos:14PIDs próprios ausentes, nenhum executável/listener restante,2085pinos Native +3DLLs gerenciadas +169fontes +8arquivos do roteiro +2fixtures iguais, alocações zero e nenhum crash. O Native encerrou com código0; o código de saída da API é desconhecido. A retirada do observador não foi confirmada e a resposta de um helper de retirada ficou indisponível; esses limites continuam registrados, sem transformar o FAIL em PASS. Nenhuma alteração no operador.

A revisão do novo observador encontrou dois bloqueios de fechamento e pediu correção com regressões; só após revisão e testes do roteiro haverá novo ensaio Native finito. O combinado seguinte de169fontes está aceito em fonte, incluindo guarda que impede chamada externa do tick interno;15contratos CPU dessa guarda passaram. O novo Replay continua offside, sem integração canônica, instalação ou pacote. O montador R13 está aceito apenas como preparação; nenhum payload completo novo foi montado. Codec R13 foi materializado literalmente e verificado em sintaxe, mas precisa revisão independente de propriedade de processos antes da bancada; nenhum benchmark de codec foi executado.

Provas públicas: `docs/evidencias/20261012-replay-native39-r7-root` (resumo sanitizado e pós-observação). Preservar o desenho da Mesa, interface comum acoplada/separada e somente A/B. Prazo12/10 às19h America/Sao_Paulo mantido, sem conclusão automática nem declaração100%.

## 12/10/2026 06:48 UTC — Replay: primeiro ensaio Native39 falhou; cópia de QA encerrada

O runner Native R2 executou uma vez em instalação própria isolada: identidade Native39/API/portas e saídas ociosas PASS; o segundo gate, início da gravação SourceRecord sintética, FAIL com `fetch failed`. Os gates seguintes de CEF, prévias A/B, agulha, navegação sem mutações, persistência e autosave NÃO foram executados. O recibo FAIL original foi preservado; o novo Replay permanece offside, sem qualificação Native/CEF e fora do pacote instalado.

A API da cópia encerrou; seu código de saída e causa não foram capturados pelo roteiro original, que descartava stderr. O fechamento inicial também foi interrompido pelo erro HTTP. Um helper cooperativo R3, revisado independentemente e com guardas de raiz, PID/executável/hash/data de criação, autenticação local e saídas ociosas, recebeu ACK positivo do Native para `shutdown_idle(qaClose:true)` e confirmou ausência CIM. Pós-observação: cinco PIDs próprios ausentes, nenhum executável/listener da cópia restante, 2085 pinos Native + três DLLs gerenciadas + 168 fontes + mídias originais iguais, medidor de alocações zero e nenhum crash. Nada foi alterado na instalação do operador. Fechamento verificado NÃO transforma o teste em PASS.

O log da cópia mostra falhas de carregamento de submódulos por caminho de QA excessivamente longo. A causa do encerramento da API continua desconhecida. A revisão de fonte identificou um caminho de erro de spawn com acesso a stdio antes do listener de erro; essa fragilidade está em correção isolada, sem atribuí-la como causa comprovada deste FAIL. Próximo roteiro deve usar raiz própria curta, registrar stderr/exit de forma limitada e tentar cada fechamento cooperativo independentemente. Nova execução somente depois da revisão da correção e do roteiro finito; não repetir R2 ou afrouxar gates.

Provas: `docs/evidencias/20261012-replay-native39-r2-fail-root`. Permanecem válidos os testes anteriores CPU/FS e FFmpeg sintético 16/16 do combinado, com 51 PIDs encerrados e 168 pinos preservados; eles não substituem o ensaio Native. Prazo humano: 12/10 às19h America/Sao_Paulo, sem conclusão automática pelo prazo.

<!-- replay-combined-final-root-20261012 -->
## Replay — backend combinado qualificado na bancada; Native/CEF é o próximo gate

O snapshot final de168 fontes passou9 contratos de fechamento aguardável,3 contratos usando o descarte real do Disk com filas simuladas,4 verificações de gravação atômica em pasta própria e15 contratos do controlador de listas. A fila de metadados aceita termina antes do encerramento da sessão/conexão; somente gravação atômica bem-sucedida do escopo atual marca recuperação como alterada. Navegação e publicação de status não marcam alterações.

A execução seguinte passou **16/16 com FFmpeg real e vídeo/PCM estéreo sintéticos**, através do Disk combinado e com OBS declarado como mock. CUT/FADE400ms, pixels e mistura PCM, ordem/IDs, carga pausada100%, nonce sem segundo render, cancelamento e mudança de escopo foram exercitados.51 identidades próprias ausentes por CIM,168 pinos intactos e descarte das ferramentas/filas confirmado. [Recibos e limites](evidencias/20261012-replay-combinado-final-root/ROOT-RECEIPT.json). Falhas anteriores continuam preservadas.

**Não instalado, não incluído no pacote e ainda sem PASS Native/CEF.** O desenho da Mesa permanece a referência comum para a janela; agulha e previews A/B já têm provas de navegador simuladas, mas os quadros reaisNative39, persistência/autosave60s, permanência sem mutações, reinício e fechamento cooperativo ainda dependem do roteiro finito em revisão. Nenhuma alteração no operador. Codec e montador de pacote seguem em autoria/revisão externa; nenhuma bancada de codec ou novo payload foi executado. Prazo12/10 às19hBRT mantido.

---
<!-- replay-common-ui-dom-root-20261012 -->
## Replay — mesma interface Mesa/janela, agulha e dois previews passaram no navegador

O componente comum baseado no desenho da Mesa passou **36/36 verificações de DOM com API simulada**. A versão com previews A/B também passou36/36: imagens decodificadas, captura durante avanço do cursor, descarte de imagens de outra fonte/sessão, respostas perdidas e cancelamento correlacionado foram exercitados. Navegar entre abas não enviou comandos mutantes; escolhas e controles sobreviveram ao polling. IN/OUT do histórico usam o quadro exibido confirmado; operação somenteA/B, registros legadosC/D preservados.

Ensaio separado de captura passou **13/13**, com quatro imagens em700×540 e1200×760 mostrando A/B simultaneamente e a agulha. Root inspecionou as capturas; UTF8 correto. Os três navegadores próprios fecharam cooperativamente, CIM ausente/profile0, servidores fechados e pinos iguais. Falhas anteriores de inicialização, espera antecipada de ACK e perda de resposta da fixture permanecem preservadas; o componente correto não foi alterado para afrouxar os critérios. [Provas e imagens](evidencias/20261012-replay-interface-comum-root/ROOT-RECEIPT.json).

**Ainda offside, não instalado nem incluído no pacote.** As imagens são sintéticas e as APIs simuladas: não comprovam frames Native/CEF, vídeo no ar, áudio físico, latência/endurance ou WAN. Próximo: qualificar o backend combinado, fechamento aguardável/persistência, previews reaisNative39 e integrar sob guardas; depois montar o pacote completo. Mesa e operador intactos. Claude CLI voltou a entregar respostas revisáveis de codec/pacote; Antigravity continua limitado nas últimas tarefas completas, saldo desconhecido. Prazo12/10 às19hBRT mantido.

---
<!-- replay-whole-playlist-root-r8-20261012 -->
## Replay — listas completas passaram na bancada; Mesa permanece a referência

Root executou uma preparação completa de listas em snapshot próprio de146 fontes: **16/16 verificações passaram**, com FFmpeg real, vídeo RGB e PCM estéreo sintéticos e motor OBS explicitamente simulado. CUT e FADE400ms, cadência, ordem e mistura do áudio, carga pausada a100%, recibo/nonce sem segunda preparação, HOLD/LIVE, retorno condicionado ao Programa, cancelamento, mudança de escopo e limpeza tardia foram exercitados.51 processos próprios ficaram ausentes por CIM; fontes e três originais intactos. [Prova e limites](evidencias/20261012-replay-preparado-root/whole-playlist-r8/ROOT-POST-PLAYLIST-R8-OBSERVATION.json).

A execução anterior R7 falhou na leitura de PCM porque FFmpeg recusou a duração literal `.08`; diagnóstico separado aceitou `0.08`. R8 mudou somente essa fixture e o identificador da execução, preservando16 critérios e fontes de produto. FAIL original preservado. Um PID observado depois de R7 pertencia a `conhost.exe` por reutilização, não à ferramenta própria; nenhum processo alheio foi fechado.

O desenho da **Mesa segue preservado**. Componente comum Mesa/janela externa, somenteReplay A/B e agulha com confirmação de quadro está pronto offside para revisão/DOM. Ainda não integrado, instalado ou qualificado em Native/CEF. O mock não comprova dispositivos, áudio no ar, WAN, endurance ou broadcast final. Próximo: qualificar essa interface comum, Native39 pertinente e pacote atualizado. Prazo12/10 às19hBRT mantido.

---
<!-- replay-combined-interim-root-20261012 -->
## Replay — prova intermediária de backend, interface comum ainda em trabalho

Snapshot próprio congelado de137 fontes passou20 contratos CPU e12 verificações de mídia RGB/PCM sintética com FFmpeg real. Consulta manual do histórico, preview em três pontos, captura limitada, cadência, proxy/lease, cache sem job, cancelamento tardio e callback completo de curva foram exercitados; arquivo derivado só foi publicado após fechamento real das ferramentas. Nonce repetido de curva não iniciou outro job.26 processos próprios ausentes por CIM, fontes e original intactos. Provas: `docs/evidencias/20261012-replay-preparado-root/combined-interim-r1`.

A admissão experimental usa somente A/B; pedidos C/D recusam antes de mídia/Native e registros antigos permanecem iguais. Esta prova é de snapshot intermediário: recibos/cancelamento de listas e ACK da UI recebem correções posteriores; o componente comum ainda é construído a partir do desenho da Mesa, que segue preservado. Produto canônico ainda não recebeu esse backend ou a interface comum. Não é Native/CEF, hardware, latência/endurance, WAN ou pacote instalado. Prazo e restrições da mesa permanecem.

---
<!-- replay-shared-dock-human-direction-20261012 -->
## Replay — direção vigente: preservar a Mesa, mesma interface e somente A/B

O dono esclareceu que a tela acoplada da Mesa é a referência mais correta: **preservar seu desenho e melhorá-lo**, e fazer a janela externa usar a mesma interface. A operação deve apresentar somente **Replay A e Replay B**, sem C/D. A primeira composição externa do commit6a40304 não é aprovação visual final nem está instalada; a próxima composição deve partir do dock da Mesa, não substituí-lo por aquele console externo.

Fonte atual confirma dois renderizadores: `mesa.html::renderSideReplay` e `remoto/replay.html/js`. Root manteve o renderer e o desenho da Mesa intactos; tentativa de preparação de host separado falhou numa guarda antes de escrever fontes canônicas e foi interrompida após a correção humana. Próximo trabalho: componente compartilhado a partir do dock, agulha/preview de quadros reais, seleção A/B, sem recriar a interface durante polling nem mandar comandos de produção ao navegar. A barra de progresso decorativa de45% e elementos legados ocultos não são provas de operação.

Agentes preparam fontes offside e não executam processos. Root executou18 contratos CPU da atualização manual de histórico: consulta de status permanece livre durante uma leitura de metadata bloqueada, navegação não prepara mídia nem altera players, limites/lease/cancelamento/disposal preservados. O controlador de curvas R5 passou CPU com deduplicação/restart e limpeza de artefato após admissão tardia recusada. Ambos são mocks injetados e não Native/CEF ou operação completa. Reviews de fonte ainda corrigem recibos de ACK/nonce e limpeza tardia; composição completa, DOM, Native e pacote permanecem pendentes.

Gemini continua limitado na tentativa completa de revisão: HTTP429/RESOURCE_EXHAUSTED, sem resposta, saldo desconhecido; checks espaçados. Claude CLI aguarda a janela de reset informada (~04:20UTC12/10, sem garantia). Root/agentes seguem no replay autorizado. Operador e instalação preservados; não empacotar o desenho externo6a40304 como layout final aprovado sem esta harmonização e QA pertinente. Prazo12/10 às19hBRT mantido.

---
<!-- replay-operation-layout-root-20261012-0205 -->
## Replay — janela de operação alinhada ao padrão das demais janelas

Ordem do dono: a tela acoplada já está no estilo vMix; melhorar a janela separada de operação. Código atual recebeu somente composição/estilo da operação: botões planos compactos, lances e preview lado a lado, agulha e IN/OUT visíveis, quatro players compactos, transporte e velocidades agrupados e mensagens junto dos controles. Reutiliza `vmix-dialogo.css` aprovado; menu solicita1200×760. `replay.js`, backend, arquivos de Configurações do Replay e CSS compartilhado permaneceram com os mesmos bytes. Listas e curvas experimentais não foram integradas nesta alteração visual.

Root observou a nova operação em DOM real com API simulada, sem erros de console; abriu/fechou Câmeras e constatou somente solicitações de histórico na prévia. Servidor próprio fechou cooperativamente e seu Node ficou ausente por CIM. A agulha aparece desabilitada porque esta fixture não contém uma sessão gravada. Isto não comprova busca em mídia, operação Native/CEF, REC, PGM, latência ou hardware. Screenshot e recibo: `docs/evidencias/20261012-replay-operacao-compacta`.

O controlador experimental também passou dez verificações com FFmpeg real e mídia sintética própria: quadros em três posições, captura limitada, cadência, lease de proxy, cache sem novos jobs e cancelamento tardio. Originais preservados,19 processos próprios ausentes por CIM. Esse resultado é separado da prévia mock e não qualifica a composição completa no programa.

Pendente: QA pertinente da janela nativa e inclusão no novo pacote completo; operador não atualizado por Root. Novo empacotamento deverá consumir o HEAD posterior a esta alteração. Deadline12/10 às19hBRT mantido; sem declaração de broadcast concluído.

---
<!-- managed-source-package-20261012-0110 -->
## Fontes dos componentes gerenciados — complemento de empacotamento

O ZIP oficial DistroAV6.2.1 usado na compilação agora está em `licenses/freemix-distroav-managed/DistroAV-6.2.1-official-source.zip`, SHA6da38f422c6dc826165a7462b4496f967ed7f948bd6a97ba3e0e3143193625e4; catálogo e proveniência declaram o caminho local. A proveniência SceneSwitcher declara o ZIP oficial já presente na base600 assinada, SHA c3cb9d64d9bb9a15b0880a8b6e734ee20368f533fb5fb2aeb40b60aa77b66b2b. O novo montador deverá conferir ambos os ZIPs efetivamente copiados, além dos patches/licenças. Nenhum DLL, fonte C++ ou byte do Native39 mudou nesta complementação; build/QA anterior permanece com os mesmos pins. Pacote completo ainda não montado/selado, mesa intacta.

---
<!-- replay-preparado-root-20261012-0100 -->
## Replay — implementação experimental e provas reais de mídia, 11/10 às22h de Brasília

O dono autorizou Codex e seus agentes a implementar o replay enquanto os CLIs externos retomam. Código experimental preservado em `experimentos/replay-preparado-20261012`, fora dos caminhos de produto. Base canônica c40579b/Native39; nenhuma alteração da mesa/API do operador.

Root executou playlists CPU24/24 e worker real14/14. Em mídia sintética própria, lista CUT seguida de FADE400ms passou cinco verificações:168 quadros/5,6s, cores na ordem, mistura real dos tons PCM estéreo, originais intactos e12 processos ausentes por CIM. Curvas rápido→lento→rápido e rápido→lento passaram quatro verificações reais:72/56 quadros, mapeamento temporal/endpoints conferidos nos pixels decodificados, PCM silenciado, confirmação explícita de silêncio, cancelamento antes da preparação, originais intactos e13 processos ausentes. Provas: `docs/evidencias/20261012-replay-preparado-root`.

Limites: preparação cria um arquivo derivado H264/CRF18 antes de ir ao ar; não é codec sem perdas nem efeito aplicado ao decoder ao vivo. Curva ainda exige confirmação explícita de áudio silenciado; áudio variável não foi qualificado. Preparação consome tempo/disco. Esta bancada não prova Native/CEF, dispositivos, GPU, WAN, quatro câmeras ou longa duração.

Pendentes: integração do worker com todos os caminhos transitivos do replay, agulha/visualização/INOUT e editores de lista/curva na interface, QA da janela nativa/latência/retomada, seleção de codec por medições e novo pacote completo. Fontes experimentais ainda NÃO estão instaladas ou incluídas como recursos ativos do pacote do operador. Falhas anteriores de fixture, inspeção RGB e enum de erro permanecem preservadas nos diretórios próprios; nenhum critério foi relaxado.

Claude CLI voltou e trabalha em revisão de empacotamento/codec. A tentativa completa Gemini de12/10~01hUTC continuou HTTP429/RESOURCE_EXHAUSTED; nenhuma resposta de análise, saldo desconhecido. Seguir checks espaçados, sem afirmar que AGY está trabalhando. Prazo vigente:12/10 às19hBRT; o prazo não transforma pendências em concluídas.

---
<!-- managed-components-root-20261011 -->
## Atual — componentes internos e bloqueios de atualização qualificados

Ordem direta do dono: compilar/integrar os componentes e bloquear updates independentes do OBS/plugins; autorizou o Root a implementar esta frente sem depender de outros agentes. Native39 `7b77e328ec4741ab734e43f3275d37d9d1dfd22e` passou ALL_BUILD, exportação de 39 patches/três submódulos/snapshots e reconstrução --check. Freeze `qa-finalizacao/native-build-frozen-7b77e32-configured.json`, SHA `3952f3d5935f7cabdca57a30db3944522b7b87f59960e85d21b9892a2bedec4c`, 2085 arquivos. OBS updater manual/periódico bloqueado no fork; catálogo RTMP agora força updates OFF mesmo contra flag/cache ON.

SceneSwitcher recompilado com identidade estável 3Mix e backup de migração automático, atômico e imutável antes de LoadSettings. DistroAV recompilado sem auto/manual checker nem controles/handlers de instalação própria; NDI carrega somente o runtime aprovado app-local, ignora variável externa e recusa conteúdo alterado/links. Verificar Complementos agora faz somente diagnóstico local, sem consultas upstream. Bibliotecas internas continuam DLLs controladas da entrega; não afirmar que todos os terceiros foram reescritos ou estaticamente incorporados ao EXE.

QA final real Native39: duas aberturas/dois fechamentos cooperativos, Start/Stop da automação, fonte NDI registrada mesmo com ambiente inválido, backup exato sem regravar no reinício, zero leaks nos dois logs e 2085 post-pins. C++/Qt: backup14/14 e NDI8/8; diagnóstico Node7/7 zero fetch. Receita offline e reconstrução dos nove fontes modificados passaram. Prova sanitizada: docs/evidencias/20261011-componentes-gerenciados-root. Falha inicial da fixture fora de modules preservada e fechada cooperativamente; R2/R3 PASS não apagam o FAIL original.

Fontes/licenças/patches/receita integrados no 3Mix; componentes.json registra os novos hashes destinados à próxima entrega. Inputs aprovados locais: D:/FreeMix-QA-PluginGovernance-20261011-2305/delivery-inputs/APPROVED-INPUTS.json. Ainda NÃO há novo instalador completo selado nem atualização armada com estes bytes; mesa145116 intacta. Próximo: empacotar Native39+três DLLs qualificadas+fontes finais, conferir assinatura/hashes/startup e entregar sem instalar plugins avulsos no cliente. Não homologar hardware/WAN/SDKs fechados por estes testes; demais pendências de replay/áudio/calls/codec permanecem.

---
<!-- sceneswitcher-notice-20261011 -->
## 11/10 — aviso do Advanced Scene Switcher: conferência local

O dono identificou o aviso no 3Mix como Advanced Scene Switcher. A tradução instalada contém: “Detectada uma nova versão do Advanced Scene Switcher. Deve ser criado um backup das configurações antigas?” (`AdvSceneSwitcher.askBackup`). A fonte preservada chama `AskForBackup` quando `VersionChanged` compara a versão salva com `g_GIT_SHA1`; esse caminho solicita backup após uma mudança local, sem consultar um servidor de atualizações. O texto exato visto pelo dono ainda não foi confirmado, portanto a identificação deste diálogo como o aviso observado permanece condicionada ao texto.

Os hashes das duas DLLs instaladas coincidem com as DLLs recompiladas e testadas da correção de shutdown: módulo `699b1f15067fd27dd0aca42a5108b4b1be6d1e863085aabec71cbdfaab294cc0`, biblioteca `5b0e93759d1d544d39371ce7bbe3f7e962a39fead1fe1f6b0cb2d3774d91b24f`. O componente foi adaptado/recompilado, mas continua modular; seus subplugins/dependências oficiais foram preservados. Não afirmar que todos os plugins já foram incorporados ao executável ou que seus diálogos foram governados.

Pendência: integrar identidade de versão estável e aviso de migração/backup ao fluxo 3Mix, preservando configurações e proteção de backup, com revisão de fonte, recompilação e QA próprio antes de distribuir. Nenhuma DLL, macro, configuração ou processo do operador foi alterado nesta conferência. Bloquear o updater do OBS não substitui o tratamento dos diálogos de cada componente.

Observação somente leitura: `obs-vmix/version.json` agora declara `0.1.0-local.20261011145116`; o estado anterior “incremental ainda não aplicado” ficou histórico. Root não aplicou a atualização. Esta leitura não qualifica todos os recursos da mesa ou substitui os testes pendentes.

---
<!-- prazo-humano-20261012-1900 -->
## Prazo vigente — segunda-feira, 12/10/2026, às 19h de Brasília

Pedido direto do dono em 11/10: entregar o sistema pronto amanhã às 19h (22h UTC), substituindo o prazo anterior de 13/10. Coordenar Claude CLI e Antigravity continuamente enquanto disponíveis, acompanhar cada tarefa até uma entrega revisável e verificar cota quando houver parada. Com um provedor indisponível, seguir pelo outro; com ambos limitados, aguardar e verificar disponibilidade espaçadamente. Não inventar saldo nem tratar timeout ou resposta vazia como falta de créditos.

A automação existente passa a acompanhar a cada 20 minutos; tentativas de provedor com limite prolongado permanecem espaçadas. Preservar a mesa do operador. Entregar código, documentação e pacote local qualificado; registrar separadamente o que ainda não passou em testes ou depende de equipamento/rede/licença. O prazo não transforma recurso pendente em concluído. A meta antiga do aplicativo está em `usageLimited`; a ferramenta disponível não permite editar seu objetivo/prazo. Este bloco e a automação registram o novo prazo sem encerrar falsamente a meta antiga.

Pedidos do replay preservados: agulha com visualização durante a busca e IN/OUT preciso, listas sequenciadas com transições e curva de velocidade. Comparar codecs para qualidade, gravação, leitura e busca rápidas com testes próprios; distinguir compressão sem perda de qualidade visualmente próxima. Recursos novos e pacote completo atual continuam pendentes de integração/qualificação.

---
# Changelog do 3Mix

Registro cronológico resumido, só com marcos confirmados. Para estado vigente: CONTINUAR.md e PENDENCIAS-REAIS.md. Arquivo novo; não existia changelog consolidado antes de 11/10/2026. Datas abaixo estão em UTC (horário de São Paulo = UTC-3).

## 10/10/2026
- Instalador completo selecionado: `0.1.0-local.20261010060000`, Native24/a047860 (imutável), validado em instalação própria do Root.
- Prazo de conclusão definido para 13/10 (plano em PLANO-CONCLUSAO-20261013.md).

## 11/10/2026
- **App36 R4e — PASS:** 60.077ms de permanência em cinco telas, contadores run0/execute1/journal2/mutatingReq19 iguais ao início, Preview 90ms, Cut 165ms, dedupe/tags corretos, autosave só após mudança real, checkpoint manual HTTP 200, fechamento limpo (cleanup 0). Corrige o FAIL anterior de autosave do App36 R3 (preservado como histórico). Prova: [App36 R4e](evidencias/20261011-app36-r4e-real-pass/ROOT-README.md), `receipt-r4e.json`. Escopo: Native36 + painel `e801` — ainda não o Native38 atual. Ensaio ocorreu em 10/10/2026, 23:15–23:21 horário de São Paulo (11/10 em UTC).
- Native37 corrige o inventário de áudio tolerante a uma entrada defeituosa (ASIO/dispositivo sem nome). Native38 (`ed08547`) permite cada janela abrir no tamanho pedido pela página.
- Sete janelas novas (Streaming, Calls, Externo, Gravar, MultiGravação, Configurações do Replay, Configurações) tiveram roteiros relatando 122/122 — a maior parte dessa automação roda num navegador Edge separado, não na janela CEF embutida; só o caminho real de abrir a engrenagem e fechar pela janela nativa foi provado em separado (fechamento em 2s, 0 vazamentos).
- Corrigido nessa rodada: botão Fechar não fechava a janela de dentro do programa (agora usa o pedido nativo `close_panel`); Gravar e MultiGravação reescritos no molde visual do vMix; perda de texto não salvo no Externo; câmera obsoleta oferecida nas Configurações do Replay.
- Janela “Configurações” (engrenagem geral) implementada a partir das 98 preferências reais do motor; 18/18 testes com o programa real. Pendente: importar arquivo real, baixar Exportar na janela, botão nativo “todas as preferências do programa”.
- Atualização incremental da mesa **armada**: `0.1.0-local.20261011145116` (Native38 `ed08547` + painel `71f8aa7`) sobre a mesa em `0.1.0-local.20261009153453`. Ensaiada antes de armar numa cópia de fábrica — não testada com a configuração real do operador. Não aplicada até o momento.
- Prioridade definida pelo dono: estabilidade de transmissão (saídas simultâneas, reconexão, latência sob carga) é P0 atual, separada do endurance específico do Replay; ainda não há pacote completo novo selado com as fontes finais do Native38.
- Conferido: HEAD do 3Mix (`c4f374268adae2e73a71189400cd1bd26997d59b`) limpo e idêntico ao branch remoto no GitHub (https://github.com/eddysangalli/FreeMix) nesta checagem — código integrado publicado; propostas/bancadas offside permanecem locais. Assinatura + 394 hashes de arquivo e 18 fontes de UI/API/Mesa batem com o pacote armado.
- O dono aprovou a linha visual geral das telas (cópias do vMix); a prévia de Calls com API própria MOCK (chamadas sintéticas) não é prova de motor Native, microfone ou rede WAN.
- Preparado, não executado: especificação de QA externo de fontes/preferências nativas do Calls; 3 testes de Configurações Gerais pendentes. Revisões de fonte sobre stream/concorrência/reconexão aguardam confirmação em runtime.
- AGY: última chamada recebeu HTTP 429 (RESOURCE_EXHAUSTED, resposta 0 bytes); nova tentativa espaçada também 429. Claude retomou e respondeu integralmente depois — cotas interromperam parte das tarefas, mas Claude não está mais bloqueado; o AGY, na última tentativa, continua bloqueado.
- Criado este arquivo (`CHANGELOG.md`).

Detalhes e limites: PENDENCIAS-REAIS.md. Próximos passos: CONTINUAR.md.


## 12/10/2026 10:55 UTC — Replay: gravação e interface comum passaram no Native; qualificação ainda pendente

O ensaio próprio Native39 R7 passou identidade/API, gravação SourceRecord de duas câmeras sintéticas (histórico parado de8,988s) e abertura CEF real da Mesa e janela separada com a mesma fábrica de interface, somente A/B. O quarto gate falhou antes do checkpoint de navegação: o observador do roteiro manteve um erro de fechamento HTTP. A permanência60s sem mutações não começou; os dez gates posteriores, incluindo quadros carregados A/B, agulha, IN/OUT, persistência, autosave e reinício, NÃO foram executados. Isso não comprova falha funcional desses recursos, nem qualifica a entrega. O recibo FAIL original permanece imutável.

Fechamento cooperativo e pós-observação independente concluídos:14PIDs próprios ausentes, nenhum executável/listener restante,2085pinos Native +3DLLs gerenciadas +169fontes +8arquivos do roteiro +2fixtures iguais, alocações zero e nenhum crash. O Native encerrou com código0; o código de saída da API é desconhecido. A retirada do observador não foi confirmada e a resposta de um helper de retirada ficou indisponível; esses limites continuam registrados, sem transformar o FAIL em PASS. Nenhuma alteração no operador.

A revisão do novo observador encontrou dois bloqueios de fechamento e pediu correção com regressões; só após revisão e testes do roteiro haverá novo ensaio Native finito. O combinado seguinte de169fontes está aceito em fonte, incluindo guarda que impede chamada externa do tick interno;15contratos CPU dessa guarda passaram. O novo Replay continua offside, sem integração canônica, instalação ou pacote. O montador R13 está aceito apenas como preparação; nenhum payload completo novo foi montado. Codec R13 foi materializado literalmente e verificado em sintaxe, mas precisa revisão independente de propriedade de processos antes da bancada; nenhum benchmark de codec foi executado.

Provas públicas: `docs/evidencias/20261012-replay-native39-r7-root` (resumo sanitizado e pós-observação). Preservar o desenho da Mesa, interface comum acoplada/separada e somente A/B. Prazo12/10 às19h America/Sao_Paulo mantido, sem conclusão automática nem declaração100%.
