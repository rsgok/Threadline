import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RuntimeUpdater } from './runtime-update.mjs';
const exec = promisify(execFile);
const [command, root, configPath, shellBuild, expectedVersion] = process.argv.slice(2);
try {
  if (!['status', 'check', 'install'].includes(command)) throw Error('Unknown update command');
  const config = JSON.parse(fs.readFileSync(configPath));
  const updater = new RuntimeUpdater({
    root, config, shellBuild: Number(shellBuild),
    restart: () => exec('/bin/launchctl', ['kickstart', '-k', `gui/${process.getuid()}/local.rewind.web`], { timeout: 15000 }),
    healthy: async version => {
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const response = await fetch('http://127.0.0.1:43127/health', { signal: AbortSignal.timeout(1000) });
          const value = await response.json();
          if (value.app === 'rewind-web' && value.version === version) return true;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return false;
    },
  });
  // A stale lock is only removed when the owning installer process is gone.
  const lock = path.join(root, 'update.lock');
  if (fs.existsSync(lock)) {
    let pid;
    try { pid = Number(fs.readFileSync(path.join(lock, 'pid'), 'utf8')); } catch {}
    if (!Number.isSafeInteger(pid) || pid < 1) throw Error('Update lock is incomplete; try again');
    try { process.kill(pid, 0); throw Error('Another update is running'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    fs.rmSync(lock, { recursive: true });
  }
  await updater.recover();
  const result = command === 'status' ? { state: 'idle', version: updater.currentVersion(), configured: !!(config.feedURL && config.publicKey) }
    : command === 'check' ? await updater.check() : await updater.install(expectedVersion);
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(JSON.stringify({ state: 'error', error: error.message }));
  process.exitCode = 1;
}
