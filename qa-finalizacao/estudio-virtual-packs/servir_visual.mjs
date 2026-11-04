// Servidor estático mínimo, só leitura, sem dependências externas — só para a Claude
// inspecionar visualmente (via preview_screenshot) os packs originais em Downloads e os
// arquivos reconstruídos desta auditoria. Não altera nada nas pastas servidas.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOTS = {
  '/fonte/': 'D:/Users/eddyr/Downloads/3Mix_3_Packs_04_05_06_CAMADAS_4K/',
  '/saida/': 'D:/DRIVE/IA/antigravity/3Mix/3mix-panel/qa-finalizacao/estudio-virtual-packs/saida/',
  '/nano/': 'D:/DRIVE/IA/antigravity/3Mix/3mix-panel/qa-finalizacao/estudio-virtual-packs/teste-nanobanana/',
};
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function listDir(root, relPath) {
  // navegação simples em texto, só pra achar o nome exato do arquivo visualmente
  const { readdirSync } = require('node:fs');
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>QA Visual — 3Mix Estúdio Virtual</h1><p>Use /fonte/Pack_XX/arquivo.png ou /saida/...</p>');
    return;
  }
  const prefix = Object.keys(ROOTS).find(p => url.startsWith(p));
  if (!prefix) { res.writeHead(404); res.end('not found'); return; }
  const rel = url.slice(prefix.length);
  const full = normalize(join(ROOTS[prefix], rel));
  if (!full.startsWith(normalize(ROOTS[prefix]))) { res.writeHead(403); res.end('forbidden'); return; }
  if (!existsSync(full) || !statSync(full).isFile()) { res.writeHead(404); res.end('arquivo não encontrado: ' + full); return; }
  const ext = extname(full).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  createReadStream(full).pipe(res);
});

const port = Number(process.argv[2]) || 8710;
server.listen(port, '127.0.0.1', () => console.log('qa-visual-estudio ouvindo em http://127.0.0.1:' + port));
