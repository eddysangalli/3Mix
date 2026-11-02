// Signal Registry + Patch: "A Source should not be rigidly tied to an Input" (task's own model). This module keeps
// a per-project metadata record of which signal an Input Slot is patched from, and applies a patch to a real Input
// (a non-Composition scene) by swapping its single owned scene item while preserving position/scale -- the exact
// technique entradas-producao.mjs's Composition slot replace() already uses, generalized to a whole-Input scope.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export class PatchRegistryEngine {
  constructor(production) {
    this.p = production;
    this.scope = null;
    this.patches = {}; // inputKey -> { signalId, appliedAt }
  }

  async setScope(scope) {
    if (this.scope === scope) return;
    this.scope = scope;
    this.file = join(this.p.root, 'config/obs-studio/plugin_config/freemix-patch',
      createHash('sha256').update(scope).digest('hex').slice(0, 24) + '.json');
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.patches = (data && typeof data.patches === 'object' && data.patches) || {};
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this.patches = {};
    }
  }

  async save() {
    await mkdir(join(this.file, '..'), { recursive: true });
    const text = JSON.stringify({ version: 1, patches: this.patches }, null, 2);
    await writeFile(this.file + '.tmp', text);
    await rename(this.file + '.tmp', this.file);
  }

  summary() {
    return { version: 1, patches: { ...this.patches } };
  }

  // Resolves what an Input's single owned scene item currently points at, with no mutation. Only Inputs that are
  // NOT a Composition (entradas-producao.mjs owns those slots already) are eligible for a whole-Input patch, so the
  // two systems never fight over the same scene item.
  async describe(inputKey) {
    const target = this.p.inputEngine.decorate(
      [{ key: inputKey, name: '', number: 0 }], await this.p.req('GetVideoSettings')
    )[0];
    if (target?.composition) throw Error('Esta entrada é uma Composition; use os slots dela, não o Patch direto.');
    const scene = await this.p.inputEngine.scene(inputKey);
    // Any scene item counts here -- a real Input's own item is usually a direct capture (camera, NDI, color
    // source: inputKind !== null), but a nested sub-scene (inputKind === null, e.g. a privateSlot wrapper) is
    // equally valid content to patch over. Confirmed against the real engine: a plain color_source_v3 item has
    // inputKind:"color_source_v3", not null -- the earlier null-only filter rejected every ordinary Input.
    const items = (await this.p.req('GetSceneItemList', { sceneName: scene.sceneName })).sceneItems
      .filter((i) => !i.isGroup);
    if (items.length !== 1) throw Error('Patch direto exige uma entrada com exatamente uma fonte interna (sem GC/overlay próprio na mesma cena).');
    return { scene, item: items[0] };
  }

  // Applies a patch: the Input Slot (inputKey) keeps its identity, name, position and category; only the scene item
  // it displays changes to point at signalKey. Mirrors Composition slot replace(): create new item with the old
  // item's transform, enable it, save the registry, then remove the old item -- never the other way around, so a
  // failure after creation leaves the Input showing BOTH sources rather than neither.
  async apply({ input, signal }) {
    const { scene, item } = await this.describe(input);
    const source = await this.p.inputEngine.scene(signal);
    if (source.sceneName.startsWith('3Mix Slot ')) throw Error('Selecione um sinal público, não um slot privado de composição.');
    if (source.sceneUuid === scene.sceneUuid) throw Error('Um Input não pode ser roteado para si mesmo.');
    if (await this.p.inputEngine.cycle(scene.sceneName, source.sceneName)) {
      throw Error('Rota cria um ciclo: este sinal já depende deste Input, direta ou indiretamente.');
    }
    const raw = (await this.p.req('GetSceneItemTransform', { sceneName: scene.sceneName, sceneItemId: item.sceneItemId })).sceneItemTransform;
    // GetSceneItemTransform returns read-only fields (sourceWidth/sourceHeight) and, with boundsType NONE, a
    // boundsWidth/boundsHeight of 0 that the engine rejects on write-back (confirmed against the real engine:
    // "SetSceneItemTransform: 402 ... boundsWidth is below the minimum of 1.000000"). Only forward the writable
    // geometry fields, and only include bounds when the source actually uses a bounds box.
    const hasBounds = raw.boundsType && raw.boundsType !== 'OBS_BOUNDS_NONE';
    const transform = {
      positionX: raw.positionX, positionY: raw.positionY, rotation: raw.rotation,
      scaleX: raw.scaleX, scaleY: raw.scaleY, alignment: raw.alignment,
      cropLeft: raw.cropLeft, cropRight: raw.cropRight, cropTop: raw.cropTop, cropBottom: raw.cropBottom,
      ...(hasBounds ? { boundsType: raw.boundsType, boundsAlignment: raw.boundsAlignment, boundsWidth: raw.boundsWidth, boundsHeight: raw.boundsHeight } : {}),
    };
    const added = await this.p.req('CreateSceneItem', { sceneName: scene.sceneName, sourceName: source.sceneName, sceneItemEnabled: false });
    try {
      await this.p.req('SetSceneItemTransform', { sceneName: scene.sceneName, sceneItemId: added.sceneItemId, sceneItemTransform: transform });
      await this.p.req('SetSceneItemEnabled', { sceneName: scene.sceneName, sceneItemId: added.sceneItemId, sceneItemEnabled: true });
      this.patches[scene.sceneUuid] = { signalId: source.sceneUuid, appliedAt: Date.now() };
      await this.save();
      await this.p.req('RemoveSceneItem', { sceneName: scene.sceneName, sceneItemId: item.sceneItemId });
    } catch (e) {
      await this.p.optional('RemoveSceneItem', { sceneName: scene.sceneName, sceneItemId: added.sceneItemId });
      throw e;
    }
    return { input: scene.sceneUuid, signal: source.sceneUuid, appliedAt: this.patches[scene.sceneUuid].appliedAt };
  }

  async execute(action, d = {}) {
    if (action === 'patch_read') return;
    if (action !== 'patch_set') throw Error('Ação de Patch inválida');
    await this.apply({ input: d.input, signal: d.signal });
  }
}
