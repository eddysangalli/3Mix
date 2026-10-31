# Configurações · páginas embutidas (QA 30/10/2026)

## O que foi validado

Teste headless em Chromium com o servidor de fixture local. O fixture serve os arquivos reais de
`3mix-panel/painel/remoto` e simula apenas as leituras de API; nenhuma saída, gravação ou transmissão é iniciada.
A instalação do operador e o `3mix-runtime` não foram tocados.

- Replay, DSK, Multiview, Atalhos, Remoto, Automação, Recuperação, Diagnóstico e Sobre são renderizados por
  iframe same-origin na área de conteúdo da central.
- O iframe carrega a rota real (`/replay?view=settings&embed=1`, `/overlays?embed=1`, etc.); não existe cópia
  estática da página.
- O CSS de embed é injetado pelo `contentDocument` e esconde apenas a moldura/cabeçalho/rodapé de janela
  duplicados. Controles de conteúdo (abas do Replay, canais do DSK, layouts do Multiview, lista de macros,
  barra de ações de Atualizações) continuam funcionando.
- O botão discreto **Abrir em janela** permanece como fallback; o padrão é inline.
- Rotas antigas `?category=...` e as sub-abas Gravação/Transmissão/Interface/Desempenho foram preservadas.
- Tipografia/densidade da central: corpo 14 px, título 23 px, seção 17 px, labels 13,5 px, campos 38 px,
  botões 36 px/13 px, Segoe UI Variable/Segoe UI.
- Sem overflow horizontal em 1280×800, 1024×640 (125%) e 853×533 (150%); a rolagem fica dentro do iframe.

## Resultado

`relatorio.json`: 58 verificações, 12 capturas, 0 erros inesperados de console.
Capturas em `evidencias/`.

Há 1 erro pré-existente, fora do escopo desta frente: `overlays.js` usa `esc()` sem defini-lo. O mesmo erro
acontece ao abrir `/overlays` sozinho; o teste registra essa prova separadamente e não o atribui à central.

## Limitações

- O teste foi feito em Chromium headless com fixture, não no CEF da instalação real. A injeção same-origin usa
  `contentDocument`, suportado pelo CEF; a validação final no CEF fica pendente.
- Em 150% (853×533) o iframe do Replay fica com cerca de 201 px de altura e rola internamente. O layout não
  quebra, mas a área útil é curta; a alternativa seria esconder controles do rodapé central nessa faixa.
- As barras de ação das páginas embutidas foram mantidas (Salvar/Consultar/Executar etc.); apenas o botão
  Fechar e a moldura de janela foram ocultados. Esconder a barra inteira removeria ações reais.

## Como repetir

```powershell
node 3mix-panel/qa-finalizacao/configuracoes-embed-20261030/test-embed.mjs 8808
```
