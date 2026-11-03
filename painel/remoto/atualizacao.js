(() => {
  'use strict';
  const prefixo = document.currentScript?.dataset.prefixo || '';
  const E = (id) => document.getElementById(prefixo + id);
  let state = null, busy = false, instalando = false;
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(bytes < 10485760 ? 1 : 0) + ' MB';
  const nome = (v) => { const m = String(v || '').match(/^(\d+\.\d+\.\d+)(?:-(alpha|beta))?$/); return m ? (m[2] === 'alpha' ? 'Alpha ' : m[2] === 'beta' ? 'Beta ' : '') + m[1] : (v || ''); };
  function paint() {
    const s = state || {};
    E('status').textContent = s.message || 'Atualizações';
    const linhas = [s.currentVersion ? 'Instalado: ' + nome(s.currentVersion) : '', s.version ? 'Disponível: ' + nome(s.version) : '', s.status === 'available' ? 'Download: ' + mb(s.downloadBytes || 0) + ' (' + s.fileCount + ' arquivos conferidos)' : '', s.checkedAt ? 'Verificado em ' + new Date(s.checkedAt).toLocaleString() : '', s.lastResult?.message && s.lastResult.status !== 'installed' ? 'Última atualização: ' + s.lastResult.message : ''];
    E('details').textContent = linhas.filter(Boolean).join('\n');
    const notas = E('notas');
    if (notas) { const itens = (s.novidades || []).flatMap((v) => v.itens || []); notas.hidden = !itens.length; notas.replaceChildren(...itens.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; })); }
    const barra = E('progresso');
    if (barra) { const baixando = busy && s.downloadBytes > 0 && instalando; barra.hidden = !baixando; if (baixando) barra.value = Math.min(100, Math.round((s.receivedBytes || 0) * 100 / s.downloadBytes)); }
    const canal = E('canal');
    if (canal && s.channel && document.activeElement !== canal) canal.value = s.channel;
    for (const id of ['configure', 'disable', 'canal']) { if (E(id)) E(id).disabled = busy; }
    E('check').disabled = busy || !s.url;
    E('download').disabled = busy || !['available', 'downloaded'].includes(s.status);
  }
  async function command(action, data = {}) {
    busy = true; paint();
    try {
      const response = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
      const r = await response.json();
      if (!response.ok || !r.success) throw Error(r.error || 'Operação recusada');
      state = r.update;
    } catch (e) { state = { ...(state || {}), message: e.message }; } finally { busy = false; paint(); }
  }
  E('configure').onclick = () => command('update_configure', { url: E('feed').value.trim() || undefined });
  E('disable').onclick = async () => { await command('update_configure', { url: '' }); if (state?.status === 'unconfigured') E('feed').value = ''; };
  E('check').onclick = () => command('update_check');
  if (E('canal')) E('canal').onchange = () => command('update_configure', { channel: E('canal').value }).then(() => command('update_check'));
  E('download').onclick = () => {
    instalando = true;
    // Mostra o andamento enquanto baixa. Quando o programa fechar para aplicar, esta janela fecha com ele.
    const acompanha = setInterval(async () => { try { const d = await (await fetch('/api/update', { cache: 'no-store' })).json(); if (d.update) { state = { ...d.update }; paint(); } } catch { E('status').textContent = 'O 3Mix está reabrindo…'; } }, 1000);
    command('update_install').finally(() => { if (state?.status !== 'installing') { clearInterval(acompanha); instalando = false; } });
  };
  command('update_read').then(() => { if (E('feed') && state?.url && !state.url.startsWith('https://eddysangalli.github.io/3Mix/')) E('feed').value = state.url; });
})();
