import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';import {join} from 'node:path';import {generateKeyPairSync,createHash,verify} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const tamper of [false,true])test('local publication rehearsal, tampered='+tamper,async()=>{
 const qa=new URL('../qa-finalizacao/',import.meta.url);await mkdir(qa,{recursive:true});const root=await mkdtemp(new URL('publish-assets-',qa));
 try{
 const pkg=join(root,'package'),channel=join(root,'channel'),assets=join(root,'assets');await mkdir(join(pkg,'painel/remoto'),{recursive:true});
 const version='0.1.0-qa.1',versionBytes=JSON.stringify({version}),payload='own QA payload';
 await writeFile(join(pkg,'version.json'),versionBytes);await writeFile(join(pkg,'payload.txt'),tamper?'tampered':payload);
 await writeFile(join(pkg,'painel/remoto/novidades.js'),'window.NOVIDADES_3MIX = '+JSON.stringify({versoes:[{versao:version}]} )+';');
 const files=[{path:'version.json',size:Buffer.byteLength(versionBytes),sha256:hash(versionBytes)},{path:'payload.txt',size:Buffer.byteLength(payload),sha256:hash(payload)}];
 await writeFile(join(pkg,'manifest.json'),JSON.stringify({version,files}));await writeFile(join(root,'base.json'),JSON.stringify({version:'0.1.0-qa.0',files:[]}));
 const keys=generateKeyPairSync('ed25519');await writeFile(join(root,'qa-private.pem'),keys.privateKey.export({type:'pkcs8',format:'pem'}));await writeFile(join(pkg,'update-public.pem'),keys.publicKey.export({type:'spki',format:'pem'}));
 await mkdir(assets,{recursive:true});await writeFile(join(assets,'existing-qa'),'preserve');
 await mkdir(join(channel,'beta/releases/older'),{recursive:true});await writeFile(join(channel,'beta/releases/older/manifest.json'),'old receipt');
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/distribuicao/publicar-atualizacao.mjs',import.meta.url)),'--package='+pkg,'--base='+join(root,'base.json'),'--key='+join(root,'qa-private.pem'),'--channel=beta','--canal='+channel,'--assets='+assets],{encoding:'utf8',timeout:10000});
 assert.equal(await readFile(join(assets,'existing-qa'),'utf8'),'preserve');
 assert.equal(await readFile(join(channel,'beta/releases/older/manifest.json'),'utf8'),'old receipt');
 if(tamper){assert.notEqual(result.status,0);assert.match(result.stderr,/diverge do manifesto/);await assert.rejects(access(join(channel,'beta/feed.json')));}
 else{assert.equal(result.status,0,result.stderr);const raw=await readFile(join(channel,'beta/releases',version,'manifest.json')),sig=await readFile(join(channel,'beta/releases',version,'manifest.sig'));assert.ok(verify(null,raw,keys.publicKey,sig));assert.equal(await readFile(join(assets,hash(payload)),'utf8'),payload);}
 }finally{await rm(root,{recursive:true,force:true});}
});
