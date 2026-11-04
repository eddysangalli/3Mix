# PLANO DE MIGRAÇÃO OBS 33.0.1 + CEF 150/156 — 3MIX PRO

**Data:** 04/11/2026  
**Status:** Planejamento (build isolado, não afeta runtime de produção)  
**Responsável:** Engenharia 3Mix

---

## 1. OBJETIVO

Migrar o motor nativo do 3Mix Pro do **OBS 32.2.2 (Fork Atual)** para **OBS 33.0.1** com **CEF 150+ (Chromium 150)**, preservando todos os patches 3Mix (Multi-M/E, DSK 1-4, FreeD, áudio ASIO, Pre-Flight Check, Incident Blackbox, Broadcast Delay, SRT 1.5.7, etc.) e garantindo rollback imediato.

---

## 2. ESTRATÉGIA: BUILD ISOLADO + HOMOLOGAÇÃO PARALELA

### 2.1 Princípios
- **Zero impacto no runtime de produção**: O `3mix-runtime/bin/64bit/3Mix.exe` atual (OBS 32.2.2) permanece intocado.
- **Branch dedicado**: `feat/obs33-cef150-migration` no `3mix-engine`.
- **Artefatos separados**: Build gera `3Mix-obs33.exe` e DLLs CEF 150 em `3mix-engine/build-obs33/`, não no runtime.
- **Testes automatizados**: Suíte completa antes de qualquer promoção.

### 2.2 Fases
| Fase | Descritivo | Critério de Saída |
|------|------------|-------------------|
| **F1** | Preparação do ambiente de build (VS 2022 17.11+, CMake 3.30+, Python 3.12, vcpkg) | Build limpo do OBS 33 upstream |
| **F2** | Aplicação dos patches 3Mix (40+ patches catalogados em `MIGRACAO-OBS-33.md`) | Patch `apply-patches.ps1` roda sem conflitos |
| **F3** | Build `3Mix-obs33.exe` + DLLs CEF 150 (chromium 150.0.0) | Binários gerados em `build-obs33/RelWithDebInfo` |
| **F4** | Testes unitários e integração (CI) | 100% pass em `3mix-engine/tests/` |
| **F5** | Homologação funcional (Pre-Flight, DSK, SRT, Replay, Slides, GC) | Checklist `OBS33-HOMOLOGACAO.md` 100% verde |
| **F6** | Teste de estabilidade 2h + stress multi-câmera DeckLink | Zero crashes, zero memory leaks |
| **F7** | Promoção controlada: substituição atômica no runtime + rollback testado | `ativar-obs33.cmd` / `reverter-obs32.cmd` validados |

---

## 3. PATCHES 3MIX A PRESERVAR (Catálogo Resumido)

| Área | Patches Principais | Arquivos Afetados |
|------|-------------------|-------------------|
| **Multi-M/E 1-4** | `0001-multi-me-core.patch`, `0002-multi-me-ui.patch` | `libobs/obs-output.c`, `ui/obs-studio/mainwindow/*` |
| **DSK 1-4 (TAKE/AUTO)** | `0010-dsk-take-auto.patch`, `0011-dsk-transition-slider.patch` | `plugins/3mix-dsk/*` |
| **FreeD / PTZ** | `0020-freed-tracking.patch` | `plugins/3mix-freed/*` |
| **Áudio ASIO + Faders** | `0030-audio-asio-faders.patch` | `libobs/obs-audio.c`, `plugins/3mix-audio/*` |
| **Pre-Flight Check** | `0040-preflight-check.patch` | `plugins/3mix-preflight/*` |
| **Incident Blackbox (60s ring)** | `0045-blackbox-ring.patch` | `plugins/3mix-blackbox/*` |
| **Broadcast Delay + DUMP** | `0050-broadcast-delay.patch` | `plugins/3mix-delay/*` |
| **SRT 1.5.7 + AES** | `0055-srt-157.patch` | `plugins/obs-ffmpeg/obs-ffmpeg-srt.h` |
| **Retornos SRT Clean Feed / N-1** | `0060-srt-returns.patch` | `plugins/3mix-returns/*` |
| **SlideEngine Browser Source** | `0070-slide-engine.patch` | `plugins/obs-browser/*` |
| **CEF Custom Scheme** | `0080-cef-custom-scheme.patch` | `plugins/obs-browser/cef-browser.cpp` |

> Lista completa em `3mix-panel/docs/MIGRACAO-OBS-33.md` (seção 4).

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

### 4.1 Impacto no 3Mix
- **GC (Graphics Composer)**: Requer atualização do esquema de injeção CSS/JS via `CefBrowserHost::ExecuteJavaScript`.
- **Browser Sources (Slides, PTZ, Overlays)**: Testar renderização WebGPU vs Software.
- **Painel Web Remoto**: Validar WebSocket + SSE no CEF 150.
- **Tamanho do runtime**: +~100 MB (libcef.dll maior).

---

## 5. RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Conflito de patches ao aplicar no OBS 33 | Alta | Build falha | Script `apply-patches.ps1` com `git apply --3way` + resolução manual documentada |
| Quebra de ABI em plugins nativos (DeckLink, ASIO, SRT) | Média | Plugins não carregam | Recompilar todos os plugins 3Mix contra novo SDK OBS 33 |
| CEF 150 quebra Browser Source (GC, Slides) | Média | Painéis não renderizam | Testes automatizados `test-cef150-browser.mjs` + fallback CEF 127 |
| Regressão de performance (CPU/RAM) | Baixa | Latência alta | Benchmark obrigatório na F6 vs baseline OBS 32 |
| Perda de patches não documentados | Baixa | Funcionalidade 3Mix faltando | Auditoria `git log --oneline 32.2.2..33.0.1 -- libobs plugins` |

---

## 6. PLANO DE ROLLBACK (Obrigatório antes da F7)

### 6.1 Scripts de Ativação/Reversão
```
3mix-runtime/
├── bin/64bit/
│   ├── 3Mix.exe                 ← OBS 32.2.2 (produção)
│   ├── 3Mix-obs33.exe           ← OBS 33.0.1 (candidato)
│   ├── libcef.dll               ← CEF 127 (produção)
│   ├── libcef-150.dll           ← CEF 150 (candidato)
│   ├── obs-ffmpeg.dll           ← v32
│   └── obs-ffmpeg-obs33.dll     ← v33
├── ativar-obs33.cmd             # Renomeia .exe/.dll atuais para .bak, promove obs33
├── reverter-obs32.cmd           # Restaura .bak em < 30s
└── preflight-obs33.cmd          # Valida integridade antes de ativar
```

### 6.2 Critérios de Rollback Automático
- Crash do `3Mix-obs33.exe` na inicialização (exit code != 0)
- Pre-Flight Check falha (GPU, DeckLink, Áudio, Rede)
- Memória > 2GB em idle (baseline OBS 32: ~800MB)
- Latência audio-video > 5 frames em teste padrão

---

## 7. CRONOGRAMA ESTIMADO

| Semana | Atividade |
|--------|-----------|
| **S1** | F1-F2: Ambiente + Aplicação patches |
| **S2** | F3-F4: Build + CI |
| **S3** | F5: Homologação funcional |
| **S4** | F6: Estabilidade 2h + Stress |
| **S5** | F7: Promoção controlada + Rollback testado |

---

## 8. DECISÃO DE GO/NO-GO (F7)

**GO se TODOS:**
- [ ] Build `3Mix-obs33.exe` passa CI 100%
- [ ] Checklist `OBS33-HOMOLOGACAO.md` 100% verde
- [ ] Teste 2h estabilidade: 0 crashes, 0 leaks
- [ ] Rollback `reverter-obs32.cmd` executa em < 30s
- [ ] Benchmark CPU/RAM ≤ +15% vs OBS 32.2.2
- [ ] CEF 150 renderiza GC + Slides + PTZ sem artefatos

**NO-GO se QUALQUER:**
- [ ] Qualquer crash no teste de 2h
- [ ] Rollback falha ou > 30s
- [ ] Benchmark > +15% CPU/RAM
- [ ] GC/Slides quebrados no CEF 150 sem workaround viável

---

## 9. ARQUIVOS RELACIONADOS

- `3mix-panel/docs/MIGRACAO-OBS-33.md` — Documento técnico completo (patches, CMake, CEF)
- `3mix-engine/scripts/apply-patches.ps1` — Script de aplicação de patches
- `3mix-engine/scripts/build-obs33.ps1` — Script de build isolado
- `3mix-panel/docs/OBS33-HOMOLOGACAO.md` — Checklist de homologação (a criar)
- `3mix-runtime/ativar-obs33.cmd` / `reverter-obs32.cmd` — Scripts de promoção/rollback

---

## 10. PRÓXIMOS PASSOS IMEDIATOS

1. Criar branch `feat/obs33-cef150-migration` no `3mix-engine`
2. Executar `apply-patches.ps1` contra tag `obs-33.0.1` do upstream
3. Documentar conflitos e resoluções em `PATCH-CONFLICTS-OBS33.md`
4. Configurar CI para build `RelWithDebInfo` do `3Mix-obs33.exe`
5. Criar `test-cef150-browser.mjs` para validação automatizada

---

**Assinatura:** _________________________  
**Data Aprovação:** _________________________