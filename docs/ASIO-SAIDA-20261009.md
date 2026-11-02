# Saída ASIO multicanal — implementação, integração e limites

O 3Mix agora tem host nativo de playback ASIO, separado do plugin de captura. Abre um driver explicitamente escolhido, com até oito fontes/submixes estéreo mapeados para até 16 canais físicos distintos. Abrir configurações ou consultar estado não inicializa driver nem reproduz áudio. Não há autostart.

## Allowlist exata

- `freemix-app/frontend/widgets/FreeMixAsioOutput.hpp` e `.cpp` (novos)
- `freemix-app/frontend/widgets/FreeMixAudioRouting.cpp`
- `freemix-app/frontend/cmake/ui-widgets.cmake`: apenas duas novas linhas de fontes do host
- `freemix-app/deps/asio-sdk/common/{asio.h,asiosys.h,iasiodrv.h}` e `LICENSE.txt`, `README.md`, `FREEMIX-PROVENANCE.md`
- `obs-vmix/ferramentas/audio-buses-producao.mjs`
- `obs-vmix/painel/remoto/audio.html` e `audio-buses.js`
- QA desta pasta: `test-asio.cpp`, `test-api-ui.mjs`, `bridge-compile.rsp`, `resultado-native.json`, `resultado-bridge-compile.json`, `resultado-api-ui.json`, `RELATORIO.md`, `hashes.json`; screenshot opcional.

Não copiar objetos/exe/fixture QA para runtime. Copiar SDK e fontes respeitando árvore `deps/asio-sdk` ao espelhar `docs/native-source`: o include relativo depende disso.

## Contrato para o coordenador

O handler existente `audio_capabilities` recebe `asioAction='state|configure|start|stop|control-panel'` e responde `asioOutputCapabilities`. Configure inclui `driverId` (CLSID de driver instalado), `bufferFrames` (0 recomendado, ou 16–8192) e `routes=[{uuid,left,right,gain}]`. Índices físicos começam em 0; canais repetidos são recusados. Taxa igual ao projeto, sem resampling implícito.

Em `audio-routing-producao.mjs`, a condição que delega `busEngine.command` já foi atualizada pelo coordenador para incluir `action.startsWith('audio_routing_asio_output_')`. Não editei esse arquivo porque pertence ao coordenador. O endpoint /api/control conserva a autorização local existente. Comandos novos: `audio_routing_asio_output_configure|start|stop|control-panel|state`.

Nenhuma alteração em Multistream.cpp. Lifecycle nativo se conecta a aboutToQuit e eventos de mudança/limpeza de coleção/perfil. Timer GUI interrompe quando taxa/fonte/clock muda ou driver deixa de emitir callbacks por dois segundos; callback privado também trava saída em silêncio imediatamente.

Build completo é do coordenador. Inclua os dois novos cpp/hpp no target já atualizado, mantenha SDK relativo, MSVC C++17. Ole32/Advapi32 são indicados no cpp por pragma de link. A receita de compile-only do bridge está em `bridge-compile.rsp`; escreve somente `bridge.obj` nesta QA, sem alterar build compartilhado.

## Processamento e proteção

Driver callback usa filas SPSC pré-alocadas por rota (16384 frames), conversão PCM sem alocação, lock, registry, GUI ou libobs. Underrun envia zeros. Overrun descarta bloco inteiro e incrementa métrica. NaN/Inf viram zeros, amplitudes são limitadas a -1…1. Métricas incluem callbacks, frames, underrun/overrun, inválidos/clipping, filas, buffer, taxa, latência do driver e fault.

Fontes públicas pós-filtro/volume e submixes independentes sem trilhas globais. Mic privado, retornos e captura ASIO/loopback são recusados para evitar realimentação; membros dos submixes também são verificados. Só inputs com mixers=0 recebem lease de ativação, sem mudar suas rotas. Fontes roteadas seguem ativação existente. Não há envio implícito ao Master nem escolha automática de dispositivo.

## Provas

- `resultado-native.json`: IASIO mock injetado no mesmo host C++, sem COM/registro/driver físico. Oito rotas alimentam os buffers nativos de 16 canais em 16 formatos PCM/endian, com comparação de bytes e fixtures conhecidas. Underrun=zero; NaN/clipping/overrun; colisão/tamanho inválido/DSD/buffer nulo; rate/reset falha com silêncio; host adicional recusado antes de abrir driver. Dois threads exercitam produtor/consumidor por 2000 callbacks. Dez mil callbacks+push levaram aproximadamente 101 ms no teste otimizado. **Zero alocações dentro do driver callback**.
- `resultado-bridge-compile.json`: FreeMixAudioRouting.cpp com dependências Qt/libobs reais compila isoladamente no MSVC x64, `/WX /W3 /permissive-`, sem warnings tratados como erros.
- `resultado-api-ui.json`: HTTP real + Edge com vendor nativo mock. Configurar dois pares não inicia áudio; iniciar/parar/painel usam ações explícitas; edição fica travada ativo. Privado/loopback/colisões são barrados antes da chamada nativa. Zero erros JS. Configuração é salva em raiz QA nova por execução.

Scripts JS passaram `node --check`. Nenhum dispositivo físico, processo/configuração do operador, driver instalado, transmissão ou publicação foi modificado.

## Limites reais

- Os buffers multicanal e o fluxo IASIO foram executados contra mock. Não foi ouvido áudio nem medido hardware externo. COM real, painel de fabricante, hotplug, carga máxima e coexistência com plugin de captura requerem homologação em placa escolhida pelo operador; `hardwareVerified=false` permanece explícito.
- Win64/PCM. DSD não suportado. Não se declara genlock físico nem sincronização de clocks diferentes. Taxa deve coincidir; deriva de clock aparece nas métricas de underrun/overrun e não recebe compensação/resampler adaptativo nesta versão.
- Latência mostrada pelo driver não inclui toda a captura/submix/filas. Fila máxima é 16384/rate segundos; o estado expõe a ocupação por rota. Não confundir teste acelerado de callbacks com garantia de áudio em tempo real sob carga.
- Drivers de terceiros podem recusar abertura/formatos/buffers ou falhar no próprio driver; erros normais são retornados. Stop/dispose seguem o contrato IASIO de cessar callbacks; nenhuma liberação forçada de contexto em uso foi introduzida.
- Configuração JS é persistida por coleção; ao reiniciar, exige aplicar novamente e iniciar explicitamente. Fontes de loopback/ASIO capture foram deliberadamente excluídas para evitar feedback, mesmo quando o usuário desejaria um caminho com drivers diferentes.
- Dispatch já integrado pelo coordenador; ainda é necessário realizar build/link completo, espelhar fonte/SDK e incluir binário no payload. Não houve commit/push/instalação nesta frente.

## Integração executada pelo coordenador

Build completo terminou exit0, EXE SHA256 4c5cd86485860c6fdcebab08662259d1b0837b5aecff3035b2d402ac672b203f. Vendor real enumerou quatro drivers sem abrir nenhum e rejeitou configuração inválida; resultado-native-integration.json. Isso não constitui playback físico. Patches/sourceSDKGPLv3 incorporados ao repositório; pacote final ainda por gerar.
