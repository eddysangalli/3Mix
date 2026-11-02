using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FreeMixUninstall {
    internal static class Program {
        [STAThread]
        static int Main(string[] args) {
            // Canonical guards stay unprefixed; managed I/O uses explicit extended paths below.
            AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling", false);
            AppContext.SetSwitch("Switch.System.IO.BlockLongPaths", false);
            bool silent = Array.IndexOf(args, "--silent") >= 0, apply = Array.IndexOf(args, "--apply") >= 0, dry = Array.IndexOf(args, "--dry-run") >= 0;
            string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            try {
                foreach (string a in args) if (a != "--silent" && a != "--apply" && a != "--dry-run") throw new Exception("Argumento desconhecido: " + a);
                if (apply && dry) throw new Exception("Escolha somente --apply ou --dry-run.");
                if (silent && !apply && !dry) throw new Exception("O modo silencioso exige --apply ou --dry-run.");
                NoLinks(root);
                Dictionary<string, object> ownership = ReadObject(Path.Combine(root, "uninstall-files.json"));
                if (Convert.ToInt32(ownership["format"]) != 1 || !String.Equals(Path.GetFullPath((string)ownership["root"]), root, StringComparison.OrdinalIgnoreCase)) throw new Exception("Recibo de propriedade inválido. Nenhum arquivo foi removido.");
                if (!silent && !dry) {
                    Application.EnableVisualStyles();
                    if (MessageBox.Show("Desinstalar o 3Mix Studio desta pasta?\n\n" + root + "\n\nSeus projetos, mídias, gravações, configurações, logs, arquivos alterados e arquivos externos serão preservados. Somente arquivos distribuídos cujo hash ainda confere serão removidos. O desinstalador e o recibo de preservação permanecem nessa pasta.\n\nFeche o 3Mix e suas janelas antes de continuar.", "Desinstalar 3Mix Studio", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return 0;
                    apply = true;
                }
                if (!apply && !dry) throw new Exception("Nenhuma ação selecionada.");
                CheckClosed(root);
                List<string> removed = new List<string>(), preserved = new List<string>(), failures = new List<string>();
                System.Collections.ICollection owned = (System.Collections.ICollection)ownership["files"];
                if (owned.Count > 40000) throw new Exception("Recibo excessivo.");
                foreach (object item in owned) {
                    Dictionary<string, object> entry = (Dictionary<string, object>)item; string name = (string)entry["path"], expected = (string)entry["sha256"];
                    if (!OwnedPath(name) || !ValidHash(expected)) throw new Exception("Caminho de propriedade inválido. Desinstalação interrompida.");
                }
                foreach (object item in owned) {
                    Dictionary<string, object> entry = (Dictionary<string, object>)item; string name = (string)entry["path"], target = Path.GetFullPath(Path.Combine(root, name.Replace('/', '\\')));
                    if (!target.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase)) throw new Exception("Caminho fora da instalação.");
                    try {
                        NoLinks(target); if (!File.Exists(FreeMixUninstall.Program.IOPath(target))) continue;
                        if (new FileInfo(FreeMixUninstall.Program.IOPath(target)).Length != Convert.ToInt64(entry["size"]) || Hash(target) != (string)entry["sha256"]) { preserved.Add(name + " (alterado)"); continue; }
                        if (apply) File.Delete(FreeMixUninstall.Program.IOPath(target)); removed.Add(name);
                    } catch (Exception e) { failures.Add(name + " (" + e.GetType().Name + ")"); }
                }
                foreach (object item in (System.Collections.IEnumerable)ownership["shortcuts"]) {
                    Dictionary<string, object> link = (Dictionary<string, object>)item; string path = (string)link["path"];
                    if (!OfficialShortcut(path)) { preserved.Add("atalho fora das pastas oficiais"); continue; }
                    try { if (File.Exists(FreeMixUninstall.Program.IOPath(path))) { if (Hash(path) == (string)link["sha256"]) { if (apply) File.Delete(FreeMixUninstall.Program.IOPath(path)); removed.Add("atalho " + Path.GetFileName(path)); } else preserved.Add("atalho alterado " + Path.GetFileName(path)); } } catch { failures.Add("atalho indisponível " + Path.GetFileName(path)); }
                }
                string registryKey = (string)ownership["registryKey"];
                if (!registryKey.StartsWith("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FreeMixStudio-", StringComparison.Ordinal) || !System.Text.RegularExpressions.Regex.IsMatch(registryKey.Substring(registryKey.LastIndexOf('-') + 1), "^[a-f0-9]{16}$") || registryKey.IndexOf('\\', "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\".Length) >= 0) throw new Exception("Chave de desinstalação inválida.");
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(registryKey)) if (apply && key != null && String.Equals(Convert.ToString(key.GetValue("InstallLocation")), root, StringComparison.OrdinalIgnoreCase)) { key.Close(); Registry.CurrentUser.DeleteSubKeyTree(registryKey, false); }
                if (apply) {
                    // Remove only empty package directories. Protected and unknown user directories are never traversed.
                    HashSet<string> directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (object item in owned) { string p = Path.GetDirectoryName(Path.Combine(root, ((string)((Dictionary<string, object>)item)["path"]).Replace('/', '\\'))); while (p != root && p.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase)) { directories.Add(p); p = Path.GetDirectoryName(p); } }
                    List<string> ordered = new List<string>(directories); ordered.Sort(delegate(string a, string b) { return b.Length.CompareTo(a.Length); });
                    foreach (string dir in ordered) try { NoLinks(dir); if (Directory.Exists(FreeMixUninstall.Program.IOPath(dir)) && FreeMixUninstall.Program.Entries(dir).Length == 0) Directory.Delete(FreeMixUninstall.Program.IOPath(dir)); } catch { }
                }
                JavaScriptSerializer json = Serializer(); string reportPath = Path.Combine(root, apply ? "uninstall-report.json" : "uninstall-preview.json"); NoLinks(reportPath);
                Dictionary<string, object> report = new Dictionary<string, object> { {"format",1}, {"status",failures.Count == 0 ? "PASS" : "PARTIAL"}, {"applied",apply}, {"root",root}, {"removed",removed}, {"preservedChangedFiles",preserved}, {"failures",failures}, {"preservedData",new string[] {"config", "projetos", "gravacoes", "diagnosticos", "logs", "arquivos novos/alterados e mídia do usuário", "desinstalador e recibos"}}, {"appStarted",false}, {"createdAt",DateTime.UtcNow.ToString("o")} };
                File.WriteAllText(FreeMixUninstall.Program.IOPath(reportPath), json.Serialize(report), new UTF8Encoding(false));
                if (!silent) MessageBox.Show((failures.Count == 0 ? "Desinstalação concluída." : "Desinstalação parcial: alguns arquivos estão em uso ou indisponíveis.") + "\n\nSeus dados permanecem em:\n" + root + "\n\nRecibo: " + reportPath, "3Mix Studio", MessageBoxButtons.OK, failures.Count == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
                return failures.Count == 0 ? 0 : 2;
            } catch (Exception e) { if (!silent) MessageBox.Show(e.Message, "3Mix Studio", MessageBoxButtons.OK, MessageBoxIcon.Error); try { File.WriteAllText(FreeMixUninstall.Program.IOPath(Path.Combine(Path.GetTempPath(), "3Mix-uninstall-error-" + Guid.NewGuid().ToString("N") + ".log")), e.Message, new UTF8Encoding(false)); } catch { } return 1; }
        }
        internal static string IOPath(string path) {
            string full = Path.GetFullPath(path);
            if (full.StartsWith(@"\\?\", StringComparison.Ordinal) || full.StartsWith(@"\\.\", StringComparison.Ordinal)) throw new Exception("Caminho de dispositivo recusado.");
            if (full.Length < 248) return full;
            return full.StartsWith(@"\\", StringComparison.Ordinal) ? @"\\?\UNC\" + full.Substring(2) : @"\\?\" + full;
        }
        internal static string[] Entries(string path) {
            string[] entries = Directory.GetFileSystemEntries(IOPath(path));
            for (int i = 0; i < entries.Length; i++) {
                if (entries[i].StartsWith(@"\\?\UNC\", StringComparison.Ordinal)) entries[i] = @"\\" + entries[i].Substring(8);
                else if (entries[i].StartsWith(@"\\?\", StringComparison.Ordinal)) entries[i] = entries[i].Substring(4);
            }
            return entries;
        }
        internal static JavaScriptSerializer Serializer() { return new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024, RecursionLimit = 100 }; }
        internal static Dictionary<string, object> ReadObject(string path) { NoLinks(path); FileInfo file = new FileInfo(FreeMixUninstall.Program.IOPath(path)); if (!file.Exists || file.Length > 16 * 1024 * 1024) throw new Exception("Recibo ausente ou excessivo."); return Serializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(FreeMixUninstall.Program.IOPath(path), Encoding.UTF8)); }
        internal static bool ValidHash(string hash) { return hash != null && System.Text.RegularExpressions.Regex.IsMatch(hash, "^[a-f0-9]{64}$"); }
        internal static bool OwnedPath(string name) {
            if (String.IsNullOrWhiteSpace(name) || name.Length > 512 || name.IndexOf('\\') >= 0 || name.StartsWith("/") || name.Split('/').Length > 30) return false;
            foreach (string part in name.Split('/')) if (part.Length == 0 || part == "." || part == ".." || System.Text.RegularExpressions.Regex.IsMatch(part, "[<>:\"|?*\\x00-\\x1f]") || part.EndsWith(".") || part.EndsWith(" ") || System.Text.RegularExpressions.Regex.IsMatch(part, "^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return false;
            string lower = name.ToLowerInvariant();
            if (lower == "painel/local.js" || lower.StartsWith("painel/gc/biblioteca/") || lower == "manifest.json" || lower == "manifest.sig" || lower == "hashes.json" || lower == "version.json" || lower == "installation.json" || lower == "installer-setup.json" || lower.StartsWith("uninstall") || lower.StartsWith("desinstalar")) return false;
            if (name.IndexOf('/') < 0) return lower.EndsWith(".cmd") || lower.EndsWith(".md") || lower == "package.json" || lower == "package-lock.json" || lower == "componentes.json" || lower == "portable_mode.txt" || lower == "update-public.pem";
            foreach (string prefix in new string[] { "assets/", "bin/", "data/", "docs/", "ferramentas/", "licenses/", "node_modules/", "obs-plugins/", "painel/", "runtime/" }) if (lower.StartsWith(prefix, StringComparison.Ordinal)) return true;
            return false;
        }
        internal static bool OfficialShortcut(string path) { string full = Path.GetFullPath(path); foreach (string folder in new string[] { Environment.GetFolderPath(Environment.SpecialFolder.Programs), Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory) }) if (String.Equals(Path.GetDirectoryName(full), Path.GetFullPath(folder), StringComparison.OrdinalIgnoreCase) && Path.GetFileName(full).StartsWith("3Mix Studio", StringComparison.Ordinal) && full.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)) return true; return false; }
        internal static string Hash(string path) { using (FileStream file = File.OpenRead(FreeMixUninstall.Program.IOPath(path))) using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant(); }
        internal static void NoLinks(string path) { for (string p = Path.GetFullPath(path); !String.IsNullOrEmpty(p); p = Path.GetDirectoryName(p)) { try { if ((File.GetAttributes(FreeMixUninstall.Program.IOPath(p)) & FileAttributes.ReparsePoint) != 0) throw new Exception("Link ou junção recusado."); } catch (FileNotFoundException) { } catch (DirectoryNotFoundException) { } if (String.Equals(p, Path.GetPathRoot(p), StringComparison.OrdinalIgnoreCase)) break; } }
        static void CheckClosed(string root) {
            foreach (Process process in Process.GetProcessesByName("FreeMix")) using (process) try { if (String.Equals(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(process.MainModule.FileName))), root, StringComparison.OrdinalIgnoreCase)) throw new Exception("Feche o 3Mix desta instalação antes de desinstalar."); } catch (System.ComponentModel.Win32Exception) { throw new Exception("Não foi possível confirmar se o 3Mix está fechado. Nenhum processo será encerrado."); }
            Dictionary<string, object> receipt = ReadObject(Path.Combine(root, "installation.json"));
            foreach (string field in new string[] { "apiPort", "wsPort" }) { int port = Convert.ToInt32(receipt[field]); if (port < 1 || port > 65535) throw new Exception("Portas inválidas no recibo."); TcpListener listener = new TcpListener(IPAddress.Loopback, port); try { listener.Server.ExclusiveAddressUse = true; listener.Start(); } catch (SocketException) { throw new Exception("A instalação ou uma de suas portas está em uso. Feche suas janelas antes de desinstalar."); } finally { listener.Stop(); } }
        }
    }
}
