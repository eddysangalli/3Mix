# 3Mix — README /060000

Estado vigente após aceite Root: **0.1.0-local.20261010060000, Native24/a047860**. Uma instalação própria, dois ciclos cooperativos counter0/crash0, Meter [0,0] preservados, diagnóstico instalado sanitizado e desinstalação conservadora. Operador preservado, não ativado/substituído.

Git do payload selado: **6adcd19315c01a4f01baaab2fd5d9e560872619b**. O commit posterior de provas/documentação não recompõe o payload. Manifesto 7107aa50b55dd2584be4fc30760af6ef1c85855c6995cd10758e65decc0a93b4; Setup 3a53cc01ea2998d785e4914c219084e6868ad4bf7b33fff31f074685878993bd; ZIP 82769392912badfb5a4f03a717181e915b404d8418fe7e2376f2702dddbfe821. Todos9582 arquivos assinados e2085pinsNative foram conferidos.

Menus/NAV/Replay Settings/Calls/Externo e as correções Calls/HDR desta fonte fazem parte do candidato600. O QA instalado usa HDR GET sem transmissão; mídia HDR local anterior continua uma prova separada.050500 foi candidato não selecionado: FAIL de observação API preservado, seguido de diagnóstico/uninstall em continuação separada; não virou PASS.035000 permanece como seleção anterior preservada.

Instale em destino novo/vazio. Estado e critérios em docs/CONTINUAR.md, docs/ENTREGA-ATUAL.md e docs/PENDENCIAS-REAIS.md.

Baseline aprovada somente no escopo dos recibos, sem promessa100%. A auditoria posterior identificou recuperação incompleta de operações incertas e um atalho FTB sem contrato público confirmável; ambos continuam em correção posterior, junto do retorno contínuo das Calls. IAB com backend Native real não prova CEF desktop, editores visíveis/foco/z-order, GPU/PCM, endurance ou todos encoders. Retorno custom Calls usa JPEG640×360 até5fps; vídeo contínuo25/30fps por fonte ainda requer pipeline próprio com PTS/backpressure/sincronismo, não só timer/hardware. Programa usa câmera virtual com taxa ideal solicitada, sem taxa efetiva homologada aqui. ASIO/SDI/PTZ/controladores físicos, WAN/TURN/bonding, Windows limpo, receptor/monitor HDR e NDI HDR Advanced SDK/licença/implementação continuam gates separados. GTZIP finito não implica compatibilidade universal/3D/frames ausentes. Alpha web abortado; ponte alpha nativa beta separada. Assinatura interna Ed25519; sem Authenticode.

Provas instaladas: qa-finalizacao/setup-060000-qa/report.json SHA 77d835df3da98d84c5e4458450cbbd0ecc2917e767dc43061d9551d7e53ded0c; allowlist SHA 703df68812198b839e1a697f8303805d0f4b9fc2c012108db3646398f998d25a; Root IAB files5 SHA 7c5b0acb987cd81f4a8179bc84a5592efffc91dfc089a9a5fee96f67306253d3.

---

## Histórico preservado — estado anterior à seleção060000

Referências a atual/pendente/próximo abaixo pertencem ao registro original; artefatos selados/recibos não foram reescritos.

# 3Mix Studio

Código do 3Mix baseado no OBS Studio 32.2.2, com interface de mesa de produção, saídas independentes, composições, GC, Calls, replay, áudio e automação.

Entrega local aprovada: **0.1.0-local.20261010035000**, selecionada em `entregas/INSTALADOR-ATUAL.json`. 060000/Native24 traz correções posteriores de Calls e HDR e aguarda novo pacote/ensaio instalado. 050500 preserva um FAIL do verificador e uma continuação separada de diagnóstico/desinstalação. Retorno custom das Calls permanece limitado a5fps; vídeo contínuo está em implementação isolada. Estado vigente: [docs/CONTINUAR.md](docs/CONTINUAR.md). Pendências e critérios: [docs/PENDENCIAS-REAIS.md](docs/PENDENCIAS-REAIS.md). Instalador: [docs/INSTALACAO.md](docs/INSTALACAO.md). Tarefa de auditoria: [docs/TAREFA-AUDITORIA-PENDENCIAS.md](docs/TAREFA-AUDITORIA-PENDENCIAS.md).

Experimento [vídeo com alpha em uma entrada Web Browser](docs/VIDEO-ALPHA-UMA-ENTRADA.md): **abortado pelo operador após reprovação com vídeo real no vMix**. [Análise dos bridges e bonding](docs/referencias/ANALISE-BRIDGES-CHARGEXDEV.md).

## Código incluído

- `fork/`: série completa de 24 patches sobre um commit upstream fixado, incluindo todas as alterações nativas da entrega.
- `ferramentas/`: API local, controle, áudio, saídas, Calls, bonding, recuperação, instalador, atualização e ZIP de diagnóstico.
- `painel/`: mesa, configuração, 156 presets de composição e biblioteca de títulos.
- `servidor/`: kit Linux para feed HTTPS, TURN e receptor, preparado para implantação explícita.
- `scripts/installer-windows/`: fonte do instalador Windows offline; `templates/portatil/` guarda os inicializadores que são copiados para a raiz do pacote compilado.
- `licenses/` e `docs/provenance/`: licenças, fontes locais de componentes modificados e referências/hashes das dependências.
- `docs/evidencias-ultima-rodada/`: recibos dos ensaios locais, com escopo e limites.

## Reconstrução e uso

Leia [BUILD-FROM-SOURCE.md](docs/BUILD-FROM-SOURCE.md). Os patches têm manifesto e verificação de hashes; um teste em índice isolado confere que reproduzem a árvore nativa local.

O Git guarda fontes e documentação. A cópia executável gerada antes nesta pasta foi arquivada no workspace; a instalação operacional é `obs-vmix`, e o fork C++ completo é `freemix-app`. Binários, configurações do operador e chaves não fazem parte do checkout. Pacotes assinados: [docs/releases/](docs/releases/).

Na máquina de desenvolvimento original, abra a instalação por `INICIAR-3MIX.cmd` na raiz do workspace, após salvar e fechar o 3Mix correspondente (nota de rename de 31/10/2026: o comando citado antes aqui, `ABRIR-FREEMIX.cmd`, não existe mais na raiz do workspace — corrigido para o canônico atual). Num portátil extraído, use `FreeMix Studio.cmd`. O launcher inicia motor e API juntos. Um clone deste repositório, sem os componentes compilados, não é um portátil pronto para executar.

`src/` e `plugins/obs-freemix/` são protótipos anteriores preservados como referência; o motor desta entrega é a série OBS em `fork/`. Documentos antigos de arquitetura/roadmap descrevem também intenções históricas e devem ser lidos junto do estado atual.

Transmitir abre MultiStream; Externo reúne SRT, NDI, OMT e SDI. O SRT tem conexão por modo/IP/porta/latência e ajustes avançados recolhidos. H.264 4:4:4 e alpha empacotado foram comprovados em loopback; o receptor OBS precisa do shader fornecido e Crop/Pad. Internet continua com validação pendente; cada recibo informa a resolução realmente ensaiada.

## Estado e pendências

Há provas locais para saídas/codecs, áudio, composições, recuperação, controles, NDI/OMT, replay e estabilidade no escopo descrito pelos relatórios. Isso não equivale a homologação de internet, placas, interfaces de áudio, todos os drivers ou todos os serviços de transmissão.

OMT HDR manual PQ/HLG tem prova local em P216 e quatro emissores. Modelos GTZIP não reconhecidos, aceitação visual e homologação dos equipamentos têm critérios explícitos. Calls externos, bonding WAN, vídeo/áudio/controladores físicos, destinos reais e Windows limpo precisam de uma rodada de validação dirigida. Critérios: [docs/PENDENCIAS-REAIS.md](docs/PENDENCIAS-REAIS.md).

O botão e `COLETAR-LOGS.cmd` geram diagnóstico local sanitizado, encaminhado manualmente por e-mail/WhatsApp. Nenhum envio automático de logs, serviço público ou transmissão externa é iniciado por este repositório.

## Licença

O fork do OBS mantém a licença GPL e os avisos correspondentes. Os componentes de terceiros mantêm suas licenças e termos próprios; consulte `LICENSE`, `licenses/` e os registros de proveniência antes de redistribuir.

Correção de estabilidade: fechamento reentrante de janelas CEF e limpeza do muxer SRT entre reconexões. Provas dirigidas acompanham docs/evidencias-encerramento. O vMix desta instalação rejeitou o perfil 4:4:4/alpha packed. Packed 4:2:0 chegou e foi recomposto manualmente com quatro entradas auxiliares; o receptor web adicional foi abortado por desempenho ruim.

SRT: o novo modo lado a lado também usa H.264 4:2:0; Fill e Key separados usam duas portas. Recepção FFmpeg local validada em três modos, alpha 0/128/255; recomposição no vMix e sincronismo entre conexões permanecem testes externos. Veja [docs/SRT-VMIX.md](docs/SRT-VMIX.md).
