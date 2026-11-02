// One-off edit of painel/mesa.html: "Salvar como" has to go through the engine, which keeps its own list of
// productions and ignores files that appear on disk. Sequence: the engine creates the new production (empty), goes
// back to the original, the helper fills the new file with the copy, and the engine opens it.
import { readFileSync, writeFileSync } from "node:fs";
const file = "D:/DRIVE/IA/antigravity/vmixtwste/obs-vmix/painel/mesa.html";
let s = readFileSync(file, "utf8");
const a = s.indexOf('      await req("SetPersistentData", { realm: "OBS_WEBSOCKET_DATA_REALM_GLOBAL", slotName: "freemix_cmd"');
const endMark = 'Abra o programa pelo atalho Iniciar Mesa.", true);';
const b = s.indexOf(endMark, a);
if (a < 0 || b < 0) { console.log("trecho não encontrado"); process.exit(1); }
const block = [
  '      const from = c.currentSceneCollectionName, before = st.scenes.length;',
  '      toast("Salvando a cópia…");',
  '      await req("CreateSceneCollection", { sceneCollectionName: name }); await sleep(1500);',
  '      await req("SetCurrentSceneCollection", { sceneCollectionName: from }); await sleep(2200);',
  '      await req("SetPersistentData", { realm: "OBS_WEBSOCKET_DATA_REALM_GLOBAL", slotName: "freemix_cmd", slotValue: { id: Date.now(), cmd: "saveas", from, name } });',
  '      await sleep(2500);',
  '      await req("SetCurrentSceneCollection", { sceneCollectionName: name }); await sleep(2800);',
  '      const now = (await req("GetSceneList")).scenes.length;',
  '      if (now >= before && now > 1) return toast(`Preset salvo como "${name}"`);',
  '      await req("SetCurrentSceneCollection", { sceneCollectionName: from });',
  '      toast("A cópia ficou vazia: o ajudante do 3Mix não respondeu. Abra o programa pelo atalho Iniciar Mesa.", true);',
].join("\n");
s = s.slice(0, a) + block + s.slice(b + endMark.length);
writeFileSync(file, s);
console.log("Salvar como reescrito");
