// Обзор — единый дашборд: показатели, график трафика, цепочки групп, узлы, события.
import {
  h, clear, api, onStatus, store, loadState, nodeById, go,
  fmtBytes, fmtRate, fmtDuration, fmtTime,
  STRATEGY_LABELS, STATE_LABELS,
  dot, pill, delayEl, emptyState, skeleton, icon,
} from '../core.js';
import { createPageEl } from '../shell.js';
import { createChart } from '../chart.js';
import { nodeTableHead, nodeTableRow, refreshNodeRows } from '../lib/nodetable.js';

const TRAFFIC_MS = 5000;

function stat(label, iconName, value, sub, cls) {
  return h('div.stat' + (cls ? '.' + cls : ''),
    h('div.stat-lab', iconName ? icon(iconName) : null, h('span', { text: label })),
    h('div.stat-val' + (String(value).length > 9 ? '.sm' : ''), { text: String(value) }),
    h('div.stat-sub', { text: sub || '' }));
}

function statsRow(status) {
  const xr = (status && status.xray) || {};
  const tr = (status && status.traffic) || {};
  const nodes = (store.state && store.state.nodes) || [];
  const map = (status && status.nodes) || {};
  let alive = 0;
  nodes.forEach((n) => { if (map[n.id] && map[n.id].alive) alive += 1; });

  return h('div.dash-grid',
    stat('xray', 'bolt', xr.running ? 'Работает' : 'Остановлен',
      (xr.version ? xr.version : 'версия неизвестна') + (xr.pid ? ' · pid ' + xr.pid : ''),
      xr.running ? 'good' : 'bad'),
    stat('Время работы', 'clock', xr.running ? fmtDuration(xr.uptime || 0) : '—',
      'перезапусков: ' + (xr.restarts === undefined ? 0 : xr.restarts)),
    stat('Загрузка', 'arrowDown', fmtRate(tr.downRate || 0), 'всего ' + fmtBytes(tr.down || 0), 'accent'),
    stat('Отдача', 'arrowUp', fmtRate(tr.upRate || 0), 'всего ' + fmtBytes(tr.up || 0)),
    stat('Узлы', 'nodes', alive + ' / ' + nodes.length, 'доступно сейчас',
      nodes.length && alive === 0 ? 'bad' : ''));
}

/* ---------------- Цепочка группы ---------------- */

function chainItem(text, opts) {
  const o = opts || {};
  let cls = '.chain-item';
  if (o.active) cls += '.is-active';
  if (o.dead) cls += '.is-dead';
  if (o.fallback) cls += '.is-fallback';
  if (o.port) cls += '.is-port';
  return h('div' + cls,
    o.dotState !== undefined ? dot(o.dotState) : null,
    h('span.ci-name', { text }),
    o.pinned ? icon('pin', 'pin-ico') : null,
    o.delay !== undefined && o.delay !== null ? delayEl(o.delay) : null);
}

function groupCard(g, status) {
  const st = STATE_LABELS[g.state] || STATE_LABELS.down;
  const dotCls = g.state === 'ok' ? 'alive' : g.state === 'degraded' ? 'degraded'
    : g.state === 'disabled' ? 'unknown' : 'dead';

  const card = h('button.group-card', { type: 'button' });
  card.addEventListener('click', () => go('/groups/' + g.id));

  card.appendChild(h('div.gc-head',
    h('span.dot.lg.' + dotCls),
    h('span.gc-name.grow.nowrap', { text: g.name || g.id }),
    pill(st.text, st.cls),
    icon('chevron', 'chevron')));

  const activeName = g.active === 'direct' ? 'напрямую'
    : g.active === 'block' ? 'блокировка'
      : (g.activeName || (g.active ? g.active : 'нет'));
  card.appendChild(h('div.gc-meta',
    h('span', { text: STRATEGY_LABELS[g.strategy] || g.strategy || '' }),
    h('span', { text: '·' }),
    h('span', { text: 'активно: ' + activeName }),
    g.pinned ? pill('закреплено', 'blue') : null,
    h('span.grow'),
    h('div.rate-pair',
      h('span.rate.down', icon('arrowDown'), h('span', { text: fmtRate(g.downRate || 0) })),
      h('span.rate.up', icon('arrowUp'), h('span', { text: fmtRate(g.upRate || 0) })))));

  const stNodes = (status && status.nodes) || {};
  const full = store.state;
  const grp = full && full.groups ? full.groups.filter((x) => x.id === g.id)[0] : null;
  const ids = (grp && grp.nodes) || [];
  const chain = h('div.gc-chain');
  chain.appendChild(chainItem(':' + g.port, { port: true }));
  if (!ids.length) {
    chain.appendChild(h('span.chain-arrow', { text: '→' }));
    chain.appendChild(chainItem('нет узлов', { dead: true }));
  }
  ids.forEach((id) => {
    const n = nodeById(id);
    const s = stNodes[id] || {};
    chain.appendChild(h('span.chain-arrow', { text: '→' }));
    chain.appendChild(chainItem((n && n.name) || id, {
      active: g.active === id,
      dead: s.alive === false,
      dotState: s.alive,
      pinned: g.pinned === id,
      delay: s.delay,
    }));
  });
  const fb = (grp && grp.fallback) || 'direct';
  chain.appendChild(h('span.chain-arrow', { text: '→' }));
  chain.appendChild(chainItem(fb === 'block' ? 'блокировка' : 'напрямую', {
    fallback: true,
    active: g.active === 'direct' || g.active === 'block',
    pinned: g.pinned === 'direct' || g.pinned === 'block',
  }));
  card.appendChild(chain);
  return card;
}

function eventRow(ev) {
  const lvl = ev.level || 'info';
  const ico = lvl === 'error' ? icon('xCircle', 'ev-ico c-red')
    : lvl === 'warn' || lvl === 'warning' ? icon('warnTriangle', 'ev-ico c-orange')
      : icon('infoCircle', 'ev-ico c-blue');
  return h('div.event-row', ico,
    h('div.ev-txt', { text: ev.text || '' }),
    h('div.ev-ts', { text: fmtTime(ev.ts) }));
}

function sectionBox(title, extra) {
  const head = h('div.section-head', { text: title });
  if (extra) head.appendChild(extra);
  return h('div.section', head);
}

/* ---------------- Страница ---------------- */

export function createPage() {
  const page = createPageEl({ title: 'Обзор' });
  const body = h('div');
  page.content.appendChild(body);

  const statsBox = h('div');
  const errBox = h('div');
  const chartSec = h('div.section');
  const groupsBox = h('div');
  const nodesBox = h('div');
  const eventsBox = h('div');
  body.appendChild(statsBox);
  body.appendChild(errBox);
  body.appendChild(chartSec);
  body.appendChild(groupsBox);
  body.appendChild(nodesBox);
  body.appendChild(eventsBox);
  statsBox.appendChild(skeleton(1));

  let chart = null;
  let destroyed = false;
  let trafficTimer = 0;
  let nodeKey = '';

  /* --- график --- */
  chartSec.appendChild(h('div.section-head', { text: 'Трафик' }));
  const chartHost = h('div');
  chartSec.appendChild(chartHost);
  chartHost.appendChild(h('div.chart-box', h('div.chart-empty', { text: 'Загрузка…' })));

  function ensureChart() {
    if (chart) return;
    clear(chartHost);
    const canvas = h('canvas.chart-canvas');
    const tip = h('div.chart-tip');
    chartHost.appendChild(h('div.chart-box.tall', canvas, tip,
      h('div.chart-legend',
        h('span', h('i', { style: 'background:var(--blue)' }), 'Загрузка'),
        h('span', h('i', { style: 'background:var(--green)' }), 'Отдача'))));
    chart = createChart(canvas, { tip });
  }

  async function loadTraffic() {
    if (destroyed || document.hidden) return;
    try {
      const data = await api('GET', '/api/traffic');
      if (destroyed) return;
      const pts = (data && data.total) || [];
      if (!pts.length && !chart) {
        clear(chartHost);
        chartHost.appendChild(h('div.chart-box', h('div.chart-empty', { text: 'Пока нет данных о трафике' })));
        return;
      }
      ensureChart();
      chart.setData(pts);
    } catch (e) {
      if (!chart) {
        clear(chartHost);
        chartHost.appendChild(h('div.chart-box',
          h('div.chart-empty', { text: 'Нет данных: ' + ((e && e.message) || 'ошибка') })));
      }
    }
  }

  /* --- остальные блоки --- */
  function renderGroups(status) {
    clear(groupsBox);
    const groups = (status && status.groups) || [];
    const sec = sectionBox('Группы');
    if (!groups.length) {
      sec.appendChild(h('div.card', emptyState('Нет групп', 'Создайте группу на вкладке «Группы».', 'groups')));
    } else {
      const grid = h('div.dash-cols' + (groups.length > 2 ? '.wide3' : ''));
      groups.forEach((g) => grid.appendChild(groupCard(g, status)));
      sec.appendChild(grid);
    }
    groupsBox.appendChild(sec);
  }

  function renderNodes(status) {
    const nodes = (store.state && store.state.nodes) || [];
    const key = nodes.map((n) => n.id).join(',');
    if (key === nodeKey && nodesBox.firstChild) {
      refreshNodeRows(nodesBox);
      return;
    }
    nodeKey = key;
    clear(nodesBox);
    const sec = sectionBox('Узлы');
    if (!nodes.length) {
      sec.appendChild(h('div.card', emptyState('Нет узлов', 'Добавьте первый, вставив ссылку vless://', 'nodes')));
      nodesBox.appendChild(sec);
      return;
    }
    const card = h('div.card', nodeTableHead({ compact: true }));
    nodes.forEach((n) => card.appendChild(nodeTableRow(n, { compact: true })));
    sec.appendChild(card);
    nodesBox.appendChild(sec);
    if (status) refreshNodeRows(nodesBox);
  }

  function renderEvents(status) {
    clear(eventsBox);
    const events = (status && status.events) || [];
    if (!events.length) return;
    const sec = sectionBox('События');
    const card = h('div.card');
    events.slice(0, 12).forEach((ev) => card.appendChild(eventRow(ev)));
    sec.appendChild(card);
    eventsBox.appendChild(sec);
  }

  function render(status) {
    if (!status) return;
    clear(statsBox);
    statsBox.appendChild(statsRow(status));

    clear(errBox);
    const err = status.xray && status.xray.lastError;
    if (err) {
      errBox.appendChild(h('div.section',
        h('div.section-head', { text: 'Ошибка xray' }),
        h('div.err-mono', { text: String(err) })));
    }
    renderGroups(status);
    renderNodes(status);
    renderEvents(status);
  }

  loadState().then(() => render(store.status)).catch(() => {});
  const unsub = onStatus(render);
  if (store.status) render(store.status);

  loadTraffic();
  trafficTimer = setInterval(loadTraffic, TRAFFIC_MS);
  const onVis = () => { if (!document.hidden) loadTraffic(); };
  document.addEventListener('visibilitychange', onVis);

  return {
    el: page.el,
    destroy() {
      destroyed = true;
      clearInterval(trafficTimer);
      document.removeEventListener('visibilitychange', onVis);
      unsub();
      if (chart) chart.destroy();
    },
  };
}
