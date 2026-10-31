# Replay — janela principal, aproximação ao mockup (30/10/2026)

Escopo desta rodada: somente a janela principal de Replay (`replay.html` + view/estilo do Replay) e o cabeçalho/rodapé dela. `replay-settings.html`, `replay-settings.js`, `replay-disco.mjs`, Mesa, Áudio, motor e `3mix-runtime` não foram alterados.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `painel/remoto/replay-mockup-view.js` | Estrutura do topbar/subbar, players, quadview, timeline, tabela, detalhes e rodapé. IDs e `onclick` existentes preservados. |
| `painel/remoto/replay-mockup-bindings.js` | Camada visual sobre o controlador existente: badge PRONTO, speed chip, tape de IN/OUT, contador de câmeras, estado colorido do rodapé, cartões de ângulo e aviso de “Salvar projeto”. |
| `painel/remoto/replay-mockup-operacao.css` | Reescrita da pele graphite com verde/vermelho/azul/âmbar operacionais, escala 13–14 px no corpo, 14 px em títulos de seção e monitores maiores. |

`replay.html` e `replay.js` foram conferidos por hash e **não** mudaram nesta rodada. `replay-settings.html` também não foi tocado (segue com a alteração do agente de configurações, de 18:32).

## O que foi aproximado do mockup

- Topbar 3Mix com logo real, abas Mesa/Áudio/Replay, projeto com ponto verde, relógio, Salvar projeto e Configurações.
- Subbar com SSD gravando em vermelho, REC, espaço em disco, slow-motion em âmbar, vínculo A/B e capturas −5/−10/−20 s; MARCAR IN claro e MARCAR OUT verde.
- Players A/B maiores, timecode e seek sobre a imagem, badge PRONTO (âmbar) / NO AR (vermelho) / ARQUIVO AUSENTE, chip de velocidade, transporte com IN/OUT, quadro e play/pause.
- Quadview com quatro faixas coloridas por câmera, flag CAM n, seleção azul, contador “4 CAM” e timecode do histórico.
- Timeline do histórico com trilho de ticks, faixa IN/OUT, marcador IN vermelho, OUT verde, playhead azul e duração.
- Tabela de lances com título/tipo, horário, duração, ângulos, disponibilidade com semáforo e botões A/B.
- Detalhes com edição de título/categoria, trim IN/OUT, quatro cartões de ângulo 2×2 e ações de carregar A/B.
- Rodapé com estado AO VIVO/NO AR/ARQUIVO AUSENTE colorido, “Colocar Player X no ar” vermelho e “Voltar ao vivo” com retorno e transição.

## Teste headless

Servidor de fixture: `fixture-server.mjs` (serve os arquivos reais de `painel/` e simula `/api/replay`, `/api/json` e `/api/effects-frame`). Capturas: `shot.mjs`; contraste: `contrast.mjs`.

Viewports capturados: **1440×900**, **1600×1000**, **1280×800** (e 1152×720 / 960×600 como regressão).

| Viewport | Monitores A/B | Linhas visíveis da tabela | Overflow horizontal | Erros de console/página |
|---|---|---|---|---|
| 1440×900 | 492×343 | 4 de 4 | não | 0 |
| 1600×1000 | 548×374 | 4 de 4 | não | 0 |
| 1280×800 | 432×309 | 4 de 4 | não | 0 |

Inventário de IDs: **102 exigidos, 0 ausentes**. Comandos dinâmicos (criados por `addEventListener`, sem `onclick` inline): 26, esperados nos botões de linha/detalhe. Nenhuma resposta HTTP ≥ 400. O único `requestfailed` é `ERR_ABORTED` em `/api/panel-title` no encerramento da página de teste (o `workspace-nav` já trata esse fetch como opcional).

Interações exercitadas no headless:

- selecionar lance e abrir detalhes;
- marcar IN e OUT no histórico e conferir faixa/duração;
- carregar lance no Player B e conferir badge PRONTO + tarja âmbar;
- colocar Player B no ar e voltar ao vivo;
- abrir diálogo de arquivo ausente do Player B;
- abrir Configurações pelo topbar;
- clicar Salvar projeto e conferir a mensagem;
- atalhos de teclado A/B alterando o player do rodapé.

## Limites desta validação

- Tudo acima foi validado em **Chromium headless** com o fixture, não no CEF embutido do motor. Frames reais, REC SSD real, seek/reprodução de clipes e a API de quadro do histórico continuam dependendo do motor e não foram acionados nesta rodada (sem copiar para `3mix-runtime`, sem abrir QA visível e sem encerrar processos).
- Os cartões de ângulo mostram nome/estado/ações reais; não há miniatura por ângulo porque o contrato atual não entrega uma imagem por clipe no detalhe. Não foi inventado quadro.
- A timeline usa a janela real do histórico (10 min no fixture). Quando IN/OUT ficam a poucos segundos do fim, os marcadores ficam próximos; os rótulos foram separados em alturas diferentes, mas não foi criado zoom de janela para não alterar o controle compartilhado.
- Em 1280×800 o painel de detalhes rola internamente quando um lance está selecionado; a tabela mantém as quatro linhas e os monitores não foram reduzidos.

## Capturas

- `before/` — estado plano anterior, mesmo fixture.
- `after/` — estado novo: `replay-1440x900.png`, `replay-1600x1000.png`, `replay-1280x800.png`, `replay-detalhe.png`, `replay-timeline-marcada.png`, `replay-player-b-pronto.png`, `replay-no-ar.png`, `replay-voltar-ao-vivo.png`, `replay-configuracoes.png`, `replay-localizar-arquivo.png`, `replay-sem-conexao.png`.
- `after/audit.json` — medidas, contraste, IDs e estados.
