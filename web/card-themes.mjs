export const cardThemes = [
  { id: 'sage', name: '苔绿留白', description: '舒展留白 · 柔和绿', paper: '#fcfcf8', ink: '#263b31', accent: '#567252', soft: '#eef3e8', line: '#dbe3d8', muted: '#71816b', layout: 'airy' },
  { id: 'paper', name: '暖纸手记', description: '居中标题 · 纸张暖棕', paper: '#fbf3e5', ink: '#46392e', accent: '#956040', soft: '#f1e4d0', line: '#d9c8ae', muted: '#85715b', layout: 'journal' },
  { id: 'mono', name: '极简黑白', description: '紧凑编排 · 清晰线条', paper: '#ffffff', ink: '#232323', accent: '#232323', soft: '#f1f1ef', line: '#c9c9c4', muted: '#6c6c66', layout: 'editorial' },
  { id: 'blue', name: '海盐蓝', description: '醒目章节 · 清爽蓝白', paper: '#f4f8fc', ink: '#23384f', accent: '#356994', soft: '#e5eff7', line: '#c9dce9', muted: '#627d93', layout: 'chapter' },
  { id: 'midnight', name: '午夜墨色', description: '深色阅读 · 青绿强调', paper: '#182526', ink: '#e0eae5', accent: '#9fd6bd', soft: '#263839', line: '#435756', muted: '#a0b5ad', layout: 'night' },
];
export function resolveCardTheme(id = 'sage') {
  const theme = cardThemes.find(theme => theme.id === id);
  if (!theme) throw Object.assign(Error('图卡主题无效，请重新选择'), { status: 400 });
  return theme;
}
export function cardThemeCSS(id) {
  const t = resolveCardTheme(id);
  return `:root{--paper:${t.paper};--ink:${t.ink};--accent:${t.accent};--soft:${t.soft};--rule:${t.line};--muted:${t.muted}}`;
}
