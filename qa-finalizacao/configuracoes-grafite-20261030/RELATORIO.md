# Configurações · grafite das páginas embutidas, Saídas externas embutida e todas as destinações (QA 30/10/2026)

Teste headless em Chromium contra o servidor de fixture local, que serve os **arquivos reais** de
`3mix-panel/painel/remoto` pelas rotas reais da central (mapa de rotas do `ferramentas/servidor-api.mjs`) e responde
apenas as leituras de API com uma produção fixa. Nenhuma saída, gravação ou transmissão é iniciada: todo
`POST /api/control` é registrado e o teste prova que, ao abrir as páginas, **nenhum comando de início** foi enviado.
Instalação do operador e `3mix-runtime` não foram tocados; nada foi copiado para a runtime.

- `evidencias/antes/` — capturas do comportamento anterior (gravadas **antes** das mudanças).
- `evidencias/depois/` — capturas finais (1280×800, 1440×900, 1600×1000).
- `relatorio-antes.json` / `relatorio-depois.json` — medições de estilo real (cores computadas, alturas, rotas) e as
  verificações. `depois`: **68 verificações, 20 capturas, 0 erros de console**.

## 1. Páginas embutidas com cor de outro produto → padrão grafite 3Mix

Tinta aplicada pela camada de embutir do `settings.js` (`EMBED_GRAFITE_CSS`, injetada via `contentDocument` junto de
`EMBED_BASE_CSS`/`EMBED_CHROME`). Nenhum controle, ID, handler ou comportamento da página foi tocado — é só pintura,
com estados hover/ativo/desabilitado cobertos.

| Real (estilo computado) | Antes | Depois |
|---|---|---|
| Base do DSK/Multiview/Remoto/Automação | `rgb(18,21,25)` / `#0d1217` (famílias de outro produto) | `#111318` (17,19,24) |
| Painéis/cards | `#1b2026`/`#1f252d` | `#14171c` (20,23,28) |
| Campos | 31 px, `#12161c` | **36 px**, `#1a1d23`, borda `#2a2e35` |
| Tipografia | título 17, seção 14, corpo 13 | **título 22 · seção 16 · labels 13 · corpo 14** |
| `Nova Macro`, `Salvar`, `16:9 Standard`, `Safe Areas` | verde `#006400`/gradiente verde | grafite de seleção `#2a303a` + sublinhado `#e8ebef` |
| `Desarmar Todos (Kill All)`, `Retirar do Ar (OFF)`, `Excluir Macro`, `Parar`, `TAKE` | chips vermelhos/verdes/âmbar grandes | grafite/neutro `#22262d` |
| chip azul `3Mix Modular Studio` | borda `#00a8ff` + brilho | grafite como qualquer card (borda `#2a2e35`) |
| **Estado operacional real** | — | preservado em cor: chip `● NO AR` vermelho `#3a2725/#e0b6b0`, marcador `on-air` da aba DSK, tally `PROGRAM · NO AR` do Multiview, chip `ext-state.live`, textos de erro crítico |

Real x visual conferido por estilos computados no documento embutido (não por impressão): ver `relatorio-depois.json`
→ `measurements.dsk/multiview/remote/automation` e as verificações "em grafite" / "mantém vermelho de estado".

Controles preservados e verificados funcionando: matriz dos 8 DSKs (8 linhas), 8 abas de canal (troca responde),
8 presets DVE, transições/stinger/TIE; 5 presets do Multiview + Safe Areas + Tela Cheia (preset aplica); QR + código
PIN do Remoto (18 cards); macros/gatilhos/paços e "Nova Macro" da Automação (2 macros, 34 ações de passo).

## 2. Saídas externas não abria dentro da Configurações

A categoria `outputs` agora embute a página real (`/externo?embed=1`, mesma rota da janela própria) pelo mapa EMBED
existente — `EMBED_CHROME.outputs` esconde só a barra de título duplicada e mantém todos os controles. O atalho
**Abrir em janela** continua no bar do embutido. Verificado: 4 saídas, NDI/OMT/SRT, câmera virtual, "Ver status",
"Salvar rascunho", "Iniciar saída 1/todas" presentes; e **abrir a página não inicia nada** (log de comandos vazio de
inícios: `outputs.comandos: []`).

## 3. Transmissão: "só tem 1... as demais cadê?"

A categoria `streaming` agora mostra **todas as destinações da instalação**, só com o que a API expõe
(`config.server/protocol`, `outputs.destinations[]`, `outputs.ndi/omt.senders[]`): nome, destino, protocolo e estado
real (no ar/parado/enviando/erro). Cada linha tem **Editar** (abre a aba da página real) e **Janela própria**. As
páginas reais foram embarcadas sem duplicar lógica:

- aba **MultiStream** → iframe de `/transmitir?embed=1` (a página real por trás do menu "Abrir MultiStream…" da Mesa,
  5 destinos com Destino/URL/Chave/Qualidade/codificador/Iniciar/Ver status).
- aba **Saídas externas** → iframe de `/externo?embed=1` (NDI/OMT/SRT).
- abas Rede/Trilhas/Ao iniciar/parar/Avançado preservadas; sub-abas de Gravação inalteradas.

Estados reais x visual: com tudo parado as linhas mostram "parado" neutro; com uma destinação e um sender NDI
ativados no motor (`evidencias/depois/09-streaming-estados-1280x800.png`) as linhas mostram "no ar"/"enviando" em
verde de estado — conferido por `streaming.estados-ao-vivo`.

## Defeitos pré-existentes corrigidos (no escopo das páginas embutidas)

1. **`overlays.js` usava `esc()` sem defini-lo** — a matriz dos 8 DSKs não renderizava (0 linhas) e o console
   registrava `esc is not defined` (o QA anterior já havia registrado o erro como pré-existente). Definido `esc` no
   topo do arquivo: matriz volta a ter 8 linhas e o console fica limpo.
2. **`externo.html` colapsava as linhas em larguras ≤ 700 px** (o `@media` próprio empurrava `.vd-row` para altura 0 e
   as linhas se sobrepunham — "Saída"/"Protocolo" e o rodapé amassado). O defeito existia **também na janela própria
   de 700 px do operador** (provado antes da correção; captura de antes em `evidencias/antes/05-outputs-1280x800.png`
   mostra a sobreposição embutida). Corrigido só o CSS do `@media (max-width:700px)` (bloco + `height:fit-content` +
   rodapé com quebra); controles, IDs e handlers intactos. Beneficia embutido e janela própria.

## Preservado (verificado)

Árvore de 18 categorias · busca · Aplicar / Aplicar e fechar / Cancelar · Importar / Exportar · Restaurar padrões ·
painel "Produção atual" · rotas antigas (`?category=display/files/appearance`, `/settings`) · Replay e Sobre seguem
embutidos e intactos (a camada grafite só alcança DSK/Multiview/Remoto/Automação/Saídas externas/MultiStream) ·
sem overflow horizontal em 1280×800, 1440×900 e 1600×1000 · console limpo.

## Limitações

- Feito em Chromium headless com fixture; a injeção usa `contentDocument` (mesma técnica já validada no QA de embute
  de 30/10). Confirmação final no CEF da instalação fica pendente da sincronização para a runtime.
- O verde/vermelho de **estado** segue a linguagem da suíte (`#2f9e5f`/`#c05046` suaves), não o verde chapado antigo.
- As janelas próprias (fora da central) continuam com a pintura própria de cada página; a identidade grafite pedida
  vale para o que a central embute. A única exceção é a correção de layout do `externo.html`, que vale para todos.

## Como repetir

```powershell
node 3mix-panel/qa-finalizacao/configuracoes-grafite-20261030/test-central.mjs 8811 antes    # evidência do antes
node 3mix-panel/qa-finalizacao/configuracoes-grafite-20261030/test-central.mjs 8811 depois   # verificações + capturas
```

## Arquivos alterados (produto)

- `3mix-panel/painel/remoto/settings.js` — camada grafite dos embutidos, `outputs` embutido, abas MultiStream e
  Saídas externas em Transmissão, cartão "Destinações desta instalação", releitura de `/api/outputs` quando velho.
- `3mix-panel/painel/remoto/settings-workspace.css` — estilos da lista de destinações (linguagem grafite da central).
- `3mix-panel/painel/remoto/overlays.js` — define `esc` (mata o erro de console e restaura a matriz dos 8 DSKs).
- `3mix-panel/painel/remoto/externo.html` — CSS do `@media (max-width:700px)`: linhas e rodapé sem sobreposição.
