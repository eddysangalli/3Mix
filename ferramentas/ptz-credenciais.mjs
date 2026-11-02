// Windows DPAPI-backed credential storage for PTZ devices. CurrentUser scope: readable
// only by the Windows account running 3Mix, matching the task requirement ("Utilizar
// armazenamento protegido adequado ao Windows"). Never logs or returns the plaintext
// secret to any caller outside decrypt(); callers that only need to know "is a password
// set" should use hasSecret(), not getCredential().
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

// -EncodedCommand avoids all shell/quote escaping of the secret; the script itself never
// receives the plaintext as a CLI argument (argv is visible to other processes/Task
// Manager), only via stdin.
//
// execFile() does NOT support an `input` option (that is execFileSync/spawnSync), so the
// previous version left PowerShell blocked on [Console]::In.ReadToEnd() until the timeout.
// spawn() with an explicit stdin pipe is the correct transport.
function dpapi(mode, input) {
  const script = mode === 'protect'
    ? "Add-Type -AssemblyName System.Security;$b=[Console]::In.ReadToEnd();$bytes=[Convert]::FromBase64String($b);$p=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))"
    : "Add-Type -AssemblyName System.Security;$b=[Console]::In.ReadToEnd();$bytes=[Convert]::FromBase64String($b);$p=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))";
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', settled = false, timer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };
    timer = setTimeout(() => {
      child.kill();
      finish(reject, Error('DPAPI timeout'));
    }, 30000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish(reject, e));
    child.on('close', (code) => {
      if (code !== 0) finish(reject, Error('DPAPI failed: ' + (err.trim() || 'exit ' + code)));
      else finish(resolve, out.trim());
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input, 'utf8');
  });
}

export async function protectSecret(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext || plaintext.length > 4096) throw Error('Invalid secret');
  return dpapi('protect', Buffer.from(plaintext, 'utf8').toString('base64'));
}
export async function unprotectSecret(blob) {
  if (typeof blob !== 'string' || !blob) throw Error('No protected secret stored');
  return Buffer.from(await dpapi('unprotect', blob), 'base64').toString('utf8');
}

export class PTZCredentialStore {
  constructor(root) { this.file = join(root, 'config/obs-studio/plugin_config/freemix-ptz', 'credentials.json'); this.entries = null; }
  async load() {
    if (this.entries) return;
    try { this.entries = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw Error('Could not read protected PTZ credentials; file left untouched'); this.entries = {}; }
  }
  async save() {
    await mkdir(join(this.file, '..'), { recursive: true });
    await writeFile(this.file + '.tmp', JSON.stringify(this.entries, null, 2));
    await rename(this.file + '.tmp', this.file);
  }
  async hasSecret(deviceId) { await this.load(); return typeof this.entries[deviceId] === 'string'; }
  async ids() { await this.load(); return Object.keys(this.entries); }
  async setCredential(deviceId, username, password) {
    await this.load();
    if (!username && !password) { delete this.entries[deviceId]; await this.save(); return; }
    if (typeof username !== 'string' || username.length > 128) throw Error('Invalid ONVIF username');
    // Username travels with the device record (not secret); only the password is DPAPI-protected.
    this.entries[deviceId] = await protectSecret(JSON.stringify({ username, password }));
    await this.save();
  }
  async getCredential(deviceId) {
    await this.load();
    const blob = this.entries[deviceId];
    if (!blob) return null;
    return JSON.parse(await unprotectSecret(blob));
  }
  async removeCredential(deviceId) { await this.load(); delete this.entries[deviceId]; await this.save(); }
}
