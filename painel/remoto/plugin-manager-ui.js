'use strict';
// Configurações → Plugins. Operations are staged by the local API for the next safe restart.
(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tabs = [
    ['installed', 'Instalados'], ['catalog', 'Catálogo'],
    ['install', 'Instalar arquivo'], ['diagnostics', 'Diagnóstico'],
  ];
  const states = {
    active: 'Carregado', disabled: 'Desabilitado', failed: 'Falha', unknown: 'Não confirmado',
    'pending-install': 'Instalação preparada', 'pending-enable': 'Ativação preparada',
    'pending-disable': 'Desativação preparada', 'pending-remove': 'Remoção preparada',
    'pending-update': 'Atualização preparada', 'pending-rollback': 'Rollback preparado',
  };
  const compatibility = {
    verified: 'Verificado nesta versão', incompatible: 'Incompatível',
    'pending-test': 'Teste no motor pendente', unknown: 'Não verificada',
  };
  const resourceNames = {
    inputs: 'Inputs', filters: 'Filtros', transitions: 'Transições', encoders: 'Encoders',
    outputs: 'Saídas', tools: 'Ferramentas', docks: 'Docks', interfaces: 'Interfaces',
  };
  let root = null;
  let selectedTab = 'installed';
  let snapshot = null;
  let selectedFile = null;
  let updateTarget = null;
  let productionActive = false;
  let busy = false;
  let loading = false;
  let lastRead = 0;
  let error = '';
  let message = '';

  function text(value, fallback = 'Não informado') {
    return value === undefined || value === null || value === '' ? fallback : String(value);
  }

  function array(value) { return Array.isArray(value) ? value : []; }

  function isLocked() { return busy || productionActive || !!snapshot?.productionActive; }

  function listText(value) {
    if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? item.name || item.id || item.label || '' : item).filter(Boolean).join(', ');
    return value ? String(value) : '';
  }

  function resources(plugin) {
    const parts = Object.entries(plugin.resources || {}).filter(([, value]) => (Array.isArray(value) && value.length) || (typeof value === 'number' && value > 0))
      .map(([key, value]) => esc(resourceNames[key] || key) + ': ' + esc(typeof value === 'number' ? value : listText(value)));
    return parts.length ? '<p class="pm-resources"><strong>Recursos:</strong> ' + parts.join(' · ') + '</p>' : '';
  }

  function action(id, operation, label, disabled = false, extra = '') {
    return '<button type="button" data-plugin-action="' + esc(operation) + '" data-plugin-target="' + esc(id) + '"' + (disabled ? ' disabled' : '') + extra + '>' + esc(label) + '</button>';
  }

  function pluginCard(plugin) {
    const managed = !!plugin.managed && !plugin.essential && !plugin.protected;
    const state = text(plugin.state, 'unknown');
    const pending = state.startsWith('pending-');
    const locked = isLocked() || !managed || pending;
    const stateTone = /^(active|verified)$/.test(state) ? 'ok' : state === 'failed' ? 'error' : pending ? 'pending' : '';
    const options = listText(plugin.options);
    const deps = listText(plugin.dependencies);
    const signature = plugin.signature && typeof plugin.signature === 'object' ? [plugin.signature.status, plugin.signature.signer].filter(Boolean).join(' · ') : plugin.signature;
    const integrity = [plugin.source ? 'Origem: ' + plugin.source : null, signature ? 'Assinatura: ' + signature : null, plugin.sha256 ? 'SHA-256: ' + plugin.sha256 : null].filter(Boolean).map(esc).join(' · ');
    const meta = [plugin.developer, plugin.license ? 'Licença: ' + plugin.license : null].filter(Boolean).map(esc).join(' · ');
    const id = text(plugin.id, plugin.name);
    const canDisable = state === 'active' || state === 'pending-enable';
    const controls = managed ? action(id, canDisable ? 'disable' : 'enable', canDisable ? 'Desabilitar' : 'Habilitar', locked)
      + action(id, 'update-file', 'Atualizar por ZIP', locked)
      + action(id, 'rollback', 'Rollback', locked || !plugin.backupAvailable)
      + action(id, 'remove', 'Remover', locked) : '';
    return '<article class="pm-plugin" data-plugin-state="' + esc(state) + '">'
      + '<div class="pm-plugin-head"><div><h3>' + esc(text(plugin.name, id)) + '</h3><p class="pm-meta">' + esc(text(plugin.version, 'Versão não informada')) + (meta ? ' · ' + meta : '') + '</p></div>'
      + '<div class="pm-badges"><span class="pm-badge" data-tone="' + stateTone + '">' + esc(states[state] || state) + '</span>'
      + '<span class="pm-badge" data-tone="' + (plugin.compatibility === 'incompatible' ? 'error' : plugin.compatibility === 'verified' ? 'ok' : 'pending') + '">' + esc(compatibility[plugin.compatibility] || text(plugin.compatibility, 'Compatibilidade não verificada')) + '</span>'
      + (plugin.essential ? '<span class="pm-badge">Essencial · protegido</span>' : plugin.protected ? '<span class="pm-badge">Integrado · protegido</span>' : !managed ? '<span class="pm-badge">Fora do diretório gerenciado</span>' : '') + '</div></div>'
      + (plugin.description ? '<p class="pm-description">' + esc(plugin.description) + '</p>' : '')
      + (deps ? '<p class="pm-detail"><strong>Dependências:</strong> ' + esc(deps) + '</p>' : '')
      + (integrity ? '<p class="pm-detail">' + integrity + '</p>' : '')
      + resources(plugin)
      + (options ? '<p class="pm-detail"><strong>Opções:</strong> ' + esc(options) + '</p>' : '')
      + (controls ? '<div class="pm-actions">' + controls + '</div>' : '')
      + '</article>';
  }

  function installed() {
    const plugins = array(snapshot?.plugins);
    return '<div class="settings-card"><div class="card-title-row"><h2>Plugins desta instalação</h2><span class="settings-badge quiet">' + plugins.length + ' módulos</span></div>'
      + '<p class="card-desc keep">Módulos essenciais aparecem protegidos. As ações em plugins de terceiros são preparadas para o próximo reinício seguro do 3Mix.</p>'
      + (plugins.length ? '<div class="pm-plugin-list">' + plugins.map(pluginCard).join('') + '</div>' : '<p class="pm-empty">Nenhum módulo foi informado pelo gerenciador.</p>') + '</div>';
  }

  function catalog() {
    const entries = array(snapshot?.catalog);
    return '<div class="settings-card"><div class="card-title-row"><h2>Catálogo avaliado</h2><span class="settings-badge quiet">' + entries.length + ' avaliados</span></div>'
      + '<p class="card-desc keep">A instalação pelo catálogo exige origem, versão, hash, licença e compatibilidade avaliados para a versão do motor desta instalação.</p>'
      + (entries.length ? '<div class="pm-plugin-list">' + entries.map((item) => '<article class="pm-plugin"><div class="pm-plugin-head"><div><h3>' + esc(text(item.name, item.id)) + '</h3><p class="pm-meta">' + esc(text(item.version, 'Versão não informada')) + ' · ' + esc(text(item.developer)) + '</p></div><span class="pm-badge">' + esc(text(item.license, 'Licença não informada')) + '</span></div>'
        + (item.description ? '<p class="pm-description">' + esc(item.description) + '</p>' : '')
        + '<p class="pm-detail"><strong>Origem:</strong> ' + esc(text(item.sourceUrl || item.origin)) + ' · <strong>SHA-256:</strong> ' + esc(text(item.sha256)) + '</p>'
        + (item.note ? '<p class="pm-detail">' + esc(item.note) + '</p>' : '')
        + '<div class="pm-actions">' + action(item.id, 'install-catalog', item.status === 'included' ? 'Já incluído no 3Mix' : 'Preparar instalação', isLocked() || item.installable !== true) + '</div></article>').join('') + '</div>'
        : '<p class="pm-empty">Nenhum plugin foi aprovado para instalação pelo catálogo nesta versão. Use um ZIP local que passe pela análise do instalador.</p>') + '</div>';
  }

  function install() {
    const target = updateTarget && array(snapshot?.plugins).find((plugin) => String(plugin.id) === String(updateTarget));
    return '<div class="settings-card"><div class="card-title-row"><h2>' + (target ? 'Atualizar ' + esc(target.name) : 'Instalar ZIP de plugin') + '</h2><span class="settings-badge quiet">Windows x64</span></div>'
      + '<p class="card-desc keep">Selecione um pacote ZIP de plugin OBS para Windows x64. O instalador analisa caminhos, DLLs, arquitetura, hash e compatibilidade antes de preparar a instalação. Nenhum EXE é executado.</p>'
      + '<input id="pm-file" type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden>'
      + '<div class="pm-file-picker"><button type="button" data-plugin-action="pick-file"' + (isLocked() ? ' disabled' : '') + '>Selecionar ZIP</button><span>' + esc(selectedFile?.name || 'Nenhum arquivo selecionado') + '</span></div>'
      + (target ? '<p class="pm-detail">Módulo alvo: <strong>' + esc(target.name) + '</strong>. A versão anterior será preservada para rollback.</p>' : '')
      + '<div class="pm-actions"><button type="button" class="settings-primary" data-plugin-action="install-file"' + (!selectedFile || isLocked() ? ' disabled' : '') + '>Analisar e preparar para reinício</button>'
      + (target ? '<button type="button" data-plugin-action="clear-target">Cancelar atualização</button>' : '') + '</div>'
      + '<p class="card-note">A origem e a licença do pacote devem ser conferidas antes do uso em produção. Compatibilidade só é confirmada após teste real no motor.</p></div>';
  }

  function diagnostics() {
    const entries = array(snapshot?.diagnostics);
    const operations = array(snapshot?.operations);
    const last = snapshot?.lastChanged;
    return '<div class="settings-card"><div class="card-title-row"><h2>Diagnóstico do carregamento</h2><button type="button" data-plugin-action="diagnose"' + (busy ? ' disabled' : '') + '>Atualizar diagnóstico</button></div>'
      + '<p class="card-desc keep">Falhas de carregamento, dependências ausentes e incompatibilidades observadas. A consulta não executa DLLs desconhecidas.</p>'
      + (last ? '<p class="pm-detail"><strong>Última alteração:</strong> ' + esc(typeof last === 'object' ? [last.name || last.pluginId || last.id, last.action, last.at || last.date].filter(Boolean).join(' · ') : last) + '</p>' : '')
      + (entries.length ? '<div class="pm-diagnostics">' + entries.map((entry) => '<div class="pm-diagnostic" data-tone="' + esc(entry.severity || '') + '"><strong>' + esc(text(entry.code, entry.severity || 'Diagnóstico')) + '</strong><span>' + esc(text(entry.pluginId, 'Motor')) + ' · ' + esc(text(entry.message)) + '</span></div>').join('') + '</div>' : '<p class="pm-empty">Nenhum diagnóstico foi registrado nesta consulta.</p>') + '</div>'
      + '<div class="settings-card"><div class="card-title-row"><h2>Recuperação</h2><span class="settings-badge quiet">Próximo reinício</span></div>'
      + '<p class="card-desc keep">O modo de segurança impede o carregamento de plugins de terceiros. Projetos e configurações são preservados.</p>'
      + '<div class="pm-actions"><button type="button" data-plugin-action="safe-mode"' + (isLocked() ? ' disabled' : '') + '>' + (snapshot?.safeMode ? 'Desativar modo de segurança' : 'Ativar modo de segurança') + '</button></div>'
      + (operations.length ? '<h3 class="pm-section-title">Operações recentes</h3><div class="pm-operation-list">' + operations.slice(0, 12).map((op) => '<p>' + esc(typeof op === 'object' ? [op.at || op.date, op.action, op.pluginId || op.name, op.result].filter(Boolean).join(' · ') : op) + '</p>').join('') + '</div>' : '') + '</div>';
  }

  function render() {
    if (!root || !root.isConnected) return;
    const lock = productionActive || !!snapshot?.productionActive;
    const engine = snapshot?.engine || {};
    const body = !snapshot ? '<div class="settings-card"><p>' + (loading ? 'Consultando plugins desta instalação…' : esc(error || 'Gerenciador indisponível.')) + '</p></div>'
      : selectedTab === 'catalog' ? catalog() : selectedTab === 'install' ? install() : selectedTab === 'diagnostics' ? diagnostics() : installed();
    root.innerHTML = '<div class="pm-summary"><div><strong>Gerenciador de Plugins</strong><span>libobs ' + esc(text(engine.version, 'versão não informada')) + '</span></div>'
      + '<button type="button" data-plugin-action="refresh"' + (busy || loading ? ' disabled' : '') + '>Atualizar lista</button></div>'
      + (lock ? '<p class="pm-lock" role="status">Produção ativa: instalação, alteração e remoção estão bloqueadas até a produção terminar.</p>' : '')
      + (error ? '<p class="pm-feedback error" role="alert">' + esc(error) + '</p>' : '')
      + (message ? '<p class="pm-feedback" role="status">' + esc(message) + '</p>' : '')
      + '<div class="pm-tabs" role="tablist" aria-label="Gerenciador de Plugins">' + tabs.map(([id, label]) => '<button type="button" role="tab" data-plugin-tab="' + id + '" aria-selected="' + (selectedTab === id) + '" class="' + (selectedTab === id ? 'on' : '') + '">' + label + '</button>').join('') + '</div>'
      + '<div class="pm-tab-panel" role="tabpanel">' + body + '</div>';
  }

  async function request(path, body) {
    const options = { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(body instanceof FormData ? 120000 : 20000) };
    if (body !== undefined) {
      options.headers = { 'X-3Mix-Plugin-Manager': '1' };
      if (body instanceof FormData) options.body = body;
      else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    }
    const response = await fetch(path, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) throw Error(result.error || result.message || 'A operação não foi concluída.');
    return result;
  }

  async function refresh() {
    if (loading || busy) return;
    loading = true; error = ''; render();
    try { snapshot = await request('/api/plugin-manager'); lastRead = Date.now(); }
    catch (e) { error = e.message; }
    finally { loading = false; render(); }
  }

  async function operate(operation, id) {
    if (isLocked() && operation !== 'diagnose') return;
    if (operation === 'remove' && !confirm('Preparar a remoção deste plugin de terceiros no próximo reinício? As configurações e projetos serão preservados.')) return;
    if (operation === 'rollback' && !confirm('Preparar o retorno à versão anterior deste plugin no próximo reinício?')) return;
    if (operation === 'safe-mode' && !confirm(snapshot?.safeMode ? 'Desativar o modo de segurança no próximo reinício?' : 'Ativar o modo de segurança para desabilitar plugins de terceiros no próximo reinício?')) return;
    busy = true; error = ''; message = ''; render();
    try {
      const body = operation === 'safe-mode' ? { enabled: !snapshot?.safeMode } : id ? { id } : {};
      snapshot = await request('/api/plugin-manager/' + operation, body);
      lastRead = Date.now();
      message = operation === 'diagnose' ? 'Diagnóstico atualizado.' : 'Operação preparada. Reinicie o 3Mix fora do ar para aplicar.';
    } catch (e) { error = e.message; }
    finally { busy = false; render(); }
  }

  async function upload() {
    if (!selectedFile || isLocked()) return;
    if (!/\.zip$/i.test(selectedFile.name)) { error = 'Selecione um arquivo ZIP.'; render(); return; }
    const form = new FormData();
    form.append('file', selectedFile, selectedFile.name);
    if (updateTarget) form.append('id', updateTarget);
    busy = true; error = ''; message = ''; render();
    try {
      snapshot = await request('/api/plugin-manager/install', form);
      lastRead = Date.now(); selectedFile = null; updateTarget = null; selectedTab = 'installed';
      message = 'Pacote analisado e instalação preparada para o próximo reinício seguro.';
    } catch (e) { error = e.message; }
    finally { busy = false; render(); }
  }

  function onClick(event) {
    const tab = event.target.closest('[data-plugin-tab]');
    if (tab) { selectedTab = tab.dataset.pluginTab; render(); return; }
    const button = event.target.closest('[data-plugin-action]');
    if (!button || button.disabled) return;
    const operation = button.dataset.pluginAction;
    const id = button.dataset.pluginTarget;
    if (operation === 'refresh') { refresh(); return; }
    if (operation === 'pick-file') { root.querySelector('#pm-file')?.click(); return; }
    if (operation === 'install-file') { upload(); return; }
    if (operation === 'clear-target') { updateTarget = null; selectedFile = null; render(); return; }
    if (operation === 'update-file') {
      updateTarget = id; selectedFile = null; selectedTab = 'install'; render(); root.querySelector('#pm-file')?.click(); return;
    }
    if (['enable', 'disable', 'remove', 'rollback', 'install-catalog', 'diagnose', 'safe-mode'].includes(operation)) operate(operation, id);
  }

  function mount(element, options = {}) {
    if (!element) return;
    const changed = productionActive !== !!options.productionActive;
    productionActive = !!options.productionActive;
    if (root !== element) {
      root = element;
      root.addEventListener('click', onClick);
      root.addEventListener('change', (event) => {
        if (event.target.id === 'pm-file') {
          selectedFile = event.target.files?.[0] || null;
          error = ''; selectedTab = 'install'; render();
        }
      });
      render();
      if (Date.now() - lastRead > 5000) refresh();
    } else if (changed) render();
  }

  window.FreeMixPluginManager = { mount, refresh };
})();
