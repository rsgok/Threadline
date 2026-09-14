export const runtimeNames = Object.freeze({ codex: 'Codex', cursor: 'Cursor', claude: 'Claude Code', pi: 'Pi', deepseek: 'DeepSeek Harness' });
export const runtimes = Object.keys(runtimeNames);
export const isRuntime = value => typeof value === 'string' && Object.hasOwn(runtimeNames, value);
export const sessionID = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(id);
