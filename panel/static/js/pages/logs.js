// Журнал: системный журнал (tail), подключения, события.
import {
  h, clear, api, fmtTime, segmented, icon, section, emptyState, toast,
} from '../core.js';
import { createPageEl } from '../shell.js';
import { renderConnections, renderEvents } from './connections.js';

const MAX_LINES = 2000;
const HL = /(failed|REALITY|timeout|dead|rejected)/gi;

const FILTERS = [
  ['all', 'Все'],
  ['error', 'Ошибки'],
  ['warning', 'Предупреждения'],
  ['access', 'Подключения'],
];

function lineEl(l) {
  const el = h('div.log-line.lv-' + (l.level || 'info'));
  el.appendChild(h('span.ll-ts', { text: fmtTime(l.ts) }));
  const txt = h('div.ll-txt');
  const s = String(l.text || '');
  let last = 0;
  HL.lastIndex = 0;
  let m = HL.exec(s);
  while (m) {
    if (m.index > last) txt.appendChild(document.createTextNode(s.slice(last, m.index)));
    txt.appendChild(h('mark', { text: m[0] }));
    last = m.index + m[0].length;
    m = HL.exec(s);
  }
  if (last < s.length) txt.appendChild(document.createTextNode(s.slice(last)));
  el.appendChild(txt);
  return el;
}

function matches(l, filter, query) {
  if (filter === 'error' && l.level !== 'error') return false;
  if (filter === 'warning' && l.level !== 'warning' && l.level !== 'error') return false;
  if (filter === 'access' && l.level !== 'access') return false;
  if (query && String(l.text || '').toLowerCase().indexOf(query) < 0) return false;
  return true;
}

export function createPage() {
  const page = createPageEl({ title: 'Журнал' });
  const body = h('div');
  page.content.appendChild(body);

  let tab = 'logs';
  let destroyed = false;

  const tabsBox = h('div.section', h('div', { style: 'margin:0 16px' }));
  const seg = segmented('logs', [['logs', 'Журнал'], ['conn', 'Подключения'], ['events', 'События']], (v) => {
    tab = v;
    renderTab();
  });
  tabsBox.firstChild.appendChild(seg);
  body.appendChild(tabsBox);

  const pane = h('div');
  body.appendChild(pane);

  /* ---------------- панель журнала ---------------- */
  let lines = [];
  let seq = 0;
  let filter = 'all';
  let query = '';
  let paused = false;
  let timer = 0;
  let logBox = null;
  let autoscroll = true;
  let pauseBtn = null;

  function rebuild() {
    if (!logBox) return;
    clear(logBox);
    const visible = lines.filter((l) => matches(l, filter, query));
    if (!visible.length) {
      logBox.appendChild(h('div.muted', { text: 'Пусто', style: 'padding:14px;text-align:center' }));
      return;
    }
    visible.slice(-MAX_LINES).forEach((l) => logBox.appendChild(lineEl(l)));
    if (autoscroll) logBox.scrollTop = logBox.scrollHeight;
  }

  function appendNew(fresh) {
    if (!logBox) return;
    const placeholder = logBox.querySelector('.muted');
    let added = 0;
    fresh.forEach((l) => {
      if (!matches(l, filter, query)) return;
      if (placeholder && !added) clear(logBox);
      logBox.appendChild(lineEl(l));
      added++;
    });
    while (logBox.children.length > MAX_LINES) logBox.removeChild(logBox.firstChild);
    if (added && autoscroll) logBox.scrollTop = logBox.scrollHeight;
  }

  async function pollLogs() {
    if (destroyed || paused || document.hidden || tab !== 'logs') return;
    try {
      const res = await api('GET', '/api/logs?since=' + seq + '&limit=500');
      if (destroyed) return;
      const fresh = (res && res.lines) || [];
      if (res && res.seq !== undefined) seq = res.seq;
      if (!fresh.length) return;
      lines = lines.concat(fresh);
      if (lines.length > MAX_LINES * 2) lines = lines.slice(-MAX_LINES * 2);
      appendNew(fresh);
    } catch (e) {
      if (e && e.status === 401) return;
      if (!lines.length && logBox) {
        clear(logBox);
        logBox.appendChild(h('div.muted', { text: (e && e.message) || 'Не удалось получить журнал', style: 'padding:14px;text-align:center' }));
      }
    }
  }

  function renderLogsPane() {
    clear(pane);

    const chips = h('div.chips');
    FILTERS.forEach(([v, t]) => {
      const c = h('button.chip' + (v === filter ? '.active' : ''), { type: 'button', text: t });
      c.addEventListener('click', () => {
        filter = v;
        chips.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
        c.classList.add('active');
        rebuild();
      });
      chips.appendChild(c);
    });

    const input = h('input', { attrs: { type: 'search', placeholder: 'Поиск по журналу', autocapitalize: 'off', autocorrect: 'off' } });
    const clearBtn = h('button.sb-clear.hidden', { type: 'button' }, icon('xCircle'));
    clearBtn.addEventListener('click', () => { input.value = ''; query = ''; clearBtn.classList.add('hidden'); rebuild(); });
    input.addEventListener('input', () => {
      query = input.value.trim().toLowerCase();
      clearBtn.classList.toggle('hidden', !query);
      rebuild();
    });
    const sb = h('div.searchbar', icon('search'), input, clearBtn);

    logBox = h('div.log-view', {
      style: 'max-height:calc(100vh - 300px);min-height:220px;overflow-y:auto;-webkit-overflow-scrolling:touch',
    });
    logBox.addEventListener('scroll', () => {
      autoscroll = logBox.scrollTop + logBox.clientHeight >= logBox.scrollHeight - 24;
    }, { passive: true });

    const clearRow = h('div.btn-row', { style: 'margin-top:14px' },
      h('button.btn.gray', {
        type: 'button', text: 'Очистить',
        onClick: () => { lines = []; rebuild(); toast('Журнал очищен на экране'); },
      }));

    pane.appendChild(sb);
    pane.appendChild(chips);
    pane.appendChild(h('div.section', logBox));
    pane.appendChild(clearRow);
    rebuild();
    pollLogs();
  }

  function setPauseAction() {
    page.setAction(null);
    if (tab !== 'logs') return;
    pauseBtn = page.addAction({
      icon: paused ? 'play' : 'pause',
      title: paused ? 'Продолжить' : 'Пауза',
      onClick: () => {
        paused = !paused;
        setPauseAction();
        toast(paused ? 'Пауза' : 'Продолжено', 'none');
        if (!paused) pollLogs();
      },
    });
    void pauseBtn;
  }

  /* ---------------- переключение вкладок ---------------- */
  function renderTab() {
    setPauseAction();
    if (tab === 'logs') { renderLogsPane(); return; }
    clear(pane);
    const holder = h('div');
    pane.appendChild(holder);
    if (tab === 'conn') {
      renderConnections(holder).catch((e) => {
        clear(holder);
        holder.appendChild(section('', emptyState('Ошибка', (e && e.message) || '', 'warnTriangle')));
      });
    } else {
      renderEvents(holder).catch((e) => {
        clear(holder);
        holder.appendChild(section('', emptyState('Ошибка', (e && e.message) || '', 'warnTriangle')));
      });
    }
  }

  renderTab();
  timer = setInterval(pollLogs, 2000);

  const onVis = () => { if (!document.hidden) pollLogs(); };
  document.addEventListener('visibilitychange', onVis);

  return {
    el: page.el,
    destroy() {
      destroyed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
