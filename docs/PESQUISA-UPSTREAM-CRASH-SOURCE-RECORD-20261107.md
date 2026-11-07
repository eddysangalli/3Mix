# Pesquisa upstream: crash de shutdown/scene change do source-record — bug conhecido há 4+ anos, não corrigido

**Status: pesquisado a fundo, correção NÃO aplicada por decisão deliberada — risco de patch especulativo maior que o benefício sem mais tempo de teste controlado.**

## O que foi feito

A investigação dos dois crashes documentados em `BATERIA-DSK-AUDIO-REPLAY-CRASH-NDI-20261106.md` levou a procurar o repositório upstream real do plugin (`github.com/exeldro/obs-source-record`), não só o fork `freemix-source-record` deste workspace. Um clone git completo já existia em `qa-finalizacao/obs-source-record-src` (de um trabalho anterior desta mesma linha de investigação), na versão mais recente do upstream (commit `fe3f63f`).

## Achado: não é um bug exclusivo deste workspace

- **Issue #15** (`exeldro/obs-source-record`, aberta em 2021, ainda `OPEN`, 14 comentários): "Crashes on OBS Studio shutdown or scene collection change" — stack trace quase idêntica ao meu primeiro crash (`scene_destroy` → `pthread_mutex_destroy`/`obs_source_release`). Um usuário (não mantenedor) investigou com rigor real (bisseção, testes repetidos) e apontou `audio_output_close(context->audio_output)` e `video_output_close(o)` em `source_record_filter_destroy()` como a causa, anexando um patch.
- **Issue #73** (aberta em 2024, ainda `OPEN`, 40 comentários): "Crashes every time I close obs" — mesma thread (`tiny_tubular_task_thread`), mesmo padrão de shutdown, relatado por múltiplos usuários independentes ao longo de anos.
- Nenhuma das duas foi fechada por uma correção. O mantenedor (`exeldro`) participou da #73 mas nunca confirmou a causa raiz nem mergeou um fix para o crash de shutdown em si (diferente do PR #179, que corrigiu um crash relacionado mas **diferente** — resize de fonte durante Replay Buffer ativo, já coberto pela proteção `video_stale` que existe no código deste workspace).

## Por que não apliquei o patch de 2021 diretamente

O patch da issue #15 sugere chamar `audio_output_stop(context->audio_output)` antes de `audio_output_close(...)`. Verifiquei contra o código real do libobs deste workspace (`3mix-engine/libobs/media-io/audio-io.c`): **`audio_output_close()` já chama `audio_output_stop()` internamente** (`if (audio->initialized) { audio_output_stop(audio); ... }`), diferente da versão do OBS de 2021 quando a issue foi aberta. Isso significa que o core do libobs já absorveu parte da correção ao longo dos anos — o patch de 2021, aplicado hoje, seria uma chamada redundante, não um fix. **O bug real que causou meus dois crashes nesta sessão não é mais exatamente o mesmo** que o da issue de 2021, mesmo com sintomas parecidos (mesma thread, mesmo padrão de shutdown) — é algo que sobrou depois dessa correção parcial do core, ainda não identificado com precisão suficiente para um patch seguro.

## Decisão: não escrever um patch especulativo

Escrever uma correção própria, sem entender a causa exata remanescente, arriscaria: (a) não corrigir o bug de verdade, só mascarar o sintoma numa condição de teste específica; (b) introduzir uma regressão num código que já lida com gravação/replay real, usado em produção. Isso exigiria reprodução controlada e determinística (que não consegui nas 5 tentativas de isolamento documentadas em `BATERIA-DSK-AUDIO-REPLAY-CRASH-NDI-20261106.md`), debug com um depurador anexado ao processo no momento do crash, e testes de regressão extensos — trabalho de escopo maior que uma sessão de investigação permite com segurança.

## Risco prático avaliado

Esse crash só se manifesta no **shutdown do processo** (fechar o 3Mix), depois de usar o filtro de replay/gravação por source em cenas que depois são removidas/trocadas — não durante a operação normal ao vivo. A produção, no uso normal pelo painel (que sempre para a gravação antes de permitir remoção de cena/fonte — não existe no fluxo do operador um caminho equivalente ao que os meus testes isolados fizeram), tem risco baixo mas não nulo: um fechamento do 3Mix ao final de uma transmissão com Replay/ISO usados poderia, em tese, crashar em vez de fechar limpo — sem perda do que já foi gravado (os arquivos `.ts` já escritos no disco não são afetados por um crash no shutdown), mas sem o fechamento limpo que o operador esperaria.

## Recomendação

- Não é bloqueador para o Alpha: o crash é no shutdown, não durante o uso ao vivo, e não há evidência de que afete o conteúdo já gravado.
- Se o 3Mix quiser uma correção real, o caminho mais seguro é reportar as duas issues (#15, #73) ao mantenedor com as stack traces desta sessão como confirmação independente e recente (ainda não feito, pois isso significa interagir publicamente em nome do projeto — decisão do usuário, não algo que eu deva fazer sozinho), ou investir numa sessão de debug dedicada com um depurador anexado, não mais testes de isolamento por tentativa e erro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
