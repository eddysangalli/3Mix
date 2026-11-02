
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
<!-- prazo-humano-20261012-1900 -->
## Prazo vigente — segunda-feira, 12/10/2026, às 19h de Brasília

Pedido direto do dono em 11/10: entregar o sistema pronto amanhã às 19h (22h UTC), substituindo o prazo anterior de 13/10. Coordenar Claude CLI e Antigravity continuamente enquanto disponíveis, acompanhar cada tarefa até uma entrega revisável e verificar cota quando houver parada. Com um provedor indisponível, seguir pelo outro; com ambos limitados, aguardar e verificar disponibilidade espaçadamente. Não inventar saldo nem tratar timeout ou resposta vazia como falta de créditos.

A automação existente passa a acompanhar a cada 20 minutos; tentativas de provedor com limite prolongado permanecem espaçadas. Preservar a mesa do operador. Entregar código, documentação e pacote local qualificado; registrar separadamente o que ainda não passou em testes ou depende de equipamento/rede/licença. O prazo não transforma recurso pendente em concluído. A meta antiga do aplicativo está em `usageLimited`; a ferramenta disponível não permite editar seu objetivo/prazo. Este bloco e a automação registram o novo prazo sem encerrar falsamente a meta antiga.

Pedidos do replay preservados: agulha com visualização durante a busca e IN/OUT preciso, listas sequenciadas com transições e curva de velocidade. Comparar codecs para qualidade, gravação, leitura e busca rápidas com testes próprios; distinguir compressão sem perda de qualidade visualmente próxima. Recursos novos e pacote completo atual continuam pendentes de integração/qualificação.

---
# Plano de conclusão até 13/10
<!-- rodada-20261010-noite -->

**Situação em 10/10, 23h30.** Passo 4 (validar o App com a fonte final) **concluído** para Native36 + painel atual: [App36 R4e PASS](evidencias/20261011-app36-r4e-real-pass/ROOT-README.md). Ordem daqui para a frente:

1. Conferir e corrigir o que a revisão de código dos patches 0025–0036 confirmar (pequeno; vira Native37).
2. Compilar, congelar, repetir o ensaio de App (8 min) no Native37.
3. Selar o instalador novo, instalar em pasta própria, abrir/fechar duas vezes, diagnóstico e desinstalação; publicar commit e push.
4. Em paralelo, sem segurar o instalador: Calls contínuo (segue desligado), RNNoise, LocalVocal com filtro vivo, FTB 29,97 completo.
5. Terça, 13/10: conferir a entrega e listar o que depende de equipamento, licença ou rede.

---

## Registro anterior (Codex)
Entrega selecionada: **0.1.0-local.20261010060000, Native24/a047860**, imutável. Fonte atual Native36/e81afe7 compilada viaALL_BUILD e congelada:2085arquivos,36patches/3submódulos/231snapshots reconstruídos. Cursor retido integrado; reinício NTSC real33 PASS no cursor, fullFTB ainda pendente. Ainda não há novo instalador aprovado. Native30/93d73e2 e candidato093000/FAIL permanecem históricos.

1. Fechamento176324 conferido; ReplayR3 real PASS e fechou cooperativamente. Preservar FAILs originais; novos QA fecham automaticamente com guardas corretas.
2. Root+3 agentes: MesaR4 fonte integrada54checks Root; QualidadeR5+abasR6 integrada; revisar/integrar hostProjetosR5 e qualificar; Root mantém arquivos centrais. Não copiar draftsR2 defeituosos.
3. Native32/877b214 já compiladoALL_BUILD/exportado/frozen; executar checks reais pertinentes próprios de guardas/política/clock. DistroAV só compila com fontes/proveniência/dependências estabelecidas.
4. Derivar App de fontes finais atuais e validar UI real/latência/persistência; repetir Replay pertinente32 e executar qualidadepixels/PCM/ASR. OriginalFAIL preservado, critérios intactos.
5. Corrigir/provar AVCalls e resetNTSC; não promover helpers QA/defaultOFF. Separar leitura de cursor de PTS apresentado.
6. Selar novo pacote assinado local com fontes qualificadas, fazer checks novos relevantes e publicar commit/push. Setup600 e demais entregas históricas permanecem imutáveis.
7. Na terça conferir entrega e listar o que depende de equipamentos/WAN/licenças. Remover automação somente quando objetivo realmente concluído.

Preservar a mesa/API51911, vMix, Calls, REC, mídia e configurações do operador. Máximo Root+3 agentes, testes em raízes/portas próprias, fechamento cooperativo; nenhum force. Todos os Native QA anteriores foram encerrados e conferidos. Novos ensaios usam prefixo FreeMix-QA-, ownership/PID/marker, qaClose e fechamento cooperativo automático, sem depender do usuário; nenhuma proteção foi contornada. Não reviver alpha web abortado; ponte nativa beta separada. Commit/push GitHub e pacote local autorizados; nenhum upload/publicação de serviços ou dados externos. O prazo não transforma recurso sem prova em concluído.

[Medidores e fechamento](evidencias/20261010-meter30-real-pass/ROOT-README.md) · [FTB30/NTSC](evidencias/20261010-ftb-native30-gate6/ROOT-README.md) · [Calls AV](evidencias/20261010-calls-av-muted-consumer/ROOT-README.md) · [Replay/cadência](evidencias/20261010-replay-full-cadence-r2/ROOT-README.md) · [Saídas](evidencias/20261010-outputs-read-ack/ROOT-README.md) · [Governança cliente e capacidades](evidencias/20261010-quality-project-update-checkpoint/ROOT-README.md) · [MesaR4](evidencias/20261010-mesa-r4-root/ROOT-README.md).

Histórico anterior preservado em historico/20261010-1255-before-current-status/.


[Replay30 realR3](evidencias/20261010-replay30-real-r3-pass/ROOT-README.md) · [QualidadeR5/abasR6](evidencias/20261010-quality-r5-tabs-r6-root/ROOT-README.md) · [Native32](evidencias/20261010-native32-build/ROOT-README.md).

Histórico exato anterior: historico/20261010-1335-before-replay-quality-native32/.


## Atualização adicional — assistente de projetos R5 integrado

Root integrou29 arquivos do host/API/assistente, manteve autenticação local e a mesma conexão SDK compartilhada, e repetiu10 modelos de funções reais e28 verificações de sintaxe. A closure oficial alcança104 módulos, incluindo JSON de política e os imports do painel. O primeiro check Root esqueceu o parâmetro de roots do painel; a falha foi preservada, e a revisãoR2 confirmou os29 destinos/backups antes de finalizar.

Configurar → Novo projeto · prévia e o Hub agora abrem o assistente em três etapas: formato, quatro posições de câmera/áudio e conferência. Exportação da prévia permanece disponível; criação e consulta física continuam desabilitadas por política false/false até QA próprio de cobertura e Native. O fluxo prepara um projeto novo/inativo e restaura o atual; não ativa câmeras, áudio ou transmissão. Não equivale a projeto pronto no ar.

O adaptador de consulta teve correção separada: timeout bloqueia a conexão antiga, uma nova conexão pode consultar, e resposta/timer antigos não contaminam o contexto atual. Root repetiu3 modelos. Isso não cancela pedidos já enviados e não reseta um gate global BLOCKED. MesaR4 recebeu apenas o acesso ao novo assistente, conservando suas proteções de leitura/UUID e o launcher/health existente; navegação e latência real aguardam App32.

Qualidade32 R3 já encerrou: imagem/ASR finitos PASS, áudioMaster silencioso e35 alocações mantêm FAIL; confira a atualização adicional abaixo. LocalVocal catálogo/modelos teve revisão de fontes, mas ainda aguarda compilação/qualificação cumulativa. Selected600 continua imutável.

[Host, menu e reconexão](evidencias/20261010-project-host-r5-root/ROOT-README.md).


## Conferência real adicional — Qualidade32 e Antigravity

Qualidade32 R3 executada e encerrada: cor +70/off0, nitidez energia2,23×/off0, chroma verdealpha0/primeiro planoalpha255/off0; Tiny português confirmou3/5tokens de fala sintética própria em4s. Cinco recusas de NVIDIA/inglês/campo inválido tiveram zero escrita. Isso prova estes estímulos finitos, não qualidade geral de microfone/IA. A R2 anterior falhou por fixture sem pixels elegíveis; o FAIL foi preservado e a R3 manteve os mesmos critérios.

R3 continua FAIL: seis segmentos digitais Master em silêncio não qualificam RNNoise/preset de voz; rota/captura ainda precisam isolamento. Fechou cooperativamente exit0 sem crash, porém registrou35 alocações. Foi encontrado um vazamento concreto de referência no callback LocalVocal ao obter settings do texto sem release; correção cumulativa está em preparação, sem atribuir todas as35 a esse ponto. Root conferiu PID113228 ausente e rehash2085origem+2085destino/26QA/46bases/4externos PASS em revisão separada. Nenhum critério foi relaxado nem relatório original trocado.

App32 preparado com450 arquivos idênticos à fonte atual; Root leu runner completo, contratos/fechamento/handoff e guardas. Execução própria de menus/Preview/Cut/persistência ainda pendente. Assistente hostR5 já integrado, criação/scan continuam false/false. Native32 e setup600 permanecem imutáveis; nenhum instalador posterior foi aprovado.

Antigravity autenticado e CLI respondeuOK com sucesso; catálogo confirmou gemini-3.8-flash-high e uma análise auxiliar terminou com resposta. Saldo/cota não quantificado. Conforme preferência atual do usuário, as três frentes passaram a priorizar Gemini em diretórios isolados com somente fontes públicas selecionadas; Root acompanha e revisa. Não enviar logs, mídia, configurações ou credenciais do operador. Resposta vazia/timeout não equivale a tarefa concluída; continuar até resultado ou cota indisponível, então seguir no Codex.

[Qualidade32 R3 — resultado parcial e falhas preservadas](evidencias/20261010-quality32-real-r3-partial/ROOT-README.md) · [Falha de fixture R2 preservada](evidencias/20261010-quality32-real-r2-fixture-fail/ROOT-README.md).


## Estado mais recente — Qualidade32 R4 / menus App32 R2

Nove arquivos de fonte integrados: consulta protegida GETsettings em três clientes, fechamento de132 módulos, saídas escuras com escolha explícita e três etapas.12 modelos UI+24 de leitura+checks de sintaxe/closure PASS. Build cumulativo LocalVocal R3 offline real configure0/build0; DLL5aa7f14d… somente QA, não operador/Setup600.

Qualidade32 R4: pixels cor/nitidez/chroma e áudio Master real/preset digital/restauração PASS, ASR português sintético3/5 PASS. RNNoise FAIL1,0358dB<3. Filtros foram removidos/desabilitados antes do fechamento ordinário, que passou exit0/alloc0/crash0/pins. Não declarar cancelamento em voo nem shutdown com filtro vivo;17 casos negativos e transcrição inglesa ainda não qualificados. Históricos R2/R3 e35 alocações preservados.

App32 R2: cinco telas reais Root IAB conferidas; Replay/settings no endereço correto. GETsettings e contratos HTTP não mudaram contadores; configs/áudio pós-IAB permaneceram iguais. Mesmo assim abrir/polling enviou duas ações Production.run (0→2), execute1→3/journal2→8: FAIL, investigação em andamento. Preview/Cut/latência ficaram sem execução. PIDs79660/157048 ausentes, fechamento exit0/alloc0/Meter0/crash0 e2085+452pins PASS. Eventos iniciais Root sem scope foram recusados e preservados; ACK/prova corretos aceitos, sem mexer no critério.

Calls continua drift9,78ms/s FAIL; FTB antigo2702→33→0 FAIL. Próximas frentes próprias: abertura da mesa, observaçãoNTSC com cena Programa distinta e diagnóstico clock real Calls, RNNoise e shutdownLocalVocal vivo. Native32 congelado e setup0.1.0-local.20261010060000 imutáveis; nenhum novo instalador aprovado, nem operador alterado. Gemini permanece primeira escolha para análises delegadas de fontes públicas selecionadas; quotas não quantificadas, resultados revisados pelo Root.

[Evidência real R4/R2 e limites](evidencias/20261010-quality32-r4-and-app32-r2/ROOT-README.md) · [Build cumulativo](evidencias/20261010-localvocal-cumulative-r3-build/ROOT-README.md).


### FTB32 R3 — diagnóstico adicional

Observação própria concluída com cena Programa distinta e UUID original ativo. UmRESTART:1601→1634→33(fallback inválido,epoch2,resetReadyfalse)→0(PTS submetido válido,mesmaepoch,resetReadytrue). Critério original continua FAIL; fullFTBPass=false. Quatro capturas fonte/barcodes e áudio digital Master440/880Hz/interior do arquivo PASS. PID84792ausente, exit0/alloc0/crash0/fullpinsPASS. Sem reconhecimento físico nem PTS de áudio da fonte. [Recibo e limites](evidencias/20261010-ftb32-r3-reset-observation/ROOT-README.md).


## Correção de abertura ociosa — fonte integrada, prova real pendente

Root integrou atalhos-engine.js: blur/pagehide deixam de enviar controller_release quando não existe controle pressionado ou pedido pendente; teclado/MIDI/manual/adaptador preservam liberação defensiva e ACKs antigos não apagam posse nova.21 modelos do IIFE real, pins e sintaxe PASS; closure132 intacta. Correspondência com os dois comandos AppR2 é estática/temporal: o ledger antigo não guardou seus nomes. AppR2 FAIL e primeiro modelo falho preservados. AppR3 real e Preview/Cut/latência/persistência continuam pendentes; nenhuma mesa/API/Native do operador tocada. Setup600 permanece selecionado e imutável.

[Correção e limites](evidencias/20261010-controller-release-idle-root/ROOT-README.md).


## Native33 — compilado, cursor retido; reset real pendente

Root integrou três fontes retained-r2: último PTS válido retido sob mutex em vez do next_pts futuro do decoder durante reset.19 modelos Root e oracle legado sobre195 amostras históricas passaram como previsão de modelo; o FAIL real anterior fica preservado. Native33 c990c4a39c445542d363f6950fb8f7f70811034a foi configurado/compilado ALL_BUILD e congelado2085 arquivos, rehash independente PASS; exportação33patches/3submódulos/231snapshots e reconstrução--checkPASS. Timestamp inválido/política de cursor mudaram explicitamente; novo observador exige contrato novo, sem alterar limiares. Nenhum Native executado nesta rodada e FTB continua não qualificado.

A guarda de atalhos também está integrada (21 modelos), mas App real com zero mutações/Preview/Cut/latência/persistência segue pendente. Polls Native talkback/network_output com manutenção não são leituras puras e não serão escondidos para obter PASS. CallsAV e RNNoise continuam FAIL; LocalVocal vivo/cancelamento pendente. Setup600/Native24 permanece selecionado e imutável; versão0.1.0-local.20261010161000 é somente desenvolvimento.

[Native33 e limites](evidencias/20261010-native33-retained-cursor/ROOT-README.md) · [Navegação ociosa](evidencias/20261010-controller-release-idle-root/ROOT-README.md).


## Entradas — menus e confirmação de editor integrados em fonte

Root integrou mesa/menu +helper: sourceUUID/sceneUUID/coleção, conferência de conexão após awaits, proteção contra abertura dupla e aviso persistente separando pedido aceito de janela observada. Sem retry da primeira escrita quando há timeout. Configurar/Filtros seguem por fonte; duplicações da mesma identidade foram removidas. Recolher cartão descreve a ação local; Excluir entrada conserva recibo UUID/coleção e proteções Programa/keyers.34 contratos Root CPU/DOM reais+sintaxe+closure132 PASS, helper incluído pelo pacote. Nenhum Native/API/browser/desktop iniciado aqui. Abertura/foco/z-order/latência/persistência reais continuam pendentes; não declarar janela física corrigida. Setup600 e operador preservados.

[Entradas: fonte, prova e limites](evidencias/20261010-input-editor-feedback-root/ROOT-README.md).


## Native33 — reinício NTSC real passou no cursor

Um RESTART próprio,196samples completos:1634→1634(retido/inválido,epoch2)→33(válido/ready) e progressão, sem segunda volta. Oracle legado sem alterar critérios:PASS; originalNative32FAIL preservado. Quatro capturas/barcodes44/11/41/116 e PCM Master440/880Hz/interior PASS. PID27684CIMausente, exit0/alloc0/crash0 e2085+2085/22/54/3pins intactos. FTB/SRT ficaram desligados; fullFTBPass=false e tela física/AV/WAN não provados. [Recibo e limites](evidencias/20261010-ftb33-r4-retained-cursor-real/ROOT-README.md).


## Native34 — consultas de estado separadas; build PASS, QA real pendente

Root integrou uma fonte após40checks: network/state sem inserir mapas/criar output-view-áudio/carregarSDK/aposentar mídia; capacidade cacheada no startup/start explícito. Timer e writes conservam aposentadoria terminal. talkback/state deixa expiração ao watchdog existente. Configure/ALL_BUILD/2085frozen+rehash/34patches/3submódulos/231snapshots/reconstruçãoPASS. Fonte 0.1.0-local.20261010171617 somenteDEV; nenhum Native34 iniciado nesta rodada. SDK real, scheduler/readonlyApp34/Preview-Cut/latência/persistência/fechamento continuam gates. Sem relaxar zero mutação.

Antigravity priorizado: implementação headless recusada/vazia/truncada nos limites finitos, fallback declarado; isso não é prova de falta de cota. Revisões curtas inline do Gemini concluíram54,5s/89s sem ferramentas. LocalVocal telemetria OFF/CMake e Calls result-order continuam drafts/preparações, sem build ou prova de cancelamento/AV. Setup600 selecionado e imutável. [Build, fonte e limites](evidencias/20261010-native34-readonly-state/ROOT-README.md).


## Native35 — inventários explícitos de áudio e SDI; compilado, teste real pendente

Root integrou onze arquivos de produto (seis Native/cinco painel) após repetir25modelos áudio e13SDI e verificar as revisões independentes. Leituras de áudio usam inventários cacheados sem criar sessão/timer ASIO nem enumerador WASAPI. Atualizar dispositivos consulta explicitamente. SDI/destinos leem cache; Consultar placas e modos faz refresh explícito e configure/start revalidam. IDs salvos ausentes permanecem indisponíveis, sem escolher outro driver automaticamente. Parar Direct Out existente continua possível sem inventário e sem criar filtro. Configure ASIO registra imediatamente invalidação de perfil/coleção; watchdog permanece.

Native35 5b680a17a1db65c66ce6a696f1da8ca69d29f49e ALL_BUILD/2085arquivos rehash/35patches/3submódulos/231snapshots/reconstrução--checkPASS. Fonte 0.1.0-local.20261010175421 somenteDEV. Nenhum Native35 iniciado. App34 bloqueado original preservado; App35 precisa snapshot/classificação atual e QA real com zero comandos/mutações ao abrir menus. Dirty-form DirectOut está em revisão separada: polling ainda pode sobrescrever uma escolha pendente até essa correção. Não há prova física de ASIO/SDI/HDR, hotplug ou latência/watchdog. Flags de inventário não certificam hardware.

Gemini foi priorizado: áudio recebeu resposta vazia/exit0 e SDI timeout vazio; fallback operacional documentado, sem alegar cota. Revisão compacta de áudio retornou2334bytes/31,9s e recebeu crítica independente. Setup600 permanece selecionado e imutável. [Fontes, pinos e limites](evidencias/20261010-native35-device-inventory/ROOT-README.md).


## Direct Out — escolhas pendentes preservadas, teste real ainda pendente

Root integrou um arquivo frontend final após19checks VM/DOM/UTF8 e9independentes. Polling conserva dispositivo, volume, atraso e ligar/desligar; Aplicar/Descartar ficam bloqueados durante ACK e refresh. ACK tardio não limpa uma edição nova nem uma nova fonte. Fonte/coleção/queda observada descartam somente o draft local. Não há escrita automática ou retry. Repro anterior de botões habilitados durante ACK e versão com texto corrompido foram recusados/preservados antes da integração.

Reconexão invisível entre polls com mesmos IDs continua sem geração no contrato; falha GET/DOM não prova geração Native. O HTTP legado não comprova cancelamento nem tem deadline de operação nesta mudança. Nenhum Native/API/navegador/dispositivo iniciado por este ensaio. [Fonte, revisão e limites](evidencias/20261010-direct-out-draft-preservation/ROOT-README.md).

Revisão transitive adicional encontrou um bloqueador em Native35: audio_capabilities chama defaults de SourceRecord, que alcançam callbacks do encoder escolhido no perfil. Não será classificado como leitura pura genérica. Nova correção mínima está em revisão: observar a capability uma vez no startup e em atualização explícita, guardar resultado/known e ler cache no getter, preservando os busesISO do replay após startup. Native35 build/2085pins/reconstrução permanecem válidos; App35 não foi iniciado. Nova fonte/build e App próprio ainda precisam de qualificação. Setup600 continua selecionado e imutável.


## Native36 — capability SourceRecord cacheada após inicialização

Gemini implementou a correção mínima em uma fonte e fez revisão independente com respostas reais de3486/3123bytes. Root repetiu14modelos de statements extraídos e3do consumidor Replay, verificou19pinsautor+9revisão/8inputs e integrou. Capability SourceRecord inicia false/unknown; FINISHED_LOADING observa uma vez depois dos módulos, Atualizar dispositivos reobserva, getter serializa somente bool/known. Nenhum novo scanASIO/WASAPI no startup. Callback de defaults do encoder continua manutenção declarada na inicialização/refresh, não uma leitura pura genérica. Isso conserva o contrato dos busesISO após startup sem alterar Replay.

Native36 e81afe793708bd17821c9dc866b066783251e5fc ALL_BUILD/2085arquivos rehash/36patches/3submódulos/231snapshots/reconstrução--checkPASS. Fonte 0.1.0-local.20261010181335 somenteDEV. Nenhum Native36 iniciado. App34BLOCKED e blockerSourceRecord35 preservados; App36 deve observar bool/known pósREADY e repetir as cinco telas com zero incrementosrun/execute/journal/mutatingReq e snapshots iguais. Depois Preview/Cut/ACK/latência/persistência. Startup com encoder externo pode ter latência; não é homologação física nem cancelamento/watchdog. DirectOutfinalff4a integrado19+9modelos, com limites de reconexão invisível/HTTP herdado. Setup600 permanece selecionado e imutável. [Fonte, pinos e limites](evidencias/20261010-native36-source-record-cache/ROOT-README.md).


## App36 — teste real: capability passou; gate de menus falhou no autosave

Root abriu e reviu cinco telas próprias. SourceRecord known/premix true após READY, sem discovery; buses A/B do Replay disponíveis. GET HTTP manteve contadores; defaultsNative zero em HTTP/IAB. Áudio/destinos/configuração não mudaram. Durante a permanência nas telas, journal2→3 e mutatingReq19→20: FAIL preservado, run0/execute1 iguais. Journal próprio registrou autosave60,645s após native_state; fonte mostra timer60s→capture(false)→backup→save_preset. Navegação não foi comprovada como causa e identidade da chamada mascarada não foi observada diretamente.

Preview/Cut/dedupe/persistência não executados após a falha. Native72084 encerrado cooperativamente e CIM ausente, APIexit0/alloc0/Meter0/crash0, pins2085Native+453runtime intactos. Sem dados do operador ou nova instalação selecionada. Foco: autosave consciente de mudanças com proteção de recuperação preservada; nenhuma exclusão de contadores nem desligamento para passar. [Prova e limites](evidencias/20261010-app36-real-readonly-fail/ROOT-README.md).


A integração mecânica exata do módulo de autosave foi de ANTES a57f → DEPOIS a245, com 15 contratos CPU executados pelo autor Gemini e repetidos pelo Root. O revisor Gemini REVIU os contratos mas NÃO EXECUTOU. O save_preset continua ESCRITA/MUTANTE NUNCA readonly, com intervalo de 60s e gates zero intactos. O App36R3FAIL está preservado, o App36R4 em runtime real permanece PENDENTE e Setup/Native continuam congelados sem alteração. [Recibo de integração](ROOT-RECEIPT.json).


## 12/10/2026 10:55 UTC — Replay: gravação e interface comum passaram no Native; qualificação ainda pendente

O ensaio próprio Native39 R7 passou identidade/API, gravação SourceRecord de duas câmeras sintéticas (histórico parado de8,988s) e abertura CEF real da Mesa e janela separada com a mesma fábrica de interface, somente A/B. O quarto gate falhou antes do checkpoint de navegação: o observador do roteiro manteve um erro de fechamento HTTP. A permanência60s sem mutações não começou; os dez gates posteriores, incluindo quadros carregados A/B, agulha, IN/OUT, persistência, autosave e reinício, NÃO foram executados. Isso não comprova falha funcional desses recursos, nem qualifica a entrega. O recibo FAIL original permanece imutável.

Fechamento cooperativo e pós-observação independente concluídos:14PIDs próprios ausentes, nenhum executável/listener restante,2085pinos Native +3DLLs gerenciadas +169fontes +8arquivos do roteiro +2fixtures iguais, alocações zero e nenhum crash. O Native encerrou com código0; o código de saída da API é desconhecido. A retirada do observador não foi confirmada e a resposta de um helper de retirada ficou indisponível; esses limites continuam registrados, sem transformar o FAIL em PASS. Nenhuma alteração no operador.

A revisão do novo observador encontrou dois bloqueios de fechamento e pediu correção com regressões; só após revisão e testes do roteiro haverá novo ensaio Native finito. O combinado seguinte de169fontes está aceito em fonte, incluindo guarda que impede chamada externa do tick interno;15contratos CPU dessa guarda passaram. O novo Replay continua offside, sem integração canônica, instalação ou pacote. O montador R13 está aceito apenas como preparação; nenhum payload completo novo foi montado. Codec R13 foi materializado literalmente e verificado em sintaxe, mas precisa revisão independente de propriedade de processos antes da bancada; nenhum benchmark de codec foi executado.

Provas públicas: `docs/evidencias/20261012-replay-native39-r7-root` (resumo sanitizado e pós-observação). Preservar o desenho da Mesa, interface comum acoplada/separada e somente A/B. Prazo12/10 às19h America/Sao_Paulo mantido, sem conclusão automática nem declaração100%.
