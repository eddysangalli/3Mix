// Reusable compact PTZ surface for the operation dock. State comes from /api/ptz,
// never inferred from the video type. Colors come from the mesa/3Mix graphite theme
// (mesa-grafite.css / 3mix-grafite.css), not from the reference mockup.
(function (root) {
  const CSS = `
  .ptzc{--ptzc-card:var(--row,#252525);--ptzc-line:var(--bd,#494949);--ptzc-bg:var(--bar,#191919);
    --ptzc-tx:var(--tx,#ededed);--ptzc-mut:var(--mut,#b2b2b2);--ptzc-blue:#2f6fed;
    display:flex;flex:1 1 auto;flex-direction:column;gap:8px;padding:8px;color:var(--ptzc-tx);
    font:12px/1.25 "Segoe UI",system-ui,sans-serif;box-sizing:border-box;min-height:100%}
  .ptzc *{box-sizing:border-box}
  .ptzc-head{display:flex;align-items:center;gap:8px;min-height:24px}
  .ptzc-title{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:800;letter-spacing:.3px;color:var(--ptzc-tx)}
  .ptzc-title i{width:3px;height:15px;background:var(--ptzc-blue);border-radius:1px}
  .ptzc-title b{font-size:13px;font-weight:800;color:var(--ptzc-tx)}
  .ptzc-title span{font-size:12px;font-weight:600;color:var(--ptzc-mut)}
  .ptzc-sub{display:none}
  .ptzc-open{margin-left:auto;height:26px;padding:0 10px;border:1px solid var(--ptzc-line);
    background:var(--ptzc-card);color:var(--ptzc-tx);border-radius:4px;font:600 11px "Segoe UI",sans-serif;cursor:pointer}
  .ptzc-open:hover{background:#414141;border-color:#666}
  .ptzc-top{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
  .ptzc-camera{display:flex;flex-direction:column;gap:3px;flex:0 1 380px;min-width:240px}
  .ptzc-camera-row{display:flex;align-items:center;gap:6px;min-width:0}
  .ptzc-label{display:flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--ptzc-mut)}
  .ptzc-ico{width:12px;height:12px;flex:none;opacity:.75}
  .ptzc-select{flex:1;min-width:0;height:28px;background:var(--ptzc-bg);border:1px solid var(--ptzc-line);
    border-radius:4px;color:var(--ptzc-tx);padding:0 8px;font:inherit}
  .ptzc-select:focus{outline:none;border-color:var(--ptzc-blue)}
  .ptzc-gear{width:28px;height:28px;flex:none;border:1px solid var(--ptzc-line);border-radius:4px;
    background:var(--ptzc-card);color:var(--ptzc-tx);cursor:pointer;font:14px/1 "Segoe UI Symbol",sans-serif;padding:0}
  .ptzc-gear:hover{background:#414141;border-color:#666}
  .ptzc-status{position:relative;padding-left:14px;font-size:11px;color:var(--ptzc-mut);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
  .ptzc-status::before{content:"";position:absolute;left:0;top:50%;width:7px;height:7px;margin-top:-3.5px;
    border-radius:50%;background:#767676}
  .ptzc-status.ok{color:#35c05a}
  .ptzc-status.ok::before{background:#35c05a}
  .ptzc-status.warn{color:#e8a33d}
  .ptzc-status.warn::before{background:#e8a33d}
  .ptzc-status.err{color:#ff8c80}
  .ptzc-status.err::before{background:#ff8c80}
  .ptzc-proto{margin-left:auto;align-self:flex-end;font-size:10px;font-weight:700;letter-spacing:.5px;
    text-transform:uppercase;color:var(--ptzc-mut);border:1px solid var(--ptzc-line);border-radius:4px;
    padding:4px 8px;background:var(--ptzc-card);white-space:nowrap}
  .ptzc-main{display:grid;grid-template-columns:140px minmax(0,1fr);gap:8px;align-items:start;margin-block:auto}
  .ptzc.ptzc-wide .ptzc-pad{grid-template-columns:repeat(3,54px);grid-template-rows:repeat(3,50px)}
  .ptzc.ptzc-wide .ptzc-group{padding:9px 10px}
  .ptzc-right{display:flex;flex-direction:column;gap:8px;min-width:0}
  .ptzc-side{display:grid;grid-template-columns:1.35fr .95fr 1.2fr .95fr 2fr;gap:6px;align-items:stretch}
  .ptzc-pad{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,42px);gap:3px}
  .ptzc-pad button{border:1px solid var(--ptzc-line);background:var(--ptzc-card);color:var(--ptzc-tx);
    border-radius:4px;font-size:15px;font-weight:700;line-height:1;cursor:pointer;padding:0}
  .ptzc-pad button:hover:not(:disabled){background:#414141;border-color:#666}
  .ptzc-pad button:active:not(:disabled){background:#4a4a4a}
  .ptzc-pad button:disabled{opacity:.32;cursor:default}
  .ptzc-pad .ptzc-stop{background:#b02a1f;border-color:#d04a3c;color:#fff;font-size:10px;letter-spacing:.6px}
  .ptzc-pad .ptzc-stop:hover:not(:disabled){background:#c73527}
  .ptzc-group{display:flex;flex-direction:column;gap:6px;min-width:0;
    padding:7px 8px;background:var(--ptzc-card);border:1px solid var(--ptzc-line);border-radius:5px}
  .ptzc-group.ptzc-speed{grid-column:auto}
  .ptzc-presets-group{min-width:0}
  .ptzc-row{display:flex;gap:4px;align-items:center;min-width:0}
  .ptzc-row button{flex:1;height:28px;min-width:0;border:1px solid var(--ptzc-line);background:var(--ptzc-bg);
    color:var(--ptzc-tx);border-radius:4px;font:600 11px "Segoe UI",sans-serif;cursor:pointer;padding:0 4px}
  .ptzc-row button:hover:not(:disabled){background:#414141;border-color:#666}
  .ptzc-row button:disabled{opacity:.32;cursor:default}
  .ptzc-row button.on{background:var(--ptzc-blue);border-color:#4e86f5;color:#fff}
  .ptzc-speedrow{display:flex;align-items:center;gap:6px;min-width:0}
  .ptzc-speed{flex:1;min-width:40px;accent-color:var(--ptzc-blue);margin:0}
  .ptzc-speedval{width:34px;text-align:right;font-size:11px;color:var(--ptzc-mut);font-variant-numeric:tabular-nums}
  .ptzc-presets{display:flex;flex-wrap:wrap;gap:3px}
  .ptzc-presets button{flex:1 1 0;width:auto;min-width:26px;height:30px;border:1px solid var(--ptzc-line);
    background:var(--ptzc-bg);color:var(--ptzc-tx);border-radius:4px;font:600 11px "Segoe UI",sans-serif;cursor:pointer;padding:0}
  .ptzc-presets button:hover:not(:disabled){background:#414141;border-color:#666}
  .ptzc-presets button:disabled{opacity:.32;cursor:default}
  .ptzc-presets button.on{background:var(--ptzc-blue);border-color:#4e86f5;color:#fff}
  .ptzc-foot{display:flex;align-items:center;gap:8px;min-height:14px}
  .ptzc-hint{font-size:10px;color:var(--ptzc-mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ptzc.ptzc-mid .ptzc-side{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ptzc.ptzc-mid .ptzc-group.ptzc-speed{grid-column:span 2}
  .ptzc.ptzc-mid .ptzc-presets-group{grid-column:span 1}
  .ptzc.ptzc-mid .ptzc-proto{display:none}
  .ptzc.ptzc-narrow .ptzc-main{display:flex;flex-direction:column}
  .ptzc.ptzc-narrow .ptzc-right{display:contents}
  .ptzc.ptzc-narrow .ptzc-top{order:1;width:100%}
  .ptzc.ptzc-narrow .ptzc-pad{order:2;align-self:center}
  .ptzc.ptzc-narrow .ptzc-side{order:3;grid-template-columns:1fr;width:100%}
  .ptzc.ptzc-narrow .ptzc-group.ptzc-speed,.ptzc.ptzc-narrow .ptzc-presets-group{grid-column:span 1}
  .ptzc.ptzc-narrow .ptzc-proto{display:none}
  .ptzc.ptzc-narrow .ptzc-title span{display:none}`;

  root.mountPTZCompact = function (host, { base = '', inputs = () => [] } = {}) {
    host.replaceChildren();
    if (!document.getElementById('ptzc-style')) {
      const style = document.createElement('style');
      style.id = 'ptzc-style';
      style.textContent = CSS;
      document.head.append(style);
    }
    host.style.cssText += ';padding:0;box-sizing:border-box;overflow:auto';

    const wrap = document.createElement('div'); wrap.className = 'ptzc';
    const ICONS = {
      camera: '<svg class="ptzc-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="12" height="9" rx="2"/><circle cx="8" cy="9.5" r="2.4"/><path d="M5.5 5l1-2h3l1 2"/></svg>',
      speed: '<svg class="ptzc-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12a5.5 5.5 0 1 1 11 0"/><path d="M8 12l3-4"/><circle cx="8" cy="12" r="1"/></svg>',
      zoom: '<svg class="ptzc-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/><path d="M5 7h4M7 5v4"/></svg>',
      focus: '<svg class="ptzc-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="4.5"/><circle cx="8" cy="8" r="1.4"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2"/></svg>',
      home: '<svg class="ptzc-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l6-5 6 5v7H2z"/><path d="M6 14v-4h4v4"/></svg>',
      preset: '<svg class="ptzc-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h8v12l-4-3-4 3z"/></svg>'
    };
    const head = document.createElement('div'); head.className = 'ptzc-head';
    const title = document.createElement('span'); title.className = 'ptzc-title';
    title.innerHTML = '<i></i><b>3Mix</b><span>PTZ</span>';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'ptzc-open'; open.textContent = 'Abrir em janela';
    head.append(title, open);
    const top = document.createElement('div'); top.className = 'ptzc-top';
    const camera = document.createElement('div'); camera.className = 'ptzc-camera';
    const cameraRow = document.createElement('div'); cameraRow.className = 'ptzc-camera-row';
    const cameraLabel = document.createElement('span'); cameraLabel.className = 'ptzc-label'; cameraLabel.innerHTML = ICONS.camera + 'Câmera';
    const select = document.createElement('select'); select.className = 'ptzc-select';
    select.setAttribute('aria-label', 'Input PTZ');
    const gear = document.createElement('button'); gear.type = 'button'; gear.className = 'ptzc-gear';
    gear.textContent = '⚙'; gear.title = 'Configurar câmera na janela PTZ'; gear.setAttribute('aria-label', 'Abrir janela PTZ');
    const status = document.createElement('span'); status.className = 'ptzc-status'; status.setAttribute('role', 'status');
    const proto = document.createElement('span'); proto.className = 'ptzc-proto'; proto.textContent = '—';
    cameraRow.append(cameraLabel, select, gear);
    camera.append(cameraRow, status);
    top.append(camera, proto);

    const main = document.createElement('div'); main.className = 'ptzc-main';
    const pad = document.createElement('div'); pad.className = 'ptzc-pad';
    const right = document.createElement('div'); right.className = 'ptzc-right';
    const side = document.createElement('div'); side.className = 'ptzc-side';
    right.append(top, side);
    main.append(pad, right);

    const foot = document.createElement('div'); foot.className = 'ptzc-foot';
    const hint = document.createElement('span'); hint.className = 'ptzc-hint';
    hint.textContent = 'Segure para mover · solte para parar · STOP interrompe na hora';
    foot.append(hint);
    wrap.append(head, main, foot);
    host.append(wrap);

    // Responsividade pelo tamanho do DOCK, não da janela: o mesmo painel pode ter
    // 480 px (um terço), 640 px (metade) ou 900+ px (dock largo) na mesma janela 1920.
    const applyWidth = () => {
      const w = host.clientWidth || wrap.clientWidth || 0;
      wrap.classList.toggle('ptzc-wide', w >= 1180);
      wrap.classList.toggle('ptzc-mid', w >= 520 && w < 1180);
      wrap.classList.toggle('ptzc-narrow', w < 520);
    };
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(applyWidth); ro.observe(host); }
    applyWidth();

    let snapshot = null, disposed = false;
    const send = async (action, data) => {
      const response = await fetch(base + '/api/control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
        signal: AbortSignal.timeout(4000), keepalive: action === 'ptz_release'
      });
      const json = await response.json();
      if (!response.ok || json.success === false) throw Error(json.error || 'Falha no comando PTZ');
      return json.ptz;
    };
    const say = (error) => {
      status.className = 'ptzc-status err';
      status.textContent = error.message || String(error);
    };
    const hold = new root.PTZHold({ send, onError: say });
    const speedInput = document.createElement('input');
    speedInput.type = 'range'; speedInput.min = '10'; speedInput.max = '100'; speedInput.value = '40';
    speedInput.className = 'ptzc-speed'; speedInput.setAttribute('aria-label', 'Velocidade do movimento');
    const speedValue = document.createElement('span'); speedValue.className = 'ptzc-speedval'; speedValue.textContent = '40%';
    speedInput.addEventListener('input', () => { speedValue.textContent = speedInput.value + '%'; });
    const velocidade = () => Number(speedInput.value) / 100;

    const group = (label, ...children) => {
      const box = document.createElement('div'); box.className = 'ptzc-group';
      const title = document.createElement('span'); title.className = 'ptzc-label'; title.textContent = label;
      const row = document.createElement('div'); row.className = 'ptzc-row';
      row.append(...children); box.append(title, row); return box;
    };

    const bindHold = (button, command, data) => {
      button.disabled = true;
      const start = () => { if (!button.disabled && select.value) hold.start(select.value, command, { ...data, speed: velocidade() }); };
      button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        try { button.setPointerCapture(e.pointerId); } catch { /* synthetic pointer: release/blur still apply */ }
        start();
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(ev, () => hold.stop());
      button.addEventListener('keydown', (e) => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!e.repeat) start(); } });
      button.addEventListener('keyup', (e) => { if ([' ', 'Enter'].includes(e.key)) hold.stop(); });
      return button;
    };

    async function oneShot(action, data) {
      if (!select.value) return;
      try {
        const acquired = await send('ptz_acquire', { device: select.value, owner: 'PTZ dock' });
        try { await send(action, { ...data, device: select.value, token: acquired.token }); }
        finally { await send('ptz_release', { device: select.value, token: acquired.token }).catch(() => {}); }
      } catch (error) { say(error); }
    }

    const dirs = [
      ['↖', -1, 1, 1, 1], ['↑', 0, 1, 2, 1], ['↗', 1, 1, 3, 1],
      ['←', -1, 0, 1, 2], ['→', 1, 0, 3, 2],
      ['↙', -1, -1, 1, 3], ['↓', 0, -1, 2, 3], ['↘', 1, -1, 3, 3]
    ];
    for (const [label, pan, tilt, col, row] of dirs) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.disabled = true;
      b.style.gridColumn = String(col); b.style.gridRow = String(row);
      b.setAttribute('aria-label', 'Mover ' + label);
      bindHold(b, 'ptz_move', { pan, tilt });
      pad.append(b);
    }
    const stop = document.createElement('button');
    stop.type = 'button'; stop.textContent = 'STOP'; stop.className = 'ptzc-stop'; stop.disabled = true;
    stop.style.gridColumn = '2'; stop.style.gridRow = '2';
    stop.setAttribute('aria-label', 'Parar movimento');
    pad.append(stop);

    // Velocidade
    const speedGroup = document.createElement('div'); speedGroup.className = 'ptzc-group ptzc-speed';
    const speedLabel = document.createElement('span'); speedLabel.className = 'ptzc-label'; speedLabel.innerHTML = ICONS.speed + 'Velocidade';
    const speedRow = document.createElement('div'); speedRow.className = 'ptzc-speedrow';
    speedRow.append(speedInput, speedValue);
    speedGroup.append(speedLabel, speedRow);
    side.append(speedGroup);

    // Zoom
    const zoomGroup = document.createElement('div'); zoomGroup.className = 'ptzc-group';
    const zoomLabel = document.createElement('span'); zoomLabel.className = 'ptzc-label'; zoomLabel.innerHTML = ICONS.zoom + 'Zoom';
    const zoomRow = document.createElement('div'); zoomRow.className = 'ptzc-row';
    const zoomOut = document.createElement('button'); zoomOut.type = 'button'; zoomOut.textContent = 'W −';
    const zoomIn = document.createElement('button'); zoomIn.type = 'button'; zoomIn.textContent = '+ T';
    bindHold(zoomOut, 'ptz_zoom', { direction: -1 });
    bindHold(zoomIn, 'ptz_zoom', { direction: 1 });
    zoomRow.append(zoomOut, zoomIn); zoomGroup.append(zoomLabel, zoomRow);
    side.append(zoomGroup);

    // Foco
    const focusGroup = document.createElement('div'); focusGroup.className = 'ptzc-group';
    const focusLabel = document.createElement('span'); focusLabel.className = 'ptzc-label'; focusLabel.innerHTML = ICONS.focus + 'Foco';
    const focusRow = document.createElement('div'); focusRow.className = 'ptzc-row';
    const focusAuto = document.createElement('button'); focusAuto.type = 'button'; focusAuto.textContent = 'AUTO'; focusAuto.disabled = true;
    const focusNear = document.createElement('button'); focusNear.type = 'button'; focusNear.textContent = 'NEAR';
    const focusFar = document.createElement('button'); focusFar.type = 'button'; focusFar.textContent = 'FAR';
    bindHold(focusNear, 'ptz_focus', { direction: -1 });
    bindHold(focusFar, 'ptz_focus', { direction: 1 });
    focusAuto.addEventListener('click', () => oneShot('ptz_focus_mode', { auto: true }));
    focusRow.append(focusAuto, focusNear, focusFar); focusGroup.append(focusLabel, focusRow);
    side.append(focusGroup);

    // Posição
    const homeGroup = document.createElement('div'); homeGroup.className = 'ptzc-group';
    const homeLabel = document.createElement('span'); homeLabel.className = 'ptzc-label'; homeLabel.innerHTML = ICONS.home + 'Posição';
    const homeRow = document.createElement('div'); homeRow.className = 'ptzc-row';
    const home = document.createElement('button'); home.type = 'button'; home.textContent = 'HOME'; home.disabled = true;
    home.addEventListener('click', () => oneShot('ptz_home', {}));
    homeRow.append(home); homeGroup.append(homeLabel, homeRow);
    side.append(homeGroup);

    // Presets
    const presetsGroup = document.createElement('div'); presetsGroup.className = 'ptzc-group ptzc-presets-group';
    const presetsLabel = document.createElement('span'); presetsLabel.className = 'ptzc-label'; presetsLabel.innerHTML = ICONS.preset + 'Presets';
    const presets = document.createElement('div'); presets.className = 'ptzc-presets';
    const presetButtons = [];
    for (let n = 1; n <= 6; n++) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = String(n); b.disabled = true;
      b.addEventListener('click', () => {
        for (const x of presetButtons) x.classList.remove('on');
        b.classList.add('on');
        oneShot('ptz_preset_recall', { number: n - 1 });
      });
      presets.append(b); presetButtons.push(b);
    }
    presetsGroup.append(presetsLabel, presets);
    side.append(presetsGroup);

    const allControls = () => [...pad.querySelectorAll('button'), zoomOut, zoomIn, focusAuto, focusNear, focusFar, home, ...presetButtons];
    const setEnabled = (enabled) => { for (const b of allControls()) b.disabled = !enabled; };

    stop.addEventListener('click', async () => {
      await hold.stop();
      await oneShot('ptz_stop', {});
    });

    const openWindow = async () => {
      try {
        await fetch(base + '/api/panel-open', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ route: '/ptz' })
        });
      } catch (error) { say(error); }
    };
    open.addEventListener('click', openWindow);
    gear.addEventListener('click', openWindow);

    select.onchange = () => { hold.stop(); paint(); };
    function paint() {
      const selected = snapshot?.devices?.find((d) => d.id === select.value);
      const protocolos = { 'visca-tcp': 'VISCA over TCP', 'visca-udp': 'VISCA over UDP', onvif: 'ONVIF' };
      proto.textContent = selected ? (protocolos[selected.protocol] || selected.protocol) : '—';
      if (!selected) {
        status.className = 'ptzc-status' + (snapshot?.devices?.length ? '' : ' warn');
        status.textContent = snapshot?.devices?.length
          ? 'Selecione a câmera'
          : 'Sem Input PTZ vinculado — vincule na janela PTZ';
        setEnabled(false);
        return;
      }
      status.className = 'ptzc-status' + (selected.lastError ? ' err' : selected.connected ? ' ok' : ' warn');
      status.textContent = selected.lastError || (selected.connected ? 'Conectada' : 'Não conectada — o movimento testa a conexão');
      setEnabled(true);
    }

    async function refresh() {
      try {
        const response = await fetch(base + '/api/ptz', { signal: AbortSignal.timeout(4000) });
        const json = await response.json();
        if (!response.ok || !json.success) throw Error(json.error || 'PTZ indisponível');
        if (disposed) return;
        snapshot = json.ptz;
        const previous = select.value;
        const linked = [];
        for (const input of inputs()) {
          const id = snapshot.links?.[input.key];
          if (snapshot.devices?.some((d) => d.id === id) && !linked.some((l) => l.id === id)) linked.push({ id, name: input.name });
        }
        select.replaceChildren();
        if (!linked.length) {
          const empty = new Option('Nenhum Input vinculado', '');
          empty.disabled = true; select.add(empty);
        } else {
          select.add(new Option('Selecione a câmera…', ''));
          for (const item of linked) select.add(new Option(item.name, item.id));
          if (linked.some((l) => l.id === previous)) select.value = previous;
        }
        paint();
      } catch (error) {
        say(error);
        hold.stop();
        setEnabled(false);
      }
    }

    refresh();
    const timer = setInterval(refresh, 2500);
    const cancel = () => hold.stop();
    window.addEventListener('blur', cancel);
    window.addEventListener('pagehide', cancel);
    const hidden = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hidden);

    return {
      refresh, cancel,
      dispose() {
        disposed = true; clearInterval(timer); cancel();
        if (ro) ro.disconnect();
        window.removeEventListener('blur', cancel);
        window.removeEventListener('pagehide', cancel);
        document.removeEventListener('visibilitychange', hidden);
      }
    };
  };
})(window);
