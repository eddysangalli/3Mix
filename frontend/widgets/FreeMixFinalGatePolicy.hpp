#pragma once
#include <deque>
#include <string>
#include <unordered_map>
namespace freemix_final_gate {
struct Receipt {std::string signature,error;unsigned serial=0;bool enabled=false,active=false,terminal=false;};
class Policy {
 std::unordered_map<std::string,Receipt> values;std::deque<std::string> order;
public:
 void Reset(){values.clear();order.clear();}
 const Receipt *Find(const std::string &key)const{const auto i=values.find(key);return i==values.end()?nullptr:&i->second;}
 void Observe(unsigned serial,bool enabled,bool active,bool running,bool available){if(!available||running)return;for(auto &v:values)if(v.second.serial==serial&&v.second.enabled==enabled&&v.second.active==active)v.second.terminal=true;}
 bool Insert(const std::string &key,const Receipt &r){
  if(values.count(key))return false;
  if(values.size()>=128){auto old=order.begin();while(old!=order.end()&&!values.at(*old).terminal)++old;if(old==order.end())return false;values.erase(*old);order.erase(old);}
  values.emplace(key,r);order.push_back(key);return true;
 }
 void Accepted(const std::string &key,unsigned serial){values.at(key).serial=serial;}
 void Failed(const std::string &key,const std::string &reason){auto &v=values.at(key);v.error=reason;v.terminal=true;}
 bool Pending()const{for(const auto &v:values)if(!v.second.terminal)return true;return false;}
 size_t Size()const{return values.size();}
};
}
