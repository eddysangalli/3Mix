// Assistente de primeira execução: dez etapas, cada uma com dado medido de verdade. Nada pesado roda sem clique.
(() => {
  const E = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NOMES = { 'boas-vindas': 'Boas-vindas', integridade: 'Instalação e motor', inventario: 'Hardware', encoders: 'Encoders', disco: 'Disco de gravação', rede: 'Rede', equipamentos: 'Câmeras PTZ e controles', capacidade: 'Teste de capacidade', saidas: 'Saídas', modulos: 'Módulos', interface: 'Conhecer a mesa', 'teste-final': 'Teste final', resumo: 'Resumo' };
  let dados = null, atual = 0, ocupado = false, medidas = {}, poll = null;

  const msg = (t, erro) => { E('pe-msg').textContent = t || ''; E('pe-msg').className = 'pe-msg' + (erro ? ' erro' : ''); };
  async function api(action, extra = {}) {
    const r = await fetch('/api/diagnostico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) throw new Error(d.error || 'HTTP ' + r.status);
    return d.result;
  }
  async function ler() { dados = await (await fetch('/api/diagnostico', { cache: 'no-store' })).json(); return dados; }
  const etapa = () => dados.etapas[atual];

  function lista() {
    E('pe-steps').innerHTML = dados.etapas.map((id, i) => {
      const s = dados.estado.etapas[id]?.situacao || '';
      return `<li data-i="${i}" data-situacao="${s}" class="${i === atual ? 'atual' : ''}"><b>${s === 'feita' ? '✔' : s === 'adiada' ? '…' : i + 1}</b>${esc(NOMES[id])}</li>`;
    }).join('');
  }

  async function marcar(adiada) { dados.estado = await api('etapa', { etapa: etapa(), adiada }); }

  async function rodar(botao, fn) {
    if (ocupado) return;
    ocupado = true; botao.disabled = true; msg('Medindo…');
    try { await fn(); msg(''); } catch (e) { msg(e.message, true); } finally { ocupado = false; botao.disabled = false; }
  }

  const linhaNivel = (nome, nivel, valor) => `<tr><td>${esc(nome)}</td><td class="${nivel === 'APROVADO' ? 'ok' : nivel === 'BLOQUEIO' ? 'bad' : nivel === 'ATENÇÃO' ? 'warn' : 'dim'}">${esc(nivel)}</td><td>${esc(valor)}</td></tr>`;

  const TELAS = {
    'boas-vindas': () => `<h2>Bem-vindo ao 3Mix</h2><p class="pe-sub">Vamos conferir este computador antes da primeira produção. Cada etapa pode ficar para depois.</p>
      <div class="pe-card"><dl class="pe-grid"><dt>Versão instalada</dt><dd>${esc(dados.versao || 'não identificada')}</dd>
      <dt>Perfil medido</dt><dd>${dados.perfil?.fontesValidadas != null ? `até ${dados.perfil.fontesValidadas} fontes, em ${esc(dados.perfil.medidoEm)}` : '<span class="dim">ainda não</span>'}</dd></dl></div>
      <div class="pe-acoes"><a class="pe-btn" href="/recuperacao" target="_blank" style="line-height:32px;text-decoration:none">Importar projeto existente</a></div>`,

    integridade: () => `<h2>Instalação e motor</h2><p class="pe-sub">Motor, painel e pasta de gravação.</p>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Verificar</button></div><div id="saida"></div>`,
    inventario: () => `<h2>Hardware</h2><p class="pe-sub">Lido do Windows. O que ele não informa aparece como não lido.</p>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Ler hardware</button></div><div id="saida"></div>`,
    encoders: () => `<h2>Encoders</h2><p class="pe-sub">Cada encoder codifica 3 s de vídeo 1080p60. Só conta o que funcionar de verdade. Leva cerca de 30 s.</p>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Testar encoders</button></div><div id="saida"></div>`,
    disco: () => `<h2>Disco de gravação</h2><p class="pe-sub">Grava e lê 512 MB na pasta de gravação e apaga em seguida.</p>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Testar disco</button></div><div id="saida"></div>`,
    rede: () => `<h2>Rede</h2><p class="pe-sub">Latência, variação e perda até o roteador. A velocidade de envio para a internet não é medida.</p>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Medir rede local</button></div><div id="saida"></div>`,
    equipamentos: () => `<h2>Câmeras PTZ e controles</h2><p class="pe-sub">Procura câmeras ONVIF na rede e controles ligados ao computador. Câmeras VISCA são cadastradas pelo endereço.</p>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Procurar</button><a class="pe-btn" href="/ptz" target="_blank" style="line-height:32px;text-decoration:none">Cadastrar câmera</a><a class="pe-btn" href="/macros" target="_blank" style="line-height:32px;text-decoration:none">Configurar controles</a></div><div id="saida"></div>`,
    saidas: () => `<h2>Saídas</h2><p class="pe-sub">Transmissão, gravação e saídas de rede e físicas disponíveis neste computador.</p>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Ver saídas</button><a class="pe-btn" href="/saidas" target="_blank" style="line-height:32px;text-decoration:none">Configurar saídas</a></div><div id="saida"></div>`,
    'teste-final': () => `<h2>Teste final</h2><p class="pe-sub">Confere a imagem do Preview e do Programa, o áudio do Master e grava 3 s (o arquivo é apagado). Precisa de tudo parado.</p>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Testar</button></div><div id="saida"></div>`,
    capacidade: () => `<h2>Teste de capacidade</h2><p class="pe-sub">Abre fontes de vídeo de teste numa coleção separada e mede o motor. Seu projeto não é tocado. Precisa de tudo parado (sem transmissão nem gravação).</p>
      <div class="pe-card pe-perfis">${dados.perfis.map((p) => `<label><input type="checkbox" value="${p.fontes}" ${p.fontes <= 8 ? 'checked' : ''}> ${p.fontes} fontes · ${esc(p.nome)}</label>`).join('')}</div>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Iniciar teste</button><button class="pe-btn" id="cancelar" disabled>Cancelar</button></div>
      <div id="saida"></div><div class="pe-progresso" id="progresso"></div>`,
    modulos: () => `<h2>Módulos</h2><p class="pe-sub">Ligue o que vai usar. Pode mudar depois em Configurações › Módulos.</p><div class="pe-card" id="saida">Carregando…</div>
      <div class="pe-acoes"><button class="pe-btn primario" id="acao">Salvar módulos</button></div>`,
    interface: () => `<h2>Conhecer a mesa</h2><p class="pe-sub">O que existe na mesa hoje. O manual explica cada parte.</p>
      <div class="pe-card"><table class="pe-tab">${[
        ['Preview e Programa', 'Monte no Preview e corte para o Programa com CUT ou AUTO.', 'mesa'], ['Entradas', 'Câmeras, VTs, títulos e composições em cards.', 'entradas'],
        ['DSK', 'Camadas por cima do Programa, com TAKE e AUTO.', 'dsk'], ['M/E', 'Até 3 mesas extras com Preview e Programa próprios.', 'me'],
        ['Replay', 'Players A/B e histórico de câmeras.', 'replay'], ['Áudio', 'Mixer, barramentos A/B e fones.', 'audio'],
        ['Gravação e transmissão', 'Saídas principais e destinos extras.', 'gravacao'], ['Atraso e DUMP', 'Descarta o trecho que ainda não foi ao ar.', 'dump'],
        ['Pre-Flight', 'Confere tudo antes de entrar no ar.', 'preflight']
      ].map(([n, d, a]) => `<tr><td><b>${n}</b></td><td>${d}</td><td><a href="/docs/usuario/manual-operador.html#${a}" target="_blank">Manual</a></td></tr>`).join('')}</table></div>`,
    resumo: () => {
      const p = dados.perfil || {}, inv = p.inventario, enc = (p.encoders?.testados || []).filter((e) => e.funciona);
      const cap = dados.estado.etapas.capacidade?.situacao;
      const hw = enc.find((e) => /nvenc|qsv|amf/.test(e.id));
      return `<h2>Resumo</h2><p class="pe-sub">O que foi medido neste computador.</p>
      <div class="pe-card"><dl class="pe-grid">
        <dt>Processador</dt><dd>${inv?.cpu ? esc(`${inv.cpu.nome} · ${inv.cpu.threads} threads`) : '<span class="dim">não lido</span>'}</dd>
        <dt>Memória</dt><dd>${inv?.ramGb ? inv.ramGb + ' GB' : '<span class="dim">não lida</span>'}</dd>
        <dt>Placa de vídeo</dt><dd>${inv?.gpus?.length ? esc(inv.gpus.map((g) => `${g.nome}${g.vramGb ? ' · ' + g.vramGb + ' GB' : ''}`).join(' · ')) : '<span class="dim">não lida</span>'}</dd>
        <dt>Encoders que funcionam</dt><dd>${enc.length ? esc(enc.map((e) => e.nome).join(', ')) : '<span class="dim">não testados</span>'}</dd>
        <dt>Disco de gravação</dt><dd>${p.disco ? p.disco.escritaMBs + ' MB/s de escrita' : '<span class="dim">não testado</span>'}</dd>
        <dt>Módulos ligados</dt><dd id="resumo-modulos">…</dd>
        <dt>Câmeras e controles</dt><dd>${p.equipamentos ? `${p.equipamentos.cameras} ONVIF na rede · ${p.equipamentos.ptz} PTZ cadastradas · ${p.equipamentos.controladores.length ? esc(p.equipamentos.controladores.join(', ')) : 'nenhum controle'}` : '<span class="dim">não procurados</span>'}</dd>
        <dt>Teste final</dt><dd>${dados.testeFinal ? (dados.testeFinal.gravacao.ok && dados.testeFinal.programa.imagem ? '<span class="ok">imagem, áudio e gravação conferidos</span>' : '<span class="warn">com pontos de atenção</span>') : dados.estado.etapas['teste-final']?.situacao === 'feita' ? 'feito' : '<span class="dim">não feito</span>'}</dd>
        <dt>Capacidade medida</dt><dd>${p.fontesValidadas != null && cap === 'feita' ? `<span class="ok">até ${p.fontesValidadas} fontes</span> (${esc(p.benchmark?.video ? p.benchmark.video.largura + '×' + p.benchmark.video.altura + ' ' + p.benchmark.video.fps + ' fps' : '')})` : '<span class="warn">não validada</span>: rode o teste antes da primeira produção grande'}</dd>
      </dl></div>
      <div class="pe-card"><b>Recomendações</b><ul>${[
        hw ? `Use o encoder ${esc(hw.nome)}: ele poupa o processador.` : enc.length ? 'Sem encoder de placa de vídeo: prefira resoluções e taxas menores.' : null,
        p.disco && p.disco.escritaMBs < 100 ? 'O disco é lento para gravações simultâneas: grave em um SSD.' : null,
        cap !== 'feita' ? 'Rode o teste de capacidade antes de montar produções com muitas fontes.' : null,
        'Antes de cada transmissão, rode o Pre-Flight.'
      ].filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ul></div>
      <div class="pe-acoes"><a class="pe-btn primario" href="/novo-projeto/" style="line-height:32px;text-decoration:none">Criar projeto</a><button class="pe-btn" id="demo">Abrir demonstração (Futsal)</button><a class="pe-btn" href="/docs/usuario/manual-operador.html" target="_blank" style="line-height:32px;text-decoration:none">Abrir manual</a></div>`;
    }
  };

  const ACOES = {
    async integridade(saida) {
      const h = await (await fetch('/api/health', { cache: 'no-store' })).json();
      const pf = await (await fetch('/api/preflight?item=gravacao', { cache: 'no-store' })).json();
      const grav = pf.itens?.find((x) => x.id === 'gravacao');
      saida.innerHTML = `<div class="pe-card"><table class="pe-tab"><tr><th>Item</th><th>Situação</th><th>Detalhe</th></tr>
        ${linhaNivel('Painel e API', 'APROVADO', `${h.appName || '3Mix'} · protocolo ${h.protocol}`)}
        ${linhaNivel('Motor', h.connected ? 'APROVADO' : 'BLOQUEIO', h.connected ? 'Conectado' : 'Sem conexão: abra o 3Mix pelo atalho')}
        ${grav ? linhaNivel('Pasta de gravação', grav.nivel, grav.valor) : linhaNivel('Pasta de gravação', 'NÃO VERIFICADO', pf.error || '')}
      </table></div>`;
    },
    async inventario(saida) {
      const r = await api('inventario'), i = r.inventario;
      saida.innerHTML = `<div class="pe-card"><dl class="pe-grid">
        <dt>Windows</dt><dd>${esc(i.windows || 'não lido')}</dd>
        <dt>Processador</dt><dd>${i.cpu ? esc(`${i.cpu.nome} · ${i.cpu.nucleos} núcleos, ${i.cpu.threads} threads`) : 'não lido'}</dd>
        <dt>Memória</dt><dd>${i.ramGb ?? 'não lida'} GB</dd>
        ${i.gpus.map((g) => `<dt>Placa de vídeo</dt><dd>${esc(g.nome)} · ${g.vramGb != null ? g.vramGb + ' GB' + (g.vramExata ? '' : ' (aproximado)') : 'memória não lida'} · driver ${esc(g.driver || '—')}${g.temperatura != null ? ' · ' + g.temperatura + ' °C' : ''}</dd>`).join('')}
        <dt>Telas</dt><dd>${i.telas.map((t) => `${t.largura}×${t.altura}${t.principal ? ' (principal)' : ''}`).join(' · ') || 'não lidas'}</dd>
        <dt>Captura</dt><dd>${esc(i.captura.map((c) => c.nome).join(' · ') || 'nenhum dispositivo de vídeo encontrado')}</dd>
        <dt>Discos</dt><dd>${esc(i.discos.map((d) => `${d.nome} · ${d.tipo || '?'} ${d.barramento || ''} · ${d.tamanhoGb} GB`).join(' · '))}</dd>
      </dl></div>${r.revalidar.precisa ? `<p class="warn">${esc(r.revalidar.motivo)}</p>` : ''}`;
    },
    async encoders(saida) {
      const r = await api('encoders');
      saida.innerHTML = `<div class="pe-card"><table class="pe-tab"><tr><th>Encoder</th><th>Resultado</th><th>Velocidade</th></tr>${r.testados.map((e) => `<tr><td>${esc(e.nome)}</td><td class="${e.funciona ? 'ok' : 'dim'}">${e.funciona ? 'Funciona' : 'Não disponível'}</td><td>${e.funciona ? e.fps + ' quadros/s' : esc(e.motivo)}</td></tr>`).join('')}</table></div>`;
    },
    async disco(saida) {
      const r = await api('disco');
      saida.innerHTML = `<div class="pe-card"><dl class="pe-grid"><dt>Pasta</dt><dd>${esc(r.pasta)}</dd><dt>Escrita</dt><dd class="${r.escritaMBs >= 100 ? 'ok' : 'warn'}">${r.escritaMBs} MB/s</dd><dt>Leitura</dt><dd>${r.leituraMBs} MB/s <small class="dim">(pode vir da memória)</small></dd></dl></div>`;
    },
    async rede(saida) {
      const r = await api('rede');
      saida.innerHTML = `<div class="pe-card"><table class="pe-tab"><tr><th>Destino</th><th>Latência</th><th>Variação</th><th>Perda</th></tr>${r.map((a) => a.medido === false ? `<tr><td>${esc(a.nome)}</td><td colspan="3" class="dim">${esc(a.motivo)}</td></tr>` : `<tr><td>${esc(a.nome)} (${esc(a.host)})</td><td>${a.latenciaMs ?? '—'} ms</td><td>${a.variacaoMs ?? '—'} ms</td><td class="${a.perdaPct ? 'warn' : 'ok'}">${a.perdaPct}%</td></tr>`).join('')}</table></div>`;
    },
    async capacidade(saida) {
      const perfis = [...document.querySelectorAll('.pe-perfis input:checked')].map((x) => Number(x.value));
      await api('capacidade_iniciar', { perfis });
      E('cancelar').disabled = false;
      await new Promise((resolve) => {
        poll = setInterval(async () => {
          await ler();
          const b = dados.benchmark;
          E('progresso').textContent = (b.log || []).slice(-8).join('\n');
          if (b.estado === 'rodando') return;
          clearInterval(poll); poll = null; E('cancelar').disabled = true;
          saida.innerHTML = b.estado === 'concluido'
            ? `<div class="pe-card"><table class="pe-tab"><tr><th>Fontes</th><th>Resultado</th><th>Quadros</th><th>Render</th><th>Perdidos</th><th>CPU / GPU</th></tr>${b.perfis.map((m) => `<tr><td>${m.fontes}</td><td class="${m.resultado === 'APROVADO' ? 'ok' : m.resultado === 'FALHA' ? 'bad' : 'warn'}">${m.resultado}</td><td>${m.fpsMedio}/${m.fpsAlvo}</td><td>${m.renderMedioMs} ms</td><td>${(Math.max(m.perdaRender, m.perdaEncoder || 0) * 100).toFixed(2)}%</td><td>${m.cpuMaquina ?? '—'}% / ${m.gpuMaquina ?? '—'}%</td></tr>`).join('')}</table><p>Validado até <b>${b.fontesValidadas}</b> fontes. ${b.restaurado ? 'Seu projeto foi reaberto.' : ''}</p></div>`
            : `<p class="${b.estado === 'cancelado' ? 'warn' : 'bad'}">${b.estado === 'cancelado' ? 'Cancelado. Seu projeto foi reaberto.' : esc(b.erro || 'O teste não terminou.')}</p>`;
          resolve();
        }, 1000);
      });
      if (dados.benchmark.estado !== 'concluido') throw new Error(dados.benchmark.erro || 'Teste cancelado');
    },
    async equipamentos(saida) {
      const r = await api('equipamentos');
      const cams = r.onvif.cameras.map((c) => `<tr><td>${esc(c.nome || 'Câmera ONVIF')}</td><td>${esc(c.ip)}</td><td>${esc(c.modelo || '—')}</td><td>${c.ptzAnunciado ? 'PTZ' : '—'}</td></tr>`).join('');
      saida.innerHTML = `<div class="pe-card"><b>Câmeras ONVIF encontradas na rede</b><table class="pe-tab"><tr><th>Nome</th><th>Endereço</th><th>Modelo</th><th></th></tr>${cams || '<tr><td colspan="4" class="dim">Nenhuma respondeu.</td></tr>'}</table></div>
        <div class="pe-card"><b>Câmeras PTZ cadastradas</b><table class="pe-tab">${r.ptzCadastradas.map((d) => `<tr><td>${esc(d.nome)}</td><td>${esc(d.protocolo)}</td><td>${esc(d.host)}</td><td class="${d.conectada ? 'ok' : 'warn'}">${d.conectada ? 'Conectada' : 'Sem conexão'}</td></tr>`).join('') || '<tr><td class="dim">Nenhuma cadastrada.</td></tr>'}</table></div>
        <div class="pe-card"><b>Controles ligados ao computador</b><table class="pe-tab">${r.controladores.map((c) => `<tr><td>${esc(c.nome)}</td><td>${esc({ midi: 'MIDI (atalhos)', streamdeck: 'Stream Deck', xkeys: 'X-keys' }[c.tipo] || c.tipo)}</td></tr>`).join('') || '<tr><td class="dim">Nenhum encontrado. Companion e OSC funcionam pela rede.</td></tr>'}</table></div>`;
    },
    async saidas(saida) {
      const d = await (await fetch('/api/outputs', { cache: 'no-store' })).json();
      const o = d.outputs || {};
      const destinos = (o.destinations || []).filter((x) => x.name || x.server);
      const proto = [...new Set((o.protocols || []).map((x) => (typeof x === 'string' ? x : x.name || x.label || x.protocol || x.id)).filter(Boolean))];
      saida.innerHTML = `<div class="pe-card"><dl class="pe-grid">
        <dt>Encoders no motor</dt><dd>${esc((o.encoders || []).map((e) => e.name || e.id).join(' · ') || 'nenhum')}</dd>
        <dt>Protocolos</dt><dd>${esc(proto.join(' · ') || '—')}</dd>
        <dt>Saídas extras configuradas</dt><dd>${destinos.length ? esc(destinos.map((x) => `${x.name || 'Saída'} (${x.mode || '—'})`).join(' · ')) : '<span class="dim">nenhuma</span>'}</dd>
      </dl></div>`;
    },
    async 'teste-final'(saida) {
      const r = await api('teste_final');
      const linha = (nome, ok, valor) => `<tr><td>${nome}</td><td class="${ok ? 'ok' : 'warn'}">${ok ? 'OK' : 'Atenção'}</td><td>${esc(valor)}</td></tr>`;
      saida.innerHTML = `<div class="pe-card"><table class="pe-tab">
        ${linha('Programa', r.programa.imagem, r.programa.cena ? `${r.programa.cena} · ${r.programa.imagem ? 'com imagem' : 'preto'}` : 'vazio')}
        ${linha('Preview', r.preview.imagem, r.preview.cena ? `${r.preview.cena} · ${r.preview.imagem ? 'com imagem' : 'preto'}` : 'sem Preview')}
        ${linha('Áudio do Master', r.audio.lido && !r.audio.mudo && r.audio.picoDb != null, !r.audio.lido ? 'Master não encontrado' : r.audio.mudo ? 'mudo' : r.audio.picoDb != null ? `pico ${r.audio.picoDb} dBFS` : 'sem sinal agora')}
        ${linha('Gravação de 3 s', r.gravacao.ok, r.gravacao.ok ? `${r.gravacao.duracao} s · ${r.gravacao.audio ? 'vídeo e áudio' : 'só vídeo'} · arquivo ${r.arquivoApagado ? 'apagado' : 'mantido'}` : r.gravacao.motivo || 'falhou')}
      </table></div>`;
      dados.testeFinal = r;
    },
    async modulos() {
      const sel = Object.fromEntries([...document.querySelectorAll('#saida input[data-mod]')].map((x) => [x.dataset.mod, x.checked]));
      const r = await fetch('/api/modulos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulos: sel }) });
      const d = await r.json();
      if (!r.ok || d.success === false) throw new Error(d.error || 'Não salvou');
      msg('Módulos salvos.');
    }
  };

  async function abrirModulos() {
    const d = await (await fetch('/api/modulos', { cache: 'no-store' })).json();
    E('saida').innerHTML = (d.definicao || []).map((m) => `<label class="pe-mod"><input type="checkbox" data-mod="${esc(m.id)}" ${d.modulos?.[m.id] !== false ? 'checked' : ''}><span><b>${esc(m.rotulo)}</b><small>${esc(m.descricao)}</small></span></label>`).join('');
  }

  function desenhar() {
    lista();
    const id = etapa();
    E('pe-body').innerHTML = TELAS[id]();
    E('pe-voltar').disabled = atual === 0;
    E('pe-adiar').hidden = ['boas-vindas', 'resumo', 'interface'].includes(id);
    if (id === 'resumo') fetch('/api/modulos', { cache: 'no-store' }).then((r) => r.json()).then((m) => { const dd = E('resumo-modulos'); if (dd) dd.textContent = (m.definicao || []).filter((x) => m.modulos?.[x.id] !== false).map((x) => x.rotulo).join(' · ') || 'nenhum'; }).catch(() => {});
    E('pe-avancar').textContent = id === 'resumo' ? 'Concluir' : 'Continuar';
    const botao = E('acao');
    if (id === 'modulos') abrirModulos().catch((e) => msg(e.message, true));
    if (botao) botao.addEventListener('click', () => rodar(botao, async () => { await ACOES[id](E('saida')); await marcar(false); await ler(); lista(); }));
    E('cancelar')?.addEventListener('click', () => api('capacidade_cancelar').catch((e) => msg(e.message, true)));
    E('demo')?.addEventListener('click', () => rodar(E('demo'), async () => { const r = await api('demo_futsal'); msg(`Projeto ${r.projeto} aberto com ${r.cenas.length} cenas. Seu projeto anterior (${r.anterior}) continua na lista de projetos.`); }));
    msg('');
  }

  E('pe-steps').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li && !ocupado) { atual = Number(li.dataset.i); desenhar(); } });
  E('pe-voltar').addEventListener('click', () => { if (atual > 0 && !ocupado) { atual--; desenhar(); } });
  E('pe-adiar').addEventListener('click', async () => {
    if (ocupado) return;
    try { await marcar(true); await ler(); atual = Math.min(atual + 1, dados.etapas.length - 1); desenhar(); } catch (e) { msg(e.message, true); }
  });
  E('pe-avancar').addEventListener('click', async () => {
    if (ocupado) return;
    try {
      if (['boas-vindas', 'interface'].includes(etapa())) await marcar(false);
      if (etapa() === 'resumo') { await marcar(false); await api('concluir'); await ler(); msg('Configuração concluída. Você pode refazer em Configurações › Diagnóstico do computador.'); lista(); return; }
      await ler(); atual++; desenhar();
    } catch (e) { msg(e.message, true); }
  });

  ler().then(() => {
    E('pe-ver').textContent = dados.versao ? 'Versão ' + dados.versao : '';
    const pendente = dados.etapas.findIndex((id) => !dados.estado.etapas[id]);
    atual = dados.estado.concluidoEm ? dados.etapas.length - 1 : Math.max(0, pendente);
    desenhar();
  }).catch((e) => msg('Sem resposta do 3Mix: ' + e.message, true));
})();
