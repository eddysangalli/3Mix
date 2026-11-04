// 3Mix Chroma Studio — Controlador da Interface Web do Chroma Key v2 & NVIDIA RTX SDK.
(() => {
  const $ = id => document.getElementById(id);

  let currentKey = '';
  let currentState = null;
  let currentEngine = 'obs'; // 'obs' | 'nv'
  let isPickingMode = false;
  let isBeforeAfterMode = false; // false = chaveado; true = original sem recorte
  let currentImage = null;
  let debounceTimer = null;
  let nvDebounceTimer = null;

  const urlParams = new URLSearchParams(window.location.search);
  const initialKey = urlParams.get('key') || '';

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
      const data = await api('/api/chroma');
      const chroma = data.chroma || {};
      const targets = chroma.targets || [];
      const presets = chroma.presets || [];

      // Status do SDK NVIDIA
      const nvBadge = $('nv-badge');
      if (chroma.nvidiaSupported) {
        nvBadge.textContent = 'RTX AI OK';
        nvBadge.className = 'status-tag active';
      } else {
        nvBadge.textContent = 'RTX Não Disp.';
        nvBadge.className = 'status-tag';
        nvBadge.title = 'Placa NVIDIA RTX ou NVIDIA Video Effects SDK não detectado';
      }

      // Popula select de entradas
      const inputSel = $('input-select');
      inputSel.innerHTML = '';
      if (targets.length === 0) {
        inputSel.innerHTML = '<option value="">Nenhuma câmera disponível</option>';
      } else {
        let matchedKey = initialKey;
        if (initialKey) {
          const found = targets.find(t => t.key === initialKey || t.name === initialKey);
          if (found) matchedKey = found.key;
        }
        targets.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.key;
          opt.textContent = `${t.name} (${t.kind || 'Input'})`;
          if (t.key === matchedKey) opt.selected = true;
          inputSel.appendChild(opt);
        });
        if (matchedKey) inputSel.value = matchedKey;
      }

      // Popula select de presets
      populatePresets(presets);

      inputSel.addEventListener('change', () => selectSource(inputSel.value));
      $('preset-select').addEventListener('change', onPresetChange);
      $('btn-save-preset').addEventListener('click', saveCurrentAsPreset);
      $('btn-toggle-chroma').addEventListener('click', toggleChromaEnabled);
      $('btn-apply').addEventListener('click', applyCurrentSettings);
      $('btn-eyedropper').addEventListener('click', toggleEyedropper);
      $('btn-before-after').addEventListener('click', toggleBeforeAfter);
      $('btn-refresh-frame').addEventListener('click', loadPreviewFrame);

      // Alternador de Engine OBS vs NVIDIA
      $('tab-engine-obs').addEventListener('click', () => switchEngine('obs'));
      $('tab-engine-nv').addEventListener('click', () => switchEngine('nv'));

      // Eventos NVIDIA
      $('btn-toggle-nv').addEventListener('click', toggleNvidiaEnabled);
      $('btn-remove-nv').addEventListener('click', removeNvidiaFilter);
      $('nv-mode-select').addEventListener('change', scheduleNvApply);
      $('sl-nv-threshold').addEventListener('input', () => {
        $('val-nv-threshold').textContent = Number($('sl-nv-threshold').value).toFixed(2);
        scheduleNvApply();
      });
      $('sl-nv-interval').addEventListener('input', () => {
        const val = $('sl-nv-interval').value;
        $('val-nv-interval').textContent = val === '1' ? '1 quadro (60fps)' : `${val} quadros`;
        scheduleNvApply();
      });

      // Bind color tabs OBS
      document.querySelectorAll('#color-type-tabs .color-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#color-type-tabs .color-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const type = btn.getAttribute('data-type');
          $('custom-color-row').style.display = type === 'custom' ? 'flex' : 'none';
          scheduleApply();
        });
      });

      // Bind sliders OBS
      ['similarity', 'smoothness', 'spill', 'opacity', 'contrast', 'brightness', 'gamma'].forEach(bindSlider);

      // Bind canvas mouse events
      const canvas = $('preview-canvas');
      canvas.addEventListener('mousemove', onCanvasMouseMove);
      canvas.addEventListener('click', onCanvasClick);

      if (inputSel.value) {
        await selectSource(inputSel.value);
      }
      startLivePreviewLoop();
    } catch (e) {
      console.error('[Chroma Studio Init]', e);
      $('source-status-badge').textContent = 'Erro ao conectar';
      $('source-status-badge').className = 'status-tag warning';
    }
  }

  function switchEngine(engine) {
    currentEngine = engine;
    $('tab-engine-obs').classList.toggle('active', engine === 'obs');
    $('tab-engine-nv').classList.toggle('active', engine === 'nv');

    $('panel-obs-controls').style.display = engine === 'obs' ? 'block' : 'none';
    $('card-nvidia-controls').style.display = engine === 'nv' ? 'flex' : 'none';

    updateUiFromState();
  }

  function populatePresets(presets) {
    const sel = $('preset-select');
    sel.innerHTML = '<option value="">(Selecione um preset)</option>';
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }

  async function selectSource(key) {
    if (!key) return;
    currentKey = key;
    $('source-status-badge').textContent = 'Lendo entrada…';
    $('source-status-badge').className = 'status-tag';

    try {
      const data = await api(`/api/chroma?key=${encodeURIComponent(key)}`);
      currentState = data.chroma || {};
      const details = currentState.details || currentState.filter || {};

      // Auto-seleciona a aba do motor ativo na entrada
      if (details.nvidia?.enabled) {
        currentEngine = 'nv';
      } else if (details.enabled) {
        currentEngine = 'obs';
      } else if (details.nvidia?.exists && !details.exists) {
        currentEngine = 'nv';
      } else {
        currentEngine = 'obs';
      }
      $('tab-engine-obs').classList.toggle('active', currentEngine === 'obs');
      $('tab-engine-nv').classList.toggle('active', currentEngine === 'nv');
      $('panel-obs-controls').style.display = currentEngine === 'obs' ? 'block' : 'none';
      $('card-nvidia-controls').style.display = currentEngine === 'nv' ? 'flex' : 'none';

      updateUiFromState();
      await loadPreviewFrame();
    } catch (e) {
      console.error('[Select Source]', e);
      $('source-status-badge').textContent = 'Erro na leitura';
    }
  }

  function updateUiFromState() {
    if (!currentState) return;
    const details = currentState.details || currentState.filter || {};
    const settings = details.settings || {};
    const enabled = details.enabled ?? false;

    // Estado NVIDIA
    const nv = details.nvidia || {};
    const nvEnabled = nv.enabled ?? false;
    const nvSettings = nv.settings || {};

    if (currentEngine === 'nv') {
      const badge = $('source-status-badge');
      badge.textContent = nvEnabled ? 'NVIDIA IA ATIVO' : 'NVIDIA DESLIGADO';
      badge.className = 'status-tag ' + (nvEnabled ? 'active' : '');

      const btnToggleNv = $('btn-toggle-nv');
      btnToggleNv.textContent = nvEnabled ? 'Desativar IA' : 'Ativar IA';
      btnToggleNv.className = 'btn ' + (nvEnabled ? 'danger' : 'active');

      if (nvSettings.mode !== undefined) $('nv-mode-select').value = String(nvSettings.mode);
      if (nvSettings.threshold !== undefined) {
        $('sl-nv-threshold').value = nvSettings.threshold;
        $('val-nv-threshold').textContent = Number(nvSettings.threshold).toFixed(2);
      }
      if (nvSettings.processing_interval !== undefined) {
        $('sl-nv-interval').value = nvSettings.processing_interval;
        const val = nvSettings.processing_interval;
        $('val-nv-interval').textContent = val === 1 ? '1 quadro (60fps)' : `${val} quadros`;
      }
    } else {
      // Badge status OBS
      const badge = $('source-status-badge');
      badge.textContent = enabled ? 'Chroma ATIVO' : 'Chroma DESLIGADO';
      badge.className = 'status-tag ' + (enabled ? 'active' : '');

      const btnToggle = $('btn-toggle-chroma');
      btnToggle.textContent = enabled ? 'Desativar Chroma' : 'Ativar Chroma';
      btnToggle.className = 'btn ' + (enabled ? 'danger' : 'active');

      // Tipo de cor
      const type = settings.key_color_type || 'green';
      document.querySelectorAll('#color-type-tabs .color-tab').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-type') === type);
      });
      $('custom-color-row').style.display = type === 'custom' ? 'flex' : 'none';

      // Cor customizada
      if (settings.key_color !== undefined) {
        const b = (settings.key_color >> 16) & 0xff;
        const g = (settings.key_color >> 8) & 0xff;
        const r = settings.key_color & 0xff;
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        $('hex-color-input').value = hex;
        $('color-box').style.background = hex;
      }

      // Sliders
      setSlider('similarity', settings.similarity ?? 400);
      setSlider('smoothness', settings.smoothness ?? 80);
      setSlider('spill', settings.spill ?? 100);
      setSlider('opacity', settings.opacity ?? 1.0);
      setSlider('contrast', settings.contrast ?? 0.0);
      setSlider('brightness', settings.brightness ?? 0.0);
      setSlider('gamma', settings.gamma ?? 0.0);
    }

    // Diagnostics
    if (details.warning) {
      $('telemetry-warning').textContent = details.warning;
      $('telemetry-warning').style.display = 'block';
    } else {
      $('telemetry-warning').style.display = 'none';
    }
  }

  function setSlider(id, value) {
    const sl = $('sl-' + id);
    const val = $('val-' + id);
    if (!sl || !val) return;
    sl.value = value;
    val.textContent = sl.step && sl.step.includes('.') ? Number(value).toFixed(2) : String(value);
  }

  function bindSlider(id) {
    const sl = $('sl-' + id);
    const val = $('val-' + id);
    if (!sl || !val) return;
    sl.addEventListener('input', () => {
      val.textContent = sl.step && sl.step.includes('.') ? Number(sl.value).toFixed(2) : String(sl.value);
      scheduleApply();
    });
  }

  function collectSettings() {
    const activeTab = document.querySelector('#color-type-tabs .color-tab.active');
    const type = activeTab ? activeTab.getAttribute('data-type') : 'green';

    const hex = $('hex-color-input').value.replace('#', '');
    let key_color = 0x00ff00;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      key_color = (b << 16) | (g << 8) | r;
    }

    return {
      key_color_type: type,
      key_color,
      similarity: Number($('sl-similarity').value),
      smoothness: Number($('sl-smoothness').value),
      spill: Number($('sl-spill').value),
      opacity: Number($('sl-opacity').value),
      contrast: Number($('sl-contrast').value),
      brightness: Number($('sl-brightness').value),
      gamma: Number($('sl-gamma').value)
    };
  }

  function scheduleApply() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      applyCurrentSettings();
    }, 120);
  }

  async function applyCurrentSettings() {
    if (!currentKey) return;
    const settings = collectSettings();
    const details = currentState?.details || currentState?.filter || {};
    const enabled = details.enabled ?? true;

    try {
      const res = await api('/api/chroma', 'POST', {
        action: 'chroma_apply',
        key: currentKey,
        enabled,
        settings
      });
      if (res.state) {
        currentState = res.state;
        updateUiFromState();
      }
      await loadPreviewFrame();
    } catch (e) {
      console.error('[Apply Chroma Error]', e);
    }
  }

  async function toggleChromaEnabled() {
    if (!currentKey) return;
    const details = currentState?.details || currentState?.filter || {};
    const enabled = !(details.enabled ?? false);
    const settings = collectSettings();

    try {
      const res = await api('/api/chroma', 'POST', {
        action: 'chroma_apply',
        key: currentKey,
        enabled,
        settings
      });
      if (res.state) {
        currentState = res.state;
        updateUiFromState();
      }
      await loadPreviewFrame();
    } catch (e) {
      console.error('[Toggle Chroma Error]', e);
    }
  }

  // --- Funções NVIDIA Broadcast ---
  function collectNvSettings() {
    return {
      mode: Number($('nv-mode-select').value),
      threshold: Number($('sl-nv-threshold').value),
      processing_interval: Number($('sl-nv-interval').value)
    };
  }

  function scheduleNvApply() {
    if (nvDebounceTimer) clearTimeout(nvDebounceTimer);
    nvDebounceTimer = setTimeout(() => {
      applyNvSettings();
    }, 150);
  }

  async function applyNvSettings() {
    if (!currentKey) return;
    const details = currentState?.details || {};
    const nv = details.nvidia || {};
    const enabled = nv.enabled ?? true;
    const settings = collectNvSettings();

    try {
      const res = await api('/api/chroma', 'POST', {
        action: 'chroma_nvidia_apply',
        key: currentKey,
        enabled,
        settings
      });
      if (res.state) {
        currentState = res.state;
        updateUiFromState();
      }
      await loadPreviewFrame();
    } catch (e) {
      console.error('[NVIDIA Apply Error]', e);
      alert('Erro ao aplicar IA NVIDIA: ' + e.message);
    }
  }

  async function toggleNvidiaEnabled() {
    if (!currentKey) return;
    const details = currentState?.details || {};
    const nv = details.nvidia || {};
    const enabled = !(nv.enabled ?? false);
    const settings = collectNvSettings();

    try {
      const res = await api('/api/chroma', 'POST', {
        action: 'chroma_nvidia_apply',
        key: currentKey,
        enabled,
        settings
      });
      if (res.state) {
        currentState = res.state;
        updateUiFromState();
      }
      await loadPreviewFrame();
    } catch (e) {
      console.error('[NVIDIA Toggle Error]', e);
      alert('Erro ao alternar IA NVIDIA: ' + e.message);
    }
  }

  async function removeNvidiaFilter() {
    if (!currentKey || !confirm('Deseja remover o filtro NVIDIA desta entrada?')) return;
    try {
      const res = await api('/api/chroma', 'POST', {
        action: 'chroma_nvidia_remove',
        key: currentKey
      });
      if (res.state) {
        currentState = res.state;
        updateUiFromState();
      }
      await loadPreviewFrame();
      alert('Filtro NVIDIA removido.');
    } catch (e) {
      alert('Erro ao remover filtro NVIDIA: ' + e.message);
    }
  }

  async function onPresetChange() {
    const presetId = $('preset-select').value;
    if (!presetId || !currentKey) return;
    try {
      const res = await api('/api/chroma', 'POST', {
        action: 'chroma_preset_apply',
        key: currentKey,
        presetId
      });
      if (res.state) {
        currentState = res.state;
        updateUiFromState();
      }
      await loadPreviewFrame();
    } catch (e) {
      console.error('[Apply Preset Error]', e);
    }
  }

  async function saveCurrentAsPreset() {
    const name = prompt('Nome do preset de Chroma:', 'Câmera Estúdio');
    if (!name || !name.trim()) return;
    try {
      const res = await api('/api/chroma', 'POST', {
        action: 'chroma_preset_save',
        name: name.trim(),
        settings: collectSettings()
      });
      if (res.chroma?.presets) {
        populatePresets(res.chroma.presets);
        alert('Preset salvo com sucesso!');
      }
    } catch (e) {
      alert('Erro ao salvar preset: ' + e.message);
    }
  }

  function toggleBeforeAfter() {
    isBeforeAfterMode = !isBeforeAfterMode;
    const btn = $('btn-before-after');
    btn.textContent = isBeforeAfterMode ? 'Exibindo: Original' : 'Exibindo: Recortado';
    btn.className = 'btn ' + (isBeforeAfterMode ? 'active' : '');
    loadPreviewFrame();
  }

  function toggleEyedropper() {
    isPickingMode = !isPickingMode;
    const btn = $('btn-eyedropper');
    const tip = $('eyedropper-tip');
    btn.classList.toggle('picking', isPickingMode);
    tip.style.display = isPickingMode ? 'block' : 'none';
  }

  let streamLoopActive = true;
  let isFetchingFrame = false;

  function drawCheckerboard(ctx, w, h) {
    const size = 16;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#222834' : '#181d26';
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  function loadPreviewFrame() {
    if (!currentKey || isFetchingFrame) return Promise.resolve();
    isFetchingFrame = true;
    return new Promise((resolve) => {
      const canvas = $('preview-canvas');
      const ctx = canvas.getContext('2d');

      const mode = isBeforeAfterMode ? 'raw' : 'normal';
      const url = `/api/chroma-frame?key=${encodeURIComponent(currentKey)}&mode=${mode}&t=${Date.now()}`;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        currentImage = img;
        const w = img.naturalWidth || 960;
        const h = img.naturalHeight || 540;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;

        // Fundo quadriculado broadcast para mostrar transparência do alfa
        drawCheckerboard(ctx, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        // Indicador de Live Feed / Antes-Depois
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(10, 10, isBeforeAfterMode ? 140 : 86, 22);
        ctx.fillStyle = isBeforeAfterMode ? '#f59e0b' : '#22c55e';
        ctx.beginPath();
        ctx.arc(22, 21, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillText(isBeforeAfterMode ? 'ORIGINAL (SEM RECORTE)' : 'AO VIVO', 32, 25);
        ctx.restore();

        isFetchingFrame = false;
        resolve();
      };
      img.onerror = () => {
        isFetchingFrame = false;
        resolve();
      };
      img.src = url;
    });
  }

  async function startLivePreviewLoop() {
    while (streamLoopActive) {
      if (!document.hidden && currentKey) {
        await loadPreviewFrame().catch(() => {});
      }
      await new Promise(r => setTimeout(r, 66));
    }
  }

  function onCanvasMouseMove(e) {
    const canvas = $('preview-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    $('cursor-pos').textContent = `X: ${x}, Y: ${y}`;

    if (canvas.width > 0 && canvas.height > 0) {
      const ctx = canvas.getContext('2d');
      try {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
        $('cursor-color').textContent = `HEX: ${hex} (A: ${pixel[3]})`;
      } catch {}
    }
  }

  async function onCanvasClick(e) {
    if (!isPickingMode || !currentKey) return;
    const canvas = $('preview-canvas');
    const rect = canvas.getBoundingClientRect();

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    $('telemetry-sample-pos').textContent = `Última amostra: X ${(normX * 100).toFixed(1)}%, Y ${(normY * 100).toFixed(1)}%`;

    // 1. Amostragem direta e instantânea no canvas local (0ms latência)
    let localHex = null;
    try {
      const ctx = canvas.getContext('2d');
      const cx = Math.floor(normX * canvas.width);
      const cy = Math.floor(normY * canvas.height);
      const imgData = ctx.getImageData(Math.max(0, cx - 1), Math.max(0, cy - 1), 3, 3).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        if (imgData[i + 3] > 10) { // Ignora pixels totalmente transparentes
          r += imgData[i];
          g += imgData[i + 1];
          b += imgData[i + 2];
          count++;
        }
      }
      if (count > 0) {
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        localHex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
      }
    } catch (err) {
      console.warn('Leitura de pixel local do canvas indisponível:', err);
    }

    // Se temos cor local, já atualiza a interface imediatamente
    if (localHex) {
      $('hex-color-input').value = localHex;
      $('color-box').style.background = localHex;
      document.querySelectorAll('#color-type-tabs .color-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-type') === 'custom');
      });
      $('custom-color-row').style.display = 'flex';
    }

    try {
      const res = await api('/api/chroma', 'POST', {
        action: 'chroma_sample',
        key: currentKey,
        x: normX,
        y: normY,
        radius: 4
      });

      const sample = res.chroma || {};
      const pickedHex = sample.hex || sample.color?.hex || localHex;
      if (pickedHex) {
        $('hex-color-input').value = pickedHex;
        $('color-box').style.background = pickedHex;

        // Ativa a aba "Personalizado"
        document.querySelectorAll('#color-type-tabs .color-tab').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-type') === 'custom');
        });
        $('custom-color-row').style.display = 'flex';

        // Desliga o modo conta-gotas e aplica a nova cor
        toggleEyedropper();
        await applyCurrentSettings();
      }
    } catch (err) {
      console.warn('Amostragem remota falhou, aplicando cor local:', err);
      if (localHex) {
        toggleEyedropper();
        await applyCurrentSettings();
      } else {
        alert('Erro na amostragem da cor: ' + err.message);
        toggleEyedropper();
      }
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
