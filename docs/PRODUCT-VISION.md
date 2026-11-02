# POSICIONAMENTO DO 3MIX — REGRA DE PRODUTO & EVOLUÇÃO VISUAL MODULAR

O **3Mix** (anteriormente chamado FreeMix) **não existe para ser um clone jurássico do vMix nem uma skin rasa do OBS**.

O projeto assume formalmente a marca **3Mix**, superando a conotação restritiva de produto "eterno grátis" e posicionando-se como uma suíte de produção broadcast profissional, modular e comercialmente sustentável.

A tese fundamental do **3Mix** é a fusão de 4 grandes escolas de engenharia broadcast:
1. **Mesa Híbrida & Modular (estilo VidBlasterX):** Módulos funcionais independentes encadeáveis (Módulos de Câmeras, Players DDR com Trim/Gain, Still Stores, Painel de Corte Switcher estilo ATEM com botões dedicados e status de stream/rec visíveis).
2. **Mixer de Áudio Broadcast Pro (estilo ATEM Fairlight / ProTools):** Channel strips verticais modulares, VU meters estéreo de altíssima precisão com escalas broadcast, controle tátil de Ganho de Entrada (Input Gain), Pan, Mute, Solo, AFV inteligente e Auto-Ducking linear suave.
3. **Ergonomia e Layer Stacks Modernas (estilo MimoLive):** Interface limpa, painéis escuros modernos, janelas flutuantes organizáveis, status em pílulas visuais elegantes (sem o excesso de menus cinzentos e obsoletos da interface de 2012 do vMix).
4. **Resolução dos Defeitos Históricos do Mercado:** Retorno N-1 Mix-Minus automático, Return Feeds SRT dedicados, Playout com Ajuste de Ganho por clipe individual (TriCaster DDR), Incident Blackbox de 60s, Pre-Flight de segurança e Broadcast Delay com Censura DUMP imediata ao keyframe.

---

## 1. O 3Mix não é uma skin nem cópia fóssil

Trocar apenas ícone, cores ou copiar a UI jurássica do vMix não cria o 3Mix.
A interface do 3Mix é modular, desacoplada e fluida, permitindo separar janelas flutuantes, organizar canais de corte e mixer conforme a necessidade da operação.

O operador não deve precisar entender:

- Scene;
- Source;
- Scene Item;
- docks do OBS;
- filtros espalhados;
- plugins independentes;
- configurações internas do OBS.

Esses conceitos podem existir internamente.

Externamente, o 3Mix deve falar a linguagem de produção e broadcast moderno.

---

## 2. A Identidade Visual do 3Mix: A "Super Mistura" Broadcast

O 3Mix não adota a aparência obsoleta e cinzenta do vMix (cuja GUI pouco evoluiu desde 2012). O 3Mix é uma síntese ergonômica das melhores ferramentas da indústria:

```
                  ┌──────────────────────────────────────────────────┐
                  │                    3Mix STUDIO                   │
                  └────────────────────────┬─────────────────────────┘
                                           │
         ┌──────────────────┬──────────────┴─────┬──────────────────┐
         │                  │                    │                  │
         ▼                  ▼                    ▼                  ▼
   [MotionCaster]    [VidBlasterX]          [MimoLive]         [TriCaster]
  - Mixer Pro com     - Módulos             - Layer Stacks     - Ajuste de ganho
    faders azuis e      independentes         limpas e pílulas   pré-fader por
    VU meters estéreo   encadeáveis           visuais LIVE       clipe no DDR
  - Gauges de sistema - Still Stores com    - Janelas          - Macros ao vivo
    circulares          Grab/Save             flutuantes
  - DSK 1 a 4 com     - Switcher estilo       organizáveis
    TAKE/AUTO e tempo   hardware ATEM
  - Chromakey com
    alfa checkerboard
```

### Detalhamento dos Componentes do 3Mix:

1. **AudioMixer Broadcast (Inspirado no MotionCaster & ATEM Fairlight):**
   - Channel strips verticais refinados com faders azuis finos e track minimalista.
   - VU meters de alta resolução estéreo (-inf a 0dB) com peak hold vermelho.
   - Botões na base de cada strip: **Mute** (Alto-Falante), **Solo/Monitor** (Fone de Ouvido) e **AFV** ("F" - Audio Follows Video).
   - Controle superior de Ganho de Entrada (Input Gain) e Pan estéreo calibrado.

2. **Telemetria de Sistema em Gauges Circulares (MotionCaster System):**
   - Gráficos circulares percentuais modernos para:
     - **CPU %**
     - **Memory %**
     - **GPU %**
     - **GPU Memory %**
     - **Video Engine %**

3. **Módulos Encadeáveis e Still Stores (VidBlasterX):**
   - Módulos independentes para Players DDR (com controle de ganho individual por clipe), Still Stores (com botões de captura rápida `Grab`, `Save`, `Prev`, `Next`), e canais de streaming com vúmetros dedicados.
   - Painel Switcher com botões dedicados de Program e Preview e controle de transições.

4. **Incident Blackbox, Pre-Flight, Delay e Return Feeds:**
   - Recursos de nível enterprise exclusivos do 3Mix integrados organicamente na interface.

---

# 3. A unidade principal do 3Mix é o INPUT

O operador pensa em:

- CAM 1;
- CAM 2;
- CALL JOÃO;
- VT ABERTURA;
- GC;
- REPLAY;
- PLAYLIST;
- PLACAR;
- ENTREVISTA 2 BOX.

Não em Scenes.

Um Input 3Mix pode conter internamente:

- vídeo;
- áudio;
- layers;
- efeitos;
- crop;
- LUT;
- data;
- triggers;
- routing;
- replay;
- retornos.

Mas continua sendo **um Input na mesa**.

A arquitetura interna deve se adaptar à experiência do operador, e não o contrário.

---

# 3. Preservar a lógica visual de mesa de corte

A tela principal deve continuar familiar para operadores vindos de vMix e switchers tradicionais:

- Preview;
- Program;
- transições;
- T-Bar;
- bandeja de Inputs;
- Mixer;
- Replay;
- Overlay;
- Record;
- Stream;
- External;
- Playlist.

Essa familiaridade é deliberada.

Não reinventar o paradigma visual da mesa principal sem motivo.

O diferencial deve estar principalmente na profundidade e integração das funções.

---

# 4. O 3Mix precisa reduzir passos

Uma das razões de existir do produto é eliminar tarefas manuais repetitivas.

Exemplos:

### No lugar de:
criar várias cenas para entrevista,

o 3Mix deve permitir:

> criar um Input composto com slots.

### No lugar de:
criar quatro buses manualmente para quatro Calls,

o 3Mix deve oferecer:

> N-1 automático por participante.

### No lugar de:
montar macros complexas,

o 3Mix deve oferecer:

> triggers e ações visuais.

### No lugar de:
duplicar composição horizontal e vertical,

o 3Mix deve permitir:

> variantes de layout dentro do mesmo Input.

### No lugar de:
abrir plugin externo,

o 3Mix deve integrar:

> a função diretamente na operação.

---

# 5. O 3Mix precisa integrar coisas que hoje são separadas

Esta é uma das maiores razões de existir.

Hoje um operador pode depender de:

- OBS;
- plugin de replay;
- plugin NDI;
- plugin multistream;
- navegador/VDO.Ninja;
- scripts;
- Companion;
- software de GC;
- painel RCP;
- player de VTs;
- ferramentas de rede.

O 3Mix não precisa reinventar todas as tecnologias.

Precisa oferecer uma **experiência unificada**.

O usuário deveria enxergar:

> INPUTS  
> AUDIO  
> REPLAY  
> CALLS  
> GRAPHICS  
> DATA  
> OUTPUTS  
> AUTOMATION

e não uma coleção de plugins.

---

# 6. O 3Mix precisa resolver problemas do vMix, não apenas imitá-lo

A aparência e parte do workflow podem ser inspiradas no vMix porque ele é uma boa referência operacional.

Mas não devemos copiar também suas limitações.

Exemplos já identificados:

- dificuldade de composições complexas;
- Layers pouco dinâmicos;
- organização de muitos Inputs;
- vertical ainda tratado como adaptação;
- mix-minus e Calls mais trabalhosos do que deveriam;
- buses com limites fixos;
- replay com limitações de API e workflow;
- configuração de DataSources dispersa;
- necessidade de scripts para várias automações;
- outputs auxiliares com restrições;
- atalhos frágeis quando dependem de posições;
- interface de replay pouco flexível.

A regra deve ser:

> **copiar a boa lógica operacional, não os defeitos históricos.**

---

# 7. As razões objetivas para escolher o 3Mix

O 3Mix precisa perseguir estas vantagens concretas:

### 1. Inputs em vez de Scenes

Composição complexa aparece como Input simples para o operador.

---

### 2. Layers e Slots dinâmicos

Trocar quem ocupa um quadro sem criar outra cena.

---

### 3. Áudio broadcast mais simples

- buses;
- N-1;
- IFB;
- talkback;
- retorno de Call;
- matrix routing.

Sem configurar dezenas de rotas manualmente.

---

### 4. Calls integrados

3Mix Call deve cuidar de:

- conexão;
- áudio;
- vídeo;
- retorno;
- N-1;
- tally;
- talkback;
- reconexão.

---

### 5. Replay realmente profissional

- multicâmera;
- gravação contínua;
- eventos;
- Replay A/B;
- timeline;
- jog;
- tags;
- playlists;
- curvas de velocidade;
- busca;
- exportação;
- operação remota.

---

### 6. Vertical como cidadão de primeira classe

Não um crop da saída horizontal.

Permitir:

- Mix vertical;
- Preview vertical;
- Program vertical;
- Multiview vertical;
- layout próprio;
- GC próprio;
- framing próprio;
- output próprio.

---

### 7. Graphics + DataSources integrados

GC não deve ser apenas browser HTML.

O sistema deve ter:

- templates;
- Data Presets;
- CSV;
- XLSX;
- JSON;
- HTTP;
- bindings;
- triggers;
- profiles de convidados;
- overlays 1–8.

---

### 8. Output Engine livre

Qualquer Mix deve poder alimentar:

- Stream;
- Record;
- DeckLink;
- SDI;
- NDI;
- OMT;
- SRT;
- RIST;
- projector;
- clean feed;
- vertical;
- AUX.

Sem cada saída viver em um plugin diferente.

---

### 9. Playlist/VT profissional

Player com:

- Preview;
- Program;
- TAKE;
- preload;
- IN/OUT;
- Freeze;
- Loop;
- Link;
- Auto Next;
- cadeia de clips.

---

### 10. Automação integrada

- atalhos;
- macros;
- triggers;
- Smart Actions;
- MIDI;
- Stream Deck;
- Companion;
- API;
- OSC.

Todos utilizando o mesmo registry de comandos.

---

# 8. Confiabilidade também é diferencial

Não basta ter mais funções.

Uma ferramenta broadcast precisa lidar bem com falhas.

O 3Mix deve ter:

- autosave;
- recovery;
- backup do preset;
- watchdog;
- reconnect;
- mídia ausente;
- câmera desconectada;
- output com erro;
- disco cheio;
- stream caindo;
- log operacional;
- health por Input.

A filosofia deve ser:

> **falhar isoladamente, nunca derrubar tudo quando um componente falha.**

---

# 9. Não adicionar recurso só porque existe plugin

Antes de incorporar qualquer plugin ou projeto externo, responder:

### Este componente:
1. reduz passos?
2. elimina uma limitação?
3. integra algo hoje separado?
4. melhora confiabilidade?
5. melhora operação ao vivo?

Se a resposta for **não** para tudo:

não incorporar.

---

# 10. Não criar uma colcha de retalhos

A arquitetura deve convergir para engines centrais:

```text
3Mix UI

↓
3Mix Core API

↓
Input Engine
Audio Bus Engine
Replay Engine
Graphics/Data Engine
Media Engine
Output Engine
Project Engine
Automation Engine

↓
libobs + FFmpeg + componentes especializados
```

Plugins e bibliotecas não devem controlar diretamente a experiência do operador.

Devem alimentar esses engines.

---

# 11. Não abrir interfaces originais de plugins

Se uma função está integrada ao 3Mix:

o usuário deve controlar pela UI 3Mix.

Exemplos:

- Replay;
- NDI;
- OMT;
- SRT;
- Multistream;
- DeckLink;
- Calls;
- Graphics.

Abrir a janela original de um plugin deve ser considerado fallback de desenvolvimento, não fluxo final.

---

# 12. Identidade própria

O objetivo visual não é fingir que o programa é o vMix.

O objetivo é oferecer:

> familiaridade imediata + identidade 3Mix.

Preservar conceitos reconhecíveis:

- Preview verde;
- Program vermelho;
- Input tiles;
- Mixer lateral;
- transições;
- T-Bar.

Mas desenvolver:

- iconografia própria;
- Settings próprio;
- Replay próprio;
- Calls próprio;
- DataSource Manager próprio;
- Output Manager próprio.

---

# 13. O 3Mix não precisa competir com libobs

Não refazer do zero aquilo que já funciona bem.

Aproveitar:

- captura;
- renderização;
- filtros;
- codecs;
- hardware encoders;
- device support;
- browser;
- áudio básico;
- streaming.

O diferencial está acima disso.

A lógica é semelhante a:

> usar um motor pronto para construir um produto diferente.

---

# 14. Regra para toda nova feature

Antes de desenvolver qualquer função, responder:

> **Por que alguém usaria isso no 3Mix em vez de fazer a mesma coisa no OBS ou no vMix?**

Uma resposta válida precisa ser algo como:

- menos passos;
- integração melhor;
- operação mais segura;
- capacidade nova;
- workflow melhor;
- mais flexibilidade;
- melhor automação;
- melhor organização.

“Porque também temos” não é resposta válida.

---

# 15. Antiobjetivos

O 3Mix **não deve virar**:

- OBS com tema de vMix;
- launcher do OBS;
- pacote de plugins;
- coleção de Web Docks;
- sistema em que cada módulo possui interface própria;
- cópia pixel a pixel do vMix;
- software com muitas features sem integração;
- produto cujo operador precisa conhecer a arquitetura interna.

---

# 16. Pergunta de validação do projeto

Periodicamente, avaliar o 3Mix com esta pergunta:

> **Se retirarmos a aparência parecida com vMix, ainda existem razões fortes para alguém escolher o 3Mix?**

Se a resposta for não:

o produto está indo na direção errada.

A resposta desejada é:

> Sim, porque a operação é mais simples, os módulos são mais integrados, o áudio é mais inteligente, o replay é melhor, vertical é nativo, Calls são mais fáceis, outputs são mais livres e automações exigem menos gambiarra.

---

# 17. Objetivo final

O 3Mix deve se tornar:

> **uma mesa de corte, streaming e produção ao vivo completa, construída sobre tecnologias maduras, mas com uma experiência operacional própria, mais integrada e mais eficiente que a soma das ferramentas que utiliza.**

O objetivo não é substituir o OBS tecnicamente.

O objetivo é permitir que o usuário **não precise operar como usuário de OBS**.
