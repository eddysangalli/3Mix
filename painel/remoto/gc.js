import {models,model,defaults,normalizeData} from '/gc/biblioteca/modelos.js';import {renderGraphic} from '/gc/biblioteca/render.js';
const el=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let id=null,template=models[0].id,state={},fingerprint='',dirty=false;
const styleKeys=['accent','secondary','background','foreground','designStyle','opacity','fontSize','letterSpacing','offsetX','offsetY','scale','fontFamily','fontAsset','imageAsset','imageX','imageY','imageWidth','imageHeight','imageOpacity','animation','animationInMs','animationOutMs','animationEasing'];
const PRESET_PALETTES=[
  {name:'🔴 TV Notícias Pro',accent:'#e11d48',secondary:'#fb7185',background:'#111622',foreground:'#ffffff',designStyle:'classic_tv',animation:'slide'},
  {name:'🔵 Royal Broadcast',accent:'#0284c7',secondary:'#38bdf8',background:'#0d1726',foreground:'#ffffff',designStyle:'classic_tv',animation:'slide'},
  {name:'🟡 Esportes Arena Ouro',accent:'#facc15',secondary:'#10b981',background:'#0c2b20',foreground:'#ffffff',designStyle:'modern_internet',animation:'zoom'},
  {name:'🟢 Agro & Economia',accent:'#10b981',secondary:'#34d399',background:'#0a2618',foreground:'#ffffff',designStyle:'classic_tv',animation:'slide'},
  {name:'🟣 Podcast Velvet Host',accent:'#a855f7',secondary:'#ec4899',background:'#18181b',foreground:'#ffffff',designStyle:'modern_internet',animation:'fade'},
  {name:'⚡ Cyber Esports Neon',accent:'#00f0ff',secondary:'#ff007f',background:'#09090b',foreground:'#ffffff',designStyle:'esports_neon',animation:'rotate'},
  {name:'📐 Suíço Retrô Quadrado',accent:'#f59e0b',secondary:'#d97706',background:'#000000',foreground:'#ffffff',designStyle:'swiss_square',animation:'slide'},
  {name:'🏢 Corporativo Glass',accent:'#38bdf8',secondary:'#64748b',background:'#182230',foreground:'#ffffff',designStyle:'corporate_glass',animation:'blur_fade'},
  {name:'🟧 Plantão Urgente Breaking',accent:'#f97316',secondary:'#ef4444',background:'#1a1614',foreground:'#ffffff',designStyle:'classic_tv',animation:'slide'},
  {name:'🛍️ Live Commerce Oferta',accent:'#f43f5e',secondary:'#fb923c',background:'#1c1517',foreground:'#ffffff',designStyle:'modern_internet',animation:'zoom'},
  {name:'📱 Mobile Social TikTok',accent:'#06b6d4',secondary:'#ec4899',background:'#111827',foreground:'#ffffff',designStyle:'modern_internet',animation:'slide'},
  {name:'⚽ Copa dos Campeões',accent:'#fbbf24',secondary:'#22c55e',background:'#092317',foreground:'#ffffff',designStyle:'modern_internet',animation:'zoom'},
  {name:'🏛️ Apuração / Eleições',accent:'#eab308',secondary:'#3b82f6',background:'#101726',foreground:'#ffffff',designStyle:'classic_tv',animation:'slide'},
  {name:'📺 Noticiário 24h Clean',accent:'#94a3b8',secondary:'#cbd5e1',background:'#0f141c',foreground:'#ffffff',designStyle:'corporate_glass',animation:'fade'},
  {name:'⛪ Sacro & Louvor',accent:'#f59e0b',secondary:'#d97706',background:'#1c1324',foreground:'#ffffff',designStyle:'classic_tv',animation:'fade'},
  {name:'🌦️ Previsão & Clima',accent:'#38bdf8',secondary:'#facc15',background:'#0a192f',foreground:'#ffffff',designStyle:'modern_internet',animation:'slide'},
  {name:'📈 Mercado Financeiro B3',accent:'#10b981',secondary:'#06b6d4',background:'#0b151b',foreground:'#ffffff',designStyle:'corporate_glass',animation:'blur_fade'},
  {name:'🎙️ Talk Show Late Night',accent:'#c084fc',secondary:'#f43f5e',background:'#120d1c',foreground:'#ffffff',designStyle:'esports_neon',animation:'zoom'},
  {name:'🎮 Retrô 8-Bit Arcade',accent:'#22c55e',secondary:'#ec4899',background:'#050a06',foreground:'#ffffff',designStyle:'swiss_square',animation:'rotate'},
  {name:'🏁 Automobilismo F1',accent:'#ef4444',secondary:'#f97316',background:'#141416',foreground:'#ffffff',designStyle:'modern_internet',animation:'slide'}
];
function renderPalettes(){
  const box=el('palette-presets');if(!box)return;
  box.innerHTML=PRESET_PALETTES.map((p,i)=>`<button type="button" data-preset="${i}"><i style="background:${p.accent}"></i><i style="background:${p.secondary}"></i>${p.name.replace(/^[^\p{L}\p{N}]+/u,'')}</button>`).join('');
  box.onclick=e=>{
    const b=e.target.closest('[data-preset]');if(!b)return;
    const p=PRESET_PALETTES[Number(b.dataset.preset)];
    if(el('f-accent'))el('f-accent').value=p.accent;
    if(el('f-secondary'))el('f-secondary').value=p.secondary;
    if(el('f-background'))el('f-background').value=p.background;
    if(el('f-foreground'))el('f-foreground').value=p.foreground;
    if(el('f-designStyle'))el('f-designStyle').value=p.designStyle;
    if(el('f-animation') && p.animation)el('f-animation').value=p.animation;
    dirty=true;preview();buttons();
  };
}
const variantButton=document.createElement('button');variantButton.id='variant';variantButton.textContent='Criar / abrir versão H/V vinculada';el('duplicate').after(variantButton);const unlinkButton=document.createElement('button');unlinkButton.id='unlink';unlinkButton.textContent='Desvincular H/V';variantButton.after(unlinkButton);
const linkHelp=document.createElement('p');linkHelp.id='link-help';linkHelp.className='notice';el('channel').parentElement.before(linkHelp);
el('channel').innerHTML=Array.from({length:8},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
function read(){return normalizeData(template,Object.fromEntries(model(template).fields.map(f=>[f.key,el('f-'+f.key).value])));}
function preview(){try{el('preview').style.aspectRatio=model(template).orientation==='vertical'?'9 / 16':'16 / 9';el('preview').innerHTML=renderGraphic(template,read());el('status').textContent=dirty?'Edições ainda não salvas':'';}catch(e){el('status').textContent=e.message;}}
function fields(data=defaults(template)){el('model-name').textContent=model(template).name;renderPalettes();for(const [target,style] of [['fields',false],['style',true]])el(target).innerHTML=model(template).fields.filter(f=>styleKeys.includes(f.key)===style).map(f=>f.type==='asset'?`<label>${esc(f.label)}<input id="f-${f.key}" type="hidden" value="${esc(data[f.key]||'')}"><input data-gc-asset="${f.key}" data-kind="${f.kind}" type="file" accept="${f.kind==='font'?'.ttf,.otf,.woff2':'.png,.jpg,.jpeg,.webp,.bmp'}"><small>${data[f.key]?'Arquivo local importado':'Nenhum arquivo · até 2 MB'}</small><button type="button" data-remove-asset="${f.key}">Remover arquivo do título</button></label>`:`<label>${esc(f.label)}${f.type==='select'?`<select id="f-${f.key}">${f.options.map(v=>`<option ${v===data[f.key]?'selected':''} value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`:f.key==='lines'?`<textarea id="f-${f.key}" maxlength="2000">${esc(data[f.key])}</textarea>`:`<input id="f-${f.key}" type="${f.type==='color'?'color':f.type==='number'?'number':'text'}" value="${esc(data[f.key])}" ${f.type==='number'?`min="${f.min}" max="${f.max}"`:'maxlength="300"'}>`}</label>`).join('');preview();gallery();}
function gallery(){const group=el('collection').value,orientation=el('orientation').value;el('gallery').innerHTML=models.filter(m=>(group==='Todas'||m.collection===group)&&m.orientation===orientation).map(m=>`<button class="card ${template===m.id?'selected':''}" data-template="${m.id}"><img src="/gc/${m.thumbnail}" alt="Miniatura de ${esc(m.name)}"><b>${esc(m.name.split(' · ')[0])}</b><small>${esc(m.collection)}</small></button>`).join('');}
function select(item){id=item?.id||null;template=item?.template||models.find(m=>m.orientation===el('orientation').value).id;el('orientation').value=model(template).orientation;el('name').value=item?.name||model(template).name;el('channel').value=item?.channel||1;dirty=false;fields(item?.data);buttons();}
function buttons(){for(const key of ['duplicate','prepare','air','off','remove','variant','unlink'])el(key).disabled=!id||dirty;const linked=state.gcLibrary?.items?.find(i=>i.id===id)?.syncGroup;el('unlink').hidden=!linked;linkHelp.textContent=linked?'Versões H/V vinculadas: textos, cores, fontes e imagem sincronizam ao salvar. Posição e tamanho permanecem próprios de cada formato.':'Crie uma versão H/V vinculada para manter os mesmos dados nos dois formatos.';el('save').disabled=!state.connected;}
async function command(action,data={}){try{const r=await FreeMixRemote.command(action,data);state=r.state||FreeMixRemote.getState();el('status').textContent='Operação confirmada';return r.state?.gcLibrary?.last??r.gcLibrary?.last??r.result;}catch(e){el('status').textContent=e.message;throw e;}}
async function save(){const r=await command('gc_library_save',{...(id?{id}:{}),name:el('name').value,template,data:read(),channel:Number(el('channel').value)});if(!r?.id)throw Error('Servidor não confirmou o ID do título');id=r.id;dirty=false;buttons();return id;}
el('gallery').onclick=e=>{const b=e.target.closest('[data-template]');if(!b)return;template=b.dataset.template;id=null;el('name').value=model(template).name;dirty=true;fields();buttons();};
el('collection').onchange=gallery;el('orientation').onchange=()=>{const old=read(),kind=model(template).kind;template=models.find(m=>m.kind===kind&&m.orientation===el('orientation').value).id;id=null;dirty=true;el('name').value=model(template).name;fields(old);buttons();};
for(const key of ['fields','style','name','channel'])el(key).addEventListener('input',()=>{dirty=true;preview();buttons();});
el('defaults').onclick=()=>{const data=read(),base=defaults(template);for(const key of styleKeys)data[key]=base[key];dirty=true;fields(data);buttons();};el('fresh').onclick=()=>select();el('save').onclick=()=>save().catch(e=>el('status').textContent=e.message);
el('saved').onclick=e=>{const b=e.target.closest('[data-id]');if(b)select(state.gcLibrary.items.find(i=>i.id===b.dataset.id));};
variantButton.onclick=async()=>{try{const result=await command('gc_library_variant',{id});select(state.gcLibrary.items.find(i=>i.id===result.id));}catch{}};
unlinkButton.onclick=async()=>{try{await command('gc_library_unlink',{id});buttons();}catch{}};
el('style').addEventListener('change',async e=>{const target=e.target,key=target.dataset.gcAsset;if(!key)return;try{const file=target.files[0];if(!file)return;if(file.size>2*1024*1024)throw Error('Use imagem/fonte de até 2 MB');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Não foi possível ler o arquivo'));reader.readAsDataURL(file);});const result=await command('gc_library_asset',{kind:target.dataset.kind,extension:file.name.split('.').pop(),base64});el('f-'+key).value=result.token;target.parentElement.querySelector('small').textContent='Importado: '+file.name;dirty=true;preview();buttons();}catch(e){el('status').textContent=e.message;}finally{target.value='';}});
el('style').addEventListener('click',e=>{const key=e.target.dataset.removeAsset;if(key){el('f-'+key).value='';e.target.parentElement.querySelector('small').textContent='Nenhum arquivo';dirty=true;preview();buttons();}});
for(const [button,action] of [['duplicate','duplicate'],['prepare','prepare'],['air','air'],['off','air'],['remove','remove']])el(button).onclick=async()=>{try{const result=await command('gc_library_'+action,{id,...(action==='air'?{on:button==='air'}:{})});if(action==='duplicate')select(state.gcLibrary.items.find(i=>i.id===result.id));if(action==='remove')select();}catch{}};
el('export').onclick=async()=>{try{const data=await command('gc_library_export');if(data?.kind!=='freemix-gc-library')throw Error('Exportação não confirmada');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='freemix-gc-biblioteca.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){el('status').textContent=e.message;}};
el('import').onchange=async()=>{try{const f=el('import').files[0];if(!f)return;if(f.size>6*1024*1024)throw Error('Biblioteca deve ter até 6 MB');const result=await command('gc_library_import',{payload:JSON.parse(await f.text())});select(state.gcLibrary.items.find(i=>i.id===result.ids?.[0]));}catch(e){el('status').textContent=e.message;}finally{el('import').value='';}};
setInterval(()=>{const next=FreeMixRemote.getState();state=next;const sig=JSON.stringify([next.gcLibrary?.scope,next.gcLibrary?.items,next.connected,next.dataSources?.length]);if(sig===fingerprint)return;const previousScope=fingerprint?el('saved').dataset.scope:null;fingerprint=sig;el('saved').dataset.scope=next.gcLibrary?.scope||'';el('saved').innerHTML=(next.gcLibrary?.items||[]).map(i=>`<button data-id="${i.id}" class="${i.onAir?'air':''}">${esc(i.name)}${i.onAir?' · NO AR':''}</button>`).join('');if(previousScope!==null&&previousScope!==(next.gcLibrary?.scope||''))select();buttons();updateDataSourcesList();},350);
select();

// Smart Data Binding Integrado (Inclusão e Navegação Rápida de Planilhas/JSON)
let activeDataSourceId = null;
const dataSourceSelect = el('gc-data-source-select');
const dataNav = el('gc-data-nav');
const dataRowIndicator = el('gc-data-row-indicator');
const dataPrev = el('gc-data-prev');
const dataNext = el('gc-data-next');
const dataAutoBind = el('gc-data-autobind');

const FIELD_SYNONYMS = {
  name: ['nome', 'name', 'pessoa', 'palestrante', 'autor', 'apresentador', 'jogador', 'atleta', 'host', 'convidado'],
  role: ['cargo', 'role', 'funcao', 'posicao', 'especialidade', 'profissao', 'descricao'],
  company: ['empresa', 'company', 'instituicao', 'organizacao', 'clube'],
  title: ['titulo', 'title', 'manchete', 'headline', 'assunto', 'tema'],
  detail: ['detalhe', 'detail', 'subtitulo', 'subtitle', 'apoio', 'descricao', 'texto'],
  date: ['data', 'date', 'horario', 'hora', 'periodo'],
  quote: ['citacao', 'quote', 'frase', 'declaracao', 'aspas'],
  location: ['local', 'location', 'cidade', 'estado', 'praca'],
  teamA: ['timea', 'time1', 'mandante', 'equipea', 'teama', 'casa'],
  teamB: ['timeb', 'time2', 'visitante', 'equipeb', 'teamb', 'fora'],
  scoreA: ['golsa', 'placara', 'scorea', 'pontosa'],
  scoreB: ['golsb', 'placarb', 'scoreb', 'pontosb'],
  handle: ['handle', 'arroba', 'social', 'instagram', 'twitter', 'perfil'],
  message: ['mensagem', 'message', 'comentario', 'texto']
};

function normalizeStr(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function updateDataSourcesList() {
  if (!dataSourceSelect) return;
  const list = state.dataSources || [];
  const currentVal = dataSourceSelect.value;
  dataSourceSelect.innerHTML = '<option value="">Nenhuma (digitação manual)</option>' +
    list.map(s => `<option value="${esc(s.id)}" ${s.id === currentVal ? 'selected' : ''}>${esc(s.name)} (${s.rowCount || (s.rows ? s.rows.length : 0)} linhas)</option>`).join('');
}

function applyDataRow(table, rowIndex) {
  if (!table || !table.rows || !table.rows[rowIndex]) return;
  const row = table.rows[rowIndex];
  const m = model(template);
  if (!m || !m.fields) return;

  let filledCount = 0;
  for (const f of m.fields) {
    if (styleKeys.includes(f.key)) continue;
    const targetInput = el('f-' + f.key);
    if (!targetInput) continue;

    const syns = FIELD_SYNONYMS[f.key] || [f.key.toLowerCase()];
    for (const col of Object.keys(row)) {
      const normCol = normalizeStr(col);
      if (syns.some(s => normCol.includes(s) || s.includes(normCol))) {
        targetInput.value = row[col];
        filledCount++;
        break;
      }
    }
  }

  if (dataRowIndicator) dataRowIndicator.textContent = `Linha ${rowIndex + 1} de ${table.rows.length}`;
  dirty = true;
  preview();
  buttons();
  el('status').textContent = `Dados preenchidos da linha ${rowIndex + 1} (${filledCount} campos mapeados)`;
}

if (dataSourceSelect) {
  dataSourceSelect.onchange = () => {
    activeDataSourceId = dataSourceSelect.value;
    if (!activeDataSourceId) {
      if (dataNav) dataNav.style.display = 'none';
      return;
    }
    const table = (state.dataSources || []).find(s => s.id === activeDataSourceId);
    if (table && table.rows && table.rows.length) {
      if (dataNav) dataNav.style.display = 'inline-flex';
      applyDataRow(table, table.selected || 0);
    }
  };

  if (dataPrev) dataPrev.onclick = async () => {
    const table = (state.dataSources || []).find(s => s.id === activeDataSourceId);
    if (!table || !table.rows) return;
    const cur = table.selected || 0;
    const nextIdx = Math.max(0, cur - 1);
    table.selected = nextIdx;
    await command('data_select', { id: table.id, index: nextIdx }).catch(() => {});
    applyDataRow(table, nextIdx);
  };

  if (dataNext) dataNext.onclick = async () => {
    const table = (state.dataSources || []).find(s => s.id === activeDataSourceId);
    if (!table || !table.rows) return;
    const cur = table.selected || 0;
    const nextIdx = Math.min(table.rows.length - 1, cur + 1);
    table.selected = nextIdx;
    await command('data_select', { id: table.id, index: nextIdx }).catch(() => {});
    applyDataRow(table, nextIdx);
  };

  if (dataAutoBind) dataAutoBind.onclick = () => {
    const table = (state.dataSources || []).find(s => s.id === activeDataSourceId);
    if (table && table.rows) applyDataRow(table, table.selected || 0);
  };
}

const restartClock=document.createElement('button');restartClock.textContent='Reiniciar relógio H/V';restartClock.type='button';restartClock.onclick=async()=>{try{if(!id||dirty)throw Error('Salve e selecione um título primeiro');await command('gc_library_clock_restart',{id});el('status').textContent='Relógio reiniciado nas versões vinculadas.';}catch(e){el('status').textContent=e.message;}};el('save').parentElement.append(restartClock);
import {installGtzipUi} from './gc-gtzip.js';
installGtzipUi({command,getState:()=>state});
const freeFont=document.createElement('button');freeFont.type='button';freeFont.textContent='Usar Bebas Neue livre neste título';freeFont.onclick=async()=>{try{const r=await command('gc_library_asset',{kind:'font',freeFont:'bebas-neue'});el('f-fontAsset').value=r.token;el('f-fontFamily').value=r.family||'Bebas Neue';dirty=true;preview();buttons();el('status').textContent='Bebas Neue livre (SIL OFL 1.1) selecionada somente para este título. Salve para aplicar.';}catch(e){el('status').textContent=e.message;}};el('style').parentElement.append(freeFont);
// Produtividade no editor atual: copiar somente propriedades visuais, nunca os textos,
// imagens ou IDs do título. Colar é uma edição local; o operador ainda precisa salvar.
let copiedTitleStyle=null;
const copyStyle=document.createElement('button');copyStyle.type='button';copyStyle.id='copy-title-style';copyStyle.textContent='Copiar estilo';
const pasteStyle=document.createElement('button');pasteStyle.type='button';pasteStyle.id='paste-title-style';pasteStyle.textContent='Colar estilo';pasteStyle.disabled=true;
const copyableStyle=styleKeys.filter(k=>!['imageAsset','fontAsset'].includes(k));
copyStyle.onclick=()=>{try{const data=read();copiedTitleStyle=Object.fromEntries(copyableStyle.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]));pasteStyle.disabled=false;el('status').textContent='Estilo copiado';}catch(e){el('status').textContent=e.message;}};
pasteStyle.onclick=()=>{try{if(!copiedTitleStyle)return;const next=normalizeData(template,{...read(),...copiedTitleStyle},false);dirty=true;fields(next);buttons();}catch(e){el('status').textContent=e.message;}};
el('style').parentElement.append(copyStyle,pasteStyle);
// EyeDropper exige contexto seguro e gesto do operador; cancelamento não altera o título.
// Cada botão atua no campo de cor específico, não adivinha qual objeto estava selecionado.
if(typeof window.EyeDropper==='function'&&window.isSecureContext){
 const addPickers=()=>{for(const input of el('style').querySelectorAll('input[type="color"]')){
  if(input.parentElement.querySelector('[data-color-picker]'))continue;
  const pick=document.createElement('button');pick.type='button';pick.dataset.colorPicker='1';pick.textContent='Conta-gotas';
  pick.onclick=async()=>{try{const result=await new window.EyeDropper().open();input.value=result.sRGBHex;input.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){if(e.name!=='AbortError')el('status').textContent=e.message;}};
  input.parentElement.append(pick);
 }};
 new MutationObserver(addPickers).observe(el('style'),{childList:true});addPickers();
}
