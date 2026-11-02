// Customer diagnostic: local component integrity only. No upstream requests,
// downloads, installers or independent OBS/plugin update announcements.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)), file = root + "componentes.json";
if (process.argv.includes("--fixar")) throw Error("Hashes dos componentes pertencem à entrega 3Mix aprovada; não podem ser redefinidos no cliente.");
const man = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(man.componentes)) throw Error("Registro local de componentes inválido.");
let changed = 0, unknown = 0;
for (const c of man.componentes) {
  const notes = [];
  c.sha256 ||= {};
  for (const f of c.arquivos || []) {
    if (typeof f !== "string" || isAbsolute(f) || /^[A-Za-z]:/.test(f) || f.split(/[\\/]/).includes("..")) throw Error("Caminho inválido no registro local de componentes.");
    const target = resolve(root, f), inside = relative(root, target);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw Error("Componente fora da instalação.");
    if (!existsSync(target)) { notes.push(`ARQUIVO AUSENTE ${f}`); changed++; continue; }
    const h = createHash("sha256").update(readFileSync(target)).digest("hex");
    if (!c.sha256[f]) { notes.push(`sem hash registrado: ${f}`); unknown++; }
    else if (c.sha256[f] !== h) { notes.push(`ARQUIVO DIFERENTE DO REGISTRADO: ${f}`); changed++; }
  }
  console.log(`${String(c.nome || c.id || "Componente").padEnd(24)} versão ${String(c.versao || "não declarada").padEnd(8)} ${notes.join(" | ") || "integridade local conferida"}`);
}
console.log(`${changed} com arquivo alterado ou ausente, ${unknown} sem hash registrado. Motor e componentes são atualizados somente por uma entrega 3Mix aprovada.`);
if (changed || unknown) process.exitCode = 1;
