import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('updater process guard includes branded 3Mix and legacy engine processes',async()=>{
 const source=await readFile(new URL('./atualizar-3mix.mjs',import.meta.url),'utf8');
 // Extract the exact regex used to read tasklist CSV, not a parallel implementation.
 const start=source.indexOf('line.match(')+11,end=source.indexOf(')?.[1]',start);
 const raw=source.slice(start,end);const regex=Function('return '+raw)();
 for(const name of ['3Mix.exe','FreeMix.exe','obs64.exe','node.exe','powershell.exe','pwsh.exe'])assert.equal(regex.exec('"'+name+'","1234","Console"')?.[1],'1234',name);
 assert.equal(regex.test('"unrelated.exe","1234","Console"'),false);
});
