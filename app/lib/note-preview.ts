// A short, readable preview of a note for list rows and search results.
//
// Collected conversations are stored as Markdown with role headings such as
// "### 我的问题 · 2026-09-10T04:00:00 UTC". Showing that raw markup in a list
// preview is noise, so the headings, separators and timestamps are removed and
// the first real sentence is shown instead.
const roles = /^(我的问题|AI 回答|AI 过程消息)$/;

// Splits the Markdown into fenced code blocks and the text around them. A
// code example is content, not structure: a heading inside a fence is part of
// the example and must survive.
function segments(markdown: string) {
  const result: { code: boolean; lines: string[] }[] = [];
  let current: { code: boolean; lines: string[] } = { code: false, lines: [] };
  let marker = "";
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!current.code && (trimmed.startsWith("```") || trimmed.startsWith("~~~"))) {
      // The opening fence is structure, not content.
      result.push(current);
      marker = trimmed.slice(0, 3);
      current = { code: true, lines: [] };
      continue;
    }
    if (current.code && marker && trimmed.startsWith(marker)) {
      // The closing fence is structure as well.
      current.lines.push(line);
      result.push(current);
      current = { code: false, lines: [] };
      marker = "";
      continue;
    }
    current.lines.push(line);
  }
  result.push(current);
  return result;
}

function plainText(markdown: string) {
  return markdown
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "")
    // A table row keeps its cell text; only the alignment row is dropped.
    .replace(/^[ \t]*\|([^\n]*)\|[ \t]*$/gm, (_row, cells: string) => {
      if (/^[\s:|-]+$/.test(cells)) return " ";
      return " " + cells.replace(/\|/g, " ") + " ";
    })
    .replace(/^\s*[-:| ]+\s*$/gm, " ")
    .replace(/^\s*---\s*$/gm, " ")
    .replace(/^\s*(\*\*\*|___)\s*$/gm, " ")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\|/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Removes the role headings a collected conversation is built from, along
// with their timestamps, so only the conversation itself remains.
function withoutRoleHeadings(markdown: string) {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line.trim());
    if (heading) {
      const text = heading[1].trim();
      const withoutTime = text.replace(/\s*·\s*.+$/, "").trim();
      if (roles.test(withoutTime)) continue;
      kept.push(heading[0]);
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

export function notePreview(markdown: string, limit = 160, code?: string) {
  const parts: string[] = [];
  for (const segment of segments(markdown || "")) {
    if (segment.code) {
      // A code example is shown as its own text, or replaced by a note. The
      // fence markers themselves are never part of the preview.
      const body = segment.lines
        .filter((line) => !line.trim().startsWith("```") && !line.trim().startsWith("~~~"))
        .join("\n");
      parts.push(code ?? body);
      continue;
    }
    parts.push(plainText(withoutRoleHeadings(segment.lines.join("\n"))));
  }
  const text = parts.join("\n").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit).trimEnd() + "…";
}
