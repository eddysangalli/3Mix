// DistroAV 6.2.1 only searches NDI_RUNTIME_DIR_V6 on Windows. Resolve and
// validate an application-owned SDK binary before starting the engine.
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
export const NDI_DLL='Processing.NDI.Lib.x64.dll';
export const NDI_SDK_SHA256='2b6602075868ba4401f82f417d72424805d69b11ca86078023d0d489ff45dd84';
export function inspectNdiBinary(bytes){
 const b=Buffer.from(bytes);const fail=()=>{throw Error('Biblioteca NDI x64 inválida');};
 const bounded=(p,n)=>{if(!Number.isInteger(p)||p<0||p+n>b.length)fail();return p;};
 if(b.length<256||b.toString('ascii',0,2)!=='MZ')fail();
 const pe=b.readUInt32LE(0x3c);bounded(pe,24);if(b.readUInt32LE(pe)!==0x4550||b.readUInt16LE(pe+4)!==0x8664)fail();
 const optional=pe+24,size=b.readUInt16LE(pe+20),count=b.readUInt16LE(pe+6);bounded(optional,size);if(b.readUInt16LE(optional)!==0x20b||size<128||count>96)fail();
 const sections=optional+size;bounded(sections,count*40);
 const offset=(rva,n)=>{for(let i=0;i<count;i++){const p=sections+i*40,start=b.readUInt32LE(p+12),length=b.readUInt32LE(p+16);if(rva>=start&&rva-start+n<=length)return bounded(b.readUInt32LE(p+20)+rva-start,n);}fail();};
 const resourceRva=b.readUInt32LE(optional+112+16),resourceSize=b.readUInt32LE(optional+112+20);if(!resourceRva||resourceSize<16)fail();
 const resource=offset(resourceRva,resourceSize);
 const entry=(rel,id)=>{const p=resource+rel;bounded(p,16);const n=b.readUInt16LE(p+12)+b.readUInt16LE(p+14);if(n>1024)fail();bounded(p+16,n*8);for(let i=0;i<n;i++){const q=p+16+i*8,k=b.readUInt32LE(q),v=b.readUInt32LE(q+4);if(id===undefined||k===id)return v;}fail();};
 let v=entry(0,16);for(let depth=0;v&0x80000000;depth++){if(depth>4)fail();v=entry(v&0x7fffffff);}
 const data=resource+v;bounded(data,16);const begin=offset(b.readUInt32LE(data),b.readUInt32LE(data+4)),length=b.readUInt32LE(data+4);bounded(begin,length);
 const key=Buffer.from('VS_VERSION_INFO\0','utf16le');if(!b.subarray(begin+6,begin+6+key.length).equals(key))fail();
 const fixed=(begin+6+key.length+3)&~3;bounded(fixed,52);if(b.readUInt32LE(fixed)!==0xfeef04bd)fail();
 const ms=b.readUInt32LE(fixed+8),ls=b.readUInt32LE(fixed+12),version=[ms>>>16,ms&65535,ls>>>16,ls&65535];
 if(version[0]<6||(version[0]===6&&version[1]<3))throw Error('DistroAV exige NDI Runtime 6.3 ou superior; encontrado '+version.join('.'));
 // A valid PE version alone does not prove dynamic API support.
 if(!b.includes(Buffer.from('NDIlib_v6_load\0')))throw Error('Biblioteca sem API NDI v6');
 return {version:version.join('.'),sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length,architecture:'x64'};
}
export async function prepareNdiRuntime(root,{env=process.env,requirePinned=true,writeReceipt=true}={}){
 root=resolve(root);const directory=join(root,'runtime/ndi-v6'),path=join(directory,NDI_DLL);let info;
 try{const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||st.size>100e6)throw Error('Arquivo NDI inválido');info=inspectNdiBinary(await readFile(path));}
 catch(e){throw Error('O 3Mix não será aberto com NDI incompleto. '+e.message+'. Reaplique a entrega com runtime SDK NDI ou instale pelo endereço oficial https://ndi.link/NDIRedistV6.');}
 if(requirePinned&&info.sha256!==NDI_SDK_SHA256)throw Error('O runtime NDI desta entrega foi alterado. Reaplique o pacote assinado antes de abrir.');
 for(const name of['NDI SDK License Agreement.pdf','Processing.NDI.Lib.Licenses.txt','PROVENANCE.json','TERMS.md']){const st=await lstat(join(root,'licenses/ndi-runtime',name)).catch(()=>null);if(!st?.isFile()||st.isSymbolicLink())throw Error('Runtime NDI sem licença/proveniência: '+name);}
 env.NDI_RUNTIME_DIR_V6=directory;
 const receipt={...info,path,environmentVariable:'NDI_RUNTIME_DIR_V6',scope:'process-only',globalEnvironmentChanged:false,globallyInstalled:false,verifiedAt:new Date().toISOString()};
 if(writeReceipt){await mkdir(join(root,'config/obs-studio/plugin_config/freemix-control'),{recursive:true});await writeFile(join(root,'config/obs-studio/plugin_config/freemix-control/ndi-runtime.json'),JSON.stringify(receipt,null,2));}return receipt;
}
