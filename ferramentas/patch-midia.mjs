// 3Mix Pro: Patch da Barra de Mídia (VideoControls embaixo de Preview e Output)
// Metade esquerda para o Preview, metade direita para o Output.
// Controles: Reiniciar, Tocar/Pausar, Anterior/Próximo (playlist), tempo decorrido, slider arrastável, tempo restante.
import { readFileSync, writeFileSync } from "node:fs";

const file = "D:/DRIVE/IA/antigravity/vmixtwste/obs-vmix/painel/mesa.html";
let s = readFileSync(file, "utf8"), done = 0, missing = 0;

const rep = (a, b) => {
  if (!s.includes(a)) {
    missing++;
    console.log("trecho não encontrado: " + a.slice(0, 70));
    return;
  }
  s = s.replace(a, () => b);
  done++;
};

// 1. Grid rows do body (acrescenta 28px no topo para a barra de mídia)
rep(
  "    display: grid; grid-template-rows: 24px minmax(0, 1fr) 34px 22px; overflow: hidden;",
  "    display: grid; grid-template-rows: 28px 24px minmax(0, 1fr) 34px 22px; overflow: hidden;"
);

// 2. CSS da barra de mídia
rep(
  "  /* category tabs & brand */",
  `  /* media controls row under preview/output */
  .media-row { display: grid; grid-template-columns: 1fr 1fr; background: #13171e; border-bottom: 1px solid #232c3a; height: 28px; }
  .media-bar { display: flex; align-items: center; gap: 6px; padding: 0 8px; font-size: 11px; color: var(--tx); overflow: hidden; }
  .media-bar.pv { border-right: 1px solid #232c3a; border-left: 2px solid var(--org); }
  .media-bar.pgm { border-left: 2px solid var(--red); }
  .media-bar .badge { font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 2px; }
  .media-bar.pv .badge { background: #b86200; color: #fff; }
  .media-bar.pgm .badge { background: #b71c1c; color: #fff; }
  .media-bar .nm { font-weight: 700; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #c4d1e0; }
  .media-bar .ctrls { display: flex; align-items: center; gap: 3px; }
  .media-bar .mb-btn { width: 22px; height: 20px; background: var(--btn); border: 1px solid var(--bd); border-radius: 2px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; cursor: pointer; color: var(--tx); }
  .media-bar .mb-btn:hover { background: var(--btn-h); color: #fff; }
  .media-bar .mb-btn:disabled { opacity: 0.3; cursor: default; }
  .media-bar .time { font-family: Consolas, monospace; font-size: 10px; color: var(--mut); white-space: nowrap; }
  .media-bar .time.rem { color: #f59e0b; }
  .media-bar .slider-wrap { flex: 1; display: flex; align-items: center; min-width: 40px; }
  .media-bar .media-slider { width: 100%; height: 4px; accent-color: var(--org); cursor: pointer; }
  .media-bar.pgm .media-slider { accent-color: var(--red); }
  .media-bar.disabled { opacity: 0.45; pointer-events: none; }

  /* category tabs & brand */`
);

// 3. HTML da barra de mídia
rep(
  '<body>\n  <div class="tabs" id="tabs"></div>',
  `<body>
  <div class="media-row" id="media-row">
    <div class="media-bar pv" id="mb-pv">
      <span class="badge">PRV</span>
      <span class="nm" id="mb-pv-name">-</span>
      <div class="ctrls">
        <button class="mb-btn" data-a="mb_restart" data-side="pv" title="Reiniciar do Início">⏮</button>
        <button class="mb-btn" data-a="mb_play" data-side="pv" id="mb-pv-play" title="Tocar / Pausar">▶</button>
        <button class="mb-btn" data-a="mb_prev" data-side="pv" id="mb-pv-prev" style="display:none" title="Anterior">◀◀</button>
        <button class="mb-btn" data-a="mb_next" data-side="pv" id="mb-pv-next" style="display:none" title="Próximo">▶▶</button>
      </div>
      <span class="time" id="mb-pv-cur">00:00:00</span>
      <div class="slider-wrap"><input type="range" class="media-slider" id="mb-pv-slider" min="0" max="1000" value="0"></div>
      <span class="time rem" id="mb-pv-rem">-00:00:00</span>
    </div>
    <div class="media-bar pgm" id="mb-pgm">
      <span class="badge">OUT</span>
      <span class="nm" id="mb-pgm-name">-</span>
      <div class="ctrls">
        <button class="mb-btn" data-a="mb_restart" data-side="pgm" title="Reiniciar do Início">⏮</button>
        <button class="mb-btn" data-a="mb_play" data-side="pgm" id="mb-pgm-play" title="Tocar / Pausar">▶</button>
        <button class="mb-btn" data-a="mb_prev" data-side="pgm" id="mb-pgm-prev" style="display:none" title="Anterior">◀◀</button>
        <button class="mb-btn" data-a="mb_next" data-side="pgm" id="mb-pgm-next" style="display:none" title="Próximo">▶▶</button>
      </div>
      <span class="time" id="mb-pgm-cur">00:00:00</span>
      <div class="slider-wrap"><input type="range" class="media-slider" id="mb-pgm-slider" min="0" max="1000" value="0"></div>
      <span class="time rem" id="mb-pgm-rem">-00:00:00</span>
    </div>
  </div>
  <div class="tabs" id="tabs"></div>`
);

// 4. Lógica de controle e sincronização de mídia
rep(
  "  renderAll(); connect(); thumbLoop(); slowLoop();",
  `  /* ---- Barra de Mídia (VideoControls sob Preview e Output) ---- */
  const fmtMs = (ms) => {
    if (ms == null || isNaN(ms) || ms < 0) return "00:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return (h > 0 ? String(h).padStart(2, "0") + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  };

  const mediaSourceOf = (sceneName) => {
    if (!sceneName) return null;
    const list = st.items?.get(sceneName) || [];
    return list.find((i) => isMedia(i.kind)) || null;
  };

  const mbState = {
    pv: { dragging: false, dur: 0, cur: 0, state: "", name: "" },
    pgm: { dragging: false, dur: 0, cur: 0, state: "", name: "" }
  };

  async function syncMediaBar(side, sceneName) {
    const bar = $("mb-" + side);
    if (!bar) return;
    const media = mediaSourceOf(sceneName);
    const s = mbState[side];

    if (!media) {
      bar.classList.add("disabled");
      $("mb-" + side + "-name").textContent = sceneName || "Sem entrada";
      $("mb-" + side + "-cur").textContent = "00:00:00";
      $("mb-" + side + "-rem").textContent = "-00:00:00";
      $("mb-" + side + "-slider").value = 0;
      $("mb-" + side + "-play").textContent = "▶";
      s.name = ""; s.dur = 0; s.cur = 0;
      return;
    }

    bar.classList.remove("disabled");
    $("mb-" + side + "-name").textContent = media.name;
    s.name = media.name;

    const isPl = isPlaylist(media.kind);
    $("mb-" + side + "-prev").style.display = isPl ? "inline-flex" : "none";
    $("mb-" + side + "-next").style.display = isPl ? "inline-flex" : "none";

    const stMedia = await tryReq("GetMediaInputStatus", { inputName: media.name });
    if (!stMedia) return;

    s.dur = stMedia.mediaDuration || 0;
    s.state = stMedia.mediaState || "";
    const isPlaying = s.state === "OBS_MEDIA_STATE_PLAYING";
    $("mb-" + side + "-play").textContent = isPlaying ? "⏸" : "▶";

    if (!s.dragging) {
      s.cur = stMedia.mediaCursor || 0;
      $("mb-" + side + "-cur").textContent = fmtMs(s.cur);
      const rem = Math.max(0, s.dur - s.cur);
      $("mb-" + side + "-rem").textContent = "-" + fmtMs(rem);
      $("mb-" + side + "-slider").value = s.dur > 0 ? (s.cur / s.dur) * 1000 : 0;
    }
  }

  // Interatividade dos Sliders
  ["pv", "pgm"].forEach((side) => {
    const sl = $("mb-" + side + "-slider");
    if (!sl) return;
    sl.addEventListener("mousedown", () => { mbState[side].dragging = true; });
    sl.addEventListener("touchstart", () => { mbState[side].dragging = true; });
    sl.addEventListener("input", () => {
      const s = mbState[side];
      if (s.dur > 0) {
        const curMs = (sl.value / 1000) * s.dur;
        $("mb-" + side + "-cur").textContent = fmtMs(curMs);
        $("mb-" + side + "-rem").textContent = "-" + fmtMs(Math.max(0, s.dur - curMs));
      }
    });
    const applySeek = () => {
      const s = mbState[side];
      if (s.name && s.dur > 0) {
        const curMs = Math.round((sl.value / 1000) * s.dur);
        run(req("SetMediaInputCursor", { inputName: s.name, mediaCursor: curMs }));
      }
      setTimeout(() => { mbState[side].dragging = false; }, 200);
    };
    sl.addEventListener("change", applySeek);
    sl.addEventListener("mouseup", applySeek);
    sl.addEventListener("touchend", applySeek);
  });

  // Ações de mídia nos botões
  A.mb_restart = (d) => {
    const s = mbState[d.side];
    if (s.name) run(req("TriggerMediaInputAction", { inputName: s.name, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART" }));
  };
  A.mb_play = (d) => {
    const s = mbState[d.side];
    if (!s.name) return;
    const act = s.state === "OBS_MEDIA_STATE_PLAYING" ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE" : "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY";
    run(req("TriggerMediaInputAction", { inputName: s.name, mediaAction: act }));
  };
  A.mb_prev = (d) => {
    const s = mbState[d.side];
    if (s.name) run(req("TriggerMediaInputAction", { inputName: s.name, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS" }));
  };
  A.mb_next = (d) => {
    const s = mbState[d.side];
    if (s.name) run(req("TriggerMediaInputAction", { inputName: s.name, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT" }));
  };

  async function mediaLoop() {
    while (true) {
      if (st.on) {
        await syncMediaBar("pv", st.preview).catch(() => {});
        await syncMediaBar("pgm", st.program).catch(() => {});
      }
      await sleep(250);
    }
  }

  renderAll(); connect(); thumbLoop(); slowLoop(); mediaLoop();`
);

if (!missing) {
  writeFileSync(file, s);
  console.log(`${done} trechos alterados com sucesso em ${file}`);
} else {
  console.log(`${done} trechos alterados, ${missing} não encontrados (arquivo NÃO gravado)`);
}
