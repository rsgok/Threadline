import { test, expect } from "@playwright/test";

const id = "22222222-2222-4222-8222-222222222222";
for (const [runtime, name] of [["claude", "Claude Code"], ["pi", "Pi"], ["deepseek", "DeepSeek Harness"]]) {
  test(`${name}: discover, select, collect and return to the exact source in App and Sidecar`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/collect?native=1");
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    await page.getByRole("combobox", { name: "按 Runtime 筛选会话" }).selectOption(runtime);
    await expect(page.locator(".session-choice")).toHaveCount(1);
    await page.locator(".session-choice").click();
    await expect(page).toHaveURL(new RegExp(`/collect/${runtime}/${id}\\?native=1$`));
    await expect(page.locator(".message-card")).toHaveCount(2);
    await expect(page.locator(".message-assistant .message-role")).toContainText(name);
    await expect(page.locator(".message-card")).not.toContainText(["private", "abandoned"]);
    expect(await page.locator("img.message-avatar").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.locator(".message-select").last().click();
    await page.locator("#save-session").click();
    await expect(page.locator("dialog[open] .dialog-inner")).toBeVisible();
    await page.screenshot({ animations: "disabled", path: `artifacts/${runtime}-collect-dialog-${test.info().project.name}.png` });
    await page.locator("#confirm-save-session").click();
    await page.getByRole("button", { name: "查看笔记 →" }).click();
    await expect(page.locator("#edit-title")).toHaveValue(name + " 架构讨论");
    await expect(page.locator(".note-body, .article").first()).toContainText("保留原文和自己的判断");
    await page.goto(`/?runtime=${runtime}&thread=${id}&panel=1`);
    await expect(page).toHaveURL(new RegExp(`/collect/${runtime}/${id}\\?panel=1$`));
    await expect(page.locator(".message-assistant .message-saved-tag")).toHaveText("已记录");
    await page.setViewportSize({ width: 390, height: 780 });
    await page.screenshot({ animations: "disabled", path: `artifacts/${runtime}-sidecar-${test.info().project.name}.png` });
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    expect(errors).toEqual([]);
  });
}
