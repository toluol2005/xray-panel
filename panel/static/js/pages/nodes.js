// Узлы: список с перетаскиванием, импорт ссылок/подписки, переход к узлу.
import {
  h, clear, api, onStatus, store, loadState, refreshState,
  section, emptyState, skeleton, textArea,
  openSheet, actionSheet, toast, alertError, iosAlert,
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
        const added = (res && res.added) || [];
        const errors = (res && res.errors) || [];
        if (errors.length) {
          await iosAlert({
            title: added.length ? 'Добавлено: ' + added.length : 'Ничего не добавлено',
            message: errors.length + ' из строк не распознаны.',
            detail: errors.join('\n'),
          });
        } else {
          toast('Добавлено узлов: ' + added.length);
        }
        if (onDone) onDone();
      } catch (e) {
        ctl.setBusy(false);
        alertError(e, 'Не удалось импортировать');
      }
    },
  });
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
