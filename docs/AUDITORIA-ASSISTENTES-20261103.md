# Auditoria Fase A — Assistentes do 3Mix (primeira execução, Novo Projeto, Pre-Flight, PGM Clean, ISO)

Data: 03/11/2026, 01:13 BRT (04:13 UTC). Pedido: Fase A do `SUPERPROMPT_3MIX_ASSISTENTES_UNIFICADO.md`, seções 1 e 11.
Tipo: somente leitura. Nenhum código editado, nenhum motor aberto, nenhuma escrita em `3mix-runtime/`, nenhuma requisição às portas 18188, 8099 ou 4455, nenhum commit.

## 0. Método, limites e condições do ambiente

- Li o código atual de `FreeMix/` (painel e API), de `freemix-app/` (motor) e os scripts de abertura e guarda em `scripts/`. Calculei SHA-256 de fonte, builds de QA, runtime e da entrega mais recente. Rodei só testes unitários e de protocolo que não usam motor nem rede, com `3mix-runtime/runtime/node.exe` v24.21.0. Relatórios anteriores (STATUS-BETA, PENDENCIAS-REAIS, LIMITES-CONHECIDOS) serviram só para localizar evidências. Uma classificação só se baseia neles quando aponto o arquivo de resultado que abri.
- Escritas feitas: este arquivo, além de dois scripts de leitura e um JSON de hashes no scratchpad temporário da sessão (`C:\Users\eddyr\AppData\Local\Temp\claude\...\scratchpad\comparar.mjs`, `tabela.mjs`, `comparacao.json`). Esse diretório pertence à ferramenta e fica fora do projeto. Dos testes que rodei, só `test-modulos-config.mjs` grava em disco: ele cria e apaga uma pasta temporária própria em `qa-beta/runtime-teste/`. Não rodei `test-blackbox.mjs`, `test-project-format.mjs` nem `test-api-endpoints.mjs`, porque gravam no projeto ou instanciam `Production`.
- **Trabalho concorrente durante a auditoria.** Há arquivos da fonte modificados até 03/11 04:01 UTC (`ferramentas/iniciar-freemix.mjs`). As pastas `qa-api/` e `qa-manuais/` apareceram durante a auditoria. Às 01:13 BRT havia **quatro** processos `FreeMix.exe`:
  - PID 41392: `3mix-runtime`, do operador, iniciado às 22:43.
  - PID 18852: `qa-beta/multi-me-build-verified`.
  - PID 17180: `qa-finalizacao/p1/migracao-fmx-rundir`.
  - PID 42264: `qa-manuais/rundir`.

  Os três últimos são de outras sessões. Não toquei em nenhum. Hashes e diferenças abaixo são um retrato deste momento.
- `qa-interface/AGENTES-EM-ANDAMENTO` existe (02/11 17:39). Enquanto ele existir, `INICIAR-3MIX.cmd` não aplica nada da fonte (ver §2.3).

Legenda das classes: **OPERACIONAL E TESTADA** (código e recibo real de motor localizados em disco ou teste reexecutado aqui) · **PARCIAL** · **SÓ UI/API** · **AUSENTE** · **NÃO VALIDADA** (existe, mas não há prova atual).

---

## 1. Matriz de capacidades (seção 1 do superprompt)

### 1.1 Instalação, atualização, versionamento, primeiro uso, preferências, detecção de capacidades

| Capacidade | Classe | Evidência (arquivo:linha / teste) |
|---|---|---|
| Instalador Windows (wizard de 6 passos e módulos) | PARCIAL | `FreeMix/scripts/installer-windows/Setup.cs` (02/11 22:40) tem `--disable-module` e `WriteModulesFile` (linhas 24-65). O Setup existe: `entregas/3Mix-Setup-20261103011403.exe`, sha `41d53a89…`, com `"authenticodeSigned": false` (`.build.json`). Não foi testado em Windows limpo. **O payload contém `FreeMix.exe` 49688093…, não o 4413bbbb… instalado no runtime** (§2.1) |
| Aplicação formal de pacote assinado (local) | PARCIAL | `ferramentas/atualizar-freemix.mjs`: `inspect` faz Ed25519 e confere hash por arquivo (l.19-21); `apply` usa diário e backup em `updates/<uuid>` (l.31-44); `rollback` e `recoverInterrupted` (l.23-30). A última aplicação formal registrada é de **11/10/2026** (`entregas/APLICACAO-ULTIMA.json`, caminho antigo `vmixtwste`). Não há `entregas/ULTIMA-ATUALIZACAO.json` pendente |
| Canal de atualização online | NÃO VALIDADA (só na fonte) | `ferramentas/atualizacao-online.mjs` (fonte, 03/11 02:17Z): feed no GitHub Pages, manifesto assinado, arquivos nas Releases, download incremental e retomável. **O runtime tem a versão anterior (−95/+7 linhas), sem `CHANNEL_BASE` nem `startAutoCheck`.** Os feeds publicados (`canal-atualizacoes/beta/feed.json` = `0.1.0-alpha` sem `manifestUrl`; `stable` = `0.0.0`) não oferecem atualização. O e2e `qa-finalizacao/atualizacao/testar-atualizacao.mjs` está incompleto: `resultado.txt` = "instalando a versão de partida…" (03/11 01:07) |
| Versionamento | PARCIAL (incoerente) | `FreeMix/version.json` = `0.1.0-local.20261011024129`. `3mix-runtime/version.json` = `0.1.0-alpha` (createdAt 11/10), mas roda o binário qualificado em 03/11 01:42Z. A entrega mais nova é `0.1.0-local.20261103011403`. Pelo rótulo não dá para saber o que está instalado |
| Primeiro uso / boas-vindas | AUSENTE (há peças soltas) | Nenhuma tela de primeira execução em `painel/` ou `ferramentas/`; a busca por firstRun, boas-vindas e primeiro uso só encontra comentários e manual. Peças que existem: `checklist-primeira-transmissao.html/.js` (12 itens AUTO/MANUAL, `localStorage`); `estudio-dock.html` diferencia porta ocupada de inacessível (`qa-beta/test-estudio-dock-diagnostico.mjs`); disco em `/api/health` (`servidor-api.mjs:193-201`); `OBS FirstRun=true` em `empacotar-limpo.mjs:77-78` e `seed-config.mjs:9` (primeira execução do OBS, não do 3Mix) |
| Escolha de módulos (standby) | OPERACIONAL E TESTADA | `ferramentas/modulos-config.mjs`, `/api/modulos`, `painel/remoto/modulos.html`. **`test-modulos-config.mjs` reexecutado: 4/4 PASS.** Recibo com motor real: `qa-beta/recibos/qa-regressao-modulos-motor-real.md` |
| Preferências | NÃO VALIDADA nesta auditoria | `ferramentas/preferencias-producao.mjs` lê e grava pela vendor `freemix-preferences` (10 categorias, export/import sem credenciais). Exige motor; não reexecutado |
| Detecção de capacidades (hardware/encoders/disco) | PARCIAL | Detalhado em §3a |

### 1.2 Pre-Flight

| Capacidade | Classe | Evidência |
|---|---|---|
| `preflight-producao.mjs` e `/api/preflight` | PARCIAL, com defeitos | **`test-preflight.mjs` reexecutado: FALHA (exit 1)**. Em `preflight-producao.mjs:169` o campo `disk` recebe a função `diskReport`, não o relatório. Três verificações nunca disparam no estado real; detalhes e lacunas em §3d. O arquivo é idêntico em fonte, runtime e entrega (sha `0daaa9a6…`) |

### 1.3 Projetos, coleções, cenas, modelos, presets, serialização

| Capacidade | Classe | Evidência |
|---|---|---|
| Projeto = coleção de cenas e perfil do OBS (salvar/abrir) | OPERACIONAL (base OBS, não reexecutado) | Coleções nativas (`Demonstracao.json`, `Demonstracao_Compacta.json`). O escopo da API é `this.scope` (`controle-producao.mjs:354`) |
| Recuperação e exportação `.fmx` | PARCIAL | `ferramentas/recuperacao-*.mjs`, `sessao-producao.mjs`. Segundo LIMITES-CONHECIDOS §3, a ida e volta entre instalações não está provada. Há outra frente em andamento: `qa-finalizacao/p1/migracao-fmx-rundir` com motor aberto agora |
| Presets (composição, saídas, GC, settings) | PARCIAL | `composicao-presets.mjs`, `outputs_profile_save/load` (`saidas-producao.mjs:47`), `gc-biblioteca-producao.mjs`, `settings_export/import` (`preferencias-producao.mjs`) |
| Modelos de produção (Podcast, Futebol, Jornalismo…) | AUSENTE | A busca por `podcast`, `futsal` e `futebol` em `ferramentas/` e `painel/` só encontra modelos de GC (`gc/biblioteca/podcast_host_*`) e textos do mixer. Não há modelo de projeto |
| Assistente Novo Projeto (`painel/remoto/novo-projeto/`) | SÓ UI/API (aplicação desligada) | Detalhado em §3e: `creation-policy.json` deixa `coverageQualified:false` e `nativeQueriesQualified:false`, e `applyProject` rejeita com `APPLICATION_DISABLED` |
| Projeto demo gerado pelo motor | PARCIAL (só QA) | `qa-beta/build-demo-futsal.mjs` usa obs-websocket numa instância isolada. Artefatos: `qa-beta/recibos/demo-futsal-artefatos/Futsal.json` e `profile-futsal/basic.ini` (recibo `demo-futsal.md`). Não está empacotado. Usa `downloads/multicamteste/01-04.mp4` (~385 MB cada), **sem licença nem procedência documentadas** |

### 1.4 Motor de vídeo, encoders, saídas, captura

| Capacidade | Classe | Evidência |
|---|---|---|
| Render, transição, PGM, gravação e transmissão base | OPERACIONAL E TESTADA | Base libobs. RTMP real do M/E 2 recebido (`qa-interface/main-para-runtime-20261102/resultado-me-saida.txt`: "Arquivo recebido · 3306693 bytes", "tudo passou") |
| Inventário de encoders | PARCIAL | `capacidades-motor.mjs` mapeia os encoders **registrados** que a vendor `get_destinations` retorna (`configuracoes-producao.mjs:29-32`). Registrado não prova que o encoder funcione nesta GPU e driver |
| Saídas independentes (Destinations: program/preview/clean/mix/source, SRT, RIST, RTMP(S), HLS, NDI, OMT, SDI) | PARCIAL | `freemix-app/frontend/widgets/FreeMixMultistream.cpp:470-1110`, `saidas-producao.mjs`. Há prova real do RTMP de M/E. Nenhum recibo localizado do modo `clean` gravado. SDI/NDI/OMT físicos dependem de hardware (LIMITES §2) |
| Captura física (USB/SDI/NDI/SRT de entrada) | NÃO VALIDADA | Sem hardware. `device-discovery.mjs` está desligado pela política (§3e) |

### 1.5 Multi-M/E, nesting, Signal Registry, Patch, Central de Saídas, Audio Bus por M/E

| Capacidade | Classe | Evidência |
|---|---|---|
| M/E 2-4: PV, PGM, CUT, AUTO e saída | OPERACIONAL E TESTADA | `mix-effects-producao.mjs`. Motor real: `resultado-me-real.txt` (241 quadros, 0 errados, "tudo passou") e `resultado-me-saida.txt`. **Reexecutados aqui: `test-mix-effects-protocol` 10/10, `test-mix-effects-shared-instance` 2/2** |
| Nesting (proxy público do M/E) | PARCIAL | `FreeMixMixEffectManager.hpp`. A string `proxyUuid` existe nos 5 binários auditados, inclusive no runtime (§2.1). Isso **supera o achado A2 de 01/11** ("0 no runtime"). O teste de restart foi só em motor isolado (`qa-beta/recibos/nesting-proxy-restart-fix.md`) |
| Signal Registry e Patch | OPERACIONAL E TESTADA | `registro-sinais-producao.mjs`, `patch-registry-producao.mjs`. Patch real em 02/11 (STATUS-BETA 2149: o input `TITLE 15` passou a ter `CAM 10` como fonte). **`test-patch-registry-protocol` 6/6 reexecutado** |
| Central de Saídas | PARCIAL | `painel/remoto/central-saidas.js` é só uma matriz por cima de iframes de `saidas`, `aux` e `externo` (comentário nas linhas 1-3). AUX não troca a fonte de uma saída no ar (LIMITES §4). **`qa-beta/test-aux-output-router.mjs` reexecutado: 11 PASS / 3 FAIL.** Era 14/14 em 01/11; a fonte `aux-output-router.mjs` mudou em 02/11 21:03Z e difere do runtime |
| Audio Bus por M/E | PARCIAL | `mix-audio-producao.mjs`. **`test-mix-audio-protocol` 7/7 e `test-mix-audio-inheritance` 6/6 reexecutados.** Não localizei prova de áudio real por M/E gravado |

### 1.6 DSK, GC, overlays, composição, PGM, Clean Feed, separação de camadas

| Capacidade | Classe | Evidência |
|---|---|---|
| DSK e overlays 1-8 | OPERACIONAL | Plugin `downstream-keyer` (canais a partir de 7, `downstream-keyer-dock.cpp:446-459`). Overlays numéricos lidos em `controle-producao.mjs:345`. **`test-overlays-dve` 1/1 e `test-overlays-link` 1/1 reexecutados** |
| GC (tarja e placar) | OPERACIONAL (não reexecutado) | GC vai ao ar como cena de overlay DSK: `gc.activeLowerThird = overlays.some(o=>o.scene==='3Mix Tarja')` (`controle-producao.mjs:352`) |
| Clean Feed / PGM Clean | PARCIAL | Mecanismo nativo existe (máscara de overlays e modo `clean`), mas **não reproduz transições** e não há prova gravada. Detalhes em §3b |
| Separação de camadas | PARCIAL | Separa só o que está em canal DSK, 7 a 14. Gráficos colocados como item dentro da cena de um input não são separáveis |
| Clean Feed nos retornos (`return-feed-producao.mjs`) | SÓ UI/API (simula sucesso) | `startFeed` marca `connectedClients = 1; // simula prontidão do listener` e devolve a mensagem "Retorno … ativo em srt://…" sem criar saída nenhuma. `test-return-feed.mjs` passa, mas só testa o objeto |
| Projetor "Clean Feed" | PARCIAL | `patch-saidas.mjs:55` diz "Não acompanha os cortes seguintes" |

### 1.7 Gravação PGM, ISO, multigravação, multitrack, replay

| Capacidade | Classe | Evidência |
|---|---|---|
| Gravação PGM | OPERACIONAL (não reexecutado) | Saída nativa de gravação. `gravar.js:155` faz `settings_apply` de recording. Gravações reais são citadas na medição de atraso por entrada (LIMITES, frente 1) |
| Gravação ISO | PARCIAL, com risco de estabilidade | Detalhado em §3c. Depende de `source-record.dll`, presente na pilha de 10 dos 11 crashes do runtime (conferido agora) |
| Multigravação por destino (`outputs_record`) | PARCIAL | `saidas-producao.mjs:81-86` grava só MKV, com nome e pasta fixos (`gravacoes/saidas/saida-N-<ts>.mkv`). No motor, `FreeMixMultistream.cpp:1214-1221` exige vídeo independente e caminho absoluto `.mkv` novo |
| Multitrack (PGM) | NÃO VALIDADA | Recurso nativo do OBS (`outputAdvanced.recordTracks`). `gravar.js:39-58` só **mostra** as trilhas, a configuração fica nas preferências nativas. Os barramentos M, A e B vão para as trilhas 4, 5 e 6 (`controle-producao.mjs:342`). Não há prova de arquivo multitrack |
| Replay | PARCIAL | `replay-disco.mjs`. REC real em 2 câmeras em 02/11 (`main-para-runtime-20261102/resultado-replay.txt`, "tudo passou"). O caso Native39 de seek continua aberto (LIMITES §3) |

### 1.8 3Mix Call, retornos, mix-minus, processamento de áudio

| Capacidade | Classe | Evidência |
|---|---|---|
| 3Mix Call (convidados) | PARCIAL | `calls-producao.mjs` e `call-video-native.mjs`. Não há prova em WAN real. O vídeo por fonte é JPEG até 640x360 a 5 fps, e o A/V tem drift de 9,78 ms/s marcado FAIL (`PENDENCIAS-REAIS.md:920`; LIMITES §2-3) |
| Mix-minus N-1 por convidado | PARCIAL | `retornos-calls.mjs:1-25`: `mixReturn` exclui a própria voz (`p.uuid!==own`) e o diretor fica restrito a lease e talkback. É real em PCM. Não há prova com convidado real |
| Retornos SRT de externa (ReturnFeedManager) | SÓ UI/API | Ver 1.6: o start é simulado |
| Processamento de áudio (VST3, master_me, PodcastPlugins, filtros) | PARCIAL | VST3 testado em 53 plugins, 51 carregam. A latência não é compensada (LIMITES "Limites do VST3"). AGC: não há AGC próprio; o master_me tem nivelador (não verificado). `test-audio-ducking` reexecutado: PASS. **`test-clip-gain` FALHA** porque o teste procura `FreeMix Clip Gain` e o código usa `3Mix Clip Gain` (`media-playout-engine.mjs:359`); teste desatualizado pelo rename. **`test-audio-filtering` FALHA** por ENOENT em `ferramentas\3mix-panel\painel\remoto\audio.html`, caminho relativo quebrado no teste |

### 1.9 Segurança do runtime, integridade, backups, rollback, canal de atualização

| Capacidade | Classe | Evidência |
|---|---|---|
| Guarda de integridade da abertura | OPERACIONAL E TESTADA | `aplicar-layout-grafite.mjs --check` **executado agora**: `success:true, checkOnly:true`, 5 arquivos pendentes (mesa.html, topbar.html, settings.js, settings-help.js, servidor-api.mjs), `nativeLayoutVersion:2`. Mecânica em §2.3 |
| Backups | OPERACIONAL | `qa-interface/mockup-integracao-20261030/aplicacoes/<ts>/` (recibo por aplicação), `qa-beta/backups/`, `qa-interface/*/instalar.mjs` com backups e `--desfazer` |
| Rollback | PARCIAL | `atualizar-freemix.mjs` faz rollback por diário. `aplicar-layout-grafite.mjs:71-75` só restaura se a cópia falhar. STATUS-BETA 2158 registra que `instalar.mjs --desfazer` "trava a abertura" com a fonte atual |
| Canal de atualização | NÃO VALIDADA | Ver 1.1. A chave privada Ed25519 está em `release-keys/ed25519-private.pem` (raiz do workspace, 07/10). `FreeMix/.gitignore` exclui `/release-keys/` e `**/*private*.pem`, mas a guarda da chave ainda é decisão do dono |

---

## 2. Fonte × QA × instalação

### 2.1 Binários (SHA-256, 12 primeiros dígitos; datas em UTC)

| Arquivo | native-build qualificado¹ | qa-beta/multi-me-build-verified | qa-dump/rundir | **3mix-runtime** | entrega 20261103011403 |
|---|---|---|---|---|---|
| bin/64bit/FreeMix.exe | 4413bbbb8093 (03/11 01:42) | 4413bbbb8093 | **5f7b42eea558 (03/11 02:22)** | **4413bbbb8093** | **49688093e26d** (anterior) |
| bin/64bit/obs.dll | 5d980241b81e | **02e1e018f327 (02/11 23:05)** | **3235d4e10274 (03/11 02:18)** | 5d980241b81e | 5d980241b81e |
| bin/64bit/obs-frontend-api.dll | 71221eb4dd03 | 71221eb4dd03 | 71221eb4dd03 | 71221eb4dd03 | 71221eb4dd03 |
| downstream-keyer.dll | 1d7276a4c2fe | igual | igual | igual | igual |
| source-record.dll | — | — | — | 63e4f4c4fe77 (23/10) | 63e4f4c4fe77 |
| obs-websocket / obs-ffmpeg / obs-nvenc / obs-x264 / obs-qsv11 | builds de 30/10 | builds de 02/11 23:05 | = multi-me | **builds de 23/10, diferentes de todos os outros** | = runtime |

¹ `qa-interface/mockup-integracao-20261030/native-build/rundir/RelWithDebInfo`, conforme `native-release.json` (`qaPassed:true`, `qualifiedAt 2026-11-03T01:42:32Z`, origem `freemix-app main 0e8f37d`). Outros binários em uso agora: `qa-finalizacao/p1/migracao-fmx-rundir` = 4413bbbb (igual ao runtime); `qa-manuais/rundir` = 5f7b42ee (igual ao qa-dump).

Sondagem de strings no `FreeMix.exe` dos 5 locais (`overlaysMask`, `proxyUuid`, `project_device_inventory`, `project_creation_policy`, `source_record_bus_capture`, `get_destinations`): **presentes em todos**.

Conclusões:
1. O runtime roda o `FreeMix.exe` qualificado. O `obs.dll` dele é o de 20:39, mais antigo que o do build multi-me (23:05). O build qa-dump/qa-manuais (5f7b…) é outra linha de trabalho, ainda não qualificada nem instalada.
2. **O instalador e o ZIP mais novos (`20261103011403`) não reproduzem o runtime**: o executável é o `previousSha256` do `native-release.json`.
3. Os plugins `obs-*` do runtime são de 23/10. Uma mudança feita nesses plugins na fonte não está instalada.
4. O ISO roda com o mesmo `source-record.dll` (63e4f4c4) do QA de ISO de 09/10 (`qa-finalizacao/multicorder-replay-container/resultado.json`, `sourceRecordSha256`).

### 2.2 JS e painel relevantes para os assistentes (fonte `FreeMix/` × `3mix-runtime/` × entrega)

Iguais nos três: `preflight-producao.mjs`, `disco-producao.mjs`, `replay-disco.mjs`, `diagnostico-producao.mjs`, `capacidades-motor.mjs`, `return-feed-producao.mjs`, `saidas-producao.mjs`, `calls-producao.mjs`, `retornos-calls.mjs`, `audio-routing-producao.mjs`, `mix-effects-producao.mjs`, `patch-registry-producao.mjs`, `preparar-portatil.mjs`, `projetos/project-provisioner.mjs`, `projetos/creation-policy.json`, `projetos/core-host-binding.mjs`, `preflight.html/.js`, `novo-projeto/*`, `saidas.html/.js`, `central-saidas.js`, `iso.html`, `iso-avancado.js`, `modulos.html`.

Iguais exceto fim de linha: `registro-sinais-producao.mjs`, `update-public.pem` (mesma chave pública `MCowBQYDK2VwAyEAbN/…`).

Fonte à frente do runtime (diff sem considerar CR, linhas +/−): `controle-producao.mjs` 6/2 · `servidor-api.mjs` 10/4 · `configuracoes-producao.mjs` 3/3 · `aux-output-router.mjs` 6/8 · **`atualizacao-online.mjs` 95/7** · `atualizar-freemix.mjs` 6/1 · `iniciar-freemix.mjs` 2/1 · `checklist-primeira-transmissao.js` 28/0 (botão "Verificar conexão") · `mesa.html` 4/4. A entrega `20261103011403` tem esses arquivos iguais ao **runtime**, não à fonte.

### 2.3 Proteção de integridade existente e fluxo formal

1. `INICIAR-3MIX.cmd` chama `scripts/inicializacao/abrir-3mix-atualizado.mjs`.
   - **Pacote assinado.** Se existir `entregas/ULTIMA-ATUALIZACAO.json` com versão diferente da instalada, o script segue esta ordem: `assertClosed`, depois `inspect` (Ed25519 + hash de cada arquivo, com o `atualizar-freemix.mjs` **do runtime**), depois `stopOwnedAPI`, que só encerra a API cujo `installationId` e caminho do `node.exe` batem. Em seguida vem `apply`, com diário e backup, e o recibo vai para `entregas/APLICACAO-ULTIMA.json`. Hoje não há marcador pendente.
   - **Pausa por agentes.** Se `qa-interface/AGENTES-EM-ANDAMENTO` existir, nada da fonte é aplicado. Hoje existe.
   - **Controladores.** Compara 7 "controllerFiles" de `3mix-panel` (link para `FreeMix`) com o runtime. Se algum diferir, exige o motor fechado e reinicia a API.
   - **Layout e nativos.** Roda `scripts/interface/aplicar-layout-grafite.mjs`, descrito no item 2.
2. `aplicar-layout-grafite.mjs` faz o seguinte:
   - Recusa a instalação se `user.ini` não tiver o tema fechado `local.mesadecorte.Yami` (l.38-39).
   - Copia só os 43 caminhos de `scripts/interface/layout-files.mjs` e os 4 nativos de `native-release.json`. Os nativos precisam de `qaPassed:true`, de origem em `native-build/` e de SHA igual ao registrado (l.20-25, 52).
   - **Recusa sobrescrever qualquer arquivo instalado cujo hash não esteja em `installed-state.json`, nos recibos anteriores ou na baseline** ("Arquivo alterado desde a inspeção… Preservado", l.56). É essa proteção que recusou alterações manuais não rastreadas.
   - Faz backup em `aplicacoes/<ts>/`, confere o hash depois de copiar, reverte se a cópia falhar e regrava `installed-state.json`.
3. **Inconsistência encontrada.** `abrir-3mix-atualizado.mjs` considera `controle-producao.mjs`, `rundown-producao.mjs` e `audio-routing-producao.mjs` como controladores, mas esses três **não estão** em `layout-files.mjs`. Hoje `controle-producao.mjs` difere (+6/−2). Quando `AGENTES-EM-ANDAMENTO` for removido e alguém abrir pelo `INICIAR-3MIX.cmd` com o motor aberto, `assertClosed` vai recusar ("Há atualização pronta…"). Com o motor fechado, a API é reiniciada, mas o arquivo nunca é copiado. Esses arquivos hoje só chegam ao runtime pelos `instalar.mjs` específicos de cada frente (por exemplo `qa-interface/main-para-runtime-20261102/instalar.mjs`).
4. **Fluxo formal recomendado para os assistentes.** Fonte, depois build e QA isolado, depois `native-release.json` (para nativos), depois a lista em `layout-files.mjs` ou um pacote assinado (`scripts/distribuicao/selar-pacote.mjs` → `entregas/` → marcador `ULTIMA-ATUALIZACAO.json`). Por último, abrir pelo `INICIAR-3MIX.cmd` com o operador fechado. Nunca copiar direto para `3mix-runtime/`.

---

## 3. Itens específicos para o que será construído

### 3a. Detecção de hardware, encoders, disco e benchmark

| Item | Existe? | Onde |
|---|---|---|
| SO, CPU (modelo), núcleos lógicos, RAM total e livre, uptime | Sim, mas só dentro do ZIP de diagnóstico | `diagnostico-producao.mjs:89-93` (`sistemaDetalhado`) |
| GPU: nome, versão e data do driver | Sim, pelo registro (sem WMI, por desempenho); mesma limitação | `diagnostico-producao.mjs:81-88` |
| VRAM, monitores, temperatura, uso de GPU e engines | **Ausente**. "GPU%" não existe na API do obs-websocket (`qa-beta/recibos/performance-1-2-4-mes.md`) | — |
| Encoders | Lista de **registrados** (vendor `get_destinations`) com aliases NVENC, QSV, AMF e x264 | `capacidades-motor.mjs:2-19`, `configuracoes-producao.mjs:29-32` |
| Teste real de encoder | **Ausente** | — |
| Espaço em disco | Sim, mas só o volume da **pasta da instalação**, nem o diretório de gravação nem as pastas de ISO/replay | `disco-producao.mjs` (limiares fixos de 5 e 20 GB a 15 Mbps). `/api/health` em `servidor-api.mjs:200` |
| Velocidade de disco (escrita/leitura) | **Ausente** | — |
| Estatísticas do motor (CPU do processo, memória, FPS, render, frames pulados) | Sim, por `GetStats` | Topbar e settings (`corrige-botoes.snippet.js:11-14`) |
| Inventário de dispositivos de captura | Código existe, **desligado** | `projetos/device-discovery.mjs` + vendor nativa `project_device_inventory` (`FreeMixMultistream.cpp`). Política `creation-policy.json` = não qualificada |
| Presença de plugins (DLL) | Sim | `recuperacao-instalabilidade.mjs` ("Presence is not ABI/driver/hardware proof") |
| Benchmark e estresse | **Ausente no produto**. Só scripts de QA | `qa-beta/medir-performance-1-2-4-mes.mjs`; recibos `performance-1-2-4-mes.md`, `fase2-desempenho.md` |
| Pacote de mídia de diagnóstico | **Ausente**. A mídia de teste local `downloads/multicamteste/` não tem licença documentada | — |
| Perfil de capacidade por máquina | **Ausente** | — |
| Processos concorrentes | **Ausente** no produto. `tasklist` só aparece nos lançadores e atualizadores, para garantir o motor fechado | `abrir-3mix-atualizado.mjs:15-19`, `atualizar-freemix.mjs:13-18` |
| Rede (upload, jitter, perda) | Só para saídas e bonding (`bonding-medicoes.mjs`, watchdog de saídas). Não existe teste de upload no diagnóstico | — |

### 3b. PGM Clean / Clean Feed: o que o motor separa e onde fazer

**Já existe no motor** (`freemix-app/frontend/widgets/FreeMixMultistream.cpp`):
- `struct Destination` (l.470-493) tem os modos `shared`, `program`, `source`, `preview`, `clean` e `mix`, `overlaysMask` de 8 bits, `overlayChannels {7..14}` e `recordPath`.
- No modo independente, cada destino cria `obs_view`, encoders e áudio próprios (l.981-1066).
- Os overlays 1-8 são os canais DSK 7-14 (comentário na l.1059). Cada bit de `overlaysMask` inclui o overlay correspondente na view (l.1060-1064, revalidado no tick das l.1769-1773). Com isso o motor **já sabe excluir seletivamente os overlays e DSK numéricos**: logo, tarja e placar, quando estão num overlay.
- `saidas-producao.mjs:78` força `overlaysMask=0` no modo `clean`. No modo `program` a máscara é escolhida por checkbox (`saidas.html:433-440`, `data-overlay`).
- Gravação do destino: `control_destination` com `action:"record"` usa `ffmpeg_muxer` em `.mkv` (l.960, 1214-1221). A API é `outputs_record` (`saidas-producao.mjs:81-86`).
- O áudio do destino é `obs_get_audio()` na trilha `audioTrack` (l.1058), ou seja, o mesmo áudio de programa.

**O que falta para o critério da seção 5:**
1. **As transições não são reproduzidas.** Nos modos `program` e `clean` a fonte é `obs_frontend_get_current_scene()` (l.982, 1096), trocada em `OBS_FRONTEND_EVENT_SCENE_CHANGED` (l.1812-1813). O PGM Clean faz corte seco onde o PGM Full faz fade, stinger ou merge. Cortes, VTs e playlist coincidem, porque são as mesmas fontes, sem segunda decodificação. A transição não coincide.
2. **Ponto do pipeline para separar.** No libobs, o PGM final é o canal 0 (a transição de programa) mais os canais 1-6 (áudio global) e 7+ (DSK). A forma mais barata e fiel é a view do destino usar a **fonte de transição do programa** (`obs_get_output_source(0)` ou `obs_frontend_get_current_transition()`) no lugar da cena atual, e manter a máscara DSK como está. O estado de comutação fica compartilhado, sem segundo M/E e sem decodificar de novo. Já existe precedente no modo `mix`, que usa a fonte `transition` do M/E (l.982). Cuidado: um stinger com áudio próprio e a remoção do item de cena a cada troca (l.1103-1104) precisam ser revistos.
3. Gráficos que estão como **item dentro da cena do input** (fora de DSK) continuam no Clean. A exclusão por grupo (logo, GC, relógio, placar) só funciona se cada grupo estiver em overlay próprio. O aplicador de projeto deve garantir isso.
4. A gravação do destino só aceita MKV, com nome e pasta fixos, sem codec ou formato próprio na API JS. A UI de gravação Clean (nome, pasta, formato, início e parada por gravação) não existe.
5. Não localizei nenhuma gravação real de `clean` ou `program` com máscara. A única menção é a suíte sintética "222/222 PASS em 228 ms" (`PENDENCIAS-REAIS.md:430-444`), que não prova nada.
6. `aux-output-router.mjs:317` já mapeia `sourceType:'clean'` para `mode:'clean'`. O `ReturnFeedManager` não é saída real (1.6) e deve ser ligado aos Destinations, ou então removido da UI.

### 3c. Gravação ISO: ferramentas, motor e estado real

- Implementação: `servidor-api.mjs:80` instancia `new DiskReplay({filter:'Gravação ISO', namespace:'freemix-iso', recordingFolder:'iso'})`. `replay-disco.mjs:381` cria um `source_record_filter` (plugin `source-record`) em cada input.
- Opções de gravação (`replay-disco.mjs:13-22`, `isoRecordingOptions`): formato mpegts, mkv ou mp4_safe; encoder; CRF ou bitrate; áudio input, master, bus-a, bus-b, all-tracks ou fonte pública; ajustes por câmera.
- Captura de barramento: a capacidade `source_record_bus_capture` vem do motor (l.113).
- UI em `iso.html` e `iso-avancado.js`. API: `/api/iso` com status, start, stop e configure (`servidor-api.mjs:518`). Gate de módulo em `servidor-api.mjs:553`.
- Estado real:
  - A gravação ISO é independente do corte, porque é um filtro por fonte. Esse é o modelo certo.
  - **Risco de estabilidade.** Os 11 relatórios de crash do runtime (09/10 a 01/11) foram conferidos agora: **10 têm `source-record` na pilha da thread que caiu**, com falha em obs.dll, obs-nvenc.dll, ucrtbase ou w32-pthreads. A DLL é de terceiros, pré-compilada (63e4f4c4, 23/10), e não há fonte dela no build.
  - Provas: ISO em 09/10 com binário antigo (`qa-finalizacao/multicorder-replay-container/resultado.json`, `PASS`, FreeMix.exe `6e6f8bff…`). REC de replay em 2 câmeras em 02/11 (`resultado-replay.txt`, mesmo mecanismo em outro namespace). **Não há prova atual** de três ISOs simultâneas, reproduzíveis, sincronizadas e com áudio por trilha.
- Classificação: PARCIAL. Antes de prometer "ISO de 3 câmeras", é preciso isolar a causa dos crashes do source-record.

### 3d. Pre-Flight existente: o que verifica e o que falta frente à seção 7

`ferramentas/preflight-producao.mjs` tem 202 linhas e é o mesmo arquivo em fonte, runtime e entrega. Recebe `production` e é ligado em `controle-producao.mjs:84` e `:447`. A API é `GET /api/preflight` (`servidor-api.mjs:472-478`), a UI é `painel/remoto/preflight.html/.js` e há o atalho vMix `PreflightCheck` (`servidor-api.mjs:155`).

| Verificação atual | Funciona no estado real? |
|---|---|
| Program vazio, CRÍTICO (l.34-44) | Sim (`state.program` é preenchido em `controle-producao.mjs:354`) |
| Preview vazio, aviso (l.46-50) | Sim |
| FTB ativo (l.53) | **Não.** Lê `state.ftb` e `state.fadeToBlack`, que nunca são preenchidos. O FTB fica em `state.finalProgramGate` (`controle-producao.mjs:153-156`), então sempre dá PASS "Inativo" |
| Master mudo (l.67-84) | Só o mute de uma entrada chamada `Master`, `3Mix Master` ou "Áudio do Desktop". Se não achar nenhuma, dá **PASS "Barramento padrão"**. Não verifica nível, clipping nem volume zero, embora o cabeçalho prometa |
| Sinal perdido nas entradas (l.87-104) | **Não.** `health.signal` é sempre `'unknown'` (`controle-producao.mjs:350`) |
| Disco (l.109-138) | Mede o volume da instalação (`p.root`), não `GetRecordDirectory` nem as pastas de ISO e replay. Se der erro, dá **PASS "Disponível"**. **Bug: `disk: diskReport` (l.169) devolve a função**, e por isso `test-preflight.mjs` FALHA |
| Erro de pré-carga no playout (l.141-156) | Sim |

Outros defeitos encontrados:
- `servidor-api.mjs:474` devolve **READY fabricado** se `preflightEngine` não existir.
- O título da janela tem mojibake literal: `'Pre-Flight ? Checklist de seguran?a'` (`servidor-api.mjs:328`).
- `mesa.html:990` anuncia "Auditoria em tempo real de hardware, encoders e encoders", mas nada disso é verificado.
- Os estados são READY, WARN e FAIL. Não existe **NÃO VERIFICADO**: o que falha vira PASS.
- `runCheck` usa o último `state` em cache, sem atualizar antes de verificar.

O que falta frente à seção 7 (ausente no código atual):
- M/Es, DSK, roteamento, Patch e ciclos.
- VTs, playlists e replay prontos, além do pré-carregamento.
- Captura física presente.
- Níveis e clipping, buses, mix-minus e retorno circular.
- 3Mix Call: convidados, latência e permissões.
- Encoders realmente utilizáveis.
- Destino de transmissão: URL, chave e protocolo. Já existem `validateStreamTarget` e `validateEncoder` em `capacidades-motor.mjs:24-41`, ainda não usados no Pre-Flight.
- Saídas e Destinations ativos ou com erro (`saidas-watchdog.mjs`, `get_destinations`).
- PGM Clean, ISO e multitrack: caminhos, permissão de escrita, espaço por destino e estimativa para a duração prevista.
- CPU, GPU, RAM e VRAM, temperatura.
- Comparação com o perfil de capacidade.
- Processos concorrentes (nome, PID, uso; Ignorar, Detalhes, pedir encerramento gracioso; exceções).
- Reverificar um item só.
- Histórico com data, projeto e máquina.
- Bypass auditável.
- Checklist gerada pelo projeto.
- Modo leve durante a transmissão.

O que pode ser reaproveitado: `disco-producao.mjs` (depois de apontar para as pastas reais); `checklist-primeira-transmissao.*` (o lado MANUAL); `final-program-gate-producao.mjs` (FTB real); `GetStats`; `capacidades-motor.mjs`; `saidas-watchdog.mjs`; `telemetria-saude.mjs` (`InputHealthEngine`, referenciado em `servidor-api.mjs`); `blackbox-producao.mjs` para registrar o histórico.

### 3e. Assistente de Novo Projeto existente: o que aplica de verdade

- UI: `painel/remoto/novo-projeto/` (`index.html`, `wizard-ui.js`, `wizard-model.js`, `operation-plan.js`). O menu da mesa diz "Novo projeto · prévia" (`mesa.html:3980`, `4069`, `4075`).
- Modelo (`wizard-model.js`):
  - 3 passos: Formato, Câmeras e áudio, Conferir.
  - **4 slots de câmera obrigatórios** (`FOUR_CAMERA_SLOTS_REQUIRED`, l.16).
  - Formato 16:9, 9:16 ou ambos; FPS em lista fixa; 1 áudio opcional.
  - Presets de filtro (cor, nitidez, Speex). Saídas externas fixadas em `[]`.
  - Gera `planHash` determinístico.
  - Não há perguntas de gravação, transmissão, VT, DSK, M/E, replay, Call, ISO ou Clean, nem modelos por tipo de produção.
- Execução:
  - `wizard-client.js` chama `/api/project/{read,scan,preview,apply}`. O roteamento existe (`runtime-admission.mjs`, ligado em `servidor-api.mjs:541`).
  - O binding (`controle-producao.mjs:57`) recebe `projectQualificationPolicy` de `creation-policy.json` = `{coverageQualified:false, nativeQueriesQualified:false, reason:"Root integration and own real provisioning qualification pending"}`. É igual na fonte e no runtime.
  - Portanto `executionEnabled=false` e `applyProject` rejeita com **`APPLICATION_DISABLED`** (`project-provisioner.mjs:11`). `scanDevices` rejeita com `DISCOVERY_HELPER_UNQUALIFIED` (`wizard-host.mjs`).
  - `operation-plan.js` declara `executable:false, previewOnly:true`, e `validateApply` retorna `executable:false`.
- O que existe de valor para a Fase E:
  - Um provisionador transacional já escrito: ledger, readbacks, allowlist de mutações, verificação de inatividade (gravação, transmissão e câmera virtual paradas) e compensação. Fica em `project-provisioner.mjs`.
  - O gate de isolamento (`project-isolation-gate.mjs`).
  - As requisições nativas `project_creation_policy` e `project_device_inventory`, já presentes no binário instalado.
  - Falta qualificar isso em motor isolado e ampliar o esquema.
- **Resultado: nada é aplicado ao motor hoje.**

---

## 4. Ordem recomendada de implementação

Ordem proposta, com justificativa. Ela reorganiza as Fases B a H por dependência técnica.

1. **B0. Correções baratas e pré-requisitos de verdade.** Sem isso, o resto apoia-se em verificações falsas.
   - Consertar `disk: diskReport` (`preflight-producao.mjs:169`).
   - Ler FTB de `finalProgramGate`.
   - Apontar o disco para `GetRecordDirectory` e para as pastas de ISO, replay e saídas.
   - Trocar os "PASS por omissão" por **NÃO VERIFICADO**.
   - Remover o READY fabricado em `servidor-api.mjs:474`.
   - Corrigir o mojibake na l.328 e a dica falsa em `mesa.html:990`.
   - Atualizar `test-clip-gain`, `test-audio-filtering` e `test-aux-output-router` (3 FAIL).
   - Marcar o `ReturnFeedManager` como indisponível na UI até ele ser real.
   - Risco baixo; só JS e fonte. Instalar pelo fluxo da §2.3.
2. **B. Serviços comuns.**
   - Inventário de máquina, reaproveitando `sistemaDetalhado`: acrescentar VRAM e monitores (DXGI, por um helper nativo pequeno ou consulta ao motor) e marcar "indisponível" de forma explícita.
   - Teste real de encoder: encode curto de quadros sintéticos num motor isolado, ou uma requisição vendor nova.
   - Teste de disco temporário com limpeza.
   - Leitor de processos concorrentes, somente leitura.
   - Formato do perfil de capacidade, versionado por máquina e driver.
   - Pacote de mídia de diagnóstico **gerado** por nós (ffmpeg `testsrc2`/`smptehdbars` com contador e tom) e verificado por hash. Não usar `downloads/multicamteste/`, que não tem licença documentada.
   - Dependências: helper nativo ou vendor request para VRAM e encoder. Decisão do dono: hospedagem do pacote opcional de mídia.
3. **D1. PGM Clean nativo**, que é o maior risco técnico e o critério final.
   - Em `FreeMixMultistream.cpp`, a view dos modos `program` e `clean` passa a usar a fonte de transição do canal 0 e mantém `overlaysMask`.
   - Gravação do destino com nome, pasta, formato e codec escolhidos. Estado por gravação.
   - Teste com duas gravações reais comparadas quadro a quadro: cortes, fade e stinger iguais, overlays ausentes só no Clean.
   - Exige build nativo, QA isolado (motor isolado **sem janela visível ao dono**, lição do incidente de 01/11) e `native-release.json`.
   - Medir custo: uma view e um encoder a mais.
4. **D2. ISO e multitrack.**
   - Isolar a causa dos crashes com `source-record` antes de expandir. Se não houver correção, considerar ISO por Destination de modo `source` (já existe, independente, com encoder próprio) como alternativa ao plugin de terceiros.
   - Prova com 3 ISOs reproduzíveis, sincronismo e áudio separado.
5. **G. Pre-Flight ampliado**, sobre o serviço B e as saídas D:
   - Categorias, NÃO VERIFICADO, reverificar um item, histórico no blackbox, bypass auditável e modo leve durante a transmissão.
   - Processos concorrentes sem encerrar nada sem confirmação explícita.
   - Checklist vinda do projeto.
6. **C. Assistente de primeira execução e benchmark progressivo.**
   - Usa B e o motor isolado com portas próprias para o estresse.
   - Integra `modulos.html`, a checklist e a escolha de módulos já existentes.
   - Mantém o instalador fora do benchmark.
7. **E. Especificação e aplicador real.**
   - Estender `wizard-model.js` com o esquema da seção 4.
   - Qualificar `project-provisioner.mjs` em motor isolado e só então virar `creation-policy.json`.
   - Criar o demo Futsal pelo motor com a mídia de diagnóstico própria.
   - Diagrama de sinais calculado a partir do plano aplicável.
8. **F. UI do Novo Projeto** com perguntas condicionais no padrão grafite.
9. **H. Regressão, pacote e atualização.**
   - Resolver a lista de controladores × `layout-files.mjs`.
   - Instalar o `atualizacao-online.mjs` novo no runtime pelo fluxo formal.
   - Terminar o e2e `qa-finalizacao/atualizacao/testar-atualizacao.mjs`.
   - Selar um pacote cujo executável seja o qualificado, porque o 20261103011403 não é.
   - Reconciliar `version.json`.

Riscos transversais:
- Edição concorrente de `servidor-api.mjs`, `controle-producao.mjs` e `mesa.html` por outras frentes (`AGENTES-EM-ANDAMENTO`).
- Motores de QA visíveis na tela do dono.
- Divergência entre binário de QA e runtime (§2.1).
- `p95` do CUT em 286,9 ms pelo protocolo (Fase 2): mede a confirmação, não o corte.

**Dependem do dono ou de hardware (bloqueados):**
- VM Windows 11 limpa, para os cenários 1, 2 e 14.
- Certificado Authenticode.
- Hardware físico (câmeras USB, HDMI ou SDI, DeckLink, ASIO, NDI de entrada, GPU de outros fabricantes) para o inventário e os testes de captura.
- Convidado real em WAN para o 3Mix Call.
- Preço e licenciamento, revisão jurídica do EULA e da licença da mídia, canal de suporte.
- Guarda da chave privada de atualização (`release-keys/`) e aprovação do ambiente `canal-estavel` no GitHub.
- Hospedagem do pacote de mídia opcional.

---

## 5. Testes executados nesta auditoria (sem motor e sem rede)

| Teste | Resultado |
|---|---|
| `FreeMix/ferramentas/test-preflight.mjs` | **FALHA**: "Deve calcular horas estimadas de gravação" (bug `disk: diskReport`) |
| `test-return-feed.mjs` | PASS (só testa o objeto; o start é simulado) |
| `test-broadcast-delay.mjs` | PASS, 8 testes |
| `test-audio-ducking.mjs` | PASS |
| `test-audio-filtering.mjs` | **FALHA**: ENOENT `ferramentas\3mix-panel\painel\remoto\audio.html` |
| `test-clip-gain.mjs` | **FALHA**: procura `FreeMix Clip Gain`; o código usa `3Mix Clip Gain` |
| `test-modulos-config.mjs` | PASS 4/4 |
| `qa-beta/test-mix-effects-protocol.mjs` | 10/10 |
| `qa-beta/test-mix-effects-shared-instance.mjs` | 2/2 |
| `qa-beta/test-patch-registry-protocol.mjs` | 6/6 |
| `qa-beta/test-mix-audio-protocol.mjs` | 7/7 |
| `qa-beta/test-mix-audio-inheritance.mjs` | 6/6 |
| `qa-beta/test-disco-producao.mjs` | 3/3 |
| `qa-beta/test-overlays-dve.mjs` / `test-overlays-link.mjs` | 1/1 e 1/1 |
| `qa-beta/test-aux-output-router.mjs` | **11 PASS / 3 FAIL** |
| `scripts/interface/aplicar-layout-grafite.mjs --check` | `success:true, checkOnly:true`, 5 arquivos pendentes |
| Hashes (script de leitura) | Ver §2.1 e §2.2 |
| Crashes do runtime (leitura) | 11 relatórios; 10 com `source-record` na thread que caiu |
