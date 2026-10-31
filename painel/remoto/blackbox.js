// 3Mix · Caixa-Preta de Incidentes (Blackbox) — lógica preservada da página
// original: /api/blackbox (GET resumo + POST action:'blackbox_mark' com note),
// anotação do operador, histórico de incidentes, snapshots e atualização
// periódica de 3 s. Os IDs e handlers originais são mantidos
// (val-buffer / val-samples / val-snapshots / incident-note /
// btn-trigger-snapshot / incidents-body / fetchBlackbox / renderBlackbox / bbData).
let bbData = null;

async function fetchBlackbox() {
  try {
    const res = await fetch('/api/blackbox');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    bbData = data;
    renderBlackbox();
  } catch (err) {
    console.error('Falha ao obter dados da blackbox:', err);
  }
}

function bbEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderBlackbox() {
  if (!bbData) return;
  // summary() real do IncidentBlackboxEngine: bufferLength, bufferMaxSeconds,
  // recentIncidentsCount, recentIncidents (mais recente primeiro).
  const bufferMax = bbData.bufferMaxSeconds ?? 60;
  const samples = bbData.bufferLength ?? 0;
  const history = bbData.incidentHistory || bbData.recentIncidents || [];

  document.getElementById('val-buffer').innerText = bufferMax + 's';
  document.getElementById('val-samples').innerText = samples;
  document.getElementById('val-snapshots').innerText = bbData.recentIncidentsCount ?? history.length;

  const foot = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value; };
  foot('foot-buffer', bufferMax + 's');
  foot('foot-samples', String(samples));
  foot('foot-snapshots', String(bbData.recentIncidentsCount ?? history.length));

  const tbody = document.getElementById('incidents-body');
  if (!history.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="bb-empty">Nenhum incidente registrado ainda. A caixa-preta está gravando o buffer silenciosamente.</td></tr>';
    return;
  }

  tbody.innerHTML = history.map((inc) => {
    const quando = new Date(inc.timestamp || inc.date || Date.now());
    const anotacao = (inc.details && inc.details.note) || inc.reason || inc.note || 'Gravação manual do operador';
    return `
      <tr>
        <td><b>${bbEsc(quando.toLocaleDateString('pt-BR'))} ${bbEsc(quando.toLocaleTimeString('pt-BR'))}</b></td>
        <td><code>${bbEsc(inc.incidentId || inc.id || 'INC')}</code></td>
        <td><span class="bb-trigger">${bbEsc(inc.trigger || 'MANUAL_OPERATOR_MARK')}</span></td>
        <td>${bbEsc(anotacao)}</td>
        <td><span class="bb-saved">✔ SALVO</span></td>
      </tr>
    `;
  }).join('');
}

function bbStatus(mensagem, tone) {
  const el = document.getElementById('bb-status');
  if (!el) return;
  el.textContent = mensagem;
  el.dataset.tone = tone || '';
}

document.getElementById('btn-trigger-snapshot').addEventListener('click', async () => {
  const note = document.getElementById('incident-note').value.trim() || 'Incidente registrado manualmente';
  const botao = document.getElementById('btn-trigger-snapshot');
  botao.disabled = true;
  try {
    const res = await fetch('/api/blackbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'blackbox_mark', note })
    });
    const d = await res.json();
    if (!res.ok || d.success === false) throw new Error(d.error || ('HTTP ' + res.status));
    bbStatus(`Snapshot gravado com sucesso! Arquivo: ${d.result?.savedPath || 'salvo em logs/incidents/'}`, 'ok');
    document.getElementById('incident-note').value = '';
    fetchBlackbox();
  } catch (err) {
    bbStatus('Erro ao registrar snapshot: ' + err.message, 'err');
  } finally {
    botao.disabled = false;
  }
});

/* Nome do projeto (mesma rota usada pelas janelas Áudio/Retornos). */
async function bbLerProjeto() {
  try {
    const res = await fetch('/api/json', { signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    const nome = data && data.preset ? String(data.preset) : '';
    if (nome && document.getElementById('project-name')) document.getElementById('project-name').textContent = nome;
  } catch { /* chip permanece “—” até a API responder */ }
}

fetchBlackbox();
bbLerProjeto();
setInterval(fetchBlackbox, 3000);
