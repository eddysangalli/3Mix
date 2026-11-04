// 3Mix Social — Central de Moderação e Ingestão de Redes Sociais.
//
// Arquitetura: Fila Segura de 4 Estágios com Garantia Técnica Zero-Leak.
// Nenhum comentário ou evento social entra no ar automaticamente: todo item recebido
// entra no buffer de pendentes e exige aprovação explícita de um operador antes de poder ir ao ar.
//
// Estágios:
//   1. Pendentes (Incoming Buffer)
//   2. Aprovados (Ready Queue)
//   3. No Ar (Active On-Air)
//   4. Histórico (Audit Log)
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {TwitchChat} from './social-twitch.mjs';

const PENDING_LIMIT = 300;
const APPROVED_LIMIT = 100;
const HISTORY_LIMIT = 200;

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, 500).trim();
}

export class SocialEngine {
  constructor(production) {
    this.p = production;
    this.scope = null;
    this.file = null;
    this.pending = [];
    this.approved = [];
    this.onAir = null;
    this.history = [];
    this.blockedUsers = new Set();
    this.twitch = null;
    this.autoCycleTimer = null;
    this.autoCycleInterval = 10; // segundos
    this.autoCycleEnabled = false;
    this.targetGcInput = null; // Input de GC que receberá o comentário no ar
  }

  async setScope(scope) {
    if (this.scope === scope) return;
    this.scope = scope;
    const dir = join(this.p.root, 'config/obs-studio/plugin_config/3mix-social');
    this.file = join(dir, createHash('sha256').update(scope || '').digest('hex').slice(0, 24) + '.json');
    let data = { format: 1, approved: [], history: [], blocked: [], targetGcInput: null };
    try {
      data = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (data.format === 1) {
      this.approved = Array.isArray(data.approved) ? data.approved.slice(0, APPROVED_LIMIT) : [];
      this.history = Array.isArray(data.history) ? data.history.slice(0, HISTORY_LIMIT) : [];
      this.blockedUsers = new Set(Array.isArray(data.blocked) ? data.blocked : []);
      this.targetGcInput = data.targetGcInput || null;
    }
  }

  async save() {
    if (!this.file) return;
    try {
      await mkdir(join(this.file, '..'), { recursive: true });
      const payload = {
        format: 1,
        approved: this.approved,
        history: this.history,
        blocked: Array.from(this.blockedUsers),
        targetGcInput: this.targetGcInput
      };
      await writeFile(this.file + '.tmp', JSON.stringify(payload, null, 2));
      await rename(this.file + '.tmp', this.file);
    } catch (e) {
      console.error('[3Mix Social] Erro ao salvar estado:', e.message);
    }
  }

  summary() {
    return {
      supported: true,
      pendingCount: this.pending.length,
      approvedCount: this.approved.length,
      historyCount: this.history.length,
      blockedCount: this.blockedUsers.size,
      onAir: this.onAir,
      autoCycle: {
        enabled: this.autoCycleEnabled,
        interval: this.autoCycleInterval
      },
      twitch: this.twitch ? this.twitch.summary() : { status: 'idle', anonymous: true },
      targetGcInput: this.targetGcInput
    };
  }

  list(section = 'all') {
    const res = {};
    if (section === 'all' || section === 'pending') res.pending = this.pending;
    if (section === 'all' || section === 'approved') res.approved = this.approved;
    if (section === 'all' || section === 'onAir') res.onAir = this.onAir;
    if (section === 'all' || section === 'history') res.history = this.history;
    if (section === 'all' || section === 'blocked') res.blocked = Array.from(this.blockedUsers);
    return res;
  }

  addIncoming(comment) {
    if (!comment || typeof comment !== 'object') throw Error('Comentário inválido');
    const author = sanitizeText(comment.author || comment.login || 'Anônimo');
    const authorHandle = sanitizeText(comment.authorHandle || comment.login || author);
    const text = sanitizeText(comment.text);
    if (!text) return null;

    if (this.blockedUsers.has(author.toLowerCase()) || this.blockedUsers.has(authorHandle.toLowerCase())) {
      return null;
    }

    const item = {
      id: comment.id || randomUUID(),
      network: comment.network || 'manual',
      author,
      authorHandle,
      authorId: comment.authorId || null,
      color: /^#[a-f\d]{6}$/i.test(comment.color || '') ? comment.color : '#00b4d8',
      text,
      donation: comment.donation || null,
      avatar: comment.avatar || null,
      favorite: !!comment.favorite,
      at: comment.at || Date.now(),
      status: 'pending'
    };

    this.pending.unshift(item);
    if (this.pending.length > PENDING_LIMIT) {
      this.pending.length = PENDING_LIMIT;
    }
    return item;
  }

  approve(id) {
    const idx = this.pending.findIndex(x => x.id === id);
    let item;
    if (idx >= 0) {
      item = this.pending.splice(idx, 1)[0];
    } else {
      item = this.approved.find(x => x.id === id);
      if (!item) throw Error('Comentário não encontrado para aprovação: ' + id);
      return item;
    }

    item.status = 'approved';
    item.approvedAt = Date.now();
    this.approved.unshift(item);
    if (this.approved.length > APPROVED_LIMIT) {
      this.approved.length = APPROVED_LIMIT;
    }
    this.save().catch(() => {});
    return item;
  }

  reject(id) {
    const pIdx = this.pending.findIndex(x => x.id === id);
    if (pIdx >= 0) {
      return this.pending.splice(pIdx, 1)[0];
    }
    const aIdx = this.approved.findIndex(x => x.id === id);
    if (aIdx >= 0) {
      const item = this.approved.splice(aIdx, 1)[0];
      this.save().catch(() => {});
      return item;
    }
    throw Error('Comentário não encontrado para descarte: ' + id);
  }

  blockUser(authorName) {
    const name = sanitizeText(authorName).toLowerCase();
    if (!name) throw Error('Nome de usuário inválido para bloqueio');
    this.blockedUsers.add(name);
    this.pending = this.pending.filter(x => x.author.toLowerCase() !== name && x.authorHandle.toLowerCase() !== name);
    this.save().catch(() => {});
    return { blocked: name };
  }

  favorite(id, isFav = true) {
    const item = this.pending.find(x => x.id === id) || this.approved.find(x => x.id === id);
    if (!item) throw Error('Comentário não encontrado para favoritar');
    item.favorite = Boolean(isFav);
    this.save().catch(() => {});
    return item;
  }

  async takeToAir(id) {
    const idx = this.approved.findIndex(x => x.id === id);
    let item;
    if (idx >= 0) {
      item = this.approved[idx];
    } else if (this.onAir && this.onAir.id === id) {
      item = this.onAir;
    } else {
      throw Error('Apenas comentários aprovados podem ir ao ar.');
    }

    if (this.onAir && this.onAir.id !== item.id) {
      this.archiveToHistory(this.onAir);
    }

    item.status = 'on_air';
    item.onAirAt = Date.now();
    this.onAir = item;

    await this.injectToGraphics(item);
    if (typeof this.p?.broadcast === 'function') {
      this.p.broadcast({
        type: 'SOCIAL_ACTIVATE',
        event: 'SOCIAL_ACTIVATE',
        action: 'social_take',
        item: {
          id: item.id,
          author: item.author,
          handle: item.authorHandle,
          network: item.network,
          text: item.text,
          color: item.color,
          avatar: item.avatar || '',
          donation: item.donation || null,
          at: item.at || Date.now()
        }
      });
    }
    this.save().catch(() => {});
    return item;
  }

  async clearAir() {
    if (!this.onAir) return { cleared: true, wasOnAir: false };
    const old = this.onAir;
    this.archiveToHistory(old);
    this.onAir = null;

    await this.clearGraphics();
    if (typeof this.p?.broadcast === 'function') {
      this.p.broadcast({
        type: 'SOCIAL_CLEAR',
        event: 'SOCIAL_CLEAR',
        action: 'social_clear'
      });
    }
    this.save().catch(() => {});
    return { cleared: true, wasOnAir: true, item: old };
  }

  async nextAir() {
    if (this.approved.length === 0) {
      return this.clearAir();
    }
    let nextIdx = 0;
    if (this.onAir) {
      const curIdx = this.approved.findIndex(x => x.id === this.onAir.id);
      if (curIdx >= 0) {
        nextIdx = (curIdx + 1) % this.approved.length;
      }
    }
    const item = this.approved[nextIdx];
    return this.takeToAir(item.id);
  }

  archiveToHistory(item) {
    if (!item) return;
    const clone = { ...item, status: 'shown', archivedAt: Date.now() };
    this.history.unshift(clone);
    if (this.history.length > HISTORY_LIMIT) {
      this.history.length = HISTORY_LIMIT;
    }
  }

  setAutoCycle(enabled, intervalSec = 10) {
    this.autoCycleEnabled = Boolean(enabled);
    this.autoCycleInterval = Math.max(4, Math.min(60, Number(intervalSec) || 10));

    if (this.autoCycleTimer) {
      clearInterval(this.autoCycleTimer);
      this.autoCycleTimer = null;
    }

    if (this.autoCycleEnabled) {
      this.autoCycleTimer = setInterval(() => {
        this.nextAir().catch(err => {
          console.error('[3Mix Social AutoCycle Error]', err.message);
        });
      }, this.autoCycleInterval * 1000);
      this.autoCycleTimer.unref?.();
    }

    return { autoCycle: this.autoCycleEnabled, interval: this.autoCycleInterval };
  }

  connectTwitch(channel) {
    if (this.twitch) {
      this.twitch.disconnect();
    }
    this.twitch = new TwitchChat(msg => {
      this.addIncoming({
        network: 'twitch',
        author: msg.author,
        authorHandle: msg.login,
        authorId: msg.authorId,
        color: msg.color,
        text: msg.text,
        at: msg.at
      });
    });
    return this.twitch.connect(channel);
  }

  disconnectTwitch() {
    if (!this.twitch) return { status: 'idle' };
    const res = this.twitch.disconnect();
    this.twitch = null;
    return res;
  }

  async injectToGraphics(item) {
    try {
      if (this.p && typeof this.p.vendor === 'function') {
        await this.p.vendor('freemix_gc', {
          action: 'social_update',
          item: {
            id: item.id,
            author: item.author,
            handle: item.authorHandle,
            network: item.network,
            text: item.text,
            color: item.color,
            avatar: item.avatar || '',
            donation: item.donation || null
          }
        }, 'freemix').catch(() => {});
      }
    } catch (e) {
      console.warn('[3Mix Social] Injeção de GC aviso:', e.message);
    }
  }

  async clearGraphics() {
    try {
      if (this.p && typeof this.p.vendor === 'function') {
        await this.p.vendor('freemix_gc', {
          action: 'social_clear'
        }, 'freemix').catch(() => {});
      }
    } catch {}
  }

  async execute(action, d = {}) {
    switch (action) {
      case 'social_add':
        return this.addIncoming(d.comment || d);
      case 'social_approve':
        return this.approve(d.id);
      case 'social_reject':
        return this.reject(d.id);
      case 'social_favorite':
        return this.favorite(d.id, d.favorite ?? true);
      case 'social_block':
        return this.blockUser(d.author);
      case 'social_take':
        return this.takeToAir(d.id);
      case 'social_clear':
        return this.clearAir();
      case 'social_next':
        return this.nextAir();
      case 'social_autocycle':
        return this.setAutoCycle(d.enabled, d.interval);
      case 'social_twitch_connect':
        return this.connectTwitch(d.channel);
      case 'social_twitch_disconnect':
        return this.disconnectTwitch();
      default:
        throw Error('Ação Social desconhecida: ' + action);
    }
  }
}

