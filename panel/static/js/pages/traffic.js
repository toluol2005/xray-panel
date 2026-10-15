// Трафик: живые скорости, график, суммы по узлам и по дням.
import {
  h, clear, api, onStatus, store, loadState, nodeName,
  fmtBytes, fmtRate, fmtDayLabel,
  section, row, emptyState, skeleton, icon,
} from '../core.js';
import { createPageEl } from '../shell.js';
import { createChart } from '../chart.js';

const POLL_MS = 5000;

function bigRates(t) {
  const tr = t || {};
  return h('div.big-rates',
    h('div.big-rate.down',
      h('div.br-lab', icon('arrowDown'), h('span', { text: 'Загрузка' })),
      h('div.br-val', { text: fmtRate(tr.downRate || 0) }),
      h('div.br-tot', { text: 'всего ' + fmtBytes(tr.down || 0) })),
    h('div.big-rate.up',
      h('div.br-lab', icon('arrowUp'), h('span', { text: 'Отдача' })),
      h('div.br-val', { text: fmtRate(tr.upRate || 0) }),
      h('div.br-tot', { text: 'всего ' + fmtBytes(tr.up || 0) })));
}

function barRow(label, up, down, max) {
  const total = (up || 0) + (down || 0);
  const pct = max > 0 ? Math.max(1.5, (total / max) * 100) : 0;
  const upPct = total > 0 ? (up / total) * pct : 0;
  const dnPct = total > 0 ? (down / total) * pct : 0;
  return h('div.bar-row',
    h('div.bar-head',
      h('span.bh-name', { text: label }),
      h('span.bh-val', { text: '↓ ' + fmtBytes(down || 0) + '   ↑ ' + fmtBytes(up || 0) })),
    h('div.bar-track',
      h('div.bar-fill.down', { style: 'width:' + dnPct + '%' }),
      h('div.bar-fill.up', { style: 'width:' + upPct + '%' })));
}

export function createPage() {
  const page = createPageEl({ title: 'Трафик' });
  const body = h('div');
  page.content.appendChild(body);
  body.appendChild(skeleton(3));

  let data = null;
  let chart = null;
  let series = 'all';
  let timer = 0;
  let destroyed = false;

  const ratesBox = h('div');
  const selectorBox = h('div');
  const chartBox = h('div');
  const totalsBox = h('div');
  const daysBox = h('div');

  function seriesPoints() {
    if (!data) return [];
    if (series === 'all') return data.total || [];
    return (data.nodes && data.nodes[series]) || [];
  }

  function renderSelector() {
    clear(selectorBox);
    if (!data) return;
    const keys = Object.keys(data.nodes || {});
    const sel = h('select.sel');
    sel.appendChild(h('option', { value: 'all', text: 'Все' }));
    keys.forEach((k) => sel.appendChild(h('option', { value: k, text: k === 'direct' ? 'Напрямую' : nodeName(k) })));
    sel.value = series;
    sel.addEventListener('change', () => {
      series = sel.value;
      if (chart) chart.setData(seriesPoints());
    });
    selectorBox.appendChild(h('div.section',
      h('div.card', h('div.row', h('div.row-main', h('div.row-title', { text: 'Показывать' })), sel))));
  }

  function renderChart() {
    if (!chart) {
      clear(chartBox);
      const canvas = h('canvas.chart-canvas');
      const tip = h('div.chart-tip');
      const boxEl = h('div.chart-box', canvas, tip,
        h('div.chart-legend',
          h('span', h('i', { style: 'background:var(--blue)' }), 'Загрузка'),
          h('span', h('i', { style: 'background:var(--green)' }), 'Отдача')));
      chartBox.appendChild(boxEl);
      chart = createChart(canvas, { tip });
    }
    const pts = seriesPoints();
    if (!pts.length) {
      chart.setData([]);
    } else {
      chart.setData(pts);
    }
  }

  function renderTotals() {
    clear(totalsBox);
    if (!data) return;
    const totals = data.totals || {};
    const keys = Object.keys(totals);
    if (!keys.length) {
      totalsBox.appendChild(section('По узлам', emptyState('Нет данных', 'Трафик пока не учитывался.', 'traffic')));
      return;
    }
    const rows = keys.map((k) => ({ k, up: totals[k].up || 0, down: totals[k].down || 0 }));
    rows.sort((a, b) => (b.up + b.down) - (a.up + a.down));
    const max = rows.length ? rows[0].up + rows[0].down : 0;
    const card = h('div.card');
    rows.forEach((r) => card.appendChild(barRow(r.k === 'direct' ? 'Напрямую' : nodeName(r.k), r.up, r.down, max)));
    totalsBox.appendChild(h('div.section',
      h('div.section-head', { text: 'По узлам' }), card,
      h('div.section-foot', { text: 'С момента запуска панели.' })));
  }

  function renderDays() {
    clear(daysBox);
    if (!data) return;
    const days = data.days || [];
    if (!days.length) return;
    const card = h('div.card');
    days.forEach((d) => {
      const nodes = d.nodes || {};
      let up = 0; let down = 0;
      Object.keys(nodes).forEach((k) => { up += nodes[k].up || 0; down += nodes[k].down || 0; });
      const detail = h('div.hidden');
      Object.keys(nodes)
        .sort((a, b) => ((nodes[b].up + nodes[b].down) - (nodes[a].up + nodes[a].down)))
        .forEach((k) => {
          detail.appendChild(h('div.conn-row',
            h('div.cr-main', h('div.cr-dest', { text: k === 'direct' ? 'Напрямую' : nodeName(k) })),
            h('div.cr-sub', { text: '↓ ' + fmtBytes(nodes[k].down || 0) + '  ↑ ' + fmtBytes(nodes[k].up || 0) })));
        });
      const r = row({
        title: fmtDayLabel(d.date),
        sub: '↓ ' + fmtBytes(down) + '   ↑ ' + fmtBytes(up),
        chevron: true,
        onClick: () => { detail.classList.toggle('hidden'); },
      });
      card.appendChild(r);
      card.appendChild(detail);
    });
    daysBox.appendChild(h('div.section', h('div.section-head', { text: 'По дням' }), card));
  }

  function renderAll() {
    renderSelector();
    renderChart();
    renderTotals();
    renderDays();
  }

  async function load() {
    if (destroyed || document.hidden) return;
    try {
      data = await api('GET', '/api/traffic');
      if (destroyed) return;
      renderAll();
    } catch (e) {
      if (e && e.status === 401) return;
      if (!data) {
        clear(chartBox);
        chartBox.appendChild(section('', emptyState('Нет данных о трафике', (e && e.message) || '', 'traffic')));
      }
    }
  }

  clear(body);
  body.appendChild(ratesBox);
  body.appendChild(selectorBox);
  body.appendChild(chartBox);
  body.appendChild(totalsBox);
  body.appendChild(daysBox);
  chartBox.appendChild(h('div.chart-box', h('div.chart-empty', { text: 'Загрузка…' })));

  const unsub = onStatus((s) => {
    clear(ratesBox);
    ratesBox.appendChild(bigRates(s && s.traffic));
  });
  clear(ratesBox);
  ratesBox.appendChild(bigRates(store.status && store.status.traffic));

  loadState().catch(() => {});
  load();
  timer = setInterval(load, POLL_MS);

  const onVis = () => { if (!document.hidden) load(); };
  document.addEventListener('visibilitychange', onVis);

  return {
    el: page.el,
    destroy() {
      destroyed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      unsub();
      if (chart) chart.destroy();
    },
  };
}
