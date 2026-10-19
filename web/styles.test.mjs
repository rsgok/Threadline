import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The interface stylesheets grew rules for a server-rendered layout that no
// longer exists. A budget keeps the shipped CSS from carrying them again.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesheets = [
  "web/threadline.css",
  "web/buttons.css",
  "app/base.css",
  "app/app.css",
  "web/sharing.css",
  "web/feishu.css",
];

test("the shipped stylesheets stay within their size budget", () => {
  const budget = 90 * 1024;
  for (const file of stylesheets) {
    const size = fs.statSync(path.join(root, file)).size;
    assert.ok(
      size < budget,
      `${file} is ${(size / 1024).toFixed(1)} KB, over the ${budget / 1024} KB budget`,
    );
  }
});

test("the stylesheets parse and keep their braces balanced", () => {
  for (const file of stylesheets) {
    const css = fs.readFileSync(path.join(root, file), "utf8");
    const open = (css.match(/\{/g) || []).length;
    const close = (css.match(/\}/g) || []).length;
    assert.equal(open, close, `${file} has unbalanced braces`);
  }
});
