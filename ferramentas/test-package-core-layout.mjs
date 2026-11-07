import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./empacotar-limpo.mjs',import.meta.url),'utf8');
test('base package includes OBS33 core modules',()=>{
 const line=source.split(String.fromCharCode(10)).find(line=>line.startsWith("for(const folder of ['bin'"));
 assert.ok(line); assert.ok(line.includes("'core'"));
});
test('explicit native rundir also contributes its own core modules',()=>{
 const line=source.split(String.fromCharCode(10)).find(line=>line.startsWith('if(nativeRundir)for(const folder'));
 assert.ok(line); assert.ok(line.includes("'core'"));
});
