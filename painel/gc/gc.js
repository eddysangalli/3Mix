// Shared by every 3Mix title template (each one loads it with a <script> line just before </body>).
// A template only has to define window.GC = { play(data), stop(), update(data) } and start hidden.
// This file hands the template its field values (kept in the address, after "#"), plays the entrance when the
// title goes on air and the exit when it leaves, and applies what the operator edits while it is on air.
(() => {
  const read = () => { try { return JSON.parse(decodeURIComponent(location.hash.slice(1))) || {}; } catch { return {}; } };
  const cfg = read();
  let shown = false, leaving = 0;
  const configure = (timeline) => { if (window.FreeMixGCCompatibility?.version === 1 && typeof window.GC?.configure === 'function') window.GC.configure(timeline || {}); };
  const show = (on, instant) => {
    if (!window.GC || on === shown) return;
    shown = on;
    if (instant) { const s = document.createElement("style"); s.textContent = "*{transition:none!important;animation-duration:0s!important}"; document.head.appendChild(s); setTimeout(() => s.remove(), 150); }
    configure(cfg.timeline);if (on) window.GC.play(cfg.d || {}); else window.GC.stop();
  };
  window.addEventListener("DOMContentLoaded", () => {
    configure(cfg.timeline);
    if (window.GC && cfg.d) window.GC.update(cfg.d);
    if (!window.obsstudio) show(true);   // opened in an ordinary browser, to look at the template
  });
  // The program tells the page when its source goes on air or leaves it.
  window.addEventListener("obsSourceActiveChanged", (e) => show(!!(e.detail && e.detail.active)));
  // The panel: field edits; an early exit, so the exit animation is seen before the overlay is cut; and, every
  // couple of seconds, the list of what is on air, for a page that was loaded with its source already on air.
  window.addEventListener("freemix-gc", (e) => {
    const m = e.detail || {}; if (m.name !== cfg.n) return;
    if (m.timeline) { cfg.timeline = m.timeline; configure(cfg.timeline); }
    if (m.data) { cfg.d = {...cfg.d,...m.data}; if (window.GC) window.GC.update(cfg.d); }
    if (typeof m.show === "boolean") { if (!m.show) leaving = Date.now(); if(m.replay===true&&m.show)shown=false;show(m.show); }
  });
  window.addEventListener("freemix-gc-air", (e) => {
    const names = (e.detail && e.detail.names) || [];
    if (names.includes(cfg.n) && !shown && Date.now() - leaving > 2500) show(true, true);
  });
})();
