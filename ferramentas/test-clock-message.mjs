// Non-native regression check for the production clock message slot.
// The full CEF/OBS integration remains covered by test-relogios.mjs on Windows.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {runInNewContext,Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const topbar=readFileSync(resolve(root,'painel/topbar.html'),'utf8');
const mesa=readFileSync(resolve(root,'painel/mesa.html'),'utf8');
const snippet=readFileSync(resolve(root,'ferramentas/relogios.snippet.js'),'utf8');

const fn=topbar.match(/  async function clockText\(c, rec, str\) \{[\s\S]*?\n  \}\n  setInterval/);
assert.ok(fn,'clockText deve continuar disponível na barra superior');
const clockText=runInNewContext(`${fn[0].replace(/\n  setInterval$/,'')}\nclockText`,{});

for(const [message,expected] of [
  ['Trocar para câmera 2','Trocar para câmera 2'],
  ['   ÚLTIMO MINUTO   ','ÚLTIMO MINUTO'],
  ['', 'MENSAGEM'],
  ['A'.repeat(60),'A'.repeat(40)],
]){
  const result=await clockText({type:'message',message},null,null);
  assert.equal(result.text,expected);
  assert.equal(result.cls,'amber');
}

for(const source of [mesa,snippet]){
  assert.match(source,/\["message", "Mensagem da produção"\]/);
  assert.match(source,/data-ck-message="1"/);
  assert.match(source,/maxlength="40"/);
  assert.match(source,/message: \(v\("ck-m"\)/);
}
assert.match(topbar,/el\.textContent = r\.text/,'mensagem deve ser desenhada como texto, não HTML');

// Parse all inline scripts too; syntax mistakes in the legacy operator UI
// are otherwise easy to overlook without a running Windows/CEF environment.
for(const [name,html] of [['mesa.html',mesa],['topbar.html',topbar]]){
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
    if(script[1].trim())new Script(script[1],{filename:name});
  }
}
console.log('PASS: mensagem nos relógios (modelo, configuração, escape e sintaxe)');
