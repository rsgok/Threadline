import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNoteResources,renderMarkdown} from './markdown.ts';
test('legacy uploaded image paths with spaces render without altering code examples',()=>{
 const raw='![截图](/Users/example/Library/Application Support/RewindWeb/note-uploads/id/image.png)';
 assert.equal(normalizeNoteResources(raw),raw.replace('](','](<').replace('png)','png>)'));
 assert.match(renderMarkdown(raw.slice(1),{clip:'note'}),/<a/);
 assert.match(renderMarkdown(raw,{clip:'note'}),/<img/);
 for(const source of ['`'+raw+'`','```md\n'+raw+'\n```'])assert.equal(normalizeNoteResources(source),source);
});
