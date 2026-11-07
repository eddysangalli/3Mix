# Desentrelaçamento — leitura confirmada contra produção real sob OBS 33 (07/11/2026)

**Status: lacuna da auditoria de 04/11 parcialmente fechada.** `RESULTADOS-VMIX30-ALPHA-20261104.md` registrava "Desentrelaçamento (UI) — nenhuma validação foi feita com o motor nativo em execução real". Hoje, `GetInputDeinterlaceMode` foi lido com sucesso contra a instância de produção real (PID 75040, motor OBS 33.0.1), sem alterar nenhum estado.

## O que foi confirmado

Rodei `readDeinterlace()` (`ferramentas/deinterlace-producao.mjs`, somente leitura) contra todas as 8 fontes assíncronas reais do projeto de produção ativo:

| Fonte | Tipo | `supported` |
|---|---|---|
| VT áudio | ffmpeg_source | true |
| Replay Player A | ffmpeg_source | true |
| Replay Player B | ffmpeg_source | true |
| CAM 13 (fonte) | dshow_input | true |
| CAM 16 (fonte) | dshow_input | true |
| __3mix_p_vid_0yowz6 | dshow_input | true |
| __3mix_probe_dshow__ | dshow_input | true |
| CAM 21 (fonte) | dshow_input | true |

Todas as 8 confirmaram `supported: true`, com `mode: OBS_DEINTERLACE_MODE_DISABLE` (padrão, nunca alterado por este teste) e `fieldOrder: OBS_DEINTERLACE_FIELD_ORDER_TOP`. Isso confirma, contra o motor real em execução (não um mock nem suposição de código), que `GetInputDeinterlaceMode` funciona como documentado sob OBS 33.0.1, para os tipos de fonte realmente presentes no projeto do operador.

## O que ainda não foi confirmado (gap real remanescente)

- **`SetInputDeinterlaceMode`** (escrita) não foi exercitado contra produção nesta rodada — o script de ensaio completo (`qa-finalizacao/deinterlace-motor-real-ensaio.mjs`) também testa a escrita, aplicando e depois restaurando um modo, mas isso tocaria uma câmera real do operador sem autorização específica para essa ação exata. Não executado por essa razão, não por limitação técnica.
- **Sinal entrelaçado físico de verdade** (uma câmera 1080i/576i real alimentando a entrada) continua não verificado — isso exige hardware que gera esse tipo de sinal e inspeção visual do resultado, fora do alcance desta sessão.
- O ensaio completo com escrita foi tentado contra a instância QA isolada, mas essa instância está mostrando repetidamente o diálogo "Falha detectada" (arquivos sentinel órfãos de encerramentos forçados anteriores nesta sessão — ver conversa; aguardando autorização do usuário para limpar) — não contornado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
