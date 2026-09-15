import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const visible = rows => Object.values(rows).map(({ runtime, summary }) => ({ runtime, summary }));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);

// Only compact display data is persisted. Source files remain owned by each runtime.
export class SessionIndex {
  constructor(directory, providers, { interval = 5000 } = {}) {
    this.file = path.join(directory, 'session-index.json');
    this.providers = providers;
    this.sources = Object.fromEntries(Object.entries(providers).map(([name, provider]) => [name, provider.home]));
    this.interval = interval;
    this.rows = {};
    this.errors = [];
    this.initialized = false;
    this.closed = false;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved.schema === 1 && JSON.stringify(saved.sources) === JSON.stringify(this.sources)
          && saved.rows && typeof saved.rows === 'object' && !Array.isArray(saved.rows)) {
        this.rows = saved.rows;
        this.errors = saved.errors || [];
        this.initialized = true;
      }
    } catch { /* Missing or damaged index is rebuilt without touching source records. */ }
    this.revision = digest([visible(this.rows), this.errors]);
  }
  snapshot() {
    if (this.cachedRevision === this.revision && this.cachedSnapshot) return { ...this.cachedSnapshot, ...this.status() };
    const sessions = [], details = {};
    const seen = new Set();
    for (const row of Object.values(this.rows).sort((a, b) => (b.summary?.updatedAt || "").localeCompare(a.summary?.updatedAt || ""))) {
      if (!row.summary || seen.has(row.runtime + ':' + row.summary.id)) continue;
      const { summary, runtime } = row;
      seen.add(runtime + ':' + summary.id);
      sessions.push({ id: summary.id, title: summary.title, updatedAt: summary.updatedAt, runtime });
      details[runtime + ':' + summary.id] = summary;
    }
    this.cachedRevision = this.revision;
    this.cachedSnapshot = { sessions, details, errors: this.errors };
    return { ...this.cachedSnapshot, ...this.status() };
  }
  status() {
    return { revision: this.revision, initialized: this.initialized, syncing: !!this.pending };
  }
  start() {
    void this.sync();
    this.timer = setInterval(() => void this.sync(), this.interval);
    this.timer.unref?.();
  }
  sync() {
    if (this.closed) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.refresh().catch(error => {
      this.errors = [{ runtime: 'index', message: error.message }];
      this.revision = digest([visible(this.rows), this.errors]);
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async refresh() {
    const next = { ...this.rows }, errors = [];
    // A failed runtime scan must not erase its last known conversations.
    for (const [runtime, provider] of Object.entries(this.providers)) {
      let entries;
      try { entries = await provider.indexEntries(); }
      catch (error) { errors.push({ runtime, message: error.message }); continue; }
      if (this.closed) return;
      const keys = new Set(entries.map(entry => runtime + ':' + entry.file));
      for (const [key, row] of Object.entries(next)) {
        if (row.runtime === runtime && !keys.has(key)) delete next[key];
      }
      let cursor = 0;
      await Promise.all(Array.from({ length: 2 }, async () => {
        while (cursor < entries.length && !this.closed) {
          const entry = entries[cursor++], key = runtime + ':' + entry.file;
          const old = this.rows[key];
          if (old?.stamp === entry.stamp) {
            if (old.error) errors.push({ runtime, message: old.error });
            continue;
          }
          try {
            const session = await provider.indexSummary(entry);
            const summary = session?.messages.length ? {
              id: session.id, title: session.title, updatedAt: entry.updatedAt || session.updatedAt,
              cwd: session.cwd, project: session.project, status: session.status,
              messages: session.messages.slice(-1).map(message => ({ text: message.text.slice(0, 500) })),
            } : null;
            next[key] = { runtime, stamp: entry.stamp, summary };
          } catch (error) {
            errors.push({ runtime, message: error.message });
            next[key] = { runtime, stamp: entry.stamp, summary: old?.summary || null, error: error.message };
          }
        }
      }));
    }
    if (this.closed) return;
    const revision = digest([visible(next), errors]);
    if (!this.initialized || digest(next) !== digest(this.rows) || revision !== this.revision) {
      const temporary = this.file + '.next';
      await fs.promises.writeFile(temporary, JSON.stringify({ schema: 1, sources: this.sources, rows: next, errors }), { mode: 0o600 });
      if (this.closed) { await fs.promises.rm(temporary, { force: true }); return; }
      await fs.promises.rename(temporary, this.file);
      this.rows = next;
      this.errors = errors;
      this.revision = revision;
      this.initialized = true;
    }
  }
  close() { this.closed = true; clearInterval(this.timer); }
}
