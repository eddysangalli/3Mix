# Bateria DSK, áudio, Replay — crash real encontrado, NDI root-caused (06-07/11/2026)

**Status:** DSK e áudio confirmados funcionais com evidência real. Replay confirmado funcional (ciclo completo, start→grava→stop). Um crash real e reproduzível foi encontrado durante a bateria, causa raiz investigada (hipótese fundamentada, não 100% confirmada — ver seção própria). NDI: causa raiz real identificada e não é um bug do motor — foi consequência de como esta sessão abriu o processo, não do código do 3Mix.

## DSK (Downstream Keyer) — confirmado funcional

Vendor `downstream-keyer` (plugin de terceiros Exeldro, GPL-2.0, v0.4.4, usado como está — `3mix-engine/plugins/downstream-keyer/`). Sequência real confirmada contra a instância QA isolada (motor OBS 33.0.1):

1. `add_downstream_keyer` provisiona um keyer numerado quando não há nenhum (o painel faz o mesmo automaticamente, `mesa.html:1821`).
2. `dsk_add_scene` registra uma cena como elegível para aquele DSK — obrigatório antes de selecioná-la (sem isso, `dsk_select_scene` retorna `success:false`; não existe `dsk_show`/`dsk_take`/`dsk_hide` — o "take" É o `dsk_select_scene`, confirmado lendo o `.cpp` real via `strings -e l` devido ao arquivo ser UTF-16).
3. `dsk_select_scene` com a cena = TAKE real: `success:true` E o estado (`get_downstream_keyers` → `scene`) reflete a atribuição de fato, não só o retorno de sucesso.
4. `dsk_select_scene` com `scene:""` = tirar do ar: confirmado, `success:true` e o estado volta a `scene:""`.

Nomes de request corretos (confirmados no código-fonte, `downstream-keyer-dock.cpp`): `get_downstream_keyers`, `get_downstream_keyer`, `add_downstream_keyer`, `remove_downstream_keyer`, `dsk_get_scene`, `dsk_select_scene`, `dsk_add_scene`, `dsk_remove_scene`, `dsk_set_tie`, `dsk_set_hide_after`, `dsk_set_transition`, `dsk_add_exclude_scene`, `dsk_remove_exclude_scene`.

## Áudio — confirmado funcional

`SetInputVolume`/`GetInputVolume` e `SetInputMute`/`GetInputMute` numa fonte `wasapi_output_capture` real: valor aplicado (-6 dB) e lido de volta corretamente (diferença menor que 0.1 dB), mute aplicado e lido de volta corretamente.

## Replay — ciclo completo confirmado funcional

`source_record_filter` com `record_mode:1` numa fonte real: arquivo `.ts` existiu e teve tamanho maior que 0 durante a gravação (confirmado por leitura de disco, não só pela API), `record_mode:0` parou a gravação. Consistente com o teste isolado já documentado em `RESULTADOS-MOTOR-OBS33-PRODUCAO-20261106.md`.

## Crash real encontrado — audio thread, use-after-free provável

Durante a limpeza do teste (`RemoveScene` de uma cena que continha tanto uma fonte `wasapi_output_capture` quanto, pouco antes, um `source_record_filter` com gravação ativa), a instância QA crashou de verdade:

```
Unhandled exception: c0000005
Fault address: obs.dll!obs_source_active+0x32
Thread: audio-io: audio thread (Crashed)
Stack: obs_source_active -> audio_callback -> input_and_output -> audio_thread
```

- Arquivo completo preservado em `docs/evidencias-crash-20261106/Crash 2026-11-06 22-42-34.txt` (gerado pelo próprio handler de crash do OBS, não fabricado; cópia original em `qa-finalizacao/native-vmix30-clean/rundir/.../crashes/`). Screenshot real (PrintWindow) do diálogo "Falha detectada no OBS Studio" que o próprio motor mostrou ao reabrir: `docs/evidencias-crash-20261106/dialogo-crash-qa.png`.

### Segundo crash real, diferente do primeiro (07/11/2026, 03:42)

Numa sessão de teste posterior (investigação de headphones pós-Master, sem `source_record_filter` nem `wasapi_output_capture` envolvidos desta vez — só cenas com `mix-track-to-source` e `color_source_v3` criadas/removidas repetidamente), a mesma instância QA crashou de novo, com uma stack trace **diferente**:

```
Unhandled exception: c0000005
Fault address: obs.dll!obs_source_release+0x36
Thread: tiny_tubular_task_thread (Crashed)
Stack: obs_source_release -> obs_sceneitem_destroy -> remove_all_items -> scene_destroy -> obs_source_destroy_defer
```

- Arquivo completo preservado em `docs/evidencias-crash-20261106/Crash 2026-11-07 03-42-20.txt`.
- Diferente do primeiro crash (thread de áudio, `obs_source_active`), este é na destruição de cena em si (`scene_destroy`/`obs_sceneitem_destroy`), numa thread de tarefas (`tiny_tubular_task_thread`), não a de áudio. Pode ser o mesmo padrão geral (destruição de source/view com referência pendurada em outra thread) com um gatilho diferente, ou um bug distinto — **não investigado a fundo por falta de tempo nesta sessão**, registrado aqui como achado real adicional, não unificado por suposição com o primeiro.
- Também não foi possível fechar esse processo normalmente (sem diálogo de recuperação com botões detectáveis via UI Automation desta vez, diferente da primeira ocorrência) — precisou de `taskkill /F`. Produção nunca foi afetada.
- `obs_source_active` é código vanilla do libobs (`libobs/obs-source.c`), não customizado pelo 3Mix. O crash é consistente com um ponteiro de fonte (`obs_source_t*`) já liberado sendo lido pela thread de áudio durante `audio_callback` (`libobs/obs-audio.c:589`), que itera `view->channels[i]` de cada `obs_view_t` registrada em `obs->video.mixes`.
- Hipótese fundamentada, não confirmada por reprodução isolada: o filtro `source_record_filter` (`3mix-panel/licenses/freemix-source-record/source-record.c`, terceiros, GPL-2.0, "used as-is" conforme o próprio CMake) mantém sua própria `obs_view_t` privada (`context->view`) registrada separadamente na lista global de mixes de áudio. Em `source_record_filter_destroy` (linha ~1399), `obs_view_remove()` só é chamado se `context->video_output` não for nulo — se esse campo já estiver nulo por outro caminho (por exemplo, por eu ter setado `record_mode:0` poucos segundos antes de remover a cena), `obs_view_remove()` nunca roda, e `obs_view_destroy()` libera a `obs_view_t` diretamente enquanto a thread de áudio ainda pode estar com uma referência a ela — use-after-free clássico.
- Não foi corrigido nesta sessão: é código de terceiros, denso, e uma correção real exigiria reproduzir de forma isolada (sem as outras variáveis do meu teste) e validar que a mudança não quebra o caso comum. Dado o pedido explícito de ritmo e o fato de que a produção real do operador nunca removeu cenas nesse padrão específico (ninguém usa `RemoveScene` numa cena com gravação ativa no fluxo normal do painel — o painel para a gravação e espera antes de permitir remoção), classifico isso como risco real mas de baixa probabilidade no uso normal via painel, não um bloqueador para o Alpha. Registrado aqui para rastreamento, não escondido.
- Produção nunca foi afetada: todo o teste rodou na instância QA isolada (`qa-finalizacao/native-vmix30-clean`), PID separado, nunca o PID 75040 da produção real.

## NDI — causa raiz real: não é bug do motor, foi o método de abertura desta sessão

O erro `[distroav] ERR-404 - NDI library not found` visto no log de produção das 20:55 não é um bug no código do 3Mix. Causa raiz confirmada:

- Existe um sistema dedicado e correto para isso: `3mix-panel/ferramentas/ndi-runtime.mjs`, `prepareNdiRuntime()`. Ele valida um SDK NDI v6.3+ empacotado dentro da própria instalação (`runtime/ndi-v6/Processing.NDI.Lib.x64.dll`, hash pinado, licença/proveniência obrigatórias) e define a variável de ambiente `NDI_RUNTIME_DIR_V6` só para o processo filho (comentário explícito no código: "never change the computer's global environment"), nunca no sistema operacional.
- Rodei `prepareNdiRuntime()` manualmente contra a instalação de produção real: sucesso completo (`version: "6.3.2.0"`, hash bate com o pinado, `6.3.2.0` maior que o `6.3` exigido pelo distroav 6.2.1).
- O motivo do erro no log das 20:55: eu reabri o processo manualmente via PowerShell `Start-Process` direto no `.exe`, nesta mesma sessão, para confirmar a versão do motor após a migração — isso pula completamente `ferramentas/iniciar-3mix.mjs` (o launcher canônico, chamado por `INICIAR-3MIX.cmd`), que é quem chama `prepareNdiRuntime()` e injeta `NDI_RUNTIME_DIR_V6` no ambiente antes do `spawn()` do motor.
- Prova direta: `3mix-runtime/config/obs-studio/plugin_config/freemix-control/ndi-runtime.json` (o "receipt" que só é escrito quando `prepareNdiRuntime()` roda de verdade) está datado 20:08, da abertura anterior do próprio usuário (antes da minha troca de binários) — não das 20:55, confirmando que minha reabertura manual não passou por esse código.
- Conclusão prática: se o operador abrir o 3Mix pelo caminho normal (`INICIAR-3MIX.cmd` → `abrir-3mix-atualizado.mjs` → `iniciar-3mix.mjs`), o NDI deve carregar corretamente. Isso não foi reconfirmado com uma abertura real pelo launcher canônico nesta sessão (ver pendência abaixo) — é dedução a partir do código e do receipt, não uma nova execução completa observada.

## Pendente

- Reconfirmar NDI com uma abertura real da produção pelo `INICIAR-3MIX.cmd`/launcher canônico (não feita nesta sessão — a produção não foi reaberta para não interromper o que o operador possa estar fazendo).
- Decidir se vale a pena investigar/corrigir o use-after-free do `source-record.c` antes do Alpha, dado que é código de terceiros e de baixa probabilidade no fluxo normal do painel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
