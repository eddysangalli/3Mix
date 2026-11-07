import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDeclaredPluginMetadata as read} from './plugin-package-metadata.mjs';
const encode=value=>Buffer.from(JSON.stringify(value));
test('manifest source contains no literal NUL bytes',()=>{assert.equal(readFileSync(new URL('./plugin-package-metadata.mjs',import.meta.url)).includes(0),false);});
test('missing metadata stays unknown',()=>{assert.deepEqual(read(null,'demo'),{});});
test('declared identity and descriptive fields are retained without trust claims',()=>{
 const r=read(encode({name:'demo',display_name:'Demo',version:'1.2.3',authors:['Author'],description:'Description',license:'untrusted',signature:'untrusted'}),'demo');
 assert.equal(r.version,'1.2.3');assert.equal(r.developer,'Author');assert.equal(r.metadataSource,'package-manifest');assert.equal(r.license,undefined);assert.equal(r.signature,undefined);
});
test('malformed, oversized, wrong identity and control characters are rejected',()=>{
 for(const bytes of [Buffer.from('{'),Buffer.alloc(65537),encode([]),encode({name:'other'}),encode({name:'demo',version:42}),encode({name:'demo',authors:['bad'+String.fromCharCode(0)]})])assert.throws(()=>read(bytes,'demo'));
});
