# SRT 4:4:4 e cor + máscara: interface e adaptador

Frente JS/UI concluída. Não houve alteração Native, compilação ou uso da instalação do operador nesta frente.

Arquivos: `ferramentas/saidas-producao.mjs`, novo `ferramentas/saidas-srt.mjs`, `painel/remoto/saidas.html` e novo `painel/remoto/saidas-srt-ui.js`.

Campos persistidos: `chroma:'420'|'444'` e `alphaMode:'none'|'packed'`. Campos omitidos de uma atualização conservam os valores anteriores; destinos legados sem esses campos continuam em 420/none. Perfis salvam as escolhas e perfis antigos sem os campos conservam as escolhas atuais na carga. As chaves anteriores não são apagadas.

A validação requer capability real `srtChroma444Supported` e, para packed, `srtPackedAlphaSupported`. Encoder autorizado nesta versão: `srt444Encoder` (obs_x264). SRT pode ser explícito ou inferido da URL auto. Packed exige 444, largura lógica até `srtPackedAlphaMaxWidth` (1920) e máscara válida; nenhum nome arbitrário de formato é aceito. Conteúdos source/program/preview/clean/mix continuam possíveis; o wrapper privado Native enquadra antes de empacotar.

A interface tem seletores 420/444 e sem alpha/cor+máscara lado a lado, informações de largura lógica e transporte, estado por readback e botão **Preparar SRT · 4:4:4 + alpha**. O botão só prepara rascunho; não salva ou transmite. Rascunho não é substituído pela atualização periódica. Preparar seleciona protocolo SRT, codec H.264 e encoder x264. O usuário escolhe conteúdo transparente, URL do receptor e áudio antes de salvar/iniciar.

Packed transporta cor à esquerda e máscara de alpha em cinza à direita, com largura 2W. O receptor 3Mix/FFmpeg precisa recompor as metades; um player comum mostra ambas. Não é alpha nativo universal do SRT, HDR ou genlock. A implementação não habilita GPU/HEVC/AV1 para 444 nesta primeira rota. A transparência deve existir no conteúdo original. A interpretação de RGB/alpha, incluindo bordas/níveis, precisa da prova de recepção da frente Native.

Provas dirigidas sem rede/motor reais: `resultado-srt-formato-adapter.json` **3 PASS** (validação e limites, configure/readback/merge/chave, perfis); `resultado-srt-formato-ui.json` **3 PASS** (botão sem início, rascunho+payload, readback). Zero erros JS. Captura `srt444-alpha-ui.png` inspecionada. Syntax checks passaram. A prova de pixels/PCM/teardown e recomposição do receptor será fornecida pela frente Native/root após build, não foi substituída por mocks neste relatório.

Empacotamento deve incluir os dois módulos novos e o script no HTML; `OutputEngine` reside em `saidas-producao.mjs`, não existe `output-engine.mjs` nesta instalação.
