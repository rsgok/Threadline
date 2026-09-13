import { test, expect } from "@playwright/test";

for (const mode of ["native", "panel"]) {
  test(`conversation organization survives navigation and reload in ${mode}`, async ({
    page,
  }) => {
    await page.request.post("/api/sessions/organization", {
      headers: { "X-Rewind-Request": "1" },
      data: {
        action: "pin",
        keys: ["codex:11111111-1111-4111-8111-000000000001"],
        pinned: false,
      },
    });
    await page.setViewportSize({
      width: mode === "panel" ? 390 : 1100,
      height: 800,
    });
    await page.goto(`/collect?${mode}=1`);
    await expect(page.locator(".conversation-bottom")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "紧凑", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "搜索本机会话" })
      .fill("界面架构讨论");
    const select = page.getByRole("button", {
      name: "选中：界面架构讨论",
      exact: true,
    });
    await select.click();
    await page
      .locator(".conversation-bottom")
      .getByRole("button", { name: "标签", exact: true })
      .click();
    const tag = `验证-${mode}`;
    await page.getByRole("textbox", { name: "新标签名称" }).fill(tag);
    await page.getByRole("button", { name: "淡紫", exact: true }).click();
    await page.getByRole("button", { name: "创建并添加" }).click();
    await expect(
      page
        .locator(".conversation-tag-editor")
        .getByRole("button", { name: tag + " ✓", exact: true }),
    ).toHaveClass(/tag-purple/);
    await page
      .locator(".conversation-bottom")
      .getByRole("button", { name: "置顶", exact: true })
      .click();
    await expect(
      page
        .locator(".conversation-bottom")
        .getByRole("button", { name: "取消置顶" }),
    ).toBeVisible();
    await page
      .locator(".conversation-bottom")
      .getByRole("button", { name: "取消", exact: true })
      .click();
    await expect(page.locator(".conversation-bottom")).toHaveCount(0);
    await page.reload();
    await page.getByLabel("标签筛选", { exact: true }).selectOption(tag);
    await expect(page.locator(".session-choice")).toHaveCount(1);
    await page.locator(".session-choice").click();
    await expect(page).toHaveURL(new RegExp(`/collect/codex/.*${mode}=1`));
    await page.goBack();
    await expect(page.locator(".conversation-bottom")).toHaveCount(0);
    await expect(page.locator(".sidebar")).toBeAttached();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
  });
}
