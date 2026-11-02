# Vídeo com alpha em uma entrada de navegador

**Protótipo abortado em 09/10/2026.** O operador rejeitou o teste com vídeo real no vMix por lentidão, travamentos, avanço/retrocesso aparente e atraso, mesmo localmente. Não utilizar como entrega operacional. O envio de teste e o receptor foram encerrados. As instruções e provas abaixo são registro do experimento; testes sintéticos/Edge não comprovam desempenho aceitável no vMix. Internet não foi testada.

Este receptor recebe **vídeo real**, não recria um título HTML. Uma câmera com chroma key aplicado, um GC, um vídeo ou uma composição com transparência podem alimentar a mesma saída packed-alpha existente do 3Mix.

Fluxo: **entrada com alpha → SRT H.264 4:2:0 cor+máscara → FFmpeg remux sem recodificar → MP4 fragmentado/WebSocket → navegador/WebGL → alpha do vMix**. Cor e máscara são extraídas do mesmo quadro. A recomposição ocorre antes de o vMix aplicar enquadramento/overlay.

## Teste na mesma máquina

1. Abra `ABRIR-RECEPTOR-ALPHA.cmd` na raiz. Não precisa fechar 3Mix/vMix. O receptor é um processo separado; escuta HTTP 18750 e SRT 18460, diferentes da recepção anterior 18360.
2. Abra **http://127.0.0.1:18750/**. Essa tela fornece a URL completa de leitura para colar no vMix. A URL inclui uma chave aleatória persistente; só compartilhe com quem deve receber.
3. No 3Mix, **Externo → SRT**, escolha uma saída livre. Selecione a entrada/composição com alpha real, resolução lógica 1920×1080, x264/H.264, cor 4:2:0, **Cor + máscara lado a lado / quadro único**. Pode usar o botão **Preparar SRT único · 4:2:0 + máscara**.
4. Destino **Caller**, IP **127.0.0.1**, porta **18460**, latência **120 ms**. Salve e inicie essa saída. Ela transmitirá 3840×1080. A mesa de SRT antiga 18360 pode continuar como referência.
   Se reutilizar uma saída que já está ativa, primeiro **Parar**, depois alterar a conexão, **Salvar** e **Iniciar**. Marcar habilitada não inicia nem troca o destino da transmissão ativa.
5. No vMix, **Adicionar Entrada → Web Browser**. Cole o link da tela do receptor. Configure **1920×1080**, a resolução lógica, e mantenha posição/zoom padrão. A cor e transparência chegam juntas nessa única entrada; não adicione SRT, Virtual Input, máscara, Key/Fill ou Mix para este caminho.
6. Use a nova entrada como overlay sobre o fundo. Para câmera com chroma key, selecione a fonte/composição **depois do filtro**, onde o verde já virou alpha. Enviar vídeo verde opaco não cria transparência.

Nesta mesa o teste foi **unificado na saída Horizontal (Saída 2), porta 18460**. A saída paralela Teste Alpha Web foi desativada e liberada, pois editar a Horizontal alterava outro envio e causava confusão. Para trocar o vídeo que chega à entrada Web Browser, altere **Horizontal**: Parar → Conteúdo "Entrada / composição própria" → Entrada desejada → Salvar → Iniciar. A URL do navegador permanece a mesma. A Horizontal deixou de enviar para 18360 neste teste assistido.

O operador confirmou que o vídeo apareceu no Web Browser do vMix. A mesma transmissão real passou na decodificação Edge em 1920×1080; após ajustar a reprodução por GOP, foram renderizados 150 quadros em cinco segundos. Transparência sobre fundo no vMix, áudio e WAN permanecem verificações separadas. Ao carregar o ajuste de reprodução, atualize apenas a página dessa entrada de navegador.

Se a página ficar transparente sem vídeo, abra **diagnóstico do vídeo** na tela do receptor e confirme a saída SRT ativa. O diagnóstico mostra a resolução lógica e quantidade de quadros. Navegadores sem H.264/MSE/WebGL compatíveis exibem erro no diagnóstico. Após perda de sinal, o canvas é limpo, e não um último quadro congelado. Reconexão refaz a sessão de vídeo.

Fechar a janela do `.cmd` encerra só o receptor. Um receptor iniciado pelo agente pode ser reutilizado: se aparecer porta ocupada, abra a tela 18750 existente em vez de iniciar outro.

### Checkout de fontes

No repositório Git, `ferramentas/`, `painel/` e `servidor/` estão diretamente na raiz; `obs-vmix/` é a pasta da instalação local. Instale as dependências com `npm ci --omit=dev` e execute `node ferramentas/alpha-web-receptor.mjs --ffmpeg=CAMINHO_DO_FFMPEG`. O FFmpeg precisa suportar SRT. O clone não inclui Node/FFmpeg compilados. Os recibos de QA estão em `docs/evidencias-alpha-web/` no Git e `qa-portatil/` no workspace local.

## Internet sem plugin nem VPN no receptor

Hospede **este serviço** num servidor com IP público, porta UDP/SRT acessível e HTTPS/WSS. 3Mix envia como Caller ao servidor; o vMix remoto abre apenas a URL HTTPS com Web Browser. Isso evita abrir portas no roteador de quem envia e de quem usa o vMix. O servidor precisa aceitar UDP, ter FFmpeg com SRT e Node com `ws`; hospedagem PHP compartilhada não garante esses requisitos.

Exemplo Linux, com arquivos `ferramentas/`, `painel/alpha-web/` e `package.json` do kit:

```sh
npm ci --omit=dev
node ferramentas/alpha-web-receptor.mjs --ffmpeg=/usr/bin/ffmpeg --srt-bind=0.0.0.0 --srt-port=18460 --bind=127.0.0.1 --port=18750 --data=/var/lib/freemix-alpha
```

Há um exemplo Caddy em `obs-vmix/servidor/alpha-web/Caddyfile.exemplo`. Ajuste domínio/DNS/HTTPS e permita UDP 18460 no servidor. Nenhum servidor foi publicado ou dados enviados externamente nesta entrega. Opcionalmente defina `FREEMIX_ALPHA_SRT_PASSPHRASE` no serviço e a mesma passphrase no envio SRT. Não publique `access.json`, gravações ou configuração da mesa.

## Provas e limites

- `qa-portatil/resultado-alpha-web-video.json`: vídeo em movimento, SRT loopback H.264 4:2:0, alpha medido 0/130/255 para máscara nominal 0/128/255; cliente tardio, queda limpa e reconexão. Nenhuma alteração no 3Mix/vMix do operador.
- `qa-portatil/resultado-alpha-web-fullhd.json`: teste separado de resolução lógica 1920×1080 / transporte 3840×1080 no navegador Edge headless. Leia o recibo para o resultado efetivo.
- Essas provas do navegador não equivalem a homologação do Chromium embutido no vMix nem WAN. O teste manual nessa mesa é o próximo passo.
- **Sem áudio no protótipo.** H.264 4:2:0 de 8 bits, SDR; sem HDR ou alpha lossless. A compressão pode alterar levemente bordas/opacidades.
- Latência depende do intervalo de keyframes: o receptor remuxa por GOP, não é WebRTC nem promessa de latência subsegundo. O remux não faz outra compressão. Cada receptor acrescenta tráfego de vídeo no servidor.
- O alpha via Web Browser é suporte nativo do vMix: https://www.vmix.com/help29/WebBrowser.html. O uso de MP4 fragmentado é documentado em https://ffmpeg.org/ffmpeg-formats.html.

Este é um protótipo adicional. Não substitui os ZIPs anteriores, não aplica atualização nativa e não muda a mesa em operação.
