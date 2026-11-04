// 3Mix Social Capture — Content Script para YouTube Live Chat
(() => {
  console.log('[3Mix Social] Injetado no YouTube Live Chat.');

  const sentMessageIds = new Set();

  function processNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    // Mensagem comum ou Super Chat
    const isTextMessage = node.tagName === 'YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER';
    const isPaidMessage = node.tagName === 'YT-LIVE-CHAT-PAID-MESSAGE-RENDERER';

    if (!isTextMessage && !isPaidMessage) {
      // Pode ser container com filhos
      const children = node.querySelectorAll?.('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer');
      if (children && children.length) {
        children.forEach(processNode);
      }
      return;
    }

    const msgId = node.id || (node.getAttribute && node.getAttribute('id')) || '';
    if (msgId && sentMessageIds.has(msgId)) return;
    if (msgId) {
      sentMessageIds.add(msgId);
      if (sentMessageIds.size > 2000) {
        const oldest = sentMessageIds.values().next().value;
        sentMessageIds.delete(oldest);
      }
    }

    const authorElem = node.querySelector('#author-name');
    const author = authorElem ? authorElem.textContent.trim() : 'Anônimo';

    const messageElem = node.querySelector('#message');
    const text = messageElem ? messageElem.textContent.trim() : '';
    if (!text && !isPaidMessage) return;

    const imgElem = node.querySelector('#author-photo img, #img');
    const avatar = imgElem ? imgElem.src : '';

    let donation = null;
    if (isPaidMessage) {
      const amountElem = node.querySelector('#purchase-amount');
      if (amountElem) donation = amountElem.textContent.trim();
    }

    const payload = {
      network: 'youtube',
      author,
      authorHandle: author,
      text: text || (isPaidMessage ? `Super Chat: ${donation}` : ''),
      avatar,
      donation,
      color: '#ff0000',
      at: Date.now()
    };

    chrome.runtime.sendMessage({ action: 'CAPTURE_MESSAGE', data: payload }).catch(() => {});
  }

  function startObserver() {
    // Tenta encontrar o container da lista de chat
    const chatContainer = document.querySelector('#items.yt-live-chat-item-list-renderer') ||
                          document.querySelector('#chatframe') ||
                          document.body;

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          processNode(added);
        }
      }
    });

    observer.observe(chatContainer, { childList: true, subtree: true });
    console.log('[3Mix Social] Observador ativo no chat do YouTube.');
  }

  // Inicia quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();

