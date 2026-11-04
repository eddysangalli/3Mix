# PLANO DE MIGRAÇÃO OBS 33.0.1 + CEF 150/156 — 3MIX PRO

**Data:** 04/11/2026  
**Status:** PLANEJAMENTO (nenhuma fase executada; build isolado, não afeta runtime de produção)  
**Responsável:** Engenharia 3Mix

---

## 1. OBJETIVO

Migrar o motor nativo do 3Mix Pro do **OBS 32.2.2 (Fork Atual)** para **OBS 33.0.1** com **CEF 150+ (Chromium 150)**, preservando todos os patches 3Mix (Multi-M/E, DSK 1-4, FreeD, áudio ASIO, Pre-Flight Check, Incident Blackbox, Broadcast Delay, SRT 1.5.7, etc.) e garantindo rollback imediato.

**IMPORTANTE:** Este documento é um PLANO. Nenhuma das fases abaixo foi executada. Scripts mencionados (ativar-obs33.cmd, reverter-obs32.cmd, apply-patches.ps1, build-obs33.ps1) NÃO EXISTEM AINDA. Rollback NÃO está homologado.

---

## 2. ESTRATÉGIA: BUILD ISOLADO + HOMOLOGAÇÃO PARALELA

### 2.1 Princípios
- **Zero impacto no runtime de produção**: O `3mix-runtime/bin/64bit/3Mix.exe` atual (OBS 32.2.2) permanece intocado.
- **Branch dedicado**: `feat/obs33-cef150-migration` no `3mix-engine` (A CRIAR).
- **Artefatos separados**: Build gera `3Mix-obs33.exe` e DLLs CEF 150 em `3mix-engine/build-obs33/`, não no runtime.
- **Testes automatizados**: Suíte completa antes de qualquer promoção.

### 2.2 Fases (TODAS PLANEJADAS — NENHUMA EXECUTADA)

| Fase | Status | Descritivo | Critério de Saída |
|------|--------|------------|-------------------|
| **F1** | PLANEJADA | Preparação do ambiente de build (VS 2022 17.11+, CMake 3.30+, Python 3.12, vcpkg) | Build limpo do OBS 33 upstream |
| **F2** | PLANEJADA | Aplicação dos patches 3Mix (40+ patches catalogados em `MIGRACAO-OBS-33.md`) | Patch `apply-patches.ps1` roda sem conflitos (SCRIPT A CRIAR) |
| **F3** | PLANEJADA | Build `3Mix-obs33.exe` + DLLs CEF 150 (chromium 150.0.0) | Binários gerados em `build-obs33/RelWithDebInfo` |
| **F4** | PLANEJADA | Testes unitários e integração (CI) | 100% pass em `3mix-engine/tests/` |
| **F5** | PLANEJADA | Homologação funcional (Pre-Flight, DSK, SRT, Replay, Slides, GC) | Checklist `OBS33-HOMOLOGACAO.md` 100% verde (DOC A CRIAR) |
| **F6** | PLANEJADA | Teste de estabilidade 2h + stress multi-câmera DeckLink | Zero crashes, zero memory leaks |
| **F7** | PLANEJADA | Promoção controlada: substituição atômica no runtime + rollback testado | `ativar-obs33.cmd` / `reverter-obs32.cmd` EXECUTADOS E VALIDADOS (SCRIPTS A CRIAR) |

---

## 3. PATCHES 3MIX A PRESERVAR (Catálogo Resumido — BASEADO EM `MIGRACAO-OBS-33.md`)

| Área | Patches Principais | Arquivos Afetados | Status |
|------|-------------------|-------------------|--------|
| **Multi-M/E 1-4** | `0001-multi-me-core.patch`, `0002-multi-me-ui.patch` | `libobs/obs-output.c`, `ui/obs-studio/mainwindow/*` | CATALOGADO |
| **DSK 1-4 (TAKE/AUTO)** | `0010-dsk-take-auto.patch`, `0011-dsk-transition-slider.patch` | `plugins/3mix-dsk/*` | CATALOGADO |
| **FreeD / PTZ** | `0020-freed-tracking.patch` | `plugins/3mix-freed/*` | CATALOGADO |
| **Áudio ASIO + Faders** | `0030-audio-asio-faders.patch` | `libobs/obs-audio.c`, `plugins/3mix-audio/*` | CATALOGADO |
| **Pre-Flight Check** | `0040-preflight-check.patch` | `plugins/3mix-preflight/*` | CATALOGADO |
| **Incident Blackbox (60s ring)** | `0045-blackbox-ring.patch` | `plugins/3mix-blackbox/*` | CATALOGADO |
| **Broadcast Delay + DUMP** | `0050-broadcast-delay.patch` | `plugins/3mix-delay/*` | CATALOGADO |
| **SRT 1.5.7 + AES** | `0055-srt-157.patch` | `plugins/obs-ffmpeg/obs-ffmpeg-srt.h` | CATALOGADO |
| **Retornos SRT Clean Feed / N-1** | `0060-srt-returns.patch` | `plugins/3mix-returns/*` | CATALOGADO |
| **SlideEngine Browser Source** | `0070-slide-engine.patch` | `plugins/obs-browser/*` | CATALOGADO |
| **CEF Custom Scheme** | `0080-cef-custom-scheme.patch` | `plugins/obs-browser/cef-browser.cpp` | CATALOGADO |

> Lista completa em `3mix-panel/docs/MIGRACAO-OBS-33.md` (seção 4). **Nenhum patch foi testado contra OBS 33 ainda.**

---

## 4. CEF 150/156 — ESPECIFICAÇÕES TÉCNICAS

| Item | OBS 32.2.2 (Atual) | OBS 33.0.1 (Alvo) |
|------|-------------------|-------------------|
| **CEF Version** | 127.145.7 (Chromium 127) | 150.0.0+ (Chromium 150) / 156.x (Chromium 156) |
| **libcef.dll** | ~213 MB | ~280-320 MB |
| **Widevine CDM** | Não suportado | Suportado (opcional, para DRM) |
| **WebGPU** | Parcial | Habilitado por padrão |
| **WebCodecs** | Não | Sim (encode/decode nativo no Browser Source) |
| **Offscreen Rendering** | Funcional | Melhorado (shared textures) |
| **Breaking Changes** | — | `CefBrowserHost::CreateBrowser` signature, `CefRenderHandler` API |

### 4.1 Impacto no 3Mix (ANÁLISE PRELIMINAR — NÃO VALIDADA)
- **GC (Graphics Composer)**: Requer atualização do esquema de injeção CSS/JS via `CefBrowserHost::ExecuteJavaScript`.
- **Browser Sources (Slides, PTZ, Overlays)**: Testar renderização WebGPU vs Software.
- **Painel Web Remoto**: Validar WebSocket + SSE no CEF 150.
- **Tamanho do runtime**: +~100 MB (libcef.dll maior).

---

## 5. RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação (PLANEJADA) |
|-------|---------------|---------|------------------------|
| Conflito de patches ao aplicar no OBS 33 | Alta | Build falha | Script `apply-patches.ps1` com `git apply --3way` + resolução manual documentada (A CRIAR) |
| Quebra de ABI em plugins nativos (DeckLink, ASIO, SRT) | Média | Plugins não carregam | Recompilar todos os plugins 3Mix contra novo SDK OBS 33 |
| CEF 150 quebra Browser Source (GC, Slides) | Média | Painéis não renderizam | Testes automatizados `test-cef150-browser.mjs` + fallback CEF 127 (A CRIAR) |
| Regressão de performance (CPU/RAM) | Baixa | Latência alta | Benchmark obrigatório na F6 vs baseline OBS 32 |
| Perda de patches não documentados | Baixa | Funcionalidade 3Mix faltando | Auditoria `git log --oneline 32.2.2..33.0.1 -- libobs plugins` |

---

## 6. PLANO DE ROLLBACK (OBRIGATÓRIO — SCRIPTS AINDA NÃO EXISTEM)

### 6.1 Scripts de Ativação/Reversão (A CRIAR)
```
3mix-runtime/
├── bin/64bit/
│   ├── 3Mix.exe                 ← OBS 32.2.2 (produção)
│   ├── 3Mix-obs33.exe           ← OBS 33.0.1 (candidato - APÓS F3)
│   ├── libcef.dll               ← CEF 127 (produção)
│   ├── libcef-150.dll           ← CEF 150 (candidato - APÓS F3)
│   ├── obs-ffmpeg.dll           ← v32
│   └── obs-ffmpeg-obs33.dll     ← v33 (APÓS F3)
├── ativar-obs33.cmd             # A CRIAR: Renomeia .exe/.dll atuais para .bak, promove obs33
├── reverter-obs32.cmd           # A CRIAR: Restaura .bak em < 30s
└── preflight-obs33.cmd          # A CRIAR: Valida integridade antes de ativar
```

### 6.2 Critérios de Rollback Automático (A VALIDAR NA F7)
- Crash do `3Mix-obs33.exe` na inicialização (exit code != 0)
- Pre-Flight Check falha (GPU, DeckLink, Áudio, Rede)
- Memória > 2GB em idle (baseline OBS 32: ~800MB)
- Latência audio-video > 5 frames em teste padrão

**ROLLBACK NÃO ESTÁ HOMOLOGADO** — será validado apenas na F7 com execução real dos scripts.

---

## 7. CRONOGRAMA ESTIMADO (SUJEITO A ALTERAÇÕES)

| Semana | Atividade | Status |
|--------|-----------|--------|
| **S1** | F1-F2: Ambiente + Aplicação patches | PLANEJADA |
| **S2** | F3-F4: Build + CI | PLANEJADA |
| **S3** | F5: Homologação funcional | PLANEJADA |
| **S4** | F6: Estabilidade 2h + Stress | PLANEJADA |
| **S5** | F7: Promoção controlada + Rollback testado | PLANEJADA |

---

## 8. DECISÃO DE GO/NO-GO (F7) — CRITÉRIOS RÍGIDOS

**GO se TODOS (checklist executado na F7):**
- [ ] Build `3Mix-obs33.exe` passa CI 100%
- [ ] Checklist `OBS33-HOMOLOGACAO.md` 100% verde
- [ ] Teste 2h estabilidade: 0 crashes, 0 leaks
- [ ] Rollback `reverter-obs32.cmd` EXECUTADO COM SUCESSO em < 30s
- [ ] Benchmark CPU/RAM ≤ +15% vs OBS 32.2.2
- [ ] CEF 150 renderiza GC + Slides + PTZ sem artefatos

**NO-GO se QUALQUER:**
- [ ] Qualquer crash no teste de 2h
- [ ] Rollback falha ou > 30s
- [ ] Benchmark > +15% CPU/RAM
- [ ] GC/Slides quebrados no CEF 150 sem workaround viável

---

## 9. ARQUIVOS RELACIONADOS (ALGUNS AINDA NÃO EXISTEM)

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `3mix-panel/docs/MIGRACAO-OBS-33.md` | EXISTE | Documento técnico completo (patches, CMake, CEF) |
| `3mix-engine/scripts/apply-patches.ps1` | **NÃO EXISTE** | Script de aplicação de patches (A CRIAR na F2) |
| `3mix-engine/scripts/build-obs33.ps1` | **NÃO EXISTE** | Script de build isolado (A CRIAR na F3) |
| `3mix-panel/docs/OBS33-HOMOLOGACAO.md` | **NÃO EXISTE** | Checklist de homologação (A CRIAR na F5) |
| `3mix-runtime/ativar-obs33.cmd` | **NÃO EXISTE** | Script de promoção (A CRIAR na F7) |
| `3mix-runtime/reverter-obs32.cmd` | **NÃO EXISTE** | Script de rollback (A CRIAR na F7) |
| `3mix-runtime/preflight-obs33.cmd` | **NÃO EXISTE** | Script de validação pré-ativação (A CRIAR na F7) |

---

## 10. PRÓXIMOS PASSOS IMEDIATOS (AÇÕES CONCRETAS)

1. **Criar branch** `feat/obs33-cef150-migration` no `3mix-engine`
2. **Criar script** `apply-patches.ps1` e testar contra tag `obs-33.0.1` do upstream
3. **Documentar conflitos** e resoluções em `PATCH-CONFLICTS-OBS33.md`
4. **Criar script** `build-obs33.ps1` para build isolado `RelWithDebInfo`
5. **Criar teste** `test-cef150-browser.mjs` para validação automatizada de Browser Sources
6. **Criar checklist** `OBS33-HOMOLOGACAO.md` com todos os itens funcionais

---

## 11. RASTREABILIDADE DE STATUS

| Item | Status Atual | Evidência |
|------|--------------|-----------|
| Branch de migração | NÃO CRIADA | — |
| Patches aplicados no OBS 33 | NÃO EXECUTADO | — |
| Build `3Mix-obs33.exe` | NÃO EXECUTADO | — |
| Testes unitários CI | NÃO EXECUTADOS | — |
| Homologação funcional | NÃO EXECUTADA | — |
| Teste estabilidade 2h | NÃO EXECUTADO | — |
| Scripts rollback | NÃO EXISTEM | — |
| Rollback homologado | **NÃO** | Requer execução real na F7 |

---

**Assinatura (aprovação do plano):** _________________________  
**Data Aprovação:** _________________________  
**Início Execução (F1):** _________________________