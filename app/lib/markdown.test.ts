import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./markdown.ts";
test("local image and file paths survive resource URL encoding exactly once", () => {
  for (const path of [
    "/Users/kai/Library/Application Support/RewindWeb/session-assets/image.png",
    "/tmp/中文 图片.png",
    "/tmp/literal%20name.png",
    "/tmp/100% complete.png",
  ]) {
    const html = renderMarkdown(`![image](<${path}>)\n\n[file](<${path}>)`, {
      thread: "thread-id",
    });
    for (const attribute of ["src", "href", "data-local-url"]) {
      const value = html.match(new RegExp(`${attribute}="([^"]+)"`))?.[1];
      assert.ok(value);
      const url = new URL(value.replaceAll("&amp;", "&"), "http://localhost");
      assert.equal(url.searchParams.get("path"), path);
      assert.equal(url.searchParams.get("thread"), "thread-id");
    }
  }
});
test("renders code and tables while preventing source HTML and script links", () => {
  const html = renderMarkdown(
    "<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
  );
  assert.doesNotMatch(html, /<script|href="javascript/);
  assert.match(html, /<table>/);
});
test("local attachments retain authorization context and external links are isolated", () => {
  const html = renderMarkdown(
    "![image](/tmp/a.png)\n\n[file](/tmp/a.txt)\n\n[web](https://example.com)",
    { clip: "note-id" },
  );
  assert.match(
    html,
    /api\/local-resource\?path=%2Ftmp%2Fa.png&amp;clip=note-id/,
  );
  assert.match(html, /data-local-url=/);
  assert.match(html, /rel="noopener noreferrer"/);
});
