document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('status-badge');
  const countYt = document.getElementById('count-yt');
  const countTt = document.getElementById('count-tt');
  const chkEnabled = document.getElementById('chk-enabled');
  const inputEndpoint = document.getElementById('input-endpoint');
  const btnSave = document.getElementById('btn-save');

  function update() {
    chrome.runtime.sendMessage({ action: 'GET_STATS' }, res => {
      if (!res) return;
      const { stats, config } = res;

      countYt.textContent = stats.youtubeCount || 0;
      countTt.textContent = stats.tiktokCount || 0;
      chkEnabled.checked = config.enabled;
      inputEndpoint.value = config.endpoint || 'http://127.0.0.1:3000';

      if (stats.connected) {
        badge.textContent = 'ONLINE';
        badge.className = 'status-badge online';
      } else {
        badge.textContent = 'STANDBY';
        badge.className = 'status-badge';
      }
    });
  }

  btnSave.addEventListener('click', () => {
    const config = {
      endpoint: inputEndpoint.value.trim().replace(/\/+$/, ''),
      enabled: chkEnabled.checked
    };
    chrome.runtime.sendMessage({ action: 'SET_CONFIG', config }, () => {
      badge.textContent = 'SALVO';
      setTimeout(update, 500);
    });
  });

  chkEnabled.addEventListener('change', () => {
    chrome.runtime.sendMessage({ action: 'SET_CONFIG', config: { enabled: chkEnabled.checked } });
  });

  update();
  setInterval(update, 2000);
});

