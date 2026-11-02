// Capture the source before BGRA8 conversion. RGBA16F -> PA16 SDR BT.709.
#pragma once
#include <obs.hpp>
#include <graphics/graphics.h>
#include <graphics/vec4.h>
#include <cmath>
#include <algorithm>
#include <cstring>
#include <mutex>
#include <vector>
class FreeMixPrecisionVideo {
 OBSSourceAutoRelease source;
 gs_texrender_t *render=nullptr;gs_stagesurf_t *stage=nullptr;
 uint32_t width=0,height=0;std::mutex mutex;std::vector<uint16_t> frame;uint64_t timestamp=0;bool hooked=false;
 static float Half(uint16_t v){const int sign=(v>>15)&1,e=(v>>10)&31,m=v&1023;const float value=e==0?std::ldexp(float(m),-24):e==31?0.0f:std::ldexp(float(1024+m),e-25);return sign?-value:value;}
 static uint16_t Quantize(float value){return uint16_t(std::lround(std::clamp(value,0.0f,1.0f)*65535.0f));}
 static void Draw(void *data,uint32_t,uint32_t){static_cast<FreeMixPrecisionVideo *>(data)->Capture();}
 void Capture(){
  if(!source||obs_source_removed(source))return;
  gs_texrender_reset(render);if(!gs_texrender_begin_with_color_space(render,width,height,GS_CS_SRGB_16F))return;
  vec4 zero={};gs_clear(GS_CLEAR_COLOR,&zero,0.0f,0);gs_blend_state_push();gs_blend_function(GS_BLEND_ONE,GS_BLEND_INVSRCALPHA);gs_ortho(0,float(width),0,float(height),-100,100);obs_source_video_render(source);gs_blend_state_pop();gs_texrender_end(render);
  gs_stage_texture(stage,gs_texrender_get_texture(render));uint8_t *mapped=nullptr;uint32_t stride=0;if(!gs_stagesurface_map(stage,&mapped,&stride))return;
  std::vector<uint16_t> pixels(size_t(width)*height*3);auto *luma=pixels.data(),*uv=luma+size_t(width)*height,*alpha=uv+size_t(width)*height;
  for(uint32_t y=0;y<height;y++){const auto *row=reinterpret_cast<const uint16_t *>(mapped+size_t(y)*stride);for(uint32_t x=0;x<width;x+=2){float u=0,v=0;for(uint32_t i=0;i<2;i++){const uint16_t *p=row+(x+i)*4;const float a=std::clamp(Half(p[3]),0.0f,1.0f),r=Half(p[0]),g=Half(p[1]),b=Half(p[2]),Y=.2126f*r+.7152f*g+.0722f*b;luma[size_t(y)*width+x+i]=Quantize((16.0f+219.0f*Y)/255.0f);alpha[size_t(y)*width+x+i]=Quantize(a);u+=(b-Y)/1.8556f;v+=(r-Y)/1.5748f;}uv[size_t(y)*width+x]=Quantize((128.0f+112.0f*u)/255.0f);uv[size_t(y)*width+x+1]=Quantize((128.0f+112.0f*v)/255.0f);}}
  gs_stagesurface_unmap(stage);std::lock_guard<std::mutex> lock(mutex);frame.swap(pixels);timestamp=obs_get_video_frame_time();
 }
public:
 ~FreeMixPrecisionVideo(){Stop();}
 bool Start(const char *uuid,uint32_t w,uint32_t h){source=obs_get_source_by_uuid(uuid);if(!source||!w||!h||w%2||w>3840||h>3840)return false;width=w;height=h;obs_enter_graphics();render=gs_texrender_create(GS_RGBA16F,GS_ZS_NONE);stage=gs_stagesurface_create(w,h,GS_RGBA16F);obs_leave_graphics();if(!render||!stage){Stop();return false;}obs_add_main_render_callback(Draw,this);hooked=true;return true;}
 void Stop(){if(hooked){obs_remove_main_render_callback(Draw,this);hooked=false;}obs_enter_graphics();if(stage)gs_stagesurface_destroy(stage);if(render)gs_texrender_destroy(render);stage=nullptr;render=nullptr;obs_leave_graphics();source=nullptr;std::lock_guard<std::mutex> lock(mutex);frame.clear();timestamp=0;}
 bool Copy(std::vector<uint8_t> &out,uint64_t &pts){std::lock_guard<std::mutex> lock(mutex);if(frame.empty())return false;out.resize(frame.size()*sizeof(uint16_t));std::memcpy(out.data(),frame.data(),out.size());pts=timestamp;return true;}
};
