/* 3Mix Replay dock — view only.
   Commands, recording and players remain owned by /api/replay and mesa.html.
   This file renders the compact operational dock and patches live values; it
   never keeps a second copy of the replay state. */
(() => {
  "use strict";

  const PLAYERS = ["A", "B"];
  const SPEEDS = [25, 50, 75, 100];

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function clock(seconds, decimals = 2) {
    const value = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const rest = value % 60;
    const secs = rest.toFixed(decimals).padStart(decimals ? 5 : 2, "0");
    if (hours) return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + secs;
    return String(minutes).padStart(2, "0") + ":" + secs;
  }

  const durationText = (seconds) => {
    const value = Math.max(0, Number(seconds) || 0);
    return value >= 60 ? clock(value, 1) : value.toFixed(2).replace(".", ",") + " s";
  };

  const icon = (name) => {
    const paths = {
      expand: "M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z",
      play: "M8 5v14l11-7z",
      pause: "M6 5h4v14H6zm8 0h4v14h-4z",
      stop: "M6 6h12v12H6z",
      prev: "M6 5h2v14H6zm12 0v14l-9-7z",
      next: "M16 5h2v14h-2zM6 5v14l9-7z",
      trash: "M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 11H7L6 9zm3 2v7h2v-7H9zm4 0v7h2v-7h-2z",
      up: "M12 5l7 7h-4v7h-6v-7H5z",
      down: "M12 19l-7-7h4V5h6v7h4z",
      camera: "M4 7h10v10H4zM15 10l5-3v10l-5-3z",
      settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2.1-.7a7 7 0 0 0-.7-1.7l1-2-1.5-1.5-2 1a7 7 0 0 0-1.7-.7L13 4h-2l-.7 2.1a7 7 0 0 0-1.7.7l-2-1L5.1 7.3l1 2a7 7 0 0 0-.7 1.7L3.3 12l.1 2 2.1.7a7 7 0 0 0 .7 1.7l-1 2 1.5 1.5 2-1a7 7 0 0 0 1.7.7L11 20h2l.7-2.1a7 7 0 0 0 1.7-.7l2 1 1.5-1.5-1-2a7 7 0 0 0 .7-1.7L21 12z"
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name] || paths.play}"/></svg>`;
  };

  const isOff = (ctx) => !ctx.on || ctx.busy;
  const disabled = (value) => value ? " disabled" : "";

  function selectedEvent(ctx) {
    const events = Array.isArray(ctx.disk?.events) ? ctx.disk.events : [];
    if (ctx.selectedId === null) return null;
    return events.find((event) => event.id === ctx.selectedId) || events[0] || null;
  }

  function clipOf(event, angle) {
    const clips = Array.isArray(event?.clips) ? event.clips : [];
    return clips.find((clip) => clip.cam === angle) || clips[0] || null;
  }

  function clipRange(event, angle) {
    const clip = clipOf(event, angle);
    const start = Number(clip?.start);
    const end = Number(clip?.end);
    const duration = Number(event?.dur) || Number(clip?.duration) || 0;
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return { clip, start, end };
    if (Number.isFinite(start)) return { clip, start, end: start + duration };
    return { clip, start: 0, end: duration };
  }

  function eventDuration(event, angle) {
    const range = clipRange(event, angle);
    return Math.max(0, Number(event?.dur) || Number(range.clip?.duration) || (range.end - range.start) || 0);
  }

  function playerData(ctx, id) {
    return ctx.disk?.players?.[id] || null;
  }

  function playerEvent(ctx, player) {
    const media = playerData(ctx, player);
    const events = Array.isArray(ctx.disk?.events) ? ctx.disk.events : [];
    return events.find((event) => event.id === media?.eventId) || null;
  }

  function ssdInfo(ctx) {
    const disk = ctx.disk || {};
    if (ctx.error) return { state: "err", text: "SSD ERRO", title: ctx.error };
    if (disk.interrupted?.reason) return { state: "err", text: "SSD INTERROMPIDO", title: disk.interrupted.reason };
    if (disk.rec) return { state: "rec", text: "SSD GRAVANDO", title: "Gravação contínua confirmada pelo motor" };
    return { state: "idle", text: "SSD PARADO", title: "Nenhuma sessão de replay gravando" };
  }

  function remainingInfo(ctx) {
    const disk = ctx.disk || {};
    const free = Number(ctx.stats?.availableDiskSpace);
    const freeGb = Number.isFinite(free) && free > 0 ? (free / 1024).toFixed(1) + " GB" : "—";
    if (ctx.error) return { label: "SSD", value: "offline", title: ctx.error };
    if (disk.rec && disk.retention?.enabled && Number(disk.session?.startedAt)) {
      const total = Math.max(1, Number(disk.retention.minutes) || 30) * 60000;
      const left = total - Math.max(0, Date.now() - Number(disk.session.startedAt));
      return left > 0
        ? { label: "Janela restante", value: clock(left / 1000, 0), title: "Tempo até a retenção circular completar a janela configurada" }
        : { label: "Buffer cheio", value: (Number(disk.retention.minutes) || 30) + " min", title: "A retenção circular já cobriu a janela configurada" };
    }
    return { label: disk.rec ? "SSD livre" : "SSD restante", value: freeGb, title: "Espaço livre informado pelo motor para gravação" };
  }

  function playerState(ctx, id) {
    const media = playerData(ctx, id);
    const onAir = ctx.program === "REPLAY " + id;
    if (onAir) return { cls: "onair", text: "NO AR" };
    if (!media) return { cls: "empty", text: "VAZIO" };
    if (media.available === false) return { cls: "missing", text: "AUSENTE" };
    return { cls: "ready", text: "PRONTO" };
  }

  function playerCard(ctx, id) {
    const media = playerData(ctx, id);
    const event = playerEvent(ctx, id);
    const state = playerState(ctx, id);
    const name = media ? (event?.name || media.cam || "Lance carregado") : "Nenhum lance carregado";
    const detail = media ? [media.cam, event?.time].filter(Boolean).join(" · ") : "Selecione e carregue um lance";
    const selected = ctx.player === id;
    const title = media ? `Player ${id}: ${name}${media.available === false ? " (arquivo ausente)" : ""}` : `Selecionar Player ${id}`;
    return `<button type="button" class="rp-player ${selected ? "selected" : ""} ${state.cls}" data-a="rpdockplayer" data-v="${id}" title="${esc(title)}">
      <span class="rp-player-id">${id}</span>
      <span class="rp-player-meta"><b>${esc(name)}</b><small>${esc(detail)}</small></span>
      <span class="rp-player-state ${state.cls}">${state.text}</span>
    </button>`;
  }

  function marksFor(ctx, event) {
    const html = [];
    for (const id of PLAYERS) {
      const media = playerData(ctx, id);
      if (media?.eventId === event.id) {
        const onAir = ctx.program === "REPLAY " + id;
        html.push(`<span class="rp-chip player-${id.toLowerCase()}${onAir ? " air" : ""}" title="Lance carregado no Player ${id}${onAir ? " e no ar" : ""}">${id}${onAir ? " NO AR" : ""}</span>`);
      }
    }
    const angles = Array.isArray(event.clips) ? event.clips.length : 0;
    if (angles) html.push(`<span class="rp-chip dim" title="${angles} câmera(s) neste lance">${angles} CAM</span>`);
    if (event.imported) html.push('<span class="rp-chip dim">IMPORTADO</span>');
    if (event.recovered) html.push('<span class="rp-chip warn">RECUPERADO</span>');
    if (event.available === false) html.push('<span class="rp-chip danger">AUSENTE</span>');
    return html.join("");
  }

  function eventNameDetail(event) {
    const detail = [event.time, event.cam].filter(Boolean).join(" · ");
    return detail ? `<small>${esc(detail)}</small>` : "";
  }

  function rowActions(ctx, event) {
    const off = disabled(isOff(ctx));
    const loadable = event.available !== false && Array.isArray(event.clips) && event.clips.length > 0;
    const loadOff = disabled(isOff(ctx) || !loadable);
    const deleting = ctx.deleteId === event.id;
    const titleLoad = loadable ? "Carregar este lance" : "Arquivo do lance ausente";
    return `<div class="rp-row-actions">
      <button type="button" class="rp-row-btn a" data-a="rpdockload" data-v="A" data-event="${esc(event.id)}"${loadOff} title="${titleLoad} no Player A" aria-label="Carregar no Player A">A</button>
      <button type="button" class="rp-row-btn b" data-a="rpdockload" data-v="B" data-event="${esc(event.id)}"${loadOff} title="${titleLoad} no Player B" aria-label="Carregar no Player B">B</button>
      <button type="button" class="rp-row-btn play" data-a="rpdockplayevent" data-v="${esc(event.id)}"${loadOff} title="${loadable ? "Carregar no player selecionado e reproduzir" : "Arquivo do lance ausente"}" aria-label="Reproduzir lance">${icon("play")}</button>
      <button type="button" class="rp-row-btn del ${deleting ? "armed" : ""}" data-a="rpdockdelete" data-v="${esc(event.id)}"${off} title="${deleting ? "Clique para confirmar a exclusão" : "Excluir lance"}" aria-label="${deleting ? "Confirmar exclusão" : "Excluir lance"}">${deleting ? "!" : icon("trash")}</button>
    </div>`;
  }

  function eventRows(ctx, events) {
    if (!events.length) {
      return `<tr class="rp-ev-empty"><td colspan="8"><b>Nenhum lance gravado</b><span>Inicie o SSD e capture com −5, −10, −20 s ou IN/OUT.</span></td></tr>`;
    }
    return events.map((event, index) => {
      const angle = ctx.angles?.[event.id];
      const range = clipRange(event, angle);
      const selected = event.id === ctx.selectedId;
      const loaded = PLAYERS.some((id) => playerData(ctx, id)?.eventId === event.id);
      const onAir = PLAYERS.some((id) => playerData(ctx, id)?.eventId === event.id && ctx.program === "REPLAY " + id);
      const marks = marksFor(ctx, event);
      return `<tr class="${selected ? "selected" : ""}${loaded ? " loaded" : ""}${onAir ? " onair" : ""}" data-rp-event="${esc(event.id)}" tabindex="0" aria-selected="${selected}" title="Duplo clique carrega no Player ${ctx.player}">
        <td class="rp-col-num rp-mono">${String(index + 1).padStart(2, "0")}</td>
        <td class="rp-col-in rp-mono">${clock(range.start)}</td>
        <td class="rp-col-out rp-mono">${clock(range.end)}</td>
        <td class="rp-col-dur rp-mono">${durationText(eventDuration(event, angle))}</td>
        <td class="rp-col-name"><span class="rp-ev-name"><b>${esc(event.name || "Lance " + (index + 1))}</b>${eventNameDetail(event)}<span class="rp-ev-mobile-marks">${marks}</span></span></td>
        <td class="rp-col-cam">${esc((clipOf(event, angle) || {}).cam || event.cam || "—")}</td>
        <td class="rp-col-marks">${marks}</td>
        <td class="rp-col-act">${rowActions(ctx, event)}</td>
      </tr>`;
    }).join("");
  }

  function eventsView(ctx) {
    const events = Array.isArray(ctx.disk?.events) ? ctx.disk.events : [];
    const selected = selectedEvent(ctx);
    const range = clipRange(selected, ctx.angle);
    const angle = (clipOf(selected, ctx.angle) || {}).cam || ctx.angle || "";
    const off = disabled(isOff(ctx));
    const recordOff = disabled(isOff(ctx) || !ctx.disk?.rec);
    const loadOff = disabled(isOff(ctx) || !selected);
    const angles = Array.isArray(selected?.clips) ? selected.clips : [];
    return `<section class="rp-view rp-view-events" aria-label="Eventos do Replay">
      <div class="rp-players">${playerCard(ctx, "A")}${playerCard(ctx, "B")}</div>

      <div class="rp-ev-wrap" data-rp-events>
        <table class="rp-ev-table">
          <thead><tr>
            <th class="rp-col-num" data-rp-col-th="num">#<span class="rp-col-grip" data-rp-col-grip="num" title="Arraste para redimensionar"></span></th>
            <th class="rp-col-in" data-rp-col-th="in">IN<span class="rp-col-grip" data-rp-col-grip="in" title="Arraste para redimensionar"></span></th>
            <th class="rp-col-out" data-rp-col-th="out">OUT<span class="rp-col-grip" data-rp-col-grip="out" title="Arraste para redimensionar"></span></th>
            <th class="rp-col-dur" data-rp-col-th="dur">DURAÇÃO<span class="rp-col-grip" data-rp-col-grip="dur" title="Arraste para redimensionar"></span></th>
            <th class="rp-col-name" data-rp-col-th="name">LANCE<span class="rp-col-grip" data-rp-col-grip="name" title="Arraste para redimensionar"></span></th>
            <th class="rp-col-cam" data-rp-col-th="cam">CÂMERA<span class="rp-col-grip" data-rp-col-grip="cam" title="Arraste para redimensionar"></span></th>
            <th class="rp-col-marks" data-rp-col-th="marks">MARCADORES<span class="rp-col-grip" data-rp-col-grip="marks" title="Arraste para redimensionar"></span></th>
            <th class="rp-col-act">AÇÕES</th>
          </tr></thead>
          <tbody>${eventRows(ctx, events)}</tbody>
        </table>
      </div>

      <div class="rp-controls-row">
        <section class="rp-capture" aria-label="Seleção e marcação">
          <div class="rp-line">
            <span class="rp-label">Player</span>
            <button type="button" class="rp-btn rp-btn-player${ctx.player === "A" ? " selected" : ""}" data-a="rpdockplayer" data-v="A" aria-pressed="${ctx.player === "A"}" title="Operar o Player A">A</button>
            <button type="button" class="rp-btn rp-btn-player${ctx.player === "B" ? " selected" : ""}" data-a="rpdockplayer" data-v="B" aria-pressed="${ctx.player === "B"}" title="Operar o Player B">B</button>
            <span class="rp-divider" aria-hidden="true"></span>
            <label class="rp-inline rp-grow"><span>Lance</span><select id="rp-quick-event" class="rp-select"${off} aria-label="Lance selecionado">${events.length ? events.map((event) => `<option value="${esc(event.id)}"${event.id === selected?.id ? " selected" : ""}>${esc(event.name || "Lance")}</option>`).join("") : '<option value="">Nenhum lance</option>'}</select></label>
            <label class="rp-inline rp-angle-field"><span>Câmera</span><select id="rp-quick-angle" class="rp-select"${disabled(isOff(ctx) || !angles.length)} aria-label="Câmera do lance selecionado">${angles.length ? angles.map((clip) => `<option value="${esc(clip.cam)}"${clip.cam === angle ? " selected" : ""}${clip.available === false ? " disabled" : ""}>${esc(clip.cam)}${clip.available === false ? " · ausente" : ""}</option>`).join("") : '<option value="">—</option>'}</select></label>
          </div>
          <div class="rp-line">
            <button type="button" class="rp-btn load-a" data-a="rpdockload" data-v="A"${loadOff} title="Preparar o lance e a câmera no Player A (pausado)">Carregar A</button>
            <button type="button" class="rp-btn load-b" data-a="rpdockload" data-v="B"${loadOff} title="Preparar o lance e a câmera no Player B (pausado)">Carregar B</button>
            <span class="rp-divider" aria-hidden="true"></span>
            <button type="button" class="rp-btn mark" data-a="rpmarkin"${recordOff} title="Marcar IN na gravação contínua">IN</button>
            <button type="button" class="rp-btn mark" data-a="rpmarkout"${recordOff} title="Marcar OUT e salvar o lance">OUT</button>
            <button type="button" class="rp-btn back" data-a="rpquickclip" data-v="5"${recordOff} title="Salvar os últimos 5 segundos">−5 s</button>
            <button type="button" class="rp-btn back" data-a="rpquickclip" data-v="10"${recordOff} title="Salvar os últimos 10 segundos">−10 s</button>
            <button type="button" class="rp-btn back" data-a="rpquickclip" data-v="20"${recordOff} title="Salvar os últimos 20 segundos">−20 s</button>
            <button type="button" class="rp-btn ghost clear" data-a="rpdockclear" title="Limpar a seleção do dock; IN/OUT no motor são preservados">Limpar</button>
          </div>
        </section>
        ${transportView(ctx)}
      </div>
      ${timelineView(ctx)}
    </section>`;
  }

  function transportView(ctx) {
    const media = playerData(ctx, ctx.player);
    const loaded = !!media && media.available !== false;
    const playing = media?.mediaState === "OBS_MEDIA_STATE_PLAYING";
    const off = disabled(isOff(ctx) || !loaded);
    const speed = Number(ctx.disk?.speed) || 50;
    return `<section class="rp-transport" aria-label="Reprodução do Player ${ctx.player}">
      <div class="rp-line">
        <span class="rp-label">Player ${ctx.player}</span>
        <button type="button" class="rp-btn icon-only" data-a="rpquickstep" data-v="-1"${off} title="Quadro anterior" aria-label="Quadro anterior">${icon("prev")}</button>
        <button type="button" class="rp-btn play ${playing ? "active" : ""}" data-a="rpquicktransport" data-v="PLAY"${off} title="Reproduzir" aria-label="Reproduzir">${icon("play")}<span>Play</span></button>
        <button type="button" class="rp-btn pause" data-a="rpquicktransport" data-v="PAUSE"${off} title="Pausar" aria-label="Pausar">${icon("pause")}<span>Pausa</span></button>
        <button type="button" class="rp-btn stop" data-a="rpquicktransport" data-v="STOP"${off} title="Parar" aria-label="Parar">${icon("stop")}<span>Stop</span></button>
        <button type="button" class="rp-btn icon-only" data-a="rpquickstep" data-v="1"${off} title="Próximo quadro" aria-label="Próximo quadro">${icon("next")}</button>
        <button type="button" class="rp-btn loop ${ctx.loop ? "on" : ""}" data-a="rpdockloop" aria-pressed="${ctx.loop}" title="Repetir o clipe no player selecionado (loop do dock)">Loop</button>
        <span class="rp-divider" aria-hidden="true"></span>
        <span class="rp-label rp-speed-label">Vel.</span>
        <div class="rp-speed" role="group" aria-label="Velocidade de reprodução">
          ${SPEEDS.map((value) => `<button type="button" class="rp-btn speed${speed === value ? " selected" : ""}" data-a="rpquickspeed" data-v="${value}"${disabled(isOff(ctx) || !loaded)} aria-pressed="${speed === value}" title="Reproduzir a ${value}%">${value}%</button>`).join("")}
        </div>
      </div>
    </section>`;
  }

  function markerLayout(ctx) {
    const events = Array.isArray(ctx.disk?.events) ? ctx.disk.events : [];
    const spans = events.map((event, index) => {
      const range = clipRange(event);
      return { event, index, start: range.start, end: range.end };
    }).filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start);
    if (!spans.length) return [];
    let min = Math.min(...spans.map((item) => item.start));
    let max = Math.max(...spans.map((item) => item.end));
    if (!(max > min)) {
      const step = 100 / Math.max(1, spans.length);
      return spans.map((item, index) => ({ ...item, left: index * step, width: Math.max(2, step * 0.7) }));
    }
    return spans.map((item) => {
      const left = ((item.start - min) / (max - min)) * 100;
      const width = Math.max(0.7, ((item.end - item.start) / (max - min)) * 100);
      return { ...item, left: clamp(left, 0, 99.3), width: clamp(width, 0.7, 100 - left) };
    });
  }

  function timelineView(ctx) {
    const media = playerData(ctx, ctx.player);
    const event = playerEvent(ctx, ctx.player) || selectedEvent(ctx);
    const loaded = !!media && media.available !== false;
    const durationMs = Math.max(0, Number(media?.mediaDuration) || (eventDuration(event, ctx.angle) * 1000));
    const cursorMs = clamp(Number(media?.mediaCursor) || 0, 0, durationMs);
    const progress = durationMs > 0 ? (cursorMs / durationMs) * 100 : 0;
    const range = clipRange(event, media?.cam || ctx.angle);
    const source = media
      ? `Player ${ctx.player} · ${event?.name || media.cam || "lance"} · ${media.cam || "câmera"}`
      : "Nenhum player carregado";
    const markers = markerLayout(ctx);
    const speed = Number(ctx.disk?.speed) || 50;
    return `<section class="rp-timeline-card" aria-label="Linha do tempo do replay">
      <div class="rp-tl-head">
        <span class="rp-tl-title">LINHA DO TEMPO</span>
        <span class="rp-tl-source" title="${esc(source)}">${esc(source)}</span>
        <span class="rp-tl-tc" data-rp-timecode>${clock(cursorMs / 1000)}<i>/</i>${clock(durationMs / 1000)}</span>
        <span class="rp-tl-speed" title="Velocidade atual">${speed}%</span>
      </div>
      <div class="rp-tl-track${loaded ? "" : " disabled"}" data-rp-tl-track data-player="${ctx.player}" data-duration="${Math.round(durationMs)}" data-start="${range.start}" role="slider" tabindex="${loaded ? "0" : "-1"}" aria-label="Posição do clipe no Player ${ctx.player}" aria-valuemin="0" aria-valuemax="${Math.round(durationMs)}" aria-valuenow="${Math.round(cursorMs)}" title="${loaded ? "Clique ou arraste para buscar no clipe" : "Carregue um lance para navegar"}" style="--rp-progress:${progress}%;--rp-playhead:${progress}%">
        <span class="rp-tl-fill" aria-hidden="true"></span>
        <span class="rp-tl-in" title="IN do clipe">IN</span>
        <span class="rp-tl-out" title="OUT do clipe">OUT</span>
        <span class="rp-tl-playhead" aria-hidden="true"></span>
      </div>
      <div class="rp-tl-events" aria-label="Marcadores de eventos gravados">
        ${markers.map((item) => {
          const loadedEvent = PLAYERS.some((id) => playerData(ctx, id)?.eventId === item.event.id);
          const onAir = PLAYERS.some((id) => playerData(ctx, id)?.eventId === item.event.id && ctx.program === "REPLAY " + id);
          return `<span class="rp-tl-event${item.event.id === ctx.selectedId ? " selected" : ""}${loadedEvent ? " loaded" : ""}${onAir ? " onair" : ""}" style="left:${item.left}%;width:${item.width}%" data-a="rpdockselect" data-v="${esc(item.event.id)}" title="${esc((item.index + 1) + " · " + (item.event.name || "Lance"))}"><b>${item.index + 1}</b></span>`;
        }).join("")}
        ${markers.length ? "" : '<span class="rp-tl-noevents">Sem eventos marcados</span>'}
      </div>
      <div class="rp-tl-foot">
        <span>IN <b data-rp-in>${clock(range.start)}</b></span>
        <span>OUT <b data-rp-out>${clock(range.end)}</b></span>
        <span class="rp-tl-hint">${loaded ? "Clique ou arraste para buscar" : "Carregue A/B para navegar"}</span>
      </div>
    </section>`;
  }

  function playlistView(ctx) {
    const events = Array.isArray(ctx.disk?.events) ? ctx.disk.events : [];
    const total = events.reduce((sum, event) => sum + eventDuration(event, ctx.angle), 0);
    const off = disabled(isOff(ctx));
    return `<section class="rp-view rp-view-playlist" aria-label="Playlist de lances">
      <header class="rp-view-head"><strong>Playlist de lances</strong><span>${events.length} lance${events.length === 1 ? "" : "s"} · ${durationText(total)} · ordem do motor</span></header>
      <div class="rp-pl-scroll">
        ${events.length ? events.map((event, index) => {
          const range = clipRange(event, ctx.angle);
          const selected = event.id === ctx.selectedId;
          const loaded = PLAYERS.some((id) => playerData(ctx, id)?.eventId === event.id);
          return `<div class="rp-pl-row${selected ? " selected" : ""}${loaded ? " loaded" : ""}" data-rp-event="${esc(event.id)}">
            <span class="rp-pl-num">${index + 1}</span>
            <button type="button" class="rp-pl-name" data-a="rpdockselect" data-v="${esc(event.id)}" title="Selecionar este lance">
              <b>${esc(event.name || "Lance " + (index + 1))}</b>
              <small>${esc([event.time, event.cam, durationText(eventDuration(event, ctx.angle))].filter(Boolean).join(" · "))}</small>
            </button>
            <span class="rp-pl-tc rp-mono">${clock(range.start)} → ${clock(range.end)}</span>
            <span class="rp-pl-actions">
              <button type="button" class="rp-row-btn" data-a="rpdockmove" data-v="${esc(event.id)}" data-d="-1"${disabled(isOff(ctx) || index === 0)} title="Subir na playlist">${icon("up")}</button>
              <button type="button" class="rp-row-btn" data-a="rpdockmove" data-v="${esc(event.id)}" data-d="1"${disabled(isOff(ctx) || index === events.length - 1)} title="Descer na playlist">${icon("down")}</button>
              <button type="button" class="rp-row-btn a" data-a="rpdockload" data-v="A" data-event="${esc(event.id)}"${off} title="Carregar no Player A">A</button>
              <button type="button" class="rp-row-btn b" data-a="rpdockload" data-v="B" data-event="${esc(event.id)}"${off} title="Carregar no Player B">B</button>
            </span>
          </div>`;
        }).join("") : '<div class="rp-empty">Nenhum lance na playlist.</div>'}
      </div>
      <p class="rp-hint">As setas reordenam a mesma lista do motor, compartilhada com a janela completa. Nenhuma fila paralela é criada no dock.</p>
    </section>`;
  }

  function cameraState(disk = {}) {
    const usable = (name) => name && name !== "3Mix Barramentos" && !String(name).startsWith("REPLAY ");
    const availableCams = (Array.isArray(disk.availableCams) ? disk.availableCams : []).filter(usable);
    const session = (disk.session?.cams || []).map((cam) => cam?.name).filter(usable);
    const stored = (Array.isArray(disk.cams) ? disk.cams : []).filter(usable);
    let selected;
    if (disk.rec && session.length) {
      selected = session;
    } else {
      const storedValid = stored.filter((name) => availableCams.includes(name));
      if (storedValid.length) selected = storedValid;
      else if (disk.camsExplicit && Array.isArray(disk.cams)) selected = [];
      else if (session.length) selected = session;
      else if (stored.length) selected = stored;
      else selected = availableCams.slice(0, 1);
    }
    selected = [...new Set(selected)].slice(0, 8);
    const available = [...selected, ...availableCams.filter((name) => !selected.includes(name))];
    return { available, selected, max: 8 };
  }

  function camerasView(ctx) {
    const disk = ctx.disk || {};
    const { available, selected } = cameraState(disk);
    const counts = new Map();
    for (const event of disk.events || []) for (const clip of event.clips || []) counts.set(clip.cam, (counts.get(clip.cam) || 0) + 1);
    const off = disabled(isOff(ctx) || disk.rec);
    return `<section class="rp-view rp-view-scroll" aria-label="Câmeras do Replay">
      <header class="rp-view-head"><strong>Câmeras do Replay</strong><span>${disk.rec ? "Sessão gravando" : "Próxima sessão"}</span></header>
      <div class="rp-scroll">
        <section class="rp-card">
          <header><strong>Entradas gravadas</strong><span>${selected.length} de ${8}</span></header>
          <p class="rp-hint">${disk.rec ? "Pare o SSD para alterar a seleção de câmeras." : "Selecione até oito entradas. A mesma lista de cenas da janela completa."}</p>
          <p class="rp-cam-summary"><span>${disk.rec ? "Gravando agora" : "Selecionadas para a próxima sessão"}</span><b>${selected.length ? selected.map(esc).join(" · ") : "nenhuma"}</b></p>
          <div class="rp-cam-list">
            ${available.length ? available.map((name) => {
              const on = selected.includes(name);
              const count = counts.get(name) || 0;
              return `<button type="button" class="rp-cam${on ? " on" : ""}" data-a="rpdisk_camtoggle" data-v="${esc(name)}"${off} aria-pressed="${on}" title="${on ? "Entrada gravada nesta seleção; clique para remover" : "Entrada disponível; clique para incluir na gravação"}">
                <span class="rp-cam-box" aria-hidden="true"><i>✓</i></span><b>${esc(name)}</b><small>${count} lance${count === 1 ? "" : "s"}</small>
              </button>`;
            }).join("") : '<div class="rp-empty">O motor não informou entradas disponíveis.</div>'}
          </div>
        </section>
        <section class="rp-card">
          <header><strong>${disk.rec ? "Sessão atual" : "Última sessão"}</strong><span>${disk.session?.startedAt ? new Date(disk.session.startedAt).toLocaleTimeString("pt-BR") : "Sem sessão"}</span></header>
          <div class="rp-kv"><span>Estado</span><b>${ssdInfo(ctx).text}</b></div>
          <div class="rp-kv"><span>Espaço livre</span><b>${remainingInfo(ctx).value}</b></div>
          <div class="rp-kv"><span>Eventos</span><b>${(disk.events || []).length}</b></div>
          <div class="rp-kv"><span>Câmeras na sessão</span><b>${(disk.session?.cams || []).map((cam) => cam.name).join(" · ") || "Sem sessão gravada"}</b></div>
          <button type="button" class="rp-btn wide" data-a="rpdocksettings" title="Abrir as configurações completas de câmeras, áudio e retenção">${icon("settings")}<span>Configurações de câmeras e áudio</span></button>
        </section>
      </div>
    </section>`;
  }

  function settingsView(ctx) {
    const disk = ctx.disk || {};
    const cameraSelection = cameraState(disk).selected;
    const off = disabled(isOff(ctx));
    const retention = disk.retention || { enabled: false, minutes: 30, segmentSeconds: 60 };
    return `<section class="rp-view rp-view-scroll" aria-label="Ajustes do Replay">
      <header class="rp-view-head"><strong>Ajustes do Replay</strong><span>Compartilhados com a janela completa</span></header>
      <div class="rp-scroll">
        <section class="rp-card">
          <header><strong>Gravação SSD</strong><span>${ssdInfo(ctx).text}</span></header>
          <div class="rp-kv"><span>Sessão</span><b>${disk.session?.startedAt ? new Date(disk.session.startedAt).toLocaleString("pt-BR") : "Parada"}</b></div>
          <div class="rp-kv"><span>Espaço</span><b>${remainingInfo(ctx).value}</b></div>
          <div class="rp-kv"><span>Câmeras</span><b>${cameraSelection.join(" · ") || "Nenhuma"}</b></div>
          <button type="button" class="rp-btn ${disk.rec ? "danger" : "record"} wide" data-a="rpdiskrec"${off} title="${disk.rec ? "Parar a gravação contínua" : "Iniciar a gravação contínua"}">
            ${disk.rec ? icon("stop") + "<span>Parar gravação SSD</span>" : '<span class="rp-rec-dot"></span><span>Iniciar gravação SSD</span>'}
          </button>
        </section>

        <section class="rp-card">
          <header><strong>Retenção circular</strong><span>${retention.enabled ? retention.minutes + " min" : "Desligada"}</span></header>
          <p class="rp-hint">Com REC ativo, pare a gravação para alterar a retenção.</p>
          <label class="rp-check"><input type="checkbox" id="rp-ret-enabled"${retention.enabled ? " checked" : ""}${disabled(!!disk.rec || isOff(ctx))}> Retenção circular no SSD</label>
          <label class="rp-field"><span>Minutos</span><input type="number" id="rp-ret-minutes" min="1" max="1440" value="${Number(retention.minutes) || 30}"${disabled(!!disk.rec || isOff(ctx))}></label>
          <button type="button" class="rp-btn wide" data-a="rpdockretention"${disabled(!!disk.rec || isOff(ctx))} title="Aplicar a retenção com a gravação parada">Aplicar retenção</button>
        </section>

        <section class="rp-card">
          <header><strong>Operação</strong><span>A/B e áudio</span></header>
          <div class="rp-split">
            <button type="button" class="rp-btn ${disk.linked ? "on" : ""}" data-a="rplink"${off} aria-pressed="${!!disk.linked}" title="Vincular o mesmo lance nos Players A e B">${disk.linked ? "A/B vinculados" : "Vincular A/B"}</button>
            <button type="button" class="rp-btn ${disk.audioEnabled !== false ? "on" : ""}" data-a="rpdockaudio"${off} aria-pressed="${disk.audioEnabled !== false}" title="Ligar ou desligar o áudio dos players">Áudio ${disk.audioEnabled !== false ? "ligado" : "desligado"}</button>
          </div>
        </section>

        <section class="rp-card">
          <header><strong>Janelas</strong><span>Sem previews no dock</span></header>
          <div class="rp-split">
            <button type="button" class="rp-btn wide" data-a="rpdockexpand">${icon("expand")}<span>Abrir Replay completo</span></button>
            <button type="button" class="rp-btn wide" data-a="rpdocksettings">${icon("settings")}<span>Configurações do Replay</span></button>
          </div>
          <p class="rp-hint">Os previews A/B continuam na janela completa e no monitoramento.</p>
        </section>
      </div>
    </section>`;
  }

  function liveBar(ctx) {
    const program = String(ctx.program || "");
    const replayOnAir = program.startsWith("REPLAY ");
    const airPlayer = replayOnAir ? program.slice(7) : "";
    const back = ctx.disk?.back;
    const backAvailable = ctx.disk?.backAvailable !== false && !!back;
    const off = disabled(isOff(ctx));
    const armedAir = ctx.arm?.action === "air" ? ctx.arm.player : "";
    const armedLive = ctx.arm?.action === "live";
    const airButton = (id) => {
      const media = playerData(ctx, id);
      const loaded = !!media && media.available !== false;
      const onAir = airPlayer === id;
      const armed = armedAir === id;
      return `<button type="button" class="rp-live-btn air${onAir ? " now" : ""}${armed ? " armed" : ""}" data-a="rpdockair" data-v="${id}"${disabled(isOff(ctx) || !loaded || onAir)} title="${onAir ? "Player " + id + " já está no ar" : armed ? "Clique novamente para confirmar" : "Colocar o Player " + id + " no ar"}">${armed ? "CONFIRMAR " + id + " NO AR" : id + " NO AR"}</button>`;
    };
    return `<footer class="rp-live-bar" aria-label="Comandos de ar e retorno ao vivo">
      <span class="rp-live-state"><i class="${replayOnAir ? "onair" : ""}" aria-hidden="true"></i><span><small>${replayOnAir ? "NO AR" : "PROGRAMA"}</small><b>${esc(replayOnAir ? program : (program || "—"))}</b><em>${back ? "volta: " + esc(back) : "sem retorno guardado"}</em></span></span>
      ${airButton("A")}${airButton("B")}
      <button type="button" class="rp-live-btn live${armedLive ? " armed" : ""}" data-a="rpdocklive"${disabled(isOff(ctx) || !replayOnAir || !backAvailable)} title="${armedLive ? "Clique novamente para confirmar o retorno ao vivo" : replayOnAir ? "Voltar à entrada ao vivo anterior" : "O programa não está em um player de replay"}">${armedLive ? "CONFIRMAR AO VIVO" : "VOLTAR AO VIVO"}</button>
    </footer>`;
  }

  function html(ctx) {
    const info = ssdInfo(ctx);
    const remaining = remainingInfo(ctx);
    const tab = ["events", "playlist", "cameras", "settings"].includes(ctx.tab) ? ctx.tab : "events";
    const body = tab === "playlist" ? playlistView(ctx) : tab === "cameras" ? camerasView(ctx) : tab === "settings" ? settingsView(ctx) : eventsView(ctx);
    const tabButton = (id, label) => `<button type="button" class="rp-dock-tab${tab === id ? " on" : ""}" data-a="rpdocktab" data-v="${id}" role="tab" aria-selected="${tab === id}">${label}</button>`;
    return `<div class="rp-dock" data-rp-dock data-tab="${tab}">
      <header class="rp-head">
        <div class="rp-title"><span class="rp-brand" aria-hidden="true">R</span><span class="rp-title-text"><strong>Replay</strong><small>operação ao vivo</small></span></div>
        <div class="rp-status">
          <span class="rp-ssd ${info.state}" data-rp-ssd title="${esc(info.title)}"><i aria-hidden="true"></i>${info.text}</span>
          <span class="rp-remain" data-rp-remaining title="${esc(remaining.title)}"><small>${remaining.label}</small><b>${remaining.value}</b></span>
          <button type="button" class="rp-rec ${ctx.disk?.rec ? "on" : ""}" data-a="rpdiskrec"${disabled(isOff(ctx))} title="${ctx.disk?.rec ? "Parar a gravação SSD" : "Iniciar a gravação SSD"}">${ctx.disk?.rec ? "■ PARAR" : "● REC"}</button>
          <button type="button" class="rp-expand" data-a="rpdockexpand" title="Abrir a janela completa do Replay" aria-label="Ampliar Replay">${icon("expand")}<span>Ampliar</span></button>
        </div>
      </header>
      <nav class="rp-dock-tabs" role="tablist" aria-label="Seções do Replay">
        ${tabButton("events", "Eventos")}${tabButton("playlist", "Playlist")}${tabButton("cameras", "Câmeras")}${tabButton("settings", "Ajustes")}
      </nav>
      <div class="rp-body">${body}</div>
      ${liveBar(ctx)}
    </div>`;
  }

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node && node.textContent !== value) node.textContent = value;
  }

  function sync(root, ctx) {
    const dock = root.querySelector(".rp-dock");
    if (!dock) return;
    const info = ssdInfo(ctx);
    const remaining = remainingInfo(ctx);
    const ssd = root.querySelector("[data-rp-ssd]");
    if (ssd) {
      ssd.className = "rp-ssd " + info.state;
      ssd.textContent = info.text;
      ssd.title = info.title;
    }
    const remain = root.querySelector("[data-rp-remaining]");
    if (remain) {
      remain.title = remaining.title;
      const label = remain.querySelector("small");
      const value = remain.querySelector("b");
      if (label) label.textContent = remaining.label;
      if (value) value.textContent = remaining.value;
    }
    const rec = root.querySelector(".rp-rec");
    if (rec) {
      rec.classList.toggle("on", !!ctx.disk?.rec);
      rec.textContent = ctx.disk?.rec ? "■ PARAR" : "● REC";
      rec.title = ctx.disk?.rec ? "Parar a gravação SSD" : "Iniciar a gravação SSD";
    }
    for (const id of PLAYERS) {
      const card = root.querySelector(`.rp-player[data-v="${id}"]`);
      if (!card) continue;
      const media = playerData(ctx, id);
      const event = playerEvent(ctx, id);
      const state = playerState(ctx, id);
      card.classList.toggle("selected", ctx.player === id);
      card.classList.toggle("onair", state.cls === "onair");
      card.classList.toggle("ready", state.cls === "ready");
      card.classList.toggle("missing", state.cls === "missing");
      const name = card.querySelector(".rp-player-meta b");
      const detail = card.querySelector(".rp-player-meta small");
      const badge = card.querySelector(".rp-player-state");
      if (name) name.textContent = media ? (event?.name || media.cam || "Lance carregado") : "Nenhum lance carregado";
      if (detail) detail.textContent = media ? [media.cam, event?.time].filter(Boolean).join(" · ") : "Selecione e carregue um lance";
      if (badge) { badge.className = "rp-player-state " + state.cls; badge.textContent = state.text; }
    }
    for (const row of root.querySelectorAll("[data-rp-event]")) {
      if (!row.matches("tr, .rp-pl-row")) continue;
      row.classList.toggle("selected", row.dataset.rpEvent === ctx.selectedId);
    }
    const track = root.querySelector("[data-rp-tl-track]");
    if (track) {
      const media = playerData(ctx, ctx.player);
      const loaded = !!media && media.available !== false;
      const duration = Math.max(0, Number(track.dataset.duration) || 0);
      const cursor = clamp(Number(media?.mediaCursor) || 0, 0, duration);
      const progress = duration > 0 ? (cursor / duration) * 100 : 0;
      track.style.setProperty("--rp-progress", progress + "%");
      track.style.setProperty("--rp-playhead", progress + "%");
      track.classList.toggle("disabled", !loaded);
      track.setAttribute("aria-valuenow", String(Math.round(cursor)));
      track.setAttribute("aria-valuemax", String(Math.round(duration)));
      const tc = root.querySelector("[data-rp-timecode]");
      if (tc) tc.innerHTML = clock(cursor / 1000) + "<i>/</i>" + clock(duration / 1000);
    }
    const live = root.querySelector(".rp-live-btn.live");
    if (live) {
      const onAir = String(ctx.program || "").startsWith("REPLAY ");
      const armed = ctx.arm?.action === "live";
      live.classList.toggle("armed", armed);
      live.textContent = armed ? "CONFIRMAR AO VIVO" : "VOLTAR AO VIVO";
      live.disabled = !ctx.on || ctx.busy || !onAir || ctx.disk?.backAvailable === false || !ctx.disk?.back;
    }
    for (const id of PLAYERS) {
      const button = root.querySelector(`.rp-live-btn.air[data-v="${id}"]`);
      if (!button) continue;
      const media = playerData(ctx, id);
      const onAir = ctx.program === "REPLAY " + id;
      const armed = ctx.arm?.action === "air" && ctx.arm.player === id;
      button.classList.toggle("now", onAir);
      button.classList.toggle("armed", armed);
      button.disabled = !ctx.on || ctx.busy || !media || media.available === false || onAir;
      button.textContent = armed ? "CONFIRMAR " + id + " NO AR" : id + " NO AR";
    }
    const activeState = root.querySelector(".rp-live-state");
    if (activeState) {
      const onAir = String(ctx.program || "").startsWith("REPLAY ");
      const dot = activeState.querySelector("i");
      if (dot) dot.classList.toggle("onair", onAir);
      const small = activeState.querySelector("small");
      const strong = activeState.querySelector("b");
      const em = activeState.querySelector("em");
      if (small) small.textContent = onAir ? "NO AR" : "PROGRAMA";
      if (strong) strong.textContent = ctx.program || "—";
      if (em) em.textContent = ctx.disk?.back ? "volta: " + ctx.disk.back : "sem retorno guardado";
    }
  }

  window.FreeMixReplayDock = Object.freeze({ html, sync, clock, durationText, cameras: cameraState });
})();
