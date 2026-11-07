# 3Mix — Manuais do sistema

Escolha o manual pela tarefa. O código-fonte, o pacote distribuído e a instalação em uso podem estar em versões diferentes; confirme a versão e os recursos presentes na instalação antes de operar.

| Documento | Para quem | O que tem | Onde abrir |
|---|---|---|---|
| **[Manual do Operador](usuario/manual-operador.html)** | Corte, áudio, produção e operação remota | Fluxos da Mesa e módulos de produção, com o estado e os limites próprios de cada recurso | No programa: **Hub › Manual do operador** ou **Sobre e suporte › Manual do operador**; no repositório, abra o arquivo no navegador |
| [`GUIA-RAPIDO.md`](GUIA-RAPIDO.md) | Quem abre o 3Mix pela primeira vez | Uma página: instalar, abrir, primeiro corte, gravar, transmitir, DUMP e Pre-Flight | Na pasta `docs/` |
| [`LEIA-ME-BETA.md`](LEIA-ME-BETA.md) | Quem instala e distribui a Alpha | Requisitos, instalação pelo ZIP ou instalador, aviso do Windows, SHA-256, atualização e desinstalação | Na pasta `docs/` |
| [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md) | Quem testa, vende ou dá suporte | O que não funciona ou não foi provado, com a fonte de cada item | Na pasta `docs/` |
| [`SOLICITAR-SUPORTE.md`](SOLICITAR-SUPORTE.md) | Quem encontrou um problema | Como gerar o pacote de diagnóstico e o que mandar | Na pasta `docs/` |
| [`CHANGELOG.md`](CHANGELOG.md) | Todos | Novidades de cada versão | Na pasta `docs/` |
| [`INSTALACAO.md`](INSTALACAO.md) | Suporte técnico | Registro técnico do instalador de outubro (anterior à Alpha) | Na pasta `docs/` |
| [`MANUAL-GERENCIADOR-PLUGINS.md`](MANUAL-GERENCIADOR-PLUGINS.md) | Manutenção local | Inventário, instalação por ZIP, reinício, diagnóstico, rollback e modo de segurança dos plugins nativos | **Configurações → Plugins**, somente no computador do 3Mix, quando o recurso estiver presente naquele pacote |
| [`API.md`](API.md) | Integrações e automações | HTTP, WebSocket, autenticação, controle, respostas e limites; inclui índice gerado das rotas | Na pasta `docs/` |
| **Manual técnico** (`painel/docs/manual.html`) | Desenvolvimento e manutenção | Histórico técnico: o que foi implementado, testes, relatórios. Não é leitura de operação | Aba **Manual técnico** no alto do Manual do Operador |

## Por área do sistema

| Área | Manual ou referência | Antes de usar no ar |
|---|---|---|
| Mesa, Inputs, DSK, M/E e composição | [Manual do Operador](usuario/manual-operador.html), [Guia Rápido](GUIA-RAPIDO.md) | Confira Preview, Programa, canal e confirmação no motor. A strip principal mostra DSK 1–4; o editor de overlays e os cartões de Input alcançam 1–8. |
| Áudio, Calls, Crew e retornos | [Manual do Operador](usuario/manual-operador.html), [Calls e saídas](OPERAR-CALLS-E-SAIDAS.md) | Teste retorno/N-1 e áudio real. Calls WAN e uso simultâneo de Calls com Intercom Crew têm limites registrados. |
| Replay, ISO, playout e rundown | [Manual do Operador](usuario/manual-operador.html), [limites conhecidos](LIMITES-CONHECIDOS.md) | Ensaios locais não substituem prova de duração, sincronismo e recuperação. |
| GC, Color Studio, chroma e slides | [Manual do Operador](usuario/manual-operador.html), [catálogo de GC](GRAPHICS_GC_CATALOG.md) | Confirme no Programa e na saída de destino, não apenas na prévia do editor. |
| Gravação, transmissão, DUMP, NDI/OMT/SRT e SDI | [Guia Rápido](GUIA-RAPIDO.md), [Manual do Operador](usuario/manual-operador.html), [matriz de hardware](MATRIZ-HARDWARE-HOMOLOGADO.md) | Verifique versão do motor, destino, áudio e evidência por dispositivo/protocolo. O DUMP cobre somente a transmissão principal. |
| Pré-Flight, caixa-preta e diagnóstico | [Manual do Operador](usuario/manual-operador.html), [solicitar suporte](SOLICITAR-SUPORTE.md) | Trate **NÃO VERIFICADO** como uma pendência de conferência; a caixa-preta registra telemetria, não vídeo. |
| Plugins nativos e atualização | [Gerenciador de Plugins](MANUAL-GERENCIADOR-PLUGINS.md), [manutenção e atualizações](MAINTENANCE_AND_UPDATES.md) | Ação preparada só passa a valer após reinício seguro e confirmação de carga. |
| API e painéis remotos | [API](API.md), [arquitetura](ARCHITECTURE.md) | Verifique `/api/health`, pareamento, permissões locais e estado `connected` antes de automatizar. |

Esta tabela é um mapa de leitura, não um selo de homologação. Para recursos ainda não ensaiados no hardware ou na rede de destino, veja [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md).

## Imagens

As imagens do Guia Rápido e do Leia-me ficam em `docs/capturas/manual/`. A revisão atual do Manual do Operador em HTML é textual e tem uma versão PDF A4 gerada da mesma fonte; não use os prints históricos como prova de que a instalação atual tem a mesma tela. Há capturas de Mesa, Áudio, Replay e Color da instalação em uso em `docs/capturas/3mix/`, e outras de uma bancada isolada com o projeto Demonstração Compacta. Endereços de rede da máquina estão cobertos no print do Hub.

Os scripts que geraram os prints estão em `qa-manuais/` (`bancada.mjs`, `capturar-manual.mjs`, `capturar-dump-extra.mjs`).
