import test from 'node:test';
import assert from 'node:assert/strict';
import {DataSources} from './fontes-dados.mjs';
function fixture(binding){const ds=new DataSources('.');const source={id:'one',rows:[{name:'Title',color:'#ffffff'}],...(binding?{binding}:{})};ds.get=()=>source;return {ds,source};}
test('failed binding persistence restores prior routing and autoPublish',async()=>{const old={kind:'lower',mapping:{title:'name'},autoPublish:false};const {ds,source}=fixture(old);ds.save=async()=>{throw Error('disk full');};await assert.rejects(ds.bind({id:'one',kind:'lower',mapping:{color:'color'},autoPublish:true}),/disk full/);assert.equal(source.binding,old);});
test('first binding failure restores absence of binding',async()=>{const {ds,source}=fixture();ds.save=async()=>{throw Error('disk full');};await assert.rejects(ds.bind({id:'one',mapping:{title:'name'}}),/disk full/);assert.equal(Object.hasOwn(source,'binding'),false);});
test('saved mapping cannot be mutated through caller payload',async()=>{const {ds,source}=fixture();ds.save=async()=>{};const mapping={title:'name'};await ds.bind({id:'one',mapping});mapping.title='color';assert.equal(source.binding.mapping.title,'name');});
