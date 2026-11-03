// 3Mix · Pre-Flight — confere a produção e o computador antes de entrar no ar.
// Dados: /api/preflight (preflight-producao.mjs). Só roda quando pedido; sem polling.
(() => {
  const E = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const NIVEL = {
    BLOQUEIO: { status: 'FAIL', icone: '✖', ordem: 0 },
    'ATENÇÃO': { status: 'WARN', icone: '⚠', ordem: 1 },
    'NÃO VERIFICADO': { status: 'NOT_VERIFIED', icone: '?', ordem: 2 },
    APROVADO: { status: 'PASS', icone: '✔', ordem: 3 }
  };
  const VEREDITO = {
    BLOQUEIO: { rotulo: 'BLOQUEIO', tone: 'crit' },
    'ATENÇÃO': { rotulo: 'PRONTO COM ATENÇÃO', tone: 'warn' },
    APROVADO: { rotulo: 'PRONTO PARA ENTRAR NO AR', tone: 'ok' }
  };

  let analise = null, ocupado = false, armado = null;
  const hora = (ts) => new Date(Number(ts) || Date.now()).toLocaleTimeString('pt-BR');
  const alvo = () => E('pf-alvo')?.value || 'ambos';

  async function pedir(acao, dados = {}) {
    const res = await fetch('/api/preflight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: acao, ...dados }), signal: AbortSignal.timeout(40000) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) throw new Error(d.error || 'HTTP ' + res.status);
    return d.result;
  }
  const aviso = (texto, erro) => { const m = E('pf-message'); m.textContent = texto || ''; m.dataset.tone = erro ? 'crit' : ''; };

  function desenhar(dados) {
    analise = dados;
    const itens = Array.isArray(dados.itens) ? dados.itens : [];
    const v = VEREDITO[dados.veredito] || { rotulo: 'AGUARDANDO ANÁLISE', tone: 'idle' };
    E('verdict-banner').dataset.tone = v.tone;
    E('verdict-icon').textContent = { ok: '✔', warn: '⚠', crit: '✖' }[v.tone] || '●';
    E('verdict-label').textContent = v.rotulo;
    const c = dados.contagem || {};
    E('verdict-counts').textContent = [c.bloqueios ? c.bloqueios + ' bloqueio(s)' : '', c.atencoes ? c.atencoes + ' atenção' : '', c.naoVerificados ? c.naoVerificados + ' não verificado(s)' : '', (c.aprovados ?? 0) + ' aprovado(s)'].filter(Boolean).join(' · ');
    E('verdict-summary').textContent = (dados.modo === 'leve' ? 'No ar: verificação leve, sem testes que mexam no disco. ' : '') + (dados.mudancas?.length ? 'Mudou desde a última: ' + dados.mudancas.map((m) => `${m.nome} (${m.de} → ${m.para})`).join(', ') : '');
    const quando = hora(dados.timestamp);
    E('last-run').textContent = quando; E('foot-run').textContent = quando; E('foot-verdict').textContent = v.rotulo;
    E('pf-bypass').hidden = !c.bloqueios;

    const grupos = new Map();
    for (const it of itens.slice().sort((a, b) => (NIVEL[a.nivel]?.ordem ?? 9) - (NIVEL[b.nivel]?.ordem ?? 9))) {
      const g = (dados.checks || []).find((x) => x.id === it.id)?.category || 'Outros';
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(it);
    }
    E('checks-list').innerHTML = itens.length
      ? [...grupos.entries()].map(([nome, lista]) => `<p class="pf-group-label">${esc(nome)}</p>` + lista.map(cartao).join('')).join('')
      : '<p class="pf-empty">Nenhuma verificação disponível.</p>';
    E('issues-section').hidden = true;
  }

  function cartao(it) {
    const n = NIVEL[it.nivel] || { status: '', icone: '●' };
    const alvoTexto = it.alvo && it.alvo !== 'geral' ? ` · só ${it.alvo}` : '';
    const processos = (it.processos || []).map((p) => `
      <div class="pf-proc" data-nome="${esc(p.nome)}">
        <span class="pf-proc-name">${esc(p.nome)} <small>${esc(p.tipo)}</small></span>
        <span class="pf-proc-use">${esc(p.motivos.join(' · '))}</span>
        <button type="button" class="pf-btn pf-mini" data-acao="detalhe">Ver detalhes</button>
        <button type="button" class="pf-btn pf-mini" data-acao="ignorar">Ignorar</button>
        <button type="button" class="pf-btn pf-mini" data-acao="fechar">Pedir fechamento</button>
        <p class="pf-proc-detail" hidden>PID ${esc(p.pids.join(', '))} · CPU ${esc(p.cpu)}% · GPU ${esc(p.gpu)}% · ${esc((p.ramMb / 1024).toFixed(1))} GB${p.caminho ? ' · ' + esc(p.caminho) : ''}</p>
      </div>`).join('');
    return `
      <div class="pf-check" data-status="${n.status}" data-id="${esc(it.id)}">
        <span class="pf-check-icon" aria-hidden="true">${n.icone}</span>
        <div class="pf-check-body">
          <div class="pf-check-line">
            <span class="pf-check-name">${esc(it.nome)}</span>
            <span class="pf-check-status">${esc(it.nivel)}${esc(alvoTexto)}</span>
            <button type="button" class="pf-btn pf-mini pf-recheck" data-acao="reverificar" title="Reverificar só este item">↻</button>
          </div>
          <div class="pf-check-value">${esc(it.valor)}</div>
          ${it.motivo ? `<p class="pf-check-detail">${esc(it.motivo)}</p>` : ''}
          ${it.acao && it.nivel !== 'APROVADO' ? `<p class="pf-check-detail pf-acao">${esc(it.acao)}</p>` : ''}
          ${processos}
        </div>
      </div>`;
  }

  function conexao(ok) {
    E('status-led').dataset.tone = ok ? 'ok' : 'off';
    E('connection').classList.toggle('offline', !ok);
    E('connection').textContent = ok ? 'API 3Mix conectada' : 'Sem conexão com a API 3Mix';
  }

  async function analisar(item) {
    if (ocupado) return;
    ocupado = true;
    E('btn-run').disabled = true;
    E('btn-run').setAttribute('aria-busy', 'true');
    aviso(item ? 'Reverificando…' : 'Analisando…');
    try {
      const q = new URLSearchParams({ alvo: alvo() });
      if (item) q.set('item', item);
      const res = await fetch('/api/preflight?' + q, { signal: AbortSignal.timeout(40000) });
      const dados = await res.json();
      if (!res.ok || dados.success === false) throw new Error(dados.error || 'HTTP ' + res.status);
      conexao(true);
      desenhar(dados.preflight || dados);
      aviso('');
    } catch (erro) {
      conexao(false);
      E('verdict-banner').dataset.tone = 'crit';
      E('verdict-icon').textContent = '✖';
      E('verdict-label').textContent = 'ANÁLISE INDISPONÍVEL';
      E('verdict-counts').textContent = 'Não foi possível consultar o Pre-Flight.';
      aviso(String(erro?.message || erro), true);
    } finally {
      ocupado = false;
      E('btn-run').disabled = false;
      E('btn-run').removeAttribute('aria-busy');
    }
  }

  E('checks-list').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-acao]');
    if (!b) return;
    const card = b.closest('.pf-check'), proc = b.closest('.pf-proc');
    try {
      if (b.dataset.acao === 'reverificar') return analisar(card.dataset.id);
      if (b.dataset.acao === 'detalhe') { const d = proc.querySelector('.pf-proc-detail'); d.hidden = !d.hidden; return; }
      if (b.dataset.acao === 'ignorar') { await pedir('preflight_process_ignore', { nome: proc.dataset.nome }); aviso(proc.dataset.nome + ' não será mais apontado.'); return analisar('processos'); }
      if (b.dataset.acao === 'fechar') {
        // Dois cliques, como o DUMP: o primeiro só arma.
        if (armado !== b) { clearTimeout(b._t); armado = b; b.textContent = 'Confirmar'; b.classList.add('pf-armado'); b._t = setTimeout(() => { armado = null; b.textContent = 'Pedir fechamento'; b.classList.remove('pf-armado'); }, 3000); return; }
        armado = null; b.disabled = true; b.textContent = 'Pedindo…';
        const pids = (analise.itens.find((x) => x.id === 'processos')?.processos || []).find((p) => p.nome === proc.dataset.nome)?.pids;
        const r = await pedir('preflight_process_close', { nome: proc.dataset.nome, pids, confirmar: true });
        aviso(r.mensagem);
        return analisar('processos');
      }
    } catch (erro) { aviso(erro.message, true); }
  });

  E('pf-bypass-go').addEventListener('click', async () => {
    try {
      const r = await pedir('preflight_bypass', { motivo: E('pf-bypass-motivo').value });
      aviso('Liberação registrada: ' + r.bloqueios.length + ' bloqueio(s), motivo guardado no histórico.');
      E('pf-bypass-motivo').value = '';
    } catch (erro) { aviso(erro.message, true); }
  });

  async function lerProjeto() {
    try {
      const data = await (await fetch('/api/json', { signal: AbortSignal.timeout(6000) })).json();
      if (data?.preset) E('project-name').textContent = String(data.preset);
    } catch { /* chip fica "—" */ }
  }

  E('btn-run').addEventListener('click', () => analisar());
  E('pf-alvo').addEventListener('change', () => analisar());
  analisar();
  lerProjeto();
})();
