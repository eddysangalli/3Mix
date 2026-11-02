// Color Studio: a aba Qualidade age na entrada escolhida no alto. ?input=CHAVE e #qualidade abrem direto, vindo do menu da entrada.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  const seletor = E('color-input'), alvo = E('quality-input');
  if (!seletor || !alvo) return;

  function sincronizar() {
    const key = seletor.value;
    if (!key || alvo.value === key || ![...alvo.options].some((o) => o.value === key)) return;
    alvo.value = key;
    alvo.dispatchEvent(new Event('change'));
  }
  seletor.addEventListener('change', sincronizar);
  new MutationObserver(sincronizar).observe(alvo, { childList: true });

  const pedido = new URLSearchParams(location.search).get('input');
  if (pedido) {
    let tentativas = 0;
    const escolher = setInterval(() => {
      if ([...seletor.options].some((o) => o.value === pedido)) {
        clearInterval(escolher);
        seletor.value = pedido;
        seletor.dispatchEvent(new Event('change'));
      } else if (++tentativas > 40) clearInterval(escolher);
    }, 250);
  }
  if (location.hash === '#qualidade') document.querySelector('.color-control-tabs [data-pane="quality"]')?.click();
})();
