# Acesso às configurações do Replay

O menu Replay abria `mesa.html?pop=replay`, cuja inicialização mostrava apenas o controlador compacto. A seleção de câmeras do formulário antigo não aparecia; áudio por câmera e sincronismo estavam disponíveis apenas no console `/replay`, sem acesso pela mesa.

Correção: a janela Replay abre o console completo `/replay`; o painel compacto ganhou **Configurações do Replay**, que usa a porta da instalação e abre `/replay?view=settings#replay-config`. Entradas nativas que ainda apontam para `mesa.html?pop=replay` são encaminhadas ao console completo. O console oferece navegação para câmeras/gravação, retenção e áudio/sincronismo, com descrições. Abrir a janela não inicia REC nem altera as configurações.

Validação: `qa-finalizacao/resultado-replay-config-acesso.json` passou em quatro verificações de navegador com API simulada: encaminhamento, contrato de áudio/offset, contrato de retenção e abertura da engrenagem na porta correta. Não é um ensaio de gravação física. A instalação do operador respondeu com 3Mix conectado; o pedido nativo `open_panel` confirmou sucesso e `get_interface` confirmou a janela **Configurações do Replay** visível, sem reiniciar o motor.

A mesa já carregada incorpora a engrenagem na próxima abertura normal. O menu Replay e a janela de configurações já podem abrir os arquivos atualizados. O instalador assinado `153453` é imutável e ainda não inclui esta correção de interface; deve ser regenerado junto das demais correções posteriores ao pacote.
