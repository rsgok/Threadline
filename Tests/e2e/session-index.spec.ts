import { test, expect } from "@playwright/test";

test("new conversations wait for explicit refresh and keep filters", async ({ page }) => {
  const response = await page.request.get("/api/sessions/index");
  const initial = await response.json();
  let current = initial;
  await page.route("**/api/sessions/index", route => route.fulfill({ json: current }));
  await page.route("**/api/sessions/index/status", route => route.fulfill({ json: {
    revision: current.revision, initialized: current.initialized, syncing: false,
  } }));
  await page.goto("/collect?panel=1");
  await page.getByRole("textbox", { name: "搜索本机会话" }).fill("界面");
  const id = "11111111-1111-4111-8111-999999999999";
  current = { ...initial, revision: "new-revision", sessions: [
    {id, runtime:"codex", title:"界面新讨论", updatedAt:"2026-09-16T10:00:00Z"}, ...initial.sessions,
  ], details: {...initial.details, ["codex:" + id]: {
    id, title:"界面新讨论", cwd:"/fictional/project", project:{root:"/fictional/project", name:"示例项目"}, messages:[{text:"新对话的摘要"}],
  }} };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const update = page.getByRole("button", { name: "有新对话，点击更新" });
  await expect(update).toBeVisible();
  await expect(page.getByRole("button", {name:"界面新讨论", exact:false})).toHaveCount(0);
  await page.screenshot({path: `artifacts/session-index-notice-${test.info().project.name}.png`});
  await update.click();
  await expect(page.getByRole("textbox", {name:"搜索本机会话"})).toHaveValue("界面");
  await expect(page.locator(".session-choice").filter({hasText:"界面新讨论"})).toBeVisible();
});

test("first index uses a stable placeholder and an empty completed index leaves loading", async ({page}) => {
  let initialized = false;
  const snapshot = () => ({sessions:[], details:{}, organization:{tags:[],sessions:{}}, revision:"same-empty-revision", initialized, syncing:!initialized});
  await page.route("**/api/sessions/index", route => route.fulfill({json:snapshot()}));
  await page.route("**/api/sessions/index/status", route => route.fulfill({json:snapshot()}));
  await page.goto("/collect?panel=1");
  await expect(page.locator(".conversation-index-loading")).toBeVisible();
  initialized = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".conversation-index-loading")).toHaveCount(0);
  await expect(page.locator(".session-guide")).toBeVisible();
});
