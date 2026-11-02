import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/**
 * MediaPlayoutEngine — Motor Central Profissional de Playout e Playlists do FreeMix
 * 
 * Implementa arquitetura broadcast para reprodução de VTs, vinhetas, comerciais e listas:
 * - Dual Player A/B (Preview e Program dedicados ao módulo de playout)
 * - Transição suave com TAKE previsível (Cut ou Fade)
 * - Preload real e medição de latência de bufferização
 * - Linked Clips / Chains (VHG IN -> VT -> VHG OUT)
 * - Comportamento configurável ao término (Freeze Last Frame, Stop, Loop, Play Next, Hold)
 * - Suporte a frame-accurate IN/OUT, áudio gain, geometry e notas
 * - Compatível com API central, Companion, Stream Deck, MIDI e OSC
 * - Retrocompatível com chamadas queue_* legadas
 */
export class MediaPlayoutEngine {
  constructor(production) {
    this.p = production;
    this.scope = null;
    this.file = null;
    this.lists = [];
    this.activeListId = null;

    // Estado operacional do Dual Player Playout
    this.state = {
      // Canal Program (exibição ativa)
      program: {
        item: null,
        status: 'stopped', // 'stopped' | 'playing' | 'paused' | 'frozen' | 'hold'
        positionMs: 0,
        durationMs: 0,
        remainingMs: 0,
        startedAt: 0,
        holdAt: 0,
        loop: false,
        endBehavior: 'play_next', // 'stop' | 'freeze' | 'loop' | 'play_next' | 'hold'
        volume: 1.0,
        audioGainDb: 0,
      },
      // Canal Preview (preparação para TAKE)
      preview: {
        item: null,
        preloadState: 'not_loaded', // 'not_loaded' | 'loading' | 'ready' | 'error'
        preloadDurationMs: 0,
        preloadStartedAt: 0,
        transition: 'cut', // 'cut' | 'fade'
        transitionMs: 500,
        error: null,
      },
      // Automação da playlist
      automation: {
        active: false,
        autoAdvance: true,
        currentIndex: -1,
        hold: false,
      },
      // Métricas e estatísticas
      stats: {
        lastTakeMs: 0,
        takeCount: 0,
        frameDrops: 0,
        syncOffsetMs: 0,
      }
    };

    this.lastSummary = null;
  }

  async setScope(scope) {
    if (this.scope === scope) return;
    this.scope = scope;
    this.stop();
    const hash = createHash('sha256').update(String(scope || 'default')).digest('hex').slice(0, 24);
    this.file = join(this.p.root, 'config/obs-studio/plugin_config/freemix-playout', `${hash}.json`);
    
    try {
      const content = JSON.parse(await readFile(this.file, 'utf8'));
      this.lists = Array.isArray(content.lists) ? content.lists : [];
      this.activeListId = content.activeListId || (this.lists[0]?.id || null);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // Tentar migrar de freemix-queue legado se existir
        try {
          const legacyFile = join(this.p.root, 'config/obs-studio/plugin_config/freemix-queue', `${hash}.json`);
          const legacyContent = JSON.parse(await readFile(legacyFile, 'utf8'));
          this.lists = (legacyContent.lists || []).map(l => this._normalizeLegacyList(l));
          this.activeListId = this.lists[0]?.id || null;
        } catch {
          this.lists = [];
        }
      } else {
        this.lists = [];
      }
    }
  }

  _normalizeLegacyList(l) {
    return {
      id: l.id || randomUUID(),
      name: l.name || 'Playlist',
      items: (l.items || []).map((item, idx) => ({
        id: item.id || randomUUID(),
        title: item.title || item.input || `Item ${idx + 1}`,
        file: item.file || '',
        input: item.input || null,
        thumbnail: item.thumbnail || '',
        inMs: Number(item.inMs || 0),
        outMs: Number(item.outMs || 0),
        durationMs: Number(item.durationMs || 0),
        transitionIn: item.transition === 'fade' ? 'fade' : 'cut',
        transitionOut: 'cut',
        transitionMs: Number(item.fadeMs || 500),
        loop: !!item.loop,
        freeze: !!item.freeze,
        hold: false,
        autoNext: item.autoAdvance !== false,
        audioGainDb: Number(item.audioGainDb || 0),
        geometry: item.geometry || 'fit',
        notes: item.notes || '',
        chainId: item.chainId || null,
        chainOrder: item.chainOrder || 0,
        endBehavior: item.endBehavior || (item.loop ? 'loop' : item.freeze ? 'freeze' : 'play_next')
      })),
      loop: l.loop === true,
      autoAdvance: l.autoAdvance !== false,
      transition: l.transition === 'fade' ? 'fade' : 'cut',
      fadeMs: Number(l.fadeMs || 500)
    };
  }

  async save() {
    if (!this.file) return;
    await mkdir(join(this.p.root, 'config/obs-studio/plugin_config/freemix-playout'), { recursive: true });
    const payload = {
      version: 2,
      activeListId: this.activeListId,
      lists: this.lists,
      updatedAt: Date.now()
    };
    await writeFile(this.file + '.tmp', JSON.stringify(payload, null, 2));
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rename(this.file + '.tmp', this.file);
        break;
      } catch (e) {
        if (attempt === 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }

  getActiveList() {
    if (!this.activeListId && this.lists.length > 0) {
      this.activeListId = this.lists[0].id;
    }
    return this.lists.find(l => l.id === this.activeListId) || null;
  }

  getList(id) {
    const list = this.lists.find(l => l.id === id);
    if (!list) throw new Error(`Playlist não encontrada: ${id}`);
    return list;
  }

  /**
   * Preload do clip de Preview
   */
  async preloadClip(item, transition = 'cut', transitionMs = 500) {
    if (!item) {
      this.state.preview = {
        item: null,
        preloadState: 'not_loaded',
        preloadDurationMs: 0,
        preloadStartedAt: 0,
        transition,
        transitionMs,
        error: null
      };
      return;
    }

    const startPreload = Date.now();
    this.state.preview = {
      item,
      preloadState: 'loading',
      preloadDurationMs: 0,
      preloadStartedAt: startPreload,
      transition,
      transitionMs,
      error: null
    };

    try {
      // Se houver input de cena no OBS vinculado, prepara o preview sem ir ao ar no PGM principal
      if (item.input) {
        const inputObj = this.p.scene ? this.p.scene(item.input) : null;
        if (inputObj?.media) {
          // Prepara a mídia pausada no ponto IN
          await this.p.execute('media', { input: inputObj.key, command: 'RESTART' });
          if (item.inMs > 0) {
            await this.p.execute('media_seek', { input: inputObj.key, position: item.inMs });
          }
          await this.p.execute('media', { input: inputObj.key, command: 'PAUSE' });
        }
      }
      
      const preloadDuration = Date.now() - startPreload;
      this.state.preview.preloadState = 'ready';
      this.state.preview.preloadDurationMs = preloadDuration;
    } catch (err) {
      this.state.preview.preloadState = 'error';
      this.state.preview.error = err.message;
    }
  }

  /**
   * Operação TAKE — Comuta de Preview para Program de forma previsível
   */
  async take(options = {}) {
    const takeStart = Date.now();
    const candidate = options.item || this.state.preview.item;
    if (!candidate) {
      throw new Error('Nenhum clip selecionado no Preview para TAKE');
    }

    const transition = options.transition || this.state.preview.transition || 'cut';
    const transitionMs = Number(options.transitionMs ?? this.state.preview.transitionMs ?? 500);

    // Efetua transição no motor
    if (candidate.input) {
      const inputObj = this.p.scene ? this.p.scene(candidate.input) : null;
      if (inputObj) {
        await this.p.execute(transition === 'fade' ? 'fade' : 'cut', {
          input: inputObj.key,
          duration: transitionMs
        });
        if (inputObj.media) {
          if (candidate.inMs > 0) {
            await this.p.execute('media_seek', { input: inputObj.key, position: candidate.inMs });
          }
          await this.p.execute('media', { input: inputObj.key, command: 'PLAY' });
        }
      }
    }

    // Calcula duração efetiva considerando IN/OUT
    let effectiveDuration = candidate.durationMs || 0;
    if (candidate.outMs > candidate.inMs) {
      effectiveDuration = candidate.outMs - candidate.inMs;
    }

    // Aplica o Ganho de Áudio individual do clipe (estilo TriCaster DDR)
    if (candidate.input && candidate.audioGainDb !== undefined) {
      await this.applyClipAudioGain(candidate.input, Number(candidate.audioGainDb || 0));
    }

    // Atualiza Program
    this.state.program = {
      item: candidate,
      status: 'playing',
      positionMs: candidate.inMs || 0,
      durationMs: effectiveDuration,
      remainingMs: effectiveDuration,
      startedAt: Date.now(),
      holdAt: 0,
      loop: candidate.loop || false,
      endBehavior: candidate.endBehavior || 'play_next',
      volume: 1.0,
      audioGainDb: candidate.audioGainDb || 0,
    };

    // Estatísticas
    this.state.stats.takeCount++;
    this.state.stats.lastTakeMs = Date.now() - takeStart;

    // Atualiza índice na playlist se fizer parte da lista ativa
    const list = this.getActiveList();
    if (list) {
      const itemIndex = list.items.findIndex(i => i.id === candidate.id);
      if (itemIndex >= 0) {
        this.state.automation.currentIndex = itemIndex;
        this.state.automation.active = true;

        // Prepara automaticamente o próximo item no Preview
        const nextItem = this._findNextItem(list, itemIndex);
        if (nextItem) {
          await this.preloadClip(nextItem, list.transition || 'cut', list.fadeMs || 500);
        } else {
          this.state.preview.item = null;
          this.state.preview.preloadState = 'not_loaded';
        }
      }
    }
  }

  _findNextItem(list, currentIndex) {
    if (!list || !list.items.length) return null;
    const currentItem = list.items[currentIndex];

    // Se fizer parte de uma chain vinculada, buscar o próximo da cadeia
    if (currentItem?.chainId) {
      const chainItems = list.items
        .filter(i => i.chainId === currentItem.chainId)
        .sort((a, b) => (a.chainOrder || 0) - (b.chainOrder || 0));
      const chainIdx = chainItems.findIndex(i => i.id === currentItem.id);
      if (chainIdx >= 0 && chainIdx + 1 < chainItems.length) {
        return chainItems[chainIdx + 1];
      }
    }

    // Caso padrão: próximo item linear
    if (currentIndex + 1 < list.items.length) {
      return list.items[currentIndex + 1];
    }
    // Loop de playlist
    if (list.loop) {
      return list.items[0];
    }
    return null;
  }

  /**
   * Aplica o ganho individual do clipe (estilo TriCaster DDR) no motor OBS
   * usando o filtro dedicado 'FreeMix Clip Gain' (gain_filter)
   */
  async applyClipAudioGain(inputIdent, gainDb) {
    if (!inputIdent || gainDb === undefined || gainDb === null) return;
    const gainVal = Math.max(-30, Math.min(30, Number(gainDb || 0)));
    this.state.program.audioGainDb = gainVal;

    if (!this.p?.req) return;

    try {
      let audioSources = [];
      try {
        if (typeof this.p.audioNames === 'function') {
          audioSources = this.p.audioNames(inputIdent);
        }
      } catch {
        audioSources = [];
      }

      if (!audioSources.length && this.p.state?.audioInputs) {
        const found = this.p.state.audioInputs.find(a => a.name === inputIdent || a.key === inputIdent);
        if (found) audioSources = [found.name];
      }

      if (!audioSources.length) {
        audioSources = [String(inputIdent)];
      }

      for (const srcName of audioSources) {
        try {
          const filterList = await this.p.req('GetSourceFilterList', { sourceName: srcName }).catch(() => null);
          if (!filterList) continue;

          const existing = (filterList.filters || []).find(f => f.filterName === 'FreeMix Clip Gain');
          if (existing) {
            await this.p.req('SetSourceFilterSettings', {
              sourceName: srcName,
              filterName: 'FreeMix Clip Gain',
              filterSettings: { db: gainVal },
              overlay: true
            });
            await this.p.req('SetSourceFilterEnabled', {
              sourceName: srcName,
              filterName: 'FreeMix Clip Gain',
              filterEnabled: true
            });
          } else if (gainVal !== 0) {
            await this.p.req('CreateSourceFilter', {
              sourceName: srcName,
              filterName: 'FreeMix Clip Gain',
              filterKind: 'gain_filter',
              filterSettings: { db: gainVal }
            });
          }
        } catch {
          // Trata amigavelmente erros de filtros em sources que não possuem barramento de áudio
        }
      }
    } catch {
      // Ignora falhas se motor desconectado
    }
  }

  /**
   * Transportes: Play / Pause / Stop / Restart
   */
  async play() {
    if (!this.state.program.item) return;
    if (this.state.program.status === 'paused' || this.state.program.status === 'hold') {
      const pausedDuration = Date.now() - this.state.program.holdAt;
      this.state.program.startedAt += pausedDuration;
    } else {
      this.state.program.startedAt = Date.now();
    }
    this.state.program.status = 'playing';

    if (this.state.program.item.input) {
      await this.p.execute('media', { input: this.state.program.item.input, command: 'PLAY' });
    }
  }

  async pause() {
    if (!this.state.program.item || this.state.program.status !== 'playing') return;
    this.state.program.status = 'paused';
    this.state.program.holdAt = Date.now();

    if (this.state.program.item.input) {
      await this.p.execute('media', { input: this.state.program.item.input, command: 'PAUSE' });
    }
  }

  async stop() {
    this.state.program.status = 'stopped';
    this.state.program.positionMs = 0;
    this.state.program.remainingMs = this.state.program.durationMs;
    this.state.automation.active = false;

    if (this.state.program.item?.input) {
      await this.p.execute('media', { input: this.state.program.item.input, command: 'STOP' });
    }
  }

  async restart() {
    if (!this.state.program.item) return;
    this.state.program.startedAt = Date.now();
    this.state.program.positionMs = this.state.program.item.inMs || 0;
    this.state.program.status = 'playing';

    if (this.state.program.item.input) {
      await this.p.execute('media', { input: this.state.program.item.input, command: 'RESTART' });
      if (this.state.program.item.inMs > 0) {
        await this.p.execute('media_seek', { input: this.state.program.item.input, position: this.state.program.item.inMs });
      }
      await this.p.execute('media', { input: this.state.program.item.input, command: 'PLAY' });
    }
  }

  async seek(positionMs) {
    if (!this.state.program.item) return;
    const target = Math.max(0, Math.min(this.state.program.durationMs, Number(positionMs)));
    this.state.program.positionMs = target;
    this.state.program.startedAt = Date.now() - target;

    if (this.state.program.item.input) {
      await this.p.execute('media_seek', { input: this.state.program.item.input, position: target });
    }
  }

  /**
   * Monitoramento contínuo no tick do servidor de produção
   */
  async observe() {
    const prog = this.state.program;
    if (prog.status === 'playing') {
      const elapsed = Date.now() - prog.startedAt;
      prog.positionMs = elapsed;
      prog.remainingMs = Math.max(0, prog.durationMs - elapsed);

      // Verificação de término do clip
      if (prog.durationMs > 0 && prog.remainingMs <= 0) {
        await this._handleEndBehavior();
      }
    }
  }

  async _handleEndBehavior() {
    const prog = this.state.program;
    const behavior = prog.endBehavior || 'play_next';

    switch (behavior) {
      case 'loop':
        await this.restart();
        break;
      case 'freeze':
        prog.status = 'frozen';
        prog.remainingMs = 0;
        if (prog.item?.input) {
          await this.p.execute('media', { input: prog.item.input, command: 'PAUSE' });
        }
        break;
      case 'hold':
        prog.status = 'hold';
        prog.holdAt = Date.now();
        if (prog.item?.input) {
          await this.p.execute('media', { input: prog.item.input, command: 'PAUSE' });
        }
        break;
      case 'stop':
        await this.stop();
        break;
      case 'play_next':
      default: {
        const list = this.getActiveList();
        if (list && this.state.automation.active && this.state.automation.autoAdvance) {
          const nextItem = this._findNextItem(list, this.state.automation.currentIndex);
          if (nextItem) {
            await this.take({ item: nextItem, transition: list.transition || 'cut', transitionMs: list.fadeMs || 500 });
          } else {
            await this.stop();
          }
        } else {
          prog.status = 'frozen';
        }
        break;
      }
    }
  }

  /**
   * Resumo de estado serializável para frontend e APIs remotas
   */
  summary() {
    const activeList = this.getActiveList();
    return {
      activeListId: this.activeListId,
      lists: this.lists.map(l => ({
        id: l.id,
        name: l.name,
        itemCount: l.items.length,
        totalDurationMs: l.items.reduce((acc, i) => acc + (i.durationMs || 0), 0),
        loop: !!l.loop,
        autoAdvance: l.autoAdvance !== false
      })),
      activeList: activeList ? {
        id: activeList.id,
        name: activeList.name,
        items: activeList.items,
        loop: !!activeList.loop,
        autoAdvance: activeList.autoAdvance !== false,
        transition: activeList.transition || 'cut',
        fadeMs: Number(activeList.fadeMs || 500)
      } : null,
      program: {
        item: this.state.program.item,
        status: this.state.program.status,
        positionMs: this.state.program.positionMs,
        durationMs: this.state.program.durationMs,
        remainingMs: this.state.program.remainingMs,
        loop: this.state.program.loop,
        endBehavior: this.state.program.endBehavior,
        volume: this.state.program.volume,
        audioGainDb: this.state.program.audioGainDb,
      },
      preview: {
        item: this.state.preview.item,
        preloadState: this.state.preview.preloadState,
        preloadDurationMs: this.state.preview.preloadDurationMs,
        transition: this.state.preview.transition,
        transitionMs: this.state.preview.transitionMs,
        error: this.state.preview.error,
      },
      automation: this.state.automation,
      stats: this.state.stats
    };
  }

  /**
   * Execução de comandos centralizados (API REST, WebSocket, Companion)
   */
  async execute(action, d = {}) {
    // Normalização para aceitar comandos diretos (Companion, OSC, Stream Deck, MIDI)
    const act = String(action).toLowerCase().replace(/^playout_|^queue_/, '');

    // 1. Comandos de Operação e Playout Broadcast
    if (act === 'take' || act === 'takenext') {
      const item = d.itemId ? this.getActiveList()?.items.find(i => i.id === d.itemId) : null;
      await this.take({
        item: item || undefined,
        transition: d.transition,
        transitionMs: d.transitionMs
      });
      return this.summary();
    }

    if (act === 'preview_clip' || act === 'previewclip' || act === 'loadclip' || act === 'preload') {
      let item = null;
      if (d.itemId) {
        item = this.getActiveList()?.items.find(i => i.id === d.itemId);
      } else if (Number.isInteger(d.index)) {
        item = this.getActiveList()?.items[d.index];
      } else if (d.item) {
        item = d.item;
      }
      await this.preloadClip(item, d.transition, d.transitionMs);
      return this.summary();
    }

    if (act === 'play' || act === 'playplaylist') {
      await this.play();
      return this.summary();
    }

    if (act === 'pause') {
      await this.pause();
      return this.summary();
    }

    if (act === 'stop') {
      await this.stop();
      return this.summary();
    }

    if (act === 'restart') {
      await this.restart();
      return this.summary();
    }

    if (act === 'seek' || act === 'setposition') {
      await this.seek(d.positionMs ?? d.position ?? d.pos ?? 0);
      return this.summary();
    }

    if (act === 'setin') {
      const curItem = this.state.program.item || this.state.preview.item;
      if (curItem) {
        const inVal = Math.max(0, Number(d.inMs ?? d.in ?? this.state.program.positionMs ?? 0));
        await this.execute('playout_item_update', { itemId: curItem.id, inMs: inVal });
      }
      return this.summary();
    }

    if (act === 'setout') {
      const curItem = this.state.program.item || this.state.preview.item;
      if (curItem) {
        const outVal = Math.max(0, Number(d.outMs ?? d.out ?? this.state.program.positionMs ?? 0));
        await this.execute('playout_item_update', { itemId: curItem.id, outMs: outVal });
      }
      return this.summary();
    }

    if (act === 'loopon' || act === 'loopoff') {
      const loopVal = act === 'loopon' || !!d.loop;
      this.state.program.loop = loopVal;
      if (this.state.program.item) {
        await this.execute('playout_item_update', { itemId: this.state.program.item.id, loop: loopVal });
      }
      return this.summary();
    }

    if (act === 'freezeon' || act === 'freezeoff') {
      const freezeVal = act === 'freezeon' || !!d.freeze;
      this.state.program.endBehavior = freezeVal ? 'freeze' : 'play_next';
      if (this.state.program.item) {
        await this.execute('playout_item_update', { itemId: this.state.program.item.id, endBehavior: freezeVal ? 'freeze' : 'play_next' });
      }
      return this.summary();
    }

    if (act === 'next') {
      const list = this.getActiveList();
      if (list) {
        const nextItem = this._findNextItem(list, this.state.automation.currentIndex);
        if (nextItem) {
          await this.take({ item: nextItem });
        }
      }
      return this.summary();
    }

    if (act === 'previous' || act === 'prev') {
      const list = this.getActiveList();
      if (list && this.state.automation.currentIndex > 0) {
        const prevItem = list.items[this.state.automation.currentIndex - 1];
        if (prevItem) {
          await this.take({ item: prevItem });
        }
      }
      return this.summary();
    }

    if (act === 'hold') {
      if (this.state.program.status === 'playing') {
        await this.pause();
      } else if (this.state.program.status === 'paused' || this.state.program.status === 'hold') {
        await this.play();
      }
      return this.summary();
    }

    // 2. Gerenciamento de Playlists
    if (action === 'playout_save_playlist' || action === 'queue_save') {
      const id = d.id || randomUUID();
      const name = String(d.name || 'Nova Playlist').trim();
      const items = Array.isArray(d.items) ? d.items.map((i, idx) => ({
        id: i.id || randomUUID(),
        title: String(i.title || i.name || `Clip ${idx + 1}`),
        file: String(i.file || ''),
        input: i.input || null,
        thumbnail: i.thumbnail || '',
        inMs: Math.max(0, Number(i.inMs || 0)),
        outMs: Math.max(0, Number(i.outMs || 0)),
        durationMs: Math.max(0, Number(i.durationMs || 0)),
        transitionIn: i.transitionIn === 'fade' ? 'fade' : 'cut',
        transitionOut: i.transitionOut === 'fade' ? 'fade' : 'cut',
        transitionMs: Number(i.transitionMs || 500),
        loop: !!i.loop,
        freeze: !!i.freeze,
        hold: !!i.hold,
        autoNext: i.autoNext !== false,
        audioGainDb: Number(i.audioGainDb || 0),
        geometry: i.geometry || 'fit',
        notes: String(i.notes || ''),
        chainId: i.chainId || null,
        chainOrder: Number(i.chainOrder || 0),
        endBehavior: i.endBehavior || (i.loop ? 'loop' : i.freeze ? 'freeze' : 'play_next')
      })) : [];

      const listObj = {
        id,
        name,
        items,
        loop: d.loop === true,
        autoAdvance: d.autoAdvance !== false,
        transition: d.transition === 'fade' ? 'fade' : 'cut',
        fadeMs: Number(d.fadeMs || 500)
      };

      const existingIdx = this.lists.findIndex(l => l.id === id);
      if (existingIdx >= 0) {
        this.lists[existingIdx] = listObj;
      } else {
        this.lists.push(listObj);
      }
      this.activeListId = id;
      await this.save();
      return this.summary();
    }

    if (action === 'playout_load_playlist') {
      const list = this.getList(d.id);
      this.activeListId = list.id;
      if (list.items.length > 0) {
        await this.preloadClip(list.items[0], list.transition || 'cut', list.fadeMs || 500);
      }
      await this.save();
      return this.summary();
    }

    if (action === 'playout_delete_playlist' || action === 'queue_delete') {
      this.lists = this.lists.filter(l => l.id !== d.id);
      if (this.activeListId === d.id) {
        this.activeListId = this.lists[0]?.id || null;
      }
      await this.save();
      return this.summary();
    }

    // 3. Vinculação em Cadeia (Chains / Linked Clips)
    if (action === 'playout_chain_link') {
      const list = this.getActiveList();
      if (!list) throw new Error('Nenhuma playlist ativa');
      const itemIds = Array.isArray(d.itemIds) ? d.itemIds : [];
      if (itemIds.length < 2) throw new Error('Vincular em cadeia exige pelo menos 2 clips');
      
      const chainId = randomUUID();
      let order = 0;
      for (const id of itemIds) {
        const item = list.items.find(i => i.id === id);
        if (item) {
          item.chainId = chainId;
          item.chainOrder = order++;
        }
      }
      await this.save();
      return this.summary();
    }

    if (action === 'playout_chain_unlink') {
      const list = this.getActiveList();
      if (!list) throw new Error('Nenhuma playlist ativa');
      const itemIds = Array.isArray(d.itemIds) ? d.itemIds : [];
      for (const id of itemIds) {
        const item = list.items.find(i => i.id === id);
        if (item) {
          item.chainId = null;
          item.chainOrder = 0;
        }
      }
      await this.save();
      return this.summary();
    }

    // 4. Edição direta de Item da Playlist (IN/OUT, EndBehavior, Gain, etc.)
    if (action === 'playout_item_update') {
      const list = this.getActiveList();
      if (!list) throw new Error('Nenhuma playlist ativa');
      const item = list.items.find(i => i.id === d.itemId);
      if (!item) throw new Error('Item não encontrado na playlist');

      if (d.title !== undefined) item.title = String(d.title);
      if (d.inMs !== undefined) item.inMs = Math.max(0, Number(d.inMs));
      if (d.outMs !== undefined) item.outMs = Math.max(0, Number(d.outMs));
      if (d.endBehavior !== undefined) item.endBehavior = d.endBehavior;
      if (d.audioGainDb !== undefined) {
        item.audioGainDb = Number(d.audioGainDb);
        // Se este clipe estiver atualmente em exibição no Program, aplica o ganho em tempo real
        if (this.state.program.item?.id === item.id) {
          this.state.program.audioGainDb = item.audioGainDb;
          if (item.input) {
            await this.applyClipAudioGain(item.input, item.audioGainDb);
          }
        }
      }
      if (d.geometry !== undefined) item.geometry = d.geometry;
      if (d.notes !== undefined) item.notes = String(d.notes);
      if (d.transitionIn !== undefined) item.transitionIn = d.transitionIn;
      if (d.transitionMs !== undefined) item.transitionMs = Number(d.transitionMs);
      if (d.autoNext !== undefined) item.autoNext = !!d.autoNext;
      if (d.loop !== undefined) item.loop = !!d.loop;

      await this.save();
      return this.summary();
    }

    // Compatibilidade queue_start legado
    if (action === 'queue_start') {
      const list = this.getActiveList();
      if (list) {
        const idx = Math.max(0, Number(d.index || 0));
        const item = list.items[idx];
        if (item) await this.take({ item });
      }
      return this.summary();
    }

    throw new Error(`Ação de playout não reconhecida: ${action}`);
  }
}
