# Fill+Key e capacidades de vídeo

Implementação nesta rodada: par **OMT Fill+Key SDR de 8 bits**, usando duas instâncias do SDK oficial a partir do mesmo callback de vídeo e do mesmo timestamp. Fill envia RGB premultiplicado; Key envia alpha em RGB cinza opaco. O áudio é enviado somente por Fill. O par ocupa um slot 3Mix, possui dois nomes únicos e ambos os senders são encerrados juntos. A opção exige uma entrada/composição independente e não altera o Programa principal. NDI conserva alpha integrado e rejeita pedido de Key separado, pois o plugin carregado não oferece esse caminho.

`FreeMixVideoTransports.hpp` consulta as propriedades do output original OBS DeckLink: dispositivos, modos e keyer External/Internal são listados somente quando o plugin/driver os fornece. A consulta não cria ou inicia uma saída. `hardwareAvailable:false` significa que não há dispositivo disponível; não significa ausência do suporte no código OBS. A configuração permanece na ferramenta original DeckLink Output, acessível pelas ferramentas OBS.

O wrapper de rede entrega BGRA8/BT709 SDR. O header oficial OMT declara P216/PA16, mas esta implementação não produz alpha de alta precisão, HDR10 ou metadados HDR. A fonte OBS DeckLink suporta keyer e HDR PQ condicionados às capacidades do dispositivo e do driver Desktop Video. **SDI físico, genlock e HDR exigem hardware e não estão comprovados nesta máquina.**

Fontes primárias auditadas:

- https://github.com/obsproject/obs-studio/blob/master/plugins/decklink/decklink-output.cpp
- https://github.com/obsproject/obs-studio/blob/master/plugins/decklink/decklink-device-instance.cpp
- https://github.com/openmediatransport/libomtnet/blob/master/PROTOCOL.md

Licença: o bridge 3Mix permanece no código GPL do aplicativo; header/SDK OMT e licença MIT oficiais já estão no inventário de entrega. Nenhum novo SDK privado foi baixado.

Validação local final: `fillkey-nativo.json` **PASS 9**; recepção SDK real **PASS 5**, com 150/151 frames e 150 timestamps em comum. Key decodificado 0/128/255; Fill verde premultiplicado 0/128/254; Key sem áudio. Colisão de nome cruzada rejeitada, par parado, input removido e motor responsivo. Plugin DeckLink disponível, nenhuma placa detectada. A QA terminou normalmente antes do pedido de shutdown do agente, conforme log e PID ausente (`fillkey-qa-fechada.json`); não houve crash novo. EXE SHA256: `ef523cbb598b138044aa7b9960ee06efdd1beb510cbb7df8fdbb9bff87b2aa64`.
