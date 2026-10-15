// Таблица узлов: статус, протокол, адрес, группы, задержка с мини-графиком, трафик, ТСПУ.
// Используется на «Обзоре» (компактно) и в разделе «Узлы» (с перетаскиванием).
import { h, store, go, groupsOfNode, nodeSubtitle, fmtRate, dot, delayEl, tspuBadge } from '../core.js';
import { dragHandle } from '../sortable.js';

/** Мини-график задержки по последним проверкам; null — узел был недоступен. */
export function sparkline(values) {
  const vals = values || [];
  const W = 72;
  const H = 20;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'spark');
  svg.setAttribute('preserveAspectRatio', 'none');
  if (vals.length < 2) return svg;
  const nums = vals.filter((v) => typeof v === 'number' && v > 0);
  const max = Math.max(300, ...nums) * 1.1;
  const step = W / (vals.length - 1);
  let d = '';
  let pen = false;
  vals.forEach((v, i) => {
    const x = (i * step).toFixed(1);
    if (typeof v !== 'number' || v <= 0) {
      pen = false;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', Math.max(0, i * step - 1).toFixed(1));
      r.setAttribute('y', '0');
      r.setAttribute('width', '2');
      r.setAttribute('height', String(H));
      r.setAttribute('class', 'spark-fail');
      svg.appendChild(r);
      return;
    }
    const y = (H - 2 - (v / max) * (H - 4)).toFixed(1);
    d += (pen ? 'L' : 'M') + x + ' ' + y;
    pen = true;
  });
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('class', 'spark-line');
  p.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(p);
  return svg;
}

function nodeStatusOf(id) {
  return (store.status && store.status.nodes && store.status.nodes[id]) || {};
}

/** Шапка таблицы (не участвует в сортировке: без data-id). */
export function nodeTableHead(opts) {
  const o = opts || {};
  return h('div.nt-head' + (o.compact ? '.compact' : '') + (o.sortable ? '.with-handle' : ''),
    h('span'),
    h('span', { text: 'Узел' }),
    h('span.nt-c-addr', { text: 'Адрес' }),
    h('span.nt-c-groups', { text: 'Группы' }),
    h('span.nt-c-delay', { text: 'Задержка' }),
    h('span.nt-c-rate', { text: 'Скорость' }),
    h('span.nt-c-tspu', { text: 'ТСПУ' }),
    o.sortable ? h('span') : null);
}

/** Строка таблицы. opts: {sortable, compact} */
export function nodeTableRow(n, opts) {
  const o = opts || {};
  const st = nodeStatusOf(n.id);
  const groups = groupsOfNode(n.id).map((g) => g.name);
  const el = h('div.row.nt-row.tappable' + (o.compact ? '.compact' : '') + (o.sortable ? '.with-handle' : ''), { dataset: { id: n.id } },
    dot(st.alive),
    h('div.nt-name',
      h('div.row-title', { text: n.name || n.id }),
      h('div.row-sub', { text: nodeSubtitle(n) })),
    h('div.nt-c-addr.nt-mono', { text: (n.address || '') + (n.port ? ':' + n.port : ''), attrs: { title: (n.address || '') + ':' + (n.port || '') } }),
    h('div.nt-c-groups', groups.length ? groups.map((g) => h('span.nt-tag', { text: g })) : h('span.muted', { text: '—' })),
    h('div.nt-c-delay', delayEl(st.delay), sparkline(st.delayHist)),
    h('div.nt-c-rate.nt-mono', h('span', { text: '↓ ' + fmtRate(st.downRate || 0) }), h('span', { text: '↑ ' + fmtRate(st.upRate || 0) })),
    h('div.nt-c-tspu', tspuBadge(st.tspu)),
    o.sortable ? dragHandle() : null);
  if (n.enabled === false) el.classList.add('is-off');
  el.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.drag-handle')) return;
    go('/nodes/' + n.id);
  });
  return el;
}

/** Обновляет «живые» ячейки строк без перестройки (не ломает перетаскивание). */
export function refreshNodeRows(container) {
  container.querySelectorAll('.nt-row[data-id]').forEach((r) => {
    const s = nodeStatusOf(r.dataset.id);
    const d = r.querySelector('.dot');
    if (d) d.className = dot(s.alive).className;
    const cell = r.querySelector('.nt-c-delay');
    if (cell) { cell.textContent = ''; cell.appendChild(delayEl(s.delay)); cell.appendChild(sparkline(s.delayHist)); }
    const rate = r.querySelector('.nt-c-rate');
    if (rate && rate.children.length === 2) {
      rate.children[0].textContent = '↓ ' + fmtRate(s.downRate || 0);
      rate.children[1].textContent = '↑ ' + fmtRate(s.upRate || 0);
    }
    const ts = r.querySelector('.nt-c-tspu');
    if (ts) { ts.textContent = ''; ts.appendChild(tspuBadge(s.tspu)); }
  });
}
