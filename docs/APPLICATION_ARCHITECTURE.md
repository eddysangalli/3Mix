# Especificação Arquitetural: 3Mix como Aplicativo Próprio

> **Documento Oficial de Engenharia · Antigravity IDE**  
> *Substituição de Escopo: O 3Mix deve ser um aplicativo próprio, com executável, interface e distribuição próprios, usando a biblioteca `libobs` como motor interno.*

---

## 1. Declaração Obrigatória de Escopo

Esta instrução redefine a arquitetura de entrega do 3Mix e substitui as decisões anteriores que tratavam o produto final como OBS portátil com tema, Web Dock, launcher ou personalizações aplicadas depois da inicialização.

O objetivo do projeto é desenvolver e distribuir um programa chamado **3Mix**, com:
1. **Executável próprio**: `FreeMix.exe` (nome de binário interno; renomear exige rebuild do motor) gerado a partir do código-fonte do aplicativo.
2. **Interface própria**: Janela principal broadcast, com Preview, Program, transições, mesa de corte e mixer estéreo.
3. **Configurações próprias**: Central de preferências em diretório próprio de dados (`FreeMix/config/` ou `%APPDATA%\FreeMix`), sem poluir nem depender de perfis do OBS Studio.
4. **Motor interno `libobs`**: A biblioteca `libobs` atua como motor de mídia interno, inicializada e controlada diretamente pelo 3Mix.

---

## 2. Critérios de Invalidação (O que NÃO é Aceito)

Não consideram o objetivo atendido:
* Um atalho ou launcher que abre o OBS oficial.
* Renomear o arquivo `obs64.exe` para `FreeMix.exe` sem reescrever a aplicação por trás dele.
* Abrir o OBS e aplicar tema, tradução, título e ícone por scripts em background.
* Manter o OBS oficial escondido atrás de outra janela do navegador (Edge/Chrome).
* Entregar apenas um plugin ou Web Dock que depende da interface original do OBS como aplicativo principal.

---

## 3. Estrutura do Aplicativo

### 3.1 Ponto de Partida e Compilação
- O executável `FreeMix.exe` (nome de binário interno; renomear exige rebuild do motor) é gerado por compilação C++ (CMake + MSVC).
- Inicializa o `QApplication`, carrega os recursos gráficos (`freemix.ico`, folhas de estilo, fontes) e invoca `obs_startup()`.
- O ciclo de vida do motor de vídeo (Direct3D 11 / OpenGL) e de áudio (`libobs-audio`) é administrado pelo aplicativo.

### 3.2 Interface e Identidade
- Nome e ícone compilados no recurso PE (`.rc` / `IDI_ICON1`).
- Janela principal e barra de título nativa: **"3Mix Studio"**.
- Monitores de vídeo em tempo real ancorados na janela principal (viewports D3D11 criados via `obs_display_create`).
- Console central de transições (Cut, Fade, Zoom, T-Bar).
- Mesa de entradas e Mixer de áudio (Master, Fones, Barramentos Auxiliares).
- Menus, diálogos de erro, caixas de propriedades e configurações pertencem ao 3Mix.

### 3.3 Subsistemas Internos
* **`OutputManager`**: Central de saídas físicas (Monitores Fullscreen, Multiview, DeckLink SDI), IP (NDI, OMT) e MultiStream com encoder NVENC compartilhado.
* **`AudioBusManager`**: Submixes Master (`M`), Aux A Mix-Minus (`A`) e Aux B Headphones (`B`).
* **`CanvasMixManager`**: Múltiplos canvases de vídeo paralelos.
* **`MultiviewManager`**: Geração de mosaico multiview.
* **`ProjectManager`**: Gravação e carregamento de produções e cenas em formato próprio.

---

## 4. Licenças e Avisos Legais

O aplicativo é licenciado sob a **GNU General Public License v2.0 (GPL-2.0)**. A reutilização de código e cabeçalhos da `libobs` e plugins da comunidade é realizada com estrita preservação dos avisos de autoria e licença nos arquivos e na tela "Sobre o 3Mix".
