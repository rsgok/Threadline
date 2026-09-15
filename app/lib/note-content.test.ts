import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteMessages } from './note-content.ts';
test('conversation headings separate roles and preserve untouched source exactly', () => {
  const text = '### 我的问题 · 2026-09-13 16:10:31 UTC\n\n问题\n\n---\n\n### AI 回答\n\n回答\n';
  const messages = noteMessages(text)!;
  assert.equal(messages.length, 2);
  assert.equal(messages[0].body.trim(), '问题');
  for (const message of messages) assert.equal(text.slice(0,message.bodyStart)+message.body+text.slice(message.end),text);
});
test('code fences and quoted headings are not message boundaries', () => {
  assert.equal(noteMessages('```md\n### AI 回答\n```'),null);
  assert.equal(noteMessages('> ### AI 回答'),null);
  assert.equal(noteMessages('# 文档\n\n### AI 回答'),null);
});
