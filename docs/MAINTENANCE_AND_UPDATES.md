# Manutenção, Ciclo de Vida e Atualização de Complementos do 3Mix Studio

Este documento estabelece o procedimento operacional e automatizado para verificação de integridade, diagnóstico e atualização dos plugins integrados e do motor `libobs` no 3Mix Studio, eliminando a necessidade de procedimentos manuais complexos ("malabarismos").

---

## 1. Arquitetura de Complementos e Isolamento

O 3Mix Studio utiliza o motor `libobs` em conjunto com um ecossistema de plugins broadcast homologados. Cada componente possui responsabilidade estrita para evitar sobreposição ou colisões de recursos:

| Componente | Função Principal | DLL / Runtime | Pasta de Dados |
| :--- | :--- | :--- | :--- |
| **libobs Core** | Pipeline de vídeo D3D11, composição, áudio estéreo 48kHz, NVENC | `bin/64bit/obs.dll` | `data/libobs/` |
| **Downstream Keyer (DSK)** | Overlays 1 a 8 independentes com canal alfa e transições | `obs-plugins/64bit/downstream-keyer.dll` | `data/obs-plugins/downstream-keyer/` |
| **Source Record** | Gravação ISO MultiCorder por entrada/câmera isolada | `obs-plugins/64bit/source-record.dll` | `data/obs-plugins/source-record/` |
| **Replay Source** | Buffer contínuo de RAM para câmera lenta e instant replay | `obs-plugins/64bit/replay-source.dll` | `data/obs-plugins/replay-source/` |
| **Move Transition** | Transições DVE dinâmicas e animações de zoom | `obs-plugins/64bit/move-transition.dll` | `data/obs-plugins/move-transition/` |
| **Media Playlist Source** | Reprodução de listas sequenciais de vídeos | `obs-plugins/64bit/media-playlist-source.dll` | `data/obs-plugins/media-playlist-source/` |
| **obs-browser** | Renderizador CEF/Chromium acelerado para GCs e VDO.Ninja | `obs-plugins/64bit/obs-browser.dll` | `data/obs-plugins/obs-browser/` |
| **obs-websocket** | Barramento IPC de alta velocidade para telemetria e controle | `obs-plugins/64bit/obs-websocket.dll` | `data/obs-plugins/obs-websocket/` |
| **DistroAV (NDI)** | Entrada e saída NDI IP com transparência Fill + Key | `obs-plugins/64bit/distroav.dll` | `data/obs-plugins/distroav/` |

---

## 2. Auditoria e Busca Automatizada de Atualizações

Para verificar se os plugins ou o próprio motor OBS possuem versões novas disponíveis na nuvem sem depender de navegação manual, execute a ferramenta oficial:

```powershell
powershell -ExecutionPolicy Bypass -File "ferramentas/verificar-atualizacoes.ps1"
```

### O que o script faz automaticamente:
1. **Inspeção Local:** Lê a versão real dos arquivos PE em `bin/64bit` e `obs-plugins/64bit`.
2. **Consulta na Nuvem:** Faz requisições para a API de Releases do GitHub dos repositórios oficiais (`obsproject/obs-studio`, `Exeldro/*`, `DistroAV/DistroAV`, etc.).
3. **Diagnóstico Imediato:** Compara tags semânticas e sinaliza:
   - `[ATUALIZADO]`: versão local corresponde à última release estável.
   - `[NOVA VERSÃO DISPONÍVEL]`: há uma versão mais recente na nuvem com link de download direto do asset x64.
   - `[OPCIONAL (NÃO INSTALADO)]`: componentes adicionais opcionais (ex: NDI DistroAV).
4. **Exportação Estruturada:** Gera `config/plugins-status.json` para alimentação automática da interface do 3Mix Studio.

---

## 3. Como Atualizar Componentes Sem Afetar o 3Mix

### Atualizando um Plugin Específico:
Para atualizar ou instalar um plugin diretamente do GitHub mantendo a estrutura íntegra:
```powershell
powershell -ExecutionPolicy Bypass -File "ferramentas/verificar-atualizacoes.ps1" -DownloadPlugin "downstream-keyer"
```

### Atualizando a Base do OBS Studio (quando sair nova versão estável):
1. Baixe o pacote zip da release oficial do OBS Studio x64 (ex: `OBS-Studio-33.x.x-Windows.zip`).
2. Extraia apenas as pastas de runtime sobre a pasta de distribuição:
   - `bin/64bit/` (atualiza `obs.dll`, bibliotecas FFmpeg, etc., preservando `FreeMix.exe` — nome de binário interno, renomear exige rebuild do motor)
   - `data/libobs/` e `data/obs-studio/`
3. Execute o script de empacotamento com recompilação automática:
   ```powershell
   powershell -ExecutionPolicy Bypass -File "ferramentas/empacotar.ps1"
   ```
4. O empacotador recompila o executável nativo `FreeMix.exe` (nome de binário interno; renomear exige rebuild do motor), injeta os metadados oficiais e o ícone PE, e gera o pacote `.zip` final sem qualquer perda de configuração.
