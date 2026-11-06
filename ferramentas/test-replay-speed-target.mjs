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

test('invalid camera index is rejected without fallback or decoder requests',async()=>{
 const {r,calls}=fixture();r.state.players.A={eventId:'one'};r.state.events=[{id:'one',clips:[{cam:'CAM 1'}]}];let loaded=false;r.load=async()=>{loaded=true;};
 for(const camIndex of [0,-1,0.5,1.5,NaN,Infinity,2])await assert.rejects(r.selectCamera({player:'A',cam:'CAM 1',camIndex}),/Índice/);
 assert.equal(loaded,false);assert.equal(calls.length,0);
});

test('play-event persists selection after successful load and before optional output',async()=>{
 const {r}=fixture();r.state.events=[{id:'one'},{id:'two'}];r.state.selectedEventId='one';r.load=async()=>{};const order=[];
 r.save=async()=>{order.push('save:'+r.state.selectedEventId);};r.air=async()=>order.push('air');await r.playEvent({eventId:'two',toOutput:true});assert.deepEqual(order,['save:two','air']);
 r.state.selectedEventId='one';r.save=async()=>{throw Error('disk');};order.length=0;await assert.rejects(r.playEvent({eventId:'two',toOutput:true}),/disk/);assert.equal(r.state.selectedEventId,'one');assert.deepEqual(order,[]);
});


test('reorder persists requested order without replacing events',async()=>{
 const {r}=fixture();const one={id:'one'},two={id:'two'};r.state.events=[one,two];let saved;r.save=async()=>{saved=r.state.events.map(e=>e.id);};await r.reorderEvents({ids:['two','one']});assert.deepEqual(saved,['two','one']);assert.equal(r.state.events[0],two);
});
test('reorder save failure restores original list and event identities',async()=>{
 const {r}=fixture();const previous=[{id:'one'},{id:'two'}];r.state.events=previous;r.save=async()=>{throw Error('disk full');};await assert.rejects(r.reorderEvents({ids:['two','one']}),/disk full/);assert.equal(r.state.events,previous);assert.deepEqual(r.state.events.map(e=>e.id),['one','two']);
});
test('invalid reorder never mutates list or writes storage',async()=>{
 const {r}=fixture();const previous=[{id:'one'},{id:'two'}];r.state.events=previous;let saves=0;r.save=async()=>{saves++;};for(const ids of [[],['one','one'],['two','unknown'],['one']])await assert.rejects(r.reorderEvents({ids}));assert.equal(r.state.events,previous);assert.equal(saves,0);
});


test('import persistence failure does not leave a deleted clip in event list',async()=>{
 const {r}=fixture();const previous=[{id:'existing'}];r.state.events=previous;r.save=async()=>{throw Error('disk full');};
 await assert.rejects(r.persistImportedEvent({id:'imported',clips:[{file:'clip.mp4'}]}),/disk full/);assert.equal(r.state.events,previous);assert.equal(r.state.events.length,1);
});
test('successful imported event persistence preserves prior events',async()=>{
 const {r}=fixture();const previous={id:'existing'},event={id:'imported'};r.state.events=[previous];let saved;r.save=async()=>{saved=r.state.events.slice();};
 await r.persistImportedEvent(event);assert.deepEqual(saved,[previous,event]);assert.equal(r.state.events[0],previous);assert.equal(r.state.events[1],event);
});


test('imported event loads dedicated B player without altering A or sending Program',async()=>{
 const {r}=fixture();const playerA={eventId:'live-other',speed:75};r.state.players.A=playerA;r.state.players.B={speed:25};
 r.state.events=[{id:'external',imported:true,clips:[{cam:'Importado',file:'external-fixture.mp4'}]}];
 r.probe=async()=>({duration:10,frameRate:'30/1',hasVideo:true,audio:true});const calls=[];
 r.req=async(type,data={})=>{calls.push({type,data});
 if(type==='GetStudioModeEnabled')return {studioModeEnabled:true};
 if(type==='GetSceneList')return {currentProgramSceneName:'LIVE',scenes:[{sceneName:'REPLAY B'}]};
 if(type==='GetInputSettings')return {inputKind:'ffmpeg_source',inputSettings:{}};
 if(type==='GetSceneItemList')return {sceneItems:[{sourceName:'Replay Player B',sceneItemId:2}]};
 if(type==='GetVideoSettings')return {baseWidth:1920,baseHeight:1080};
 if(type==='GetMediaInputStatus')return {mediaDuration:10000,mediaCursor:0,mediaState:'OBS_MEDIA_STATE_PLAYING'};return {};};
 r.optional=r.req;await r.load('B','external','Importado');
 assert.equal(r.state.players.A,playerA);assert.equal(r.state.players.B.eventId,'external');
 assert.ok(calls.some(c=>c.type==='SetInputSettings'&&c.data.inputName==='Replay Player B'&&c.data.inputSettings.local_file==='external-fixture.mp4'));
 assert.ok(!calls.some(c=>c.type==='SetCurrentProgramScene'||c.data.inputName==='Replay Player A'));
 assert.ok(calls.some(c=>c.type==='SetInputMute'&&c.data.inputName==='Replay Player B'&&c.data.inputMuted===true));
});
