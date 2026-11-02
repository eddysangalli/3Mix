# 3Mix — Limites conhecidos desta beta

Lista factual do que **não funciona** ou **ainda não foi provado** nesta beta do 3Mix. Cada item cita a fonte exata de onde a informação foi tirada — nenhum número ou status aqui foi inventado. As duas fontes principais são [`LEVANTAMENTO-BETA-20261030.md`](LEVANTAMENTO-BETA-20261030.md) (levantamento de 30/10/2026, que lista o que falta para uma beta instalável) e [`PENDENCIAS-REAIS.md`](PENDENCIAS-REAIS.md) (histórico técnico de pendências e homologações).

Se um recurso não está nesta lista, isso não é garantia de que ele foi aprovado — consulte sempre a fonte citada para o status exato antes de prometer algo a um usuário final.

---

## Revisão de evidências — P0 em execução

Esta revisão prevalece sobre afirmações históricas conflitantes abaixo. Não equivale a nova homologação operacional.

- **Pacote posterior localizado:** existe `entregas/FreeMix-Completo-0.1.0-local.20261102162909/`. O manifesto de instalador selecionado ainda aponta para outubro; pasta de pacote não comprova promoção do instalador. A baseline em `qa-finalizacao/p0/baseline-rastreabilidade.json` confirma motor idêntico por SHA-256 entre pacote e runtime e paridade dos seis arquivos de painel/API/Replay amostrados. Não comprova paridade integral.
- **Termos existem na fonte:** `docs/EULA.txt` já foi escrito. A pendência é revisão jurídica e distribuição comprovada, não ausência de texto. Os caminhos `docs/EULA.txt` e `docs/LIMITES-CONHECIDOS.md` não foram encontrados no runtime/pacote na baseline.
- **Replay tem superfícies diferentes:** `painel/estudio/js/telas/replay.js` ainda contém controles locais de quadro/início/fim e marcadores. Os recibos `qa-beta/recibos/replay-ajustes-20261101.md` demonstram avanços em outra superfície e não encerram essa lacuna.
- **Native39:** a entrada de 12/10 em `PENDENCIAS-REAIS.md` descreve falha inicial SourceRecord com `fetch failed` e gates seguintes não executados. Não atribuir esse recibo a contador de seek sem outra evidência específica.
- **Endurance:** há alegação histórica de PASS em `PENDENCIAS-REAIS.md`, mas o JSON referenciado não foi localizado nesta inspeção. Classificação: evidência não recuperada; não declarar PASS nem regressão com base apenas no texto.
- **Desempenho:** 0,1–0,2 ms mede trechos do laço JS, não clique até imagem exibida. O round-trip CUT de 178,2 ms p50 / 286,9 ms p95 tem escopo próprio; nenhum desses dados substitui ensaio prolongado no CEF com carga.
- **Windows limpo e carga prolongada:** seguem sem novo ensaio nesta frente. Não substituir por testes simulados.

Recibos desta execução: `qa-finalizacao/p0/RESULTADO-P0.md` e artefatos da mesma pasta. Nenhuma instalação do operador foi modificada por esta frente.

---

## Em andamento agora: pedidos de quem vai testar

Frentes abertas em 02/11/2026, nesta ordem. Só viram recurso disponível depois de testadas no motor real.

| # | Frente | Pedido por | Estado |
|---|---|---|---|
| 1 | Atraso de vídeo por entrada, junto do atraso de áudio | Paulo Medeira | **Pronto.** No menu de cada entrada: vídeo de 0 a 500 ms, em passos de um quadro, e áudio de -950 a 20000 ms. Medido em gravação: 33, 100, 200, 333 e 500 ms deram 1, 3, 6, 10 e 15 quadros a 30 fps. Limite: o valor em quadros é calculado ao aplicar; se o FPS do projeto mudar, é preciso aplicar de novo |
| 2 | Host VST3 nativo de 64 bits | Paulo Medeira | **Pronto.** No mixer, em cada canal, e na aba Plugins do Master e dos barramentos: lista os VST3 instalados no Windows, adiciona, liga, desliga, abre a janela do plugin e remove. Testado em 53 plugins instalados: 51 carregam e o motor não caiu em nenhum. Ajuste feito na janela chega ao áudio e volta depois de uma queda forçada do motor. Limites logo abaixo da tabela |
| 3 | Várias saídas DeckLink, cada uma com seu M/E | Richard Moraes | **Pronto no programa; falta testar com placa.** Em Saídas › SDI / DeckLink, até 16 saídas, cada uma com placa, modo, conteúdo (Programa, PGM de qualquer M/E ou qualquer entrada) e áudio próprios. A mesma placa não entra no ar em duas saídas. Testado sem placa: seleção, gravação separada e recusas. Vídeo saindo por SDI, várias saídas no ar ao mesmo tempo, consulta de placas com outra saída no ar e a recusa de placa em uso dependem do teste do Richard |

Limites do VST3, medidos nos testes:

- Latência do plugin não é compensada. O som atrasa em relação ao vídeo: Clear 5310 amostras (cerca de 110 ms), Pro-L 2 3115 (cerca de 65 ms), Graillon 1074 (cerca de 22 ms). Por enquanto se corrige no atraso de áudio da entrada.
- O plugin carrega na thread da interface. O Auto-Tune segurou a interface por mais de 25 s e não terminou de carregar no teste; a causa não foi confirmada, e pode ser a licença. Ao ser encerrado à força nesse estado, o motor de teste ficou preso e o Windows não conseguiu finalizá-lo. Não adicione plugin novo durante uma transmissão.
- O FabFilter One foi recusado, porque não oferece a entrada de áudio que o filtro exige.
- Twin 3 e RePitch ficaram em silêncio com o tom de teste. O Pro-L 2 também, mas nele a causa está na própria janela: o período de avaliação acabou. Plugin sem licença pode cortar o som.
- De um arquivo com vários efeitos, só o primeiro é usado.
- Plugin que não abre deixa o áudio passar direto, e o motivo fica só no log do motor.
- Testado com tom e medidor. Ainda não foi avaliado de ouvido, nem em máquina limpa, nem durante transmissão.

Também pedido, sem frente própria: uso mais leve de CPU e GPU. Depende de medir sob carga antes de mudar qualquer coisa; o ensaio prolongado está na P0 de estabilidade.

---

## 1. Bloqueadores para considerar a beta "instalável" (P0)

Estes nove itens estão listados como bloqueadores no levantamento de 30/10/2026 (`LEVANTAMENTO-BETA-20261030.md`, seção 3). Nenhum deles impede o uso do 3Mix em ambiente de desenvolvimento/QA, mas todos impedem tratar o pacote atual como uma beta pronta para instalação por terceiros sem ressalvas.

| # | Item | Situação resumida | Fonte |
|---|---|---|---|
| P0-1 | Interface nova do mockup ainda não está no runtime do operador | A interface nova (`painel/estudio/`) roda só em servidor de desenvolvimento; o operador ainda vê a interface antiga (`mesa.html`) | `LEVANTAMENTO-BETA-20261030.md`, seção P0-1 |
| P0-2 | Instalador completo está congelado numa build de 10/10/2026 (Native24) | A instalação local já roda uma versão mais nova (Native38, 11/10/2026), mas não existe pacote completo novo selado para distribuição | `LEVANTAMENTO-BETA-20261030.md`, seção P0-2; `entregas/INSTALADOR-ATUAL.json`; `entregas/APLICACAO-ULTIMA.json` |
| P0-3 | Nenhuma prova em Windows "limpo" | Todas as provas existentes rodam em máquina de desenvolvimento, com dependências já instaladas; não há teste documentado em VM Windows 11 limpa | `LEVANTAMENTO-BETA-20261030.md`, seção P0-3; `scripts/installer-windows/README.md` ("VM Windows limpa, Authenticode e dispositivos físicos não foram homologados nesta frente") |
| P0-4 | Identidade de produto inconsistente (FreeMix × 3Mix) | Executável, pastas e parte da documentação ainda usam "FreeMix"; decisão registrada é manter o executável interno como está nesta beta e usar "3Mix" em tudo que é visível ao usuário | `LEVANTAMENTO-BETA-20261030.md`, seção P0-4 |
| P0-5 | Sem EULA/termos de uso do 3Mix | O runtime traz avisos de licença de terceiros (GPL-3.0, NDI etc.), mas não foi encontrado um EULA/termos de uso próprio do produto | `LEVANTAMENTO-BETA-20261030.md`, seção P0-5 |
| P0-6 | Sem roteiro guiado de primeira execução | Não há tela de boas-vindas, projeto demo ou checklist de primeira transmissão | `LEVANTAMENTO-BETA-20261030.md`, seção P0-6 |
| P0-7 | Desempenho da mesa não medido dentro do motor real | A interface antiga tem indícios de lentidão sob carga (muitas atualizações de tela); a interface nova é mais leve mas não foi medida dentro do navegador embutido do programa | `LEVANTAMENTO-BETA-20261030.md`, seção P0-7 |
| P0-8 | Canal de suporte não definido | A coleta de diagnóstico (ZIP) existe e funciona, mas não há destino, SLA nem formulário de relato formalizados | `LEVANTAMENTO-BETA-20261030.md`, seção P0-8; ver [`SOLICITAR-SUPORTE.md`](SOLICITAR-SUPORTE.md) |
| P0-9 | Sem assinatura Authenticode | O instalador usa apenas assinatura interna Ed25519; o Windows SmartScreen vai alertar o usuário ao abrir o instalador | `LEVANTAMENTO-BETA-20261030.md`, seção P0-9 |

---

## 2. Recursos que dependem de hardware, rede ou licença externos (fora do escopo desta beta)

Estes itens estão explicitamente listados como **fora do escopo declarado da Beta 1** (`LEVANTAMENTO-BETA-20261030.md`, seção 6) — não prometa nenhum deles a um usuário final sem deixar claro que ainda não foi testado nesta beta:

- **Chamadas remotas (Calls) via WAN com convidados reais.** O que existe hoje é testado com vídeo sintético/local; vídeo contínuo por fonte usa JPEG em até 640×360 a até 5 fps, não vídeo contínuo real por fonte. *Fonte: `LEVANTAMENTO-BETA-20261030.md` seção 4 (tabela P1, linha "Calls WAN"); `entregas/INSTALADOR-ATUAL.json` campo `limits`.*
- **SDI, ASIO físico, HDR fim a fim e PTZ com equipamento real.** Dependem de equipamento, driver e receptor físicos; QA de software não substitui esse teste. HDR hoje está instalado apenas em modo de leitura. *Fonte: `LEVANTAMENTO-BETA-20261030.md` seção 4, linha "SDI/ASIO/HDR/PTZ"; `PENDENCIAS-REAIS.md` (tabela de prioridades, linha "Externo — hardware/licença/rede/certificado").*
- **NDI Advanced.** Recursos que exigem SDK/licença adicional da NDI não foram habilitados nem testados. *Fonte: `LEVANTAMENTO-BETA-20261030.md` seção 4, linha "NDI/OMT/SRT físico".*
- **Bonding multipath em redes reais.** A prova existente é em loopback/rede local; falta prova com duas redes reais, VPS e TURN. *Fonte: `LEVANTAMENTO-BETA-20261030.md` seção 4, linha "Bonding"; `PENDENCIAS-REAIS.md`, linha "WAN/bonding".*
- **Importação universal de projetos de terceiros** (vMix ou outros formatos `.fmx` de origem externa não controlada). *Fonte: `LEVANTAMENTO-BETA-20261030.md` seção 6.*
- **Instalação/operação em Windows "limpo"** (máquina sem nenhuma ferramenta de desenvolvimento pré-instalada). *Fonte: `LEVANTAMENTO-BETA-20261030.md` seção P0-3; `scripts/installer-windows/README.md`.*
- **Publicação em loja, auto-atualização em nuvem e telemetria.** Nenhum dos três existe hoje; se telemetria for adicionada no futuro, o levantamento já registra que precisará de consentimento explícito (opt-in). *Fonte: `LEVANTAMENTO-BETA-20261030.md` seções 5 e 6.*

---

## 3. Lacunas funcionais que não impedem a beta, mas limitam uso profissional (P1)

Tabela de `LEVANTAMENTO-BETA-20261030.md`, seção 4:

| Frente | O que falta | Impacto declarado |
|---|---|---|
| Calls WAN | Prova com convidados reais, TURN/VPS, duas redes; vídeo contínuo por fonte (hoje JPEG até 640×360, até 5 fps) | Não prometer chamada externa remota na beta |
| NDI/OMT/SRT físico | Ensaio com receptor/hardware real; NDI Advanced exige SDK/licença | Vender apenas o que foi testado |
| SDI/ASIO/HDR/PTZ | Equipamento, driver, receptor reais; HDR está somente leitura | Não prometer |
| Bonding | Prova em duas redes reais com VPS/TURN | Fora do escopo desta beta |
| Replay | Ensaio "Native39" apontado como falho num contador de busca (seek) do TS em 12/10/2026; o ensaio de duração de 17/10/2026 passou, mas o caso específico ainda precisa ser reproduzido e fechado | Replay pode ser instável em casos específicos ainda não isolados |
| Importação/exportação `.fmx` (ida e volta) | Importação existe; o ciclo completo de ida e volta entre versões/instalações diferentes não está provado | Migração de projeto entre instalações pode falhar |
| Propriedades/Filtros com interface própria | Ainda em fila; hoje abre o diálogo nativo do OBS | Inconsistência visual, não perda de função |
| Operação de longa duração | Falta medir 4 câmeras Full HD por 8 horas contínuas (memória, temperatura, queda de quadros) | Estabilidade de sessões longas não comprovada |
| MIDI/OSC/controladores físicos | Backend e testes delimitados existem; falta ensaio com controlador físico real | Não prometer suporte a hardware específico |
| Documentação operacional | Documentos como `ENTREGA-ATUAL.md` tiveram contradições já identificadas entre si sobre qual versão está de fato em produção | Testador pode não saber com certeza qual versão está rodando — confira sempre `3mix-runtime/version.json` na própria instalação |

---

## 4. Estado do Multi-M/E (M/E 2–4 independentes) nesta beta

Esta frente não existia quando `LEVANTAMENTO-BETA-20261030.md` foi escrito (30/10/2026) — foi recebida do
dono em 31/10/2026 e auditada de forma independente em 01/11/2026. Fonte completa:
`qa-beta/recibos/auditoria-multi-me-20261101.md` e `qa-beta/recibos/multi-me-core-extracao.md`.

**Atualização de 02/11/2026**: a camada JS completa (5 módulos + `controle-producao.mjs`) e a Switcher
Strip atualizada **já foram copiadas à instalação do operador**, com backup e validação prévios. Preview,
Cut, Fade e Patch foram **confirmados funcionando de ponta a ponta contra o motor real**. O núcleo nativo
(binário com proxy/nesting) **continua fora do runtime** — essa é a única decisão ainda separada e
pendente. O resumo abaixo reflete o estado real confirmado nesta data.

- **M/E 1 (MAIN)**: é o caminho atual já em produção, sem mudança — Preview/Programa/CUT/FADE/T-BAR
  continuam exatamente como sempre foram.
- **M/E 2–4, Preview/Program/Cut/Fade/Patch (sem nesting)**: o motor em produção já suportava
  `control_mix`/`get_mixes` para M/E 2-4 antes mesmo desta frente começar (código legado do fork, não
  uma adição desta beta). Com a camada JS integrada, **Preview, Cut, Fade e Patch reais foram todos
  confirmados funcionando contra o motor do operador** (não só em QA isolado): um Cut e um Fade reais
  mudaram program/preview de verdade (Fade com a transição completa, confirmada por `transitioning:false`
  ao final); um Patch real trocou o conteúdo interno de um Input (confirmado via leitura direta da cena,
  não só do registro de metadado). O estado de M/E 2/3 persistiu através de dois reinícios completos do
  motor em rodadas anteriores.
- **Aba M/E da mesa**: fica ao lado de Fontes, com Strip por M/E (monitores PV/PGM, botões PV e PGM, CUT, AUTO, formato, transição, duração, áudio e Patch). As botoeiras do topo e a Mesa de corte em janela têm seletor de M/E; sempre abrem no MAIN e a escolha não fica salva. Testado no motor real em 02/11/2026, com as 6 transições do projeto, inclusive Merge/Move.
- **Saída do M/E**: nasce no formato da produção quando não há configuração salva; projetos que já tinham M/E gravado mantêm o formato até o operador trocar. Saída de formato diferente entra inteira no quadro, com barras. A imagem volta sozinha depois de reconfigurar, trocar de projeto e reiniciar. Transmissão RTMP real do M/E 2 em 720×1280 recebida e conferida quadro a quadro, com corte durante a transmissão.
- **Programa do M/E como entrada**: depois do primeiro uso, cada M/E ganha a entrada "PGM M/E N" em Entradas, reutilizável em outros M/Es, em composições, no Patch e no Multiview. Ela não pode ser removida nem renomeada. Ciclos diretos e indiretos são recusados antes de chegar ao motor.
- **Limites conhecidos**: T-Bar só no MAIN. AUX não troca o sinal de uma saída no ar, porque o motor exige parar a saída, e avisa o operador; em saída parada, o AUX guarda a escolha mas não altera a configuração dela. A aba M/E e a Mesa de corte em outro aparelho continuam no MAIN, porque o M/E só responde neste computador. Trocar o formato de um M/E com saída no ar é recusado de propósito.
- **O que foi bem testado e deve ser preservado quando a integração restante acontecer**:
  confirmação de comandos estritamente por M/E (nunca valida M/E 2 contra o estado do MAIN), recibos com
  confirmação positiva e rejeição de reuso, persistência de identidade pública mesmo através de
  reinício do motor, e agora também persistência do estado real de Preview/Program de M/E 2-4 através
  de reinício do motor do operador — confirmado em 2 rodadas.

---

## 5. Estado do Replay nesta beta (detalhe)

O Replay tem capturas pontuais (segmentos A/B, segmentos de Master) aprovadas em testes isolados, mas **o ensaio de longa duração (endurance) específico do Replay** é listado como pendência separada na tabela de prioridades de `PENDENCIAS-REAIS.md` ("P2 — Replay endurance"). Trate sessões de replay muito longas com cautela até que esse ensaio tenha um recibo publicado.

---

## 6. Divergência de versão entre instalador e instalação de desenvolvimento

Fonte: `LEVANTAMENTO-BETA-20261030.md` (P0-2) e os arquivos `entregas/INSTALADOR-ATUAL.json` / `entregas/APLICACAO-ULTIMA.json` / `3mix-runtime/version.json` deste workspace.

- O **instalador completo selado** para distribuição corresponde à versão `0.1.0-local.20261010060000` (Native24, 10/10/2026).
- A **instalação de desenvolvimento/QA** (`3mix-runtime/`) já roda a versão `0.1.0-local.20261011145116` (Native38, aplicada em 11/10/2026 via atualização incremental, com backup automático e `operatorClosed: true` no recibo).
- Ou seja: **quem instala do zero pelo instalador hoje recebe uma versão mais antiga** do que a que já foi validada em desenvolvimento. Não anuncie recursos do Native38 (ou posteriores) como presentes no instalador atual sem checar antes se um novo pacote completo já foi selado.

---

## 7. Os 12 critérios de aceite da beta (ainda não confirmados como PASS nesta beta)

`LEVANTAMENTO-BETA-20261030.md`, seção 1, define 12 critérios que precisam passar **numa máquina que nunca viu o projeto** para a beta ser considerada pronta. Este levantamento afirma explicitamente, na sua própria seção 11, que **não afirma que os 12 cenários passam hoje**. Os critérios são:

1. Instala em Windows 11 limpo, sem Node, sem Visual Studio, sem runtime de desenvolvimento.
2. Abre pelo atalho e chega à mesa operacional em menos de 30 s, sem erro de porta/API.
3. Reconhece as fontes do computador (webcam, captura HDMI, mídia) sem editar arquivo de configuração.
4. Preview/Programa, CUT, FADE e T-BAR funcionam com resposta perceptível abaixo de 150 ms.
5. DSK 1–4 entram e saem no ar de forma independente.
6. Áudio: fader, mute, AFV e medidores operam sem travar a interface.
7. Grava 30 min contínuos em Full HD sem perder arquivo.
8. Transmite 30 min em RTMP ou SRT, com reconexão após queda.
9. Replay: grava, marca IN/OUT, reproduz A/B e volta ao vivo.
10. Fecha e reabre preservando projeto, layout e configurações.
11. Desinstala sem apagar projetos, mídia, gravações e configurações.
12. Gera diagnóstico sanitizado e o usuário sabe para onde enviar.

Trate qualquer um destes itens como "não confirmado nesta beta" até que exista um recibo de teste específico citando a prova.

**Atualização sobre o item 4 (CUT/FADE/T-BAR)**: a Fase 2 de desempenho (ver
`qa-beta/recibos/fase2-desempenho.md`) mediu, contra o motor real já conectado, o
round-trip completo do comando `cut` (`POST /api/control {action:"cut"}`, mesmo payload
que a interface usa): p50 de 178 ms, p95 de 287 ms, em 20 ciclos. Isso é maior que a meta
técnica de 120 ms do plano de fases e também acima do limiar de 150 ms citado aqui. A
causa identificada foi o protocolo do motor em si (a confirmação de `cut` encadeia pelo
menos 8 idas-e-voltas síncronas com o motor, cada uma esperando confirmação antes da
próxima — ver o recibo para o detalhe técnico), não um defeito da interface nova; a
medição de frame da própria interface (quão rápido ela reage e repinta na tela) ficou em
0.1–0.2 ms, muito abaixo de qualquer limiar perceptível. Em outras palavras: o clique
responde visualmente quase instantâneo, mas a confirmação de que o motor realmente
cortou pode levar perto de 300 ms no pior caso medido. Isto é um achado real e medido,
não uma suposição — mas ainda não foi testado com um usuário real decidindo se essa
latência é perceptível/aceitável na prática. Trate o item 4 como "medido, resultado acima
da meta técnica, percepção de usuário não avaliada" em vez de simplesmente "não
confirmado".

---

## 8. O que este documento não afirma

Seguindo a mesma prática de honestidade do levantamento de origem: este documento não afirma que os itens fora destas listas estão aprovados, não afirma que a interface nova está funcional no motor real do operador (ela está visualmente pronta, mas funcionalmente parcial, segundo `LEVANTAMENTO-BETA-20261030.md` seção 11), e não substitui os recibos de QA específicos já existentes em `qa-portatil/` e pastas `qa-*/` do projeto — cada um vale pelo escopo que declara.
