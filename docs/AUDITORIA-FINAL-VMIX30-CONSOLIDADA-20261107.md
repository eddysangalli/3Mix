# Auditoria final vMix30 e entrega Alpha — consolidação (06–07/11/2026)

Índice dos achados reais desta rodada de trabalho, com evidência e links para os documentos completos de cada um. Nenhum item aqui é declarado "concluído" sem a ressalva do que ainda falta — ver cada documento para o detalhe completo.

## Confirmado e funcionando, com evidência real

| Item | Evidência | Documento |
|---|---|---|
| Motor OBS 33.0.1 rodando em produção real | log, `strings obs.dll`, screenshot PrintWindow | `RESULTADOS-MOTOR-OBS33-PRODUCAO-20261106.md` |
| Cabeçalho integrado (ícone + controles nativos) | screenshot real da produção | `RESULTADOS-MOTOR-OBS33-PRODUCAO-20261106.md` |
| DSK (9 keyers) funcional sob OBS33 | vendor `downstream-keyer`, estado real lido/confirmado | `BATERIA-DSK-AUDIO-REPLAY-CRASH-NDI-20261106.md` |
| Áudio/buses funcional sob OBS33 | volume/mute aplicados e lidos de volta | `BATERIA-DSK-AUDIO-REPLAY-CRASH-NDI-20261106.md` |
| Replay (ciclo completo start→grava→stop) | arquivo `.ts` real crescendo em disco | `RESULTADOS-MOTOR-OBS33-PRODUCAO-20261106.md`, `BATERIA-...md` |
| Miniaturas de Input com cadência "pular 1 a cada N" | controle intacto em produção, bloco de código idêntico ao testado | confirmado nesta sessão via diff byte-a-byte |
| Resizable BAR: diagnóstico real na UI | 9/9 testes, validação visual, contra a GPU real desta máquina | commit `8b2ce3325` |
| Verificador de versões do motor/plugins (GitHub, só leitura) | 17/17 testes, 3 atualizações reais encontradas, 1 bug corrigido (falso positivo obs-asio) | commit `fd60ac597` |
| Canal de atualização do pacote 3Mix publicado | GitHub Pages ativo, feed HTTP 200, produção confirmou sem reiniciar | `CANAL-ATUALIZACAO-PUBLICADO-20261107.md` |
| Deinterlace (leitura) sob OBS33 | 8/8 fontes assíncronas reais `supported:true` | `DEINTERLACE-VALIDACAO-PRODUCAO-20261107.md` |
| Crew + Slides (PR #22) | rotas reais respondendo, sem erro no log | confirmado nesta sessão |
| Instalador: código-fonte (PR #21) | 8/8 verificações, compilação real | `ESTADO-INSTALADOR-ALPHA-20261107.md` |

## 3 plugins de terceiros incompatíveis com OBS33 — causa raiz confirmada

`obs-advanced-masks`, `obs-color-monitor`, `obs-shaderfilter`: API `gs_image_file_*` removida no OBS33, substituída por `gs_image_file_ex_*`. Binários de terceiros sem código-fonte neste workspace — fora do alcance desta sessão corrigir. `RESULTADOS-MOTOR-OBS33-PRODUCAO-20261106.md`.

## Achados reais que precisam de decisão do usuário (bloqueados, não contornados)

| Item | Causa real do bloqueio | Documento |
|---|---|---|
| Regressão de versão numa dependência de rede (introduzida pela migração OBS33) | Correção pronta e verificada, mas escrever em produção exige autorização específica que a anterior não cobria | Documentado só localmente, não neste repositório público — detalhe sensível de segurança, comunicado diretamente ao usuário |
| Pacote do instalador Alpha não gerado desde o redesenho | Depende de decidir qual motor empacotar (32.2.2 do manifesto atual, ou 33.0.1 testado nesta sessão) | `ESTADO-INSTALADOR-ALPHA-20261107.md` |
| Diálogo de crash recorrente na instância QA | Arquivos sentinel órfãos de encerramentos forçados anteriores; removê-los foi bloqueado até autorização explícita | pendente, não documentado em arquivo separado |

## Dois crashes reais encontrados em QA isolada (nunca a produção)

1. **Thread de áudio** (`obs_source_active`), causado pelo filtro `source-record.c` ao remover cena com gravação ativa. `BATERIA-DSK-AUDIO-REPLAY-CRASH-NDI-20261106.md`.
2. **Destruição de cena** (`scene_destroy`), causado pelo plugin `mix-track-to-source.dll` não limpar sua conexão de áudio corretamente. Mesmo documento, seção "Segundo crash real".

Ambos pesquisados a fundo: são bugs conhecidos e documentados nos próprios repositórios upstream dos plugins (issues abertas há anos, nunca corrigidas pelos mantenedores) — não específicos do 3Mix, não corrigidos nesta sessão por decisão deliberada (ver `PESQUISA-UPSTREAM-CRASH-SOURCE-RECORD-20261107.md`: sem reprodução determinística nem debug profundo, um patch especulativo arriscaria mais do que ajudaria).

## Investigado, não implementado — limites técnicos reais, não falta de esforço

- **Headphones pós-Master**: tecnicamente viável (fonte certa, mecanismo certo), mas com um comportamento não explicado (`MONITOR_ONLY` sempre virando `MONITOR_AND_OUTPUT`) e agora também bloqueado pelo bug #2 acima no mesmo plugin usado para isso. `HEADPHONES-POS-MASTER-INVESTIGACAO-20261107.md`.
- **DeckLink output multicanal**: causa raiz exata encontrada (`EnableAudioOutput` hard-coded com 2 canais, enquanto o input já suporta até 8) — não corrigido por não haver hardware DeckLink físico nesta máquina para validar a mudança.
- **NDI HDR**: requer licença comercial do NDI Advanced SDK, que o projeto não tem — decisão de negócio, não lacuna técnica. `NDI-HDR-CONTRATO.md` (já existia, confirmado ainda preciso).
- **AJA**: plugin oficial do OBS (não código 3Mix), SDK reconhece os devices certos, mas sem hardware físico para testar.

## O que esta sessão NÃO fez

- Não reiniciou nem encerrou nenhum processo do operador sem autorização — todo teste que exigiu abrir/fechar um motor usou exclusivamente instâncias sob `qa-finalizacao/`.
- Não contornou nenhum bloqueio de permissão — cada um foi registrado e levado de volta ao usuário.
- Não declarou nada "100% pronto" sem evidência: cada item acima tem um "o que falta" explícito no documento correspondente.
- Não publicou detalhes de uma vulnerabilidade de segurança ativa sem decisão explícita do usuário, mesmo sob pressão de ritmo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
