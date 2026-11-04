// 3Mix Social & Moderação — Controlador da Interface Web de Redes Sociais.
(() => {
  const $ = id => document.getElementById(id);

  let pollingTimer = null;

  async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw Error(err.error || 'Erro na requisição');
    }
    return res.json();
  }

  async function fetchSocial() {
    try {
      const data = await api('/api/social');
      renderUi(data);
    } catch (e) {
      console.warn('[Social Fetch Error]', e.message);
    }
  }

  function renderUi(data) {
    const summary = data.social || {};
    const list = data.list || {};

    // Contadores
    $('cnt-pending').textContent = summary.pendingCount ?? (list.pending?.length || 0);
    $('cnt-approved').textContent = summary.approvedCount ?? (list.approved?.length || 0);

    // Twitch status
    const twitch = summary.twitch || {};
    const twitchStatus = $('twitch-status');
    const btnTwitch = $('btn-twitch-connect');
    if (twitch.status === 'connected') {
      twitchStatus.textContent = `Ao vivo em #${twitch.channel}`;
      twitchStatus.style.color = '#34d17b';
      btnTwitch.textContent = 'Desconectar';
      btnTwitch.className = 'btn danger';
    } else if (twitch.status === 'connecting') {
      twitchStatus.textContent = 'Conectando…';
      twitchStatus.style.color = '#ffd324';
      btnTwitch.textContent = 'Cancelar';
    } else {
      twitchStatus.textContent = 'Desconectado';
      twitchStatus.style.color = '#888';
      btnTwitch.textContent = 'Conectar';
      btnTwitch.className = 'btn';
    }

    // Auto-Cycle
    const autoCycle = summary.autoCycle || {};
    $('chk-autocycle').checked = Boolean(autoCycle.enabled);
    if (autoCycle.interval) $('num-cycle-interval').value = autoCycle.interval;

    // Render lists
    renderPending(list.pending || []);
    renderApproved(list.approved || []);
    renderOnAir(summary.onAir || list.onAir || null);
    renderHistory(list.history || []);
  }

  function renderPending(items) {
    const container = $('list-pending');
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<div style="color:#666;text-align:center;padding:24px 0;">Nenhum comentário pendente.</div>';
      return;
    }
    items.forEach(item => {
      const card = createCard(item, [
        { label: '⚡ No Ar', class: 'btn primary', title: 'Aprova e joga imediatamente no ar no DSK ativo', click: async () => { await approveItem(item.id); await takeItem(item.id); } },
        { label: 'Aprovar', class: 'btn success', click: () => approveItem(item.id) },
        { label: '★', class: 'btn warning', title: 'Favoritar', click: () => favoriteItem(item.id, !item.favorite) },
        { label: 'Rejeitar', class: 'btn', click: () => rejectItem(item.id) },
        { label: 'Bloquear', class: 'btn danger', title: 'Bloquear usuário e descartar mensagens', click: () => blockUser(item.author) }
      ]);
      container.appendChild(card);
    });
  }

  function renderApproved(items) {
    const container = $('list-approved');
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<div style="color:#666;text-align:center;padding:24px 0;">Fila de transmissão vazia.<br>Aprove itens na coluna ao lado.</div>';
      return;
    }
    items.forEach(item => {
      const card = createCard(item, [
        { label: 'TAKE (NO AR)', class: 'btn primary', click: () => takeItem(item.id) },
        { label: 'Remover', class: 'btn', click: () => rejectItem(item.id) }
      ]);
      container.appendChild(card);
    });
  }

  function renderOnAir(item) {
    const box = $('live-box');
    const statusText = $('live-status-text');
    const btnClear = $('btn-clear-air');

    if (!item) {
      box.classList.remove('active');
      statusText.textContent = 'FORA DO AR';
      $('live-platform').textContent = '3Mix';
      $('live-platform').className = 'platform-icon platform-manual';
      $('live-author').textContent = 'Nenhum comentário no ar';
      $('live-text').textContent = 'Aprove comentários na coluna ao lado e clique em TAKE para colocar no ar.';
      btnClear.disabled = true;
      return;
    }

    box.classList.add('active');
    statusText.textContent = 'NO AR (AO VIVO)';
    btnClear.disabled = false;

    const plat = item.network || 'manual';
    $('live-platform').textContent = plat.toUpperCase();
    $('live-platform').className = `platform-icon platform-${plat}`;
    $('live-author').textContent = item.author + (item.authorHandle && item.authorHandle !== item.author ? ` (@${item.authorHandle})` : '');
    $('live-text').textContent = item.text;
  }

  function renderHistory(items) {
    const container = $('list-history');
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<div style="color:#555;font-size:11px;padding:8px 0;">Nenhum item exibido ainda nesta sessão.</div>';
      return;
    }
    items.slice(0, 15).forEach(item => {
      const card = createCard(item, [
        { label: 'Reexibir', class: 'btn', click: () => takeItem(item.id) }
      ]);
      container.appendChild(card);
    });
  }

  function createCard(item, actions = []) {
    const card = document.createElement('div');
    card.className = 'comment-card' + (item.favorite ? ' favorite' : '');

    const header = document.createElement('div');
    header.className = 'card-header';

    const userBadge = document.createElement('div');
    userBadge.className = 'user-badge';

    const plat = item.network || 'manual';
    const platIcon = document.createElement('span');
    platIcon.className = `platform-icon platform-${plat}`;
    platIcon.textContent = plat.toUpperCase();

    const authorSpan = document.createElement('span');
    authorSpan.className = 'author-name';
    authorSpan.textContent = item.author;

    userBadge.appendChild(platIcon);
    userBadge.appendChild(authorSpan);
    header.appendChild(userBadge);

    if (item.donation) {
      const don = document.createElement('span');
      don.style.background = '#2f6fed';
      don.style.color = '#fff';
      don.style.padding = '2px 6px';
      don.style.borderRadius = '3px';
      don.style.fontSize = '10px';
      don.style.fontWeight = 'bold';
      don.textContent = item.donation.amount || 'Doação';
      header.appendChild(don);
    }

    const textDiv = document.createElement('div');
    textDiv.className = 'comment-text';
    textDiv.textContent = item.text;

    card.appendChild(header);
    card.appendChild(textDiv);

    if (actions.length > 0) {
      const actDiv = document.createElement('div');
      actDiv.className = 'card-actions';
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = a.class || 'btn';
        btn.textContent = a.label;
        if (a.title) btn.title = a.title;
        btn.addEventListener('click', a.click);
        actDiv.appendChild(btn);
      });
      card.appendChild(actDiv);
    }

    return card;
  }

  // Ações do Operador
  async function approveItem(id) {
    try {
      const res = await api('/api/social', 'POST', { action: 'social_approve', id });
      renderUi(res);
    } catch (e) {
      alert('Erro ao aprovar: ' + e.message);
    }
  }

  async function rejectItem(id) {
    try {
      const res = await api('/api/social', 'POST', { action: 'social_reject', id });
      renderUi(res);
    } catch (e) {
      alert('Erro ao descartar: ' + e.message);
    }
  }

  async function favoriteItem(id, fav) {
    try {
      const res = await api('/api/social', 'POST', { action: 'social_favorite', id, favorite: fav });
      renderUi(res);
    } catch (e) {
      alert('Erro ao favoritar: ' + e.message);
    }
  }

  async function blockUser(author) {
    if (!confirm(`Deseja realmente bloquear "${author}" e descartar todas as mensagens dele?`)) return;
    try {
      const res = await api('/api/social', 'POST', { action: 'social_block', author });
      renderUi(res);
    } catch (e) {
      alert('Erro ao bloquear: ' + e.message);
    }
  }

  async function takeItem(id) {
    try {
      const res = await api('/api/social', 'POST', { action: 'social_take', id });
      renderUi(res);
    } catch (e) {
      alert('Erro ao colocar no ar: ' + e.message);
    }
  }

  async function clearAir() {
    try {
      const res = await api('/api/social', 'POST', { action: 'social_clear' });
      renderUi(res);
    } catch (e) {
      alert('Erro ao tirar do ar: ' + e.message);
    }
  }

  async function nextAir() {
    try {
      const res = await api('/api/social', 'POST', { action: 'social_next' });
      renderUi(res);
    } catch (e) {
      alert('Erro ao avançar: ' + e.message);
    }
  }

  async function onTwitchToggle() {
    const input = $('twitch-channel');
    const btn = $('btn-twitch-connect');
    if (btn.classList.contains('danger')) {
      // Desconectar
      const res = await api('/api/social', 'POST', { action: 'social_twitch_disconnect' });
      renderUi(res);
    } else {
      // Conectar
      const channel = input.value.trim();
      if (!channel) {
        alert('Digite o nome do canal da Twitch.');
        return;
      }
      try {
        const res = await api('/api/social', 'POST', { action: 'social_twitch_connect', channel });
        renderUi(res);
      } catch (e) {
        alert('Erro ao conectar na Twitch: ' + e.message);
      }
    }
  }

  async function onAutoCycleChange() {
    const enabled = $('chk-autocycle').checked;
    const interval = Number($('num-cycle-interval').value) || 10;
    try {
      const res = await api('/api/social', 'POST', { action: 'social_autocycle', enabled, interval });
      renderUi(res);
    } catch (e) {
      console.error(e);
    }
  }

  async function onManualComment() {
    const author = prompt('Nome do autor:', 'Espectador');
    if (!author || !author.trim()) return;
    const text = prompt('Texto do comentário:');
    if (!text || !text.trim()) return;

    try {
      const res = await api('/api/social', 'POST', {
        action: 'social_add',
        comment: {
          author: author.trim(),
          text: text.trim(),
          network: 'manual'
        }
      });
      renderUi(res);
    } catch (e) {
      alert('Erro ao adicionar comentário: ' + e.message);
    }
  }

  function init() {
    $('btn-refresh').addEventListener('click', fetchSocial);
    $('btn-clear-air').addEventListener('click', clearAir);
    $('btn-next-air').addEventListener('click', nextAir);
    $('btn-twitch-connect').addEventListener('click', onTwitchToggle);
    $('chk-autocycle').addEventListener('change', onAutoCycleChange);
    $('num-cycle-interval').addEventListener('change', onAutoCycleChange);
    $('btn-manual-comment').addEventListener('click', onManualComment);

    fetchSocial();
    pollingTimer = setInterval(fetchSocial, 3000);
  }

  window.addEventListener('DOMContentLoaded', init);
})();

