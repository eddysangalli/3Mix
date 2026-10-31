// FreeMix MultiView Broadcast Controller
(function() {
  'use strict';

  let ws = null;
  let activeLayout = 'horizontal_16_9_standard';
  let safeZonesActive = true;
  let state = {
    program: 'CAM 1',
    preview: 'CAM 2',
    inputs: [],
    inputsHealth: {},
    meters: {}
  };

  const stage = document.getElementById('multiview-stage');
  const clockEl = document.getElementById('mv-clock');
  const wsStatusEl = document.getElementById('ws-status');

  // Relógio Broadcast UTC/Local
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toTimeString().split(' ')[0];
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Conexão WebSocket com Auto-Reconnect
  function connectWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${location.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (wsStatusEl) {
          wsStatusEl.textContent = 'ONLINE';
          wsStatusEl.className = 'status-badge online';
        }
        // Solicita snapshot inicial
        fetchMultiviewState();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleSocketMessage(msg);
        } catch (e) {
          console.warn('Erro ao processar mensagem WebSocket:', e);
        }
      };

      ws.onclose = () => {
        if (wsStatusEl) {
          wsStatusEl.textContent = 'RECONECTANDO…';
          wsStatusEl.className = 'status-badge reconnecting';
        }
        setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = () => {
        if (ws) ws.close();
      };
    } catch (e) {
      setTimeout(connectWebSocket, 2000);
    }
  }

  function handleSocketMessage(msg) {
    if (msg.type === 'state') {
      if (msg.data) {
        state.program = msg.data.active || msg.data.program || state.program;
        state.preview = msg.data.preview || state.preview;
        if (Array.isArray(msg.data.inputs)) {
          state.inputs = msg.data.inputs;
        }
        renderSlots();
      }
    } else if (msg.type === 'meters') {
      if (msg.inputs && typeof msg.inputs === 'object') {
        state.meters = msg.inputs;
        updateMetersUI();
      }
    } else if (msg.type === 'inputs_health') {
      if (msg.inputs) {
        state.inputsHealth = msg.inputs;
        updateHealthUI();
      }
    } else if (msg.type === 'multiview') {
      if (msg.activeLayout) {
        activeLayout = msg.activeLayout;
        updateLayoutClass();
      }
    }
  }

  async function fetchMultiviewState() {
    try {
      const res = await fetch('/api/multiview');
      if (res.ok) {
        const data = await res.json();
        if (data.activeLayout) {
          activeLayout = data.activeLayout;
          safeZonesActive = data.safeZones?.enabled ?? true;
          updateLayoutClass();
          renderSlots();
        }
      }
    } catch (e) {
      // Falha graciosa mantendo estado padrão
    }
  }

  function updateLayoutClass() {
    document.body.className = `layout-${activeLayout}`;
    
    // Atualiza botões
    document.querySelectorAll('.mv-btn[data-layout]').forEach(btn => {
      if (btn.getAttribute('data-layout') === activeLayout) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const btnSafe = document.getElementById('btn-safe');
    if (btnSafe) {
      btnSafe.classList.toggle('active', safeZonesActive);
    }
  }

  function getSafeZoneOverlay(isVertical) {
    if (!safeZonesActive) return '';
    if (isVertical) {
      return `
        <div class="safe-zone-overlay vertical-social-safe">
          <div class="social-safe-box">
            <span class="safe-tag title-safe">SAFE 9:16</span>
            <div class="social-side-hud">
              <span class="hud-icon">❤️</span>
              <span class="hud-icon">💬</span>
              <span class="hud-icon">🔖</span>
              <span class="hud-icon">↗️</span>
            </div>
            <div class="social-bottom-hud">
              <div class="hud-bar-sm"></div>
              <div class="hud-bar-lg"></div>
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="safe-zone-overlay standard-broadcast-safe">
        <div class="action-safe-box">
          <div class="title-safe-box">
            <span class="safe-tag">TITLE SAFE 80%</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderSlots() {
    if (!stage) return;
    
    const isVertical = activeLayout.includes('vertical') || activeLayout.includes('9_16');
    const isQuad = activeLayout === 'quad_split';
    const isStudio12 = activeLayout === 'horizontal_16_9_studio12';

    let html = '';

    if (isQuad) {
      // 4 telas iguais
      html += '<div class="quad-grid">';
      for (let i = 1; i <= 4; i++) {
        const inp = state.inputs[i - 1] || { name: `CAM ${i}`, uuid: `c${i}` };
        const isPgm = inp.name === state.program;
        const isPv = inp.name === state.preview;
        const tallyClass = isPgm ? 'is-pgm' : (isPv ? 'is-pv' : '');
        const roleLabel = isPgm ? 'NO AR' : (isPv ? 'PRÉVIA' : 'STANDBY');

        html += `
          <div class="mv-box ${tallyClass}" data-slot="${i}">
            <div class="mv-overlay-tag ${isPgm ? 'tag-pgm' : (isPv ? 'tag-pv' : 'tag-std')}">${roleLabel}</div>
            <div class="mv-screen">
              <div class="screen-preview-placeholder">
                <span class="screen-title">${inp.name || `QUAD ${i}`}</span>
              </div>
              ${getSafeZoneOverlay(false)}
            </div>
            <div class="mv-info-bar">
              <div class="mv-name"><span class="mv-num">${i}</span><span>${inp.name || `QUAD ${i}`}</span></div>
              <div class="mv-vumeter" data-vu="${inp.name}"><div class="vu-bar ch1"></div><div class="vu-bar ch2"></div></div>
            </div>
          </div>
        `;
      }
      html += '</div>';
    } else {
      // Linha Master (Preview e Program)
      html += `
        <div class="master-row ${isVertical ? 'vertical-masters' : ''}">
          <div class="mv-box is-pv" id="box-preview">
            <div class="mv-overlay-tag tag-pv">PREVIEW</div>
            <div class="mv-screen">
              <div class="screen-preview-placeholder">
                <span class="screen-title">${state.preview || 'PREVIEW'}</span>
              </div>
              ${getSafeZoneOverlay(isVertical)}
            </div>
            <div class="mv-info-bar">
              <div class="mv-name"><span class="mv-num">PV</span><span>${state.preview || 'PREVIEW'}</span></div>
              <div class="mv-vumeter" data-vu="${state.preview}"><div class="vu-bar ch1"></div><div class="vu-bar ch2"></div></div>
            </div>
          </div>

          <div class="mv-box is-pgm" id="box-program">
            <div class="mv-overlay-tag tag-pgm">PROGRAM · NO AR</div>
            <div class="mv-screen">
              <div class="screen-preview-placeholder">
                <span class="screen-title">${state.program || 'PROGRAM'}</span>
              </div>
              ${getSafeZoneOverlay(isVertical)}
            </div>
            <div class="mv-info-bar">
              <div class="mv-name"><span class="mv-num">PGM</span><span>${state.program || 'PROGRAM'}</span></div>
              <div class="mv-vumeter" data-vu="${state.program}"><div class="vu-bar ch1"></div><div class="vu-bar ch2"></div></div>
            </div>
          </div>
        </div>
      `;

      // Grade de Entradas
      const slotsCount = isStudio12 ? 12 : (isVertical && activeLayout.includes('social') ? 4 : 8);
      html += `<div class="inputs-grid ${isStudio12 ? 'grid-12' : ''} ${isVertical ? 'grid-vertical' : ''}">`;
      
      for (let i = 1; i <= slotsCount; i++) {
        const inp = state.inputs[i - 1] || { name: `INPUT ${i}`, uuid: `inp-${i}` };
        const isPgm = inp.name === state.program;
        const isPv = inp.name === state.preview;
        const tallyClass = isPgm ? 'is-pgm' : (isPv ? 'is-pv' : '');
        const health = state.inputsHealth[inp.uuid] || state.inputsHealth[inp.name] || {};
        const isStalled = health.status === 'stalled' || health.videoStalled;
        const isOffline = health.status === 'offline';

        let badge = '';
        if (isPgm) badge = '<div class="mv-overlay-tag tag-pgm">PGM</div>';
        else if (isPv) badge = '<div class="mv-overlay-tag tag-pv">PVW</div>';

        html += `
          <div class="mv-box ${tallyClass} ${isStalled ? 'is-stalled' : ''} ${isOffline ? 'is-offline' : ''}" data-slot="${i + 2}">
            ${badge}
            ${isStalled ? '<div class="health-alert-badge">⚠️ CONGELADO</div>' : ''}
            ${isOffline ? '<div class="health-alert-badge alert-red">🔴 SEM SINAL</div>' : ''}
            <div class="mv-screen">
              <div class="screen-preview-placeholder">
                <span class="screen-title">${inp.name || `INPUT ${i}`}</span>
              </div>
              ${isVertical ? getSafeZoneOverlay(true) : ''}
            </div>
            <div class="mv-info-bar">
              <div class="mv-name"><span class="mv-num">${i}</span><span>${inp.name || `INPUT ${i}`}</span></div>
              <div class="mv-vumeter" data-vu="${inp.name}"><div class="vu-bar ch1"></div><div class="vu-bar ch2"></div></div>
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    stage.innerHTML = html;
    updateMetersUI();
  }

  function updateMetersUI() {
    if (!state.meters) return;
    document.querySelectorAll('.mv-vumeter[data-vu]').forEach(vuEl => {
      const name = vuEl.getAttribute('data-vu');
      const m = state.meters[name];
      if (m) {
        const ch1El = vuEl.querySelector('.vu-bar.ch1');
        const ch2El = vuEl.querySelector('.vu-bar.ch2');
        if (ch1El) ch1El.style.width = `${Math.min(100, Math.max(0, (m.level + 60) * 1.66))}%`;
        if (ch2El) ch2El.style.width = `${Math.min(100, Math.max(0, (m.levelCh2 ?? m.level + 60) * 1.66))}%`;
      }
    });
  }

  function updateHealthUI() {
    for (const [key, h] of Object.entries(state.inputsHealth)) {
      // Atualiza slots correspondentes
      document.querySelectorAll('.mv-box').forEach(box => {
        const nameEl = box.querySelector('.mv-name span:last-child');
        if (nameEl && nameEl.textContent === key) {
          box.classList.toggle('is-stalled', h.status === 'stalled' || h.videoStalled === true);
          box.classList.toggle('is-offline', h.status === 'offline');
        }
      });
    }
  }

  // Interação de Controles
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.mv-btn[data-layout]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const layoutId = btn.getAttribute('data-layout');
        activeLayout = layoutId;
        updateLayoutClass();
        renderSlots();

        try {
          await fetch('/api/multiview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set_layout', layoutId })
          });
        } catch (e) {}
      });
    });

    const btnSafe = document.getElementById('btn-safe');
    if (btnSafe) {
      btnSafe.addEventListener('click', async () => {
        safeZonesActive = !safeZonesActive;
        updateLayoutClass();
        renderSlots();

        try {
          await fetch('/api/multiview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'safe_zones', enabled: safeZonesActive })
          });
        } catch (e) {}
      });
    }

    const btnFull = document.getElementById('btn-full');
    if (btnFull) {
      btnFull.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    connectWebSocket();
    fetchMultiviewState();
  });
})();
