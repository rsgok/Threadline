// Canvas output stays local. Images come only from the selected preview snapshot.
window.renderShareCards = async function(job, progress = () => {}) {
  await document.fonts.ready;
  const pages = [], width = 1080, height = 1440, margin = 64, bottom = 1340;
  let canvas, ctx, y;
  function page() {
    if (pages.length >= 200) throw Error('内容超过 200 张图卡，请减少所选消息');
    canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fafbf9'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#346957'; ctx.font = '500 20px -apple-system, sans-serif'; ctx.fillText('THREADLINE  /  思续', margin, 48);
    ctx.strokeStyle = '#dce4df'; ctx.beginPath(); ctx.moveTo(margin, 68); ctx.lineTo(width - margin, 68); ctx.stroke(); y = 110; pages.push(canvas);
  }
  function room(h) { if (y + h > bottom) page(); }
  function line(text, { code = false, heading = false, muted = false } = {}) {
    const size = heading ? 34 : code ? 23 : 27, spacing = heading ? 49 : 39;
    const font = `${heading ? '600 ' : ''}${size}px ${code ? 'Menlo, monospace' : '-apple-system, "PingFang SC", sans-serif'}`;
    ctx.font = font; const max = width - margin * 2 - (code ? 24 : 0);
    const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment) : Array.from(text);
    let row = '';
    const draw = value => { room(spacing); ctx.font = font; if (code) { ctx.fillStyle = '#eaf0ed'; ctx.fillRect(margin - 8, y - 27, width - margin * 2 + 16, spacing); } ctx.fillStyle = muted ? '#60776b' : '#253d32'; ctx.fillText(value, margin + (code ? 6 : 0), y); y += spacing; };
    for (const char of segments) { if (row && ctx.measureText(row + char).width > max) { draw(row); row = ''; ctx.font = font; } row += char; }
    draw(row);
  }
  function text(body) {
    let code = false;
    for (const raw of body.split('\n')) {
      if (/^\s*```/.test(raw)) { code = !code; y += 12; continue; }
      if (!raw.trim()) { room(18); y += 18; continue; }
      line(raw, { code, heading: !code && /^#{1,3}\s/.test(raw) });
    }
  }
  page(); line(job.title, { heading: true }); y += 20;
  if (job.note) { text(job.note); y += 24; }
  for (const [index, message] of job.messages.entries()) {
    room(110); line(message.role === 'user' ? '我' : 'AI', { muted: true });
    for (const part of message.parts || [{type:'text',text:message.text}]) {
      if (part.type === 'text') { text(part.text); continue; }
      const id = part.assetId;
      const image = new Image(); image.src = `/api/share/jobs/${job.id}/assets/${id}`;
      try { await image.decode(); } catch { throw Error('所选图片无法生成图卡，请取消该图片或导出原文件'); }
      const scale = Math.min((width - margin * 2) / image.naturalWidth, 1020 / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      if (!Number.isFinite(w) || !h) throw Error('图片尺寸无效');
      room(h + 30); ctx.drawImage(image, (width - w) / 2, y, w, h); y += h + 30;
    }
    y += 28; progress(index + 1, job.messages.length);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  for (const a of job.attachments.filter(a=>a.selected && a.kind !== 'image')) line('附件：' + a.name, { muted: true });
  pages.forEach((c, i) => { const p = c.getContext('2d'); p.fillStyle = '#60776b'; p.font = '20px -apple-system, sans-serif'; p.fillText(`讨论摘录 · ${i + 1} / ${pages.length}`, margin, height - 42); });
  return pages;
};
