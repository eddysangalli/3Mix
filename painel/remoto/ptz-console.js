// Full PTZ console: device selection, Pan/Tilt/Zoom/Focus/Home/Presets, imaging readout,
// and device registration (credential, when present, is written-only from this screen —
// GET /api/ptz never returns a password). Reuses PTZHold (painel/remoto/ptz-hold.js) for
// the same safe press/release lifecycle as the compact dock surface.
(() => {
  'use strict';
  const E = id => document.getElementById(id);
  const say = (el, text) => { el.textContent = text || ''; };
  let snapshot = null, selectedId = '', infoFor = '', configFor = '';

  const send = async (action, data) => {
    const response = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(6000), keepalive: action === 'ptz_release' });
    const json = await response.json();
    if (!response.ok || json.success === false) throw Error(json.error || 'PTZ request failed');
    return json.ptz;
  };
  const hold = new window.PTZHold({ send, onError: e => say(E('ptz-state'), e.message) });

  function paintState() {
    const device = snapshot?.devices?.find(d => d.id === selectedId);
    const el = E('ptz-state');
    el.className = 'ptz-state' + (device?.lastError ? ' error' : device?.connected ? ' live' : '');
    el.textContent = !device ? 'Nenhuma câmera selecionada' : device.lastError || (device.connected ? 'Conectada' : 'Não conectada (testar ao mover)');
    const enabled = !!device;
    for (const btn of document.querySelectorAll('#ptz-pad button, #ptz-zoom-wide, #ptz-zoom-tele, #ptz-focus-auto, #ptz-focus-near, #ptz-focus-far, #ptz-home, #ptz-preset-save')) btn.disabled = !enabled;
    for (const box of [E('ptz-presets'), E('ptz-presets-quick')]) if (box) for (const btn of box.children) btn.disabled = !enabled;
    const protoNames = { 'visca-tcp': 'VISCA over TCP', 'visca-udp': 'VISCA over UDP', onvif: 'ONVIF' };
    if (E('ptz-proto-badge')) E('ptz-proto-badge').textContent = device ? (protoNames[device.protocol] || device.protocol) : '—';
    if (E('ptz-conn-badge')) {
      E('ptz-conn-badge').textContent = device ? (device.connected ? '● Conectada' : '○ Desconectada') : '—';
      E('ptz-conn-badge').className = device?.connected ? 'ok' : '';
    }
    if (E('ptz-speed-val')) E('ptz-speed-val').textContent = E('ptz-speed').value + '%';
  }

  async function refresh() {
    try {
      const r = await fetch('/api/ptz', { signal: AbortSignal.timeout(4000) });
      const json = await r.json();
      if (!r.ok || !json.success) throw Error(json.error || 'PTZ indisponível');
      snapshot = json.ptz;
      const select = E('ptz-select'), previous = select.value || selectedId;
      select.replaceChildren(new Option('Selecione…', ''));
      for (const device of snapshot.devices || []) select.add(new Option(device.name, device.id));
      if ([...select.options].some(o => o.value === previous)) { select.value = previous; selectedId = previous; }
      else { selectedId = ''; hold.stop(); }
      paintState();
      paintLink();
      paintConfig();
      loadDeviceInfo();
    } catch (e) { say(E('ptz-state'), e.message); hold.stop(); }
  }

  // Input <-> device link. The compact dock and shortcuts resolve a camera through this
  // link, so the full window is where the operator creates/removes it.
  let inputsCache = [];
  const linkedKeys = () => {
    const links = snapshot?.links || {};
    return Object.keys(links).filter(k => links[k] === selectedId);
  };
  function paintLink() {
    const sel = E('ptz-link-input');
    const key = sel.value;
    const keys = linkedKeys();
    const nomes = keys.map(k => inputsCache.find(i => i.key === k)?.name || k);
    let texto;
    if (!selectedId) texto = 'Selecione uma câmera.';
    else if (key && keys.includes(key)) texto = 'Este Input está vinculado a esta câmera.';
    else if (keys.length) texto = 'Vinculado a ' + nomes.join(', ') + '.';
    else texto = 'Sem vínculo.';
    say(E('ptz-link-status'), texto);
  }
  async function loadInputs() {
    const sel = E('ptz-link-input');
    try {
      const r = await fetch('/api/json', { signal: AbortSignal.timeout(4000) });
      const json = await r.json();
      if (!r.ok) throw Error(json.error || 'Estado indisponível');
      const atual = sel.value;
      inputsCache = (json.sourceInputs || []).map(i => ({ key: i.key, name: i.name }));
      sel.replaceChildren(new Option('Selecione…', ''));
      for (const i of inputsCache) sel.add(new Option(i.name, i.key));
      if (atual && inputsCache.some(i => i.key === atual)) sel.value = atual;
      else if (linkedKeys().length === 1) sel.value = linkedKeys()[0];
      paintLink();
      paintPreview();
    } catch (e) {
      sel.replaceChildren(new Option('Inputs indisponíveis', ''));
      say(E('ptz-link-status'), 'Não foi possível ler os Inputs: ' + e.message);
    }
  }
  E('ptz-link-save').addEventListener('click', async () => {
    const input = E('ptz-link-input').value;
    if (!selectedId) { say(E('ptz-link-status'), 'Selecione a câmera antes de vincular.'); return; }
    if (!input) { say(E('ptz-link-status'), 'Selecione o Input.'); return; }
    try {
      await send('ptz_link', { device: selectedId, input });
      await refresh();
      await loadInputs();
      say(E('ptz-link-status'), 'Input vinculado.');
    } catch (e) { say(E('ptz-link-status'), e.message); }
  });
  E('ptz-link-remove').addEventListener('click', async () => {
    const input = E('ptz-link-input').value;
    if (!input) { say(E('ptz-link-status'), 'Selecione o Input que deseja desvincular.'); return; }
    try {
      await send('ptz_unlink', { input });
      await refresh();
      await loadInputs();
      say(E('ptz-link-status'), 'Vínculo removido.');
    } catch (e) { say(E('ptz-link-status'), e.message); }
  });

  // Preview do Input vinculado: usa o mesmo /api/thumbs (cache global, 2 capturas
  // simultâneas no máximo). Sem motor, mantém "Sem preview" em vez de inventar imagem.
  let previewTimer = null;
  async function paintPreview() {
    if (document.hidden) return;
    const box = E('ptz-preview');
    const key = E('ptz-link-input').value || linkedKeys()[0] || '';
    if (!key) {
      box.innerHTML = '<div class="ptz-preview-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/></svg><b>Sem preview</b><span>Vincule um Input para ver a imagem</span></div>';
      return;
    }
    const nome = inputsCache.find(i => i.key === key)?.name || 'Preview';
    let img = box.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = nome;
      img.onload = () => { if (box.firstChild !== img) box.replaceChildren(img); };
      img.onerror = () => { box.innerHTML = '<div class="ptz-preview-empty"><b>Sem preview</b><span>O Input não devolveu imagem</span></div>'; };
      box.replaceChildren(img);
    }
    img.src = '/api/ptz/preview?input=' + encodeURIComponent(key) + '&t=' + Date.now();
  }
  previewTimer = setInterval(paintPreview, 1200);
  E('ptz-link-input').addEventListener('change', paintPreview);

  E('ptz-select').addEventListener('change', e => { hold.stop(); selectedId = e.target.value; configFor = ''; paintState(); paintLink(); paintConfig(); loadInputs(); loadImaging(); loadDeviceInfo(); });
  E('ptz-speed').addEventListener('input', () => { if (E('ptz-speed-val')) E('ptz-speed-val').textContent = E('ptz-speed').value + '%'; });
  const gearButton = document.querySelector('.ptz-gear');
  if (gearButton) gearButton.addEventListener('click', () => { const f = E('ptz-cfg-name'); if (f) { f.focus(); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });

  // Pan/Tilt pad: press-and-hold via PTZHold, same lifecycle as the compact dock.
  for (const btn of E('ptz-pad').querySelectorAll('[data-pan]')) {
    const pan = Number(btn.dataset.pan), tilt = Number(btn.dataset.tilt);
    const start = () => { if (!selectedId) return; hold.start(selectedId, 'ptz_move', { pan, tilt, speed: Number(E('ptz-speed').value) / 100 }); };
    btn.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic pointer: release/blur still apply */ } start(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => hold.stop());
  }
  E('ptz-stop').addEventListener('click', () => { hold.stop(); if (selectedId) send('ptz_acquire', { device: selectedId, owner: 'PTZ console · STOP' }).then(r => send('ptz_stop', { device: selectedId, token: r.token })).then(() => send('ptz_release', { device: selectedId, token: undefined })).catch(() => {}); });

  function holdButton(el, command, data) {
    const start = () => { if (!selectedId) return; hold.start(selectedId, command, { ...data, speed: Number(E('ptz-speed').value) / 100 }); };
    el.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } start(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => hold.stop());
  }
  holdButton(E('ptz-zoom-wide'), 'ptz_zoom', { direction: -1 });
  holdButton(E('ptz-zoom-tele'), 'ptz_zoom', { direction: 1 });
  holdButton(E('ptz-focus-near'), 'ptz_focus', { direction: -1 });
  holdButton(E('ptz-focus-far'), 'ptz_focus', { direction: 1 });

  async function oneShot(action, data) {
    if (!selectedId) return;
    try {
      const acquired = await send('ptz_acquire', { device: selectedId, owner: 'PTZ console' });
      try { await send(action, { ...data, device: selectedId, token: acquired.token }); }
      finally { await send('ptz_release', { device: selectedId, token: acquired.token }).catch(() => {}); }
    } catch (e) { say(E('ptz-state'), e.message); }
  }
  E('ptz-focus-auto').addEventListener('click', () => oneShot('ptz_focus_mode', { auto: true }));
  E('ptz-home').addEventListener('click', () => oneShot('ptz_home', {}));
  E('ptz-preset-save').addEventListener('click', () => oneShot('ptz_preset_save', { number: Number(E('ptz-preset-number').value) - 1 }));

  function paintPresets() {
    for (const id of ['ptz-presets', 'ptz-presets-quick']) {
      const box = E(id);
      if (!box) continue;
      box.replaceChildren();
      for (let n = 1; n <= 6; n++) {
        const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = String(n); btn.dataset.n = String(n);
        btn.addEventListener('click', () => {
          document.querySelectorAll('.ptz-presets button').forEach(x => x.classList.toggle('on', x.dataset.n === String(n)));
          oneShot('ptz_preset_recall', { number: n - 1 });
        });
        box.append(btn);
      }
    }
  }
  paintPresets();

  const IMG_ROWS = [
    ['ptz-img-brightness', 'ptz-img-brightness-v', 'brightness'],
    ['ptz-img-contrast', 'ptz-img-contrast-v', 'contrast'],
    ['ptz-img-saturation', 'ptz-img-saturation-v', 'saturation'],
    ['ptz-img-sharpness', 'ptz-img-sharpness-v', 'sharpness']
  ];

  function paintImaging(values) {
    let lido = 0;
    for (const [id, vid, key] of IMG_ROWS) {
      const input = E(id), out = E(vid);
      if (!input || !out) continue;
      if (values && typeof values[key] === 'number' && Number.isFinite(values[key])) {
        input.disabled = false;
        input.value = String(Math.max(0, Math.min(100, values[key])));
        out.textContent = String(values[key]);
        lido++;
      } else {
        input.disabled = true;
        out.textContent = '—';
      }
    }
    const exp = E('ptz-img-exposure'), wb = E('ptz-img-wb');
    if (values && values.exposureMode) {
      exp.disabled = false;
      exp.value = /AUTO/i.test(values.exposureMode) ? 'AUTO' : 'MANUAL';
    } else { exp.disabled = true; exp.value = 'AUTO'; }
    if (values && values.wbMode) {
      wb.disabled = false;
      wb.value = /AUTO/i.test(values.wbMode) ? 'AUTO' : 'MANUAL';
    } else { wb.disabled = true; wb.value = 'AUTO'; }
    if (E('ptz-img-state')) E('ptz-img-state').textContent = values ? (lido ? 'lido da câmera' : 'sem parâmetros') : 'não suportado';
  }

  async function imagingSet(patch) {
    if (!selectedId) return;
    try {
      const acquired = await send('ptz_acquire', { device: selectedId, owner: 'PTZ imaging' });
      try { await send('ptz_imaging_set', { device: selectedId, token: acquired.token, patch }); }
      finally { await send('ptz_release', { device: selectedId, token: acquired.token }).catch(() => {}); }
      await loadImaging();
    } catch (e) { say(E('ptz-img-state'), e.message); }
  }

  for (const [id, vid, key] of IMG_ROWS) {
    const input = E(id);
    if (!input) continue;
    input.addEventListener('input', () => { E(vid).textContent = input.value; });
    input.addEventListener('change', () => imagingSet({ [key]: Number(input.value) }));
  }
  E('ptz-img-exposure').addEventListener('change', () => imagingSet({ exposureMode: E('ptz-img-exposure').value }));
  E('ptz-img-wb').addEventListener('change', () => imagingSet({ wbMode: E('ptz-img-wb').value }));

  function paintConfig() {
    const d = snapshot?.devices?.find(x => x.id === selectedId);
    if (!d) { configFor = ''; return; }
    if (configFor === d.id) return;
    configFor = d.id;
    E('ptz-cfg-name').value = d.name || '';
    E('ptz-cfg-protocol').value = d.protocol || 'visca-tcp';
    E('ptz-cfg-host').value = d.host || '';
    E('ptz-cfg-port').value = d.port || '';
    const onvif = d.protocol === 'onvif';
    E('ptz-cfg-onvif-label').hidden = !onvif;
    E('ptz-cfg-profile').hidden = !onvif;
    E('ptz-cfg-auth-label').hidden = !onvif;
    E('ptz-cfg-auth-row').hidden = !onvif;
    if (onvif) E('ptz-cfg-profile').value = d.profileToken || '';
  }

  let videoLoaded = false;
  async function loadVideoBadges() {
    if (videoLoaded) return;
    try {
      const r = await fetch('/api/video-settings', { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      if (!r.ok || !j.success) return;
      const v = j.video || {};
      if (v.baseWidth && v.baseHeight) E('ptz-res').textContent = `${v.baseWidth}x${v.baseHeight}`;
      if (v.fpsNumerator && v.fpsDenominator) E('ptz-fps').textContent = `${Math.round(v.fpsNumerator / v.fpsDenominator)} fps`;
      videoLoaded = true;
    } catch { /* motor offline: badges ficam — */ }
  }

  async function loadImaging() {
    const body = E('ptz-imaging-body');
    if (!selectedId) {
      paintImaging(null);
      body.replaceChildren(Object.assign(document.createElement('p'), { className: 'ptz-note', textContent: 'Nenhum dado de imagem lido ainda.' }));
      return;
    }
    try {
      const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ptz_imaging_get', device: selectedId }), signal: AbortSignal.timeout(5000) });
      const json = await r.json();
      if (!r.ok || !json.success) throw Error(json.error || 'Leitura de imagem indisponível');
      const values = json.ptz?.values || {};
      paintImaging(values);
      body.replaceChildren();
      const entries = Object.entries(values).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object');
      if (!entries.length) { body.append(Object.assign(document.createElement('p'), { className: 'ptz-note', textContent: 'Dispositivo não retornou valores de imagem suportados.' })); return; }
      for (const [key, value] of entries) {
        const row = document.createElement('div'); row.className = 'vd-row';
        const k = document.createElement('span'); k.textContent = key;
        const v = document.createElement('span'); v.className = 'vd-note'; v.textContent = String(value) + ' (registrador bruto; intervalo não confirmado com o fabricante)';
        row.append(k, v); body.append(row);
      }
    } catch (e) {
      paintImaging(null);
      body.replaceChildren(Object.assign(document.createElement('p'), { className: 'ptz-note', textContent: e.message }));
    }
  }

  async function loadDeviceInfo() {
    const model = E('ptz-device-model'), firmware = E('ptz-device-firmware');
    if (!model || !firmware) return;
    if (!selectedId) { model.textContent = '—'; firmware.textContent = '—'; infoFor = ''; return; }
    if (infoFor === selectedId) return;
    infoFor = selectedId;
    try {
      const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ptz_device_info', device: selectedId }), signal: AbortSignal.timeout(5000) });
      const json = await r.json();
      if (!r.ok || !json.success) throw Error(json.error || 'Informações indisponíveis');
      const info = json.ptz?.info || {};
      model.textContent = info.model || '—';
      firmware.textContent = info.firmware || '—';
    } catch {
      model.textContent = '—'; firmware.textContent = '—'; infoFor = '';
    }
  }

  // Device registration. Password is write-only here: it is sent to ptz_device_save and
  // never read back (GET /api/ptz only reports hasCredential:boolean).
  E('ptz-cfg-protocol').addEventListener('change', () => {
    const onvif = E('ptz-cfg-protocol').value === 'onvif';
    E('ptz-cfg-onvif-label').hidden = !onvif;
    E('ptz-cfg-profile').hidden = !onvif;
    E('ptz-cfg-auth-label').hidden = !onvif;
    E('ptz-cfg-auth-row').hidden = !onvif;
  });
  E('ptz-cfg-test').addEventListener('click', async () => {
    if (!selectedId) { say(E('ptz-cfg-status'), 'Salve o dispositivo antes de testar.'); return; }
    try { const r = await send('ptz_test', { device: selectedId }); say(E('ptz-cfg-status'), r.connected ? 'Conexão confirmada.' : 'Sem conexão: ' + (r.error || '')); }
    catch (e) { say(E('ptz-cfg-status'), e.message); }
  });
  E('ptz-cfg-save').addEventListener('click', async () => {
    try {
      const protocol = E('ptz-cfg-protocol').value;
      const payload = { action: 'ptz_device_save', id: selectedId || undefined, name: E('ptz-cfg-name').value, protocol, host: E('ptz-cfg-host').value, port: Number(E('ptz-cfg-port').value) };
      if (protocol === 'onvif') {
        payload.profileToken = E('ptz-cfg-profile').value;
        payload.url = `http://${payload.host}:${payload.port}/onvif/ptz_service`;
        const user = E('ptz-cfg-user').value, pass = E('ptz-cfg-pass').value;
        if (user || pass) { payload.username = user; payload.password = pass; }
      } else payload.address = 1;
      const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(6000) });
      const json = await r.json();
      if (!r.ok || !json.success) throw Error(json.error || 'Dispositivo não confirmado');
      E('ptz-cfg-pass').value = ''; // never keep the plaintext in the DOM longer than needed to send it
      say(E('ptz-cfg-status'), 'Dispositivo salvo.');
      configFor = '';
      selectedId = json.ptz.id; await refresh();
    } catch (e) { say(E('ptz-cfg-status'), e.message); }
  });

  window.addEventListener('blur', () => hold.stop());
  window.addEventListener('pagehide', () => hold.stop());
  document.addEventListener('visibilitychange', () => { if (document.hidden) hold.stop(); });

  (async () => { await refresh(); await loadInputs(); loadVideoBadges(); })();
  setInterval(refresh, 2500);
})();
