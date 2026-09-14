import { test, expect } from "@playwright/test";

test("About explains browser availability without offering a fake updater", async ({ page }) => {
  await page.goto("/settings?section=about");
  await expect(page.getByRole("button", { name: "关于", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("请在新版 Threadline Mac 程序中检查和安装更新")).toBeVisible();
  await expect(page.getByRole("button", { name: "检查更新", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "通用", exact: true }).click();
  await expect(page.getByLabel("界面语言")).toBeVisible();
});

test("native About checks, shows release notes, persists preference and installs", async ({ page }) => {
  await page.addInitScript(() => {
    let automatic = false;
    window.webkit = { messageHandlers: { updates: { postMessage(value: unknown) {
      const body = value as { action: string; enabled?: boolean };
      if (body.action === "automatic") automatic = !!body.enabled;
      const detail = { nativeVersion: "0.0.2", nativeBuild: "7", version: "0.0.2", configured: true, automatic,
        state: body.action === "check" ? "available" : body.action === "install" ? "installing" : "idle",
        ...(body.action === "check" ? { release: { version: "0.0.3", size: 1048576, notes: "更清楚的设置页面\n修复连接问题" } } : {}),
      };
      window.dispatchEvent(new CustomEvent("threadline-updates", { detail }));
    } } } };
  });
  await page.goto("/settings?section=about&native=1");
  await expect(page.getByText("0.0.2 (7)")).toBeVisible();
  await page.getByRole("button", { name: "通用", exact: true }).click();
  await expect(page).toHaveURL(/native=1/);
  await page.getByRole("button", { name: "关于", exact: true }).click();
  await expect(page).toHaveURL(/native=1/);
  await page.getByRole("switch", { name: "自动检查更新" }).check();
  await expect(page.getByRole("switch", { name: "自动检查更新" })).toBeChecked();
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(page.getByText("发现新版本 0.0.3")).toBeVisible();
  await page.getByText("更新说明", { exact: true }).click();
  await expect(page.getByText("更清楚的设置页面")).toBeVisible();
  await expect.poll(() => page.locator(".about-identity img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: `artifacts/about-updates-${test.info().project.name}.png` });
  await page.getByRole("button", { name: "下载并更新" }).click();
  await expect(page.getByRole("status")).toContainText("正在下载并安装更新");
  await expect(page.getByRole("button", { name: "检查更新", exact: true })).toBeDisabled();
});

test("unconfigured native build does not claim to be current", async ({ page }) => {
  await page.addInitScript(() => {
    window.webkit = { messageHandlers: { updates: { postMessage() {
      window.dispatchEvent(new CustomEvent("threadline-updates", { detail: { state: "idle", configured: false, version: "0.0.2", nativeVersion: "0.0.2", nativeBuild: "7" } }));
    } } } };
  });
  await page.goto("/settings?section=about&native=1");
  await expect(page.getByText("此版本尚未配置在线更新")).toBeVisible();
  await expect(page.getByRole("button", { name: "检查更新", exact: true })).toBeDisabled();
});
