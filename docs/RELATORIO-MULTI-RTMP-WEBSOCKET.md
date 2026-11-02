# Multi-RTMP com WebSocket versus saídas 3Mix

Conferência de fonte em 08/10/2026. O fork tem utilidade como backend opcional para instalações que já usam Multi-RTMP, sobretudo por oferecer destinos dinâmicos e grupos de encoders. Não resolve uma ausência de conteúdo independente no 3Mix: o motor atual já implementa essa seleção, inclusive Mix 2/3/4. Recomendo preservar o backend nativo e avaliar interoperabilidade separadamente.

Nenhum binário foi instalado, nenhum perfil do operador foi modificado e nenhuma transmissão foi iniciada nesta avaliação. Compatibilidade binária e funcionamento do fork no 3Mix **não foram testados**.

## Versão e evidência

- Repositório: [davidcool/obs-multi-rtmp-websocket-support](https://github.com/davidcool/obs-multi-rtmp-websocket-support).
- Fonte fixada: [`d81f40b769c4f1460132d8bc06207027c681e359`](https://github.com/davidcool/obs-multi-rtmp-websocket-support/commit/d81f40b769c4f1460132d8bc06207027c681e359), commit de 10/09/2026.
- Release estável consultada: [`v0.7.4.3-ws0.3`](https://github.com/davidcool/obs-multi-rtmp-websocket-support/releases/tag/v0.7.4.3-ws0.3), publicada em 10/09/2026. O ZIP Windows x64 anunciado tem 2.432.819 bytes; isso é metadado do GitHub, não validação do DLL.
- `resultado-multi-rtmp-source.json` registra commit, releases e SHA256 dos 32 arquivos consultados; a cópia está em `multi-rtmp-websocket-source/`. É um conjunto de evidências da auditoria, **não uma árvore completa para redistribuir um plugin compilado**.
- O [buildspec](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/buildspec.json) fixa OBS **32.2.1** e dependências/Qt de 15/07/2026. O `freemix-app/build_2026/CMakeCache.txt` local identifica **32.2.2**. A proximidade de versões sugere possibilidade de integração, mas não prova ABI/Qt, carregamento ou estabilidade.
- [CMakeLists.txt](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/CMakeLists.txt) habilita WebSocket somente quando encontra `obs-websocket-api.h`; o nome da release, sozinho, não substitui uma consulta real ao vendor.

## Comparação verificável

| Área | Fork inspecionado | 3Mix atual, fonte local |
|---|---|---|
| Quantidade | Lista dinâmica de targets, sem teto fixo encontrado nas estruturas auditadas; limitada na prática pelo motor/máquina. | Quatro destinos adicionais, além da saída principal OBS. |
| Conteúdo | Programa quando compartilha encoder principal; com encoder próprio, cena selecionada **por nome**, via `obs_view_create`. | Programa, Preview, Clean, cena por **UUID**, Mix 2/3/4; seleção de overlays e resolução/orientação por destino. |
| Encoders | Compartilha encoder do streaming ou gravação OBS; configurações com mesmo ID reutilizam encoder próprio. | Modo compartilhado no nativo; modos independentes criam encoders por destino, com validação de codec/protocolo, tamanho e divisor FPS. A UI atual escolhe modos independentes. |
| Áudio | Encoders OBS usando mixer/track; lista de tracks adicionais por configuração. A cena de vídeo não implica áudio isolado dessa cena. | Track selecionável por destino; Master/A/B, incluindo áudio de stinger no Mix selecionado. |
| Protocolos | Tabela `RTMP`, `SRT_RIST`, `WHIP`; saída WHIP depende de `whip_output` disponível e encoders compatíveis. | RTMP/RTMPS, SRT, RIST, HLS com descoberta real de codecs; Enhanced RTMP explícito. NDI/OMT seguem outra interface de rede. WHIP não consta da configuração atual desses quatro destinos. |
| Persistência | `obs-multi-rtmp.json` no perfil OBS; mudança de perfil recarrega o dock. | Destinos/mixes no perfil; presets de destinos sem chaves no namespace da produção. Recuperação restaura configurações em perfil novo, desligadas. |
| Automação | `syncStart`/`syncStop` acompanham início/fim da saída principal; eventos locais do motor, sem emissão de VendorEvent encontrada. | Comandos por destino, macros/controladores e leitura de estado do motor. Início automático é opção explícita da configuração. |

Fonte upstream: [push-widget.cpp](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/src/push-widget.cpp), [output-config.cpp](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/src/output-config.cpp), [protocols.cpp](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/src/protocols.cpp). Fonte 3Mix: `obs-vmix/ferramentas/saidas-producao.mjs` e `freemix-app/frontend/widgets/FreeMixMultistream.cpp`. A tabela descreve implementação, não homologação de cada protocolo em serviço externo.

## API real e ciclo de vida

O vendor é `sorayuki.multi_rtmp`, acessado por `CallVendorRequest`. São 16 requests registrados:

`list_targets`, `get_target_state`, `get_target_stats`; `start_target`, `stop_target`, `toggle_target`, `start_all`, `stop_all`; `add_target`, `clone_target`, `delete_target`, `update_target_name`, `update_stream_key`, `update_service_param`, `update_sync_start`, `update_sync_stop`.

A fonte [ws_vendor.cpp](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/src/ws_vendor.cpp) exige cuidados concretos:

- `start_target` retorna `start_requested` após agendar a chamada na UI. Isso não confirma conexão, envio de frames nem recepção remota. `IsRunning()` usa `obs_output_active`; pode abranger fases de conexão/reconexão. É necessário reler estado e manter diagnóstico separado da entrega de mídia.
- `list_targets`/`get_target_stats` retornam `isRunning`, `bitrateValue` em bps e `fpsValue` numéricos; `bitrate`/`fps` são textos. Os exemplos do README com `streaming`/`bitrate_bps`/FPS numérico não são o contrato desse código.
- O callback C é `void`: falhas próprias são escritas em `responseData.error`. Um `requestStatus.result` verdadeiro do OBS não garante sucesso do pedido interno.
- ID tem prioridade; busca por nome retorna o primeiro nome igual. Um adaptador deve usar somente ID estável.
- As 16 requests não oferecem edição de cena, resolução, parâmetros de encoder ou grupos de tracks. Essas configurações ficam no diálogo do plugin/arquivo de perfil, mesmo que o fork suporte renderização independente.
- `update_service_param.value` é lido como string; textos `"true"`/`"false"` são convertidos em booleanos depois. Não presumir um booleano JSON direto. A função também escreve chave/valor no log: não encaminhar segredos por essa rota.
- Leituras de widgets/configuração não têm o mesmo isolamento de thread das mutações agendadas. `delete_target` verifica edição aberta, mas não atividade da saída. O shutdown apenas zera o handle e escreve mensagem; não há chamada de remoção de requests nessa função. São pontos para ensaio isolado/revisão antes de habilitar mutações amplas, sem atribuir crash que não foi observado.

[obs-multi-rtmp.cpp](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/src/obs-multi-rtmp.cpp) cria o dock e inicializa o vendor no evento `FINISHED_LOADING`. [push-widget.cpp](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/src/push-widget.cpp) recebe sinais start/stop/reconnect do output e atualiza o status uma vez por segundo. Não foi encontrado evento WebSocket próprio para transmitir essas mudanças. Mudança de perfil e encerramento param os outputs; a coleção de cenas não aparece nesse tratamento, tornando relevante testar troca de coleção e referências por nome.

## Adaptador de inspeção implementado

Após aceite do contrato pela raiz, `obs-vmix/ferramentas/multi-rtmp-adapter.mjs` foi integrado ao `OutputEngine.read()` por **estado em cache** e à ação `outputs_external_read`. O cache começa sem consulta; `outputs_get` e o tick não interrogam o vendor externo. Consulta geral usa `list_targets`; consulta por ID combina `get_target_state` (protocolo/flags) e `get_target_stats` (métricas), que são respostas diferentes na fonte upstream. IDs divergentes, repetidos, tipos inválidos e `responseData.error` são rejeitados. Campos desconhecidos, URL e parâmetros/chaves de serviço não saem do adaptador.

A seção recolhível “Multi-RTMP externo” em `saidas.html/js` mostra destino/ID, protocolo, atividade, bitrate, FPS, duração e horário da última consulta; tem consulta manual geral/por ID. Ausência confirmada do vendor mostra “Plugin externo não instalado”; falha de conexão/resposta mostra indisponibilidade, sem inventar ausência. Não há comandos de start/stop, instalação, mudanças de perfil ou consulta automática. A atividade significa estado do motor, sem afirmar recepção remota.

`testar-multi-rtmp-adapter.mjs` executou **6 verificações de fixture**, registradas em `resultado-multi-rtmp-adapter.json`: contrato real/segredos, ID+stats, vendor ausente, falhas distintas de ausência, divergência README/API e consulta explícita. Syntax check do módulo/UI passou. Essas provas validam transformação e integração local do contrato, **não o plugin nativo**, que segue sem instalação/ensaio nesta frente.

O navegador executou ainda **3 verificações com API simulada** em `testar-multi-rtmp-interface.mjs`: mensagem de plugin ausente isolada, telemetria visível/consulta por ID e ausência de polling externo/transmissão. Evidência em `resultado-multi-rtmp-interface.json` e `multi-rtmp-interface.png`, sem erros de página. Nenhum servidor API existente foi usado: as rotas foram interceptadas pelo Playwright.

## Extensão futura de controle — proposta, não implementada

Um conector para instalações que **já tenham o fork carregado** pode expor `external_multi_rtmp_list`, `external_multi_rtmp_state`, `external_multi_rtmp_start` e `external_multi_rtmp_stop`. A ativação seria local e explícita, desligada por padrão, detectada por `list_targets`; vendor ausente retorna diagnóstico, sem instalar automaticamente.

Cada destino usa chave `external:multi-rtmp:<id>` e backend próprio, sem ocupar ou duplicar os quatro slots nativos. A camada normaliza os campos reais, não exporta URL/chave/arquivo de configuração e rejeita `responseData.error`. Start/stop retornam `requested` seguido de leitura por ID com prazo limitado; timeout preserva estado incerto, sem reemitir início automaticamente. `isRunning` significa apenas atividade do motor, nunca confirmação do servidor remoto.

Não incluir inicialmente `toggle`, `*_all`, criação/remoção, edição de chaves/parâmetros ou mudanças de `syncStart`/`syncStop`; não iniciar em boot/recovery. Configuração avançada continua na UI original do plugin. O ganho é compatibilidade com targets existentes e controles externos, não substituição do 3Mix nem alegação de destinos ilimitados. Antes de implementação, a raiz deve aceitar esse contrato e reservar QA com plugin instalado somente no clone.

## Licença e limites da entrega

A [LICENSE](https://github.com/davidcool/obs-multi-rtmp-websocket-support/blob/d81f40b769c4f1460132d8bc06207027c681e359/LICENSE) é GNU GPL versão 2; a API GitHub identifica `GPL-2.0`. Se um binário vier a acompanhar 3Mix, preservar avisos/licença e providenciar a fonte correspondente completa dessa versão/dependências conforme o fluxo de distribuição do projeto. O pequeno recorte de fonte desta auditoria não deve ser apresentado como fonte correspondente completa.

Esta entrega inclui comparação técnica com hashes reproduzíveis e adaptador manual de inspeção com provas de fixture. Permanecem sem ensaio: carregamento do DLL em OBS32.2.2/Qt do 3Mix, descoberta real do vendor, encoder compartilhado em grupos, WHIP, troca de perfil/coleção durante atividades e estabilidade prolongada. Nada disso foi marcado PASS por leitura de código.
