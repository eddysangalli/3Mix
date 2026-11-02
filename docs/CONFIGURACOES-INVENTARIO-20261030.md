# Configurações 3Mix — inventário e consolidação

Data: 30/10/2026
Fonte: `painel/remoto/settings.js` (árvore `LABELS`, `GROUPS`, `OPEN`, `DEFS`, `CONTEXTS`) e `configuracoes.html`.

> **Implementado em 30/10/2026:** a central passou para **4 grupos e 18 categorias com ícones**, e as opções avançadas viraram **sub-abas** dentro de Gravação, Transmissão, Interface e Desempenho. As categorias antigas continuam aceitas por URL (`?category=files`, `?category=audioTracks`, etc.) e as janelas operacionais continuam abrindo pelos atalhos. A lateral não é mais filtrada por contexto.

## 1. Como a tela funciona hoje

A central tem **5 grupos** e **29 categorias**. Cada categoria abre **uma única página** (não há abas aninhadas dentro da central). O que parece “sub-aba” vem de três lugares:

1. **Contexto de abertura** (`recording`, `streaming`, `output`): a lateral é filtrada e mostra só os itens daquele fluxo.
2. **Janelas externas**: várias categorias não são configurações embutidas; elas abrem outra janela (`OPEN`).
3. **Abas internas das janelas externas** (Áudio, Saídas externas, Replay, etc.).

## 2. Árvore atual (29 categorias)

| Grupo | Categoria | O que é | Onde abre |
|---|---|---|---|
| **Produção** | Vídeo | Quadro da produção, taxa de quadros, presets, tamanho enviado às saídas e composições | Embutido |
| | Áudio | Amostragem, canais, monitoramento e ajustes nativos de áudio | Embutido |
| | Mixer e roteamento | Mixer de operação, roteamento, retornos/N-1 e dispositivos | Janela `/audio` |
| | Cor | Formato de cor, espaço, faixa, branco SDR e pico HDR | Embutido |
| **Saídas** | Gravação | Formato, pasta, encoder, qualidade, áudio e tolerância (modo simples) | Embutido |
| | Transmissão | Serviço, servidor, chave, encoder, bitrate e áudio (modo simples) | Embutido |
| | Saídas externas | NDI, OMT, SRT, câmera virtual e outras saídas do programa | Janela `/externo` |
| | Saída avançada | Modo avançado de saída: encoder, caminho, formato, etc. | Embutido |
| | Parâmetros do encoder | Editor do encoder realmente carregado | Embutido |
| | Arquivos e divisão | Pasta, formato de arquivo e divisão de gravação | Embutido |
| | Trilhas de áudio | Trilhas de áudio da gravação/transmissão | Embutido |
| | Rede da transmissão | Destinos e transporte de rede da transmissão | Embutido |
| | Ao iniciar e parar | Avisos e comportamentos ao iniciar/parar gravação e transmissão | Embutido |
| **Operação** | Replay | Configurações do Replay | Janela `/replay?view=settings` |
| | Transições e DSK | Configurações de transições e DSK | Janela `/overlays` |
| | Multiview | Layout do multiview | Janela `/multiview` |
| | Projetores e tela cheia | Projetores e tela cheia | Embutido |
| | Atalhos e controladores | Teclado, MIDI, OSC e controles | Janela `/atalhos` |
| **Interface** | Layout da mesa | Lado dos módulos, largura dos cards, áudio à esquerda, empilhamento | Embutido |
| | Texto e densidade | Fonte, escala e densidade da interface | Embutido |
| | Janela e encaixe | Janela, encaixe e comportamento dos docks | Embutido |
| **Sistema** | Desempenho e sobre | Desempenho do motor e informações da instalação | Embutido |
| | Acesso remoto | Hub, pareamento e acesso por outros dispositivos | Janela `/hub` |
| | Automação e scripts | Macros, eventos e scripts | Janela `/macros` |
| | Projeto e recuperação | Sessões, snapshots e recuperação | Janela `/recuperacao` |
| | Diagnóstico | Logs, saúde e ZIP de diagnóstico | Janela `/diagnosticos` |
| | Atualizações | Versão, canal e atualização | Janela `/atualizacao` |
| | Motor e prioridade | Opções avançadas do motor e prioridade | Embutido |
| | Ferramentas dos plugins | Ferramentas específicas de plugins | Embutido |

## 3. Contextos que mudam a lateral

O mesmo `settings.js` define três contextos. Quando a janela é aberta por um fluxo, a lateral esconde o resto:

- **Gravação** (`context=recording`): Gravação, Saída avançada, Parâmetros do encoder, Arquivos e divisão, Trilhas de áudio, Ao iniciar e parar.
- **Transmissão** (`context=streaming`): Transmissão, Saída avançada, Parâmetros do encoder, Trilhas de áudio, Rede da transmissão, Ao iniciar e parar.
- **Saída** (`context=output`): Saída avançada, Parâmetros do encoder, Arquivos e divisão, Trilhas de áudio, Rede da transmissão, Ao iniciar e parar.

Isso faz a mesma configuração aparecer em lugares diferentes dependendo de onde o operador entrou. É a principal fonte da sensação de “etapas duplicadas”.

## 4. Abas internas das janelas externas

| Janela | Abas / seções |
|---|---|
| Áudio (`/audio`) | Mixer · Roteamento · Retornos / N-1 · Dispositivos |
| Saídas externas (`/externo`) | Saída 1–4 · NDI · OMT · SRT · Outras saídas do programa |
| Replay (`/replay?view=settings`) | Câmeras, áudio, retenção e sincronismo |
| DSK / Overlays (`/overlays`) | DSK 1–8 (fonte, entrar/sair, transição) |
| Multiview (`/multiview`) | Layout e fontes do multiview |
| Atalhos (`/atalhos`) | Teclado · MIDI · OSC |
| Automação (`/macros`) | Macros · eventos · controladores |
| Recuperação (`/recuperacao`) | Sessões · snapshots · restauração |
| Diagnóstico (`/diagnosticos`) | Logs · saúde · ZIP |
| Atualizações (`/atualizacao`) | Versão · canal · atualização |

## 5. Duplicações e problemas

1. **Gravação e Transmissão explodidas em 6 categorias cada.** `Saída avançada`, `Parâmetros do encoder`, `Arquivos e divisão`, `Trilhas de áudio`, `Rede da transmissão` e `Ao iniciar e parar` são partes do mesmo fluxo. O operador vê “Gravação”, depois “Arquivos”, depois “Encoder”, depois “Trilhas”, depois “Ao iniciar/parar”.
2. **Contextos diferentes para a mesma configuração.** Abrir por Gravação, Transmissão ou Saída muda a lateral; a mesma opção aparece em mais de um contexto.
3. **Modo simples × modo avançado.** A tela simples de Gravação/Transmissão fica somente leitura quando o modo avançado está ativo, mas “Saída avançada” continua sendo uma categoria separada. Isso duplica o caminho.
4. **Rede da transmissão × Transmissão × Saídas externas.** Destino, rede e SRT/NDI/OMT estão espalhados por três categorias.
5. **Cor dentro de Produção, separada de Vídeo.** Cor é uma aba natural de Vídeo.
6. **Interface em três categorias.** Layout, Texto/densidade e Janela/encaixe são a mesma área.
7. **Desempenho e sobre + Motor e prioridade.** Dois lugares para desempenho e opções do motor.
8. **Ferramentas no meio de configurações.** Replay, DSK, Multiview, Projetores e Atalhos abrem janelas operacionais; não são “configurações” no mesmo nível de Vídeo/Áudio.
9. **Trilhas de áudio × Áudio × Mixer.** A trilha de gravação/transmissão é uma coisa; o mixer e o roteamento são outra. Os nomes não deixam isso claro.
10. **Atualizações, Diagnóstico, Recuperação e Plugins** são muitos itens de sistema; podem ficar em um grupo “Sistema” com subtelas.

## 6. Proposta de árvore consolidada

### Produção
- **Vídeo** — abas: Quadro · Saída · Cor
- **Áudio** — abas: Dispositivos · Monitoramento · Processamento
- **Mixer de operação** — atalho para `/audio` (não é uma página de configuração)

### Saídas
- **Modo de saída** — seletor Simples / Avançado (não uma categoria separada)
- **Gravação** — abas: Básico · Arquivos · Encoder · Trilhas · Ao iniciar/parar
- **Transmissão** — abas: Básico · Destino/Rede · Encoder · Trilhas · Ao iniciar/parar
- **Saídas externas** — abas: NDI · OMT · SRT · Câmera virtual

### Operação
- **Replay**
- **Transições e DSK**
- **Multiview e projetores**
- **Atalhos e controladores**
- **Automação e macros**

### Interface
- **Interface** — abas: Aparência (texto/densidade) · Layout da mesa · Janela e encaixe

### Sistema
- **Desempenho** — abas: Geral · Motor e prioridade
- **Diagnóstico**
- **Atualizações e Sobre**
- **Recuperação de projeto**
- **Conectividade** — Acesso remoto · Rede
- **Plugins** (avançado)

Resultado: de **29 categorias** para **~16**, com as sub-abas no lugar certo. As rotas antigas (`?category=...`) podem continuar funcionando como aliases para a nova aba correspondente.

## 7. O que remover da lateral

- `color` → aba de Vídeo.
- `outputAdvanced`, `encoders`, `files`, `audioTracks`, `networkOutput`, `startstop` → abas de Gravação/Transmissão.
- `performance` + `advanced` → Desempenho.
- `plugins` → Sistema → Avançado/Plugins.
- `mixer` → atalho em Operação, não categoria de Produção.
- `projectors` → junto de Multiview.
- `updates` + “Sobre” → Atualizações e Sobre.
- `remote` + rede → Conectividade.

## 8. Observação sobre as janelas externas

As janelas **Áudio, Saídas externas, Replay, DSK, Multiview, Atalhos, Automação, Recuperação, Diagnóstico e Atualizações** continuam existindo. A diferença é que a central deixa de tratá-las como “mais uma categoria de configuração” e passa a mostrá-las como **atalhos de operação**, com o rótulo “abre janela”, sem duplicar os mesmos campos dentro da central.
