//@@HELPER
  // Return feed of 3Mix Call: the guest sees the program and hears the mix of bus B, which carries everything
  // except the calls themselves (mix-minus). Video leaves through the virtual camera; audio through a virtual audio
  // cable already installed on the machine (an Audio Monitor filter plays bus B into it). A page kept inside the
  // program publishes both to the call service; it needs the program started with --enable-media-stream.
  const RET_SRC = "3Mix Retorno", RET_FILTER = "3Mix Retorno (áudio)", RET_BUS = "3Mix Bus B", RET_PROBE = "3Mix sonda de áudio";
  const retUrl = (id, cable) => `https://vdo.ninja/?push=${id}_ret&webcam&vd=obs&${cable ? "ad=CABLE_Output" : "ad=0"}&autostart&label=Programa&aec=0&denoise=0&autogain=0`;
  st.ret = { on: false, id: "", audio: false, cable: "" };
  async function syncRet() {
    const s = await tryReq("GetInputSettings", { inputName: RET_SRC }), m = /[?&]push=([A-Za-z0-9_]+)_ret/.exec(s?.inputSettings?.url || "");
    const f = await tryReq("GetSourceFilter", { sourceName: RET_BUS, filterName: RET_FILTER });
    st.ret = { on: !!m, id: m ? m[1] : "", audio: !!m && !!f?.filterEnabled, cable: f?.filterSettings?.deviceName || "" };
    if (st.pop === "call") renderPop();
  }
  // Playback side of an installed virtual audio cable, taken from the engine's own list of audio devices.
  const findCable = async () => {
    await tryReq("RemoveInput", { inputName: RET_PROBE });
    if (!(await tryReq("CreateInput", { sceneName: BUS_SCENE, inputName: RET_PROBE, inputKind: "wasapi_output_capture", inputSettings: {}, sceneItemEnabled: false }))) return null;
    const list = (await tryReq("GetInputPropertiesListPropertyItems", { inputName: RET_PROBE, propertyName: "device_id" }))?.propertyItems || [];
    await tryReq("RemoveInput", { inputName: RET_PROBE });
    const hit = list.find((x) => /^CABLE Input/i.test(x.itemName));
    return hit ? { id: hit.itemValue, name: hit.itemName } : null;
  };
  const callInputs = async () => {
    const names = new Set();
    for (const n of new Set([...st.items.values()].flat().filter((i) => i.kind === "browser_source").map((i) => i.name))) if (callIdFromUrl((await tryReq("GetInputSettings", { inputName: n }))?.inputSettings?.url)) names.add(n);
    return names;
  };
//@@ACT
    retornoon: () => (st.locked ? A.lockmsg() : run((async () => {
      const id = st.popArg;
      if (!st.busOn) return toast("O retorno usa o barramento B como mixagem do convidado. Ligue os barramentos primeiro, na seção OUTPUTS do mixer.", true);
      toast("Ligando o retorno…");
      if (!(await req("GetVirtualCamStatus")).outputActive) await req("StartVirtualCam");
      const cable = await findCable();
      if (cable) {
        const set = { device: cable.id, deviceName: cable.name, volume: 100, mute: 0 };
        if (await tryReq("GetSourceFilter", { sourceName: RET_BUS, filterName: RET_FILTER })) { await req("SetSourceFilterSettings", { sourceName: RET_BUS, filterName: RET_FILTER, filterSettings: set }); await req("SetSourceFilterEnabled", { sourceName: RET_BUS, filterName: RET_FILTER, filterEnabled: true }); }
        else await req("CreateSourceFilter", { sourceName: RET_BUS, filterName: RET_FILTER, filterKind: "audio_monitor", filterSettings: set });
        // Mix-minus: everything goes to bus B except the calls, so a guest never hears himself back.
        const calls = await callInputs();
        for (const [name, a] of st.audio) if (!a.bus && !!a.tracks["6"] === calls.has(name)) await tryReq("SetInputAudioTracks", { inputName: name, inputAudioTracks: { "6": !calls.has(name) } });
      }
      const url = retUrl(id, !!cable);
      if (await tryReq("GetInputSettings", { inputName: RET_SRC })) await req("SetInputSettings", { inputName: RET_SRC, inputSettings: { url } });
      else {
        const r = await req("CreateInput", { sceneName: BUS_SCENE, inputName: RET_SRC, inputKind: "browser_source", inputSettings: { url, width: 640, height: 360, reroute_audio: true, shutdown: false, restart_when_active: false }, sceneItemEnabled: true });
        await req("SetSceneItemTransform", { sceneName: BUS_SCENE, sceneItemId: r.sceneItemId, sceneItemTransform: { positionX: -30000, positionY: -30000 } });
        await tryReq("SetInputAudioTracks", { inputName: RET_SRC, inputAudioTracks: onlyTracks() }); await tryReq("SetInputMute", { inputName: RET_SRC, inputMuted: true });
      }
      st.vcam = true; await syncRet(); await syncAudio(); renderBot();
      toast(cable ? "Retorno ligado: vídeo do programa e áudio do barramento B" : "Retorno ligado só com vídeo: não há cabo de áudio virtual nesta máquina", !cable);
    })())),
    retornooff: () => (st.locked ? A.lockmsg() : run((async () => {
      await tryReq("RemoveInput", { inputName: RET_SRC });
      await tryReq("RemoveSourceFilter", { sourceName: RET_BUS, filterName: RET_FILTER });
      await sleep(300); await syncRet(); toast("Retorno desligado. A câmera virtual continua como estava (botão Externo).");
    })())),
//@@POP
        + (() => { const R = st.ret, mine = R.on && R.id === st.popArg;
          return `<fieldset><legend>Retorno para o convidado</legend><div class="row" style="margin:0 0 6px"><button class="b${mine ? " on" : ""}" data-a="${mine ? "retornooff" : "retornoon"}">${mine ? "Retorno LIGADO" : "Ligar retorno"}</button>${R.on && !mine ? `<span class="bdg">em uso pela chamada ${esc(R.id)}</span>` : ""}</div>`
            + `<p>Vídeo: saída do programa, pela câmera virtual (${st.vcam ? "ligada" : "desligada"}).<br>Áudio: ${mine ? (R.audio ? `barramento B em ${esc(R.cable)}` : "sem áudio, porque não há cabo de áudio virtual instalado nesta máquina") : "barramento B, por um cabo de áudio virtual que já esteja instalado na máquina; sem cabo, o retorno vai só com vídeo"}.<br>Ao ligar, todas as entradas passam a ir para o barramento B, menos as chamadas: o convidado ouve o programa sem ouvir a própria voz.</p></fieldset>`; })()
