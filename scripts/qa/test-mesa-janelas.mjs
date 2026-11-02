// The real path from the mesa to each new window, on the sandbox: the mesa page of that installation is loaded the way
// the program loads it (from its file), its cog buttons are clicked with real mouse input, and the program itself is
// asked which windows it opened. Each window is then closed through the same request the windows' own buttons use.
//   node scripts/qa/test-mesa-janelas.mjs [pasta-para-retratos]
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openTest, until, sleep } from "./navegador-teste.mjs";

const t = await openTest({ width: 1835, height: 885, shots: process.argv[2] ? path.resolve(process.argv[2]) : null }), { page, check } = t;
const { connect } = await import(pathToFileURL(path.join(t.sandbox.installed, "ferramentas/obsws.mjs"))), obs = await connect({ root: t.sandbox.installed });
const panels = async () => { const r = (await obs.req("CallVendorRequest", { vendorName: "freemix", requestType: "get_interface", requestData: {} })).responseData; return r.panels || []; };   // the program lists its windows by title and size
const closePanel = async (url) => { for (let i = 0; i < 5; i++) { try { const r = await (await fetch(t.base + "/api/panel-close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })).json(); if (r.success === true) return r; } catch {} await sleep(250); } return { success: false }; };
const WINDOWS = [["streamset", "/transmitir", "Configurações de streaming", 700, 445], ["recset", "/gravar", "Configuração de gravação", 700, 300], ["ext", "/externo", "Saídas externas", 700, 540], ["iso", "/multicorder", "MultiGravação", 700, 540]];
const shown = async (name, w, h) => (await panels()).find((p) => p.visible && p.title.toLowerCase() === name.toLowerCase() && p.width === w && p.height === h);
try {
  await page.open(pathToFileURL(path.join(t.sandbox.installed, "painel/mesa.html")).href);
  const ready = await until(() => page.ev(`!!document.querySelector('[data-a="pop"][data-v="recset"]') && !document.querySelector('[data-a="record"]')?.disabled`), 30000);
  check("a mesa carrega e conecta ao programa", ready === true, ready ? "" : await page.ev(`document.body.innerText.slice(0, 200)`));
  await sleep(1500);
  await page.shot("mesa");
  for (const [id, route, name, w, h] of WINDOWS) {
    const selector = `[data-a="pop"][data-v="${id}"]`, has = await page.ev(`!!document.querySelector(${JSON.stringify(selector)})`);
    if (!has) { check(`engrenagem de "${name}" existe na mesa`, false, "botão não encontrado"); continue; }
    const result = await page.click(selector), url = t.base + route;
    const opened = await until(() => shown(name, w, h), 15000);
    check(`a engrenagem de "${name}" abre a janela nova dentro do programa, com esse título e ${w}×${h}`, result === "ok" && !!opened, opened ? "" : `clique: ${result}; janelas abertas: ${(await panels()).map((p) => `"${p.title}" ${p.width}×${p.height}`).join(", ") || "nenhuma"}`);
    const closed = await closePanel(url), gone = await until(async () => !(await panels()).some((p) => p.visible && p.width === w && p.height === h && p.title.toLowerCase().includes(name.toLowerCase().slice(0, 6))), 8000);
    if (opened) check(`"${name}" fecha pelo pedido de fechar`, closed.success === true && gone === true);
    await sleep(350);
  }
  check("nenhum erro de script na mesa", t.problems.length === 0, t.problems.slice(0, 3).join(" | "));
} finally { obs.close?.(); }
process.exit((await t.finish()) ? 0 : 1);
