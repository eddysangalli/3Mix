# Validação local 3Mix — 08/10/2026

Leia docs/CONTINUAR.md e docs/PENDENCIAS.md para versão, recursos e limites atuais. Histórico anterior em archived/documentos/antes-integracao-final-20261008/.

- Calls/rede/Replay: 80 verificações registradas no RELATORIO-CALLS-REDE-20261008.md; N-1/talkback local real, publisher/PCM/JPEG e receptor SRT com FFmpeg. Internet/humano ainda pendentes.
- Recuperação: 23 filesystem/lifecycle + 12 nativas. Controladores: 14 backend + 6 nativos + 5 interface/fallback.
- Editor/dados/playlist: 14 verificações nativas; mais 6 cache/escopo e 3 tally/estado nativo.
- Saídas: três ciclos de 14 verificações com vídeo decodificado, GPU, FPS15 e Mix2 vertical; três shutdowns normais sem novo crash. ISO: 15 checks; overlays, tarja, SRT/RIST em recibos próprios.
- API: três reinícios do motor mantendo PID da API; estado offline honesto e reconexão com comando Preview real.
- Scripts: 137 verificações de sintaxe. Plano firewall restrito conferido; nenhuma regra aplicada.
- NDI/OMT: receipt anterior qa-ndi/receipt.json preservado; runtime NDI instalado localmente, excluído do pacote.

As contagens não substituem carga longa, Windows limpo, teste físico nem aprovação visual da mesa Qt. Journal não faz replay delta; restauração usa snapshots. Rede duplica caminhos, não agrega banda. Cada captura web está em qa-portatil/; design-qa.md registra comparação e pendências visuais. Configuração/presets/gravações/local.js não são substituídos pelo incremento.
