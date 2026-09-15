import {test,expect} from '@playwright/test';
test('projects show five conversations and expand independently after filtering',async({page})=>{
 const sessions=Array.from({length:19},(_,i)=>({id:`session-${i}`,runtime:'codex',title:`讨论 ${i}`,updatedAt:'2026-09-16T10:00:00Z'}));
 const details=Object.fromEntries(sessions.map((s,i)=>['codex:'+s.id,{...s,project:{root:`/project/${Math.floor(i/7)}`,name:`项目 ${Math.floor(i/7)}`},messages:[]}]));
 const data={sessions,details,organization:{tags:[],sessions:{}},revision:'test',initialized:true,syncing:false};
 await page.route('**/api/sessions/index',r=>r.fulfill({json:data}));await page.route('**/api/sessions/index/status',r=>r.fulfill({json:data}));
 await page.goto('/collect?panel=1');const groups=page.locator('.conversation-group');await expect(groups).toHaveCount(3);
 for(let i=0;i<3;i++)await expect(groups.nth(i).locator('.session-choice')).toHaveCount(5);
 await expect(groups.last().getByRole('button',{name:'展开显示'})).toHaveCount(0);
 await groups.first().getByRole('button',{name:'展开显示'}).click();await expect(groups.first().locator('.session-choice')).toHaveCount(7);await expect(groups.nth(1).locator('.session-choice')).toHaveCount(5);
 await groups.first().getByRole('button',{name:'收起',exact:true}).click();await expect(groups.first().locator('.session-choice')).toHaveCount(5);
 await page.getByRole('textbox',{name:'搜索本机会话'}).fill('讨论 6');await expect(page.locator('.session-choice')).toHaveCount(1);await expect(page.locator('.session-choice')).toContainText('讨论 6');await expect(page.getByRole('button',{name:'展开显示'})).toHaveCount(0);
});
