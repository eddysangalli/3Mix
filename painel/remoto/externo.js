// Saídas externas (NDI e OMT). Cada vaga 1–4 mostra nome, fontes e os parâmetros do protocolo escolhido; começar e
// parar são ações explícitas. Salvar configuração apenas guarda o rascunho neste computador — nunca inicia uma saída.
(() => {
  'use strict';

  const E = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
  const pick = (el, value) => { if (el && el.value !== String(value ?? '')) el.value = String(value ?? ''); };

  const STORAGE_KEY = 'freemix.outputs.drafts:' + location.host;

  let outputs = null, settings = null, selectedSlot = 0, selectedProtocol = 'NDI', loaded = false, busy = false;
  const drafts = new Map();

  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (raw) for (const [k, v] of JSON.parse(raw)) if (/^(NDI|OMT):[0-3]$/.test(k) && v && typeof v === 'object') drafts.set(k, v.values || v);
  } catch { /* storage off */ }
  const persistDrafts = () => {
    try { const text = JSON.stringify([...drafts]); localStorage.setItem(STORAGE_KEY, text); sessionStorage.setItem(STORAGE_KEY, text); } catch { /* storage off */ }
  };

  const say = (text, kind = '') => { const box = E('msg'); box.textContent = text; box.className = 'vd-msg' + (kind ? ' vd-' + kind : ''); };
  const note = (text, kind) => { delete E('msg').dataset.auto; say(text, kind); };
  const getJson = async (url) => { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'O motor não respondeu à consulta'); return v; };
  const send = async (action, data = {}) => { const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(60000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'Operação recusada pelo motor'); return v; };
  const engineState = () => window.FreeMixRemote?.getState?.() || {};

  const capOf = (proto) => outputs?.[proto.toLowerCase()] || {};
  const defaultName = (proto, slot) => '3Mix ' + proto + ' ' + (slot + 1);
  const isLegacyDefault = (name) => /^FreeMix\s+(NDI|OMT)\s+\d+$/i.test(String(name || '').trim());
  const nativeSender = (proto, slot) => {
    const c = capOf(proto), list = c.senders || [], found = list.find((s) => s.senderId === slot);
    return found || (slot === 0 && list.length === 0 ? c : null) || {};
  };

  function saved(proto, slot) {
    const n = nativeSender(proto, slot);
    const rawName = String(n.networkName || '').trim();
    const name = rawName && !isLegacyDefault(rawName) ? rawName : defaultName(proto, slot);
    const isLive = Boolean(n.active ?? n.outputActive);
    return {
      mode: n.mode || 'program',
      input: n.sourceUuid || '',
      audio: n.audioSourceUuid ? 'bus:' + n.audioSourceUuid : String(n.audioTrack ?? 0),
      alpha: !!n.alpha,
      fillKey: !!n.fillKey,
      precision: proto === 'NDI' ? '8' : n.precisionBits !== undefined ? String(n.precisionBits) : '8',
      keyName: n.keyName || '',
      name,
      customName: !!rawName && !isLegacyDefault(rawName),
      groups: n.groups || '',
      live: isLive,
      connections: n.connections ?? -1,
      capturedFrames: n.capturedFrames || 0,
      error: n.error || '',
      configured: isLive || (!!rawName && !isLegacyDefault(rawName)) || n.mode === 'source' || !!(n.groups || '') || !!n.alpha || !!n.fillKey,
    };
  }

  const keyOf = (proto, slot) => proto + ':' + slot;
  const current = (proto, slot) => ({ ...saved(proto, slot), ...(drafts.get(keyOf(proto, slot)) || {}) });
  const isDirty = (proto, slot) => drafts.has(keyOf(proto, slot)) && Object.keys(drafts.get(keyOf(proto, slot))).length > 0;
  function edit(proto, slot, change) {
    const base = saved(proto, slot), k = keyOf(proto, slot), next = { ...(drafts.get(k) || {}), ...change };
    for (const prop of Object.keys(next)) if (String(next[prop]) === String(base[prop])) delete next[prop];
    if (Object.keys(next).length) drafts.set(k, next); else drafts.delete(k);
    persistDrafts();
  }
  const videoName = (uuid) => {
    if (!uuid || uuid === 'program') return 'Programa';
    const inp = (engineState().inputs || []).find((i) => i.key === uuid);
    return inp ? (inp.number ? inp.number + '. ' : '') + inp.name : 'Entrada indisponível';
  };
  const stateText = (proto, slot, s) => 'Saída ' + (slot + 1) + ' · ' + proto + ' · '
    + (s.live ? 'No ar' : s.error ? 'Erro' : 'Parada');

  function draw() {
    if (!loaded) return;
    const ndiAvail = Boolean(capOf('NDI').available), omtAvail = Boolean(capOf('OMT').available);
    if (selectedProtocol === 'NDI' && !ndiAvail && omtAvail) selectedProtocol = 'OMT';
    if (selectedProtocol === 'OMT' && !omtAvail && ndiAvail) selectedProtocol = 'NDI';
    const p = selectedProtocol, n = selectedSlot, c = current(p, n), s = saved(p, n), locked = s.live || busy;

    for (const b of E('nums').children) {
      const i = Number(b.dataset.n), slotSaved = saved(p, i), other = saved(p === 'NDI' ? 'OMT' : 'NDI', i);
      b.classList.toggle('vd-on', i === n);
      b.classList.toggle('vd-live', slotSaved.live || other.live);
      b.setAttribute('aria-selected', String(i === n));
      b.disabled = busy;
      b.title = slotSaved.live ? 'No ar' : slotSaved.configured ? 'Configurada' : 'Livre';
    }

    E('type-ndi').classList.toggle('vd-on', p === 'NDI'); E('type-ndi').disabled = !ndiAvail || busy;
    E('type-omt').classList.toggle('vd-on', p === 'OMT'); E('type-omt').disabled = !omtAvail || busy;
    E('type-srt').disabled = busy;

    const inputs = engineState().inputs || [];
    const videoOptions = ['<option value="program">Programa (saída)</option>'].concat(inputs.map((i) => `<option value="${esc(i.key)}">${esc(i.number ? i.number + '. ' : '')}${esc(i.name)}</option>`));
    if (c.mode === 'source' && c.input && !inputs.some((i) => i.key === c.input)) videoOptions.push(`<option value="${esc(c.input)}" disabled>Entrada indisponível · reconfigure</option>`);
    fill(E('video-source'), videoOptions.join(''));
    pick(E('video-source'), c.mode === 'source' && c.input ? c.input : 'program');
    E('video-source').disabled = locked;

    const audioSources = outputs?.audioSources || [];
    const audioOptions = ['<option value="0">Master</option>', '<option value="1">Bus A</option>', '<option value="2">Bus B</option>']
      .concat(audioSources.map((a) => `<option value="bus:${esc(a.uuid)}">Bus independente · ${esc(a.name)}</option>`));
    fill(E('audio-source'), audioOptions.join(''));
    pick(E('audio-source'), c.audio);
    E('audio-source').disabled = locked;

    const active = document.activeElement;
    if (active !== E('net-name')) E('net-name').value = c.name;
    E('net-name').disabled = locked;
    E('name-default').disabled = locked;
    E('groups-row').hidden = p !== 'NDI';
    if (active !== E('net-groups')) E('net-groups').value = c.groups;
    E('net-groups').disabled = locked;

    // Transparência só aparece quando o motor informa suporte; e só vale para fonte direta.
    const cap = capOf(p), alphaSupported = Boolean(cap.alphaSupported), independent = c.mode === 'source';
    const pa16Active = p === 'OMT' && c.precision === '16';
    E('alpha-row').hidden = !alphaSupported;
    E('net-alpha').checked = !!c.alpha || pa16Active;
    E('net-alpha').disabled = locked || !independent || !!c.fillKey || pa16Active;
    E('alpha-label').textContent = pa16Active ? 'Alpha16 integrado (PA16)' : 'Canal alfa (transparência)';
    const alphaNote = E('alpha-note');
    alphaNote.hidden = alphaSupported;
    if (!alphaSupported) alphaNote.textContent = 'Este motor não informa suporte a transparência em ' + p + '. O controle de alfa não é oferecido.';
    else if (!independent) { alphaNote.hidden = false; alphaNote.textContent = 'Transparência exige Fonte de vídeo = uma entrada direta; o Programa sai sem alfa.'; }
    else alphaNote.hidden = true;

    const pa16Supported = Boolean(outputs?.omt?.pa16Supported), fillKeySupported = Boolean(cap.fillKeySupported);
    E('precision-row').hidden = p !== 'OMT';
    if (p === 'OMT') {
      const opt16 = E('net-precision').options[1];
      if (opt16) opt16.disabled = !pa16Supported || !independent || !!c.fillKey;
      pick(E('net-precision'), c.precision);
      E('net-precision').disabled = locked || !independent || !!c.fillKey;
    }
    E('fillkey-row').hidden = !fillKeySupported;
    E('net-fillkey').checked = !!c.fillKey;
    E('net-fillkey').disabled = locked || !independent || !fillKeySupported || pa16Active;
    E('keyname-row').hidden = !fillKeySupported || !c.fillKey;
    if (active !== E('net-keyname')) E('net-keyname').value = c.keyName;
    E('net-keyname').disabled = locked || !c.fillKey;

    E('protocol-title').textContent = p;
    E('protocol-note').textContent = p === 'NDI' ? 'NDI · rede local' : 'OMT · rede local';
    E('protocol-help').textContent = p === 'NDI'
      ? 'NDI envia o programa ou uma entrada direta pela rede local com o nome acima. Grupos restringem quem encontra a saída.'
      : 'OMT envia o programa ou uma entrada direta pela rede local. PA16 leva transparência de 16 bits; Fill + Key separa imagem e máscara.';
    E('sender-state').textContent = stateText(p, n, s);
    E('sender-state').classList.toggle('live', s.live);
    E('sender-state').classList.toggle('error', !s.live && !!s.error);
    E('sender-state').title = s.error || (s.live && s.connections >= 0 ? s.connections + ' conexões' : '');

    // Virtual camera and full screen (explicitly not network senders)
    const virt = Boolean(settings?.virtualCamera);
    E('virtual-status').textContent = virt ? 'LIGADA' : 'Parada';
    E('virtual-status').classList.toggle('vd-ok-text', virt);
    E('virtual-toggle').textContent = virt ? 'Parar' : 'Ligar';
    E('virtual-toggle').classList.toggle('vd-air', virt);
    E('virtual-toggle').disabled = busy;
    fill(E('fs-input'), inputs.map((i) => `<option value="${esc(i.key)}">${esc(i.number ? i.number + '. ' : '')}${esc(i.name)}</option>`).join(''));
    E('fs-open-input').disabled = busy || inputs.length === 0;
    for (const id of ['fs-program', 'fs-preview', 'fs-multiview', 'fs-input']) E(id).disabled = busy;

    // Footer
    const all = ['NDI', 'OMT'].flatMap((proto) => [0, 1, 2, 3].map((slot) => saved(proto, slot)));
    const anyLive = all.some((x) => x.live);
    E('start-one').textContent = (s.live ? 'Parar' : 'Iniciar') + ' saída ' + (n + 1);
    E('start-one').classList.toggle('vd-air', s.live);
    E('start-one').classList.toggle('vd-on', !s.live);
    E('start-one').disabled = busy || (!s.live && !capOf(p).available);
    E('start-all').textContent = anyLive ? 'Parar todas' : 'Iniciar todas';
    E('start-all').classList.toggle('vd-air', anyLive);
    E('start-all').disabled = busy || (!anyLive && !['NDI', 'OMT'].some((proto) => capOf(proto).available));
    E('advanced-btn').disabled = busy;
    E('save-close').disabled = busy;
    E('foot-note').textContent = s.live ? 'Esta saída está no ar: pare para alterar.' : 'Salvar rascunho guarda o que está na tela neste computador; não inicia nem aplica no motor.';

    if (!E('msg').textContent || E('msg').dataset.auto) {
      const text = s.live ? stateText(p, n, s) + ': pare para alterar.'
        : s.error ? stateText(p, n, s) + ': ' + s.error
        : isDirty(p, n) ? 'Alterações ainda não aplicadas.' : '';
      say(text, s.error && !s.live ? 'error' : ''); E('msg').dataset.auto = '1';
    }
    if (!E('status').hidden) drawStatus();
  }

  function drawStatus() {
    const protos = ['NDI', 'OMT'].filter((proto) => capOf(proto).available), rows = [];
    for (const proto of protos) for (let i = 0; i < 4; i++) {
      const cur = current(proto, i), sav = saved(proto, i);
      if (!sav.configured && !sav.live && !isDirty(proto, i)) continue;
      const isSel = proto === selectedProtocol && i === selectedSlot;
      const stateHtml = sav.live
        ? `<span class="ext-sending">NO AR</span>` + (sav.connections >= 0 ? ` · ${sav.connections} conexões` : '') + (sav.capturedFrames ? ` · ${sav.capturedFrames} quadros` : '')
        : sav.error ? `<span class="ext-sending">${esc(sav.error)}</span>` : 'Parada';
      rows.push(`<tr class="${isSel ? 'vd-sel' : ''}" data-proto="${proto}" data-slot="${i}"><td>${i + 1}</td><td>${proto}</td><td class="vd-url" title="${esc(cur.name)}">${esc(cur.name || '—')}</td><td>${esc(videoName(cur.input))}</td><td>${stateHtml}</td></tr>`);
    }
    fill(E('status-rows'), rows.length ? rows.join('') : '<tr><td colspan="5" class="vd-note" style="text-align:center;padding:8px">Nenhuma saída de rede configurada.</td></tr>');
  }

  async function run(label, task) {
    if (busy) return;
    busy = true; note(label + '…'); draw();
    try { const done = await task(); note(done || 'Confirmado pelo motor.', 'ok'); }
    catch (e) { note(e.message, 'error'); }
    finally {
      busy = false;
      try { const [s, o] = await Promise.all([getJson('/api/settings'), getJson('/api/outputs')]); settings = s.settings; outputs = o.outputs; } catch { /* keep the last read */ }
      draw();
    }
  }

  async function toggleOutput(proto, slot, on) {
    if (on) {
      const c = current(proto, slot), cap = capOf(proto);
      if (c.mode === 'source' && !c.input) throw Error(stateText(proto, slot, saved(proto, slot)) + ': escolha a entrada de vídeo antes de iniciar.');
      if (proto === 'OMT' && c.precision === '16' && !String(c.name || '').trim()) throw Error('Saída ' + (slot + 1) + ' · OMT: informe o nome antes de iniciar com PA16.');
      await send('outputs_network', {
        protocol: proto, command: 'start', senderId: slot,
        name: String(c.name || '').trim() || defaultName(proto, slot),
        groups: proto === 'NDI' ? c.groups : '',
        mode: c.mode, input: c.input,
        audioTrack: c.audio.startsWith('bus:') ? 0 : Number(c.audio),
        audioSourceUuid: c.audio.startsWith('bus:') ? c.audio.slice(4) : '',
        alpha: Boolean(cap.alphaSupported) && c.alpha,
        fillKey: Boolean(cap.fillKeySupported) && c.fillKey,
        keyName: c.keyName,
        precisionBits: Number(c.precision || 8),
      });
      drafts.delete(keyOf(proto, slot)); persistDrafts();
    } else {
      await send('outputs_network', { protocol: proto, command: 'stop', senderId: slot });
    }
  }

  const toggleVirtual = () => run(settings?.virtualCamera ? 'Parando câmera virtual' : 'Ligando câmera virtual', async () => {
    const virt = Boolean(settings?.virtualCamera);
    await send('settings_virtual', { active: !virt });
    settings = (await getJson('/api/settings')).settings;
    return !virt ? 'Câmera virtual ligada.' : 'Câmera virtual parada.';
  });
  const openProjector = (mix) => run('Abrindo tela cheia', async () => {
    await send('settings_projector', { mix });
    return `Janela de tela cheia (${mix === 'PROGRAM' ? 'Saída' : mix === 'PREVIEW' ? 'Preview' : 'Multiview'}) solicitada.`;
  });
  const openSourceProjector = (inputKey) => { if (!inputKey) return; run('Abrindo entrada em tela cheia', async () => { await send('settings_source_projector', { input: inputKey }); return 'Janela da entrada solicitada.'; }); };

  async function load() {
    const [s, o] = await Promise.all([getJson('/api/settings'), getJson('/api/outputs')]);
    settings = s.settings; outputs = o.outputs; loaded = true;
  }
  async function refresh() {
    if (busy || document.hidden) return;
    try { const [s, o] = await Promise.all([getJson('/api/settings'), getJson('/api/outputs')]); settings = s.settings; outputs = o.outputs; draw(); } catch { /* header connection text shows it */ }
  }

  // ---- events ----
  E('nums').onclick = (e) => { const b = e.target.closest('button'); if (busy || !b || b.disabled) return; selectedSlot = Number(b.dataset.n); E('msg').dataset.auto = '1'; say(''); draw(); };
  E('type-ndi').onclick = () => { selectedProtocol = 'NDI'; E('msg').dataset.auto = '1'; say(''); draw(); };
  E('type-omt').onclick = () => { selectedProtocol = 'OMT'; E('msg').dataset.auto = '1'; say(''); draw(); };
  E('video-source').onchange = (e) => { const val = e.target.value, isSource = val !== 'program'; edit(selectedProtocol, selectedSlot, { mode: isSource ? 'source' : 'program', input: isSource ? val : '', ...(isSource ? {} : { alpha: false }) }); draw(); };
  E('audio-source').onchange = (e) => { edit(selectedProtocol, selectedSlot, { audio: e.target.value }); draw(); };
  E('net-name').oninput = (e) => { edit(selectedProtocol, selectedSlot, { name: e.target.value }); draw(); };
  E('name-default').onclick = () => { edit(selectedProtocol, selectedSlot, { name: defaultName(selectedProtocol, selectedSlot) }); E('net-name').focus(); draw(); };
  E('net-groups').oninput = (e) => { edit(selectedProtocol, selectedSlot, { groups: e.target.value }); draw(); };
  E('net-alpha').onchange = (e) => { edit(selectedProtocol, selectedSlot, { alpha: e.target.checked, ...(e.target.checked ? { fillKey: false } : {}) }); draw(); };
  E('show-advanced').onchange = (e) => { E('advanced').hidden = !e.target.checked; };
  E('net-precision').onchange = (e) => { const val = e.target.value; edit(selectedProtocol, selectedSlot, { precision: val, ...(val === '16' ? { alpha: true, fillKey: false } : {}) }); draw(); };
  E('net-fillkey').onchange = (e) => { edit(selectedProtocol, selectedSlot, { fillKey: e.target.checked, ...(e.target.checked ? { alpha: false, precision: '8' } : {}) }); draw(); };
  E('net-keyname').oninput = (e) => { edit(selectedProtocol, selectedSlot, { keyName: e.target.value }); draw(); };
  E('virtual-toggle').onclick = toggleVirtual;
  E('fs-program').onclick = () => openProjector('PROGRAM');
  E('fs-preview').onclick = () => openProjector('PREVIEW');
  E('fs-multiview').onclick = () => openProjector('MULTIVIEW');
  E('fs-open-input').onclick = () => openSourceProjector(E('fs-input').value);

  E('start-one').onclick = () => {
    const p = selectedProtocol, n = selectedSlot, s = saved(p, n), on = !s.live;
    run(stateText(p, n, s) + ' — ' + (on ? 'iniciando' : 'parando'), async () => {
      await toggleOutput(p, n, on);
      return on ? stateText(p, n, { ...s, live: true }) + ': confirmada pelo motor.' : 'Saída ' + (n + 1) + ' · ' + p + ' parada.';
    });
  };

  E('start-all').onclick = () => {
    const all = ['NDI', 'OMT'].flatMap((proto) => [0, 1, 2, 3].map((slot) => ({ proto, slot, saved: saved(proto, slot) })));
    const lives = all.filter((x) => x.saved.live);
    run(lives.length ? 'Parando todas as saídas' : 'Iniciando as saídas configuradas', async () => {
      const failed = [];
      let started = 0;
      if (lives.length) for (const item of lives) { try { await toggleOutput(item.proto, item.slot, false); } catch (e) { failed.push(`${item.proto} ${item.slot + 1}: ${e.message}`); } }
      else for (const proto of ['NDI', 'OMT']) {
        if (!capOf(proto).available) continue;
        for (let slot = 0; slot < 4; slot++) {
          const cur = current(proto, slot);
          if (!(cur.configured || isDirty(proto, slot))) continue;
          try { await toggleOutput(proto, slot, true); started++; } catch (e) { failed.push(`${proto} ${slot + 1}: ${e.message}`); }
        }
      }
      if (failed.length) throw Error('Não confirmado — ' + failed.join(' · '));
      if (!lives.length && !started) throw Error('Nenhuma saída configurada para iniciar. Escolha uma vaga, ajuste o nome ou a fonte e clique em Iniciar saída.');
      return lives.length ? 'Todas as saídas de rede foram paradas.' : 'Saídas configuradas confirmadas no ar.';
    });
  };

  E('view-status').onclick = () => {
    E('status').hidden = !E('status').hidden;
    E('view-status').classList.toggle('vd-on', !E('status').hidden);
    document.querySelector('.vd-window').classList.toggle('vd-with-status', !E('status').hidden);
    draw();
  };
  E('status-rows').onclick = (e) => { const tr = e.target.closest('tr[data-proto]'); if (busy || !tr) return; selectedProtocol = tr.dataset.proto; selectedSlot = Number(tr.dataset.slot); draw(); };

  function openAdvancedTransport(transport) {
    if (busy || !['ndi', 'omt', 'srt'].includes(transport)) return;
    if (['NDI', 'OMT'].some((pr) => [0, 1, 2, 3].some((sl) => isDirty(pr, sl))) && !confirm('Há alterações não salvas nesta janela. Abrir o editor completo mesmo assim?')) return;
    persistDrafts();
    location.href = '/saidas?context=external&transport=' + transport;
  }
  E('advanced-btn').onclick = () => openAdvancedTransport(selectedProtocol.toLowerCase());
  E('type-srt').onclick = () => openAdvancedTransport('srt');

  E('save-close').onclick = () => {
    persistDrafts();
    note('Rascunho guardado neste computador. Nenhuma saída foi iniciada nem aplicada no motor.', 'ok');
    setTimeout(() => window.FreeMixClosePanel?.(), 120);
  };

  setInterval(refresh, 2000);
  (async function start() {
    for (;;) { try { await load(); break; } catch (e) { say(e.message + ' Tentando novamente…', 'error'); await new Promise((r) => setTimeout(r, 1500)); } }
    say(''); E('msg').dataset.auto = '1'; draw();
  })();
})();
