# Entrega atual — alpha portátil de 02/11/2026

O artefato mais recente verificado nesta rodada é **`3Mix-Alpha-20261102162909.zip`**, versão **`0.1.0-local.20261102162909`**. É um **ZIP portátil alpha**, não um Setup novo nem uma beta homologada em Windows limpo.

| Campo | Evidência |
|---|---|
| Tamanho | 1.339.123.054 bytes |
| SHA-256 recalculado | `09bde28d32f18d99171caa1937540557b25ce99012486573c4685d6cbab607ff` |
| Recibo local do ZIP | `entregas/3Mix-Alpha-20261102162909.zip.json` |
| Recibo local de selagem | `qa-finalizacao/alpha/selo.json` |
| Relatório local de abertura | `qa-finalizacao/alpha/resultado-zip.txt` |

Esses caminhos são relativos à raiz do workspace completo; não são links de download nem garantia de que os artefatos estejam publicados neste repositório.

O relatório de teste da outra sessão registra abertura do pacote extraído nesta máquina, motor conectado, tema 3Mix, geração de senha própria, resposta M/E, medição de entrada de áudio e diagnóstico gerado. Esta atualização documental conferiu tamanho e SHA-256 do ZIP; **não repetiu a execução do programa**. O recibo de selagem registra assinatura interna e hashes verificados, mas `nativeCommit: null` e `rebuiltComponents: []`: não demonstra sozinho a correspondência integral entre fontes e binários. Os contadores de arquivos dos recibos têm escopos diferentes (ZIP: 9.988; selagem: 9.986); não foram reconciliados nesta rodada.

**Ainda pendente:** Setup novo e seus ensaios de instalação/desinstalação, 12 cenários em Windows limpo, Authenticode, qualificação com hardware e investigação dos crashes de `source-record` registrados no status. O destino de suporte presente na configuração do pacote não constitui, por si só, aprovação comercial ou operacional do canal.

O bloco abaixo é **histórico de outubro**, preservado para rastreabilidade. Suas afirmações sobre “hoje”, versão em produção e atualização não aplicada não descrevem o estado atual do operador. A versão ativa do operador não foi consultada nesta rodada.

---

# Entrega atual do 3Mix
<!-- rodada-20261011-1523-r3 -->
> **Leia primeiro este bloco.** Distingue o instalador validado pelo Root do que está de fato em produção na mesa do operador.

**Instalador completo selecionado (imutável):** `0.1.0-local.20261010060000`, Native24/a047860. Validado em instalação própria do Root (ambiente de QA) — não é necessariamente a versão hoje em produção na mesa do operador. Ainda não há um pacote completo novo selado com as fontes finais do Native38; selar esse pacote depende de concluir antes a qualificação de estabilidade de transmissão (saídas simultâneas/reconexão/latência sob carga), prioridade atual.

**Mesa do operador, hoje:** `0.1.0-local.20261009153453` (mais antiga).

**Atualização incremental armada, não aplicada:** `0.1.0-local.20261011145116` (Native38 `ed08547` + painel/ferramentas `71f8aa7`), sobre a mesa acima. Aplica-se só quando o dono fechar o 3Mix e abrir de novo pelo `ABRIR-FREEMIX.cmd`; cópia de segurança em `obs-vmix/updates`. O ensaio de abrir/atualizar passou numa cópia de fábrica — não é homologação com a configuração real do operador, e não garante estabilidade de transmissão a 100%. Se algo não abrir bem depois de aplicar: `DESFAZER-ATUALIZACAO.cmd` (na raiz), já ensaiado numa cópia.

O recibo da próxima aplicação sai em `entregas/APLICACAO-ULTIMA.json`; o recibo lá hoje é de 09/10 (antigo) — não indica que a atualização de 11/10 já foi aplicada.

Histórico anterior (seleções 035000/050500 etc.) preservado sem alteração abaixo.

---
# Entrega atual do 3Mix

O instalador selecionado é **0.1.0-local.20261010060000, Native24/a047860**. As correções posteriores estão em desenvolvimento e não estão incluídas nesse instalador.

Para instalar, execute **INSTALAR-FREEMIX.cmd** da raiz e escolha uma pasta nova/vazia. Depois use o atalho FreeMix Studio. Para diagnóstico, use **COLETAR-LOGS.cmd** ou o botão Diagnósticos: gera ZIP local sanitizado para envio manual por e-mail/WhatsApp. Não há upload automático.

Setup: **FreeMix-Studio-Setup-0.1.0-local.20261010060000.exe**. Seleção e hash: [INSTALADOR-ATUAL.json](../entregas/INSTALADOR-ATUAL.json). SHA256:3a53cc01ea2998d785e4914c219084e6868ad4bf7b33fff31f074685878993bd.

Prova: [relatório instalado](evidencias/20261010-setup060000/qa-finalizacao/setup-060000-qa/report.json). Foram conferidos9582 arquivos do pacote e2085 do runtime Native, dois fechamentos cooperativos, diagnóstico e desinstalação conservadora em raiz própria. Assinatura interna Ed25519; sem Authenticode.

As correções posteriores de operação/desempenho, FTBv2 e retorno contínuo ainda não fazem parte desse pacote. Não usar a versão selecionada como evidência dessas implementações. Consulte [situação](ATUALIZACAO-20261010.md) e [pendências](PENDENCIAS-REAIS.md).

035000 é a seleção anterior preservada.050500 foi candidato não selecionado e seu FAIL original permanece registrado. Nenhuma instalação do operador foi substituída automaticamente.
Histórico anterior completo: [registro preservado](historico/20261010-preNative25/ENTREGA-ATUAL.md).
