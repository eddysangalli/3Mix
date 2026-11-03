# 3Mix — Manuais da Alpha

Qual documento ler, conforme quem você é.

| Documento | Para quem | O que tem | Onde abrir |
|---|---|---|---|
| **Manual do Operador** (`painel/docs/usuario/manual-operador.html`) | Técnico de corte, de áudio e produtor | Cada tela do 3Mix: para que serve, passos e limites, com imagens reais. Mesa, entradas, CUT/AUTO, DSK, M/E, Áudio, Replay, Color, GC, gravação, transmissão, saídas, Atraso e DUMP, Calls, Pre-Flight, Configurações, atalhos e problemas comuns | No programa: **Hub › Manual do operador**, **Sobre e suporte › Manual do operador** ou o botão **Manual** do Color Studio. Fora dele: abra o arquivo no navegador |
| [`GUIA-RAPIDO.md`](GUIA-RAPIDO.md) | Quem abre o 3Mix pela primeira vez | Uma página: instalar, abrir, primeiro corte, gravar, transmitir, DUMP e Pre-Flight | Na pasta `docs/` |
| [`LEIA-ME-BETA.md`](LEIA-ME-BETA.md) | Quem instala e distribui a Alpha | Requisitos, instalação pelo ZIP ou instalador, aviso do Windows, SHA-256, atualização e desinstalação | Na pasta `docs/` |
| [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md) | Quem testa, vende ou dá suporte | O que não funciona ou não foi provado, com a fonte de cada item | Na pasta `docs/` |
| [`SOLICITAR-SUPORTE.md`](SOLICITAR-SUPORTE.md) | Quem encontrou um problema | Como gerar o pacote de diagnóstico e o que mandar | Na pasta `docs/` |
| [`CHANGELOG.md`](CHANGELOG.md) | Todos | Novidades de cada versão | Na pasta `docs/` |
| [`INSTALACAO.md`](INSTALACAO.md) | Suporte técnico | Registro técnico do instalador de outubro (anterior à Alpha) | Na pasta `docs/` |
| **Manual técnico** (`painel/docs/manual.html`) | Desenvolvimento e manutenção | Histórico técnico: o que foi implementado, testes, relatórios. Não é leitura de operação | Aba **Manual técnico** no alto do Manual do Operador |

## Imagens

As imagens dos manuais ficam em `docs/capturas/manual/` (usadas pelo Guia Rápido e pelo Leia-me) e em `painel/docs/usuario/capturas/` (cópia usada pelo Manual do Operador, que o programa serve). São telas reais: Mesa, Áudio, Replay e Color da instalação em uso (`docs/capturas/3mix/`); as demais de uma bancada isolada com o projeto Demonstração Compacta. Endereços de rede da máquina estão cobertos no print do Hub.

Os scripts que geraram os prints estão em `qa-manuais/` (`bancada.mjs`, `capturar-manual.mjs`, `capturar-dump-extra.mjs`).
