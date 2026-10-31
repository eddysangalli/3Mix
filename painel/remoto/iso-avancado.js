// Multigravação (ISO): cada entrada marcada vira um arquivo próprio. Aplicar salva padrões e opções por entrada sem
// iniciar nada; Iniciar e Parar são ações separadas. O motor grava tudo ou recusa tudo, então uma falha é atribuída à
// entrada citada na mensagem e as demais continuam selecionadas para nova tentativa.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id), esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BUS_SCENE = 'FreeMix Barramentos';
  const FORMAT_LABEL = { mpegts: 'MPEG-TS', mkv: 'MKV', mp4_safe: 'MP4 seguro' };
  const AUDIO_LABEL = { input: 'Entrada', master: 'Master', 'bus-a': 'Bus A', 'bus-b': 'Bus B', 'all-tracks': 'Todas as trilhas', source: 'Fonte pública' };
  const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  let state = null, live = null, loaded = false, caps = null, busy = false, dirty = false;
  let selected = new Set(), overrides = {}, errors = {}, filter = '';
  let lastSignature = '';

  const say = (text, kind = '') => { const box = E('iso-message'); box.textContent = text; box.className = 'vd-msg' + (kind ? ' vd-' + kind : ''); box.style.marginLeft = '0'; };
  async function request(data) {
    const r = await fetch('/api/iso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(120000) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok || !v.success) throw Error(v.error || 'A multigravação recusou a operação');
    return v;
  }
  const unique = (list) => [...new Set(list.filter(Boolean))];
  const eligible = () => unique(state?.availableCams || live?.scenes || []).filter((n) => !/^REPLAY /.test(n) && n !== BUS_SCENE);
  const notEligible = () => unique(live?.scenes || []).filter((n) => /^REPLAY /.test(n) || n === BUS_SCENE);
  const sortedEligible = () => { const q = filter.trim().toLocaleLowerCase('pt-BR'); return eligible().filter((n) => !q || n.toLocaleLowerCase('pt-BR').includes(q)); };
  const recording = () => !!state?.rec;
  const sessionCam = (name) => (state?.session?.cams || []).find((c) => c.name === name);

  // ---- options ----
  const globalNumber = (id, fallback = 0) => { const n = Number(E(id).value); return Number.isFinite(n) ? n : fallback; };
  function optionsFromForm() {
    const perInput = {};
    for (const [name, o] of Object.entries(overrides)) {
      const entry = {};
      if (o.audio) { entry.audio = o.audio; if (o.audio === 'source') entry.audioSourceUUID = E('iso-audio-source').value; }
      if (o.format) entry.format = o.format;
      if (o.splitSeconds !== undefined) entry.splitSeconds = o.splitSeconds;
      if (o.directory) entry.directory = o.directory;
      if (o.prefix) entry.prefix = o.prefix;
      if (Object.keys(entry).length) perInput[name] = entry;
    }
    const audio = E('iso-audio').value;
    return {
      format: E('iso-format').value,
      directory: E('iso-directory').value.trim(),
      prefix: E('iso-prefix').value.trim(),
      encoder: E('iso-encoder').value || 'default',
      crf: globalNumber('iso-crf', 23),
      audio,
      audioSourceUUID: audio === 'source' ? E('iso-audio-source').value : '',
      splitSeconds: Math.round(globalNumber('iso-split', 0) * 60),
      perInput,
    };
  }
  function validOptions(o) {
    if (!['mpegts', 'mkv', 'mp4_safe'].includes(o.format)) throw Error('Escolha um formato de gravação.');
    if (!/^[-\w ]{1,40}$/.test(o.prefix) || !o.prefix) throw Error('Prefixo: 1 a 40 letras, números, espaços, hífen ou sublinhado.');
    if (o.directory && !/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(o.directory)) throw Error('A pasta base precisa ser um caminho absoluto do Windows.');
    if (!Number.isInteger(o.crf) || o.crf < 0 || o.crf > 51) throw Error('Qualidade CRF: inteiro de 0 a 51.');
    if (!Number.isInteger(o.splitSeconds) || o.splitSeconds < 0 || o.splitSeconds > 86400 || (o.splitSeconds > 0 && o.splitSeconds < 4)) throw Error('Duração: zero (sem divisão) ou 4 a 86400 segundos.');
    if (o.audio === 'source' && !o.audioSourceUUID) throw Error('Escolha a fonte pública de áudio ou use o áudio da entrada.');
    for (const [name, entry] of Object.entries(o.perInput)) {
      if (entry.audio === 'source' && !o.audioSourceUUID) throw Error('Entrada ' + name + ': escolha a fonte pública de áudio.');
      if (entry.splitSeconds !== undefined && (!Number.isInteger(entry.splitSeconds) || entry.splitSeconds < 0 || entry.splitSeconds > 86400 || (entry.splitSeconds > 0 && entry.splitSeconds < 4))) throw Error('Entrada ' + name + ': duração inválida.');
      if (entry.prefix && !/^[-\w ]{1,40}$/.test(entry.prefix)) throw Error('Entrada ' + name + ': prefixo inválido.');
      if (entry.directory && !/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(entry.directory)) throw Error('Entrada ' + name + ': pasta precisa ser absoluta.');
    }
    return o;
  }
  function syncForm() {
    const o = state?.recordOptions || {};
    E('iso-format').value = o.format || 'mpegts';
    E('iso-encoder').value = o.encoder || 'default';
    E('iso-crf').value = o.crf ?? 23;
    E('iso-audio').value = o.audio || 'input';
    E('iso-prefix').value = o.prefix || 'cam';
    E('iso-split').value = Number(o.splitSeconds || 0) / 60;
    E('iso-directory').value = o.directory || '';
    overrides = structuredClone(o.perInput || {});
    if (E('iso-audio-source')) E('iso-audio-source').value = o.audioSourceUUID || '';
    dirty = false;
  }

  // ---- table ----
  function optionSet(values, current, inheritLabel) {
    return `<option value=""${!current ? ' selected' : ''}>${esc(inheritLabel)}</option>` + values.map(([v, l]) => `<option value="${esc(v)}"${String(current) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }  function rowHtml(name, isEligible) {
    const o = overrides[name] || {}, cam = sessionCam(name), isSel = selected.has(name), error = errors[name];
    const liveState = !isEligible ? '<span>Não elegível</span>'
      : recording() && cam ? '<span class="rec">Gravando · ' + fmtTime(Date.now() - (state.session.startedAt || Date.now())) + '</span>'
      : error ? '<span class="err">Falhou</span>' : '<span>Parada</span>';
    const file = cam ? String(cam.file || '').split(/[\\/]/).pop() : '';
    const fullFile = cam?.finalFiles?.[0] || cam?.file || '';
    const disabled = recording() || busy || !isEligible ? ' disabled' : '';
    return `<tr data-name="${esc(name)}" class="iso-row ${isEligible ? 'eligible' : 'not-eligible'}${isSel ? ' is-selected' : ''}${error ? ' has-error' : ''}">
      <td><input type="checkbox" data-pick="${esc(name)}"${isSel ? ' checked' : ''}${disabled || !isEligible ? ' disabled' : ''} aria-label="Gravar ${esc(name)}"></td>
      <td class="iso-name">${esc(name)}${!isEligible ? '<br><small>Replay e barramentos não entram na multigravação</small>' : ''}</td>
      <td class="iso-cell-state" data-live="${esc(name)}">${liveState}</td>
      <td><select class="iso-row-select" data-row="audio" data-name="${esc(name)}"${disabled}>${optionSet([['input', 'Entrada'], ['master', 'Master'], ['bus-a', 'Bus A'], ['bus-b', 'Bus B'], ['all-tracks', 'Todas as trilhas'], ['source', 'Fonte pública']], o.audio, 'Herdar')}</select></td>
      <td><select class="iso-row-select" data-row="format" data-name="${esc(name)}"${disabled}>${optionSet([['mpegts', 'MPEG-TS'], ['mkv', 'MKV'], ['mp4_safe', 'MP4 seguro']], o.format, 'Herdar')}</select></td>
      <td><input class="iso-row-input" type="number" min="0" max="1440" step="1" placeholder="—" title="Duração deste arquivo em minutos; vazio herda o padrão" value="${o.splitSeconds !== undefined ? Math.round(o.splitSeconds / 60) : ''}" data-row="split" data-name="${esc(name)}"${disabled}></td>
          <td><div class="iso-file-row"><input class="iso-row-input iso-row-dir" type="text" placeholder="Pasta base" value="${esc(o.directory || '')}" data-row="directory" data-name="${esc(name)}"${disabled}>
          <input class="iso-row-input iso-row-prefix" type="text" maxlength="40" placeholder="Prefixo" value="${esc(o.prefix || '')}" data-row="prefix" data-name="${esc(name)}"${disabled}></div>
          <span class="iso-file" title="${esc(fullFile)}">${esc(file || (isSel ? 'Arquivo definido ao iniciar' : '—'))}</span></td>
      <td>${error ? `<span class="iso-error">${esc(error)}<button type="button" data-retry="${esc(name)}" title="Remover esta entrada e tentar as demais">Sem esta</button></span>` : ''}</td>
    </tr>`;
  }
  function renderTable() {
    const eligibleRows = sortedEligible(), others = notEligible().filter((n) => !filter || n.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')));
    const body = [];
    if (eligibleRows.length) body.push(...eligibleRows.map((n) => rowHtml(n, true)));
    else body.push('<tr><td colspan="8" class="iso-help">Nenhuma entrada elegível encontrada com este filtro.</td></tr>');
    if (others.length) {
      if (eligibleRows.length) body.push('<tr><td colspan="8" class="iso-help" style="background:#1d1d1d">Fora da multigravação</td></tr>');
      body.push(...others.map((n) => rowHtml(n, false)));
    }
    E('iso-rows').innerHTML = body.join('');
    updateCounts();
  }
  function updateCounts() {
    const total = sortedEligible().length;
    E('iso-count').textContent = selected.size + (selected.size === 1 ? ' selecionada' : ' selecionadas') + ' · ' + total + (total === 1 ? ' elegível' : ' elegíveis');
    E('iso-start').disabled = busy || recording() || !selected.size;
    E('iso-stop').disabled = busy || !recording();
    E('iso-save').disabled = busy || recording();
    E('iso-close').disabled = busy;
    E('iso-recover').disabled = busy || recording();
    E('iso-select-eligible').disabled = busy || recording() || !total;
    E('iso-clear').disabled = busy || recording() || !selected.size;
    E('iso-foot-note').textContent = recording()
      ? 'Gravando: Fechar esta janela mantém a gravação; use Parar e finalizar para encerrá-la.'
      : 'Aplicar salva os padrões e as opções por entrada; não inicia gravação.';
  }
  function updateLive() {
    for (const name of eligible()) {
      const cell = E('iso-rows').querySelector('[data-live="' + CSS.escape(name) + '"]');
      if (!cell) continue;
      const cam = sessionCam(name), error = errors[name];
      cell.innerHTML = recording() && cam ? '<span class="rec">Gravando · ' + fmtTime(Date.now() - (state.session.startedAt || Date.now())) + '</span>'
        : error ? '<span class="err">Falhou</span>' : '<span>Parada</span>';
    }
    for (const name of eligible()) {
      const cam = sessionCam(name);
      if (!cam) continue;
      const row = E('iso-rows').querySelector('tr[data-name="' + CSS.escape(name) + '"]');
      const file = row?.querySelector('.iso-file');
      if (file) { const full = cam.finalFiles?.[0] || cam.file || ''; file.textContent = String(full).split(/[\\/]/).pop() || '—'; file.title = full; }
    }
  }
  function renderSession() {
    const card = E('iso-session-card'), s = state?.session;
    const hasSession = !!s;
    card.hidden = !hasSession;
    if (!hasSession) return;
    E('iso-session-dir').textContent = s.dir || '';
    const cams = s.cams || [], files = cams.flatMap((c) => (c.finalFiles?.length ? c.finalFiles : c.files || (c.file ? [c.file] : [])));
    const rec = recording();
    const limit = s.options?.splitSeconds ? ' · dividindo a cada ' + Math.round(s.options.splitSeconds / 60) + ' min' : '';
    E('iso-session-summary').innerHTML = '<span>Iniciada em <b>' + esc(new Date(s.startedAt || Date.now()).toLocaleTimeString('pt-BR')) + '</b></span>'
      + '<span><b>' + cams.length + '</b> ' + (cams.length === 1 ? 'arquivo' : 'arquivos') + '</span>'
      + '<span>' + (rec ? '<b>Gravando</b>' : 'Encerrada') + esc(limit) + '</span>';
    E('iso-files').innerHTML = files.length ? files.slice(0, 40).map((f) => '<li title="' + esc(f) + '">' + esc(f) + '</li>').join('') : '<li>Nenhum arquivo finalizado ainda.</li>';
  }

  function renderEncoderOptions() {
    const list = caps || [];
    const current = E('iso-encoder').value || 'default';
    E('iso-encoder').innerHTML = '<option value="default">H.264 CPU (padrão)</option>' + list.map((c) => '<option value="' + esc(c.id) + '">' + esc(({ h264: 'H.264', hevc: 'HEVC / H.265', av1: 'AV1' }[c.codec] || c.codec)) + ' · ' + esc(c.name) + (c.hardware ? ' (GPU)' : '') + '</option>').join('');
    E('iso-encoder').value = [...E('iso-encoder').options].some((o) => o.value === current) ? current : 'default';
  }
  function renderAudioChoices() {
    const choices = state?.audioChoices || [], select = E('iso-audio-source');
    if (!select) return;
    const value = select.value;
    const signature = JSON.stringify(choices);
    if (select.dataset.choices !== signature) {
      select.dataset.choices = signature;
      select.innerHTML = '<option value="">Selecione…</option>' + choices.map((c) => '<option value="' + esc(c.key) + '">' + esc((c.bus ? 'Bus · ' : '') + c.name) + '</option>').join('');
      if (choices.some((c) => c.key === value)) select.value = value;
      else select.value = '';
    }
    if (E('iso-audio').value !== 'source') select.value = '';
  }
  function updateHelp() {
    const fmt = E('iso-format').value;
    E('iso-format-help').textContent = fmt === 'mpegts' ? 'MPEG-TS: tolerante a quedas e leve; uma trilha de áudio.'
      : fmt === 'mkv' ? 'MKV: tolerante a quedas e aceita várias trilhas; ao parar, os arquivos ficam como MKV.'
      : 'MP4 seguro: grava em MKV e finaliza em MP4 ao parar; os MKV originais são preservados.';
    const source = E('iso-audio').value === 'source', has = (state?.audioChoices || []).length;
    E('iso-audio-help').textContent = source
      ? (has ? 'A fonte pública escolhida precisa estar visível e com trilha 1 habilitada em todas as entradas selecionadas.' : 'Nenhuma fonte pública disponível agora. Use o áudio da entrada ou um barramento.')
      : (state?.audioSourceLimit || 'Cada arquivo leva o áudio escolhido; por entrada é possível substituir o padrão.');
    E('iso-audio-source').disabled = recording() || !source;
    for (const id of ['iso-format', 'iso-encoder', 'iso-crf', 'iso-audio', 'iso-split', 'iso-prefix', 'iso-directory', 'iso-browse']) E(id).disabled = recording() || busy;
  }

  function render() {
    if (!loaded) return;
    updateHelp();
    renderAudioChoices();
    renderTable();
    renderSession();
    updateCounts();
    const signature = JSON.stringify({ names: eligible(), others: notEligible(), rec: recording(), errors: Object.keys(errors) });
    lastSignature = signature;
  }

  // ---- actions ----
  async function applyOptions(silent = false) {
    const options = validOptions(optionsFromForm());
    const r = await request({ action: 'configure', options });
    state = r.iso || state;
    if (!silent) say('Opções aplicadas e confirmadas pelo motor. Nada foi gravado.', 'ok');
    dirty = false;
    return options;
  }
  async function start() {
    if (busy || recording()) return;
    if (!selected.size) { say('Marque pelo menos uma entrada para iniciar.', 'error'); return; }
    const cams = eligible().filter((n) => selected.has(n));
    if (!cams.length) { say('As entradas marcadas não estão mais disponíveis.', 'error'); return; }
    if (cams.length > 8) { say('O motor aceita no máximo oito entradas por sessão.', 'error'); return; }
    busy = true; updateCounts(); say('Aplicando e iniciando a multigravação…');
    try {
      await applyOptions(true);
      const r = await request({ action: 'start', cams });
      state = r.iso || state; errors = {};
      say('Multigravação confirmada pelo motor: ' + cams.length + (cams.length === 1 ? ' arquivo em gravação.' : ' arquivos em gravação.'), 'ok');
      render();
    } catch (e) {
      const message = String(e.message || 'Falha ao iniciar');
      errors = {};
      const hit = cams.find((n) => message.includes(n));
      if (hit) errors[hit] = message;
      else errors['*'] = message;
      say(message + (hit ? ' — a entrada “' + hit + '” foi isolada; use Sem esta para tentar as demais.' : ''), 'error');
      renderTable();
    } finally { busy = false; updateCounts(); }
  }
  async function stop() {
    if (busy || !recording()) return;
    busy = true; updateCounts(); say('Parando e finalizando os arquivos…');
    try { const r = await request({ action: 'stop' }); state = r.iso || state; errors = {}; say('Multigravação parada; arquivos fechados.', 'ok'); }
    catch (e) { say(e.message, 'error'); }
    finally { busy = false; render(); }
  }

  // ---- events ----
  E('iso-format').onchange = () => { dirty = true; updateHelp(); };
  for (const id of ['iso-encoder', 'iso-crf', 'iso-audio', 'iso-split', 'iso-prefix', 'iso-directory']) E(id).addEventListener('input', () => { dirty = true; if (id === 'iso-audio') updateHelp(); });
  E('iso-audio').addEventListener('change', () => { dirty = true; updateHelp(); });
  E('iso-format').addEventListener('change', () => { dirty = true; updateHelp(); });
  E('iso-browse').onclick = () => { E('iso-folder-picker').value = ''; E('iso-folder-picker').click(); };
  E('iso-folder-picker').onchange = () => {
    const file = E('iso-folder-picker').files?.[0]; if (!file) return;
    const absolute = file.path || '', folder = absolute ? absolute.replace(/[\\/][^\\/]+$/, '') : '';
    if (!folder) { say('O seletor não devolveu o caminho completo. Cole a pasta base no campo.', 'error'); return; }
    E('iso-directory').value = folder; dirty = true; say('Pasta base escolhida: ' + folder, 'ok');
  };
  E('iso-rows').addEventListener('change', (e) => {
    const t = e.target, name = t.dataset.name;
    if (t.dataset.pick) {
      if (t.checked) selected.add(t.dataset.pick); else selected.delete(t.dataset.pick);
      t.closest('tr')?.classList.toggle('is-selected', t.checked);
      if (errors[t.dataset.pick]) delete errors[t.dataset.pick];
      updateCounts(); return;
    }
    if (!name || !t.dataset.row) return;
    const o = { ...(overrides[name] || {}) }, row = t.dataset.row;
    if (row === 'audio' || row === 'format') { if (t.value) o[row] = t.value; else delete o[row]; }
    else if (row === 'split') { if (t.value === '') delete o.splitSeconds; else o.splitSeconds = Math.round(Number(t.value) * 60); }
    else if (row === 'directory' || row === 'prefix') { if (t.value.trim()) o[row] = t.value.trim(); else delete o[row]; }
    if (Object.keys(o).length) overrides[name] = o; else delete overrides[name];
    dirty = true; say('Alterações por entrada ainda não aplicadas.', '');
  });
  E('iso-rows').addEventListener('click', (e) => {
    const retry = e.target.closest('[data-retry]');
    if (retry) { selected.delete(retry.dataset.retry); delete errors[retry.dataset.retry]; start(); }
  });
  E('iso-filter').addEventListener('input', (e) => { filter = e.target.value; renderTable(); });
  E('iso-select-eligible').onclick = () => { for (const n of sortedEligible()) selected.add(n); renderTable(); };
  E('iso-clear').onclick = () => { selected.clear(); errors = {}; renderTable(); };
  E('iso-save').onclick = async () => {
    if (busy || recording()) return;
    busy = true; updateCounts(); say('Aplicando opções…');
    try { await applyOptions(); } catch (e) { say(e.message, 'error'); }
    finally { busy = false; render(); }
  };
  E('iso-start').onclick = start;
  E('iso-stop').onclick = stop;
  E('iso-recover').onclick = async () => {
    if (busy || recording()) { say('Pare a multigravação antes de finalizar arquivos antigos.', 'error'); return; }
    if (!confirm('Finalizar em MP4 os MKV de sessões anteriores? Os MKV originais são preservados.')) return;
    busy = true; updateCounts();
    try { await request({ action: 'recover' }); say('Arquivos MP4 finalizados; MKV originais preservados.', 'ok'); }
    catch (e) { say(e.message, 'error'); }
    finally { busy = false; render(); }
  };
  E('iso-close').onclick = () => { if (recording()) say('A gravação continua no motor.', 'ok'); window.FreeMixClosePanel?.(); };

  // ---- live state ----
  let poll = 0;
  setInterval(async () => {
    if (busy || document.hidden) return;
    try {
      const [isoResponse, jsonResponse] = await Promise.all([
        fetch('/api/iso', { signal: AbortSignal.timeout(6000) }).then((r) => r.json()),
        fetch('/api/json', { signal: AbortSignal.timeout(6000) }).then((r) => r.json()).catch(() => null),
      ]);
      if (!isoResponse.success) throw Error(isoResponse.error || 'Multigravação indisponível');
      state = isoResponse.iso; live = jsonResponse || live;
      const pill = () => {
        E('iso-state-text').textContent = recording() ? 'Gravando ' + fmtTime(Date.now() - (state.session?.startedAt || Date.now())) : 'Parada';
        E('iso-state').classList.toggle('rec', recording());
      };
      pill();
      if (!loaded) {
        loaded = true;
        syncForm();
        try {
          const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'outputs_get' }), signal: AbortSignal.timeout(8000) });
          const v = await r.json();
          caps = (v.outputs?.encoders || []).filter((c) => c && c.id);
          renderEncoderOptions();
        } catch { /* encoder list is optional */ }
        render(); say('');
        return;
      }
      if (!dirty) syncForm();
      const signature = JSON.stringify({ names: eligible(), others: notEligible(), rec: recording(), errors: Object.keys(errors) });
      if (signature !== lastSignature) render(); else { updateLive(); renderSession(); updateCounts(); }
      if (++poll % 4 === 0) updateHelp();
    } catch (e) {
      E('iso-state-text').textContent = 'Reconectando…';
      E('iso-state').classList.remove('rec');
      if (!loaded) say(e.message + ' Tentando de novo…', 'error');
    }
  }, 1200);
})();
