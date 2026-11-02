// Checklist de Primeira Transmissão — Fase 3.3 do super-prompt ("checklist de primeira
// transmissão em uma página", item que só existia como texto solto em GUIA-RAPIDO.md,
// fora do app). Página standalone, sem motor obrigatório para funcionar (o estado das
// caixas é só localStorage) — o botão "Abrir Pre-Flight real" é o único ponto que fala
// com o motor, reaproveitando a rota /preflight já existente e testada, nunca
// reimplementando a lógica de verificação aqui.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  const STORAGE_KEY = '3mix.checklist-primeira-transmissao';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* localStorage indisponível não deveria travar a checklist */ }
  }

  const boxes = [...document.querySelectorAll('[data-ck]')];

  function updateProgress() {
    const checked = boxes.filter((b) => b.checked).length;
    E('ck-progresso').textContent = checked + ' de ' + boxes.length + ' confirmados';
  }

  function restore() {
    const state = load();
    for (const box of boxes) box.checked = !!state[box.id];
    updateProgress();
  }

  for (const box of boxes) {
    box.addEventListener('change', () => {
      const state = load();
      state[box.id] = box.checked;
      save(state);
      updateProgress();
    });
  }

  E('ck-limpar').addEventListener('click', () => {
    if (!confirm('Desmarcar todos os itens da checklist?')) return;
    for (const box of boxes) box.checked = false;
    save({});
    updateProgress();
  });

  async function openWindow(route) {
    try {
      const r = await fetch('/api/panel-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route }), signal: AbortSignal.timeout(8000) });
      if ((await r.json()).success === true) return;
    } catch { /* fora do programa, ou motor não respondeu — cai no fallback abaixo */ }
    window.open(route, '_blank', 'noopener');
  }

  E('ck-abrir-preflight').addEventListener('click', () => openWindow('/preflight'));

  restore();
})();

