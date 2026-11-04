import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,rm,access} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {apply,rollback,inspect} from './atualizar-3mix.mjs';import {alphaReleaseDocuments} from '../scripts/distribuicao/update-path-policy.mjs';
test('actual GT, SRT and alpha document payload installs and rolls back with QA signature',async()=>{
 const repo=fileURLToPath(new URL('../',import.meta.url)),base=path.join(repo,'qa-finalizacao/vmix30-distribuicao');await mkdir(base,{recursive:true});const work=await mkdtemp(path.join(base,'payload-'));
 const root=path.join(work,'installation'),pkg=path.join(work,'package');await mkdir(path.join(root,'runtime'),{recursive:true});await mkdir(pkg);
 const {publicKey,privateKey}=generateKeyPairSync('ed25519'),key=publicKey.export({type:'spki',format:'pem'}),hash=b=>createHash('sha256').update(b).digest('hex');
 const names=['painel/gc/biblioteca/core.js','painel/gc/biblioteca/modelos.js','painel/gc/biblioteca/render.js','painel/remoto/gc.js','ferramentas/srt-presets.mjs','ferramentas/atualizar-3mix.mjs',...alphaReleaseDocuments];
 try{
 await copyFile(path.join(repo,'../3mix-runtime/runtime/freemix-process-info.exe'),path.join(root,'runtime/freemix-process-info.exe'));await writeFile(path.join(root,'version.json'),JSON.stringify({version:'1.0.0'}));
 const existing=names[0];await mkdir(path.dirname(path.join(root,existing)),{recursive:true});await writeFile(path.join(root,existing),'previous player');
 const files=[];for(const name of names){const bytes=await readFile(path.join(repo,name));await mkdir(path.dirname(path.join(pkg,name)),{recursive:true});await writeFile(path.join(pkg,name),bytes);files.push({path:name,size:bytes.length,sha256:hash(bytes)});}
 const version=Buffer.from(JSON.stringify({version:'1.1.0-qa-only'}));await writeFile(path.join(pkg,'version.json'),version);files.push({path:'version.json',size:version.length,sha256:hash(version)});
 const manifest=Buffer.from(JSON.stringify({format:1,version:'1.1.0-qa-only',files}));await writeFile(path.join(pkg,'manifest.json'),manifest);await writeFile(path.join(pkg,'manifest.sig'),sign(null,manifest,privateKey));
 await inspect(root,pkg,key);const result=await apply(root,pkg,key);
 for(const name of names)assert.equal(hash(await readFile(path.join(root,name))),hash(await readFile(path.join(repo,name))),name);
 await rollback(root,result.backup);assert.equal(await readFile(path.join(root,existing),'utf8'),'previous player');assert.equal(JSON.parse(await readFile(path.join(root,'version.json'),'utf8')).version,'1.0.0');
 await assert.rejects(access(path.join(root,names[1])));
 await writeFile(path.join(base,'payload-rehearsal.json'),JSON.stringify({qaOnly:true,productionKeyUsed:false,operatorModified:false,files:names.length,signatureValidated:true,installedHashesVerified:true,rollbackVerified:true},null,2));
 }finally{await rm(work,{recursive:true,force:true});}
});
