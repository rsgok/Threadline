import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cardDocument, fontRoots } from './card-template.mjs';
let browser;
const report = data => process.send?.(data);
process.once('SIGTERM', async () => { await browser?.close().catch(() => {}); process.exit(1); });
process.once('message', async ({ job, outputDir, assets, executablePath }) => {
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 720, height: 960 }, deviceScaleFactor: 1.5, locale: 'zh-CN', reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://threadline.invalid') return route.abort();
      const font = url.pathname.match(/^\/fonts\/(noto|mono)\/([a-z0-9.-]+\.woff2)$/);
      if (font) {
        const file = path.join(fontRoots[font[1]], 'files', font[2]);
        if (fs.existsSync(file)) return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(file) });
      }
      const asset = assets.find(a => url.pathname === '/assets/' + a.id);
      if (asset) {
        const bytes = fs.readFileSync(asset.file);
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== asset.digest) return route.abort();
        return route.fulfill({ contentType: asset.mime, body: bytes });
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    report({ phase: 'layout', message: '正在排版中文、代码与图片' });
    await page.setContent(cardDocument(job), { waitUntil: 'load' });
    await page.addScriptTag({ content: fs.readFileSync(new URL('./card-layout.js', import.meta.url), 'utf8') });
    const layout = await page.evaluate(() => paginateCards());
    fs.writeFileSync(path.join(outputDir, 'layout.json'), JSON.stringify(layout), { mode: 0o600 });
    for (let index = 0; index < layout.pageCount; index++) {
      report({ phase: 'rendering', completed: index, total: layout.pageCount, message: `正在生成图卡 ${index + 1} / ${layout.pageCount}` });
      await page.locator('.card').nth(index).screenshot({ path: path.join(outputDir, `card-${index}.png`), animations: 'disabled', timeout: 60000 });
    }
    report({ phase: 'done', total: layout.pageCount });
  } catch (error) { report({ phase: 'failed', message: error.message }); process.exitCode = 1; }
  finally { await browser?.close(); process.disconnect?.(); }
});
