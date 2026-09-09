import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardDocument } from './card-template.mjs';
test('image export localizes labels while preserving original messages and code',()=>{
 const job={title:'原文标题',locale:'en',cardTheme:'sage',note:'我的原始附言',messages:[{role:'user',text:'我的原始问题'},{role:'assistant',text:'```js\nconst title = "我的思路";\n```'}],attachments:[]};
 const html=cardDocument(job);assert.match(html,/<html lang="en">/);assert.match(html,/My question/);assert.match(html,/AI answer/);assert.match(html,/原文标题/);assert.match(html,/我的原始问题/);assert.match(html,/我的思路/);assert.doesNotMatch(html,/我的提问/);
 assert.match(cardDocument({...job,locale:'zh-CN'}),/我的提问/);
});
