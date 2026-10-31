// Recording setup window, laid out like the reference switcher's "Recording Setup": the file formats as buttons on
// top, then folder, codec (with "use the graphics card encoder"), quality and fault-tolerant mode, and OK / Cancel.
// Everything shown is read from the engine; OK sends one real command and closes only after the engine confirms.
// While a recording is running, or when the engine's profile is in advanced output mode, nothing can be changed here.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id), esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // A list is rewritten only when its content changes, so a list the operator has open is never closed under them.
  const fill = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
  const HARDWARE = /nvenc|qsv|amf|vce|videotoolbox/i;
  // The engine's formats are a container (mkv, mp4, mov) and, for mp4 and mov, a fault-tolerant way of writing it.
  const split = (format) => { const m = /^(fragmented|hybrid)_(.+)$/.exec(format); return m ? { container: m[2], variant: m[1] } : { container: format, variant: '' }; };
  const join = (container, variant) => (variant ? variant + '_' + container : container);

  let settings = null, preset = '', busy = false, draft = null;   // draft = what the operator chose and has not saved

  const say = (text, kind = '') => { const box = E('msg'); box.textContent = text; box.className = 'vd-msg' + (kind ? ' vd-' + kind : ''); };
  const note = (text, kind) => { delete E('msg').dataset.auto; say(text, kind); };
  const getJson = async (url) => { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'O programa não respondeu à consulta'); return v; };
  const send = async (action, data = {}) => { const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(30000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'Operação recusada pelo programa'); return v; };
  const engineState = () => window.FreeMixRemote?.getState?.() || {};

  const formats = () => settings?.capabilities?.recordingFormats || [];
  const encoders = () => (settings?.capabilities?.simpleEncoders || []).map((e) => ({ id: e.id, name: e.label || e.id, codec: e.codec || 'h264' }));
  const saved = () => ({ directory: settings.recordDirectory || '', format: settings.values?.RecFormat2 || 'mkv', quality: settings.values?.RecQuality || 'Small', encoder: settings.values?.RecEncoder || 'x264' });
  const current = () => ({ ...saved(), ...(draft || {}) });
  const dirty = () => !!draft && Object.keys(draft).length > 0;
  function edit(change) { const base = saved(), next = { ...(draft || {}), ...change }; for (const k of Object.keys(next)) if (String(next[k]) === String(base[k])) delete next[k]; draft = Object.keys(next).length ? next : null; }
  // Fault tolerant: keep the way already chosen; when turning it on, prefer the newer one if the engine has it.
  const tolerantFormat = (container) => [join(container, 'hybrid'), join(container, 'fragmented')].find((f) => formats().includes(f));

  function draw() {
    if (!settings) return;
    const c = current(), now = split(c.format), recording = !!engineState().recording, advancedProfile = settings.mode === 'Advanced', locked = busy || recording || advancedProfile, active = document.activeElement;
    const containers = [...new Set(formats().map((f) => split(f).container))];
    fill(E('formats'), containers.map((x) => `<button data-container="${esc(x)}" role="tab"${x === now.container ? ' class="vd-on" aria-selected="true"' : ''}${locked ? ' disabled' : ''}>${esc(x.toUpperCase())}</button>`).join(''));
    if (active !== E('directory')) E('directory').value = c.directory;
    const list = encoders();
    fill(E('encoder'), list.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('') + (list.some((e) => e.id === c.encoder) ? '' : `<option value="${esc(c.encoder)}" disabled>${esc(c.encoder)} · indisponível neste computador</option>`));
    if (E('encoder').value !== c.encoder) E('encoder').value = c.encoder;
    E('hardware').checked = HARDWARE.test(c.encoder);
    if (E('quality').value !== c.quality) E('quality').value = c.quality;
    const canTolerate = !!tolerantFormat(now.container);
    E('tolerant-row').hidden = now.container === 'mkv';          // mkv already survives a crash
    E('tolerant').checked = !!now.variant; E('tolerant').disabled = locked || !canTolerate;
    for (const id of ['directory', 'encoder', 'quality']) E(id).disabled = locked;
    E('hardware').disabled = locked || !list.some((e) => HARDWARE.test(e.id));
    const v = settings.video || {};
    E('size').textContent = `${v.outputWidth}×${v.outputHeight} · ${v.fpsDenominator > 1 ? (v.fpsNumerator / v.fpsDenominator).toFixed(2).replace('.', ',') : v.fpsNumerator} quadros por segundo (do projeto)`;
    E('ok').disabled = locked; E('cancel').disabled = busy; E('advanced').disabled = busy;
    if (!E('msg').textContent || E('msg').dataset.auto) {
      const text = recording ? 'Gravando' + (engineState().recordTimecode ? ' ' + String(engineState().recordTimecode).split('.')[0] : '') + ': pare a gravação para alterar.' : advancedProfile ? 'O perfil do programa está em modo avançado: use “Avançado” para alterar a gravação.' : dirty() ? 'Alterações ainda não salvas.' : '';
      say(text, recording ? 'error' : ''); E('msg').dataset.auto = '1';
    }
  }

  async function load() { const r = await getJson('/api/settings'); if (!r.settings?.values || !Array.isArray(r.settings.capabilities?.recordingFormats)) throw Error('Resposta incompleta do programa'); settings = r.settings; preset = r.preset || ''; }
  async function save() {
    const c = current(), directory = c.directory.trim();
    if (!directory) { E('directory').focus(); throw Error('Informe a pasta de gravação.'); }
    if (engineState().recording) throw Error('Há uma gravação em andamento: pare antes de alterar.');
    // The project may have been switched while this window was open: what is on screen would go to the wrong one.
    const fresh = await getJson('/api/settings');
    if ((fresh.preset || '') !== preset) throw Error('O projeto mudou enquanto esta janela estava aberta. Feche e abra de novo.');
    if (fresh.settings?.mode === 'Advanced') { settings = fresh.settings; throw Error('O perfil do programa está em modo avançado: use “Avançado”.'); }
    const r = await send('settings_apply', { category: 'recording', directory, format: c.format, quality: c.quality, encoder: c.encoder });
    settings = r.settings?.values ? r.settings : (await getJson('/api/settings')).settings; draft = null;
  }
  const close = () => window.FreeMixClosePanel();

  E('formats').onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; const now = split(current().format), container = b.dataset.container; edit({ format: now.variant && formats().includes(join(container, now.variant)) ? join(container, now.variant) : container }); E('msg').dataset.auto = '1'; draw(); };
  E('directory').oninput = (e) => { edit({ directory: e.target.value }); E('msg').dataset.auto = '1'; draw(); };
  E('encoder').onchange = (e) => { edit({ encoder: e.target.value }); E('msg').dataset.auto = '1'; draw(); };
  E('hardware').onchange = (e) => { const list = encoders(), codec = list.find((x) => x.id === current().encoder)?.codec, pool = list.filter((x) => HARDWARE.test(x.id) === e.target.checked), choice = pool.find((x) => x.codec === codec) || pool[0]; if (choice) edit({ encoder: choice.id }); E('msg').dataset.auto = '1'; draw(); };
  E('quality').onchange = (e) => { edit({ quality: e.target.value }); E('msg').dataset.auto = '1'; draw(); };
  E('tolerant').onchange = (e) => { const container = split(current().format).container; edit({ format: e.target.checked ? tolerantFormat(container) || container : container }); E('msg').dataset.auto = '1'; draw(); };
  E('advanced').onclick = () => { if (dirty() && !confirm('Há alterações não salvas nesta janela. Abrir o editor avançado mesmo assim?')) return; location.href = '/settings?category=recording&context=recording'; };
  E('cancel').onclick = close;
  E('ok').onclick = async () => {
    if (busy) return;
    if (!dirty()) { close(); return; }
    busy = true; note('Salvando…'); draw();
    try { await save(); note('Gravação configurada e confirmada pelo programa.', 'ok'); setTimeout(close, 200); } catch (e) { note(e.message, 'error'); } finally { busy = false; draw(); }
  };

  // The recording state arrives with the shared connection; redraw when it changes.
  let last = null;
  setInterval(() => { const s = engineState(), sign = (s.recording ? 'r' : '') + (s.recording ? String(s.recordTimecode).split('.')[0] : ''); if (settings && sign !== last) { last = sign; draw(); } }, 500);
  (async function start() { for (;;) { try { await load(); break; } catch (e) { say(e.message + ' Tentando de novo…', 'error'); await new Promise((r) => setTimeout(r, 1500)); } } say(''); E('msg').dataset.auto = '1'; draw(); })();
})();
