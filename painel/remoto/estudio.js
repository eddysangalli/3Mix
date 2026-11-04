// 3Mix Virtual Studio — Controlador da Interface Web de Cenários 2.5D & Câmera Virtual.
(() => {
  const $ = id => document.getElementById(id);

  let currentStudio = null;
  let activeTemplate = null;
  let activeSlotIndex = 0;
  let currentSlotsData = []; // [{ label, quad: { tl, tr, br, bl }, key }]
  let draggingCorner = null; // 'tl' | 'tr' | 'br' | 'bl' | null

  // Estado da Câmera Virtual
  let camState = { zoom: 1.0, panX: 0.0, panY: 0.0 };
  let targetCamState = { zoom: 1.0, panX: 0.0, panY: 0.0 };
  let animStartTime = 0;
  let animDuration = 800; // ms
  let startCamState = { zoom: 1.0, panX: 0.0, panY: 0.0 };
  let isAnimating = false;
  let activeBuiltSetKey = null;

  async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw Error(err.error || 'Erro na requisição');
    }
    return res.json();
  }

  async function init() {
    try {
      const data = await api('/api/studio');
      currentStudio = data.studio || {};

      populateTemplates(currentStudio.presets || []);
      populateInputs(currentStudio.targets || []);
      renderBuiltSets(currentStudio.sets || []);

      // Navegação por abas
      $('tab-builder').addEventListener('click', () => switchTab('builder'));
      $('tab-camera').addEventListener('click', () => switchTab('camera'));

      // Eventos do Montador
      $('template-select').addEventListener('change', onTemplateChange);
      $('btn-build-scene').addEventListener('click', onBuildScene);
      $('btn-reset-quad').addEventListener('click', resetActiveSlotQuad);
      $('btn-refresh-preview').addEventListener('click', drawCanvas);
      $('active-slot-select').addEventListener('change', () => {
        activeSlotIndex = Number($('active-slot-select').value) || 0;
        updateQuadInputs();
        drawCanvas();
      });

      // Alternador de fundo cor / fonte
      $('bg-is-color').addEventListener('change', () => {
        const isColor = $('bg-is-color').checked;
        $('bg-color-input').style.display = isColor ? 'block' : 'none';
        $('bg-source-select').style.display = isColor ? 'none' : 'block';
      });

      // Bind quad coordinate inputs
      ['tl', 'tr', 'br', 'bl'].forEach(corner => {
        ['x', 'y'].forEach(coord => {
          $(`q-${corner}-${coord}`).addEventListener('input', () => {
            const slot = currentSlotsData[activeSlotIndex];
            if (!slot) return;
            const val = Number($(`q-${corner}-${coord}`).value) || 0;
            const idx = coord === 'x' ? 0 : 1;
            slot.quad[corner][idx] = val;
            drawCanvas();
          });
        });
      });

      // Eventos da Câmera Virtual & Zoom
      document.querySelectorAll('.zoom-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.zoom-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const zType = btn.getAttribute('data-zoom');
          applyZoomPreset(zType);
        });
      });

      $('sl-cam-zoom').addEventListener('input', onManualCamChange);
      $('sl-cam-pan').addEventListener('input', onManualCamChange);
      $('sl-cam-tilt').addEventListener('input', onManualCamChange);
      $('cam-speed-select').addEventListener('change', () => {
        const val = $('cam-speed-select').value;
        $('val-cam-speed').textContent = val === '0' ? 'Corte Seco (0ms)' : `${val}ms`;
      });
      $('btn-reset-cam').addEventListener('click', () => applyZoomPreset('wide'));

      // Canvas mouse events
      const canvas = $('studio-canvas');
      canvas.addEventListener('mousedown', onCanvasMouseDown);
      window.addEventListener('mousemove', onCanvasMouseMove);
      window.addEventListener('mouseup', onCanvasMouseUp);

      // Seleciona o primeiro template
      if (currentStudio.presets?.length > 0) {
        selectTemplate(currentStudio.presets[0].id);
      } else {
        drawCanvas();
      }
    } catch (e) {
      console.error('[Virtual Studio Init]', e);
      $('studio-status-badge').textContent = 'Erro de Conexão';
      $('studio-status-badge').className = 'btn';
    }
  }

  function switchTab(tab) {
    $('tab-builder').classList.toggle('active', tab === 'builder');
    $('tab-camera').classList.toggle('active', tab === 'camera');
    $('panel-builder').style.display = tab === 'builder' ? 'flex' : 'none';
    $('panel-camera').style.display = tab === 'camera' ? 'flex' : 'none';
  }

  function populateTemplates(presets) {
    const sel = $('template-select');
    sel.innerHTML = '';
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.slots?.length || 1} Cam)`;
      sel.appendChild(opt);
    });
  }

  function populateInputs(targets) {
    const bgSel = $('bg-source-select');
    const fgSel = $('fg-source-select');

    bgSel.innerHTML = '<option value="">(Selecione a fonte de fundo)</option>';
    fgSel.innerHTML = '<option value="">(Nenhuma mesa · Transparente)</option>';

    targets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.key;
      opt.textContent = `${t.name} (${t.kind || 'Input'})`;
      bgSel.appendChild(opt);

      const optFg = opt.cloneNode(true);
      fgSel.appendChild(optFg);
    });
  }

  function renderBuiltSets(sets) {
    const list = $('built-sets-list');
    list.innerHTML = '';
    if (!sets || sets.length === 0) {
      list.innerHTML = '<div style="font-size:11px;color:var(--text-dim);font-style:italic;">Nenhum cenário montado ainda.</div>';
      return;
    }

    if (!activeBuiltSetKey) {
      activeBuiltSetKey = sets[0].id;
    }

    sets.forEach(set => {
      const card = document.createElement('div');
      card.className = 'set-card';
      card.innerHTML = `
        <div>
          <strong style="color:#fff;font-size:12px;">${set.name}</strong>
          <div style="font-size:10.5px;color:var(--text-muted);">${set.presetName || 'Cenário'} · ${set.slots?.length || 0} slot(s)</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn" data-act="control" style="font-size:10.5px;padding:3px 7px;">Câmera</button>
          <button type="button" class="btn danger" data-act="delete" style="font-size:10.5px;padding:3px 7px;">Desmontar</button>
        </div>
      `;

      card.querySelector('[data-act="control"]').addEventListener('click', () => {
        activeBuiltSetKey = set.id;
        switchTab('camera');
      });

      card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!confirm(`Desmontar e remover a cena "${set.name}" do switcher?`)) return;
        try {
          await api('/api/studio', 'POST', { action: 'studio_set_remove', key: set.id });
          const refreshed = await api('/api/studio');
          renderBuiltSets(refreshed.studio?.sets || []);
          alert('Cenário desmontado com sucesso!');
        } catch (err) {
          alert('Erro ao desmontar: ' + err.message);
        }
      });

      list.appendChild(card);
    });
  }

  function onTemplateChange() {
    selectTemplate($('template-select').value);
  }

  function selectTemplate(templateId) {
    const template = (currentStudio.presets || []).find(p => p.id === templateId);
    if (!template) return;
    activeTemplate = template;

    $('template-desc').textContent = template.description || 'Cenário virtual 2.5D broadcast.';
    $('template-slot-badge').textContent = `${template.slots?.length || 1} Câmera(s)`;
    $('scene-name-input').value = `3Mix Estúdio · ${template.name}`;

    // Clona os slots do template para o estado atual
    currentSlotsData = (template.slots || []).map((s, idx) => ({
      label: s.label || String.fromCharCode(65 + idx),
      quad: JSON.parse(JSON.stringify(s.quad)),
      baseQuad: JSON.parse(JSON.stringify(s.quad)),
      key: ''
    }));

    activeSlotIndex = 0;
    renderSlotSelectors();
    updateActiveSlotDropdown();
    updateQuadInputs();
    drawCanvas();
  }

  function renderSlotSelectors() {
    const container = $('slots-container');
    container.innerHTML = '';

    currentSlotsData.forEach((slot, idx) => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.innerHTML = `
        <div class="layer-label">
          <span>[Slot ${slot.label}] Câmera / Talento</span>
          <span style="font-size:10px;color:var(--accent);">Perspectiva ${slot.label}</span>
        </div>
        <select id="slot-select-${idx}">
          <option value="">(Selecione a entrada do Slot ${slot.label})</option>
        </select>
      `;

      const sel = row.querySelector(`#slot-select-${idx}`);
      (currentStudio.targets || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.key;
        opt.textContent = `${t.name} (${t.kind || 'Input'})`;
        sel.appendChild(opt);
      });

      sel.addEventListener('change', () => {
        slot.key = sel.value;
      });

      container.appendChild(row);
    });
  }

  function updateActiveSlotDropdown() {
    const sel = $('active-slot-select');
    sel.innerHTML = '';
    currentSlotsData.forEach((s, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `Editar Slot ${s.label}`;
      if (idx === activeSlotIndex) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function updateQuadInputs() {
    const slot = currentSlotsData[activeSlotIndex];
    if (!slot) return;
    ['tl', 'tr', 'br', 'bl'].forEach(corner => {
      $(`q-${corner}-x`).value = slot.quad[corner][0].toFixed(2);
      $(`q-${corner}-y`).value = slot.quad[corner][1].toFixed(2);
    });
  }

  function resetActiveSlotQuad() {
    const slot = currentSlotsData[activeSlotIndex];
    if (!slot || !activeTemplate?.slots?.[activeSlotIndex]) return;
    slot.quad = JSON.parse(JSON.stringify(activeTemplate.slots[activeSlotIndex].quad));
    updateQuadInputs();
    drawCanvas();
  }

  // --- Câmera Virtual & Zoom ---
  function applyZoomPreset(presetId) {
    const presets = {
      wide: { zoom: 1.0, panX: 0.0, panY: 0.0 },
      medium: { zoom: 1.45, panX: 0.0, panY: 0.15 },
      close: { zoom: 2.1, panX: 0.0, panY: 0.25 },
      screen: { zoom: 1.7, panX: 0.35, panY: 0.05 },
      guest: { zoom: 1.5, panX: -0.3, panY: 0.1 }
    };
    const target = presets[presetId] || presets.wide;
    const duration = Number($('cam-speed-select').value) || 0;

    startCameraTransition(target.zoom, target.panX, target.panY, duration);
  }

  function onManualCamChange() {
    const zoom = Number($('sl-cam-zoom').value);
    const panX = Number($('sl-cam-pan').value);
    const tilt = Number($('sl-cam-tilt').value);

    $('val-cam-zoom').textContent = zoom.toFixed(2) + 'x';
    $('val-cam-pan').textContent = panX.toFixed(2);
    $('val-cam-tilt').textContent = tilt.toFixed(2);

    startCameraTransition(zoom, panX, tilt, 0); // corte imediato no slider manual
  }

  function startCameraTransition(zoom, panX, panY, duration) {
    targetCamState = { zoom, panX, panY };
    animDuration = duration;

    if (duration <= 0) {
      camState = { ...targetCamState };
      updateCamSliders();
      applyCameraToSlots();
      drawCanvas();
      syncZoomToEngine();
      return;
    }

    startCamState = { ...camState };
    animStartTime = performance.now();
    isAnimating = true;
    requestAnimationFrame(animationStep);
  }

  function animationStep(now) {
    if (!isAnimating) return;
    const elapsed = now - animStartTime;
    const progress = Math.min(1, elapsed / animDuration);
    // Curva Ease In Out Cubic
    const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camState.zoom = startCamState.zoom + (targetCamState.zoom - startCamState.zoom) * ease;
    camState.panX = startCamState.panX + (targetCamState.panX - startCamState.panX) * ease;
    camState.panY = startCamState.panY + (targetCamState.panY - startCamState.panY) * ease;

    updateCamSliders();
    applyCameraToSlots();
    drawCanvas();

    if (progress < 1) {
      requestAnimationFrame(animationStep);
    } else {
      isAnimating = false;
      syncZoomToEngine();
    }
  }

  function updateCamSliders() {
    $('sl-cam-zoom').value = camState.zoom;
    $('val-cam-zoom').textContent = camState.zoom.toFixed(2) + 'x';
    $('sl-cam-pan').value = camState.panX;
    $('val-cam-pan').textContent = camState.panX.toFixed(2);
    $('sl-cam-tilt').value = camState.panY;
    $('val-cam-tilt').textContent = camState.panY.toFixed(2);
  }

  function applyCameraToSlots() {
    const z = camState.zoom;
    const cx = 0.5 + camState.panX;
    const cy = 0.5 + camState.panY;

    currentSlotsData.forEach(slot => {
      const base = slot.baseQuad || slot.quad;
      ['tl', 'tr', 'br', 'bl'].forEach(c => {
        const x = (base[c][0] - cx) * z + 0.5;
        const y = (base[c][1] - cy) * z + 0.5;
        slot.quad[c][0] = Math.round(x * 1e4) / 1e4;
        slot.quad[c][1] = Math.round(y * 1e4) / 1e4;
      });
    });
    updateQuadInputs();
  }

  async function syncZoomToEngine() {
    if (!activeBuiltSetKey) return;
    try {
      await api('/api/studio', 'POST', {
        action: 'studio_zoom',
        key: activeBuiltSetKey,
        zoom: camState.zoom,
        panX: camState.panX,
        panY: camState.panY
      });
    } catch (e) {
      console.warn('[Sync Zoom to Engine]', e.message);
    }
  }

  // --- Desenho no Canvas ---
  function drawCanvas() {
    const canvas = $('studio-canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Fundo simulação estúdio
    ctx.fillStyle = '#16191d';
    ctx.fillRect(0, 0, w, h);

    // Linhas de perspectiva estúdio
    ctx.strokeStyle = '#22272e';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(w / 2 + (x - w / 2) * 1.6, h);
      ctx.stroke();
    }
    for (let y = h / 2; y <= h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Desenha cada slot do cenário
    currentSlotsData.forEach((slot, idx) => {
      const isActive = idx === activeSlotIndex;
      const q = slot.quad;
      const pTL = { x: q.tl[0] * w, y: q.tl[1] * h };
      const pTR = { x: q.tr[0] * w, y: q.tr[1] * h };
      const pBR = { x: q.br[0] * w, y: q.br[1] * h };
      const pBL = { x: q.bl[0] * w, y: q.bl[1] * h };

      ctx.fillStyle = isActive ? 'rgba(47, 111, 237, 0.22)' : 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = isActive ? '#2f6fed' : '#555';
      ctx.lineWidth = isActive ? 2.5 : 1;

      ctx.beginPath();
      ctx.moveTo(pTL.x, pTL.y);
      ctx.lineTo(pTR.x, pTR.y);
      ctx.lineTo(pBR.x, pBR.y);
      ctx.lineTo(pBL.x, pBL.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Texto do slot
      const midX = (pTL.x + pTR.x + pBR.x + pBL.x) / 4;
      const midY = (pTL.y + pTR.y + pBR.y + pBL.y) / 4;
      ctx.fillStyle = isActive ? '#ffffff' : '#888';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`SLOT ${slot.label}`, midX, midY);

      // Alças nos 4 vértices do slot ativo
      if (isActive) {
        const corners = [
          { name: 'tl', p: pTL },
          { name: 'tr', p: pTR },
          { name: 'br', p: pBR },
          { name: 'bl', p: pBL }
        ];

        corners.forEach(c => {
          ctx.fillStyle = draggingCorner === c.name ? '#00e676' : '#2f6fed';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(c.p.x, c.p.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    });
  }

  function getCanvasCoords(e) {
    const canvas = $('studio-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function onCanvasMouseDown(e) {
    const pos = getCanvasCoords(e);
    const canvas = $('studio-canvas');
    const w = canvas.width;
    const h = canvas.height;
    const slot = currentSlotsData[activeSlotIndex];
    if (!slot) return;

    const corners = ['tl', 'tr', 'br', 'bl'];
    for (const c of corners) {
      const cx = slot.quad[c][0] * w;
      const cy = slot.quad[c][1] * h;
      const dist = Math.hypot(pos.x - cx, pos.y - cy);
      if (dist <= 15) {
        draggingCorner = c;
        drawCanvas();
        return;
      }
    }
  }

  function onCanvasMouseMove(e) {
    if (!draggingCorner) return;
    const pos = getCanvasCoords(e);
    const canvas = $('studio-canvas');
    const slot = currentSlotsData[activeSlotIndex];
    if (!slot) return;

    const normX = Math.round((pos.x / canvas.width) * 100) / 100;
    const normY = Math.round((pos.y / canvas.height) * 100) / 100;

    slot.quad[draggingCorner][0] = Math.max(-1, Math.min(2, normX));
    slot.quad[draggingCorner][1] = Math.max(-1, Math.min(2, normY));

    updateQuadInputs();
    drawCanvas();
  }

  function onCanvasMouseUp() {
    if (draggingCorner) {
      draggingCorner = null;
      drawCanvas();
    }
  }

  async function onBuildScene() {
    if (!activeTemplate) return;

    // Valida slots
    for (let i = 0; i < currentSlotsData.length; i++) {
      const slot = currentSlotsData[i];
      if (!slot.key) {
        alert(`Selecione uma entrada de vídeo para a Câmera do Slot ${slot.label}.`);
        return;
      }
    }

    // Fundo
    const isColor = $('bg-is-color').checked;
    const bgSpec = isColor
      ? { type: 'color', color: $('bg-color-input').value.trim() || '#101820' }
      : { type: 'input', key: $('bg-source-select').value };

    if (!isColor && !bgSpec.key) {
      alert('Selecione uma entrada para o fundo ou marque "Usar Cor Sólida".');
      return;
    }

    // Primeiro plano
    const fgKey = $('fg-source-select').value;
    const fgSpec = fgKey ? { key: fgKey } : null;

    const sceneName = $('scene-name-input').value.trim();

    try {
      $('studio-status-badge').textContent = 'Montando cenário…';
      const payload = {
        action: 'studio_set_create',
        presetId: activeTemplate.id,
        name: sceneName,
        background: bgSpec,
        foreground: fgSpec,
        slots: currentSlotsData.map(s => ({ key: s.key, quad: s.quad }))
      };

      const res = await api('/api/studio', 'POST', payload);
      activeBuiltSetKey = res.result?.id || null;
      $('studio-status-badge').textContent = 'Cenário Ativo no Switcher!';
      $('studio-status-badge').className = 'btn active';

      const refreshed = await api('/api/studio');
      renderBuiltSets(refreshed.studio?.sets || []);

      alert(`Cenário virtual "${sceneName}" montado com sucesso!\nEle já aparece como entrada na sua mesa de corte.`);
    } catch (e) {
      $('studio-status-badge').textContent = 'Erro ao montar';
      $('studio-status-badge').className = 'btn danger';
      alert('Erro ao montar cenário: ' + e.message);
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
