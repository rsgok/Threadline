import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { packageRuntime } from './package-runtime.mjs';
if (!process.argv[2]) throw Error('Usage: node scripts/install-runtime.mjs <data-directory>');
const root = path.resolve(process.argv[2]);
const releases = path.join(root, 'releases');
fs.mkdirSync(releases, { recursive: true });
const lock = path.join(root, 'update.lock');
try { fs.mkdirSync(lock); } catch { throw Error('Another update is in progress'); }
fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
const target = fs.mkdtempSync(path.join(releases, 'release-'));
const app = path.join(root, 'app'), next = app + '.next';
let previous, switched = false;
try {
  packageRuntime(target, { production: true });
  fs.rmSync(next, { force: true });
  fs.symlinkSync(target, next, 'dir');
  if (fs.existsSync(app) && !fs.lstatSync(app).isSymbolicLink()) {
    previous = path.join(releases, 'legacy-' + crypto.randomUUID());
    fs.renameSync(app, previous);
  }
  fs.renameSync(next, app);
  switched = true;
  // A successful source reinstall supersedes any interrupted online update.
  fs.rmSync(path.join(root, 'update-pending.json'), { force: true });
} catch (error) {
  if (previous && !fs.existsSync(app)) fs.renameSync(previous, app);
  throw error;
} finally {
  if (!switched) fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(next, { force: true });
  fs.rmSync(lock, { recursive: true, force: true });
}
