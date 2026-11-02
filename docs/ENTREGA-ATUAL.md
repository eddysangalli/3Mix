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
