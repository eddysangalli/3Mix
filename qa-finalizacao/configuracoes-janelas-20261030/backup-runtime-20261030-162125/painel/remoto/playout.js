/**
 * FreeMix Playout Controller — Interface Operacional do Media/Playout Engine
 * Comunicação direta com o backend nativo do FreeMix (libobs/FFmpeg)
 */

(() => {
  let state = null;
  let ws = null;
  let pollTimer = null;
  let animFrame = null;
  let selectedItemIds = new Set();
  let dragSrcIndex = null;

  // Elementos da interface
  const connEl = document.getElementById('connection');
  const plSelect = document.getElementById('pl-select');
  const plName = document.getElementById('pl-name');
  const plSaveBtn = document.getElementById('pl-save');
  const plNewBtn = document.getElementById('pl-new');
  const plDupBtn = document.getElementById('pl-duplicate');
  const plDelBtn = document.getElementById('pl-delete');
  const btnRemoteMon = document.getElementById('btn-remote-monitor');

  // Preview elements
  const pvBadge = document.getElementById('pv-badge');
  const pvPlaceholder = document.getElementById('pv-placeholder');
  const pvThumb = document.getElementById('pv-thumb');
  const pvTitle = document.getElementById('pv-title');
  const pvCur = document.getElementById('pv-cur');
  const pvDur = document.getElementById('pv-dur');
  const pvProgress = document.getElementById('pv-progress');
  const pvSeekWrap = document.getElementById('pv-seek-wrap');
  const pvIn = document.getElementById('pv-in');
  const pvOut = document.getElementById('pv-out');
  const pvPreloadTime = document.getElementById('pv-preload-time');

  // Program elements
  const pgmBadge = document.getElementById('pgm-badge');
  const pgmPlaceholder = document.getElementById('pgm-placeholder');
  const pgmThumb = document.getElementById('pgm-thumb');
  const pgmTitle = document.getElementById('pgm-title');
  const pgmCur = document.getElementById('pgm-cur');
  const pgmRem = document.getElementById('pgm-rem');
  const pgmProgress = document.getElementById('pgm-progress');
  const pgmSeekWrap = document.getElementById('pgm-seek-wrap');
  const pgmRestart = document.getElementById('pgm-restart');
  const pgmPlay = document.getElementById('pgm-play');
  const pgmPause = document.getElementById('pgm-pause');
  const pgmStop = document.getElementById('pgm-stop');
  const pgmLoop = document.getElementById('pgm-loop');
  const pgmFreeze = document.getElementById('pgm-freeze');

  // Take elements
  const btnTake = document.getElementById('btn-take');
  const btnTakeNext = document.getElementById('btn-take-next');
  const takeTrans = document.getElementById('take-trans');
  const takeMs = document.getElementById('take-ms');

  // Playlist table & tools
  const plTbody = document.getElementById('pl-tbody');
  const plTotalInfo = document.getElementById('pl-total-info');
  const btnAddFile = document.getElementById('btn-add-file');
  const btnLinkChain = document.getElementById('btn-link-chain');
  const btnUnlinkChain = document.getElementById('btn-unlink-chain');
  const btnMoveUp = document.getElementById('btn-move-up');
  const btnMoveDown = document.getElementById('btn-move-down');
  const btnDupItem = document.getElementById('btn-dup-item');
  const btnRemItem = document.getElementById('btn-rem-item');
  const optAutoNext = document.getElementById('opt-autonext');
  const optLoopList = document.getElementById('opt-loop-list');

  // Helpers de formatação de tempo (HH:MM:SS ou MM:SS.ms)
  function formatTime(ms, includeMs = false) {
    if (!ms || isNaN(ms) || ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    let out = hours > 0 ? `${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
    if (includeMs) {
      const millis = Math.floor((ms % 1000) / 100);
      out += `.${millis}`;
    }
    return out;
  }

  function formatTimeNegative(ms) {
    if (!ms || isNaN(ms) || ms < 0) ms = 0;
    return `-${formatTime(ms)}`;
  }

  // Envio de comandos ao motor
  async function sendCommand(action, data = {}) {
    try {
      const resp = await fetch('/api/playout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const res = await resp.json();
      if (res.playout) {
        applyState(res.playout);
      }
      return res;
    } catch (e) {
      console.error('Falha ao enviar comando de playout:', e);
      if (connEl) connEl.textContent = `Erro: ${e.message}`;
    }
  }

  // Carregamento inicial de estado
  async function fetchState() {
    try {
      const resp = await fetch('/api/playout');
      if (resp.ok) {
        const data = await resp.json();
        applyState(data);
        if (connEl) {
          connEl.textContent = 'Conectado';
          connEl.className = 'vd-note';
          connEl.style.color = '#34d399';
        }
      }
    } catch (e) {
      if (connEl) {
        connEl.textContent = 'Desconectado';
        connEl.style.color = '#f87171';
      }
    }
  }

  // Aplicação do estado vindo do motor
  function applyState(s) {
    if (!s) return;
    state = s;

    // 1. Atualizar Playlists dropdown
    if (plSelect && Array.isArray(s.lists)) {
      const currentVal = plSelect.value;
      plSelect.innerHTML = '';
      for (const l of s.lists) {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = `${l.name} (${l.itemCount || (l.items ? l.items.length : 0)} itens)`;
        if (l.id === s.activeListId) opt.selected = true;
        plSelect.appendChild(opt);
      }
      if (s.activeList) {
        plName.value = s.activeList.name || '';
        optAutoNext.checked = s.activeList.autoAdvance !== false;
        optLoopList.checked = !!s.activeList.loop;
      }
    }

    // 2. Atualizar Canal Preview
    renderPreview(s.preview);

    // 3. Atualizar Canal Program
    renderProgram(s.program);

    // 4. Atualizar Tabela de Itens
    renderTable(s.activeList?.items || []);

    // 5. Totalizador
    if (plTotalInfo && s.activeList?.items) {
      const items = s.activeList.items;
      const totalDur = items.reduce((acc, it) => acc + Math.max(0, (it.outMs || it.durationMs) - (it.inMs || 0)), 0);
      plTotalInfo.textContent = `${items.length} itens · Duração Total: ${formatTime(totalDur)}`;
    }
  }

  function renderPreview(pv) {
    if (!pv || !pv.item) {
      pvBadge.textContent = 'STANDBY';
      pvBadge.className = 'badge-pv';
      pvBadge.style.borderColor = '#007791';
      pvPlaceholder.hidden = false;
      pvThumb.hidden = true;
      pvTitle.hidden = true;
      pvCur.textContent = '00:00:00';
      pvDur.textContent = 'Duração: 00:00:00';
      pvProgress.style.width = '0%';
      pvIn.value = 0;
      pvOut.value = 0;
      pvPreloadTime.textContent = 'Preload: 0ms';
      return;
    }

    const item = pv.item;
    pvPlaceholder.hidden = true;
    pvTitle.hidden = false;
    pvTitle.textContent = item.title || item.file || 'Item Sem Título';

    if (item.thumbnail) {
      pvThumb.src = item.thumbnail;
      pvThumb.hidden = false;
    } else {
      pvThumb.hidden = true;
    }

    // Badge status de preload
    pvBadge.textContent = (pv.preloadState || 'READY').toUpperCase();
    if (pv.preloadState === 'ready') {
      pvBadge.style.background = '#064e3b';
      pvBadge.style.borderColor = '#10b981';
      pvBadge.style.color = '#a7f3d0';
    } else if (pv.preloadState === 'loading') {
      pvBadge.style.background = '#78350f';
      pvBadge.style.borderColor = '#f59e0b';
      pvBadge.style.color = '#fde68a';
    } else if (pv.preloadState === 'error') {
      pvBadge.style.background = '#7f1d1d';
      pvBadge.style.borderColor = '#ef4444';
      pvBadge.style.color = '#fecaca';
    }

    const dur = (item.outMs && item.outMs > item.inMs) ? (item.outMs - (item.inMs || 0)) : (item.durationMs || 0);
    pvCur.textContent = formatTime(item.inMs || 0);
    pvDur.textContent = `Duração: ${formatTime(dur)}`;
    pvIn.value = item.inMs || 0;
    pvOut.value = item.outMs || item.durationMs || 0;
    pvPreloadTime.textContent = `Preload: ${pv.preloadDurationMs || 0}ms`;

    if (pv.transition) takeTrans.value = pv.transition;
    if (pv.transitionMs) takeMs.value = pv.transitionMs;
  }

  function renderProgram(pgm) {
    if (!pgm || !pgm.item || pgm.status === 'stopped') {
      pgmBadge.textContent = 'STOPPED';
      pgmBadge.className = 'badge-pgm';
      pgmBadge.style.background = '#1e242b';
      pgmBadge.style.borderColor = '#374151';
      pgmBadge.style.color = '#9ca3af';
      pgmPlaceholder.hidden = false;
      pgmThumb.hidden = true;
      pgmTitle.hidden = true;
      pgmCur.textContent = '00:00:00';
      pgmRem.textContent = '-00:00:00';
      pgmProgress.style.width = '0%';
      return;
    }

    const item = pgm.item;
    pgmPlaceholder.hidden = true;
    pgmTitle.hidden = false;
    pgmTitle.textContent = item.title || item.file || 'Item Em Exibição';

    if (item.thumbnail) {
      pgmThumb.src = item.thumbnail;
      pgmThumb.hidden = false;
    } else {
      pgmThumb.hidden = true;
    }

    // Status badge
    const st = (pgm.status || 'PLAYING').toUpperCase();
    pgmBadge.textContent = st;
    if (pgm.status === 'playing') {
      pgmBadge.style.background = '#7f1d1d';
      pgmBadge.style.borderColor = '#dc2626';
      pgmBadge.style.color = '#fca5a5';
    } else if (pgm.status === 'paused') {
      pgmBadge.style.background = '#78350f';
      pgmBadge.style.borderColor = '#d97706';
      pgmBadge.style.color = '#fde68a';
    } else if (pgm.status === 'frozen') {
      pgmBadge.style.background = '#1e3a8a';
      pgmBadge.style.borderColor = '#2563eb';
      pgmBadge.style.color = '#bfdbfe';
    }

    pgmLoop.checked = !!pgm.loop;
    pgmFreeze.checked = pgm.endBehavior === 'freeze';

    updateProgramTimers();
  }

  // Interpolação local precisa para contagem suave de tempo
  function updateProgramTimers() {
    if (!state || !state.program || !state.program.item) return;
    const pgm = state.program;
    let pos = pgm.positionMs || 0;
    const dur = pgm.durationMs || 0;

    if (pgm.status === 'playing' && pgm.startedAt) {
      const elapsed = Date.now() - pgm.startedAt;
      pos = Math.min(dur, (pgm.positionMs || 0) + elapsed);
    }

    const rem = Math.max(0, dur - pos);
    pgmCur.textContent = formatTime(pos, true);
    pgmRem.textContent = formatTimeNegative(rem);

    const pct = dur > 0 ? Math.min(100, Math.max(0, (pos / dur) * 100)) : 0;
    pgmProgress.style.width = `${pct}%`;
  }

  // Renderização da tabela broadcast
  function renderTable(items) {
    if (!plTbody) return;
    plTbody.innerHTML = '';

    const pgmItemId = state?.program?.item?.id;
    const pvItemId = state?.preview?.item?.id;

    items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.id = item.id;
      tr.dataset.index = idx;
      tr.draggable = true;

      const isPgm = pgmItemId === item.id;
      const isPv = pvItemId === item.id;
      const isSel = selectedItemIds.has(item.id);

      if (isPgm) tr.classList.add('is-on-air');
      else if (isPv) tr.classList.add('is-preview');
      else if (isSel) tr.classList.add('selected');

      // 1. Coluna Index / Status
      const tdIdx = document.createElement('td');
      tdIdx.style.textAlign = 'center';
      tdIdx.textContent = String(idx + 1);

      // 2. Coluna Status
      const tdStatus = document.createElement('td');
      if (isPgm) {
        tdStatus.innerHTML = `<span class="badge-state playing">NO AR</span>`;
      } else if (isPv) {
        tdStatus.innerHTML = `<span class="badge-state ready">PREVIEW</span>`;
      } else {
        tdStatus.innerHTML = `<span class="badge-state idle">STANDBY</span>`;
      }

      // 3. Coluna Cadeia (Linked Chain)
      const tdChain = document.createElement('td');
      if (item.chainId) {
        const shortChain = item.chainId.slice(0, 4).toUpperCase();
        tdChain.innerHTML = `<span class="badge-chain" title="Cadeia ${item.chainId}">🔗 C-${shortChain} #${item.chainOrder + 1}</span>`;
      } else {
        tdChain.innerHTML = `<span style="color:#4b5563;">—</span>`;
      }

      // 4. Coluna Título / Arquivo
      const tdTitle = document.createElement('td');
      tdTitle.innerHTML = `<b style="color:#fff;">${escapeHtml(item.title || 'Sem Título')}</b><br><small style="color:#8e9ca8; font-size:10px;">${escapeHtml(item.file || item.input || 'Sem origem')}</small>`;

      // 5. IN
      const tdIn = document.createElement('td');
      tdIn.textContent = formatTime(item.inMs || 0);

      // 6. OUT
      const tdOut = document.createElement('td');
      tdOut.textContent = (item.outMs && item.outMs > 0) ? formatTime(item.outMs) : formatTime(item.durationMs || 0);

      // 7. Duração calculada
      const dur = (item.outMs && item.outMs > item.inMs) ? (item.outMs - (item.inMs || 0)) : (item.durationMs || 0);
      const tdDur = document.createElement('td');
      tdDur.style.fontWeight = '700';
      tdDur.textContent = formatTime(dur);

      // 8. Transição
      const tdTrans = document.createElement('td');
      tdTrans.textContent = `${(item.transitionIn || 'cut').toUpperCase()} (${item.transitionMs || 500}ms)`;

      // 9. Ao Terminar
      const tdEnd = document.createElement('td');
      const endMap = {
        'play_next': '▶ Play Next',
        'freeze': '❄ Freeze Frame',
        'loop': '🔁 Loop',
        'stop': '⏹ Stop',
        'hold': '⏸ Hold'
      };
      tdEnd.textContent = endMap[item.endBehavior] || item.endBehavior || '▶ Play Next';

      // 10. Ganho Áudio (Adjust Gain individual por clipe - TriCaster DDR style)
      const tdGain = document.createElement('td');
      const gainInput = document.createElement('input');
      gainInput.type = 'number';
      gainInput.min = '-30';
      gainInput.max = '30';
      gainInput.step = '0.5';
      gainInput.value = Number(item.audioGainDb || 0);
      gainInput.style.width = '48px';
      gainInput.style.height = '20px';
      gainInput.style.fontSize = '11px';
      gainInput.style.textAlign = 'right';
      gainInput.style.background = '#0a0d12';
      gainInput.style.color = '#38bdf8';
      gainInput.style.border = '1px solid #1f2732';
      gainInput.style.borderRadius = '3px';
      gainInput.title = 'Ajuste de Ganho individual deste clipe (dB) — TriCaster DDR';
      gainInput.addEventListener('click', (e) => e.stopPropagation());
      gainInput.addEventListener('change', async (e) => {
        e.stopPropagation();
        const val = Math.max(-30, Math.min(30, Number(gainInput.value || 0)));
        gainInput.value = val;
        await sendCommand('playout_item_update', { itemId: item.id, audioGainDb: val });
      });
      const gainSpan = document.createElement('span');
      gainSpan.textContent = ' dB';
      gainSpan.style.fontSize = '10px';
      gainSpan.style.color = '#94a3b8';
      tdGain.append(gainInput, gainSpan);

      tr.append(tdIdx, tdStatus, tdChain, tdTitle, tdIn, tdOut, tdDur, tdTrans, tdEnd, tdGain);

      // Eventos de clique na linha
      tr.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          if (selectedItemIds.has(item.id)) selectedItemIds.delete(item.id);
          else selectedItemIds.add(item.id);
        } else if (e.shiftKey && selectedItemIds.size > 0) {
          // Seleção contígua
          const firstId = Array.from(selectedItemIds)[0];
          const firstIdx = items.findIndex(i => i.id === firstId);
          selectedItemIds.clear();
          const start = Math.min(firstIdx, idx);
          const end = Math.max(firstIdx, idx);
          for (let i = start; i <= end; i++) {
            selectedItemIds.add(items[i].id);
          }
        } else {
          selectedItemIds.clear();
          selectedItemIds.add(item.id);
        }
        renderTable(items);
      });

      // Duplo clique arma o item no PREVIEW para TAKE imediato
      tr.addEventListener('dblclick', () => {
        sendCommand('playout_preview_clip', { itemId: item.id });
      });

      // Drag and Drop para reordenação
      tr.addEventListener('dragstart', (e) => {
        dragSrcIndex = idx;
        e.dataTransfer.effectAllowed = 'move';
        tr.style.opacity = '0.5';
      });

      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragSrcIndex !== null && dragSrcIndex !== idx) {
          reorderItems(dragSrcIndex, idx);
        }
      });

      tr.addEventListener('dragend', () => {
        tr.style.opacity = '1';
        dragSrcIndex = null;
      });

      plTbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function reorderItems(fromIdx, toIdx) {
    if (!state || !state.activeList || !state.activeList.items) return;
    const items = [...state.activeList.items];
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    await sendCommand('playout_save_playlist', {
      id: state.activeList.id,
      name: state.activeList.name,
      items,
      loop: state.activeList.loop,
      autoAdvance: state.activeList.autoAdvance,
      transition: state.activeList.transition,
      fadeMs: state.activeList.fadeMs
    });
  }

  // --- Handlers dos Botões e Controles de Transporte ---

  // TAKE: Comuta Preview para Program com a transição atual
  btnTake?.addEventListener('click', () => {
    sendCommand('playout_take', {
      transition: takeTrans.value,
      transitionMs: Number(takeMs.value || 500)
    });
  });

  // TAKE NEXT: Dispara próximo clip da lista
  btnTakeNext?.addEventListener('click', () => {
    sendCommand('playout_next');
  });

  // Transport Program
  pgmPlay?.addEventListener('click', () => sendCommand('playout_play'));
  pgmPause?.addEventListener('click', () => sendCommand('playout_pause'));
  pgmStop?.addEventListener('click', () => sendCommand('playout_stop'));
  pgmRestart?.addEventListener('click', () => sendCommand('playout_restart'));

  pgmLoop?.addEventListener('change', () => {
    const item = state?.program?.item;
    if (item) {
      sendCommand('playout_item_update', { itemId: item.id, loop: pgmLoop.checked });
    }
  });

  pgmFreeze?.addEventListener('change', () => {
    const item = state?.program?.item;
    if (item) {
      sendCommand('playout_item_update', {
        itemId: item.id,
        endBehavior: pgmFreeze.checked ? 'freeze' : 'play_next'
      });
    }
  });

  // Seek ao clicar na barra de progresso do Program
  pgmSeekWrap?.addEventListener('click', (e) => {
    if (!state?.program?.durationMs) return;
    const rect = pgmSeekWrap.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetMs = Math.round(pct * state.program.durationMs);
    sendCommand('playout_seek', { positionMs: targetMs });
  });

  // Seleção e Troca de Playlist
  plSelect?.addEventListener('change', () => {
    const id = plSelect.value;
    if (id) sendCommand('playout_load_playlist', { id });
  });

  // Salvar Playlist
  plSaveBtn?.addEventListener('click', () => {
    if (!state?.activeList) return;
    sendCommand('playout_save_playlist', {
      id: state.activeList.id,
      name: plName.value.trim() || 'Playlist Sem Nome',
      items: state.activeList.items,
      loop: optLoopList.checked,
      autoAdvance: optAutoNext.checked,
      transition: takeTrans.value,
      fadeMs: Number(takeMs.value || 500)
    });
  });

  // Nova Playlist
  plNewBtn?.addEventListener('click', () => {
    const name = prompt('Nome da nova playlist:', 'Nova Playlist');
    if (name) {
      sendCommand('playout_save_playlist', {
        name: name.trim(),
        items: [],
        loop: false,
        autoAdvance: true
      });
    }
  });

  // Duplicar Playlist
  plDupBtn?.addEventListener('click', () => {
    if (!state?.activeList) return;
    sendCommand('playout_save_playlist', {
      name: `${state.activeList.name} (Cópia)`,
      items: JSON.parse(JSON.stringify(state.activeList.items || [])),
      loop: state.activeList.loop,
      autoAdvance: state.activeList.autoAdvance
    });
  });

  // Excluir Playlist
  plDelBtn?.addEventListener('click', () => {
    if (!state?.activeList) return;
    if (confirm(`Excluir a playlist "${state.activeList.name}"?`)) {
      sendCommand('playout_delete_playlist', { id: state.activeList.id });
    }
  });

  // Monitor Remoto
  btnRemoteMon?.addEventListener('click', () => {
    window.open('/playout-monitor', 'FreeMixPlayoutMonitor', 'width=1024,height=600,menubar=no,toolbar=no');
  });

  // Adicionar Vídeo(s)
  btnAddFile?.addEventListener('click', () => {
    const path = prompt('Caminho absoluto do arquivo de vídeo ou áudio (ou nome de Input do FreeMix):');
    if (!path || !path.trim()) return;
    const cleanPath = path.trim();
    const filename = cleanPath.split(/[/\\]/).pop() || 'Arquivo';
    
    const newItem = {
      title: filename.replace(/\.[^/.]+$/, ''),
      file: cleanPath,
      inMs: 0,
      outMs: 0,
      durationMs: 0,
      transitionIn: takeTrans.value || 'fade',
      transitionMs: Number(takeMs.value || 500),
      endBehavior: 'play_next',
      autoNext: true,
      audioGainDb: 0
    };

    const items = [...(state?.activeList?.items || []), newItem];
    sendCommand('playout_save_playlist', {
      id: state.activeList.id,
      name: state.activeList.name,
      items
    });
  });

  // Vincular Cadeia (Linked Clips)
  btnLinkChain?.addEventListener('click', () => {
    if (selectedItemIds.size < 2) {
      alert('Selecione pelo menos 2 clipes com Ctrl+Clique para vincular em cadeia (ex: Vinheta IN + VT + Vinheta OUT).');
      return;
    }
    sendCommand('playout_chain_link', { itemIds: Array.from(selectedItemIds) });
  });

  // Desvincular Cadeia
  btnUnlinkChain?.addEventListener('click', () => {
    if (selectedItemIds.size === 0) return;
    sendCommand('playout_chain_unlink', { itemIds: Array.from(selectedItemIds) });
  });

  // Mover para Cima
  btnMoveUp?.addEventListener('click', () => {
    if (selectedItemIds.size !== 1 || !state?.activeList?.items) return;
    const id = Array.from(selectedItemIds)[0];
    const idx = state.activeList.items.findIndex(i => i.id === id);
    if (idx > 0) reorderItems(idx, idx - 1);
  });

  // Mover para Baixo
  btnMoveDown?.addEventListener('click', () => {
    if (selectedItemIds.size !== 1 || !state?.activeList?.items) return;
    const id = Array.from(selectedItemIds)[0];
    const idx = state.activeList.items.findIndex(i => i.id === id);
    if (idx >= 0 && idx < state.activeList.items.length - 1) reorderItems(idx, idx + 1);
  });

  // Duplicar Item Selecionado
  btnDupItem?.addEventListener('click', () => {
    if (selectedItemIds.size !== 1 || !state?.activeList?.items) return;
    const id = Array.from(selectedItemIds)[0];
    const idx = state.activeList.items.findIndex(i => i.id === id);
    if (idx >= 0) {
      const items = [...state.activeList.items];
      const dup = JSON.parse(JSON.stringify(items[idx]));
      dup.id = null; // Backend gera novo
      dup.title = `${dup.title} (Cópia)`;
      items.splice(idx + 1, 0, dup);
      sendCommand('playout_save_playlist', {
        id: state.activeList.id,
        name: state.activeList.name,
        items
      });
    }
  });

  // Remover Item(ns) Selecionado(s)
  btnRemItem?.addEventListener('click', () => {
    if (selectedItemIds.size === 0 || !state?.activeList?.items) return;
    const items = state.activeList.items.filter(i => !selectedItemIds.has(i.id));
    selectedItemIds.clear();
    sendCommand('playout_save_playlist', {
      id: state.activeList.id,
      name: state.activeList.name,
      items
    });
  });

  // Atualização de IN/OUT a partir dos campos do Preview
  pvIn?.addEventListener('change', () => {
    const item = state?.preview?.item;
    if (item) {
      sendCommand('playout_item_update', { itemId: item.id, inMs: Number(pvIn.value || 0) });
    }
  });

  pvOut?.addEventListener('change', () => {
    const item = state?.preview?.item;
    if (item) {
      sendCommand('playout_item_update', { itemId: item.id, outMs: Number(pvOut.value || 0) });
    }
  });

  // Loop contínuo de animação para os cronômetros a 60fps
  function tick() {
    updateProgramTimers();
    animFrame = requestAnimationFrame(tick);
  }

  // Inicialização e Polling
  fetchState();
  pollTimer = setInterval(fetchState, 1000);
  animFrame = requestAnimationFrame(tick);

  window.addEventListener('beforeunload', () => {
    if (pollTimer) clearInterval(pollTimer);
    if (animFrame) cancelAnimationFrame(animFrame);
  });
})();
