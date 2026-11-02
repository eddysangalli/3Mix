# 3Mix — Levantamento geral e pendências

**Data:** 31/10/2026
**Escopo:** visão geral do sistema inteiro (motor, mesa, PTZ, áudio, replay, saídas, calls, automação, instalador, licenças, documentação e QA).
**Relação com o levantamento anterior:** atualiza o [`LEVANTAMENTO-BETA-20261030.md`](LEVANTAMENTO-BETA-20261030.md), que continua válido como diagnóstico de base. Este documento incorpora o que foi entregue em 31/10 e corrige pontos que ficaram desatualizados (EULA, PTZ, docks, atualização aplicada).

---

## 0. Resumo executivo

O 3Mix **não está mais na fase de “faltam funcionalidades”**. Ele já tem motor C/C++, mesa operacional, Preview/Programa nativos, PTZ, áudio, replay, GC, saídas, automação, API, atualizador e uma quantidade grande de QA. O que separa o produto de uma beta instalável é:

1. **A interface completa do mockup ainda não está no runtime.** A `painel/estudio/` (13 arquivos) continua só na fonte/servidor de desenvolvimento. O operador usa a `mesa.html` antiga, que recebeu remendo visual (docks, PTZ, cores), mas não é o layout do mockup.
2. **O instalador está congelado em 10/10 (Native24).** O runtime já está em Native38 (11/10), mas não existe pacote completo novo selado com o código atual.
3. **Nada foi provado em Windows limpo.** Não há recibo de VM limpa, hardware físico, WAN ou sessão longa.
4. **A entrega não está fechada:** identidade FreeMix/3Mix, primeiro uso, canal de suporte, Authenticode/HTTPS e oferta de fonte ainda têm pontas.
5. **O que existe de funcional é amplo, mas com limites declarados:** Calls WAN, NDI/SDI/ASIO/HDR, bonding, MIDI físico, `.fmx` ida-e-volta, propriedades/filtros nativos, Replay TS e Multi-M/E ainda não estão prontos para prometer.

**Estimativa para a beta instalável:** 4 a 7 semanas de trabalho focado, sendo 2 a 3 semanas de empacotamento/QA e 2 a 4 semanas de integração da UI/primeiro uso/desempenho. Itens de hardware/WAN correm em paralelo e dependem de equipamento/rede externos.

---

## 1. O que mudou desde 30/10

| Área | Entrega de 31/10 |
|---|---|
| Docks da mesa | Abas independentes, configuração por dock, ordem/ocultar, persistência, layout responsivo pelo **tamanho do dock** |
| PTZ dock | Layout compacto com pad/STOP, velocidade, zoom, foco, posição, presets, ícones e cores do sistema |
| PTZ janela | 3 colunas (operação / preview / configuração), preview 16:9, formulário preenchido, badges reais |
| PTZ backend | Vínculo Input↔PTZ, DPAPI, leases, VISCA TCP/UDP, ONVIF PTZ, **ONVIF Imaging**, **DeviceInfo**, preview 640×360 |
| Instalador | Wizard C# de 6 passos e módulos em standby implementado; **pacote completo ainda não selado** |
| Identidade | Rename amplo para 3Mix em telas/docs; binário `FreeMix.exe` mantido de propósito |
| Licenças | `EULA.txt` e `THIRD-PARTY-NOTICES.txt` criados; oferta de fonte ainda sem canal definido |
| Manuais | `LEIA-ME-BETA`, `GUIA-RAPIDO`, `LIMITES-CONHECIDOS`, `SOLICITAR-SUPORTE` |
| Multi-M/E | Núcleo extraído e testado em QA isolado; **não está no runtime** |

---

## 2. Status por área

| Área | Estado atual | O que falta para beta | Prioridade |
|---|---|---|---|
| **Motor C/C++ (libobs)** | Native38 rodando; Preview/Programa nativos, transições, DSK, áudio, replay, ISO, saídas | Recompilar/selar pacote com as fontes atuais; validar em Windows limpo | P0 |
| **Mesa/UI** | `mesa.html` antiga com reskin, docks e PTZ; `estudio/` nova só na fonte | Integrar a UI do mockup (ou decidir que a mesa atual é a beta) | P0 |
| **PTZ** | Dock/janela responsivos, ONVIF Imaging/DeviceInfo, preview 640×360, vínculo | Câmera física, VISCA de imagem, preset com thumbnail/nome, descoberta ONVIF real | P1 |
| **Áudio** | Mixer, buses, routing, medidores, ASIO/WASAPI inventário | ASIO físico, escuta real, N-1/talkback com convidados | P1 |
| **Replay** | Capturas A/B, segmentos, endurance; caso TS de 12/10 em aberto | Fechar o caso de seek TS; ensaio longo | P1 |
| **Saídas** | RTMP/SRT/NDI/OMT, multi-RTMP, watchdog, reconexão | Hardware/receptor real; NDI Advanced; central única de saídas | P1 |
| **Calls** | Backend, N-1 local, talkback, publisher | WAN real, TURN/VPS, vídeo contínuo por fonte (hoje JPEG ≤5 fps) | P1 |
| **Dados/GC** | CSV/JSON/XLSX, HTTP/arquivo, vínculos, biblioteca GC | Feed externo real, licenças de templates, cobertura | P1 |
| **Automação** | Macros, triggers, atalhos, OSC/MIDI backend | Controlador físico, ensaio real | P1 |
| **Multi-M/E** | Núcleo nativo extraído e testado isolado; adapter/HTTP/Patch/Áudio na fonte; **nada disso está no runtime**; a Strip foi copiada para a mesa do runtime sem o backend e agora fica oculta até o M/E existir | Integrar o pacote completo no binário/runtime, nesting, AUX físico, tally/atalhos, performance | P1 (frente inteira) |
| **Instalador** | Setup C# + wizard + desinstalador; pacote selecionado Native24 | Selar pacote completo novo, instalar/desinstalar, clean Windows | P0 |
| **Atualização** | Incremental aplicada (11/10), backup/rollback | Canal HTTPS, assinatura pública, release notes | P0/P1 |
| **Identidade** | 3Mix nas telas; `FreeMix.exe` e nomes internos | Decidir binário final; alinhar instalador/docs | P0 |
| **Licenças** | EULA e notices; GPL-2.0-or-later | Canal de oferta de fonte; revisão jurídica; NDI | P0 |
| **Primeiro uso** | Manuais em docs | Boas-vindas, projeto demo, checklist, erros acionáveis | P0 |
| **Suporte** | ZIP de diagnóstico | Canal real, formulário, SLA/expectativa | P0 |
| **QA** | Muitos recibos de software | Windows limpo, hardware, WAN, 8 h, performance | P0 |

---

## 3. P0 — o que impede uma beta instalável

### P0-1. A interface completa do mockup não está no runtime

**Situação.** A `3mix-panel/painel/estudio/` tem 13 arquivos (HTML/CSS/ES modules) com Mesa, Áudio, Replay e Configurações no visual do mockup. Ela **não existe** em `3mix-runtime/painel/estudio/`. O operador vê a `mesa.html` antiga, que ganhou docks, PTZ e cores, mas mantém a grade de 12 cards e a estrutura antiga.

**Por que bloqueia.** É a entrega visual principal pedida. Sem isso, o produto é “OBS com um dock novo”, não o 3Mix do mockup.

**O que fazer.**
- Decidir: integrar a `estudio/` como dock (com `estudio-dock.html` + modo `?dock=1`) ou assumir a mesa atual como UI da beta.
- Se integrar: resolver ES modules em `file://` (ponte + HTTP local), mapear todos os comandos reais, miniaturas reais, performance.
- Copiar para o runtime com backup e testar no FreeMix.

**Esforço:** 5 a 8 dias.
**Aceite:** abrir pelo `INICIAR-3MIX.cmd` e ver a mesa do mockup, com 12 controles críticos operando o motor.

### P0-2. Instalador e pacote completo estão atrasados

**Situação.** O instalador selecionado é `0.1.0-local.20261010060000` (Native24, 1.375.666.176 bytes). O runtime está em `0.1.0-local.20261011145116` (Native38). O wizard C# novo foi implementado, mas **não há Setup novo** em `entregas/` e o pacote completo não foi selado.

**O que fazer.**
- Congelar fontes atuais (Native38 + painel + PTZ + docks).
- Passar o contrato de payload, gerar ZIP verificado e Setup novo.
- Emitir recibos de inventário, hash, instalação e desinstalação.
- Atualizar `ENTREGA-ATUAL.md` (hoje ele ainda diz que a atualização de 11/10 não foi aplicada — está errado; `APLICACAO-ULTIMA.json` prova que foi).

**Esforço:** 3 a 5 dias.
**Aceite:** Setup novo instala em pasta vazia e “Sobre” mostra a versão nova.

### P0-3. Nenhuma prova em Windows limpo

**Situação.** O README do instalador registra que VM limpa, Authenticode e hardware não foram homologados. Não há recibo de VM limpa em `qa-finalizacao/`.

**O que fazer.** VM Windows 11 limpa, sem Node/VS/ffmpeg; instalar, abrir, criar projeto, 2 fontes, cortar, gravar, transmitir para receptor local, fechar, desinstalar, reinstalar. Corrigir e repetir.

**Esforço:** 3 a 5 dias.
**Aceite:** os 12 cenários do levantamento de 30/10 passam na VM.

### P0-4. Identidade FreeMix × 3Mix

**Situação.** Interface diz 3Mix; binário é `FreeMix.exe`; instalador e alguns docs ainda usam FreeMix. O rename foi amplo, mas não total.

**O que fazer.** Manter `FreeMix.exe` nesta beta (decisão de menor risco), mas alinhar instalador, atalhos, “Sobre”, README, EULA e site para 3Mix. Registrar a dívida do binário para a 1.0.

**Esforço:** 2 a 4 dias.
**Aceite:** nada visível ao usuário diz FreeMix.

### P0-5. Primeiro uso não está no produto

**Situação.** Existem manuais, mas não há tela de boas-vindas, verificação de motor/API/portas, projeto demo ou checklist dentro do app.

**O que fazer.** Tela de primeira execução, projeto demo “Futsal”, mensagens acionáveis (porta ocupada, motor offline, permissão, disco) e checklist de primeira transmissão.

**Esforço:** 2 a 3 dias.
**Aceite:** usuário novo instala, abre e faz um CUT em menos de 10 min.

### P0-6. Desempenho da mesa não foi medido

**Situação.** `mesa.html` tem 352 KB e histórico de re-render; a UI nova é mais leve, mas não há medição no CEF do programa. A meta do levantamento (p95 de Cut ≤ 120 ms, CPU ociosa ≤ 3%, memória ≤ 300 MB) não foi provada.

**O que fazer.** Instrumentar clique→estado, medir 20 cortes, 20 previews, 10 min de medidores; otimizar o que passar da meta.

**Esforço:** 2 a 3 dias.
**Aceite:** tabela antes/depois com as metas.

### P0-7. Canal de suporte ainda é placeholder

**Situação.** `SOLICITAR-SUPORTE.md` e o EULA dizem que não há canal formal. O ZIP de diagnóstico funciona.

**O que fazer.** Definir e-mail/WhatsApp/pasta, formulário de relato e expectativa de resposta; incluir no guia e no “Sobre”.

**Esforço:** 1 a 2 dias (decisão do dono).
**Aceite:** testador gera o ZIP e sabe para onde enviar sem perguntar.

### P0-8. Authenticode e canal HTTPS

**Situação.** Sem Authenticode; SmartScreen avisa. Sem domínio/certificado para update HTTPS.

**O que fazer.** Decidir beta fechada (conviver com aviso + SHA-256) ou aberta (certificado EV/OV + HTTPS). Se fechada, documentar o aviso e publicar hash.

**Esforço:** 1 dia + prazo externo do certificado.
**Aceite:** instalador assinado ou instrução de SmartScreen testada.

### P0-9. Oferta de fonte e licenciamento

**Situação.** EULA e notices existem, mas a seção “Oferta de código-fonte” tem **“[CANAL A DEFINIR]”**. O motor é GPL-2.0-or-later; plugins têm licenças próprias; NDI tem contrato.

**O que fazer.** Definir o canal de distribuição do fonte (link/repositório/pacote), revisar o EULA e confirmar NDI. Não publicar beta sem isso.

**Esforço:** 1 a 2 dias + revisão jurídica.
**Aceite:** instalação contém EULA, notices e oferta de fonte acessível.

---

## 4. P1 — lacunas funcionais (não impedem a beta, impedem prometer “completo”)

| Frente | O que falta | Impacto |
|---|---|---|
| Calls WAN | Prova com convidados reais, TURN/VPS, duas redes; vídeo contínuo por fonte (hoje JPEG 640×360 até 5 fps) | Não prometer externa remota |
| NDI/OMT/SRT físico | Receptor/hardware real; NDI Advanced exige SDK/licença | Vender só o testado |
| SDI/ASIO/HDR/PTZ físico | Equipamento, driver, receptor; HDR só leitura | Não prometer |
| Bonding | Prova em duas redes reais | Fora da beta |
| Replay | Caso de seek TS de 12/10 em aberto; endurance | Replay pode falhar em caso específico |
| `.fmx` ida-e-volta | Ciclo completo entre versões/instalações | Migração pode falhar |
| Propriedades/Filtros | Ainda abre diálogo nativo do OBS | Visual inconsistente |
| MIDI/OSC físico | Backend existe; falta controlador real | Não prometer hardware |
| Longa duração | 4 câmeras Full HD por 8 h | Estabilidade não comprovada |
| Multi-M/E | Núcleo nativo, adapter, HTTP, Patch Registry e Áudio por M/E existem na fonte, mas **fora do runtime**; Strip oculta até o backend existir; nesting exige C++; AUX é só metadado | Não prometer M/E 2–4 nesta beta |
| Central de Saídas | 4 superfícies desconectadas; rascunho bloqueado | Operador pode se perder |
| PTZ fino | Preset com thumbnail/nome; VISCA de brilho/contraste/saturação/nitidez | Menos intuitivo em câmeras VISCA |
| `estudio` | UI nova fora do runtime | Mockup incompleto |

### 4.1 Multi-M/E — a frente inteira que ainda não entrou

> Detalhamento requisito a requisito e os 12 critérios da tarefa: [`LEVANTAMENTO-MULTI-ME-20261031.md`](LEVANTAMENTO-MULTI-ME-20261031.md).

O M/E **não é um ajuste de UI**; é um subsistema. O que existe hoje na fonte:

- `FreeMixMixEffectManager.hpp` — núcleo nativo com Mix 2/3/4 independentes, composição, transições e persistência legada; `FreeMixMultistream.cpp` mantém o contrato vendor.
- `mix-effects-producao.mjs` — adaptador central com `operationId`, `expectedScope`, confirmação por `mixId`, `uncertain`/reconcile e limite de recibos.
- `mix-effects-http.mjs` — `GET /api/mix-effects` e `POST /api/mix-effects/check`.
- `patch-registry-producao.mjs` — Patch Source→Input Slot, com PASS real contra o motor do operador em cenas QA.
- `mix-audio-producao.mjs` — bus padrão por M/E e herança em `outputs_configure`, com PASS real de persistência.
- `switcher-strip*.mjs` — Web Component de Strip, Delegate/Bank, CUT/AUTO, persistência por projeto.
- Testes persistentes: 32/32 na suíte do dia; PASS funcional do núcleo em build isolado (Preview/Program/Cut/Fade/independência Mix 2/3).

O que **não** está no runtime:

- O binário nativo com o `MixEffectManager` integrado (o runtime ainda é o Native38 anterior).
- `mix-effects-producao.mjs`, `mix-effects-http.mjs`, `registro-sinais-producao.mjs`, `patch-registry-producao.mjs` e `mix-audio-producao.mjs`.
- Os campos `mixEffects`, `patchRegistry`, `signalRegistry` e `mixAudio` no `Production` do runtime.
- As rotas `/api/mix-effects`, `/api/patch`, `/api/signals` e `/api/mix-audio` funcionando de ponta a ponta.
- A Strip no motor real: ela foi testada com stub estrutural; MAIN/`outputs_mix` com ACK real, tally e troca física de cena não foram provados.
- Nesting “M/E Output como Input”: a saída de cada M/E é uma Source privada (`obs_source_create_private`), sem UUID público; exige trabalho C++ para expor referência viva.
- AUX efetivo: o `AuxOutputRouter` hoje é metadado/planejamento; não roteia saída física.
- Tally, atalhos e macros para M/E 2–4; Banks por página/categoria; performance com 1/2/4 M/Es.

**Inconsistência atual no runtime:** o `servidor-api.mjs` do runtime tem as rotas `/api/patch`, `/api/signals` e `/api/mix-audio` e o `handleMixEffects` opcional, mas o `controle-producao.mjs` do runtime não tem `patchRegistry`/`signalRegistry`/`mixAudio`. Se alguma tela chamar essas rotas, dá 500. A Strip agora só aparece se `/api/mix-effects` responder (guarda no host), então o botão não fica quebrado; as rotas latentes continuam.

**O que falta, em ordem:**
1. Integrar o núcleo nativo no build de produção e gerar um `FreeMix.exe`/pacote com ele.
2. Copiar os 5 módulos JS e ligar `Production` + rotas; rodar a suíte 32/32 no runtime.
3. Provar a Strip no motor real (MAIN e M/E 2–4, ACK, tally).
4. Expor M/E Output como Input (C++), com referência viva.
5. Fazer AUX rotear de verdade.
6. Tally/atalhos/macros/banks e performance 1/2/4 M/Es.
7. Unificar a Central de Saídas (hoje 4 superfícies desconectadas).

**Esforço:** 2 a 4 semanas (integração nativa + UI + nesting/AUX + QA), sem contar hardware.
**Aceite:** M/E 2–4 operando no runtime, com vídeo/áudio reais, Strip no motor, AUX físico e nesting vivo — ou corte explícito de escopo dizendo que a beta não terá M/E.

---

## 5. P2 — polimento pós-beta

- Temas claro/escuro, escala de interface, traduções.
- Multiview social 9:16/safe zones com acabamento.
- Galeria de GC/títulos e biblioteca de mídia.
- Telemetria opt-in (hoje não existe; EULA diz sem telemetria).
- Landing page, vídeo, material comercial.
- Crash reporting automático (hoje só ZIP manual).
- Manual completo ilustrado.

---

## 6. O que já está pronto (não recolocar como pendência)

- Motor Native38 rodando; Preview/Programa nativos; transições; DSK; áudio; replay; ISO; saídas.
- Mesa com docks configuráveis, PTZ dock/janela, cores do sistema.
- PTZ: VISCA TCP/UDP, ONVIF PTZ, ONVIF Imaging, DeviceInfo, DPAPI, leases, vínculo Input, preview 640×360.
- EULA, notices, 4 manuais, rename amplo, wizard de instalador, módulos em standby.
- Atualização incremental aplicada com backup/rollback.
- Muitos recibos de QA de software (não substituem clean Windows/hardware).

---

## 7. Sequência recomendada

| Onda | Conteúdo | Duração | Gate |
|---|---|---|---|
| 1 | Selar pacote completo com o runtime atual (Native38 + painel + PTZ) | 3–5 dias | Setup novo instala em pasta vazia |
| 2 | Windows limpo + correções | 3–5 dias | 12 cenários PASS |
| 3 | Decidir/integrar a UI `estudio` (mockup completo) | 5–8 dias | Mesa do mockup no FreeMix |
| 4 | Performance medida | 2–3 dias | p95 Cut ≤ 120 ms |
| 5 | Primeiro uso + suporte + EULA/fonte | 3–4 dias | Usuário novo se vira sozinho |
| 6 | Assinatura/HTTPS + selagem final | 2–3 dias + externo | Beta entregável |

**Total:** 18 a 28 dias de trabalho focado (4 a 6 semanas em calendário realista), sem contar hardware/WAN.

---

## 8. Decisões que só o dono pode tomar

1. A UI da beta é a `mesa.html` atual (reskin) ou a `estudio/` do mockup? (Recomendação: `estudio`, mas é a obra maior.)
2. Beta fechada (SmartScreen + SHA-256) ou aberta (Authenticode)?
3. Manter `FreeMix.exe` como binário interno nesta beta? (Recomendação: sim.)
4. Canal de suporte real (e-mail/WhatsApp/pasta).
5. Canal de oferta do código-fonte GPL.
6. Preço/licença da beta.

---

## 9. Evidências principais

- `3mix-panel/docs/LEVANTAMENTO-BETA-20261030.md` — diagnóstico de base.
- `3mix-panel/docs/PENDENCIAS-REAIS.md` — histórico técnico e tabela de prioridades.
- `3mix-panel/docs/ROADMAP.md` — lista do produto completo.
- `3mix-panel/docs/LEIA-ME-BETA.md`, `LIMITES-CONHECIDOS.md`, `EULA.txt`, `THIRD-PARTY-NOTICES.txt`.
- `3mix-panel/scripts/installer-windows/README.md` — limites do instalador.
- `entregas/INSTALADOR-ATUAL.json`, `entregas/APLICACAO-ULTIMA.json`, `3mix-runtime/version.json`.
- `qa-beta/STATUS-BETA.md` e `qa-beta/recibos/` — execução de 31/10.
- `qa-beta/capturas/ptz-runtime-onvif.png`, `ptz-runtime-3col.png`, `mesa-ptz-real.png`.

---

## 10. O que este levantamento não afirma

- Não afirma que os 12 cenários de beta passam hoje.
- Não afirma que o instalador de 10/10 representa o código atual.
- Não afirma que a UI `estudio` está funcional no motor real.
- Não afirma que o PTZ foi testado com câmera física.
- Não substitui os recibos existentes; cada um vale pelo escopo declarado.
