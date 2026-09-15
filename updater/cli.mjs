import fs from 'node:fs';
import path from 'node:path';
import { RuntimeUpdater } from './runtime-update.mjs';
import { registerService, restartService, healthyService } from './service.mjs';
const [command, root, configPath, shellBuild, expectedVersion] = process.argv.slice(2);
try {
  if (!['status', 'check', 'install', 'prepare'].includes(command)) throw Error('Unknown update command');
  const config = JSON.parse(fs.readFileSync(configPath));
  const updater = new RuntimeUpdater({
    root, config, shellBuild: Number(shellBuild),
    restart: command === 'prepare' ? async () => { await registerService(root); await restartService(); } : restartService,
    healthy: version => healthyService(root, version),
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
  fs.mkdirSync(root, { recursive: true });
  await updater.recover();
  if (command === 'prepare') {
    console.log(JSON.stringify(await updater.prepare(config.minimumVersion)));
    process.exit(0);
  }
  const result = command === 'status' ? { state: 'idle', version: updater.currentVersion(), configured: !!(config.feedURL && config.publicKey) }
    : command === 'check' ? await updater.check() : await updater.install(expectedVersion);
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(JSON.stringify({ state: 'error', error: error.message }));
  process.exitCode = 1;
}
