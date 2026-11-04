// Real program picture and project name for the settings window. The settings controller owns the form, the drafts and
// the footer; this module only reads the live picture and keeps the "unsaved" warning in front of the operator.
(() => {
  Object.assign(window.FreeMixSettingsHelp.categories, {
    video: 'Quadro da produção, taxa de quadros e o tamanho entregue às saídas.',
    color: 'Formato, espaço e faixa de cor da produção, além do branco SDR e do pico HDR.',
    dsk: 'Canais de Downstream Keyer e transições de overlay, editados nesta central.',
    multiview: 'Layout real do Multiview, sem abrir uma segunda mesa.',
    mixer: 'Mixer de áudio, processamento, buses e roteamento.',
    outputs: 'Saídas NDI, OMT e SRT desta instalação, sem iniciar transmissões ao abrir.',
    replay: 'Câmeras, gravação, sincronismo e retenção do Replay, editados nesta central.',
    remote: 'Pareamento e endereços de acesso remoto.',
    diagnostics: 'Diagnóstico local da instalação, sem envio automático.',
    updates: 'Consulta e aplicação controlada de atualizações.',
    startstop: 'Confirmações e ações automáticas quando a gravação ou a transmissão começam e terminam.',
    general: 'Encaixe de fontes, guias de área segura e comportamento da janela do motor.',
    files: 'Padrão dos nomes de arquivos, sobrescrita e remux. A divisão por tempo ou tamanho fica em Saída avançada.',
    audioTracks: 'Qualidade e nome das trilhas 1 a 6. As trilhas usadas são escolhidas em Saída avançada.',
    networkOutput: 'Reconexão, atraso e endereçamento da transmissão principal; destinos independentes têm as próprias opções.',
    encoders: 'Propriedades reais do encoder carregado, com botões próprios para aplicar e descartar.',
    plugins: 'Gerencie plugins nativos e abra as ferramentas registradas pelos módulos carregados.',
    workspace: 'Organização persistente dos módulos e tamanho dos cards, independente do texto.',
  });
  let disposed = false, reading = false, lastImage = null;
  const dirty = () => document.getElementById('settings-dirty')?.hidden === false;
  window.addEventListener('beforeunload', (event) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });

  async function preview() {
    if (disposed || reading || document.hidden) return;
    if (document.getElementById('settings-layout')?.classList.contains('preview-off')) return;
    reading = true;
    try {
      const response = await fetch('/api/json', { signal: AbortSignal.timeout(4000) }), state = await response.json();
      if (!response.ok || !state.connected) throw Error('Sem conexão com o motor');
      document.getElementById('settings-project').textContent = 'Projeto: ' + (state.preset || 'Produção atual');
      const format = state.video || window.FreeMixSettings?.config?.video;
      if (format) {
        const fps = format.fpsNumerator / format.fpsDenominator;
        document.getElementById('settings-current-production').textContent = format.baseWidth + ' × ' + format.baseHeight + ' · ' + fps.toFixed(2) + 'p';
        document.getElementById('settings-current-output').textContent = format.outputWidth + ' × ' + format.outputHeight + ' · ' + fps.toFixed(2) + 'p';
        document.getElementById('settings-preview-format').textContent = format.baseWidth + ' × ' + format.baseHeight;
      }
      const input = state.inputs?.find((i) => i.name === state.program);
      if (!input?.key) return;
      const shot = await fetch('/api/effects-frame?key=' + encodeURIComponent(input.key), { signal: AbortSignal.timeout(4000) });
      if (!shot.ok) return;
      const blob = await shot.blob(); if (disposed) return;
      const next = URL.createObjectURL(blob), img = document.getElementById('settings-preview-image');
      img.src = next; img.hidden = false;
      document.getElementById('settings-preview-empty').hidden = true;
      if (lastImage) URL.revokeObjectURL(lastImage);
      lastImage = next;
    } catch (error) {
      const empty = document.getElementById('settings-preview-empty');
      if (empty) { empty.textContent = error.message; empty.hidden = false; }
    } finally { reading = false; }
  }
  const timer = setInterval(preview, 4000);
  preview();
  window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); if (lastImage) URL.revokeObjectURL(lastImage); });
})();
