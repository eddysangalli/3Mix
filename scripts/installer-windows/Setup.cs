using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace FreeMixSetup {
    internal sealed class Options {
        public bool Silent, Verify, NoShortcuts, PrereqDryRun;
        public string Destination, Log, ImportProject, ProjectName;
        public int ApiPort, WsPort;
        // Módulos desligados no passo MÓDULOS do wizard (ou via --disable-module=ID
        // repetível no modo silencioso). Ausente/vazio = todos os módulos ativos,
        // comportamento idêntico ao instalador antes deste wizard existir.
        public HashSet<string> DisabledModules = new HashSet<string>();
        public static Options Parse(string[] args) {
            Options o = new Options(); HashSet<string> seen = new HashSet<string>();
            foreach (string arg in args) {
                int separator = arg.IndexOf('=');
                string key = separator < 0 ? arg : arg.Substring(0, separator);
                string value = separator < 0 ? null : arg.Substring(separator + 1);
                if (key != "--disable-module" && !seen.Add(key)) throw new Exception("Argumento duplicado: " + key);
                if (key == "--silent" && value == null) o.Silent = true;
                else if (key == "--verify" && value == null) o.Verify = true;
                else if (key == "--no-shortcuts" && value == null) o.NoShortcuts = true;
                else if (key == "--prereq-dry-run" && value == null) o.PrereqDryRun = true;
                else if (key == "--dest" && !String.IsNullOrWhiteSpace(value)) o.Destination = value;
                else if (key == "--log" && !String.IsNullOrWhiteSpace(value)) o.Log = value;
                else if (key == "--import-project" && !String.IsNullOrWhiteSpace(value)) o.ImportProject = value;
                else if (key == "--project-name" && !String.IsNullOrWhiteSpace(value)) o.ProjectName = value;
                else if (key == "--api-port") o.ApiPort = ParsePort(value);
                else if (key == "--ws-port") o.WsPort = ParsePort(value);
                else if (key == "--disable-module" && !String.IsNullOrWhiteSpace(value)) { if (!ModuleCatalog.Ids.Contains(value)) throw new Exception("Módulo desconhecido: " + value); o.DisabledModules.Add(value); }
                else throw new Exception("Argumento desconhecido ou vazio: " + key);
            }
            if (o.ApiPort != 0 && o.ApiPort == o.WsPort) throw new Exception("As portas devem ser diferentes.");
            return o;
        }
        static int ParsePort(string value) { int p; if (!Int32.TryParse(value, out p) || p < 1 || p > 65535) throw new Exception("Porta inválida."); return p; }
    }

    internal static class Program {
        [STAThread]
        static int Main(string[] args) {
            // Canonical guards stay unprefixed; managed I/O uses explicit extended paths below.
            AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling", false);
            AppContext.SetSwitch("Switch.System.IO.BlockLongPaths", false);
            try {
                Options options = Options.Parse(args);
                if (options.Silent || options.Verify) {
                    if (!options.Verify && String.IsNullOrWhiteSpace(options.Destination)) throw new Exception("O modo silencioso exige --dest=PASTA_NOVA.");
                    int silentResult = Installer.Run(options, delegate(string message, int percent) { });
                    if (silentResult == 0 && !options.Verify) { try { WizardForm.WriteModulesFile(Path.GetFullPath(options.Destination), options.DisabledModules); } catch (Exception e) { Installer.LastError = "A instalação principal foi concluída, mas a gravação da seleção de módulos falhou: " + e.Message; return 1; } }
                    return silentResult;
                }
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new WizardForm(options)); return 0;
            } catch (Exception e) {
                string log = Path.Combine(Path.GetTempPath(), "3Mix-setup-error-" + Guid.NewGuid().ToString("N") + ".log");
                File.WriteAllText(FreeMixUninstall.Program.IOPath(log), e.Message, Encoding.UTF8);
                if (Array.IndexOf(args, "--silent") < 0 && Array.IndexOf(args, "--verify") < 0) MessageBox.Show(e.Message + "\n\nRegistro: " + log, "3Mix Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }

    // Catálogo dos 9 módulos opcionais em standby, espelhando
    // FreeMix/ferramentas/modulos-config.mjs (MODULOS_DEFINICAO) — mesmos IDs, mesma
    // ordem, mesmo texto em linguagem de operador. Mudar um lado sem o outro é um erro;
    // os IDs em especial têm que bater byte a byte com o que o painel já lê/grava em
    // config/modulos-ativos.json.
    internal static class ModuleCatalog {
        internal struct Item { public string Id, Label, Description; public Item(string id, string label, string description) { Id = id; Label = label; Description = description; } }
        internal static readonly Item[] All = new Item[] {
            new Item("replay", "Replay", "Replay com marcação IN/OUT e volta ao vivo. Desligado, o motor deixa de ser consultado todo segundo pelo ticker de status."),
            new Item("rundown", "Rundown", "Roteiro de produção em blocos e passos. Desligado, some o botão Roteiro e a tela correspondente."),
            new Item("calls", "Calls e Retornos N-1", "Chamada de vídeo com retorno mix-minus para repórteres e convidados. Desligado, somem as telas de Calls e Retornos SRT/N-1."),
            new Item("multiview", "Multiview", "Grade com todas as câmeras numa tela só. Desligado, o resumo de multiview deixa de ser calculado e enviado a cada atualização de estado."),
            new Item("iso", "ISO (multigravação por entrada)", "Gravação isolada de cada entrada. Desligado, o motor deixa de ser consultado todo segundo pelo ticker de status."),
            new Item("dataSources", "Fontes de Dados", "Planilhas e feeds externos ligados a títulos e placares. Desligado, nenhuma consulta HTTP de fonte de dados roda em segundo plano."),
            new Item("srtHdr", "SRT/NDI avançado (HDR)", "Transmissão HDR (PQ/HLG) sobre SRT/OMT/NDI. Desligado, some a complexidade de seleção de encoder HEVC e transferência HDR."),
            new Item("blackbox", "Caixa-Preta de Incidentes", "Registro forense dos últimos 60 segundos antes de uma falha. Desligado, some o botão/tela; nenhuma telemetria extra é retida."),
            new Item("broadcastDelay", "Broadcast Delay", "Atraso de segurança com corte imediato (DUMP) para censura ao vivo. Desligado, nenhum buffer de pacotes é mantido.")
        };
        internal static readonly HashSet<string> Ids = new HashSet<string>(Array.ConvertAll(All, i => i.Id));
    }

    // Wizard de 6 passos (Bem-vindo, EULA, Destino, MÓDULOS, Progresso, Conclusão) —
    // Estilo Moderno Broadcast Dark Grafite 3Mix Studio
    internal sealed class WizardForm : Form {
        readonly Options options;
        readonly Panel[] steps; readonly Button back, next; readonly Label stepTitle;
        readonly PictureBox headerLogo;
        int current; bool running;
        // Passo Destino
        TextBox folder, project; CheckBox importProject;
        // Passo MÓDULOS
        readonly Dictionary<string, CheckBox> moduleChecks = new Dictionary<string, CheckBox>();
        // Passo Progresso/Conclusão
        Label progressStatus; ProgressBar progressBar; Label doneMessage;

        // Paleta Visual Canônica 3Mix Dark Broadcast
        static readonly Color BgDark = Color.FromArgb(24, 26, 32);
        static readonly Color HeaderBg = Color.FromArgb(16, 18, 24);
        static readonly Color CardBg = Color.FromArgb(30, 34, 44);
        static readonly Color BorderColor = Color.FromArgb(48, 54, 70);
        static readonly Color TextWhite = Color.FromArgb(245, 247, 250);
        static readonly Color TextMuted = Color.FromArgb(160, 170, 185);
        static readonly Color AccentBlue = Color.FromArgb(0, 122, 255);
        static readonly Color InputBg = Color.FromArgb(32, 36, 48);

        public WizardForm(Options o) {
            options = o; Text = "Instalador 3Mix Studio — " + PayloadInfo.DisplayVersion;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
            ClientSize = new Size(720, 520); FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 10); BackColor = BgDark; ForeColor = TextWhite;

            // Header Superior Broadcast
            Panel header = new Panel { Location = new Point(0, 0), Size = new Size(720, 72), BackColor = HeaderBg };
            headerLogo = new PictureBox { Location = new Point(24, 14), Size = new Size(160, 44), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent };
            Image logo = LoadEmbeddedLogo();
            if (logo != null) headerLogo.Image = logo;
            else {
                Label brand = new Label { Text = "3MIX STUDIO", Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = AccentBlue, Location = new Point(24, 18), AutoSize = true };
                header.Controls.Add(brand);
            }
            header.Controls.Add(headerLogo);

            stepTitle = new Label { Font = new Font("Segoe UI", 13, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(220, 24), Size = new Size(476, 28), TextAlign = ContentAlignment.MiddleRight };
            header.Controls.Add(stepTitle);

            // Linha de acento ciano/azul neon no rodapé do header
            Panel headerAccent = new Panel { Location = new Point(0, 70), Size = new Size(720, 2), BackColor = AccentBlue };
            header.Controls.Add(headerAccent);

            // Área Central de Conteúdo
            Panel body = new Panel { Location = new Point(32, 88), Size = new Size(656, 355), BackColor = Color.Transparent };

            // Rodapé com botões de navegação
            Panel footer = new Panel { Location = new Point(0, 458), Size = new Size(720, 62), BackColor = HeaderBg };
            Panel footerBorder = new Panel { Location = new Point(0, 0), Size = new Size(720, 1), BackColor = BorderColor };
            footer.Controls.Add(footerBorder);

            back = new Button {
                Text = "< Voltar", Location = new Point(32, 14), Size = new Size(110, 34),
                FlatStyle = FlatStyle.Flat, BackColor = CardBg, ForeColor = TextWhite,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), Cursor = Cursors.Hand
            };
            back.FlatAppearance.BorderColor = BorderColor;
            back.Click += delegate { Navigate(current - 1); };

            next = new Button {
                Text = "Avançar >", Location = new Point(578, 14), Size = new Size(110, 34),
                FlatStyle = FlatStyle.Flat, BackColor = AccentBlue, ForeColor = Color.White,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), Cursor = Cursors.Hand
            };
            next.FlatAppearance.BorderSize = 0;
            next.Click += delegate { NextClicked(); };

            footer.Controls.AddRange(new Control[] { back, next });
            Controls.AddRange(new Control[] { header, body, footer });

            steps = new Panel[] { StepWelcome(), StepEula(), StepPreparation(), StepDestination(o), StepModules(o), StepReview(), StepProgress(), StepDone() };
            foreach (Panel step in steps) { step.Location = new Point(0, 0); step.Size = body.Size; step.Visible = false; body.Controls.Add(step); }
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (running) e.Cancel = true; };
            Navigate(0);
        }

        static Image LoadEmbeddedLogo() {
            try {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("FreeMixSetup.logo.png")) {
                    if (s != null) return Image.FromStream(s);
                }
            } catch { }
            return null;
        }

        Panel StepWelcome() {
            Panel p = new Panel();
            p.Controls.Add(new Label { Text = "Bem-vindo ao 3Mix Studio " + PayloadInfo.DisplayVersion, Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 6), AutoSize = true });
            
            Panel card = new Panel { Location = new Point(0, 46), Size = new Size(656, 120), BackColor = CardBg };
            card.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, card.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };
            
            Label desc = new Label {
                Text = "O 3Mix Studio é uma suíte broadcast de produção ao vivo profissional.\n\n" +
                       "• Instalação offline completa e limpa, exclusiva para este usuário do Windows.\n" +
                       "• Você escolhe os módulos ativos agora e pode ajustá-los quando quiser.\n" +
                       "• Seus projetos, mídias, gravações e configurações futuras serão sempre preservados.",
                Font = new Font("Segoe UI", 10f), ForeColor = TextWhite, Location = new Point(16, 16), Size = new Size(624, 88)
            };
            card.Controls.Add(desc);
            p.Controls.Add(card);

            Panel featureCard = new Panel { Location = new Point(0, 180), Size = new Size(656, 160), BackColor = CardBg };
            featureCard.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, featureCard.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };
            
            Label featTitle = new Label { Text = "Recursos Integrados Nesta Versão:", Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = AccentBlue, Location = new Point(16, 12), AutoSize = true };
            Label featList = new Label {
                Text = "✔ Mesa de corte de baixa latência com transições broadcast e DSKs 1 a 4\n" +
                       "✔ 3Mix Chroma profissional com visualizador alfa e Estúdio Virtual 2.5D (FreeD)\n" +
                       "✔ 3Mix Social integrado (moderação de chat YouTube/Twitch em tempo real)\n" +
                       "✔ 3Mix Crew: Tally Web, Intercom móvel e firmware para ESP32/M5StickC\n" +
                       "✔ MultiCorder Broadcast: gravação concorrente em Sony XDCAM, Avid DNxHD/DNxHR e ProRes",
                Font = new Font("Segoe UI", 9.5f), ForeColor = TextMuted, Location = new Point(16, 38), Size = new Size(624, 110)
            };
            featureCard.Controls.AddRange(new Control[] { featTitle, featList });
            p.Controls.Add(featureCard);

            return p;
        }

        Panel StepEula() {
            Panel p = new Panel();
            p.Controls.Add(new Label { Text = "Termos de Uso e Licenciamento", Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 0), AutoSize = true });
            p.Controls.Add(new Label { Text = "Leia o acordo de licenciamento e condições de teste do 3Mix Studio antes de prosseguir:", Font = new Font("Segoe UI", 9.5f), ForeColor = TextMuted, Location = new Point(0, 26), AutoSize = true });

            TextBox eulaText = new TextBox {
                Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical,
                Location = new Point(0, 54), Size = new Size(656, 255),
                Font = new Font("Consolas", 9.5f), BackColor = InputBg, ForeColor = TextWhite,
                BorderStyle = BorderStyle.FixedSingle, Text = EulaText.Replace("\n", "\r\n")
            };
            p.Controls.Add(eulaText);

            CheckBox accept = new CheckBox {
                Name = "accept", Text = "Li e concordo com os termos de uso e condições desta versão do 3Mix Studio",
                Location = new Point(0, 320), Size = new Size(656, 26), ForeColor = TextWhite,
                Font = new Font("Segoe UI", 10f, FontStyle.Bold), Cursor = Cursors.Hand
            };
            accept.CheckedChanged += delegate { UpdateNextEnabled(); };
            p.Controls.Add(accept);
            return p;
        }

        // Lido uma vez e reaproveitado tanto no texto desta etapa quanto no resumo da
        // etapa Revisão, para as duas telas nunca divergirem sobre o que foi detectado.
        internal struct SystemCheck { public bool Ok; public string Label; public string Detail; }
        internal static List<SystemCheck> RunSystemChecks() {
            List<SystemCheck> checks = new List<SystemCheck>();
            bool is64 = Environment.Is64BitOperatingSystem;
            checks.Add(new SystemCheck { Ok = is64, Label = "Windows de 64 bits", Detail = Environment.OSVersion.VersionString + (is64 ? "" : " — o 3Mix Studio exige Windows x64") });
            long ramBytes = 0;
            try { ramBytes = (long)new Microsoft.VisualBasic.Devices.ComputerInfo().TotalPhysicalMemory; } catch { }
            double ramGb = ramBytes / 1073741824.0;
            bool ramOk = ramBytes == 0 || ramGb >= 8;
            checks.Add(new SystemCheck { Ok = ramOk, Label = "Memória RAM", Detail = ramBytes == 0 ? "Não foi possível consultar a memória instalada; prosseguindo sem bloquear." : ramGb.ToString("0.0", CultureInfo.InvariantCulture) + " GB" + (ramOk ? "" : " — recomendado 8 GB ou mais para produção ao vivo") });
            int cores = Environment.ProcessorCount;
            bool coresOk = cores >= 4;
            checks.Add(new SystemCheck { Ok = coresOk, Label = "Processador", Detail = cores + " threads lógicas" + (coresOk ? "" : " — recomendado 4 ou mais para codificação em tempo real") });
            string gpu = null;
            try {
                using (RegistryKey classKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}")) {
                    if (classKey != null) foreach (string sub in classKey.GetSubKeyNames()) {
                        using (RegistryKey adapterKey = classKey.OpenSubKey(sub)) {
                            object desc = adapterKey == null ? null : adapterKey.GetValue("DriverDesc");
                            if (desc != null) { gpu = desc.ToString(); break; }
                        }
                    }
                }
            } catch { }
            // GPU is informational only: a 3Mix module not finding a specific vendor feature
            // at runtime is a better gate than this installer guessing compatibility upfront.
            checks.Add(new SystemCheck { Ok = true, Label = "Placa de vídeo", Detail = gpu ?? "Não identificada pelo Windows nesta leitura; a instalação prossegue normalmente." });
            return checks;
        }

        Panel StepPreparation() {
            Panel p = new Panel();
            p.Controls.Add(new Label { Text = "Preparação do Sistema", Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 0), AutoSize = true });
            p.Controls.Add(new Label { Text = "Conferindo os requisitos desta máquina antes de prosseguir. Nenhum arquivo é alterado nesta etapa.", Font = new Font("Segoe UI", 9.5f), ForeColor = TextMuted, Location = new Point(0, 26), Size = new Size(656, 22) });

            Panel card = new Panel { Location = new Point(0, 56), Size = new Size(656, 230), BackColor = CardBg, AutoScroll = true };
            card.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, card.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };

            int y = 14; bool anyBlocking = false;
            foreach (SystemCheck check in RunSystemChecks()) {
                Label mark = new Label { Text = check.Ok ? "✔" : "⚠", Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = check.Ok ? Color.FromArgb(70, 200, 120) : Color.FromArgb(230, 170, 60), Location = new Point(14, y), Size = new Size(24, 22) };
                Label label = new Label { Text = check.Label, Font = new Font("Segoe UI", 10f, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(44, y), Size = new Size(200, 22) };
                Label detail = new Label { Text = check.Detail, Font = new Font("Segoe UI", 9f), ForeColor = TextMuted, Location = new Point(44, y + 20), Size = new Size(596, 20) };
                card.Controls.AddRange(new Control[] { mark, label, detail });
                y += 46;
                if (!check.Ok && check.Label == "Windows de 64 bits") anyBlocking = true;
            }
            p.Controls.Add(card);

            Label note = new Label {
                Text = anyBlocking
                    ? "O 3Mix Studio exige Windows 64 bits e não pode ser instalado nesta máquina."
                    : "Os demais avisos, se houver, são recomendações — a instalação pode prosseguir normalmente.",
                Location = new Point(0, 296), Size = new Size(656, 36), Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = anyBlocking ? Color.FromArgb(230, 90, 90) : TextMuted
            };
            p.Controls.Add(note);
            p.Tag = anyBlocking;
            return p;
        }

        Panel StepDestination(Options o) {
            Panel p = new Panel();
            p.Controls.Add(new Label { Text = "Pasta de Destino da Instalação", Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 0), AutoSize = true });
            p.Controls.Add(new Label { Text = "Escolha uma pasta nova ou completamente vazia para os arquivos do 3Mix Studio.", Font = new Font("Segoe UI", 9.5f), ForeColor = TextMuted, Location = new Point(0, 26), Size = new Size(656, 22) });

            folder = new TextBox {
                Text = o.Destination ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "3Mix Studio"),
                Location = new Point(0, 56), Size = new Size(528, 30), BackColor = InputBg, ForeColor = TextWhite,
                BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 10.5f)
            };
            Button browse = new Button {
                Text = "Procurar…", Location = new Point(538, 54), Size = new Size(118, 32),
                FlatStyle = FlatStyle.Flat, BackColor = CardBg, ForeColor = TextWhite,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), Cursor = Cursors.Hand
            };
            browse.FlatAppearance.BorderColor = BorderColor;
            browse.Click += delegate {
                using (FolderBrowserDialog picker = new FolderBrowserDialog()) {
                    picker.Description = "Selecione uma pasta nova ou vazia para o 3Mix Studio";
                    picker.ShowNewFolderButton = true;
                    TryPreselectPicker(folder.Text, delegate(string value) { picker.SelectedPath = value; });
                    if (picker.ShowDialog(this) == DialogResult.OK) folder.Text = picker.SelectedPath;
                }
            };
            p.Controls.Add(folder); p.Controls.Add(browse);

            Panel importCard = new Panel { Location = new Point(0, 105), Size = new Size(656, 122), BackColor = CardBg };
            importCard.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, importCard.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };
            
            importProject = new CheckBox {
                Text = "Importar explicitamente uma produção anterior (.fmx)",
                Checked = !String.IsNullOrWhiteSpace(o.ImportProject), Location = new Point(16, 14), Size = new Size(624, 26),
                ForeColor = TextWhite, Font = new Font("Segoe UI", 10f, FontStyle.Bold), Cursor = Cursors.Hand
            };
            project = new TextBox {
                Text = o.ImportProject ?? "", Location = new Point(16, 48), Size = new Size(624, 28),
                BackColor = InputBg, ForeColor = TextWhite, BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Segoe UI", 10f), Enabled = importProject.Checked
            };
            importProject.CheckedChanged += delegate { project.Enabled = importProject.Checked; };
            
            Label importHint = new Label {
                Text = "A importação é opcional. Se não for informada, o 3Mix iniciará com uma mesa nova e limpa.",
                Font = new Font("Segoe UI", 8.5f), ForeColor = TextMuted, Location = new Point(16, 84), Size = new Size(624, 24)
            };
            importCard.Controls.AddRange(new Control[] { importProject, project, importHint });
            p.Controls.Add(importCard);

            Panel safetyCard = new Panel { Location = new Point(0, 240), Size = new Size(656, 95), BackColor = CardBg };
            safetyCard.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, safetyCard.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };
            Label safetyTitle = new Label { Text = "Garantia de Preservação e Segurança:", Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), ForeColor = AccentBlue, Location = new Point(16, 12), AutoSize = true };
            Label safetyText = new Label {
                Text = "O instalador cria atalhos oficiais e registra o desinstalador conservador.\n" +
                       "Suas credenciais e dados privados nunca são enviados para a rede nem misturados com outras versões.",
                Font = new Font("Segoe UI", 9f), ForeColor = TextMuted, Location = new Point(16, 36), Size = new Size(624, 48)
            };
            safetyCard.Controls.AddRange(new Control[] { safetyTitle, safetyText });
            p.Controls.Add(safetyCard);

            return p;
        }

        Panel StepModules(Options o) {
            Panel p = new Panel();
            p.Controls.Add(new Label { Text = "Módulos de Produção Broadcast", Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 0), AutoSize = true });
            p.Controls.Add(new Label { Text = "Selecione quais recursos deseja habilitar de fábrica. Módulos desmarcados ficam em standby sem consumir CPU/RAM.", Font = new Font("Segoe UI", 9f), ForeColor = TextMuted, Location = new Point(0, 24), Size = new Size(656, 20) });

            Button all = new Button { Text = "Marcar Todos", Location = new Point(0, 48), Size = new Size(130, 28), FlatStyle = FlatStyle.Flat, BackColor = CardBg, ForeColor = TextWhite, Font = new Font("Segoe UI", 9f, FontStyle.Bold), Cursor = Cursors.Hand };
            all.FlatAppearance.BorderColor = BorderColor;
            all.Click += delegate { foreach (CheckBox c in moduleChecks.Values) c.Checked = true; };

            Button none = new Button { Text = "Configuração Mínima", Location = new Point(138, 48), Size = new Size(160, 28), FlatStyle = FlatStyle.Flat, BackColor = CardBg, ForeColor = TextWhite, Font = new Font("Segoe UI", 9f, FontStyle.Bold), Cursor = Cursors.Hand };
            none.FlatAppearance.BorderColor = BorderColor;
            none.Click += delegate { foreach (CheckBox c in moduleChecks.Values) c.Checked = false; };

            p.Controls.Add(all); p.Controls.Add(none);

            Panel listPanel = new Panel {
                Location = new Point(0, 84), Size = new Size(656, 225),
                AutoScroll = true, BackColor = CardBg
            };
            listPanel.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, listPanel.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };

            int y = 8;
            foreach (ModuleCatalog.Item item in ModuleCatalog.All) {
                CheckBox box = new CheckBox {
                    Text = item.Label, Checked = !o.DisabledModules.Contains(item.Id),
                    Location = new Point(14, y), Size = new Size(240, 24),
                    Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), ForeColor = TextWhite, Cursor = Cursors.Hand
                };
                Label desc = new Label {
                    Text = item.Description, Location = new Point(260, y + 2),
                    Size = new Size(365, 34), Font = new Font("Segoe UI", 8.5f), ForeColor = TextMuted
                };
                moduleChecks[item.Id] = box;
                listPanel.Controls.Add(box); listPanel.Controls.Add(desc);
                y += 38;
            }
            p.Controls.Add(listPanel);

            Label note = new Label {
                Text = "Nota: Corte principal, transições, DSKs, mixer de áudio e gravação essencial estão sempre ativos.\n" +
                       "Você pode reconfigurar os módulos opcionais a qualquer momento em Configurações → Módulos.",
                Location = new Point(0, 314), Size = new Size(656, 34), Font = new Font("Segoe UI", 8.5f), ForeColor = TextMuted
            };
            p.Controls.Add(note);
            return p;
        }

        Label reviewBody;
        Panel StepReview() {
            Panel p = new Panel();
            p.Controls.Add(new Label { Text = "Revisão Antes de Instalar", Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 0), AutoSize = true });
            p.Controls.Add(new Label { Text = "Confira as escolhas abaixo. Nada é instalado até você clicar em Instalar Agora.", Font = new Font("Segoe UI", 9.5f), ForeColor = TextMuted, Location = new Point(0, 26), Size = new Size(656, 22) });

            Panel card = new Panel { Location = new Point(0, 56), Size = new Size(656, 290), BackColor = CardBg };
            card.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, card.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };
            reviewBody = new Label { Location = new Point(16, 14), Size = new Size(624, 262), Font = new Font("Segoe UI", 10f), ForeColor = TextWhite };
            card.Controls.Add(reviewBody);
            p.Controls.Add(card);
            return p;
        }
        // Chamado ao entrar na etapa Revisão (Navigate), nunca na construção do passo: precisa
        // refletir a pasta de destino e os módulos como estavam na última vez que o operador
        // passou pelas etapas anteriores, não o que havia quando o wizard abriu.
        void RefreshReview() {
            if (reviewBody == null) return;
            // PayloadInfo.Length is the exact byte size of the signed ZIP embedded in this
            // executable by build.mjs, not an estimate — more reliable than guessing before
            // extraction, and it's what CheckSpace already gates the real install against.
            int disabledCount = 0; foreach (KeyValuePair<string, CheckBox> entry in moduleChecks) if (!entry.Value.Checked) disabledCount++;
            StringBuilder text = new StringBuilder();
            text.Append("Versão:  ").Append(PayloadInfo.DisplayVersion).Append("\r\n\r\n");
            text.Append("Pasta de destino:\r\n  ").Append(folder.Text).Append("\r\n\r\n");
            text.Append("Módulos:  ").Append(moduleChecks.Count - disabledCount).Append(" de ").Append(moduleChecks.Count).Append(" ativos");
            text.Append(disabledCount == 0 ? " (configuração completa)" : " (" + disabledCount + " em standby, ajustável depois)").Append("\r\n\r\n");
            if (importProject.Checked && !String.IsNullOrWhiteSpace(project.Text)) text.Append("Projeto a importar:\r\n  ").Append(project.Text).Append("\r\n\r\n");
            text.Append("Espaço necessário:  ").Append(Math.Ceiling(PayloadInfo.Length / 1073741824.0).ToString(CultureInfo.InvariantCulture)).Append(" GB (pacote compactado; a instalação descompactada ocupa mais)");
            try {
                DriveInfo drive = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(folder.Text)));
                text.Append("\r\nEspaço livre em ").Append(drive.Name).Append(":  ").Append(Math.Floor(drive.AvailableFreeSpace / 1073741824.0).ToString(CultureInfo.InvariantCulture)).Append(" GB");
            } catch { }
            reviewBody.Text = text.ToString();
        }

        Panel StepProgress() {
            Panel p = new Panel();
            p.Controls.Add(new Label { Text = "Instalando o 3Mix Studio…", Font = new Font("Segoe UI", 15, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 20), AutoSize = true });

            Panel card = new Panel { Location = new Point(0, 70), Size = new Size(656, 170), BackColor = CardBg };
            card.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, card.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };

            progressStatus = new Label { Text = "Preparando a extração do pacote broadcast…", Location = new Point(24, 28), Size = new Size(608, 38), Font = new Font("Segoe UI", 11f), ForeColor = TextWhite };
            card.Controls.Add(progressStatus);

            progressBar = new ProgressBar { Location = new Point(24, 80), Size = new Size(608, 24), Minimum = 0, Maximum = 100 };
            card.Controls.Add(progressBar);

            Label hint = new Label { Text = "Por favor, aguarde. Os binários nativos do motor e painel web estão sendo descompactados.", Location = new Point(24, 120), Size = new Size(608, 26), Font = new Font("Segoe UI", 9f), ForeColor = TextMuted };
            card.Controls.Add(hint);

            p.Controls.Add(card);
            return p;
        }

        CheckBox openNow;
        Panel StepDone() {
            Panel p = new Panel();
            p.Controls.Add(new Label { Text = "Instalação Concluída com Sucesso!", Font = new Font("Segoe UI", 16, FontStyle.Bold), ForeColor = TextWhite, Location = new Point(0, 15), AutoSize = true });

            Panel card = new Panel { Location = new Point(0, 60), Size = new Size(656, 210), BackColor = CardBg };
            card.Paint += delegate(object s, PaintEventArgs pe) { ControlPaint.DrawBorder(pe.Graphics, card.ClientRectangle, BorderColor, ButtonBorderStyle.Solid); };

            doneMessage = new Label { Location = new Point(24, 20), Size = new Size(608, 120), Font = new Font("Segoe UI", 10.5f), ForeColor = TextWhite };
            card.Controls.Add(doneMessage);

            openNow = new CheckBox {
                Text = "Iniciar o 3Mix Studio imediatamente ao fechar o assistente",
                Checked = true, Visible = false, Location = new Point(24, 155), Size = new Size(608, 30),
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), ForeColor = AccentBlue, Cursor = Cursors.Hand
            };
            card.Controls.Add(openNow);
            p.Controls.Add(card);

            return p;
        }

        // Indices into steps[]: 0 Welcome, 1 Eula, 2 Preparation, 3 Destination, 4 Modules,
        // 5 Review, 6 Progress, 7 Done. Keep every index below in sync with this order.
        void Navigate(int index) {
            if (index < 0 || index >= steps.Length) return;
            steps[current].Visible = false; current = index; steps[current].Visible = true;
            string[] titles = { "Bem-vindo", "Termos de Uso", "Preparação", "Pasta de Destino", "Módulos em Standby", "Revisão", "Instalando", "Concluído" };
            stepTitle.Text = titles[current] + "  •  Passo " + (current + 1) + " de " + steps.Length;
            back.Visible = current > 0 && current < 6;
            next.Text = current == 5 ? "Instalar Agora" : current == 7 ? "Concluir" : "Avançar >";
            next.Visible = current != 6;
            if (current == 5) RefreshReview();
            UpdateNextEnabled();
        }
        void UpdateNextEnabled() {
            if (current == 1) { CheckBox accept = (CheckBox)steps[1].Controls["accept"]; next.Enabled = accept.Checked; }
            else if (current == 2) { next.Enabled = !(bool)(steps[2].Tag ?? false); }
            else next.Enabled = true;
        }
        async void NextClicked() {
            if (current == 3) { try { Installer.ValidateDestination(folder.Text); } catch (Exception e) { MessageBox.Show(this, e.Message, "Escolha outra pasta", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; } if (importProject.Checked && String.IsNullOrWhiteSpace(project.Text)) { MessageBox.Show(this, "Informe o caminho da pasta UUID.fmx criada pela Recuperação do 3Mix.", "Projeto", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; } }
            if (current == 5) { await RunInstall(); return; }
            if (current == 7) { if (openNow.Visible && openNow.Checked) Installer.OpenInstalled(options.Destination); Close(); return; }
            Navigate(current + 1);
        }
        async Task RunInstall() {
            options.Destination = folder.Text; options.ImportProject = importProject.Checked ? project.Text : null;
            options.DisabledModules.Clear(); foreach (KeyValuePair<string, CheckBox> entry in moduleChecks) if (!entry.Value.Checked) options.DisabledModules.Add(entry.Key);
            running = true; back.Visible = false; next.Visible = false; Navigate(6);
            int result = await Task.Run(delegate { return Installer.Run(options, UpdateProgress); });
            running = false;
            if (result == 0) {
                try { WriteModulesFile(Path.GetFullPath(options.Destination), options.DisabledModules); } catch (Exception e) { result = 1; Installer.LastError = "A instalação principal foi concluída, mas a gravação da seleção de módulos falhou: " + e.Message; }
            }
            openNow.Visible = result == 0 && Installer.VcRuntimeReady();
            doneMessage.Text = result == 0 ? "O 3Mix Studio foi instalado com êxito na pasta:\n" + options.Destination + "\n\nOs atalhos foram criados na Área de Trabalho e no Menu Iniciar." + (Installer.Warning.Length > 0 ? "\n\n" + Installer.Warning : "") : "A instalação não foi concluída: " + Installer.LastError + "\n\nRegistro de diagnóstico: " + Installer.LastLog;
            Navigate(7); next.Visible = true; next.Enabled = true;
        }
        internal static void TryPreselectPicker(string value, Action<string> select) {
            // Preselection is optional; invalid text must not prevent the picker from opening.
            try { if (!String.IsNullOrWhiteSpace(value) && Directory.Exists(FreeMixUninstall.Program.IOPath(value))) select(value); } catch { }
        }
        void UpdateProgress(string text, int percent) { if (IsHandleCreated) BeginInvoke((Action)delegate { progressStatus.Text = text; progressBar.Value = Math.Max(0, Math.Min(100, percent)); }); }
        static string EulaText {
            get { using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("FreeMixSetup.EULA.txt")) { if (resource == null) return "(Termos de uso não encontrados neste instalador — ver docs/EULA.txt na entrega.)"; using (StreamReader reader = new StreamReader(resource, Encoding.UTF8)) return reader.ReadToEnd(); } }
        }
        // Mesmo formato/caminho que o painel já lê e grava via POST /api/modulos
        // (FreeMix/ferramentas/modulos-config.mjs) — config/modulos-ativos.json, schema 1,
        // todas as chaves do catálogo sempre presentes (true/false), nunca parcial.
        internal static void WriteModulesFile(string root, HashSet<string> disabled) {
            string path = Path.Combine(root, "config", "modulos-ativos.json"); Installer.NoLinks(path);
            Directory.CreateDirectory(FreeMixUninstall.Program.IOPath(Path.Combine(root, "config")));
            List<string> pairs = new List<string>();
            foreach (ModuleCatalog.Item item in ModuleCatalog.All) pairs.Add(Installer.Json(item.Id) + ":" + (disabled.Contains(item.Id) ? "false" : "true"));
            string body = "{\"schema\":1,\"modulos\":{" + String.Join(",", pairs.ToArray()) + "},\"atualizadoEm\":" + Installer.Json(DateTime.UtcNow.ToString("o")) + "}";
            string ioPath = FreeMixUninstall.Program.IOPath(path), ioTemp = ioPath + ".tmp";
            File.WriteAllText(ioTemp, body, new UTF8Encoding(false));
            if (File.Exists(ioPath)) File.Delete(ioPath);
            File.Move(ioTemp, ioPath);
        }
    }

    internal static class Installer {
        const long MaxExpanded = 30000000000L;
        public static string LastError, LastLog;
        public static int Run(Options options, Action<string, int> report) {
            string scratch = null; bool installed = false;
            try {
                LastLog = options.Log == null ? Path.Combine(Path.GetTempPath(), "3Mix-setup-" + Guid.NewGuid().ToString("N") + ".log") : Path.GetFullPath(options.Log);
                NoLinks(LastLog); if (File.Exists(FreeMixUninstall.Program.IOPath(LastLog)) || Directory.Exists(FreeMixUninstall.Program.IOPath(LastLog))) throw new Exception("O arquivo de registro já existe.");
                using (StreamWriter log = new StreamWriter(new FileStream(FreeMixUninstall.Program.IOPath(LastLog), FileMode.CreateNew, FileAccess.Write, FileShare.Read), Encoding.UTF8)) {
                    log.AutoFlush = true; log.WriteLine("3Mix Studio setup " + PayloadInfo.Version + "; " + DateTime.UtcNow.ToString("o"));
                    try {
                        if (!options.Verify) ValidateDestination(options.Destination);
                        report("Verificando a integridade do instalador…", 2);
                        string exe = Assembly.GetExecutingAssembly().Location;
                        using (FileStream file = new FileStream(FreeMixUninstall.Program.IOPath(exe), FileMode.Open, FileAccess.Read, FileShare.Read)) {
                            long start, length; ReadFooter(file, out start, out length); VerifyPayload(file, start, length, report);
                            log.WriteLine("Payload SHA-256 verified: " + PayloadInfo.Sha256);
                            using (RangeStream range = new RangeStream(file, start, length)) using (ZipArchive zip = new ZipArchive(range, ZipArchiveMode.Read, true)) {
                                long expanded = ValidateZip(zip); log.WriteLine("ZIP validated; entries=" + zip.Entries.Count + "; expandedBytes=" + expanded);
                                if (options.Verify) { report("Integridade verificada.", 100); log.WriteLine("VERIFY PASS; installed=false; appStarted=false; firewallApplied=false"); return 0; }
                                string destination = Path.GetFullPath(options.Destination);
                                CheckSpace(Path.GetTempPath(), expanded + 256L * 1024 * 1024);
                                CheckSpace(destination, expanded + 256L * 1024 * 1024);
                                if (String.Equals(Path.GetPathRoot(Path.GetTempPath()), Path.GetPathRoot(destination), StringComparison.OrdinalIgnoreCase)) CheckSpace(destination, expanded * 2 + 256L * 1024 * 1024);
                                scratch = Path.Combine(Path.GetTempPath(), "3Mix-setup-" + Guid.NewGuid().ToString("N")); NoLinks(scratch);
                                if (Directory.Exists(FreeMixUninstall.Program.IOPath(scratch)) || File.Exists(FreeMixUninstall.Program.IOPath(scratch))) throw new Exception("Pasta temporária já existe.");
                                Directory.CreateDirectory(FreeMixUninstall.Program.IOPath(scratch)); Extract(zip, scratch, expanded, report);
                            }
                        }
                        ValidateDestination(options.Destination);
                        int api = FreePort(options.ApiPort, 18188, 18198), ws = FreePort(options.WsPort, 4466, 4499);
                        if (api == ws) throw new Exception("As portas devem ser diferentes.");
                        report("Verificando a entrega assinada e instalando os arquivos…", 62);
                        string node = Path.Combine(scratch, "runtime", "node.exe"), cli = Path.Combine(scratch, "ferramentas", "instalar-portatil.mjs");
                        NoLinks(node); NoLinks(cli); if (!File.Exists(FreeMixUninstall.Program.IOPath(node)) || !File.Exists(FreeMixUninstall.Program.IOPath(cli))) throw new Exception("O pacote não contém o instalador offline.");
                        ProcessStartInfo psi = new ProcessStartInfo(node, Quote(cli) + " --source " + Quote(scratch) + " --dest " + Quote(Path.GetFullPath(options.Destination)) + " --api-port " + api + " --ws-port " + ws);
                        psi.WorkingDirectory = scratch; psi.UseShellExecute = false; psi.CreateNoWindow = true; psi.RedirectStandardOutput = true; psi.RedirectStandardError = true;
                        using (Process process = new Process()) {
                            process.StartInfo = psi;
                            object logLock = new object();
                            DataReceivedEventHandler capture = delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) lock (logLock) log.WriteLine(Sanitize(e.Data)); };
                            process.OutputDataReceived += capture; process.ErrorDataReceived += capture;
                            if (!process.Start()) throw new Exception("Não foi possível iniciar o instalador offline.");
                            process.BeginOutputReadLine(); process.BeginErrorReadLine(); process.WaitForExit();
                            if (process.ExitCode != 0) throw new Exception("O instalador offline recusou ou não concluiu a instalação (código " + process.ExitCode + "). Consulte o registro.");
                        }
                        installed = true;
                        if (!String.IsNullOrWhiteSpace(options.ImportProject)) ImportProject(Path.GetFullPath(options.Destination), options, log, report);
                        Prerequisites(Path.GetFullPath(options.Destination), scratch, options, log, report);
                        report("Criando os atalhos…", 95);
                        List<string> shortcuts = options.NoShortcuts ? new List<string>() : CreateShortcuts(Path.GetFullPath(options.Destination));
                        WriteUninstaller(Path.GetFullPath(options.Destination), shortcuts);
                        WriteReceipt(Path.GetFullPath(options.Destination), api, ws, shortcuts);
                        log.WriteLine("INSTALL PASS; appStarted=false; firewallApplied=false; apiPort=" + api + "; wsPort=" + ws + "; shortcuts=" + shortcuts.Count + "; uninstallRegistered=true");
                        report("Instalação concluída.", 100); return 0;
                    } catch (Exception e) { LastError = installed ? "Os arquivos foram instalados, mas a finalização falhou. " + e.Message + " A instalação foi mantida no destino escolhido; use 3Mix Studio.cmd nessa pasta." : e.Message; log.WriteLine("FAIL: installed=" + installed.ToString().ToLowerInvariant() + "; " + Sanitize(LastError)); report("Falha: " + LastError, 0); return 1; }
                    finally { if (scratch != null) { try { SafeDelete(scratch); } catch (Exception e) { log.WriteLine("Temporary cleanup pending: " + Sanitize(e.Message)); } } }
                }
            } catch (Exception e) { LastError = e.Message; report("Falha: " + e.Message, 0); return 1; }
        }
        // Visual C++ e câmera virtual exigem administrador; o resto da instalação, não. Um único pedido de permissão cobre os dois.
        // Quem confere o resultado é o próprio Windows, lendo o registro de novo depois: o código de saída de um processo elevado não chega aqui com segurança.
        internal static string Warning = "";
        const string VCamClass = "CLSID\\{A3FCE0F5-3493-419F-958A-ABA1250EC20B}";
        internal static bool VcRuntimeReady() {
            try {
                using (RegistryKey hive = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
                using (RegistryKey key = hive.OpenSubKey("SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X64")) {
                    if (key == null || Convert.ToInt32(key.GetValue("Installed", 0)) != 1) return false;
                    int major = Convert.ToInt32(key.GetValue("Major", 0)), minor = Convert.ToInt32(key.GetValue("Minor", 0));
                    return major > PayloadInfo.VcMajor || (major == PayloadInfo.VcMajor && minor >= PayloadInfo.VcMinor);
                }
            } catch (Exception) { return false; }
        }
        static bool VCamRegistered(RegistryView view) {
            try {
                using (RegistryKey hive = RegistryKey.OpenBaseKey(RegistryHive.ClassesRoot, view))
                using (RegistryKey key = hive.OpenSubKey(VCamClass)) { return key != null; }
            } catch (Exception) { return false; }
        }
        internal static bool VCamReady() { return VCamRegistered(RegistryView.Registry64) && VCamRegistered(RegistryView.Registry32); }
        static void Prerequisites(string root, string scratch, Options options, StreamWriter log, Action<string,int> report) {
            bool vc = VcRuntimeReady(), cam = VCamReady();
            log.WriteLine("PREREQ before vc=" + vc + "; camera=" + cam + "; requiredVc=" + PayloadInfo.VcMajor + "." + PayloadInfo.VcMinor);
            if (vc && cam && !options.PrereqDryRun) return;
            if (options.Silent && !options.PrereqDryRun) { Warning = "Instalação silenciosa: Visual C++ e câmera virtual não foram instalados."; log.WriteLine("PREREQ skipped silent"); return; }
            string folder = Path.Combine(scratch, "prereq"), redist = Path.Combine(folder, "vc_redist.x64.exe"), script = Path.Combine(folder, "prerequisitos.cmd");
            Directory.CreateDirectory(FreeMixUninstall.Program.IOPath(folder));
            using (Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream("FreeMixSetup.VcRedist")) {
                if (source == null) throw new Exception("O instalador não contém o Visual C++.");
                using (FileStream target = new FileStream(FreeMixUninstall.Program.IOPath(redist), FileMode.CreateNew, FileAccess.Write)) source.CopyTo(target);
            }
            string win = Path.Combine(root, "data", "obs-plugins", "win-dshow");
            StringBuilder lines = new StringBuilder("@echo off\r\nchcp 65001 >nul\r\n");
            if (!vc || options.PrereqDryRun) lines.Append("\"" + redist + "\" /install /quiet /norestart\r\n");
            if (!cam || options.PrereqDryRun) { lines.Append("regsvr32.exe /i /s \"" + Path.Combine(win, "obs-virtualcam-module64.dll") + "\"\r\n"); lines.Append("regsvr32.exe /i /s \"" + Path.Combine(win, "obs-virtualcam-module32.dll") + "\"\r\n"); }
            lines.Append("exit /b 0\r\n");
            File.WriteAllText(FreeMixUninstall.Program.IOPath(script), lines.ToString(), new UTF8Encoding(false));
            if (options.PrereqDryRun) {
                log.WriteLine("PREREQ dry-run redistBytes=" + new FileInfo(FreeMixUninstall.Program.IOPath(redist)).Length);
                foreach (string line in lines.ToString().Split(new string[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries)) log.WriteLine("PREREQ script " + line);
                return;
            }
            report("O Windows vai pedir permissão para instalar o Visual C++ e a câmera virtual…", 92);
            try {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"\"" + script + "\"\"");
                psi.UseShellExecute = true; psi.Verb = "runas"; psi.WindowStyle = ProcessWindowStyle.Hidden; psi.WorkingDirectory = folder;
                using (Process process = Process.Start(psi)) { process.WaitForExit(); log.WriteLine("PREREQ script exit=" + process.ExitCode); }
            } catch (System.ComponentModel.Win32Exception e) { log.WriteLine("PREREQ permission refused: " + e.NativeErrorCode); }
            vc = VcRuntimeReady(); cam = VCamReady();
            log.WriteLine("PREREQ after vc=" + vc + "; camera=" + cam);
            if (!vc) Warning = "O Visual C++ não foi instalado, e o 3Mix não abre sem ele. Rode este instalador de novo em uma pasta nova e aceite o pedido de permissão do Windows.";
            else if (!cam) Warning = "A câmera virtual não ficou disponível. O restante do 3Mix funciona normalmente.";
        }
        internal static void OpenInstalled(string destination) {
            try {
                string root = Path.GetFullPath(destination);
                ProcessStartInfo psi = new ProcessStartInfo(Path.Combine(root, "3Mix Studio.cmd"));
                psi.UseShellExecute = true; psi.WorkingDirectory = root; psi.WindowStyle = ProcessWindowStyle.Minimized;
                Process.Start(psi);
            } catch (Exception e) { MessageBox.Show("Não foi possível abrir o 3Mix: " + e.Message, "3Mix Studio", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }
        static string Sanitize(string text) { return Regex.Replace(text, "(?i)(password|secret|token|authorization|credential)(\\s*[=:]\\s*)([^,}\\s]+)", "$1$2[REDACTED]"); }
        static string Quote(string value) { return "\"" + Regex.Replace(Regex.Replace(value, "(\\\\*)\"", "$1$1\\\""), "(\\\\+)$", "$1$1") + "\""; }
        public static void ValidateDestination(string path) {
            if (String.IsNullOrWhiteSpace(path)) throw new Exception("Escolha uma pasta de destino.");
            path = Path.GetFullPath(path); if (path.StartsWith("\\\\") || String.Equals(path.TrimEnd('\\'), Path.GetPathRoot(path).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new Exception("Escolha uma pasta local nova; a raiz da unidade não é aceita.");
            NoLinks(path); if (File.Exists(FreeMixUninstall.Program.IOPath(path)) || (Directory.Exists(FreeMixUninstall.Program.IOPath(path)) && FreeMixUninstall.Program.Entries(path).Length != 0)) throw new Exception("O destino deve ser uma pasta nova ou completamente vazia. A instalação existente será preservada.");
        }
        internal static void NoLinks(string path) {
            for (string p = Path.GetFullPath(path); !String.IsNullOrEmpty(p); p = Path.GetDirectoryName(p)) {
                try { if ((File.GetAttributes(FreeMixUninstall.Program.IOPath(p)) & FileAttributes.ReparsePoint) != 0) throw new Exception("Links e junções não são aceitos: " + p); }
                catch (FileNotFoundException) { } catch (DirectoryNotFoundException) { }
                if (String.Equals(p, Path.GetPathRoot(p), StringComparison.OrdinalIgnoreCase)) break;
            }
        }
        static void CheckSpace(string path, long needed) { DriveInfo drive = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(path))); if (drive.AvailableFreeSpace < needed) throw new Exception("Espaço insuficiente na unidade " + drive.Name + ". Necessário: " + Math.Ceiling(needed / 1073741824.0).ToString(CultureInfo.InvariantCulture) + " GB livres."); }
        static void ReadFooter(FileStream file, out long start, out long length) {
            if (file.Length < 84) throw new Exception("Instalador incompleto."); file.Position = file.Length - 84;
            byte[] footer = new byte[84]; ReadExactly(file, footer, footer.Length);
            length = BitConverter.ToInt64(footer, 0); string hash = Encoding.ASCII.GetString(footer, 8, 64), magic = Encoding.ASCII.GetString(footer, 72, 12);
            if ((magic != "3MXSETUPV001" && magic != "FMXSETUPV001") || length != PayloadInfo.Length || length < 22 || length > 5000000000L || length >= file.Length - 84 || hash != PayloadInfo.Sha256) throw new Exception("Payload ausente ou alterado.");
            start = file.Length - 84 - length;
        }
        static void ReadExactly(Stream stream, byte[] buffer, int count) { int offset = 0; while (offset < count) { int read = stream.Read(buffer, offset, count - offset); if (read <= 0) throw new Exception("Arquivo truncado."); offset += read; } }
        static void VerifyPayload(FileStream file, long start, long length, Action<string, int> report) {
            using (SHA256 sha = SHA256.Create()) {
                file.Position = start; byte[] buffer = new byte[1024 * 1024]; long remaining = length; int last = -1;
                while (remaining > 0) { int read = file.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining)); if (read <= 0) throw new Exception("Payload truncado."); sha.TransformBlock(buffer, 0, read, buffer, 0); remaining -= read; int p = 2 + (int)((length - remaining) * 23 / length); if (p != last) { report("Verificando a integridade do instalador…", p); last = p; } }
                sha.TransformFinalBlock(new byte[0], 0, 0); string actual = BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant(); if (actual != PayloadInfo.Sha256) throw new Exception("A integridade do instalador não confere. Baixe novamente o arquivo.");
            }
        }
        static string EntryPath(ZipArchiveEntry entry) {
            string name = entry.FullName;
            if (String.IsNullOrEmpty(name) || name.Length > 512 || name.IndexOf('\\') >= 0 || !name.StartsWith(PayloadInfo.Root + "/", StringComparison.Ordinal)) throw new Exception("Caminho ZIP fora da raiz esperada.");
            name = name.Substring(PayloadInfo.Root.Length + 1); if (name.EndsWith("/", StringComparison.Ordinal)) name = name.Substring(0, name.Length - 1);
            if (name.Length == 0) return "";
            foreach (string part in name.Split('/')) if (part.Length == 0 || part == "." || part == ".." || Regex.IsMatch(part, "[<>:\"|?*\\x00-\\x1f]") || part.EndsWith(".") || part.EndsWith(" ") || Regex.IsMatch(part, "^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$)", RegexOptions.IgnoreCase)) throw new Exception("Caminho ZIP inválido.");
            int type = (entry.ExternalAttributes >> 16) & 0xF000; if (type != 0 && type != 0x8000 && type != 0x4000) throw new Exception("Entrada especial ou link recusado no ZIP.");
            if ((entry.ExternalAttributes & 0x400) != 0) throw new Exception("Junção recusada no ZIP."); return name;
        }
        static long ValidateZip(ZipArchive zip) {
            if (zip.Entries.Count == 0 || zip.Entries.Count > 60000) throw new Exception("Quantidade de arquivos ZIP inválida.");
            long total = 0; HashSet<string> names = new HashSet<string>(StringComparer.OrdinalIgnoreCase), files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (ZipArchiveEntry entry in zip.Entries) { string name = EntryPath(entry); if (name == "") continue; if (!names.Add(name) || entry.Length < 0 || entry.Length > 2000000000L) throw new Exception("Entrada ZIP duplicada ou excessiva."); total += entry.Length; if (total > MaxExpanded) throw new Exception("O ZIP excede 30 GB."); if (!entry.FullName.EndsWith("/")) files.Add(name); else if (entry.Length != 0) throw new Exception("Diretório ZIP inválido."); }
            foreach (string name in names) { string[] parts = name.Split('/'); string parent = ""; for (int i = 0; i < parts.Length - 1; i++) { parent = i == 0 ? parts[i] : parent + "/" + parts[i]; if (files.Contains(parent)) throw new Exception("Arquivo ZIP usado como pasta."); } }
            if (!files.Contains("manifest.json") || !files.Contains("manifest.sig") || !files.Contains("runtime/node.exe") || !files.Contains("ferramentas/instalar-portatil.mjs")) throw new Exception("O ZIP não contém a entrega completa."); return total;
        }
        static void Extract(ZipArchive zip, string root, long total, Action<string, int> report) {
            long copied = 0; byte[] buffer = new byte[1024 * 1024]; int last = -1;
            foreach (ZipArchiveEntry entry in zip.Entries) {
                string relative = EntryPath(entry); if (relative == "") continue; string target = Path.GetFullPath(Path.Combine(root, relative.Replace('/', '\\')));
                if (!target.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase)) throw new Exception("Caminho ZIP fora da pasta temporária."); NoLinks(target);
                if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(FreeMixUninstall.Program.IOPath(target)); continue; }
                Directory.CreateDirectory(FreeMixUninstall.Program.IOPath(Path.GetDirectoryName(target))); NoLinks(target); long written = 0;
                using (Stream from = entry.Open()) using (FileStream to = new FileStream(FreeMixUninstall.Program.IOPath(target), FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                    int read; while ((read = from.Read(buffer, 0, buffer.Length)) > 0) { written += read; if (written > entry.Length) throw new Exception("Entrada ZIP excedeu o tamanho declarado."); to.Write(buffer, 0, read); copied += read; int p = 26 + (int)(copied * 35 / Math.Max(1, total)); if (p != last) { report("Extraindo os arquivos da instalação…", p); last = p; } }
                }
                if (written != entry.Length) throw new Exception("Entrada ZIP truncada.");
            }
        }
        static int FreePort(int requested, int low, int high) {
            if (requested != 0) { if (!PortAvailable(requested)) throw new Exception("A porta " + requested + " já está em uso."); return requested; }
            for (int p = low; p <= high; p++) if (PortAvailable(p)) return p; throw new Exception("Nenhuma porta livre entre " + low + " e " + high + ".");
        }
        static bool PortAvailable(int port) { foreach (IPEndPoint busy in System.Net.NetworkInformation.IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners()) if (busy.Port == port) return false; TcpListener listener = null, v6 = null; try { listener = new TcpListener(IPAddress.Any, port); listener.Server.ExclusiveAddressUse = true; listener.Start(); if (Socket.OSSupportsIPv6) { v6 = new TcpListener(IPAddress.IPv6Any, port); v6.Server.SetSocketOption(SocketOptionLevel.IPv6, SocketOptionName.IPv6Only, true); v6.Server.ExclusiveAddressUse = true; v6.Start(); } return true; } catch (SocketException) { return false; } finally { if (listener != null) listener.Stop(); if (v6 != null) v6.Stop(); } }
        static List<string> CreateShortcuts(string root) {
            NoLinks(root); string launch = Path.Combine(root, "3Mix Studio.cmd"), icon = Path.Combine(root, "bin", "64bit", "FreeMix.exe"); if (!File.Exists(FreeMixUninstall.Program.IOPath(launch)) || !File.Exists(FreeMixUninstall.Program.IOPath(icon))) throw new Exception("Arquivos dos atalhos ausentes.");
            List<string> paths = new List<string>(); Type type = Type.GetTypeFromProgID("WScript.Shell"); object shell = Activator.CreateInstance(type);
            try { foreach (string folder in new string[] { Environment.GetFolderPath(Environment.SpecialFolder.Programs), Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory) }) {
                // Windows-managed known folders may legitimately traverse OneDrive or profile junctions.
                // This exception applies only to the two paths returned by GetFolderPath above.
                if (String.IsNullOrWhiteSpace(folder) || !Path.IsPathRooted(folder)) throw new Exception("O Windows não informou a pasta oficial dos atalhos.");
                Directory.CreateDirectory(FreeMixUninstall.Program.IOPath(folder)); string path = Path.Combine(folder, "3Mix Studio.lnk");
                while (File.Exists(FreeMixUninstall.Program.IOPath(path)) || Directory.Exists(FreeMixUninstall.Program.IOPath(path))) path = Path.Combine(folder, "3Mix Studio (" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0, 6) + ").lnk");
                object shortcut = type.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
                try { Type shortcutType = shortcut.GetType(); Set(shortcutType, shortcut, "TargetPath", launch); Set(shortcutType, shortcut, "WorkingDirectory", root); Set(shortcutType, shortcut, "IconLocation", icon + ",0"); shortcutType.InvokeMember("WindowStyle", BindingFlags.SetProperty, null, shortcut, new object[] { 7 }); Set(shortcutType, shortcut, "Description", "3Mix Studio"); shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, new object[0]); paths.Add(path); }
                finally { System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shortcut); }
            } } finally { System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell); } return paths;
        }
        static void Set(Type type, object target, string name, string value) { type.InvokeMember(name, BindingFlags.SetProperty, null, target, new object[] { value }); }
        internal static string Json(string s) { return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n") + "\""; }
        static void WriteReceipt(string root, int api, int ws, List<string> shortcuts) { string path = Path.Combine(root, "installer-setup.json"); NoLinks(path); List<string> quoted = shortcuts.ConvertAll<string>(Json); using (StreamWriter writer = new StreamWriter(new FileStream(FreeMixUninstall.Program.IOPath(path), FileMode.CreateNew, FileAccess.Write), new UTF8Encoding(false))) writer.Write("{\"format\":1,\"version\":" + Json(PayloadInfo.Version) + ",\"payloadSha256\":" + Json(PayloadInfo.Sha256) + ",\"apiPort\":" + api + ",\"wsPort\":" + ws + ",\"appStarted\":false,\"firewallApplied\":false,\"uninstallRegistered\":true,\"shortcuts\":[" + String.Join(",", quoted.ToArray()) + "]}"); }
        static void ImportProject(string root, Options options, StreamWriter log, Action<string,int> report) {
            string node = Path.Combine(root, "runtime", "node.exe"), cli = Path.Combine(root, "ferramentas", "recuperacao-importacao.mjs"); NoLinks(cli);
            if (!File.Exists(FreeMixUninstall.Program.IOPath(cli))) throw new Exception("Esta entrega não inclui a importação de projeto. A instalação limpa foi mantida.");
            string arguments = Quote(cli) + " " + Quote("--root=" + root) + " " + Quote("--project=" + Path.GetFullPath(options.ImportProject)) + (String.IsNullOrWhiteSpace(options.ProjectName) ? "" : " " + Quote("--name=" + options.ProjectName));
            report("Conferindo o projeto escolhido e suas dependências…", 85);
            string preview = RunTool(node, arguments, root); JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 2 * 1024 * 1024 }; Dictionary<string,object> value = json.Deserialize<Dictionary<string,object>>(preview);
            string hash = Convert.ToString(value["manifestHash"]); if (!System.Text.RegularExpressions.Regex.IsMatch(hash, "^[a-f0-9]{64}$")) throw new Exception("Prévia de projeto inválida.");
            log.WriteLine("PROJECT PREVIEW: " + Sanitize(preview));
            string result = RunTool(node, arguments + " --apply " + Quote("--expected-hash=" + hash), root); log.WriteLine("PROJECT IMPORT: " + Sanitize(result));
        }
        static string RunTool(string exe, string arguments, string root) {
            ProcessStartInfo psi = new ProcessStartInfo(exe, arguments) { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using (Process process = new Process { StartInfo = psi }) {
                Task<string> output, error; if (!process.Start()) throw new Exception("Falha ao iniciar a importação."); output = process.StandardOutput.ReadToEndAsync(); error = process.StandardError.ReadToEndAsync(); process.WaitForExit();
                if (process.ExitCode != 0) throw new Exception("Importação não concluída: " + Sanitize(error.Result.Trim())); if (output.Result.Length > 2 * 1024 * 1024) throw new Exception("Recibo de importação excessivo."); return output.Result.Trim();
            }
        }
        static string HashFile(string path) { using (FileStream stream = File.OpenRead(FreeMixUninstall.Program.IOPath(path))) using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant(); }
        static void WriteUninstaller(string root, List<string> shortcuts) {
            string executable = Path.Combine(root, "Desinstalar 3Mix.exe"), planPath = Path.Combine(root, "uninstall-files.json"); NoLinks(executable); NoLinks(planPath);
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("FreeMixSetup.Uninstall.exe")) using (FileStream target = new FileStream(FreeMixUninstall.Program.IOPath(executable), FileMode.CreateNew, FileAccess.Write)) { if (resource == null) throw new Exception("Desinstalador ausente no instalador."); resource.CopyTo(target); }
            JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 }; string manifestPath = Path.Combine(root,"manifest.json"); NoLinks(manifestPath); if (new FileInfo(FreeMixUninstall.Program.IOPath(manifestPath)).Length > 16 * 1024 * 1024) throw new Exception("Manifesto excessivo.");
            Dictionary<string, object> manifest = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(FreeMixUninstall.Program.IOPath(manifestPath))); List<object> files = new List<object>(), links = new List<object>();
            foreach (object raw in (System.Collections.IEnumerable)manifest["files"]) { Dictionary<string, object> item = (Dictionary<string, object>)raw; if (FreeMixUninstall.Program.OwnedPath((string)item["path"])) files.Add(item); }
            foreach (string path in shortcuts) links.Add(new Dictionary<string, object> { {"path",path}, {"sha256",HashFile(path)} });
            string registryKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\3MixStudio-" + BitConverter.ToString(SHA256.Create().ComputeHash(Encoding.UTF8.GetBytes(root.ToLowerInvariant()))).Replace("-", "").ToLowerInvariant().Substring(0,16);
            Dictionary<string, object> plan = new Dictionary<string, object> { {"format",1}, {"root",root}, {"version",PayloadInfo.Version}, {"files",files}, {"shortcuts",links}, {"registryKey",registryKey}, {"preserveData",true} };
            File.WriteAllText(FreeMixUninstall.Program.IOPath(planPath),json.Serialize(plan),new UTF8Encoding(false));
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(registryKey)) { key.SetValue("DisplayName","3Mix Studio"); key.SetValue("DisplayVersion",PayloadInfo.DisplayVersion); key.SetValue("Publisher","3Mix Studio"); key.SetValue("InstallLocation",root); key.SetValue("UninstallString",Quote(executable)); key.SetValue("QuietUninstallString",Quote(executable)+" --silent --apply"); key.SetValue("DisplayIcon",Path.Combine(root,"bin\\64bit\\FreeMix.exe")); key.SetValue("NoModify",1,RegistryValueKind.DWord); key.SetValue("NoRepair",1,RegistryValueKind.DWord); }
        }
        static void SafeDelete(string root) { NoLinks(root); foreach (string path in FreeMixUninstall.Program.Entries(root)) { NoLinks(path); if (Directory.Exists(FreeMixUninstall.Program.IOPath(path))) SafeDelete(path); else File.Delete(FreeMixUninstall.Program.IOPath(path)); } Directory.Delete(FreeMixUninstall.Program.IOPath(root)); }
    }

    internal sealed class RangeStream : Stream {
        readonly Stream inner; readonly long start, length; long position;
        public RangeStream(Stream inner, long start, long length) { this.inner = inner; this.start = start; this.length = length; }
        public override bool CanRead { get { return true; } } public override bool CanSeek { get { return true; } } public override bool CanWrite { get { return false; } }
        public override long Length { get { return length; } } public override long Position { get { return position; } set { Seek(value, SeekOrigin.Begin); } }
        public override int Read(byte[] buffer, int offset, int count) { if (position >= length) return 0; inner.Position = start + position; int read = inner.Read(buffer, offset, (int)Math.Min(count, length - position)); position += read; return read; }
        public override long Seek(long offset, SeekOrigin origin) { long next = origin == SeekOrigin.Begin ? offset : origin == SeekOrigin.Current ? position + offset : length + offset; if (next < 0 || next > length) throw new IOException("Leitura fora do payload."); position = next; return next; }
        public override void Flush() { } public override void SetLength(long value) { throw new NotSupportedException(); } public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
    }
}
