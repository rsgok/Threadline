import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { serveFrontend } from "./frontend.mjs";

test("SPA deep links, immutable assets, HEAD, missing APIs, and containment", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadline-static-"),
  );
  fs.mkdirSync(path.join(directory, "assets"));
  fs.writeFileSync(path.join(directory, "index.html"), "<html>app</html>");
  fs.writeFileSync(path.join(directory, "assets/app-abcdefgh.js"), "export{}");
  fs.symlinkSync("/etc/hosts", path.join(directory, "assets/escape.js"));
  const server = http.createServer((req, res) => {
    if (
      !serveFrontend(req, res, new URL(req.url, "http://localhost"), directory)
    ) {
      res.writeHead(404);
      res.end("missing");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const root = `http://127.0.0.1:${server.address().port}`;
  for (const route of [
    "/",
    "/notes/abc",
    "/collect/codex/abc?native=1",
    "/thoughts/abc",
    "/settings",
  ]) {
    const response = await fetch(root + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "<html>app</html>");
  }
  const asset = await fetch(root + "/assets/app-abcdefgh.js");
  assert.match(asset.headers.get("cache-control"), /immutable/);
  const head = await fetch(root + "/library", { method: "HEAD" });
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("content-length"), "16");
  for (const route of [
    "/api/missing",
    "/assets/missing.js",
    "/assets/escape.js",
    "/assets/%2e%2e%2f%2e%2e%2fsecret.js",
  ])
    assert.equal((await fetch(root + route)).status, 404);
  fs.unlinkSync(path.join(directory, "index.html"));
  assert.equal((await fetch(root + "/library")).status, 503);
});
