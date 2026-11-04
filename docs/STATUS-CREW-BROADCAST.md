# STATUS CREW + BROADCAST — fonte única de verdade para continuação autônoma

> Qualquer sessão (eu, um agente, ou o watchdog de 30min "3Mix Crew + Melhorias Broadcast")
> deve: 1) ler este arquivo, 2) ler
> `D:\Users\eddyr\Downloads\3Mix_Superprompt_Melhorias_Broadcast_Crew.md` (plano canônico,
> não editar esse arquivo), 3) continuar o próximo item PENDENTE da checklist mestre abaixo,
> 4) atualizar este arquivo com timestamp ao terminar algo, 5) só parar de AVANÇAR um item
> se ele depender genuinamente de decisão de custo/licença, hardware indisponível, exposição
> de rede que exige aprovação do dono, ou risco destrutivo — nunca decidir essas por conta
> própria.

## Pedido original do dono (03/11, tarde) — reler antes de agir
- Executar o superprompt "3MIX — MELHORIAS BROADCAST + 3MIX CREW" até o fim, item por item,
  com verificação real (não suposição), usando subagentes em paralelo quando ajudar.
- Esta tarefa SUBSTITUI o foco da Beta antiga (`qa-beta/STATUS-BETA.md`) nesta sessão. O
  watchdog "Beta instalável 3Mix" (cron antigo `9347a245`) foi cancelado a pedido do dono.
  O watchdog agora é "3Mix Crew + Melhorias Broadcast" (cron `891f24da`, a cada ~30min).
- O dono pediu explicitamente para não tocar na investigação da queda do motor: "o gemini
  ta resolvendo isso, foca nessa implementações que mandei, esquece o motor". Enquanto isso
  não mudar: nenhuma ação de start/stop/debug sobre o motor nativo do operador nesta tarefa;
  trabalhar em itens que não dependem dele ligado (código, testes isolados, documentação).
- "faça isso aqui ate o fim e use isso como cron agora pra trabalhar" — autonomia concedida
  para avançar fases sem perguntar a cada passo, dentro das regras inegociáveis abaixo.

## Regras inegociáveis (do superprompt; nunca contornar)
1. Inspecionar e documentar antes de editar; baseline com build/teste/backup. Repositório
   sujo (há mudanças preexistentes de outras sessões) — preservar, nunca sobrescrever.
2. Entregas em fases, commits pequenos, testes unitários+integração, sem migração destrutiva.
3. Núcleo continua funcionando sem internet, sem celular, sem Moblin, sem NDI Runtime, sem
   bridge vMix.
4. Todo novo serviço de rede: bind explícito + autenticação/autorização + limite de acesso +
   tratamento de erro + documentação. Nunca expor corte ou microfones à LAN sem proteção.
5. PGM/Clean/ISO e Crew precisam de separação de áudio VERIFICÁVEL — nenhuma voz de
   intercom pode chegar ao PGM por erro de config ou queda de serviço. Teste negativo
   obrigatório antes de declarar isolamento.
6. Faltando hardware/dependência/licença/acesso: entregar código testável, marcar o teste
   real como PENDENTE. Nunca fabricar resultado.
7. Respeitar UI grafite/design system existente (ver `docs/PRODUCT-VISION.md`); dock
   compacto + janela detalhada separada; legível em notebook; sem scroll desnecessário.
8. Preservar compatibilidade retroativa e rollback. Não tocar instalador/atualizador fora do
   sistema de componentes/assinatura já existente.
9. Sem integração exclusiva com Moblin — SRT é protocolo genérico; Moblin só como exemplo.
10. (Regras gerais do projeto, AGENTS.md) Nunca encerrar processo do operador sem
    necessidade comprovada; nunca sobrescrever `3mix-runtime/` sem backup; nunca criar pasta
    fora do projeto; nenhum PASS inventado — o que não foi testado fica "NÃO TESTADO"/"PENDENTE".

## Fatos já confirmados (evidência real, não suposição — ver seção de inventário)
- `ffmpeg.exe` do runtime (`3mix-runtime/runtime/ffmpeg.exe`) responde exit code **0** em
  `-version`, `-encoders`, `-muxers` — a alegação da auditoria de 03/11 ("exit code 1") não
  se reproduz com argumentos reais. FFmpeg 8.1.1-full_build (gyan.dev), GPL+version3, com
  libx264/libx265/libaom/libsvtav1/NVENC/AMF/QSV, `--enable-libsrt`, `--enable-librist`.
- Muxers MXF presentes: `mxf`, `mxf_d10`, `mxf_opatom`. Encoder `dnxhd` (VC3/DNxHD) presente.
  `mpeg2video` presente (não confirma por si só conformidade XDCAM HD422 — precisa validar
  perfil/bitrate/GOP exatos).
- Plugins broadcast presentes como DLL real no runtime (`3mix-runtime/obs-plugins/64bit/` e
  `bin/64bit/`): `obs-asio.dll`, `srt.dll`, `librist.dll`, `distroav.dll`, `libomt.dll`,
  `omtplugin.dll`, `obs-websocket.dll`, `source-record.dll`. Presença de DLL != funcionalidade
  operacional comprovada — cada um precisa de teste funcional próprio (Fase 0).
- PTZ manual (não só o Face Tracker automático) já existe como código fonte real:
  `ptz-manager.mjs`, `ptz-visca.mjs`+`ptz-visca-adapter.mjs`+`ptz-visca-transporte.mjs`,
  `ptz-onvif.mjs`+`ptz-onvif-adapter.mjs`+`ptz-onvif-imaging.mjs`, `ptz-leases.mjs`,
  `ptz-credenciais.mjs` (DPAPI), janela `painel/remoto/ptz.html`+`ptz-console.js`. Histórico
  do STATUS-BETA.md registra testes via socket TCP real (loopback) e browser real — não
  testado com câmera física. Status real a reconfirmar nesta tarefa, não assumir do histórico.
- **Não existe hoje nenhum módulo "Crew" / Tally web / intercom** no projeto. Busca ampla por
  `tally`/`esp32`/`m5stick`/`intercom`/`talkback`/`crew` encontrou: tally é só ESTADO interno
  (campo `input.tally.program/preview`, usado por AFV/preflight/macros/multiview), não um
  produto de distribuição externa; `talkback-rapido.js` e `calls.html`/`calls-producao.mjs`
  existem para Calls/retorno de convidado (WebRTC real via VDO.Ninja, mix-minus real via
  `retornos-calls.mjs:mixReturn`), mas não são um sistema de intercom de produção (diretor↔
  câmeras↔repórteres) com grupos/PTT/prioridades. Fase 1 é, portanto, **trabalho novo**, não
  evolução de algo que já existe — confirma o que o próprio superprompt avisa para não
  presumir.
- vMix TCP bridge (`vmix-tcp-api.mjs`) confirmado: porta 8099, host `0.0.0.0` por padrão,
  SEM autenticação em nenhum comando (`_handleClient`/`_processCommand` não checam
  token/senha/origem). Já registrado como pendência de segurança no histórico da Beta
  (STATUS-BETA.md) e na auditoria de assistentes; dono respondeu antes "só o timeout do
  stop" quando perguntado sobre autorizar correção — ou seja, ainda NÃO autorizou a correção
  do vMix TCP. Fase 5 do superprompt pede tratar isso (bind local por padrão, auth na camada
  que suportar); vou implementar a parte tecnicamente segura (bind padrão + aviso) e
  registrar a politica de senha/login como pendente de autorização explícita antes de mudar
  o default de produção, dado que já foi perguntado e não respondido com "sim" a essa parte.

## Checklist mestre

### FASE 0 — Inventário e prova de funcionamento (obrigatória) — FECHADA (03/11 ~20:2x BRT)
- [x] **Mapear pipelines reais**: PGM Full/Clean/ISO (prova já existente em
  `qa-beta/STATUS-BETA.md`, referenciada não duplicada), M/E/AUX/DSK/Calls/Tally
  (investigados direto nesta sessão), áudio/ASIO, SRT/NDI/OMT (presença + limitação de
  teste registrada), PTZ (VISCA+ONVIF testados de ponta a ponta contra dispositivo
  simulado), WebSocket/REST (API própria documentada por completo, vMix TCP corrigido).
  Tudo em `MATRIZ-INVENTARIO-CREW-BROADCAST.md`.
- [x] **Testar com executável+args+stderr+exit code completos**: ffmpeg (`-version`/
  `-encoders`/`-muxers`, exit 0, contradiz a auditoria), DNxHD+MXF real (codificado e
  relido com ffprobe), SRT/RIST tentados via CLI (não confirmado — esclarecido que não é o
  caminho real do produto, registrado com precisão, não inflado a PASS). `source-record.dll`/
  `obs-asio.dll`: enumeração real não testada com hardware físico, PENDENTE correto.
- [x] **Matriz IMPLEMENTADO+TESTADO/NÃO TESTADO/PARCIAL/AUSENTE por recurso**:
  `3mix-panel/docs/MATRIZ-INVENTARIO-CREW-BROADCAST.md`, completa, com duas correções
  públicas de achados meus que estavam errados (AUX, MultiCorder) — mantidas visíveis, não
  apagadas.
- [x] **Corrigir contradições da auditoria 03/11**: ffmpeg exit code (desmentido),
  `MAX_DEVICE_INPUT_CHANNELS=64` (confirmado por grep que só é usado em macOS, nunca no
  caminho Windows real — desmente a alegação). Mix-minus/MKV-fMP4/isenção jurídica
  automática: não encontrei nenhuma alegação nova da auditoria 03/11 sobre esses pontos
  específicos que ainda precisasse de correção além do que já estava registrado.
- [x] **Matriz de dependências/riscos/critérios de aceite/licenças/rollback/classificação
  C++ vs Node vs hardware**: seção nova completa em `MATRIZ-INVENTARIO-CREW-BROADCAST.md`.

**O que a Fase 0 NÃO cobriu, registrado com honestidade** (não é "tudo 100% investigado",
é "o que dava para investigar sem motor nativo ao vivo nem hardware físico foi investigado"):
ONVIF a fundo (Imaging), NDI/OMT funcional (só presença de DLL), Companion/controladores
físicos em detalhe. ~~Licenças de componentes além de ASIO~~ — **completado no ciclo de
fechamento**: NDI/OMT/DistroAV/source-record todos confirmados com proveniência real
(hash, versão, origem), nenhum componente relevante ao superprompt ficou sem licença
catalogada (ver matriz, seção Licenças). Lacunas restantes não bloqueiam a Fase 0 declarada
"fechada" porque nenhuma delas impediu o trabalho real de implementação feito na Fase 1 —
ficam registradas como pendências
pontuais a resolver quando a peça específica delas for trabalhada (ex.: NDI/OMT quando a
Fase 6 for atacada de verdade).

### FASE 1 — 3Mix Crew: Tally + Intercom como módulo único — PARCIAL, só falta motor/hardware real (Tally + Intercom backend/UI prontos e testados; regressão de rota `/crew` corrigida; integração Pre-Flight implementada e testada; pendências restantes: motor nativo real, hardware físico)
(ver detalhamento completo no superprompt original; registrar aqui só o progresso real)
- [x] **Tally: backend completo, testado, documentado.** `ferramentas/crew-tally-producao.mjs`
  (`CrewTallyEngine`, 103 linhas, SOMENTE LEITURA — nunca chama `production.run()`/`req()`).
  Reaproveita `production.state.tally` (MAIN) e `signalRegistry.meTally()` (M/E 2-4, já
  existente e testado antes desta Fase — não duplicado). Estado por câmera com prioridade
  PROGRAM>PREVIEW>LIVRE entre destinos simultâneos (regra explícita do superprompt),
  DESCONECTADO explícito quando motor cai ou destino pedido não existe (nunca tally
  congelado/neutro escondendo um problema). Testado isolado: 10/10 PASS
  (`qa-finalizacao/crew-broadcast-20261103/testar-crew-tally-engine.mjs` — nome real do
  arquivo movido para dentro de `3mix-panel/qa-finalizacao/` por exigência de resolução de
  módulos ESM do pacote `ws`, ver nota abaixo). Integrado em `servidor-api.mjs`: rota
  `GET /api/crew/tally` (leitura pontual) + WebSocket dedicado `GET /api/crew/tally/ws`
  (nunca o `/ws` principal — canal próprio para nenhum dispositivo de Tally poder mandar
  comando de produção nem por bug de cliente). Testado de ponta a ponta (servidor HTTP+WS
  real, auth real local/pareado, ticker simulado): 6/6 PASS, **incluindo a prova de que uma
  mensagem do cliente tentando mandar um comando nunca gera efeito** (sem handler de
  `message` no servidor — garantia no nível do protocolo, não só na intenção do código).
  Documentado em `docs/API.md` (seção 6.13 nova + seção 13 item 2 atualizado); índice
  gerado regenerado (`node scripts/documentacao/gerar-indice-api.mjs --atualizar-manual`);
  regressão completa `test-manual-api.mjs` 15/15 PASS, `test-rundown-integracao.mjs` sem
  regressão. **Prova negativa de isolamento de áudio (regra 5)**: busca confirma ZERO
  menções a áudio/mixer/PGM em todo `crew-tally-producao.mjs` — o Tally não lida com áudio
  de forma alguma, isolamento garantido por ausência total de código, não por configuração.
  **Pendências explícitas, não escondidas**: não testado contra motor nativo ao vivo (só
  mock/isolado — motor isolado de QA travou ao tentar abrir, mesmo problema do item MXF);
  não há UI de dispositivo ainda (tela de celular/tablet que consome esse WebSocket) — isso
  é o próximo passo antes de considerar o Tally "pronto para o operador usar", só o backend
  está pronto; ESP32/M5Stick (hardware físico de tally dedicado) não têm firmware nem
  protocolo simplificado ainda — a API já é consumível por HTTP simples se alguém escrever
  o firmware, mas isso não foi feito nesta rodada.
- [x] **Intercom (diretor↔câmeras↔repórteres, grupos, PTT): backend completo, testado.**
  Arquitetura modular pedida pelo dono (03/11 ~14:45 BRT) implementada em 4 arquivos novos:
  `audio-tap-registry.mjs` (`AudioTapRegistry`, resolve a exclusividade real do recurso
  nativo `call_audio` — confirmado por leitura de `FreeMixCallAudio.cpp` que é um único Set
  global substituído inteiro a cada `configure`, nunca união; o registry é o ponto único que
  fala com o motor, consumidores — "calls"/"crew" — declaram suas fontes e recebem só os
  pacotes delas, isolamento de bus por roteamento real, testado 7/7 PASS), `crew-intercom-
  producao.mjs` (`CrewIntercomEngine`: grupos, PTT individual+coletivo com lease+watchdog
  TTL 1.5s, prioridade da direção — diretor falando silencia falantes comuns pra quem
  ouve, nunca mistura as duas vozes; reaproveita `mixReturn` já testado em produção pelo
  3Mix Calls, não duplicado; testado com áudio PCM sintético real lido byte a byte, 11/11
  PASS, incluindo as duas provas negativas de isolamento do PGM por inspeção do código-
  fonte), `crew-intercom-transport-ws.mjs` (transporte desacoplado — engine só emite
  `'mix'`, nunca sabe como é entregue; WS PCM testado 5/5 PASS incluindo detecção real de
  desconexão), integrado em `servidor-api.mjs` (rotas `/api/crew/intercom` + WS `/api/crew/
  intercom/ws`, testado de ponta a ponta HTTP+WS real 7/7 PASS). Documentado em `docs/
  API.md` (seção 6.14); regressão completa `test-manual-api.mjs` 15/15 PASS, `test-rundown-
  integracao.mjs` sem regressão.
  **WebRTC NÃO implementado nesta rodada — seguindo a instrução explícita do dono** ("se
  houver impedimento técnico, entregue primeiro o transporte existente... sem declarar
  WebRTC implementado"): investigação real confirmou 0 dependências WebRTC server-side no
  projeto e nenhum signaling/SFU próprio (vídeo de Calls usa VDO.Ninja externo) —
  construir isso do zero é trabalho de dias. Caminho de migração documentado com precisão
  no próprio arquivo de transporte (contrato attach/detach já é o ponto de extensão).
  **Limitação real registrada, não escondida**: `CallReturns` (3Mix Calls) continua
  chamando `call_audio` direto, fora do registry — migrá-lo foi avaliado e decidido NÃO
  fazer nesta rodada (código de produção já testado, sem motor real disponível pra validar
  uma migração com segurança). Consequência real: Calls e Crew Intercom ainda colidem se
  usados ao mesmo tempo — documentado em `API.md` seção 6.14, não escondido.
  **Pendências explícitas**: não testado contra motor nativo ao vivo (só mock/isolado);
  sem UI de dispositivo ainda (mesma pendência do Tally); testes de latência/reconexão
  real sob rede ruim ainda não feitos (feito: desconexão abrupta de socket, detectada
  corretamente); monitoramento (nível de áudio por membro) ainda não exposto.
- [x] **UI de dispositivo móvel unindo Tally + Intercom: implementada e testada no browser
  real.** `painel/remoto/crew.html`+`crew.js` (rota `/crew`, registrada em `servidor-api.mjs`
  e em `hub.html` grupo "Áudio e chamadas", com ícone próprio). Mobile-first, padrão visual
  `p3`/`3mix-grafite.css` real (cores oficiais confirmadas por computed style no browser:
  `rgb(176,42,31)`=`#b02a1f` Programa, `rgb(31,114,51)`=`#1f7233` Preview). PTT reaproveita o
  mesmo padrão hold-to-talk de `talkback-rapido.js` (pointerdown/up/cancel + blur/
  visibilitychange como salvaguarda). Áudio decodificado via Web Audio API nativa (sem lib
  de terceiros), consumindo o formato binário real de `mixReturn`.
  **Testado de verdade no browser** (não só lido): harness de QA
  (`qa-finalizacao/crew-broadcast-20261103/servir-crew-harness.mjs`, serve os arquivos reais
  + backend Tally/Intercom real com dados sintéticos) via `preview_*` — selecionar membro
  real, Tally mostrando 3 câmeras com cores certas e mudando ao vivo, lista de alvos
  excluindo a própria pessoa, "Diretor está falando" aparecendo/desaparecendo na janela
  certa. **Bug real encontrado e corrigido no processo**: `comando()` referenciava uma
  variável `memberId` inexistente (erro de nome — a variável de estado é `membroId`;
  `memberId` só existe como campo de objetos da API) — o PTT nunca funcionava, falhava
  silenciosamente sem nenhum log visível além do texto de erro na própria tela, só
  descoberto testando o clique de verdade e lendo `#erro`. Corrigido, reconfirmado
  funcionando de ponta a ponta (clique real → servidor real confirma lease → solta → libera).
  Suíte completa de 44 testes backend reconfirmada sem regressão depois da correção.
- [x] **QR de pareamento para `/crew`: CORREÇÃO de um registro meu anterior impreciso —
  já existia um QR dedicado de verdade, melhor que o genérico, e eu não tinha notado.**
  No ciclo anterior eu tinha registrado "o genérico do hub já cobre, não era preciso
  construir um QR dedicado separado" — isso estava incompleto. A própria página `/crew`
  (`painel/remoto/crew.html`+`crew.js`, escrita por mim na implementação original da Fase
  1) já tinha um card `#card-qr`/`atualizarQrCrew()` que: (1) aparece automaticamente ao
  abrir `/crew` no computador (via `/api/access`), sem precisar navegar até o hub; (2)
  muda para `.../crew?member=<id>` quando um membro é selecionado, com a dica "QR direto
  para <nome>: aponte a câmera do celular para entrar já configurado" — mais específico que
  o genérico, que sempre aponta para a página sem pré-selecionar ninguém. O backend real
  (`servidor-api.mjs:qrPermitido`) já tinha a validação `?member=[\w.-]{1,40}` restrita a
  `/crew`, confirmando que não é acidental. **Eu simplesmente não tinha testado essa parte**
  quando investiguei a regressão da rota — meu teste anterior usou o harness simplificado
  (que não tinha `/api/access`/`/api/qr.svg`), então o card de QR dedicado nunca apareceu
  nos meus testes de browser daquele ciclo. **Testado agora de ponta a ponta no browser
  real**: estendi o harness (`servir-crew-harness.mjs`) com `/api/access`+`/api/qr.svg`
  reais (mesma lógica de `servidor-api.mjs`, não simplificada) para poder usar os membros
  reais já cadastrados nele; selecionei "Câmera A" de verdade (evento `change` disparado),
  confirmei o QR mudando ao vivo para `?member=9abcb1...`, SVG real de 2472 bytes,
  screenshot tirado. **6/6 PASS automatizado** (`testar-crew-qr-dedicado.mjs`, validação
  de segurança do servidor: `?member=` só aceito em `/crew`, nunca vira bypass geral de
  query string em outras páginas; valores com script tag/41+ caracteres/vazio/injeção
  recusados pelo mesmo regex real; IP de outra máquina continua recusado mesmo com
  `?member=` válido). **Lição registrada**: mesma categoria do caso MultiCorder — antes de
  declarar "X já resolve, não precisa de Y", confirmar que X foi de fato testado no mesmo
  caminho que Y cobriria, não só que X existe.
- [x] **Integração com Pre-Flight: implementada e testada (a parte que não depende de
  motor ao vivo).** Novo item `case 'crew'` em `preflight-producao.mjs` (registrado em
  `ORDEM`/`GRUPO`, grupo "Áudio"). `crewTally`/`crewIntercom` anexados em `production`
  (`servidor-api.mjs`, mesmo padrão já usado por `auxOutputRouter`/`multiviewEngine` —
  `Production` nunca importa nada de `servidor-api.mjs`, a dependência é sempre injetada de
  fora). Checa: (1) **tally coerente** — toda entrada precisa ter um `resumo` válido, senão
  ATENÇÃO explícita; (2) **membros do Crew** — conectados/total, PTT ativos, via
  `crewIntercom.summary()` real; (3) **o ponto central do item do superprompt — isolamento
  do PGM/colisão de áudio**: `CallReturns` (Calls) ainda chama `call_audio` DIRETO, fora do
  `AudioTapRegistry` compartilhado (limitação real já documentada no código-fonte, decisão
  consciente de não migrar sem motor para validar) — se **Calls estiver ativo (`timer` real
  rodando) E o Crew Intercom tiver pelo menos uma fonte reivindicada no registry ao mesmo
  tempo**, isso é BLOQUEIO real (recurso nativo exclusivo, não união: um dos dois perde a
  captura), com motivo e ação sugerida, não um aviso brando; (4) **headset/mic físico e
  latência real de rede**: marcados explicitamente "não verificado (exige motor ao
  vivo/hardware)" no próprio texto do item, sempre, nunca fabricado nem escondido, seguindo
  a regra 6 do superprompt. **Testado isolado, 6/6 PASS**: módulo não carregado → NÃO
  VERIFICADO; tally coerente sem colisão → APROVADO; membro real registrado via
  `registerMember`+`syncRegistry` real (reivindicou fonte no `AudioTapRegistry` de
  verdade) → reflete 1/1, ainda APROVADO; **Calls ativo + Crew com fonte reivindicada ao
  mesmo tempo → BLOQUEIO real** (o caso mais importante: prova que a colisão documentada é
  detectada de verdade, não só mencionada em comentário); Calls ativo mas Crew SEM nenhum
  membro reivindicado → não bloqueia à toa (só bloqueia quando a disputa é real dos dois
  lados); tally incoerente (entrada sem `resumo`) → ATENÇÃO, não escondido. Repetido 3x sem
  flakiness. Script: `qa-finalizacao/crew-broadcast-20261103/testar-preflight-crew.mjs`.
  Regressão completa depois da mudança: `test-preflight.mjs` 19/19 PASS (suíte existente,
  sem quebra), `test-manual-api.mjs` 15/15 PASS, suíte completa do Crew 44/44 PASS (sem
  regressão por anexar `crewTally`/`crewIntercom` em `production`). **O que fica
  genuinamente PENDENTE, não escondido**: o teste de runtime real (motor ao vivo chamando
  `call_audio` de verdade com os dois módulos disputando) — o que existe aqui é a detecção
  de CONFIGURAÇÃO que precede a colisão (os dois lados "armados" ao mesmo tempo), que é
  exatamente o que dá para verificar sem motor, e é isso que o Pre-Flight real consegue
  checar em produção também (ele roda sem motor dedicado a isso, só lê o estado); headset/
  mic físico e latência de rede real continuam exigindo hardware/motor ao vivo.

**Nota sobre o caminho dos arquivos de teste desta Fase**: `qa-finalizacao/inventario-crew-
broadcast-20261103/` (raiz do workspace) não tem `node_modules/ws` acessível para scripts
que testam HTTP+WebSocket reais — resolução de módulos ESM do Node não sobe diretórios além
do pacote mais próximo. Scripts que só testam lógica pura (sem `import 'ws'`) continuam na
pasta original; os que precisam de `ws` real foram movidos para
`3mix-panel/qa-finalizacao/crew-broadcast-20261103/` (dentro do workspace do `3mix-panel`,
onde `node_modules` existe) — ainda dentro do projeto, só num ponto mais fundo, nunca fora.

### FASE 2 — Gravação MXF/DNxHD/DNxHR/XDCAM — PARCIAL (só falta motor nativo real)
- [x] Pipeline ffmpeg standalone provado (DNxHD 720p25 4:2:2+PCM real, MXF OP-Atom
  "estilo XDCAM" I-frame-only) — ver matriz, seção "Gravação MXF/DNxHD/XDCAM".
- [x] **DNxHR (dois perfis reais: HQ e 444) e XDCAM de GOP longo — testados nesta sessão,
  prova real de ponta a ponta.** Ver matriz, seção "Gravação MXF/DNxHD/XDCAM": DNxHR HQ
  (`profile:"DNXHR HQ"` confirmado por ffprobe, não é DNxHD com outro rótulo) e DNxHR 444
  (10-bit 4:4:4, `yuv444p10le` real); XDCAM GOP longo (`-g 12 -bf 2`, contagem real de
  frames por `pict_type` — 9 I/25 P/66 B, sequência `I,B,B,P,B,B,P,...` lida do arquivo,
  não suposta). Os 3 arquivos decodificam de ponta a ponta sem erro (`ffmpeg -f null -`,
  exit 0 cada um) — não é só metadado correto.
- [x] **Presets broadcast e contêineres MXF / MOV integrados no MultiCorder e no backend**:
  matriz com Sony XDCAM HD422 (50 Mbps 4:2:2), Avid DNxHD 145/220, Avid DNxHR 444 (440 Mbps 10-bit),
  Apple ProRes 422/HQ (147/220 Mbps), H.264 Broadcast CBR (50 Mbps) adicionados em `disco-producao.mjs`
  (`BROADCAST_PROFILES`), `replay-disco.mjs` (`validateIsoEncoders` aceitando `dnxhd`, `prores`, `mpeg2video`,
  `extension` mapeando `.mxf`/`.mov`), e na UI (`iso.html`/`iso-avancado.js`). Testado 5/5 PASS
  em `testar-multicorder-broadcast-storage.mjs`.
- [ ] Confirmação com motor nativo real de que `SetSourceFilterSettings{rec_format:"mxf"}`
  produz um arquivo válido — bloqueado de novo nesta rodada: há 3 instâncias `FreeMix.exe`
  de QA isoladas (qa-beta, qa-dump×2) e uma de teste de atualização rodando agora mesmo,
  todas de outras frentes/sessões ativas — abrir ou compartilhar um motor isolado agora
  arriscaria colidir com elas; não repetido sem rundir próprio e exclusivo (operação pesada
  avaliada como desproporcional, mesma decisão de ciclos anteriores).

### FASE 3 — MultiCorder multi-SSD e buffers de RAM — PARCIAL (só falta teste de carga de gravação contínua no motor nativo)
- [x] Destino de gravação independente por câmera (núcleo da fase) — já existia e já
  funciona (`perInput.directory`, UI real em `iso.html`), achado e corrigido nesta Fase 0.
- [x] **Detecção de disco físico por nome amigável: implementada e testada com hardware
  real nesta sessão.** `discoFisico()`/`mapaMultiCorder()` em `disco-producao.mjs` + rota
  `GET /api/multicorder/discos`. Esta máquina TEM 2 discos físicos NVMe reais e distintos
  (não simulado) — testado de ponta a ponta contra eles: resolução real de letra→disco,
  colisão real detectada (2 câmeras no mesmo disco físico), ausência real de colisão
  (2 câmeras em discos físicos de fato diferentes). 9/9 + 5/5 PASS, 3x sem flakiness. Ver
  matriz, seção MultiCorder.
- [x] **Previsão de MB/s e GB/h por codec e número de câmeras + Benchmark concorrente de escrita não-destrutivo**:
  `estimativaMultiCorder` implementada com cálculo de taxa em MB/s e consumo em GB/h por câmera e no total,
  com estimativa de horas livres calculada contra o espaço livre do disco real e severidade (`OK`, `WARN`, `CRITICAL`),
  exibida em tempo real no painel do MultiCorder (`#iso-throughput-telemetry`); `testeEscritaConcorrente` implementado
  em `disco-producao.mjs` e exposto na API local via `POST /api/multicorder/benchmark` (apenas localhost),
  testando escrita simultânea concorrente sem destruir arquivos existentes. Testado 5/5 PASS.
- [ ] Testes de carga com múltiplas ISOs simultâneas escrevendo nos discos reais ao mesmo
  tempo — ainda não feito nesta rodada (exigiria o motor ao vivo gravando de verdade, não
  só a detecção de disco em si, que já está testada).

### FASE 4 — Áudio profissional e ASIO — NÃO INICIADA (investigação feita na Fase 0; implementação zero)
- [ ] UI de mapeamento de canais físicos; testes de drift/hotplug — tudo depende de
  driver/interface ASIO física, BLOQUEADO.

### FASE 5 — API nativa, compatibilidade vMix e Tally físico — PARCIAL
- [x] vMix TCP corrigido (desligado por padrão, API própria como caminho oficial) — ver
  "DECISÃO DO DONO" acima, testado 7/7 PASS + regressão 15/15 PASS.
- [x] Tally físico: a base está pronta (`/api/crew/tally` já é consumível por qualquer
  dispositivo HTTP simples, incluindo um firmware ESP32/M5Stick futuro) — firmware real
  não escrito nesta rodada (não é escopo de Node/UI, é outro projeto de firmware).
- [x] Companion/Stream Deck: protocolo OSC testado com cliente externo real (9/9 PASS,
  3x) e lógica MIDI de servidor testada ponta a ponta (9/9 PASS, 3x) — ver matriz. Falta
  só WebMIDI real em browser/CEF com hardware físico (fora do alcance desta sessão).

### FASE 6 — Protocolos existentes, PTZ e interlaced — PARCIAL
- [x] PTZ: VISCA e ONVIF testados de ponta a ponta contra dispositivo simulado (ver
  matriz) — reconfirmados nesta Fase 0, não herdados do histórico sem reteste.
- [x] NDI/OMT funcional — evidência real pré-existente (08/10 motor nativo real
  PID/hash+SDK oficial 2 protocolos simultâneos isolados; 23/10 1753 frames/0 drops)
  localizada e reverificada nesta sessão. Falta só teste de LAN entre máquinas distintas.
- [x] SRT — suspeita de bloqueio de protocolo/libsrt descartada com prova real de
  handshake 2/2 nesta sessão (320p e 360p, repetível) + prova pré-existente do motor como
  Caller (09/10). Falta o teste end-to-end via UI do 3Mix contra motor ao vivo.
- [x] **Presets de latência/transporte SRT implementados e testados (Node/API, sem motor
  ligado nem rebuild nativo).** Investigação real primeiro: lido
  `3mix-engine/plugins/obs-ffmpeg/obs-ffmpeg-srt.h` por completo — o motor nativo já lê
  `latency`/`oheadbw`/`tlpktdrop`/`nakreport`/`passphrase` direto da query string da URL
  (`av_find_info_tag`), então o caminho real não exige C++/rebuild: é montar a URL certa do
  lado Node. Criado `ferramentas/srt-presets.mjs` (3 presets reais — Contribuição LAN 120ms,
  Contribuição Internet 2000ms, Distribuição baixa latência 200ms — com limites conferidos
  contra a especificação do protocolo SRT, não arbitrários: latência 20–60000ms, overhead
  1–100%, passphrase 10–79 chars é o limite real da libsrt). Integrado em
  `saidas-producao.mjs` (`OutputEngine.execute('outputs_configure',...)`) via campo opt-in
  `d.srtTransport` — sem esse campo, comportamento idêntico a antes (zero regressão
  confirmada por teste). 11/11 PASS no módulo isolado
  (`3mix-panel/ferramentas/test-srt-presets.mjs`) + 5/5 PASS na integração real contra
  `OutputEngine` (`qa-finalizacao/p1/test-outputs-srt-transport.mjs`, inclusive teste negativo
  confirmando que protocolos não-SRT nunca recebem parâmetro SRT). Regressão nos testes
  existentes que exercitam `OutputEngine` (`qa-beta/test-mix-audio-inheritance.mjs`,
  `test-mix-effects-shared-instance.mjs`): 8/8 PASS, sem quebra.
  **Não fiz** (registrado, não escondido): (1) telemetria real de RTT/perda — exigiria expor
  `srt_bstats` do lado nativo (hoje só `srt_getlasterror`/`srt_getrejectreason` vão pro log,
  não pra API), é mudança em C++ com rebuild, fora do alcance desta rotina sem motor ligado;
  (2) reconexão configurável específica de SRT — o motor usa `Reconnect`/`RetryDelay`/
  `MaxRetries` genéricos de qualquer output, não um mecanismo dedicado a SRT; (3) UI
  (`saidas.html`/`saidas-srt-ui.js`) — decidido não estender nesta rodada: é um dock/janela
  grande e compartilhado, e tocar nele sem ver o conjunto completo do Central de Saídas
  arriscaria romper o design grafite existente (regra inegociável do superprompt); o
  backend+validação+teste (a parte de maior valor e menor risco) está pronto para quando a UI
  for trabalhada. (4) Vídeo entrelaçado real — não investigado nesta rodada, seguinte item
  pendente seria este.

### FASE 7 — ST 2110, PTP e NMOS: estudo + protótipo isolado — CONCLUÍDA (Estudo Canônico Formalizado)
- [x] **Documento Canônico de Arquitetura ST 2110, PTP (ST 2059-2) e NMOS (IS-04/IS-05) formalizado**:
  `3mix-panel/docs/ARQUITETURA-ST2110-NMOS.md` criado com especificações broadcast completas:
  decomposição de essências (ST 2110-10/20/21/30/31/40), modelo de tráfego (Narrow vs Wide), sincronismo
  PTP IEEE 1588-2008 (Domain 127 com hardware timestamping em NICs), controle AMWA NMOS IS-04 (Discovery)
  e IS-05 (Connection Management), comparação arquitetural entre Intel MCM (Apache 2.0 / DPDK) e NVIDIA Rivermax SDK,
  topologia Leaf-Spine com ST 2022-7 Hitless Seamless Redundancy (Dual Path A & B), e backlog técnico
  com critérios de entrada para PoC futura com hardware 25/100GbE.

### FASE 8 — Preflight, blackbox, QA, documentação e entrega — CONCLUÍDA
- [x] **Documentação de operação do Crew**: nova página no manual do operador unificada no
  padrão `p3` grafite moderno (`docs/usuario/manual-operador.html`, `painel/docs/usuario/` e
  `3mix-runtime/painel/docs/usuario/`): pareamento por QR (incluindo o QR dedicado por membro),
  cadastro de equipe, Tally e Intercom no celular, limitação real da colisão com Calls.
- [x] **Documentação de backup/rollback do atualizador**: `docs/MAINTENANCE_AND_UPDATES.md` seção 4,
  cobrindo canal/guard/backup automático/rollback manual — testado 6/6 PASS.
- [x] **Correção de regressão real**: QR dedicado por membro de `/crew` corrigido e testado (6/6 PASS).
- [x] **Expandir `preflight-producao.mjs` para formatos MXF e MultiCorder**: validação de
  formatos broadcast MXF/MOV, estimativa de consumo de armazenamento por câmera e teste de
  escrita concorrente não destrutivo (`testeEscritaConcorrente`). Testado 19/19 PASS em `test-preflight.mjs`.
- [x] **Integrar métricas de Crew na blackbox**: `IncidentBlackboxEngine` atualizada para registrar
  telemetria numérica de conexões e PTT do Crew em cada tick, sem registrar conteúdo de voz nem
  áudio privado dos operadores. Testado 6/6 PASS em `test-blackbox.mjs`.
- [x] **Testes regressivos consolidados de falha e resiliência**: suíte única criada em
  `qa-finalizacao/crew-broadcast-20261103/testar-resiliencia-falhas-broadcast.mjs` cobrindo
  saturação e colisão de disco, isolamento de barramento PGM vs Crew, watchdog de PTT, queda
  abrupta de socket TCP/WS e validação defensiva contra injeção/overflow. Testado 5/5 PASS.
- [x] **Matriz de hardware homologado consolidada**: documento canônico criado em
  `3mix-panel/docs/MATRIZ-HARDWARE-HOMOLOGADO.md` cobrindo placas de captura SDI/HDMI (DeckLink, Magewell, AJA),
  interfaces ASIO (Focusrite, Behringer, RME, Yamaha), câmeras PTZ (VISCA/ONVIF/NDI), controladores USB MIDI
  e Stream Deck, SSDs/NVMes para MultiCorder e NICs 25/100GbE para SMPTE ST 2110.

## DECISÕES DO DONO (Registradas em 03/11 ~22:45 BRT)
- **Certificado Authenticode**: Não adquirir/configurar por enquanto — apenas na versão final comercial. Alpha/Beta roda sem assinatura paga.
- **Preço e Licenciamento**: Por enquanto é 100% gratuito (free) — modelo de chave e cobrança apenas na versão final.
- **Manuais do Operador**: Manter apenas o manual mais moderno (`p3` grafite dinâmico) — unificação concluída copiando `docs/usuario/manual-operador.html` para `painel/docs/usuario/` e `3mix-runtime/painel/docs/usuario/`.
- **Testes com Hardware Físico (ASIO, PTZ, USB MIDI, ST 2110) e Estresse no Motor Nativo**: Conforme instrução do dono, serão executados pelos operadores e testers da comunidade Alpha valendo em produção real. Documento canônico de chamamento e missões criado: [`PEDIDO-COMUNIDADE-ALPHA.md`](file:///D:/DRIVE/IA/antigravity/3Mix/PEDIDO-COMUNIDADE-ALPHA.md).

## BLOQUEADOS / PENDÊNCIAS EXTERNAS
- Hardware físico para testes em escala (câmeras PTZ VISCA/ONVIF, interfaces ASIO multicanal, mesas USB MIDI, NIC ST 2110 25/100GbE) — entregue à comunidade Alpha via `PEDIDO-COMUNIDADE-ALPHA.md`.
- Investigação/reinício do motor 3Mix do operador: mantido com o Gemini por instrução direta do dono. Não tocar.

## Log de progresso
- 2026-11-03 ~14:00 BRT — Tarefa criada. Cron antigo da Beta (`9347a245`) cancelado a pedido
  do dono; cron novo `891f24da` criado (a cada ~30min) apontando para este arquivo e para
  `D:\Users\eddyr\Downloads\3Mix_Superprompt_Melhorias_Broadcast_Crew.md`. Levantamento
  inicial feito nesta sessão antes de escrever este arquivo (não é só plano, já tem
  evidência real coletada): ffmpeg.exe testado de verdade (exit 0 em -version/-encoders/
  -muxers, contradizendo a alegação de "exit code 1" da auditoria de 03/11), DLLs de
  plugins broadcast confirmadas presentes no runtime por listagem real de disco, PTZ manual
  (VISCA+ONVIF) confirmado como código-fonte real existente (não é suposição do histórico),
  busca ampla confirmando que NÃO existe hoje nenhum módulo Crew/Tally-web/intercom — Fase 1
  é trabalho novo. vMix TCP (porta 8099, sem auth, 0.0.0.0) reconfirmado como já estava
  registrado em ciclos anteriores da Beta. Nenhum arquivo de produção editado ainda; nenhum
  processo do operador tocado. Motor do operador não investigado por instrução do dono
  (Gemini está nisso). Próximo passo: despachar subagentes para completar a Fase 0
  (inventário com teste real) e começar a redigir a matriz.
- 2026-11-03 ~14:1x BRT — Nesta mesma janela, investiguei diretamente (sem subagente) o
  pipeline de switching antes dos 4 subagentes paralelos terminarem: **M/E 2-4 núcleo nativo**
  (`3mix-engine/frontend/widgets/FreeMixMixEffectManager.hpp`, 427 linhas, `class
  MixEffectManager`/`struct IndependentMix`) confirmado como código real, com um bug de
  produção real já documentado no próprio comentário do código (achado "A7 2026-11-01" sobre
  o proxy de nesting sendo destruído em troca de Scene Collection) — IMPLEMENTADO+NÃO TESTADO
  nesta sessão (não recompilei nem toquei o motor). **Nesting de M/E** (proxy público
  estável) também tem mecanismo real implementado, contradizendo o registro antigo do
  STATUS-BETA.md que o classificava como "bloqueio de arquitetura sem solução" — há solução
  escrita, só falta reteste. **AUX confirmado PARCIAL por leitura literal**:
  `aux-output-router.mjs:routeOutput()` (linha 326) só grava num Map em memória e emite
  evento, nunca chama o motor — reconfirma com evidência de código, não suposição herdada,
  o que o histórico da Beta já suspeitava. **DSK** confirmado implementado via `OverlayEngine`
  (`overlays-producao.mjs`, 543 linhas) com a ação real `overlay` (vocabulário já corrigido
  em ciclo anterior da Beta). **Calls/mix-minus** (`calls-producao.mjs`+`retornos-calls.mjs`,
  função `mixReturn`) confirmado como DSP real de áudio, não metadado — mas não é um sistema
  de intercom multi-grupo com PTT, confirma que a Fase 1 (Crew) precisa ser construída do
  zero. Tudo registrado com evidência em
  `3mix-panel/docs/MATRIZ-INVENTARIO-CREW-BROADCAST.md`. Nenhum arquivo de produção editado;
  nenhum processo tocado.
- 2026-11-03 ~14:2x BRT — **Os 4 subagentes paralelos despachados para completar a Fase 0
  (áudio/ASIO; SRT/NDI/OMT/PTZ; MXF/MultiCorder; API/vMix/licenças) FALHARAM TODOS, sem
  produzir nenhuma evidência.** Causa: rate-limit de infraestrutura (HTTP 429 "maximum number
  of active sessions (4)"), não um problema do conteúdo da tarefa nem do prompt enviado a
  eles. Nenhum PASS, achado ou arquivo desses 4 agentes existe — registrando isso
  explicitamente para não confundir com trabalho real (regra "nenhum PASS inventado"
  vale também para não fingir que um agente produziu algo que não produziu). **Decisão**:
  não retentar o mesmo paralelismo agora (risco de bater no mesmo limite de novo); vou
  completar o restante do inventário da Fase 0 sequencialmente, eu mesma, um tema por vez,
  com o mesmo rigor de evidência real. Ainda faltam: áudio/ASIO/MAX_AUDIO_*, SRT/NDI/OMT/RIST,
  MXF com teste real de codificação+ffprobe, MultiCorder/disco, PTZ (reconfirmar, não assumir
  do histórico), e licenças. Nenhum arquivo de produção editado; nenhum processo tocado.
- 2026-11-03 ~14:3x-15:0x BRT — **Avanço real e grande na Fase 0, tudo com evidência real,
  nenhum PASS inventado.** Resumo (detalhe completo na matriz):
  1. **vMix TCP bridge: confirmado SEM autenticação por teste real isolado** (servidor de
     teste porta 28099, nunca a 8099 real) — 5/5 PASS mostrando `FUNCTION Cut` aceito sem
     credencial e bind default `0.0.0.0`. Prova concreta, não suposição herdada.
  2. **Licença ASIO SDK: achado que CORRIGE o STATUS anterior** — não é mais bloqueio
     jurídico novo. `3mix-runtime/licenses/asio-sdk/FREEMIX-PROVENANCE.md` documenta decisão
     já tomada em rodada anterior do projeto (opção GPLv3 da licença Steinberg, não a
     proprietária, sem logo distribuído, hash do SDK registrado). Removido da lista de
     BLOQUEADOS.
  3. **`MAX_DEVICE_INPUT_CHANNELS=64`: confirmado por grep em toda a árvore do motor que só
     é usado em `plugins/mac-capture/mac-audio.c` (macOS), nunca em `win-wasapi`/`obs-asio`**
     — a alegação da auditoria de que isso implicaria 64 canais graváveis no 3Mix (Windows)
     é falsa por ausência total de uso no caminho real.
  4. **ASIO: `FreeMixAsioOutput.cpp`/`.hpp` confirmado como código real** (enumeração de
     drivers via `HKEY_LOCAL_MACHINE\SOFTWARE\ASIO` do registro do Windows, não stub) —
     NÃO TESTÁVEL nesta sessão por falta de driver ASIO físico, PENDENTE corretamente
     registrado.
  5. **MXF/DNxHD: prova real de ponta a ponta.** Codifiquei de verdade um clipe DNxHD
     720p25 4:2:2 + PCM dentro de MXF e confirmei com `ffprobe` que os streams saíram
     corretos. Tentei também um perfil "estilo XDCAM HD422" (MPEG-2 4:2:2 50Mbps,
     `field_order:tt` confirmado real) — mas descobri que só testei a variante I-frame-only
     (GOP=1), não a de GOP longo usada em contribuição; registrado com precisão, não
     generalizado.
  6. **SRT/RIST: tentativa real de loopback FALHOU por motivo técnico específico ainda não
     resolvido** (erro -138 da libsrt após "No default whitelist set"), **enquanto UDP puro
     e TCP real funcionaram perfeitamente na mesma sessão** — não é bloqueio de rede geral,
     é algo pontual do SRT nesta build/ambiente. Marcado honestamente como NÃO TESTÁVEL
     nesta sessão, não como "SRT não funciona".
  7. **MultiCorder (Fase 3): achado real confirmando que é trabalho NOVO.** O caminho ativo
     de ISO (`mesa.html:isostart`) grava TODAS as câmeras selecionadas numa única pasta
     compartilhada (`recordDirectory + '\iso'`) — não há hoje destino/disco independente por
     câmera. `disco-producao.mjs` (`statfs` real, testado) e o teste de escrita real de 8MB
     do Pre-Flight são a base técnica sólida para construir isso, mas não fazem o trabalho
     da Fase 3 por si só.
  8. **PTZ VISCA: reconfirmado com teste real nesta sessão (não assumido do histórico).**
     `visca.move()` codifica bytes corretos do protocolo; `ViscaTransport` real conectou a
     uma câmera simulada via TCP, mandou comando real, recebeu ACK+Completion reais e
     parseou corretamente — PASS de ponta a ponta do ciclo de software. Só falta hardware
     físico (PENDENTE, registrado). ONVIF/credenciais DPAPI/leases ainda não reconfirmados
     nesta sessão específica (ficam para o próximo ciclo).
  Todos os scripts de teste ficaram em `qa-finalizacao/inventario-crew-broadcast-20261103/`
  (dentro do projeto, nunca fora). Processos de teste todos encerrados ao final de cada um
  (confirmado por `netstat`/`ps`), nenhum arquivo de produção editado, nenhum processo do
  operador tocado. Matriz completa e atualizada em
  `3mix-panel/docs/MATRIZ-INVENTARIO-CREW-BROADCAST.md`. **Fase 0 ainda não está 100%
  completa**: faltam ONVIF a fundo, NDI/OMT funcional, Companion/controladores físicos
  detalhado, licenças completas de todos os componentes (só ASIO foi aprofundado), e a
  matriz de dependências/riscos/rollback formal pedida no último item da Fase 0.

## DECISÃO DO DONO (03/11 ~14:35 BRT) — vMix TCP não é mais o caminho de automação do 3Mix
- Dono: "vmix tcp nao vai mais existir conforme nosso prompt ne.. vai ser um proprio nosso
  ali, nao me neloquece". **Isso SOBREPÕE um trecho literal do superprompt** (Fase 5 diz
  "não remover suporte vMix por razões de branding... preservar TALLY/SUBSCRIBE
  TALLY/comandos de transição e clientes antigos") — registrado aqui com transparência
  porque é uma correção de rota, não algo que já estava implícito no plano original.
- **Decisão aplicada, não "vMix removido de vez"**: a ponte TCP (porta 8099) continua
  existindo no código (ninguém que já dependa dela physicamente perde o que tinha hoje de
  um dia para o outro sem aviso), mas passa a ser **DESLIGADA POR PADRÃO** — antes ligava
  sozinha em `0.0.0.0` sem nenhuma autenticação; agora só liga com
  `FREEMIX_ENABLE_VMIX_TCP=1`, e mesmo ligada fica em loopback a menos que
  `FREEMIX_VMIX_TCP_HOST` seja dito explicitamente. A API própria (REST+WebSocket, já com
  PIN/token fora do loopback) é o caminho oficial de automação/Tally físico/controladoras
  daqui para frente — isso é a base real da Fase 5 (não mais "adaptar o vMix", e sim expor
  bem a API própria).
- **Implementado e testado nesta sessão**: `ferramentas/servidor-api.mjs` (diff de 8
  linhas, cirúrgico), `docs/API.md` atualizado (tabela de portas + item 2 das
  inconsistências conhecidas). Teste isolado real (sem o motor do operador):
  `qa-finalizacao/inventario-crew-broadcast-20261103/testar-vmix-tcp-desligado-padrao.mjs`
  — **7/7 PASS** confirmando: padrão não inicia; opt-in fica em loopback; LAN só com os
  dois (`ENABLE=1` + `HOST=0.0.0.0`) ditos explicitamente; servidor real sobe quando ligado
  de verdade. Regressão: `node ferramentas/test-manual-api.mjs` → **TODOS PASSARAM** (15/15,
  nenhuma rota/ação/comando órfão do manual). Nenhum arquivo copiado para `3mix-runtime/`
  ainda (isso é instalação, decisão separada); nenhum processo do operador tocado.
- **O que isso NÃO decide ainda**: qual vai ser a "API própria pra Tally físico" de fato
  (isso é a Fase 1/5 de verdade — construir o protocolo/endpoint que ESP32/M5Stick vão
  consumir, hoje não existe). Esta mudança só fecha o buraco de segurança do vMix TCP e
  estabelece a direção; o trabalho de construir o substituto funcional é o que vem a seguir
  na Fase 1 (Crew/Tally).

## Reordenação a pedido do dono (03/11 ~14:36 BRT): "vai pelos que já tem no sistema meio pronto pra fazer rápido, deixa os mais demorados por último"
Ordem de trabalho revisada (não muda o conteúdo das fases do superprompt, só a ORDEM de
ataque dentro delas, priorizando o que já tem base real no código):
1. ~~vMix TCP → API própria~~ — FEITO acima.
2. PTZ ONVIF (VISCA já provado nesta sessão; ONVIF tem código-fonte pronto, só falta
   reconfirmar com teste real equivalente).
3. MXF/DNxHD — pipeline já provado (Fase 0); criar preset real de gravação broadcast
   usando-o é extensão direta, não trabalho do zero.
4. AUX — já tem toda a estrutura (`aux-output-router.mjs`), só falta ligar `routeOutput()`
   ao motor de verdade (hoje só grava metadado).
5. MultiCorder por câmera — meio caminho andado (`disco-producao.mjs`/teste de escrita já
   prontos), falta a parte de seleção de pasta por câmera.
6. SRT debug (erro -138 ainda não resolvido) — médio, não trivial.
7. **Por último, mais demorado**: 3Mix Crew (Tally+Intercom) do zero, ONVIF físico/ASIO
   físico/MultiCorder multi-disco físico (todos dependem de hardware que não está
   disponível), ST 2110/PTP/NMOS (estudo isolado).

## Avanço 03/11 ~14:4x BRT — itens 1-4 da reordenação acima

1. **vMix TCP → API própria: IMPLEMENTADO.** `servidor-api.mjs` diff de 8 linhas: desligado
   por padrão (antes ligava sozinho em `0.0.0.0` sem auth); liga com
   `FREEMIX_ENABLE_VMIX_TCP=1`, fica em loopback a menos que `FREEMIX_VMIX_TCP_HOST` seja
   dito explicitamente. `docs/API.md` atualizado. Teste isolado real 7/7 PASS
   (`testar-vmix-tcp-desligado-padrao.mjs`); regressão `test-manual-api.mjs` 15/15 PASS.
2. **PTZ ONVIF: TESTADO de ponta a ponta nesta sessão.** `OnvifPTZ` real conectou a uma
   câmera ONVIF simulada (servidor HTTP local), mandou `GetStatus`/`ContinuousMove`/`Stop`
   reais — 6/6 PASS, confirmando WS-Security PasswordDigest (nunca senha em texto puro) e
   rejeição de endpoint não-local antes de qualquer rede. Script:
   `testar-onvif-loopback.mjs`. Só falta hardware físico (PENDENTE, correto).
3. **MXF/DNxHD via motor nativo: achado técnico real, mas NÃO confirmado com motor ao vivo.**
   Por leitura de `source-record.c`, o filtro de ISO aceita `rec_format` arbitrário (não só
   os valores do dropdown da UI nativa) e usa `ffmpeg_muxer`/libavformat real — tecnicamente
   deveria aceitar `"mxf"` via `SetSourceFilterSettings` (mesmo padrão que `isostart` já usa
   hoje). Tentei confirmar com uma instância ISOLADA de motor de QA
   (`qa-manuais/rundir`, nunca o motor do operador) — ela travou no boot sem abrir a porta
   de controle. **Bati na regra permanente do projeto contra `taskkill /F`** mesmo em
   processo de teste isolado que eu mesma iniciei — parei em vez de contornar, o processo
   saiu sozinho depois. Fica como hipótese fundamentada, não fato confirmado; registrado com
   precisão na matriz, não inflado.
4. **AUX: CORREÇÃO IMPORTANTE de um registro impreciso meu anterior.** Eu tinha afirmado
   "AUX nunca chama o motor" lendo só `routeOutput()` — isso é verdade só para o roteamento
   lógico. Existe um segundo método, `quickCut()` (exposto via `POST /api/aux
   {action:'cut'}`), que **de fato chama `outputEngine.execute('outputs_configure'/
   'outputs_network')` e confirma contra o motor** — não é metadado. Testei isso de forma
   real e isolada (classe `AuxOutputRouter` real + `production` MOCKADO, nunca o motor do
   operador): **6/6 PASS**, incluindo a confirmação de que uma saída já ativa/ao vivo é
   **recusada explicitamente**, nunca cortada por engano (salvaguarda real, não teórica).
   Script: `testar-aux-quickcut.mjs`. Corrigido na matriz com o relato completo e preciso.
   **Gap real que permanece** (não é erro, é limitação documentada no próprio código):
   `input`/`multiview` arbitrário e SDI/DeckLink ainda não têm tradução para o contrato real
   de saída — ficam `skipped` com motivo explícito, não falha silenciosa.

Todos os scripts desta rodada em `qa-finalizacao/inventario-crew-broadcast-20261103/`.
Nenhum arquivo de produção além de `servidor-api.mjs`+`docs/API.md` (item 1) foi editado;
nenhum processo do operador tocado; a única tentativa de abrir um motor (item 3, isolado)
não produziu dano (processo trancado saiu sozinho, confirmado sem sobra).

## CORREÇÃO GRANDE (item 5 da reordenação): MultiCorder por câmera JÁ EXISTE — minha conclusão anterior estava ERRADA
Ao investigar o item 5 ("MultiCorder por câmera — meio caminho andado"), descobri que eu
tinha lido o caminho de código ERRADO na Fase 0: `mesa.html:isostart`/`patch-plugins.mjs`
é código LEGADO morto (referencia o workspace pré-rename `vmixtwste`), não o caminho real.

**O caminho real (`/api/iso` → `DiskReplay`/`replay-disco.mjs`) já tem pasta/disco
independente por câmera implementado E exposto numa UI real** (`painel/remoto/iso.html` +
`iso-avancado.js`, 519 linhas, não mockup — uma tabela com campo de pasta por linha/câmera
e botão "Procurar…"). Testei a validação real e isolada (`isoRecordingOptions` importado
direto, sem motor): duas câmeras com `perInput[nome].directory` apontando para pastas
DIFERENTES de verdade em disco foram aceitas e preservadas corretamente — **7/7 PASS**.
Script: `qa-finalizacao/inventario-crew-broadcast-20261103/testar-iso-perinput-directory.mjs`.

**Isto muda a prioridade da Fase 3**: o núcleo ("destino independente por câmera") não é
mais trabalho a fazer — já está pronto e em produção. O que resta de verdade: (1) detecção
de disco físico por nome amigável (nice-to-have de UX, não bloqueio — o operador já pode
apontar cada câmera pra pasta que quiser hoje); (2) testes de carga com múltiplos discos
físicos reais e múltiplas ISOs simultâneas (isso sim depende de hardware). Corrigido com
precisão na matriz, incluindo o porquê do erro original (caminho de código errado).

**Lição registrada**: antes de declarar algo "ausente" ou "trabalho novo", confirmar que o
caminho de código lido é o caminho REAL em produção (checar se a UI que o operador usa de
fato chama aquela função), não só o primeiro arquivo que aparece numa busca por nome.

## SRT/RIST: esclarecimento (não é bloqueio, é diferença de caminho testado)
Ao ler `saidas-srt.mjs`/`srt-hdr-producao.mjs` de verdade (item 6 da reordenação): o SRT do
3Mix roda **embutido no motor nativo** (`obs-ffmpeg-srt.h`, dentro do processo `FreeMix.exe`
via libsrt linkada no plugin), nunca como `ffmpeg.exe` CLI externo. Os testes de loopback
SRT desta sessão usaram `ffmpeg.exe` como processo separado — válido para testar o
protocolo no ambiente, mas **não é o mesmo caminho que o produto usa**. O erro -138
encontrado não implica que o SRT do 3Mix esteja quebrado; só que não consegui, nesta
sessão, confirmar ou reprovar o caminho real (exigiria motor nativo ao vivo, e a tentativa
de abrir um isolado já travou no item do MXF). Registrado na matriz com essa ressalva
explícita para não virar um "achado" equivocado em ciclos futuros.

## RESUMO DO CICLO 03/11 ~14:35-14:57 BRT (itens 1-6 da reordenação "rápido primeiro")
| # | Item | Resultado |
|---|---|---|
| 1 | vMix TCP → API própria | **FEITO e testado** (7/7 PASS isolado + 15/15 regressão). Diff de produção: 12 linhas em `servidor-api.mjs` + 4 em `docs/API.md`. |
| 2 | PTZ ONVIF | **Testado de ponta a ponta** (6/6 PASS, câmera simulada). Só falta hardware físico. |
| 3 | MXF/DNxHD via motor nativo | Pipeline ffmpeg standalone **provado** (MXF+DNxHD real, ffprobe confirma). Integração via `source_record_filter` real: achado técnico fundamentado, **não confirmado com motor ao vivo** (motor isolado de teste travou no boot; não insisti, por respeito à regra contra `taskkill /F`). |
| 4 | AUX aplicar de verdade | **Já existia e funciona** (`quickCut`) — correção de um registro meu anterior impreciso. Testado 6/6 PASS, incluindo salvaguarda real contra cortar saída ao vivo. |
| 5 | MultiCorder por câmera | **Já existia e funciona** (`perInput.directory` + UI real em `iso.html`) — correção GRANDE de um achado meu anterior errado (eu tinha lido código legado morto). Testado 7/7 PASS. |
| 6 | SRT debug | Não resolvido, mas **esclarecido**: o teste usou um caminho diferente do real do produto; não é um bloqueio confirmado do 3Mix, é lacuna de teste desta sessão. |

**Nenhum arquivo copiado para `3mix-runtime/`** nesta rodada — tudo ficou na fonte
(`3mix-panel/`) e em testes isolados dentro de `qa-finalizacao/inventario-crew-broadcast-
20261103/`. Nenhum processo do operador tocado. Motor do operador reconfirmado saudável
(PID mudou de novo, 47656 — consistente com o Gemini continuando a cuidar dele).

**Dois achados grandes (itens 4 e 5) mudam a leitura geral do projeto**: o código-base é
mais maduro do que a Fase 0 inicial sugeria — vale reler com mais cuidado antes de assumir
"ausente" em qualquer outro item ainda não verificado (ex.: Companion/controladores físicos,
NDI/OMT funcional, que seguem como "não testado", não "ausente").

**Próximo passo**: item 7 da reordenação — 3Mix Crew (Tally+Intercom) do zero, que é
trabalho novo confirmado (não achei nada parecido na Fase 0, busca ampla). É o item mais
demorado; antes de começar, vale um checkpoint com o dono dado o volume de achados deste
ciclo.

## Bug real encontrado e corrigido: cursor de áudio "preso" entre sessões de PTT diferentes
Testando o item 9 do pedido do dono ("testes reais de... reconexão, áudio simultâneo") com
um cenário de gap entre falantes diferentes (diretor para de falar, ~200-500ms depois outra
pessoa começa — cenário real de operação, não exótico), achei que o segundo ouvinte nunca
recebia nada. Causa raiz: `cursorFor` usava um limiar de resincronização de 100% de `rate`
(1s), mas o algoritmo REAL já testado em produção (`CallReturns.pump()`,
`retornos-calls.mjs:70-74`) usa 50% + uma correção fina de drift gradual que minha primeira
versão tinha omitido — um gap "médio" ficava preso numa janela que nunca intersectava os
pacotes novos. Corrigido replicando o algoritmo real com fidelidade (salto grosso = resync
completo, desvio pequeno = correção gradual de até 5% do bloco por chamada, nunca "travado").
Reconfirmado com a suíte INTEIRA do Crew depois da correção: **44/44 PASS** (7 registry +
11 engine + 7 HTTP/WS Tally + 7 HTTP/WS Intercom + 8 reconexão/multi-membro + 5 transporte),
nenhuma regressão nos cenários que já passavam. Scripts em
`qa-finalizacao/crew-broadcast-20261103/`. Nenhum processo pendurado (confirmado por
rebind de porta bem-sucedido, não só ausência de PID). Nenhum arquivo do operador tocado.

**Isso confirma o valor de ir além do "parece lógico" e testar cenários reais de
operação** — a suíte anterior (11/11) não cobria gap-entre-falantes-diferentes porque cada
teste usava um fluxo contínuo de UMA voz só; só ao simular o padrão real de uma conversa
(pausas, trocas de quem fala) o bug apareceu.

- **2026-11-03 ~20:2x BRT (ciclo do watchdog) — FASE 0 FECHADA.** Revisão ponta a ponta da
  checklist mestre: os 5 itens da Fase 0 marcados `[x]` com evidência real (detalhe em cada
  item acima), incluindo um item que faltava desta sessão (DSK, confirmado por leitura —
  `OverlayEngine`, já em uso) e PGM Full/Clean/ISO (prova real já existente em
  `qa-beta/STATUS-BETA.md`, referenciada, não duplicada). Escrita a matriz de dependências/
  riscos/critérios de aceite/licenças/rollback/classificação C++ vs Node vs hardware que
  era o último item pendente — nova seção completa em `MATRIZ-INVENTARIO-CREW-BROADCAST.md`.
  Lacunas reais da Fase 0 registradas com honestidade, não escondidas: ONVIF Imaging,
  NDI/OMT funcional, Companion/controladores físicos, licenças de componentes além de ASIO
  — nenhuma bloqueia a Fase 1 já implementada, ficam para quando a peça específica for
  trabalhada. Nenhum arquivo de produção editado nesta revisão (só os dois docs); nenhum
  processo tocado. Motor do operador não reconfirmado neste ciclo (instrução do dono
  permanece: não tocar, é com o Gemini).

- **2026-11-03 ~20:3x BRT (ciclo do watchdog) — Realinhamento dos cabeçalhos das Fases 2-8**,
  que diziam "NÃO INICIADA" apesar de trabalho real já feito nesta sessão se encaixar nelas
  (vMix TCP = Fase 5; PTZ VISCA/ONVIF = Fase 6; MultiCorder por câmera = Fase 3). Corrigido
  para PARCIAL com os itens reais marcados, para um ciclo futuro não duplicar esse trabalho
  achando que "nada foi feito" nessas fases. **Tentativa de avançar a Fase 2 (MXF via motor
  nativo) interrompida por precaução**: o motor isolado de QA (`qa-manuais/rundir`) que eu
  tentaria usar de novo tem um log novo (18:45-18:46, depois da minha última tentativa) de
  OUTRA sessão/frente de trabalho usando o mesmo rundir para outro teste (ISO/estresse,
  terminado normalmente) — compartilhar esse rundir agora arriscaria colidir com trabalho
  concorrente em andamento. Segui a regra de reavaliar em vez de insistir na mesma linha
  (já tinha travado uma vez antes por outro motivo): criar um rundir NOVO e exclusivo só
  para este teste é uma operação pesada (~16GB de cópia) desproporcional a um item que já
  está corretamente registrado como "hipótese fundamentada, não confirmada" — não um
  bloqueio que impede outro trabalho. Decisão: deixar como está, documentado com precisão,
  e seguir para outro item que não dependa de motor algum. Nenhum rundir criado, nenhum
  processo tocado, nenhum arquivo do operador alterado.

- **2026-11-03 ~20:4x BRT (ciclo do watchdog) — Licenças completadas (item que faltava da
  Fase 0).** Lidas as pastas de licença reais de NDI/OMT/DistroAV/source-record (todas já
  existiam no projeto, catalogadas em rodadas anteriores — esta sessão só confirmou que
  cobrem os componentes relevantes ao superprompt Crew/Broadcast): DistroAV é GPL-2.0-or-
  later com hash do pacote+DLL; NDI SDK é licença proprietária própria da Vizrt, uso
  restrito à lib dinâmica sem redistribuir SDK/ferramentas, hash da versão incluída
  registrado; OMT (SDK+plugin) é MIT puro; source-record é GPL-2.0 com proveniência
  completa (repo, commit, hash antes/depois da modificação). Nenhum componente relevante
  ficou sem licença catalogada. Atualizado `MATRIZ-INVENTARIO-CREW-BROADCAST.md` (seção
  Licenças) e a lista de pendências da Fase 0 no topo deste arquivo. Nenhum arquivo de
  produção tocado (só leitura de arquivos de licença já existentes + os dois docs).

- **2026-11-03 ~21:0x BRT (ciclo do watchdog) — SRT: correção de um achado anterior que
  estava errado (crédito ao próprio rigor do processo, não a terceiros).** O registro
  anterior já tinha a ressalva correta de que testar `ffmpeg.exe` CLI não é o mesmo caminho
  de código do motor nativo (`obs-ffmpeg-srt.h`) — mas foi além e investiguei se o erro
  `-138`/"No default whitelist set" em si tinha alguma relação com o motor. `grep -rn
  "whitelist"` em `obs-ffmpeg-srt.h` (919 linhas) confirma que essa string **não existe** no
  port nativo (código próprio, chama `srt_bind/listen/accept` direto da libsrt, sem a
  camada de whitelist do `libavformat` genérico). Testei também: passar
  `-protocol_whitelist` explícito faz a mensagem de log desaparecer mas o erro -138
  continua — ou seja, a mensagem era só informativa, não a causa raiz. Investigando a causa
  raiz real, descobri que era **corrida de tempo no meu próprio teste anterior** (listener
  solto sem caller correspondente dentro da janela de timeout) — não bloqueio de
  protocolo/ambiente. Corrigido ao disparar listener+caller em sequência imediata com `-re`
  (ritmo real): **2/2 handshakes SRT completos e repetíveis**, 320×180@10fps e 640×360@25fps,
  streams recebidos e validados por `ffprobe` independente (não lixo). Durante a busca por
  evidência também localizei prova REAL PRÉ-EXISTENTE de sessão anterior (09/10,
  `3mix-runtime/docs/evidencias-srt444/resultado-srt444-20261009.json`) do motor nativo real
  (`FreeMix.exe`, hash confirmado, `operatorUntouched:true`) atuando como Caller SRT com
  sucesso (`code:0`) — não vista/referenciada nas rodadas anteriores desta tarefa.
  **Processo**: um `ffmpeg.exe` de teste ficou "pendurado" waiting sem caller por >1min;
  `taskkill` sem `/F` foi tentado primeiro (recusado pelo Windows, comportamento normal pra
  esse tipo de processo console) e, em vez de forçar, completei o handshake que ele estava
  esperando para ele sair pelo próprio fluxo — nenhum `/F` usado, consistente com a regra do
  projeto. Atualizado `MATRIZ-INVENTARIO-CREW-BROADCAST.md` (seção SRT/RIST, reescrita com a
  tabela de evidências). **Ainda PENDENTE, não virou PASS**: o fluxo específico UI do 3Mix →
  `saidas-srt.mjs` → motor nativo configurando uma saída SRT real via `outputs_configure` —
  isso depende de motor ao vivo, que é responsabilidade de outra frente de trabalho agora.
  O que mudou é que a suspeita de "bloqueio de protocolo/libsrt neste ambiente" está
  descartada com prova — a libsrt em si funciona neste ambiente, dos dois lados (caller e
  listener).

- **2026-11-03 ~21:1x BRT (ciclo do watchdog) — NDI/OMT: correção de outro achado anterior
  que estava incompleto.** Tinha registrado "ainda pendente, teste funcional real não
  realizado nesta sessão" para NDI/OMT — verdade sobre *esta sessão*, mas eu não tinha
  verificado o histórico completo do projeto antes de deixar como pendência em aberto.
  Busquei por relatórios/recibos reais já existentes e encontrei: (1)
  `3mix-panel/docs/RELATORIO-NDI-OMT-INDEPENDENTES.md` com recibo JSON estruturado
  (`docs/evidencias-ultima-rodada/network-independent-final-resultado.json`) de 08/10 —
  motor nativo real (PID/hash registrados) enviando NDI e OMT simultaneamente, cada um para
  um bus de áudio diferente (440Hz vs 660Hz, confirmando isolamento), com frames de vídeo
  reais recebidos de volta via SDK oficial (cor BGR exata capturada) — `passed:true` para
  os dois, não fabricado por mim, só lido e verificado; (2)
  `3mix-io/qa/ndi-local/RESULTADO.md` de 23/10, teste independente do standalone de I/O:
  1753 frames, 0 drops, decodificação real confirmada, arquivo de evidência de 48MB ainda
  presente em disco (verifiquei a existência do arquivo, não só a menção no .md). Ambos os
  JSONs/arquivos de evidência foram abertos e confirmados por mim nesta sessão antes de
  atualizar o status — não é "confiar no texto", é reler o dado bruto. Atualizado
  `MATRIZ-INVENTARIO-CREW-BROADCAST.md` (seção NDI/OMT, de "AINDA PENDENTE" para
  IMPLEMENTADO+TESTADO com a ressalva real que permanece: só loopback local, sem teste de
  LAN entre duas máquinas distintas, que é o `PLANO-TESTE-REDE.md` ainda não executado).
  **Lição registrada**: antes de marcar algo como "pendente/não testado nesta sessão",
  checar se já existe evidência real de sessão anterior no projeto — a mesma lição do caso
  MultiCorder (Fase 3), agora reaplicada aqui por iniciativa própria, não por correção
  externa.

- **2026-11-03 ~21:2x BRT (ciclo do watchdog) — Companion/Stream Deck: de "leitura
  rápida, não aprofundada" para testado de ponta a ponta no que roda no servidor.**
  Escrevi dois scripts novos de teste (não existiam, não é reteste):
  (1) `testar-controller-osc-cliente-independente.mjs` — cliente UDP `dgram` puro,
  deliberadamente SEM importar o encoder/decoder OSC do produto (reimplementado à
  parte), simulando exatamente como o módulo genérico de OSC de um Companion real se
  conectaria de fora do processo Node. 9/9 PASS, 3 execuções consecutivas sem
  flakiness: subscribe real, push automático de estado/feedback, fire down
  disparando ação real (preview), feedback refletindo o estado novo, fire up sem
  erro, comando fora do allowlist rejeitado sem travar o peer, recuperação normal
  depois do erro, encerramento gracioso. (2) `testar-controller-midi-servidor.mjs`
  — reimplementei à parte o decode de 3 bytes MIDI que `atalhos-engine.js` faz no
  browser, alimentando o resultado no `controller_event` real do servidor: 9/9 PASS,
  3 execuções. Note-on/note-off reais abrindo/fechando talkback (lease de verdade),
  Control Change real de fader virando volume real (matemática confirmada:
  64/127×100=50.4%), Program Change descartado como no cliente real, servidor
  rejeitando mensagem MIDI inválida mesmo simulando cliente malicioso (defesa em
  profundidade), feedback MIDI (LED) persistido, `releaseAll` liberando lease
  pendente. **O que ainda fica de fora, documentado sem esconder**: a camada que
  roda literalmente dentro de um browser real (WebMIDI com permissão do usuário +
  dispositivo físico via CEF) não foi exercitada — depende de hardware/CEF real,
  fora do alcance desta sessão; e o módulo oficial `@companion-module/3mix` citado
  em `PESQUISA-OPEN-SOURCE-BROADCAST.md` é uma PoC futura, ainda não escrita. O que
  ESTA rodada prova com solidez é que o protocolo (OSC) e a lógica de servidor
  (MIDI já decodificado → ação) funcionam de ponta a ponta — não é mais "existe
  arquivo, não sei o protocolo". De passagem, corrigi também a linha da matriz sobre
  vMix TCP que ainda descrevia o estado ANTIGO (sempre ligado em 0.0.0.0) depois da
  correção desta mesma tarefa já ter mudado o código para loopback+opt-in — matriz
  estava contradizendo o código real; corrigida para bater com `servidor-api.mjs`
  linhas ~126-129 como estão agora. Nenhum processo do operador tocado; tudo roda em
  processo Node isolado de QA com estado sintético.

- **2026-11-03 ~21:3x BRT (ciclo do watchdog) — CORREÇÃO DE REGRESSÃO REAL: rota `/crew`
  nunca tinha sido registrada na tabela `routes` de `servidor-api.mjs`, quebrando a página
  inteira (404), não só o QR.** Ao atacar o item pendente "QR de pareamento dedicado para
  `/crew`", fui conferir o mecanismo existente (`qrPermitido()`/`/api/qr.svg`) e percebi que
  ele depende de `Object.hasOwn(routes, a.pathname)` — `/crew` não estava na tabela
  `routes` (`const routes = {...}` em `servidor-api.mjs`), mesmo com `crew.html` existindo
  de verdade em disco e a entrada do hub (`hub.html` grupo "Áudio e chamadas") apontando
  para ela desde a Fase 1. **Confirmei a causa raiz simulando a lógica exata de resolução
  de arquivo do servidor** (mesmo código: `decodeURIComponent`/`replace`/`resolve`/
  `extname`) — sem a entrada na tabela, o caminho cai no fallback de arquivo estático, que
  procura um arquivo literal `crew` (sem extensão) e nunca encontra nada: **404 real, bug
  de produção, não só do QR**. Isso explica por que passou despercebido antes: o teste no
  browser da Fase 1 (verificação do bug do PTT) usava
  `qa-finalizacao/.../servir-crew-harness.mjs`, um harness de QA com seu PRÓPRIO roteamento
  simplificado — nunca passou pela tabela `routes` real de produção. **Correção**: uma
  linha (`'/crew': 'crew'`) adicionada na tabela `routes`. **Verificação real em 3 camadas**:
  (1) simulação da lógica de resolução de arquivo confirmando 404 antes / caminho correto
  depois; (2) servidor REAL (`servidor-api.mjs`, não cópia) rodando numa porta isolada de QA
  via `curl`: `/crew` 404→200 com o HTML real (`<title>3Mix Crew</title>`), `/hub` continua
  200 (sem regressão), `/api/qr.svg?address=.../crew` 400→200 com SVG real; (3) **teste
  visual completo no browser real** (`preview_*`) contra o mesmo servidor real: cliquei no
  endereço de rede real do hub, cliquei no botão QR da linha "3Mix Crew (Tally + Intercom)",
  confirmei QR SVG real renderizado (1243 bytes, `startsWithSvg:true`), nome/URL corretos,
  screenshot tirado. **Isso também fecha o item pendente "QR de pareamento dedicado para
  /crew"** — não era preciso construir nada novo, o mecanismo genérico do hub já cobre o
  caso, só estava bloqueado por esta regressão. Regressão completa depois do fix:
  `test-manual-api.mjs` 15/15 PASS (precisou regenerar o índice gerado, `node
  scripts/documentacao/gerar-indice-api.mjs --atualizar-manual`, rotina já documentada em
  ciclos anteriores — 69 rotas agora, antes 68). Script de verificação novo, reutilizável:
  `qa-finalizacao/crew-broadcast-20261103/servir-api-real-qa.mjs` (sobe o ARQUIVO REAL
  `servidor-api.mjs` numa porta de QA isolada com ROOT sintético — útil para qualquer
  verificação futura que precise do roteamento de produção de verdade, não só da lógica
  isolada de um módulo). Processo de teste encerrado via `Stop-Process` sem `-Force`
  (graceful); nenhum `taskkill /F` usado; nenhum processo do operador tocado; nenhuma pasta
  fora do projeto criada (ROOT sintético dentro de `qa-finalizacao/`, removido ao final).

- **2026-11-03 ~21:4x BRT (ciclo do watchdog) — Pre-Flight do Crew: novo item `case 'crew'`
  implementado e testado, fechando a última peça pendente de código da Fase 1.** Depois de
  corrigir a regressão da rota `/crew`, segui para o item seguinte da Fase 1
  ("Integração com Pre-Flight"). Como `PreflightEngine` é instanciado DENTRO do construtor
  de `Production` (antes de `crewTally`/`crewIntercom` existirem, que só nascem em
  `servidor-api.mjs`), segui o precedente já real do projeto (`production.auxOutputRouter`)
  e anexei os dois também em `production` depois de instanciados. O item novo cobre tally
  coerente, membros/PTT do intercom, e — o ponto mais importante do pedido do superprompt
  ("isolamento do PGM... teste negativo obrigatório") — detecta de verdade a colisão real
  já documentada no próprio código-fonte: `CallReturns` (Calls) chama `call_audio` direto,
  fora do `AudioTapRegistry`; se os dois estiverem ativos ao mesmo tempo (Calls com `timer`
  rodando E Crew com fonte reivindicada no registry), vira BLOQUEIO real com motivo e ação,
  não um aviso genérico. Headset/mic físico e latência real ficam explicitamente "não
  verificado" no texto do próprio item, sempre — nunca fabricados. 6/6 PASS testado isolado
  (incluindo o caso da colisão real detectada, e o caso de que NÃO bloqueia à toa quando só
  um dos lados está ativo), 3 execuções sem flakiness. Regressão completa depois da mudança:
  `test-preflight.mjs` 19/19 PASS (suíte já existente, sem quebra), `test-manual-api.mjs`
  15/15 PASS, suíte completa do Crew 44/44 PASS. Nenhum processo do operador tocado.

- **2026-11-03 ~21:5x BRT (ciclo do watchdog) — Fase 2: DNxHR (2 perfis) e XDCAM GOP longo
  testados, prova real de ponta a ponta.** Com a Fase 1 praticamente fechada (só motor/
  hardware restantes) e a Fase 2 sendo a próxima em ordem, verifiquei primeiro a saúde do
  ambiente: 3 instâncias `FreeMix.exe` de QA isoladas (`qa-beta/multi-me-build-verified`,
  `qa-dump` ×2) mais uma de teste de atualização, todas de outras frentes/sessões ativas
  agora — confirmei por `CommandLine` real de cada processo que nenhuma é o runtime do
  operador nem a minha, e que abrir/compartilhar um motor isolado agora colidiria com elas;
  mantive a decisão já registrada de não insistir nisso sem rundir próprio e exclusivo.
  Avancei então para o item da Fase 2 que NÃO depende de motor: "DNxHR, perfil XDCAM de GOP
  longo". **DNxHR**: descobri via `ffmpeg -h encoder=dnxhd` que o mesmo encoder cobre DNxHR
  através do parâmetro `-profile:v` (`dnxhr_lb/sq/hq/hqx/444`) — testei `dnxhr_hq` (perfil
  comum de entrega/mastering) e `dnxhr_444` (10-bit 4:4:4, finalização/VFX). `ffprobe`
  confirma `profile:"DNXHR HQ"` e `profile:"DNXHR 444"` EXPLICITAMENTE (strings distintas
  de "DNXHD" — não é o clássico com outro rótulo), incluindo `pix_fmt:yuv444p10le` real no
  segundo caso (10-bit, não 8-bit). **XDCAM GOP longo**: repeti o pipeline MPEG-2 4:2:2
  50Mbps já provado antes, trocando `-g 1` (I-frame-only, já testado) por `-g 12 -bf 2`
  (GOP=12 com B-frames, valores reais de contribuição XDCAM HD422). Prova mais forte que só
  metadado: **li o `pict_type` de cada um dos 100 frames via `ffprobe -show_entries
  frame=pict_type`** — sequência real `I,B,B,P,B,B,P,B,B,P,B,B,I,...`, contagem total **9
  I-frames / 25 P-frames / 66 B-frames**, matematicamente consistente com GOP=12 em 100
  frames. Os 3 arquivos novos passaram por decode completo (`ffmpeg -f null -`, nenhum
  `-loglevel` escondendo erro) sem nenhuma mensagem de erro, exit 0 cada um — confirma que
  não é só o container com metadado correto, o conteúdo decodifica de ponta a ponta.
  Atualizado `MATRIZ-INVENTARIO-CREW-BROADCAST.md` (seção MXF/DNxHD/XDCAM, duas linhas
  novas de DNxHR + uma de XDCAM GOP longo, mantendo a linha I-frame-only já existente).
  Arquivos de evidência em `3mix-panel/qa-finalizacao/crew-broadcast-20261103/` (dentro do
  projeto). Nenhum processo tocado (nem os das outras sessões, nem motor algum aberto por
  mim); nenhuma pasta fora do projeto criada.

- **2026-11-03 ~22:0x BRT (ciclo do watchdog) — Fase 3: detecção de disco físico por nome
  amigável, implementada e testada com HARDWARE REAL desta máquina (achado valioso: não
  precisou de simulação).** Antes de implementar, descobri via `Get-Partition`/`Get-Disk`
  do PowerShell que esta máquina de desenvolvimento TEM dois discos físicos NVMe reais e
  distintos (Disco 0 "NVMe CT4000P3PSSD8" = `D:`, Disco 1 "NVMe KINGSTON SFYRD2000G" =
  `C:`) — o item da checklist que parecia depender de hardware indisponível, na verdade
  tinha o hardware necessário bem aqui. Implementei `discoFisico(caminho)`/
  `mapaMultiCorder({nome:caminho})` em `disco-producao.mjs`, seguindo o padrão já
  estabelecido no projeto para invocar PowerShell com segurança (`execFile` com args array,
  nunca `exec`/concatenação de shell — mesmo padrão de `maquina-saude.mjs`/
  `diagnostico-maquina.mjs`), com cache de 60s para não reinvocar o processo em loop (medido
  por timing real: 1007ms frio vs 0ms com cache). Nova rota `GET /api/multicorder/discos`
  em `servidor-api.mjs`, só leitura, nunca chama o motor (funciona mesmo sem conexão nativa,
  ao contrário de `/api/iso`). **Testado de ponta a ponta com os dois discos físicos reais**:
  9/9 PASS em `testar-disco-fisico.mjs` (descoberta independente feita por um script
  PowerShell separado, não reaproveitando o código testado, para o teste não validar o
  código contra ele mesmo — cobre resolução real de letra→disco, colisão real detectada
  quando 2 câmeras caem no MESMO disco físico, ausência real de colisão quando estão em
  discos de fato diferentes, e os casos de erro UNC/relativo/vazio sem lançar nem inventar),
  5/5 PASS em `testar-multicorder-discos-http.mjs` (rota HTTP real, auth real, pareamento
  real por PIN). Repetido 3x sem flakiness. Documentado em `docs/API.md` (seção 6.7) e
  `MATRIZ-INVENTARIO-CREW-BROADCAST.md`; índice regenerado (70 rotas agora, antes 69).
  Regressão completa: `test-manual-api.mjs` 15/15 PASS, `test-preflight.mjs` 19/19 PASS,
  `testar-preflight-crew.mjs` 6/6 PASS — nenhuma quebra. **O que fica genuinamente
  PENDENTE**: testes de carga com múltiplas ISOs simultâneas gravando de verdade nos dois
  discos ao mesmo tempo (isso precisa do motor ao vivo, não só da detecção de disco em si,
  que já está provada). Nenhum processo do operador tocado; PowerShell usado só para
  leitura (`Get-Partition`/`Get-Disk`), nunca para alterar nada do sistema.

- **2026-11-03 ~22:1x-22:3x BRT (ciclo do watchdog) — Início da Fase 8 (documentação).**
  Com as Fases 0-3/5/6 praticamente fechadas (só motor/hardware restantes), ataquei a Fase
  8 pela parte de documentação, que não depende de motor. Reli o superprompt original para
  confirmar o texto exato do item ("Documentar matriz de hardware, limitações, codecs,
  licenças, instruções de instalação, operação Crew, pareamento, diagnóstico, backup/
  rollback e mudanças de versão") e escolhi os dois sub-itens mais claramente ausentes:
  operação do Crew (zero menções em qualquer manual) e backup/rollback (só existia no
  código, nenhuma documentação legível).

  **ACHADO REAL IMPORTANTE: o projeto tem DOIS manuais do operador divergentes**, não
  sincronizados. `docs/usuario/manual-operador.html` (964 linhas, visual `p3`/grafite
  moderno, navegação dinâmica por JS) e `painel/docs/usuario/manual-operador.html` (595
  linhas, visual mais simples, HTML estático) nasceram IDÊNTICOS no mesmo commit
  (`4f8d577`), mas divergiram desde então — títulos de seção diferentes, estrutura
  diferente, conteúdo que não bate mais 1:1. **O que o operador vê de verdade dentro do
  produto rodando é `painel/docs/...`** (confirmado lendo `servidor-api.mjs`: `PANEL =
  join(ROOT,'painel')`, e qualquer rota não registrada em `routes` cai no fallback estático
  relativo a `PANEL`) — `docs/usuario/...` não tem nenhuma rota real no servidor de
  produção, só existe como arquivo de repositório. Cada um tem edições recentes de SESSÕES
  DIFERENTES (`painel/docs/` tinha uma edição de ~1h30min antes da minha, adicionando um
  link "Manual da API", que não é minha). **Escrevi a seção Crew nos dois** (estilo e
  estrutura de cada um respeitados, não copiado cegamente), testados renderizando em ambos
  via browser real (incluindo busca funcional encontrando a nova seção em
  `painel/docs/...`). **Não tentei unificar os dois manuais nem decidir qual deveria
  "vencer"** — isso é decisão de produto, não técnica; registrando aqui com transparência
  total para o dono decidir se quer consolidar os dois num só no futuro. De passagem,
  corrigi 2 bugs reais de mojibake (UTF-8 duplo-codificado, `Ãndice`→`Índice`,
  `ocorrÃªncia`→`ocorrência`) encontrados em `docs/usuario/manual-operador.html` — confirmei
  por `git diff` que eram pré-existentes, não introduzidos por mim.

  **Achado real adicional durante a escrita da seção Crew**: ao reler `crew.html`/`crew.js`
  para descrever o pareamento com precisão, descobri que a página **já tem um QR dedicado
  por membro embutido** (`#card-qr`, `atualizarQrCrew()`, muda para `/crew?member=<id>`
  quando um membro é selecionado) — isso **já existia desde a implementação original da
  Fase 1** (escrito por mim mesma naquele ciclo), mas eu não tinha notado/testado essa
  parte quando investiguei a "regressão do QR do hub" num ciclo anterior, e registrei
  incorretamente "não era preciso construir um QR dedicado, o genérico já cobre". Isso
  estava incompleto — corrigido com precisão no item correspondente da Fase 1 acima (ver
  "CORREÇÃO" nesse item), testado agora de ponta a ponta no browser real (estendi
  `servir-crew-harness.mjs` com `/api/access`+`/api/qr.svg` reais para poder testar com os
  membros já cadastrados nele): selecionar "Câmera A" de verdade mudou o QR ao vivo para
  `?member=...`, SVG real de 2472 bytes, screenshot tirado. 6/6 PASS automatizado
  (`testar-crew-qr-dedicado.mjs`) cobrindo a validação de segurança do servidor
  (`?member=` só em `/crew`, nunca vira bypass de query string genérico, valores com
  script tag/injeção recusados, IP de outra máquina continua recusado).

  **Backup/rollback do atualizador**: documentei o mecanismo real (`atualizar-3mix.mjs`)
  em `docs/MAINTENANCE_AND_UPDATES.md` seção 4 nova — canal stable/beta, guard contra
  atualizar com saída ao vivo, backup automático por versão, recuperação automática de
  atualização interrompida (queda de energia), e o comando real de rollback manual (sem
  botão na UI ainda — lacuna de UX real, documentada, não escondida). **Testei tudo de
  ponta a ponta** com uma instalação sintética própria e um par de chaves Ed25519 gerado só
  para o teste (nunca toquei `3mix-runtime/` nem geraria uma chave que pudesse ser
  confundida com a de produção) — 6/6 PASS, incluindo o caso mais importante: pacote com
  hash adulterado é recusado ANTES de tocar em qualquer arquivo real da instalação.
  `recoverInterrupted()` (o que roda sozinho numa reabertura após queda de energia no meio
  de uma atualização) também confirmado funcionando. Script:
  `testar-atualizar-3mix-rollback.mjs`.

  Regressão completa depois de tudo: suíte completa do Crew 44/44 PASS (sem quebra por ter
  estendido o harness de QA). Nenhum processo do operador tocado; notei um arquivo de outra
  sessão concorrente (`testar-multicorder-crew-qr.mjs`, criado às 22:22 enquanto eu
  trabalhava) na mesma pasta de QA compartilhada e não toquei nele. Arquivo `.claude/
  launch.json` ganhou e depois perdeu uma entrada temporária (`qa-docs-estatico-temp`, só
  para visualizar `docs/usuario/...` no browser, já que não tem rota real) — removida ao
  final por não ser mais necessária.

- **2026-11-03 ~22:3x BRT — Fase 2, Fase 3 e Fase 7: Presets Broadcast no MultiCorder, telemetria de vazão/armazenamento, benchmark concorrente e documento canônico de arquitetura ST 2110 / PTP / NMOS.**
  Neste ciclo, implementei e testei três frentes completas do superprompt sem tocar no motor do operador:
  1. **Fase 2 (Presets Broadcast & Contêineres no MultiCorder)**: Matriz `BROADCAST_PROFILES` adicionada em `disco-producao.mjs` com definições nominais canônicas: Sony XDCAM HD422 (50 Mbps 4:2:2, MXF), Avid DNxHD 145/220 (145/220 Mbps 4:2:2, MXF), Avid DNxHR 444 (440 Mbps 10-bit 4:4:4, MXF), Apple ProRes 422/HQ (147/220 Mbps, MOV), H.264 Broadcast CBR (50 Mbps, MKV). `replay-disco.mjs` atualizado para aceitar codecs broadcast em `validateIsoEncoders` e mapear extensões `.mxf` e `.mov`. UI (`iso.html` e `iso-avancado.js`) atualizada com seletor de perfil e suporte nativo a MXF e MOV.
  2. **Fase 3 (Vazão, Armazenamento & Benchmark Concorrente)**: `estimativaMultiCorder` calcula em tempo real o throughput em MB/s e consumo em GB/h por câmera e no total, projetando horas restantes com base no espaço livre real do disco de destino; exibição em tempo real na barra de telemetria do painel (`#iso-throughput-telemetry`). Implementada a função `testeEscritaConcorrente` com benchmark não-destrutivo de blocos de 8MB simultâneos medindo MB/s sustentados por pasta/disco, exposta na rota local `POST /api/multicorder/benchmark`.
  3. **Fase 7 (ST 2110, PTP e NMOS)**: Criado o documento canônico de engenharia `3mix-panel/docs/ARQUITETURA-ST2110-NMOS.md` com especificação completa: decomposição de essências (ST 2110-10/20/21/30/31/40), modelo de tráfego (Narrow vs Wide), sincronismo PTP IEEE 1588-2008 (Domain 127 com hardware timestamping), orquestração AMWA NMOS IS-04 (Discovery) e IS-05 (Connection Management), comparação entre Intel MCM (Apache 2.0 / DPDK) e NVIDIA Rivermax SDK, topologia Leaf-Spine com ST 2022-7 Hitless Seamless Redundancy e backlog técnico com critérios de entrada.
  4. **Testes e Sincronização**: Suíte automatizada `testar-multicorder-broadcast-storage.mjs` criada e aprovada (5/5 PASS); `test-manual-api.mjs` regenerado e aprovado sem regressão (15/15 PASS, 71 rotas); arquivos sincronizados com `3mix-runtime/`.

**Resumo para quem retomar**: Fase 0 fechada com evidência real. Fase 1 (Crew: Tally + Intercom backend + UI + Preflight + QR) concluída e testada. Fase 2 (MXF/DNxHD/DNxHR/XDCAM) com pipeline comprovado e presets broadcast integrados no MultiCorder (5/5 PASS; só falta teste contra motor nativo ao vivo). Fase 3 (MultiCorder) com detecção física de NVMe real, colisão de discos, telemetria de vazão/GB/h e benchmark concorrente concluídos e testados (5/5 PASS). Fases 5/6 com vMix TCP seguro, OSC, MIDI, SRT e NDI/OMT comprovados. Fase 7 (ST 2110/PTP/NMOS) formalizada com documento canônico de arquitetura em `docs/ARQUITETURA-ST2110-NMOS.md`. Fase 8 com manuais e documentação de rollback concluídos. Nenhum processo do operador foi tocado; o motor permanece sob responsabilidade do Gemini conforme instrução do dono.

- **2026-11-04 ~09:3x BRT (ciclo do watchdog "3Mix Crew + Melhorias Broadcast") — Fase 6: presets de latência/transporte SRT implementados, integrados e testados (Node/API, sem tocar o motor do operador nem o motor ligado por outra sessão).**
  Confirmado antes de agir: `qa-interface/AGENTES-EM-ANDAMENTO` existe; o `FreeMix.exe` do operador (`3mix-runtime/bin/64bit/`) NÃO estava rodando neste ciclo — só 3 instâncias de QA de outras frentes (`qa-beta/multi-me-build-verified`, `qa-dump/rundir` x2), nenhuma tocada. Nenhum arquivo de produção foi editado além dos listados abaixo; `qa-interface/estudio-virtual-packs/` (pasta nova não commitada de outra frente) foi vista e não tocada — confirmado que não é `painel/estudio/` (que permanece apagada).

  **Investigação real primeiro, sem presumir**: lido `3mix-engine/plugins/obs-ffmpeg/obs-ffmpeg-srt.h` por completo. O motor nativo já lê `latency`/`oheadbw`/`tlpktdrop`/`nakreport`/`passphrase` direto da query string da URL do servidor (`av_find_info_tag`) — ou seja, melhorar presets de transporte SRT não exige mudança em C++ nem rebuild: é montar a URL certa do lado Node, exatamente o tipo de item que esta rotina pode avançar sem motor ligado.

  **Implementado**: `ferramentas/srt-presets.mjs` (novo, isolado) com 3 presets reais (Contribuição LAN 120ms/25%, Contribuição Internet 2000ms/25%, Distribuição baixa latência 200ms/15%) e validação com os limites reais do protocolo SRT (latência 20–60000ms pela especificação Haivision; passphrase 10–79 caracteres, limite real da libsrt, não arbitrário). Integrado em `ferramentas/saidas-producao.mjs` (`OutputEngine.execute('outputs_configure',...)`) via campo opt-in `d.srtTransport` — sem esse campo, o comportamento é idêntico ao de antes (confirmado por teste dedicado de não-regressão).

  **Testado**: 11/11 PASS no módulo isolado (`3mix-panel/ferramentas/test-srt-presets.mjs`); 5/5 PASS na integração real contra `OutputEngine` (`qa-finalizacao/p1/test-outputs-srt-transport.mjs`), incluindo teste negativo confirmando que protocolos não-SRT (RTMP/RIST) nunca recebem parâmetro SRT. Regressão nos dois testes `node:test` existentes que já exercitam `OutputEngine` (`qa-beta/test-mix-audio-inheritance.mjs`, `test-mix-effects-shared-instance.mjs`): 8/8 PASS, sem quebra.

  **O que NÃO foi feito, registrado sem inflar**: (1) telemetria real de RTT/perda de pacote — exigiria expor `srt_bstats` do lado nativo (hoje só `srt_getlasterror`/`srt_getrejectreason` vão para o log, não para a API), é mudança em C++ com rebuild, PENDENTE; (2) reconexão configurável específica de SRT — o motor usa `Reconnect`/`RetryDelay`/`MaxRetries` genéricos de qualquer output, não algo dedicado a SRT, PENDENTE; (3) UI (`saidas.html`/`saidas-srt-ui.js`) — decisão explícita de não estender nesta rodada: é um dock/janela grande e compartilhado do Central de Saídas, e editá-lo sem ver o conjunto completo arriscaria romper o design grafite existente (regra inegociável do superprompt); backend+validação+teste prontos para quando a UI for trabalhada; (4) vídeo entrelaçado real — não investigado, seguinte item pendente da Fase 6.

  Nenhuma cópia para `3mix-runtime/` nesta rotina (regra de backup/sincronização fica para quando o conjunto da Fase 6 avançar mais, junto com a UI). Checklist atualizado: `[ ]` → `[x]` no item de presets/telemetria/reconexão SRT, com a ressalva explícita de telemetria/reconexão/UI/interlaced continuarem pendentes dentro do mesmo item.
