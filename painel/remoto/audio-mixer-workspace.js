// 3Mix · Áudio — apresentação do mixer, inspetor, saídas, retornos e
// dispositivos sobre os mesmos controladores de produção.
(() => {
  const E = id => document.getElementById(id);
  const AUDIO = window.AudioDesk;
  if (!AUDIO) return;

  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const dbFromMul = mul => (Number(mul) > 0 ? 20 * Math.log10(Number(mul)) : -Infinity);
  const dbToMul = db => (Number(db) <= -59.9 ? 0 : clamp(Math.pow(10, Number(db) / 20), 0, 1));
  const normDb = db => (Number.isFinite(db) ? clamp((db + 60) / 60, 0, 1) : 0);
  const fmtDb = (db, unit = 'dB') => (Number.isFinite(db) ? `${db > 0 ? '+' : ''}${db.toFixed(1)} ${unit}` : `−∞ ${unit}`);
  const chipDb = db => {
    if (!Number.isFinite(db)) return '—';
    const rounded = Math.abs(db - Math.round(db)) < 0.05 ? String(Math.round(db)) : db.toFixed(1);
    return `${db > 0 ? '+' : ''}${rounded} dB`;
  };
  const panLabel = value => (Math.abs(value) < 1 ? 'C' : value < 0 ? `L ${Math.round(-value)}` : `R ${Math.round(value)}`);
  const knobAngle = (value, min, max) => -135 + ((value - min) / (max - min)) * 270;

  function updateKnob(el, value, min, max, text) {
    if (!el) return;
    const next = clamp(value, min, max);
    el._knobValue = next;
    el.style.setProperty('--angle', knobAngle(next, min, max).toFixed(1) + 'deg');
    el.style.setProperty('--sweep', ((next - min) / (max - min) * 270).toFixed(1) + 'deg');
    el.setAttribute('aria-valuenow', String(Math.round(next * 10) / 10));
    if (text) el.setAttribute('aria-valuetext', text);
  }

  /* Repaints do ciclo de leitura não podem desfazer o gesto do operador:
     enquanto o valor desejado ainda não voltou confirmado pelo motor, o knob
     mantém o valor editado. Quando o motor confirma (ou a confirmação falha),
     _desired é liberado e o snapshot volta a mandar. */
  function knobFollow(el, motorValue, tolerance = 0.02) {
    if (!el) return true;
    if (el._desired === null || el._desired === undefined) return true;
    const motor = Number.isFinite(Number(motorValue)) ? Number(motorValue) : 0;
    if (Math.abs(el._desired - motor) <= tolerance) {
      el._desired = null;
      return true;
    }
    return false;
  }

  function bindKnob(el, { min, max, step, value, reset, format, onInput, onCommit }) {
    if (!el) return;
    el._knobValue = clamp(Number(value) || 0, min, max);
    updateKnob(el, el._knobValue, min, max, format(el._knobValue));
    let dragging = false;
    let startY = 0;
    let startValue = 0;
    let commitTimer = 0;

    /* Enquanto o commit confirmado não volta do motor, o repaint não pode
       sobrescrever o valor editado pelo operador com o snapshot anterior. */
    const commitNow = value => {
      el._pendingEdit = true;
      try {
        const result = onCommit?.(value);
        void (result?.catch?.(() => { /* toast já cobre os erros */ }));
      } finally {
        /* Se a confirmação demorar demais ou falhar, o snapshot volta a valer. */
        setTimeout(() => {
          el._pendingEdit = false;
          el._desired = null;
        }, 900);
      }
    };
    const apply = (next, commit) => {
      const rounded = clamp(Math.round((next - min) / step) * step + min, min, max);
      el._knobValue = rounded;
      el._desired = rounded;
      updateKnob(el, rounded, min, max, format(rounded));
      onInput?.(rounded);
      if (commit) commitNow(rounded);
    };
    const commitLater = delay => {
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => commitNow(el._knobValue), delay);
    };

    el.addEventListener('pointerdown', event => {
      if (event.button !== 0 || el.classList.contains('is-disabled')) return;
      dragging = true;
      startY = event.clientY;
      startValue = el._knobValue;
      el.classList.add('dragging');
      el.focus({ preventScroll: true });
      el.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    el.addEventListener('pointermove', event => {
      if (!dragging) return;
      const sensitivity = event.shiftKey ? 0.25 : 1;
      apply(startValue + (startY - event.clientY) * ((max - min) / 180) * sensitivity, false);
    });
    const end = event => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      try { el.releasePointerCapture?.(event.pointerId); } catch { /* já liberado */ }
      commitNow(el._knobValue);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    el.addEventListener('wheel', event => {
      if (!el.matches(':focus') || el.classList.contains('is-disabled')) return;
      event.preventDefault();
      apply(el._knobValue + (event.deltaY < 0 ? 1 : -1) * step * (event.shiftKey ? 1 : 5), false);
      commitLater(180);
    }, { passive: false });

    el.addEventListener('keydown', event => {
      if (el.classList.contains('is-disabled')) return;
      const direction = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[event.key];
      if (direction) {
        event.preventDefault();
        apply(el._knobValue + direction * step, false);
        commitLater(260);
      } else if (event.key === 'Home') {
        event.preventDefault();
        apply(min, false);
        commitLater(120);
      } else if (event.key === 'End') {
        event.preventDefault();
        apply(max, false);
        commitLater(120);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        commitNow(el._knobValue);
      }
    });

    el.addEventListener('dblclick', () => {
      if (el.classList.contains('is-disabled')) return;
      apply(reset, false);
      commitNow(el._knobValue);
    });
  }

  function scaleMarkup(compact = false) {
    const marks = compact
      ? [[0, 100], [-12, 74], [-30, 44], [-60, 14], [-Infinity, 0]]
      : [[0, 100], [-6, 90], [-12, 80], [-30, 50], [-60, 5], [-Infinity, 0]];
    return marks.map(([db, position], index) => {
      const edge = index === 0 ? 'top' : index === marks.length - 1 ? 'bottom' : '';
      return `<span${edge ? ` data-edge="${edge}"` : ''} style="bottom:${position}%">${db === -Infinity ? '−∞' : db}</span>`;
    }).join('');
  }

  /* ---------------------------------------------------------------- */
  /* Shell, abas e preferências                                        */
  /* ---------------------------------------------------------------- */

  const topbar = document.querySelector('.a-top');

  function bindWorkspaceNav() {
    E('nav-mesa')?.addEventListener('click', () => {
      if (window.FreeMixClosePanel) window.FreeMixClosePanel(); else window.close();
    });
    E('win-close')?.addEventListener('click', () => {
      if (window.FreeMixClosePanel) window.FreeMixClosePanel(); else window.close();
    });
    for (const button of topbar?.querySelectorAll('[data-module]') || []) {
      if (button.dataset.module === 'audio') continue;
      button.addEventListener('click', () => {
        const route = button.dataset.route;
        if (!route) return;
        if (window.FreeMixWorkspaceNav) window.FreeMixWorkspaceNav.open(route);
        else location.href = route;
      });
    }
    window.FreeMixWorkspaceNav?.setTitle?.('Áudio');
  }
  bindWorkspaceNav();

  const views = ['mixer', 'routing', 'returns', 'devices'];

  function showView(name) {
    if (!views.includes(name)) name = 'mixer';
    for (const tab of document.querySelectorAll('.a-page-tab')) {
      const on = tab.dataset.view === name;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
    }
    for (const view of document.querySelectorAll('.audio-view')) view.classList.toggle('selected', view.id === 'view-' + name);
    try { localStorage.setItem('3mix.audio.view', name); } catch { /* storage off */ }
    AUDIO.openDrawer?.(name === 'mixer');
    if (name === 'returns') renderReturns();
    if (name === 'devices') renderDevices();
  }
  for (const tab of document.querySelectorAll('.a-page-tab')) tab.addEventListener('click', () => showView(tab.dataset.view));
  let savedView = 'mixer';
  try { savedView = localStorage.getItem('3mix.audio.view') || 'mixer'; } catch { /* storage off */ }
  const queryView = new URL(location.href).searchParams.get('view');
  showView(views.includes(queryView) ? queryView : savedView);

  const colorsInput = E('header-colors');
  function setHeaderColors(on) {
    document.body.classList.toggle('header-colors', on);
    if (colorsInput) colorsInput.checked = on;
    try { localStorage.setItem('3mix.audio.headerColors', on ? '1' : '0'); } catch { /* storage off */ }
  }
  let savedColors = true;
  try {
    /* O mockup v2 liga as cores por padrão; um "0" do usuário vale apenas se ele
     * já usou esta versão (chave v2). Chaves antigas são descartadas. */
    savedColors = localStorage.getItem('3mix.audio.headerColors.v2') !== '0';
  } catch { /* storage off */ }
  setHeaderColors(savedColors);
  colorsInput?.addEventListener('change', () => setHeaderColors(colorsInput.checked));

  /* ---------------------------------------------------------------- */
  /* Modelo dos canais                                                 */
  /* ---------------------------------------------------------------- */

  let snapshot = null;
  let structure = '';
  let reading = false;
  let disposed = false;
  let soloBusy = false;
  let lastJsonAt = 0;
  const strips = new Map();
  const solo = new Set();
  const monitorBefore = new Map();
  const details = new Map();
  let detailsAt = 0;
  let detailsReading = false;
  let lastFilterSignature = '';
  AUDIO.getJson = () => snapshot;

  const sourceOf = name => (AUDIO.getState()?.sources || []).find(source => source.name === name);

  function programInputFor(name) {
    const list = snapshot?.inputs || [];
    return list.find(input => input.name === name)
      || list.find(input => (input.sources || []).includes(name))
      || list.find(input => input.name === name.replace(/\s*\(fonte\)$/i, ''));
  }

  function visualCategory(channel) {
    const name = String(channel.name || '').toLowerCase();
    const kind = String(channel.kind || '');
    const category = AUDIO.categoryOf({ name, kind });
    if (/replay/.test(name)) return 'replay';
    if (/\bvt\b/.test(name)) return 'vt';
    if (/trilha|\bla\b|playback/.test(name)) return 'trilha';
    if (/\bcam\b|camera|câmera/.test(name) || category === 'camera') return 'cam';
    if (/\bmic\b|microfone|voz/.test(name) || category === 'mic') return 'mic';
    if (/call|web|chamada|browser|title/.test(name) || category === 'web') return 'call';
    if (/vt|player|audio|áudio|video|vídeo|clip/.test(name) || category === 'media') return 'vt';
    if (kind === 'freemix_audio_bus' || kind === 'mix-track-to-source') return 'aux';
    return 'vt';
  }

  function deviceInfo(channel) {
    const source = sourceOf(channel.name);
    const input = programInputFor(channel.name);
    const candidates = [
      source?.deviceName, source?.device, source?.inputDevice, source?.hardware,
      input?.deviceName, input?.device, input?.inputDevice
    ];
    const device = candidates.find(value => typeof value === 'string' && value.trim());
    if (device) return { label: device.trim(), enabled: true, title: 'Dispositivo informado pelo motor' };
    const kind = String(channel.kind || '');
    const type = String(input?.type || '');
    if (/wasapi|asio|coreaudio|pulse|alsa/i.test(kind)) return { label: 'Interface de áudio', enabled: false, title: 'O motor não expõe o nome do dispositivo desta entrada' };
    if (/dshow|ndi|omt|decklink/i.test(kind) || /camera/i.test(type)) return { label: 'Câmera', enabled: false, title: 'Entrada de câmera sem nome de dispositivo exposto' };
    if (/browser|webrtc|call/i.test(kind) || /browser/i.test(type)) return { label: 'Browser / Call', enabled: false, title: 'Fonte de navegador sem dispositivo físico próprio' };
    if (/ffmpeg|vlc|media|video/i.test(kind) || /video/i.test(type)) return { label: 'Player', enabled: false, title: 'Player de arquivo sem dispositivo físico próprio' };
    if (/freemix_audio_bus|mix-track/i.test(kind)) return { label: 'Barramento do motor', enabled: false, title: 'Canal de mixagem do motor' };
    if (type && type !== 'Camera') return { label: type, enabled: false, title: 'Tipo informado pelo motor' };
    return { label: 'Sem dispositivo próprio', enabled: false, title: 'O motor não expõe dispositivo para esta origem' };
  }

  function detailsFor(channelKey) {
    const selected = AUDIO.getState()?.details;
    return details.get(channelKey) || (selected?.key === channelKey ? selected : null);
  }

  function gainFor(channelKey) {
    const value = detailsFor(channelKey)?.filters?.gain?.settings?.db;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function delayFor(channelKey) {
    const value = detailsFor(channelKey)?.delayMs;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function modelChannels() {
    const json = snapshot;
    if (!json) return { inputs: [], outputs: [] };
    const director = json.calls?.director?.name;
    const inputs = [];
    const outputs = [];
    for (const channel of json.audioInputs || []) {
      const name = String(channel.name || '');
      if (/^(?:FreeMix|3Mix)\s+(?:N1|Retorno)\b/i.test(name)) continue;
      const routingSource = sourceOf(name);
      const programInput = programInputFor(name);
      const routes = new Set(String(programInput?.audioBuses || '').split(',').filter(Boolean));
      const base = {
        name,
        key: routingSource?.key || channel.key || name,
        volumeMul: Number(channel.volumeMul ?? 1),
        muted: !!channel.muted,
        balance: Number(channel.balance ?? 0.5),
        monitor: channel.monitor !== 'OBS_MONITORING_TYPE_NONE',
        levels: Array.isArray(channel.levels) ? channel.levels : [],
        routes,
        afv: !!routingSource?.afv,
        hasKey: !!routingSource?.key,
        onAir: !!routingSource?.onAir,
        private: name === director,
        kind: String(channel.kind || routingSource?.kind || '')
      };
      if (channel.kind === 'freemix_audio_bus') continue;
      if (channel.bus || channel.kind === 'mix-track-to-source') {
        const bus = channel.bus || (name === 'FreeMix Master' ? 'M' : /Bus A/i.test(name) ? 'A' : /Bus B/i.test(name) ? 'B' : '');
        if (!bus || !['M', 'A', 'B'].includes(bus)) continue;
        outputs.push({ ...base, bus, label: bus === 'M' ? 'MAIN' : 'BUS ' + bus, tag: bus === 'M' ? 'MESTRE' : 'BUS' });
        continue;
      }
      if (!routingSource) continue;
      inputs.push({
        ...base,
        label: name,
        tag: AUDIO.categoryLabel({ name, kind: channel.kind }),
        visual: visualCategory({ name, kind: channel.kind }),
        device: deviceInfo({ name, kind: channel.kind }),
        gainDb: gainFor(base.key),
        delayMs: delayFor(base.key)
      });
    }
    inputs.forEach((channel, index) => { channel.index = index; });
    const order = { M: 0, A: 1, B: 2 };
    outputs.sort((a, b) => (order[a.bus] ?? 9) - (order[b.bus] ?? 9));
    return { inputs, outputs };
  }

  const channelByName = name => {
    const model = modelChannels();
    return [...model.inputs, ...model.outputs].find(channel => channel.name === name);
  };

  const selectedChannel = () => {
    const key = AUDIO.getKey();
    if (!key) return null;
    return modelChannels().inputs.find(channel => channel.key === key) || null;
  };

  function mainRoute(channel) {
    if (!channel) return '';
    if (channel.routes.has('M')) return 'M';
    if (channel.routes.has('A')) return 'A';
    if (channel.routes.has('B')) return 'B';
    return '';
  }

  /* ---------------------------------------------------------------- */
  /* Detalhes reais por canal (gain.db e delayMs)                      */
  /* ---------------------------------------------------------------- */

  async function readChannelDetails(force = false) {
    if (detailsReading) return;
    if (!force && performance.now() - detailsAt < 15000) return;
    const sources = (AUDIO.getState()?.sources || []).filter(source => AUDIO.sourceClass(source) === 'input' && source.key);
    if (!sources.length) return;
    detailsReading = true;
    try {
      await Promise.all(sources.map(async source => {
        try {
          const response = await fetch('/api/audio-routing?key=' + encodeURIComponent(source.key), { signal: AbortSignal.timeout(6000) });
          const data = await response.json().catch(() => ({}));
          const routed = data.audioRouting || data;
          if (routed.details?.key) details.set(source.key, routed.details);
        } catch { /* mantém o último valor confirmado */ }
      }));
      detailsAt = performance.now();
    } finally {
      detailsReading = false;
      renderMixer();
      renderInspector();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Strips de entrada                                                 */
  /* ---------------------------------------------------------------- */

  function stripMarkup(channel) {
    const gainText = channel.gainDb === null ? '—' : chipDb(channel.gainDb);
    const panValue = clamp((channel.balance - 0.5) * 200, -100, 100);
    const volumeDb = dbFromMul(channel.volumeMul);
    const disabled = channel.private ? 'disabled' : '';
    const device = channel.device;
    return `<article class="a-strip${channel.private ? ' is-private' : ''}" data-name="${esc(channel.name)}" data-key="${esc(channel.key)}" data-kind="${esc(channel.kind)}" data-visual="${esc(channel.visual)}"${channel.private ? ' data-private="1"' : ''}>
      <header class="a-strip-head" title="${channel.private ? 'Mic privado da Calls — somente leitura' : 'Clique para inspecionar este canal'}">
        <span class="a-strip-num">${String(channel.index + 1).padStart(2, '0')}</span>
        <span class="a-strip-name" title="${esc(channel.name)}">${esc(channel.label)}</span>
      </header>
      <div class="a-device">
        <span class="sr-only">Dispositivo</span>
        <select data-device ${device.enabled ? '' : 'disabled'} title="Dispositivo de ${esc(channel.name)} · ${esc(device.title)}" aria-label="Dispositivo de ${esc(channel.name)}"><option>${esc(device.label)}</option></select>
        <button type="button" class="a-pill afv" data-act="afv" title="Áudio segue vídeo"${channel.private || !channel.hasKey ? ' disabled' : ''}>AFV</button>
        <button type="button" class="a-pill mon" data-act="mon" title="Escuta local deste canal"${disabled}>MON</button>
      </div>
      <div class="a-knobs">
        <div class="a-knob-field">
          <span class="a-knob-label">Ganho</span>
          <div class="a-knob${channel.gainDb === null ? ' is-disabled' : ''}" data-knob="gain" role="slider" tabindex="0" title="Ganho de entrada (filtro gain.db do canal)" aria-label="Ganho de ${esc(channel.name)}" aria-valuemin="-30" aria-valuemax="30" aria-valuenow="0" aria-valuetext="—"><span class="a-knob-dial"></span><span class="a-knob-pointer"></span></div>
          <span class="a-knob-chip" data-gain-chip>${gainText}</span>
        </div>
        <div class="a-knob-field">
          <span class="a-knob-label">Pan</span>
          <div class="a-knob" data-knob="pan" role="slider" tabindex="0" title="Panorama" aria-label="Panorama de ${esc(channel.name)}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Centro"><span class="a-knob-dial"></span><span class="a-knob-pointer"></span></div>
          <span class="a-knob-chip" data-pan-chip>${esc(panLabel(panValue))}</span>
        </div>
      </div>
      <div class="a-tall">
        <div class="a-scale" aria-hidden="true">${scaleMarkup(true)}</div>
        <div class="a-meter" role="img" aria-label="Medidor estéreo L/R em dBFS">
          <div class="a-meter-bars">
            <div class="a-meter-bar"><span class="a-meter-fill"></span><span class="a-meter-peak"></span></div>
            <div class="a-meter-bar"><span class="a-meter-fill"></span><span class="a-meter-peak"></span></div>
          </div>
          <span class="a-meter-lr"><span>L</span><span>R</span></span>
        </div>
        <div class="a-fader-rail">
          <input class="a-fader" type="range" min="-60" max="0" step="0.5" value="0" title="Fader em dB (audio_volume)" aria-label="Fader de ${esc(channel.name)}"${disabled}>
        </div>
      </div>
      <div class="a-fader-chip"><span data-fader-chip>${Number.isFinite(volumeDb) ? chipDb(volumeDb) : '−∞ dB'}</span></div>
      <div class="a-buttons">
        <button type="button" class="a-btn mute" data-act="mute" title="Silenciar / abrir"${disabled}>MUTE</button>
        <button type="button" class="a-btn solo" data-act="solo" title="Escuta isolada local — não altera o PGM"${disabled}>SOLO</button>
      </div>
      <div class="a-sends">
        <span class="a-sends-label">Envios para barramentos</span>
        <div class="a-send-chips">
          <button type="button" class="a-send main" data-bus="M" title="Enviar ao Master (MAIN)"${disabled}>MAIN</button>
          <button type="button" class="a-send a" data-bus="A" title="Enviar ao barramento A"${disabled}>A</button>
          <button type="button" class="a-send b" data-bus="B" title="Enviar ao barramento B"${disabled}>B</button>
        </div>
      </div>
    </article>`;
  }

  function outputMarkup(channel) {
    const visual = channel.bus === 'M' ? 'main' : channel.bus.toLowerCase();
    const volumeDb = dbFromMul(channel.volumeMul);
    return `<article class="a-out" data-name="${esc(channel.name)}" data-bus="${esc(channel.bus)}" data-visual="${visual}">
      <header class="a-out-head">
        <span class="a-out-name" title="${esc(channel.label)}">${esc(channel.label)}</span>
        <span class="a-out-tag">${esc(channel.tag)}</span>
      </header>
      <div class="a-out-body">
        <div class="a-scale" aria-hidden="true">${scaleMarkup()}</div>
        <div class="a-meter" role="img" aria-label="Medidor estéreo L/R do ${esc(channel.label)} em dBFS">
          <div class="a-meter-bars">
            <div class="a-meter-bar"><span class="a-meter-fill"></span><span class="a-meter-peak"></span></div>
            <div class="a-meter-bar"><span class="a-meter-fill"></span><span class="a-meter-peak"></span></div>
          </div>
          <span class="a-meter-lr"><span>L</span><span>R</span></span>
        </div>
        <div class="a-fader-rail">
          <input class="a-fader" type="range" min="-60" max="0" step="0.5" value="0" title="Fader em dB (audio_volume)" aria-label="Fader do ${esc(channel.label)}">
        </div>
      </div>
      <div class="a-out-chip"><span data-out-chip>${chipDb(volumeDb)}</span></div>
      <div class="a-out-buttons">
        <button type="button" class="a-pill" data-act="mute" title="Silenciar / abrir a saída">MUTE</button>
        <button type="button" class="a-pill mon" data-act="mon" title="Escuta local desta saída">MON</button>
      </div>
    </article>`;
  }

  function headphonesMarkup() {
    return `<article class="a-out" data-name="__headphones__" data-bus="HP" data-visual="hp">
      <header class="a-out-head">
        <span class="a-out-name">HEADPHONES</span>
        <span class="a-out-tag">FONES</span>
      </header>
      <div class="a-out-body">
        <div class="a-scale" aria-hidden="true">${scaleMarkup()}</div>
        <div class="a-meter" role="img" aria-label="Medidor do Master de produção (referência dos fones)">
          <div class="a-meter-bars">
            <div class="a-meter-bar"><span class="a-meter-fill"></span><span class="a-meter-peak"></span></div>
            <div class="a-meter-bar"><span class="a-meter-fill"></span><span class="a-meter-peak"></span></div>
          </div>
          <span class="a-meter-lr"><span>L</span><span>R</span></span>
        </div>
        <div class="a-fader-rail">
          <input class="a-fader" type="range" min="-60" max="0" step="0.5" value="0" disabled title="O motor não expõe nível próprio de fones; use o monitor do Master" aria-label="Fones sem nível próprio">
        </div>
      </div>
      <div class="a-out-chip"><span data-out-chip>—</span></div>
      <div class="a-out-buttons">
        <button type="button" class="a-pill mon wide" data-act="mon" title="Ouvir o Master nos fones deste computador">MON</button>
      </div>
    </article>`;
  }

  function buildStrips(inputs, outputs) {
    strips.clear();
    const inputBox = E('audio-input-strips');
    const outputBox = E('audio-output-strips');
    /* Duas linhas compactas; quando a largura não comporta todos os canais da
       linha, a própria linha rola na horizontal (a página nunca rola). */
    inputBox.innerHTML = '<div class="a-strip-row" data-row="1"></div><div class="a-strip-row" data-row="2"></div>';
    const rows = inputBox.querySelectorAll('.a-strip-row');
    /* Linha de cima alguns canais a menos quando a contagem é ímpar: assim a
       linha de baixo recebe o canal extra e, quando não couber, é ela que rola
       na horizontal (comportamento combinado: "a partir do 11º rola"). */
    const half = Math.floor(inputs.length / 2);
    inputs.forEach((channel, index) => {
      const row = rows[index < half ? 0 : 1];
      const wrapper = document.createElement('div');
      wrapper.className = 'strip-slot';
      wrapper.innerHTML = stripMarkup(channel);
      const strip = wrapper.firstElementChild;
      row.append(strip);
      strips.set(channel.name, { el: strip, peakL: -Infinity, peakR: -Infinity, peakAt: 0 });
      bindKnobs(strip);
    });
    if (!inputs.length) {
      const empty = document.createElement('p');
      empty.className = 'mixer-empty';
      empty.textContent = 'Nenhuma entrada pública com áudio neste projeto.';
      rows[0].append(empty);
    }
    for (const channel of outputs) {
      const wrapper = document.createElement('div');
      wrapper.className = 'strip-slot';
      wrapper.innerHTML = outputMarkup(channel);
      const strip = wrapper.firstElementChild;
      outputBox.append(strip);
      strips.set(channel.name, { el: strip, peakL: -Infinity, peakR: -Infinity, peakAt: 0 });
    }
    const hp = document.createElement('div');
    hp.className = 'strip-slot';
    hp.innerHTML = headphonesMarkup();
    outputBox.append(hp.firstElementChild);
    strips.set('__headphones__', { el: outputBox.lastElementChild, peakL: -Infinity, peakR: -Infinity, peakAt: 0 });
    renderInspector();
  }

  function paintMeter(el, levels, strip, now) {
    const dbL = levels.length ? dbFromMul(Math.max(levels[0] ?? 0, 0)) : -Infinity;
    const dbR = levels.length ? dbFromMul(Math.max(levels[1] ?? levels[0] ?? 0, 0)) : -Infinity;
    const values = [dbL, dbR];
    const bars = el.querySelectorAll('.a-meter-bar');
    if (now - strip.peakAt > 1600) { strip.peakL = -Infinity; strip.peakR = -Infinity; strip.peakAt = now; }
    const peaks = [strip.peakL, strip.peakR];
    for (let index = 0; index < 2; index++) {
      const bar = bars[index];
      if (!bar) continue;
      if (Number.isFinite(values[index]) && values[index] >= peaks[index]) peaks[index] = values[index];
      bar.style.setProperty('--lvl', normDb(values[index]).toFixed(3));
      bar.style.setProperty('--peak', normDb(peaks[index]).toFixed(3));
      const marker = bar.querySelector('.a-meter-peak');
      if (marker) marker.style.opacity = Number.isFinite(peaks[index]) && peaks[index] > -59.9 && normDb(peaks[index]) > 0.001 ? '1' : '0';
    }
    strip.peakL = peaks[0];
    strip.peakR = peaks[1];
  }

  function paintStrip(strip, channel, now) {
    const el = strip.el;
    el.classList.toggle('selected', AUDIO.getKey() === channel.key);
    el.classList.toggle('is-muted', channel.muted);
    el.classList.toggle('is-private', channel.private);

    const deviceSelect = el.querySelector('[data-device]');
    if (deviceSelect && deviceSelect.dataset.label !== channel.device.label) {
      deviceSelect.dataset.label = channel.device.label;
      deviceSelect.replaceChildren(new Option(channel.device.label, ''));
      deviceSelect.disabled = !channel.device.enabled;
      deviceSelect.title = channel.device.title;
    }

    const gainKnob = el.querySelector('[data-knob="gain"]');
    const gainChip = el.querySelector('[data-gain-chip]');
    const gainAvailable = channel.gainDb !== null && !channel.private;
    const motorGainDb = channel.gainDb ?? 0;
    const gainFollow = knobFollow(gainKnob, motorGainDb, 0.06);
    if (gainKnob) {
      gainKnob.classList.toggle('is-disabled', !gainAvailable);
      if (!gainKnob.classList.contains('dragging') && gainFollow) {
        updateKnob(gainKnob, motorGainDb, -30, 30, channel.gainDb === null ? '—' : chipDb(channel.gainDb));
      }
    }
    if (gainChip && gainFollow) gainChip.textContent = channel.gainDb === null ? '—' : chipDb(channel.gainDb);

    const panValue = clamp((channel.balance - 0.5) * 200, -100, 100);
    const panKnob = el.querySelector('[data-knob="pan"]');
    const panChip = el.querySelector('[data-pan-chip]');
    const panFollow = knobFollow(panKnob, panValue, 0.6);
    if (panKnob) {
      panKnob.classList.toggle('is-disabled', channel.private);
      if (!panKnob.classList.contains('dragging') && panFollow) updateKnob(panKnob, panValue, -100, 100, panLabel(panValue));
    }
    if (panChip && panFollow) panChip.textContent = panLabel(panValue);

    const fader = el.querySelector('.a-fader');
    const volumeDb = dbFromMul(channel.volumeMul);
    if (fader && document.activeElement !== fader) fader.value = clamp(volumeDb, -60, 0);
    const faderChip = el.querySelector('[data-fader-chip]');
    if (faderChip) faderChip.textContent = chipDb(volumeDb);
    if (fader) fader.disabled = channel.private;

    paintMeter(el, channel.levels, strip, now);

    el.querySelector('[data-act="mute"]')?.classList.toggle('on', channel.muted);
    el.querySelector('[data-act="mon"]')?.classList.toggle('on', channel.monitor);
    el.querySelector('[data-act="solo"]')?.classList.toggle('on', solo.has(channel.name));
    const afv = el.querySelector('[data-act="afv"]');
    if (afv) {
      afv.classList.toggle('on', channel.afv);
      afv.disabled = channel.private || !channel.hasKey;
    }
    el.classList.toggle('soloed', solo.has(channel.name));
    el.classList.toggle('solo-dim', solo.size > 0 && !solo.has(channel.name));
    for (const button of el.querySelectorAll('[data-bus]')) button.classList.toggle('on', channel.routes.has(button.dataset.bus));
  }

  function paintOutput(strip, channel, now, master) {
    const el = strip.el;
    const source = channel || master;
    const fader = el.querySelector('.a-fader');
    const chip = el.querySelector('[data-out-chip]');
    if (channel) {
      const db = dbFromMul(channel.volumeMul);
      if (fader && document.activeElement !== fader) fader.value = clamp(db, -60, 0);
      if (chip) chip.textContent = chipDb(db);
      el.classList.toggle('is-muted', channel.muted);
      el.querySelector('[data-act="mute"]')?.classList.toggle('on', channel.muted);
      el.querySelector('[data-act="mon"]')?.classList.toggle('on', channel.monitor);
    } else {
      if (fader) fader.value = -60;
      if (chip) chip.textContent = '—';
      const btn = el.querySelector('[data-act="mon"]');
      if (btn) {
        btn.classList.toggle('on', !!master?.monitor);
        btn.disabled = !master;
        btn.title = master ? (master.monitor ? 'Parar a escuta do Master nos fones' : 'Ouvir o Master nos fones deste computador') : 'Master não confirmado pelo motor';
      }
    }
    if (source) paintMeter(el, source.levels || [], strip, now);
  }

  function renderMixer() {
    if (!snapshot) return;
    const model = modelChannels();
    const signature = JSON.stringify([model.inputs.map(c => [c.name, c.key]), model.outputs.map(c => c.name)]);
    if (signature !== structure) {
      structure = signature;
      buildStrips(model.inputs, model.outputs);
    }
    const now = performance.now();
    for (const channel of model.inputs) {
      const strip = strips.get(channel.name);
      if (strip) paintStrip(strip, channel, now);
    }
    const master = model.outputs.find(channel => channel.bus === 'M');
    for (const channel of model.outputs) {
      const strip = strips.get(channel.name);
      if (strip) paintOutput(strip, channel, now, master);
    }
    const hp = strips.get('__headphones__');
    if (hp) paintOutput(hp, null, now, master);
    const count = E('mixer-input-count');
    if (count) count.textContent = String(model.inputs.length);
    const outputsCount = E('outputs-count');
    if (outputsCount) outputsCount.textContent = String(model.outputs.length + 1);
    renderInspector(model);
    if (!detailsReading && performance.now() - detailsAt > 15000) readChannelDetails();
  }

  /* ---------------------------------------------------------------- */
  /* Comandos reais                                                    */
  /* ---------------------------------------------------------------- */

  async function refreshEverything() {
    try { await AUDIO.poll(true); } catch { /* a mensagem já aparece no rodapé */ }
    document.dispatchEvent(new CustomEvent('audio:request-json'));
  }

  async function run(action, data, okText) {
    try {
      await AUDIO.send(action, data);
      if (okText) AUDIO.toast(okText, 'ok');
    } catch (error) {
      AUDIO.toast(error.message, 'error');
    }
    readJson(true);
    refreshEverything();
  }

  async function toggleSolo(name) {
    if (soloBusy) return;
    soloBusy = true;
    if (solo.has(name)) solo.delete(name); else solo.add(name);
    const model = modelChannels();
    if (solo.size && !monitorBefore.size) {
      for (const channel of model.inputs) monitorBefore.set(channel.name, channel.monitor);
    }
    const desired = new Map();
    for (const channel of model.inputs) desired.set(channel.name, solo.size ? solo.has(channel.name) : (monitorBefore.get(channel.name) ?? channel.monitor));
    for (const channel of model.inputs) {
      const want = desired.get(channel.name);
      if (want === channel.monitor) continue;
      try {
        await AUDIO.send('audio_monitor', { input: channel.name, enabled: want });
      } catch (error) {
        AUDIO.toast(`${channel.name}: ${error.message}`, 'error');
        if (want) solo.delete(channel.name);
      }
    }
    if (!solo.size) monitorBefore.clear();
    soloBusy = false;
    AUDIO.toast(solo.size ? `SOLO local em ${solo.size} canal(is) — PGM intacto.` : 'SOLO encerrado; escuta local restaurada.', 'info');
    readJson(true);
  }

  function bindKnobs(strip) {
    const name = strip.dataset.name;
    const channel = channelByName(name);
    if (!channel) return;
    bindKnob(strip.querySelector('[data-knob="gain"]'), {
      min: -30,
      max: 30,
      step: 0.1,
      value: channel.gainDb ?? 0,
      reset: 0,
      format: value => chipDb(value),
      onInput: value => {
        const chip = strip.querySelector('[data-gain-chip]');
        if (chip) chip.textContent = chipDb(value);
      },
      onCommit: value => commitGainFilter(channelByName(name) || channel, value)
    });
    bindKnob(strip.querySelector('[data-knob="pan"]'), {
      min: -100,
      max: 100,
      step: 1,
      value: clamp((channel.balance - 0.5) * 200, -100, 100),
      reset: 0,
      format: value => panLabel(value),
      onInput: value => {
        const chip = strip.querySelector('[data-pan-chip]');
        if (chip) chip.textContent = panLabel(value);
      },
      onCommit: value => commitPan(channelByName(name) || channel, value)
    });
  }

  async function commitGainFilter(channel, value) {
    if (!channel?.key || channel.private) return;
    try {
      await AUDIO.send('audio_routing_filter', { key: channel.key, type: 'gain', enabled: true, settings: { db: Number(value) } });
      const current = detailsFor(channel.key);
      if (current) {
        current.filters = current.filters || {};
        const gain = current.filters.gain || { supported: true, exists: true, enabled: true, settings: {} };
        current.filters.gain = { ...gain, enabled: true, settings: { ...(gain.settings || {}), db: Number(value) } };
      }
      AUDIO.toast('Ganho de entrada aplicado.', 'ok');
    } catch (error) {
      AUDIO.toast(error.message, 'error');
    }
    refreshEverything();
    setTimeout(() => readChannelDetails(true), 250);
  }

  async function commitPan(channel, value) {
    if (!channel || channel.private) return;
    try {
      await AUDIO.send('audio_balance', { input: channel.name, balance: (Number(value) + 100) / 200 });
      AUDIO.toast('Panorama aplicado.', 'ok');
    } catch (error) {
      AUDIO.toast(error.message, 'error');
    }
    refreshEverything();
  }

  async function commitFader(channel, db) {
    if (!channel || channel.private) return;
    try {
      await AUDIO.send('audio_volume', { input: channel.name, volume: Math.round(dbToMul(db) * 100) });
      AUDIO.toast('Fader aplicado.', 'ok');
    } catch (error) {
      AUDIO.toast(error.message, 'error');
    }
    refreshEverything();
  }

  async function commitDelay(channel, value) {
    if (!channel?.key || channel.private) return;
    const delayMs = clamp(Math.round(Number(value) || 0), -950, 20000);
    try {
      await AUDIO.send('audio_routing_delay', { key: channel.key, delayMs });
      const current = detailsFor(channel.key);
      if (current) current.delayMs = delayMs;
      AUDIO.toast('Delay de entrada aplicado.', 'ok');
    } catch (error) {
      AUDIO.toast(error.message, 'error');
    }
    refreshEverything();
    setTimeout(() => readChannelDetails(true), 250);
  }

  async function commitMain(channel, bus) {
    if (!channel || channel.private) return;
    try {
      for (const target of ['M', 'A', 'B']) {
        await AUDIO.send('audio_bus', { input: channel.name, bus: target, enabled: target === bus });
      }
      AUDIO.toast(bus ? `Destino principal: ${bus === 'M' ? 'MAIN' : bus}.` : 'Destino principal removido.', 'ok');
    } catch (error) {
      AUDIO.toast(error.message, 'error');
    }
    refreshEverything();
  }

  function bindStripEvents(containerId) {
    const box = E(containerId);
    if (!box) return;

    box.addEventListener('click', event => {
      const button = event.target.closest('button');
      const strip = event.target.closest('.a-strip');
      const out = event.target.closest('.a-out');
      if (button) {
        const name = strip?.dataset.name || out?.dataset.name;
        const channel = channelByName(name);
        if (out?.dataset.bus === 'HP') {
          const master = modelChannels().outputs.find(item => item.bus === 'M');
          if (!master) { AUDIO.toast('Master não confirmado pelo motor.', 'warn'); return; }
          run('audio_monitor', { input: master.name, enabled: !master.monitor }, master.monitor ? 'Escuta do Master desligada.' : 'Master na escuta local.');
          return;
        }
        if (!channel) return;
        if (button.dataset.bus) {
          const bus = button.dataset.bus;
          run('audio_bus', { input: name, bus, enabled: !channel.routes.has(bus) }, bus === 'M' ? 'Destino MAIN atualizado.' : `Destino ${bus} atualizado.`);
          return;
        }
        const action = button.dataset.act;
        if (action === 'mute') run('audio_mute', { input: name, muted: !channel.muted }, channel.muted ? 'Áudio aberto.' : 'Canal silenciado.');
        else if (action === 'mon') run('audio_monitor', { input: name, enabled: !channel.monitor }, channel.monitor ? 'Escuta local desligada.' : 'Canal na escuta local.');
        else if (action === 'solo') toggleSolo(name);
        else if (action === 'afv') {
          const source = sourceOf(name);
          if (!source?.key) { AUDIO.toast('Esta fonte não expõe AFV no motor.', 'warn'); return; }
          run('audio_routing_afv', { key: source.key, enabled: !source.afv }, source.afv ? 'AFV desligado.' : 'AFV ligado.');
        }
        return;
      }
      if (!strip || event.target.closest('input, select, .a-knob, .a-fader')) return;
      if (strip) AUDIO.selectSource(strip.dataset.key);
    });

    box.addEventListener('change', event => {
      const strip = event.target.closest('.a-strip');
      const out = event.target.closest('.a-out');
      const name = strip?.dataset.name || out?.dataset.name;
      if (!name) return;
      const channel = channelByName(name);
      if (!channel) return;
      if (event.target.matches('.a-fader') && !out) {
        const db = clamp(Number(event.target.value), -60, 0);
        commitFader(channel, db);
      } else if (event.target.matches('.a-fader') && out && out.dataset.bus !== 'HP') {
        const db = clamp(Number(event.target.value), -60, 0);
        commitFader(channel, db);
      }
    });
  }
  bindStripEvents('audio-input-strips');
  bindStripEvents('audio-output-strips');

  /* ---------------------------------------------------------------- */
  /* Inspetor                                                          */
  /* ---------------------------------------------------------------- */

  function noteKey(channel) {
    return '3mix.audio.note.' + encodeURIComponent(channel.key || channel.name);
  }

  function loadNote(channel) {
    try { return localStorage.getItem(noteKey(channel)) || ''; } catch { return ''; }
  }

  let noteTimer = 0;

  function renderInspector(model = modelChannels()) {
    const drawer = E('channel-drawer');
    if (!drawer) return;
    const selected = model.inputs.find(channel => channel.key === AUDIO.getKey()) || null;
    const title = E('insp-title');
    const scroll = drawer.querySelector('.a-insp-scroll');
    const empty = E('insp-empty');
    if (!selected) {
      if (title) title.textContent = 'INSPECTOR - —';
      if (scroll) scroll.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    if (title) title.textContent = `INSPECTOR - ${selected.name}`;
    if (scroll) scroll.hidden = false;
    if (empty) empty.hidden = true;

    const name = E('insp-name');
    if (name) name.value = selected.name;

    const device = E('insp-device');
    if (device && device.dataset.label !== selected.device.label) {
      device.dataset.label = selected.device.label;
      device.replaceChildren(new Option(selected.device.label, ''));
      device.disabled = !selected.device.enabled;
      device.title = selected.device.title;
    }

    const gain = selected.gainDb;
    const gainKnob = drawer.querySelector('[data-knob="insp-gain"]');
    const gainInput = E('insp-gain-value');
    const gainDisabled = selected.private || gain === null;
    const gainFollow = knobFollow(gainKnob, gain ?? 0, 0.06);
    if (gainKnob) {
      gainKnob.classList.toggle('is-disabled', gainDisabled);
      if (gainFollow) updateKnob(gainKnob, gain ?? 0, -30, 30, gain === null ? '—' : chipDb(gain));
    }
    if (gainInput) {
      gainInput.disabled = gainDisabled;
      if (document.activeElement !== gainInput && gainFollow) gainInput.value = gain === null ? '' : gain.toFixed(1);
      gainInput.placeholder = gain === null ? '—' : '';
    }

    const panValue = clamp((selected.balance - 0.5) * 200, -100, 100);
    const panKnob = drawer.querySelector('[data-knob="insp-pan"]');
    const panCenter = E('insp-pan-center');
    const panFollow = knobFollow(panKnob, panValue, 0.6);
    if (panKnob) {
      panKnob.classList.toggle('is-disabled', selected.private);
      if (panFollow) updateKnob(panKnob, panValue, -100, 100, panLabel(panValue));
    }
    if (panCenter) {
      panCenter.disabled = selected.private;
      panCenter.title = `Panorama atual: ${panLabel(panValue)}`;
    }

    const delay = selected.delayMs;
    const delayKnob = drawer.querySelector('[data-knob="insp-delay"]');
    const delayInput = E('insp-delay-value');
    const delayDisabled = selected.private || delay === null;
    const delayFollow = knobFollow(delayKnob, clamp(delay ?? 0, -950, 2000), 10);
    if (delayKnob) {
      delayKnob.classList.toggle('is-disabled', delayDisabled);
      if (delayFollow) updateKnob(delayKnob, clamp(delay ?? 0, -950, 2000), -950, 2000, delay === null ? '—' : `${Math.round(delay)} ms`);
    }
    if (delayInput) {
      delayInput.disabled = delayDisabled;
      if (document.activeElement !== delayInput && delayFollow) delayInput.value = delay === null ? '' : String(Math.round(delay));
      delayInput.placeholder = delay === null ? '—' : '';
    }

    const main = E('insp-main');
    if (main) {
      main.disabled = selected.private;
      main.value = mainRoute(selected);
    }

    const notes = E('insp-notes');
    if (notes && document.activeElement !== notes) notes.value = loadNote(selected);

    const dsp = E('insp-dsp');
    if (dsp) dsp.hidden = selected.private;
    const detail = AUDIO.getDetails();
    const signature = JSON.stringify([detail?.key, detail?.delayMs, detail?.filterOrder, detail?.filters]);
    if (signature !== lastFilterSignature) {
      lastFilterSignature = signature;
      AUDIO.renderFilterForm?.();
      const order = E('filter-order');
      if (order) order.textContent = detail?.filterOrder?.length ? detail.filterOrder.join(' → ') : 'sem filtros';
    }
  }

  function bindInspector() {
    const drawer = E('channel-drawer');
    if (!drawer) return;

    bindKnob(drawer.querySelector('[data-knob="insp-gain"]'), {
      min: -30, max: 30, step: 0.1, value: 0, reset: 0,
      format: value => chipDb(value),
      onInput: value => {
        const input = E('insp-gain-value');
        if (input && document.activeElement !== input) input.value = value.toFixed(1);
      },
      onCommit: value => {
        const channel = selectedChannel();
        if (channel) commitGainFilter(channel, value);
      }
    });

    bindKnob(drawer.querySelector('[data-knob="insp-pan"]'), {
      min: -100, max: 100, step: 1, value: 0, reset: 0,
      format: value => panLabel(value),
      onInput: value => {
        const button = E('insp-pan-center');
        if (button) button.title = `Panorama atual: ${panLabel(value)}`;
      },
      onCommit: value => {
        const channel = selectedChannel();
        if (channel) commitPan(channel, value);
      }
    });

    bindKnob(drawer.querySelector('[data-knob="insp-delay"]'), {
      min: -950, max: 2000, step: 1, value: 0, reset: 0,
      format: value => `${Math.round(value)} ms`,
      onInput: value => {
        const input = E('insp-delay-value');
        if (input && document.activeElement !== input) input.value = String(Math.round(value));
      },
      onCommit: value => {
        const channel = selectedChannel();
        if (channel) commitDelay(channel, value);
      }
    });

    E('insp-gain-value')?.addEventListener('input', event => {
      const knob = drawer.querySelector('[data-knob="insp-gain"]');
      const value = clamp(Number(event.target.value) || 0, -30, 30);
      if (knob) { knob._desired = value; updateKnob(knob, value, -30, 30, chipDb(value)); }
    });
    E('insp-gain-value')?.addEventListener('change', event => {
      const channel = selectedChannel();
      if (channel) commitGainFilter(channel, clamp(Number(event.target.value) || 0, -30, 30));
    });
    E('insp-delay-value')?.addEventListener('input', event => {
      const knob = drawer.querySelector('[data-knob="insp-delay"]');
      const value = clamp(Number(event.target.value) || 0, -950, 20000);
      if (knob) { knob._desired = clamp(value, -950, 2000); updateKnob(knob, knob._desired, -950, 2000, `${Math.round(value)} ms`); }
    });
    E('insp-delay-value')?.addEventListener('change', event => {
      const channel = selectedChannel();
      if (channel) commitDelay(channel, event.target.value);
    });
    E('insp-delay-reset')?.addEventListener('click', () => {
      const channel = selectedChannel();
      if (!channel || channel.private) return;
      const knob = drawer.querySelector('[data-knob="insp-delay"]');
      if (knob) { knob._desired = 0; updateKnob(knob, 0, -950, 2000, '0 ms'); }
      commitDelay(channel, 0);
    });
    E('insp-pan-center')?.addEventListener('click', () => {
      const channel = selectedChannel();
      if (!channel || channel.private) return;
      const knob = drawer.querySelector('[data-knob="insp-pan"]');
      if (knob) { knob._desired = 0; updateKnob(knob, 0, -100, 100, 'Centro'); }
      commitPan(channel, 0);
    });
    E('insp-main')?.addEventListener('change', event => {
      const channel = selectedChannel();
      if (channel) commitMain(channel, event.target.value);
    });
    E('insp-device-gear')?.addEventListener('click', () => showView('devices'));
    E('insp-notes')?.addEventListener('input', () => {
      const channel = selectedChannel();
      if (!channel) return;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        try { localStorage.setItem(noteKey(channel), E('insp-notes').value); } catch { /* storage off */ }
      }, 250);
    });

    document.addEventListener('audio:selected', () => renderInspector());
    document.addEventListener('audio:state', () => renderInspector());
  }
  bindInspector();

  /* ---------------------------------------------------------------- */
  /* Retornos / N-1                                                    */
  /* ---------------------------------------------------------------- */

  const AUDIO_MODES = [
    ['n-1', 'N-1 (sem a fonte do repórter)'],
    ['master', 'Master de produção'],
    ['bus_a', 'Barramento A'],
    ['bus_b', 'Barramento B']
  ];

  function returnDraft(feed) {
    const draft = AUDIO.routing?.draft.returns;
    return draft?.get(feed.id) || {
      name: feed.name,
      audioMode: feed.audioMode || 'n-1',
      nMinusExclude: feed.nMinusExclude || '',
      latencyMs: feed.latencyMs ?? 300
    };
  }

  function writeReturnDraft(feed, patch) {
    const draft = AUDIO.routing?.draft.returns;
    if (!draft) return;
    draft.set(feed.id, { ...returnDraft(feed), ...patch });
    document.dispatchEvent(new CustomEvent('audio:draft'));
    renderReturns();
  }

  function sentMix(feed) {
    const mode = feed.audioMode || 'n-1';
    const letter = mode === 'bus_a' ? 'A' : mode === 'bus_b' ? 'B' : 'M';
    const excluded = feed.nMinusExclude;
    const included = [];
    for (const channel of snapshot?.audioInputs || []) {
      if (channel.bus || channel.kind === 'mix-track-to-source' || channel.kind === 'freemix_audio_bus') continue;
      if (/^(?:FreeMix|3Mix)\s+(?:N1|Retorno)\b/i.test(channel.name)) continue;
      const routes = String(programInputFor(channel.name)?.audioBuses || '').split(',').filter(Boolean);
      if (!routes.includes(letter)) continue;
      if (mode === 'n-1' && channel.name === excluded) continue;
      included.push(channel.name);
    }
    return { letter, included, excluded: mode === 'n-1' ? excluded : '' };
  }

  function renderReturns() {
    const box = E('returns-list');
    if (!box) return;
    const feeds = snapshot?.returnFeeds?.feeds || [];
    const availability = E('returns-availability');
    if (availability) {
      availability.textContent = feeds.length
        ? 'Transporte: gerenciador de retorno do motor · socket SRT não aberto nesta build'
        : 'Nenhum canal de retorno configurado no motor';
      availability.dataset.tone = feeds.length ? 'warn' : 'off';
    }

    const inputNames = (snapshot?.audioInputs || [])
      .filter(input => !input.bus && input.kind !== 'mix-track-to-source' && input.kind !== 'freemix_audio_bus' && !/^(?:FreeMix|3Mix)\s+(?:N1|Retorno)\b/i.test(input.name))
      .map(input => input.name);
    const signature = JSON.stringify([feeds.map(feed => feed.id), inputNames]);
    if (box.dataset.signature !== signature) {
      box.dataset.signature = signature;
      box.replaceChildren();
      if (!feeds.length) {
        box.innerHTML = '<p class="table-empty">O motor não informou canais de retorno.</p>';
      }
      for (const feed of feeds) {
        const card = document.createElement('article');
        card.className = 'return-card';
        card.dataset.feed = feed.id;
        const inputs = (snapshot?.audioInputs || []).filter(input => !input.bus && input.kind !== 'mix-track-to-source' && input.kind !== 'freemix_audio_bus' && !/^(?:FreeMix|3Mix)\s+(?:N1|Retorno)\b/i.test(input.name));
        card.innerHTML = `<header class="return-head">
            <div><strong>${esc(feed.name)}</strong><span class="mini-tag">${esc(feed.protocol || 'srt')} :${esc(feed.port)}</span></div>
            <span class="return-state" data-return-state>—</span>
          </header>
          <div class="return-body">
            <label class="field">Áudio enviado
              <select data-return-mode>${AUDIO_MODES.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}</select>
            </label>
            <label class="field">Fonte excluída (N-1)
              <select data-return-exclude><option value="">Nenhuma — risco de eco</option>${inputs.map(input => `<option value="${esc(input.name)}">${esc(input.name)}</option>`).join('')}</select>
            </label>
            <label class="field">Latência
              <span class="inline"><input data-return-latency type="number" min="0" max="4000" step="10"><span class="field-unit">ms</span></span>
            </label>
            <div class="sent-mix"><span class="sent-title">Mistura enviada</span><div class="sent-chips" data-sent></div></div>
          </div>
          <footer class="return-foot">
            <button type="button" class="btn-hardware success" data-return-action="start">Iniciar</button>
            <button type="button" class="btn-hardware danger" data-return-action="stop">Parar</button>
            <span class="return-clients" data-return-clients></span>
          </footer>`;
        box.append(card);
      }
    }

    for (const feed of feeds) {
      const card = box.querySelector(`[data-feed="${CSS.escape(feed.id)}"]`);
      if (!card) continue;
      const draft = returnDraft(feed);
      const mode = card.querySelector('[data-return-mode]');
      const exclude = card.querySelector('[data-return-exclude]');
      const latency = card.querySelector('[data-return-latency]');
      if (mode && document.activeElement !== mode) mode.value = draft.audioMode;
      if (exclude && document.activeElement !== exclude) exclude.value = draft.nMinusExclude || '';
      if (latency && document.activeElement !== latency) latency.value = draft.latencyMs ?? 300;
      if (exclude) exclude.disabled = draft.audioMode !== 'n-1';

      const state = card.querySelector('[data-return-state]');
      if (state) {
        state.textContent = feed.status === 'running' ? '● ativo' : feed.status === 'error' ? '● erro' : '○ parado';
        state.dataset.tone = feed.status === 'running' ? 'ok' : feed.status === 'error' ? 'error' : 'off';
      }
      const clients = card.querySelector('[data-return-clients]');
      if (clients) clients.textContent = `${feed.connectedClients || 0} cliente(s) · RTT ${feed.stats?.rttMs ?? 0} ms`;

      const mix = sentMix({ ...feed, ...draft });
      const chips = card.querySelector('[data-sent]');
      if (chips) {
        const names = [...mix.included];
        chips.innerHTML = names.length
          ? names.map(name => `<span class="chip">${esc(name)}</span>`).join('') + (mix.excluded ? `<span class="chip excluded" title="Fonte excluída da mistura">${esc(mix.excluded)} excluída</span>` : '')
          : mix.excluded
            ? `<span class="chip excluded" title="Fonte excluída da mistura">${esc(mix.excluded)} excluída</span><span class="chip muted">Nenhuma outra fonte roteada para este bus</span>`
            : '<span class="chip muted">Nenhuma fonte roteada para este bus</span>';
      }
      if (AUDIO.routing?.draft.returns.has(feed.id)) card.classList.add('pending'); else card.classList.remove('pending');
    }

    const internal = (AUDIO.getState()?.sources || []).filter(source => AUDIO.sourceClass(source) === 'return');
    const list = E('returns-internal');
    if (list) {
      list.replaceChildren();
      if (!internal.length) {
        const li = document.createElement('li');
        li.className = 'table-empty';
        li.textContent = 'Nenhum retorno interno criado pelo motor neste projeto.';
        list.append(li);
      }
      for (const source of internal) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = source.name;
        const state = document.createElement('span');
        state.className = 'mini-tag';
        state.textContent = source.muted ? 'MUDO' : 'ABERTO';
        li.append(name, state);
        list.append(li);
      }
    }
    const count = E('returns-internal-count');
    if (count) count.textContent = `${internal.length} canal(is)`;
  }

  E('returns-list')?.addEventListener('change', event => {
    const card = event.target.closest('[data-feed]');
    if (!card) return;
    const feed = (snapshot?.returnFeeds?.feeds || []).find(item => item.id === card.dataset.feed);
    if (!feed) return;
    if (event.target.matches('[data-return-mode]')) writeReturnDraft(feed, { audioMode: event.target.value });
    else if (event.target.matches('[data-return-exclude]')) writeReturnDraft(feed, { nMinusExclude: event.target.value });
    else if (event.target.matches('[data-return-latency]')) writeReturnDraft(feed, { latencyMs: Number(event.target.value) || 300 });
  });

  E('returns-list')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-return-action]');
    if (!button) return;
    const card = button.closest('[data-feed]');
    const feedId = card?.dataset.feed;
    if (!feedId) return;
    try {
      await AUDIO.send(button.dataset.returnAction === 'start' ? 'return_feed_start' : 'return_feed_stop', { feedId });
      AUDIO.toast(button.dataset.returnAction === 'start' ? 'Retorno iniciado pelo motor.' : 'Retorno parado.', 'ok');
    } catch (error) {
      AUDIO.toast(error.message, 'error');
    }
    readJson(true);
  });

  /* ---------------------------------------------------------------- */
  /* Dispositivos                                                      */
  /* ---------------------------------------------------------------- */

  function targetName(key) {
    const routing = AUDIO.getState()?.routing;
    if (!routing) return key;
    if (key === 'M') return 'Master';
    if (key === 'A') return 'Bus A';
    if (key === 'B') return 'Bus B';
    return routing.buses?.find(bus => bus.key === key)?.label
      || routing.sources?.find(source => source.key === key)?.name
      || key;
  }

  function renderDevices() {
    const routing = AUDIO.getState()?.routing;
    const cap = routing?.capabilities || {};
    const output = routing?.asioOutput || null;
    const devices = cap.renderDevices || [];
    const known = cap.renderInventoryKnown === true;

    const led = E('devices-state-led');
    const text = E('devices-state');
    const time = E('devices-time');
    if (led) led.dataset.tone = !routing ? 'pending' : cap.renderInventoryError ? 'warn' : known ? 'ok' : 'pending';
    if (text) {
      text.textContent = !routing ? 'Aguardando o motor'
        : known ? `${devices.length} interface(s) de reprodução consultada(s)`
          : 'Dispositivos ainda não consultados';
    }
    if (time) {
      time.textContent = !routing ? 'O inventário depende da conexão com o motor.'
        : known ? (cap.renderInventoryError || 'Inventário WASAPI/ASIO consultado nesta execução do motor.')
          : 'A consulta abre o inventário WASAPI e ASIO no motor — nenhum valor é presumido.';
    }

    const count = E('devices-render-count');
    if (count) count.textContent = known ? `${devices.length} interface(s)` : 'pendente';

    const body = E('devices-render-body');
    if (body) {
      const signature = JSON.stringify([known, devices.map(device => device.id), (routing?.directOut || []).map(entry => [entry.key, entry.device, entry.enabled])]);
      if (body.dataset.signature !== signature) {
        body.dataset.signature = signature;
        if (!known) {
          body.innerHTML = '<tr><td colspan="6" class="table-empty">Clique em <b>Consultar dispositivos</b> para abrir o inventário real do Windows.</td></tr>';
        } else if (!devices.length) {
          body.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhuma interface de reprodução ativa foi encontrada.</td></tr>';
        } else {
          body.innerHTML = devices.map(device => {
            const uses = (routing?.directOut || []).filter(entry => entry.device === device.id && entry.enabled);
            return `<tr><td><span class="cell-name">${esc(device.name)}</span></td>
              <td>WASAPI</td>
              <td title="Par estéreo 1–2 usado pelo Audio Monitor do motor neste endpoint">1–2 (estéreo)</td>
              <td title="O modo compartilhado do Windows define a taxa do endpoint">definida pelo Windows</td>
              <td title="O modo compartilhado do Windows define o buffer do endpoint">compartilhado</td>
              <td>${uses.length ? uses.map(entry => esc(`${targetName(entry.key)} · 1–2`)).join('<br>') : '<span class="muted-text">livre</span>'}</td></tr>`;
          }).join('');
        }
      }
    }

    const asioDrivers = [];
    for (const driver of cap.asioDrivers || []) asioDrivers.push({ ...driver, type: 'Entrada', known: cap.asioInventoryKnown });
    for (const driver of output?.drivers || []) if (!asioDrivers.some(row => row.id === driver.id)) asioDrivers.push({ ...driver, type: 'Saída', known: output.inventoryKnown });
    const asioCount = E('devices-asio-count');
    if (asioCount) asioCount.textContent = `${asioDrivers.length} driver(s)`;
    const asioBody = E('devices-asio-body');
    if (asioBody) {
      const signature = JSON.stringify([asioDrivers.map(driver => [driver.id, driver.type]), output?.driverId, output?.running, output?.sampleRate, output?.bufferFrames]);
      if (asioBody.dataset.signature !== signature) {
        asioBody.dataset.signature = signature;
        if (!asioDrivers.length) {
          asioBody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum driver ASIO detectado. O inventário ASIO precisa ser consultado no motor.</td></tr>';
        } else {
          asioBody.innerHTML = asioDrivers.map(driver => {
            const active = output?.driverId === driver.id;
            return `<tr><td><span class="cell-name">${esc(driver.name)}</span></td>
              <td>${driver.type}</td>
              <td>${active && output?.outputChannels ? output.outputChannels + ' canais' : '—'}</td>
              <td>${active && output?.sampleRate ? (output.sampleRate / 1000).toFixed(1) + ' kHz' : '—'}</td>
              <td>${active && output?.bufferFrames ? output.bufferFrames + ' frames' : '—'}</td>
              <td>${driver.known ? (active ? (output.running ? '<span class="ok-text">em operação</span>' : 'disponível') : 'detectado') : '<span class="muted-text">inventário pendente</span>'}</td></tr>`;
          }).join('');
        }
      }
    }

    const stateBody = E('devices-asio-state');
    const stateStatus = E('devices-asio-state-status');
    if (stateStatus) {
      stateStatus.textContent = !output ? 'playback ASIO indisponível' : output.running ? 'em operação' : output.configured ? 'configurado, parado' : 'não configurado';
      stateStatus.dataset.tone = output?.running ? 'ok' : output?.supported ? 'off' : 'warn';
    }
    if (stateBody) {
      if (!output) {
        stateBody.innerHTML = '<p class="table-empty">O motor não expôs a saída ASIO nesta build.</p>';
      } else {
        const driverName = output.drivers?.find(driver => driver.id === output.driverId)?.name || output.driverId || '—';
        stateBody.innerHTML = `<dl class="state-grid">
          <div><dt>Suporte</dt><dd>${output.supported ? 'sim' : 'não'}</dd></div>
          <div><dt>Inventário</dt><dd>${output.inventoryKnown ? 'consultado' : 'pendente'}</dd></div>
          <div><dt>Estado</dt><dd>${output.running ? '<span class="ok-text">ativo</span>' : output.configured ? 'configurado, parado' : 'não configurado'}</dd></div>
          <div><dt>Driver</dt><dd>${esc(driverName)}</dd></div>
          <div><dt>Canais de saída</dt><dd>${output.outputChannels || '—'}</dd></div>
          <div><dt>Taxa</dt><dd>${output.sampleRate ? (output.sampleRate / 1000).toFixed(1) + ' kHz' : '—'}</dd></div>
          <div><dt>Buffer</dt><dd>${output.bufferFrames ? output.bufferFrames + ' frames' : (output.configuredBufferFrames ? output.configuredBufferFrames + ' frames (configurado)' : '—')}</dd></div>
          <div><dt>Latência</dt><dd>${output.running ? Number(output.outputLatencyMs || 0).toFixed(1) + ' ms' : '—'}</dd></div>
          <div><dt>Underruns</dt><dd>${output.underrunFrames ?? '—'}</dd></div>
          <div><dt>Falhas</dt><dd>${output.fault ? '<span class="err-text">' + esc(output.fault) + '</span>' : '0'}</dd></div>
        </dl>${output.error ? `<p class="state-error">${esc(output.error)}</p>` : ''}`;
      }
    }

    const format = E('devices-format');
    if (format) {
      format.innerHTML = `<dl class="state-grid">
        <div><dt>Taxa do projeto</dt><dd>${output?.sampleRate ? (output.sampleRate / 1000).toFixed(1) + ' kHz (medida na saída ASIO)' : 'não exposta pela API do painel'}</dd></div>
        <div><dt>Buffer do projeto</dt><dd>${output?.bufferFrames ? output.bufferFrames + ' frames (ASIO em operação)' : 'definido pelo motor/driver'}</dd></div>
        <div><dt>Canais WASAPI</dt><dd>par estéreo 1–2 do Audio Monitor</dd></div>
        <div><dt>Modo WASAPI</dt><dd>compartilhado do Windows</dd></div>
      </dl>
      <p class="panel-note">A API atual informa nome e id das interfaces de reprodução; canais, taxa e buffer de cada endpoint WASAPI pertencem ao Windows e não são inventados aqui.</p>`;
    }

    const limits = E('devices-limitations');
    if (limits) {
      const rows = [...(routing?.limitations || [])];
      rows.push('Saída física WASAPI duplica uma fonte ou barramento independente; o Master de produção não é enviado a um endpoint local por este controlador.');
      limits.innerHTML = rows.map(text => `<li>${esc(text)}</li>`).join('') || '<li>Limitações ainda não informadas pelo motor.</li>';
    }
  }

  E('devices-refresh')?.addEventListener('click', async () => {
    const button = E('devices-refresh');
    if (button) { button.disabled = true; button.textContent = 'Consultando…'; }
    try {
      await AUDIO.send('audio_routing_devices');
      AUDIO.toast('Inventário de dispositivos atualizado.', 'ok');
    } catch (error) {
      AUDIO.toast(error.message, 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Consultar dispositivos'; }
      await AUDIO.poll(true);
      readJson(true);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Aba Roteamento: hierarquia para o operador                        */
  /* ---------------------------------------------------------------- */

  const routingState = { sourcesExpanded: false };

  function updateRoutingCollapses() {
    const view = E('view-routing');
    if (!view) return;
    const buses = E('bus-select')?.querySelectorAll('option').length || 0;
    const busesCount = E('buses-count');
    if (busesCount) busesCount.textContent = buses ? `${buses} bus · criar/excluir` : 'nenhum — criar';
    const sourceRows = view.querySelectorAll('#routing-outputs-body tr[data-group="source"]').length;
    const sourceCount = E('physical-source-count');
    if (sourceCount) sourceCount.textContent = `(${sourceRows})`;
    view.classList.toggle('sources-hidden', !routingState.sourcesExpanded);
    const toggle = E('physical-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(routingState.sourcesExpanded));
    const showAll = E('show-physical-all');
    if (showAll && document.activeElement !== showAll) showAll.checked = routingState.sourcesExpanded;
  }

  function bindRoutingCollapses() {
    E('physical-toggle')?.addEventListener('click', () => {
      routingState.sourcesExpanded = !routingState.sourcesExpanded;
      updateRoutingCollapses();
    });
    E('show-physical-all')?.addEventListener('change', event => {
      routingState.sourcesExpanded = event.target.checked;
      updateRoutingCollapses();
    });
    const outputsBody = E('routing-outputs-body');
    if (outputsBody) new MutationObserver(updateRoutingCollapses).observe(outputsBody, { childList: true });
    const busSelect = E('bus-select');
    if (busSelect) new MutationObserver(updateRoutingCollapses).observe(busSelect, { childList: true });
    updateRoutingCollapses();
  }
  bindRoutingCollapses();

  /* ---------------------------------------------------------------- */
  /* Pendências, prontidão e rodapé                                    */
  /* ---------------------------------------------------------------- */

  let applying = false;

  function refreshDraftUi() {
    const pending = AUDIO.routing?.pendingCount() || 0;
    const apply = E('apply-changes');
    const badge = E('pending-count');
    const discard = E('discard-changes');
    const hint = E('apply-hint');
    if (apply) {
      apply.disabled = pending === 0 || applying || !AUDIO.isConnected();
      apply.textContent = applying ? 'Aplicando…' : 'Aplicar alterações';
      apply.title = AUDIO.isConnected() ? 'Grava no motor todas as alterações pendentes' : 'Sem conexão com o motor 3Mix';
    }
    if (badge) { badge.textContent = String(pending); badge.hidden = pending === 0; }
    if (discard) discard.hidden = pending === 0 || applying;
    if (hint) hint.textContent = applying ? 'Gravando no motor…' : pending ? `${pending} pendente(s)` : '';
  }

  function updateFooter() {
    const routing = AUDIO.getState()?.routing;
    const cap = routing?.capabilities || {};
    const output = routing?.asioOutput || null;
    const devices = cap.renderDevices || [];
    const actives = (routing?.directOut || []).filter(entry => entry.enabled);
    const driver = (output?.drivers || []).find(item => item.id === output.driverId)?.name || output?.driverId || '';
    const connected = AUDIO.isConnected();

    const project = snapshot?.preset || '—';
    if (E('project-name')) E('project-name').textContent = project;
    if (E('footer-project')) E('footer-project').textContent = project;

    const rate = E('footer-rate');
    if (rate) rate.textContent = output?.running && output.sampleRate ? `${(output.sampleRate / 1000).toFixed(1)} kHz` : '—';

    const buffer = E('footer-buffer');
    if (buffer) buffer.textContent = output?.running && output.bufferFrames
      ? `${output.bufferFrames} amostras`
      : output?.configuredBufferFrames ? `${output.configuredBufferFrames} amostras (config.)` : '—';

    const device = E('footer-device');
    if (device) {
      device.textContent = !connected || !routing
        ? '—'
        : output?.running
          ? (driver ? `ASIO · ${driver}` : 'ASIO em operação')
          : actives.length
            ? (actives.length === 1 ? (actives[0].deviceName || actives[0].device || 'saída ativa') : `${actives.length} saídas ativas`)
            : cap.renderInventoryKnown
              ? `${devices.length} interface(s) consultada(s) · nenhuma ativa`
              : 'não consultado';
      device.title = output?.running
        ? `Saída ASIO em operação${driver ? ': ' + driver : ''}`
        : actives.length
          ? actives.map(entry => `${entry.deviceName || entry.device || entry.key} · 1–2`).join('\n')
          : cap.renderInventoryKnown
            ? `${devices.length} interface(s) de reprodução no inventário; nenhuma saída física ativa`
            : 'Abra Dispositivos e clique em Consultar dispositivos para ler o inventário real';
    }

    const led = E('operation-led');
    if (led) led.dataset.tone = !connected || !routing ? 'error' : output?.running || actives.length ? 'ok' : cap.renderInventoryKnown ? (cap.renderInventoryError ? 'warn' : 'off') : 'pending';

    const message = E('message');
    if (message) {
      if (!connected || !routing) message.textContent = 'Sem conexão com o motor 3Mix';
      else if (output?.running) message.textContent = 'Saída ASIO em operação.';
      else if (actives.length) message.textContent = 'Saída física ativa.';
      else if (!cap.renderInventoryKnown) message.textContent = 'Dispositivos ainda não consultados.';
      else if (cap.renderInventoryError) message.textContent = 'Inventário de áudio incompleto: ' + cap.renderInventoryError;
      else message.textContent = 'Pronto para operação.';
    }
    refreshDraftUi();
  }

  E('apply-changes')?.addEventListener('click', async () => {
    if (applying) return;
    applying = true;
    refreshDraftUi();
    const result = await AUDIO.routing.applyAll();
    applying = false;
    if (result.failed) AUDIO.toast(`${result.applied} aplicada(s), ${result.failed} falha(s). ${result.errors?.[0] || ''}`, 'error');
    else AUDIO.toast(`${result.applied} alteração(ões) aplicada(s) no motor.`, 'ok');
    refreshDraftUi();
    readJson(true);
    AUDIO.poll(true);
  });

  E('discard-changes')?.addEventListener('click', () => {
    AUDIO.routing.discard();
    refreshDraftUi();
  });

  document.addEventListener('audio:draft', () => { refreshDraftUi(); renderReturns(); });
  document.addEventListener('audio:state', updateFooter);
  document.addEventListener('audio:offline', updateFooter);

  /* ---------------------------------------------------------------- */
  /* Leitura do estado de produção                                     */
  /* ---------------------------------------------------------------- */

  async function readJson(force = false) {
    if (disposed || reading) return;
    if (document.hidden && !force) return;
    if (!force && performance.now() - lastJsonAt < 700) return;
    reading = true;
    try {
      const response = await fetch('/api/json', { signal: AbortSignal.timeout(7000) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Estado indisponível');
      if (!data.connected && !data.preset) throw Error('Sem conexão com o motor 3Mix');
      snapshot = data;
      lastJsonAt = performance.now();
      AUDIO.setDirector?.(data.calls?.director?.name);
      renderMixer();
      renderReturns();
      renderDevices();
      updateFooter();
      document.dispatchEvent(new CustomEvent('audio:json'));
      /* Na primeira foto, busca os detalhes reais (gain/delay) de todos os canais
         imediatamente, em vez de esperar o ciclo de 15s. */
      if (details.size === 0) readChannelDetails(true);
    } catch (error) {
      const message = E('message');
      if (message && !AUDIO.isConnected()) message.textContent = 'Sem conexão com o motor 3Mix';
    } finally {
      reading = false;
    }
  }

  document.addEventListener('audio:request-json', () => readJson(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) readJson(true); });

  const timer = setInterval(readJson, 1500);
  window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); });

  readJson(true);
  refreshDraftUi();
})();
