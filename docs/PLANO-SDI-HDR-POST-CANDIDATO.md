# SDI HDR posterior ao candidato Native99

Dono: agente `transportes_rede_conclusao`. Root integra, compila e empacota em série. A autorização recebida em09/10 permite implementar esta frente; os resultados não pertencem ao EXE `1c045e5d...` nem ao candidato já selado.

## Contrato encontrado

O SDK Windows de `plugins/decklink/win/decklink-sdk` contém `bmdFormat10BitRGBXLE`, `bmdFrameContainsHDRMetadata`, `IDeckLinkVideoFrameMetadataExtensions`, `BMDDeckLinkSupportsHDRMetadata`, `BMDDeckLinkSupportsColorspaceMetadata`, `BMDDeckLinkSupportedDynamicRange`, `DoesSupportVideoMode` e a indicação `bmdDisplayModeColorspaceRec2020`. Não falta uma licença de SDK para escrever esta rota. A homologação da placa, driver e sinal físico continua necessária.

A rota 3Mix atual força SDR e BGRA8. O plugin original decide HDR pelo canvas global e anuncia EOTF PQ com pico global. Nenhuma dessas decisões serve para uma view HDR independente de origem real enquanto o monitor principal permanece SDR.

No libobs deste checkout, a saída R10L direta não tem conversão implementada e a textura cairia em BGRA8. A implementação usará view P416 HDR de16bits com renderização float; no plugin, YUV444 limitado Rec2020 será convertido em RGBX10LE sem passar por8bits. O formato de dez bits e o suporte do driver serão comprovados antes de iniciar. HDR com keyer/alpha será recusado.

## Arquivos previstos

- `plugins/decklink/FreeMixDecklinkHdrContract.hpp`: validação pura de contrato, metadata e conversão precisa.
- `plugins/decklink/decklink-output.cpp`, `DecklinkOutput.hpp`: opt-in explícito, preflight e formatos da mídia independente.
- `plugins/decklink/decklink-device.hpp/.cpp`: atributos reais do dispositivo e conexões.
- `plugins/decklink/decklink-device-instance.cpp`: fila/stride, formato10bit, metadata e rollback seguro.
- `plugins/decklink/OBSVideoFrame.h/.cpp`: metadata PQ/HLG própria da saída; caminho original preservado.
- `frontend/widgets/FreeMixSdiOutput.hpp`, `FreeMixVideoTransports.hpp`: fonte HDR real, persistência sem autostart, capabilities/preflight e áudio público.
- `obs-vmix/ferramentas/saidas-sdi.mjs` e UI SDI específica: contrato acessível ao usuário e mensagens precisas.
- QA e relatório próprios em `qa-finalizacao/sdi-hdr/` e `docs/`.

Não editar OMT HDR, ASIO, API/controle central, empacotador, Git mirror ou build compartilhado. Integrações centrais serão enviadas separadamente ao root.

## Evidência necessária

1. Compilar e executar contrato C++ com enums/headers reais do SDK: precisão10bit, cores, PQ/HLG, metadata inválida, dimensões/stride e origem incompatível.
2. Mocks das chamadas do SDK: recusa de driver sem flags/formato/Rec2020, lifecycle, falha em cada etapa de ativação e rollback.
3. Compilação do plugin/front e QA em raiz isolada, quando root disponibilizar novo build; não atribuir implementação ao candidato anterior.
4. Ensaio físico continua separado: placa/driver, monitor/analisadorHDR, metadata do sinal e áudio síncrono. Sem hardware, o status máximo é contrato/mock e integração local, não saída física homologada.

Status: implementação Native/API/UI entregue para integração posterior do root. Contrato, SDK mock, fila, sintaxe e UI passaram em QA isolada. Build/link Native772db16 e guards negativos stage2 passaram. O runtime não inicializou DeckLink/driver; capacidades/sinal SDI físico continuam inconclusivos. Texto de erro foi refinado em Nativea98f62b, ainda aguardando o próximo build. Consulte RELATORIO-SDI-HDR-POST-CANDIDATO-20261009.md.
