// Guided presentation of the existing output controls. No second configuration model.
// Opening/changing steps never saves, starts, records or queries a third-party service.
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const content = document.querySelector('.workspace .content');
  if (!content || byId('output-workflow')) return;
  let step = 0, operation = null, transaction = false, lastSelection = '', actionError = '';
  const preparedEmptyDestinations = new Set();
  const sections = [], workspace = content.closest('.workspace');
  const slotNavigation = workspace.querySelector('nav');
  slotNavigation.setAttribute('aria-label', 'Saídas adicionais');
  const slotHeading = document.createElement('h2'); slotHeading.className = 'operation-slot-heading'; slotHeading.textContent = 'Saídas adicionais'; slotNavigation.prepend(slotHeading);
  const empty = document.createElement('section'); empty.className = 'operation-empty';
  empty.innerHTML = '<h2>Escolha uma saída para configurar</h2><p>Na lista, selecione uma saída livre ou um destino já salvo. Depois informe a conexão, escolha vídeo e áudio e confira antes de iniciar.</p><p class="operation-help">1. Destino · 2. Conteúdo e áudio · 3. Conferir e iniciar</p>';
  const original = [...content.childNodes];
  const workflow = document.createElement('section');
  workflow.id = 'output-workflow';
  const navigation = document.createElement('nav');
  navigation.className = 'operation-steps';
  navigation.setAttribute('aria-label', 'Etapas para configurar a saída');
  ['Destino', 'Conteúdo e áudio', 'Conferir e iniciar'].forEach((title, n) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = (n + 1) + '. ' + title;
    button.addEventListener('click', () => showStep(n, true));
    navigation.append(button);
    const section = document.createElement('section');
    section.className = 'operation-step';
    section.setAttribute('aria-label', title);
    section.innerHTML = '<h2>' + (n + 1) + '. ' + title + '</h2>';
    sections.push(section);
  });
  const status = document.createElement('p');
  status.id = 'operation-status'; status.setAttribute('role', 'status');
  const capacityNote = document.createElement('p');
  capacityNote.id = 'operation-capacity'; capacityNote.className = 'operation-help';
  const footer = document.createElement('div'); footer.className = 'operation-footer';
  const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Voltar';
  const next = document.createElement('button'); next.type = 'button'; next.className = 'operation-primary';
  back.onclick = () => showStep(step - 1, true);
  next.onclick = () => { const error = validate(step); if (error) { status.textContent = error; status.classList.add('operation-error'); focusInvalid(error); return; } showStep(step + 1, true); };
  const actionRow = byId('save').closest('.row');
  const quality = document.createElement('details');
  quality.className = 'operation-advanced'; quality.innerHTML = '<summary>Qualidade e formato avançados</summary>';
  const alpha = document.createElement('details');
  alpha.id = 'operation-alpha'; alpha.className = 'operation-advanced';
  alpha.innerHTML = '<summary>Transparência / Fill+Key</summary><p>Use apenas para uma origem com transparência. O receptor precisa recompor a máscara; 4:4:4 sozinho não cria alpha.</p>';
  const connectionDetails = document.createElement('details');
  connectionDetails.className = 'operation-advanced';
  connectionDetails.innerHTML = '<summary>Latência, endereço de escuta e URL avançada</summary>';
  const sceneDetails = document.createElement('details');
  sceneDetails.className = 'operation-advanced'; sceneDetails.innerHTML = '<summary>Overlays e enquadramento</summary>';
  const extras = document.createElement('details');
  extras.className = 'operation-advanced'; extras.innerHTML = '<summary>Mix independente e perfis</summary>';
  const summary = document.createElement('dl'); summary.id = 'operation-summary';
  const checkNote = document.createElement('p'); checkNote.className = 'operation-help';
  checkNote.textContent = 'Confira a origem e o destino. Salvar guarda a configuração; iniciar envia. O estado do motor não confirma que o receptor está vendo ou ouvindo.';
  const protocolLabel = byId('protocol').closest('label');
  const serverLabel = byId('server').closest('label');
  const keyLabel = byId('key').closest('label');
  const connection = byId('srt-connection');
  const hint = document.createElement('p'); hint.id = 'operation-destination-help'; hint.className = 'operation-help';
  const qualitySummary = document.createElement('p'); qualitySummary.className = 'operation-help';
  const otherAdvanced = document.createElement('details');
  otherAdvanced.className = 'operation-advanced'; otherAdvanced.innerHTML = '<summary>Mais ajustes da saída</summary>';
  const principal = byId('principal-stream-access');
  const principalDetails = document.createElement('details');
  principalDetails.className = 'operation-principal';
  principalDetails.innerHTML = '<summary>Transmissão principal · perfil salvo</summary>';
  if (principal) {
    principal.before(principalDetails); principalDetails.append(principal);
    const text = [...principal.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes('perfil'));
    if (text) text.textContent = ' · Este destino usa o perfil principal. As saídas abaixo são destinos adicionais. ';
  }
  const labels = id => byId(id)?.closest('label');
  function move(id, target, label = true) { const node = label ? labels(id) : byId(id); if (node) target.append(node); }
  function help(id, text) {
    const field = byId(id); if (!field) return;
    const p = document.createElement('p'); p.id = 'operation-help-' + id; p.className = 'operation-help'; p.textContent = text;
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), p.id].filter(Boolean).join(' '));
    field.closest('label')?.after(p);
  }
  function relabel(id, text) {
    const node = labels(id); if (!node) return;
    const old = [...node.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (old) old.textContent = text;
  }
  const reserve = document.createElement('div'); reserve.hidden = true;
  for (const node of original) reserve.append(node);
  content.append(reserve);
  workflow.append(empty, navigation, status, capacityNote, ...sections);
  content.prepend(workflow);
  sections[0].append(hint); move('name', sections[0]); sections[0].append(protocolLabel);
  if (connection) {
    sections[0].append(connection);
    for (const id of ['srt-connection-latency', 'srt-local-ips']) move(id, connectionDetails);
    for (const id of ['srt-local-ip-note', 'srt-connection-help', 'srt-connection-message']) move(id, connectionDetails, false);
    const advancedURL = byId('srt-connection-advanced'); if (advancedURL) connectionDetails.append(advancedURL);
    move('srt-connection-url', connectionDetails);
    byId('srt-connection-copy')?.closest('.row') && connectionDetails.append(byId('srt-connection-copy').closest('.row'));
    sections[0].append(connectionDetails);
  }
  sections[0].append(serverLabel, keyLabel);
  for (const id of ['mode', 'input', 'output-mix', 'audio', 'resolution']) move(id, sections[1]);
  const format = reserve.querySelector('.format-tabs'); if (format) labels('resolution').before(format);
  help('mode', 'Programa acompanha o que está no ar. Escolha Entrada para enviar outra câmera, vídeo ou composição.');
  help('audio', 'Master envia o som do programa. Selecione outro barramento apenas se esta saída precisa de um áudio diferente.');
  for (const id of ['bitrate', 'codec', 'encoder', 'fps', 'enhanced-rtmp', 'stinger-audio', 'auto']) move(id, quality);
  move('codec-compatibility', quality, false);
  move('fill', sceneDetails);
  const overlays = [...reserve.querySelectorAll('fieldset')].find(node => node.querySelector('[data-overlay]'));
  if (overlays) { overlays.classList.add('operation-overlays'); sceneDetails.append(overlays); }
  for (const id of ['prepare-srt-packed420', 'prepare-srt-separate', 'prepare-srt-alpha']) {
    const row = byId(id)?.closest('.row'); if (row && row.parentNode !== alpha) alpha.append(row);
  }
  for (const id of ['prepare-srt-note', 'srt-options']) move(id, alpha, false);
  const srtAudioGuide = byId('srt-audio-guide'); if (srtAudioGuide) quality.append(srtAudioGuide);
  sections[1].append(qualitySummary, quality, sceneDetails, alpha);
  const profileRow = byId('profile')?.closest('.row'); if (profileRow) extras.append(profileRow);
  move('profiles', extras, false);
  for (const node of [...document.querySelectorAll('[data-output-panel="destinations"]')]) {
    if (node === workspace || node.contains(workspace)) continue;
    if (node.id === 'external-multi-rtmp') { otherAdvanced.append(node); continue; }
    extras.append(node);
  }
  sections[1].append(extras, otherAdvanced);
  sections[2].append(summary, checkNote, actionRow, byId('output-status'));
  move('record', otherAdvanced, false);
  content.append(workflow, reserve);
  footer.append(back, next); workflow.append(footer);
  workspace.classList.add('operation-workspace');
  content.addEventListener('input', () => { actionError = ''; paint(); });
  content.addEventListener('change', () => { actionError = ''; paint(); });
  const srt = () => document.querySelector('[data-panel="srt"]')?.getAttribute('aria-selected') === 'true';
  const showing = () => srt() || document.querySelector('[data-panel="destinations"]')?.getAttribute('aria-selected') === 'true';
  const d = () => typeof outputs === 'undefined' ? null : outputs?.destinations?.[index];
  const get = id => byId(id)?.value || '';
  const protocolSRT = () => get('protocol') === 'srt' || get('protocol') === 'auto' && /^srt:/i.test(get('server'));
  function validate(at) {
    if (typeof outputs === 'undefined' || !outputs) return 'Aguarde a leitura das saídas do motor.';
    if (typeof index === 'undefined' || index < 0) return 'Escolha uma saída existente ou uma saída livre na lista.';
    if (!get('name').trim()) return 'Dê um nome a este destino.';
    if (at === 0 && srt() && protocolSRT()) {
      const host = get('srt-connection-host').trim(), port = Number(get('srt-connection-port'));
      if (!host || /[\s/?#@]/.test(host)) return 'Informe o IP ou nome do receptor, sem uma URL.';
      if (/^\d+(?:\.\d+){3}$/.test(host) && host.split('.').some(part => Number(part) > 255)) return 'O IP informado é inválido: cada número deve estar entre 0 e 255.';
      if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Informe uma porta entre 1 e 65535.';
      const latency = Number(get('srt-connection-latency'));
      if (!Number.isFinite(latency) || latency < 0 || latency > 8000) return 'A latência deve estar entre 0 e 8000 ms.';
      if (get('srt-connection-mode') === 'caller' && ['0.0.0.0', '::'].includes(host)) return 'Em Conectar ao receptor, use o IP do receptor. 0.0.0.0 serve apenas para aguardar uma conexão.';
      try {
        const url = new URL(get('srt-connection-url'));
        if (url.protocol !== 'srt:') throw Error();
      } catch { return 'Confira a URL avançada e os dados da conexão SRT.'; }
    } else if (at === 0) {
      try { const u = new URL(get('server')); if (!(srt() ? ['srt:', 'rist:'] : ['rtmp:', 'rtmps:', 'http:', 'https:']).includes(u.protocol)) throw Error(); }
      catch { return srt() ? 'Informe uma URL SRT ou RIST válida.' : 'Cole o servidor RTMP/RTMPS ou a URL HLS fornecida pela plataforma.'; }
    }
    if (at >= 1 && get('mode') === 'source' && !(FreeMixRemote.getState().inputs || []).some(input => input.key === get('input'))) return 'A entrada escolhida não está disponível. Escolha uma entrada existente.';
    if (at >= 1 && !get('encoder')) return 'Não há codificador disponível para o codec selecionado.';
    return '';
  }
  function focusInvalid(error = '') {
    const matches = [
      ['Dê um nome', 'name'], ['porta entre', 'srt-connection-port'],
      ['A latência deve', 'srt-connection-latency'], ['Não há codificador', 'encoder'],
      ['A entrada escolhida', 'input'], ['URL avançada', 'server'],
      ['URL SRT ou RIST', 'server'], ['servidor RTMP/RTMPS', 'server']
    ];
    const id = matches.find(([message]) => error.includes(message))?.[1] || (!get('name').trim() ? 'name' : step === 0 ? srt() ? 'srt-connection-host' : 'server' : 'input');
    const field = byId(id); if (!field) return;
    for (let parent = field.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    field.focus();
  }
  function showStep(value, focus = false) {
    step = Math.max(0, Math.min(2, value)); paint();
    if (focus) { const heading = sections[step].querySelector('h2'); heading.tabIndex = -1; heading.focus(); }
  }
  function entry(label, value) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; summary.append(dt, dd); }
  function safeDestination() {
    if (srt() && protocolSRT()) return (get('srt-connection-mode') === 'listener' ? 'Aguardar em ' : 'Conectar a ') + get('srt-connection-host') + ':' + get('srt-connection-port');
    try { const u = new URL(get('server')); return u.protocol.replace(':', '').toUpperCase() + ' · ' + u.hostname + (u.port ? ':' + u.port : '') + ' · caminho configurado'; }
    catch { return 'Não configurado'; }
  }
  function paint() {
    principalDetails.hidden = !showing() || srt();
    if (!showing()) return;
    const ready = typeof outputs !== 'undefined' && !!outputs, selected = ready && index >= 0;
    const destinations = ready && Array.isArray(outputs.destinations) ? outputs.destinations : null;
    empty.hidden = selected; navigation.hidden = !selected;
    workspace.dataset.outputSelection = selected ? 'selected' : 'empty';
    empty.querySelector('h2').textContent = ready ? 'Escolha uma saída para configurar' : 'Lendo as saídas do motor…';
    empty.querySelector('p').textContent = ready ? 'Na lista, selecione uma saída livre ou um destino já salvo. Depois informe ' + (srt() ? 'o IP e a porta do receptor SRT, ou a conexão RIST.' : 'o servidor e a chave fornecidos pela plataforma.') : 'Aguarde a leitura atual. Nenhum destino será escolhido ou iniciado automaticamente.';
    if (!destinations?.length) capacityNote.textContent = 'Aguardando a capacidade dos destinos adicionais. A transmissão principal é separada.';
    else {
      const available = destinations.filter(destination => destination && !destination.active && !destination.enabled && !destination.server).length;
      capacityNote.textContent = 'Destinos adicionais: ' + destinations.length + ' no total, compartilhados entre MultiStream e SRT/RIST desta tela · ' + available + (available === 1 ? ' livre na última leitura.' : ' livres na última leitura.') + ' A transmissão principal é separada.';
    }
    const selection = (srt() ? 'srt:' : 'stream:') + index;
    if (selection !== lastSelection) { step = 0; lastSelection = selection; actionError = ''; }
    sections.forEach((section, n) => { section.hidden = n !== step || !selected; });
    [...navigation.children].forEach((button, n) => { button.classList.toggle('selected', n === step); button.setAttribute('aria-current', n === step ? 'step' : 'false'); button.disabled = !selected || !!operation || transaction; });
    footer.hidden = !selected; back.disabled = step === 0; next.hidden = step === 2;
    next.textContent = step === 0 ? 'Continuar · conteúdo e áudio' : 'Conferir antes de iniciar';
    const useSRT = srt() && protocolSRT();
    for (const option of byId('protocol').options) {
      const accepted = option.value === 'auto' || (srt() ? ['srt','rist'] : ['rtmp','rtmps','hls']).includes(option.value);
      option.hidden = !accepted;
      option.disabled = !accepted || option.value !== 'auto' && !outputs?.protocols?.some(protocol => protocol.id === option.value && protocol.available);
    }
    protocolLabel.hidden = false;
    if (srt() && protocolLabel.parentNode !== sections[0]) hint.after(protocolLabel);
    if (!srt() && protocolLabel.parentNode !== quality) quality.append(protocolLabel);
    const advancedURL = byId('srt-connection-advanced');
    if (useSRT && advancedURL && serverLabel.parentNode !== advancedURL) advancedURL.append(serverLabel);
    if (!useSRT && serverLabel.parentNode !== sections[0]) sections[0].insertBefore(serverLabel, keyLabel);
    serverLabel.hidden = false; keyLabel.hidden = srt();
    if (advancedURL) { advancedURL.hidden = !useSRT; advancedURL.querySelector('summary').hidden = false; }
    if (connection) connection.hidden = !useSRT;
    connectionDetails.hidden = !useSRT;
    if (useSRT) {
      const select = byId('srt-connection-mode');
      for (const option of select.options) { if (option.value === 'caller') option.textContent = 'Conectar ao receptor (Caller)'; if (option.value === 'listener') option.textContent = 'Aguardar conexão (Listener)'; }
      const listener = get('srt-connection-mode') === 'listener';
      labels('srt-local-ips').hidden = !listener;
      byId('srt-local-ip-note').hidden = !listener;
      byId('srt-connection-use').hidden = true;
      byId('srt-connection-help').hidden = true;
      byId('srt-connection-message').hidden = true;
      hint.textContent = listener ? 'O receptor se conecta a este 3Mix. Informe a porta que ele deve usar.' : 'No receptor, abra SRT em Listener. Aqui informe o IP dele e a mesma porta. Para teste nesta máquina, use 127.0.0.1.';
    } else hint.textContent = srt() ? 'Cole a conexão fornecida pelo receptor. Nada é enviado até clicar em Iniciar.' : 'Cole o servidor e a chave fornecidos pelo YouTube, Facebook ou outra plataforma. Cada destino pode iniciar separadamente.';
    labels('input').hidden = get('mode') !== 'source';
    labels('output-mix').hidden = get('mode') !== 'mix';
    labels('stinger-audio').hidden = get('mode') !== 'mix';
    alpha.hidden = !useSRT; extras.hidden = get('mode') !== 'mix';
    otherAdvanced.hidden = srt();
    const projectTools = [byId('compose'), byId('portrait-only')];
    projectTools.forEach(node => { if (node) node.hidden = true; });
    byId('srt-quick-guide').hidden = !srt();
    byId('destination-context-description').hidden = true;
    const slotDivider = slotNavigation.querySelector('hr'); if (slotDivider) slotDivider.hidden = true;
    qualitySummary.textContent = 'Formato: ' + get('resolution') + ' · ' + Number(get('bitrate')).toLocaleString('pt-BR') + ' kbps · ' + (byId('codec').selectedOptions[0]?.textContent || 'codec não disponível') + '. Ajuste somente se o destino exigir.';
    summary.replaceChildren();
    entry('Destino', get('name') || 'Sem nome'); entry('Conexão', safeDestination());
    entry('Vídeo', get('mode') === 'source' ? byId('input').selectedOptions[0]?.textContent || 'Sem entrada' : byId('mode').selectedOptions[0]?.textContent || 'Sem origem');
    entry('Áudio', byId('audio').selectedOptions[0]?.textContent || 'Não disponível');
    entry('Formato', get('resolution') + ' · ' + Number(get('bitrate')).toLocaleString('pt-BR') + ' kbps · ' + (byId('fps').selectedOptions[0]?.textContent || 'FPS não disponível'));
    const alphaMode = get('srt-alpha');
    if (useSRT && alphaMode !== 'none') entry('Transparência', byId('srt-alpha').selectedOptions[0]?.textContent || alphaMode);
    const active = !!d()?.active;
    const blocked = !!operation || transaction;
    for (const button of document.querySelectorAll('[data-format]')) button.disabled = active || blocked;
    for (const field of workflow.querySelectorAll('.operation-step input,.operation-step select')) {
      if (active || blocked) { if (field.dataset.operationDisabled === undefined) field.dataset.operationDisabled = String(field.disabled); field.disabled = true; }
      else if (!active && !blocked && field.dataset.operationDisabled !== undefined) { field.disabled = field.dataset.operationDisabled === 'true'; delete field.dataset.operationDisabled; }
    }
    status.classList.toggle('operation-error', !!actionError);
    status.textContent = actionError || !ready ? actionError || 'Lendo as saídas…' : !selected ? 'Escolha um destino na lista para começar.' : operation ? operation : active ? 'Enviando · pare antes de alterar.' : dirty ? 'Alterações ainda não salvas.' : 'Configuração lida do motor · saída parada.';
    byId('save').textContent = 'Salvar sem iniciar';
    byId('start').textContent = dirty ? 'Salvar e iniciar este destino' : 'Iniciar este destino';
    if (blocked) { for (const id of ['save', 'start', 'stop']) byId(id).disabled = true; next.disabled = back.disabled = true; }
    else { next.disabled = false; byId('save').disabled = !selected || active; byId('start').disabled = !selected || active || !!validate(0) || !!validate(1); byId('stop').disabled = !active; }
    for (const button of document.querySelectorAll('[data-index]')) {
      const value = typeof outputs === 'undefined' ? null : outputs?.destinations?.[Number(button.dataset.index)];
      button.disabled = blocked;
      if (value?.active) button.textContent += button.textContent.includes(' · Enviando') ? '' : ' · Enviando';
    }
    for (const button of document.querySelectorAll('[data-panel]')) button.disabled = blocked;
  }
  relabel('mode', 'O que será enviado'); relabel('audio', 'Som desta saída'); relabel('key', 'Chave de transmissão');
  for (const button of document.querySelectorAll('[data-format]')) button.onclick = () => {
    if (d()?.active || operation || transaction) return;
    dirty = true;
    byId('resolution').value = button.dataset.format === 'vertical' ? '720x1280' : '1280x720';
    byId('fill').value = button.dataset.format === 'vertical' ? 'true' : 'false';
    byId('resolution').dispatchEvent(new Event('change', {bubbles:true}));
    paint();
  };
  // A vacant destination uses Program by default only after an explicit slot click.
  // Existing/active destinations and a previously edited slot retain their values.
  for (const button of document.querySelectorAll('[data-index]')) button.addEventListener('click', () => {
    const selectedIndex = Number(button.dataset.index), saved = outputs?.destinations?.[selectedIndex];
    if (index !== selectedIndex || preparedEmptyDestinations.has(selectedIndex) || saved?.active || saved?.enabled || saved?.server) { paint(); return; }
    preparedEmptyDestinations.add(selectedIndex);
    for (const [id, value] of Object.entries({protocol:srt()?'srt':'auto', mode:'program', resolution:'1280x720', codec:'h264', 'srt-chroma':'420', 'srt-alpha':'none', fill:'false', key:'', server:''})) byId(id).value = value;
    paintEncoderOptions('obs_x264'); dirty = true;
    for (const id of ['protocol','mode','resolution','codec','srt-chroma','srt-alpha','fill','server']) byId(id).dispatchEvent(new Event('change', {bubbles:true}));
    window.FreeMixSRTConnection?.paint(); paint();
  });
  byId('server').addEventListener('change', () => {
    if (srt() || d()?.active) return;
    try {
      const scheme = new URL(get('server')).protocol.replace(':', '');
      if (['rtmp','rtmps'].includes(scheme) && ['rtmp','rtmps','auto'].includes(get('protocol'))) { byId('protocol').value = scheme; byId('protocol').dispatchEvent(new Event('change', {bubbles:true})); }
    } catch { /* Validation explains a malformed URL at the next step. */ }
  });
  for (const id of ['save', 'start']) byId(id).addEventListener('click', event => {
    const error = validate(0) || validate(1);
    if (operation || transaction || error) { event.preventDefault(); event.stopImmediatePropagation(); actionError = error || 'Aguarde a operação em andamento.'; paint(); return; }
    if (srt() && protocolSRT()) byId('srt-connection-use')?.click();
  }, true);
  for (const button of document.querySelectorAll('[data-panel],[data-index]')) button.addEventListener('click', event => {
    if (operation || transaction) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  // Save/start belongs to the selected destination even if an asynchronous update changes index.
  // Keep the complete transaction locked, including the gap between Configure and Start.
  for (const action of ['save','start','stop']) byId(action).onclick = async () => {
    if (transaction || operation) return;
    const targetIndex = index, draft = action === 'stop' ? null : configuration();
    transaction = true; actionError = ''; paint();
    try {
      if (action === 'save' || action === 'start' && dirty) {
        await cmd('outputs_configure', draft); dirty = false;
        if (index === targetIndex) fields();
      }
      if (action !== 'save') await cmd('outputs_' + action, {index:targetIndex});
    } catch (error) { actionError = error.message; }
    finally { transaction = false; paint(); }
  };
  function keepUnavailableSource(uuid) {
    if (!uuid || (FreeMixRemote.getState().inputs || []).some(input => input.key === uuid)) return;
    const input = byId('input');
    if (![...input.options].some(option => option.value === uuid)) {
      const unavailable = new Option('Entrada indisponível · escolha outra', uuid); unavailable.disabled = true; input.add(unavailable);
    }
    input.value = uuid;
  }
  const priorOptions = options; options = function () {
    const before = get('input'), result = priorOptions.apply(this, arguments);
    keepUnavailableSource(before); paint(); return result;
  };
  const priorFields = fields; fields = function () { const result = priorFields.apply(this, arguments); if (!dirty && d()?.mode === 'source') keepUnavailableSource(d()?.sourceUuid); paint(); return result; };
  const priorStatus = paintStatus; paintStatus = function () { const result = priorStatus.apply(this, arguments); paint(); return result; };
  const priorCommand = cmd;
  cmd = async function (action, data = {}) {
    const changes = ['outputs_configure', 'outputs_start', 'outputs_stop', 'outputs_record'].includes(action);
    if (!changes) return priorCommand(action, data);
    if (operation) throw Error('Aguarde a operação em andamento.');
    operation = action === 'outputs_start' ? 'Iniciando este destino…' : action === 'outputs_stop' ? 'Parando este destino…' : 'Salvando a configuração…'; actionError = ''; paint();
    try { return await priorCommand(action, data); }
    catch (error) { actionError = error.message; throw error; }
    finally { operation = null; paint(); }
  };
  for (const button of document.querySelectorAll('[data-panel]')) button.addEventListener('click', paint);
  window.FreeMixOutputOperation = {paint};
  paint();
})();
