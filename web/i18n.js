/* Application copy is translated at its source, never by observing user content. */
(() => {
  const key = 'threadline-language';
  const supported = new Set(['system', 'zh-CN', 'en']);
  let preference = 'system';
  try { const saved = localStorage.getItem(key); if (supported.has(saved)) preference = saved; } catch {}
  const resolve = value => value === 'system' ? (/^zh\b/i.test(window.THREADLINE_SYSTEM_LANGUAGE || navigator.language || '') ? 'zh-CN' : 'en') : value;
  let locale = resolve(preference);
  function t(message, ...values) {
    const template = Array.isArray(message);
    const source = template ? message.map((part, i) => part + (i < values.length ? `{${i}}` : '')).join('') : String(message ?? '');
    const translated = locale === 'en' ? (window.THREADLINE_EN?.[source] ?? source) : source;
    return template ? translated.replace(/\{(\d+)\}/g, (match, i) => i < values.length ? String(values[i]) : match) : translated;
  }
  const messagePatterns = Object.entries(window.THREADLINE_EN || {}).filter(([key])=>/\{\d+\}/.test(key)).map(([source, translation])=>{
    const indexes=[];
    const pattern=source.split(/(\{\d+\})/).map(part=>{
      if(/^\{\d+\}$/.test(part)){indexes.push(part.slice(1,-1));return '([\\s\\S]*?)'}
      return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    }).join('');
    return {regex:new RegExp('^'+pattern+'$'),indexes,translation};
  });
  function message(source){
    if(locale!=='en'||!source)return source;
    if(Object.hasOwn(window.THREADLINE_EN||{},source))return t(source);
    for(const {regex,indexes,translation}of messagePatterns){const match=regex.exec(source);if(match){const values=Object.fromEntries(indexes.map((index,i)=>[index,match[i+1]]));return translation.replace(/\{(\d+)\}/g,(token,index)=>values[index]??token)}}
    return source;
  }
  function count(value,kind='message'){
    const nouns={message:['条消息','message','messages'],note:['篇笔记','note','notes'],attachment:['个附件','attachment','attachments']};
    const words=nouns[kind];if(!words)throw new Error('Unknown count kind');
    const number=new Intl.NumberFormat(locale).format(value);
    return locale==='en'?number+' '+words[new Intl.PluralRules(locale).select(value)==='one'?1:2]:number+' '+words[0];
  }
  function localizeStatic(root) {
    // Run only on application-owned static markup, before any notes are rendered.
    for (const option of root.querySelectorAll('option:not([value])')) option.value = option.textContent;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement?.closest('script,style,textarea,code,pre')) nodes.push(node);
    }
    for (const node of nodes) {
      const source = node.textContent.trim();
      if (source) node.textContent = node.textContent.replace(source, t(source));
    }
    for (const node of root.querySelectorAll('[title],[placeholder],[aria-label],[alt]')) {
      for (const attr of ['title', 'placeholder', 'aria-label', 'alt']) if (node.hasAttribute(attr)) node.setAttribute(attr, t(node.getAttribute(attr)));
    }
  }
  function setPreference(value) {
    if (!supported.has(value)) throw new Error('Unsupported language');
    localStorage.setItem(key, value);
    preference = value;
    locale = resolve(value);
    document.documentElement.lang = locale;
    window.webkit?.messageHandlers?.language?.postMessage({ preference, locale });
  }
  window.I18n = { t, message, count, localizeStatic, setPreference, get locale() { return locale; }, get preference() { return preference; } };
  document.documentElement.lang = locale;
  window.webkit?.messageHandlers?.language?.postMessage({ preference, locale });
})();
