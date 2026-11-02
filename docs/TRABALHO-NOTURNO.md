# Trabalho autônomo autorizado — 08/10/2026

Pedido: manter a mesa estilo 3Mix/vMix, facilitar criação de entradas/composições, resolver retorno/N-1/talkback de Calls e pesquisar dificuldades recorrentes do vMix. Entregar ZIP local e evidências até a manhã, sem publicação.

Atualização de 08/10: o incremento atual está documentado no início de `CONTINUAR.md`, incluindo 17 verificações locais de retorno/talkback e correções de interface. Teste externo e empacotamento do incremento continuam pendentes. Limpeza posterior autorizada removeu cópias obsoletas e recuperou 14,27 GiB no D:; lista em `qa-finalizacao/limpeza-2026-10-08.json`. Os runtimes antigos citados neste histórico já foram removidos; evidências pequenas mantidas.

## Ordem de execução

1. Preservar tema e DockState da mesa no pacote limpo; testar abertura e oferecer restauração visual reversível.
2. Input composto: criação rápida PiP/2/3/4 pessoas/apresentador+slides, slots editáveis e IDs persistentes, usando o motor real.
3. Central de configurações própria com categorias e ações reais. Indicar explicitamente capacidades ausentes.
4. Calls: central auxiliar, sala/links persistentes, retorno sem realimentar convidados e talkback isolado; testar rotas reais e distinguir validação local de chamada externa.
5. Persistência de produção, snapshots/recuperação e automações dentro dos limites validados.
6. Pesquisar/reconciliar reclamações: não tratar como ausente no vMix um recurso já existente.
7. Atualizar espelho Git/documentação, gerar novo candidato limpo, assinar, ZIP/SHA-256, testar pacote independente.

Conferência de manhã agendada neste chat para 8h, execução única. Não abrir outro chat, publicar, enviar mensagens ou gerar agentes paralelos. Preservar processos do operador; QA com portas 14469/18091.

## Pesquisa inicial verificada

- Retorno de Call e agrupamento de áudio: https://forums.vmix.com/posts/t34247-vMix-Call----group-audio-level-via-API — há discussão sobre buses enviados ao Master e o efeito no retorno; não equivale a ausência de mix-minus no vMix.
- Talkback: https://www.vmix.com/knowledgebase/article.aspx/256/how-to-setup-push-button-talkback-for-vmix-call — vMix oferece configuração via bus/atalhos; oportunidade é simplificar.
- Layers: https://forums.vmix.com/posts/t33974-Shortcut-to-change-a-layer — respostas explicam que trocar layer por atalho já é possível.
- IDs: https://forums.vmix.com/posts/t32546-UI-Overhaul-to-Honor-Input-Keys — demanda por referências persistentes no fluxo.
- VDO.Ninja: https://docs.vdo.ninja/getting-started/rooms e https://docs.vdo.ninja/guides/iframe-api-documentation/iframe-api-basics — salas e API do transporte, não prova de integração 3Mix concluída.

Os anexos do usuário incluem propostas extensas de vertical/múltiplos mixes, outputs, macros, triggers, tags e recovery. Nenhum desses recursos será declarado pronto somente por existir neste documento.
