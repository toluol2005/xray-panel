// Каркас приложения: боковая панель (десктоп) / таб-бар (телефон), контейнер страниц, шапка страницы.
import { h, clear } from './core.js';
import { icon } from './lib/icons.js';
import { STYLES, STYLE_LABELS, THEME_LABELS, getStyle, getTheme, setStyle, setTheme } from './theme.js';

export const TABS = [
  { id: 'overview', path: '/overview', label: 'Обзор', icon: 'overview' },
  { id: 'groups', path: '/groups', label: 'Группы', icon: 'groups' },
  { id: 'nodes', path: '/nodes', label: 'Узлы', icon: 'nodes' },
  { id: 'traffic', path: '/traffic', label: 'Трафик', icon: 'traffic' },
  { id: 'logs', path: '/logs', label: 'Журнал', icon: 'logs' },
  { id: 'settings', path: '/settings', label: 'Настройки', icon: 'settings' },
];

const THEME_ICONS = { auto: 'monitor', light: 'sun', dark: 'moon' };

/** Переключатель оформления: стиль (4) + тема (3). Синхронизируется между экземплярами. */
export function appearancePicker(opts) {
  const o = opts || {};
  const styles = h('div.ap-styles');
  STYLES.forEach((s) => {
    const b = h('button.ap-style', { type: 'button', attrs: { title: STYLE_LABELS[s] } },
      h('span.ap-swatch.sw-' + s, h('i'), h('i'), h('i')),
      h('span.ap-name', { text: STYLE_LABELS[s] }));
    b.dataset.v = s;
    b.addEventListener('click', () => { setStyle(s); if (o.onChange) o.onChange(); });
    styles.appendChild(b);
  });
  const themes = h('div.ap-themes');
  ['auto', 'light', 'dark'].forEach((t) => {
    const b = h('button.ap-theme', { type: 'button', attrs: { title: THEME_LABELS[t] } },
      icon(THEME_ICONS[t]), h('span', { text: THEME_LABELS[t] }));
    b.dataset.v = t;
    b.addEventListener('click', () => { setTheme(t); if (o.onChange) o.onChange(); });
    themes.appendChild(b);
  });
  const el = h('div.appearance' + (o.compact ? '.compact' : ''), styles, themes);
  const sync = () => {
    const s = getStyle();
    const t = getTheme();
    styles.querySelectorAll('.ap-style').forEach((b) => b.classList.toggle('active', b.dataset.v === s));
    themes.querySelectorAll('.ap-theme').forEach((b) => b.classList.toggle('active', b.dataset.v === t));
  };
  sync();
  window.addEventListener('xp-theme', sync);
  el.destroy = () => window.removeEventListener('xp-theme', sync);
  return el;
}

/** Создаёт каркас и возвращает управляющий объект. */
export function createShell(rootEl, onNavigate) {
  const body = h('main.shell-body');

  function tabBtn(t) {
    const b = h('button.tab', { type: 'button' }, icon(t.icon), h('span', { text: t.label }));
    b.dataset.tab = t.id;
    b.addEventListener('click', () => onNavigate(t.path));
    return b;
  }

  const nav = h('div.sidebar-nav');
  TABS.forEach((t) => nav.appendChild(tabBtn(t)));
  const sidebar = h('nav.sidebar',
    h('div.sidebar-brand',
      h('span.brand-mark', h('img', { attrs: { src: '/static/icon.svg', alt: '' } })),
      h('div.brand-text', h('b', { text: 'Xray Panel' }), h('span'))),
    nav,
    h('div.sidebar-foot', h('div.sidebar-label', { text: 'Оформление' }), appearancePicker({ compact: true })));
  const brandSub = sidebar.querySelector('.brand-text span');
  brandSub.textContent = location.hostname || '';

  const tabbarInner = h('div.tabbar-inner');
  TABS.forEach((t) => tabbarInner.appendChild(tabBtn(t)));
  const tabbar = h('nav.tabbar', tabbarInner);

  const shell = h('div.shell', sidebar, body, tabbar);
  clear(rootEl);
  rootEl.appendChild(shell);

  let current = null;

  return {
    el: shell,
    body,
    setActiveTab(id) {
      shell.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    },
    /** mode: 'push' | 'pop' | 'swap' */
    mount(pageEl, mode) {
      const prev = current;
      current = pageEl;
      body.appendChild(pageEl);
      const cls = !prev || mode === 'swap' || !mode ? 'anim-fade' : mode === 'push' ? 'anim-push-in' : 'anim-pop-in';
      pageEl.classList.add(cls);
      if (prev && prev.parentElement) prev.parentElement.removeChild(prev);
      setTimeout(() => pageEl.classList.remove(cls), 260);
    },
    get current() { return current; },
  };
}

function actionBtn(action) {
  const label = action.label || (action.icon === 'plus' ? 'Добавить' : '');
  const b = h('button.head-btn' + (label ? '' : '.icon-only') + (action.primary || action.icon === 'plus' ? '.primary' : ''),
    { type: 'button', attrs: { title: action.title || label || '', 'aria-label': action.title || label || '' } });
  if (action.icon) b.appendChild(icon(action.icon));
  if (label) b.appendChild(h('span', { text: label }));
  b.addEventListener('click', action.onClick);
  return b;
}

/**
 * Каркас страницы.
 * opts: {title, subtitle, back:{label,onClick}, action:{label|icon, onClick}}
 */
export function createPageEl(opts) {
  const o = opts || {};
  const titleEl = h('h1.page-title', { text: o.title || '' });
  const subEl = h('div.page-sub' + (o.subtitle ? '' : '.hidden'), { text: o.subtitle || '' });
  const actionSlot = h('div.head-actions');
  const head = h('header.page-head');
  const headInner = h('div.page-head-inner');
  if (o.back) {
    const b = h('button.head-back', { type: 'button', attrs: { title: 'Назад' } },
      icon('back'), h('span', { text: o.back.label || 'Назад' }));
    b.addEventListener('click', o.back.onClick);
    headInner.appendChild(b);
  }
  headInner.appendChild(h('div.head-titles', titleEl, subEl));
  headInner.appendChild(actionSlot);
  head.appendChild(headInner);

  const content = h('div.page-content');
  const inner = h('div.page-inner', content);
  const scroll = h('div.page-scroll', inner);
  const page = h('div.page', head, scroll);

  scroll.addEventListener('scroll', () => {
    head.classList.toggle('scrolled', scroll.scrollTop > 4);
  }, { passive: true });

  const ctl = {
    el: page,
    scroll,
    content,
    navbar: head,
    setTitle(t) { titleEl.textContent = t; },
    setSubtitle(t) {
      subEl.textContent = t || '';
      subEl.classList.toggle('hidden', !t);
    },
    /** action: {label?, icon?, onClick} | null */
    setAction(action) {
      clear(actionSlot);
      if (action) actionSlot.appendChild(actionBtn(action));
    },
    addAction(action) {
      const b = actionBtn(action);
      actionSlot.appendChild(b);
      return b;
    },
  };
  if (o.action) ctl.setAction(o.action);
  return ctl;
}
