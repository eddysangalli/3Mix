import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

export const OVERLAY_CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8];

export const TRANSITION_KINDS = [
  'Cut',
  'Fade',
  'Zoom',
  'Wipe',
  'Slide',
  'Fly',
  'Stinger 1',
  'Stinger 2',
  'Stinger 3',
  'Stinger 4'
];

export const DVE_PRESETS = {
  fullscreen: { name: 'Tela Cheia', x: 0, y: 0, width: 1920, height: 1080, opacity: 1.0 },
  'pip-top-right': { name: 'PIP Superior Direito', x: 1240, y: 80, width: 600, height: 338, opacity: 1.0 },
  'pip-top-left': { name: 'PIP Superior Esquerdo', x: 80, y: 80, width: 600, height: 338, opacity: 1.0 },
  'pip-bottom-right': { name: 'PIP Inferior Direito', x: 1240, y: 662, width: 600, height: 338, opacity: 1.0 },
  'pip-bottom-left': { name: 'PIP Inferior Esquerdo', x: 80, y: 662, width: 600, height: 338, opacity: 1.0 },
  'lower-third': { name: 'Tarja / GC Inferior', x: 80, y: 780, width: 1760, height: 220, opacity: 1.0 },
  'split-left': { name: 'Split Tela Esquerda', x: 0, y: 0, width: 960, height: 1080, opacity: 1.0 },
  'split-right': { name: 'Split Tela Direita', x: 960, y: 0, width: 960, height: 1080, opacity: 1.0 }
};

const numeric = (v, min, max, def = min) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return def;
  return n;
};

export class OverlayEngine {
  constructor(p) {
    this.p = p;
    this.scope = null;
    this.channels = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: String(i + 1),
      scene: '',
      transition: i === 0 ? 'Cut' : 'Fade',
      transitionDuration: i === 0 ? 0 : 500,
      transitionType: 'match',
      hideAfter: 0,
      tie: false,
      stinger: {
        enabled: false,
        name: 'Stinger 1',
        cutPointMs: 250,
        audio: true
      },
      dve: {
        preset: 'fullscreen',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        opacity: 1.0
      }
    }));
    this.autoOffTimers = new Map();
    this.saveTail = Promise.resolve();
  }

  async setScope(scope) {
    if (scope === this.scope) return;
    this.stopTimers();
    if (this.scope && this.scope !== scope) {
      for (const ch of this.channels) await this.restoreDve(ch.id).catch(() => {});
    }
    this.scope = scope;
    if (!this.p?.root) return;
    const folder = join(this.p.root, 'config/obs-studio/plugin_config/freemix-overlays');
    const hash = createHash('sha256').update(scope || 'default').digest('hex').slice(0, 24);
    this.file = join(folder, hash + '.json');
    let saved;
    try {
      saved = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (Array.isArray(saved?.channels)) {
      for (const ch of saved.channels) {
        const target = this.channels.find(c => c.id === ch.id);
        if (target) {
          if (ch.transition) target.transition = ch.transition;
          if (ch.transitionDuration !== undefined) target.transitionDuration = ch.transitionDuration;
          if (ch.transitionType) target.transitionType = ch.transitionType;
          if (ch.hideAfter !== undefined) target.hideAfter = ch.hideAfter;
          if (ch.tie !== undefined) target.tie = ch.tie;
          if (ch.stinger) target.stinger = { ...target.stinger, ...ch.stinger };
          if (ch.dve) target.dve = { ...target.dve, ...ch.dve };
          if (ch.dveOriginal) target.dveOriginal = ch.dveOriginal;
          if (ch.dveApplied) target.dveApplied = ch.dveApplied;
        }
      }
    }
  }

  async save() {
    if (!this.file) return;
    const file = this.file;
    const data = JSON.stringify({
      schema: 1,
      scope: this.scope,
      updatedAt: new Date().toISOString(),
      channels: this.channels.map(c => ({
        id: c.id,
        name: c.name,
        transition: c.transition,
        transitionDuration: c.transitionDuration,
        transitionType: c.transitionType,
        hideAfter: c.hideAfter,
        tie: c.tie,
        stinger: c.stinger,
        dve: c.dve,
        dveOriginal: c.dveOriginal || null,
        dveApplied: c.dveApplied || null
      }))
    }, null, 2);

    const task = this.saveTail.then(async () => {
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file + '.tmp', data);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await rename(file + '.tmp', file);
          break;
        } catch (e) {
          if (attempt === 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
          await new Promise(r => setTimeout(r, 50));
        }
      }
    });
    this.saveTail = task.catch(() => {});
    return task;
  }

  stopTimers() {
    for (const timer of this.autoOffTimers.values()) clearTimeout(timer);
    this.autoOffTimers.clear();
  }

  getChannel(channelNum) {
    const ch = Number(channelNum);
    const target = this.channels.find(c => c.id === ch);
    if (!target) throw Error(`Canal de overlay inválido: ${channelNum}. Use 1 a 8.`);
    return target;
  }

  async refreshScenes() {
    if (!this.p?.vendor) return this.summary();
    for (const ch of this.channels) {
      const sceneResp = await this.p.vendor('dsk_get_scene', { dsk_name: ch.name }).catch(() => null);
      if (sceneResp && typeof sceneResp.scene === 'string') ch.scene = sceneResp.scene;
    }
    return this.summary();
  }

  async syncFromHardware() {
    if (!this.p?.vendor) return this.summary();
    try {
      const r = await this.p.vendor('get_downstream_keyers', {}, 'downstream-keyer');
      const existing = r?.downstream_keyers || [];
      // Garantir existência dos 8 canais
      for (let i = 1; i <= 8; i++) {
        const strName = String(i);
        if (!existing.some(k => k.name === strName)) {
          await this.p.vendor('add_downstream_keyer', { dsk_name: strName }, 'downstream-keyer').catch(() => {});
        }
      }

      // Sincronizar cenas ativas de cada canal
      await this.refreshScenes();
    } catch {}
    return this.summary();
  }

  async selectScene(channelNum, sceneName) {
    const ch = this.getChannel(channelNum);
    const scene = String(sceneName || '').trim();

    if (this.autoOffTimers.has(ch.id)) {
      clearTimeout(this.autoOffTimers.get(ch.id));
      this.autoOffTimers.delete(ch.id);
    }

    if (!scene) {
      return this.clearChannel(ch.id);
    }

    // Se a cena mudou, devolve a geometria da cena anterior antes de aplicar a nova.
    if (ch.dveOriginal && ch.dveOriginal.scene && ch.dveOriginal.scene !== scene) {
      await this.restoreDve(ch.id).catch(() => {});
    }

    if (this.p?.vendor) {
      await this.p.vendor('dsk_add_scene', { dsk_name: ch.name, scene }, 'downstream-keyer').catch(() => {});
      const res = await this.p.vendor('dsk_select_scene', { dsk_name: ch.name, scene }, 'downstream-keyer');
      if (res && res.success === false) throw Error(res.error || `O keyer ${ch.name} recusou a entrada`);
    }

    ch.scene = scene;

    if (ch.dve && ch.dve.preset !== 'fullscreen') {
      try {
        await this.applyDve(ch.id, ch.dve);
      } catch (e) {
        ch.dveError = e.message;
      }
    }

    // Se auto-off configurado, programar desarmamento automático
    if (ch.hideAfter > 0) {
      const timer = setTimeout(async () => {
        try {
          await this.clearChannel(ch.id);
        } catch {}
      }, ch.hideAfter * 1000);
      this.autoOffTimers.set(ch.id, timer);
    }

    return ch;
  }

  async clearChannel(channelNum) {
    const ch = this.getChannel(channelNum);
    if (this.autoOffTimers.has(ch.id)) {
      clearTimeout(this.autoOffTimers.get(ch.id));
      this.autoOffTimers.delete(ch.id);
    }

    // Devolve a cena à geometria original antes de tirar o DSK do ar.
    await this.restoreDve(ch.id).catch(() => {});

    if (this.p?.vendor) {
      await this.p.vendor('dsk_select_scene', { dsk_name: ch.name, scene: '' }, 'downstream-keyer').catch(() => {});
    }

    ch.scene = '';
    return ch;
  }

  dveTransform(dve) {
    const x = numeric(dve.x, -3840, 7680, 0);
    const y = numeric(dve.y, -2160, 4320, 0);
    const width = numeric(dve.width, 1, 7680, 1920);
    const height = numeric(dve.height, 1, 4320, 1080);
    return {
      positionX: x,
      positionY: y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      alignment: 5,
      boundsType: 'OBS_BOUNDS_SCALE_INNER',
      boundsAlignment: 5,
      boundsWidth: width,
      boundsHeight: height,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
      cropBottom: 0
    };
  }

  async sceneItems(scene) {
    const list = await this.p.req('GetSceneItemList', { sceneName: scene });
    return Array.isArray(list.sceneItems) ? list.sceneItems : [];
  }

  // Aplica a geometria DVE/PIP à cena do DSK, guardando a transformação original
  // para poder restaurar quando o canal sair do ar ou o operador pedir.
  async applyDve(channelNum, dve = {}) {
    const ch = this.getChannel(channelNum);
    const scene = String(ch.scene || '').trim();
    if (!scene) {
      ch.dveApplied = null;
      ch.dveError = 'Canal fora do ar; a geometria será aplicada ao entrar.';
      return { applied: false, reason: ch.dveError };
    }
    if (!this.p?.req) {
      ch.dveApplied = null;
      ch.dveError = 'Leitura/escrita de cena indisponível neste motor.';
      return { applied: false, reason: ch.dveError };
    }

    if (ch.dveOriginal && ch.dveOriginal.scene && ch.dveOriginal.scene !== scene) {
      await this.restoreDve(channelNum).catch(() => {});
    }

    const items = await this.sceneItems(scene);
    if (!items.length) {
      ch.dveApplied = null;
      ch.dveError = `A cena "${scene}" não tem itens para posicionar.`;
      return { applied: false, reason: ch.dveError };
    }

    if (!ch.dveOriginal || ch.dveOriginal.scene !== scene) {
      ch.dveOriginal = { scene, items: {} };
    }

    const transform = this.dveTransform(dve);
    let applied = 0;
    for (const item of items) {
      const key = item.sourceName || String(item.sceneItemId);
      if (!ch.dveOriginal.items[key]) {
        const current = await this.p.req('GetSceneItemTransform', {
          sceneName: scene,
          sceneItemId: item.sceneItemId
        });
        if (current?.sceneItemTransform) ch.dveOriginal.items[key] = current.sceneItemTransform;
      }
      await this.p.req('SetSceneItemTransform', {
        sceneName: scene,
        sceneItemId: item.sceneItemId,
        sceneItemTransform: transform
      });
      applied++;
    }

    ch.dveApplied = { scene, items: applied, at: Date.now() };
    ch.dveError = '';
    await this.save().catch(() => {});
    return { applied: true, scene, items: applied };
  }

  async restoreDve(channelNum) {
    const ch = this.getChannel(channelNum);
    const original = ch.dveOriginal;
    if (!original?.scene || !original.items) {
      ch.dveApplied = null;
      ch.dveError = '';
      return { restored: false, reason: 'Nenhuma geometria original guardada.' };
    }
    if (!this.p?.req) {
      ch.dveError = 'Leitura/escrita de cena indisponível neste motor.';
      return { restored: false, reason: ch.dveError };
    }

    const items = await this.sceneItems(original.scene).catch(() => []);
    let restored = 0;
    for (const item of items) {
      const key = item.sourceName || String(item.sceneItemId);
      const transform = original.items[key];
      if (!transform) continue;
      const restore = { ...transform };
      // OBS exige boundsWidth/boundsHeight >= 1 mesmo quando boundsType é NONE.
      restore.boundsWidth = Math.max(1, Number(restore.boundsWidth) || 1);
      restore.boundsHeight = Math.max(1, Number(restore.boundsHeight) || 1);
      await this.p.req('SetSceneItemTransform', {
        sceneName: original.scene,
        sceneItemId: item.sceneItemId,
        sceneItemTransform: restore
      });
      restored++;
    }

    ch.dveOriginal = null;
    ch.dveApplied = null;
    ch.dveError = '';
    await this.save().catch(() => {});
    return { restored: true, scene: original.scene, items: restored };
  }

  async toggleChannel(channelNum, sceneName) {
    const ch = this.getChannel(channelNum);
    if (ch.scene === sceneName) {
      return this.clearChannel(channelNum);
    }
    return this.selectScene(channelNum, sceneName);
  }

  async configureChannel(channelNum, cfg = {}) {
    const ch = this.getChannel(channelNum);

    if (cfg.transition !== undefined) {
      const trans = String(cfg.transition).trim();
      if (!trans) throw Error('Transição vazia.');
      // A lista real vem do motor (GetTransitionList). Não validar contra uma lista fixa:
      // o nome instalado pode estar em português (Cortar, Esmaecer, Wipe...).
      ch.transition = trans;
    }

    if (cfg.transitionDuration !== undefined) {
      ch.transitionDuration = numeric(cfg.transitionDuration, 0, 10000, 500);
    }

    if (cfg.transitionType !== undefined) {
      if (!['match', 'show', 'hide'].includes(cfg.transitionType)) {
        throw Error(`Tipo de transição inválido: ${cfg.transitionType}. Use match, show ou hide.`);
      }
      ch.transitionType = cfg.transitionType;
    }

    if (cfg.hideAfter !== undefined) {
      ch.hideAfter = numeric(cfg.hideAfter, 0, 600, 0);
    }

    if (cfg.tie !== undefined) {
      ch.tie = Boolean(cfg.tie);
    }

    if (cfg.stinger) {
      ch.stinger = {
        enabled: Boolean(cfg.stinger.enabled),
        name: String(cfg.stinger.name || 'Stinger 1'),
        cutPointMs: numeric(cfg.stinger.cutPointMs, 0, 5000, 250),
        audio: cfg.stinger.audio !== false
      };
      if (ch.stinger.enabled) {
        ch.transition = ch.stinger.name;
      }
    }

    if (cfg.dve) {
      const presetKey = cfg.dve.preset || ch.dve.preset;
      const base = DVE_PRESETS[presetKey] || DVE_PRESETS.fullscreen;
      ch.dve = {
        preset: presetKey,
        x: numeric(cfg.dve.x ?? base.x, -1920, 3840, base.x),
        y: numeric(cfg.dve.y ?? base.y, -1080, 2160, base.y),
        width: numeric(cfg.dve.width ?? base.width, 100, 3840, base.width),
        height: numeric(cfg.dve.height ?? base.height, 100, 2160, base.height),
        opacity: numeric(cfg.dve.opacity ?? base.opacity, 0.0, 1.0, base.opacity)
      };
    }

    // Aplicar no motor físico se vendor disponível
    if (this.p?.vendor) {
      await this.p.vendor('dsk_set_transition', {
        dsk_name: ch.name,
        transition: ch.transition,
        transition_duration: ch.transitionDuration,
        transition_type: ch.transitionType
      }, 'downstream-keyer').catch(() => {});

      await this.p.vendor('dsk_set_hide_after', {
        dsk_name: ch.name,
        hide_after: ch.hideAfter
      }, 'downstream-keyer').catch(() => {});

      await this.p.vendor('dsk_set_tie', {
        dsk_name: ch.name,
        tie: ch.tie
      }, 'downstream-keyer').catch(() => {});
    }

    if (cfg.dve) {
      if (ch.scene) {
        try {
          await this.applyDve(ch.id, ch.dve);
        } catch (e) {
          ch.dveApplied = null;
          ch.dveError = e.message;
        }
      } else {
        ch.dveApplied = null;
        ch.dveError = 'Canal fora do ar; a geometria será aplicada ao entrar.';
      }
    }

    await this.save();
    return ch;
  }

  // Gera a máscara de 8 bits para as saídas independentes (OutputEngine)
  mask() {
    let m = 0;
    for (let i = 0; i < 8; i++) {
      if (this.channels[i]?.scene) {
        m |= (1 << i);
      }
    }
    return m;
  }

  // Valida se uma saída independente permite a exibição do canal
  isChannelVisibleInOutput(channelNum, outputOverlaysMask) {
    const idx = Number(channelNum) - 1;
    if (idx < 0 || idx >= 8) return false;
    return (outputOverlaysMask & (1 << idx)) !== 0;
  }

  async killAll() {
    this.stopTimers();
    // Limpa todos os canais, mesmo os que o estado local acha que estão vazios.
    // O DSK real pode estar no ar por uma ação do dock ou de outra janela.
    for (const ch of this.channels) {
      await this.clearChannel(ch.id);
    }
    return this.summary();
  }

  async execute(action, d = {}) {
    if (action === 'overlay_get') {
      return this.summary();
    }
    if (action === 'overlay_kill_all') {
      return this.killAll();
    }
    const channel = Number(d.channel);
    if (!Number.isInteger(channel) || channel < 1 || channel > 8) {
      throw Error('Canal de overlay inválido. Use 1 a 8.');
    }
    if (action === 'overlay_take') {
      const scene = String(d.scene || d.input || '').trim();
      if (!scene) throw Error('Informe a entrada para colocar no canal de overlay.');
      return this.selectScene(channel, scene);
    }
    if (action === 'overlay_off') {
      return this.clearChannel(channel);
    }
    if (action === 'overlay_toggle') {
      const scene = String(d.scene || d.input || '').trim();
      return this.toggleChannel(channel, scene);
    }
    if (action === 'overlay_configure') {
      return this.configureChannel(channel, d);
    }
    if (action === 'overlay_dve_apply') {
      return this.applyDve(channel, d.dve || d);
    }
    if (action === 'overlay_dve_restore') {
      return this.restoreDve(channel);
    }
    throw Error(`Ação de overlay não suportada: ${action}`);
  }

  summary() {
    return {
      channels: this.channels.map(c => ({ ...c, dveApplied: c.dveApplied || null, dveError: c.dveError || '' })),
      mask: this.mask(),
      presets: Object.keys(DVE_PRESETS),
      transitions: TRANSITION_KINDS
    };
  }
}

