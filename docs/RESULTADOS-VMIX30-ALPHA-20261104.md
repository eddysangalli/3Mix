# Resultados em andamento — consolidação vMix 30

| Recurso | Situação anterior / reutilização | Alteração / arquivos | Testes | Hardware / homologação | Commit / próxima ação |
|---|---|---|---|---|---|
| Letter spacing GT | Ausente no modelo; renderer SVG e editor existentes | modelos.js/mjs, render.js/mjs, gc.js; padrão 0, faixa -5..30px | test-gc-letter-spacing.mjs: 4/4; alteração no navegador refletiu SVG | Browser confirmado; CEF/motor não homologados | Local, sem commit; validar persistência e pacote |
| Copiar/colar estilo | Editor GC existente, styleKeys | gc.js; copia propriedades visuais sem textos/IDs/assets; exige salvar | Browser: copiar padrão, alterar para 6, colar restaurou campo/SVG para 0 | Não confundir estilo de título inteiro com edição de múltiplos objetos | Local; seleção múltipla ainda pendente |
| Conta-gotas | Não oferecido no editor | gc.js; botões por cor apenas com EyeDropper/contexto seguro | Browser enumerou 4 botões; captura interativa ainda não ensaiada | Disponibilidade em CEF a verificar; não anunciar suporte indisponível | Local; testar seleção/cancelamento nativos |
| Missões Alpha | Seis existentes | PEDIDO-COMUNIDADE-ALPHA.md: acrescentadas 7–11, sem remover anteriores | Revisão documental e diff --check | Não representam ensaio físico | Local; revisar capacidade por pacote |
| Matriz hardware | Homologado genérico sem evidência citada | MATRIZ-HARDWARE-HOMOLOGADO.md: Compatibilidade prevista e estados distintos | Revisão de linhas | Nenhum novo equipamento homologado | Exigir relatório por modelo/driver/modo |
| Distribuição | Ainda não verificada neste lote | Gates em LEIA-ME-BETA.md e LIMITES-CONHECIDOS.md | Nenhum instalador/runtime alterado | NÃO INCLUÍDO EM NOVO PACOTE por esta rodada | Validar manifesto, DLL/licenças, rollback e logs |

## Escopo ainda aberto
Relógios: PR 1 agora mesclado, mas mensagem/atalhos/persistência CEF exigem revisão real. PR 8 mesclado; mocks não comprovam operação física. GT: seleção/edição múltipla por objeto, presets e cor por dados não concluídos. Replay/Playout devem ser comparados com entregas do Antigravity, sem refazer. Headphones pós-Master, DeckLink multicanal/negociação, modelos AJA, emissores NDI/metadados, modos e diagnóstico SRT e vídeo entrelaçado continuam em auditoria; não declarados implementados por este documento.

## Evidências e limites
Preview estático porta 8377 serviu código de desenvolvimento. WebSocket /ws indisponível nesse servidor: a mensagem Reconectando é esperada e NÃO prova conexão com motor. Nenhum teste de salvar/colocar no ar foi declarado realizado. Nenhuma alteração no módulo de apresentações concorrente, motor nativo ou 3Mix IO. Nenhum pacote novo distribuído, commit ou merge realizado nesta rodada.
