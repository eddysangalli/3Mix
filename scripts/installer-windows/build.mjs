import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, stat, writeFile, rename, rm, access} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname, resolve, basename, join} from 'node:path';
import {readdirSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
// O Visual C++ redistribuível da própria versão que compilou o motor: nada é baixado na hora de empacotar nem na casa do usuário.
const vcBase='C:/Program Files/Microsoft Visual Studio/18/Community/VC/Redist/MSVC';
const vcFolder=existsSync(vcBase)?readdirSync(vcBase).filter(n=>/^14\.\d+\.\d+$/.test(n)).sort().pop():null;
if(!vcFolder||!existsSync(join(vcBase,vcFolder,'vc_redist.x64.exe')))throw Error('Visual C++ redistribuível não encontrado em '+vcBase);
const vcRedist=join(vcBase,vcFolder,'vc_redist.x64.exe'),[vcMajor,vcMinor]=vcFolder.split('.').map(Number);
const args=process.argv.slice(2), options={};
for(const arg of args) { if(arg==='--stub-only'){options['--stub-only']=true;continue;} const i=arg.indexOf('='); if(i<0) throw Error('Use --zip=... e --output=... [--stub-only]'); const name=arg.slice(0,i), value=arg.slice(i+1); if(!['--zip','--output'].includes(name)||!value||options[name])throw Error('Argumento inválido: '+name); options[name]=value; }
if(!options['--zip']||!options['--output'])throw Error('Informe --zip=CAMINHO_ASSINADO e --output=CAMINHO_NOVO. O builder não escolhe uma release automaticamente.');
const zip=resolve(options['--zip']);
const output=resolve(options['--output']);
const root=basename(zip,'.zip');
if(!/^FreeMix-Completo-[A-Za-z0-9._-]+$/.test(root))throw Error('Nome do pacote completo inválido.');
if(zip.toLowerCase()===output.toLowerCase())throw Error('A saída deve ser diferente do pacote de entrada.');
if(!options['--stub-only']&&await access(output).then(()=>true,()=>false))throw Error('A saída já existe. Entregas seladas não são sobrescritas; use --output=CAMINHO_NOVO.');
const packageVersion=root.slice('FreeMix-Completo-'.length),versionParts=packageVersion.match(/^(\d+\.\d+\.\d+)-(alpha|beta)$/),displayVersion=versionParts?(versionParts[2]==='alpha'?'Alpha ':'Beta ')+versionParts[1]:packageVersion;
const size=(await stat(zip)).size;
if(size<22||size>5e9)throw Error('Tamanho ZIP inválido.');
await mkdir(join(here,'build'),{recursive:true}); await mkdir(dirname(output),{recursive:true});
console.log('Calculando SHA-256 do ZIP assinado (streaming)...');
const hash=createHash('sha256'); for await(const chunk of createReadStream(zip)) hash.update(chunk); const sha=hash.digest('hex');
const generated=join(here,'build/PayloadInfo.cs'), stub=join(here,'build/FreeMix-Setup-Stub.exe');
await writeFile(generated,`namespace FreeMixSetup { internal static class PayloadInfo { public const string Sha256 = "${sha}"; public const long Length = ${size}L; public const int VcMajor = ${vcMajor}; public const int VcMinor = ${vcMinor}; public const string Root = "${root}"; public const string Version = "${root.slice('FreeMix-Completo-'.length)}"; public const string DisplayVersion = "${displayVersion}"; } }\n`);
const framework=join(process.env.WINDIR??'C:/Windows','Microsoft.NET/Framework64/v4.0.30319');
console.log('Compilando WinForms .NET Framework x64...');
const uninstaller=join(here,'build/FreeMix-Uninstall.exe');
const common=['/nologo','/win32icon:'+join(here,'3mix.ico'),'/target:winexe','/platform:x64','/optimize+','/utf8output','/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll'];
execFileSync(join(framework,'csc.exe'),[...common,'/out:'+uninstaller,join(here,'Uninstall.cs')],{stdio:'inherit',windowsHide:true});
const eula=join(here,'../../docs/EULA.txt');
execFileSync(join(framework,'csc.exe'),[...common,'/main:FreeMixSetup.Program','/out:'+stub,'/resource:'+vcRedist+',FreeMixSetup.VcRedist','/reference:'+join(framework,'System.IO.Compression.dll'),'/resource:'+uninstaller+',FreeMixSetup.Uninstall.exe','/resource:'+eula+',FreeMixSetup.EULA.txt',join(here,'Setup.cs'),join(here,'Uninstall.cs'),generated],{stdio:'inherit',windowsHide:true});
if(options['--stub-only']){console.log(JSON.stringify({stub,uninstaller,payloadSha256:sha,uninstallerIncluded:true,finalReleaseGenerated:false,authenticodeSigned:false}));process.exit(0);}
const partial=output+'.partial';
try {
  console.log('Montando EXE único (streaming)...');
  await pipeline(createReadStream(stub),createWriteStream(partial,{flags:'wx'}));
  await pipeline(createReadStream(zip),createWriteStream(partial,{flags:'a'}));
  const footer=Buffer.alloc(84);footer.writeBigInt64LE(BigInt(size),0);footer.write(sha,8,64,'ascii');footer.write('FMXSETUPV001',72,12,'ascii');
  await pipeline((await import('node:stream')).Readable.from([footer]),createWriteStream(partial,{flags:'a'}));
  await rename(partial,output);
} catch(error) { await rm(partial,{force:true});throw error; }
const exeHash=createHash('sha256');for await(const chunk of createReadStream(output))exeHash.update(chunk);
const result={format:1,output,bytes:(await stat(output)).size,sha256:exeHash.digest('hex'),payload:{zip,bytes:size,sha256:sha,root},authenticodeSigned:false,uninstallerIncluded:true,builtAt:new Date().toISOString()};
await writeFile(output+'.build.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
