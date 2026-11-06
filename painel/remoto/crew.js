// 3Mix Crew — Tally + Intercom na mesma tela móvel (celular do operador de câmera/
// repórter). Reaproveita o padrão de PTT já comprovado em talkback-rapido.js (hold-to-talk
// via pointerdown/pointerup/pointercancel/lostpointercapture, com blur/visibilitychange
// como salvaguarda — nunca deixar o microfone "travado aberto" se o navegador perder foco).
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHAVE_MEMBRO = '3mix.crew.memberId';

  let membroId = null, destinoTally = 'main', audioCtx = null, ws = null, tallyWs = null, pttLease = null, heartbeat = null;
  let resumoIntercom = { membros: [], grupos: [], pttAtivos: [] };
  let alvoSelecionado = new Set();
  let acessoLocal = null, baseRede = '';

  function erro(msg) { const el = E('erro'); if (!msg) { el.style.display = 'none'; return; } el.textContent = msg; el.style.display = ''; }
  function conexao(texto, estado) { const el = E('connection'); el.textContent = texto; if (estado) el.dataset.state = estado; else delete el.dataset.state; }

  // ---- QR Code dedicado quando aberto no computador do 3Mix ----
  const pesoRede = (u) => { try { const h = new URL(u).hostname; return /^192\.168\./.test(h) ? 0 : /^10\./.test(h) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(h) ? 3 : 2; } catch { return 9; } };

  function atualizarQrCrew() {
    if (!acessoLocal || !baseRede || !E('card-qr')) return;
    const urlBase = baseRede.replace(/\/$/, '') + '/crew';
    const urlFinal = membroId ? `${urlBase}?member=${encodeURIComponent(membroId)}` : urlBase;
    E('crew-qr-img').src = '/api/qr.svg?address=' + encodeURIComponent(urlFinal);
    E('crew-qr-pin').textContent = acessoLocal.pin || '----';
    E('crew-qr-url').textContent = urlFinal;
    E('crew-qr-url').href = urlFinal;
    const m = resumoIntercom.membros.find((x) => x.memberId === membroId);
    E('crew-qr-hint').textContent = m
      ? `QR direto para ${m.name}: aponte a câmera do celular para entrar já configurado.`
      : 'Aponte a câmera do celular para abrir direto no 3Mix Crew.';
    E('card-qr').hidden = false;
  }

  async function detectarComputadorLocal() {
    try {
      const r = await fetch('/api/access', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (!r.ok) return;
      const d = await r.json();
      if (!d?.urls?.length) return;
      d.urls.sort((a, b) => pesoRede(a) - pesoRede(b));
      acessoLocal = d;
      if (E('crew-local-settings')) E('crew-local-settings').hidden = false;
      carregarFontesConfiguracao().catch(e => { E('crew-settings-status').textContent = e.message; });
      baseRede = d.urls[0];
      const selRede = E('sel-rede-qr');
      if (selRede && d.urls.length > 1) {
        selRede.innerHTML = d.urls.map((u) => {
          const rede = (d.redes || []).find((x) => x.url === u);
          const host = new URL(u).hostname;
          return `<option value="${esc(u)}">${esc((rede?.nome ? rede.nome + ' · ' : '') + host)}</option>`;
        }).join('');
        selRede.hidden = false;
        selRede.onchange = () => { baseRede = selRede.value; atualizarQrCrew(); };
      }
      atualizarQrCrew();
    } catch { /* aberto em celular/tablet remoto: /api/access não é local */ }
  }

  async function carregarFontesConfiguracao() {
    const r = await fetch('/api/audio-routing', {cache:'no-store', signal:AbortSignal.timeout(6000)});
    const d = await r.json();
    if (!r.ok || !d.success || d.audioRouting?.error) throw Error(d.error || d.audioRouting?.error || 'Fontes de áudio indisponíveis');
    E('crew-member-source').innerHTML = '<option value="">Selecione uma fonte real…</option>' + (d.audioRouting?.sources || []).filter(x => !x.internal && !x.protected).map(x => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('');
  }
  E('crew-member-form')?.addEventListener('submit', async event => {
    event.preventDefault(); if (!acessoLocal) return;
    const status = E('crew-settings-status'); const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const r = await fetch('/api/crew/intercom', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register_member',name:E('crew-member-name').value.trim(),sourceUuid:E('crew-member-source').value,role:E('crew-member-role').value}),signal:AbortSignal.timeout(8000)});
      const d = await r.json();
      if (!r.ok || !d.success || !d.membros?.some(m => m.memberId === d.memberId)) throw Error(d.error || 'Cadastro não confirmado');
      await carregarMembros(); status.textContent = 'Membro confirmado no Crew desta execução.';
    } catch (e) { status.textContent = e.message; }
    finally { if (button) button.disabled = false; }
  });

  // ---- Pareamento por PIN diretamente na tela /crew para celulares ----
  E('form-pair')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro('');
    const pin = (E('inp-pin')?.value || '').trim();
    if (!pin) return erro('Digite o código PIN exibido no computador do 3Mix');
    try {
      const r = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        signal: AbortSignal.timeout(6000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw Error(d.error || 'Código PIN incorreto');
      E('card-pair').hidden = true;
      E('escolha-identidade').hidden = false;
      await carregarMembros();
    } catch (e) {
      erro(e.message);
    }
  });

  async function carregarMembros() {
    const r = await fetch('/api/crew/intercom', { signal: AbortSignal.timeout(6000) });
    if (r.status === 401) {
      conexao('Aguardando código PIN…', 'wait');
      if (E('card-pair')) E('card-pair').hidden = false;
      if (E('escolha-identidade')) E('escolha-identidade').hidden = true;
      return;
    }
    const d = await r.json();
    if (!r.ok || !d.success) throw Error(d.error || 'Falha ao ler membros do Crew');
    resumoIntercom = d;
    if (E('card-pair')) E('card-pair').hidden = true;
    if (E('escolha-identidade')) E('escolha-identidade').hidden = false;
    const sel = E('sel-membro');
    const daUrl = new URLSearchParams(location.search).get('member') || '';
    const salvo = daUrl || (() => { try { return localStorage.getItem(CHAVE_MEMBRO) || ''; } catch { return ''; } })();
    sel.innerHTML = '<option value="">Selecione…</option>' + d.membros.map((m) => `<option value="${esc(m.memberId)}" ${m.memberId === salvo ? 'selected' : ''}>${esc(m.name)}${m.role === 'director' ? ' (Direção)' : ''}</option>`).join('');
    if (d.membros.some((m) => m.memberId === salvo)) { membroId = salvo; await iniciarParaMembro(); }
    atualizarQrCrew();
  }

  async function iniciarParaMembro() {
    if (!membroId) return;
    try { localStorage.setItem(CHAVE_MEMBRO, membroId); } catch { /* sem armazenamento */ }
    E('card-tally').hidden = false;
    E('card-intercom').hidden = false;
    conectarTally();
    conectarAudio();
    renderAlvos();
    atualizarQrCrew();
  }

  // ---- Tally ----
  function conectarTally() {
    tallyWs?.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    tallyWs = new WebSocket(`${proto}://${location.host}/api/crew/tally/ws?watching=${encodeURIComponent(destinoTally)}`);
    tallyWs.onmessage = (ev) => { try { renderTally(JSON.parse(ev.data)); } catch { /* ignora mensagem malformada */ } };
    tallyWs.onclose = () => { conexao('Tally desconectado — tentando de novo…', 'wait'); setTimeout(() => { if (tallyWs?.readyState !== WebSocket.OPEN) conectarTally(); }, 2000); };
    tallyWs.onopen = () => conexao('Conectado', 'on');
  }
  function renderTally(estado) {
    E('tally-destino').textContent = estado.destinoValido ? '' : 'Destino indisponível';
    E('tally-grid').innerHTML = (estado.entradas || []).map((e) => `<div class="crew-cam ${esc(e.estado)}"><span class="n">${esc(e.number ?? '')}</span><span class="nome">${esc(e.name)}</span></div>`).join('');
    conexao(estado.conectado ? 'Motor conectado' : 'Motor desconectado', estado.conectado ? 'on' : 'off');
  }

  // ---- Intercom: lista de alvos (membros + grupos, exceto a própria pessoa) ----
  function renderAlvos() {
    const outros = resumoIntercom.membros.filter((m) => m.memberId !== membroId);
    const itens = [...resumoIntercom.grupos.map((g) => ({ id: g.groupId, label: g.name, tipo: 'grupo' })), ...outros.map((m) => ({ id: m.memberId, label: m.name, tipo: 'membro' }))];
    E('alvo-lista').innerHTML = itens.map((it) => `<button type="button" class="crew-alvo" data-id="${esc(it.id)}">${esc(it.label)}</button>`).join('');
    for (const btn of E('alvo-lista').querySelectorAll('.crew-alvo')) btn.addEventListener('click', () => { const id = btn.dataset.id; alvoSelecionado.has(id) ? alvoSelecionado.delete(id) : alvoSelecionado.add(id); btn.classList.toggle('selected'); E('btn-ptt').disabled = !alvoSelecionado.size; });
  }

  // ---- Intercom: áudio (WebSocket binário, PCM — ver crew-intercom-transport-ws.mjs) ----
  function conectarAudio() {
    ws?.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/api/crew/intercom/ws?member=${encodeURIComponent(membroId)}`);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => tocarPcm(ev.data);
    ws.onclose = () => setTimeout(() => { if (membroId) conectarAudio(); }, 2000); // reconexão automática real, celular pode perder wifi
  }
  // Decodifica o formato binário real de mixReturn (header 12 bytes: rate/channels/frames,
  // depois PCM float32 intercalado) e toca via Web Audio — sem nenhuma lib de terceiros.
  function tocarPcm(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength <= 12) return;
    const view = new DataView(buffer);
    const rate = view.getUint32(0, true), channels = view.getUint32(4, true), frames = view.getUint32(8, true);
    if (!rate || !channels || channels > 8 || frames * channels * 4 !== buffer.byteLength - 12) return;
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {}); // autoplay: só resolve depois de um gesto do usuário (o próprio toque no PTT já serve)
    const audioBuffer = audioCtx.createBuffer(channels, frames, rate);
    const floats = new Float32Array(buffer, 12);
    for (let ch = 0; ch < channels; ch++) { const data = audioBuffer.getChannelData(ch); for (let f = 0; f < frames; f++) data[f] = floats[f * channels + ch]; }
    const src = audioCtx.createBufferSource(); src.buffer = audioBuffer; src.connect(audioCtx.destination); src.start();
  }

  // ---- Intercom: PTT (push-to-talk) — mesmo padrão de talkback-rapido.js ----
  async function comando(action, data = {}) {
    const r = await fetch('/api/crew/intercom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, memberId: membroId, ...data }), signal: AbortSignal.timeout(5000) });
    const v = await r.json();
    if (!r.ok || !v.success) throw Error(v.error || 'Comando de Intercom recusado');
    return v;
  }
  let pttHeld = false, pttStarting = false;
  async function pttStart() {
    if (pttHeld || pttStarting || !alvoSelecionado.size) return;
    pttHeld = true; pttStarting = true;
    try {
      const r = await comando('ptt_start', { targets: [...alvoSelecionado] });
      pttLease = r.lease;
      if (!pttHeld) { pttStop(); return; }
      E('btn-ptt').classList.add('active'); E('btn-ptt').textContent = 'FALANDO';
      heartbeat = setInterval(async () => { if (!pttLease) return; try { await comando('ptt_ping', { lease: pttLease }); } catch { pttStop(); } }, 400);
    } catch (e) { pttStop(); erro(e.message); } finally { pttStarting = false; }
  }
  function pttStop() {
    pttHeld = false; clearInterval(heartbeat); heartbeat = null;
    E('btn-ptt').classList.remove('active'); E('btn-ptt').textContent = 'Segure para falar';
    const lease = pttLease; pttLease = null;
    if (lease) comando('ptt_stop', { lease }).catch(() => {});
  }
  const btn = E('btn-ptt');
  btn.addEventListener('pointerdown', (e) => { if (e.button !== 0 || btn.disabled) return; e.preventDefault(); btn.setPointerCapture(e.pointerId); pttStart(); });
  for (const evento of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(evento, pttStop);
  for (const evento of ['blur', 'pagehide']) window.addEventListener(evento, pttStop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pttStop(); });

  E('sel-membro').addEventListener('change', (e) => {
    membroId = e.target.value || null;
    if (membroId) iniciarParaMembro();
    else atualizarQrCrew();
  });

  // Renderiza quem está falando (com destaque para Diretor) quando o resumo muda:
  function renderFalando(ativos = []) {
    const lista = E('falando-lista');
    if (!lista) return;
    lista.innerHTML = ativos.map((a) => {
      const m = resumoIntercom.membros.find((x) => x.memberId === a.memberId);
      const nome = m?.name || a.memberId;
      const dir = a.role === 'director' || m?.role === 'director';
      return `<div class="crew-falando${dir ? ' director' : ''}">${dir ? '🔊 Diretor está falando: ' : '🎙️ '}${esc(nome)}</div>`;
    }).join('');
  }
  setInterval(async () => {
    if (!membroId) return;
    try {
      const r = await fetch('/api/crew/intercom', { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return;
      const d = await r.json();
      if (d?.success) { resumoIntercom = d; renderFalando(d.pttAtivos || []); }
    } catch { /* silencioso em oscilação de rede */ }
  }, 1000);

  detectarComputadorLocal();
  carregarMembros().catch((e) => erro(e.message));
})();
