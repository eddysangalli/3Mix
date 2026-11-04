// 3Mix Social Capture — Background Service Worker
let config = {
  endpoint: 'http://127.0.0.1:3000',
  enabled: true
};

let stats = {
  youtubeCount: 0,
  tiktokCount: 0,
  totalSent: 0,
  lastSentAt: null,
  connected: false
};

// Carrega configurações salvas
chrome.storage.local.get(['config'], res => {
  if (res.config) config = { ...config, ...res.config };
});

async function sendTo3Mix(comment) {
  if (!config.enabled) return;

  try {
    const url = `${config.endpoint}/api/social`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'social_add',
        comment
      })
    });

    if (res.ok) {
      stats.totalSent++;
      stats.lastSentAt = Date.now();
      stats.connected = true;
      if (comment.network === 'youtube') stats.youtubeCount++;
      if (comment.network === 'tiktok') stats.tiktokCount++;
    } else {
      stats.connected = false;
    }
  } catch (err) {
    stats.connected = false;
  }
}

// Escuta mensagens dos content scripts
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'CAPTURE_MESSAGE' && req.data) {
    sendTo3Mix(req.data);
    sendResponse({ ok: true });
  } else if (req.action === 'GET_STATS') {
    sendResponse({ stats, config });
  } else if (req.action === 'SET_CONFIG') {
    config = { ...config, ...req.config };
    chrome.storage.local.set({ config });
    sendResponse({ ok: true, config });
  }
  return true;
});

