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
// Partial downloads are keyed by the signed digest, so retries cannot mix releases.
export async function downloadPackage(m, root, fetchURL = fetch) {
  const directory = path.join(root, 'downloads');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, m.sha256 + '.partial');
  let offset = fs.existsSync(file) ? fs.statSync(file).size : 0;
  if (offset > m.size) { fs.rmSync(file); offset = 0; }
  if (offset < m.size) {
    let target = new URL(m.url), response;
    const signal = AbortSignal.timeout(600000);
    for (let hop = 0; hop <= 5; hop++) {
      if (target.protocol !== 'https:') throw Error('Updates require HTTPS');
      response = await fetchURL(target.href, { signal, redirect: 'manual', headers: offset ? { Range: `bytes=${offset}-` } : {} });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || hop === 5) throw Error('Invalid update redirect');
      target = new URL(location, target);
    }
    if (!response.ok) throw Error(`Feature download failed (${response.status})`);
    if (response.status === 206) {
      if (response.headers.get('content-range') !== `bytes ${offset}-${m.size - 1}/${m.size}`) throw Error('Invalid resumed download range');
    } else if (response.status === 200) { offset = 0; }
    else throw Error('Unexpected download response');
    const fd = fs.openSync(file, offset ? 'a' : 'w', 0o600);
    try {
      for await (const chunk of response.body) {
        offset += chunk.length;
        if (offset > m.size) { fs.rmSync(file, { force: true }); throw Error('Feature download exceeds signed size'); }
        fs.writeSync(fd, chunk);
      }
    } finally { fs.closeSync(fd); }
  }
  const bytes = fs.readFileSync(file);
  if (bytes.length !== m.size) throw Error('Feature download interrupted; retry to resume');
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== m.sha256) {
    fs.rmSync(file); throw Error('Feature package checksum is invalid');
  }
  return bytes;
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
  currentVersion() {
    try { return JSON.parse(fs.readFileSync(path.join(this.app, 'package.json'))).version; }
    catch (error) { if (error.code === 'ENOENT' && !fs.existsSync(this.app)) return '0.0.0'; throw error; }
  }
  async check() {
    const version = this.currentVersion();
    if (!this.config.feedURL || !this.config.publicKey) return { state: 'unconfigured', version };
    const m = verifyManifest(await this.fetchBytes(this.config.feedURL, 128 * 1024), this.config.publicKey);
    if (compareVersions(m.version, version) <= 0) return { state: 'current', version };
    const blocked = compareVersions(process.versions.node, m.minNode) < 0 ? 'node' : this.shellBuild < m.minShellBuild ? 'shell' : undefined;
    return { state: blocked ? 'incompatible' : 'available', version, release: m, blocked };
  }
  async prepare(minimum) {
    if (!minimum) throw Error('Missing bundled minimum feature version');
    await this.recover();
    if (compareVersions(this.currentVersion(), minimum) < 0) {
      const candidate = await this.check();
      if (candidate.state !== 'available' || compareVersions(candidate.release.version, minimum) < 0) throw Error('No compatible feature package is published for this app yet');
      await this.install(candidate.release.version);
    } else {
      const metadataFile = path.join(this.app, '.threadline-release.json');
      if (fs.existsSync(metadataFile)) {
        const metadata = JSON.parse(fs.readFileSync(metadataFile));
        if (metadata.minShellBuild > this.shellBuild || compareVersions(process.versions.node, metadata.minNode) < 0) throw Error('Installed features require a newer app; update the Mac application');
      }
      await this.restart();
      if (!await this.healthy(this.currentVersion())) throw Error('The matching local service could not start; another service may be using its port');
    }
    return { state: 'ready', version: this.currentVersion(), runtimeRoot: fs.realpathSync(this.app) };
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
    if (previous === null) {
      fs.rmSync(this.app, { force: true });
      fs.rmSync(this.journal);
      return;
    }
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
      const bytes = this.fetchBytes === download ? await downloadPackage(m, this.root) : await this.fetchBytes(m.url, m.size);
      if (bytes.length !== m.size || crypto.createHash('sha256').update(bytes).digest('hex') !== m.sha256) throw Error('Feature package checksum is invalid');
      const releases = path.join(this.root, 'releases');
      fs.mkdirSync(releases, { recursive: true });
      staging = fs.mkdtempSync(path.join(releases, 'release-'));
      unpack(bytes, staging);
      if (JSON.parse(fs.readFileSync(path.join(staging, 'package.json'))).version !== m.version) throw Error('Feature version does not match manifest');
      writeJSON(path.join(staging, '.threadline-release.json'), m);
      const exists = fs.existsSync(this.app);
      const legacy = exists && !fs.lstatSync(this.app).isSymbolicLink();
      const previous = !exists ? null : legacy ? path.join(releases, 'legacy-' + crypto.randomUUID()) : fs.realpathSync(this.app);
      writeJSON(this.journal, { previous, target: staging });
      if (legacy) fs.renameSync(this.app, previous);
      this.switchTo(staging);
      try {
        await this.restart();
        if (!await this.healthy(m.version)) throw Error('Updated service failed its health check');
      } catch (error) {
        if (previous === null) {
          fs.rmSync(this.app, { force: true });
          fs.rmSync(this.journal, { force: true });
          throw Error('Initial installation failed its health check; retry', { cause: error });
        }
        this.switchTo(previous);
        await this.restart();
        if (!await this.healthy(result.version)) throw Error('Update failed; previous files restored but the service could not restart');
        fs.rmSync(this.journal, { force: true });
        throw Error('Update failed; previous version restored', { cause: error });
      }
      fs.rmSync(this.journal, { force: true });
      fs.rmSync(path.join(this.root, 'downloads', m.sha256 + '.partial'), { force: true });
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
