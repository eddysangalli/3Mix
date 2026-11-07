// Requires explicit local downloads; never downloads, installs or loads plugin code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectPluginZip} from './plugin-manager.mjs';
const root=process.env.THREEMIX_PLUGIN_PACKAGE_DIR;
if(!root)throw Error('Defina THREEMIX_PLUGIN_PACKAGE_DIR para os ZIPs oficiais verificados');
const cases=[
 {file:'advanced-masks.zip',id:'obs-advanced-masks',sha:'01461323311160438db2c45abe6da916775c55d264f06efa8f11c20d3b5d904e',version:'1.6.1',resource:'manifest.json',dataCount:21},
 {file:'shaderfilter.zip',id:'obs-shaderfilter',sha:'bdb5af0c8d6afb9b488a0dd4235a26786c221fb01d9082786e51aceb0deae37d',version:'2.6.1',resource:'manifest.json',dataCount:189},
 {file:'color-monitor.zip',id:'color-monitor',sha:'93371aa1b236e461c8fcaa3ee1ba2bb71480e931fe9bf5edceb9ae8041e884f8',version:null,resource:'waveform.effect',dataCount:15},
];
for(const fixture of cases)test(fixture.id+' official package retains runtime resources and declared metadata',()=>{
 const bytes=readFileSync(join(root,fixture.file));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.sha);
 const result=inspectPluginZip(bytes);
 assert.equal(result.id,fixture.id);assert.ok(result.bin.has(fixture.id+'.dll'));
 assert.equal(result.data.size,fixture.dataCount);assert.ok(result.data.has(fixture.resource));
 assert.ok(![...result.bin.keys()].some(name=>/\.(pdb|ilk|exp|lib)$/i.test(name)));
 assert.equal(result.metadata.version,fixture.version);
 if(fixture.version)assert.equal(result.metadata.metadataSource,'package-manifest');
 assert.equal(result.metadata.signature,null);assert.equal(result.metadata.license,null);
});
