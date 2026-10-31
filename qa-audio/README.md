# QA · Áudio 3Mix

Bancada isolada do painel de Áudio. **Não é o motor e não altera a instalação.**

## O que é real

- `fixtures/estado-producao.json` e `fixtures/audio-routing.json` foram capturados
  do endpoint `/api/json` e `/api/audio-routing` da instalação do operador.
- A interface usa exclusivamente os controladores existentes:
  `/api/json`, `/api/audio-routing` e `/api/control`
  (`audio_volume`, `audio_mute`, `audio_bus`, `audio_monitor`, `audio_balance`,
  `audio_routing_*`, `return_feed_*`).
- O mixer usa faders em dB (não em percentual disfarçado), knobs de ganho/pan,
  escala de dB, medidor L/R e leitura de pico. O fader envia a conversão real
  para o volume linear do controlador; o knob e o fader compartilham o mesmo dB.
- `ferramentas/test-audio-filtering.mjs` valida no motor a classificação
  de fontes e a interface.

## O que é simulado nesta bancada

- `harness.mjs` responde aos endpoints em memória. Os comandos são confirmados e
  registrados, mas nenhum áudio é processado.
- **Simulação de sinal (QA):** o harness injeta níveis animados em 3–4 canais
  abertos (`VT áudio`, `FreeMix Master`, `FreeMix Bus B`) em cada resposta de
  `/api/json`, para exercer o desenho dos medidores. O painel continua lendo
  `levels` de `/api/json` como no motor — a tela não inventa nível por conta
  própria. Canais mudos e não listados permanecem sem sinal.
- A consulta de dispositivos devolve duas interfaces WASAPI e dois drivers ASIO
  fictícios, identificados com “(QA)”.
- O teste do rodapé inicia e para a saída ASIO simulada para provar que a taxa
  (48.0 kHz) e o buffer (512 amostras) aparecem apenas quando o motor os
  reporta.
- `verify.mjs` (em `mockup-v2-20261030/`) dirige o Chrome headless por CDP:
  dispara e confirma comandos reais (`audio_volume`, `audio_mute`, `audio_bus`,
  `audio_monitor`, `audio_balance`, `audio_routing_filter` de ganho,
  `audio_routing_delay`, `audio_routing_afv`, aplicar/descartar, retornos,
  ASIO), testa os knobs no teclado e captura telas — sem janelas visíveis.

## Como repetir

```powershell
cd D:\DRIVE\IA\antigravity\3Mix\3mix-panel\qa-audio
node harness.mjs          # http://127.0.0.1:8777/audio.html (ou AUDIO_QA_PORT=…)
# rodada atual — mockup definitivo v2:
cd mockup-v2-20261030
node capture.mjs antes    # captura antes/depois nas três resoluções + abas
node capture.mjs depois   # (reinicie o harness antes de capturar o "depois")
node verify.mjs           # 91 verificações: comandos reais, teclado nos knobs,
                          # banco em duas linhas, colapsáveis de roteamento,
                          # layout nas 3 resoluções, 0 erros de console;
                          # grava mockup-v2-20261030/relatorio-verificacao.json
                          # e atualiza ../resultado.json
```

O harness serve **o painel atual** (`../painel`) diretamente; não existe cópia de
painel antigo e nenhum arquivo é copiado para `3mix-runtime`. A página servida
recebe a faixa "AMBIENTE DE TESTE" e o título "3Mix QA — Áudio", para nunca ser
confundida com a instalação do operador. **Reinicie o harness entre execuções**:
`verify.mjs` altera o estado simulado (volumes, mutes, inventário) e o rodapé
reflete o estado da instância em uso. O `driver.mjs` é da rodada anterior
(partes antigas da interface) e não corresponde mais ao painel.

## Evidências

- `mockup-v2-20261030/antes/` — estado antes do redesign (mixer nas três
  resoluções + roteamento/retornos/dispositivos)
- `mockup-v2-20261030/depois/` — mixer final nas três resoluções, abas
  preservadas, `relatorio.json` de captura, `90-mixer-sem-cores.png` e
  `91-mixer-<res>.png` da verificação
- `mockup-v2-20261030/relatorio-verificacao.json` — resultado detalhado das 91
  verificações
- `resultado.json` — resultado legível por máquina da rodada atual
- `evidencias/` e `redesign-20261030/`, `mockup-final-20261030/` — rodadas
  anteriores mantidas para histórico

## Limites declarados na própria tela

- O motor não expõe taxa/buffer de cada endpoint WASAPI; a tela diz “não
  exposta”/“definida pelo Windows” e só mostra números reais do ASIO quando há
  operação reportada. Um ASIO parado volta a “não exposta”.
- O gerenciador de retornos do motor atual não abre socket SRT; a tela informa
  isso e não promete transporte que não existe.
- Master, Bus A e Bus B são barramentos de mix do motor: o controlador de saída
  física atual aceita fontes públicas e barramentos independentes, não os três
  barramentos de mix. A tela mostra o motivo em vez de um seletor que falharia.
- O knob de pan envia `balance` 0–1; o knob exibe L/R em porcentagem e centro.
  O fader envia volume linear 0–100 calculado do dB escolhido.
- Knobs (ganho, pan, delay) ficam no valor editado pelo operador até o motor
  confirmar a leitura de volta; se a confirmação falhar, o snapshot recompõe
  o valor mostrado. Nada é escrita local — sempre `audio_routing_filter`/`delay`
  + confirmação real.

