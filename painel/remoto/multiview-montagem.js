// Tela de montagem do Multiview: escolhe o formato do monitor e o que aparece em cada posição. Não mostra vídeo; o vídeo
// fica na janela do Multiview, que acompanha a montagem salva aqui. Cada alteração é salva sozinha.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const M = window.MV3;
  const RATIO = { '16:9': 16 / 9, '9:16': 9 / 16 };
  const TIPO_NOME = { programa: 'Programa', preview: 'Preview', auto: 'Automático', relogio: 'Relógio', vazio: 'Vazio' };
  const MODO_NOME = { hora: 'Hora', gravacao: 'Tempo de gravação', transmissao: 'Tempo de transmissão', contagem: 'Contagem até um horário' };

  let dados = null, atual = null, sel = null, estado = {}, escala = 1, timer = null, arraste = null;
  const pilha = [];

  const montagem = () => dados.montagens.find((m) => m.id === atual) || dados.montagens[0];
  const tamanho = () => M.TAMANHO[montagem().monitor];
  const tileSel = () => montagem().tiles.find((t) => t.id === sel) || null;
  const redondo = (v) => Math.round(v * 100) / 100;

  // ---- salvar ----
  function status(texto, erro = false) { E('mm-status').textContent = texto; E('mm-status').classList.toggle('err', erro); }
  function agendar() {
    status('');
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await M.salvar(dados); status('Salvo'); }
      catch (e) { status(e.message, true); }
    }, 400);
  }
  const lembrar = () => { pilha.push(JSON.stringify({ dados, atual })); if (pilha.length > 60) pilha.shift(); E('mm-desfazer').disabled = false; };
  function mudar(fn) { lembrar(); fn(); agendar(); desenhar(); }

  // ---- texto de cada monitor ----
  function rotulo(t) {
    if (t.tipo === 'entrada') return t.entrada || 'Sem entrada';
    if (t.tipo === 'relogio') return t.relogio?.titulo || MODO_NOME[t.relogio?.modo] || 'Relógio';
    return TIPO_NOME[t.tipo] || t.tipo;
  }
  function autoNome(t) {
    if (t.tipo !== 'auto') return '';
    const i = montagem().tiles.filter((x) => x.tipo === 'auto').indexOf(t);
    return M.entradasAuto(estado)[i]?.name || 'sem entrada';
  }

  // ---- palco ----
  function ajustarPalco() {
    if (!dados) return;
    const palco = E('mm-stage'), [W, H] = tamanho();
    const livreW = palco.clientWidth - 24, livreH = palco.clientHeight - 24;
    if (livreW <= 0 || livreH <= 0) return;
    escala = Math.min(livreW / W, livreH / H);
    E('mm-canvas').style.width = Math.floor(W * escala) + 'px';
    E('mm-canvas').style.height = Math.floor(H * escala) + 'px';
  }
  const pct = (v, total) => (v / total * 100) + '%';
  function posicionar(no, t) {
    const [W, H] = tamanho();
    no.style.left = pct(t.x, W); no.style.top = pct(t.y, H); no.style.width = pct(t.w, W); no.style.height = pct(t.h, H);
  }
  function desenharPalco() {
    const box = E('mm-canvas');
    box.innerHTML = montagem().tiles.map((t) => {
      const sub = t.tipo === 'auto' ? autoNome(t) : t.formato === 'livre' ? '' : t.formato;
      return `<div class="t ${esc(t.tipo)}${t.id === sel ? ' sel' : ''}" data-id="${esc(t.id)}"><b>${esc(rotulo(t))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}<i class="h nw" data-h="nw"></i><i class="h ne" data-h="ne"></i><i class="h sw" data-h="sw"></i><i class="h se" data-h="se"></i></div>`;
    }).join('');
    box.querySelectorAll('.t').forEach((no) => posicionar(no, montagem().tiles.find((t) => t.id === no.dataset.id)));
  }

  // ---- barra ----
  function desenharBarra() {
    E('mm-lista').innerHTML = dados.montagens.map((m) => `<option value="${esc(m.id)}"${m.id === atual ? ' selected' : ''}>${esc(m.nome)}</option>`).join('');
    document.querySelectorAll('[data-monitor]').forEach((b) => b.classList.toggle('selected', b.dataset.monitor === montagem().monitor));
    E('mm-modelo').innerHTML = '<option value="">Escolher…</option>' + M.MODELOS.filter((x) => x.monitor === montagem().monitor).map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('');
  }

  // ---- propriedades ----
  function campoNumero(id, nome, valor) { return `<label class="p3-field">${nome}<input id="${id}" type="number" step="10" value="${redondo(valor)}"></label>`; }
  function desenharPainel() {
    const box = E('mm-panel'), t = tileSel(), m = montagem();
    if (!t) {
      box.innerHTML = `<h2>Montagem</h2>
        <label class="p3-field">Nome<input id="p-nome" maxlength="60" value="${esc(m.nome)}" spellcheck="false"></label>
        <label class="p3-check"><input id="p-guias" type="checkbox"${m.guias ? ' checked' : ''}> Guias de área segura</label>
        <div class="acoes"><button type="button" id="p-excluir-montagem" class="danger"${dados.montagens.length < 2 ? ' disabled' : ''}>Excluir montagem</button></div>
        <p class="p3-note">Clique num monitor para editar.</p>`;
      return;
    }
    const valor = t.tipo === 'entrada' ? 'e:' + t.entrada : t.tipo;
    const lista = M.entradas(estado), faltando = t.tipo === 'entrada' && t.entrada && !lista.some((i) => i.name === t.entrada);
    const relogio = t.relogio || { modo: 'hora', fuso: 0, ate: '', titulo: '' };
    box.innerHTML = `<h2>${esc(rotulo(t))}</h2>
      <label class="p3-field">O que mostra
        <select id="p-tipo">
          <option value="programa"${valor === 'programa' ? ' selected' : ''}>Programa</option>
          <option value="preview"${valor === 'preview' ? ' selected' : ''}>Preview</option>
          <option value="auto"${valor === 'auto' ? ' selected' : ''}>Automático (ordem da mesa)</option>
          <option value="relogio"${valor === 'relogio' ? ' selected' : ''}>Relógio</option>
          <option value="vazio"${valor === 'vazio' ? ' selected' : ''}>Vazio</option>
          <optgroup label="Entradas">
            ${faltando ? `<option value="e:${esc(t.entrada)}" selected>${esc(t.entrada)} · ausente</option>` : ''}
            ${lista.map((i) => `<option value="e:${esc(i.name)}"${valor === 'e:' + i.name ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}
          </optgroup>
        </select>
      </label>
      ${t.tipo === 'relogio' ? `
        <label class="p3-field">Relógio
          <select id="p-modo">${Object.entries(MODO_NOME).map(([k, n]) => `<option value="${k}"${relogio.modo === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
        </label>
        ${relogio.modo === 'hora' ? `<label class="p3-field">Diferença de fuso (horas)<input id="p-fuso" type="number" min="-14" max="14" value="${Number(relogio.fuso) || 0}"></label>` : ''}
        ${relogio.modo === 'contagem' ? `<label class="p3-field">Horário<input id="p-ate" type="time" value="${esc(relogio.ate)}"></label>` : ''}
        <label class="p3-field">Título<input id="p-titulo" maxlength="40" value="${esc(relogio.titulo)}" spellcheck="false"></label>` : ''}
      <div class="p3-field">Formato do monitor
        <div class="mm-seg fmt" role="group">${['16:9', '9:16', 'livre'].map((f) => `<button type="button" data-formato="${f}" class="${t.formato === f ? 'selected' : ''}">${f === 'livre' ? 'Livre' : f}</button>`).join('')}</div>
      </div>
      ${['relogio', 'vazio'].includes(t.tipo) ? '' : `<div class="p3-field">Imagem
        <div class="mm-seg fmt" role="group"><button type="button" data-ajuste="preencher" class="${t.ajuste !== 'caber' ? 'selected' : ''}">Preencher</button><button type="button" data-ajuste="caber" class="${t.ajuste === 'caber' ? 'selected' : ''}">Inteira</button></div>
      </div>
      <div class="p3-row">
        <label class="p3-check"><input id="p-mostra-nome" type="checkbox"${t.nome !== false ? ' checked' : ''}> Nome</label>
        <label class="p3-check"><input id="p-mostra-vu" type="checkbox"${t.vu !== false ? ' checked' : ''}> Áudio</label>
      </div>`}
      <div class="pos">${campoNumero('p-x', 'X', t.x)}${campoNumero('p-y', 'Y', t.y)}${campoNumero('p-w', 'Largura', t.w)}${campoNumero('p-h', 'Altura', t.h)}</div>
      <div class="acoes">
        <button type="button" id="p-duplicar" class="small">Duplicar</button>
        <button type="button" id="p-frente" class="small">Para frente</button>
        <button type="button" id="p-remover" class="small danger">Remover</button>
      </div>`;
  }
  function sincronizarPosicao(t) {
    for (const [id, v] of [['p-x', t.x], ['p-y', t.y], ['p-w', t.w], ['p-h', t.h]]) { const c = E(id); if (c && document.activeElement !== c) c.value = redondo(v); }
  }
  function desenhar() { desenharBarra(); ajustarPalco(); desenharPalco(); desenharPainel(); }

  // ---- geometria ----
  function encaixar(t) {
    const [W, H] = tamanho();
    const r = RATIO[t.formato];
    t.w = Math.min(W, Math.max(60, t.w));
    if (r) {
      t.h = t.w / r;
      if (t.h > H) { t.h = H; t.w = H * r; }
    } else t.h = Math.min(H, Math.max(40, t.h));
    t.x = Math.min(W - t.w, Math.max(0, t.x));
    t.y = Math.min(H - t.h, Math.max(0, t.y));
  }
  // Encosta nas bordas do monitor e nos outros monitores; fora disso anda de 10 em 10.
  function imas(eixo, t) {
    const [W, H] = tamanho(), total = eixo === 'x' ? W : H, lista = [0, total, total / 2];
    for (const o of montagem().tiles) if (o.id !== t.id) lista.push(eixo === 'x' ? o.x : o.y, eixo === 'x' ? o.x + o.w : o.y + o.h);
    return lista;
  }
  function imantar(valor, eixo, t, tamanhoLado = 0) {
    let melhor = Math.round(valor / 10) * 10, dist = 14;
    for (const alvo of imas(eixo, t)) {
      for (const c of tamanhoLado ? [alvo, alvo - tamanhoLado] : [alvo]) {
        const d = Math.abs(c - valor);
        if (d < dist) { dist = d; melhor = c; }
      }
    }
    return melhor;
  }

  // ---- arrastar ----
  E('mm-canvas').addEventListener('pointerdown', (e) => {
    const no = e.target.closest('.t');
    if (!no) { if (sel) { sel = null; desenharPalco(); desenharPainel(); } return; }
    const t = montagem().tiles.find((x) => x.id === no.dataset.id);
    if (sel !== t.id) { sel = t.id; desenharPalco(); desenharPainel(); }
    arraste = { t, canto: e.target.dataset.h || '', x0: e.clientX, y0: e.clientY, x: t.x, y: t.y, w: t.w, h: t.h, moveu: false, antes: JSON.stringify({ dados, atual }) };
    E('mm-canvas').setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  E('mm-canvas').addEventListener('pointermove', (e) => {
    if (!arraste) return;
    const { t, canto } = arraste, [W, H] = tamanho();
    const dx = (e.clientX - arraste.x0) / escala, dy = (e.clientY - arraste.y0) / escala;
    if (Math.abs(dx) + Math.abs(dy) > 1) arraste.moveu = true;
    if (!canto) {
      t.x = Math.min(W - t.w, Math.max(0, imantar(arraste.x + dx, 'x', t, t.w)));
      t.y = Math.min(H - t.h, Math.max(0, imantar(arraste.y + dy, 'y', t, t.h)));
    } else {
      const direita = canto.includes('e'), baixo = canto.includes('s'), r = RATIO[t.formato];
      const fimX = arraste.x + arraste.w, fimY = arraste.y + arraste.h;
      let w = direita ? imantar(fimX + dx, 'x', t) - arraste.x : fimX - imantar(arraste.x + dx, 'x', t);
      let h = baixo ? imantar(fimY + dy, 'y', t) - arraste.y : fimY - imantar(arraste.y + dy, 'y', t);
      const maxW = direita ? W - arraste.x : fimX, maxH = baixo ? H - arraste.y : fimY;
      w = Math.max(120, Math.min(maxW, w));
      h = Math.max(60, Math.min(maxH, h));
      if (r) { h = w / r; if (h > maxH) { h = maxH; w = h * r; } }
      t.w = w; t.h = h;
      t.x = direita ? arraste.x : fimX - w;
      t.y = baixo ? arraste.y : fimY - h;
    }
    const no = E('mm-canvas').querySelector(`[data-id="${CSS.escape(t.id)}"]`);
    if (no) posicionar(no, t);
    sincronizarPosicao(t);
  });
  const soltar = () => {
    if (!arraste) return;
    if (arraste.moveu) { pilha.push(arraste.antes); E('mm-desfazer').disabled = false; agendar(); }
    arraste = null;
  };
  E('mm-canvas').addEventListener('pointerup', soltar);
  E('mm-canvas').addEventListener('pointercancel', soltar);

  // ---- barra: ações ----
  E('mm-lista').addEventListener('change', (e) => { atual = e.target.value; dados.ativa = atual; sel = null; agendar(); desenhar(); });
  E('mm-nova').addEventListener('click', () => mudar(() => {
    const m = M.novaMontagem('Montagem ' + (dados.montagens.length + 1), montagem().monitor === 'vertical' ? 'v-empilhado' : 'h-2-8');
    dados.montagens.push(m); atual = m.id; dados.ativa = m.id; sel = null;
  }));
  document.querySelectorAll('[data-monitor]').forEach((b) => b.addEventListener('click', () => {
    if (montagem().monitor === b.dataset.monitor) return;
    mudar(() => {
      // Troca o formato da tela mantendo o que o operador escolheu mostrar, na mesma ordem.
      const m = montagem(), antigos = m.tiles, modelo = M.MODELOS.find((x) => x.monitor === b.dataset.monitor);
      m.monitor = b.dataset.monitor;
      m.tiles = modelo.tiles();
      const video = (t) => !['relogio', 'vazio'].includes(t.tipo), origem = antigos.filter(video), destino = m.tiles.filter(video);
      destino.forEach((t, i) => { if (origem[i]) { t.tipo = origem[i].tipo; t.entrada = origem[i].entrada; } });
      sel = null;
    });
  }));
  E('mm-modelo').addEventListener('change', (e) => {
    const modelo = M.MODELOS.find((x) => x.id === e.target.value);
    if (modelo) mudar(() => { montagem().tiles = modelo.tiles(); sel = null; });
  });
  E('mm-add-monitor').addEventListener('click', () => mudar(() => {
    const novo = M.tile('auto', 0, 0, 480, 270);
    montagem().tiles.push(novo); sel = novo.id;
  }));
  E('mm-add-relogio').addEventListener('click', () => mudar(() => {
    const novo = M.relogio(0, 0, 480, 135);
    montagem().tiles.push(novo); sel = novo.id;
  }));
  E('mm-desfazer').addEventListener('click', () => {
    const volta = pilha.pop();
    if (!volta) return;
    ({ dados, atual } = JSON.parse(volta));
    sel = null;
    E('mm-desfazer').disabled = !pilha.length;
    agendar(); desenhar();
  });

  // ---- propriedades: ações ----
  const painel = E('mm-panel');
  painel.addEventListener('click', (e) => {
    const t = tileSel(), b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'p-excluir-montagem') return mudar(() => { dados.montagens = dados.montagens.filter((m) => m.id !== atual); atual = dados.montagens[0].id; dados.ativa = atual; });
    if (!t) return;
    if (b.dataset.formato) return mudar(() => { t.formato = b.dataset.formato; encaixar(t); });
    if (b.dataset.ajuste) return mudar(() => { t.ajuste = b.dataset.ajuste; });
    if (b.id === 'p-duplicar') return mudar(() => { const c = { ...structuredClone(t), id: M.uid('t'), x: t.x + 40, y: t.y + 40 }; encaixar(c); montagem().tiles.push(c); sel = c.id; });
    if (b.id === 'p-frente') return mudar(() => { const l = montagem().tiles; l.splice(l.indexOf(t), 1); l.push(t); });
    if (b.id === 'p-remover') return mudar(() => { montagem().tiles = montagem().tiles.filter((x) => x.id !== t.id); sel = null; });
  });
  painel.addEventListener('change', (e) => {
    const c = e.target, t = tileSel();
    if (c.id === 'p-guias') return mudar(() => { montagem().guias = c.checked; });
    if (c.id === 'p-nome') return mudar(() => { montagem().nome = c.value.trim() || montagem().nome; });
    if (!t) return;
    if (c.id === 'p-tipo') return mudar(() => {
      if (c.value.startsWith('e:')) { t.tipo = 'entrada'; t.entrada = c.value.slice(2); }
      else {
        t.tipo = c.value; t.entrada = '';
        if (t.tipo === 'relogio') { t.relogio = t.relogio || { modo: 'hora', fuso: 0, ate: '', titulo: '' }; t.formato = 'livre'; }
      }
    });
    if (c.id === 'p-modo') return mudar(() => { t.relogio.modo = c.value; });
    if (c.id === 'p-fuso') return mudar(() => { t.relogio.fuso = Number(c.value) || 0; });
    if (c.id === 'p-ate') return mudar(() => { t.relogio.ate = c.value; });
    if (c.id === 'p-titulo') return mudar(() => { t.relogio.titulo = c.value; });
    if (c.id === 'p-mostra-nome') return mudar(() => { t.nome = c.checked; });
    if (c.id === 'p-mostra-vu') return mudar(() => { t.vu = c.checked; });
    if (['p-x', 'p-y', 'p-w', 'p-h'].includes(c.id)) return mudar(() => { t[{ 'p-x': 'x', 'p-y': 'y', 'p-w': 'w', 'p-h': 'h' }[c.id]] = Number(c.value) || 0; encaixar(t); });
  });

  // ---- teclado ----
  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { E('mm-desfazer').click(); e.preventDefault(); return; }
    const t = tileSel();
    if (!t) return;
    if (e.key === 'Delete') { mudar(() => { montagem().tiles = montagem().tiles.filter((x) => x.id !== t.id); sel = null; }); return; }
    const passo = e.shiftKey ? 50 : 10, seta = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    if (seta) { e.preventDefault(); mudar(() => { t.x += seta[0]; t.y += seta[1]; encaixar(t); }); }
  });

  // ---- entradas da mesa ----
  async function lerEstado() {
    try {
      const r = await fetch('/api/json', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!r.ok) return;
      const novo = await r.json(), antes = JSON.stringify(M.entradas(estado).map((i) => i.name));
      estado = novo;
      if (antes !== JSON.stringify(M.entradas(estado).map((i) => i.name)) && !arraste && !painel.contains(document.activeElement)) { desenharPalco(); desenharPainel(); }
    } catch { /* continua com a lista anterior */ }
  }

  new ResizeObserver(() => ajustarPalco()).observe(E('mm-stage'));
  (async () => {
    dados = await M.carregar();
    atual = dados.ativa && dados.montagens.some((m) => m.id === dados.ativa) ? dados.ativa : dados.montagens[0].id;
    await lerEstado();
    desenhar();
    setInterval(lerEstado, 3000);
  })();
})();
