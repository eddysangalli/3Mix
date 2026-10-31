# QA — Configurações centrais e janelas operacionais (2026-10-30)

Bancada **headless** para conferir as telas alteradas sem abrir o programa do operador e sem usar `3mix-runtime`
como bancada. O painel é servido direto de `3mix-panel/painel`; a API é um fixture local (`fixture-server.mjs`).

## Como rodar

```powershell
cd 3mix-panel\qa-finalizacao\configuracoes-janelas-20261030
node test-pages.mjs          # 73 verificações + retratos em .\retratos
node test-mesa-dialogo.mjs   # 14 verificações estáticas do diálogo Adicionar entrada
```

Requisitos: Node 22 e Microsoft Edge instalado. Nada é instalado, nenhum certificado é criado e nenhuma janela
nativa do 3Mix é aberta (`msedge --headless=new`, perfil dentro desta pasta, fechado ao final).

## Tamanhos iniciais aplicados

| Janela | Rota | Tamanho no código |
| --- | --- | --- |
| Gravação | `/gravar` | **760 × 560** no mapa `known` de `/api/panel-open` (`servidor-api.mjs`) |
| Saídas externas | `/externo` | **900 × 620** no mesmo mapa |
| Multigravação | `/multicorder` e `/iso` | **1040 × 680** no mesmo mapa |
| Playlist | `/playout` | **1200 × 760** no mesmo mapa |
| Adicionar entrada | popup da mesa | **900 × 620** em CSS, limitado à área disponível |

O tamanho do mapa é o **inicial**: o motor salva a geometria por URL em `[PanelWindows]` (`saveGeometry`/`restoreGeometry`)
e a restaura na próxima abertura. Uma geometria já salva tem precedência — é o que atende “lembrar tamanho e posição”.
`restoreGeometry` do Qt mantém a janela dentro da área de trabalho atual quando o monitor muda. O popup de adicionar
entrada é centralizado e limitado à viewport, sem geometria nativa.

## Regras do ambiente de QA (obrigatórias)

1. **Nenhuma janela FreeMix/3Mix de QA fica aberta.** Feche assim que terminar a verificação visual.
2. Antes de qualquer QA visual nativo, sincronize o `painel` da cópia com `3mix-panel/painel`:
   `preparar-qa-nativo.ps1 -Destino "D:\...\FreeMix-QA-..."` preserva `painel\local.js` e tudo fora de `painel`,
   recusa `3mix-runtime` e recusa a cópia aberta.
3. O título da janela de QA começa por `3Mix QA —` e a página mostra a faixa **AMBIENTE DE TESTE**.
   O fixture injeta a faixa e o prefixo na resposta; o script nativo injeta na cópia. Dê à produção/preset da
   cópia o nome `3Mix QA — ...` antes de abrir.
4. Prefira o teste headless/fixture. Só abra janela nativa quando o comportamento do CEF for indispensável.
5. Nunca copie arquivos isolados para `3mix-runtime`. A instalação do operador não é bancada.
6. Para garantir que não sobrou nada: `fechar-qa.ps1` (fecha apenas processos cujo caminho tem marcador de QA).

## O que é verificado

- **Configurações**: cinco grupos, ausência de “undefined”, Multiview nomeado, quadro × saída separados,
  presets com Personalizado, resumo atual → novo, busca por campo/valor, prévia recolhível, rodapé
  Cancelar/Aplicar/Aplicar e fechar, aplicação de display, workspace e preferência nativa com aviso de reinício.
- **Gravação**: janela cheia, pasta + Procurar, espaço livre, trilhas/divisão no avançado recolhido, tolerância
  a falhas e qualidade explicadas, aplicação confirmada.
- **Saídas externas**: nome padrão `3Mix NDI 1` e personalizado preservado, estado `Saída 1 · NDI · Parada`,
  iniciar/parar explícitos, transparência só quando suportada, câmera virtual/tela cheia fora do formulário de
  rede, salvar rascunho sem iniciar.
- **Multigravação**: elegíveis primeiro, filtro e seleção múltipla, áudio/formato/duração/pasta por entrada,
  Aplicar separado de Iniciar/Parar, falha individual isolada e re-tentativa “Sem esta”, fechar mantém a gravação.
  A rota antiga `/multicorder` (engrenagem da mesa) redireciona para `/iso`, a janela nova.
- **Playlist**: `PROGRAM` sem “NO AR” quando parado, Executar preparado × Executar próximo, um único controle
  “Ao terminar” por clipe, ganho em dB, IN/OUT em timecode, Rundown suspende o avanço automático.

## Limitações conhecidas

- O motor é um fixture: não há NDI/OMT, encoder, arquivo ou mídia reais. Os comandos e o contrato de resposta são
  os mesmos, mas a confirmação física depende do motor real.
- O diálogo **Adicionar entrada** da mesa depende do WebSocket do motor. Aqui ele é validado por contrato estático
  (`test-mesa-dialogo.mjs`), não por clique em navegador.
- NDI/OMT não têm “configurar sem iniciar” na API do motor. “Salvar rascunho” guarda a tela neste computador;
  só “Iniciar saída” aplica no motor.
- Na multigravação o motor grava todas as entradas ou recusa todas. A tela isola a entrada citada no erro e
  permite tentar de novo sem ela; não há gravação parcial por entrada.
- Em Gravação (perfil simples), trilhas e divisão aparecem como leitura com atalho para Saída avançada/Arquivos.
- O seletor de pasta usa o input de diretório do Chromium/CEF; se o caminho absoluto não vier, a tela pede para
  colar a pasta.
- Exportar “todas as categorias” monta um pacote `3Mix Settings Bundle` no cliente; documentos de uma categoria
  continuam no formato do motor. Credenciais nunca entram no arquivo.
