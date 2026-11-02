import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * OGrafBridge — Orquestrador do Padrão OGraf no ecossistema 3Mix
 */
export class OGrafBridge {
  constructor(ografDir) {
    this.dir = ografDir || process.cwd();
  }

  async getManifest() {
    const raw = await readFile(join(this.dir, 'ograf.json'), 'utf8');
    return JSON.parse(raw);
  }

  buildCommand(action, payload = {}) {
    switch (action.toLowerCase()) {
      case 'load':
        return `window.ograf && window.ograf.load(${JSON.stringify(payload)});`;
      case 'play':
        return `window.ograf && window.ograf.play();`;
      case 'update':
        return `window.ograf && window.ograf.update(${JSON.stringify(payload)});`;
      case 'stop':
        return `window.ograf && window.ograf.stop();`;
      default:
        throw new Error(`Comando OGraf inválido: ${action}`);
    }
  }
}

