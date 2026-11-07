import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,createHash,verify} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {OnlineUpdateEngine,defaultFeed} from './atualizacao-online.mjs';
test('real publisher generates signed feed, exact changelog and immutable assets in QA',async t=>{
 const parent=fileURLToPath(new URL('../qa-finalizacao/release-publisher/',import.meta.url));await mkdir(parent,{recursive:true});
 const root=await mkdtemp(join(parent,'run-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const pkg=join(root,'package'),channel=join(root,'channel'),assets=join(root,'assets');await mkdir(join(pkg,'painel/remoto'),{recursive:true});
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 await writeFile(join(root,'qa-private.pem'),privateKey.export({type:'pkcs8',format:'pem'}));
 await writeFile(join(pkg,'update-public.pem'),publicKey.export({type:'spki',format:'pem'}));
 const version='1.2.3-alpha.1';const files=[];
 for(const [path,text] of [['version.json',JSON.stringify({version})],['painel/remoto/novidades.js','window.NOVIDADES_3MIX = '+JSON.stringify({versoes:[{versao:version,itens:['QA publisher only']}]})+';']]){
  const bytes=Buffer.from(text);await writeFile(join(pkg,path),bytes);files.push({path,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 await writeFile(join(pkg,'manifest.json'),JSON.stringify({format:1,version,files}));await writeFile(join(root,'base.json'),JSON.stringify({version:'1.2.2-alpha',files:[]}));
 const args=[fileURLToPath(new URL('../scripts/distribuicao/publicar-atualizacao.mjs',import.meta.url)),'--package='+pkg,'--base='+join(root,'base.json'),'--key='+join(root,'qa-private.pem'),'--channel=beta','--canal='+channel,'--assets='+assets];
 const run=()=>spawnSync(process.execPath,args,{encoding:'utf8'});
 const first=run();assert.equal(first.status,0,first.stderr);
 const feed=JSON.parse(await readFile(join(channel,'beta/feed.json'),'utf8'));assert.equal(feed.version,version);assert.equal(feed.channel,'beta');
 const dir=join(channel,'beta/releases',version),raw=await readFile(join(dir,'manifest.json')),sig=await readFile(join(dir,'manifest.sig'));
 assert.equal(verify(null,raw,publicKey,sig),true);
 const manifest=JSON.parse(raw);assert.equal(manifest.version,version);assert.equal(manifest.novidades[0].itens[0],'QA publisher only');
 for(const f of manifest.files){const bytes=await readFile(join(assets,f.sha256));assert.equal(bytes.length,f.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);}
 const installed=join(root,'installed');await mkdir(installed);
 await writeFile(join(installed,'version.json'),JSON.stringify({version:'1.2.2-alpha'}));
 await writeFile(join(installed,'update-public.pem'),publicKey.export({type:'spki',format:'pem'}));
 const responses=new Map([[defaultFeed('beta'),await readFile(join(channel,'beta/feed.json'))],[feed.manifestUrl,raw],[feed.signatureUrl,sig]]);
 for(const f of manifest.files)responses.set(manifest.filesBaseUrl+f.sha256,await readFile(join(assets,f.sha256)));
 const engine=new OnlineUpdateEngine(installed,{transport:async(url,max,options={})=>{
  const bytes=responses.get(String(url));assert.ok(bytes,'unexpected publication URL '+url);assert.ok(bytes.length<=max);
  if(options.onChunk){await options.onChunk(bytes);return bytes.length;}return bytes;
 }});
 assert.equal((await engine.execute('update_check')).version,version);
 const downloaded=await engine.execute('update_download');assert.equal(downloaded.status,'downloaded');
 for(const f of manifest.files)assert.equal(createHash('sha256').update(await readFile(join(downloaded.packagePath,f.path))).digest('hex'),f.sha256);
 assert.equal(JSON.parse(await readFile(join(installed,'version.json'),'utf8')).version,'1.2.2-alpha');
 const before=await readFile(join(channel,'beta/feed.json'));const duplicate=run();assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/já foi publicada/);assert.deepEqual(await readFile(join(channel,'beta/feed.json')),before);
});
