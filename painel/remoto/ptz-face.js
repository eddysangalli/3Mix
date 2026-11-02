// Face Tracker dentro do console PTZ: usa o mesmo filtro e a mesma confirmação da antiga aba de Efeitos.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  if (!E('face-input') || !window.FreeMixEffectsGate) return;
  const gate = window.FreeMixEffectsGate;
  let ocupado = false, disponivel = false;

  async function ler(key) {
    const r = await fetch('/api/effects' + (key ? '?key=' + encodeURIComponent(key) : ''), { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (!r.ok || !d.success) throw Error(d.error || 'Motor indisponível');
    gate.observe(d.effects);
    return d.effects;
  }

  function botoes() {
    const liberado = disponivel && !!E('face-input').value && !ocupado && !gate.blocked;
    E('face-start').disabled = !liberado;
    E('face-stop').disabled = !liberado;
    E('face-input').disabled = gate.blocked;
  }

  async function carregar() {
    if (ocupado || gate.blocked) return;
    try {
      const atual = E('face-input').value, s = await ler(atual);
      disponivel = !!s.capabilities?.ptz;
      const lista = s.ptzTargets || [], no = E('face-input');
      if (no.options.length !== lista.length) {
        no.replaceChildren(...lista.map((row) => new Option(row.name, row.key)));
        if (lista.some((row) => row.key === atual)) no.value = atual;
        if (no.value !== atual) return carregar();
      }
      const f = s.details?.ptz;
      if (f) {
        E('face-address').value = f.filterSettings['ptz.visca-over-tcp.address'] || '';
        E('face-port').value = f.filterSettings['ptz.visca-over-tcp.port'] || 1259;
        E('face-z').value = f.filterSettings.track_z ?? 0.25;
        E('face-x').value = f.filterSettings.track_x ?? 0;
        E('face-y').value = f.filterSettings.track_y ?? 0;
      }
      E('face-status').textContent = !disponivel ? 'Plugin de rastreamento indisponível nesta instalação.' : f ? 'Rastreamento ligado nesta fonte.' : '';
    } catch (e) { E('face-status').textContent = e.message; }
    botoes();
  }

  async function enviar(intent) {
    if (ocupado || gate.blocked) return;
    ocupado = true; botoes();
    try {
      const r = await gate.mutate('effects_ptz', intent);
      if (r?.confirmed !== true && r?.removed !== true && r?.success !== true) throw Error('O motor não confirmou');
    } catch (e) { E('face-status').textContent = e.message; }
    ocupado = false;
    await carregar();
  }

  E('face-input').onchange = carregar;
  E('face-start').onclick = () => enviar({ key: E('face-input').value, enabled: true, settings: { address: E('face-address').value, port: Number(E('face-port').value), track_z: Number(E('face-z').value), track_x: Number(E('face-x').value), track_y: Number(E('face-y').value) } });
  E('face-stop').onclick = () => enviar({ key: E('face-input').value, enabled: false });
  gate.subscribe?.(botoes);
  botoes();
  carregar();
})();
