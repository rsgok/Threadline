// Runs outside the feature package: an update cannot replace its own installer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const MAX_DOWNLOAD = 200 * 1024 * 1024;
export function compareVersions(a, b) {
  const parse = value => {
    if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw Error('Invalid release version');
    const parts = value.split('.').map(Number);
    if (!parts.every(Number.isSafeInteger)) throw Error('Invalid release version');
    return parts;
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
export async function download(url, limit = MAX_DOWNLOAD, fetchURL = fetch) {
  const signal = AbortSignal.timeout(120000);
  let target = new URL(url), response;
  // GitHub Releases redirects to a CDN. Every hop must preserve HTTPS.
  for (let hop = 0; hop <= 5; hop++) {
    if (target.protocol !== 'https:') throw Error('Updates require HTTPS');
    response = await fetchURL(target.href, { signal, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location || hop === 5) throw Error('Invalid update redirect');
    target = new URL(location, target);
  }
  if (!response.ok) throw Error(`Update download failed (${response.status})`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw Error('Update exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function verifyManifest(bytes, publicKey) {
  const envelope = JSON.parse(bytes);
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw Error('Invalid update manifest');
  const payload = Buffer.from(envelope.payload, 'base64');
  const key = crypto.createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519' || !crypto.verify(null, payload, key, Buffer.from(envelope.signature, 'base64'))) throw Error('Update signature is invalid');
  const m = JSON.parse(payload);
  compareVersions(m.version, m.version); compareVersions(m.minNode, m.minNode);
  if (m.format !== 1 || m.dataSchema !== 1 || !Number.isSafeInteger(m.minShellBuild) || m.minShellBuild < 1 ||
      !Number.isSafeInteger(m.size) || m.size < 1 || m.size > MAX_DOWNLOAD ||
      !/^[a-f0-9]{64}$/.test(m.sha256) || new URL(m.url).protocol !== 'https:' ||
      typeof m.notes !== 'string' || m.notes.length > 20000) throw Error('Invalid update metadata');
  return m;
}
export function unpack(bytes, destination) {
  const archive = JSON.parse(gunzipSync(bytes, { maxOutputLength: 600 * 1024 * 1024 }));
  if (archive.format !== 1 || !Array.isArray(archive.files) || archive.files.length > 100000) throw Error('Invalid feature package');
  const seen = new Set();
  for (const entry of archive.files) {
    const name = entry.path;
    if (typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0') ||
        name.split('/').some(part => !part || part === '.' || part === '..') ||
        !['web', 'build', 'plugins', 'node_modules', 'package.json'].includes(name.split('/')[0]) ||
        seen.has(name) || typeof entry.data !== 'string') throw Error('Unsafe feature package path');
    seen.add(name);
    const file = path.join(destination, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(entry.data, 'base64'), { flag: 'wx', mode: entry.executable ? 0o755 : 0o644 });
  }
  for (const name of ['web/server.mjs', 'build/client/index.html', 'package.json']) {
    if (!seen.has(name)) throw Error(`Missing feature file: ${name}`);
  }
}
function writeJSON(file, value) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
export class RuntimeUpdater {
  constructor({ root, config, shellBuild, restart, healthy, fetchBytes = download }) {
    Object.assign(this, { root, config, shellBuild, restart, healthy, fetchBytes });
    this.app = path.join(root, 'app');
    this.journal = path.join(root, 'update-pending.json');
  }
  currentVersion() { return JSON.parse(fs.readFileSync(path.join(this.app, 'package.json'))).version; }
  async check() {
    const version = this.currentVersion();
    if (!this.config.feedURL || !this.config.publicKey) return { state: 'unconfigured', version };
    const m = verifyManifest(await this.fetchBytes(this.config.feedURL, 128 * 1024), this.config.publicKey);
    if (compareVersions(m.version, version) <= 0) return { state: 'current', version };
    const blocked = compareVersions(process.versions.node, m.minNode) < 0 ? 'node' : this.shellBuild < m.minShellBuild ? 'shell' : undefined;
    return { state: blocked ? 'incompatible' : 'available', version, release: m, blocked };
  }
  switchTo(target) {
    const temporary = this.app + '.next';
    fs.rmSync(temporary, { force: true });
    fs.symlinkSync(target, temporary, 'dir');
    fs.renameSync(temporary, this.app);
  }
  async recover() {
    if (!fs.existsSync(this.journal)) return;
    const { previous } = JSON.parse(fs.readFileSync(this.journal));
    if (typeof previous !== 'string' || path.dirname(previous) !== path.join(this.root, 'releases')) throw Error('Invalid recovery journal');
    // The journal is written before either rename, so power loss is recoverable too.
    if (fs.existsSync(previous)) this.switchTo(previous);
    await this.restart();
    if (!await this.healthy(this.currentVersion())) throw Error('Previous version restored but the service could not restart');
    fs.rmSync(this.journal);
  }
  async install(expectedVersion) {
    const lock = path.join(this.root, 'update.lock');
    try { fs.mkdirSync(lock); } catch { throw Error('Another update is in progress; restart Threadline if a previous update was interrupted'); }
    fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
    let staging;
    try {
      await this.recover();
      const result = await this.check(); // Reverify signed metadata at installation time.
      if (result.state !== 'available' || result.release.version !== expectedVersion) throw Error('Update changed or is incompatible; check again');
      const m = result.release;
      const bytes = await this.fetchBytes(m.url, m.size);
      if (bytes.length !== m.size || crypto.createHash('sha256').update(bytes).digest('hex') !== m.sha256) throw Error('Feature package checksum is invalid');
      const releases = path.join(this.root, 'releases');
      fs.mkdirSync(releases, { recursive: true });
      staging = fs.mkdtempSync(path.join(releases, 'release-'));
      unpack(bytes, staging);
      if (JSON.parse(fs.readFileSync(path.join(staging, 'package.json'))).version !== m.version) throw Error('Feature version does not match manifest');
      const legacy = !fs.lstatSync(this.app).isSymbolicLink();
      const previous = legacy ? path.join(releases, 'legacy-' + crypto.randomUUID()) : fs.realpathSync(this.app);
      writeJSON(this.journal, { previous, target: staging });
      if (legacy) fs.renameSync(this.app, previous);
      this.switchTo(staging);
      try {
        await this.restart();
        if (!await this.healthy(m.version)) throw Error('Updated service failed its health check');
      } catch (error) {
        this.switchTo(previous);
        await this.restart();
        if (!await this.healthy(result.version)) throw Error('Update failed; previous files restored but the service could not restart');
        fs.rmSync(this.journal, { force: true });
        throw Error('Update failed; previous version restored', { cause: error });
      }
      fs.rmSync(this.journal, { force: true });
      const active = staging;
      staging = undefined;
      for (const entry of fs.readdirSync(releases, { withFileTypes: true })) {
        const file = path.join(releases, entry.name);
        if (entry.isDirectory() && /^(release-|legacy-)/.test(entry.name) && file !== active && file !== previous) {
          try { fs.rmSync(file, { recursive: true }); } catch { /* Cleanup must not undo a healthy update. */ }
        }
      }
      return { state: 'installed', version: m.version };
    } finally {
      // Keep files referenced by a pending recovery journal.
      if (staging && !fs.existsSync(this.journal)) fs.rmSync(staging, { recursive: true, force: true });
      fs.rmSync(lock, { recursive: true, force: true });
    }
  }
}
