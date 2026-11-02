/* View only. Commands, SSD recording, history and playback remain in replay.js. */
(() => {
  const player = id => `<section class="player-deck deck-card deck-${id.toLowerCase()}" id="deck-${id.toLowerCase()}-card" data-player="${id}" onclick="selectDeck('${id}',this)">
    <header class="player-head">
      <span class="player-name">PLAYER ${id}</span>
      <span id="player-${id}" class="player-source">Nenhum lance carregado</span>
      <span id="deck-${id.toLowerCase()}-speed" class="deck-speed" title="Velocidade do slow-motion">50%</span>
      <span id="player-${id.toLowerCase()}-badge" class="badge-loaded">VAZIO</span>
    </header>
    <div class="player-screen">
      <img id="replay-frame-${id}" alt="Prévia real do Player ${id}" hidden>
      <span id="replay-empty-${id}" class="replay-empty">Carregue um lance no Player ${id}</span>
      <div class="player-missing" id="missing-${id}" hidden>
        <strong>ARQUIVO AUSENTE</strong>
        <span id="missing-${id}-text">O player guarda uma referência, mas o vídeo não está no disco.</span>
        <div class="missing-actions">
          <button type="button" data-missing-locate data-player="${id}">Localizar arquivo</button>
          <button type="button" data-missing-relink>Religar pasta de gravações</button>
          <button type="button" class="danger" data-missing-remove data-player="${id}">Remover referência</button>
        </div>
      </div>
      <div class="player-overlay" onclick="event.stopPropagation()">
        <div class="player-position"><span id="position-${id}">00:00 / 00:00</span><input id="seek-${id}" type="range" class="timeline" min="0" max="0" value="0" disabled onchange="seekPlayer('${id}',this.value)"></div>
      </div>
    </div>
    <div class="transport-btns" onclick="event.stopPropagation()">
      <button data-rp-command title="Ir para o IN do clipe" onclick="request('seek',{player:'${id}',cursor:0})">|◀ IN</button>
      <button data-rp-command title="Um quadro para trás" onclick="request('frame',{player:'${id}',delta:-1})">◀ 1q</button>
      <button data-rp-command class="play" id="transport-${id}" title="Reproduzir" onclick="toggleTransport('${id}')">▶</button>
      <button data-rp-command title="Um quadro para frente" onclick="request('frame',{player:'${id}',delta:1})">1q ▶</button>
      <button data-rp-command title="Ir para o OUT do clipe" onclick="request('seek',{player:'${id}',cursor:Number(document.getElementById('seek-${id}').max)||0})">OUT ▶|</button>
    </div>
  </section>`;
  const header=document.querySelector('.replay-topbar');
  header.innerHTML=window.FreeMixWorkspaceNav.nav('replay','replay-project')
    +`<div class="topbar-right">
        <span id="clock-txt" class="topbar-clock"></span>
        <button type="button" id="save-project" class="btn-topbar" onclick="saveProjectNotice()" title="Confirma o projeto em uso; o OBS salva a cena automaticamente">Confirmar projeto</button>
        <button type="button" id="open-replay-settings" class="btn-topbar" onclick="document.getElementById('replay-settings').showModal()" title="Câmeras, gravação e retenção do Replay">⚙ Configurações</button>
      </div>`;
  const brand=header.querySelector('.workspace-brand');
  if(brand){
    brand.innerHTML='<img class="brand-logo" src="/img/3mix-logo.png" alt="3Mix">';
    brand.title='3Mix · Replay';
  }
  window.FreeMixWorkspaceNav.bind(header,'replay');

  document.querySelector('.replay-subbar').innerHTML=`
    <div class="rec-cluster">
      <span class="ssd-pill" id="rec-status">Conectando…</span>
      <button id="record-btn" data-rp-command onclick="toggleRecording()" title="Iniciar ou parar a gravação SSD desta produção">Gravação SSD</button>
      <span id="replay-disk">Disco: consultando…</span>
    </div>
    <div class="speed-cluster">
      <label class="speed-inline"><span class="speed-cap">Slow-motion</span><select id="speed-select" onchange="setSpeed(this.value)"><option value="100">100%</option><option value="75">75%</option><option value="50" selected>50%</option><option value="25">25%</option></select><span id="speed-lbl" hidden>50%</span></label>
      <button id="link-players" data-rp-command onclick="request('link',{enabled:!replay?.linked})" title="Vincular ou desvincular o transporte dos Players A/B">Vincular Players A/B</button>
      <small id="sync-status"></small>
    </div>
    <div class="quick-capture-group">
      <span>Capturas</span>
      <button data-rp-command data-rp-record onclick="quickClip(5)" title="Capturar os últimos 5 segundos (requer gravação SSD ativa)">−5 s</button>
      <button data-rp-command data-rp-record onclick="quickClip(10)" title="Capturar os últimos 10 segundos (requer gravação SSD ativa)">−10 s</button>
      <button data-rp-command data-rp-record onclick="quickClip(20)" title="Capturar os últimos 20 segundos (requer gravação SSD ativa)">−20 s</button>
      <button data-rp-command data-rp-record class="btn-mark-in" onclick="markIn()" title="Marcar o IN do próximo lance (requer gravação SSD ativa)">MARCAR IN</button>
      <button data-rp-command data-rp-record class="btn-mark-out" onclick="markOut()" title="Marcar o OUT e salvar o lance (requer gravação SSD ativa)">MARCAR OUT</button>
    </div>`;

  document.querySelector('.replay-main').innerHTML=`
    <div class="replay-monitors-row">${player('A')}${player('B')}
      <section class="quad-card" id="replay-history">
        <header class="quad-head">
          <span class="quad-title">QUADVIEW <span class="hist-pill">HISTÓRICO</span></span>
          <span class="quad-meta"><span id="quad-cameras" class="quad-cameras">—</span><span id="quad-timecode" class="timecode">--:--:--:--</span></span>
        </header>
        <div class="quad-grid" id="quad-grid">
          <div class="quad-tile" data-slot="0"><span class="quad-flag"></span><img alt="Quadro do histórico" hidden><span class="quad-empty">Aguardando histórico</span><span class="quad-label">—</span></div>
          <div class="quad-tile" data-slot="1"><span class="quad-flag"></span><img alt="Quadro do histórico" hidden><span class="quad-empty">Aguardando histórico</span><span class="quad-label">—</span></div>
          <div class="quad-tile" data-slot="2"><span class="quad-flag"></span><img alt="Quadro do histórico" hidden><span class="quad-empty">Aguardando histórico</span><span class="quad-label">—</span></div>
          <div class="quad-tile" data-slot="3"><span class="quad-flag"></span><img alt="Quadro do histórico" hidden><span class="quad-empty">Aguardando histórico</span><span class="quad-label">—</span></div>
          <video id="history-video" class="quad-video" hidden muted playsinline preload="auto"></video>
        </div>
        <div class="quad-foot"><span id="quad-status">Sem quadro no histórico</span><span id="quad-angle">Ângulo: —</span><span class="quad-pager"><button type="button" id="quad-prev" title="Ângulos anteriores" hidden>◀</button><button type="button" id="quad-next" title="Próximos ângulos" hidden>▶</button></span></div>
        <div class="history-media" aria-hidden="true"><img id="history-image" alt="" hidden></div>
      </section>
    </div>
    <section class="history-nav" id="history-dock">
      <header class="history-head">
        <span class="history-heading"><strong>NAVEGAÇÃO DO HISTÓRICO</strong><span id="history-timecode" class="timecode">--:--:--:--</span></span>
        <span id="history-status" role="status">Conectando ao histórico…</span>
        <label>Ângulo em destaque <select id="history-camera" onchange="selectHistoryAngle(this.value)"></select></label>
        <label class="history-audio-toggle"><input id="history-audio" type="checkbox" onchange="historyMonitorAudio()"> Ouvir prévia</label>
        <button id="history-refresh" data-rp-command onclick="refreshHistory()">Atualizar</button>
      </header>
      <div class="history-ruler"><span id="history-start-label">—</span><span id="history-now-label">—</span><span id="history-end-label">—</span></div>
      <div class="history-tape" id="history-tape">
        <div class="history-tape-rail">
          <div class="history-ticks" aria-hidden="true"></div>
          <div id="history-range-band" class="history-range-band" hidden></div>
          <div id="history-in-mark" class="history-mark in" hidden><span>IN</span></div>
          <div id="history-out-mark" class="history-mark out" hidden><span>OUT</span></div>
          <div id="history-playhead" class="history-playhead" hidden></div>
          <input id="history-seek" class="timeline" aria-label="Posição na gravação contínua" type="range" min="0" max="0" value="0" disabled oninput="historyCursorInput()" onchange="historySeekCommitted()">
        </div>
        <span id="history-duration" class="history-duration">—</span>
      </div>
      <div class="history-controls">
        <div class="tnav"><button id="history-back-frame" data-rp-command disabled onclick="stepHistory(-1)">◀ 1 quadro</button><button id="history-prev-second" data-rp-command disabled onclick="stepHistorySeconds(-1)">◀ 1 s</button><button id="history-play" data-rp-command disabled onclick="toggleHistoryPlayback()">▶ Reproduzir ângulo</button><button id="history-next-frame" data-rp-command disabled onclick="stepHistory(1)">1 quadro ▶</button><button id="history-next-second" data-rp-command disabled onclick="stepHistorySeconds(1)">1 s ▶</button><button id="history-follow" data-rp-command disabled onclick="followHistoryEnd()">Mais recente</button></div>
        <label class="history-speed">Prévia <select id="history-speed" onchange="setHistorySpeed(this.value)"><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
        <label>Segundos <input id="history-cursor" type="number" step="0.033333" disabled onchange="historyPositionChanged()"></label>
        <span id="history-range">IN: — · OUT: —</span>
        <button id="history-in" data-rp-command disabled onclick="markHistory('in')">MARCAR IN</button>
        <button id="history-out" data-rp-command disabled onclick="markHistory('out')">MARCAR OUT</button>
        <button id="history-save" data-rp-command disabled onclick="saveHistoryRange()">SALVAR LANCE</button>
      </div>
    </section>
    <div class="events-details-row">
      <section class="events-card"><header class="panel-heading"><strong>LANCES SALVOS</strong><span id="events-total">Consultando…</span></header>
        <div class="events-table-wrap"><table class="events-table"><thead><tr><th>Título</th><th>Horário</th><th>Duração</th><th>Ângulos</th><th>Disponibilidade</th><th class="actions-col">Carregar</th></tr></thead><tbody id="events-list"><tr><td colspan="6">Conectando ao motor…</td></tr></tbody></table></div>
        <div id="interruption" hidden><span id="interruption-text"></span><button id="recover-in" data-rp-command onclick="request('recover-in')">Recuperar desde IN</button></div>
      </section>
      <section class="details-card"><header class="panel-heading"><strong>DETALHES DO LANCE</strong><span id="detail-head" class="detail-head">Nenhum lance selecionado</span></header>
        <div id="replay-event-detail"><p>Selecione um lance salvo. Carregar em A/B apenas prepara o player; não coloca no ar.</p></div>
        <details class="import-box"><summary>Importar ou recuperar clipe</summary><div class="import-grid"><label>Arquivo<input id="import-file" placeholder="Caminho do vídeo neste computador"></label><label>Nome<input id="import-name"></label><label>Ângulo<input id="import-cam"></label><button id="import-btn" data-rp-command onclick="importClip()">Importar</button><button data-rp-command onclick="request('repair',{file:document.getElementById('import-file').value.trim(),name:document.getElementById('import-name').value.trim()})">Recuperar arquivo danificado</button></div></details>
      </section>
    </div>`;

  document.querySelector('.replay-footer').innerHTML=`<div class="footer-status"><span id="message" role="status">Conectando ao motor…</span><small id="replay-shortcuts"> I: IN · O: OUT · J/K/L: −5/10/20 s · A/B: player · Espaço: Play/Pause</small></div><div class="replay-footer-actions"><label class="player-pick">Player <select id="replay-selected-player" onchange="selectDeck(this.value)"><option>A</option><option>B</option></select></label><span id="deck-state" class="deck-state">Aguardando</span><button id="take-replay" class="btn-replay-live" data-rp-command onclick="takeReplayAir()">Colocar Player A no ar</button><button id="return-live" class="btn-back-live" data-rp-command onclick="backToLive()"><span>Voltar ao vivo</span><small id="return-source">Sem fonte anterior</small></button><button class="btn-back-live btn-mesa" onclick="FreeMixClosePanel()">← MESA</button></div>`;

  const settings=document.createElement('dialog');settings.id='replay-settings';
  settings.innerHTML=`<header class="panel-heading"><strong>Câmeras e gravação do Replay</strong><button onclick="this.closest('dialog').close()">✕</button></header><p>Selecione até oito entradas com a gravação parada. Esta configuração pertence à produção atual.</p><div id="cam-select"></div><section><h3>Retenção no disco</h3><label><input id="retention-enabled" type="checkbox" oninput="retentionDirty=true"> Retenção circular</label><label>Minutos <input id="retention-minutes" type="number" min="2" max="1440" value="30" oninput="retentionDirty=true"></label><button id="retention-save" onclick="saveRetention()">Aplicar com REC parado</button></section><section id="replay-camera-audio"><h3>Áudio por câmera e sincronismo</h3><label>Câmera<select id="audio-cam" onchange="showCameraOptions()"></select></label><label>Áudio gravado<select id="audio-record"><option value="input">Desta entrada</option><option value="master">Master</option><option value="bus-a">Bus A</option><option value="bus-b">Bus B</option></select></label><label>Ganho dB<input id="audio-gain" type="number" min="-60" max="12" value="0"></label><label><input id="audio-muted" type="checkbox"> Silenciar câmera</label><label>Offset (quadros)<input id="camera-offset" type="number" min="-3600" max="3600" value="0"></label><button onclick="saveCameraOptions()">Aplicar câmera</button><button id="replay-audio" onclick="request('audio',{enabled:!replay?.audioEnabled})">Áudio</button><button onclick="request('auto-align',{player:deck})">Alinhar pelo áudio comum</button></section>`;
  document.body.append(settings);
  const pathDialog=document.createElement('dialog');pathDialog.id='replay-path-dialog';pathDialog.className='replay-dialog';
  pathDialog.innerHTML=`<header class="panel-heading"><strong id="path-title">Localizar arquivo</strong><button type="button" onclick="this.closest('dialog').close()">✕</button></header><p id="path-help"></p><label class="path-field">Caminho completo<input id="path-value" autocomplete="off" spellcheck="false"></label><div class="path-actions"><button type="button" onclick="this.closest('dialog').close()">Cancelar</button><button type="button" id="path-confirm" class="primary">Confirmar</button></div>`;
  document.body.append(pathDialog);
  document.body.classList.add('replay-operational-ready');
  for(const button of document.querySelectorAll('[data-rp-command]'))button.disabled=true;
})();
