import { english } from "./catalog.ts";
import type { Language, Locale } from "./types.ts";

const supported = new Set<Language>(["system", "zh-CN", "en"]);
let preference: Language = "system";
let locale: Locale = "en";
export function initializeLanguage() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("threadline-language");
  } catch {
    /* system fallback */
  }
  preference = supported.has(saved as Language)
    ? (saved as Language)
    : "system";
  locale =
    preference === "system"
      ? /^zh/i.test(navigator.language)
        ? "zh-CN"
        : "en"
      : preference;
  document.documentElement.lang = locale;
  window.webkit?.messageHandlers?.language?.postMessage({ preference, locale });
}
export function getLocale() {
  return locale;
}
export function getLanguage() {
  return preference;
}
export function setLanguage(value: Language) {
  if (!supported.has(value)) throw new Error("Unsupported language");
  localStorage.setItem("threadline-language", value);
  initializeLanguage();
}
export function t(
  message: string | TemplateStringsArray,
  ...values: (string | number)[]
): string {
  const source =
    typeof message === "string"
      ? message
      : message
          .map(
            (part, index) => part + (index < values.length ? `{${index}}` : ""),
          )
          .join("");
  const translated = locale === "en" ? (english[source] ?? source) : source;
  return typeof message === "string"
    ? translated
    : translated.replace(/\{(\d+)\}/g, (match, index: string) =>
        Number(index) < values.length ? String(values[Number(index)]) : match,
      );
}
export function tr(zh: string, en: string) {
  return locale === "en" ? en : zh;
}
export function translateError(source: string) {
  if (locale !== "en") return source;
  if (english[source]) return english[source];
  for (const [key, translation] of Object.entries(english)) {
    if (!/\{\d+\}/.test(key)) continue;
    const indexes: string[] = [];
    const pattern = key
      .split(/(\{\d+\})/)
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          indexes.push(part.slice(1, -1));
          return "([\\s\\S]*?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    const match = new RegExp("^" + pattern + "$").exec(source);
    if (match) {
      const values = Object.fromEntries(
        indexes.map((index, i) => [index, match[i + 1]]),
      );
      return translation.replace(
        /\{(\d+)\}/g,
        (token, index: string) => values[index] ?? token,
      );
    }
  }
  return source;
}
export function count(
  value: number,
  kind: "message" | "note" | "attachment" = "message",
) {
  const nouns = {
    message: ["条消息", "message", "messages"],
    note: ["篇笔记", "note", "notes"],
    attachment: ["个附件", "attachment", "attachments"],
  };
  const words = nouns[kind];
  return locale === "en"
    ? `${value} ${words[value === 1 ? 1 : 2]}`
    : `${value} ${words[0]}`;
}
