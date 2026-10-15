// Точка входа: тема, авторизация, хэш-роутер, опрос статуса.
import { api, setUnauthorizedHandler, emitStatus, loadState, store, alertError, h } from './core.js';
import { applyTheme } from './theme.js';
import { createShell, TABS } from './shell.js';
import { showLogin } from './login.js';

const ROUTES = [
  { re: /^\/overview$/, tab: 'overview', mod: () => import('./pages/overview.js') },
  { re: /^\/groups$/, tab: 'groups', mod: () => import('./pages/groups.js') },
  { re: /^\/groups\/([^/]+)$/, tab: 'groups', mod: () => import('./pages/groups.js'), fn: 'createDetailPage' },
  { re: /^\/nodes$/, tab: 'nodes', mod: () => import('./pages/nodes.js') },
  { re: /^\/nodes\/([^/]+)$/, tab: 'nodes', mod: () => import('./pages/nodes.js'), fn: 'createDetailPage' },
  { re: /^\/traffic$/, tab: 'traffic', mod: () => import('./pages/traffic.js') },
  { re: /^\/logs$/, tab: 'logs', mod: () => import('./pages/logs.js') },
  { re: /^\/settings$/, tab: 'settings', mod: () => import('./pages/settings.js') },
];

const root = document.getElementById('app');
let shell = null;
let currentPage = null;
let currentPath = '';
let pollTimer = 0;
let loggedOut = false;
let routeToken = 0;

/* ------------------------- роутинг ------------------------- */

function currentHash() {
  const hash = location.hash.replace(/^#/, '');
  return hash && hash[0] === '/' ? hash : '/overview';
}

function depthOf(path) { return path.split('/').filter(Boolean).length; }

function navigate(path) {
  if (location.hash === '#' + path) { route(); return; }
  location.hash = '#' + path;
}

async function route() {
  if (loggedOut || !shell) return;
  const path = currentHash();
  if (path === currentPath && currentPage) return;

  let match = null;
  let params = [];
  for (const r of ROUTES) {
    const m = r.re.exec(path);
    if (m) { match = r; params = m.slice(1); break; }
  }
  if (!match) { navigate('/overview'); return; }

  const token = ++routeToken;
  const prevPath = currentPath;
  currentPath = path;
  shell.setActiveTab(match.tab);

  let mod;
  try {
    mod = await match.mod();
  } catch (e) {
    console.error(e);
    alertError({ message: 'Не удалось загрузить раздел', detail: String(e) });
    return;
  }
  if (token !== routeToken) return;

  const factory = mod[match.fn || 'createPage'];
  if (typeof factory !== 'function') {
    console.error('нет фабрики страницы', path);
    return;
  }

  let page;
  try {
    page = factory({ params, path, navigate });
  } catch (e) {
    console.error(e);
    alertError({ message: 'Ошибка отображения раздела', detail: String((e && e.stack) || e) });
    return;
  }

  const mode = !prevPath ? 'swap'
    : depthOf(path) > depthOf(prevPath) ? 'push'
      : depthOf(path) < depthOf(prevPath) ? 'pop' : 'swap';

  const old = currentPage;
  currentPage = page;
  shell.mount(page.el, mode);
  if (old && old.destroy) {
    setTimeout(() => { try { old.destroy(); } catch (e) { console.error(e); } }, 400);
  }
}

/* ------------------------- опрос статуса ------------------------- */

async function pollStatus() {
  if (document.hidden || loggedOut) return;
  try {
    const s = await api('GET', '/api/status');
    store.statusError = null;
    emitStatus(s);
  } catch (e) {
    if (e && e.status === 401) return;
    store.statusError = e;
  }
}

function startPolling() {
  stopPolling();
  pollStatus();
  pollTimer = setInterval(pollStatus, 2500);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPolling();
  else if (!loggedOut) startPolling();
});

/* ------------------------- загрузка ------------------------- */

function showBoot(text) {
  root.textContent = '';
  root.appendChild(h('div.boot-screen',
    h('div', { style: 'text-align:center' },
      h('div.spinner.spinner-lg', { style: 'margin:0 auto 14px' }),
      text ? h('div.muted', { text, style: 'font-size:14px' }) : null)));
}

function toLogin() {
  loggedOut = true;
  stopPolling();
  currentPage = null;
  currentPath = '';
  shell = null;
  showLogin(root, () => { loggedOut = false; boot(); });
}

async function boot() {
  applyTheme();
  showBoot('Подключение к панели…');

  let auth = null;
  try {
    auth = await api('GET', '/api/auth/status');
  } catch (e) {
    if (e && e.status === 401) { toLogin(); return; }
    root.textContent = '';
    root.appendChild(h('div.boot-screen',
      h('div', { style: 'text-align:center;padding:24px' },
        h('div', { text: 'Нет связи с панелью', style: 'font-size:17px;font-weight:600;margin-bottom:8px' }),
        h('div.muted', { text: (e && e.message) || '', style: 'font-size:14px;margin-bottom:16px' }),
        h('button.btn.sm', { text: 'Повторить', onClick: () => boot() }))));
    return;
  }
  store.auth = auth;
  if (auth && auth.authRequired && !auth.authenticated) { toLogin(); return; }

  loggedOut = false;
  try {
    await loadState(true);
  } catch (e) {
    if (e && e.status === 401) { toLogin(); return; }
    console.error(e);
  }

  shell = createShell(root, navigate);
  currentPath = '';
  currentPage = null;
  await route();
  startPolling();
}

setUnauthorizedHandler(() => { if (!loggedOut) toLogin(); });
window.addEventListener('hashchange', () => { route(); });

if (!location.hash) location.replace(location.pathname + location.search + '#/overview');

// Экспорт для отладки из консоли.
window.XP = { navigate, store, TABS, reboot: boot };

boot();
