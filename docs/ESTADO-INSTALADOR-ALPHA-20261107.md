# Estado real do instalador para a entrega Alpha (07/11/2026)

**Status: código-fonte do instalador pronto e testado; nenhum pacote final gerado para a versão atual (motor OBS 33).** Esclarecimento sobre "Kilo" incluído no final.

## O que está pronto

- `scripts/installer-windows/Setup.cs`/`Uninstall.cs`: redesenho completo mergeado no PR #21 (branding 3Mix, 8 passos incluindo Preparação e Revisão, assistente de primeira execução, compatibilidade DPI PerMonitorV2, compatibilidade de registro FreeMix/3Mix).
- `node scripts/installer-windows/test-installer.mjs`: **8/8 verificações passam**, incluindo compilação real dos dois arquivos C# (não só leitura estática) — confirmado rodando agora, nesta sessão.
- `scripts/installer-windows/build.mjs`: monta o `.exe` final (stub compilado + ZIP do pacote + footer com hash) a partir de um ZIP de entrada. **Não exige nem verifica nenhuma assinatura** apesar do nome convencionado "assinado" no comentário — isso é só a convenção esperada do pipeline completo, não uma checagem real dentro deste script.

## O que falta — gap real encontrado

`entregas/INSTALADOR-ATUAL.json` (o último registro de instalador gerado e verificado) é de **10/10/2026**, versão `0.1.0-local.20261010060000`, arquivo `FreeMix-Studio-Setup-...` (nome antigo) — quase um mês desatualizado, de antes do redesenho do PR #21 e muito antes da migração OBS33.

Gerar um pacote novo e coerente com o que foi testado nesta sessão (motor OBS 33.0.1, cabeçalho integrado, Crew, Slides) exige `ferramentas/empacotar-limpo.mjs`, que por sua vez lê `fork/manifest.json` para saber qual commit do motor nativo empacotar. **Esse manifesto ainda aponta para o commit `4f3cbe7bfd5...`, do motor antigo (era 32.2.2)**, não para `feat/obs33-integration`. Gerar o pacote agora, sem atualizar isso primeiro, empacotaria um instalador com o motor **errado** — incoerente com tudo que foi testado e documentado nesta sessão (`RESULTADOS-MOTOR-OBS33-PRODUCAO-20261106.md` e os demais).

Atualizar `fork/manifest.json` para o commit novo é um processo próprio (`scripts/reconstruir-motor.mjs`, exportação de fontes/patches do `3mix-engine` com seus hashes), mais amplo do que uma correção pontual — não tentado nesta sessão por ser um trabalho de escopo maior, que merece sua própria verificação cuidadosa antes de gerar algo que seria distribuído.

## Sobre "Kilo"

Investigado: não há nenhuma pessoa ou processo formal de coordenação pendente chamado "Kilo". É o nome de uma ferramenta de CLI de IA (KiloCode) instalada neste ambiente — usada em sessões passadas (meados de outubro, ver `docs/CHANGELOG.md`/`PENDENCIAS-REAIS.md`) como auditoria concorrente independente de outros trabalhos. Há um processo `kilo.exe` real rodando no sistema agora (desde ontem 18:33, extensão do Antigravity IDE), mas é infraestrutura de fundo do ambiente, não uma sessão de trabalho ativa nem algo que precise ser aguardado ou sincronizado para este instalador especificamente.

## Pendente, por decisão (não tentado sem autorização)

- Decidir se vale atualizar `fork/manifest.json` para o motor OBS33 agora (trabalho de escopo maior) antes de gerar um instalador Alpha novo, ou se o Alpha desta rodada deve continuar usando o motor 32.2.2 documentado no manifesto atual, com o upgrade para OBS33 ficando para uma entrega separada.
- A correção do SRT (ver `REGRESSAO-SRT-ENCONTRADA-20261107.md`, ainda local, não publicada) deveria entrar em qualquer pacote novo gerado, já que afeta diretamente o binário `srt.dll` do runtime.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
