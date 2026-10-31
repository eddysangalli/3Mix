'use strict';
(()=>{
  const E = id => document.getElementById(id);
  let state = null, overrides = {}, caps = null, dirty = false, loaded = false;

  async function request(data) {
    const r = await fetch('/api/iso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const v = await r.json();
    if (!r.ok || !v.success) throw Error(v.error || 'Falha ISO');
    return v;
  }

  function notice(s) {
    const m = E('message');
    if (m) {
      m.textContent = s;
      m.hidden = false;
    }
  }

  function base() {
    return Object.fromEntries(
      ['format', 'directory', 'prefix', 'encoder', 'crf', 'audio']
        .map(k => [k, E('iso-' + k) ? E('iso-' + k).value : ''])
        .concat([
          ['audioSourceUUID', E('iso-audio-source') ? E('iso-audio-source').value : ''],
          ['splitSeconds', Number(E('iso-split') ? E('iso-split').value : 0) * 60],
          ['width', Number(E('iso-width') ? E('iso-width').value : 0)],
          ['height', Number(E('iso-height') ? E('iso-height').value : 0)],
          ['fpsDivisor', Number(E('iso-fps') ? E('iso-fps').value : 1)],
          ['bitrate', Number(E('iso-bitrate') ? E('iso-bitrate').value : 0)],
          ['perInput', overrides]
        ])
    );
  }

  // Se a section #iso-extra já existe no HTML nativo, utiliza ela. Caso contrário, injeta como fallback.
  let panel = E('iso-extra');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'iso-extra';
    panel.className = 'iso-card iso-extra-card';
    panel.innerHTML = `
      <div class="card-header">
        <div class="card-title-group">
          <h3>🎛️ Personalização Por Entrada (Override)</h3>
          <p>Configuração individual de resolução, codec, bitrate e áudio para uma câmera específica</p>
        </div>
      </div>
      <div class="form-grid">
        <div class="field-col"><label>Largura (0 = original)<input id="iso-width" type="number" min="0" max="3840" step="2" value="0" class="form-control mono"></label></div>
        <div class="field-col"><label>Altura (0 = original)<input id="iso-height" type="number" min="0" max="3840" step="2" value="0" class="form-control mono"></label></div>
        <div class="field-col"><label>FPS<select id="iso-fps" class="form-control"><option value="1">FPS do projeto</option><option value="2">Metade</option><option value="3">Um terço</option><option value="4">Um quarto</option></select></label></div>
        <div class="field-col"><label>Bitrate (0 = CRF)<input id="iso-bitrate" type="number" min="0" max="50000" value="0" class="form-control mono"></label></div>
        <div class="field-col full-width"><label>Entrada<select id="iso-own-input" class="form-control"></select></label></div>
        <div class="field-col full-width"><label>Pasta desta entrada<input id="iso-own-dir" maxlength="500" placeholder="Vazio: pasta global" class="form-control"></label></div>
        <div class="field-col"><label>Resolução desta entrada<input id="iso-own-size" placeholder="Original ou 1280x720" class="form-control mono"></label></div>
        <div class="field-col"><label>Codificador desta entrada<select id="iso-own-encoder" class="form-control"><option value="">Herdar global</option></select></label></div>
        <div class="field-col"><label>FPS desta entrada<select id="iso-own-fps" class="form-control"><option value="">Herdar global</option><option value="1">Projeto</option><option value="2">Metade</option><option value="3">Um terço</option><option value="4">Um quarto</option></select></label></div>
        <div class="field-col"><label>Bitrate desta entrada<input id="iso-own-bitrate" type="number" min="0" max="50000" placeholder="Herdar global; 0 = CRF" class="form-control mono"></label></div>
        <div class="field-col"><label>Áudio desta entrada<select id="iso-own-audio" class="form-control"><option value="input">Entrada</option><option value="master">Master</option><option value="bus-a">Bus A</option><option value="bus-b">Bus B</option><option value="all-tracks">Todas as 6 trilhas</option><option value="source">Fonte pública com trilha 1</option></select></label></div>
        <div class="field-col"><label>Fonte de áudio desta entrada<select id="iso-own-audio-source" class="form-control"><option value="">Selecione fonte pública</option></select></label></div>
      </div>
      <div class="override-actions-bar">
        <button type="button" id="iso-own-set" class="btn btn-primary">Usar opções próprias</button>
        <button type="button" id="iso-own-clear" class="btn btn-secondary">Voltar às opções globais</button>
      </div>
      <p id="iso-own-list" class="override-summary-text"></p>
      <button type="button" id="iso-recover" class="btn btn-outline">Finalizar MP4 de sessão interrompida</button>
    `;
    const opts = E('iso-options');
    if (opts) opts.after(panel);
  }

  // Garante a existência da opção MP4 seguro no select
  const isoFmtSelect = E('iso-format');
  if (isoFmtSelect && ![...isoFmtSelect.options].some(o => o.value === 'mp4_safe')) {
    isoFmtSelect.add(new Option('MP4 seguro (MKV + remux)', 'mp4_safe'));
  }

  // Garante a existência do botão MP4 seguro na barra de tabs
  const tabsNav = document.querySelector('.iso-format-tabs');
  if (tabsNav && !document.querySelector('[data-iso-format="mp4_safe"]')) {
    const format = document.createElement('button');
    format.type = 'button';
    format.dataset.isoFormat = 'mp4_safe';
    format.className = 'format-btn';
    format.innerHTML = '<span class="fmt-icon">🎬</span><span class="fmt-name">MP4 Seguro</span><span class="fmt-desc">MKV + Remux</span>';
    tabsNav.append(format);
  }

  // Garante opções avançadas de áudio no select global
  const isoAudioSelect = E('iso-audio');
  if (isoAudioSelect) {
    for (const [value, label] of [['bus-a', 'Bus A (trilha 2)'], ['bus-b', 'Bus B (trilha 3)'], ['all-tracks', 'Todas as 6 trilhas']]) {
      if (![...isoAudioSelect.options].some(o => o.value === value)) {
        isoAudioSelect.add(new Option(label, value));
      }
    }
  }

  function list() {
    const elList = E('iso-own-list');
    if (!elList) return;
    const keys = Object.keys(overrides);
    elList.textContent = keys.length ? 'Opções próprias configuradas: ' + keys.join(' · ') : 'Todas as entradas usam as opções globais';
  }

  // Sincronização de tabs de formato
  if (tabsNav) {
    tabsNav.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-iso-format]');
      if (!b || b.disabled) return;
      document.querySelectorAll('.iso-format-tabs button').forEach(btn => btn.classList.remove('selected'));
      b.classList.add('selected');
      if (isoFmtSelect) isoFmtSelect.value = b.dataset.isoFormat;
      dirty = true;
    });
  }

  const isoOpts = E('iso-options');
  if (isoOpts) {
    isoOpts.addEventListener('input', () => dirty = true);
    isoOpts.addEventListener('change', () => dirty = true);
  }

  for (const [mode, target] of [['iso-audio', 'iso-audio-source'], ['iso-own-audio', 'iso-own-audio-source']]) {
    const modeEl = E(mode), targetEl = E(target);
    if (modeEl && targetEl) {
      modeEl.addEventListener('change', () => {
        targetEl.disabled = !!state?.rec || modeEl.value !== 'source';
      });
    }
  }

  const btnSet = E('iso-own-set');
  if (btnSet) {
    btnSet.onclick = () => {
      try {
        const inpSelect = E('iso-own-input');
        const name = inpSelect ? inpSelect.value : '';
        if (!name) throw Error('Selecione uma entrada para aplicar opções próprias');
        const sizeInput = E('iso-own-size');
        const size = sizeInput ? sizeInput.value.trim() : '';
        let width = 0, height = 0;
        if (size) {
          const m = /^(\d+)x(\d+)$/.exec(size);
          if (!m) throw Error('Use o formato largura x altura, por exemplo 1280x720');
          [width, height] = m.slice(1).map(Number);
        }
        overrides[name] = {
          directory: E('iso-own-dir') ? E('iso-own-dir').value : '',
          width,
          height,
          audio: E('iso-own-audio') ? E('iso-own-audio').value : 'input',
          audioSourceUUID: E('iso-own-audio-source') ? E('iso-own-audio-source').value : '',
          ...(E('iso-own-encoder') && E('iso-own-encoder').value ? { encoder: E('iso-own-encoder').value } : {}),
          ...(E('iso-own-fps') && E('iso-own-fps').value ? { fpsDivisor: Number(E('iso-own-fps').value) } : {}),
          ...(E('iso-own-bitrate') && E('iso-own-bitrate').value !== '' ? { bitrate: Number(E('iso-own-bitrate').value) } : {})
        };
        dirty = true;
        list();
        notice(`Opções próprias aplicadas à entrada "${name}". Salve antes de iniciar.`);
      } catch (e) {
        notice(e.message);
      }
    };
  }

  const btnClear = E('iso-own-clear');
  if (btnClear) {
    btnClear.onclick = () => {
      const inpSelect = E('iso-own-input');
      const name = inpSelect ? inpSelect.value : '';
      if (name && overrides[name]) {
        delete overrides[name];
        dirty = true;
        list();
        notice(`Entrada "${name}" restaurada para o padrão global.`);
      }
    };
  }

  const inpOwn = E('iso-own-input');
  if (inpOwn) {
    inpOwn.onchange = () => {
      const o = overrides[inpOwn.value] || {};
      if (E('iso-own-dir')) E('iso-own-dir').value = o.directory || '';
      if (E('iso-own-size')) E('iso-own-size').value = o.width ? o.width + 'x' + o.height : '';
      if (E('iso-own-audio')) E('iso-own-audio').value = o.audio || 'input';
      if (E('iso-own-audio-source')) E('iso-own-audio-source').value = o.audioSourceUUID || '';
      if (E('iso-own-encoder')) E('iso-own-encoder').value = o.encoder || '';
      if (E('iso-own-fps')) E('iso-own-fps').value = o.fpsDivisor || '';
      if (E('iso-own-bitrate')) E('iso-own-bitrate').value = o.bitrate ?? '';
    };
  }

  if (panel) {
    panel.addEventListener('input', () => dirty = true);
    panel.addEventListener('change', () => dirty = true);
  }

  document.addEventListener('click', async e => {
    const id = e.target.id;
    if (!['iso-save', 'iso-start', 'iso-stop', 'iso-recover'].includes(id)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    e.target.disabled = true;

    try {
      if (id === 'iso-save') {
        await request({ action: 'configure', options: base() });
        dirty = false;
        notice('Opções da MultiGravação ISO salvas com sucesso no motor.');
      } else if (id === 'iso-start') {
        if (dirty) {
          await request({ action: 'configure', options: base() });
          dirty = false;
        }
        const cams = [...document.querySelectorAll('[data-iso]:checked')].map(x => x.dataset.iso);
        if (!cams.length) {
          throw Error('Marque pelo menos uma câmera/entrada para iniciar a MultiGravação.');
        }
        const value = await request({ action: 'start', cams });
        notice('MultiGravação ISO iniciada! Gravando arquivos em disco.');
        if (value?.iso) state = value.iso;
      } else if (id === 'iso-stop') {
        const value = await request({ action: 'stop' });
        notice('MultiGravação ISO parada. Todos os arquivos foram fechados e finalizados.');
        if (value?.iso) state = value.iso;
      } else if (id === 'iso-recover') {
        await request({ action: 'recover' });
        notice('MP4 finalizados com sucesso; arquivos MKV originais preservados.');
      }
    } catch (error) {
      notice(error.message);
    } finally {
      if (id === 'iso-start') e.target.disabled = !!state?.rec;
      if (id === 'iso-stop') e.target.disabled = !state?.rec;
      if (id === 'iso-save') e.target.disabled = false;
      if (id === 'iso-recover') e.target.disabled = false;
    }
  }, true);

  // Polling e Atualização Periódica de Telemetria do Motor
  setInterval(async () => {
    try {
      const live = await fetch('/api/json').then(r => r.json()).catch(() => ({}));
      const read = await fetch('/api/iso').then(r => r.json()).catch(() => ({}));
      if (!read.success) throw Error(read.error || 'ISO indisponível');
      state = read.iso;
      if (!state) return;

      // Status Visual da Conexão
      const connPill = E('connection-pill');
      const connText = E('connection');
      const ledDot = E('led-indicator');
      if (connText) connText.textContent = state.rec ? 'Gravando ISO' : 'Conectado ao Motor';
      if (ledDot) {
        ledDot.style.background = state.rec ? '#ef4444' : '#00e676';
        ledDot.style.boxShadow = state.rec ? '0 0 10px #ef4444' : '0 0 8px #00e676';
      }

      // Status do Tally REC
      const statusTitle = E('iso-status');
      const statusWrap = E('iso-status-wrap');
      const tallyDot = E('tally-rec-dot');
      if (statusTitle) {
        statusTitle.textContent = state.rec ? 'ISO GRAVANDO' : 'ISO Parado';
        statusTitle.style.color = state.rec ? '#ef4444' : '#94a3b8';
      }
      if (statusWrap) {
        statusWrap.style.borderColor = state.rec ? '#ef4444' : '#2e3744';
        statusWrap.style.background = state.rec ? '#2b1014' : '#141820';
      }
      if (tallyDot) {
        tallyDot.style.display = state.rec ? 'inline-block' : 'none';
      }

      const btnStart = E('iso-start');
      const btnStop = E('iso-stop');
      if (btnStart) btnStart.disabled = !!state.rec;
      if (btnStop) btnStop.disabled = !state.rec;

      const o = state.recordOptions || {};
      const choices = state.audioChoices || [];

      for (const id of ['iso-audio', 'iso-own-audio']) {
        const el = E(id);
        if (el) {
          const opt = el.querySelector('option[value=source]');
          if (opt) {
            opt.textContent = state.audioBusSourceSupported ? 'Fonte ou barramento independente' : 'Fonte pública com trilha 1';
          }
        }
      }

      const noteEl = E('iso-source-note');
      if (noteEl && state.audioSourceLimit) {
        noteEl.textContent = 'Grava cada entrada com suas camadas. ' + state.audioSourceLimit;
      }

      for (const id of ['iso-audio-source', 'iso-own-audio-source']) {
        const select = E(id);
        if (!select) continue;
        const value = select.value;
        const signature = JSON.stringify(choices);
        if (select.dataset.choices !== signature) {
          select.dataset.choices = signature;
          select.replaceChildren(new Option('Selecione fonte pública', ''), ...choices.map(s => new Option((s.bus ? 'Bus · ' : '') + s.name, s.key)));
          if (choices.some(s => s.key === value)) select.value = value;
        }
      }

      if (!loaded || !dirty) {
        for (const k of ['width', 'height', 'fpsDivisor', 'bitrate']) {
          const target = E(k === 'fpsDivisor' ? 'iso-fps' : 'iso-' + k);
          if (target) target.value = o[k] ?? (k === 'fpsDivisor' ? 1 : 0);
        }
        if (E('iso-audio-source')) E('iso-audio-source').value = o.audioSourceUUID || '';
        overrides = structuredClone(o.perInput || {});
        list();
        loaded = true;
      }

      const current = inpOwn ? inpOwn.value : '';
      const names = (live.scenes || []).filter(n => !/^REPLAY /.test(n) && n !== 'FreeMix Barramentos');
      if (inpOwn && JSON.stringify(names) !== inpOwn.dataset.names) {
        inpOwn.dataset.names = JSON.stringify(names);
        inpOwn.replaceChildren(new Option('Selecione uma entrada…', ''), ...names.map(n => new Option(n, n)));
        if (names.includes(current)) inpOwn.value = current;
      }

      if (panel) {
        for (const field of panel.querySelectorAll('input,select,button')) {
          if (field.id !== 'iso-recover') field.disabled = !!state.rec;
        }
      }

      if (!caps) {
        const r = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'outputs_get' })
        }).then(res => res.json()).catch(() => null);

        caps = r?.outputs?.encoders;
        if (caps) {
          const encGlobal = E('iso-encoder');
          const encOwn = E('iso-own-encoder');
          if (encGlobal) {
            const selected = encGlobal.value;
            encGlobal.replaceChildren(new Option('CPU padrão', 'default'), ...caps.map(c => new Option((c.codec === 'hevc' ? 'HEVC / H.265' : c.codec === 'av1' ? 'AV1' : 'H.264') + ' · ' + c.name, c.id)));
            encGlobal.value = selected;
          }
          if (encOwn) {
            encOwn.replaceChildren(new Option('Herdar global', ''), ...caps.map(c => new Option(c.name, c.id)));
          }
        }
      }

      const hintEl = E('iso-source-hint');
      if (hintEl) {
        const audioGlobal = E('iso-audio') ? E('iso-audio').value : '';
        const sourceGlobal = E('iso-audio-source') ? E('iso-audio-source').value : '';
        hintEl.textContent = (audioGlobal === 'source' && !choices.some(s => s.key === sourceGlobal)) ? 'Fonte direta indisponível na rota atual. ' + (state.audioSourceLimit || '') : '';
      }

      if (E('iso-audio-source')) E('iso-audio-source').disabled = !!state.rec || (E('iso-audio') && E('iso-audio').value !== 'source');
      if (E('iso-own-audio-source')) E('iso-own-audio-source').disabled = !!state.rec || (E('iso-own-audio') && E('iso-own-audio').value !== 'source');

      if (state.session?.cams) {
        const finals = state.session.cams.flatMap(c => c.finalFiles || []);
        if (finals.length) {
          const ul = E('iso-files');
          if (ul) {
            for (const file of finals) {
              const li = document.createElement('li');
              li.textContent = 'MP4 Finalizado: ' + file;
              if (![...ul.children].some(e => e.textContent === li.textContent)) {
                ul.append(li);
              }
            }
          }
        }
      }
    } catch {
      // Estado de reconexão gracioso
      const connText = E('connection');
      const ledDot = E('led-indicator');
      if (connText) connText.textContent = 'Reconectando ao Motor…';
      if (ledDot) {
        ledDot.style.background = '#f59e0b';
        ledDot.style.boxShadow = '0 0 8px #f59e0b';
      }
    }
  }, 1500);

})();
