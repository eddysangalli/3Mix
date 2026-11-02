# Receptor SRT com alpha: ferramenta separada

A ponte recebe vídeo SRT com cor à esquerda e máscara à direita, reconstrói os pixels BGRA com transparência e publica uma fonte NDI com áudio. A origem pode ser qualquer entrada ou composição transparente do 3Mix, inclusive vídeo após chroma. Não depende de GC em HTML.

Ela é separada do instalador. O antigo receptor Web Browser foi abortado. Esta ponte usa FFmpeg e o SDK NDI nativos; ainda exige aceite no vMix real antes de uso em produção. A recepção OMT e HDR não estão implementadas nesta ferramenta.

## Teste na mesma máquina

Depois de disponibilizar o EXE em `runtime/FreeMix-Alpha-Bridge.exe`, com suas dependências e licenças, execute na pasta da instalação:

```text
runtime/node.exe ferramentas/alpha-bridge-nativo.mjs --port 18460 --name "FreeMix SRT Alpha"
```

No 3Mix, abra **Externo → SRT** e escolha a entrada ou composição que já tenha transparência. Use H.264/x264, 4:2:0, cor+máscara lado a lado e modo Caller para `127.0.0.1:18460`, com latência 120 ms. Uma saída lógica de 1920×1080 transporta 3840×1080; uma saída lógica de 1280×720 transporta 2560×720.

No vMix, adicione **NDI → FreeMix SRT Alpha**. A ponte publica no grupo padrão NDI, sem exigir grupo customizado no Access Manager. O vMix deve enxergar uma entrada com cor, alpha e áudio. Não aplique outro luma key nem recorte as metades: a ponte faz essa recomposição.

Se a origem inclui uma câmera opaca no fundo, o resultado completo continua opaco. Selecione a entrada pós-chroma ou uma composição realmente transparente para testar o alpha.

## Outra máquina

Execute a ponte na máquina receptora do vMix e faça o 3Mix enviar o SRT para o IP dessa máquina. Para permitir escuta nas interfaces locais, a ação é explícita:

```text
runtime/node.exe ferramentas/alpha-bridge-nativo.mjs --host 0.0.0.0 --port 18460 --name "FreeMix SRT Alpha"
```

`0.0.0.0` é endereço de escuta, não destino do envio. O remetente deve usar um IP alcançável do receptor; pode ser o IP ZeroTier quando ambos pertencem à mesma rede autorizada. A ferramenta não configura firewall, NAT, VPN ou servidor. Sem rota/porta alcançável, não cria conectividade pela internet.

O SRT atravessa o enlace entre as máquinas. O NDI da ponte é recebido localmente pelo vMix; não é preciso transportar NDI de alta banda pela internet.

## Limites observáveis

- O processamento e a decodificação são CPU nesta versão.
- A perda detectada do SRT apaga a imagem anterior para transparente e inicia reconexão. Existe intervalo de mídia; não é recuperação sem interrupção.
- O envio SRT 4:2:0 permite compatibilidade, mas não promete reconstrução sem perdas dos contornos.
- Os recibos de QA registram o SHA de cada EXE: a prova inicial em 1080p e a endurance em 720p pertencem a binários identificados. Não representam homologação WAN, câmera física ou aceite visual no vMix.
- Falha fatal de inicialização retorna exit 1; argumentos inválidos retornam exit 2. A ferramenta mostra o motivo no console.

Provas e limites adicionais estão em `RELATORIO-TRANSPORTES-CONCLUSAO-20261009.md` e `qa-finalizacao/resultado-native-alpha-endurance-20261009.json`.
