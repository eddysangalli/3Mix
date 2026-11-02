// Small obs-websocket 5 client for the portable build. Reads the port and password from the portable config file.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolverMotor, sincronizarPainel } from "./motor-endpoint.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const WebSocket = require("ws");

export const ROOT = process.env.FREEMIX_ROOT || fileURLToPath(new URL("../", import.meta.url));
const sha = (text) => createHash("sha256").update(text).digest("base64");

// opts.events: obs-websocket event subscription mask; opts.onEvent(type, data) receives them.
// opts.restrito: usa somente a porta configurada (usado para conferir se ESTA instalação já está aberta).
export async function connect(opts = {}) {
  const root = opts.root || ROOT;
  const cfg = JSON.parse(readFileSync(`${root}/config/obs-studio/plugin_config/obs-websocket/config.json`, "utf8"));
  // A porta configurada tem prioridade; se o motor estiver em outra porta, ela é descoberta.
  const motor = opts.restrito ? { ok: false } : await resolverMotor(root);
  const port = motor.ok ? motor.port : cfg.server_port;
  const password = motor.ok ? motor.senha : cfg.server_password;
  if (motor.ok) {
    // O painel precisa da mesma porta: sem isto, o navegador continua apontando para a porta morta.
    await sincronizarPainel(root, { port, senha: password }).catch(() => {});
  }
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const pending = new Map();
  let seq = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error("Tempo esgotado ao conectar ao 3Mix")); }, 5000);
    ws.once("error", () => clearTimeout(timer));
    ws.once("close", () => clearTimeout(timer));
    ws.on("error", reject);
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (m.op === 0) {
        const a = m.d.authentication;
        ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: opts.events || 0, ...(a ? { authentication: sha(sha(password + a.salt) + a.challenge) } : {}) } }));
      } else if (m.op === 2) { clearTimeout(timer); resolve(); }
      else if (m.op === 5) opts.onEvent?.(m.d.eventType, m.d.eventData);
      else if (m.op === 7) { const p = pending.get(m.d.requestId); pending.delete(m.d.requestId); p?.resolve(m.d); }
    });
    ws.on("close", (code) => reject(new Error(`conexão fechada (${code})`)));
  });
  ws.on("close", () => { for (const p of pending.values()) p.reject(new Error("Conexão com o 3Mix encerrada")); pending.clear(); opts.onClose?.(); });
  const raw = (requestType, requestData) => new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) return reject(new Error("Sem conexão com o 3Mix"));
    const requestId = String(++seq);
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${requestType}: tempo esgotado`)); }, 10000);
    pending.set(requestId, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  });
  const req = async (requestType, requestData) => {
    const r = await raw(requestType, requestData);
    if (!r.requestStatus.result) throw new Error(`${requestType}: ${r.requestStatus.code} ${r.requestStatus.comment ?? ""}`);
    return r.responseData ?? {};
  };
  const tryReq = async (requestType, requestData) => { const r = await raw(requestType, requestData); return r.requestStatus.result ? (r.responseData ?? {}) : null; };
  return { req, tryReq, close: () => ws.close() };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
