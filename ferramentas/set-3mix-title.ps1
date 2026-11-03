# 3Mix Studio - Injetor Oficial de Título e Identidade Visual Broadcast
# Aplica o título oficial "3Mix Studio - <preset>" e o ícone PE na janela nativa

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$cfg = Join-Path $root 'config\obs-studio'
$ico = Join-Path $PSScriptRoot '3Mix.ico'

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class FmNative {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr hWnd, string s);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr LoadImage(IntPtr hinst, string lpszName, uint uType, int cxDesired, int cyDesired, uint fuLoad);

    public const uint WM_SETICON = 0x0080;
    public const uint ICON_SMALL = 0;
    public const uint ICON_BIG = 1;
    public const uint IMAGE_ICON = 1;
    public const uint LR_LOADFROMFILE = 0x00000010;

    public static IntPtr FindMainWindow(uint targetPid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) => {
            uint p; GetWindowThreadProcessId(h, out p);
            if (p == targetPid && IsWindowVisible(h)) {
                StringBuilder sb = new StringBuilder(512);
                GetWindowText(h, sb, 512);
                string text = sb.ToString();
                // A janela principal contém o perfil ou OBS ou 3Mix
                if (text.Contains("OBS") || text.Contains("3Mix") || text.Contains("Perfil:") || text.Contains("Estudio") || text.Length > 5) {
                    found = h;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static string GetText(IntPtr hWnd) {
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(hWnd, sb, 512);
        return sb.ToString();
    }

    public static void ApplyTitleAndIcon(IntPtr hWnd, string title, string iconPath) {
        SetWindowText(hWnd, title);
        if (!string.IsNullOrEmpty(iconPath) && System.IO.File.Exists(iconPath)) {
            try {
                IntPtr hSmall = LoadImage(IntPtr.Zero, iconPath, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
                IntPtr hBig = LoadImage(IntPtr.Zero, iconPath, IMAGE_ICON, 32, 32, LR_LOADFROMFILE);
                if (hSmall != IntPtr.Zero) SendMessage(hWnd, WM_SETICON, (IntPtr)ICON_SMALL, hSmall);
                if (hBig != IntPtr.Zero) SendMessage(hWnd, WM_SETICON, (IntPtr)ICON_BIG, hBig);
            } catch {}
        }
    }
}
'@

function BuildTitle {
    $user = Join-Path $cfg 'user.ini'
    $coll = "Producao_Estudio"
    if (Test-Path $user) {
        $m = Select-String -Path $user -Pattern "^SceneCollection=(.*)$" | Select-Object -First 1
        if ($m) { $coll = $m.Matches[0].Groups[1].Value.Trim() }
    }
    return "3Mix Studio - $coll"
}

# Aguarda até 60 segundos pelo processo obs64 ou 3Mix
$deadline = (Get-Date).AddSeconds(60)
$proc = $null
while (-not $proc -and (Get-Date) -lt $deadline) {
    $proc = Get-Process obs64, 3Mix -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $proc) { Start-Sleep -Milliseconds 300 }
}

if (-not $proc) { exit 0 }

$iconApplied = $false
while (-not $proc.HasExited) {
    $hwnd = [FmNative]::FindMainWindow([uint32]$proc.Id)
    if ($hwnd -ne [IntPtr]::Zero) {
        $wantTitle = BuildTitle
        $curTitle = [FmNative]::GetText($hwnd)
        if ($curTitle -ne $wantTitle) {
            [FmNative]::ApplyTitleAndIcon($hwnd, $wantTitle, $ico)
        }
    }
    Start-Sleep -Milliseconds 800
    $proc.Refresh()
}

