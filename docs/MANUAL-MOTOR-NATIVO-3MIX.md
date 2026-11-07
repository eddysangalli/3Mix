# Manual técnico do motor nativo 3Mix

**Revisão:** 6 de novembro de 2026  
**Base examinada:** `3mix-engine` em `d328c1924`  
**Público:** desenvolvimento, integração, suporte e QA. Para a operação da mesa, use o manual do painel 3Mix.

Este documento descreve as funções encontradas no código do motor. **Presença no código, compilação e teste de protocolo não demonstram funcionamento em hardware, qualidade audiovisual, estabilidade prolongada ou prontidão de lançamento.** A experiência do operador deve seguir a [visão de produto](../../3mix-panel/docs/PRODUCT-VISION.md): o INPUT é a unidade visível, e os conceitos internos de libobs não devem ser expostos como fluxo principal.

## 1. Onde cada peça vive

| Peça | Responsabilidade no workspace |
| --- | --- |
| `3mix-engine/` | libobs, interface nativa Qt, módulos e ponte com o painel. |
| `3mix-panel/` | Mesa web, painéis de operação e API Node.js. |
| `3mix-runtime/` | Instalação portátil usada pelo operador; não é diretório de desenvolvimento ou de QA. |
| `3mix-io/` | Captura e transporte I/O standalone. |

O processo nativo inicializa libobs e módulos em [`OBSBasic.cpp`](../frontend/widgets/OBSBasic.cpp), oferece comandos adicionais ao painel pelo vendor `freemix` do obs-websocket em [`FreeMixMultistream.cpp`](../frontend/widgets/FreeMixMultistream.cpp), e usa a interface 3Mix composta pelos docks `3mix.mesa` e `3mix.menu`. O nome interno `freemix` permanece em contratos e arquivos legados; a marca apresentada ao operador é **3Mix**.

## 2. Inicialização e identidade visual

1. A interface nativa precisa de CEF e dos dois docks 3Mix. Se eles não estiverem presentes e visíveis, a inicialização lança erro antes de mostrar uma mesa padrão do OBS. Confira a guarda em [`OBSBasic.cpp`](../frontend/widgets/OBSBasic.cpp).
2. O título da janela é `3Mix Studio`; o ícone configurado no aplicativo é `:/res/images/3mix.png`. Isso está no código, mas a aparência efetiva em Windows ainda requer inspeção visual da build em questão.
3. O modo portátil é aceito por `--portable` ou pelos marcadores previstos em [`obs-main.cpp`](../frontend/obs-main.cpp). Ele **não** autoriza reutilizar ou alterar a instalação do operador para testes.
4. Safe Mode desabilita plugins de terceiros. Além do argumento nativo, o carregador lê `safeMode` de `3mix-plugin-manager/state.json`; veja [`PluginManager.cpp`](../frontend/plugin-manager/PluginManager.cpp) e a decisão de carga em [`OBSBasic.cpp`](../frontend/widgets/OBSBasic.cpp).

Antes de iniciar qualquer build de QA, confirme tema, configuração e docks fechados do 3Mix. Use somente diretórios de QA dentro do projeto; não inicie a instalação do operador nem encerre processos de transmissão para liberar arquivos.

## 3. Contrato com o painel

O vendor `freemix` é registrado quando o frontend termina de carregar e depende do obs-websocket disponível. A lista e o registro efetivos estão em [`FreeMixMultistream.cpp`](../frontend/widgets/FreeMixMultistream.cpp). Grupos de chamadas presentes:

| Grupo | Chamadas registradas | Nota de operação |
| --- | --- | --- |
| Mesa e projeto | `fade_to_black`, `final_program_gate`, `control_mix`, `get_mixes`, `ensure_merge_transition`, `save_preset`, `get_preset`, `reorder_inputs` | Mutação é coordenada na thread de interface; validar o resultado após comandos assíncronos. |
| Destinos e vídeo | `get_destinations`, `set_destinations`, `control_destination`, `network_output`, `omt_hdr_output`, `srt_hdr_output`, `sdi_output`, `virtual_cam_source` | Cada saída exige seu próprio preflight e disponibilidade de SDK, encoder, driver ou dispositivo. |
| Áudio e Calls | `talkback`, `call_audio`, `call_video`, `audio_capabilities`, `get_master_level` | `call_video` está registrado, mas aponta para implementação vazia; veja seção 5. |
| Interface e inventário | `get_interface`, `get_sources_status`, `open_settings`, `open_panel`, `close_panel`, `set_panel_title`, `project_creation_policy`, `project_device_inventory`, `get_scope`, `set_scope` | Um inventário não prova captura ativa ou saúde do sinal. |
| Segurança de transmissão | `broadcast_delay`, `shutdown_idle` | O DUMP só informa êxito quando o motor confirma descarte de pacotes. |

O nome da chamada indica uma superfície de integração, **não** um recurso homologado. A UI deve consultar capacidades e estado retornados pelo motor, mostrar recusas de preflight e evitar presumir que um dispositivo ou SDK está disponível.

## 4. Recursos nativos encontrados

| Área | Evidência de implementação | Limite atual |
| --- | --- | --- |
| Mesa, Preview/Program e overlays | [`OBSBasic.cpp`](../frontend/widgets/OBSBasic.cpp) define o fluxo de troca Preview/Program; [`FreeMixCenterColumn.hpp`](../frontend/widgets/FreeMixCenterColumn.hpp) descreve oito canais de overlay, relógios e medidor Master. | O [checkpoint OBS 33](qa-obs33/STATUS.md) comprova uma seleção/transição por WebSocket nativo, não clique visual completo nem operação no ar. |
| Saídas adicionais e rede | [`FreeMixMultistream.cpp`](../frontend/widgets/FreeMixMultistream.cpp) mantém destinos adicionais e registra OMT/NDI; [`FreeMixOmtOutput.hpp`](../frontend/widgets/FreeMixOmtOutput.hpp) e [`FreeMixNdiOutput.hpp`](../frontend/widgets/FreeMixNdiOutput.hpp) implementam senders. | Exigem SDK e receptor compatíveis. Qualidade, sincronismo e endurance continuam dependentes de teste ponta a ponta. |
| OMT HDR | [`FreeMixOmtHdrOutput.hpp`](../frontend/widgets/FreeMixOmtHdrOutput.hpp) cria saída P216 com transferência PQ ou HLG escolhida manualmente no receptor e bloqueia alpha/Fill+Key nesta rota. | O protocolo OMT 1.0 não anuncia essa transferência; a confirmação manual do receptor faz parte do preflight. Não há homologação física aqui. |
| SRT HDR | [`FreeMixSrtHdrOutput.hpp`](../frontend/widgets/FreeMixSrtHdrOutput.hpp) tem rota manual opaca HEVC Main10/P010/PQ; [`FreeMixSrtHdrLifecycle.hpp`](../frontend/widgets/FreeMixSrtHdrLifecycle.hpp) recusa fechar/trocar contexto se a drenagem de recursos falhar. | O próprio arquivo identifica a rota como draft. Requer encoder e muxer carregados e teste real de recepção e parada. |
| SDI/DeckLink | [`FreeMixSdiOutput.hpp`](../frontend/widgets/FreeMixSdiOutput.hpp) usa a saída DeckLink, configura somente modos anunciados e faz preflight HDR no plugin/driver; [`FreeMixVideoTransports.hpp`](../frontend/widgets/FreeMixVideoTransports.hpp) separa inventário em cache de consulta explícita ao driver. | Cache não é detecção de hotplug; o retorno de inventário fixa `hdrPhysicalVerified=false`. Conferir placa, Desktop Video, sinal e receptor reais. |
| Áudio independente | [`FreeMixAudioRouting.hpp`](../frontend/widgets/FreeMixAudioRouting.hpp) define um contexto PCM por bus independente; [`FreeMixCallAudio.hpp`](../frontend/widgets/FreeMixCallAudio.hpp) expõe Calls áudio e observabilidade de clock. | Estado/clock não certificam sincronismo audiovisual. A rota privada do diretor não pode vazar para destinos públicos. |
| Atraso e DUMP | [`FreeMixMultistream.cpp`](../frontend/widgets/FreeMixMultistream.cpp) responde `state` e `dump`, chamando `obs_output_delay_dump` e retornando contagens descartadas. | Só há descarte se stream e atraso estiverem ativos. Confirmar o efeito audiovisual e recuperação em QA de transmissão. |
| Inventário de criação de projeto | [`FreeMixProjectInventory.cpp`](../frontend/widgets/FreeMixProjectInventory.cpp) enumera DShow, WASAPI e filtros, sem iniciar captura nem mudar configurações de fontes existentes. | A consulta pode abrir metadados do driver; não é teste de câmera, áudio ou desempenho. |

## 5. Limites e recursos indisponíveis

- **Vídeo de Calls:** [`FreeMixDisabledFeatures.hpp`](../frontend/widgets/FreeMixDisabledFeatures.hpp) contém `FreeMixCallVideoRequest`, registro e tick vazios; o arquivo é incluído pela ponte nativa. Não documentar `call_video` como videochamada funcional até substituir esse stub e validar o fluxo.
- **Câmera virtual:** a build Windows desabilita o módulo se `VIRTUALCAM_GUID` estiver vazio ou inválido, conforme [`plugins/win-dshow/virtualcam-module/CMakeLists.txt`](../plugins/win-dshow/virtualcam-module/CMakeLists.txt). A presença de controles de UI não prova que a câmera está instalada.
- **Plugin Manager:** o frontend registra carga, Safe Mode e gera `load-report.json` em [`PluginManager.cpp`](../frontend/plugin-manager/PluginManager.cpp). O módulo [`plugins/3mix-plugin-manager/plugin-manager.cpp`](../plugins/3mix-plugin-manager/plugin-manager.cpp) ainda possui funções nativas de inspeção, instalação e enfileiramento que retornam sucesso com resultados vazios ou `pending`. Não use essas funções como prova de instalação/rollback; a documentação do painel deve indicar o fluxo Node efetivo e seus testes.
- **Nome legado:** `freemix` em nomes de vendor, funções e arquivos é detalhe de compatibilidade do código atual. A interface e os manuais para o usuário devem usar 3Mix.

## 6. Estado de validação e manutenção do manual

O [checkpoint de QA OBS 33](qa-obs33/STATUS.md) registra um teste nativo de seleção/transição e um caminho de fechamento `Descartar e fechar`. Nele ainda constam pendências de interação visual, dock, DPI, outros caminhos de fechamento, alocações, instalação/rollback e hardware. Ele afirma que a instalação do operador não foi substituída e que o Alpha não está qualificado.

Ao acrescentar uma função a este manual, conferir nesta ordem: código ativo e flags de build; contrato do painel; teste executado na mesma build; evidência visual/hardware quando a afirmação depender disso. Diferenciar **implementado no código**, **testado em bancada** e **homologado para operação**. Atualizar o checkpoint correspondente sem transformar intenção de produto em recurso já entregue.
