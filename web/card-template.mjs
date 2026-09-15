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
function renderCardText(text, env) {
  const tokens = md.parse(text, env);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'heading_open' || token.tag !== 'h3' || token.level !== 0) continue;
    const match = /^(我的问题|AI 回答|AI 过程消息)(?: · (.+))?$/.exec(tokens[i + 1]?.content || '');
    if (!match) continue;
    const user = match[1] === '我的问题';
    const role = env.locale === 'en' ? (user ? 'You · Message' : 'AI · Answer') : (user ? '你 · 发言' : match[1] === 'AI 过程消息' ? 'AI · 过程' : 'AI · 回答');
    const date = match[2] ? new Date(match[2]) : null;
    const timestamp = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(env.locale, {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date) : match[2];
    token.type = 'html_block'; token.tag = ''; token.nesting = 0;
    token.content = `<div class="message-heading" data-role="${user ? 'user' : 'assistant'}"><span>${role}</span>${match[2] ? `<time>${escapeHTML(timestamp)}</time>` : ''}</div>`;
    tokens.splice(i + 1, 2);
  }
  return md.renderer.render(tokens, md.options, env);
}
export function cardDocument(job) {
  const theme = resolveCardTheme(job.cardTheme);
  const english = job.locale === 'en', env = {locale: english ? 'en' : 'zh-CN'};
  const label = (zh,en) => english ? en : zh;
  const fontCSS = fs.readFileSync(path.join(fontRoots.noto, 'index.css'), 'utf8')
    .replace(/url\(\.\/files\//g, 'url(https://threadline.invalid/fonts/noto/')
    .replace(/font-display: swap/g, 'font-display: block');
  const monoCSS = `@font-face{font-family:'Card Mono';font-style:normal;font-weight:400;src:url(https://threadline.invalid/fonts/mono/jetbrains-mono-latin-400-normal.woff2) format('woff2');font-display:block}`;
  const words = job.messages.reduce((sum, message) => sum + (message.text || '').length, 0);
  const blocks = [`<h1>${escapeHTML(job.title)}</h1>`, `<div class="card-meta">${label(`约 ${Math.max(1, Math.ceil(words / 500))} 分钟阅读`, `${Math.max(1, Math.ceil(words / 500))} min read`)}</div>`];
  if (job.note?.trim()) blocks.push(`<aside class="share-note"><span class="note-label">${label('分享附言','Message')}</span>${md.render(job.note,env)}</aside>`);
  for (const [index, message] of job.messages.entries()) {
    if (message.role !== 'note') blocks.push(`<div class="message-heading" data-message="${index}" data-role="${message.role === 'user' ? 'user' : 'assistant'}"><span>${message.role === 'user' ? label('你 · 发言','You · Message') : label('AI · 回答','AI · Answer')}</span></div>`);
    for (const part of message.parts || [{ type: 'text', text: message.text }]) {
      if (part.type === 'text') blocks.push(renderCardText(part.text,env));
      else if (/^[a-f0-9]{24}$/.test(part.assetId) && job.attachments.some(a => a.id === part.assetId && a.selected && a.kind === 'image')) {
        blocks.push(`<figure><img src="https://threadline.invalid/assets/${part.assetId}" alt="${label('所选图片','Selected image')}"></figure>`);
      }
    }
  }
  const files = job.attachments.filter(a => a.selected && a.kind !== 'image');
  if (files.length) blocks.push(`<h3>${label('随附文件','Attached files')}</h3><ul>${files.map(a => `<li>${escapeHTML(a.name)}</li>`).join('')}</ul>`);
  return `<!doctype html><html lang="${env.locale}"><head><meta charset="UTF-8"><style>${cardThemeCSS(theme.id)}\n${fontCSS}\n${monoCSS}\n${fs.readFileSync(new URL('./card-template.css', import.meta.url), 'utf8')}</style></head><body data-layout="${theme.layout}" data-card-mode="${job.cardMode === 'long' ? 'long' : 'pages'}"><div id="source">${blocks.join('\n')}</div><main id="pages"></main><template id="page-template"><article class="card"><header><span class="wordmark">Threadline<span class="brand-dot">●</span></span><span class="running-title">${escapeHTML(job.title)}</span></header><section class="card-body"></section><footer><span>THREADLINE</span><span class="page-number"></span></footer></article></template></body></html>`;
}
