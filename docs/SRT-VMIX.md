# SRT com transparência para vMix

**Atualização do teste do operador:** a recomposição de um SRT packed 4:2:0 funcionou com quatro entradas: SRT, Virtual da máscara, Mix renderizando a máscara e outro Mix renderizando a cor. Use aspecto **Widescreen** nas fontes, Zoom X=2/Y=1, Pan X=+1 (Fill) / −1 (Key), Pan Y=0, Crop X 0–960 / 960–1920 no projeto 1920×1080. Aplique Key/Fill **no Mix da cor apontando para o Mix da máscara**, depois de retirar o Key/Fill da entrada SRT original. Aplicação antes dos recortes/Mix mostrou transparência/cortes incorretos.

O protótipo de alpha em uma entrada Web Browser foi **abortado após desempenho ruim com vídeo real no vMix**. Não usar essa rota na demonstração. O histórico está em `../archived/limpeza-demo-20261009/experimento-alpha-web/VIDEO-ALPHA-UMA-ENTRADA.md`.

Primeiro salve e feche o 3Mix normalmente e abra **ABRIR-FREEMIX.cmd** na raiz. A atualização nova só é aplicada com a mesa fechada. Não basta atualizar a página de configurações.

## Um SRT: cor e máscara lado a lado em 4:2:0

1. No vMix, adicione uma entrada **SRT (Listener)**, porta **18360**, latência **120 ms**. A porta precisa estar livre; OBS e vMix não podem usar a mesma porta de escuta simultaneamente nesta configuração.
2. No 3Mix, abra **Externo → SRT**, escolha uma saída e a entrada PNG/GC/composição transparente.
3. Clique **Preparar SRT único · 4:2:0 + máscara**. Confira x264 H.264, cor 4:2:0 e alpha **Cor + máscara lado a lado · quadro único**.
4. Conexão: **Caller**, IP `127.0.0.1`, porta **18360**, latência **120 ms**. Em outra máquina use o IP LAN/ZeroTier do receptor.
5. Salve e inicie a saída. Conteúdo 1280×720 transmite 2560×720: imagem à esquerda, máscara à direita. Um receptor comum mostra as duas metades; a transparência precisa ser recomposta.
6. No vMix, crie uma **Virtual Input** da recepção para separar as metades. O vMix oferece Crop em Position e **Colour Key → Key/Fill Input** para usar outra entrada como máscara.

**Resultado assistido:** recortar sozinho não resolveu o Key/Fill. O operador conseguiu recompor usando um Mix renderizando a máscara e outro Mix renderizando a cor, como descrito acima. As duas metades são sincronizadas no próprio quadro recebido. Movimento prolongado e transmissão pela internet continuam sem homologação.

## Dois SRTs: Fill e Key em portas diferentes

1. 3Mix, primeira saída: mesma entrada transparente, resolução 1280×720, x264 H.264, cor **4:2:0**, alpha **Fill · imagem colorida · 4:2:0**, Caller `127.0.0.1:18360`, latência 120 ms.
2. Segunda saída: copie a mesma entrada, resolução, FPS, enquadramento e overlays; alpha **Key · máscara em cinza · 4:2:0**, Caller `127.0.0.1:18362`, latência 120 ms. Configure e salve cada saída; inicie as duas depois que os receptores estiverem preparados.
3. vMix: uma entrada SRT Listener na porta **18360** chamada Fill, outra na **18362** chamada Key. Ambas 120 ms. As duas recebem 1280×720, sem recortes e sem largura dobrada.
4. Na Fill: engrenagem → **Colour Key → Key/Fill Input**, selecione a Key. Silencie o áudio da Key para não duplicar o som.
5. Use como overlay sobre outra câmera. Branco da Key representa opaco; preto, transparente; cinza, transparência parcial. Confira bordas e sincronismo durante movimento.

Duas conexões independentes podem apresentar atraso diferente mesmo com latências iguais. Este modo não oferece genlock nem sincronismo de quadro garantido entre receptores. Para cor + máscara no mesmo quadro, prefira o primeiro modo quando a recomposição do receptor estiver confirmada.

## O que foi realmente conferido

Em 09/10/2026, recepção local FFmpeg isolada: 90 quadros decodificados em cada um dos três modos, H.264 High/yuv420p; máscara com níveis 0/128/255, diferença média 0 entre as máscaras packed e separada; encerramento normal, nenhum novo crash. Evidência: `qa-portatil/resultado-srt-fillkey-20261009.json`. Não comprova internet, sessão prolongada, sincronismo de dois receptores ou recomposição no vMix.

O perfil High 4:4:4 do envio anterior falhou no decoder deste vMix. Os novos modos utilizam 4:2:0. A correção do crash de reconexão está incluída na atualização; a instalação aberta precisa ser fechada e atualizada pelo launcher.

Documentação oficial: [Virtual Input](https://www.vmix.com/help29/InputSettingsGeneral.html), [Position/Crop](https://www.vmix.com/help29/InputSettingsPosition.html), [Key/Fill Input](https://www.vmix.com/help29/InputSettingsColourKey.html).
