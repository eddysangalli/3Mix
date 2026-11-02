# 3Mix — Guia Rápido (uma página)

Passo a passo ilustrado com capturas de tela reais do 3Mix, da instalação ao primeiro corte ao vivo. Para detalhes completos, veja [`LEIA-ME-BETA.md`](LEIA-ME-BETA.md).

> **Sobre as capturas deste guia:** foram feitas a partir das telas reais do painel do 3Mix, servidas localmente sem o motor nativo rodando (modo "somente painel", usado para documentação). Por isso você verá indicadores como "sem conexão com o motor" ou "reconectando…" nas imagens — isso é esperado nesta captura e não representa um erro do produto. Com o motor aberto pelo iniciador normal, esses indicadores mudam para o estado conectado.

---

## 1. Instalar

Execute o instalador (`FreeMix-Studio-Setup-*.exe`), confira o SHA-256 antes (seção 8 de `LEIA-ME-BETA.md`) e escolha uma pasta nova e vazia como destino. Se o Windows SmartScreen avisar, veja a seção 6 de `LEIA-ME-BETA.md`.

## 2. Abrir

Use o atalho **3Mix Studio** criado pela instalação (ou `INICIAR-3MIX.cmd` no ambiente de desenvolvimento). Não abra o executável do motor sozinho.

## 3. Hub de Operadores

Ao abrir, você chega ao Hub — o ponto de partida com acesso a todos os módulos do 3Mix: mesa modular, mesa de corte, playlists, mixer de áudio, rundown, retornos, blackbox, GC, overlays/DSK, replay, gravação ISO, fontes de dados, composições, MultiView, matriz AUX e configurações.

![Hub de Operadores do 3Mix](../../qa-beta/capturas/manual/01-hub.png)

## 4. Mesa principal (modular)

A mesa reúne Prévia (PV) e Programa (PGM) lado a lado, o módulo de entradas (fontes), o mixer de áudio, DSK e rundown em abas, e a barra inferior com gravação, saídas externas, transmissão e o botão **Pre-Flight** (verificação de segurança antes de ir ao ar). Use **Adicionar entrada** para registrar sua primeira câmera ou mídia.

![Mesa principal modular do 3Mix](../../qa-beta/capturas/manual/02-mesa-modular.png)

## 5. Áudio

O módulo de Áudio abre o mixer completo: canais de entrada à esquerda, saídas/mestre ao centro e o inspetor de canal à direita (ganho, EQ, roteamento ao selecionar um canal). As abas superiores dão acesso a Roteamento, Retornos/N-1 e Dispositivos.

![Mixer de áudio do 3Mix](../../qa-beta/capturas/manual/03-audio.png)

## 6. Replay

O módulo de Replay traz dois players independentes (A e B) para marcar entrada/saída de lances, câmera lenta ajustável, QuadView de histórico multicâmera e a lista de lances salvos. Marcar IN/OUT e carregar em A/B apenas prepara o player — não coloca no ar sozinho.

![Replay multicâmera do 3Mix](../../qa-beta/capturas/manual/04-replay.png)

## 7. Configurações

A tela de Configurações organiza categorias à esquerda e o formulário da categoria aberta à direita, com busca, escopo de aplicação (categoria aberta / rascunho / todas), importar/exportar e restaurar padrões.

![Tela de configurações do 3Mix](../../qa-beta/capturas/manual/05-configuracoes.png)

## 8. Saídas (MultiStream / Matriz AUX)

A tela de Saídas controla a transmissão principal e destinos adicionais (MultiStream), além da Matriz AUX para roteamento independente de saídas. Cada saída adicional é configurada separadamente antes de iniciar.

![Tela de saídas do 3Mix](../../qa-beta/capturas/manual/06-saidas.png)

## 9. Antes de ir ao ar

1. Clique em **Pre-Flight** na mesa principal e resolva os avisos apontados.
2. Confirme fontes de áudio e vídeo ativas no módulo de Áudio e no módulo de entradas.
3. Faça um teste de gravação curto e confira o arquivo gerado antes de uma transmissão real.

## 10. Se algo der errado

Veja [`SOLICITAR-SUPORTE.md`](SOLICITAR-SUPORTE.md) para gerar o ZIP de diagnóstico, e [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md) para checar se o comportamento já é um limite conhecido desta beta.
