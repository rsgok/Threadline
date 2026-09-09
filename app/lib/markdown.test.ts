import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./markdown.ts";
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
