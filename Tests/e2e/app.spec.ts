import { test, expect, type Page } from "@playwright/test";
const note = "BBBBBBBB-BBBB-4BBB-8BBB-000000000001";
const topic = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const thread = "11111111-1111-4111-8111-000000000001";
async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator(".sidebar")).toBeAttached();
}

test("deep links, native commands, selection persistence, safe Markdown and import", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page, `/?native=1&thread=${thread}`);
  await expect(page).toHaveURL(
    new RegExp(`/collect/codex/${thread}\\?native=1`),
  );
  await expect(page.locator(".message-card")).toHaveCount(2);
  await page.locator(".message-select").last().click();
  await page.getByRole("button", { name: "展开完整内容 ↓" }).click();
  await expect(page.locator(".article table")).toBeVisible();
  await expect(page.locator(".article script")).toHaveCount(0);
  await page.evaluate(() => window.Threadline!.library());
  await expect(page).toHaveURL(/\/library\?native=1/);
  await page.goBack();
  await expect(page.locator(".message-select[aria-pressed=true]")).toHaveCount(
    1,
  );
  await page.reload();
  await expect(page.locator(".message-select[aria-pressed=true]")).toHaveCount(
    1,
  );
  await page.locator("#save-session").click();
  await page.locator("#confirm-save-session").click();
  await expect(page.getByRole("button", { name: "查看笔记 →" })).toBeVisible();
  await page.getByRole("button", { name: "查看笔记 →" }).click();
  await expect(page.locator("#reader > h1")).toHaveText("界面架构讨论");
  await page.locator(".markdown-image-content").scrollIntoViewIfNeeded();
  await expect(page.locator(".markdown-image-content")).toHaveJSProperty(
    "complete",
    true,
  );
  await page.reload();
  await expect(page.locator("#reader")).toBeVisible();
  expect(errors).toEqual([]);
});

test("autosave flushes before route changes and preserves edits on conflict", async ({
  page,
}) => {
  await ready(page, `/notes/${note}`);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const title = "保存验证 " + test.info().project.name;
  await page.locator("#edit-title").fill(title);
  await page.evaluate(() => window.Threadline!.library());
  await expect(page).toHaveURL(/\/library$/);
  await page.goto(`/notes/${note}`);
  await expect(page.locator("#reader > h1")).toHaveText(title);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.route(`**/api/clips/${note}`, async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 409,
        json: { error: "这条笔记已变化，请重新打开后编辑。" },
      });
    else await route.continue();
  });
  await page.locator("#edit-title").fill("保留冲突草稿");
  await expect(
    page.getByRole("button", { name: "重试保存", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.Threadline!.library());
  await expect(
    page.getByRole("dialog", { name: "编辑尚未保存" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "留在编辑页面" }).click();
  await expect(page.locator("#edit-title")).toHaveValue("保留冲突草稿");
  await page.unroute(`**/api/clips/${note}`);
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已保存到本机" }),
  ).toBeVisible();
});

test("capture modal handles Escape, busy protection, scroll, and saved content", async ({
  page,
}) => {
  await ready(page, "/library?panel=1");
  await page.evaluate(() => window.Threadline!.capture("草稿"));
  const dialog = page.locator("#capture-dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.evaluate(() => window.Threadline!.capture("端到端测试记录"));
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 600 });
  await expect(dialog).toHaveCSS("opacity", "1");
  await page.screenshot({
    animations: "disabled",
    path: `artifacts/modal-${test.info().project.name}.png`,
  });
  const dimensions = await dialog.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    scrollbar: getComputedStyle(el).scrollbarWidth,
    overflow: getComputedStyle(el).overflowY,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(390);
  expect(dimensions.scrollbar).toBe("none");
  expect(["auto", "scroll"]).toContain(dimensions.overflow);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/clips", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  await page.locator("#capture-save").click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#reader")).toContainText("端到端测试记录");
  await page.reload();
  await expect(page.locator("#reader")).toContainText("端到端测试记录");
});

test("local sharing previews and downloads selected discussion", async ({
  page,
}) => {
  await ready(page, `/collect/codex/${thread}?panel=1`);
  await page.locator(".message-select").first().click();
  await page.getByRole("button", { name: "分享所选讨论" }).click();
  await page
    .getByRole("button", { name: /保存文件.*下载文字与所选附件/ })
    .click();
  const action = page.locator(".share-dialog .dialog-bottom button.primary");
  await expect(action).toBeEnabled();
  const download = page.waitForEvent("download");
  await action.click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});

test("manual evidence relations survive reload and render confirmed connections", async ({
  page,
}) => {
  const current = await (
    await page.request.get(`/api/thoughts/${topic}/relations`)
  ).json();
  for (const relation of current.relations)
    await page.request.put(`/api/relations/${relation.id}`, {
      headers: { "X-Rewind-Request": "1" },
      data: { status: "dismissed" },
    });
  await ready(page, `/thoughts/${topic}`);
  await page.getByRole("button", { name: "关系图", exact: true }).click();
  await page
    .getByRole("button", { name: "手动连接两段对话", exact: true })
    .click();
  await page.locator("#relation-fromQuote").fill("保留原文，才能核对依据。");
  await page.locator("#relation-toQuote").fill("保留原文，才能核对依据。");
  await page.locator("#relation-reason").fill("两段讨论都强调保留依据");
  await page.getByRole("button", { name: "保存并确认" }).click();
  await expect(page.locator("#thought-relation-editor")).toBeHidden();
  await expect(page.locator(".thought-map-row").first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "关系图", exact: true }).click();
  await expect(page.locator(".thought-map-row").first()).toBeVisible();
});

test("language persists across full reload and new routes", async ({
  page,
}) => {
  await ready(page, "/settings?panel=1");
  await page.locator("#language-choice").selectOption("en");
  await page.getByRole("button", { name: "应用并重新加载" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.goto("/collect?panel=1");
  await expect(page.locator("#session-view h2")).toHaveText(
    "Collect conversations",
  );
});

test("recent sessions load in bounded batches, and titles are not covered by chrome", async ({
  page,
}) => {
  await ready(page, "/collect?native=1");
  await expect(page.locator(".session-choice")).toHaveCount(6);
  await page.getByRole("button", { name: "显示更多会话" }).click();
  await expect(page.locator(".session-choice")).toHaveCount(8);
  const unobscured = await page.locator("#session-view h2").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + 10, r.y + r.height / 2));
  });
  expect(unobscured).toBe(true);
  await page.screenshot({
    path: `artifacts/collect-${test.info().project.name}.png`,
  });
});
