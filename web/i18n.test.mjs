import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { cardDocument } from './card-template.mjs';
const catalogSource=fs.readFileSync(new URL('./i18n-catalog.js',import.meta.url),'utf8');
const runtimeSource=fs.readFileSync(new URL('./i18n.js',import.meta.url),'utf8');
function setup({language='en-US',saved,blocked=false}={}){
 const storage=new Map(saved?[['threadline-language',saved]]:[]),messages=[];
 const context=vm.createContext({window:{webkit:{messageHandlers:{language:{postMessage:message=>messages.push(message)}}}},navigator:{language},document:{documentElement:{}},localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key)},setItem:(key,value)=>{if(blocked)throw Error('blocked');storage.set(key,value)}}});
 vm.runInContext(catalogSource,context);vm.runInContext(runtimeSource,context);
 return {api:context.window.I18n,context,storage,messages};
}
test('language defaults, explicit preferences, and native bridge agree',()=>{
 assert.equal(setup({language:'zh-TW'}).api.locale,'zh-CN');
 assert.equal(setup({language:'fr-FR'}).api.locale,'en');
 assert.equal(setup({language:'zh-CN',saved:'en'}).api.locale,'en');
 assert.equal(setup({language:'en',saved:'invalid'}).api.preference,'system');
 const {api,storage,context,messages}=setup();api.setPreference('zh-CN');
 assert.equal(storage.get('threadline-language'),'zh-CN');assert.equal(context.document.documentElement.lang,'zh-CN');assert.equal(messages.at(-1).locale,'zh-CN');
 assert.throws(()=>api.setPreference('de'));assert.equal(api.preference,'zh-CN');
});
test('unavailable storage uses system language and reports failed writes',()=>{
 const {api}=setup({language:'zh-CN',blocked:true});assert.equal(api.locale,'zh-CN');assert.throws(()=>api.setPreference('en'));assert.equal(api.locale,'zh-CN');
});
test('template translation preserves user content and placeholder-like text exactly',()=>{
 const {api}=setup();const title='我的思路 <code>{1}</code> $&';
 const translated=api.t(['目标：',' · 频道 ',''],title,'中文');
 assert.equal(translated,'Destination: '+title+' · Channel 中文');
 assert.equal(api.t('A user-authored title'),'A user-authored title');
 assert.equal(api.t(['已选 ',' 条'],2),'2 selected');
 api.setPreference('zh-CN');assert.equal(api.t(['已选 ',' 条'],2),'已选 2 条');
});
test('known API messages translate without changing embedded values or unknown diagnostics',()=>{
 const {api}=setup();assert.equal(api.message('消息已变化，请刷新后重新选择。'),'Messages have changed. Refresh and select them again.');
 assert.equal(api.message('附件超过 25 MB 上限'),'Attachment exceeds the 25 MB limit');
 assert.equal(api.message('请先连接 我的工作区'),'Connect 我的工作区 first');
 assert.equal(api.message('HTTP 503: vendor diagnostic'),'HTTP 503: vendor diagnostic');
});
test('English catalog covers direct UI calls and retains interpolation placeholders',()=>{
 const {context}=setup(),catalog=context.window.THREADLINE_EN;
 for(const file of ['index.html','threadline.js','sharing-ui.js','feishu-ui.js']){
  const source=fs.readFileSync(new URL('./'+file,import.meta.url),'utf8');
  for(const match of source.matchAll(/I18n\.t\(((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))\)/g)){
   const key=vm.runInNewContext(match[1]);assert.ok(Object.hasOwn(catalog,key),`${file}: missing ${key}`);
  }
 }
 for(const [source,translated]of Object.entries(catalog)){
  assert.equal(typeof translated,'string');assert.ok(translated.trim());
  assert.deepEqual([...source.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),[...translated.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),source);
  assert.ok(!/[\u3400-\u9fff]/.test(translated)||source==='简体中文',source);
 }
});
test('image export localizes labels while preserving original messages and code',()=>{
 const job={title:'原文标题',locale:'en',cardTheme:'sage',note:'我的原始附言',messages:[{role:'user',text:'我的原始问题'},{role:'assistant',text:'```js\nconst title = "我的思路";\n```'}],attachments:[]};
 const html=cardDocument(job);assert.match(html,/<html lang="en">/);assert.match(html,/My question/);assert.match(html,/AI answer/);assert.match(html,/原文标题/);assert.match(html,/我的原始问题/);assert.match(html,/我的思路/);assert.doesNotMatch(html,/我的提问/);
 assert.match(cardDocument({...job,locale:'zh-CN'}),/我的提问/);
});
test('counts follow English plural rules and Chinese classifiers',()=>{
 const {api}=setup();assert.equal(api.count(1),'1 message');assert.equal(api.count(2),'2 messages');assert.equal(api.count(0,'note'),'0 notes');
 api.setPreference('zh-CN');assert.equal(api.count(2),'2 条消息');
});
