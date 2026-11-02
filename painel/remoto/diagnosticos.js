// Relato de problema: formulário curto + pacote de diagnóstico. Serve à janela Diagnóstico e a Sobre e suporte.
(() => {
  'use strict';
  const prefixo = document.currentScript?.dataset.prefixo || '';
  const E = (id) => document.getElementById(prefixo + id);
  const host = E('relato');
  if (!host) return;
  const id = (nome) => prefixo + nome;

  host.classList.add('p3-relato');
  host.innerHTML = `
    <p id="${id('crash')}" class="p3-alerta" role="alert" hidden></p>
    <label class="p3-field">O que aconteceu
      <textarea id="${id('note')}" maxlength="2000" rows="3" placeholder="A mensagem na tela, o que parou, o horário"></textarea>
    </label>
    <label class="p3-field">O que você estava fazendo
      <textarea id="${id('fazendo')}" maxlength="2000" rows="3" placeholder="Passo a passo até o problema"></textarea>
    </label>
    <label class="p3-field">O que deveria acontecer
      <input id="${id('esperado')}" maxlength="500" autocomplete="off">
    </label>
    <div class="p3-grid">
      <label class="p3-field">Impacto
        <select id="${id('impacto')}">
          <option value="">Escolher</option>
          <option value="fechou">Fechou ou travou o programa</option>
          <option value="saida">Parou saída, gravação ou transmissão</option>
          <option value="operacao">Atrapalha a operação</option>
          <option value="visual">Detalhe visual</option>
        </select>
      </label>
      <label class="p3-field">Com que frequência
        <select id="${id('frequencia')}">
          <option value="">Escolher</option>
          <option value="sempre">Sempre</option>
          <option value="as-vezes">Às vezes</option>
          <option value="uma-vez">Só uma vez</option>
        </select>
      </label>
      <label class="p3-field">Seu nome
        <input id="${id('machine')}" maxlength="80" spellcheck="false" autocomplete="name">
      </label>
      <label class="p3-field">Contato
        <input id="${id('contato')}" maxlength="120" spellcheck="false" autocomplete="off" placeholder="WhatsApp ou e-mail">
      </label>
    </div>
    <div class="p3-row">
      <button type="button" id="${id('generate')}" class="primary">Gerar pacote</button>
      <button type="button" id="${id('pasta')}" hidden>Abrir pasta</button>
      <a id="${id('download')}" hidden style="font-weight:700;text-decoration:underline;cursor:pointer">Baixar ZIP</a>
    </div>
    <p id="${id('status')}" class="p3-note" role="status">Senhas e chaves são removidas. Nada é enviado sozinho.</p>
    <p id="${id('destino')}" class="p3-row" hidden></p>
    <details id="${id('preview')}" hidden>
      <summary>Ver o que foi coletado</summary>
      <pre id="${id('contents')}" class="p3-log" style="max-height:280px"></pre>
    </details>`;

  const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function mostrarDestino(destino) {
    const no = E('destino');
    if (!destino) { no.hidden = true; return; }
    no.hidden = false;
    no.textContent = '';
    const texto = document.createElement('span');
    texto.textContent = 'Enviar para: ' + destino;
    const copiar = document.createElement('button');
    copiar.type = 'button';
    copiar.textContent = 'Copiar';
    copiar.onclick = async () => { try { await navigator.clipboard.writeText(destino); copiar.textContent = 'Copiado'; } catch { copiar.textContent = 'Copie manualmente'; } };
    no.append(texto, copiar);
  }

  async function situacao() {
    try {
      const r = await fetch('/api/diagnostics', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) return;
      const aviso = E('crash');
      aviso.hidden = !d.crashPendente;
      if (d.crashPendente) aviso.textContent = 'O 3Mix fechou com erro em ' + quando(d.ultimoCrash) + '. Gere o pacote para enviar o relatório.';
      mostrarDestino(d.destino);
    } catch { /* fora deste computador */ }
  }

  E('generate').onclick = async () => {
    E('generate').disabled = true;
    E('download').hidden = true;
    E('pasta').hidden = true;
    E('preview').hidden = true;
    E('status').textContent = 'Reunindo logs e removendo credenciais…';
    try {
      const nome = E('machine').value.trim();
      const relato = { aconteceu: E('note').value, fazendo: E('fazendo').value, esperado: E('esperado').value, impacto: E('impacto').value, frequencia: E('frequencia').value, nome, contato: E('contato').value };
      const response = await fetch('/api/diagnostics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: relato.aconteceu, relato, ...(nome ? { machineName: nome } : {}) }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw Error(data.error || 'Falha ao gerar o pacote');
      E('status').textContent = `Pacote pronto: ${data.name} · ${data.report.logs.length} logs · ${(data.size / 1024 / 1024).toFixed(1)} MB`;
      E('download').href = '/api/diagnostics/download?id=' + encodeURIComponent(data.id);
      E('download').download = data.name;
      E('download').hidden = false;
      E('pasta').hidden = false;
      E('crash').hidden = true;
      const preview = await fetch('/api/diagnostics/preview?id=' + encodeURIComponent(data.id));
      const value = await preview.json();
      if (!preview.ok || !value.success) throw Error(value.error || 'Prévia indisponível');
      E('contents').textContent = value.text;
      E('preview').hidden = false;
    } catch (e) {
      E('status').textContent = e.message;
    } finally {
      E('generate').disabled = false;
    }
  };

  E('pasta').onclick = async () => {
    try {
      const r = await fetch('/api/diagnostics/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (!r.ok || !d.success) throw Error(d.error || 'Não abriu a pasta');
    } catch (e) { E('status').textContent = e.message; }
  };

  situacao();
})();
