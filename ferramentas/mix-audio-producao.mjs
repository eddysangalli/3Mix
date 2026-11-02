// Default Audio Bus per M/E (task's model: "Each M/E should have a selectable default Audio Bus... used by
// destinations that opt to inherit it"). Pure metadata + validation layer over the EXISTING bus infrastructure
// (AudioBusesEngine: Master/A/B fixed tracks, plus up to 8 independent mix-track-to-source buses already
// creatable). This does NOT invent a new audio engine, a fixed "Bus C", nor duplicate routing/mixing logic.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const FIXED = new Set(['master', 'busA', 'busB']); // mirrors AudioBusesEngine.ALLOWED_AUDIO_BUSES semantics (no 'follow_video' here: a default is a destination choice, not a per-output override)

export class MixAudioEngine {
  constructor(production) {
    this.p = production;
    this.scope = null;
    this.defaults = {}; // mixId(2|3|4) -> 'master' | 'busA' | 'busB' | <independent bus key>
  }

  async setScope(scope) {
    if (this.scope === scope) return;
    this.scope = scope;
    this.file = join(this.p.root, 'config/obs-studio/plugin_config/freemix-mix-audio',
      createHash('sha256').update(scope).digest('hex').slice(0, 24) + '.json');
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.defaults = (data && typeof data.defaults === 'object' && data.defaults) || {};
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this.defaults = {};
    }
  }

  async save() {
    await mkdir(join(this.file, '..'), { recursive: true });
    const text = JSON.stringify({ version: 1, defaults: this.defaults }, null, 2);
    await writeFile(this.file + '.tmp', text);
    await rename(this.file + '.tmp', this.file);
  }

  // Real, currently-selectable bus keys: the 3 fixed buses only when their mix-track-to-source engine is active
  // (st.buses), plus whatever independent buses audioRoutingEngine has already discovered this refresh.
  availableBuses() {
    const options = [];
    if (this.p.state?.buses) for (const key of FIXED) options.push(key);
    for (const bus of this.p.audioRoutingEngine?.busEngine?.buses || []) options.push(bus.key);
    return options;
  }

  summary() {
    return { version: 1, defaults: { ...this.defaults }, availableBuses: this.availableBuses() };
  }

  // Resolves the bus a destination of this mixId should use when it has not chosen one of its own -- this is the
  // inheritance point outputs_configure reads; it never mutates anything.
  resolve(mixId) {
    const key = this.defaults[String(mixId)];
    return key && this.availableBuses().includes(key) ? key : null; // a bus removed after being set as default silently falls back to none (Master), never errors a read
  }

  async setDefault({ mixId, bus }) {
    const id = Number(mixId);
    if (![2, 3, 4].includes(id)) throw Error('Selecione M/E 2, 3 ou 4');
    if (bus === null || bus === '') { delete this.defaults[String(id)]; await this.save(); return null; }
    if (!this.availableBuses().includes(bus)) throw Error('Barramento indisponível para esta seleção. Verifique se os barramentos principais estão ligados ou se o barramento independente ainda existe.');
    this.defaults[String(id)] = bus;
    await this.save();
    return bus;
  }

  async execute(action, d = {}) {
    if (action === 'mix_audio_read') return;
    if (action !== 'mix_audio_set') throw Error('Ação de áudio por M/E inválida');
    await this.setDefault({ mixId: d.mixId, bus: d.bus });
  }
}
