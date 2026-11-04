// Gerenciamento local de cópia de projetos ("Salvar como") e modelos de projeto ("Salvar como modelo")
// Opera diretamente sobre config/obs-studio/basic/scenes e plugin_config/freemix-control/templates.
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { clonePreset } from './clonar-preset.mjs';

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const topNameRx = (name) => new RegExp(`^ {4}"name"\\s*:\\s*${escapeRx(JSON.stringify(name))}(?=\\s*,?\\s*$)`, 'm');
const safeSlug = (name) => String(name || 'projeto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'projeto';

async function findSceneCollectionFile(scenesDir, collectionName) {
  const rx = topNameRx(collectionName);
  let files = [];
  try { files = await readdir(scenesDir); } catch { return null; }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const full = join(scenesDir, f);
    try {
      const text = await readFile(full, 'utf8');
      if (rx.test(text)) return { path: full, text };
    } catch {}
  }
  return null;
}

export async function copySceneCollectionOnDisk(root, from, name) {
  if (!from || !name || from === name) throw new Error('Informe nomes de origem e destino diferentes.');
  const scenesDir = join(root, 'config', 'obs-studio', 'basic', 'scenes');
  const src = await findSceneCollectionFile(scenesDir, from);
  if (!src) throw new Error(`Arquivo da produção "${from}" não encontrado em scenes.`);
  const existing = await findSceneCollectionFile(scenesDir, name);
  const dstPath = existing ? existing.path : join(scenesDir, `${safeSlug(name)}.json`);
  const line = '    "name": ' + JSON.stringify(name);
  const rx = topNameRx(from);
  const updated = src.text.replace(rx, () => line).replace(/("record_mode"\s*:\s*)1(?=\s*[,}])/g, '$10');
  if (updated === src.text || !updated.includes(line)) {
    throw new Error('Não foi possível atualizar o nome interno da coleção.');
  }
  await mkdir(scenesDir, { recursive: true });
  await writeFile(dstPath, updated, 'utf8');
  await clonePreset(root, from, name).catch(() => {});
  return { success: true, from, name, dstPath };
}

const templatesDirOf = (root) => join(root, 'config', 'obs-studio', 'plugin_config', 'freemix-control', 'templates');

export async function listProjectTemplates(root) {
  const dir = templatesDirOf(root);
  let files = [];
  try { files = await readdir(dir); } catch { return []; }
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(await readFile(join(dir, f), 'utf8'));
      if (raw && raw.id && raw.name) {
        out.push({
          id: raw.id,
          name: raw.name,
          fromProject: raw.fromProject || '',
          sceneNames: Array.isArray(raw.sceneNames) ? raw.sceneNames : [],
          createdAt: raw.createdAt || null
        });
      }
    } catch {}
  }
  return out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function saveProjectTemplate(root, { from, templateName, sceneNames = [], video = null, importedTemplate = null }) {
  const dir = templatesDirOf(root);
  await mkdir(dir, { recursive: true });
  if (importedTemplate && typeof importedTemplate === 'object') {
    const name = String(templateName || importedTemplate.name || 'Modelo Importado').trim().slice(0, 40);
    const id = safeSlug(name) + '_' + Date.now().toString(36);
    const record = {
      kind: '3Mix Project Template',
      schema: 1,
      id,
      name,
      fromProject: importedTemplate.fromProject || from || 'Importado',
      createdAt: new Date().toISOString(),
      sceneNames: Array.isArray(importedTemplate.sceneNames) ? importedTemplate.sceneNames : [],
      video: importedTemplate.video || video || null,
      sceneCollectionJson: typeof importedTemplate.sceneCollectionJson === 'string' ? importedTemplate.sceneCollectionJson : null,
      wizardTemplate: importedTemplate.wizardTemplate || (importedTemplate.kind === 'FreeMix Project Template' ? importedTemplate : null)
    };
    await writeFile(join(dir, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
    return { template: record, templates: await listProjectTemplates(root) };
  }
  const name = String(templateName || `${from || 'Produção'} - Modelo`).trim().slice(0, 40);
  if (!name) throw new Error('Informe um nome para o modelo.');
  const scenesDir = join(root, 'config', 'obs-studio', 'basic', 'scenes');
  const src = from ? await findSceneCollectionFile(scenesDir, from) : null;
  const id = safeSlug(name) + '_' + Date.now().toString(36);
  const cleanJson = src ? src.text.replace(/("record_mode"\s*:\s*)1(?=\s*[,}])/g, '$10') : null;
  const record = {
    kind: '3Mix Project Template',
    schema: 1,
    id,
    name,
    fromProject: from || '',
    createdAt: new Date().toISOString(),
    sceneNames: Array.isArray(sceneNames) ? sceneNames : [],
    video: video || null,
    sceneCollectionJson: cleanJson,
    wizardTemplate: {
      kind: 'FreeMix Project Template',
      schema: 1,
      name,
      video: {
        format: video?.baseWidth === 1080 && video?.baseHeight === 1920 ? 'vertical' : 'horizontal',
        fps: video?.fpsNumerator && video?.fpsDenominator ? Math.round(video.fpsNumerator / video.fpsDenominator) : 30
      },
      cameras: [0, 1, 2, 3].map((i) => ({ slot: i + 1, label: sceneNames[i] || `CAM ${i + 1}`, mode: 'placeholder', explicit: true })),
      audio: { mode: 'none' }
    }
  };
  await writeFile(join(dir, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
  return { template: record, templates: await listProjectTemplates(root) };
}

export async function getProjectTemplate(root, templateId) {
  const dir = templatesDirOf(root);
  const safeId = String(templateId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('Modelo inválido.');
  return JSON.parse(await readFile(join(dir, `${safeId}.json`), 'utf8'));
}

export async function deleteProjectTemplate(root, templateId) {
  const dir = templatesDirOf(root);
  const safeId = String(templateId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('Modelo inválido.');
  await rm(join(dir, `${safeId}.json`), { force: true });
  return { templates: await listProjectTemplates(root) };
}

export async function applyProjectTemplateToCollection(root, { templateId, name }) {
  const tpl = await getProjectTemplate(root, templateId);
  const scenesDir = join(root, 'config', 'obs-studio', 'basic', 'scenes');
  const existing = await findSceneCollectionFile(scenesDir, name);
  const dstPath = existing ? existing.path : join(scenesDir, `${safeSlug(name)}.json`);
  if (tpl.sceneCollectionJson) {
    const line = '    "name": ' + JSON.stringify(name);
    const updated = tpl.sceneCollectionJson.replace(/^ {4}"name"\s*:\s*".*?"(?=\s*,?\s*$)/m, () => line);
    await mkdir(scenesDir, { recursive: true });
    await writeFile(dstPath, updated, 'utf8');
    if (tpl.fromProject) await clonePreset(root, tpl.fromProject, name).catch(() => {});
    return { appliedFullCollection: true, sceneNames: tpl.sceneNames || [], name };
  }
  return { appliedFullCollection: false, sceneNames: tpl.sceneNames || [], name };
}

