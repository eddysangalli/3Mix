// Janela do Multiview: desenha a montagem feita em Configurações › Multiview. A imagem de cada monitor é um quadro real
// pedido ao motor, em rodízio: Programa e Preview cerca de 1 por segundo, os demais a cada poucos segundos. Não é vídeo
// contínuo; vídeo contínuo fica em Monitores › Abrir multiview. Sem imagem, o monitor avisa: nunca inventa uma entrada.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const M = window.MV3;
  const params = new URLSearchParams(location.search);
  // No computador do 3Mix: quadro por entrada. Em outro dispositivo esse quadro não é servido; ali vale a miniatura.
  const remote = !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

  let dados = null, atual = params.get('montagem') || '', assinatura = '';
  let state = { connected: false, program: '', preview: '', inputs: [] };
  let meters = {}, thumbs = {};
  const montagem = () => dados?.montagens.find((m) => m.id === atual) || dados?.montagens[0];

  // ---- de onde vem cada monitor ----
  function resolver(t) {
    const lista = M.entradas(state);
    if (t.tipo === 'programa') return state.program ? (lista.find((i) => i.name === state.program) || { name: state.program }) : null;
    if (t.tipo === 'preview') return state.preview ? (lista.find((i) => i.name === state.preview) || { name: state.preview }) : null;
    if (t.tipo === 'entrada') return t.entrada ? (lista.find((i) => i.name === t.entrada) || { name: t.entrada, ausente: true }) : null;
    if (t.tipo === 'auto') return M.entradasAuto(state)[montagem().tiles.filter((x) => x.tipo === 'auto').indexOf(t)] || null;
    return null;
  }

  // ---- desenho ----
  function ajustar() {
    const m = montagem();
    if (!m) return;
    const palco = E('multiview-stage'), [W, H] = M.TAMANHO[m.monitor], cs = getComputedStyle(palco);
    const livreW = palco.clientWidth - parseFloat(cs.paddingLeft) * 2, livreH = palco.clientHeight - parseFloat(cs.paddingTop) * 2;
    if (livreW <= 0 || livreH <= 0) return;
    const escala = Math.min(livreW / W, livreH / H);
    E('mv-canvas').style.width = Math.floor(W * escala) + 'px';
    E('mv-canvas').style.height = Math.floor(H * escala) + 'px';
  }

  function construir() {
    const m = montagem();
    if (!m) return;
    const [W, H] = M.TAMANHO[m.monitor], pct = (v, t) => (v / t * 100) + '%';
    E('mv-canvas').innerHTML = m.tiles.map((t) => {
      const geo = `left:${pct(t.x, W)};top:${pct(t.y, H)};width:${pct(t.w, W)};height:${pct(t.h, H)}`;
      if (t.tipo === 'relogio') return `<div class="mv-box" data-id="${esc(t.id)}" data-kind="relogio" style="${geo}"><div class="mv-clock"><b></b><small></small></div></div>`;
      if (t.tipo === 'vazio') return `<div class="mv-box is-empty" data-id="${esc(t.id)}" data-kind="vazio" style="${geo}"></div>`;
      const guias = m.guias && ['programa', 'preview'].includes(t.tipo) ? (t.formato === '9:16' ? '<i class="mv-safe social"></i>' : '<i class="mv-safe action"></i><i class="mv-safe title"></i>') : '';
      return `<div class="mv-box${t.ajuste === 'caber' ? ' caber' : ''}" data-id="${esc(t.id)}" data-kind="${esc(t.tipo)}" style="${geo}"><div class="mv-nosignal"></div><img alt="" hidden>${guias}${t.nome === false && t.vu === false ? '' : `<div class="mv-label"><span class="mv-tag" hidden></span><span class="mv-name"></span><span class="mv-vu" hidden><i></i><i></i></span></div>`}</div>`;
    }).join('');
    document.title = '3Mix · ' + m.nome;
    ajustar();
    pintar();
  }

  function pintar() {
    const m = montagem();
    if (!m) return;
    for (const t of m.tiles) {
      const box = E('mv-canvas').querySelector(`[data-id="${CSS.escape(t.id)}"]`);
      if (!box || ['relogio', 'vazio'].includes(t.tipo)) continue;
      const input = resolver(t), name = input?.name || '';
      if (box.dataset.input !== name) {
        const img = box.querySelector('img');
        img.hidden = true; img.removeAttribute('src');
        box.classList.remove('has-image');
        delete box.dataset.tried;
      }
      const isPgm = t.tipo === 'programa' || (!!name && name === state.program);
      const isPv = !isPgm && (t.tipo === 'preview' || (!!name && name === state.preview));
      box.dataset.input = name;
      box.dataset.key = input?.key || '';
      box.classList.toggle('is-pgm', isPgm);
      box.classList.toggle('is-pv', isPv);
      box.classList.toggle('is-empty', !input);
      box.querySelector('.mv-nosignal').textContent = input ? (input.ausente ? 'Entrada ausente' : state.connected ? 'Sem imagem' : 'Motor desconectado') : 'Sem entrada';
      const label = box.querySelector('.mv-label');
      if (!label) continue;
      const tag = label.querySelector('.mv-tag'), texto = isPgm ? 'PGM' : isPv ? 'PVW' : '';
      tag.textContent = texto; tag.hidden = !texto;
      label.querySelector('.mv-name').textContent = t.nome === false ? '' : name;
      label.querySelector('.mv-name').title = name;
      const vu = label.querySelector('.mv-vu');
      vu.hidden = !input || t.vu === false;
      vu.dataset.vu = name;
      if (remote) pintarMiniatura(box);
    }
    pintarMedidores();
    pintarRelogios();
  }

  function pintarRelogios() {
    const m = montagem();
    if (!m) return;
    for (const t of m.tiles) {
      if (t.tipo !== 'relogio') continue;
      const box = E('mv-canvas').querySelector(`[data-id="${CSS.escape(t.id)}"] .mv-clock`);
      if (!box) continue;
      const r = M.textoRelogio(t.relogio, state);
      box.querySelector('b').textContent = r.texto;
      box.querySelector('small').textContent = r.titulo;
      box.classList.toggle('ativo', r.ativo);
    }
  }

  function pintarMiniatura(box) {
    const img = box.querySelector('img'), url = thumbs[box.dataset.input];
    if (!img || !url) return;
    if (img.getAttribute('src') !== url) img.src = url;
    img.hidden = false;
    box.classList.add('has-image');
  }

  function pintarMedidores() {
    document.querySelectorAll('.mv-vu[data-vu]').forEach((vu) => {
      const levels = meters[vu.dataset.vu], bars = vu.querySelectorAll('i');
      const nivel = (ch) => (levels && levels[ch] ? clamp(levels[ch][1] || 0, 0, 1) : 0);
      bars[0].style.setProperty('--level', (nivel(0) * 100) + '%');
      bars[1].style.setProperty('--level', (nivel(1) * 100) + '%');
    });
  }

  // ---- imagem real, em rodízio ----
  const MAX_INFLIGHT = 2, CICLO_MS = 250;
  let inflight = 0, vez = 0, ultimo = 0;
  const cursor = { main: 0, other: 0 };
  const tirar = (lista, nome) => (lista.length ? lista[cursor[nome]++ % lista.length] : null);

  function pump() {
    if (remote || document.hidden || !state.connected || inflight >= MAX_INFLIGHT) return;
    const boxes = [...document.querySelectorAll('.mv-box')].filter((x) => x.dataset.key && x.dataset.loading !== '1');
    // Monitor sem imagem vem antes de tudo, para a tela não abrir vazia.
    const primeiro = boxes.find((x) => !x.classList.contains('has-image') && !x.dataset.tried);
    if (!primeiro && Date.now() - ultimo < CICLO_MS) return;
    const principais = boxes.filter((x) => ['programa', 'preview'].includes(x.dataset.kind)), outros = boxes.filter((x) => !['programa', 'preview'].includes(x.dataset.kind));
    const box = primeiro || (vez++ % 2 === 0 ? tirar(principais, 'main') || tirar(outros, 'other') : tirar(outros, 'other') || tirar(principais, 'main'));
    if (!box) return;
    ultimo = Date.now();
    inflight++;
    box.dataset.loading = '1';
    const pedido = box.dataset.input, quadro = new Image();
    const fim = () => { inflight--; box.dataset.loading = ''; box.dataset.tried = '1'; };
    quadro.onload = () => {
      fim();
      if (box.dataset.input !== pedido) return;
      const img = box.querySelector('img');
      img.src = quadro.src;
      img.hidden = false;
      box.classList.add('has-image');
    };
    quadro.onerror = fim; // o monitor fica com o último quadro, ou com o aviso de sem imagem
    quadro.src = '/api/ptz/preview?input=' + encodeURIComponent(box.dataset.key) + '&t=' + Date.now();
  }

  let lendoThumbs = false;
  async function lerThumbs() {
    if (document.hidden || lendoThumbs) return;
    lendoThumbs = true;
    try {
      const r = await fetch('/api/thumbs', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (r.ok) { thumbs = (await r.json()).thumbs || {}; document.querySelectorAll('.mv-box').forEach(pintarMiniatura); }
    } catch { /* segue com a última imagem */ }
    lendoThumbs = false;
  }

  // ---- montagem: a janela acompanha o que for salvo ----
  async function lerMontagens() {
    try {
      const novo = await M.carregar(), texto = JSON.stringify(novo);
      if (texto === assinatura) return;
      assinatura = texto;
      dados = novo;
      if (!dados.montagens.some((m) => m.id === atual)) atual = dados.ativa;
      E('mv-montagem').innerHTML = dados.montagens.map((m) => `<option value="${esc(m.id)}"${m.id === atual ? ' selected' : ''}>${esc(m.nome)}</option>`).join('');
      construir();
    } catch { /* mantém a montagem na tela */ }
  }

  // ---- conexão ----
  function conexao(texto, tom) {
    const box = E('connection');
    box.textContent = texto; box.dataset.state = tom;
    const off = E('mv-offline');
    off.hidden = tom === 'on';
    off.textContent = tom === 'on' ? '' : texto === 'Motor desconectado' ? 'Motor desconectado: sem imagem das entradas.' : 'Reconectando ao 3Mix…';
  }
  function aplicar(d) {
    state = { connected: d.connected === true, program: d.program || d.active || '', preview: d.preview || '', inputs: Array.isArray(d.inputs) ? d.inputs : [], recording: d.recording, streaming: d.streaming, recordTimecode: d.recordTimecode, streamTimecode: d.streamTimecode };
    conexao(state.connected ? 'Motor conectado' : 'Motor desconectado', state.connected ? 'on' : 'off');
    pintar();
  }
  function ligar() {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if ((msg.type === 'state' || msg.type === 'init') && msg.data) aplicar(msg.data);
      else if (msg.type === 'meters' && Array.isArray(msg.inputs)) {
        meters = {};
        // O medidor vem da fonte ("CAM 1 (fonte)"); o monitor mostra a entrada ("CAM 1").
        for (const i of msg.inputs) {
          const nome = String(i.inputName || '').replace(/ \(fonte\)$/, '');
          if (i.inputLevelsMul?.length && !meters[nome]) meters[nome] = i.inputLevelsMul;
        }
        pintarMedidores();
      }
    };
    ws.onclose = () => { conexao('Reconectando…', 'wait'); setTimeout(ligar, 2000); };
    ws.onerror = () => ws.close();
  }

  // ---- interação ----
  E('mv-montagem').addEventListener('change', (e) => { atual = e.target.value; construir(); });
  E('btn-editar').hidden = remote;
  E('btn-editar').addEventListener('click', async () => {
    try {
      const r = await fetch('/api/panel-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route: '/configuracoes?category=multiview' }), signal: AbortSignal.timeout(6000) });
      if ((await r.json()).success === true) return;
    } catch { /* fora do programa */ }
    window.open('/configuracoes?category=multiview', '_blank', 'noopener');
  });
  E('btn-full').addEventListener('click', () => { document.documentElement.requestFullscreen().catch(() => {}); });
  document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('cheia', !!document.fullscreenElement); ajustar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'F11') { e.preventDefault(); E('btn-full').click(); } });
  document.addEventListener('dblclick', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else E('btn-full').click(); });
  new ResizeObserver(ajustar).observe(E('multiview-stage'));

  (async () => {
    await lerMontagens();
    ligar();
    setInterval(lerMontagens, 3000);
    setInterval(pintarRelogios, 500);
    if (remote) { lerThumbs(); setInterval(lerThumbs, 1000); }
    else setInterval(pump, 60);
  })();
})();
