// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

// GUI-thread service. The host supplies privacy, output-consumer policy and the
// legacy profile path; the service owns independent M/E state and transitions.
// MAIN continues through the existing frontend path during this migration.
// Included after the shared bounded PCM tape definitions in FreeMixMultistream.cpp;
// this internal header is not a standalone public SDK.
class MixEffectManager {
public:
// Mix 2 has its own transition and framing. No global Preview/Program is changed.
struct IndependentMix {
	std::string previewUuid, programUuid;
	std::string transitionUuid;
	std::string transitionName;
	uint32_t width = 720, height = 1280;
	bool fill = true;
	double positionX = 0.5, positionY = 0.5, zoom = 1.0;
	OBSSourceAutoRelease transition;
	bool activeLease = false;
	std::shared_ptr<MixAudioTape> stingerTape=std::make_shared<MixAudioTape>();
	std::vector<std::unique_ptr<MixStingerTap>> stingerTaps;
	// Nesting (M/E Output exposed as a referenceable public signal): `transition`
	// above is recreated from scratch by ClearIndependentTransition on every
	// configure/profile-load/shutdown, which would hand out a new UUID each time
	// and break any Patch pointing at the old one. `proxy` is the stable public
	// identity instead: created once, never destroyed by configure, and kept
	// holding whatever the current `transition` is via a single scene item. A
	// Patch (or outputs_mix "mix" mode later) can safely target the proxy's
	// UUID and keep working across any number of reconfigurations.
	OBSSceneAutoRelease proxy;
	obs_sceneitem_t *proxyItem = nullptr;
	// Audit finding A7 (2026-11-01): a Patch (or any other public consumer) that
	// resolved `proxy`'s UUID keeps that string long after this struct forgets
	// about it. If the proxy scene is ever removed from outside this manager (a
	// Scene Collection switch is the normal way that happens — every scene not
	// owned by the new collection is gone, including this one), `proxy`/
	// `proxyItem` kept pointing at a freed-but-still-refcounted scene, and the
	// NEXT cut/fade/configure on that M/E would try to reuse a scene object OBS
	// itself had already torn down — the 600 (request-failed) the audit traced
	// to this gap. `proxyRemoved` observes the scene's own "remove" signal and
	// clears both fields the moment that happens, so EnsurePublicProxy() always
	// sees a clean `!mix.proxy` and re-adopts-or-creates exactly like it already
	// does after a process restart — no new code path, just an earlier reset.
	OBSSignal proxyRemoved;
};
std::array<IndependentMix,3> independentMixes;
std::function<bool(obs_source_t *)> IsPrivateSource;
std::function<bool(uint32_t)> outputBusy;
std::function<std::string()> ConfigPath;
void RefreshStingerTaps(IndependentMix &mix)
{
	if(!mix.transition||std::string(obs_source_get_id(mix.transition))!="obs_stinger_transition")return;
	obs_source_enum_full_tree(mix.transition,[](obs_source_t *parent,obs_source_t *child,void *param){
		auto &mix=*static_cast<IndependentMix *>(param);
		// Stinger's media is created by a deferred video-thread update. Revisit
		// after initialization, limiting capture strictly to that private child.
		if(parent!=static_cast<obs_source_t *>(mix.transition)||std::string(obs_source_get_id(child))!="ffmpeg_source")return;
		OBSDataAutoRelease settings=obs_source_get_settings(child);if(!obs_data_get_bool(settings,"is_stinger"))return;
		obs_source_set_audio_mixers(child,0);obs_source_set_muted(child,true);obs_source_set_monitoring_type(child,OBS_MONITORING_TYPE_NONE);
		for(const auto &tap:mix.stingerTaps)if(static_cast<obs_source_t *>(tap->source)==child)return;
		auto tap=std::make_unique<MixStingerTap>();tap->source=obs_source_get_ref(child);tap->tape=mix.stingerTape;obs_source_add_audio_capture_callback(child,CaptureStingerAudio,tap.get());mix.stingerTaps.push_back(std::move(tap));
	},&mix);
}
void ClearIndependentTransition(IndependentMix &mix)
{
	for(auto &tap:mix.stingerTaps)obs_source_remove_audio_capture_callback(tap->source,CaptureStingerAudio,tap.get());
	mix.stingerTaps.clear();{std::lock_guard<std::mutex> lock(mix.stingerTape->mutex);mix.stingerTape->packets.clear();mix.stingerTape->clockStarted=false;}
	if(mix.transition) {
		if(mix.activeLease)obs_source_dec_active(mix.transition);
		obs_transition_clear(mix.transition);
	}
	mix.activeLease=false;mix.transition=nullptr;
	// The proxy (if any) keeps existing with its own stable UUID; only detach
	// the now-dead transition from it so the proxy never holds a dangling item.
	// EnsurePublicProxy() re-attaches the next real transition once created.
	if(mix.proxy&&mix.proxyItem){obs_sceneitem_remove(mix.proxyItem);mix.proxyItem=nullptr;}
}
// Nesting support: creates `mix.proxy` once (public scene, stable UUID surviving
// any number of configure/reload cycles) and makes it hold the CURRENT
// mix.transition as its single scene item, replacing whatever item was there
// before. Safe to call every time EnsureIndependentMix runs — it is a no-op
// once the proxy already wraps the live transition. The proxy is deliberately
// NOT marked freemix_director_private: Patch and other public consumers must
// be able to select it; it is also excluded from obs_frontend_get_transitions
// on its own, since it is a scene, not a transition (see DescribeMix).
// Shared with LoadIndependentMix, which needs the same name to re-adopt an
// existing proxy scene after a process restart instead of creating a new one
// (see the comment on EnsurePublicProxy below for why this matters).
std::string ProxyName(uint32_t mixId) { return std::string("PGM M/E ") + std::to_string(mixId); }
// Audit finding A7: called back on the proxy scene's own "remove" signal (fires
// both for a direct removal and, more commonly, for every scene when the whole
// Scene Collection is torn down by ClearSceneData() during a collection
// switch). `data` is the IndependentMix whose proxy just went away. Runs on
// whatever thread raised the signal (obs_source_remove can be called from
// several); the only state touched is `mix.proxy`/`mix.proxyItem`, both plain
// pointers with no allocation here, so clearing them directly is safe without
// hopping to the UI thread — EnsurePublicProxy() (always GUI-thread, called
// from RequestMix's work lambda) is the only reader/writer otherwise, and it
// always runs after this has already observed the removal, never concurrently
// with it, since the signal firing and the next RequestMix are strictly
// ordered by the same obs_source_remove() call that nothing in this manager
// could be racing against mid-removal.
static void OnProxyRemoved(void *data, calldata_t *)
{
	auto &mix = *static_cast<IndependentMix *>(data);
	mix.proxyItem = nullptr;
	mix.proxy = nullptr;
	mix.proxyRemoved.Disconnect();
}
void EnsurePublicProxy(IndependentMix &mix, uint32_t mixId)
{
	if(!mix.proxy) {
		// Re-adopt an existing proxy scene from a PREVIOUS process lifetime
		// (e.g. after an engine restart) before creating a new one. Without
		// this, every restart orphaned the old scene (OBS auto-renames a
		// name collision instead of reusing it, e.g. "...Output 2") and
		// handed out a brand new UUID — silently breaking any Patch that
		// still pointed at the old one. LoadIndependentMix() already runs
		// before any cut/fade/take can call this, so by the time an
		// operator's Patch gets exercised post-restart, the SAME scene
		// (same UUID) is already here waiting to be reused.
		const std::string proxyName = ProxyName(mixId);
		OBSSourceAutoRelease existing = obs_get_source_by_name(proxyName.c_str());
		if(existing && obs_source_get_type(existing) == OBS_SOURCE_TYPE_SCENE && !IsPrivateSource(existing)) {
			mix.proxy = OBSSceneAutoRelease{obs_scene_get_ref(obs_scene_from_source(existing))};
			// A re-adopted scene may still hold a scene item saved from the
			// PREVIOUS process's now-gone transition object (mix.proxyItem
			// above is a fresh in-memory nullptr either way — it never
			// survives a restart — but the item itself was persisted to
			// disk with the scene). Clear any leftover item(s) now, so the
			// re-attach logic below always starts from a known-empty scene
			// instead of silently leaving a dead item behind the live one.
			std::vector<obs_sceneitem_t *> stale;
			obs_scene_enum_items(mix.proxy, [](obs_scene_t *, obs_sceneitem_t *item, void *param) {
				static_cast<std::vector<obs_sceneitem_t *> *>(param)->push_back(item);
				return true;
			}, &stale);
			for(auto *item : stale) obs_sceneitem_remove(item);
		} else {
			mix.proxy = OBSSceneAutoRelease{obs_scene_create(proxyName.c_str())};
		}
		mix.proxyItem = nullptr;
		// Observe this specific proxy's removal from here on — covers both a
		// direct delete and a Scene Collection switch (ClearSceneData() removes
		// every scene the same way). mix.proxy is guaranteed freshly (re)set
		// above, so there is nothing stale to disconnect from first.
		mix.proxyRemoved.Connect(obs_source_get_signal_handler(obs_scene_get_source(mix.proxy)), "remove",
					  OnProxyRemoved, &mix);
	}
	if(!mix.transition) return;
	if(mix.proxyItem && obs_sceneitem_get_source(mix.proxyItem) == static_cast<obs_source_t *>(mix.transition)) return;
	if(mix.proxyItem) { obs_sceneitem_remove(mix.proxyItem); mix.proxyItem = nullptr; }
	mix.proxyItem = obs_scene_add(mix.proxy, mix.transition);
	if(mix.proxyItem) {
		// The proxy's own frame always matches the transition's configured
		// size 1:1 — it exists to carry an identity, not to re-frame content
		// a second time (FrameMixSource already handles framing/zoom/crop).
		vec2 scale; vec2_set(&scale, 1.0f, 1.0f);
		vec2 position; vec2_set(&position, 0.0f, 0.0f);
		obs_sceneitem_set_scale(mix.proxyItem, &scale);
		obs_sceneitem_set_pos(mix.proxyItem, &position);
					obs_sceneitem_set_bounds_type(mix.proxyItem, OBS_BOUNDS_SCALE_INNER);
			obs_sceneitem_set_bounds_alignment(mix.proxyItem, OBS_ALIGN_CENTER);
			obs_video_info canvas{};
			const bool hasCanvas = obs_get_video_info(&canvas) && canvas.base_width && canvas.base_height;
			vec2 bounds; vec2_set(&bounds, float(hasCanvas ? canvas.base_width : mix.width), float(hasCanvas ? canvas.base_height : mix.height));
			obs_sceneitem_set_bounds(mix.proxyItem, &bounds);
		// Parada, a transição desenha a fonte sem recortar. Em formato diferente da produção,
		// o filtro de escala faz o item passar por uma textura do tamanho do M/E e recorta o excesso.
		if(hasCanvas&&(canvas.base_width!=mix.width||canvas.base_height!=mix.height))obs_sceneitem_set_scale_filter(mix.proxyItem,OBS_SCALE_BILINEAR);
	}
}
OBSSourceAutoRelease FrameMixSource(IndependentMix &mix, obs_source_t *source)
{
	if (!source || IsPrivateSource(source)) return nullptr;
	const auto sw = obs_source_get_width(source), sh = obs_source_get_height(source);
	if (!sw || !sh) return nullptr;
	const std::string frameName=std::string("3Mix mix frame ")+obs_source_get_uuid(source);
	const bool moving=mix.transition&&std::string(obs_source_get_id(mix.transition))=="move_transition";
	obs_scene_t *original=obs_scene_from_source(source);
	obs_scene_t *scene = moving&&original?obs_scene_duplicate(original,frameName.c_str(),OBS_SCENE_DUP_PRIVATE_REFS):obs_scene_create_private(frameName.c_str());
	if(!scene)return nullptr;
	OBSDataAutoRelease dimensions = obs_source_get_settings(obs_scene_get_source(scene));
	std::vector<obs_transform_info> originalTransforms;
	if(moving&&original){
		// Scene load applies custom dimensions and rebuilds the item list. Save
		// duplicated item state first so resizing cannot erase the copied scene.
		OBSDataArrayAutoRelease items=obs_data_array_create();
		struct SavedItems{obs_data_array_t *items;std::vector<obs_transform_info> *transforms;}saved{items,&originalTransforms};
		obs_scene_enum_items(scene,[](obs_scene_t *,obs_sceneitem_t *item,void *param){auto &saved=*static_cast<SavedItems *>(param);obs_sceneitem_save(item,saved.items);obs_transform_info info;obs_sceneitem_get_info2(item,&info);saved.transforms->push_back(info);return true;},&saved);
		obs_data_set_array(dimensions,"items",items);
	}
	obs_data_set_bool(dimensions,"custom_size",true);obs_data_set_int(dimensions,"cx",mix.width);obs_data_set_int(dimensions,"cy",mix.height);
	obs_source_load(obs_scene_get_source(scene));
	const float factor = float(mix.zoom) * (mix.fill ? std::max(float(mix.width)/sw, float(mix.height)/sh) : std::min(float(mix.width)/sw, float(mix.height)/sh));
	vec2 scale, position; vec2_set(&scale, factor, factor);
	vec2_set(&position, (float(mix.width)-sw*factor)*float(mix.positionX), (float(mix.height)-sh*factor)*float(mix.positionY));
	if(moving&&original){
		// Keep shared source identities directly visible to Move. Wrapping whole
		// scenes as equally named items makes its matching switch their content
		// at the midpoint instead of interpolating the underlying source geometry.
		struct Geometry{float factor;vec2 offset;std::vector<obs_transform_info> *transforms;size_t next=0;}geometry{factor,position,&originalTransforms};
		obs_scene_enum_items(scene,[](obs_scene_t *,obs_sceneitem_t *item,void *param){auto &g=*static_cast<Geometry *>(param);if(g.next>=g.transforms->size())return false;obs_transform_info info=(*g.transforms)[g.next++];info.pos.x=info.pos.x*g.factor+g.offset.x;info.pos.y=info.pos.y*g.factor+g.offset.y;info.scale.x*=g.factor;info.scale.y*=g.factor;info.bounds.x*=g.factor;info.bounds.y*=g.factor;obs_sceneitem_set_info2(item,&info);return true;},&geometry);
	}else{
		obs_sceneitem_t *item = obs_scene_add(scene, source);
		obs_sceneitem_set_scale(item, &scale); obs_sceneitem_set_pos(item, &position);
		obs_sceneitem_set_alignment(item, OBS_ALIGN_LEFT | OBS_ALIGN_TOP);
	}
	OBSSourceAutoRelease framed = obs_source_get_ref(obs_scene_get_source(scene));
	obs_scene_release(scene);
	return framed;
}
// O identificador de uma transição muda a cada abertura do programa; o nome não. Sem isso, escolher uma
// transição e reabrir deixava o M/E sem transição, recusando CUT e AUTO até o fim da sessão.
std::string TransitionUuidByName(const std::string &name)
{
	std::string found;
	if(name.empty())return found;
	obs_frontend_source_list list={};
	obs_frontend_get_transitions(&list);
	for(size_t n=0;n<list.sources.num;n++){obs_source_t *t=list.sources.array[n];if(name==obs_source_get_name(t)){found=obs_source_get_uuid(t);break;}}
	obs_frontend_source_list_free(&list);
	return found;
}
bool TransitionUuidUsable(const std::string &uuid)
{
	OBSSourceAutoRelease source=obs_get_source_by_uuid(uuid.c_str());
	return source&&obs_source_get_type(source)==OBS_SOURCE_TYPE_TRANSITION&&!IsPrivateSource(source);
}
// Reaponta pelo nome. Se a transição não existe mais, o M/E volta à padrão em vez de travar.
void ResolveMixTransition(IndependentMix &mix)
{
	if(mix.transition||mix.transitionUuid.empty()||mix.transitionUuid=="builtin:move_transition"||TransitionUuidUsable(mix.transitionUuid))return;
	const std::string current=TransitionUuidByName(mix.transitionName);
	if(current.empty())mix.transitionName.clear();
	mix.transitionUuid=current;
}
bool EnsureIndependentMix(IndependentMix &mix, uint32_t mixId)
{
	if (mix.transition) {RefreshStingerTaps(mix);EnsurePublicProxy(mix,mixId);return true;}
	ResolveMixTransition(mix);
	if(mix.transitionUuid.empty()) {
		mix.transition = obs_source_create_private("fade_transition", "3Mix Mix 2", nullptr);
	} else if(mix.transitionUuid=="builtin:move_transition") {
		OBSDataAutoRelease settings=obs_data_create();obs_data_set_bool(settings,"nested_scenes",true);
		// Move matches shared sources and interpolates their geometry. This is
		// the loaded plugin's actual transition, not a Fade renamed as Merge.
		mix.transition=obs_source_create_private("move_transition","3Mix Merge",settings);
	} else {
		OBSSourceAutoRelease original=obs_get_source_by_uuid(mix.transitionUuid.c_str());
		if(!original||obs_source_get_type(original)!=OBS_SOURCE_TYPE_TRANSITION||IsPrivateSource(original))return false;
		OBSDataAutoRelease originalSettings=obs_source_get_settings(original),settings=obs_data_create();obs_data_apply(settings,originalSettings);
		const bool stinger=std::string(obs_source_get_id(original))=="obs_stinger_transition";
		if(stinger)obs_data_set_int(settings,"audio_monitoring",OBS_MONITORING_TYPE_NONE);
		// Copy the actual transition and its settings; never change the main
		// transition's source, timing or media playback for the independent mix.
		mix.transition=obs_source_create_private(obs_source_get_id(original),"3Mix Mix 2",settings);
		if(stinger&&mix.transition) {
			// The independent output takes its chosen bus. A cloned Stinger's
			// private media must not inject its sound into the operator's Master.
			obs_source_set_audio_mixers(mix.transition,0);
			obs_audio_info info;if(!obs_get_audio_info(&info))return false;
			mix.stingerTape->rate=info.samples_per_sec;mix.stingerTape->channels=get_audio_channels(info.speakers);
			RefreshStingerTaps(mix);
		}
	}
	if (!mix.transition) return false;
	obs_transition_set_size(mix.transition, mix.width, mix.height);
	obs_transition_set_scale_type(mix.transition, OBS_TRANSITION_SCALE_STRETCH);
	OBSSourceAutoRelease source = obs_get_source_by_uuid(mix.programUuid.c_str());
	OBSSourceAutoRelease framed = FrameMixSource(mix,source);
	if (framed) obs_transition_set(mix.transition, framed);
	EnsurePublicProxy(mix,mixId);
	return true;
}
void DescribeMix(obs_data_t *response, IndependentMix &mix, uint32_t mixId)
{
	// This mix renders video only; its unused transition audio flag can stay set
	// after the video reached its destination. Finalize before the next operation.
	if (mix.transition && obs_transition_is_active(mix.transition) && obs_transition_get_time(mix.transition) >= 1.0f) {
		OBSSourceAutoRelease source = obs_get_source_by_uuid(mix.programUuid.c_str());
		OBSSourceAutoRelease framed = FrameMixSource(mix,source);
		if (framed) obs_transition_set(mix.transition, framed);
		if(mix.activeLease){obs_source_dec_active(mix.transition);mix.activeLease=false;}
	}
	obs_data_set_int(response,"mixId",mixId);
	obs_data_set_int(response,"stingerAudioSources",mix.stingerTaps.size());
	{std::lock_guard<std::mutex> lock(mix.stingerTape->mutex);obs_data_set_int(response,"stingerAudioPackets",mix.stingerTape->capturedPackets);obs_data_set_double(response,"stingerAudioPeak",mix.stingerTape->capturedPeak);obs_data_set_int(response,"stingerAudioTimestamp",mix.stingerTape->packets.empty()?0:mix.stingerTape->packets.back().timestamp);}
	obs_data_set_string(response, "previewUuid", mix.previewUuid.c_str());
	obs_data_set_string(response, "programUuid", mix.programUuid.c_str());
	obs_data_set_int(response, "width", mix.width); obs_data_set_int(response, "height", mix.height);
	obs_data_set_bool(response, "fill", mix.fill);
	obs_data_set_double(response,"positionX",mix.positionX);obs_data_set_double(response,"positionY",mix.positionY);obs_data_set_double(response,"zoom",mix.zoom);
	obs_data_set_string(response,"transitionUuid",mix.transitionUuid.c_str());obs_data_set_string(response,"transitionName",mix.transitionName.c_str());
	// Nesting: the proxy's UUID is a stable public identity for this M/E's live
	// output, safe to Patch into another Input — it survives any number of
	// configure/reload cycles (unlike mix.transition itself, which gets
	// recreated by those). Empty until the M/E has run at least once
	// (EnsureIndependentMix creates it lazily, same pattern as transitionUuid).
	obs_data_set_string(response,"proxyUuid",mix.proxy?obs_source_get_uuid(obs_scene_get_source(mix.proxy)):"");
	OBSDataArrayAutoRelease available=obs_data_array_create();
	const char *transitionId;for(size_t n=0;obs_enum_transition_types(n,&transitionId);n++)if(std::string(transitionId)=="move_transition"){
		OBSDataAutoRelease item=obs_data_create();obs_data_set_string(item,"uuid","builtin:move_transition");obs_data_set_string(item,"name","Merge · movimento de fontes (Move)");obs_data_set_string(item,"kind",transitionId);obs_data_array_push_back(available,item);
	}
	obs_frontend_source_list transitions={};obs_frontend_get_transitions(&transitions);
	for(size_t i=0;i<transitions.sources.num;i++) {
		obs_source_t *source=transitions.sources.array[i];if(IsPrivateSource(source))continue;
		OBSDataAutoRelease item=obs_data_create();obs_data_set_string(item,"uuid",obs_source_get_uuid(source));obs_data_set_string(item,"name",obs_source_get_name(source));obs_data_set_string(item,"kind",obs_source_get_id(source));obs_data_array_push_back(available,item);
	}
	obs_frontend_source_list_free(&transitions);obs_data_set_array(response,"transitions",available);
	obs_data_set_bool(response, "transitioning", mix.transition && obs_transition_is_active(mix.transition));
}
void DescribeMixes(obs_data_t *response)
{
	OBSDataArrayAutoRelease mixes=obs_data_array_create();
	for(size_t i=0;i<independentMixes.size();i++){OBSDataAutoRelease item=obs_data_create();DescribeMix(item,independentMixes[i],uint32_t(i+2));if(i==0)obs_data_apply(response,item);obs_data_array_push_back(mixes,item);}
	obs_data_set_array(response,"mixes",mixes);
}
void RequestMix(obs_data_t *request, obs_data_t *response, void *)
{
	const std::string action = obs_data_get_string(request, "action"), uuid = obs_data_get_string(request, "uuid");
	const auto width = uint32_t(obs_data_get_int(request, "width")), height = uint32_t(obs_data_get_int(request, "height"));
	const auto duration = uint32_t(obs_data_get_int(request, "duration"));
	const bool fill = obs_data_get_bool(request, "fill");
	const uint32_t mixId=obs_data_has_user_value(request,"mixId")?uint32_t(obs_data_get_int(request,"mixId")):2;
	{
		if(mixId<2||mixId>4){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","select Mix 2, 3 or 4");return;}
		IndependentMix &mix=independentMixes[mixId-2];
		ResolveMixTransition(mix);
		DescribeMix(response,mix,mixId);
		std::string error;
		if (action == "configure") {
			const auto positionX=obs_data_has_user_value(request,"positionX")?obs_data_get_double(request,"positionX"):mix.positionX;
			const auto positionY=obs_data_has_user_value(request,"positionY")?obs_data_get_double(request,"positionY"):mix.positionY;
			const auto zoom=obs_data_has_user_value(request,"zoom")?obs_data_get_double(request,"zoom"):mix.zoom;
			const std::string transitionUuid=obs_data_has_user_value(request,"transitionUuid")?obs_data_get_string(request,"transitionUuid"):mix.transitionUuid;
			OBSSourceAutoRelease selected=transitionUuid.empty()?nullptr:obs_get_source_by_uuid(transitionUuid.c_str());
			bool moveLoaded=false;const char *kind;for(size_t n=0;obs_enum_transition_types(n,&kind);n++)if(std::string(kind)=="move_transition")moveLoaded=true;
			bool busy = mix.transition && obs_transition_is_active(mix.transition);
			if (outputBusy(mixId)) busy = true;
			if (busy) error = "stop Mix 2 outputs before changing framing";
			else if (width < 240 || width > 3840 || height < 240 || height > 3840 || width%2 || height%2) error = "invalid Mix 2 resolution";
			else if(!std::isfinite(positionX)||!std::isfinite(positionY)||!std::isfinite(zoom)||positionX<0||positionX>1||positionY<0||positionY>1||zoom<1||zoom>4)error="invalid Mix 2 crop position or zoom";
			else if(transitionUuid=="builtin:move_transition"&&!moveLoaded)error="Move plugin is not loaded; choose Fade or another available transition explicitly";
			else if(!transitionUuid.empty()&&transitionUuid!="builtin:move_transition"&&(!selected||obs_source_get_type(selected)!=OBS_SOURCE_TYPE_TRANSITION||IsPrivateSource(selected)))error="select a loaded transition";
			else { ClearIndependentTransition(mix);mix.width = width; mix.height = height; mix.fill = fill; mix.positionX=positionX;mix.positionY=positionY;mix.zoom=zoom;mix.transitionUuid=transitionUuid;mix.transitionName=selected?obs_source_get_name(selected):""; if(!mix.programUuid.empty())EnsureIndependentMix(mix,mixId); }
		} else if (action == "preview") {
			OBSSourceAutoRelease source = obs_get_source_by_uuid(uuid.c_str());
			if (!source || IsPrivateSource(source) || !obs_source_get_width(source)) error = "select a video input outside private director sources";
			else mix.previewUuid = uuid;
		} else if (action == "cut" || action == "fade" || action == "take") {
			if (!EnsureIndependentMix(mix, mixId)) error = "Mix 2 transition unavailable";
			else if (obs_transition_is_active(mix.transition)) error = "Mix 2 transition is already running";
			else if(action=="fade"&&std::string(obs_source_get_id(mix.transition))!="fade_transition")error="use take for the configured transition";
			else {
				OBSSourceAutoRelease source = obs_get_source_by_uuid(mix.previewUuid.c_str());
				OBSSourceAutoRelease framed = FrameMixSource(mix,source);
				if (!framed) error = "Mix 2 preview has no safe video source";
				else if (action != "cut" && (duration < 50 || duration > 10000)) error = "transition duration must be 50 to 10000 ms";
				else {
					if(action!="cut"&&std::string(obs_source_get_id(mix.transition))=="obs_stinger_transition"&&!mix.activeLease){{std::lock_guard<std::mutex> lock(mix.stingerTape->mutex);mix.stingerTape->packets.clear();mix.stingerTape->clockStarted=false;}obs_source_inc_active(mix.transition);mix.activeLease=true;}
					if(action!="cut"&&!obs_transition_start(mix.transition,OBS_TRANSITION_MODE_AUTO,duration,framed)) {
						error="Mix 2 transition did not start";
						if(mix.activeLease){obs_source_dec_active(mix.transition);mix.activeLease=false;}
					} else {if(action=="cut")obs_transition_set(mix.transition,framed);std::swap(mix.programUuid,mix.previewUuid);}
				}
			}
		} else if (action != "state" && !action.empty()) error = "invalid Mix 2 action";
		if(error.empty() && !action.empty() && action!="state") SaveIndependentMix();
		DescribeMixes(response); obs_data_set_bool(response, "success", error.empty());
		if (!error.empty()) obs_data_set_string(response, "error", error.c_str());
	}
}

void ApplyProductionFormat(IndependentMix &mix)
{
	obs_video_info canvas{};
	if(!obs_get_video_info(&canvas))return;
	const uint32_t w=canvas.base_width,h=canvas.base_height;
	if(w>=240&&w<=3840&&h>=240&&h<=3840&&!(w%2)&&!(h%2)){mix.width=w;mix.height=h;}
}
// Depois de abrir ou trocar de projeto, cada M/E volta a mostrar o que estava no ar.
// Só age quando a fonte já existe, e pode ser chamada mais de uma vez.
void RestoreIndependentMixes()
{
	for(size_t i=0;i<independentMixes.size();i++){
		auto &mix=independentMixes[i];
		ResolveMixTransition(mix);
		if(mix.transition||mix.programUuid.empty())continue;
		OBSSourceAutoRelease source=obs_get_source_by_uuid(mix.programUuid.c_str());
		if(!source)continue;
		EnsureIndependentMix(mix,uint32_t(i+2));
	}
}
void SaveIndependentMix()
{
	const auto path = ConfigPath(); if(path.empty())return;
	OBSDataAutoRelease data = obs_data_create(); DescribeMixes(data);
	obs_data_save_json_safe(data,(path+".mix2.json").c_str(),"tmp","bak");
}
void LoadIndependentMix()
{
	for(auto &mix:independentMixes){ClearIndependentTransition(mix);mix=IndependentMix{};ApplyProductionFormat(mix);}
	const auto path=ConfigPath();if(path.empty())return;
	OBSDataAutoRelease data=obs_data_create_from_json_file_safe((path+".mix2.json").c_str(),"bak");if(!data)return;
	OBSDataArrayAutoRelease list=obs_data_get_array(data,"mixes");
	for(size_t i=0;i<independentMixes.size();i++){
		OBSDataAutoRelease row=list&&i<obs_data_array_count(list)?obs_data_array_item(list,i):nullptr;if(!row&&i==0){row=obs_data_create();obs_data_apply(row,data);}if(!row)continue;auto &mix=independentMixes[i];
		const auto w=uint32_t(obs_data_get_int(row,"width")),h=uint32_t(obs_data_get_int(row,"height"));if(w>=240&&w<=3840&&h>=240&&h<=3840&&!(w%2)&&!(h%2)){mix.width=w;mix.height=h;}
		mix.fill=obs_data_get_bool(row,"fill");mix.transitionUuid=obs_data_get_string(row,"transitionUuid");mix.transitionName=obs_data_get_string(row,"transitionName");
		const double x=obs_data_has_user_value(row,"positionX")?obs_data_get_double(row,"positionX"):0.5,y=obs_data_has_user_value(row,"positionY")?obs_data_get_double(row,"positionY"):0.5,z=obs_data_has_user_value(row,"zoom")?obs_data_get_double(row,"zoom"):1.0;
		mix.positionX=std::isfinite(x)&&x>=0&&x<=1?x:0.5;mix.positionY=std::isfinite(y)&&y>=0&&y<=1?y:0.5;mix.zoom=std::isfinite(z)&&z>=1&&z<=4?z:1.0;
		mix.previewUuid=obs_data_get_string(row,"previewUuid");mix.programUuid=obs_data_get_string(row,"programUuid");
	}
	RestoreIndependentMixes();
}

void Clear()
{
 for (auto &mix : independentMixes) {
  ClearIndependentTransition(mix);
  mix.programUuid.clear();
  mix.previewUuid.clear();
 }
}
};
