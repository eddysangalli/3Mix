// Patch de Sinais — primeira integração visual real do Patch Registry (antes só existia
// como contrato HTTP sem nenhuma tela, achado real apontado em revisão: "o contrato HTTP
// existe e teria sido testado, mas a integração com a mesa não foi demonstrada como
// completa"). Página standalone (mesmo padrão de central-saidas.js — fetch direto, sem
// depender do switch central de controle.js), pois Patch não pertence a nenhuma página
// existente e esta lista própria evita inflar ainda mais aquele arquivo compartilhado.
(() => {
  'use strict';
  const E = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const message = (s, error = false) => { const box = E('message') || E('error'); if (!box) return; box.hidden = false; box.textContent = s; box.className = error ? 'error' : 'ok'; };

  async function readJson(path) {
    const r = await fetch(path, { signal: AbortSignal.timeout(8000) });
    const v = await r.json();
    if (!r.ok || v.success === false) throw Error(v.error || ('Falha ao consultar ' + path));
    return v;
  }

  async function postControl(action, data = {}) {
    const r = await fetch('/api/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(15000)
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok || v.success === false) throw Error(v.error || 'O motor recusou o Patch');
    return v;
  }

  function signalBadge(signal) {
    if (signal.kind === 'me-output') return '<span class="pr-badge pr-me">M/E ' + signal.meId + '</span> Saída';
    return '<span class="pr-badge pr-signal">' + (signal.kind === 'composition' ? 'COMP' : 'INPUT') + '</span> ' + esc(signal.label || '');
  }

  let signalsByKey = new Map(); // signalKey (sceneUuid real) -> signal catalogado
  let inputsByUuid = new Map(); // inputKey (sceneUuid) -> nome

  async function refresh() {
    try {
      const [signalsRes, patchRes] = await Promise.all([readJson('/api/signals'), readJson('/api/patch')]);
      const signals = signalsRes.signals || [];

      // Inputs elegíveis como DESTINO do patch: entradas reais do acervo, nunca
      // Compositions (patch-registry-producao.mjs rejeita isso explicitamente —
      // entradas-producao.mjs é dona exclusiva dos slots de Composition) e nunca
      // um M/E (não é um Input, é um sinal — faria sentido só como origem).
      const inputOptions = signals.filter((s) => s.kind === 'input');
      inputsByUuid = new Map(inputOptions.map((s) => [s.inputKey, s.label]));
      E('pr-input').innerHTML = inputOptions.map((s) =>
        '<option value="' + esc(s.inputKey) + '">' + esc(s.label) + '</option>'
      ).join('') || '<option value="">Nenhum Input elegível encontrado</option>';

      // Sinais elegíveis como ORIGEM: qualquer signal com uma chave real resolvível
      // (routable:true para M/E — só fica assim depois que o proxy existe de
      // verdade; signalKey para os demais é a própria inputKey/sceneUuid).
      signalsByKey = new Map();
      const signalOptions = [];
      for (const s of signals) {
        if (s.kind === 'me-output') {
          if (!s.routable || !s.signalKey) continue; // proxy ainda não existe — não oferece como opção morta
          signalsByKey.set(s.signalKey, s);
          signalOptions.push({ key: s.signalKey, label: 'M/E ' + s.meId + ' · Saída' });
        } else if (s.kind === 'input' || s.kind === 'composition') {
          signalsByKey.set(s.inputKey, s);
          signalOptions.push({ key: s.inputKey, label: s.label });
        }
      }
      E('pr-signal').innerHTML = signalOptions.map((o) =>
        '<option value="' + esc(o.key) + '">' + esc(o.label) + '</option>'
      ).join('') || '<option value="">Nenhum sinal disponível</option>';

      // Tabela de patches ativos (vindos de /api/patch — metadado persistido, não
      // um estado derivado do catálogo; o sinal pode ter mudado de nome desde o
      // patch, por isso resolvemos o rótulo atual via signalsByKey quando possível).
      const patches = patchRes.patches || {};
      const rows = Object.entries(patches).map(([inputKey, p]) => {
        const inputName = inputsByUuid.get(inputKey) || inputKey;
        const signal = signalsByKey.get(p.signalId);
        const signalLabel = signal ? signalBadge(signal) : '<span class="pr-badge pr-signal">?</span> ' + esc(p.signalId);
        const when = p.appliedAt ? new Date(p.appliedAt).toLocaleString('pt-BR') : '—';
        return '<tr><td>' + esc(inputName) + '</td><td>' + signalLabel + '</td><td>' + esc(when) + '</td>'
          + '<td><button type="button" class="pr-remove" data-restore="' + esc(inputKey) + '">Desfazer</button></td></tr>';
      });
      E('pr-rows').innerHTML = rows.join('') || '<tr><td colspan="4">Nenhum Patch aplicado neste projeto.</td></tr>';
      E('pr-state').textContent = 'Conectado';
    } catch (e) {
      E('pr-rows').innerHTML = '<tr><td colspan="4">' + esc(e.message) + '</td></tr>';
      E('pr-state').textContent = 'Sem leitura do motor';
    }
  }

  E('pr-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = E('pr-input').value, signal = E('pr-signal').value;
    if (!input || !signal) { message('Escolha o Input e o sinal de origem.', true); return; }
    try {
      await postControl('patch_set', { input, signal });
      message('Patch aplicado.');
      await refresh();
    } catch (e) {
      message(e.message, true);
    }
  });

  // "Desfazer" aqui reaplica o patch do Input de volta para ele mesmo não é uma
  // operação que o motor expõe (patch_set exige um signal diferente do próprio
  // Input — "Um Input não pode ser roteado para si mesmo"). Sem uma ação nativa
  // de remoção, o botão só informa isso claramente em vez de fingir uma reversão
  // que não existe — honesto é melhor que um botão que não faz nada de verdade.
  E('pr-rows').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-restore]');
    if (!btn) return;
    message('Para desfazer, aplique um novo Patch apontando para o sinal original desse Input (não há "remover Patch" no motor hoje — só substituir por outro).', true);
  });

  refresh();
  setInterval(refresh, 5000);
})();

