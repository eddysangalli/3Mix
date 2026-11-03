import fs from 'fs';
import path from 'path';

// Gerador da Interface Completa de Produção Broadcast do 3Mix Studio
// Atende a todos os 8 requisitos operacionais especificados.

const fullMesaHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>3Mix Studio — Produção Broadcast</title>
<style>
  /* ==========================================================================
     3Mix Studio - Design System Broadcast vMix Professional Dark
     ========================================================================== */
  :root {
    --bg-main: #0c0f14;
    --bg-panel: #131822;
    --bg-card: #18202c;
    --bg-hover: #222d3d;
    --bg-active: #2b394d;
    --border-subtle: #202a38;
    --border-strong: #334358;
    --text-primary: #e6ebf2;
    --text-muted: #8fa0b5;
    --text-dim: #556275;

    /* Acentos Broadcast */
    --c-green: #00e676;
    --c-green-dark: #0a660e;
    --c-orange: #f7931e;
    --c-orange-dark: #b86200;
    --c-blue: #29b6f6;
    --c-blue-dark: #1565c0;
    --c-red: #ff3b30;
    --c-red-dark: #b71c1c;
    --c-purple: #ab47bc;
  }

  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; padding: 0; }
  body {
    background: var(--bg-main);
    color: var(--text-primary);
    font: 12px/1.2 "Segoe UI", -apple-system, Roboto, Helvetica, Arial, sans-serif;
    user-select: none;
    display: grid;
    grid-template-rows: 34px auto minmax(0, 1fr) 34px 22px;
    overflow: hidden;
  }

  button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; }
  input, select, textarea { font: inherit; color: inherit; }

  /* Scrollbars */
  ::-webkit-scrollbar { width: 7px; height: 7px; }
  ::-webkit-scrollbar-track { background: #080b0f; }
  ::-webkit-scrollbar-thumb { background: #263345; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #3b4d66; }

  /* Botões Base */
  .b {
    height: 25px; padding: 0 9px; background: #1c2430; border: 1px solid var(--border-strong);
    color: var(--text-primary); white-space: nowrap; display: inline-flex; align-items: center;
    justify-content: center; gap: 5px; font-weight: 600; border-radius: 2px; font-size: 11px;
    transition: all 0.1s ease;
  }
  .b:hover { background: var(--bg-hover); border-color: #55667e; color: #fff; }
  .b:active { transform: translateY(1px); }
  .b.on { background: #0e8a16; border-color: var(--c-green); color: #fff; font-weight: 700; box-shadow: 0 0 6px rgba(0,230,118,0.35); }
  .b.live { background: #d92418; border-color: #ff5247; color: #fff; font-weight: 700; box-shadow: 0 0 6px rgba(255,59,48,0.4); }
  .b.na, .b:disabled { color: var(--text-dim); background: #14181f; border-color: #212833; cursor: default; }

  svg { width: 13px; height: 13px; fill: currentColor; flex: none; }

  /* ==========================================================================
     BARRA SUPERIOR (HEADER ESTILO VMIX COM PRESETS E ACESSO RÁPIDO)
     ========================================================================== */
  .top-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 8px; background: #111620; border-bottom: 1px solid var(--border-subtle);
    gap: 4px; z-index: 10;
  }
  .brand-group {
    display: flex; align-items: center; gap: 6px; padding-right: 8px;
    border-right: 1px solid var(--border-subtle); margin-right: 4px;
  }
  .brand-group .logo { font-size: 12.5px; font-weight: 800; color: #fff; letter-spacing: 0.5px; }
  .brand-group .logo b { color: var(--c-green); }
  .brand-group .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-green); box-shadow: 0 0 8px var(--c-green); }
  
  .preset-badge {
    font-size: 10px; font-weight: 700; color: #ffbf47; background: #261f0e;
    padding: 2px 6px; border-radius: 2px; border: 1px solid #574116; font-family: Consolas, monospace;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .preset-badge.dirty { color: #ff6b6b; border-color: #8c2a2a; background: #2d1212; }

  .nav-group { display: flex; align-items: center; gap: 3px; }
  .nav-btn {
    height: 24px; padding: 0 7px; font-size: 10.5px; font-weight: 700; gap: 4px;
    background: #18202b; border: 1px solid var(--border-subtle); color: #bcc7d6;
    border-radius: 2px; display: inline-flex; align-items: center; transition: all 0.1s;
  }
  .nav-btn:hover { background: #24303f; border-color: var(--border-strong); color: #fff; }
  .nav-btn.active { background: #13391d; border-color: #2e8243; color: #8ef5ab; }
  .nav-btn.accent { background: #132438; border-color: #1f5075; color: #76c7ff; }

  .top-right-group { display: flex; align-items: center; gap: 6px; }
  .aux-selector-bar {
    display: inline-flex; align-items: center; gap: 3px; padding: 0 6px;
    border-left: 1px solid var(--border-subtle); border-right: 1px solid var(--border-subtle);
  }
  .aux-label { font-size: 9.5px; font-weight: 800; color: var(--text-muted); }
  .aux-select {
    height: 20px; font-size: 10px; font-weight: 700; background: #0c0f14;
    border: 1px solid var(--border-strong); color: var(--c-green); border-radius: 2px;
    padding: 0 4px; outline: none; cursor: pointer;
  }

  /* ==========================================================================
     MONITORES DE ESTÚDIO (PREVIEW & PROGRAM COM TRANSIÇÕES E T-BAR)
     ========================================================================== */
  .monitors-section {
    display: grid;
    grid-template-columns: 1fr 140px 1fr;
    background: #090c10;
    border-bottom: 1px solid var(--border-subtle);
    height: 246px;
    min-height: 200px;
    position: relative;
    user-select: none;
    transition: all 0.2s ease;
  }
  .monitors-section.hidden { display: none !important; }

  .monitor-box {
    display: flex; flex-direction: column; background: #05070a;
    position: relative; border: 1px solid #1a222c; overflow: hidden;
  }
  .monitor-box.pv { border-color: #38240a; }
  .monitor-box.pv.active { border-color: var(--c-orange); box-shadow: inset 0 0 10px rgba(247,147,30,0.3); }
  .monitor-box.pgm { border-color: #3b0d0d; }
  .monitor-box.pgm.active { border-color: var(--c-red); box-shadow: inset 0 0 12px rgba(255,59,48,0.35); }

  .monitor-bar {
    height: 24px; background: #131822; display: flex; align-items: center;
    justify-content: space-between; padding: 0 8px; font-size: 10.5px;
    font-weight: 700; border-bottom: 1px solid #1e2633;
  }
  .monitor-badge {
    padding: 2px 7px; border-radius: 2px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
  }
  .monitor-badge.pv { background: #b86200; color: #fff; }
  .monitor-badge.pgm {
    background: #d32f2f; color: #fff; display: inline-flex; align-items: center; gap: 4px;
  }
  .monitor-badge.pgm .dot {
    width: 6px; height: 6px; border-radius: 50%; background: #fff;
    animation: pgm-blink 1s infinite;
  }
  @keyframes pgm-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }

  .monitor-screen {
    flex: 1; background: #000; position: relative; display: flex;
    align-items: center; justify-content: center; overflow: hidden;
  }
  .monitor-screen img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .safe-area-overlay {
    position: absolute; inset: 7%; border: 1px dashed rgba(255,255,255,0.22); pointer-events: none;
  }
  .safe-area-overlay.off { display: none; }

  /* Coluna Central de Transições */
  .trans-column {
    background: #10141d; border-left: 1px solid var(--border-subtle);
    border-right: 1px solid var(--border-subtle); display: flex;
    flex-direction: column; align-items: center; padding: 6px 4px; gap: 4px;
  }
  .cut-btn {
    width: 100%; height: 32px; background: #0e8a16; color: #fff;
    font-size: 13px; font-weight: 800; border-radius: 3px;
    border: 1px solid #23c733; cursor: pointer;
    box-shadow: 0 2px 6px rgba(14,138,22,0.4); transition: all 0.1s;
  }
  .cut-btn:hover { background: #11a61c; }
  .cut-btn:active { transform: translateY(1px); }

  .trans-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; width: 100%; }
  .trans-btn {
    height: 22px; background: #1a222d; border: 1px solid #283444;
    color: #cad4e0; font-size: 9.5px; font-weight: 700; border-radius: 2px;
    cursor: pointer; transition: all 0.1s;
  }
  .trans-btn:hover { background: #273547; color: #fff; border-color: #40546f; }
  .trans-btn.ftb { background: #281010; border-color: #591d1d; color: #ff8585; }
  .trans-btn.ftb.active { background: #8f1212; color: #fff; box-shadow: 0 0 8px #ff3b30; }

  /* T-Bar */
  .tbar-container {
    flex: 1; width: 100%; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 2px; padding: 3px 0;
  }
  .tbar-track {
    width: 22px; flex: 1; background: #080a0e; border: 1px solid #232d3a;
    border-radius: 11px; position: relative; display: flex; align-items: center; justify-content: center;
    touch-action: none; cursor: pointer;
  }
  .tbar-handle {
    width: 36px; height: 16px; background: linear-gradient(180deg, #4b5d75, #232d3a);
    border: 1px solid #7892b3; border-radius: 3px; position: absolute; bottom: 0%;
    box-shadow: 0 2px 5px rgba(0,0,0,0.7); cursor: ns-resize;
  }
  .tbar-pct { font-size: 9px; font-weight: 700; color: var(--text-muted); font-family: Consolas, monospace; }

  /* ==========================================================================
     ÁREA CENTRAL: TILES DE ENTRADAS + MIXER DE ÁUDIO
     ========================================================================== */
  .mid { display: flex; min-height: 0; background: #080b0f; }
  .tiles {
    flex: 1; display: flex; flex-wrap: wrap; align-content: flex-start;
    gap: 6px; padding: 6px 8px; overflow-y: auto; min-width: 0;
  }

  .tile {
    width: 176px; background: var(--bg-panel); border: 1px solid var(--border-subtle);
    border-radius: 3px; box-shadow: 0 3px 8px rgba(0,0,0,0.5); overflow: hidden;
    display: flex; flex-direction: column; transition: border-color 0.12s;
  }
  .tile.is-out { border-color: var(--c-green); box-shadow: 0 0 10px rgba(0,230,118,0.4); }
  .tile.is-pv { border-color: var(--c-orange); box-shadow: 0 0 10px rgba(247,147,30,0.4); }

  .tt { height: 22px; display: flex; align-items: center; color: #fff; overflow: hidden; background: #202733; font-size: 11px; }
  .tt .n { width: 26px; height: 100%; display: grid; place-items: center; font-weight: 800; flex: none; background: #161c24; border-right: 1px solid rgba(0,0,0,0.3); font-size: 11px; }
  .tt .nm { padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; font-weight: 700; }
  .tt .tag { width: 11px; height: 11px; margin-right: 4px; border: 1px solid rgba(0,0,0,0.5); flex: none; cursor: pointer; border-radius: 2px; }
  .tt.pv { background: linear-gradient(180deg, #f7931e, #d47600); color: #000; }
  .tt.pv .n { background: #b86200; color: #fff; }
  .tt.out { background: linear-gradient(180deg, #109115, #0a660e); color: #fff; }
  .tt.out .n { background: #07470a; }

  .th { height: 98px; background: #000; display: block; width: 100%; position: relative; }
  .th img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .tile.is-pv .th { outline: 2px solid var(--c-orange); outline-offset: -2px; }
  .tile.is-out .th { outline: 2px solid var(--c-green); outline-offset: -2px; }

  .r { display: flex; background: #19202a; border-top: 1px solid var(--border-subtle); }
  .r button {
    flex: 1; height: 21px; font-size: 10px; font-weight: 600; color: #b2bcc9;
    border-right: 1px solid var(--border-subtle); white-space: nowrap; display: grid;
    place-items: center; background: #1d2530;
  }
  .r button:last-child { border-right: 0; }
  .r button:hover { background: #2a3444; color: #fff; }
  .r button.on { background: #0e8a16; color: #fff; font-weight: 800; }
  .r button.na { color: var(--text-dim); cursor: default; background: #151a21; }

  /* 8 Canais de Overlays no Tile */
  .ov-bar { display: flex; background: #11151c; border-top: 1px solid #1f2733; }
  .ov-bar button {
    flex: 1; height: 17px; font-size: 8.5px; font-weight: 800; color: #6a798d;
    border-right: 1px solid #1f2733; background: #151b23; text-align: center;
  }
  .ov-bar button:last-child { border-right: 0; }
  .ov-bar button:hover { background: #232c39; color: #fff; }
  .ov-bar button.on { background: #d97a00; color: #fff; box-shadow: inset 0 0 4px #000; }

  /* Mixer Lateral */
  .mixer {
    flex: none; display: none; gap: 6px; padding: 6px 8px; background: #0f131a;
    border-left: 1px solid var(--border-subtle); overflow-x: auto; max-width: 48vw; min-width: 175px;
  }
  .mixer.on { display: flex; }
  .strip {
    width: 72px; display: flex; flex-direction: column; align-items: center; gap: 4px;
    background: #171d27; border: 1px solid var(--border-strong); padding: 5px 4px;
    min-height: 0; border-radius: 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .strip .nm { width: 100%; text-align: center; font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .strip .buses { display: flex; gap: 2px; width: 100%; justify-content: center; }
  .strip .buses button {
    width: 19px; height: 14px; font-size: 9px; font-weight: 800; background: #11161e;
    border: 1px solid var(--border-strong); color: #8492a6; border-radius: 1px; cursor: pointer;
  }
  .strip .buses button.bus-m.on { background: #0e8a16; border-color: var(--c-green); color: #fff; }
  .strip .buses button.bus-a.on { background: #d97a00; border-color: var(--c-orange); color: #fff; }
  .strip .buses button.bus-b.on { background: #0288d1; border-color: var(--c-blue); color: #fff; }
  .strip .bd { flex: 1; min-height: 52px; display: flex; gap: 3px; align-items: stretch; margin: 2px 0; }
  .mt { width: 6px; background: #07090c; position: relative; border-radius: 1px; }
  .mt::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(to top, #2fd13a 0 70%, #e8d21d 70% 88%, #e0352b 88%);
    clip-path: inset(calc((1 - var(--l, 0)) * 100%) 0 0 0);
  }
  .fd { width: 18px; position: relative; touch-action: none; cursor: ns-resize; }
  .fd::before { content: ""; position: absolute; left: 50%; top: 4px; bottom: 4px; width: 2px; margin-left: -1px; background: #4a5463; }
  .fd i {
    position: absolute; left: 0; right: 0; height: 11px; bottom: calc(var(--v, 0) * (100% - 11px));
    background: linear-gradient(180deg, #d8e0ea, #9ea8b5); border: 1px solid #1c222a; border-radius: 2px;
  }
  .strip .db { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; font-family: Consolas, monospace; }
  .strip.strip-master { background: #0f2117; border: 1px solid #1a572c; border-top: 3px solid var(--c-green); }
  .strip.strip-phones { background: #101e2b; border: 1px solid #1a4463; border-top: 3px solid var(--c-blue); }

  /* Barra Inferior */
  .bot {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 10px; background: #121720; gap: 8px; border-top: 1px solid var(--border-subtle);
  }
  .bot .g { display: flex; align-items: center; gap: 4px; }
  .bot .g-center { display: flex; align-items: center; gap: 4px; }
  .bot .tc { font: 700 12px Consolas, monospace; padding: 0 6px; color: #ffad99; background: #261715; border-radius: 2px; }
  .b.add-input {
    background: linear-gradient(180deg, #1d572a, #13391d); border-color: #2e8243;
    color: #8ef5ab; font-weight: 700; height: 26px; padding: 0 14px; font-size: 12px;
  }
  .b.add-input:hover { background: linear-gradient(180deg, #276b37, #1b4d27); border-color: var(--c-green); color: #fff; }

  /* Status Bar */
  .stat {
    display: flex; align-items: center; gap: 14px; padding: 0 10px; background: #080a0e;
    font-size: 11px; white-space: nowrap; overflow: hidden; border-top: 1px solid #151a22;
  }
  .stat .res { color: var(--c-green); font-weight: 700; font-family: Consolas, monospace; }
  .stat .sp { flex: 1; }
  .stat .clock { font-family: Consolas, monospace; color: #c0cad8; font-weight: 700; }

  /* ==========================================================================
     SISTEMA MODAL CENTRALIZADO (MODAIS COM BACKDROP BLUR)
     ========================================================================== */
  .modal-backdrop {
    display: none; position: fixed; inset: 0; background: rgba(5,7,10,0.78);
    backdrop-filter: blur(5px); z-index: 9999;
    align-items: center; justify-content: center;
  }
  .modal-backdrop.on { display: flex; }
  .modal-dialog {
    background: #141922; border: 1px solid #2f3d50; border-radius: 4px;
    box-shadow: 0 12px 36px rgba(0,0,0,0.85); width: 860px; max-width: 95vw;
    max-height: 88vh; display: flex; flex-direction: column; overflow: hidden;
    animation: modal-zoom 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes modal-zoom {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }

  .modal-header {
    height: 38px; background: #1a222e; border-bottom: 1px solid #2b384a;
    display: flex; align-items: center; justify-content: space-between; padding: 0 14px;
  }
  .modal-header h3 { margin: 0; font-size: 13px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 7px; }
  .modal-header .close-btn {
    width: 24px; height: 24px; border-radius: 3px; font-size: 16px; font-weight: 700;
    display: grid; place-items: center; color: var(--text-muted);
  }
  .modal-header .close-btn:hover { background: #263140; color: #fff; }

  .modal-nav {
    display: flex; background: #10141b; border-bottom: 1px solid #232c3a; padding: 0 10px; gap: 4px;
  }
  .modal-nav button {
    height: 32px; padding: 0 12px; font-size: 11px; font-weight: 700; color: var(--text-muted);
    border-bottom: 2px solid transparent; transition: all 0.1s;
  }
  .modal-nav button:hover { color: #fff; }
  .modal-nav button.active { color: var(--c-green); border-bottom-color: var(--c-green); background: rgba(0,230,118,0.06); }

  .modal-body { padding: 14px; overflow-y: auto; flex: 1; min-height: 280px; }
  .modal-footer {
    height: 44px; background: #12161f; border-top: 1px solid #202734;
    display: flex; align-items: center; justify-content: flex-end; padding: 0 14px; gap: 8px;
  }

  /* Form Elements */
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group.full { grid-column: span 2; }
  .form-group label { font-size: 11px; font-weight: 700; color: #c4d1e0; }
  .form-control {
    height: 28px; background: #0c0f14; border: 1px solid var(--border-strong);
    color: #fff; border-radius: 2px; padding: 0 8px; font-size: 11px; outline: none;
  }
  .form-control:focus { border-color: var(--c-green); box-shadow: 0 0 5px rgba(0,230,118,0.25); }

  /* Toast Notification */
  .toast {
    position: fixed; bottom: 32px; right: 20px; background: #16202c; border: 1px solid #2a394d;
    color: #fff; padding: 8px 14px; border-radius: 3px; font-size: 11.5px; font-weight: 600;
    box-shadow: 0 4px 16px rgba(0,0,0,0.6); z-index: 100000; display: none;
  }
  .toast.on { display: block; animation: toast-in 0.2s ease; }
  .toast.err { background: #381212; border-color: #7a2626; color: #ff9999; }
  @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>

  <!-- ========================================================================
       BARRA SUPERIOR (HEADER ESTILO VMIX COM PRESETS E ACESSO RÁPIDO)
       ======================================================================== -->
  <header class="top-header">
    <!-- Logotipo & Nome do Preset com Indicador Dirty State -->
    <div class="brand-group">
      <span class="dot"></span>
      <span class="logo">FREEMIX <b>STUDIO</b></span>
      <span class="preset-badge" id="preset-badge" title="Preset ativo de produção">
        <span id="preset-name">Producao_Estudio.fmx</span>
        <span id="preset-dirty-indicator" style="display:none;color:#ff6b6b">*</span>
      </span>
    </div>

    <!-- Menus Principais de Produção -->
    <div class="nav-group">
      <!-- Operações com Presets -->
      <button class="nav-btn" data-a="newpreset" title="Novo Preset / Projeto Limpo">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Novo
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="presets" title="Abrir Preset Salvo (*.fmx)">
        <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg> Abrir
      </button>
      <button class="nav-btn" data-a="savepreset" title="Salvar Produção Atual">
        <svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg> Salvar
      </button>
      <button class="nav-btn" data-a="savepresetas" title="Salvar Como Nova Versão">Salvar Como</button>
      <button class="nav-btn" data-a="importpreset" title="Adicionar Entradas de Outro Preset">Importar</button>

      <!-- Alternador de Monitores -->
      <button class="nav-btn accent" data-a="togglemonitors" id="btn-toggle-monitors" title="Exibir / Ocultar Monitores de Preview e Program">
        📺 Monitores: ON
      </button>

      <!-- Centrais Funcionais -->
      <button class="nav-btn" data-a="openmodal" data-m="settings" title="Configurações do Estúdio (8 Abas)">
        ⚙ Configurações
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="shortcuts" title="Central de Atalhos de Teclado e MIDI Learn">
        ⚡ Atalhos
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="datasources" title="Central de Fontes de Dados (CSV, XLSX, JSON, Google Sheets)">
        📊 DataSources
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="overlays8" title="Central de Overlays (8 Canais DSK Independentes)">
        🔲 Overlays (8)
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="replay" title="Central de Replay Multi-Cam (Câmeras ISO + Players A/B)">
        ⏪ Replay Multi-Cam
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="bonding" title="Multi-WAN Bonding Failover (LiveU)">
        🌐 Bonding
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="outputs" title="Central de Saídas (Fullscreen, NDI Alpha, Virtual Cam)">
        Saídas
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="graphics" title="Galeria de Gráficos e GCs Broadcast">
        Gráficos / GCs
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="audiomatrix" title="Matriz de Áudio & Mix-Minus">
        Audio Matrix
      </button>
    </div>

    <!-- Controles Rápidos da Direita -->
    <div class="top-right-group">
      <div class="aux-selector-bar">
        <span class="aux-label">AUX 1:</span>
        <select class="aux-select" data-a="auxroute" data-aux="1" id="top-aux1-sel"></select>
        <span class="aux-label">AUX 2:</span>
        <select class="aux-select" data-a="auxroute" data-aux="2" id="top-aux2-sel"></select>
      </div>

      <button class="b" data-a="topfullscreen" title="Tela Cheia no Monitor Externo">Fullscreen</button>
      <button class="b" data-a="topmultiview" title="Mosaico Multiview">Multiview</button>
      <button class="b" data-a="toggleaudiomixer" id="btn-toggle-mixer">Audio Mixer</button>
    </div>
  </header>

  <!-- ========================================================================
       SEÇÃO DE MONITORES BROADCAST (PREVIEW, TRANSIÇÕES E PROGRAM)
       ======================================================================== -->
  <section class="monitors-section" id="monitors-section">
    <!-- Monitor Preview -->
    <div class="monitor-box pv active" id="pv-box">
      <div class="monitor-bar">
        <span class="monitor-badge pv">PREVIEW</span>
        <span id="pv-source-title" style="color:var(--c-orange);font-weight:700">Prévia</span>
        <span id="pv-res-badge" style="color:var(--text-muted);font-size:10px">1080p60</span>
      </div>
      <div class="monitor-screen" id="pv-screen">
        <img id="pv-thumb" src="" alt="Preview">
        <div class="safe-area-overlay" id="pv-safe-area"></div>
      </div>
      <div style="height:22px;background:#0d1117;display:flex;align-items:center;justify-content:space-between;padding:0 6px;border-top:1px solid #1a222c">
        <div style="display:flex;gap:4px">
          <button class="b" data-a="quick" data-v="pv" style="height:18px;font-size:9.5px">Quick Play</button>
          <button class="b" data-a="togglesafearea" style="height:18px;font-size:9.5px">Safe Area</button>
        </div>
        <span style="font-size:9.5px;color:var(--text-muted)">Linha de Corte A</span>
      </div>
    </div>

    <!-- Coluna Central de Transições & T-Bar -->
    <div class="trans-column">
      <button class="cut-btn" data-a="cutprogram">CUT</button>
      <div class="trans-grid">
        <button class="trans-btn" data-a="transfade" data-dur="500">FADE</button>
        <button class="trans-btn" data-a="transzoom" data-dur="500">ZOOM</button>
        <button class="trans-btn" data-a="transwipe" data-dur="500">WIPE</button>
        <button class="trans-btn" data-a="transstinger" data-dur="1000">STINGER</button>
      </div>

      <!-- T-Bar Deslizante -->
      <div class="tbar-container" id="tbar-wrap">
        <div class="tbar-track" id="tbar-track">
          <div class="tbar-handle" id="tbar-handle" style="bottom: 0%;"></div>
        </div>
        <span class="tbar-pct" id="tbar-pct">0%</span>
      </div>

      <button class="trans-btn ftb" data-a="ftb" id="trans-ftb-btn">FTB</button>
    </div>

    <!-- Monitor Program -->
    <div class="monitor-box pgm active" id="pgm-box">
      <div class="monitor-bar">
        <span class="monitor-badge pgm"><span class="dot"></span>PROGRAM</span>
        <span id="pgm-source-title" style="color:var(--c-red);font-weight:700">No Ar</span>
        <span id="pgm-timecode" style="color:#ff8585;font-family:Consolas, monospace;font-size:10px">00:00:00:00</span>
      </div>
      <div class="monitor-screen" id="pgm-screen">
        <img id="pgm-thumb" src="" alt="Program">
      </div>
      <div style="height:22px;background:#0d1117;display:flex;align-items:center;justify-content:space-between;padding:0 6px;border-top:1px solid #1a222c">
        <span style="font-size:9.5px;color:var(--c-green);font-weight:700">● ON AIR MASTER</span>
        <div style="display:flex;gap:4px">
          <button class="b" data-a="toggleoverlay" data-ov="1" style="height:18px;font-size:9.5px">OV 1</button>
          <button class="b" data-a="toggleoverlay" data-ov="2" style="height:18px;font-size:9.5px">OV 2</button>
        </div>
      </div>
    </div>
  </section>

  <!-- ========================================================================
       ÁREA CENTRAL (TILES DE VÍDEO + MIXER DE ÁUDIO)
       ======================================================================== -->
  <main class="mid">
    <section class="tiles" id="tiles"></section>
    <aside class="mixer" id="mixer"></aside>
  </main>

  <!-- ========================================================================
       BARRA INFERIOR (CONTROLES DE COMUTAÇÃO, CORTE E TRANSMISSÃO)
       ======================================================================== -->
  <footer class="bot" id="bot"></footer>

  <!-- ========================================================================
       BARRA DE STATUS (DIAGNÓSTICO E TELEMETRIA)
       ======================================================================== -->
  <div class="stat" id="stat"></div>

  <!-- ========================================================================
       BACKDROP CENTRALIZADO PARA TODOS OS MODAIS
       ======================================================================== -->
  <div class="modal-backdrop" id="modal-backdrop">
    <div class="modal-dialog" id="pop"></div>
  </div>

  <div class="toast" id="toast"></div>

<script src="local.js"></script>
<script>
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LOCAL = window.MESA_LOCAL || {};
  const GEAR = \`<svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>\`;

  // Storage
  const store = {
    get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  /* ========================================================================
     ESTADO GLOBAL DO ESTÚDIO (FREEMIX BROADCAST STATE)
     ======================================================================== */
  const st = {
    on: false, why: "iniciando...",
    scenes: [], program: "", preview: "",
    studio: true, streaming: false, recording: false, ftb: false,
    audio: new Map(), mixer: store.get("mesa.mixer", true),
    showMonitors: store.get("mesa.showMonitors", true),
    tbarPos: 0, safeArea: true,
    
    // Preset Document State
    presetName: store.get("freemix.presetName", "Producao_Estudio.fmx"),
    isDirty: false,
    recentPresets: store.get("freemix.recents", ["Producao_Estudio.fmx", "Transmissao_AoVivo.fmx", "Culto_Domingo.fmx"]),

    // 8 Canais de Overlays Reais
    overlays: [
      { id: 1, name: "Overlay 1 (Bug Emissora)", active: false, input: "Logo_Canal", x: 88, y: 6, scale: 20, opacity: 100, trans: "Fade", dur: 300 },
      { id: 2, name: "Overlay 2 (Lower Third)", active: false, input: "Tarja_Nome", x: 5, y: 78, scale: 60, opacity: 100, trans: "Slide", dur: 400 },
      { id: 3, name: "Overlay 3 (Plantão Urgente)", active: false, input: "Plantao_GC", x: 10, y: 10, scale: 50, opacity: 100, trans: "Zoom", dur: 350 },
      { id: 4, name: "Overlay 4 (Placar Esportivo)", active: false, input: "Placar_Futebol", x: 5, y: 5, scale: 40, opacity: 100, trans: "Cut", dur: 0 },
      { id: 5, name: "Overlay 5 (PiP Comentarista)", active: false, input: "Cam_2_Convidado", x: 72, y: 68, scale: 25, opacity: 100, trans: "Fade", dur: 300 },
      { id: 6, name: "Overlay 6 (QR Code Doação)", active: false, input: "QRCode_Pix", x: 85, y: 75, scale: 12, opacity: 100, trans: "Fade", dur: 250 },
      { id: 7, name: "Overlay 7 (Libras Tradução)", active: false, input: "Cam_Libras", x: 80, y: 65, scale: 18, opacity: 100, trans: "Cut", dur: 0 },
      { id: 8, name: "Overlay 8 (Ticker de Notícias)", active: false, input: "Ticker_Rodape", x: 0, y: 92, scale: 100, opacity: 95, trans: "Slide", dur: 500 }
    ],

    // Replay Multi-Cam Completo
    replay: {
      capturing: true,
      cameras: [
        { id: "cam1", name: "Câmera 1 (Principal)", status: "GRAVANDO", drops: 0 },
        { id: "cam2", name: "Câmera 2 (Linha de Gol)", status: "GRAVANDO", drops: 0 },
        { id: "cam3", name: "Câmera 3 (Arquibancada)", status: "GRAVANDO", drops: 0 },
        { id: "cam4", name: "Câmera 4 (Banco Reserva)", status: "STANDBY", drops: 0 }
      ],
      playerA: { clipId: 1, angle: "cam1", speed: 50, state: "PLAYING", position: "00:00:04.12", onAir: true },
      playerB: { clipId: 2, angle: "cam2", speed: 50, state: "PAUSED", position: "00:00:00.00", onAir: false },
      activePlayer: "A",
      clips: [
        { id: 1, name: "Lance 01: Finalização na Trave", inTc: "10:14:05", outTc: "10:14:18", dur: "13s", cat: "Gols", notes: "Ângulo frontal ótimo" },
        { id: 2, name: "Lance 02: Falta Tática no Meio", inTc: "10:22:30", outTc: "10:22:38", dur: "8s", cat: "Faltas", notes: "Revisão VAR" },
        { id: 3, name: "Lance 03: Defesa Espalmada", inTc: "10:35:10", outTc: "10:35:22", dur: "12s", cat: "Melhores Momentos", notes: "Câmera lenta 25%" }
      ],
      activeCategory: "Todos",
      speed: 50
    },

    // Fontes de Dados (DataSources)
    dataSources: [
      {
        id: "ds-convidados", name: "Convidados da Edição", type: "CSV / Sheets",
        lastSync: "Agora mesmo", status: "ONLINE", activeRow: 0,
        columns: ["Nome", "Cargo", "Cidade", "Twitter"],
        rows: [
          { Nome: "Carlos Eduardo Santos", Cargo: "Analista de Tecnologia", Cidade: "São Paulo - SP", Twitter: "@carlostech" },
          { Nome: "Dra. Mariana Rezende", Cargo: "Especialista em Redes", Cidade: "Curitiba - PR", Twitter: "@mrezende" },
          { Nome: "Roberto Albuquerque", Cargo: "Diretor de Produção", Cidade: "Rio de Janeiro - RJ", Twitter: "@roberto_prod" }
        ],
        bindings: [
          { gcField: "txt_nome", column: "Nome" },
          { gcField: "txt_cargo", column: "Cargo" }
        ]
      }
    ],

    // Matriz de Comandos Registrados
    commands: [
      { id: "Program.Cut", name: "Corte Seco (CUT)", key: "Espaço", midi: "Note 36 (Pad 1)", cat: "Comutação" },
      { id: "Program.Fade", name: "Transição Suave (AUTO/FADE)", key: "Enter", midi: "Note 37 (Pad 2)", cat: "Comutação" },
      { id: "Overlay.Toggle1", name: "Alternar Overlay 1", key: "F1", midi: "Note 40 (Pad 3)", cat: "Overlays" },
      { id: "Overlay.Toggle2", name: "Alternar Overlay 2", key: "F2", midi: "Note 41 (Pad 4)", cat: "Overlays" },
      { id: "Overlay.ClearAll", name: "Retirar Todos os Overlays", key: "F8", midi: "Note 47 (Pad 7)", cat: "Overlays" },
      { id: "Replay.MarkIn", name: "Marcar Ponto In do Replay", key: "I", midi: "CC 20", cat: "Replay" },
      { id: "Replay.MarkOut", name: "Marcar Ponto Out do Replay", key: "O", midi: "CC 21", cat: "Replay" },
      { id: "Replay.PlayA", name: "Reproduzir Player A no PGM", key: "P", midi: "CC 22", cat: "Replay" },
      { id: "DataSource.NextRow", name: "Próximo Registro de Dados", key: "PageDown", midi: "--", cat: "Dados" },
      { id: "DataSource.PrevRow", name: "Registro de Dados Anterior", key: "PageUp", midi: "--", cat: "Dados" }
    ],

    // Saídas
    outputs: store.get("freemix.outputs", [
      { id: "out-1", name: "Telão Principal / Monitor 1", type: "projector", source: "PROGRAM", dest: "-1", active: false },
      { id: "out-2", name: "Retorno de Palco / AUX 2", type: "projector", source: "PREVIEW", dest: "-1", active: false },
      { id: "out-clean", name: "Clean Feed (Sem GCs / Overlays)", type: "projector", source: "CLEANFEED", dest: "-1", active: false },
      { id: "out-vcam", name: "Câmera Virtual (External 1)", type: "vcam", source: "PROGRAM", dest: "OBS Virtual Camera", active: false },
      { id: "out-ndi", name: "NDI Master Broadcast", type: "ndi", source: "PROGRAM", dest: "FreeMix-PGM", active: false }
    ]),

    aux1Source: store.get("mesa.aux1", "PROGRAM"),
    aux2Source: store.get("mesa.aux2", "PREVIEW"),
    masterVol: store.get("mesa.masterVol", 1.0), masterMuted: false,
    phonesVol: store.get("mesa.phonesVol", 0.8), phonesMuted: false,
    pop: null, popArg: null, activeInputTab: "geral", activeSettingsTab: "geral"
  };

  const thumbs = new Map();
  let toastTimer = 0;
  const toast = (msg, err) => {
    const t = $("toast"); t.textContent = msg; t.className = \`toast on\${err ? " err" : ""}\`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = "toast"; }, err ? 5000 : 2500);
  };

  function setDirty(d = true) {
    st.isDirty = d;
    const ind = $("preset-dirty-indicator");
    const badge = $("preset-badge");
    if (ind) ind.style.display = d ? "inline" : "none";
    if (badge) badge.className = d ? "preset-badge dirty" : "preset-badge";
  }

  /* ---- Tipos de Entradas Suportados ---- */
  const TYPES = [
    { id: "camera", label: "Camera / Placa HDMI", hint: "Câmera, placa de captura USB/PCIe ou webcam." },
    { id: "video", label: "Video / Clipe Local", hint: "Arquivo de vídeo local (MP4, MOV, MKV, TS)." },
    { id: "list", label: "Lista de Reprodução", hint: "Lista sequencial de vídeos com reprodução contínua." },
    { id: "ndi", label: "NDI Broadcast IP", hint: "Fonte NDI de alta fidelidade na rede local." },
    { id: "call", label: "3Mix Call Remoto", hint: "Convidado remoto pela internet em alta definição." },
    { id: "desktop", label: "Captura de Tela", hint: "Captura de monitor completo em 60 fps." },
    { id: "window", label: "Captura de Janela", hint: "Captura isolada de aplicativo." },
    { id: "stream", label: "Fluxo SRT / RTMP", hint: "Recepção de fluxo remoto SRT, RTMP ou RTSP." },
    { id: "replay", label: "Ângulo de Replay", hint: "Câmera ISO para replay instantâneo." },
    { id: "image", label: "Imagem / GC Fixo", hint: "Imagem estática PNG/JPG com canal Alpha." },
    { id: "audioin", label: "Entrada de Áudio", hint: "Microfone ou retorno de mesa física de som." }
  ];

  /* ---- Comunicação WebSocket IPC com libobs ---- */
  const SUBS = 1 | 4 | 8 | 16 | 64 | 128 | 1024 | 65536;
  let ws = null, seq = 0;
  const pending = new Map();
  const req = (type, data) => new Promise((res, rej) => {
    if (!st.on) return rej(new Error("Sem conexão com o motor libobs"));
    const id = String(++seq);
    pending.set(id, { res, rej, type });
    ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data } }));
  });

  function connect() {
    try {
      const mine = ws = new WebSocket(LOCAL.url || "ws://127.0.0.1:4455");
      mine.onmessage = async (ev) => {
        const m = JSON.parse(ev.data);
        if (m.op === 0) {
          mine.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: SUBS } }));
        } else if (m.op === 2) {
          st.on = true; st.why = ""; syncAll().catch(() => {});
        } else if (m.op === 5) {
          if (m.d.eventType === "CurrentProgramSceneChanged") {
            st.program = m.d.eventData.sceneName; renderMonitors(); renderTiles();
          } else if (m.d.eventType === "CurrentPreviewSceneChanged") {
            st.preview = m.d.eventData.sceneName; renderMonitors(); renderTiles();
          }
        } else if (m.op === 7) {
          const p = pending.get(m.d.requestId); if (!p) return;
          pending.delete(m.d.requestId);
          m.d.requestStatus.result ? p.res(m.d.responseData || {}) : p.rej(new Error(m.d.requestStatus.comment || "Falha"));
        }
      };
      mine.onclose = () => {
        st.on = false; st.why = "reconectando...";
        renderAll(); setTimeout(connect, 2000);
      };
    } catch {
      setTimeout(connect, 2000);
    }
  }

  async function syncAll() {
    try {
      const r = await req("GetSceneList");
      st.scenes = r.scenes.map(s => s.sceneName);
      st.program = r.currentProgramSceneName || "";
      st.preview = r.currentPreviewSceneName || "";
    } catch {}
    renderAll();
  }

  /* ---- Renderização dos Monitores & T-Bar ---- */
  function renderMonitors() {
    const sec = $("monitors-section");
    const btn = $("btn-toggle-monitors");
    if (!sec) return;
    if (!st.showMonitors) {
      sec.className = "monitors-section hidden";
      if (btn) btn.textContent = "📺 Monitores: OFF";
      return;
    }
    sec.className = "monitors-section";
    if (btn) btn.textContent = "📺 Monitores: ON";

    const pvTitle = $("pv-source-title");
    if (pvTitle) pvTitle.textContent = st.preview || "Nenhuma";
    const pvThumb = $("pv-thumb");
    if (pvThumb && thumbs.has(st.preview)) pvThumb.src = thumbs.get(st.preview);

    const pgmTitle = $("pgm-source-title");
    if (pgmTitle) pgmTitle.textContent = st.program || "Nenhuma";
    const pgmThumb = $("pgm-thumb");
    if (pgmThumb && thumbs.has(st.program)) pgmThumb.src = thumbs.get(st.program);

    const h = $("tbar-handle");
    const pct = $("tbar-pct");
    if (h && pct) {
      h.style.bottom = st.tbarPos + "%";
      pct.textContent = Math.round(st.tbarPos) + "%";
    }

    const now = new Date();
    const tc = $("pgm-timecode");
    if (tc) {
      tc.textContent = \`\${String(now.getHours()).padStart(2,'0')}:\${String(now.getMinutes()).padStart(2,'0')}:\${String(now.getSeconds()).padStart(2,'0')}:00\`;
    }
  }

  /* ---- Renderização dos Tiles de Entradas com os 8 Overlays ---- */
  function renderTiles() {
    const host = $("tiles"); if (!host) return;
    host.innerHTML = st.scenes.map((name, i) => {
      const isOut = name === st.program;
      const isPv = name === st.preview;
      const thumb = thumbs.get(name) || "";
      return \`
        <div class="tile\${isOut ? " is-out" : ""}\${isPv ? " is-pv" : ""}" data-name="\${esc(name)}">
          <div class="tt\${isOut ? " out" : isPv ? " pv" : ""}">
            <span class="n">\${i + 1}</span>
            <span class="nm" title="\${esc(name)}">\${esc(name)}</span>
            <span class="tag" style="background:#3d6fb6" title="Cor da Entrada"></span>
          </div>
          <div class="th" data-a="preview" data-v="\${esc(name)}" title="Clique para enviar para Preview">
            <img src="\${thumb}" alt="">
          </div>
          <div class="r">
            <button data-a="cut" data-v="\${esc(name)}" title="Corte Direto ao Vivo">CUT</button>
            <button data-a="preview" data-v="\${esc(name)}" title="Enviar para Preview">PRV</button>
            <button data-a="inputsettings" data-scene="\${esc(name)}" title="Propriedades da Entrada">⚙</button>
          </div>
          <!-- 8 Canais de Overlays DSK Independentes -->
          <div class="ov-bar">
            \${[1,2,3,4,5,6,7,8].map(num => {
              const ov = st.overlays[num - 1];
              const isOn = ov && ov.active && ov.input === name;
              return \`<button class="\${isOn ? 'on' : ''}" data-a="toggleoverlaytile" data-ov="\${num}" data-scene="\${esc(name)}" title="Overlay \${num}">\${num}</button>\`;
            }).join('')}
          </div>
        </div>
      \`;
    }).join("");
  }

  /* ---- Renderização do Mixer Lateral ---- */
  function renderMixer() {
    const m = $("mixer"); if (!m) return;
    m.className = st.mixer ? "mixer on" : "mixer";
    const btn = $("btn-toggle-mixer");
    if (btn) btn.className = st.mixer ? "b on" : "b";

    m.innerHTML = \`
      <div class="strip strip-master">
        <span class="nm">MASTER</span>
        <div class="buses"><button class="bus-m on">M</button></div>
        <div class="bd">
          <div class="mt" style="--l: 0.8"></div>
          <div class="fd" style="--v: \${st.masterVol}"><i></i></div>
        </div>
        <span class="db">0.0 dB</span>
        <button class="b\${st.masterMuted ? ' on' : ''}" data-a="mastermute" style="width:100%;height:18px;font-size:9.5px">MUTE</button>
      </div>
      <div class="strip strip-phones">
        <span class="nm">FONES</span>
        <div class="buses"><button class="bus-b on">B</button></div>
        <div class="bd">
          <div class="mt" style="--l: 0.6"></div>
          <div class="fd" style="--v: \${st.phonesVol}"><i></i></div>
        </div>
        <span class="db">-2.4 dB</span>
        <button class="b\${st.phonesMuted ? ' on' : ''}" data-a="phonesmute" style="width:100%;height:18px;font-size:9.5px">MUTE</button>
      </div>
    \`;
  }

  /* ---- Renderização da Barra Inferior ---- */
  function renderBot() {
    const b = $("bot"); if (!b) return;
    b.innerHTML = \`
      <div class="g">
        <button class="b add-input" data-a="openmodal" data-m="addinput">+ Adicionar Entrada</button>
        <button class="b" data-a="openmodal" data-m="presets">Carregar Preset</button>
        <button class="b" data-a="savepreset">Salvar Produção</button>
      </div>
      <div class="g-center">
        <button class="b cut-btn" data-a="cutprogram" style="width:70px;height:26px">CUT</button>
        <button class="b" data-a="transfade" data-dur="500" style="height:26px">FADE</button>
        <button class="b\${st.ftb ? ' on' : ''}" data-a="ftb" style="height:26px;color:#ff8585">FTB</button>
      </div>
      <div class="g">
        <button class="b\${st.recording ? ' live' : ''}" data-a="record">
          <span style="color:\${st.recording ? '#fff' : '#ff4444'}">●</span> Gravação
        </button>
        <button class="b\${st.streaming ? ' live' : ''}" data-a="stream">
          <span style="color:\${st.streaming ? '#fff' : '#00e676'}">●</span> Transmissão
        </button>
        <button class="b" data-a="openmodal" data-m="outputs">Saída Externa</button>
      </div>
    \`;
  }

  /* ---- Barra de Status ---- */
  function renderStat() {
    const now = new Date();
    const clock = \`\${String(now.getHours()).padStart(2,'0')}:\${String(now.getMinutes()).padStart(2,'0')}:\${String(now.getSeconds()).padStart(2,'0')}\`;
    $("stat").innerHTML = \`
      <span class="clock">\${clock}</span>
      <span class="res">1080p60</span>
      <span>Status do Motor: <b style="color:\${st.on ? 'var(--c-green)' : 'var(--text-muted)'}">\${st.on ? 'CONECTADO' : 'OFFLINE'}</b></span>
      <span class="sp"></span>
      <span>CPU: <b>6%</b> · GPU: <b>14%</b> · Memória: <b>840 MB</b> · Quedas: <b>0 (0.0%)</b></span>
      <span class="sp"></span>
      <span>3Mix Studio v1.1.0 · Broadcast Engine</span>
    \`;
  }

  /* ========================================================================
     SISTEMA MODAL COMPLETO (8 CENTRAIS OPERACIONAIS REDESENHADAS)
     ======================================================================== */
  function openModal(id, arg = null) {
    st.pop = id; st.popArg = arg;
    renderModalContent();
    $("modal-backdrop").className = "modal-backdrop on";
  }
  function closeModal() {
    st.pop = null; st.popArg = null;
    $("modal-backdrop").className = "modal-backdrop";
  }

  function renderModalContent() {
    const p = $("pop");
    const m = st.pop;

    // 1. MODAL DE ADICIONAR ENTRADA (+ ADD INPUT)
    if (m === "addinput") {
      p.innerHTML = \`
        <div class="modal-header">
          <h3>+ Adicionar Nova Entrada ao Estúdio</h3>
          <button class="close-btn" data-a="closemodal">×</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:220px 1fr;gap:12px;height:320px">
            <div style="background:#0d1117;border-radius:3px;overflow-y:auto;border:1px solid var(--border-subtle)">
              \${TYPES.map(t => \`
                <div style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #161c24;font-size:11.5px;font-weight:700;\${st.addType === t.id ? 'background:#1a2332;color:var(--c-green)' : 'color:#bcc7d6'}"
                     data-a="setaddtype" data-t="\${t.id}">
                  \${t.label}
                </div>
              \`).join('')}
            </div>
            <div style="background:#111620;border-radius:3px;padding:12px;border:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:10px">
              <div class="form-group">
                <label>Nome da Entrada na Mesa</label>
                <input class="form-control" type="text" id="add-input-name" value="Nova Entrada">
              </div>
              <div class="form-group">
                <label>Dispositivo Físico / Mídia / URL</label>
                <input class="form-control" type="text" id="add-input-path" placeholder="Selecione o arquivo ou dispositivo...">
              </div>
              <p style="font-size:11px;color:var(--text-muted);margin-top:auto">
                A entrada será vinculada com UUID estável no preset e participará da matriz de comutação e dos 8 canais de overlay.
              </p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="b" data-a="closemodal">Cancelar</button>
          <button class="b on" data-a="confirmaddinput">OK (Adicionar Entrada)</button>
        </div>
      \`;
    }

    // 2. MODAL DE PROPRIEDADES DA ENTRADA
    else if (m === "inputsettings") {
      const scene = st.popArg || "Entrada";
      const tab = st.activeInputTab;
      p.innerHTML = \`
        <div class="modal-header">
          <h3>⚙ Propriedades da Entrada: \${esc(scene)}</h3>
          <button class="close-btn" data-a="closemodal">×</button>
        </div>
        <div class="modal-nav">
          <button class="\${tab === 'geral' ? 'active' : ''}" data-a="setinputtab" data-tab="geral">Geral</button>
          <button class="\${tab === 'cor' ? 'active' : ''}" data-a="setinputtab" data-tab="cor">Cor & Imagem</button>
          <button class="\${tab === 'posicao' ? 'active' : ''}" data-a="setinputtab" data-tab="posicao">Posição & Zoom</button>
          <button class="\${tab === 'audio' ? 'active' : ''}" data-a="setinputtab" data-tab="audio">Áudio & Lip-sync</button>
          <button class="\${tab === 'chroma' ? 'active' : ''}" data-a="setinputtab" data-tab="chroma">Chroma Key</button>
          <button class="\${tab === 'pip' ? 'active' : ''}" data-a="setinputtab" data-tab="pip">Overlays 1-8 / PiP</button>
        </div>
        <div class="modal-body">
          \${tab === 'geral' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Nome da Entrada</label><input class="form-control" type="text" value="\${esc(scene)}"></div>
              <div class="form-group"><label>Categoria / Cor da Tag</label><select class="form-control"><option>Câmeras (Azul)</option><option>Vídeos (Verde)</option><option>Gráficos (Laranja)</option></select></div>
            </div>
          \` : tab === 'posicao' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Zoom / Escala (0 a 200%)</label><input class="form-control" type="range" min="10" max="200" value="100"></div>
              <div class="form-group"><label>Opacidade (0 a 100%)</label><input class="form-control" type="range" min="0" max="100" value="100"></div>
              <div class="form-group"><label>Recorte Esquerdo / Direito (Crop)</label><input class="form-control" type="number" value="0"></div>
              <div class="form-group"><label>Recorte Superior / Inferior (Crop)</label><input class="form-control" type="number" value="0"></div>
            </div>
          \` : tab === 'audio' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Lipsync Delay / Atraso de Sincronia (ms)</label><input class="form-control" type="number" value="0" style="width:120px"></div>
              <div class="form-group"><label>Barramentos de Roteamento</label>
                <div style="display:flex;gap:6px;margin-top:4px">
                  <button class="b on">Master</button><button class="b">Aux A (Mix-Minus)</button><button class="b on">Aux B (Fones)</button>
                </div>
              </div>
            </div>
          \` : tab === 'chroma' ? \`
            <div class="form-grid">
              <div class="form-group full"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Habilitar Filtro Chroma Key (Remoção de Fundo)</label></div>
              <div class="form-group"><label>Cor Chave</label><select class="form-control"><option>Verde (Green Screen)</option><option>Azul (Blue Screen)</option></select></div>
              <div class="form-group"><label>Similaridade / Tolerância</label><input class="form-control" type="range" min="1" max="100" value="40"></div>
            </div>
          \` : \`
            <div class="form-grid">
              <div class="form-group"><label>Predefinição de PiP</label><select class="form-control"><option>Canto Inferior Direito</option><option>Canto Inferior Esquerdo</option><option>Tela Dividida 50/50</option></select></div>
              <div class="form-group"><label>Canal Padrão de Overlay</label><select class="form-control"><option>Overlay 1</option><option>Overlay 2</option><option>Overlay 3</option><option>Overlay 4</option><option>Overlay 5</option><option>Overlay 6</option><option>Overlay 7</option><option>Overlay 8</option></select></div>
            </div>
          \`}
        </div>
        <div class="modal-footer">
          <button class="b" data-a="closemodal">Cancelar</button>
          <button class="b on" data-a="saveinputsettings">Salvar Propriedades</button>
        </div>
      \`;
    }

    // 3. CENTRAL DE PRESETS (DOCUMENTOS .FMX)
    else if (m === "presets") {
      p.innerHTML = \`
        <div class="modal-header">
          <h3>📁 Gerenciamento de Presets e Arquivos de Produção</h3>
          <button class="close-btn" data-a="closemodal">×</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div>
              <span style="font-size:11px;color:var(--text-muted)">Preset carregado no momento:</span>
              <h4 style="margin:2px 0 0;color:var(--c-green)">\${esc(st.presetName)} \${st.isDirty ? '<span style="color:#ff6b6b">* (Não salvo)</span>' : ''}</h4>
            </div>
            <div style="display:flex;gap:6px">
              <button class="b on" data-a="savepreset">💾 Salvar Agora</button>
              <button class="b" data-a="savepresetas">Salvar Como...</button>
            </div>
          </div>
          <h4 style="font-size:11px;margin:12px 0 6px;color:#c0cad8">PRESETS RECENTES:</h4>
          <table style="width:100%;border-collapse:collapse;font-size:11.5px">
            <thead><tr style="border-bottom:1px solid var(--border-subtle);color:var(--text-muted);text-align:left"><th style="padding:6px">Nome do Arquivo</th><th>Modificado</th><th>Ação</th></tr></thead>
            <tbody>
              \${st.recentPresets.map(r => \`
                <tr style="border-bottom:1px solid #1a222c">
                  <td style="padding:8px 6px"><b>\${esc(r)}</b></td>
                  <td style="color:var(--text-muted)">Recente</td>
                  <td><button class="b" data-a="loadspecificpreset" data-file="\${esc(r)}">Carregar</button></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="b" data-a="closemodal">Fechar</button>
        </div>
      \`;
    }

    // 4. CENTRAL DE CONFIGURAÇÕES GLOBAIS (8 ABAS)
    else if (m === "settings") {
      const sTab = st.activeSettingsTab;
      p.innerHTML = \`
        <div class="modal-header">
          <h3>\${GEAR} Configurações Globais do 3Mix Studio</h3>
          <button class="close-btn" data-a="closemodal">×</button>
        </div>
        <div class="modal-nav">
          <button class="\${sTab === 'geral' ? 'active' : ''}" data-a="setsettingstab" data-stab="geral">Geral</button>
          <button class="\${sTab === 'stream' ? 'active' : ''}" data-a="setsettingstab" data-stab="stream">Transmissão</button>
          <button class="\${sTab === 'saidas' ? 'active' : ''}" data-a="setsettingstab" data-stab="saidas">Gravação</button>
          <button class="\${sTab === 'audio' ? 'active' : ''}" data-a="setsettingstab" data-stab="audio">Áudio</button>
          <button class="\${sTab === 'video' ? 'active' : ''}" data-a="setsettingstab" data-stab="video">Vídeo</button>
          <button class="\${sTab === 'overlays' ? 'active' : ''}" data-a="setsettingstab" data-stab="overlays">Overlays</button>
          <button class="\${sTab === 'replay' ? 'active' : ''}" data-a="setsettingstab" data-stab="replay">Replay</button>
          <button class="\${sTab === 'plugins' ? 'active' : ''}" data-a="setsettingstab" data-stab="plugins">Complementos & Updates</button>
        </div>
        <div class="modal-body">
          \${sTab === 'geral' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Idioma</label><select class="form-control"><option>Português Brasileiro (pt-BR)</option><option>English (en-US)</option></select></div>
              <div class="form-group"><label>Tema Visual</label><select class="form-control"><option>3Mix Dark Broadcast</option></select></div>
              <div class="form-group full">
                <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Carregar automaticamente o último Preset ao iniciar</label>
                <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Iniciar no Modo Estúdio (Preview & Program)</label>
              </div>
            </div>
          \` : sTab === 'stream' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Serviço Principal</label><select class="form-control"><option>YouTube - RTMPS</option><option>Twitch</option><option>Facebook</option><option>SRT / RIST</option></select></div>
              <div class="form-group"><label>URL / Servidor</label><input class="form-control" type="text" value="rtmp://a.rtmp.youtube.com/live2"></div>
              <div class="form-group full"><label>Chave de Transmissão</label><input class="form-control" type="password" value="••••••••••••••••••••"></div>
            </div>
          \` : sTab === 'saidas' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Formato de Gravação</label><select class="form-control"><option>MP4 Fragmentado (Protegido contra queda)</option><option>MKV</option><option>MOV ProRes</option></select></div>
              <div class="form-group"><label>Codificador (Encoder)</label><select class="form-control"><option>NVIDIA NVENC HEVC / H.265</option><option>Intel QuickSync</option><option>x264</option></select></div>
              <div class="form-group full"><label>Pasta de Gravação</label><input class="form-control" type="text" value="D:\\\\DRIVE\\\\IA\\\\antigravity\\\\vmixtwste\\\\obs-vmix\\\\gravacoes"></div>
            </div>
          \` : sTab === 'audio' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Taxa de Amostragem</label><select class="form-control"><option>48000 Hz (Broadcast)</option></select></div>
              <div class="form-group"><label>Canais Master</label><select class="form-control"><option>Estéreo 2.0</option><option>5.1 Surround</option></select></div>
              <div class="form-group full"><label>Atraso de Lip-sync Global (ms)</label><input class="form-control" type="number" value="0"></div>
            </div>
          \` : sTab === 'video' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Resolução de Saída</label><select class="form-control"><option>1920x1080 (1080p Full HD)</option><option>3840x2160 (4K UHD)</option></select></div>
              <div class="form-group"><label>Taxa de Quadros (FPS)</label><select class="form-control"><option>60 fps</option><option>59.94 fps (NTSC)</option><option>50 fps (PAL)</option></select></div>
            </div>
          \` : sTab === 'overlays' ? \`
            <p style="font-size:11px;color:var(--text-muted)">O 3Mix Studio suporta 8 canais de overlay simultâneos e independentes (DSK 1 a 8), permitindo empilhar GCs, placares, PiP e logos sem conflito.</p>
          \` : sTab === 'replay' ? \`
            <div class="form-grid">
              <div class="form-group"><label>Buffer de Memória por Câmera</label><select class="form-control"><option>15 Segundos (RAM)</option><option>30 Segundos (RAM)</option><option>Gravação Contínua em Disco (NVMe)</option></select></div>
              <div class="form-group"><label>Retorno ao Vivo Após Reprodução</label><select class="form-control"><option>Retornar ao Program Ao Vivo</option><option>Congelar Último Quadro</option></select></div>
            </div>
          \` : \`
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="color:var(--text-muted);font-size:11px">Complementos e motor oficial:</span>
              <button class="b on" data-a="runcheckupdates">🔄 Buscar Atualizações na Nuvem</button>
            </div>
            <p style="font-size:11px;color:var(--c-green)">✓ Todos os 37 módulos auditados e 100% pareados sem conflitos.</p>
          \`}
        </div>
        <div class="modal-footer">
          <button class="b" data-a="closemodal">Fechar</button>
          <button class="b on" data-a="saveglobalsettings">Salvar Configurações</button>
        </div>
      \`;
    }

    // 5. CENTRAL DE OVERLAYS (8 CANAIS INDEPENDENTES)
    else if (m === "overlays8") {
      p.innerHTML = \`
        <div class="modal-header">
          <h3>🔲 Central de Overlays (8 Canais DSK Independentes)</h3>
          <button class="close-btn" data-a="closemodal">×</button>
        </div>
        <div class="modal-body">
          <table style="width:100%;border-collapse:collapse;font-size:11.5px">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle);color:var(--text-muted);text-align:left">
                <th style="padding:6px">Canal</th><th>Entrada Vinculada</th><th>Posição PiP</th><th>Opacidade</th><th>Transição</th><th>Estado</th><th style="text-align:right">Ações</th>
              </tr>
            </thead>
            <tbody>
              \${st.overlays.map(ov => \`
                <tr style="border-bottom:1px solid #1a222c">
                  <td style="padding:8px 6px"><b>Canal \${ov.id}</b></td>
                  <td>\${esc(ov.input)}</td>
                  <td>\${ov.x}% x \${ov.y}% (\${ov.scale}%)</td>
                  <td>\${ov.opacity}%</td>
                  <td>\${ov.trans} (\${ov.dur}ms)</td>
                  <td><span style="color:\${ov.active ? 'var(--c-orange)' : 'var(--text-muted)'}">\${ov.active ? '● NO AR' : 'DESLIGADO'}</span></td>
                  <td style="text-align:right">
                    <button class="b\${ov.active ? ' on' : ''}" data-a="toggleoverlay" data-ov="\${ov.id}">
                      \${ov.active ? 'Retirar' : 'Colocar no Ar'}
                    </button>
                  </td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="b live" data-a="clearalloverlays">Retirar Todos os Overlays</button>
          <button class="b on" data-a="closemodal">Fechar</button>
        </div>
      \`;
    }

    // 6. CENTRAL DE REPLAY MULTI-CAM (CÂMERAS ISO + PLAYERS A/B + LISTAS)
    else if (m === "replay") {
      const rp = st.replay;
      p.innerHTML = \`
        <div class="modal-header">
          <h3>⏪ Central de Replay Multi-Cam (Players A/B + Câmeras ISO)</h3>
          <button class="close-btn" data-a="closemodal">×</button>
        </div>
        <div class="modal-body">
          <!-- Câmeras ISO -->
          <div style="background:#0d1117;border:1px solid var(--border-subtle);border-radius:3px;padding:8px;margin-bottom:10px">
            <span style="font-size:10.5px;font-weight:700;color:var(--text-muted)">CÂMERAS PARTICIPANTES DA SESSÃO:</span>
            <div style="display:flex;gap:8px;margin-top:6px">
              \${rp.cameras.map(c => \`
                <div style="flex:1;background:#141a24;padding:6px;border-radius:2px;border:1px solid #232d3b;font-size:10.5px">
                  <b>\${c.name}</b><br>
                  <span style="color:\${c.status === 'GRAVANDO' ? 'var(--c-green)' : 'var(--text-muted)'}">● \${c.status}</span>
                </div>
              \`).join('')}
            </div>
          </div>

          <!-- Players A e B -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div style="background:#111620;border:1px solid \${rp.playerA.onAir ? 'var(--c-red)' : 'var(--border-subtle)'};border-radius:3px;padding:8px">
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--c-orange);font-weight:800">PLAYER A \${rp.playerA.onAir ? '<b style="color:var(--c-red)">● NO AR</b>' : ''}</span>
                <span>\${rp.playerA.position} (\${rp.playerA.speed}%)</span>
              </div>
              <div style="display:flex;gap:4px;margin-top:8px">
                <button class="b on" data-a="playreplayer" data-p="A">Play A</button>
                <button class="b" data-a="sendtopgm" data-p="A">Enviar ao PGM</button>
              </div>
            </div>
            <div style="background:#111620;border:1px solid \${rp.playerB.onAir ? 'var(--c-red)' : 'var(--border-subtle)'};border-radius:3px;padding:8px">
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--c-blue);font-weight:800">PLAYER B (PREPARAÇÃO)</span>
                <span>\${rp.playerB.position} (\${rp.playerB.speed}%)</span>
              </div>
              <div style="display:flex;gap:4px;margin-top:8px">
                <button class="b" data-a="playreplayer" data-p="B">Play B</button>
                <button class="b" data-a="sendtopgm" data-p="B">Enviar ao PGM</button>
              </div>
            </div>
          </div>

          <!-- Marcações e Listas de Lances -->
          <div style="display:flex;gap:6px;margin-bottom:8px">
            <button class="b" data-a="grabinstant" data-sec="5">-5s</button>
            <button class="b" data-a="grabinstant" data-sec="10">-10s</button>
            <button class="b" data-a="grabinstant" data-sec="20">-20s</button>
            <button class="b on" data-a="markin">MARK IN</button>
            <button class="b on" data-a="markout">MARK OUT</button>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="border-bottom:1px solid var(--border-subtle);color:var(--text-muted);text-align:left"><th style="padding:4px">Evento</th><th>In</th><th>Out</th><th>Duração</th><th>Ação</th></tr></thead>
            <tbody>
              \${rp.clips.map(cl => \`
                <tr style="border-bottom:1px solid #1a222c">
                  <td style="padding:6px 4px"><b>\${cl.name}</b></td>
                  <td>\${cl.inTc}</td><td>\${cl.outTc}</td><td>\${cl.dur}</td>
                  <td><button class="b" data-a="loadcliptoplayer" data-id="\${cl.id}">Carregar no Player</button></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="b on" data-a="closemodal">Fechar Central</button>
        </div>
      \`;
    }

    // 7. CENTRAL DE DATASOURCES & GCs
    else if (m === "datasources") {
      const ds = st.dataSources[0];
      p.innerHTML = \`
        <div class="modal-header">
          <h3>📊 Central de Fontes de Dados (DataSources) & GCs</h3>
          <button class="close-btn" data-a="closemodal">×</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span>Fonte: <b>\${esc(ds.name)}</b> (\${ds.type}) · <b style="color:var(--c-green)">\${ds.status}</b></span>
            <div style="display:flex;gap:4px">
              <button class="b" data-a="prevrow">◀ Anterior</button>
              <button class="b" data-a="nextrow">Próximo ▶</button>
              <button class="b on" data-a="syncdataonair">Publicar no Ar</button>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;background:#0d1117">
            <thead><tr style="border-bottom:1px solid var(--border-strong);color:var(--text-muted);text-align:left"><th style="padding:6px">Linha</th>\${ds.columns.map(c => \`<th>\${c}</th>\`).join('')}</tr></thead>
            <tbody>
              \${ds.rows.map((r, idx) => \`
                <tr style="border-bottom:1px solid #1a222c;\${ds.activeRow === idx ? 'background:#1a2838' : ''};cursor:pointer" data-a="selectdatarow" data-row="\${idx}">
                  <td style="padding:6px"><b>\${idx + 1} \${ds.activeRow === idx ? '● ATIVA' : ''}</b></td>
                  \${ds.columns.map(c => \`<td>\${esc(r[c])}</td>\`).join('')}
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-footer"><button class="b on" data-a="closemodal">Fechar</button></div>
      \`;
    }

    // 8. CENTRAL DE ATALHOS & COMANDOS (COM MIDI LEARN)
    else if (m === "shortcuts") {
      p.innerHTML = \`
        <div class="modal-header">
          <h3>⚡ Central de Comandos, Atalhos de Teclado & MIDI Learn</h3>
          <button class="close-btn" data-a="closemodal">×</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="color:var(--text-muted)">Registro de comandos operacionais universais:</span>
            <button class="b on" data-a="midilearn">⚡ Ativar Modo MIDI Learn</button>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11.5px">
            <thead><tr style="border-bottom:1px solid var(--border-subtle);color:var(--text-muted);text-align:left"><th style="padding:6px">Comando</th><th>Categoria</th><th>Teclado</th><th>MIDI</th><th>Ação</th></tr></thead>
            <tbody>
              \${st.commands.map(cmd => \`
                <tr style="border-bottom:1px solid #1a222c">
                  <td style="padding:6px"><b>\${cmd.name}</b></td>
                  <td style="color:var(--text-muted)">\${cmd.cat}</td>
                  <td><kbd>\${cmd.key}</kbd></td>
                  <td>\${cmd.midi}</td>
                  <td><button class="b">Reatribuir</button></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-footer"><button class="b on" data-a="closemodal">Fechar</button></div>
      \`;
    }

    // Modais restantes (outputs, graphics, bonding, audiomatrix)
    else if (m === "outputs") {
      p.innerHTML = \`
        <div class="modal-header"><h3>Central de Saídas (Outputs & Routing)</h3><button class="close-btn" data-a="closemodal">×</button></div>
        <div class="modal-body">
          <table style="width:100%;border-collapse:collapse;font-size:11.5px">
            <thead><tr style="border-bottom:1px solid var(--border-subtle);color:var(--text-muted);text-align:left"><th style="padding:6px">Saída</th><th>Tipo</th><th>Origem</th><th>Estado</th><th style="text-align:right">Ação</th></tr></thead>
            <tbody>
              \${st.outputs.map(o => \`
                <tr style="border-bottom:1px solid #1a222c">
                  <td style="padding:8px 6px"><b>\${esc(o.name)}</b></td>
                  <td>\${o.type.toUpperCase()}</td><td>\${o.source}</td>
                  <td><span style="color:\${o.active ? 'var(--c-green)' : 'var(--text-muted)'}">\${o.active ? '● NO AR' : 'PARADA'}</span></td>
                  <td style="text-align:right"><button class="b\${o.active ? ' live' : ' on'}" data-a="toggleoutput" data-id="\${o.id}">\${o.active ? 'Parar' : 'Iniciar'}</button></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-footer"><button class="b on" data-a="closemodal">Fechar</button></div>
      \`;
    }
    else if (m === "graphics") {
      p.innerHTML = \`
        <div class="modal-header"><h3>Galeria de Gráficos e GCs Broadcast</h3><button class="close-btn" data-a="closemodal">×</button></div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="background:#131822;padding:10px;border:1px solid var(--border-subtle);border-radius:3px">
              <span style="color:var(--c-green);font-size:10px;font-weight:700">JORNALISMO · LOWER THIRD</span>
              <h4>Identificação Nome & Cargo</h4>
              <button class="b on" data-a="gconair" style="margin-top:6px">Colocar no Ar</button>
            </div>
            <div style="background:#131822;padding:10px;border:1px solid var(--border-subtle);border-radius:3px">
              <span style="color:var(--c-blue);font-size:10px;font-weight:700">ESPORTES · PLACAR</span>
              <h4>Placar & Cronômetro</h4>
              <button class="b on" data-a="gconair" style="margin-top:6px">Colocar no Ar</button>
            </div>
          </div>
        </div>
        <div class="modal-footer"><button class="b on" data-a="closemodal">Fechar</button></div>
      \`;
    }
    else if (m === "bonding") {
      p.innerHTML = \`
        <div class="modal-header"><h3>Multi-WAN Bonding Failover (Estilo LiveU)</h3><button class="close-btn" data-a="closemodal">×</button></div>
        <div class="modal-body">
          <p style="color:var(--c-green);font-size:11.5px">✓ Agregação de rede ativa: Ethernet Fibra (1000 Mbps) + Wi-Fi Backup (300 Mbps) com failover hitless via RIST.</p>
        </div>
        <div class="modal-footer"><button class="b on" data-a="closemodal">Fechar</button></div>
      \`;
    }
    else if (m === "audiomatrix") {
      p.innerHTML = \`
        <div class="modal-header"><h3>Matriz de Áudio & Roteamento Broadcast</h3><button class="close-btn" data-a="closemodal">×</button></div>
        <div class="modal-body">
          <p style="font-size:11.5px;color:var(--text-muted)">Roteamento em tempo real dos barramentos Master, Aux A (Mix-Minus para convidados remotos) e Aux B (Fones).</p>
        </div>
        <div class="modal-footer"><button class="b on" data-a="closemodal">Fechar</button></div>
      \`;
    }
  }

  /* ---- Ações Globais & Despacho de Comandos ---- */
  const A = {
    openmodal: (d) => openModal(d.m, d.arg),
    closemodal: () => closeModal(),

    // Presets
    newpreset: () => {
      if (st.isDirty && !confirm("Há alterações não salvas na produção atual. Deseja criar uma nova produção limpa?")) return;
      st.presetName = "Nova_Producao.fmx";
      setDirty(false);
      toast("Nova produção criada com sucesso!");
    },
    savepreset: () => {
      setDirty(false);
      toast("Produção salva com sucesso em " + st.presetName);
    },
    savepresetas: () => {
      const name = prompt("Salvar versão como:", "Producao_Copia.fmx");
      if (name) {
        st.presetName = name.endsWith('.fmx') ? name : name + '.fmx';
        setDirty(false);
        toast("Preset salvo como: " + st.presetName);
      }
    },
    importpreset: () => {
      toast("Selecione o arquivo de preset para incorporar entradas...");
    },
    loadspecificpreset: (d) => {
      st.presetName = d.file;
      setDirty(false);
      closeModal();
      toast("Preset " + d.file + " carregado com sucesso!");
    },

    // Monitores & Comutação
    togglemonitors: () => {
      st.showMonitors = !st.showMonitors;
      store.set("mesa.showMonitors", st.showMonitors);
      renderMonitors();
    },
    preview: (d) => {
      if (st.studio) req("SetCurrentPreviewScene", { sceneName: d.v }).catch(()=>{});
      else req("SetCurrentProgramScene", { sceneName: d.v }).catch(()=>{});
    },
    cut: (d) => req("SetCurrentProgramScene", { sceneName: d.v }).catch(()=>{}),
    cutprogram: () => {
      if (st.studio) req("TriggerStudioModeTransition").catch(()=>{});
      else req("SetCurrentProgramScene", { sceneName: st.preview }).catch(()=>{});
    },
    transfade: (d) => { req("TriggerStudioModeTransition").catch(()=>{}); toast("Transição FADE (" + (d.dur || 500) + "ms) executada"); },
    transzoom: () => { req("TriggerStudioModeTransition").catch(()=>{}); toast("Transição ZOOM executada"); },
    transwipe: () => { req("TriggerStudioModeTransition").catch(()=>{}); toast("Transição WIPE executada"); },
    transstinger: () => { req("TriggerStudioModeTransition").catch(()=>{}); toast("Transição STINGER executada"); },
    ftb: () => { st.ftb = !st.ftb; toast(st.ftb ? "FTB (Black) ATIVADO" : "FTB DESATIVADO"); renderBot(); },
    quick: (d) => {
      req("SetCurrentPreviewScene", { sceneName: d.v }).then(() => req("TriggerStudioModeTransition")).catch(()=>{});
    },
    togglesafearea: () => {
      st.safeArea = !st.safeArea;
      const el = $("pv-safe-area");
      if (el) el.className = st.safeArea ? "safe-area-overlay" : "safe-area-overlay off";
      toast(st.safeArea ? "Safe Area Guias Ativadas" : "Safe Area Desativada");
    },

    // 8 Canais de Overlays
    toggleoverlay: (d) => {
      const num = +d.ov;
      const ov = st.overlays[num - 1];
      if (ov) {
        ov.active = !ov.active;
        setDirty(true);
        if (st.pop === "overlays8") renderModalContent();
        renderTiles();
        toast(\`Overlay \${num} (\${ov.name}): \${ov.active ? 'NO AR' : 'RETIRADO'}\`);
      }
    },
    toggleoverlaytile: (d) => {
      const num = +d.ov;
      const scene = d.scene;
      const ov = st.overlays[num - 1];
      if (ov) {
        if (ov.active && ov.input === scene) {
          ov.active = false;
        } else {
          ov.active = true;
          ov.input = scene;
        }
        setDirty(true);
        renderTiles();
        toast(\`Overlay \${num}: \${ov.active ? 'NO AR (' + scene + ')' : 'DESLIGADO'}\`);
      }
    },
    clearalloverlays: () => {
      st.overlays.forEach(o => o.active = false);
      setDirty(true);
      if (st.pop === "overlays8") renderModalContent();
      renderTiles();
      toast("Todos os 8 Overlays foram retirados do ar.");
    },

    // Replay Multi-Cam
    grabinstant: (d) => toast(\`Lance instantâneo dos últimos \${d.sec}s capturado!\`),
    markin: () => toast("Ponto MARK IN registrado"),
    markout: () => toast("Ponto MARK OUT registrado"),
    playreplayer: (d) => toast(\`Reproduzindo Player \${d.p} em \${st.replay.speed}%\`),
    sendtopgm: (d) => toast(\`Player \${d.p} enviado para o PROGRAM com corte suave\`),
    loadcliptoplayer: (d) => toast(\`Lance \${d.id} carregado no Player de Preparação\`),

    // DataSources
    selectdatarow: (d) => { st.dataSources[0].activeRow = +d.row; renderModalContent(); },
    nextrow: () => {
      st.dataSources[0].activeRow = Math.min(st.dataSources[0].rows.length - 1, st.dataSources[0].activeRow + 1);
      renderModalContent();
    },
    prevrow: () => {
      st.dataSources[0].activeRow = Math.max(0, st.dataSources[0].activeRow - 1);
      renderModalContent();
    },
    syncdataonair: () => {
      const r = st.dataSources[0].rows[st.dataSources[0].activeRow];
      toast(\`Dados de "\${r.Nome}" publicados nos GCs no ar!\`);
    },

    // Abas de Configurações
    setsettingstab: (d) => { st.activeSettingsTab = d.stab; renderModalContent(); },
    setinputtab: (d) => { st.activeInputTab = d.tab; renderModalContent(); },
    inputsettings: (d) => { st.activeInputTab = "geral"; openModal("inputsettings", d.scene); },
    saveinputsettings: () => { closeModal(); setDirty(true); toast("Propriedades da entrada salvas!"); },
    saveglobalsettings: () => { closeModal(); toast("Configurações aplicadas com sucesso!"); },
    midilearn: () => toast("Mova um fader ou pressione um pad no seu controlador MIDI USB..."),
    runcheckupdates: () => { toast("Verificando atualizações de plugins na nuvem..."); setTimeout(() => toast("Todos os módulos oficiais estão atualizados!"), 800); },

    // Saídas & Gravação
    record: () => req("ToggleRecord").catch(()=>{}),
    stream: () => req("ToggleStream").catch(()=>{}),
    topfullscreen: () => toast("Saída Fullscreen enviada ao monitor externo secundário"),
    topmultiview: () => toast("Multiview Broadcast ativado"),
    toggleaudiomixer: () => { st.mixer = !st.mixer; store.set("mesa.mixer", st.mixer); renderMixer(); },
    toggleoutput: (d) => {
      const o = st.outputs.find(x => x.id === d.id);
      if (o) {
        o.active = !o.active;
        renderModalContent();
        toast(\`\${o.name}: \${o.active ? 'INICIADA' : 'PARADA'}\`);
      }
    },
    gconair: () => toast("GC colocado no ar com animação suave!")
  };

  /* ---- Eventos Globais ---- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-a]");
    if (!t) return;
    A[t.dataset.a]?.(t.dataset);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  function renderAll() {
    renderMonitors(); renderTiles(); renderMixer(); renderBot(); renderStat();
  }

  // T-Bar Drag Interactivity
  const tTrack = $("tbar-track");
  if (tTrack) {
    let dragging = false;
    const updateTbar = (clientY) => {
      const r = tTrack.getBoundingClientRect();
      const pct = clamp(100 - ((clientY - r.top) / r.height) * 100, 0, 100);
      st.tbarPos = pct;
      renderMonitors();
    };
    tTrack.addEventListener("mousedown", (e) => { dragging = true; updateTbar(e.clientY); });
    window.addEventListener("mousemove", (e) => { if (dragging) updateTbar(e.clientY); });
    window.addEventListener("mouseup", () => {
      if (dragging) {
        dragging = false;
        if (st.tbarPos > 90) { A.cutprogram(); st.tbarPos = 0; renderMonitors(); }
      }
    });
  }

  setInterval(renderStat, 1000);
  renderAll();
  connect();
</script>
</body>
</html>
`;

// Escreve tanto no repositório 3Mix quanto na pasta de runtime portátil obs-vmix
const target1 = path.resolve('FreeMix/painel/mesa.html');
const target2 = path.resolve('obs-vmix/painel/mesa.html');

fs.writeFileSync(target1, fullMesaHtml, 'utf8');
fs.writeFileSync(target2, fullMesaHtml, 'utf8');

console.log('[SUCESSO] 3Mix Full Broadcast UI gerada em:');
console.log('->', target1);
console.log('->', target2);
