# 3Mix — Levantamento para uma Beta Instalável

**Data:** 30/10/2026
**Escopo:** o que falta para entregar uma beta do 3Mix que outra pessoa consiga instalar, abrir e operar sem ajuda do desenvolvedor.
**Base de análise:** código e artefatos locais (`3mix-engine`, `3mix-panel`, `3mix-runtime`, `entregas/`, `scripts/installer-windows/`) e os documentos `ENTREGA-ATUAL.md`, `PENDENCIAS-REAIS.md`, `ROADMAP.md`, `README.md` do instalador, `VALIDACAO.md` e `PRODUCT-VISION.md`.
**Natureza:** levantamento técnico e de produto. Não é um recibo de QA e não declara nada como aprovado; cada item traz o critério de aceite que ainda precisa ser provado.

---

## 0. Resumo executivo

O 3Mix **já tem produto**, não é só protótipo:

- motor próprio em C/C++ (fork do OBS 32.2.2, libobs) com Preview/Programa nativos, transições, DSK, áudio, replay, saídas e ISO;
- painel web grande (`mesa.html`, 294 KB) rodando dentro da janela do 3Mix como browser dock, mais `topbar.html` e dezenas de telas em `painel/remoto`;
- API local em Node (porta 8088/18188+) com WebSocket de estado, `/api/control` e mais de 100 ações;
- instalador Windows próprio (Setup C# + ZIP assinado internamente com Ed25519), desinstalador conservador, atualizador incremental com rollback e coleta de diagnóstico sanitizada;
- uma interface nova (`painel/estudio/`) que já está muito próxima dos mockups, mas ainda **não é a interface que o operador vê**.

O que separa isso de uma beta instalável não é "faltam features": é **fechar a entrega**.

Cinco bloqueadores reais, em ordem:

1. **A interface do mockup não está na plataforma real.** A `estudio/` é uma casca visual ligada a um subconjunto de comandos e roda em servidor de desenvolvimento; o operador continua vendo a `mesa.html` antiga. Este é o trabalho central pedido.
2. **O instalador está congelado em 10/10 (Native24).** Não contém o motor atual (Native38), as correções posteriores nem a interface nova. A mesa do operador recebeu a atualização incremental em 11/10, mas o **pacote completo novo nunca foi selado** — quem instalar do zero recebe o Native24.
3. **Nada foi provado em Windows limpo.** A documentação do instalador é explícita: VM limpa, Authenticode e dispositivos físicos não foram homologados. Beta sem esse teste é beta que quebra na casa do cliente.
4. **Identidade e licenciamento estão inconsistentes.** Produto, executável, instalador, pastas e documentos alternam entre "FreeMix" e "3Mix". Não existe EULA/termos de uso do produto, e a distribuição carrega OBS/libobs em GPLv3 e componentes de terceiros que exigem avisos e oferta de fonte.
5. **Não existe canal de suporte.** Há coleta de diagnóstico (ZIP sanitizado), mas não há fluxo definido de "quem instalou, o que aconteceu, para onde manda".

**Esforço estimado para a beta (1 desenvolvedor + apoio de IA, trabalho focado):** 4 a 7 semanas para os P0; mais 4 a 8 semanas se a beta precisar cobrir Calls WAN, SDI/ASIO físico, NDI Advanced e bonding — itens que hoje dependem de hardware, licença e rede externos.

**Recomendação de corte da Beta 1:** operação local, 1 operador, até 4 fontes, corte/transição/DSK/áudio, gravação e uma ou duas saídas RTMP/SRT, replay básico. Sem prometer WAN, SDI, ASIO, NDI Advanced nem importação universal de projetos de terceiros.

---

## 1. Definição de "beta instalável"

A beta só está pronta quando os 12 itens abaixo passarem **numa máquina que nunca viu o projeto**:

| # | Critério | Prova exigida |
|---|---|---|
| 1 | Instala em Windows 11 limpo, sem Node, sem Visual Studio, sem runtime de desenvolvimento | VM limpa + capturas + `report.json` |
| 2 | Abre pelo atalho e chega à mesa operacional em menos de 30 s, sem erro de porta/API | vídeo ou capturas com timestamps |
| 3 | Reconhece as fontes do computador (webcam, captura HDMI, mídia) sem editar arquivo de configuração | teste com 2 dispositivos reais |
| 4 | Preview/Programa, CUT, FADE e T-BAR funcionam com resposta perceptível abaixo de 150 ms | medição + recibo |
| 5 | DSK 1–4 entram e saem no ar de forma independente | matriz de teste |
| 6 | Áudio: fader, mute, AFV e medidores operam sem travar a interface | matriz de teste |
| 7 | Grava 30 min contínuos em Full HD sem perder arquivo | arquivo + ffprobe |
| 8 | Transmite 30 min em RTMP **ou** SRT, com reconexão após queda | recibo + log do receptor |
| 9 | Replay: grava, marca IN/OUT, reproduz A/B e volta ao vivo | recibo |
| 10 | Fecha e reabre preservando projeto, layout e configurações | recibo |
| 11 | Desinstala sem apagar projetos, mídia, gravações e configurações | `--dry-run` + `--apply` |
| 12 | Gera diagnóstico sanitizado e o usuário sabe para onde enviar | ZIP + instrução escrita |

Tudo que não estiver nessa lista pode existir, mas **não pode ser prometido** no material da beta.

---

## 2. O que já existe e funciona (com evidência local)

| Componente | Estado conferido | Evidência no workspace |
|---|---|---|
| Motor C/C++ (fork OBS 32.2.2) | Compila e roda; Preview/Programa nativos; Native38 é a fonte atual | `3mix-engine/build_2026/frontend/RelWithDebInfo/FreeMix.exe`; `3mix-runtime/fork/manifest.json` |
| Painel operacional | `mesa.html` 294.173 bytes, `topbar.html` 13.057, `freemix-call.html` 33.350 | `3mix-runtime/painel/` |
| API local | `/api/health`, `/api/control`, `/api/replay`, WebSocket de estado, abertura/fecho de janelas | `3mix-panel/ferramentas/servidor-api.mjs`, `controle-producao.mjs` |
| Ações de operação | `preview`, `active`, `cut`, `fade`, `transition`, `tbar`, `audio_mute`, `audio_volume`, `audio_bus`, `overlay`, `record`, `stream`, `media`, `score`, `gc`… | `controle-producao.mjs` (switch de ações) |
| Captura de quadro real | `GetSourceScreenshot` já usado por efeitos, calls, sinais e testes | `efeitos-producao.mjs`, `retornos-calls.mjs`, `sinais-producao.mjs` |
| Interface nova (mockup) | 13 arquivos, HTML/CSS/ES modules, Mesa/Audio/Replay/Configurações | `3mix-panel/painel/estudio/` |
| Instalador Windows | Setup C#, instalação silenciosa, atalhos, desinstalador por hash, sem Authenticode | `scripts/installer-windows/` |
| Pacote selecionado | `0.1.0-local.20261010060000`, Native24 `a047860`, 1.375.666.176 bytes | `entregas/INSTALADOR-ATUAL.json` |
| Atualização | Incremental `0.1.0-local.20261011145116` (Native38 `ed08547` + painel `71f8aa7`) **aplicada em 11/10, 18:01 BRT** (`operatorClosed: true`, backup em `updates/d94b6c77…`) | `entregas/APLICACAO-ULTIMA.json`, `3mix-runtime/version.json` |
| QA existente | Recebidos de instalação, telas, desinstalação, concorrência, matriz de DPI | `3mix-panel/qa-finalizacao/`, `qa-interface/` |
| Identidade de produto | Documento canônico de visão e posicionamento | `3mix-panel/docs/PRODUCT-VISION.md` |

**Conclusão da seção:** a base técnica existe. O que falta é integração, empacotamento e prova — não reinvenção.

---

## 3. Bloqueadores P0 (sem isso não há beta)

### P0-1 — A interface do mockup não está na plataforma real

**Situação.** O operador abre o `INICIAR-3MIX.cmd`, o motor sobe em modo estúdio (dois previews nativos) e o dock inferior carrega `painel/mesa.html`, que é a interface antiga. A `painel/estudio/` nova reproduz bem os mockups, mas:

- roda apenas no servidor de desenvolvimento (`servir-painel.mjs`, porta 8377) e não existe no runtime;
- usa **ES modules**, que o Chromium bloqueia quando a página é aberta por `file://` — e os docks atuais do OBS carregam exatamente por `file://` (`user.ini`, `ExtraBrowserDocks`);
- está ligada a um subconjunto de comandos. Exemplo concreto: o botão de DSK envia `overlay_toggle`, ação que **não existe** em `controle-producao.mjs` (a ação real é `overlay`);
- usa imagens fixas de cena em vez de quadros reais do motor;
- não tem modo "dock": mostra monitores e topbar que, na janela do 3Mix, duplicariam o Preview/Programa nativo.

**Por que bloqueia.** É a entrega visual pedida e o principal diferencial percebido. Sem isso, a beta é o OBS antigo com outro nome.

**Trabalho necessário.**

1. Criar `painel/estudio-dock.html` — página-ponte **classic script** (sem módulos) que descobre a porta real da API (8088, 18188–18198), testa `/api/health` e redireciona para `http://127.0.0.1:PORT/estudio/index.html?dock=1`. Isso resolve o bloqueio de `file://` sem empacotador.
2. Criar o modo `?dock=1` na `estudio/`: esconder topbar/monitores, manter barramentos PV/PGM, DSK, fontes 4×2, mixer e barra de status. Os monitores continuam **nativos** (qualidade e latência).
3. Corrigir o vocabulário de comandos para o da API real (`preview`, `active`, `cut`, `fade`, `tbar`, `audio_mute`, `audio_volume`, `audio_bus`, `overlay`, `record`, `stream`), com feedback de falha visível.
4. Alimentar as miniaturas das fontes com `GetSourceScreenshot` (160×90, ~1 fps, cache curto) e cair para a imagem estática só quando o motor estiver desconectado.
5. Reestilizar o dock `topbar.html` (relógios, telemetria, estado) com os mesmos tokens visuais.
6. Copiar `estudio/` e `img/cena/` para `3mix-runtime/painel/`, com backup, e apontar o dock "Mesa" para `estudio-dock.html`. **Sem tocar na instalação do operador**: validar numa cópia de QA.
7. Tema nativo `3Mix` (`.obt`) para o chrome do OBS (menus, barra de título, coluna de transição) em grafite, para o conjunto não parecer "OBS com um dock novo".

**Limite honesto de layout.** A janela nativa do OBS não permite colocar o dock *entre* Preview e Programa. A composição final será: barra de menus + Preview/Programa nativos + dock 3Mix (barramentos, DSK, fontes, mixer, status). É o mais próximo dos mockups **sem** trocar vídeo nativo por JPEG.

**Critério de aceite.**
- Abrir pelo `INICIAR-3MIX.cmd` numa cópia de QA e ver a mesa nova, sem console de erro.
- 12 controles críticos (preview, cut, fade, tbar, 4 DSK, mute, fader) operando o motor real.
- Comparação lado a lado com o mockup, com diferenças listadas.
- Nenhuma regressão em Preview/Programa nativos.

**Esforço:** 6 a 9 dias.

---

### P0-2 — O instalador está congelado em Native24 (10/10)

**Situação.** O instalador selecionado é `0.1.0-local.20261010060000` (Native24 `a047860`), com 1,28 GiB e sem Authenticode. A **mesa do operador**, porém, já recebeu a atualização incremental `0.1.0-local.20261011145116` (Native38 `ed08547` + painel `71f8aa7`): o recibo `entregas/APLICACAO-ULTIMA.json` registra aplicação em 11/10, 18:01 BRT, com `operatorClosed: true` e backup em `updates/d94b6c77-f00b-44f2-a29d-6038b5fe2d4a`. O `docs/ENTREGA-ATUAL.md` ainda descreve essa atualização como "armada, não aplicada" — **documentação desatualizada**, o que por si só é um risco de beta.

Ou seja: o operador roda Native38, mas **quem instalar do zero recebe a versão de 10/10 (Native24)**. Não existe pacote completo novo selado com o que já está em produção.

**Por que bloqueia.** Beta instalável = pacote completo, não atualização incremental sobre a máquina do desenvolvedor.

**Trabalho necessário.**
- Reconstruir o payload canônico com Native38 + painel atual + fontes novas da UI.
- Passar o contrato de sobreposição de payload (`canonical-payload-overlay-contract.json`) — o empacotador já recusou payload já selado uma vez; a correção é de autoria/revisão, não de relaxar guarda.
- Selar com Ed25519, gerar ZIP verificado, gerar Setup com `build.mjs` em destino novo (o builder recusa sobrescrever EXE existente).
- Emitir recibos: inventário, hashes, build, instalação, desinstalação.

**Critério de aceite.** Setup novo instala em pasta vazia, abre, mostra a versão nova em "Sobre", e o recibo bate com o hash publicado.

**Esforço:** 3 a 5 dias.

---

### P0-3 — Nenhuma prova em Windows limpo

**Situação.** O próprio README do instalador registra: "VM Windows limpa, Authenticode e dispositivos físicos não foram homologados nesta frente". As provas existentes rodam em raízes TEMP da máquina de desenvolvimento, com dependências já instaladas.

**Por que bloqueia.** É o teste que revela o que o desenvolvedor nunca vê: DLL faltando, Visual C++ Redistributable ausente, permissão de pasta, firewall, política de antivírus, DPI, driver de captura.

**Trabalho necessário.**
- VM Windows 11 23H2 limpa, sem Node, sem VS, sem ffmpeg.
- Instalar, abrir, criar projeto, adicionar webcam + mídia, cortar, gravar 10 min, transmitir para receptor SRT local, fechar, desinstalar, reinstalar.
- Registrar cada passo com captura e recibo; corrigir o que falhar e repetir do zero.

**Critério de aceite.** Os 12 itens da seção 1 passam na VM, com recibos datados.

**Esforço:** 3 a 5 dias (inclui correções).

---

### P0-4 — Identidade de produto inconsistente (FreeMix × 3Mix)

**Situação.** Convivem no mesmo produto: `FreeMix.exe`, `FreeMix-Studio-Setup-*.exe`, pasta `FreeMix/`, `3mix-runtime/`, `3Mix Pro` na interface, `FreeMix` nos documentos e na API (`app: "FreeMix"`), `3mix-panel` no código. Há ainda um shell Rust (`3mix-desk`, `INICIAR-3MIX-RUST.cmd`) que não faz parte do caminho de entrega e confunde quem abre a raiz do projeto.

**Por que bloqueia.** Beta com dois nomes gera desconfiança, quebra busca de suporte e complica atualização/assinatura.

**Decisão recomendada para a beta (menor risco):**
- Nome de produto: **3Mix**.
- Executável permanece `FreeMix.exe` **internamente** nesta beta (renomear agora quebraria caminhos de configuração, atualizador, atalhos e QA). Registrar como dívida técnica para a 1.0.
- Instalador, atalhos, título da janela, "Sobre", README, EULA e site passam a dizer 3Mix.
- Arquivar `INICIAR-3MIX-RUST.cmd` e `3mix-desk` fora da raiz de entrega (ou marcar como experimental).

**Critério de aceite.** Um usuário novo vê apenas "3Mix" em tudo que instala e abre; nenhuma menção a FreeMix na interface, no instalador ou no guia.

**Esforço:** 2 a 4 dias.

---

### P0-5 — Licenciamento, EULA e avisos de terceiros

**Situação.** O runtime carrega `licenses/` com GPL-3.0, NOTICE, proveniência, fontes de plugins e SDKs (incluindo NDI). **Não foi encontrado EULA/termos de uso do 3Mix** em nenhum caminho do projeto. A distribuição de um fork do OBS em GPLv3 exige cumprir a licença (texto, avisos, oferta de fonte correspondente). O NDI tem contrato próprio e o runtime NDI é excluído do pacote — o que precisa estar escrito e correto.

**Por que bloqueia.** Beta distribuída para terceiros sem EULA e sem avisos é risco jurídico e comercial, além de bloquear publicação em qualquer canal.

**Trabalho necessário.**
- EULA/termos beta (uso, sem garantia, telemetria inexistente, limites).
- Tela "Sobre" com versão, licenças e **oferta de código-fonte** (link/arquivo) para a parte GPL.
- `THIRD-PARTY-NOTICES.txt` gerado a partir de `licenses/`, com NDI, FFmpeg, CEF, Qt, plugins.
- Conferir se o ZIP da beta inclui o texto GPL e a oferta de fonte; se não, incluir.
- Se houver NDI no instalador, confirmar contrato; se não houver, dizer isso no README.

**Critério de aceite.** Instalação limpa contém `EULA.txt`, `THIRD-PARTY-NOTICES.txt`, `SOBRE` na interface e oferta de fonte acessível.

**Esforço:** 2 a 3 dias + revisão jurídica externa.

---

### P0-6 — Primeira execução e experiência de instalação

**Situação.** O instalador cria instalação vazia e **não abre o motor** (decisão correta). Mas não há um roteiro de primeira execução: o que o usuário vê ao abrir, como cria o primeiro projeto, como adiciona a primeira câmera, o que fazer se a API não subir, o que fazer se a porta estiver ocupada.

**Por que bloqueia.** Beta entregue a terceiro sem primeiro-uso guiado gera suporte imediato e percepção de produto quebrado.

**Trabalho necessário.**
- Tela de boas-vindas/verificação (motor, API, portas, permissões de gravação, espaço em disco).
- Projeto demo "Futsal" com fontes de mídia e cenas prontas (sem depender de hardware).
- Mensagens de erro acionáveis para: porta ocupada, motor desconectado, permissão negada, pasta sem espaço.
- Checklist de primeira transmissão.

**Critério de aceite.** Usuário sem conhecimento prévio instala, abre, cria projeto e faz um CUT em menos de 10 min seguindo o guia de uma página.

**Esforço:** 2 a 3 dias.

---

### P0-7 — Desempenho e responsividade da mesa

**Situação.** `mesa.html` tem 294 KB, 59 usos de `innerHTML`, 4 `setInterval` e 45 `addEventListener`, com re-render de blocos grandes a cada atualização de estado. A documentação já registra "botões/lentidão" como frente aberta e pede medição sob carga representativa e longa duração. A interface nova é mais leve, mas **não foi medida dentro do CEF do programa**.

**Por que bloqueia.** Beta de broadcast com lentidão no corte é inaceitável, e é o segundo pedido explícito do dono ("melhorar a velocidade").

**Trabalho necessário.**
- Instrumentar: `performance.mark` no clique e na confirmação de estado; medir Preview→PV, Cut→PGM, frame de medidor.
- Metas: p95 de Cut ≤ 120 ms (clique → Programa), frame de UI ≤ 16 ms, CPU ociosa ≤ 3% de um núcleo, memória do dock ≤ 300 MB.
- Substituir reconstrução total por atualização por chave (canal/fonte), medidores em `requestAnimationFrame` com `transform`, estado limitado a ~10 Hz.
- Medir a mesa antiga e a nova no mesmo cenário e registrar a tabela comparativa.

**Critério de aceite.** Tabela antes/depois com as metas atingidas em 30 min de operação contínua.

**Esforço:** 2 a 3 dias.

---

### P0-8 — Suporte e diagnóstico para quem instalou

**Situação.** Existe `COLETAR-LOGS.cmd` e o diagnóstico gera ZIP sanitizado (tokens, cookies, chaves SRT omitidos), mas não há fluxo definido: para onde enviar, o que responder, qual SLA, como identificar a instalação.

**Por que bloqueia.** Beta é, por definição, produto com defeito. Sem canal de retorno, o defeito vira abandono.

**Trabalho necessário.**
- Botão "Gerar diagnóstico" com identificador de instalação e versão no nome do arquivo.
- Instrução de envio (e-mail/WhatsApp/pasta compartilhada) no guia.
- Formulário de relato: o que fazia, o que esperava, o que aconteceu, anexo do ZIP.
- Página `LIMITES-CONHECIDOS.md` com o que já se sabe que não funciona.

**Critério de aceite.** Um testador externo gera o ZIP e o envia sem perguntar nada.

**Esforço:** 1 a 2 dias.

---

### P0-9 — Assinatura Authenticode e canal de atualização HTTPS

**Situação.** O Setup não tem Authenticode (só assinatura interna Ed25519), então o Windows mostrará aviso do SmartScreen. O canal de atualização HTTPS depende de destino/domínio/certificado que o projeto declara não possuir.

**Por que bloqueia (com nuance).** Para beta fechada, é possível conviver com o aviso do SmartScreen **desde que o README explique e publique o SHA-256**. Para beta aberta, é bloqueador comercial.

**Decisão necessária do dono:** beta fechada (conviver com aviso) ou beta aberta (comprar certificado EV/OV e publicar em HTTPS).

**Esforço:** 1 dia de integração + prazo externo do certificado (dias a semanas).

---

## 4. P1 — lacunas funcionais que impedem uso profissional (não impedem a beta)

| Frente | O que falta | Impacto | Esforço |
|---|---|---|---|
| Calls WAN | Prova com convidados reais, TURN/VPS, duas redes; vídeo contínuo por fonte (hoje JPEG 640×360 até 5 fps) | Não prometer externa remota na beta | 3 a 6 semanas + infra |
| NDI/OMT/SRT físico | Ensaio com receptor/hardware real; NDI Advanced exige SDK/licença | Vender só o que foi testado | externo |
| SDI/ASIO/HDR/PTZ | Equipamento, driver, receptor; HDR está somente leitura | Não prometer | externo |
| Bonding | Prova em duas redes reais com VPS/TURN | Fora da beta | externo |
| Replay | O ensaio Native39 falhou no contador de seek do TS em 12/10; o endurance de 17/10 passou. Falta reproduzir o caso e fechar | Replay instável em casos específicos | 2 a 5 dias |
| `.fmx` ida e volta | Importação explícita existe; round-trip completo entre versões/instalações não está provado | Migração de cliente falha | 3 a 5 dias |
| Propriedades/Filtros nativos | Diálogos próprios ainda na fila; hoje abre o nativo do OBS | Visual inconsistente | 1 a 2 semanas |
| Longa duração | 4 câmeras Full HD por 8 h, memória, temperatura, queda de帧 | Estabilidade não comprovada | 2 a 3 dias + correções |
| MIDI/OSC/controladores | Backend e testes delimitados; falta ensaio com controlador físico | Não prometer | externo |
| Manual do usuário | Não existe manual completo; só docs técnicos | Suporte caro | 4 a 6 dias |
| Documentação operacional | `ENTREGA-ATUAL.md` descreve a atualização de 11/10 como não aplicada, mas o recibo prova o contrário; versões se contradizem entre docs | Testador não sabe o que tem em mãos | 1 dia |

---

## 5. P2 — polimento pós-beta

- Temas claro/escuro e escala de interface.
- Multiview com layouts sociais (9:16, safe zones) — engine existe, falta acabamento.
- Galeria de GC/títulos e biblioteca de mídia.
- Atalhos globais e macros gravadas.
- Traduções (pt-BR/en/es).
- Telemetria opt-in de uso (hoje não existe; se entrar, precisa de consentimento).
- Landing page, vídeo de apresentação, material de venda.

---

## 6. Fora do escopo declarado da Beta 1

Para não repetir o padrão de prometer e não provar:

- Chamadas remotas WAN com convidados;
- SDI, ASIO, HDR fim-a-fim, PTZ, MIDI físico;
- NDI Advanced / HDR;
- Bonding multipath;
- Importação universal de projetos vMix/`.fmx` de terceiros;
- Edição de propriedades/filtros com interface própria;
- Publicação em loja, auto-update em nuvem, telemetria.

Esses itens entram na 1.0 ou em beta posteriores, cada um com seu gate.

---

## 7. Roteiro de aceite da beta (12 cenários)

Executar **na VM limpa**, na ordem, com recibo por cenário:

1. Instalação silenciosa em pasta nova + atalho.
2. Primeira abertura + verificação de motor/API/portas.
3. Projeto demo + 4 fontes (2 reais, 2 mídia).
4. PV/PGM + CUT + FADE + T-BAR (20 ciclos, medir p95).
5. DSK 1–4: TAKE/AUTO individual, sem derrubar o Programa.
6. Áudio: fader, mute, AFV, medidor em 7 canais.
7. Gravação 30 min Full HD; validar arquivo com ffprobe.
8. Transmissão 30 min + derrubar rede + reconectar.
9. Replay: gravar 5 lances, marcar, A/B, voltar ao vivo.
10. Fechar e reabrir: projeto, layout e configurações preservados.
11. Atualização e rollback (se canal existir) ou update manual documentado.
12. Desinstalar `--dry-run`, depois `--apply`; conferir preservação de dados.

Cada cenário gera `{cenario, inicio, fim, resultado, evidencia, versao, hash}` em `qa-beta/`.

---

## 8. Sequência recomendada (ondas)

| Onda | Conteúdo | Duração | Gate |
|---|---|---|---|
| 1 | Dock 3Mix no runtime + comandos reais + tema | 6–9 dias | Mesa nova abre e opera no 3Mix |
| 2 | Desempenho medido e corrigido | 2–3 dias | Metas de latência/CPU |
| 3 | Identidade 3Mix + EULA + avisos + Sobre | 3–5 dias | Nada diz "FreeMix" na interface |
| 4 | Pacote completo novo (Native38 + painel) | 3–5 dias | Setup novo instalado em pasta vazia |
| 5 | Windows limpo + correções | 3–5 dias | 12 cenários PASS |
| 6 | Onboarding + suporte + selagem final | 3–4 dias | Beta entregável |

**Total:** 20 a 31 dias de trabalho focado (4 a 7 semanas em calendário realista, com retrabalho).

---

## 9. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Renomear `FreeMix.exe` quebrar configuração/atualizador | Alta | Alto | Manter binário; mudar só a marca externa nesta beta |
| ES modules bloqueados em `file://` | Certa | Alto | Página-ponte + servir por HTTP local (já previsto) |
| Docks apontando para porta errada | Média | Alto | Descoberta de porta + fallback + mensagem clara |
| Pacote de 1,3 GB e tempo de instalação | Média | Médio | Documentar requisitos e espaço; medir |
| SmartScreen assustar testador | Alta | Médio | SHA-256 publicado + instrução com captura |
| Replay falhar em caso específico de TS | Média | Alto | Reproduzir e corrigir antes de prometer replay |
| Falta de tempo para Windows limpo | Média | Alto | Reservar a onda 5 antes de anunciar a beta |

---

## 10. Decisões que só o dono pode tomar

1. **Beta fechada ou aberta?** Define Authenticode, EULA e canal de distribuição.
2. **Nome do executável:** manter `FreeMix.exe` na beta (recomendado) ou renomear agora.
3. **O que entra na Beta 1:** a lista da seção 6 é o corte recomendado; confirmar.
4. **Canal de suporte:** e-mail, WhatsApp ou pasta compartilhada.
5. **Preço/licença da beta:** gratuita com prazo, ou paga com desconto para a 1.0.
6. **Certificado de assinatura:** comprar EV/OV agora ou aceitar o aviso do SmartScreen.

---

## 11. O que este levantamento **não** afirma

- Não afirma que os 12 cenários passam hoje.
- Não afirma que o instalador de 10/10 representa o código atual.
- Não afirma que o Replay está estável em todos os casos.
- Não afirma que a interface nova está funcional no motor real — ela está visualmente pronta e funcionalmente parcial.
- Não substitui os recibos de QA já existentes; eles valem pelo escopo declarado em cada um.
