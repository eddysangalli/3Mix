//@@HELPER
  // Audio buses. The engine only has six mix tracks, so each bus is a "Mix Track" source (plugin Mix Track to Source):
  // inputs are sent to a sum track (4, 5, 6), the bus source picks that sum up and delivers it, through its own fader,
  // mute, meter and filters, to the output track (1 = Master, what recording and streaming take; 2 = A; 3 = B).
  const BUSK = "mix-track-to-source", BUS_SCENE = "3Mix Barramentos", BUS_KEYER = "3Mix Audio", TRK = ["1", "2", "3", "4", "5", "6"];
  const BUSES = [{ id: "M", name: "3Mix Master", label: "Master", mix: 3, sum: "4", out: "1" }, { id: "A", name: "3Mix Bus A", label: "A", mix: 4, sum: "5", out: "2" }, { id: "B", name: "3Mix Bus B", label: "B", mix: 5, sum: "6", out: "3" }];
  const onlyTracks = (...on) => Object.fromEntries(TRK.map((k) => [k, on.includes(k)]));
  // [engine track, letter, description] of the M / A / B buttons of an input: the bus sums, or the tracks themselves while the buses are off.
  const busKeys = () => BUSES.map((b) => [st.busOn ? b.sum : b.out, b.id, b.id === "M" ? "Master" : "barramento " + b.id]);
  // The bus sources live in a scene of their own, kept on air by a keyer, so they stay active whatever is on Program.
  const busOnAir = async () => {
    const on = async () => (await vendor("dsk_get_scene", { dsk_name: BUS_KEYER }).catch(() => null))?.scene === BUS_SCENE;
    if (await on()) return true;
    const names = ((await vendor("get_downstream_keyers")).downstream_keyers || []).map((k) => k.name);
    if (!names.includes(BUS_KEYER)) { await vendor("add_downstream_keyer", { dsk_name: BUS_KEYER }); await sleep(1000); }
    await vendor("dsk_add_scene", { dsk_name: BUS_KEYER, scene: BUS_SCENE }).catch(() => {}); await vendor("dsk_select_scene", { dsk_name: BUS_KEYER, scene: BUS_SCENE }).catch(() => {});
    return on();
  };
  async function busCheck() {
    try { st.busFault = !st.busOn || (await busOnAir()) ? "" : "Barramentos fora do ar: o áudio não está chegando à gravação nem à transmissão."; } catch { st.busFault = ""; }
    renderMixer();
  }
//@@SYNC
  async function syncAudio() {
    const { inputs } = await req("GetInputList");
    const next = new Map();
    st.busOn = BUSES.every((b) => inputs.some((i) => i.inputName === b.name && i.unversionedInputKind === BUSK));
    for (const i of inputs) {
      const v = await tryReq("GetInputVolume", { inputName: i.inputName }); if (!v) continue;
      const m = await tryReq("GetInputMute", { inputName: i.inputName });
      const tr = await tryReq("GetInputAudioTracks", { inputName: i.inputName }), mo = await tryReq("GetInputAudioMonitorType", { inputName: i.inputName });
      const bus = (st.busOn && BUSES.find((b) => b.name === i.inputName)?.id) || "";
      let tracks = tr?.inputAudioTracks || {};
      // With the buses on, an input reaches the outputs only through a bus: nothing goes straight to tracks 1-3.
      // An input the engine has just created comes with every track on; like in the reference, it starts on Master only.
      if (st.busOn && !bus && (tracks["1"] || tracks["2"] || tracks["3"])) {
        const fresh = TRK.every((k) => tracks[k]);
        tracks = { "1": false, "2": false, "3": false, "4": fresh || !!tracks["1"], "5": !fresh && !!tracks["2"], "6": !fresh && !!tracks["3"] };
        await tryReq("SetInputAudioTracks", { inputName: i.inputName, inputAudioTracks: tracks });
      }
      next.set(i.inputName, { mul: v.inputVolumeMul, db: v.inputVolumeDb, muted: !!m?.inputMuted, tracks, bus, mon: mo?.monitorType || "OBS_MONITORING_TYPE_NONE", bal: (await tryReq("GetInputAudioBalance", { inputName: i.inputName }))?.inputAudioBalance ?? 0.5 });
    }
    st.audio = next; renderMixer();
  }
//@@RENDER
    const ARR = `<svg viewBox="0 0 24 24"><path style="fill:#3fd145" d="M3 6h12V3l6 5-6 5v-3H3z"/><path style="fill:#f7931e" d="M21 15H9v-3l-6 5 6 5v-3h12z"/></svg>`;
    const TK = busKeys();
    const list = [...st.audio].filter(([, a]) => !a.bus).map(([name, a]) => ({ name, a, n: inputNumber(name) })).sort((x, y) => (x.n || 999) - (y.n || 999));
    const out = (b) => { const a = st.audio.get(b.name), v = esc(b.name); if (!a) return "";
      return `<div class="strip out live${a.muted ? " off" : ""}" data-n="${v}"><div class="hd" title="${b.id === "M" ? "Master: a mixagem que vai para a gravação e a transmissão" : "Barramento " + b.id + ": mixagem separada, na trilha " + b.out + " do motor"}"><span>${b.label}</span></div><div class="pan"></div>`
        + `<div class="bd"><div class="col"><button data-a="audioset" data-v="${v}" title="Configurar o áudio ${b.id === "M" ? "do Master" : "deste barramento"}: ganho, EQ, compressor, limitador">${GEAR}</button>${b.id === "M" ? "" : `<button class="${a.mon !== "OBS_MONITORING_TYPE_NONE" ? "on" : ""}" data-a="solo" data-v="${v}" title="Solo: ouvir este barramento no fone">S</button>`}<button class="${a.muted ? "muted" : "on"}" data-a="mute" data-v="${v}" title="Liga ou desliga o áudio ${b.id === "M" ? "do Master" : "deste barramento"}">${SPK}</button></div>`
        + `<div class="fd" data-f="${v}"><i></i></div><div class="mt"></div><div class="mt"></div></div><div class="bt">${b.id === "M" ? "" : `<button class="${a.tracks["4"] ? "on" : ""}" data-a="bus" data-k="4" data-v="${v}" title="Enviar a mixagem deste barramento para o Master">M</button>`}</div></div>`; };
    const outs = st.busOn ? BUSES.map(out).join("") + (st.busFault ? `<div class="none warn">${st.busFault}</div>` : "")
      : `<div class="busoff"><b>Master e barramentos desligados</b><span>Neste preset as entradas vão direto para as trilhas do motor: não há fader, medidor nem efeitos de saída.</span>`
        + (st.kinds.includes(BUSK) ? `<button class="b" data-a="busmake" title="Cria o Master e os barramentos A e B neste preset. O áudio passa a sair pelo Master, com 21 ms de atraso. Faça fora do ar.">Ligar barramentos</button>` : `<button class="b na" title="O componente de barramentos não está instalado neste motor">Ligar barramentos</button>`) + `</div>`;
    const inp = ({ name, a, n }) => { const v = esc(name);
      return `<div class="strip" data-n="${v}"><div class="hd" title="${v}">${n ? `<b>${n}</b>` : ""}<span>${v}</span></div><div class="pan"><input type="range" min="0" max="1" step="0.05" value="${a.bal}" data-pan="${v}" title="Balanço esquerda / direita"></div>`
        + `<div class="bd"><div class="col"><button data-a="audioset" data-v="${v}" title="Configurar o áudio: ganho, atraso, EQ, compressor, noise gate">${GEAR}</button><button class="${a.mon !== "OBS_MONITORING_TYPE_NONE" ? "on" : ""}" data-a="solo" data-v="${v}" title="Solo: ouvir esta entrada no fone, sem mexer na mixagem">S</button>`
        + `<button class="fw${n ? " lit" : ""}" data-a="follow" data-v="${v}" title="${n ? "Mistura automática ligada: o áudio entra e sai junto com o vídeo (fixo neste motor)" : "Fonte global do motor: áudio sempre ligado, não acompanha o vídeo"}">${ARR}</button><button class="${a.muted ? "muted" : "on"}" data-a="mute" data-v="${v}" title="Liga ou desliga o áudio desta entrada, em todos os barramentos">${SPK}</button></div>`
        + `<div class="fd" data-f="${v}"><i></i></div><div class="mt"></div><div class="mt"></div></div><div class="bt">${TK.map(([k, l, t]) => `<button class="${a.tracks[k] ? "on" : ""}" data-a="bus" data-k="${k}" data-v="${v}" title="Enviar o áudio desta entrada para ${t}">${l}</button>`).join("")}</div></div>`; };
    box.innerHTML = `<div class="sec">OUTPUTS</div>${outs}<div class="sec">INPUTS</div>` + (list.map(inp).join("") || `<div class="none">Nenhuma fonte de áudio.<br>Adicione microfone e áudio do sistema em Configurações › Áudio, ou crie uma entrada de mídia.</div>`);
//@@ACT
    busmake: () => (st.locked ? A.lockmsg() : run((async () => {
      if (!st.kinds.includes(BUSK)) return toast("O componente de barramentos não está instalado neste motor", true);
      toast("Ligando os barramentos…");
      if (!(await tryReq("GetSceneItemList", { sceneName: BUS_SCENE }))) await req("CreateScene", { sceneName: BUS_SCENE });
      await busOnAir();
      for (const b of BUSES) {
        if (await tryReq("GetInputSettings", { inputName: b.name })) continue;
        // Created switched off, so it only starts mixing once its output track is the right one.
        const r = await req("CreateInput", { sceneName: BUS_SCENE, inputName: b.name, inputKind: BUSK, inputSettings: { MixTrack: b.mix }, sceneItemEnabled: false });
        await req("SetInputAudioTracks", { inputName: b.name, inputAudioTracks: onlyTracks(b.out) });
        await req("SetSceneItemEnabled", { sceneName: BUS_SCENE, sceneItemId: r.sceneItemId, sceneItemEnabled: true });
      }
      await syncAudio(); await busCheck();
      toast(st.busFault || "Barramentos Master, A e B ligados", !!st.busFault);
    })())),
    busdrop: () => (st.locked ? A.lockmsg() : run((async () => {
      closePop();
      const names = ((await vendor("get_downstream_keyers")).downstream_keyers || []).map((k) => k.name);
      if (names.includes(BUS_KEYER)) await vendor("remove_downstream_keyer", { dsk_name: BUS_KEYER });
      for (const [name, a] of st.audio) if (!a.bus) await tryReq("SetInputAudioTracks", { inputName: name, inputAudioTracks: { "1": !!a.tracks["4"], "2": !!a.tracks["5"], "3": !!a.tracks["6"], "4": false, "5": false, "6": false } });
      for (const b of BUSES) await tryReq("RemoveInput", { inputName: b.name });
      await tryReq("RemoveScene", { sceneName: BUS_SCENE });
      await sleep(300); await syncAudio(); await busCheck();
      toast("Barramentos desligados: as entradas voltaram direto para as trilhas do motor");
    })())),
//@@POP
    else if (st.pop === "mainmenu") p.innerHTML = `<h3>Menu</h3><div class="menu"><button data-a="pop" data-v="busman">Gerenciador de barramentos de áudio…</button></div><div class="row"><button class="b" data-a="close">Fechar</button></div>`;
    else if (st.pop === "busman") { const TK = busKeys(), rows = [...st.audio].filter(([, a]) => !a.bus).map(([name, a]) => ({ name, a, n: inputNumber(name) })).sort((x, y) => (x.n || 999) - (y.n || 999));
      p.innerHTML = `<h3>Gerenciador de barramentos de áudio</h3><div class="busman"><div class="bmr"><span></span><span></span>${TK.map(([, l]) => `<b>${l}</b>`).join("")}</div>`
        + (rows.map(({ name, a, n }) => `<div class="bmr" data-n="${esc(name)}"><span title="${esc(name)}">${n ? n + " " : ""}${esc(name)}</span><button data-a="audioset" data-v="${esc(name)}" title="Configurar o áudio desta entrada">${GEAR}</button>${TK.map(([k, l, t]) => `<button class="sq${a.tracks[k] ? " on" : ""}" data-a="bus" data-k="${k}" data-v="${esc(name)}" title="${l}: enviar para ${t}"></button>`).join("")}</div>`).join("") || "<p>Nenhuma entrada com áudio.</p>")
        + `</div><p>${st.busOn ? "Clique nos quadrados para ligar ou desligar o envio de cada entrada a cada barramento." : "Barramentos desligados neste preset: M, A e B escolhem direto as trilhas 1, 2 e 3 do motor."}</p><div class="row end"><button class="b" data-a="close">Fechar</button></div>`; }
//@@FOOT
aplicados a esta entrada.</p></div></div><div class="row end">${st.audio.get(st.popArg)?.bus ? `<button class="b" data-a="busdrop" title="Remove o Master e os barramentos A e B deste preset; as entradas voltam a ir direto para as trilhas do motor. Os efeitos dos barramentos se perdem.">Desligar barramentos</button>` : ""}
//@@LIM
        : tab === "gate" ? (has("gate") ? chk("gate", "Usar o noise gate") + sl("Fecha abaixo de", "gate", "close_threshold", -96, 0, 1, fs("gate").close_threshold ?? -32, " dB") + sl("Abre acima de", "gate", "open_threshold", -96, 0, 1, fs("gate").open_threshold ?? -26, " dB") : none("O noise gate"))
        : (has("lim") ? chk("lim", "Usar o limitador") + sl("Limiar", "lim", "threshold", -60, 0, 0.5, fs("lim").threshold ?? -6, " dB") + sl("Liberação", "lim", "release_time", 1, 1000, 1, fs("lim").release_time ?? 60, " ms") : none("O limitador"));
