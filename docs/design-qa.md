# Conferência visual 3Mix — 08/10/2026

Referências fornecidas pelo usuário: mesa vMix e janelas MultiCorder, Recording Setup, Playlist, Input Select e Streaming Settings. Comparação salva em `qa-portatil/comparativo-playlist-final.jpg`: imagens proporcionais no mesmo painel, sem deformação; a janela vMix original é menor, então não se afirma igualdade de pixel ou DPI.

## Evidência atual

- Playlist: `qa-portatil/playlist-ui-final.png`; criação, seleção e persistência de dois UUIDs pela interface com motor real. Corrigidos labels que apareciam ao lado das listas: agora títulos acima, duas listas claras, transporte e reordenação entre elas.
- Composer: `qa-portatil/composicao-ui-final.png`; duplicação seleciona imediatamente a nova entrada. Camadas, alinhamento e safe area presentes. Geometria/undo/bloqueio conferidos no motor.
- Dados: `qa-portatil/dados-ui-final.png`; nova lista de pessoas e mapeamento de variável enviados com confirmação real.
- Calls e Replay: `qa-portatil/calls-ui-20261008.jpg` e `replay-ui-20261008.jpg`.
- Macros/recuperação/controladores: `qa-portatil/macros-avancadas-ui.png`, `recuperacao-avancada-ui.png`, `controladores-avancados-ui.png`.

## Resultado e limitações

Conferência funcional das telas web aprovada no limite descrito. Aprovação visual 1:1 da mesa Qt completa permanece **bloqueada**: a captura disponível não representa corretamente as superfícies GPU do vídeo. Não usar telas de vídeo pretas como aprovação de bordas, reenquadramento ou mídia. Conferir a mesa nativa no monitor/DPI do operador.

- P2 aberto: organização completa de todas as janelas e todos os controles ainda não reproduz integralmente os prints. Central oferece acesso ao diálogo original para categorias ainda não migradas.
- P2 aberto: revisar tamanhos/alinhamentos em 100%, 125%, 150% e segundo monitor; relatório não comprova esses cenários.
- P3: nomes dos comandos e controles próprios diferem da referência por funções adicionais do 3Mix.

Não há afirmação de layout 1:1 final. Recursos pendentes ficam em `PENDENCIAS.md`; esta conferência não aprova transmissão externa, hardware nem carga longa.

## Composer livre nesta rodada

Captura /compor com motor real: qa-portatil/composicao-livre-ui-final.png. Frame nativo de composição com crop, rotação, borda e sombra: qa-portatil/composicao-livre-frame-nativo.png. Leitura de SVG/controles e geometria nativa conferidas; aprovação de toda a mesa Qt/DPI permanece pendente.

## Compositor e codecs — 2026-10-08

Referências: prints do operador e H2R Layouts /build. Galeria com 156 geometrias próprias, miniaturas numeradas e filtros de quantidade/orientação/família. Fundo por cor, imagem local ou entrada; edição com alças/guides/snap; criação seleciona a nova composição. Captura nativa por GET autenticado, limitada a960px e solicitações espaçadas500ms, sem transmissão externa. Galeria real capturada em qa-portatil/compositor-galeria-ui.png; captura final canvas após imagem em receipt específico. Central de codecs usa enumeração do motor e compatibilidade de protocolo; screenshot settings-codecs-protocolos-ui.png. Essas verificações de UI não substituem DPI/mesa nativa e aprovação visual do operador.
