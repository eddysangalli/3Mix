import test from 'node:test';import assert from 'node:assert/strict';import {readFile,access} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
test('native build script resolves canonical engine sibling, not nested missing path',async()=>{
 const script=new URL('../scripts/build/compilar-2026.ps1',import.meta.url),source=await readFile(script,'utf8');
 assert.match(source,/Split-Path -Parent \$repo/);assert.match(source,/Join-Path \$root '3mix-engine'/);
 const repo=path.resolve(path.dirname(fileURLToPath(script)),'../..');await access(path.resolve(repo,'../3mix-engine/CMakeLists.txt'));
 assert.match(source,/freemix-build-lock/);assert.match(source,/-ConfigureOnly/);
});
