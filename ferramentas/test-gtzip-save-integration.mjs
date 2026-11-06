import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {executeGtImport} from './gc-gtzip.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('GTZIP save verifies files, persists fields, restores on failure and rejects tampering',async()=>{
 const qa=new URL('../qa-finalizacao/',import.meta.url);await mkdir(qa,{recursive:true});
 const root=await mkdtemp(new URL('gtzip-save-real-',qa));
 try{
 const id='11111111-1111-4111-8111-111111111111',folder=join(root,'gc','gt_titles','gt_'+id);await mkdir(folder,{recursive:true});
 const html=Buffer.from('<!doctype html><title>3Mix own QA</title>');await writeFile(join(folder,'index.html'),html);
 const fields=[{name:'Headline',type:'TextBlock',default:'Initial'}];
 const raw=JSON.stringify({format:2,fields,resources:[],files:[{path:'index.html',size:html.length,sha256:sha(html)}]});await writeFile(join(folder,'manifest.json'),raw);
 const record={id,name:'QA',fields,manifestSha256:sha(raw),values:{Headline:'Initial'}};let nativeCalls=0;
 const engine={p:{panel:root,req:async()=>{nativeCalls++;throw Error('Unexpected native access');}},imports:[record],save:async()=>writeFile(join(root,'saved.json'),JSON.stringify(record))};
 const result=await executeGtImport(engine,{operation:'save',id,values:{Headline:'Persisted'}});assert.equal(result.saved,true);assert.equal(JSON.parse(await readFile(join(root,'saved.json'),'utf8')).values.Headline,'Persisted');
 const before=record.values;engine.save=async()=>{throw Error('disk full');};await assert.rejects(executeGtImport(engine,{operation:'save',id,values:{Headline:'Rejected'}}),/disk full/);assert.equal(record.values,before);
 await assert.rejects(executeGtImport(engine,{operation:'save',id,values:{Unknown:'Rejected'}}),/inválido/);
 await writeFile(join(folder,'index.html'),'tampered');await assert.rejects(executeGtImport(engine,{operation:'save',id,values:{Headline:'Rejected'}}),/alterado/);assert.equal(record.values,before);assert.equal(nativeCalls,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
