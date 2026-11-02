// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <array>
#include <cstdint>
#include <cstring>
#include <string>
#include <numeric>
namespace freemix_call_video {
struct FpsPlan{unsigned divisor=0;uint32_t numerator=0,denominator=0;};
inline FpsPlan DeriveFps(uint32_t numerator,uint32_t denominator){
 if(!numerator||!denominator)return {};auto gcd=std::gcd(numerator,denominator);numerator/=gcd;denominator/=gcd;
 unsigned divisor=0;
 if((denominator==1&&(numerator==25||numerator==30))||(denominator==1001&&numerator==30000))divisor=1;
 if((denominator==1&&(numerator==50||numerator==60))||(denominator==1001&&numerator==60000))divisor=2;
 if(!divisor)return {};return {divisor,numerator/divisor,denominator};
}
inline unsigned FpsDivisor(uint32_t numerator,uint32_t denominator){return DeriveFps(numerator,denominator).divisor;}
inline const char *ActionGuard(const std::string &action,bool optIn,bool draining){
 if(action=="state")return "";
 if(action!="start"&&action!="stop"&&action!="pulse")return "Unknown action";
 if(!optIn)return "Continuous video requires explicit experimental opt-in";
 if(draining&&action!="stop")return "Context draining; no start or renewal";return "";
}
inline bool ParseToken(const char *hex,std::array<uint8_t,32> &out){
 out.fill(0);if(!hex||std::strlen(hex)!=64)return false;
 auto digit=[](char c){return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:-1;};bool any=false;
 for(int i=0;i<32;i++){int a=digit(hex[i*2]),b=digit(hex[i*2+1]);if(a<0||b<0){out.fill(0);return false;}out[i]=uint8_t(a*16+b);any|=out[i]!=0;}return any;
}
}
