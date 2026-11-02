# 3Mix — Como solicitar suporte

Este guia explica como gerar o pacote de diagnóstico do 3Mix e o que anexar ao relatar um problema. Leia também [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md) antes de abrir um chamado — o comportamento que você encontrou pode já estar documentado como limite conhecido desta beta.

---

## 1. Relatar pela interface (3Mix aberto)

1. Abra **Relatar problema…** no menu da mesa, ou **Configurações › Sobre e suporte**.
2. Preencha o que aconteceu, o que estava fazendo, o impacto, a frequência, seu nome e um contato.
3. Clique em **Gerar pacote** e use **Abrir pasta** para pegar o ZIP.
4. Envie o ZIP para o destino que aparece na tela.

Depois de um fechamento com erro, a mesa mostra **ERRO NA ÚLTIMA SESSÃO** no rodapé, que abre esta tela. A geração não depende do motor conectado.

## 2. Gerar o ZIP de diagnóstico se o 3Mix não abrir

Se o 3Mix não abrir, ou tiver acabado de fechar por erro, use o script na raiz da instalação:

```
COLETAR-LOGS.cmd
```

Esse script roda `ferramentas/coletar-diagnostico.mjs`, gera o ZIP diretamente (sem precisar abrir a interface) e abre o Explorer do Windows já com o arquivo selecionado. Ele não inicia nem reinicia o motor — só coleta o que já existe em disco.

O ZIP fica na pasta **`diagnosticos/`**, dentro da instalação (no ambiente de desenvolvimento deste workspace, isso corresponde a `FreeMix/diagnosticos/` / `3mix-runtime/diagnosticos/`, conforme a árvore usada).

---

## 3. O que o ZIP contém e o que ele nunca inclui

Segundo o código do coletor (`FreeMix/ferramentas/diagnostico-producao.mjs`, classe `DiagnosticCollector`) e a descrição já publicada em `LOGS-BETA.md`:

**Inclui:**
- Logs recentes do motor, plugins, API e inicialização.
- Relatórios de falha (crash), se houver.
- Um resumo de rede, instalação e dependências existentes no computador.
- Versão do produto e informações do sistema (plataforma, CPU, memória).
- Nome ou apelido da máquina e um identificador local da instalação (gerado uma vez, reaproveitado nas próximas coletas).
- O relato preenchido (`RELATO.txt`), com o contato como foi digitado.
- Placa de vídeo, driver e disco (`sistema.json`), estado do programa no momento (`estado-no-momento.json`) e últimas ações da sessão (`sessao-recente.ndjson`).
- Erros das telas (`logs/launcher/*painel-erros*`), resumo dos crashes por módulo (`crashes-resumo.json`) e hash do executável e das DLLs principais (`binarios.json`).

**Nunca inclui (removido automaticamente antes do ZIP ser criado):**
- Senhas, chaves, passphrases, cookies e tokens reconhecidos pelo filtro de redação.
- Configurações completas do projeto e os próprios projetos.
- Áudio, vídeo e capturas de tela.
- Dump de memória e documentos pessoais.

**Limites técnicos da coleta:** até 70 arquivos de log, 1 MB por arquivo e 16 MB de texto no total; arquivos grandes são truncados mantendo início e fim. O manifesto dentro do ZIP (`diagnostico.json` / `manifest.json`) lista exatamente o que foi incluído, o que foi truncado e o hash SHA-256 de cada arquivo.

**Importante:** o filtro de redação remove o que é reconhecível como segredo (chaves, senhas, tokens, caminhos). Texto livre vindo de algum plugin pode, em teoria, conter algo que o filtro não reconheça — por isso, **revise a prévia antes de enviar**, especialmente se usa nomes de rede, domínios ou caminhos de arquivo pouco comuns no ambiente.

Nada é enviado automaticamente. O 3Mix não tem upload oculto nem telemetria — a geração é sempre local, e o envio é manual, por você.

---

## 4. O que anexar ao relatar um problema

Junto com o ZIP de diagnóstico, inclua por escrito:

1. **O que você estava fazendo** quando o problema aconteceu (passo a passo, não só "não funcionou").
2. **O que você esperava** que acontecesse.
3. **O que de fato aconteceu** (mensagem de erro exata, se houver — tire uma captura de tela da mensagem).
4. **Versão do 3Mix** — confira em `version.json` na pasta da instalação, ou na tela "Sobre", quando disponível.
5. **Se o problema é reproduzível** — acontece sempre que você repete os mesmos passos, ou foi uma vez só?
6. Se o problema envolve algo listado em [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md) (por exemplo, Calls via WAN, hardware SDI/ASIO, NDI Advanced), diga isso explicitamente — esses cenários já são conhecidos como não comprovados nesta beta e ajuda a não duplicar esforço de investigação.

---

## 5. Para onde enviar

O destino é definido pelo responsável do projeto em `config/suporte.json`, no formato `{"destino":"..."}`, e aparece na tela depois de gerar o pacote. **Enquanto o arquivo não existir, a tela não mostra para onde enviar.**

Guarde os símbolos (`.pdb`) de cada versão distribuída: os relatórios de crash trazem endereços, e `binarios.json` indica qual build gerou cada um.
