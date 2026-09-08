import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const fields = ['title', 'body', 'note', 'question', 'source', 'sourceURL', 'topicID'];
const normalize = text => text.normalize('NFKC').toLocaleLowerCase();
const decode = row => row ? JSON.parse(row.data) : undefined;

// One record per row preserves optional provenance fields without rewriting the library.
export class LibraryStore {
  constructor(dataDir, legacyDir = null) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const file = path.join(dataDir, 'library.sqlite');
    fs.closeSync(fs.openSync(file, 'a', 0o600));
    this.db = new DatabaseSync(file);
    try {
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      this.db.exec('BEGIN IMMEDIATE');
      const schema = this.db.prepare('PRAGMA user_version').get().user_version;
      if (schema > 1) throw Error('资料库来自更新版本，请升级应用。');
      if (!schema) {
        const read = (name, kind) => {
          const source = path.join(dataDir, name);
          const fallback = legacyDir && path.join(legacyDir, name);
          const selected = fs.existsSync(source) ? source : fallback && fs.existsSync(fallback) ? fallback : null;
          const records = selected ? JSON.parse(fs.readFileSync(selected, 'utf8')) : [];
          if (!Array.isArray(records) || records.some(x => !x || typeof x.id !== 'string' || typeof x.title !== 'string' || typeof x[kind] !== 'string')) throw Error('旧资料库格式错误，迁移已停止，原文件未修改。');
          return { records, selected };
        };
        const notes = read('library.json', 'body'), topics = read('threads.json', 'goal');
        this.db.exec(`CREATE TABLE notes (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL CHECK(json_valid(data)), search TEXT NOT NULL);
          CREATE TABLE topics (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL CHECK(json_valid(data)));
          CREATE INDEX notes_import ON notes(json_extract(data, '$.codexImportKey'));
          CREATE INDEX notes_thread ON notes(json_extract(data, '$.provenance.threadID'));
          CREATE INDEX notes_attachment ON notes(json_extract(data, '$.attachment'));`);
        for (const note of [...notes.records].reverse()) {
          // INSERT deliberately rejects duplicate IDs, rolling back the entire migration.
          this.db.prepare('INSERT INTO notes(id,data,search) VALUES (?,?,?)').run(note.id, JSON.stringify(note), this.searchText(note));
          if (note.attachment && notes.selected && path.dirname(notes.selected) !== dataDir) {
            const name = path.basename(note.attachment), target = path.join(dataDir, 'attachments', name);
            fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
            if (!fs.existsSync(target)) fs.copyFileSync(path.join(path.dirname(notes.selected), 'attachments', name), target);
          }
        }
        for (const topic of [...topics.records].reverse()) this.db.prepare('INSERT INTO topics(id,data) VALUES (?,?)').run(topic.id, JSON.stringify(topic));
        this.db.exec('PRAGMA user_version=1');
      }
      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch {}
      this.db.close();
      throw err;
    }
  }
  searchText(note) { return normalize(fields.map(k => note[k] || '').join('\n')); }
  get(id) { return decode(this.db.prepare('SELECT data FROM notes WHERE id=?').get(id)); }
  put(note) {
    this.db.prepare('INSERT INTO notes(id,data,search) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, search=excluded.search').run(note.id, JSON.stringify(note), this.searchText(note));
  }
  remove(id) { this.db.prepare('DELETE FROM notes WHERE id=?').run(id); }
  list(query = '') {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return this.db.prepare(`SELECT data FROM notes WHERE NOT COALESCE(json_extract(data,'$.deletedAt'),0) ${terms.map(() => 'AND instr(search,?)>0').join(' ')} ORDER BY seq DESC`).all(...terms).map(decode);
  }
  count() { return this.db.prepare("SELECT count(*) AS n FROM notes WHERE NOT COALESCE(json_extract(data,'$.deletedAt'),0)").get().n; }
  by(field, value, active = true) {
    if (!['codexImportKey', 'provenance.threadID', 'attachment'].includes(field)) throw Error('Invalid lookup');
    return this.db.prepare(`SELECT data FROM notes WHERE json_extract(data,'$.${field}')=? ${active ? "AND NOT COALESCE(json_extract(data,'$.deletedAt'),0)" : ''} ORDER BY seq DESC`).all(value).map(decode);
  }
  topics() { return this.db.prepare('SELECT data FROM topics ORDER BY seq DESC').all().map(decode); }
  topic(id) { return decode(this.db.prepare('SELECT data FROM topics WHERE id=?').get(id)); }
  putTopic(topic) { this.db.prepare('INSERT INTO topics(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(topic.id, JSON.stringify(topic)); }
  close() { this.db.close(); }
}
