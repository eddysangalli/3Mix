// Servidor local de prévia e desenvolvimento em tempo real das telas 3Mix
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../painel/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json"
};

const routeAliases = {
  "": "remoto/mesa-principal.html",
  "studio": "remoto/mesa-principal.html",
  "modular": "remoto/mesa-principal.html",
  "replay": "remoto/replay.html",
  "configuracoes": "remoto/configuracoes.html",
  "settings": "remoto/configuracoes.html",
  "audio": "remoto/audio.html",
  "mesa": "mesa.html",
  "hub": "remoto/hub.html",
  "corte": "remoto/corte.html",
  "rundown": "remoto/rundown.html",
  "retornos": "remoto/retornos.html",
  "blackbox": "remoto/blackbox.html",
  "ptz": "remoto/ptz.html",
  "color": "remoto/color.html",
  "modulos": "remoto/modulos.html"
};

createServer(async (req, res) => {
  const rawPath = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^[\\/]+/, "");
  if (rawPath.includes("..")) { res.writeHead(403).end(); return; }

  let targetPath = routeAliases[rawPath] || rawPath;
  if (!extname(targetPath)) targetPath += ".html";

  try {
    let filePath = join(root, targetPath);
    let body;
    try {
      body = await readFile(filePath);
    } catch {
      // Se não encontrou na raiz de painel, tenta em remoto/
      filePath = join(root, 'remoto', targetPath);
      body = await readFile(filePath);
    }
    res.writeHead(200, {
      "Content-Type": types[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }).end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Página não encontrada no 3Mix Studio.");
  }
}).listen(8377, "127.0.0.1", () => {
  console.log("3Mix Studio Live Preview rodando em: http://127.0.0.1:8377/modular");
});
