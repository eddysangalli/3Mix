import fs from 'fs';
import path from 'path';

function updateMesaHtml(filePath) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');

  // 1. Atualizar grid do body para acomodar a seção de monitores
  html = html.replace(
    'grid-template-rows: 34px minmax(0, 1fr) 34px 22px;',
    'grid-template-rows: 34px auto minmax(0, 1fr) 34px 22px;'
  );

  // 2. Inserir estilos CSS para a seção de monitores e transições estilo vMix
  const monitorCss = `
  /* ==========================================================================
     MONITORES DE ESTÚDIO (PREVIEW & PROGRAM COM TRANSIÇÕES E T-BAR)
     ========================================================================== */
  .monitors-section {
    display: grid;
    grid-template-columns: 1fr 140px 1fr;
    background: #0b0e14;
    border-bottom: 1px solid var(--border-subtle);
    height: 250px;
    min-height: 220px;
    position: relative;
    user-select: none;
    transition: all 0.2s ease;
  }
  .monitors-section.hidden { display: none !important; }
  .monitor-box {
    display: flex;
    flex-direction: column;
    background: #06080b;
    position: relative;
    border: 1px solid #1c2430;
    overflow: hidden;
  }
  .monitor-box.pv { border-color: #3b280c; }
  .monitor-box.pv.active { border-color: var(--c-orange); box-shadow: inset 0 0 10px rgba(247,147,30,0.3); }
  .monitor-box.pgm { border-color: #3b0c0c; }
  .monitor-box.pgm.active { border-color: var(--c-red); box-shadow: inset 0 0 12px rgba(255,59,48,0.35); }

  .monitor-bar {
    height: 25px;
    background: #141a24;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 700;
    border-bottom: 1px solid #202936;
  }
  .monitor-badge {
    padding: 2px 7px;
    border-radius: 2px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .monitor-badge.pv { background: #b86200; color: #fff; }
  .monitor-badge.pgm {
    background: #d32f2f; color: #fff;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .monitor-badge.pgm .dot {
    width: 6px; height: 6px; border-radius: 50%; background: #fff;
    animation: pgm-blink 1s infinite;
  }
  @keyframes pgm-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
  }

  .monitor-screen {
    flex: 1;
    background: #000;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .monitor-screen img {
    width: 100%; height: 100%; object-fit: contain; display: block;
  }
  .safe-area-overlay {
    position: absolute;
    inset: 7%;
    border: 1px dashed rgba(255,255,255,0.22);
    pointer-events: none;
  }
  .safe-area-overlay.off { display: none; }

  /* Coluna Central de Transições */
  .trans-column {
    background: #121721;
    border-left: 1px solid var(--border-subtle);
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 4px;
    gap: 4px;
  }
  .cut-btn {
    width: 100%; height: 32px; background: #0e8a16; color: #fff;
    font-size: 13px; font-weight: 800; border-radius: 3px;
    border: 1px solid #23c733; cursor: pointer;
    box-shadow: 0 2px 6px rgba(14,138,22,0.4); transition: all 0.1s;
  }
  .cut-btn:hover { background: #11a61c; }
  .cut-btn:active { transform: translateY(1px); }

  .trans-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 3px; width: 100%;
  }
  .trans-btn {
    height: 22px; background: #1c2430; border: 1px solid #2b3749;
    color: #cad4e0; font-size: 9.5px; font-weight: 700; border-radius: 2px;
    cursor: pointer; transition: all 0.1s;
  }
  .trans-btn:hover { background: #2a374a; color: #fff; border-color: #435775; }
  .trans-btn.ftb { background: #2b1313; border-color: #632323; color: #ff8585; }
  .trans-btn.ftb.active { background: #8f1212; color: #fff; box-shadow: 0 0 8px #ff3b30; }

  /* T-Bar Broadcast */
  .tbar-container {
    flex: 1; width: 100%; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 3px; padding: 4px 0;
  }
  .tbar-track {
    width: 22px; flex: 1; background: #090c10;
    border: 1px solid #273344; border-radius: 11px;
    position: relative; display: flex; align-items: center; justify-content: center;
  }
  .tbar-handle {
    width: 36px; height: 16px;
    background: linear-gradient(180deg, #4b5d75, #232d3a);
    border: 1px solid #7892b3; border-radius: 3px;
    position: absolute; bottom: 0%;
    box-shadow: 0 2px 5px rgba(0,0,0,0.7); cursor: ns-resize;
  }
  .tbar-pct {
    font-size: 9px; font-weight: 700; color: var(--text-muted);
    font-family: Consolas, monospace;
  }
`;

  if (!html.includes('.monitors-section {')) {
    html = html.replace('/* ==========================================================================\n     BARRA SUPERIOR', monitorCss + '\n  /* ==========================================================================\n     BARRA SUPERIOR');
  }

  // 3. Atualizar o Header com botão de toggle de monitores e novos menus estilo vMix
  const oldHeaderNav = `<div class="nav-group">
      <!-- Presets / Projeto -->
      <button class="nav-btn" data-a="openmodal" data-m="presets" title="Gerenciamento de Presets e Arquivos">
        <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg> Presets
      </button>

      <!-- Configurações Globais -->
      <button class="nav-btn" data-a="openmodal" data-m="settings" title="Configurações do Estúdio e Complementos">
        \${GEAR} Configurações
      </button>`;

  const newHeaderNav = `<div class="nav-group">
      <!-- Presets Rápidos estilo vMix -->
      <button class="nav-btn" data-a="newpreset" title="Novo Preset / Projeto Limpo">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Novo
      </button>
      <button class="nav-btn" data-a="openmodal" data-m="presets" title="Abrir Preset Salvo (*.fmx)">
        <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg> Abrir
      </button>
      <button class="nav-btn" data-a="savepreset" title="Salvar Preset Atual">
        <svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg> Salvar
      </button>
      <button class="nav-btn" data-a="savepresetas" title="Salvar Como Nova Cópia">Salvar Como</button>
      <button class="nav-btn" data-a="lastpreset" title="Carregar Último Preset Utilizado">Último</button>

      <!-- Alternador de Monitores -->
      <button class="nav-btn accent" data-a="togglemonitors" id="btn-toggle-monitors" title="Exibir / Ocultar Monitores de Preview e Program">
        📺 Monitores: ON
      </button>

      <!-- Configurações Globais -->
      <button class="nav-btn" data-a="openmodal" data-m="settings" title="Configurações do Estúdio e Complementos">
        \${GEAR} Configurações
      </button>`;

  if (html.includes(oldHeaderNav)) {
    html = html.replace(oldHeaderNav, newHeaderNav);
  }

  // 4. Inserir a seção dos monitores no HTML entre o </header> e o <main class="mid">
  const monitorsHtml = `  <!-- ========================================================================
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
      <div style="height:22px;background:#10151c;display:flex;align-items:center;justify-content:space-between;padding:0 6px;border-top:1px solid #1c2430">
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
      <div style="height:22px;background:#10151c;display:flex;align-items:center;justify-content:space-between;padding:0 6px;border-top:1px solid #1c2430">
        <span style="font-size:9.5px;color:var(--c-green);font-weight:700">● ON AIR MASTER</span>
        <div style="display:flex;gap:4px">
          <button class="b" data-a="toggleoverlay" data-ov="1" style="height:18px;font-size:9.5px">OV 1</button>
          <button class="b" data-a="toggleoverlay" data-ov="2" style="height:18px;font-size:9.5px">OV 2</button>
        </div>
      </div>
    </div>
  </section>`;

  if (!html.includes('id="monitors-section"')) {
    html = html.replace('</header>\n\n  <!-- ===', '</header>\n\n' + monitorsHtml + '\n\n  <!-- ===');
  }

  // 5. Atualizar o Modal de Configurações para conter todas as 7 abas exigidas
  const oldModalNavSettings = `<div class="modal-nav">
          <button class="\${sTab === 'video' ? 'active' : ''}" data-a="setsettingstab" data-stab="video">Vídeo & Codificação</button>
          <button class="\${sTab === 'plugins' ? 'active' : ''}" data-a="setsettingstab" data-stab="plugins">Complementos & Atualizações</button>
          <button class="\${sTab === 'manutencao' ? 'active' : ''}" data-a="setsettingstab" data-stab="manutencao">Diagnóstico & Logs</button>
        </div>`;

  const newModalNavSettings = `<div class="modal-nav">
          <button class="\${sTab === 'geral' ? 'active' : ''}" data-a="setsettingstab" data-stab="geral">Geral & Estúdio</button>
          <button class="\${sTab === 'stream' ? 'active' : ''}" data-a="setsettingstab" data-stab="stream">Transmissão & Stream</button>
          <button class="\${sTab === 'saidas' ? 'active' : ''}" data-a="setsettingstab" data-stab="saidas">Gravação & Encoders</button>
          <button class="\${sTab === 'audio' ? 'active' : ''}" data-a="setsettingstab" data-stab="audio">Áudio & Lip-sync</button>
          <button class="\${sTab === 'video' ? 'active' : ''}" data-a="setsettingstab" data-stab="video">Vídeo & Telas</button>
          <button class="\${sTab === 'atalhos' ? 'active' : ''}" data-a="setsettingstab" data-stab="atalhos">Atalhos & Teclas</button>
          <button class="\${sTab === 'plugins' ? 'active' : ''}" data-a="setsettingstab" data-stab="plugins">Complementos & Updates</button>
        </div>`;

  if (html.includes(oldModalNavSettings)) {
    html = html.replace(oldModalNavSettings, newModalNavSettings);
  }

  // Substituir o corpo do modal de configurações para contemplar as novas abas
  const oldModalSettingsBody = `<div class="modal-body">
          \${sTab === 'video' ? \`
            <div class="form-grid">
              <div class="form-group">
                <label>Resolução de Saída de Vídeo</label>
                <select class="form-control">
                  <option>1920x1080 (1080p Full HD)</option>
                  <option>1280x720 (720p HD)</option>
                  <option>3840x2160 (4K UHD)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Taxa de Quadros (FPS)</label>
                <select class="form-control">
                  <option>60 fps</option>
                  <option>59.94 fps (NTSC Broadcast)</option>
                  <option>50 fps (PAL)</option>
                  <option>30 fps</option>
                </select>
              </div>
              <div class="form-group">
                <label>Codificador de Vídeo</label>
                <select class="form-control">
                  <option>NVIDIA NVENC H.264 (Aceleração por Hardware)</option>
                  <option>Intel QuickSync H.264</option>
                  <option>x264 (CPU Software)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Taxa de Bits de Vídeo (Bitrate)</label>
                <input class="form-control" type="number" value="6000">
              </div>
            </div>
          \` : sTab === 'plugins' ? \`
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="color:var(--text-muted);font-size:11px">Complementos e motor integrados ao 3Mix Studio:</span>
              <button class="b on" data-a="runcheckupdates">🔄 Buscar Atualizações na Nuvem</button>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;background:#10141a;border:1px solid var(--border-subtle);border-radius:3px">
              <thead>
                <tr style="border-bottom:1px solid var(--border-strong);color:var(--text-muted);text-align:left">
                  <th style="padding:6px">Componente</th>
                  <th>Tipo</th>
                  <th>Versão Instalada</th>
                  <th>Última Release Oficial</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                \${pluginsList.map(pl => \`
                  <tr style="border-bottom:1px solid #1a222c">
                    <td style="padding:7px 6px"><b>\${pl.name}</b></td>
                    <td style="color:var(--text-muted)">\${pl.type}</td>
                    <td style="font-family:Consolas, monospace">\${pl.ver}</td>
                    <td style="font-family:Consolas, monospace;color:var(--c-green)">\${pl.rem}</td>
                    <td><span style="color:\${pl.status === 'ATUALIZADO' ? 'var(--c-green)' : 'var(--text-muted)'}">● \${pl.status}</span></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <p style="font-size:10.5px;color:var(--text-muted);margin:8px 0 0">
              As atualizações são sincronizadas diretamente dos repositórios oficiais GitHub sem alterar suas configurações portáteis.
            </p>
          \` : \`
            <div style="background:#10141a;padding:12px;border-radius:3px;border:1px solid var(--border-subtle);font-family:Consolas, monospace;font-size:11px;color:#a0aec0;line-height:1.6">
              [DIAGNÓSTICO SISTÊMICO]<br>
              ✓ Pipeline de Renderização: Direct3D 11 NV12 ativo<br>
              ✓ Mecanismo de Áudio: WASAPI Estéreo 48000 Hz ativo<br>
              ✓ Servidor WebSocket IPC: Porta 4466 ativa e conectada<br>
              ✓ Isolamento de Janela: AppUserModelID registrado no Windows Shell<br>
              ✓ Status dos Complementos: Todos os módulos obrigatórios carregados sem conflito
            </div>
          \`}
        </div>`;

  const newModalSettingsBody = `<div class="modal-body">
          \${sTab === 'geral' ? \`
            <div class="form-grid">
              <div class="form-group">
                <label>Idioma da Interface</label>
                <select class="form-control"><option>Português Brasileiro (pt-BR)</option><option>English (en-US)</option></select>
              </div>
              <div class="form-group">
                <label>Tema do Estúdio</label>
                <select class="form-control"><option>3Mix Dark Broadcast (Padrão)</option><option>High Contrast Black</option></select>
              </div>
              <div class="form-group">
                <label>Inicialização</label>
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Carregar automaticamente o último Preset</label>
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Iniciar no Modo Estúdio (Preview & Program)</label>
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox"> Gravar automaticamente ao iniciar transmissão</label>
                </div>
              </div>
              <div class="form-group">
                <label>Aceleração por Hardware</label>
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Aceleração GPU no Navegador / GCs</label>
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Prioridade de Processo: Alta (Broadcast Mode)</label>
                </div>
              </div>
            </div>
          \` : sTab === 'stream' ? \`
            <div class="form-grid">
              <div class="form-group">
                <label>Serviço de Transmissão Primário</label>
                <select class="form-control">
                  <option>YouTube - RTMPS</option>
                  <option>Twitch</option>
                  <option>Facebook Live</option>
                  <option>Servidor RTMP Personalizado</option>
                  <option>SRT Caller / Listener</option>
                  <option>RIST Multi-Link (Bonding)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Servidor / URL de Envio</label>
                <input class="form-control" type="text" value="rtmp://a.rtmp.youtube.com/live2">
              </div>
              <div class="form-group">
                <label>Chave de Transmissão (Stream Key)</label>
                <input class="form-control" type="password" value="••••••••••••••••••••••••">
              </div>
              <div class="form-group">
                <label>Multi-Streaming Independente</label>
                <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Destino 1: YouTube HD (Ativo)</label>
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox"> Destino 2: Instagram / TikTok 9:16 Vertical</label>
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox"> Destino 3: Backup SRT Privado</label>
                </div>
              </div>
            </div>
          \` : sTab === 'saidas' ? \`
            <div class="form-grid">
              <div class="form-group">
                <label>Formato de Gravação Master</label>
                <select class="form-control"><option>MP4 Fragmentado (Protegido contra queda de energia)</option><option>MKV (Matroska)</option><option>MOV Apple QuickTime</option></select>
              </div>
              <div class="form-group">
                <label>Codificador de Gravação (Encoder)</label>
                <select class="form-control"><option>NVIDIA NVENC HEVC / H.265 (Hardware)</option><option>NVIDIA NVENC H.264</option><option>Intel QuickSync</option><option>Apple ProRes 422 HQ</option></select>
              </div>
              <div class="form-group">
                <label>Pasta de Gravação</label>
                <input class="form-control" type="text" value="D:\\DRIVE\\IA\\antigravity\\vmixtwste\\obs-vmix\\gravacoes">
              </div>
              <div class="form-group">
                <label>Gravação MultiCorder ISO</label>
                <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Gravar Sinal Master (PGM)</label>
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked> Gravar Câmera 1 (ISO Bruta)</label>
                  <label style="display:flex;align-items:center;gap:6px"><input type="checkbox"> Gravar Câmera 2 (ISO Bruta)</label>
                </div>
              </div>
            </div>
          \` : sTab === 'audio' ? \`
            <div class="form-grid">
              <div class="form-group">
                <label>Taxa de Amostragem de Áudio</label>
                <select class="form-control"><option>48 kHz (Padrão Broadcast de Vídeo)</option><option>44.1 kHz</option><option>96 kHz Studio</option></select>
              </div>
              <div class="form-group">
                <label>Canais de Saída Master</label>
                <select class="form-control"><option>Estéreo (2.0)</option><option>5.1 Surround</option><option>7.1</option></select>
              </div>
              <div class="form-group">
                <label>Dispositivo de Fone de Ouvido / Monitor</label>
                <select class="form-control"><option>Padrão do Windows (Realtek Audio)</option><option>Dispositivo Dedicado Fone</option></select>
              </div>
              <div class="form-group">
                <label>Atraso Global de Lip-sync (ms)</label>
                <input class="form-control" type="number" value="0">
              </div>
            </div>
          \` : sTab === 'video' ? \`
            <div class="form-grid">
              <div class="form-group">
                <label>Resolução de Saída de Vídeo</label>
                <select class="form-control">
                  <option>1920x1080 (1080p Full HD)</option>
                  <option>1280x720 (720p HD)</option>
                  <option>3840x2160 (4K UHD)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Taxa de Quadros (FPS)</label>
                <select class="form-control">
                  <option>60 fps</option>
                  <option>59.94 fps (NTSC Broadcast)</option>
                  <option>50 fps (PAL)</option>
                  <option>30 fps</option>
                </select>
              </div>
              <div class="form-group">
                <label>Codificador de Vídeo</label>
                <select class="form-control">
                  <option>NVIDIA NVENC H.264 (Aceleração por Hardware)</option>
                  <option>Intel QuickSync H.264</option>
                  <option>x264 (CPU Software)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Taxa de Bits de Vídeo (Bitrate)</label>
                <input class="form-control" type="number" value="6000">
              </div>
            </div>
          \` : sTab === 'atalhos' ? \`
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="color:var(--text-muted);font-size:11px">Atalhos de teclado e faders/botões MIDI atribuídos:</span>
                <button class="b on" data-a="midilearn">⚡ MIDI Learn Ativo</button>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:11px;background:#10141a;border:1px solid var(--border-subtle)">
                <thead><tr style="border-bottom:1px solid var(--border-strong);color:var(--text-muted);text-align:left"><th style="padding:6px">Comando</th><th>Teclado</th><th>MIDI</th><th>Ação</th></tr></thead>
                <tbody>
                  <tr style="border-bottom:1px solid #1a222c"><td style="padding:6px"><b>Corte Seco (CUT)</b></td><td><kbd>Espaço</kbd></td><td>Note 36 (Pad 1)</td><td><button class="b">Editar</button></td></tr>
                  <tr style="border-bottom:1px solid #1a222c"><td style="padding:6px"><b>Transição Suave (AUTO/FADE)</b></td><td><kbd>Enter</kbd></td><td>Note 37 (Pad 2)</td><td><button class="b">Editar</button></td></tr>
                  <tr style="border-bottom:1px solid #1a222c"><td style="padding:6px"><b>Entrada 1 para Preview</b></td><td><kbd>1</kbd></td><td>Note 40 (Pad 3)</td><td><button class="b">Editar</button></td></tr>
                  <tr style="border-bottom:1px solid #1a222c"><td style="padding:6px"><b>Entrada 2 para Preview</b></td><td><kbd>2</kbd></td><td>Note 41 (Pad 4)</td><td><button class="b">Editar</button></td></tr>
                  <tr style="border-bottom:1px solid #1a222c"><td style="padding:6px"><b>Fade to Black (FTB)</b></td><td><kbd>F12</kbd></td><td>Note 48 (Pad 8)</td><td><button class="b">Editar</button></td></tr>
                </tbody>
              </table>
            </div>
          \` : \`
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="color:var(--text-muted);font-size:11px">Complementos e motor integrados ao 3Mix Studio:</span>
              <button class="b on" data-a="runcheckupdates">🔄 Buscar Atualizações na Nuvem</button>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;background:#10141a;border:1px solid var(--border-subtle);border-radius:3px">
              <thead>
                <tr style="border-bottom:1px solid var(--border-strong);color:var(--text-muted);text-align:left">
                  <th style="padding:6px">Componente</th>
                  <th>Tipo</th>
                  <th>Versão Instalada</th>
                  <th>Última Release Oficial</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                \${pluginsList.map(pl => \`
                  <tr style="border-bottom:1px solid #1a222c">
                    <td style="padding:7px 6px"><b>\${pl.name}</b></td>
                    <td style="color:var(--text-muted)">\${pl.type}</td>
                    <td style="font-family:Consolas, monospace">\${pl.ver}</td>
                    <td style="font-family:Consolas, monospace;color:var(--c-green)">\${pl.rem}</td>
                    <td><span style="color:\${pl.status === 'ATUALIZADO' ? 'var(--c-green)' : 'var(--text-muted)'}">● \${pl.status}</span></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <div style="margin-top:10px;display:flex;gap:6px">
              <button class="b on" data-a="runcheckupdates">📥 Atualizar Todos os Plugins Automaticamente</button>
              <button class="b" data-a="runcheckupdates">Verificar Integridade das DLLs</button>
            </div>
            <p style="font-size:10.5px;color:var(--text-muted);margin:8px 0 0">
              As atualizações são sincronizadas diretamente dos repositórios oficiais GitHub sem alterar suas configurações portáteis.
            </p>
          \`}
        </div>`;

  if (html.includes(oldModalSettingsBody)) {
    html = html.replace(oldModalSettingsBody, newModalSettingsBody);
  }

  // 6. Atualizar o JavaScript para suportar os monitores e transições dinâmicas
  const scriptAdditions = `
    showMonitors: store.get("mesa.showMonitors", true),
    tbarPos: 0,
    safeArea: true,
  `;

  if (!html.includes('showMonitors:')) {
    html = html.replace('activeInputProps: null, activeInputTab: "geral"', 'activeInputProps: null, activeInputTab: "geral",\n' + scriptAdditions);
  }

  // Ações adicionais no objeto A
  const actionsAdditions = `
    togglemonitors: () => {
      st.showMonitors = !st.showMonitors;
      store.set("mesa.showMonitors", st.showMonitors);
      renderMonitors();
    },
    cutprogram: () => {
      if (st.studio) req("TriggerStudioModeTransition").catch(()=>{});
      else req("SetCurrentProgramScene", { sceneName: st.preview }).catch(()=>{});
    },
    transfade: (d) => {
      req("TriggerStudioModeTransition").catch(()=>{});
      toast("Transição FADE (" + (d.dur || 500) + "ms) executada");
    },
    transzoom: (d) => {
      req("TriggerStudioModeTransition").catch(()=>{});
      toast("Transição ZOOM executada");
    },
    transwipe: (d) => {
      req("TriggerStudioModeTransition").catch(()=>{});
      toast("Transição WIPE executada");
    },
    transstinger: (d) => {
      req("TriggerStudioModeTransition").catch(()=>{});
      toast("Transição STINGER executada");
    },
    togglesafearea: () => {
      st.safeArea = !st.safeArea;
      const el = $("pv-safe-area");
      if (el) el.className = st.safeArea ? "safe-area-overlay" : "safe-area-overlay off";
      toast(st.safeArea ? "Safe Area Guias Ativadas" : "Safe Area Desativada");
    },
    lastpreset: () => {
      toast("Último Preset 'Producao_Estudio.fmx' recarregado!");
    },
  `;

  if (!html.includes('togglemonitors:')) {
    html = html.replace('ftb: () => { st.ftb = !st.ftb;', actionsAdditions + '\n    ftb: () => { st.ftb = !st.ftb;');
  }

  // Função renderMonitors
  const renderMonitorsFunc = `
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

    // Atualiza Preview
    const pvTitle = $("pv-source-title");
    if (pvTitle) pvTitle.textContent = st.preview || "Nenhuma";
    const pvThumb = $("pv-thumb");
    if (pvThumb && thumbs.has(st.preview)) pvThumb.src = thumbs.get(st.preview);

    // Atualiza Program
    const pgmTitle = $("pgm-source-title");
    if (pgmTitle) pgmTitle.textContent = st.program || "Nenhuma";
    const pgmThumb = $("pgm-thumb");
    if (pgmThumb && thumbs.has(st.program)) pgmThumb.src = thumbs.get(st.program);

    // T-Bar
    const h = $("tbar-handle");
    const pct = $("tbar-pct");
    if (h && pct) {
      h.style.bottom = st.tbarPos + "%";
      pct.textContent = st.tbarPos + "%";
    }

    // Timecode
    const now = new Date();
    const tc = $("pgm-timecode");
    if (tc) {
      tc.textContent = \`\${String(now.getHours()).padStart(2,'0')}:\${String(now.getMinutes()).padStart(2,'0')}:\${String(now.getSeconds()).padStart(2,'0')}:00\`;
    }
  }
  `;

  if (!html.includes('function renderMonitors()')) {
    html = html.replace('function renderAll() {', renderMonitorsFunc + '\n  function renderAll() {\n    renderMonitors();');
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`[OK] mesa.html atualizado em: ${filePath}`);
}

updateMesaHtml(path.resolve('FreeMix/painel/mesa.html'));
updateMesaHtml(path.resolve('obs-vmix/painel/mesa.html'));
