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
