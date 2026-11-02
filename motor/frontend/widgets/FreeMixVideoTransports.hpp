// Read-only cached DeckLink metadata. Driver properties are explicit operations.
#pragma once
#include <obs.hpp>
#include <obs-properties.h>
#include <string>
#include <mutex>
#include <cstdint>

namespace freemix_transport_inventory {
struct Cache { std::mutex mutex; std::string decklinkJson; uint64_t revision=0; bool probeFailed=false; };
inline Cache &Store(){static Cache value;return value;}
inline bool Registered(){const char *id=nullptr;for(size_t n=0;obs_enum_output_types(n,&id);++n)if(id&&std::string(id)=="decklink_output")return true;return false;}
inline uint64_t Revision(){auto &cache=Store();std::lock_guard<std::mutex> lock(cache.mutex);return cache.revision;}
inline bool Publish(obs_data_t *decklink,bool complete,uint64_t expectedRevision){
 // Copy owned JSON before locking; no OBS objects or driver callbacks survive.
 const std::string json=complete?obs_data_get_json(decklink):"";
 auto &cache=Store();std::lock_guard<std::mutex> lock(cache.mutex);
 if(cache.revision!=expectedRevision)return false; // reentrant context reset/another probe
 if(complete)cache.decklinkJson=json;
 cache.probeFailed=!complete;++cache.revision;return true;
}
}
inline void FreeMixResetVideoTransportInventory(){
 auto &cache=freemix_transport_inventory::Store();std::lock_guard<std::mutex> lock(cache.mutex);
 cache.decklinkJson.clear();cache.probeFailed=false;++cache.revision;
}
inline OBSDataAutoRelease FreeMixVideoTransports(){
 std::string json;uint64_t revision;bool failed;
 {auto &cache=freemix_transport_inventory::Store();std::lock_guard<std::mutex> lock(cache.mutex);json=cache.decklinkJson;revision=cache.revision;failed=cache.probeFailed;}
 OBSDataAutoRelease result=obs_data_create(),decklink=json.empty()?obs_data_create():obs_data_create_from_json(json.c_str());
 const bool known=!json.empty()&&decklink;if(!decklink)decklink=obs_data_create();
 const bool loaded=freemix_transport_inventory::Registered();obs_video_info info={};
 const bool matches=known&&obs_get_video_info(&info)&&obs_data_get_int(decklink,"inventoryFpsNum")==info.fps_num&&obs_data_get_int(decklink,"inventoryFpsDen")==info.fps_den;
 if(!known){OBSDataArrayAutoRelease empty=obs_data_array_create();obs_data_set_array(decklink,"devices",empty);obs_data_set_bool(decklink,"hardwareAvailable",false);obs_data_set_bool(decklink,"hdrOutputImplemented",false);}
 obs_data_set_bool(decklink,"pluginLoaded",loaded);obs_data_set_string(decklink,"outputId","decklink_output");obs_data_set_string(decklink,"configuration","native-tools-decklink");
 obs_data_set_bool(decklink,"inventoryKnown",known);obs_data_set_bool(decklink,"hardwareAvailabilityKnown",known);obs_data_set_bool(decklink,"hdrImplementationKnown",known);
 obs_data_set_int(decklink,"inventoryRevision",(long long)revision);obs_data_set_bool(decklink,"inventoryProbeFailed",failed);
 obs_data_set_bool(decklink,"inventoryMatchesVideoSettings",matches);obs_data_set_bool(decklink,"inventorySnapshotUsable",known&&loaded&&!failed&&matches);
 obs_data_set_string(decklink,"inventoryStatus",failed?(known?"probe-failed-cached":"probe-failed-unknown"):known?"cached":"unknown");
 obs_data_set_bool(decklink,"inventoryRequiresExplicitRefresh",true);obs_data_set_string(decklink,"inventoryFreshness","last-explicit-probe-not-hotplug-observation");
 obs_data_set_string(decklink,"hdrStatus","requires_explicit_driver_preflight");obs_data_set_bool(decklink,"hdrSupported",false);obs_data_set_bool(decklink,"hdrPhysicalVerified",false);
 obs_data_set_obj(result,"decklink",decklink);obs_data_set_int(result,"networkPrecisionBits",8);obs_data_set_string(result,"networkColorSpace","BT709 SDR");
 obs_data_set_bool(result,"networkHdrSupported",false);obs_data_set_bool(result,"networkHighPrecisionAlpha",false);return result;
}

// Call only from an explicit GUI-thread SDI refresh/configure/preflight/start.
inline OBSDataAutoRelease FreeMixRefreshVideoTransportInventory()
{
 OBSDataAutoRelease decklink=obs_data_create();
 const uint64_t expectedRevision=freemix_transport_inventory::Revision();
 const bool loaded=freemix_transport_inventory::Registered();
 OBSDataArrayAutoRelease devices=obs_data_array_create();
 // This explicit action queries real driver metadata; it is not a read/poll.
 obs_properties_t *props=loaded?obs_get_output_properties("decklink_output"):nullptr;
 obs_data_set_bool(decklink,"hdrOutputImplemented",props&&obs_properties_get(props,"freemix_hdr_contract"));
 obs_data_set_bool(decklink,"hdrPhysicalVerified",false);
 obs_property_t *list=props?obs_properties_get(props,"device_hash"):nullptr;
 if(list)for(size_t n=0;n<obs_property_list_item_count(list)&&n<64;++n){
  const char *hash=obs_property_list_item_string(list,n);
  if(!hash||!*hash||obs_property_list_item_disabled(list,n))continue;
  const char *displayName=obs_property_list_item_name(list,n);
  const std::string deviceHash=hash,deviceName=displayName?displayName:hash;
  OBSDataAutoRelease device=obs_data_create(),settings=obs_data_create();
  obs_data_set_string(device,"hash",deviceHash.c_str());obs_data_set_string(device,"name",deviceName.c_str());
  obs_data_set_string(settings,"device_hash",deviceHash.c_str());obs_properties_apply_settings(props,settings);
  OBSDataArrayAutoRelease modes=obs_data_array_create(),keyers=obs_data_array_create();
  for(const char *key:{"mode_id","keyer"}){
   auto *options=obs_properties_get(props,key);if(!options)continue;
   for(size_t i=0;i<obs_property_list_item_count(options)&&i<256;++i){
    if(obs_property_list_item_disabled(options,i))continue;OBSDataAutoRelease item=obs_data_create();
    obs_data_set_int(item,"value",obs_property_list_item_int(options,i));obs_data_set_string(item,"name",obs_property_list_item_name(options,i));
    obs_data_array_push_back(std::string(key)=="keyer"?keyers:modes,item);
   }
  }
  OBSDataArrayAutoRelease hdrModes=obs_data_array_create();auto *hdrOptions=obs_properties_get(props,"freemix_hdr_modes");if(hdrOptions)for(size_t i=0;i<obs_property_list_item_count(hdrOptions)&&i<256;++i){if(obs_property_list_item_disabled(hdrOptions,i))continue;OBSDataAutoRelease row=obs_data_create();obs_data_set_int(row,"value",obs_property_list_item_int(hdrOptions,i));obs_data_set_string(row,"name",obs_property_list_item_name(hdrOptions,i));obs_data_array_push_back(hdrModes,row);}
  obs_data_set_array(device,"hdrModes",hdrModes);obs_data_set_array(device,"modes",modes);obs_data_set_array(device,"keyers",keyers);obs_data_array_push_back(devices,device);
 }
 const bool complete=loaded&&props&&list;
 if(props)obs_properties_destroy(props);
 obs_data_set_array(decklink,"devices",devices);obs_data_set_bool(decklink,"hardwareAvailable",obs_data_array_count(devices)>0);
 obs_video_info info={};if(obs_get_video_info(&info)){obs_data_set_int(decklink,"inventoryFpsNum",info.fps_num);obs_data_set_int(decklink,"inventoryFpsDen",info.fps_den);}
 const bool accepted=freemix_transport_inventory::Publish(decklink,complete,expectedRevision);
 OBSDataAutoRelease result=FreeMixVideoTransports(),snapshot=obs_data_get_obj(result,"decklink");obs_data_set_bool(snapshot,"inventoryProbeAccepted",complete&&accepted);
 return result;
}
