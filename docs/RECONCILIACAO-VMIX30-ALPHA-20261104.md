# Reconciliação vMix 30 e gates de Alpha — 04/11/2026

## Divisão de responsabilidades

Claude: fechar revisão dos relógios (PR 1), acompanhar o PR 8 e melhorias pequenas do editor GT, após verificar concorrência. Não assumir áreas atribuídas ao Antigravity.

Antigravity/outras frentes: GO/triggers, apresentações, HLS, overlays/DSK, dados/imagens de GC, Replay/tags/exportação, armazenamento ISO, efeitos/Color Studio, novos recursos Multi-M/E/Central de Saídas e 3Mix IO.

## Estado confirmado nesta revisão

- PR 1: aberto e draft. Teste `test-clock-message.mjs` executado com arquivos extraídos da branch remota: PASS. Integração CEF, persistência após reabertura e funcionamento no runtime não homologados nesta revisão.
- PR 3: mesclado na branch do PR 1, NÃO em main. Não contabilizar matriz corrigida e presets MultiView como integrados a main enquanto essa dependência permanecer aberta.
- PRs 4–7: mesclados em origin/main. Não alterar sem defeito comprovado.
- PR 8: aberto e mergeable na consulta realizada; testes anteriores usam InputEngine real com transporte OBS simulado e disco real, não homologação nativa. Não confundir controle de visibilidade/bloqueio com equivalência completa ao comando proprietário SetLayerDynamic sem comparar sua semântica oficial.
- Checkout local ainda baseado em a58e4b0, atrás de origin/main, com alterações locais misturando cópias de PRs mesclados e trabalho adicional. Diff contra HEAD não permite atribuir toda alteração ao Antigravity. Não atualizar ou sobrescrever automaticamente.
- API escutando em 127.0.0.1:8088 na consulta anterior; isso não prova operação do motor nativo.

## Entregas relatadas: não refazer, confirmar

GO, triggers, Replay avançado, Pre-Flight de SSD, OMT, apresentações, imagem dinâmica e LiveLAN/HLS foram relatados pelo Antigravity. Retirar da categoria “ausente” e marcar “relatado / confirmar integração”, sem declarar homologação.

Pendências de confirmação com Antigravity (não assumidas por Claude):
- Entrada HLS/M3U8 e reconexão.
- Editor visual completo de overlays/DSK.
- POS/REM/DUR nas listas e Auto Next.
- Cadeia compartilhada de efeitos.
- Barramento de áudio por fonte na gravação.
- Distribuição do Replay entre SSDs (não confundir com ISO perInput).
- Triggers com eventos reais durante operação ao vivo.

## Como classificar para alpha testers

1. **Engenharia pendente:** código/integração/controle ainda ausente. NÃO delegar implementação ao tester.
2. **Implementado, teste automatizado:** lógica exercitada, inclusive com mocks. NÃO significa sinal AV comprovado.
3. **Pronto para homologação Alpha:** código integrado ao pacote, ação operacional acessível, dependências detectadas, instruções reproduzíveis e rollback disponíveis.
4. **Homologado no equipamento:** registrar versão/hash, Windows, GPU/driver/placa/SDK, entrada/saída, duração, resultado observado e evidência.
5. **Não suportado / descartado:** declarar motivo e indisponibilidade; não oferecer botão funcional nem pedir teste impossível.

Para SDI/AJA/DeckLink, ASIO, NDI, SRT, carga de Replay e saídas simultâneas: só publicar roteiro Alpha depois de confirmar que a capacidade é realmente exposta pelo motor/runtime. Hardware ausente não transforma código faltante em simples homologação pendente. Não elevar limites numéricos sem medição.

## Contagem de testes

O primeiro relatório fornecido soma 101 pelos próprios números apresentados: 4 + 2 + 5 + 4 + 5 + 27 + 37 + 8 + 9, não 91. Esses números misturam blocos de teste, asserções e mensagens de console; devem ser discriminados, não somados como unidade única.

Na execução desta revisão, as quatro suítes de PRs juntas reportaram 55 unidades pelo node --test: um arquivo de peak hold (27 verificações internas), 37 testes de formato, 8 de exportação e 9 de ciclo. Não são 55 testes nativos. O script de slides imprime cinco testes, mas quatro etapas de sucesso; suas asserções e a apresentação visual nativa precisam ser contabilizadas separadamente.

Scripts com assert e catch/process.exit(1) podem falhar corretamente mesmo sem node:test. Não presumir sucesso falso apenas pelo formato de saída. Teste automatizado executado no Windows continua não sendo homologação AV nativa.

## Próximo gate

Fechar integração dos relógios e revisar PR 8 sem merge automático. Editor GT: catalogo.js e catalogo-biblioteca.js têm alterações locais; evitar esses arquivos. gc.js e módulos de render/modelo exigem verificação de concorrência e revisão completa antes da implementação. Não criar outro editor ou modificar o compositor atribuído ao Antigravity.
