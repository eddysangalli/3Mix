using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;
using System.Reflection;

[assembly: AssemblyTitle("3Mix Studio")]
[assembly: AssemblyDescription("3Mix Studio - Broadcast Video & Audio Production Suite")]
[assembly: AssemblyCompany("3Mix Open Source")]
[assembly: AssemblyProduct("3Mix Studio")]
[assembly: AssemblyCopyright("Copyright (C) 2026 GPL-2.0")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace 3Mix
{
    public class 3MixMainWindow : Form
    {
        [DllImport("shell32.dll", SetLastError = true)]
        private static extern void SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        private Process _engineProcess;
        private WebView2 _webView;
        private string _appDir;
        private string _rootDir;

        public 3MixMainWindow()
        {
            try
            {
                SetCurrentProcessExplicitAppUserModelID("3Mix.Studio.BroadcastSuite.1.0");
            }
            catch {}

            _appDir = AppDomain.CurrentDomain.BaseDirectory;
            _rootDir = Path.GetFullPath(Path.Combine(_appDir, "..", ".."));

            this.Text = "3Mix Studio - [Producao_Estudio.fmx] - 1080p60";
            this.Size = new Size(1366, 768);
            this.WindowState = FormWindowState.Maximized;
            this.BackColor = Color.FromArgb(16, 20, 26);
            this.ForeColor = Color.FromArgb(230, 235, 242);
            this.StartPosition = FormStartPosition.CenterScreen;

            // Carrega ícone oficial
            string icoPath = Path.Combine(_rootDir, "ferramentas", "3Mix.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); } catch {}
            }

            // Inicia o motor de vídeo do 3Mix em segundo plano
            StartEngine();

            // Inicializa WebView2
            InitializeWebView();

            this.FormClosing += OnFormClosing;
        }

        private void StartEngine()
        {
            string obsExe = Path.Combine(_appDir, "obs64.exe");
            if (!File.Exists(obsExe)) return;

            try
            {
                // Prepara scripts portáteis se existirem
                string prepScript = Path.Combine(_rootDir, "ferramentas", "preparar.ps1");
                if (File.Exists(prepScript))
                {
                    var psiPrep = new ProcessStartInfo("powershell", "-NoProfile -ExecutionPolicy Bypass -File \"" + prepScript + "\"")
                    {
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    var pPrep = Process.Start(psiPrep);
                    pPrep.WaitForExit(6000);
                }

                // Inicia o motor
                var psi = new ProcessStartInfo(obsExe, "--portable --multi --disable-updater --disable-missing-files-check")
                {
                    WorkingDirectory = _appDir,
                    WindowStyle = ProcessWindowStyle.Minimized,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };

                _engineProcess = Process.Start(psi);

                // Minimiza a janela bruta do motor após o boot para deixar apenas a janela do 3Mix Studio visível
                new Thread(() =>
                {
                    Thread.Sleep(2500);
                    if (_engineProcess != null && !_engineProcess.HasExited)
                    {
                        try
                        {
                            IntPtr h = _engineProcess.MainWindowHandle;
                            if (h != IntPtr.Zero)
                            {
                                ShowWindow(h, 0); // SW_HIDE
                            }
                        }
                        catch {}
                    }
                }).Start();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao inicializar o motor do 3Mix: " + ex.Message, "3Mix Studio", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private async void InitializeWebView()
        {
            _webView = new WebView2();
            _webView.Dock = DockStyle.Fill;
            this.Controls.Add(_webView);

            try
            {
                string userDataFolder = Path.Combine(_rootDir, "config", "3Mix-webview");
                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await _webView.EnsureCoreWebView2Async(env);

                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
                _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

                string htmlPath = Path.Combine(_rootDir, "painel", "mesa.html");
                if (File.Exists(htmlPath))
                {
                    _webView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
                }
                else
                {
                    _webView.CoreWebView2.NavigateToString("<html><body style='background:#10141a;color:#fff;font-family:sans-serif;padding:30px'><h2>3Mix Studio</h2><p>Carregando painel de producao...</p></body></html>");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao inicializar renderizador: " + ex.Message, "3Mix Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            try
            {
                if (_engineProcess != null && !_engineProcess.HasExited)
                {
                    _engineProcess.Kill();
                }
            }
            catch {}
        }

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new 3MixMainWindow());
        }
    }
}

