// One-off edit of painel/mesa.html: bottom bar laid out like the reference (left-aligned pairs of gear + button,
// "Adicionar Entrada" and "Transmitir" with an arrow, Overlay and five icon buttons on the right) and a status line
// that no longer names the engine. The code blocks live in barra-de-baixo.snippet.js to avoid escaping.
import { readFileSync, writeFileSync } from "node:fs";
const dir = "D:/DRIVE/IA/antigravity/vmixtwste/obs-vmix";
const file = dir + "/painel/mesa.html";
const snip = readFileSync(dir + "/ferramentas/barra-de-baixo.snippet.js", "utf8").replace(/\r\n/g, "\n");
const part = (name, next) => snip.slice(snip.indexOf("//@@" + name) + name.length + 5, next ? snip.indexOf("//@@" + next) : undefined).replace(/\n$/, "");
let s = readFileSync(file, "utf8"), done = 0, missing = 0;
const miss = (what) => { missing++; console.log("trecho não encontrado: " + what); };
const rep = (a, b) => { if (!s.includes(a)) return miss(a.slice(0, 60)); s = s.replace(a, () => b); done++; };

const a = s.indexOf("    const cg = (pop, tip) =>"), endMark = 'title="Painel">${GEAR}</button></div>`;', b = s.indexOf(endMark, a);
if (a < 0 || b < 0) miss("bloco da barra de baixo"); else { s = s.slice(0, a) + part("BOT", "ACT") + s.slice(b + endMark.length); done++; }
rep('    record: () => run(req("ToggleRecord")),', part("ACT", "POP") + '\n    record: () => run(req("ToggleRecord")),');
rep('    else if (st.pop === "gear") p.innerHTML =', part("POP") + '\n    else if (st.pop === "gear") p.innerHTML =');
rep('closeask: (d) => openPop("close", d.v),', 'closeask: (d) => (st.locked ? toast("Trava ligada: destrave no cadeado para fechar entradas", true) : openPop("close", d.v)),');
rep('<span class="res">${res}</span>', '<span class="res">${res}</span><span class="${st.vcam ? "ok" : ""}" title="Saída externa (câmera virtual)">EX</span>');
for (const [x, y] of [["CPU OBS:", "CPU FreeMix:"], ["Render:", "Render Time:"], ["3Mix Pro 27", "3Mix Studio"]]) { if (s.includes(x)) { s = s.split(x).join(y); done++; } else console.log("opcional não encontrado: " + x); }
rep("</style>", `  .bot { background: #0d1013; justify-content: space-between; padding: 0 4px; gap: 0; }
  .bot .b { height: 24px; background: #2a3540; border: 1px solid #4b5967; color: #f2f5f8; font-weight: 700; font-size: 11px; padding: 0 12px; border-radius: 0; }
  .bot .b:hover { background: #364452; } .bot .b.live { background: var(--red); border-color: #ef5a4f; } .bot .b.on { background: var(--grn); border-color: #2fb02c; }
  .bot .b:disabled { color: #6b7480; background: #1b2229; border-color: #2c353e; }
  .bot .g.l { display: flex; align-items: center; gap: 0; } .bot .g.r { display: flex; align-items: center; gap: 3px; }
  .bot .pair { display: inline-flex; align-items: center; margin-left: 26px; } .bot .pair .cg { width: 30px; padding: 0; margin: 0 3px 0 0; border-right: 1px solid #4b5967; }
  .bot .dd { width: 16px; padding: 0; margin-left: -1px; font-size: 7px; } .bot .ib { width: 28px; padding: 0; } .bot .ib svg { width: 14px; height: 14px; }
  body.locked .tt .x { display: none; } body.list .th { display: none; } body.big .tile { width: 236px; }
</style>`);
if (!missing) writeFileSync(file, s);
console.log(`${done} trechos alterados, ${missing} não encontrados${missing ? " (arquivo NÃO gravado)" : ""}`);
