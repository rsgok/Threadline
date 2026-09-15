// node scripts/release-runtime.mjs <output-directory> <https-base-url> <private-key.pem> [minimum-shell-build]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { packageRuntime } from './package-runtime.mjs';
import { verifyManifest } from '../updater/runtime-update.mjs';
const [output, baseURL, keyFile, minBuild = '12'] = process.argv.slice(2);
if (!output || !keyFile || new URL(baseURL).protocol !== 'https:') throw Error('Expected output directory, HTTPS base URL and Ed25519 private key path');
const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile));
if (privateKey.asymmetricKeyType !== 'ed25519') throw Error('An Ed25519 signing key is required');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-release-'));
try {
  packageRuntime(stage, { production: true });
  const files = [];
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === '.bin' || entry.name === '.package-lock.json') continue;
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Unexpected symlink in release: ${file}`);
      if (entry.isDirectory()) walk(file);
      else files.push({ path: path.relative(stage, file).split(path.sep).join('/'), data: fs.readFileSync(file).toString('base64'), executable: !!(fs.statSync(file).mode & 0o111) });
    }
  }
  walk(stage);
  const bytes = gzipSync(JSON.stringify({ format: 1, files }), { level: 9 });
  const { version } = JSON.parse(fs.readFileSync(path.join(stage, 'package.json')));
  const name = `threadline-features-${version}.json.gz`;
  const metadata = { format: 1, dataSchema: 1, version, minNode: '22.13.0', minShellBuild: Number(minBuild), url: new URL(name, baseURL.endsWith('/') ? baseURL : baseURL + '/').href, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), notes: process.env.THREADLINE_RELEASE_NOTES || '' };
  const payload = Buffer.from(JSON.stringify(metadata));
  const envelope = { payload: payload.toString('base64'), signature: crypto.sign(null, payload, privateKey).toString('base64') };
  verifyManifest(Buffer.from(JSON.stringify(envelope)), crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, name), bytes);
  fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify(envelope));
  console.log(`Feature package ${version}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB (Node and Mac shell excluded)`);
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
