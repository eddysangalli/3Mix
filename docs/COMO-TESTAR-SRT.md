# SRT: teste simples e alpha

Para os novos modos 4:2:0 com transparência, siga [SRT-VMIX.md](SRT-VMIX.md). O formato packed420 leva cor/máscara no mesmo SRT; Fill/Key separado usa duas portas. A recepção/recomposição no vMix ainda precisa de teste manual.

Primeiro salve e feche o 3Mix desta instalação e abra **ABRIR-FREEMIX.cmd**. A versão anterior `20261009045022` não oferece o 4:4:4/alpha novo; por isso os controles aparecem bloqueados nela. Transmitir abre MultiStream. SRT, NDI e OMT ficam em **Externo**.

## Mesmo computador, recebendo no vMix

1. No vMix, adicione uma entrada Stream / SRT em **Listener**, porta **18360**, latência **120 ms**.
2. No 3Mix, abra **Externo → SRT / RIST** e clique numa saída livre à esquerda.
3. Deixe **Conteúdo: Programa**, **Caller**, IP **127.0.0.1**, porta **18360**, latência **120 ms**. Clique **Transmitir esta saída**. A URL é montada automaticamente.
4. Comece sem alpha e em 4:2:0. Nesta instalação o vMix recebeu, mas rejeitou o perfil 4:4:4 com alpha empacotado por falha do decoder. Para esse perfil, use OBS com decodificação por software e o filtro abaixo.

Salvar configuração apenas guarda os dados; Transmitir esta saída guarda o rascunho e inicia o envio. Pare a saída antes de alterar seus parâmetros.

## Mesmo computador, recebendo no OBS

Use porta **18361** se o vMix já estiver ouvindo em 18360. Dois receptores não devem disputar a mesma porta.

1. No OBS, em Fontes, clique **+ → Fonte de mídia**, dê o nome **SRT 3Mix** e confirme.
2. Desmarque **Arquivo local**. No campo **Entrada**, cole `srt://0.0.0.0:18361?mode=listener&latency=120000`.
3. Deixe **Formato de entrada** vazio e **decodificação por hardware** desmarcada. Clique OK.
4. No 3Mix, abra **Externo → SRT / RIST**, selecione uma saída livre e use Caller, IP **127.0.0.1**, porta **18361**, latência **120 ms**. A URL gerada é `srt://127.0.0.1:18361?mode=caller&latency=120000`.
5. Comece com Programa, H.264/x264, 4:2:0 sem alpha e clique **Transmitir esta saída**. Abra o receptor antes de iniciar o emissor.
6. Depois da imagem básica funcionar, pare o envio, selecione uma entrada transparente, prepare 4:4:4 com alpha e configure a recomposição abaixo. Use a mesma porta18361 em ambos os lados.

## Outro computador, pela rede ZeroTier

Ambos precisam entrar na mesma rede privada e ser autorizados no ZeroTier Central. Pegue o **Managed IP do receptor**. No receptor, prepare SRT Listener na porta **18360**. No 3Mix, use Caller, aquele IP e latência inicial de **500 ms**. Os IPs listados na tela são desta máquina; eles não substituem o IP do receptor. Se o Windows bloquear o programa receptor, autorize o tráfego nessa rede.

Passo a passo com OBS remoto:

1. Crie uma rede privada em ZeroTier Central e copie seu Network ID.
2. Nos dois computadores, abra ZeroTier na bandeja → Join Network e cole o mesmo Network ID.
3. Em Members no painel, autorize os dois dispositivos e confirme status OK. Copie o Managed IP do computador que recebe.
4. No OBS receptor, crie Fonte de mídia com Arquivo local desmarcado, hardware desmarcado, Formato vazio e Entrada `srt://0.0.0.0:18361?mode=listener&latency=500000`.
5. No 3Mix, use Caller, IP **do receptor na ZeroTier**, porta18361, latência500ms. Abra a fonte receptora primeiro e depois inicie a saída. Não use127.0.0.1 para outro computador.
6. Se a conexão não chegar, confira autorização/Managed IP e a permissão do OBS para UDP18361 no firewall do receptor pela rede ZeroTier. Não desative o firewall. A rede ZeroTier substitui o acesso direto ao IP público e o encaminhamento da porta SRT no roteador.

## Alpha, recebendo no OBS

1. No OBS receptor, adicione uma Fonte de mídia, desmarque Arquivo local e informe `srt://0.0.0.0:18360?mode=listener&latency=500000`. Comece com decodificação por hardware desligada.
2. No 3Mix, escolha **Conteúdo: Entrada / composição própria** e selecione um PNG, GC ou composição que realmente tenha transparência. Configure Caller/IP do OBS/porta18360/500ms.
3. Clique **Preparar SRT · 4:4:4 + alpha**, confira os dados e clique **Transmitir esta saída**.
4. No OBS, use o plugin **obs-shaderfilter**, filtro **User-defined shader**, com o arquivo `obs-vmix/painel/efeitos/srt-packed-alpha.shader` fornecido. Depois desse filtro, aplique Crop/Pad e recorte à direita a largura lógica enviada. Exemplo: 1280×720 lógico chega em 2560×720; recorte 1280 à direita.

O quadro traz a cor à esquerda e a máscara cinza à direita. O filtro recompõe a transparência. Uma câmera ou Programa opaco continua opaco mesmo com alpha habilitado.

Prova local executada: dez segundos em 320×180 lógico, H.264 4:4:4 e reconstrução da máscara; o filtro OBS também foi conferido com um quadro recebido. Internet, carga em Full HD e compatibilidade entre máquinas continuam pendentes da rodada externa. Guia detalhado na tela: **Como testar SRT local, ZeroTier e alpha no OBS**.
