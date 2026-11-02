// Guarda os erros das telas no log da instalação, para irem no pacote de diagnóstico. Só escuta: não altera a página.
(() => {
  'use strict';
  if (window.__3mixRegistroErros) return;
  window.__3mixRegistroErros = true;
  const LIMITE = 30;
  const vistos = new Set();
  let enviados = 0;
  let base = location.origin;
  if (location.protocol === 'file:') {
    try { base = new URL(window.MESA_LOCAL?.replayUrl || 'http://127.0.0.1:8088').origin; } catch { base = 'http://127.0.0.1:8088'; }
  }
  const envio = window.fetch.bind(window);

  function enviar(dados) {
    const chave = [dados.tipo, dados.mensagem, dados.origem, dados.linha].join('|');
    if (vistos.has(chave) || enviados >= LIMITE) return;
    vistos.add(chave);
    enviados++;
    try {
      envio(base + '/api/panel-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dados, pagina: location.pathname + location.search.slice(0, 80), navegador: navigator.userAgent }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* o registro nunca pode virar outro erro */ }
  }

  addEventListener('error', (e) => {
    const alvo = e.target;
    if (alvo && alvo !== window) {
      if (alvo.tagName === 'SCRIPT' || alvo.tagName === 'LINK') enviar({ tipo: 'recurso', mensagem: 'Arquivo não carregou: ' + alvo.tagName, origem: alvo.src || alvo.href || '' });
      return;
    }
    enviar({ tipo: 'erro', mensagem: e.message || 'Erro', origem: e.filename || '', linha: e.lineno, coluna: e.colno, pilha: e.error?.stack || '' });
  }, true);

  addEventListener('unhandledrejection', (e) => {
    const motivo = e.reason;
    if (motivo?.name === 'AbortError' || motivo?.name === 'TimeoutError') return;
    enviar({ tipo: 'promessa', mensagem: motivo?.message || String(motivo), pilha: motivo?.stack || '' });
  });

  const consoleErro = console.error.bind(console);
  console.error = (...partes) => {
    consoleErro(...partes);
    enviar({ tipo: 'console', mensagem: partes.map((p) => (p instanceof Error ? p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ').slice(0, 1000), pilha: partes.find((p) => p instanceof Error)?.stack || '' });
  };
})();
