let replay = null, deck = 'A', busy = false, retentionDirty = false, eventsSignature = '';
let historyState = null, historyIn = null, historyOut = null, historyConfirmed = null;

if (new URLSearchParams(location.search).get('view') === 'settings') {
  document.title = '3Mix · Configurações do Replay';
  const audioDet = document.getElementById('replay-camera-audio');
  if (audioDet) audioDet.open = true;
}

const anglesByEvent = new Map();
const el = (id) => document.getElementById(id);

async function request(action, data = {}) {
  // Operator commands must not be silently dropped while a background task
  // (history scan or another command) is still running.
  for (let wait = 0; busy && wait < 60; wait++) await new Promise((done) => setTimeout(done, 250));
  if (busy) return false;
  busy = true;
  const impBtn = el('import-btn');
  if (impBtn) impBtn.disabled = true;
  const msg = el('message');
  if (msg) msg.textContent = 'Confirmando operação com o motor…';
  try {
    const response = await fetch('/api/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
      signal: AbortSignal.timeout(action === 'import' ? 600000 : action === 'trim-event' ? 600000 : 180000)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Operação recusada');
    if (action === 'retention') retentionDirty = false;
    render(result.replay);
    if (Object.hasOwn(result.replay, 'history')) renderHistory(result.replay.history);
    if (result.replay.historyFrame) {
      const frame = result.replay.historyFrame;
      historyConfirmed = frame.cursor;
      el('history-seek').value = frame.cursor;
      el('history-cursor').value = frame.cursor.toFixed(3);
      el('history-image').src = frame.image;
      el('history-image').hidden = false;
      const emptyPl = el('history-empty');
      if (emptyPl) emptyPl.hidden = true;
      el('history-status').textContent = frame.cam + ' · quadro em ' + frame.cursor.toFixed(3) + ' s';
      setHistoryButtons(true);
    }
    if (action === 'capture-range') {
      historyIn = historyOut = null;
      renderHistoryMarks();
    }
    if (msg) {
      msg.textContent = ['capture', 'mark-out'].includes(action)
        ? 'Vídeo do lance salvo com sucesso nos ângulos gravados.'
        : action === 'capture-range'
          ? 'Lance salvo no histórico. Carregue A/B quando quiser preparar.'
          : 'Operação confirmada pelo motor 3Mix.';
    }
    if (navigator.vibrate) navigator.vibrate(25);
    return true;
  } catch (error) {
    if (msg) msg.textContent = error.message;
    return false;
  } finally {
    busy = false;
    if (impBtn) impBtn.disabled = false;
    setHistoryButtons(historyConfirmed !== null);
  }
}

function renderBase(data) {
  replay = data;
  const histRef = el('history-refresh');
  if (histRef) histRef.disabled = !data.historySupported;
  if (!data.historySupported && el('history-status')) {
    el('history-status').textContent = 'A timeline aguarda a atualização do serviço de controle. A gravação continua ativa.';
  }
  renderCameraOptions(data);
  const retSave = el('retention-save');
  if (retSave) retSave.disabled = !!data.rec;
  if (!retentionDirty && el('retention-enabled')) {
    el('retention-enabled').checked = !!data.retention?.enabled;
    el('retention-minutes').value = data.retention?.minutes || 30;
  }
  const linkBtn = el('link-players');
  if (linkBtn) linkBtn.textContent = data.linked ? '🔗 Desvincular Players A/B' : '🔗 Vincular Players A/B';
  const speedSelect = el('speed-select');
  if (speedSelect && document.activeElement !== speedSelect) speedSelect.value = String(data.speed ?? 50);

  const recStatus = el('rec-status');
  if (recStatus) {
    recStatus.textContent = data.rec ? '● SSD GRAVANDO' : '○ SSD PARADO';
    recStatus.dataset.rec = data.rec ? '1' : '0';
    recStatus.style.cssText = '';
  }

  const recBtn = el('record-btn');
  if (recBtn) {
    recBtn.textContent = data.rec ? '⏹ Parar gravação SSD' : '🔴 Iniciar gravação SSD';
    recBtn.classList.toggle('recording', !!data.rec);
  }

  // ATUALIZAÇÃO DOS PLAYERS E TALLY BROADCAST
  for (const player of ['A', 'B', 'C', 'D']) {
    const loaded = data.players?.[player];
    const isProgram = data.program === 'REPLAY ' + player;
    const playerEl = el('player-' + player);
    if (playerEl) {
      playerEl.textContent = loaded ? loaded.cam + (isProgram ? ' — [ NO AR ]' : ' — carregado') : 'Nenhum lance carregado';
      playerEl.dataset.state = isProgram ? 'onair' : loaded ? 'loaded' : 'empty';
      playerEl.style.color = '';
    }

    const badge = el('player-' + player.toLowerCase() + '-badge');
    if (badge) {
      badge.className = 'badge-loaded';
      badge.style.cssText = '';
      if (isProgram) {
        badge.textContent = '🔴 NO AR';
        badge.dataset.state = 'onair';
      } else if (loaded) {
        badge.textContent = 'CARREGADO';
        badge.dataset.state = 'loaded';
      } else {
        badge.textContent = player === 'A' ? 'CANAL PRIMÁRIO' : player === 'B' ? 'CANAL SECUNDÁRIO' : 'CANAL ' + player;
        badge.dataset.state = 'empty';
      }
    }
  }

  // SELEÇÃO DE CÂMERAS A GRAVAR
  const cams = el('cam-select');
  if (cams) {
    const selected = [...cams.querySelectorAll('input:checked')].map((i) => i.value);
    cams.replaceChildren();
    for (const [i, name] of (data.availableCams || []).entries()) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = name;
      input.disabled = data.rec;
      input.checked = data.rec ? data.session.cams.some((c) => c.name === name) : selected.length ? selected.includes(name) : i === 0;
      label.append(input, document.createTextNode(name));
      cams.append(label);
    }
  }

  // RENDERIZAÇÃO DOS LANCES SALVOS COMO TABELA OPERACIONAL
  const eventList = data.events || [];
  const nextSignature = JSON.stringify(eventList.map(e => [e.id, e.name, e.category, e.time, e.dur, e.imported, e.recovered, e.available, (e.clips || []).map(c => [c.cam, c.available, c.duration])]));
  if (nextSignature === eventsSignature) return;
  eventsSignature = nextSignature;

  const box = el('events-list');
  if (!box) return;
  box.replaceChildren();
  const table = box.tagName === 'TBODY';

  for (const [index, event] of eventList.entries()) {
    const clips = event.clips || [];
    const row = document.createElement(table ? 'tr' : 'div');
    row.className = table ? 'ev-row' : 'ev-item';
    row.dataset.event = event.id;
    row.draggable = true;
    row.ondragstart = e => {
      if (busy) { e.preventDefault(); return; }
      e.dataTransfer.setData('application/freemix-replay-id', event.id);
      e.dataTransfer.effectAllowed = 'move';
    };
    row.ondragover = e => {
      if (!busy) { e.preventDefault(); row.classList.add('drag-over'); }
    };
    row.ondragleave = () => row.classList.remove('drag-over');
    row.ondrop = e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      reorderBefore(e.dataTransfer.getData('application/freemix-replay-id'), event.id);
    };

    if (table) {
      const titleCell = document.createElement('td');
      titleCell.className = 'ev-title-cell';
      const title = document.createElement('strong');
      title.className = 'ev-name';
      title.textContent = event.name;
      const category = document.createElement('small');
      category.className = 'ev-category';
      category.textContent = event.category || 'Lance';
      titleCell.append(title, category);

      const timeCell = document.createElement('td');
      timeCell.className = 'ev-time';
      timeCell.textContent = event.time || (event.createdAt ? new Date(event.createdAt).toLocaleTimeString('pt-BR') : '—');

      const durationCell = document.createElement('td');
      durationCell.className = 'ev-duration';
      durationCell.textContent = Number(event.dur).toFixed(2) + ' s';

      const anglesCell = document.createElement('td');
      anglesCell.className = 'ev-angles';
      anglesCell.textContent = String(clips.length);
      anglesCell.title = clips.map(c => c.cam).join(' · ');

      const availableCount = clips.filter(c => c.available !== false).length;
      const availableCell = document.createElement('td');
      availableCell.className = 'ev-available ' + (!event.available ? 'unavailable' : availableCount === clips.length ? 'available' : 'partial');
      availableCell.textContent = !event.available ? 'INDISPONÍVEL' : availableCount === clips.length ? 'DISPONÍVEL' : availableCount + ' DE ' + clips.length;

      const controls = document.createElement('td');
      controls.className = 'ev-actions';
      const primary = clips.find(c => c.cam === event.cam) || clips[0];
      const loadable = !!primary && primary.available !== false;

      const btnA = document.createElement('button');
      btnA.className = 'btn-deck-load btn-load-a';
      btnA.textContent = 'A';
      btnA.title = 'Carregar este lance no Player A (prepara, não coloca no ar)';
      btnA.dataset.rpCommand = '';
      if (!loadable) btnA.dataset.blocked = '';
      btnA.onclick = e => { e.stopPropagation(); playInDeck('A', event.id, primary?.cam || event.cam); };

      const btnB = document.createElement('button');
      btnB.className = 'btn-deck-load btn-load-b';
      btnB.textContent = 'B';
      btnB.title = 'Carregar este lance no Player B (prepara, não coloca no ar)';
      btnB.dataset.rpCommand = '';
      if (!loadable) btnB.dataset.blocked = '';
      btnB.onclick = e => { e.stopPropagation(); playInDeck('B', event.id, primary?.cam || event.cam); };

      controls.append(btnA, btnB);

      const order = document.createElement('span');
      order.className = 'ev-order';
      for (const [label, delta] of [['↑', -1], ['↓', 1]]) {
        const button = document.createElement('button');
        button.className = 'ev-order-btn';
        button.textContent = label;
        button.title = delta < 0 ? 'Mover para cima' : 'Mover para baixo';
        button.dataset.rpCommand = '';
        if (index + delta < 0 || index + delta >= eventList.length) button.dataset.blocked = '';
        button.onclick = e => { e.stopPropagation(); moveEvent(event.id, delta); };
        order.append(button);
      }
      controls.append(order);
      row.append(titleCell, timeCell, durationCell, anglesCell, availableCell, controls);
    } else {
      const info = document.createElement('div');
      info.className = 'ev-info';
      const title = document.createElement('span');
      title.className = 'ev-name';
      title.textContent = (index + 1) + '. ' + event.name;
      const meta = document.createElement('span');
      meta.className = 'ev-meta';
      meta.textContent = Number(event.dur).toFixed(2) + 's · ' + clips.length + ' ângulos' + (event.imported ? ' · importado' : '') + (event.recovered ? ' · recuperado' : '');
      info.append(title, meta);
      const controls = document.createElement('div');
      controls.className = 'ev-controls';
      const primary = clips.find(c => c.cam === event.cam) || clips[0];
      const loadable = !!primary && primary.available !== false;
      for (const player of ['A', 'B']) {
        const button = document.createElement('button');
        button.className = 'btn-deck-load btn-load-' + player.toLowerCase();
        button.textContent = player;
        button.title = 'Carregar no Player ' + player;
        button.dataset.rpCommand = '';
        if (!loadable) button.dataset.blocked = '';
        button.onclick = e => { e.stopPropagation(); playInDeck(player, event.id, primary?.cam || event.cam); };
        controls.append(button);
      }
      row.append(info, controls);
    }
    box.append(row);
  }

  if (!eventList.length) {
    if (table) {
      const row = document.createElement('tr'), cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'events-empty';
      cell.textContent = 'Nenhum lance gravado. Inicie REC SSD e capture um lance (−5 s, −10 s, −20 s ou MARK IN/OUT).';
      row.append(cell);
      box.append(row);
    } else {
      box.textContent = 'Nenhum lance gravado. Inicie REC SSD e capture um lance (−5 s, −10 s, −20 s ou MARK IN/OUT).';
    }
  }
}

function time(ms) {
  const s = Math.max(0, Number(ms) || 0) / 1000;
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function render(data) {
  if (!data) return;
  renderBase(data);

  for (const player of ['A', 'B', 'C', 'D']) {
    const media = data.players?.[player];
    const missing = !!media && media.available === false;
    const slider = el('seek-' + player);
    const duration = media?.mediaDuration || Number(media?.duration || 0) * 1000;
    const cursor = media?.mediaCursor || 0;
    if (slider) {
      slider.max = Math.max(0, duration);
      slider.disabled = !media || missing;
      if (document.activeElement !== slider) slider.value = Math.min(cursor, duration);
    }
    const pos = el('position-' + player);
    if (pos) {
      pos.textContent = missing
        ? 'ARQUIVO AUSENTE · player bloqueado'
        : time(cursor) + ' / ' + time(duration) + (media?.mediaState === 'OBS_MEDIA_STATE_PLAYING' ? ' · reproduzindo' : media?.mediaState === 'OBS_MEDIA_STATE_PAUSED' ? ' · pausado' : '');
    }
  }

  const recoverable = !data.rec && data.markIn && data.session && data.markIn.sessionId === data.session.id;
  if (el('interruption')) el('interruption').hidden = !recoverable && !data.interrupted;
  if (el('recover-in')) el('recover-in').disabled = !recoverable;
  if (el('interruption-text')) {
    el('interruption-text').textContent = recoverable
      ? 'Há um IN aberto com gravação parada. Recupere o vídeo disponível até o fim (máximo 120 segundos).'
      : data.interrupted?.reason || '';
  }

  const totalEl = el('events-total');
  if (totalEl) {
    totalEl.textContent = (data.events?.length || 0) + ' lances · ' + time((data.events || []).reduce((sum, e) => sum + (Number(e.dur) || 0) * 1000, 0)) + ' totais';
  }
}

function seekPlayer(player, cursor) {
  request('seek', { player, cursor: Number(cursor) });
}

function historyStep() {
  const parts = historyState?.frameRate?.split('/').map(Number);
  return parts?.[0] && parts?.[1] ? parts[1] / parts[0] : 1 / 30;
}

function setHistoryButtons(confirmed) {
  for (const id of ['history-back-frame', 'history-next-frame']) {
    const btn = el(id);
    if (btn) btn.disabled = !historyState || busy;
  }
  for (const id of ['history-in', 'history-out']) {
    const btn = el(id);
    if (btn) btn.disabled = !confirmed;
  }
}

function renderHistory(history) {
  if (!history) {
    stopHistoryVideo();
    historyState = null;
    historyIn = historyOut = historyConfirmed = null;
    setHistoryButtons(false);
    if (el('history-status')) el('history-status').textContent = 'Nenhuma sessão gravada disponível.';
    const emptyPl = el('history-empty');
    if (emptyPl) emptyPl.hidden = false;
    return;
  }
  if (historyState?.sessionId !== history.sessionId) {
    stopHistoryVideo();
    historyIn = historyOut = historyConfirmed = null;
    if (el('history-image')) el('history-image').hidden = true;
    const emptyPl = el('history-empty');
    if (emptyPl) emptyPl.hidden = false;
  }
  historyState = history;
  const slider = el('history-seek');
  const cursor = el('history-cursor');
  const old = Number(slider.value);
  const wasDisabled = slider.disabled;

  slider.min = cursor.min = history.start;
  slider.max = cursor.max = history.end;
  slider.step = cursor.step = historyStep();
  slider.disabled = cursor.disabled = false;
  slider.value = cursor.value = wasDisabled ? Math.max(history.start, history.end - 1) : Math.min(history.end, Math.max(history.start, old));

  const camera = el('history-camera');
  const selected = camera.value;
  camera.replaceChildren();
  for (const name of history.cameras) {
    const o = document.createElement('option');
    o.textContent = name;
    camera.append(o);
  }
  if (history.cameras.includes(selected)) camera.value = selected;

  if (el('history-status')) {
    el('history-status').textContent = 'Histórico disponível de ' + history.start.toFixed(3) + ' a ' + history.end.toFixed(3) + ' s · ' + (history.recording ? 'gravando' : 'gravação parada') + '.';
  }
  setHistoryButtons(historyConfirmed !== null);
  renderHistoryMarks();
}

function refreshHistory() {
  return request('history');
}

function historyCursorChanged() {
  el('history-cursor').value = Number(el('history-seek').value).toFixed(3);
  historyConfirmed = null;
  setHistoryButtons(false);
}

function historyPositionChanged() {
  if (!historyState) return;
  el('history-seek').value = Math.min(historyState.end, Math.max(historyState.start, Number(el('history-cursor').value)));
  historyCursorChanged();
  previewHistory();
}

function previewHistory() {
  if (!historyState || busy) return;
  historyConfirmed = null;
  setHistoryButtons(false);
  const emptyPl = el('history-empty');
  if (emptyPl) emptyPl.hidden = true;
  if (replay?.historyPlaybackSupported) {
    startHistoryVideo(Number(el('history-seek').value), false);
  } else {
    request('history-frame', { sessionId: historyState.sessionId, cam: el('history-camera').value, cursor: Number(el('history-seek').value) });
  }
}

function stepHistory(delta) {
  if (!historyState || busy) return;
  el('history-seek').value = Math.min(historyState.end, Math.max(historyState.start, Number(el('history-seek').value) + delta * historyStep()));
  historyCursorChanged();
  previewHistory();
}

function markHistory(which) {
  if (historyConfirmed === null) return;
  if (which === 'in') historyIn = historyConfirmed;
  else historyOut = historyConfirmed;
  renderHistoryMarks();
  renewHistoryPin();
}

function renderHistoryMarks() {
  const valid = historyIn !== null && historyOut !== null && historyOut - historyIn >= .2 && historyOut - historyIn <= 120 && historyIn >= historyState.start && historyOut <= historyState.end;
  const rangeEl = el('history-range');
  if (rangeEl) {
    rangeEl.textContent = 'IN: ' + (historyIn === null ? '—' : historyIn.toFixed(3) + ' s') + ' · OUT: ' + (historyOut === null ? '—' : historyOut.toFixed(3) + ' s') + (valid ? ' · ' + (historyOut - historyIn).toFixed(3) + ' s' : '');
  }
  const saveBtn = el('history-save');
  if (saveBtn) saveBtn.disabled = !valid;
}

function saveHistoryRange() {
  if (el('history-save').disabled || busy) return;
  request('capture-range', { sessionId: historyState.sessionId, start: historyIn, end: historyOut });
}

// PIPELINE DE PRÉVIA DE VÍDEO DO HISTÓRICO VIA MEDIASOURCE
let historyPlayback = null, historyGeneration = 0, historyRefreshAt = 0, historyRefreshing = false, historyPinAt = 0;
const historyViewerId = crypto.randomUUID();

async function historyApi(action, data = {}, signal) {
  const response = await fetch('/api/replay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
    signal: signal || AbortSignal.timeout(35000)
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw Error(result.error || 'Prévia indisponível');
  return result.replay;
}

function stopHistoryVideo() {
  historyGeneration++;
  const own = historyPlayback;
  historyPlayback = null;
  if (own) {
    own.controller.abort();
    URL.revokeObjectURL(own.url);
  }
  const video = el('history-video');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
  }
  const playBtn = el('history-play');
  if (playBtn) playBtn.textContent = '▶ Reproduzir';
}

function updateHistoryVideoCursor() {
  const own = historyPlayback;
  const video = el('history-video');
  if (!own || video.readyState < 2) return;
  const cursor = Math.min(historyState.end, own.origin + video.currentTime);
  historyConfirmed = cursor;
  if (document.activeElement !== el('history-seek')) el('history-seek').value = cursor;
  el('history-cursor').value = cursor.toFixed(3);
  setHistoryButtons(true);
}

async function appendHistoryProxy(own, meta, bytes) {
  if (own !== historyPlayback) return;
  const sb = own.buffer;
  await new Promise((resolve, reject) => {
    const clear = () => {
      sb.removeEventListener('updateend', done);
      sb.removeEventListener('error', fail);
      own.controller.signal.removeEventListener('abort', abort);
    };
    const done = () => { clear(); resolve(); };
    const fail = () => { clear(); reject(Error('O navegador recusou os quadros da prévia')); };
    const abort = () => { clear(); reject(Error('Busca substituída')); };
    sb.addEventListener('updateend', done, { once: true });
    sb.addEventListener('error', fail, { once: true });
    own.controller.signal.addEventListener('abort', abort, { once: true });
    try {
      sb.timestampOffset = meta.start - own.origin;
      sb.appendWindowStart = Math.max(0, meta.start - own.origin);
      sb.appendWindowEnd = meta.end - own.origin + .035;
      sb.appendBuffer(bytes);
    } catch (e) {
      clear();
      reject(e);
    }
  });
  if (own !== historyPlayback) return;
  own.end = meta.end;
  own.media.duration = Math.max(own.media.duration || 0, meta.end - own.origin + .04);
  own.lastPrepareMs = meta.prepareMs;

  const cutoff = el('history-video').currentTime - 24;
  if (cutoff > 0 && !sb.updating) {
    sb.remove(0, cutoff);
    await new Promise(resolve => sb.addEventListener('updateend', resolve, { once: true }));
  }
}

async function getHistoryProxy(own, cursor, from) {
  const result = await historyApi('history-preview', {
    sessionId: own.sessionId,
    cam: own.cam,
    cursor,
    viewerId: historyViewerId,
    ...(from !== undefined ? { from } : {})
  }, own.controller.signal);
  if (own !== historyPlayback) throw Error('Busca substituída');
  const meta = result.historyPreview;
  if (!meta || !meta.url.startsWith('/api/replay-preview/')) throw Error('O serviço não forneceu vídeo de prévia');
  const response = await fetch(meta.url, { signal: own.controller.signal });
  if (!response.ok) throw Error('Prévia expirou; escolha o ponto novamente');
  return { meta, bytes: await response.arrayBuffer() };
}

async function startHistoryVideo(cursor, playing) {
  if (!historyState) return;
  stopHistoryVideo();
  const generation = historyGeneration;
  const video = el('history-video');
  if (!window.MediaSource || !MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E02A,mp4a.40.2"')) {
    if (el('history-status')) el('history-status').textContent = 'Este navegador não oferece H.264/AAC para prévia em vídeo. Exibindo quadros sob demanda.';
    request('history-frame', { sessionId: historyState.sessionId, cam: el('history-camera').value, cursor });
    return;
  }
  const media = new MediaSource();
  const url = URL.createObjectURL(media);
  const own = {
    media,
    url,
    controller: new AbortController(),
    sessionId: historyState.sessionId,
    cam: el('history-camera').value,
    generation,
    loading: true
  };
  historyPlayback = own;
  el('history-image').hidden = true;
  video.hidden = false;
  video.src = url;
  video.muted = !el('history-audio').checked;
  if (el('history-status')) el('history-status').textContent = 'Preparando prévia do ponto escolhido…';

  try {
    await new Promise((resolve, reject) => {
      media.addEventListener('sourceopen', resolve, { once: true });
      own.controller.signal.addEventListener('abort', () => reject(Error('Busca substituída')), { once: true });
    });
    const { meta, bytes } = await getHistoryProxy(own, cursor);
    own.origin = meta.start;
    own.buffer = media.addSourceBuffer('video/mp4; codecs="' + meta.codecs + '"');
    own.buffer.mode = 'segments';
    await appendHistoryProxy(own, meta, bytes);
    if (own !== historyPlayback) return;

    video.currentTime = Math.max(0, meta.cursor - own.origin);
    own.loading = false;
    if (el('history-status')) {
      el('history-status').textContent = 'Prévia local · ' + own.cam + ' · vídeo e áudio' + (meta.hasAudio ? '' : ' (sem áudio gravado)') + ' · ' + meta.prepareMs + ' ms';
    }
    if (playing) {
      await video.play();
      el('history-play').textContent = '⏸ Pausar';
    }
    updateHistoryVideoCursor();
    pumpHistoryVideo();
  } catch (e) {
    if (own !== historyPlayback) return;
    stopHistoryVideo();
    if (el('history-status')) el('history-status').textContent = e.message;
  }
}

async function pumpHistoryVideo() {
  const own = historyPlayback;
  const video = el('history-video');
  if (!own || own.loading || own.end - own.origin - video.currentTime > 5 || !historyState) return;
  const safeEnd = historyState.end - (historyState.recording ? .25 : 0);
  if (safeEnd - own.end < .5) return;
  own.loading = true;
  try {
    const wasPaused = video.paused;
    const { meta, bytes } = await getHistoryProxy(own, own.end + .001, own.end);
    if (own !== historyPlayback) return;
    if (meta.end <= own.end) return;
    await appendHistoryProxy(own, meta, bytes);
    if (!wasPaused || own.resumeWhenReady) {
      await video.play();
      own.resumeWhenReady = false;
      el('history-play').textContent = '⏸ Pausar';
    }
  } catch (e) {
    if (own === historyPlayback && !own.controller.signal.aborted) el('history-status').textContent = e.message;
  } finally {
    own.loading = false;
  }
}

function toggleHistoryPlayback() {
  const video = el('history-video');
  if (!historyPlayback) {
    startHistoryVideo(Number(el('history-seek').value), true);
    return;
  }
  if (video.paused) {
    historyPlayback.resumeWhenReady = true;
    video.play().then(() => {
      el('history-play').textContent = '⏸ Pausar';
    }).catch(e => {
      el('history-status').textContent = e.message;
    });
  } else {
    video.pause();
    historyPlayback.resumeWhenReady = false;
    el('history-play').textContent = '▶ Reproduzir';
  }
}

function historyMonitorAudio() {
  el('history-video').muted = !el('history-audio').checked;
}

function followHistoryEnd() {
  if (historyState) startHistoryVideo(Math.max(historyState.start, historyState.end - 2), true);
}

async function renewHistoryPin() {
  if (historyIn === null || !historyState) return;
  historyPinAt = Date.now();
  try {
    await historyApi('history-pin', {
      sessionId: historyState.sessionId,
      start: historyIn,
      end: historyOut !== null && historyOut >= historyIn && historyOut - historyIn <= 120 ? historyOut : Math.min(historyIn + 120, historyState.end)
    });
  } catch (e) {
    el('history-status').textContent = e.message;
  }
}

async function autoHistory() {
  if (busy || historyRefreshing || !replay?.historySupported || Date.now() - historyRefreshAt < (replay.rec ? 4000 : 8000)) return;
  historyRefreshAt = Date.now();
  historyRefreshing = true;
  try {
    const result = await historyApi('history');
    const incoming = result.history;
    let expired = false;
    if (historyState && incoming?.sessionId !== historyState.sessionId) stopHistoryVideo();
    if (historyPlayback && incoming?.start > historyPlayback.origin + el('history-video').currentTime) {
      stopHistoryVideo();
      historyConfirmed = null;
      expired = true;
    }
    if (historyIn !== null && incoming?.start > historyIn) {
      historyIn = historyOut = null;
      expired = true;
    }
    renderHistory(incoming);
    if (expired) el('history-status').textContent = 'O ponto expirou pela retenção circular. Escolha outro ponto.';
    el('history-play').disabled = !incoming || !result.historyPlaybackSupported;
    el('history-follow').disabled = !incoming || !result.historyPlaybackSupported;
    if (historyIn !== null && Date.now() - historyPinAt > 30000) renewHistoryPin();
    pumpHistoryVideo();
  } catch (e) {
    if (!historyState) el('history-status').textContent = e.message;
  } finally {
    historyRefreshing = false;
  }
}

const histVid = el('history-video');
if (histVid) {
  histVid.addEventListener('timeupdate', updateHistoryVideoCursor);
  histVid.addEventListener('seeked', updateHistoryVideoCursor);
  histVid.addEventListener('ended', () => {
    if (historyPlayback) {
      historyPlayback.resumeWhenReady = !!historyState?.recording;
      el('history-play').textContent = '▶ Reproduzir';
    }
  });
}
setInterval(pumpHistoryVideo, 500);
window.addEventListener('pagehide', () => { stopHistoryVideo(); });

let cameraSignature = '';
function renderCameraOptions(data) {
  const choices = [...new Set([...(data.availableCams || []), ...Object.values(data.players || {}).map(p => p.cam), ...(data.events || []).flatMap(e => (e.clips || []).map(c => c.cam))])].filter(Boolean);
  const signature = JSON.stringify(choices);
  const select = el('audio-cam');
  if (select && signature !== cameraSignature) {
    const old = select.value;
    select.replaceChildren();
    for (const cam of choices) {
      const option = document.createElement('option');
      option.value = cam;
      option.textContent = cam;
      select.append(option);
    }
    if (choices.includes(old)) select.value = old;
    cameraSignature = signature;
    showCameraOptions();
  }
  if (el('audio-record')) el('audio-record').disabled = !!data.rec;
  if (el('replay-audio')) el('replay-audio').textContent = data.audioEnabled ? 'Áudio Ligado' : 'Áudio Silenciado';

  const sync = data.sync;
  if (el('sync-status')) {
    el('sync-status').textContent = sync
      ? `Desvio: ${sync.mode === 'frame' ? `${Number(sync.differenceFrames).toFixed(2)} qd · ${sync.frameRate} fps` : `${Number(sync.differenceMs).toFixed(1)} ms`} · ${sync.paused ? 'pausado' : 'em reprodução'}. Calibre com evento visual.`
      : 'Vincule A/B com mesma taxa para avançar quadro a quadro sincronizado.';
  }

  for (const p of ['A', 'B', 'C', 'D']) {
    const rate = data.players?.[p]?.frameRate?.split('/').map(Number);
    const s = el('seek-' + p);
    if (s && rate?.[0]) s.step = 1000 * rate[1] / rate[0];
  }
}

function showCameraOptions() {
  const camSel = el('audio-cam');
  if (!camSel) return;
  const value = replay?.cameraOptions?.[camSel.value] || {};
  if (el('audio-record')) el('audio-record').value = value.recordAudio || 'input';
  if (el('audio-gain')) el('audio-gain').value = value.gainDb || 0;
  if (el('audio-muted')) el('audio-muted').checked = !!value.muted;
  if (el('camera-offset')) el('camera-offset').value = value.offsetFrames || 0;
}

function saveCameraOptions() {
  const camSel = el('audio-cam');
  if (!camSel) return;
  request('camera-options', {
    cam: camSel.value,
    options: {
      recordAudio: el('audio-record').value,
      gainDb: Number(el('audio-gain').value),
      muted: el('audio-muted').checked,
      offsetFrames: Number(el('camera-offset').value)
    }
  });
}

function moveEvent(id, delta) {
  const ids = (replay?.events || []).map(e => e.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  request('reorder', { ids });
}

function reorderBefore(source, target) {
  if (!source || source === target) return;
  const ids = (replay?.events || []).map(e => e.id);
  if (!ids.includes(source) || !ids.includes(target)) return;
  ids.splice(ids.indexOf(source), 1);
  ids.splice(ids.indexOf(target), 0, source);
  request('reorder', { ids });
}

function importClip() {
  const file = el('import-file').value.trim();
  if (!file) {
    if (el('message')) el('message').textContent = 'Informe o caminho completo do vídeo neste computador.';
    return;
  }
  request('import', { file, name: el('import-name').value.trim(), cam: el('import-cam').value.trim() });
}

function saveRetention() {
  request('retention', { enabled: el('retention-enabled').checked, minutes: Number(el('retention-minutes').value), segmentSeconds: 60 });
}

function selectDeck(value, element) {
  deck = value;
  document.querySelectorAll('.deck-card').forEach((c) => c.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  } else {
    const card = document.querySelector(`.deck-card.deck-${value.toLowerCase()}`);
    if (card) card.classList.add('active');
  }
}

function toggleRecording() {
  request(replay?.rec ? 'stop' : 'start', { cams: [...el('cam-select').querySelectorAll('input:checked')].map((i) => i.value) });
}

function quickClip(seconds) {
  request('capture', { seconds });
}

function markIn() {
  request('mark-in');
}

function markOut() {
  request('mark-out');
}

function setSpeed(speed) {
  const val = Number(speed);
  if (el('speed-lbl')) el('speed-lbl').textContent = val + '%';
  if (el('speed-select')) el('speed-select').value = String(val);
  const range = document.querySelector('.st-slider');
  if (range) range.value = val;
  request('speed', { speed: val });
}

function playInDeck(player, eventId, cam) {
  selectDeck(player);
  request('load', { player, eventId, cam });
}

function takeReplayAir() {
  request('air', { player: deck });
}

function backToLive() {
  request('live');
}

async function poll() {
  if (busy) return;
  try {
    const response = await fetch('/api/replay', { signal: AbortSignal.timeout(5000) });
    const result = await response.json();
    if (result.success) {
      render(result.replay);
      autoHistory();
    } else if (el('rec-status')) {
      el('rec-status').textContent = result.error;
    }
  } catch {
    if (el('rec-status')) el('rec-status').textContent = '○ SEM CONEXÃO COM 3MIX';
  }
}

poll();
setInterval(poll, 1500);
