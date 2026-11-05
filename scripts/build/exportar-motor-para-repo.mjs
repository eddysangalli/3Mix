// After a frozen engine build: exports the fork's commits into the repository (FreeMix/fork) as patches, checks that
// the engine can be rebuilt from them, and updates the files that name the current engine and version.
//   node scripts/build/exportar-motor-para-repo.mjs <native-build-frozen-XXXXXXX-configured.json>
// Does not commit or push.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const repo = path.resolve(import.meta.dirname, "../.."), ws = path.dirname(repo), native = path.join(ws, "3mix-engine"), freezePath = path.resolve(process.argv[2] || "");
const f = JSON.parse(await fs.readFile(freezePath, "utf8"));
assert.equal(f.build.exitCode, 0); assert.match(f.head, /^[a-f0-9]{40}$/);
const manifest = JSON.parse(await fs.readFile(path.join(repo, "fork/manifest.json"), "utf8"));
assert.match(manifest.base, /^[a-f0-9]{40}$/, "manifesto sem baseline nativa válida");
const count = Number(execFileSync("git", ["-C", native, "rev-list", "--count", manifest.base + ".." + f.head], { encoding: "utf8" }).trim());
assert.equal(execFileSync("git", ["-C", native, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), f.head, "the fork moved after this build was frozen");
const version = "0.1.0-local." + f.at.slice(0, 19).replaceAll(/[-:T]/g, "");
const exported = JSON.parse(execFileSync(process.execPath, [path.join(repo, "scripts/distribuicao/exportar-fontes-native.mjs"), "--native=" + native, "--product=" + repo, "--head=" + f.head, "--version=" + version], { cwd: ws, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }));
assert.equal(exported.status, "PASS");
const rebuilt = JSON.parse(execFileSync(process.execPath, [path.join(repo, "scripts/reconstruir-motor.mjs"), "--check"], { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 }));
assert.equal(rebuilt.status, "PASS"); assert.equal(rebuilt.parentPatches, count);
await fs.writeFile(path.join(repo, "version.json"), JSON.stringify({ version, createdAt: new Date().toISOString(), channel: "local-candidate" }, null, 2) + "\n");
await fs.writeFile(path.join(repo, "FONTES.md"), `# Fontes do FreeMix\n\nMotor Native${count} **${f.head}**: ${count} patches sobre o OBS Studio 32.2.2, ${exported.submodules.length} submódulos, ${exported.sourceFiles.length} arquivos de fonte conferidos. Versão de desenvolvimento ${version}. [Como reconstruir](docs/BUILD-FROM-SOURCE.md) · [pendências](docs/PENDENCIAS-REAIS.md). O instalador selecionado continua o 0.1.0-local.20261010060000; este motor ainda não está em instalador. Créditos e licenças de origem preservados.\n`);
await fs.writeFile(path.join(repo, "fork/LEIAME.md"), `# Motor nativo do FreeMix\n\n${count} patches e ${exported.submodules.length} submódulos, HEAD ${f.head}. [Manifesto](manifest.json) · [verificação](source-verification.json). Compilação completa e reconstrução a partir dos patches conferidas; ainda não está em instalador.\n`);
console.log(JSON.stringify({ status: "PASS", head: f.head, native: count, version, patches: rebuilt.parentPatches, sourceFiles: exported.sourceFiles.length }));
