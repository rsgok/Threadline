import { test, expect } from "@playwright/test";

// A dark appearance must not leave a light surface behind. The markdown body
// and the shared modal used to keep their own colours, so a table header and
// an inline code span stayed light.
test("nothing keeps a light surface in a dark appearance", async ({ page }) => {
  const lib = await (await page.request.get("/api/library", { headers: { "X-Rewind-Request": "1" } })).json();
  const clip = lib.clips.find((c: { body?: string }) => (c.body || "").includes("|")) || lib.clips[0];
  expect(clip).toBeTruthy();

  await page.emulateMedia({ colorScheme: "dark" });
  const surfaces = [
    "/thoughts?native=1",
    "/collect?native=1",
    "/settings?native=1",
    `/notes/${clip.id}?native=1`,
  ];

  const offenders: string[] = [];
  for (const url of surfaces) {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const found = await page.evaluate(() => {
      const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const parse = (value: string) => {
        const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      };
      const out: string[] = [];
      const walk = (el: Element) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          const bg = parse(style.backgroundColor);
          const fg = parse(style.color);
          const name = el.tagName + "." + (el.className || "").toString().split(" ").filter(Boolean)[0];
          if (bg && bg.a > 0.5 && lum(bg.r, bg.g, bg.b) > 0.62) out.push(name);
          if (bg && fg && lum(bg.r, bg.g, bg.b) > 0.5 && lum(fg.r, fg.g, fg.b) < 0.32) out.push(name);
          // A block that paints a light fill of its own, such as a code block.
          const fill = parse(style.getPropertyValue("background-color"));
          if (fill && fill.a > 0.5 && lum(fill.r, fill.g, fill.b) > 0.62) out.push(name);
        }
        for (const child of el.children) walk(child);
      };
      walk(document.body);
      return [...new Set(out)];
    });
    found.forEach((f) => offenders.push(url + " -> " + f));
  }
  expect(offenders, offenders.join("\n")).toEqual([]);
});

test("a table header and an inline code span follow the appearance", async ({ page }) => {
  // A note with a table and an inline code span, so the check does not depend
  // on what the library happens to hold.
  const body = [
    "| Layer | Responsibility |",
    "| --- | --- |",
    "| Shell | The window |",
    "",
    "The shell loads `http://127.0.0.1` for the page.",
  ].join("\n");
  const created = await page.request.post("/api/clips", {
    headers: { "X-Rewind-Request": "1", "Content-Type": "application/json" },
    data: { body, source: "Codex" },
  });
  expect(created.status()).toBe(201);
  const clip = (await created.json()).clip;

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/notes/${clip.id}?native=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  const read = () =>
    page.evaluate(() => {
      const head = document.querySelector("table th");
      const code = document.querySelector("article code, .article code, .note-rich-content code");
      const lum = (value: string) => {
        const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return -1;
        return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
      };
      return {
        head: head ? getComputedStyle(head).backgroundColor : "",
        code: code ? getComputedStyle(code).backgroundColor : "",
        headLum: head ? lum(getComputedStyle(head).backgroundColor) : -1,
        codeLum: code ? lum(getComputedStyle(code).backgroundColor) : -1,
      };
    });

  const dark = await read();
  expect(dark.head, "a table header is needed").not.toBe("");
  expect(dark.headLum, "the table header must not be light in a dark appearance").toBeLessThan(0.6);
  expect(dark.codeLum, "inline code must not be light in a dark appearance").toBeLessThan(0.6);

  await page.emulateMedia({ colorScheme: "light" });
  const light = await read();
  expect(light.headLum, "the table header stays light in a light appearance").toBeGreaterThan(0.6);
});
