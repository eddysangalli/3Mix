/* One navigation bar for every 3Mix operational module.
   Modules open as independent native windows, never replace each other. */
(() => {
  const MODULES = [
    ['audio', 'Áudio', '/audio'],
    ['replay', 'Replay', '/replay'],
    ['color', 'Color', '/color']
  ];
  const panelUrl = () => {
    try { return sessionStorage.getItem('freemix.panel.url') || location.href; } catch { return location.href; }
  };
  async function setTitle(title) {
    document.title = title + ' · 3Mix';
    try {
      await fetch('/api/panel-title', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: panelUrl(), title }), signal: AbortSignal.timeout(4000)
      });
    } catch { /* browser tab: the document title is enough */ }
  }
  async function open(route) {
    if (location.protocol === 'http:') {
      // The engine may be finishing another window's CEF teardown for a moment.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const r = await fetch('/api/panel-open', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ route }), signal: AbortSignal.timeout(8000)
          });
          const value = await r.json();
          if (value.success === true) return true;
        } catch { break; }
        await new Promise(done => setTimeout(done, 350));
      }
    }
    const win = window.open(route, '3Mix_' + route.replace(/[^a-z0-9]/gi, ''), 'width=1360,height=860,resizable=yes,scrollbars=yes');
    if (win) { win.focus(); return true; }
    return false;
  }
  function nav(active, projectId = 'workspace-project') {
    return `<div class="workspace-head"><strong class="workspace-brand">3Mix</strong>`
      + `<nav class="workspace-tabs" aria-label="Módulos do 3Mix">`
      + `<button type="button" class="ws-tab workspace-home" title="Fechar este módulo e voltar à mesa">← Mesa</button>`
      + MODULES.map(([id, label, route]) => `<button type="button" class="ws-tab${id === active ? ' active' : ''}" data-module="${id}" data-route="${route}"${id === active ? ' aria-current="page"' : ''}>${label}</button>`).join('')
      + `</nav><span class="project-pill" id="${projectId}" title="Projeto em uso">…</span></div>`;
  }
  function bind(root, active) {
    root.querySelector('.workspace-home')?.addEventListener('click', () => {
      if (window.FreeMixClosePanel) window.FreeMixClosePanel(); else window.close();
    });
    for (const button of root.querySelectorAll('[data-module]')) {
      button.addEventListener('click', () => { if (button.dataset.module !== active) open(button.dataset.route); });
    }
    const project = root.querySelector('.project-pill');
    if (project) {
      const update = async () => {
        if (document.hidden) return;
        try {
          const response = await fetch('/api/json', { signal: AbortSignal.timeout(4000) });
          const state = await response.json();
          if (response.ok && state.connected) project.textContent = state.preset || 'Produção atual';
        } catch { /* keep the last confirmed project */ }
      };
      update(); setInterval(update, 8000);
    }
    setTitle(active === 'audio' ? 'Áudio' : active === 'replay' ? 'Replay' : active === 'color' ? 'Color Studio' : '3Mix');
  }
  window.FreeMixWorkspaceNav = { open, nav, bind, setTitle };
})();
