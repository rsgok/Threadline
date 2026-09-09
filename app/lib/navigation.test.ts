import { test } from "node:test";
import assert from "node:assert/strict";
import { surfacePath, entryPath } from "./navigation.ts";
test("route navigation preserves native surface without carrying old selections", () => {
  assert.equal(
    surfacePath("/library?scope=inbox", "?native=1&thread=old&panel=1"),
    "/library?scope=inbox&native=1&panel=1",
  );
  assert.equal(
    entryPath(new URL("http://localhost/?native=1&thread=abc&runtime=cursor")),
    "/collect/cursor/abc?native=1",
  );
  assert.equal(
    entryPath(new URL("http://localhost/?workspace=note&note=abc&panel=1")),
    "/notes/abc?panel=1",
  );
});
