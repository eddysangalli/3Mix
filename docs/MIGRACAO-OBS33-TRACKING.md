# RASTREAMENTO DE MIGRAÇÃO OBS 33.0.1 + CEF 150/156 + FFmpeg 9 — 3MIX PRO

**Data de Início:** 04/11/2026  
**Status:** EM ANDAMENTO — Base OBS 33.0.1 estabelecida no motor  
**Branch do Motor:** `feat/obs33-patches` (no repositório 3mix-engine)  
**Branch de Rastreamento:** `feat/obs33-migration-tracking` (este branch)

---

## 1. VISÃO GERAL

| Componente | Atual (32.2.2) | Alvo (33.0.1) | Status |
|---|---|---|---|
| **OBS Studio** | 32.2.2 | **33.0.1** | ✅ Base estabelecida |
| **CEF / Chromium** | 127 / 127 | **150 / 150** | ✅ Incluído no 33.0.1 |
| **FFmpeg (integrado)** | 8.1.1 (soname 62) | **9.0.2 (soname 63)** | 🔄 Pendente |
| **obs-browser** | 2.24.1 | **2.27.5** | ✅ Atualizado |
| **obs-websocket** | 5.x | **5.7.6** | ✅ Atualizado |
| **DeckLink SDK** | 11.x | 12.x+ | 🔄 Verificar |

---

## 2. BASE ESTABELECIDA (04/11/2026)

**Branch do motor:** `feat/obs33-patches` (3mix-engine)  
**Commit base:** `65c320b46` — "libobs: Update version to 33.0.1" (tag upstream `33.0.1`)  
**Submódulos:**
- `plugins/obs-browser` → `d4db73e` (v2.27.5)
- `plugins/obs-websocket` → `e28f849` (v5.7.6)
- `deps/libdshowcapture/src` → `8878638`

> **Nota:** Esta base **não tem histórico comum** com a branch `main` do 3Mix (que está em 32.2.2 + patches). A integração dos patches 3Mix será feita via aplicação seletiva de diffs / reescrita manual dos recursos críticos.

---

## 3. PATCHES 3MIX A PORTAR (Prioridade Alta)

| # | Funcionalidade | Commits Originais (32.2.2) | Status | Responsável |
|---|---|---|---|---|
| 1 | **Multi-M/E 1-4** (core) | `ca9b44b`, `d4023ff`, `45a1287` | 🔄 Em análise | — |
| 2 | **DSK 1-4** (TAKE/AUTO/Slider) | `b6e0b54`, `8bd8cfaf` | 🔄 Em análise | — |
| 3 | **SRT 4:4:4 / Fill/Key / HDR** | `12f48a6`, `7d4650d`, `7072c33`, `e2ec8f1`, `a0d77ef`, `a047860` | 🔄 Em análise | — |
| 4 | **PluginManager + Safe Mode** | `e084a9e` | 🔄 Em análise | — |
| 5 | **DeckLink 16 saídas** | `3f35d62` | 🔄 Em análise | — |
| 6 | **VST3 nativo** | `f72408b`, `36f44c1`, `cbb6609` | 🔄 Em análise | — |
| 7 | **FreeD PTZ** | `103e16f` | 🔄 Em análise | — |
| 8 | **Áudio ASIO + Faders** | `b4a9f56`, `64cb009`, `a76f99a` | 🔄 Em análise | — |
| 9 | **Branding 3Mix / UI** | `4793d1a`, `762d5e4`, `3504a16` | 🔄 Em análise | — |
| 10 | **Pre-Flight / Blackbox / Delay** | `a047860`, `31a2139`, `de136e8`, `7eaf3a7` | 🔄 Em análise | — |

---

## 4. ESTRATÉGIA DE PORTE (Decidida em 04/11/2026)

Dado o volume de conflitos ao tentar merge/cherry-pick automático (divergência significativa entre OBS 32.2.2 e 33.0.1), a estratégia adotada é:

### 4.1. Porte Seletivo por Feature
- Extrair diffs dos commits originais 3Mix
- Aplicar manualmente no código base 33.0.1
- Testar compilação a cada feature
- Commit por feature com mensagem clara

### 4.2. Ordem de Execução
1. **Infraestrutura:** Multi-M/E core → DSK → PluginManager
2. **Transporte:** SRT → DeckLink → FreeD
3. **Mídia:** VST3 → Áudio ASIO → FFmpeg 9
4. **UI/Branding:** Branding 3Mix → Pre-Flight → Blackbox → Delay
5. **Validação:** Build completo → Testes regressão → Alpha installer

### 4.3. Critérios de Aceitação por Feature
- Compila sem erros (MSVC 143/144, CMake 3.28+)
- Testes unitários passam (quando aplicável)
- Não quebra funcionalidades OBS nativas
- Mantém compatibilidade com patches já portados

---

## 5. PRÓXIMOS PASSOS IMEDIATOS

| Ação | Descrição | Branch/PR |
|---|---|---|
| 1 | Finalizar análise de diffs do Multi-M/E core | `feat/obs33-multi-me` |
| 2 | Portar DSK 1-4 (TAKE/AUTO) | `feat/obs33-dsk` |
| 3 | Portar PluginManager + Safe Mode | `feat/obs33-pluginmgr` |
| 4 | Portar SRT 4:4:4 / Fill/Key | `feat/obs33-srt` |
| 5 | Integrar FFmpeg 9 (soname 63) | `feat/obs33-ffmpeg9` |
| 6 | Build completo + testes regressão | `feat/obs33-integration` |

---

## 6. ROLLBACK E COMPATIBILIDADE

- Motor 32.2.2 permanece em `main` e no runtime de produção (`3mix-runtime/bin/64bit/3Mix.exe`)
- Nova build 33.0.1 gerará `3Mix-obs33.exe` separado
- Scripts de ativação/rollback: `ativar-obs33.cmd` / `reverter-obs32.cmd` (a criar na fase de integração)
- CEF 127 mantido como fallback se CEF 150 apresentar regressões críticas

---

## 7. EVIDÊNCIAS E ARTEFATOS

- **Base OBS 33.0.1:** Branch `feat/obs33-patches` no 3mix-engine (push realizado)
- **Documentação técnica:** `MIGRACAO-OBS-33.md`, `PLANO-MIGRACAO-OBS33-CEF150.md`
- **Matriz de status:** `MATRIZ-STATUS-MODERNIZACAO-20261104.md` (atualizada)
- **Plano Alpha:** `PEDIDO-COMUNIDADE-ALPHA.md`

---

## 8. COMUNICAÇÃO E PRs

| Entrega | Repo | Branch | PR | Status |
|---|---|---|---|---|
| Base OBS 33.0.1 | 3mix-engine | `feat/obs33-patches` | Pendente (histórico diverge) | 📋 Documentado aqui |
| Tracking migração | 3mix-panel | `feat/obs33-migration-tracking` | **Este PR** | ✅ Em revisão |
| Multi-M/E core | 3mix-engine | `feat/obs33-multi-me` | A criar | ⏳ |
| DSK 1-4 | 3mix-engine | `feat/obs33-dsk` | A criar | ⏳ |
| ... | ... | ... | ... | ... |

> **Nota:** Como a base 33.0.1 não compartilha histórico com `main` do 3Mix, os PRs de engine serão criados como *draft* no repositório 3Mix (mesmo remote) para revisão de código, mas o merge final exigirá rebase/squash manual na integração final.

---

**Assinatura do Iniciador:** _________________________  
**Data:** 04/11/2026  
**Próxima Atualização:** Após porte do Multi-M/E core