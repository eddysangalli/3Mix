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

---

## 4. Atualização do produto (operador final) — canal, backup e rollback

As seções 1–3 acima são sobre atualizar **plugins/motor individualmente**, trabalho de quem monta o
pacote. Esta seção é sobre o **sistema de atualização do produto já instalado**, que o operador usa —
mecanismo diferente, documentado aqui por ser uma lacuna real (só existia no código-fonte até agora,
sem nenhuma explicação legível para quem opera o 3Mix).

### 4.1 Como o operador atualiza

1. **Configurações › Atualização** (ou `GET/POST /api/update`, `update_*` em `/api/control`) mostra o
   canal atual (`stable`/`beta`), a versão instalada e se há uma nova disponível.
2. **Canal**: `stable` só recebe versões com `MAJOR.MINOR.PATCH` sem sufixo; `beta` recebe tudo. Trocar
   de canal é uma ação explícita do operador (`update_configure`), nunca automática.
3. A verificação automática em segundo plano (`startAutoCheck`) roda a cada 6h, só **consulta** (nunca
   baixa nem aplica sozinha), e não ocupa rede durante gravação/transmissão.
4. Ao confirmar a atualização: a versão é baixada com retomada automática (conexão caindo não perde o
   progresso), cada arquivo é conferido por hash SHA-256 contra o manifesto, e o manifesto inteiro é
   assinado (Ed25519) — um pacote com hash ou assinatura divergente é recusado antes de tocar em
   qualquer arquivo da instalação.
5. **Guardas antes de aplicar**: o 3Mix recusa atualizar com transmissão/gravação/saída (SDI, NDI, OMT,
   destino externo) ativa — `onlineUpdate.guard`, checado duas vezes (antes de baixar e antes de
   aplicar, caso algo tenha mudado entre os dois momentos).
6. A aplicação em si fecha o 3Mix, troca os arquivos, e reabre sozinha (`ferramentas/atualizar-e-reabrir.ps1`,
   processo separado do painel — o painel não sobrevive ao próprio fechamento que ele mesmo inicia).

### 4.2 Backup automático e rollback (`ferramentas/atualizar-3mix.mjs`)

Toda vez que um arquivo é substituído por uma atualização, a versão **anterior** dele é salva automaticamente
antes da troca — não é um backup manual que o operador precisa lembrar de fazer:

- Cada atualização aplicada cria uma pasta própria em `updates/<id>/` com um `journal.json` (registro de
  cada arquivo trocado, com o hash do que havia antes) e `files/` (cópia real dos arquivos substituídos).
- **Se a atualização falhar no meio do caminho** (processo morto, queda de energia, arquivo corrompido),
  o `journal.json` fica marcado `status:"applying"`. Na próxima vez que o 3Mix abrir,
  `recoverInterrupted()` detecta esse estado sozinho e desfaz a atualização incompleta automaticamente —
  o operador não precisa saber que algo deu errado para a instalação voltar ao estado anterior.
- **Rollback manual** (restaurar uma atualização que foi concluída mas causou algum problema) ainda não
  tem botão na interface — hoje é feito rodando o módulo diretamente:
  ```powershell
  node ferramentas/atualizar-3mix.mjs rollback "<pasta da instalação>" "updates/<id-da-atualização>"
  ```
  O `<id-da-atualização>` é o nome da pasta dentro de `updates/` (um UUID), visível listando essa pasta.
  Isto é uma lacuna real de UX, não escondida: o mecanismo existe e é testado, mas não está exposto numa
  tela — documentado aqui para quem precisar usá-lo antes de uma tela chegar.
- Rollback também fecha o 3Mix primeiro (mesma checagem de processo que a atualização usa) e confere o
  hash de cada arquivo de backup antes de restaurá-lo — um backup que foi alterado por fora é recusado,
  nunca restaurado "na confiança".

### 4.3 Testado nesta sessão (Fase 8), com instalação sintética real

Todo o fluxo de 4.2 foi exercitado de ponta a ponta com o módulo real (`apply`/`rollback`/
`recoverInterrupted` importados diretamente, nunca reimplementados), contra uma instalação
sintética própria (nunca `3mix-runtime/` do operador) com um par de chaves Ed25519 gerado só
para o teste — **6/6 PASS**, repetido 3x sem flakiness:
- `apply()` trocou um arquivo existente e criou um novo, com `journal.json` de backup real.
- `rollback()` restaurou o conteúdo antigo **e** removeu o arquivo que a atualização tinha criado
  (reversão completa, não parcial) — o mesmo comando documentado em 4.2 funciona de verdade.
- Pacote com hash divergente do manifesto assinado foi recusado **antes** de tocar em qualquer
  arquivo real da instalação (a instalação ficou intacta na versão anterior).
- Atualização interrompida no meio (simulada via limite de arquivos processados) foi corrigida
  automaticamente pelo próprio `apply()`; `recoverInterrupted()` (o que roda sozinho na próxima
  abertura do 3Mix depois de uma queda real) não achou nada pendente, consistente.
- `apply()` com a mesma versão já instalada foi recusado explicitamente, direcionando para
  `rollback` — confirma que os dois comandos têm papéis distintos e não se sobrepõem.

Script: `qa-finalizacao/crew-broadcast-20261103/testar-atualizar-3mix-rollback.mjs`.

### 4.4 Limites conhecidos, não escondidos

- Não há histórico de versões anteriores além da última atualização aplicada — `updates/` mantém o
  backup da troca mais recente, não uma pilha de versões.
- O teste acima usa uma instalação **sintética** (arquivos de exemplo, não o conjunto real de binários
  do 3mix-runtime) — confirma a lógica do mecanismo com precisão, mas não substitui um teste com um
  pacote de atualização real do produto completo contra uma instalação real; isso seguiria o mesmo
  padrão desta tarefa (motor/instalação real fora do alcance desta sessão).
- O **rollback manual por linha de comando** (4.2, para quando algo dá errado depois da atualização já
  ter concluído) continua sem botão na interface — é uma lacuna real de UX, o mecanismo funciona
  (confirmado acima) mas exige o terminal hoje.
- `atualizar-freemix.mjs` é um proxy de compatibilidade intencional para `atualizar-3mix.mjs` (mesmo
  módulo, nome antigo preservado para não quebrar quem já importa por esse caminho) — não é um arquivo
  órfão nem uma duplicação acidental.
