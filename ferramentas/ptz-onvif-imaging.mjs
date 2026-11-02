// ONVIF Imaging + DeviceInformation client. Separate from the PTZ client because the
// services live on different endpoints (/onvif/imaging_service, /onvif/media_service,
// /onvif/device_service). Credentials stay server-side; no secret is logged.
import { randomBytes, createHash } from 'node:crypto';
import { isIP } from 'node:net';

const NS = {
  imaging: 'http://www.onvif.org/ver20/imaging/wsdl',
  media: 'http://www.onvif.org/ver10/media/wsdl',
  device: 'http://www.onvif.org/ver10/device/wsdl',
  schema: 'http://www.onvif.org/ver10/schema'
};
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function localEndpoint(value) {
  const u = new URL(value);
  const a = u.hostname.split('.').map(Number);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || isIP(u.hostname) !== 4
    || !(a[0] === 10 || a[0] === 127 || (a[0] === 192 && a[1] === 168) || (a[0] === 172 && a[1] >= 16 && a[1] <= 31))) {
    throw Error('ONVIF requires a local IPv4 endpoint without URL credentials');
  }
  return u;
}

const tag = (text, name) => {
  const m = new RegExp('<(?:[\\w.-]+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?' + name + '>').exec(text);
  return m ? m[1].trim() : null;
};
const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function parseImaging(text) {
  const block = tag(text, 'ImagingSettings') || text;
  const exposure = tag(block, 'Exposure') || '';
  const wb = tag(block, 'WhiteBalance') || '';
  return {
    brightness: num(tag(block, 'Brightness')),
    contrast: num(tag(block, 'Contrast')),
    saturation: num(tag(block, 'ColorSaturation')),
    sharpness: num(tag(block, 'Sharpness')),
    gamma: num(tag(block, 'Gamma')),
    exposureMode: tag(exposure, 'Mode'),
    exposureTime: num(tag(exposure, 'ExposureTime')),
    gain: num(tag(exposure, 'Gain')),
    iris: num(tag(exposure, 'Iris')),
    wbMode: tag(wb, 'Mode'),
    crGain: num(tag(wb, 'CrGain')),
    cbGain: num(tag(wb, 'CbGain'))
  };
}

export class OnvifImaging {
  constructor({ url, username = '', password = '', timeoutMs = 3000 }) {
    const u = localEndpoint(url);
    this.origin = u.origin;
    this.username = username;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.mediaUrls = [`${this.origin}/onvif/media_service`, `${this.origin}/onvif/Media`, `${this.origin}/onvif/media`];
    this.imagingUrls = [`${this.origin}/onvif/imaging_service`, `${this.origin}/onvif/Imaging`, `${this.origin}/onvif/imaging`];
    this.deviceUrls = [`${this.origin}/onvif/device_service`, `${this.origin}/onvif/device`, `${this.origin}/onvif/Device`];
    this.mediaUrl = null;
    this.imagingUrl = null;
    this.deviceUrl = null;
  }

  security() {
    if (!this.username) return '';
    const nonce = randomBytes(16);
    const created = new Date().toISOString();
    const digest = createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(this.password)])).digest('base64');
    return `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><wsse:UsernameToken><wsse:Username>${escapeXml(this.username)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password><wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</wsse:Nonce><wsu:Created>${created}</wsu:Created></wsse:UsernameToken></wsse:Security>`;
  }

  async request(url, ns, action, body) {
    if (!/^[A-Za-z]+$/.test(action)) throw Error('Invalid SOAP action');
    const xml = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:t="${ns}" xmlns:tt="${NS.schema}"><s:Header>${this.security()}</s:Header><s:Body><t:${action}>${body}</t:${action}></s:Body></s:Envelope>`;
    const response = await fetch(url, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${ns}/${action}"` },
      body: xml, signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) throw Error('ONVIF HTTP request rejected: ' + response.status);
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262144) throw Error('ONVIF response exceeds limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (/<(?:[\w.-]+:)?Fault[\s>]/.test(text)) throw Error('ONVIF SOAP fault; command not confirmed');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('ONVIF XML declarations rejected');
    const expected = new RegExp('<(?:[A-Za-z0-9_.-]+:)?' + action + 'Response(?:[ />\\t\\r\\n])');
    if (!expected.test(text)) throw Error('ONVIF response missing expected confirmation');
    return text;
  }

  async tryUrls(urls, ns, action, body) {
    let last = null;
    for (const url of urls) {
      try {
        const text = await this.request(url, ns, action, body);
        return { url, text };
      } catch (error) { last = error; }
    }
    throw last || Error('ONVIF service unavailable');
  }

  async getVideoSources() {
    const urls = this.mediaUrl ? [this.mediaUrl, ...this.mediaUrls] : this.mediaUrls;
    const { url, text } = await this.tryUrls(urls, NS.media, 'GetVideoSources', '');
    this.mediaUrl = url;
    const tokens = [...text.matchAll(/<(?:[\w.-]+:)?VideoSourceToken(?:\s[^>]*)?>([^<]+)</g)].map((m) => m[1].trim());
    if (!tokens.length) throw Error('ONVIF video source token not found');
    return tokens[0];
  }

  async getImagingSettings(token) {
    const body = `<t:VideoSourceToken>${escapeXml(token)}</t:VideoSourceToken>`;
    const urls = this.imagingUrl ? [this.imagingUrl, ...this.imagingUrls] : this.imagingUrls;
    const { url, text } = await this.tryUrls(urls, NS.imaging, 'GetImagingSettings', body);
    this.imagingUrl = url;
    return parseImaging(text);
  }

  async setImagingSettings(token, patch) {
    const fields = [];
    if (patch.brightness !== undefined) fields.push(`<tt:Brightness>${Number(patch.brightness)}</tt:Brightness>`);
    if (patch.contrast !== undefined) fields.push(`<tt:Contrast>${Number(patch.contrast)}</tt:Contrast>`);
    if (patch.saturation !== undefined) fields.push(`<tt:ColorSaturation>${Number(patch.saturation)}</tt:ColorSaturation>`);
    if (patch.sharpness !== undefined) fields.push(`<tt:Sharpness>${Number(patch.sharpness)}</tt:Sharpness>`);
    if (patch.gamma !== undefined) fields.push(`<tt:Gamma>${Number(patch.gamma)}</tt:Gamma>`);
    if (patch.exposureMode !== undefined) fields.push(`<tt:Exposure><tt:Mode>${escapeXml(patch.exposureMode)}</tt:Mode></tt:Exposure>`);
    if (patch.wbMode !== undefined) fields.push(`<tt:WhiteBalance><tt:Mode>${escapeXml(patch.wbMode)}</tt:Mode></tt:WhiteBalance>`);
    if (!fields.length) throw Error('Nenhum ajuste de imagem informado');
    const body = `<t:VideoSourceToken>${escapeXml(token)}</t:VideoSourceToken><t:ImagingSettings>${fields.join('')}</t:ImagingSettings>`;
    const urls = this.imagingUrl ? [this.imagingUrl, ...this.imagingUrls] : this.imagingUrls;
    const { url } = await this.tryUrls(urls, NS.imaging, 'SetImagingSettings', body);
    this.imagingUrl = url;
    return { ok: true };
  }

  async getDeviceInformation() {
    const urls = this.deviceUrl ? [this.deviceUrl, ...this.deviceUrls] : this.deviceUrls;
    const { url, text } = await this.tryUrls(urls, NS.device, 'GetDeviceInformation', '');
    this.deviceUrl = url;
    return {
      manufacturer: tag(text, 'Manufacturer'),
      model: tag(text, 'Model'),
      firmware: tag(text, 'FirmwareVersion'),
      serial: tag(text, 'SerialNumber'),
      hardware: tag(text, 'HardwareId')
    };
  }
}
