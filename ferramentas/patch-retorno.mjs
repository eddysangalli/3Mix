// One-off edit of painel/mesa.html: the return feed of 3Mix Call as one real switch. Replaces the two manual
// steps left in the call window (start the virtual camera, open a sender page in a browser), which could not work:
// the page opened inside the program and was refused camera and microphone.
import { readFileSync, writeFileSync } from "node:fs";
const dir = "D:/DRIVE/IA/antigravity/vmixtwste/obs-vmix";
const snip = readFileSync(dir + "/ferramentas/retorno.snippet.js", "utf8").replace(/\r\n/g, "\n");
const part = (name, next) => snip.slice(snip.indexOf("//@@" + name) + name.length + 5, next ? snip.indexOf("//@@" + next) : undefined).replace(/\n$/, "");
let s = readFileSync(dir + "/painel/mesa.html", "utf8"), done = 0, missing = 0;
const rep = (a, b) => { if (!s.includes(a)) { missing++; console.log("trecho não encontrado: " + a.slice(0, 70)); return; } s = s.replace(a, () => b); done++; };

rep('  let dragging = null;', part("HELPER", "ACT") + '\n  let dragging = null;');
rep('    audioset: (d) => openPop("audioset", d.v),', part("ACT", "POP") + '\n    audioset: (d) => openPop("audioset", d.v),');
const from = s.indexOf('        + `<div style="background:#131820;border:1px solid #283344'), end = '        + `<div class="row end"><button class="b" data-a="close">Fechar</button></div>`;', to = s.indexOf(end, from);
if (from < 0 || to < 0) { missing++; console.log("trecho não encontrado: blocos de retorno da janela da chamada"); } else { s = s.slice(0, from) + part("POP") + "\n" + s.slice(to); done++; }
rep('await syncItems(); st.stats = await tryReq("GetStats"); await busCheck();', 'await syncItems(); st.stats = await tryReq("GetStats"); await busCheck(); await syncRet();');
rep('if (id === "stats") A.statsload();', 'if (id === "stats") A.statsload(); if (id === "call") syncRet();');
// The sender page and the device probe are plumbing, not inputs: no strip in the mixer.
rep('const v = await tryReq("GetInputVolume", { inputName: i.inputName }); if (!v) continue;',
    'if (i.inputName === RET_SRC || i.inputName === RET_PROBE) continue; const v = await tryReq("GetInputVolume", { inputName: i.inputName }); if (!v) continue;');
if (!missing) writeFileSync(dir + "/painel/mesa.html", s);
console.log(`${done} trechos alterados, ${missing} não encontrados${missing ? " (arquivo NÃO gravado)" : ""}`);
