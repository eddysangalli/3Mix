import { createServer } from 'node:net';

/**
 * VmixTcpServer — Servidor TCP de Compatibilidade vMix API (Porta 8099)
 * 
 * Implementa o protocolo TCP padrão do vMix para controle externo:
 * - Bitfocus Companion (vMix module)
 * - Elgato Stream Deck (plugins vMix nativos)
 * - Controladoras Skaarhoj / X-Keys
 * - Sistemas de Tally Lights de estúdio
 * - Automações de broadcast
 * 
 * Protocolo suportado:
 * - Handshake de versão: VERSION OK 27.0.0.1
 * - XML: Retorna XML completo de estado
 * - TALLY: Retorna status de Tally de todos os canais (1=PGM, 2=PVW, 0=OFF)
 * - SUBSCRIBE TALLY: Push automático sempre que Program/Preview muda
 * - SUBSCRIBE ACTS: Push de eventos de operação
 * - FUNCTION <Name> [Params]: Execução direta mapeada no motor FreeMix
 * - QUIT: Encerramento de sessão
 */
export class VmixTcpServer {
  constructor({ production, vmixHandler, port = 8099, host = '0.0.0.0' }) {
    this.production = production;
    this.vmixHandler = vmixHandler;
    this.port = Number(port);
    this.host = host;
    this.server = null;
    this.clients = new Set();
    this.tallySubscribers = new Set();
    this.actsSubscribers = new Set();
    this.lastTallyString = '';
  }

  /**
   * Calcula a string de Tally oficial vMix (ex: 120000000)
   * 0 = Off, 1 = Program, 2 = Preview
   */
  getTallyString() {
    const s = this.production.state;
    if (!s || !s.inputs || !s.inputs.length) {
      return '0'.repeat(10);
    }

    const pgmName = s.program;
    const pvwName = s.preview;
    const maxNum = Math.max(10, ...s.inputs.map(i => i.number || 0));
    const chars = new Array(maxNum).fill('0');

    for (const inp of s.inputs) {
      const idx = (inp.number || 1) - 1;
      if (idx >= 0 && idx < chars.length) {
        if (inp.name === pgmName || inp.key === pgmName) {
          chars[idx] = '1';
        } else if (inp.name === pvwName || inp.key === pvwName) {
          chars[idx] = '2';
        }
      }
    }

    return chars.join('');
  }

  /**
   * Notifica assinantes quando houver alteração de Tally
   */
  notifyTallyChange() {
    const currentTally = this.getTallyString();
    if (currentTally === this.lastTallyString) return;
    this.lastTallyString = currentTally;

    const msg = `TALLY OK ${currentTally}\r\n`;
    for (const socket of this.tallySubscribers) {
      try {
        if (socket.writable) socket.write(msg);
      } catch {
        this.tallySubscribers.delete(socket);
      }
    }
  }

  /**
   * Notifica assinantes de atos
   */
  notifyAct(actName) {
    const msg = `ACT OK ${actName}\r\n`;
    for (const socket of this.actsSubscribers) {
      try {
        if (socket.writable) socket.write(msg);
      } catch {
        this.actsSubscribers.delete(socket);
      }
    }
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = createServer(socket => this._handleClient(socket));
      this.server.on('error', err => reject(err));
      this.server.listen(this.port, this.host, () => {
        resolve(this.server.address());
      });
    });
  }

  stop() {
    return new Promise(resolve => {
      for (const socket of this.clients) {
        try { socket.destroy(); } catch {}
      }
      this.clients.clear();
      this.tallySubscribers.clear();
      this.actsSubscribers.clear();

      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  _handleClient(socket) {
    this.clients.add(socket);
    let buffer = '';

    // Envia o banner de handshake inicial do vMix 27
    socket.write('VERSION OK 27.0.0.1\r\n');

    socket.on('data', async chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // Mantém o resto incompleto

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        await this._processCommand(socket, line);
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.tallySubscribers.delete(socket);
      this.actsSubscribers.delete(socket);
    });

    socket.on('error', () => {
      this.clients.delete(socket);
      this.tallySubscribers.delete(socket);
      this.actsSubscribers.delete(socket);
    });
  }

  async _processCommand(socket, line) {
    const parts = line.split(/\s+/);
    const cmd = parts[0].toUpperCase();

    // 1. Comando XML
    if (cmd === 'XML') {
      const xmlData = this.production.statusXml ? this.production.statusXml() : '<vmix/>';
      const len = Buffer.byteLength(xmlData, 'utf8');
      socket.write(`XML ${len}\r\n${xmlData}\r\n`);
      return;
    }

    // 2. Comando TALLY
    if (cmd === 'TALLY') {
      const tally = this.getTallyString();
      socket.write(`TALLY OK ${tally}\r\n`);
      return;
    }

    // 3. Comando SUBSCRIBE
    if (cmd === 'SUBSCRIBE') {
      const subType = (parts[1] || '').toUpperCase();
      if (subType === 'TALLY') {
        this.tallySubscribers.add(socket);
        socket.write('SUBSCRIBE OK TALLY\r\n');
        // Envia estado imediato logo após assinar
        socket.write(`TALLY OK ${this.getTallyString()}\r\n`);
        return;
      }
      if (subType === 'ACTS') {
        this.actsSubscribers.add(socket);
        socket.write('SUBSCRIBE OK ACTS\r\n');
        return;
      }
      socket.write(`SUBSCRIBE ER ${subType || 'UNKNOWN'}\r\n`);
      return;
    }

    // 4. Comando UNSUBSCRIBE
    if (cmd === 'UNSUBSCRIBE') {
      const subType = (parts[1] || '').toUpperCase();
      if (subType === 'TALLY') {
        this.tallySubscribers.delete(socket);
        socket.write('UNSUBSCRIBE OK TALLY\r\n');
        return;
      }
      if (subType === 'ACTS') {
        this.actsSubscribers.delete(socket);
        socket.write('UNSUBSCRIBE OK ACTS\r\n');
        return;
      }
      socket.write('UNSUBSCRIBE OK\r\n');
      return;
    }

    // 5. Comando FUNCTION
    if (cmd === 'FUNCTION') {
      const fnName = parts[1];
      if (!fnName) {
        socket.write('FUNCTION ER Missing function name\r\n');
        return;
      }

      // Parâmetros no formato Key=Value ou argumentos posicionais
      const paramArgs = parts.slice(2).join(' ');
      const searchParams = new URLSearchParams();
      searchParams.set('Function', fnName);

      const matches = paramArgs.matchAll(/([A-Za-z0-9_]+)=([^\s=]+)/g);
      for (const m of matches) {
        searchParams.set(m[1], m[2]);
      }

      // Se nenhum par Key=Value foi achado mas tem valor (ex: FUNCTION Cut 2)
      if (![...searchParams.keys()].some(k => k.toLowerCase() === 'input') && parts[2] && !parts[2].includes('=')) {
        searchParams.set('Input', parts[2]);
      }

      try {
        if (this.vmixHandler) {
          await this.vmixHandler(fnName, searchParams);
        }
        socket.write(`FUNCTION OK ${fnName}\r\n`);
        this.notifyTallyChange();
        this.notifyAct(fnName);
      } catch (err) {
        socket.write(`FUNCTION ER ${err.message || 'Execution failed'}\r\n`);
      }
      return;
    }

    // 6. Comando QUIT
    if (cmd === 'QUIT') {
      socket.end('BYE\r\n');
      return;
    }

    // Comando não reconhecido
    socket.write(`ER Unknown command: ${cmd}\r\n`);
  }
}

