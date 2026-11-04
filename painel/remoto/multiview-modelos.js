// Multiview: modelos prontos e leitura/gravação das montagens. A tela de montagem e a janela do Multiview usam este arquivo.
(() => {
  'use strict';
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const TAMANHO = { horizontal: [1920, 1080], vertical: [1080, 1920] };

  const tile = (tipo, x, y, w, h, formato = '16:9', extra = {}) => ({ id: uid('t'), tipo, entrada: '', x, y, w, h, formato, ajuste: 'preencher', nome: true, vu: true, ...extra });
  const relogio = (x, y, w, h) => tile('relogio', x, y, w, h, 'livre', { relogio: { modo: 'hora', fuso: 0, ate: '', titulo: '' } });
  const grade = (x0, y0, w, h, cols, rows, formato = '16:9') => {
    const lista = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lista.push(tile('auto', x0 + c * w, y0 + r * h, w, h, formato));
    return lista;
  };

  // Todo monitor de 16:9 ou 9:16 abaixo tem a proporção exata; relógio em faixa é "livre".
  const VW = 1080 * 9 / 16; // 9:16 na altura inteira do monitor horizontal
  const MODELOS = [
    { id: 'h-2-8', nome: 'Programa, Preview e 8', monitor: 'horizontal', tiles: () => [tile('preview', 0, 0, 960, 540), tile('programa', 960, 0, 960, 540), ...grade(0, 540, 480, 270, 4, 2)] },
    { id: 'h-2-12', nome: 'Programa, Preview, 12 e relógio', monitor: 'horizontal', tiles: () => [tile('preview', 0, 0, 960, 540), tile('programa', 960, 0, 960, 540), ...grade(0, 540, 320, 180, 6, 2), relogio(0, 900, 1920, 180)] },
    { id: 'h-1-5', nome: 'Programa grande e 5', monitor: 'horizontal', tiles: () => [tile('programa', 0, 0, 1280, 720), tile('preview', 1280, 0, 640, 360), tile('auto', 1280, 360, 640, 360), ...grade(0, 720, 640, 360, 3, 1)] },
    { id: 'h-4', nome: '4 iguais', monitor: 'horizontal', tiles: () => grade(0, 0, 960, 540, 2, 2) },
    { id: 'h-6', nome: '6 iguais', monitor: 'horizontal', tiles: () => grade(0, 0, 640, 540, 3, 2) },
    { id: 'h-8', nome: '8 iguais', monitor: 'horizontal', tiles: () => grade(0, 0, 480, 540, 4, 2) },
    { id: 'h-9', nome: '9 iguais', monitor: 'horizontal', tiles: () => grade(0, 0, 640, 360, 3, 3) },
    { id: 'h-10', nome: '10 iguais', monitor: 'horizontal', tiles: () => grade(0, 0, 384, 540, 5, 2) },
    { id: 'h-12', nome: '12 iguais', monitor: 'horizontal', tiles: () => grade(0, 0, 480, 360, 4, 3) },
    { id: 'h-16', nome: '16 iguais', monitor: 'horizontal', tiles: () => grade(0, 0, 480, 270, 4, 4) },
    { id: 'h-24', nome: '24 iguais', monitor: 'horizontal', tiles: () => grade(0, 0, 320, 270, 6, 4) },
    { id: 'h-v', nome: 'Vídeos verticais em monitor horizontal', monitor: 'horizontal', tiles: () => [tile('preview', 48.75, 0, VW, 1080, '9:16'), tile('programa', 48.75 + VW, 0, VW, 1080, '9:16'), ...grade(48.75 + VW * 2, 0, VW / 2, 540, 2, 2, '9:16')] },
    { id: 'v-empilhado', nome: 'Vídeos horizontais empilhados', monitor: 'vertical', tiles: () => [tile('programa', 0, 0, 1080, 607.5), tile('preview', 0, 607.5, 1080, 607.5), ...grade(0, 1215, 540, 303.75, 2, 2), relogio(0, 1822.5, 1080, 97.5)] },
    { id: 'v-1-4', nome: 'Programa horizontal e 8', monitor: 'vertical', tiles: () => [tile('programa', 0, 0, 1080, 607.5), ...grade(0, 607.5, 540, 303.75, 2, 4), relogio(0, 1822.5, 1080, 97.5)] },
    { id: 'v-916', nome: 'Vídeos verticais', monitor: 'vertical', tiles: () => [tile('preview', 0, 0, 540, 960, '9:16'), tile('programa', 540, 0, 540, 960, '9:16'), ...grade(0, 960, 270, 480, 4, 2, '9:16')] },
  ];

  const novaMontagem = (nome = 'Principal', modelo = 'h-2-8') => {
    const m = MODELOS.find((x) => x.id === modelo) || MODELOS[0];
    return { id: uid('m'), nome, monitor: m.monitor, guias: false, tiles: m.tiles() };
  };

  const CHAVE = '3mix.multiview.montagens';
  const lerLocal = () => { try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; } };

  async function carregar() {
    try {
      const r = await fetch('/api/multiview-montagens', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (r.ok) { const v = await r.json(); if (v.montagens?.montagens?.length) return v.montagens; }
    } catch { /* usa a cópia deste computador */ }
    const local = lerLocal();
    if (local?.montagens?.length) return local;
    const m = novaMontagem();
    return { ativa: m.id, montagens: [m] };
  }

  async function salvar(dados) {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { /* sem armazenamento local */ }
    const r = await fetch('/api/multiview-montagens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ montagens: dados }), signal: AbortSignal.timeout(5000) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok || v.success === false) throw Error(v.error || 'O 3Mix não salvou a montagem');
    return v.montagens;
  }

  // Lista da mesa, sem os itens internos do motor.
  const entradas = (state) => (state?.inputs || []).filter((i) => i?.name && i.name !== '3Mix Barramentos' && !String(i.name).startsWith('3Mix Slot '));
  // Entrada só de áudio tem fonte sem imagem (0 x 0): pode ser escolhida à mão, mas não ocupa monitor sozinha.
  const temImagem = (i) => {
    const fontes = i.health?.sources;
    if (!Array.isArray(fontes)) return true;
    const proprias = fontes.filter((f) => f.kind !== 'scene');
    return !proprias.length || proprias.some((f) => Number(f.width) > 0);
  };
  const entradasAuto = (state) => entradas(state).filter((i) => !/^PGM M\/E \d+$/.test(i.name) && !/^REPLAY [AB]$/.test(i.name) && temImagem(i));

  function textoRelogio(r, state) {
    const modo = r?.modo || 'hora';
    const tc = (v) => String(v || '00:00:00').slice(0, 8);
    if (modo === 'gravacao') return { texto: tc(state?.recordTimecode), ativo: !!state?.recording, titulo: r?.titulo || 'Gravação' };
    if (modo === 'transmissao') return { texto: tc(state?.streamTimecode), ativo: !!state?.streaming, titulo: r?.titulo || 'Transmissão' };
    const agora = new Date();
    if (modo === 'contagem') {
      const [h, m] = String(r?.ate || '').split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return { texto: '--:--:--', ativo: false, titulo: r?.titulo || 'Contagem' };
      const alvo = new Date(agora); alvo.setHours(h, m, 0, 0);
      const s = Math.floor((alvo - agora) / 1000), abs = Math.abs(s), p = (n) => String(n).padStart(2, '0');
      return { texto: (s < 0 ? '+' : '') + p(Math.floor(abs / 3600)) + ':' + p(Math.floor(abs / 60) % 60) + ':' + p(abs % 60), ativo: s < 0, titulo: r?.titulo || 'Até ' + r.ate };
    }
    const fuso = Number(r?.fuso) || 0;
    return { texto: new Date(agora.getTime() + fuso * 3600000).toTimeString().slice(0, 8), ativo: false, titulo: r?.titulo || (fuso ? 'Hora ' + (fuso > 0 ? '+' : '') + fuso : '') };
  }

  window.MV3 = { TAMANHO, MODELOS, novaMontagem, tile, relogio, uid, carregar, salvar, entradas, entradasAuto, textoRelogio };
})();
