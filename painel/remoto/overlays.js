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

const BROADCAST_PRESETS = {
  gc_padrao: { name: 'Tarja GC Padrão', x: 80, y: 780, width: 1760, height: 220, opacity: 1.0 },
  pip_comentarista: { name: 'PiP Comentarista', x: 1240, y: 80, width: 600, height: 338, opacity: 1.0 },
  split_debate: { name: 'Split Debate 50/50', x: 0, y: 0, width: 960, height: 1080, opacity: 1.0 },
  logo_canto: { name: 'Bug / Logo Canto', x: 1620, y: 60, width: 220, height: 124, opacity: 1.0 }
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

const CHOICE_KEY = '3mix.dsk.escolha';
const PRESETS_KEY = '3mix.dsk.custom_presets';
const readChoices = () => { try { return JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}') || {}; } catch { return {}; } };
const choices = readChoices();
const saveChoices = () => { try { localStorage.setItem(CHOICE_KEY, JSON.stringify(choices)); } catch { /* sem armazenamento */ } };

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

/* =========================================================================
   EDITOR VISUAL INTERATIVO 16:9
   ========================================================================= */
function paintVisualBox() {
  const box = E('interactive-box');
  if (!box) return;
  const num = (id, fallback) => { const v = Number(E(id).value); return Number.isFinite(v) ? v : fallback; };
  const x = num('dve-x', 0);
  const y = num('dve-y', 0);
  const w = Math.max(1, num('dve-w', 1920));
  const h = Math.max(1, num('dve-h', 1080));
  const op = num('dve-opacity', 1.0);

  box.style.left = (x / 1920 * 100) + '%';
  box.style.top = (y / 1080 * 100) + '%';
  box.style.width = (w / 1920 * 100) + '%';
  box.style.height = (h / 1080 * 100) + '%';
  box.style.opacity = op;

  const ch = channelOf(currentChannel);
  const onAir = Boolean(ch?.scene);
  box.classList.toggle('on-air-box', onAir);
  const inputName = ch?.scene || choices[currentChannel] || `DSK ${currentChannel}`;
  E('box-label').textContent = `${onAir ? '● NO AR: ' : 'PREVIEW: '} ${inputName}`;
}

let isDragging = false;
let dragMode = 'move'; // 'move' ou 'nw', 'ne', 'se', 'sw', etc.
let startPointer = { x: 0, y: 0 };
let startGeom = { x: 0, y: 0, w: 1920, h: 1080 };

function initInteractiveEditor() {
  const container = E('canvas-container');
  const box = E('interactive-box');
  if (!container || !box) return;

  box.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const handle = e.target.dataset.handle;
    dragMode = handle ? handle : 'move';
    isDragging = true;
    startPointer = { x: e.clientX, y: e.clientY };
    startGeom = {
      x: Number(E('dve-x').value) || 0,
      y: Number(E('dve-y').value) || 0,
      w: Number(E('dve-w').value) || 1920,
      h: Number(E('dve-h').value) || 1080
    };
    box.setPointerCapture(e.pointerId);
  });

  box.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const dx = (e.clientX - startPointer.x) * scaleX;
    const dy = (e.clientY - startPointer.y) * scaleY;
    const lockRatio = E('chk-lock-ratio')?.checked;

    let nx = startGeom.x;
    let ny = startGeom.y;
    let nw = startGeom.w;
    let nh = startGeom.h;

    if (dragMode === 'move') {
      nx = Math.round(startGeom.x + dx);
      ny = Math.round(startGeom.y + dy);
    } else {
      if (dragMode.includes('e')) nw = Math.max(50, Math.round(startGeom.w + dx));
      if (dragMode.includes('s')) nh = Math.max(30, Math.round(startGeom.h + dy));
      if (dragMode.includes('w')) {
        const potentialW = Math.max(50, Math.round(startGeom.w - dx));
        nx = Math.round(startGeom.x + (startGeom.w - potentialW));
        nw = potentialW;
      }
      if (dragMode.includes('n')) {
        const potentialH = Math.max(30, Math.round(startGeom.h - dy));
        ny = Math.round(startGeom.y + (startGeom.h - potentialH));
        nh = potentialH;
      }

      if (lockRatio) {
        if (dragMode.includes('e') || dragMode.includes('w')) {
          nh = Math.round(nw * 9 / 16);
        } else {
          nw = Math.round(nh * 16 / 9);
        }
      }
    }

    E('dve-x').value = nx;
    E('dve-y').value = ny;
    E('dve-w').value = nw;
    E('dve-h').value = nh;
    document.querySelectorAll('.dve-grid button').forEach((b) => b.classList.remove('active'));
    paintVisualBox();
  });

  const stopDrag = (e) => {
    if (isDragging) {
      isDragging = false;
      try { box.releasePointerCapture(e.pointerId); } catch {}
    }
  };
  box.addEventListener('pointerup', stopDrag);
  box.addEventListener('pointercancel', stopDrag);

  // Safe Areas toggle
  E('chk-safe-areas')?.addEventListener('change', (e) => {
    const show = e.target.checked;
    E('safe-action').style.display = show ? 'block' : 'none';
    E('safe-title').style.display = show ? 'block' : 'none';
  });

  // Centralizar
  E('btn-center-box')?.addEventListener('click', () => {
    const w = Number(E('dve-w').value) || 1920;
    const h = Number(E('dve-h').value) || 1080;
    E('dve-x').value = Math.round((1920 - w) / 2);
    E('dve-y').value = Math.round((1080 - h) / 2);
    paintVisualBox();
    showMsg('Overlay centralizado na área de composição.');
  });
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

  const dve = ch.dve || DVE_PRESETS.fullscreen;
  E('dve-x').value = dve.x ?? 0;
  E('dve-y').value = dve.y ?? 0;
  E('dve-w').value = dve.width ?? 1920;
  E('dve-h').value = dve.height ?? 1080;
  E('dve-opacity').value = dve.opacity ?? 1.0;
  document.querySelectorAll('.dve-grid button').forEach((btn) => btn.classList.toggle('active', btn.dataset.dve === dve.preset));
  paintVisualBox();
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
  } catch { /* mantém local */ }
  populateTransitions();
  updateTabs();
  renderEditor();
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
    stinger: { enabled: isStinger, name: transition, cutPointMs: Number(E('stinger-cutpoint')?.value || 250), audio: E('stinger-audio')?.checked !== false },
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

async function take(forceCut = false) {
  const channel = currentChannel;
  const scene = E('channel-input').value;
  if (!scene) { showMsg(`Escolha a entrada do DSK ${channel}.`, true); E('channel-input').focus(); return; }
  try {
    const cfg = configFromForm();
    if (forceCut) {
      cfg.transition = 'Cortar';
      cfg.transitionDuration = 0;
    }
    await sendRequest('overlay_configure', cfg);
    await sendRequest('overlay_take', { channel, scene });
    await loadState();
    showMsg(`DSK ${channel} no ar com ${scene}${forceCut ? ' (CUT direto)' : ''}.`);
  } catch (err) {
    showMsg(err.message, true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initInteractiveEditor();
  loadState();
  setInterval(() => { if (!document.hidden) loadState(); }, 2000);

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
    paintVisualBox();
  });

  E('channel-duration').addEventListener('input', (e) => { E('val-duration').textContent = `${e.target.value} ms`; });

  // DVE Presets
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
      paintVisualBox();
    });
  });

  for (const id of ['dve-x', 'dve-y', 'dve-w', 'dve-h', 'dve-opacity']) {
    E(id).addEventListener('input', () => {
      document.querySelectorAll('.dve-grid button').forEach((b) => b.classList.remove('active'));
      paintVisualBox();
    });
  }

  // Presets Rápidos Broadcast
  document.querySelectorAll('[data-a="load_preset"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.v;
      const p = BROADCAST_PRESETS[key];
      if (!p) return;
      E('dve-x').value = p.x;
      E('dve-y').value = p.y;
      E('dve-w').value = p.width;
      E('dve-h').value = p.height;
      E('dve-opacity').value = p.opacity;
      paintVisualBox();
      showMsg(`Preset "${p.name}" aplicado na prévia.`);
    });
  });

  // Salvar Preset Personalizado
  E('btn-save-custom-preset')?.addEventListener('click', () => {
    const nome = prompt('Nome do novo preset de posicionamento DSK:');
    if (!nome) return;
    try {
      const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
      saved[nome] = {
        x: Number(E('dve-x').value),
        y: Number(E('dve-y').value),
        width: Number(E('dve-w').value),
        height: Number(E('dve-h').value),
        opacity: Number(E('dve-opacity').value)
      };
      localStorage.setItem(PRESETS_KEY, JSON.stringify(saved));
      showMsg(`Preset "${nome}" salvo no sistema!`);
    } catch {
      showMsg('Erro ao salvar preset.', true);
    }
  });

  // Ações
  E('btn-channel-take').addEventListener('click', () => take(false));
  E('btn-channel-cut').addEventListener('click', () => take(true));

  E('btn-channel-apply').addEventListener('click', async () => {
    try {
      await sendRequest('overlay_configure', configFromForm());
      await loadState();
      showMsg(`DSK ${currentChannel} configurado com sucesso.`);
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
      showMsg('Todos os DSK retirados do ar.');
    } catch (err) {
      showMsg(err.message, true);
    }
  });
});
