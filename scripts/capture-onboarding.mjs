// Rebuild the bundled tour images from real UI with fictional fixtures only.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const port = 43158;
const server = spawn(process.execPath, ["Tests/ui-server.mjs"], {
  env: { ...process.env, THREADLINE_TEST_PORT: String(port), THREADLINE_TOUR_FIXTURE: "1" }, stdio: "inherit",
});
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    if (attempt > 100) throw Error("Fixture server did not start");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 540 }, deviceScaleFactor: 2, locale: "zh-CN" });
  const folder = "web/assets/onboarding";
  await mkdir(folder, { recursive: true });
  const go = route => page.goto(`http://127.0.0.1:${port}${route}?panel=1`);
  const shot = async name => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${folder}/${name}.png`, animations: "disabled" });
  };
  await go("/collect/codex/11111111-1111-4111-8111-000000000001");
  await page.locator(".message-select").first().click();
  await shot("collect");
  await go("/thoughts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await page.locator(".thought-event").first().waitFor();
  await shot("organize");
  await go("/notes/BBBBBBBB-BBBB-4BBB-8BBB-000000000001");
  await page.getByRole("button", { name: "使用对话 ↗", exact: true }).click();
  await page.locator("#carry-task").fill("结合已有讨论，整理下一版产品的设计重点");
  await shot("continue");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
