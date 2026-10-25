// Оформление: стиль (4 варианта) × тема (Авто / Светлая / Тёмная), сохранение в localStorage.
// На <html> всегда стоят конкретные data-style и data-theme (auto разрешается здесь),
// поэтому в CSS нет дублирующих @media (prefers-color-scheme).
const KEY = 'xp.theme';
const STYLE_KEY = 'xp.style';

export const STYLES = ['ops', 'clean', 'glass', 'term'];
export const STYLE_LABELS = { ops: 'Мониторинг', clean: 'Строгий', glass: 'Стекло', term: 'Терминал' };
export const STYLE_HINTS = {
  ops: 'Плотный дашборд в духе Grafana / Linear',
  clean: 'Светлый и спокойный, как shadcn/ui',
  glass: 'Полупрозрачные карточки на градиенте',
  term: 'Моноширинный шрифт и рамки консоли',
};
export const THEME_LABELS = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' };

const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function read(key, def) {
  try { return localStorage.getItem(key) || def; } catch (e) { return def; }
}
function write(key, v) {
  try { localStorage.setItem(key, v); } catch (e) { /* приватный режим */ }
}

export function getTheme() {
  const t = read(KEY, 'auto');
  return t === 'light' || t === 'dark' ? t : 'auto';
}

export function getStyle() {
  const s = read(STYLE_KEY, 'ops');
  return STYLES.indexOf(s) >= 0 ? s : 'ops';
}

export function setTheme(v) {
  const t = v === 'light' || v === 'dark' ? v : 'auto';
  write(KEY, t);
  applyTheme();
  return t;
}

export function setStyle(v) {
  const s = STYLES.indexOf(v) >= 0 ? v : 'ops';
  write(STYLE_KEY, s);
  applyTheme();
  return s;
}

export function isDark() {
  const t = getTheme();
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return !!(mq && mq.matches);
}

export function applyTheme() {
  const root = document.documentElement;
  const dark = isDark();
  root.setAttribute('data-style', getStyle());
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-theme-pref', getTheme());
  root.style.colorScheme = dark ? 'dark' : 'light';
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  // Цвет фона берётся из CSS после применения атрибутов.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  meta.setAttribute('content', bg || (dark ? '#000000' : '#ffffff'));
  window.dispatchEvent(new CustomEvent('xp-theme'));
}

if (mq) {
  const onChange = () => { if (getTheme() === 'auto') applyTheme(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}
