import {test,expect} from '@playwright/test';
const note='BBBBBBBB-BBBB-4BBB-8BBB-000000000002';
test('one selected editor owns the toolbar and special content edits in a modal',async({page})=>{
 let body='### 我的问题 · 2026-09-13 16:10:31 UTC\n\n第一段问题\n\n---\n\n### AI 回答 · 2026-09-13 16:11:31 UTC\n\n第二段回答\n\n---\n\n### AI 回答 · 2026-09-13 16:12:31 UTC\n\n特殊内容 <kbd>Command</kbd>\n';
 await page.route('**/api/library',async route=>{const response=await route.fetch();const data=await response.json();const clip=data.clips.find((x:{id:string})=>x.id===note);clip.body=body;clip.provenance={runtime:'codex',threadID:'11111111-1111-4111-8111-000000000001'};await route.fulfill({response,json:data});});
 await page.route(`**/api/clips/${note}`,async route=>{if(route.request().method()==='PUT')body=route.request().postDataJSON().body;await route.continue();});
 await page.goto(`/notes/${note}?panel=1`);
 const editors=page.getByRole('textbox',{name:'编辑笔记正文'});
 await expect(editors).toHaveCount(2);
 for(const index of [0,1,0,1]){await editors.nth(index).focus();await editors.nth(index).press('ControlOrMeta+A');await expect(page.getByRole('toolbar')).toHaveCount(1);}
 await editors.last().press('ArrowRight');await expect(page.getByRole('toolbar')).toHaveCount(0);
 await expect(page.locator('.note-special-content textarea')).toHaveCount(0);
 await page.getByRole('button',{name:'编辑此段',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'编辑此段'});await expect(modal).toHaveCSS('opacity','1');
 await expect(page.getByRole('toolbar')).toHaveCount(0);await expect(modal).toHaveCSS('scrollbar-width','none');
 await modal.getByRole('textbox').fill('discard me');await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(page.locator('.note-special-content')).not.toContainText('discard me');
 await page.getByRole('button',{name:'编辑此段',exact:true}).click();await modal.getByRole('textbox').fill('特殊内容 <kbd>Saved</kbd>');
 await expect(modal).toHaveCSS('opacity','1');await page.screenshot({path:`artifacts/source-modal-${test.info().project.name}.png`});
 await modal.getByRole('button',{name:'保存编辑'}).click();await expect(modal).toHaveCount(0);await expect(page.locator('.note-special-content')).toContainText('Saved');
 await page.reload();await expect(page.locator('.note-special-content')).toContainText('Saved');
});
