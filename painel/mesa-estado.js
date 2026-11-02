// Faixa de estado da mesa: o que está rolando agora. Cinza parado, vermelho no ar. Só leitura.
(() => {
  'use strict';
  const faixa = document.getElementById('estado-ar');
  if (!faixa) return;
  const LOCAL = window.MESA_LOCAL || {};
  const base = LOCAL.replayUrl ? new URL(LOCAL.replayUrl).origin : location.protocol === 'file:' ? 'http://127.0.0.1:8088' : location.origin;
  const ler = async (rota) => { const r = await fetch(base + rota, { cache: 'no-store', signal: AbortSignal.timeout(2500) }); if (!r.ok) throw Error(String(r.status)); return r.json(); };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tempo = (v) => String(v || '').slice(0, 8);

  const ITENS = [
    ['rec', 'REC'], ['iso', 'ISO'], ['replay', 'REPLAY'], ['stream', 'AO VIVO'], ['saidas', 'SAÍDAS'], ['vcam', 'CÂM. VIRTUAL'], ['retornos', 'RETORNOS'],
  ];
  const ESTADO = {};
  faixa.innerHTML = ITENS.map(([id, nome]) => `<span class="ea" data-ea="${id}"><i></i><b>${esc(nome)}</b><em></em></span>`).join('');

  function marcar(id, ligado, detalhe, dica) {
    const no = faixa.querySelector(`[data-ea="${id}"]`);
    no.classList.toggle('on', !!ligado);
    const em = no.querySelector('em');
    const texto = ligado ? (detalhe || '') : '';
    if (em.textContent !== texto) em.textContent = texto;
    no.title = dica;
  }

  function saidasAtivas(o) {
    const lista = [];
    for (const [i, d] of (o?.destinations || []).entries()) if (d?.active) lista.push(d.name || 'Destino ' + (i + 2));
    for (const [nome, cap] of [['NDI', o?.ndi], ['OMT', o?.omt]]) for (const s of cap?.senders || []) if (s.active ?? s.outputActive) lista.push(nome + ' ' + (s.networkName || Number(s.senderId ?? 0) + 1));
    if (o?.sdi?.active) lista.push('SDI');
    return lista;
  }

  async function geral() {
    try {
      const s = await ler('/api/json');
      faixa.classList.toggle('sem-motor', s.connected !== true);
      Object.assign(ESTADO, { s });
      marcar('rec', s.recording, tempo(s.recordTimecode), s.recording ? 'Gravando' : 'Gravação parada');
      marcar('stream', s.streaming, tempo(s.streamTimecode), s.streaming ? 'Transmitindo' : 'Transmissão parada');
      marcar('iso', s.iso?.rec, s.iso?.session?.cams?.length ? String(s.iso.session.cams.length) : '', s.iso?.rec ? 'MultiGravação ativa' : 'MultiGravação parada');
      marcar('replay', s.replay?.rec, '', s.replay?.rec ? 'Replay gravando' : 'Replay parado');
      const retornos = Number(s.returnFeeds?.activeFeedsCount) || 0;
      marcar('retornos', retornos > 0, String(retornos), retornos ? retornos + ' retorno(s) ativo(s)' : 'Retornos parados');
    } catch {
      faixa.classList.add('sem-motor');
    }
  }
  async function saidas() {
    try {
      const v = await ler('/api/outputs');
      const lista = saidasAtivas(v.outputs);
      marcar('saidas', lista.length > 0, String(lista.length), lista.length ? 'Ativas: ' + lista.join(', ') : 'Saídas externas paradas');
    } catch { /* mantém a última leitura */ }
  }
  async function camera() {
    try {
      const v = await ler('/api/settings');
      const on = !!v.settings?.virtualCamera;
      marcar('vcam', on, '', on ? 'Câmera virtual ligada' : 'Câmera virtual parada');
    } catch { /* mantém a última leitura */ }
  }

  // Fechou com erro e ainda não foi relatado: aparece uma vez, até abrir o relato ou gerar o pacote.
  async function erroUltimaSessao() {
    try {
      const d = await ler('/api/diagnostics');
      if (!d.crashPendente || localStorage.getItem('3mix.crashVisto') === d.ultimoCrash) return;
      const aviso = document.createElement('button');
      aviso.type = 'button';
      aviso.className = 'ea on';
      aviso.dataset.ea = 'erro';
      aviso.title = 'Abrir o relato de problema';
      aviso.innerHTML = '<i></i><b>ERRO NA ÚLTIMA SESSÃO</b>';
      aviso.onclick = async () => {
        localStorage.setItem('3mix.crashVisto', d.ultimoCrash);
        aviso.remove();
        try {
          const r = await fetch(base + '/api/panel-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route: '/sobre.html' }), signal: AbortSignal.timeout(6000) });
          if ((await r.json()).success === true) return;
        } catch { /* fora do programa */ }
        window.open(base + '/sobre.html', '_blank', 'noopener');
      };
      faixa.append(aviso);
    } catch { /* outro computador ou motor fechado */ }
  }

  const passo = (fn, ms) => { fn(); setInterval(() => { if (!document.hidden) fn(); }, ms); };
  passo(geral, 1000);
  passo(saidas, 3000);
  passo(camera, 5000);
  erroUltimaSessao();
})();
