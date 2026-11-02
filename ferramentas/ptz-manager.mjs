// PTZManager: the single reusable PTZ service (manual control via VISCA over IP today;
// ONVIF/other protocols are separate adapters plugged in the same way). Owns no UI, no
// sockets in the browser. Devices persist by a stable id, independent of which Input(s)
// reference them -- two Inputs pointing at the same physical camera share one connection
// and one lease state (task requirement).
//
// Protocol adapters implement: {connect(),close(),connected,move(pan,tilt,speed),stop(),
// zoom(dir,speed),focus(dir,speed),focusMode(auto),home(),presetRecall(n),presetSave(n),
// imagingGet(),imagingSet(patch)}. Only the VISCA adapter exists; see ptz-visca-adapter.mjs.
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { PTZLeases } from './ptz-leases.mjs';
import { PTZCredentialStore } from './ptz-credenciais.mjs';

const CONTINUOUS_WATCHDOG_MS = 400; // no re-send within this window auto-stops motion

export function validateDevice(value) {
  if (!value || typeof value !== 'object') throw Error('Dispositivo PTZ inválido');
  const name = String(value.name || '').trim();
  if (!name || name.length > 60) throw Error('Nome do dispositivo: até 60 caracteres');
  const protocol = String(value.protocol || '');
  if (!['visca-tcp', 'visca-udp', 'onvif'].includes(protocol)) throw Error('Protocolo PTZ não suportado nesta etapa');
  const host = String(value.host || '').trim();
  const octets=host.split('.').map(Number);
  if(isIP(host)!==4||!(octets[0]===10||octets[0]===127||octets[0]===192&&octets[1]===168||octets[0]===172&&octets[1]>=16&&octets[1]<=31))throw Error('Use a local IPv4 camera address');
  const port = Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Porta do dispositivo PTZ inválida');
  const address = Number(value.address ?? 1);
  if (!Number.isInteger(address) || address < 1 || address > 7) throw Error('Endereço VISCA inválido (1 a 7)');
  if(protocol==='onvif'){
    const url=new URL(String(value.url||''));
    if(url.hostname!==host||Number(url.port||(url.protocol==='https:'?443:80))!==port||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('ONVIF endpoint must match device address and port');
    const profileToken=String(value.profileToken||'');
    if(!profileToken||profileToken.length>256)throw Error('Explicit ONVIF media profile required');
    return {name,protocol,host,port,url:url.href,profileToken};
  }
  return { name, protocol, host, port, address };
}

function clampUnit(v) { if(typeof v!=='number'||!Number.isFinite(v)||![-1,0,1].includes(v))throw Error('Direction must be -1, 0 or 1');return v; }
function clampUnit01(v) { if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw Error('Speed must be 0 to 1');return v; }
function integerPreset(v) { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 127) throw Error('Preset PTZ: use 0 a 127'); return n; }

export class PTZManager {
  constructor(p) {
    this.p = p; this.devices = new Map(); this.adapters = new Map(); this.continuous = new Map();
    // Default scope so PTZ can be configured before the engine connects; setScope()
    // replaces this with the project-specific file as soon as a project is identified.
    this.file = join(p.root, 'config/obs-studio/plugin_config/freemix-ptz', 'default.json');
    // Credentials store must exist even before the first setScope(); otherwise removing
    // a device configured offline throws after mutating the in-memory list.
    this.credentials = new PTZCredentialStore(p.root);
    this.credentialIds = new Set();
    this.leases = new PTZLeases({ stop: device => this.stopNow(device), suspendTracking: device => this.suspendTracking(device) });
    this.trackingByDevice = new Map(); // deviceId -> {inputKey} when Face Tracker owns it
    this.links = {};
  }
  async setScope(scope) {
    if (this.scope === scope) return;
    for (const id of [...this.adapters.keys()]) await this.disconnect(id).catch(() => {});
    this.scope = scope;
    this.file = join(this.p.root, 'config/obs-studio/plugin_config/freemix-ptz', (scope ? scope.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) : 'default') + '.json');
    try { const saved = JSON.parse(await readFile(this.file, 'utf8')); this.devices = new Map((saved.devices || []).map(d => [d.id, d])); this.links = saved.links || {}; }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.devices = new Map(); this.links = {}; }
    this.credentials = new PTZCredentialStore(this.p.root);
    await this.refreshCredentialIds();
  }
  async save() {
    await mkdir(join(this.file, '..'), { recursive: true });
    const payload = JSON.stringify({ schema: 1, devices: [...this.devices.values()], links: this.links || {} }, null, 2);
    await writeFile(this.file + '.tmp', payload); await rename(this.file + '.tmp', this.file);
  }
  summary() {
    return {
      devices: [...this.devices.values()].map(d => ({
        id: d.id, name: d.name, protocol: d.protocol, host: d.host, port: d.port,
        connected: this.adapters.get(d.id)?.connected === true,
        controlledBy: this.leases.items.get(d.id)?.owner || null,
        tracking: this.trackingByDevice.has(d.id),
        lastError: this.leases.errors.get(d.id) || null,
        hasCredential: this.credentialIds?.has(d.id) === true,
        ...(d.protocol === 'onvif' ? { profileToken: d.profileToken, url: d.url } : {})
      })),
      links: this.links || {}
    };
  }
  // Credential presence is read once per setScope/save (cheap, no secret material) so
  // summary() stays synchronous and never awaits DPAPI just to answer "is one set".
  async refreshCredentialIds() { this.credentialIds = new Set(await this.credentials.ids()); }
  async execute(action, d = {}) {
    const handlers = {
      ptz_acquire: async () => { const id=String(d.device||''); await this.adapter(id); return this.leases.acquire(id,String(d.owner||'')); },
      ptz_ping: () => { this.leases.ping(String(d.device||''),String(d.token||'')); return {ok:true}; },
      ptz_release: async () => { await this.leases.release(String(d.device||''),String(d.token||'')); return {ok:true}; },
      ptz_device_save: () => this.saveDevice(d), ptz_device_remove: () => this.removeDevice(d),
      ptz_link: () => this.linkInput(d), ptz_unlink: () => this.unlinkInput(d), ptz_test: () => this.testConnection(d),
      ptz_move: () => this.move(d), ptz_stop: () => this.stop(d), ptz_zoom: () => this.zoom(d),
      ptz_focus: () => this.focus(d), ptz_focus_mode: () => this.focusMode(d), ptz_home: () => this.home(d),
      ptz_preset_recall: () => this.presetRecall(d), ptz_preset_save: () => this.presetSave(d),
      ptz_imaging_get: () => this.imagingGet(d), ptz_imaging_set: () => this.imagingSet(d),
      ptz_device_info: () => this.deviceInfo(d),
      ptz_tracking_claim: () => this.trackingClaim(d), ptz_tracking_release: () => this.trackingRelease(d)
    };
    if (!handlers[action]) throw Error('Comando PTZ inválido');
    return handlers[action]();
  }
  async saveDevice(d) {
    const values = validateDevice(d);
    const id = typeof d.id === 'string' && d.id ? d.id : randomUUID();
    if(this.leases.items.has(id)||this.leases.pending.has(id))throw Error('Release manual control before editing device');
    if([...this.devices.values()].some(device=>device.id!==id&&device.host===values.host&&device.port===values.port))throw Error('Camera endpoint already registered; link Inputs to its existing device');
    if (this.devices.has(id)) await this.disconnect(id).catch(() => {});
    const anterior = this.devices.get(id);
    this.devices.set(id, { id, ...values });
    try { await this.save(); }
    catch (e) {
      // Never leave a device that exists only in memory after a failed write.
      if (anterior) this.devices.set(id, anterior); else this.devices.delete(id);
      throw e;
    }
    // Credentials never touch devices.json: separate DPAPI-protected store, keyed by id.
    // d.username/d.password absent or both empty = "no credential change"; passing one
    // empty string explicitly clears a previously stored credential.
    if (values.protocol === 'onvif' && (d.username !== undefined || d.password !== undefined)) {
      await this.credentials.setCredential(id, String(d.username || ''), String(d.password || ''));
      await this.refreshCredentialIds();
    }
    return { id, summary: this.summary() };
  }
  async removeDevice(d) {
    const id = String(d.id || ''); if (!this.devices.has(id)) throw Error('Dispositivo PTZ não encontrado');
    if (this.leases.items.has(id)) throw Error('Pare o controle manual antes de remover o dispositivo');
    await this.disconnect(id).catch(() => {});
    this.devices.delete(id);
    this.links = Object.fromEntries(Object.entries(this.links || {}).filter(([, v]) => v !== id));
    await this.credentials.removeCredential(id); await this.refreshCredentialIds();
    await this.save(); return this.summary();
  }
  async linkInput(d) {
    const inputKey = String(d.input || ''), deviceId = String(d.device || '');
    if (!inputKey || !this.devices.has(deviceId)) throw Error('Input ou dispositivo PTZ inválido');
    this.links = { ...(this.links || {}), [inputKey]: deviceId }; await this.save(); return this.summary();
  }
  async unlinkInput(d) {
    const inputKey = String(d.input || '');
    this.links = { ...(this.links || {}) }; delete this.links[inputKey]; await this.save(); return this.summary();
  }
  deviceForInput(inputKey) { const id = this.links?.[inputKey]; return id && this.devices.has(id) ? id : null; }
  async adapter(id) {
    const device = this.devices.get(id); if (!device) throw Error('Dispositivo PTZ não encontrado');
    let a = this.adapters.get(id);
    if(!a){
      if(device.protocol==='onvif'){
        const {createOnvifAdapter}=await import('./ptz-onvif-adapter.mjs');
        const credential=await this.credentials.getCredential(id); // decrypted only for this in-memory adapter instance
        a=createOnvifAdapter({...device,username:credential?.username,password:credential?.password});
      }
      else {const {createViscaAdapter}=await import('./ptz-visca-adapter.mjs');a=createViscaAdapter(device);}
      this.adapters.set(id,a);
    }
    if (!a.connected) await a.connect();
    return a;
  }
  async disconnect(id) { const a = this.adapters.get(id); this.adapters.delete(id); this.stopContinuous(id); if (a) await a.close().catch(() => {}); }
  async testConnection(d) {
    const id = String(d.device || '');
    try { const a = await this.adapter(id); return { connected: !!a.connected }; }
    catch (e) { return { connected: false, error: e.message }; }
  }
  assertTrackingAvailable(host,port) {
    for(const [id,device] of this.devices){
      if(device.host===host&&Number(device.port)===Number(port)&&
        (this.leases.items.has(id)||this.leases.pending.has(id)))throw Error('Manual PTZ control owns this camera');
    }
  }
  async suspendTracking(deviceId) {
    const device=this.devices.get(deviceId);
    if(!device)throw Error('Unknown PTZ device');
    // Scan actual native filters too: tracking can predate this manager or its registry.
    const sources=this.p.state?.sourceInputs||[];
    for(const source of sources){
      const result=await this.p.req('GetSourceFilterList',{sourceUuid:source.key});
      for(const filter of result.filters||[]){
        const settings=filter.filterSettings||{};
        if(filter.filterKind!=='face_tracker_ptz'||
          settings['ptz.visca-over-tcp.address']!==device.host||
          Number(settings['ptz.visca-over-tcp.port'])!==device.port)continue;
        await this.p.req('SetSourceFilterEnabled',{sourceUuid:source.key,filterName:filter.filterName,filterEnabled:false});
        const confirmed=await this.p.req('GetSourceFilter',{sourceUuid:source.key,filterName:filter.filterName});
        if(confirmed.filterEnabled!==false)throw Error('Tracking suspension not confirmed');
      }
    }
    const owner=this.trackingByDevice.get(deviceId);
    if(owner&&typeof this.p?.execute==='function')await this.p.execute('effects_ptz',{key:owner.inputKey,enabled:false});
    this.trackingByDevice.delete(deviceId);
  }

  async trackingClaim(d) {
    const id = String(d.device || ''); if (this.leases.items.has(id)) throw Error('Controle manual ativo; pare antes de iniciar o tracking automático');
    this.trackingByDevice.set(id, { inputKey: String(d.input || '') }); return this.summary();
  }
  async trackingRelease(d) { this.trackingByDevice.delete(String(d.device || '')); return this.summary(); }
  stopContinuous(id) { const t = this.continuous.get(id); if (t) clearTimeout(t); this.continuous.delete(id); }
  armContinuousWatchdog(id, token) {
    this.stopContinuous(id);
    const timer = setTimeout(() => { this.leases.release(id, token).catch(() => {}); }, CONTINUOUS_WATCHDOG_MS);
    timer.unref?.(); this.continuous.set(id, timer);
  }
  async stopNow(id) { const a = this.adapters.get(id); this.stopContinuous(id); if (!a?.connected) throw Error('Stop not confirmed: camera disconnected'); await a.stop(); }
  async move(d) {
    const id = String(d.device || ''), token = String(d.token || '');
    const pan=clampUnit(d.pan),tilt=clampUnit(d.tilt),speed=clampUnit01(d.speed);
    this.leases.check(id, token); const a = await this.adapter(id);
    this.leases.check(id, token);
    await a.move(pan,tilt,speed);
    this.leases.ping(id, token); this.armContinuousWatchdog(id, token);
    return { ok: true };
  }
  async stop(d) {
    const id = String(d.device || ''), token = String(d.token || '');
    this.leases.check(id, token); await this.stopNow(id); this.leases.ping(id, token); return { ok: true };
  }
  async zoom(d) { const id = String(d.device || ''), token = String(d.token || ''); this.leases.check(id, token); const a = await this.adapter(id); await a.zoom(clampUnit(d.direction), clampUnit01(d.speed)); this.leases.ping(id, token); this.armContinuousWatchdog(id, token); return { ok: true }; }
  async focus(d) { const id = String(d.device || ''), token = String(d.token || ''); this.leases.check(id, token); const a = await this.adapter(id); await a.focus(clampUnit(d.direction), clampUnit01(d.speed)); this.leases.ping(id, token); this.armContinuousWatchdog(id, token); return { ok: true }; }
  async focusMode(d) { const id = String(d.device || ''), token = String(d.token || ''); this.leases.check(id, token); const a = await this.adapter(id); await a.focusMode(d.auto === true); this.leases.ping(id, token); return { ok: true }; }
  async home(d) { const id = String(d.device || ''), token = String(d.token || ''); this.leases.check(id, token); const a = await this.adapter(id); await a.home(); this.leases.ping(id, token); return { ok: true }; }
  async presetRecall(d) { const id = String(d.device || ''), token = String(d.token || ''); this.leases.check(id, token); const a = await this.adapter(id); await a.presetRecall(integerPreset(d.number)); this.leases.ping(id, token); return { ok: true }; }
  async presetSave(d) { const id = String(d.device || ''), token = String(d.token || ''); this.leases.check(id, token); const a = await this.adapter(id); await a.presetSave(integerPreset(d.number)); this.leases.ping(id, token); return { ok: true }; }
  async imagingGet(d) { const id = String(d.device || ''); const a = await this.adapter(id); return { values: await a.imagingGet(), rangeConfirmed: false }; }
  async imagingSet(d) { const id = String(d.device || ''), token = String(d.token || ''); this.leases.check(id, token); const a = await this.adapter(id); await a.imagingSet(d.patch || {}); this.leases.ping(id, token); return { ok: true }; }
  async deviceInfo(d) { const id = String(d.device || ''); const a = await this.adapter(id); if (typeof a.deviceInfo !== 'function') throw Error('Informações do dispositivo não disponíveis nesta câmera'); return { info: await a.deviceInfo() }; }
  async close() { await this.leases.close(); for (const id of [...this.adapters.keys()]) await this.disconnect(id).catch(() => {}); }
}
