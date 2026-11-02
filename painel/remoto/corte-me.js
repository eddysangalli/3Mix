// Mesa de corte em janela: escolhe qual M/E os botões controlam. Sempre abre no MAIN; a escolha não fica salva.
// O M/E só responde neste computador; em outro aparelho o seletor não aparece e a página segue no MAIN.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  const estado = () => window.FreeMixRemote?.getState?.() || {};
  let alvo = 1, mixes = [];
  const mixAtual = () => mixes.find((m) => m.mixId === alvo);
  const nomeDe = (uuid) => estado().inputs?.find((i) => i.key === uuid)?.name || '';

  window.ThreeMixCorteME = {
    nomes() {
      if (alvo === 1) return null;
      const m = mixAtual();
      return { preview: nomeDe(m?.previewUuid), program: nomeDe(m?.programUuid) };
    },
  };

  async function ler() {
    const r = await fetch('/api/mix-effects', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    if (!r.ok || !d.success) throw Error(d.error || 'M/E indisponível');
    mixes = d.mixes || [];
  }

  function pintar() {
    if (alvo === 1) return;
    const n = window.ThreeMixCorteME.nomes();
    if (E('preview').textContent !== (n.preview || '—')) E('preview').textContent = n.preview || '—';
    if (E('program').textContent !== (n.program || '—')) E('program').textContent = n.program || '—';
    for (const b of E('inputs').querySelectorAll('button[data-preview]')) {
      const noPgm = b.dataset.preview === n.program, noPv = b.dataset.preview === n.preview && !noPgm;
      if (b.classList.contains('program') !== noPgm) b.classList.toggle('program', noPgm);
      if (b.classList.contains('preview') !== noPv) b.classList.toggle('preview', noPv);
    }
  }

  async function operar(command, extra = {}) {
    const operationId = 'corte_' + crypto.randomUUID();
    const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'outputs_mix', operationId, expectedScope: estado().preset, mixId: alvo, command, ...extra }), signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) throw Error(d.error || 'O motor não confirmou');
    await ler();
    pintar();
  }

  // Com um M/E escolhido, o clique não pode chegar ao caminho do MAIN.
  document.addEventListener('click', (e) => {
    if (alvo === 1) return;
    const entrada = e.target.closest('#inputs button[data-preview]'), acao = e.target.closest('[data-action="cut"],[data-action="fade"]');
    if (!entrada && !acao) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const comando = entrada
      ? operar('preview', { input: estado().inputs?.find((i) => i.name === entrada.dataset.preview)?.key })
      : acao.dataset.action === 'cut' ? operar('cut') : operar('take', { duration: Number(E('duration').value) || 500 });
    E('message').textContent = '';
    comando.catch((erro) => { E('message').textContent = erro.message; });
  }, true);

  async function iniciar() {
    try { await ler(); } catch { return; }
    E('me-alvo-caixa').hidden = false;
    E('me-alvo-caixa').style.display = 'inline-flex';
    E('me-alvo').addEventListener('change', async (e) => {
      alvo = Number(e.target.value);
      E('tbar').disabled = alvo !== 1;
      document.body.classList.toggle('corte-em-me', alvo !== 1);
      if (alvo !== 1) { await ler().catch(() => {}); pintar(); }
    });
    setInterval(() => { if (alvo !== 1) ler().catch(() => {}); }, 1000);
    const observador = new MutationObserver(pintar);
    for (const id of ['preview', 'program', 'inputs']) observador.observe(E(id), { childList: true, characterData: true, subtree: true, attributes: id === 'inputs', attributeFilter: id === 'inputs' ? ['class'] : undefined });
    setInterval(pintar, 250);
  }
  iniciar();
})();
