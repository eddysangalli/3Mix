// Same settings controller, presented in the approved 3Mix settings shell.
// The shell is built here so /configuracoes and the legacy /settings URL share one single page.
(() => {
  document.body.dataset.page = 'settings';
  document.body.innerHTML = `<header class="settings-topbar">
    <div class="brand-title"><strong>3Mix</strong><span>/</span><span id="window-title">Configurações</span></div>
    <span id="settings-project" class="project-sel-box">Conectando à produção…</span>
    <div class="search-settings">
      <span aria-hidden="true">🔍</span>
      <input id="settings-search" type="search" placeholder="Buscar campo, valor ou categoria…" aria-label="Buscar configuração" autocomplete="off" spellcheck="false">
      <div id="settings-search-results" class="settings-search-results" role="listbox" aria-label="Resultados da busca" hidden></div>
    </div>
    <span id="connection" role="status"></span>
    <button id="preview-toggle" type="button" class="settings-ghost" aria-pressed="true" title="Mostrar ou recolher a prévia da produção">Prévia</button>
    <button id="native-open" type="button" class="settings-ghost" title="Opções avançadas do motor desta instalação">Avançado</button>
    <button id="settings-close" type="button" class="settings-ghost">← Mesa</button>
  </header>
  <main class="settings-layout" id="settings-layout">
    <aside class="settings-nav" id="categories" aria-label="Categorias"></aside>
    <section class="settings-content">
      <header class="content-header"><h1 id="title">Carregando…</h1><p id="description"></p></header>
      <fieldset id="settings-form"><div id="content"></div></fieldset>
    </section>
    <aside class="settings-preview-col" id="settings-preview-col" aria-label="Prévia da produção">
      <div class="preview-head"><strong>Produção atual</strong><span id="settings-preview-format">—</span></div>
      <div class="settings-real-preview"><img id="settings-preview-image" alt="Imagem real do Programa" hidden><span id="settings-preview-empty">Consultando o motor…</span><i class="settings-safe-action"></i><i class="settings-safe-title"></i></div>
      <div class="summary-cards-row">
        <div class="sum-card"><span>Quadro da produção</span><strong id="settings-current-production">—</strong></div>
        <div class="sum-card"><span>Saída principal</span><strong id="settings-current-output">—</strong></div>
      </div>
      <div class="info-note-card" id="settings-context-note">Os valores exibidos são lidos desta instalação. Alterar campos não modifica o motor: use Aplicar para confirmar.</div>
      <p id="transfer-note"></p>
    </aside>
  </main>
  <footer class="settings-footer">
    <div class="settings-transfer">
      <label class="settings-scope" title="Escopo do arquivo de configurações">Escopo
        <select id="transfer-scope">
          <option value="view">Categoria aberta</option>
          <option value="drafts">Somente o que está em rascunho</option>
          <option value="all">Todas as categorias</option>
        </select>
      </label>
      <button id="import" type="button">Importar</button>
      <button id="export" type="button">Exportar</button>
      <button id="defaults" type="button">Restaurar padrões</button>
      <input id="import-file" type="file" accept="application/json,.json" hidden>
    </div>
    <div class="settings-footer-state">
      <span id="settings-dirty" hidden>● Alterações não aplicadas</span>
      <span id="message" role="status">Consultando configurações…</span>
    </div>
    <div class="footer-actions-right">
      <button id="cancel" type="button">Cancelar</button>
      <button id="apply" type="button" disabled>Aplicar</button>
      <button id="ok" type="button" disabled>Aplicar e fechar</button>
    </div>
  </footer>`;
  document.body.classList.add('settings-operational-ready');
})();
