import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const imageExtension = file => /\.(png|jpe?g|gif|webp|bmp)$/i.test(file);
const label = value => String(value).replace(/[\[\]\r\n]/g, '_');

// Only explicit media blocks are exposed. Tool text, prompts and arbitrary paths
// inside logs are deliberately not interpreted as generated attachments.
export function mediaMarkdown(value, cacheDir) {
  const results = [];
  function add(uri, name, image) {
    if (typeof uri !== 'string') return;
    if (uri.startsWith('file://')) { try { uri = fileURLToPath(uri); } catch { return; } }
    if (uri.startsWith('data:')) {
      const match = uri.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/);
      if (!match || !cacheDir || match[2].length > 35 * 1024 * 1024) return;
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length || bytes.length > 25 * 1024 * 1024) return;
      fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
      uri = path.join(cacheDir, hash(bytes) + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]));
      if (!fs.existsSync(uri)) fs.writeFileSync(uri, bytes, { flag: 'wx', mode: 0o600 });
    }
    if (!path.isAbsolute(uri) && !/^https?:\/\//.test(uri)) return;
    if (/[<>\r\n]/.test(uri)) return;
    const text = `${image ? '!' : ''}[${label(name || (image ? '图片' : path.basename(uri)))}](<${uri}>)`;
    if (!results.includes(text)) results.push(text);
  }
  function visit(block, depth = 0) {
    if (!block || depth > 8) return;
    if (typeof block === 'string') { try { visit(JSON.parse(block), depth + 1); } catch {} return; }
    if (Array.isArray(block)) { block.forEach(b => visit(b, depth + 1)); return; }
    if (typeof block !== 'object') return;
    if (['input_image', 'output_image', 'image', 'generated_image'].includes(block.type)) {
      const src = block.image_url?.url || block.image_url || block.url || block.path || (block.data && `data:${block.mimeType || block.mime_type || 'image/png'};base64,${block.data}`) || (block.source?.type === 'base64' && `data:${block.source.media_type};base64,${block.source.data}`);
      add(src, block.name || '图片', true);
    } else if (['resource_link', 'file', 'input_file', 'output_file'].includes(block.type)) {
      const uri = block.uri || block.file_url || block.path || block.url;
      add(uri, block.name || block.filename, /^image\//.test(block.mimeType || block.mime_type || '') || imageExtension(uri || ''));
    }
    if (block.type === 'image_generation_call' && block.result) add(`data:image/png;base64,${block.result}`, 'AI 生成的图片', true);
    for (const key of ['content', 'output', 'result', 'structuredContent']) if (block[key]) visit(block[key], depth + 1);
  }
  visit(value);
  return results.join('\n\n');
}

export function linkedAttachments(text) {
  const attachments = [];
  const clean = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of clean.matchAll(/(!?)\[[^\]]*\]\(<?(\/[^<>\n]*?)>?\)/g)) {
    const file = m[2].replace(/:\d+(?::\d+)?$/, '');
    if (!attachments.some(a => a.path === file)) attachments.push({ path: file, kind: m[1] || imageExtension(file) ? 'image' : 'file' });
  }
  return attachments;
}

// A note owns its copies; a failed database write can remove just these files.
export function archiveAssets(messages, dataDir) {
  const assets = [], warnings = [];
  let total = 0;
  const seen = new Set();
  for (const message of messages) for (const item of message.attachments || linkedAttachments(message.text)) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    let fd;
    try {
      if (seen.size > 50) throw Error('一次最多保存 50 个附件');
      fd = fs.openSync(item.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || !stat.size) throw Error('不是可读取的非空文件');
      if (stat.size > 25 * 1024 * 1024 || total + stat.size > 100 * 1024 * 1024) throw Error('单文件超过 25 MB 或附件总量超过 100 MB');
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!n) throw Error('文件读取不完整'); offset += n; }
      const after = fs.fstatSync(fd);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('文件在保存时发生变化');
      const storedName = crypto.randomUUID() + path.extname(item.path).slice(0, 16);
      fs.writeFileSync(path.join(dataDir, 'attachments', storedName), bytes, { flag: 'wx', mode: 0o600 });
      assets.push({ originalPath: item.path, storedName, name: path.basename(item.path), kind: item.kind, size: bytes.length, digest: hash(bytes) });
      total += bytes.length;
    } catch (error) {
      warnings.push({ path: item.path, name: path.basename(item.path), reason: error.code === 'ENOENT' ? '文件已移动或删除' : error.code === 'ELOOP' ? '不复制符号链接' : error.message });
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  for (const message of messages) for (const match of message.text.matchAll(/!\[[^\]]*\]\(<?(https?:\/\/[^<>\n]*?)>?\)/g)) {
    if (!seen.has(match[1])) { seen.add(match[1]); warnings.push({ path: match[1], name: '远程图片', reason: '仅保留链接，尚未下载到本机' }); }
  }
  return { assets, warnings };
}

export function portableBody(clip) {
  return clip.body.replace(/(!?\[[^\]]*\]\()(<[^>]+>|[^)]+)(\))/g, (raw, before, dest, after) => {
    const asset = clip.assets?.find(a => a.originalPath === dest.replace(/^<|>$/g, '').replace(/:\d+(?::\d+)?$/, ''));
    return asset ? `${before}attachments/${asset.storedName}${after}` : raw;
  });
}
