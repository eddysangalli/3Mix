import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {OnlineUpdateEngine,defaultFeed,CHANNEL_BASE} from './atualizacao-online.mjs';

async function fixture(t,{tampered=false,feedVersion='1.1.0-alpha',manifestChannel='beta',signedBase=true}={}){
 const base=new URL('../qa-finalizacao/online-channel/',import.meta.url);await mkdir(base,{recursive:true});
 const root=await mkdtemp(new URL('run-',base));t.after(()=>rm(root,{recursive:true,force:true}));
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 await writeFile(join(root,'update-public.pem'),publicKey.export({type:'spki',format:'pem'}));
 await writeFile(join(root,'version.json'),JSON.stringify({version:'1.0.0-alpha'}));
 const payload=Buffer.from(JSON.stringify({version:'1.1.0-alpha'}));
 const digest=createHash('sha256').update(payload).digest('hex');
 const manifest=Buffer.from(JSON.stringify({format:1,channel:manifestChannel,version:'1.1.0-alpha',assetNaming:'sha256',filesBaseUrl:signedBase?CHANNEL_BASE+'qa-assets/':undefined,novidades:[{itens:['Ensaio exclusivo de QA']}],files:[{path:'version.json',size:payload.length,sha256:digest}]}));
 const signature=sign(null,manifest,privateKey);if(tampered)signature[0]^=1;
 const entries=new Map([[defaultFeed('beta'),Buffer.from(JSON.stringify({format:1,version:feedVersion,filesBaseUrl:CHANNEL_BASE+'qa-assets/',manifestUrl:CHANNEL_BASE+'qa-manifest.json',signatureUrl:CHANNEL_BASE+'qa-manifest.sig'}))],[CHANNEL_BASE+'qa-manifest.json',manifest],[CHANNEL_BASE+'qa-manifest.sig',signature],[CHANNEL_BASE+'qa-assets/'+digest,payload]]);
 const requests=[];
 const engine=new OnlineUpdateEngine(root,{transport:async(url,max,options={})=>{
  requests.push(String(url));const bytes=entries.get(String(url));assert.ok(bytes,'unexpected URL '+url);assert.ok(bytes.length<=max);
  if(options.onChunk){await options.onChunk(bytes);return bytes.length;}return bytes;
 }});
 return {root,engine,payload,requests};
}
test('online feed validates signature, downloads hash-named payload and preserves installed version',async t=>{
 const {root,engine,payload,requests}=await fixture(t);
 const checked=await engine.execute('update_check');assert.equal(checked.status,'available');assert.equal(checked.version,'1.1.0-alpha');assert.equal(checked.novidades[0].itens[0],'Ensaio exclusivo de QA');
 const downloaded=await engine.execute('update_download');assert.equal(downloaded.status,'downloaded');
 assert.deepEqual(await readFile(join(downloaded.packagePath,'version.json')),payload);
 assert.equal(JSON.parse(await readFile(join(root,'version.json'),'utf8')).version,'1.0.0-alpha');
 assert.equal(requests.length,4);assert.ok((await readFile(join(downloaded.packagePath,'manifest.sig'))).length===64);
});
test('tampered signature is rejected before payload download',async t=>{
 const {engine,requests}=await fixture(t,{tampered:true});
 await assert.rejects(engine.execute('update_check'),/Assinatura/);assert.equal(engine.last.status,'error');assert.equal(engine.checked,null);assert.equal(requests.length,3);
});

test('feed version must exactly match the signed manifest',async t=>{
 const {engine,requests}=await fixture(t,{feedVersion:'1.2.0-alpha'});
 await assert.rejects(engine.execute('update_check'),/diverge do manifesto/);
 assert.equal(engine.checked,null);assert.equal(requests.length,3);
});
test('valid signature does not allow a different release channel',async t=>{
 const {engine,requests}=await fixture(t,{manifestChannel:'stable'});
 await assert.rejects(engine.execute('update_check'),/não do canal escolhido/);
 assert.equal(engine.checked,null);assert.equal(requests.length,3);
});

test('unsigned feed cannot supply the payload origin absent from signed manifest',async t=>{
 const {engine,requests}=await fixture(t,{signedBase:false});
 await assert.rejects(engine.execute('update_check'),/Origem dos arquivos inválida/);
 assert.equal(engine.checked,null);assert.equal(requests.length,3);
});

test('signed manifest must explicitly identify a supported channel',async t=>{
 for(const channel of [null,'','alpha','unknown']){
  const {engine,requests}=await fixture(t,{manifestChannel:channel});
  await assert.rejects(engine.execute('update_check'),/sem canal válido/);
  assert.equal(engine.checked,null);assert.equal(requests.length,3);
 }
});

test('download revalidates against the current trust key before fetching payload',async t=>{
 const {root,engine,requests}=await fixture(t);
 await engine.execute('update_check');assert.equal(requests.length,3);
 const replacement=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
 await writeFile(join(root,'update-public.pem'),replacement);
 await assert.rejects(engine.execute('update_download'),/Assinatura/);
 assert.equal(requests.length,3);assert.equal(engine.last.status,'error');assert.equal(engine.last.packagePath,null);
});
