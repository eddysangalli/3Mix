# Resultados em andamento — consolidação vMix 30

| Recurso | Situação anterior / reutilização | Alteração / arquivos | Testes | Hardware / homologação | Commit / próxima ação |
|---|---|---|---|---|---|
| Letter spacing GT | Ausente no modelo; renderer SVG e editor existentes | modelos.js/mjs, render.js/mjs, gc.js; padrão 0, faixa -5..30px | test-gc-letter-spacing.mjs: 4/4; alteração no navegador refletiu SVG | Browser confirmado; CEF/motor não homologados | Integrado no PR #9 |
| Copiar/colar estilo | Editor GC existente, styleKeys | gc.js; copia propriedades visuais sem textos/IDs/assets; exige salvar | Browser: copiar padrão, alterar para 6, colar restaurou campo/SVG para 0 | Não confundir estilo de título inteiro com edição de múltiplos objetos | Local; seleção múltipla ainda pendente |
| Conta-gotas | Não oferecido no editor | gc.js; botões por cor apenas com EyeDropper/contexto seguro | Browser enumerou 4 botões; captura interativa ainda não ensaiada | Disponibilidade em CEF a verificar; não anunciar suporte indisponível | Local; testar seleção/cancelamento nativos |
| Missões Alpha | Seis existentes | PEDIDO-COMUNIDADE-ALPHA.md: acrescentadas 7–11, sem remover anteriores | Revisão documental e diff --check | Não representam ensaio físico | Local; revisar capacidade por pacote |
| Matriz hardware | Homologado genérico sem evidência citada | MATRIZ-HARDWARE-HOMOLOGADO.md: Compatibilidade prevista e estados distintos | Revisão de linhas | Nenhum novo equipamento homologado | Exigir relatório por modelo/driver/modo |
| Distribuição | Ainda não verificada neste lote | Gates em LEIA-ME-BETA.md e LIMITES-CONHECIDOS.md | Nenhum instalador/runtime alterado | NÃO INCLUÍDO EM NOVO PACOTE por esta rodada | Validar manifesto, DLL/licenças, rollback e logs |

## Escopo ainda aberto
Relógios: PR 1 agora mesclado, mas mensagem/atalhos/persistência CEF exigem revisão real. PR 8 mesclado; mocks não comprovam operação física. GT: seleção/edição múltipla por objeto, presets e cor por dados não concluídos. Replay/Playout devem ser comparados com entregas do Antigravity, sem refazer. Headphones pós-Master, DeckLink multicanal/negociação, modelos AJA, emissores NDI/metadados, modos e diagnóstico SRT e vídeo entrelaçado continuam em auditoria; não declarados implementados por este documento.

## Evidências e limites
Preview estático porta 8377 serviu código de desenvolvimento. WebSocket /ws indisponível nesse servidor: a mensagem Reconectando é esperada e NÃO prova conexão com motor. Nenhum teste de salvar/colocar no ar foi declarado realizado. Nenhuma alteração no módulo de apresentações concorrente, motor nativo ou 3Mix IO. Nenhum pacote novo distribuído, commit ou merge realizado nesta rodada.


## Continuação — evidência nativa e coordenação

- Commit concorrente 90c0d85 incorporou operações de presets e missões adicionais. Não atribuir esse commit exclusivamente a esta sessão; não sobrescrever trabalho integrado pela outra frente.
- Reordenação e exclusão múltipla: GCLibraryEngine.execute usa commit() e restauração em falha; ações protegidas como locais tanto no HTTP quanto no WebSocket. test-gc-preset-operations.mjs: 3/3 PASS. Controles foram encontrados no browser estático; execução com biblioteca real conectada ainda pendente.
- DeckLink: plugins/decklink/decklink-device-instance.cpp, StartOutput(), chama EnableAudioOutput com 2 canais fixos. Logo a saída examinada é estéreo; não pode ser descrita como saída de 16 canais. O SDK ter capacidade multicanal não muda esse caminho. Há enumeração/conversão 8/10 bits no código, mas ensaio físico e alcance por entrada/saída exigem confirmação.
- AJA: SDK local .deps/obs-deps-2026-07-15-x64/include/libajantv2/ajantv2/includes/ntv2enums.h contém DEVICE_ID_KONAX/KONAXM e CORVID88. Não é prova de Corvid 88 Gen 3 nem IP25; revisão e APIs específicas ainda não confirmadas.
- SRT: header da dependência nativa local identifica 1.5.2 (não deduzir a versão da DLL instalada apenas pelo header). FFmpeg externo e transporte compilado são inventários separados.
- AudioBusesEngine.direct() tem ganho independente volume e filtro audio_monitor, mas o fato de existir não comprova pós-Master: target() exclui barramentos legados Master por política. Caminho Headphones pós-Master permanece parcial/a investigar; não ativado nem alterado.

Retomada automática desta sessão: job 33e1f744, a cada 15 minutos enquanto a sessão estiver aberta/ociosa, expiração em sete dias. Cancelar ao concluir a entrega consolidada; não cancelar por concluir apenas este lote.


## Lote GT — estilo em múltiplos títulos salvos

Ação gc_library_style_many reutiliza GCLibraryEngine.commit(): valida IDs e propriedades antes de alterar, preserva textos/posição/assets, atualiza versões vinculadas H/V e recusa qualquer alvo ou versão vinculada no Programa/overlay. Proteção local incluída no HTTP e WebSocket. Interface reutiliza a seleção múltipla de títulos salvos; não é seleção de objetos internos GTZIP.

Testes combinados test-gc-letter-spacing.mjs + test-gc-preset-operations.mjs: 10/10 PASS. Cobrem versões vinculadas, rejeição no ar, campos inválidos e restauração em falha de persistência. Navegador confirmou seletor multiple e botão Aplicar estilo aos selecionados; operação persistida contra API/motor ainda não homologada. Arquivos: gc-biblioteca-producao.mjs, servidor-api.mjs, gc.js e teste de presets. Alterações locais, sem pacote/runtime atualizado por este lote.


## Auditoria de monitoramento e regressão combinada

WASAPI nativo (libobs/audio-monitoring/win32/wasapi-output.c, on_audio_playback) multiplica a escuta por source->user_volume. Confirma acompanhamento do fader dessa fonte, não ganho de Headphones independente. AudioBusesEngine.direct usa filtro audio_monitor com linked:false; fonte oficial consultada em https://github.com/exeldro/obs-audio-monitor/blob/master/audio-monitor-filter.c mostra tap em filter_audio e linked:true podendo alterar volume da fonte. Não habilitar linked:true como atalho para pós-Master: isso arriscaria alterar o áudio transmitido. Versão upstream consultada não prova versão binária instalada. Recurso Headphones pós-Master continua PARCIAL, sem botão de suporte fictício criado.

RELATORIO-NDI-OMT-MULTIPLOS.md contém histórico de decodificação simultânea de dois NDI e dois OMT, com hash e recibos QA. Evidências citadas não encontradas nos caminhos locais consultados nesta rodada; não reclassificar como homologação de rede física ou quatro emissores de cada protocolo. Preservar histórico e solicitar recibos originais.

Execução combinada nesta rodada: test-srt-presets.mjs, test-deinterlace-producao.mjs, test-input-deinterlace.mjs, test-audio-buses-asio.mjs, test-gc-preset-operations.mjs e test-gc-letter-spacing.mjs: **47 casos node:test PASS, zero falhas**. São contratos de software com mocks onde os arquivos assim definem, não ensaios de placas, áudio acústico ou transmissão nativa. Nenhum processo do operador iniciado/parado.


## Correção funcional SRT — unidade de latência

Defeito comprovado no gerador de presets: API latencyMs=120 gerava URL latency=120, enquanto obs-ffmpeg-srt.h lê a query sem conversão e depois divide s->latency por 1000 antes de SRTO_LATENCY. Isso truncava para 0ms. Corrigido buildSrtQueryParams para serializar latencyMs*1000 (microssegundos). URLs manuais existentes não são migradas/alteradas automaticamente; apenas geração explícita via presets muda. Teste de roundtrip cobre 20/120/2000/60000ms. test-srt-presets.mjs: 12/12 PASS. Sem ensaio de conexão SRT nativa nesta execução; sem cópia para runtime. Corrigir também qualquer pacote anterior que contiver o gerador antigo antes de homologação Alpha.


## Checkpoint de recuperação — regressão consolidada

50 casos node:test PASS, zero falhas: SRT, player GT, presets GT, deinterlace e ASIO. Evidência: qa-finalizacao/vmix30-distribuicao/regressao-atual.txt. core.js reconstruído com letterSpacing; novo teste executa window.GC.update do bundle real e confirma 4px/default 0. Gerador atualizado para classificar letterSpacing como estilo. Sem alteração de runtime nesta execução. Plugin manager está sendo editado por outra frente e permanece intocado por esta sessão. Próximo gate: integração no pacote e teste nativo, sem confundir VM/browser com motor físico.


## Correção do empacotador incremental

montar-atualizacao-mesa.mjs resolvia repo como <repo>/FreeMix (inexistente) e ws como o próprio repo; agora usa updateRoots() com raiz real derivada do script. A política anterior excluía toda biblioteca GC, impedindo atualizar core.js e renderer/modelos. Nova política inclui SOMENTE os seis módulos de código conhecidos e continua excluindo assets, páginas customizadas, títulos importados, catálogo do operador, configurações e gravações. Test-update-path-policy: 4/4 PASS, incluindo traversal e caminhos absolutos. O gate de checkout limpo, assinatura Ed25519, inspeção do pacote e aplicação separada permanecem intactos. Pacote ainda não gerado: checkout compartilhado tem alterações concorrentes e é corretamente recusado pelo gate; não relaxado para fabricar um release. Runtime não modificado.


## Correção Playout — duração efetiva

MediaPlayoutEngine.summary somava durationMs bruto, divergindo do IN/OUT usado na interface. Agora playoutItemDurationMs limita OUT à duração conhecida e desconta IN, sem produzir números negativos/NaN. A interface usa o mesmo contrato. Quatro testes passaram, incluindo execução da função real updatePlaylistTotals extraída da UI (IN=2s, duração=10s, OUT=12s resulta DUR=8s/POS=1s/REM=7s). Não altera Auto Next nem promete itens desabilitados: esse contrato ainda precisa ser fechado separadamente. Teste CEF de relógios requer depuração 9333 e altera estado temporariamente; não executado contra motor do operador.


## Persistência GT e regressão relógios

Novo caso de test-gc-preset-operations usa save()/setScope() reais em subpasta QA do projeto: grava títulos, aplica estilo em lote, reordena, instancia biblioteca nova, confirma valores e ordem, remove e relê novamente. 7/7 PASS nesta suíte; transporte/motor não simulado como homologado. test-clock-message.mjs também PASS no checkout atual integrado. Teste de mensagem não comprova CEF/reabertura nativa.

Normalizados escapes de controles em srt-presets.mjs/test-srt-presets.mjs para texto legível (sem bytes NUL literais no fonte); 13/13 testes SRT PASS. Alterações de plugin manager continuam concorrentes e não foram sobrescritas. Nenhum pacote assinado nem aplicação ao runtime realizado nesta rodada.


## Playout — habilitar/desabilitar e Auto Next

enabled opcional (default true) persiste nos itens. Navegação automática e chains pulam desabilitados; TAKE recusa item desabilitado inclusive se o Preview tiver cópia antiga. DUR da lista exclui itens desabilitados. Checkbox usa sendCommand/playout_item_update existente; mesma ação acessível pelo contrato API. Desabilitar item atualmente playing é recusado, sem parar o sinal. autoNext=false agora impede avanço ao terminar (antes era salvo mas não consultado no ramo play_next). Seis testes de duração/navegação/Auto Next PASS. Sem homologação nativa de reprodução nesta rodada.


## Recuperação de falhas na seleção Playout

enabled é validado antes da mutação; falha de save restaura o valor anterior (inclusive ausência do campo em projeto legado). Checkbox desabilita durante envio e retorna ao estado anterior se comando falhar. Auto Next e skip cobertos em sete testes. Resta confirmar interface conectada e playback nativo, sem tráfego ao motor do operador.


## Playout — persistência e atalho compartilhado

_normalizeLegacyList preserva enabled e autoNext explícitos, com padrões true para projetos antigos. Teste grava playlist em disco, reabre nova instância e confirma exclusão de desabilitados no total e navegação. Nova ação playout_item_enabled passa pelo normalizador operacional de macros, valida ID/booleano e delega ao mesmo playout_item_update (sem segundo motor). Seletor de macro expõe a ação com parâmetros JSON. Dez testes Playout PASS; ainda sem teste físico de reprodução.


## Coordenação de homologação

Outra frente publicou modernização SRT/plugins/Slides (commits 6d2ebe8, 62ae7f3 e 2264064) e alterou os temas das missões 7–11. Não refazer essas implementações nem aceitar a matriz como prova física sem recibos. Criado ALPHA-SUPLEMENTO-HARDWARE-VMIX30.md e link no guia: preserva os cinco roteiros exigidos (DeckLink, AJA, NDI, SRT, entrelaçado) sem apagar missões concorrentes. Numeração original explicitada para evitar confusão. Não representa conclusão dos adaptadores nativos ainda parciais.


## Segurança da distribuição — processo 3Mix e rollback

Defeito no guard Windows de atualizar-3mix.mjs: regex de tasklist reconhecia FreeMix.exe/obs64.exe mas não 3Mix.exe. Incluído nome oficial; teste extrai regex real e verifica 3Mix/legados/auxiliares versus processo alheio. Teste isolado de update assinado executado: 6 verificações PASS com apply/rollback reais em instalação sintética, hash adulterado recusado antes de escrita, mesma versão recusada e recuperação de falha. Chaves QA, nunca chave de produção; instalação do operador intocada. Correção ainda precisa integrar o pacote/runtime antes de uso como proteção efetiva instalada.


## Guard de atualização — pertencimento por componentes

processBlocksUpdate compara caminhos canônicos por componentes (case-insensitive), recusando processo ativo dentro da instalação ou sem caminho conhecido, sem confundir pasta irmã com prefixo semelhante. Corrige fragilidade de misturar barra de root resolvida e separador literal. Dois testes de guard PASS e seis verificações reais de update/rollback sintético PASS novamente. Comparação direta confirmou runtime ainda com regex antiga sem 3Mix.exe: NÃO declarar proteção instalada até atualização verificável. Nenhum processo nem runtime do operador modificado.


## Política de dependências do pacote

A lista de dependências literais agora aplica dependencyUpdatePath após normalizar o destino: import relativo não pode contornar exclusões de config, painel/local.js, assets privados ou sair da raiz. Módulos GC próprios continuam permitidos explicitamente. Cinco testes de política PASS; regressão consolidada de nove suítes: 68 casos PASS, zero falhas. Update/rollback assinado em instalação sintética: seis verificações PASS novamente. Não há aprovação de hardware implícita nem aplicação ao runtime.


## Distribuição das instruções Alpha

alphaReleaseDocuments inclui obrigatoriamente guia, suplemento hardware, matriz, limites e leia-me no incremental; montagem recusa documento ausente. Não basta atualizar docs no checkout. Seis testes da política PASS, regressão consolidada 69 casos PASS. Isso valida seleção de arquivos, não assinatura/aplicação de um pacote desta versão: release ainda depende de congelar revisão, gerar artefato assinado e ensaiar instalação isolada. Runtime do operador não alterado.


## Gate SRT preservado por permissão

Identificada ambiguidade na aplicação de passphrase vazia: o validador permite vazio, mas a mesclagem preserva senha já presente na URL. Tentativa de implementar remoção explícita foi NEGADA pela permissão da sessão por desativar criptografia salva. Nenhuma alteração aplicada, nenhuma tentativa de contorno. Requer autorização explícita do proprietário para mudança desse comportamento; até lá manter senha existente. Regressão independente: 43 casos PASS; test-clock-message também PASS.

Investigação de Rendezvous: header local obs-ffmpeg-srt.h valida lp extraído de localport mas atribui la.sin_port=htons(port). Necessita confirmar significado de port e versão binária efetiva antes de corrigir; não declarar defeito de transmissão comprovado apenas por esse trecho, não conflitar com testes SRT nativos da outra frente.


## Ensaio de payload real assinado — QA, não release

test-updater-payload-real.mjs montou pacote com bytes reais de core/modelos/render/editor GC, SRT presets, atualizador e cinco documentos Alpha; assinatura Ed25519 com chave efêmera exclusiva QA. inspect/apply verificaram todos os hashes instalados; rollback restaurou player anterior e versão e removeu arquivos novos. PASS. Recibo: qa-finalizacao/vmix30-distribuicao/payload-rehearsal.json. Nenhuma chave de produção, nenhum runtime do operador, nenhum motor iniciado. Artefato temporário removido após ensaio, não distribuído como release.

Bloqueio concreto do montador completo: o único freeze localizado referencia native build antigo 709f101 em caminho vmixtwste removido; não representa o motor/runtime atual após modernizações concorrentes. É necessário freeze válido da revisão nativa atual antes de assinar release de produção. Não substituir por caminho inventado nem declarar pacote entregue por este ensaio parcial.


## Compilação nativa — resolução canônica

compilar-2026.ps1 estava resolvendo workspace como repositório do painel e procurando freemix-app dentro dele. Corrigido para pai do repo e irmão 3mix-engine; mantido lock e parâmetros originais. Teste de contrato confirma CMakeLists real no destino e preservação do gate; parser PowerShell valida sintaxe. Nenhum build iniciado, nenhum binário substituído, nenhuma nova proveniência de freeze declarada.


## Build incremental em execução

Verificados fonte nativa limpa, ausência de lock e nenhum MSBuild/cmake/ninja/cl/link ativo. Iniciado compilar-2026.ps1 -Target obs-studio em background, sem ExecutionPolicy Bypass e sem iniciar motor. Resultado ainda pendente; não declarar build PASS. Inventário de sete binários instalados registrado em qa-finalizacao/vmix30-distribuicao/native-runtime-inventory.json, explicitamente NÃO um freeze de build nem prova de correspondência com commit. Bateria de contratos paralela: 45 casos PASS.


## Interface de macro Playout

A ação playout_item_enabled recebeu rótulo legível e exemplo JSON com ID do primeiro clipe quando disponível, sem oferecer seletor de entrada irrelevante. Browser estático confirmou rótulo, parâmetros e campo de entrada oculto; dez testes do contrato Playout PASS. Não houve envio ao motor nem gravação de macro do operador. Build nativo anterior continua sem resultado recebido nesta sessão; não relançado nem declarado aprovado.


## Escopo adicional autorizado — miniaturas e Resizable BAR

- Pendente: opção “pular 1 quadro a cada N quadros” somente nas miniaturas dos Inputs, acompanhando a frequência da produção (30/60 e taxas racionais), sem alterar Preview/Program ou saídas.
- Diagnóstico do fonte atual painel/mesa.html, thumbLoop: hot limitado a 350 ms, cold em rodízio de uma captura a cada 1000 ms, mais esperas de 75/125 ms. Não é um fluxo de vídeo com descarte por quadro; aumentar uma opção sem substituir esse agendamento não entrega a fluidez pedida. Manter fontes invisíveis suspensas, backpressure e prioridade dos comandos. Implementação e medição ainda pendentes.
- ReBAR: nvidia-smi nesta máquina identificou RTX 4060 Laptop, driver 621.01, BAR1 total 8192 MiB. Isso não comprova ganho do aplicativo nem otimização equivalente ao vMix. libobs-d3d11 usa recursos D3D11 dynamic/default/staging; busca não encontrou integração explícita ReBAR. Investigar mecanismo oficial aplicável antes de implementar, com fallback e benchmark. NÃO declarar suporte otimizado ou criar botão fictício.
- Runtime do operador não alterado; nenhum processo iniciado/parado. Esses itens não substituem nenhuma pendência da auditoria original.


## Gate nativo DeckLink — inicialização não equivale a operação

Inspeção do motor canônico plugins/decklink/decklink-device-instance.cpp, StartOutput: retorno de SetScheduledFrameCompletionCallback e StartScheduledPlayback não é verificado antes de marcar mode/output e retornar true. Falhas após EnableVideoOutput/EnableAudioOutput retornam sem rollback explícito dessas habilitações. São lacunas de tratamento de erro identificadas no fonte, NÃO falhas reproduzidas em placa. Corrigir com verificação HRESULT e unwind antes de declarar saída operacional; testar callbacks/playback recusados, liberação após falha e nova tentativa, além de compilar o plugin.

Saída multicanal continua PARCIAL: decklink-output.cpp solicita SPEAKERS_STEREO na conversão e StartOutput solicita dois canais. Não elevar somente EnableAudioOutput a 16: o buffer e o mapeamento precisam corresponder, respeitando capacidade do SDK/dispositivo. Nenhuma placa homologada por esta inspeção. Fonte nativa compartilhada na branch feat/obs33-dsk com arquivos concorrentes não versionados; nenhum arquivo dessa frente alterado.


## Consolidação — relógios e gravação GTZIP

| Recurso | Anterior | Reutilizado | Alteração | Arquivos | Testes executados | Hardware | Homologação | Commit/PR | Próxima ação |
|---|---|---|---|---|---|---|---|---|---|
| Mensagem de relógios via automação | UI de mensagem existente, sem ação operacional específica encontrada | Slot freemix_clocks, BroadcastCustomEvent, macros e ControllerEngine | clock_message com validação, persistência/readback e editor de macros | ferramentas/relogios-comandos.mjs, automacao-operacional.mjs, controle-producao.mjs; painel/remoto/macros.js | 6 casos PASS; macro salva/relida em disco QA; navegador confirmou inclusão do passo | Nenhum para contratos; runtime CEF para integração final | Implementado e testado em software; runtime/pacote pendentes | ab85294, 1c887c3, b872acb, 8117846; PR 13 aberta | Ensaiar tecla → macro → topbar e reabertura no runtime isolado |
| Gravação de campos GTZIP | Proteção parcial de duplo envio | executeGtImport, verificação SHA-256 e persistência existentes | Serialização UI durante save, bloqueio de troca de título/ações, recuperação de erro | painel/remoto/gc-gtzip.js; ferramentas/test-gtzip-save-integration.mjs; qa-finalizacao/gtzip-save-ui | Browser QA confirmou bloqueio/erro/sucesso; disco real confirmou save/reload/rollback e recusa de adulteração | Nenhum para esses ensaios | Testes de software concluídos; CEF/pacote pendentes | d6fa7a2, 25ba2c7; PR 13 aberta | Integrar no pacote sem tocar títulos privados |

Esses resultados NÃO concluem seleção/edição múltipla de objetos internos, cor dinâmica por objeto, monitor pós-Master, hardware, ReBAR ou distribuição. Nenhum pacote novo aplicado ao operador. Testes de transporte simulado não são ensaio físico.
