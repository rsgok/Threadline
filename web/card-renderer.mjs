import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const packageFile = require.resolve('playwright-core/package.json');
export const browserVersion = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
const cli = path.join(path.dirname(packageFile), 'cli.js');
const fail = (status, message) => Object.assign(new Error(message), { status });
function findBinary(directory, depth = 0) {
  if (!fs.existsSync(directory) || depth > 5) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isFile() && ['chrome-headless-shell', 'chrome-headless-shell.exe'].includes(entry.name)) return file;
    if (entry.isDirectory()) { const found = findBinary(file, depth + 1); if (found) return found; }
  }
  return null;
}
export class CardRenderer {
  constructor({ dataDir, sharing, installTimeout = 10 * 60_000, renderTimeout = 5 * 60_000 }) {
    this.sharing = sharing;
    this.runtimeRoot = path.join(dataDir, 'runtimes', 'cards', `playwright-${browserVersion}`);
    this.installTimeout = installTimeout; this.renderTimeout = renderTimeout;
    this.tasks = new Map(); this.active = null;
  }
  runtime() {
    const marker = path.join(this.runtimeRoot, 'ready.json');
    const executablePath = fs.existsSync(marker) ? findBinary(this.runtimeRoot) : null;
    return { ready: !!executablePath, executablePath, version: browserVersion };
  }
  status(id) {
    const job = this.sharing.load(id);
    const task = this.tasks.get(id);
    if (task) return { ...task.status };
    if (job.cardEngine === 'chromium-v1' && job.cardCount && Array.from({ length: job.cardCount }, (_, i) => fs.existsSync(this.pageFile(id, i))).every(Boolean)) {
      return { phase: 'done', total: job.cardCount, completed: job.cardCount, message: `已生成 ${job.cardCount} 张图卡` };
    }
    return { phase: 'idle', message: this.runtime().ready ? '图卡引擎已就绪' : '首次生成会下载图卡引擎，之后可离线使用', runtimeReady: this.runtime().ready };
  }
  pageFile(id, index) { return path.join(path.dirname(this.sharing.file(id)), 'cards-browser', `card-${index}.png`); }
  start(id) {
    const job = this.sharing.load(id);
    if (Date.now() > job.expires) throw fail(410, '预览已过期，请重新选择内容');
    const previous = this.status(id);
    if (previous.phase === 'done' || (this.active?.id === id)) return previous;
    if (this.active) throw fail(409, '另一份图卡正在生成，请完成后重试');
    // Verify every selected snapshot before downloading or launching anything.
    for (const asset of job.attachments.filter(a => a.selected && a.kind === 'image')) this.sharing.asset(id, asset.id);
    const task = { id, status: { phase: 'starting', message: '正在准备图卡' }, controller: new AbortController(), child: null };
    this.tasks.set(id, task); this.active = task;
    // Bound in-memory history; successful outputs remain on disk.
    if (this.tasks.size > 30) this.tasks.delete(this.tasks.keys().next().value);
    this.run(task, job).catch(error => {
      task.status = { phase: task.controller.signal.aborted ? 'cancelled' : 'failed', message: task.controller.signal.aborted ? '已取消生成，可以重试' : error.message };
    }).finally(() => { if (this.active === task) this.active = null; });
    return { ...task.status };
  }
  cancel(id) {
    this.sharing.load(id);
    const task = this.tasks.get(id);
    if (task && this.active === task) { task.controller.abort(); this.stop(task.child); }
    return { cancelled: true };
  }
  stop(child) {
    if (!child || child.exitCode !== null) return;
    try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill(); } catch {}
    const timer = setTimeout(() => { try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} }, 3000); timer.unref();
  }
  process(task, child, timeout, onMessage) {
    task.child = child;
    return new Promise((resolve, reject) => {
      let reportedFailure = '';
      const timer = setTimeout(() => { reportedFailure = '图卡准备超时，请检查网络后重试'; this.stop(child); }, timeout);
      child.on('message', data => { if (data.phase === 'failed') reportedFailure = data.message; else onMessage?.(data); });
      child.stderr?.resume();
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => {
        clearTimeout(timer); task.child = null;
        if (code === 0 && !reportedFailure && !task.controller.signal.aborted) resolve();
        else reject(Error(reportedFailure || (task.controller.signal.aborted ? '已取消' : '图卡引擎启动或下载失败，请检查网络后重试')));
      });
    });
  }
  async ensureRuntime(task) {
    const installed = this.runtime();
    if (installed.ready) return installed.executablePath;
    fs.mkdirSync(this.runtimeRoot, { recursive: true, mode: 0o700 });
    task.status = { phase: 'downloading', message: '首次使用：正在下载图卡引擎，完成后可离线生成' };
    const child = spawn(process.execPath, [cli, 'install', 'chromium-headless-shell'], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: this.runtimeRoot }, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    let tail = '';
    child.stdout.on('data', chunk => {
      tail = (tail + chunk.toString()).slice(-4000);
      const match = [...tail.matchAll(/(\d{1,3})%/g)].at(-1);
      const percent = match ? Math.min(100, Number(match[1])) : undefined;
      task.status = { phase: 'downloading', ...(percent !== undefined ? { percent } : {}), message: percent !== undefined ? `正在下载图卡引擎组件 · ${percent}%` : '正在下载并安装图卡引擎' };
    });
    await this.process(task, child, this.installTimeout);
    const executable = findBinary(this.runtimeRoot);
    if (!executable) throw Error('图卡引擎安装未完成，请重试');
    fs.writeFileSync(path.join(this.runtimeRoot, 'ready.json'), JSON.stringify({ version: browserVersion }), { mode: 0o600 });
    return executable;
  }
  async run(task, job) {
    const executablePath = await this.ensureRuntime(task);
    if (task.controller.signal.aborted) throw Error('已取消');
    const parent = path.dirname(this.sharing.file(job.id));
    const stage = path.join(parent, '.cards-' + crypto.randomUUID());
    fs.mkdirSync(stage, { mode: 0o700 });
    try {
      task.status = { phase: 'layout', message: '正在准备字体与排版' };
      const assets = job.attachments.filter(a => a.selected && a.kind === 'image').map(a => ({ id: a.id, file: path.join(parent, a.id), mime: this.sharing.asset(job.id, a.id).mime, digest: a.digest }));
      const worker = fork(fileURLToPath(new URL('./card-worker.mjs', import.meta.url)), [], {
        execArgv: [], detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      const finished = this.process(task, worker, this.renderTimeout, progress => { if (progress.phase !== 'done') task.status = progress; });
      worker.send({ job, outputDir: stage, assets, executablePath });
      await finished;
      const layout = JSON.parse(fs.readFileSync(path.join(stage, 'layout.json'), 'utf8'));
      if (!layout.pageCount || layout.pageCount > 200) throw Error('生成的图卡页数无效');
      const destination = path.join(parent, 'cards-browser');
      // The job is immutable; failed retries never publish partial output.
      if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
      fs.renameSync(stage, destination);
      const latest = this.sharing.load(job.id);
      latest.cardEngine = 'chromium-v1'; latest.cardCount = layout.pageCount; latest.cardPages = layout.pages.map((_, i) => i);
      this.sharing.save(latest);
      task.status = { phase: 'done', completed: layout.pageCount, total: layout.pageCount, message: `已生成 ${layout.pageCount} 张图卡` };
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  }
  close() { if (this.active) { this.active.controller.abort(); this.stop(this.active.child); } }
}
