# Bridges e bonding — análise de 09/10/2026

Análise somente leitura dos sites e inventário dos ZIPs em `downloads`. Nenhum EXE, instalador, guardian ou script dos pacotes foi executado. As funções anunciadas não foram homologadas por execução. Não copiamos código/binários desses produtos para 3Mix.

## O que os produtos anunciam

| Produto | Capacidades documentadas | Aplicação no 3Mix |
|---|---|---|
| [SRTBONDMAGIC](https://srtbondmagic.chargexdev.com.br/), v0.5.0 | Entradas NDI/SRT, H.264/HEVC por hardware, bonding srtla, RTMP por interface com bitrate próprio, saídas isoladas e supervisor. Receptor SRT→NDI com áudio e appliance Linux para bonding. | Referência de operação de contribuição, interfaces e receptor portátil. |
| [NDI Bridge Chargexdev](https://ndibridge.chargexdev.com.br/), v0.36.3 | Entradas SRT/RIST/RTMP/WHIP/DeckLink→NDI/OMT; chroma cria alpha; duas fontes Fill/Key pareadas por PTS e saída NDI com alpha. Anuncia áudio, reconexão/slate, captura de câmera separada e preview web. Sem Key anuncia fallback opaco. | Rota nativa para receber qualquer vídeo com alpha, não somente títulos, e entregar uma fonte ao switcher. |

O NDI Bridge desse site é um produto da Chargexdev, distinto do NDI Bridge oficial da Vizrt.

## Evidência dos ZIPs

- `SRTBONDMAGIC-0.5.0-win64.zip`: 1.342 entradas; EXE, FFmpeg, Qt6, DLL NDI, guardian e PowerShell de instalação. O script registra tarefa no logon e reinício do guardian; foi apenas lido.
- `ndi-bridge-0.36.3-Windows.zip`: 194 entradas; EXE, FFmpeg, Qt6, DLL NDI, libOMT e libVMX.
- Não identificamos README, licença, fontes do produto nem arquivo de nome `srtla` nos ZIPs. Isso não prova ausência de implementação embutida ou download externo, mas não confirma bonding Windows.
- O site NDI Bridge afirma depender de runtime externo e não o incluir por licença; o ZIP contém `Processing.NDI.Lib.x64.dll`, 29.863.120 bytes. Essa inconsistência requer esclarecimento; presença de DLL não é prova de conformidade/licença.

Hashes dos arquivos examinados:

```text
SRTBONDMAGIC-0.5.0-win64.zip
48158d4a19839cc39e5480179c4e7531441e9ceb18acec9eaca59d597843ae54

ndi-bridge-0.36.3-Windows.zip
e4ce5978ae8d2a04fd0b8ec3ec7cfbf51f3158f945ba4a32b070129375ed913d
```

## Rede, infraestrutura e licença

O [guia do appliance](https://srtbondmagic.chargexdev.com.br/appliance.html) pede UDP acessível e informa que srtla não autentica por si, sugerindo VPN ou restrição de origem. "Sem servidor na nuvem" pode significar receptor próprio; por inferência técnica, ainda é preciso alcançar o receptor por uma rota utilizável. CGNAT não desaparece ao instalar um app.

O [upstream BELABOX/srtla](https://github.com/BELABOX/srtla) declara AGPL-3.0, suporte oficial Linux, duas pontas compatíveis, múltiplas redes e roteamento por origem. Informa srtla2 incompatível com a versão anterior e seu `srtla_rec` público sem suporte/inadequado para produção. Integrar esse componente exigiria escolher e manter uma versão e cumprir a licença; não é substituição automática do protocolo 3Mix.

A [documentação NDI de quadros](https://docs.ndi.video/all/developing-with-ndi/sdk/frame-types) suporta alpha em RGBA/BGRA, UYVA e PA16, além de áudio. Isso sustenta a viabilidade de decodificar o packed SRT, recompor RGBA e transmitir NDI com alpha. A [licença NDI](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing) condiciona distribuição à EULA e recomenda DLLs app-local; não sustenta uma proibição universal de redistribuição. Devemos usar a dependência oficial/licenciada própria, não extrair a DLL dos ZIPs dos amigos.

## Base atual e próximos incrementos

Atualização após teste no operador: a rota web foi abortada por lentidão/travamentos e atraso com vídeo real no vMix, mesmo localmente. Encerramos o envio/receptor. A prioridade abaixo de fechar o receptor web fica cancelada; a alternativa a avaliar passa a ser um receptor nativo SRT→NDI com alpha/áudio, comparado ao NDI Bridge do Everton. Nenhum EXE desses ZIPs foi testado até aqui.

3Mix já possui protocolo multipath próprio `FMXB`, AES-GCM, agregação ponderada, XOR FEC/NACK, medição explícita e receptor privado exportável, conforme `CONTINUAR.md` e `obs-vmix/ferramentas/bonding-producao.mjs`. **Não é srtla**, sem interoperabilidade direta documentada. Testes com duas operadoras/WAN continuam pendentes.

O protótipo `alpha-web-receptor.mjs` recebe pixels de qualquer fonte packed-alpha, mantém H.264 no remux e recompõe em WebGL; não redesenha GC HTML. Movimento, alpha e Full HD passaram em navegador Edge, em isolamento. Sem áudio nessa versão; vMix real/WAN ainda precisam validação.

Três incrementos concretos, em ordem:

1. **Receptor web cancelado:** o teste real reprovou a rota; não ampliar esse protótipo nem afirmar que os testes Edge o homologaram.
2. **Receptor nativo 3Mix SRT→NDI/OMT:** começar com packed, recompor RGBA e enviar áudio do Fill. Depois oferecer duas fontes pareadas por tempo e chroma no receptor. Uma fonte no switcher; pareamento software não cria genlock físico.
3. **Operação WAN do bonding próprio:** assistente das duas pontas, diagnóstico de porta/rota/interface e métricas por caminho; prova com duas operadoras e receptor remoto. Aproveita AES/FEC/NACK existentes, sem alegar compatibilidade srtla ou publicar infraestrutura automaticamente.

Rota do protótipo web sem VPN no vMix: servidor público recebe SRT de um Caller atrás de NAT; receptor recompõe em uma URL HTTPS/WSS. Um servidor com UDP acessível é uma dependência real. Nenhuma implantação pública aconteceu nesta análise.
