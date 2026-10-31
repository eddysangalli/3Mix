// 3Mix · Pre-Flight — janela de checklist de segurança.
// Dados: /api/preflight (motor real preflight-engine, via servidor-api.mjs).
// "Rodar novamente" refaz a análise sob demanda; sem polling agressivo.
(() => {
  const E = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ESTADO = {
    PASS: { icone: '✔', palavra: 'OK', ordem: 2 },
    WARN: { icone: '⚠', palavra: 'ATENÇÃO', ordem: 1 },
    FAIL: { icone: '✖', palavra: 'FALHA', ordem: 0 }
  };
  const VEREDITO = {
    READY: { rotulo: 'PRONTO PARA TRANSMITIR', tone: 'ok' },
    WARN: { rotulo: 'ATENÇÃO', tone: 'warn' },
    FAIL: { rotulo: 'CRÍTICO', tone: 'crit' },
    NOT_RUN: { rotulo: 'AGUARDANDO ANÁLISE', tone: 'idle' }
  };
  // Junção check × issue: os códigos são os do motor (preflight-producao.mjs).
  const CODIGO_CHECK = {
    PROGRAM_EMPTY: 'Program Input',
    FTB_ENGAGED: 'Fade to Black',
    AUDIO_MASTER_MUTED: 'Áudio Master',
    INPUT_SIGNAL_LOST: 'Entradas de Vídeo / Sinais',
    DISK_SPACE_CRITICAL: 'Espaço em Disco',
    DISK_SPACE_LOW: 'Espaço em Disco',
    PLAYOUT_PRELOAD_ERROR: 'Playout Dual-Player'
  };

  let analise = null;
  let ocupado = false;

  const hora = (ts) => {
    const d = new Date(Number(ts) || Date.now());
    return d.toLocaleTimeString('pt-BR');
  };

  const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

  function desenhar(dados) {
    analise = dados;
    const checks = Array.isArray(dados.checks) ? dados.checks : [];
    const issues = Array.isArray(dados.issues) ? dados.issues : [];
    const veredito = VEREDITO[dados.verdict] || VEREDITO.NOT_RUN;

    // Banner de veredito
    const banner = E('verdict-banner');
    banner.dataset.tone = veredito.tone;
    E('verdict-icon').textContent = veredito.tone === 'ok' ? '✔' : veredito.tone === 'warn' ? '⚠' : veredito.tone === 'crit' ? '✖' : '●';
    E('verdict-label').textContent = veredito.rotulo;
    E('verdict-counts').textContent = `${plural(checks.length, 'verificação', 'verificações')} · ${plural(issues.length, 'alerta', 'alertas')}`;
    E('verdict-summary').textContent = dados.summary ? String(dados.summary) : '';

    // Última análise (timestamp real do motor; cai para a hora local se ausente)
    const quando = hora(dados.timestamp);
    E('last-run').textContent = quando;
    E('foot-run').textContent = quando;
    E('foot-verdict').textContent = veredito.rotulo;

    // Lista de checks: críticos primeiro, depois atenção, depois ok.
    const lista = E('checks-list');
    const ordenados = checks.slice().sort((a, b) =>
      (ESTADO[a.status]?.ordem ?? 3) - (ESTADO[b.status]?.ordem ?? 3));
    if (!ordenados.length) {
      lista.innerHTML = '<p class="pf-empty">Nenhuma verificação disponível.</p>';
    } else {
      // Agrupamento só quando a API trouxer categoria no check (name é livre);
      // sem categoria da API, lista plana — nada é inventado.
      const chaveGrupo = (check) => check.category ?? check.categoria ?? check.area ?? check.group ?? null;
      const agrupado = ordenados.some((c) => chaveGrupo(c) != null);
      if (agrupado) {
        const grupos = new Map();
        for (const check of ordenados) {
          const chave = String(chaveGrupo(check) ?? 'Verificações');
          if (!grupos.has(chave)) grupos.set(chave, []);
          grupos.get(chave).push(check);
        }
        lista.innerHTML = [...grupos.entries()].map(([nome, itens]) =>
          `<p class="pf-group-label">${esc(nome)}</p>` + itens.map(cartao).join('')).join('');
      } else {
        lista.innerHTML = ordenados.map(cartao).join('');
      }
    }

    // Alertas que não correspondem a um check listado
    const soltos = issues.filter((issue) => !CODIGO_CHECK[issue.code]);
    const secao = E('issues-section');
    secao.hidden = soltos.length === 0;
    E('issues-list').innerHTML = soltos.map((issue) => `
      <div class="pf-issue" data-severity="${esc(issue.severity || '')}">
        <span class="pf-issue-severity">${esc(issue.severity === 'CRITICAL' ? 'CRÍTICO' : issue.severity === 'WARN' ? 'ATENÇÃO' : issue.severity || 'INFO')}</span>
        <span>${esc(issue.message)}</span>
      </div>`).join('');
  }

  function cartao(check) {
    const estado = ESTADO[check.status] || { icone: '●', palavra: esc(check.status || '—'), ordem: 3 };
    const detalhe = (analise?.issues || []).filter((issue) => CODIGO_CHECK[issue.code] === check.name);
    return `
      <div class="pf-check" data-status="${esc(check.status || '')}">
        <span class="pf-check-icon" aria-hidden="true">${estado.icone}</span>
        <div class="pf-check-body">
          <div class="pf-check-line">
            <span class="pf-check-name">${esc(check.name)}</span>
            <span class="pf-check-status">${estado.palavra}</span>
          </div>
          <div class="pf-check-value">${esc(check.value)}</div>
          ${detalhe.map((issue) => `<p class="pf-check-detail">${esc(issue.message)}</p>`).join('')}
        </div>
      </div>`;
  }

  function conexao(ok) {
    const led = E('status-led');
    const texto = E('connection');
    led.dataset.tone = ok ? 'ok' : 'off';
    texto.classList.toggle('offline', !ok);
    texto.textContent = ok ? 'API 3Mix conectada' : 'Sem conexão com a API 3Mix';
  }

  async function analisar() {
    if (ocupado) return;
    ocupado = true;
    const botao = E('btn-run');
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch('/api/preflight', { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const dados = await res.json();
      conexao(true);
      desenhar(dados.success === false ? (dados.preflight || dados) : dados);
    } catch (erro) {
      conexao(false);
      const banner = E('verdict-banner');
      banner.dataset.tone = 'crit';
      E('verdict-icon').textContent = '✖';
      E('verdict-label').textContent = 'ANÁLISE INDISPONÍVEL';
      E('verdict-counts').textContent = 'Não foi possível consultar o Pre-Flight.';
      E('verdict-summary').textContent = String(erro?.message || erro);
    } finally {
      ocupado = false;
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
    }
  }

  /* Nome do projeto (mesma rota usada pelas janelas Áudio/Retornos). */
  async function lerProjeto() {
    try {
      const res = await fetch('/api/json', { signal: AbortSignal.timeout(6000) });
      const data = await res.json();
      const nome = data && data.preset ? String(data.preset) : '';
      if (nome && E('project-name')) E('project-name').textContent = nome;
    } catch { /* chip permanece “—” até a API responder */ }
  }

  E('btn-run').addEventListener('click', analisar);
  analisar();
  lerProjeto();
})();
