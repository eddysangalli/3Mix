// Mesa de corte: imagem real no Preview e no Programa, miniaturas nas entradas, T-Bar e DUMP com confirmação.
(() => {
  'use strict';
  const estado = () => { const s = window.FreeMixRemote?.getState?.() || {}, me = window.ThreeMixCorteME?.nomes(); return me ? { ...s, ...me } : s; };
  const E = (id) => document.getElementById(id);
  const INTERVALO_MS = 350;
  let thumbs = {};
  let vez = 0, ocupado = false, soMiniaturas = false, erros = 0;

  function mostrar(monitor, src) {
    const tela = document.querySelector(`[data-monitor="${monitor}"]`), img = tela.querySelector('img');
    if (src) { if (img.getAttribute('src') !== src) img.src = src; img.hidden = false; tela.classList.add('com-imagem'); }
    else { img.hidden = true; img.removeAttribute('src'); tela.classList.remove('com-imagem'); }
  }

  // Ao trocar o que está no monitor, a miniatura aparece na hora e o quadro maior vem em seguida.
  const noMonitor = { preview: null, program: null };
  function atualizarMonitores() {
    const s = estado();
    for (const monitor of ['preview', 'program']) {
      const nome = s[monitor] || '';
      if (noMonitor[monitor] !== nome) { noMonitor[monitor] = nome; mostrar(monitor, thumbs[nome] || null); }
      else if (soMiniaturas && thumbs[nome]) mostrar(monitor, thumbs[nome]);
    }
    const v = s.video;
    if (v?.baseWidth > 0 && v?.baseHeight > 0) document.documentElement.style.setProperty('--formato', v.baseWidth + ' / ' + v.baseHeight);
  }

  function quadroGrande() {
    if (document.hidden || ocupado || soMiniaturas) return;
    const s = estado();
    if (s.connected !== true) return;
    const monitor = vez++ % 2 ? 'preview' : 'program', nome = s[monitor];
    const chave = (s.inputs || []).find((i) => i.name === nome)?.key;
    if (!chave) return;
    ocupado = true;
    const quadro = new Image();
    quadro.onload = () => {
      ocupado = false; erros = 0;
      if (estado()[monitor] === nome) mostrar(monitor, quadro.src);
    };
    quadro.onerror = () => {
      ocupado = false;
      // Fora deste computador o quadro grande não é servido: fica com as miniaturas.
      if (++erros >= 4) soMiniaturas = true;
    };
    quadro.src = '/api/ptz/preview?input=' + encodeURIComponent(chave) + '&t=' + Date.now();
  }

  function pintarEntradas() {
    for (const b of E('inputs').querySelectorAll('button[data-preview]')) {
      if (!b.firstElementChild) { const r = document.createElement('span'); r.textContent = b.textContent; b.textContent = ''; b.append(r); }
      const url = thumbs[b.dataset.preview];
      if (url) b.style.setProperty('--thumb', `url("${url}")`);
    }
  }
  new MutationObserver(pintarEntradas).observe(E('inputs'), { childList: true });

  async function lerMiniaturas() {
    if (document.hidden) return;
    try {
      const r = await fetch('/api/thumbs', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (r.ok) { thumbs = (await r.json()).thumbs || {}; pintarEntradas(); atualizarMonitores(); }
    } catch { /* tenta de novo no próximo ciclo */ }
  }

  E('tbar').addEventListener('input', (e) => { E('tbar-val').textContent = e.target.value + '%'; });

  // Botão FTB na mesa remota
  const ftbBtn = document.querySelector('.ftb-btn');
  if (ftbBtn) {
    ftbBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const isFtb = ftbBtn.classList.toggle('on');
      const msg = E('message');
      if (msg) msg.textContent = isFtb ? 'Fade to Black (FTB) ATIVO no ar.' : 'Fade to Black (FTB) Desativado.';
    }, true);
  }

  // DUMP descarta conteúdo: pede um segundo clique em até 3 segundos.
  const dump = E('btn-dump');
  let armado = null;
  dump.addEventListener('click', async () => {
    if (!armado) {
      dump.classList.add('armado');
      dump.textContent = 'Confirmar DUMP';
      armado = setTimeout(() => { armado = null; dump.classList.remove('armado'); dump.textContent = 'DUMP'; }, 3000);
      return;
    }
    clearTimeout(armado); armado = null;
    dump.classList.remove('armado');
    dump.textContent = 'DUMP';
    try {
      const r = await fetch('/api/delay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dump', note: 'DUMP acionado pela mesa de corte' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false || !d.result?.dumped) throw Error(d.error || 'O DUMP não foi executado');
      E('message').textContent = 'DUMP executado: o trecho retido foi descartado.';
    } catch (erro) { E('message').textContent = erro.message; }
    lerAtraso();
  });

  // O botão só fica disponível quando há atraso de verdade na transmissão no ar.
  async function lerAtraso() {
    try {
      const s = await (await fetch('/api/delay', { cache: 'no-store', signal: AbortSignal.timeout(2500) })).json();
      dump.disabled = !s.canDump;
      dump.classList.toggle('pronto', !!s.canDump);
      dump.title = s.canDump
        ? 'Descarta o trecho que ainda não foi ao ar. Clique duas vezes para confirmar.' + (s.uncoveredOutputs?.length ? ' Sem proteção: ' + s.uncoveredOutputs.join(', ') + '.' : '')
        : s.state === 'streaming_without_delay' ? 'Esta transmissão começou sem atraso.'
          : s.state === 'ready' ? 'Disponível quando a transmissão começar.'
            : 'Atraso desligado. Configure em Configurações › Transmissão › Atraso e DUMP.';
    } catch { dump.disabled = true; dump.title = 'Sem resposta do motor.'; }
  }
  lerAtraso();
  setInterval(lerAtraso, 1000);

  setInterval(atualizarMonitores, 250);
  setInterval(quadroGrande, INTERVALO_MS);
  setInterval(lerMiniaturas, 2000);
  lerMiniaturas();
})();
