// Packed frames contain straight RGB Fill (left) and grayscale Key (right).
// Separate Fill/Key modes render one opaque logical-size frame for compatible
// H.264 4:2:0 receivers. Independent SRT receivers require timing alignment.
#pragma once
#include <obs.hpp>
#include <graphics/graphics.h>
#include <graphics/vec4.h>
#include <memory>
#include <string>

namespace freemix_srt_alpha {
struct Packed {
 obs_source_t *owner=nullptr;
 OBSSourceAutoRelease source;
 uint32_t width=0,height=0;
 std::string mode="packed";
 gs_texrender_t *texture=nullptr;
 gs_effect_t *effect=nullptr;
 ~Packed(){obs_enter_graphics();if(effect)gs_effect_destroy(effect);if(texture)gs_texrender_destroy(texture);obs_leave_graphics();}
};
inline const char *EffectCode(){return R"shader(
uniform float4x4 ViewProj;
uniform texture2d image;
sampler_state texSampler { Filter = Linear; AddressU = Clamp; AddressV = Clamp; };
struct VertData { float4 pos : POSITION; float2 uv : TEXCOORD0; };
VertData VS(VertData v) { v.pos = mul(float4(v.pos.xyz, 1.0), ViewProj); return v; }
float4 FillPS(VertData v) : TARGET {
 float4 c = image.Sample(texSampler, v.uv);
 return float4(c.a > 0.0001 ? saturate(c.rgb / c.a) : float3(0.0, 0.0, 0.0), 1.0);
}
float4 KeyPS(VertData v) : TARGET {
 float a = saturate(image.Sample(texSampler, v.uv).a);
 return float4(a, a, a, 1.0);
}
technique Fill { pass { vertex_shader = VS(v); pixel_shader = FillPS(v); } }
technique Key { pass { vertex_shader = VS(v); pixel_shader = KeyPS(v); } }
)shader";}
inline void *Allocate(obs_data_t *settings,obs_source_t *owner){
 auto p=std::make_unique<Packed>();p->owner=owner;p->width=uint32_t(obs_data_get_int(settings,"width"));p->height=uint32_t(obs_data_get_int(settings,"height"));
 p->mode=obs_data_get_string(settings,"mode");if(p->mode.empty())p->mode="packed";
 if(p->mode!="packed"&&p->mode!="fill"&&p->mode!="key")return nullptr;
 if(!p->width||p->width>(p->mode=="packed"?1920u:3840u)||!p->height||p->height>3840||p->width%2||p->height%2)return nullptr;
 obs_enter_graphics();p->texture=gs_texrender_create(GS_RGBA,GS_ZS_NONE);char *error=nullptr;p->effect=gs_effect_create(EffectCode(),"FreeMix SRT packed alpha",&error);if(error){blog(LOG_ERROR,"FreeMix SRT alpha shader: %s",error);bfree(error);}obs_leave_graphics();
 if(!p->texture||!p->effect)return nullptr;return p.release();
}
inline void Draw(void *data,gs_effect_t *){
 auto &p=*static_cast<Packed *>(data);if(!p.source||obs_source_removed(p.source))return;
 const uint32_t sw=obs_source_get_width(p.source),sh=obs_source_get_height(p.source);if(!sw||!sh)return;
 gs_texrender_reset(p.texture);if(!gs_texrender_begin_with_color_space(p.texture,p.width,p.height,GS_CS_SRGB))return;
 vec4 transparent={};gs_clear(GS_CLEAR_COLOR,&transparent,0.0f,0);
 gs_blend_state_push();gs_blend_function(GS_BLEND_ONE,GS_BLEND_INVSRCALPHA);
 gs_ortho(0,float(sw),0,float(sh),-100,100);obs_source_video_render(p.source);gs_blend_state_pop();gs_texrender_end(p.texture);
 gs_effect_set_texture(gs_effect_get_param_by_name(p.effect,"image"),gs_texrender_get_texture(p.texture));
 gs_blend_state_push();gs_blend_function(GS_BLEND_ONE,GS_BLEND_ZERO);gs_matrix_push();
 if(p.mode!="key")while(gs_effect_loop(p.effect,"Fill"))gs_draw_sprite(gs_texrender_get_texture(p.texture),0,p.width,p.height);
 if(p.mode=="packed")gs_matrix_translate3f(float(p.width),0.0f,0.0f);
 // Ending Fill clears effect parameter values; bind the captured frame again
 // before Key so both techniques sample the same non-null texture.
 gs_effect_set_texture(gs_effect_get_param_by_name(p.effect,"image"),gs_texrender_get_texture(p.texture));
 if(p.mode!="fill")while(gs_effect_loop(p.effect,"Key"))gs_draw_sprite(gs_texrender_get_texture(p.texture),0,p.width,p.height);
 gs_matrix_pop();gs_blend_state_pop();
}
inline void Register(){
 static bool registered=false;if(registered)return;registered=true;
 obs_source_info info={};info.id="freemix_srt_alpha_pack";info.type=OBS_SOURCE_TYPE_INPUT;
 info.output_flags=OBS_SOURCE_VIDEO|OBS_SOURCE_CUSTOM_DRAW|OBS_SOURCE_DO_NOT_DUPLICATE;
 info.get_name=[](void *){return "3Mix SRT Fill + Key packed";};info.create=Allocate;
 info.destroy=[](void *data){delete static_cast<Packed *>(data);};info.video_render=Draw;
 info.get_width=[](void *data){auto &p=*static_cast<Packed *>(data);return p.mode=="packed"?p.width*2:p.width;};
 info.get_height=[](void *data){return static_cast<Packed *>(data)->height;};
 info.enum_active_sources=[](void *data,obs_source_enum_proc_t callback,void *param){auto &p=*static_cast<Packed *>(data);if(p.source)callback(p.owner,p.source,param);};
 info.enum_all_sources=info.enum_active_sources;
 obs_register_source(&info);
}
inline obs_source_t *Create(obs_source_t *source,uint32_t width,uint32_t height,const std::string &mode="packed"){
 if(!source)return nullptr;Register();OBSDataAutoRelease settings=obs_data_create();obs_data_set_int(settings,"width",width);obs_data_set_int(settings,"height",height);
 obs_data_set_string(settings,"mode",mode.c_str());
 obs_source_t *packed=obs_source_create_private("freemix_srt_alpha_pack","FreeMix SRT packed alpha",settings);
 if(packed){auto *context=static_cast<Packed *>(obs_obj_get_data(packed));if(!context){obs_source_release(packed);return nullptr;}context->source=obs_source_get_ref(source);}
 return packed;
}
}
