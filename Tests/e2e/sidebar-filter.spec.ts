import { test, expect } from '@playwright/test';
const note='BBBBBBBB-BBBB-4BBB-8BBB-000000000002';
test('sidebar filters and search preserve the open note and route',async({page})=>{
 await page.goto(`/notes/${note}?native=1`);
 await expect(page.locator('#reader')).toBeVisible();
 const url=page.url(),title=await page.locator('#edit-title').inputValue();
 const filter=page.getByRole('combobox',{name:'筛选笔记'});
 await filter.selectOption('inbox');
 expect(page.url()).toBe(url);await expect(page.locator('#edit-title')).toHaveValue(title);
 await page.getByRole('textbox',{name:'搜索笔记',exact:true}).fill('no matching note xyz');
 await expect(page.locator('.native-note-list .native-note')).toHaveCount(0);
 expect(page.url()).toBe(url);await expect(page.locator('#reader')).toBeVisible();
 await filter.selectOption('all');expect(page.url()).toBe(url);
});
test('legacy library entry opens a note instead of a duplicate list',async({page})=>{
 await page.goto('/library?native=1');await expect(page).toHaveURL(/\/notes\/.+\?native=1/);
 await expect(page.locator('#reader')).toBeVisible();await expect(page.locator('.note-row')).toHaveCount(0);
});
test('panel note picker preserves the page until a note is chosen',async({page})=>{
 await page.setViewportSize({width:390,height:800});await page.goto(`/notes/${note}?panel=1`);
 await page.getByRole('button',{name:'笔记',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'笔记',exact:true});await expect(dialog).toHaveCSS('opacity','1');
 const url=page.url();await dialog.getByRole('textbox').fill('missing xyz');await expect(dialog).toContainText('没有匹配的笔记');expect(page.url()).toBe(url);
 await dialog.getByRole('textbox').fill('');await page.screenshot({path:`artifacts/note-picker-${test.info().project.name}.png`});
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(page.url()).toBe(url);
 await page.getByRole('button',{name:'笔记',exact:true}).click();await dialog.locator('.note-picker-list button').first().click();await expect(dialog).toHaveCount(0);await expect(page.locator('#reader')).toBeVisible();
});
