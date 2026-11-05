import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioBusesEngine} from './audio-buses-producao.mjs';
test('monitor level stays unlinked and never writes source volume or tracks',async()=>{
 const calls=[];const p={req:async(type,data)=>{calls.push({type,data});if(type==='GetSourceFilterList')return {filters:[]};return {};},vendor:async()=>({director_uuid:'private'})};
 const e=new AudioBusesEngine(p);e.context={audioInputs:[{key:'public',name:'Camera'}],sourceInputs:[{key:'public',name:'Camera',kind:'ffmpeg_source'}]};
 e.discover=async()=>({directOut:true,renderInventoryKnown:true,renderDevices:[{id:'phones',name:'Headphones'}]});e.save=async()=>{};
 await e.direct({key:'public',enabled:true,device:'phones',volume:25});
 assert.ok(calls.some(c=>c.type==='SetSourceFilterSettings'&&c.data.filterSettings.volume===25&&c.data.filterSettings.linked===false));
 assert.ok(!calls.some(c=>['SetInputVolume','SetInputAudioTracks','SetInputMute'].includes(c.type)));
 assert.equal(e.config.nodes.public.directOut.volume,25);
});
