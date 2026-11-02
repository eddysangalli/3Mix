'use strict';

let matrixData = null;
let productionState = null;
let isConnected = false;

const E = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function fetchMatrix() {
  try {
    const res = await fetch('/api/aux-routing');
    if (!res.ok) throw new Error('Falha ao obter matriz AUX');
    const data = await res.json();
    updateConnectionStatus(true);
    if (data.success && data.matrix) {
      matrixData = data.matrix;
      renderAll();
    }
  } catch (e) {
    updateConnectionStatus(false);
    console.error('Erro ao buscar matriz AUX:', e);
  }
}

// A escolha fica no AUX mesmo quando uma saída recusa; o operador precisa saber o que não mudou.
function avisarNaoAplicado(data) {
  let aviso = E('aux-aviso');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'aux-aviso';
    aviso.setAttribute('role', 'alert');
    aviso.style.cssText = 'margin:8px 12px;padding:8px 10px;border:1px solid #ff3038;border-radius:3px;background:#3a1416;color:#ffd7d9;font-size:12px';
    document.body.prepend(aviso);
  }
  const falhas = (data.cut?.applied || data.applied || []).filter((a) => a.status === 'failed');
  aviso.hidden = !falhas.length;
  aviso.textContent = falhas.length ? 'Sinal não trocado em ' + falhas.map((a) => a.targetId.replace('dest_', 'Saída ')).join(', ') + ': a saída está no ar. Pare a saída, troque o sinal e inicie de novo.' : '';
}

async function sendCommand(payload) {
  try {
    const res = await fetch('/api/aux-routing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert('Erro: ' + (data.error || 'Falha no comando'));
      return;
    }
    avisarNaoAplicado(data);
    if (data.matrix) {
      matrixData = data.matrix;
      renderAll();
    } else {
      await fetchMatrix();
    }
  } catch (e) {
    alert('Erro de comunicação: ' + e.message);
  }
}

function renderAll() {
  renderAuxGrid();
  renderOutputTable();
}

function renderAuxGrid() {
  const container = E('aux-grid');
  if (!container || !matrixData || !Array.isArray(matrixData.buses)) return;

  const inputs = productionState?.inputs || [];

  container.innerHTML = matrixData.buses.map(bus => {
    const isPgm = bus.sourceType === 'program';
    const isPvw = bus.sourceType === 'preview';
    const isClean = bus.sourceType === 'clean';
    const isMv = bus.sourceType === 'multiview';
    const isMix2 = bus.sourceType === 'mix' && bus.sourceId === '2';
    const isMix3 = bus.sourceType === 'mix' && bus.sourceId === '3';
    const isMix4 = bus.sourceType === 'mix' && bus.sourceId === '4';

    const boundChips = (bus.boundOutputs || []).map(o => 
      `<span class="output-chip">${esc(o.name || o.targetId)}</span>`
    ).join('') || '<span style="font-size:10px;color:#64748b;">Nenhuma saída vinculada</span>';

    const inputButtons = inputs.map(inp => {
      const isSelected = bus.sourceType === 'input' && bus.sourceId === inp.key;
      return `<button class="btn-input-cut ${isSelected ? 'active' : ''}" 
        data-aux="${esc(bus.id)}" 
        data-action="cut_input" 
        data-uuid="${esc(inp.key)}" 
        data-name="${esc(inp.name)}" 
        title="${esc(inp.name)}">
        ${esc(inp.number || inp.name.slice(0, 10))}
      </button>`;
    }).join('');

    return `
      <div class="aux-card" data-aux="${esc(bus.id)}">
        <div class="aux-header">
          <div class="aux-title">
            <span>${esc(bus.name || bus.id.toUpperCase())}</span>
          </div>
          <span class="badge-tag" style="font-size:10px;color:${bus.active ? '#10b981' : '#64748b'};">
            ${bus.active ? '● ATIVO' : '○ STANDBY'}
          </span>
        </div>

        <div class="aux-source-banner">
          <div>
            <div class="source-label">Fonte Selecionada</div>
            <div class="source-val">
              <span class="badge-src ${esc(bus.sourceType)}">${esc(bus.sourceType)}</span>
              <span>${esc(bus.sourceName || '—')}</span>
            </div>
          </div>
          <span style="font-size:11px;color:#94a3b8;font-weight:700;">${esc(bus.format || '16:9')}</span>
        </div>

        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;">Corte Rápido (Quick Cut)</div>
        <div class="cut-matrix">
          <button class="btn-cut ${isPgm ? 'active' : ''}" data-aux="${esc(bus.id)}" data-action="cut_src" data-type="program">PGM</button>
          <button class="btn-cut ${isPvw ? 'active' : ''}" data-aux="${esc(bus.id)}" data-action="cut_src" data-type="preview">PVW</button>
          <button class="btn-cut ${isClean ? 'active' : ''}" data-aux="${esc(bus.id)}" data-action="cut_src" data-type="clean">CLEAN</button>
          <button class="btn-cut ${isMv ? 'active' : ''}" data-aux="${esc(bus.id)}" data-action="cut_src" data-type="multiview">MULTIVIEW</button>
          <button class="btn-cut ${isMix2 ? 'active' : ''}" data-aux="${esc(bus.id)}" data-action="cut_mix" data-mix="2">MIX 2</button>
          <button class="btn-cut ${isMix3 ? 'active' : ''}" data-aux="${esc(bus.id)}" data-action="cut_mix" data-mix="3">MIX 3</button>
          <button class="btn-cut ${isMix4 ? 'active' : ''}" data-aux="${esc(bus.id)}" data-action="cut_mix" data-mix="4">MIX 4</button>
          <button class="btn-cut" data-aux="${esc(bus.id)}" data-action="toggle_active" style="background:#1e293b;border-color:#334155;">
            ${bus.active ? 'DESATIVAR' : 'ATIVAR'}
          </button>
        </div>

        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;">Entradas Diretas da Mesa</div>
        <div class="inputs-matrix">
          ${inputButtons || '<span style="font-size:10px;color:#64748b;padding:4px;">Nenhuma entrada ativa</span>'}
        </div>

        <div class="aux-meta-row">
          <div class="aux-meta-col">
            <label>Áudio Vinculado</label>
            <select data-aux="${esc(bus.id)}" data-action="set_audio">
              <option value="master" ${bus.audioBus === 'master' ? 'selected' : ''}>Master Áudio</option>
              <option value="busA" ${bus.audioBus === 'busA' ? 'selected' : ''}>Bus A</option>
              <option value="busB" ${bus.audioBus === 'busB' ? 'selected' : ''}>Bus B</option>
              <option value="follow_video" ${bus.audioBus === 'follow_video' ? 'selected' : ''}>Seguir Vídeo</option>
            </select>
          </div>
          <div class="aux-meta-col">
            <label>Proporção</label>
            <select data-aux="${esc(bus.id)}" data-action="set_format">
              <option value="16:9" ${bus.format === '16:9' ? 'selected' : ''}>16:9 Horizontal</option>
              <option value="9:16" ${bus.format === '9:16' ? 'selected' : ''}>9:16 Vertical</option>
              <option value="1:1" ${bus.format === '1:1' ? 'selected' : ''}>1:1 Quadrado</option>
              <option value="passthrough" ${bus.format === 'passthrough' ? 'selected' : ''}>Passthrough</option>
            </select>
          </div>
        </div>

        <div>
          <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Saídas Vinculadas a este AUX</div>
          <div class="bound-outputs-tags">
            ${boundChips}
          </div>
        </div>
      </div>
    `;
  }).join('');

  attachAuxListeners();
}

function attachAuxListeners() {
  document.querySelectorAll('[data-action="cut_src"]').forEach(btn => {
    btn.onclick = () => {
      sendCommand({
        action: 'cut',
        auxId: btn.dataset.aux,
        sourceType: btn.dataset.type
      });
    };
  });

  document.querySelectorAll('[data-action="cut_mix"]').forEach(btn => {
    btn.onclick = () => {
      sendCommand({
        action: 'cut',
        auxId: btn.dataset.aux,
        sourceType: 'mix',
        mixId: Number(btn.dataset.mix)
      });
    };
  });

  document.querySelectorAll('[data-action="cut_input"]').forEach(btn => {
    btn.onclick = () => {
      sendCommand({
        action: 'cut',
        auxId: btn.dataset.aux,
        sourceType: 'input',
        sourceId: btn.dataset.uuid,
        sourceName: btn.dataset.name
      });
    };
  });

  document.querySelectorAll('[data-action="toggle_active"]').forEach(btn => {
    btn.onclick = () => {
      const bus = matrixData.buses.find(b => b.id === btn.dataset.aux);
      if (bus) {
        sendCommand({
          action: 'configure',
          auxId: bus.id,
          active: !bus.active
        });
      }
    };
  });

  document.querySelectorAll('select[data-action="set_audio"]').forEach(sel => {
    sel.onchange = () => {
      sendCommand({
        action: 'configure',
        auxId: sel.dataset.aux,
        audioBus: sel.value
      });
    };
  });

  document.querySelectorAll('select[data-action="set_format"]').forEach(sel => {
    sel.onchange = () => {
      sendCommand({
        action: 'configure',
        auxId: sel.dataset.aux,
        format: sel.value
      });
    };
  });
}

function renderOutputTable() {
  const tbody = E('matrix-tbody');
  if (!tbody || !matrixData || !Array.isArray(matrixData.outputs)) return;

  const buses = matrixData.buses || [];

  tbody.innerHTML = matrixData.outputs.map(out => {
    const boundBus = buses.find(b => b.id === out.auxId);
    const sourceText = boundBus ? `${boundBus.sourceType.toUpperCase()} (${boundBus.sourceName || '—'})` : 'Direto';

    const busOptions = buses.map(b => 
      `<option value="${esc(b.id)}" ${out.auxId === b.id ? 'selected' : ''}>${esc(b.name || b.id)}</option>`
    ).join('');

    return `
      <tr>
        <td style="font-weight:700;color:#38bdf8;">${esc(out.targetId)}</td>
        <td style="font-weight:600;">${esc(out.name)}</td>
        <td>
          <span class="badge-tag" style="background:#0f172a;">${esc(out.boundType || 'aux').toUpperCase()}</span>
        </td>
        <td>
          <select class="btn-cut" style="padding:4px 8px;font-size:11px;" data-target="${esc(out.targetId)}" data-action="route_change">
            ${busOptions}
          </select>
        </td>
        <td>
          <span class="badge-src ${esc(boundBus?.sourceType || 'program')}" style="padding:2px 6px;font-size:10px;">
            ${esc(sourceText)}
          </span>
        </td>
        <td>
          <button class="btn-action" data-target="${esc(out.targetId)}" data-action="route_quick_pvw">Roteia AUX 2</button>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('select[data-action="route_change"]').forEach(sel => {
    sel.onchange = () => {
      sendCommand({
        action: 'route',
        targetId: sel.dataset.target,
        boundType: 'aux',
        auxId: sel.value
      });
    };
  });

  document.querySelectorAll('[data-action="route_quick_pvw"]').forEach(btn => {
    btn.onclick = () => {
      sendCommand({
        action: 'route',
        targetId: btn.dataset.target,
        boundType: 'aux',
        auxId: 'aux2'
      });
    };
  });
}

function updateConnectionStatus(connected) {
  isConnected = connected;
  const dot = E('dot');
  const text = E('conn-text');
  if (dot) dot.classList.toggle('connected', connected);
  if (text) text.textContent = connected ? 'Ao Vivo' : 'Desconectado';
}

function initWebSocket() {
  // A matriz AUX é lida por /api/aux-routing; não depende de um cliente WebSocket
  // separado. O polling mantém o estado atualizado sem duplicar a conexão da mesa.
}

E('btn-refresh').onclick = () => fetchMatrix();
E('btn-reset').onclick = () => {
  if (confirm('Deseja restaurar as configurações padrão da matriz AUX?')) {
    sendCommand({ action: 'reset' });
  }
};

window.addEventListener('DOMContentLoaded', () => {
  fetchMatrix();
  initWebSocket();
  setInterval(() => {
    if (!document.hidden) fetchMatrix();
  }, 3000);
});
