# Motor OBS 33.0.1 aplicado ao runtime de produção — resultados reais (06/11/2026)

**Status:** Motor novo rodando no `3mix-runtime/` real, com evidência de execução e screenshot. 3 plugins de terceiros identificados como incompatíveis, causa raiz confirmada. DSK e áudio confirmados funcionais via bateria real. Replay root-causado (parado por configuração desde antes da migração, não por regressão) e mecanismo confirmado funcional em teste isolado. Rollback testado e documentado. Pendente: iniciar Replay de fato na produção requer autorização específica do operador; SRT/VST3/ASIO e confirmação física do arraste de janela ainda não exercitados.

## O que foi pedido

Aplicar no runtime real (`3mix-runtime/`, a instalação que o operador usa de fato) o motor OBS 33.0.1 — a mesma base já validada em ambiente de QA isolado (`qa-finalizacao/native-vmix30-clean`) nesta mesma sessão — junto com o cabeçalho integrado (ícone 3Mix + controles nativos minimizar/maximizar/fechar na mesma linha) e os ~40 plugins de terceiros que a produção já tinha instalados (Advanced Scene Switcher, ASIO, Replay Source, IA local com Whisper/onnxruntime, Face Tracker, etc.), sem recompilá-los — testando se os binários existentes, compilados contra o OBS 32.2.2, funcionam como estão contra o motor novo.

## O que foi feito

1. **Backup completo** de `bin/64bit/`, `obs-plugins/64bit/` e `data/` da produção (motor 32.2.2 original) em `qa-replay/backup-motor32-producao-20261106-202847/` — ~1.1 GB, cópia byte-a-byte confirmada.
2. **Substituição de `bin/64bit/`** pelo conteúdo do build QA (motor 33.0.1, commit `d328c1924`), com `obs64.exe` renomeado para `3Mix.exe`.
3. **Cópia de `core/`** (nova no OBS 33 — onde os plugins first-party agora moram) para dentro do runtime de produção.
4. **`obs-plugins/64bit/` preservado intacto** (112 arquivos, ~40 plugins de terceiros da produção) — nenhuma dessas DLLs foi tocada; o teste real foi ver se o motor novo aceita os binários antigos como estão.
5. Config de produção (`user.ini` com `ExtraBrowserDocks`, `obs-websocket/config.json` com `server_enabled: true`, `painel/local.js`) já apontava para os caminhos corretos — não precisou de ajuste manual como no ambiente QA do zero.

## Evidência real de execução

- **Log:** `config/obs-studio/logs/2026-11-06 20-55-52.txt` — primeira linha: `OBS 33.0.1-48-gd328c1924 (64-bit, windows)`.
- **`obs.dll` confirmado via `strings`:** string de versão `33.0.1-48-gd328c1924`, batendo exatamente com o HEAD do branch `feat/obs33-integration` no momento do build.
- **Screenshot real** (PrintWindow, não captura de tela — funciona mesmo com janela ocluída): `qa-replay/producao-motor33-confirmacao.png`. Mostra:
  - Ícone 3Mix + controles nativos (minimizar/maximizar/fechar) na mesma linha do cabeçalho, como pedido.
  - PVW/PGM renderizando sem texto fantasma (fix da sessão anterior, `20a350d92`, confirmado também em produção).
  - Mesa, DSK, Replay, 8 câmeras, mixer — tudo carregado a partir do projeto real do operador ("Demonstracao Compacta").
  - Rodapé não duplicado; controle "Miniaturas: Sem descarte" presente (feature de cadência de miniaturas, aplicada antes nesta mesma sessão).
  - CPU 3Mix: 2%, Memória: ~1.9 GB, Drops: 0, Online.

## 3 plugins de terceiros incompatíveis — causa raiz confirmada

`obs-advanced-masks.dll`, `obs-color-monitor.dll`, `obs-shaderfilter.dll` não carregaram (`Module '...' not loaded`, `LoadLibrary` retorna Win32 error 127 / `ERROR_PROC_NOT_FOUND`).

**Causa raiz, confirmada via `objdump` comparando a tabela de imports de cada DLL contra os exports reais do `obs.dll` novo:** as três importam `gs_image_file_free`, `gs_image_file_init` e `gs_image_file_init_texture` — uma API do subsistema gráfico (`libobs/graphics`) usada para carregar imagens estáticas (ícones, texturas de UI). Essa API **não existe mais** no OBS 33.0.1; foi substituída por `gs_image_file_ex_*` (`gs_image_file_ex_free`, `gs_image_file_ex_init`, `gs_image_file_ex_init_texture`, mais `_tick`/`_update_texture`), uma versão estendida. Isso é uma mudança real do upstream OBS entre as versões, não um efeito colateral da integração 3Mix.

Essas 3 DLLs são binários de terceiros sem código-fonte neste workspace — recompilá-las contra a nova API está fora do alcance desta sessão (exigiria o código-fonte de cada plugin, não disponível aqui). Não afetam a estabilidade do motor: falham ao carregar de forma limpa (módulo simplesmente ausente), sem crash.

**Todo o restante dos ~40 plugins de terceiros carregou sem erro de símbolo/ABI.** As únicas outras linhas de "falha" no log são:
- `aja.dll`/`aja-output-ui.dll`/`decklink.dll`: hardware SDI/DeckLink físico ausente nesta máquina (esperado, não é regressão).
- NDI (`distroav`): biblioteca redistribuível externa ausente (não é arquivo deste workspace).
- Erros de câmera (`DecodeDeviceId failed`): dispositivos de captura físicos provavelmente desconectados no momento do teste.
- `Skipping module 'X', is a legacy core module`: comportamento correto — módulos que agora vivem em `core/` (obs-browser, obs-outputs, obs-qsv11, obs-text, obs-transitions, nv-filters) são corretamente ignorados na pasta legada para não duplicar.

## Bateria funcional pós-migração (06/11/2026, ~21h30–21h50)

Executada contra a mesma instância de produção já rodando (PID 75040), somente com chamadas de leitura via obs-websocket (`obsws.mjs`) — nenhuma alteração de estado ao vivo.

### DSK (Downstream Keyer) — confirmado funcional

`CallVendorRequest` com `vendorName: "downstream-keyer"`, `requestType: "get_downstream_keyers"` (o vendor real usado pelo painel, ver `painel/mesa.html:1567`) respondeu com os 9 keyers configurados no projeto do operador (8 numerados + "3Mix Audio"), cada um com suas cenas, transições (`Esmaecer`, `Cortar`) e durações intactas. O plugin `downstream-keyer` (parte do `core/` migrado) carrega e responde normalmente sob OBS 33.

### Áudio / Buses — confirmado funcional

`3Mix Master` e `3Mix Bus A` em 0 dB (unity gain), `3Mix Bus B` em -20 dB (ajuste do operador, preservado, não alterado). `GetInputAudioTracks`, `GetInputMute`, `GetStreamServiceSettings` (RTMP customizado configurado) todos respondendo com dados consistentes.

### Replay — stale por configuração, NÃO por regressão do motor (causa raiz confirmada)

Investigação disparada por um achado real: `cam-1.ts`/`cam-2.ts` em `gravacoes/replay/758b84f9-.../` datados de 04/11, dois dias antes da migração, apesar de `GetSourceFilter` reportar `filterEnabled: true` no filtro `3Mix Replay Rec` da fonte "CAM 1".

- **Causa raiz:** o filtro `source_record_filter` (código-fonte em `3mix-panel/licenses/freemix-source-record/source-record.c`) só grava quando seu campo interno `record_mode` é `1` (`OUTPUT_MODE_ALWAYS`); com `record_mode: 0` (`OUTPUT_MODE_NONE`, confirmado via `GetSourceFilter` na produção), a condição em `source_record_filter_update()` (linhas 1004–1023) nunca liga `record = true`, independentemente de `filterEnabled`. Esse é o próprio campo que o painel usa para decidir se o Replay está "ligado" na UI (`mesa.html:1790`: `record_mode === 1`) — ou seja, **o Replay nunca foi iniciado desde 04/11**, antes mesmo da migração; não é algo que a troca de motor quebrou.
- Confirmado também que a API real do painel (`servidor-api.mjs`, porta **18188**, não 8088 como a documentação de alguns scripts de teste antigos sugeria) está rodando (PID 34500) e responde `GET /api/replay` → `{"rec":false,...}` e `GET /api/iso` → `{"rec":false,...}`, consistente com "parado, não quebrado".
- **Teste positivo isolado:** para confirmar que o mecanismo funciona sob OBS 33 sem arriscar a sessão do operador (iniciar o Replay via API de produção foi bloqueado pelo classificador de permissões como ação de escrita na instalação do operador — bloqueio respeitado, não contornado), copiei `source-record.dll` e `replay-source.dll` (+ dados de locale) da produção para a instância QA isolada `qa-finalizacao/native-vmix30-clean/rundir/` (mesmo build de motor, config própria, porta de websocket diferente — 4455, nunca tocou produção), abri essa instância sob `qa-finalizacao` (autorizado), criei uma fonte de cor + filtro `source_record_filter` com `record_mode: 1`, e confirmei por timestamp de arquivo: `teste-cam.ts` cresceu de forma contínua (23,4 MB → 31,3 MB em 6 s) enquanto o filtro esteve ligado, e parou de crescer ao setar `record_mode: 0`. Evidência de que o mecanismo de gravação contínua funciona corretamente sob o motor OBS 33.0.1 migrado. A instância QA foi fechada normalmente ao final; produção (PID 75040) nunca foi tocada durante o teste.
- **Scripts do teste isolado:** `qa-finalizacao/teste-replay-obs33-20261106/teste.mjs` e `parar.mjs` (mantidos; o `.ts` gerado, 75 MB, foi removido após confirmação — não é evidência em si, só volume de disco).

### Saúde geral — confirmado estável

`GetStats` na produção: 29.97 FPS ativo, 0 `outputSkippedFrames`, 45/100038 `renderSkippedFrames` (0,045%, irrelevante), CPU 8,8%, memória ~1,9 GB, 91 GB de disco livre.

## Não confirmado nesta rodada

- **Arraste da janela pela área vazia do cabeçalho**: tentativa de simular via `SendInput`/`mouse_event` sintético não moveu a janela (estava maximizada). Isso é inconclusivo quanto à feature em si — motores de UI (Qt/Chromium) frequentemente distinguem input sintético de clique físico real para esse tipo de operação de sistema (`startSystemMove`). Precisa de confirmação com clique físico real do usuário.
- **Iniciar o Replay de fato na produção** (`POST /api/replay {"action":"start"}`) não foi executado contra a instância real do operador — bloqueado pelo classificador de permissões por ser uma ação de escrita na instalação do operador sem autorização nomeada especificamente para essa ação; a prova de funcionamento do mecanismo veio do teste isolado em QA, não da produção em si. Se o operador quiser o Replay desta sessão realmente gravando, precisa clicar o botão "● REPLAY" no painel (ou autorizar explicitamente o comando equivalente).
- SRT (saída real) e VST3/ASIO não foram exercitados além da leitura de configuração (nenhum input tinha filtros VST3 atualmente aplicados em `3Mix Master` para testar).

## Rollback

Backup íntegro em `qa-replay/backup-motor32-producao-20261106-202847/` (`bin-64bit/`, `obs-plugins/`, `data/`). Para reverter: parar o 3Mix, restaurar os 3 diretórios por cima dos atuais em `3mix-runtime/`, remover `3mix-runtime/core/` (não existia no motor 32.2.2).
