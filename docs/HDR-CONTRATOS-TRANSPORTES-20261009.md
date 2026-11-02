# HDR nas saídas — contrato verificado em 09/10/2026

As rotas de alpha e saídas padrão produzem SDR BT.709. OMT PA16 preserva precisão de render e alpha16; isso não muda a transferência para PQ/HLG. Pedidos HDR nessas rotas recebem erro explícito. Foi implementada uma rota OMT HDR separada, P216 opaca, com fonte HDR verdadeira e interpretação manual PQ/HLG no receptor.

## NDI

A documentação NDI6 distingue recepção e envio: o SDK padrão recebe HDR, enquanto envio com metadados exige Advanced SDK licenciado. A versão trial interrompe envio HDR após30min. O contrato existe, portanto não é correto dizer que “NDI não suporta metadados HDR”. Nossa integração usa o SDK padrão e render SDR8. [Fonte oficial](https://docs.ndi.video/all/developing-with-ndi/sdk/hdr).

Uma implementação futura licenciada deve produzir P216/PA16 com PQ/HLG, faixa limitada e primárias/matriz BT.2020, além de preencher `p_metadata` com `ndi_color_info`. Apenas anexar esse XML ao PA16 SDR existente produziria um sinal incorreto. Precisa verificar também o receptor NDI6 e níveis de luminância; não disponibilizar o trial como saída permanente. [Contrato de HDR](https://docs.ndi.video/all/developing-with-ndi/sdk/hdr).

## OMT

O plugin oficial suporta workflows HDR quando a saída OBS está em P010/P216 e o receptor escolhe o espaço de cor apropriado. A nova rota `omt_hdr_output` segue esse contrato com uma view nativa P216 PQ/HLG, sem passar por BGRA8 nem expandir artificialmente o PA16 SDR. [Plugin oficial](https://github.com/openmediatransport/omtplugin/blob/master/README.md).

O protocolo1.0 anuncia somente601/709/undefined no campo `ColorSpace`. A recomendação oficial de metadata1.0 define controle/PTZ/ancillary/grouping, sem elemento padronizado de transferência PQ/HLG. Não inventamos enum2020 nem XML privado fingindo reconhecimento automático. [Protocolo oficial](https://raw.githubusercontent.com/openmediatransport/libomtnet/master/PROTOCOL.md), [metadata oficial](https://github.com/openmediatransport/Metadata).

A rota oferece quatro senders independentes com configuração por perfil, sem início automático. O preflight recusa SDR, alpha/FillKey HDR, dimensão inválida, fonte privada e receptor sem confirmação PQ/HLG correspondente. A tela OMT mostra fontes cujo motor declara HDR; cenas em mesa SDR tone-mapam os filhos e são recusadas para preservar os níveis. Não alteramos o canvas global do operador. Para compatibilidade vMix, ainda é necessário verificar a versão e interpretação do receptor instalado.

`resultado-native-omt-hdr-20261009.json` recebeu vídeo via SDK oficial real: mais de180quadros PQ e HLG por transferência, gradientes com765/766 níveis distintos e erro máximo de64 unidades16bit nas faixas de referência10bit. PQ1000nits permaneceu acima de brancoSDR300nits. Quatro receptores SDK simultâneos receberam mais de220quadros cada, com áudio440Hz contínuo. PTS monotônicos depois de stop/restart; duas partidas Native encerraram exit0 e a segunda carregou quatro configurações sem iniciar nenhuma. Colisões de identidade HDR/HDR, SDRFill→HDR, SDRKey→HDR, HDR→SDRFill e HDR→SDRKey foram recusadas. Build final testada: SHA-256 `ea487f733a7ff7d977d4002aedf6dc986ae1462fe8fd1c4528011ec838b86e7a`.

OMT anunciou `HighBitDepth`, `ColorSpace=Undefined` e nenhum metadataHDR, precisamente o contrato manual. Esse teste local de pixels não substitui monitorHDR físico nem homologação WAN/vMix. O envio mantém somente um buffer de vídeo próprio e uma chamada SDK síncrona nos callbacks de captura; não bloqueia a interface para converter pixels. Filas internas e perdas WAN do SDK não foram medidas neste ensaio.

`resultado-omt-hdr-ui-20261009.json` verifica controles reais em browser com estado de comandos simulado: lista somente UUIDHDR, configurações dos quatro envios, confirmação manual, preflight/salvar sem início automático, bloqueio de alteração durante envio, rascunho não abandonado ao trocar sender e adaptação600px. A prova SDK acima cobre o Native; este teste não finge que os mocks são transmissão.

## SRT e SDI

Atualização posterior ao candidato Native99: SDI HDR recebeu implementação em fonte com view P416 PQ/HLG, RGB10 final, metadados explícitos e preflight do driver. Contrato/SDK mock/UI/sintaxe passaram; build/link do root e sinal físico continuam pendentes. Consulte `RELATORIO-SDI-HDR-POST-CANDIDATO-20261009.md`. Os parágrafos abaixo descrevem a situação do candidato anterior, não atribuem a implementação ao seu EXE.

SRT transporta o vídeo codificado; PQ/HLG depende do pixel format10bits e dos metadados do codec. O fonte OBS existente suporta PQ/HLG em NVENCHEVC/AV1 e no muxerFFmpeg, mas a saída independente 3Mix desta entrega fixaNV12/I4448bits. Ela não implementa uma opçãoHDR. Uma nova rota precisa selecionar P010, encoder10bits, primárias/matrizBT2020 e transferência correta, e comprovar o bitstream com receptor/ffprobe. Não habilitamos um controle que apenas marcaHDR no formulário.

O plugin DeckLink original contém caminho PQ e metadados HDR condicionado ao dispositivo/driver. A central 3Mix usa `force_sdr:true` e a view própria BGRA8BT709. A central precisa de implementação e ensaio físico adicional, além de uma placa compatível; conectar hardware não torna HDR esta rota.

Referências locais verificadas: `plugins/obs-nvenc/nvenc.c`, `plugins/obs-ffmpeg/obs-ffmpeg-mpegts.c`, `plugins/decklink/decklink-output.cpp`, `plugins/decklink/decklink-device-instance.cpp` e `plugins/decklink/OBSVideoFrame.cpp`, sob `freemix-app/`. Não foi alterado nem reconstruído nenhum desses plugins nesta investigação.

## Evidência de recusa correta

`qa-finalizacao/resultado-hdr-output-contracts-20261009.json`: PASS, solicitações HDR/transferPQ/HLG/BT2020 recusadas pela central e por startNDI/OMT antes de qualquer requestNative. SDR normal continua aceito; capability/razão distinguem SDKNDIlicenciado e workflowOMTmanual. O recibo inclui hashes e parseNode dos seis arquivos executáveis. Isso é prova de contrato, não recepção físicaHDR.

Implementação: `freemix-app/frontend/widgets/FreeMixOmtHdrOutput.hpp`, integração em `FreeMixMultistream.cpp`, `obs-vmix/ferramentas/omt-hdr-producao.mjs` e `painel/remoto/saidas-omt-hdr-ui.js`. Contratos SDR: `saidas-hdr.mjs`, `saidas-producao.mjs`, `saidas-srt.mjs`, `ndi-producao.mjs`, `omt-producao.mjs`, `saidas-external-ui.js`, `saidas.html`. QA: `gerar-fixture-hdr.py`, `capture-omt-hdr.py`, `test-native-omt-hdr-20261009.mjs`, `check-omt-hdr-header.ps1` e respectivos recibos.
