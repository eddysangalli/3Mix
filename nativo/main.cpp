// ═══════════════════════════════════════════════════════════════════════
//  3Mix Studio — host nativo (C++ / Win32 + WebView2)
//  A moldura é nativa; toda a interface é HTML/CSS/JS renderizada pelo
//  Chromium com aceleração de GPU. O motor (libobs) roda em outro processo
//  e é acessado pela API local.
// ═══════════════════════════════════════════════════════════════════════

#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <shellapi.h>
#include <wrl.h>
#include <string>
#include <string_view>
#include <dwmapi.h>
#include <objbase.h>

#include "WebView2.h"

#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "shell32.lib")

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Callback;

namespace {

constexpr wchar_t kClassName[] = L"3MixStudioHost";
constexpr wchar_t kWindowTitle[] = L"3Mix Studio";
constexpr int kResizeBorder = 6;
constexpr int kMinWidth = 1180;
constexpr int kMinHeight = 720;

HWND g_hwnd = nullptr;
ComPtr<ICoreWebView2Controller> g_controller;
ComPtr<ICoreWebView2> g_webview;
std::wstring g_startUrl = L"http://127.0.0.1:18188/estudio/index.html?desktop=1";

std::wstring executavel() {
    wchar_t caminho[MAX_PATH]{};
    GetModuleFileNameW(nullptr, caminho, MAX_PATH);
    return caminho;
}

std::wstring pastaDoExecutavel() {
    std::wstring caminho = executavel();
    const auto barra = caminho.find_last_of(L"\\/");
    return barra == std::wstring::npos ? L"." : caminho.substr(0, barra);
}

std::wstring pastaDeDados() {
    wchar_t local[MAX_PATH]{};
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, local))) {
        std::wstring pasta = std::wstring(local) + L"\\3Mix\\WebView2";
        CreateDirectoryW((std::wstring(local) + L"\\3Mix").c_str(), nullptr);
        CreateDirectoryW(pasta.c_str(), nullptr);
        return pasta;
    }
    return pastaDoExecutavel() + L"\\dados-webview";
}

void ajustarIcone(HWND hwnd) {
    const std::wstring icone = pastaDoExecutavel() + L"\\3Mix.ico";
    HICON grande = static_cast<HICON>(LoadImageW(nullptr, icone.c_str(), IMAGE_ICON,
        GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON), LR_LOADFROMFILE));
    HICON pequeno = static_cast<HICON>(LoadImageW(nullptr, icone.c_str(), IMAGE_ICON,
        GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE));
    if (grande) SendMessageW(hwnd, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(grande));
    if (pequeno) SendMessageW(hwnd, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(pequeno));
}

void aplicarTemaEscuro(HWND hwnd) {
    const BOOL escuro = TRUE;
    DwmSetWindowAttribute(hwnd, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, &escuro, sizeof(escuro));
    const COLORREF fundo = RGB(20, 22, 25);
    DwmSetWindowAttribute(hwnd, 35 /* DWMWA_BORDER_COLOR */, &fundo, sizeof(fundo));
}

void tratarMensagemDaPagina(const std::wstring &texto) {
    if (texto.find(L"\"janela\"") == std::wstring::npos && texto.find(L"janela") == std::wstring::npos) return;

    if (texto.find(L"minimizar") != std::wstring::npos) ShowWindow(g_hwnd, SW_MINIMIZE);
    else if (texto.find(L"maximizar") != std::wstring::npos) {
        ShowWindow(g_hwnd, IsZoomed(g_hwnd) ? SW_RESTORE : SW_MAXIMIZE);
    } else if (texto.find(L"fechar") != std::wstring::npos) {
        PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
    }
}

void redimensionarWebView() {
    if (!g_controller) return;
    RECT area{};
    GetClientRect(g_hwnd, &area);
    g_controller->put_Bounds(area);
}

void criarInterfaceWeb() {
    const std::wstring dados = pastaDeDados();

    auto aoCriarAmbiente = Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
        [](HRESULT resultado, ICoreWebView2Environment *ambiente) -> HRESULT {
            if (FAILED(resultado) || !ambiente) {
                MessageBoxW(g_hwnd, L"Não foi possível iniciar o WebView2 Runtime.\n\n"
                    L"Instale o Microsoft Edge WebView2 Runtime e tente novamente.",
                    kWindowTitle, MB_ICONERROR | MB_OK);
                return resultado;
            }

            return ambiente->CreateCoreWebView2Controller(g_hwnd,
                Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [](HRESULT r, ICoreWebView2Controller *controlador) -> HRESULT {
                        if (FAILED(r) || !controlador) return r;
                        g_controller = controlador;
                        g_controller->get_CoreWebView2(&g_webview);

                        ComPtr<ICoreWebView2Settings> config;
                        if (SUCCEEDED(g_webview->get_Settings(&config)) && config) {
                            config->put_AreDefaultContextMenusEnabled(FALSE);
                            config->put_IsStatusBarEnabled(FALSE);
                            config->put_IsZoomControlEnabled(FALSE);
                            config->put_AreDevToolsEnabled(TRUE);
                            config->put_IsSwipeNavigationEnabled(FALSE);
                        }

                        g_webview->add_WebMessageReceived(
                            Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                                [](ICoreWebView2 *, ICoreWebView2WebMessageReceivedEventArgs *args) -> HRESULT {
                                    LPWSTR bruto = nullptr;
                                    if (SUCCEEDED(args->get_WebMessageAsJson(&bruto)) && bruto) {
                                        tratarMensagemDaPagina(bruto);
                                        CoTaskMemFree(bruto);
                                    }
                                    return S_OK;
                                }).Get(), nullptr);

                        g_controller->put_Bounds(RECT{0, 0, 0, 0});
                        redimensionarWebView();
                        g_webview->Navigate(g_startUrl.c_str());
                        ShowWindow(g_hwnd, SW_SHOW);
                        return S_OK;
                    }).Get());
        });

    const HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(nullptr, dados.c_str(), nullptr, aoCriarAmbiente.Get());
    if (FAILED(hr)) {
        MessageBoxW(g_hwnd, L"WebView2 Runtime ausente ou inválido nesta máquina.",
            kWindowTitle, MB_ICONERROR | MB_OK);
    }
}

LRESULT CALLBACK janelaProcessa(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_NCCALCSIZE:
        if (wParam == TRUE) {
            auto *params = reinterpret_cast<NCCALCSIZE_PARAMS *>(lParam);
            if (IsZoomed(hwnd)) {
                MONITORINFO monitor{sizeof(monitor)};
                GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &monitor);
                params->rgrc[0] = monitor.rcWork;
            }
            return 0;
        }
        break;

    case WM_NCHITTEST: {
        if (IsZoomed(hwnd)) return HTCLIENT;
        RECT area{};
        GetWindowRect(hwnd, &area);
        const POINT p{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
        const bool esquerda = p.x >= area.left && p.x < area.left + kResizeBorder;
        const bool direita = p.x < area.right && p.x >= area.right - kResizeBorder;
        const bool topo = p.y >= area.top && p.y < area.top + kResizeBorder;
        const bool base = p.y < area.bottom && p.y >= area.bottom - kResizeBorder;
        if (topo && esquerda) return HTTOPLEFT;
        if (topo && direita) return HTTOPRIGHT;
        if (base && esquerda) return HTBOTTOMLEFT;
        if (base && direita) return HTBOTTOMRIGHT;
        if (esquerda) return HTLEFT;
        if (direita) return HTRIGHT;
        if (topo) return HTTOP;
        if (base) return HTBOTTOM;
        return HTCLIENT;
    }

    case WM_GETMINMAXINFO: {
        auto *info = reinterpret_cast<MINMAXINFO *>(lParam);
        info->ptMinTrackSize.x = kMinWidth;
        info->ptMinTrackSize.y = kMinHeight;
        return 0;
    }

    case WM_SIZE:
        redimensionarWebView();
        return 0;

    case WM_ERASEBKGND: {
        RECT area{};
        GetClientRect(hwnd, &area);
        HBRUSH pincel = CreateSolidBrush(RGB(20, 22, 25));
        FillRect(reinterpret_cast<HDC>(wParam), &area, pincel);
        DeleteObject(pincel);
        return 1;
    }

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

} // namespace

int WINAPI wWinMain(HINSTANCE instancia, HINSTANCE, PWSTR, int) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    int argumentos = 0;
    if (LPWSTR *argv = CommandLineToArgvW(GetCommandLineW(), &argumentos)) {
        for (int i = 1; i < argumentos; i++) {
            const std::wstring atual = argv[i];
            if ((atual == L"--url" || atual == L"-u") && i + 1 < argumentos) g_startUrl = argv[++i];
            else if (atual.rfind(L"http", 0) == 0) g_startUrl = atual;
        }
        LocalFree(argv);
    }

    WNDCLASSEXW classe{sizeof(WNDCLASSEXW)};
    classe.style = CS_HREDRAW | CS_VREDRAW;
    classe.lpfnWndProc = janelaProcessa;
    classe.hInstance = instancia;
    classe.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    classe.hbrBackground = nullptr;
    classe.lpszClassName = kClassName;
    RegisterClassExW(&classe);

    RECT area{0, 0, 1600, 1000};
    AdjustWindowRect(&area, WS_OVERLAPPEDWINDOW, FALSE);

    g_hwnd = CreateWindowExW(0, kClassName, kWindowTitle,
        WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT,
        area.right - area.left, area.bottom - area.top,
        nullptr, nullptr, instancia, nullptr);

    if (!g_hwnd) return 1;

    ajustarIcone(g_hwnd);
    aplicarTemaEscuro(g_hwnd);
    criarInterfaceWeb();

    MSG mensagem{};
    while (GetMessageW(&mensagem, nullptr, 0, 0)) {
        TranslateMessage(&mensagem);
        DispatchMessageW(&mensagem);
    }

    if (g_controller) g_controller->Close();
    CoUninitialize();
    return 0;
}
