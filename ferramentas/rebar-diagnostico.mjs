// Resizable BAR (ReBAR) is a platform feature (BIOS + GPU firmware + driver), not an
// application-level D3D11 switch: our renderer is D3D11 only, and D3D11 has no public
// API equivalent to D3D12_HEAP_TYPE_GPU_UPLOAD to opt an app into it. This module never
// claims to "enable" ReBAR; it only reports whether the platform already has it active,
// from the one vendor signal we can read without a native build: nvidia-smi's BAR1 size.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
// A traditional (non-resizable) BAR1 window is 256 MiB; real GPUs with ReBAR expose a
// BAR1 close to their total frame buffer. Mid window avoids false positives/negatives
// from reporting noise.
const LEGACY_BAR1_MIB=256;
export async function detectResizableBar({run:runner=run}={}){
 let smi,gpuName,vramTotalMiB;
 try{
  const {stdout:nameOut}=await runner('nvidia-smi',['--query-gpu=name,memory.total','--format=csv,noheader,nounits'],{timeout:4000,windowsHide:true});
  const firstLine=nameOut.split(String.fromCharCode(10))[0].split(String.fromCharCode(13))[0];
  const parts=firstLine.split(',').map(s=>s.trim());
  gpuName=parts[0];vramTotalMiB=Number(parts[1]);
 }catch(error){
  return {status:'undetermined',vendor:'unknown',reason:error.code==='ENOENT'?'nvidia-smi indisponível; placa não identificada ou não NVIDIA':'Consulta nvidia-smi falhou: '+error.message};
 }
 if(!gpuName||!Number.isFinite(vramTotalMiB)||vramTotalMiB<=0)return {status:'undetermined',vendor:'nvidia',reason:'Nome/VRAM não numéricos retornados pelo driver'};
 // Older drivers reject --query-gpu=bar1.memory.total (invalid field); the detailed
 // -q -d MEMORY report exposes the same number under a stable text label instead.
 let detail;
 try{
  const {stdout}=await runner('nvidia-smi',['-q','-d','MEMORY'],{timeout:4000,windowsHide:true});
  detail=stdout;
 }catch(error){
  return {status:'undetermined',vendor:'nvidia',gpu:gpuName,totalMiB:vramTotalMiB,reason:'Consulta detalhada de memória falhou: '+error.message};
 }
 const lines=detail.split(String.fromCharCode(10));
 const sectionIndex=lines.findIndex(l=>l.includes('BAR1 Memory Usage'));
 if(sectionIndex<0)return {status:'undetermined',vendor:'nvidia',gpu:gpuName,totalMiB:vramTotalMiB,reason:'Seção BAR1 Memory Usage ausente na saída do driver'};
 const totalLine=lines.slice(sectionIndex,sectionIndex+4).find(l=>l.includes('Total'));
 const match=totalLine&&totalLine.match(/:\s*(\d+)\s*MiB/);
 if(!match)return {status:'undetermined',vendor:'nvidia',gpu:gpuName,totalMiB:vramTotalMiB,reason:'Valor de BAR1 Total não reconhecido na saída do driver'};
 const bar1MiB=Number(match[1]);
 const active=bar1MiB>LEGACY_BAR1_MIB*4&&bar1MiB>=vramTotalMiB*0.9;
 return {status:active?'active':'inactive',vendor:'nvidia',gpu:gpuName,totalMiB:vramTotalMiB,bar1MiB,
  reason:active?'BAR1 ('+bar1MiB+' MiB) próxima da VRAM total ('+vramTotalMiB+' MiB); plataforma já expõe a janela ampliada ao driver.'
             :'BAR1 ('+bar1MiB+' MiB) compatível com janela tradicional; ReBAR não parece ativo nesta máquina (BIOS/driver).'};
}