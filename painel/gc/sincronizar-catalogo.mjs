import fs from 'fs';
import path from 'path';

const ROOT = 'd:/DRIVE/IA/antigravity/vmixtwste/FreeMix';
const corePath = path.join(ROOT, 'painel/gc/biblioteca/core.js');
const catalogoPath = path.join(ROOT, 'painel/gc/catalogo-biblioteca.js');

let code = fs.readFileSync(corePath, 'utf8');

// Modificar code para expor models em global.models
const modifiedCode = code.replace(/const models\s*=/, 'global.models =');

// Mock browser globals
global.document = {
  currentScript: { src: 'http://localhost/core.js' },
  body: { dataset: { model: 'fm_headline_horizontal' }, style: {} },
  getElementById: () => ({ innerHTML: '' })
};
global.window = {};

// Executar
new Function(modifiedCode)();

if (!global.models || !global.models.length) {
  console.error('Falha ao extrair models!');
  process.exit(1);
}

console.log(`Sucesso! ${global.models.length} modelos extraídos de core.js.`);

const newCatalogo = `// Modelos próprios mesclados em memória; o catálogo do operador permanece intacto.
// Biblioteca Expandida Broadcast FreeMix (${global.models.length} modelos H/V)
(()=>{
 const own=${JSON.stringify(global.models)};
 window.FreeMixGCCatalogMerge=list=>{const result=Array.isArray(list)?list.slice():[],ids=new Set(result.map(x=>x.id));for(const item of own)if(!ids.has(item.id)){result.push(item);ids.add(item.id);}return result;};
 window.GC_CATALOG=window.FreeMixGCCatalogMerge(window.GC_CATALOG);
})();
`;

fs.writeFileSync(catalogoPath, newCatalogo, 'utf8');
console.log('catalogo-biblioteca.js gravado com sucesso!');
