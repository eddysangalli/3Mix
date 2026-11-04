'use strict';
// One settings module for the 3Mix panel. Every value shown is read from the engine (GET /api/settings); every change
// stays in a local draft until Aplicar is pressed, and each category is written back with the real settings_apply
// command of this installation. Categories with an editor of their own are rendered inside this window by a same-origin
// iframe that loads the real page; nothing is duplicated and opening a page never starts any output.
(() => {
  const E = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (el, html) => { if (el && el._html !== html) { el.innerHTML = html; el._html = html; } };

  // ---- vocabulary shown to the operator (values sent to the engine stay the engine's own) ----
  const WORDS = {
    Normal: 'Normal', AboveNormal: 'Acima do normal', High: 'Alta', BelowNormal: 'Abaixo do normal', Idle: 'Ociosa',
    Partial: 'Limitada (TV)', Full: 'Completa (PC)', Simple: 'Simples', Advanced: 'Avançado',
    Time: 'Tempo', Size: 'Tamanho', Manual: 'Manual', Stereo: 'Estéreo', Mono: 'Mono',
    bilinear: 'Bilinear (mais leve)', bicubic: 'Bicúbico', lanczos: 'Lanczos (mais nítido)', area: 'Área',
    NeverDisableHotkeys: 'Sempre ativos', DisableHotkeysInFocus: 'Desligados com o 3Mix em foco',
    DisableHotkeysOutOfFocus: 'Desligados com o 3Mix fora de foco', none: 'Nenhum',
    NV12: 'NV12 (8 bits 4:2:0)', I420: 'I420 (8 bits 4:2:0)', I444: 'I444 (8 bits 4:4:4)', P010: 'P010 (10 bits 4:2:0)',
    I010: 'I010 (10 bits 4:2:0)', P216: 'P216 (16 bits 4:2:2)', P416: 'P416 (16 bits 4:4:4)', BGRA: 'BGRA (8 bits RGB)',
    '601': 'BT.601', '709': 'BT.709', sRGB: 'sRGB', '2100PQ': 'BT.2100 PQ (HDR)', '2100HLG': 'BT.2100 HLG (HDR)',
    IPv4: 'Somente IPv4', IPv6: 'Somente IPv6', 'IPv4+IPv6': 'IPv4 e IPv6',
    flv: 'FLV', mkv: 'MKV', mp4: 'MP4', mov: 'MOV', hybrid_mp4: 'MP4 híbrido', hybrid_mov: 'MOV híbrido',
    fragmented_mp4: 'MP4 fragmentado', fragmented_mov: 'MOV fragmentado', mpegts: 'MPEG-TS', hls: 'HLS',
    Small: 'Alta · arquivo médio', HQ: 'Muito alta · arquivo grande', Lossless: 'Sem perdas · arquivo enorme',
    Stream: 'Igual à transmissão',
  };
  const FPS = [['24', '24'], ['25', '25'], ['30', '30'], ['50', '50'], ['60', '60'], ['24000/1001', '23,976'], ['30000/1001', '29,97'], ['60000/1001', '59,94']];
  const SIZE_PRESETS = [
    { w: 1280, h: 720, label: '720p' },
    { w: 1920, h: 1080, label: '1080p' },
    { w: 3840, h: 2160, label: '4K UHD' },
    { w: 1080, h: 1920, label: 'Vertical' },
  ];

  // ---- the tree of the window: four groups, the operator's words and the mockup's icons ----
  const LABELS = {
    video: 'Vídeo da produção', audio: 'Áudio da produção', color: 'Cor da produção',
    recording: 'Gravação', streaming: 'Transmissão', outputs: 'Monitores', returns: 'Retornos SRT e N-1', aux: 'Matriz AUX', encoders: 'Encoder',
    replay: 'Replay', dsk: 'DSK', multiview: 'Multiview', shortcuts: 'Atalhos', modulos: 'Módulos',
    patch: 'Patch de Sinais', preflight: 'Pre-Flight', diagnostico: 'Diagnóstico do computador',
    workspace: 'Interface', performance: 'Desempenho', remote: 'Remoto', network: 'Rede Multipath', automation: 'Automação',
    recovery: 'Recuperação', about: 'Sobre e suporte',
    streamMultistream: 'MultiStream', streamExternal: 'Saídas de rede',
    // sub-tabs and aliases kept for old links
    mixer: 'Mixer e roteamento', outputAdvanced: 'Saída avançada', files: 'Arquivos e divisão',
    audioTracks: 'Trilhas de áudio', networkOutput: 'Rede da transmissão', broadcastDelay: 'Atraso e DUMP', startstop: 'Ao iniciar e parar',
    projectors: 'Projetores e tela cheia', appearance: 'Texto e densidade', general: 'Janela e encaixe',
    plugins: 'Ferramentas dos plugins', advanced: 'Motor e prioridade',
  };
  const GROUPS = [
    { id: 'producao', title: 'Produção', items: ['video', 'audio', 'color'] },
    { id: 'saidas', title: 'Saídas', items: ['recording', 'streaming', 'outputs', 'returns', 'aux', 'encoders'] },
    { id: 'operacao', title: 'Operação', items: ['replay', 'dsk', 'multiview', 'shortcuts', 'patch', 'preflight'] },
    { id: 'sistema', title: 'Sistema', items: ['workspace', 'modulos', 'performance', 'remote', 'network', 'automation', 'recovery'] },
    { id: 'sobre', title: 'Sobre', items: ['about'] },
  ];
  const ICONS = {
    video: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    color: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="8" r="1.4"/><circle cx="8" cy="12" r="1.4"/><circle cx="12" cy="16" r="1.4"/><circle cx="16" cy="12" r="1.4"/></svg>',
    recording: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    streaming: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    outputs: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4M15 9l3 2-3 2"/></svg>',
    encoders: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/></svg>',
    dsk: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1"/><path d="m7 15 3-6 3 6M8 13h4M15 9h2a2 2 0 0 1 0 4h-2V9Z"/></svg>',
    multiview: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="7"/><rect x="14" y="4" width="7" height="7"/><rect x="3" y="15" width="7" height="5"/><rect x="14" y="15" width="7" height="5"/></svg>',
    shortcuts: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/></svg>',
    patch: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2"/><circle cx="18" cy="17" r="2"/><path d="M8 7h5a3 3 0 0 1 3 3v4M16 17H11a3 3 0 0 1-3-3V8"/></svg>',
    preflight: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 2 2 4-4M8 15h8"/></svg>',
    diagnostico: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 11l2-2 2 3 2-4 2 3h2"/></svg>',
    network: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 11l10-4M7 13l10 4"/></svg>',
    returns: '<svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 5 5"/></svg>',
    aux: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="1.6" fill="currentColor"/><circle cx="15" cy="12" r="1.6" fill="currentColor"/><circle cx="7" cy="17" r="1.6" fill="currentColor"/></svg>',
    workspace: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
    modulos: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke-dasharray="2 2"/></svg>',
    performance: '<svg viewBox="0 0 24 24"><path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/><circle cx="12" cy="14" r="1.5"/></svg>',
    remote: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    automation: '<svg viewBox="0 0 24 24"><path d="M4 6h10M4 12h16M4 18h10"/><circle cx="17" cy="6" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    recovery: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
    diagnostics: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
    about: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  };
  // Sub-tabs inside a consolidated category. This keeps the sidebar at 18 entries.
  const SUBTABS = {
    recording: [['recording', 'Básico'], ['files', 'Arquivos'], ['audioTracks', 'Trilhas'], ['startstop', 'Ao iniciar/parar'], ['outputAdvanced', 'Avançado']],
    streaming: [['streaming', 'Básico'], ['streamMultistream', 'MultiStream'], ['streamExternal', 'Saídas de rede'], ['networkOutput', 'Rede'], ['broadcastDelay', 'Atraso e DUMP'], ['audioTracks', 'Trilhas'], ['startstop', 'Ao iniciar/parar'], ['outputAdvanced', 'Avançado']],
    workspace: [['workspace', 'Layout da mesa'], ['appearance', 'Texto e densidade'], ['general', 'Janela e encaixe']],
    performance: [['performance', 'Geral'], ['advanced', 'Motor e prioridade'], ['diagnostico', 'Diagnóstico do computador']],
  };
  const PARENT = {
    files: 'recording', audioTracks: 'recording', startstop: 'recording', outputAdvanced: 'recording',
    networkOutput: 'streaming', broadcastDelay: 'streaming', streamMultistream: 'streaming', streamExternal: 'streaming',
    appearance: 'workspace', general: 'workspace', advanced: 'performance', diagnostico: 'performance',
    projectors: 'multiview', plugins: 'performance',
  };
  // Editor windows of the program, opened on purpose and one route each.
  const OPEN = {
    mixer: ['/audio', 'Abrir mixer'],
    outputs: ['/saidas?transport=monitors', 'Abrir monitores'],
    returns: ['/retornos', 'Abrir retornos'],
    aux: ['/aux', 'Abrir Matriz AUX'],
    replay: ['/replay?view=settings', 'Abrir Replay'],
    dsk: ['/overlays', 'Abrir DSK'],
    multiview: ['/multiview-montagem.html', 'Abrir montagem'],
    modulos: ['/modulos', 'Abrir módulos'],
    shortcuts: ['/atalhos', 'Abrir atalhos'],
    patch: ['/patch', 'Abrir Patch de Sinais'],
    preflight: ['/preflight', 'Abrir Pre-Flight'],
    diagnostico: ['/primeira-execucao', 'Abrir diagnóstico'],
    remote: ['/hub', 'Abrir acesso remoto'],
    network: ['/rede', 'Abrir Rede Multipath'],
    automation: ['/macros', 'Abrir automação'],
    streamMultistream: ['/transmitir', 'Abrir MultiStream'],
    streamExternal: ['/externo', 'Abrir saídas de rede'],
    recovery: ['/recuperacao', 'Abrir recuperação'],
    about: ['/sobre.html', 'Abrir Sobre e suporte'],
  };
  // Categoria em que o botão do topo abre outra coisa: a montagem do Multiview se edita aqui, o vídeo fica na janela.
  const WINDOW_ACTION = { multiview: ['/multiview', 'Abrir Multiview'] };
  // Pages rendered inside the central through a same-origin iframe. Each entry loads the page's real route, so there
  // is one implementation only. The injected style removes the embedded page's own title bar / close chrome, never its
  // controls or scripts. Routes are the same ones the standalone window uses; ?embed=1 is kept for pages that may
  // implement an embed mode later.
  const EMBED_BASE_CSS = `
    html.embed-3mix { display: block !important; height: 100% !important; margin: 0 !important; padding: 0 !important; }
    html.embed-3mix, html.embed-3mix body { min-height: 0 !important; }
    html.embed-3mix body { height: 100% !important; margin: 0 !important; }
    html.embed-3mix #message:empty { display: none !important; }
    html.embed-3mix #close-btn,
    html.embed-3mix .vd-bar button[onclick*="FreeMixClosePanel"],
    html.embed-3mix .vd-footer button#btn-close { display: none !important; }
    html.embed-3mix .vd-bar { position: static !important; }
  `;
  // Pintura das páginas que ainda têm folha própria (Monitores, Matriz AUX, MultiStream, Saídas de rede). As demais usam
  // 3mix-padrao.css direto. Mesma paleta de Configurações: grafite neutro; azul para seleção; verde/vermelho só para estado.
  const EMBED_GRAFITE_IDS = new Set(['outputs', 'aux', 'streamMultistream', 'streamExternal']);
  const EMBED_GRAFITE_CSS = `
    /* ---- paleta grafite da suíte ---- */
    html.embed-3mix {
      --bg:#202020; --bg-gradient:none; --panel:#252525; --panel-card:#1d1d1d; --panel-hover:#2d2d2d;
      --line:#414141; --line-light:#555555; --text:#ededed; --text-bright:#ffffff; --muted:#8d8d8d;
      --accent:#2f6fed; --green:#2f9e5f; --green-hover:#2f9e5f; --red:#c05046; --red-hover:#a8443c; --orange:#c9a227;
      --card-bg:#252525; --border-color:#414141; color-scheme:dark;
    }
    html.embed-3mix, html.embed-3mix body { background:#202020 !important; background-image:none !important; color:#ededed !important; }
    html.embed-3mix body.vd { background:#202020 !important; }

    /* ---- tipografia: título 22 · seção 16 · labels 13 · corpo 14 ---- */
    html.embed-3mix body { font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif !important; font-size:14px !important; line-height:1.45 !important; }
    html.embed-3mix h1 { font-size:22px !important; line-height:24px !important; font-weight:700 !important; letter-spacing:-.2px !important; color:#fff !important; }
    html.embed-3mix h2 { font-size:16px !important; line-height:18px !important; font-weight:700 !important; letter-spacing:0 !important; text-transform:none !important; color:#fff !important; border-left:2px solid #414141 !important; padding-left:8px !important; }
    html.embed-3mix h3 { font-size:14px !important; font-weight:700 !important; color:#fff !important; }
    html.embed-3mix label, html.embed-3mix legend, html.embed-3mix th, html.embed-3mix .vd-row > span:first-child { font-size:13px !important; }
    html.embed-3mix small, html.embed-3mix .muted, html.embed-3mix .vd-note, html.embed-3mix .ext-sub, html.embed-3mix .field-help { font-size:12px !important; }

    /* ---- superfícies ---- */
    html.embed-3mix section, html.embed-3mix .card, html.embed-3mix .ext-protocol, html.embed-3mix details.ext-other,
    html.embed-3mix .vd-window, html.embed-3mix .vd-body, html.embed-3mix .content, html.embed-3mix .workspace nav {
      background:#252525 !important; border:1px solid #414141 !important; box-shadow:none !important;
    }
    html.embed-3mix .vd-bar, html.embed-3mix .vd-strip, html.embed-3mix .vd-status, html.embed-3mix header {
      background:#232323 !important; border-color:#414141 !important; box-shadow:none !important;
    }
    html.embed-3mix fieldset { background:#252525 !important; border:1px solid #414141 !important; }
    html.embed-3mix legend { color:#8d8d8d !important; }
    html.embed-3mix table { border:1px solid #414141 !important; }
    html.embed-3mix th { background:#232323 !important; color:#8d8d8d !important; border-bottom:1px solid #414141 !important; }
    html.embed-3mix td { background:#252525 !important; color:#ededed !important; border-bottom:1px solid #2d2d2d !important; }
    html.embed-3mix tr:hover td { background:#1d1d1d !important; }
    html.embed-3mix .vd-status tr.vd-sel td { background:#33383a !important; }

    /* ---- campos 36 px ---- */
    html.embed-3mix input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),
    html.embed-3mix select, html.embed-3mix textarea {
      height:36px !important; min-height:36px !important; background:#1d1d1d !important; border:1px solid #414141 !important;
      color:#ededed !important; border-radius:3px !important; padding:6px 10px !important; font-size:14px !important;
    }
    html.embed-3mix textarea { height:auto !important; min-height:72px !important; }
    html.embed-3mix input:focus, html.embed-3mix select:focus, html.embed-3mix textarea:focus {
      border-color:#2f6fed !important; box-shadow:0 0 0 3px rgba(47,111,237,.18) !important; outline:none !important;
    }
    html.embed-3mix input:disabled, html.embed-3mix select:disabled, html.embed-3mix textarea:disabled {
      background:#191919 !important; color:#8d8d8d !important; border-color:#2d2d2d !important;
    }
    html.embed-3mix input::placeholder { color:#777777 !important; }
    html.embed-3mix input[type=checkbox], html.embed-3mix input[type=radio] { accent-color:#2f6fed !important; }
    html.embed-3mix input[type=range] { accent-color:#2f6fed !important; background:#2d2d2d !important; }

    /* ---- botões: grafite/neutro ---- */
    html.embed-3mix button, html.embed-3mix input[type=button], html.embed-3mix input[type=submit] {
      background:#2d2d2d !important; background-image:none !important; border:1px solid #555555 !important;
      border-radius:3px !important; color:#ededed !important; box-shadow:none !important; text-shadow:none !important;
    }
    html.embed-3mix button:hover:not(:disabled) { background:#3a3a3a !important; border-color:#6a6a6a !important; color:#fff !important; }
    html.embed-3mix button:active:not(:disabled) { background:#191919 !important; }
    html.embed-3mix button:disabled { background:#232323 !important; border-color:#2d2d2d !important; color:#8d8d8d !important; opacity:.55 !important; }
    /* ação primária / seleção: destaque grafite (nunca o verde de outro produto) */
    html.embed-3mix button.on, html.embed-3mix button.selected, html.embed-3mix button.active,
    html.embed-3mix button.vd-on, html.embed-3mix .preview, html.embed-3mix .mv-btn.active,
    html.embed-3mix .channel-tabs button.active, html.embed-3mix .dve-grid button.active,
    html.embed-3mix .vd-nums button[aria-selected="true"], html.embed-3mix .vd-nums button.vd-on,
    html.embed-3mix .output-navigation button[aria-selected="true"], html.embed-3mix .workspace nav button.selected {
      background:#3a3a3a !important; background-image:none !important; border-color:#6a6a6a !important;
      color:#fff !important; box-shadow:inset 0 -2px #2f6fed !important;
    }
    html.embed-3mix button.on:hover:not(:disabled), html.embed-3mix button.vd-on:hover:not(:disabled),
    html.embed-3mix .mv-btn.active:hover:not(:disabled), html.embed-3mix .channel-tabs button.active:hover:not(:disabled),
    html.embed-3mix .dve-grid button.active:hover:not(:disabled) { background:#454545 !important; border-color:#7a7a7a !important; }
    /* ações destrutivas/parar: também neutras; vermelho fica para o estado no ar */
    html.embed-3mix button.vd-warn, html.embed-3mix button.vd-air,
    html.embed-3mix .action-btn-air, html.embed-3mix .action-btn-off, html.embed-3mix .kill-all-btn {
      background:#2d2d2d !important; background-image:none !important; border:1px solid #555555 !important;
      color:#ededed !important; box-shadow:none !important;
    }
    html.embed-3mix button.vd-warn:hover:not(:disabled), html.embed-3mix button.vd-air:hover:not(:disabled),
    html.embed-3mix .action-btn-air:hover:not(:disabled), html.embed-3mix .action-btn-off:hover:not(:disabled),
    html.embed-3mix .kill-all-btn:hover:not(:disabled) { background:#3a3a3a !important; border-color:#6a6a6a !important; color:#fff !important; }

    /* ---- estado operacional real continua colorido ---- */
    html.embed-3mix .badge-on { background:#3a2725 !important; border:1px solid #61403c !important; color:#e0b6b0 !important; padding:2px 8px !important; border-radius:3px !important; font-size:11px !important; font-weight:700 !important; }
    html.embed-3mix .badge-off { background:#1d1d1d !important; border:1px solid #414141 !important; color:#8d8d8d !important; padding:2px 8px !important; border-radius:3px !important; font-size:11px !important; }
    html.embed-3mix .channel-tabs button.on-air { border-left:3px solid #c05046 !important; }
    html.embed-3mix .ext-state { background:#1d1d1d !important; border:1px solid #414141 !important; color:#b0b0b0 !important; }
    html.embed-3mix .ext-state.live { background:#3a2725 !important; border-color:#61403c !important; color:#e0b6b0 !important; }
    html.embed-3mix .ext-state.error { background:#2b2114 !important; border-color:#6b5320 !important; color:#f3c886 !important; }
    html.embed-3mix .vd-nums button.vd-live { border-color:#c05046 !important; }
    html.embed-3mix .vd-status .vd-air-text, html.embed-3mix .vd-status .ext-sending { color:#d99a92 !important; }
    html.embed-3mix .vd-status .vd-ok-text { color:#9bc3a1 !important; }
    html.embed-3mix .vd-msg.vd-error, html.embed-3mix #message.error, html.embed-3mix .hint-note { color:#d99a92 !important; }
    html.embed-3mix .vd-msg.vd-ok, html.embed-3mix #message.ok { color:#9bc3a1 !important; }
    html.embed-3mix #connection { background:#223026 !important; border:1px solid #3d5b44 !important; color:#9bc3a1 !important; }
    html.embed-3mix #connection::before { background:#2f9e5f !important; box-shadow:none !important; }

    /* ---- links e cards ---- */
    html.embed-3mix a { color:#cfcfcf !important; }
    html.embed-3mix a:hover { color:#fff !important; }
    html.embed-3mix a.card { background:#252525 !important; border:1px solid #414141 !important; color:#ededed !important; box-shadow:none !important; border-radius:4px !important; transform:none !important; }
    html.embed-3mix a.card:hover { background:#1d1d1d !important; border-color:#555555 !important; color:#fff !important; transform:none !important; }
    /* chip "3Mix Modular Studio" e destaques iguais: grafite como qualquer outro card */
    html.embed-3mix .grid a.card { border-color:#414141 !important; box-shadow:none !important; }

    /* ---- ajustes por página ---- */
    html.embed-3mix #items button { height:26px !important; background:transparent !important; border:0 !important; border-bottom:1px solid #2d2d2d !important; border-radius:0 !important; color:#ededed !important; box-shadow:none !important; }
    html.embed-3mix #items button:hover { background:#1d1d1d !important; }
    html.embed-3mix details summary { color:#ededed !important; }
    html.embed-3mix details summary:hover { color:#fff !important; }
    html.embed-3mix .vd-check, html.embed-3mix .vd-row > span:first-child { color:#b0b0b0 !important; }
    html.embed-3mix .vd-check input { accent-color:#8d8d8d !important; }
    html.embed-3mix .ext-strip .vd-title { display:none !important; }
    html.embed-3mix .vd-nums button { background:#1d1d1d !important; border:1px solid #414141 !important; color:#b0b0b0 !important; }
    html.embed-3mix .ext-protocol-head h2 { font-size:16px !important; }
    html.embed-3mix .matrix-table th, html.embed-3mix .matrix-table td { border-bottom:1px solid #414141 !important; }
    html.embed-3mix img.qr { background:#fff !important; }
  `;
  const EMBED_CHROME = {
    replay: `
      html.embed-3mix body.vd { display:block !important; padding:0 !important; height:100% !important; overflow:hidden !important; background:#11151c !important; }
      html.embed-3mix .vd-app-window { width:100% !important; max-width:none !important; height:100% !important; min-height:0 !important; max-height:none !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; }
      html.embed-3mix .vd-sidebar-header { display:none !important; }
      html.embed-3mix .vd-sidebar { padding-top:10px !important; }
      html.embed-3mix .vd-footer { height:34px !important; min-height:34px !important; padding:0 12px !important; }
      html.embed-3mix .vd-footer-left > a,
      html.embed-3mix .vd-footer-right { display:none !important; }
    `,
    dsk: '', multiview: '', shortcuts: '', remote: '', network: '', automation: '', modulos: '', recovery: '', about: '', patch: '', preflight: '', returns: '',
    diagnostico: `
      html.embed-3mix body.p3 { grid-template-rows: 1fr auto !important; height: 100% !important; }
      html.embed-3mix .pe-top { display: none !important; }
    `,
    // Monitores (saidas.html?transport=monitors): só monitores e câmera virtual. MultiStream pertence a Transmissão e a
    // Matriz AUX tem entrada própria; a navegação e os links de outras seções não aparecem aqui.
    outputs: `
      html.embed-3mix #monitors-panel { max-width:820px; }
      html.embed-3mix #monitors-panel h2 { border:0 !important; padding:0 !important; }
      html.embed-3mix body { overflow:auto !important; height:100% !important; }
      html.embed-3mix body > header { display:none !important; }
      html.embed-3mix main { max-width:none !important; padding:16px 20px 24px !important; }
    `,
    aux: `
      html.embed-3mix body { overflow:auto !important; height:100% !important; }
      html.embed-3mix body > header { display:none !important; }
      html.embed-3mix main { max-width:none !important; padding:2px 2px 12px !important; }
    `,
    streamMultistream: `
      html.embed-3mix body { overflow:auto !important; height:100% !important; }
      html.embed-3mix .vd-window { width:100% !important; max-width:none !important; height:100% !important; min-height:0 !important; margin:0 !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; display:flex !important; flex-direction:column !important; }
      html.embed-3mix .vd-body { flex:1 1 auto !important; min-height:0 !important; overflow-y:auto !important; }
      html.embed-3mix .vd-bar { position:static !important; }
    `,
    streamExternal: `
      html.embed-3mix body.ext-page { overflow:auto !important; height:100% !important; }
      html.embed-3mix .vd-window.ext-window { width:100% !important; max-width:none !important; height:100% !important; min-height:0 !important; margin:0 !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; }
      html.embed-3mix .ext-strip { padding:6px 12px !important; }
      html.embed-3mix .ext-strip .vd-title { display:none !important; }
      html.embed-3mix .ext-state { margin-left:auto !important; }
    `,
  };
  const EMBED = new Set(Object.keys(EMBED_CHROME));

  const DEFS = {
    video: { engine: 'display', kind: 'display' },
    audio: { engine: 'audio', kind: 'native' },
    color: { engine: 'advanced', kind: 'native', only: ['colorFormat', 'colorSpace', 'colorRange', 'sdrWhiteLevel', 'hdrPeakLevel'] },
    recording: { engine: 'recording', kind: 'simple' },
    streaming: { engine: 'streaming', kind: 'simple' },
    outputAdvanced: { engine: 'outputAdvanced', kind: 'native' },
    encoders: { kind: 'encoder' },
    files: { engine: 'files', kind: 'native' },
    audioTracks: { engine: 'audioTracks', kind: 'native' },
    networkOutput: { engine: 'networkOutput', kind: 'native', except: ['streamDelayEnabled', 'streamDelaySeconds', 'preserveDelay'] },
    broadcastDelay: { engine: 'networkOutput', kind: 'native', only: ['streamDelayEnabled', 'streamDelaySeconds', 'preserveDelay'] },
    startstop: { engine: 'general', kind: 'native', only: ['warnStartStream', 'warnStopStream', 'warnStopRecord', 'recordWhenStreaming', 'keepRecording', 'replayWhileStreaming', 'keepReplay'] },
    projectors: { engine: 'projectors', kind: 'native' },
    workspace: { kind: 'workspace' },
    streamMultistream: { kind: 'embed' },
    streamExternal: { kind: 'embed' },
    diagnostico: { kind: 'embed' },
    appearance: { engine: 'appearance', kind: 'native' },
    general: { engine: 'general', kind: 'native', except: ['warnStartStream', 'warnStopStream', 'warnStopRecord', 'recordWhenStreaming', 'keepRecording', 'replayWhileStreaming', 'keepReplay'] },
    performance: { engine: 'performance', kind: 'native', plus: 'about' },
    advanced: { engine: 'advanced', kind: 'native', except: ['colorFormat', 'colorSpace', 'colorRange', 'sdrWhiteLevel', 'hdrPeakLevel'] },
    plugins: { kind: 'plugins' },
  };
  const CONTEXTS = {
    recording: { title: 'Configuração de gravação', items: ['recording', 'outputAdvanced', 'encoders', 'files', 'audioTracks', 'startstop'] },
    streaming: { title: 'Configuração de transmissão', items: ['streaming', 'outputAdvanced', 'encoders', 'audioTracks', 'networkOutput', 'startstop'] },
    output: { title: 'Configuração de saída', items: ['outputAdvanced', 'encoders', 'files', 'audioTracks', 'networkOutput', 'startstop'] },
  };
  const STARTSTOP_BY_CONTEXT = {
    general: null,
    recording: ['warnStopRecord', 'recordWhenStreaming', 'keepRecording'],
    streaming: ['warnStartStream', 'warnStopStream', 'recordWhenStreaming', 'keepRecording', 'replayWhileStreaming', 'keepReplay'],
    output: ['warnStartStream', 'warnStopStream', 'recordWhenStreaming', 'keepRecording', 'replayWhileStreaming', 'keepReplay'],
  };

  const params = new URLSearchParams(location.search);
  // Legacy names used by older links. They keep working without adding duplicate categories to the tree.
  const CATEGORY_ALIASES = { checklistTx: 'preflight', display: 'video', updates: 'about', diagnostics: 'about', 'audio-outs': 'audio', 'ndi-srt': 'streamExternal', output: 'outputAdvanced' };
  const requestedRaw = params.get('category');
  const requested = CATEGORY_ALIASES[requestedRaw] || requestedRaw;
  const context = ['recording', 'streaming', 'output'].includes(params.get('context')) ? params.get('context') : 'general';
  const visibleIds = GROUPS.flatMap((g) => g.items);
  const allowed = visibleIds;
  const LABEL_OF = (id) => LABELS[id] || OPEN[id]?.[1] || 'Categoria';
  const VIEW = (id) => Object.assign({ id, label: LABEL_OF(id), open: OPEN[id] ? OPEN[id][0] : null }, DEFS[id] || {});
  const ORDER = [...new Set([...visibleIds, ...Object.keys(DEFS)])].map((id) => VIEW(id));
  const defaultCategory = context === 'recording' ? 'recording' : context === 'streaming' ? 'streaming' : context === 'output' ? 'outputAdvanced' : 'video';
  let selected = requested && (visibleIds.includes(requested) || PARENT[requested] || OPEN[requested]) ? requested : defaultCategory;
  if (!ORDER.some((v) => v.id === selected)) selected = 'video';
  let activeParent = PARENT[selected] || selected;

  let hiddenByModule = new Set();
  let config = null, outputs = null, outputsAt = 0, preset = '', viewScope = '', busy = false;
  const drafts = new Map();          // view id -> { field: value } changed here and not saved yet
  const baseline = new Map();        // view id -> { field: value } read from the engine for this session

  const say = (text, kind = '') => { const box = E('message'); box.textContent = text; box.className = 'settings-message' + (kind ? ' ' + kind : ''); };
  const note = (text, kind) => { delete E('message').dataset.auto; say(text, kind); };
  const getJson = async (url) => { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'O programa não respondeu à consulta'); return v; };
  const send = async (action, data = {}) => { const r = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(120000) }); const v = await r.json().catch(() => ({})); if (!r.ok || v.success === false) throw Error(v.error || 'Operação recusada pelo programa'); return v; };
  const engineState = () => window.FreeMixRemote?.getState?.() || {};
  const stateLabel = (s) => (s.recording ? 'gravando' : s.streaming ? 'transmitindo' : s.virtualCamera ? 'câmera virtual ligada' : '');

  // ---- fields the way the form and the search understand them ----
  const native = () => config?.nativePreferences?.fields || [];
  const nativeOf = (engine) => native().filter((f) => f.category === engine);
  const choicesOf = (list) => String(list || '').split('|').filter(Boolean).map((v) => [v, WORDS[v] || v]);
  const codecName = (codec) => ({ h264: 'H.264', hevc: 'HEVC / H.265', av1: 'AV1' }[codec] || String(codec || '').toUpperCase());
  const encoderChoices = (kind) => (config?.capabilities?.simpleEncoders || [])
    .filter((e) => kind === 'recording' || (e.protocols || []).includes(config?.protocol))
    .map((e) => [e.id, codecName(e.codec) + ' · ' + e.label]);
  const protocolChoices = () => (config?.capabilities?.protocols || []).filter((p) => p.available)
    .map((p) => [p.id, p.id === 'hls' ? 'HLS · HTTP/HTTPS PUT' : String(p.id).toUpperCase()]);

  function startstopFields() {
    const only = STARTSTOP_BY_CONTEXT[context];
    const list = only || DEFS.startstop.only;
    return nativeOf('general').filter((f) => list.includes(f.name));
  }
  function displayFields() {
    const v = config?.video || {};
    return [
      { name: 'baseWidth', label: 'Largura do quadro', type: 'integer', value: v.baseWidth, min: 240, max: 7680, step: 2, group: 'production' },
      { name: 'baseHeight', label: 'Altura do quadro', type: 'integer', value: v.baseHeight, min: 240, max: 7680, step: 2, group: 'production' },
      { name: 'fps', label: 'Taxa de quadros', type: 'string', value: v.fpsDenominator === 1 ? String(v.fpsNumerator) : v.fpsNumerator + '/' + v.fpsDenominator, choices: FPS, group: 'production' },
      { name: 'reflow', label: 'Reenquadrar as entradas no quadro novo', type: 'bool', value: true, group: 'production' },
      { name: 'outputWidth', label: 'Largura da saída', type: 'integer', value: v.outputWidth, min: 240, max: 7680, step: 2, group: 'output' },
      { name: 'outputHeight', label: 'Altura da saída', type: 'integer', value: v.outputHeight, min: 240, max: 7680, step: 2, group: 'output' },
    ];
  }
  function recordingFields() {
    const s = config?.values || {};
    const formats = (config?.capabilities?.recordingFormats || ['mkv']).map((f) => [f, WORDS[f] || f.toUpperCase()]);
    return [
      { name: 'directory', label: 'Pasta das gravações', type: 'text', value: config?.recordDirectory || '', max: 500 },
      { name: 'format', label: 'Formato do arquivo', type: 'string', value: s.RecFormat2 || 'mkv', choices: formats },
      { name: 'quality', label: 'Qualidade', type: 'string', value: s.RecQuality || 'Small', choices: [['Small', WORDS.Small], ['HQ', WORDS.HQ], ['Lossless', WORDS.Lossless], ['Stream', 'Igual à transmissão (mesmos parâmetros)']] },
      { name: 'encoder', label: 'Encoder', type: 'string', value: s.RecEncoder || 'x264', choices: encoderChoices('recording') },
    ];
  }
  function streamingFields() {
    const s = config?.values || {};
    return [
      { name: 'protocol', label: 'Protocolo', type: 'string', value: config?.protocol || 'rtmp', choices: protocolChoices() },
      { name: 'server', label: 'Destino (URL de ingestão)', type: 'text', value: config?.server || '', max: 2000 },
      { name: 'key', label: 'Nova chave (vazio mantém a atual)', type: 'password', value: '', max: 2000, secret: true },
      { name: 'bitrate', label: 'Bitrate do vídeo (kbps)', type: 'integer', value: Number(s.VBitrate || 2500), min: 200, max: 100000, step: 100 },
      { name: 'audioBitrate', label: 'Bitrate do áudio', type: 'string', value: String(s.ABitrate || '160'), choices: [128, 160, 192, 256, 320].map((n) => [String(n), n + ' kbps']) },
      { name: 'encoder', label: 'Encoder', type: 'string', value: s.StreamEncoder || 'x264', choices: encoderChoices('streaming') },
      { name: 'enhancedRtmp', label: 'O servidor aceita AV1/HEVC via Enhanced RTMP', type: 'bool', value: false },
    ];
  }
  function workspaceFields() {
    const w = config?.workspace;
    if (!w) return [];
    return [
      { name: 'cardWidth', label: 'Largura das miniaturas (120–320 px)', type: 'integer', value: w.cardWidth, min: 120, max: 320, step: 10 },
      { name: 'sideWidth', label: 'Largura do módulo lateral (0 = automática)', type: 'integer', value: w.sideWidth || 0, min: 0, max: 4000 },
      { name: 'audioLeft', label: 'Áudio à esquerda dos Inputs', type: 'bool', value: !!w.audioLeft },
      { name: 'modulesStacked', label: 'Empilhar módulos em vez de lado a lado', type: 'bool', value: !!w.modulesStacked },
    ];
  }
  function fieldsOf(id) {
    const view = VIEW(id);
    if (!config) return [];
    if (view.kind === 'display') return displayFields();
    if (view.kind === 'simple') return id === 'recording' ? recordingFields() : streamingFields();
    if (view.kind === 'workspace') return workspaceFields();
    if (view.kind !== 'native') return [];
    let list = id === 'startstop' ? startstopFields() : nativeOf(view.engine);
    if (view.only) list = list.filter((f) => view.only.includes(f.name));
    if (view.except) list = list.filter((f) => !view.except.includes(f.name));
    if (id === 'outputAdvanced' && context !== 'general' && context !== 'output') {
      list = list.filter((f) => f.name === 'mode' || (context === 'recording' ? /^(record|rescaleRecord|replay)/ : /^(stream|vod)/).test(f.name));
    }
    return list.map((f) => ({ name: f.name, label: f.label, type: f.type, value: f.value, choices: f.choices ? choicesOf(f.choices) : null, min: f.min, max: f.max, step: f.type === 'integer' ? 1 : 'any', engine: f.category }));
  }
  const baseValue = (id, name) => fieldsOf(id).find((f) => f.name === name)?.value;
  const draftValue = (id, name) => (drafts.get(id) && Object.hasOwn(drafts.get(id), name) ? drafts.get(id)[name] : baseValue(id, name));
  const isDirty = (id) => !!drafts.get(id) && Object.keys(drafts.get(id)).length > 0;
  const totalDrafts = () => [...drafts.values()].reduce((n, d) => n + Object.keys(d).length, 0);
  const displayFps = (v = config?.video) => (v ? (v.fpsDenominator === 1 ? String(v.fpsNumerator) : (v.fpsNumerator / v.fpsDenominator).toFixed(2).replace('.', ',')) + 'p' : '—');

  function setDraft(id, name, raw) {
    const f = fieldsOf(id).find((x) => x.name === name);
    if (!f) return;
    const value = f.type === 'bool' ? raw === true || raw === 'true' : f.type === 'integer' || f.type === 'number' ? Number(raw) : String(raw ?? '');
    const next = { ...(drafts.get(id) || {}) };
    if (String(value) === String(f.value)) delete next[name]; else next[name] = value;
    if (Object.keys(next).length) drafts.set(id, next); else drafts.delete(id);
  }
  function valueText(f, value) {
    if (f.type === 'bool') return value === true || value === 'true' ? 'ligado' : 'desligado';
    if (f.choices) { const hit = f.choices.find(([v]) => String(v) === String(value)); return hit ? hit[1] : String(value); }
    return value === '' || value == null ? '—' : String(value);
  }

  // ---- drawing ----
  function badge(text, kind = '') { return '<span class="settings-badge' + (kind ? ' ' + kind : '') + '">' + esc(text) + '</span>'; }
  function fieldControl(id, f, locked) {
    const value = draftValue(id, f.name), key = 'f-' + id + '-' + f.name;
    const changed = isDirty(id) && Object.hasOwn(drafts.get(id), f.name);
    const common = ' id="' + esc(key) + '" data-field="' + esc(f.name) + '" data-view="' + esc(id) + '"' + (locked ? ' disabled' : '') + (f.max && f.type === 'text' ? ' maxlength="' + f.max + '"' : '');
    let control;
    if (f.type === 'bool') control = '<input type="checkbox"' + common + (value === true || value === 'true' ? ' checked' : '') + '>';
    else if (f.choices) control = '<select' + common + '>' + f.choices.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>';
    else control = '<input type="' + (f.type === 'password' ? 'password' : f.type === 'integer' || f.type === 'number' ? 'number' : 'text') + '"' + common
      + ' value="' + esc(value) + '"' + (f.min != null ? ' min="' + f.min + '" max="' + f.max + '" step="' + f.step + '"' : '')
      + ' spellcheck="false" autocomplete="off"' + (f.name === 'key' ? ' placeholder="' + (config?.hasKey ? 'Chave salva — vazio mantém' : 'Nenhuma chave salva') + '"' : '') + '>';
    const current = f.secret ? (config?.hasKey ? 'Chave salva' : 'Nenhuma chave salva') : valueText(f, f.value);
    const diff = changed && !f.secret ? '<span class="field-diff">' + esc(valueText(f, f.value)) + ' → <b>' + esc(valueText(f, value)) + '</b></span>' : '';
    return '<label class="' + (f.type === 'bool' ? 'native-check' : '') + (changed ? ' is-changed' : '') + '"><span>' + esc(f.label) + '</span>' + control
      + '<small class="field-current">' + esc(f.userLabel || ('Atual: ' + current)) + '</small>' + diff + '</label>';
  }
  function fieldsGrid(list, id, locked) {
    return '<div class="native-fields">' + list.map((f) => fieldControl(id, f, typeof locked === 'function' ? locked(f) : locked)).join('') + '</div>';
  }

  function outputRows() {
    const v = config?.video || {};
    const rows = [];
    rows.push(['Quadro da produção', v.baseWidth + ' × ' + v.baseHeight + ' · ' + displayFps()]);
    rows.push(['Saída principal (gravação, transmissão e câmera virtual)', v.outputWidth + ' × ' + v.outputHeight + ' · ' + displayFps()]);
    for (const [i, d] of (outputs?.destinations || []).entries()) {
      if (!d?.server) continue;
      rows.push(['Destino adicional ' + (i + 2), d.width + ' × ' + d.height + ' · ' + (d.bitrate || '?') + ' kbps' + (d.active ? ' · no ar' : '')]);
    }
    const ndi = outputs?.ndi || {}, omt = outputs?.omt || {};
    const senders = [...(ndi.senders || []).map((s) => 'NDI ' + (s.senderId + 1)), ...(omt.senders || []).map((s) => 'OMT ' + (s.senderId + 1))];
    if (senders.length) rows.push(['Saídas de rede (' + senders.join(', ') + ')', v.outputWidth + ' × ' + v.outputHeight + ' · usa o quadro da saída']);
    return rows;
  }

  // ---- every destination of this installation, read from /api/outputs (nothing invented) ----
  // The editor of each one is the real page: MultiStream (window /transmitir) for the main stream and the RTMP /
  // RTMPS / HLS destinations, Saídas externas (window /externo) for SRT/RIST and the NDI/OMT senders. The rows here
  // only show real state and jump to those pages; the editing logic is never duplicated.
  function destinationRows() {
    const rows = [];
    const scheme = (d) => (d?.protocol && d.protocol !== 'auto' ? d.protocol : String(d?.server || '').split(':')[0].toLowerCase());
    const streaming = !!engineState().streaming;
    rows.push({
      name: 'Transmissão principal', target: config?.server || 'sem destino', proto: String(config?.protocol || 'rtmp').toUpperCase(),
      state: streaming ? 'no ar' : 'parado', tone: streaming ? 'live' : 'idle', edit: 'streamMultistream', window: '/transmitir',
    });
    for (const d of (outputs?.destinations || [])) {
      if (!d?.server && !d?.enabled && !d?.active) continue;
      const srt = /srt|rist|rtp/.test(scheme(d));
      rows.push({
        name: d.name || 'Destino ' + (Number(d.index ?? rows.length) + 2), target: d.server || 'sem destino', proto: String(scheme(d) || 'auto').toUpperCase(),
        state: d.active ? (d.recording ? 'gravando' : 'no ar') : (d.error ? 'erro' : 'parado'),
        tone: d.active ? 'live' : d.error ? 'error' : 'idle', edit: srt ? 'streamExternal' : 'streamMultistream', window: srt ? '/externo' : '/transmitir',
      });
    }
    for (const [proto, cap] of [['NDI', outputs?.ndi], ['OMT', outputs?.omt]]) {
      for (const s of (cap?.senders || [])) {
        const live = s.active ?? s.outputActive;
        rows.push({
          name: proto + ' ' + (Number(s.senderId ?? 0) + 1) + (s.networkName ? ' · ' + s.networkName : ''), target: s.networkName || 'sem nome na rede', proto,
          state: live ? 'enviando' : 'parado', tone: live ? 'live' : 'idle', edit: 'streamExternal', window: '/externo',
        });
      }
    }
    return rows;
  }
  function destinationsCard() {
    const rows = destinationRows();
    const free = (outputs?.destinations || []).filter((d) => !d?.server && !d?.enabled && !d?.active).length;
    return '<div class="settings-card"><div class="card-title-row"><h2>Destinações desta instalação</h2>' + badge(rows.length + (rows.length === 1 ? ' destinação' : ' destinações'), 'quiet') + '</div>'
      + '<p class="card-desc">Tudo o que esta instalação envia: a transmissão principal, os destinos do MultiStream e as saídas externas (SRT/RIST, NDI e OMT). O estado vem do motor na última leitura; cada linha abre a página real que edita aquela destinação.</p>'
      + '<div class="dest-list">' + rows.map((r) => '<div class="dest-row">'
        + '<span class="dest-name" title="' + esc(r.name) + '">' + esc(r.name) + '</span>'
        + '<span class="dest-target" title="' + esc(r.target) + '">' + esc(r.target) + '</span>'
        + '<span class="dest-proto">' + esc(r.proto) + '</span>'
        + '<span class="dest-state" data-tone="' + esc(r.tone) + '">' + esc(r.state) + '</span>'
        + '<span class="dest-actions">'
        + '<button type="button" data-subtab="' + esc(r.edit) + '" data-parent="streaming">Editar</button>'
        + '<button type="button" data-open-window="' + esc(r.window) + '">Janela própria</button>'
        + '</span></div>').join('') + '</div>'
      + (free ? '<p class="card-note">' + free + (free === 1 ? ' destino adicional livre' : ' destinos adicionais livres') + ' nesta leitura. A capacidade e os campos de cada destino ficam nas abas MultiStream e Saídas externas.</p>' : '')
      + '</div>';
  }

  function drawDisplay(view) {
    const v = config.video, locked = busy || isLive();
    const preset = SIZE_PRESETS.find((p) => Number(draftValue('video', 'baseWidth')) === p.w && Number(draftValue('video', 'baseHeight')) === p.h);
    const prod = fieldsOf('video').filter((f) => f.group === 'production'), out = fieldsOf('video').filter((f) => f.group === 'output');
    return '<div class="settings-card">'
      + '<div class="card-title-row"><h2>Quadro da produção</h2>' + badge(v.baseWidth + ' × ' + v.baseHeight + ' · ' + displayFps(), 'quiet') + '</div>'
      + '<p class="card-desc">É o quadro onde as entradas são compostas. Mudar aqui altera esta produção inteira.</p>'
      + '<div class="settings-presets" role="group" aria-label="Resoluções prontas">'
      + SIZE_PRESETS.map((p) => '<button type="button" data-size="' + p.w + 'x' + p.h + '"' + (preset === p ? ' class="selected"' : '') + (locked ? ' disabled' : '') + '>' + esc(p.label) + '</button>').join('')
      + '<button type="button" data-size="custom"' + (!preset ? ' class="selected"' : '') + (locked ? ' disabled' : '') + '>Personalizado</button></div>'
      + fieldsGrid(prod, 'video', locked)
      + '</div>'
      + '<div class="settings-card">'
      + '<div class="card-title-row"><h2>Tamanho enviado às saídas</h2>' + badge(v.outputWidth + ' × ' + v.outputHeight + ' · ' + displayFps(), 'quiet') + '</div>'
      + '<p class="card-desc">O motor entrega o programa já reescalado neste tamanho. Gravação, transmissão principal, NDI/OMT e câmera virtual partem dele. É independente do quadro acima: os presets de resolução não alteram este campo.</p>'
      + fieldsGrid(out, 'video', locked)
      + '<table class="settings-out-table"><thead><tr><th>Saída</th><th>Resolução real</th></tr></thead><tbody>'
      + outputRows().map(([k, t]) => '<tr><td>' + esc(k) + '</td><td>' + esc(t) + '</td></tr>').join('') + '</tbody></table>'
      + '<p class="card-note">Destinos adicionais de transmissão podem ter resolução própria, configurada em cada destino. NDI/OMT/SRT enviam o quadro da saída.</p>'
      + '</div>'
      + '<p class="settings-line-note">ⓘ Alterar quadro ou tamanho de saída exige gravação, transmissão, saídas de rede e câmera virtual paradas.</p>';
  }

  function drawSimple(view, locked) {
    const list = fieldsOf(view.id);
    const title = view.id === 'recording' ? 'Gravação principal' : 'Transmissão principal';
    const hint = view.id === 'recording'
      ? 'Formato e pasta da gravação principal. Use as abas acima para arquivos, trilhas e comportamento ao iniciar/parar.'
      : 'Destino e codificação da transmissão principal. Use as abas acima para MultiStream, saídas externas, rede, trilhas e comportamento ao iniciar/parar.';
    const fieldLocked = view.id === 'streaming'
      ? (f) => locked && !(f.name === 'key' && !busy && isLive() && config.mode !== 'Advanced')
      : locked;
    return '<div class="settings-card"><div class="card-title-row"><h2>' + title + '</h2>' + badge(config.mode, 'quiet') + '</div>'
      + '<p class="card-desc">' + hint + (view.id === 'streaming' && isLive() ? ' <b>No ar: só a chave pode ser alterada.</b>' : '') + '</p>' + fieldsGrid(list, view.id, fieldLocked)
      + (config.mode === 'Advanced' ? '<p class="settings-warn">Este perfil está em saída avançada. Pasta, formato, trilhas e encoders são definidos na aba <b>Avançado</b>; esta tela fica somente leitura.</p>' : '')
      + '</div>'
      + (view.id === 'streaming' ? destinationsCard() : '');
  }

  function drawWorkspace(view, locked) {
    const w = config.workspace;
    if (!w) return '<div class="settings-card"><p>O serviço de layout desta instalação não respondeu. Nenhum valor será aplicado.</p></div>';
    return '<div class="settings-card"><p class="card-desc">Muda a organização desta mesa. Não altera o vídeo produzido nem o tamanho do texto.</p>'
      + fieldsGrid(workspaceFields(), 'workspace', locked)
      + '<p class="card-note">Também é possível arrastar os cabeçalhos dos módulos e os títulos dos Inputs na mesa. A ordem dos Inputs é salva pelo motor.</p></div>';
  }

  function drawPerformance(view, locked) {
    const s = config.stats || {}, v = config.video || {};
    const metrics = [['CPU', Number.isFinite(s.cpuUsage) ? s.cpuUsage.toFixed(1) + '%' : '—'], ['Memória', Number.isFinite(s.memoryUsage) ? Math.round(s.memoryUsage) + ' MB' : '—'],
      ['Quadros por segundo', Number.isFinite(s.activeFps) ? s.activeFps.toFixed(2).replace('.', ',') : '—'],
      ['Perdidos no desenho', (s.renderSkippedFrames ?? 0) + ' de ' + (s.renderTotalFrames ?? 0)],
      ['Perdidos na saída', (s.outputSkippedFrames ?? 0) + ' de ' + (s.outputTotalFrames ?? 0)],
      ['Disco livre', Number.isFinite(s.availableDiskSpace) ? (s.availableDiskSpace / 1024).toFixed(1).replace('.', ',') + ' GB' : '—']];
    return '<div class="settings-card"><div class="card-title-row"><h2>Desempenho agora</h2>' + badge('leitura do motor', 'quiet') + '</div>'
      + '<div class="metrics">' + metrics.map(([k, t]) => '<div><span>' + esc(k) + '</span><strong>' + esc(t) + '</strong></div>').join('') + '</div>'
      + '<p class="card-desc">Quadro ' + esc(v.baseWidth + ' × ' + v.baseHeight) + ' · saída ' + esc(v.outputWidth + ' × ' + v.outputHeight) + ' · ' + esc(displayFps()) + '.</p></div>'
      + '<div class="settings-card"><div class="card-title-row"><h2>Diagnóstico do computador</h2>' + badge('integrado em Desempenho', 'quiet') + '</div>'
      + '<p class="card-desc">Inspeciona GPU, encoders de hardware, discos de gravação/Replay, interfaces de rede e perfil recomendado sem sair desta seção.</p>'
      + '<div class="row settings-inline-actions">'
      + '<button type="button" class="settings-primary" data-subtab="diagnostico" data-parent="performance">Ver diagnóstico do computador</button>'
      + '<button type="button" data-open-window="/primeira-execucao">Abrir em janela própria</button>'
      + '</div></div>'
      + '<div class="settings-card"><div class="card-title-row"><h2>Preferências de desempenho</h2></div>'
      + '<p class="card-desc">Aplicam-se ao motor e entram em vigor quando o 3Mix for reiniciado fora do ar.</p>'
      + fieldsGrid(fieldsOf('performance'), 'performance', locked) + '</div>';
  }

  function drawDelayCard() {
    return '<div class="settings-card"><div class="card-title-row"><h2>Atraso e DUMP</h2><span id="delay-live"></span></div>'
      + '<p class="card-desc keep">A transmissão sai com alguns segundos de atraso. Se algo indevido acontecer, o DUMP descarta esse trecho antes de ele chegar ao público.</p>'
      + '<p class="card-desc keep">Depois do DUMP, a imagem fica parada por cerca do tempo do atraso e volta já protegida. A gravação e as saídas extras (MultiStream, SRT, NDI, DeckLink) não passam por esse atraso.</p>'
      + '<p class="card-desc keep">Recomendado: 7 a 10 segundos. Vale no próximo início da transmissão.</p></div>';
  }

  async function readDelayLive() {
    const box = E('delay-live');
    if (!box) return;
    let s = null;
    try { s = await (await fetch('/api/delay', { cache: 'no-store', signal: AbortSignal.timeout(2500) })).json(); } catch { /* sem resposta */ }
    const live = E('delay-live');
    if (!live) return;
    const names = { protected: 'No ar, protegido', rebuilding: 'No ar, refazendo o atraso', streaming_without_delay: 'No ar sem atraso', ready: 'Ligado', off: 'Desligado', unavailable: 'Indisponível neste motor' };
    live.textContent = s ? (names[s.state] || '') : 'Sem resposta do motor';
    setTimeout(readDelayLive, 1000);
  }

  function drawNative(view, locked) {
    const list = fieldsOf(view.id);
    if (view.id === 'broadcastDelay' && list.length) {
      setTimeout(readDelayLive, 0);
      return drawDelayCard() + '<div class="settings-card">' + fieldsGrid(list, view.id, locked) + '</div>';
    }
    if (!list.length) {
      const err = config?.nativePreferences?.error;
      return '<div class="settings-card"><p>' + (err ? 'O motor não entregou estas preferências: ' + esc(err) : 'Esta versão do motor não disponibiliza campos nesta categoria.') + '</p>'
        + '<div class="row settings-inline-actions"><button type="button" data-native="1">Abrir preferências completas do motor</button></div></div>';
    }
    return '<div class="settings-card"><p class="card-desc">Preferências originais do motor. Aplicar salva e confirma; o efeito é completo após reiniciar o 3Mix fora do ar.</p>'
      + fieldsGrid(list, view.id, locked) + '</div>'
      + (view.id === 'outputAdvanced' ? '<p class="settings-line-note">Depois de escolher o encoder e aplicar o modo avançado, os parâmetros dele aparecem em <b>Parâmetros do encoder</b>.</p>' : '');
  }

  function embedRoute(id) {
    const [route] = OPEN[id];
    const url = new URL(route, location.origin);
    url.searchParams.set('embed', '1');
    return url.pathname + url.search;
  }

  function drawOpen(view) {
    if (EMBED.has(view.id)) return drawEmbed(view);
    const [route, action] = OPEN[view.id];
    return '<div class="settings-card"><div class="card-title-row"><h2>' + esc(view.label) + '</h2>' + badge('janela própria', 'quiet') + '</div>'
      + '<p class="card-desc">' + esc(window.FreeMixSettingsHelp?.categories?.[view.id] || 'Esta parte tem controles próprios e não é alterada por esta central.') + '</p>'
      + '<p class="card-note">Abrir esta janela não inicia gravação, transmissão nem saídas. Cada editor tem seus próprios botões de aplicar.</p>'
      + '<div class="row settings-inline-actions"><button type="button" class="settings-primary" data-open-window="' + esc(route) + '">' + esc(action) + '</button></div></div>';
  }

  function drawEmbed(view) {
    const route = embedRoute(view.id);
    return '<div class="settings-embed" data-category="' + esc(view.id) + '" data-route="' + esc(route) + '">'
      + '<div class="settings-embed-bar"><span id="settings-embed-state" class="settings-embed-state" role="status"></span>'
      + '<div class="settings-embed-actions">'
      + '<button type="button" data-open-window="' + esc((WINDOW_ACTION[view.id] || OPEN[view.id])[0]) + '">' + esc(WINDOW_ACTION[view.id]?.[1] || 'Abrir em janela') + '</button></div></div>'
      + '<div class="settings-embed-surface"><iframe id="settings-embed-frame" src="' + esc(route) + '" title="' + esc(view.label + ' · página do 3Mix') + '" loading="eager" referrerpolicy="same-origin"></iframe></div></div>';
  }

  function updateEmbedStatus(text, error = false) {
    const box = E('settings-embed-state');
    if (!box) return;
    box.textContent = text;
    box.classList.toggle('error', !!error);
  }

  // Same-origin injection: hide only the embedded page's own title/footer chrome, keep its controls and scripts. The
  // page is the real one served by the program; no static copy lives here.
  function decorateEmbed(frame, id, label) {
    let doc;
    try { doc = frame.contentDocument; } catch { doc = null; }
    if (!doc?.documentElement) {
      updateEmbedStatus('A página não pôde ser embutida. Use Abrir em janela.', true);
      return;
    }
    let style = doc.getElementById('3mix-embed-chrome');
    if (!style) {
      style = doc.createElement('style');
      style.id = '3mix-embed-chrome';
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = EMBED_BASE_CSS + (EMBED_GRAFITE_IDS.has(id) ? EMBED_GRAFITE_CSS : '') + (EMBED_CHROME[id] || '');
    doc.documentElement.classList.add('embed-3mix');
    if (doc.body) doc.body.classList.add('embed-3mix');
    if (!doc.documentElement.dataset.embedLinks) {
      doc.documentElement.dataset.embedLinks = '1';
      doc.addEventListener('click', (event) => {
        const link = event.target?.closest?.('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || link.hasAttribute('download') || link.target === '_blank') return;
        const href = link.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        let url;
        try { url = new URL(link.href, doc.baseURI); } catch { return; }
        if (url.origin !== location.origin) return;
        const current = new URL(frame.src, location.origin);
        if (url.pathname === current.pathname && url.search === current.search) return;
        // A card in the hub or a link inside an editor must not replace the embedded page: open the real window.
        event.preventDefault();
        openWindow(url.pathname + url.search + url.hash);
      }, true);
    }
    updateEmbedStatus('', false);
  }

  function mountEmbed(id, label) {
    const frame = E('settings-embed-frame');
    if (!frame || frame.dataset.embedMounted === id) return;
    frame.dataset.embedMounted = id;
    const apply = () => {
      if (!frame.isConnected) return;
      decorateEmbed(frame, id, label);
    };
    frame.addEventListener('load', apply);
    if (frame.contentDocument?.readyState === 'complete') apply();
  }

  function reloadEmbed() {
    const box = E('content').querySelector('.settings-embed');
    const frame = E('settings-embed-frame');
    if (!box || !frame) return;
    frame.src = box.dataset.route;
  }

  function drawPlugins() {
    return '<div class="settings-card"><p class="card-desc">Ferramentas registradas pelos plugins carregados. Abrir uma ferramenta não ativa legendas, automações ou efeitos.</p>'
      + '<div id="plugin-tools" class="settings-list">Lendo ferramentas…</div>'
      + '<p class="card-note">Advanced Masks e Move aparecem nos filtros e transições da entrada. Cada plugin usa seus próprios controles.</p></div>';
  }

  function diffCard() {
    const rows = [];
    for (const view of ORDER) {
      if (!isDirty(view.id)) continue;
      for (const [name, value] of Object.entries(drafts.get(view.id))) {
        const f = fieldsOf(view.id).find((x) => x.name === name);
        if (!f) continue;
        rows.push('<li><span class="diff-where">' + esc(view.label) + '</span><span class="diff-field">' + esc(f.label) + '</span>'
          + '<span class="diff-value">' + esc(f.secret ? 'chave nova' : valueText(f, f.value)) + ' → <b>' + esc(f.secret ? 'substituída' : valueText(f, value)) + '</b></span></li>');
      }
    }
    if (!rows.length) return '<div class="settings-diff" id="settings-diff" hidden></div>';
    const restart = [...drafts.keys()].some((id) => VIEW(id).kind === 'native');
    const stop = isDirty('video') || isDirty('recording') || isDirty('streaming') || isDirty('outputAdvanced') || isDirty('encoders');
    return '<div class="settings-diff" id="settings-diff"><div class="diff-head"><strong>' + rows.length + (rows.length === 1 ? ' alteração pendente' : ' alterações pendentes') + '</strong>'
      + '<span>atual → novo</span></div><ul>' + rows.join('') + '</ul>'
      + (stop ? '<p class="diff-warn">Pare gravação, transmissão, saídas de rede e câmera virtual antes de aplicar.</p>' : '')
      + (restart ? '<p class="diff-note">Preferências do motor entram em vigor após reiniciar o 3Mix fora do ar.</p>' : '') + '</div>';
  }

  function drawSubtabs(parent) {
    const tabs = SUBTABS[parent];
    if (!tabs) return '';
    return '<div class="settings-subtabs" role="tablist" aria-label="Seções de ' + esc(VIEW(parent).label) + '">'
      + tabs.map(([id, label]) => '<button type="button" role="tab" data-subtab="' + id + '" data-parent="' + parent + '" aria-selected="' + (selected === id) + '" class="' + (selected === id ? 'on' : '') + '">' + esc(label) + '</button>').join('')
      + '</div>';
  }

  function draw() {
    if (!config) return;
    const view = VIEW(selected);
    const parentView = VIEW(activeParent);
    E('window-title').textContent = 'Configurações';
    document.title = '3Mix · Configurações';
    E('title').textContent = parentView.label;
    E('description').textContent = '';
    // navigation: four groups, icons, and the parent selected while a sub-tab is open
    const nav = GROUPS.map((g) => {
      const items = g.items.filter((id) => !hiddenByModule.has(id)).map((id) => VIEW(id)).filter((v) => ORDER.some((o) => o.id === v.id));
      if (!items.length) return '';
      return '<div class="settings-nav-group"><div class="settings-nav-title">' + esc(g.title) + '</div><div class="settings-nav-items">'
        + items.map((v) => '<button type="button" data-category="' + v.id + '"' + (v.id === activeParent ? ' class="selected" aria-current="true"' : '')
          + ' title="' + esc(window.FreeMixSettingsHelp?.categories?.[v.id] || v.label) + '"><span class="nav-icon" aria-hidden="true">' + (ICONS[v.id] || '') + '</span>' + esc(v.label) + (v.open && !EMBED.has(v.id) ? ' <span class="nav-open">↗</span>' : '') + (isDirty(v.id) ? ' <span class="nav-dirty" title="Alterações pendentes">●</span>' : '') + '</button>').join('')
        + '</div></div>';
    }).join('');
    fill(E('categories'), nav);

    const live = isLive(), locked = busy || (view.id === 'video' && live) || (['recording', 'streaming', 'outputAdvanced', 'files', 'audioTracks', 'networkOutput', 'startstop'].includes(view.id) && live);
    let html = '';
    if (view.open) html = drawOpen(view);
    else if (view.kind === 'display') html = drawDisplay(view);
    else if (view.kind === 'simple') html = drawSimple(view, locked);
    else if (view.kind === 'workspace') html = drawWorkspace(view, locked);
    else if (view.kind === 'encoder') html = '<div class="settings-card"><p class="card-desc keep">Parâmetros fornecidos pelo encoder realmente carregado. Escolha o encoder em <b>Saída avançada</b> e aplique antes de editar aqui.</p><div id="encoder-panel"></div></div>';
    else if (view.kind === 'plugins') html = drawPlugins();
    else if (view.id === 'performance') html = drawPerformance(view, locked);
    else html = drawNative(view, locked);
    if (view.id === 'audio') {
      html = '<div class="settings-card"><p class="card-desc">Faders, níveis, buses, roteamento, retornos e dispositivos ficam no mixer de operação.</p>'
        + '<div class="row settings-inline-actions"><button type="button" class="settings-primary" data-open-window="/audio">Abrir mixer de áudio</button></div></div>' + html;
    }
    html = drawSubtabs(activeParent) + diffCard() + '<div id="view-body">' + html + '</div>';

    const focused = document.activeElement;
    const insideForm = focused && E('content').contains(focused) && /^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName);
    const embedded = !!(view.open && EMBED.has(view.id));
    const mounted = E('content').querySelector('.settings-embed');
    const keepEmbed = embedded && mounted?.dataset.category === view.id;
    E('content').dataset.category = view.id;
    E('content').closest('.settings-content')?.classList.toggle('is-embed', embedded);
    document.body.classList.toggle('embed-view', embedded);
    E('settings-project').textContent = 'Projeto: ' + (preset || 'Produção atual');
    if (!insideForm && !keepEmbed) { E('content').innerHTML = html; E('content')._html = html; }
    else if (!insideForm) { /* the iframe is already showing this category: do not reload it on every engine tick */ }
    else { if (E('settings-diff')) E('settings-diff').outerHTML = diffCard(); }

    if (embedded) mountEmbed(view.id, view.label);
    if (view.id === 'video') decorateVideo(live);
    if (view.kind === 'encoder') mountEncoder();
    if (view.kind === 'plugins') loadPluginTools();
    window.FreeMixSettingsHelp?.decorate?.(E('content'));

    const supported = isSupported(view, live);
    const canApplyAny = !busy && totalDrafts() > 0 && (!live || onlyStreamKeyPending());
    for (const id of ['apply', 'ok']) E(id).disabled = !canApplyAny;
    E('defaults').disabled = busy || !supported;
    E('import').disabled = busy;
    E('export').disabled = busy;
    E('transfer-note').hidden = false;
    E('transfer-note').textContent = supported
      ? 'Exportar "Tudo" salva configurações, atalhos, MIDI/OSC, macros, módulos e Multiview num único JSON para backup completo (sem senhas/chaves).'
      : 'Use o escopo "Tudo" no rodapé para exportar ou importar o backup completo (configurações, atalhos, macros e módulos) a qualquer momento.';
    E('settings-dirty').hidden = totalDrafts() === 0;
    E('settings-dirty').textContent = '● ' + totalDrafts() + (totalDrafts() === 1 ? ' alteração não aplicada' : ' alterações não aplicadas');
    updateSummary();
    if (!E('message').textContent || E('message').dataset.auto) {
      let text = '';
      const keyOnlyLive = live && view.id === 'streaming' && config.mode !== 'Advanced';
      if (keyOnlyLive) text = 'No ar: só a chave pode ser alterada; ela vale no próximo início da transmissão.';
      else if (live && (view.id === 'video' || ['recording', 'streaming', 'outputAdvanced'].includes(view.id))) text = 'Há ' + stateLabel(engineState()) + ': pare as saídas para alterar esta categoria.';
      else if (totalDrafts()) text = 'Alterações ainda não aplicadas: confira o resumo e clique em Aplicar.';
      else if (view.id === 'broadcastDelay') text = '';
      else if (view.kind === 'native') text = 'Estas preferências entram em vigor após reiniciar o 3Mix fora do ar.';
      say(text, text && live && !keyOnlyLive ? 'error' : '');
      E('message').dataset.auto = '1';
    }
    // the destination list shows real engine state: re-read it when this view is open and the read is stale
    if (view.id === 'streaming' && outputs && Date.now() - outputsAt > 10000) {
      refreshOutputs().then(() => {
        if (selected === 'streaming' && !document.querySelector('#content [data-view]:focus')) { E('content')._html = null; draw(); }
      });
    }
  }

  function decorateVideo(live) {
    for (const b of E('content').querySelectorAll('[data-size]')) {
      if (b.dataset.size === 'custom' || live || busy) continue;
      b.onclick = () => { const [w, h] = b.dataset.size.split('x').map(Number); setDraft('video', 'baseWidth', w); setDraft('video', 'baseHeight', h); E('content')._html = null; draw(); };
    }
    const custom = E('content').querySelector('[data-size="custom"]');
    if (custom && !live && !busy) custom.onclick = () => { const el = E('f-video-baseWidth'); if (el) { el.focus(); el.select?.(); } };
  }
  function updateSummary() {
    const v = config.video, s = config.stats || {};
    const prod = (draftValue('video', 'baseWidth') || v.baseWidth) + ' × ' + (draftValue('video', 'baseHeight') || v.baseHeight) + ' · ' + displayFps();
    const out = (draftValue('video', 'outputWidth') || v.outputWidth) + ' × ' + (draftValue('video', 'outputHeight') || v.outputHeight) + ' · ' + displayFps();
    const changed = isDirty('video');
    E('settings-current-production').innerHTML = esc(prod) + (changed ? ' <span class="sum-new">novo</span>' : '');
    E('settings-current-output').innerHTML = esc(out) + (changed ? ' <span class="sum-new">novo</span>' : '');
    E('settings-preview-format').textContent = v.baseWidth + ' × ' + v.baseHeight + (s.activeFps ? ' · ' + Number(s.activeFps).toFixed(2).replace('.', ',') : '');
  }

  const isLive = () => { const s = engineState(); return !!(s.recording || s.streaming || config?.virtualCamera || (outputs?.destinations || []).some((d) => d?.active) || (outputs?.ndi?.senders || []).some((s2) => s2.active) || (outputs?.omt?.senders || []).some((s2) => s2.active)); };
  function onlyStreamKeyPending() {
    if (config?.mode === 'Advanced') return false;
    const pending = ORDER.filter((v) => isDirty(v.id));
    if (pending.length !== 1 || pending[0].id !== 'streaming') return false;
    const changed = drafts.get('streaming') || {};
    const keys = Object.keys(changed);
    return keys.length === 1 && keys[0] === 'key' && String(changed.key || '').length > 0;
  }
  async function refreshOutputs() {
    outputsAt = Date.now();
    try { const v = await getJson('/api/outputs'); outputs = v.outputs; } catch { /* keep the last read; the note below says so */ }
  }
  function isSupported(view, live) {
    if (busy || view.open || view.kind === 'encoder' || view.kind === 'plugins') return false;
    if (view.id === 'video' && live) return false;
    if (['recording', 'streaming'].includes(view.id) && (config.mode === 'Advanced' || live)) return false;
    if (view.kind === 'native') return fieldsOf(view.id).length > 0;
    if (view.kind === 'workspace') return !!config.workspace;
    return fieldsOf(view.id).length > 0;
  }

  // ---- reading ----
  async function load() {
    if (busy) return;
    const data = await settingsRequest('settings_get');
    config = data.config; preset = data.preset;
    try { const r = await fetch('/api/workspace', { signal: AbortSignal.timeout(5000) }), v = await r.json(); if (r.ok && v.success) config.workspace = v.workspace; } catch { /* older installation without the workspace service */ }
    try { await refreshOutputs(); } catch { outputs = null; }
    baseline.clear();
    for (const view of ORDER) baseline.set(view.id, Object.fromEntries(fieldsOf(view.id).map((f) => [f.name, f.value])));
    draw();
    E('message').textContent = 'Configurações carregadas da produção atual.';
    E('message').dataset.auto = '1';
  }
  async function settingsRequest(action, data = {}) {
    if (action === 'settings_get') {
      const r = await getJson('/api/settings');
      if (!r.settings?.video || !r.settings?.values) throw Error('Resposta de configurações incompleta');
      viewScope = r.preset || '';
      return { config: r.settings, preset: viewScope };
    }
    const r = await send(action, data);
    return r.settings;
  }

  // ---- applying ----
  function domValues(id) {
    const values = {};
    for (const el of E('content').querySelectorAll('[data-view="' + id + '"]')) {
      const f = fieldsOf(id).find((x) => x.name === el.dataset.field);
      if (!f) continue;
      let value = el.type === 'checkbox' ? el.checked : el.value;
      if (f.type === 'integer' || f.type === 'number') value = Number(value);
      values[f.name] = value;
    }
    return values;
  }
  function changedOf(id) {
    const base = baseline.get(id) || {};
    return Object.fromEntries(Object.entries(domValues(id)).filter(([k, v]) => String(v) !== String(base[k])));
  }
  async function apply(close) {
    if (busy) return;
    const pending = ORDER.filter((v) => isDirty(v.id));
    if (!pending.length) { note('Nenhuma alteração para aplicar.'); return; }
    busy = true;
    E('settings-form').inert = true; E('categories').inert = true; E('settings-close').disabled = true;
    for (const id of ['apply', 'ok', 'defaults', 'import', 'export']) E(id).disabled = true;
    note('Aplicando e conferindo no motor…');
    const restart = pending.some((v) => v.kind === 'native');
    try {
      const expectedScope = viewScope;
      const fresh = await settingsRequest('settings_get');
      if (expectedScope !== fresh.preset) throw Error('O projeto mudou enquanto esta janela estava aberta. Feche e abra de novo.');
      // nothing is written while any output is running: the engine refuses and the operator needs to know why
      try { outputs = (await getJson('/api/outputs')).outputs; } catch { /* the engine gate still protects the write */ }
      const onlyStreamKey = onlyStreamKeyPending();
      if (isLive() && !onlyStreamKey) throw Error('Pare gravação, transmissão, saídas de rede e câmera virtual antes de aplicar.');
      let written = 0, lastRestart = false;
      const keepWorkspace = config.workspace;
      for (const view of pending) {
        const id = view.id;
        let values = changedOf(id);
        if (view.kind === 'workspace') {
          const w = config.workspace;
          const all = domValues('workspace');
          const r = await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: w.revision, cardWidth: Number(all.cardWidth), sideWidth: Number(all.sideWidth), audioLeft: !!all.audioLeft, modulesStacked: !!all.modulesStacked }), signal: AbortSignal.timeout(12000) });
          const v = await r.json().catch(() => ({}));
          if (!r.ok || !v.success) throw Error(v.error || 'O workspace não confirmou a alteração');
          config.workspace = v.workspace; written++; continue;
        }
        if (onlyStreamKey) {
          const key = String(drafts.get('streaming')?.key || '');
          if (!key) continue;
          await send('settings_stream_key', { category: 'streaming', key });
        } else {
          if (!Object.keys(values).length) continue;
          if (view.id === 'streaming' && !values.key) delete values.key;
          if (view.kind === 'native') {
            const body = { category: view.engine, ...values };
            const r = await send('settings_apply', body);
            lastRestart = r.settings?.requiresRestart === true || lastRestart;
          } else {
            const body = { category: view.engine, ...domValues(id) };
            if (view.id === 'streaming' && !body.key) delete body.key;
            const r = await send('settings_apply', body);
            lastRestart = r.settings?.requiresRestart === true || lastRestart;
          }
        }
        const reloaded = await settingsRequest('settings_get');
        config = reloaded.config;
        config.workspace = keepWorkspace;
        baseline.set(id, Object.fromEntries(fieldsOf(id).map((f) => [f.name, f.value])));
        drafts.delete(id); written++;
      }
      if (!written) { note('Nenhuma alteração efetiva foi encontrada nos campos.', ''); return; }
      const done = selected === 'broadcastDelay' && written === 1
        ? 'Salvo. Vale no próximo início da transmissão.'
        : onlyStreamKey
        ? 'Chave salva; vale no próximo início da transmissão.'
        : restart || lastRestart
          ? 'Configurações salvas e confirmadas. Reinicie o 3Mix fora do ar para aplicar as preferências do motor.'
          : written + (written === 1 ? ' categoria aplicada e confirmada pelo motor.' : ' categorias aplicadas e confirmadas pelo motor.');
      note(done, 'ok');
      E('content')._html = null; draw();
      if (close) setTimeout(() => window.FreeMixClosePanel?.(), 250);
    } catch (e) {
      note(e.name === 'TimeoutError' ? 'Sem confirmação do motor. Atualize o status antes de repetir; a alteração pode ter sido aplicada.' : e.message, 'error');
    } finally {
      busy = false;
      E('settings-form').inert = false; E('categories').inert = false; E('settings-close').disabled = false;
      draw();
    }
  }

  // ---- search: fields, values and categories ----
  function searchItems() {
    const items = [];
    for (const view of ORDER) {
      const category = LABEL_OF(view.id);
      items.push({ view: view.id, field: null, label: category, text: category + ' ' + (window.FreeMixSettingsHelp?.categories?.[view.id] || '') });
      for (const f of fieldsOf(view.id)) items.push({ view: view.id, field: f.name, label: f.label, text: category + ' ' + f.label + ' ' + valueText(f, draftValue(view.id, f.name)) });
    }
    return items;
  }
  function renderSearch() {
    const q = (E('settings-search')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const box = E('settings-search-results');
    if (!config || !q) { box.hidden = true; box.innerHTML = ''; filterNav(''); return; }
    const hits = searchItems().filter((x) => x.text.toLocaleLowerCase('pt-BR').includes(q)).slice(0, 14);
    box.innerHTML = hits.length ? hits.map((h, i) => '<button type="button" role="option" data-view="' + h.view + '"' + (h.field ? ' data-field="' + esc(h.field) + '"' : '') + '><span>' + esc(h.label) + '</span><small>' + esc(LABEL_OF(h.view)) + '</small></button>').join('')
      : '<p class="search-empty">Nenhum campo ou categoria com “' + esc(q) + '”.</p>';
    box.hidden = false;
    filterNav(q);
  }
  function filterNav(q) {
    for (const b of E('categories').querySelectorAll('button')) {
      const hit = !q || b.textContent.toLocaleLowerCase('pt-BR').includes(q) || (window.FreeMixSettingsHelp?.categories?.[b.dataset.category] || '').toLocaleLowerCase('pt-BR').includes(q);
      b.hidden = !hit;
    }
    for (const g of E('categories').querySelectorAll('.settings-nav-group')) g.hidden = ![...g.querySelectorAll('button')].some((b) => !b.hidden);
  }
  function goTo(viewId, field) {
    if (!ORDER.some((v) => v.id === viewId)) return;
    if (E('settings-search')) E('settings-search').value = '';
    if (E('settings-search-results')) { E('settings-search-results').hidden = true; E('settings-search-results').innerHTML = ''; }
    filterNav('');
    if (selected !== viewId) {
      if (totalDrafts() && !confirm('Há alterações não aplicadas. Ir para outra categoria e mantê-las?')) return;
      selected = viewId; activeParent = PARENT[viewId] || viewId; params.set('category', selected); if (context !== 'general') params.set('context', context); history.replaceState(null, '', location.pathname + '?' + params);
      E('content')._html = null;
    }
    draw();
    if (field) requestAnimationFrame(() => {
      const el = E('f-' + viewId + '-' + field);
      if (!el) return;
      el.scrollIntoView({ block: 'center' }); try { el.focus({ preventScroll: true }); } catch { el.focus(); }
      const label = el.closest('label'); if (label) { label.classList.add('settings-hit'); setTimeout(() => label.classList.remove('settings-hit'), 1600); }
    });
  }

  // ---- transfer (import / export with an explicit scope, including Full Backup) ----
  function scopeViews() {
    const scope = E('transfer-scope')?.value || 'backup';
    if (scope === 'backup' || scope === 'all') return ORDER.filter((v) => !v.open && v.kind !== 'encoder' && v.kind !== 'plugins');
    if (scope === 'drafts') return ORDER.filter((v) => isDirty(v.id));
    return [VIEW(selected)];
  }
  const triggerKeyOf = (t) => !t ? '' : JSON.stringify(t.type === 'keyboard'
    ? { type: t.type, code: t.code, ctrl: !!t.ctrl, alt: !!t.alt, shift: !!t.shift, meta: !!t.meta }
    : { type: t.type, deviceId: t.deviceId, channel: t.channel, message: t.message, number: t.number });

  function enrichStepsWithInputNames(steps, inputMap) {
    if (!Array.isArray(steps)) return [];
    return steps.map((s) => {
      const copy = JSON.parse(JSON.stringify(s));
      if (copy.action === 'if') {
        if (copy.condition?.input && inputMap.has(copy.condition.input)) copy.condition.inputName = inputMap.get(copy.condition.input);
        copy.then = enrichStepsWithInputNames(copy.then, inputMap);
        copy.else = enrichStepsWithInputNames(copy.else, inputMap);
      } else if (copy.data?.input && inputMap.has(copy.data.input)) {
        copy.data.inputName = inputMap.get(copy.data.input);
      }
      return copy;
    });
  }

  function resolveStepsInputs(steps, resolveInput) {
    if (!Array.isArray(steps)) return [];
    return steps.map((s) => {
      const copy = JSON.parse(JSON.stringify(s));
      if (copy.action === 'if') {
        if (copy.condition?.input || copy.condition?.inputName) {
          copy.condition.input = resolveInput(copy.condition.input, copy.condition.inputName);
          delete copy.condition.inputName;
        }
        copy.then = resolveStepsInputs(copy.then, resolveInput);
        copy.else = resolveStepsInputs(copy.else, resolveInput);
      } else if (copy.data && (copy.data.input || copy.data.inputName)) {
        copy.data.input = resolveInput(copy.data.input, copy.data.inputName);
        delete copy.data.inputName;
      }
      return copy;
    });
  }

  async function exportOne(view) {
    if (view.kind === 'workspace') {
      const w = config.workspace;
      if (!w) throw Error('O layout da mesa não está disponível nesta instalação.');
      return { format: '3Mix Workspace', schema: 1, category: 'workspace', values: { cardWidth: w.cardWidth, sideWidth: w.sideWidth || 0, audioLeft: !!w.audioLeft, modulesStacked: !!w.modulesStacked } };
    }
    const response = await settingsRequest('settings_export', { category: view.engine });
    const doc = response?.document;
    if (!doc) throw Error('O motor não entregou o arquivo de ' + view.label + '.');
    const copy = JSON.parse(JSON.stringify(doc));
    const allowedFields = new Set(fieldsOf(view.id).map((f) => f.name));
    const list = nativeOf(view.engine);
    if (list.length) copy.values = Object.fromEntries(Object.entries(copy.values || {}).filter(([k]) => allowedFields.has(k)));
    delete copy.values?.key; delete copy.values?.server; delete copy.values?.password; delete copy.values?.token; delete copy.values?.secret;
    return copy;
  }

  async function doExport() {
    try {
      const scope = E('transfer-scope')?.value || 'backup';
      const views = scopeViews();
      if (!views.length) throw Error('Não há rascunho para exportar. Escolha outro escopo.');
      if (scope === 'view' && VIEW(selected).open) {
        throw Error('Esta categoria usa controles próprios. Escolha "Tudo (Configurações + Atalhos + Macros + Módulos)" no Escopo para exportar o backup completo.');
      }
      const docs = [];
      for (const view of views) {
        try { docs.push({ view: view.id, document: await exportOne(view) }); }
        catch (err) { if (scope === 'view') throw err; }
      }
      let payload, filename, summaryNote;
      if (scope === 'backup') {
        let stateJson = {}, modulosData = null, mvData = null;
        try { stateJson = await getJson('/api/json'); } catch {}
        try { const m = await getJson('/api/modulos'); modulosData = m.modulos || null; } catch {}
        try { const mv = await getJson('/api/multiview-montagens'); mvData = mv.montagens || null; } catch {}
        const inputMap = new Map((stateJson.inputs || []).map((i) => [i.key, i.name]));
        const macroMap = new Map((stateJson.macros?.items || []).map((m) => [m.id, m.name]));
        const controllersItems = (stateJson.controllers?.items || []).map((item) => {
          const copy = JSON.parse(JSON.stringify(item));
          const d = copy.target?.data || {};
          if (d.input && inputMap.has(d.input)) d.inputName = inputMap.get(d.input);
          if (copy.target?.action === 'macro_run' && d.id && macroMap.has(d.id)) d.macroName = macroMap.get(d.id);
          return copy;
        });
        const macrosItems = (stateJson.macros?.items || []).map((m) => ({
          ...JSON.parse(JSON.stringify(m)),
          steps: enrichStepsWithInputNames(m.steps, inputMap),
        }));
        const macrosTriggers = (stateJson.macros?.triggers || []).map((t) => {
          const copy = JSON.parse(JSON.stringify(t));
          if (copy.macroId && macroMap.has(copy.macroId)) copy.macroName = macroMap.get(copy.macroId);
          if (copy.condition?.input && inputMap.has(copy.condition.input)) copy.condition.inputName = inputMap.get(copy.condition.input);
          return copy;
        });
        payload = {
          format: '3Mix Full Backup',
          schema: 1,
          exportedAt: new Date().toISOString(),
          preset: preset || stateJson.preset || '',
          entries: docs,
          controllers: {
            items: controllersItems,
            osc: stateJson.controllers?.osc ? { port: stateJson.controllers.osc.port } : { port: 19120 },
          },
          macros: {
            items: macrosItems,
            triggers: macrosTriggers,
          },
          modulos: modulosData,
          multiviewMontagens: mvData,
        };
        const day = new Date().toISOString().slice(0, 10);
        filename = '3Mix-backup-completo-' + day + '.json';
        summaryNote = 'Backup completo exportado (' + docs.length + ' categorias, ' + controllersItems.length + ' atalhos, ' + macrosItems.length + ' macros). Senhas e chaves de transmissão não entram no arquivo.';
      } else {
        payload = docs.length === 1 ? { ...docs[0].document, view: docs[0].view } : { format: '3Mix Settings Bundle', schema: 1, exportedAt: new Date().toISOString(), entries: docs };
        const scopeName = views.length === 1 ? views[0].id : views.length + '-categorias';
        filename = '3Mix-configuracoes-' + scopeName + '.json';
        summaryNote = docs.length + (docs.length === 1 ? ' categoria exportada.' : ' categorias exportadas.') + ' Servidor, chave, senha e tokens não entram no arquivo.';
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      note(summaryNote, 'ok');
    } catch (e) { note(e.message, 'error'); }
  }

  function acceptedView(category) {
    return ORDER.find((v) => v.engine === category && !v.open) || VIEW(selected);
  }
  async function importOne(document, fallbackView, isBundle = false) {
    const category = document?.category;
    const view = ORDER.find((v) => v.id === fallbackView && (v.engine === category || v.kind === category))
      || ORDER.find((v) => v.id === selected && v.engine === category)
      || acceptedView(category);
    if (!view || view.open) {
      if (isBundle) return null;
      throw Error('Este arquivo é de uma categoria que não está aberta nesta janela.');
    }
    let draft;
    if (view.kind === 'workspace') {
      if (document?.format !== '3Mix Workspace' || document.schema !== 1 || document.category !== 'workspace') {
        if (isBundle) return null;
        throw Error('Arquivo de layout inválido.');
      }
      const w = document.values || {}; draft = w;
    } else {
      const doc = { ...document }; delete doc.view;
      const response = await settingsRequest('settings_import', { document: doc });
      draft = response?.draft;
    }
    const values = {};
    const allowed = fieldsOf(view.id);
    for (const [k, v] of Object.entries(draft || {})) if (allowed.some((f) => f.name === k)) values[k] = v;
    if (!Object.keys(values).length) {
      if (isBundle) return null;
      throw Error('O arquivo não tem campos desta categoria.');
    }
    for (const [k, v] of Object.entries(values)) {
      setDraft(view.id, k, v);
      const el = E('f-' + view.id + '-' + k);
      if (el) {
        if (el.type === 'checkbox') el.checked = v === true || v === 'true'; else el.value = v;
        el.dataset.dirty = 'true';
      }
    }
    return view;
  }

  async function importOperationalBundle(document) {
    const stats = { shortcuts: 0, macros: 0, triggers: 0, modulos: false, multiview: false };
    if (document.modulos && typeof document.modulos === 'object') {
      try {
        const r = await fetch('/api/modulos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulos: document.modulos }), signal: AbortSignal.timeout(8000) });
        if (r.ok) stats.modulos = true;
      } catch {}
    }
    if (Array.isArray(document.multiviewMontagens) && document.multiviewMontagens.length) {
      try {
        const r = await fetch('/api/multiview-montagens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ montagens: document.multiviewMontagens }), signal: AbortSignal.timeout(8000) });
        if (r.ok) stats.multiview = true;
      } catch {}
    }
    const hasMacros = Array.isArray(document.macros?.items) || Array.isArray(document.macros?.triggers);
    const hasControllers = Array.isArray(document.controllers?.items) || document.controllers?.osc;
    if (!hasMacros && !hasControllers) return stats;

    let stateJson = {};
    try { stateJson = await getJson('/api/json'); } catch {}
    const inputs = stateJson.inputs || [];
    const resolveInput = (key, name) => {
      if (key && inputs.some((i) => i.key === key)) return key;
      if (name) {
        const byName = inputs.find((i) => String(i.name || '').toLowerCase() === String(name).toLowerCase());
        if (byName) return byName.key;
      }
      if (key) {
        const byName2 = inputs.find((i) => String(i.name || '').toLowerCase() === String(key).toLowerCase());
        if (byName2) return byName2.key;
      }
      return key || '';
    };

    const macroIdMap = new Map();
    if (Array.isArray(document.macros?.items)) {
      for (const m of document.macros.items) {
        if (!m?.name || !Array.isArray(m.steps)) continue;
        try {
          const existing = (stateJson.macros?.items || []).find((x) => x.id === m.id || x.name === m.name);
          const steps = resolveStepsInputs(m.steps, resolveInput);
          const res = await send('macro_save', {
            ...(existing ? { id: existing.id } : {}),
            name: m.name,
            steps,
            rollbackPreviewOnFailure: m.rollbackPreviewOnFailure === true,
          });
          if (res?.state) stateJson = res.state;
          const saved = (stateJson.macros?.items || []).find((x) => x.name === m.name);
          if (saved && m.id) macroIdMap.set(m.id, saved.id);
          stats.macros++;
        } catch {}
      }
    }
    if (Array.isArray(document.macros?.triggers)) {
      for (const t of document.macros.triggers) {
        if (!t?.name || !t?.event) continue;
        try {
          const mappedMacroId = macroIdMap.get(t.macroId)
            || (t.macroName ? (stateJson.macros?.items || []).find((x) => x.name === t.macroName)?.id : null)
            || t.macroId;
          if (!mappedMacroId) continue;
          const existing = (stateJson.macros?.triggers || []).find((x) => x.id === t.id || (x.name === t.name && x.event === t.event));
          const condition = t.condition ? { ...t.condition } : undefined;
          if (condition) {
            if (condition.input || condition.inputName) condition.input = resolveInput(condition.input, condition.inputName);
            delete condition.inputName;
          }
          const res = await send('macro_trigger_save', {
            ...(existing ? { id: existing.id } : {}),
            name: t.name,
            event: t.event,
            macroId: mappedMacroId,
            enabled: t.enabled === true,
            group: t.group || '',
            debounce: t.debounce ?? 250,
            cooldown: t.cooldown ?? 1000,
            ...(condition ? { condition } : {}),
          });
          if (res?.state) stateJson = res.state;
          stats.triggers++;
        } catch {}
      }
    }
    if (document.controllers?.osc?.port) {
      try { await send('controller_osc_configure', { port: Number(document.controllers.osc.port) }); } catch {}
    }
    if (Array.isArray(document.controllers?.items)) {
      for (const item of document.controllers.items) {
        if (!item?.trigger || !item?.target?.action) continue;
        try {
          const existing = (stateJson.controllers?.items || []).find((x) => x.id === item.id || triggerKeyOf(x.trigger) === triggerKeyOf(item.trigger));
          const target = JSON.parse(JSON.stringify(item.target));
          if (target.data) {
            if (target.data.input || target.data.inputName) {
              target.data.input = resolveInput(target.data.input, target.data.inputName);
              delete target.data.inputName;
            }
            if (target.action === 'macro_run') {
              target.data.id = macroIdMap.get(target.data.id)
                || (target.data.macroName ? (stateJson.macros?.items || []).find((x) => x.name === target.data.macroName)?.id : null)
                || target.data.id;
              delete target.data.macroName;
            }
          }
          const res = await send('controller_save', {
            ...(existing ? { id: existing.id } : {}),
            name: item.name,
            trigger: item.trigger,
            target,
            enabled: item.enabled !== false,
            midiFeedback: item.midiFeedback || null,
          });
          if (res?.state) stateJson = res.state;
          stats.shortcuts++;
        } catch {}
      }
    }
    return stats;
  }

  async function doImport(file) {
    if (!file) return;
    busy = true; note('Importando…');
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('O arquivo passa de 2 MB.');
      let document; try { document = JSON.parse(await file.text()); } catch { throw Error('O arquivo não é um JSON válido.'); }
      const isFull = document?.format === '3Mix Full Backup';
      const isShortcutsOnly = document?.format === '3Mix Shortcuts Bundle';
      const isSettingsBundle = document?.format === '3Mix Settings Bundle';
      const isBundle = isFull || isSettingsBundle;

      const opStats = (isFull || isShortcutsOnly || document?.controllers || document?.macros || document?.modulos)
        ? await importOperationalBundle(document)
        : { shortcuts: 0, macros: 0, triggers: 0, modulos: false, multiview: false };

      const parts = isBundle ? (document.entries || []) : (isShortcutsOnly ? [] : [{ view: document.view, document }]);
      const staged = [];
      for (const part of parts) {
        const v = await importOne(part.document, part.view, isBundle);
        if (v) staged.push(v);
      }
      if (staged.length && VIEW(selected).open) {
        selected = staged[0].id;
        activeParent = PARENT[selected] || selected;
      }
      E('content')._html = null; draw();
      const extraParts = [];
      if (opStats.shortcuts) extraParts.push(opStats.shortcuts + (opStats.shortcuts === 1 ? ' atalho restaurado' : ' atalhos restaurados'));
      if (opStats.macros) extraParts.push(opStats.macros + (opStats.macros === 1 ? ' macro restaurada' : ' macros restauradas'));
      if (opStats.modulos) extraParts.push('módulos restaurados');
      if (opStats.multiview) extraParts.push('montagens de Multiview restauradas');
      const extraText = extraParts.length ? ' (' + extraParts.join(', ') + ' já salvos).' : '.';

      if (staged.length) {
        note(staged.length + (staged.length === 1 ? ' categoria preparada' : ' categorias preparadas') + ' nos campos' + extraText + ' Confira o resumo e clique em Aplicar para gravar no motor.', 'ok');
      } else if (extraParts.length) {
        reloadEmbed();
        note('Importação concluída: ' + extraParts.join(', ') + '.', 'ok');
      } else {
        note('Nenhuma alteração diferente da configuração atual foi encontrada no arquivo.', 'ok');
      }
    } catch (e) { note(e.message, 'error'); }
    finally { busy = false; draw(); }
  }

  // ---- encoder panel and plugin tools ----
  function mountEncoder() {
    const box = E('encoder-panel');
    if (!box || box.dataset.mounted === '1') return;
    if (!window.FreeMixEncoderPanel?.mount) { box.textContent = 'Editor do encoder indisponível nesta instalação.'; return; }
    box.dataset.mounted = '1';
    window.FreeMixEncoderPanel.mount(box);
    if (context === 'recording' || context === 'streaming') {
      const select = box.querySelector('[data-target]'), value = context === 'recording' ? 'record' : 'stream';
      if (select) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); for (const option of [...select.options]) if (option.value !== value) option.remove(); }
    }
    const fix = () => { window.FreeMixSettingsHelp.decorate(box); for (const a of box.querySelectorAll('a[href^="/settings?"], a[href^="/configuracoes?"]')) { const url = new URL(a.href); url.searchParams.set('context', context); a.href = url.pathname + url.search; } };
    new MutationObserver(fix).observe(box, { childList: true, subtree: true });
    fix();
  }
  async function loadPluginTools() {
    try {
      const data = await settingsRequest('settings_plugin_tools');
      const box = E('plugin-tools');
      if (selected !== 'plugins' || !box) return;
      box.innerHTML = (data.tools || []).map((t) => '<button type="button" data-plugin-id="' + t.id + '" data-plugin-label="' + esc(t.label) + '"' + (t.enabled ? '' : ' disabled') + '>' + esc(t.label) + '</button>').join('')
        || '<p>Nenhuma ferramenta foi registrada pelos plugins desta instalação.</p>';
    } catch (e) { if (E('plugin-tools')) E('plugin-tools').textContent = e.message; }
  }
  async function nativeSettings(button) {
    if (button) button.disabled = true;
    try { await settingsRequest('settings_native'); note('Preferências completas abertas pelo programa.', 'ok'); }
    catch (e) { note(e.message, 'error'); }
    finally { if (button) button.disabled = false; }
  }
  async function openWindow(route) {
    try { const r = await fetch('/api/panel-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route }), signal: AbortSignal.timeout(8000) }); if ((await r.json()).success === true) return; } catch { /* outside the program */ }
    window.open(route, '_blank', 'noopener');
  }

  // ---- events ----
  E('categories').onclick = (e) => {
    const b = e.target.closest('button[data-category]');
    if (!b) return;
    const category = b.dataset.category;
    if (category === activeParent && selected === category) return;
    if (totalDrafts() && !confirm('Há alterações ainda não aplicadas. Mudar de categoria e mantê-las?')) return;
    selected = category; activeParent = category; params.set('category', selected); if (context !== 'general') params.set('context', context);
    history.replaceState(null, '', location.pathname + '?' + params);
    E('content')._html = null; E('message').dataset.auto = '1'; draw();
  };
  E('content').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-subtab]');
    if (!b) return;
    const id = b.dataset.subtab, parent = b.dataset.parent;
    if (!id || !SUBTABS[parent] || id === selected) return;
    if (totalDrafts() && !confirm('Há alterações ainda não aplicadas. Mudar de aba e mantê-las?')) return;
    selected = id; activeParent = parent; params.set('category', id); if (context !== 'general') params.set('context', context);
    history.replaceState(null, '', location.pathname + '?' + params);
    E('content')._html = null; E('message').dataset.auto = '1'; draw();
  });
  E('content').addEventListener('input', (e) => {
    const t = e.target, name = t.dataset?.field;
    if (!name) return;
    const id = t.dataset.view || selected;
    setDraft(id, name, t.type === 'checkbox' ? t.checked : t.value);
    t.dataset.dirty = 'true';
    const label = t.closest('label');
    if (label) {
      const f = fieldsOf(id).find((x) => x.name === name);
      label.classList.toggle('is-changed', Object.hasOwn(drafts.get(id) || {}, name));
      const diff = label.querySelector('.field-diff');
      if (f && !f.secret) {
        const html = '<span class="field-diff">' + esc(valueText(f, f.value)) + ' → <b>' + esc(valueText(f, isDirty(id) ? draftValue(id, name) : f.value)) + '</b></span>';
        if (diff) diff.outerHTML = html; else label.insertAdjacentHTML('beforeend', html);
      }
    }
    if (E('settings-diff')) E('settings-diff').outerHTML = diffCard();
    E('settings-dirty').hidden = totalDrafts() === 0;
    E('settings-dirty').textContent = '● ' + totalDrafts() + (totalDrafts() === 1 ? ' alteração não aplicada' : ' alterações não aplicadas');
    for (const id2 of ['apply', 'ok']) { const view = VIEW(selected), keyOnly = view.id === 'streaming' && isLive() && onlyStreamKeyPending(); E(id2).disabled = busy || (!isSupported(view, isLive()) && !keyOnly) || !totalDrafts(); }
    if (!E('message').dataset.auto || /não aplicad|pendente/i.test(E('message').textContent)) { say('Alterações ainda não aplicadas: confira o resumo e clique em Aplicar.'); E('message').dataset.auto = '1'; }
  });
  E('content').addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'protocol') { const current = E('f-streaming-encoder')?.value, list = encoderChoices('streaming'); const select = E('f-streaming-encoder'); if (select) select.innerHTML = list.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(l) + '</option>').join(''); }
    if (t.dataset?.field) t.dataset.dirty = 'true';
  });
  E('content').addEventListener('click', async (e) => {
    const reload = e.target.closest('[data-embed-reload]');
    if (reload) { reloadEmbed(); return; }
    const open = e.target.closest('[data-open-window]');
    if (open) { openWindow(open.dataset.openWindow); return; }
    const go = e.target.closest('[data-go]');
    if (go) { goTo(go.dataset.go); return; }
    if (e.target.closest('[data-native]')) { nativeSettings(e.currentTarget); return; }
    const tool = e.target.closest('[data-plugin-id]');
    if (tool) {
      tool.disabled = true;
      try { await settingsRequest('settings_plugin_open', { id: Number(tool.dataset.pluginId), label: tool.dataset.pluginLabel }); note('Ferramenta solicitada ao programa.', 'ok'); }
      catch (err) { note(err.message, 'error'); }
      finally { tool.disabled = false; }
    }
  });
  E('settings-search').addEventListener('input', renderSearch);
  E('settings-search').addEventListener('focus', renderSearch);
  E('settings-search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { E('settings-search').value = ''; renderSearch(); E('settings-search').blur(); }
    if (e.key === 'Enter') { const first = E('settings-search-results').querySelector('button'); if (first) { e.preventDefault(); first.click(); } }
  });
  E('settings-search-results').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goTo(b.dataset.view, b.dataset.field); });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.search-settings')) { const box = E('settings-search-results'); if (box) box.hidden = true; }
  });

  E('defaults').onclick = async () => {
    const view = VIEW(selected);
    busy = true; note('Lendo os valores de fábrica…');
    try {
      const doc = view.kind === 'workspace'
        ? { draft: { cardWidth: 180, audioLeft: false, modulesStacked: false, sideWidth: 0 } }
        : await settingsRequest('settings_defaults', { category: view.engine });
      const allowed = new Set(fieldsOf(view.id).map((f) => f.name));
      let count = 0;
      for (const [k, v] of Object.entries(doc?.draft || {})) {
        if (!allowed.has(k)) continue;
        const el = E('f-' + view.id + '-' + k); if (!el) continue;
        if (el.type === 'checkbox') el.checked = v === true || v === 'true'; else el.value = v;
        setDraft(view.id, k, el.type === 'checkbox' ? el.checked : el.value); count++;
      }
      if (!count) throw Error('O motor não informou valores de fábrica para esta categoria.');
      E('content')._html = null; draw();
      note('Valores de fábrica preparados nos campos. Confira atual → novo e clique em Aplicar.', 'ok');
    } catch (e) { note(e.message, 'error'); }
    finally { busy = false; draw(); }
  };
  E('export').onclick = doExport;
  E('import').onclick = () => { E('import-file').value = ''; E('import-file').click(); };
  E('import-file').onchange = () => { const file = E('import-file').files[0]; doImport(file); };
  E('cancel').onclick = () => {
    if (totalDrafts() && !confirm('Descartar ' + totalDrafts() + (totalDrafts() === 1 ? ' alteração não aplicada' : ' alterações não aplicadas') + ' e fechar?')) return;
    window.FreeMixClosePanel?.();
  };
  E('settings-close').onclick = () => E('cancel').click();
  E('apply').onclick = () => apply(false);
  E('ok').onclick = () => apply(true);
  E('native-open').onclick = (e) => nativeSettings(e.currentTarget);

  // ---- preview column ----
  const previewKey = '3mix.settings.preview';
  const setPreview = (shown) => {
    E('settings-layout').classList.toggle('preview-off', !shown);
    E('preview-toggle').setAttribute('aria-pressed', String(shown));
    try { localStorage.setItem(previewKey, shown ? '1' : '0'); } catch {}
  };
  E('preview-toggle').onclick = () => setPreview(E('settings-layout').classList.contains('preview-off'));
  try { if (localStorage.getItem(previewKey) === '0') setPreview(false); } catch {}

  // ---- keep in step with the engine state (recording/streaming/virtual camera) ----
  let lastSignature = '', lastOutRead = 0;
  setInterval(() => {
    if (!config || busy || document.hidden) return;
    const signature = JSON.stringify({ r: !!engineState().recording, s: !!engineState().streaming, v: !!config.virtualCamera });
    if (signature !== lastSignature) { lastSignature = signature; E('content')._html = null; draw(); }
    if (['video', 'streaming'].includes(selected) && Date.now() - lastOutRead > 15000) {
      lastOutRead = Date.now();
      fetch('/api/outputs', { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).then((v) => { if (v?.outputs) { outputs = v.outputs; outputsAt = Date.now(); if (['video', 'streaming'].includes(selected) && !document.querySelector('#content [data-view]:focus')) { E('content')._html = null; draw(); } } }).catch(() => {});
    }
  }, 1000);

  fetch('/api/modulos', { cache: 'no-store', signal: AbortSignal.timeout(5000) }).then((r) => r.json()).then((d) => {
    if (d?.modulos?.calls === false) hiddenByModule = new Set(['returns']);
    E('categories')._html = null;
    if (config) draw();
  }).catch(() => {});

  (async function start() {
    for (;;) {
      try { await load(); break; }
      catch (e) { say(e.message + ' Tentando de novo…', 'error'); await new Promise((r) => setTimeout(r, 1500)); }
    }
    E('message').dataset.auto = '1'; draw();
  })();

  // The preview module and legacy pages read the live configuration from here.
  window.FreeMixSettings = { get config() { return config; }, apply, goTo, reload: load };
})();
