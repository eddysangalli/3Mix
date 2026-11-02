# Instalador real233334 — evidência isolada

Resultado PASS de `verify → distribution → credentials → report → check`, executado com o Setup real `FreeMix-Studio-Setup-0.1.0-local.20261009233334.exe`. Esta rodada é evidência de QA; o candidato não foi selecionado para entrega, pois a revisão do coordenador identificou ajustes posteriores de marca e de sanitização OAuth.

## Identidade e isolamento

- Versão: `0.1.0-local.20261009233334`.
- Setup SHA256: `c48298a9ef2dee8b39be5df0c29c57ae829c170b37e128dc43864c5badc0a1c2`.
- Manifesto SHA256: `cdb90e40121606afaebec88dad4e5e1fade8153cf47c3b782a4711a7ea743f78`.
- Native copiado na instalação e verificado, sem execução: `6e6f8bffc247d2b5e446d6f52d46a2a1d3375f4b0c92338231060e518a7a41e3`.
- Plano próprio já preparado: `FreeMix-QA-CandidateNext-jao2QX/plan.json`; context anterior PASS não foi repetido.
- Instalações próprias: `FreeMix-QA-Distribution-Je1G3K/Installed Studio with spaces` e `Opt-in Studio with spaces`, em TEMP marcado e com portas independentes.

O programa 3Mix/Native/CEF não foi aberto nesta frente. O Setup foi invocado em modo silencioso, sem atalhos, lançamento ou aplicação de firewall. As operações de registro foram limitadas às entradas das próprias instalações temporárias, e ambos os desinstaladores confirmaram sua remoção. Não houve operação sobre a mesa do operador, hardware ou pacote selado anterior.

## Provas executadas

`--verify` real terminou em 39,3 segundos, sem instalação. A fase de distribuição real terminou em 384,3 segundos, com 13 checks PASS:

- Duas instalações do pacote integrado em caminhos independentes com espaços; 9559 arquivos conferidos sem hardlinks/junções na primeira instalação.
- Componentes Native, LocalVocal, Scene Switcher e runtime NDI correspondentes ao manifesto, sem carregar o motor.
- Credenciais WebSocket geradas, autenticação obrigatória, distintas entre as instalações e portas separadas; valores não registrados nem copiados.
- Destino não vazio recusado, preservando credenciais e arquivos existentes.
- Prévia/importação explícita de projeto sintético: mídia empacotada e dependências ausentes identificadas; hash de prévia impede importação desatualizada; UUID/mídia preservados, secrets/autostart removidos; fonte original intacta.
- Lock de inicialização serializado, sem iniciar serviço ou motor.
- DiagnosticCollector real instalado e CLI real com Node empacotado: ambos produziram ZIPs sanitizados, com sete entradas, cobrindo fixtures de token, cookie, passphrase SRT, stream key e JWT e incluindo resumo de crash/inicialização/rede. Os ZIPs/logs brutos não foram copiados para a allowlist.
- Importação opt-in do segundo Setup, credenciais independentes, ausência de autostart e preservação de projeto após desinstalação.
- Desinstalação dry-run sem remover arquivos; apply conservador removeu 9419 arquivos imutáveis correspondentes, preservou um arquivo de produto alterado pelo fixture e manteve configuração, projetos e mídia do usuário sintético.

Credenciais, relatório agregado e conferência final passaram. Os 26 JSON/logs/PNG anteriores de `scripts/installer-windows/build` e suas cópias preservadas permaneceram iguais por SHA256 antes/depois de todas as fases. Nenhum recibo213415 foi substituído.

## Recibos sanitizados

`qa-finalizacao/installer-real-233334-final/` contém dez JSONs (cinco recibos + cinco resumos de fase) e `evidence-copy.json`, com hashes dos originais e cópias e os 26 hashes de baseline. Caminhos locais nos textos dos recibos foram sanitizados; metadados de identidade/QA necessários permanecem explícitos. Logs, crashes, ZIPs diagnósticos, local.js/configs e credenciais não foram copiados.

O exportador próprio `qa-finalizacao/export-installer-next-receipts.mjs` sanitiza valores de strings antes de serializar JSON. A primeira tentativa de exportar sanitizando o documento JSON inteiro foi recusada por sintaxe inválida após a remoção do registryKey; a pasta parcial `installer-real-233334` foi preservada e não é promovida. Essa falha de exportação não repetiu nem alterou nenhuma instalação ou recibo real; a exportação final verificou todos os hashes e passou.

Allowlist congelada: `qa-finalizacao/installer-real-233334-allowlist-20261009.json`.

## Limites

Este candidato não cobre a nova regressão de callback OAuth relativo `code/state`; essa cobertura pertence ao próximo candidato com a correção do redator instalado. O teste não comprova Authenticode, Windows limpo, abertura Native/CEF, update in-place, hardware, WAN ou homologação de vídeo. A abertura Native é uma prova separada do coordenador. A revisão de marca/OAuth impede selecionar233334 como entrega; os resultados desta rodada permanecem úteis e imutáveis.
