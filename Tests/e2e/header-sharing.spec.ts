import {test,expect} from '@playwright/test';
const note='BBBBBBBB-BBBB-4BBB-8BBB-000000000001';
const thread='11111111-1111-4111-8111-000000000001';
test('header menus stay anchored and inside the viewport across pages',async({page})=>{
  for(const width of [1100,390]) {
    await page.setViewportSize({width,height:800});
    for(const path of ['/collect','/library','/thoughts','/thoughts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','/settings','/settings?section=about',`/notes/${note}`,`/collect/codex/${thread}`]) {
      await page.goto(path+(path.includes('?')?'&':'?')+(width===390?'panel=1':'native=1'));
      await expect(page.locator('.sidebar')).toBeAttached();
      const menus=page.locator('details.session-more');
      for(let i=0;i<await menus.count();i++) {
        const menu=menus.nth(i),summary=menu.locator(':scope > summary');
        if(!await summary.isVisible()) continue;
        await summary.click();
        const panel=menu.locator('.session-more-body');
        await expect(panel).toHaveCSS('position','fixed');
        const a=(await summary.boundingBox())!,b=(await panel.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);
        expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.height).toBeLessThanOrEqual(800);
        expect(Math.abs(b.y-a.y-a.height-8)).toBeLessThan(2);
        await page.keyboard.press('Escape');await expect(menu).not.toHaveAttribute('open','');
      }
    }
  }
});
test('note sharing previews saved edits and rejects stale versions',async({page})=>{
  const initial=(await(await page.request.get(`/api/clips/${note}`)).json()).clip;
  expect((await page.request.put(`/api/clips/${note}`,{headers:{'X-Rewind-Request':'1'},data:{body:'分享测试正文',version:initial.version}})).ok()).toBe(true);
  await page.goto(`/notes/${note}?panel=1`);
  const current=(await (await page.request.get(`/api/clips/${note}`)).json()).clip;
  const stale=await page.request.post('/api/share/preview',{headers:{'X-Rewind-Request':'1'},data:{clipID:note,clipVersion:'stale',platform:'export'}});
  expect(stale.status()).toBe(409);
  const title='分享已保存的笔记 '+test.info().project.name;
  await page.locator('#edit-title').fill(title);
  await page.getByRole('button',{name:'分享',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await page.getByRole('button',{name:/保存文件.*下载文字与所选附件/}).click();
  const action=page.locator('.share-dialog .dialog-bottom button.primary');await expect(action).toBeEnabled();
  await page.screenshot({path:`artifacts/note-share-${test.info().project.name}.png`});
  const download=page.waitForEvent('download');await action.click();expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  const updated=(await (await page.request.get(`/api/clips/${note}`)).json()).clip;
  expect(updated.title).toBe(title);expect(updated.version).not.toBe(current.version);
  const preview=await page.request.post('/api/share/preview',{headers:{'X-Rewind-Request':'1'},data:{clipID:note,clipVersion:updated.version,platform:'export'}});
  expect(preview.status()).toBe(201);
  const job=await preview.json();
  expect(job.text).toContain('【笔记】');
  expect(job.text).toContain(updated.body);
});
