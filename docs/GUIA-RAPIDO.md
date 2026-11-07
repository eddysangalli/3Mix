# 3Mix — Guia Rápido (Alpha)

Do primeiro clique ao primeiro corte no ar, em uma página. As imagens são capturas do 3Mix feitas em versões e bancadas identificadas no [índice dos manuais](MANUAIS.md); a tela da sua instalação pode ser diferente. O passo a passo completo está no [Manual do Operador](usuario/manual-operador.html).

---

## 1. Instalar

- **ZIP da Alpha:** extraia o ZIP inteiro numa pasta sua (por exemplo `Documentos\3Mix`). Não abra de dentro do ZIP.
- **Instalador (.exe):** escolha uma pasta nova e vazia.

Confira o SHA-256 antes (seção 8 de [`LEIA-ME-BETA.md`](LEIA-ME-BETA.md)). Se o Windows mostrar "O Windows protegeu o computador", veja a seção 6 do mesmo arquivo.

## 2. Abrir

No workspace deste projeto, use **INICIAR-3MIX.cmd** na raiz. Em um pacote instalado, use o atalho ou inicializador próprio incluído nele. Não abra `3Mix.exe` isoladamente. Espere o selo **Motor conectado** e confirme que a interface exibida é a do 3Mix antes de operar.

## 3. Hub de Produção

Ponto de partida das telas de operação. Cada cartão abre um módulo; **Copiar** copia o endereço para usar em outro computador ou tablet.

![Hub de Produção](capturas/manual/hub.png)

## 4. Mesa principal

Pré-visualização (verde) e Programa (vermelho) no alto; CUT, AUTO, T-Bar e DSK no meio; entradas embaixo; mixer ao lado; rodapé com **Adicionar entrada**, **Gravar**, **Externo**, **Transmitir** e **Pre-Flight**.

![Mesa principal](capturas/manual/mesa-principal.png)

1. **Adicionar entrada** e escolha o tipo (câmera, mídia, GC, call…).
2. Clique no cartão da entrada: ela vai para o Preview.
3. **CUT** (seco) ou **AUTO** (com a transição e a duração escolhidas). No cartão, **GO** leva ao ar com a transição e **Cut** corta seco.
4. Os botões **1** a **8** do cartão operam os DSK: primeiro clique prepara, segundo entra no ar.

## 5. Áudio

Aba **Áudio** da barra superior: canais com Ganho, Pan, MUTE, SOLO, AFV e MON; envios MAIN, A e B; saídas MAIN (vai ao ar), BUS A, BUS B e fones; efeitos e plugins no inspetor do canal.

![Mixer de áudio](capturas/manual/audio-mixer.png)

## 6. Replay

**Iniciar REC** guarda o histórico das câmeras. **−5 s / −10 s / −20 s** ou **MARCAR IN / OUT** salvam o lance; carregue em A ou B e use **Colocar Player A no ar**. Carregar em A/B não coloca no ar sozinho.

![Replay](capturas/manual/replay.png)

## 7. Gravar e transmitir

- **⚙ ao lado de Gravar:** formato, pasta e qualidade. **Gravar** inicia e para.
- **⚙ ao lado de Transmitir:** destino, URL e chave. **Transmitir** inicia e para. Se a chave do destino principal for alterada durante a transmissão, a nova chave só valerá no **próximo início**. Os destinos extras precisam ser parados antes de alterar suas configurações.

![Transmissão](capturas/manual/transmitir.png)

## 8. Atraso e DUMP

Proteção para a transmissão principal: ela sai alguns segundos atrasada e o **DUMP** descarta o trecho que ainda não foi ao ar.

1. **Configurações › Transmissão › Atraso e DUMP**: marque **Atraso de transmissão**, escolha a duração adequada à operação, confira a opção de reconexão e clique **Aplicar**.
2. Vale no próximo início da transmissão.
3. No ar, confirme que a barra mostra **Atraso N s** em verde, com o valor configurado. Para descartar: clique **DUMP**, depois **Confirmar DUMP** em até 3 s.

![Configurações, Atraso e DUMP](capturas/manual/config-atraso-dump.png)

![Barra da mesa no ar e protegida](capturas/manual/barra-dump-protegido.png) ![Primeiro clique: Confirmar DUMP](capturas/manual/barra-dump-armado.png)

O DUMP cobre só a transmissão principal: gravação e saídas extras (MultiStream, SRT, NDI, DeckLink) não passam pelo atraso. Depois do DUMP, o destino fica com a imagem parada por cerca do tempo do atraso.

## 9. Antes de ir ao ar

1. Clique em **Pre-Flight**, escolha **Para: transmitir e gravar / só transmitir / só gravar** e revise **BLOQUEIO**, **ATENÇÃO** e **NÃO VERIFICADO**. O **↻** de cada item confere só aquele item de novo.
2. Analise os **Programas concorrentes** apontados. A decisão de fechá-los ou ignorá-los deve considerar a produção em curso; não encerre um processo de transmissão para liberar espaço ou pasta de teste.
3. Faça uma gravação curta de teste e abra o arquivo.

![Pre-Flight](capturas/manual/preflight.png)

## 10. Se algo der errado

- **Caixa-preta › Registrar incidente agora** guarda uma amostra dos últimos 60 segundos de **telemetria**, quando a coleta esteve ativa. Não é uma gravação de vídeo/áudio do programa.
- **Configurações › Sobre e suporte › Relatar problema › Gerar pacote** cria o ZIP para o suporte. Se o 3Mix nem abrir, use **COLETAR-LOGS.cmd**.
- Veja [`SOLICITAR-SUPORTE.md`](SOLICITAR-SUPORTE.md) e confira em [`LIMITES-CONHECIDOS.md`](LIMITES-CONHECIDOS.md) se o comportamento já é um limite conhecido desta Alpha.
