import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('original navigation contains only Audio Replay Color, preserving production actions',async()=>{
 const html=await readFile(new URL('../painel/topbar.html',import.meta.url),'utf8');
 const nav=html.match(/<nav class="grp workspace-tabs"[\s\S]*?<\/nav>/)?.[0];assert.ok(nav);
 assert.equal((nav.match(/<button/g)||[]).length,3);
 assert.ok(!html.includes('data-do="mesa"'));
 for(const action of ['data-do="audio"','data-open="replay"','data-open="color"','data-do="presetsave"','data-do="fullscreen"','data-open="settings"','data-open="mainmenu"'])assert.ok(html.includes(action),action);
});
