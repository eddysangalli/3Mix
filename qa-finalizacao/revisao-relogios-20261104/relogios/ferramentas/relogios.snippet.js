//@@HELPER
  // Production clocks: shown in the top bar, set up here (the top bar is too thin for a window). The choice is kept
  // in the engine's persistent data, slot "freemix_clocks", and told to the top bar with a custom event.
  const CLOCK_TYPES = [["clock", "Relógio"], ["event", "Evento (contagem)"], ["message", "Mensagem da produção"], ["rec", "Tempo de gravação"], ["stream", "Tempo de transmissão"], ["remaining", "Tempo restante da mídia no Output"], ["none", "Nada"]];
  const CLOCK_DEFAULT = [{ type: "rec" }, { type: "stream" }, { type: "clock" }];
  st.clocks = null;
  const clocksRead = () => [0, 1, 2].map((i) => { const old = (st.clocks || CLOCK_DEFAULT)[i] || {}, v = (id) => $(id + i);
    return { type: v("ck-t").value, offset: v("ck-o") ? +v("ck-o").value || 0 : old.offset || 0, ampm: v("ck-a") ? v("ck-a").checked : !!old.ampm, start: v("ck-s") ? v("ck-s").value : old.start || "", end: v("ck-e") ? v("ck-e").value : old.end || "", message: (v("ck-m") ? v("ck-m").value : old.message || "").trim().slice(0, 40) }; });
  document.addEventListener("change", (e) => { if (e.target.dataset?.ck && st.pop === "clocks") { st.clocks = clocksRead(); renderPop(); } });
  document.addEventListener("input", (e) => { if (e.target.dataset?.ckMessage && st.pop === "clocks") st.clocks = clocksRead(); });
//@@ACT
    clocksload: () => run((async () => { const r = await tryReq("GetPersistentData", { realm: "OBS_WEBSOCKET_DATA_REALM_GLOBAL", slotName: "freemix_clocks" }); st.clocks = Array.isArray(r?.slotValue) ? r.slotValue : CLOCK_DEFAULT.map((c) => ({ ...c })); if (st.pop === "clocks") renderPop(); })()),
    clockssave: () => run((async () => {
      st.clocks = clocksRead();
      await req("SetPersistentData", { realm: "OBS_WEBSOCKET_DATA_REALM_GLOBAL", slotName: "freemix_clocks", slotValue: st.clocks });
      await req("BroadcastCustomEvent", { eventData: { freemix: { clocks: st.clocks } } });
      closePop(); toast("Relógios de produção atualizados");
    })()),
//@@POP
    else if (st.pop === "clocks") { const C = st.clocks;
      p.innerHTML = `<h3>Relógios de produção</h3>` + (!C ? "<p>Lendo…</p>" : [0, 1, 2].map((i) => { const c = C[i] || { type: "none" };
        return `<fieldset><legend>Relógio ${i + 1}</legend><label>Mostrar<select id="ck-t${i}" data-ck="1">${CLOCK_TYPES.map(([v, l]) => `<option value="${v}"${c.type === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`
          + (c.type === "clock" ? `<label>Diferença de horas (outro fuso)<input id="ck-o${i}" type="number" min="-12" max="14" value="${+c.offset || 0}"></label><label class="chk"><input type="checkbox" id="ck-a${i}"${c.ampm ? " checked" : ""}> 12 horas (AM/PM)</label>` : "")
          + (c.type === "message" ? `<label>Mensagem curta para o operador<input id="ck-m${i}" data-ck-message="1" type="text" maxlength="40" value="${esc(c.message || "")}" placeholder="Ex.: FALTAM 2 MINUTOS"></label>` : "")
          + (c.type === "event" ? `<label>Início<input id="ck-s${i}" type="time" value="${esc(c.start || "")}"></label><label>Fim (opcional)<input id="ck-e${i}" type="time" value="${esc(c.end || "")}"></label>` : "") + `</fieldset>`; }).join(""))
        + `<p>Evento: antes do início conta em amarelo; durante, em verde; depois do fim, em vermelho.</p><div class="row end"><button class="b on" data-a="clockssave">OK</button><button class="b" data-a="close">Cancelar</button></div>`; }
