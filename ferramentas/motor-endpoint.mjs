// Descoberta do motor 3Mix que está no ar.
//
// Motivo: a instalação do operador guarda a porta do WebSocket em
// config/obs-studio/plugin_config/obs-websocket/config.json e a repete no
// painel/local.js. Se o motor subir em outra porta (build de QA, porta
// remanejada, configuração antiga), painel e controle ficam "desconectados"
// mesmo com o motor no ar.
//
// Regra: a porta configurada sempre tem prioridade. Só quando ela não está
// respondendo é que procuramos outra instância viva do 3Mix na máquina.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const sha = (text) => createHash('sha256').update(text).digest('base64');

// Portas candidatas, em ordem de preferência, quando a configurada não responde.
export const PORTAS_CANDIDATAS = [4455, 4466, 4566, 5466, 14466, 15466];

export function raizDe(root) {
  return root || process.env.FREEMIX_ROOT || new URL('../', import.meta.url).pathname.replace(/^\//, '');
}

export function configDoMotor(root) {
  const path = join(raizDe(root), 'config/obs-studio/plugin_config/obs-websocket/config.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function webSocketDe(root) {
  try {
    return createRequire(join(raizDe(root), 'package.json'))('ws');
  } catch {
    return null;
  }
}

// Handshake completo do obs-websocket 5. Resolve quando o motor confirma a
// identificação (op 2) e falha quando a senha não bate.
export function sondarMotor({ port, password = '', timeoutMs = 1500, root }) {
  const WebSocket = webSocketDe(raizDe(root || process.env.FREEMIX_ROOT));
  return new Promise((resolve) => {
    if (!WebSocket || !Number.isInteger(port)) return resolve({ ok: false, erro: 'cliente websocket indisponível' });
    let ws;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch (erro) {
      return resolve({ ok: false, erro: erro.message });
    }
    let pronto = false;
    const encerrar = (resultado) => {
      if (pronto) return;
      pronto = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* já fechado */ }
      resolve(resultado);
    };
    const timer = setTimeout(() => encerrar({ ok: false, erro: 'tempo esgotado' }), timeoutMs);
    ws.on('error', () => encerrar({ ok: false, erro: 'sem resposta' }));
    ws.on('message', (bruto) => {
      let mensagem;
      try { mensagem = JSON.parse(String(bruto)); } catch { return; }
      if (mensagem.op === 0) {
        const desafio = mensagem.d && mensagem.d.authentication;
        const dados = { rpcVersion: 1, eventSubscriptions: 0 };
        if (desafio) dados.authentication = sha(sha(password + desafio.salt) + desafio.challenge);
        try { ws.send(JSON.stringify({ op: 1, d: dados })); } catch { encerrar({ ok: false, erro: 'sem resposta' }); }
        return;
      }
      if (mensagem.op === 2) {
        const falha = mensagem.d && mensagem.d.requestStatus && mensagem.d.requestStatus.result === false;
        encerrar(falha
          ? { ok: false, erro: (mensagem.d.requestStatus.comment || 'identificação recusada'), exigeSenha: true }
          : { ok: true, port });
      }
    });
  });
}

// Procura o motor no ar. A porta configurada vem sempre primeiro.
export async function resolverMotor(root, { portasExtra = [], senha = '' } = {}) {
  const raiz = raizDe(root);
  const config = configDoMotor(raiz);
  const configurada = config && Number.isInteger(config.server_port) ? config.server_port : null;
  const senhaConfig = senha || (config && config.server_password) || '';
  const candidatas = [];
  const acrescentar = (porta) => {
    if (Number.isInteger(porta) && porta > 0 && porta < 65536 && !candidatas.includes(porta)) candidatas.push(porta);
  };
  acrescentar(configurada);
  for (const porta of portasExtra) acrescentar(Number(porta));
  if (process.env.FREEMIX_WS_PORT) acrescentar(Number(process.env.FREEMIX_WS_PORT));
  for (const porta of PORTAS_CANDIDATAS) acrescentar(porta);
  if (!candidatas.length) return { ok: false, erro: 'nenhuma porta de motor conhecida' };

  const tentativas = [];
  for (const porta of candidatas) {
    let resultado = await sondarMotor({ port: porta, password: senhaConfig, timeoutMs: 1200, root: raiz });
    if (!resultado.ok && resultado.exigeSenha && porta !== configurada) {
      // Outro motor com senha própria: tenta sem senha antes de desistir.
      resultado = await sondarMotor({ port: porta, password: '', timeoutMs: 1200, root: raiz });
      if (resultado.ok) return { ok: true, port: porta, senha: '', senhaConfig, configurada, fonte: 'descoberto' };
    }
    if (resultado.ok) {
      return {
        ok: true,
        port: porta,
        senha: senhaConfig,
        senhaConfig,
        configurada,
        fonte: porta === configurada ? 'configurado' : 'descoberto'
      };
    }
    tentativas.push(porta + ': ' + (resultado.erro || 'sem resposta'));
  }
  return { ok: false, erro: 'nenhum motor respondeu nas portas ' + candidatas.join(', '), tentativas };
}

// Mantém o painel (local.js) apontando para o motor que está no ar.
export async function sincronizarPainel(root, endpoint) {
  const raiz = raizDe(root);
  const painelDir = process.env.FREEMIX_PANEL_DIR || join(raiz, 'painel');
  const path = join(painelDir, 'local.js');
  let atual = {};
  const texto = await readFile(path, 'utf8').catch(() => '');
  const encontrado = /window\.MESA_LOCAL\s*=\s*(\{[^;]+\})\s*;?/.exec(texto);
  if (encontrado) { try { atual = JSON.parse(encontrado[1]); } catch { atual = {}; } }
  const url = `ws://127.0.0.1:${endpoint.port}`;
  if (atual.url === url && atual.password === endpoint.senha) return { alterado: false, path };
  const novo = { ...atual, url, password: endpoint.senha };
  if (existsSync(path)) await copyFile(path, path + '.bak');
  await writeFile(path,
    '// Configuração local; não incluir em pacotes de atualização.\nwindow.MESA_LOCAL = ' + JSON.stringify(novo) + ';\n',
    'utf8');
  return { alterado: true, path, url, anterior: atual.url || null };
}
