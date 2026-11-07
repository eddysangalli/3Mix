# Distribuição Windows e importação explícita

O instalador padrão cria uma instalação nova/vazia e não abre o motor. O pacote de distribuição continua limpo; projetos do operador não entram no ZIP. O builder recusa sobrescrever um EXE existente. O instalador 213415 passou por duas instalações reais e startup integrado em raízes TEMP; novas correções exigem outra versão e outra rodada de verificação.

`node scripts/installer-windows/build.mjs --zip=CAMINHO_ASSINADO --output=CAMINHO_NOVO --stub-only` compila os executáveis de teste com o compilador .NET Framework local. Ambos os caminhos são obrigatórios; o builder não usa uma versão antiga como padrão. Sem `--stub-only`, gera o EXE completo no destino novo. O builder anexa o ZIP por streaming e incorpora seu SHA-256 no EXE. Isso não significa que o builder verificou o manifesto Ed25519: a instalação normal executa essa validação pelo instalador offline extraído. Não há certificado Authenticode disponível.

O EXE suporta `--verify` (SHA-256 do ZIP incorporado e estrutura ZIP; não executa a validação Ed25519), `--silent --dest=PASTA_NOVA`, `--api-port=N`, `--ws-port=N`, `--no-shortcuts`, `--log=ARQUIVO`, `--import-project=PASTA_UUID.fmx` e `--project-name=NOME`. Sem opções de importação, a instalação permanece limpa. O botão de importação da interface é opt-in. A cópia criada recebe outro ID, coleção e perfil; as credenciais não são copiadas e nenhuma saída ou automação é iniciada.

## Contrato de recuperação

A API e o controle existentes já encaminham `recovery_*`. A resposta fica em `response.recovery`.

- Prévia: `recovery_import_preview`, dados `{projectPath: "C:/.../UUID.fmx", name: "Nova produção"}`. O nome é opcional; a pasta deve ser um snapshot `.fmx` externo e separado da instalação. Retorna `success`, `preview`, `project`, `manifestHash`, `name`, `sourceName`, `files`, `bytes`, `dependencies`, `plugins`, `devices`, `fonts` e os limites de homologação.
- Aplicação: `recovery_import`, dados `{projectPath, name, expectedManifestHash}`. Exige o hash retornado pela prévia e motor ocioso. Revalida os hashes, recusa nome já usado e usa a recuperação existente para criar/selecionar outra coleção e perfil. Retorna os campos normais da recuperação, `imported: true`, `preview`, `credentialsCopied: false`, `outputsStarted: false`, `automationsStarted: false`. Não reproduz o journal de macros.
- Dependências: status `bundled`, `missing`, `external-file`, `external-directory` ou `link-refused`. Plugins recebem a análise PE local. Dispositivos e fontes são referências para conferência, sem instalação automática.
- A UI invalida a confirmação se caminho/nome mudarem. O caminho `.fmx` é informado explicitamente; ZIPs, executáveis, junções e travessias não são aceitos.

Para uma instalação nova fechada, `runtime/node.exe ferramentas/recuperacao-importacao.mjs --root=INSTALACAO --project=UUID.fmx` imprime a prévia. A confirmação acrescenta `--apply --expected-hash=HASH`. Exige `installation.json` válido, portas livres e ausência de importação anterior. Grava `project-import.json`, mantém a coleção limpa e o `user.ini.pre-import`, e seleciona a nova produção sem abrir qualquer aplicação. O CLI de instalação também aceita `--import-project "UUID.fmx" --project-name "Nome"` como autorização explícita.

## Desinstalação conservadora

O instalador inclui `Desinstalar 3Mix.exe` e registra somente sua própria entrada HKCU. A desinstalação usa `uninstall-files.json` da instalação: remove apenas arquivos imutáveis próprios que ainda correspondem ao tamanho e SHA-256 registrados. Configurações, projetos, mídia, gravações, diagnósticos, logs, arquivos alterados e arquivos não listados permanecem. Atalhos só são removidos se correspondem ao hash e às pastas oficiais atuais. Não encerra processos e recusa motor/portas em uso.

`"Desinstalar 3Mix.exe" --silent --dry-run` gera a prévia sem remover arquivos. `--silent --apply` aplica. O próprio desinstalador e recibos ficam no destino, junto com os dados preservados; a pasta não é apagada recursivamente. Erros parciais são reportados, sem alegar reversão completa.

## Evidências e limites

As evidências históricas em `qa/` usaram raízes TEMP `FreeMix-QA-*`; isso não autoriza repetir esse layout. Toda nova execução de QA deve usar uma subpasta com finalidade clara dentro de `qa-finalizacao/` do workspace, sem alterar a instalação do operador nem iniciar um motor antes de conferir tema e configuração 3Mix. Os recibos em `build/qa-*.json` e `build/ui-matrix/receipt.json` distinguem instalação real, fixtures de API/recuperação e telas simuladas. A API usa backend isolado para concorrência, porta ocupada e reabertura; não inicia o Native. A matriz de telas cobre 900x650, 1280x720 e 1920x1080, DPI 100/125/150/200%.

Há provas de preservação de mídia/UUID, remoção de credenciais, quatro destinos nativos parados, integridade da prévia, rejeição de travessias/junções, desinstalação por hashes e ZIP de suporte com tokens/cookies/chaves/SRT omitidos. `input_variant`, `input_link` e `input_content_undo` capturam o estado final recuperável; não reproduzem o histórico de undo como macro.

VM Windows limpa, Authenticode e dispositivos físicos não foram homologados nesta frente. Uma análise por hashes não confere assinatura pública ao snapshot local. A integração central e a próxima release final ficam com o responsável principal.

## Verificação adicional do coordenador — 09/10

Importação online Native passou em coleção/perfil novos na raiz QA: título/UUID preservados, hash antigo recusado, destinos SRT 4:4:4 e alpha packed mantidos sem iniciar saídas. O coordenador ampliou a allowlist de recuperação para chroma/alphaMode/audioSourceUuid e validou as referências de áudio. Resultado-native-integration.json acompanha a integração. Nenhuma sessão do operador alterada.

## Regressão de atualização assinada — evidência atual

`ferramentas/test-updater-payload-real.mjs` aplica arquivos reais do painel, presets SRT e documentação Alpha em uma instalação-fixture sob `qa-finalizacao/vmix30-distribuicao/`. O teste gera um par Ed25519 exclusivo de QA, valida o manifesto, confere hashes instalados e executa rollback, incluindo restauração de arquivo anterior e remoção de arquivo novo. O recibo é `payload-rehearsal.json` nessa pasta.

Essa prova **não** equivale à publicação no canal GitHub, uso da chave de confiança de produção, instalação do EXE final, carregamento de DLLs OBS33 ou abertura do motor. Não substitui os recibos de instalação e startup da release exata. O arquivo instalado chama-se `Desinstalar 3Mix.exe`; nomes internos de assembly e recurso não são nomes de produto expostos ao operador.

### Cadeia de confiança e alcance de `--verify`

`--verify` termina antes de chamar `ferramentas/instalar-portatil.mjs`. Portanto, sucesso nesse modo não comprova assinatura do manifesto, instalação ou abertura do motor. Na instalação normal, o instalador offline verifica Ed25519 e a chave pública do pacote contra sua chave fixada. O próprio validador e essa chave são extraídos do payload; a autenticidade do EXE recebido precisa ser estabelecida por distribuição confiável e conferência do hash publicado por canal confiável. Hash incorporado não substitui Authenticode nem autentica sozinho quem produziu o EXE.
