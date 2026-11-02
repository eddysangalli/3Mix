// One-off edit of painel/mesa.html for the rebuilt top bar: Salvar, Salvar como, Último, Tela Cheia, Pausar Entradas,
// Básico, the Configurar list and the help window. "Salvar como" needs the local helper (ferramentas/ajudante.ps1),
// because the engine cannot duplicate a production when asked from outside.
import { readFileSync, writeFileSync } from "node:fs";
const file = "D:/DRIVE/IA/antigravity/vmixtwste/obs-vmix/painel/mesa.html";
let s = readFileSync(file, "utf8"), done = 0, missing = 0;
const rep = (a, b) => { const hit = typeof a === "string" ? s.includes(a) : a.test(s); if (!hit) { missing++; console.log("trecho não encontrado:", String(a).slice(0, 70)); return; } s = s.replace(a, () => b); done++; };

rep("</style>", "  body.basic .tile .r, body.basic .mixer { display: none !important; }\n</style>");

rep('if (f && f.open) { st.pop = null; openPop(f.open, f.arg || undefined); } return; }',
    'if (f && f.open) { st.pop = null; openPop(f.open, f.arg || undefined); } else if (f && f.do && A["top_" + f.do]) A["top_" + f.do](); return; }');
rep('if (type === "CurrentSceneCollectionChanged") { st.preset = d.sceneCollectionName;',
    'if (type === "CurrentSceneCollectionChanged") { if (st.preset && st.preset !== d.sceneCollectionName) store.set("mesa.lastPreset", st.preset); st.preset = d.sceneCollectionName;');
rep("const names = st.on && !document.hidden ? shown() : [];", "const names = st.on && !document.hidden && !st.paused ? shown() : [];");

rep('    record: () => run(req("ToggleRecord")),', `    top_state: () => run(req("BroadcastCustomEvent", { eventData: { freemix: { state: { paused: !!st.paused, basic: !!st.basic } } } })),
    top_pausethumbs: () => { st.paused = !st.paused; A.top_state(); toast(st.paused ? "Miniaturas das entradas pausadas" : "Miniaturas das entradas atualizando"); },
    top_basic: () => { st.basic = !st.basic; document.body.classList.toggle("basic", st.basic); A.top_state(); },
    top_fullscreen: () => A.projopen({ v: "PROGRAM_FULL" }),
    top_presetsave: () => run((async () => { const c = await req("GetSceneCollectionList"); st.preset = c.currentSceneCollectionName; toast(\`Preset "\${st.preset}" está gravado: o 3Mix grava cada alteração na hora\`); })()),
    top_presetlast: () => run((async () => {
      const c = await req("GetSceneCollectionList"), last = store.get("mesa.lastPreset", "");
      if (!last || last === c.currentSceneCollectionName || !c.sceneCollections.includes(last)) return toast("Não há um preset anterior para voltar", true);
      if (st.rec || st.stream) return toast("Pare a gravação e a transmissão antes de trocar de preset", true);
      await req("SetCurrentSceneCollection", { sceneCollectionName: last });
    })()),
    saveasgo: () => run((async () => {
      const name = $("sa-name").value.trim(), c = await req("GetSceneCollectionList");
      if (!name) return toast("Dê um nome ao preset", true);
      if (c.sceneCollections.includes(name)) return toast("Já existe um preset com esse nome", true);
      if (st.rec || st.stream) return toast("Pare a gravação e a transmissão antes de salvar com outro nome", true);
      closePop();
      await req("SetPersistentData", { realm: "OBS_WEBSOCKET_DATA_REALM_GLOBAL", slotName: "freemix_cmd", slotValue: { id: Date.now(), cmd: "saveas", from: c.currentSceneCollectionName, name } });
      for (let i = 0; i < 16; i++) { await sleep(500); if ((await req("GetSceneCollectionList")).sceneCollections.includes(name)) { await req("SetCurrentSceneCollection", { sceneCollectionName: name }); return toast(\`Preset salvo como "\${name}"\`); } }
      toast("O ajudante do 3Mix não respondeu. Abra o programa pelo atalho Iniciar Mesa.", true);
    })()),
    record: () => run(req("ToggleRecord")),`);

rep('    else if (st.pop === "gear") p.innerHTML =', `    else if (st.pop === "saveas") p.innerHTML = \`<h3>Salvar como</h3><p>Grava uma cópia da produção em uso com outro nome e passa a trabalhar nela.</p><label>Nome do novo preset<input id="sa-name" maxlength="40" value="\${esc((st.preset || "Produção") + " 2")}"></label><div class="row"><button class="b on" data-a="saveasgo">Salvar</button><button class="b" data-a="close">Cancelar</button></div>\`;
    else if (st.pop === "cfgmenu") p.innerHTML = \`<h3>Configurar</h3><div class="menu"><button data-a="pop" data-v="config">Vídeo da produção (tamanho, taxa de quadros)…</button><button data-a="pop" data-v="recset">Gravação…</button><button data-a="pop" data-v="streamset">Transmissão…</button><button data-a="pop" data-v="ext">Saídas…</button><button data-a="pop" data-v="overlay">Overlays…</button><button data-a="pop" data-v="iso">MultiGravação…</button><button data-a="pop" data-v="gear">Painel…</button></div><div class="row" style="margin-top:8px"><button class="b" data-a="close">Fechar</button></div>\`;
    else if (st.pop === "help") p.innerHTML = \`<h3>Ajuda</h3><table><tr><td><b>Clique na miniatura</b></td><td>manda a entrada para o Preview</td></tr><tr><td><b>GO / Cut</b></td><td>leva ao ar com a transição atual / em corte seco</td></tr><tr><td><b>1 a 8</b></td><td>liga e desliga a entrada como overlay naquele canal</td></tr><tr><td><b>Engrenagens</b></td><td>abrem a configuração do botão ao lado</td></tr><tr><td><b>Clique direito na entrada</b></td><td>propriedades, filtros, renomear, cor, fechar</td></tr><tr><td><b>Alt + letra</b></td><td>abre os menus do motor (clique antes no Preview)</td></tr></table><div class="row" style="margin-top:8px"><button class="b" data-a="close">Fechar</button></div>\`;
    else if (st.pop === "gear") p.innerHTML =`);
rep('($("add-name") || $("rn-name"))?.select();', '($("add-name") || $("rn-name") || $("sa-name"))?.select();');
rep('if (e.key === "Enter" && st.pop === "rename") A.renamego();', 'if (e.key === "Enter" && st.pop === "rename") A.renamego(); if (e.key === "Enter" && st.pop === "saveas") A.saveasgo();');

if (!missing) writeFileSync(file, s);
console.log(`${done} trechos alterados, ${missing} não encontrados${missing ? " (arquivo NÃO gravado)" : ""}`);
