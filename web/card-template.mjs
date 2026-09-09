import { cardThemeCSS, resolveCardTheme } from './card-themes.mjs';
import MarkdownIt from 'markdown-it';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const fontRoots = {
  noto: path.dirname(require.resolve('@fontsource-variable/noto-sans-sc/index.css')),
  mono: path.dirname(require.resolve('@fontsource/jetbrains-mono/400.css')),
};
const md = new MarkdownIt({ html: false, breaks: false, linkify: false, typographer: false });
export const escapeHTML = text => md.utils.escapeHtml(String(text ?? ''));
// Only snapshot-selected images are loaded, via separately constructed image blocks.
md.renderer.rules.image = (tokens, index, options, env) => `<span class="image-reference">${env?.locale === 'en' ? 'Image: ' : '图片：'}${escapeHTML(tokens[index].content || (env?.locale === 'en' ? 'Not attached' : '未附带'))}</span>`;
md.renderer.rules.link_open = () => '<span class="text-link">';
md.renderer.rules.link_close = () => '</span>';
md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index], language = token.info.trim().split(/\s/)[0] || 'CODE';
  return `<pre data-language="${escapeHTML(language)}"><code>${escapeHTML(token.content)}</code></pre>`;
};
export function cardDocument(job) {
  const theme = resolveCardTheme(job.cardTheme);
  const english = job.locale === 'en', env = {locale: english ? 'en' : 'zh-CN'};
  const label = (zh,en) => english ? en : zh;
  const fontCSS = fs.readFileSync(path.join(fontRoots.noto, 'index.css'), 'utf8')
    .replace(/url\(\.\/files\//g, 'url(https://threadline.invalid/fonts/noto/')
    .replace(/font-display: swap/g, 'font-display: block');
  const monoCSS = `@font-face{font-family:'Card Mono';font-style:normal;font-weight:400;src:url(https://threadline.invalid/fonts/mono/jetbrains-mono-latin-400-normal.woff2) format('woff2');font-display:block}`;
  const blocks = [`<h1>${escapeHTML(job.title)}</h1>`, `<p class="deck">${english ? `Conversation excerpt · ${job.messages.length} ${job.messages.length === 1 ? 'message' : 'messages'}` : `对话摘录 · ${job.messages.length} 条消息`}</p>`];
  if (job.note?.trim()) blocks.push(`<aside class="share-note"><span class="note-label">${label('分享附言','Message')}</span>${md.render(job.note,env)}</aside>`);
  for (const [index, message] of job.messages.entries()) {
    const role = message.role === 'user' ? '我' : 'AI';
    blocks.push(`<div class="message-heading" data-message="${index}" data-role="${message.role}"><span class="role-mark">${role === '我' ? 'Q' : 'A'}</span><span>${role === '我' ? label('我的提问','My question') : label('AI 回答','AI answer')}</span><span class="message-index">${String(index + 1).padStart(2, '0')}</span></div>`);
    for (const part of message.parts || [{ type: 'text', text: message.text }]) {
      if (part.type === 'text') blocks.push(md.render(part.text,env));
      else if (/^[a-f0-9]{24}$/.test(part.assetId) && job.attachments.some(a => a.id === part.assetId && a.selected && a.kind === 'image')) {
        blocks.push(`<figure><img src="https://threadline.invalid/assets/${part.assetId}" alt="${label('所选图片','Selected image')}"></figure>`);
      }
    }
  }
  const files = job.attachments.filter(a => a.selected && a.kind !== 'image');
  if (files.length) blocks.push(`<h3>${label('随附文件','Attached files')}</h3><ul>${files.map(a => `<li>${escapeHTML(a.name)}</li>`).join('')}</ul>`);
  return `<!doctype html><html lang="${env.locale}"><head><meta charset="UTF-8"><style>${cardThemeCSS(theme.id)}\n${fontCSS}\n${monoCSS}\n${fs.readFileSync(new URL('./card-template.css', import.meta.url), 'utf8')}</style></head><body data-layout="${theme.layout}" data-card-mode="${job.cardMode === 'long' ? 'long' : 'pages'}"><div id="source">${blocks.join('\n')}</div><main id="pages"></main><template id="page-template"><article class="card"><header><span class="wordmark">Threadline<span class="brand-dot">●</span></span><span class="running-title">${escapeHTML(job.title)}</span></header><section class="card-body"></section><footer><span>${label('思续 · 让思考继续','Carry your thinking forward')}</span><span class="page-number"></span></footer></article></template></body></html>`;
}
