import { networkInterfaces } from 'node:os';

/**
 * 3Mix LiveLAN — Distribuição HLS / WebRTC de Programa para a Rede Local
 * Permite que diretores, apresentadores e espectadores na mesma rede Wi-Fi / LAN
 * acompanhem a transmissão ao vivo em smartphones, tablets e smart TVs
 * em uma interface limpa, sem controles de mesa de corte.
 */

// Guarda de segurança contra SSRF para streams HLS/HTTP externos
export function validateHlsUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') throw new Error('URL de HLS inválida');
  const trimmed = rawUrl.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Formato de URL inválido');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Apenas protocolos HTTP e HTTPS são permitidos para HLS');
  }

  const host = parsed.hostname.toLowerCase();

  // Bloqueio de Loopback, IPs privados de metadados e endereços perigosos (SSRF)
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === '169.254.169.254' || // AWS/GCP/Azure metadata
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    throw new Error(`Acesso ao host "${host}" bloqueado por segurança anti-SSRF`);
  }

  return parsed.toString();
}

export class LiveLanDistribution {
  constructor(options = {}) {
    this.port = options.port || 8088;
    this.enabled = true;
    this.clients = new Set();
    this.streamInfo = {
      title: '3Mix Broadcast LiveLAN',
      resolution: '1080p',
      fps: 30,
      active: true,
      bitrateKbps: 4500
    };
  }

  getLocalAddresses() {
    const interfaces = networkInterfaces();
    const addresses = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs || []) {
        if (addr.family === 'IPv4' && !addr.internal) {
          addresses.push({ interface: name, address: addr.address, url: `http://${addr.address}:${this.port}/livelan` });
        }
      }
    }
    return addresses;
  }

  addViewer(clientId) {
    this.clients.add(clientId);
  }

  removeViewer(clientId) {
    this.clients.delete(clientId);
  }

  getStatus() {
    return {
      enabled: this.enabled,
      viewerCount: this.clients.size,
      addresses: this.getLocalAddresses(),
      stream: this.streamInfo
    };
  }

  /**
   * Renderiza a página HTML limpa para os espectadores locais (celulares, tablets, TVs)
   */
  renderViewerPage() {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>3Mix · LiveLAN Transmissão Local</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090c10;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      padding: 10px 16px;
      background: #11151c;
      border-bottom: 1px solid #1f2937;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: none;
    }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 15px; letter-spacing: 0.5px; }
    .badge-live {
      background: #dc2626;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 3px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .viewport {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      position: relative;
    }
    .video-container {
      width: 100%;
      height: 100%;
      max-width: 1920px;
      max-height: 1080px;
      aspect-ratio: 16 / 9;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .video-container img, .video-container video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    footer {
      padding: 8px 16px;
      background: #0d1117;
      border-top: 1px solid #1f2937;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: #94a3b8;
      flex: none;
    }
    .btn-fs {
      background: #1f2937;
      border: 1px solid #374151;
      color: #fff;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11.5px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span style="color:#0284c7">3Mix</span>
      <span>LiveLAN</span>
      <span class="badge-live">● AO VIVO</span>
    </div>
    <div style="font-size:12px;color:#94a3b8;">Rede Local · Baixa Latência</div>
  </header>

  <div class="viewport" id="viewport">
    <div class="video-container" id="v-box">
      <!-- Exibe o stream do Programa atualizado em tempo real -->
      <img id="live-screen" src="/api/outputs/snapshot/preview?quality=75" alt="Em transmissão">
    </div>
  </div>

  <footer>
    <div id="status-info">Conectado · Visualizador de Programa</div>
    <button class="btn-fs" id="btn-fullscreen">Tela Cheia</button>
  </footer>

  <script>
    const img = document.getElementById('live-screen');
    const btnFs = document.getElementById('btn-fullscreen');
    const vp = document.getElementById('viewport');

    // Polling rápido de frames MJPEG/Snapshot em rede local (substitui HLS pesado para latência de 100ms)
    setInterval(() => {
      if (!document.hidden) {
        img.src = '/api/outputs/snapshot/preview?quality=75&t=' + Date.now();
      }
    }, 120);

    btnFs.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        vp.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  </script>
</body>
</html>`;
  }
}
