// One disk-replay controller shared by the desktop panel and remote operators.
// Source Record writes TS continuously; FFmpeg makes bounded, independently playable clips.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, stat, unlink, readdir, lstat, copyFile } from "node:fs/promises";
import { join, resolve, relative, basename } from "node:path";
import { frameRate, replayCameraOptions, frameTargets, seekTargets, estimateAudioOffset } from './replay-sincronia.mjs';
import {ReplayCadence} from './replay-cadence.mjs';
import {ReplayPreview,PREVIEW_SECONDS} from './replay-preview.mjs';

const isoDefaults = () => ({format:'mpegts',directory:'',prefix:'cam',encoder:'default',crf:23,audio:'input',audioSourceUUID:'',splitSeconds:0,width:0,height:0,fpsDivisor:1,bitrate:0,perInput:{}});
export function isoRecordingOptions(value={}, nested=false) {
  const o={...isoDefaults(),...value};
  if(!['mpegts','mkv','mp4_safe'].includes(o.format)||typeof o.encoder!=='string'||!/^[-\w]{1,100}$/.test(o.encoder)||!['input','master','bus-a','bus-b','all-tracks','source'].includes(o.audio))throw Error('Formato, codificador ou áudio ISO inválido');
  if(o.audio==='source'&&(typeof o.audioSourceUUID!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(o.audioSourceUUID)))throw Error('Selecione uma fonte de áudio ISO por UUID');
  if(typeof o.directory!=='string'||o.directory.length>500||/[\x00-\x1f]/.test(o.directory)||(o.directory.trim()&&!/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(o.directory.trim())))throw Error('Use uma pasta ISO absoluta ou deixe vazia para usar a pasta do perfil');
  if(typeof o.prefix!=='string'||!/^[-\w ]{1,40}$/.test(o.prefix)||!o.prefix.trim())throw Error('Prefixo: 1 a 40 letras, números, espaços, hífen ou sublinhado');
  if(!Number.isInteger(Number(o.crf))||o.crf<0||o.crf>51||!Number.isInteger(Number(o.splitSeconds))||o.splitSeconds<0||o.splitSeconds>86400||(o.splitSeconds>0&&o.splitSeconds<4))throw Error('Qualidade: 0 a 51; divisão: zero ou 4 a 86400 segundos');
  const width=Number(o.width),height=Number(o.height),fpsDivisor=Number(o.fpsDivisor),bitrate=Number(o.bitrate);
  if(![width,height].every(v=>Number.isInteger(v)&&(v===0||v>=240&&v<=3840&&v%2===0))||!!width!==!!height||!Number.isInteger(fpsDivisor)||fpsDivisor<1||fpsDivisor>8||!Number.isInteger(bitrate)||bitrate<0||bitrate>50000||bitrate>0&&bitrate<200)throw Error('Tamanho, FPS ou bitrate ISO inválido');
  const perInput={};if(!nested){if(!o.perInput||typeof o.perInput!=='object'||Array.isArray(o.perInput)||Object.keys(o.perInput).length>200)throw Error('Opções por entrada inválidas');for(const [key,override] of Object.entries(o.perInput)){if(!key||key.length>200||['__proto__','constructor','prototype'].includes(key)||!override||typeof override!=='object'||Array.isArray(override))throw Error('Entrada ISO inválida');const normalized=isoRecordingOptions({...o,...override,perInput:{}},true);perInput[key]=Object.fromEntries(Object.keys(override).filter(k=>k in normalized).map(k=>[k,normalized[k]]));}}
  return {format:o.format,directory:o.directory.trim(),prefix:o.prefix.trim(),encoder:o.encoder,crf:Number(o.crf),audio:o.audio,audioSourceUUID:o.audio==='source'?o.audioSourceUUID:'',splitSeconds:Number(o.splitSeconds),width,height,fpsDivisor,bitrate,...(!nested?{perInput}: {})};
}

export const REPLAY_PLAYERS = Object.freeze(["A","B","C","D"]);
const FILTER = "3Mix Replay Rec";
// Source Record forwards this OBS enum; DISABLE (0) bypasses GPU rescaling.
const GPU_SCALE_BICUBIC = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const defaultTags = () => [
  { id: 'gol', name: 'Gol', color: '#16a34a' },
  { id: 'falta', name: 'Falta', color: '#eab308' },
  { id: 'var', name: 'VAR', color: '#ef4444' },
  { id: 'highlights', name: 'Melhores Momentos', color: '#3b82f6' },
  { id: 'defesa', name: 'Defesa', color: '#8b5cf6' }
];
const empty = () => ({ rec: false, speed: 50, activePlayer: "A", selectedEventId: null, events: [], players: {}, markIn: null, session: null, back: null, backPreview: null, linked: false, cameraOptions: {}, audioEnabled: true, retention: { minutes: 30, segmentSeconds: 60, enabled: false }, tagsLibrary: defaultTags() });

function execute(executable, args, timeout = 60000, binary = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";const chunks=[];let byteCount=0;
    const timer = setTimeout(() => { child.kill(); reject(new Error("Tempo esgotado ao preparar o vídeo do replay")); }, timeout);
    child.stdout.on("data", (b) => {if(binary){byteCount+=b.length;if(byteCount>2*1024*1024){child.kill();reject(Error("PCM excede limite"));}else chunks.push(b);}else stdout+=b;});
    child.stderr.on("data", (b) => { stderr = (stderr + b).slice(-5000); });
    child.on("error", () => { clearTimeout(timer); reject(new Error(`${executable}: ferramenta indisponível. Instale FFmpeg/FFprobe ou configure FREEMIX_FFMPEG/FREEMIX_FFPROBE.`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(binary?Buffer.concat(chunks):stdout) : reject(new Error(`Não foi possível preparar o vídeo: ${stderr.slice(-1200)}`));
    });
  });
}

export class DiskReplay {
  constructor({ root, getObs, onChange = () => {}, filter = FILTER, namespace = 'freemix-replay', recordingFolder = 'replay' }) {
    this.root = root;
    this.getObs = getObs;
    this.onChange = onChange;
    this.filter = filter;
    this.namespace = namespace;
    this.recordingFolder = recordingFolder;
    this.state = empty();
    this.scope = null;
    this.isoBusSourceCapture = false;
    this.queue = Promise.resolve();
    this.programScene = null;
    this.internalProgramTarget = null;
    this.alignmentUnsettled = false;
    this.ffmpeg = process.env.FREEMIX_FFMPEG || (existsSync(join(root,"runtime","ffmpeg.exe")) ? join(root,"runtime","ffmpeg.exe") : "ffmpeg");
    this.ffprobe = process.env.FREEMIX_FFPROBE || (existsSync(join(root,"runtime","ffprobe.exe")) ? join(root,"runtime","ffprobe.exe") : "ffprobe");
    this.preview = new ReplayPreview({root,ffmpeg:this.ffmpeg,probe:file=>this.probe(file),session:()=>this.state.session});
    this.historyPin=null;
    this.previewRequests=new Map();
    this.quadQueue=Promise.resolve();
    this.quadToken=0;
    this.transitionCache=null;
    this.disposing=false;
    this.disposed=false;
    this.disposePromise=null;
    this.cadenceFault=null;
    this.cadenceRetiring=null;
  }

  assertReplayOpen(){
    if(this.disposing||this.disposed){const error=Error('Replay está encerrando; nenhuma nova preparação será iniciada');error.code='REPLAY_LIFECYCLE_CLOSED';throw error;}
  }

  cadenceScanner(){
    this.assertReplayOpen();
    if(this.cadenceRetiring||this.cadenceProbe?.closed){const error=Error('Verificação de cadência anterior ainda não foi retirada; confira o encerramento');error.code='REPLAY_CADENCE_RETIRED';throw error;}
    return this.cadenceProbe??=new ReplayCadence({ffprobe:this.ffprobe});
  }

  async retireCadence(){
    const owner=this.cadenceProbe;if(!owner)return;
    this.cadenceRetiring=owner;
    let result;try{result=await owner.close();}catch{}
    if(result?.quiescent!==true||result?.jobs!==0||owner.jobs?.size>0||this.cadenceProbe&&this.cadenceProbe!==owner){
      this.cadenceFault={code:'REPLAY_CADENCE_NOT_QUIESCENT',jobs:owner.jobs?.size??result?.jobs??null};
      const error=Error('FFprobe anterior não confirmou encerramento; a referência foi preservada e nenhuma nova verificação será iniciada');
      Object.assign(error,this.cadenceFault);throw error;
    }
    if(this.cadenceProbe===owner)this.cadenceProbe=null;
    if(this.cadenceRetiring===owner)this.cadenceRetiring=null;
    this.cadenceFault=null;
  }

  async req(type, data) {
    const obs = this.getObs();
    if (!obs) throw new Error("Sem conexão com o 3Mix");
    return obs.req(type, data);
  }
  async optional(type, data) { try { return await this.req(type, data); } catch { return null; } }

  async isoAudioSources(){
    const [status,privacy,capabilities]=await Promise.all([this.req('CallVendorRequest',{vendorName:'freemix',requestType:'get_sources_status',requestData:{}}),this.req('CallVendorRequest',{vendorName:'freemix',requestType:'talkback',requestData:{action:'state'}}),this.req('CallVendorRequest',{vendorName:'freemix',requestType:'audio_capabilities',requestData:{}})]);
    if(!status.responseData?.success||!privacy.responseData?.success)throw Error('Não foi possível conferir a privacidade das fontes ISO');
    const director=privacy.responseData.director_uuid;
    this.isoBusSourceCapture=capabilities.responseData?.source_record_bus_capture===true;
    // Return/monitor taps remain excluded even after renaming: their kind and UUID
    // come from the current native inventory, rather than a stale panel list.
    const excluded=new Set((status.responseData.sources||[]).filter(s=>s.uuid===director||s.kind==='mix-track-to-source'||s.kind==='freemix_audio_bus'&&!this.isoBusSourceCapture||/^3Mix (?:Retorno|N1|Talkback|Diretor|Master)(?:\s|$)/i.test(s.name)).map(s=>s.uuid));
    // SourceRecord currently reads audio_output[0], which OBS zeroes when
    // track 1 is disabled. Never offer an isolated bus that would record silence.
    const candidates=(status.responseData.sources||[]).filter(s=>s.audio&&s.enabled&&!excluded.has(s.uuid));
    const sources=await Promise.all(candidates.map(async s=>{const tracks=await this.optional('GetInputAudioTracks',{inputUuid:s.uuid});if(s.kind==='freemix_audio_bus'&&this.isoBusSourceCapture)return tracks?.inputAudioTracks&&Object.values(tracks.inputAudioTracks).every(x=>!x)?{key:s.uuid,name:s.name,bus:true}:null;return tracks?.inputAudioTracks?.[1]?{key:s.uuid,name:s.name,bus:false}:null;}));return sources.filter(Boolean);
  }

  async validateIsoAudio(options){const choices=await this.isoAudioSources(),sources=new Map(choices.map(s=>[s.key,s]));for(const o of[options,...Object.values(options.perInput||{}).map(x=>({...options,...x}))])if(o.audio==='source'&&!sources.has(o.audioSourceUUID))throw Error('Fonte de áudio ISO ausente, privada ou retorno: '+o.audioSourceUUID);return sources;}

  async validateIsoEncoders(options) {
    const native=await this.req('CallVendorRequest',{vendorName:'freemix',requestType:'get_destinations',requestData:{}}),caps=native?.responseData;
    if(!caps?.success||!Array.isArray(caps.encoders))throw Error('Não foi possível consultar os codificadores ISO do motor');
    const encoders=new Map(caps.encoders.map(e=>[e.id,e]));
    for(const o of [options,...Object.values(options.perInput||{}).map(value=>({...options,...value}))]){
      const id=o.encoder==='default'?'obs_x264':o.encoder,encoder=encoders.get(id),codec=encoder?.codec||(id==='obs_x264'?'h264':null);
      if(!encoder||!['h264','hevc','av1','dnxhd','prores','mpeg2video'].includes(codec))throw Error('Codificador ISO não carregado: '+id);
      if(o.format==='mpegts'&&codec==='av1')throw Error('AV1 não é compatível com TS nesta gravação; escolha MKV ou MP4 seguro');
    }
    return encoders;
  }

  async waitFor(type, data, ready) {
    // Status polling is read-only: a request can time out while the UI thread is
    // finishing a CEF window teardown. Keep polling instead of failing the
    // whole replay command on a single transient timeout.
    const deadline = Date.now() + 20000;
    let lastError = null;
    do {
      try {
        const result = await this.req(type, data);
        if (ready(result)) return result;
      } catch (error) {
        lastError = error;
      }
      await sleep(100);
    } while (Date.now() < deadline);
    throw lastError || new Error(`O motor não confirmou ${type} a tempo`);
  }

  async scopeState() {
    this.assertReplayOpen();
    const { currentSceneCollectionName } = await this.req("GetSceneCollectionList");
    this.assertReplayOpen();
    if (this.scope === currentSceneCollectionName) return;
    const id = createHash("sha256").update(currentSceneCollectionName).digest("hex").slice(0, 24);
    const file = join(this.root, "config", "obs-studio", "plugin_config", this.namespace, `${id}.json`);
    let nextState;
    try { nextState = { ...empty(), ...JSON.parse(await readFile(file, "utf8")) }; }
    catch (e) { if (e.code !== "ENOENT") throw e; nextState = empty(); }
    await this.retireCadence();
    this.assertReplayOpen();
    this.file=file;
    this.state=nextState;
    this.scope = currentSceneCollectionName;
    this.programScene = null;
    this.internalProgramTarget = null;
    this.alignmentUnsettled = false;
  }

  async save() {
    await mkdir(join(this.root, "config", "obs-studio", "plugin_config", this.namespace), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), "utf8");
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rename(`${this.file}.tmp`, this.file);
        break;
      } catch (e) {
        if (attempt === 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        await sleep(50);
      }
    }
    this.onChange(this.state);
  }

  command(action, data = {}) {
    try{this.assertReplayOpen();}catch(e){return Promise.reject(e);}
    // Proxy encoding must never hold the recording/transport mutation queue.
    if(action==='history-preview')return this.historyPreview(data);
    // Quad frames are read-only, but four FFmpeg decodes must not pile up on
    // the operator queue. They run in their own serial lane.
    if(action==='history-quad')return this.historyQuadSerial(data);
    const work = this.queue.then(async () => {
      this.assertReplayOpen();
      await this.scopeState();
      switch (action) {
        case "status": return this.status();
        case "history": return { ...await this.status(), history: await this.history() };
        case "history-frame": return { ...await this.status(), ...await this.historyFrame(data) };
        case "history-pin": await this.pinHistory(data);break;
        case "capture-range": await this.captureRange(data); break;
        case "program-changed": await this.programChanged(data); break;
        case "start": await this.start(data.cams); break;
        case "configure":
          if(this.recordingFolder!=='iso')throw Error('Opções exclusivas da MultiGravação');
          if(this.state.rec)throw Error('Pare a MultiGravação antes de alterar opções');
          {const options=isoRecordingOptions(data.options);await this.validateIsoEncoders(options);await this.validateIsoAudio(options);this.state.recordOptions=options;await this.save();break;}
        case "stop": await this.stop(); break;
        case "recover": if(this.state.rec)throw Error('Pare REC antes de recuperar arquivos');await this.finalizeSafeIso();break;
        case "import": await this.importClip(data);break;
        case "export-event": return { ...await this.status(), export: await this.exportEvent(data) };
        case "export-events": return { ...await this.status(), export: await this.exportEvents(data) };
        case "reorder": await this.reorderEvents(data);break;
        case "recover-in": await this.recoverMarkedEvent();break;
        case "retention": await this.retention(data); break;
        case "auto-align": await this.autoAlign(data);break;
        case "repair": await this.repairClip(data);break;
        case "relocate": await this.relocateClip(data);break;
        case "relink": await this.relinkFolder(data);break;
        case "update-event": await this.updateEvent(data);break;
        case "tag-create": await this.createTag(data);break;
        case "tag-remove": await this.removeTag(data);break;
        case "trim-event": await this.trimEvent(data);break;
        case "unload": await this.unloadPlayer(data.player);break;
        case "link": await this.link(data.enabled); break;
        case "swap": await this.swap(); break;
        case "jump": await this.jump(data); break;
        case "jump-to-now": await this.jumpToNow(data); break;
        case "play-event": await this.playEvent(data); break;
        case "select-event": await this.selectEvent(data); break;
        case "select-camera": await this.selectCamera(data); break;
        case "play-pause": await this.playPause(data); break;
        case "mark-in-out": await this.markInOut(data); break;
        case "transport": await this.transport(data); break;
        case "seek": await this.seekPlayer(data); break;
        case "frame": await this.stepFrame(data); break;
        case "camera-options": await this.configureCamera(data); break;
        case "audio": if(typeof data.enabled!=='boolean')throw Error('Informe áudio ligado ou desligado');this.state.audioEnabled=data.enabled;await this.applyPlayerAudio();await this.save();break;
        case "capture": await this.capture(Number(data.seconds)); break;
        case "mark-in": await this.markIn(); break;
        case "mark-out": await this.markOut(); break;
        case "load": await this.load(data.player, data.eventId, data.cam); break;
        case "air": await this.air(data.player); break;
        case "live": await this.live(); break;
        case "speed": await this.speed(Number(data.speed)); break;
        case "delete": this.state.events = this.state.events.filter((e) => e.id !== data.eventId); await this.save(); break;
        default: throw new Error("Comando de replay desconhecido");
      }
      return this.status();
    });
    this.queue = work.catch(() => {});
    return work;
  }

  async status() {
    if (this.state.rec && this.state.session) {
      for (const cam of this.state.session.cams) {
        const filter = await this.optional("GetSourceFilter", { sourceName: cam.source, filterName: this.filter });
        if (!filter?.filterEnabled || filter.filterSettings.record_mode !== 1) {
          this.state.rec = false;
          this.state.interrupted = {at:Date.now(),reason:'A gravação da sessão parou no motor',sessionId:this.state.session.id,openIn:!!this.state.markIn};
          await this.save();
          break;
        }
      }
    }
    if (this.state.rec && this.state.session?.segmented) await this.segments(true);
    if(this.recordingFolder==='iso'){
      if(['fragmented_mp4','hybrid_mp4'].includes(this.state.recordOptions?.format))this.state.recordOptions.format='mpegts';
      this.state.recordOptions=isoRecordingOptions(this.state.recordOptions);
      if(this.state.session?.options){const files=await readdir(this.state.session.dir).catch(()=>[]);for(const cam of this.state.session.cams){const ownDir=cam.dir||this.state.session.dir,ownFiles=ownDir===this.state.session.dir?files:await readdir(ownDir).catch(()=>[]);cam.files=ownFiles.filter(n=>n===cam.basename+cam.extension||n.startsWith(cam.basename+'-')&&n.endsWith(cam.extension)).sort().map(n=>join(ownDir,n));}}
    }
    if(this.state.linked) await this.align(false);
    if(this.recordingFolder==='replay'&&Object.keys(this.state.players).length)await this.applyPlayerAudio();
    const audioChoices=this.recordingFolder==='iso'?await this.isoAudioSources():undefined;
    if(this.recordingFolder==='iso'&&this.state.rec&&this.state.session?.options){const selected=[this.state.session.options,...this.state.session.cams.map(c=>c.options)].filter(o=>o?.audio==='source');if(selected.some(o=>!audioChoices.some(s=>s.key===o.audioSourceUUID))){await this.stop();this.state.interrupted={at:Date.now(),reason:'Fonte de áudio ISO removida, privada ou sem trilha 1 disponível',sessionId:this.state.session?.id};await this.save();}}
    const list = await this.req("GetSceneList");
    if(this.recordingFolder==='replay') {
      if(this.programScene===null)this.programScene=list.currentProgramSceneName;
      else if(this.programScene!==list.currentProgramSceneName)this.onProgramChanged(list.currentProgramSceneName)?.catch(e=>{this.state.playbackError=e.message;this.onChange(this.state);});
    }
    const fileState=this.fileAvailability||(this.fileAvailability=new Map());
    const available=file=>{if(!file)return false;const hit=fileState.get(file);if(hit&&Date.now()-hit.at<3000)return hit.ok;const ok=existsSync(file);fileState.set(file,{ok,at:Date.now()});return ok;};
    const players={...this.state.players};for(const player of REPLAY_PLAYERS)if(players[player]){const media=await this.optional('GetMediaInputStatus',{inputName:`Replay Player ${player}`});players[player]={...players[player],available:available(players[player].file),...(media?{mediaCursor:media.mediaCursor,mediaDuration:media.mediaDuration,mediaState:media.mediaState}:{})};}
    const events=this.state.events.map(event=>({...event,clips:(event.clips||[]).map(clip=>({...clip,available:available(clip.file)})),available:(event.clips||[]).some(clip=>available(clip.file))}));
    // Return-to-live needs the exact source and transition the operator will
    // resume. The transition is cached briefly so polling stays cheap.
    let backTransition=null;
    if(this.state.back){
      const now=Date.now();
      if(!this.transitionCache||now-this.transitionCache.at>10000){
        const current=await this.optional('GetSceneTransitionList',{});
        this.transitionCache={at:now,name:current?.currentSceneTransitionName||'Corte',durationMs:Number(current?.currentSceneTransitionDuration)||0};
      }
      backTransition={scene:this.state.back,name:this.transitionCache.name,durationMs:this.transitionCache.durationMs};
    }
    return { ...this.state, events, backTransition, backAvailable:this.state.back?list.scenes.some(s=>s.sceneName===this.state.back):false, historySupported:this.recordingFolder==='replay',historyPlaybackSupported:this.recordingFolder==='replay',programAutoplaySupported:this.recordingFolder==='replay',playerIds:REPLAY_PLAYERS,players, ...(audioChoices?{audioChoices,audioBusSourceSupported:this.isoBusSourceCapture,audioSourceLimit:this.isoBusSourceCapture?'Bus independente deve ficar sem rotas M/A/B: captura PCM própria, fora das trilhas globais. Folhas públicas ainda exigem trilha 1.':'Fonte direta exige folha pública com trilha 1 já habilitada; buses isolados não são capturados diretamente por este SourceRecord. Use sua rota A/B e escolha Bus A/B.'}:{}), program: list.currentProgramSceneName, preview: list.currentPreviewSceneName,
      availableCams: list.scenes.map((s) => s.sceneName).filter((n) => !n.startsWith("REPLAY ") && n !== "3Mix Barramentos") };
  }

  async probe(file, verifyCadence = false) {
    this.assertReplayOpen();
    const result = JSON.parse(await execute(this.ffprobe, ["-v", "error", "-show_entries", "format=duration,start_time:stream=codec_type,codec_name,width,height,duration,start_time,avg_frame_rate,r_frame_rate,nb_frames,time_base", "-of", "json", file], 15000));
    this.assertReplayOpen();
    const video = result.streams?.find((s) => s.codec_type === "video");
    const audio = result.streams?.find((s) => s.codec_type === "audio");
    const duration = Number(video?.duration || result.format?.duration) + Number(video?.start_time || 0) - Number(result.format?.start_time || 0);
    if (!Number.isFinite(duration) || duration <= 0 || (!audio&&!result.streams?.some((s) => s.codec_type === "video" && s.width > 0))) {
      throw new Error("O arquivo ainda não contém vídeo reproduzível; aguarde a gravação");
    }
    let rate=null,variableFrameRate=false;try{rate=frameRate(video?.avg_frame_rate);const nominal=frameRate(video?.r_frame_rate);variableFrameRate=Math.abs(rate.fps-nominal.fps)>.001;}catch{}
    let cadence = null;
    // Container rates alone can both say 30/1 for irregular frame timestamps.
    // Only saved-player loads need a finite whole-clip decode. Live history
    // and proxy probing keep their metadata-only path; seeks reuse identity.
    if(verifyCadence){
      const start=video?.start_time;
      const videoStart=typeof start==='string'&&start.trim()!==''?Number(start):typeof start==='number'?start:NaN;
      cadence=await this.cadenceScanner().probe(file,{duration,frameMs:rate?.frameMs,videoStart});
      this.assertReplayOpen();
      variableFrameRate||=cadence.status==='vfr';
    }
    return { duration, streams: result.streams, videoStart: Number(video?.start_time || 0), containerStart: Number(result.format?.start_time || 0), frameRate:rate?`${rate.numerator}/${rate.denominator}`:null, variableFrameRate, cadence, hasVideo:result.streams.some(s=>s.codec_type==='video'),audio:result.streams.some(s=>s.codec_type==='audio') };
  }

  async hasRecordedVideoPacket(file,expectedCodec) {
    // Live MKV has no duration footer until closed. Require an actual video
    // stream header and valid dimensions/codec, plus either recorded packets
    // or confirmed video stream allocation with growing file size.
    let result;
    try {
      result=JSON.parse(await execute(this.ffprobe,['-v','error','-select_streams','v','-read_intervals','%+#64','-show_entries','stream=index,codec_type,codec_name,width,height:packet=stream_index,size','-of','json',file],5000));
    } catch {
      return false;
    }
    const video=result.streams?.find(s=>s.codec_type==='video'&&s.width>0&&s.height>0);
    if(!video)return false;
    if(expectedCodec&&video.codec_name!==expectedCodec)throw Error('O motor gravou um codec diferente do selecionado');
    const hasPackets=Array.isArray(result.packets)&&result.packets.some(p=>Number(p.size)>0);
    if(hasPackets)return true;
    // Em fontes com imagem fixa/estática (ex: tela preta, color bar), o muxer Matroska
    // retém pequenos blocos no buffer antes de fechar o cluster. Se o stream de vídeo
    // já foi criado e inicializado no container com resolução real e o arquivo existe
    // no disco com tamanho além do cabeçalho (>= 1KB), a gravação está ativa.
    const fileStat=await stat(file).catch(()=>null);
    if(fileStat&&fileStat.size>=1024)return true;
    return false;
  }

  async start(names) {
    if (this.state.rec) throw new Error("A sessão de replay já está gravando");
    const list = (await this.req("GetSceneList")).scenes.map((s) => s.sceneName);
    if (!Array.isArray(names) || !names.length || names.length > 8 || names.some((n) => !list.includes(n) || n.startsWith("REPLAY ") || n === "3Mix Barramentos")) {
      throw new Error("Selecione entre uma e oito entradas existentes para gravar");
    }
    const privacy=await this.optional('CallVendorRequest',{vendorName:'freemix',requestType:'talkback',requestData:{action:'state'}});
    const director=(await this.req('GetInputList')).inputs.find(i=>i.inputUuid===privacy?.responseData?.director_uuid)?.inputName;
    if(director){const contains=async(scene,seen=new Set(),group=false)=>{if(seen.has(scene))return false;seen.add(scene);const items=(await this.req(group?'GetGroupSceneItemList':'GetSceneItemList',{sceneName:scene})).sceneItems;for(const i of items){if(i.sourceName===director)return true;if((i.isGroup||i.inputKind===null)&&await contains(i.sourceName,seen,i.isGroup))return true;}return false;};for(const name of names)if(await contains(name))throw Error('ISO/replay recusado: esta entrada contém o mic privado do diretor');}
    await execute(this.ffmpeg, ["-version"], 5000);
    await execute(this.ffprobe, ["-version"], 5000);
    const { recordDirectory } = await this.req("GetRecordDirectory");
    const options=this.recordingFolder==='iso'?isoRecordingOptions(this.state.recordOptions):null;
    const encoders=options?await this.validateIsoEncoders(options):null;
    const audioSources=options?await this.validateIsoAudio(options):null;
    const session = { id: randomUUID(), startedAt: Date.now(), dir: join(options?.directory||recordDirectory, this.recordingFolder, randomUUID()), cams: [], segmented: this.recordingFolder === "replay" && this.state.retention.enabled, retention: { ...this.state.retention },...(options?{options}: {}) };
    await mkdir(session.dir, { recursive: true });
    try {
      for (const [i, name] of [...new Set(names)].entries()) {
        // Record the input container, including its layers and attached audio.
        const source = name;
        const ownOptions=options?{...options,...options.perInput?.[name]}:null;
        const camDir=ownOptions?.directory?join(ownOptions.directory,'iso',session.id):session.dir;await mkdir(camDir,{recursive:true});
        const extension=ownOptions?({mpegts:'.ts',mkv:'.mkv',mp4_safe:'.mkv',mxf:'.mxf',mov:'.mov'})[ownOptions.format]||'.ts':'.ts';
        const basename=ownOptions?`${ownOptions.prefix}-${i+1}`:`cam-${i+1}`;
        const expectedCodec=ownOptions?encoders.get(ownOptions.encoder==='default'?'obs_x264':ownOptions.encoder)?.codec:null;
        const cam = { name, source, file: join(camDir, basename+extension),dir:camDir,options:ownOptions,expectedCodec, index: i + 1, segments: [],...(options?{basename,extension,files:[]}: {}) };
        session.cams.push(cam);
        const before = await this.optional("GetSourceFilter", { sourceName: source, filterName: this.filter });
        if (before?.filterSettings?.record_mode === 1) {
          throw new Error(`A entrada ${name} já está gravando replay. Pare a sessão anterior antes de iniciar outra.`);
        }
        const replayAudio=replayCameraOptions(this.state.cameraOptions?.[name]).recordAudio;
        const settings = { path: camDir, filename_formatting: session.segmented ? `cam-${i+1}-%CCYY-%MM-%DD_%hh-%mm-%ss` : ownOptions?.splitSeconds?`${basename}-%CCYY-%MM-%DD_%hh-%mm-%ss`:basename, rec_format: ownOptions?.format==='mp4_safe'?'mkv':ownOptions?.format==='mpegts'?'ts':ownOptions?.format||"ts", record_mode: 1,
          ...(!options?{different_audio:replayAudio!=='input',audio_track:({input:0,master:1,'bus-a':2,'bus-b':3})[replayAudio],audio_source:''}:{}),
          split_file: session.segmented, max_time_sec: session.retention.segmentSeconds, max_size_mb: 0, record_max_seconds: 0, keyint_sec: 1, opts: 'keyint=1', x264opts: 'keyint=1',
          ...(process.env.FREEMIX_REPLAY_ENCODER ? { encoder: process.env.FREEMIX_REPLAY_ENCODER } : {}),
          ...(ownOptions?{encoder:ownOptions.encoder==='default'?'':ownOptions.encoder,rate_control:ownOptions.bitrate?'CBR':ownOptions.encoder.includes('nvenc')?'CQP':'CRF',cqp:ownOptions.crf,bitrate:ownOptions.bitrate||4000,crf:ownOptions.crf,tune:ownOptions.encoder==='obs_x264'?'zerolatency':'',split_file:ownOptions.splitSeconds>0,max_time_sec:ownOptions.splitSeconds,different_audio:ownOptions.audio!=='input',audio_track:({input:0,source:0,master:1,'bus-a':2,'bus-b':3,'all-tracks':-1})[ownOptions.audio],audio_source:ownOptions.audio==='source'?audioSources.get(ownOptions.audioSourceUUID).name:'',scale:!!ownOptions.width,scale_type:ownOptions.width?GPU_SCALE_BICUBIC:0,width:ownOptions.width,height:ownOptions.height,resolution:ownOptions.width?ownOptions.width+'x'+ownOptions.height:'',frame_rate_divisor:ownOptions.fpsDivisor>1?ownOptions.fpsDivisor:0}: {}) };
        if (!before) {
          await this.req("CreateSourceFilter", { sourceName: source, filterName: this.filter, filterKind: "source_record_filter", filterSettings: settings });
        } else {
          await this.req("SetSourceFilterSettings", { sourceName: source, filterName: this.filter, filterSettings: settings });
          await this.req("SetSourceFilterEnabled", { sourceName: source, filterName: this.filter, filterEnabled: true });
        }
        cam.owned = true;
      }
      // Confirm actual output, rather than treating a successful settings request as recording.
      for (const cam of session.cams) {
        let ready = false;
        const maxAttempts = cam.extension === '.mkv' ? 60 : 40;
        const minSize = cam.extension === '.mkv' ? 1024 : 188 * 10;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if(session.segmented){const prefix=`cam-${cam.index}-`;const names=(await readdir(session.dir)).filter(n=>n.startsWith(prefix)&&n.endsWith('.ts')).sort();if(names.length)cam.file=join(session.dir,names[0]);}
          if(cam.options?.splitSeconds){const files=(await readdir(cam.dir)).filter(n=>n.startsWith(cam.basename+'-')&&n.endsWith(cam.extension)).sort();if(files.length)cam.file=join(cam.dir,files[0]);}
          if ((await stat(cam.file).catch(() => null))?.size >= minSize) {
            try { if(cam.extension==='.mkv'){if(!await this.hasRecordedVideoPacket(cam.file,cam.expectedCodec))throw Error('no video packet');}else {const info=await this.probe(cam.file);if(cam.expectedCodec&&!info.streams.some(s=>s.codec_name===cam.expectedCodec))throw Error('wrong codec');}ready = true; break; } catch {}
          }
          await sleep(250);
        }
        if (!ready) throw new Error(`A câmera ${cam.name} não produziu vídeo no disco. Confira o codificador e a entrada.`);
      }
    } catch (e) {
      for (const cam of session.cams.filter((c) => c.owned)) {
        await this.optional("SetSourceFilterSettings", { sourceName: cam.source, filterName: this.filter, filterSettings: { record_mode: 0 } });
      }
      throw e;
    }
    this.state.session = session;
    this.state.rec = true;
    this.state.markIn = null;
    await this.save();
  }

  async stop() {
    if (!this.state.session || !this.state.rec) throw new Error("Nenhuma sessão de replay está gravando");
    for (const cam of this.state.session.cams) {
      await this.req("SetSourceFilterSettings", { sourceName: cam.source, filterName: this.filter, filterSettings: { record_mode: 0 } });
    }
    this.state.rec = false;
    this.state.markIn = null;
    await this.save();
    if(this.state.session.segmented){await sleep(500);await this.segments(false);}
    await sleep(400);await this.finalizeSafeIso();
    await this.save();
  }

  async retention(d) {
    if(this.state.rec)throw new Error("Pare REC antes de alterar retenção");
    const minutes=Number(d.minutes),segmentSeconds=Number(d.segmentSeconds??60);
    if(!Number.isFinite(minutes)||minutes<1||minutes>1440||!Number.isInteger(segmentSeconds)||segmentSeconds<4||segmentSeconds>300||minutes*60<segmentSeconds*2)throw new Error("Retenção: 1 a 1440 minutos e segmentos de 4 a 300 segundos, com pelo menos dois segmentos");
    this.state.retention={enabled:d.enabled===true,minutes,segmentSeconds};await this.save();
  }

  async finalizeSafeIso() {
    if(this.recordingFolder!=='iso'||!this.state.session)return;
    for(const cam of this.state.session.cams){
      if(cam.options?.format!=='mp4_safe')continue;
      const filter=await this.optional('GetSourceFilter',{sourceName:cam.source,filterName:this.filter});
      if(filter?.filterEnabled&&filter.filterSettings?.record_mode===1)throw Error('Arquivo ainda está gravando; recuperação MP4 adiada');
      const dir=cam.dir||this.state.session.dir,files=(await readdir(dir)).filter(n=>(n===cam.basename+'.mkv'||n.startsWith(cam.basename+'-')&&n.endsWith('.mkv')));
      cam.finalFiles=[];
      for(const name of files){
        const input=join(dir,name),output=join(dir,name.slice(0,-4)+'.mp4'),temporary=output+'.tmp.mp4';
        const info=await lstat(input);if(!info.isFile()||info.isSymbolicLink())throw Error('Arquivo ISO irregular');
        if((await stat(output).catch(()=>null))?.size>0){await this.probe(output);cam.finalFiles.push(output);continue;}
        try{const source=await this.probe(input),hevc=source.streams.some(s=>s.codec_type==='video'&&s.codec_name==='hevc');await execute(this.ffmpeg,['-hide_banner','-v','error','-nostdin','-y','-i',input,'-map','0','-c','copy',...(hevc?['-tag:v','hvc1']:[]),'-movflags','+faststart',temporary]);await this.probe(temporary);await rename(temporary,output);cam.finalFiles.push(output);}catch(e){await unlink(temporary).catch(()=>{});throw Error('MKV preservado; falha ao finalizar MP4: '+e.message);}
      }
    }
    await this.save();
  }

  async importClip(d) {
    if(this.recordingFolder!=='replay')throw Error('Importação disponível no Replay');
    if(typeof d.file!=='string'||d.file.length>1000||!/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(d.file)||/[\x00-\x1f]/.test(d.file))throw Error('Informe arquivo de vídeo local com caminho absoluto');
    const original=resolve(d.file),input=await lstat(original);if(!input.isFile()||input.isSymbolicLink())throw Error('Arquivo de vídeo irregular');
    const source=await this.probe(original);if(source.duration<=0||source.duration>3600)throw Error('Clipe precisa durar até uma hora');
    const id=randomUUID(),dir=join(this.root,'gravacoes/replay/importados',id);await mkdir(dir,{recursive:true});const file=join(dir,'clip.mp4');
    try{await execute(this.ffmpeg,['-hide_banner','-v','error','-nostdin','-y','-i',original,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-crf','18','-g','1','-bf','0','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',file],600000);const media=await this.probe(file);const name=String(d.name||'Clipe importado').trim().slice(0,120),cam=String(d.cam||'Importado').trim().slice(0,120);this.state.events.push({id,name,cam,dur:media.duration,createdAt:Date.now(),time:new Date().toLocaleTimeString('pt-BR'),imported:true,clips:[{cam,file,start:0,end:media.duration,duration:media.duration}]});await this.save();}catch(e){await unlink(file).catch(()=>{});throw e;}
  }
  async reorderEvents(d) {
    if(!Array.isArray(d.ids)||d.ids.length!==this.state.events.length||new Set(d.ids).size!==d.ids.length||d.ids.some(id=>!this.state.events.some(e=>e.id===id)))throw Error('Envie cada lance exatamente uma vez na ordem desejada');
    const events=new Map(this.state.events.map(e=>[e.id,e]));this.state.events=d.ids.map(id=>events.get(id));await this.save();
  }

  // vMix 30 ("ReplaySelectedEventsExport"/"Export All Events"): copia os clipes já prontos de
  // um ou mais lances para uma pasta escolhida pelo operador. Não recodifica -- cada clipe do
  // Replay já é um .mp4 independente e tocável (makeEvent/importClip/repairClip os produzem
  // assim); exportar é só copiar com nome legível, igual a "Salvar como" de um arquivo que já
  // existe, nunca reabrir o FFmpeg para isso. Mantém o arquivo original intacto em
  // gravacoes/replay/ -- a cópia é sempre adicional, nunca move nem apaga o clipe fonte.
  exportDestination(diretorio) {
    const pasta=String(diretorio||'').trim();
    if(pasta){
      if(pasta.length>500||/[\x00-\x1f]/.test(pasta)||!/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(pasta))throw Error('Pasta de exportação deve ser um caminho absoluto');
      return resolve(pasta);
    }
    return join(this.root,'gravacoes/replay/exportados',new Date().toISOString().replace(/[:.]/g,'-'));
  }
  // Nome de arquivo seguro a partir do título do lance + câmera, sem depender de regras de
  // nome de arquivo do sistema operacional além do que já é proibido em qualquer plataforma.
  exportFileName(event,clip,indice){
    const base=String(event.name||'Lance').replace(/[\\/:*?"<>|\x00-\x1f]+/g,' ').trim().slice(0,80)||'Lance';
    const cam=String(clip.cam||'CAM').replace(/[\\/:*?"<>|\x00-\x1f]+/g,' ').trim().slice(0,40)||'CAM';
    const ext=String(clip.file||'').toLowerCase().endsWith('.mkv')?'.mkv':'.mp4';
    return `${String(indice+1).padStart(2,'0')} - ${base} - ${cam}${ext}`;
  }
  async exportEventsTo(events,diretorio){
    if(!events.length)throw Error('Nenhum lance para exportar');
    const destino=this.exportDestination(diretorio);
    await mkdir(destino,{recursive:true});
    const exportados=[];
    for(const event of events){
      const clips=Array.isArray(event.clips)?event.clips:[];
      if(!clips.length){exportados.push({eventId:event.id,name:event.name,arquivos:[],erro:'Lance sem clipe gravado'});continue;}
      const arquivos=[];
      for(const [indice,clip] of clips.entries()){
        if(!clip.file||!existsSync(clip.file)){arquivos.push({cam:clip.cam,erro:'Arquivo original não encontrado no disco'});continue;}
        const nome=this.exportFileName(event,clip,indice),caminho=join(destino,nome);
        await copyFile(clip.file,caminho);
        arquivos.push({cam:clip.cam,path:caminho});
      }
      exportados.push({eventId:event.id,name:event.name,arquivos});
    }
    return {directory:destino,events:exportados};
  }
  async exportEvent(d){
    const event=this.state.events.find(e=>e.id===d.eventId);
    if(!event)throw Error('Lance não encontrado');
    return this.exportEventsTo([event],d.directory);
  }
  async exportEvents(d){
    let pool = this.state.events;
    if(Array.isArray(d.tags) && d.tags.length){
      const filterTags = new Set(d.tags.map(t => String(t).toLowerCase()));
      pool = pool.filter(e => Array.isArray(e.tags) && e.tags.some(t => filterTags.has(String(t).toLowerCase())));
    }
    if(typeof d.folder === 'string' && d.folder.trim()){
      const folder = d.folder.trim().toLowerCase();
      pool = pool.filter(e => String(e.folder || '').toLowerCase() === folder);
    }
    if(typeof d.cam === 'string' && d.cam.trim()){
      const cam = d.cam.trim();
      pool = pool.filter(e => e.cam === cam || (Array.isArray(e.clips) && e.clips.some(c => c.cam === cam)));
    }
    const ids=Array.isArray(d.eventIds)?d.eventIds:null;
    if(ids){
      if(!ids.length||ids.length>500)throw Error('Selecione de 1 a 500 lances para exportar');
      const byId=new Map(pool.map(e=>[e.id,e]));
      const events=ids.map(id=>byId.get(id));
      if(events.some(e=>!e))throw Error('Um dos lances selecionados não existe mais');
      return this.exportEventsTo(events,d.directory);
    }
    // Sem eventIds: "exportar todos" do conjunto filtrado
    return this.exportEventsTo(pool,d.directory);
  }
  async recoverMarkedEvent() {
    if(this.recordingFolder!=='replay'||this.state.rec||!this.state.session||!this.state.markIn||this.state.markIn.sessionId!==this.state.session.id)throw Error('Nenhum IN interrompido recuperável');
    for(const cam of this.state.session.cams){const filter=await this.optional('GetSourceFilter',{sourceName:cam.source,filterName:this.filter});if(filter?.filterEnabled&&filter.filterSettings?.record_mode===1)throw Error('A entrada ainda grava; pare antes de recuperar IN');}
    if(this.state.session.segmented)await this.segments(false);
    const ranges=[];for(const cam of this.state.session.cams){let end,containerStart=0;if(this.state.session.segmented){const available=cam.segments.filter(s=>!s.deleted);if(!available.length)throw Error('Segmentos não encontrados');end=available.at(-1).start+available.at(-1).duration;}else{const media=await this.probe(cam.file);end=media.duration;containerStart=media.containerStart;}const start=this.state.markIn.positions.find(p=>p.name===cam.name)?.end;if(!Number.isFinite(start)||end<=start)throw Error('Não há vídeo gravado depois do IN');ranges.push({...cam,start,end:Math.min(end,start+120),containerStart});}
    await this.makeEvent(ranges);this.state.events[0].recovered=true;this.state.markIn=null;await this.save();
  }

  async segments(purge) {
    const session=this.state.session;if(!session?.segmented)return;
    const names=await readdir(session.dir);let changed=false;
    for(const cam of session.cams){
      const pattern=new RegExp(`^cam-${cam.index}-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}(?:_\\d+)?\\.ts$`);
      const found=names.map(name=>({name,m:pattern.exec(name)})).filter(x=>x.m).sort((a,b)=>a.name.localeCompare(b.name));
      for(const [i,entry] of found.entries()){
        let segment=cam.segments.find(s=>s.name===entry.name);const closed=i<found.length-1||!this.state.rec;
        if(segment?.closed)continue;
        const file=join(session.dir,entry.name);let info;try{info=await this.probe(file);}catch{continue;}
        if(!segment){const prior=cam.segments.at(-1);segment={name:entry.name,file,start:prior?prior.start+prior.duration:0};cam.segments.push(segment);changed=true;}
        segment.duration=info.duration;segment.frameRate=info.frameRate;segment.closed=closed;changed ||= closed;
      }
      if(purge&&cam.segments.length){const end=cam.segments.at(-1).start+cam.segments.at(-1).duration,cutoff=end-session.retention.minutes*60;
        const marked=this.state.markIn?.positions?.find(p=>p.name===cam.name)?.end;
        const pin=this.historyPin?.sessionId===session.id&&this.historyPin.expires>Date.now()?this.historyPin:null;
        for(const segment of cam.segments){if(segment.deleted||!segment.closed||segment.start+segment.duration>=cutoff||(marked!==undefined&&segment.start+segment.duration>=marked)||(pin&&segment.start+segment.duration>=pin.start&&segment.start<=pin.end)||this.preview.isReadingSource(segment.file))continue;
          const expected=resolve(session.dir,segment.name);if(resolve(segment.file)!==expected||!pattern.test(segment.name)||relative(resolve(session.dir),expected).startsWith('..'))throw new Error("Segmento fora da sessão");
          const info=await lstat(expected);if(!info.isFile()||info.isSymbolicLink())throw new Error("Retenção recusou arquivo irregular");
          await unlink(expected);segment.deleted=true;changed=true;
        }
      }
    }
    if(changed)await this.save();
  }

  async positions(requireRecording = true) {
    await this.status();
    if (!this.state.session || (requireRecording && !this.state.rec)) throw new Error("Inicie a gravação SSD antes de marcar um lance");
    if(this.state.session.segmented) {await this.segments(false);return this.state.session.cams.map(cam=>{const list=cam.segments.filter(s=>!s.deleted);if(!list.length)throw new Error("Nenhum segmento reproduzível");return {...cam,end:list.at(-1).start+list.at(-1).duration,earliest:list[0].start,frameRate:list.at(-1).frameRate||null};});}
    const values = await Promise.all(this.state.session.cams.map(async (cam) => {
      const media = await this.probe(cam.file);
      return { ...cam, end: media.duration, containerStart: media.containerStart, frameRate: media.frameRate };
    }));
    return values;
  }

  async history(positions) {
    if(this.recordingFolder!=='replay'||!this.state.session)return null;
    const ranges=positions||await this.positions(false);
    const start=Math.max(...ranges.map(r=>r.earliest||0)),end=Math.min(...ranges.map(r=>r.end));
    if(end<=start)throw Error('Ainda não há histórico comum reproduzível nas câmeras');
    return {sessionId:this.state.session.id,start,end,recording:this.state.rec,cameras:ranges.map(r=>r.name),frameRate:ranges[0].frameRate||null};
  }

  async frameJpeg(ranges, camName, at) {
    const cam=ranges.find(r=>r.name===camName);
    if(!cam)throw Error('Selecione uma câmera da sessão');
    let file=cam.file,localAt=at,containerStart=cam.containerStart;
    if(this.state.session.segmented){
      const part=cam.segments.find(s=>!s.deleted&&s.start<=at&&s.start+s.duration>at);
      if(!part)throw Error('Este trecho já expirou pela retenção');
      file=part.file;localAt=at-part.start;containerStart=(await this.probe(file)).containerStart;
    }
    const jpeg=await execute(this.ffmpeg,['-hide_banner','-v','error','-nostdin','-ss',String(Math.max(0,localAt-3)),'-copyts','-i',file,'-vf',`trim=start=${Math.round((localAt+containerStart)*90000)/90000},setpts=PTS-STARTPTS,scale=640:-2`,'-frames:v','1','-an','-c:v','mjpeg','-q:v','3','-f','image2pipe','pipe:1'],15000,true);
    if(!jpeg.length)throw Error('Quadro ainda não disponível. Volte um pouco na timeline');
    return jpeg;
  }

  async historyFrame(d) {
    const ranges=await this.positions(false),history=await this.history(ranges);
    if(!history||d.sessionId!==history.sessionId)throw Error('A sessão mudou. Atualize a timeline');
    const cursor=Number(d.cursor);
    if(!Number.isFinite(cursor)||cursor<history.start||cursor>history.end)throw Error('Posição fora do histórico disponível');
    const at=Math.min(cursor,Math.max(history.start,history.end-0.1));
    const jpeg=await this.frameJpeg(ranges,d.cam,at);
    return {history,historyFrame:{cursor:at,cam:d.cam,image:'data:image/jpeg;base64,'+jpeg.toString('base64')}};
  }

  // One shared cursor, four independent camera decodes. The caller receives
  // every available angle even if a single camera fails at that position.
  async historyQuad(d) {
    this.assertReplayOpen();
    await this.scopeState();
    const ranges=await this.positions(false),history=await this.history(ranges);
    if(!history||d.sessionId!==history.sessionId)throw Error('A sessão mudou. Atualize a timeline');
    const cursor=Number(d.cursor);
    if(!Number.isFinite(cursor)||cursor<history.start||cursor>history.end)throw Error('Posição fora do histórico disponível');
    const requested=Array.isArray(d.cams)&&d.cams.length?d.cams:history.cameras.slice(0,4);
    const cams=[...new Set(requested)].filter(name=>history.cameras.includes(name)).slice(0,4);
    if(!cams.length)throw Error('Selecione até quatro câmeras do histórico');
    const at=Math.min(cursor,Math.max(history.start,history.end-0.1));
    const frames=await Promise.all(cams.map(async cam=>{
      try{const jpeg=await this.frameJpeg(ranges,cam,at);return {cam,image:'data:image/jpeg;base64,'+jpeg.toString('base64')};}
      catch(error){return {cam,error:error.message};}
    }));
    return {history,historyFrames:{cursor:at,frames}};
  }

  historyQuadSerial(d) {
    const token=++this.quadToken;
    const run=this.quadQueue.then(()=>{
      if(token!==this.quadToken){const error=Error('Busca de quadro substituída');error.code='REPLAY_QUAD_STALE';throw error;}
      return this.historyQuad(d);
    });
    this.quadQueue=run.catch(()=>{});
    return run;
  }

  async historyPreview(d) {
    const viewer=String(d.viewerId||'legacy');if(!/^[a-zA-Z0-9-]{1,64}$/.test(viewer))throw Error('Identificador de prévia inválido');
    const sequence=(this.previewRequests.get(viewer)||0)+1;this.previewRequests.delete(viewer);this.previewRequests.set(viewer,sequence);if(this.previewRequests.size>64)this.previewRequests.delete(this.previewRequests.keys().next().value);
    await this.scopeState();const ranges=await this.positions(false),history=await this.history(ranges);
    if(!history||d.sessionId!==history.sessionId)throw Error('A sessão mudou. Atualize a timeline');
    const cursor=Number(d.cursor),cam=ranges.find(r=>r.name===d.cam);
    if(!cam||!Number.isFinite(cursor)||cursor<history.start||cursor>history.end)throw Error('Posição ou câmera fora do histórico');
    const safeEnd=history.end-(history.recording ? .25 : 0),at=Math.min(cursor,safeEnd-.05);
    if(at<history.start)throw Error('Aguarde mais vídeo no histórico');
    let start=Math.max(history.start,Math.floor(at/PREVIEW_SECONDS)*PREVIEW_SECONDS);
    if(d.from!==undefined){const from=Number(d.from);if(!Number.isFinite(from)||from<history.start||from>at||at-from>.1)throw Error('Continuação fora do histórico');start=from;}
    const end=Math.min(start+PREVIEW_SECONDS,safeEnd);
    if(end-start<.2)throw Error('Ainda não há vídeo suficiente neste ponto');
    const selected=this.state.session.segmented?cam.segments.filter(p=>!p.deleted&&p.start<end&&p.start+p.duration>start):[{file:cam.file,start:0}];
    if(!selected.length)throw Error('Trecho expirado pela retenção');
    const parts=await Promise.all(selected.map(async p=>{const info=await lstat(p.file);if(!info.isFile()||info.isSymbolicLink())throw Error('Arquivo histórico irregular');return {file:p.file,start:p.start,size:info.size,mtimeMs:info.mtimeMs};}));
    if(this.previewRequests.get(viewer)!==sequence)throw Error('Prévia substituída por uma busca mais recente');
    this.preview.ffmpeg=this.ffmpeg;const historyPreview=await this.preview.prepare({sessionId:history.sessionId,cam:cam.name,start,end,cursor:at,parts,immutable:history.recording&&end<safeEnd-.5});
    return {...await this.status(),history,historyPreview};
  }
  previewFile(token){return this.preview.file(token);}
  dispose(){
    this.disposing=true;
    if(this.disposePromise)return this.disposePromise;
    // Both closures run even if one fails. The API's existing catch sees failure.
    const work=(async()=>{
      const outcomes=await Promise.allSettled([Promise.resolve().then(()=>this.preview.close()),this.retireCadence()]);
      const failure=outcomes.find(result=>result.status==='rejected');
      if(failure)throw failure.reason;
      this.disposed=true;
      return {disposed:true,cadenceQuiescent:true};
    })();
    this.disposePromise=work;
    work.finally(()=>{if(this.disposePromise===work)this.disposePromise=null;}).catch(()=>{});
    return work;
  }
  async pinHistory(d){
    if(d.clear===true){this.historyPin=null;return;}
    const history=await this.history(),start=Number(d.start),end=Number(d.end??Math.min(start+120,history?.end));
    if(!history||d.sessionId!==history.sessionId||!Number.isFinite(start)||!Number.isFinite(end)||start<history.start||end>history.end||end<start||end-start>120)throw Error('Marcas fora do histórico disponível');
    // An abandoned tab cannot keep the complete recording forever. UI renews while open.
    this.historyPin={sessionId:history.sessionId,start,end,expires:Date.now()+120000};
  }

  async captureRange(d) {
    const ranges=await this.positions(false),history=await this.history(ranges);
    if(!history||d.sessionId!==history.sessionId)throw Error('A sessão mudou. Atualize a timeline');
    const start=Number(d.start),end=Number(d.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<history.start||end>history.end||end-start<0.2||end-start>120)throw Error('Escolha IN e OUT dentro do histórico, com duração de 0,2 a 120 segundos');
    await this.makeEvent(ranges.map(r=>({...r,start,end})));
  }

  onProgramChanged(sceneName) {
    if(this.recordingFolder!=='replay'||sceneName===this.programScene)return;
    const previous=this.programScene;this.programScene=sceneName;
    if(this.internalProgramTarget===sceneName){this.internalProgramTarget=null;return;}
    return this.command('program-changed',{sceneName,previous});
  }

  async programChanged({sceneName,previous}) {
    const current=(await this.req('GetSceneList')).currentProgramSceneName;
    if(current!==sceneName)return;
    const player=/^REPLAY ([ABCD])$/.exec(sceneName)?.[1];
    if(!player||!this.state.players[player]){await this.applyPlayerAudio();return;}
    const input=`Replay Player ${player}`,settings=await this.req('GetInputSettings',{inputName:input});
    if(settings.inputSettings.local_file!==this.state.players[player].file)return;
    if(previous&&!/^REPLAY [ABCD]$/.test(previous))this.state.back=previous;
    if(this.state.linked&&/^REPLAY [ABCD]$/.test(previous||''))await this.align(true);
    else {
      await this.req('TriggerMediaInputAction',{inputName:input,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'});
      if(this.state.linked)await Promise.all(Object.keys(this.state.players).filter(id=>id!==player).map(id=>this.req('TriggerMediaInputAction',{inputName:`Replay Player ${id}`,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'})));
    }
    this.state.activePlayer=player;await this.applyPlayerAudio();await this.save();
  }

  async capture(seconds) {
    if (![5, 10, 20].includes(seconds)) throw new Error("Escolha um lance de 5, 10 ou 20 segundos");
    const positions = await this.positions();
    await this.makeEvent(positions.map((cam) => ({ ...cam, start: Math.max(cam.earliest || 0, cam.end - seconds) })));
  }

  async markIn() {
    this.state.markIn = { sessionId: this.state.session?.id, positions: await this.positions() };
    await this.save();
  }

  async markOut() {
    const mark = this.state.markIn;
    if (!mark || mark.sessionId !== this.state.session?.id) throw new Error("Marque IN antes de marcar OUT nesta sessão");
    const positions = await this.positions();
    await this.makeEvent(positions.map((cam) => ({ ...cam, start: mark.positions.find((p) => p.name === cam.name)?.end ?? cam.end })));
    this.state.markIn = null;
    await this.save();
  }

  async makeEvent(ranges) {
    if (ranges.some((r) => r.end - r.start < 0.2 || r.end - r.start > 120)) throw new Error("O lance deve ter entre 0,2 e 120 segundos");
    const id = randomUUID(), clips = [];
    const dir = join(this.state.session.dir, "lances", id);
    await mkdir(dir, { recursive: true });
    try {
      for (const [i, range] of ranges.entries()) {
        const file = join(dir, `cam-${i + 1}.mp4`);
        if(this.state.session.segmented){
          const parts=range.segments.filter(s=>!s.deleted&&s.start<range.end&&s.start+s.duration>range.start);
          if(!parts.length||range.start<parts[0].start-0.01)throw new Error("IN expirou pela retenção; marque um novo lance");
          const list=join(dir,`cam-${i+1}.ffconcat`);
          const quote=p=>p.replaceAll("\\","/").replaceAll("'","'\\''");
          await writeFile(list,'ffconcat version 1.0\n'+parts.map(s=>`file '${quote(s.file)}'\nduration ${s.duration}`).join('\n')+'\n');
          try {await execute(this.ffmpeg,["-hide_banner","-loglevel","error","-nostdin","-y","-f","concat","-safe","0","-i",list,"-vf",`trim=start=${Math.round((range.start-parts[0].start)*90000)/90000}:end=${Math.round((range.end-parts[0].start)*90000)/90000},setpts=PTS-STARTPTS`,"-af",`atrim=start=${Math.round((range.start-parts[0].start)*90000)/90000}:end=${Math.round((range.end-parts[0].start)*90000)/90000},asetpts=PTS-STARTPTS`,"-map","0:v:0","-map","0:a:0?","-c:v","libx264","-preset","ultrafast","-crf","18","-g","1","-bf","0","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",file]);}finally{await unlink(list).catch(()=>{});}
          const media=await this.probe(file);if(Math.abs(media.duration-(range.end-range.start))>0.15)throw new Error("Lance incompleto entre segmentos");
          clips.push({cam:range.name,file,start:range.start,end:range.end,duration:media.duration,frameRate:media.frameRate,variableFrameRate:media.variableFrameRate,audio:media.audio,segments:parts.map(s=>({file:s.file,start:s.start,duration:s.duration}))});continue;
        }
        // TS seeking can land AFTER the requested IN, particularly while the file is growing.
        // Seek three seconds earlier than IN, then decode/discard the remaining interval accurately.
        const coarse = Math.max(0, range.start - 3);
        // MPEG-TS video timestamps use a 90 kHz clock. Snap the limits to that clock
        // instead of letting rounded FFprobe microseconds select an adjacent frame.
        const sourceStart = Math.round((range.start + range.containerStart) * 90000) / 90000;
        const sourceEnd = Math.round((range.end + range.containerStart) * 90000) / 90000;
        await execute(this.ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-ss", String(coarse),
          "-copyts", "-i", range.file, "-vf", `trim=start=${sourceStart}:end=${sourceEnd},setpts=PTS-STARTPTS`,
          "-af", `atrim=start=${sourceStart}:end=${sourceEnd},asetpts=PTS-STARTPTS`, "-map", "0:v:0", "-map", "0:a:0?",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-g", "1", "-bf", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", file]);
        const media = await this.probe(file);
        if (media.videoStart > 0.07 || Math.abs(media.duration - (range.end - range.start)) > 0.15) throw new Error(`O vídeo do lance de ${range.name} ficou incompleto; aguarde e capture novamente`);
        clips.push({ cam: range.name, file, start: range.start, end: range.end, sourceStart, sourceEnd, duration: media.duration,frameRate:media.frameRate,variableFrameRate:media.variableFrameRate,audio:media.audio });
      }
    } catch (e) {
      // Remove only unfinished clips created by this operation. Continuous recordings are retained.
      for (let i = 0; i < ranges.length; i++) await unlink(join(dir, `cam-${i + 1}.mp4`)).catch(() => {});
      throw e;
    }
    const event = { id, name: `LANCE ${this.state.events.length + 1}`, cam: clips[0].cam, dur: clips[0].duration,
      time: new Date().toLocaleTimeString("pt-BR"), createdAt: Date.now(), clips };
    this.state.events.unshift(event);
    await this.save();
  }

  async load(player, eventId, camera) {
    if (!REPLAY_PLAYERS.includes(player)) throw new Error("Player deve ser A, B, C ou D");
    if (!(await this.req("GetStudioModeEnabled")).studioModeEnabled) throw new Error("Ative o modo Preview/Output para preparar replay fora do ar");
    const list = await this.req("GetSceneList");
    if (list.currentProgramSceneName === `REPLAY ${player}`) throw new Error(`O Player ${player} está no ar. Prepare o outro player.`);
    const event = eventId ? this.state.events.find((e) => e.id === eventId) : this.state.events[0];
    if (!event) throw new Error("Selecione um lance gravado antes de carregar o player");
    const clip = camera ? event.clips.find((c) => c.cam === camera) : event.clips[0];
    if (!clip) throw new Error("Este lance não contém a câmera selecionada");
    const clipInfo=await this.probe(clip.file,true);
    const scene = `REPLAY ${player}`, input = `Replay Player ${player}`;
    if (!list.scenes.some((s) => s.sceneName === scene)) await this.req("CreateScene", { sceneName: scene });
    const settings = { local_file: clip.file, is_local_file: true, looping: false, restart_on_activate: false,
      close_when_inactive: false, clear_on_media_end: false, speed_percent: this.state.speed,
      freemix_replay_unbuffered: true };
    const before = await this.optional("GetInputSettings", { inputName: input });
    let itemId;
    if (!before) {
      const created = await this.req("CreateInput", { sceneName: scene, inputName: input, inputKind: "ffmpeg_source", inputSettings: settings });
      itemId = created.sceneItemId;
    } else {
      if (before.inputKind !== "ffmpeg_source") throw new Error(`A fonte ${input} não é um player de vídeo`);
      await this.req('SetInputMute',{inputName:input,inputMuted:true});
      await this.req("SetInputSettings", { inputName: input, inputSettings: settings });
      const items = (await this.req("GetSceneItemList", { sceneName: scene })).sceneItems;
      itemId = items.find((i) => i.sourceName === input)?.sceneItemId;
      if (itemId === undefined) itemId = (await this.req("CreateSceneItem", { sceneName: scene, sourceName: input })).sceneItemId;
    }
    // Private replay players are silent while preparing; only the program angle may feed Master.
    await this.req('SetInputMute',{inputName:input,inputMuted:true});
    await this.req('SetInputAudioMonitorType',{inputName:input,monitorType:'OBS_MONITORING_TYPE_NONE'});
    await this.req('SetInputAudioTracks',{inputName:input,inputAudioTracks:{1:true,2:false,3:false,4:false,5:false,6:false}});
    const video = await this.req("GetVideoSettings");
    await this.req("SetSceneItemTransform", { sceneName: scene, sceneItemId: itemId, sceneItemTransform: {
      positionX: 0, positionY: 0, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: video.baseWidth, boundsHeight: video.baseHeight, boundsAlignment: 0 } });
    await this.req("SetCurrentPreviewScene", { sceneName: scene });
    await this.req("TriggerMediaInputAction", { inputName: input, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART" });
    // RESTART is queued on the decoder. The source can still report PLAYING
    // from its automatic open while that reset is pending; pausing too early
    // lets reset clear the pause underneath an apparently paused player.
    await sleep(150);
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const media = await this.req("GetMediaInputStatus", { inputName: input });
      if (media.mediaDuration > 0 && media.mediaState === "OBS_MEDIA_STATE_PLAYING" && media.mediaCursor < 500) { ready = true; break; }
      await sleep(100);
    }
    if (!ready) throw new Error("O motor não conseguiu reproduzir o vídeo do lance");
    await this.req("TriggerMediaInputAction", { inputName: input, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE" });
    await this.waitFor("GetMediaInputStatus", { inputName: input }, (s) => s.mediaState === "OBS_MEDIA_STATE_PAUSED");
    await this.req("SetMediaInputCursor", { inputName: input, mediaCursor: 0 });
    // Seeking a paused media source updates its displayed frame on the decoder/render threads.
    // Allow that frame to reach the Preview before acknowledging the load.
    await sleep(250);
    this.state.linked = false;
    this.state.players[player] = { eventId: event.id, cam: clip.cam, file: clip.file, duration: clipInfo.duration, frameRate:clipInfo.frameRate,variableFrameRate:clipInfo.variableFrameRate,cadence:clipInfo.cadence,cadenceChecked:true,audio:clipInfo.audio,hasVideo:clipInfo.hasVideo,metadataProbed:true,offsetFrames:replayCameraOptions(this.state.cameraOptions?.[clip.cam]).offsetFrames };
    this.state.activePlayer = player;
    await this.save();
  }

  async restorePreview(scene) {
    if (!scene) return false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await this.req("SetCurrentPreviewScene", { sceneName: scene }).catch(() => {});
      const list = await this.req("GetSceneList").catch(() => null);
      if (list?.currentPreviewSceneName === scene) return true;
      await sleep(80);
    }
    return false;
  }

  async air(player = this.state.activePlayer) {
    if (!REPLAY_PLAYERS.includes(player) || !this.state.players[player]) throw new Error("Carregue um lance no player antes de colocá-lo no ar");
    const list = await this.req("GetSceneList");
    if (!list.currentProgramSceneName?.startsWith("REPLAY ")) this.state.back = list.currentProgramSceneName;
    // Guarda o Preview do operador; SetCurrentProgramScene troca o Preview no Studio Mode.
    if (list.currentPreviewSceneName && !list.currentPreviewSceneName.startsWith("REPLAY ")) this.state.backPreview = list.currentPreviewSceneName;
    const input = `Replay Player ${player}`;
    const settings = await this.req("GetInputSettings", { inputName: input });
    if (settings.inputSettings.local_file !== this.state.players[player].file) throw new Error("O arquivo do player foi alterado. Carregue o lance novamente.");
    await this.probe(this.state.players[player].file);
    if(this.state.linked && list.currentProgramSceneName?.startsWith("REPLAY ")){
      await this.align(true);this.internalProgramTarget=`REPLAY ${player}`;await this.req("SetCurrentProgramScene",{sceneName:`REPLAY ${player}`});
      await this.waitFor("GetSceneList",{},s=>s.currentProgramSceneName===`REPLAY ${player}`);this.internalProgramTarget=null;this.state.activePlayer=player;await sleep(120);await this.restorePreview(this.state.backPreview);await this.applyPlayerAudio();await this.restorePreview(this.state.backPreview);await this.save();return;
    }
    this.internalProgramTarget=`REPLAY ${player}`;
    await this.req("SetCurrentProgramScene", { sceneName: `REPLAY ${player}` });
    await this.waitFor("GetSceneList", {}, (s) => s.currentProgramSceneName === `REPLAY ${player}`);
    this.internalProgramTarget=null;
    await sleep(120);
    await this.restorePreview(this.state.backPreview);
    // The source must be showing before its native RESTART actually starts the decoder.
    await this.req("TriggerMediaInputAction", { inputName: input, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART" });
    if(this.state.linked)await Promise.all(Object.keys(this.state.players).filter(id=>id!==player).map(id=>this.req("TriggerMediaInputAction",{inputName:`Replay Player ${id}`,mediaAction:"OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"})));
    await this.waitFor("GetMediaInputStatus", { inputName: input }, (s) => s.mediaState === "OBS_MEDIA_STATE_PLAYING" && s.mediaCursor < 250);
    this.state.activePlayer = player;
    await this.applyPlayerAudio();
    await this.restorePreview(this.state.backPreview);
    await this.save();
  }

  async live() {
    if (!this.state.back) throw new Error("Nenhuma entrada ao vivo anterior foi guardada");
    this.internalProgramTarget=this.state.back;
    await this.req("SetCurrentProgramScene", { sceneName: this.state.back });
    await this.waitFor("GetSceneList", {}, (s) => s.currentProgramSceneName === this.state.back);
    this.internalProgramTarget=null;
    await sleep(120);
    await this.restorePreview(this.state.backPreview);
    await this.applyPlayerAudio();
    await this.restorePreview(this.state.backPreview);
    await this.save();
  }

  async autoAlign(d={}) {
    if(this.recordingFolder!=='replay'||this.state.rec)throw Error('Pare REC antes de calibrar');
    const anchor=d.player||this.state.activePlayer,ids=Object.keys(this.state.players);if(ids.length<2||!this.state.players[anchor]||ids.some(id=>this.state.players[id].eventId!==this.state.players[anchor].eventId))throw Error('Carregue o mesmo lance em dois ou mais players');
    const program=(await this.req('GetSceneList')).currentProgramSceneName;if(ids.some(id=>program==='REPLAY '+id))throw Error('Volte ao vivo antes de calibrar o áudio');
    const pcm={};for(const id of ids){const file=this.state.players[id].file;await this.probe(file);const data=await execute(this.ffmpeg,['-hide_banner','-v','error','-nostdin','-i',file,'-t','10','-map','0:a:0','-ac','1','-ar','2000','-f','f32le','pipe:1'],20000,true);pcm[id]=new Float32Array(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));}
    const base=this.state.players[anchor],results={};for(const id of ids.filter(id=>id!==anchor)){const p=this.state.players[id],match=estimateAudioOffset(pcm[anchor],pcm[id]),rate=frameRate(p.frameRate);if(!base.frameRate||Math.abs(rate.fps-frameRate(base.frameRate).fps)>.001||p.variableFrameRate||base.variableFrameRate)throw Error('Calibração automática em quadros exige taxas constantes iguais');results[id]={...match,offsetFrames:(base.offsetFrames||0)+Math.round(match.offsetMs/rate.frameMs)};if(Math.abs(results[id].offsetFrames)>3600)throw Error('Offset automático fora do limite');}
    for(const id of ids)if(['__proto__','prototype','constructor'].includes(this.state.players[id].cam))throw Error('Nome de câmera reservado para calibração');
    const previous=structuredClone({players:this.state.players,cameraOptions:this.state.cameraOptions,calibration:this.state.calibration,linked:this.state.linked,activePlayer:this.state.activePlayer});
    try{for(const[id,value]of Object.entries(results)){const p=this.state.players[id];this.state.cameraOptions[p.cam]={...replayCameraOptions(this.state.cameraOptions[p.cam]),offsetFrames:value.offsetFrames};p.offsetFrames=value.offsetFrames;}
    this.state.calibration={at:Date.now(),anchor,results,method:'decoded-common-audio',hardwareGenlock:false};this.state.linked=true;this.state.activePlayer=anchor;await this.align(true);await this.save();}catch(error){Object.assign(this.state,previous);throw error;}
  }

  async repairClip(d) {
    if(this.recordingFolder!=='replay'||this.state.rec)throw Error('Pare REC antes de recuperar arquivo');
    if(typeof d.file!=='string'||d.file.length>1000||!/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(d.file)||/[\x00-\x1f]/.test(d.file))throw Error('Informe um arquivo local absoluto');
    const original=resolve(d.file),input=await lstat(original);if(!input.isFile()||input.isSymbolicLink()||input.size>8*1024**3)throw Error('Arquivo irregular ou maior que 8 GB');
    const id=randomUUID(),dir=join(this.root,'gravacoes/replay/recuperados',id);await mkdir(dir,{recursive:true});const file=join(dir,'clip.mkv');
    try{await execute(this.ffmpeg,['-hide_banner','-v','warning','-nostdin','-y','-fflags','+discardcorrupt+genpts','-err_detect','ignore_err','-i',original,'-t','120','-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-crf','18','-g','1','-bf','0','-pix_fmt','yuv420p','-c:a','aac',file],180000);const media=await this.probe(file);await execute(this.ffmpeg,['-hide_banner','-v','error','-xerror','-nostdin','-i',file,'-f','null','-'],180000);this.state.events.push({id,name:String(d.name||'Clipe recuperado').slice(0,120),cam:'Recuperado',dur:media.duration,createdAt:Date.now(),time:new Date().toLocaleTimeString('pt-BR'),recovered:true,repair:{originalPreserved:true,maxSeconds:120,decodedVerified:true,lossPossible:true},clips:[{cam:'Recuperado',file,start:0,end:media.duration,duration:media.duration}]});await this.save();}catch(error){await unlink(file).catch(()=>{});throw Error('Recuperação recusada: '+error.message);}
  }

  localFile(value,label){
    if(typeof value!=='string'||!value.trim()||value.length>1000||!/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value.trim())||/[\x00-\x1f]/.test(value))throw Error(label+': informe um caminho local absoluto');
    return resolve(value.trim());
  }

  // Repoint one saved angle (or the angle loaded in a player) to the file on
  // its new drive. The media is probed before the reference is accepted.
  async relocateClip(d) {
    const player=d.player?String(d.player):null;
    if(player&&!REPLAY_PLAYERS.includes(player))throw Error('Player inválido');
    let event=d.eventId?this.state.events.find(e=>e.id===d.eventId):null;
    if(!event&&player){const loaded=this.state.players[player];event=loaded?this.state.events.find(e=>e.id===loaded.eventId):null;}
    if(!event)throw Error('Selecione o lance que contém o arquivo ausente');
    const cam=d.cam||(player?this.state.players[player]?.cam:null)||event.cam;
    const clip=event.clips.find(c=>c.cam===cam)||(event.clips.length===1?event.clips[0]:null);
    if(!clip)throw Error('O ângulo '+cam+' não pertence a este lance');
    const file=this.localFile(d.file,'Localizar arquivo');
    const info=await lstat(file).catch(()=>null);
    if(!info?.isFile()||info.isSymbolicLink()||info.size>20*1024**3)throw Error('Localizar arquivo: informe um vídeo local existente de até 20 GB');
    const media=await this.probe(file);
    clip.file=file;clip.duration=media.duration;
    if(!Number.isFinite(Number(clip.start)))clip.start=0;
    if(!Number.isFinite(Number(clip.end)))clip.end=Number(clip.start)+media.duration;
    event.dur=Number(event.clips[0].duration||media.duration);
    // The player source is only repointed after a successful load; this keeps
    // the UI honest if the engine cannot reopen the located file.
    this.fileAvailability?.clear();
    this.state.lastRelocate={at:Date.now(),eventId:event.id,cam:clip.cam,file};
    await this.save();
  }

  // The recorder folder may return under another drive letter. Find the
  // missing basenames inside the folder the operator selects and repair every
  // exact match; ambiguous duplicates are left untouched.
  async relinkFolder(d) {
    if(this.recordingFolder!=='replay')throw Error('Religar pasta é exclusivo do Replay');
    if(this.state.rec)throw Error('Pare a gravação SSD antes de religar a pasta de gravações');
    const folder=this.localFile(d.folder,'Religar pasta de gravações');
    const info=await lstat(folder).catch(()=>null);
    if(!info?.isDirectory()||info.isSymbolicLink())throw Error('Religar pasta: selecione uma pasta existente neste computador');
    const refs=[];
    const add=(owner,key)=>{if(owner&&typeof owner[key]==='string'&&owner[key])refs.push({owner,key});};
    if(this.state.session)for(const cam of this.state.session.cams){add(cam,'file');for(const segment of cam.segments||[])add(segment,'file');}
    for(const player of Object.values(this.state.players))add(player,'file');
    for(const event of this.state.events)for(const clip of event.clips||[])add(clip,'file');
    const missing=refs.filter(ref=>!existsSync(ref.owner[ref.key]));
    if(!missing.length){
      this.state.lastRelink={at:Date.now(),folder,relinked:0,unresolved:0,ambiguous:[],scanned:0};
      await this.save();
      return;
    }
    let relinked=0;
    const remaining=[];
    // Preserve the tail of the original path first. Event clips share names
    // such as cam-1.mp4, so a basename-only scan would be ambiguous.
    for(const ref of missing){
      const parts=String(ref.owner[ref.key]).split(/[\\/]+/).filter(Boolean);
      let hit=null;
      for(let count=Math.min(8,parts.length);count>=1;count--){
        const candidate=join(folder,...parts.slice(-count));
        try{const info=await lstat(candidate);if(info.isFile()&&!info.isSymbolicLink()){hit=candidate;break;}}catch{}
      }
      if(hit){ref.owner[ref.key]=hit;relinked++;}
      else remaining.push(ref);
    }
    const names=new Set(remaining.map(ref=>basename(ref.owner[ref.key])));
    const found=new Map();
    let scanned=0;
    const walk=async(dir,depth)=>{
      if(depth>8||scanned>20000)return;
      let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch{return;}
      for(const entry of entries){
        if(scanned++>20000)return;
        if(entry.isSymbolicLink())continue;
        const full=join(dir,entry.name);
        if(entry.isDirectory()){await walk(full,depth+1);continue;}
        if(!entry.isFile()||!names.has(entry.name))continue;
        const list=found.get(entry.name)||[];
        if(list.length<5)list.push(full);
        found.set(entry.name,list);
      }
    };
    if(remaining.length)await walk(folder,0);
    const ambiguous=[];
    for(const ref of remaining){
      const name=basename(ref.owner[ref.key]),list=found.get(name)||[];
      if(list.length===1){ref.owner[ref.key]=list[0];relinked++;}
      else if(list.length>1)ambiguous.push({name,count:list.length});
    }
    this.fileAvailability?.clear();
    const reload={reloaded:0,failed:0,onAir:[]};
    if(this.recordingFolder==='replay'){
      const program=(await this.optional('GetSceneList',{}))?.currentProgramSceneName||'';
      for(const [id,player] of Object.entries(this.state.players)){
        if(program==='REPLAY '+id){reload.onAir.push(id);continue;}
        const settings=await this.optional('GetInputSettings',{inputName:'Replay Player '+id});
        if(settings?.inputSettings?.local_file===player.file)continue;
        try{await this.load(id,player.eventId,player.cam);reload.reloaded++;}
        catch{reload.failed++;}
      }
    }
    this.state.lastRelink={at:Date.now(),folder,relinked,unresolved:missing.length-relinked,ambiguous:ambiguous.slice(0,12),scanned,reload};
    await this.save();
  }

  async createTag(d) {
    const name = String(d.name || '').trim().slice(0, 40);
    if (!name) throw Error('Informe o nome da etiqueta');
    const color = String(d.color || '#3b82f6').slice(0, 16);
    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    this.state.tagsLibrary = this.state.tagsLibrary || defaultTags();
    if (!this.state.tagsLibrary.some(t => t.id === id)) {
      this.state.tagsLibrary.push({ id, name, color });
      await this.save();
    }
  }

  async removeTag(d) {
    const id = String(d.id || '').trim().toLowerCase();
    this.state.tagsLibrary = (this.state.tagsLibrary || defaultTags()).filter(t => t.id !== id);
    for (const e of this.state.events) {
      if (Array.isArray(e.tags)) e.tags = e.tags.filter(t => t.toLowerCase() !== id);
    }
    await this.save();
  }

  async updateEvent(d) {
    const event=this.state.events.find(e=>e.id===d.eventId);
    if(!event)throw Error('Lance não encontrado');
    if(d.name!==undefined){
      const name=String(d.name).trim();
      if(!name||name.length>120||/[\x00-\x1f]/.test(name))throw Error('Título deve ter de 1 a 120 caracteres sem controles');
      event.name=name;
    }
    if(d.category!==undefined){
      const category=String(d.category).trim();
      if(category.length>60||/[\x00-\x1f]/.test(category))throw Error('Categoria deve ter até 60 caracteres sem controles');
      event.category=category;
    }
    if(d.tags!==undefined){
      if(!Array.isArray(d.tags))throw Error('Tags deve ser uma lista');
      event.tags = d.tags.map(t => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 15);
    }
    if(d.folder!==undefined){
      const folder=String(d.folder).trim();
      if(folder.length>60||/[\x00-\x1f]/.test(folder))throw Error('Pasta/Lista deve ter até 60 caracteres');
      event.folder=folder;
    }
    if(d.notesByCam!==undefined && typeof d.notesByCam === 'object' && d.notesByCam !== null){
      event.notesByCam = event.notesByCam || {};
      for(const [cam, note] of Object.entries(d.notesByCam)){
        if(cam && typeof note === 'string') event.notesByCam[cam.slice(0, 40)] = note.trim().slice(0, 140);
      }
    }
    if(d.preRollSeconds!==undefined){
      const pre = Number(d.preRollSeconds);
      if(Number.isFinite(pre) && pre >= 0 && pre <= 30) event.preRollSeconds = pre;
    }
    if(d.postRollSeconds!==undefined){
      const post = Number(d.postRollSeconds);
      if(Number.isFinite(post) && post >= 0 && post <= 30) event.postRollSeconds = post;
    }
    await this.save();
  }

  // Real IN/OUT edit of a saved event: every angle is re-encoded between the
  // requested offsets, then the references are replaced only after all angles
  // pass a finite-duration probe.
  async trimEvent(d) {
    if(this.recordingFolder!=='replay')throw Error('Ajuste de IN/OUT é exclusivo do Replay');
    if(this.state.rec)throw Error('Pare a gravação SSD antes de ajustar IN/OUT de um lance');
    const event=this.state.events.find(e=>e.id===d.eventId);
    if(!event)throw Error('Lance não encontrado');
    const duration=Number(event.dur),start=Number(d.in),end=Number(d.out);
    if(!Number.isFinite(duration)||!Number.isFinite(start)||!Number.isFinite(end))throw Error('Informe IN e OUT em segundos');
    if(start<0||end>duration+0.05||end-start<0.2||end-start>120)throw Error('IN/OUT deve ficar dentro do lance e durar de 0,2 a 120 segundos');
    if(start<0.001&&Math.abs(end-duration)<0.001)return;
    const loaded=Object.entries(this.state.players).find(([,player])=>player.eventId===event.id);
    if(loaded)throw Error(`Remova o lance do Player ${loaded[0]} antes de ajustar IN/OUT`);
    const program=(await this.req('GetSceneList')).currentProgramSceneName;
    if(Object.entries(this.state.players).some(([id,player])=>player.eventId===event.id&&program==='REPLAY '+id))throw Error('Volte ao vivo antes de ajustar este lance');
    const jobs=[];
    const temps=[];
    try{
      for(const clip of event.clips){
        const temp=clip.file+'.trim.mp4';
        temps.push(temp);
        await execute(this.ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-y','-i',clip.file,
          '-vf',`trim=start=${start}:end=${end},setpts=PTS-STARTPTS`,'-af',`atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`,
          '-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','ultrafast','-crf','18','-g','1','-bf','0','-pix_fmt','yuv420p',
          '-c:a','aac','-movflags','+faststart',temp],180000);
        const media=await this.probe(temp);
        if(Math.abs(media.duration-(end-start))>0.2)throw Error('O novo corte de '+clip.cam+' ficou incompleto');
        jobs.push({clip,temp,media,backup:clip.file+'.trim.bak'});
      }
    }catch(error){
      for(const temp of temps)await unlink(temp).catch(()=>{});
      throw error;
    }
    const replaced=[];
    try{
      for(const job of jobs){
        await unlink(job.backup).catch(()=>{});
        await rename(job.clip.file,job.backup);
        try{
          await rename(job.temp,job.clip.file);
        }catch(error){
          await rename(job.backup,job.clip.file).catch(()=>{});
          throw error;
        }
        replaced.push(job);
        job.clip.start=Number(job.clip.start||0)+start;
        job.clip.end=Number(job.clip.end||duration)-(duration-end);
        job.clip.duration=job.media.duration;
        job.clip.trimmed=true;
      }
    }catch(error){
      for(const job of replaced.reverse()){
        await unlink(job.clip.file).catch(()=>{});
        await rename(job.backup,job.clip.file).catch(()=>{});
      }
      for(const job of jobs)await unlink(job.temp).catch(()=>{});
      throw Error('Ajuste recusado e revertido: '+error.message);
    }
    for(const job of jobs)await unlink(job.backup).catch(()=>{});
    event.dur=Number(event.clips[0]?.duration||end-start);
    event.editedAt=Date.now();
    this.fileAvailability?.clear();
    await this.save();
  }

  async unloadPlayer(player) {
    if(!REPLAY_PLAYERS.includes(player))throw Error('Player inválido');
    if(!this.state.players[player])return;
    const list=await this.req('GetSceneList');
    if(list.currentProgramSceneName===`REPLAY ${player}`)throw Error(`Volte ao vivo antes de remover o Player ${player}`);
    await this.optional('TriggerMediaInputAction',{inputName:`Replay Player ${player}`,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP'});
    delete this.state.players[player];
    this.fileAvailability?.clear();
    await this.save();
  }

  async link(enabled) {
    if(typeof enabled!=='boolean')throw new Error("Informe enabled verdadeiro ou falso");
    if(enabled){const loaded=Object.values(this.state.players);if(loaded.length<2||loaded.some(p=>p.eventId!==loaded[0].eventId))throw new Error("Carregue pelo menos dois ângulos do mesmo lance");await this.align(true);}
    this.state.linked=enabled;await this.save();
  }

  async align(force) {
    await this.hydratePlayers();
    const anchor=this.state.activePlayer||'A',ids=Object.keys(this.state.players),followers=ids.filter(id=>id!==anchor);
    if(!followers.length)return;
    const sample=async()=>Object.fromEntries(await Promise.all(ids.map(async id=>[id,await this.req('GetMediaInputStatus',{inputName:'Replay Player '+id})])));
    let statuses=await sample(),a=statuses[anchor];
    if(!['OBS_MEDIA_STATE_PAUSED','OBS_MEDIA_STATE_PLAYING'].includes(a.mediaState)){this.state.sync=null;this.alignmentUnsettled=false;return;}
    let plan=seekTargets(this.state.players,anchor,a.mediaCursor);
    const paused=a.mediaState==='OBS_MEDIA_STATE_PAUSED',tolerance=plan.mode==='frame'?plan.rate.frameMs:plan.toleranceMs;
    // Native cursors are integer milliseconds; adjacent 30 fps frames can
    // differ by 34 ms. Use the same rational frame IDs as frameTargets.
    const distance=(target,status,p)=>p.mode==='frame'?Math.abs(target.frame-Math.round(status.mediaCursor/p.rate.frameMs)):Math.abs(target.cursor-status.mediaCursor);
    const limit=plan.mode==='frame'?1:tolerance;
    const needed=force&&paused||followers.some(id=>statuses[id].mediaState!==a.mediaState||distance(plan.targets[id],statuses[id],plan)>limit);
    let corrections=0,correctionMs=0,pauseMs=0;
    if(needed){
      // Independent playing seeks have independent wall-clock origins. Hold
      // all private players once, select the same calibrated frame/time, then
      // resume together. Ordinary polling inside deadband never pauses/seeks.
      const started=Date.now();
      await Promise.all(ids.map(id=>this.req('TriggerMediaInputAction',{inputName:'Replay Player '+id,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE'})));
      await Promise.all(ids.map(id=>this.waitFor('GetMediaInputStatus',{inputName:'Replay Player '+id},m=>m.mediaState==='OBS_MEDIA_STATE_PAUSED')));
      statuses=await sample();plan=seekTargets(this.state.players,anchor,statuses[anchor].mediaCursor);
      await Promise.all(ids.map(async id=>{
        const target=plan.targets[id].cursor;
        await this.req('SetMediaInputCursor',{inputName:'Replay Player '+id,mediaCursor:target});
        await this.waitFor('GetMediaInputStatus',{inputName:'Replay Player '+id},m=>m.mediaState==='OBS_MEDIA_STATE_PAUSED'&&Math.abs(m.mediaCursor-target)<=plan.toleranceMs);
        corrections++;
      }));
      if(!paused){
        await Promise.all(ids.map(id=>this.req('TriggerMediaInputAction',{inputName:'Replay Player '+id,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY'})));
        pauseMs=Date.now()-started;
        await sleep(Math.min(250,Math.max(75,plan.mode==='frame'?2*plan.rate.frameMs*100/(this.state.speed||100):100)));
      }
      statuses=await sample();correctionMs=Date.now()-started;
    }
    const expected=seekTargets(this.state.players,anchor,statuses[anchor].mediaCursor);
    const differences=Object.fromEntries(followers.map(id=>[id,Math.abs(expected.targets[id].cursor-statuses[id].mediaCursor)]));
    const differenceMs=Math.max(...Object.values(differences));
    const frameDifferences=plan.mode==='frame'?Object.fromEntries(followers.map(id=>[id,distance(expected.targets[id],statuses[id],expected)])):null;
    const differenceFrames=frameDifferences?Math.max(...Object.values(frameDifferences)):null;
    const confirmed=(plan.mode==='frame'?differenceFrames<=1:differenceMs<=tolerance)&&followers.every(id=>statuses[id].mediaState===a.mediaState);
    this.alignmentUnsettled=!confirmed;
    this.state.sync={anchor,differenceMs,differences,differenceFrames,frameDifferences,cursorGranularityMs:1,toleranceMs:tolerance,confirmed,corrections,coordinated:needed,correctionMs,pauseMs,correctionPending:!confirmed,frameRate:this.state.players[anchor].frameRate,paused,mode:plan.mode,evidence:'native-cursor',calibration:this.state.calibration?'decoded-common-audio':'manual-offsets',hardwareGenlock:false};
  }
  async transport(d) {
    const player=d.player||this.state.activePlayer;if(!REPLAY_PLAYERS.includes(player)||!this.state.players[player])throw new Error("Carregue um player");
    const players=this.state.linked?Object.keys(this.state.players):[player];
    if(d.command==='seek'){
      await this.seekPlayer({player,cursor:Number(d.position)});
    }else{if(!['PLAY','PAUSE','STOP'].includes(d.command))throw new Error("Transporte inválido");if(d.command==='PLAY')await Promise.all(players.map(p=>this.ensureSeekable(p)));await Promise.all(players.map(p=>this.req('TriggerMediaInputAction',{inputName:`Replay Player ${p}`,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_'+d.command})));}
    await sleep(120);await this.save();
  }

  async seekPlayer(d) {
    await this.hydratePlayers();
    const player=d.player||this.state.activePlayer,cursor=Number(d.cursor);if(!REPLAY_PLAYERS.includes(player)||!this.state.players[player]||!Number.isFinite(cursor)||cursor<0)throw Error('Player ou cursor inválido');
    if(cursor>this.state.players[player].duration*1000)throw Error('Cursor fora do clipe');
    const media=await this.ensureSeekable(player);if(!media.mediaDuration||cursor>media.mediaDuration)throw Error('Cursor fora do clipe');
    const selected=this.state.linked?this.state.players:{[player]:this.state.players[player]};
    const plan=seekTargets(selected,player,cursor);
    await Promise.all(Object.entries(plan.targets).map(async([p,target])=>{const before=await this.ensureSeekable(p);await this.req('SetMediaInputCursor',{inputName:`Replay Player ${p}`,mediaCursor:target.cursor});if(before.mediaState==='OBS_MEDIA_STATE_PAUSED')await this.waitFor('GetMediaInputStatus',{inputName:`Replay Player ${p}`},m=>Math.abs(m.mediaCursor-target.cursor)<=plan.toleranceMs);}));
    this.state.activePlayer=player;await this.save();
  }

  async ensureSeekable(player) {
    const inputName=`Replay Player ${player}`,before=await this.req('GetMediaInputStatus',{inputName});
    if(before.mediaDuration>0&&['OBS_MEDIA_STATE_PLAYING','OBS_MEDIA_STATE_PAUSED'].includes(before.mediaState))return before;
    if(!['OBS_MEDIA_STATE_ENDED','OBS_MEDIA_STATE_STOPPED','OBS_MEDIA_STATE_NONE'].includes(before.mediaState))throw Error('O player não está pronto para buscar');
    // OBS WebSocket reports null duration/cursor after EOF. Reopen the private
    // player and hold it paused before selecting the requested frame; do not
    // confuse a successful seek request with a decoder which is still ended.
    await this.req('TriggerMediaInputAction',{inputName,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'});
    await sleep(150);
    await this.waitFor('GetMediaInputStatus',{inputName},m=>m.mediaDuration>0&&m.mediaState==='OBS_MEDIA_STATE_PLAYING'&&m.mediaCursor<500);
    await this.req('TriggerMediaInputAction',{inputName,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE'});
    return this.waitFor('GetMediaInputStatus',{inputName},m=>m.mediaState==='OBS_MEDIA_STATE_PAUSED');
  }

  async configureCamera(d) {
    if(this.recordingFolder!=='replay'||typeof d.cam!=='string'||!d.cam||d.cam.length>200||['__proto__','prototype','constructor'].includes(d.cam))throw Error('Câmera inválida');
    const options=replayCameraOptions(d.options),prior=replayCameraOptions(this.state.cameraOptions?.[d.cam]);
    if(this.state.rec&&options.recordAudio!==prior.recordAudio)throw Error('Pare REC para alterar o áudio gravado');
    this.state.cameraOptions??={};this.state.cameraOptions[d.cam]=options;
    for(const p of Object.values(this.state.players))if(p.cam===d.cam)p.offsetFrames=options.offsetFrames;
    if(this.state.linked){try{await this.align(true);}catch(error){this.state.linked=false;await this.save();throw error;}}
    await this.applyPlayerAudio();await this.save();
  }

  async applyPlayerAudio() {
    const program=(await this.req('GetSceneList')).currentProgramSceneName;
    const desired=REPLAY_PLAYERS.find(id=>program==='REPLAY '+id)||null;
    const valid=[];for(const [p,player]of Object.entries(this.state.players)){
      if(!player.file){valid.push(p);continue;}
      const actual=await this.optional('GetInputSettings',{inputName:`Replay Player ${p}`});
      if(actual?.inputKind==='ffmpeg_source'&&actual.inputSettings?.local_file===player.file){valid.push(p);delete player.audioUnavailable;}else {
        player.audioUnavailable='Carregue novamente: fonte ausente ou arquivo alterado';
        // A replaced file must not keep the previously enabled camera audible.
        // Only touch the reserved media player kind; an unrelated replacement
        // source is not owned by this controller.
        if(actual?.inputKind==='ffmpeg_source')await this.req('SetInputMute',{inputName:`Replay Player ${p}`,inputMuted:true});
        player.audioMuted=true;
      }
    }
    // Mute undesired sources first, so an A/B switch never mixes both camera tracks.
    for(const p of valid){
      const settings=replayCameraOptions(this.state.cameraOptions?.[this.state.players[p].cam]);
      const muted=!this.state.audioEnabled||p!==desired||settings.muted||this.state.players[p].audio===false;
      if(muted)await this.req('SetInputMute',{inputName:`Replay Player ${p}`,inputMuted:true});
    }
    for(const p of valid){
      const settings=replayCameraOptions(this.state.cameraOptions?.[this.state.players[p].cam]);
      await this.req('SetInputVolume',{inputName:`Replay Player ${p}`,inputVolumeDb:settings.gainDb});
      const muted=!this.state.audioEnabled||p!==desired||settings.muted||this.state.players[p].audio===false;
      if(!muted)await this.req('SetInputMute',{inputName:`Replay Player ${p}`,inputMuted:false});
      this.state.players[p].audioMuted=muted;this.state.players[p].gainDb=settings.gainDb;
    }
  }

  async stepFrame(d) {
    await this.hydratePlayers();
    if(this.recordingFolder!=='replay')throw Error('Passo disponível no Replay');
    const player=d.player||this.state.activePlayer,delta=Number(d.delta);
    if(!REPLAY_PLAYERS.includes(player)||!this.state.players[player])throw Error('Carregue um player');
    const media=await this.req('GetMediaInputStatus',{inputName:`Replay Player ${player}`});
    const cursor=media.mediaCursor??(media.mediaState==='OBS_MEDIA_STATE_ENDED'?this.state.players[player].duration*1000-1:0);
    const selected=this.state.linked?this.state.players:{[player]:this.state.players[player]},plan=frameTargets(selected,player,cursor,delta);
    for(const p of Object.keys(selected)){await this.ensureSeekable(p);await this.req('TriggerMediaInputAction',{inputName:`Replay Player ${p}`,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE'});await this.waitFor('GetMediaInputStatus',{inputName:`Replay Player ${p}`},m=>m.mediaState==='OBS_MEDIA_STATE_PAUSED');}
    for(const [p,target]of Object.entries(plan.targets)){await this.req('SetMediaInputCursor',{inputName:`Replay Player ${p}`,mediaCursor:target.cursor});await this.waitFor('GetMediaInputStatus',{inputName:`Replay Player ${p}`},m=>Math.abs(m.mediaCursor-target.cursor)<=Math.max(2,plan.rate.frameMs/2));}
    this.state.activePlayer=player;this.state.frame={player,globalFrame:plan.globalFrame,targets:plan.targets,frameRate:this.state.players[player].frameRate,evidence:'native-cursor'};
    await sleep(100);await this.save();
  }

  async hydratePlayers(){
    this.assertReplayOpen();
    for(const p of Object.values(this.state.players))if(!p.metadataProbed||!p.cadenceChecked||p.cadence?.method!=='finite-full-decoded-pts'||!(await this.cadenceScanner().matches(p.file,p.cadence?.identity))){const media=await this.probe(p.file,true);Object.assign(p,{metadataProbed:true,cadenceChecked:true,cadence:media.cadence,hasVideo:media.hasVideo,duration:media.duration,frameRate:media.frameRate,variableFrameRate:media.variableFrameRate,audio:media.audio,offsetFrames:replayCameraOptions(this.state.cameraOptions?.[p.cam]).offsetFrames});}
  }

  async speed(value) {
    if (!Number.isFinite(value) || value < 10 || value > 100) throw new Error("A velocidade deve estar entre 10% e 100%");
    for (const player of Object.keys(this.state.players)) {
      const inputName = `Replay Player ${player}`;
      const before = await this.req("GetMediaInputStatus", { inputName });
      const settings=await this.req("GetInputSettings",{inputName});if(Number(settings.inputSettings.speed_percent||100)===value)continue;
      await this.req("SetInputSettings", { inputName, inputSettings: { speed_percent: value } });
      // ffmpeg_source reopens the decoder when speed changes. Restore the actual clip position and pause state.
      await sleep(200);
      const reopened = await this.waitFor("GetMediaInputStatus", { inputName }, (s) => s.mediaDuration > 0);
      const paused = before.mediaState !== "OBS_MEDIA_STATE_PLAYING";
      if (paused) {
        await this.req("TriggerMediaInputAction", { inputName, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE" });
        await this.waitFor("GetMediaInputStatus", { inputName }, (s) => s.mediaState === "OBS_MEDIA_STATE_PAUSED");
      }
      // EOF has null duration/cursor in OBS. Preserve its last valid frame,
      // paused, instead of serializing null as an invalid native seek request.
      const cursor = Number.isFinite(before.mediaCursor) ? before.mediaCursor : before.mediaState === 'OBS_MEDIA_STATE_ENDED' ? Math.max(0,reopened.mediaDuration-1) : 0;
      const target = Math.max(0,Math.min(cursor,reopened.mediaDuration-1));
      await this.req("SetMediaInputCursor", { inputName, mediaCursor: target });
      if(paused)await this.waitFor("GetMediaInputStatus",{inputName},m=>Number.isFinite(m.mediaCursor)&&Math.abs(m.mediaCursor-target)<100);
    }
    this.state.speed = value;
    await this.save();
  }

  async swap() {
    const list = await this.req("GetSceneList");
    const program = list.currentProgramSceneName;
    if (program === "REPLAY A") {
      if (!this.state.players["B"]) throw Error("Player B não está carregado para swap");
      await this.air("B");
    } else if (program === "REPLAY B") {
      if (!this.state.players["A"]) throw Error("Player A não está carregado para swap");
      await this.air("A");
    } else {
      this.state.activePlayer = this.state.activePlayer === "A" ? "B" : "A";
      const targetScene = `REPLAY ${this.state.activePlayer}`;
      if (this.state.players[this.state.activePlayer] && list.scenes.some(s => s.sceneName === targetScene)) {
        await this.req("SetCurrentPreviewScene", { sceneName: targetScene }).catch(() => {});
      }
      await this.save();
    }
  }

  async jump(d = {}) {
    await this.hydratePlayers();
    const player = d.player || this.state.activePlayer;
    if (!REPLAY_PLAYERS.includes(player) || !this.state.players[player]) throw Error("Player inválido");
    const media = await this.req("GetMediaInputStatus", { inputName: `Replay Player ${player}` });
    const currentMs = Number.isFinite(media.mediaCursor) ? media.mediaCursor : 0;
    let deltaMs = Number(d.seconds || 0) * 1000;
    if (d.frames) {
      const rate = frameRate(this.state.players[player].frameRate);
      deltaMs += Number(d.frames) * rate.frameMs;
    }
    const maxMs = (this.state.players[player].duration || 0) * 1000;
    const targetMs = Math.max(0, Math.min(maxMs, currentMs + deltaMs));
    await this.seekPlayer({ player, cursor: targetMs });
  }

  async jumpToNow(d = {}) {
    const player = d.player || this.state.activePlayer;
    if (!REPLAY_PLAYERS.includes(player) || !this.state.players[player]) throw Error("Player inválido");
    const durationMs = (this.state.players[player].duration || 0) * 1000;
    if (durationMs > 0) {
      await this.seekPlayer({ player, cursor: Math.max(0, durationMs - 150) });
    }
  }

  async playEvent(d = {}) {
    const player = d.player || this.state.activePlayer;
    let event = null;
    if (d.eventId) {
      event = this.state.events.find(e => e.id === d.eventId);
    } else if (d.index !== undefined) {
      const idx = Number(d.index);
      event = this.state.events[idx >= 0 ? idx : 0];
    } else if (this.state.selectedEventId) {
      event = this.state.events.find(e => e.id === this.state.selectedEventId);
    } else {
      event = this.state.events[0];
    }
    if (!event) throw Error("Lance não encontrado");
    this.state.selectedEventId = event.id;
    await this.load(player, event.id, d.cam);
    if (d.toOutput === true) {
      await this.air(player);
    }
  }

  async selectEvent(d = {}) {
    if (!this.state.events.length) throw Error("Nenhum lance gravado");
    let currentIdx = this.state.selectedEventId ? this.state.events.findIndex(e => e.id === this.state.selectedEventId) : 0;
    if (currentIdx < 0) currentIdx = 0;
    let targetIdx = currentIdx;
    if (d.offset === "next") targetIdx = Math.min(this.state.events.length - 1, currentIdx + 1);
    else if (d.offset === "prev") targetIdx = Math.max(0, currentIdx - 1);
    else if (d.offset === "first") targetIdx = 0;
    else if (d.offset === "last") targetIdx = this.state.events.length - 1;
    else if (d.index !== undefined) targetIdx = Math.max(0, Math.min(this.state.events.length - 1, Number(d.index)));
    else if (d.eventId) {
      const found = this.state.events.findIndex(e => e.id === d.eventId);
      if (found >= 0) targetIdx = found;
    }
    const event = this.state.events[targetIdx];
    this.state.selectedEventId = event.id;
    if (d.load === true) {
      const player = d.player || this.state.activePlayer;
      await this.load(player, event.id, d.cam);
    }
    await this.save();
    return event;
  }

  async selectCamera(d = {}) {
    const player = d.player || this.state.activePlayer;
    if (!REPLAY_PLAYERS.includes(player) || !this.state.players[player]) throw Error("Player inválido");
    const current = this.state.players[player];
    const event = this.state.events.find(e => e.id === current.eventId);
    if (!event) throw Error("Nenhum evento ativo neste player");
    let targetCam = d.cam;
    if (d.camIndex !== undefined) {
      const idx = Number(d.camIndex) - 1;
      if (idx >= 0 && idx < event.clips.length) {
        targetCam = event.clips[idx].cam;
      }
    }
    if (!targetCam || !event.clips.some(c => c.cam === targetCam)) {
      throw Error("Câmera selecionada não existe no lance");
    }
    const status = await this.req("GetMediaInputStatus", { inputName: `Replay Player ${player}` }).catch(() => ({}));
    const cursor = Number.isFinite(status?.mediaCursor) ? status.mediaCursor : 0;
    await this.load(player, event.id, targetCam);
    await this.seekPlayer({ player, cursor });
  }

  async playPause(d = {}) {
    const player = d.player || this.state.activePlayer;
    if (!REPLAY_PLAYERS.includes(player) || !this.state.players[player]) throw Error("Player inválido");
    const media = await this.req("GetMediaInputStatus", { inputName: `Replay Player ${player}` });
    const isPlaying = media.mediaState === "OBS_MEDIA_STATE_PLAYING";
    await this.transport({ player, command: isPlaying ? "PAUSE" : "PLAY" });
  }

  async markInOut(d = {}) {
    const seconds = Number(d.seconds ?? 10);
    if (!Number.isFinite(seconds) || seconds < 0.2 || seconds > 120) throw Error("A duração do lance deve ser entre 0,2 e 120 segundos");
    const positions = await this.positions();
    await this.makeEvent(positions.map((cam) => ({ ...cam, start: Math.max(cam.earliest || 0, cam.end - seconds) })));
  }
}
