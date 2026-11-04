// Click-test of the production clocks: top bar (painel/topbar.html) and the set-up window in the panel.
// Engine with --remote-debugging-port=9333. Puts the clocks and the Program scene back at the end.
import { createRequire } from "node:module";
import { connect, sleep } from "./obsws.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const attach = async (end) => { const t = (await (await fetch("http://127.0.0.1:9333/json")).json()).find((x) => x.url.endsWith(end)); const c = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => c.on("open", r)); let id = 0; const waits = new Map(); c.on("message", (raw) => { const m = JSON.parse(String(raw)); waits.get(m.id)?.(m); waits.delete(m.id); });
  return { ev: (expression) => new Promise((r) => { const i = ++id; waits.set(i, (m) => r(m.result?.exceptionDetails ? "ERRO: " + m.result.exceptionDetails.exception?.description : m.result?.result?.value)); c.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } })); }), close: () => c.close() }; };
const mesa = await attach("painel/mesa.html"), top = await attach("painel/topbar.html"), obs = await connect();
let pass = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (ok) pass++; console.log(`${ok ? "OK   " : "FALHA"} ${name}${detail !== "" ? "  (" + detail + ")" : ""}`); };
const slot = async (i) => JSON.parse(await top.ev(`JSON.stringify((() => { const e = document.getElementById(["k-rec", "k-str", "k-now"][${i}]); return { t: e.textContent, c: e.className, h: e.hidden }; })())`));
const choose = (idv, value) => mesa.ev(`(() => { const el = document.getElementById(${JSON.stringify(idv)}); if (!el) return "sem campo"; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("change", { bubbles: true })); return "ok"; })()`);
const hhmm = (ms) => new Date(Date.now() + ms).toTimeString().slice(0, 5);
const SLOT = { realm: "OBS_WEBSOCKET_DATA_REALM_GLOBAL", slotName: "freemix_clocks" };
const saved = (await obs.tryReq("GetPersistentData", SLOT))?.slotValue ?? null, prog0 = (await obs.req("GetCurrentProgramScene")).currentProgramSceneName;
await obs.req("SetPersistentData", { ...SLOT, slotValue: [{ type: "rec" }, { type: "stream" }, { type: "clock" }] });
await mesa.ev("location.reload()"); await top.ev("location.reload()"); await sleep(7500);
try {
  const a = await slot(0), b = await slot(1), c = await slot(2);
  check("de fábrica: gravação, transmissão e a hora", a.t.startsWith("REC ") && b.t.startsWith("NO AR ") && /^\d\d:\d\d:\d\d$/.test(c.t), `${a.t} | ${b.t} | ${c.t}`);
  await top.ev(`document.getElementById("clk").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`); await sleep(1500);
  check("duplo clique nos relógios abre a janela de configuração na mesa", (await mesa.ev("st.pop")) === "clocks" && (await mesa.ev(`document.querySelectorAll('.pop select[data-ck]').length`)) === 3);
  await choose("ck-t2", "event"); await sleep(400);
  check("escolher Evento mostra os campos de início e fim", (await mesa.ev(`!!document.getElementById("ck-s2") && !!document.getElementById("ck-e2")`)) === true);
  await mesa.ev(`document.getElementById("ck-s2").value = ${JSON.stringify(hhmm(-120000))}; document.getElementById("ck-e2").value = ${JSON.stringify(hhmm(600000))}`);
  await choose("ck-t1", "remaining"); await sleep(400);
  await mesa.ev(`document.getElementById("ck-s2").value = ${JSON.stringify(hhmm(-120000))}; document.getElementById("ck-e2").value = ${JSON.stringify(hhmm(600000))}`);
  await choose("ck-t0", "message"); await sleep(400);
  check("mensagem abre campo curto no primeiro relógio", (await mesa.ev(`document.getElementById("ck-m0")?.maxLength`)) === 40);
  await mesa.ev(`document.getElementById("ck-m0").value = "FALTAM 2 MINUTOS"`);
  await mesa.ev(`document.querySelector('.pop [data-a="clockssave"]').click()`); await sleep(1200);
  const stored = (await obs.req("GetPersistentData", SLOT)).slotValue;
  check("a escolha fica gravada no programa", Array.isArray(stored) && stored[0].type === "message" && stored[0].message === "FALTAM 2 MINUTOS" && stored[1].type === "remaining" && stored[2].type === "event" && !!stored[2].start, JSON.stringify(stored.map((x) => x.type)));
  await sleep(1500);
  check("mensagem no relógio é transmitida ao topo", (await slot(0)).t === "FALTAM 2 MINUTOS", (await slot(0)).t);
  await sleep(1500);
  const ev1 = await slot(2); await sleep(2100); const ev2 = await slot(2);
  check("evento em andamento: contagem até o fim, em verde, andando", ev1.t.startsWith("EVENTO 00:0") && ev1.c === "green" && ev1.t !== ev2.t, `${ev1.t} -> ${ev2.t}`);
  await obs.req("SetCurrentProgramScene", { sceneName: "VT" }); await sleep(3500);
  const r1 = await slot(1); await sleep(1200); const r2 = await slot(1);
  check("tempo restante da mídia que está no Output", /^RESTA 00:00:0\d$/.test(r1.t) && /^RESTA 00:00:0\d$/.test(r2.t), `${r1.t} -> ${r2.t}`);
  await obs.req("SetCurrentProgramScene", { sceneName: "CAM 1" }); await sleep(3500);
  check("sem mídia no Output, o tempo restante fica em branco", (await slot(1)).t === "RESTA --:--:--", (await slot(1)).t);
} finally {
  await mesa.ev("closePop()");
  const back = Array.isArray(saved) ? saved : [{ type: "rec" }, { type: "stream" }, { type: "clock" }];
  await obs.req("SetPersistentData", { ...SLOT, slotValue: back }); await obs.req("BroadcastCustomEvent", { eventData: { freemix: { clocks: back } } });
  await obs.tryReq("SetCurrentProgramScene", { sceneName: prog0 });
}
console.log(`${pass}/${total} verificações passaram`);
obs.close(); mesa.close(); top.close();
