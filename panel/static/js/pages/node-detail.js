// Страница узла: состояние, диагностика, ТСПУ, ссылка, изменение и удаление.
import {
  h, clear, api, go, onStatus, store, loadState, refreshState, nodeById, groupsOfNode,
  nodeSubtitle, fmtBytes, fmtRel, fmtDelay, delayClass, copyText,
  section, row, tspuBadge, emptyState, skeleton, icon, switchRow,
  toast, alertError, confirmAction, iosAlert,
} from '../core.js';
import { createPageEl } from '../shell.js';
import { openNodeEditor } from './node-editor.js';

function stepRow(s) {
  const ok = !!s.ok;
  return h('div.step-row',
    h('div.st-ico', icon(ok ? 'checkCircle' : 'xCircle', ok ? 'c-green' : 'c-red')),
    h('div.st-main',
      h('div.st-name', { text: s.name || '' }),
      s.detail ? h('div.st-detail', { text: String(s.detail) }) : null),
    s.ms !== undefined && s.ms !== null ? h('div.st-ms', { text: s.ms + ' мс' }) : null);
}

export function createDetailPage(ctx) {
  const id = decodeURIComponent(ctx.params[0]);
  const page = createPageEl({ title: 'Узел', back: { label: 'Узлы', onClick: () => go('/nodes') } });
  const body = h('div');
  page.content.appendChild(body);
  body.appendChild(skeleton(3));

  let node = null;
  let statusTile = null;
  let testBox = null;

  /* ---------- состояние ---------- */
  function renderStatus() {
    if (!statusTile) return;
    clear(statusTile);
    const st = (store.status && store.status.nodes && store.status.nodes[id]) || null;
    if (!st) { statusTile.appendChild(h('div.muted', { text: 'Нет данных о состоянии' })); return; }
    const aliveTxt = st.alive === true ? 'Доступен' : st.alive === false ? 'Недоступен' : 'Не проверялся';
    statusTile.appendChild(h('div.tile-head',
      h('span.dot.lg.' + (st.alive === true ? 'alive' : st.alive === false ? 'dead' : 'unknown')),
      h('div.tile-title', { text: aliveTxt }),
      tspuBadge(st.tspu)));
    statusTile.appendChild(h('div.tile-grid',
      h('div.tile-metric',
        h('div.tm-val', { class: 'delay ' + delayClass(st.delay), text: fmtDelay(st.delay) }),
        h('div.tm-lab', { text: 'Задержка' })),
      h('div.tile-metric',
        h('div.tm-val', { text: fmtBytes(st.down || 0) }), h('div.tm-lab', { text: 'Принято' })),
      h('div.tile-metric',
        h('div.tm-val', { text: fmtBytes(st.up || 0) }), h('div.tm-lab', { text: 'Отправлено' }))));
    statusTile.appendChild(h('div.muted', {
      text: 'Проверка: ' + fmtRel(st.lastTry || st.lastSeen) +
        (st.lastSeen ? ' · успешно: ' + fmtRel(st.lastSeen) : ''),
      style: 'font-size:12px;margin-top:10px',
    }));
    if (st.tspu && (st.tspu.location || st.tspu.org)) {
      statusTile.appendChild(h('div.muted', {
        text: [st.tspu.location, st.tspu.org].filter(Boolean).join(' · '),
        style: 'font-size:12px;margin-top:2px',
      }));
    }
    if (st.lastError) {
      statusTile.appendChild(h('div.err-mono', { text: String(st.lastError), style: 'margin-top:10px' }));
    }
  }

  /* ---------- действия ---------- */
  async function runTest(btnRow) {
    const spin = h('div.spinner');
    const prevAside = btnRow.querySelector('.row-aside');
    if (prevAside) prevAside.remove();
    btnRow.appendChild(h('div.row-aside', spin));
    btnRow.classList.add('disabled');
    clear(testBox);
    testBox.appendChild(h('div.section',
      h('div.section-head', { text: 'Диагностика' }),
      h('div.card', h('div.row.row-center', h('div.spinner'),
        h('span.muted', { text: 'Проверка узла, до 20 секунд…', style: 'margin-left:10px' })))));
    try {
      const res = await api('POST', '/api/nodes/' + encodeURIComponent(id) + '/test');
      renderTest(res);
    } catch (e) {
      clear(testBox);
      alertError(e, 'Проверка не удалась');
    } finally {
      btnRow.classList.remove('disabled');
      const a = btnRow.querySelector('.row-aside');
      if (a) a.remove();
      btnRow.appendChild(icon('chevron', 'chevron'));
    }
  }

  function renderTest(res) {
    clear(testBox);
    if (!res) return;
    const ok = !!res.ok;
    const wrap = h('div.section', h('div.section-head', { text: 'Диагностика' }));

    if (res.verdict) {
      wrap.appendChild(h('div.callout' + (ok ? '.ok' : '.err'),
        icon(ok ? 'checkCircle' : 'warnTriangle'),
        h('div', { text: String(res.verdict) })));
    }

    const card = h('div.card');
    (res.steps || []).forEach((s) => card.appendChild(stepRow(s)));
    if (!(res.steps || []).length) card.appendChild(h('div.row', h('div.row-main', h('div.row-title', { text: ok ? 'Проверка пройдена' : 'Проверка не пройдена' }))));
    wrap.appendChild(card);

    const info = [];
    if (res.exitIp) {
      info.push(row({
        icon: 'globe', color: 'var(--teal)', title: 'Внешний IP',
        value: res.exitIp + (res.exitCountry ? ' · ' + res.exitCountry : ''),
      }));
    }
    if (res.latency) {
      info.push(row({ icon: 'clock', color: 'var(--orange)', title: 'Задержка', value: res.latency + ' мс' }));
    }
    if (info.length) wrap.appendChild(h('div.card', { style: 'margin-top:14px' }, info));

    if ((res.logs || []).length) {
      const log = h('div.log-view', { style: 'margin-top:14px' });
      res.logs.forEach((l) => log.appendChild(h('div.log-line', h('div.ll-txt', { text: String(l) }))));
      wrap.appendChild(log);
    }
    testBox.appendChild(wrap);
  }

  async function checkTspu() {
    if (!node) return;
    const dlg = h('div');
    try {
      const res = await api('POST', '/api/tspu/check', { target: node.address });
      const lines = [];
      lines.push(res.blocked ? 'Адрес найден в реестре РКН' : 'Блокировок не обнаружено');
      if (res.location) lines.push('Расположение: ' + res.location);
      if (res.org) lines.push('Оператор: ' + res.org);
      if (res.asn) lines.push('ASN: ' + res.asn);
      if (res.rknDomain) lines.push('Домен в реестре: ' + res.rknDomain);
      if ((res.blockedSubnets || []).length) lines.push('Подсети: ' + res.blockedSubnets.join(', '));
      if ((res.ips || []).length) lines.push('IP: ' + res.ips.join(', '));
      if (res.error) lines.push('Ошибка: ' + res.error);
      await iosAlert({
        title: res.blocked ? 'В реестре РКН' : 'ТСПУ: чисто',
        message: node.address,
        detail: lines.join('\n'),
      });
    } catch (e) {
      alertError(e, 'Проверка ТСПУ не удалась');
    }
    void dlg;
  }

  async function copyLink() {
    try {
      const res = await api('GET', '/api/nodes/' + encodeURIComponent(id) + '/link');
      const link = (res && res.link) || '';
      if (!link) { toast('Ссылка недоступна', 'err'); return; }
      const ok = await copyText(link);
      if (ok) toast('Ссылка скопирована');
      else await iosAlert({ title: 'Ссылка узла', message: 'Скопируйте вручную:', detail: link });
    } catch (e) {
      alertError(e, 'Не удалось получить ссылку');
    }
  }

  /* ---------- сборка ---------- */
  function renderAll() {
    clear(body);
    node = nodeById(id);
    if (!node) {
      body.appendChild(section('', emptyState('Узел не найден', 'Возможно, он был удалён.', 'nodes')));
      return;
    }
    page.setTitle(node.name || 'Узел');
    page.setSubtitle(nodeSubtitle(node));

    statusTile = h('div.tile-card');
    body.appendChild(statusTile);
    renderStatus();

    const testRow = row({
      icon: 'bolt', color: 'var(--blue)', title: 'Проверить узел',
      sub: 'DNS, TCP, рукопожатие, выходной IP', chevron: true,
      onClick: () => runTest(testRow),
    });
    const tspuRow = row({
      icon: 'tspu', color: 'var(--purple)', title: 'Проверить в ТСПУ / РКН',
      sub: node.address, chevron: true, onClick: checkTspu,
    });
    const linkRow = row({
      icon: 'link', color: 'var(--teal)', title: 'Скопировать ссылку', chevron: true, onClick: copyLink,
    });
    body.appendChild(section('Действия', [testRow, tspuRow, linkRow]));

    testBox = h('div');
    body.appendChild(testBox);

    const params = [
      row({ title: 'Адрес', value: node.address + ':' + node.port }),
      row({ title: 'Протокол', value: nodeSubtitle(node) }),
    ];
    if (node.sni) params.push(row({ title: 'SNI', value: node.sni }));
    if (node.fingerprint) params.push(row({ title: 'Отпечаток', value: node.fingerprint }));
    if (node.flow) params.push(row({ title: 'Flow', value: node.flow }));
    if (node.path) params.push(row({ title: 'Путь', value: node.path }));
    if (node.serviceName) params.push(row({ title: 'serviceName', value: node.serviceName }));
    if (node.raw) params.push(row({ title: 'JSON outbound', value: 'задан' }));
    if (node.note) params.push(row({ title: 'Заметка', value: node.note }));
    body.appendChild(section('Параметры', params));

    const groups = groupsOfNode(id);
    body.appendChild(section('Группы',
      groups.length
        ? groups.map((g) => row({
          icon: 'groups', color: 'var(--indigo)', title: g.name, value: ':' + g.port,
          chevron: true, onClick: () => go('/groups/' + g.id),
        }))
        : [row({ title: 'Не входит ни в одну группу', wrap: true })]));

    const enabledRow = switchRow('Включен', node.enabled !== false, async (on, sw) => {
      try {
        await api('PUT', '/api/nodes/' + encodeURIComponent(id), Object.assign({}, node, { enabled: on }));
        await refreshState();
        node = nodeById(id) || node;
        toast('Применено');
      } catch (e) {
        sw.classList.toggle('on', !on);
        alertError(e, 'Не удалось изменить');
      }
    });
    const editRow = row({
      icon: 'settings', color: 'var(--gray)', title: 'Изменить', chevron: true,
      onClick: () => openNodeEditor(node, () => renderAll()),
    });
    body.appendChild(section('', [enabledRow, editRow]));

    const delRow = row({
      title: 'Удалить узел', destructive: true,
      onClick: async () => {
        const ok = await confirmAction({
          title: node.name || 'Узел',
          message: 'Узел будет удалён и исключён из всех групп.',
          confirmText: 'Удалить узел',
        });
        if (!ok) return;
        try {
          await api('DELETE', '/api/nodes/' + encodeURIComponent(id));
          await refreshState();
          toast('Узел удалён');
          go('/nodes');
        } catch (e) { alertError(e, 'Не удалось удалить'); }
      },
    });
    body.appendChild(section('', [delRow]));
  }

  const unsub = onStatus(renderStatus);

  loadState().then(renderAll).catch((e) => {
    clear(body);
    body.appendChild(section('', emptyState('Ошибка загрузки', (e && e.message) || '', 'warnTriangle')));
  });

  return { el: page.el, destroy() { unsub(); } };
}
