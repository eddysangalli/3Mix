// Streaming settings window, laid out like the reference switcher's "Streaming Settings":
// destinations 1 to 5, Destination / URL / Stream key, Quality, encoder, Start all / Start N / View status / Save and close.
// Destination 1 is the program's main stream (profile settings of the engine); 2 to 5 are the four additional
// destinations. Every value shown is read from the engine and every button sends a real command; a destination that
// is on air cannot be edited, as in the reference.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id), esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PROVIDERS = [
    { id: 'custom', label: 'Servidor RTMP personalizado', url: '' },
    { id: 'youtube', label: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2' },
    { id: 'facebook', label: 'Facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
    { id: 'twitch', label: 'Twitch', url: 'rtmp://live.twitch.tv/app' },
  ];
  // [height, width, video kbps, audio kbps]
  const PRESETS = [[360, 640, 800, 128], [480, 854, 1500, 128], [720, 1280, 2500, 128], [720, 1280, 4000, 128], [1080, 1920, 4500, 128], [1080, 1920, 6000, 128], [1080, 1920, 8000, 160]];
  const HARDWARE = /nvenc|qsv|amf|vce|videotoolbox/i;
  // A list is rewritten only when its content changes, so a list the operator has open is never closed under them.
  const fill = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
  const mbps = (kbps) => (kbps >= 1000 ? (kbps / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'mbps' : kbps + 'kbps');

  let settings = null, outputs = null, selected = 0, loaded = false, busy = false;
  const drafts = [null, null, null, null, null];   // what the operator changed and has not saved yet, per destination

  const say = (text, kind = '') => { const box = E('msg'); box.textContent = text; box.className = 'vd-msg' + (kind ? ' vd-' + kind : ''); };
  const getJson = async (url) => { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'O motor não respondeu à consulta'); return v; };
  const send = async (action, data = {}) => { const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(120000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'Operação recusada pelo motor'); return v; };
  const engineState = () => window.FreeMixRemote?.getState?.() || {};

  // ---- what the engine has, in one shape for the five destinations ----
  const mainEncoders = () => (settings?.capabilities?.simpleEncoders || []).map((e) => ({ id: e.id, name: e.label || e.id, codec: e.codec || 'h264' }));
  const extraEncoders = () => (outputs?.encoders || []).map((e) => ({ id: e.id, name: e.name || e.id, codec: e.codec || 'h264' }));
  function saved(n) {
    if (n === 0) {
      const v = settings.values || {}, video = settings.video || {};
      return { url: settings.server || '', hasKey: !!settings.hasKey, width: video.outputWidth, height: video.outputHeight, bitrate: Number(v.VBitrate || 2500), audioBitrate: String(v.ABitrate || '160'), encoder: v.StreamEncoder || 'x264', editable: settings.mode === 'Simple', live: !!engineState().streaming, state: engineState().streaming ? 'live' : 'idle', error: '' };
    }
    const d = outputs.destinations[n - 1];
    return { url: d.server || '', hasKey: !!d.hasKey, width: d.width, height: d.height, bitrate: Number(d.bitrate), audioBitrate: null, encoder: d.encoder || 'obs_x264', editable: true, live: !!d.active, state: d.active ? 'live' : d.state || 'idle', error: d.error || '', raw: d };
  }
  const current = (n) => ({ ...saved(n), ...(drafts[n] || {}) });
  const dirty = (n) => !!drafts[n] && Object.keys(drafts[n]).length > 0;
  const edit = (n, change) => { const base = saved(n), next = { ...(drafts[n] || {}), ...change }; for (const k of Object.keys(next)) if (k !== 'key' && String(next[k]) === String(base[k])) delete next[k]; if (next.key === '') delete next.key; drafts[n] = Object.keys(next).length ? next : null; };
  const providerOf = (url) => PROVIDERS.find((p) => p.url && url.replace(/\/+$/, '') === p.url.replace(/\/+$/, '')) || PROVIDERS[0];
  const codecOf = (n, id) => ((n === 0 ? mainEncoders() : extraEncoders()).find((e) => e.id === id)?.codec || 'h264').toUpperCase().replace('H264', 'H264');
  const qualityLabel = (n, c) => `${codecOf(n, c.encoder)} ${c.height}p ${mbps(c.bitrate)}` + (c.audioBitrate ? ` AAC ${c.audioBitrate}kbps` : '');
  const sameAsMain = (c) => { const m = current(0), list = extraEncoders(), twin = list.find((e) => HARDWARE.test(e.id) === HARDWARE.test(m.encoder) && e.codec === codecOf(0, m.encoder).toLowerCase()); return c.width === m.width && c.height === m.height && c.bitrate === m.bitrate && (!twin || c.encoder === twin.id); };

  // ---- drawing ----
  function draw() {
    if (!loaded) return;
    const n = selected, c = current(n), locked = !c.editable || busy;
    for (const b of E('nums').children) { const i = Number(b.dataset.n), s = saved(i); b.classList.toggle('vd-on', i === n); b.classList.toggle('vd-live', s.live); b.setAttribute('aria-selected', i === n); b.title = s.live ? 'No ar' : s.url ? 'Configurado' : 'Livre'; }
    const provider = providerOf(c.url), active = document.activeElement;
    fill(E('provider'), PROVIDERS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('')); if (E('provider').value !== provider.id) E('provider').value = provider.id;
    if (active !== E('url')) E('url').value = c.url;
    if (active !== E('key')) E('key').value = drafts[n]?.key || '';
    E('key').placeholder = c.hasKey ? 'Chave salva — deixe em branco para manter' : '';
    // Quality: the presets that fit, plus the current values when they are not a preset.
    const presets = PRESETS.filter((p) => n !== 0 || p[0] === c.height).map((p) => ({ width: n === 0 ? c.width : p[1], height: p[0], bitrate: p[2], audioBitrate: n === 0 ? String(p[3]) : null }));
    const match = presets.findIndex((p) => p.height === c.height && p.width === c.width && p.bitrate === c.bitrate && (n !== 0 || p.audioBitrate === c.audioBitrate));
    fill(E('quality'), presets.map((p, i) => `<option value="${i}"${i === match ? ' selected' : ''}>${esc(qualityLabel(n, { ...p, encoder: c.encoder }))}</option>`).join('') + (match < 0 ? `<option value="-1" selected>${esc(qualityLabel(n, c))} (personalizada)</option>` : ''));
    E('quality').dataset.presets = JSON.stringify(presets);
    E('custom-size').hidden = n === 0; E('custom-audio').hidden = n !== 0;
    for (const [id, value] of [['width', c.width], ['height', c.height], ['bitrate', c.bitrate]]) if (active !== E(id)) E(id).value = value;
    if (c.audioBitrate) E('audio-bitrate').value = c.audioBitrate;
    const encoders = n === 0 ? mainEncoders() : extraEncoders();
    fill(E('encoder'), encoders.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')); if (E('encoder').value !== c.encoder) E('encoder').value = c.encoder;
    E('hardware').checked = HARDWARE.test(c.encoder); E('hardware').disabled = c.live || locked || !encoders.some((e) => HARDWARE.test(e.id));
    E('same-row').hidden = n === 0; const same = n !== 0 && sameAsMain(c); E('same').checked = same;
    for (const id of ['provider', 'url', 'quality', 'quality-cog', 'encoder', 'same']) E(id).disabled = c.live || locked;
    E('key').disabled = locked || (c.live && n > 0);
    for (const id of ['width', 'height', 'bitrate', 'audio-bitrate']) E(id).disabled = c.live || locked || same;
    if (same) for (const id of ['quality', 'encoder', 'hardware', 'quality-cog']) E(id).disabled = true;
    // Bottom bar
    const lives = [0, 1, 2, 3, 4].filter((i) => saved(i).live);
    E('start-one').textContent = (c.live ? 'Parar ' : 'Começar ') + (n + 1); E('start-one').classList.toggle('vd-air', c.live); E('start-one').disabled = busy || (!c.live && !c.url);
    E('start-all').textContent = lives.length ? 'Parar tudo' : 'Iniciar tudo'; E('start-all').classList.toggle('vd-air', lives.length > 0); E('start-all').disabled = busy || (!lives.length && ![0, 1, 2, 3, 4].some((i) => current(i).url));
    E('save-close').disabled = busy; E('advanced').disabled = busy;
    if (!E('msg').textContent || E('msg').dataset.auto) { const text = c.live ? (n === 0 ? 'Destino 1 no ar: só a chave pode ser alterada; ela vale no próximo início.' : `Destino ${n + 1} no ar: pare para alterar.`) : !c.editable ? 'O perfil do motor está em modo avançado: use “Avançado” para alterar o destino 1.' : c.error ? 'Motor: ' + c.error : dirty(n) ? 'Alterações ainda não salvas.' : ''; say(text, c.error && !c.live ? 'error' : ''); E('msg').dataset.auto = '1'; }
    if (!E('status').hidden) drawStatus();
  }
  function drawStatus() {
    const s = engineState();
    E('status-rows').innerHTML = [0, 1, 2, 3, 4].map((i) => { const c = current(i), v = saved(i); const state = v.live ? `<span class="vd-air-text">NO AR</span>${i === 0 && s.streamTimecode ? ' <span class="vd-mono">' + esc(String(s.streamTimecode).split('.')[0]) + '</span>' : ''}` : v.state === 'starting' ? 'Iniciando…' : v.state === 'stopping' ? 'Parando…' : v.error ? '<span class="vd-air-text">' + esc(v.error) + '</span>' : v.url ? 'Parado' : 'Livre'; return `<tr class="${i === selected ? 'vd-sel' : ''}"><td>${i + 1}</td><td>${esc(c.url ? providerOf(c.url).label : '—')}</td><td class="vd-url" title="${esc(c.url)}">${esc(c.url || '—')}</td><td>${c.url ? esc(qualityLabel(i, c)) : '—'}</td><td>${state}</td></tr>`; }).join('');
  }
  const note = (text, kind) => { delete E('msg').dataset.auto; say(text, kind); };

  // ---- reading ----
  async function load() { const [s, o] = await Promise.all([getJson('/api/settings'), getJson('/api/outputs')]); settings = s.settings; outputs = o.outputs; if (!Array.isArray(outputs?.destinations) || outputs.destinations.length !== 4 || !settings?.values) throw Error('Resposta incompleta do motor'); loaded = true; }
  async function refresh() { if (busy || document.hidden) return; try { const o = await getJson('/api/outputs'); outputs = o.outputs; draw(); } catch { /* the connection text of the header already says so */ } }

  // ---- saving ----
  const protocolOf = (url, fallback) => (/^rtmps:/i.test(url) ? 'rtmps' : /^rtmp:/i.test(url) ? 'rtmp' : /^srt:/i.test(url) ? 'srt' : /^rist:/i.test(url) ? 'rist' : /^https?:/i.test(url) ? 'hls' : fallback);
  async function save(n) {
    if (!dirty(n)) return false;
    const c = current(n), key = drafts[n].key;
    // An empty URL frees an additional destination; the main stream always needs one.
    if (!c.url && n === 0) throw Error('Destino 1: informe a URL.');
    if (c.url && !/^(rtmps?|srt|rist|https?):\/\/\S+$/i.test(c.url)) throw Error(`Destino ${n + 1}: a URL deve começar por rtmp://, rtmps://, srt://, rist:// ou http(s)://`);
    if (n === 0) {
      const keyOnly = Object.keys(drafts[0]).every((k) => k === 'key');
      const r = keyOnly
        ? await send('settings_stream_key', { category: 'streaming', key })
        : await send('settings_apply', { category: 'streaming', protocol: protocolOf(c.url, 'rtmp'), server: c.url, bitrate: Number(c.bitrate), audioBitrate: String(c.audioBitrate), encoder: c.encoder, ...(key ? { key } : {}) });
      if (!r.settings?.values) throw Error('Resposta incompleta do motor ao salvar o destino 1'); settings = r.settings;
      drafts[n] = null;
      return keyOnly ? 'key' : true;
    } else {
      const d = c.raw, mode = ['source', 'program', 'preview', 'clean', 'mix'].includes(d.mode) ? d.mode : 'program', hls = /^https?:/i.test(c.url);
      await send('outputs_configure', { index: n - 1, name: d.name || providerOf(c.url).label.replace('Servidor RTMP personalizado', 'Destino ' + (n + 1)), server: c.url, protocol: hls ? 'hls' : d.protocol === 'hls' ? 'auto' : d.protocol || 'auto', mode, ...(mode === 'source' ? { input: d.sourceUuid } : {}), mixId: d.mixId ?? 2, width: Number(c.width), height: Number(c.height), bitrate: Number(c.bitrate), audioTrack: d.audioTrack ?? 0, audioSourceUuid: d.audioSourceUuid || '', encoder: c.encoder, fpsDivisor: d.fpsDivisor ?? 1, overlaysMask: d.overlaysMask ?? 0, fill: d.fill === true, stingerAudio: d.stingerAudio !== false, enhancedRtmp: d.enhancedRtmp === true, enabled: !!c.url, autoStart: !!c.url && d.autoStart === true, ...(key ? { key } : !c.url ? { clearKey: true } : {}) });
      outputs = (await getJson('/api/outputs')).outputs;
    }
    drafts[n] = null; return true;
  }
  // The engine's own wording for "the stream did not come up" says nothing to an operator.
  const plain = (text) => (/não confirmou Get(Stream|Record)Status/i.test(text) ? 'O destino 1 não entrou no ar: o servidor não aceitou a conexão. Confira a URL e a chave.' : text);
  async function run(label, task) { if (busy) return; busy = true; note(label + '…'); draw(); try { const done = await task(); note(done || 'Confirmado pelo motor.', 'ok'); } catch (e) { note(plain(e.message), 'error'); } finally { busy = false; try { outputs = (await getJson('/api/outputs')).outputs; } catch {} draw(); } }
  async function toggle(n, on) {
    if (on) { await save(n); if (!saved(n).url) throw Error(`Destino ${n + 1}: informe a URL antes de começar.`); }
    if (n === 0) await send('stream', { active: on }); else await send(on ? 'outputs_start' : 'outputs_stop', { index: n - 1 });
  }

  // ---- events ----
  E('nums').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; selected = Number(b.dataset.n); E('msg').dataset.auto = '1'; say(''); draw(); };
  E('provider').onchange = (e) => { const p = PROVIDERS.find((x) => x.id === e.target.value); if (p.url) edit(selected, { url: p.url }); draw(); if (!p.url) E('url').focus(); };
  E('url').oninput = (e) => { edit(selected, { url: e.target.value.trim() }); draw(); };
  E('key').oninput = (e) => { edit(selected, { key: e.target.value }); draw(); };
  E('quality').onchange = (e) => { const p = JSON.parse(e.target.dataset.presets)[Number(e.target.value)]; if (p) edit(selected, selected === 0 ? { bitrate: p.bitrate, audioBitrate: p.audioBitrate } : { width: p.width, height: p.height, bitrate: p.bitrate }); draw(); };
  E('quality-cog').onclick = () => { E('custom').hidden = !E('custom').hidden; E('quality-cog').classList.toggle('vd-on', !E('custom').hidden); };
  for (const id of ['width', 'height', 'bitrate']) E(id).onchange = (e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v > 0) edit(selected, { [id]: v }); draw(); };
  E('audio-bitrate').onchange = (e) => { edit(selected, { audioBitrate: e.target.value }); draw(); };
  E('encoder').onchange = (e) => { edit(selected, { encoder: e.target.value }); draw(); };
  E('hardware').onchange = (e) => { const list = selected === 0 ? mainEncoders() : extraEncoders(), codec = codecOf(selected, current(selected).encoder).toLowerCase(), pool = list.filter((x) => HARDWARE.test(x.id) === e.target.checked), pick = pool.find((x) => x.codec === codec) || pool[0]; if (pick) edit(selected, { encoder: pick.id }); draw(); };
  E('same').onchange = (e) => { if (e.target.checked) { const m = current(0), list = extraEncoders(), twin = list.find((x) => HARDWARE.test(x.id) === HARDWARE.test(m.encoder) && x.codec === codecOf(0, m.encoder).toLowerCase()); edit(selected, { width: m.width, height: m.height, bitrate: m.bitrate, ...(twin ? { encoder: twin.id } : {}) }); } draw(); };
  E('advanced').onclick = () => { if ([0, 1, 2, 3, 4].some(dirty) && !confirm('Há alterações não salvas nesta janela. Abrir o editor avançado mesmo assim?')) return; location.href = selected === 0 ? '/configuracoes?category=streaming&context=streaming' : '/saidas?context=streaming'; };
  E('view-status').onclick = () => { E('status').hidden = !E('status').hidden; E('view-status').classList.toggle('vd-on', !E('status').hidden); document.querySelector('.vd-window').classList.toggle('vd-with-status', !E('status').hidden); draw(); };
  E('start-one').onclick = () => { const n = selected, on = !saved(n).live; run((on ? 'Começando ' : 'Parando ') + (n + 1), async () => { await toggle(n, on); return on ? `Destino ${n + 1} confirmado no ar pelo motor.` : `Destino ${n + 1} parado.`; }); };
  E('start-all').onclick = () => { const lives = [0, 1, 2, 3, 4].filter((i) => saved(i).live); run(lives.length ? 'Parando tudo' : 'Iniciando tudo', async () => { const failed = []; for (const i of lives.length ? lives : [0, 1, 2, 3, 4].filter((x) => current(x).url)) { try { await toggle(i, !lives.length); } catch (e) { failed.push(`${i + 1}: ${plain(e.message).replace(/^O destino 1 /, '')}`); } } if (failed.length) throw Error('Não confirmado — ' + failed.join(' · ')); return lives.length ? 'Todos os destinos parados.' : 'Destinos configurados confirmados no ar.'; }); };
  E('save-close').onclick = () => run('Salvando', async () => { let keyOnly = false; for (const i of [0, 1, 2, 3, 4]) { const r = await save(i); if (r === 'key') keyOnly = true; } setTimeout(() => window.FreeMixClosePanel(), 150); return keyOnly ? 'Chave salva; vale no próximo início da transmissão.' : 'Configurações salvas e confirmadas pelo motor.'; });

  // The main stream's state arrives with the shared connection; the additional destinations are re-read (a pure read).
  let lastStreaming = null;
  setInterval(() => { const s = !!engineState().streaming; if (loaded && (s !== lastStreaming || !E('status').hidden)) { lastStreaming = s; draw(); } }, 500);
  setInterval(refresh, 2000);
  (async function start() { for (;;) { try { await load(); break; } catch (e) { say(e.message + ' Tentando de novo…', 'error'); await new Promise((r) => setTimeout(r, 1500)); } } say(''); E('msg').dataset.auto = '1'; draw(); })();
})();
