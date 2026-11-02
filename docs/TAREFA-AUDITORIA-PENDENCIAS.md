# Tarefa para o agente: auditoria das pendências reais do 3Mix

Analise o estado atual de `D:\DRIVE\IA\antigravity\vmixtwste` e entregue um resumo direto do que realmente falta. Esta é uma auditoria: não editar código, instalar, publicar, iniciar/parar a mesa, transmitir ou modificar o projeto do operador. Não confiar em declarações antigas de conclusão sem conferir evidências e o pacote efetivamente entregue.

Comece por `README.md`, `docs/CONTINUAR.md`, `docs/ENTREGA-ATUAL.md`, `docs/PENDENCIAS-REAIS.md`, `docs/ORGANIZACAO.md`, `entregas/ULTIMA-ATUALIZACAO.json`, o recibo de build do instalador e `qa-finalizacao/resultado-installer-runtime-20261009.json`. Os históricos estão em `archived`; fonte nativa em `freemix-app`; fonte do produto/patches em `FreeMix`; instalação operacional em `obs-vmix`. Não considerar três instalações equivalentes. Compare fontes, manifests assinados e hashes dos binários quando relevante.

Confira todos os pedidos deste chat: recuperação pós-snapshot/dependências; barramentos/ASIO/Direct Out/N-1/talkback; vários emissores NDI/OMT/SDI, Fill+Key, alpha/HDR/reconexão; configurações organizadas e responsivas; composições/GC H/V/GTZIP/fontes/imagens/sinal congelado; replay multicâmera e áudio; macros/eventos/feedback físico; blur/3D/tracking/legendas; bonding real/perdas/HTTPS; crashes de fechamento/reconexão; inicialização de janelas extras; SRT e transparência nos receptores OBS/vMix; logs ZIP; instalador e migração do projeto.

O receptor alpha por Web Browser foi **abortado pelo usuário por desempenho ruim com vídeo real**. Não tratá-lo como entregue, solução operacional ou pendência autorizada para continuar. Uma alternativa nativa SRT→NDI/OMT com alpha e áudio é proposta a avaliar, ainda não implementada. Os bridges do Everton são referências externas, não provas do nosso produto nem código autorizado para copiar.

Para cada pendência, informe em uma tabela:

1. Pedido e comportamento esperado.
2. Estado: falta código / código existe e falta validação / depende de hardware, licença, conta ou infraestrutura / limite da tecnologia / experimento abortado.
3. Evidência concreta: arquivos, versão/hash, teste executado e escopo. Diga explicitamente quando não encontrou prova.
4. O que falta, passos de implementação/validação e critério objetivo de aceite.
5. Por que ainda não foi feito: razão comprovada ou desconhecida. Não inventar motivos nem atribuir falta de vontade ao agente.
6. Dependências, risco e impacto para o operador.
7. Estimativa em faixa de horas/dias de trabalho e tempo de espera externo, com premissas e confiança. Evitar prazo exato sem fundamento; separar desenvolvimento, integração e homologação.

Abra o relatório com um resumo de até dez itens prioritários. Separe problemas bloqueando demonstração/operação dos recursos avançados e homologações externas. Não chamar uma homologação física de funcionalidade não implementada, nem transformar teste sintético em validação operacional.

Proponha como usar três subagentes, com tarefas delimitadas, arquivos sob responsabilidade de cada um, dependências e evidências de aceite. Sugestão inicial a ajustar pela auditoria:

- **Subagente 1 — instalação/interface/recuperação:** inicializadores, instalador/desinstalador/migração, configurações e responsividade, logs e restauração. Aceite em Windows limpo e projeto isolado com reinício e menus funcionando.
- **Subagente 2 — vídeo/saídas/rede:** SRT, NDI/OMT/SDI, alpha/HDR, reconexão e bonding. Aceite com receptor real, movimento/áudio, perda/reconexão e rede externa; hardware somente quando disponível.
- **Subagente 3 — áudio/replay/automação/GC:** áudio real, N-1/talkback, replay/sincronia, macros/feedback, composições/GTZIP e efeitos/legendas. Aceite com referências de áudio/vídeo e dispositivos quando exigidos.

Um agente coordenador revisa alterações e interfaces compartilhadas, integra em série e gera o pacote assinado final. Os três não devem editar simultaneamente o mesmo arquivo central. Trabalhar em raízes/portas isoladas; conservar as instâncias e gravações do operador. Nenhum envio de logs ou publicação a terceiros sem autorização específica.

Entregue: resumo legível, tabela detalhada, ordem de prioridade, estimativas justificadas e três prompts concretos prontos para execução. A auditoria não pode prometer que tudo termina em uma noite.
