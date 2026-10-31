# 3Mix · Áudio — redesenho do shell e do mixer (2026-10-30)

## Arquivos alterados (somente Áudio e QA)

- `painel/remoto/audio.html`
- `painel/remoto/audio-mixer-workspace.css`
- `painel/remoto/audio-mixer-workspace.js`
- `painel/remoto/audio.js` (inspetor/visão geral e seleção inicial)
- `qa-audio/harness.mjs`, `qa-audio/driver.mjs`, `qa-audio/README.md`
- `qa-audio/redesign-20261030/*` (capturas e este relatório)

Nada foi copiado para `3mix-runtime`. Replay, Configurações, Mesa, DSK, motor e
`ferramentas/audio-routing-producao.mjs` não foram tocados.

## O que mudou

- Shell próprio da janela Áudio: 3Mix, Mesa/Áudio/Replay, projeto e conexão no
  topo; quatro abas (Mixer, Roteamento, Retornos N-1, Dispositivos); rodapé com
  taxa, buffer, dispositivo, prontidão e Fechar.
- Mixer: 11 entradas em strips com cabeçalho (cor opcional), knob de ganho,
  knob de pan, fader vertical em dB com escala, medidor L/R, leitura dB/%,
  pico, MUTE/SOLO/AFV/MON e envios MAIN/A/B.
- Coluna de saídas: Master, Bus A, Bus B e Fones (escuta local do Master), com
  barramento independente entrando como saída quando o motor confirma.
- Inspetor lateral fixo: visão geral (resumo e canais internos) quando nada está
  selecionado; atraso, AFV, presets, rack DSP e filtros nativos ao selecionar um
  canal. Botão Inspetor abre/fecha a coluna.
- Cores de cabeçalho continuam opcionais pelo checkbox e ficaram mais discretas.
- MUTE ativo usa vermelho dessaturado; SOLO é âmbar; AFV/MON são azulados;
  somente PGM usa vermelho de tally.

## Números reais, não inventados

- O fader trabalha em dB (-60..0 nas entradas; -60..+12 em bus independente) e
  converte para o volume linear 0–100 do controlador no envio.
- O motor expõe um único volume por canal. O knob de ganho e o fader mostram e
  controlam esse mesmo parâmetro real em dB; não foi criado um trim separado com
  valor inventado. O knob de pan converte -100..+100 para `balance` 0–1.
- A taxa do rodapé só aparece quando `asioOutput.running` e `sampleRate` são
  reportados; parado, volta a “não exposta”.
- O buffer só aparece quando o ASIO reporta `bufferFrames`; senão mostra o buffer
  configurado ou “—”.
- O dispositivo mostra o inventário consultado e a saída física ativa; antes da
  consulta diz “não consultado”. O endpoint WASAPI não é inventado.

## Teste headless

`node qa-audio/harness.mjs` + `node qa-audio/driver.mjs`:

- **72/72 verificações**, **0 erros de console**.
- Fixture real de `/api/json` e `/api/audio-routing`; comandos confirmados em
  memória pelo harness.
- Testes de teclado no knob de ganho e no knob de pan; fader -6 dB envia
  `audio_volume: 50`; SOLO usa `audio_monitor`; DSP, roteamento, ASIO, retornos e
  dispositivos continuam nos mesmos controladores.
- Rodapé testado com ASIO simulado em operação (48.0 kHz / 512 frames) e depois
  parado (volta a “não exposta”).

## Layout medido (sem rolagem horizontal da página)

| Janela | página | banco do mixer | master à direita | inspetor à direita | rodapé |
| --- | --- | --- | --- | --- | --- |
| 1280×800 | 1280/1280 | 593 px de altura | 636 px | 1280 px | 800 px |
| 1440×900 | 1440/1440 | 695 px | 719 px | 1440 px | 900 px |
| 1600×1000 | 1600/1600 | 795 px | 865 px | 1600 px | 1000 px |

O banco de entradas rola na horizontal (é uma lista de canais); o master, o
inspetor, a barra de ferramentas e o rodapé ficam sempre visíveis.

## Antes / depois

- `antes/mixer-1280x800.png`, `antes/mixer-1440x900.png`, `antes/mixer-1600x1000.png`
- `depois/mixer-1280x800.png`, `depois/mixer-1440x900.png`, `depois/mixer-1600x1000.png`
- `depois/roteamento-1440x900.png`, `depois/retornos-1440x900.png`,
  `depois/dispositivos-1440x900.png`
- `../evidencias/01-mixer.png`, `01b-mixer-cores.png`, `06-processamento.png`,
  `07-mixer-*.png`

## Limites que continuam explícitos

- O motor não informa taxa/buffer de cada endpoint WASAPI; a tela não inventa.
- Um ASIO parado não mantém a taxa no rodapé (evita número obsoleto).
- O banco de entradas tem rolagem horizontal quando as 11 entradas não cabem;
  os controles principais (master, fones, inspetor, abas e rodapé) não rolam.
- A escuta de Fones é o monitor local do Master via `audio_monitor`; não existe
  fader de fone separado no controlador e nenhum valor foi inventado.

