//@@ACT
    audioset: (d) => openPop("audioset", d.v),
    solo: (d) => run(req("SetInputAudioMonitorType", { inputName: d.v, monitorType: st.audio.get(d.v).mon !== "OBS_MONITORING_TYPE_NONE" ? "OBS_MONITORING_TYPE_NONE" : "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT" })),
    bus: (d) => run(req("SetInputAudioTracks", { inputName: d.v, inputAudioTracks: { [d.k]: !st.audio.get(d.v).tracks[d.k] } })),
    asettab: (d) => { st.asetTab = d.v; renderPop(); },
    asetload: () => run((async () => {
      const name = st.popArg, [fl, off, bal, kinds] = await Promise.all([req("GetSourceFilterList", { sourceName: name }), tryReq("GetInputAudioSyncOffset", { inputName: name }), tryReq("GetInputAudioBalance", { inputName: name }), tryReq("GetSourceFilterKindList")]);
      const f = (key) => fl.filters.find((x) => x.filterName === FX[key].n) || null;
      st.aset = { name, kinds: kinds?.sourceFilterKinds || [], delay: off?.inputAudioSyncOffset ?? 0, bal: bal?.inputAudioBalance ?? 0.5, gain: f("gain"), eq: f("eq"), comp: f("comp"), gate: f("gate") };
      if (st.pop === "audioset") renderPop();
    })()),
    // One change at a time: the first move of a slider creates the engine filter, the next ones only update it.
    asetq: (fn) => { st.asetQ = (st.asetQ || Promise.resolve()).then(fn).catch((e) => toast(e.message, true)); },
    asetfx: (key, k, v) => A.asetq(async () => {
      const s = st.aset, fx = FX[key];
      if (!s[key]) { await req("CreateSourceFilter", { sourceName: s.name, filterName: fx.n, filterKind: fx.k, filterSettings: { [k]: v } }); s[key] = { filterEnabled: true, filterSettings: { [k]: v } }; const c = document.querySelector(`[data-fxon="${key}"]`); if (c) c.checked = true; }
      else { await req("SetSourceFilterSettings", { sourceName: s.name, filterName: fx.n, filterSettings: { [k]: v } }); s[key].filterSettings[k] = v; }
    }),
    asetenable: (key, on) => A.asetq(async () => {
      const s = st.aset, fx = FX[key];
      if (!s[key]) { await req("CreateSourceFilter", { sourceName: s.name, filterName: fx.n, filterKind: fx.k, filterSettings: {} }); s[key] = { filterEnabled: true, filterSettings: {} }; }
      await req("SetSourceFilterEnabled", { sourceName: s.name, filterName: fx.n, filterEnabled: on }); s[key].filterEnabled = on;
    }),
//@@POP
    else if (st.pop === "audioset") { const s = st.aset, tab = st.asetTab || "geral";
      const sl = (label, fx, k, min, max, step, val, unit) => `<label>${label}: <b id="v-${fx}-${k}">${val}${unit}</b><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-fx="${fx}" data-k="${k}" data-u="${unit}"></label>`;
      const has = (k) => s.kinds.includes(FX[k].k), fs = (k) => s[k]?.filterSettings || {}, chk = (k, label) => `<label class="chk"><input type="checkbox" data-fxon="${k}"${s[k] && s[k].filterEnabled ? " checked" : ""}> ${label}</label>`;
      const none = (what) => `<p>${what} não está disponível neste motor.</p>`;
      const body = !s ? "<p>Lendo…</p>"
        : tab === "geral" ? sl("Gain", "gain", "db", -30, 30, 0.5, fs("gain").db ?? 0, " dB") + sl("Atraso", "p", "delay", 0, 2000, 10, s.delay, " ms") + sl("Balanço (0 esquerda, 1 direita)", "p", "bal", 0, 1, 0.05, s.bal, "")
        : tab === "eq" ? (has("eq") ? chk("eq", "Usar o EQ") + sl("Graves", "eq", "low", -20, 20, 0.5, fs("eq").low ?? 0, " dB") + sl("Médios", "eq", "mid", -20, 20, 0.5, fs("eq").mid ?? 0, " dB") + sl("Agudos", "eq", "high", -20, 20, 0.5, fs("eq").high ?? 0, " dB") : none("O EQ"))
        : tab === "comp" ? (has("comp") ? chk("comp", "Usar o compressor") + sl("Razão", "comp", "ratio", 1, 32, 0.5, fs("comp").ratio ?? 10, ":1") + sl("Limiar", "comp", "threshold", -60, 0, 0.5, fs("comp").threshold ?? -18, " dB") + sl("Ataque", "comp", "attack_time", 1, 500, 1, fs("comp").attack_time ?? 6, " ms") + sl("Liberação", "comp", "release_time", 1, 1000, 1, fs("comp").release_time ?? 60, " ms") + sl("Ganho de saída", "comp", "output_gain", -32, 32, 0.5, fs("comp").output_gain ?? 0, " dB") : none("O compressor"))
        : (has("gate") ? chk("gate", "Usar o noise gate") + sl("Fecha abaixo de", "gate", "close_threshold", -96, 0, 1, fs("gate").close_threshold ?? -32, " dB") + sl("Abre acima de", "gate", "open_threshold", -96, 0, 1, fs("gate").open_threshold ?? -26, " dB") : none("O noise gate"));
      p.innerHTML = `<h3>Configurações de áudio · ${esc(st.popArg)}</h3><div class="add"><div class="types">${[["geral", "Geral"], ["eq", "EQ"], ["comp", "Compressor"], ["gate", "Noise Gate"]].map(([id, l]) => `<button class="${tab === id ? "on" : ""}" data-a="asettab" data-v="${id}">${l}</button>`).join("")}</div><div class="form">${body}<p>As mudanças valem na hora. Os efeitos são filtros de áudio do motor aplicados a esta entrada.</p></div></div><div class="row end"><button class="b" data-a="close">Fechar</button></div>`; }
//@@LISTEN
  const FX = { gain: { n: "3Mix Ganho", k: "gain_filter" }, eq: { n: "3Mix EQ", k: "basic_eq_filter" }, comp: { n: "3Mix Compressor", k: "compressor_filter" }, gate: { n: "3Mix Noise Gate", k: "noise_gate_filter" } };
  document.addEventListener("input", (e) => {
    const t = e.target, d = t.dataset; if (!d || !d.fx || !st.aset) return;
    const v = +t.value, lab = $(`v-${d.fx}-${d.k}`); if (lab) lab.textContent = v + (d.u || "");
    if (d.fx === "p") run(d.k === "delay" ? req("SetInputAudioSyncOffset", { inputName: st.aset.name, inputAudioSyncOffset: v }) : req("SetInputAudioBalance", { inputName: st.aset.name, inputAudioBalance: v }));
    else A.asetfx(d.fx, d.k, v);
  });
  document.addEventListener("change", (e) => { const d = e.target.dataset; if (d && d.fxon && st.aset) A.asetenable(d.fxon, e.target.checked); });
