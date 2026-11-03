// 3Mix read-only process ownership check. GPL-2.0-or-later.
// No window control, process termination, network access or elevated privileges.
using System;
using System.Text;
using System.Runtime.InteropServices;
class 3MixProcessInfo {
 [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref uint size);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 static string Json(string value) { return "\""+value.Replace("\\","\\\\").Replace("\"","\\\"")+"\""; }
 static int Main(string[] args) {
  var result=new StringBuilder("[");
  foreach(string arg in args) {
   uint pid;if(!UInt32.TryParse(arg,out pid)||pid==0) return 2;
   if(result.Length>1)result.Append(',');
   IntPtr handle=OpenProcess(0x1000,false,pid);string path=null;
   int error=Marshal.GetLastWin32Error();
   if(handle!=IntPtr.Zero){try{uint size=32768;var buffer=new StringBuilder((int)size);if(QueryFullProcessImageName(handle,0,buffer,ref size)){path=buffer.ToString();error=0;}else error=Marshal.GetLastWin32Error();}finally{CloseHandle(handle);}}
   result.Append("{\"pid\":").Append(pid).Append(",\"path\":").Append(path==null?"null":Json(path)).Append(",\"exited\":").Append(path==null&&error==87?"true":"false").Append('}');
  }
  Console.WriteLine(result.Append(']').ToString());return 0;
 }
}

