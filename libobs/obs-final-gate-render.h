/* Included only by obs-video.c, after composition and rendered callbacks, before conversion. */
static inline bool draw_master_final_gate(struct obs_core_video_mix *video)
{
 struct obs_final_gate_runtime *gate=&video->final_gate;
 /* Contract v2: only coded sRGB SDR8 targets. No PQ/HLG/16F reinterpretation. */
 const enum gs_color_format format=video->render_texture?gs_texture_get_color_format(video->render_texture):GS_UNKNOWN;
 gate->target_supported=video->render_texture&&video->render_space==GS_CS_SRGB&&(format==GS_RGBA||format==GS_BGRA);
 if(!gate->master&&!gate->follows_master)return true;
 /* OFF on unsupported targets does no work; active unsupported targets fault/reset. */
 if(!gate->target_supported)return !gate->enabled&&gate->gain>=1.0;
 if(!gate->enabled||gate->gain>=1.0)return true;
 gs_effect_t *effect=obs->video.solid_effect;
 if(!effect)return false;
 gs_eparam_t *color=gs_effect_get_param_by_name(effect,"color");
 if(!color)return false;
 struct vec4 black;vec4_set(&black,0.0f,0.0f,0.0f,(float)(1.0-gate->gain));
 gs_effect_set_vec4(color,&black);
 /* sRGB RTV decodes destination RGB before blending and encodes it on write.
  * The gain is linear-light; alpha is linear and black becomes opaque at gain 0.
  * Always restore ambient framebuffer-sRGB state, including a zero-pass effect. */
 const bool previous_srgb=gs_framebuffer_srgb_enabled();
 gs_enable_framebuffer_srgb(true);
 gs_set_render_target_with_color_space(video->render_texture,NULL,video->render_space);
 set_render_size(video->ovi.base_width,video->ovi.base_height);
 gs_blend_state_push();gs_enable_blending(true);
 gs_blend_function_separate(GS_BLEND_ONE,GS_BLEND_INVSRCALPHA,GS_BLEND_ONE,GS_BLEND_INVSRCALPHA);
 bool drawn=false;
 while(gs_effect_loop(effect,"Solid")){gs_draw_sprite(NULL,0,video->ovi.base_width,video->ovi.base_height);drawn=true;}
 gs_blend_state_pop();
 gs_enable_framebuffer_srgb(previous_srgb);
 return drawn;
}
