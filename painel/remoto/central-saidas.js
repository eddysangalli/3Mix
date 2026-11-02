// Central unica de Saidas: matriz simples no topo (destino / origem de video / origem de audio / estado) mais os
// tres editores reais embutidos por iframe same-origin (mesmo padrao ja testado em settings.js para /audio, /replay
// etc.) - nenhuma logica de saidas.js/aux.js/externo.js e duplicada aqui, so reaproveitada e re-skinada p/ grafite.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function openWindow(route) {
    try { const r = await fetch('/api/panel-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route }), signal: AbortSignal.timeout(8000) }); if ((await r.json()).success === true) return; } catch { /* outside the program */ }
    window.open(route, '_blank', 'noopener');
  }

  const EMBED_BASE_CSS = `
    html.embed-3mix { display: block !important; height: 100% !important; margin: 0 !important; padding: 0 !important; }
    html.embed-3mix, html.embed-3mix body { min-height: 0 !important; background:#111318 !important; color:#e8ebef !important; }
    html.embed-3mix body { height: 100% !important; margin: 0 !important; font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif !important; }
    html.embed-3mix #close-btn, html.embed-3mix .vd-bar button[onclick*="FreeMixClosePanel"] { display: none !important; }
    html.embed-3mix h1,h2,h3 { color:#fff !important; }
    html.embed-3mix table { border:1px solid #2a2e35 !important; }
    html.embed-3mix th { background:#181c22 !important; color:#7d8592 !important; }
    html.embed-3mix td { background:#14171c !important; color:#e8ebef !important; border-bottom:1px solid #22262d !important; }
  `;
  const EMBED_CHROME = {
    saidas: `
      html.embed-3mix .output-navigation, html.embed-3mix .workspace nav, html.embed-3mix .content,
      html.embed-3mix section, html.embed-3mix .vd-status { background:#14171c !important; border-color:#2a2e35 !important; }
      html.embed-3mix main { max-width:none !important; padding:12px !important; }
    `,
    aux: `
      html.embed-3mix :root, html.embed-3mix { --bg-dark:#111318 !important; --panel-bg:#14171c !important; --card-bg:#1a1d23 !important; --card-hover:#22262d !important; --border-color:#2a2e35 !important; --accent-blue:#2f9e5f !important; --accent-cyan:#2f9e5f !important; }
      html.embed-3mix header { background:#14171c !important; border-color:#2a2e35 !important; }
    `,
    externo: `
      html.embed-3mix body.ext-page { overflow:auto !important; }
      html.embed-3mix .vd-window.ext-window { width:100% !important; height:100% !important; margin:0 !important; border:0 !important; box-shadow:none !important; }
    `,
  };

  function decorateEmbed(frame, id) {
    let doc; try { doc = frame.contentDocument; } catch { doc = null; }
    if (!doc?.documentElement) return;
    let style = doc.getElementById('3mix-embed-chrome');
    if (!style) { style = doc.createElement('style'); style.id = '3mix-embed-chrome'; (doc.head || doc.documentElement).appendChild(style); }
    style.textContent = EMBED_BASE_CSS + (EMBED_CHROME[id] || '');
    doc.documentElement.classList.add('embed-3mix');
    if (doc.body) doc.body.classList.add('embed-3mix');
    if (!doc.documentElement.dataset.embedLinks) {
      doc.documentElement.dataset.embedLinks = '1';
      doc.addEventListener('click', (event) => {
        const link = event.target?.closest?.('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || link.hasAttribute('download') || link.target === '_blank') return;
        const href = link.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        let url; try { url = new URL(link.href, doc.baseURI); } catch { return; }
        if (url.origin !== location.origin) return;
        event.preventDefault();
        openWindow(url.pathname + url.search + url.hash);
      }, true);
    }
  }

  for (const frame of document.querySelectorAll('iframe[data-embed]')) {
    frame.addEventListener('load', () => decorateEmbed(frame, frame.dataset.embed));
  }
  for (const button of document.querySelectorAll('[data-embed-reload]')) {
    button.onclick = () => { const frame = E('cs-frame-' + button.dataset.embedReload); if (frame) frame.src = frame.src; };
  }
  for (const button of document.querySelectorAll('[data-open-window]')) {
    button.onclick = () => openWindow(button.dataset.openWindow);
  }

  function sourceBadge(kind, label) {
    const cls = kind === 'me' ? 'cs-me' : kind === 'aux' ? 'cs-aux' : 'cs-input';
    const tag = kind === 'me' ? 'M/E' : kind === 'aux' ? 'AUX' : 'INPUT';
    return '<span class="cs-source ' + cls + '">' + tag + '</span> ' + esc(label);
  }
  function destinationVideoOrigin(d, inputsByKey) {
    if (d.mode === 'mix') return sourceBadge('me', 'M/E ' + (d.mixId || 2) + ' - Saida');
    if (d.mode === 'program') return sourceBadge('input', 'Programa principal');
    if (d.mode === 'clean') return sourceBadge('input', 'Programa limpo (sem overlays)');
    if (d.mode === 'preview') return sourceBadge('input', 'Preview principal');
    if (d.mode === 'source' && d.sourceUuid) return sourceBadge('input', inputsByKey.get(d.sourceUuid) || 'Entrada selecionada');
    return sourceBadge('input', 'Compartilha Saida 1');
  }
  function destinationAudioOrigin(d) {
    if (d.audioSourceUuid) return 'Bus independente';
    return ['Master', 'Bus A', 'Bus B'][d.audioTrack || 0] || 'Master';
  }

  async function readJson(path) {
    const r = await fetch(path, { signal: AbortSignal.timeout(8000) });
    const v = await r.json();
    if (!r.ok || v.success === false) throw Error(v.error || ('Falha ao consultar ' + path));
    return v;
  }

  async function refreshMatrix() {
    try {
      const [outputsRes, auxRes] = await Promise.all([readJson('/api/outputs'), readJson('/api/aux-routing').catch(() => null)]);
      const outputs = outputsRes.outputs, inputsByKey = new Map((window.FreeMixRemote?.getState?.().inputs || []).map((i) => [i.key, i.name]));
      const rows = [];
      rows.push(['Transmissao principal', sourceBadge('input', 'Programa principal'), 'Master', outputs.main_active ? 'on' : 'ready', outputs.main_active ? 'NO AR' : 'pronta']);
      (outputs.destinations || []).forEach((d, i) => {
        rows.push(['Saida ' + (i + 2) + (d.name ? ' - ' + d.name : ''), destinationVideoOrigin(d, inputsByKey), destinationAudioOrigin(d), d.active ? 'on' : 'ready', d.active ? (d.recording ? 'GRAVANDO' : 'NO AR') : (d.enabled ? 'pronta' : 'desligada')]);
      });
      for (const proto of ['ndi', 'omt']) {
        const senders = outputs[proto]?.senders || [];
        senders.forEach((s, i) => {
          if (!s.active && !s.outputCreated) return;
          rows.push([proto.toUpperCase() + ' ' + (i + 1), sourceBadge('input', s.mode === 'source' ? (inputsByKey.get(s.sourceUuid) || 'Entrada propria') : 'Programa principal'), s.audioSourceUuid ? 'Bus independente' : ['Master', 'Bus A', 'Bus B'][s.audioTrack || 0], s.active ? 'on' : 'ready', s.active ? 'ENVIANDO' : 'parado']);
        });
      }
      for (const bus of auxRes?.matrix?.buses || []) {
        if (!bus.active) continue;
        const label = bus.sourceType === 'mix' ? 'M/E ' + bus.sourceId + ' - Saida' : bus.sourceType === 'input' ? (inputsByKey.get(bus.sourceId) || bus.sourceName) : bus.sourceName;
        rows.push([bus.name, sourceBadge('aux', label || bus.sourceName), bus.audioBus === 'follow_video' ? 'Acompanha o video' : (bus.audioBus || 'Master'), 'ready', 'roteamento salvo']);
      }
      E('cs-matrix-rows').innerHTML = rows.map(([name, video, audio, cls, state]) =>
        '<tr class="cs-row-detail"><td>' + esc(name) + '</td><td>' + video + '</td><td class="cs-audio">' + esc(audio) + '</td><td><span class="cs-state ' + cls + '">' + esc(state) + '</span></td></tr>'
      ).join('') || '<tr><td colspan="4">Nenhuma saida configurada ainda.</td></tr>';
      E('cs-state').textContent = 'Conectado';
    } catch (e) {
      E('cs-matrix-rows').innerHTML = '<tr><td colspan="4">' + esc(e.message) + '</td></tr>';
      E('cs-state').textContent = 'Sem leitura do motor';
    }
  }

  refreshMatrix();
  setInterval(refreshMatrix, 3000);
})();
