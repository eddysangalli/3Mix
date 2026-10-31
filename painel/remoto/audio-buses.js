'use strict';

/* 3Mix · Áudio — roteamento entradas → buses → saídas físicas, ASIO e barramentos.
   Nenhuma engine paralela: cada alteração pendente vira um comando do
   controlador existente (/api/control) quando o operador aplica. */
(() => {
  const E = id => document.getElementById(id);
  const AUDIO = window.AudioDesk;
  if (!AUDIO) return;

  const draft = { inputs: new Map(), buses: new Map(), outputs: new Map(), asio: null, returns: new Map() };
  let selectedBus = '';
  let inputsSig = '';
  let outputsSig = '';
  let membersSig = '';
  let asioRoutesSig = '';
  let devicesSignature = '';
  let lastApply = null;
  let scopeSeen = '';

  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stateOf = () => AUDIO.getState();
  const jsonOf = () => AUDIO.getJson?.() || null;
  const routingOf = () => stateOf()?.routing || null;
  const levelToDb = value => (Number(value) > 0 ? 20 * Math.log10(Number(value) / 100) : -60);
  const dbToLevel = db => Math.max(0, Math.min(100, Math.round(100 * Math.pow(10, Number(db) / 20))));
  const gainToDb = gain => (Number(gain) > 0 ? 20 * Math.log10(Number(gain)) : -60);
  const dbToGain = db => Math.max(0, Math.min(2, Number((Math.pow(10, Number(db) / 20)).toFixed(3))));
  const fmtDb = db => (Number(db) <= -59.9 ? '−∞' : (Number(db) > 0 ? '+' : '') + Number(db).toFixed(1)) + ' dB';

  function options(select, rows, selected, placeholder) {
    if (!select) return;
    select.replaceChildren();
    if (placeholder !== undefined) select.add(new Option(placeholder, ''));
    for (const row of rows || []) select.add(new Option(row.label || row.name, row.key || row.id));
    if (selected !== undefined && [...select.options].some(option => option.value === selected)) select.value = selected;
  }

  /* ---------------------------------------------------------------- */
  /* Pendências                                                        */
  /* ---------------------------------------------------------------- */

  function pendingItems() {
    const items = [];

    for (const [name, change] of draft.inputs) {
      items.push({
        id: 'input:' + name,
        label: 'Rotas de ' + name,
        apply: async () => {
          for (const bus of ['M', 'A', 'B']) {
            const before = change.base.has(bus);
            const after = change.routes.has(bus);
            if (before === after) continue;
            await AUDIO.send('audio_bus', { input: name, bus, enabled: after });
          }
          draft.inputs.delete(name);
        }
      });
    }

    for (const [busKey, change] of draft.buses) {
      items.push({
        id: 'bus:' + busKey,
        label: 'Barramento ' + (change.name || busKey),
        apply: async () => {
          const members = [...change.members.entries()].map(([key, gainDb]) => ({ key, gain: dbToGain(gainDb) }));
          await AUDIO.send('audio_routing_bus_members', { key: busKey, members });
          await AUDIO.send('audio_routing_bus_volume', { key: busKey, volumeDb: Number(change.volumeDb) });
          await AUDIO.send('audio_routing_bus_route', { key: busKey, routes: [...change.routes] });
          draft.buses.delete(busKey);
        }
      });
    }

    for (const [targetKey, change] of draft.outputs) {
      items.push({
        id: 'out:' + targetKey,
        label: 'Saída física · ' + change.name,
        apply: async () => {
          if (!change.device) throw Error('Escolha a interface física de ' + change.name);
          await AUDIO.send('audio_routing_direct', {
            key: targetKey,
            device: change.device,
            volume: dbToLevel(change.db),
            delayMs: Math.max(0, Math.min(2000, Math.round(Number(change.delay) || 0))),
            enabled: !!change.enabled
          });
          draft.outputs.delete(targetKey);
        }
      });
    }

    if (draft.asio) {
      items.push({
        id: 'asio',
        label: 'Configuração ASIO',
        apply: async () => {
          const routes = draft.asio.routes || [];
          if (!routes.length) throw Error('Adicione ao menos uma rota estéreo ASIO');
          const bufferFrames = Number(draft.asio.bufferFrames) || 0;
          if (bufferFrames !== 0 && (bufferFrames < 16 || bufferFrames > 8192)) throw Error('Buffer ASIO: 0 (automático) ou 16–8192 frames');
          const used = new Set();
          for (const route of routes) {
            const left = Number(route.left);
            const right = Number(route.right);
            if (!route.key) throw Error('Escolha a fonte de cada rota ASIO');
            if (![left, right].every(value => Number.isInteger(value) && value >= 0 && value <= 255) || left === right) throw Error('Canais ASIO inválidos em uma rota');
            if (used.has(left) || used.has(right)) throw Error('Canais ASIO repetidos entre rotas');
            used.add(left);
            used.add(right);
          }
          await AUDIO.send('audio_routing_asio_output_configure', {
            driverId: draft.asio.driverId,
            bufferFrames,
            routes: routes.map(route => ({
              key: route.key,
              left: Number(route.left),
              right: Number(route.right),
              gain: dbToGain(route.gainDb)
            }))
          });
          draft.asio = null;
        }
      });
    }

    for (const [feedId, change] of draft.returns) {
      items.push({
        id: 'return:' + feedId,
        label: 'Retorno ' + (change.name || feedId),
        apply: async () => {
          await AUDIO.send('return_feed_configure', {
            feedId,
            audioMode: change.audioMode,
            nMinusExclude: change.nMinusExclude || null,
            latencyMs: Number(change.latencyMs) || 300
          });
          draft.returns.delete(feedId);
        }
      });
    }

    return items;
  }

  const pendingCount = () => pendingItems().length;
  const hasPending = () => pendingCount() > 0;

  function changed() {
    document.dispatchEvent(new CustomEvent('audio:draft'));
  }

  async function applyAll() {
    const items = pendingItems();
    if (!items.length) return { applied: 0, failed: 0 };
    let applied = 0;
    const errors = [];
    for (const item of items) {
      try {
        await item.apply();
        applied++;
      } catch (error) {
        errors.push(`${item.label}: ${error.message}`);
      }
    }
    lastApply = { applied, errors };
    await refresh();
    return { applied, failed: errors.length, errors };
  }

  function discard() {
    draft.inputs.clear();
    draft.buses.clear();
    draft.outputs.clear();
    draft.asio = null;
    draft.returns.clear();
    changed();
    render();
  }

  async function refresh() {
    try { await AUDIO.poll(true); } catch { /* a mensagem já aparece no rodapé */ }
    document.dispatchEvent(new CustomEvent('audio:request-json'));
  }

  async function immediate(action, data, successText) {
    try {
      await AUDIO.send(action, data);
      AUDIO.toast(successText, 'ok');
      await refresh();
      return true;
    } catch (error) {
      AUDIO.toast(error.message, 'error');
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Entradas → buses                                                  */
  /* ---------------------------------------------------------------- */

  function channelRows() {
    const json = jsonOf();
    if (!json) return [];
    const director = json.calls?.director?.name;
    const programInputFor = name => (json.inputs || []).find(input => input.name === name)
      || (json.inputs || []).find(input => (input.sources || []).includes(name))
      || (json.inputs || []).find(input => input.name === name.replace(/\s*\(fonte\)$/i, ''));
    return (json.audioInputs || []).filter(channel =>
      !channel.bus &&
      channel.kind !== 'mix-track-to-source' &&
      channel.kind !== 'freemix_audio_bus' &&
      !/^(?:FreeMix|3Mix)\s+(?:N1|Retorno)\b/i.test(String(channel.name || ''))
    ).map(channel => ({
      name: channel.name,
      private: channel.name === director,
      muted: channel.muted,
      routes: new Set(String(programInputFor(channel.name)?.audioBuses || '').split(',').filter(Boolean))
    }));
  }

  function renderInputs() {
    const tbody = E('routing-inputs-body');
    if (!tbody) return;
    const rows = channelRows();
    const signature = JSON.stringify(rows.map(row => [row.name, row.private]));
    if (signature !== inputsSig) {
      inputsSig = signature;
      tbody.replaceChildren();
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Nenhuma entrada de áudio confirmada pelo motor.</td></tr>';
      }
      for (const row of rows) {
        const tr = document.createElement('tr');
        tr.dataset.channel = row.name;
        const nameCell = document.createElement('td');
        const name = document.createElement('span');
        name.className = 'cell-name';
        name.textContent = row.name;
        nameCell.append(name);
        const tag = document.createElement('span');
        tag.className = 'mini-tag';
        tag.textContent = row.private ? 'PRIV' : (AUDIO.categoryLabel(row) || 'CH');
        nameCell.append(tag);
        tr.append(nameCell);
        for (const bus of ['M', 'A', 'B']) {
          const cell = document.createElement('td');
          cell.className = 'c';
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.dataset.routeBus = bus;
          box.disabled = row.private;
          box.title = row.private ? 'Mic privado da Calls: rota controlada pela central' : 'Enviar para ' + (bus === 'M' ? 'Master' : 'barramento ' + bus);
          cell.append(box);
          tr.append(cell);
        }
        const status = document.createElement('td');
        status.className = 'row-status';
        tr.append(status);
        tbody.append(tr);
      }
    }

    for (const row of rows) {
      const tr = tbody.querySelector(`tr[data-channel="${CSS.escape(row.name)}"]`);
      if (!tr) continue;
      const change = draft.inputs.get(row.name);
      const routes = change ? change.routes : row.routes;
      for (const box of tr.querySelectorAll('[data-route-bus]')) {
        if (document.activeElement !== box) box.checked = routes.has(box.dataset.routeBus);
      }
      const status = tr.querySelector('.row-status');
      if (status) {
        status.textContent = change ? 'pendente' : (row.private ? 'somente leitura' : (routes.size ? [...routes].join(' · ') : 'sem destino'));
        status.dataset.tone = change ? 'pending' : (row.private ? 'locked' : 'ok');
      }
    }

    const count = E('routing-inputs-status');
    if (count) count.textContent = `${rows.filter(row => !row.private).length} canais editáveis`;
  }

  /* ---------------------------------------------------------------- */
  /* Buses independentes                                               */
  /* ---------------------------------------------------------------- */

  const busList = () => routingOf()?.buses || [];

  function busState(bus) {
    const change = draft.buses.get(bus.key);
    if (change) return change;
    return {
      name: bus.label || bus.name,
      members: new Map((bus.members || []).map(member => [member.key, gainToDb(member.gain)])),
      volumeDb: Number(bus.volumeDb ?? 0),
      routes: new Set(bus.routes || [])
    };
  }

  function renderBuses() {
    const buses = busList();
    const select = E('bus-select');
    if (!select) return;
    const options2 = buses.map(bus => ({ key: bus.key, label: bus.label || bus.name }));
    const signature = JSON.stringify(options2.map(option => option.key));
    if (select.dataset.signature !== signature) {
      select.dataset.signature = signature;
      options(select, options2, selectedBus);
    }
    if (!buses.some(bus => bus.key === selectedBus)) selectedBus = buses[0]?.key || '';
    if (select.value !== selectedBus && [...select.options].some(option => option.value === selectedBus)) select.value = selectedBus;

    const bus = buses.find(item => item.key === selectedBus);
    const statusEl = E('bus-status');
    if (statusEl) statusEl.textContent = buses.length ? `${buses.length}/8 barramentos` : 'nenhum barramento independente';

    const memberBox = E('bus-members');
    if (!memberBox) return;
    const sources = routingOf()?.sources || [];
    const current = bus ? busState(bus) : { name: '', members: new Map(), volumeDb: 0, routes: new Set() };
    const memberSignature = JSON.stringify([bus?.key || '', sources.map(source => [source.key, source.name]), changeSignature(draft.buses.get(selectedBus))]);
    if (memberSignature !== membersSig) {
      membersSig = memberSignature;
      memberBox.replaceChildren();
      if (!bus) {
        memberBox.innerHTML = '<p class="table-empty">Crie um barramento para escolher as fontes.</p>';
      } else {
        for (const source of sources) {
          const row = document.createElement('label');
          row.className = 'member-row';
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.dataset.member = source.key;
          box.checked = current.members.has(source.key);
          const name = document.createElement('span');
          name.textContent = source.name;
          name.className = 'member-name';
          const gain = document.createElement('span');
          gain.className = 'member-gain';
          const input = document.createElement('input');
          input.type = 'number';
          input.min = -60;
          input.max = 6;
          input.step = 0.5;
          input.dataset.memberGain = source.key;
          input.value = (current.members.get(source.key) ?? 0).toFixed(1);
          input.disabled = !box.checked;
          const unit = document.createElement('span');
          unit.textContent = 'dB';
          gain.append(input, unit);
          row.append(box, name, gain);
          memberBox.append(row);
        }
        if (!sources.length) memberBox.innerHTML = '<p class="table-empty">Nenhuma fonte pública disponível para o barramento.</p>';
      }
    }

    for (const row of memberBox.querySelectorAll('.member-row')) {
      const box = row.querySelector('[data-member]');
      if (!box) continue;
      const input = row.querySelector('[data-member-gain]');
      const change = draft.buses.get(selectedBus);
      const checked = change ? change.members.has(box.dataset.member) : current.members.has(box.dataset.member);
      const value = change ? change.members.get(box.dataset.member) : current.members.get(box.dataset.member);
      if (document.activeElement !== box) box.checked = checked;
      if (input) {
        input.disabled = !checked;
        if (document.activeElement !== input) input.value = Number(value ?? 0).toFixed(1);
      }
    }

    const volume = E('bus-volume');
    if (volume && document.activeElement !== volume) volume.value = current.volumeDb;
    const routesBox = E('bus-routes');
    if (routesBox && routesBox.dataset.signature !== String(bus?.key || '')) {
      routesBox.dataset.signature = String(bus?.key || '');
      routesBox.replaceChildren();
      const label = document.createElement('span');
      label.className = 'bus-routes-label';
      label.textContent = 'Rotas';
      routesBox.append(label);
      for (const route of ['M', 'A', 'B']) {
        const item = document.createElement('label');
        item.className = 'check-line';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.dataset.busRoute = route;
        box.checked = current.routes.has(route);
        const text = document.createElement('span');
        text.textContent = route === 'M' ? 'Master' : 'Barramento ' + route;
        item.append(box, text);
        routesBox.append(item);
      }
    }
    for (const box of routesBox?.querySelectorAll('[data-bus-route]') || []) {
      const change = draft.buses.get(selectedBus);
      const routes = change ? change.routes : current.routes;
      if (document.activeElement !== box) box.checked = routes.has(box.dataset.busRoute);
    }
    for (const id of ['bus-volume', 'bus-remove']) {
      const control = E(id);
      if (control) control.disabled = !bus;
    }
    for (const control of memberBox.querySelectorAll('input')) control.disabled = control.disabled || !bus;
  }

  function changeSignature(change) {
    if (!change) return '';
    return JSON.stringify([
      [...change.members.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      change.volumeDb,
      [...change.routes]
    ]);
  }

  function writeBusDraft(busKey, mutate) {
    const bus = busList().find(item => item.key === busKey);
    if (!bus) return;
    const current = busState(bus);
    const copy = { name: current.name, members: new Map(current.members), volumeDb: current.volumeDb, routes: new Set(current.routes) };
    mutate(copy);
    draft.buses.set(busKey, copy);
    changed();
    renderBuses();
  }

  /* ---------------------------------------------------------------- */
  /* Saídas físicas                                                    */
  /* ---------------------------------------------------------------- */

  function renderOutputs() {
    const tbody = E('routing-outputs-body');
    if (!tbody) return;
    const routing = routingOf();
    if (!routing) return;
    const devices = routing.capabilities?.renderDevices || [];
    const inventoryKnown = routing.capabilities?.renderInventoryKnown === true;
    const buses = routing.buses || [];
    const sources = routing.sources || [];

    const rows = [
      { key: 'M', name: 'Master de produção', group: 'mix', locked: true, note: 'Sai no encoder/gravação' },
      { key: 'A', name: 'Barramento A', group: 'mix', locked: true, note: 'Bus interno do motor' },
      { key: 'B', name: 'Barramento B', group: 'mix', locked: true, note: 'Bus interno do motor' },
      ...buses.map(bus => ({ key: bus.key, name: bus.label || bus.name, group: 'bus', locked: false })),
      ...sources.map(source => ({ key: source.key, name: source.name, group: 'source', locked: false }))
    ];

    const signature = JSON.stringify([rows.map(row => [row.key, row.name, row.locked]), devices.map(device => device.id)]);
    if (signature !== outputsSig) {
      outputsSig = signature;
      tbody.replaceChildren();
      for (const row of rows) {
        const tr = document.createElement('tr');
        tr.dataset.target = row.key;
        tr.dataset.group = row.group;

        const target = document.createElement('td');
        const name = document.createElement('span');
        name.className = 'cell-name';
        name.textContent = row.name;
        target.append(name);
        const tag = document.createElement('span');
        tag.className = 'mini-tag';
        tag.textContent = row.group === 'mix' ? 'PGM/BUS' : row.group === 'bus' ? 'BUS' : 'FONTE';
        target.append(tag);
        tr.append(target);

        const deviceCell = document.createElement('td');
        const select = document.createElement('select');
        select.className = 'device-select';
        select.dataset.device = '';
        options(select, devices, '', inventoryKnown ? '(nenhuma)' : '(consulte dispositivos)');
        select.disabled = row.locked || !inventoryKnown;
        deviceCell.append(select);
        tr.append(deviceCell);

        const channelCell = document.createElement('td');
        channelCell.className = 'channel-pair';
        channelCell.textContent = '—';
        tr.append(channelCell);

        const levelCell = document.createElement('td');
        const level = document.createElement('input');
        level.type = 'number';
        level.min = -60;
        level.max = 0;
        level.step = 0.5;
        level.value = 0;
        level.dataset.level = '';
        level.disabled = row.locked || !inventoryKnown;
        levelCell.append(level);
        tr.append(levelCell);

        const delayCell = document.createElement('td');
        const delay = document.createElement('input');
        delay.type = 'number';
        delay.min = 0;
        delay.max = 2000;
        delay.step = 10;
        delay.value = 0;
        delay.dataset.delay = '';
        delay.disabled = row.locked || !inventoryKnown;
        delayCell.append(delay);
        tr.append(delayCell);

        const activeCell = document.createElement('td');
        activeCell.className = 'c';
        const active = document.createElement('input');
        active.type = 'checkbox';
        active.dataset.active = '';
        active.disabled = row.locked || !inventoryKnown;
        activeCell.append(active);
        tr.append(activeCell);

        const statusCell = document.createElement('td');
        statusCell.className = 'row-status';
        tr.append(statusCell);
        tbody.append(tr);
      }
    }

    const directList = routing.directOut || [];
    for (const row of rows) {
      const tr = tbody.querySelector(`tr[data-target="${CSS.escape(row.key)}"]`);
      if (!tr) continue;
      const saved = directList.find(item => item.key === row.key);
      const change = draft.outputs.get(row.key);
      const device = tr.querySelector('[data-device]');
      const channel = tr.querySelector('.channel-pair');
      const level = tr.querySelector('[data-level]');
      const delay = tr.querySelector('[data-delay]');
      const active = tr.querySelector('[data-active]');
      const status = tr.querySelector('.row-status');

      if (row.locked) {
        if (device) device.value = '';
        if (channel) channel.textContent = '—';
        if (level) level.value = 0;
        if (delay) delay.value = 0;
        if (active) active.checked = false;
        status.textContent = 'fora do roteamento físico';
        status.dataset.tone = 'locked';
        continue;
      }

      const current = change || {
        device: saved?.device || '',
        db: saved ? levelToDb(saved.volume) : 0,
        delay: saved?.delayMs ?? 0,
        enabled: !!saved?.enabled,
        name: row.name
      };
      if (device && document.activeElement !== device) device.value = current.device || '';
      if (level && document.activeElement !== level) level.value = Number(current.db).toFixed(1);
      if (delay && document.activeElement !== delay) delay.value = current.delay ?? 0;
      if (active && document.activeElement !== active) active.checked = !!current.enabled;
      const deviceName = devices.find(item => item.id === current.device)?.name;
      channel.textContent = current.device ? '1–2' : '—';
      channel.title = deviceName ? `${deviceName} · 1–2` : 'Par estéreo do Audio Monitor';
      status.textContent = change
        ? 'pendente'
        : current.enabled && deviceName
          ? `${deviceName} · 1–2`
          : current.device
            ? 'configurado, inativo'
            : 'sem saída física';
      status.dataset.tone = change ? 'pending' : current.enabled && current.device ? 'ok' : 'off';
    }

    const caps = routing.capabilities || {};
    const capEl = E('routing-capabilities');
    if (capEl) {
      capEl.textContent = caps.renderInventoryKnown
        ? `${devices.length} interface(s) de reprodução consultada(s)`
        : 'Dispositivos ainda não consultados';
      capEl.dataset.tone = caps.renderInventoryKnown ? 'ok' : 'pending';
    }
    E('refresh-devices')?.classList.toggle('attention', !caps.renderInventoryKnown);
  }

  /* ---------------------------------------------------------------- */
  /* ASIO                                                              */
  /* ---------------------------------------------------------------- */

  function asioSourceOptions() {
    const routing = routingOf();
    if (!routing) return [];
    const sources = (routing.sources || []).filter(source => !['asio_input_capture', 'wasapi_output_capture', 'wasapi_process_output_capture'].includes(source.kind));
    const buses = (routing.buses || []).filter(bus => !(bus.routes || []).length);
    return [...sources, ...buses.map(bus => ({ key: bus.key, name: (bus.label || bus.name) + ' (bus)' }))];
  }

  function asioConfig() {
    const output = routingOf()?.asioOutput;
    const saved = routingOf()?.asioOutputConfig;
    if (draft.asio) return draft.asio;
    if (!output) return null;
    if (output.configured) {
      return {
        driverId: output.driverId || '',
        bufferFrames: output.configuredBufferFrames ?? 0,
        routes: (output.routes || []).map(route => ({ key: route.uuid, left: route.left, right: route.right, gainDb: gainToDb(route.gain) }))
      };
    }
    return {
      driverId: saved?.driverId || '',
      bufferFrames: saved?.bufferFrames ?? 0,
      routes: (saved?.routes || []).map(route => ({ key: route.key || route.uuid, left: route.left, right: route.right, gainDb: gainToDb(route.gain) }))
    };
  }

  function addAsioRoute(row = {}) {
    const box = E('asio-output-routes');
    if (!box || box.children.length >= 8) return;
    const config = draft.asio || asioConfig() || { routes: [] };
    config.routes = config.routes || [];
    config.routes.push({
      key: row.key || row.uuid || '',
      left: row.left ?? box.children.length * 2,
      right: row.right ?? box.children.length * 2 + 1,
      gainDb: row.gainDb ?? gainToDb(row.gain ?? 1)
    });
    draft.asio = config;
    changed();
    renderAsio();
  }

  function renderAsio() {
    const output = routingOf()?.asioOutput;
    const routing = routingOf();
    if (!routing) return;
    const config = asioConfig();
    const status = E('asio-output-status');
    const cap = routing.capabilities || {};

    if (!output) {
      if (status) {
        status.textContent = 'Playback ASIO indisponível neste motor';
        status.dataset.tone = 'off';
      }
      for (const id of ['asio-output-add', 'asio-output-start', 'asio-output-stop', 'asio-output-panel', 'asio-output-driver', 'asio-output-buffer']) {
        const control = E(id);
        if (control) control.disabled = true;
      }
      const box = E('asio-output-routes');
      if (box) box.innerHTML = '<p class="table-empty">O motor não expõe saída ASIO nesta build.</p>';
      return;
    }

    const drivers = output.drivers || [];
    const driverSignature = JSON.stringify([drivers.map(driver => [driver.id, driver.name]), output.inventoryKnown, (cap.asioDrivers || []).map(driver => [driver.id, driver.name]), cap.asioInventoryKnown]);
    if (driverSignature !== devicesSignature) {
      devicesSignature = driverSignature;
      options(E('asio-output-driver'), drivers, config?.driverId || '', output.inventoryKnown ? '(nenhum)' : '(consulte dispositivos)');
      options(E('asio-device'), cap.asioDrivers || [], E('asio-device')?.value || '', cap.asioInventoryKnown ? '(nenhum)' : '(consulte dispositivos)');
    }

    if (E('asio-output-driver') && document.activeElement !== E('asio-output-driver')) {
      E('asio-output-driver').value = config?.driverId || '';
    }
    if (E('asio-output-buffer') && document.activeElement !== E('asio-output-buffer')) {
      E('asio-output-buffer').value = config?.bufferFrames ?? 0;
    }

    const routes = config?.routes || [];
    const routesSignature = JSON.stringify([routes.map(route => [route.key, route.left, route.right, route.gainDb]), asioSourceOptions().map(source => source.key)]);
    if (routesSignature !== asioRoutesSig) {
      asioRoutesSig = routesSignature;
      const box = E('asio-output-routes');
      if (box) {
        box.replaceChildren();
        for (const [index, route] of routes.entries()) {
          const row = document.createElement('div');
          row.className = 'asio-route';
          const select = document.createElement('select');
          select.dataset.asioSource = '';
          options(select, asioSourceOptions(), route.key, '(fonte)');
          row.append(select);
          for (const [field, title, value, min, max] of [
            ['left', 'Canal L (0 = primeiro canal do driver)', route.left, 0, 255],
            ['right', 'Canal R (0 = primeiro canal do driver)', route.right, 0, 255],
            ['gainDb', 'Ganho da rota em dB', route.gainDb, -60, 6]
          ]) {
            const input = document.createElement('input');
            input.type = 'number';
            input.dataset.asioField = field;
            input.min = min;
            input.max = max;
            input.step = field === 'gainDb' ? 0.5 : 1;
            input.value = field === 'gainDb' ? Number(value).toFixed(1) : value;
            input.title = title;
            row.append(input);
          }
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'btn-ghost danger';
          remove.textContent = '×';
          remove.title = 'Remover esta rota';
          remove.dataset.asioRemove = String(index);
          row.append(remove);
          box.append(row);
        }
        if (!routes.length) box.innerHTML = '<p class="table-empty">Nenhuma rota configurada. Adicione uma rota estéreo.</p>';
      }
    }

    const active = output.running;
    for (const control of document.querySelectorAll('#asio-output-routes input,#asio-output-routes select,#asio-output-routes button')) control.disabled = active;
    for (const id of ['asio-output-driver', 'asio-output-buffer', 'asio-output-add']) {
      const control = E(id);
      if (control) control.disabled = active || !output.inventoryKnown || !drivers.length;
    }
    if (E('asio-output-start')) E('asio-output-start').disabled = active || !output.configured || !!draft.asio || !!output.error && output.fault > 0;
    if (E('asio-output-stop')) E('asio-output-stop').disabled = !active;
    if (E('asio-output-panel')) E('asio-output-panel').disabled = !active;

    if (status) {
      const parts = [active ? '● ASIO ativo' : output.configured ? '○ ASIO configurado, parado' : '○ ASIO não configurado'];
      if (output.configured) parts.push(`buffer ${output.configuredBufferFrames || 0} frames`);
      if (output.sampleRate) parts.push(`${(output.sampleRate / 1000).toFixed(1)} kHz`);
      if (active) parts.push(`latência ${Number(output.outputLatencyMs || 0).toFixed(1)} ms`);
      if (output.error) parts.push(output.error);
      status.textContent = parts.join(' · ');
      status.dataset.tone = output.error ? 'error' : active ? 'ok' : 'off';
    }

    const asioStatus = E('asio-status');
    if (asioStatus) {
      asioStatus.textContent = !cap.asio
        ? 'Captura ASIO indisponível neste motor'
        : cap.asioInventoryKnown !== true
          ? 'Drivers ASIO de captura ainda não consultados'
          : `${(cap.asioDrivers || []).length} driver(s) de captura`;
      asioStatus.dataset.tone = !cap.asio ? 'off' : cap.asioInventoryKnown !== true ? 'pending' : 'ok';
    }
    const create = E('asio-create');
    if (create) create.disabled = !cap.asio || cap.asioInventoryKnown !== true || !(cap.asioDrivers || []).some(driver => driver.id === E('asio-device')?.value);
  }

  /* ---------------------------------------------------------------- */
  /* Render geral                                                      */
  /* ---------------------------------------------------------------- */

  function render() {
    if (!AUDIO.getState()?.routing) return;
    const scope = String(AUDIO.getState()?.scope || '');
    if (scopeSeen && scope && scope !== scopeSeen) {
      const hadDraft = draft.inputs.size || draft.buses.size || draft.outputs.size || draft.returns.size || draft.asio;
      draft.inputs.clear();
      draft.buses.clear();
      draft.outputs.clear();
      draft.returns.clear();
      draft.asio = null;
      selectedBus = '';
      inputsSig = outputsSig = membersSig = asioRoutesSig = '';
      if (hadDraft) {
        changed();
        AUDIO.toast('Produção mudou: as alterações pendentes foram descartadas.', 'warn');
      }
    }
    if (scope) scopeSeen = scope;
    renderInputs();
    renderBuses();
    renderOutputs();
    renderAsio();
  }

  /* ---------------------------------------------------------------- */
  /* Eventos                                                           */
  /* ---------------------------------------------------------------- */

  E('routing-inputs-body')?.addEventListener('change', event => {
    const box = event.target.closest('[data-route-bus]');
    if (!box) return;
    const tr = box.closest('tr');
    const name = tr?.dataset.channel;
    if (!name) return;
    const row = channelRows().find(item => item.name === name);
    if (!row) return;
    const change = draft.inputs.get(name) || { base: new Set(row.routes), routes: new Set(row.routes) };
    if (box.checked) change.routes.add(box.dataset.routeBus);
    else change.routes.delete(box.dataset.routeBus);
    if ([...change.routes].join() === [...change.base].join()) draft.inputs.delete(name);
    else draft.inputs.set(name, change);
    changed();
    renderInputs();
  });

  E('bus-select')?.addEventListener('change', event => {
    selectedBus = event.target.value;
    membersSig = '';
    renderBuses();
  });

  E('bus-members')?.addEventListener('change', event => {
    if (!selectedBus) return;
    const member = event.target.closest('[data-member]');
    const gain = event.target.closest('[data-member-gain]');
    if (member) {
      writeBusDraft(selectedBus, change => {
        if (member.checked) change.members.set(member.dataset.member, 0);
        else change.members.delete(member.dataset.member);
      });
    } else if (gain) {
      writeBusDraft(selectedBus, change => change.members.set(gain.dataset.memberGain, Number(gain.value) || 0));
    }
  });
  E('bus-members')?.addEventListener('input', event => {
    const gain = event.target.closest('[data-member-gain]');
    if (gain && selectedBus && draft.buses.has(selectedBus)) {
      draft.buses.get(selectedBus).members.set(gain.dataset.memberGain, Number(gain.value) || 0);
      changed();
    }
  });

  E('bus-volume')?.addEventListener('change', event => {
    if (!selectedBus) return;
    writeBusDraft(selectedBus, change => { change.volumeDb = Number(event.target.value) || 0; });
  });

  E('bus-routes')?.addEventListener('change', event => {
    const box = event.target.closest('[data-bus-route]');
    if (!box || !selectedBus) return;
    writeBusDraft(selectedBus, change => {
      if (box.checked) change.routes.add(box.dataset.busRoute);
      else change.routes.delete(box.dataset.busRoute);
    });
  });

  E('bus-create')?.addEventListener('click', async () => {
    const name = String(E('bus-name')?.value || '').trim();
    if (!name) { AUDIO.toast('Informe o nome do novo barramento.', 'warn'); return; }
    const ok = await immediate('audio_routing_bus_create', { name, members: [] }, 'Barramento criado no motor.');
    if (ok && E('bus-name')) E('bus-name').value = '';
  });

  E('bus-remove')?.addEventListener('click', async () => {
    const bus = busList().find(item => item.key === selectedBus);
    if (!bus) return;
    if (!confirm(`Excluir o barramento "${bus.label || bus.name}" do motor?`)) return;
    draft.buses.delete(bus.key);
    selectedBus = '';
    membersSig = '';
    await immediate('audio_routing_bus_remove', { key: bus.key }, 'Barramento removido.');
  });

  E('routing-outputs-body')?.addEventListener('change', event => {
    const tr = event.target.closest('tr[data-target]');
    if (!tr) return;
    const target = tr.dataset.target;
    const row = { name: tr.querySelector('.cell-name')?.textContent || target };
    const saved = (routingOf()?.directOut || []).find(item => item.key === target);
    const change = draft.outputs.get(target) || {
      device: saved?.device || '',
      db: saved ? levelToDb(saved.volume) : 0,
      delay: saved?.delayMs ?? 0,
      enabled: !!saved?.enabled,
      name: row.name
    };
    if (event.target.matches('[data-device]')) change.device = event.target.value;
    if (event.target.matches('[data-level]')) change.db = Number(event.target.value) || 0;
    if (event.target.matches('[data-delay]')) change.delay = Number(event.target.value) || 0;
    if (event.target.matches('[data-active]')) change.enabled = event.target.checked;
    if (!change.device) change.enabled = false;
    draft.outputs.set(target, change);
    changed();
    renderOutputs();
  });

  E('refresh-devices')?.addEventListener('click', () => immediate('audio_routing_devices', {}, 'Inventário de dispositivos atualizado.'));

  E('asio-output-driver')?.addEventListener('change', event => {
    const config = draft.asio || asioConfig() || { routes: [] };
    config.driverId = event.target.value;
    draft.asio = config;
    changed();
    renderAsio();
  });

  E('asio-output-buffer')?.addEventListener('change', event => {
    const config = draft.asio || asioConfig() || { routes: [] };
    config.bufferFrames = Number(event.target.value) || 0;
    draft.asio = config;
    changed();
    renderAsio();
  });

  E('asio-output-routes')?.addEventListener('change', event => {
    const row = event.target.closest('.asio-route');
    if (!row) return;
    const config = draft.asio || asioConfig() || { routes: [] };
    const index = [...E('asio-output-routes').children].indexOf(row);
    const route = config.routes[index];
    if (!route) return;
    if (event.target.matches('[data-asio-source]')) route.key = event.target.value;
    for (const input of row.querySelectorAll('[data-asio-field]')) {
      route[input.dataset.asioField] = Number(input.value);
    }
    draft.asio = config;
    changed();
  });

  E('asio-output-routes')?.addEventListener('click', event => {
    const remove = event.target.closest('[data-asio-remove]');
    if (!remove) return;
    const config = draft.asio || asioConfig() || { routes: [] };
    config.routes.splice(Number(remove.dataset.asioRemove), 1);
    draft.asio = config;
    changed();
    asioRoutesSig = '';
    renderAsio();
  });

  E('asio-output-add')?.addEventListener('click', () => addAsioRoute());

  E('asio-output-start')?.addEventListener('click', () => immediate('audio_routing_asio_output_start', {}, 'Saída ASIO iniciada.'));
  E('asio-output-stop')?.addEventListener('click', () => immediate('audio_routing_asio_output_stop', {}, 'Saída ASIO parada.'));
  E('asio-output-panel')?.addEventListener('click', () => immediate('audio_routing_asio_output_control-panel', {}, 'Painel do driver solicitado.'));
  E('asio-create')?.addEventListener('click', () => immediate('audio_routing_asio_create', {
    name: E('asio-name')?.value,
    device: E('asio-device')?.value,
    channels: [Number(E('asio-left')?.value), Number(E('asio-right')?.value)]
  }, 'Entrada ASIO criada.'));

  document.addEventListener('audio:state', () => { render(); });
  document.addEventListener('audio:json', () => { inputsSig = ''; renderInputs(); renderOutputs(); });

  AUDIO.routing = { draft, render, pendingCount, hasPending, applyAll, discard, lastApply: () => lastApply, invalidate: () => { inputsSig = ''; outputsSig = ''; membersSig = ''; asioRoutesSig = ''; render(); } };
  render();
})();
