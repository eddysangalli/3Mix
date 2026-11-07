import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('installer guide names the actual branded uninstaller',async()=>{
 const setup=await readFile(new URL('../scripts/installer-windows/Setup.cs',import.meta.url),'utf8');
 const guide=await readFile(new URL('../scripts/installer-windows/README.md',import.meta.url),'utf8');
 const name=/string executable = Path.combine\(root, "([^"]+)"\)/i.exec(setup)?.[1];
 assert.equal(name,'Desinstalar 3Mix.exe');
 assert.ok(guide.includes('`'+name+'`'));
 assert.ok(!guide.includes('Desinstalar FreeMix'));
});

test('guide does not present verify-only as Ed25519 or native startup proof',async()=>{
 const guide=await readFile(new URL('../scripts/installer-windows/README.md',import.meta.url),'utf8');
 assert.ok(guide.includes('não executa a validação Ed25519'));
 assert.ok(guide.includes('Hash incorporado não substitui Authenticode'));
 assert.ok(guide.includes('não comprova assinatura do manifesto, instalação ou abertura do motor'));
});

test('verify log explicitly distinguishes payload hash from manifest signature',async()=>{
 const setup=await readFile(new URL('../scripts/installer-windows/Setup.cs',import.meta.url),'utf8');
 const marker=setup.split('VERIFY PASS;')[1]?.split('"')[0];
 assert.ok(marker);for(const field of ['payloadSha256Verified=true','zipStructureVerified=true','manifestSignatureVerified=false','installed=false','appStarted=false'])assert.ok(marker.includes(field),field);
});
