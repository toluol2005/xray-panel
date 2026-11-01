// Узлы: список с перетаскиванием, подписки, импорт ссылок/подписки, переход к узлу.
import {
  h, clear, api, onStatus, store, loadState, refreshState,
  section, emptyState, skeleton, textArea,
  openSheet, actionSheet, toast, alertError, iosAlert, busy,
  icon, fmtRel, plural,
} from '../core.js';
import { createPageEl } from '../shell.js';
import { makeSortable, applyOrder } from '../sortable.js';
import { nodeTableHead, nodeTableRow, refreshNodeRows } from '../lib/nodetable.js';
import { openNodeEditor } from './node-editor.js';

export { createDetailPage } from './node-detail.js';

/* ---------------- Импорт ссылок / подписки ---------------- */

function importSheet(onDone) {
  const ta = textArea('', 'vless://...\nvmess://...\nили ссылка на подписку https://…', 7);
  const groups = (store.state && store.state.groups) || [];
  const sel = h('select.sel');
  sel.appendChild(h('option', { value: '', text: 'не добавлять' }));
  groups.forEach((g) => sel.appendChild(h('option', { value: g.id, text: g.name })));

  openSheet({
    title: 'Вставить ссылку',
    doneText: 'Добавить',
    build(body) {
      body.appendChild(section('Ссылки', [h('div', ta)],
        'По одной ссылке в строке. Поддерживаются vless://, vmess://, trojan://, ss:// и URL подписки.'));
      if (groups.length) {
        body.appendChild(section('Добавить в группу',
          [h('div.row', h('div.row-main', h('div.row-title', { text: 'Группа' })), sel)]));
      }
      setTimeout(() => ta.focus(), 120);
    },
    async onDone(ctl) {
      const text = ta.value.trim();
      if (!text) { toast('Вставьте ссылку', 'err'); return; }
      ctl.setBusy(true);
      try {
        const body = { text };
        if (sel.value) body.group = sel.value;
        const res = await api('POST', '/api/nodes/import', body);
        await refreshState();
        ctl.close(true);
        await reportImport(res);
        if (onDone) onDone();
      } catch (e) {
        ctl.setBusy(false);
        alertError(e, 'Не удалось импортировать');
      }
    },
  });
}

/* ---------------- Подписки ---------------- */

function importSummary(res) {
  const added = (res.added || []).length;
  const parts = [];
  if (res.subscription) {
    if (res.updated) parts.push('обновлено: ' + res.updated);
    if (added) parts.push('добавлено: ' + added);
    if (res.removed) parts.push('удалено: ' + res.removed);
  } else if (added) {
    parts.push('добавлено: ' + added);
  }
  return parts.join(', ');
}

async function reportImport(res) {
  const errors = res.errors || [];
  const summary = importSummary(res);
  if (errors.length || (res.subscription && res.removed)) {
    const detail = [];
    if (errors.length) detail.push('Не распознаны строки:\n' + errors.join('\n'));
    if (res.removed) detail.push('Удалены узлы, исчезнувшие из подписки.');
    const added = (res.added || []).length;
    await iosAlert({
      title: res.subscription ? 'Подписка обновлена'
        : (added ? 'Добавлено: ' + added : 'Ничего не добавлено'),
      message: summary ? summary + '.' : 'изменений нет.',
      detail: detail.join('\n\n'),
    });
  } else {
    toast(res.subscription ? 'Подписка обновлена (' + (summary || 'изменений нет') + ')'
      : 'Добавлено узлов: ' + (res.added || []).length);
  }
}

async function refreshSub(s, onDone) {
  const b = busy('Обновление подписки…');
  try {
    const res = await api('POST', '/api/subscriptions/' + encodeURIComponent(s.id) + '/refresh');
    await refreshState();
    b.close();
    await reportImport(res);
    if (onDone) onDone();
  } catch (e) {
    b.close();
    alertError(e, 'Не удалось обновить подписку');
  }
}

async function removeSub(s, onDone) {
  const v = await actionSheet({
    title: 'Удалить подписку «' + s.name + '»?',
    message: 'Узлы, пришедшие из неё, можно удалить вместе с ней.',
    actions: [
      { text: 'Только подписку (узлы останутся)', value: 'sub' },
      { text: 'Подписку и её узлы', value: 'nodes', style: 'destructive' },
    ],
  });
  if (!v) return;
  try {
    await api('DELETE', '/api/subscriptions/' + encodeURIComponent(s.id)
      + (v === 'nodes' ? '?nodes=true' : ''));
    await refreshState();
    toast(v === 'nodes' ? 'Подписка и её узлы удалены' : 'Подписка удалена');
    if (onDone) onDone();
  } catch (e) {
    alertError(e, 'Не удалось удалить подписку');
  }
}

function renderSubs(body, rerender) {
  const subs = (store.state && store.state.subscriptions) || [];
  if (!subs.length) return;
  const all = (store.state && store.state.nodes) || [];
  const list = h('div');
  subs.forEach((s) => {
    const count = all.filter((n) => n.sub === s.id).length;
    const upd = h('button.btn.sm', { type: 'button', title: 'Обновить подписку' }, icon('restart'));
    const del = h('button.btn.sm.gray', { type: 'button', title: 'Удалить подписку' }, icon('trash'));
    upd.addEventListener('click', () => refreshSub(s, rerender));
    del.addEventListener('click', () => removeSub(s, rerender));
    list.appendChild(h('div.row',
      h('div.row-main',
        h('div.row-title', { text: s.name }),
        h('div.row-sub', { text: count + ' ' + plural(count, 'узел', 'узла', 'узлов')
          + ' · ' + (s.updatedAt ? 'обновлялась ' + fmtRel(s.updatedAt) : 'ещё не обновлялась') })),
      upd, del));
  });
  body.appendChild(h('div.section',
    h('div.section-head', { text: 'Подписки' }),
    h('div.card', list),
    h('div.section-foot', { text: '«Обновить» — скачать подписку заново и сверить узлы: изменённые обновятся, новые добавятся, исчезнувшие удалятся. Повторная вставка той же ссылки через «+» тоже обновляет подписку.' })));
}

async function addMenu(onDone) {
  const v = await actionSheet({
    title: 'Новый узел',
    message: 'Как добавить узел?',
    actions: [
      { text: 'Вставить ссылку / подписку', value: 'import' },
      { text: 'Заполнить вручную', value: 'manual' },
    ],
  });
  if (v === 'import') importSheet(onDone);
  else if (v === 'manual') openNodeEditor(null, onDone);
}

/* ---------------- Страница списка ---------------- */

export function createPage() {
  const page = createPageEl({ title: 'Узлы' });
  const body = h('div');
  page.content.appendChild(body);
  body.appendChild(skeleton(4));

  let sortable = null;

  page.setAction({ icon: 'plus', onClick: () => addMenu(() => render()) });

  function render() {
    if (sortable) { sortable.destroy(); sortable = null; }
    clear(body);
    const st = store.state;
    if (!st) { body.appendChild(skeleton(4)); return; }
    const nodes = st.nodes || [];
    renderSubs(body, () => render());
    if (!nodes.length) {
      body.appendChild(section('', emptyState('Нет узлов',
        'Добавьте первый, вставив ссылку vless://', 'nodes')));
      const btn = h('button.btn', { type: 'button', text: 'Вставить ссылку' });
      btn.addEventListener('click', () => importSheet(() => render()));
      body.appendChild(h('div.btn-row', btn));
      return;
    }

    const list = h('div');
    nodes.forEach((n) => list.appendChild(nodeTableRow(n, { sortable: true })));
    const card = h('div.card', nodeTableHead({ sortable: true }), list);
    body.appendChild(h('div.section',
      h('div.section-head', { text: 'Все узлы · ' + nodes.length }),
      card,
      h('div.section-foot', { text: 'Потяните за ≡, чтобы изменить порядок в общем списке. Приоритет внутри группы настраивается на странице группы.' })));

    let prev = nodes.map((n) => n.id);
    sortable = makeSortable(list, async (ids) => {
      const old = prev.slice();
      prev = ids.slice();
      try {
        await api('POST', '/api/nodes/reorder', { ids });
        await refreshState();
        toast('Порядок сохранён');
      } catch (e) {
        prev = old;
        applyOrder(list, old);
        alertError(e, 'Не удалось изменить порядок');
      }
    });
  }

  const unsub = onStatus(() => refreshNodeRows(body));

  loadState().then(render).catch((e) => {
    clear(body);
    body.appendChild(section('', emptyState('Ошибка загрузки', (e && e.message) || '', 'warnTriangle')));
  });

  return {
    el: page.el,
    destroy() { unsub(); if (sortable) sortable.destroy(); },
  };
}
