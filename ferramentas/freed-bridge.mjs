// 3Mix FreeD Bridge — Transmissor UDP Broadcast do Protocolo FreeD D1 (29 bytes).
// Integra as coordenadas da Câmera Virtual do 3Mix diretamente com a Unreal Engine (LiveLink) ou Aximmetry.
import dgram from 'node:dgram';

export const FREED_D1_MAGIC = 0xD1;
export const FREED_PACKET_SIZE = 29;
export const FREED_DEFAULT_PORT = 40000;

export function freedCalculateChecksum(buffer) {
  let sum = 0;
  for (let i = 0; i < 28; i++) {
    sum += buffer[i];
  }
  return (0x40 - (sum & 0xff)) & 0xff;
}

export function freedValidateChecksum(buffer) {
  if (!buffer || buffer.length !== FREED_PACKET_SIZE) return false;
  if (buffer[0] !== FREED_D1_MAGIC) return false;
  let total = 0;
  for (let i = 0; i < 29; i++) {
    total += buffer[i];
  }
  return (total & 0xff) === 0x40;
}

// Converte graus (-180 a +180) para 24-bit signed int (big endian)
export function encodeAngle(degrees) {
  const scaled = Math.round((degrees / 360.0) * 16777216.0); // 2^24
  let val = scaled & 0xffffff;
  return [
    (val >> 16) & 0xff,
    (val >> 8) & 0xff,
    val & 0xff
  ];
}

export function decodeAngle(b0, b1, b2) {
  let val = (b0 << 16) | (b1 << 8) | b2;
  if (val & 0x800000) val |= 0xff000000; // Sign extension
  return (val / 16777216.0) * 360.0;
}

// Converte milímetros para 24-bit (1/64 mm)
export function encodePosition(mm) {
  const scaled = Math.round(mm * 64.0);
  let val = scaled & 0xffffff;
  return [
    (val >> 16) & 0xff,
    (val >> 8) & 0xff,
    val & 0xff
  ];
}

export function decodePosition(b0, b1, b2) {
  let val = (b0 << 16) | (b1 << 8) | b2;
  if (val & 0x800000) val |= 0xff000000;
  return val / 64.0;
}

export function buildFreeDPacket({
  cameraId = 1,
  pan = 0.0,
  tilt = 0.0,
  roll = 0.0,
  x = 0.0,
  y = 0.0,
  z = 0.0,
  zoom = 1.0,
  focus = 1000
} = {}) {
  const buf = Buffer.alloc(FREED_PACKET_SIZE);
  buf[0] = FREED_D1_MAGIC;
  buf[1] = cameraId & 0xff;

  const [p0, p1, p2] = encodeAngle(pan);
  buf[2] = p0; buf[3] = p1; buf[4] = p2;

  const [t0, t1, t2] = encodeAngle(tilt);
  buf[5] = t0; buf[6] = t1; buf[7] = t2;

  const [r0, r1, r2] = encodeAngle(roll);
  buf[8] = r0; buf[9] = r1; buf[10] = r2;

  const [x0, x1, x2] = encodePosition(x);
  buf[11] = x0; buf[12] = x1; buf[13] = x2;

  const [y0, y1, y2] = encodePosition(y);
  buf[14] = y0; buf[15] = y1; buf[16] = y2;

  const [z0, z1, z2] = encodePosition(z);
  buf[17] = z0; buf[18] = z1; buf[19] = z2;

  // Zoom: mapeia 1.0x..3.5x para valor 24-bit
  const rawZoom = Math.round(zoom * 10000) & 0xffffff;
  buf[20] = (rawZoom >> 16) & 0xff;
  buf[21] = (rawZoom >> 8) & 0xff;
  buf[22] = rawZoom & 0xff;

  // Focus
  const rawFocus = Math.round(focus) & 0xffffff;
  buf[23] = (rawFocus >> 16) & 0xff;
  buf[24] = (rawFocus >> 8) & 0xff;
  buf[25] = rawFocus & 0xff;

  buf[26] = 0x00;
  buf[27] = 0x00;

  buf[28] = freedCalculateChecksum(buf);
  return buf;
}

export class FreeDSender {
  constructor({ host = '127.0.0.1', port = FREED_DEFAULT_PORT, cameraId = 1 } = {}) {
    this.host = host;
    this.port = port;
    this.cameraId = cameraId;
    this.socket = dgram.createSocket('udp4');
    this.active = true;
  }

  send(cameraData = {}) {
    if (!this.active) return Promise.resolve(false);
    const packet = buildFreeDPacket({ cameraId: this.cameraId, ...cameraData });
    return new Promise((resolve, reject) => {
      this.socket.send(packet, 0, packet.length, this.port, this.host, err => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  }

  close() {
    this.active = false;
    try {
      this.socket.close();
    } catch {}
  }
}

