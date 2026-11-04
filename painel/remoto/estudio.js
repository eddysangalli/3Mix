// 3Mix Virtual Studio — Controlador da Interface Web de Cenários 2.5D & Câmera Virtual.
(() => {
  const $ = id => document.getElementById(id);

  let currentStudio = null;
  let activeTab = 'packs'; // 'packs' | 'builder' | 'camera'
  let packsList = [];
  let packsDir = '';
  let activePack = null;
  const packImageCache = new Map();

  // Estado do Montador Livre / Corner-Pin
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
      packsList = currentStudio.packs || [];
      packsDir = currentStudio.packsDir || '';

      // Tenta rota específica de packs se a lista vier vazia
      if (packsList.length === 0) {
        try {
          const packData = await api('/api/studio/packs');
          if (packData.packs) {
            packsList = packData.packs;
            packsDir = packData.dir || packsDir;
          }
        } catch {}
      }

      populateInputs(currentStudio.targets || []);
      populateTemplates(currentStudio.presets || []);
      renderPacksGrid(packsList);
      renderBuiltSets(currentStudio.sets || []);

      // Navegação por abas
      $('tab-packs').addEventListener('click', () => switchTab('packs'));
      $('tab-builder').addEventListener('click', () => switchTab('builder'));
      $('tab-camera').addEventListener('click', () => switchTab('camera'));

      // Eventos dos Packs Oficiais
      $('btn-build-pack-scene').addEventListener('click', onBuildPackScene);
      $('btn-build-scene').addEventListener('click', () => {
        if (activeTab === 'packs') onBuildPackScene();
        else onBuildCustomScene();
      });

      // Eventos do Montador Livre
      $('template-select').addEventListener('change', onTemplateChange);
      $('btn-reset-quad').addEventListener('click', resetActiveSlotQuad);
      $('btn-refresh-preview').addEventListener('click', drawCanvas);
      $('active-slot-select').addEventListener('change', () => {
        activeSlotIndex = Number($('active-slot-select').value) || 0;
        updateQuadInputs();
        drawCanvas();
      });

      // Alternador de fundo cor / fonte no montador livre
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

      // Inicia no primeiro pack ou primeiro template
      if (packsList.length > 0) {
        selectPack(packsList[0]);
      } else if (currentStudio.presets?.length > 0) {
        selectTemplate(currentStudio.presets[0].id);
      } else {
        drawCanvas();
      }
    } catch (e) {
      console.error('[Virtual Studio Init]', e);
      $('studio-status-badge').textContent = 'Erro de Conexão';
      $('studio-status-badge').className = 'btn danger';
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    $('tab-packs').classList.toggle('active', tab === 'packs');
    $('tab-builder').classList.toggle('active', tab === 'builder');
    $('tab-camera').classList.toggle('active', tab === 'camera');

    $('panel-packs').style.display = tab === 'packs' ? 'flex' : 'none';
    $('panel-builder').style.display = tab === 'builder' ? 'flex' : 'none';
    $('panel-camera').style.display = tab === 'camera' ? 'flex' : 'none';

    $('top-template-selector').style.display = tab === 'builder' ? 'flex' : 'none';
    $('top-pack-status').style.display = tab === 'packs' ? 'flex' : 'none';

    drawCanvas();
  }

  // --- PACKS OFICIAIS ---
  function renderPacksGrid(packs) {
    const container = $('packs-grid-container');
    container.innerHTML = '';
    $('pack-count-badge').textContent = `${packs.length} Packs`;

    packs.forEach((pack, idx) => {
      const item = document.createElement('div');
      item.className = 'pack-item' + (activePack?.id === pack.id ? ' active' : '');
      item.id = `pack-item-${pack.id}`;

      const thumbUrl = `/api/studio/pack-image?pack=${encodeURIComponent(pack.pasta)}&file=PREVIEW_MONTADO.jpg`;

      item.innerHTML = `
        <img class="pack-thumb" src="${thumbUrl}" alt="${pack.nome}" loading="lazy">
        <div class="pack-info">
          <div class="pack-name" title="${pack.nome}">${pack.nome}</div>
          <div class="pack-cat" title="${pack.categoria || 'Broadcast'}">${pack.categoria || 'Broadcast'}</div>
        </div>
      `;

      item.addEventListener('click', () => selectPack(pack));
      container.appendChild(item);
    });
  }

  function selectPack(pack) {
    activePack = pack;
    document.querySelectorAll('.pack-item').forEach(el => el.classList.remove('active'));
    const selectedEl = $(`pack-item-${pack.id}`);
    if (selectedEl) selectedEl.classList.add('active');

    $('top-pack-name').textContent = pack.nome;
    $('pack-scene-name-input').value = `3Mix Estúdio · ${pack.nome}`;

    // Extrai coordenadas do telão para info
    const faixaTelao = (pack.montagem_camadas || []).find(c => c.faixa === 1);
    if (faixaTelao?.posicionamento_telao_1080p) {
      const p = faixaTelao.posicionamento_telao_1080p;
      $('telao-coords-info').textContent = `Moldura 1080p: X=${p.x}, Y=${p.y}, L=${p.largura}, A=${p.altura}`;
    } else {
      $('telao-coords-info').textContent = 'Recorte Alfa Direto';
    }

    // Preload da imagem de preview para o canvas
    const previewUrl = `/api/studio/pack-image?pack=${encodeURIComponent(pack.pasta)}&file=PREVIEW_MONTADO.jpg`;
    if (!packImageCache.has(pack.id)) {
      const img = new Image();
      img.onload = () => {
        packImageCache.set(pack.id, img);
        drawCanvas();
      };
      img.src = previewUrl;
    }

    drawCanvas();
  }

  function populateInputs(targets) {
    const bgSel = $('bg-source-select');
    const fgSel = $('fg-source-select');
    const packScreenSel = $('pack-screen-select');
    const packCamSel = $('pack-camera-select');

    bgSel.innerHTML = '<option value="">(Selecione a fonte de fundo)</option>';
    fgSel.innerHTML = '<option value="">(Nenhuma mesa · Transparente)</option>';
    packScreenSel.innerHTML = '<option value="">(Selecione a entrada do Telão · VT, Replay, GC…)</option>';
    packCamSel.innerHTML = '<option value="">(Selecione a câmera do apresentador)</option>';

    targets.forEach(t => {
      const text = `${t.name} (${t.kind || 'Input'})`;

      const optBg = document.createElement('option');
      optBg.value = t.key;
      optBg.textContent = text;
      bgSel.appendChild(optBg);

      const optFg = optBg.cloneNode(true);
      fgSel.appendChild(optFg);

      const optScreen = optBg.cloneNode(true);
      packScreenSel.appendChild(optScreen);

      const optCam = optBg.cloneNode(true);
      packCamSel.appendChild(optCam);
    });
  }

  function renderBuiltSets(sets) {
    ['built-sets-list', 'built-sets-list-packs'].forEach(listId => {
      const list = $(listId);
      if (!list) return;
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
    });
  }

  // --- MONTADOR DE PACKS OFICIAIS (4 FAIXAS) ---
  async function onBuildPackScene() {
    if (!activePack) {
      alert('Selecione um dos 9 Packs Oficiais acima.');
      return;
    }

    const camKey = $('pack-camera-select').value;
    if (!camKey) {
      alert('Selecione uma entrada de vídeo na Faixa 03 (Câmera com Chroma Key).');
      $('pack-camera-select').focus();
      return;
    }

    const sceneName = $('pack-scene-name-input').value.trim() || `3Mix Estúdio · ${activePack.nome}`;

    // Faixa 01: Telão multimídia
    const screenKey = $('pack-screen-select').value;
    let screenSpec = null;
    if (screenKey) {
      const faixaTelao = (activePack.montagem_camadas || []).find(c => c.faixa === 1);
      const bounds = $('pack-screen-fit-rect').checked ? (faixaTelao?.posicionamento_normalizado || null) : null;
      screenSpec = { key: screenKey, bounds };
    }

    // Faixa 02: Cenário de fundo
    const bgFile = packsDir ? `${packsDir}/${activePack.pasta}/${activePack.arquivos.fundo}`.replace(/\\/g, '/') : null;
    const bgSpec = bgFile ? { type: 'image', file: bgFile } : { type: 'color', color: '#101820' };

    // Faixa 03: Câmera central
    const quadCenter = { tl: [0.20, 0.05], tr: [0.80, 0.05], br: [0.82, 0.98], bl: [0.18, 0.98] };
    const slots = [{ key: camKey, quad: quadCenter }];

    // Faixa 04: Bancada frontal
    let fgSpec = null;
    if ($('pack-fg-enable').checked && activePack.arquivos?.frente) {
      const fgFile = packsDir ? `${packsDir}/${activePack.pasta}/${activePack.arquivos.frente}`.replace(/\\/g, '/') : null;
      if (fgFile) fgSpec = { file: fgFile };
    }

    try {
      $('studio-status-badge').textContent = 'Montando cenário…';
      $('studio-status-badge').className = 'btn';

      const payload = {
        action: 'studio_set_create',
        presetId: activePack.id,
        name: sceneName,
        screen: screenSpec,
        background: bgSpec,
        foreground: fgSpec,
        slots
      };

      const res = await api('/api/studio', 'POST', payload);
      activeBuiltSetKey = res.result?.id || null;

      $('studio-status-badge').textContent = 'Cenário Ativo no Switcher!';
      $('studio-status-badge').className = 'btn active';

      const refreshed = await api('/api/studio');
      renderBuiltSets(refreshed.studio?.sets || []);

      alert(`Cenário oficial "${sceneName}" montado com sucesso!\nAs 4 Faixas Canônicas foram inseridas na sua mesa de corte.`);
    } catch (e) {
      $('studio-status-badge').textContent = 'Erro ao montar';
      $('studio-status-badge').className = 'btn danger';
      alert('Erro ao montar cenário: ' + e.message);
    }
  }

  // --- MONTADOR LIVRE (CORNER-PIN BUILDER) ---
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

  async function onBuildCustomScene() {
    if (!activeTemplate) return;

    for (let i = 0; i < currentSlotsData.length; i++) {
      const slot = currentSlotsData[i];
      if (!slot.key) {
        alert(`Selecione uma entrada de vídeo para a Câmera do Slot ${slot.label}.`);
        return;
      }
    }

    const isColor = $('bg-is-color').checked;
    const bgSpec = isColor
      ? { type: 'color', color: $('bg-color-input').value.trim() || '#101820' }
      : { type: 'input', key: $('bg-source-select').value };

    if (!isColor && !bgSpec.key) {
      alert('Selecione uma entrada para o fundo ou marque "Usar Cor Sólida".');
      return;
    }

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

  // --- CÂMERA VIRTUAL & ZOOM BROADCAST ---
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

    startCameraTransition(zoom, panX, tilt, 0);
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

  // --- DESENHO NO CANVAS DE PRÉVIA ---
  function drawCanvas() {
    const canvas = $('studio-canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Fundo limpo do estúdio
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, w, h);

    if (activeTab === 'packs' && activePack) {
      drawPackPreview(ctx, w, h);
    } else {
      drawBuilderPreview(ctx, w, h);
    }
  }

  function drawPackPreview(ctx, w, h) {
    const cachedImg = packImageCache.get(activePack.id);
    if (cachedImg) {
      ctx.drawImage(cachedImg, 0, 0, w, h);
    } else {
      // Gradiente de estúdio se a imagem ainda não carregou
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1a1e26');
      grad.addColorStop(1, '#0c0e12');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    const faixaTelao = (activePack.montagem_camadas || []).find(c => c.faixa === 1);
    if (faixaTelao?.posicionamento_normalizado) {
      const tn = faixaTelao.posicionamento_normalizado;
      const tx = tn.x * w;
      const ty = tn.y * h;
      const tw = tn.largura * w;
      const th = tn.altura * h;

      // Faixa 01: Telão
      ctx.fillStyle = 'rgba(0, 210, 247, 0.20)';
      ctx.fillRect(tx, ty, tw, th);

      ctx.strokeStyle = '#00d2f7';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(tx, ty, tw, th);
      ctx.setLineDash([]);

      ctx.fillStyle = '#00d2f7';
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FAIXA 01 · TELÃO MULTIMÍDIA', tx + tw / 2, ty + th / 2);
    }

    // Faixa 03: Área do Apresentador
    const camX = w * 0.30;
    const camY = h * 0.15;
    const camW = w * 0.40;
    const camH = h * 0.70;

    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
    ctx.fillRect(camX, camY, camW, camH);

    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(camX, camY, camW, camH);
    ctx.setLineDash([]);

    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FAIXA 03 · CÂMERA COM CHROMA KEY', camX + camW / 2, camY + camH / 2);

    // Faixa 04: Bancada Frontal
    if ($('pack-fg-enable')?.checked) {
      const fgY = h * 0.72;
      ctx.fillStyle = 'rgba(230, 126, 34, 0.20)';
      ctx.fillRect(0, fgY, w, h - fgY);

      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, fgY);
      ctx.lineTo(w, fgY);
      ctx.stroke();

      ctx.fillStyle = '#f39c12';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FAIXA 04 · BANCADA FRONTAL (OCLUSÃO DA MESA)', w / 2, fgY + (h - fgY) / 2);
    }
  }

  function drawBuilderPreview(ctx, w, h) {
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

      const midX = (pTL.x + pTR.x + pBR.x + pBL.x) / 4;
      const midY = (pTL.y + pTR.y + pBR.y + pBL.y) / 4;
      ctx.fillStyle = isActive ? '#ffffff' : '#888';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`SLOT ${slot.label}`, midX, midY);

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
    if (activeTab !== 'builder') return;
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
    if (!draggingCorner || activeTab !== 'builder') return;
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

  window.addEventListener('DOMContentLoaded', init);
})();
