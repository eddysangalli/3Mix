import test from 'node:test';import assert from 'node:assert/strict';import {DiskReplay} from './replay-disco.mjs';
function fixture(){const r=new DiskReplay({root:'.',getObs:()=>({})}),calls=[];r.state.players={A:{},B:{}};r.save=async()=>{};r.scopeState=async()=>{};r.status=async()=>r.state;
 r.req=async(type,data)=>{calls.push({type,data});if(type==='GetMediaInputStatus')return {mediaDuration:10000,mediaCursor:2000,mediaState:'OBS_MEDIA_STATE_PAUSED'};if(type==='GetInputSettings')return {inputSettings:{speed_percent:50}};return {};};r.waitFor=async()=>({mediaDuration:10000,mediaCursor:2000,mediaState:'OBS_MEDIA_STATE_PAUSED'});return {r,calls};}
test('channel-specific command does not mutate other player or global default',async()=>{const {r,calls}=fixture(),before=r.state.speed;await r.command('speed',{speed:25,player:'A'});assert.ok(calls.some(c=>c.type==='SetInputSettings'));assert.ok(calls.every(c=>c.data.inputName==='Replay Player A'));assert.equal(r.state.speed,before);});
test('legacy global speed still applies to all loaded players',async()=>{const {r,calls}=fixture();await r.command('speed',{speed:25});assert.deepEqual(calls.filter(c=>c.type==='SetInputSettings').map(c=>c.data.inputName),['Replay Player A','Replay Player B']);assert.equal(r.state.speed,25);});
test('invalid or unloaded player is rejected before native requests',async()=>{const {r,calls}=fixture();for(const player of ['Z','C',null])await assert.rejects(r.command('speed',{speed:25,player}),/Player/);assert.equal(calls.length,0);});

test('per-player speed is retained independently for subsequent clip loads',async()=>{
 const {r}=fixture();await r.command('speed',{speed:25,player:'A'});assert.equal(r.playerSpeed('A'),25);assert.equal(r.playerSpeed('B'),50);
 const restored=new DiskReplay({root:'.',getObs:()=>({})});restored.state=JSON.parse(JSON.stringify(r.state));assert.equal(restored.playerSpeed('A'),25);
 await r.command('speed',{speed:75});assert.equal(r.playerSpeed('A'),75);assert.equal(r.playerSpeed('B'),75);
});

test('actual load sends retained channel speed and preserves other channel',async()=>{
 const {r}=fixture();r.state.players.A.speed=25;r.state.players.B.speed=75;
 r.state.events=[{id:'event',clips:[{cam:'CAM 1',file:'fixture.mp4'}]}];
 r.probe=async()=>({duration:10,frameRate:'30/1',hasVideo:true,audio:true});
 const writes=[];
 r.req=async(type,data={})=>{
 if(type==='GetStudioModeEnabled')return {studioModeEnabled:true};
 if(type==='GetSceneList')return {currentProgramSceneName:'LIVE',scenes:[{sceneName:'REPLAY A'}]};
 if(type==='GetInputSettings')return {inputKind:'ffmpeg_source',inputSettings:{}};
 if(type==='GetSceneItemList')return {sceneItems:[{sourceName:'Replay Player A',sceneItemId:1}]};
 if(type==='GetVideoSettings')return {baseWidth:1920,baseHeight:1080};
 if(type==='GetMediaInputStatus')return {mediaDuration:10000,mediaCursor:0,mediaState:'OBS_MEDIA_STATE_PLAYING'};
 if(type==='SetInputSettings')writes.push(data);
 return {};
 };
 r.optional=r.req;await r.load('A','event','CAM 1');
 assert.equal(writes[0].inputSettings.speed_percent,25);assert.equal(r.state.players.A.speed,25);assert.equal(r.state.players.B.speed,75);
});

test('invalid event ID or fractional index never silently selects another event',async()=>{
 const {r}=fixture();r.state.events=[{id:'one'},{id:'two'}];r.state.selectedEventId='two';let loaded=false;r.load=async()=>{loaded=true;};
 await assert.rejects(r.selectEvent({eventId:'missing',load:true}),/não encontrado/);
 await assert.rejects(r.selectEvent({index:0.5}),/Índice/);
 assert.equal(r.state.selectedEventId,'two');assert.equal(loaded,false);
});

test('invalid jog displacement is rejected before hydration or seeking',async()=>{
 const {r}=fixture();let touched=false;r.hydratePlayers=async()=>{touched=true;};r.seekPlayer=async()=>{touched=true;};
 for(const data of [{seconds:NaN},{seconds:Infinity},{seconds:'invalid'},{frames:0.5},{frames:Infinity}])await assert.rejects(r.jump(data));
 assert.equal(touched,false);
});
test('valid frame jog uses rational frame rate and clamps at clip boundaries',async()=>{
 const {r}=fixture();r.hydratePlayers=async()=>{};r.state.players.A={duration:10,frameRate:'30000/1001'};let target;r.seekPlayer=async d=>{target=d.cursor;};
 await r.jump({player:'A',frames:30});assert.ok(Math.abs(target-3001)<0.01);
 await r.jump({player:'A',seconds:-100});assert.equal(target,0);
 await r.jump({player:'A',seconds:100});assert.equal(target,10000);
});

test('failed load does not change selected event or send event to output',async()=>{
 const {r}=fixture();r.state.events=[{id:'one'},{id:'two'}];r.state.selectedEventId='one';r.load=async()=>{throw Error('decoder unavailable');};let aired=false;r.air=async()=>{aired=true;};
 await assert.rejects(r.playEvent({eventId:'two',toOutput:true}),/decoder/);assert.equal(r.state.selectedEventId,'one');assert.equal(aired,false);
 await assert.rejects(r.selectEvent({eventId:'two',load:true}),/decoder/);assert.equal(r.state.selectedEventId,'one');
});
test('selection persistence failure restores previous selection',async()=>{
 const {r}=fixture();r.state.events=[{id:'one'},{id:'two'}];r.state.selectedEventId='one';r.save=async()=>{throw Error('disk');};await assert.rejects(r.selectEvent({eventId:'two'}),/disk/);assert.equal(r.state.selectedEventId,'one');
});
test('play-event invalid indexes never silently fall back to first event',async()=>{
 const {r}=fixture();r.state.events=[{id:'one'}];let loaded=false;r.load=async()=>{loaded=true;};for(const index of [-1,0.5,NaN,Infinity,10])await assert.rejects(r.playEvent({index}),/Índice/);assert.equal(loaded,false);
});
