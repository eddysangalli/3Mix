# Replay · pass visual grafite (30/10/2026)

Bancada offline da frente visual do Replay. Nenhum arquivo de runtime, mesa,
áudio, configurações, `replay-disco.mjs` ou motor foi alterado.

## O que foi verificado

- Paleta grafite compartilhada (#202020 / #252525 / #2b2b2b / #414141 / #ededed).
- Escala: título 22 px, seções 16 px, labels 13 px, corpo 14 px, botões 13–14 px,
  descrições 12–13 px, status 12–13 px; Segoe UI Variable/Segoe UI.
- Campos de 36 px (arquivo de caminho 38 px), espaçamento 4/8/12/16.
- 1440×900 e 1600×1000 sem rolagem; 1280×800, 1152×720, 1067×667 e 960×600
  com rolagem do miolo (sem sobreposição).
- A/B, quadview, IN/OUT, lances salvos, carregar A/B, colocar no ar, voltar ao
  vivo, velocidade, vínculo A/B, arquivo ausente/localizar, configurações.
- Console sem erros de página; nenhuma requisição 404 no fixture.

## Como repetir

```powershell
cd 3mix-panel/qa-finalizacao/replay-visual-grafite-20261030
npm install
node fixture-server.mjs 8793
# em outro terminal, na mesma pasta:
node shot.mjs after http://127.0.0.1:8793
node interaction.mjs http://127.0.0.1:8793
```

O fixture serve os arquivos reais de `painel/remoto` e responde apenas às rotas
`/api/replay`, `/api/json`, `/api/effects-frame` e `/api/panel-*` com dados fixos.

## Evidências

- `before/replay-1440x900.png` — estado anterior.
- `after/replay-1440x900.png` — estado final.
- `after/replay-1600x1000.png`, `replay-1280x800.png`, `replay-1152x720.png`,
  `replay-1067x667.png`, `replay-960x600.png`.
- `after/replay-1152-rolado.png`, `replay-960-rolado.png` — tabela e detalhes
  após rolagem nos tamanhos com 125%/150%.
- `after/replay-detalhe.png` — lance selecionado.
- `after/replay-configuracoes.png` — diálogo Câmeras e gravação.
- `after/replay-arquivo-ausente.png` — diálogo Localizar arquivo.
- `after/audit.json` — fontes, cores, contraste, alturas, rolagem e linhas visíveis.
- `after.log` — saída da última captura.

## Limitações

- Teste em Chrome headless com fixture local, não no CEF/engine do operador.
- Os quadros de vídeo são SVGs de fixture; não avaliam cor de vídeo real.
- Em 125%/150% do Windows o miolo rola verticalmente (por desenho), sem sobrepor
  painéis; o rodapé e a topbar permanecem fixos.
- Nenhum comando foi enviado ao motor real; o teste de interação apenas confere
  que os comandos existentes continuam sendo disparados.

---

# Complemento · Configurações do Replay (30/10/2026)

A rota `/replay?view=settings` é servida por `replay-settings.html`; é essa a
página embutida pela central em Configurações → Replay. O diálogo homônimo do
console principal é outro componente e não foi alterado neste complemento.

## Arquivos

- `3mix-panel/painel/remoto/replay-settings.html` — CSS inline substituído por
  link; removidos estilos de layout inline; IDs, abas e handlers preservados.
- `3mix-panel/painel/remoto/replay-settings-grafite.css` — novo CSS exclusivo da
  página: grafite, Segoe UI, título 22, seções 16, labels 13, corpo 14, campos
  36, botões 36, abas 40, estados de REC/áudio, modo embutido.
- `replay-settings.js` não foi alterado.

## Testes

Fixture usado (somente leitura): `qa-finalizacao/configuracoes-embed-20261030/fixture-server.mjs`,
que já mapeia `/replay?view=settings` para `replay-settings.html`.

```powershell
$dir = "3mix-panel/qa-finalizacao/configuracoes-embed-20261030"
node "$dir/fixture-server.mjs" 8810
# noutro terminal, na pasta replay-visual-grafite-20261030:
node capture-settings.mjs after http://127.0.0.1:8810
node test-settings.mjs http://127.0.0.1:8810
node capture-settings-state.mjs http://127.0.0.1:8810
```

- Standalone 1440×900 e 1280×800; central 1440×900, 1280×800 e 1152×720 (125%).
- 3 abas alternadas (Sessão, Armazenamento, Áudio e Sincronia); 29 IDs conferidos.
- 0 erros de console/página; 0 elementos visíveis com verde/azul (varredura HSL).
- Campos 36 px; abas 40 px; botões 36 px; título 22 px; seções 16 px; labels 13 px.
- Estado REC ativo: banner e botão em vermelho operacional (#8f1218), câmeras,
  retenção e fonte de áudio bloqueadas. Áudio master silenciado: botão `vd-dim`.
- Estado de fixture com `sync:{}` foi normalizado para `sync:null` somente na
  captura, para não exibir “NaN ms”; nenhuma lógica da página foi alterada.

## Evidências

- `before-settings/` — página e central antes (abas verdes, selects azuis).
- `after-settings/standalone-1440x900.png`, `standalone-1280x800.png`.
- `after-settings/central-1440x900.png`, `central-1280x800.png`, `central-1152x720.png`.
- `after-settings/standalone-armazenamento.png`, `standalone-audio.png`.
- `after-settings/standalone-gravando.png`, `standalone-gravando-audio.png`.
- `after-settings/central-armazenamento.png`, `central-audio.png`.
- `after-settings/audit.json`, `test-settings.log`, `state-settings.log`.

## Limitações

- Teste em Chrome headless com fixture local, não no CEF do operador.
- Em 125% a área do iframe na central é curta; o conteúdo rola internamente e o
  rodapé da página permanece fixo. Não há sobreposição.
- A central ainda esconde, por desenho, o link “Operar Replay” e os botões
  Atualizar/Fechar dentro do iframe; isso é chrome da central, não da página.
- O estado de sincronismo “NaN” do fixture foi substituído por “sem desvio
  calibrado” apenas nas capturas; a página não foi alterada.

