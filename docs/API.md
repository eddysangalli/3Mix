# Manual da API do 3Mix

Referência para desenvolvedores e, principalmente, para IAs e automações que precisam ler o estado da produção, comandar a mesa e integrar outros sistemas ao motor do 3Mix.

- Versão curta para IAs: [`docs/api/llms.txt`](api/llms.txt)
- Índice gerado do código (todas as rotas, ações, funções vMix e vendor requests): [`docs/api/indice-acoes.json`](api/indice-acoes.json), produzido por `scripts/documentacao/gerar-indice-api.mjs`
- Teste que impede este manual de envelhecer calado: `ferramentas/test-manual-api.mjs`

Convenções deste manual:

- **[verificado]** = o exemplo ou comportamento foi executado contra um motor real numa bancada isolada (`qa-api/verificar-exemplos.mjs`) e a resposta bateu com o que está escrito.
- **[código]** = confirmado lendo o código-fonte, sem execução.
- **[não verificado]** = não foi possível confirmar; trate como hipótese.
- Os exemplos usam a porta padrão `8088` e entradas chamadas `CAM 1` e `CAM 2`. Troque pelos nomes, chaves ou números do seu projeto.

---

## 1. Visão geral e arquitetura

```
 Integração (IA, script, Companion, Stream Deck, painel remoto)
        │  HTTP JSON  /  WebSocket /ws  /  vMix HTTP (/api?Function=)  /  vMix TCP (8099)
        ▼
 ┌──────────────────────────────────────────────┐
 │ API do 3Mix (Node.js)  ferramentas/servidor-api.mjs
 │  ├─ Production (controle-producao.mjs): fila única, confirma cada comando no motor
 │  ├─ módulos *-producao.mjs (saídas, overlays, GC, áudio, macros, rundown, PTZ, ...)
 │  └─ serve também as páginas do painel (/corte, /audio, /replay, ...)
 └──────────────────────────────────────────────┘
        │  obs-websocket v5 (ws://127.0.0.1:<porta do motor>)
        │  requests padrão + CallVendorRequest (vendors "freemix", "downstream-keyer", ...)
        ▼
 Motor nativo 3Mix (FreeMix.exe, derivado do OBS/libobs) — vídeo, áudio, saídas, atraso
```

Pontos importantes:

1. **A API é a porta recomendada.** Ela serializa os comandos numa fila única, confere no motor o resultado de cada operação (por exemplo, depois de um CUT ela só responde sucesso quando o Programa mudou de fato), mantém AFV, barramentos de áudio, tally, macros, diário de recuperação e recibos de operação. [código]
2. **O motor também aceita obs-websocket direto** (seção 10). Use só para o que a API não oferece, porque o acesso direto pula essas garantias.
3. **A unidade principal é o INPUT** (uma cena pública do motor). Cenas internas começam com `3Mix ` (`3Mix Barramentos`, `3Mix Slot N`, `3Mix Tarja`, `3Mix Placar`, `3Mix GC <id>`) e não aparecem como entradas. [código]

## 2. Portas e descoberta

| Serviço | Porta | Endereço de escuta | Como mudar |
|---|---|---|---|
| API HTTP + WebSocket `/ws` + páginas | `8088` (padrão) | `127.0.0.1` | `FREEMIX_API_PORT`, `FREEMIX_API_HOST` [código] |
| Compatibilidade vMix TCP (**desligada por padrão desde 03/11/2026** — decisão de produto: a API própria, não o vMix TCP, é o caminho oficial de automação/controladoras) | `8099` | **nenhum, por padrão** (`127.0.0.1` se ligada) | liga com `FREEMIX_ENABLE_VMIX_TCP=1`; muda porta/host com `FREEMIX_VMIX_TCP_PORT`/`FREEMIX_VMIX_TCP_HOST` — expor na LAN exige dizer os dois explicitamente [código] |
| obs-websocket do motor | a de `config/obs-studio/plugin_config/obs-websocket/config.json` (`server_port`) | `127.0.0.1` | arquivo de configuração da instalação |

- O inicializador (`ferramentas/iniciar-api.mjs`) usa a porta de `painel/local.js` (`window.MESA_LOCAL.replayUrl`), ou `8088`. Se ela estiver ocupada por outro programa, procura uma livre entre **18188 e 18198** e grava a escolhida em `painel/local.js`. Uma instalação de operador pode, portanto, estar em `18188`. [código]
- A API só escuta na rede local (`0.0.0.0`) se `config/obs-studio/plugin_config/freemix-control/network.json` tiver `"allowLan": true` (gravado por `POST /api/network-enable`, que pede confirmação do Windows). Fora disso, só o próprio computador alcança a API. [código]
- **Descoberta:** `GET /api/health` (só no próprio computador) responde `app` (`"FreeMix"`, identificador interno), `brand: "3Mix"`, `protocol: 1`, `installationId` (SHA-256 do caminho da instalação em minúsculas), `port`, `pid`, `connected` (API conectada e com estado confirmado do motor), `transportConnected`, `connectionErrors`, `projectTransaction` e `disk`. [verificado]

```json
{"success":true,"app":"FreeMix","brand":"3Mix","appName":"3Mix","protocol":1,
 "installationId":"f515a0ed…","pid":34216,"connected":true,
 "projectTransaction":{"phase":"IDLE","busy":false,"blockCode":null,"jobs":0,"wires":0,"discardedEvents":0},
 "transportConnected":true,"connectionErrors":{},"port":18461,
 "disk":{"supported":true,"freeGb":174.5,"totalGb":3725.9,"estRecordingHours":27.8,"severity":"OK"}}
```

Regra para automações: só envie comandos com `connected: true`. Com `connected: false` a API ainda responde, mas o estado pode estar desatualizado e os comandos falham com `Sem conexão com o motor 3Mix`.

## 3. Autenticação, pareamento e origem

A função `authorized(req)` de `servidor-api.mjs` decide o acesso a tudo que começa com `/api` e ao `/ws`. [código]

1. **Origem (`Origin`)**: se o pedido traz o cabeçalho `Origin`, o host dele precisa ser igual ao `Host` do pedido. `Origin: null` (página `file://`) só vale no próprio computador. Pedido sem `Origin` (curl, Node, Python) passa por esta etapa. Origem diferente recebe **401**. [verificado: `Origin: http://exemplo.invalido` → 401]
2. **Loopback** (`127.0.0.1`, `::1`): sempre autorizado, sem token.
3. **Outro computador da rede**, uma das duas:
   - `Authorization: Bearer <token>`. O token é gerado a cada início da API e gravado em `config/obs-studio/plugin_config/freemix-control/acesso.json` (`apiToken`), junto com o PIN. Só quem lê esse arquivo tem o token.
   - Cookie de sessão `freemix_session`, obtido com o PIN de 6 dígitos em `POST /api/pair` `{"pin":"123456"}`. A sessão vale 12 horas (`HttpOnly; SameSite=Strict`). O PIN aparece em `GET /api/access` (só no computador do 3Mix) e muda a cada início da API. Mais de 10 tentativas por minuto do mesmo IP → **429**; PIN errado → **401**. [verificado no loopback: PIN errado → 401, PIN certo → 200 com `Set-Cookie`]

**CORS**: a API só devolve `Access-Control-Allow-Origin` para a mesma origem. Uma aplicação web hospedada em outro endereço **não consegue** chamar a API pelo navegador; faça a integração por um processo de servidor (Node, Python) ou por uma página servida pela própria API. [código]

**Rotas e ações só no computador do 3Mix**: várias rotas respondem **403** quando o pedido não vem do loopback, mesmo com token ou sessão (marcadas "local" na seção 6). Em `/api/control`, as ações de configuração também são locais (seção 7.2). [código]

## 4. Início rápido

Todos os exemplos abaixo rodam no próprio computador do 3Mix (sem token).

### curl

<!-- verificavel: curl | espera: "connected":true -->
```bash
curl -s http://127.0.0.1:8088/api/health
```

<!-- verificavel: curl | espera: "success":true -->
```bash
curl -s -X POST http://127.0.0.1:8088/api/control -H "Content-Type: application/json" -d '{"action":"preview","input":"CAM 2"}'
```

<!-- verificavel: curl | espera: "stage":"confirmed" -->
```bash
curl -s -X POST http://127.0.0.1:8088/api/control -H "Content-Type: application/json" -d '{"action":"cut","operationId":"corte-0001","expectedScope":"Meu Projeto"}'
```

<!-- verificavel: curl | espera: <Function result="Success"/> -->
```bash
curl -s "http://127.0.0.1:8088/api/?Function=PreviewInput&Input=CAM%201"
```

<!-- verificavel: curl | espera: "state":" -->
```bash
curl -s http://127.0.0.1:8088/api/delay
```

### JavaScript (Node 18+ ou página servida pela própria API)

<!-- verificavel: js | espera: Preview agora: CAM 2 -->
```js
const API = 'http://127.0.0.1:8088';

const estado = await (await fetch(API + '/api/json')).json();
console.log('Programa:', estado.program, '| Preview:', estado.preview, '| no ar:', estado.streaming, '| gravando:', estado.recording);

const resposta = await fetch(API + '/api/control', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'preview', input: 'CAM 2' })
});
const corpo = await resposta.json();
if (!corpo.success) throw new Error(corpo.error);
console.log('Preview agora:', corpo.state.preview);
```

### JavaScript com WebSocket (Node 22+ tem `WebSocket` global; no navegador, só em página servida pela API)

<!-- verificavel: js | espera: ack p1 true -->
```js
const ws = new WebSocket('ws://127.0.0.1:8088/ws');
ws.onmessage = (evento) => {
  const m = JSON.parse(evento.data);
  if (m.type === 'init') {
    console.log('Programa:', m.data.program);
    ws.send(JSON.stringify({ id: 'p1', action: 'preview', input: 'CAM 2' }));
  }
  if (m.type === 'ack' && m.id === 'p1') {
    console.log('ack', m.id, m.success, m.error ?? '');
    ws.close();
  }
};
```

### Python (só biblioteca padrão)

<!-- verificavel: python | espera: ok API -->
```python
import json, urllib.request, urllib.error

API = "http://127.0.0.1:8088"

def chamar(caminho, corpo=None):
    dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
    pedido = urllib.request.Request(API + caminho, data=dados, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as erro:   # 4xx também traz JSON {"success": false, "error": ...}
        return json.load(erro)

estado = chamar("/api/json")
print("Programa:", estado["program"], "| conectado:", estado["connected"])
r = chamar("/api/control", {"action": "preview", "input": "CAM 2"})
print("ok" if r["success"] else r["error"], r.get("state", {}).get("preview"))
```

Para WebSocket em Python use uma biblioteca como `websocket-client` ou `websockets`; o protocolo é o da seção 8. [não verificado em Python]

## 5. Estado da produção (`GET /api/json` e `init` do `/ws`)

`GET /api/json` (sem `Function`) devolve o estado completo, o mesmo objeto enviado em `{"type":"init","data":…}` ao abrir o `/ws` e em cada `{"type":"state","data":…}`. O objeto é grande (na bancada, cerca de 240 KB de JSON, mais da metade em `gcLibrary` e `compositionPresets`); prefira o `/ws` a consultas repetidas. [verificado]

Campos principais [verificado na bancada]:

| Campo | Tipo | Significado |
|---|---|---|
| `connected` | bool | estado confirmado no motor |
| `preset` | string | projeto (coleção de cenas) aberto; é o `expectedScope` das operações |
| `scenes` | string[] | nomes das entradas públicas, na ordem dos números |
| `inputs` | objeto[] | entradas: `name`, `number` (1…), `key` (UUID da cena), `sources`, `type` (`Camera`, `Video`, `VideoList`, `Browser`), `media`, `position`, `duration`, `state`, `loop`, `muted`, `volume` (0–100), `audioBuses` (`"M,A"`), `health`, `tally {program, preview}` e, em composições, `composition` |
| `program`, `preview` | string | nome da entrada no Programa e no Preview |
| `tally` | `{program:[], preview:[]}` | todas as fontes visíveis no Programa (inclui overlays) e no Preview |
| `transition`, `transitions` | string, objeto[] | transição atual e lista do motor (`transitionName`, `transitionKind`, `transitionUuid`) |
| `overlays` | `[{number, scene}]` | canais DSK numerados e a entrada em cada um (`""` = vazio) |
| `overlaysEngine` | objeto | canais 1–8 com transição, DVE, auto-off |
| `audioInputs` | objeto[] | fontes de áudio: `name`, `kind`, `volumeMul`, `volumeDb`, `muted`, `tracks`, `monitor`, `balance`, `levels`, `bus` (`M`, `A`, `B` ou `null`) |
| `buses` | bool | barramentos `3Mix Master`, `3Mix Bus A`, `3Mix Bus B` montados |
| `recording`, `streaming` | bool | gravação e transmissão principal ativas |
| `recordTimecode`, `streamTimecode` | string | `HH:MM:SS.mmm` |
| `video` | objeto | `baseWidth`, `baseHeight`, `outputWidth`, `outputHeight`, `fpsNumerator`, `fpsDenominator` |
| `broadcastDelay` | objeto | igual a `GET /api/delay` (seção 7.9) |
| `operation`, `operationReceipts` | objeto, objeto[] | último recibo e recibos recentes (seção 11) |
| `media` | objeto[] | fontes de mídia (`state`, `position`, `duration`, `items`, `speed`, `loop`, `autoNext`) |
| `macros` | objeto | `items`, `triggers`, `job`, `actions`, `events`, `conditions` |
| `playout`, `rundown`, `calls`, `gc`, `gcLibrary`, `dataSources`, `variables`, `people`, `controllers`, `preflight`, `blackbox`, `returnFeeds`, `audioDucking`, `audioRouting`, `signals`, `recoverySession`, `globalHotkeys` | objetos | resumo de cada módulo |
| `replay`, `iso` | objeto | estado do Replay e da MultiGravação |
| `ips` | string[] | IPv4 da máquina |
| `inputHealth`, `outputWatchdog`, `multiview`, `auxMatrix` | objeto | telemetria, watchdog de saídas, multiview e matriz AUX |
| `revision`, `updatedAt` | número | contador de atualizações e horário (ms) |
| `sourceInputs`, `sourceStatus` | objeto[] | todas as fontes do motor (`key`, `name`, `kind`) e situação de cada uma |

Exemplo real reduzido de uma entrada:

```json
{"name":"API Teste B","number":3,"key":"d9d30f11-6a7b-4e54-aaa2-e220a72612e6","sources":["API Teste B Cor"],
 "type":"Camera","media":null,"position":null,"duration":null,"state":null,"loop":false,"muted":null,"volume":null,
 "audioBuses":"","tally":{"program":false,"preview":true}}
```

**Identificar uma entrada** nos parâmetros `input`: aceita o **nome**, a **chave** (UUID, campo `key`) ou o **número** como texto só de dígitos (`"2"`). A busca é nessa ordem: nome ou chave, depois número. Para automações, prefira a `key`, que não muda quando o operador renomeia. [código]

`GET /api` (ou `/api/`) sem `Function` devolve o estado em **XML no formato do vMix** (`<vmix><version>27.0.0.1</version>…<inputs>…<overlays>…<preview>…<active>…<recording>…<streaming>…<audio>…</vmix>`). [verificado]

## 6. Referência das rotas HTTP

Legenda de acesso: **qualquer** = loopback ou dispositivo autorizado (seção 3); **local** = só no computador do 3Mix (403 fora dele). Todas as respostas são JSON, salvo indicação. `Cache-Control: no-store` em todas.

### 6.1 Descoberta, acesso e pareamento

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/health` | GET | local, sem autorização prévia | — | seção 2 [verificado] |
| `/api/access` | GET | local | — | `{pin, expires, urls[], redes[{nome,url}]}` [verificado] |
| `/api/pair` | POST | qualquer origem aceita | `{"pin":"123456"}` | `200 {success:true}` + cookie; `401` PIN errado; `429` excesso [verificado no loopback] |
| `/api/qr.svg` | GET | local | `?address=http://<ip desta máquina>:<porta>/<página>` | SVG do QR [código] |
| `/api/network-enable` | POST | local | — | executa `runtime/freemix-network-setup.exe` (pede confirmação do Windows) e responde `{success, reabrir:true}`; vale ao reabrir o 3Mix [código; não executado] |

### 6.2 Estado e operações

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/json` | GET | qualquer | — ou `?Function=` (vMix, seção 9) | estado completo (seção 5) ou `{success}` [verificado] |
| `/api` e `/api/` | GET | qualquer | — ou `?Function=` | XML vMix ou `<Function result="Success"/>` [verificado] |
| `/api/control` | POST | qualquer (ações de configuração: local) | `{action, ...}` | `{success:true, state, ...extra}` (seção 7) [verificado] |
| `/api/operation-check` | GET | qualquer | `?id=<operationId>&scope=<preset>` | `{success, operation, current, sameContext, desiredMatches, checkedAt, releaseAllowed}` (seção 11) [verificado] |
| `/ws` | WebSocket | qualquer | seção 8 | — [verificado] |
| `/api/thumbs` | GET | qualquer | — | `{thumbs:{<chave>: dataURL}}` (na bancada veio vazio) [verificado] |
| `/api/video-settings` | GET | local | — | `{success, video}`; `503` sem motor [verificado] |

### 6.3 Saídas, transmissão e M/E

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/outputs` | GET | local, sem query | — | `{success, outputs:{destinations[], encoders[], protocols[], sdi, ndi, omt, mix, profiles, ...}, preset, observedAt}`; sem motor responde erro [verificado] |
| `/api/settings` | GET | local, sem query | — | `{success, settings:{video, recordDirectory, server, hasKey, mode, values, capabilities, nativePreferences, stats, virtualCameraScene}, preset, observedAt}` [verificado] |
| `/api/srt-hdr` | GET | local | `?senderId=0..3` | `{success, outputs:{srtHdr, audioSources}}` [verificado] |
| `/api/mix-effects` | GET | qualquer | — | `{success, mixes:[{mixId:2..4, programUuid, previewUuid, transitioning, width, height, ...}], transitions, ...}` [verificado] |
| `/api/mix-effects/check` | POST | qualquer | `{operationId, expectedScope}` | `{success, operation, selected, desiredMatches}` [código] |
| `/api/final-program-gate` | GET | local | só `?mixId=0` | `{success, finalProgramGate}` (FTB experimental, seção 7.1) [verificado] |
| `/api/outputs-watchdog` | GET / POST | GET qualquer, POST local | POST `{action:"register"\|"start"\|"stop"\|"drop"\|"telemetry"\|"reset", id, ...}` | `{success, summary, outputs, logs}` [GET verificado] |
| `/api/aux-routing` | GET / POST | GET qualquer, POST local | POST `{action:"configure"\|"cut"\|"route"\|"reset", auxId\|targetId, ...}` | `{success, matrix, logs}` [GET verificado] |
| `/api/network` | GET | local | — | estado do bonding multipath (`config`, `interfaces`, `sender`, `receiver`, ...) [verificado] |
| `/api/signals` | GET | qualquer | — | catálogo de sinais (`signals[]`, `meTally`) [verificado] |
| `/api/patch` | GET | qualquer | — | `{success, version, patches}` [verificado] |
| `/api/mix-audio` | GET | qualquer | — | `{success, version, defaults, availableBuses}` [verificado] |

### 6.4 Atraso de segurança e DUMP

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/delay` | GET | qualquer | — | resumo do atraso (seção 7.9) [verificado] |
| `/api/delay` | POST | qualquer | `{action:"dump"\|"delay_dump"\|"delay_set"\|"delay_enable"\|"delay_disable"\|"delay_summary", enabled, seconds, preserve, note}` | `{success:true, result, ...resumo}`; sem `action` → **400** [verificado] |

### 6.5 Áudio

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/audio-routing` | GET | local | `?key=<uuid da fonte>` opcional | `{success, audioRouting}` [verificado] |
| `/api/ducking` | GET / POST | qualquer | POST `{action:"ducking_configure"\|"ducking_enable"\|"ducking_disable"\|"ducking_summary", ...}` | `{success, result?, enabled, active, attenuationDb, thresholdDb, attackMs, holdMs, releaseMs, voiceSources, duckedSources}` [GET verificado] |

### 6.6 Gráficos, overlays e GC

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/overlays` | GET / POST | qualquer | POST `{action:"overlay_*", channel, ...}` (seção 7.4) | `{success, result?, channels[8], mask, presets, transitions, inputs?}` [verificado] |
| `/api/gc-compatible` | GET | local | — | `{success, gcCompatible:{sources, groups, last, limitations}}` [verificado] |
| `/api/ticker-ack` | POST | local | uso interno das páginas de GC | `200/409 {success}` [código] |

### 6.7 Mídia, playout, replay e MultiGravação

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/playout` | GET / POST | GET qualquer, POST local | POST `{action:"playout_*", ...}` (padrão `playout_take`) | `{success, playout:{lists, activeList, program, preview, automation, stats}}` [GET verificado] |
| `/api/replay` | GET / POST | qualquer | POST `{action:<comando>, ...}` (lista no índice gerado) | `{success, replay:{rec, players, events, activePlayer, speed, ...}}` [GET verificado] |
| `/api/replay-preview/<token>` | GET / HEAD | local | token de 32 hex | mídia da prévia do histórico [código] |
| `/api/iso` | GET / POST | qualquer (`configure` e `options`: local) | POST `{action:"status"\|"start"\|"stop"\|"configure", ...}` | `{success, iso}` [GET verificado] |
| `/api/multicorder/discos` | GET | qualquer | — | `{success, entradas:[{nome, caminho, disco:{supported, letra, numero, nome, barramento, serie}}], colisoes:[{numero, nomes}], semOverrideDePasta:[nome,...], estimativa, perfisBroadcast}` [código, testado isolado] |
| `/api/multicorder/benchmark` | POST | local | `{diretorios:[...]}` | `{success, resultados:[{diretorio, gravado, velocidadeMBs, erro}]}` [código, testado] |

#### Comandos avançados de Replay A/B e compatibilidade vMix
- **Ações Replay nativas do 3Mix:**
  - `swap`: Alterna instantaneamente os players A e B (Programa e Preview) ou troca a seleção do canal ativo.
  - `jump { player, seconds, frames }`: Pula N segundos ou N quadros a partir do cursor atual com snapping racional de frame rate.
  - `jump-to-now { player }`: Salta a agulha para o final mais recente da gravação (Live edge).
  - `play-event { eventId, index, player, toOutput: boolean, cam }`: Carrega o lance no player e opcionalmente o coloca diretamente no ar.
  - `select-event { offset: 'next'|'prev'|'first'|'last', index, eventId, load: boolean }`: Navega pelos lances salvos.
  - `select-camera { player, camIndex | cam }`: Troca o ângulo do lance ativo preservando o cursor de reprodução.
  - `play-pause { player }`: Alterna reprodução entre Play e Pause.
  - `mark-in-out { seconds }`: Marca lance retroativo com duração arbitrária (padrão 10s, 0.2 a 120s).
- **Compatibilidade total vMix Replay API (TCP porta 8099 / HTTP):**
  - Mapeamento completo dos comandos vMix: `ReplayPlay`, `ReplayPause`, `ReplayPlayPause`, `ReplayLive`, `ReplaySetSpeed`, `ReplaySetSpeedChannelA`, `ReplaySetSpeedChannelB`, `ReplayJumpFrames`, `ReplayJumpSeconds`, `ReplayJumpToNow`, `ReplaySwap`, `ReplaySelectChannel`, `ReplaySelectChannelA`, `ReplaySelectChannelB`, `ReplaySelectCamera`, `ReplaySelectCamera1..4`, `ReplayMarkIn`, `ReplayMarkOut`, `ReplayMarkInOut`, `ReplayMarkInOutLive`, `ReplaySelectFirstEvent`, `ReplaySelectLastEvent`, `ReplaySelectNextEvent`, `ReplaySelectPreviousEvent`, `ReplaySelectEvent`, `ReplayPlayEvent`, `ReplayPlaySelectedEvent`, `ReplayPlaySelectedEventToOutput`, `ReplayStartRecording`, `ReplayStopRecording`, `ReplayStartStopRecording`, `ReplayDeleteEvent`, `ReplaySetSelectedEventCategory`, `ReplaySetSelectedEventText`.

Fase 3 (MultiCorder, "detecção de disco físico por nome amigável"): `/api/multicorder/discos`
lê `iso.state.recordOptions.perInput[nome].directory` (câmeras com pasta própria já
configurada em `iso.html`) e devolve, para cada uma, o disco físico real por trás da letra
de unidade (`Get-Partition`/`Get-Disk` do Windows via `ferramentas/disco-producao.mjs`,
cache de 60s para não invocar PowerShell em loop) e sinaliza `colisoes` quando duas câmeras
caem no MESMO disco físico, não só em pastas diferentes. Câmera sem override de pasta
(usaria o diretório padrão do motor) aparece em `semOverrideDePasta`, nunca com um caminho
inventado — essa rota nunca chama o motor nativo, só lê o sistema de arquivos, então
funciona mesmo sem conexão native. Testado isolado com os dois discos físicos reais desta
máquina de desenvolvimento (`qa-finalizacao/crew-broadcast-20261103/testar-disco-fisico.mjs`,
`testar-multicorder-discos-http.mjs`) — ver `MATRIZ-INVENTARIO-CREW-BROADCAST.md`.

### 6.8 Roteiro, segurança operacional e retornos

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/rundown` | GET / POST | qualquer | POST `{action:"rundown_*", ...}` (padrão `rundown_summary`) | `{success, result, ...resumo}`; conflito → **409** com `code` `RUNDOWN_CONFLICT`/`RUNDOWN_PARTIAL`; outros erros → 400 com `validation` e `summary` [GET verificado] |
| `/api/preflight` | GET | qualquer | `?alvo=ambos\|transmitir\|gravar` (padrão `ambos`; itens `geral` sempre entram) e `?item=<id>` (só esse item) | roda a verificação: `{success, verdict:"READY"\|"WARN"\|…, veredito, readyToAir, contagem, itens[], checks[], issues[], summary, preflight}`; **503** `Pre-Flight indisponível neste painel` quando o módulo Pre-Flight não existe na produção [verificado sem parâmetros; filtros por código] |
| `/api/preflight` | POST | qualquer | `{action:"preflight_*", ...}` (lista no índice; `preflight_bypass {motivo}` libera bloqueio com registro; `preflight_process_close {nome, pids?, confirmar:true}` pede o fechamento de outro programa) | `{success, result}`; ação sem prefixo `preflight_` → 400 [código] |
| `/api/diagnostico` | GET | só local | — | estado do assistente de primeira execução (`estado.etapas`, `concluidoEm`), perfil de capacidade medido, versão, pacote de mídia de teste e teste de capacidade em andamento |
| `/api/diagnostico` | POST | só local | `{action}`: `inventario`, `encoders` (codifica 3 s com cada encoder; ~30 s), `disco` (`mb` 64–2048, padrão 512, na pasta de gravação), `rede` (`externo:true` mede também 1.1.1.1), `capacidade_iniciar` (`perfis:[4,8,12,16]`, `aquecimentoS`, `medicaoS`; recusa com algo no ar; roda na coleção "3Mix Diagnóstico" e volta ao projeto), `capacidade_cancelar`, `midia_remover`, `demo_futsal` (cria o projeto "Demo Futsal" pelo motor e o abre), `etapa` (`etapa`, `adiada`), `concluir`, `reiniciar` | `{success,result}`; acompanhe o teste de capacidade pelo GET (`benchmark.estado`: `rodando`, `concluido`, `cancelado`, `erro`) |
| `/api/blackbox` | GET / POST | qualquer | POST `{action:"blackbox_mark"\|"blackbox_trigger"\|"blackbox_summary"\|"blackbox_clear", note, trigger, details}` (padrão `blackbox_mark`) | `{success, result?, active, bufferLength, bufferMaxSeconds, recentIncidents, lastIncident}` [GET verificado] |
| `/api/return-feeds` | GET / POST | qualquer | POST `{action:"return_feed_start"\|"return_feed_stop"\|"return_feed_configure"\|"return_feed_summary", feedId}` | `{success, result?, activeFeedsCount, feeds}` [GET verificado] |

### 6.9 Entradas, efeitos, PTZ e telemetria

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/inputs-health` | GET / POST | GET qualquer, POST local | POST `{action:"register"\|"unregister"\|"frame"\|"audio"\|"tally", uuid, ...}` | `{success, summary, inputs, logs}` [GET verificado] |
| `/api/composition-frame` | GET | qualquer | `?input=<uuid da composição>` | PNG [código] |
| `/api/effects` | GET | local | `?key=` opcional | `{success, effects}` [verificado] |
| `/api/effects-frame` | GET | local | `?key=<uuid>` | PNG [código] |
| `/api/color/frame` | GET | local | `?input=<chave>` | JPEG; 404 sem quadro [código] |
| `/api/ptz` | GET | local | — | `{success, ptz:{devices, links}}` [verificado] |
| `/api/ptz/preview` | GET | local | `?input=<chave>` | JPEG [código] |

### 6.10 Multiview

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/multiview` | GET / POST | GET qualquer, POST local | POST `{action:"set_layout"\|"safe_zones"\|"assign_slot"\|"clear_slot", layoutId, slotIndex, ...}` | GET: `{activeLayout, preset, safeZones, totalSlots, slots, timestamp}` (sem `success`) [GET verificado] |
| `/api/multiview-montagens` | GET / POST | GET qualquer, POST local | POST `{montagens}` | `{success, montagens}` [GET verificado] |

### 6.11 Janelas do programa, sistema e diagnóstico

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/panel-open` | POST | local | `{route:"/replay"}` (rotas conhecidas: `/transmitir`, `/gravar`, `/replay`, `/audio`, `/overlays`, `/rundown`, `/preflight`, `/me`, ...) | `{success}` ao abrir a janela no motor [código] |
| `/api/panel-title` | POST | local | `{url:"http://127.0.0.1:<porta>/...", title}` | `{success}` [código] |
| `/api/panel-close` | POST | local | `{url}` | `{success}` [código] |
| `/api/panel-log` | POST | qualquer | objeto com o erro da página (até 120/min gravados) | `{success:true}` [código] |
| `/api/modulos` | GET / POST | local | POST `{modulos:{replay:bool, rundown:bool, calls:bool, multiview:bool, iso:bool, dataSources:bool, srtHdr:bool, blackbox:bool, broadcastDelay:bool}}` | `{success, modulos, definicao?}` [GET verificado] |
| `/api/workspace` | GET / POST | local | POST `{cardWidth:120..320, audioLeft, modulesStacked, sideWidth:0 ou 280..4000, dockTabs?, expectedRevision}` | `{success, workspace}`; revisão diferente → **409** [GET verificado] |
| `/api/projects-copy` | GET / POST | local | POST `{action:"saveas"\|"save_template"\|"get_template"\|"delete_template"\|"apply_template", from?, name?, templateName?, templateId?, sceneNames?, video?, importedTemplate?}` | GET: `{success, templates[]}`; POST: `{success, ...}` (cópia local de coleções em disco e biblioteca de modelos de projeto) [código] |
| `/api/update` | GET | local | — | `{success, update}` (consulta de atualização) [código; não executado na bancada] |
| `/api/diagnostics` | GET / POST | local | POST `{note?, machineName?, relato?}` gera pacote ZIP | `{success, ...}` [GET verificado] |
| `/api/diagnostics/reveal` | POST | local | — | abre a pasta do pacote [código] |
| `/api/diagnostics/download` | GET | local | `?id=` | ZIP [código] |
| `/api/diagnostics/preview` | GET | local | `?id=` | `{success, text}` [código] |

### 6.12 Projetos e chamadas

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/project/read` | GET | local + autorizado + origem | sem query | `{success, data, projectTransaction}` [na bancada respondeu `409 PROJECT_OPERATION_UNCONFIRMED`; resposta de sucesso não verificada] |
| `/api/project/scan`, `/api/project/preview`, `/api/project/apply` | POST | idem | corpo JSON até 64 KB | `{success, data, projectTransaction}`; erro → 409 com código em maiúsculas [não verificado] |
| `/api/project/*` (outras) | — | — | — | `404 PROJECT_ROUTE_UNKNOWN` [código] |
| `/api/calls/audio` | WebSocket | local, com `?token=` interno | uso interno do retorno de áudio das chamadas | [código] |

### 6.13 3Mix Crew — Tally

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/crew/tally` | GET | qualquer dispositivo autorizado (seção 3) | `?watching=main\|me2\|me3\|me4` opcional | sem `watching`: resumo de TODAS as entradas por TODOS os destinos existentes (`{conectado, atualizadoEm, destinosDisponiveis:[{id,label}], entradas:[{key,name,number,destinos:{<destId>:"program"\|"preview"\|"livre"}, resumo}]}`); com `watching`: visão de um dispositivo que escolheu um destino (`{conectado, atualizadoEm, watching, destinoValido, entradas:[{key,name,number,estado:"program"\|"preview"\|"livre"\|"desconectado"}]}`) [testado isolado: `qa-finalizacao/crew-broadcast-20261103/testar-crew-tally-http-ws.mjs`] |
| `/api/crew/tally/ws` | WebSocket | qualquer dispositivo autorizado | `?watching=main\|me2\|me3\|me4` (padrão `main`) | envia o mesmo formato "visão de um dispositivo" acima no `onopen` e a cada ~1s enquanto houver mudança; **canal somente leitura**: nenhuma mensagem enviada pelo cliente é processada (sem handler de `message` no servidor), mesmo um JSON bem formado tentando uma ação é ignorado — verificado por teste real, não só por design [testado isolado, mesmo script acima] |

`resumo`/`estado` seguem a prioridade do PROGRAM sobre o PREVIEW quando o mesmo input aparece em dois destinos simultâneos (ex.: Preview do principal e Programa de um M/E) — nunca mostra "livre" por engano nesse caso. `desconectado` aparece quando o motor está desconectado OU quando o dispositivo pediu um destino (M/E) que não existe mais nesta instalação — nunca um estado "neutro" que pareça "tudo bem". Implementação: `ferramentas/crew-tally-producao.mjs` (`CrewTallyEngine`, somente leitura — nunca chama `production.run()`/`req()`). [código, testado isolado 10/10 PASS em `qa-finalizacao/crew-broadcast-20261103/` — pendente reteste contra o motor nativo real, ver seção 13]

### 6.14 3Mix Crew — Intercom (áudio)

| Rota | Método | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| `/api/crew/intercom` | GET | qualquer dispositivo autorizado | — | `{success, membros:[{memberId,name,role,groupIds,connected,falando}], grupos:[{groupId,name,priority}], pttAtivos:[{memberId,targets,isDirector,expiresAt}]}` [testado isolado: `qa-finalizacao/crew-broadcast-20261103/testar-crew-intercom-http-ws.mjs`] |
| `/api/crew/intercom` | POST | `register_member`/`remove_member`/`create_group`/`set_member_groups`: **local**; `ptt_start`/`ptt_ping`/`ptt_stop`: qualquer dispositivo autorizado | `{action:"register_member", name, sourceUuid, role:"director"\|"crew"}` → cadastra um membro (a fonte de áudio já precisa existir no motor); `{action:"remove_member", memberId}`; `{action:"create_group", name, priority}`; `{action:"set_member_groups", memberId, groupIds}`; `{action:"ptt_start", memberId, targets:[memberId\|groupId,...]}` → `{success, lease, ttlMs:1500}`; `{action:"ptt_ping", memberId, lease}` (renova o lease — sem ping o PTT expira sozinho em 1.5s); `{action:"ptt_stop", memberId, lease}` | `{success, ...resumo}` ou `{success, memberId/groupId, ...resumo}` conforme a ação [testado isolado] |
| `/api/crew/intercom/ws` | WebSocket | qualquer dispositivo autorizado | `?member=<memberId>` (precisa já estar cadastrado — `member` desconhecido → **404**, nunca cria membro implícito) | binário puro: o mesmo formato de `mixReturn` que `/api/calls/audio` já usa (header de 12 bytes: rate/channels/frames + PCM estéreo); **canal somente saída**, nenhuma mensagem do cliente é processada — verificado por teste real [testado isolado] |

Arquitetura (decisão de 03/11/2026, documentada com precisão porque muda uma suposição do superprompt original — ver seção 13 item 7): o Intercom reaproveita o mesmo motor de mixagem PCM que o 3Mix Calls já usa em produção (`mixReturn`, `ferramentas/retornos-calls.mjs`, função pura, não duplicada) e a mesma captura nativa (`call_audio`), mas através de um registro compartilhado (`ferramentas/audio-tap-registry.mjs`, `AudioTapRegistry`) que resolve a exclusividade real do recurso nativo — confirmado por leitura de `FreeMixCallAudio.cpp`: um único Set global de taps no C++, substituído inteiro a cada `configure`, nunca uma união. O registry é o ponto único que fala com `call_audio`; cada consumidor (`"calls"`/`"crew"`) declara as fontes que precisa e só recebe de volta os pacotes das suas próprias fontes — isolamento de bus real por roteamento, testado (`testar-audio-tap-registry.mjs`, 7/7 PASS), não por confiança. `ferramentas/crew-intercom-producao.mjs` (`CrewIntercomEngine`) implementa grupos, PTT individual/coletivo com lease+watchdog (1.5s TTL, mesmo valor que o talkback de Calls já usa) e prioridade da direção (um diretor falando silencia falantes comuns para quem o ouve, nunca mistura as duas vozes) — testado com áudio PCM sintético real, lido de volta byte a byte, não suposição: `testar-crew-intercom-engine.mjs`, 11/11 PASS. Transporte desacoplado da mixagem (`ferramentas/crew-intercom-transport-ws.mjs`): a classe do engine só emite um evento `'mix'`; quem decide como entregar é o transporte. **WebRTC não foi implementado nesta rodada** — investigação real confirmou que não há nenhuma dependência WebRTC server-side no projeto nem signaling/SFU próprio (vídeo de Calls usa VDO.Ninja externo, não uma implementação própria); construir isso do zero é trabalho de dias, não declarado pronto por não ter sido feito — ver nota de migração no final de `crew-intercom-transport-ws.mjs`.

**Limitação real registrada, não escondida**: `CallEngine`/`CallReturns` (3Mix Calls) continuam chamando `call_audio` diretamente, sem passar pelo `AudioTapRegistry` — migrá-los foi avaliado e decidido NÃO fazer nesta rodada, por ser mudança em código de produção já testado sem motor real disponível para validar fim a fim (risco de regressão). **Consequência real**: hoje, se o 3Mix Calls e o Crew Intercom forem usados ao mesmo tempo, a chamada `configure` de um pode substituir a captura do outro (mesma exclusividade nativa que o registry resolve só entre consumidores que o usam). Teste negativo de isolamento do PGM/vídeo (regra 5 do superprompt) confirmado e independente desta limitação: `crew-intercom-producao.mjs` não tem nenhuma chamada a `production.run()`/`req()` nem referência a bus M/A/B ou PGM — verificado por inspeção do código-fonte real em `testar-crew-intercom-engine.mjs`.

Enquanto uma transação de projeto está em andamento, as demais rotas dinâmicas respondem **409** `{"error":"PROJECT_TRANSACTION_BUSY"}` e o `/ws` recusa conexão com 409. [código]

Rota inexistente em `/api/...` → **404** `{"success":false,"error":"API não encontrada"}`. [verificado]

## 7. `/api/control`: comandos de produção

`POST /api/control` com corpo JSON `{"action": "<nome>", ...parâmetros}`.

- Sucesso: **200** `{"success": true, "state": <estado completo>, ...extra}`. Ações de alguns módulos acrescentam o resultado: `effects_*` → `effects`; `ptz_*` → `ptz`; `signal_*` → `signals`; `call_*` → `call`; `gc_html_*` → `gcCompatible`; `gc_library_*` → `gcLibrary`; `audio_routing_*` → `audioRouting`; `settings_*` → `settings`; `recovery_*` → `recovery`; `outputs_*` → `outputs`; `network_*` → `network`; `controller_*` → `controllers`; `overlay_*` → `overlays`; `update_*` → `update`. [código]
- Erro: **400** `{"success": false, "error": "<mensagem em português>", "operation": <recibo, se havia operationId>}`; **403** para ação local pedida de outro computador. Ação desconhecida: `Comando não implementado: <ação>`. [verificado]
- **Fila única**: os comandos são executados um de cada vez, com leitura do motor antes e depois (`refresh`). Exceção: `ptz_*` não entra na fila (o STOP do PTZ precisa ser imediato). [código]
- **Confirmação**: as ações principais só respondem sucesso depois de o motor confirmar o novo estado (Programa, Preview, volume, mute, gravação etc.). [código]
- O valor de retorno do módulo não vem na resposta de `/api/control` (vem só o `state`). Para receber o resultado de `dump`, use `POST /api/delay`. [código]

### 7.1 Corte, transição, Preview e Programa

| Ação | Parâmetros | Efeito |
|---|---|---|
| `preview` | `input` | coloca a entrada no Preview. [verificado] |
| `cut` | `input?`, `operationId?`, `expectedScope?` | CUT do Preview para o Programa. Com `input`, usa a entrada como ponte e devolve o Preview anterior no fim. Exige o modo Preview/Programa ligado. [verificado] |
| `fade` | `input?`, `duration` (50–20000 ms, padrão 500), `operationId?`, `expectedScope?` | transição de esmaecer. [verificado] |
| `transition` | `input?`, `operationId?`, `expectedScope?` | usa a transição atual do motor. [código] |
| `active` | `input` | coloca a entrada direto no Programa (sem transição). [código] |
| `tbar` | `position` 0–1, `release` bool | posiciona o T-bar. [código] |
| `ftb` | `mixId:0`, `enabled`, `active`, `durationMs` 50–20000, `audioPolicy:"unchanged"`, `experimentalOptIn:true`, `operationId` | Fade to Black experimental do Master. **Hoje é recusado** pela API (`FTB geral ainda não está habilitado…`), porque o servidor cria a produção sem a qualificação desse beta. [verificado: recusado] |
| `input_remove` | `input` | remove a entrada; recusado se ela estiver no ar (Programa ou overlay). [código] |

`preview`, `active`, `cut`, `fade`, `transition`, `ftb` e `input_remove` passam pelo caminho de tempo real com recibo de operação (seção 11).

### 7.2 Ações só no computador do 3Mix

Pelo HTTP, são recusadas fora do loopback [código, `servidor-api.mjs`]:
prefixos `gc_html_`, `settings_`, `call_`, `recovery_`, `macro_` (exceto `macro_run` e `macro_cancel`), `outputs_`, `network_`, `audio_routing_`, `effects_`, `ptz_`, `update_`; e as ações `data_file`, `gc_library_save`, `gc_library_duplicate`, `gc_library_remove`, `gc_library_import`, `gc_library_export`, `gc_library_asset`, `gc_library_variant`, `gc_library_unlink`, `gc_library_clock_restart`, `signal_configure`, `patch_set`, `mix_audio_set`, `controller_save`, `controller_remove`, `controller_enable`, `controller_osc_configure`, `controller_osc_start`, `controller_osc_stop`.

Pelo `/ws` a lista é a mesma, **menos** `ptz_*`, `patch_set` e `mix_audio_set` (ver seção 13). `update_*` não existe pelo `/ws`.

### 7.3 Áudio

| Ação | Parâmetros | Efeito |
|---|---|---|
| `audio_volume` | `input`, `volume` 0–100 | volume (multiplicador = volume/100). [verificado com `input:"M"`] |
| `audio_mute` | `input`, `muted?` | liga/desliga mudo; sem `muted`, alterna. [código] |
| `audio_bus` | `input`, `bus:"M"\|"A"\|"B"`, `enabled?` | envia a fonte ao barramento; sem `enabled`, alterna. [código] |
| `audio_monitor` | `input`, `enabled` | monitorar e sair / sem monitor. [código] |
| `audio_balance` | `input`, `balance` 0–1 | balanço. [código] |
| `audio_enable` | — | monta os barramentos Master/A/B (recusado durante gravação ou transmissão). A API faz isso sozinha ao conectar, se faltar. [código] |

`input` aceita `"M"`, `"A"`, `"B"` (barramentos `3Mix Master`, `3Mix Bus A`, `3Mix Bus B`), o nome de uma fonte de áudio, ou uma entrada (afeta todas as fontes de áudio dela). O microfone privado do diretor (talkback) é recusado. Roteamento avançado: `audio_routing_*` (local), índice na seção 14.

### 7.4 Overlays (DSK) e GC

| Ação | Parâmetros | Efeito |
|---|---|---|
| `overlay` | `channel` 1–8, `input?` | põe a entrada no canal; sem `input`, esvazia o canal. Cria o keyer se faltar. [verificado] |
| `overlay_take` | `channel`, `scene` ou `input` (**nome** da entrada) | coloca no canal com a transição/DVE configurados. [código] |
| `overlay_off` | `channel` | tira do ar. [código] |
| `overlay_toggle` | `channel`, `scene` | alterna. [código] |
| `overlay_kill_all` | — | esvazia todos os canais. [código] |
| `overlay_configure` | `channel`, `transition`, `transitionDuration` 0–10000, `transitionType:"match"\|"show"\|"hide"`, `hideAfter` 0–600 s, `tie`, `stinger{enabled,name,cutPointMs,audio}`, `dve{preset,x,y,width,height,...}` | configura o canal. [código] |
| `overlay_dve_apply` / `overlay_dve_restore` | `channel`, `dve` | aplica/desfaz geometria DVE (presets `fullscreen`, `pip-top-right`, `pip-top-left`, `pip-bottom-right`, `pip-bottom-left`, `lower-third`, ...). [código] |
| `overlay_get` | — | resumo. [verificado via `/api/overlays`] |
| `gc` | `kind:"lower"\|"score"`, `data`, `on?` | tarja (`data:{title, subtitle, color}`) no canal 1 ou placar (`data:{teamHome, teamAway, scoreHome, scoreAway, minutes, period}`) no canal 2. `on:true` põe no ar, `on:false` tira; sem `on`, só atualiza o conteúdo. [verificado: tarja] |
| `score` | `team:"home"\|"away"`, `delta` −99..99 | soma pontos no placar. [código] |
| `gc_library_*` | ver índice | biblioteca de títulos (`gc_library_air {id, on}` põe/tira do ar no canal do título). [código] |
| `gc_html_*` | ver índice | GC HTML vinculado (local). [código] |

As ações `overlay_*` também podem ir por `POST /api/overlays` (resposta com o resumo dos canais, sem o `state`).

### 7.5 Gravação, transmissão e saídas extras

| Ação | Parâmetros | Efeito |
|---|---|---|
| `record` | `active: true\|false` | inicia/para a gravação principal e espera o motor confirmar. [verificado] |
| `stream` | `active: true\|false` | inicia/para a transmissão principal. [verificado na bancada com receptor RTMP local] Com atraso ligado, parar pode responder **400** `O motor não confirmou GetStreamStatus` (o motor demora mais que a janela de confirmação para encerrar) ou, logo depois de iniciar, `StopStream: 501`; confira `streaming` no estado antes de repetir (seção 13). |
| `outputs_get` | — | lê as saídas (local). [código] |
| `outputs_configure` | `index` 0–3, `name`, `server`, `key?`, `protocol:"auto"\|"rtmp"\|"rtmps"\|"srt"\|"rist"\|"hls"`, `mode:"source"\|"program"\|"preview"\|"clean"\|"mix"`, `mixId` 2–4, `input` (modo `source`), `width`/`height` (pares, 240–3840), `bitrate` 200–50000, `audioTrack` 0–2, `encoder`, ... | configura uma das quatro saídas extras (local). [código] |
| `outputs_start` / `outputs_stop` / `outputs_record` | `index` 0–3 | liga, para ou grava a saída extra (local). [código] |
| `outputs_network` | `protocol:"NDI"\|"OMT"`, `command:"start"\|"stop"\|"restart"`, `senderId` 0–3, `mode:"program"\|"source"`, `input`, ... | saídas de rede (local). [código] |
| `outputs_sdi`, `outputs_srt_hdr`, `outputs_omt_hdr`, `outputs_source`, `outputs_profile_save`, `outputs_profile_load`, `outputs_external_read` | ver código `saidas-producao.mjs` | SDI, HDR, entradas de rede, perfis (local). [código] |
| `settings_stream_key` | `key` | troca só a chave de transmissão (local). [código] |
| `settings_apply` | `category:"display"\|"recording"\|"streaming"\|<preferência nativa>`, campos | aplica configurações; recusado com gravação, transmissão, saída de rede ou câmera virtual ativas (local). [código] |

### 7.6 Múltiplos M/E (`outputs_mix`)

`{"action":"outputs_mix","mixId":2,"command":"preview"|"cut"|"fade"|"take"|"configure"|"state", ...}` (local pelo HTTP). [código]

- `preview`: `input` (recusado se criar ciclo com a própria saída do M/E).
- `fade`, `take`: `duration` (ms, padrão 500).
- `configure`: `width`, `height`, `fill`, `positionX`, `positionY`, `zoom`, `transitionUuid`.
- Com `operationId`, exige `expectedScope` igual ao projeto e confere o resultado só no próprio M/E; conferência posterior em `POST /api/mix-effects/check`.
- O M/E 1 (Master) é o Programa principal: use `cut`/`fade`/`preview` da seção 7.1.

### 7.7 Mídia e playout

| Ação | Parâmetros | Efeito |
|---|---|---|
| `media` | `input?`, `command:"PLAY"\|"PAUSE"\|"STOP"\|"RESTART"\|"NEXT"\|"PREVIOUS"` | controla a fonte de mídia (sem `input`: playlist ou mídia do Preview). [código] |
| `media_seek` | `input?`, `position` (ms, até a duração) | posiciona. [código] |
| `media_settings` | `input?`, `speed` 10–200, `loop`, `autoNext` | ajustes da fonte. [código] |
| `playout_take` | `itemId?`, `transition?`, `transitionMs?` | leva o clipe ao ar. [código] |
| `playout_preload` (`playout_preview_clip`, `playout_loadclip`) | `itemId` ou `index` ou `item` | prepara no Preview do playout. [código] |
| `playout_play`, `playout_pause`, `playout_stop`, `playout_restart`, `playout_next`, `playout_previous`, `playout_hold` | — | transporte. [código] |
| `playout_seek` | `positionMs` | posiciona. [código] |
| `playout_save_playlist` | `id?`, `name`, `items[]`, `loop`, `autoAdvance`, `transition`, `fadeMs` | salva lista. [código] |
| `playout_load_playlist` / `playout_delete_playlist` | `id` | carrega / apaga. [código] |
| `playout_item_update` | `itemId`, `inMs`, `outMs`, `audioGainDb`, `endBehavior`, `loop`, ... | edita item (ganho por clipe aplicado ao vivo se o clipe estiver no ar). [código] |

Toda ação `playout_X` também é aceita como `queue_X` (compatibilidade). `POST /api/playout` é local.

### 7.8 Replay

#### Contrato de canal, velocidade e navegação

- `speed {speed, player?}`: 10–100%; `player` explícito afeta somente esse player carregado e conserva sua velocidade no próximo lance. Omitido mantém a alteração global e o padrão para novos players.
- `jump {player?, seconds?, frames?}`: segundos finitos e quadros inteiros; conversão usa a taxa racional do clipe. Limites são restringidos ao intervalo do clipe.
- `play-event.index` é inteiro a partir de zero. `select-camera.camIndex` é inteiro a partir de um. ID inexistente e índice fracionário são recusados, sem fallback silencioso.
- Falha de carregamento não confirma uma nova seleção nem envia o lance ao ar. Falha de persistência da seleção restaura o ID anterior em memória; isso não promete rollback do decodificador já carregado.
- Verificação desta correção usa a classe real com transporte OBS simulado, não homologação AV nativa. A instalação do runtime depende de merge e pacote posteriores.


Pelo `POST /api/replay` `{"action":"<comando>", ...}`: `status`, `start` (`cams`), `stop`, `mark-in`, `mark-out`, `capture` (`seconds`), `load` (`player`, `eventId`, `cam`), `air` (`player`), `live`, `speed` (`speed`), `transport`, `seek`, `frame`, `link` (`enabled`), `audio` (`enabled`), `delete` (`eventId`) e os demais da lista gerada. Pelo `/ws`: `{"action":"replay","cmd":"<comando>", ...}`. [código; `status` verificado]

**Exportação de lances** (vMix 30 "Export All Events"/"Export Selected Events" — equivalente próprio do 3Mix, copiando os clipes já prontos, sem recodificar):
- `export-event` `{eventId, directory?}`: copia os clipes de um lance (um arquivo por câmera, já que o Replay não compõe multi-câmera num único arquivo) para `directory` (pasta absoluta) ou, se omitido, para `gravacoes/replay/exportados/<timestamp>/` dentro da instalação.
- `export-events` `{eventIds?, directory?}`: com `eventIds` (lista de 1 a 500 ids), exporta só os selecionados, na ordem enviada; sem `eventIds`, exporta todos os lances gravados.
- Resposta: `{success, replay:{..., export:{directory, events:[{eventId, name, arquivos:[{cam, path} | {cam, erro}]}]}}}`. Um clipe cujo arquivo original não existe mais no disco aparece com `erro` em vez de interromper a exportação dos demais. [código, testado isolado — `ferramentas/test-replay-export-eventos.mjs`; sem teste de volume real com motor ligado]

### 7.9 Atraso de segurança e DUMP

O atraso fica no motor (`obs_output_set_delay`); a API lê e configura. [código + verificado]

`GET /api/delay` (e `state.broadcastDelay`):

```json
{"success":true,"available":true,"error":null,"state":"ready","enabled":true,"configuredSeconds":6,"preserve":true,
 "streaming":false,"active":false,"delaySeconds":6,"bufferedSeconds":0,"canDump":false,"uncoveredOutputs":[],
 "recommendedSeconds":7,"stats":{"dumpCount":0,"lastDumpAt":0,"lastDiscardedPackets":0,"lastDiscardedBytes":0}}
```

| `state` | Significado |
|---|---|
| `unavailable` | motor não respondeu ao vendor `broadcast_delay` |
| `off` | atraso desligado, fora do ar |
| `ready` | atraso configurado; vale no próximo início da transmissão |
| `protected` | no ar com atraso e buffer cheio (`bufferedSeconds + 0,5 ≥ delaySeconds`) |
| `rebuilding` | no ar com atraso, buffer ainda enchendo (logo depois de iniciar ou de um DUMP) |
| `streaming_without_delay` | no ar sem atraso: DUMP impossível |

Ações (por `POST /api/delay` ou `/api/control`):

| Ação | Parâmetros | Efeito |
|---|---|---|
| `dump` (ou `delay_dump`) | `note?` | descarta o que está no buffer. **Só responde sucesso se o motor descartou** (`result.dumped:true`, com `discardedPackets`, `discardedBytes`, `delaySeconds`); registra incidente `BROADCAST_DELAY_DUMP` na caixa-preta. Sem transmissão: `DUMP não executado: não há transmissão no ar.`; no ar sem atraso: `…esta transmissão começou sem atraso…`. Depois do DUMP o destino segura a imagem por cerca do tempo do atraso e volta com a proteção inteira. [verificado] |
| `delay_set` | `enabled?` bool, `seconds?` inteiro 1–1800, `preserve?` bool | grava a configuração; **recusada com transmissão no ar**; vale no próximo início. [verificado] |
| `delay_enable` | `seconds?` | liga. [código] |
| `delay_disable` | — | desliga. [código] |
| `delay_summary` | — | relê o motor. [verificado] |

`uncoveredOutputs` lista saídas extras ativas: elas **não** têm atraso e o DUMP não as alcança.

### 7.10 Macros

| Ação | Parâmetros | Efeito |
|---|---|---|
| `macro_save` (local) | `id?`, `name` (≤80), `steps:[{action, data}]`, `rollbackPreviewOnFailure?` | salva. Passos permitidos: `preview`, `active`, `cut`, `fade`, `outputs_mix`, `overlay`, `audio_mute`, `audio_volume`, `audio_bus`, `media`, `media_seek`, `media_settings`, `record`, `stream`, `tbar`, `wait {milliseconds ≤ 60000}`, `if {condition, then, else}` e as edições de `automacao-operacional.mjs`. Limites: 100 passos, 10 min, 100 macros. [código] |
| `macro_run` | `id` | executa em segundo plano; acompanhe `state.macros.job`. [código] |
| `macro_cancel` | — | cancela. [código] |
| `macro_remove`, `macro_record_start`, `macro_record_stop`, `macro_trigger_save`, `macro_trigger_remove`, `macro_trigger_enable` (locais) | ver `macros-producao.mjs` | gestão e gatilhos por evento (`state.macros.events`). [código] |

### 7.11 Chamadas, configurações, rundown e o restante

- **Calls** (`call_*`, locais): convidados, retornos N-1, talkback (`call_talk_start`/`call_talk_stop`/`call_talk_ping`) e processamento de voz por convidado (`call_audio_processing {guest, filter?:"gate"|"compressor"|"agc"|"limiter", preset?:"podcast", enabled}`). Parâmetros: ver `calls-producao.mjs`. [verificado]
- **Configurações** (`settings_*`, locais): `settings_get`, `settings_apply`, `settings_defaults`, `settings_export`, `settings_import`, `settings_stream_key`, `settings_virtual {active}`, `settings_virtual_source {input?}`, `settings_projector {mix:"PROGRAM"|"PREVIEW"|"MULTIVIEW"}`, `settings_source_projector {input}`, `settings_native`, encoder (`settings_encoder_read/preview/apply`), plugins e seletor de imagem. [código]
- **Rundown** (`rundown_*`, por `/api/control` ou `/api/rundown`): `rundown_summary`/`rundown_get`, `rundown_select`/`rundown_jump {stepId|stepIndex}`, `rundown_prepare {stepId}`, `rundown_execute {stepId, operationId?, auto?}`, `rundown_next`/`rundown_go`, `rundown_skip`, `rundown_arm`, `rundown_suspend {reason}`, `rundown_end`, `rundown_reopen`, edição (`rundown_save`, `rundown_add_block`, `rundown_add_step`, `rundown_update_step`, ...). [código]
- **Entradas e composições** (`input_*`): `input_create {name, layout, slots[], template?, color?}` cria uma composição a partir de entradas existentes (layouts `2box`, `3box`, `4box`, `pip`, `slides`, `vertical2box`, `verticalpip`, `grid1`…`grid16` e presets de composição); `input_reorder`, `input_duplicate`, `input_geometry`, `input_style`, `input_tags`, ... [código]
- **Fontes de dados** (`data_*`): importar planilhas/HTTP, selecionar linha e publicar em GC (`data_publish {id, on}`). [código]
- **Pre-Flight** (`preflight_*`): `preflight_check`/`preflight_run {item?, alvo?}` rodam a verificação; `preflight_summary`, `preflight_history`; `preflight_bypass {motivo}` (5–300 caracteres) registra a decisão de entrar no ar com bloqueio; `preflight_process_ignore`/`preflight_process_unignore {nome}`; `preflight_process_close {nome, pids?, confirmar:true}` pede o fechamento de um programa concorrente (recusa processos do sistema e do 3Mix). [código]
- **Caixa-preta, retornos, ducking, sinais, patch, PTZ, efeitos, controladores, recuperação, rede multipath, atualização**: ver o índice completo (seção 14) e o arquivo-fonte indicado.

## 8. WebSocket `/ws`

Conexão: `ws://<host>:<porta>/ws`, mesma autorização das rotas HTTP. Mensagem máxima recebida: 32 KB. [código]

Servidor → cliente [verificado]:

| `type` | Conteúdo |
|---|---|
| `init` | `data`: estado completo (seção 5), enviado ao conectar |
| `state` | `data`: estado completo; enviado a cada segundo e depois de cada comando |
| `meters` | `inputs:[{inputName, inputUuid, inputLevelsMul}]`, níveis de áudio em tempo real |
| `ack` | resposta a um comando: `{type:"ack", id, success:true, data}` ou `{type:"ack", id, success:false, error}` |
| `replay_state`, `iso_state` | estado do Replay e da MultiGravação |
| `aux_source_change`, `aux_cut`, `output_routed` | eventos da matriz AUX |

Cliente → servidor: `{"id":"<seu id>","action":"<ação>", ...parâmetros}` — as mesmas ações de `/api/control` (menos `update_*`). Para replay: `{"id":"r1","action":"replay","cmd":"mark-in"}`. O `id` volta no `ack`. [verificado]

## 9. Compatibilidade vMix

### 9.1 HTTP

`GET /api/?Function=<Nome>&Input=<entrada>&Value=<valor>&Duration=<ms>` responde XML (`<Function result="Success"/>` ou `<Function result="Error" message="..."/>`, HTTP 400). `GET /api/json?Function=...` responde `{"success":true}` ou `{"success":false,"error":...}`. O nome da função não diferencia maiúsculas. [verificado]

| Função vMix | Ação do 3Mix |
|---|---|
| `Cut`, `Fade` (`Duration`, padrão 500) | `cut`, `fade` (com `Input`, corte direto) |
| `PreviewInput` | `preview` |
| `ActiveInput`, `CutDirect` | `active` |
| `FadeToBlack` | `ftb` (hoje sempre recusado, ver 7.1) [verificado] |
| `PlayoutTake`, `TakeNext` (`ItemId`) | `playout_take` |
| `PlayoutNext` / `PlayoutPrevious`, `PlayoutPrev` | `playout_next` / `playout_previous` |
| `PlayoutClipGain`, `AdjustGain` (`ItemId`, `Value` ou `Gain` em dB) | `playout_item_update` com `audioGainDb` |
| `PreflightCheck` | `preflight_check` |
| `BlackboxMark` (`Note`) | `blackbox_mark` |
| `SetVolume` (`Input`, `Value` 0–100) | `audio_volume` [verificado com `Input=M`] |
| `Audio` / `AudioOn` / `AudioOff` (`Input`) | `audio_mute` (alterna / abre / muda) |
| `MasterAudio` | `audio_mute` do Master (alterna) |
| `SetMasterVolume` (`Value`) | `audio_volume` do Master |
| `StartRecording` / `StopRecording` | `record` |
| `StartStreaming` / `StopStreaming` | `stream` |
| `Play`, `Pause`, `Restart`, `NextItem`, `PreviousItem` | `media` (`PLAY`, `PAUSE`, `RESTART`, `NEXT`, `PREVIOUS`) |
| `SetPosition` (`Value` ms) | `media_seek` |
| `SetSpeed` (`Value`) | `media_settings` com `speed` |
| `OverlayInput1`…`OverlayInput8` (`Input`) | `overlay`: alterna a entrada no canal |
| `OverlayInput1In`…`OverlayInput8In` | `overlay`: põe a entrada no canal |
| `OverlayInput1Out`…`OverlayInput8Out` | `overlay`: esvazia o canal |
| `GCUpdate` (`title`, `subtitle`) | `gc` (tarja; só atualiza o conteúdo) |
| `ScoreGoal` (`team`, `Value`) | `score` |
| `ReplayPlay` (`Input` = player) | replay `air` |
| `ReplayLive` | replay `live` |
| `ReplayMarkIn` / `ReplayMarkOut` | replay `mark-in` / `mark-out` |
| `ReplaySetSpeed` (`Value`, 1 = 100%) | replay `speed` |

Qualquer outro nome → `Comando não implementado: <Nome>`. [verificado]

### 9.2 TCP (porta 8099)

Protocolo de linhas terminadas em `\r\n`. Ao conectar, o servidor envia `VERSION OK 27.0.0.1`. [verificado]

| Comando | Resposta |
|---|---|
| `XML` | `XML <bytes>\r\n<xml do estado>` |
| `TALLY` | `TALLY OK 0120000000` (um dígito por entrada: 0 fora, 1 Programa, 2 Preview) |
| `SUBSCRIBE TALLY` / `SUBSCRIBE ACTS` | `SUBSCRIBE OK TALLY` + tally imediato; depois `TALLY OK ...` a cada mudança / `ACT OK <função>` a cada função executada |
| `UNSUBSCRIBE TALLY` / `UNSUBSCRIBE ACTS` | `UNSUBSCRIBE OK ...` |
| `FUNCTION <Nome> Input=2 Value=50` | `FUNCTION OK <Nome>` ou `FUNCTION ER <mensagem>`; as mesmas funções do HTTP |
| `QUIT` | `BYE` e fecha |
| outro | `ER Unknown command: <CMD>` |

**Atenção**: no TCP os parâmetros precisam ser separados por **espaço** (`Input=M Value=60`). A forma do vMix com `&` (`Input=M&Value=60`) **não funciona**: o 3Mix lê `Input` como `M&Value`. Também não há decodificação de `%20`; valores não podem ter espaços. Um valor solto sem `=` vira `Input` (`FUNCTION Cut 2`). [verificado]

**Segurança**: o servidor TCP escuta em `0.0.0.0` por padrão e **não pede autenticação**. Em rede compartilhada, defina `FREEMIX_VMIX_TCP_HOST=127.0.0.1` ou `FREEMIX_ENABLE_VMIX_TCP=0`. [código]

## 10. Acesso direto ao motor (obs-websocket v5 e vendor requests)

O motor expõe o obs-websocket v5 padrão. Endereço e senha ficam em `<instalação>/config/obs-studio/plugin_config/obs-websocket/config.json` (`server_port`, `auth_required`, `server_password`); o painel guarda a mesma URL em `painel/local.js` (`window.MESA_LOCAL.url`, `.password`). O cliente pronto `ferramentas/obsws.mjs` faz o handshake (`connect({root, restrito:true})` usa só a porta configurada). [verificado na bancada]

**Quando usar**: requests que a API não cobre (por exemplo `GetSourceScreenshot`, `GetStats`, filtros), eventos nativos em tempo real, ou integração com ferramentas que já falam obs-websocket.

**Cuidados**:

- O acesso direto **pula** a fila, as confirmações, os recibos, o AFV/barramentos de áudio, o diário de recuperação, a gravação de macros e o registro na caixa-preta. Prefira `/api/control` para corte, áudio, overlays, gravação e transmissão.
- Não renomeie, apague nem esvazie cenas e fontes que começam com `3Mix ` nem o keyer `3Mix Audio` (barramentos). Não desligue o modo Preview/Programa: `cut`/`fade` passam a ser recusados.
- Sem `restrito:true`, `obsws.mjs` procura outro motor nas portas 4455, 4466, 4566, 5466, 14466, 15466 quando a porta configurada não responde: numa máquina com várias instalações, confirme a identidade com o vendor `get_interface` (`pid`, `executable`).

Chamada de vendor: `CallVendorRequest {vendorName, requestType, requestData}`; a resposta vem em `responseData` (com `success:false` e `error` quando recusada).

Vendors e requests registrados no motor (lista completa e arquivo-fonte no índice da seção 14) [código]:

| Vendor | Request | Uso confirmado no código |
|---|---|---|
| `freemix` | `broadcast_delay` | `{action:"state"}` → `configured`, `configured_seconds`, `preserve`, `streaming`, `active_seconds`, `buffered_ms`; `{action:"dump"}` → também `dumped`, `discarded_packets`, `discarded_bytes` [verificado `state`] |
| `freemix` | `get_interface` | `pid`, `executable`, geometria da janela; opções `screenshot`, `show`, `sourceEditors` [verificado] |
| `freemix` | `get_mixes` / `control_mix` | M/E 2–4: `{action:"configure"\|"preview"\|"cut"\|"fade"\|"take"\|"state", mixId, uuid, duration, ...}` [`get_mixes` verificado] |
| `freemix` | `get_destinations` / `set_destinations` / `control_destination` | saídas extras: `{index, action:"start"\|"stop"\|"record", path}` |
| `freemix` | `network_output`, `omt_hdr_output`, `srt_hdr_output`, `sdi_output` | NDI/OMT, HDR, SDI (`{action:"state"\|"configure"\|..., slot, config}`) |
| `freemix` | `fade_to_black`, `final_program_gate` | FTB; `final_program_gate {command:"state"\|"set", ...}` (beta) |
| `freemix` | `get_sources_status` | `{sources:[...]}` situação de cada fonte [verificado] |
| `freemix` | `save_preset`, `get_preset`, `get_scope`, `set_scope` | salvar projeto e escopo |
| `freemix` | `open_panel {url, title, width, height}`, `close_panel {url}`, `set_panel_title {url, title}`, `open_settings` | janelas do programa |
| `freemix` | `virtual_cam_source {set, sceneName}` | conteúdo da câmera virtual |
| `freemix` | `talkback`, `call_audio`, `call_video` | retorno e talkback das chamadas |
| `freemix` | `audio_capabilities` | barramentos independentes e saída ASIO |
| `freemix` | `shutdown_idle {qaClose?}` | fecha o motor **somente** sem nenhuma saída ativa, salvando o projeto |
| `freemix` | `get_master_level`, `set_transition_duration`, `finish_input_panel`, `reorder_inputs`, `open_vst_editor`, `project_creation_policy`, `project_device_inventory` | parâmetros não verificados |
| `downstream-keyer` | `get_downstream_keyers`, `get_downstream_keyer`, `add_downstream_keyer {dsk_name}`, `remove_downstream_keyer`, `dsk_get_scene {dsk_name}`, `dsk_select_scene {dsk_name, scene}`, `dsk_add_scene`, `dsk_remove_scene`, `dsk_set_tie`, `dsk_set_hide_after`, `dsk_set_transition`, `dsk_add_exclude_scene`, `dsk_remove_exclude_scene` | canais DSK (os overlays 1–8 usam keyers chamados `"1"`…`"8"`) [`get_downstream_keyers` verificado] |
| `obs-browser` | `emit_event {event_name, event_data}` | envia evento às fontes HTML (GC usa `freemix-gc`, dados usam `freemix-data`) |
| `freemix-preferences` | `control {action:"read"\|"apply"\|"reset_outputs"\|"runtime_outputs"\|"encoder_read"\|"encoder_preview"\|"encoder_apply"\|"plugin_tools"\|"plugin_tool_open"\|"pick_image_start"\|"pick_image_read", category, values}` | preferências nativas |
| `freemix-hotkeys` | `control {action:"status"\|"clear"\|"configure", scope, bindings}` | atalhos globais; eventos `VendorEvent` `hotkey`/`bindings_reset` |

A API assina os eventos nativos com a máscara `1|2|4|8|16|64|128|256|512|65536` (geral, configuração, cenas, entradas, transições, saídas, itens de cena, mídia, vendors e medidores de volume). [código]

## 11. Modelo de erro, idempotência e limites

### Erros

| HTTP | Quando |
|---|---|
| 400 | comando recusado ou inválido; corpo `{success:false, error}` (mensagem em português, pronta para mostrar ao operador). Qualquer exceção interna de rota também vira 400. |
| 401 | origem recusada ou dispositivo não autorizado |
| 403 | rota ou ação só no computador do 3Mix |
| 404 | rota inexistente |
| 405 | método errado |
| 409 | transação de projeto em andamento; conflito de revisão (`/api/workspace`); conflito de rundown |
| 429 | excesso de tentativas de PIN |
| 503 | `/api/video-settings` sem motor |

Pedido com `Accept: text/html` recebe a página de erro do 3Mix em vez de JSON. [código]

### Recibos e idempotência (`operationId` / `expectedScope`)

Valem para `preview`, `active`, `cut`, `fade`, `transition`, `ftb`, `input_remove` (e, com regras próprias, `outputs_mix` e `rundown_execute`). [verificado para `cut`]

- `operationId`: 1–80 caracteres `[A-Za-z0-9_-]`, único por comando.
- `expectedScope`: o `preset` lido do estado. Se o projeto aberto for outro, o comando é recusado antes de chegar ao motor.
- O recibo (`state.operation`) tem `id`, `action`, `scope`, `targetKey`, `targetName`, `receivedAt`, `startedAt`, `engineConfirmedAt`, `finishedAt`, `stage` e, se falhou, `error`.
- `stage`: `pending` → `confirmed` (o motor confirmou), `rejected` (recusado antes de executar) ou `uncertain` (enviado, mas a confirmação falhou: **não repita**; consulte).
- Reenviar o mesmo `operationId` com o mesmo comando **não executa de novo**: responde o recibo anterior com `replayed:true`. Com outro comando → `Identificação reutilizada para outro comando`. Se o anterior não foi confirmado → erro `…não será repetido`. [verificado]
- `GET /api/operation-check?id=…&scope=…` relê o motor; se o recibo estava `uncertain` e o motor mostra o alvo no ar, ele vira `confirmed` (`confirmation:"current-state"`). `releaseAllowed:true` indica que a interface pode liberar a operação. [verificado]
- A API guarda até 128 recibos (256 para M/E); os resolvidos mais antigos saem primeiro.

### Limites

| Item | Limite |
|---|---|
| Corpo JSON das rotas comuns | 7 MB |
| Corpo de `/api/project/*` | 64 KB |
| Mensagem recebida pelo `/ws` | 32 KB |
| Pareamento | 10 tentativas/min por IP; sessão de 12 h |
| Requests ao motor | 10 s cada; confirmações por leitura repetida (até cerca de 3 s) |
| Canais de overlay | 1–8 |
| Saídas extras | índice 0–3 |
| M/E | 2–4 (1 = Master) |
| Atraso | 1–1800 s, inteiro |
| Duração de fade | 50–20000 ms |
| Macros | 100 por projeto, 100 passos, 10 min |
| Monitores de sinal | 8 entradas |
| Biblioteca de GC | 200 títulos |
| `/api/panel-log` | 120 registros/min |

## 12. Para IAs e automações

### 12.1 Regras de segurança

1. **Leia antes de agir.** Consulte `GET /api/health` (`connected:true`) e o estado (`/api/json` ou `/ws`): `preset`, `program`, `preview`, `streaming`, `recording`, `overlays`, `broadcastDelay`.
2. **Ações que afetam o ar exigem confirmação humana explícita**, sempre, em produção: `cut`, `fade`, `transition`, `active`, `tbar`, `ftb`, `overlay` (e `overlay_take/off/toggle/kill_all`), `gc` com `on`, `gc_library_air`, `score`, `audio_mute`/`audio_volume`/`audio_bus` em fontes no ar ou no Master, `stream`, `record`, `dump`/`delay_dump`, `outputs_start`/`outputs_stop`, `outputs_mix` (`cut`/`fade`/`take`), `playout_take`/`playout_play`/`playout_next`, `media` na entrada do Programa, `macro_run`, `rundown_execute`/`rundown_next`/`rundown_go`/`rundown_auto_advance`, replay `air`/`live`, `call_talk_*`, `settings_virtual`, `input_remove`. Também exigem confirmação, embora não mexam no vídeo: `preflight_bypass` (libera um bloqueio de segurança) e `preflight_process_close` (fecha outro programa do computador).
3. **Preparar é seguro, levar ao ar não.** `preview`, `outputs_mix` `preview`, `playout_preload`, `rundown_prepare`, `macro_save`, `gc_library_save`/`gc_library_prepare` e `delay_set` (vale só na próxima transmissão) não mudam o que sai.
4. **Use `operationId` + `expectedScope`** em cortes e transições. Diante de `uncertain` ou timeout, **não repita**: consulte `/api/operation-check`.
5. **Não contorne recusas.** Mensagens como "Pare a transmissão…", "Entrada está no ar…", "Modo Preview/Programa foi desligado…" são travas de segurança. Mostre-as ao operador.
6. **Não use obs-websocket direto para mexer no ar** nem em cenas `3Mix *` (seção 10).
7. **DUMP** só funciona com `state:"protected"` ou `"rebuilding"` (`canDump:true`) e não alcança `uncoveredOutputs`. Confirme com o operador e leia `result.dumped` na resposta.
8. **Configuração é local.** Ações da seção 7.2 e rotas "local" respondem 403 fora do computador do 3Mix.

### 12.2 Receitas

**Trocar a câmera no ar (Preview → CUT)** [verificado]

1. `GET /api/json` → guarde `preset`; confira que a entrada desejada existe em `inputs` (use a `key`).
2. `POST /api/control {"action":"preview","input":"<key>"}` → `state.preview` deve ser o nome da entrada.
3. Peça confirmação ao operador.
4. `POST /api/control {"action":"cut","operationId":"ia-0001","expectedScope":"<preset>"}` → `state.operation.stage === "confirmed"` e `state.program` é a entrada.
5. Se a resposta falhar sem `stage` claro: `GET /api/operation-check?id=ia-0001&scope=<preset>`.

**Colocar e tirar uma tarja (GC)** [verificado]

1. `POST /api/control {"action":"gc","kind":"lower","data":{"title":"Maria Souza","subtitle":"Repórter"},"on":true}` → `state.overlays` mostra o canal 1 com `3Mix Tarja`.
2. Para tirar: `{"action":"gc","kind":"lower","on":false}` → canal 1 vazio.
3. Para só trocar o texto sem mexer no ar: mesmo comando sem `on`.

**Iniciar e parar a gravação** [verificado]

1. Confira `state.recording === false` e espaço em disco (`/api/health` → `disk`).
2. `POST /api/control {"action":"record","active":true}` → `state.recording === true`.
3. `POST /api/control {"action":"record","active":false}` → `state.recording === false`.

**Preparar e acionar o DUMP** [verificado com transmissão para receptor RTMP local]

1. Fora do ar: `POST /api/delay {"action":"delay_set","enabled":true,"seconds":7}` → `state:"ready"`.
2. Iniciar a transmissão (decisão do operador): `POST /api/control {"action":"stream","active":true}`.
3. Aguarde `GET /api/delay` → `state:"protected"` e `canDump:true`.
4. Quando o operador mandar: `POST /api/delay {"action":"dump","note":"palavrão no ar"}` → `result.dumped === true`, `result.discardedPackets > 0`, `stats.dumpCount` aumenta e o estado passa a `rebuilding` até o buffer encher de novo.
5. Mudança de atraso só depois de parar a transmissão. Para parar: `{"action":"stream","active":false}`; se vier o erro `O motor não confirmou GetStreamStatus`, **não dispare de novo às cegas**: acompanhe `streaming` no estado (na bancada a transmissão terminou poucos segundos depois) e só repita se continuar `true`.

Observação: `protected` indica que o buffer do atraso está cheio, não que o destino já recebe vídeo. Na bancada, com 3 s de atraso, o motor só abriu a conexão RTMP depois que o buffer encheu, e um DUMP feito nesse instante descartou 177 pacotes antes de qualquer envio.

**Overlay (DSK) com uma entrada pronta** [verificado]

`{"action":"overlay","channel":3,"input":"CAM 2"}` põe; `{"action":"overlay","channel":3}` tira.

**Seguir o estado sem sobrecarregar**: abra `/ws`, use `init` e `state`; filtre `meters` se não precisar de níveis.

### 12.3 Descobrir capacidades em tempo de execução

- `GET /api/health`: instância, porta, conexão, disco.
- Estado (`/api/json`): `inputs` (entradas e chaves), `transitions`, `overlaysEngine.presets`, `macros.actions` / `macros.events` / `macros.conditions`, `buses`, `audioInputs`, `video`.
- `GET /api/modulos`: módulos ligados (`replay`, `rundown`, `calls`, `multiview`, `iso`, `dataSources`, `srtHdr`, `blackbox`, `broadcastDelay`).
- `GET /api/outputs` e `GET /api/settings`: encoders, protocolos e capacidades do motor.
- `GET /api/mix-effects`: M/E disponíveis.
- `docs/api/indice-acoes.json`: todas as ações por módulo, com marcação de "só local" (HTTP e `/ws`).
- Ação desconhecida responde `Comando não implementado: <ação>` sem efeito colateral.
- Vendor `get_interface` identifica o processo do motor.

## 13. Inconsistências conhecidas e itens não verificados

Encontradas ao escrever este manual (o código não foi alterado):

1. **FTB indisponível**: `servidor-api.mjs` cria `Production` sem `finalProgramGateQualified`; toda `ftb` (inclusive `Function=FadeToBlack` do vMix) é recusada. Mesmo qualificado, `FadeToBlack` do vMix não envia `operationId`, `mixId:0` etc. e seria recusado pela validação. [verificado]
2. ~~vMix TCP sem autenticação em `0.0.0.0`~~ — **corrigido em 03/11/2026**: a ponte vMix TCP passou a ser DESLIGADA por padrão (antes ligava sozinha em `0.0.0.0`, sem nenhuma autenticação, enquanto a API HTTP sempre exigiu PIN/token fora do loopback). Quem ainda depende dela (Companion/Stream Deck/Tally físico com módulo vMix) liga com `FREEMIX_ENABLE_VMIX_TCP=1`; o protocolo em si continua sem autenticação própria (é o protocolo vMix, não dá para mudar isso sem quebrar compatibilidade), por isso o padrão agora é loopback — expor na LAN exige `FREEMIX_VMIX_TCP_HOST` explícito, nunca automático. [código, testado isolado em `qa-finalizacao/inventario-crew-broadcast-20261103/testar-vmix-tcp-desligado-padrao.mjs`, 7/7 PASS]
3. **vMix TCP não aceita `&`** entre parâmetros (`Input=M&Value=60` falha). [verificado]
4. **Regras "só local" diferentes entre HTTP e `/ws`**: `ptz_*`, `patch_set` e `mix_audio_set` são locais no HTTP mas aceitos de dispositivo pareado pelo `/ws`. [código]
5. **`ack` do `/ws` devolve o estado bruto**, sem a limpeza aplicada no HTTP (`publicOperation`): recibos incluem campos internos como `signature`. [código]
6. **`delay_set`/`delay_enable`/`delay_disable`** gravam preferência de saída, mas não estão entre as ações "só local" (ao contrário de `settings_*`). `POST /api/blackbox` com `blackbox_clear` também é aceito de dispositivo pareado. [código]
7. **`dump` por `/api/control`** passa pela fila única e por duas leituras completas do motor antes de descartar; `POST /api/delay` chama o motor direto e é o caminho mais rápido. [código]
8. **`overlay_take`** aceita só o **nome** da entrada (não a chave nem o número), diferente de `overlay`. [código]
9. `/api/multiview` (GET), `/api/thumbs` e `/api/network` não trazem o campo `success`. [verificado]
10. O estado completo é enviado pelo `/ws` a cada segundo para cada cliente (na bancada, cerca de 240 KB de JSON por mensagem). [verificado]
11. **Parar a transmissão com atraso ligado** responde erro mesmo quando a parada acontece: `record`/`stream` esperam a confirmação por cerca de 3 s (`controle-producao.mjs`, caso `record`/`stream`, via `wait()` de 60 leituras × 50 ms), e o motor leva mais que isso para encerrar com atraso; a resposta é `400 O motor não confirmou GetStreamStatus`. Numa execução, o pedido feito logo após iniciar recebeu `StopStream: 501` e a transmissão só parou num pedido posterior. [verificado]

O diagnóstico do computador (`diagnostico-maquina.mjs`, `midia-diagnostico.mjs`, `benchmark-capacidade.mjs`) é acessado por `/api/diagnostico` (só no computador do 3Mix), descrito na tabela de rotas. O Pre-Flight usa `maquina-saude.mjs` e `processos-concorrentes.mjs` internamente (amostra da máquina e programas concorrentes aparecem nos itens de `GET /api/preflight`). [código]

Não verificados: parâmetros detalhados de `call_*`, `recovery_*`, `network_*`, `effects_*`, `controller_*`, `audio_routing_*`, `gc_html_*` e `input_*` além de `input_create`; respostas de sucesso de `/api/project/*`; `/api/update`; `/api/network-enable`; acesso remoto real (Bearer e cookie em outro computador); WebSocket em Python; comandos de replay além de `status`.

## 14. Índice completo gerado do código

<!-- indice-gerado:inicio -->

> Gerado automaticamente a partir do código (336 ações de /api/control, 73 rotas, 51 vendor requests). Atualize com `node scripts/documentacao/gerar-indice-api.mjs --atualizar-manual`.

#### Ações de `/api/control` por arquivo-fonte

Legenda: **L** = só no computador do 3Mix pelo HTTP; **Lw** = só no computador do 3Mix pelo WebSocket `/ws`; **—** = aceito também de dispositivo pareado.

- `ferramentas/atualizacao-online.mjs`: `update_check`, `update_configure`, `update_download`, `update_install`, `update_read`
- `ferramentas/audio-ducking-engine.mjs`: `ducking_configure`, `ducking_disable`, `ducking_enable`, `ducking_summary`
- `ferramentas/audio-routing-producao.mjs`: `audio_routing_afv`, `audio_routing_asio_create`, `audio_routing_asio_output_configure`, `audio_routing_asio_output_control-panel`, `audio_routing_asio_output_start`, `audio_routing_asio_output_state`, `audio_routing_asio_output_stop`, `audio_routing_bus_create`, `audio_routing_bus_members`, `audio_routing_bus_remove`, `audio_routing_bus_route`, `audio_routing_bus_volume`, `audio_routing_chain`, `audio_routing_delay`, `audio_routing_devices`, `audio_routing_direct`, `audio_routing_filter`, `audio_routing_get`, `audio_routing_manual`, `audio_routing_open_filters`, `audio_routing_plugin`, `audio_routing_vst3`
- `ferramentas/blackbox-producao.mjs`: `blackbox_clear`, `blackbox_mark`, `blackbox_summary`, `blackbox_trigger`
- `ferramentas/bonding-producao.mjs`: `network_configure`, `network_export_receiver`, `network_get`, `network_measure`, `network_start`, `network_stop`
- `ferramentas/broadcast-delay.mjs`: `delay_disable`, `delay_dump`, `delay_enable`, `delay_set`, `delay_summary`, `dump`
- `ferramentas/calls-producao.mjs`: `call_audio_processing`, `call_conference`, `call_create`, `call_director`, `call_director_create`, `call_ice_import`, `call_ice_reset`, `call_link`, `call_rapid_targets`, `call_reconnect`, `call_reset_password`, `call_return_route`, `call_returns_prepare`, `call_returns_stop`, `call_talk_ping`, `call_talk_start`, `call_talk_stop`, `call_video_experimental`
- `ferramentas/configuracoes-producao.mjs`: `settings_apply`, `settings_defaults`, `settings_encoder_apply`, `settings_encoder_preview`, `settings_encoder_read`, `settings_export`, `settings_get`, `settings_import`, `settings_native`, `settings_pick_image`, `settings_pick_image_status`, `settings_plugin_open`, `settings_plugin_tools`, `settings_projector`, `settings_source_projector`, `settings_stream_key`, `settings_virtual`, `settings_virtual_source`
- `ferramentas/controlador-producao.mjs`: `controller_adapter_fire`, `controller_adapter_read`, `controller_enable`, `controller_event`, `controller_fire`, `controller_hold_ping`, `controller_osc_configure`, `controller_osc_start`, `controller_osc_stop`, `controller_read`, `controller_release`, `controller_remove`, `controller_save`
- `ferramentas/controle-producao.mjs`: `active`, `audio_balance`, `audio_bus`, `audio_enable`, `audio_monitor`, `audio_mute`, `audio_volume`, `cut`, `data_append`, `data_bind`, `data_edit`, `data_file`, `data_http`, `data_import`, `data_publish`, `data_refresh`, `data_remove`, `data_remove_row`, `data_scope`, `data_select`, `fade`, `ftb`, `gc`, `media`, `media_seek`, `media_settings`, `overlay`, `preview`, `record`, `score`, `stream`, `tbar`, `transition`
- `ferramentas/efeitos-producao.mjs`: `effects_caption_create`, `effects_captions`, `effects_filter`, `effects_ptz`, `effects_source`
- `ferramentas/entradas-producao.mjs`: `input_align`, `input_anchor`, `input_background`, `input_content_undo`, `input_create`, `input_duplicate`, `input_geometry`, `input_layer`, `input_link`, `input_remove`, `input_reorder`, `input_slot`, `input_speaker`, `input_style`, `input_tags`, `input_template`, `input_undo`, `input_variant`, `input_video_delay`
- `ferramentas/gc-biblioteca-producao.mjs`: `gc_library_air`, `gc_library_asset`, `gc_library_clock_restart`, `gc_library_duplicate`, `gc_library_export`, `gc_library_import`, `gc_library_prepare`, `gc_library_read`, `gc_library_remove`, `gc_library_save`, `gc_library_unlink`, `gc_library_variant`
- `ferramentas/gc-html-producao.mjs`: `gc_html_clock_restart`, `gc_html_link`, `gc_html_play`, `gc_html_stop`, `gc_html_unlink`, `gc_html_update`
- `ferramentas/macros-producao.mjs`: `macro_cancel`, `macro_record_start`, `macro_record_stop`, `macro_remove`, `macro_run`, `macro_save`, `macro_trigger_enable`, `macro_trigger_remove`, `macro_trigger_save`
- `ferramentas/media-playout-engine.mjs`: `playout_chain_link`, `playout_chain_unlink`, `playout_delete_playlist`, `playout_freezeoff`, `playout_freezeon`, `playout_hold`, `playout_item_update`, `playout_load_playlist`, `playout_loadclip`, `playout_loopoff`, `playout_loopon`, `playout_next`, `playout_pause`, `playout_play`, `playout_playplaylist`, `playout_preload`, `playout_prev`, `playout_preview_clip`, `playout_previewclip`, `playout_previous`, `playout_restart`, `playout_save_playlist`, `playout_seek`, `playout_setin`, `playout_setout`, `playout_setposition`, `playout_stop`, `playout_take`, `playout_takenext`, `queue_delete`, `queue_freezeoff`, `queue_freezeon`, `queue_hold`, `queue_loadclip`, `queue_loopoff`, `queue_loopon`, `queue_next`, `queue_pause`, `queue_play`, `queue_playplaylist`, `queue_preload`, `queue_prev`, `queue_preview_clip`, `queue_previewclip`, `queue_previous`, `queue_restart`, `queue_save`, `queue_seek`, `queue_setin`, `queue_setout`, `queue_setposition`, `queue_start`, `queue_stop`, `queue_take`, `queue_takenext`
- `ferramentas/mix-audio-producao.mjs`: `mix_audio_read`, `mix_audio_set`
- `ferramentas/overlays-producao.mjs`: `overlay_configure`, `overlay_dve_apply`, `overlay_dve_restore`, `overlay_get`, `overlay_kill_all`, `overlay_off`, `overlay_take`, `overlay_toggle`
- `ferramentas/patch-registry-producao.mjs`: `patch_read`, `patch_set`
- `ferramentas/preflight-producao.mjs`: `preflight_bypass`, `preflight_check`, `preflight_history`, `preflight_process_close`, `preflight_process_ignore`, `preflight_process_unignore`, `preflight_run`, `preflight_summary`
- `ferramentas/ptz-manager.mjs`: `ptz_acquire`, `ptz_device_info`, `ptz_device_remove`, `ptz_device_save`, `ptz_focus`, `ptz_focus_mode`, `ptz_home`, `ptz_imaging_get`, `ptz_imaging_set`, `ptz_link`, `ptz_move`, `ptz_ping`, `ptz_preset_recall`, `ptz_preset_save`, `ptz_release`, `ptz_stop`, `ptz_test`, `ptz_tracking_claim`, `ptz_tracking_release`, `ptz_unlink`, `ptz_zoom`
- `ferramentas/recuperacao-producao.mjs`: `recovery_backup`, `recovery_checkpoint`, `recovery_diagnose`, `recovery_import`, `recovery_import_preview`, `recovery_journal_plan`, `recovery_list`, `recovery_restore`, `recovery_session_config`, `recovery_session_dismiss`, `recovery_session_status`
- `ferramentas/return-feed-producao.mjs`: `return_feed_configure`, `return_feed_start`, `return_feed_stop`, `return_feed_summary`
- `ferramentas/rundown-producao.mjs`: `rundown_add_block`, `rundown_add_step`, `rundown_arm`, `rundown_auto_advance`, `rundown_capture`, `rundown_capture_apply`, `rundown_capture_current`, `rundown_capture_discard`, `rundown_clear_history`, `rundown_end`, `rundown_execute`, `rundown_get`, `rundown_go`, `rundown_jump`, `rundown_next`, `rundown_prepare`, `rundown_reload`, `rundown_remove_block`, `rundown_remove_step`, `rundown_reopen`, `rundown_save`, `rundown_select`, `rundown_set_steps`, `rundown_skip`, `rundown_summary`, `rundown_suspend`, `rundown_update_block`, `rundown_update_step`
- `ferramentas/saidas-producao.mjs`: `outputs_configure`, `outputs_external_read`, `outputs_get`, `outputs_mix`, `outputs_network`, `outputs_omt_hdr`, `outputs_profile_load`, `outputs_profile_save`, `outputs_record`, `outputs_sdi`, `outputs_source`, `outputs_srt_hdr`, `outputs_start`, `outputs_stop`
- `ferramentas/sinais-producao.mjs`: `signal_configure`, `signal_probe`, `signal_read`

#### Ações aceitas por rotas próprias (campo `action` do corpo)

- `/api/blackbox`: `blackbox_clear`, `blackbox_mark`, `blackbox_summary`, `blackbox_trigger`
- `/api/delay`: `delay_disable`, `delay_dump`, `delay_enable`, `delay_set`, `delay_summary`, `dump`
- `/api/ducking`: `ducking_configure`, `ducking_disable`, `ducking_enable`, `ducking_summary`
- `/api/overlays`: `overlay_configure`, `overlay_dve_apply`, `overlay_dve_restore`, `overlay_get`, `overlay_kill_all`, `overlay_off`, `overlay_take`, `overlay_toggle`
- `/api/playout`: `playout_chain_link`, `playout_chain_unlink`, `playout_delete_playlist`, `playout_freezeoff`, `playout_freezeon`, `playout_hold`, `playout_item_update`, `playout_load_playlist`, `playout_loadclip`, `playout_loopoff`, `playout_loopon`, `playout_next`, `playout_pause`, `playout_play`, `playout_playplaylist`, `playout_preload`, `playout_prev`, `playout_preview_clip`, `playout_previewclip`, `playout_previous`, `playout_restart`, `playout_save_playlist`, `playout_seek`, `playout_setin`, `playout_setout`, `playout_setposition`, `playout_stop`, `playout_take`, `playout_takenext`, `queue_delete`, `queue_freezeoff`, `queue_freezeon`, `queue_hold`, `queue_loadclip`, `queue_loopoff`, `queue_loopon`, `queue_next`, `queue_pause`, `queue_play`, `queue_playplaylist`, `queue_preload`, `queue_prev`, `queue_preview_clip`, `queue_previewclip`, `queue_previous`, `queue_restart`, `queue_save`, `queue_seek`, `queue_setin`, `queue_setout`, `queue_setposition`, `queue_start`, `queue_stop`, `queue_take`, `queue_takenext`
- `/api/preflight`: `preflight_bypass`, `preflight_check`, `preflight_history`, `preflight_process_close`, `preflight_process_ignore`, `preflight_process_unignore`, `preflight_run`, `preflight_summary`
- `/api/replay`: `air`, `audio`, `auto-align`, `camera-options`, `capture`, `capture-range`, `configure`, `delete`, `export-event`, `export-events`, `frame`, `history`, `history-frame`, `history-pin`, `history-preview`, `history-quad`, `import`, `jump`, `jump-to-now`, `link`, `live`, `load`, `mark-in`, `mark-in-out`, `mark-out`, `play-event`, `play-pause`, `program-changed`, `recover`, `recover-in`, `relink`, `relocate`, `reorder`, `repair`, `retention`, `seek`, `select-camera`, `select-event`, `speed`, `start`, `status`, `stop`, `swap`, `transport`, `trim-event`, `unload`, `update-event`
- `/api/return-feeds`: `return_feed_configure`, `return_feed_start`, `return_feed_stop`, `return_feed_summary`
- `/api/rundown`: `rundown_add_block`, `rundown_add_step`, `rundown_arm`, `rundown_auto_advance`, `rundown_capture`, `rundown_capture_apply`, `rundown_capture_current`, `rundown_capture_discard`, `rundown_clear_history`, `rundown_end`, `rundown_execute`, `rundown_get`, `rundown_go`, `rundown_jump`, `rundown_next`, `rundown_prepare`, `rundown_reload`, `rundown_remove_block`, `rundown_remove_step`, `rundown_reopen`, `rundown_save`, `rundown_select`, `rundown_set_steps`, `rundown_skip`, `rundown_summary`, `rundown_suspend`, `rundown_update_block`, `rundown_update_step`

#### Rotas HTTP encontradas no código

`/api`, `/api/access`, `/api/audio-routing`, `/api/aux-routing`, `/api/blackbox`, `/api/calls/audio`, `/api/color/frame`, `/api/composition-frame`, `/api/control`, `/api/crew/intercom`, `/api/crew/intercom/ws`, `/api/crew/tally`, `/api/crew/tally/ws`, `/api/delay`, `/api/devices/all`, `/api/devices/video`, `/api/diagnostics`, `/api/diagnostics/download`, `/api/diagnostics/preview`, `/api/diagnostics/reveal`, `/api/ducking`, `/api/effects`, `/api/effects-frame`, `/api/final-program-gate`, `/api/gc-compatible`, `/api/health`, `/api/inputs-health`, `/api/iso`, `/api/json`, `/api/mix-audio`, `/api/mix-effects`, `/api/mix-effects/check`, `/api/modulos`, `/api/multicorder/benchmark`, `/api/multicorder/discos`, `/api/multiview`, `/api/multiview-montagens`, `/api/network`, `/api/network-enable`, `/api/operation-check`, `/api/outputs`, `/api/outputs-watchdog`, `/api/overlays`, `/api/pair`, `/api/panel-close`, `/api/panel-log`, `/api/panel-open`, `/api/panel-title`, `/api/patch`, `/api/playout`, `/api/preflight`, `/api/project/*`, `/api/project/apply`, `/api/project/preview`, `/api/project/read`, `/api/project/scan`, `/api/projects-copy`, `/api/ptz`, `/api/ptz/preview`, `/api/qr.svg`, `/api/replay`, `/api/replay-preview/*`, `/api/return-feeds`, `/api/rundown`, `/api/settings`, `/api/signals`, `/api/srt-hdr`, `/api/thumbs`, `/api/ticker-ack`, `/api/update`, `/api/video-settings`, `/api/workspace`, `/ws`

Páginas do painel servidas pela mesma porta (HTML, não JSON): .

Mensagens que o servidor envia pelo `/ws`: . Ação especial do `/ws`:  (usa o campo `cmd`).

#### Funções vMix aceitas (minúsculas; o nome não diferencia maiúsculas)

`activeinput`, `adjustgain`, `audio`, `audiooff`, `audioon`, `cut`, `cutdirect`, `fade`, `masteraudio`, `nextitem`, `overlayinput1`, `overlayinput1in`, `overlayinput1out`, `overlayinput2`, `overlayinput2in`, `overlayinput2out`, `overlayinput3`, `overlayinput3in`, `overlayinput3out`, `overlayinput4`, `overlayinput4in`, `overlayinput4out`, `overlayinput5`, `overlayinput5in`, `overlayinput5out`, `overlayinput6`, `overlayinput6in`, `overlayinput6out`, `overlayinput7`, `overlayinput7in`, `overlayinput7out`, `overlayinput8`, `overlayinput8in`, `overlayinput8out`, `pause`, `play`, `playoutclipgain`, `playoutprev`, `playoutprevious`, `playouttake`, `previewinput`, `previousitem`, `replaymarkinout`, `replaymarkinoutlive`, `replayplaybackspeed`, `replayplaypause`, `replaysetspeed`, `replayswap`, `replayswapchannel`, `replayswapchannels`, `replaytoggleplayforward`, `restart`, `setmastervolume`, `startrecording`, `startstreaming`, `stoprecording`, `stopstreaming`, `takenext`

Comandos TCP: `FUNCTION`, `QUIT`, `SUBSCRIBE`, `TALLY`, `UNSUBSCRIBE`, `XML`. Assinaturas: `ACTS`, `TALLY`.

#### Vendor requests do motor

- `downstream-keyer` (`freemix-app/plugins/downstream-keyer/downstream-keyer-dock.cpp`): `add_downstream_keyer`, `dsk_add_exclude_scene`, `dsk_add_scene`, `dsk_get_scene`, `dsk_remove_exclude_scene`, `dsk_remove_scene`, `dsk_select_scene`, `dsk_set_hide_after`, `dsk_set_tie`, `dsk_set_transition`, `get_downstream_keyer`, `get_downstream_keyers`, `remove_downstream_keyer`
- `freemix-hotkeys` (`freemix-app/frontend/widgets/FreeMixGlobalHotkeys.cpp`): `control`; ações de `control`: `clear`, `configure`, `status`
- `freemix-preferences` (`freemix-app/frontend/widgets/FreeMixPreferences.cpp`): `control`; ações de `control`: `apply`, `encoder_apply`, `encoder_preview`, `encoder_read`, `pick_image_read`, `pick_image_start`, `plugin_tool_open`, `plugin_tools`, `read`, `reset_outputs`, `runtime_outputs`
- `freemix` (`freemix-app/frontend/widgets/FreeMixMultistream.cpp`): `audio_capabilities`, `broadcast_delay`, `call_audio`, `call_video`, `close_panel`, `control_destination`, `control_mix`, `fade_to_black`, `final_program_gate`, `finish_input_panel`, `get_destinations`, `get_interface`, `get_master_level`, `get_mixes`, `get_preset`, `get_scope`, `get_sources_status`, `network_output`, `omt_hdr_output`, `open_panel`, `open_settings`, `open_vst_editor`, `project_creation_policy`, `project_device_inventory`, `reorder_inputs`, `save_preset`, `sdi_output`, `set_destinations`, `set_panel_title`, `set_scope`, `set_transition_duration`, `shutdown_idle`, `srt_hdr_output`, `talkback`, `virtual_cam_source`
- `obs-browser` (`freemix-app/plugins/obs-browser/obs-browser-plugin.cpp`): `emit_event`

<!-- indice-gerado:fim -->


### Mensagem dos relógios de produção

`clock_message` reutiliza o slot persistente dos três relógios e o evento da topbar. Exemplo de ação para API, macro ou alvo de controlador:

```json
{"action":"clock_message","slot":3,"message":"FALTAM 2 MINUTOS"}
```

Em passos de macro/controladores, usar `data: {"slot":3,"message":"FALTAM 2 MINUTOS"}`. Posições 1–3, texto até 40 caracteres sem controles. Texto vazio mantém o tipo mensagem e a topbar exibe seu placeholder; não restaura o tipo anterior. Outras posições são preservadas. A gravação é relida antes do broadcast; falha de confirmação não emite notificação de sucesso. Falha no broadcast pode ocorrer depois de persistir: não implica rollback da gravação. O comando passa pela fila operacional existente.

Editor de macros: “Mensagem dos relógios de produção”. Para teclado, salvar a macro e vinculá-la pelo controlador existente, ou usar o alvo de ação quando disponível na interface. Testes de normalização, persistência/readback simulado e despacho por controlador passaram; interface do editor conferida em navegador estático. Runtime/CEF e pacote Alpha ainda não verificados por esta entrega.
