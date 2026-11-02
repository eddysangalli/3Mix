# 3Mix — Leia-me da Beta

Este documento explica, em linguagem direta, o que é o 3Mix, como instalar, como abrir, como criar o primeiro projeto, o que esta beta ainda não garante, como atualizar, como desinstalar e o que fazer se o Windows exibir um aviso de segurança ao abrir o instalador.

Para o passo a passo ilustrado com capturas de tela reais, veja [`GUIA-RAPIDO.md`](GUIA-RAPIDO.md). Para a lista completa do que ainda não foi provado nesta beta, veja [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md). Para relatar um problema, veja [`SOLICITAR-SUPORTE.md`](SOLICITAR-SUPORTE.md). Os termos de uso desta beta estão em [`EULA.txt`](EULA.txt); os avisos de componentes de terceiros e a oferta de código-fonte GPL estão em [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt).

---

## 1. O que é o 3Mix

O 3Mix é uma suíte de produção e transmissão ao vivo (switcher broadcast): uma mesa de corte com Preview/Programa, transições, downstream keyers (DSK), mixer de áudio, replay multicâmera, gravação e saídas de transmissão (RTMP/SRT), tudo em uma interface própria construída sobre um motor nativo (fork do OBS Studio/libobs).

O 3Mix não é uma cópia do vMix nem uma skin do OBS. A unidade principal de trabalho é o **INPUT** — câmera, VT, GC, Call, Replay ou Composição — reunindo vídeo, áudio, composição, DSK e controle operacional em cards e módulos inteligentes, em vez de cenas/fontes soltas. Veja o documento canônico de produto em [`PRODUCT-VISION.md`](PRODUCT-VISION.md) para a visão completa.

Esta é uma **versão beta**: existe produto funcional e testado em ambiente de desenvolvimento, mas vários cenários (instalação em Windows "limpo", hardware físico de captura, chamadas remotas pela internet) ainda não foram comprovados fora da máquina de quem desenvolveu o projeto. A seção 7 deste documento e o arquivo `LIMITES-CONHECIDOS.md` detalham exatamente o que isso significa na prática.

---

## 2. Antes de instalar — o que você precisa

- Windows 10/11 de 64 bits.
- Espaço em disco livre: o pacote de instalação tem cerca de **1,3 GB** (1.375.666.176 bytes, segundo o registro em `entregas/INSTALADOR-ATUAL.json`); reserve espaço adicional para gravações e projetos.
- Uma pasta **nova e vazia** para instalar — o instalador não foi desenhado para instalar por cima de uma pasta com outros arquivos.
- Não é necessário ter Node.js, Visual Studio ou qualquer ferramenta de desenvolvimento instalada: o pacote inclui o runtime que usa (Node, FFmpeg).

> **Importante sobre esta beta:** o pacote de instalação completo e assinado que existe hoje (`FreeMix-Studio-Setup-0.1.0-local.20261010060000.exe`, ver seção 8) corresponde a uma build de 10/10/2026. Ele **não inclui** as correções e novidades posteriores a essa data. Ainda não existe um pacote completo mais novo selado — isso está registrado como pendência conhecida em [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md), fonte `FreeMix/docs/LEVANTAMENTO-BETA-20261030.md`, bloqueador P0-2. Se você recebeu esta beta diretamente da pasta do projeto (sem passar pelo instalador .exe), você está usando a versão de desenvolvimento, que pode ser mais nova.

---

## 3. Como instalar

1. Baixe ou copie o instalador (`FreeMix-Studio-Setup-*.exe`) para o computador de destino.
2. **Confira o SHA-256 do arquivo antes de executar** (ver seção 8 — isso confirma que o arquivo não foi corrompido ou alterado no caminho).
3. Dê duplo clique no instalador.
4. Se o Windows exibir um aviso do SmartScreen ("O Windows protegeu seu PC"), veja a seção 6 antes de prosseguir — isso é esperado nesta beta e explicado abaixo.
5. Escolha uma pasta **nova e vazia** como destino.
6. Aguarde a cópia dos arquivos (motor, painel, Node, FFmpeg e demais componentes).
7. Ao final, um atalho é criado. Use-o para abrir o 3Mix — não execute o motor (`FreeMix.exe` dentro de `bin/64bit/`) diretamente.

Alternativa por linha de comando (instalação silenciosa): o próprio instalador `.exe` (não um `.cmd` — corrigido em 31/10/2026, não existe `INSTALAR-FREEMIX.cmd` na raiz do projeto) aceita essas opções diretamente:

```
FreeMix-Studio-Setup-<versão>.exe --silent --dest=CAMINHO_DA_PASTA_NOVA
```

Outras opções aceitas pelo instalador: `--api-port=N`, `--ws-port=N`, `--no-shortcuts`, `--log=ARQUIVO`. A instalação começa sempre com um projeto vazio; importar um projeto `.fmx` existente é uma ação separada e opcional (não acontece sozinho).

**O que a instalação preserva ao reinstalar/atualizar por cima:** projetos, mídia, gravações, diagnósticos, logs e qualquer arquivo que você tenha modificado. **O que ela não faz:** abrir o motor automaticamente, nem sobrescrever um executável já existente no destino (o instalador recusa isso por segurança).

---

## 4. Como abrir o 3Mix

Use sempre um dos iniciadores — nunca o executável do motor sozinho:

- Na raiz do projeto (ambiente de desenvolvimento/QA): `INICIAR-3MIX.cmd`.
- Numa instalação feita pelo instalador: o atalho **3Mix Studio** criado na instalação, ou `3Mix Studio.cmd` dentro da pasta instalada.

O iniciador sobe o motor nativo (com Preview/Programa) e a API/painel de controle juntos, e só considera a abertura concluída quando os dois estão de fato respondendo. Abrir apenas o `.exe` do motor deixa a mesa sem o painel de controle funcionando.

Para reiniciar tudo do zero: `REINICIAR-3MIX.cmd`. Para encerrar de forma organizada, liberando portas: `DESLIGAR-3MIX.cmd`. Prefira sempre esses scripts a encerrar a janela de qualquer outro jeito.

**Tempo esperado de abertura:** a meta definida para a beta é chegar à mesa operacional em menos de 30 segundos, sem erro de porta ou de API — mas essa medição formal ainda não tem recibo publicado nesta beta (ver `LIMITES-CONHECIDOS.md`).

---

## 5. Primeiro projeto

1. Abra o 3Mix pelo iniciador (seção 4). Na primeira abertura, o motor cria uma instalação com uma produção vazia.
2. Na mesa principal, use **Adicionar entrada** para registrar sua primeira fonte (webcam, captura de mídia, etc.). O 3Mix trabalha com o conceito de **INPUT**: cada entrada pode já reunir vídeo, áudio e composição, em vez de exigir cenas separadas.
3. Clique numa entrada para colocá-la em **Prévia (PV)**; use o corte/transição para levá-la ao **Programa (PGM)** — isso é o que vai ao ar.
4. Explore os módulos pela barra superior ou pelo Hub de Operadores: **Áudio** (mixer com faders e medidores), **Replay** (captura e reprodução A/B), **Overlays/DSK** (até 4-8 downstream keyers, conforme a tela), **Saídas** (gravação e transmissão).
5. Antes de ir ao ar de verdade, use o botão **Pre-Flight** (verificação de segurança operacional) disponível na mesa principal.

Veja o passo a passo com capturas de tela reais em [`GUIA-RAPIDO.md`](GUIA-RAPIDO.md).

---

## 6. Se o Windows avisar sobre o instalador ("SmartScreen")

O instalador desta beta **não tem assinatura Authenticode** (certificado de editor reconhecido pela Microsoft) — apenas uma assinatura interna própria (Ed25519) que garante a integridade do pacote, mas que o Windows não reconhece como "editor verificado". Isso é uma decisão conhecida e documentada, não um defeito escondido: ver `FreeMix/docs/LEVANTAMENTO-BETA-20261030.md`, bloqueador P0-9.

Isso significa que, ao abrir o instalador, o Windows Defender SmartScreen pode mostrar uma tela azul: **"O Windows protegeu seu PC"**.

Para prosseguir com segurança:

1. **Confira o SHA-256 do arquivo primeiro** (seção 8) — é a forma de confirmar que o instalador não foi adulterado, já que ele não depende de um certificado comercial.
2. Na tela do SmartScreen, clique em **Mais informações**.
3. Confirme que o nome do arquivo corresponde ao instalador que você baixou (`FreeMix-Studio-Setup-*.exe`).
4. Clique em **Executar assim mesmo**.

Se você não reconhece o arquivo, ou o hash não bate com o publicado, **não execute** — peça confirmação a quem distribuiu a beta.

---

## 7. Limites conhecidos desta beta (resumo)

Esta beta **não promete** (ainda não testado nesta beta, segundo `FreeMix/docs/LEVANTAMENTO-BETA-20261030.md` e `FreeMix/docs/PENDENCIAS-REAIS.md`):

- Instalação e operação comprovadas em Windows "limpo" (máquina sem nenhuma dependência de desenvolvimento pré-instalada).
- Chamadas remotas via WAN com convidados reais (hoje testado apenas com vídeo sintético/local).
- Captura e saída SDI, ASIO físico, HDR fim a fim e controle PTZ com hardware real.
- NDI Advanced (recursos que dependem de licença/SDK adicional) e bonding multipath em redes reais.
- Importação universal de projetos de terceiros (vMix ou outros).
- Operação contínua de longa duração (várias horas seguidas) medida e aprovada.

A lista completa, com as fontes exatas de cada item, está em [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md). Não repita essas promessas ao divulgar a beta para terceiros.

---

## 8. Conferência de integridade (SHA-256)

O instalador completo selecionado para distribuição é `FreeMix-Studio-Setup-0.1.0-local.20261010060000.exe` (Native24, build de 10/10/2026), registrado em `entregas/INSTALADOR-ATUAL.json`:

```
Arquivo:  FreeMix-Studio-Setup-0.1.0-local.20261010060000.exe
Tamanho:  1.375.666.176 bytes
SHA-256:  3a53cc01ea2998d785e4914c219084e6868ad4bf7b33fff31f074685878993bd
```

O pacote ZIP interno (payload) correspondente, registrado em `entregas/FreeMix-Completo-0.1.0-local.20261010060000.zip.sha256`:

```
Arquivo:  FreeMix-Completo-0.1.0-local.20261010060000.zip
SHA-256:  82769392912badfb5a4f03a717181e915b404d8418fe7e2376f2702dddbfe821
```

Para conferir no Windows, abra o PowerShell na pasta onde está o arquivo baixado e rode:

```powershell
Get-FileHash .\FreeMix-Studio-Setup-0.1.0-local.20261010060000.exe -Algorithm SHA256
```

Compare o valor exibido com o publicado acima. Se não bater, não instale — o arquivo pode estar corrompido ou ter sido alterado.

> Nota: o arquivo `.exe` do instalador (os ~1,3 GB citados acima) não está incluído na pasta `entregas/` deste workspace de desenvolvimento — apenas os metadados e hashes de registro. Confirme com quem distribuiu a beta qual é o canal oficial para obter o instalador em si.

---

## 9. Como atualizar

Dentro de uma instalação já feita, use o atalho/script de atualização correspondente (ex.: `Atualizar FreeMix.cmd`, presente na pasta instalada) ou reabra pelo iniciador principal — ele verifica se há uma atualização incremental pronta antes de abrir a mesa. A atualização só é aplicada quando você fecha o 3Mix normalmente e abre de novo pelo iniciador; sua produção não é encerrada à força pelo atualizador.

A atualização incremental guarda uma cópia de segurança (backup) da versão anterior automaticamente antes de aplicar as mudanças. Configurações, projetos e mídia são preservados.

**Estado documentado nesta beta:** existe uma divergência conhecida entre a versão selada no instalador completo (10/10/2026, Native24) e a versão mais recente já validada em ambiente de desenvolvimento (atualização incremental de 11/10/2026, Native38) — ver seção 2 e `FreeMix/docs/LEVANTAMENTO-BETA-20261030.md` (bloqueador P0-2). Se algo não abrir corretamente depois de aplicar uma atualização, use o script de desfazer (`DESFAZER-ATUALIZACAO.cmd`, quando presente na instalação) para voltar à cópia de segurança.

---

## 10. Como desinstalar

Use o desinstalador incluído na própria instalação (`Desinstalar FreeMix Studio.exe`, dentro da pasta onde o 3Mix foi instalado). Ele foi desenhado para ser conservador:

- Remove **apenas** os arquivos imutáveis da própria instalação, que ainda correspondem exatamente ao tamanho e hash (SHA-256) registrados no momento da instalação.
- **Preserva** projetos, mídia, gravações, diagnósticos, logs e qualquer arquivo que tenha sido modificado ou que não faça parte da lista original instalada.
- Não apaga a pasta inteira de uma vez — a pasta de destino não é removida recursivamente.
- Recusa rodar se o motor ou as portas do 3Mix ainda estiverem em uso (feche o 3Mix antes de desinstalar).
- Não encerra processos em execução por conta própria.

Para ver o que seria removido **sem remover nada ainda**:

```
"Desinstalar FreeMix Studio.exe" --silent --dry-run
```

Para aplicar de fato:

```
"Desinstalar FreeMix Studio.exe" --silent --apply
```

Depois de desinstalar, a pasta de destino continua existindo com os dados preservados (projetos, mídia, configurações) e um recibo da operação.

---

## 11. Documentos relacionados

- [`GUIA-RAPIDO.md`](GUIA-RAPIDO.md) — passo a passo de uma página com capturas de tela reais.
- [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md) — lista factual do que não funciona ou não foi provado nesta beta, com fontes.
- [`SOLICITAR-SUPORTE.md`](SOLICITAR-SUPORTE.md) — como gerar o ZIP de diagnóstico e relatar um problema.
- [`PRODUCT-VISION.md`](PRODUCT-VISION.md) — visão de produto e identidade do 3Mix.
- [`LEVANTAMENTO-BETA-20261030.md`](LEVANTAMENTO-BETA-20261030.md) — levantamento técnico completo do que falta para a beta.
- [`PENDENCIAS-REAIS.md`](PENDENCIAS-REAIS.md) — histórico técnico detalhado de pendências e homologações.
