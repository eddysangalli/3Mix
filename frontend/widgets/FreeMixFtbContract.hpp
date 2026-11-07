// FreeMix FTB contract policy. No OBS/Qt/global state or I/O in this header.
#pragma once
#include <algorithm>
#include <chrono>
#include <deque>
#include <string>
#include <unordered_map>

namespace freemix_ftb {
struct Snapshot {
 bool available=false, studio=false, closing=false, running=false, manual=false;
 bool requested=false, blackObserved=false, normalObserved=false, restoreRemoved=false;
 std::string scope, context, program, preview, output, restore;
};
struct Request {
 bool active=false;
 std::string id, connection, scope, context, program, preview, output;
};
enum class Kind { Reject, Start, Unchanged, Replayed };
struct Decision { Kind kind=Kind::Reject; std::string error; };
struct Receipt {
 std::string signature, id, connection, expectedOutput, failure;
 bool active=false, terminal=false;
};
inline bool Identifier(const std::string &s) {
 if(s.empty()||s.size()>80)return false;
 return std::all_of(s.begin(),s.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'||c=='-';});
}
inline bool Uuid(const std::string &s) {
 if(s.size()!=36)return false;
 for(size_t n=0;n<s.size();++n){if(n==8||n==13||n==18||n==23){if(s[n]!='-')return false;}else if(!((s[n]>='0'&&s[n]<='9')||(s[n]>='a'&&s[n]<='f')||(s[n]>='A'&&s[n]<='F')))return false;}return true;
}
class Policy {
 std::string seed=std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()), scope;
 unsigned long long epoch=1;
 std::unordered_map<std::string,Receipt> receipts;
 std::deque<std::string> order;
 static std::string Key(const Request &r){return r.connection+":"+r.id;}
 static std::string Signature(const Request &r){return (r.active?"1|":"0|")+r.context+"|"+r.program+"|"+r.preview+"|"+r.output;}
public:
 void Reset(){++epoch;scope.clear();receipts.clear();order.clear();}
 std::string Context(const std::string &currentScope){if(scope!=currentScope){++epoch;scope=currentScope;receipts.clear();order.clear();}return seed+":"+std::to_string(epoch);}
 void Observe(const Snapshot &s){for(auto &entry:receipts){auto &r=entry.second;if(!r.terminal)r.terminal=r.active?s.blackObserved:(s.normalObserved&&s.output==r.expectedOutput);}}
 Decision Check(const Request &r,const Snapshot &s)const {
  const auto reject=[](const char *e){return Decision{Kind::Reject,e};};
  if(!Identifier(r.id)||!Identifier(r.connection)||!Uuid(r.program)||!Uuid(r.preview))return reject("Identificação FTB ou UUID inválido.");
  if(s.closing)return reject("O 3Mix está encerrando; nenhum FTB será enviado.");
  if(r.scope!=s.scope||r.context!=s.context)return reject("Projeto ou contexto do motor mudou. Consulte FTB novamente.");
  const auto old=receipts.find(Key(r));
  if(old!=receipts.end()){if(old->second.signature!=Signature(r))return reject("ID FTB reutilizado para outro comando.");if(!old->second.failure.empty())return {Kind::Reject,old->second.failure};return {Kind::Replayed,{}};}
  if(!s.studio)return reject("Ative o modo Preview/Programa para usar o FTB.");
  if(!s.available)return reject("Não há quicktransition FTB nativa configurada. Nenhuma transição Fade comum será usada.");
  if(r.output!=s.output)return reject("A saída renderizada do Programa mudou. Consulte o motor antes de enviar FTB.");
  if(r.program!=s.program||r.preview!=s.preview)return reject("Programa ou Preview mudou. Consulte o motor antes de enviar FTB.");
  if(s.running||s.manual)return reject("Uma transição de vídeo ou áudio está ativa. Aguarde terminar; o FTB não será repetido.");
  if(s.restoreRemoved)return reject("A fonte de retorno do FTB foi removida. Confira o motor; nenhum retorno será inventado.");
  if((s.requested&&!s.blackObserved)||(!s.requested&&!s.normalObserved))return reject("Estado FTB não confirmado. Confira o motor; nenhum toggle será enviado.");
  if(receipts.size()>=128&&std::none_of(order.begin(),order.end(),[&](const auto &k){return receipts.at(k).terminal;}))return reject("Limite de comandos FTB sem confirmação. Confira o motor.");
  if(r.active==s.requested)return {Kind::Unchanged,{}};
  return {Kind::Start,{}};
 }
 void Accept(const Request &r,const Snapshot &before,bool unchanged){
  if(receipts.size()>=128){const auto old=std::find_if(order.begin(),order.end(),[&](const auto &k){return receipts.at(k).terminal;});if(old!=order.end()){receipts.erase(*old);order.erase(old);}}
  const auto key=Key(r);receipts.emplace(key,Receipt{Signature(r),r.id,r.connection,r.active?std::string{}:before.restore,{},r.active,unchanged});order.push_back(key);
 }
 void RejectAccepted(const Request &r,const std::string &failure){const auto i=receipts.find(Key(r));if(i!=receipts.end()){i->second.failure=failure;i->second.terminal=true;}}
 const Receipt *Find(const Request &r)const{const auto i=receipts.find(Key(r));return i==receipts.end()?nullptr:&i->second;}
 size_t Size()const{return receipts.size();}
};
} // namespace freemix_ftb
