// A única mesa operacional é a janela nativa aberta pelo INICIAR-3MIX.cmd.
// As antigas telas de demonstração ficam preservadas no código, fora da operação.
//
// Exceção explícita: ?dock=1 é o caminho oficial da nova interface (Fase 1
// do plano de beta) quando carregada como browser dock dentro do motor via
// estudio-dock.html — essa página-ponte já resolve a porta real da API
// antes de chegar aqui. Sem esta exceção, o próprio estudio/index.html se
// redirecionava para a mesa antiga antes de qualquer comando novo rodar,
// mesmo quando aberto pelo caminho pensado para ele.
(() => {
  if (new URLSearchParams(location.search).get('dock') === '1') return;
  document.documentElement.style.visibility = 'hidden';
  try {
    if (!sessionStorage.getItem('freemix.panel.url')) sessionStorage.setItem('freemix.panel.url', location.href);
  } catch {}
  const target = location.protocol === 'file:'
    ? new URL('mesa-principal.html', document.currentScript.src).href
    : new URL('/mesa-principal.html', location.origin).href;
  location.replace(target + '?returnToDesk=1');
})();
