import fs from 'fs';
import path from 'path';

const ROOT = 'd:/DRIVE/IA/antigravity/vmixtwste/FreeMix';
const corePath = path.join(ROOT, 'painel/gc/biblioteca/core.js');
const thumbDir = path.join(ROOT, 'painel/gc/biblioteca/thumbnails');

let code = fs.readFileSync(corePath, 'utf8');

// Modificar code para expor models e renderGraphic
const modifiedCode = code
  .replace(/const models\s*=/, 'global.models =')
  .replace(/function renderGraphic\s*\(/, 'global.renderGraphic = function(');

global.document = {
  currentScript: { src: 'http://localhost/core.js' },
  body: { dataset: { model: 'fm_headline_horizontal' }, style: {} },
  getElementById: () => ({ innerHTML: '' })
};
global.window = {};

new Function(modifiedCode)();

// Para cada modelo, gerar uma thumbnail representativa
for (const m of global.models) {
  const thumbBase = `${m.kind}_${m.orientation}`;
  const pngPath = path.join(thumbDir, `${thumbBase}.png`);
  const svgPath = path.join(thumbDir, `${thumbBase}.svg`);
  
  const svg = global.renderGraphic(m.id);
  fs.writeFileSync(svgPath, svg, 'utf8');
  
  // Se nao existe o PNG, copia um placeholder ou gera
  if (!fs.existsSync(pngPath)) {
    // Como fallback seguro se PNG nao existir, usamos um PNG existente ou criamos cópia
    const basePng = path.join(thumbDir, m.orientation === 'vertical' ? 'lowerthird_vertical.png' : 'lowerthird_horizontal.png');
    if (fs.existsSync(basePng)) {
      fs.copyFileSync(basePng, pngPath);
    }
  }
}

console.log(`Thumbnails geradas com sucesso para ${global.models.length} modelos!`);
