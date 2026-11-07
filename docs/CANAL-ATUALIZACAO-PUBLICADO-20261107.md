# Canal de atualização do pacote 3Mix — infraestrutura publicada (07/11/2026)

**Status:** GitHub Pages habilitado e servindo os feeds reais. O que faltava não era código — era a publicação em si, pendente desde pelo menos 03/11/2026 (ver `docs/AUDITORIA-ASSISTENTES-20261103.md`, linha "Canal de atualização online | NÃO VALIDADA (só na fonte)").

## O que estava pendente

A auditoria de 03/11/2026 já tinha identificado: o mecanismo (`ferramentas/atualizacao-online.mjs`) está completo e correto — feed assinado Ed25519, manifesto por hash, download incremental retomável, verificação automática a cada 6h (`AUTO_INTERVAL`) — mas os arquivos gerados (`canal-atualizacoes/beta/feed.json`, `stable/feed.json`, ambos rastreados pelo git desde o commit `371b42aa2`) nunca tinham sido publicados em `https://eddysangalli.github.io/3Mix/`, a URL fixa que o código usa (`CHANNEL_BASE` em `atualizacao-online.mjs`). O GitHub Pages do repositório nunca tinha sido habilitado (`gh api repos/eddysangalli/3Mix/pages` retornava 404).

Confirmado na produção real antes da correção: `GET /api/update` respondia `"message": "Canal de atualização sem resposta. Tentamos de novo mais tarde."` — a tela de Sobre/Atualizações do operador mostrava isso, mesmo com tudo configurado corretamente do lado do cliente.

## O que foi feito

1. Criada a branch órfã `gh-pages` (sem histórico, `git worktree add --orphan`) com o conteúdo já existente e rastreado de `3mix-panel/canal-atualizacoes/` na raiz (`beta/feed.json`, `stable/feed.json`, `index.html`) — **nenhum conteúdo novo foi gerado ou assinado**, só publicado o que já estava pronto.
2. Push da branch `gh-pages` para `origin` — **autorização explícita do usuário pedida e obtida antes deste passo**, por tornar o conteúdo público de verdade (diferente de só "habilitar infraestrutura").
3. GitHub Pages ativou automaticamente ao detectar a branch (`status: "built"`, `source: {branch: "gh-pages", path: "/"}`) — minha tentativa anterior de habilitar via API com um path dentro de `main` (`/3mix-panel/canal-atualizacoes`) tinha falhado porque a API só aceita `/` ou `/docs` como path quando a fonte é uma branch; a branch órfã na raiz foi a correção certa, não um workaround.
4. Confirmado publicamente acessível: `curl https://eddysangalli.github.io/3Mix/beta/feed.json` → HTTP 200, conteúdo correto.
5. Confirmado do lado do cliente, na produção real, **sem reiniciar nada**: a verificação automática periódica do próprio processo já rodando pegou o feed na janela seguinte e `GET /api/update` passou a responder `"status": "current"`, `"message": "Você está na versão mais recente"`.

## O que ainda falta (não resolvido aqui, por decisão deliberada)

Os feeds publicados **não têm `manifestUrl`/`signatureUrl`** — só `{format, channel, version}`. Isso significa: a infraestrutura de distribuição está pronta e funcionando, mas **nenhuma atualização real pode ser oferecida ainda**. Publicar uma de verdade exige:

- Rodar `scripts/distribuicao/publicar-atualizacao.mjs --package=... --base=... --key=... --channel=beta` com um pacote selado real e a **chave privada Ed25519** do projeto.
- Essa chave privada **não está neste workspace** (só a pública, `update-public.pem`, usada para verificação do lado do cliente) — gerar uma nova quebraria a cadeia de confiança com qualquer instalação que já tenha a pública atual fixada, e decidir quem guarda/usa essa chave é do dono do projeto, não algo que eu deva resolver sozinho.
- Promoção ao canal `stable` exige aprovação nominal explícita (`--aprovar-estavel=VERSAO --aprovado-por=NOME`), por design do próprio script — nunca automática.

## Rollback

Reverter é simples e não destrutivo: desabilitar o GitHub Pages (`DELETE /repos/eddysangalli/3Mix/pages` via `gh api`) ou apagar a branch `gh-pages`. Nenhuma instalação existente é afetada — o pior caso é a mesma mensagem "Canal de atualização sem resposta" que já existia antes desta mudança.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
