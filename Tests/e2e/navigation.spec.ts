import { test, expect } from "@playwright/test";
const thread = "11111111-1111-4111-8111-000000000001";

test("persistent window navigation tracks back, forward, reload and a new branch", async ({
  page,
}) => {
  await page.goto("/collect?native=1");
  const back = page
    .getByRole("button", { name: "后退", exact: true })
    .filter({ visible: true });
  const forward = page
    .getByRole("button", { name: "前进", exact: true })
    .filter({ visible: true });
  const toggle = page.getByRole("button", { name: "切换导航栏" });
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();
  const initial = await toggle.boundingBox();
  for (let i = 0; i < 4; i++) {
    await toggle.click();
    expect(await toggle.boundingBox()).toEqual(initial);
  }
  await page.getByRole("textbox", { name: "搜索本机会话" }).fill("界面架构讨论");
  await page.locator(".session-choice").filter({ hasText: "界面架构讨论" }).click();
  await expect(page.locator(".conversation-title")).toHaveText("界面架构讨论");
  expect((await page.locator(".conversation-title").boundingBox())!.y).toBeLessThan(
    60,
  );
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();
  await back.click();
  await expect(page).toHaveURL(/\/collect\?native=1$/);
  await expect(back).toBeDisabled();
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(page).toHaveURL(new RegExp(thread));
  await page.reload();
  await expect(back).toBeEnabled();
  await back.click();
  await expect(forward).toBeEnabled();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "我的思路", exact: true })
    .click();
  await expect(page).toHaveURL(/\/thoughts/);
  await expect(forward).toBeDisabled();
  await back.click();
  await expect(page).toHaveURL(/\/collect\?native=1$/);
  await forward.click();
  await expect(page).toHaveURL(/\/thoughts/);
  await toggle.click();
  await page.screenshot({
    path: `artifacts/navigation-${test.info().project.name}.png`,
  });
});

test("deep links and panel navigation stay within known app history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`/collect/codex/${thread}?panel=1`);
  const back = page
    .getByRole("button", { name: "后退", exact: true })
    .filter({ visible: true });
  const forward = page
    .getByRole("button", { name: "前进", exact: true })
    .filter({ visible: true });
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();
  await page
    .locator(".panel-header")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await back.click();
  await expect(page.locator(".conversation-title")).toBeVisible();
  await expect(forward).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("long conversations retain measured card heights and DOM while scrolling and polling", async ({
  page,
}) => {
  await page.route(`**/api/codex/sessions/${thread}*`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.session.messages = Array.from({ length: 100 }, (_, i) => ({
      ...data.session.messages[i % 2],
      id: `long-${i}`,
      text:
        i % 2
          ? "# Discussion\n\n" + "Paragraph with stable content.\n\n".repeat(40)
          : "Short question",
    }));
    await route.fulfill({ json: data });
  });
  await page.goto(`/collect/codex/${thread}?native=1`);
  await expect(page.locator(".message-card")).toHaveCount(100);
  const metrics = await page.locator(".session-messages").evaluate((el) => {
    const cards = Array.from(el.querySelectorAll(".message-card"));
    (window as any).__auditCard = cards[0];
    return {
      height: el.scrollHeight,
      top: el.scrollTop,
      client: el.clientHeight,
      cards: cards.map((card) => card.getBoundingClientRect().height),
    };
  });
  expect(metrics.top).toBeGreaterThan(metrics.height - metrics.client - 2);
  await page.locator(".session-messages").evaluate((el) => {
    el.scrollTop = 500;
  });
  await expect
    .poll(() =>
      page.locator(".session-messages").evaluate((el) => el.scrollTop),
    )
    .toBe(500);
  // Wait for a real refresh response, then inspect the retained layout and DOM.
  await page.waitForResponse((response) =>
    response.url().includes(`/api/codex/sessions/${thread}`),
  );
  const after = await page.locator(".session-messages").evaluate((el) => ({
    height: el.scrollHeight,
    top: el.scrollTop,
    cards: Array.from(el.querySelectorAll(".message-card")).map(
      (card) => card.getBoundingClientRect().height,
    ),
    retained: (window as any).__auditCard === el.querySelector(".message-card"),
    visibility: getComputedStyle(el.querySelector(".message-card")!)
      .contentVisibility,
  }));
  expect(after.height).toBe(metrics.height);
  expect(after.cards).toEqual(metrics.cards);
  expect(after.top).toBe(500);
  expect(after.retained).toBe(true);
  expect(after.visibility).toBe("visible");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page.getByRole("heading", { name: "设置", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "后退", exact: true })
    .filter({ visible: true })
    .click();
  await expect
    .poll(() =>
      page.locator(".session-messages").evaluate((el) => el.scrollTop),
    )
    .toBe(500);
});
