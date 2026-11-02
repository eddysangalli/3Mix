// Settings window, laid out like the reference switcher's "Settings": the list of categories on the left, the fields of
// the chosen one on the right, Import / Export / Default and OK / Cancel below.
// Nothing here is written by hand: every field comes from what the engine reports (GET /api/settings — the picture
// format plus the engine's own preference list), and OK sends each changed category back with one real command.
// Categories that have a window of their own (recording, external outputs…) open that window instead of repeating it.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id), esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
  // The list, in the order of the reference. "engine" names one category of the engine; "open" names another window.
  const LIST = [
    { id: 'display', label: 'Exibir', engine: 'display' },
    { id: 'appearance', label: 'Aparência', engine: 'appearance' },
    { id: 'projectors', label: 'Tela cheia e MultiView', engine: 'projectors' },
    { id: 'outputs', label: 'Saídas / NDI / SRT', open: '/externo' },
    { id: 'general', label: 'Opções', engine: 'general' },
    { id: 'performance', label: 'Desempenho', engine: 'performance' },
    { id: 'advanced', label: 'Cor e sistema', engine: 'advanced' },
    { id: 'recording', label: 'Gravando', open: '/gravar' },
    { id: 'files', label: 'Arquivos de gravação', engine: 'files' },
    { id: 'outputAdvanced', label: 'Saída avançada', engine: 'outputAdvanced' },
    { id: 'streaming', label: 'Streaming', open: '/transmitir' },
    { id: 'networkOutput', label: 'Rede da transmissão', engine: 'networkOutput' },
    { id: 'audio', label: 'Audio', engine: 'audio' },
    { id: 'audioTracks', label: 'Trilhas de áudio', engine: 'audioTracks' },
    { id: 'audioOutputs', label: 'Saídas de Áudio', open: '/audio' },
    { id: 'web', label: 'Controlador Web', open: '/' },
    { id: 'shortcuts', label: 'Atalhos', open: '/atalhos' },
    { id: 'about', label: 'Informações' },
  ];
  const FPS = [['24', '24'], ['25', '25'], ['30', '30'], ['50', '50'], ['60', '60'], ['24000/1001', '23,976'], ['30000/1001', '29,97'], ['60000/1001', '59,94']];
  const SIZES = [[1280, 720, '720p'], [1920, 1080, '1080p'], [3840, 2160, '4K'], [1080, 1920, 'Vertical']];
  // Choices the engine names in English, shown in the operator's language (the value sent stays the engine's).
  const WORDS = { Normal: 'Normal', AboveNormal: 'Acima do normal', High: 'Alta', BelowNormal: 'Abaixo do normal', Idle: 'Ociosa', Partial: 'Limitada (TV)', Full: 'Completa (PC)', Simple: 'Simples', Advanced: 'Avançado', Time: 'Tempo', Size: 'Tamanho', Manual: 'Manual', Stereo: 'Estéreo', Mono: 'Mono', bilinear: 'Bilinear (mais leve)', bicubic: 'Bicúbico', lanczos: 'Lanczos (mais nítido)', area: 'Área', NeverDisableHotkeys: 'Sempre ativos', DisableHotkeysInFocus: 'Desligados com o 3Mix em foco', DisableHotkeysOutOfFocus: 'Desligados com o 3Mix fora de foco', none: 'Nenhum' };

  let settings = null, preset = '', selected = new URLSearchParams(location.search).get('category') || 'display', busy = false;
  const drafts = new Map();     // engine category -> { field: value } changed here and not saved yet
  if (!LIST.some((c) => c.id === selected && !c.open)) selected = 'display';

  const say = (text, kind = '') => { const box = E('msg'); box.textContent = text; box.className = 'vd-msg' + (kind ? ' vd-' + kind : ''); };
  const note = (text, kind) => { delete E('msg').dataset.auto; say(text, kind); };
  const getJson = async (url) => { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'O programa não respondeu à consulta'); return v; };
  const send = async (action, data = {}) => { const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(30000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'Operação recusada pelo programa'); return v; };
  const engineState = () => window.FreeMixRemote?.getState?.() || {};
  const onAir = () => { const s = engineState(); return !!(s.recording || s.streaming || settings?.virtualCamera); };

  // ---- what the engine has, per category, in one shape: [{ name, label, type, value, choices }] ----
  function fieldsOf(category) {
    if (category === 'display') { const v = settings.video || {}; return [
      { name: 'baseWidth', label: 'Largura do quadro', type: 'integer', value: v.baseWidth, min: 240, max: 7680, step: 2 }, { name: 'baseHeight', label: 'Altura do quadro', type: 'integer', value: v.baseHeight, min: 240, max: 7680, step: 2 },
      { name: 'outputWidth', label: 'Largura da saída', type: 'integer', value: v.outputWidth, min: 240, max: 7680, step: 2 }, { name: 'outputHeight', label: 'Altura da saída', type: 'integer', value: v.outputHeight, min: 240, max: 7680, step: 2 },
      { name: 'fps', label: 'Taxa de Quadro', type: 'string', value: v.fpsDenominator === 1 ? String(v.fpsNumerator) : v.fpsNumerator + '/' + v.fpsDenominator, choices: FPS },
      { name: 'reflow', label: 'Reenquadrar as entradas no tamanho novo', type: 'bool', value: true }]; }
    return (settings.nativePreferences?.fields || []).filter((f) => f.category === category).map((f) => ({ name: f.name, label: f.label, type: f.type, value: f.value, choices: f.choices ? String(f.choices).split('|').map((c) => [c, WORDS[c] || c]) : null }));
  }
  const typed = (f, raw) => (f.type === 'bool' ? raw === true || raw === 'true' : f.type === 'integer' || f.type === 'number' ? Number(raw) : String(raw ?? ''));
  const current = (category) => Object.fromEntries(fieldsOf(category).map((f) => [f.name, drafts.get(category)?.[f.name] ?? f.value]));
  const dirty = (category) => !!drafts.get(category) && Object.keys(drafts.get(category)).length > 0;
  function edit(category, name, raw) { const f = fieldsOf(category).find((x) => x.name === name); if (!f) return; const next = { ...(drafts.get(category) || {}) }, value = typed(f, raw); if (String(value) === String(typed(f, f.value))) delete next[name]; else next[name] = value; if (Object.keys(next).length) drafts.set(category, next); else drafts.delete(category); }

  // ---- drawing ----
  function control(category, f, locked) {
    const value = drafts.get(category)?.[f.name] ?? f.value, id = `f-${category}-${f.name}`, common = `id="${esc(id)}" data-category="${esc(category)}" data-field="${esc(f.name)}"${locked ? ' disabled' : ''}`;
    if (f.type === 'bool') return `<div class="vd-row vd-row-check"><label class="vd-check"><input type="checkbox" ${common}${value === true || value === 'true' ? ' checked' : ''}> ${esc(f.label)}</label></div>`;
    let input;
    if (f.choices) { const list = f.choices.some(([v]) => String(v) === String(value)) ? f.choices : [[value, value + ' (atual)'], ...f.choices]; input = `<select ${common}>` + list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('') + '</select>'; }
    else if (f.type === 'integer' || f.type === 'number') input = `<input type="number" ${common} value="${esc(value)}"${f.min != null ? ` min="${f.min}" max="${f.max}" step="${f.step}"` : f.type === 'number' ? ' step="any"' : ''} style="width:110px">`;
    else input = `<input type="text" ${common} value="${esc(value)}" spellcheck="false" autocomplete="off">`;
    return `<label class="vd-row"><span>${esc(f.label)}</span>${f.choices || f.type === 'text' ? input : `<div class="vd-inline">${input}</div>`}</label>`;
  }
  function draw() {
    if (!settings) return;
    fill(E('categories'), LIST.map((c) => `<button data-id="${c.id}"${c.id === selected ? ' class="vd-on" aria-current="true"' : ''}${c.open ? ` title="Abre a janela de ${esc(c.label)}"` : ''}>${esc(c.label)}${c.open ? ' <span class="vd-note">›</span>' : ''}${c.engine && dirty(c.engine) ? ' <span class="vd-note">•</span>' : ''}</button>`).join(''));
    const item = LIST.find((c) => c.id === selected), category = item.engine, live = onAir(), locked = busy || (category === 'display' && live);
    let html;
    if (category) {
      const fields = fieldsOf(category);
      html = (category === 'display' ? `<div class="vd-row"><span>Tamanhos prontos</span><div class="vd-nums vd-words" id="sizes">${SIZES.map(([w, h, t]) => `<button data-size="${w}x${h}"${locked ? ' disabled' : ''}>${esc(t)}</button>`).join('')}</div></div>` : '')
        + (fields.length ? fields.map((f) => control(category, f, locked)).join('') : '<div class="vd-row"><span></span><span class="vd-note">O programa não oferece opções nesta categoria.</span></div>');
    } else {
      const s = settings.stats || {}, v = settings.video || {}, gb = Number.isFinite(s.availableDiskSpace) ? (s.availableDiskSpace / 1024).toFixed(1).replace('.', ',') + ' GB' : '—';
      html = [['Programa', '3Mix Studio'], ['Quadro', `${v.baseWidth}×${v.baseHeight} · saída ${v.outputWidth}×${v.outputHeight}`], ['Quadros por segundo', Number.isFinite(s.activeFps) ? s.activeFps.toFixed(2).replace('.', ',') : '—'], ['Uso do processador', Number.isFinite(s.cpuUsage) ? s.cpuUsage.toFixed(1).replace('.', ',') + ' %' : '—'], ['Memória', Number.isFinite(s.memoryUsage) ? Math.round(s.memoryUsage) + ' MB' : '—'], ['Quadros perdidos', `${s.renderSkippedFrames ?? 0} de ${s.renderTotalFrames ?? 0} (desenho) · ${s.outputSkippedFrames ?? 0} de ${s.outputTotalFrames ?? 0} (saída)`], ['Espaço livre para gravar', gb]]
        .map(([k, t]) => `<div class="vd-row"><span>${esc(k)}</span><span>${esc(t)}</span></div>`).join('')
        + `<div class="vd-row"><span></span><div class="vd-inline"><button id="native" title="Abre a janela completa de preferências do programa">Todas as preferências do programa</button></div></div>`
        + '<div class="vd-row"><span></span><span class="vd-note" style="white-space:normal">NDI® é marca registrada de Vizrt NDI AB.</span></div>';
    }
    // The fields are rewritten only when their content changes; what is being typed is never replaced under the cursor.
    if (E('content')._html == null || !E('content').contains(document.activeElement)) fill(E('content'), html);
    for (const id of ['import', 'export', 'default']) E(id).disabled = busy || !category || (category === 'display' && live);
    E('ok').disabled = busy; E('cancel').disabled = busy;
    if (!E('msg').textContent || E('msg').dataset.auto) {
      const pending = [...drafts.keys()].length, text = category === 'display' && live ? 'Gravando, transmitindo ou com a câmera virtual ligada: pare para mudar o formato do quadro.' : pending ? 'Alterações ainda não salvas: clique em OK.' : category && category !== 'display' ? 'Estas opções valem a partir da próxima vez que o 3Mix for aberto.' : '';
      say(text, category === 'display' && live ? 'error' : ''); E('msg').dataset.auto = '1';
    }
  }

  async function load() { const r = await getJson('/api/settings'); if (!r.settings?.video || !Array.isArray(r.settings.nativePreferences?.fields)) throw Error('Resposta incompleta do programa'); settings = r.settings; preset = r.preset || ''; }
  async function saveAll() {
    const changed = [...drafts.keys()]; if (!changed.length) return 0;
    const fresh = await getJson('/api/settings');
    if ((fresh.preset || '') !== preset) throw Error('O projeto mudou enquanto esta janela estava aberta. Feche e abra de novo.');
    for (const category of changed) {
      const item = LIST.find((c) => c.engine === category), values = current(category);
      for (const f of fieldsOf(category)) { const v = values[f.name]; if ((f.type === 'integer' || f.type === 'number') && !Number.isFinite(Number(v))) throw Error(`${item.label}: “${f.label}” precisa ser um número.`); values[f.name] = typed(f, v); }
      try { const r = await send('settings_apply', { category, ...values }); if (r.settings?.video) settings = r.settings; else settings = (await getJson('/api/settings')).settings; }
      catch (e) { throw Error(`${item.label}: ${e.message}`); }
      drafts.delete(category);
    }
    return changed.length;
  }
  async function run(what, task) { if (busy) return; busy = true; note(what + '…'); draw(); try { const done = await task(); note(done || 'Confirmado pelo programa.', 'ok'); } catch (e) { note(e.message, 'error'); } finally { busy = false; E('content')._html = null; draw(); } }
  // Another window of the program, opened by the program itself; outside it, a browser window.
  async function openWindow(route) { try { const r = await fetch('/api/panel-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route }), signal: AbortSignal.timeout(8000) }); if ((await r.json()).success === true) return; } catch { /* not inside the program */ } window.open(route, '_blank'); }

  E('categories').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const item = LIST.find((c) => c.id === b.dataset.id); if (item.open) { openWindow(item.open); return; } selected = item.id; E('msg').dataset.auto = '1'; say(''); E('content')._html = null; E('content').scrollTop = 0; draw(); };
  const changed = (e) => { const t = e.target; if (!t.dataset?.field) return; edit(t.dataset.category, t.dataset.field, t.type === 'checkbox' ? t.checked : t.value); E('msg').dataset.auto = '1'; draw(); };
  E('content').addEventListener('input', changed); E('content').addEventListener('change', changed);
  E('content').addEventListener('click', (e) => {
    const size = e.target.closest('[data-size]'); if (size && !size.disabled) { const [w, h] = size.dataset.size.split('x').map(Number); for (const [k, v] of [['baseWidth', w], ['baseHeight', h], ['outputWidth', w], ['outputHeight', h]]) edit('display', k, v); E('msg').dataset.auto = '1'; E('content')._html = null; draw(); return; }
    if (e.target.id === 'native') run('Abrindo as preferências do programa', async () => { await send('settings_native'); return 'Janela de preferências aberta pelo programa.'; });
  });
  const selectedCategory = () => LIST.find((c) => c.id === selected).engine;
  E('default').onclick = () => { const category = selectedCategory(); if (category) run('Lendo os valores de fábrica', async () => { const d = (await send('settings_defaults', { category })).settings?.draft; if (!d) throw Error('O programa não informou os valores de fábrica.'); for (const [k, v] of Object.entries(d)) edit(category, k, v); return 'Valores de fábrica no formulário. Clique em OK para salvar.'; }); };
  E('export').onclick = () => { const category = selectedCategory(); if (category) run('Exportando', async () => { const doc = (await send('settings_export', { category })).settings?.document; if (!doc) throw Error('O programa não entregou o arquivo.'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })); a.download = `3Mix-${category}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return 'Arquivo desta categoria exportado.'; }); };
  E('import').onclick = () => { E('import-file').value = ''; E('import-file').click(); };
  E('import-file').onchange = () => { const file = E('import-file').files[0], category = selectedCategory(); if (file && category) run('Importando', async () => { if (file.size > 65536) throw Error('O arquivo passa de 64 KB.'); let doc; try { doc = JSON.parse(await file.text()); } catch { throw Error('O arquivo não é um JSON válido.'); } if (doc.category !== category) throw Error(`Este arquivo é de outra categoria (${doc.category}).`); const d = (await send('settings_import', { document: doc })).settings?.draft; if (!d) throw Error('O programa não aceitou o arquivo.'); for (const [k, v] of Object.entries(d)) edit(category, k, v); return 'Arquivo carregado no formulário. Clique em OK para salvar.'; }); };
  E('cancel').onclick = () => window.FreeMixClosePanel();
  E('ok').onclick = () => { if (!drafts.size) { window.FreeMixClosePanel(); return; } run('Salvando', async () => { const n = await saveAll(); setTimeout(() => window.FreeMixClosePanel(), 250); return `${n} categoria(s) salva(s) e confirmada(s) pelo programa.`; }); };

  let last = null;
  setInterval(() => { const sign = String(onAir()); if (settings && sign !== last) { last = sign; draw(); } }, 700);
  (async function start() { for (;;) { try { await load(); break; } catch (e) { say(e.message + ' Tentando de novo…', 'error'); await new Promise((r) => setTimeout(r, 1500)); } } say(''); E('msg').dataset.auto = '1'; draw(); })();
})();
