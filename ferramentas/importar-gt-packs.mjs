#!/usr/bin/env node
/**
 * Imports title packages in the .gtzip format into the 3Mix title gallery: each package is converted to an HTML
 * template (gtzip_converter.mjs), saved under painel/gc/gt_titles and added to the gallery's catalogue (tab
 * "Importados"). Meant for titles the operator made or is licensed to use; nothing is imported by default, and
 * what is imported must not go into a package for other people unless its licence allows it.
 *
 *   node importar-gt-packs.mjs caminho/para/arquivo.gtzip
 *   node importar-gt-packs.mjs --dir caminho/para/pasta_com_gtzips
 *
 * The program shows the new titles the next time it is opened.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cp from 'child_process';
import { convertGtzipFile } from './gtzip_converter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetGcDir = path.resolve(__dirname, '../painel/gc/gt_titles');

function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Uso:\n  node importar-gt-packs.mjs <arquivo.gtzip>\n  node importar-gt-packs.mjs --dir <pasta_com_gtzips>');
    process.exit(0);
  }

  let filesToConvert = [];
  if (args[0] === '--dir') {
    const dir = args[1];
    if (!dir || !fs.existsSync(dir)) { console.error(`Pasta inválida: ${dir}`); process.exit(1); }
    filesToConvert = fs.readdirSync(dir, { recursive: true })
      .filter((f) => typeof f === 'string' && f.toLowerCase().endsWith('.gtzip'))
      .map((f) => path.join(dir, f));
    console.log(`Encontrados ${filesToConvert.length} arquivos .gtzip na pasta.`);
  } else {
    const file = path.resolve(args[0]);
    if (!fs.existsSync(file)) { console.error(`Arquivo não encontrado: ${file}`); process.exit(1); }
    filesToConvert.push(file);
  }

  fs.mkdirSync(targetGcDir, { recursive: true });
  let ok = 0, failed = 0;
  filesToConvert.forEach((file, i) => {
    process.stdout.write(`[${i + 1}/${filesToConvert.length}] ${path.basename(file)}... `);
    try { convertGtzipFile(file, targetGcDir); console.log('convertido'); ok++; }
    catch (err) { console.log(`ERRO: ${err.message}`); failed++; }
  });
  console.log(`${ok} convertidos, ${failed} com erro.`);

  // Rebuild the gallery's catalogue with the same Node that is running this script.
  cp.execFileSync(process.execPath, [path.join(__dirname, 'gerar-catalogo-gc.mjs')], { stdio: 'inherit' });
  process.exit(failed ? 1 : 0);
}

run();
