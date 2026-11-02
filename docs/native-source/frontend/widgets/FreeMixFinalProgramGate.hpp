// Experimental Master-only video gate. This is a distinct contract, never FTB-v2 fallback.
bool OBSBasic::FreeMixFinalGateBlocksFtb()
{
 obs_master_final_gate_state state={};
 return finalGateExperimental||finalGatePolicy.Pending()||(obs_master_final_gate_get(&state)&&state.enabled);
}
void OBSBasic::ResetFreeMixFinalGate()
{
 obs_master_final_gate_reset();finalGatePolicy.Reset();finalGateCapture=nullptr;finalGateExperimental=false;finalGateScope.clear();finalGateBoundIdentity=finalGateBoundGeneration=0;
}
void OBSBasic::FreeMixFinalProgramGateRequest(obs_data_t *request,obs_data_t *response)
{
 const auto fail=[response](const char *reason){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error",reason);};
 const auto typed=[request](const char *key,enum obs_data_type type){auto *item=obs_data_item_byname(request,key);const bool ok=item&&obs_data_item_gettype(item)==type;obs_data_item_release(&item);return ok;};
 if(isClosing()){fail("3Mix encerrando; nenhuma etapa final será enviada.");return;}
 auto base=FreeMixFtbSnapshot();
 if(!finalGateScope.empty()&&finalGateScope!=base.scope){ResetFreeMixFinalGate();}
 finalGateScope=base.scope;
 obs_master_final_gate_state stage={};const bool read=obs_master_final_gate_get(&stage);
 const bool coreAvailable=read&&stage.contract_version==2&&stage.target_supported&&stage.available;
 if(coreAvailable){
  if(finalGateBoundIdentity&&(finalGateBoundIdentity!=stage.mix_identity||finalGateBoundGeneration!=stage.generation)){
   // Core video reset already starts identity. Invalidate old pending receipts, never re-enable it.
   finalGatePolicy.Reset();finalGateCapture=nullptr;finalGateExperimental=false;
  }
  finalGateBoundIdentity=stage.mix_identity;finalGateBoundGeneration=stage.generation;
 }
 const bool captureMismatch=finalGateCapture&&base.output!=obs_source_get_uuid(finalGateCapture);
 finalGatePolicy.Observe(stage.command_serial,stage.enabled,stage.requested_active,stage.running,coreAvailable&&!captureMismatch);
 if(coreAvailable&&stage.normal_observed&&!stage.requested_active&&!finalGatePolicy.Pending())finalGateCapture=nullptr;
 const auto writeState=[&](){
  obs_master_final_gate_state current={};const bool fresh=obs_master_final_gate_get(&current);
  obs_data_set_int(response,"contractVersion",2);
  obs_data_set_string(response,"contract","experimental-master-final-video-gate-v2");
  obs_data_set_string(response,"coverage","main-video-only-after-composition");
  obs_data_set_string(response,"audioPolicy","unchanged");
  obs_data_set_string(response,"gainDomain","linear-sRGB");
  obs_data_set_string(response,"renderTargetContract","sRGB-SDR8");
  obs_data_set_bool(response,"renderTargetSupported",fresh&&current.contract_version==2&&current.target_supported);
  obs_data_set_bool(response,"experimental",true);obs_data_set_bool(response,"experimentalOptIn",finalGateExperimental);
  obs_data_set_bool(response,"available",fresh&&current.contract_version==2&&current.target_supported&&current.available&&base.studio&&!base.requested&&!captureMismatch);
  obs_data_set_bool(response,"enabled",current.enabled);obs_data_set_bool(response,"requestedActive",current.requested_active);
  obs_data_set_bool(response,"transitionRunning",current.running||base.running||finalGatePolicy.Pending());
  obs_data_set_bool(response,"blackStageApplied",current.black_observed&&!captureMismatch);
  obs_data_set_bool(response,"identityStageApplied",current.normal_observed&&!captureMismatch);
  obs_data_set_bool(response,"pixelsVerified",false);
  obs_data_set_bool(response,"clockFault",current.clock_fault);obs_data_set_bool(response,"resetRequired",current.clock_fault||captureMismatch);
  obs_data_set_bool(response,"independentProgramRoutesCovered",false);obs_data_set_bool(response,"callsProgramVerified",false);
  obs_data_set_int(response,"mixIdentity",current.mix_identity);obs_data_set_int(response,"generation",current.generation);
  obs_data_set_int(response,"commandSerial",current.command_serial);obs_data_set_int(response,"frameSeq",current.frame_seq);
  obs_data_set_int(response,"framePtsNs",(long long)current.frame_pts_ns);obs_data_set_int(response,"gainQ24",current.gain_q24);
  obs_data_set_string(response,"scope",base.scope.c_str());obs_data_set_string(response,"contextToken",base.context.c_str());
  obs_data_set_string(response,"programUuid",base.program.c_str());obs_data_set_string(response,"previewUuid",base.preview.c_str());
  obs_data_set_string(response,"outputSourceUuid",base.output.c_str());obs_data_set_bool(response,"captureMismatch",captureMismatch);
  obs_video_info info={};if(obs_get_video_info(&info)){obs_data_set_int(response,"fpsNumerator",info.fps_num);obs_data_set_int(response,"fpsDenominator",info.fps_den);}
 };
 const std::string command=obs_data_get_string(request,"command");writeState();
 if(command=="state"){obs_data_set_bool(response,"success",true);return;}
 if(command!="set"){fail("Use state ou set experimental explícito; não há toggle nem autostart.");return;}
 if(!typed("experimentalOptIn",OBS_DATA_BOOLEAN)||!obs_data_get_bool(request,"experimentalOptIn")||std::string(obs_data_get_string(request,"audioPolicy"))!="unchanged"){
  fail("Exige experimentalOptIn=true e audioPolicy=unchanged; recurso restrito ao Master vídeo.");return;
 }
 if(!typed("enabled",OBS_DATA_BOOLEAN)||!typed("active",OBS_DATA_BOOLEAN)||!typed("durationMs",OBS_DATA_NUMBER)){
  fail("enabled/active devem ser booleanos e durationMs inteiro explícito.");return;
 }
 const auto ms=obs_data_get_int(request,"durationMs");
 const bool enabled=obs_data_get_bool(request,"enabled"),active=obs_data_get_bool(request,"active");
 if(ms<50||ms>20000||obs_data_get_double(request,"durationMs")!=double(ms)||active&&!enabled){fail("Duração 50..20000ms e active exige enabled.");return;}
 const std::string id=obs_data_get_string(request,"operationId"),connection=obs_data_get_string(request,"connectionId");
 if(!freemix_ftb::Identifier(id)||!freemix_ftb::Identifier(connection)){fail("ID de operação e conexão explícitos obrigatórios.");return;}
 const std::string scope=obs_data_get_string(request,"expectedScope"),context=obs_data_get_string(request,"expectedContextToken"),program=obs_data_get_string(request,"expectedProgramUuid"),preview=obs_data_get_string(request,"expectedPreviewUuid"),output=obs_data_get_string(request,"expectedOutputSourceUuid");
 const auto identity=obs_data_get_int(request,"expectedMixIdentity"),generation=obs_data_get_int(request,"expectedGeneration");
 if(scope!=base.scope||context!=base.context||identity!=stage.mix_identity||generation!=stage.generation){fail("Contexto/generation mudou; consulte sem reenviar.");return;}
 const std::string key=connection+":"+id,signature=std::to_string(enabled)+"|"+std::to_string(active)+"|"+std::to_string(ms)+"|"+scope+"|"+context+"|"+program+"|"+preview+"|"+output+"|"+std::to_string(identity)+"|"+std::to_string(generation);
 if(const auto *old=finalGatePolicy.Find(key)){
  if(old->signature!=signature){fail("ID reutilizado para outra operação.");return;}
  if(!old->error.empty()){fail(old->error.c_str());return;}
  obs_data_set_bool(response,"replayed",true);obs_data_set_bool(response,"accepted",true);obs_data_set_int(response,"acceptedSerial",old->serial);obs_data_set_bool(response,"success",true);return;
 }
 if(!coreAvailable){fail("Etapa final v2 indisponível: exige alvo sRGB SDR8 RGBA/BGRA; HDR/16F não suportado. Consulte o estado sem reenviar.");return;}
 if(!base.studio||base.requested||base.running||base.manual||stage.running||finalGatePolicy.Pending()||captureMismatch||program!=base.program||preview!=base.preview||output!=base.output||!freemix_ftb::Uuid(program)||!freemix_ftb::Uuid(preview)||!freemix_ftb::Uuid(output)){
  fail("Estado/Programa/Preview/saída não confirmado, ou FTB-v2/transição ativa. Nenhum gate enviado.");return;
 }
 OBSSourceAutoRelease outputTransition=obs_get_output_source(0);
 OBSSourceAutoRelease rendered=outputTransition?obs_transition_get_active_source(outputTransition):nullptr;
 if(!rendered||obs_source_removed(rendered)||!obs_scene_from_source(rendered)){fail("Programa renderizado ausente/removido.");return;}
 if(!finalGatePolicy.Insert(key,{signature,{},0,enabled,active,false})){fail("Limite128 de operações pendentes; consulte o motor.");return;}
 obs_master_final_gate_request input={(uint32_t)identity,(uint32_t)generation,enabled,active,(uint32_t)ms};uint32_t serial=0;
 if(!obs_master_final_gate_set(&input,&serial)){const char *reason="Não confirmado pelo core; este ID não será reenviado.";finalGatePolicy.Failed(key,reason);fail(reason);return;}
 finalGatePolicy.Accepted(key,serial);finalGateExperimental=enabled;
 if(active&&!finalGateCapture)finalGateCapture=rendered.Get();
 if(!enabled&&!active)finalGateExperimental=false; // Pending policy still blocks FTB until identity draw acknowledged.
 obs_data_set_string(response,"operationId",id.c_str());obs_data_set_int(response,"acceptedSerial",serial);
 writeState();obs_data_set_bool(response,"accepted",true);obs_data_set_bool(response,"success",true);
}
