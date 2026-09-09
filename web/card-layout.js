// Executed in the isolated Chromium page. All dimensions come from real layout.
async function paginateCards() {
  const english=document.documentElement.lang==='en';
  const roleLabel=role=>role==='user'?(english?'My question':'我的提问'):(english?'AI answer':'AI 回答');
  await document.fonts.ready;
  await Promise.all([...document.images].map(async image => { await image.decode(); if (!image.naturalWidth) throw Error('图片无法读取'); }));
  const pages = document.querySelector('#pages'), template = document.querySelector('#page-template');
  let body, currentRole = '', pageCount = 0;
  const source = document.querySelector('#source');
  const originalText = source.textContent.replace(/\s/g, '');
  function page() {
    if (++pageCount > 200) throw Error('内容超过 200 张图卡，请减少所选消息');
    const sheet = template.content.firstElementChild.cloneNode(true);
    pages.append(sheet); body = sheet.querySelector('.card-body');
    if (currentRole) {
      const line = document.createElement('div'); line.className = 'continuation';
      line.textContent = `${currentRole} · ${english?'Continued':'接上页'}`; body.append(line);
    }
  }
  function fits(node, reserve = 0) {
    body.append(node);
    const fits = node.getBoundingClientRect().bottom + reserve <= body.getBoundingClientRect().bottom + .5;
    if (!fits) node.remove();
    return fits;
  }
  function contentCount() { return [...body.children].filter(n => !n.classList.contains('continuation')).length; }
  function remaining() { const last = body.lastElementChild; return body.getBoundingClientRect().bottom - (last ? last.getBoundingClientRect().bottom : body.getBoundingClientRect().top); }
  // Range cloning retains emphasis, links and inline code on either side of a cut.
  function textParts(node, offset) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let leaf, left = offset;
    while ((leaf = walker.nextNode())) { if (left <= leaf.length) break; left -= leaf.length; }
    if (!leaf) return [node.cloneNode(true), node.cloneNode(false)];
    const before = document.createRange(); before.selectNodeContents(node); before.setEnd(leaf, left);
    const after = document.createRange(); after.selectNodeContents(node); after.setStart(leaf, left);
    return [before, after].map(range => { const part = node.cloneNode(false); part.append(range.cloneContents()); return part; });
  }
  function splitText(node) {
    const text = node.textContent;
    const boundaries = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].map(s => s.index + s.segment.length);
    let low = 0, high = boundaries.length - 1, best = 0;
    while (low <= high) {
      const mid = (low + high) >> 1, [part] = textParts(node, boundaries[mid]);
      if (fits(part)) { part.remove(); best = boundaries[mid]; low = mid + 1; } else high = mid - 1;
    }
    if (!best || best === text.length) return null;
    // Prefer a nearby line/word boundary, but never discard characters.
    const candidate = text.slice(Math.max(0, best - 45), best), newline = candidate.lastIndexOf('\n');
    if (newline >= 0) best = Math.max(0, best - 45) + newline + 1;
    const [first, rest] = textParts(node, best);
    if (!first.textContent.trim()) return null;
    return [first, rest];
  }
  function tableRows(table) {
    const rows = [...table.querySelectorAll(':scope > tbody > tr')];
    const header = table.querySelector('thead');
    const tableFor = row => { const t = table.cloneNode(false); if (header) t.append(header.cloneNode(true)); const b = document.createElement('tbody'); b.append(row.cloneNode(true)); t.append(b); return t; };
    let chunk = null;
    for (const row of rows) {
      if (chunk) {
        const clone = row.cloneNode(true); chunk.querySelector('tbody').append(clone);
        if (chunk.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + .5) continue;
        clone.remove(); chunk = null; page();
      }
      let one = tableFor(row);
      if (fits(one)) { chunk = one; continue; }
      if (contentCount()) page();
      if (fits(one)) { chunk = one; continue; }
      // A single extremely tall row becomes labeled fields, retaining every cell.
      const names = [...(header?.querySelectorAll('th') || [])].map(n => n.textContent);
      [...row.children].forEach((cell, index) => {
        const label = document.createElement('h4'); label.className = 'table-field-label'; label.textContent = names[index] || `列 ${index + 1}`;
        place(label); const value = document.createElement('div'); value.className = 'table-record'; value.innerHTML = cell.innerHTML; place(value);
      });
    }
  }
  function place(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList.contains('message-heading')) currentRole = '';
    const keep = /^(H[1-6])$/.test(node.tagName) || node.classList.contains('message-heading');
    if (fits(node, keep ? 54 : 0)) {
      if (node.classList.contains('message-heading')) currentRole = roleLabel(node.dataset.role);
      return;
    }
    if (node.tagName === 'TABLE' && node.querySelector('tbody')) { tableRows(node); return; }
    if (['UL', 'OL'].includes(node.tagName)) {
      const start = Number(node.getAttribute('start') || 1);
      [...node.children].forEach((li, i) => { const list = node.cloneNode(false); if (node.tagName === 'OL') list.start = start + i; list.append(li.cloneNode(true)); placeFragment(list); });
      return;
    }
    placeFragment(node, keep);
    if (node.classList.contains('message-heading')) currentRole = roleLabel(node.dataset.role);
  }
  function placeFragment(node, keep = false) {
    if (fits(node, keep ? 54 : 0)) return;
    const canSplit = !keep && !node.querySelector('img') && node.textContent.length > 1;
    if (canSplit && remaining() >= 130) {
      const pieces = splitText(node);
      if (pieces && fits(pieces[0])) { page(); placeFragment(pieces[1]); return; }
    }
    if (contentCount()) { page(); if (fits(node, keep ? 54 : 0)) return; }
    if (canSplit) {
      const pieces = splitText(node);
      if (pieces && fits(pieces[0])) { page(); placeFragment(pieces[1]); return; }
    }
    // Long titles can span pages too; no element is silently clipped.
    if (keep && node.textContent.length > 100) { placeFragment(node, false); return; }
    throw Error('有内容无法放入图卡，请减少内容或将过长表格拆开');
  }
  page();
  const long = document.body.dataset.cardMode === 'long';
  if (long) {
    body.append(...[...source.children].map(node => node.cloneNode(true)));
    if (body.parentElement.getBoundingClientRect().height > 20000) throw Error('内容超过单张长图上限，请改用分页图卡或减少所选消息');
  } else for (const node of [...source.children]) place(node.cloneNode(true));
  const all = [...pages.querySelectorAll('.card')];
  const report = all.map((sheet, i) => {
    sheet.querySelector('.page-number').textContent = long ? '长图' : `${String(i + 1).padStart(2, '0')} / ${String(all.length).padStart(2, '0')}`;
    const b = sheet.querySelector('.card-body'), bounds = b.getBoundingClientRect();
    const overflow = [...b.children].some(n => n.getBoundingClientRect().bottom > bounds.bottom + 1 || n.scrollWidth > n.clientWidth + 1);
    const text = b.textContent;
    return { page: i + 1, text, overflow, images: [...b.querySelectorAll('img')].map(image => ({ width: image.naturalWidth, height: image.naturalHeight })) };
  });
  if (report.some(p => p.overflow)) throw Error('图卡内容超出页面，请减少所选内容');
  source.remove();
  return { pages: report, sourceText: originalText, pageCount: all.length };
}
