// One-off edit of painel/mesa.html, on top of patch-mixer2.mjs: real Master / A / B buses made of "Mix Track" sources
// (plugin Mix Track to Source, GPL-2.0) kept on air by a keyer; output strips with fader, meter, mute, solo and
// "send to Master"; limiter tab in the audio settings; the bottom-right menu with the Audio Bus Manager (in the
// reference that icon is a menu, statistics is the bars icon and shortcuts the grid icon).
import { readFileSync, writeFileSync } from "node:fs";
const dir = "D:/DRIVE/IA/antigravity/vmixtwste/obs-vmix";
const snip = readFileSync(dir + "/ferramentas/barramentos.snippet.js", "utf8").replace(/\r\n/g, "\n");
const part = (name, next) => snip.slice(snip.indexOf("//@@" + name) + name.length + 5, next ? snip.indexOf("//@@" + next) : undefined).replace(/\n$/, "");
let s = readFileSync(dir + "/painel/mesa.html", "utf8"), done = 0, missing = 0;
const rep = (a, b) => { if (!s.includes(a)) { missing++; console.log("trecho não encontrado: " + a.slice(0, 70)); return; } s = s.replace(a, () => b); done++; };
const span = (label, start, end, b) => { const from = s.indexOf(start), to = s.indexOf(end, from); if (from < 0 || to < 0) { missing++; console.log("trecho não encontrado: " + label); return; } s = s.slice(0, from) + b + s.slice(to + end.length); done++; };

rep('.map((s) => s.sceneName); };', '.map((s) => s.sceneName).filter((n) => n !== BUS_SCENE); };');
rep('(r.downstream_keyers || []).slice(0, 8)', '(r.downstream_keyers || []).filter((x) => /^\\d+$/.test(x.name)).slice(0, 8)');
span("leitura do áudio", "  async function syncAudio() {", "st.audio = next; renderMixer();", part("SYNC", "RENDER").replace(/\n  \}$/, ""));
span("montagem do mixer", "    const ARR = `<svg viewBox", "crie uma entrada de mídia.</div>`);", part("RENDER", "ACT"));
rep('  let dragging = null;', part("HELPER", "SYNC") + '\n  let dragging = null;');
rep('    audioset: (d) => openPop("audioset", d.v),', part("ACT", "POP") + '\n    audioset: (d) => openPop("audioset", d.v),');
rep('    else if (st.pop === "gear") p.innerHTML =', part("POP", "FOOT") + '\n    else if (st.pop === "gear") p.innerHTML =');
rep('["add", "ext", "recset", "streamset", "audioset"].includes(st.pop)', '["add", "ext", "recset", "streamset", "audioset", "busman"].includes(st.pop)');
rep('aplicados a esta entrada.</p></div></div><div class="row end">', part("FOOT", "LIM"));
rep('        : (has("gate") ? chk("gate", "Usar o noise gate") + sl("Fecha abaixo de", "gate", "close_threshold", -96, 0, 1, fs("gate").close_threshold ?? -32, " dB") + sl("Abre acima de", "gate", "open_threshold", -96, 0, 1, fs("gate").open_threshold ?? -26, " dB") : none("O noise gate"));', part("LIM"));
rep('["gate", "Noise Gate"]].map(', '["gate", "Noise Gate"], ["lim", "Limitador"]].map(');
rep('gate: f("gate") };', 'gate: f("gate"), lim: f("lim") };');
rep('gate: { n: "3Mix Noise Gate", k: "noise_gate_filter" } };', 'gate: { n: "3Mix Noise Gate", k: "noise_gate_filter" }, lim: { n: "3Mix Limitador", k: "limiter_filter" } };');
rep('if (a) { a.tracks = d.inputAudioTracks; renderMixer(); } }', 'if (a) { a.tracks = d.inputAudioTracks; renderMixer(); if (st.pop === "busman") renderPop(); } }');
rep('await syncItems(); st.stats = await tryReq("GetStats");', 'await syncItems(); st.stats = await tryReq("GetStats"); await busCheck();');
rep('ib("pop", st.pop === "shortcuts", "Exibir os atalhos", "M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z")', 'ib("pop", st.pop === "shortcuts", "Exibir os atalhos", "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z")');
rep(`ib("pop", st.pop === "stats", "Ver estatísticas de desempenho", "M3 5h18v3H3zm0 5.5h18v3H3zM3 16h18v3H3z", true).replace('data-a="pop"', 'data-a="pop" data-v="stats"')`,
    `ib("pop", st.pop === "mainmenu" || st.pop === "busman", "Menu: gerenciador de barramentos de áudio", "M3 5h18v3H3zm0 5.5h18v3H3zM3 16h18v3H3z", true).replace('data-a="pop"', 'data-a="pop" data-v="mainmenu"')}\${ib("pop", st.pop === "stats", "Ver estatísticas de desempenho", "M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z", true).replace('data-a="pop"', 'data-a="pop" data-v="stats"')`);
rep("</style>", `  /* Output strips (Master, A, B), the "buses off" notice and the Audio Bus Manager. */
  .strip.out.live .hd { background: var(--grn); } .strip.out.live.off .hd { background: #5a626e; }
  .busoff { width: 308px; height: 186px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; justify-content: center; padding: 10px 12px; background: #0b0d11; border: 1px solid #2a313c; color: var(--mut); line-height: 1.4; } .busoff b { color: #e1e7ef; }
  .mixer .none.warn { color: #ffb4ae; }
  .busman { max-height: 56vh; overflow: auto; background: #0b0d11; border: 1px solid var(--sep); padding: 4px 8px; }
  .bmr { display: grid; grid-template-columns: minmax(150px, 1fr) 26px 26px 26px 26px; gap: 3px; align-items: center; padding: 2px 0; }
  .bmr span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .bmr b { text-align: center; }
  .bmr button { width: 26px; height: 22px; background: var(--btn); border: 1px solid var(--bd); display: grid; place-items: center; } .bmr button svg { width: 13px; height: 13px; }
  .bmr .sq { background: #05070a; } .bmr .sq.on { background: var(--grn); border-color: #2fb02c; }
</style>`);
if (!missing) writeFileSync(dir + "/painel/mesa.html", s);
console.log(`${done} trechos alterados, ${missing} não encontrados${missing ? " (arquivo NÃO gravado)" : ""}`);
