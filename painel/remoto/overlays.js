const DVE_PRESETS = {
  fullscreen: { name: 'Tela cheia', x: 0, y: 0, width: 1920, height: 1080, opacity: 1.0 },
  'pip-top-right': { name: 'PIP ↗', x: 1240, y: 80, width: 600, height: 338, opacity: 1.0 },
  'pip-top-left': { name: 'PIP ↖', x: 80, y: 80, width: 600, height: 338, opacity: 1.0 },
  'pip-bottom-right': { name: 'PIP ↘', x: 1240, y: 662, width: 600, height: 338, opacity: 1.0 },
  'pip-bottom-left': { name: 'PIP ↙', x: 80, y: 662, width: 600, height: 338, opacity: 1.0 },
  'lower-third': { name: 'Tarja', x: 80, y: 780, width: 1760, height: 220, opacity: 1.0 },
  'split-left': { name: 'Metade esq.', x: 0, y: 0, width: 960, height: 1080, opacity: 1.0 },
  'split-right': { name: 'Metade dir.', x: 960, y: 0, width: 960, height: 1080, opacity: 1.0 }
};

let currentChannel = 1;
let overlaysState = {
  channels: Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    name: String(i + 1),
    scene: '',
    transition: i === 0 ? 'Cut' : 'Fade',
    transitionDuration: i === 0 ? 0 : 500,
    transitionType: 'match',
    hideAfter: 0,
    tie: false,
    stinger: { enabled: false, name: 'Stinger 1', cutPointMs: 250, audio: true },
    dve: { preset: 'fullscreen', x: 0, y: 0, width: 1920, height: 1080, opacity: 1.0 }
  }))
};
let availableInputs = [];

// Entrada escolhida para cada canal enquanto ele está fora do ar. O motor só conhece a entrada no ar;
// sem isto a escolha do operador era apagada na atualização seguinte da tela.
const CHOICE_KEY = '3mix.dsk.escolha';
const readChoices = () => { try { return JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}') || {}; } catch { return {}; } };
const choices = readChoices();
const saveChoices = () => { try { localStorage.setItem(CHOICE_KEY, JSON.stringify(choices)); } catch { /* sem armazenamento local */ } };

const E = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const channelOf = (id) => overlaysState.channels.find((c) => c.id === id);

function showMsg(text, isError = false) {
  const el = E('message');
  if (!el) return;
  el.textContent = text;
  el.className = isError ? 'error' : 'ok';
  if (!isError) setTimeout(() => { if (el.textContent === text) { el.textContent = ''; el.className = ''; } }, 4000);
}

function updateTabs() {
  document.querySelectorAll('#channel-tabs button').forEach((btn) => {
    const chId = Number(btn.dataset.channel);
    const ch = channelOf(chId);
    const onAir = Boolean(ch?.scene);
    btn.classList.toggle('selected', chId === currentChannel);
    btn.setAttribute('aria-selected', String(chId === currentChannel));
    btn.classList.toggle('on-air', onAir);
    const who = btn.querySelector('.dsk-who');
    const text = onAir ? ch.scene : (choices[chId] || 'Livre');
    if (who && who.textContent !== text) { who.textContent = text; who.title = text; }
  });
}

function updateInputs() {
  const sel = E('channel-input');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Escolha a entrada…</option>' +
    availableInputs.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (currentVal && availableInputs.includes(currentVal)) sel.value = currentVal;
}

function populateTransitions() {
  const sel = E('channel-transition');
  if (!sel) return;
  const live = window.FreeMixRemote?.getState?.()?.transitions;
  const names = Array.isArray(live) ? live.map((t) => t.transitionName || t.name).filter(Boolean) : [];
  const options = names.length ? names : ['Cortar', 'Esmaecer', 'Wipe', 'Slide', 'Merge'];
  const current = sel.value;
  sel.innerHTML = options.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (options.includes(current)) sel.value = current;
}

function paintFrame() {
  const box = E('dve-frame');
  if (!box) return;
  const num = (id, fallback) => { const v = Number(E(id).value); return Number.isFinite(v) ? v : fallback; };
  box.style.left = (num('dve-x', 0) / 1920 * 100) + '%';
  box.style.top = (num('dve-y', 0) / 1080 * 100) + '%';
  box.style.width = (num('dve-w', 1920) / 1920 * 100) + '%';
  box.style.height = (num('dve-h', 1080) / 1080 * 100) + '%';
}

function paintDveStatus(ch) {
  const box = E('dve-status');
  if (!box || !ch) return;
  box.textContent = ch.dveError || '';
  box.style.color = ch.dveError ? '#ffb4a8' : '';
}

function paintBadge(ch) {
  const badge = E('channel-status-badge');
  if (!badge || !ch) return;
  const html = ch.scene ? `<span class="p3-badge air">No ar · ${esc(ch.scene)}</span>` : '<span class="p3-badge">Fora do ar</span>';
  if (badge.innerHTML !== html) badge.innerHTML = html;
  E('btn-channel-off').disabled = !ch.scene;
}

function paintInputChoice(ch) {
  const input = E('channel-input');
  if (!input || !ch || document.activeElement === input) return;
  const wanted = ch.scene || choices[ch.id] || '';
  if (wanted && ![...input.options].some((o) => o.value === wanted)) input.add(new Option(wanted + ' · atual', wanted));
  if (input.value !== wanted) input.value = wanted;
}

function renderEditor() {
  const ch = channelOf(currentChannel) || overlaysState.channels[0];
  E('channel-heading').textContent = `DSK ${ch.id}`;
  paintBadge(ch);
  paintInputChoice(ch);

  const wantedTransition = ({ Cut: 'Cortar', Fade: 'Esmaecer' })[ch.transition] || ch.transition || 'Esmaecer';
  const transitionSelect = E('channel-transition');
  if (wantedTransition && ![...transitionSelect.options].some((o) => o.value === wantedTransition)) {
    transitionSelect.add(new Option(wantedTransition + ' · não instalada', wantedTransition));
  }
  transitionSelect.value = [...transitionSelect.options].some((o) => o.value === wantedTransition)
    ? wantedTransition
    : (transitionSelect.options[0]?.value || '');
  E('channel-duration').value = ch.transitionDuration || 500;
  E('val-duration').textContent = `${ch.transitionDuration || 500} ms`;
  E('channel-trans-type').value = ch.transitionType || 'match';
  E('channel-hide-after').value = String(ch.hideAfter || 0);
  E('channel-tie').checked = Boolean(ch.tie);

  E('stinger-box').hidden = !String(ch.transition).startsWith('Stinger');
  if (ch.stinger) {
    E('stinger-cutpoint').value = ch.stinger.cutPointMs || 250;
    E('val-cutpoint').textContent = `${ch.stinger.cutPointMs || 250} ms`;
    E('stinger-audio').checked = ch.stinger.audio !== false;
  }

  const dve = ch.dve || DVE_PRESETS.fullscreen;
  E('dve-x').value = dve.x ?? 0;
  E('dve-y').value = dve.y ?? 0;
  E('dve-w').value = dve.width ?? 1920;
  E('dve-h').value = dve.height ?? 1080;
  E('dve-opacity').value = dve.opacity ?? 1.0;
  document.querySelectorAll('.dve-grid button').forEach((btn) => btn.classList.toggle('active', btn.dataset.dve === dve.preset));
  paintFrame();
  paintDveStatus(ch);
}

async function sendRequest(action, data) {
  if (window.FreeMixRemote?.command) return window.FreeMixRemote.command(action, data);
  const res = await fetch('/api/overlays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data })
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw Error(json.error || 'Erro na requisição');
  return json;
}

async function loadState() {
  try {
    const res = await fetch('/api/overlays', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.channels)) {
        overlaysState.channels = data.channels;
        const alias = { Cut: 'Cortar', Fade: 'Esmaecer' };
        for (const ch of overlaysState.channels) if (alias[ch.transition]) ch.transition = alias[ch.transition];
      }
      if (Array.isArray(data.inputs)) {
        availableInputs = data.inputs;
        updateInputs();
      }
    }
  } catch { /* mantém a última leitura */ }
  applyLiveHardware();
  populateTransitions();
  updateTabs();
  renderEditor();
}

let refreshing = false;
function liveHardware() {
  const live = window.FreeMixRemote?.getState?.()?.overlays;
  return Array.isArray(live) ? live : null;
}

function applyLiveHardware() {
  const live = liveHardware();
  if (!live) return false;
  let changed = false;
  for (const item of live) {
    const local = channelOf(Number(item.number));
    const scene = item.scene || '';
    if (local && local.scene !== scene) { local.scene = scene; changed = true; }
  }
  return changed;
}

function paintLive() {
  const ch = channelOf(currentChannel);
  updateTabs();
  paintBadge(ch);
  paintInputChoice(ch);
  paintDveStatus(ch);
}

async function refreshStatus() {
  if (refreshing) return;
  refreshing = true;
  try {
    if (liveHardware()) {
      applyLiveHardware();
    } else {
      const res = await fetch('/api/overlays', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.channels)) {
        for (const incoming of data.channels) {
          const local = channelOf(incoming.id);
          if (local && typeof incoming.scene === 'string' && local.scene !== incoming.scene) local.scene = incoming.scene;
        }
      }
    }
    paintLive();
  } catch { /* tenta de novo no próximo ciclo */ } finally {
    refreshing = false;
  }
}

function configFromForm() {
  const transition = E('channel-transition').value;
  const isStinger = transition.startsWith('Stinger');
  const activeDveBtn = document.querySelector('.dve-grid button.active');
  return {
    channel: currentChannel,
    transition,
    transitionDuration: Number(E('channel-duration').value),
    transitionType: E('channel-trans-type').value,
    hideAfter: Number(E('channel-hide-after').value),
    tie: E('channel-tie').checked,
    stinger: { enabled: isStinger, name: transition, cutPointMs: Number(E('stinger-cutpoint').value), audio: E('stinger-audio').checked },
    dve: {
      preset: activeDveBtn ? activeDveBtn.dataset.dve : 'custom',
      x: Number(E('dve-x').value),
      y: Number(E('dve-y').value),
      width: Number(E('dve-w').value),
      height: Number(E('dve-h').value),
      opacity: Number(E('dve-opacity').value)
    }
  };
}

async function take() {
  const channel = currentChannel;
  const scene = E('channel-input').value;
  if (!scene) { showMsg(`Escolha a entrada do DSK ${channel}.`, true); E('channel-input').focus(); return; }
  try {
    // O que está na tela é o que entra no ar: antes o TAKE ignorava transição e posição ainda não salvas.
    await sendRequest('overlay_configure', configFromForm());
    await sendRequest('overlay_take', { channel, scene });
    await loadState();
    showMsg(`DSK ${channel} no ar com ${scene}.`);
  } catch (err) {
    showMsg(err.message, true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setInterval(() => { if (!document.hidden) refreshStatus(); }, 1000);

  document.querySelectorAll('#channel-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentChannel = Number(btn.dataset.channel);
      updateTabs();
      renderEditor();
    });
  });

  E('channel-input').addEventListener('change', (e) => {
    const value = e.target.value;
    if (value) choices[currentChannel] = value; else delete choices[currentChannel];
    saveChoices();
    updateTabs();
  });

  E('channel-duration').addEventListener('input', (e) => { E('val-duration').textContent = `${e.target.value} ms`; });
  E('stinger-cutpoint').addEventListener('input', (e) => { E('val-cutpoint').textContent = `${e.target.value} ms`; });
  E('channel-transition').addEventListener('change', (e) => { E('stinger-box').hidden = !e.target.value.startsWith('Stinger'); });

  document.querySelectorAll('.dve-grid button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = DVE_PRESETS[btn.dataset.dve];
      if (!preset) return;
      E('dve-x').value = preset.x;
      E('dve-y').value = preset.y;
      E('dve-w').value = preset.width;
      E('dve-h').value = preset.height;
      E('dve-opacity').value = preset.opacity;
      document.querySelectorAll('.dve-grid button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      paintFrame();
    });
  });
  for (const id of ['dve-x', 'dve-y', 'dve-w', 'dve-h']) {
    E(id).addEventListener('input', () => {
      document.querySelectorAll('.dve-grid button').forEach((b) => b.classList.remove('active'));
      paintFrame();
    });
  }

  E('btn-channel-apply').addEventListener('click', async () => {
    try {
      await sendRequest('overlay_configure', configFromForm());
      await loadState();
      const updated = channelOf(currentChannel);
      if (updated?.dveError) showMsg(`DSK ${currentChannel} salvo. Posição: ${updated.dveError}`, true);
      else showMsg(`DSK ${currentChannel} salvo.`);
    } catch (err) {
      showMsg(err.message, true);
    }
  });

  E('btn-dve-restore').addEventListener('click', async () => {
    try {
      await sendRequest('overlay_dve_restore', { channel: currentChannel });
      await loadState();
      showMsg(`Posição original do DSK ${currentChannel} restaurada.`);
    } catch (err) {
      showMsg(err.message, true);
    }
  });

  E('btn-channel-take').addEventListener('click', take);

  E('btn-channel-off').addEventListener('click', async () => {
    try {
      await sendRequest('overlay_off', { channel: currentChannel });
      await loadState();
      showMsg(`DSK ${currentChannel} fora do ar.`);
    } catch (err) {
      showMsg(err.message, true);
    }
  });

  E('btn-kill-all').addEventListener('click', async () => {
    try {
      await sendRequest('overlay_kill_all', {});
      await loadState();
      showMsg('Todos os DSK fora do ar.');
    } catch (err) {
      showMsg(err.message, true);
    }
  });
});
