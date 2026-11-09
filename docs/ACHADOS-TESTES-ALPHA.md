# Achados dos testes Alpha — 3Mix

Registro canônico: todo novo relato entra neste documento com ID permanente, versão, reprodução, estado e evidência. Logs detalhados complementam este registro; não o substituem.

## Base e escopo

Rodada **0.1.5-rc.1-rebuild.1**. Inclui a tentativa de desinstalar a versão anterior para instalar o rebuild; versão exata daquele desinstalador não comprovada. Não afirmar que todos os problemas surgiram no rebuild. Alterar fonte não altera o EXE já publicado.

## Estados

Aberto → Em investigação → Implementado, validação pendente → Validado em candidato → Resolvido e entregue.

Também aceitar Não reproduzido ou Duplicado, com justificativa e histórico preservado. Teste de contrato ou compilação não bastam para marcar resolvido. Registrar build, resultado e versão entregue.

## Resumo

| ID | Achado | Estado |
|---|---|---|
| ALPHA-001 | Desinstalador mostra exceção não tratada | Implementado; validação pendente |
| ALPHA-002 | Atalho com timestamp e identificador interno | Aberto |
| ALPHA-003 | Texto Motor conectado repetido | Implementado; validação pendente |
| ALPHA-004 | Splash informa modo portátil na instalação pelo EXE | Implementado; validação pendente |
| ALPHA-005 | Janela de input fica minimizada ou atrás após Buscar | Implementado; validação pendente |
| ALPHA-006 | Texto cortado abaixo do progresso no passo 7 | Implementado; validação pendente |
| ALPHA-007 | Histórico de Sobre não inclui 0.1.5 | Aberto |

## ALPHA-001 — Desinstalador mostra exceção não tratada

- **Estado:** Implementado; validação pendente.
- **Relato/reprodução:** Ao remover instalação anterior para instalar rebuild, CheckClosed bloqueia e a exceção chega ao JIT. Processo/porta responsável não identificado.
- **Correção, prova e pendências:** Captura async e retorno à confirmação implementados. Compilação C# e 2 testes de contrato passaram. Falta testar aviso, retry e remoção real com dados preservados.
- **Versão corretiva entregue:** nenhuma.

## ALPHA-002 — Atalho com timestamp e identificador interno

- **Estado:** Aberto.
- **Relato/reprodução:** Atalho aparece como 3Mix Studio (20261109-125241-10f8f0).
- **Correção, prova e pendências:** Política de nomes/propriedade ainda não corrigida. Não sobrescrever atalhos de instalações paralelas.
- **Versão corretiva entregue:** nenhuma.

## ALPHA-003 — Texto Motor conectado repetido

- **Estado:** Implementado; validação pendente.
- **Relato/reprodução:** Usuário pediu retirar inscrição repetida em várias telas.
- **Correção, prova e pendências:** Seis indicadores passaram a Conectado; desconexões preservadas. Sintaxe passou. Falta inventário e validação visual; não afirmar cobertura total.
- **Versão corretiva entregue:** nenhuma.

## ALPHA-004 — Splash informa modo portátil na instalação pelo EXE

- **Estado:** Implementado; validação pendente.
- **Relato/reprodução:** Instalação local completa exibe rótulo modo portátil, confundindo o usuário.
- **Correção, prova e pendências:** Rodapé alterado para Inicialização na fonte. Falta conferir splash real. Nenhuma entrega corretiva publicada.
- **Versão corretiva entregue:** nenhuma.

## ALPHA-005 — Janela de input fica minimizada ou atrás após Buscar

- **Estado:** Implementado; validação pendente.
- **Relato/reprodução:** Adicionar vídeo, Buscar, escolher arquivo no Windows, Abrir; precisa recuperar janela pela barra. Também testar Cancelar.
- **Correção, prova e pendências:** Caller URL e owner Qt ajustados; tentativa de restaurar foco. 16 testes JS/contrato passaram. C++ não compilado e foco real Windows não validado.
- **Versão corretiva entregue:** nenhuma.

## ALPHA-006 — Texto cortado abaixo do progresso no passo 7

- **Estado:** Implementado; validação pendente.
- **Relato/reprodução:** Durante instalação do rebuild, legenda inferior fica truncada.
- **Correção, prova e pendências:** Fonte: legenda 26 para 54 e cartão 170 para 194. Falta build e prova visual em DPI 100/125/150/200%.
- **Versão corretiva entregue:** nenhuma.

## ALPHA-007 — Histórico de Sobre não inclui 0.1.5

- **Estado:** Aberto.
- **Relato/reprodução:** Sobre mostra Alpha 0.1.4.1 como entrada mais recente na instalação 0.1.5.
- **Correção, prova e pendências:** Conferir versão/data/mudanças reais no histórico, version.json, splash e instalador, inclusive cópia servida e pacote final. Correção específica ainda não comprovada.
- **Versão corretiva entregue:** nenhuma.

## Antecedente PRE-001 — Splash bloqueado pelo PowerShell

RC1 original: UnauthorizedAccess por política de execução. Exceção restrita ao processo autorizada pelo usuário e integrada ao rebuild. Usuário confirmou splash e programa após reparo avulso. Não equivale a confirmação de instalação completa do novo EXE. Não misturar com os sete achados posteriores.

## Distribuição e repositório — separados dos bugs do aplicativo

Release RC1 publicada e destacada como Latest; produto continua RC Alpha sem homologação estável. Legado FreeMix ocultado como draft. Limpeza Git integrada à main. Consolidação de todas as fontes ainda incompleta. Canal automático não homologado. Não apresentar esses itens como falhas funcionais resolvidas.

## Fluxo para a próxima atualização

- **main:** fonte principal integrada, sem correções diretas improvisadas.
- **develop:** linha de integração da próxima atualização, partindo da main atual. Branch develop criada a partir da main; registro inicial publicado nela. Não mudar branch no checkout compartilhado sujo nem carregar tudo automaticamente.
- Commits delimitados por achado; branches curtas quando houver paralelo ou risco. Não criar branch para cada tarefa trivial.
- Motor permanece em 3mix-engine e na linha nativa correspondente: não mesclar raiz OBS na raiz do painel. Relacionar commit/build nativo ao candidato integrado.
- Testar correções juntas em candidato identificável; registrar prova por ID. Só então merge de develop para main.
- Atualização pelo sistema exige consulta/download/assinatura/aplicação/reabertura/rollback comprovados antes de publicar feed.
- Após integração confirmada, remover branches curtas redundantes. Preservar as ativas, gh-pages e histórico nativo necessário. Sem push forçado.

## Modelo de novo relato

### ALPHA-NNN — Título
- Versão/build e ambiente:
- Equipamento/modelo/driver:
- Passos numerados para reproduzir:
- Esperado e observado:
- Frequência/impacto:
- Evidência/diagnóstico sem segredos:
- Estado/responsável:
- Commit/build candidato:
- Testes e resultado:
- Versão corretiva entregue:

## Critério de encerramento

Validar no ambiente afetado, repetir a reprodução e conferir regressões pertinentes. Identificar a versão que contém a correção. Se teste não ocorreu, manter pendente. Novos achados e mudanças de estado devem ser registrados aqui antes de declarar conclusão no chat.
