// 3Mix Social Capture — Content Script para TikTok Live Chat
(() => {
  console.log('[3Mix Social] Injetado no TikTok Live.');

  const sentCache = new Set();

  function processNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    // Seletor padrão de mensagem do TikTok Live
    let msgElem = node.matches?.('div[data-e2e="chat-message"]') ? node : node.querySelector?.('div[data-e2e="chat-message"]');
    if (!msgElem) {
      // Fallback para containers genéricos de chat do TikTok
      if (node.classList?.contains?.('chat-message') || node.querySelector?.('.chat-message')) {
        msgElem = node.classList?.contains?.('chat-message') ? node : node.querySelector('.chat-message');
      }
    }
    if (!msgElem) return;

    const authorElem = msgElem.querySelector('[data-e2e="chat-message-user-name"]') ||
                       msgElem.querySelector('.user-name') ||
                       msgElem.querySelector('span:first-child');
    const author = authorElem ? authorElem.textContent.replace(':', '').trim() : 'Usuário TikTok';

    const textElem = msgElem.querySelector('[data-e2e="chat-message-content"]') ||
                     msgElem.querySelector('.message-content') ||
                     msgElem.querySelector('span:last-child');
    const text = textElem ? textElem.textContent.trim() : '';
    if (!text || text === author) return;

    const hash = `${author}:${text}`;
    if (sentCache.has(hash)) return;
    sentCache.add(hash);
    if (sentCache.size > 2000) {
      const oldest = sentCache.values().next().value;
      sentCache.delete(oldest);
    }

    const imgElem = msgElem.querySelector('img');
    const avatar = imgElem ? imgElem.src : '';

    const payload = {
      network: 'tiktok',
      author,
      authorHandle: '@' + author.toLowerCase().replace(/\s+/g, '_'),
      text,
      avatar,
      color: '#00f2fe',
      at: Date.now()
    };

    chrome.runtime.sendMessage({ action: 'CAPTURE_MESSAGE', data: payload }).catch(() => {});
  }

  function startObserver() {
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          processNode(added);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[3Mix Social] Observador ativo no chat do TikTok Live.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();

