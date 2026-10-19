// Removes stylesheets rules whose selectors no longer match anything in the
// interface. The React app loads app/base.css, web/threadline.css,
// web/buttons.css and app/app.css together, so a class counts as used when
// any markup or script in the project mentions it.
//
// Run with: node scripts/prune-css.mjs [--write]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");

const stylesheets = [
  "web/threadline.css",
  "web/buttons.css",
  "app/base.css",
  "app/app.css",
  "web/landing.css",
  "web/sharing.css",
  "web/feishu.css",
];

// Markup and script sources decide which classes exist.
const sources = [];
const skip = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
  ".build",
  "artifacts",
  "playwright-report",
  "test-results",
]);
(function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (/\.(tsx|ts|mjs|js|html|swift|py)$/.test(entry.name))
      sources.push(file);
  }
})(root);

const used = new Set();
for (const file of sources) {
  const text = fs.readFileSync(file, "utf8");
  // A class attribute, in any of the shapes the interface uses.
  for (const match of text.matchAll(
    /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\})/g,
  )) {
    const raw = match.slice(1).find((part) => part !== undefined) || "";
    for (const part of raw.split(/\s+/)) {
      const token = part.trim();
      if (!token) continue;
      used.add(token);
      // A dynamic class such as tag-${color} keeps its static prefix.
      if (token.includes("${")) {
        const prefix = token.split("${")[0].trim();
        if (prefix) used.add(prefix);
      }
    }
    // A class chosen inside a template expression, such as
    // `${selected.has(key) ? "chosen" : ""}`, is still a real class.
    for (const inner of raw.matchAll(/["']([^"']*)["']/g)) {
      // The quoted text may hold several classes at once.
      for (const token of inner[1].split(/\s+/)) {
        const name = token.trim();
        if (name) used.add(name);
      }
    }
  }
  // classList calls name their classes directly.
  for (const match of text.matchAll(
    /classList\.(?:add|remove|toggle|contains)\(([^)]*)\)/g,
  )) {
    for (const inner of match[1].matchAll(/["']([A-Za-z_][\w-]*)["']/g))
      used.add(inner[1]);
  }
  // Plain HTML class attributes.
  for (const match of text.matchAll(/class="([^"]*)"/g))
    for (const token of match[1].split(/\s+/)) if (token.trim()) used.add(token.trim());
  // A class assigned in an object, such as the editor's renderHTML output.
  for (const match of text.matchAll(/\bclass\s*:\s*["']([^"']+)["']/g))
    for (const token of match[1].split(/\s+/)) if (token.trim()) used.add(token.trim());
}

// A class may be composed from a value that is only known at runtime, such as
// conversation-dot ${status}. The values the interface can produce are listed
// here so their classes are never treated as unused.
const runtimeValues = [
  "complete",
  "open",
  "interrupted",
  "unknown",
  "sage",
  "blue",
  "purple",
  "amber",
  "coral",
  "gray",
  "user",
  "codex",
  "cursor",
  "claude",
  "pi",
  "deepseek",
  "assistant",
  "message",
  "note",
  "chosen",
  "selected",
  "active",
  "inactive",
  "pending",
  "running",
  "done",
  "failed",
  "outdated",
  "updated",
  // Classes the editor adds to the document while the user works.
  "ProseMirror",
  "ProseMirror-selectednode",
  "ProseMirror-hideselection",
  "ProseMirror-gapcursor",
  "ProseMirror-focused",
  "is-editor-empty",
  "has-focused",
  "ProseMirror-trailingBreak",
];
for (const value of runtimeValues) used.add(value);

// A class may be built at runtime, for example tag-${color} or
// conversation-dot ${status}. A prefix that appears in the interface keeps
// every class that starts with it alive.
const dynamicPrefixes = new Set();
for (const token of used) {
  if (token.endsWith("-") || token.endsWith(" ")) dynamicPrefixes.add(token);
}
const isLive = (name) =>
  used.has(name) ||
  [...dynamicPrefixes].some((prefix) => name.startsWith(prefix));

// Splits a stylesheet into rules. Rules nested in an at-rule such as @media
// are reported with their own selector, and carry the range of the at-rule
// that contains them so a whole block is never removed by accident.
function topLevel(css) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let prelude = 0;
  let index = 0;
  while (index < css.length) {
    const character = css[index];
    if (character === "/" && css[index + 1] === "*") {
      index = css.indexOf("*/", index + 2) + 2;
      continue;
    }
    if (character === '"') {
      index = css.indexOf('"', index + 1) + 1;
      continue;
    }
    if (character === "'") {
      index = css.indexOf("'", index + 1) + 1;
      continue;
    }
    if (character === "{") {
      if (depth === 0) {
        start = index;
        // The text before the brace is the selector, or the at-rule prelude.
        prelude = css.lastIndexOf("}", index) + 1;
        // A rule may follow a comment; step back over it.
        const before = css.slice(prelude, index);
        const comment = before.lastIndexOf("/*");
        if (comment >= 0 && before.indexOf("*/", comment) === -1) prelude = prelude + comment;
      }
      depth++;
    } else if (character === "}") {
      depth--;
      if (depth === 0) {
        const selector = css.slice(prelude, start).trim();
        const body = css.slice(start, index + 1);
        // An at-rule wraps further rules; report them individually.
        if (selector.startsWith("@")) {
          const inner = body.slice(1, -1);
          const offset = start + 1;
          for (const nested of topLevel(inner))
            blocks.push({
              selector: nested.selector,
              start: offset + nested.start,
              end: offset + nested.end,
              // A rule inside an at-rule may only be removed on its own.
              container: { start: prelude, end: index + 1 },
            });
        } else {
          // The rule owns its selector as well as its body.
          blocks.push({ selector, start: prelude, end: index + 1 });
        }
      }
    }
    index++;
  }
  return blocks;
}

let removedBytes = 0;
let removedRules = 0;
for (const file of stylesheets) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) continue;
  const css = fs.readFileSync(filePath, "utf8");
  const blocks = topLevel(css);
  const dead = [];
  for (const block of blocks) {
    // A rule may list several selectors. Each one is judged on its own, and
    // the rule survives as long as one of them still matches something.
    const parts = block.selector.split(",").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) continue;
    const live = parts.some((part) => {
      // A comment may sit in front of the selector.
      const cleaned = part.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
      const classes = [...cleaned.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]);
      if (!classes.length) return true;
      return classes.every((name) => isLive(name));
    });
    if (!live) dead.push(block);
  }
  if (!dead.length) continue;
  // A rule inside an at-rule is only removed on its own. The at-rule itself
  // stays, so the conditions it applies to never change.
  const removable = dead.filter((block) => !block.container);
  const bytes = removable.reduce((total, block) => total + (block.end - block.start), 0);
  removedBytes += bytes;
  removedRules += removable.length;
  console.log(
    `${file}: ${removable.length} unused rules (${(bytes / 1024).toFixed(1)} KB)`,
  );
  for (const block of removable.slice(0, 8))
    console.log(`    ${block.selector.split("\n").pop().slice(0, 80)}`);
  if (removable.length > 8) console.log(`    ... and ${removable.length - 8} more`);
  if (write && removable.length) {
    let result = "";
    let cursor = 0;
    for (const block of removable) {
      result += css.slice(cursor, block.start);
      cursor = block.end;
    }
    result += css.slice(cursor);
    fs.writeFileSync(filePath, result);
  }
}
console.log(
  `\n${removedRules} rules, ${(removedBytes / 1024).toFixed(1)} KB${write ? " removed" : " would be removed"}`,
);
