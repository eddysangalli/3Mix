# Gerenciador de Plugins OBS — auditoria e validação de 04/11/2026

## Estado e limites da evidência

O trabalho desta rodada é no código-fonte do `3mix-engine` e do `3mix-panel` e em QA dentro deste workspace. O `3mix-runtime` do operador estava em execução durante a implementação (3Mix.exe e API local); seus arquivos e processos não foram usados como alvo de instalação ou reinício. Um teste estático de ZIP, de API ou de interface não equivale a carregar o módulo no motor novo, nem a homologar hardware ou operação broadcast.

## Auditoria do que já existia

- O fork nativo está em OBS/libobs 32.2.2 e já contém `frontend/plugin-manager/PluginManager.cpp`: inventário dos módulos carregados, tipos registrados e habilitação/desabilitação para o reinício seguinte. A seção Configurações → Plugins do painel já expunha ferramentas nativas selecionadas. A implementação preserva esses caminhos.
- A busca padrão do libobs Windows 32.2.2 usa `obs-plugins/64bit` e `data/obs-plugins/%module%`. O diretório do runtime mistura módulos do OBS, plugins de terceiros já integrados e DLLs auxiliares; ele não é um destino seguro para instalação de ZIPs novos.
- O inventário de leitura em `qa-finalizacao/plugin-manager-20261104/inventario-runtime.json`, produzido por `auditar-modulos.ps1`, registrou 74 PE x64 (73 DLLs e `3Mix.exe`). Entre as 73 DLLs, 46 exportam `obs_module_load`, 26 são auxiliares na pasta de plugins e uma é `obs.dll`. Nove arquivos têm assinatura Authenticode válida e 65 não têm assinatura. Ausência de assinatura não prova adulteração.
- Doze arquivos têm correspondência declarada em `componentes.json`. Os hashes declarados para `obs.dll`, `downstream-keyer.dll` e `source-record.dll` divergem dos bytes atuais: o manifesto está desatualizado para esses arquivos; a divergência, por si só, não identifica sua causa. A seção Diagnóstico deve sinalizar dados declarados ausentes ou divergentes, sem classificá-los automaticamente como comprometimento.
- As versões de arquivo do runtime incluem Advanced Scene Switcher 1.36.1, DistroAV 6.2.1, Shaderfilter 2.6.0, ASIO 3.2.1, LocalVocal 0.6.2 e Replay Source 1.8.1. Versão de arquivo, importações PE e presença da DLL são evidência limitada; recursos exigem registro no libobs e teste de uso. Licenças/proveniências estão em `3mix-runtime/licenses/` e relatórios específicos; não há comprovação homogênea para todos os 46 módulos.

## Arquitetura adotada

- Plugins novos ficam exclusivamente em `3mix-plugins/<id>/<id>.dll` com dados em `3mix-plugins/<id>/data/`, dentro da instalação do 3Mix. O carregador nativo registra esse caminho, sem usar a instalação independente do OBS Studio. O layout copia a estrutura por plugin recomendada para OBS 33 portátil, mantendo uma raiz exclusiva do 3Mix.
- A API prepara instalação, atualização, remoção, desativação e rollback; a aplicação física ocorre antes da próxima inicialização do motor, quando a instância anterior estiver encerrada. A versão anterior é preservada em backup. Projetos e perfis do operador não são apagados por essas ações.
- O ZIP é inspecionado estaticamente: caminhos, entradas duplicadas, limites de expansão, CRC, PE x64, export `obs_module_load`, imports da libobs e dependências. Hash SHA-256 e estado Authenticode são registrados; compatibilidade final depende de carregamento e operação no motor real. Instaladores EXE não são executados.
- A leitura de recursos usa o registro do libobs após carregar o módulo. Recursos de interface Qt/docks próprios requerem adaptador específico; a presença de uma QAction não equivale a uma tela integrada à Mesa.
- O modo de segurança omite os módulos do diretório gerenciado; um relatório de inicialização identifica `loading`/`complete`, último plugin alterado, carga ou falha. O estado gerenciado tem precedência sobre a desativação legada do Plugin Manager nativo para os IDs que gerencia.

## OBS 33 e catálogo

A [nota oficial do OBS 33.0.1](https://github.com/obsproject/obs-studio/releases/tag/33.0.1) descreve a mudança de localização, o Plugin Manager e CEF 150/7871; CEF 156 do pedido é hipótese para uma migração separada, ainda sem validação de integração. O [guia oficial de plugins legados](https://obsproject.com/kb/legacy-plugin-developer-info) define a nova estrutura portátil e avisa que plugins com dependências complexas exigem orientação do autor. Nenhum plugin é classificado como compatível com 33 apenas por ter DLL x64 ou por carregar no 32.2.2.

`config/plugin-catalog.json` contém somente versões fixadas em releases oficiais e verificadas no histórico local. As cinco entradas iniciais já acompanham o runtime, portanto não oferecem instalação duplicada nem download automático. O catálogo registra a origem, licença, hash do ZIP oficial quando confirmado e a versão 32.2.2 em que há evidência local. DistroAV depende ainda do NDI Runtime e seus termos; ASIO depende de driver/dispositivo; Cloud Closed Captions usa serviço externo. O catálogo pode receber versões novas apenas após revisão específica de licença, dependências e integração.

## Gates de validação

| Gate | Evidência necessária | Estado nesta rodada |
|---|---|
| ZIP e ciclo de vida | Casos positivos e negativos em raiz de QA, incluindo múltiplas operações, backup e rollback | 7/7 testes automatizados passaram em 05/11/2026. A verificação cobre instalação, atualização, rollback, remoção, retomada de rollback interrompido, duas operações pendentes, bloqueio de produção inclusive no Safe Mode, preservação de perfil, proteção dos layouts nativos OBS 32/33, rejeições estáticas, colisões de nomes no Windows, scripts e arquivos multipart duplicados, limite declarado de upload, estado/fila corrompidos e trava entre launchers. Continua sendo simulação de reinício em filesystem, não carga no motor. |
| Interface | Quatro áreas, estado efetivo vs pendente e bloqueio durante produção | 2/2 testes de interface passaram em 05/11/2026; integração com o motor continua pendente. |
| Motor real | Build nativa atual, instalar plugin terceiro, reiniciar, confirmar registro/uso, desativar/remover e reiniciar | Em execução |
| Hardware e operação | Placas/GPUs/dispositivos específicos, M/Es, DSKs, saídas, duração e recuperação | Roteiro Alpha na Missão 14 de `PEDIDO-COMUNIDADE-ALPHA.md`; ainda não homologado |

Na validação de 05/11/2026, a chamada de Authenticode feita pelo Node encontrou primeiro um módulo do PowerShell 7 incompatível com o `powershell.exe` 5.1. O verificador passou a importar explicitamente o módulo `Microsoft.PowerShell.Security` nativo do Windows. Essa correção revelou e permitiu corrigir um segundo defeito: a instalação inicial criava um diretório de backup vazio, que podia ser escolhido pelo rollback por ordenação de UUID. Backups agora só são anunciados quando contêm efetivamente uma cópia do plugin, e o rollback seleciona a cópia existente mais recente pelo horário do diretório. O processamento pendente também ganhou validação estrutural de estado/fila e trava de arquivo com identificação do processo e token de propriedade; uma trava abandonada por processo inexistente pode ser recuperada sem remover a trava ativa de outro launcher.

Este arquivo deve ser atualizado com os resultados reais antes de declarar o gerenciador concluído ou incluído no pacote do operador.
