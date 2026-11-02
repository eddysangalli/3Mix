'use strict';
const E = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let id = null, trigger = null, learningKey = false, state = {}, fingerprint = '', oscLoaded = false;

const ACTION_LABELS = {
  preview: 'Mandar para o Preview', cut: 'Cortar para o Programa', fade: 'Fade para o Programa', active: 'Direto no Programa',
  overlay: 'Ligar DSK', audio_mute: 'Mudo', audio_volume: 'Volume', audio_bus: 'Barramento', media: 'VT', macro_run: 'Macro', talkback: 'Talkback'
};
const MEDIA_LABELS = { PLAY: 'Play', PAUSE: 'Pausar', STOP: 'Parar', RESTART: 'Reiniciar', NEXT: 'Próximo', PREVIOUS: 'Anterior' };

const say = (text, error = false) => { E('status').textContent = text; E('status').classList.toggle('sc-status-err', error); };
const command = async (action, data = {}) => {
  try { const r = await FreeMixControllers.command(action, data); say('Salvo.'); return r; }
  catch (e) { say(e.message, true); throw e; }
};

const KEY_NAMES = { Space: 'Espaço', Enter: 'Enter', Escape: 'Esc', Backspace: 'Backspace', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const keyName = (code) => KEY_NAMES[code] || String(code).replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
const describe = (t) => !t ? '' : t.type === 'keyboard'
  ? [t.ctrl ? 'Ctrl' : null, t.alt ? 'Alt' : null, t.shift ? 'Shift' : null, t.meta ? 'Win' : null, keyName(t.code)].filter(Boolean).join(' + ')
  : t.deviceName + ' · canal ' + t.channel + ' · ' + t.message + ' ' + t.number;

function actionText(target) {
  const d = target?.data || {};
  const input = d.input ? (state.inputs?.find((i) => i.key === d.input)?.name || d.input) : '';
  const base = ACTION_LABELS[target?.action] || target?.action || '';
  if (target?.action === 'overlay') return base + ' ' + (d.channel || 1) + (input ? ' · ' + input : '');
  if (target?.action === 'macro_run') return base + ' · ' + (state.macros?.items?.find((m) => m.id === d.id)?.name || d.id || '');
  if (target?.action === 'media') return base + ' · ' + (MEDIA_LABELS[d.command] || d.command) + (input ? ' · ' + input : '');
  if (target?.action === 'audio_bus') return base + ' ' + d.bus + (input ? ' · ' + input : '');
  if (target?.action === 'audio_volume') return base + ' ' + d.volume + '%' + (input ? ' · ' + input : '');
  return base + (input ? ' · ' + input : '');
}

function outputs() {
  const selected = E('midi-output').value, ports = FreeMixControllers.status().outputs || [];
  E('midi-output').innerHTML = ports.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name + ' · ' + p.state) + '</option>').join('');
  if (selected) {
    if (!ports.some((p) => p.id === selected)) E('midi-output').insertAdjacentHTML('beforeend', '<option value="' + esc(selected) + '">' + esc(selected + ' · não conectado') + '</option>');
    E('midi-output').value = selected;
  }
}

function show() {
  E('feedback-fields').hidden = !E('feedback-midi').checked;
  const keyboard = E('type').value === 'keyboard';
  E('key').value = trigger?.type === 'keyboard' ? describe(trigger) : '';
  E('midi-learned').value = trigger?.type === 'midi' ? describe(trigger) : '';
  E('keyboard').hidden = !keyboard;
  E('midi').hidden = keyboard;
  E('global-label').hidden = !keyboard;
  E('continuous-label').hidden = keyboard;
  const action = E('action').value;
  E('input-field').hidden = ['macro_run', 'talkback'].includes(action);
  E('macro-field').hidden = action !== 'macro_run';
  E('value-field').hidden = !['fade', 'overlay', 'audio_volume'].includes(action);
  E('value-label').textContent = action === 'fade' ? 'Duração (ms)' : action === 'overlay' ? 'Canal de DSK' : 'Volume (%)';
  E('toggle-field').hidden = !['audio_bus', 'audio_mute'].includes(action);
  E('bus-field').hidden = action !== 'audio_bus';
  E('command-field').hidden = action !== 'media';
}

function openEditor(title) {
  E('editor').hidden = false;
  E('editor-title').textContent = title;
  say('');
  show();
  E('editor').scrollIntoView({ block: 'nearest' });
}
function closeEditor() {
  id = null; trigger = null; learningKey = false;
  FreeMixControllers.setKeyboardLearning(false);
  E('learn-key').textContent = 'Aprender tecla';
  E('learn-key').classList.remove('listening');
  E('editor').hidden = true;
}

// ---- abas ----
document.querySelectorAll('.p3-tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.p3-tabs button').forEach((x) => x.classList.toggle('selected', x === b));
  document.querySelectorAll('[data-pane]').forEach((p) => { p.style.display = p.dataset.pane === b.dataset.tab ? 'flex' : 'none'; });
}));

// ---- aprender ----
E('feedback-midi').onchange = show;
E('type').onchange = () => { trigger = null; learningKey = false; FreeMixControllers.setKeyboardLearning(false); show(); };
E('action').onchange = () => {
  const action = E('action').value;
  E('value').value = action === 'overlay' ? 1 : action === 'audio_volume' ? 100 : 500;
  show();
};
E('learn-key').onclick = () => {
  learningKey = true;
  FreeMixControllers.setKeyboardLearning(true);
  E('learn-key').textContent = 'Aperte uma tecla…';
  E('learn-key').classList.add('listening');
};
document.addEventListener('keydown', (e) => {
  if (!learningKey || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  trigger = { type: 'keyboard', code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
  learningKey = false;
  FreeMixControllers.setKeyboardLearning(false);
  E('learn-key').textContent = 'Aprender tecla';
  E('learn-key').classList.remove('listening');
  say('');
  show();
}, true);

E('connect-midi').onclick = async () => {
  try {
    const devices = await FreeMixControllers.connectMidi();
    E('devices').textContent = devices.length ? devices.map((d) => d.name + ' · ' + d.state).join('\n') : 'Nenhuma entrada MIDI conectada.';
    outputs();
  } catch (e) { E('devices').textContent = e.message; }
};
E('learn-midi').onclick = async () => {
  try { if (!(FreeMixControllers.status().inputs || []).length) await FreeMixControllers.connectMidi(); } catch (e) { say(e.message, true); return; }
  E('learn-midi').textContent = 'Mova o controle…';
  E('learn-midi').classList.add('listening');
  FreeMixControllers.learnMidi((data) => {
    trigger = { ...data, continuous: E('continuous').checked };
    delete trigger.value;
    E('learn-midi').textContent = 'Aprender controle';
    E('learn-midi').classList.remove('listening');
    say('');
    show();
  });
};

function target() {
  const action = E('action').value, data = {};
  if (!['macro_run', 'talkback'].includes(action)) data.input = E('input').value;
  if (action === 'macro_run') data.id = E('macro').value;
  if (action === 'fade') data.duration = Number(E('value').value);
  if (action === 'overlay') data.channel = Number(E('value').value);
  if (action === 'audio_volume') data.volume = Number(E('value').value);
  if (action === 'audio_mute') data.muted = E('toggle').value !== 'true';
  if (action === 'audio_bus') { data.bus = E('bus').value; data.enabled = E('toggle').value === 'true'; }
  if (action === 'media') data.command = E('command').value;
  return { action, data };
}

E('save').onclick = async () => {
  if (!trigger) { say('Falta aprender a tecla ou o controle.', true); return; }
  try {
    if (trigger.type === 'midi') trigger.continuous = E('continuous').checked;
    if (trigger.type === 'keyboard') trigger.global = E('global').checked;
    const t = target();
    const name = E('name').value.trim() || (describe(trigger) + ' · ' + actionText(t)).slice(0, 80);
    await command('controller_save', {
      ...(id ? { id } : {}), name, trigger, target: t, enabled: E('enabled').checked,
      midiFeedback: E('feedback-midi').checked ? {
        enabled: true, outputId: E('midi-output').value,
        outputName: FreeMixControllers.status().outputs?.find((o) => o.id === E('midi-output').value)?.name,
        channel: Number(E('midi-feedback-channel').value), message: E('midi-feedback-message').value,
        number: Number(E('midi-feedback-number').value), value: E('midi-feedback-value').value,
        onValue: Number(E('midi-feedback-on').value), offValue: Number(E('midi-feedback-off').value)
      } : null
    });
    closeEditor();
  } catch { /* a mensagem já está na tela */ }
};
E('new').onclick = () => {
  id = null; trigger = null;
  E('name').value = ''; E('global').checked = false; E('enabled').checked = true; E('feedback-midi').checked = false; E('type').value = 'keyboard';
  openEditor('Novo atalho');
};
E('cancel-edit').onclick = closeEditor;

E('items').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const item = state.controllers?.items.find((i) => i.id === (b.dataset.edit || b.dataset.remove || b.dataset.enable));
  if (!item) return;
  if (b.dataset.remove) { command('controller_remove', { id: item.id }).catch(() => {}); return; }
  if (b.dataset.enable) { command('controller_enable', { id: item.id, enabled: !item.enabled }).catch(() => {}); return; }
  id = item.id;
  trigger = structuredClone(item.trigger);
  E('name').value = item.name;
  E('type').value = trigger.type;
  E('enabled').checked = item.enabled;
  E('continuous').checked = trigger.continuous === true;
  E('global').checked = trigger.global === true;
  E('feedback-midi').checked = item.midiFeedback?.enabled === true;
  if (item.midiFeedback) {
    const f = item.midiFeedback;
    E('midi-output').innerHTML = '<option value="' + esc(f.outputId) + '">' + esc(f.outputName || f.outputId) + '</option>';
    for (const [k, v] of Object.entries({ channel: f.channel, message: f.message, number: f.number, value: f.value, on: f.onValue, off: f.offValue })) E('midi-feedback-' + k).value = v;
    outputs();
  }
  E('action').value = item.target.action;
  const d = item.target.data || {};
  E('input').value = d.input || '';
  E('macro').value = d.id || '';
  E('value').value = d.duration ?? d.channel ?? d.volume ?? 500;
  E('bus').value = d.bus || 'M';
  E('toggle').value = String(item.target.action === 'audio_mute' ? !d.muted : d.enabled ?? true);
  E('command').value = d.command || 'PLAY';
  openEditor('Editar atalho');
};

window.addEventListener('freemix-controller-status', (e) => { if (e.detail.error) say(e.detail.error, true); });

setInterval(() => {
  const next = FreeMixRemote.getState();
  if (!next.connected) return;
  state = next;
  const osc = next.controllers?.osc;
  if (osc) {
    if (!oscLoaded) { E('osc-port').value = osc.port; oscLoaded = true; }
    E('osc-start').disabled = osc.active;
    E('osc-stop').disabled = !osc.active;
    E('osc-configure').disabled = osc.active;
    E('osc-status').textContent = JSON.stringify(osc, null, 2);
    E('osc-state').textContent = osc.active ? 'Ligado' : 'Parado';
    E('osc-state').className = 'p3-badge' + (osc.active ? ' ok' : '');
  }
  const global = next.globalHotkeys || next.controllers?.globalHotkeys;
  E('global-status').textContent = global && !global.available ? (global.error || 'Só funciona com o 3Mix em foco.') : '';
  E('global').disabled = !!global && !global.available;

  const f = JSON.stringify([next.inputs?.map((i) => [i.key, i.name]), next.macros?.items?.map((i) => [i.id, i.name]), next.controllers]);
  if (f === fingerprint) return;
  fingerprint = f;
  const old = E('input').value, macro = E('macro').value;
  E('input').innerHTML = '<option value="">O que estiver no Preview</option>' + next.inputs.map((i) => '<option value="' + esc(i.key) + '">' + esc(i.number + '. ' + i.name) + '</option>').join('');
  if (next.inputs.some((i) => i.key === old)) E('input').value = old;
  E('macro').innerHTML = (next.macros?.items || []).map((i) => '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>').join('');
  if (next.macros?.items?.some((i) => i.id === macro)) E('macro').value = macro;

  const items = next.controllers?.items || [];
  E('items').innerHTML = items.length ? items.map((i) => {
    const a = next.controllers.activators.find((x) => x.id === i.id);
    const stateText = !a?.available ? 'Indisponível' : a.active ? 'Ativo' : i.enabled ? 'Pronto' : 'Desligado';
    const tone = !a?.available ? ' warn' : i.enabled ? ' ok' : '';
    return '<tr' + (i.enabled ? '' : ' class="sc-off"') + '><td><span class="sc-key">' + esc(describe(i.trigger)) + '</span></td>'
      + '<td>' + esc(actionText(i.target)) + '</td>'
      + '<td><span class="p3-badge' + tone + '">' + esc(stateText) + (a?.volume !== null && a?.volume !== undefined ? ' · ' + a.volume + '%' : '') + '</span>'
      + (a?.last?.error ? '<div class="p3-note">' + esc(a.last.error) + '</div>' : '') + '</td>'
      + '<td><button type="button" data-edit="' + esc(i.id) + '">Editar</button>'
      + '<button type="button" data-enable="' + esc(i.id) + '">' + (i.enabled ? 'Desligar' : 'Ligar') + '</button>'
      + '<button type="button" class="danger" data-remove="' + esc(i.id) + '">Excluir</button></td></tr>';
  }).join('') : '<tr><td colspan="4" class="p3-empty">Nenhum atalho. Clique em Novo atalho.</td></tr>';
}, 400);

E('items').innerHTML = '<tr><td colspan="4" class="p3-empty">Nenhum atalho. Clique em Novo atalho.</td></tr>';
show();

E('http-recipe').onclick = async () => {
  try {
    const r = await FreeMixControllers.command('controller_adapter_read');
    E('http-recipe-output').textContent = JSON.stringify(r.controllers || r.controller || r, null, 2);
  } catch (e) { E('http-recipe-output').textContent = e.message; }
};
E('osc-configure').onclick = () => FreeMixControllers.command('controller_osc_configure', { port: Number(E('osc-port').value) }).catch(() => {});
E('osc-start').onclick = () => FreeMixControllers.command('controller_osc_start').catch(() => {});
E('osc-stop').onclick = () => FreeMixControllers.command('controller_osc_stop').catch(() => {});
E('connect-midi-feedback').onclick = () => E('connect-midi').onclick();
