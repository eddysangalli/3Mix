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
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FreeMixUninstall {
    internal static class Program {
        [STAThread]
        static int Main(string[] args) {
            AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling", false);
            AppContext.SetSwitch("Switch.System.IO.BlockLongPaths", false);
            bool silent = Array.IndexOf(args, "--silent") >= 0, apply = Array.IndexOf(args, "--apply") >= 0, dry = Array.IndexOf(args, "--dry-run") >= 0;
            string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            try {
                foreach (string a in args) if (a != "--silent" && a != "--apply" && a != "--dry-run") throw new Exception("Argumento desconhecido: " + a);
                if (apply && dry) throw new Exception("Escolha somente --apply ou --dry-run.");
                if (silent && !apply && !dry) throw new Exception("O modo silencioso exige --apply ou --dry-run.");
                NoLinks(root);

                if (!silent && !dry) {
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    using (UninstallWizardForm form = new UninstallWizardForm(root)) {
                        Application.Run(form);
                        return form.ExitCode;
                    }
                }

                if (!apply && !dry) throw new Exception("Nenhuma ação selecionada.");
                return ExecuteUninstall(root, apply, dry, null);
            } catch (Exception e) {
                if (!silent) MessageBox.Show(e.Message, "3Mix Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
                try { File.WriteAllText(IOPath(Path.Combine(Path.GetTempPath(), "3Mix-uninstall-error-" + Guid.NewGuid().ToString("N") + ".log")), e.Message, new UTF8Encoding(false)); } catch { }
                return 1;
            }
        }

        internal static int ExecuteUninstall(string root, bool apply, bool dry, Action<string, int> report) {
            CheckClosed(root);
            Dictionary<string, object> ownership = ReadObject(Path.Combine(root, "uninstall-files.json"));
            if (Convert.ToInt32(ownership["format"]) != 1 || !String.Equals(Path.GetFullPath((string)ownership["root"]), root, StringComparison.OrdinalIgnoreCase)) throw new Exception("Recibo de propriedade inválido. Nenhum arquivo foi removido.");

            List<string> removed = new List<string>(), preserved = new List<string>(), failures = new List<string>();
            System.Collections.ICollection owned = (System.Collections.ICollection)ownership["files"];
            if (owned.Count > 40000) throw new Exception("Recibo excessivo.");
            foreach (object item in owned) {
                Dictionary<string, object> entry = (Dictionary<string, object>)item; string name = (string)entry["path"], expected = (string)entry["sha256"];
                if (!OwnedPath(name) || !ValidHash(expected)) throw new Exception("Caminho de propriedade inválido. Desinstalação interrompida.");
            }

            int total = owned.Count; int current = 0;
            foreach (object item in owned) {
                current++;
                Dictionary<string, object> entry = (Dictionary<string, object>)item; string name = (string)entry["path"], target = Path.GetFullPath(Path.Combine(root, name.Replace('/', '\\')));
                if (!target.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase)) throw new Exception("Caminho fora da instalação.");
                if (report != null && current % 50 == 0) report("Removendo arquivos de sistema (" + current + "/" + total + ")…", (int)(current * 80 / total));
                try {
                    NoLinks(target); if (!File.Exists(IOPath(target))) continue;
                    if (new FileInfo(IOPath(target)).Length != Convert.ToInt64(entry["size"]) || Hash(target) != (string)entry["sha256"]) { preserved.Add(name + " (alterado)"); continue; }
                    if (apply) File.Delete(IOPath(target)); removed.Add(name);
                } catch (Exception e) { failures.Add(name + " (" + e.GetType().Name + ")"); }
            }

            if (report != null) report("Limpando atalhos oficiais do Windows…", 85);
            foreach (object item in (System.Collections.IEnumerable)ownership["shortcuts"]) {
                Dictionary<string, object> link = (Dictionary<string, object>)item; string path = (string)link["path"];
                if (!OfficialShortcut(path)) { preserved.Add("atalho fora das pastas oficiais"); continue; }
                try { if (File.Exists(IOPath(path))) { if (Hash(path) == (string)link["sha256"]) { if (apply) File.Delete(IOPath(path)); removed.Add("atalho " + Path.GetFileName(path)); } else preserved.Add("atalho alterado " + Path.GetFileName(path)); } } catch { failures.Add("atalho indisponível " + Path.GetFileName(path)); }
            }

            string registryKey = (string)ownership["registryKey"];
            if (!registryKey.StartsWith("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FreeMixStudio-", StringComparison.Ordinal) || !System.Text.RegularExpressions.Regex.IsMatch(registryKey.Substring(registryKey.LastIndexOf('-') + 1), "^[a-f0-9]{16}$") || registryKey.IndexOf('\\', "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\".Length) >= 0) throw new Exception("Chave de desinstalação inválida.");
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(registryKey)) if (apply && key != null && String.Equals(Convert.ToString(key.GetValue("InstallLocation")), root, StringComparison.OrdinalIgnoreCase)) { key.Close(); Registry.CurrentUser.DeleteSubKeyTree(registryKey, false); }

            if (apply) {
                if (report != null) report("Removendo diretórios vazios de distribuição…", 95);
                HashSet<string> directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (object item in owned) { string p = Path.GetDirectoryName(Path.Combine(root, ((string)((Dictionary<string, object>)item)["path"]).Replace('/', '\\'))); while (p != root && p.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase)) { directories.Add(p); p = Path.GetDirectoryName(p); } }
                List<string> ordered = new List<string>(directories); ordered.Sort(delegate(string a, string b) { return b.Length.CompareTo(a.Length); });
                foreach (string dir in ordered) try { NoLinks(dir); if (Directory.Exists(IOPath(dir)) && Entries(dir).Length == 0) Directory.Delete(IOPath(dir)); } catch { }
            }

            JavaScriptSerializer json = Serializer(); string reportPath = Path.Combine(root, apply ? "uninstall-report.json" : "uninstall-preview.json"); NoLinks(reportPath);
            Dictionary<string, object> rep = new Dictionary<string, object> { {"format",1}, {"status",failures.Count == 0 ? "PASS" : "PARTIAL"}, {"applied",apply}, {"root",root}, {"removed",removed}, {"preservedChangedFiles",preserved}, {"failures",failures}, {"preservedData",new string[] {"config", "projetos", "gravacoes", "diagnosticos", "logs", "arquivos novos/alterados e mídia do usuário", "desinstalador e recibos"}}, {"appStarted",false}, {"createdAt",DateTime.UtcNow.ToString("o")} };
            File.WriteAllText(IOPath(reportPath), json.Serialize(rep), new UTF8Encoding(false));
            if (report != null) report("Concluído!", 100);
            return failures.Count == 0 ? 0 : 2;
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
        internal static Dictionary<string, object> ReadObject(string path) { NoLinks(path); FileInfo file = new FileInfo(IOPath(path)); if (!file.Exists || file.Length > 16 * 1024 * 1024) throw new Exception("Recibo ausente ou excessivo."); return Serializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(IOPath(path), Encoding.UTF8)); }
        internal static bool ValidHash(string hash) { return hash != null && System.Text.RegularExpressions.Regex.IsMatch(hash, "^[a-f0-9]{64}$"); }
        internal static bool OwnedPath(string name) {
            if (String.IsNullOrWhiteSpace(name) || name.Length > 512 || name.IndexOf('\\') >= 0 || name.StartsWith("/") || name.Split('/').Length > 30) return false;
            foreach (string part in name.Split('/')) if (part.Length == 0 || part == "." || part == ".." || System.Text.RegularExpressions.Regex.IsMatch(part, "[<>:\"|?*\\x00-\\x1f]") || part.EndsWith(".") || part.EndsWith(" ") || System.Text.RegularExpressions.Regex.IsMatch(part, "^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return false;
            string lower = name.ToLowerInvariant();
            if (lower == "painel/local.js" || lower.StartsWith("painel/gc/biblioteca/") || lower == "manifest.json" || lower == "manifest.sig" || lower == "hashes.json" || lower == "version.json" || lower == "installation.json" || lower == "installer-setup.json" || lower.StartsWith("uninstall") || lower.StartsWith("desinstalar")) return false;
            if (name.IndexOf('/') < 0) return lower.EndsWith(".cmd") || lower.EndsWith(".md") || lower == "package.json" || lower == "package-lock.json" || lower == "componentes.json" || lower == "portable_mode.txt" || lower == "update-public.pem";
            foreach (string prefix in new string[] { "assets/", "bin/", "data/", "docs/", "ferramentas/", "licenses/", "node_modules/", "obs-plugins/", "painel/", "runtime/", "firmware/", "extensao-social/" }) if (lower.StartsWith(prefix, StringComparison.Ordinal)) return true;
            return false;
        }
        internal static bool OfficialShortcut(string path) { string full = Path.GetFullPath(path); foreach (string folder in new string[] { Environment.GetFolderPath(Environment.SpecialFolder.Programs), Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory) }) if (String.Equals(Path.GetDirectoryName(full), Path.GetFullPath(folder), StringComparison.OrdinalIgnoreCase) && Path.GetFileName(full).StartsWith("3Mix Studio", StringComparison.Ordinal) && full.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)) return true; return false; }
        internal static string Hash(string path) { using (FileStream file = File.OpenRead(IOPath(path))) using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant(); }
        internal static void NoLinks(string path) { for (string p = Path.GetFullPath(path); !String.IsNullOrEmpty(p); p = Path.GetDirectoryName(p)) { try { if ((File.GetAttributes(IOPath(p)) & FileAttributes.ReparsePoint) != 0) throw new Exception("Link ou junção recusado."); } catch (FileNotFoundException) { } catch (DirectoryNotFoundException) { } if (String.Equals(p, Path.GetPathRoot(p), StringComparison.OrdinalIgnoreCase)) break; } }
        static void CheckClosed(string root) {
            foreach (Process process in Process.GetProcessesByName("3Mix")) using (process) try { if (String.Equals(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(process.MainModule.FileName))), root, StringComparison.OrdinalIgnoreCase)) throw new Exception("Feche o 3Mix desta instalação antes de desinstalar."); } catch (System.ComponentModel.Win32Exception) { }
            foreach (Process process in Process.GetProcessesByName("FreeMix")) using (process) try { if (String.Equals(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(process.MainModule.FileName))), root, StringComparison.OrdinalIgnoreCase)) throw new Exception("Feche o 3Mix desta instalação antes de desinstalar."); } catch (System.ComponentModel.Win32Exception) { }
            Dictionary<string, object> receipt = ReadObject(Path.Combine(root, "installation.json"));
            foreach (string field in new string[] { "apiPort", "wsPort" }) { int port = Convert.ToInt32(receipt[field]); if (port < 1 || port > 65535) throw new Exception("Portas inválidas no recibo."); TcpListener listener = new TcpListener(IPAddress.Loopback, port); try { listener.Server.ExclusiveAddressUse = true; listener.Start(); } catch (SocketException) { throw new Exception("A instalação ou uma de suas portas está em uso. Feche suas janelas antes de desinstalar."); } finally { listener.Stop(); } }
        }
    }

    // Formulário Gráfico Moderno Broadcast Dark de Desinstalação
    internal sealed class UninstallWizardForm : Form {
        readonly string root;
        public int ExitCode = 1;
        readonly Panel panelConfirm, panelProgress, panelDone;
        readonly Label progressLabel;
        readonly ProgressBar progressBar;
        readonly Label doneTitle, doneDesc;
        readonly Button btnAction, btnCancel;

        static readonly Color BgDark = Color.FromArgb(24, 26, 32);
        static readonly Color HeaderBg = Color.FromArgb(16, 18, 24);
        static readonly Color CardBg = Color.FromArgb(30, 34, 44);
        static readonly Color BorderColor = Color.FromArgb(48, 54, 70);
        static readonly Color TextWhite = Color.FromArgb(245, 247, 250);
        static readonly Color TextMuted = Color.FromArgb(160, 170, 185);
        static readonly Color AccentDanger = Color.FromArgb(220, 38, 38);
        static readonly Color AccentGreen = Color.FromArgb(16, 185, 129);

        public UninstallWizardForm(string rootPath) {
            root = rootPath;
            Text = "Desinstalar 3Mix Studio";
            try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }
            ClientSize = new Size(650, 480);
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 10); BackColor = BgDark; ForeColor = TextWhite;

            // Topbar com Logo
            Panel header = new Panel { Location = new Point(0, 0), Size = new Size(650, 70), BackColor = HeaderBg };
            PictureBox logo = new PictureBox { Location = new Point(24, 14), Size = new Size(150, 42), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent };
            Image img = LoadLogo();
            if (img != null) logo.Image = img;
            else {
                Label brand = new Label { Text = "3MIX STUDIO", Font = new Font("Segoe UI", 15, FontStyle.Bold), ForeColor = AccentDanger, Location = new Point(24, 20), AutoSize = true };
                header.Controls.Add(brand);
            }
            header.Controls.Add(logo);

            Label title = new Label { Text = "Assistente de Desinstalação", Font = new Font("Segoe UI", 13, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(200, 22), Size = new Size(420, 26), TextAlign = ContentAlignment.MiddleRight };
            header.Controls.Add(title);

            Panel headerBorder = new Panel { Location = new Point(0, 68), Size = new Size(650, 2), BackColor = BorderColor };
            header.Controls.Add(headerBorder);

            // Container Central
            Panel container = new Panel { Location = new Point(24, 85), Size = new Size(602, 315), BackColor = Color.Transparent };

            // Painel 1: Confirmação
            panelConfirm = new Panel { Location = new Point(0, 0), Size = container.Size, Visible = true };
            panelConfirm.Controls.Add(new Label { Text = "Tem certeza de que deseja desinstalar o 3Mix Studio?", Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 6), AutoSize = true });

            Panel pathCard = new Panel { Location = new Point(0, 42), Size = new Size(602, 50), BackColor = CardBg };
            pathCard.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, pathCard.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };
            pathCard.Controls.Add(new Label { Text = "Pasta da instalação:  " + root, Font = new Font("Segoe UI", 9.5f), ForeColor = TextMuted, Location = new Point(14, 15), Size = new Size(570, 22) });
            panelConfirm.Controls.Add(pathCard);

            Panel safetyCard = new Panel { Location = new Point(0, 102), Size = new Size(602, 200), BackColor = CardBg };
            safetyCard.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, safetyCard.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };

            Label safeTitle = new Label { Text = "Garantia de Preservação dos Seus Dados:", Font = new Font("Segoe UI", 11, FontStyle.Bold), ForeColor = AccentGreen, Location = new Point(16, 14), AutoSize = true };
            Label safeList = new Label {
                Text = "✔ Seus projetos de produção e cenários (.fmx) permanecem intactos\\n" +
                       "✔ Todas as suas gravações de vídeo e replays são preservados\\n" +
                       "✔ Suas mídias, gráficos e assets de usuário NÃO são apagados\\n" +
                       "✔ Configurações locais, logs forenses e diagnósticos são mantidos\\n\\n" +
                       "Somente os binários e DLLs originais do 3Mix e seus atalhos serão removidos.",
                Font = new Font("Segoe UI", 9.5f), ForeColor = TextWhite, Location = new Point(16, 42), Size = new Size(570, 145)
            };
            safetyCard.Controls.AddRange(new Control[] { safeTitle, safeList });
            panelConfirm.Controls.Add(safetyCard);

            // Painel 2: Progresso
            panelProgress = new Panel { Location = new Point(0, 0), Size = container.Size, Visible = false };
            panelProgress.Controls.Add(new Label { Text = "Desinstalando o 3Mix Studio…", Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 30), AutoSize = true });
            progressLabel = new Label { Text = "Verificando arquivos da instalação…", Font = new Font("Segoe UI", 10.5f), ForeColor = TextMuted, Location = new Point(0, 80), Size = new Size(602, 30) };
            progressBar = new ProgressBar { Location = new Point(0, 120), Size = new Size(602, 22), Minimum = 0, Maximum = 100 };
            panelProgress.Controls.AddRange(new Control[] { progressLabel, progressBar });

            // Painel 3: Conclusão
            panelDone = new Panel { Location = new Point(0, 0), Size = container.Size, Visible = false };
            doneTitle = new Label { Text = "Desinstalação Concluída!", Font = new Font("Segoe UI", 15, FontStyle.Bold), ForeColor = AccentGreen, Location = new Point(0, 20), AutoSize = true };
            doneDesc = new Label { Text = "Os binários do 3Mix Studio foram removidos com sucesso.\n\nSeus dados de projetos, vídeos e configurações foram mantidos na pasta:\n" + root, Font = new Font("Segoe UI", 10.5f), ForeColor = TextWhite, Location = new Point(0, 70), Size = new Size(602, 140) };
            panelDone.Controls.AddRange(new Control[] { doneTitle, doneDesc });

            container.Controls.AddRange(new Control[] { panelConfirm, panelProgress, panelDone });

            // Rodapé com botões
            Panel footer = new Panel { Location = new Point(0, 410), Size = new Size(650, 70), BackColor = HeaderBg };
            Panel footerBorder = new Panel { Location = new Point(0, 0), Size = new Size(650, 1), BackColor = BorderColor };
            footer.Controls.Add(footerBorder);

            btnCancel = new Button {
                Text = "Cancelar", Location = new Point(24, 18), Size = new Size(110, 34),
                FlatStyle = FlatStyle.Flat, BackColor = CardBg, ForeColor = TextWhite,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), Cursor = Cursors.Hand
            };
            btnCancel.FlatAppearance.BorderColor = BorderColor;
            btnCancel.Click += delegate { ExitCode = 0; Close(); };

            btnAction = new Button {
                Text = "Desinstalar Agora", Location = new Point(486, 18), Size = new Size(140, 34),
                FlatStyle = FlatStyle.Flat, BackColor = AccentDanger, ForeColor = Color.White,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), Cursor = Cursors.Hand
            };
            btnAction.FlatAppearance.BorderSize = 0;
            btnAction.Click += async delegate { await StartUninstall(); };

            footer.Controls.AddRange(new Control[] { btnCancel, btnAction });
            Controls.AddRange(new Control[] { header, container, footer });
        }

        static Image LoadLogo() {
            try {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("FreeMixUninstall.logo.png")) {
                    if (s != null) return Image.FromStream(s);
                }
            } catch { }
            return null;
        }

        async Task StartUninstall() {
            panelConfirm.Visible = false;
            panelProgress.Visible = true;
            btnCancel.Visible = false;
            btnAction.Visible = false;

            int res = await Task.Run(delegate {
                return Program.ExecuteUninstall(root, true, false, delegate(string msg, int pct) {
                    if (IsHandleCreated) BeginInvoke((Action)delegate {
                        progressLabel.Text = msg;
                        progressBar.Value = Math.Max(0, Math.Min(100, pct));
                    });
                });
            });

            ExitCode = res;
            panelProgress.Visible = false;
            panelDone.Visible = true;
            btnAction.Text = "Fechar";
            btnAction.BackColor = Color.FromArgb(0, 122, 255);
            btnAction.Visible = true;
            btnAction.Click += delegate { Close(); };

            if (res != 0) {
                doneTitle.Text = "Desinstalação Parcial";
                doneTitle.ForeColor = Color.FromArgb(245, 158, 11);
                doneDesc.Text = "Alguns arquivos estavam bloqueados pelo Windows ou em uso.\nOs arquivos livres foram removidos e o recibo de desinstalação foi atualizado.";
            }
        }
    }
}
