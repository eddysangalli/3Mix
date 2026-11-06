// Resizable BAR (ReBAR) is a PCIe capability negotiated once between BIOS/UEFI, the GPU
// firmware and the driver at boot. It has no per-application toggle, profile or NVAPI call
// in either vendor's public SDK, and D3D11 (our renderer) has no API equivalent to D3D12's
// D3D12_HEAP_TYPE_GPU_UPLOAD to opt a resource into it. This module never claims to "enable"
// ReBAR, and does not claim to confirm it is active either: nvidia-smi's BAR1 window SIZE is
// consistent with ReBAR being negotiated, but a large BAR1 can exist for other reasons (SR-IOV,
// certain workstation configurations), and nvidia-smi exposes no field that reports the PCIe
// negotiation outcome directly. Reported here as a probable/likely signal for the hardware
// matrix, never as a confirmed state -- the wording below says exactly that.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
// A traditional (non-resizable) BAR1 window is 256 MiB; GPUs with ReBAR negotiated typically
// expose a BAR1 close to their total frame buffer. This threshold only classifies the SIZE
// we read, not whether the PCIe negotiation itself succeeded.
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
 const largeBar1=bar1MiB>LEGACY_BAR1_MIB*4&&bar1MiB>=vramTotalMiB*0.9;
 // status names a SIZE OBSERVATION, not a confirmed negotiation outcome -- nvidia-smi has
 // no field for the latter, so this code must never say ReBAR itself is active/inactive.
 return {status:largeBar1?'bar1_large':'bar1_legacy',vendor:'nvidia',gpu:gpuName,totalMiB:vramTotalMiB,bar1MiB,
  reason:largeBar1?'BAR1 ('+bar1MiB+' MiB) próxima da VRAM total ('+vramTotalMiB+' MiB): consistente com Resizable BAR negociado, mas nvidia-smi não confirma a negociação PCIe diretamente; outras causas (SR-IOV, configurações workstation) também produzem BAR1 grande.'
             :'BAR1 ('+bar1MiB+' MiB) do tamanho de uma janela tradicional: Resizable BAR provavelmente não foi negociado (BIOS/UEFI desligado, ou GPU/slot sem suporte).'};
}
