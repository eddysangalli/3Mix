// Recording setup window. Every value shown is read from the engine; Aplicar sends one real command and closes only
// after the engine confirms. While a recording is running, or when the profile is in advanced output mode, nothing can
// be changed here: the window explains why instead of offering a control that would fail.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id), esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
  const HARDWARE = /nvenc|qsv|amf|vce|videotoolbox/i;
  const FORMAT_TEXT = {
    mkv: 'MKV: tolerante a falhas por natureza — o arquivo continua abrindo mesmo se o programa cair.',
    mp4: 'MP4 comum: uma queda no meio pode inutilizar o arquivo.',
    mov: 'MOV comum: uma queda no meio pode inutilizar o arquivo.',
    flv: 'FLV: tolerante a falhas, com uma única trilha de áudio.',
    ts: 'MPEG-TS: tolerante a falhas.',
    mpegts: 'MPEG-TS: tolerante a falhas.',
    hls: 'HLS: grava em segmentos; use para publicar, não para arquivo final.',
  };
  const split = (format) => { const m = /^(fragmented|hybrid)_(.+)$/.exec(format); return m ? { container: m[2], variant: m[1] } : { container: format, variant: '' }; };
  const join = (container, variant) => (variant ? variant + '_' + container : container);
  const GB = (kb) => Number.isFinite(kb) ? (kb / 1024).toFixed(1).replace('.', ',') + ' GB' : '—';

  let settings = null, preset = '', busy = false, draft = null;

  const say = (text, kind = '') => { const box = E('msg'); box.textContent = text; box.className = 'vd-msg' + (kind ? ' vd-' + kind : ''); };
  const note = (text, kind) => { delete E('msg').dataset.auto; say(text, kind); };
  const getJson = async (url) => { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'O programa não respondeu à consulta'); return v; };
  const send = async (action, data = {}) => { const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(30000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'Operação recusada pelo programa'); return v; };
  const engineState = () => window.FreeMixRemote?.getState?.() || {};

  const formats = () => settings?.capabilities?.recordingFormats || [];
  const encoders = () => (settings?.capabilities?.simpleEncoders || []).map((e) => ({ id: e.id, name: e.label || e.id, codec: e.codec || 'h264', hardware: HARDWARE.test(e.id) }));
  const saved = () => ({ directory: settings.recordDirectory || '', format: settings.values?.RecFormat2 || 'mkv', quality: settings.values?.RecQuality || 'Small', encoder: settings.values?.RecEncoder || 'x264' });
  const current = () => ({ ...saved(), ...(draft || {}) });
  const dirty = () => !!draft && Object.keys(draft).length > 0;
  function edit(change) { const base = saved(), next = { ...(draft || {}), ...change }; for (const k of Object.keys(next)) if (String(next[k]) === String(base[k])) delete next[k]; draft = Object.keys(next).length ? next : null; }
  const tolerantFormat = (container) => [join(container, 'hybrid'), join(container, 'fragmented')].find((f) => formats().includes(f));
  const nativeField = (category, name) => (settings?.nativePreferences?.fields || []).find((f) => f.category === category && f.name === name);
  const nativeValue = (category, name, fallback = '') => nativeField(category, name)?.value ?? fallback;
  const trackNames = () => [1, 2, 3, 4, 5, 6].map((n) => String(nativeValue('audioTracks', 'track' + n + 'Name', '')).trim() || ('Trilha ' + n));

  function drawFacts() {
    const c = current(), v = settings.video || {}, s = settings.stats || {};
    E('size').textContent = `${v.outputWidth} × ${v.outputHeight}`;
    E('fps').textContent = v.fpsDenominator > 1 ? (v.fpsNumerator / v.fpsDenominator).toFixed(2).replace('.', ',') + ' fps' : v.fpsNumerator + ' fps';
    E('free').textContent = GB(s.availableDiskSpace);
    E('space').textContent = 'Espaço livre: ' + GB(s.availableDiskSpace);
    E('mode-name').textContent = settings.mode === 'Advanced' ? 'avançado' : 'simples';

    const mask = Number(nativeValue('outputAdvanced', 'recordTracks', 1));
    const picked = trackNames().filter((_, i) => Number.isFinite(mask) && (mask & (1 << i)));
    E('tracks-summary').textContent = picked.length ? picked.join(', ') : 'nenhuma';
    E('tracks-list').textContent = picked.length
      ? 'A gravação leva ' + (picked.length === 1 ? 'a trilha ' : 'as trilhas ') + picked.join(', ') + ' (máscara ' + (Number.isFinite(mask) ? mask : '—') + ').'
      : 'Este perfil não marcou nenhuma trilha de áudio para a gravação.';

    const on = nativeValue('outputAdvanced', 'recordSplit', false) === true || nativeValue('outputAdvanced', 'recordSplit', 'false') === 'true';
    const type = String(nativeValue('outputAdvanced', 'recordSplitType', 'Time'));
    const minutes = nativeValue('outputAdvanced', 'recordSplitMinutes', 15), megabytes = nativeValue('outputAdvanced', 'recordSplitMegabytes', 2048);
    E('split-summary').textContent = !on ? 'Sem divisão: um arquivo por gravação.'
      : 'Divide o arquivo: ' + (type === 'Size' ? 'a cada ' + megabytes + ' MB' : type === 'Manual' ? 'manualmente, pelo controle do motor' : 'a cada ' + minutes + ' min') + '.';
    const pattern = nativeValue('files', 'filenamePattern', '');
    const overwrite = nativeValue('files', 'overwriteFiles', false), remux = nativeValue('files', 'autoRemux', false);
    E('name-summary').textContent = 'Nome: ' + (pattern || 'padrão do motor') + ' · ' + (overwrite === true || overwrite === 'true' ? 'sobrescreve arquivos iguais' : 'não sobrescreve') + ' · ' + (remux === true || remux === 'true' ? 'remux automático para MP4' : 'sem remux automático') + '.';
    E('profile-note').textContent = settings.mode === 'Advanced'
      ? 'Perfil em modo avançado: pasta, formato, trilhas e divisão são definidos em Saída avançada. Esta janela não altera o perfil.'
      : 'Perfil em modo simples: esta janela define pasta, formato, qualidade e encoder da gravação principal.';

    // Disk estimate only from real parameters: bitrate of the transmission and the free space the engine reports.
    const vKbps = Number(settings.values?.VBitrate), aKbps = Number(settings.values?.ABitrate);
    const freeMb = Number(s.availableDiskSpace);
    const mins = (kbps) => kbps > 0 ? kbps * 60 / 8 / 1024 : NaN;
    const span = (m) => !Number.isFinite(m) || m <= 0 ? '—' : m >= 120 ? (m / 60).toFixed(m / 60 >= 10 ? 0 : 1).replace('.', ',') + ' h' : Math.round(m) + ' min';
    if (c.quality === 'Stream' && vKbps > 0) {
      const perMin = mins(vKbps + (Number.isFinite(aKbps) && aKbps > 0 ? aKbps : 0));
      E('estimate').textContent = '≈ ' + perMin.toFixed(1).replace('.', ',') + ' MB/min' + (Number.isFinite(freeMb) && freeMb > 0 ? ' · cabem ≈ ' + span(freeMb / perMin) : '');
      E('estimate-help').textContent = 'Calculado com o bitrate real da transmissão (' + vKbps + ' kbps de vídeo' + (aKbps > 0 ? ' + ' + aKbps + ' kbps de áudio' : '') + ') e o espaço livre informado pelo motor. O tamanho final varia com o conteúdo.';
    } else {
      E('estimate').textContent = '—';
      E('estimate-help').textContent = 'O motor não expõe um bitrate fixo para esta qualidade; o tamanho varia com o encoder e a cena. O espaço livre acima é o real.';
    }

    if (c.quality === 'Stream') {
      const streamEnc = settings.values?.StreamEncoder || '';
      const sameEnc = c.encoder === streamEnc;
      const encName = (id) => encoders().find((e) => e.id === id)?.name || id;
      E('quality-help').textContent = 'Parâmetros efetivos da transmissão: ' + (vKbps > 0 ? vKbps + ' kbps de vídeo' : 'bitrate não informado') + (aKbps > 0 ? ' + ' + aKbps + ' kbps de áudio' : '') + '. '
        + (sameEnc ? 'Reutiliza o mesmo encoder da transmissão (' + encName(streamEnc) + ').' : 'Reutiliza só as configurações: esta gravação usa ' + encName(c.encoder) + ', não o encoder da transmissão (' + encName(streamEnc) + ').')
        + (E('estimate').textContent !== '—' ? ' Estimativa: ' + E('estimate').textContent + '.' : '');
    } else if (c.quality === 'Lossless') E('quality-help').textContent = 'Sem perdas: arquivo muito grande e sem recompressão visível. O encoder precisa suportar o modo sem perdas.';
    else E('quality-help').textContent = 'A qualidade ajusta o bitrate do encoder escolhido. Arquivos maiores preservam mais detalhe.';
  }

  function drawAdvancedPanel() {
    const c = current(), now = split(c.format);
    E('format-help').textContent = now.container === 'mkv' ? FORMAT_TEXT.mkv
      : now.variant === 'hybrid' ? 'MP4/MOV híbrido: grava de forma recuperável e finaliza no contêiner pedido.'
      : now.variant === 'fragmented' ? 'MP4/MOV fragmentado: o arquivo continua válido se a gravação for interrompida.'
      : (FORMAT_TEXT[now.container] || 'Contêiner escolhido no perfil do motor.');
    const tolerant = !!now.variant;
    E('tolerant-row').hidden = now.container === 'mkv';
    E('tolerant').checked = tolerant;
    E('tolerant').disabled = busy || !!engineState().recording || settings.mode === 'Advanced' || !tolerantFormat(now.container);
    E('tolerant-help').textContent = now.container === 'mkv'
      ? 'MKV já é tolerante a falhas: o arquivo continua abrindo se o programa ou o computador cair.'
      : tolerant ? 'Tolerância ligada: o arquivo em ' + now.container.toUpperCase() + ' é escrito de forma recuperável e fecha corretamente ao parar.'
      : 'Tolerância desligada: uma queda no meio da gravação pode deixar o arquivo ' + now.container.toUpperCase() + ' inutilizável.';
    const list = encoders(), chosen = list.find((e) => e.id === c.encoder);
    E('encoder-help').textContent = chosen
      ? (chosen.hardware ? 'Encoder de placa de vídeo: usa a GPU e libera o processador.' : 'Encoder por processador: usa a CPU e não depende de driver de vídeo.') + ' A lista mostra o que esta instalação realmente oferece.'
      : 'O encoder salvo (' + c.encoder + ') não está disponível nesta instalação. Escolha outro antes de aplicar.';
  }

  function draw() {
    if (!settings) return;
    const c = current(), now = split(c.format), recording = !!engineState().recording, advancedProfile = settings.mode === 'Advanced', locked = busy || recording || advancedProfile, active = document.activeElement;
    const containers = [...new Set(formats().map((f) => split(f).container))];
    fill(E('formats'), containers.map((x) => `<button data-container="${esc(x)}" role="tab"${x === now.container ? ' class="vd-on" aria-selected="true"' : ''}${locked ? ' disabled' : ''}>${esc(x.toUpperCase())}</button>`).join(''));
    if (active !== E('directory')) E('directory').value = c.directory;
    const list = encoders();
    fill(E('encoder'), list.map((e) => `<option value="${esc(e.id)}">${esc(e.name)} · ${e.hardware ? 'GPU' : 'CPU'}</option>`).join('') + (list.some((e) => e.id === c.encoder) ? '' : `<option value="${esc(c.encoder)}" disabled>${esc(c.encoder)} · indisponível neste computador</option>`));
    if (E('encoder').value !== c.encoder) E('encoder').value = c.encoder;
    if (E('quality').value !== c.quality) E('quality').value = c.quality;
    for (const id of ['directory', 'encoder', 'quality']) E(id).disabled = locked;
    E('browse').disabled = locked;
    E('advanced').disabled = busy;
    E('ok').disabled = locked; E('cancel').disabled = busy;
    E('rec-state').innerHTML = recording ? '<span class="rec-live-dot"></span> Gravando' + (engineState().recordTimecode ? ' ' + String(engineState().recordTimecode).split('.')[0] : '') : advancedProfile ? 'Perfil em modo avançado' : 'Pronta para gravar';
    drawFacts();
    drawAdvancedPanel();
    const savedEncoder = list.find((e) => e.id === saved().encoder);
    E('foot-note').textContent = recording ? 'Gravação em andamento: pare para alterar.'
      : advancedProfile ? 'Perfil em modo avançado: use o editor completo.'
      : dirty() ? 'Alterações ainda não aplicadas.' + (savedEncoder && savedEncoder.hardware !== (list.find((e) => e.id === c.encoder)?.hardware ?? savedEncoder.hardware) ? ' O encoder escolhido muda entre GPU e CPU.' : '')
      : 'Aplicar confirma a pasta e o formato no motor e fecha esta janela.';
    if (!E('msg').textContent || E('msg').dataset.auto) {
      const text = recording ? 'Gravando' + (engineState().recordTimecode ? ' ' + String(engineState().recordTimecode).split('.')[0] : '') + ': pare a gravação para alterar.'
        : advancedProfile ? 'O perfil do programa está em modo avançado: use o editor completo para alterar a gravação.'
        : dirty() ? 'Alterações ainda não salvas.' : '';
      say(text, recording ? 'error' : ''); E('msg').dataset.auto = '1';
    }
  }

  async function load() {
    const r = await getJson('/api/settings');
    if (!r.settings?.values || !Array.isArray(r.settings.capabilities?.recordingFormats)) throw Error('Resposta incompleta do programa');
    settings = r.settings; preset = r.preset || '';
  }
  async function save() {
    const c = current(), directory = c.directory.trim();
    if (!directory) { E('directory').focus(); throw Error('Informe a pasta de gravação.'); }
    if (engineState().recording) throw Error('Há uma gravação em andamento: pare antes de alterar.');
    const fresh = await getJson('/api/settings');
    if ((fresh.preset || '') !== preset) throw Error('O projeto mudou enquanto esta janela estava aberta. Feche e abra de novo.');
    if (fresh.settings?.mode === 'Advanced') { settings = fresh.settings; throw Error('O perfil do programa está em modo avançado: use o editor completo.'); }
    const r = await send('settings_apply', { category: 'recording', directory, format: c.format, quality: c.quality, encoder: c.encoder });
    settings = r.settings?.values ? r.settings : (await getJson('/api/settings')).settings;
    draft = null;
  }
  const close = () => window.FreeMixClosePanel?.();
  const openSettings = (category) => { location.href = '/configuracoes?category=' + encodeURIComponent(category) + '&context=recording'; };

  E('formats').onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; const now = split(current().format), container = b.dataset.container; edit({ format: now.variant && formats().includes(join(container, now.variant)) ? join(container, now.variant) : container }); E('msg').dataset.auto = '1'; draw(); };
  E('directory').oninput = (e) => { edit({ directory: e.target.value }); E('msg').dataset.auto = '1'; draw(); };
  E('encoder').onchange = (e) => { edit({ encoder: e.target.value }); E('msg').dataset.auto = '1'; draw(); };
  E('quality').onchange = (e) => { edit({ quality: e.target.value }); E('msg').dataset.auto = '1'; draw(); };
  E('tolerant').onchange = (e) => { const container = split(current().format).container; edit({ format: e.target.checked ? tolerantFormat(container) || container : container }); E('msg').dataset.auto = '1'; draw(); };
  E('browse').onclick = () => { E('folder-picker').value = ''; E('folder-picker').click(); };
  E('folder-picker').onchange = () => {
    const file = E('folder-picker').files?.[0];
    if (!file) return;
    const absolute = file.path || '';
    const folder = absolute ? absolute.replace(/[\\/][^\\/]+$/, '') : '';
    if (!folder) { note('O seletor não devolveu o caminho completo nesta janela. Cole o caminho da pasta no campo.', 'error'); return; }
    edit({ directory: folder });
    note('Pasta escolhida: ' + folder + '. Confira o espaço livre antes de aplicar.', 'ok');
    draw();
  };
  E('advanced').onclick = () => { if (dirty() && !confirm('Há alterações não salvas nesta janela. Abrir o editor completo mesmo assim?')) return; location.href = '/configuracoes?category=recording&context=recording'; };
  E('cancel').onclick = close;
  E('ok').onclick = async () => {
    if (busy) return;
    if (!dirty()) { close(); return; }
    busy = true; note('Salvando…'); draw();
    try { await save(); note('Gravação configurada e confirmada pelo programa.', 'ok'); setTimeout(close, 200); }
    catch (e) { note(e.message, 'error'); }
    finally { busy = false; draw(); }
  };
  E('content')?.addEventListener('click', () => {});
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-settings]'); if (b) openSettings(b.dataset.settings); });

  let last = null;
  setInterval(() => {
    const s = engineState(), sign = (s.recording ? 'r' + String(s.recordTimecode).split('.')[0] : '') + '|' + String(settings?.mode || '') + '|' + String(settings?.stats?.availableDiskSpace ?? '');
    if (settings && sign !== last) { last = sign; draw(); }
  }, 500);
  (async function start() {
    for (;;) { try { await load(); break; } catch (e) { say(e.message + ' Tentando de novo…', 'error'); await new Promise((r) => setTimeout(r, 1500)); } }
    say(''); E('msg').dataset.auto = '1'; draw();
  })();
})();
