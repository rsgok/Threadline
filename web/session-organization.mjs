import fs from 'node:fs';
import path from 'node:path';

export const tagColors = ['sage', 'blue', 'purple', 'amber', 'coral', 'gray'];
export class SessionOrganization {
  constructor(directory) { this.file = path.join(directory, 'session-organization.json'); }
  read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { tags: [], sessions: {} }; throw error; }
  }
  update(command) {
    const invalid = () => { throw Object.assign(new Error('Invalid conversation organization request'), { status: 400 }); };
    const state = this.read();
    if (command.action === 'tag') {
      const name = typeof command.name === 'string' ? command.name.trim() : '';
      if (!name || name.length > 24 || !tagColors.includes(command.color)) invalid();
      const existing = state.tags.find(tag => tag.name === name);
      if (existing) existing.color = command.color;
      else state.tags.push({ name, color: command.color });
    } else {
      if (!['pin', 'addTag', 'removeTag'].includes(command.action) || !Array.isArray(command.keys) || !command.keys.length || command.keys.length > 200 || command.keys.some(key => typeof key !== 'string' || !/^(codex|cursor):[^\s]{1,200}$/.test(key))) invalid();
      if (command.action === 'pin' ? typeof command.pinned !== 'boolean' : !state.tags.some(tag => tag.name === command.name)) invalid();
      for (const key of command.keys) {
        const entry = state.sessions[key] ||= { pinned: false, tags: [] };
        if (command.action === 'pin') entry.pinned = command.pinned;
        else if (command.action === 'addTag') entry.tags = [...new Set([...entry.tags, command.name])];
        else entry.tags = entry.tags.filter(tag => tag !== command.name);
      }
    }
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    return state;
  }
}
