import fs from 'node:fs';
import path from 'node:path';
import * as zlib from 'node:zlib';
export const terminalID = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-09-12T04:00:00.000Z';
const image = { type: 'image', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=', mimeType: 'image/png' };
export const encodeRows = rows => rows.map(JSON.stringify).join('\n') + '\n';
export function terminalRows(runtime, id = terminalID) {
  const question = runtime + '：我们为什么选择本地资料库？';
  const answer = '保留原文和自己的判断，下一次讨论才能接着往前走。';
  if (runtime === 'claude') return [
    { type: 'user', sessionId: id, uuid: 'q1', parentUuid: null, cwd: '/sample/project', timestamp, message: { role: 'user', content: [{ type: 'text', text: question }, image] } },
    { type: 'user', sessionId: id, uuid: 'injected', isMeta: true, message: { role: 'user', content: 'private instructions' } },
    { type: 'assistant', sessionId: id, uuid: 'a1', parentUuid: 'q1', timestamp, message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'private reasoning' }, { type: 'tool_use', input: { secret: 'private tool' } }, { type: 'text', text: answer }] } },
    { type: 'user', sessionId: id, uuid: 'tool', message: { role: 'user', content: [{ type: 'tool_result', content: [{ type: 'text', text: 'private result' }, image] }] } },
    { type: 'custom-title', sessionId: id, customTitle: 'Claude Code 架构讨论' },
  ];
  if (runtime === 'pi') return [
    { type: 'session', version: 3, id, cwd: '/sample/project', timestamp },
    { type: 'message', id: 'q1', parentId: null, timestamp, message: { role: 'user', content: [{ type: 'text', text: question }, image] } },
    { type: 'message', id: 'abandoned', parentId: 'q1', timestamp, message: { role: 'assistant', content: [{ type: 'text', text: 'abandoned branch' }] } },
    { type: 'message', id: 'a1', parentId: 'q1', timestamp, message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'private reasoning' }, { type: 'toolCall', arguments: { secret: 'private tool' } }, { type: 'text', text: answer }] } },
    { type: 'message', id: 'tool', parentId: 'a1', timestamp, message: { role: 'toolResult', content: [{ type: 'text', text: 'private result' }, image] } },
    { type: 'session_info', id: 'info', parentId: 'tool', timestamp, name: 'Pi 架构讨论' },
  ];
  return [
    { type: 'session', version: 3, id, createdAt: Date.parse(timestamp), cwd: '/sample/project', isSeeded: false, delegationDepth: 0 },
    { type: 'user/message', seq: 1, time: Date.parse(timestamp), surfaceOp: 'append', data: { id: 'q1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: question }] } },
    { type: 'user/message', seq: 2, time: Date.parse(timestamp), surfaceOp: 'append', data: { id: 'injected', role: 'user', source: { kind: 'plugin', plugin: 'instructions' }, content: [{ type: 'text', text: 'private instructions' }] } },
    { type: 'assistant/message', seq: 3, time: Date.parse(timestamp), surfaceOp: 'append', data: { turn: 0, step: 0, stream: [], message: { id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'sample', model: 'sample' }, content: [{ type: 'reasoning', text: 'private reasoning' }, { type: 'text', text: answer }] } } },
    { type: 'tool/result', seq: 4, time: Date.parse(timestamp), surfaceOp: 'append', data: { message: { role: 'user', source: { kind: 'tool' }, content: [{ type: 'text', text: 'private result' }] } } },
    { type: 'session/title', seq: 5, time: Date.parse(timestamp), data: { title: 'DeepSeek Harness 架构讨论', source: { kind: 'user' }, messageSeqs: [] } },
  ];
}
export function writeTerminalFixture(root, runtime, { id = terminalID, compressed = false, rows = terminalRows(runtime, id), version = 3 } = {}) {
  const directory = path.join(root, runtime, 'project', ...(runtime === 'deepseek' ? [id] : []));
  fs.mkdirSync(directory, { recursive: true });
  const filename = runtime === 'deepseek' ? `session.v${version}.jsonl${compressed ? '.zstd' : ''}` : (runtime === 'pi' ? '2026-09-12_' : '') + id + '.jsonl';
  const file = path.join(directory, filename), text = encodeRows(rows);
  fs.writeFileSync(file, compressed ? zlib.zstdCompressSync(text) : text);
  return file;
}
