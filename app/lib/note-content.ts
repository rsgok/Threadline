import MarkdownIt from "markdown-it";
const parser = new MarkdownIt();
export function noteMessages(text: string) {
  const lines = text.split('\n');
  const offsets = [0];
  for (const line of lines) offsets.push(offsets.at(-1)! + line.length + 1);
  const tokens = parser.parse(text, {});
  const headings: { start: number; bodyStart: number; role: string; timestamp: string }[] = [];
  tokens.forEach((token, index) => {
    if (token.type !== 'heading_open' || token.tag !== 'h3' || token.level !== 0 || !token.map) return;
    const match = /^(我的问题|AI 回答|AI 过程消息)(?: · (.+))?$/.exec(tokens[index + 1]?.content || '');
    if (match) headings.push({ start: offsets[token.map[0]], bodyStart: offsets[token.map[1]], role: match[1], timestamp: match[2] || '' });
  });
  if (!headings.length || text.slice(0, headings[0].start).trim()) return null;
  return headings.map((heading, index) => {
    const end = headings[index + 1]?.start ?? text.length;
    const raw = text.slice(heading.bodyStart, end);
    const body = raw.replace(/\s+$/, '').replace(/\n---$/, '').trimEnd();
    return { ...heading, end: heading.bodyStart + body.length, body };
  });
}
