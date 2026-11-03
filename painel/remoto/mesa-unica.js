// A única mesa operacional é a janela nativa aberta pelo INICIAR-3MIX.cmd.
// As antigas telas de demonstração ficam preservadas no código, fora da operação.
//
// A interface "estudio/" (Fase 1/2 do plano de beta antigo) foi removida a
// pedido do dono em 03/11/2026 — não existe mais no painel. Qualquer acesso
// cai direto na mesa real abaixo, sem exceção de ?dock=1.
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
