'use strict';

/* 3Mix · Color Studio
   - Analisa o quadro real entregue pelo motor (/api/color/frame).
   - Corrige a entrada pelo filtro existente "FreeMix Qualidade - Cor" (color_filter_v2),
     sempre pelo FreeMixEffectsGate (mesma trava de operação dos outros painéis).
   - Faz shading remoto pelo PTZ/ONVIF/VISCA existente (/api/control → ptz_*).
   - Compara até quatro câmeras e copia a correção local da referência.
   Nada aqui coloca entrada no ar, grava ou altera áudio. */

(() => {
  const E = (id) => document.getElementById(id);
  const LOCAL_FILTER = 'FreeMix Qualidade - Cor';
  const LOCAL_TYPE = 'color';
  const SETTINGS_KEY = '3mix.color.settings.v1';
  const DEFAULT_SETTINGS = { brightness: 0, contrast: 0, saturation: 0, gamma: 0, hue_shift: 0, color_multiply: 0xFFFFFF, color_add: 0 };
  const LOCAL_DEFS = [
    { key: 'brightness', label: 'Luz', min: -1, max: 1, step: 0.01, digits: 2, title: 'Brilho do filtro de cor (color_filter_v2)' },
    { key: 'contrast', label: 'Contraste', min: -4, max: 4, step: 0.01, digits: 2, title: 'Contraste do filtro de cor' },
    { key: 'saturation', label: 'Saturação', min: -1, max: 5, step: 0.01, digits: 2, title: 'Saturação do filtro de cor' },
    { key: 'gamma', label: 'Gamma', min: -1, max: 1, step: 0.01, digits: 2, title: 'Gamma do filtro de cor' }
  ];
  const RGB_DEFS = [
    { key: 'gain-r', label: 'Ganho R', group: 'gain', min: 0, max: 100, step: 0.1, def: 100, channel: 16 },
    { key: 'gain-g', label: 'Ganho G', group: 'gain', min: 0, max: 100, step: 0.1, def: 100, channel: 8 },
    { key: 'gain-b', label: 'Ganho B', group: 'gain', min: 0, max: 100, step: 0.1, def: 100, channel: 0 },
    { key: 'lift-r', label: 'Lift R', group: 'lift', min: 0, max: 100, step: 0.1, def: 0, channel: 16 },
    { key: 'lift-g', label: 'Lift G', group: 'lift', min: 0, max: 100, step: 0.1, def: 0, channel: 8 },
    { key: 'lift-b', label: 'Lift B', group: 'lift', min: 0, max: 100, step: 0.1, def: 0, channel: 0 },
    { key: 'gamma-r', label: 'Gamma R', group: 'gamma', min: 0.1, max: 4, step: 0.001, def: 1, digits: 2 },
    { key: 'gamma-g', label: 'Gamma G', group: 'gamma', min: 0.1, max: 4, step: 0.001, def: 1, digits: 2 },
    { key: 'gamma-b', label: 'Gamma B', group: 'gamma', min: 0.1, max: 4, step: 0.001, def: 1, digits: 2 },
    { key: 'hue', label: 'Hue', group: 'hue', min: -180, max: 180, step: 1, def: 0 }
  ];
  const SURFACE_GROUPS = [
    { id: 'lift', label: 'Lift', sub: 'pretos', neutral: 0, min: 0, max: 100, step: 1, digits: 0 },
    { id: 'gamma', label: 'Gamma', sub: 'médios', neutral: 1, min: 0.1, max: 4, step: 0.01, digits: 2 },
    { id: 'gain', label: 'Gain', sub: 'brancos', neutral: 100, min: 0, max: 100, step: 1, digits: 0 }
  ];
  const SURFACE_KNOBS = [
    { key: 'brightness', label: 'Luz', min: -1, max: 1, step: 0.01, def: 0, digits: 2 },
    { key: 'contrast', label: 'Contraste', min: -4, max: 4, step: 0.01, def: 0, digits: 2 },
    { key: 'saturation', label: 'Saturação', min: -1, max: 5, step: 0.01, def: 0, digits: 2 },
    { key: 'gamma', label: 'Gamma', min: -1, max: 1, step: 0.01, def: 0, digits: 2 },
    { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, def: 0, digits: 0, unit: '°' }
  ];
  const PRESETS = {
    neutral: { brightness: 0, contrast: 0, saturation: 0, gamma: 0, hue_shift: 0, color_multiply: 0xFFFFFF, color_add: 0 },
    broadcast: { brightness: 0.02, contrast: 0.12, saturation: 0.08, gamma: 0.02, hue_shift: 0, color_multiply: 0xFFFFFF, color_add: 0 },
    warm: { brightness: 0.02, contrast: 0.10, saturation: 0.12, gamma: 0.04, hue_shift: 0, color_multiply: 0xFFFFE6, color_add: 0 },
    cool: { brightness: 0, contrast: 0.08, saturation: -0.06, gamma: -0.02, hue_shift: 0, color_multiply: 0xE6FFFF, color_add: 0 },
    contrast: { brightness: 0, contrast: 0.35, saturation: 0.05, gamma: 0, hue_shift: 0, color_multiply: 0xFFFFFF, color_add: 0 },
    soft: { brightness: 0.03, contrast: -0.05, saturation: -0.05, gamma: 0.05, hue_shift: 0, color_multiply: 0xFFFFFF, color_add: 0 }
  };
  const REMOTE_DEFS = {
    brightness: { label: 'Luz', kind: 'range', min: 0, max: 100, step: 1, digits: 0, note: 'ONVIF 0–100' },
    contrast: { label: 'Contraste', kind: 'range', min: 0, max: 100, step: 1, digits: 0, note: 'ONVIF 0–100' },
    saturation: { label: 'Saturação', kind: 'range', min: 0, max: 100, step: 1, digits: 0, note: 'ONVIF 0–100' },
    sharpness: { label: 'Nitidez', kind: 'range', min: 0, max: 100, step: 1, digits: 0, note: 'ONVIF 0–100' },
    gamma: { label: 'Gamma', kind: 'range', min: 0.1, max: 2, step: 0.01, digits: 2, note: 'faixa do fabricante' },
    iris: { label: 'Íris', kind: 'raw', min: 0, max: 65535, step: 1, note: 'valor bruto VISCA' },
    gain: { label: 'Ganho', kind: 'raw', min: 0, max: 65535, step: 1, note: 'valor bruto VISCA' },
    shutter: { label: 'Shutter', kind: 'raw', min: 0, max: 65535, step: 1, note: 'valor bruto VISCA' },
    exposureMode: { label: 'Exposição', kind: 'select', note: 'ONVIF' },
    aeMode: { label: 'Modo AE', kind: 'select', note: 'VISCA' },
    wbMode: { label: 'White balance', kind: 'select', note: 'câmera' }
  };
  const SCOPE_META = {
    wave: { title: 'Onda Y', note: 'Luminância por coluna · escala relativa 0–100% do quadro' },
    rgb: { title: 'Onda RGB', note: 'R, G e B sobrepostos · escala relativa' },
    parade: { title: 'Parade RGB', note: 'R, G e B separados · escala relativa' },
    yuv: { title: 'YUV Parade', note: 'Y, U e V separados · escala relativa' },
    vector: { title: 'Vectorscópio', note: 'Croma U/V · alvos 100% aproximados' },
    hist: { title: 'Histograma RGB', note: 'Distribuição de R, G e B no quadro' },
    false: { title: 'False Color', note: 'Luma relativa 0–100% · paleta de exposição' },
    cie: { title: 'CIE 1931', note: 'Cromaticidade xy · triângulo sRGB' },
    rgba: { title: 'RGBA', note: 'Isolamento de canais · alfa indisponível no JPEG' }
  };
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  const gate = window.FreeMixEffectsGate;

  const S = {
    connected: false,
    inputs: [],
    selectedKey: '',
    selectedName: '',
    lastFrame: null,
    pixels: null,
    pixelW: 640,
    pixelH: 360,
    frameUrl: '',
    frameBusy: false,
    frameAt: 0,
    frozen: false,
    referenceFrame: null,
    previewEnabled: true,
    previewDirty: false,
    previewActive: false,
    previewPixels: null,
    zebra: false,
    peaking: false,
    pick: null,
    split: false,
    splitPos: 50,
    mask: false,
    maskMode: '90',
    grid: true,
    scope: 'wave',
    vectorGain: 1,
    scopeScale: 'pct',
    scopeLabels: true,
    savedCompareKeys: [],
    savedReferenceKey: '',
    local: { supported: false, exists: false, active: false, settings: { ...DEFAULT_SETTINGS }, bounds: {}, defaults: { ...DEFAULT_SETTINGS }, reason: '' },
    grade: { supported: false, exists: false, enabled: false, settings: { gamma_r: 1, gamma_g: 1, gamma_b: 1 } },
    localBusy: false,
    syncingLocal: false,
    known: new Map(),
    ptz: { devices: [], links: {} },
    deviceId: '',
    remoteValues: null,
    remoteBusy: false,
    compareKeys: [],
    referenceKey: '',
    compareFrames: new Map(),
    compareBusy: false,
    thumbs: {},
    activePane: 'local',
    localTab: 'rgb',
    surface: { open: false, group: 'lift', built: false, drag: null, help: false },
    confirmAction: null,
    messageTimer: 0
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const fmt = (value, digits = 2) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : '—';
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  function paintRange(input) {
    if (!input || input.type !== 'range') return;
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = Number(input.value) || 0;
    const pct = max > min ? clamp(((value - min) / (max - min)) * 100, 0, 100) : 0;
    input.style.setProperty('--range-pct', pct.toFixed(2) + '%');
  }

  function say(text, tone = '') {
    const box = E('color-msg');
    box.textContent = text || '';
    box.className = 'color-msg' + (tone ? ' ' + tone : '');
    clearTimeout(S.messageTimer);
    if (text) S.messageTimer = setTimeout(() => { box.textContent = ''; box.className = 'color-msg'; }, tone === 'bad' ? 12000 : 7000);
  }

  function setBadge(el, text, tone = '') {
    if (!el) return;
    el.textContent = text;
    el.className = 'color-chip' + (tone ? ' ' + tone : '');
  }

  function captureReference() {
    if (!S.lastFrame) { say('Sem quadro para congelar.', 'warn'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = S.pixelW;
    canvas.height = S.pixelH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(S.lastFrame, 0, 0, S.pixelW, S.pixelH);
    S.referenceFrame = canvas.toDataURL('image/jpeg', 0.9);
    E('color-reference-frame').src = S.referenceFrame;
    E('color-reference-frame').hidden = false;
    E('color-ref-clear').disabled = false;
    E('color-split-toggle').disabled = false;
    E('color-split-toggle').checked = true;
    E('color-split-range').hidden = false;
    E('color-split-val').hidden = false;
    E('color-split-line').hidden = false;
    S.split = true;
    updateSplit();
    saveSettings();
    say('Referência congelada. Arraste o Split para comparar.', 'ok');
  }

  function clearReference() {
    S.referenceFrame = null;
    S.split = false;
    E('color-reference-frame').removeAttribute('src');
    E('color-reference-frame').hidden = true;
    E('color-ref-clear').disabled = true;
    E('color-split-toggle').disabled = true;
    E('color-split-toggle').checked = false;
    E('color-split-range').hidden = true;
    E('color-split-val').hidden = true;
    E('color-split-line').hidden = true;
    saveSettings();
    say('Referência removida.', '');
  }

  function updateSplit() {
    const range = E('color-split-range');
    const pos = clamp(Number(range.value) || 50, 0, 100);
    S.splitPos = pos;
    range.value = String(pos);
    paintRange(range);
    const output = E('color-split-val');
    if (output) {
      output.textContent = `${Math.round(pos)}%`;
      output.hidden = range.hidden;
    }
    const line = E('color-split-line');
    line.style.left = `${pos}%`;
    line.setAttribute('aria-valuenow', String(Math.round(pos)));
    const badge = E('color-split-badge');
    if (badge) badge.textContent = `${Math.round(pos)}%`;
    if (S.referenceFrame) E('color-reference-frame').style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
  }

  function setSplit(on, persist = true) {
    if (on && !S.referenceFrame) {
      E('color-split-toggle').checked = false;
      say('Congele uma referência primeiro.', 'warn');
      return;
    }
    S.split = on;
    E('color-split-toggle').checked = on;
    E('color-split-range').hidden = !on;
    E('color-split-val').hidden = !on;
    E('color-reference-frame').hidden = !on || !S.referenceFrame;
    E('color-split-line').hidden = !on;
    if (on) updateSplit();
    if (persist) saveSettings();
  }

  let splitDrag = null;
  function updateSplitFromPointer(event) {
    const wrap = E('color-frame-wrap');
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return;
    const pos = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    E('color-split-range').value = String(pos);
    updateSplit();
  }

  function bindSplitLine() {
    const line = E('color-split-line');
    if (!line || line.dataset.bound === '1') return;
    line.dataset.bound = '1';
    const move = (event) => {
      if (splitDrag === null || event.pointerId !== splitDrag) return;
      updateSplitFromPointer(event);
    };
    const end = (event) => {
      if (splitDrag === null || event.pointerId !== splitDrag) return;
      splitDrag = null;
      line.classList.remove('dragging');
      saveSettings();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    line.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || line.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      splitDrag = event.pointerId;
      line.classList.add('dragging');
      try { line.setPointerCapture(event.pointerId); } catch { /* ponteiro sintético */ }
      updateSplitFromPointer(event);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
    line.addEventListener('click', (event) => event.stopPropagation());
    line.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      E('color-split-range').value = '50';
      updateSplit();
      saveSettings();
    });
    line.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const step = event.shiftKey ? 10 : 1;
      let pos = Number(E('color-split-range').value) || 50;
      if (event.key === 'ArrowLeft') pos -= step;
      else if (event.key === 'ArrowRight') pos += step;
      else if (event.key === 'Home') pos = 0;
      else pos = 100;
      E('color-split-range').value = String(clamp(pos, 0, 100));
      updateSplit();
      saveSettings();
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function setMask(on, persist = true) {
    S.mask = on;
    E('color-mask-toggle').checked = on;
    E('color-frame-wrap').classList.toggle('mask-on', on);
    E('color-mask-mode').disabled = !on;
    if (persist) saveSettings();
  }

  function setMaskMode(mode, persist = true) {
    S.maskMode = ['90', '80', '4x3'].includes(mode) ? mode : '90';
    E('color-mask-mode').value = S.maskMode;
    E('color-frame-mask').dataset.mode = S.maskMode;
    if (persist) saveSettings();
  }

  function setGrid(on, persist = true) {
    S.grid = on;
    E('color-grid-toggle').checked = on;
    E('color-frame-wrap').classList.toggle('no-grid', !on);
    if (persist) saveSettings();
  }

  function applyMonitorOptions() {
    E('color-split-range').value = String(S.splitPos);
    E('color-mask-mode').value = S.maskMode;
    E('color-mask-toggle').checked = S.mask;
    E('color-grid-toggle').checked = S.grid;
    E('color-preview-toggle').checked = S.previewEnabled;
    E('color-frame-mask').dataset.mode = S.maskMode;
    setMask(S.mask, false);
    setGrid(S.grid, false);
    setPreviewEnabled(S.previewEnabled, false);
    setZebra(S.zebra, false);
    setPeaking(S.peaking, false);
    // A referência é um still de sessão; não persiste entre recargas.
    S.referenceFrame = null;
    S.split = false;
    E('color-split-toggle').checked = false;
    E('color-split-toggle').disabled = true;
    E('color-split-range').hidden = true;
    E('color-split-val').hidden = true;
    E('color-reference-frame').hidden = true;
    E('color-split-line').hidden = true;
    paintRange(E('color-split-range'));
  }

  function previewPixels(settings) {
    if (!S.pixels) return null;
    const src = S.pixels;
    const out = new Uint8ClampedArray(src.length);
    const cm = Number(settings.color_multiply) >>> 0;
    const ca = Number(settings.color_add) >>> 0;
    const gainR = (cm & 255) / 255, gainG = ((cm >> 8) & 255) / 255, gainB = ((cm >> 16) & 255) / 255;
    const liftR = (ca & 255) / 255, liftG = ((ca >> 8) & 255) / 255, liftB = ((ca >> 16) & 255) / 255;
    const gammaR = clamp(Number(settings.gamma_r) || 1, 0.1, 4);
    const gammaG = clamp(Number(settings.gamma_g) || 1, 0.1, 4);
    const gammaB = clamp(Number(settings.gamma_b) || 1, 0.1, 4);
    const globalGamma = clamp(1 + Number(settings.gamma || 0), 0.1, 4);
    const brightness = Number(settings.brightness || 0);
    const contrast = Number(settings.contrast || 0);
    const saturation = Number(settings.saturation || 0);
    const hue = (Number(settings.hue_shift || 0) * Math.PI) / 180;
    const cos = Math.cos(hue), sin = Math.sin(hue);
    const hr0 = 0.213 + cos * 0.787 - sin * 0.213;
    const hr1 = 0.715 - cos * 0.715 - sin * 0.715;
    const hr2 = 0.072 - cos * 0.072 + sin * 0.928;
    const hg0 = 0.213 - cos * 0.213 + sin * 0.143;
    const hg1 = 0.715 + cos * 0.285 + sin * 0.140;
    const hg2 = 0.072 - cos * 0.072 - sin * 0.283;
    const hb0 = 0.213 - cos * 0.213 - sin * 0.787;
    const hb1 = 0.715 - cos * 0.715 + sin * 0.715;
    const hb2 = 0.072 + cos * 0.928 + sin * 0.072;
    for (let i = 0; i < src.length; i += 4) {
      let r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
      r = clamp(r * gainR + liftR, 0, 1);
      g = clamp(g * gainG + liftG, 0, 1);
      b = clamp(b * gainB + liftB, 0, 1);
      r = Math.pow(r, 1 / gammaR);
      g = Math.pow(g, 1 / gammaG);
      b = Math.pow(b, 1 / gammaB);
      r = Math.pow(r, 1 / globalGamma);
      g = Math.pow(g, 1 / globalGamma);
      b = Math.pow(b, 1 / globalGamma);
      r = (r - 0.5) * (1 + contrast) + 0.5 + brightness;
      g = (g - 0.5) * (1 + contrast) + 0.5 + brightness;
      b = (b - 0.5) * (1 + contrast) + 0.5 + brightness;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * (1 + saturation);
      g = luma + (g - luma) * (1 + saturation);
      b = luma + (b - luma) * (1 + saturation);
      const rr = r * hr0 + g * hr1 + b * hr2;
      const gg = r * hg0 + g * hg1 + b * hg2;
      const bb = r * hb0 + g * hb1 + b * hb2;
      out[i] = clamp(rr * 255, 0, 255);
      out[i + 1] = clamp(gg * 255, 0, 255);
      out[i + 2] = clamp(bb * 255, 0, 255);
      out[i + 3] = 255;
    }
    return out;
  }

  function drawPreview() {
    if (!S.previewEnabled || !S.previewDirty || !S.pixels || !S.lastFrame) { hidePreview(); return; }
    const pixels = previewPixels(localFieldValues());
    if (!pixels) { hidePreview(); return; }
    const canvas = E('color-preview-canvas');
    canvas.width = S.pixelW;
    canvas.height = S.pixelH;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(S.pixelW, S.pixelH);
    image.data.set(pixels);
    ctx.putImageData(image, 0, 0);
    canvas.hidden = false;
    S.previewActive = true;
    S.previewPixels = pixels;
    E('color-preview-badge').hidden = false;
    updateHudState();
    updateMonitorOverlay();
    const raw = S.pixels;
    S.pixels = pixels;
    drawScope();
    S.pixels = raw;
  }

  function hidePreview() {
    clearTimeout(S.previewTimer);
    S.previewActive = false;
    S.previewPixels = null;
    E('color-preview-canvas').hidden = true;
    E('color-preview-badge').hidden = true;
    updateHudState();
    updateMonitorOverlay();
    if (S.pixels) drawScope();
  }

  function setZebra(on, persist = true) {
    S.zebra = Boolean(on);
    const button = E('color-zebra-toggle');
    if (button) {
      button.classList.toggle('on', S.zebra);
      button.setAttribute('aria-pressed', String(S.zebra));
    }
    if (persist) saveSettings();
    updateMonitorOverlay();
  }

  function setPeaking(on, persist = true) {
    S.peaking = Boolean(on);
    const button = E('color-peaking-toggle');
    if (button) {
      button.classList.toggle('on', S.peaking);
      button.setAttribute('aria-pressed', String(S.peaking));
    }
    if (persist) saveSettings();
    updateMonitorOverlay();
  }

  function updateMonitorOverlay() {
    const canvas = E('color-monitor-overlay');
    if (!canvas) return;
    const data = (S.previewActive && S.previewPixels) ? S.previewPixels : S.pixels;
    if (!data || (!S.zebra && !S.peaking)) {
      canvas.hidden = true;
      return;
    }
    const w = S.pixelW, h = S.pixelH;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(w, h);
    const out = image.data;
    if (S.zebra) {
      const threshold = 242; // ~95% de 255
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (luma < threshold) continue;
        const pixel = i / 4;
        const x = pixel % w, y = Math.floor(pixel / w);
        if (((x + y) & 7) >= 4) continue;
        out[i] = 255;
        out[i + 1] = 214;
        out[i + 2] = 0;
        out[i + 3] = 238;
      }
    }
    if (S.peaking) {
      const luma = new Float32Array(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        luma[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          const gx = -luma[p - w - 1] - 2 * luma[p - 1] - luma[p + w - 1] + luma[p - w + 1] + 2 * luma[p + 1] + luma[p + w + 1];
          const gy = -luma[p - w - 1] - 2 * luma[p - w] - luma[p - w + 1] + luma[p + w - 1] + 2 * luma[p + w] + luma[p + w + 1];
          if (Math.abs(gx) + Math.abs(gy) < 170) continue;
          const i = p * 4;
          out[i] = 120;
          out[i + 1] = 245;
          out[i + 2] = 255;
          out[i + 3] = 232;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    canvas.hidden = false;
  }

  function schedulePreview() {
    if (!S.previewEnabled || !S.previewDirty) { hidePreview(); return; }
    clearTimeout(S.previewTimer);
    S.previewTimer = setTimeout(drawPreview, 45);
  }

  function markPreview() {
    if (S.syncingLocal) return;
    S.previewDirty = true;
    schedulePreview();
  }

  function setPreviewEnabled(on, persist = true) {
    S.previewEnabled = on;
    E('color-preview-toggle').checked = on;
    if (!on) {
      S.previewDirty = false;
      hidePreview();
    } else {
      S.previewDirty = true;
      schedulePreview();
    }
    if (persist) saveSettings();
  }

  function setSteps() {
    const order = ['input', 'analysis', 'correction', 'compare', 'remote'];
    const raw = {
      input: !!S.selectedKey,
      analysis: !!S.lastFrame,
      correction: S.local.active === true || S.grade.enabled === true,
      compare: S.compareKeys.length >= 2,
      remote: !!(S.remoteValues && Object.keys(S.remoteValues).length)
    };
    // O fluxo é sequencial: uma etapa só conta como concluída quando as anteriores
    // também estão. A comparação e o shading continuam utilizáveis fora de ordem.
    const done = {};
    let previous = true;
    for (const key of order) {
      done[key] = previous && raw[key] === true;
      previous = done[key];
    }
    let active = order.find((key) => !done[key]) || 'remote';
    if (S.activePane === 'remote') active = 'remote';
    for (const el of document.querySelectorAll('.color-step')) {
      const key = el.dataset.step;
      el.classList.toggle('done', done[key] === true && key !== active);
      el.classList.toggle('active', key === active);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Topbar, navegação e saúde                                         */
  /* ---------------------------------------------------------------- */

  function buildNav() {
    const box = E('color-nav');
    if (!window.FreeMixWorkspaceNav) return;
    box.innerHTML = window.FreeMixWorkspaceNav.nav('color', 'color-nav-project');
    window.FreeMixWorkspaceNav.bind(box, 'color');
    const brand = box.querySelector('.workspace-brand');
    if (brand) {
      brand.innerHTML = '<img src="/img/3mix-logo.png" alt="3Mix">';
      brand.title = '3Mix · Color Studio';
    }
  }

  async function refreshHealth() {
    try {
      const response = await fetch('/api/json', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      const state = await response.json().catch(() => ({}));
      S.connected = response.ok && state.connected === true;
      const led = E('color-engine');
      led.textContent = S.connected ? 'Motor conectado' : 'Motor desconectado';
      led.className = 'color-led ' + (S.connected ? 'ok' : 'bad');
      E('color-project').textContent = state.preset || state.program || '—';
      if (!S.connected) say('Motor desconectado. O Color Studio não consegue ler quadro nem filtros.', 'bad');
      return S.connected;
    } catch (error) {
      S.connected = false;
      E('color-engine').textContent = 'Motor indisponível';
      E('color-engine').className = 'color-led bad';
      say('Motor indisponível: ' + error.message, 'bad');
      return false;
    }
  }

  async function openPanel(route) {
    if (window.FreeMixWorkspaceNav?.open) return window.FreeMixWorkspaceNav.open(route);
    window.open(route, '3Mix_' + route.replace(/[^a-z0-9]/gi, ''), 'width=1280,height=800,resizable=yes,scrollbars=yes');
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Entradas                                                          */
  /* ---------------------------------------------------------------- */

  async function loadInputs() {
    const response = await fetch('/api/effects', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.effects?.quality) throw Error(data.error || 'Lista de entradas indisponível');
    gate.observe(data.effects);
    const targets = (data.effects.quality.targets || []).filter((row) => row && row.key && row.video === true);
    S.inputs = targets
      .map((row) => ({ key: row.key, name: row.name || 'Entrada', audio: row.audio === true }))
      .sort((a, b) => collator.compare(a.name, b.name));
    renderSourceList();
    fillInputSelect();
    E('color-source-count').textContent = String(S.inputs.length);
    if (!S.inputs.length) {
      setBadge(E('color-input-badge'), 'sem entradas', 'warn');
      say('O motor não devolveu nenhuma entrada com vídeo.', 'warn');
      return;
    }
    if (!S.selectedKey || !S.inputs.some((item) => item.key === S.selectedKey)) {
      const saved = (() => { try { return localStorage.getItem('3mix.color.input') || ''; } catch { return ''; } })();
      const preferred = S.inputs.find((item) => item.key === saved)
        || S.inputs.find((item) => /^CAM\b/i.test(item.name))
        || S.inputs[0];
      selectInput(preferred.key);
    }
  }

  function fillInputSelect() {
    const select = E('color-input');
    const previous = S.selectedKey || select.value;
    select.replaceChildren(...S.inputs.map((item) => new Option(item.name, item.key)));
    if (previous && S.inputs.some((item) => item.key === previous)) select.value = previous;
  }

  function renderSourceList() {
    const box = E('color-source-list');
    if (!box) return;
    if (!S.inputs.length) {
      box.innerHTML = '<div class="color-empty">Nenhuma entrada de vídeo encontrada.</div>';
      return;
    }
    box.innerHTML = S.inputs.map((item) => {
      const known = S.known.get(item.key);
      const active = known?.active === true || known?.grade?.enabled === true;
      const thumb = S.thumbs[item.name] || '';
      return `<button type="button" class="color-source-item${item.key === S.selectedKey ? ' active' : ''}" data-key="${esc(item.key)}" title="${esc(item.name)} — clique para analisar">
        <img class="color-source-thumb" data-name="${esc(item.name)}" alt=""${thumb ? ` src="${thumb}"` : ''}>
        <span class="color-source-name">${esc(item.name)}</span>
        <span class="color-source-meta"><span class="color-source-dot${active ? ' active' : ''}"></span><small>${active ? 'corrigida' : 'vídeo'}</small></span>
      </button>`;
    }).join('');
  }

  function updateSourceThumbs() {
    for (const img of document.querySelectorAll('#color-source-list .color-source-thumb')) {
      const src = S.thumbs[img.dataset.name];
      if (src && img.getAttribute('src') !== src) img.src = src;
    }
  }

  function setHudInput(name) {
    const el = E('color-hud-input');
    if (el) el.textContent = name || '—';
  }

  function setHudTime(text) {
    const el = E('color-hud-time');
    if (el) el.textContent = text || '--:--:--';
  }

  function updateHudState() {
    const el = E('color-hud-state');
    if (!el) return;
    let text = 'SEM QUADRO', tone = 'off';
    if (S.previewActive) { text = 'PRÉVIA LOCAL'; tone = 'preview'; }
    else if (S.frozen) { text = 'CONGELADO'; tone = 'freeze'; }
    else if (S.lastFrame) { text = 'AO VIVO'; tone = 'live'; }
    el.textContent = text;
    el.className = 'color-hud-state ' + tone;
  }

  function sampleDisplayedPixel(px, py) {
    const data = (S.previewActive && S.previewPixels) ? S.previewPixels : S.pixels;
    if (!data) return null;
    const i = (py * S.pixelW + px) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  }

  function clearColorPick() {
    const pick = E('color-pick'), cross = E('color-pick-cross');
    if (pick) pick.hidden = true;
    if (cross) cross.hidden = true;
  }

  function updateColorPick(event) {
    const wrap = E('color-frame-wrap'), pick = E('color-pick'), cross = E('color-pick-cross');
    if (!wrap || !pick || !cross || !S.pixels || !S.lastFrame) { clearColorPick(); return; }
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const px = Math.min(S.pixelW - 1, Math.max(0, Math.floor(x * S.pixelW)));
    const py = Math.min(S.pixelH - 1, Math.max(0, Math.floor(y * S.pixelH)));
    const pixel = sampleDisplayedPixel(px, py);
    if (!pixel) { clearColorPick(); return; }
    const hex = '#' + [pixel.r, pixel.g, pixel.b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    const luma = (0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b) / 255 * 100;
    S.pick = { ...pixel, hex, y: luma };
    pick.hidden = false;
    cross.hidden = false;
    cross.style.left = `${x * 100}%`;
    cross.style.top = `${y * 100}%`;
    E('color-pick-swatch').style.background = hex;
    E('color-pick-rgb').textContent = `RGB ${pixel.r} ${pixel.g} ${pixel.b}`;
    E('color-pick-hex').textContent = hex;
    E('color-pick-y').textContent = `Y ${luma.toFixed(1)}%`;
  }

  function copyColorPick() {
    if (!S.pick) return;
    navigator.clipboard?.writeText(S.pick.hex)
      .then(() => say(`HEX ${S.pick.hex} copiado.`, 'ok'))
      .catch(() => {});
  }

  function selectInput(key) {
    const item = S.inputs.find((row) => row.key === key);
    if (!item) return;
    S.selectedKey = item.key;
    S.selectedName = item.name;
    try { localStorage.setItem('3mix.color.input', item.key); } catch { /* sem storage */ }
    E('color-input').value = item.key;
    E('color-monitor-title').textContent = item.name;
    setHudInput(item.name);
    setBadge(E('color-input-badge'), item.name, 'cyan');
    renderSourceList();
    renderCompareGrid();
    setSteps();
    S.remoteValues = null;
    S.previewDirty = false;
    hidePreview();
    clearColorPick();
    preselectDevice();
    inspectLocal(item.key, { quiet: true });
    loadFrame(true);
  }

  /* ---------------------------------------------------------------- */
  /* Quadro real + scopes                                              */
  /* ---------------------------------------------------------------- */

  function fitCanvas(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 640));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || 220));
    const width = Math.max(1, Math.floor(cssW * dpr));
    const height = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: cssW, h: cssH, dpr };
  }

  function clearScope(text = 'SEM QUADRO') {
    updateScopeClip(null);
    const canvas = E('color-scope');
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#131313';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.fillStyle = '#5f5f5f';
    ctx.font = '11px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  function cachePixels() {
    if (!S.lastFrame) { S.pixels = null; return; }
    const canvas = document.createElement('canvas');
    canvas.width = S.pixelW;
    canvas.height = S.pixelH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(S.lastFrame, 0, 0, S.pixelW, S.pixelH);
    try {
      S.pixels = ctx.getImageData(0, 0, S.pixelW, S.pixelH).data;
    } catch {
      S.pixels = null;
    }
  }

  async function loadFrame(force = false) {
    if (S.frameBusy || !S.selectedKey) return;
    if (S.frozen && !force) return;
    const key = S.selectedKey;
    const name = S.selectedName;
    S.frameBusy = true;
    try {
      const response = await fetch('/api/color/frame?input=' + encodeURIComponent(key) + '&t=' + Date.now(), {
        cache: 'no-store', signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw Error(data.error || 'Sem quadro para esta entrada');
      }
      const blob = await response.blob();
      if (key !== S.selectedKey) return;
      const url = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(Error('Quadro inválido'));
        image.src = url;
      });
      if (key !== S.selectedKey) { URL.revokeObjectURL(url); return; }
      const old = S.frameUrl;
      S.frameUrl = url;
      S.lastFrame = image;
      S.frameAt = Date.now();
      E('color-freeze').disabled = false;
      E('color-ref-capture').disabled = false;
      E('color-frame').src = url;
      E('color-frame-empty').hidden = true;
      setBadge(E('color-frame-state'), S.frozen ? 'congelado' : 'ao vivo', S.frozen ? 'warn' : 'ok');
      E('color-frame-info').textContent = `${image.naturalWidth}×${image.naturalHeight} · ${name}`;
      const stamp = new Date().toLocaleTimeString('pt-BR');
      E('color-frame-time').textContent = stamp;
      setHudTime(stamp);
      updateHudState();
      if (old) setTimeout(() => URL.revokeObjectURL(old), 1800);
      cachePixels();
      S.previewPixels = null;
      drawScope();
      if (S.previewDirty) schedulePreview(); else hidePreview();
      updateMonitorOverlay();
      setSteps();
    } catch (error) {
      if (key !== S.selectedKey) return;
      E('color-frame').removeAttribute('src');
      E('color-frame-empty').hidden = false;
      E('color-freeze').disabled = true;
      E('color-ref-capture').disabled = true;
      setBadge(E('color-frame-state'), 'sem quadro', 'warn');
      E('color-frame-info').textContent = error.message;
      E('color-frame-time').textContent = '—';
      setHudTime('--:--:--');
      S.lastFrame = null;
      S.pixels = null;
      clearScope('SEM QUADRO');
      hidePreview();
      clearColorPick();
      updateHudState();
      setSteps();
    } finally {
      S.frameBusy = false;
    }
  }

  function scopeFrame() {
    const canvas = E('color-scope');
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
    background.addColorStop(0, '#171a1b');
    background.addColorStop(1, '#0e1011');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    return { ctx, w, h };
  }

  function plotBox(w, h) {
    const left = 34;
    const right = 10;
    const top = 12;
    const bottom = 22;
    return { left, right, top, bottom, pw: Math.max(1, w - left - right), ph: Math.max(1, h - top - bottom) };
  }

  function drawGrid(ctx, w, h, labels = true) {
    const box = plotBox(w, h);
    ctx.lineWidth = 1;
    ctx.font = '9.5px Consolas, monospace';
    // Linhas menores a cada 10% e maiores a cada 25%.
    for (let i = 1; i < 10; i++) {
      const y = box.top + box.ph - (box.ph * i) / 10;
      ctx.strokeStyle = i % 2 === 0 ? '#303030' : '#252525';
      ctx.beginPath();
      ctx.moveTo(box.left, Math.round(y) + 0.5);
      ctx.lineTo(box.left + box.pw, Math.round(y) + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#8b8b8b';
    const values = S.scopeScale === '8bit' ? [0, 64, 128, 192, 255] : [0, 25, 50, 75, 100];
    for (let i = 0; i <= 4; i++) {
      const y = box.top + box.ph - (box.ph * i) / 4;
      ctx.strokeStyle = '#383838';
      ctx.beginPath();
      ctx.moveTo(box.left, Math.round(y) + 0.5);
      ctx.lineTo(box.left + box.pw, Math.round(y) + 0.5);
      ctx.stroke();
      if (labels && S.scopeLabels) ctx.fillText(String(values[i]), 5, y + 3);
    }
    for (let i = 1; i < 6; i++) {
      const x = box.left + (box.pw * i) / 6;
      ctx.strokeStyle = i === 3 ? '#3a3a3a' : '#282828';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, box.top);
      ctx.lineTo(Math.round(x) + 0.5, box.top + box.ph);
      ctx.stroke();
    }
    ctx.strokeStyle = '#474747';
    ctx.strokeRect(box.left + 0.5, box.top + 0.5, box.pw - 1, box.ph - 1);
    return box;
  }

  function densityLayer(ctx, density, width, height, color, x, y, gain = 1, blur = 0, cap = 0) {
    let max = 0;
    for (let i = 0; i < density.length; i++) if (density[i] > max) max = density[i];
    // O vectorscope tem um pico enorme no centro (cinza/baixa saturação). O cap
    // impede que esse pico apague as cores; o centro satura, mas os alvos aparecem.
    const divisor = cap > 0 ? Math.min(max, cap) : max;
    const norm = 1 / Math.max(1, divisor);
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const octx = off.getContext('2d');
    const image = octx.createImageData(width, height);
    for (let i = 0; i < density.length; i++) {
      const value = Math.pow(Math.min(1, density[i] * norm * gain), 0.35);
      if (!value) continue;
      image.data[i * 4] = color[0];
      image.data[i * 4 + 1] = color[1];
      image.data[i * 4 + 2] = color[2];
      image.data[i * 4 + 3] = Math.round(value * 235);
    }
    octx.putImageData(image, 0, 0);
    ctx.save();
    if (blur) {
      // O vetor é uma nuvem de pontos de 1 px; o blur transforma a densidade em
      // um traço legível sem inventar valores. O traço nítido é somado por cima.
      ctx.filter = `blur(${blur}px)`;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(off, x, y, width, height);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(off, x, y, width, height);
    ctx.restore();
  }

  function addDensity(density, width, height, x, y, amount = 1) {
    const row = clamp(y, 0, height - 1);
    density[row * width + x] += amount;
    if (row > 0) density[(row - 1) * width + x] += amount * 0.32;
    if (row < height - 1) density[(row + 1) * width + x] += amount * 0.32;
  }

  function drawWave(parade = false, rgb = false, yuv = false) {
    const { ctx, w, h } = scopeFrame();
    const box = drawGrid(ctx, w, h);
    if (!S.pixels) { clearScope(); return; }
    const W = Math.max(1, Math.floor(box.pw));
    const H = Math.max(1, Math.floor(box.ph));
    const srcW = S.pixelW;
    const srcH = S.pixelH;
    const step = 2;
    if (yuv) {
      const panel = Math.max(1, Math.floor(W / 3));
      const densities = [new Float32Array(panel * H), new Float32Array(panel * H), new Float32Array(panel * H)];
      for (let y = 0; y < srcH; y += step) {
        for (let x = 0; x < srcW; x += step) {
          const i = (y * srcW + x) * 4;
          const r = S.pixels[i], g = S.pixels[i + 1], b = S.pixels[i + 2];
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const u = clamp(128 + (-0.147 * r - 0.289 * g + 0.436 * b), 0, 255);
          const v = clamp(128 + (0.615 * r - 0.515 * g - 0.100 * b), 0, 255);
          const values = [luma, u, v];
          const px = Math.min(panel - 1, Math.floor((x / srcW) * panel));
          for (let c = 0; c < 3; c++) {
            const py = Math.min(H - 1, Math.floor((1 - values[c] / 255) * (H - 1)));
            addDensity(densities[c], panel, H, px, py, 1);
          }
        }
      }
      const colors = [[235, 235, 235], [122, 160, 255], [255, 150, 190]];
      for (let c = 0; c < 3; c++) densityLayer(ctx, densities[c], panel, H, colors[c], box.left + c * panel, box.top, 1.55);
      ctx.strokeStyle = '#454545';
      for (let c = 1; c < 3; c++) {
        const x = box.left + c * panel;
        ctx.beginPath(); ctx.moveTo(x + 0.5, box.top); ctx.lineTo(x + 0.5, box.top + box.ph); ctx.stroke();
      }
      ctx.font = '9px Consolas, monospace';
      ['Y', 'U', 'V'].forEach((label, c) => {
        ctx.fillStyle = ['#ededed', '#7aa0ff', '#ff96be'][c];
        ctx.fillText(label, box.left + c * panel + 4, box.top + 10);
      });
      return;
    }
    if (parade) {
      const panel = Math.max(1, Math.floor(W / 3));
      const densities = [new Float32Array(panel * H), new Float32Array(panel * H), new Float32Array(panel * H)];
      for (let y = 0; y < srcH; y += step) {
        for (let x = 0; x < srcW; x += step) {
          const i = (y * srcW + x) * 4;
          const px = Math.min(panel - 1, Math.floor((x / srcW) * panel));
          for (let c = 0; c < 3; c++) {
            const value = S.pixels[i + c];
            const py = Math.min(H - 1, Math.floor((1 - value / 255) * (H - 1)));
            addDensity(densities[c], panel, H, px, py, 1);
          }
        }
      }
      const colors = [[255, 92, 92], [90, 230, 120], [100, 160, 255]];
      for (let c = 0; c < 3; c++) densityLayer(ctx, densities[c], panel, H, colors[c], box.left + c * panel, box.top, 1.55);
      ctx.strokeStyle = '#454545';
      for (let c = 1; c < 3; c++) {
        const x = box.left + c * panel;
        ctx.beginPath(); ctx.moveTo(x + 0.5, box.top); ctx.lineTo(x + 0.5, box.top + box.ph); ctx.stroke();
      }
      ctx.font = '9px Consolas, monospace';
      ['R', 'G', 'B'].forEach((label, c) => {
        ctx.fillStyle = ['#ff7b7b', '#7ee69a', '#84b3ff'][c];
        ctx.fillText(label, box.left + c * panel + 4, box.top + 10);
      });
      return;
    }
    const densities = [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)];
    for (let y = 0; y < srcH; y += step) {
      for (let x = 0; x < srcW; x += step) {
        const i = (y * srcW + x) * 4;
        const r = S.pixels[i], g = S.pixels[i + 1], b = S.pixels[i + 2];
        const px = Math.min(W - 1, Math.floor((x / srcW) * W));
        if (rgb) {
          const values = [r, g, b];
          for (let c = 0; c < 3; c++) {
            const py = Math.min(H - 1, Math.floor((1 - values[c] / 255) * (H - 1)));
            addDensity(densities[c], W, H, px, py, 1);
          }
        } else {
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const py = Math.min(H - 1, Math.floor((1 - luma / 255) * (H - 1)));
          addDensity(densities[0], W, H, px, py, 1);
        }
      }
    }
    if (rgb) {
      const colors = [[255, 92, 92], [90, 230, 120], [100, 160, 255]];
      for (let c = 0; c < 3; c++) densityLayer(ctx, densities[c], W, H, colors[c], box.left, box.top, 1.5);
    } else {
      densityLayer(ctx, densities[0], W, H, [125, 218, 250], box.left, box.top, 1.85);
    }
  }

  function vectorTargets(size, gain = 1) {
    const scale = ((size * 0.44) / 0.65) * gain;
    const list = [
      ['R', 255, 0, 0], ['Y', 255, 255, 0], ['G', 0, 255, 0],
      ['C', 0, 255, 255], ['B', 0, 0, 255], ['M', 255, 0, 255]
    ];
    return list.map(([label, r, g, b]) => {
      const u = (-0.147 * r - 0.289 * g + 0.436 * b) / 255;
      const v = (0.615 * r - 0.515 * g - 0.100 * b) / 255;
      return { label, x: u * scale, y: -v * scale, color: `rgb(${r},${g},${b})` };
    });
  }

  function drawVector() {
    const { ctx, w, h } = scopeFrame();
    const box = plotBox(w, h);
    const size = Math.max(80, Math.min(box.pw, box.ph));
    const cx = box.left + box.pw / 2;
    const cy = box.top + box.ph / 2;
    const radius = size * 0.44;
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#303030';
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#3a3a3a';
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
    ctx.fillStyle = '#666';
    ctx.font = '8.5px Consolas, monospace';
    ctx.fillText('75%', cx + radius * 0.75 - 10, cy - 4);
    if (!S.pixels) { clearScope(); return; }
    const N = Math.max(80, Math.floor(size));
    const density = new Float32Array(N * N);
    const gain = clamp(Number(S.vectorGain) || 1, 0.5, 5);
    const scale = ((N * 0.44) / 0.65) * gain;
    for (let y = 0; y < S.pixelH; y += 2) {
      for (let x = 0; x < S.pixelW; x += 2) {
        const i = (y * S.pixelW + x) * 4;
        const r = S.pixels[i], g = S.pixels[i + 1], b = S.pixels[i + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // O vectorscope mostra croma; pixels cinza/pretos só fariam uma bola no centro
        // e esconderiam as cores. O critério é de saturação, não de exposição.
        if (luma < 6 || Math.max(r, g, b) - Math.min(r, g, b) < 30) continue;
        const u = (-0.147 * r - 0.289 * g + 0.436 * b) / 255;
        const v = (0.615 * r - 0.515 * g - 0.100 * b) / 255;
        const px = Math.floor(N / 2 + u * scale);
        const py = Math.floor(N / 2 - v * scale);
        if (px >= 0 && px < N && py >= 0 && py < N) {
          // Espalha cada amostra em 3×3 para o ponto de croma ficar legível no
          // tamanho real do painel; não altera a posição U/V medida.
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx, ny = py + dy;
              if (nx >= 0 && nx < N && ny >= 0 && ny < N) density[ny * N + nx] += (dx === 0 && dy === 0) ? 1 : 0.28;
            }
          }
        }
      }
    }
    densityLayer(ctx, density, N, N, [185, 255, 235], cx - N / 2, cy - N / 2, 4.2, 2.1, 6000);
    // Linha de pele (referência de vetor, não uma correção automática).
    const angle = (123 * Math.PI) / 180;
    ctx.save();
    ctx.strokeStyle = 'rgba(220,169,0,.72)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius * 0.92, cy - Math.sin(angle) * radius * 0.92);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#dca900';
    ctx.font = '9px Consolas, monospace';
    ctx.fillText('pele', cx + Math.cos(angle) * radius * 0.92 + 3, cy - Math.sin(angle) * radius * 0.92 + 3);
    for (const target of vectorTargets(N, gain)) {
      const x = cx + target.x;
      const y = cy + target.y;
      ctx.strokeStyle = target.color;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(Math.round(x) - 4.5, Math.round(y) - 4.5, 9, 9);
      ctx.fillStyle = target.color;
      ctx.font = '9px Consolas, monospace';
      ctx.fillText(target.label, x + 6, y - 5);
    }
    ctx.fillStyle = '#777';
    ctx.font = '9px Consolas, monospace';
    ctx.fillText('U', box.left + box.pw - 8, cy + 12);
    ctx.fillText('V', cx + 5, box.top + 10);
  }

  function drawHistogram() {
    const { ctx, w, h } = scopeFrame();
    const box = plotBox(w, h);
    if (!S.pixels) { clearScope(); return; }
    const bins = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
    for (let y = 0; y < S.pixelH; y += 2) {
      for (let x = 0; x < S.pixelW; x += 2) {
        const i = (y * S.pixelW + x) * 4;
        bins[0][S.pixels[i]] += 1;
        bins[1][S.pixels[i + 1]] += 1;
        bins[2][S.pixels[i + 2]] += 1;
      }
    }
    let max = 1;
    for (const channel of bins) for (const value of channel) if (value > max) max = value;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const colors = ['rgba(255,92,92,.55)', 'rgba(90,230,120,.55)', 'rgba(100,160,255,.55)'];
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      ctx.moveTo(box.left, box.top + box.ph);
      for (let i = 0; i < 256; i++) {
        const x = box.left + (i / 255) * box.pw;
        const y = box.top + box.ph - (bins[c][i] / max) * box.ph * 0.94;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(box.left + box.pw, box.top + box.ph);
      ctx.closePath();
      ctx.fillStyle = colors[c];
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#242424';
    ctx.font = '9px Consolas, monospace';
    const marks = S.scopeScale === '8bit' ? [0, 64, 128, 192, 255] : ['0', '25', '50', '75', '100%'];
    for (let i = 0; i <= 4; i++) {
      const x = box.left + (box.pw * i) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, box.top);
      ctx.lineTo(Math.round(x) + 0.5, box.top + box.ph);
      ctx.stroke();
      if (S.scopeLabels) {
        ctx.fillStyle = '#7f7f7f';
        ctx.fillText(String(marks[i]), x - (i === 0 ? -2 : i === 4 ? 18 : 9), box.top + box.ph + 13);
      }
    }
    ctx.strokeStyle = '#474747';
    ctx.strokeRect(box.left + 0.5, box.top + 0.5, box.pw - 1, box.ph - 1);
    ctx.font = '9.5px Consolas, monospace';
    [['R', '#ff7b7b'], ['G', '#7ee69a'], ['B', '#84b3ff']].forEach(([label, color], index) => {
      ctx.fillStyle = color;
      ctx.fillText(label, box.left + 4 + index * 13, box.top + 11);
    });
  }

  function falseColorAt(value) {
    const stops = [
      [0.00, [0, 0, 0]], [0.05, [20, 0, 60]], [0.10, [0, 0, 180]],
      [0.20, [0, 120, 255]], [0.30, [0, 220, 220]], [0.40, [0, 220, 80]],
      [0.50, [120, 255, 0]], [0.60, [255, 255, 0]], [0.70, [255, 180, 0]],
      [0.80, [255, 80, 0]], [0.90, [255, 0, 0]], [0.95, [255, 0, 180]],
      [1.00, [255, 255, 255]]
    ];
    const v = clamp(value, 0, 1);
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i];
        const t = (v - a) / Math.max(0.0001, b - a);
        return [
          Math.round(ca[0] + (cb[0] - ca[0]) * t),
          Math.round(ca[1] + (cb[1] - ca[1]) * t),
          Math.round(ca[2] + (cb[2] - ca[2]) * t)
        ];
      }
    }
    return [255, 255, 255];
  }

  function drawFalseColor() {
    const { ctx, w, h } = scopeFrame();
    if (!S.pixels) { clearScope(); return; }
    const off = document.createElement('canvas');
    off.width = S.pixelW;
    off.height = S.pixelH;
    const octx = off.getContext('2d');
    const image = octx.createImageData(S.pixelW, S.pixelH);
    for (let y = 0; y < S.pixelH; y++) {
      for (let x = 0; x < S.pixelW; x++) {
        const i = (y * S.pixelW + x) * 4;
        const r = S.pixels[i], g = S.pixels[i + 1], b = S.pixels[i + 2];
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const [fr, fg, fb] = falseColorAt(luma);
        image.data[i] = fr;
        image.data[i + 1] = fg;
        image.data[i + 2] = fb;
        image.data[i + 3] = 255;
      }
    }
    octx.putImageData(image, 0, 0);
    const legend = 46;
    const maxW = Math.max(80, w - legend - 20);
    const maxH = Math.max(80, h - 20);
    const drawW = Math.min(maxW, (maxH * 16) / 9);
    const drawH = (drawW * 9) / 16;
    const dx = legend + 10 + (maxW - drawW) / 2;
    const dy = (h - drawH) / 2;
    ctx.drawImage(off, dx, dy, drawW, drawH);
    ctx.strokeStyle = '#3a3a3a';
    ctx.strokeRect(dx + 0.5, dy + 0.5, drawW - 1, drawH - 1);
    const lx = 8, ly = dy, lw = 14, lh = drawH;
    for (let i = 0; i < 100; i++) {
      const [r, g, b] = falseColorAt(1 - i / 99);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(lx, ly + (i / 100) * lh, lw, lh / 100 + 1);
    }
    ctx.strokeStyle = '#555';
    ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1);
    ctx.font = '9px Consolas, monospace';
    ctx.fillStyle = '#9a9a9a';
    for (const pct of [0, 10, 50, 90, 100]) {
      const y = ly + lh - (pct / 100) * lh;
      ctx.fillText(`${pct}%`, lx + lw + 3, y + 3);
    }
    ctx.fillStyle = '#8f8f8f';
    ctx.fillText('EXPOSIÇÃO RELATIVA', lx, Math.max(10, ly - 5));
    ctx.fillText('preto · médio · branco', dx, dy + drawH + 13);
  }

  function drawCie() {
    const { ctx, w, h } = scopeFrame();
    const box = plotBox(w, h);
    const size = Math.max(100, Math.min(box.pw, box.ph) - 8);
    const left = box.left + (box.pw - size) / 2;
    const top = box.top + (box.ph - size) / 2;
    const mapX = (x) => left + (x / 0.8) * size;
    const mapY = (y) => top + (1 - y / 0.9) * size;
    const locus = [
      [0.1741, 0.0050], [0.1733, 0.0048], [0.1714, 0.0051], [0.1644, 0.0109],
      [0.1440, 0.0297], [0.0913, 0.1327], [0.0082, 0.5384], [0.0743, 0.8338],
      [0.2296, 0.7543], [0.3731, 0.6245], [0.5125, 0.4866], [0.6270, 0.3725],
      [0.6915, 0.3083], [0.7190, 0.2809], [0.7300, 0.2700], [0.7334, 0.2666],
      [0.7347, 0.2653]
    ];
    ctx.fillStyle = '#151515';
    ctx.fillRect(left, top, size, size);
    ctx.strokeStyle = '#242424';
    ctx.lineWidth = 1;
    ctx.font = '8.5px Consolas, monospace';
    for (let i = 1; i < 4; i++) {
      const x = mapX(i * 0.2), y = mapY(i * 0.2);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + size, y); ctx.stroke();
      ctx.fillStyle = '#6f6f6f';
      ctx.fillText((i * 0.2).toFixed(1), x + 2, top + size - 3);
      ctx.fillText((i * 0.2).toFixed(1), left + 3, y - 2);
    }
    ctx.strokeStyle = '#3a3a3a';
    ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);
    ctx.beginPath();
    locus.forEach(([x, y], index) => index ? ctx.lineTo(mapX(x), mapY(y)) : ctx.moveTo(mapX(x), mapY(y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(103,212,232,.035)';
    ctx.fill();
    ctx.strokeStyle = '#6a6a6a';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (!S.pixels) { clearScope(); return; }
    const N = Math.max(80, Math.floor(size));
    const density = new Float32Array(N * N);
    for (let y = 0; y < S.pixelH; y += 2) {
      for (let x = 0; x < S.pixelW; x += 2) {
        const i = (y * S.pixelW + x) * 4;
        const r = S.pixels[i] / 255, g = S.pixels[i + 1] / 255, b = S.pixels[i + 2] / 255;
        const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        const R = lin(r), G = lin(g), B = lin(b);
        const X = 0.4124 * R + 0.3576 * G + 0.1805 * B;
        const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;
        const sum = X + Y + Z;
        if (sum < 0.0001) continue;
        const cx = X / sum, cy = Y / sum;
        if (cx < 0 || cx > 0.8 || cy < 0 || cy > 0.9) continue;
        const px = Math.min(N - 1, Math.floor((cx / 0.8) * N));
        const py = Math.min(N - 1, Math.floor((1 - cy / 0.9) * N));
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx >= 0 && nx < N && ny >= 0 && ny < N) density[ny * N + nx] += (dx === 0 && dy === 0) ? 1 : 0.25;
          }
        }
      }
    }
    densityLayer(ctx, density, N, N, [225, 245, 255], left, top, 2.4, 1.4, 7000);
    const triangle = [[0.64, 0.33, 'R', '#ff5c5c'], [0.30, 0.60, 'G', '#5ae678'], [0.15, 0.06, 'B', '#64a0ff']];
    ctx.beginPath();
    triangle.forEach(([x, y], index) => index ? ctx.lineTo(mapX(x), mapY(y)) : ctx.moveTo(mapX(x), mapY(y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(220,220,220,.55)';
    ctx.stroke();
    ctx.font = '9px Consolas, monospace';
    for (const [x, y, label, color] of triangle) {
      ctx.fillStyle = color;
      ctx.fillText(label, mapX(x) + 4, mapY(y) - 3);
    }
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath();
    ctx.arc(mapX(0.3127), mapY(0.3290), 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9a9a9a';
    ctx.fillText('D65', mapX(0.3127) + 5, mapY(0.3290) - 3);
    ctx.fillText('x', left + size - 8, top + size - 2);
    ctx.fillText('y', left + 3, top + 9);
  }

  function drawRgba() {
    const { ctx, w, h } = scopeFrame();
    const box = plotBox(w, h);
    const gap = 6;
    const pw = (box.pw - gap) / 2;
    const ph = (box.ph - gap) / 2;
    const cells = [[0, 'R', '#ff5c5c'], [1, 'G', '#5ae678'], [2, 'B', '#64a0ff'], [3, 'A', '#d0d0d0']];
    if (!S.pixels) { clearScope(); return; }
    for (const [channel, label, color] of cells) {
      const cx = box.left + (channel % 2) * (pw + gap);
      const cy = box.top + Math.floor(channel / 2) * (ph + gap);
      const drawW = Math.min(pw, (ph * 16) / 9);
      const drawH = (drawW * 9) / 16;
      const dx = cx + (pw - drawW) / 2;
      const dy = cy + (ph - drawH) / 2;
      if (channel < 3) {
        const off = document.createElement('canvas');
        off.width = S.pixelW;
        off.height = S.pixelH;
        const octx = off.getContext('2d');
        const image = octx.createImageData(S.pixelW, S.pixelH);
        for (let y = 0; y < S.pixelH; y++) {
          for (let x = 0; x < S.pixelW; x++) {
            const i = (y * S.pixelW + x) * 4;
            const value = S.pixels[i + channel];
            image.data[i] = value;
            image.data[i + 1] = value;
            image.data[i + 2] = value;
            image.data[i + 3] = 255;
          }
        }
        octx.putImageData(image, 0, 0);
        ctx.drawImage(off, dx, dy, drawW, drawH);
      } else {
        for (let yy = 0; yy < drawH; yy += 10) {
          for (let xx = 0; xx < drawW; xx += 10) {
            ctx.fillStyle = ((xx / 10 + yy / 10) % 2) ? '#2a2a2a' : '#1a1a1a';
            ctx.fillRect(dx + xx, dy + yy, 10, 10);
          }
        }
        ctx.fillStyle = '#b0b0b0';
        ctx.font = '9px Consolas, monospace';
        ctx.fillText('ALFA N/D (JPEG)', dx + 8, dy + drawH / 2);
      }
      ctx.strokeStyle = '#3a3a3a';
      ctx.strokeRect(dx + 0.5, dy + 0.5, drawW - 1, drawH - 1);
      ctx.fillStyle = color;
      ctx.font = '9px Consolas, monospace';
      ctx.fillText(label, dx + 4, dy + 11);
      if (channel < 3) {
        let sum = 0, count = 0;
        for (let yy = 0; yy < S.pixelH; yy += 4) {
          for (let xx = 0; xx < S.pixelW; xx += 4) {
            sum += S.pixels[(yy * S.pixelW + xx) * 4 + channel];
            count++;
          }
        }
        ctx.fillStyle = '#9a9a9a';
        ctx.fillText(`méd ${Math.round(sum / Math.max(1, count))}`, dx + 4, dy + drawH - 5);
      }
    }
  }

  function updateScopeClip(pixels) {
    const el = E('color-scope-clip');
    if (!el) return;
    if (!pixels) {
      el.textContent = 'CLIP —';
      el.classList.remove('hot');
      return;
    }
    let high = 0, low = 0, total = 0;
    for (let y = 0; y < S.pixelH; y += 4) {
      for (let x = 0; x < S.pixelW; x += 4) {
        const i = (y * S.pixelW + x) * 4;
        const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
        const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
        if (max >= 254) high++;
        if (min <= 1) low++;
        total++;
      }
    }
    const hp = total ? (high / total) * 100 : 0;
    const lp = total ? (low / total) * 100 : 0;
    el.textContent = `CLIP ${hp.toFixed(1)}% · PRETO ${lp.toFixed(1)}%`;
    el.classList.toggle('hot', hp >= 0.5 || lp >= 0.5);
  }

  function drawScope() {
    updateScopeClip(S.pixels);
    if (!S.pixels) { clearScope(); return; }
    if (S.scope === 'wave') drawWave(false, false, false);
    else if (S.scope === 'rgb') drawWave(false, true, false);
    else if (S.scope === 'parade') drawWave(true, false, false);
    else if (S.scope === 'yuv') drawWave(false, false, true);
    else if (S.scope === 'vector') drawVector();
    else if (S.scope === 'hist') drawHistogram();
    else if (S.scope === 'false') drawFalseColor();
    else if (S.scope === 'cie') drawCie();
    else if (S.scope === 'rgba') drawRgba();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        scope: S.scope,
        vectorGain: S.vectorGain,
        scopeScale: S.scopeScale,
        scopeLabels: S.scopeLabels,
        localTab: S.localTab,
        split: S.split,
        splitPos: S.splitPos,
        mask: S.mask,
        maskMode: S.maskMode,
        grid: S.grid,
        previewEnabled: S.previewEnabled,
        zebra: S.zebra,
        peaking: S.peaking,
        surfaceOpen: S.surface.open,
        surfaceGroup: S.surface.group,
        compareKeys: S.compareKeys,
        referenceKey: S.referenceKey
      }));
    } catch { /* sem storage */ }
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (SCOPE_META[saved.scope]) S.scope = saved.scope;
      const gain = Number(saved.vectorGain);
      S.vectorGain = Number.isFinite(gain) ? clamp(gain, 0.5, 5) : 1;
      S.scopeScale = saved.scopeScale === '8bit' ? '8bit' : 'pct';
      S.scopeLabels = saved.scopeLabels !== false;
      S.localTab = saved.localTab === 'basic' ? 'basic' : 'rgb';
      S.split = saved.split === true;
      S.splitPos = Number.isFinite(Number(saved.splitPos)) ? clamp(Number(saved.splitPos), 0, 100) : 50;
      S.mask = saved.mask === true;
      S.maskMode = ['90', '80', '4x3'].includes(saved.maskMode) ? saved.maskMode : '90';
      S.grid = saved.grid !== false;
      S.previewEnabled = saved.previewEnabled !== false;
      S.zebra = saved.zebra === true;
      S.peaking = saved.peaking === true;
      S.surface.open = saved.surfaceOpen === true;
      S.surface.group = ['lift', 'gamma', 'gain'].includes(saved.surfaceGroup) ? saved.surfaceGroup : 'lift';
      S.savedCompareKeys = Array.isArray(saved.compareKeys) ? saved.compareKeys.filter((key) => typeof key === 'string') : [];
      S.savedReferenceKey = typeof saved.referenceKey === 'string' ? saved.referenceKey : '';
    } catch { /* usa padrões */ }
  }

  function buildScopeSelect() {
    const select = E('color-scope-select');
    if (!select) return;
    select.innerHTML = Object.entries(SCOPE_META).map(([id, meta]) => `<option value="${id}">${esc(meta.title)}</option>`).join('');
    select.value = S.scope;
    select.addEventListener('change', () => setScope(select.value));
  }

  function setScope(scope, persist = true) {
    if (!SCOPE_META[scope]) return;
    S.scope = scope;
    const select = E('color-scope-select');
    if (select) select.value = scope;
    for (const button of document.querySelectorAll('#color-scope-tabs button')) {
      const on = button.dataset.scope === scope;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    E('color-scope-title').textContent = SCOPE_META[scope].title;
    E('color-scope-note').textContent = SCOPE_META[scope].note;
    E('color-scope-legend').innerHTML = scopeLegend(scope);
    E('color-vector-gain-wrap').hidden = scope !== 'vector';
    E('color-vector-gain').value = String(S.vectorGain);
    paintRange(E('color-vector-gain'));
    E('color-vector-gain-val').textContent = `${S.vectorGain.toFixed(1)}×`;
    E('color-scope-scale').value = S.scopeScale;
    E('color-scope-labels').checked = S.scopeLabels;
    if (persist) saveSettings();
    drawScope();
  }

  function setLocalTab(tab, persist = true) {
    S.localTab = tab === 'basic' ? 'basic' : 'rgb';
    for (const button of document.querySelectorAll('.color-local-tabs button')) {
      const on = button.dataset.localTab === S.localTab;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    E('color-local-basic').hidden = S.localTab !== 'basic';
    E('color-local-rgb').hidden = S.localTab !== 'rgb';
    if (persist) saveSettings();
  }

  function scopeLegend(scope) {
    const dot = (color) => `<i style="background:${color}"></i>`;
    if (scope === 'wave') return `<span>${dot('#7dd3fc')}Y · luminância</span><span>${S.scopeScale === '8bit' ? '0–255' : '0–100%'} relativo</span>`;
    if (scope === 'rgb') return `<span>${dot('#ff5c5c')}R</span><span>${dot('#5ae678')}G</span><span>${dot('#64a0ff')}B</span>`;
    if (scope === 'parade') return `<span>${dot('#ff5c5c')}R</span><span>${dot('#5ae678')}G</span><span>${dot('#64a0ff')}B</span><span>colunas separadas</span>`;
    if (scope === 'yuv') return `<span>${dot('#ededed')}Y</span><span>${dot('#7aa0ff')}U</span><span>${dot('#ff96be')}V</span><span>colunas separadas</span>`;
    if (scope === 'vector') return `<span>${dot('#91f0d2')}croma · saturação ≥ 30</span><span>${dot('#dca900')}linha de pele</span><span>R Y G C B M</span>`;
    if (scope === 'false') return `<span>${dot('#ffff00')}exposição</span><span>0–100% relativo</span><span>não é IRE calibrado</span>`;
    if (scope === 'cie') return `<span>${dot('#e6f7ff')}cromaticidade xy</span><span>triângulo sRGB</span><span>D65</span>`;
    if (scope === 'rgba') return `<span>${dot('#ff5c5c')}R</span><span>${dot('#5ae678')}G</span><span>${dot('#64a0ff')}B</span><span>alfa N/D no JPEG</span>`;
    return `<span>${dot('#ff5c5c')}R</span><span>${dot('#5ae678')}G</span><span>${dot('#64a0ff')}B</span><span>0–255</span>`;
  }

  /* ---------------------------------------------------------------- */
  /* Correção local                                                    */
  /* ---------------------------------------------------------------- */

  function localFromQuality(quality) {
    const capability = quality?.capabilities?.color || {};
    const filter = (quality?.filters || []).find((row) => row.filterName === (capability.filterName || LOCAL_FILTER));
    const bounds = quality?.schema?.color?.bounds || {};
    const defaults = { ...DEFAULT_SETTINGS, ...(quality?.schema?.color?.defaults || {}) };
    for (const key of ['color_multiply', 'color_add']) defaults[key] = Number(defaults[key] ?? DEFAULT_SETTINGS[key]) >>> 0;
    const settings = { ...defaults };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const value = filter?.filterSettings?.[key];
      if (typeof value === 'number') settings[key] = (key === 'color_multiply' || key === 'color_add') ? ((value & 0xFFFFFF) >>> 0) : value;
    }
    return {
      supported: capability.supported === true,
      reason: capability.reason || '',
      exists: !!filter,
      active: filter?.filterEnabled === true,
      settings,
      bounds,
      defaults
    };
  }

  async function inspectLocal(key, { quiet = false } = {}) {
    if (!key) return null;
    try {
      const response = await fetch('/api/effects?key=' + encodeURIComponent(key), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.effects?.quality) throw Error(data.error || 'Controle de qualidade indisponível');
      gate.observe(data.effects);
      const state = localFromQuality(data.effects.quality);
      const grade = data.effects.details?.filters?.colorGamma || {};
      state.grade = {
        supported: grade.supported === true,
        exists: grade.exists === true,
        enabled: grade.enabled === true,
        settings: {
          gamma_r: Number(grade.settings?.gamma_r ?? 1),
          gamma_g: Number(grade.settings?.gamma_g ?? 1),
          gamma_b: Number(grade.settings?.gamma_b ?? 1)
        }
      };
      state.gradeActive = state.grade.enabled;
      state.gradeExists = state.grade.exists;
      S.known.set(key, state);
      if (key === S.selectedKey) {
        S.local = state;
        S.grade = state.grade;
        renderLocal();
      }
      updateKnownBadges();
      setSteps();
      return state;
    } catch (error) {
      if (!quiet) say('Falha ao ler a correção local: ' + error.message, 'bad');
      return null;
    }
  }

  function localFieldValues() {
    const values = {};
    for (const input of document.querySelectorAll('#color-local-fields [data-local]')) {
      values[input.dataset.local] = Number(input.value);
    }
    const read = (key) => {
      const input = document.querySelector(`#color-rgb-fields [data-rgb="${key}"]`);
      return input ? Number(input.value) : 0;
    };
    const channel = (key) => clamp(Math.round(read(key) / 100 * 255), 0, 255);
    // OBS guarda cor em 0xAABBGGRR: R no byte baixo, G no seguinte, B no terceiro.
    values.color_multiply = channel('gain-r') | (channel('gain-g') << 8) | (channel('gain-b') << 16);
    values.color_add = channel('lift-r') | (channel('lift-g') << 8) | (channel('lift-b') << 16);
    values.hue_shift = read('hue');
    values.gamma_r = Number(read('gamma-r')) || 1;
    values.gamma_g = Number(read('gamma-g')) || 1;
    values.gamma_b = Number(read('gamma-b')) || 1;
    return values;
  }

  function buildLocalFields() {
    const box = E('color-local-fields');
    box.replaceChildren();
    for (const def of LOCAL_DEFS) {
      const row = document.createElement('div');
      row.className = 'color-slider-row';
      const label = document.createElement('label');
      label.textContent = def.label;
      label.title = def.title;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.dataset.local = def.key;
      const output = document.createElement('output');
      const update = () => { output.textContent = fmt(input.value, def.digits); paintRange(input); };
      input.addEventListener('input', () => { update(); markPreview(); syncSurfaceFromFields(); });
      input.addEventListener('change', () => {
        for (const button of document.querySelectorAll('#color-presets button')) button.classList.remove('on');
      });
      row.append(label, input, output);
      box.append(row);
      update();
    }
  }

  function buildRgbFields() {
    const box = E('color-rgb-fields');
    if (!box) return;
    box.replaceChildren();
    const makeControl = (def) => {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(def.def);
      input.dataset.rgb = def.key;
      if (def.key.endsWith('-r')) input.style.setProperty('--range-color', '#ff6b6b');
      else if (def.key.endsWith('-g')) input.style.setProperty('--range-color', '#5ae678');
      else if (def.key.endsWith('-b')) input.style.setProperty('--range-color', '#64a0ff');
      else if (def.key === 'hue') input.style.setProperty('--range-color', '#dca900');
      const output = document.createElement('output');
      const update = () => {
        if (def.key === 'hue') output.textContent = String(Math.round(Number(input.value)));
        else if (def.key.startsWith('gamma-')) output.textContent = Number(input.value).toFixed(2);
        else output.textContent = `${Math.round(Number(input.value))}%`;
        paintRange(input);
      };
      input.addEventListener('input', () => { update(); markPreview(); syncSurfaceFromFields(); });
      input.addEventListener('change', () => {
        for (const button of document.querySelectorAll('#color-presets button')) button.classList.remove('on');
      });
      return { input, output, update };
    };
    for (const group of [
      { id: 'gain', label: 'Gain RGB — brancos (multiplicação)' },
      { id: 'lift', label: 'Lift RGB — pretos (offset)' },
      { id: 'gamma', label: 'Gamma RGB — médios (por canal)' }
    ]) {
      const wrap = document.createElement('div');
      wrap.className = 'color-rgb-group';
      const head = document.createElement('span');
      head.textContent = group.label;
      wrap.append(head);
      const grid = document.createElement('div');
      grid.className = 'color-rgb-triple';
      for (const def of RGB_DEFS.filter((row) => row.group === group.id)) {
        const cell = document.createElement('label');
        cell.className = 'color-rgb-cell';
        const name = document.createElement('span');
        name.textContent = def.key.endsWith('-r') ? 'R' : def.key.endsWith('-g') ? 'G' : 'B';
        const { input, output, update } = makeControl(def);
        cell.append(name, input, output);
        grid.append(cell);
        update();
      }
      wrap.append(grid);
      box.append(wrap);
    }
    const hue = RGB_DEFS.find((row) => row.key === 'hue');
    const row = document.createElement('div');
    row.className = 'color-slider-row';
    const label = document.createElement('label');
    label.textContent = 'Hue';
    const { input, output, update } = makeControl(hue);
    row.append(label, input, output);
    box.append(row);
    update();
  }

  function setRgbValues(settings, grade) {
    const cm = Number(settings?.color_multiply ?? 0xFFFFFF) >>> 0;
    const ca = Number(settings?.color_add ?? 0) >>> 0;
    const set = (key, value) => {
      const input = document.querySelector(`#color-rgb-fields [data-rgb="${key}"]`);
      if (!input) return;
      const def = RGB_DEFS.find((row) => row.key === key);
      input.value = String(clamp(value, def.min, def.max));
      input.dispatchEvent(new Event('input'));
    };
    const pct = (value) => Math.round((value / 255) * 100);
    set('gain-r', pct(cm & 255));
    set('gain-g', pct((cm >> 8) & 255));
    set('gain-b', pct((cm >> 16) & 255));
    set('lift-r', pct(ca & 255));
    set('lift-g', pct((ca >> 8) & 255));
    set('lift-b', pct((ca >> 16) & 255));
    set('hue', Number(settings?.hue_shift ?? 0));
    set('gamma-r', Number(grade?.gamma_r ?? 1));
    set('gamma-g', Number(grade?.gamma_g ?? 1));
    set('gamma-b', Number(grade?.gamma_b ?? 1));
    syncSurfaceFromFields();
  }

  function setLocalValues(settings, grade) {
    for (const input of document.querySelectorAll('#color-local-fields [data-local]')) {
      const key = input.dataset.local;
      const def = LOCAL_DEFS.find((row) => row.key === key);
      const value = Number(settings?.[key] ?? DEFAULT_SETTINGS[key]);
      input.value = String(clamp(value, def.min, def.max));
      input.dispatchEvent(new Event('input'));
    }
    setRgbValues(settings, grade);
  }

  function renderLocal() {
    const local = S.local;
    const grade = S.grade;
    const active = local.active === true || grade.enabled === true;
    const exists = local.exists === true || grade.exists === true;
    const supported = local.supported === true || grade.supported === true;
    const stateText = E('color-local-state');
    const badge = E('color-local-badge');
    if (!S.selectedKey) {
      stateText.textContent = 'Selecione uma entrada.';
      setBadge(badge, '—');
    } else if (!supported) {
      stateText.textContent = local.reason || 'Correção local indisponível nesta entrada.';
      setBadge(badge, 'indisponível', 'warn');
    } else if (active) {
      stateText.textContent = 'Correção aplicada nesta entrada: cor + gamma RGB por canal. O quadro e os scopes já mostram o resultado.';
      setBadge(badge, 'corrigida', 'ok');
    } else if (exists) {
      stateText.textContent = 'Os filtros existem, mas estão desligados nesta entrada.';
      setBadge(badge, 'desligada', 'warn');
    } else {
      stateText.textContent = 'Sem correção nesta entrada.';
      setBadge(badge, 'sem correção');
    }
    if (!document.querySelector('#color-local-fields [data-local]')) buildLocalFields();
    S.syncingLocal = true;
    E('color-enabled').checked = active;
    setLocalValues(local.settings || DEFAULT_SETTINGS, grade.settings || { gamma_r: 1, gamma_g: 1, gamma_b: 1 });
    S.syncingLocal = false;
    const blocked = gate?.blocked === true || S.localBusy;
    E('color-apply').disabled = blocked || !S.selectedKey || !supported;
    E('color-remove').disabled = blocked || !S.selectedKey || !exists;
    E('color-enabled').disabled = blocked || !S.selectedKey || !supported;
    E('color-reconcile').disabled = !gate?.blocked;
    const basicBlocked = blocked || !S.selectedKey || !local.supported;
    const gammaBlocked = blocked || !S.selectedKey || !grade.supported;
    for (const input of document.querySelectorAll('#color-local-fields [data-local]')) input.disabled = basicBlocked;
    for (const input of document.querySelectorAll('#color-rgb-fields [data-rgb]')) {
      input.disabled = input.dataset.rgb.startsWith('gamma-') ? gammaBlocked : basicBlocked;
    }
    E('color-rgb-reset').disabled = basicBlocked && gammaBlocked;
    E('color-local-reason').textContent = supported
      ? 'Os ajustes são aplicados no motor, na entrada selecionada; não são um preview falso.'
      : (local.reason || '');
    updateCopyButton();
    syncSurfaceFromFields();
    setSteps();
  }

  async function applyLocal({ remove = false, enabled = true } = {}) {
    if (S.localBusy || !S.selectedKey) return;
    if (gate.blocked) { say('Há uma operação pendente. Use Conferir estado antes de aplicar outra.', 'warn'); return; }
    const key = S.selectedKey;
    // Guarda o que o operador ajustou antes de reler o motor; a releitura não pode
    // sobrescrever os valores que ele acabou de escolher.
    const desired = remove ? null : localFieldValues();
    S.localBusy = true;
    renderLocal();
    try {
      const fresh = await inspectLocal(key, { quiet: true });
      if (!fresh) throw Error('Estado da entrada indisponível');
      if (!fresh.supported && !fresh.grade?.supported) throw Error(fresh.reason || 'Correção local indisponível nesta entrada');
      const basicKeys = ['brightness', 'contrast', 'saturation', 'gamma', 'hue_shift', 'color_multiply', 'color_add'];
      const basic = desired ? Object.fromEntries(basicKeys.map((name) => [name, desired[name]])) : null;
      const gamma = desired ? { gamma_r: desired.gamma_r, gamma_g: desired.gamma_g, gamma_b: desired.gamma_b } : null;
      if (remove) {
        if (fresh.supported) await gate.mutate('effects_source', { key, type: LOCAL_TYPE, enabled: false, remove: true });
        if (fresh.grade?.supported) await gate.mutate('effects_filter', { key, type: 'colorGamma', enabled: false, remove: true });
        const after = await inspectLocal(key, { quiet: true });
        if (after?.exists || after?.grade?.exists) throw Error('Remoção não confirmada: ainda há filtro no motor');
        say('Filtros de cor e gamma removidos; ausência confirmada.', 'ok');
      } else {
        if (fresh.supported) await gate.mutate('effects_source', { key, type: LOCAL_TYPE, enabled, settings: basic });
        if (fresh.grade?.supported) await gate.mutate('effects_filter', { key, type: 'colorGamma', enabled, settings: gamma });
        const after = await inspectLocal(key, { quiet: true });
        const basicOk = !fresh.supported || after?.active === enabled;
        const gradeOk = !fresh.grade?.supported || after?.grade?.enabled === enabled;
        if (!basicOk || !gradeOk) throw Error('Estado dos filtros não confere com o solicitado');
        say(enabled ? 'Cor e gamma RGB aplicados e confirmados pelo motor.' : 'Filtros desligados; estado confirmado.', 'ok');
      }
    } catch (error) {
      say(error.message, 'bad');
      if (!gate.blocked) await inspectLocal(key, { quiet: true });
    } finally {
      S.localBusy = false;
      S.previewDirty = false;
      hidePreview();
      renderLocal();
    }
  }
  async function reconcileLocal() {
    if (!gate.blocked) {
      say('Nenhuma operação pendente. Estado relido.', '');
      await inspectLocal(S.selectedKey, { quiet: true });
      return;
    }
    try {
      await gate.reconcile(async (key) => {
        const response = await fetch('/api/effects?key=' + encodeURIComponent(key), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !data.effects) throw Error(data.error || 'Estado indisponível');
        return data.effects;
      });
      say('Operação conferida com o motor.', 'ok');
      await inspectLocal(S.selectedKey, { quiet: true });
    } catch (error) {
      say(error.message, 'bad');
    }
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    setLocalValues(preset);
    markPreview();
    for (const button of document.querySelectorAll('#color-presets button')) {
      button.classList.toggle('on', button.dataset.preset === name);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Superfície de cor: trackballs, anéis e knobs                      */
  /* ---------------------------------------------------------------- */
  const surfaceDef = (group) => SURFACE_GROUPS.find((row) => row.id === group) || SURFACE_GROUPS[0];
  const surfaceKnobDef = (key) => SURFACE_KNOBS.find((row) => row.key === key);
  const surfaceInput = (key) => key === 'hue'
    ? document.querySelector('#color-rgb-fields [data-rgb="hue"]')
    : document.querySelector(`#color-local-fields [data-local="${key}"]`);
  const surfaceWheelInput = (group, channel) => document.querySelector(`#color-rgb-fields [data-rgb="${group}-${channel}"]`);
  const surfaceRound = (value, step) => Number((Math.round(Number(value) / step) * step).toFixed(4));
  const surfaceFmt = (value, digits = 0) => Number(value).toFixed(digits);
  const surfaceSigned = (value, digits = 2) => `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(digits)}`;

  function surfaceRange(def) {
    return { neg: def.neutral > def.min ? -1 : 0, pos: def.neutral < def.max ? 1 : 0 };
  }
  function surfaceTrim(def, value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n >= def.neutral) return def.max === def.neutral ? 0 : clamp((n - def.neutral) / (def.max - def.neutral), 0, 1);
    return def.min === def.neutral ? 0 : clamp((n - def.neutral) / (def.neutral - def.min), -1, 0);
  }
  function surfaceValue(def, trim) {
    const t = clamp(Number(trim) || 0, -1, 1);
    const raw = t >= 0 ? def.neutral + t * (def.max - def.neutral) : def.neutral + t * (def.neutral - def.min);
    return clamp(surfaceRound(raw, def.step), def.min, def.max);
  }
  function surfaceReadWheel(def) {
    const value = (channel) => {
      const input = surfaceWheelInput(def.id, channel);
      const n = Number(input?.value);
      return Number.isFinite(n) ? n : def.neutral;
    };
    const r = value('r'), g = value('g'), b = value('b');
    const first = surfaceWheelInput(def.id, 'r');
    return { r, g, b, tr: { r: surfaceTrim(def, r), g: surfaceTrim(def, g), b: surfaceTrim(def, b) }, disabled: !first || first.disabled };
  }
  function surfaceReadKnob(def) {
    const input = surfaceInput(def.key);
    const n = Number(input?.value);
    return { value: Number.isFinite(n) ? n : def.def, disabled: !input || input.disabled };
  }
  function surfaceState() {
    const wheels = {}, knobs = {};
    for (const def of SURFACE_GROUPS) {
      const row = surfaceReadWheel(def);
      wheels[def.id] = { r: row.r, g: row.g, b: row.b, trim: row.tr };
    }
    for (const def of SURFACE_KNOBS) knobs[def.key] = surfaceReadKnob(def).value;
    return { open: S.surface.open, group: S.surface.group, wheels, knobs };
  }
  function emitSurface(action, extra = {}) {
    try {
      window.dispatchEvent(new CustomEvent('freemix-color-surface', {
        detail: { action, group: S.surface.group, ...extra }
      }));
    } catch { /* integração opcional */ }
  }

  function updateSurfaceScreens() {
    const def = surfaceDef(S.surface.group);
    const values = surfaceReadWheel(def);
    const kicker = E('cs-display-kicker'), title = E('cs-display-title');
    const line = E('cs-display-values'), masters = E('cs-display-masters');
    if (kicker) kicker.textContent = `RODA ATIVA · ${def.sub.toUpperCase()}`;
    if (title) title.textContent = def.label;
    if (line) line.textContent = `R ${surfaceFmt(values.r, def.digits)} · G ${surfaceFmt(values.g, def.digits)} · B ${surfaceFmt(values.b, def.digits)}`;
    if (masters) {
      const knob = (key) => surfaceReadKnob(surfaceKnobDef(key)).value;
      masters.textContent = `Luz ${surfaceSigned(knob('brightness'))} · Contraste ${surfaceSigned(knob('contrast'))} · Sat ${surfaceSigned(knob('saturation'))} · Hue ${Math.round(knob('hue'))}°`;
    }
  }

  function syncSurfaceFromFields() {
    if (!S.surface.built) return;
    for (const def of SURFACE_GROUPS) {
      const article = document.querySelector(`.cs-wheel[data-group="${def.id}"]`);
      if (!article) continue;
      const values = surfaceReadWheel(def);
      const handle = article.querySelector('.cs-ball-handle');
      if (handle) {
        handle.style.left = `${50 + values.tr.r * 40}%`;
        handle.style.top = `${50 - values.tr.b * 40}%`;
      }
      const fill = article.querySelector(`[data-ring-fill="${def.id}"]`);
      if (fill) {
        const pct = (values.tr.g + 1) / 2;
        const dash = 75 * pct;
        fill.setAttribute('stroke-dasharray', `${dash} ${100 - dash}`);
      }
      const ringKnob = article.querySelector(`[data-ring-knob="${def.id}"]`);
      if (ringKnob) {
        const angle = 135 + 270 * ((values.tr.g + 1) / 2);
        const rad = angle * Math.PI / 180;
        ringKnob.setAttribute('cx', String(50 + 45 * Math.cos(rad)));
        ringKnob.setAttribute('cy', String(50 + 45 * Math.sin(rad)));
      }
      const out = article.querySelector(`[data-wheel-out="${def.id}"]`);
      if (out) out.textContent = `R ${surfaceFmt(values.r, def.digits)} · G ${surfaceFmt(values.g, def.digits)} · B ${surfaceFmt(values.b, def.digits)}`;
      for (const channel of ['r', 'g', 'b']) {
        const cell = article.querySelector(`[data-read="${def.id}-${channel}"]`);
        if (cell) cell.textContent = surfaceFmt(values[channel], def.digits);
      }
      article.classList.toggle('dirty', ['r', 'g', 'b'].some((channel) => Math.abs(values[channel] - def.neutral) > 1e-6));
      article.classList.toggle('disabled', values.disabled);
      const ball = article.querySelector('[data-ball]');
      if (ball) {
        ball.setAttribute('aria-valuetext', `R ${surfaceFmt(values.r, def.digits)}, G ${surfaceFmt(values.g, def.digits)}, B ${surfaceFmt(values.b, def.digits)}`);
        ball.setAttribute('aria-valuenow', String(values.tr.r));
      }
    }
    for (const def of SURFACE_KNOBS) {
      const knob = document.querySelector(`.cs-knob[data-knob="${def.key}"]`);
      if (!knob) continue;
      const values = surfaceReadKnob(def);
      const pct = clamp((values.value - def.min) / (def.max - def.min), 0, 1);
      const pointer = knob.querySelector('.cs-knob-pointer');
      if (pointer) pointer.style.setProperty('--angle', `${-135 + 270 * pct}deg`);
      const out = knob.querySelector(`[data-knob-out="${def.key}"]`);
      if (out) out.textContent = `${surfaceSigned(values.value, def.digits)}${def.unit || ''}`;
      knob.classList.toggle('dirty', Math.abs(values.value - def.def) > 1e-6);
      knob.classList.toggle('disabled', values.disabled);
      knob.setAttribute('aria-valuenow', String(values.value));
    }
    updateSurfaceScreens();
    const apply = document.querySelector('[data-surface="apply"]');
    if (apply) apply.disabled = E('color-apply')?.disabled !== false;
    const reset = document.querySelector('[data-surface="reset"]');
    if (reset) reset.disabled = E('color-rgb-reset')?.disabled !== false;
    const neutral = document.querySelector('[data-surface="neutral"]');
    if (neutral) neutral.disabled = E('color-rgb-reset')?.disabled !== false;
    const enabled = E('cs-enabled');
    if (enabled) {
      enabled.checked = E('color-enabled')?.checked === true;
      enabled.disabled = E('color-enabled')?.disabled !== false;
    }
    const remove = document.querySelector('[data-surface="remove"]');
    if (remove) remove.disabled = E('color-remove')?.disabled !== false;
    const conferir = document.querySelector('[data-surface="conferir"]');
    if (conferir) conferir.disabled = E('color-reconcile')?.disabled !== false;
  }

  function selectSurfaceGroup(group) {
    if (!SURFACE_GROUPS.some((row) => row.id === group)) return;
    S.surface.group = group;
    for (const article of document.querySelectorAll('.cs-wheel')) article.classList.toggle('active', article.dataset.group === group);
    updateSurfaceScreens();
    saveSettings();
    emitSurface('select');
  }

  function setSurfaceChannel(group, channel, value, options = {}) {
    if (!['r', 'g', 'b'].includes(channel)) return false;
    const def = surfaceDef(group);
    const input = surfaceWheelInput(def.id, channel);
    if (!input || input.disabled) return false;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;
    const next = clamp(surfaceRound(numeric, options.step || def.step), def.min, def.max);
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    syncSurfaceFromFields();
    if (!options.silent) emitSurface('set', { channel, value: next });
    return true;
  }

  function setSurfaceKnob(key, value, options = {}) {
    const def = surfaceKnobDef(key);
    if (!def) return false;
    const input = surfaceInput(key);
    if (!input || input.disabled) return false;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;
    const next = clamp(surfaceRound(numeric, def.step), def.min, def.max);
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    syncSurfaceFromFields();
    if (!options.silent) emitSurface('knob', { key, value: next });
    return true;
  }

  function nudgeSurface(group, channel, direction, fine = false) {
    const def = surfaceDef(group);
    const input = surfaceWheelInput(def.id, channel);
    if (!input || input.disabled) return;
    const step = def.step * (fine ? 0.1 : 1);
    setSurfaceChannel(def.id, channel, Number(input.value) + direction * step, { step });
  }

  function resetSurfaceGroup(group = S.surface.group) {
    const def = surfaceDef(group);
    for (const channel of ['r', 'g', 'b']) setSurfaceChannel(def.id, channel, def.neutral, { silent: true });
    syncSurfaceFromFields();
    emitSurface('reset', { group: def.id });
    say(`${def.label} voltou ao neutro.`, '');
  }

  function neutralSurface() {
    for (const def of SURFACE_GROUPS) {
      for (const channel of ['r', 'g', 'b']) {
        const input = surfaceWheelInput(def.id, channel);
        if (input && !input.disabled) {
          input.value = String(def.neutral);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
    for (const def of SURFACE_KNOBS) {
      const input = surfaceInput(def.key);
      if (input && !input.disabled) {
        input.value = String(def.def);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    syncSurfaceFromFields();
    emitSurface('neutral');
    say('Superfície neutra; a prévia mostra o ajuste. Use Aplicar para confirmar no motor.', 'warn');
  }

  function applySurface() {
    if (!S.selectedKey) { say('Selecione uma entrada antes de aplicar.', 'warn'); return; }
    applyLocal({ remove: false, enabled: true });
    emitSurface('apply');
  }

  function setSurfaceHelp(on) {
    const box = E('cs-help');
    if (!box) return;
    box.hidden = !on;
    S.surface.help = Boolean(on);
    if (on) box.querySelector('button')?.focus();
  }

  function updateSurfaceJump() {
    const button = E('color-surface-jump');
    const panel = E('color-surface');
    if (!button || !panel) return;
    const show = S.surface.open && window.innerWidth <= 1040 && panel.getBoundingClientRect().top > window.innerHeight - 40;
    button.hidden = !show;
  }

  function setSurfaceOpen(on, persist = true) {
    const open = Boolean(on);
    S.surface.open = open;
    document.body.classList.toggle('surface-open', open);
    const panel = E('color-surface');
    if (panel) panel.hidden = !open;
    const toggle = E('color-surface-toggle');
    if (toggle) {
      toggle.classList.toggle('on', open);
      toggle.setAttribute('aria-pressed', String(open));
    }
    if (open) {
      syncSurfaceFromFields();
      if (window.innerWidth > 1040) {
        panel?.scrollIntoView({ block: 'nearest' });
      } else if (panel && panel.getBoundingClientRect().top > window.innerHeight - 40) {
        say('Superfície aberta abaixo do monitor; use o botão ou role a página.', 'warn');
      }
    } else {
      if (S.surface.help) setSurfaceHelp(false);
      refreshCompareFrames();
    }
    updateSurfaceJump();
    if (persist) saveSettings();
    emitSurface(open ? 'open' : 'close');
  }

  function bindSurfaceWheel(article, def) {
    const ball = article.querySelector('[data-ball]');
    const hit = article.querySelector(`[data-ring-hit="${def.id}"]`);
    const finish = (event) => {
      const drag = S.surface.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      S.surface.drag = null;
      ball?.classList.remove('dragging');
    };
    article.addEventListener('pointerdown', () => selectSurfaceGroup(def.id));
    ball?.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || article.classList.contains('disabled')) return;
      event.preventDefault();
      selectSurfaceGroup(def.id);
      const rect = ball.getBoundingClientRect();
      const start = surfaceReadWheel(def);
      S.surface.drag = {
        type: 'ball', group: def.id, pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY,
        startR: start.tr.r, startB: start.tr.b,
        radius: Math.max(24, rect.width / 2)
      };
      try { ball.setPointerCapture(event.pointerId); } catch { /* ponteiro sintético */ }
      ball.classList.add('dragging');
    });
    ball?.addEventListener('pointermove', (event) => {
      const drag = S.surface.drag;
      if (!drag || drag.type !== 'ball' || drag.pointerId !== event.pointerId || drag.group !== def.id) return;
      const range = surfaceRange(def);
      const tr = clamp(drag.startR + (event.clientX - drag.startX) / drag.radius, range.neg, range.pos);
      const tb = clamp(drag.startB - (event.clientY - drag.startY) / drag.radius, range.neg, range.pos);
      setSurfaceChannel(def.id, 'r', surfaceValue(def, tr), { silent: true });
      setSurfaceChannel(def.id, 'b', surfaceValue(def, tb), { silent: true });
      emitSurface('wheel', { wheel: 'ball' });
    });
    ball?.addEventListener('pointerup', finish);
    ball?.addEventListener('pointercancel', finish);
    hit?.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || article.classList.contains('disabled')) return;
      event.preventDefault();
      selectSurfaceGroup(def.id);
      S.surface.drag = { type: 'ring', group: def.id, pointerId: event.pointerId };
      try { hit.setPointerCapture(event.pointerId); } catch { /* ponteiro sintético */ }
      ringPointer(event);
    });
    hit?.addEventListener('pointermove', (event) => {
      const drag = S.surface.drag;
      if (!drag || drag.type !== 'ring' || drag.pointerId !== event.pointerId || drag.group !== def.id) return;
      ringPointer(event);
    });
    hit?.addEventListener('pointerup', finish);
    hit?.addEventListener('pointercancel', finish);
    function ringPointer(event) {
      const svg = hit.ownerSVGElement;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const angle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI;
      let rel = (angle - 135 + 360) % 360;
      if (rel > 270) rel = (rel - 270 < 360 - rel) ? 270 : 0;
      const range = surfaceRange(def);
      const trim = clamp((rel / 270) * 2 - 1, range.neg, range.pos);
      setSurfaceChannel(def.id, 'g', surfaceValue(def, trim), { silent: true });
      emitSurface('wheel', { wheel: 'ring' });
    }
    article.querySelector(`[data-wheel-reset="${def.id}"]`)?.addEventListener('click', (event) => {
      event.stopPropagation();
      resetSurfaceGroup(def.id);
    });
  }

  function bindSurfaceKnob(knob, def) {
    const input = surfaceInput(def.key);
    function move(event) {
      const drag = S.surface.drag;
      if (!drag || drag.type !== 'knob' || drag.pointerId !== event.pointerId || drag.key !== def.key) return;
      const span = def.max - def.min;
      setSurfaceKnob(def.key, drag.start - ((event.clientY - drag.startY) / 160) * span);
    }
    function finish(event) {
      const drag = S.surface.drag;
      if (!drag || drag.type !== 'knob' || drag.pointerId !== event.pointerId) return;
      S.surface.drag = null;
      knob.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    }
    knob.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || knob.classList.contains('disabled')) return;
      event.preventDefault();
      S.surface.drag = {
        type: 'knob', key: def.key, pointerId: event.pointerId,
        startY: event.clientY, start: Number(input?.value ?? def.def)
      };
      try { knob.setPointerCapture(event.pointerId); } catch { /* ponteiro sintético */ }
      knob.classList.add('dragging');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    });
    knob.addEventListener('dblclick', () => setSurfaceKnob(def.key, def.def));
    knob.addEventListener('wheel', (event) => {
      if (knob.classList.contains('disabled')) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const step = def.step * (event.shiftKey ? 0.1 : 1);
      setSurfaceKnob(def.key, Number(input?.value ?? def.def) + direction * step);
    }, { passive: false });
    knob.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const direction = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1;
      const step = def.step * (event.shiftKey ? 0.1 : 1);
      setSurfaceKnob(def.key, Number(input?.value ?? def.def) + direction * step);
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function buildSurfaceWheels() {
    const box = E('cs-wheels');
    if (!box) return;
    box.replaceChildren();
    for (const def of SURFACE_GROUPS) {
      const article = document.createElement('article');
      article.className = 'cs-wheel';
      article.dataset.group = def.id;
      article.innerHTML = `<header><b>${def.label}</b><small>${def.sub}</small><output data-wheel-out="${def.id}">—</output></header>
        <div class="cs-wheel-stage">
          <div class="cs-ball" data-ball="${def.id}" tabindex="0" role="slider" aria-label="${def.label}: R e B" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0">
            <span class="cs-ball-handle"></span>
          </div>
          <svg class="cs-ring" viewBox="0 0 100 100" aria-hidden="true">
            <defs><linearGradient id="cs-ring-${def.id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#67d4e8"/><stop offset="1" stop-color="#dffaff"/></linearGradient></defs>
            <circle class="cs-ring-track" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="75 25" transform="rotate(135 50 50)"/>
            <circle class="cs-ring-fill" data-ring-fill="${def.id}" cx="50" cy="50" r="45" pathLength="100" stroke="url(#cs-ring-${def.id})" stroke-dasharray="0 100" transform="rotate(135 50 50)"/>
            <circle class="cs-ring-knob" data-ring-knob="${def.id}" cx="50" cy="5" r="4"/>
            <circle class="cs-ring-hit" data-ring-hit="${def.id}" cx="50" cy="50" r="45"/>
          </svg>
          <span class="cs-axis cs-axis-x">R</span>
          <span class="cs-axis cs-axis-y">B</span>
        </div>
        <div class="cs-wheel-foot">
          <div class="cs-wheel-reads"><span class="r">R <b data-read="${def.id}-r">—</b></span><span class="g">G <b data-read="${def.id}-g">—</b></span><span class="b">B <b data-read="${def.id}-b">—</b></span></div>
          <button type="button" class="cs-wheel-reset" data-wheel-reset="${def.id}" title="Reset ${def.label}">↺</button>
        </div>`;
      box.append(article);
      bindSurfaceWheel(article, def);
    }
  }

  function buildSurfaceKnobs() {
    const box = E('cs-knobs');
    if (!box) return;
    box.replaceChildren();
    for (const def of SURFACE_KNOBS) {
      const knob = document.createElement('div');
      knob.className = 'cs-knob';
      knob.dataset.knob = def.key;
      knob.tabIndex = 0;
      knob.setAttribute('role', 'slider');
      knob.setAttribute('aria-label', def.label);
      knob.setAttribute('aria-valuemin', String(def.min));
      knob.setAttribute('aria-valuemax', String(def.max));
      knob.setAttribute('aria-valuenow', String(def.def));
      knob.innerHTML = `<div class="cs-knob-dial"><span class="cs-knob-pointer"></span></div><label>${def.label}</label><output data-knob-out="${def.key}">—</output>`;
      box.append(knob);
      bindSurfaceKnob(knob, def);
    }
    const note = document.createElement('div');
    note.className = 'cs-knob-note';
    note.innerHTML = '<b>PRÉVIA</b><span>local</span><small>Aplicar envia ao motor</small>';
    box.append(note);
  }

  function handleSurfaceKeydown(event) {
    if (!S.surface.open || event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) return;
    const help = E('cs-help');
    if (help && !help.hidden && event.key !== 'Escape') return;
    const group = S.surface.group;
    const fine = event.shiftKey;
    let handled = true;
    if (event.key === '1') selectSurfaceGroup('lift');
    else if (event.key === '2') selectSurfaceGroup('gamma');
    else if (event.key === '3') selectSurfaceGroup('gain');
    else if (event.key === 'ArrowLeft') nudgeSurface(group, 'r', -1, fine);
    else if (event.key === 'ArrowRight') nudgeSurface(group, 'r', 1, fine);
    else if (event.key === 'ArrowUp') nudgeSurface(group, 'b', 1, fine);
    else if (event.key === 'ArrowDown') nudgeSurface(group, 'b', -1, fine);
    else if (event.key === '[') nudgeSurface(group, 'g', -1, fine);
    else if (event.key === ']') nudgeSurface(group, 'g', 1, fine);
    else if (event.key === 'r' || event.key === 'R') resetSurfaceGroup(group);
    else if (event.key === 'n' || event.key === 'N') neutralSurface();
    else if (event.key === 'a' || event.key === 'A') applySurface();
    else if (event.key === 'Escape') {
      if (help && !help.hidden) setSurfaceHelp(false);
      else setSurfaceOpen(false);
    } else if (event.key === '?') setSurfaceHelp(help?.hidden !== false);
    else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function initSurface() {
    if (S.surface.built) return;
    buildSurfaceWheels();
    buildSurfaceKnobs();
    S.surface.built = true;
    E('color-surface-toggle')?.addEventListener('click', () => setSurfaceOpen(!S.surface.open));
    E('color-surface')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-surface]');
      if (!button) return;
      const action = button.dataset.surface;
      if (action === 'neutral') neutralSurface();
      else if (action === 'apply') applySurface();
      else if (action === 'close') setSurfaceOpen(false);
      else if (action === 'reset') resetSurfaceGroup();
      else if (action === 'remove') { applyLocal({ remove: true }); emitSurface('remove'); }
      else if (action === 'conferir') { reconcileLocal(); emitSurface('conferir'); }
      else if (action === 'help') setSurfaceHelp(E('cs-help').hidden);
    });
    E('cs-enabled')?.addEventListener('change', () => {
      const real = E('color-enabled');
      if (!real) return;
      real.checked = E('cs-enabled').checked;
      real.dispatchEvent(new Event('change'));
    });
    document.addEventListener('keydown', handleSurfaceKeydown);
    selectSurfaceGroup(S.surface.group);
    setSurfaceOpen(S.surface.open, false);
    syncSurfaceFromFields();
  }

  window.FreeMixColorSurface = Object.freeze({
    open: () => setSurfaceOpen(true),
    close: () => setSurfaceOpen(false),
    toggle: () => setSurfaceOpen(!S.surface.open),
    select: (group) => selectSurfaceGroup(group),
    set: (group, channel, value) => setSurfaceChannel(group, channel, value),
    nudge: (group, channel, delta) => {
      const def = surfaceDef(group);
      const input = surfaceWheelInput(def.id, channel);
      const step = Number(delta);
      if (!input || input.disabled || !Number.isFinite(step)) return false;
      return setSurfaceChannel(def.id, channel, Number(input.value) + step * def.step);
    },
    reset: (group) => resetSurfaceGroup(group || S.surface.group),
    neutral: neutralSurface,
    apply: applySurface,
    state: surfaceState
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || !event.data || event.data.type !== 'freemix-color-surface') return;
    const { action, group, channel, value, delta } = event.data;
    if (action === 'open') setSurfaceOpen(true);
    else if (action === 'close') setSurfaceOpen(false);
    else if (action === 'toggle') setSurfaceOpen(!S.surface.open);
    else if (action === 'select') selectSurfaceGroup(group);
    else if (action === 'set') setSurfaceChannel(group, channel, value);
    else if (action === 'nudge') {
      const def = surfaceDef(group);
      const input = surfaceWheelInput(def.id, channel);
      const step = Number(delta);
      if (input && !input.disabled && Number.isFinite(step)) setSurfaceChannel(def.id, channel, Number(input.value) + step * def.step);
    } else if (action === 'reset') resetSurfaceGroup(group || S.surface.group);
    else if (action === 'neutral') neutralSurface();
    else if (action === 'apply') applySurface();
    else if (action === 'state') event.source?.postMessage({ type: 'freemix-color-surface-state', state: surfaceState() }, event.origin);
  });

  /* ---------------------------------------------------------------- */
  /* Shading remoto                                                    */
  /* ---------------------------------------------------------------- */

  async function sendControl(action, data = {}) {
    const response = await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
      signal: AbortSignal.timeout(10000),
      keepalive: action === 'ptz_release'
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false) throw Error(json.error || 'Controle PTZ recusado');
    return json.ptz || json;
  }

  async function loadPtz() {
    try {
      const response = await fetch('/api/ptz', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw Error(data.error || 'PTZ indisponível');
      S.ptz = { devices: data.ptz?.devices || [], links: data.ptz?.links || {} };
      renderDevices();
    } catch (error) {
      S.ptz = { devices: [], links: {} };
      renderDevices();
      say('Não foi possível ler o PTZ: ' + error.message, 'bad');
    }
  }

  function linkedDeviceForInput() {
    const links = S.ptz.links || {};
    const raw = links[S.selectedKey] ?? links[S.selectedName];
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    return raw.device || raw.id || '';
  }

  function renderDevices() {
    const select = E('color-device');
    const devices = S.ptz.devices || [];
    const previous = S.deviceId || select.value;
    select.replaceChildren(...devices.map((device) => {
      const protocol = device.protocol ? ` · ${device.protocol}` : '';
      const connected = device.connected ? ' · conectada' : '';
      return new Option(`${device.name || device.id}${protocol}${connected}`, device.id);
    }));
    if (!devices.length) select.add(new Option('Nenhuma câmera PTZ', ''));
    if (previous && devices.some((device) => device.id === previous)) select.value = previous;
    else if (devices.length) select.value = devices[0].id;
    S.deviceId = select.value || '';
    select.disabled = devices.length === 0 || S.remoteBusy;
    E('color-remote-read').disabled = !S.deviceId || S.remoteBusy;
    const badge = E('color-remote-badge');
    if (!devices.length) {
      setBadge(badge, 'sem câmera', 'warn');
      E('color-remote-state').textContent = 'Nenhuma câmera PTZ cadastrada. O shading remoto precisa de uma câmera no console PTZ.';
      E('color-remote-note').textContent = 'Cadastre a câmera em PTZ → Configurar câmera. Sem isso, use a correção local na aba ao lado.';
      E('color-remote-fields').innerHTML = '<div class="color-empty">Sem câmera remota cadastrada.<br>Use <b>Correção local</b> enquanto a câmera não estiver no PTZ.</div>';
    } else {
      setBadge(badge, `${devices.length} câmera${devices.length > 1 ? 's' : ''}`);
      if (!S.remoteValues) {
        E('color-remote-state').textContent = 'Câmera selecionada. Clique em Ler da câmera para ver os parâmetros devolvidos.';
      }
      E('color-remote-note').textContent = 'O vínculo câmera ↔ entrada é feito no console PTZ. A leitura abaixo mostra somente o que a câmera realmente devolveu.';
    }
    preselectDevice();
    updateRemoteButtons();
  }

  function preselectDevice() {
    const linked = linkedDeviceForInput();
    if (linked && S.ptz.devices.some((device) => device.id === linked)) {
      E('color-device').value = linked;
      S.deviceId = linked;
    }
  }

  function device() {
    return S.ptz.devices.find((row) => row.id === S.deviceId) || null;
  }

  function remoteOptions(key) {
    const onvif = device()?.protocol === 'onvif';
    if (key === 'exposureMode') return [['AUTO', 'Automático'], ['MANUAL', 'Manual']];
    if (key === 'aeMode') return [['full_auto', 'Automático'], ['manual', 'Manual'], ['shutterPriority', 'Prioridade shutter'], ['irisPriority', 'Prioridade íris'], ['bright', 'Brilho']];
    if (key === 'wbMode') {
      return onvif
        ? [['AUTO', 'Automático'], ['MANUAL', 'Manual']]
        : [['auto', 'Automático'], ['indoor', 'Interior'], ['outdoor', 'Exterior'], ['onePush', 'One push'], ['manual', 'Manual']];
    }
    return [];
  }

  function updateRemoteButtons() {
    const has = !!S.deviceId;
    E('color-device').disabled = !S.ptz.devices.length || S.remoteBusy;
    E('color-remote-read').disabled = !has || S.remoteBusy;
    for (const control of document.querySelectorAll('#color-remote-fields input, #color-remote-fields select')) control.disabled = S.remoteBusy;
  }

  function editableRemoteKey(key) {
    // Envia somente o que o adaptador daquele protocolo realmente mapeia.
    // ONVIF Imaging: luz, contraste, saturação, nitidez, gamma, exposição e WB.
    // VISCA: íris, ganho, shutter, AE e WB. O resto é exibido como leitura bruta.
    const onvif = device()?.protocol === 'onvif';
    const keys = onvif
      ? ['brightness', 'contrast', 'saturation', 'sharpness', 'gamma', 'exposureMode', 'wbMode']
      : ['iris', 'gain', 'shutter', 'aeMode', 'wbMode'];
    return keys.includes(key);
  }

  function renderRemoteFields(values) {
    const box = E('color-remote-fields');
    box.replaceChildren();
    if (!values || !Object.keys(values).length) {
      box.innerHTML = '<div class="color-empty">A câmera não devolveu parâmetros de imagem.</div>';
      return;
    }
    const entries = Object.entries(values).filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object');
    if (!entries.length) {
      box.innerHTML = '<div class="color-empty">A câmera não devolveu parâmetros de imagem.</div>';
      return;
    }
    const order = ['brightness', 'contrast', 'saturation', 'sharpness', 'gamma', 'iris', 'gain', 'shutter', 'exposureMode', 'aeMode', 'wbMode'];
    const sorted = [...entries].sort((a, b) => {
      const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    for (const [key, value] of sorted) {
      const def = REMOTE_DEFS[key];
      if (!def || !editableRemoteKey(key)) continue;
      const row = document.createElement('div');
      row.className = 'color-slider-row';
      const label = document.createElement('label');
      label.textContent = def.label;
      label.title = def.note || key;
      if (def.kind === 'select') {
        const select = document.createElement('select');
        const options = remoteOptions(key);
        const known = options.some(([option]) => String(option) === String(value));
        const list = known ? options : [...options, [String(value), String(value)]];
        for (const [option, text] of list) select.add(new Option(text, option));
        select.value = String(value);
        select.addEventListener('change', () => applyRemote({ [key]: select.value }));
        row.append(label, select);
      } else if (def.kind === 'raw') {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(def.min);
        input.max = String(def.max);
        input.step = String(def.step);
        input.value = String(value);
        input.dataset.remote = key;
        input.addEventListener('change', () => {
          const n = Number(input.value);
          if (Number.isFinite(n)) applyRemote({ [key]: n });
        });
        row.append(label, input);
      } else {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(def.min);
        input.max = String(def.max);
        input.step = String(def.step);
        input.value = String(value);
        input.dataset.remote = key;
        const output = document.createElement('output');
        const update = () => { output.textContent = fmt(input.value, def.digits ?? 0); };
        input.addEventListener('input', update);
        input.addEventListener('change', () => applyRemote({ [key]: Number(input.value) }));
        row.append(label, input, output);
        update();
      }
      box.append(row);
    }
    const unknown = entries.filter(([key]) => !REMOTE_DEFS[key] || !editableRemoteKey(key));
    if (unknown.length) {
      const extra = document.createElement('p');
      extra.className = 'color-note';
      extra.textContent = 'Outros valores devolvidos: ' + unknown.map(([key, value]) => `${key}=${value}`).join(' · ');
      box.append(extra);
    }
    updateRemoteButtons();
  }

  async function readRemote(showMessage = true) {
    if (!S.deviceId) return null;
    const deviceId = S.deviceId;
    try {
      const result = await sendControl('ptz_imaging_get', { device: deviceId });
      if (deviceId !== S.deviceId) return null;
      const values = result?.values || {};
      S.remoteValues = values;
      renderRemoteFields(values);
      const count = Object.values(values).filter((value) => value !== null && value !== undefined && typeof value !== 'object').length;
      E('color-remote-state').textContent = count
        ? `Leitura concluída: ${count} parâmetro(s) devolvido(s) pela câmera.`
        : 'A câmera não devolveu parâmetros de imagem.';
      setBadge(E('color-remote-badge'), count ? 'lido' : 'sem parâmetros', count ? 'ok' : 'warn');
      if (showMessage) say('Leitura de shading concluída.', 'ok');
      setSteps();
      return values;
    } catch (error) {
      setBadge(E('color-remote-badge'), 'erro', 'bad');
      E('color-remote-state').textContent = error.message;
      if (showMessage) say(error.message, 'bad');
      return null;
    }
  }

  async function applyRemote(patch) {
    if (!S.deviceId || S.remoteBusy) return;
    const deviceId = S.deviceId;
    S.remoteBusy = true;
    updateRemoteButtons();
    try {
      const acquired = await sendControl('ptz_acquire', { device: deviceId, owner: 'Color Studio' });
      const token = acquired?.token;
      if (!token) throw Error('A câmera não concedeu a sessão de ajuste');
      try {
        await sendControl('ptz_imaging_set', { device: deviceId, token, patch });
      } finally {
        await sendControl('ptz_release', { device: deviceId, token }).catch(() => {});
      }
      await sleep(250);
      if (deviceId === S.deviceId) await readRemote(false);
      say('Ajuste enviado; a câmera foi relida para confirmar o valor devolvido.', 'ok');
    } catch (error) {
      say(error.message, 'bad');
      E('color-remote-state').textContent = error.message;
    } finally {
      S.remoteBusy = false;
      updateRemoteButtons();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Comparação multicâmera                                            */
  /* ---------------------------------------------------------------- */

  function defaultCompareKeys() {
    const cameras = S.inputs.filter((item) => /^CAM\b/i.test(item.name));
    return (cameras.length ? cameras : S.inputs).slice(0, 4).map((item) => item.key);
  }

  function knownLabel(key) {
    const known = S.known.get(key);
    if (!known) return { text: '—', tone: '' };
    if (known.active || known.grade?.enabled) return { text: 'corrigida', tone: 'ok' };
    if (known.exists || known.grade?.exists) return { text: 'desligada', tone: 'warn' };
    return { text: 'sem correção', tone: '' };
  }

  function updateKnownBadges() {
    for (const item of document.querySelectorAll('#color-source-list .color-source-item')) {
      const known = S.known.get(item.dataset.key);
      const active = known?.active === true || known?.grade?.enabled === true;
      const dot = item.querySelector('.color-source-dot');
      const text = item.querySelector('.color-source-meta small');
      if (dot) dot.classList.toggle('active', active);
      if (text) text.textContent = active ? 'corrigida' : 'vídeo';
    }
    for (const card of document.querySelectorAll('#color-compare-grid .color-compare-card')) {
      const chip = card.querySelector('.color-compare-meta .color-chip');
      if (!chip) continue;
      const known = knownLabel(card.dataset.key);
      chip.textContent = known.text;
      chip.className = 'color-chip' + (known.tone ? ' ' + known.tone : '');
    }
    updateCopyButton();
  }

  function renderCompareGrid() {
    const box = E('color-compare-grid');
    if (!box) return;
    const keys = S.compareKeys.filter((key) => S.inputs.some((item) => item.key === key));
    S.compareKeys = keys;
    if (!keys.length) {
      box.innerHTML = '<div class="color-empty" style="grid-column:1/-1;align-self:center">Adicione até 4 câmeras para comparar lado a lado. A referência fornece a correção local para as demais.</div>';
    } else {
      box.innerHTML = keys.map((key) => {
        const item = S.inputs.find((row) => row.key === key) || { name: key };
        const known = knownLabel(key);
        const frame = S.compareFrames.get(key) || '';
        const active = key === S.selectedKey;
        const reference = key === S.referenceKey;
        return `<article class="color-compare-card${active ? ' active' : ''}${reference ? ' reference' : ''}" data-key="${esc(key)}">
          <div class="color-compare-frame">
            <img alt="${esc(item.name)}"${frame ? ` src="${frame}"` : ''}>
            <div class="color-compare-empty color-empty"${frame ? ' hidden' : ''}>sem quadro</div>
          </div>
          <div class="color-compare-meta">
            <strong title="${esc(item.name)}">${esc(item.name)}</strong>
            <span class="color-chip ${known.tone}">${known.text}</span>
          </div>
          <div class="color-compare-actions">
            <button type="button" data-action="select" title="Analisar esta câmera no monitor principal">Analisar</button>
            <button type="button" data-action="ref" class="ref${reference ? ' on' : ''}" title="Fixar como referência para copiar a correção">Ref.</button>
            <button type="button" data-action="remove" class="remove" title="Remover da comparação">×</button>
          </div>
        </article>`;
      }).join('');
    }
    E('color-compare-count').textContent = `${S.compareKeys.length}/4`;
    E('color-reference-label').textContent = 'Referência: ' + (S.inputs.find((item) => item.key === S.referenceKey)?.name || '—');
    updateCompareButtons();
    updateCopyButton();
    setSteps();
  }

  function updateCompareButtons() {
    const add = E('color-compare-add');
    const clear = E('color-clear-compare');
    if (add) add.disabled = !S.selectedKey || S.compareKeys.includes(S.selectedKey) || S.compareKeys.length >= 4;
    if (clear) clear.disabled = S.compareKeys.length === 0;
  }

  function updateCompareImages() {
    for (const card of document.querySelectorAll('#color-compare-grid .color-compare-card')) {
      const key = card.dataset.key;
      const url = S.compareFrames.get(key);
      const img = card.querySelector('img');
      const empty = card.querySelector('.color-compare-empty');
      if (url) {
        if (img.getAttribute('src') !== url) img.src = url;
        if (empty) empty.hidden = true;
      } else {
        img.removeAttribute('src');
        if (empty) empty.hidden = false;
      }
    }
  }

  async function refreshCompareFrames() {
    if (S.surface.open || S.compareBusy || document.hidden || !S.compareKeys.length) return;
    S.compareBusy = true;
    try {
      for (const key of [...S.compareKeys]) {
        if (!S.compareKeys.includes(key)) continue;
        try {
          const response = await fetch('/api/color/frame?input=' + encodeURIComponent(key) + '&t=' + Date.now(), {
            cache: 'no-store', signal: AbortSignal.timeout(8000)
          });
          if (!response.ok) continue;
          const blob = await response.blob();
          if (!S.compareKeys.includes(key)) continue;
          const old = S.compareFrames.get(key);
          const url = URL.createObjectURL(blob);
          S.compareFrames.set(key, url);
          if (old) setTimeout(() => URL.revokeObjectURL(old), 1800);
        } catch { /* mantém o último quadro confirmado */ }
      }
      updateCompareImages();
    } finally {
      S.compareBusy = false;
    }
  }

  function addCompare() {
    if (!S.selectedKey) return;
    if (S.compareKeys.includes(S.selectedKey)) { say('Esta câmera já está na comparação.', 'warn'); return; }
    if (S.compareKeys.length >= 4) { say('A comparação aceita no máximo 4 câmeras.', 'warn'); return; }
    S.compareKeys.push(S.selectedKey);
    if (!S.referenceKey) S.referenceKey = S.selectedKey;
    S.savedCompareKeys = [...S.compareKeys];
    S.savedReferenceKey = S.referenceKey;
    saveSettings();
    renderCompareGrid();
    refreshCompareFrames();
    inspectLocal(S.selectedKey, { quiet: true });
  }

  function removeCompare(key) {
    S.compareKeys = S.compareKeys.filter((row) => row !== key);
    if (S.referenceKey === key) S.referenceKey = S.compareKeys[0] || '';
    const url = S.compareFrames.get(key);
    S.compareFrames.delete(key);
    if (url) URL.revokeObjectURL(url);
    S.savedCompareKeys = [...S.compareKeys];
    S.savedReferenceKey = S.referenceKey;
    saveSettings();
    renderCompareGrid();
    if (S.referenceKey) inspectLocal(S.referenceKey, { quiet: true });
  }

  function clearCompare() {
    for (const url of S.compareFrames.values()) URL.revokeObjectURL(url);
    S.compareFrames.clear();
    S.compareKeys = [];
    S.referenceKey = '';
    S.savedCompareKeys = [];
    S.savedReferenceKey = '';
    saveSettings();
    renderCompareGrid();
  }

  function setReference(key) {
    if (!S.compareKeys.includes(key)) return;
    S.referenceKey = key;
    S.savedReferenceKey = key;
    saveSettings();
    renderCompareGrid();
    inspectLocal(key, { quiet: true });
  }

  function updateCopyButton() {
    const button = E('color-copy-ref');
    if (!button) return;
    const known = S.known.get(S.referenceKey);
    button.disabled = !S.referenceKey || S.compareKeys.length < 2 || !(known?.active || known?.grade?.enabled) || gate?.blocked === true || S.localBusy;
  }

  function askConfirm(title, text, action) {
    S.confirmAction = action;
    E('color-confirm-title').textContent = title;
    E('color-confirm-text').textContent = text;
    E('color-confirm').hidden = false;
    E('color-confirm-yes').focus();
  }

  function closeConfirm() {
    S.confirmAction = null;
    E('color-confirm').hidden = true;
  }

  async function copyReference() {
    const referenceKey = S.referenceKey;
    if (!referenceKey) return;
    if (gate.blocked) { say('Há uma operação pendente. Use Conferir estado antes de copiar.', 'warn'); return; }
    const reference = S.known.get(referenceKey) || await inspectLocal(referenceKey, { quiet: true });
    if (!reference?.active && !reference?.grade?.enabled) { say('A referência não tem correção local ativa.', 'warn'); return; }
    const targets = S.compareKeys.filter((key) => key !== referenceKey);
    if (!targets.length) { say('Adicione outra câmera à comparação.', 'warn'); return; }
    const referenceName = S.inputs.find((item) => item.key === referenceKey)?.name || referenceKey;
    const targetNames = targets.map((key) => S.inputs.find((item) => item.key === key)?.name || key);
    askConfirm(
      'Copiar correção local',
      `Copiar luz, contraste, saturação, gain/lift RGB e gamma por canal de “${referenceName}” para ${targetNames.join(', ')}? A operação cria ou atualiza os filtros de cor e de gamma em cada câmera e não coloca nada no ar.`,
      async () => {
        S.localBusy = true;
        renderLocal();
        let copied = 0, failed = 0;
        const settings = { ...reference.settings };
        const gradeSettings = { ...(reference.grade?.settings || { gamma_r: 1, gamma_g: 1, gamma_b: 1 }) };
        for (const key of targets) {
          if (gate.blocked) break;
          try {
            const target = await inspectLocal(key, { quiet: true });
            if (reference.active && !target?.supported) throw Error('correção indisponível');
            if (reference.grade?.enabled && !target?.grade?.supported) throw Error('gamma RGB indisponível');
            if (reference.active) await gate.mutate('effects_source', { key, type: LOCAL_TYPE, enabled: true, settings });
            if (reference.grade?.enabled) await gate.mutate('effects_filter', { key, type: 'colorGamma', enabled: true, settings: gradeSettings });
            const after = await inspectLocal(key, { quiet: true });
            if (reference.active && after?.active !== true) throw Error('cor não confirmada');
            if (reference.grade?.enabled && after?.grade?.enabled !== true) throw Error('gamma não confirmado');
            copied++;
          } catch {
            failed++;
          }
        }
        S.localBusy = false;
        renderLocal();
        say(`Correção copiada para ${copied} câmera${copied === 1 ? '' : 's'}` + (failed ? `; ${failed} falha${failed === 1 ? '' : 's'}.` : '.'), failed ? 'warn' : 'ok');
        for (const key of targets) await inspectLocal(key, { quiet: true });
        renderCompareGrid();
      }
    );
  }
  /* ---------------------------------------------------------------- */
  /* Thumbs, atualização geral e eventos                               */
  /* ---------------------------------------------------------------- */

  async function refreshThumbs() {
    if (document.hidden) return;
    try {
      const response = await fetch('/api/thumbs', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.thumbs) {
        S.thumbs = data.thumbs;
        updateSourceThumbs();
      }
    } catch { /* a lista continua com o ícone local */ }
  }

  async function refreshAll(manual = false) {
    S.previewDirty = false;
    hidePreview();
    try {
      await Promise.all([refreshHealth(), loadInputs(), loadPtz(), refreshThumbs()]);
      if (S.selectedKey) await inspectLocal(S.selectedKey, { quiet: true });
      if (S.referenceKey) await inspectLocal(S.referenceKey, { quiet: true });
      if (manual) say('Estado relido do motor.', 'ok');
    } catch (error) {
      say(error.message, 'bad');
    }
  }

  function bindEvents() {
    E('color-input').addEventListener('change', (event) => selectInput(event.target.value));
    E('color-source-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-key]');
      if (button) selectInput(button.dataset.key);
    });
    E('color-scope-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-scope]');
      if (button) setScope(button.dataset.scope);
    });
    E('color-vector-gain').addEventListener('input', () => {
      S.vectorGain = clamp(Number(E('color-vector-gain').value) || 1, 0.5, 5);
      paintRange(E('color-vector-gain'));
      E('color-vector-gain-val').textContent = `${S.vectorGain.toFixed(1)}×`;
      saveSettings();
      if (S.scope === 'vector') drawScope();
    });
    E('color-scope-scale').addEventListener('change', () => {
      S.scopeScale = E('color-scope-scale').value === '8bit' ? '8bit' : 'pct';
      E('color-scope-legend').innerHTML = scopeLegend(S.scope);
      saveSettings();
      drawScope();
    });
    E('color-scope-labels').addEventListener('change', () => {
      S.scopeLabels = E('color-scope-labels').checked;
      saveSettings();
      drawScope();
    });
    document.querySelector('.color-control-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-pane]');
      if (!button) return;
      S.activePane = button.dataset.pane;
      for (const tab of document.querySelectorAll('.color-control-tabs button')) {
        const on = tab.dataset.pane === S.activePane;
        tab.classList.toggle('active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      E('color-pane-local').hidden = S.activePane !== 'local';
      E('color-pane-remote').hidden = S.activePane !== 'remote';
      E('color-pane-quality').hidden = S.activePane !== 'quality';
      if (S.activePane === 'remote' && S.deviceId && !S.remoteValues && !S.remoteBusy) {
        S.remoteBusy = true;
        updateRemoteButtons();
        readRemote(true).finally(() => { S.remoteBusy = false; updateRemoteButtons(); });
      }
      setSteps();
    });
    E('color-zebra-toggle').addEventListener('click', () => setZebra(!S.zebra));
    E('color-peaking-toggle').addEventListener('click', () => setPeaking(!S.peaking));
    E('color-freeze').addEventListener('click', () => {
      S.frozen = !S.frozen;
      E('color-freeze').textContent = S.frozen ? 'Retomar' : 'Congelar';
      setBadge(E('color-frame-state'), S.frozen ? 'congelado' : (S.lastFrame ? 'ao vivo' : 'sem quadro'), S.frozen ? 'warn' : (S.lastFrame ? 'ok' : 'warn'));
      updateHudState();
      if (!S.frozen) loadFrame(true);
    });
    E('color-ref-capture').addEventListener('click', captureReference);
    E('color-ref-clear').addEventListener('click', clearReference);
    E('color-split-toggle').addEventListener('change', () => setSplit(E('color-split-toggle').checked));
    E('color-split-range').addEventListener('input', () => { updateSplit(); saveSettings(); });
    bindSplitLine();
    E('color-mask-toggle').addEventListener('change', () => setMask(E('color-mask-toggle').checked));
    E('color-mask-mode').addEventListener('change', () => setMaskMode(E('color-mask-mode').value));
    E('color-grid-toggle').addEventListener('change', () => setGrid(E('color-grid-toggle').checked));
    E('color-preview-toggle').addEventListener('change', () => setPreviewEnabled(E('color-preview-toggle').checked));
    E('color-frame-wrap').addEventListener('pointermove', updateColorPick);
    E('color-frame-wrap').addEventListener('pointerleave', clearColorPick);
    E('color-frame-wrap').addEventListener('click', copyColorPick);
    E('color-refresh').addEventListener('click', () => refreshAll(true));
    E('color-surface-jump').addEventListener('click', () => {
      E('color-surface').scrollIntoView({ behavior: 'smooth', block: 'start' });
      E('color-surface-jump').hidden = true;
    });
    window.addEventListener('scroll', updateSurfaceJump, { passive: true });
    window.addEventListener('resize', updateSurfaceJump);
    E('color-open-ptz-top').addEventListener('click', () => openPanel('/ptz'));
    E('color-open-ptz').addEventListener('click', () => openPanel('/ptz'));
    document.querySelector('.color-local-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-local-tab]');
      if (button) setLocalTab(button.dataset.localTab);
    });
    E('color-presets').addEventListener('click', (event) => {
      const button = event.target.closest('[data-preset]');
      if (button) applyPreset(button.dataset.preset);
    });
    E('color-rgb-reset').addEventListener('click', () => {
      setRgbValues({ color_multiply: 0xFFFFFF, color_add: 0, hue_shift: 0 });
      markPreview();
      for (const button of document.querySelectorAll('#color-presets button')) button.classList.remove('on');
    });
    E('color-apply').addEventListener('click', () => applyLocal({ remove: false, enabled: true }));
    E('color-remove').addEventListener('click', () => applyLocal({ remove: true }));
    E('color-reconcile').addEventListener('click', reconcileLocal);
    E('color-enabled').addEventListener('change', () => {
      if (S.syncingLocal) return;
      const wanted = E('color-enabled').checked;
      // Desligar uma entrada que nunca teve filtro não deve criar um filtro desativado.
      if (!wanted && !S.local.exists && !S.grade.exists) { renderLocal(); return; }
      applyLocal({ remove: false, enabled: wanted });
    });
    E('color-device').addEventListener('change', () => {
      S.deviceId = E('color-device').value;
      S.remoteValues = null;
      E('color-remote-fields').replaceChildren();
      E('color-remote-state').textContent = 'Câmera selecionada. Clique em Ler da câmera.';
      setBadge(E('color-remote-badge'), '—');
      updateRemoteButtons();
    });
    E('color-remote-read').addEventListener('click', async () => {
      S.remoteBusy = true;
      updateRemoteButtons();
      try { await readRemote(true); } finally { S.remoteBusy = false; updateRemoteButtons(); }
    });
    E('color-compare-add').addEventListener('click', addCompare);
    E('color-clear-compare').addEventListener('click', clearCompare);
    E('color-copy-ref').addEventListener('click', copyReference);
    E('color-compare-grid').addEventListener('click', (event) => {
      const card = event.target.closest('[data-key]');
      if (!card) return;
      const key = card.dataset.key;
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'select') selectInput(key);
      else if (action === 'ref') setReference(key);
      else if (action === 'remove') removeCompare(key);
    });
    E('color-confirm-no').addEventListener('click', closeConfirm);
    E('color-confirm-yes').addEventListener('click', async () => {
      const action = S.confirmAction;
      closeConfirm();
      if (action) {
        try { await action(); } catch (error) { say(error.message, 'bad'); }
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !E('color-confirm').hidden) closeConfirm();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) return;
      const help = E('cs-help');
      const confirm = E('color-confirm');
      if ((help && !help.hidden) || (confirm && !confirm.hidden)) return;
      if (event.key === 'z' || event.key === 'Z') { setZebra(!S.zebra); event.preventDefault(); }
      else if (event.key === 'f' || event.key === 'F') { setPeaking(!S.peaking); event.preventDefault(); }
    });
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => drawScope(), 180);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        loadFrame(true);
        refreshCompareFrames();
      }
    });
    if (gate) {
      gate.subscribe(({ blocked }) => {
        E('color-apply').disabled = blocked || S.localBusy || !S.local.supported;
        E('color-remove').disabled = blocked || S.localBusy || !S.local.exists;
        E('color-enabled').disabled = blocked || S.localBusy || !S.local.supported;
        E('color-reconcile').disabled = !blocked;
        for (const input of document.querySelectorAll('#color-rgb-fields input')) input.disabled = blocked || S.localBusy || !S.local.supported;
        E('color-rgb-reset').disabled = blocked || S.localBusy || !S.local.supported;
        updateCopyButton();
        if (blocked) say('Há uma operação pendente. Use Conferir estado; novos comandos estão bloqueados.', 'warn');
      });
    }
  }

  async function init() {
    buildNav();
    bindEvents();
    buildLocalFields();
    buildRgbFields();
    loadSettings();
    initSurface();
    setLocalTab(S.localTab, false);
    buildScopeSelect();
    setScope(S.scope, false);
    applyMonitorOptions();
    renderLocal();
    renderCompareGrid();
    setSteps();
    await refreshAll();
    if (S.inputs.length && !S.compareKeys.length) {
      const saved = S.savedCompareKeys.filter((key) => S.inputs.some((item) => item.key === key)).slice(0, 4);
      S.compareKeys = saved.length ? saved : defaultCompareKeys();
      S.referenceKey = (S.savedReferenceKey && S.compareKeys.includes(S.savedReferenceKey)) ? S.savedReferenceKey : (S.compareKeys[0] || '');
      S.savedCompareKeys = [...S.compareKeys];
      S.savedReferenceKey = S.referenceKey;
      saveSettings();
      renderCompareGrid();
      refreshCompareFrames();
      for (const key of S.compareKeys) inspectLocal(key, { quiet: true });
    }
    setInterval(() => { if (!S.frozen) loadFrame(); }, 1600);
    setInterval(refreshCompareFrames, 4200);
    setInterval(refreshThumbs, 3600);
    setInterval(refreshHealth, 9000);
  }

  init();
})();
