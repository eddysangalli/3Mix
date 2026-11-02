// Concrete PTZManager adapter for raw VISCA over TCP/UDP. Encoding lives in
// ptz-visca.mjs, the socket in ptz-visca-transporte.mjs; this file is only the glue
// that PTZManager's generic interface expects (move/stop/zoom/focus/home/presets/imaging).
import { visca, decodeInquiryValue } from './ptz-visca.mjs';
import { ViscaTransport } from './ptz-visca-transporte.mjs';

export function createViscaAdapter(device) {
  const transport = new ViscaTransport({ host: device.host, port: device.port, protocol: device.protocol === 'visca-udp' ? 'udp' : 'tcp' });
  const address = device.address || 1;
  return {
    get connected() { return transport.connected; },
    async connect() { await transport.connect(); },
    async close() { transport.close(); },
    async move(pan, tilt, speed01) {
      const panSpeed = pan === 0 ? 1 : Math.max(1, Math.round(speed01 * 24));
      const tiltSpeed = tilt === 0 ? 1 : Math.max(1, Math.round(speed01 * 20));
      await transport.send(visca.move(address, pan, tilt, panSpeed, tiltSpeed), { expectReply: true });
    },
    async stop() {
      const results=[];
      for(const bytes of [visca.move(address,0,0,1,1),visca.zoom(address,0),visca.focus(address,0)]){
        try{await transport.send(bytes,{expectReply:true});results.push(true);}catch{results.push(false);}
      }
      if(results.some(ok=>!ok))throw Error('Stop not confirmed for all PTZ axes');
    },
    async zoom(direction, speed01) { await transport.send(visca.zoom(address, direction, Math.round(speed01 * 7)), { expectReply: true }); },
    async focus(direction, speed01) { await transport.send(visca.focus(address, direction, Math.round(speed01 * 7)), { expectReply: true }); },
    async focusMode(auto) { await transport.send(visca.focusMode(address, auto), { expectReply: true }); },
    async home() { await transport.send(visca.home(address), { expectReply: true }); },
    async presetRecall(number) { await transport.send(visca.preset(address, number, false), { expectReply: true }); },
    async presetSave(number) { await transport.send(visca.preset(address, number, true), { expectReply: true }); },
    async imagingGet() {
      const read = async (cmd) => { try { const r = await transport.send(cmd, { expectReply: true }); return r?.data ? decodeInquiryValue(r.data) : null; } catch { return null; } };
      const iris=await read(visca.inquiryIris(address)),gain=await read(visca.inquiryGain(address)),shutter=await read(visca.inquiryShutter(address));
      return { iris, gain, shutter };
    },
    async imagingSet(patch) {
      if (patch.wbMode !== undefined) await transport.send(visca.wbMode(address, patch.wbMode), { expectReply: true });
      if (patch.aeMode !== undefined) await transport.send(visca.aeMode(address, patch.aeMode), { expectReply: true });
      if (patch.iris !== undefined) await transport.send(visca.irisDirect(address, patch.iris), { expectReply: true });
      if (patch.gain !== undefined) await transport.send(visca.gainDirect(address, patch.gain), { expectReply: true });
      if (patch.shutter !== undefined) await transport.send(visca.shutterDirect(address, patch.shutter), { expectReply: true });
    }
  };
}
