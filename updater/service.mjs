import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const domain = `gui/${process.getuid()}`;
const label = 'local.rewind.web';
const escapeXML = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function servicePlist(root, node) {
  const string = value => `<string>${escapeXML(value)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>Label</key>${string(label)}<key>ProgramArguments</key><array>${string(node)}${string(path.join(root, 'app/web/server.mjs'))}</array>
<key>WorkingDirectory</key>${string(path.join(root, 'app'))}<key>RunAtLoad</key><false/><key>KeepAlive</key><false/>
<key>StandardOutPath</key>${string(path.join(root, 'service.log'))}<key>StandardErrorPath</key>${string(path.join(root, 'service.log'))}
</dict></plist>`;
}
export async function restartService() {
  await exec('/bin/launchctl', ['kickstart', '-k', `${domain}/${label}`], { timeout: 15000 });
}
export async function healthyService(root, version) {
  const expected = fs.realpathSync(path.join(root, 'app'));
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:43127/health', { signal: AbortSignal.timeout(1000) });
      const value = await response.json();
      if (value.app === 'rewind-web' && value.version === version && value.runtimeRoot === expected) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}
export async function registerService(root) {
  const folder = path.join(os.homedir(), 'Library/LaunchAgents');
  const file = path.join(folder, `${label}.plist`);
  fs.mkdirSync(folder, { recursive: true });
  const previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
  try {
    // Stop only Threadline's registered job, never an arbitrary process occupying the port.
    try { await exec('/bin/launchctl', ['bootout', `${domain}/${label}`], { timeout: 15000 }); } catch {}
    // bootout returns before a running job has fully left the domain.
    for (let attempt = 0; ; attempt++) {
      try { await exec('/bin/launchctl', ['print', `${domain}/${label}`], { timeout: 3000 }); }
      catch { break; }
      if (attempt >= 50) throw Error('The previous Threadline service is still stopping; retry');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    fs.writeFileSync(file + '.next', servicePlist(root, process.execPath), { mode: 0o600 });
    fs.renameSync(file + '.next', file);
    await exec('/bin/launchctl', ['bootstrap', domain, file], { timeout: 15000 });
  } catch (error) {
    if (previous) fs.writeFileSync(file, previous);
    else fs.rmSync(file, { force: true });
    if (previous) {
      try { await exec('/bin/launchctl', ['bootstrap', domain, file]); } catch {}
      try { await restartService(); } catch {}
    }
    throw error;
  }
}
