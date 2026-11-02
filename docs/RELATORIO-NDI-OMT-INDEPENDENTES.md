# NDI e OMT: conteúdo e áudio por destino

Implementado no bridge nativo `network_output` e na tela Saídas. Cada protocolo escolhe Programa ou uma entrada/cena por UUID; a fonte independente alimenta uma view privada, sem trocar o Programa global. O áudio seleciona o Master, Bus A ou Bus B real após os respectivos barramentos: índices 0/1/2, alimentados pelos `mix-track-to-source` do 3Mix.

Os plugins oficiais instalados são DistroAV 6.2.1 / NDI runtime 6.3.2.0 e omtplugin 1.0.0.19. A integração usa `obs_output_set_media` e `obs_output_set_mixers`, que os callbacks originais dos plugins consomem. O filtro NDI por fonte não foi usado para áudio de cenas; OMT não fornece filtro de saída equivalente nessa versão.

Existe um sender NDI e um OMT. Cada um mantém conteúdo e áudio próprios durante a execução. É preciso parar antes de mudar conteúdo, barramento ou nome/grupos NDI. O nome OMT continua definido no diálogo original OMT Output Settings. A integração não altera essa configuração nem liga os senders automaticamente no próximo boot. Fontes removidas/inexistentes e fontes privadas do diretor são recusadas ao iniciar; dimensões devem ser pares, não nulas e até 3840.

## Evidência executada

Raiz isolada `C:/Users/eddyr/AppData/Local/Temp/FreeMix-QA-Parallel-Outputs-20261008`, WS 14478 / API 18100, native PID 84036. Executável SHA256 `04e73b1780de23aae7e6fa7378af26a33d2fc4311eedb6fd6475b7afa736041f` (build central 4).

- NDI: 120 frames de vídeo verde 640×360, 188 blocos de áudio, frequência recebida 440 Hz do Bus A, RMS 0,08837.
- OMT: 104 frames de vídeo azul 640×360, 163 blocos de áudio, frequência recebida 660 Hz do Bus B, RMS 0,08837.
- Os protocolos retiveram UUIDs de vídeo diferentes. Programa global preservado. Parada e GetOutputList responderam. QA salvou e fechou normalmente; sua API também foi fechada. Instalação do operador preservada.

Recibo combinado: `qa-portatil/network-independent-final-resultado.json`. Capturas: `qa-portatil/network-independent-ndi.png` e `qa-portatil/network-independent-omt.png`.

A primeira fixture falhou ao procurar OMT pelo placeholder de nome nativo, embora o log registrasse 175 frames enviados. OMT foi retestado uma vez usando o nome efetivo `OBS Output`, padrão oficial quando a configuração é `{}`; passou. O erro inicial permanece no recibo. A fonte nativa recebeu uma correção de readback para consultar `omtplugin.json` quando o diálogo original ainda não criou sua fonte de settings. A prova de transporte usa a build 4 anterior a esse ajuste; a leitura de nome foi confirmada na build final, sem mudança de fluxo de mídia.

Conferência da build final: `qa-portatil/network-independent-final-build.json` passou sete verificações de identidade, capacidades NDI/OMT, nome OMT real, senders desligados no boot, descoberta H.264/HEVC/AV1 e RTMP/SRT/RIST/HLS. A correção do nome foi compilada e confirmada nesse boot final; vídeo/áudio anteriores permanecem válidos e não foram repetidos. Essa QA final também salvou e encerrou normalmente.

## Limites

As provas são locais com os SDKs oficiais receptores; não comprovam equipamentos externos, LAN, descoberta entre máquinas, redes com perda ou funcionamento prolongado. Não há múltiplos senders do mesmo protocolo nessa integração. A seleção de áudio é um barramento real; não oferece um novo mix de áudio automaticamente derivado da fonte de vídeo. Essas opções exigem os plugins carregados e recusam capacidades ausentes no motor.
