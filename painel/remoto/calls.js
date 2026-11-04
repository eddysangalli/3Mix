// Calls window, laid out like the reference switcher's "Video Call" settings plus its call manager:
// calls 1 to 8, Host a call, Password / Copy link / Reset password, Return feed (to guest) video and audio, advanced
// options, the list of calls, and Prepare returns / Hold to talk / Call manager / Save and close.
// Every value shown is read from the engine and every button sends a real command. What the reference has and this
// program does not (connecting to someone else's call, per-call bandwidth, peer-to-peer only) is simply not here.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id), esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Lists are rewritten only when their content changes, so an open list or a half-made click is never thrown away.
  const fill = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
  const pick = (el, value) => { if (el.value !== String(value)) el.value = value; };
  const AUDIO = [['program', 'Master (sem a própria voz)'], ['custom', 'Escolher fontes de áudio'], ['silent', 'Somente talkback']];

  let selected = 0, busy = false, fresh = null, freshAt = 0, scope = null;
  const drafts = new Map();            // guest key -> return choices not applied yet
  let targetsSent = null;              // talkback destinations just saved, shown until the engine repeats them
  let held = false, starting = false, lease = null, pingTimer = null, pinging = false, holdEpoch = 0;

  const say = (text, kind = '') => { const box = E('msg'); box.textContent = text; box.className = 'vd-msg' + (kind ? ' vd-' + kind : ''); };
  const note = (text, kind) => { delete E('msg').dataset.auto; say(text, kind); };
  async function send(action, data = {}, { timeout = 60000, keepalive = false } = {}) {
    const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), keepalive, signal: AbortSignal.timeout(timeout) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok || v.success === false) throw Error(v.error || 'Operação recusada pelo programa');
    if (v.state?.calls) { fresh = v.state; freshAt = Date.now(); }
    return v;
  }
  // The answer of a command carries the new state; it is used until the shared connection delivers the same or newer.
  const engineState = () => { const live = window.FreeMixRemote?.getState?.() || {}; return fresh && Date.now() - freshAt < 3000 && fresh.preset === live.preset && (fresh.revision || 0) > (live.revision || 0) ? fresh : live; };
  const calls = () => engineState().calls || {}, guests = () => calls().guests || [], returns = () => calls().returns || [];
  const individual = () => calls().capability === 'individual-PCM-WebRTC';
  const label = (g) => g.person?.name || (engineState().inputs || []).find((i) => (g.entries || []).includes(i.key))?.name || String(g.name).replace(/ \(fonte\)$/, '');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---- return choices of one guest: what the engine has saved, plus what was changed here and not applied ----
  const savedRoute = (g) => { const r = g.route || {}; return { video: r.video || 'program', audio: r.audio || 'program', gain: Number(r.gain ?? 1), audioSources: r.audio === 'custom' ? [...(r.audioSources || [])].sort() : [] }; };
  const current = (g) => ({ ...savedRoute(g), ...(drafts.get(g.key) || {}) });
  function edit(g, change) { const base = savedRoute(g), next = { ...(drafts.get(g.key) || {}), ...change }; for (const k of Object.keys(next)) if (same(next[k], base[k])) delete next[k]; if (Object.keys(next).length) drafts.set(g.key, next); else drafts.delete(g.key); }
  async function apply(g) { const c = current(g); await send('call_return_route', { key: g.key, video: c.video, audio: c.audio, gain: c.gain, audioSources: c.audio === 'custom' ? c.audioSources : [] }); drafts.delete(g.key); }
  const audioChoices = (g) => (calls().audioChoices || []).filter((a) => a.key !== g.key && a.key !== calls().director?.key);
  const videoName = (key) => (key === 'program' ? 'Saída (programa)' : (engineState().inputs || []).find((i) => i.key === key)?.name || 'Entrada removida');
  const audioName = (mode) => (mode === 'silent' ? 'Somente talkback' : mode === 'custom' ? 'Fontes escolhidas' : 'Master sem a própria voz');

  // ---- talkback: the microphone stays open only while the button is held and the engine keeps hearing from us ----
  const targets = () => (targetsSent && Date.now() < targetsSent.until ? targetsSent.value : calls().rapidTargets ?? null);
  const targetKeys = () => { const t = targets(); return t === null ? guests().map((g) => g.key) : t; };
  function talkReason() {
    const c = calls(), keys = targetKeys();
    if (!engineState().connected) return 'Sem conexão com o programa.';
    if (!guests().length) return 'Nenhuma chamada criada.';
    if (!c.director) return 'Falta o microfone do diretor: escolha em “Mostrar opções avançadas”.';
    if (!c.nativeWatchdog) return 'Este programa não tem o fechamento automático do microfone.';
    if (!keys.length) return 'Marque pelo menos um convidado em “Talkback para”.';
    if (keys.some((k) => !guests().some((g) => g.key === k))) return 'A seleção de talkback contém uma chamada removida. Escolha de novo.';
    if (!individual()) return 'Clique em Preparar retornos para poder falar com os convidados.';
    if (keys.some((k) => !returns().some((r) => r.key === k && r.publisher === 'publishing'))) return 'Aguardando o retorno dos convidados ficar pronto.';
    if (c.talking && !lease && !starting) return 'O diretor está falando por outro controle.';
    return '';
  }
  function stopTalk() {
    held = false; holdEpoch++; clearInterval(pingTimer); pingTimer = null;
    const b = E('talk'); b.classList.remove('vd-air', 'vd-warn'); b.setAttribute('aria-pressed', 'false'); b.textContent = 'Segure para falar';
    const old = lease; lease = null;
    if (old) send('call_talk_stop', { lease: old }, { timeout: 2000, keepalive: true }).catch((e) => note(e.message, 'error'));
  }
  async function startTalk() {
    if (held || starting || busy) return;
    const reason = talkReason(); if (reason) { note(reason, 'error'); return; }
    held = true; starting = true; const epoch = ++holdEpoch, keys = [...targetKeys()], b = E('talk');
    b.classList.add('vd-warn'); b.textContent = 'Abrindo microfone…';
    try {
      const opened = (await send('call_talk_start', { targets: keys }, { timeout: 8000 })).call?.lease;
      if (!opened) throw Error('O programa não confirmou o microfone aberto.');
      if (!held || epoch !== holdEpoch) { await send('call_talk_stop', { lease: opened }, { timeout: 2000 }); return; }
      lease = opened; b.classList.remove('vd-warn'); b.classList.add('vd-air'); b.setAttribute('aria-pressed', 'true'); b.textContent = 'FALANDO · solte para parar';
      pingTimer = setInterval(async () => { if (pinging || !lease) return; const mine = lease; pinging = true; try { await send('call_talk_ping', { lease: mine }, { timeout: 2000 }); } catch (e) { if (lease === mine) { stopTalk(); note(e.message, 'error'); } } finally { pinging = false; } }, 350);
    } catch (e) { if (epoch === holdEpoch) { stopTalk(); note(e.message, 'error'); } } finally { starting = false; draw(); }
  }

  // ---- drawing ----
  function draw() {
    const st = engineState(), c = calls(), list = guests(), active = document.activeElement;
    if (scope !== (st.preset || '')) { if (scope !== null) { drafts.clear(); targetsSent = null; stopTalk(); } scope = st.preset || ''; }
    for (const key of [...drafts.keys()]) if (!list.some((g) => g.key === key)) drafts.delete(key);
    if (targetsSent && (Date.now() > targetsSent.until || same(c.rapidTargets ?? null, targetsSent.value))) targetsSent = null;
    const free = list.length < 8 ? list.length : -1;       // the first empty slot is where a new call can be hosted
    if (selected > list.length || (selected === list.length && free < 0)) selected = Math.max(0, list.length - 1);
    const g = list[selected] || null, r = g ? returns().find((x) => x.key === g.key) : null, cur = g ? current(g) : null, changed = !!g && drafts.has(g.key), off = busy || !st.connected;

    for (const b of E('nums').children) { const i = Number(b.dataset.n), x = list[i]; b.disabled = off || (!x && i !== free); b.textContent = !x && i === free ? '+' : String(i + 1); b.classList.toggle('vd-on', i === selected); b.classList.toggle('vd-live', !!x?.connected); b.setAttribute('aria-selected', i === selected); b.title = x ? label(x) + (x.connected ? ' · convidado conectado' : '') : i === free ? 'Livre: hospedar uma nova chamada' : 'Livre'; }
    const slot = g ? g.key : 'new';
    if (E('name').dataset.slot !== slot) { E('name').dataset.slot = slot; E('name').value = g ? label(g) : ''; } else if (g) E('name').value = label(g);
    E('name').readOnly = !!g; E('name').disabled = !g && off; E('name').placeholder = g ? '' : 'Nome da nova chamada (opcional)';
    E('host').classList.toggle('vd-on', !!g); E('host').disabled = off || (!g && free < 0);
    E('password').value = g ? g.id : ''; E('copy').disabled = off || !g; E('reset').disabled = off || !g;
    E('link').textContent = !g ? '' : g.returnStream ? g.guest : 'Clique em Copiar Link e envie o link ao convidado: ele abre no celular ou no computador.';
    E('link').title = g?.returnStream ? 'Link do convidado' : '';

    const inputs = (st.inputs || []).filter((i) => !g || !(g.entries || []).includes(i.key));
    fill(E('video'), !g ? '' : `<option value="program">${esc(videoName('program'))}</option>` + inputs.map((i) => `<option value="${esc(i.key)}">${esc(i.name)}</option>`).join('') + (cur.video !== 'program' && !inputs.some((i) => i.key === cur.video) ? `<option value="${esc(cur.video)}" disabled>Entrada indisponível · escolha outra</option>` : ''));
    fill(E('audio'), !g ? '' : AUDIO.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join(''));
    if (g) { pick(E('video'), cur.video); pick(E('audio'), cur.audio); }
    E('video').disabled = E('audio').disabled = off || !g;
    E('custom-row').hidden = !g || cur.audio !== 'custom';
    if (g && cur.audio === 'custom') { const choices = audioChoices(g), on = new Set(cur.audioSources); fill(E('sources'), choices.map((a) => `<label class="vd-check"><input type="checkbox" value="${esc(a.key)}"${on.has(a.key) ? ' checked' : ''}${off ? ' disabled' : ''}> ${esc(a.name)}</label>`).join('') + cur.audioSources.filter((k) => !choices.some((a) => a.key === k)).map((k) => `<label class="vd-check"><input type="checkbox" value="${esc(k)}" checked${off ? ' disabled' : ''}> Fonte indisponível (desmarque)</label>`).join('') || '<span class="vd-note">Nenhuma fonte de áudio na mesa.</span>'); }
    E('apply').disabled = off || !changed; E('apply').classList.toggle('vd-warn', changed && !off);
    E('conference').checked = c.conference !== false; E('conference').disabled = off || !list.length;

    // Advanced options
    if (E('voice-proc')) {
      const p = g?.processing || {};
      for (const cb of E('voice-proc').querySelectorAll('input[data-proc]')) {
        cb.checked = !!p[cb.dataset.proc];
        cb.disabled = off || !g;
      }
      if (E('proc-podcast')) {
        const allOn = !!(g && p.gate && p.compressor && p.agc && p.limiter);
        E('proc-podcast').disabled = off || !g;
        E('proc-podcast').classList.toggle('vd-on', allOn);
      }
    }
    if (active !== E('gain')) E('gain').value = g ? Math.round(cur.gain * 100) : ''; E('gain').disabled = off || !g;
    E('reconnect').disabled = off || !g || !individual();
    const mics = (st.audioInputs || []).filter((i) => ['wasapi_input_capture', 'ffmpeg_source'].includes(i.kind));
    fill(E('mic'), mics.map((i) => `<option value="${esc(i.name)}"${c.director?.name === i.name ? ' selected' : ''}>${esc(i.name)}</option>`).join('') || '<option value="">Nenhum microfone na mesa</option>');
    E('mic').disabled = off || !mics.length; E('mic-use').disabled = off || !mics.length; E('mic-create').disabled = off;
    E('mic-status').textContent = c.director ? 'Em uso: ' + c.director.name + ' · fica fora do Master, do fone e das gravações.' : 'Nenhum microfone do diretor escolhido.';
    const t = targets(), keys = new Set(targetKeys());
    pick(E('talk-mode'), t === null ? 'all' : 'selected'); E('talk-mode').disabled = off || held || starting || !list.length;
    E('targets').closest('.vd-row').hidden = t === null;
    fill(E('targets'), list.map((x) => `<label class="vd-check"><input type="checkbox" value="${esc(x.key)}"${keys.has(x.key) ? ' checked' : ''}${off || held || starting ? ' disabled' : ''}> ${esc(label(x))}</label>`).join(''));
    const reason = talkReason();
    E('talk-status').textContent = held && lease ? (t === null ? 'Microfone aberto para todos os convidados.' : 'Microfone aberto só para os convidados marcados.') : reason || (t === null ? 'Pronto (todos os convidados): segure o botão “Segure para falar” (ou Ctrl+Espaço).' : 'Pronto (convidados marcados): segure o botão “Segure para falar” (ou Ctrl+Espaço).');
    E('ice-import').disabled = E('ice-reset').disabled = off;
    E('ice-status').textContent = c.ice?.configured ? `TURN configurado · ${c.ice.servers} servidor(es) · ${c.ice.transportPolicy}` : 'Rede automática';
    const d = r?.diagnostics;
    E('diag').textContent = !g ? '—' : d ? `${d.ice || 'sem ICE'} · ${d.transport || 'sem transporte'} · RTT ${d.rttMs == null ? '—' : Math.round(d.rttMs) + ' ms'} · fila ${Math.round(d.queuedMs || 0)} ms` : 'Sem diagnóstico: o retorno deste convidado não está conectado.';
    E('limit').textContent = typeof c.videoReturnLimit === 'string' ? 'Vídeo do retorno — ' + c.videoReturnLimit : '';

    // Call manager
    fill(E('rows'), list.map((x, i) => { const y = returns().find((v) => v.key === x.key), s = savedRoute(x);
      const state = y?.error ? `<span class="vd-air-text" title="${esc(y.error)}">ERRO</span>` : x.connected ? '<span class="vd-ok-text">CONECTADO</span>' : y?.publisher === 'publishing' ? 'Retorno pronto · aguardando o convidado' : individual() ? 'Preparando o retorno…' : 'Retorno não preparado';
      return `<tr data-i="${i}" class="${i === selected ? 'vd-sel' : ''}"><td>${i + 1}</td><td>${esc(label(x))}</td><td>${esc(videoName(s.video))}</td><td>${esc(audioName(s.audio))}</td><td>${state}${drafts.has(x.key) ? ' · <span class="vd-note">não aplicado</span>' : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="vd-note">Nenhuma chamada. Clique em Hospedar chamada para criar a primeira.</td></tr>');

    // Bottom bar
    const live = individual();
    E('returns').textContent = live ? 'Parar retornos' : 'Preparar retornos'; E('returns').classList.toggle('vd-air', live); E('returns').disabled = off || (!live && !list.length);
    E('returns').title = live ? 'Para de enviar vídeo e áudio de retorno aos convidados' : 'Liga o vídeo e o áudio de retorno de cada convidado';
    if (!held && !starting) { E('talk').classList.toggle('vd-dim', !!reason); E('talk').title = reason || 'Segure para falar só com os convidados (não vai para o programa)'; }
    E('save-close').disabled = busy;
    if (!E('msg').textContent || E('msg').dataset.auto) {
      const text = !st.connected ? 'Sem conexão com o programa.' : !g ? (free < 0 ? '' : 'Dê um nome (opcional) e clique em Hospedar chamada.') : r?.error ? 'Retorno deste convidado: ' + r.error : changed ? 'Alterações ainda não aplicadas: clique em Aplicar.' : g.connected ? 'Convidado conectado, recebendo o retorno.' : r?.publisher === 'publishing' ? 'Retorno pronto. Aguardando o convidado entrar pelo link.' : live ? 'Preparando o retorno deste convidado…' : 'Envie o link ao convidado e clique em Preparar retornos para ele ver e ouvir o programa.';
      say(text, r?.error || !st.connected ? 'error' : ''); E('msg').dataset.auto = '1';
    }
  }

  async function run(what, task) {
    if (busy) return; stopTalk(); busy = true; note(what + '…'); draw();
    try { const done = await task(); note(done || 'Confirmado pelo programa.', 'ok'); } catch (e) { note(e.message, 'error'); } finally { busy = false; E('targets')._html = null; draw(); }
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* no clipboard permission in this window: fall back to the selection */ }
    const box = document.createElement('textarea'); box.value = text; box.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(box); box.select();
    try { return document.execCommand('copy'); } catch { return false; } finally { box.remove(); }
  }
  const selectedGuest = () => guests()[selected] || null;

  // ---- events ----
  E('nums').onclick = (e) => { const b = e.target.closest('button'); if (busy || !b || b.disabled) return; selected = Number(b.dataset.n); E('msg').dataset.auto = '1'; say(''); draw(); };
  E('rows').onclick = (e) => { const tr = e.target.closest('tr[data-i]'); if (busy || !tr) return; selected = Number(tr.dataset.i); E('msg').dataset.auto = '1'; say(''); draw(); };
  E('host').onclick = () => { if (selectedGuest()) { note('Esta chamada já está hospedada: envie o link ao convidado. Para criar outra, clique no próximo número livre.'); return; }
    run('Criando a chamada', async () => { const made = (await send('call_create', { name: E('name').value.trim() })).call; const at = guests().findIndex((x) => x.name === made?.source); if (at >= 0) selected = at; return `Chamada “${made?.created}” criada na mesa. Copie o link e envie ao convidado.`; }); };
  E('copy').onclick = () => { const g = selectedGuest(); if (!g) return;
    run('Copiando o link', async () => { const link = g.returnStream ? g.guest : (await send('call_link', { key: g.key })).call?.guest; if (!link) throw Error('O programa não informou o link.'); if (!(await copyText(link))) throw Error('Não foi possível copiar sozinho: selecione o link abaixo da senha e copie com Ctrl+C.'); return 'Link copiado. Envie ao convidado.'; }); };
  E('reset').onclick = () => { const g = selectedGuest(); if (!g || !confirm(`Redefinir a senha de “${label(g)}”?\n\nO link antigo deixa de funcionar e o convidado precisa receber o novo.`)) return;
    run('Redefinindo a senha', async () => { await send('call_reset_password', { key: g.key }); return 'Senha redefinida. Copie o link novo e envie ao convidado.'; }); };
  E('video').onchange = (e) => { const g = selectedGuest(); if (g) edit(g, { video: e.target.value }); E('msg').dataset.auto = '1'; draw(); };
  E('audio').onchange = (e) => { const g = selectedGuest(); if (g) edit(g, { audio: e.target.value, ...(e.target.value === 'custom' ? {} : { audioSources: [] }) }); E('msg').dataset.auto = '1'; draw(); };
  E('sources').onchange = () => { const g = selectedGuest(); if (g) edit(g, { audioSources: [...E('sources').querySelectorAll('input:checked')].map((x) => x.value).sort() }); E('msg').dataset.auto = '1'; draw(); };
  E('gain').onchange = (e) => { const g = selectedGuest(), v = Number(e.target.value); if (g && Number.isFinite(v) && v >= 0 && v <= 200) edit(g, { gain: v / 100 }); E('msg').dataset.auto = '1'; draw(); };
  E('apply').onclick = () => { const g = selectedGuest(); if (g) run('Aplicando o retorno', async () => { await apply(g); return `Retorno de “${label(g)}” salvo no programa.`; }); };
  E('conference').onchange = (e) => { const enabled = e.target.checked; run('Atualizando', async () => { await send('call_conference', { enabled }); return enabled ? 'Os convidados ouvem uns aos outros.' : 'Os convidados não ouvem uns aos outros.'; }); };
  E('show-advanced').onchange = (e) => { E('advanced').hidden = !e.target.checked; };
  if (E('voice-proc')) {
    E('voice-proc').onchange = (e) => {
      const cb = e.target.closest('input[data-proc]');
      const g = selectedGuest();
      if (!cb || !g) return;
      const filter = cb.dataset.proc, enabled = cb.checked;
      run(`${enabled ? 'Ligando' : 'Desligando'} ${filter.toUpperCase()}`, async () => {
        await send('call_audio_processing', { key: g.key, filter, enabled });
        return `Processamento ${filter.toUpperCase()} ${enabled ? 'ligado' : 'desligado'} em “${label(g)}”.`;
      });
    };
  }
  if (E('proc-podcast')) {
    E('proc-podcast').onclick = () => {
      const g = selectedGuest();
      if (!g) return;
      const p = g.processing || {};
      const allOn = !!(p.gate && p.compressor && p.agc && p.limiter);
      const enabled = !allOn;
      run(`${enabled ? 'Ativando' : 'Desativando'} Preset Podcast`, async () => {
        await send('call_audio_processing', { key: g.key, preset: 'podcast', enabled });
        return `Preset Podcast (Gate + Compressor + AGC + Limiter) ${enabled ? 'ativado' : 'desativado'} em “${label(g)}”.`;
      });
    };
  }
  E('reconnect').onclick = () => { const g = selectedGuest(); if (g) run('Reconectando', async () => { await send('call_reconnect', { key: g.key }); return `Reconexão do retorno de “${label(g)}” pedida.`; }); };
  E('mic-use').onclick = () => { const input = E('mic').value; if (input) run('Preparando o microfone', async () => { await send('call_director', { input }); return 'Microfone do diretor: ' + input + '.'; }); };
  E('mic-create').onclick = () => run('Criando o microfone', async () => { await send('call_director_create'); return 'Microfone privado criado com o dispositivo padrão do Windows.'; });
  const saveTargets = (value) => run('Salvando quem ouve o talkback', async () => { await send('call_rapid_targets', { targets: value }); targetsSent = { value, until: Date.now() + 2500 }; return value === null ? 'Talkback para todos os convidados.' : 'Talkback só para os convidados marcados.'; });
  E('talk-mode').onchange = (e) => saveTargets(e.target.value === 'all' ? null : guests().map((g) => g.key));
  E('targets').onchange = () => { if (targets() !== null) saveTargets([...E('targets').querySelectorAll('input:checked')].map((x) => x.value)); };
  E('ice-import').onclick = () => { E('ice-file').value = ''; E('ice-file').click(); };
  E('ice-file').onchange = () => { const file = E('ice-file').files[0]; if (file) run('Importando a rede', async () => { if (file.size > 16384) throw Error('O arquivo TURN passa de 16 KB.'); let doc; try { doc = JSON.parse(await file.text()); } catch { throw Error('O arquivo TURN não é um JSON válido.'); } await send('call_ice_import', { document: doc }); return 'Rede TURN salva. Clique em Preparar retornos de novo.'; }); };
  E('ice-reset').onclick = () => run('Voltando à rede automática', async () => { await send('call_ice_reset'); return 'Rede automática. Clique em Preparar retornos de novo.'; });
  E('returns').onclick = () => { const live = individual(); run(live ? 'Parando os retornos' : 'Preparando os retornos', async () => { if (live) { await send('call_returns_stop'); return 'Retornos parados.'; } for (const g of guests()) if (drafts.has(g.key)) await apply(g); await send('call_returns_prepare'); return 'Retornos ligados. Cada convidado vê e ouve o que está na lista abaixo.'; }); };
  E('manager').onclick = () => { E('status').hidden = !E('status').hidden; E('manager').classList.toggle('vd-on', !E('status').hidden); document.querySelector('.vd-window').classList.toggle('vd-with-status', !E('status').hidden); };
  E('save-close').onclick = () => run('Salvando', async () => { for (const g of guests()) if (drafts.has(g.key)) await apply(g); setTimeout(() => window.FreeMixClosePanel(), 150); return 'Tudo salvo no programa.'; });

  E('talk').onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); try { E('talk').setPointerCapture(e.pointerId); } catch { /* a pointer that cannot be captured still talks */ } startTalk(); };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) E('talk').addEventListener(name, stopTalk);
  E('talk').onkeydown = (e) => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!e.repeat) startTalk(); } };
  E('talk').onkeyup = (e) => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); stopTalk(); } };
  document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.code === 'Space' && !e.repeat && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) { e.preventDefault(); startTalk(); } });
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && held) stopTalk(); });
  window.addEventListener('blur', stopTalk); window.addEventListener('pagehide', stopTalk); document.addEventListener('visibilitychange', () => { if (document.hidden) stopTalk(); });

  setInterval(() => { if (!document.hidden) draw(); }, 500);
  E('msg').dataset.auto = '1'; draw();
})();
