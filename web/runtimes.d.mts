export const runtimeNames: Readonly<{ codex: 'Codex'; cursor: 'Cursor'; claude: 'Claude Code'; pi: 'Pi'; deepseek: 'DeepSeek Harness' }>;
export type Runtime = keyof typeof runtimeNames;
export const runtimes: Runtime[];
export function isRuntime(value: unknown): value is Runtime;
export function sessionID(value: unknown): boolean;
