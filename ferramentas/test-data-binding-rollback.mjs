import test from 'node:test';
import assert from 'node:assert/strict';
import {DataSources} from './fontes-dados.mjs';
function fixture(binding){const ds=new DataSources('.');const source={id:'one',rows:[{name:'Title',color:'#ffffff'}],...(binding?{binding}:{})};ds.get=()=>source;return {ds,source};}
test('failed binding persistence restores prior routing and autoPublish',async()=>{const old={kind:'lower',mapping:{title:'name'},autoPublish:false};const {ds,source}=fixture(old);ds.save=async()=>{throw Error('disk full');};await assert.rejects(ds.bind({id:'one',kind:'lower',mapping:{color:'color'},autoPublish:true}),/disk full/);assert.equal(source.binding,old);});
test('first binding failure restores absence of binding',async()=>{const {ds,source}=fixture();ds.save=async()=>{throw Error('disk full');};await assert.rejects(ds.bind({id:'one',mapping:{title:'name'}}),/disk full/);assert.equal(Object.hasOwn(source,'binding'),false);});
test('saved mapping cannot be mutated through caller payload',async()=>{const {ds,source}=fixture();ds.save=async()=>{};const mapping={title:'name'};await ds.bind({id:'one',mapping});mapping.title='color';assert.equal(source.binding.mapping.title,'name');});


test('GTZIP browser text/color mapping survives real disk reload',async()=>{
 const {mkdir,mkdtemp,rm}=await import('node:fs/promises');const qa=new URL('../qa-finalizacao/',import.meta.url);await mkdir(qa,{recursive:true});const root=await mkdtemp(new URL('gtzip-color-binding-',qa));
 try{
 const ds=new DataSources(root);await ds.setScope('QA color');const source=await ds.import({name:'QA color',format:'csv',text:['headline,color','Title,#12ab34'].join(String.fromCharCode(10))});
 await ds.bind({id:source.id,kind:'browser',target:'QA GTZIP',mapping:{Headline:'headline',HeadlineColor:'color'},autoPublish:true});
 const reopened=new DataSources(root);await reopened.setScope('QA color');const mapped=reopened.mapped(source.id);
 assert.equal(mapped.kind,'browser');assert.equal(mapped.target,'QA GTZIP');assert.equal(mapped.data.Headline,'Title');assert.equal(mapped.data.HeadlineColor,'#12ab34');assert.equal(reopened.get(source.id).binding.autoPublish,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
