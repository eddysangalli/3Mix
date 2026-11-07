# Patch do obs-browser: regiões arrastáveis do cabeçalho

O cabeçalho original do 3Mix é uma página CEF dentro da área do título do Windows. Para áreas vazias dele arrastarem a janela, o `QCefBrowserClient` precisa implementar `CefDragHandler::OnDraggableRegionsChanged` e repassar a região ao widget Qt.

- Base do submódulo: `d4db73e7e5d5b51d853177c8cddc796715a8ac84` (obsproject/obs-browser, versão 2.27.5).
- Arquivos: `panel/browser-panel-client.cpp` e `panel/browser-panel-client.hpp`.
- Aplicação: `git -C plugins/obs-browser apply ../../docs/qa/obs-browser-draggable-regions.patch`.

## Estado
Compilado e carregado na bancada QA; o gesto físico de arraste e o duplo clique foram verificados antes desta versão, mas não requalificados depois da última recompilação. Não há remoto publicável para o submódulo: este patch é a forma versionada de preservá-lo até haver um fork de destino.
