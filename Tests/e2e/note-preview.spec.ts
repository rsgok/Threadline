import { test, expect } from "@playwright/test";

// A collected conversation is stored as Markdown with role headings such as
// "### 我的问题 · 2026-09-10T04:00:00 UTC". The list preview must show the
// conversation itself, not that markup.
test("the note preview shows the conversation instead of its markup", async ({
  page,
}) => {
  const body = [
    "### 我的问题 · 2026-09-10T04:00:00 UTC",
    "",
    "我们应该怎样组织界面和数据？",
    "",
    "---",
    "",
    "### AI 回答 · 2026-09-10T04:00:01 UTC",
    "",
    "采用共享组件，让界面保持一致。",
  ].join("\n");
  const created = await page.request.post("/api/clips", {
    headers: { "X-Rewind-Request": "1", "Content-Type": "application/json" },
    data: { body, source: "Codex" },
  });
  expect(created.status()).toBe(201);

  await page.goto("/thoughts?native=1");
  const excerpt = page.locator(".native-note-excerpt").first();
  await expect(excerpt).toBeVisible();
  const text = (await excerpt.innerText()).trim();
  expect(text).toContain("我们应该怎样组织界面和数据？");
  expect(text).not.toContain("我的问题");
  expect(text).not.toContain("AI 回答");
  expect(text).not.toContain("2026-09-10");
  expect(text).not.toContain("---");
});

test("the note preview keeps table rows and code examples", async ({ page }) => {
  const body = [
    "方案对比",
    "",
    "| 方案 | 说明 |",
    "| --- | --- |",
    "| React | 组件复用 |",
    "",
    "```md",
    "### AI 回答",
    "```",
  ].join("\n");
  const created = await page.request.post("/api/clips", {
    headers: { "X-Rewind-Request": "1", "Content-Type": "application/json" },
    data: { body, source: "Codex" },
  });
  expect(created.status()).toBe(201);

  await page.goto("/thoughts?native=1");
  const excerpt = page.locator(".native-note-excerpt").first();
  await expect(excerpt).toBeVisible();
  const text = (await excerpt.innerText()).trim();
  // A table row is content, not structure.
  expect(text).toContain("组件复用");
  // A heading inside a code example is part of the example.
  expect(text).toContain("AI 回答");
});
