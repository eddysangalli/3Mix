# Multi-M/E — o que a tarefa pediu × o que foi entregue

**Data:** 31/10/2026
**Fonte da tarefa:** texto enviado ao Claude (sistema multi-M/E, Etapas A–E, 12 critérios de conclusão).
**Fonte de evidência:** `qa-beta/recibos/multi-me-core-extracao.md`, código em `3mix-panel/ferramentas/` e `3mix-panel/painel/remoto/`, runtime em `3mix-runtime/`.
**Relação:** complementa o [`LEVANTAMENTO-GERAL-20261031.md`](LEVANTAMENTO-GERAL-20261031.md), seção 4.1.

---

## 0. Veredito

**O M/E não está pronto para o operador.** O que existe é uma base técnica real e promissora:

- o núcleo nativo `IndependentMix` foi extraído para `FreeMixMixEffectManager.hpp`, compilado e testado funcionalmente num build isolado (Preview/Program/Cut/Fade e independência Mix 2/3);
- o adaptador JS, o HTTP, o Patch Registry, o áudio por M/E e a Switcher Strip existem na fonte, com 32 testes de protocolo/simulação passando;
- o Patch Registry e o áudio por M/E tiveram PASS real contra o motor do operador em cenas/metadados de QA.

Mas **nada disso está no runtime**: o binário em produção não tem o `MixEffectManager` integrado, os 5 módulos JS não estão em `3mix-runtime/ferramentas/`, as rotas não funcionam de ponta a ponta e a Strip está oculta (o host só a exibe se `/api/mix-effects` responder). O operador não consegue usar M/E 2–4 hoje.

**Estimativa de conclusão:** 3 a 6 semanas de trabalho focado, dependendo de autorização para rebuild/cópia do motor, hardware para performance e decisão sobre nesting/feedback.

---

## 1. O que a tarefa pedia (resumo)

- **M/E 1 MAIN** sempre presente, compatível com o Program/Preview atual.
- **M/E 2–4 independentes**, com Preview/Program, transições, composição, enquadramento e áudio próprios.
- **M/E Output como fonte** de outro M/E, ao vivo (nesting), sem imagem congelada.
- **Patch Source → Input Slot**, com Inputs operacionais estáveis e acervo grande.
- **Compositions/GFX** como sinais reutilizáveis, publicáveis como Input.
- **Signal Registry** com sinais internos e M/E Outputs.
- **AUX** roteando sinal existente sem criar composição.
- **Audio Bus por M/E**, com herança por destino e sem duplicar áudio no nesting.
- **Switcher Strips** com Delegate e Bank independentes, várias na mesa, integradas aos docks atuais.
- **Performance**: compartilhar Sources, processar sob demanda, medir 1/2/4 M/Es, GPU/CPU/VRAM.
- **Persistência** de projeto, patch, M/Es, Banks, Delegates e roteamento.
- **12 critérios de conclusão** no motor real, não em mockup.

---

## 2. O que foi entregue (com evidência)

| Componente | Estado | Evidência |
|---|---|---|
| `FreeMixMixEffectManager.hpp` | Núcleo extraído do `IndependentMix` real; compila | `3mix-engine/frontend/widgets/FreeMixMixEffectManager.hpp`; build isolado em `qa-beta/multi-me-build-verified` |
| `FreeMixMultistream.cpp` | Mantém contrato vendor `get_mixes`/`control_mix`; delega ao serviço | build real; PASS funcional isolado |
| Núcleo funcional | Mix 2/3/4 com Preview/Program/Cut/Fade e independência | PASS em binário isolado (Mix 2 640×360, Mix 3 480×270, Mix 4 intacto) |
| `mix-effects-producao.mjs` | Adaptador com `operationId`, `expectedScope`, confirmação por `mixId`, `uncertain`/reconcile | 10/10 testes de protocolo |
| `mix-effects-http.mjs` | `GET /api/mix-effects`, `POST /api/mix-effects/check` | 11/11 testes HTTP com socket real |
| `patch-registry-producao.mjs` | Patch Source→Input para Input de 1 item; 2 bugs reais corrigidos | 6/6 simulados + PASS real em 2 cenas QA |
| `mix-audio-producao.mjs` | Bus padrão por M/E e herança em `outputs_configure` | 7/7 + 6/6 + persistência real |
| `registro-sinais-producao.mjs` | Catálogo de 29 sinais (24 Inputs + MAIN + M/E 2–4) | consulta real; `routable:false` |
| `switcher-strip*.mjs` | Web Component, Delegate/Bank, CUT/AUTO, persistência por projeto | 2/2 modelo + browser fixture/stub em 1280/1440/1600 |
| Strip na mesa | Host + dialog com 2 strips; bridge MAIN + `outputs_mix` | testado com stub estrutural, não motor nativo |
| Suíte do dia | 32/32 testes persistentes | `qa-beta/test-*.mjs` |

**O que isso prova:** o desenho é viável e o núcleo funciona isolado. **O que não prova:** operação no runtime, vídeo/áudio reais, nesting, AUX, performance.

---

## 3. Matriz requisito → status

| Requisito da tarefa | Status | O que falta |
|---|---|---|
| M/E 1 MAIN preservado | **Feito** | — |
| M/E 2–4 independentes | **Parcial** | Núcleo isolado; binário/runtime não integrados |
| Preview/Program por M/E | **Parcial** | Core PASS isolado; runtime não |
| Cut/Fade/Move/Stinger | **Parcial** | Cut/Fade PASS isolado; Move/Stinger não exercitados; runtime não |
| Composição/enquadramento por M/E | **Parcial** | Core suporta; vídeo não inspecionado visualmente |
| M/E Output como Input (nesting ao vivo) | **Não** | Source privada sem UUID público; exige C++ |
| Patch Source→Input | **Parcial** | Só Input de 1 item; Compositions/M/E Output não; sem UI |
| Input Slot estável | **Parcial** | Patch por cena; identidade operacional ainda não formalizada |
| Compositions/GFX como sinal | **Não** | Não publicadas no Registry/Patch |
| Signal Registry | **Parcial** | Catálogo existe; `routable:false`; sem publicação |
| AUX roteando sinal | **Não** | `AuxOutputRouter` é metadado; não roteia físico |
| Audio Bus por M/E | **Parcial** | Metadado e herança em `outputs_configure`; AUX/NDI não herdam; sem UI |
| Switcher Strips com Delegate | **Parcial** | Componente/host prontos; testado com stub, não motor real |
| Banks independentes | **Parcial** | Modelo e persistência; UI em dialog, não primeira classe |
| Várias Strips na mesa | **Parcial** | Duas no dialog; não no layout principal |
| T-Bar na Strip | **Não** | Strip tem CUT/AUTO; T-Bar não implementado |
| Performance 1/2/4 M/Es | **Não** | Sem medição, sem leases/processamento sob demanda |
| Compartilhar Sources | **Não provado** | Sem medição de decodificação/render compartilhado |
| Persistência de projeto | **Parcial** | Patch/áudio/localStorage separados; sem bundle de projeto |
| Sem regressão em DSK/Replay/áudio/saídas | **Parcial** | Stub/browser; motor real não |
| UI 1280/1440/1600 | **Parcial** | PASS com stub; motor real não |
| Central única de Saídas | **Não** | 4 superfícies desconectadas |

---

## 4. Os 12 critérios de conclusão da tarefa

| # | Critério | Status |
|---|---|---|
| 1 | M/E 1–4 com Preview/Program e cortes independentes | **Parcial** — core isolado PASS; runtime não |
| 2 | Cut/Fade/Move/Stinger sem afetar outros M/Es | **Parcial** — Cut/Fade isolados; Move/Stinger não |
| 3 | M/E 2 Output dentro do M/E 1, vídeo ao vivo | **Não** — bloqueio C++ |
| 4 | Patch de PTZ, DDR/Replay, Composition e M/E Output | **Parcial** — só Input comum de 1 item |
| 5 | Duas Strips em M/Es diferentes | **Parcial** — stub; motor real não |
| 6 | Troca de Delegate e sincronização | **Parcial** — stub |
| 7 | Audio Buses independentes sem vazamento/loop | **Parcial** — metadado; saída real não |
| 8 | AUX encaminhando sinal | **Não** — só metadado |
| 9 | Persistência completa de projeto/patch/M/E/Banks/Delegates | **Parcial** — arquivos separados |
| 10 | Sem regressão em DSK/Replay/áudio/gravações/saídas | **Parcial** — stub |
| 11 | 1280×800, 1440×900, 1600×1000 | **Parcial** — stub PASS |
| 12 | Performance 1/2/4 M/Es com nesting/saídas | **Não** |

**Nenhum dos 12 está concluído no motor real.** Cinco têm base parcial; três estão bloqueados por arquitetura (nesting, AUX, Compositions); os demais dependem de integração/runtime.

---

## 5. Bloqueios reais (não são “falta de tempo”)

1. **Cópia para o runtime exige autorização do dono.** O rebuild nativo e os 5 módulos JS não podem ir para `3mix-runtime/` sem backup e confirmação explícita. Isso está correto pelas regras do projeto.
2. **Nesting de M/E Output exige C++.** `mix.transition` é `obs_source_create_private`, sem UUID público. Para usar ao vivo como fonte é preciso tornar a Source pública e expor um UUID estável; não dá para fazer com screenshot/imagem congelada.
3. **AUX físico não existe.** `AuxOutputRouter` hoje é metadado/planejamento; rotear de verdade exige integrar com o Output Engine.
4. **Strip no motor real não foi provada.** O teste foi com stub estrutural; MAIN/`outputs_mix` com ACK real, tally e troca física de cena não foram exercitados.
5. **Performance não foi medida.** Não há leases/processamento sob demanda, compartilhamento de render ou números de 1/2/4 M/Es.
6. **Feedback/ciclos exigem decisão do dono.** A tarefa pede semântica explícita; não pode ser decidido sozinho.
7. **Pacote/instalador não inclui M/E.** Mesmo que o runtime fosse atualizado, o instalador de 10/10 não teria nada disso.

---

## 6. O que falta para concluir (pacotes de trabalho)

### A. Integração nativa e runtime (1–2 semanas)
- Build de produção com `FreeMixMixEffectManager` (não só QA isolado).
- Copiar o binário + 5 módulos JS para o runtime **com autorização e backup**.
- Ligar `Production` (`mixEffects`, `patchRegistry`, `signalRegistry`, `mixAudio`) e as rotas.
- Corrigir a inconsistência atual: o `servidor-api` do runtime tem `/api/patch`, `/api/signals`, `/api/mix-audio` e `handleMixEffects` opcional, mas o `controle-producao` do runtime não tem esses campos; se chamadas, dão 500.
- Rodar a suíte 32/32 no runtime.

### B. Strips no motor real (3–5 dias)
- MAIN e M/E 2–4 com ACK real, `outputs_mix`, tally e reconciliação.
- Duas Strips em M/Es diferentes e duas no mesmo M/E.
- T-Bar (se suportado), Banks, Delegate, persistência no workspace.
- Integrar como superfície de primeira classe na mesa, não só dialog.

### C. Nesting M/E Output → Input (1–2 semanas)
- C++: tornar a saída composta pública, com UUID estável e referência viva.
- Publicar no Signal Registry; permitir Patch para Input.
- Testar M/E 2 → M/E 1 ao vivo, sem frame congelado.

### D. AUX, Compositions e Patch completo (1 semana)
- AUX roteando sinal físico (não só metadado).
- Compositions/GFX publicadas como sinal/Input.
- Patch para Inputs com múltiplos itens/GC/overlay.
- UI de Patch e “Expor como Input”.

### E. Áudio, tally e automação (3–5 dias)
- Herança de bus em AUX/NDI/OMT, não só `outputs_configure`.
- Tally, atalhos e macros para M/E 2–4.
- Sem duplicar áudio no nesting.

### F. Performance e recursos (1 semana)
- Leases/processamento sob demanda.
- Compartilhamento de Sources/render.
- Medir 1/2/4 M/Es com nesting e múltiplas saídas (CPU/GPU/VRAM/FPS/drops).

### G. Central de Saídas e persistência (3–5 dias)
- Unificar as 4 superfícies de saída.
- Persistência de projeto incluindo patch/M/E/Banks/Delegates/áudio.

**Total:** 3 a 6 semanas, com hardware para a etapa F e autorização para A/C.

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Rebuild nativo no runtime quebrar a instalação do operador | Alto | Backup, autorização, teste em cópia QA primeiro |
| Nesting C++ mexer na Source privada e afetar estabilidade | Alto | Patch mínimo, teste isolado, rollback |
| AUX físico exigir mudança no Output Engine | Médio/Alto | Implementar por etapas, manter metadado atual |
| Performance sem hardware dedicado | Alto | Medir no equipamento do operador, não estimar |
| Feedback/ciclos sem semântica | Alto | Decisão do dono antes de implementar |
| Duas árvores C++ (`freemix-app` × `FreeMix/src`) | Médio | Trabalhar só em `freemix-app`; não tocar `FreeMix/src` |
| Instalador não incluir M/E | Alto | Selar pacote só depois da integração |

---

## 8. Decisões do dono

1. Autorizar rebuild/cópia do motor para o runtime (com backup).
2. M/E entra na Beta 1 ou fica para a 1.0? (Recomendação: **fora da Beta 1**; a beta sai com M/E 1 MAIN e o M/E 2–4 fica como próxima versão.)
3. Se entrar: aceitar o esforço de 3–6 semanas e o risco de nesting/AUX.
4. Definir semântica de feedback/ciclos.
5. Definir se a Central de Saídas entra junto.

---

## 9. Evidências

- `qa-beta/recibos/multi-me-core-extracao.md` — recibo completo.
- `3mix-engine/frontend/widgets/FreeMixMixEffectManager.hpp` — núcleo.
- `3mix-panel/ferramentas/mix-effects-producao.mjs`, `mix-effects-http.mjs`, `patch-registry-producao.mjs`, `mix-audio-producao.mjs`, `registro-sinais-producao.mjs`.
- `3mix-panel/painel/remoto/switcher-strip*.mjs`.
- `qa-beta/test-mix-effects-protocol.mjs`, `test-mix-effects-http.mjs`, `test-patch-registry-protocol.mjs`, `test-mix-audio-protocol.mjs`, `test-mix-audio-inheritance.mjs`, `test-switcher-strip-model.mjs`.
- `qa-beta/multi-me-build-verified/` — build isolado.
- `3mix-runtime/` — ausência dos módulos/rotas (verificado).
