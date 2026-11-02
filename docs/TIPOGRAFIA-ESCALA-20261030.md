# Tipografia e densidade das telas web — 30/10/2026

## Tecnologia (resposta curta)

O 3Mix é **C++/Qt nativo (fork do OBS Studio) + CEF/HTML/CSS/JS + Node.js**.
Não é Electron, não é WPF e não é WinUI.

- **Qt/C++**: janela principal, docks, monitores Preview/Program, diálogos nativos,
  barra de menu e a topbar de relógios (`topbar.html` dentro de um `QCefWidget`
  de altura fixa).
- **CEF + HTML/CSS/JS**: painéis operacionais (Mesa, Áudio, MultiView, Atalhos,
  Configurações, Replay, Saídas…). É aqui que esta escala tipográfica atua.
- **Node.js**: API HTTP/WebSocket do painel (`ferramentas/servidor-api.mjs`),
  que também serve os arquivos estáticos de `painel/` e `painel/remoto/`.

## Escopo desta rodada

| Tela | Arquivos |
|---|---|
| Mesa | `painel/mesa.html`, `painel/mesa-grafite.css` |
| Áudio | `painel/remoto/audio.html`, `audio-mixer-workspace.css` (+ default de largura do strip em `audio-mixer-workspace.js`) |
| MultiView | `painel/remoto/multiview.html`, `multiview.js` |
| Atalhos | `painel/remoto/atalhos.html` (regras com `data-page="atalhos"`) |
| Tokens | `painel/remoto/3mix-tipografia.css` (novo) |

**Fora do escopo, por decisão:** Configurações (`settings.js`,
`settings-workspace.css`, `settings.html`) e Replay (`replay*`). Esses arquivos
têm agentes próprios nesta rodada e não foram tocados. Para isso, os CSS
compartilhados `vmix-dialogo.css`, `controle.css` e `3mix-grafite.css` **não**
foram alterados: a escala de Atalhos é aplicada por seletores
`body.vd[data-page="atalhos"]` dentro do próprio `atalhos.html`, e a de
MultiView fica no `<style>` da página.

## Tokens (`remoto/3mix-tipografia.css`)

| Token | Valor | Uso |
|---|---|---|
| `--fs-page` / `--lh-page` | 22 px / 24 px | título de janela ou página |
| `--fs-section` / `--lh-section` | 16 px / 18 px | título de painel/seção |
| `--fs-label` / `--lh-label` | 13 px / 14 px | rótulo de campo, nome de canal, `th` |
| `--fs-body` / `--lh-body` | 14 px / 20 px | corpo, valores, itens de lista |
| `--fs-button` / `--lh-button` | 13 px / 14 px | texto de botão |
| `--fs-desc` / `--lh-desc` | 12 px / 13 px | descrição auxiliar |
| `--fs-meta` / `--lh-meta` | 12 px / 16 px | unidade, contador, versão |
| `--fs-status` / `--lh-status` | 12 px / 13 px | estado, tally, legenda curta |

Espaçamento: `--sp-1:4px`, `--sp-2:8px`, `--sp-3:12px`, `--sp-4:16px`,
`--sp-6:24px` (aliases `--gap-*`).
Campos: `--field-h:36px`, `--field-h-lg:40px`, `--field-h-sm:32px`,
`--btn-h:36px`, `--btn-h-lg:40px`, `--btn-h-sm:30px`, `--row-h:36px`.
Fonte: `"Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI",
system-ui, -apple-system, Roboto, Arial, sans-serif`. A variante *Variable* só
existe no Windows 11; no Windows 10 a cadeia cai em Segoe UI sem mudar métrica.

A base só se aplica quando a página declara `data-tipografia="3mix"` **e**
carrega o arquivo. Classes utilitárias (`.t3-page`, `.t3-section`, `.t3-label`,
`.t3-body`, `.t3-btn`, `.t3-desc`, `.t3-meta`, `.t3-status`, `.t3-field`,
`.t3-row`, `.t3-num`) ficam disponíveis para as próximas telas.

```html
<link rel="stylesheet" href="3mix-tipografia.css"> <!-- ou remoto/… na Mesa -->
<body data-tipografia="3mix">
```

## Qt × CEF e DPI (por que px, e não pt/zoom)

- O **Qt** trata o DPI do Windows: `QFont` em point size, QSS em px lógicos,
  `AA_EnableHighDpiScaling`. A topbar nativa tem altura fixa em Qt (40 px no
  dock e 122 px no modo relógios), por isso ela **não** entra nesta escala.
- O **CEF** recebe o mesmo *scale factor* do sistema e converte 1 px de CSS em
  1 DIP. No Windows a 150%, 14 px de CSS ocupam 21 px físicos — sem nenhuma
  conta do nosso lado.
- Por isso a escala é escrita em **px de CSS (DIP)**, nunca em `pt` (somaria a
  conversão de 96 dpi e cresceria duas vezes) e nunca com `zoom`,
  `transform: scale()` ou multiplicação manual por 1.25/1.5 (duplicaria a
  escala do CEF).
- O que muda entre 100/125/150% é o **espaço disponível**, não o tamanho do
  texto: a 150% numa tela 1920×1080 a janela tem 1280×720 DIPs. Por isso as
  alturas de linha e as larguras mínimas foram revistas para caber nesse
  cenário, e o texto não encolhe.
- `rem` fica reservado para o que deve acompanhar o root; os componentes usam
  px porque a grade de altura (barras de 44/46/28 px) é fixa no desenho.

## O que mudou em cada tela

### Mesa (`mesa.html` + `mesa-grafite.css`)
- Corpo 12 → **14 px**; rótulos de card/bank 9,5–11 → **12 px**; botões da
  barra inferior 11 → **12,5 px** com altura 30 → **36 px**; linha de status
  11 → **12 px**.
- Switcher: cabeçalho 18 → 23 px, etiqueta 17 → 22 px, card com a imagem
  ocupando a faixa (sem tarja preta sobrando).
- Cards de entrada: título 26 → 30 px, botões de ação 21 → 26 px.
- Mixer lateral: cabeçalho de canal 25 → 30 px, botões 21 → 26 px, faixa do
  strip 75 → 88 px.
- DSK/Gráficos, menus de contexto, popovers e editores: campos 25 → 36 px,
  itens de menu 34 px de altura mínima, títulos 13 → 15 px.
- **Correção incidental de grade:** a Mesa tinha 6 faixas de `grid-template-rows`
  para 5 filhos visíveis (a `.studio-topbar` é `display:none` fora do
  `popup-mode`), então o rodapé recebia a faixa `1fr` e a tela quebrava em
  125/150%. As faixas agora são 44 / auto / 1fr / 46 / 28 px, com
  `grid-template-columns: minmax(0,1fr)` para o conteúdo não empurrar a janela.
  Esse defeito já existia na linha de base (ver medições abaixo).

### Áudio (`audio.html` + `audio-mixer-workspace.css`)
- Corpo 12 → **14 px**; nome do canal 10,5 → **12,5 px**; tabela 10,5 →
  **12,5 px**; `th` 8,5 → **10,5 px**; abas 11 → **13 px** (36 px de altura);
  barra lateral 252 → **280 px** e itens 32 → **42 px**.
- Campos: busca 24 → 34 px, selects de tabela 24 → 34 px, inputs numéricos
  22 → 34 px, botões 26 → 34 px.
- Largura padrão do strip 112 → **124 px** (o slider continua de 92 a 176 e a
  preferência salva é respeitada).
- Em 720 px de altura (150%) o strip foi compactado (cabeçalho 38 px, corpo
  mínimo 100 px) para as rotas M/A/B não serem cortadas.

### MultiView (`multiview.html` + `multiview.js`)
- Botões de layout 11 → **12,5 px** (34 px), etiquetas de tally 10 → 11,5 px,
  barra de informação 26 → **32 px** (12,5 px), título do card 18 → **22 px**.
- `main` deixa de herdar o `max-width: 1280px` de `controle.css`: o MultiView
  usa a janela inteira em 1920.
- Removido o subtítulo “PRÉVIA / EMISSÃO ATIVA” dos monitores master: repetia
  a etiqueta de tally e a barra de informação.

### Atalhos (`atalhos.html`)
- Tabela 11 → **12,5 px** (linhas ~47 px), botões de comando 20 → **30 px**,
  títulos de seção 13,5 px, campos 28 → **36 px**, botões 28 → **36 px**,
  barra inferior 34 → **40 px**.
- Removidos `font-size` inline redundantes (`11px`, `10px`) que impediam a
  escala de agir; a regra é escopada em `body.vd[data-page="atalhos"]`.

## Teste headless (100 / 125 / 150%)

Sem abrir janela visível e sem tocar no motor do operador, o QA em
`qa-tipografia/` sobe um servidor somente leitura com transporte sintético
(WebSocket obs-websocket + `/api/*`) e serve os arquivos reais. Cada captura é
feita por DevTools Protocol em Chromium/Edge 156.

Viewport equivalente em DIPs (é o que o CEF recebe depois do DPI):

| Windows | Viewport de teste |
|---|---|
| 100% | 1920 × 1080 |
| 125% | 1536 × 864 |
| 150% | 1280 × 720 |

Resultado (12 combinações depois, 12 antes):

| Tela | Antes | Depois |
|---|---|---|
| Mesa | estoura a largura em 125% (1614 px) e 150% (1496 px); rodapé na faixa `1fr` | 0 estouro; sem corte de texto |
| Áudio | ok | 0 estouro; strip cabe em 720 px |
| MultiView | ok, mas limitado a 1280 px | 0 estouro; usa a janela |
| Atalhos | ok | 0 estouro; tabela e campos maiores |

Evidências em `qa-tipografia/capturas/<tela>-<antes|depois>-<100|125|150>.png`
e medições em `qa-tipografia/medicoes/*.json`. Para repetir:

```
node qa-tipografia/servidor-qa.mjs                  # depois, porta 18391
$env:QA_BASE="antes"; node qa-tipografia/servidor-qa.mjs   # antes, porta 18391
powershell -File qa-tipografia/rodar-matriz.ps1
```

## Limitações e pendências

- A matriz foi medida em Chromium/Edge headless, não no CEF da instalação do
  operador. O DPI foi simulado pelo viewport em DIPs (o CEF aplica o scale
  factor do sistema), sem alterar a escala do Windows e sem abrir janela
  visível — a confirmação no monitor físico do operador continua necessária.
- A Mesa HTML (`mesa.html`) é a superfície CEF da mesa; os monitores
  Preview/Program seguem nativos/GPU e não entram nesta escala. A correção de
  grade acima precisa ser conferida na janela real em 100/125/150%.
- Não foram alterados: `settings.*`, `replay*`, `vmix-dialogo.css`,
  `controle.css`, `3mix-grafite.css` e `topbar.html`. As outras janelas que
  usam `vmix-dialogo.css`/`controle.css` (Saídas, Corte, GC, Overlays, AUX…)
  continuam na escala anterior até uma rodada própria.
- Observação fora do escopo: no mixer da Mesa, sem barramentos configurados, o
  thumb do fader não aparece (comportamento anterior a esta rodada). No
  switcher, nomes longos continuam truncando com reticências por desenho.
