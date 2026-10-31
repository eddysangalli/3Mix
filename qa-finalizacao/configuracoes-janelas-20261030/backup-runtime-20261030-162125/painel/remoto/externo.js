// Janela de saídas externas (NDI, OMT, Câmera virtual e Tela cheia)
// Padrão visual do vMix (classes vd-*), largura 700 px.
// Toda leitura e ação mapeada estritamente nas APIs e comandos reais do FreeMix.
(() => {
  'use strict';

  const E = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Atualiza listas e tabelas somente se o HTML gerado mudou, evitando fechar listas abertas
  const fill = (el, html) => {
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
  };

  const pick = (el, value) => {
    if (el && el.value !== String(value ?? '')) el.value = String(value ?? '');
  };

  const STORAGE_KEY = 'freemix.outputs.drafts:' + location.host;

  let outputs = null;
  let settings = null;
  let selectedSlot = 0;       // 0 a 3 (Saídas 1 a 4)
  let selectedProtocol = 'NDI'; // 'NDI' ou 'OMT'
  let loaded = false;
  let busy = false;

  // Rascunhos locais por envio (chave: "NDI:0", "OMT:1", etc.)
  const drafts = new Map();
  try {
    // What was typed and not started is kept on this computer, so "Salvar e Fechar" really keeps it for next time;
    // the copy in the session is what the advanced editor reads when opened from here.
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      for (const [k, v] of JSON.parse(raw)) {
        if (/^(NDI|OMT):[0-3]$/.test(k) && v && typeof v === 'object') {
          drafts.set(k, v.values || v);
        }
      }
    }
  } catch {}

  const persistDrafts = () => {
    try {
      const text = JSON.stringify([...drafts]);
      localStorage.setItem(STORAGE_KEY, text);
      sessionStorage.setItem(STORAGE_KEY, text);
    } catch {}
  };

  // Mensagens do rodapé
  const say = (text, kind = '') => {
    const box = E('msg');
    box.textContent = text;
    box.className = 'vd-msg' + (kind ? ' vd-' + kind : '');
  };

  const note = (text, kind) => {
    delete E('msg').dataset.auto;
    say(text, kind);
  };

  // Comunicação com o motor
  const getJson = async (url) => {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok || v.success === false) throw Error(v.error || 'O motor não respondeu à consulta');
    return v;
  };

  const send = async (action, data = {}) => {
    const r = await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
      signal: AbortSignal.timeout(60000)
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok || v.success === false) throw Error(v.error || 'Operação recusada pelo motor');
    return v;
  };

  const engineState = () => window.FreeMixRemote?.getState?.() || {};

  // Extração de dados nativos do motor
  const capOf = (proto) => outputs?.[proto.toLowerCase()] || {};

  const nativeSender = (proto, slot) => {
    const c = capOf(proto);
    const list = c.senders || [];
    const found = list.find((s) => s.senderId === slot);
    return found || (slot === 0 && list.length === 0 ? c : null) || {};
  };

  function saved(proto, slot) {
    const n = nativeSender(proto, slot);
    const defaultName = (proto === 'NDI' ? 'FreeMix NDI ' : 'FreeMix OMT ') + (slot + 1);
    const isLive = Boolean(n.active ?? n.outputActive);
    return {
      mode: n.mode || 'program',
      input: n.sourceUuid || '',
      audio: n.audioSourceUuid ? 'bus:' + n.audioSourceUuid : String(n.audioTrack ?? 0),
      alpha: !!n.alpha,
      fillKey: !!n.fillKey,
      precision: proto === 'NDI' ? '8' : n.precisionBits !== undefined ? String(n.precisionBits) : '8',
      keyName: n.keyName || '',
      name: n.networkName || defaultName,
      groups: n.groups || '',
      live: isLive,
      connections: n.connections ?? -1,
      capturedFrames: n.capturedFrames || 0,
      error: n.error || ''
    };
  }

  const keyOf = (proto, slot) => proto + ':' + slot;

  const current = (proto, slot) => {
    const base = saved(proto, slot);
    const draft = drafts.get(keyOf(proto, slot)) || {};
    return { ...base, ...draft };
  };

  const isDirty = (proto, slot) => {
    const k = keyOf(proto, slot);
    return drafts.has(k) && Object.keys(drafts.get(k)).length > 0;
  };

  function edit(proto, slot, change) {
    const base = saved(proto, slot);
    const k = keyOf(proto, slot);
    const next = { ...(drafts.get(k) || {}), ...change };

    for (const prop of Object.keys(next)) {
      if (String(next[prop]) === String(base[prop])) {
        delete next[prop];
      }
    }

    if (Object.keys(next).length > 0) {
      drafts.set(k, next);
    } else {
      drafts.delete(k);
    }
    persistDrafts();
  }

  // Nome legível da entrada
  const videoName = (uuid) => {
    if (!uuid || uuid === 'program') return 'Saída (programa)';
    const inp = (engineState().inputs || []).find((i) => i.key === uuid);
    return inp ? (inp.number ? inp.number + '. ' : '') + inp.name : 'Entrada indisponível';
  };

  // Desenho da interface
  function draw() {
    if (!loaded) return;

    const ndiCap = capOf('NDI');
    const omtCap = capOf('OMT');
    const ndiAvail = Boolean(ndiCap.available);
    const omtAvail = Boolean(omtCap.available);

    // Ajusta seleção caso o protocolo não esteja disponível
    if (selectedProtocol === 'NDI' && !ndiAvail && omtAvail) selectedProtocol = 'OMT';
    if (selectedProtocol === 'OMT' && !omtAvail && ndiAvail) selectedProtocol = 'NDI';

    const p = selectedProtocol;
    const n = selectedSlot;
    const c = current(p, n);
    const s = saved(p, n);
    const locked = s.live || busy;

    // 1. Botões numerados 1 a 4
    for (const b of E('nums').children) {
      const i = Number(b.dataset.n);
      const slotSaved = saved(p, i);
      const otherSaved = saved(p === 'NDI' ? 'OMT' : 'NDI', i);
      const isSending = slotSaved.live || otherSaved.live;

      b.classList.toggle('vd-on', i === n);
      b.classList.toggle('vd-live', isSending);
      b.setAttribute('aria-selected', String(i === n));
      b.disabled = busy;
      b.title = isSending ? 'No ar' : slotSaved.name ? 'Configurado' : 'Livre';
    }

    // 2. Linha Tipo
    E('type-ndi').classList.toggle('vd-on', p === 'NDI');
    E('type-ndi').disabled = !ndiAvail || busy;
    E('type-omt').classList.toggle('vd-on', p === 'OMT');
    E('type-omt').disabled = !omtAvail || busy;

    // 3. Fonte de vídeo
    const inputs = engineState().inputs || [];
    const videoOptions = ['<option value="program">Saída (programa)</option>']
      .concat(inputs.map((i) => `<option value="${esc(i.key)}">${esc(i.number ? i.number + '. ' : '')}${esc(i.name)}</option>`));

    if (c.mode === 'source' && c.input && !inputs.some((i) => i.key === c.input)) {
      videoOptions.push(`<option value="${esc(c.input)}" disabled>Entrada indisponível · reconfigure</option>`);
    }
    fill(E('video-source'), videoOptions.join(''));
    pick(E('video-source'), c.mode === 'source' && c.input ? c.input : 'program');
    E('video-source').disabled = locked;

    // Fonte de áudio
    const audioSources = outputs?.audioSources || [];
    const audioOptions = [
      '<option value="0">Master</option>',
      '<option value="1">Bus A</option>',
      '<option value="2">Bus B</option>'
    ].concat(audioSources.map((a) => `<option value="bus:${esc(a.uuid)}">Bus independente · ${esc(a.name)}</option>`));

    fill(E('audio-source'), audioOptions.join(''));
    pick(E('audio-source'), c.audio);
    E('audio-source').disabled = locked;

    // Nome na rede
    const active = document.activeElement;
    if (active !== E('net-name')) E('net-name').value = c.name;
    E('net-name').disabled = locked;

    // Grupos (somente NDI)
    E('groups-row').hidden = p !== 'NDI';
    if (active !== E('net-groups')) E('net-groups').value = c.groups;
    E('net-groups').disabled = locked;

    // Canal alfa
    const cap = capOf(p);
    const alphaSupported = Boolean(cap.alphaSupported);
    const independent = c.mode === 'source';
    const pa16Active = p === 'OMT' && c.precision === '16';

    E('net-alpha').checked = !!c.alpha || pa16Active;
    E('net-alpha').disabled = locked || !independent || !alphaSupported || !!c.fillKey || pa16Active;
    E('alpha-label').textContent = pa16Active ? 'Alpha16 integrado (PA16)' : 'Canal alfa (transparência)';

    // Opções avançadas
    const pa16Supported = Boolean(outputs?.omt?.pa16Supported);
    const fillKeySupported = Boolean(cap.fillKeySupported);

    E('precision-row').hidden = p !== 'OMT';
    if (p === 'OMT') {
      const precision16Option = E('net-precision').options[1];
      if (precision16Option) {
        precision16Option.disabled = !pa16Supported || !independent || !!c.fillKey;
      }
      pick(E('net-precision'), c.precision);
      E('net-precision').disabled = locked || !independent || !!c.fillKey;
    }

    E('fillkey-row').hidden = !fillKeySupported;
    E('net-fillkey').checked = !!c.fillKey;
    E('net-fillkey').disabled = locked || !independent || !fillKeySupported || pa16Active;

    E('keyname-row').hidden = !fillKeySupported || !c.fillKey;
    if (active !== E('net-keyname')) E('net-keyname').value = c.keyName;
    E('net-keyname').disabled = locked || !c.fillKey;

    // 4. Câmera virtual
    const virt = Boolean(settings?.virtualCamera);
    E('virtual-status').textContent = virt ? 'LIGADA' : 'Parada';
    E('virtual-status').classList.toggle('vd-ok-text', virt);
    E('virtual-toggle').textContent = virt ? 'Parar' : 'Ligar';
    E('virtual-toggle').classList.toggle('vd-air', virt);
    E('virtual-toggle').disabled = busy;

    // Tela cheia
    const fsInputOptions = inputs.map((i) => `<option value="${esc(i.key)}">${esc(i.number ? i.number + '. ' : '')}${esc(i.name)}</option>`);
    fill(E('fs-input'), fsInputOptions.join(''));
    E('fs-open-input').disabled = busy || inputs.length === 0;
    for (const id of ['fs-program', 'fs-preview', 'fs-multiview', 'fs-input']) {
      E(id).disabled = busy;
    }

    // 6. Barra de baixo
    const allSenders = ['NDI', 'OMT'].flatMap((proto) => [0, 1, 2, 3].map((slot) => saved(proto, slot)));
    const anyLive = allSenders.some((snd) => snd.live);

    E('start-one').textContent = (s.live ? 'Parar ' : 'Começar ') + (n + 1);
    E('start-one').classList.toggle('vd-air', s.live);
    E('start-one').disabled = busy || (!s.live && !p);

    E('start-all').textContent = anyLive ? 'Parar tudo' : 'Iniciar tudo';
    E('start-all').classList.toggle('vd-air', anyLive);
    E('start-all').disabled = busy;

    E('advanced-btn').disabled = busy;
    E('type-srt').disabled = busy;
    E('save-close').disabled = busy;

    // Mensagem de status
    if (!E('msg').textContent || E('msg').dataset.auto) {
      const text = s.live
        ? `Saída ${n + 1} (${p}) no ar: pare para alterar.`
        : s.error
        ? 'Motor: ' + s.error
        : isDirty(p, n)
        ? 'Alterações ainda não aplicadas.'
        : '';
      say(text, s.error && !s.live ? 'error' : '');
      E('msg').dataset.auto = '1';
    }

    // Tabela de status
    if (!E('status').hidden) {
      drawStatus();
    }
  }

  // Desenha a tabela Ver Status
  function drawStatus() {
    const protos = ['NDI', 'OMT'].filter((proto) => capOf(proto).available);
    const rows = [];

    for (const proto of protos) {
      for (let i = 0; i < 4; i++) {
        const cur = current(proto, i);
        const sav = saved(proto, i);
        const defaultName = (proto === 'NDI' ? 'FreeMix NDI ' : 'FreeMix OMT ') + (i + 1);
        const configured = sav.live || cur.mode === 'source' || cur.name !== defaultName || isDirty(proto, i);

        if (!configured && !sav.live) continue;

        const isSel = proto === selectedProtocol && i === selectedSlot;
        const stateHtml = sav.live
          ? `<span class="vd-air-text">ENVIANDO</span>` +
            (sav.connections >= 0 ? ` · ${sav.connections} conexões` : '') +
            (sav.capturedFrames ? ` · ${sav.capturedFrames} quadros` : '')
          : sav.error
          ? `<span class="vd-air-text">${esc(sav.error)}</span>`
          : 'Parado';

        rows.push(
          `<tr class="${isSel ? 'vd-sel' : ''}" data-proto="${proto}" data-slot="${i}">` +
            `<td>${i + 1}</td>` +
            `<td>${proto}</td>` +
            `<td class="vd-url" title="${esc(cur.name)}">${esc(cur.name || '—')}</td>` +
            `<td>${esc(videoName(cur.input))}</td>` +
            `<td>${stateHtml}</td>` +
          `</tr>`
        );
      }
    }

    if (rows.length === 0) {
      // Se nenhuma saída estiver configurada ou enviando, exibe uma linha clara
      fill(E('status-rows'), '<tr><td colspan="5" class="vd-note" style="text-align:center;padding:8px">Nenhuma saída de rede enviando ou configurada.</td></tr>');
    } else {
      fill(E('status-rows'), rows.join(''));
    }
  }

  // Execução de comando assíncrono com trava de interface
  async function run(label, task) {
    if (busy) return;
    busy = true;
    note(label + '…');
    draw();
    try {
      const done = await task();
      note(done || 'Confirmado pelo motor.', 'ok');
    } catch (e) {
      note(e.message, 'error');
    } finally {
      busy = false;
      try {
        const [s, o] = await Promise.all([getJson('/api/settings'), getJson('/api/outputs')]);
        settings = s.settings;
        outputs = o.outputs;
      } catch {}
      draw();
    }
  }

  // Alterna o envio de uma saída (Ligar / Parar)
  async function toggleOutput(proto, slot, on) {
    if (on) {
      const c = current(proto, slot);
      if (c.mode === 'source' && !c.input) {
        throw Error(`Saída ${slot + 1} (${proto}): escolha a entrada de vídeo antes de iniciar.`);
      }
      if (proto === 'OMT' && c.precision === '16' && !c.name.trim()) {
        throw Error(`Saída ${slot + 1} (OMT): nome obrigatório para envio PA16.`);
      }

      await send('outputs_network', {
        protocol: proto,
        command: 'start',
        senderId: slot,
        name: c.name,
        groups: c.groups,
        mode: c.mode,
        input: c.input,
        audioTrack: c.audio.startsWith('bus:') ? 0 : Number(c.audio),
        audioSourceUuid: c.audio.startsWith('bus:') ? c.audio.slice(4) : '',
        alpha: c.alpha,
        fillKey: c.fillKey,
        keyName: c.keyName,
        precisionBits: Number(c.precision || 8)
      });

      // Remove rascunho após confirmação
      drafts.delete(keyOf(proto, slot));
      persistDrafts();
    } else {
      await send('outputs_network', {
        protocol: proto,
        command: 'stop',
        senderId: slot
      });
    }
  }

  // Câmera virtual
  async function toggleVirtual() {
    const virt = Boolean(settings?.virtualCamera);
    await run(virt ? 'Parando câmera virtual' : 'Ligando câmera virtual', async () => {
      await send('settings_virtual', { active: !virt });
      settings = (await getJson('/api/settings')).settings;
      return !virt ? 'Câmera virtual ligada.' : 'Câmera virtual parada.';
    });
  }

  // Tela cheia
  async function openProjector(mix) {
    await run('Abrindo tela cheia', async () => {
      await send('settings_projector', { mix });
      return `Janela de tela cheia (${mix === 'PROGRAM' ? 'Saída' : mix === 'PREVIEW' ? 'Preview' : 'Multiview'}) solicitada.`;
    });
  }

  async function openSourceProjector(inputKey) {
    if (!inputKey) return;
    await run('Abrindo entrada em tela cheia', async () => {
      await send('settings_source_projector', { input: inputKey });
      return 'Janela da entrada solicitada.';
    });
  }

  // Leitura inicial
  async function load() {
    const [s, o] = await Promise.all([getJson('/api/settings'), getJson('/api/outputs')]);
    settings = s.settings;
    outputs = o.outputs;
    loaded = true;
  }

  async function refresh() {
    if (busy || document.hidden) return;
    try {
      const [s, o] = await Promise.all([getJson('/api/settings'), getJson('/api/outputs')]);
      settings = s.settings;
      outputs = o.outputs;
      draw();
    } catch {}
  }

  // Eventos de interface
  E('nums').onclick = (e) => {
    const b = e.target.closest('button');
    if (busy || !b || b.disabled) return;
    selectedSlot = Number(b.dataset.n);
    E('msg').dataset.auto = '1';
    say('');
    draw();
  };

  E('type-ndi').onclick = () => {
    selectedProtocol = 'NDI';
    E('msg').dataset.auto = '1';
    say('');
    draw();
  };

  E('type-omt').onclick = () => {
    selectedProtocol = 'OMT';
    E('msg').dataset.auto = '1';
    say('');
    draw();
  };

  E('video-source').onchange = (e) => {
    const val = e.target.value;
    const isSource = val !== 'program';
    edit(selectedProtocol, selectedSlot, {
      mode: isSource ? 'source' : 'program',
      input: isSource ? val : ''
    });
    draw();
  };

  E('audio-source').onchange = (e) => {
    edit(selectedProtocol, selectedSlot, { audio: e.target.value });
    draw();
  };

  E('net-name').oninput = (e) => {
    edit(selectedProtocol, selectedSlot, { name: e.target.value });
    draw();
  };

  E('net-groups').oninput = (e) => {
    edit(selectedProtocol, selectedSlot, { groups: e.target.value });
    draw();
  };

  E('net-alpha').onchange = (e) => {
    const checked = e.target.checked;
    edit(selectedProtocol, selectedSlot, {
      alpha: checked,
      ...(checked ? { fillKey: false } : {})
    });
    draw();
  };

  E('show-advanced').onchange = (e) => {
    E('advanced').hidden = !e.target.checked;
  };

  E('net-precision').onchange = (e) => {
    const val = e.target.value;
    edit(selectedProtocol, selectedSlot, {
      precision: val,
      ...(val === '16' ? { alpha: true, fillKey: false } : {})
    });
    draw();
  };

  E('net-fillkey').onchange = (e) => {
    const checked = e.target.checked;
    edit(selectedProtocol, selectedSlot, {
      fillKey: checked,
      ...(checked ? { alpha: false, precision: '8' } : {})
    });
    draw();
  };

  E('net-keyname').oninput = (e) => {
    edit(selectedProtocol, selectedSlot, { keyName: e.target.value });
    draw();
  };

  // Câmera virtual
  E('virtual-toggle').onclick = () => toggleVirtual();

  // Tela cheia
  E('fs-program').onclick = () => openProjector('PROGRAM');
  E('fs-preview').onclick = () => openProjector('PREVIEW');
  E('fs-multiview').onclick = () => openProjector('MULTIVIEW');
  E('fs-open-input').onclick = () => openSourceProjector(E('fs-input').value);

  // Barra de baixo
  E('start-one').onclick = () => {
    const p = selectedProtocol;
    const n = selectedSlot;
    const s = saved(p, n);
    const on = !s.live;
    run((on ? 'Começando ' : 'Parando ') + (n + 1), async () => {
      await toggleOutput(p, n, on);
      return on
        ? `Saída ${n + 1} (${p}) confirmada no ar.`
        : `Saída ${n + 1} (${p}) parada.`;
    });
  };

  E('start-all').onclick = () => {
    const allSenders = ['NDI', 'OMT'].flatMap((proto) =>
      [0, 1, 2, 3].map((slot) => ({ proto, slot, saved: saved(proto, slot) }))
    );
    const lives = allSenders.filter((x) => x.saved.live);

    run(lives.length ? 'Parando tudo' : 'Iniciar tudo', async () => {
      const failed = [];
      if (lives.length) {
        for (const item of lives) {
          try {
            await toggleOutput(item.proto, item.slot, false);
          } catch (e) {
            failed.push(`${item.proto} ${item.slot + 1}: ${e.message}`);
          }
        }
      } else {
        // Inicia todas as saídas configuradas
        for (const proto of ['NDI', 'OMT']) {
          if (!capOf(proto).available) continue;
          for (let slot = 0; slot < 4; slot++) {
            const cur = current(proto, slot);
            const defaultName = (proto === 'NDI' ? 'FreeMix NDI ' : 'FreeMix OMT ') + (slot + 1);
            const configured = cur.mode === 'source' || cur.name !== defaultName || isDirty(proto, slot);
            if (configured) {
              try {
                await toggleOutput(proto, slot, true);
              } catch (e) {
                failed.push(`${proto} ${slot + 1}: ${e.message}`);
              }
            }
          }
        }
      }

      if (failed.length) {
        throw Error('Não confirmado — ' + failed.join(' · '));
      }
      return lives.length ? 'Todas as saídas de rede foram paradas.' : 'Saídas configuradas confirmadas no ar.';
    });
  };

  E('view-status').onclick = () => {
    E('status').hidden = !E('status').hidden;
    E('view-status').classList.toggle('vd-on', !E('status').hidden);
    document.querySelector('.vd-window').classList.toggle('vd-with-status', !E('status').hidden);
    draw();
  };

  E('status-rows').onclick = (e) => {
    const tr = e.target.closest('tr[data-proto]');
    if (busy || !tr) return;
    selectedProtocol = tr.dataset.proto;
    selectedSlot = Number(tr.dataset.slot);
    draw();
  };

  function openAdvancedTransport(transport) {
    if (busy || !['ndi', 'omt', 'srt'].includes(transport)) return;
    const hasDirty = ['NDI', 'OMT'].some((pr) => [0, 1, 2, 3].some((sl) => isDirty(pr, sl)));
    if (hasDirty && !confirm('Há alterações não salvas nesta janela. Abrir o editor avançado mesmo assim?')) {
      return;
    }
    persistDrafts();
    location.href = '/saidas?context=external&transport=' + transport;
  }
  E('advanced-btn').onclick = () => openAdvancedTransport(selectedProtocol.toLowerCase());
  E('type-srt').onclick = () => openAdvancedTransport('srt');

  E('save-close').onclick = () => {
    persistDrafts();
    window.FreeMixClosePanel();
  };

  // Atualização periódica leve
  setInterval(refresh, 2000);

  // Inicialização com tolerância a conexão
  (async function start() {
    for (;;) {
      try {
        await load();
        break;
      } catch (e) {
        say(e.message + ' Tentando novamente…', 'error');
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    say('');
    E('msg').dataset.auto = '1';
    draw();
  })();
})();
