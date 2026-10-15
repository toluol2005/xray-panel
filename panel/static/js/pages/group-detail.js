// Страница группы: состояние, приоритет узлов, закрепление, настройки, удаление.
import {
  h, clear, api, go, onStatus, store, loadState, refreshState, groupById, nodeById,
  STRATEGY_LABELS, STATE_LABELS, fmtRate,
  section, row, dot, pill, delayEl, inputRow, switchRow, segmentedRow, emptyState, skeleton, icon,
  openSheet, toast, alertError, confirmAction, copyRow, toInt,
} from '../core.js';
import { createPageEl } from '../shell.js';
import { makeSortable, dragHandle, applyOrder } from '../sortable.js';

export function createDetailPage(ctx) {
  const id = decodeURIComponent(ctx.params[0]);
  const page = createPageEl({ title: 'Группа', back: { label: 'Группы', onClick: () => go('/groups') } });
  const body = h('div');
  page.content.appendChild(body);
  body.appendChild(skeleton(4));

  let group = null;
  let sortable = null;
  let statusTile = null;

  async function putGroup(patch, okText) {
    const next = Object.assign({}, group, patch || {});
    const saved = await api('PUT', '/api/groups/' + encodeURIComponent(id), next);
    group = saved && saved.id ? saved : next;
    await refreshState();
    if (okText) toast(okText);
    return group;
  }

  /* ---------- карточка состояния ---------- */
  function renderStatusTile() {
    if (!statusTile) return;
    clear(statusTile);
    const s = ((store.status && store.status.groups) || []).filter((g) => g.id === id)[0];
    if (!s) { statusTile.appendChild(h('div.muted', { text: 'Нет данных о состоянии' })); return; }
    const label = STATE_LABELS[s.state] || STATE_LABELS.down;
    const activeName = s.active === 'direct' ? 'напрямую'
      : s.active === 'block' ? 'блокировка' : (s.activeName || 'нет');
    statusTile.appendChild(h('div.tile-head',
      h('span.dot.lg.' + (s.state === 'ok' ? 'alive' : s.state === 'degraded' ? 'degraded'
        : s.state === 'disabled' ? 'unknown' : 'dead')),
      h('div.tile-title', { text: 'Активно: ' + activeName }),
      pill(label.text, label.cls)));
    statusTile.appendChild(h('div.tile-grid',
      h('div.tile-metric', h('div.tm-val', { text: fmtRate(s.downRate || 0) }), h('div.tm-lab', { text: 'Загрузка' })),
      h('div.tile-metric', h('div.tm-val', { text: fmtRate(s.upRate || 0) }), h('div.tm-lab', { text: 'Отдача' })),
      h('div.tile-metric', h('div.tm-val', { text: STRATEGY_LABELS[s.strategy] || s.strategy || '' }), h('div.tm-lab', { text: 'Стратегия' }))));
  }

  /* ---------- приоритет узлов ---------- */
  function memberRow(nodeId) {
    const n = nodeById(nodeId);
    const st = (store.status && store.status.nodes && store.status.nodes[nodeId]) || {};
    const rm = h('button.row-remove', { type: 'button', attrs: { 'aria-label': 'Убрать из группы' } }, icon('minus'));
    rm.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmAction({
        title: (n && n.name) || nodeId,
        message: 'Убрать узел из группы?',
        confirmText: 'Убрать',
      });
      if (!ok) return;
      const nodes = (group.nodes || []).filter((x) => x !== nodeId);
      try { await putGroup({ nodes }, 'Узел убран'); renderAll(); } catch (err) { alertError(err, 'Не удалось изменить группу'); }
    });

    const el = h('div.row', { dataset: { id: nodeId } },
      dot(st.alive),
      h('div.row-main',
        h('div.row-title', { text: (n && n.name) || nodeId }),
        h('div.row-sub', { text: n ? n.address + ':' + n.port : 'узел не найден' })),
      h('div.row-aside', delayEl(st.delay), rm),
      dragHandle());
    return el;
  }

  function addNodeSheet() {
    const all = (store.state && store.state.nodes) || [];
    const free = all.filter((n) => (group.nodes || []).indexOf(n.id) < 0);
    const selected = new Set();
    const card = h('div.card');
    if (!free.length) card.appendChild(emptyState('Все узлы уже в группе', '', 'nodes'));
    free.forEach((n) => {
      const st = (store.status && store.status.nodes && store.status.nodes[n.id]) || {};
      const r = row({
        lead: dot(st.alive),
        title: n.name || n.id,
        sub: n.address + ':' + n.port,
        onClick: () => {
          if (selected.has(n.id)) selected.delete(n.id); else selected.add(n.id);
          const mark = r.querySelector('.checkmark');
          if (mark) mark.remove();
          if (selected.has(n.id)) r.appendChild(icon('check', 'checkmark'));
        },
      });
      card.appendChild(r);
    });

    openSheet({
      title: 'Добавить узел',
      doneText: 'Добавить',
      build(b) { b.appendChild(h('div.section', card)); },
      async onDone(ctl) {
        if (!selected.size) { ctl.close(null); return; }
        ctl.setBusy(true);
        try {
          await putGroup({ nodes: (group.nodes || []).concat(Array.from(selected)) }, 'Узлы добавлены');
          ctl.close(true);
          renderAll();
        } catch (e) { ctl.setBusy(false); alertError(e, 'Не удалось добавить узлы'); }
      },
    });
  }

  /* ---------- закрепление ---------- */
  async function setPin(value) {
    try {
      await api('POST', '/api/groups/' + encodeURIComponent(id) + '/pin', { node: value });
      group.pinned = value;
      await refreshState();
      toast(value === null ? 'Автоматический выбор' : 'Закреплено');
      renderAll();
    } catch (e) { alertError(e, 'Не удалось закрепить'); }
  }

  function pinSection() {
    const rows = [];
    rows.push(row({
      icon: 'bolt', color: 'var(--blue)', title: 'Автоматически',
      checked: !group.pinned, onClick: () => setPin(null),
    }));
    (group.nodes || []).forEach((nid) => {
      const n = nodeById(nid);
      rows.push(row({
        lead: dot((store.status && store.status.nodes && store.status.nodes[nid] || {}).alive),
        title: (n && n.name) || nid,
        checked: group.pinned === nid,
        onClick: () => setPin(nid),
      }));
    });
    rows.push(row({
      icon: 'globe', color: 'var(--gray)', title: 'Напрямую',
      checked: group.pinned === 'direct', onClick: () => setPin('direct'),
    }));
    return section('Закрепление', rows,
      'Закрепление отключает автоматический выбор узла в этой группе.');
  }

  /* ---------- настройки ---------- */
  function settingsSection() {
    const nameR = inputRow('Название', group.name, { placeholder: 'основной' });
    const portR = inputRow('Порт', group.port, { type: 'number', inputmode: 'numeric' });
    const listenR = inputRow('Слушать', group.listen || '0.0.0.0', { placeholder: '0.0.0.0' });
    const udpR = switchRow('UDP', group.udp !== false, null);
    const stratR = segmentedRow('Стратегия', group.strategy || 'priority', [
      ['priority', 'По приоритету'], ['leastPing', 'Быстрейший'], ['random', 'Случайный'],
    ]);
    const fbR = segmentedRow('Если все упали', group.fallback || 'direct', [
      ['direct', 'Напрямую'], ['block', 'Блокировать'],
    ]);
    const routeR = segmentedRow('Маршрутизация', group.routing || 'geo', [
      ['geo', 'РФ напрямую'], ['all', 'Всё через прокси'],
    ]);
    const userR = inputRow('Логин', group.username || '', { placeholder: 'не задан' });
    const passR = inputRow('Пароль', group.password || '', { placeholder: 'не задан' });
    const enabledR = switchRow('Включена', group.enabled !== false, null);

    const saveBtn = h('button.btn', { type: 'button', text: 'Сохранить' });
    saveBtn.addEventListener('click', async () => {
      const port = toInt(portR.getValue(), 0);
      if (!nameR.getValue()) { toast('Введите название', 'err'); return; }
      if (port < 1 || port > 65535) { toast('Некорректный порт', 'err'); return; }
      saveBtn.disabled = true;
      const old = saveBtn.textContent;
      clear(saveBtn); saveBtn.appendChild(h('div.spinner.spinner-white'));
      try {
        await putGroup({
          name: nameR.getValue(),
          port,
          listen: listenR.getValue() || '0.0.0.0',
          udp: udpR.getValue(),
          strategy: stratR.getValue(),
          fallback: fbR.getValue(),
          routing: routeR.getValue(),
          username: userR.getValue(),
          password: passR.getValue(),
          enabled: enabledR.getValue(),
        }, 'Применено');
        renderAll();
      } catch (e) {
        alertError(e, 'Не удалось сохранить');
      } finally {
        saveBtn.disabled = false; saveBtn.textContent = old;
      }
    });

    const sec = section('Настройки',
      [nameR, portR, listenR, udpR, stratR, fbR, routeR, userR, passR, enabledR],
      'Логин и пароль необязательны — если заданы, порт потребует SOCKS-авторизацию.');
    sec.appendChild(h('div.btn-row', { style: 'margin-top:14px' }, saveBtn));
    return sec;
  }

  /* ---------- сборка ---------- */
  function renderAll() {
    if (sortable) { sortable.destroy(); sortable = null; }
    clear(body);
    group = groupById(id);
    if (!group) {
      body.appendChild(section('', emptyState('Группа не найдена', 'Возможно, она была удалена.', 'groups')));
      return;
    }
    page.setTitle(group.name || 'Группа');
    page.setSubtitle(':' + group.port);

    statusTile = h('div.tile-card');
    body.appendChild(statusTile);
    renderStatusTile();

    // приоритет узлов
    const listCard = h('div.card');
    const ids = group.nodes || [];
    if (!ids.length) listCard.appendChild(emptyState('В группе нет узлов', 'Добавьте хотя бы один узел.', 'nodes'));
    ids.forEach((nid) => listCard.appendChild(memberRow(nid)));
    const addRow = row({ icon: 'plus', color: 'var(--blue)', title: 'Добавить узел', action: true, onClick: addNodeSheet });
    const prioSec = h('div.section',
      h('div.section-head', { text: 'Приоритет узлов' }),
      listCard,
      h('div.card', { style: 'margin-top:14px' }, addRow),
      h('div.section-foot', { text: 'Сверху — самый приоритетный. Потяните за ≡, чтобы изменить порядок.' }));
    body.appendChild(prioSec);

    if (ids.length) {
      let prev = ids.slice();
      sortable = makeSortable(listCard, async (newIds) => {
        const old = prev.slice();
        prev = newIds.slice();
        try {
          await putGroup({ nodes: newIds }, 'Порядок сохранён');
        } catch (e) {
          prev = old;
          applyOrder(listCard, old);
          alertError(e, 'Не удалось изменить порядок');
        }
      });
    }

    body.appendChild(pinSection());
    body.appendChild(settingsSection());

    const host = location.hostname || '127.0.0.1';
    body.appendChild(section('Подключение',
      [copyRow('SOCKS5-прокси', 'socks5://' + host + ':' + group.port, 'route', 'var(--teal)')],
      'Укажите этот адрес в настройках прокси на устройстве или в роутере.'));

    const delRow = row({
      title: 'Удалить группу', destructive: true,
      onClick: async () => {
        const ok = await confirmAction({
          title: group.name || 'Группа',
          message: 'Группа и её порт будут удалены. Узлы останутся.',
          confirmText: 'Удалить группу',
        });
        if (!ok) return;
        try {
          await api('DELETE', '/api/groups/' + encodeURIComponent(id));
          await refreshState();
          toast('Группа удалена');
          go('/groups');
        } catch (e) { alertError(e, 'Не удалось удалить'); }
      },
    });
    body.appendChild(section('', [delRow]));
  }

  const unsub = onStatus(() => {
    renderStatusTile();
    const map = (store.status && store.status.nodes) || {};
    body.querySelectorAll('.row[data-id]').forEach((r) => {
      const s = map[r.dataset.id];
      if (!s) return;
      const d = r.querySelector('.dot');
      if (d) d.className = 'dot ' + (s.alive === true ? 'alive' : s.alive === false ? 'dead' : 'unknown');
      const dl = r.querySelector('.delay');
      if (dl) {
        const fresh = delayEl(s.delay);
        dl.className = fresh.className;
        dl.textContent = fresh.textContent;
      }
    });
  });

  loadState().then(renderAll).catch((e) => {
    clear(body);
    body.appendChild(section('', emptyState('Ошибка загрузки', (e && e.message) || '', 'warnTriangle')));
  });

  return {
    el: page.el,
    destroy() { unsub(); if (sortable) sortable.destroy(); },
  };
}
