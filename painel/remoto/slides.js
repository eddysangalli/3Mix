(function() {
  'use strict';

  let currentDeck = null;
  const el = id => document.getElementById(id);

  async function api(action, data = {}) {
    try {
      const res = await fetch('/api/slides', {
        method: action ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: action ? JSON.stringify({ action, ...data }) : undefined
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha na API de slides');
      return json;
    } catch (e) {
      console.error('Slide API Error:', e);
      return null;
    }
  }

  async function refresh() {
    const data = await api();
    if (!data) return;
    currentDeck = data.activeDeck;
    render();
  }

  function render() {
    if (!currentDeck) {
      el('deck-name').textContent = 'Nenhuma apresentação';
      el('slide-count').textContent = '0 slides';
      el('viewport-preview').innerHTML = '<div class="viewport-empty">Nenhum slide preparado</div>';
      el('viewport-program').innerHTML = '<div class="viewport-empty">Nenhum slide no ar</div>';
      el('thumbs-strip').innerHTML = '<div style="color:#64748b;font-size:12px;display:flex;align-items:center;justify-content:center;width:100%;">Importe um PPTX para iniciar.</div>';
      return;
    }

    el('deck-name').textContent = currentDeck.name;
    el('slide-count').textContent = `${currentDeck.totalSlides} slides`;

    const pvwSlide = currentDeck.prepared || currentDeck.slides[currentDeck.preparedSlide - 1];
    const pgmSlide = currentDeck.current || currentDeck.slides[currentDeck.currentSlide - 1];

    // Render Preview
    if (pvwSlide) {
      el('preview-slide-num').textContent = `Slide ${pvwSlide.index} de ${currentDeck.totalSlides}`;
      el('viewport-preview').innerHTML = pvwSlide.imageUrl
        ? `<img src="${pvwSlide.imageUrl}" alt="${pvwSlide.title}">`
        : (pvwSlide.svgPreview || `<div style="padding:20px;color:white;font-size:24px;">${pvwSlide.title}</div>`);
      el('preview-notes').textContent = pvwSlide.notes || 'Sem notas para este slide.';
    }

    // Render Program
    if (pgmSlide) {
      el('program-slide-num').textContent = `Slide ${pgmSlide.index} · NO AR`;
      el('viewport-program').innerHTML = pgmSlide.imageUrl
        ? `<img src="${pgmSlide.imageUrl}" alt="${pgmSlide.title}">`
        : (pgmSlide.svgPreview || `<div style="padding:20px;color:white;font-size:24px;">${pgmSlide.title}</div>`);
      el('program-title').textContent = pgmSlide.title || `Slide ${pgmSlide.index}`;
      el('program-subtitle').textContent = pgmSlide.subtitle || pgmSlide.fullText?.slice(0, 100) || '';
    }

    // Atualizar controles de animação
    const btnAnim = el('btn-anim-next');
    if (btnAnim) {
      if (pgmSlide && pgmSlide.totalAnimationSteps > 0) {
        btnAnim.style.display = 'inline-flex';
        el('anim-step-badge').textContent = `${pgmSlide.currentAnimationStep}/${pgmSlide.totalAnimationSteps}`;
      } else {
        btnAnim.style.display = 'none';
      }
    }

    // Atualizar controles de vídeo incorporado
    const vControls = el('video-controls');
    if (vControls) {
      if (pgmSlide && pgmSlide.hasVideo) {
        vControls.style.display = 'flex';
      } else {
        vControls.style.display = 'none';
      }
    }

    // Render Thumbnails
    const strip = el('thumbs-strip');
    strip.innerHTML = '';
    currentDeck.slides.forEach(s => {
      const isPvw = s.index === currentDeck.preparedSlide;
      const isPgm = s.index === currentDeck.currentSlide;

      const item = document.createElement('div');
      item.className = `thumb-item ${isPvw ? 'is-preview' : ''} ${isPgm ? 'is-program' : ''}`;
      item.onclick = () => prepare(s.index);

      const view = document.createElement('div');
      view.className = 'thumb-view';
      view.innerHTML = s.imageUrl
        ? `<img src="${s.imageUrl}" alt="">`
        : (s.svgPreview || `<span style="font-size:10px;color:#aaa;">${s.title}</span>`);

      const num = document.createElement('div');
      num.className = 'thumb-num';
      num.textContent = s.index;

      if (isPgm) {
        const pgmBadge = document.createElement('div');
        pgmBadge.className = 'thumb-badge pgm';
        pgmBadge.textContent = 'NO AR';
        item.appendChild(pgmBadge);
      } else if (isPvw) {
        const pvwBadge = document.createElement('div');
        pvwBadge.className = 'thumb-badge pvw';
        pvwBadge.textContent = 'PREVIEW';
        item.appendChild(pvwBadge);
      }

      const title = document.createElement('div');
      title.className = 'thumb-title';
      title.textContent = s.title || `Slide ${s.index}`;

      item.appendChild(view);
      item.appendChild(num);
      item.appendChild(title);
      strip.appendChild(item);

      if (isPvw) {
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });
  }

  async function prepare(index) {
    if (!currentDeck) return;
    const res = await api('prepare_slide', { deckId: currentDeck.id, slideIndex: index });
    if (res?.activeDeck) {
      currentDeck = res.activeDeck;
      render();
    }
  }

  async function present() {
    if (!currentDeck) return;
    const autoAdvance = el('chk-auto-advance')?.checked;
    const nextIdx = currentDeck.preparedSlide;
    const res = await api('present_slide', { deckId: currentDeck.id, slideIndex: nextIdx });
    if (res?.activeDeck) {
      currentDeck = res.activeDeck;
      if (autoAdvance && currentDeck.preparedSlide < currentDeck.totalSlides) {
        await api('next_slide', { deckId: currentDeck.id });
        const fresh = await api();
        if (fresh?.activeDeck) currentDeck = fresh.activeDeck;
      }
      render();
    }
  }

  async function next() {
    if (!currentDeck) return;
    const res = await api('next_slide', { deckId: currentDeck.id });
    if (res?.activeDeck) {
      currentDeck = res.activeDeck;
      render();
    }
  }

  async function prev() {
    if (!currentDeck) return;
    const res = await api('previous_slide', { deckId: currentDeck.id });
    if (res?.activeDeck) {
      currentDeck = res.activeDeck;
      render();
    }
  }

  // File Upload PPTX
  el('btn-import-pptx').onclick = () => el('file-input-pptx').click();
  el('file-input-pptx').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    el('deck-name').textContent = 'Carregando e processando PPTX...';
    try {
      // Enviar via FormData ou ArrayBuffer
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const res = await fetch('/api/slides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import_pptx',
            name: file.name.replace(/\.pptx$/i, ''),
            bufferBase64: base64
          })
        });
        const json = await res.json();
        if (json.success) {
          currentDeck = json.activeDeck;
          render();
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('Erro ao carregar PPTX: ' + err.message);
    }
  };

  // Buttons
  el('btn-present').onclick = present;
  el('btn-next').onclick = next;
  el('btn-prev').onclick = prev;
  el('btn-first').onclick = () => prepare(1);

  async function nextAnimation() {
    if (!currentDeck) return;
    const res = await api('next_animation', { deckId: currentDeck.id });
    if (res?.activeDeck) {
      currentDeck = res.activeDeck;
      render();
    }
  }

  el('btn-anim-next').onclick = nextAnimation;
  el('btn-video-play').onclick = () => api('play_video', { deckId: currentDeck?.id });
  el('btn-video-pause').onclick = () => api('pause_video', { deckId: currentDeck?.id });
  el('btn-video-restart').onclick = () => api('restart_video', { deckId: currentDeck?.id });

  // Keyboard Shortcuts (Broadcast Presenter Standard)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      nextAnimation();
    } else if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next();
    } else if (e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      prev();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      present();
    } else if (e.key === 'Home') {
      e.preventDefault();
      prepare(1);
    } else if (e.key === 'End' && currentDeck) {
      e.preventDefault();
      prepare(currentDeck.totalSlides);
    }
  });

  // Start polling
  refresh();
  setInterval(refresh, 2000);
})();

