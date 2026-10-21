import type { Locale, Language } from "./types.ts";

// The interface follows the system appearance by default. A saved preference
// overrides it, so the choice survives a restart and travels with the Mac
// app the same way the language preference does.
export type Appearance = "system" | "light" | "dark";

const supported = new Set<Appearance>(["system", "light", "dark"]);
const storageKey = "threadline-appearance";

let preference: Appearance = "system";

function saved(): Appearance {
  try {
    const value = localStorage.getItem(storageKey);
    return supported.has(value as Appearance) ? (value as Appearance) : "system";
  } catch {
    return "system";
  }
}

// The appearance is applied to the document, so the stylesheets can offer a
// dark palette without the interface having to know which one is in use.
// A "system" preference is left to the stylesheet, so the system stays in
// charge while the app is open.
export function applyAppearance(value: Appearance) {
  preference = supported.has(value) ? value : "system";
  const root = document.documentElement;
  if (preference === "system") {
    delete root.dataset.appearance;
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    root.style.colorScheme = dark ? "dark" : "light";
  } else {
    root.dataset.appearance = preference;
    root.style.colorScheme = preference === "dark" ? "dark" : "light";
  }
}

export function initializeAppearance() {
  applyAppearance(saved());
  // A system appearance that changes while the app is open is followed.
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => {
      if (preference === "system") applyAppearance("system");
    });
  window.webkit?.messageHandlers?.appearance?.postMessage({ preference });
}

export function getAppearance() {
  return preference;
}

export function setAppearance(value: Appearance) {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* the choice lasts for this session only */
  }
  applyAppearance(value);
  window.webkit?.messageHandlers?.appearance?.postMessage({ preference: value });
}

export type { Locale, Language };
