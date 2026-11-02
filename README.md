# 3Mix

Suíte de produção broadcast com painel operacional próprio e motor nativo baseado em OBS Studio/libobs.

## Estado da entrega

Projeto em desenvolvimento e qualificação. Este repositório contém fontes: um clone não é um instalador pronto. A beta completa ainda não possui aceite integral em Windows limpo.

- Multi-M/E: adaptadores, Patch, áudio por M/E e superfícies de controle; provas e limites estão em [Limites conhecidos](docs/LIMITES-CONHECIDOS.md).
- Mesa, áudio, replay, composição, gráficos, saídas e operação remota têm escopos de teste distintos. Código presente não significa homologação de todo hardware ou rede.
- As imagens antigas em `screenshots/` são históricas e não representam a interface atual; não são apresentadas como capturas da entrega atual.

## Abrir no workspace de desenvolvimento

Use `INICIAR-3MIX.cmd` na raiz do workspace 3Mix. Não execute o binário nativo diretamente. O launcher prepara a instalação e conecta os serviços locais.

Estrutura canônica do workspace:

| Diretório | Finalidade |
|---|---|
| `3mix-panel/` (este repositório; alias `FreeMix/`) | Painel Web, API e ferramentas |
| `3mix-engine/` (alias `freemix-app/`) | Fontes do motor nativo |
| `3mix-runtime/` | Instalação portátil do operador |
| `qa-beta/` | Recibos e verificações locais |

## Documentação

- [Visão de produto](docs/PRODUCT-VISION.md)
- [Guia rápido](docs/GUIA-RAPIDO.md)
- [Instalação e beta](docs/LEIA-ME-BETA.md)
- [Limites conhecidos](docs/LIMITES-CONHECIDOS.md)
- [Changelog](docs/CHANGELOG.md)
- [Compilar a partir das fontes](docs/BUILD-FROM-SOURCE.md)
- [Licenças e avisos de terceiros](docs/THIRD-PARTY-NOTICES.txt)

## Licenciamento

Consulte `LICENSE` e os avisos dos componentes. O motor baseado em OBS/libobs está sujeito às respectivas obrigações GPL; esta apresentação não concede relicenciamento dos componentes de terceiros. Preço e termos comerciais finais não estão definidos por este README.
