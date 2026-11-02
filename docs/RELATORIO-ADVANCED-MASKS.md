# Advanced Masks — integração local verificada

Conferência em 2026-10-08T20:23:10.197Z. Advanced Masks oficial **1.5.4** foi instalado em modo portátil; não foi executado instalador externo, não houve ativação remota e nenhum executável/configuração do operador foi alterado. Move 3.2.1 foi preservado.

## Arquivos e origem

- `obs-vmix/obs-plugins/64bit/obs-advanced-masks.dll` (390760 bytes); SHA256 **e28aee27b8e02c0e05c843b19f64ce573ee7a78d77eda0c913b9045c07e48839**.
- `obs-vmix/data/obs-plugins/obs-advanced-masks/`: shaders e locales oficiais.
- `obs-vmix/licenses/advanced-masks/`: LICENSE.txt GPLv2, NOTICE, release/provenance e **source-v1.5.4.zip** com fonte e scripts de build correspondentes, sem modificações.
- ZIP Windows oficial SHA256 **7ad71a7e4d1b3a042d46a4905844ffdcf8198828553457992e6fa8875e9a8ced**, comparado com o digest publicado pela API GitHub. Fonte ZIP SHA256 **2afa8f57abfe783af73e49088cfc83ceb74c41f598b3407a334ee0e77a1ca385**.

Origem: [recurso oficial OBS](https://obsproject.com/forum/resources/advanced-masks.1856/) → [repositório do autor](https://github.com/FiniteSingularity/obs-advanced-masks) → [release v1.5.4](https://github.com/FiniteSingularity/obs-advanced-masks/releases/tag/v1.5.4). O recurso informa OBS mínimo 28; a compatibilidade foi demonstrada no nosso motor real abaixo.

## Evidência executada

[qa-portatil/advanced-masks-resultado.json](qa-portatil/advanced-masks-resultado.json): **8 PASS**, em raiz FreeMix-QA-Parallel-Outputs-20261008, WS 14478/API 18100. Motor 32.2.2; EXE SHA256 **074dfe583c989abab98ce74e35c49113fddda0d8fe2c08be84e2aadc188e8529**.

O filtro **advanced_masks_filter_v2** apareceu no registro; log confirmou a versão 1.5.4 carregada. Foi criada uma entrada verde sintética 640×360 em cena própria, sem abrir câmera nem mexer em Preview/Programa. GetSourceScreenshot confirmou entrada opaca antes, centro opaco e cantos com alpha 0 após máscara circular, além do raio real. Atualizar o mesmo filtro para retângulo mudou os pixels da imagem. As capturas foram abertas e inspecionadas visualmente:

- [antes](qa-portatil/advanced-masks-provenance/captures/before.png)
- [círculo](qa-portatil/advanced-masks-provenance/captures/circle.png)
- [retângulo](qa-portatil/advanced-masks-provenance/captures/rectangle.png)

Fonte/cena QA removidas depois da prova; QA PID 30448 salva e fechada normalmente, API própria PID 90000 encerrada depois de confirmar motor fechado. Não foi preciso recompilar C++.

## Como usar e limites

Na próxima abertura do 3Mix, abrir os filtros originais da entrada, adicionar **Advanced Mask**, escolher Shape/Circle/Rectangle ou outro modo e ajustar. O plugin também oferece máscaras por fonte, imagem e gradiente segundo a documentação do autor. Círculo e retângulo foram exercitados; os demais modos não recebem declaração de QA nesta entrega.

Este trabalho integra o filtro original; **não adiciona controles específicos dentro do editor Compor**. Máscara de uma fonte compartilhada afeta todos os locais que usam aquela fonte: para efeito por slot, aplicar no wrapper/cena independente da composição, preservando a câmera original. A distribuição versionada ainda deve incluir os três namespaces de arquivos listados acima e a fonte ZIP; não se afirma que o instalador antigo já contém este plugin.

## StreamFX — situação oficial e alternativas

O link histórico Xaymar/obs-StreamFX redireciona para [Vhonowslend/StreamFX-Public](https://github.com/Vhonowslend/StreamFX-Public). A [FAQ oficial](https://github.com/Vhonowslend/StreamFX-Public/wiki/About-StreamFX) informa distribuição atual de binários e fonte por Patreon/Discord; sem assinatura contínua obrigatória depois do download. A inspeção da API GitHub encontrou as cinco releases mais recentes sem assets públicos, inclusive 0.12.0b299. Portanto nenhum StreamFX foi instalado ou obtido de mirror. Não foi feita compra nem ativação.

O repositório público tem LICENSE GPLv2; README menciona GPLv3, então há divergência documental. Isso não prova licença/proveniência de um binário privado atual; a integração exigiria o artefato oficial compatível e sua licença/fonte correspondente. Não promete StreamFX como recurso entregue.

Alternativas já disponíveis por área: Advanced Masks para máscara geométrica/fonte/imagem/gradiente; Move 3.2.1 para transformação animada/Merge; filtros originais OBS para crop, chromakey, correção de cor e máscara de imagem; encoders originais H.264/HEVC/AV1 agora descobertos pelo 3Mix. Essas alternativas **não equivalem ao pacote inteiro StreamFX**: blur avançado, transformação 3D e shaders personalizados continuam fora desta integração.

Inventário completo e hashes de todos os arquivos novos: [portable-install.json](qa-portatil/advanced-masks-provenance/portable-install.json). Inspeção StreamFX: [streamfx-inspection.json](qa-portatil/advanced-masks-provenance/streamfx-inspection.json).
