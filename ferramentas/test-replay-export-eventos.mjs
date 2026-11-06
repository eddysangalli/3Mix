// Teste real da exportacao de lances do Replay (DiskReplay.exportEvent/exportEvents),
// motivado pela auditoria vMix 30: "Export All Events"/"Export Selected Events" nao tinham
// equivalente -- confirmado por busca, nao suposicao. Diferente de test-replay-vmix-api.mjs
// (que usa arquivos .mp4 fake só de nome), este teste gera CLIPES DE VIDEO REAIS com FFmpeg
// (o mesmo binario que o motor usa) para provar que a cópia de bytes funciona de ponta a
// ponta, não apenas a lógica de seleção de eventos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const qaRoot=fileURLToPath(new URL('../qa-finalizacao/replay-export-tests/',import.meta.url));
async function temporaryRoot(){await mkdir(qaRoot,{recursive:true});return mkdtemp(join(qaRoot,'case-'));}
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DiskReplay} from './replay-disco.mjs';

function temClipeReal(){
  const r=spawnSync('ffmpeg',['-version']);
  return r.status===0;
}

async function novoReplay(root){
  const replay=new DiskReplay({root,getObs:()=>({})});
  replay.scope='Colecao Teste';
  // Mesmo mock mínimo de test-replay-vmix-api.mjs: só o que status()/scopeState() leem de
  // fato (GetSceneCollectionList e GetSceneList) -- sem simular um motor completo.
  replay.req=async(type)=>{
    if(type==='GetSceneCollectionList')return {currentSceneCollectionName:'Colecao Teste'};
    if(type==='GetSceneList')return {scenes:[],currentProgramSceneName:'',currentPreviewSceneName:''};
    return {};
  };
  replay.optional=replay.req;
  replay.save=async()=>{}; // isola o teste do disco de configuração real (mesmo padrão de test-replay-vmix-api.mjs)
  return replay;
}

async function gerarClipe(dir,nome,segundos=1){
  const file=join(dir,nome);
  const videoSrc=`color=c=blue:s=160x90:d=${segundos}`;
  const audioSrc=`sine=frequency=1000:duration=${segundos}`;
  const r=spawnSync('ffmpeg',['-hide_banner','-v','error','-y','-f','lavfi','-i',videoSrc,
    '-f','lavfi','-i',audioSrc,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
    '-c:a','aac','-shortest',file]);
  if(r.status!==0)throw Error('Falha ao gerar clipe de teste: '+(r.stderr?.toString()||''));
  return file;
}

test('export-event copia os clipes reais de um lance para a pasta pedida, com nomes legíveis', async()=>{
  if(!temClipeReal()){console.log('SKIP: ffmpeg indisponível neste ambiente');return;}
  const root=await temporaryRoot();
  try{
    const origem=join(root,'gravacoes','replay','capturas');await mkdir(origem,{recursive:true});
    const clipeCam1=await gerarClipe(origem,'cam1.mp4');
    const clipeCam2=await gerarClipe(origem,'cam2.mp4');
    const replay=await novoReplay(root);
    replay.state.events=[{id:'ev1',name:'GOL TIME A',dur:1,clips:[{cam:'CAM 1',file:clipeCam1},{cam:'CAM 2',file:clipeCam2}]}];

    const destino=join(root,'export-destino');
    const status=await replay.command('export-event',{eventId:'ev1',directory:destino});

    assert.ok(status.export,'resposta deve incluir export');
    assert.equal(status.export.directory,destino);
    assert.equal(status.export.events.length,1);
    const [exportado]=status.export.events;
    assert.equal(exportado.eventId,'ev1');
    assert.equal(exportado.arquivos.length,2,'um arquivo exportado por câmera do lance');
    assert.ok(exportado.arquivos.every(a=>!a.erro),'nenhum arquivo deveria falhar (origem existe)');

    // Os bytes de verdade foram copiados -- não é um registro fictício.
    const arquivosNaPasta=await readdir(destino);
    assert.equal(arquivosNaPasta.length,2);
    for(const a of exportado.arquivos){
      const copiado=await readFile(a.path),original=await readFile(a.cam==='CAM 1'?clipeCam1:clipeCam2);
      assert.deepEqual(copiado,original,'arquivo exportado deve ser byte-a-byte igual ao clipe original');
    }
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('export-events sem eventIds exporta TODOS os lances (equivalente a "Export All Events" do vMix)', async()=>{
  if(!temClipeReal()){console.log('SKIP: ffmpeg indisponível neste ambiente');return;}
  const root=await temporaryRoot();
  try{
    const origem=join(root,'gravacoes','replay','capturas');await mkdir(origem,{recursive:true});
    const c1=await gerarClipe(origem,'a.mp4'),c2=await gerarClipe(origem,'b.mp4');
    const replay=await novoReplay(root);
    replay.state.events=[
      {id:'ev1',name:'LANCE 1',dur:1,clips:[{cam:'CAM 1',file:c1}]},
      {id:'ev2',name:'LANCE 2',dur:1,clips:[{cam:'CAM 1',file:c2}]},
    ];
    const destino=join(root,'tudo');
    const status=await replay.command('export-events',{directory:destino});
    assert.equal(status.export.events.length,2,'todos os lances devem ser exportados');
    assert.deepEqual(status.export.events.map(e=>e.eventId).sort(),['ev1','ev2']);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('export-events com eventIds exporta só os selecionados, na ordem enviada (equivalente a "Export Selected Events")', async()=>{
  if(!temClipeReal()){console.log('SKIP: ffmpeg indisponível neste ambiente');return;}
  const root=await temporaryRoot();
  try{
    const origem=join(root,'gravacoes','replay','capturas');await mkdir(origem,{recursive:true});
    const c1=await gerarClipe(origem,'a.mp4'),c2=await gerarClipe(origem,'b.mp4'),c3=await gerarClipe(origem,'c.mp4');
    const replay=await novoReplay(root);
    replay.state.events=[
      {id:'ev1',name:'LANCE 1',dur:1,clips:[{cam:'CAM 1',file:c1}]},
      {id:'ev2',name:'LANCE 2',dur:1,clips:[{cam:'CAM 1',file:c2}]},
      {id:'ev3',name:'LANCE 3',dur:1,clips:[{cam:'CAM 1',file:c3}]},
    ];
    const destino=join(root,'selecionados');
    const status=await replay.command('export-events',{eventIds:['ev3','ev1'],directory:destino});
    assert.deepEqual(status.export.events.map(e=>e.eventId),['ev3','ev1'],'ordem enviada preservada, ev2 ausente');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('export-event: lance inexistente é rejeitado explicitamente, nunca silenciosamente ignorado', async()=>{
  const root=await temporaryRoot();
  try{
    const replay=await novoReplay(root);
    replay.state.events=[];
    await assert.rejects(replay.command('export-event',{eventId:'nao-existe'}),/não encontrado/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('export-events: lista de ids vazia ou id inexistente na seleção é rejeitada, nunca exporta parcialmente sem avisar', async()=>{
  const root=await temporaryRoot();
  try{
    const replay=await novoReplay(root);
    replay.state.events=[{id:'ev1',name:'LANCE 1',dur:1,clips:[]}];
    await assert.rejects(replay.command('export-events',{eventIds:[]}),/Selecione de 1 a 500/);
    await assert.rejects(replay.command('export-events',{eventIds:['ev1','nao-existe']}),/não existe mais/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('export-event: lance sem clipes é relatado com erro explícito no evento, não lançado como falha geral', async()=>{
  const root=await temporaryRoot();
  try{
    const replay=await novoReplay(root);
    replay.state.events=[{id:'ev1',name:'LANCE VAZIO',dur:1,clips:[]}];
    const status=await replay.command('export-event',{eventId:'ev1'});
    assert.equal(status.export.events[0].erro,'Lance sem clipe gravado');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('export-event: clipe cujo arquivo original foi apagado do disco aparece com erro por câmera, sem interromper os demais', async()=>{
  if(!temClipeReal()){console.log('SKIP: ffmpeg indisponível neste ambiente');return;}
  const root=await temporaryRoot();
  try{
    const origem=join(root,'gravacoes','replay','capturas');await mkdir(origem,{recursive:true});
    const existente=await gerarClipe(origem,'existe.mp4');
    const replay=await novoReplay(root);
    replay.state.events=[{id:'ev1',name:'LANCE',dur:1,clips:[
      {cam:'CAM 1',file:join(origem,'apagado.mp4')},
      {cam:'CAM 2',file:existente},
    ]}];
    const status=await replay.command('export-event',{eventId:'ev1',directory:join(root,'saida')});
    const [evt]=status.export.events;
    const cam1=evt.arquivos.find(a=>a.cam==='CAM 1'),cam2=evt.arquivos.find(a=>a.cam==='CAM 2');
    assert.ok(cam1.erro,'CAM 1 sem arquivo original deve reportar erro');
    assert.ok(!cam1.path);
    assert.ok(cam2.path,'CAM 2 com arquivo original deve ser copiada normalmente');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('exportDestination: diretório relativo ou com caractere de controle é rejeitado (mesma regra de segurança usada em outras pastas de produção)', async()=>{
  const root=await temporaryRoot();
  try{
    const replay=await novoReplay(root);
    assert.throws(()=>replay.exportDestination('pasta/relativa'),/caminho absoluto/);
    assert.throws(()=>replay.exportDestination('C:\\ok\x01ruim'),/caminho absoluto/);
    // Vazio é válido: usa o destino padrão dentro da instalação.
    assert.doesNotThrow(()=>replay.exportDestination(''));
  } finally { await rm(root,{recursive:true,force:true}); }
});
