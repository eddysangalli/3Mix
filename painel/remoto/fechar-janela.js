// Closes the window this page is shown in. Inside the program a page cannot close its own window, so it asks the
// engine to, by the address the window was opened with (remembered for pages opened later in the same window).
// In a browser tab opened by the mesa, or inside a frame, the usual ways still apply.
(() => {
  let first = location.href;
  try { first = sessionStorage.getItem('freemix.panel.url') || first; sessionStorage.setItem('freemix.panel.url', first); } catch { /* storage may be off */ }
  window.FreeMixSetPanelTitle = async (title) => {
    document.title = String(title).slice(0, 100) + ' · 3Mix';
    try {
      await fetch('/api/panel-title', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: first, title: String(title).slice(0, 100) }),
        signal: AbortSignal.timeout(4000)
      });
    } catch { /* browser tab: the document title is enough */ }
  };
  window.FreeMixClosePanel = async () => {
    if (parent !== window) { parent.postMessage({ freemixCloseSettings: true }, location.origin); return; }
    // The engine refuses for a moment while another window is still being closed: ask again a few times.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch('/api/panel-close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: first }), signal: AbortSignal.timeout(4000) });
        if ((await r.json()).success === true) return;
      } catch { break; }   // not inside the program, or the engine is away: fall back to the browser
      await new Promise((done) => setTimeout(done, 400));
    }
    window.close();
  };
})();
