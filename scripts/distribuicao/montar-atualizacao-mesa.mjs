// Builds a signed update package for an existing installation (the operator's mesa or a rehearsal copy of it).
//
// What the installation should become = the selected full package + the frozen engine build + the repository's panel
// and tools: the same composition the app tests run. The package holds only the files that differ from what the
// installation has now, so it is small and its application is quick. The installation is only READ here.
//
//   node scripts/distribuicao/montar-atualizacao-mesa.mjs --freeze=<native-build-frozen-*.json> --target=<installation>
//        [--base=<FreeMix-Completo-* folder>] [--dry]
//
// --dry   only reports what would go in. Without it the package is written to entregas/FreeMix-Atualizacao-<version>
//         and signed with the local release key. Nothing is applied and ULTIMA-ATUALIZACAO.json is NOT touched:
//         arming the update for the mesa is a separate, deliberate step (armar-atualizacao-mesa.mjs).
// Never included: settings, recordings, the control password file, imported titles and their catalogue, session files.
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash, sign, verify, createPublicKey } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {updateRoots,excludedFromUpdate,dependencyUpdatePath,alphaReleaseDocuments,validateFrozenFile} from "./update-path-policy.mjs";
const {ws,repo}=updateRoots(import.meta.dirname);
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); assert(m, "argumento inválido: " + a); return [m[1], m[2] ?? true]; }));
assert(args.freeze && args.target, "informe --freeze e --target");
const base = path.resolve(args.base || path.join(ws, "entregas/FreeMix-Completo-0.1.0-local.20261010060000")), target = path.resolve(args.target);
const frozen = JSON.parse(await fs.readFile(path.resolve(args.freeze), "utf8"));
const digest = async (file) => { const h = createHash("sha256"); for await (const b of createReadStream(file)) h.update(b); return h.digest("hex"); };
const exists = (p) => fs.access(p).then(() => true, () => false);

// Paths that belong to the operator or are written while the program runs.
const never = excludedFromUpdate;

// 1. What the installation should have: path -> source file.
const want = new Map();
const baseManifest = JSON.parse(await fs.readFile(path.join(base, "manifest.json"), "utf8"));
for (const f of baseManifest.files) if (!never(f.path)) want.set(f.path, path.join(base, f.path));
for (const f of frozen.files) if (!never(f.path)) {
  const source=path.join(frozen.root,f.path), info=await fs.lstat(source);
  assert(info.isFile()&&!info.isSymbolicLink(), "fonte nativa irregular: "+f.path);
  validateFrozenFile(f,info.size,await digest(source));
  want.set(f.path,source);
}
assert.equal(execFileSync("git", ["-C", repo, "status", "--porcelain"], { encoding: "utf8" }).trim(), "", "o repositório FreeMix tem alterações não commitadas");
const tracked = execFileSync("git", ["-C", repo, "ls-files", "-z"], { maxBuffer: 16 * 1024 * 1024 }).toString().split("\0").filter(Boolean);
for (const p of tracked) if (p.startsWith("painel/") && !never(p)) want.set(p, path.join(repo, p));
const { runtimeDependencyClosure } = await import(pathToFileURL(path.join(repo, "ferramentas/pacote-dependencias.mjs")));
const components = JSON.parse(await fs.readFile(path.join(base, "componentes.json"), "utf8"));
const closure = await runtimeDependencyClosure(path.join(repo, "ferramentas"), components.runtimeLocal.runtimeModules, { copiedModuleRoots: [path.join(repo, "painel")] });
for (const p of closure) want.set(dependencyUpdatePath(p), path.join(repo, "ferramentas", p));
for(const p of alphaReleaseDocuments){assert(await exists(path.join(repo,p)),"documento Alpha ausente: "+p);want.set(p,path.join(repo,p));}
for (const p of ["docs/CONTINUAR.md", "docs/PENDENCIAS-REAIS.md", "docs/ENTREGA-ATUAL.md", "FONTES.md"]) if (await exists(path.join(repo, p))) want.set(p, path.join(repo, p));

// 2. Component list with the hashes of what will really be there.
const head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const hashOfWanted = async (p) => (want.has(p) ? digest(want.get(p)) : (await exists(path.join(target, p))) ? digest(path.join(target, p)) : null);
for (const c of components.componentes || []) for (const file of Object.keys(c.sha256 || {})) { const h = await hashOfWanted(file); if (h) c.sha256[file] = h; }
for (const file of Object.keys(components.runtimeLocal.sha256 || {})) { const h = await hashOfWanted(file); if (h) components.runtimeLocal.sha256[file] = h; }
Object.assign(components.runtimeLocal, { nativeCommit: frozen.head, nativeBuildSource: "frozen-build", runtimeModules: closure });

// 3. Only what differs from the installation goes into the package.
const installedVersion = JSON.parse(await fs.readFile(path.join(target, "version.json"), "utf8")).version;
const version = "0.1.0-local." + new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const changed = []; let same = 0;
for (const [p, source] of [...want].sort((a, b) => a[0].localeCompare(b[0]))) {
  const s = await fs.lstat(source); assert(s.isFile() && !s.isSymbolicLink(), "fonte inválida: " + p);
  const dest = path.join(target, p), newHash = await digest(source);
  if ((await exists(dest)) && (await fs.stat(dest)).size === s.size && (await digest(dest)) === newHash) { same++; continue; }
  changed.push({ path: p, source, size: s.size, sha256: newHash, isNew: !(await exists(dest)) });
}
const groups = {}; for (const f of changed) { const k = f.path.includes("/") ? f.path.split("/").slice(0, /^(painel|ferramentas|node_modules|docs)\//.test(f.path) ? 1 : 2).join("/") : "(raiz)"; (groups[k] ||= { files: 0, bytes: 0, novos: 0 }); groups[k].files++; groups[k].bytes += f.size; if (f.isNew) groups[k].novos++; }
const report = { target, installedVersion, version, engine: frozen.head, repository: head, wanted: want.size, alreadyEqual: same, changed: changed.length, new: changed.filter((f) => f.isNew).length, megabytes: Math.round(changed.reduce((n, f) => n + f.size, 0) / 1048576), groups };
if (args.dry) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }

// 4. Write, sign, and check the package the way the installation's own updater will.
const out = path.join(ws, "entregas", "FreeMix-Atualizacao-" + version); await fs.mkdir(out);
for (const f of changed) { const dest = path.join(out, f.path); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.copyFile(f.source, dest); assert.equal(await digest(dest), f.sha256); }
const extra = { "version.json": JSON.stringify({ version, createdAt: new Date().toISOString(), channel: "local-candidate", kind: "incremental-update", baseVersion: installedVersion }, null, 2) + "\n", "componentes.json": JSON.stringify(components, null, 2) };
const files = changed.filter((f) => !(f.path in extra)).map(({ path: p, size, sha256 }) => ({ path: p, size, sha256 }));
for (const [name, text] of Object.entries(extra)) { await fs.writeFile(path.join(out, name), text); files.push({ path: name, size: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") }); }
files.sort((a, b) => a.path.localeCompare(b.path));
const raw = Buffer.from(JSON.stringify({ format: 1, version, createdAt: new Date().toISOString(), files }));
const privateKey = await fs.readFile(path.join(ws, "release-keys/ed25519-private.pem")), publicKey = await fs.readFile(path.join(target, "update-public.pem"));
assert.equal(createPublicKey(privateKey).asymmetricKeyType, "ed25519");
const signature = sign(null, raw, privateKey); assert(verify(null, raw, publicKey, signature), "a chave local não corresponde à chave pública da instalação");
await fs.writeFile(path.join(out, "manifest.json"), raw, { flag: "wx" }); await fs.writeFile(path.join(out, "manifest.sig"), signature, { flag: "wx" });
const { inspect } = await import(pathToFileURL(path.join(target, "ferramentas/atualizar-freemix.mjs")));
const checked = await inspect(target, out, publicKey); assert.equal(checked.version, version);
await fs.writeFile(path.join(out, "LEIA-ME-INCREMENTO.md"), `# Atualização ${version}\n\nDe ${installedVersion} para ${version}: motor ${frozen.head.slice(0, 7)}, painel e ferramentas do repositório em ${head.slice(0, 7)}, demais arquivos iguais aos do pacote ${path.basename(base)}.\n${files.length} arquivos (${report.megabytes} MB). Configurações, gravações, títulos importados e sessões não fazem parte do pacote.\nAplicar: o iniciador aplica com a mesa fechada e guarda cópia do que foi trocado em \`updates/\` (desfazer: \`ferramentas/atualizar-freemix.mjs rollback <instalação> <pasta em updates>\`).\n`);
await fs.writeFile(path.join(ws, "qa-finalizacao", "atualizacao-" + version + ".json"), JSON.stringify({ ...report, package: out, files: files.length, manifestSha256: createHash("sha256").update(raw).digest("hex"), acceptedByInstalledUpdater: true, applied: false, armedForOperator: false }, null, 2) + "\n");
console.log(JSON.stringify({ status: "PACKAGE_SIGNED_NOT_APPLIED", version, package: out, files: files.length, megabytes: report.megabytes }));
