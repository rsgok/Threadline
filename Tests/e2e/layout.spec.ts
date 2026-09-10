import { test, expect } from "@playwright/test";
const thread = "11111111-1111-4111-8111-000000000001";

test("title and selection bar stay in place with sidebar shown or hidden", async ({
  page,
}) => {
  await page.goto(`/collect/codex/${thread}?native=1`);
  const title = page.locator(".conversation-title");
  await expect(title).toHaveText("界面架构讨论");
  for (const collapsed of [false, true]) {
    if (collapsed)
      await page.getByRole("button", { name: "切换导航栏" }).click();
    await expect(title).toBeVisible();
    await expect(page.locator(".native-context-title")).toHaveCount(0);
    const head = await title.boundingBox();
    const controls = await page.getByRole("button", { name: "切换导航栏" }).boundingBox();
    expect(Math.abs(head!.y + head!.height / 2 - controls!.y - controls!.height / 2)).toBeLessThan(1);
    expect(
      await title.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
    ).toBe(true);
    await page.locator(".message-select").first().click();
    await page.getByRole("button", { name: "全选", exact: true }).click();
    await expect(
      page.locator(".message-select[aria-pressed=true]"),
    ).toHaveCount(2);
    const share = await page
      .getByRole("button", { name: "分享所选讨论" })
      .boundingBox();
    const save = await page.locator("#save-session").boundingBox();
    expect(share!.x).toBeGreaterThan(800);
    expect(save!.x).toBeGreaterThan(share!.x);
    expect((await title.boundingBox())!.y).toBe(head!.y);
    await page.screenshot({
      path: `artifacts/layout-audit-fixed-session-${collapsed}-${test.info().project.name}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "取消选择", exact: true }).click();
  }
});

test("collapsed sidebar leaves usable navigation and clear headings on every page", async ({
  page,
}) => {
  const routes = [
    "/collect",
    "/library",
    "/thoughts",
    "/thoughts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "/notes/BBBBBBBB-BBBB-4BBB-8BBB-000000000001",
    "/settings",
  ];
  for (const route of routes) {
    await page.goto(route + "?native=1");
    await page.getByRole("button", { name: "切换导航栏" }).click();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".collapsed-navigation")).toBeVisible();
    expect(
      await page
        .locator(".collapsed-navigation button")
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
    ).toBe(true);
    const heading = page.locator("#window-page-heading h1, #window-page-heading h2").first();
    await expect(heading).toBeVisible();
    expect((await heading.boundingBox())!.y).toBeLessThan(46);
    await expect(heading).toHaveCSS("font-size", "14px");
    await expect(heading).toHaveCSS("font-weight", "500");
    const content = page.locator(".workspace.route-scroll, .reading, .settings-content, .session-messages").first();
    await expect(content).toHaveCSS("padding-left", "20px");
    await expect(content).toHaveCSS("padding-right", "20px");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/layout-audit-collapsed-${route.split("/")[1]}-${test.info().project.name}.png`,
      animations: "disabled",
    });
  }
});

test("manual capture uses a keyboard-operable image button and a scrollable shell without scrollbars", async ({
  page,
}) => {
  await page.goto("/library?native=1");
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.evaluate(() => window.Threadline!.capture());
  const dialog = page.locator("#capture-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#capture-body")).toBeFocused();
  const picker = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "添加图片", exact: true }).click();
  await (
    await picker
  ).setFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(dialog.locator(".capture-preview img")).toBeVisible();
  await expect(dialog).toHaveCSS("scrollbar-width", "none");
  await page.screenshot({
    path: `artifacts/layout-audit-capture-image-${test.info().project.name}.png`,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 560 });
  await expect(dialog).toHaveCSS("overflow-y", "auto");
  await dialog.getByRole("button", { name: "移除" }).click();
  await expect(dialog.locator(".capture-preview")).toHaveCount(0);
});

test("file download appears in unified sharing history and detail", async ({
  page,
}) => {
  await page.goto(`/collect/codex/${thread}?panel=1`);
  await page.locator(".message-select").first().click();
  await page.getByRole("button", { name: "分享所选讨论" }).click();
  await page
    .getByRole("button", { name: /保存文件.*下载文字与所选附件/ })
    .click();
  const download = page.waitForEvent("download");
  await page.locator(".share-dialog .dialog-bottom button.primary").click();
  await download;
  await page.keyboard.press("Escape");
  await page.locator("#session-view .session-more > summary").click();
  await page.getByRole("button", { name: "分享记录", exact: true }).click();
  const row = page
    .locator(".share-history-row")
    .filter({ hasText: "已开始下载文件" })
    .first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(
    page.locator(".share-history-dialog .share-preview"),
  ).toContainText("我们应该怎样组织界面和数据");
});

test("shared page chrome keeps one title and one application menu across surfaces", async ({ page }) => {
  for (const panel of [false, true]) {
    await page.setViewportSize({ width: panel ? 390 : 1280, height: 780 });
    for (const route of ["/collect", "/library", "/thoughts", "/settings", "/notes/BBBBBBBB-BBBB-4BBB-8BBB-000000000001"]) {
      await page.goto(route + (panel ? "?panel=1" : "?native=1"));
      const title = page.locator(panel ? "main h1, main .session-top h2" : "#window-page-heading h1, #window-page-heading h2").first();
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS("font-size", panel ? "20px" : "14px");
      await expect(title).toHaveCSS("font-weight", "500");
      const menus = page.getByLabel("更多应用操作", { exact: true }).filter({ visible: true });
      await expect(menus).toHaveCount(1);
      await menus.click();
      await expect(page.getByRole("button", { name: "分享记录", exact: true }).filter({ visible: true })).toHaveCount(1);
      await page.keyboard.press("Escape");
      const content = page.locator(".workspace.route-scroll, .reading, .settings-content, .session-messages").first();
      await expect(content).toHaveCSS("padding-left", panel ? "16px" : "20px");
      await expect(content).toHaveCSS("padding-right", panel ? "16px" : "20px");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/unified-${panel ? "panel" : "desktop"}-${route.split("/")[1]}-${test.info().project.name}.png`, animations: "disabled" });
    }
  }
});
