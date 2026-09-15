import {test,expect} from '@playwright/test';
const note='BBBBBBBB-BBBB-4BBB-8BBB-000000000001';
test('caret hides toolbar, selected text shows it, pasted files survive reload',async({page})=>{
 const clip=(await(await page.request.get(`/api/clips/${note}`)).json()).clip;
 expect((await page.request.put(`/api/clips/${note}`,{headers:{'X-Rewind-Request':'1'},data:{body:'Clipboard test',version:clip.version}})).ok()).toBe(true);
 await page.goto(`/notes/${note}?panel=1`);
 const editor=page.getByRole('textbox',{name:'编辑笔记正文'}).first();await editor.click();
 await expect(page.getByRole('toolbar',{name:'正文格式'})).not.toBeVisible();
 await editor.press('ControlOrMeta+A');await expect(page.getByRole('toolbar',{name:'正文格式'})).toBeVisible();
 await editor.press('ArrowRight');await expect(page.getByRole('toolbar',{name:'正文格式'})).not.toBeVisible();
 await editor.evaluate(el=>{const data=new DataTransfer();const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));data.items.add(new File([png],'pasted.png',{type:'image/png'}));data.items.add(new File(['file body'],'pasted.txt',{type:'text/plain'}));el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
 await expect(editor.locator('img[alt="pasted.png"]').last()).toBeVisible();
 await expect(editor.locator('a').filter({hasText:'pasted.txt'}).last()).toBeVisible();
 await expect.poll(async()=>{const clip=(await(await page.request.get(`/api/clips/${note}`)).json()).clip;return clip.assets?.some((a:{name:string})=>a.name==='pasted.txt');}).toBe(true);
 await editor.evaluate(el=>{const data=new DataTransfer();data.items.add(new File(['dropped'],'drop.txt',{type:'text/plain'}));const rect=el.getBoundingClientRect();el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:rect.x+10,clientY:rect.y+10}));});
 await expect.poll(async()=>{const clip=(await(await page.request.get(`/api/clips/${note}`)).json()).clip;return clip.assets?.some((a:{name:string})=>a.name==='drop.txt');}).toBe(true);
 await page.reload();await expect(page.locator('img[alt="pasted.png"]').last()).toBeVisible();
 await expect(page.locator('#reader a').filter({hasText:'pasted.txt'}).last()).toBeVisible();
 await expect.poll(()=>page.locator('img[alt="pasted.png"]').last().evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1);
});
test('carry modal separates task, note selection and preview',async({page})=>{
 await page.setViewportSize({width:390,height:800});await page.goto(`/notes/${note}?panel=1`);
 await page.getByRole('button',{name:'使用对话',exact:true}).click();const modal=page.getByRole('dialog',{name:'使用对话'});await expect(modal).toHaveCSS('opacity','1');
 await expect(modal).toHaveCSS('scrollbar-width','none');await expect(modal.locator('.carry-selection-heading')).toContainText('选择参考笔记');
 await page.screenshot({path:`artifacts/carry-polished-${test.info().project.name}.png`});
 await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);
});
