# 3Mix — estado real e próximas etapas

Lista única de execução atual: [PENDENCIAS.md](PENDENCIAS.md). Inclui todos os pedidos e prints de 07–08/10/2026. As especificações de integração/outputs são planos; a lista registra o limite do que foi implementado e efetivamente testado.

Atualizado em 08/10/2026. Entrega escolhida: ZIP para teste neste computador com câmera conectada. Evidências em `VALIDACAO.md` no pacote e `CONTINUAR.md` no workspace.

## Entregue para teste local

- FreeMix.exe (nome de binário interno; renomear exige rebuild do motor) compilado no fork `freemix-app`, ramo `freemix/broadcast-suite`; Preview/Programa e transições nativas. Essa é a base operacional. `src/app` é um protótipo de arquitetura, não o executável entregue.
- Mesa/consoles com API compartilhada, Cut/Fade/T-bar, mídia/VT, GC/placar, medidores e Master/A/B.
- ISO em arquivos reais; replay TS/MP4, IN/OUT, retenção e A/B vinculados com tolerância de 100 ms.
- CSV/JSON/XLSX, arquivo/HTTP, edição/seleção de linha e vínculo à Tarja/Placar.
- Pareamento e QR na rede local; dependências incluídas.
- Atualizador assinado, backups/rollback; pacote de lista explícita sem configurações/gravações do operador.
- Câmera USB: 720p nativo, ISO redimensionado 1080p, ensaio de 10 s.

- Composições por slots UUID, ajuste proporcional e tags; rollback real em falhas.
- Configurações próprias principais e proteção de chave.
- Central Calls e watchdog nativo para mic privado no retorno B; sem N-1 individual/conferência homologados.

## Ainda necessário para o produto completo

1. Homologar produção longa Full HD multicâmera, áudio ouvido, transmissão externa e chamadas.
2. Integrar/homologar NDI, OMT e SDI com runtimes, drivers e equipamentos. Não há evidência dessas fontes disponíveis no motor de QA atual.
3. Homologar MIDI físico; Cut/Fade de teclado foram executados.
4. Implementar bonding e receptor; `NETWORK_BONDING.md` é especificação futura.
5. Completar diálogos próprios de propriedades, filtros e configurações; parte usa os diálogos do motor.
6. Implementar exportação/importação completa `.fmx`, ampliar vínculos de dados e testar Google privado se entrar no escopo.
7. Validar em Windows limpo, criar instalador e definir/publicar canal HTTPS de distribuição/atualização.

Não apresentar esqueletos/documentação como funcionalidades concluídas. Compatibilidade parcial vMix não significa API oficial nem compatibilidade integral.

8. Mixes horizontal/vertical independentes, snapshots/recovery versionado, macros/triggers completos e organização por múltiplas tags na mesa.
9. N-1 por convidado e conferência, talkback individual e transporte/escuta externa.
