import { test } from "node:test";
import assert from "node:assert/strict";

function setup(saved?: string, prefersDark = false) {
  const storage = new Map(saved ? [["threadline-appearance", saved]] : []);
  let listener: (() => void) | null = null;
  const media = {
    matches: prefersDark,
    addEventListener: (_: string, fn: () => void) => { listener = fn; },
  };
  Object.assign(globalThis, {
    window: {
      matchMedia: () => media,
      webkit: undefined,
    },
    document: { documentElement: { dataset: {} as Record<string, string>, style: {} as Record<string, string> } },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  return { storage, media, listener: () => listener?.() };
}

// The module keeps its own state, so each case loads it afresh.
async function load() {
  return import(`./appearance.ts?case=${Math.random()}`);
}

test("the appearance follows the system until the user chooses", async () => {
  const { storage } = setup();
  const { initializeAppearance, getAppearance, setAppearance } = await load();
  initializeAppearance();
  assert.equal(getAppearance(), "system");
  // A system preference is left to the stylesheet.
  assert.equal(globalThis.document.documentElement.dataset.appearance, undefined);
  assert.equal(globalThis.document.documentElement.style.colorScheme, "light");

  setAppearance("dark");
  assert.equal(storage.get("threadline-appearance"), "dark");
  assert.equal(globalThis.document.documentElement.dataset.appearance, "dark");
  assert.equal(globalThis.document.documentElement.style.colorScheme, "dark");
});

test("a saved choice wins over the system", async () => {
  setup("dark", false);
  const { initializeAppearance, getAppearance } = await load();
  initializeAppearance();
  assert.equal(getAppearance(), "dark");
  assert.equal(globalThis.document.documentElement.dataset.appearance, "dark");
});

test("a light choice wins over a dark system", async () => {
  setup("light", true);
  const { initializeAppearance, getAppearance } = await load();
  initializeAppearance();
  assert.equal(getAppearance(), "light");
  assert.equal(globalThis.document.documentElement.dataset.appearance, "light");
});

test("a system that turns dark is followed while the choice is system", async () => {
  const { media, listener } = setup();
  const { initializeAppearance } = await load();
  initializeAppearance();
  assert.equal(globalThis.document.documentElement.style.colorScheme, "light");
  media.matches = true;
  listener();
  assert.equal(globalThis.document.documentElement.style.colorScheme, "dark");
});

test("an unknown saved value falls back to the system", async () => {
  setup("chartreuse", false);
  const { initializeAppearance, getAppearance } = await load();
  initializeAppearance();
  assert.equal(getAppearance(), "system");
  assert.equal(globalThis.document.documentElement.dataset.appearance, undefined);
});
