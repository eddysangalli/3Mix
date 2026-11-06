# Cabeçalho original integrado — validação visual com build real (06/11/2026)

## O que foi pedido
Prioridade explícita do usuário: concluir o cabeçalho ORIGINAL completo do 3Mix na mesma
linha dos controles nativos minimizar/maximizar/fechar, com o ícone 3Mix correto. Não
duplicar rodapé, não redesenhar a Mesa. Validação nativa com geometria e imagem reais.

## Estado encontrado
O código já existia, implementado em sessão anterior de hoje (commits `afa49d9a1`,
`77136a703`, `00731fdf3`, `0b6f5ebf1`, `f3bb3cca4` em `3mix-engine`, branch
`feat/obs33-integration`), mas **nunca tinha sido visualmente confirmado rodando de
verdade** — o commit mais recente dizia explicitamente "homologação nativa pendente".
A implementação reutiliza o CEF dock `topbar.html` (`3mix.componentId = "3mix.menu"`),
reparenta-o para a área de caption da janela via `setMenuWidget()`, calcula a largura real
reservada pelos botões nativos do Windows via `WM_GETTITLEBARINFOEX` e `EnumChildWindows`,
injeta uma CSS custom property (`--native-caption-half`) no CEF para recentrar o conteúdo,
e usa `QWindow::startSystemMove()` para permitir arrastar a janela por áreas vazias do
cabeçalho. Tudo fica atrás da flag de ambiente `THREEMIX_QA_INTEGRATED_TITLEBAR=1`
(5 pontos de uso em `OBSBasic.cpp`, `OBSBasic_Preview.cpp`, `OBSBasic_StudioMode.cpp`).

## Bloqueios reais encontrados e corrigidos nesta sessão (não eram do código)
Três problemas de AMBIENTE DE BUILD impediam qualquer validação — nenhum deles era bug no
código-fonte do cabeçalho em si:

1. **Bug de escaping do Git Bash/MSYS**: `cmd.exe /c algumacoisa.bat` era silenciosamente
   convertido para `cmd.exe C:/ algumacoisa.bat` (a flag `/c` virava um caminho de drive
   Windows), fazendo todo `cmd.exe` invocado abrir um shell interativo vazio em vez de
   executar o `.bat` — nenhum build chegava a rodar, sem erro nem log. Correção:
   `MSYS_NO_PATHCONV=1 cmd.exe /c "<caminho windows absoluto>"`.
2. **`CMakeCache.txt` de `qa-finalizacao/native-vmix30-clean` preso em CEF 6533** (versão
   antiga, julho) enquanto o `CMakePresets.json` do fonte atual já pede CEF 7871 (desde
   commit upstream `a0aec482e`, "Update CEF from 127/6533 to 150/7871"). Causava
   `error C2065: 'CEF_PERMISSION_TYPE_LOOPBACK_NETWORK' não declarado` em `obs-browser`
   (API que só existe no CEF 7871). Corrigido via substituição global no cache + reconfig.
3. **Mesmo cache preso em Qt6/obs-deps de `2026-07-15`** enquanto o fonte pede
   `2026-10-23`. Não dava erro de compilação (headers compatíveis o bastante), mas gerava
   um `3Mix.exe`/`obs64.exe` ABI-incompatível com as DLLs Qt6 de julho que ficam em
   `bin/64bit/`: o processo morria instantaneamente com `STATUS_ENTRYPOINT_NOT_FOUND`
   (0xC0000139) — uma função exportada que o binário esperava não existia na DLL carregada.
   Corrigido com a mesma técnica (sed global no cache + reconfig + rebuild completo).

Build final: `MSBuild.exe frontend\obs-studio.vcxproj` direto (não existe `.sln` neste
diretório — só `.vcxproj` por target), `RelWithDebInfo`, exit code 0, 0 erros, 5min25s.

## Validação visual real
Executado `3Mix.exe` (cópia do `obs64.exe` recém-compilado; o nome "3Mix.exe" vem de uma
etapa de empacotamento externa ao CMake, não do build em si) em `qa-finalizacao/native-
vmix30-clean/rundir/RelWithDebInfo/`, com `THREEMIX_QA_INTEGRATED_TITLEBAR=1`,
`portable_mode.txt` e uma junction NTFS para o `painel/` mais atualizado (com o flat design
e splash desta sessão). Precisou popular manualmente `config/obs-studio/user.ini` com a
chave `ExtraBrowserDocks` (perfil novo não tinha os docks `topbar.html`/`mesa.html`
registrados — por isso a primeira tentativa lançava "3Mix desk layout unavailable").

Screenshot real via `PrintWindow` (`qa-replay/inspecao-pvw-pgm-20261108/header-capture-
01.png` e recortes `header-crop-top.png`, `header-crop-pvwpgm.png`, `header-crop-
footer.png`), processo PID 10320, título de janela confirmado "3Mix Studio - Sem nome":

- **Ícone 3Mix**: logo colorido "3Mix" visível no canto superior esquerdo. CONFIRMADO.
- **Cabeçalho na linha nativa**: botões do menu (Salvar projeto, Projetos, Áudio, Replay,
  Color, Fullscreen, Configurações, •••) na mesma linha horizontal dos controles nativos
  do Windows (minimizar/maximizar/fechar), sem barra Qt separada abaixo. CONFIRMADO.
- **Rodapé não duplicado**: uma única barra de ações (Adicionar entrada/Gravar/Externo/
  Transmitir/Pre-Flight/módulos/Menu/Stats/Atalhos) mais uma linha de telemetria/status
  abaixo dela — nenhuma segunda cópia. CONFIRMADO.
- **Fix PVW/PGM**: labels "PRÉ-VISUALIZAÇÃO (PV)" e "PROGRAMA (PGM)" renderizando limpos,
  sem o texto fantasma "PPGM" sobreposto que motivou o fix em `20a350d92`. CONFIRMADO
  (no estado padrão do Modo Estúdio; o bug original era mais evidente no indicador
  compacto após trocar de cena — não ensaiado neste lote por falta de fontes no perfil QA).

## Não confirmado / fora do escopo deste lote
- **Arrastar a janela clicando em área vazia do cabeçalho**: o patch
  `docs/qa/obs-browser-draggable-regions.patch` (que implementa
  `CefDragHandler::OnDraggableRegionsChanged` necessário para isso) **não está aplicado**
  no submódulo `obs-browser` real usado por `3mix-engine` (confirmado: HEAD do submódulo é
  `d4db73e`, igual ao documentado, sem o patch). A lógica C++ que consome a região
  (`ThreeMixCaptionHeader::mousePressEvent`) já existe e cai num fallback por posição
  (`event->position().y() < 8`), então um clique bem no topo da barra provavelmente já
  arrasta; áreas vazias mais abaixo na faixa do cabeçalho, não.
- Modo Estúdio com cenas/fontes reais carregadas, para reproduzir o cenário exato em que o
  ghost "PPGM" aparecia antes (troca de cena + hover).
- A flag `THREEMIX_QA_INTEGRATED_TITLEBAR` **continua desligada por padrão**; promovê-la
  a comportamento padrão da aplicação é uma decisão de produto que não foi tomada nesta
  sessão — aguardando confirmação do usuário.

## Evidências
- `qa-replay/inspecao-pvw-pgm-20261108/build-log-14-qtdeps-fixed.txt` (log completo do
  build final bem-sucedido).
- `qa-replay/inspecao-pvw-pgm-20261108/header-capture-01.png` (screenshot completo).
- `qa-replay/inspecao-pvw-pgm-20261108/header-crop-top.png`,
  `header-crop-pvwpgm.png`, `header-crop-footer.png` (recortes).
- `qa-replay/inspecao-pvw-pgm-20261108/run-qa-engine5-log.txt` e
  `.../config/obs-studio/logs/2026-11-06 17-04-53.txt` (log de execução do motor).

Nenhum processo/runtime do operador foi tocado; todo o ensaio rodou em
`qa-finalizacao/native-vmix30-clean` com config própria, isolada do perfil real.

## Nota sobre tentativas anteriores
Antes da captura final válida (PID 10320, descrita acima), houve pelo menos três
tentativas de execução que falharam de forma visível na tela do operador antes de eu
isolar a causa: uma com erro de sintaxe do `.bat` (saída imediata, janela de console
piscando), uma travando com `STATUS_ENTRYPOINT_NOT_FOUND` (crash silencioso, sem UI), e
uma lançando a exceção "3Mix desk layout unavailable" por falta de `ExtraBrowserDocks`
no perfil novo (interface abrindo sem PV/PGM nem coluna central, só o rodapé). Essa
última é a mais provável de ter sido vista pelo operador como "abriu algo bugado sem
PVE/GM, sem a coluna central" — character bate exatamente com o sintoma antes da correção
do `user.ini`. A captura válida documentada acima, feita DEPOIS dessa correção, mostra a
interface completa e normal.
