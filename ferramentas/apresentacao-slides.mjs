import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

/**
 * Converte EMUs (English Metric Units) do OpenXML para pixels em 1080p
 */
function emuToPx(emu, totalEmu, totalPx) {
  if (!emu || isNaN(emu)) return 0;
  return Math.round((Number(emu) / Number(totalEmu)) * Number(totalPx));
}

/**
 * Escapa strings para uso seguro em XML/SVG e HTML
 */
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Motor de Apresentação de Slides & PowerPoint (3Mix SlideEngine Pro)
 * Suporte nativo a OpenXML (.pptx), vídeos incorporados com áudio roteado,
 * animações contínuas, diagramação livre, controle de playback sem recarga
 * e isolamento estrito entre Preview e Program.
 */
export class SlideEngine extends EventEmitter {
  constructor(options = {}) {
    super();
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
   * Importação completa e detalhada de arquivo PPTX
   */
  async importPptx(fileSource, originalName = 'Apresentação') {
    await this.ready;
    let buffer;
    if (Buffer.isBuffer(fileSource)) {
      buffer = fileSource;
    } else if (typeof fileSource === 'string' && existsSync(fileSource)) {
      buffer = await readFile(fileSource);
      if (!originalName || originalName === 'Apresentação') {
        originalName = basename(fileSource, extname(fileSource));
      }
    } else {
      throw new Error('Arquivo PPTX inválido ou não encontrado: ' + fileSource);
    }

    const zip = await JSZip.loadAsync(buffer);
    const deckId = 'deck_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const deckCacheDir = join(this.cacheDir, deckId);
    await mkdir(deckCacheDir, { recursive: true });

    // 1. Detectar proporção (16:9 padrão ou 4:3 legado)
    let aspect = '16:9';
    let slideWidthEmu = 12192000;
    let slideHeightEmu = 6858000;
    const presEntry = zip.file('ppt/presentation.xml');
    if (presEntry) {
      const presXml = await presEntry.async('string');
      const szMatch = presXml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
      if (szMatch) {
        slideWidthEmu = parseInt(szMatch[1], 10);
        slideHeightEmu = parseInt(szMatch[2], 10);
        const ratio = slideWidthEmu / slideHeightEmu;
        if (Math.abs(ratio - (4 / 3)) < 0.15) {
          aspect = '4:3';
        }
      }
    }

    const screenWidthPx = 1920;
    const screenHeightPx = 1080;
    const contentWidthPx = aspect === '4:3' ? 1440 : 1920;
    const contentOffsetX = aspect === '4:3' ? 240 : 0;

    const mediaFiles = new Map();
    const videoFiles = new Map();
    const slideXmls = new Map();
    const notesXmls = new Map();

    // 2. Extrair mídias (imagens e vídeos) de ppt/media/*
    for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;
      if (relativePath.startsWith('ppt/media/')) {
        const fileName = basename(relativePath);
        const fileData = await zipEntry.async('nodebuffer');
        const destPath = join(deckCacheDir, fileName);
        await writeFile(destPath, fileData);
        const urlPath = `/api/slides/media/${deckId}/${fileName}`;
        mediaFiles.set(fileName, { fileName, localPath: destPath, url: urlPath });

        if (/\.(mp4|webm|avi|mov|mkv|m4v|wmv)$/i.test(fileName)) {
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

      // Mapear relacionamentos do slide
      const relsMap = new Map();
      const relsEntry = zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`);
      if (relsEntry) {
        const relsXml = await relsEntry.async('string');
        const relMatches = [...relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)];
        for (const rm of relMatches) {
          relsMap.set(rm[1], basename(rm[2]));
        }
      }

      // 4. Parser completo de elementos livres do slide (p:spTree)
      const elements = [];
      const videos = [];
      const images = [];
      const tables = [];
      const bullets = [];
      let mainTitle = '';

      // Extrair todas as formas (<p:sp>)
      const spMatches = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)];
      for (const spm of spMatches) {
        const spXml = spm[1];
        const isTitle = /type="(?:ctrTitle|title)"/i.test(spXml);

        // Coordenadas
        const xfrmMatch = spXml.match(/<a:xfrm>[\s\S]*?<a:off\s+x="(\d+)"\s+y="(\d+)"\/>[\s\S]*?<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
        let x = 100, y = 200, w = 800, h = 400;
        if (xfrmMatch) {
          x = contentOffsetX + emuToPx(xfrmMatch[1], slideWidthEmu, contentWidthPx);
          y = emuToPx(xfrmMatch[2], slideHeightEmu, screenHeightPx);
          w = emuToPx(xfrmMatch[3], slideWidthEmu, contentWidthPx);
          h = emuToPx(xfrmMatch[4], slideHeightEmu, screenHeightPx);
        }

        // Cor de fundo da forma
        let bgColor = null;
        const bgMatch = spXml.match(/<p:spPr>[\s\S]*?<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9a-fA-F]{6})"/);
        if (bgMatch) bgColor = '#' + bgMatch[1];

        // Bordas
        let borderColor = null;
        const borderMatch = spXml.match(/<a:ln[^>]*>[\s\S]*?<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9a-fA-F]{6})"/);
        if (borderMatch) borderColor = '#' + borderMatch[1];

        // Tipo de geometria
        let geom = 'rect';
        const geomMatch = spXml.match(/<a:prstGeom prst="([^"]+)"/);
        if (geomMatch) geom = geomMatch[1];

        // Parágrafos e trechos de texto
        const paragraphs = [];
        const pMatches = [...spXml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)];
        for (const pm of pMatches) {
          const pXml = pm[1];
          const alignMatch = pXml.match(/algn="([a-z]+)"/i);
          const align = alignMatch ? alignMatch[1].toLowerCase() : (isTitle ? 'center' : 'left');

          const runs = [];
          const rMatches = [...pXml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)];
          for (const rm of rMatches) {
            const rXml = rm[1];
            const textMatch = rXml.match(/<a:t>([^<]*)<\/a:t>/);
            if (!textMatch) continue;
            const text = textMatch[1];

            // Propriedades do texto
            const szMatch = rXml.match(/sz="(\d+)"/);
            const szPt = szMatch ? parseInt(szMatch[1], 10) / 100 : (isTitle ? 38 : 22);
            const fontSizePx = Math.round(szPt * 1.33);

            const clrMatch = rXml.match(/<a:srgbClr val="([0-9a-fA-F]{6})"/);
            const color = clrMatch ? '#' + clrMatch[1] : (isTitle ? '#38bdf8' : '#e2e8f0');

            const fontMatch = rXml.match(/typeface="([^"]+)"/);
            const font = fontMatch ? fontMatch[1] : 'Segoe UI';

            const isBold = /b="1"/i.test(rXml);
            const isItalic = /i="1"/i.test(rXml);

            runs.push({ text, fontSizePx, color, font, isBold, isItalic });
          }

          if (runs.length > 0) {
            const fullLine = runs.map(r => r.text).join('');
            paragraphs.push({ align, runs, fullLine });
            if (!isTitle) bullets.push(fullLine);
            else if (!mainTitle) mainTitle = fullLine;
          }
        }

        if (paragraphs.length > 0 || bgColor) {
          elements.push({
            type: 'shape',
            geom,
            x, y, w, h,
            bgColor,
            borderColor,
            paragraphs,
            isTitle
          });
        }
      }

      // Se nenhum título explícito foi achado, usa o primeiro elemento
      if (!mainTitle) {
        const textRuns = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1].trim()).filter(Boolean);
        mainTitle = textRuns[0] || `Slide ${i + 1}`;
      }

      // Extrair imagens e vídeos livres (<p:pic>)
      const picMatches = [...xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)];
      for (const picm of picMatches) {
        const picXml = picm[1];
        const blipMatch = picXml.match(/<a:blip[^>]*r:embed="([^"]+)"/);
        const relId = blipMatch ? blipMatch[1] : null;
        const fileName = relId ? relsMap.get(relId) : null;

        const xfrmMatch = picXml.match(/<a:xfrm>[\s\S]*?<a:off\s+x="(\d+)"\s+y="(\d+)"\/>[\s\S]*?<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
        let x = 900, y = 200, w = 800, h = 600;
        if (xfrmMatch) {
          x = contentOffsetX + emuToPx(xfrmMatch[1], slideWidthEmu, contentWidthPx);
          y = emuToPx(xfrmMatch[2], slideHeightEmu, screenHeightPx);
          w = emuToPx(xfrmMatch[3], slideWidthEmu, contentWidthPx);
          h = emuToPx(xfrmMatch[4], slideHeightEmu, screenHeightPx);
        }

        if (fileName && videoFiles.has(fileName)) {
          const vData = videoFiles.get(fileName);
          const autoPlay = /autoPlay="1"|type="play"/i.test(picXml);
          const vidObj = {
            fileName,
            localPath: vData.localPath,
            url: vData.url,
            x, y, w, h,
            autoPlay,
            loop: false
          };
          videos.push(vidObj);
          elements.push({ type: 'video', ...vidObj });
        } else if (fileName && mediaFiles.has(fileName)) {
          const mData = mediaFiles.get(fileName);
          const imgObj = {
            fileName,
            localPath: mData.localPath,
            url: mData.url,
            x, y, w, h
          };
          images.push(imgObj);
          elements.push({ type: 'image', ...imgObj });
        }
      }

      // Extrair tabelas (<a:tbl>)
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
        if (rows.length > 0) {
          tables.push(rows);
          elements.push({
            type: 'table',
            x: 100,
            y: 360,
            w: 1200,
            h: rows.length * 60,
            tableData: rows
          });
        }
      }

      // 5. Parser rigoroso de animações em <p:timing> (Sem efeitos arbitrários!)
      const animSteps = [];
      let totalAnimationSteps = 0;
      if (/<p:timing>/i.test(xml)) {
        const animEffects = [...xml.matchAll(/<p:animEffect[^>]*filter="([^"]+)"/g)].map(m => m[1].toLowerCase());
        const clickSteps = [...xml.matchAll(/nodeType="clickEffect"/g)];
        const stepCount = Math.max(animEffects.length, clickSteps.length);

        if (stepCount > 0 && bullets.length > 0) {
          totalAnimationSteps = Math.min(stepCount, bullets.length);
          for (let sIdx = 0; sIdx < totalAnimationSteps; sIdx++) {
            let effect = 'appear'; // Efeito padrão fiel: corte direto
            if (animEffects[sIdx]) {
              const eff = animEffects[sIdx];
              if (eff.includes('fade')) effect = 'fade';
              else if (eff.includes('fly') || eff.includes('wipe')) effect = 'fly';
              else if (eff.includes('zoom') || eff.includes('wheel')) effect = 'zoom';
            }
            const bulletIdx = bullets.length >= totalAnimationSteps ? (bullets.length - totalAnimationSteps + sIdx) : sIdx;
            animSteps.push({
              text: bullets[bulletIdx] || `Passo ${sIdx + 1}`,
              step: sIdx + 1,
              effect
            });
          }
        }
      }

      // 6. Transição de slide
      let transition = { type: 'cut', durationMs: 300 };
      if (/<p:fade/i.test(xml)) transition = { type: 'fade', durationMs: 500 };
      else if (/<p:push[^>]*dir="l"/i.test(xml)) transition = { type: 'slide-left', durationMs: 400 };
      else if (/<p:push/i.test(xml)) transition = { type: 'slide', durationMs: 400 };
      else if (/<p:wipe/i.test(xml)) transition = { type: 'wipe', durationMs: 400 };
      else if (/<p:morph/i.test(xml)) {
        transition = {
          type: 'morph-interpolation',
          durationMs: 600,
          classification: 'suporte-parcial-adaptado'
        };
      }

      // 7. Recursos não suportados / convertidos (Visíveis EXCLUSIVAMENTE para o Operador)
      const unsupportedFeatures = [];
      if (/<p:morph/i.test(xml)) {
        unsupportedFeatures.push('Transição Morph (Suporte Parcial: adaptada para Interpolação 2D Suave do 3Mix; morphing de malha 3D proprietária não aplicável)');
      }
      if (/<p:animMotion[^>]*path="M[^"]*C/i.test(xml)) {
        unsupportedFeatures.push('Animação de Caminho Curvo (Suporte Parcial: simplificada para movimento linear)');
      }
      if (/<a:camera[^>]*prst="isometric/i.test(xml)) {
        unsupportedFeatures.push('Projeção 3D Isométrica (Suporte Parcial: renderizada em plano 2D)');
      }

      // Notas do apresentador
      const notesXml = notesXmls.get(`ppt/notesSlides/notesSlide${i + 1}.xml`) || '';
      const notes = [...notesXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1].trim()).filter(Boolean).join('\n') || 'Sem notas adicionais para este slide.';

      // 8. Renderizar SVG broadcast (SEM QUALQUER AVISO TÉCNICO NO VÍDEO!)
      const svgSlide = this.generateSvgSlide({
        num: i + 1,
        title: mainTitle,
        aspect,
        elements,
        videos,
        images,
        bullets,
        tables,
        animationSteps: animSteps,
        currentStep: 0,
        showWarningsInProgram: false // Regra canônica de broadcast: NUNCA vazar avisos para o Program!
      });

      const stepSuffix = totalAnimationSteps > 0 ? '_step_0' : '';
      const slideSvgPath = join(deckCacheDir, `slide_${i + 1}${stepSuffix}.svg`);
      await writeFile(slideSvgPath, svgSlide, 'utf8');
      if (stepSuffix) {
        await writeFile(join(deckCacheDir, `slide_${i + 1}.svg`), svgSlide, 'utf8');
      }

      // Gerar SVGs para cada passo de animação
      if (totalAnimationSteps > 0) {
        for (let s = 1; s <= totalAnimationSteps; s++) {
          const stepSvg = this.generateSvgSlide({
            num: i + 1,
            title: mainTitle,
            aspect,
            elements,
            videos,
            images,
            bullets,
            tables,
            animationSteps: animSteps,
            currentStep: s,
            showWarningsInProgram: false
          });
          await writeFile(join(deckCacheDir, `slide_${i + 1}_step_${s}.svg`), stepSvg, 'utf8');
        }
      }

      slides.push({
        index: i + 1,
        title: mainTitle,
        subtitle: bullets.slice(0, 4).join(' • ') || 'Slide multimídia',
        fullText: bullets.join('\n'),
        notes,
        aspect,
        elementsCount: elements.length,
        hasTable: tables.length > 0,
        tableData: tables[0] || null,
        hasImage: images.length > 0,
        images,
        imageUrl: images[0]?.url || null,
        hasVideo: videos.length > 0,
        videos,
        video: videos[0] || null,
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
      const fallbackSvg = this.generateSvgSlide({ num: 1, title: originalName, aspect });
      const fallbackPath = join(deckCacheDir, 'slide_1.svg');
      await writeFile(fallbackPath, fallbackSvg, 'utf8');
      slides.push({
        index: 1,
        title: originalName,
        subtitle: 'Apresentação sem slides editáveis',
        fullText: originalName,
        notes: '',
        aspect,
        hasTable: false,
        hasImage: false,
        hasVideo: false,
        renderedPath: fallbackPath,
        svgPreview: fallbackSvg
      });
    }

    const deck = {
      id: deckId,
      name: originalName,
      aspect,
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

  /**
   * Gerador universal de SVG broadcast a partir de elementos livres ou template híbrido
   */
  generateSvgSlide(opts = {}) {
    const {
      num = 1,
      title = 'Slide',
      aspect = '16:9',
      elements = [],
      videos = [],
      images = [],
      bullets = [],
      tables = [],
      animationSteps = [],
      currentStep = 0,
      showWarningsInProgram = false // Rigorosamente false para Program
    } = opts;

    const width = 1920;
    const height = 1080;
    const is43 = aspect === '4:3';

    // Estilos CSS para animações contínuas a 60fps aceleradas por GPU
    const animStyles = `
      <style>
        * { box-sizing: border-box; }
        .anim-step {
          transition: opacity 0.45s ease-out, transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: opacity, transform;
        }
        .anim-hidden {
          opacity: 0 !important;
          pointer-events: none;
        }
        .anim-step.anim-fly.anim-hidden {
          transform: translateY(50px);
        }
        .anim-step.anim-zoom.anim-hidden {
          transform: scale(0.7);
          transform-origin: center;
        }
        .anim-step.anim-fade.anim-hidden {
          opacity: 0;
        }
        .anim-step.anim-appear.anim-hidden {
          display: none !important;
        }
        .anim-visible {
          opacity: 1 !important;
          transform: none !important;
        }
      </style>
    `;

    // 1. Renderização de elementos livres extraídos do PPTX
    let contentSvg = '';
    if (elements && elements.length > 0) {
      for (const el of elements) {
        if (el.type === 'shape') {
          // Renderiza fundo do card/forma se houver
          let shapeBg = '';
          if (el.bgColor) {
            const rx = el.geom === 'roundRect' ? 'rx="12"' : '';
            const strokeAttr = el.borderColor ? `stroke="${el.borderColor}" stroke-width="2"` : '';
            shapeBg = `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.bgColor}" ${strokeAttr} ${rx}/>`;
          }

          // Renderiza parágrafos de texto
          let textBlocks = '';
          if (el.paragraphs && el.paragraphs.length > 0) {
            let curY = el.y + 40;
            textBlocks = el.paragraphs.map(p => {
              const anchor = p.align === 'center' ? 'middle' : (p.align === 'right' ? 'end' : 'start');
              const startX = p.align === 'center' ? el.x + el.w / 2 : (p.align === 'right' ? el.x + el.w - 20 : el.x + 20);

              const lineSvg = `<text x="${startX}" y="${curY}" text-anchor="${anchor}">
                ${p.runs.map(r => {
                  const weight = r.isBold ? 'font-weight="bold"' : '';
                  const style = r.isItalic ? 'font-style="italic"' : '';
                  const fontFam = escapeXml(r.font);
                  return `<tspan fill="${r.color}" font-size="${r.fontSizePx}" font-family="${fontFam}, 'Segoe UI', Arial, sans-serif" ${weight} ${style}>${escapeXml(r.text)} </tspan>`;
                }).join('')}
              </text>`;
              curY += (p.runs[0]?.fontSizePx || 24) * 1.4;
              return lineSvg;
            }).join('\n');
          }

          contentSvg += `\n${shapeBg}\n${textBlocks}`;
        } else if (el.type === 'image') {
          contentSvg += `\n<image href="${escapeXml(el.url)}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" preserveAspectRatio="xMidYMid meet"/>`;
        } else if (el.type === 'video') {
          const autoPlayAttr = el.autoPlay ? 'autoplay="autoplay"' : '';
          contentSvg += `\n<foreignObject x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#05070a;border:2px solid #1e293b;border-radius:6px;overflow:hidden;box-sizing:border-box;">
              <video id="slide-video-${el.fileName || 'main'}" class="slide-embedded-video" src="${escapeXml(el.url)}" style="width:100%;height:100%;object-fit:contain;" ${autoPlayAttr} loop="loop" controls="controls" playsinline="playsinline"></video>
            </div>
          </foreignObject>`;
        }
      }
    } else {
      // Fallback elegante e limpo se não houver árvore livre
      contentSvg += `\n<text x="${is43 ? 340 : 100}" y="180" font-family="'Segoe UI', Arial, sans-serif" font-size="56" font-weight="bold" fill="#0284c7">${escapeXml(title)}</text>`;
      if (bullets && bullets.length > 0) {
        contentSvg += bullets.slice(0, 8).map((b, idx) => `
          <text x="${is43 ? 340 : 100}" y="${280 + idx * 68}" font-family="'Segoe UI', Arial, sans-serif" font-size="32" fill="#cbd5e1">• ${escapeXml(b)}</text>
        `).join('\n');
      }
    }

    // 2. Renderização de etapas de animação (se configuradas)
    if (animationSteps && animationSteps.length > 0) {
      let animSvg = '\n<g id="animation-layer">';
      animationSteps.forEach((st, idx) => {
        const isVisible = currentStep >= st.step;
        const effectClass = st.effect === 'fly' ? 'anim-fly' : (st.effect === 'zoom' ? 'anim-zoom' : (st.effect === 'fade' ? 'anim-fade' : 'anim-appear'));
        const stepY = 320 + idx * 75;
        const stepX = is43 ? 340 : 100;
        animSvg += `
          <g class="anim-step ${effectClass} ${isVisible ? 'anim-visible' : 'anim-hidden'}" data-anim-step="${st.step}" opacity="${isVisible ? 1 : 0}" ${isVisible ? '' : (st.effect === 'appear' ? 'display="none"' : '')} transform="translate(${stepX}, ${stepY})">
            <circle cx="8" cy="-10" r="5" fill="#38bdf8"/>
            <text x="28" y="0" font-family="'Segoe UI', Arial, sans-serif" font-size="34" fill="#f8fafc">${escapeXml(st.text)}</text>
          </g>`;
      });
      animSvg += '</g>';
      contentSvg += animSvg;
    }

    // 3. Moldura e pilarbox se for 4:3
    if (is43) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="100%" height="100%">
        <defs>
          <linearGradient id="bg43" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#141923"/>
            <stop offset="100%" stop-color="#0a0d14"/>
          </linearGradient>
        </defs>
        ${animStyles}
        <!-- Fundo Pilarbox Lateral Preto/Grafite -->
        <rect width="1920" height="1080" fill="#05070a"/>
        <!-- Canvas Central 4:3 (1440x1080) -->
        <g transform="translate(240, 0)">
          <rect width="1440" height="1080" fill="url(#bg43)" stroke="#1e293b" stroke-width="2"/>
          <rect x="0" y="1040" width="1440" height="40" fill="#334155"/>
          <text x="1380" y="1000" font-family="system-ui, monospace" font-size="28" font-weight="bold" fill="#64748b" text-anchor="end">4:3 · Slide ${num}</text>
        </g>
        ${contentSvg}
      </svg>`;
    }

    // 16:9 Widescreen Padrão
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="100%" height="100%">
      <defs>
        <linearGradient id="bg169" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0d1117"/>
          <stop offset="100%" stop-color="#06080c"/>
        </linearGradient>
      </defs>
      ${animStyles}
      <rect width="1920" height="1080" fill="url(#bg169)"/>
      <rect x="0" y="1055" width="1920" height="25" fill="#0284c7"/>
      <text x="1860" y="1030" font-family="system-ui, monospace" font-size="28" font-weight="bold" fill="#64748b" text-anchor="end">16:9 · Slide ${num}</text>
      ${contentSvg}
    </svg>`;
  }

  getActiveDeck() {
    return this.decks.get(this.activeDeckId) || null;
  }

  /**
   * Prepara o slide para o operador (Preview) mantendo estrito isolamento do Program
   */
  prepareSlide(deckId, slideIndex) {
    if (deckId && this.decks.has(deckId)) this.activeDeckId = deckId;
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const idx = Math.max(1, Math.min(deck.totalSlides, Number(slideIndex) || 1));
    deck.preparedSlide = idx;
    this.saveDecksIndex();
    this.emit('state_changed', this.summary());
    return deck;
  }

  /**
   * Coloca o slide armado no ar (PRESENT TAKE) e atualiza o motor OBS!
   * @param {string} deckId - ID da apresentação
   * @param {number|null} targetIndex - Índice do slide (1-based)
   * @param {Object} options - Opções: emitEvent, targetScene (cena customizada)
   */
  async presentSlide(deckId, targetIndex = null, options = { emitEvent: true, targetScene: 'Slides' }) {
    if (deckId && this.decks.has(deckId)) this.activeDeckId = deckId;
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    if (targetIndex !== null) {
      deck.preparedSlide = Math.max(1, Math.min(deck.totalSlides, Number(targetIndex)));
    }
    deck.currentSlide = deck.preparedSlide;

    const slide = deck.slides[deck.currentSlide - 1];
    const targetScene = options.targetScene || 'Slides';
    if (slide && this.p?.req) {
      try {
        const localFilePath = resolve(slide.renderedPath);
        const fileName = basename(slide.renderedPath);
        const apiPort = process.env.FREEMIX_API_PORT ? Number(process.env.FREEMIX_API_PORT) : 18188;
        
        const viewerUrl = `http://localhost:${apiPort}/api/slides/view/${deck.id}?slide=${deck.currentSlide}&t=${Date.now()}`;
        const slideMediaUrl = `http://localhost:${apiPort}/api/slides/media/${deck.id}/${fileName}?t=${Date.now()}`;

        const browserSettings = {
          is_local_file: false,
          url: viewerUrl,
          width: 1920,
          height: 1080,
          reroute_audio: true,
          restart_when_active: false,
          css: 'body { margin: 0; background: transparent; overflow: hidden; } svg { width: 100vw; height: 100vh; }'
        };

        const sceneList = await this.p.req('GetSceneList').catch(() => null);
        const hasTargetScene = sceneList?.scenes?.some(s => s.sceneName === targetScene);

        if (!hasTargetScene) {
          await this.p.req('CreateScene', { sceneName: targetScene }).catch(() => {});
          await this.p.req('CreateInput', {
            sceneName: targetScene,
            inputName: 'Fonte Slides',
            inputKind: 'browser_source',
            inputSettings: browserSettings
          }).catch(() => {});
        } else {
          await this.p.req('SetInputSettings', {
            inputName: 'Fonte Slides',
            inputSettings: browserSettings
          }).catch(async () => {
            await this.p.req('RemoveInput', { inputName: 'Fonte Slides' }).catch(() => {});
            await this.p.req('CreateInput', {
              sceneName: targetScene,
              inputName: 'Fonte Slides',
              inputKind: 'browser_source',
              inputSettings: browserSettings
            }).catch(() => {});
          });

          await this.p.req('PressInputPropertiesButton', {
            inputName: 'Fonte Slides',
            propertyName: 'refreshnocache'
          }).catch(() => {});
        }
      } catch (err) {
        console.error('SlideEngine present sync error:', err.message);
      }
    }

    if (options.emitEvent !== false) {
      // Notifica stream SSE em tempo real para os clientes conectados
      this.emit('event', {
        action: 'present_slide',
        deckId: deck.id,
        slideIndex: deck.currentSlide,
        slide: slide || null
      });
    }

    await this.saveDecksIndex();
    this.emit('state_changed', this.summary());
    return deck;
  }

  nextSlide(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    if (deck.preparedSlide < deck.totalSlides) {
      deck.preparedSlide++;
    }
    this.saveDecksIndex();
    this.emit('state_changed', this.summary());
    return deck;
  }

  previousSlide(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    if (deck.preparedSlide > 1) {
      deck.preparedSlide--;
    }
    this.saveDecksIndex();
    this.emit('state_changed', this.summary());
    return deck;
  }

  /**
   * Avança um passo de animação no slide no ar (NEXT ANIMATION) com disparo fluido a 60fps
   * ATUALIZAÇÃO VIA SSE APENAS - NÃO RECARREGA O BROWSER SOURCE!
   */
  async nextAnimation(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide && slide.totalAnimationSteps > 0 && slide.currentAnimationStep < slide.totalAnimationSteps) {
      slide.currentAnimationStep++;
      const currentStepObj = slide.animationSteps[slide.currentAnimationStep - 1];
      
      // Atualiza o arquivo em disco para persistência
      await this._updateSlideSvg(deck, slide);

      // Emite evento em tempo real via SSE para animação contínua SEM recarregar o browser!
      this.emit('event', {
        action: 'next_animation',
        deckId: deck.id,
        slideIndex: deck.currentSlide,
        step: slide.currentAnimationStep,
        effect: currentStepObj?.effect || 'appear'
      });

      // NOTA: NÃO chamamos presentSlide() aqui para evitar refresh do Browser Source
      // O visualizador SSE recebe o evento e atualiza o DOM via CSS transitions a 60fps
      this.emit('state_changed', this.summary());
    }
    return deck;
  }

  /**
   * Retrocede um passo de animação no slide no ar
   * ATUALIZAÇÃO VIA SSE APENAS - NÃO RECARREGA O BROWSER SOURCE!
   */
  async previousAnimation(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide && slide.totalAnimationSteps > 0 && slide.currentAnimationStep > 0) {
      slide.currentAnimationStep--;
      await this._updateSlideSvg(deck, slide);

      this.emit('event', {
        action: 'previous_animation',
        deckId: deck.id,
        slideIndex: deck.currentSlide,
        step: slide.currentAnimationStep
      });

      // NOTA: NÃO chamamos presentSlide() aqui para evitar refresh do Browser Source
      this.emit('state_changed', this.summary());
    }
    return deck;
  }

  /**
   * Controles de transporte de vídeo incorporado em tempo real (SEM REINICIAR O VÍDEO)
   */
  async playVideo(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide?.hasVideo) {
      if (slide.video) slide.video.autoPlay = true;
      // Emite comando de execução instantânea no DOM do player (via SSE)
      this.emit('event', {
        action: 'play_video',
        deckId: deck.id,
        slideIndex: deck.currentSlide
      });
    }
    return deck;
  }

  async pauseVideo(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide?.hasVideo) {
      if (slide.video) slide.video.autoPlay = false;
      this.emit('event', {
        action: 'pause_video',
        deckId: deck.id,
        slideIndex: deck.currentSlide
      });
    }
    return deck;
  }

  async restartVideo(deckId) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide?.hasVideo) {
      this.emit('event', {
        action: 'seek_video',
        deckId: deck.id,
        slideIndex: deck.currentSlide,
        time: 0
      });
      this.emit('event', {
        action: 'play_video',
        deckId: deck.id,
        slideIndex: deck.currentSlide
      });
    }
    return deck;
  }

  async seekVideo(deckId, timeInSeconds) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    if (!deck) throw new Error('Nenhuma apresentação selecionada');
    const slide = deck.slides[deck.currentSlide - 1];
    if (slide?.hasVideo) {
      this.emit('event', {
        action: 'seek_video',
        deckId: deck.id,
        slideIndex: deck.currentSlide,
        time: Math.max(0, Number(timeInSeconds) || 0)
      });
    }
    return deck;
  }

  async _updateSlideSvg(deck, slide) {
    const stepSuffix = slide.totalAnimationSteps > 0 ? `_step_${slide.currentAnimationStep}` : '';
    const svgPath = join(this.cacheDir, deck.id, `slide_${slide.index}${stepSuffix}.svg`);
    const svg = this.generateSvgSlide({
      num: slide.index,
      title: slide.title,
      aspect: slide.aspect,
      elements: slide.elements || [],
      videos: slide.videos || (slide.video ? [slide.video] : []),
      images: slide.images || [],
      bullets: slide.animationSteps?.map(a => a.text) || [],
      tables: slide.tableData ? [slide.tableData] : [],
      animationSteps: slide.animationSteps,
      currentStep: slide.currentAnimationStep,
      showWarningsInProgram: false
    });
    slide.svgPreview = svg;
    slide.renderedPath = svgPath;
    await writeFile(svgPath, svg, 'utf8');
    await writeFile(join(this.cacheDir, deck.id, `slide_${slide.index}.svg`), svg, 'utf8');
  }

  /**
   * Renderiza a página HTML completa do visualizador broadcast com conexão SSE em tempo real
   */
  renderViewerPage(deckId = null) {
    const deck = this.decks.get(deckId || this.activeDeckId);
    const slide = deck ? deck.slides[deck.currentSlide - 1] : null;
    const initialSvg = slide ? slide.svgPreview : '<div style="color:#64748b;display:flex;height:100vh;align-items:center;justify-content:center;font-size:32px;">3Mix SlideEngine: Pronto para Apresentação</div>';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>3Mix Slide Viewer Broadcast</title>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100vw; height: 100vh;
      overflow: hidden; background: #000;
      display: flex; align-items: center; justify-content: center;
    }
    #slide-viewport {
      width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center;
    }
    #slide-viewport svg {
      width: 100%; height: 100%;
    }
  </style>
</head>
<body>
  <div id="slide-viewport">${initialSvg}</div>

  <script>
    const deckId = ${JSON.stringify(deck?.id || '')};
    const sse = new EventSource('/api/slides/events');

    sse.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.deckId && deckId && msg.deckId !== deckId) return;

        if (msg.action === 'play_video') {
          const vids = document.querySelectorAll('video');
          vids.forEach(v => v.play().catch(() => {}));
        } else if (msg.action === 'pause_video') {
          const vids = document.querySelectorAll('video');
          vids.forEach(v => v.pause());
        } else if (msg.action === 'seek_video') {
          const vids = document.querySelectorAll('video');
          vids.forEach(v => { v.currentTime = Number(msg.time) || 0; });
        } else if (msg.action === 'next_animation') {
          const target = document.querySelector('[data-anim-step="' + msg.step + '"]');
          if (target) {
            target.classList.remove('anim-hidden');
            target.classList.add('anim-visible');
            target.style.opacity = '1';
            target.style.display = '';
          }
        } else if (msg.action === 'previous_animation') {
          const target = document.querySelector('[data-anim-step="' + (msg.step + 1) + '"]');
          if (target) {
            target.classList.remove('anim-visible');
            target.classList.add('anim-hidden');
            target.style.opacity = '0';
          }
        } else if (msg.action === 'present_slide') {
          if (msg.slide && msg.slide.svgPreview) {
            document.getElementById('slide-viewport').innerHTML = msg.slide.svgPreview;
          }
        }
      } catch (err) {
        console.error('SSE Error:', err);
      }
    };
  </script>
</body>
</html>`;
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
        slidesSummary: deck.slides.map(s => ({
          index: s.index,
          title: s.title,
          subtitle: s.subtitle,
          hasVideo: s.hasVideo,
          hasImage: s.hasImage,
          hasTable: s.hasTable,
          totalAnimationSteps: s.totalAnimationSteps,
          unsupportedFeatures: s.unsupportedFeatures,
          transition: s.transition
        }))
      } : null,
      availableDecks: Array.from(this.decks.values()).map(d => ({
        id: d.id,
        name: d.name,
        totalSlides: d.totalSlides,
        aspect: d.aspect
      }))
    };
  }
}
