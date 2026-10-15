// Группы: список с перетаскиванием и создание новой группы.
import {
  h, clear, api, go, onStatus, store, loadState, refreshState,
  STRATEGY_LABELS, STATE_LABELS,
  section, row, dot, pill, inputRow, emptyState, skeleton, icon,
  openSheet, toast, alertError, toInt,
} from '../core.js';
import { createPageEl } from '../shell.js';
import { makeSortable, dragHandle, applyOrder } from '../sortable.js';

export { createDetailPage } from './group-detail.js';

/** Строка группы с ручкой перетаскивания. */
function groupRow(g, st) {
  const s = st || {};
  const label = STATE_LABELS[s.state] || (g.enabled === false ? STATE_LABELS.disabled : STATE_LABELS.down);
  const dotCls = s.state === 'ok' ? 'alive' : s.state === 'degraded' ? 'degraded'
    : (g.enabled === false || s.state === 'disabled') ? 'unknown' : 'dead';

  const el = h('div.row.tappable', { dataset: { id: g.id } },
    h('span.dot.' + dotCls),
    h('div.row-main',
      h('div.row-title', { text: g.name || g.id }),
      h('div.row-sub', {
        text: ':' + g.port + ' · ' + (STRATEGY_LABELS[g.strategy] || g.strategy || '') +
          ' · ' + (g.nodes || []).length + ' узл.',
      })),
    h('div.row-aside', pill(label.text, label.cls)),
    icon('chevron', 'chevron'),
    dragHandle());

  el.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.drag-handle')) return;
    go('/groups/' + g.id);
  });
  return el;
}

/* ---------------- Лист создания группы ---------------- */

function newGroupSheet(onCreated) {
  const nodes = (store.state && store.state.nodes) || [];
  const selected = new Set();

  const nameRow = inputRow('Название', '', { placeholder: 'основной' });
  const portRow = inputRow('Порт', '', { placeholder: '7891', type: 'number', inputmode: 'numeric' });

  const listCard = h('div.card');
  if (!nodes.length) {
    listCard.appendChild(emptyState('Нет узлов', 'Сначала добавьте узлы на вкладке «Узлы».', 'nodes'));
  }
  nodes.forEach((n) => {
    const r = row({
      lead: dot((store.status && store.status.nodes && store.status.nodes[n.id] || {}).alive),
      title: n.name || n.id,
      sub: n.address + ':' + n.port,
      onClick: () => {
        if (selected.has(n.id)) selected.delete(n.id); else selected.add(n.id);
        r.classList.toggle('row-selected', selected.has(n.id));
        const mark = r.querySelector('.checkmark');
        if (mark) mark.remove();
        if (selected.has(n.id)) r.appendChild(icon('check', 'checkmark'));
      },
    });
    listCard.appendChild(r);
  });

  openSheet({
    title: 'Новая группа',
    doneText: 'Создать',
    build(body) {
      body.appendChild(section('', [nameRow, portRow],
        'Порт, на котором группа будет принимать SOCKS5-подключения.'));
      const sec = h('div.section', h('div.section-head', { text: 'Узлы' }), listCard,
        h('div.section-foot', { text: 'Порядок приоритета можно изменить на странице группы.' }));
      body.appendChild(sec);
    },
    async onDone(ctl) {
      const name = nameRow.getValue();
      const port = toInt(portRow.getValue(), 0);
      if (!name) { toast('Введите название', 'err'); return; }
      if (port < 1 || port > 65535) { toast('Некорректный порт', 'err'); return; }
      ctl.setBusy(true);
      try {
        await api('POST', '/api/groups', {
          name, port, enabled: true, listen: '0.0.0.0', udp: true,
          nodes: Array.from(selected), strategy: 'priority', fallback: 'direct',
          pinned: null, routing: 'geo', username: '', password: '',
        });
        await refreshState();
        ctl.close(true);
        toast('Группа создана');
        if (onCreated) onCreated();
      } catch (e) {
        ctl.setBusy(false);
        alertError(e, 'Не удалось создать группу');
      }
    },
  });
}

/* ---------------- Страница списка ---------------- */

export function createPage() {
  const page = createPageEl({ title: 'Группы' });
  const body = h('div');
  page.content.appendChild(body);
  body.appendChild(skeleton(3));

  page.setAction({ icon: 'plus', onClick: () => newGroupSheet(() => render()) });

  let sortable = null;

  function render() {
    if (sortable) { sortable.destroy(); sortable = null; }
    clear(body);
    const st = store.state;
    if (!st) { body.appendChild(skeleton(3)); return; }
    const groups = st.groups || [];
    if (!groups.length) {
      body.appendChild(section('', emptyState('Нет групп',
        'Группа — это локальный порт, который распределяет трафик между узлами. Нажмите «+».', 'groups')));
      return;
    }

    const statusMap = {};
    ((store.status && store.status.groups) || []).forEach((g) => { statusMap[g.id] = g; });

    const card = h('div.card');
    groups.forEach((g) => card.appendChild(groupRow(g, statusMap[g.id])));
    const sec = h('div.section',
      h('div.section-head', { text: 'Порядок отображения' }),
      card,
      h('div.section-foot', { text: 'Потяните за ≡, чтобы изменить порядок групп.' }));
    body.appendChild(sec);

    let prevOrder = groups.map((g) => g.id);
    sortable = makeSortable(card, async (ids) => {
      const old = prevOrder.slice();
      prevOrder = ids.slice();
      try {
        await api('POST', '/api/groups/reorder', { ids });
        await refreshState();
        toast('Порядок сохранён');
      } catch (e) {
        prevOrder = old;
        applyOrder(card, old);
        alertError(e, 'Не удалось изменить порядок');
      }
    });
  }

  const unsub = onStatus(() => {
    // обновляем только пилюли состояния, чтобы не ломать перетаскивание
    const statusMap = {};
    ((store.status && store.status.groups) || []).forEach((g) => { statusMap[g.id] = g; });
    body.querySelectorAll('.row[data-id]').forEach((r) => {
      const s = statusMap[r.dataset.id];
      if (!s) return;
      const label = STATE_LABELS[s.state] || STATE_LABELS.down;
      const p = r.querySelector('.pill');
      if (p) { p.textContent = label.text; p.className = 'pill ' + label.cls; }
      const d = r.querySelector('.dot');
      if (d) {
        d.className = 'dot ' + (s.state === 'ok' ? 'alive' : s.state === 'degraded' ? 'degraded'
          : s.state === 'disabled' ? 'unknown' : 'dead');
      }
    });
  });

  loadState().then(render).catch((e) => {
    clear(body);
    body.appendChild(section('', emptyState('Ошибка загрузки', (e && e.message) || '', 'warnTriangle')));
  });

  return {
    el: page.el,
    destroy() { unsub(); if (sortable) sortable.destroy(); },
  };
}
