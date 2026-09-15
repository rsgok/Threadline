import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardDocument } from './card-template.mjs';
test('image export localizes labels while preserving original messages and code',()=>{
 const job={title:'原文标题',locale:'en',cardTheme:'sage',note:'我的原始附言',messages:[{role:'user',text:'我的原始问题'},{role:'assistant',text:'```js\nconst title = "我的思路";\n```'}],attachments:[]};
 const html=cardDocument(job);assert.match(html,/<html lang="en">/);assert.match(html,/You · Message/);assert.match(html,/AI · Answer/);assert.match(html,/原文标题/);assert.match(html,/我的原始问题/);assert.match(html,/我的思路/);assert.doesNotMatch(html,/我的提问/);
 assert.match(cardDocument({...job,locale:'zh-CN'}),/你 · 发言/);
});
test('note transcript metadata is compact but code headings remain literal',()=>{
 const html=cardDocument({title:'笔记',messages:[{role:'note',text:'### 我的问题 · 2026-09-13 16:10:31 UTC\n\n问题正文\n\n### AI 回答\n\n回答正文\n\n```md\n### 我的问题\n```'}],attachments:[]});
 assert.match(html,/data-role="user"/);assert.match(html,/data-role="assistant"/);assert.match(html,/<time>/);assert.match(html,/<code>### 我的问题/);assert.doesNotMatch(html,/<span class="role-mark"/);assert.doesNotMatch(html,/条消息<\/p>/);
});
