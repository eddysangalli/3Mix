# Receber SRT 4:4:4 com transparência no OBS

O fluxo 3Mix usa H2644:4:4 e dois painéis no mesmo quadro: Fill à esquerda e Key em cinza à direita. Um receptor comum exibirá os dois painéis; é necessário recompor a Key como alpha.

1. No 3Mix, escolha saída SRT, encoder CPUx264, chroma4:4:4 e Alpha packed. Se a imagem útil for1280×720, o fluxo codificado terá2560×720. Este modo não envia um canal alpha H264 convencional.
2. No OBS receptor, adicione uma **Fonte de mídia**, desmarque **Arquivo local** e informe a URL SRT adequada à conexão. Para um receptor listener local, exemplo `srt://127.0.0.1:18360?mode=listener&latency=120000`; o emissor usa caller no mesmo endereço. Em outra máquina, informe os endereços e regras de rede correspondentes. Não é um teste WAN deste guia.
3. Instale/use **obs-shaderfilter2.6.0** compatível com sua versão OBS. No 3Mix, esse plugin já acompanha a instalação. Em Filtros da fonte, adicione **User-defined shader**; ative carregar shader de arquivo e selecione `painel/efeitos/srt-packed-alpha.shader` da pasta FreeMix. Deixe **Override entire effect** desativado e os campos de expansão em0.
4. **Depois** do shader, adicione **Crop/Pad** em modo relativo e corte a metade **direita**:1280pixels para o exemplo2560×720. Deixe esquerda/topo/base em0. Para saída lógica1920×1080, corte1920pixels; para a fixture320×180, corte320pixels. Não corte a Key antes do shader, pois ele precisa ler a metade direita.
5. A fonte filtrada deve ter a dimensão lógica original, mantendo as áreas transparentes. Coloque uma imagem/fonte de fundo por baixo para conferir as bordas. O teste usa alpha0/128/255. Ao comparar com uma PNG de referência, ative **Alpha linear** na fonte de imagem do OBS para comparar a mesma composição linear de cores.

O shader recebe Fillstraight e retorna RGBAstraight no template normal do plugin. `render_output.effect` do shaderfilter converte RGB para linear; libobs compõe com SRCALPHA. Portanto não multiplique RGB manualmente por alpha nem ative USE_PM_ALPHA neste arquivo: isso alteraria o brilho das bordas semitransparentes.

## Evidência local

`resultado-srt444-obs-filter-20261009.json`: PASS real do shaderGPU+Crop, dimensão320×180, alphaMAE0/max0/amostras0/128/255. Composição comparada à PNG referência sobre o mesmo fundo. Compilação sem last_error, fechamentoNativeexit0 e nenhumcrash novo. O teste carregou um quadro PNG decodificado do TS SRT já recebido; não iniciou outra transmissão nem modificou o operador ou a QA-Menus18310.

O recibo conserva o primeiro FAIL da comparação com a PNG em alpha não linear em `resultado-srt444-obs-filter-reference-failure-20261009.json`; o shader permaneceu igual. Fontes primárias locais conferidas: obs-shaderfilter.c2858–2863, render_output.effect e libobs/obs-source.c4408.

Limites: esta prova comprova unpackGPU de um quadro real recebido, em OBS32.2.2/3Mix e shaderfilter2.6.0. A recepção contínua direta no OBS de outra máquina, a configuração de rede externa e a carga1280p/1080p ainda precisam ser conferidas no ambiente receptor. HDR e outros layouts/ranges não são suportados por este shader SDR/fullrange.
