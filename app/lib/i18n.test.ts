import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  initializeLanguage,
  setLanguage,
  getLocale,
  getLanguage,
  t,
  translateError,
  count,
} from "./i18n.ts";
import { english } from "./catalog.ts";
function setup(language = "en-US", saved?: string, blocked = false) {
  const storage = new Map(saved ? [["threadline-language", saved]] : []);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language },
  });
  Object.assign(globalThis, {
    window: {},
    document: { documentElement: {} },
    localStorage: {
      getItem: (key: string) => {
        if (blocked) throw Error("blocked");
        return storage.get(key);
      },
      setItem: (key: string, value: string) => {
        if (blocked) throw Error("blocked");
        storage.set(key, value);
      },
    },
  });
  initializeLanguage();
  return storage;
}
test("language persistence, system fallback, and blocked storage", () => {
  setup("zh-TW");
  assert.equal(getLocale(), "zh-CN");
  setup("fr-FR");
  assert.equal(getLocale(), "en");
  const storage = setup("zh-CN", "en");
  assert.equal(getLocale(), "en");
  setLanguage("zh-CN");
  assert.equal(storage.get("threadline-language"), "zh-CN");
  setup("en", "invalid");
  assert.equal(getLanguage(), "system");
  setup("zh-CN", undefined, true);
  assert.throws(() => setLanguage("en"));
  assert.equal(getLocale(), "zh-CN");
});
test("translation preserves embedded source text and plural rules", () => {
  setup();
  const title = "我的思路 <code>{1}</code> $&";
  assert.equal(
    t`目标：${title} · 频道 ${"中文"}`,
    "Destination: " + title + " · Channel 中文",
  );
  assert.equal(
    translateError("附件超过 25 MB 上限"),
    "Attachment exceeds the 25 MB limit",
  );
  assert.equal(
    translateError("HTTP 503: vendor diagnostic"),
    "HTTP 503: vendor diagnostic",
  );
  assert.equal(count(1), "1 message");
  assert.equal(count(2), "2 messages");
});
test("English catalog covers direct React UI calls and preserves placeholders", () => {
  for (const file of fs
    .readdirSync(new URL("../", import.meta.url), { recursive: true })
    .filter((file) => String(file).endsWith(".tsx"))) {
    const source = fs.readFileSync(
      new URL("../" + file, import.meta.url),
      "utf8",
    );
    for (const match of source.matchAll(
      /\bt\(((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))\)/g,
    )) {
      const key = vm.runInNewContext(match[1]);
      assert.ok(Object.hasOwn(english, key), `${file}: missing ${key}`);
    }
  }
  for (const [source, translated] of Object.entries(english)) {
    assert.ok(translated.trim());
    assert.deepEqual(
      [...source.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
      [...translated.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
      source,
    );
  }
});
