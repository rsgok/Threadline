import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Bundled artwork is read-only and stable within a release. Keeping the bytes
// in memory avoids re-reading a 1.3 MB PNG for every icon request.
const assets = new Map();

export const assetPaths = {
  '/assets/threadline-icon.png': path.join(here, 'assets', 'threadline-icon.png'),
  '/assets/user-avatar.png': path.join(here, 'assets', 'user-avatar.png'),
  '/assets/codex-avatar.png': path.join(here, 'assets', 'codex-avatar.png'),
  '/assets/cursor-avatar.png': path.join(here, 'assets', 'cursor-avatar.png'),
  '/assets/landing-collect.png': path.join(here, 'assets', 'landing-collect.png'),
  '/assets/landing-library.png': path.join(here, 'assets', 'landing-library.png'),
  '/favicon.svg': path.join(here, 'assets', 'threadline-icon.png'),
};

export const isAsset = pathname => Object.hasOwn(assetPaths, pathname);

export function assetBody(file, stat) {
  const cached = assets.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.body;
  const body = fs.readFileSync(file);
  assets.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, body });
  return body;
}

// Assets are revalidated on every request so a feature update that replaces
// artwork never leaves a stale icon behind. The ETag keeps that cheap.
export function assetEtag(stat) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}
