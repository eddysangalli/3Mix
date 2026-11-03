// GPL-2.0-or-later. Narrow, opt-in Windows firewall setup. Local operation needs no rule.
using System;using System.IO;using System.Collections.Generic;using System.Diagnostics;using System.Security.Principal;using System.Web.Script.Serialization;using System.Security.Cryptography;using System.Text;using System.Text.RegularExpressions;
class 3MixNetworkSetup {
 static void Transaction(Action apply,Action rollback){try{apply();}catch(Exception e){try{rollback();}catch(Exception r){throw new Exception(e.Message+"; rollback incompleto: "+r.Message,e);}throw;}}
 static byte[] Existing(string p){return File.Exists(p)?File.ReadAllBytes(p):null;}
 static void Restore(string p,byte[] data){if(data==null){if(File.Exists(p))File.Delete(p);}else File.WriteAllBytes(p,data);}
 static int SelfTest(){var state=new List<string>{"regra original"};var before=new List<string>(state);bool rolled=false;try{Transaction(()=>{state.Clear();state.Add("regra parcial");throw new Exception("falha simulada");},()=>{state.Clear();state.AddRange(before);rolled=true;});}catch(Exception e){if(e.Message!="falha simulada")throw;}if(!rolled||state.Count!=1||state[0]!="regra original")throw new Exception("Rollback falhou");bool applied=false;Transaction(()=>{applied=true;},()=>{throw new Exception("Rollback indevido");});if(!applied)throw new Exception("Aplicacao falhou");Console.WriteLine("{\"passed\":true,\"checks\":[\"Falha restaura estado anterior\",\"Erro original preservado\",\"Sucesso nao executa rollback\"]}");return 0;}
 static string Get(string[] a,string key,string fallback){for(int i=0;i<a.Length-1;i++)if(a[i]==key)return a[i+1];return fallback;}
 static bool Has(string[] a,string key){return Array.IndexOf(a,key)>=0;}
 static string Quote(string s){return "\""+s.Replace("\"","\\\"")+"\"";}
 static object Rule(string name,string program,string port,int protocol){return new Dictionary<string,object>{{"Name",name},{"ApplicationName",program},{"LocalPorts",port},{"Protocol",protocol},{"Profiles",2},{"RemoteAddresses","LocalSubnet"}};}
 static int Main(string[] args){try{
  if(Has(args,"--test-rollback"))return SelfTest();
  var root=Path.GetFullPath(Get(args,"--root",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..")));var exe=Path.Combine(root,"bin","64bit","3Mix.exe");var node=Path.Combine(root,"runtime","node.exe");if(!File.Exists(exe)||!File.Exists(node))throw new Exception("Instalacao 3Mix nao encontrada");
  int port;if(!int.TryParse(Get(args,"--port","8088"),out port)||port<1||port>65535)throw new Exception("Porta invalida");
  var rules=new List<object>();string digest;using(var hash=SHA256.Create())digest=BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(root.ToLowerInvariant()))).Replace("-","").Substring(0,12);var prefix="3Mix "+digest+" ";
  if(Has(args,"--control-lan"))rules.Add(Rule(prefix+"Controle LAN",node,port.ToString(),6));
  if(Has(args,"--ndi")){rules.Add(Rule(prefix+"NDI descoberta",exe,"5353",17));rules.Add(Rule(prefix+"NDI TCP",exe,"5960-5999",6));rules.Add(Rule(prefix+"NDI UDP",exe,"5960-5999",17));}
  if(Has(args,"--omt")){rules.Add(Rule(prefix+"OMT TCP",exe,"6400-6600",6));rules.Add(Rule(prefix+"OMT descoberta",exe,"5353",17));}
  var js=new JavaScriptSerializer();bool apply=Has(args,"--apply"),remove=Has(args,"--remove");
  if(apply&&remove)throw new Exception("Escolha aplicar ou remover");
  string panelPath=null,panelText=null;
  if(apply&&Has(args,"--control-lan")){panelPath=Path.Combine(root,"painel","local.js");var text=File.ReadAllText(panelPath);var match=Regex.Match(text,@"window\.MESA_LOCAL\s*=\s*(\{[^;]+\})\s*;?");if(!match.Success)throw new Exception("Configuracao local do painel invalida");var local=js.Deserialize<Dictionary<string,object>>(match.Groups[1].Value);var uri=new UriBuilder((string)local["replayUrl"]);uri.Port=port;local["replayUrl"]=uri.Uri.ToString();panelText=text.Substring(0,match.Groups[1].Index)+js.Serialize(local)+text.Substring(match.Groups[1].Index+match.Groups[1].Length);}
  if((apply||remove)&&!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator)){
   if(!Has(args,"--elevate"))throw new Exception("Executar como administrador ou usar --elevate para confirmar a elevacao do Windows");
   var forwarded=new List<string>();foreach(var a in args)if(a!="--elevate")forwarded.Add(Quote(a));var start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,string.Join(" ",forwarded.ToArray()));start.Verb="runas";start.UseShellExecute=true;start.WindowStyle=ProcessWindowStyle.Hidden;var child=Process.Start(start);child.WaitForExit();return child.ExitCode;
  }
  if(apply||remove){dynamic policy=Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2"));var old=new List<object>();foreach(dynamic rule in policy.Rules)if(((string)rule.Name).StartsWith(prefix,StringComparison.Ordinal))old.Add(rule);
   var config=Path.Combine(root,"config","obs-studio","plugin_config","3Mix-control","network.json");var oldConfig=Existing(config);byte[] oldPanel=panelPath==null?null:Existing(panelPath),oldBackup=panelPath==null?null:Existing(panelPath+".antes-rede.bak");
   Transaction(()=>{
    foreach(dynamic rule in old)policy.Rules.Remove((string)rule.Name);
    if(apply)foreach(Dictionary<string,object> spec in rules){dynamic rule=Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FWRule"));rule.Name=spec["Name"];rule.Grouping="3Mix rede privada";rule.Description="Somente este programa, porta e sub-rede local. Configuracao explicita do 3Mix.";rule.ApplicationName=spec["ApplicationName"];rule.Protocol=spec["Protocol"];rule.LocalPorts=spec["LocalPorts"];rule.Profiles=2;rule.RemoteAddresses="LocalSubnet";rule.Direction=1;rule.Action=1;rule.Enabled=true;policy.Rules.Add(rule);}
    Directory.CreateDirectory(Path.GetDirectoryName(config));File.WriteAllText(config,js.Serialize(new{allowLan=apply&&Has(args,"--control-lan"),apiPort=port,updatedAt=DateTime.UtcNow.ToString("o")}));
    if(panelPath!=null){File.Copy(panelPath,panelPath+".antes-rede.bak",true);File.WriteAllText(panelPath,panelText);}
   },()=>{
    var current=new List<string>();foreach(dynamic rule in policy.Rules)if(((string)rule.Name).StartsWith(prefix,StringComparison.Ordinal))current.Add((string)rule.Name);foreach(var name in current)policy.Rules.Remove(name);foreach(dynamic rule in old)policy.Rules.Add(rule);
    Restore(config,oldConfig);if(panelPath!=null){Restore(panelPath,oldPanel);Restore(panelPath+".antes-rede.bak",oldBackup);}
   });
  }
  Console.WriteLine(js.Serialize(new{applied=apply,removed=remove,privateNetworkOnly=true,remoteAddress="LocalSubnet",apiPort=port,rules=rules}));return 0;
 }catch(Exception e){Console.Error.WriteLine("3Mix: "+e.Message);return 1;}}
}

