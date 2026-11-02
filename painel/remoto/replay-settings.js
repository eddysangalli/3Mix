// DRAFT-replay-settings-r4.js
// Controlador autoral da interface de configurações compacta ReplaySettings (700x540).
// Comunica-se com os contratos estritos de /api/replay (DiskReplay / ReplaySincronia).
(() => {
  'use strict';

  // --- Elementos do DOM ---
  const el = id => document.getElementById(id);
  const tabBtns = document.querySelectorAll('.vd-tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // --- Estado Interno e Rascunhos ---
  let replayState = null;
  let isBusy = false;
  let uncertainOp = null; // { action: string, data: object, epoch: number, timestamp: number }
  let activeTab = 'session';
  let stateEpoch = 0;

  // Rascunhos de edição do operador (isolados do polling e desacoplados por entidade)
  let selectedCamsDraft = Array(8).fill('');
  let camsDirty = false;
  let retentionDirty = false;
  const cameraDrafts = {}; // { [camName]: { recordAudio: string, gainDb: number, muted: boolean, offsetFrames: number } }
  let selectedAudioCam = '';

  // Timer visual da gravação
  let timerInterval = null;

  // --- Funções Utilitárias de Interface ---
  function showMessage(text, isError = false) {
    const box = el('status-msg');
    if (!box) return;
    box.textContent = text || '';
    box.className = 'vd-msg' + (isError ? ' vd-error' : '');
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '00:00:00';
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  // --- Troca de Abas da Sidebar ---
  function switchTab(tabId) {
    activeTab = tabId;
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    tabPanels.forEach(panel => {
      panel.hidden = (panel.id !== `tab-${tabId}`);
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // --- Validação Estrita de Schemas ---
  function validateReplaySchema(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.rec !== 'boolean') return false;
    if (!Array.isArray(data.availableCams)) return false;
    if (typeof data.cameraOptions !== 'object' || data.cameraOptions === null) return false;
    return true;
  }

  // --- Obtenção e Atualização de Rascunhos de Câmera ---
  function getEffectiveCameraOptions(cam) {
    if (!cam) return { recordAudio: 'input', gainDb: 0, muted: false, offsetFrames: 0 };
    if (cameraDrafts[cam]) return { ...cameraDrafts[cam] };
    const persisted = replayState?.cameraOptions?.[cam];
    if (persisted) return { ...persisted };
    return { recordAudio: 'input', gainDb: 0, muted: false, offsetFrames: 0 };
  }

  function updateCameraDraft(prop, value) {
    if (!selectedAudioCam || ['__proto__', 'prototype', 'constructor'].includes(selectedAudioCam)) return;
    if (!cameraDrafts[selectedAudioCam]) {
      cameraDrafts[selectedAudioCam] = getEffectiveCameraOptions(selectedAudioCam);
    }
    cameraDrafts[selectedAudioCam][prop] = value;
  }

  // --- Comunicação HTTP com Proteção de Incerteza e Epoch ---
  async function sendCommand(action, data = {}, timeoutMs = 8000) {
    if (isBusy || uncertainOp) {
      showMessage('Operação em andamento ou incerta. Aguarde a confirmação do motor.', true);
      return null;
    }

    isBusy = true;
    updateActionLocks();
    const what = ({ start: 'Iniciar gravação', stop: 'Parar gravação', retention: 'Retenção', audio: 'Áudio do replay', 'camera-options': 'Opções da câmera', 'auto-align': 'Alinhamento pelo áudio' })[action] || action;
    showMessage(`${what}: aguardando o programa…`);

    const requestEpoch = ++stateEpoch;
    let response;
    let result;

    try {
      response = await fetch('/api/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      result = await response.json();

      if (!response.ok || !result.success || !validateReplaySchema(result.replay)) {
        throw new Error(result?.error || `${what}: recusado pelo programa`);
      }

      // Sucesso determinístico imediato
      uncertainOp = null;
      replayState = result.replay;

      // Limpa os rascunhos correspondentes à ação executada com sucesso
      if (action === 'start' || action === 'stop') camsDirty = false;
      if (action === 'retention') retentionDirty = false;
      if (action === 'camera-options' && data.cam) {
        delete cameraDrafts[data.cam];
      }

      renderState(replayState);
      showMessage(`${what}: confirmado pelo programa.`);
      return result.replay;
    } catch (err) {
      const isTimeout = err.name === 'TimeoutError';
      const isNetworkLoss = err instanceof TypeError;

      if (isTimeout || isNetworkLoss) {
        // Falha no transporte: entra em trava estrita para evitar colisão ou double-POST
        uncertainOp = {
          action,
          data,
          epoch: requestEpoch,
          timestamp: Date.now()
        };
        showMessage('O motor ainda não confirmou a operação. Verifique o status antes de enviar nova alteração.', true);
      } else {
        // Erro contratual ou HTTP 4xx com schema conhecido: não entra em incerteza
        showMessage(err.message, true);
      }
      return null;
    } finally {
      isBusy = false;
      updateActionLocks();
    }
  }

  // --- Renderização de Estado na Tela ---
  function renderState(data) {
    if (!data) return;

    // 1. Pasta da Sessão (Informativa / Read-Only)
    const sessionDir = el('session-dir');
    if (sessionDir) {
      sessionDir.value = data.session?.dir || 'Pasta base de gravações + subpasta replay';
    }

    // 2. Banner e Botão Mestre de Gravação SSD
    const isRec = !!data.rec;
    const banner = el('rec-banner');
    const statusText = el('rec-status-text');
    const timerText = el('rec-timer-text');
    const btnToggleRec = el('btn-toggle-rec');

    if (banner) {
      banner.className = 'vd-banner-bar ' + (isRec ? 'vd-banner-rec' : 'vd-banner-idle');
    }
    if (statusText) {
      statusText.textContent = isRec ? 'Gravação SSD em Andamento' : 'Gravação SSD Parada';
    }
    if (btnToggleRec) {
      btnToggleRec.textContent = isRec ? 'Parar gravação SSD' : 'Iniciar gravação SSD';
      btnToggleRec.className = isRec ? 'vd-air' : 'vd-on';
    }

    // Timer ativo da gravação
    if (isRec && data.session?.startedAt) {
      if (!timerInterval) {
        const updateTimer = () => {
          if (!replayState?.rec || !replayState?.session?.startedAt) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (timerText) timerText.textContent = '00:00:00';
            return;
          }
          const elapsed = Date.now() - replayState.session.startedAt;
          if (timerText) timerText.textContent = formatDuration(elapsed);
        };
        updateTimer();
        timerInterval = setInterval(updateTimer, 500);
      }
    } else {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      if (timerText) timerText.textContent = '00:00:00';
    }

    // 3. Câmeras (Slots 1 a 8)
    const available = data.availableCams || [];
    for (let slot = 0; slot < 8; slot++) {
      const select = el(`cam-slot-${slot + 1}`);
      if (!select) continue;

      // The cameras of the last session are offered again, except the ones that no longer exist on the mesa.
      const remembered = data.session?.cams?.[slot]?.name || '';
      const currentVal = isRec
        ? remembered
        : (camsDirty ? selectedCamsDraft[slot] : (available.includes(remembered) ? remembered : ''));

      const optionsSignature = available.join('|');
      if (select.dataset.sig !== optionsSignature) {
        select.innerHTML = '<option value="">(Nenhuma)</option>' +
          available.map(name => `<option value="${name}">${name}</option>`).join('');
        select.dataset.sig = optionsSignature;
      }

      select.value = currentVal;
      select.disabled = isRec || isBusy || !!uncertainOp;
      if (!camsDirty && !isRec) {
        selectedCamsDraft[slot] = currentVal;
      }
    }

    // 4. Retenção em Disco
    const retEnabled = el('retention-enabled');
    const retMinutes = el('retention-minutes');
    const btnSaveRet = el('btn-save-retention');

    if (!retentionDirty) {
      if (retEnabled) retEnabled.checked = !!data.retention?.enabled;
      if (retMinutes) retMinutes.value = data.retention?.minutes || 30;
    }
    if (retEnabled) retEnabled.disabled = isRec || isBusy || !!uncertainOp;
    if (retMinutes) retMinutes.disabled = isRec || isBusy || !!uncertainOp;
    if (btnSaveRet) btnSaveRet.disabled = isRec || isBusy || !!uncertainOp;

    // 5. Áudio Master do Replay
    const btnAudioGlobal = el('btn-toggle-audio');
    if (btnAudioGlobal) {
      btnAudioGlobal.textContent = data.audioEnabled ? 'Áudio Master Ligado' : 'Áudio Master Silenciado';
      btnAudioGlobal.className = data.audioEnabled ? 'vd-on' : 'vd-dim';
      btnAudioGlobal.disabled = isBusy || !!uncertainOp;
    }

    // 6. Opções por Câmera
    const audioCamSelect = el('audio-cam-select');
    const allCams = [...new Set([
      ...available,
      ...(data.session?.cams || []).map(c => c.name),
      ...Object.keys(data.cameraOptions || {})
    ])].filter(Boolean);

    if (audioCamSelect) {
      const oldCam = audioCamSelect.value;
      const camSig = allCams.join('|');
      if (audioCamSelect.dataset.sig !== camSig) {
        audioCamSelect.innerHTML = allCams.map(c => `<option value="${c}">${c}</option>`).join('');
        audioCamSelect.dataset.sig = camSig;
      }
      if (allCams.includes(oldCam)) {
        audioCamSelect.value = oldCam;
      } else if (allCams.length) {
        audioCamSelect.value = allCams[0];
      }
      selectedAudioCam = audioCamSelect.value;
    }

    renderCameraAudioFields();

    // 7. Sincronismo e Auto-Align
    renderAutoAlignStatus();

    updateActionLocks();
  }

  function renderCameraAudioFields() {
    if (!replayState || !selectedAudioCam) return;
    const opts = getEffectiveCameraOptions(selectedAudioCam);
    const isRec = !!replayState.rec;

    const recordSource = el('audio-record-source');
    const audioGain = el('audio-gain');
    const audioMuted = el('audio-muted');
    const cameraOffset = el('camera-offset');
    const btnSaveCam = el('btn-save-cam-audio');

    if (recordSource) recordSource.value = opts.recordAudio || 'input';
    if (audioGain) audioGain.value = opts.gainDb ?? 0;
    if (audioMuted) audioMuted.checked = !!opts.muted;
    if (cameraOffset) cameraOffset.value = opts.offsetFrames ?? 0;

    // A fonte gravada exige REC parado; gain, mute e offset podem ser calibrados na reprodução
    if (recordSource) recordSource.disabled = isRec || isBusy || !!uncertainOp;
    if (audioGain) audioGain.disabled = isBusy || !!uncertainOp;
    if (audioMuted) audioMuted.disabled = isBusy || !!uncertainOp;
    if (cameraOffset) cameraOffset.disabled = isBusy || !!uncertainOp;
    if (btnSaveCam) btnSaveCam.disabled = isBusy || !!uncertainOp;
  }

  function renderAutoAlignStatus() {
    const btnAutoAlign = el('btn-auto-align');
    const syncStatusMsg = el('sync-status-msg');
    const syncDesc = el('sync-desc');
    if (!btnAutoAlign || !replayState) return;

    const isRec = !!replayState.rec;
    const players = replayState.players || {};
    const loadedPlayers = Object.entries(players).filter(([_, p]) => p?.eventId);
    const pgm = replayState.program || '';

    // Requisitos contratuais de replay-disco.mjs#L713-L715:
    // REC parado, >=2 players carregados com mesmo lance e nenhum player no Programa
    const eventIds = loadedPlayers.map(([_, p]) => p.eventId);
    const hasSameEvent = eventIds.length >= 2 && new Set(eventIds).size === 1;
    const isAnyOnPgm = Object.keys(players).some(p => pgm === `REPLAY ${p}`);

    let canAlign = !isRec && hasSameEvent && !isAnyOnPgm;
    let hint = '';

    if (isRec) {
      hint = 'Gravação ativa: o alinhamento de áudio exige REC parado.';
    } else if (!hasSameEvent) {
      hint = 'Carregue pelo menos dois players com o mesmo lance no console para calibrar.';
    } else if (isAnyOnPgm) {
      hint = 'Retire os players de Replay do Programa antes de executar o alinhamento.';
    } else {
      hint = 'Pronto para correlacionar áudio comum entre os ângulos carregados.';
    }

    if (syncDesc) syncDesc.textContent = hint;

    const sync = replayState.sync;
    if (syncStatusMsg) {
      if (sync) {
        syncStatusMsg.textContent = sync.mode === 'frame'
          ? `Desvio: ${Number(sync.differenceFrames).toFixed(2)} quadros (${sync.frameRate} fps)`
          : `Desvio: ${Number(sync.differenceMs).toFixed(1)} ms`;
      } else {
        syncStatusMsg.textContent = 'Nenhum desvio calibrado.';
      }
    }

    btnAutoAlign.disabled = !canAlign || isBusy || !!uncertainOp;
  }

  function updateActionLocks() {
    const isLocked = isBusy || !!uncertainOp;
    const isRec = !!replayState?.rec;

    const btnToggleRec = el('btn-toggle-rec');
    if (btnToggleRec) btnToggleRec.disabled = isLocked;

    const btnAudioGlobal = el('btn-toggle-audio');
    if (btnAudioGlobal) btnAudioGlobal.disabled = isLocked;

    const audioCamSelect = el('audio-cam-select');
    if (audioCamSelect) audioCamSelect.disabled = isLocked;

    const btnRefresh = el('btn-refresh');
    if (btnRefresh) btnRefresh.disabled = isBusy; // Permite consulta deliberada fora de isBusy

    const btnSaveRet = el('btn-save-retention');
    if (btnSaveRet) btnSaveRet.disabled = isLocked || isRec;

    const btnSaveCam = el('btn-save-cam-audio');
    if (btnSaveCam) btnSaveCam.disabled = isLocked;

    const btnAutoAlign = el('btn-auto-align');
    if (btnAutoAlign && isLocked) btnAutoAlign.disabled = true;
  }

  // --- Handlers de Interação do Operador ---

  // Slots de Câmeras (Sessão)
  for (let slot = 0; slot < 8; slot++) {
    const select = el(`cam-slot-${slot + 1}`);
    if (select) {
      select.addEventListener('change', () => {
        selectedCamsDraft[slot] = select.value;
        camsDirty = true;
      });
    }
  }

  // Iniciar / Parar Gravação SSD (8s Timeout)
  el('btn-toggle-rec')?.addEventListener('click', async () => {
    if (!replayState || isBusy || uncertainOp) return;

    if (replayState.rec) {
      await sendCommand('stop');
    } else {
      const activeCams = selectedCamsDraft.filter(Boolean);
      if (!activeCams.length) {
        showMessage('Selecione pelo menos uma câmera para iniciar a gravação SSD.', true);
        return;
      }
      if (activeCams.length > 8) {
        showMessage('Máximo de 8 câmeras permitidas para gravação SSD.', true);
        return;
      }
      await sendCommand('start', { cams: activeCams });
    }
  });

  // Retenção em Disco (8s Timeout)
  el('retention-enabled')?.addEventListener('change', () => { retentionDirty = true; });
  el('retention-minutes')?.addEventListener('input', () => { retentionDirty = true; });

  el('btn-save-retention')?.addEventListener('click', async () => {
    if (!replayState || isBusy || uncertainOp) return;
    const enabled = el('retention-enabled')?.checked ?? false;
    const minutes = Number(el('retention-minutes')?.value ?? 30);
    if (!Number.isInteger(minutes) || minutes < 2 || minutes > 1440) {
      showMessage('Minutos de retenção devem ser um número inteiro entre 2 e 1440.', true);
      return;
    }
    await sendCommand('retention', { enabled, minutes, segmentSeconds: 60 });
  });

  // Áudio Master (8s Timeout)
  el('btn-toggle-audio')?.addEventListener('click', async () => {
    if (!replayState || isBusy || uncertainOp) return;
    await sendCommand('audio', { enabled: !replayState.audioEnabled });
  });

  // Seletor de Câmera na aba Áudio (com Listener Guard)
  el('audio-cam-select')?.addEventListener('change', e => {
    if (isBusy || !!uncertainOp) return;
    selectedAudioCam = e.target.value;
    renderCameraAudioFields();
  });

  // Edição de Parâmetros de Câmera por Campo (Grava no Draft Isolado da Câmera)
  el('audio-record-source')?.addEventListener('change', e => {
    updateCameraDraft('recordAudio', e.target.value);
  });
  el('audio-gain')?.addEventListener('input', e => {
    updateCameraDraft('gainDb', Number(e.target.value));
  });
  el('audio-muted')?.addEventListener('change', e => {
    updateCameraDraft('muted', e.target.checked);
  });
  el('camera-offset')?.addEventListener('input', e => {
    updateCameraDraft('offsetFrames', Number(e.target.value));
  });

  // Salvar Opções de Câmera (8s Timeout)
  el('btn-save-cam-audio')?.addEventListener('click', async () => {
    if (!replayState || isBusy || uncertainOp) return;
    if (!selectedAudioCam || ['__proto__', 'prototype', 'constructor'].includes(selectedAudioCam)) return;
    const draft = getEffectiveCameraOptions(selectedAudioCam);
    const recordAudio = draft.recordAudio || 'input';
    const gainDb = Number(draft.gainDb ?? 0);
    const muted = !!draft.muted;
    const offsetFrames = Number(draft.offsetFrames ?? 0);

    if (!Number.isFinite(gainDb) || gainDb < -60 || gainDb > 12) {
      showMessage('Ganho deve estar entre -60 e +12 dB.', true);
      return;
    }
    if (!Number.isInteger(offsetFrames) || Math.abs(offsetFrames) > 3600) {
      showMessage('Offset deve ser um número inteiro entre -3600 e +3600 quadros.', true);
      return;
    }

    await sendCommand('camera-options', {
      cam: selectedAudioCam,
      options: { recordAudio, gainDb, muted, offsetFrames }
    });
  });

  // Alinhamento Automático de Áudio (25s Timeout no Cliente devido ao FFmpeg no Motor)
  el('btn-auto-align')?.addEventListener('click', async () => {
    if (!replayState || isBusy || uncertainOp) return;
    const activeDeck = replayState.activePlayer || 'A';
    await sendCommand('auto-align', { player: activeDeck }, 25000);
  });

  // Botão Fechar
  el('btn-close')?.addEventListener('click', () => window.FreeMixClosePanel());

  // Botão Atualizar (Dispara Consulta Deliberada do Operador com Epoch Próprio)
  el('btn-refresh')?.addEventListener('click', async () => {
    showMessage('Consultando status do motor…');
    await pollStatus(true);
  });

  // --- Polling Periódico e Resolução Determinística (Sem Liberação Cega por Timer) ---
  async function pollStatus(isManual = false) {
    if (isBusy && !isManual) return;

    const readEpoch = ++stateEpoch;

    try {
      const response = await fetch('/api/replay', {
        signal: AbortSignal.timeout(5000)
      });
      const result = await response.json();

      if (!response.ok || !result.success || !validateReplaySchema(result.replay)) {
        showMessage(result?.error || 'Erro ou schema inválido ao consultar motor.', true);
        return;
      }

      const fresh = result.replay;

      // Reconciliação determinística de uncertainOp
      let handledMessage = false;
      if (uncertainOp) {
        let resolved = false;

        if (uncertainOp.action === 'start' && fresh.rec === true) {
          resolved = true;
          camsDirty = false;
        } else if (uncertainOp.action === 'stop' && fresh.rec === false) {
          resolved = true;
          camsDirty = false;
        } else if (uncertainOp.action === 'retention') {
          if (fresh.retention?.enabled === uncertainOp.data?.enabled &&
              fresh.retention?.minutes === uncertainOp.data?.minutes) {
            resolved = true;
            retentionDirty = false;
          }
        } else if (uncertainOp.action === 'camera-options') {
          const targetCam = uncertainOp.data?.cam;
          const camOpts = fresh.cameraOptions?.[targetCam];
          if (camOpts &&
              camOpts.recordAudio === uncertainOp.data?.options?.recordAudio &&
              camOpts.gainDb === uncertainOp.data?.options?.gainDb &&
              camOpts.muted === uncertainOp.data?.options?.muted &&
              camOpts.offsetFrames === uncertainOp.data?.options?.offsetFrames) {
            resolved = true;
            // Consome e limpa unicamente o draft da câmera atuada
            delete cameraDrafts[targetCam];
          }
        } else if (uncertainOp.action === 'audio') {
          if (fresh.audioEnabled === uncertainOp.data?.enabled) {
            resolved = true;
          }
        } else if (uncertainOp.action === 'auto-align') {
          if (fresh.calibration?.at &&
              fresh.calibration.at >= uncertainOp.timestamp &&
              fresh.calibration.anchor === uncertainOp.data?.player) {
            resolved = true;
          }
        }

        if (resolved) {
          uncertainOp = null;
          showMessage('Operação pendente confirmada pelo motor.');
          handledMessage = true;
        } else if (isManual && readEpoch > uncertainOp.epoch) {
          // Recuperação manual deliberada pós-fila: a leitura fresca posterior ao comando
          // comprova que a mutação pretendida não foi aplicada pelo motor.
          uncertainOp = null;
          showMessage('O motor confirmou que a operação anterior não foi aplicada. Trava liberada para nova ação manual.', true);
          handledMessage = true;
        }
      }

      replayState = fresh;
      renderState(replayState);

      if (isManual && !uncertainOp && !handledMessage) {
        showMessage('Status sincronizado com sucesso.');
      }
    } catch (e) {
      if (isManual) {
        showMessage('Sem conexão com o 3Mix: falha na leitura do motor.', true);
      }
    }
  }

  // Inicialização determinística
  pollStatus(true);
  setInterval(() => pollStatus(false), 1500);

})();
