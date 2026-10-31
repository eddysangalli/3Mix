// A única mesa operacional é a janela nativa aberta pelo INICIAR-3MIX.cmd.
// As antigas telas de demonstração ficam preservadas no código, fora da operação.
(() => {
  document.documentElement.style.visibility = 'hidden';
  try {
    if (!sessionStorage.getItem('freemix.panel.url')) sessionStorage.setItem('freemix.panel.url', location.href);
  } catch {}
  const target = location.protocol === 'file:'
    ? new URL('mesa-principal.html', document.currentScript.src).href
    : new URL('/mesa-principal.html', location.origin).href;
  location.replace(target + '?returnToDesk=1');
})();
