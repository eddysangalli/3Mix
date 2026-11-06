import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Production,resolveRequestedTransition} from './controle-producao.mjs';

const results=[];
async function test(name,run){
  try{await run();results.push({name,pass:true});}
  catch(error){results.push({name,pass:false,error:error.stack||error.message});}
}

function transitionHarness({ensureMerge=true}={}){
  const transitions=[
    {transitionName:'Cut',transitionKind:'cut_transition',transitionDuration:0},
    {transitionName:'Fade',transitionKind:'fade_transition',transitionDuration:100}
  ];
  let current={...transitions[1]};
  let program='CAM 1',preview='CAM 2';
  const events=[];
  const harness={
    state:{transitions},
    async vendor(type,data,name){
      events.push({type:'vendor',requestType:type,name,data});
      assert.equal(name,'freemix');
      assert.equal(type,'ensure_merge_transition');
      if(!ensureMerge)throw Error('Move Transition plugin is not loaded');
      if(!transitions.some(item=>item.transitionKind==='move_transition'))transitions.push({transitionName:'3Mix Merge',transitionKind:'move_transition',transitionDuration:50});
      return {success:true,transitionName:'3Mix Merge'};
    },
    async req(type,data={}){
      events.push({type,data});
      if(type==='GetSceneList')return {currentProgramSceneName:program,currentPreviewSceneName:preview};
      if(type==='GetSceneTransitionList')return {transitions,currentSceneTransitionName:current.transitionName};
      if(type==='GetCurrentSceneTransition')return {...current};
      if(type==='SetCurrentSceneTransition'){
        const selected=transitions.find(item=>item.transitionName===data.transitionName);
        if(!selected)throw Error('Unknown transition '+data.transitionName);
        current={...selected};return {};
      }
      if(type==='SetCurrentSceneTransitionDuration'){current.transitionDuration=data.transitionDuration;return {};}
      if(type==='TriggerStudioModeTransition'){program=preview;return {};}
      if(type==='GetCurrentSceneTransitionCursor')return {transitionCursor:1};
      if(type==='SetCurrentPreviewScene'){preview=data.sceneName;return {};}
      throw Error('Unexpected request '+type);
    },
    async wait(type,data,accepted){
      const value=await this.req(type,data);
      if(!accepted(value))throw Error('Synthetic state was not accepted for '+type);
      return value;
    }
  };
  return {harness,events,transitions,get current(){return current;},get program(){return program;}};
}

await test('aliases resolve the actual OBS transition kinds',async()=>{
  const transitions=[
    {transitionName:'3Mix Merge',transitionKind:'move_transition'},
    {transitionName:'Stinger Operacional',transitionKind:'obs_stinger_transition'},
    {transitionName:'Luma Wipe',transitionKind:'luma_wipe_transition'}
  ];
  assert.equal(resolveRequestedTransition(transitions,'merge').transitionName,'3Mix Merge');
  assert.equal(resolveRequestedTransition(transitions,'STINGER').transitionName,'Stinger Operacional');
  assert.equal(resolveRequestedTransition(transitions,'wipe').transitionName,'Luma Wipe');
  assert.equal(resolveRequestedTransition(transitions,'cube'),null);
});

await test('MERGE provisions Move once and selects it before TAKE',async()=>{
  const qa=transitionHarness();
  await Production.prototype.execute.call(qa.harness,'transition',{transition:'merge'});
  assert.equal(qa.current.transitionKind,'move_transition');
  assert.equal(qa.program,'CAM 2');
  assert.equal(qa.events.filter(event=>event.type==='vendor').length,1);
  assert.ok(qa.events.find(event=>event.type==='SetCurrentSceneTransition'&&event.data.transitionName==='3Mix Merge'));
});

await test('missing Move is rejected instead of silently falling back to Fade',async()=>{
  const qa=transitionHarness({ensureMerge:false});
  await assert.rejects(()=>Production.prototype.execute.call(qa.harness,'transition',{transition:'merge'}),/Move Transition plugin is not loaded/);
  assert.equal(qa.events.some(event=>event.type==='TriggerStudioModeTransition'),false);
});

await test('unknown explicit effect is rejected instead of using the current transition',async()=>{
  const qa=transitionHarness();
  await assert.rejects(()=>Production.prototype.execute.call(qa.harness,'transition',{transition:'cube'}),/CUBE indisponível/);
  assert.equal(qa.events.some(event=>event.type==='TriggerStudioModeTransition'),false);
});

await test('audio transport errors never expose raw Failed to fetch',async()=>{
  const source=await readFile(new URL('../painel/remoto/audio.js',import.meta.url),'utf8');
  const match=source.match(/function audioErrorMessage\(error\) \{[\s\S]*?\n\}/);
  assert.ok(match,'audioErrorMessage was not found');
  const context={TypeError,Error};
  vm.runInNewContext(`${match[0]}\nthis.describe=audioErrorMessage;`,context);
  const failed=context.describe(new TypeError('Failed to fetch'));
  assert.match(failed,/API de áudio do 3Mix/);
  assert.doesNotMatch(failed,/Failed to fetch/i);
  assert.match(context.describe(Object.assign(Error('timeout'),{name:'TimeoutError'})),/não respondeu a tempo/);
});

console.log(JSON.stringify({pass:results.every(item=>item.pass),results},null,2));
if(results.some(item=>!item.pass))process.exitCode=1;
