import { test, expect } from "@playwright/test";

// The interface palette lives in one place, so the light and dark appearances
// stay in step and a colour can be changed in a single place.
test("the interface follows the system appearance", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/thoughts?native=1");
  await expect(page.getByRole("heading", { name: "我的思路" })).toBeVisible();

  const dark = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const read = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return { body: body.backgroundColor, ink: body.color, surface: read("--surface") };
  });
  // A dark appearance paints a dark page with light text.
  expect(dark.body).toBe("rgb(26, 27, 24)");
  expect(dark.ink).toBe("rgb(236, 238, 231)");
  expect(dark.surface).toBe("#1a1b18");

  await page.emulateMedia({ colorScheme: "light" });
  const light = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { body: body.backgroundColor, ink: body.color };
  });
  expect(light.body).toBe("rgb(252, 252, 250)");
  expect(light.ink).toBe("rgb(25, 25, 23)");
});

test("the note scope names notes and stays readable", async ({ page }) => {
  await page.goto("/thoughts?native=1");
  const scope = page.locator(".native-scope");
  await expect(scope).toBeVisible();
  // It filters notes, so it must not claim to filter conversations.
  await expect(scope.locator("option").first()).toHaveText("全部笔记");
  // The label is never clipped.
  const clipped = await scope.evaluate(
    (el) => el.scrollWidth > el.clientWidth + 1,
  );
  expect(clipped).toBe(false);
});

test("the panel navigation marks the current view", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 780 });
  await page.goto("/thoughts?panel=1");
  const nav = page.locator(".panel-navigation");
  await expect(nav.getByRole("button", { name: "我的思路" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("button", { name: "对话" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  // A narrow panel must not push its last control past the edge.
  const overflow = await page.locator(".panel-header").evaluate(
    (el) => el.scrollWidth > el.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});

test("the interface never renders text below a readable size", async ({ page }) => {
  await page.goto("/thoughts?native=1");
  await page.waitForTimeout(800);
  const smallest = await page.evaluate(() => {
    let size = 99;
    for (const el of document.querySelectorAll("*")) {
      if (!el.textContent?.trim() || el.children.length) continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) continue;
      const value = parseFloat(getComputedStyle(el).fontSize);
      if (value < size) size = value;
    }
    return size;
  });
  // 9 and 10 pixel text is a blur at normal viewing distance.
  expect(smallest).toBeGreaterThanOrEqual(11);
});

test("the appearance can be chosen in Settings", async ({ page }) => {
  await page.goto("/settings?native=1");
  const choice = page.getByLabel("界面外观");
  await expect(choice).toBeVisible();
  await expect(choice).toHaveValue("system");

  // A dark choice paints a dark page, even while the system is light.
  await choice.selectOption("dark");
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(26, 27, 24)");

  // A light choice paints a light page, even while the system is dark.
  await page.emulateMedia({ colorScheme: "dark" });
  await choice.selectOption("light");
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(252, 252, 250)");

  // The choice is kept, so it survives a reload.
  await page.emulateMedia({ colorScheme: "light" });
  await choice.selectOption("dark");
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(26, 27, 24)");
});
