import test from 'node:test';
import assert from 'node:assert/strict';
import {newerVersion} from './atualizacao-online.mjs';
test('release promotion follows SemVer precedence',()=>{
 const chain=['1.0.0-alpha','1.0.0-alpha.2','1.0.0-alpha.10','1.0.0-beta','1.0.0-rc.1','1.0.0','1.0.1'];
 for(let i=1;i<chain.length;i++){assert.equal(newerVersion(chain[i],chain[i-1]),true);assert.equal(newerVersion(chain[i-1],chain[i]),false);}
 assert.equal(newerVersion('1.0.0+build.2','1.0.0+build.1'),false);
});
test('legacy local versions and malformed values preserve compatibility checks',()=>{
 assert.equal(newerVersion('0.1.0-local.20261107','0.1.0-local.20261010'),true);
 for(const bad of [null,'','invalid','../1.0'])assert.throws(()=>newerVersion(bad,'1.0.0'),/Versão inválida/);
});

test('SemVer reference sequence is strictly ordered for every pair',()=>{
 const versions=['1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0'];
 for(let i=0;i<versions.length;i++)for(let j=0;j<versions.length;j++)assert.equal(newerVersion(versions[i],versions[j]),i>j,versions[i]+' vs '+versions[j]);
});
test('build metadata does not change precedence or release promotion',()=>{
 assert.equal(newerVersion('2.0.0+release.99','2.0.0+release.1'),false);
 assert.equal(newerVersion('2.0.0+release.1','2.0.0-rc.9+build.99'),true);
 assert.equal(newerVersion('2.0.0-rc.9+build.99','2.0.0+release.1'),false);
});
