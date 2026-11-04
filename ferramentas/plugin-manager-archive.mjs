import fs from 'node:fs';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const MAX_ARCHIVE=256*1024*1024,MAX_TOTAL=512*1024*1024,MAX_FILE=256*1024*1024;
export function noGtLinks(target){for(let p=path.resolve(target);;p=path.dirname(p)){try{if(fs.lstatSync(p).isSymbolicLink())throw Error('Links/junções não são permitidos: '+p);}catch(e){if(e.code!=='ENOENT')throw e;}if(path.dirname(p)===p)break;}}
export function safeGtPath(name){if(typeof name!=='string'||!name||name.length>512||name.split('/').some(p=>!p||p==='.'||p==='..'||/[\\<>:"|?*\x00-\x1f]/.test(p)||/[ .]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Caminho não permitido no ZIP de plugin: '+name);return name;}
const table=Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);return v>>>0;});
function crc(data){let n=0xffffffff;for(const b of data)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
export function readPluginArchive(file){
 file=path.resolve(file);noGtLinks(file);const s=fs.statSync(file);if(!s.isFile()||s.size<22||s.size>MAX_ARCHIVE)throw Error('ZIP de plugin deve ter até 256 MB');return readPluginArchiveBuffer(fs.readFileSync(file));
}
export function readPluginArchiveBuffer(data){
 if(!Buffer.isBuffer(data)||data.length<22||data.length>MAX_ARCHIVE)throw Error('Tamanho ZIP de plugin inválido');let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50&&i+22+data.readUInt16LE(i+20)===data.length){end=i;break;}
 if(end<0)throw Error('Diretório ZIP ausente');const count=data.readUInt16LE(end+10),start=data.readUInt32LE(end+16),size=data.readUInt32LE(end+12);
 if(data.readUInt16LE(end+4)||data.readUInt16LE(end+6)||data.readUInt16LE(end+8)!==count||count>4096||count===65535||start+size!==end)throw Error('ZIP multipart/ZIP64 ou diretório excessivo não suportado');
 const entries=new Map(),names=new Set(),ranges=[];let cursor=start,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>end||data.readUInt32LE(cursor)!==0x02014b50)throw Error('Entrada ZIP inválida');const flags=data.readUInt16LE(cursor+8),method=data.readUInt16LE(cursor+10),checksum=data.readUInt32LE(cursor+16),packed=data.readUInt32LE(cursor+20),expanded=data.readUInt32LE(cursor+24),nlen=data.readUInt16LE(cursor+28),extra=data.readUInt16LE(cursor+30),comment=data.readUInt16LE(cursor+32),offset=data.readUInt32LE(cursor+42),external=data.readUInt32LE(cursor+38),finish=cursor+46+nlen+extra+comment;
  if(finish>end||flags&1||![0,8].includes(method)||packed===0xffffffff||expanded>MAX_FILE||(external>>>16&0xf000)===0xa000)throw Error('Entrada ZIP encriptada, link ou formato/tamanho não permitido');
  const raw=data.subarray(cursor+46,cursor+46+nlen),name=raw.toString('utf8');if(raw.includes(0)||!raw.equals(Buffer.from(name)))throw Error('Nome ZIP inválido; exige UTF-8/ASCII');const directory=name.endsWith('/'),safe=safeGtPath(directory?name.slice(0,-1):name);if(names.has(safe.toLowerCase()))throw Error('Nomes ZIP colidem no Windows: '+safe);names.add(safe.toLowerCase());
  if(offset+30>start||data.readUInt32LE(offset)!==0x04034b50)throw Error('Cabeçalho ZIP local inválido');const localN=data.readUInt16LE(offset+26),localE=data.readUInt16LE(offset+28),body=offset+30+localN+localE,limit=body+packed;
  if(limit>start||data.readUInt16LE(offset+8)!==method||data.readUInt16LE(offset+6)!==flags||!data.subarray(offset+30,offset+30+localN).equals(raw)||ranges.some(([a,b])=>offset<b&&limit>a))throw Error('Limites/nome ZIP local divergentes');ranges.push([offset,limit]);total+=expanded;if(total>MAX_TOTAL)throw Error('ZIP de plugin expandido excede 512 MB');
  if(!directory){const compressed=data.subarray(body,limit),bytes=method===0?Buffer.from(compressed):inflateRawSync(compressed,{maxOutputLength:Math.max(1,expanded)});if(bytes.length!==expanded||crc(bytes)!==checksum)throw Error('Integridade ZIP inválida: '+name);entries.set(safe,bytes);}cursor=finish;
 }
 if(cursor!==end)throw Error('Diretório ZIP com dados inesperados');return {entries,bytes:total,sha256:createHash('sha256').update(data).digest('hex')};
}
export function decodeGtXml(buffer){if(buffer.length>8*1024*1024)throw Error('XML ZIP de plugin excede 8 MB');if(buffer[0]===0xff&&buffer[1]===0xfe)return buffer.subarray(2).toString('utf16le');if(buffer[0]===0xfe&&buffer[1]===0xff)return Buffer.from(buffer.subarray(2)).swap16().toString('utf16le');return buffer.toString('utf8').replace(/^\uFEFF/,'');}
