import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

/**
 * Motor de Apresentação de Slides & PowerPoint (3Mix Presenter)
 * Importação nativa de PPTX (16:9 e 4:3), tabelas, fontes, imagens e notas sem exigir Microsoft Office.
 */
export class SlideEngine {
  constructor(options = {}) {
    this.root = options.root || process.cwd();
    this.p = options.production || null;
    this.decks = new Map();
    this.activeDeckId = null;
    this.cacheDir = join(this.root, 'downloads/slides_cache');
    this.ready = this.init();
  }

  async init() {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      const indexPath = join(this.cacheDir, 'decks.json');
      if (existsSync(indexPath)) {
        const data = JSON.parse(await readFile(indexPath, 'utf8'));
        if (data && Array.isArray(data.decks)) {
          for (const d of data.decks) {
            this.decks.set(d.id, d);
          }
          this.activeDeckId = data.activeDeckId || (data.decks[0]?.id ?? null);
        }
      }
    } catch {}
  }

  async saveDecksIndex() {
    try {
      const indexPath = join(this.cacheDir, 'decks.json');
      const payload = {
        activeDeckId: this.activeDeckId,
        decks: Array.from(this.decks.values()),
        savedAt: new Date().toISOString()
      };
      await writeFile(indexPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {}
  }

  /**
   * Importa um arquivo .pptx lendo o pacote OpenXML via JSZip
   */
  async importPptx(fileSource, deckName = '') {
    await this.ready;
    let buffer;
    let originalName = deckName;

    if (typeof fileSource === 'string') {
      if (!existsSync(fileSource)) throw new Error(`Arquivo não encontrado: ${fileSource}`);
      buffer = await readFile(fileSource);
      if (!originalName) originalName = basename(fileSource, extname(fileSource));
    } else if (Buffer.isBuffer(fileSource)) {
      buffer = fileSource;
      if (!originalName) originalName = 'Apresentação ' + new Date().toLocaleTimeString('pt-BR');
    } else {
      throw new Error('Fonte de arquivo PPTX inválida');
    }

    const zip = await JSZip.loadAsync(buffer);
    const deckId = 'deck_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const deckCacheDir = join(this.cacheDir, deckId);
    await mkdir(deckCacheDir, { recursive: true });

    // 1. Detectar proporção (16:9 vs 4:3) em ppt/presentation.xml
    let aspect = '16:9';
    const presEntry = zip.file('ppt/presentation.xml');
    if (presEntry) {
      const presXml = await presEntry.async('string');
      const szMatch = presXml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
      if (szMatch) {
        const cx = parseInt(szMatch[1], 10);
        const cy = parseInt(szMatch[2], 10);
        const ratio = cx / cy;
        if (Math.abs(ratio - (4 / 3)) < 0.15) {
          aspect = '4:3';
        }
      }
    }

    const mediaFiles = new Map();
    const slideXmls = new Map();
    const notesXmls = new Map();

    // 2. Extrair imagens e vídeos de ppt/media/*
    const videoFiles = new Map();
    for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;
      if (relativePath.startsWith('ppt/media/')) {
        const fileName = basename(relativePath);
        const fileData = await zipEntry.async('nodebuffer');
        const destPath = join(deckCacheDir, fileName);
        await writeFile(destPath, fileData);
        const urlPath = `/api/slides/media/${deckId}/${fileName}`;
        mediaFiles.set(fileName, urlPath);
        if (/\.(mp4|webm|avi|mov|mkv|m4v)$/i.test(fileName)) {
          videoFiles.set(fileName, { fileName, localPath: destPath, url: urlPath });
        }
      } else if (/^ppt\/slides\/slide\d+\.xml$/.test(relativePath)) {
        slideXmls.set(relativePath, await zipEntry.async('string'));
      } else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(relativePath)) {
        notesXmls.set(relativePath, await zipEntry.async('string'));
      }
    }

    // 3. Ordenar slides numericamente
    const sortedPaths = [...slideXmls.keys()].sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
      return numA - numB;
    });

    const slides = [];
    for (let i = 0; i < sortedPaths.length; i++) {
      const xml = slideXmls.get(sortedPaths[i]) || '';

      // Extrair textos do slide via tags <a:t>
      const textMatches = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
        .map(m => m[1].trim())
        .filter(Boolean);

      const title = textMatches[0] || `Slide ${i + 1}`;
      const bullets = textMatches.slice(1);
      const subtitle = bullets.slice(0, 3).join(' • ');

      // Extrair notas do apresentador
      const notesXml = notesXmls.get(`ppt/notesSlides/notesSlide${i + 1}.xml`) || '';
      const notesMatches = [...notesXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
        .map(m => m[1].trim())
        .filter(Boolean);
      const notes = notesMatches.join('\n');

      // Extrair fonte e cor do título
      const fontMatch = xml.match(/typeface="([^"]+)"/);
      const colorMatch = xml.match(/<a:srgbClr val="([0-9a-fA-F]{6})"/);
      const titleFont = fontMatch ? fontMatch[1] : (aspect === '4:3' ? 'Times New Roman' : 'Segoe UI');
      const titleColor = colorMatch ? '#' + colorMatch[1] : '#0284c7';

      // Extrair relacionamentos de imagem e vídeo específicos deste slide
      let slideImgUrl = null;
      let slideImgLocalPath = null;
      let slideVideo = null;
      const relsEntry = zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`);
      if (relsEntry) {
        const relsXml = await relsEntry.async('string');

        // Imagem
        const imgTargetMatch = relsXml.match(/Type="[^"]*\/image"[^>]*Target="([^"]+)"/);
        if (imgTargetMatch) {
          const imgFileName = basename(imgTargetMatch[1]);
          if (mediaFiles.has(imgFileName) && !videoFiles.has(imgFileName)) {
            slideImgUrl = mediaFiles.get(imgFileName);
            slideImgLocalPath = join(deckCacheDir, imgFileName);
          }
        }

        // Vídeo incorporado
        const videoTargetMatch = relsXml.match(/Type="[^"]*\/(?:video|media)"[^>]*Target="([^"]+)"/) ||
                                 relsXml.match(/Target="([^"]+\.(?:mp4|webm|avi|mov|mkv|m4v))"/i);
        if (videoTargetMatch) {
          const videoFileName = basename(videoTargetMatch[1]);
          if (videoFiles.has(videoFileName)) {
            const vInfo = videoFiles.get(videoFileName);
            let vx = aspect === '4:3' ? 760 : 1080;
            let vy = 220;
            let vw = aspect === '4:3' ? 620 : 760;
            let vh = aspect === '4:3' ? 465 : 430;

            const xfrmMatch = xml.match(/<a:xfrm>[\s\S]*?<a:off\s+x="(\d+)"\s+y="(\d+)"\/>[\s\S]*?<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
            if (xfrmMatch) {
              const offX = parseInt(xfrmMatch[1], 10);
              const offY = parseInt(xfrmMatch[2], 10);
              const extCX = parseInt(xfrmMatch[3], 10);
              const extCY = parseInt(xfrmMatch[4], 10);
              const cxSlide = aspect === '4:3' ? 9144000 : 12192000;
              const cySlide = 6858000;
              vx = Math.round((offX / cxSlide) * 1920);
              vy = Math.round((offY / cySlide) * 1080);
              vw = Math.round((extCX / cxSlide) * 1920);
              vh = Math.round((extCY / cySlide) * 1080);
            }

            const autoPlay = /autoPlay="1"|type="play"/i.test(xml);
            slideVideo = {
              fileName: videoFileName,
              localPath: vInfo.localPath,
              url: vInfo.url,
              x: vx,
              y: vy,
              width: vw,
              height: vh,
              autoPlay,
              loop: false
            };
          }
        }
      }

      // Extrair tabelas <a:tbl>
      const tables = [];
      const tblMatches = [...xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)];
      for (const tm of tblMatches) {
        const trMatches = [...tm[1].matchAll(/<a:tr[^>]*>([\s\S]*?)<\/a:tr>/g)];
        const rows = [];
        for (const rm of trMatches) {
          const tcMatches = [...rm[1].matchAll(/<a:tc[^>]*>([\s\S]*?)<\/a:tc>/g)];
          const cells = tcMatches.map(c => {
            const texts = [...c[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1].trim()).filter(Boolean);
            return texts.join(' ');
          });
          if (cells.length > 0) rows.push(cells);
        }
        if (rows.length > 0) tables.push(rows);
      }

      // Extrair animações em <p:timing>
      const animSteps = [];
      let totalAnimationSteps = 0;
      if (/<p:timing>/i.test(xml)) {
        const clickMatches = [...xml.matchAll(/nodeType="clickEffect"/g)];
        const effectMatches = [...xml.matchAll(/<p:animEffect[^>]*filter="([^"]+)"/g)];
        const count = Math.max(clickMatches.length, effectMatches.length, bullets.length);
        if (count > 0 && bullets.length > 0) {
          totalAnimationSteps = Math.min(count, bullets.length);
          for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
            const effect = effectMatches[bIdx]?.[1] || (bIdx % 2 === 1 ? 'fly' : 'fade');
            animSteps.push({
              text: bullets[bIdx],
              step: bIdx + 1,
              effect: effect.includes('fly') ? 'fly' : (effect.includes('zoom') ? 'zoom' : 'fade')
            });
          }
        }
      }

      // Extrair transição em <p:transition>
      let transition = { type: 'cut', durationMs: 300 };
      if (/<p:fade/i.test(xml)) transition = { type: 'fade', durationMs: 500 };
      else if (/<p:push[^>]*dir="l"/i.test(xml)) transition = { type: 'slide-left', durationMs: 400 };
      else if (/<p:push/i.test(xml)) transition = { type: 'slide', durationMs: 400 };
      else if (/<p:wipe/i.test(xml)) transition = { type: 'wipe', durationMs: 400 };
      else if (/<p:morph/i.test(xml)) transition = { type: 'morph-interpolation', durationMs: 600 };

      // Recursos não suportados / convertidos com aviso ao operador
      const unsupportedFeatures = [];
      if (/<p:morph/i.test(xml)) {
        unsupportedFeatures.push('Transição Morph (adaptada para Interpolação suave e transição 3Mix)');
      }
      if (/<p:animMotion[^>]*path="M[^"]*C/i.test(xml)) {
        unsupportedFeatures.push('Animação de Caminho Livre Curvo (simplificada para movimento linear)');
      }
      if (/<a:camera[^>]*prst="isometric/i.test(xml)) {
        unsupportedFeatures.push('Projeção 3D Isométrica (simplificada para 2D plano)');
      }

      // Renderizar arquivo SVG em disco para o motor OBS
      const svgSlide = this.generateSvgSlide({
        num: i + 1,
        title,
        lines: bullets.slice(0, 5),
        aspect,
        fontFamily: titleFont,
        titleColor,
        imageLocalPath: slideImgLocalPath,
        table: tables[0] || null,
        video: slideVideo,
        animationSteps: animSteps,
        currentStep: 0,
        unsupportedFeatures
      });

      const stepSuffix = totalAnimationSteps > 0 ? '_step_0' : '';
      const slideSvgPath = join(deckCacheDir, `slide_${i + 1}${stepSuffix}.svg`);
      await writeFile(slideSvgPath, svgSlide, 'utf8');
      if (stepSuffix) {
        await writeFile(join(deckCacheDir, `slide_${i + 1}.svg`), svgSlide, 'utf8');
      }

      slides.push({
        index: i + 1,
        title,
        subtitle: subtitle.slice(0, 160),
        fullText: textMatches.join('\n'),
        notes: notes || 'Sem notas adicionais para este slide.',
        aspect,
        fontFamily: titleFont,
        hasTable: tables.length > 0,
        tableData: tables[0] || null,
        hasImage: !!slideImgLocalPath,
        imageUrl: slideImgUrl || null,
        hasVideo: !!slideVideo,
        video: slideVideo,
        totalAnimationSteps,
        currentAnimationStep: 0,
        animationSteps: animSteps,
        transition,
        unsupportedFeatures,
        renderedPath: slideSvgPath,
        svgPreview: svgSlide
      });
    }

    if (!slides.length) {
      const fallbackSvg = this.generateSvgSlide({ num: 1, title: originalName, lines: ['Documento importado'], aspect });
      const fallbackPath = join(deckCacheDir, 'slide_1.svg');
      await writeFile(fallbackPath, fallbackSvg, 'utf8');

      slides.push({
        index: 1,
        title: originalName,
        subtitle: 'Apresentação vazia ou sem slides de texto padrão.',
        fullText: originalName,
        notes: '',
        aspect,
        fontFamily: 'Segoe UI',
        hasTable: false,
        hasImage: false,
        imageUrl: null,
        renderedPath: fallbackPath,
        svgPreview: fallbackSvg
      });
    }

    const deck = {
      id: deckId,
      name: originalName,
      aspect,
      totalSlides: slides.length,
      currentSlide: 1,   // Slide no ar (PGM)
      preparedSlide: 1,  // Slide preparado (Preview do Apresentador)
      slides,
      updatedAt: new Date().toISOString()
    };

    this.decks.set(deckId, deck);
    this.activeDeckId = deckId;
    await this.saveDecksIndex();
    return deck;
  }

  /**
   * Importa lista de imagens locais como apresentação
   */
  async importImages(imagePaths = [], deckName = 'Apresentação de Imagens') {
    await this.ready;
    const deckId = 'deck_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const deckCacheDir = join(this.cacheDir, deckId);
    await mkdir(deckCacheDir, { recursive: true });

    const slides = [];
    for (let idx = 0; idx < imagePaths.length; idx++) {
      const path = imagePaths[idx];
      const svgSlide = this.generateSvgSlide({
        num: idx + 1,
        title: basename(path),
        lines: [`Imagem ${idx + 1} de ${imagePaths.length}`],
        aspect: '16:9',
        imageLocalPath: path
      });
      const svgPath = join(deckCacheDir, `slide_${idx + 1}.svg`);
      await writeFile(svgPath, svgSlide, 'utf8');

      slides.push({
        index: idx + 1,
        title: basename(path),
        subtitle: `Imagem ${idx + 1} de ${imagePaths.length}`,
        fullText: basename(path),
        notes: '',
        aspect: '16:9',
        imageUrl: path,
        renderedPath: svgPath,
        svgPreview: svgSlide
      });
    }

    const deck = {
      id: deckId,
      name: deckName,
      aspect: '16:9',
      totalSlides: slides.length,
      currentSlide: 1,
      preparedSlide: 1,
      slides,
      updatedAt: new Date().toISOString()
    };

    this.decks.set(deckId, deck);
    this.activeDeckId = deckId;
    await this.saveDecksIndex();
    return deck;
  }

  generateSvgSlide(opts) {
    if (typeof opts === 'number') {
      opts = { num: arguments[0], title: arguments[1], lines: arguments[2] || [] };
    }
    const {
      num = 1,
      title = 'Slide',
      lines = [],
      aspect = '16:9',
      fontFamily = 'Segoe UI, Arial, sans-serif',
      titleColor = '#0284c7',
      imageLocalPath = null,
      table = null,
      video = null,
      animationSteps = null,
      currentStep = 0,
      unsupportedFeatures = []
    } = opts;

    const safeTitle = String(title).replace(/[&<>"']/g, '');
    const safeLines = lines.map(l => String(l).replace(/[&<>"']/g, '')).slice(0, 5);
    const cleanFont = String(fontFamily || 'Segoe UI, Arial, sans-serif').replace(/["'\\]/g, '');
    const safeFont = `${cleanFont}, Arial, sans-serif`;

    // Incorpora imagem local em Base64 para total independência de arquivo
    let imageSvg = '';
    if (imageLocalPath && existsSync(imageLocalPath) && !video) {
      try {
        const imgBuffer = readFileSync(imageLocalPath);
        const ext = extname(imageLocalPath).toLowerCase().replace('.', '');
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        const b64 = imgBuffer.toString('base64');
        imageSvg = `<image href="data:${mime};base64,${b64}" x="1240" y="240" width="560" height="480" preserveAspectRatio="xMidYMid meet"/>`;
      } catch {}
    }

    // Incorpora vídeo via foreignObject acelerado por GPU (Chromium CEF)
    let videoSvg = '';
    if (video && (video.localPath || video.url)) {
      const vx = video.x !== undefined ? video.x : (aspect === '4:3' ? 760 : 1040);
      const vy = video.y !== undefined ? video.y : 220;
      const vw = video.width !== undefined ? video.width : (aspect === '4:3' ? 620 : 800);
      const vh = video.height !== undefined ? video.height : (aspect === '4:3' ? 465 : 450);
      const vSrc = video.url || ('file:///' + String(video.localPath).replace(/\\/g, '/'));
      const autoPlayAttr = video.autoPlay ? 'autoplay="autoplay"' : '';
      const loopAttr = video.loop ? 'loop="loop"' : '';

      videoSvg = `<foreignObject x="${vx}" y="${vy}" width="${vw}" height="${vh}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#05070a;border:2px solid #1e293b;border-radius:6px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.7);box-sizing:border-box;">
          <video id="slide-video" src="${vSrc}" style="width:100%;height:100%;object-fit:contain;" ${autoPlayAttr} ${loopAttr} controls="controls" playsinline="playsinline"></video>
        </div>
      </foreignObject>`;
    }

    // Renderiza tabela se existir
    let tableSvg = '';
    if (table && Array.isArray(table) && table.length > 0) {
      const startY = 360;
      const colWidth = 360;
      const rowHeight = 60;
      tableSvg = `<g transform="translate(100, ${startY})">
        ${table.map((row, rIdx) => {
          const isHeader = rIdx === 0;
          return `
            <g transform="translate(0, ${rIdx * rowHeight})">
              <rect x="0" y="0" width="${row.length * colWidth}" height="${rowHeight - 6}" fill="${isHeader ? '#1e293b' : '#0f172a'}" stroke="#334155" rx="3"/>
              ${row.map((cell, cIdx) => `
                <text x="${cIdx * colWidth + 16}" y="36" font-family=${JSON.stringify(safeFont)} font-size="${isHeader ? 22 : 20}" font-weight="${isHeader ? 'bold' : 'normal'}" fill="${isHeader ? '#38bdf8' : '#e2e8f0'}">${String(cell).replace(/[&<>"']/g, '').slice(0, 30)}</text>
              `).join('')}
            </g>`;
        }).join('')}
      </g>`;
    }

    // Badge de aviso de recursos simplificados/não suportados
    let badgeSvg = '';
    if (unsupportedFeatures && unsupportedFeatures.length > 0) {
      const warnText = `⚠ 3Mix: ${String(unsupportedFeatures[0]).slice(0, 48)}`;
      badgeSvg = `<g transform="translate(1860, 32)" text-anchor="end">
        <rect x="-420" y="0" width="420" height="30" rx="4" fill="#1c1917" stroke="#b45309" stroke-width="1.5"/>
        <text x="-12" y="20" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#f59e0b">${warnText}</text>
      </g>`;
    }

    // Bullets (normais ou animados por etapas)
    let bulletsSvg = '';
    if (!tableSvg) {
      if (animationSteps && animationSteps.length > 0) {
        bulletsSvg = animationSteps.map((b, idx) => {
          const isVisible = currentStep >= b.step;
          const effectClass = b.effect === 'fly' ? 'anim-fly' : (b.effect === 'zoom' ? 'anim-zoom' : 'anim-fade');
          return `<g class="anim-step ${effectClass} ${isVisible ? 'anim-visible' : 'anim-hidden'}" data-anim-step="${b.step}" opacity="${isVisible ? 1 : 0}" ${isVisible ? '' : 'display="none"'} transform="translate(${aspect === '4:3' ? 80 : 100}, ${320 + idx * 75})">
            <circle cx="8" cy="-10" r="5" fill="#38bdf8"/>
            <text x="28" y="0" font-family=${JSON.stringify(safeFont)} font-size="${aspect === '4:3' ? 34 : 36}" fill="#cbd5e1">${b.text}</text>
          </g>`;
        }).join('');
      } else {
        bulletsSvg = safeLines.map((line, idx) => `
          <text x="${aspect === '4:3' ? 80 : 100}" y="${320 + idx * 75}" font-family=${JSON.stringify(safeFont)} font-size="${aspect === '4:3' ? 34 : 36}" fill="#cbd5e1">• ${line}</text>
        `).join('');
      }
    }

    const animStyles = `<style>
      .anim-step { transition: opacity 0.4s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
      .anim-hidden { opacity: 0 !important; pointer-events: none; }
      .anim-hidden.anim-fly { transform: translateY(30px); }
      .anim-hidden.anim-zoom { transform: scale(0.65); transform-origin: left center; }
      .anim-visible { opacity: 1 !important; transform: none !important; }
    </style>`;

    // Proporção 4:3 com pilarbox broadcast ou 16:9 tela cheia
    if (aspect === '4:3') {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="100%" height="100%">
        <defs>
          <linearGradient id="bg43" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#181c24"/>
            <stop offset="100%" stop-color="#0f1218"/>
          </linearGradient>
        </defs>
        ${animStyles}
        <!-- Fundo e Pilarboxes Laterais -->
        <rect width="1920" height="1080" fill="#080a0f"/>
        <!-- Área Central 4:3 (1440x1080) -->
        <g transform="translate(240, 0)">
          <rect width="1440" height="1080" fill="url(#bg43)" stroke="#222b38" stroke-width="2"/>
          <rect x="0" y="1040" width="1440" height="40" fill="#475569"/>
          <text x="80" y="180" font-family=${JSON.stringify(safeFont)} font-size="52" font-weight="bold" fill="${titleColor}">${safeTitle}</text>
          ${bulletsSvg}
          ${tableSvg}
          ${imageSvg}
          ${videoSvg}
          <text x="1360" y="990" font-family="system-ui, monospace" font-size="32" font-weight="bold" fill="#64748b" text-anchor="end">4:3 · ${num}</text>
        </g>
        ${badgeSvg}
      </svg>`;
    }

    // Proporção 16:9 Widescreen Padrão
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="100%" height="100%">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#141922"/>
          <stop offset="100%" stop-color="#0a0d13"/>
        </linearGradient>
      </defs>
      ${animStyles}
      <rect width="1920" height="1080" fill="url(#bg)"/>
      <rect x="0" y="1040" width="1920" height="40" fill="#0284c7"/>
      <text x="100" y="180" font-family=${JSON.stringify(safeFont)} font-size="58" font-weight="bold" fill="${titleColor}">${safeTitle}</text>
      ${bulletsSvg}
      ${tableSvg}
      ${imageSvg}
      ${videoSvg}
      <text x="1820" y="990" font-family="system-ui, monospace" font-size="34" font-weight="bold" fill="#64748b" text-anchor="end">16:9 · ${num}</text>
      ${badgeSvg}
    </svg>`;
  }

  getActiveDeck() {
    return this.decks.get(this.activeDeckId) || null;
  }

  /**
   * Prepara o slide para o operador (Preview) SEM colocar no ar!
   */
  prepareSlide(deckId, slideIndex) {
    if (deckId && this.decks.has(deckId)) this.activeDeckId = deckId;
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const idx = Math.max(1, Math.min(deck.totalSlides, Number(slideIndex) || 1));
    deck.preparedSlide = idx;
    this.saveDecksIndex();
    return deck;
  }

  /**
   * Coloca o slide armado no ar (PRESENT TAKE) e atualiza o motor OBS!
   */
  async presentSlide(deckId, targetIndex = null) {
    if (deckId && this.decks.has(deckId)) this.activeDeckId = deckId;
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    if (targetIndex !== null) {
      deck.preparedSlide = Math.max(1, Math.min(deck.totalSlides, Number(targetIndex)));
    }
    deck.currentSlide = deck.preparedSlide;

    // Sincronizar com o motor de produção nativo via browser_source (renderização acelerada)
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide && this.p?.req) {
      try {
        const localFilePath = resolve(slide.renderedPath);
        const fileName = basename(slide.renderedPath);
        const apiPort = process.env.FREEMIX_API_PORT ? Number(process.env.FREEMIX_API_PORT) : 18188;
        const slideUrl = `http://localhost:${apiPort}/api/slides/media/${deck.id}/${fileName}?t=${Date.now()}`;
        const browserSettings = {
          is_local_file: true,
          local_file: localFilePath,
          url: slideUrl,
          width: 1920,
          height: 1080,
          reroute_audio: true, // Roteamento do áudio do vídeo para fader e mixer 3Mix!
          css: 'body { margin: 0; background: transparent; overflow: hidden; } svg { width: 100vw; height: 100vh; }'
        };

        const sceneList = await this.p.req('GetSceneList').catch(() => null);
        const hasSlidesScene = sceneList?.scenes?.some(s => s.sceneName === 'Slides');

        if (!hasSlidesScene) {
          // Cria a cena Slides no 3Mix e adiciona a fonte de apresentação
          await this.p.req('CreateScene', { sceneName: 'Slides' }).catch(() => {});
          await this.p.req('CreateInput', {
            sceneName: 'Slides',
            inputName: 'Fonte Slides',
            inputKind: 'browser_source',
            inputSettings: browserSettings
          }).catch(() => {});
        } else {
          // Atualiza as configurações do slide atual
          await this.p.req('SetInputSettings', {
            inputName: 'Fonte Slides',
            inputSettings: browserSettings
          }).catch(async () => {
            // Se falhar ou for de outro tipo, recria limpo
            await this.p.req('RemoveInput', { inputName: 'Fonte Slides' }).catch(() => {});
            await this.p.req('CreateInput', {
              sceneName: 'Slides',
              inputName: 'Fonte Slides',
              inputKind: 'browser_source',
              inputSettings: browserSettings
            }).catch(() => {});
          });

          // Força o Chromium a atualizar o frame imediatamente (bypass cache)
          await this.p.req('PressInputPropertiesButton', {
            inputName: 'Fonte Slides',
            propertyName: 'refreshnocache'
          }).catch(() => {});
        }
      } catch (err) {
        console.error('SlideEngine present sync error:', err.message);
      }
    }

    await this.saveDecksIndex();
    return deck;
  }

  nextSlide(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    if (deck.preparedSlide < deck.totalSlides) {
      deck.preparedSlide++;
    }
    return deck;
  }

  previousSlide(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    if (deck.preparedSlide > 1) {
      deck.preparedSlide--;
    }
    return deck;
  }

  /**
   * Avança um passo de animação no slide no ar (NEXT ANIMATION)
   */
  async nextAnimation(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide && slide.totalAnimationSteps > 0 && slide.currentAnimationStep < slide.totalAnimationSteps) {
      slide.currentAnimationStep++;
      await this._updateSlideSvg(deck, slide);
      await this.presentSlide(deck.id, deck.currentSlide);
    }
    return deck;
  }

  /**
   * Retrocede um passo de animação no slide no ar
   */
  async previousAnimation(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide && slide.totalAnimationSteps > 0 && slide.currentAnimationStep > 0) {
      slide.currentAnimationStep--;
      await this._updateSlideSvg(deck, slide);
      await this.presentSlide(deck.id, deck.currentSlide);
    }
    return deck;
  }

  /**
   * Controles de transporte de vídeo incorporado
   */
  async playVideo(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide?.video) {
      slide.video.autoPlay = true;
      await this._updateSlideSvg(deck, slide);
      await this.presentSlide(deck.id, deck.currentSlide);
    }
    return deck;
  }

  async pauseVideo(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide?.video) {
      slide.video.autoPlay = false;
      await this._updateSlideSvg(deck, slide);
      await this.presentSlide(deck.id, deck.currentSlide);
    }
    return deck;
  }

  async restartVideo(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide?.video) {
      slide.video.autoPlay = true;
      await this._updateSlideSvg(deck, slide);
      await this.presentSlide(deck.id, deck.currentSlide);
    }
    return deck;
  }

  async _updateSlideSvg(deck, slide) {
    const stepSuffix = slide.totalAnimationSteps > 0 ? `_step_${slide.currentAnimationStep}` : '';
    const svgPath = join(this.cacheDir, deck.id, `slide_${slide.index}${stepSuffix}.svg`);
    const svg = this.generateSvgSlide({
      num: slide.index,
      title: slide.title,
      lines: slide.animationSteps?.map(a => a.text) || [],
      aspect: slide.aspect,
      fontFamily: slide.fontFamily,
      imageLocalPath: slide.imageUrl ? join(this.cacheDir, deck.id, basename(slide.imageUrl)) : null,
      table: slide.hasTable ? slide.tableData : null,
      video: slide.video,
      animationSteps: slide.animationSteps,
      currentStep: slide.currentAnimationStep,
      unsupportedFeatures: slide.unsupportedFeatures
    });
    slide.svgPreview = svg;
    slide.renderedPath = svgPath;
    await writeFile(svgPath, svg, 'utf8');
    await writeFile(join(this.cacheDir, deck.id, `slide_${slide.index}.svg`), svg, 'utf8');
  }

  summary() {
    const deck = this.getActiveDeck();
    return {
      activeDeck: deck ? {
        id: deck.id,
        name: deck.name,
        aspect: deck.aspect || '16:9',
        totalSlides: deck.totalSlides,
        currentSlide: deck.currentSlide,
        preparedSlide: deck.preparedSlide,
        current: deck.slides[deck.currentSlide - 1] || null,
        prepared: deck.slides[deck.preparedSlide - 1] || null,
        slides: deck.slides
      } : null,
      decks: [...this.decks.values()].map(d => ({
        id: d.id,
        name: d.name,
        total: d.totalSlides,
        aspect: d.aspect,
        hasVideos: d.slides?.some(s => s.hasVideo),
        hasAnimations: d.slides?.some(s => s.totalAnimationSteps > 0)
      }))
    };
  }
}
