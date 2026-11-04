// Teste real do arquivo de produção multiview-modelos.js (import direto do bytecode via vm,
// mesmo padrao de test-clock-message.mjs -- nao e clone). Motivado pela auditoria vMix 30
// secao 3.1: o vMix anuncia layouts fixos de 10/12/24; o 3Mix já tinha um MultiView LIVRE
// (arrastar/redimensionar/imã, em multiview-montagem.js) que o relatorio anterior classificou
// como "ausente" por engano. Este teste cobre só o que foi de fato adicionado nesta rodada:
// presets de grade 6/8/10/12/16/24 como pontos de partida editáveis -- não substituem a
// composição livre, apenas evitam montar a grade manualmente tile a tile.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createContext,runInContext} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const src=readFileSync(resolve(root,'painel/remoto/multiview-modelos.js'),'utf8');

// window precisa existir (o arquivo faz window.MV3=...); localStorage não é usado por
// MODELOS/tile/grade, só por carregar()/salvar(), que este teste não exercita.
const sandbox={};
sandbox.window=sandbox;
createContext(sandbox);
runInContext(src,sandbox,{filename:'multiview-modelos.js'});
const MV3=sandbox.MV3;
assert.ok(MV3 && Array.isArray(MV3.MODELOS),'window.MV3.MODELOS deve existir após carregar o arquivo real');

const porId=new Map(MV3.MODELOS.map((m)=>[m.id,m]));

// 1. Nenhum id duplicado -- cada preset precisa ser navegável sem colisão no <select> da UI.
const ids=MV3.MODELOS.map((m)=>m.id);
assert.equal(new Set(ids).size,ids.length,'IDs de modelos devem ser únicos: ' + ids.join(','));

// 2. Os modelos que já existiam antes desta rodada continuam presentes e intocados (zero
//    regressão nos presets em uso real, só adição).
for(const idAntigo of ['h-2-8','h-2-12','h-1-5','h-4','h-9','h-v','v-empilhado','v-1-4','v-916']){
  assert.ok(porId.has(idAntigo), `Preset pré-existente "${idAntigo}" não pode desaparecer`);
}

// 3. Os novos presets de grade pedidos pelo superprompt (seção 3.1: "presets rápidos para 4,
//    6, 8, 10, 12, 16 e 24 entradas") existem com a contagem de tiles exata, todos monitor
//    horizontal (os únicos citados), formato 16:9 (default de tile()).
const novasGrades={'h-6':6,'h-8':8,'h-10':10,'h-12':12,'h-16':16,'h-24':24};
for(const [id,qtd] of Object.entries(novasGrades)){
  const m=porId.get(id);
  assert.ok(m,`Preset novo "${id}" deve existir`);
  assert.equal(m.monitor,'horizontal',`"${id}" deve ser para monitor horizontal`);
  const tiles=m.tiles();
  assert.equal(tiles.length,qtd,`"${id}" deve ter exatamente ${qtd} tiles, veio ${tiles.length}`);
  assert.ok(tiles.every((t)=>t.tipo==='auto'),`"${id}": todo tile de grade deve ser tipo "auto" (automático, ordem da mesa)`);
}

// 4. Geometria real: cada grade nova cobre o monitor 1920x1080 sem estourar os limites e sem
//    sobrepor tiles entre si (a montagem salva confia nessa geometria; sobreposição ou
//    estouro quebraria o encaixe/imã da tela de edição).
const [W,H]=MV3.TAMANHO.horizontal;
function semSobreposicao(tiles){
  for(let i=0;i<tiles.length;i++){
    const a=tiles[i];
    assert.ok(a.x>=0 && a.y>=0 && a.x+a.w<=W+0.01 && a.y+a.h<=H+0.01, `tile ${i} fora dos limites do monitor: ${JSON.stringify(a)}`);
    for(let j=i+1;j<tiles.length;j++){
      const b=tiles[j];
      const sobrepoe=a.x<b.x+b.w && b.x<a.x+a.w && a.y<b.y+b.h && b.y<a.y+a.h;
      assert.ok(!sobrepoe, `tiles ${i} e ${j} se sobrepõem: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    }
  }
}
for(const id of Object.keys(novasGrades)) semSobreposicao(porId.get(id).tiles());

// 5. novaMontagem() continua funcionando com os presets novos (o fluxo real de "Nova
//    montagem" na tela de edição passa o id escolhido direto para isso).
const montagemNova=MV3.novaMontagem('Teste 24', 'h-24');
assert.equal(montagemNova.tiles.length,24,'novaMontagem com h-24 deve produzir 24 tiles');
assert.equal(montagemNova.monitor,'horizontal');

// 6. Sintaxe: o arquivo inteiro já foi executado acima via runInContext sem lançar -- se
// houvesse erro de sintaxe ou de referência, a chamada anterior já teria falhado.
console.log('PASS: presets de MultiView 6/8/10/12/16/24 (modelo, geometria, ids, novaMontagem)');
