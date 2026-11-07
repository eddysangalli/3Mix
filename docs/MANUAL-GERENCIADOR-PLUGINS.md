# 3Mix — Gerenciador de Plugins

Manual de operação da tela **Configurações → Plugins**. Esta página descreve o código-fonte de 06/11/2026; a presença da tela ou de uma DLL em uma instalação específica não comprova que o plugin carregou. Confira a versão daquela instalação e o diagnóstico de carregamento antes de usar um recurso.

O gerenciador cuida de **plugins nativos do motor** em `3mix-plugins/`. Os efeitos VST3 de áudio são administrados no mixer e têm fluxo próprio. O inventário de plugins integrados do OBS/3Mix é exibido para consulta, mas esses módulos são protegidos contra alteração pela tela.

## Consultar o que está instalado

1. No computador do 3Mix, abra **Configurações → Plugins → Instalados**.
2. Clique em **Atualizar lista**. Confira o estado, a compatibilidade, a versão, a origem, a licença, o SHA-256 e, quando houver, a assinatura e os recursos registrados.
3. Abra **Diagnóstico** para ver falhas, dependências ausentes, o último plugin alterado e as operações recentes. O botão **Atualizar diagnóstico** faz uma nova leitura; ele não carrega uma DLL desconhecida.

**Carregado** significa que o relatório nativo da inicialização confirmou a carga. **Teste no motor pendente** significa que a inspeção estática passou, mas o carregamento e o uso ainda não foram confirmados. **Instalação/atualização/desativação/remoção/rollback preparada** indica ação para o próximo reinício, não mudança já aplicada. Se a versão da libobs estiver indisponível ou o relatório estiver incompleto, investigue antes de interpretar a lista como saudável.

## Instalar ou atualizar por ZIP

1. Termine a transmissão, a gravação e as demais saídas da produção. O gerenciador bloqueia mudanças enquanto há produção ou saída ativa.
2. Confira a origem, a licença e as dependências do plugin. Use um ZIP do plugin OBS para Windows x64. A tela não executa instaladores `.exe`.
3. Para instalar, abra **Instalar arquivo → Selecionar ZIP → Analisar e preparar para reinício**. Para atualizar um plugin gerenciado, use **Atualizar por ZIP** no cartão dele e selecione o pacote.
4. Leia a mensagem da tela. A análise verifica a estrutura do ZIP, arquitetura PE x64, exportação de módulo OBS, imports/dependências, hash e assinatura. A versão instalada da libobs precisa estar disponível. Essa análise não garante compatibilidade funcional.
5. Quando estiver fora do ar e puder encerrar a sessão normalmente, reinicie pelo inicializador próprio do 3Mix. Na próxima abertura, a fila é aplicada antes de iniciar o motor. Não finalize processos à força para antecipar essa etapa.
6. Volte a **Instalados** e **Diagnóstico**. Confirme o estado **Carregado**, os recursos registrados e o funcionamento real necessário à produção. Faça um ensaio no destino e dispositivo relevantes antes de depender do plugin no ar.

O catálogo mostra pacotes avaliados e a situação de cada um. No código consultado, **não há download automático aprovado**; um cartão marcado como já incluído no 3Mix não oferece instalação duplicada.

## Verificar se há versão mais nova (motor e plugins do catálogo)

Em **Catálogo**, o botão **Verificar atualizações no GitHub** consulta a última release publicada no GitHub de cada item do catálogo e do próprio motor (`obsproject/obs-studio`), e mostra um selo por item: **Nova versão disponível** (com a versão e um link "ver release"), **Atualizado**, **Instalado é mais novo que a última release**, **Falha ao consultar**, **Sem release publicada** ou **Sem origem verificável** (quando o catálogo não tem uma `sourceUrl` do GitHub para aquele item).

- **Isto é só leitura.** A checagem nunca baixa, instala ou altera nenhum arquivo — ela só compara a versão instalada com a tag mais recente publicada no GitHub. O texto "Somente leitura" aparece sempre que um resultado é mostrado.
- Uma consulta falhando (rede, limite de requisições do GitHub, repositório renomeado) nunca impede as demais: cada item tem seu próprio resultado, independente dos outros.
- Esta checagem é **complementar**, não substitui nenhum dos três mecanismos existentes:
  - A atualização do **pacote 3Mix** em si (painel/ferramentas) continua sendo feita pelo feed assinado de `atualizacao-online.mjs`, de um canal aprovado.
  - A **instalação de um plugin** continua exigindo um ZIP analisado manualmente (seção anterior); o catálogo não ganhou download automático.
  - A **integridade local** dos componentes já instalados (hash contra o que a entrega aprovada declarou) continua sendo o papel de `verificar-atualizacoes.mjs`, que não consulta nada externo.
- Uma versão nova encontrada aqui é um sinal para o operador (ou para quem prepara a próxima entrega 3Mix) avaliar e testar — não uma recomendação automática para atualizar em produção sem antes confirmar compatibilidade com o motor desta instalação.

## Limites desta documentação

## Desabilitar, remover ou voltar à versão anterior

- Em **Instalados**, somente um plugin do diretório gerenciado e sem operação pendente oferece **Habilitar/Desabilitar**, **Remover** e **Rollback**. O rollback só aparece habilitado quando existe backup válido.
- Essas ações são preparadas para o próximo reinício seguro. **Remover** e **Rollback** pedem confirmação na tela. O gerenciador conserva projetos e perfis, e a versão anterior de uma atualização é guardada para rollback.
- Após o reinício, releia o estado e o diagnóstico. Um estado preparado que persiste, `LOAD_INCOMPLETE`, `LOAD_FAILED` ou `MODULE_MISSING` pede investigação; não presuma que a ação foi concluída.
- Em **Diagnóstico**, **Ativar modo de segurança** prepara uma inicialização sem os plugins do diretório gerenciado. Desative-o pela mesma tela quando o problema tiver sido resolvido. A escolha também exige reinício para ter efeito.

## Limites desta documentação

O fluxo foi validado por testes de ciclo de vida da API e testes de interface em bancada, mas ainda requer prova de carga/uso do módulo com o binário nativo correspondente e validação de hardware e operação. O gerenciador não transforma uma DLL presente em recurso pronto para transmissão. Consulte a [auditoria técnica](GERENCIADOR-PLUGINS-20261104.md), a [referência da API](API.md) e os [limites conhecidos](LIMITES-CONHECIDOS.md) para o estado de cada pacote e teste.
