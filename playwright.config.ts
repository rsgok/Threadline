import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./Tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:43149",
    locale: "zh-CN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node Tests/ui-server.mjs",
    url: "http://127.0.0.1:43149/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
