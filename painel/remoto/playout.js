/**
 * 3Mix Playout — uma playlist, um par Preview/Program, um comportamento por clipe.
 * O avanço automático da lista fica desligado enquanto o Rundown estiver no comando, para as duas telas não
 * disputarem o mesmo fim de mídia. Todo comando é confirmado pelo motor; a tela relê o estado a cada segundo.
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let state = null, rundown = null, pollTimer = null, animFrame = null, rundownTimer = null;
  let selectedItemIds = new Set(), dragSrcIndex = null, lastTableSignature = '';

  const connEl = $('connection'), plSelect = $('pl-select'), plName = $('pl-name');
  const pvBadge = $('pv-badge'), pvPlaceholder = $('pv-placeholder'), pvThumb = $('pv-thumb'), pvTitle = $('pv-title');
  const pvCur = $('pv-cur'), pvDur = $('pv-dur'), pvProgress = $('pv-progress'), pvIn = $('pv-in'), pvOut = $('pv-out'), pvPreloadTime = $('pv-preload-time');
  const pgmBadge = $('pgm-badge'), pgmPlaceholder = $('pgm-placeholder'), pgmThumb = $('pgm-thumb'), pgmTitle = $('pgm-title');
  const pgmCur = $('pgm-cur'), pgmRem = $('pgm-rem'), pgmProgress = $('pgm-progress'), pgmEnd = $('pgm-end');
  const takeTrans = $('take-trans'), takeMs = $('take-ms');
  const plTbody = $('pl-tbody'), plTotalInfo = $('pl-total-info'), plModeNote = $('pl-mode-note'), rundownNote = $('rundown-note');

  // hh:mm:ss.mmm — the only timecode shown and accepted by the IN/OUT fields
  const pad = (n, size = 2) => String(Math.max(0, Math.floor(n))).padStart(size, '0');
  function formatTC(ms, withMs = true) {
    const value = Number.isFinite(Number(ms)) ? Math.max(0, Number(ms)) : 0;
    const h = Math.floor(value / 3600000), m = Math.floor((value % 3600000) / 60000), s = Math.floor((value % 60000) / 1000), milli = Math.floor(value % 1000);
    return pad(h) + ':' + pad(m) + ':' + pad(s) + (withMs ? '.' + pad(milli, 3) : '');
  }
  const formatTCShort = (ms) => formatTC(ms, false);
  const formatNegative = (ms) => '-' + formatTC(ms);
  function parseTC(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    if (raw.includes(':')) {
      const parts = raw.split(':');
      if (parts.length < 2 || parts.length > 3) return null;
      const nums = parts.map((p) => p.trim());
      const secPart = Number(nums.pop());
      if (!Number.isFinite(secPart) || secPart < 0 || secPart >= 60) return null;
      let value = secPart * 1000;
      if (nums.length) { const m = Number(nums.pop()); if (!Number.isFinite(m) || m < 0 || m >= 60) return null; value += m * 60000; }
      if (nums.length) { const h = Number(nums.pop()); if (!Number.isFinite(h) || h < 0) return null; value += h * 3600000; }
      return Math.round(value);
    }
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
  }

  async function sendCommand(action, data = {}) {
    try {
      const resp = await fetch('/api/playout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(60000) });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || result.success === false) throw Error(result.error || ('HTTP ' + resp.status));
      if (result.playout) applyState(result.playout);
      if (connEl) { connEl.textContent = 'Conectado'; connEl.style.color = '#8fd6a9'; }
      return result;
    } catch (e) {
      console.error('Falha no comando de playout:', e);
      if (connEl) { connEl.textContent = 'Erro: ' + e.message; connEl.style.color = '#ff9b92'; }
      return null;
    }
  }

  async function fetchState() {
    try {
      const resp = await fetch('/api/playout', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!resp.ok) throw Error('HTTP ' + resp.status);
      const data = await resp.json();
      applyState(data.playout || data);
      if (connEl) { connEl.textContent = 'Conectado'; connEl.style.color = '#8fd6a9'; }
    } catch {
      if (connEl) { connEl.textContent = 'Desconectado'; connEl.style.color = '#ff9b92'; }
    }
  }
  async function fetchRundown() {
    try { const r = await fetch('/api/rundown', { cache: 'no-store', signal: AbortSignal.timeout(6000) }); if (r.ok) rundown = await r.json(); }
    catch { rundown = null; }
    renderRundown();
  }
  const rundownInCommand = () => {
    const a = rundown?.automation || {};
    return !!rundown && (rundown.running === true || (a.armed === true && (a.willAutoAdvance === true || a.currentMode === 'auto' || a.currentMode === 'media_end')));
  };
  function renderRundown() {
    if (!rundownNote) return;
    const inCommand = rundownInCommand(), a = rundown?.automation || {};
    rundownNote.hidden = !inCommand;
    rundownNote.innerHTML = inCommand
      ? '<b>Rundown no comando.</b> O avanço automático desta playlist fica desligado para não disputar o fim do clipe. O botão <b>Executar próximo</b> continua manual. ' + (a.currentMode ? 'Modo: ' + esc(a.currentMode) + '.' : '')
      : '';
    if (plModeNote) plModeNote.textContent = inCommand
      ? 'Avanço automático suspenso: o Rundown está no comando.'
      : 'Avanço, repetição e congelamento ficam em “Ao terminar” de cada clipe.';
  }

  
  function updatePlaylistTotals(s, livePos = null) {
    if (!plTotalInfo || !Array.isArray(s?.activeList?.items)) return;
    const items = s.activeList.items;
    let totalDur = 0;
    const netDurs = items.map((it) => {
      const duration=Number.isFinite(Number(it.durationMs))?Math.max(0,Number(it.durationMs)):0, start=Number.isFinite(Number(it.inMs))?Math.max(0,Number(it.inMs)):0, out=Number.isFinite(Number(it.outMs))?Math.max(0,Number(it.outMs)):0;
      const d = it.enabled===false?0:Math.max(0,(out>0?(duration>0?Math.min(out,duration):out):duration)-start);
      totalDur += d;
      return d;
    });

    const pgmItemId = s.program?.item?.id;
    const pgmIdx = items.findIndex((i) => i.id === pgmItemId);

    let totalPos = 0;
    let totalRem = totalDur;

    if (pgmIdx >= 0) {
      const curItem = items[pgmIdx];
      const curNetDur = netDurs[pgmIdx];
      let pgmPos = livePos !== null ? livePos : (s.program.positionMs || 0);
      const curNetPos = Math.max(0, Math.min(curNetDur, pgmPos - (curItem.inMs || 0)));
      const curNetRem = Math.max(0, curNetDur - curNetPos);

      let prevDur = 0;
      for (let i = 0; i < pgmIdx; i++) prevDur += netDurs[i];
      totalPos = prevDur + curNetPos;

      let postDur = 0;
      for (let i = pgmIdx + 1; i < items.length; i++) postDur += netDurs[i];
      totalRem = curNetRem + postDur;
    }

    plTotalInfo.innerHTML = `<span class="pos-chip" title="Tempo total decorrido na playlist"><b>POS:</b> ${formatTCShort(totalPos)}</span> <span class="rem-chip live" title="Tempo total restante da playlist"><b>REM:</b> -${formatTCShort(totalRem)}</span> <span class="dur-chip" title="Duração total da playlist"><b>DUR:</b> ${formatTCShort(totalDur)}</span> <span style="color:#94a3b8;font-size:12px;margin-left:4px;">· <b>${items.length}</b> ${items.length === 1 ? 'item' : 'itens'}</span>`;
  }

  // ---- state ----
  function applyState(s) {
    if (!s) return;
    state = s;
    renderLists();
    renderPreview(s.preview);
    renderProgram(s.program);
    renderTable(s.activeList?.items || []);
    if (plTotalInfo && Array.isArray(s.activeList?.items)) {
      updatePlaylistTotals(s);
    }
  }

  function renderLists() {
    if (!plSelect || !Array.isArray(state?.lists)) return;
    const signature = JSON.stringify(state.lists.map((l) => [l.id, l.name, l.itemCount]));
    if (plSelect.dataset.signature !== signature) {
      plSelect.dataset.signature = signature;
      plSelect.innerHTML = state.lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${l.itemCount ?? (l.items ? l.items.length : 0)})</option>`).join('');
    }
    if (state.activeListId) plSelect.value = state.activeListId;
    const list = state.activeList;
    if (list) {
      if (document.activeElement !== plName) plName.value = list.name || '';
    }
  }

  function renderPreview(pv) {
    const item = pv?.item;
    if (!item) {
      pvBadge.textContent = 'STANDBY'; pvBadge.className = 'badge-pv'; pvBadge.style.cssText = '';
      pvPlaceholder.hidden = false; pvThumb.hidden = true; pvTitle.hidden = true;
      pvCur.textContent = formatTC(0); pvDur.textContent = 'Duração: ' + formatTC(0);
      pvProgress.style.width = '0%';
      if (document.activeElement !== pvIn) pvIn.value = '';
      if (document.activeElement !== pvOut) pvOut.value = '';
      pvIn.disabled = pvOut.disabled = true;
      pvPreloadTime.textContent = 'Preload: 0ms';
      return;
    }
    pvIn.disabled = pvOut.disabled = false;
    pvPlaceholder.hidden = true; pvTitle.hidden = false;
    pvTitle.textContent = item.title || item.file || 'Sem título';
    if (item.thumbnail) { pvThumb.src = item.thumbnail; pvThumb.hidden = false; } else pvThumb.hidden = true;
    const st = String(pv.preloadState || 'ready').toLowerCase();
    pvBadge.textContent = st === 'loading' ? 'CARREGANDO' : st === 'error' ? 'ERRO' : st === 'ready' ? 'PREPARADO' : st.toUpperCase();
    pvBadge.className = 'badge-pv';
    pvBadge.style.cssText = st === 'ready' ? 'background:#1c3a2a;border-color:#2f7d55;color:#a9e8c4' : st === 'loading' ? 'background:#3a2f12;border-color:#8a6d1f;color:#f3d79a' : st === 'error' ? 'background:#4a1414;border-color:#c0392b;color:#ffc9c2' : '';
    const duration = (item.outMs && item.outMs > item.inMs) ? (item.outMs - (item.inMs || 0)) : (item.durationMs || 0);
    pvCur.textContent = formatTC(item.inMs || 0);
    pvDur.textContent = 'Duração: ' + formatTC(duration);
    if (document.activeElement !== pvIn) pvIn.value = formatTC(item.inMs || 0);
    if (document.activeElement !== pvOut) pvOut.value = formatTC(item.outMs || item.durationMs || 0);
    pvPreloadTime.textContent = 'Preload: ' + (pv.preloadDurationMs || 0) + 'ms';
    if (pv.transition) takeTrans.value = pv.transition;
    if (pv.transitionMs) takeMs.value = pv.transitionMs;
  }

  function renderProgram(pgm) {
    const item = pgm?.item, status = pgm?.status || 'stopped';
    const labels = { playing: 'NO AR', paused: 'PAUSADO', frozen: 'CONGELADO', hold: 'EM ESPERA', stopped: 'PARADO' };
    pgmBadge.textContent = labels[status] || 'PARADO';
    pgmBadge.className = 'badge-pgm' + (status === 'playing' ? ' on-air' : '');
    pgmBadge.style.cssText = status === 'playing' ? '' : status === 'paused' ? 'background:#3a2f12;border-color:#8a6d1f;color:#f3d79a' : status === 'frozen' ? 'background:#1e2f4a;border-color:#3d6ea6;color:#c7ddff' : status === 'hold' ? 'background:#2b1e3a;border-color:#6a4a9a;color:#ddc9ff' : '';
    if (!item || status === 'stopped') {
      pgmPlaceholder.hidden = false; pgmThumb.hidden = true; pgmTitle.hidden = true;
      pgmCur.textContent = formatTC(0); pgmRem.textContent = formatNegative(0);
      pgmProgress.style.width = '0%';
      pgmEnd.disabled = true; pgmEnd.value = 'play_next';
      return;
    }
    pgmEnd.disabled = false;
    if (document.activeElement !== pgmEnd) pgmEnd.value = item.endBehavior || pgm.endBehavior || 'play_next';
    pgmPlaceholder.hidden = true; pgmTitle.hidden = false;
    pgmTitle.textContent = item.title || item.file || 'Em exibição';
    if (item.thumbnail) { pgmThumb.src = item.thumbnail; pgmThumb.hidden = false; } else pgmThumb.hidden = true;
    updateProgramTimers();
  }

  function updateProgramTimers() {
    if (!state?.program?.item) return;
    const pgm = state.program;
    let pos = pgm.positionMs || 0;
    const dur = pgm.durationMs || 0;
    if (pgm.status === 'playing' && pgm.startedAt) pos = Math.min(dur, (pgm.positionMs || 0) + (Date.now() - pgm.startedAt));
    const rem = Math.max(0, dur - pos);
    pgmCur.textContent = formatTC(pos);
    pgmRem.textContent = formatNegative(rem);
    pgmProgress.style.width = (dur > 0 ? Math.min(100, Math.max(0, pos / dur * 100)) : 0) + '%';
    const trRem = $('table-pgm-rem');
    if (trRem) trRem.textContent = formatNegative(rem);
    updatePlaylistTotals(state, pos);
  }

  // ---- table ----
  const tableSignature = (items) => JSON.stringify({
    ids: items.map((i) => [i.id, i.enabled, i.title, i.inMs, i.outMs, i.endBehavior, i.audioGainDb, i.chainId, i.chainOrder, i.transitionIn, i.transitionMs]),
    pgm: state?.program?.item?.id || null, status: state?.program?.status || 'stopped', pv: state?.preview?.item?.id || null,
    sel: [...selectedItemIds].sort(), rundown: rundownInCommand(),
  });
  function renderTable(items) {
    if (!plTbody) return;
    const signature = tableSignature(items);
    if (signature === lastTableSignature) return;
    lastTableSignature = signature;
    plTbody.innerHTML = '';
    const pgmItemId = state?.program?.item?.id, pvItemId = state?.preview?.item?.id;
    items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.id = item.id; tr.dataset.index = idx; tr.draggable = true;
      const isPgm = pgmItemId === item.id, isPv = pvItemId === item.id, isSel = selectedItemIds.has(item.id);
      if (isPgm) tr.classList.add('is-on-air'); else if (isPv) tr.classList.add('is-preview'); else if (isSel) tr.classList.add('selected');
      tr.append(cell(String(idx + 1), 'center'));
      const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=item.enabled!==false;enabled.setAttribute('aria-label','Habilitar '+(item.title||'clipe'));enabled.onclick=e=>e.stopPropagation();enabled.onchange=async()=>{enabled.disabled=true;try{const result=await sendCommand('playout_item_update',{itemId:item.id,enabled:enabled.checked});if(!result)enabled.checked=item.enabled!==false;}finally{enabled.disabled=false;}};tr.lastElementChild.append(enabled);


      const tdStatus = document.createElement('td');
      tdStatus.innerHTML = isPgm ? (state.program.status === 'playing' ? '<span class="badge-state playing">No ar</span>' : '<span class="badge-state frozen">' + esc((state.program.status || '').toUpperCase()) + '</span>')
        : isPv ? '<span class="badge-state ready">Preparado</span>' : '<span class="badge-state idle">Parado</span>';
      tr.append(tdStatus);

      const tdChain = document.createElement('td');
      tdChain.innerHTML = item.chainId ? `<span class="badge-chain" title="Cadeia ${esc(item.chainId)}">🔗 ${esc(String(item.chainId).slice(0, 4).toUpperCase())} #${Number(item.chainOrder || 0) + 1}</span>` : '<span style="color:#6f6f6f">—</span>';
      tr.append(tdChain);

      const tdTitle = document.createElement('td');
      tdTitle.innerHTML = `<b style="color:#fff">${esc(item.title || 'Sem título')}</b><br><small style="color:#8f9aa6;font-size:10px">${esc(item.file || item.input || 'Sem origem')}</small>`;
      tr.append(tdTitle);

      const durNet = Math.max(0, (item.outMs || item.durationMs || 0) - (item.inMs || 0));
      tr.append(cell(formatTC(item.inMs || 0), '', 'tc-cell'));
      tr.append(cell(formatTC(item.outMs && item.outMs > 0 ? item.outMs : item.durationMs || 0), '', 'tc-cell'));
      tr.append(cell(formatTC(durNet), '', 'tc-cell dur-col'));
      const tdRem = cell(isPgm ? formatNegative(state.program.remainingMs ?? durNet) : formatTC(durNet), '', 'tc-cell rem-col' + (isPgm ? ' live-rem' : ''));
      if (isPgm) tdRem.id = 'table-pgm-rem';
      tr.append(tdRem);

      const tdTrans = document.createElement('td');
      tdTrans.textContent = `${String(item.transitionIn || 'cut').toUpperCase()} (${item.transitionMs || 500}ms)`;
      tr.append(tdTrans);

      const tdEnd = document.createElement('td');
      const end = document.createElement('select');
      end.className = 'end-select'; end.dataset.end = item.id; end.title = 'Comportamento deste clipe ao terminar';
      for (const [value, label] of [['play_next', 'Avançar'], ['loop', 'Repetir'], ['freeze', 'Congelar'], ['hold', 'Manter'], ['stop', 'Parar']]) end.add(new Option(label, value));
      end.value = item.endBehavior || 'play_next';
      end.title = rundownInCommand() ? 'Avanço automático suspenso pelo Rundown; ainda é possível executar o próximo manualmente' : 'Comportamento deste clipe ao terminar';
      end.addEventListener('click', (e) => e.stopPropagation());
      end.addEventListener('change', async (e) => {
        e.stopPropagation();
        await sendCommand('playout_item_update', { itemId: item.id, endBehavior: e.target.value, loop: e.target.value === 'loop' });
      });
      tdEnd.append(end); tr.append(tdEnd);

      const tdGain = document.createElement('td');
      const gain = document.createElement('input');
      gain.type = 'number'; gain.min = '-30'; gain.max = '30'; gain.step = '0.5'; gain.className = 'gain-input';
      gain.value = Number(item.audioGainDb || 0); gain.title = 'Ganho de áudio deste clipe, antes do fader master (dB)';
      gain.addEventListener('click', (e) => e.stopPropagation());
      gain.addEventListener('keydown', (e) => { if (e.key === 'Enter') gain.blur(); });
      gain.addEventListener('change', async (e) => {
        e.stopPropagation();
        const value = Math.max(-30, Math.min(30, Number(gain.value || 0)));
        gain.value = value;
        await sendCommand('playout_item_update', { itemId: item.id, audioGainDb: value });
      });
      tdGain.append(gain); tr.append(tdGain);

      tr.addEventListener('click', (e) => {
        if (e.target.closest('select,input,button')) return;
        if (e.ctrlKey || e.metaKey) { if (selectedItemIds.has(item.id)) selectedItemIds.delete(item.id); else selectedItemIds.add(item.id); }
        else if (e.shiftKey && selectedItemIds.size > 0) {
          const firstId = [...selectedItemIds][0], firstIdx = items.findIndex((i) => i.id === firstId);
          selectedItemIds.clear();
          for (let i = Math.min(firstIdx, idx); i <= Math.max(firstIdx, idx); i++) selectedItemIds.add(items[i].id);
        } else { selectedItemIds.clear(); selectedItemIds.add(item.id); }
        renderTable(items);
      });
      tr.addEventListener('dblclick', (e) => {
        if (e.target.closest('select,input,button')) return;
        sendCommand('playout_preview_clip', { itemId: item.id });
        hint('Carregado no Preview.');
      });
      tr.addEventListener('dragstart', (e) => { dragSrcIndex = idx; e.dataTransfer.effectAllowed = 'move'; tr.style.opacity = '0.5'; });
      tr.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      tr.addEventListener('drop', (e) => { e.preventDefault(); if (dragSrcIndex !== null && dragSrcIndex !== idx) reorderItems(dragSrcIndex, idx); });
      tr.addEventListener('dragend', () => { tr.style.opacity = '1'; dragSrcIndex = null; });
      plTbody.appendChild(tr);
    });
    if (!items.length) plTbody.innerHTML = '<tr><td colspan="10" style="padding:14px;color:#9a9a9a">Playlist vazia. Use “Adicionar vídeo” para incluir o primeiro clipe.</td></tr>';
  }
  function cell(text, align = '', className = '') {
    const td = document.createElement('td');
    td.textContent = text; if (align) td.style.textAlign = align; if (className) td.className = className;
    return td;
  }

  function listPayload(items) {
    const list = state.activeList;
    return { id: list.id, name: list.name, items, autoAdvance: !rundownInCommand(), loop: false, transition: list.transition, fadeMs: list.fadeMs };
  }
  async function reorderItems(fromIdx, toIdx) {
    if (!state?.activeList?.items) return;
    const items = [...state.activeList.items];
    const [moved] = items.splice(fromIdx, 1); items.splice(toIdx, 0, moved);
    await sendCommand('playout_save_playlist', listPayload(items));
  }

  // ---- transport ----
  const plHint = $('pl-hint');
  const hint = (text) => { if (plHint) { plHint.textContent = text; clearTimeout(hint.timer); hint.timer = setTimeout(() => { plHint.textContent = ''; }, 2600); } };
  $('btn-load-selected')?.addEventListener('click', async () => {
    if (selectedItemIds.size !== 1) { hint('Selecione um clipe na lista para carregar.'); return; }
    const id = [...selectedItemIds][0];
    const result = await sendCommand('playout_preview_clip', { itemId: id });
    hint(result ? 'Carregado no Preview.' : 'Não foi possível carregar.');
  });
  $('btn-take')?.addEventListener('click', () => {
    const item = state?.preview?.item;
    if (!item) { hint('Carregue um clipe no Preview primeiro.'); return; }
    hint('');
    sendCommand('playout_take', { itemId: item.id, transition: takeTrans.value, transitionMs: Number(takeMs.value || 500) });
  });
  $('btn-take-next')?.addEventListener('click', () => { hint(''); sendCommand('playout_next'); });
  $('pgm-play')?.addEventListener('click', () => sendCommand('playout_play'));
  $('pgm-pause')?.addEventListener('click', () => sendCommand('playout_pause'));
  $('pgm-stop')?.addEventListener('click', () => sendCommand('playout_stop'));
  $('pgm-restart')?.addEventListener('click', () => sendCommand('playout_restart'));
  pgmEnd?.addEventListener('change', () => {
    const item = state?.program?.item; if (!item) return;
    sendCommand('playout_item_update', { itemId: item.id, endBehavior: pgmEnd.value, loop: pgmEnd.value === 'loop' });
  });
  $('pgm-seek-wrap')?.addEventListener('click', (e) => {
    if (!state?.program?.durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    sendCommand('playout_seek', { positionMs: Math.round(pct * state.program.durationMs) });
  });

  // IN / OUT do clipe preparado
  function commitInOut(which) {
    const item = state?.preview?.item; if (!item) return;
    const inMs = parseTC(pvIn.value), outMs = parseTC(pvOut.value);
    if (inMs === null || outMs === null) { pvIn.value = formatTC(item.inMs || 0); pvOut.value = formatTC(item.outMs || item.durationMs || 0); if (connEl) connEl.textContent = 'Timecode inválido: use hh:mm:ss.mmm'; return; }
    if (which === 'in') sendCommand('playout_item_update', { itemId: item.id, inMs });
    else sendCommand('playout_item_update', { itemId: item.id, outMs });
  }
  for (const [el, which] of [[pvIn, 'in'], [pvOut, 'out']]) {
    el?.addEventListener('change', () => commitInOut(which));
    el?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitInOut(which); } });
  }

  // ---- playlists ----
  plSelect?.addEventListener('change', () => sendCommand('playout_load_playlist', { id: plSelect.value }));
  $('pl-save')?.addEventListener('click', () => {
    if (!state?.activeList) return;
    const items = state.activeList.items || [];
    sendCommand('playout_save_playlist', { ...listPayload(items), name: plName.value.trim() || 'Playlist sem nome', transition: takeTrans.value, fadeMs: Number(takeMs.value || 500) });
  });
  $('pl-new')?.addEventListener('click', () => {
    const name = prompt('Nome da nova playlist:', 'Nova playlist');
    if (name) sendCommand('playout_save_playlist', { name: name.trim(), items: [], autoAdvance: !rundownInCommand(), loop: false });
  });
  $('pl-duplicate')?.addEventListener('click', () => {
    if (!state?.activeList) return;
    sendCommand('playout_save_playlist', { name: state.activeList.name + ' (cópia)', items: JSON.parse(JSON.stringify(state.activeList.items || [])), autoAdvance: !rundownInCommand(), loop: false });
  });
  $('pl-delete')?.addEventListener('click', () => {
    if (!state?.activeList) return;
    if (confirm('Excluir a playlist “' + state.activeList.name + '”?')) sendCommand('playout_delete_playlist', { id: state.activeList.id });
  });
  $('btn-remote-monitor')?.addEventListener('click', () => window.open('/playout-monitor', 'FreeMixPlayoutMonitor', 'width=1100,height=640,menubar=no,toolbar=no'));

  // ---- items ----
  $('btn-add-file')?.addEventListener('click', () => {
    const path = prompt('Caminho absoluto do vídeo ou áudio (ou nome de uma entrada do 3Mix):');
    if (!path || !path.trim()) return;
    const clean = path.trim(), filename = clean.split(/[/\\]/).pop() || 'Arquivo';
    const items = [...(state?.activeList?.items || []), {
      title: filename.replace(/\.[^/.]+$/, ''), file: clean, inMs: 0, outMs: 0, durationMs: 0,
      transitionIn: takeTrans.value || 'fade', transitionMs: Number(takeMs.value || 500), endBehavior: 'play_next', autoNext: true, audioGainDb: 0,
    }];
    sendCommand('playout_save_playlist', listPayload(items));
  });
  $('btn-link-chain')?.addEventListener('click', () => {
    if (selectedItemIds.size < 2) { alert('Selecione pelo menos 2 clipes com Ctrl+clique para vincular em cadeia.'); return; }
    sendCommand('playout_chain_link', { itemIds: [...selectedItemIds] });
  });
  $('btn-unlink-chain')?.addEventListener('click', () => { if (selectedItemIds.size) sendCommand('playout_chain_unlink', { itemIds: [...selectedItemIds] }); });
  $('btn-move-up')?.addEventListener('click', () => {
    if (selectedItemIds.size !== 1 || !state?.activeList?.items) return;
    const idx = state.activeList.items.findIndex((i) => i.id === [...selectedItemIds][0]);
    if (idx > 0) reorderItems(idx, idx - 1);
  });
  $('btn-move-down')?.addEventListener('click', () => {
    if (selectedItemIds.size !== 1 || !state?.activeList?.items) return;
    const idx = state.activeList.items.findIndex((i) => i.id === [...selectedItemIds][0]);
    if (idx >= 0 && idx < state.activeList.items.length - 1) reorderItems(idx, idx + 1);
  });
  $('btn-dup-item')?.addEventListener('click', () => {
    if (selectedItemIds.size !== 1 || !state?.activeList?.items) return;
    const idx = state.activeList.items.findIndex((i) => i.id === [...selectedItemIds][0]);
    if (idx < 0) return;
    const items = [...state.activeList.items], dup = JSON.parse(JSON.stringify(items[idx]));
    dup.id = null; dup.title = (dup.title || 'Clipe') + ' (cópia)';
    items.splice(idx + 1, 0, dup);
    sendCommand('playout_save_playlist', listPayload(items));
  });
  $('btn-rem-item')?.addEventListener('click', () => {
    if (!selectedItemIds.size || !state?.activeList?.items) return;
    const items = state.activeList.items.filter((i) => !selectedItemIds.has(i.id));
    selectedItemIds.clear();
    sendCommand('playout_save_playlist', listPayload(items));
  });
  $('btn-close')?.addEventListener('click', () => window.FreeMixClosePanel?.());

  function tick() { updateProgramTimers(); animFrame = requestAnimationFrame(tick); }

  fetchState(); fetchRundown();
  pollTimer = setInterval(fetchState, 1000);
  rundownTimer = setInterval(fetchRundown, 3000);
  animFrame = requestAnimationFrame(tick);
  window.addEventListener('beforeunload', () => { clearInterval(pollTimer); clearInterval(rundownTimer); cancelAnimationFrame(animFrame); });
})();
