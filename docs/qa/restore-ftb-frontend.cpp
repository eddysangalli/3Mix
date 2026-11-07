freemix_ftb::Snapshot OBSBasic::FreeMixFtbSnapshot()
{
 freemix_ftb::Snapshot state;
 char *rawScope=obs_frontend_get_current_scene_collection();
 state.scope=rawScope?rawScope:"";bfree(rawScope);
 state.context=freeMixFtbPolicy.Context(state.scope);
 state.studio=IsPreviewProgramMode();state.closing=isClosing();state.manual=tBarActive;
 const auto quick=std::find_if(quickTransitions.begin(),quickTransitions.end(),[](const QuickTransition &q){return q.fadeToBlack&&q.source&&!obs_source_removed(q.source)&&strcmp(obs_source_get_id(q.source),"fade_transition")==0&&q.duration>=50&&q.duration<=20000;});
 state.available=quick!=quickTransitions.end()&&!FreeMixFinalGateBlocksFtb();
 OBSSourceAutoRelease outputTransition=obs_get_output_source(0);
 OBSSourceAutoRelease output=outputTransition?obs_transition_get_active_source(outputTransition):nullptr;
 OBSSourceAutoRelease program=obs_frontend_get_current_scene();
 const OBSSource preview=GetCurrentSceneSource();
 state.running=outputTransition&&obs_transition_is_active(outputTransition);
 state.requested=bool(prevFTBSource);
 state.output=output?obs_source_get_uuid(output):"";
 state.program=program?obs_source_get_uuid(program):"";
 state.preview=preview?obs_source_get_uuid(preview):"";
 state.restore=prevFTBSource?obs_source_get_uuid(prevFTBSource):"";
 state.restoreRemoved=prevFTBSource&&obs_source_removed(prevFTBSource);
 state.blackObserved=outputTransition&&state.requested&&!state.running&&!output;
 state.normalObserved=outputTransition&&!state.requested&&!state.running&&bool(output);
 freeMixFtbPolicy.Observe(state);
 return state;
}

bool OBSBasic::FreeMixTriggerFadeToBlack(const QuickTransition &quick)
{
 if(FreeMixFinalGateBlocksFtb()||isClosing()||!IsPreviewProgramMode()||tBarActive||!quick.fadeToBlack||!quick.source||obs_source_removed(quick.source)||strcmp(obs_source_get_id(quick.source),"fade_transition")!=0||quick.duration<50||quick.duration>20000)return false;
 OBSSourceAutoRelease current=obs_get_output_source(0);
 if(!current||obs_transition_is_active(current)||obs_transition_is_active(quick.source))return false;
 OBSSourceAutoRelease rendered=obs_transition_get_active_source(current);
 const bool turningOn=!prevFTBSource;
 if((turningOn&&!rendered)||(!turningOn&&rendered))return false;
 // Capture the actual rendered Program, including an existing private clone.
 // Do not route through TransitionToScene: it changes PGM metadata/Preview and duplicates scenes.
 const OBSSource target=turningOn?OBSSource(rendered.Get()):prevFTBSource;
 if(!target||obs_source_removed(target)||!obs_scene_from_source(target))return false;
 const bool oldOverride=overridingTransition;
 const bool changed=current.Get()!=quick.source.Get();
 if(changed){OverrideTransition(quick.source);overridingTransition=true;}
 if(!obs_transition_start(quick.source,OBS_TRANSITION_MODE_AUTO,quick.duration,turningOn?nullptr:target.Get())){
  if(changed){OverrideTransition(current.Get());overridingTransition=oldOverride;}
  return false;
 }
 prevFTBSource=turningOn?target:OBSSource(nullptr);
 // A FTB is not a scene take: pending swap metadata must not replace Preview on stop.
 swapScene=nullptr;
 return true;
}

static void FreeMixWriteFtbState(const freemix_ftb::Snapshot &s,obs_data_t *response)
{
 obs_data_set_int(response,"contractVersion",2);
 obs_data_set_string(response,"restoreSemantics","rendered-program-preserve-preview-v2");
 obs_data_set_bool(response,"available",s.available);
 obs_data_set_bool(response,"studioMode",s.studio);
 obs_data_set_bool(response,"requestedActive",s.requested);
 obs_data_set_bool(response,"transitionRunning",s.running);
 obs_data_set_bool(response,"manualTransition",s.manual);
 obs_data_set_bool(response,"blackObserved",s.blackObserved);
 obs_data_set_bool(response,"normalObserved",s.normalObserved);
 obs_data_set_bool(response,"restoreRemoved",s.restoreRemoved);
 obs_data_set_string(response,"scope",s.scope.c_str());
 obs_data_set_string(response,"contextToken",s.context.c_str());
 obs_data_set_string(response,"programUuid",s.program.c_str());
 obs_data_set_string(response,"previewUuid",s.preview.c_str());
 obs_data_set_string(response,"outputSourceUuid",s.output.c_str());
 obs_data_set_string(response,"restoreSourceUuid",s.restore.c_str());
 obs_data_set_string(response,"phase",s.running?"transitioning":s.blackObserved?"black":s.normalObserved?"normal":"uncertain");
}

void OBSBasic::FreeMixFadeToBlackRequest(obs_data_t *request,obs_data_t *response)
{
 const auto fail=[response](const char *reason){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error",reason);};
 if(isClosing()){fail("O 3Mix está encerrando. Nenhum FTB será enviado.");return;}
 const std::string command=obs_data_get_string(request,"command");
 if(command!="state"&&command!="set"){fail("Use state ou set com active explícito para FTB.");return;}
 const auto before=FreeMixFtbSnapshot();FreeMixWriteFtbState(before,response);
 if(command=="state"){obs_data_set_bool(response,"success",true);return;}
 obs_data_item_t *active=obs_data_item_byname(request,"active");
 const bool validActive=active&&obs_data_item_gettype(active)==OBS_DATA_BOOLEAN;
 obs_data_item_release(&active);
 if(!validActive){fail("active precisa ser true ou false; FTB não aceita toggle implícito.");return;}
 obs_data_item_t *outputGuard=obs_data_item_byname(request,"expectedOutputSourceUuid");
 const bool validOutputGuard=outputGuard&&obs_data_item_gettype(outputGuard)==OBS_DATA_STRING;
 obs_data_item_release(&outputGuard);
 if(!validOutputGuard){fail("expectedOutputSourceUuid precisa identificar a saída renderizada consultada, inclusive string vazia no preto.");return;}
 freemix_ftb::Request input;
 input.active=obs_data_get_bool(request,"active");
 input.id=obs_data_get_string(request,"operationId");
 input.connection=obs_data_get_string(request,"connectionId");
 input.scope=obs_data_get_string(request,"expectedScope");
 input.context=obs_data_get_string(request,"expectedContextToken");
 input.program=obs_data_get_string(request,"expectedProgramUuid");
 input.preview=obs_data_get_string(request,"expectedPreviewUuid");
 input.output=obs_data_get_string(request,"expectedOutputSourceUuid");
 const auto decision=freeMixFtbPolicy.Check(input,before);
 if(decision.kind==freemix_ftb::Kind::Reject){fail(decision.error.c_str());return;}
 obs_data_set_string(response,"operationId",input.id.c_str());
 obs_data_set_bool(response,"accepted",true);
 obs_data_set_bool(response,"replayed",decision.kind==freemix_ftb::Kind::Replayed);
 obs_data_set_bool(response,"unchanged",decision.kind==freemix_ftb::Kind::Unchanged);
 if(decision.kind!=freemix_ftb::Kind::Replayed){
  // Record before triggering: nested frontend events cannot dispatch this ID twice.
  freeMixFtbPolicy.Accept(input,before,decision.kind==freemix_ftb::Kind::Unchanged);
  if(decision.kind==freemix_ftb::Kind::Start){
   const auto quick=std::find_if(quickTransitions.begin(),quickTransitions.end(),[](const QuickTransition &q){return q.fadeToBlack&&q.source&&!obs_source_removed(q.source)&&strcmp(obs_source_get_id(q.source),"fade_transition")==0&&q.duration>=50&&q.duration<=20000;});
   if(quick==quickTransitions.end()){fail("A quicktransition FTB foi removida; confira o motor.");return;}
   if(!FreeMixTriggerFadeToBlack(*quick)){
    const char *reason="Não foi possível confirmar o início do FTB. Confira o motor; este ID não será reenviado.";
    freeMixFtbPolicy.RejectAccepted(input,reason);
    FreeMixWriteFtbState(FreeMixFtbSnapshot(),response);
    obs_data_set_bool(response,"accepted",false);fail(reason);return;
   }
  }
 }
 const auto after=FreeMixFtbSnapshot();FreeMixWriteFtbState(after,response);
 const auto receipt=freeMixFtbPolicy.Find(input);
 obs_data_set_bool(response,"operationCompleted",receipt&&receipt->terminal);
 obs_data_set_string(response,"operationStatus",receipt&&receipt->terminal?"observed-state":"accepted-not-observed");
 obs_data_set_bool(response,"success",true);
}
