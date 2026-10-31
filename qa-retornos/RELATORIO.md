# QA · Janela `Retornos SRT & N-1` (`painel/remoto/retornos.html`)

Rodada: 31/10/2026 · Escopo exclusivo da janela de Retornos de Externa (rota `/retornos`,
motores e outras janelas intocados). Sem sincronização com `3mix-runtime`, sem processos
do operador encerrados, sem janelas QA visíveis (Chrome headless via CDP).

## O que mudou

Arquivo único editado: `painel/remoto/retornos.html` (reskin + amarração aos dados/actions
reais do motor). CSS da página não é mais herdado de `vmix-dialogo.css`; usa
`3mix-tipografia.css` (tokens da suíte) + estilo próprio na paleta grafite
`#111318 / #14171c / #1a1d23`, bordas `#2a2e35`, verde do sistema `#2f9e5f`,
âmbar `#c9a227`, vermelho `#c05046`. Sem azul (`#0984e3`), sem roxo (`#6c5ce7`),
sem ciano/laranja decorativos.

- Topbar própria no padrão de Áudio/Replay: logo `3Mix`; faixa segmentada com o título
  `Retornos SRT & N-1` (item ativo, mesmo estilo de tab); chip `Projeto: <nome>` (rota
  `/api/json`, mesma fonte usada pela central de Áudio); à direita LED verde
  `Motor 3Mix conectado` + botões de janela (– □ inativos, × fecha).
- Sub-header com título de página 22 px `CANAIS DE RETORNO (RETURN FEEDS)`; o
  antigo chip azul virou subtítulo discreto 13 px muted
  `SRT CALLER/LISTENER + N-1 MIX-MINUS · retorno para repórteres…`;
  à direita `+ Adicionar Canal de Retorno` mantido (grafite com acento verde).
- Cards grafite (borda, radius 6): cabeçalho com nome (16 px, seção) + estado
  `● PARADO` (âmbar) / `● ATIVO` (verde) / `● ERRO` (vermelho); corpo em KV com
  labels 13 px e valores mono (Protocolo/Porta, Alvo/Destino, Origem de Vídeo,
  Mixagem de Áudio, Latência/Buffer); chips discretos para origem/mixagem — tom
  verde dessaturado no canal ao ar, grafite parado; página de métricas reais do
  canal (`N cliente(s) · RTT X ms · perda N%`) quando ao ar (`connectedClients`,
  `stats` do motor); rodapé do card com `▶ Ativar Sinal` (verde do sistema,
  mesmo gradiente de `vd-on`) / `■ Parar Sinal` e `Alterar para Clean Feed` ou
  `Alterar para Program Completo` (neutro).
- Rodapé padrão: `3Mix Retornos | <estado do transporte real>` (contagem derivada
  do summary do motor) + `Fechar` reutilizando `fechar-janela.js`/
  `window.FreeMixClosePanel()` (também no × da topbar).
- Tipografia global da suíte (`data-tipografia="3mix"`): página 22, seção 16,
  labels 13, corpo 14, botões 13, botão primário 36 px; estados hover, ativo,
  disabled e foco visível.

## Real × visual

Contrato real verificado em `ferramentas/return-feed-producao.mjs` (ReturnFeedManager),
`ferramentas/servidor-api.mjs` (`/api/return-feeds` → `summary()`/`execute()`),
`controle-producao.mjs` e fixture capturado da instalação (`qa-audio/fixtures/estado-producao.json`).

**É real (dispõe de dados do motor):**
- Lista de canais do summary (`feeds[]`): id, name, videoSource
  (`clean|program|preview|input`), audioMode (`n-1|master|bus_a|bus_b`),
  nMinusExclude, port, status (`stopped|running`), connectedClients,
  stats `{rttMs, packetLossPercent, sendRateMbps, uptimeSeconds}` e
  `activeFeedsCount`.
- Origem de vídeo, mixagem, porta, clientes, RTT, perda agora lidos dos campos
  reais (antes: `srtPort`, `srtMode`, `targetHost`, `latencyMs`, `status==='active'`,
  comparações em caixa alta — nunca casavam com o motor, exibiam porta 9000,
  “listener”, “Aguardando Caller Remoto”, “120 ms”, “PARADO” e badges
  PROGRAM COMPLETO/MASTER PGM fixos, ver capturas `antes/`).
- Comandos: `return_feed_start` / `return_feed_stop` / `return_feed_configure`
  (ações que o motor aceita; a tela antiga mandava `enable_feed`, `disable_feed`,
  `add_feed`, `configure_feed` com `updates{}` — todos rejeitados pelo motor
  com “Ação de return feed não reconhecida…”). Criar canal usa
  `return_feed_configure` com id novo (`return-N` livre), porque é assim que o
  `ReturnFeedManager.configureFeed` cria feeds desconhecidos.
- Estado de conexão do LED/janela vem do sucesso das chamadas; estilos de erro
  do servidor chegam como mensagem real no toast (`data.error` do motor é
  propagado; o servidor API devolve `{success:false,error}` 400 ao falhar).
- Mesmos endpoints/polling de antes: GET 3 s em `/api/return-feeds`, POSTs na
  mesma rota, e os globais `fetchFeeds/renderFeeds/toggleFeed/toggleCleanFeed`.

**Só visual (sem dado real):**
- Chip do projeto: nome vem de `/api/json.preset` (rota real da instalação); sem
  resposta, permanece `—`.
- `Latência/Buffer`: o summary do motor NÃO expõe `latencyMs`; a linha mostra
  `—` quando ausente e `N ms` quando o campo vier (tolerância mantida p/ payloads
  legados).
- `Alvo/Destino`: só "Aguardando Caller Remoto" (listener sem caller) — igual a
  antes, pois o motor não expõe alvo no summary; se `targetHost/targetPort`
  existirem no payload (legado/QA), o valor real é exibido.
- Modo SRT (listener/caller): o summary não traz o campo; aparece só se
  `feed.srtMode/feed.mode` existir.
- Estado `● ERRO`: o motor hoje nunca grava `status:'error'` (só `stopped`/
  `running`); o estado de erro existe e foi exercido com o feed `return-4` do
  fixture QA, permanecendo pronto para o estado real se o motor emitir.
- Botões de janela –/□ continuam desabilitados (como em Áudio; fechamentos reais
  na rota `/api/panel-close`).

**Não existe (nem antes nem agora, não foi inventado):**
- Remover canal: o motor não tem ação de remoção em `/api/return-feeds`
  (`execute` aceita apenas start/stop/configure/summary) e a tela antiga não
  tinha botão de remover. Mantido sem feitura.
- Caller/apontar destino: sem campo no summary nem no motor; mantido o texto
  “Aguardando Caller Remoto”.

## Preservado (inventário antes → depois)

| Item | Antes | Depois |
| --- | --- | --- |
| `#feeds-grid`, `#btn-add-feed` | ✔ | ✔ |
| `fetchFeeds()` `renderFeeds()` `toggleFeed(id,enable)` `toggleCleanFeed(id,vs)` | ✔ globais | ✔ globais (assinaturas idênticas) |
| Handlers inline por card (`toggleFeed` ×, `toggleCleanFeed` ×) | 4 cartões | 4 cartões |
| Fluxo de criação por prompts (nome, porta) | ✔ | ✔ mesmos textos/padrões |
| Endpoint/rota/polling | `GET/POST /api/return-feeds` · 3 s | idênticos |
| Mensagens de erro reais do servidor | `alert()` | toast com o mesmo texto (`data.error`) |

IDs novos (não quebravam nada): `project-name`, `status-led`, `connection`,
`win-close`, `close-btn`, `transport-state`, `ret-toast`. Título da página
mantém `Retornos de Externa` (exigido por `ferramentas/test-api-endpoints.mjs`).

## Execução do teste headless

1. `node qa-retornos/harness.mjs` (porta 8779): serve o painel real de
   `painel/remoto` e simula `/api/return-feeds` exatamente como o motor
   (mesmos campos, ações `return_feed_*`, criação por configure, erro para ações
   desconhecidas), `/api/json`, `/api/panel-close|panel-title`. Estado só em
   memória (o motor real persiste; nada é gravado na instalação). Marca
   “AMBIENTE DE TESTE” visível.
2. `node qa-retornos/capture.mjs antes` — abre a cópia original
   (`retornos.orig.anteshash.html`) e `depois` abre a página atual via Chrome
   headless (CDP), tamanhos 900×600 (janela padrão da rota), 1280×800,
   1440×900, 1600×1000; coleta console (Runtime/Log) por run.
3. Interações reais em `depois`: Parar Sinal num canal ATIVO, alternar Clean
   Feed→Program, adicionar canal (prompts simulados com texto original) e leitura
   de topbar/rodapé; confirma via `/api/qa-state` que os comandos bateram no
   servidor simulado (`return_feed_stop{feedId: return-2}`,
   `return_feed_configure{feedId: return-1, videoSource:'program'}`,
   `return_feed_configure{feedId: return-5, name, port 9101, clean, n-1, 120}`).

Resultados (`antes/` `depois/`, relatorio.json + PNG):

- 0 erros de console nos 4 tamanhos em ambas as fases.
- Sem overflow horizontal em 900×600/1280×800/1440×900/1600×1000; topbar 56 px,
  rodapé 44 px, página 70 px, primário 36 px.
- Depois: 4 cards corretos no carregamento (`● PARADO` âmbar, `● ATIVO` ×2 com
  clientes/RTT reais, `● ERRO`), valores reais (SRT :9998/:9999/:9002/:9003),
  chips verdes/`grafite` corretos; paleta conferida por `getComputedStyle`
  (primário rgb(26,29,35) com borda verde rgb(63,95,80); chip de card ativo
  rgb(34,48,38); chip parado rgb(43,47,54)).
- Antes: 4 cards com estado falso (todos `● PARADO` + porta 9000/listener/120 ms
  fictícios e badges fixos PROGRAM COMPLETO/MASTER PGM contra feeds realmente
  ao ar) — evidência do descolamento anterior entre tela e motor.

## Hashes

- original `retornos.html` (backup em `qa-retornos/retornos.orig.anteshash.html`):
  `2EDC9932A26612EFB323D82B5762F4D8F35E7314008CA2E797F327F6C29482BF`
- novo `retornos.html`: `2783DB8D906047B7D0F7405FB0D89245C16755441F5E441D6A4B320C0228F18C`

## Não tocados

Mesa, Áudio, Replay, Configurações, DSK, motor C++/libobs, servidores (`servidor-api.mjs`,
`servir-painel.mjs`, `controle-producao.mjs`), `3mix-runtime`, instalação portátil.
