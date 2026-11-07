# Headphones pós-Master — investigação parcial (07/11/2026)

**Status:** tecnicamente viável em princípio, mas NÃO implementado nem homologado. Este documento registra só o que foi de fato executado e observado nesta investigação em QA isolada, sem tocar no áudio do operador.

## Evidência executada em QA isolada

- Plugin `mix-track-to-source` 1.0.2 carregou no OBS 33.0.1 (log confirmou).
- Criar fonte com `MixTrack: 1` e reler settings funcionou. Isso **não confirma qual track foi capturada**: default é 0 e a indexação precisa ser conferida no fonte/documentação do plugin antes de assumir "1 = track 1".
- Pedido `MONITOR_ONLY` foi relido como `MONITOR_AND_OUTPUT` (determinístico, repetido 4 vezes). `NONE` foi relido corretamente. **Causa ainda não estabelecida**; não atribuir automaticamente ao plugin.
- Fonte criada sem rotas para as seis tracks (todas `false`, confirmado via `GetInputAudioTracks`). Isso reduz um caminho de realimentação, mas **não prova isolamento nem áudio real**.
- `audio_monitor` não estava disponível neste QA; criação desse filtro retornou 607 (kind não suportado). Isso é ausência de plugin no build QA limpo, não falha do motor.
- Fonte sem áudio (`color_source_v3`) corretamente recusou monitoramento com erro 604 (esperado, não bug).

## Gate aberto

É necessário sinal PCM conhecido, conferir indexação de `MixTrack`, medir sinal antes/depois do fader Master e comprovar ausência de retorno em todas as saídas. Nenhuma funcionalidade pós-Master foi implementada ou homologada por esses testes. Nenhuma configuração de áudio do operador foi alterada nesta investigação.

## Bloqueador adicional encontrado depois desta investigação

A mesma fonte `mix-track-to-source` usada aqui (`PROGRAM MIX (teste)`) foi identificada como o gatilho de um crash real documentado separadamente em `BATERIA-DSK-AUDIO-REPLAY-CRASH-NDI-20261106.md` (seção "Segundo crash real"): o plugin `mix-track-to-source.dll` (terceiros, v1.0.2) não limpa corretamente sua conexão de áudio quando a fonte/cena é removida em uso normal, causando um crash no shutdown do processo (`audio_output_disconnect` chamado depois do módulo já ter sido descarregado). **Isso bloqueia qualquer implementação de headphones pós-Master usando este plugin até o bug ser corrigido** — não é seguro expor essa fonte na UI do operador no estado atual.

## Nota sobre o canal de atualização publicado nesta mesma sessão

GitHub Pages foi publicado com autorização explícita. Feed beta retornou HTTP 200 e a API de produção passou a `current` após o comando explícito `update_check` — isso **não comprova execução do timer periódico** nem instalação de atualização assinada. Os feeds ainda não oferecem pacote novo (sem `manifestUrl`/`signatureUrl`, requerem chave privada Ed25519 do projeto).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
