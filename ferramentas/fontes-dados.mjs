// CSV/JSON/XLSX data connectors, persisted independently for each production preset.
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {normalizeFieldFormat,applyFieldFormat} from './fontes-dados-formato.mjs';
const limit=5*1024*1024, bad=new Set(['__proto__','prototype','constructor']);
function rows(value){if(!Array.isArray(value)||value.length>5000)throw Error('Use uma tabela de até 5000 linhas');const columns=[...new Set(value.flatMap(r=>r&&typeof r==='object'&&!Array.isArray(r)?Object.keys(r):[]))];if(columns.length>100||columns.some(c=>bad.has(c)||!c||c.length>200))throw Error('Colunas inválidas');return value.map(r=>{if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Cada linha deve ser um objeto');return Object.fromEntries(columns.map(c=>{let v=r[c]??'';if(typeof v==='object')throw Error('Células devem conter texto ou número');v=String(v);if(v.length>10000)throw Error('Célula muito longa');return[c,v];}));});}
export function csv(text,delimiter=','){
 if(![',',';','\t'].includes(delimiter))throw Error('Separador inválido');const all=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(c=>c!==''))all.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('Aspas não fechadas no CSV');if(cell||row.length){row.push(cell);all.push(row);}const headers=all.shift()?.map(h=>h.trim().replace(/^\ufeff/,''))||[];if(new Set(headers).size!==headers.length)throw Error('Colunas duplicadas');return rows(all.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??'']))));
}
export async function parse(bytes,{format='csv',delimiter=',',sheet='',jsonPath=''}={}){
 if(bytes.length>limit)throw Error('Tabela maior que 5 MB');if(format==='csv')return {rows:csv(bytes.toString('utf8'),delimiter),sheets:[]};
 if(format==='json'){let value=JSON.parse(bytes.toString('utf8'));for(const key of jsonPath.split('.').filter(Boolean)){if(bad.has(key)||!Object.hasOwn(value,key))throw Error('Caminho JSON inválido');value=value[key];}return {rows:rows(value),sheets:[]};}
 if(format==='xlsx'){
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)throw Error('XLSX inválido');
  const entries=bytes.readUInt16LE(end+10);let position=bytes.readUInt32LE(end+16),total=0;if(entries>2000)throw Error('XLSX contém arquivos demais');
  for(let i=0;i<entries;i++){if(position+46>bytes.length||bytes.readUInt32LE(position)!==0x02014b50)throw Error('Diretório XLSX inválido');total+=bytes.readUInt32LE(position+24);if(total>50*1024*1024||bytes.readUInt16LE(position+8)&1)throw Error('XLSX excede tamanho descompactado ou está criptografado');position+=46+bytes.readUInt16LE(position+28)+bytes.readUInt16LE(position+30)+bytes.readUInt16LE(position+32);}
  const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const tab=sheet?book.getWorksheet(sheet):book.worksheets[0];if(!tab)throw Error('Aba não encontrada');if(tab.rowCount>5001||tab.columnCount>100)throw Error('Planilha excede o limite');const cell=c=>{const v=c.value;if(v==null)return '';if(v instanceof Date)return v.toISOString();if(typeof v==='object')return v.result??v.text??v.richText?.map(x=>x.text).join('')??'';return String(v);};const headers=tab.getRow(1).values.slice(1).map(v=>String(v??''));if(new Set(headers).size!==headers.length)throw Error('Colunas duplicadas');const data=[];for(let i=2;i<=tab.rowCount;i++)data.push(Object.fromEntries(headers.map((h,j)=>[h,cell(tab.getRow(i).getCell(j+1))])));return {rows:rows(data),sheets:book.worksheets.map(s=>s.name)};}
 throw Error('Escolha CSV, JSON ou XLSX');
}
async function download(address){const url=new URL(address);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Use endereço HTTP/HTTPS sem credenciais');const response=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'follow'});if(!response.ok)throw Error('Fonte respondeu HTTP '+response.status);if(Number(response.headers.get('content-length'))>limit)throw Error('Tabela maior que 5 MB');const parts=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Tabela maior que 5 MB');parts.push(chunk);}return Buffer.concat(parts);}
export class DataSources {
 constructor(root){this.root=root;this.scope=null;this.items=[];}
 async setScope(scope){if(this.scope===scope)return;this.scope=scope;const id=createHash('sha256').update(scope).digest('hex').slice(0,24);this.file=join(this.root,'config/obs-studio/plugin_config/freemix-data',id+'.json');this.globalFile=join(this.root,'config/obs-studio/plugin_config/freemix-data/global.json');const load=async f=>{try{return JSON.parse(await readFile(f,'utf8')).items||[];}catch(e){if(e.code!=='ENOENT')throw e;return [];}};this.items=[...(await load(this.globalFile)).map(s=>({...s,scope:'global'})),...(await load(this.file)).map(s=>({...s,scope:'project'}))];for(const s of this.items)s.nextAt=0;}
 async save(){await mkdir(join(this.root,'config/obs-studio/plugin_config/freemix-data'),{recursive:true});for(const [file,items]of [[this.globalFile,this.items.filter(s=>s.scope==='global')],[this.file,this.items.filter(s=>s.scope!=='global')]]){await writeFile(file+'.tmp',JSON.stringify({format:2,items},null,2));await rename(file+'.tmp',file);}}
 get(id){const s=this.items.find(x=>x.id===id);if(!s)throw Error('Tabela não encontrada');return s;}
 summary(){return this.items.map(s=>({...s,rows:s.rows.slice(0,100),rowCount:s.rows.length,preview:s.rows[s.selected]||{},source:s.type==='manual'?'Tabela importada':s.type==='http'?s.url:s.path}));}
 async import(d){if(this.items.length>=40)throw Error('Limite de quarenta tabelas');const format=String(d.format||'csv'),bytes=d.base64?Buffer.from(d.base64,'base64'):Buffer.from(String(d.text||'')),parsed=await parse(bytes,d);const name=String(d.name||'Tabela').slice(0,200);const s={id:randomUUID(),name,type:'manual',scope:d.scope==='global'?'global':'project',format,rows:parsed.rows,sheets:parsed.sheets,selected:0,binding:null,updatedAt:Date.now(),error:null};this.items.push(s);await this.save();return s;}
 async configure(d,type){if(this.items.length>=40&&!d.id)throw Error('Limite de quarenta tabelas');const original=d.id?this.get(d.id):null,s=original?structuredClone(original):{id:randomUUID(),name:String(d.name||'Tabela').slice(0,200),rows:[],selected:0,binding:null,scope:d.scope==='global'?'global':'project'};const format=d.format||extname(d.path||'').slice(1)||'csv';if(!['csv','json','xlsx'].includes(format))throw Error('Formato inválido');const interval=Number(d.intervalSeconds||5);if(!Number.isFinite(interval)||interval<1||interval>3600)throw Error('Intervalo: 1 a 3600 segundos');Object.assign(s,{type,format,delimiter:d.delimiter||',',sheet:d.sheet||'',jsonPath:d.jsonPath||'',intervalSeconds:interval,...(type==='http'?{url:String(d.url||'')}:{path:String(d.path||'')})});await this.refresh(s);if(original)this.items[this.items.indexOf(original)]=s;else this.items.push(s);await this.save();return s;}
 async refresh(s){let bytes;if(s.type==='http')bytes=await download(s.url);else if(s.type==='file'){if(!/\.(csv|json|xlsx)$/i.test(s.path))throw Error('Arquivo deve ser CSV, JSON ou XLSX');if((await stat(s.path)).size>limit)throw Error('Tabela maior que 5 MB');bytes=await readFile(s.path);}else return false;const data=await parse(bytes,s),changed=JSON.stringify(data.rows)!==JSON.stringify(s.rows);s.rows=data.rows;s.sheets=data.sheets;s.selected=Math.min(s.selected,Math.max(0,s.rows.length-1));s.updatedAt=Date.now();s.error=null;s.nextAt=Date.now()+s.intervalSeconds*1000;return changed;}
 async preparePoll(){
  // Network/file reads never mutate the active project while an operator command is running.
  const scope=this.scope,due=this.items.filter(s=>s.type!=='manual'&&!(s.nextAt>Date.now()));
  if(!due.length)return {scope,items:[]};
  const start=(this.pollCursor||0)%due.length,count=Math.min(2,due.length);
  this.pollCursor=start+count;
  const selected=Array.from({length:count},(_,i)=>due[(start+i)%due.length]);
  const items=await Promise.all(selected.map(async original=>{
   const before=JSON.stringify(original),result=structuredClone(original);let changed=false;
   try{changed=await this.refresh(result);}catch(e){result.error=e.message;result.nextAt=Date.now()+(result.intervalSeconds||5)*1000;}
   return {original,before,result,changed};
  }));
  return {scope,items};
 }
 async applyPoll(batch){
  if(batch.scope!==this.scope)return [];
  const changed=[],applied=[];
  for(const item of batch.items){
   // A removed/reconfigured table, new row selection or binding wins over an old HTTP response.
   if(!this.items.includes(item.original)||JSON.stringify(item.original)!==item.before)continue;
   applied.push({source:item.original,previous:structuredClone(item.original)});
   for(const key of ['rows','sheets','selected','updatedAt','error','nextAt'])item.original[key]=item.result[key];
   if(item.changed)changed.push(item.original);
  }
  if(changed.length)try{await this.save();}catch(error){
   for(const {source,previous}of applied)for(const key of ['rows','sheets','selected','updatedAt','error','nextAt']){
    if(Object.hasOwn(previous,key))source[key]=previous[key];else delete source[key];
   }
   throw error;
  }
  return changed;
 }
 async poll(){return this.applyPoll(await this.preparePoll());}
 async select(id,index){const s=this.get(id);index=Number(index);if(!Number.isInteger(index)||index<0||index>=s.rows.length)throw Error('Linha inexistente');s.selected=index;await this.save();return s;}
 async edit(d){const s=this.get(d.id);if(s.type!=='manual')throw Error('Edite a fonte original ou importe como tabela manual');const r=s.rows[Number(d.row)];if(!r||!Object.hasOwn(r,d.column))throw Error('Célula inexistente');const value=String(d.value??'');if(value.length>10000)throw Error('Célula muito longa');r[d.column]=value;s.updatedAt=Date.now();await this.save();}
 // Formatação por campo (vMix 30 §5.10): d.format é OPCIONAL e, quando ausente, binding.format
 // fica ausente -- mapped() então devolve o texto cru da célula, exatamente como antes desta
 // extensão existir (zero regressão para todo vínculo já configurado). score fica de fora de
 // propósito: scoreHome/scoreAway/minutes são coeridos para Number logo abaixo em mapped() e
 // consumidos como número puro pelo template nativo do placar (controle-producao.mjs title()) --
 // aplicar formato de exibição ali quebraria esse contrato numérico rígido, não um recurso novo.
 async bind(d){const s=this.get(d.id),kind=d.kind||'lower';if(!['lower','score','text','browser','variables','inputName','person'].includes(kind))throw Error('Destino de dados inválido');const allowed=kind==='score'?['teamHome','teamAway','scoreHome','scoreAway','minutes','period']:kind==='person'?['title','subtitle','color','input','call','image']:kind==='lower'?['title','subtitle','color','image']:kind==='text'?['text']:kind==='inputName'?['name']:null;if(!d.mapping||typeof d.mapping!=='object'||Array.isArray(d.mapping)||Object.keys(d.mapping).length>100)throw Error('Informe os vínculos');for(const [field,col]of Object.entries(d.mapping))if(bad.has(field)||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field)||allowed&&!allowed.includes(field)||!Object.hasOwn(s.rows[0]||{},col))throw Error('Vínculo inválido');const target=String(d.target||'');if(['text','browser','inputName'].includes(kind)&&(!target||target.length>256))throw Error('Selecione a fonte de destino');let format;if(d.format&&typeof d.format==='object'&&!Array.isArray(d.format)){if(kind==='score')throw Error('Formatação de campo não se aplica ao Placar');if(Object.keys(d.format).length>100)throw Error('Formatação de campo excede o limite');format={};for(const [field,spec]of Object.entries(d.format)){if(!Object.hasOwn(d.mapping,field))throw Error('Formato para campo sem vínculo: '+field);format[field]=normalizeFieldFormat(spec);}}const previous=s.binding;s.binding={kind,target,mapping:{...d.mapping},...(format?{format}:{}),autoPublish:d.autoPublish===true};try{await this.save();}catch(error){if(previous===undefined)delete s.binding;else s.binding=previous;throw error;}}
 async remove(id){const s=this.get(id);this.items=this.items.filter(x=>x!==s);await this.save();}
 async move(id,scope){if(!['global','project'].includes(scope))throw Error('Escopo inválido');this.get(id).scope=scope;await this.save();}
 async append(d){const s=this.get(d.id);if(s.type!=='manual')throw Error('Use uma tabela manual para cadastrar pessoas');if(s.rows.length>=5000)throw Error('Tabela cheia');const next=rows([...s.rows,d.values||{}]);s.rows=next;s.updatedAt=Date.now();await this.save();}
 async removeRow(d){const s=this.get(d.id),index=Number(d.row);if(s.type!=='manual'||!Number.isInteger(index)||index<0||index>=s.rows.length)throw Error('Linha inválida');s.rows.splice(index,1);s.selected=Math.min(s.selected,Math.max(0,s.rows.length-1));s.updatedAt=Date.now();await this.save();}
 mapped(id){const s=this.get(id);if(!s.binding)throw Error('Configure os vínculos');const row=s.rows[s.selected];if(!row)throw Error('Tabela vazia');const data=Object.fromEntries(Object.entries(s.binding.mapping).map(([field,col])=>[field,s.binding.format?.[field]?applyFieldFormat(row[col],s.binding.format[field]):row[col]]));if(s.binding.kind==='score')for(const k of ['scoreHome','scoreAway','minutes'])if(Object.hasOwn(data,k)){const value=Number(data[k]);if(!Number.isFinite(value)||value<0||value>999)throw Error('Valor inválido para '+k);data[k]=value;}return {kind:s.binding.kind,target:s.binding.target,data};}
 async publishVariables(id){const s=this.get(id),mapped=this.mapped(id);if(mapped.kind!=='variables')throw Error('Destino não é variável');const previous=s.lastPublished;s.lastPublished={values:mapped.data,updatedAt:Date.now()};try{await this.save();}catch(e){s.lastPublished=previous;throw e;}return this.publishedVariables();}
 publishedVariables(){return Object.fromEntries(this.items.filter(s=>s.binding?.kind==='variables'&&s.lastPublished?.values).map(s=>[s.id,{name:s.name,values:structuredClone(s.lastPublished.values),updatedAt:s.lastPublished.updatedAt}]));}
 async publishPerson(id,person){const s=this.get(id);if(s.binding?.kind!=='person')throw Error('Selecione um vínculo de pessoa');const old=s.lastPublished;s.lastPublished={values:this.mapped(id).data,person,updatedAt:Date.now()};try{await this.save();}catch(e){s.lastPublished=old;throw e;}}
 people(){return this.items.filter(s=>s.binding?.kind==='person'&&s.lastPublished?.person).map(s=>({sourceId:s.id,...structuredClone(s.lastPublished.person),updatedAt:s.lastPublished.updatedAt}));}

}
