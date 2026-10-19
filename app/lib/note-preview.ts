// A short, readable preview of a note for list rows and search results.
//
// Collected conversations are stored as Markdown with role headings such as
// "### 我的问题 · 2026-09-10T04:00:00 UTC". Showing that raw markup in a list
// preview is noise, so the headings, separators and timestamps are removed and
// the first real sentence is shown instead.
const roles = /^(我的问题|AI 回答|AI 过程消息)$/;

function plainText(markdown: string, code?: string) {
  return markdown
    // Fenced code keeps its contents; only the fence markers are dropped.
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, code ?? "$1")
    .replace(/~~~[^\n]*\n?([\s\S]*?)~~~/g, code ?? "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*[-:| ]+\s*$/gm, " ")
    .replace(/^\s*---\s*$/gm, " ")
    .replace(/^\s*(\*\*\*|___)\s*$/gm, " ")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/^\s*\|/gm, " ")
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
  const text = plainText(withoutRoleHeadings(markdown || ""), code)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit).trimEnd() + "…";
}
