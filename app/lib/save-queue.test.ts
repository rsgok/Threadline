import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaveQueue } from "./save-queue.ts";

test("serializes writes, coalesces intermediate drafts, and advances versions", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: [string, string][] = [];
  const queue = createSaveQueue(
    "v1",
    async (draft: string, version) => {
      writes.push([draft, version]);
      if (writes.length === 1) await gate;
      return { version: "v" + (writes.length + 1) };
    },
    () => {},
  );
  queue.push("one");
  const first = queue.flush();
  queue.push("two");
  queue.push("three");
  assert.equal(queue.flush(), first);
  release();
  await first;
  assert.deepEqual(writes, [
    ["one", "v1"],
    ["three", "v2"],
  ]);
  assert.equal(queue.dirty, false);
});
test("failed in-flight write retains the newest draft and last confirmed version", async () => {
  let fail!: (reason: Error) => void;
  const pending = new Promise<{ version: string }>((_, reject) => {
    fail = reject;
  });
  let attempt = 0;
  const writes: [string, string][] = [];
  const queue = createSaveQueue(
    "v1",
    async (draft: string, version) => {
      writes.push([draft, version]);
      return ++attempt === 1 ? pending : { version: "v2" };
    },
    () => {},
  );
  queue.push("old");
  const first = queue.flush();
  queue.push("new");
  fail(new Error("offline"));
  await assert.rejects(first, /offline/);
  assert.equal(queue.dirty, true);
  await queue.flush();
  assert.deepEqual(writes, [
    ["old", "v1"],
    ["new", "v1"],
  ]);
  assert.equal(queue.dirty, false);
});
