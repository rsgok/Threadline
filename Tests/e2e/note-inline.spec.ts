import {test, expect} from '@playwright/test';
const note = 'BBBBBBBB-BBBB-4BBB-8BBB-000000000002';
test('note edits in its reading layout and saves formatted text', async ({page}) => {
  await page.goto(`/notes/${note}?panel=1`);
  await expect(page.locator('.note-banner')).toContainText('收纳于');
  const originalURL = page.url();
  await expect(page.locator('#reader')).toBeVisible();
  await expect(page.locator('#editor')).toHaveCount(0);
  const editor = page.getByRole('textbox',{name:'编辑笔记正文'});
  await editor.waitFor();
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.pressSequentially('Inline saved content');
  await page.locator('.note-banner').click();
  await expect(page.getByRole('status')).toContainText('已保存到本机');
  await expect(page.locator('#reader')).toContainText('Inline saved content');
  expect(page.url()).toBe(originalURL);
  await page.reload();
  await expect(page.locator('#reader')).toContainText('Inline saved content');
  await page.screenshot({path:`artifacts/note-inline-${test.info().project.name}.png`});
});

test('conversation roles use compact metadata and preserve source on edit entry', async ({page}) => {
  const heading = '### 我的问题 · 2026-09-13 16:10:31 UTC';
  const body = `${heading}\n\n我的问题\n\n---\n\n### AI 回答 · 2026-09-13 16:11:31 UTC\n\n**回答**和依据\n`;
  let writes = 0;
  await page.route('**/api/library', async route => {
    const response = await route.fetch();
    const data = await response.json();
    const clip = data.clips.find((item: {id:string}) => item.id === note);
    clip.body = body;
    clip.provenance = { runtime:'codex', threadID:'11111111-1111-4111-8111-000000000001' };
    await route.fulfill({response,json:data});
  });
  await page.route(`**/api/clips/${note}`, async route => {
    if(route.request().method()==='PUT') writes++;
    await route.continue();
  });
  await page.setViewportSize({width:390,height:850});
  await page.goto(`/notes/${note}?panel=1`);
  await expect(page.locator('.note-message')).toHaveCount(2);
  await expect(page.locator('.note-role').first()).toHaveText('你');
  await expect(page.locator('.note-message-meta time')).toHaveCount(2);
  await expect(page.getByRole('textbox',{name:'编辑笔记正文'})).toHaveCount(2);
  await page.locator('.note-banner').click();
  await expect(page.getByRole('status')).toContainText('已保存到本机');
  expect(writes).toBe(0);
  await expect(page.getByRole('button',{name:'编辑',exact:true})).toHaveCount(0);
  await page.screenshot({path:`artifacts/note-conversation-${test.info().project.name}.png`});
});

test('title and body geometry remain unchanged on focus and blur', async ({page}) => {
  for (const width of [1100,390]) {
    await page.setViewportSize({width,height:850});
    await page.goto(`/notes/${note}?${width===390?'panel':'native'}=1`);
    const title = page.locator('#edit-title');
    const body = page.getByRole('textbox',{name:'编辑笔记正文'}).first();
    await body.waitFor();
    const metrics = () => page.evaluate(() => ['.note-detail-heading','#edit-title','.note-rich-content'].map(selector => {
      const el = document.querySelector(selector)!;
      const rect = el.getBoundingClientRect(),style=getComputedStyle(el);
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,font:style.fontSize,line:style.lineHeight,padding:style.padding};
    }));
    const before = await metrics();
    await title.focus(); expect(await metrics()).toEqual(before);
    await body.focus(); expect(await metrics()).toEqual(before);
    await page.locator('.note-banner').click(); expect(await metrics()).toEqual(before);
  }
});
