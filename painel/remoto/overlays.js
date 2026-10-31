const DVE_PRESETS = {
  fullscreen: { x: 0, y: 0, width: 1920, height: 1080, opacity: 1.0 },
  'pip-top-right': { x: 1240, y: 80, width: 600, height: 338, opacity: 1.0 },
  'pip-top-left': { x: 80, y: 80, width: 600, height: 338, opacity: 1.0 },
  'pip-bottom-right': { x: 1240, y: 662, width: 600, height: 338, opacity: 1.0 },
  'pip-bottom-left': { x: 80, y: 662, width: 600, height: 338, opacity: 1.0 },
  'lower-third': { x: 80, y: 780, width: 1760, height: 220, opacity: 1.0 },
  'split-left': { x: 0, y: 0, width: 960, height: 1080, opacity: 1.0 },
  'split-right': { x: 960, y: 0, width: 960, height: 1080, opacity: 1.0 }
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

const E = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showMsg(text, isError = false) {
  const el = E('message');
  if (!el) return;
  el.textContent = text;
  el.className = isError ? 'error' : 'ok';
  if (!isError) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
}

function updateTabs() {
  const buttons = document.querySelectorAll('#channel-tabs button');
  buttons.forEach(btn => {
    const chId = Number(btn.dataset.channel);
    btn.classList.toggle('active', chId === currentChannel);
    const ch = overlaysState.channels.find(c => c.id === chId);
    btn.classList.toggle('on-air', Boolean(ch?.scene));
  });
}

function updateInputs() {
  const sel = E('channel-input');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">(Nenhuma / Fora do Ar)</option>' +
    availableInputs.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (currentVal && availableInputs.includes(currentVal)) {
    sel.value = currentVal;
  }
}

function renderEditor() {
  const ch = overlaysState.channels.find(c => c.id === currentChannel) || overlaysState.channels[0];
  E('channel-heading').textContent = `Canal de Overlay ${ch.id} (DSK ${ch.id})`;

  const statusBadge = E('channel-status-badge');
  if (ch.scene) {
    statusBadge.innerHTML = `<span class="badge-on">NO AR: ${esc(ch.scene)}</span>`;
  } else {
    statusBadge.innerHTML = `<span class="badge-off">FORA DO AR</span>`;
  }

  E('channel-input').value = ch.scene || '';
  E('channel-transition').value = ch.transition || 'Fade';
  E('channel-duration').value = ch.transitionDuration || 500;
  E('val-duration').textContent = `${ch.transitionDuration || 500} ms`;
  E('channel-trans-type').value = ch.transitionType || 'match';
  E('channel-hide-after').value = String(ch.hideAfter || 0);
  E('channel-tie').checked = Boolean(ch.tie);

  const isStinger = String(ch.transition).startsWith('Stinger');
  E('stinger-box').hidden = !isStinger;
  if (ch.stinger) {
    E('stinger-cutpoint').value = ch.stinger.cutPointMs || 250;
    E('val-cutpoint').textContent = `${ch.stinger.cutPointMs || 250} ms`;
    E('stinger-audio').checked = ch.stinger.audio !== false;
  }

  // DVE
  const dve = ch.dve || DVE_PRESETS.fullscreen;
  E('dve-x').value = dve.x ?? 0;
  E('dve-y').value = dve.y ?? 0;
  E('dve-w').value = dve.width ?? 1920;
  E('dve-h').value = dve.height ?? 1080;
  E('dve-opacity').value = dve.opacity ?? 1.0;

  document.querySelectorAll('.dve-grid button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dve === dve.preset);
  });
}

function renderMatrix() {
  const tbody = E('matrix-tbody');
  if (!tbody) return;

  tbody.innerHTML = overlaysState.channels.map(ch => {
    const onAir = Boolean(ch.scene);
    const dveName = DVE_PRESETS[ch.dve?.preset]?.name || 'Personalizado';
    return `<tr>
      <td><b>DSK ${ch.id}</b></td>
      <td>${onAir ? `<span class="badge-on">● NO AR</span>` : `<span class="badge-off">○ LIVRE</span>`}</td>
      <td><b>${ch.scene ? esc(ch.scene) : '—'}</b></td>
      <td>${esc(ch.transition)}</td>
      <td>${ch.transitionDuration} ms</td>
      <td>${ch.hideAfter ? `${ch.hideAfter} s` : 'Manual'}</td>
      <td>${ch.tie ? '✓ Sim' : '—'}</td>
      <td>${esc(dveName)}</td>
      <td style="text-align:right">
        <button class="b" onclick="selectChannelQuick(${ch.id})" style="padding:4px 8px;font-size:11px">Configurar</button>
        ${onAir
          ? `<button class="b action-btn-off" onclick="takeChannelOff(${ch.id})" style="padding:4px 8px;font-size:11px">Desligar</button>`
          : `<button class="b action-btn-air" onclick="takeChannelOn(${ch.id})" style="padding:4px 8px;font-size:11px">TAKE</button>`
        }
      </td>
    </tr>`;
  }).join('');
}

window.selectChannelQuick = (chId) => {
  currentChannel = chId;
  updateTabs();
  renderEditor();
};

window.takeChannelOff = async (chId) => {
  try {
    await sendRequest('overlay_off', { channel: chId });
    const ch = overlaysState.channels.find(c => c.id === chId);
    if (ch) ch.scene = '';
    renderEditor();
    renderMatrix();
    updateTabs();
    showMsg(`Canal DSK ${chId} retirado do ar.`);
  } catch (err) {
    showMsg(err.message, true);
  }
};

window.takeChannelOn = async (chId) => {
  const ch = overlaysState.channels.find(c => c.id === chId);
  const inputToUse = (chId === currentChannel ? E('channel-input').value : ch?.scene) || availableInputs[0] || '';
  if (!inputToUse) {
    showMsg(`Selecione uma entrada para colocar no DSK ${chId}.`, true);
    return;
  }
  try {
    await sendRequest('overlay_take', { channel: chId, scene: inputToUse });
    if (ch) ch.scene = inputToUse;
    renderEditor();
    renderMatrix();
    updateTabs();
    showMsg(`Canal DSK ${chId} colocado no ar com ${inputToUse}.`);
  } catch (err) {
    showMsg(err.message, true);
  }
};

async function sendRequest(action, data) {
  if (window.FreeMixRemote?.request) {
    return window.FreeMixRemote.request(action, data);
  }
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
    const res = await fetch('/api/overlays');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.channels)) {
        overlaysState.channels = data.channels;
      }
      if (Array.isArray(data.inputs)) {
        availableInputs = data.inputs;
        updateInputs();
      }
    }
  } catch {}
  updateTabs();
  renderEditor();
  renderMatrix();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Abas de canal
  document.querySelectorAll('#channel-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentChannel = Number(btn.dataset.channel);
      updateTabs();
      renderEditor();
    });
  });

  // Slider de duração
  E('channel-duration')?.addEventListener('input', (e) => {
    E('val-duration').textContent = `${e.target.value} ms`;
  });

  // Slider de Stinger
  E('stinger-cutpoint')?.addEventListener('input', (e) => {
    E('val-cutpoint').textContent = `${e.target.value} ms`;
  });

  // Troca de transição
  E('channel-transition')?.addEventListener('change', (e) => {
    E('stinger-box').hidden = !e.target.value.startsWith('Stinger');
  });

  // Grid de Presets DVE
  document.querySelectorAll('.dve-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.dve;
      const preset = DVE_PRESETS[presetKey];
      if (preset) {
        E('dve-x').value = preset.x;
        E('dve-y').value = preset.y;
        E('dve-w').value = preset.width;
        E('dve-h').value = preset.height;
        E('dve-opacity').value = preset.opacity;
        document.querySelectorAll('.dve-grid button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });

  // Salvar Configurações
  E('btn-channel-apply')?.addEventListener('click', async () => {
    const ch = overlaysState.channels.find(c => c.id === currentChannel);
    if (!ch) return;

    const transition = E('channel-transition').value;
    const isStinger = transition.startsWith('Stinger');
    const activeDveBtn = document.querySelector('.dve-grid button.active');

    const config = {
      channel: currentChannel,
      transition,
      transitionDuration: Number(E('channel-duration').value),
      transitionType: E('channel-trans-type').value,
      hideAfter: Number(E('channel-hide-after').value),
      tie: E('channel-tie').checked,
      stinger: {
        enabled: isStinger,
        name: transition,
        cutPointMs: Number(E('stinger-cutpoint').value),
        audio: E('stinger-audio').checked
      },
      dve: {
        preset: activeDveBtn ? activeDveBtn.dataset.dve : 'custom',
        x: Number(E('dve-x').value),
        y: Number(E('dve-y').value),
        width: Number(E('dve-w').value),
        height: Number(E('dve-h').value),
        opacity: Number(E('dve-opacity').value)
      }
    };

    try {
      await sendRequest('overlay_configure', config);
      Object.assign(ch, config);
      renderEditor();
      renderMatrix();
      showMsg(`Configurações de DSK ${currentChannel} salvas com sucesso.`);
    } catch (err) {
      showMsg(err.message, true);
    }
  });

  // Colocar no ar (TAKE)
  E('btn-channel-take')?.addEventListener('click', () => {
    window.takeChannelOn(currentChannel);
  });

  // Tirar do ar (OFF)
  E('btn-channel-off')?.addEventListener('click', () => {
    window.takeChannelOff(currentChannel);
  });

  // Desarmar todos (Kill All)
  E('btn-kill-all')?.addEventListener('click', async () => {
    try {
      await sendRequest('overlay_kill_all', {});
      overlaysState.channels.forEach(c => { c.scene = ''; });
      renderEditor();
      renderMatrix();
      updateTabs();
      showMsg('⚡ Todos os overlays foram desarmados (Kill All confirmado).');
    } catch (err) {
      showMsg(err.message, true);
    }
  });
});
