// Разделы настроек: инструмент ТСПУ, xray, резервная копия, о панели.
import {
  h, clear, api, apiText, store, loadSystem, refreshState,
  fmtBytes, fmtDate, fmtDuration, copyText,
  section, row, inputRow, selectRow, textArea, pill, spinnerRow, icon,
  openSheet, toast, alertError, iosAlert, confirmAction, linesToList, listToLines,
} from '../core.js';

/* ---------------- Проверка ТСПУ / РКН ---------------- */

export function tspuToolSection() {
  const inp = inputRow('IP или домен', '', { placeholder: 'example.com' });
  const resultBox = h('div');
  const btn = h('button.btn', { type: 'button', text: 'Проверить' });

  btn.addEventListener('click', async () => {
    const target = inp.getValue();
    if (!target) { toast('Введите адрес', 'err'); return; }
    btn.disabled = true;
    clear(resultBox);
    resultBox.appendChild(h('div.card', spinnerRow('Запрос к cheburcheck.ru…')));
    try {
      const r = await api('POST', '/api/tspu/check', { target });
      clear(resultBox);
      const rows = [];
      rows.push(row({
        title: 'Результат',
        aside: pill(r.blocked ? 'В реестре РКН' : 'Блокировок нет', r.blocked ? 'red' : 'green'),
      }));
      if (r.location) rows.push(row({ title: 'Расположение', value: r.location }));
      if (r.org) rows.push(row({ title: 'Оператор', value: r.org }));
      if (r.asn) rows.push(row({ title: 'ASN', value: String(r.asn) }));
      if (r.rknDomain) rows.push(row({ title: 'Домен в реестре', value: r.rknDomain }));
      if ((r.ips || []).length) rows.push(row({ title: 'IP-адреса', sub: r.ips.join(', '), wrap: true }));
      if ((r.blockedSubnets || []).length) rows.push(row({ title: 'Заблокированные подсети', sub: r.blockedSubnets.join(', '), wrap: true }));
      if (r.error) rows.push(row({ title: 'Ошибка', sub: r.error, wrap: true }));
      rows.push(row({
        icon: 'link', color: 'var(--blue)', title: 'Открыть на cheburcheck.ru', chevron: true, action: true,
        onClick: () => window.open('https://cheburcheck.ru/check?target=' + encodeURIComponent(r.target || target), '_blank'),
      }));
      resultBox.appendChild(section('', rows));
    } catch (e) {
      clear(resultBox);
      alertError(e, 'Проверка не удалась');
    } finally {
      btn.disabled = false;
    }
  });

  const sec = section('Проверка ТСПУ / РКН', [inp],
    'Проверяет адрес в реестре РКН и определяет расположение через cheburcheck.ru.');
  sec.appendChild(h('div.btn-row', { style: 'margin-top:14px' }, btn));
  sec.appendChild(resultBox);
  return sec;
}

/* ---------------- Xray ---------------- */

export function xraySection(ctx) {
  const logRow = selectRow('Уровень журнала', ctx.settings.logLevel || 'warning', [
    ['error', 'error'], ['warning', 'warning'], ['info', 'info'], ['debug', 'debug'],
  ]);
  const dnsTa = textArea(listToLines(ctx.settings.dns || []), 'https://1.1.1.1/dns-query\n8.8.8.8', 4);
  const dnsDirectTa = textArea(listToLines(ctx.settings.dnsDirect || []), '77.88.8.8', 2);
  const groups = (store.state && store.state.groups) || [];
  const dnsGroupRow = selectRow('DNS через', ctx.settings.dnsGroup || '',
    [['', 'напрямую']].concat(groups.map((g) => [g.id, g.name])));
  const dnsPortRow = inputRow('Порт DNS для сети', ctx.settings.dnsPort || '',
    { type: 'number', inputmode: 'numeric', placeholder: 'выключен' });
  ctx.rows.logLevel = logRow;
  ctx.rows.dns = { getValue: () => linesToList(dnsTa.value) };
  ctx.rows.dnsDirect = { getValue: () => linesToList(dnsDirectTa.value) };
  ctx.rows.dnsGroup = dnsGroupRow;
  ctx.rows.dnsPort = dnsPortRow;

  const saveBtn = h('button.btn', { type: 'button', text: 'Сохранить' });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try { await ctx.save(); toast('Применено'); } catch (e) { alertError(e, 'Не удалось сохранить'); } finally { saveBtn.disabled = false; }
  });

  const restartRow = row({
    icon: 'restart', color: 'var(--orange)', title: 'Перезапустить xray', chevron: true,
    onClick: async () => {
      const ok = await confirmAction({
        title: 'Перезапустить xray?',
        message: 'Текущие соединения будут разорваны.',
        confirmText: 'Перезапустить',
      });
      if (!ok) return;
      try { await api('POST', '/api/xray/restart'); toast('xray перезапущен'); } catch (e) { alertError(e, 'Не удалось перезапустить'); }
    },
  });

  const geoRow = row({
    icon: 'globe', color: 'var(--teal)', title: 'Обновить гео-базы', chevron: true,
    onClick: async () => {
      const a = geoRow.querySelector('.chevron');
      if (a) a.remove();
      geoRow.appendChild(h('div.row-aside', h('div.spinner')));
      geoRow.classList.add('disabled');
      try {
        const r = await api('POST', '/api/geo/update');
        await iosAlert({ title: 'Гео-базы обновлены', message: '', detail: (r && r.detail) || 'Готово' });
        loadSystem(true).catch(() => {});
      } catch (e) {
        alertError(e, 'Не удалось обновить');
      } finally {
        geoRow.classList.remove('disabled');
        const aside = geoRow.querySelector('.row-aside');
        if (aside) aside.remove();
        geoRow.appendChild(icon('chevron', 'chevron'));
      }
    },
  });

  const configRow = row({
    icon: 'doc', color: 'var(--gray)', title: 'Показать конфиг xray', chevron: true,
    onClick: async () => {
      let text;
      try { text = await apiText('/api/xray/config'); } catch (e) { alertError(e, 'Не удалось получить конфиг'); return; }
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* оставим как есть */ }
      openSheet({
        title: 'config.json',
        doneText: 'Копировать',
        build(b) { b.appendChild(h('div.code-block', { text: pretty })); },
        async onDone(ctl) {
          const ok = await copyText(pretty);
          toast(ok ? 'Скопировано' : 'Не удалось скопировать', ok ? 'ok' : 'err');
          ctl.close(true);
        },
      });
    },
  });

  const sec = section('Xray', [logRow]);
  const dnsSec = section('DNS', [dnsGroupRow, dnsPortRow]);
  dnsSec.querySelector('.card').appendChild(h('div', dnsTa));
  dnsSec.appendChild(h('div.section-foot', {
    text: 'DNS-серверы — по одному в строке; запросы к ним идут через выбранную группу.',
  }));
  dnsSec.appendChild(h('div.card', { style: 'margin-top:14px' }, h('div', dnsDirectTa)));
  dnsSec.appendChild(h('div.section-foot', {
    text: 'Серверы для российских доменов (geosite:category-ru) — напрямую. '
      + 'Порт DNS для сети отдаёт ответы устройствам и роутеру (UDP и TCP); пусто — выключен.',
  }));
  sec.appendChild(dnsSec);
  sec.appendChild(h('div.btn-row', { style: 'margin-top:14px' }, saveBtn));
  sec.appendChild(h('div.card', { style: 'margin-top:14px' }, restartRow, geoRow, configRow));
  return sec;
}

/* ---------------- Резервная копия ---------------- */

export function backupSection() {
  const fileInput = h('input.hidden', { attrs: { type: 'file', accept: '.json,application/json' } });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    let parsed;
    try {
      parsed = JSON.parse(await f.text());
    } catch (e) {
      alertError({ message: 'Файл не является корректным JSON', detail: String((e && e.message) || e) });
      return;
    }
    const ok = await confirmAction({
      title: 'Восстановить из копии?',
      message: 'Текущие узлы, группы и настройки будут заменены.',
      confirmText: 'Восстановить',
    });
    if (!ok) return;
    try {
      await api('POST', '/api/import-state', parsed);
      await refreshState();
      toast('Состояние восстановлено');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      alertError(e, 'Не удалось восстановить');
    }
  });

  const dlRow = row({
    icon: 'download', color: 'var(--green)', title: 'Скачать резервную копию', chevron: true,
    onClick: async () => {
      try {
        const text = await apiText('/api/export');
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = h('a', { attrs: { href: url, download: 'xray-panel-' + fmtDate(Math.floor(Date.now() / 1000)).replace(/\./g, '-') + '.json' } });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('Файл сохранён');
      } catch (e) { alertError(e, 'Не удалось выгрузить'); }
    },
  });

  const upRow = row({
    icon: 'upload', color: 'var(--orange)', title: 'Восстановить из файла', chevron: true,
    onClick: () => fileInput.click(),
  });

  const sec = section('Резервная копия', [dlRow, upRow],
    'В копию попадают узлы, группы, правила маршрутизации и настройки.');
  sec.appendChild(fileInput);
  return sec;
}

/* ---------------- О панели ---------------- */

export function aboutSection() {
  const card = h('div.card', spinnerRow('Загрузка сведений…'));
  const sec = h('div.section', h('div.section-head', { text: 'О панели' }), card);

  function geoLine(g) {
    if (!g) return '—';
    const size = g.size ? fmtBytes(g.size) : '—';
    const dt = g.mtime ? fmtDate(g.mtime) : '—';
    return size + ' · ' + dt;
  }

  loadSystem(true).then((sys) => {
    clear(card);
    const s = sys || {};
    card.appendChild(row({ icon: 'bolt', color: 'var(--blue)', title: 'Версия xray', value: s.xrayVersion || '—' }));
    card.appendChild(row({ icon: 'layers', color: 'var(--indigo)', title: 'Версия панели', value: s.panelVersion || '—' }));
    card.appendChild(row({ icon: 'server', color: 'var(--gray)', title: 'Хост', value: s.hostname || '—' }));
    card.appendChild(row({ icon: 'clock', color: 'var(--orange)', title: 'Время работы', value: fmtDuration(s.uptime || 0) }));
    card.appendChild(row({ icon: 'globe', color: 'var(--teal)', title: 'geoip.dat', value: geoLine(s.geo && s.geo.geoip) }));
    card.appendChild(row({ icon: 'globe', color: 'var(--teal)', title: 'geosite.dat', value: geoLine(s.geo && s.geo.geosite) }));

    const authRequired = s.authRequired !== undefined ? s.authRequired : !!(store.auth && store.auth.authRequired);
    card.appendChild(row({
      icon: 'key', color: authRequired ? 'var(--green)' : 'var(--gray)',
      title: 'Авторизация', wrap: true,
      sub: authRequired ? 'включена' : 'выключена — пользователи не заданы в panel.yaml',
    }));
    if (authRequired) {
      card.appendChild(row({
        icon: 'exit', color: 'var(--red)', title: 'Выйти', chevron: true,
        onClick: async () => {
          const ok = await confirmAction({ title: 'Выйти из панели?', confirmText: 'Выйти' });
          if (!ok) return;
          try { await api('POST', '/api/auth/logout'); } catch (e) { /* всё равно перезагружаем */ }
          location.reload();
        },
      }));
    }
  }).catch((e) => {
    clear(card);
    card.appendChild(row({ title: 'Не удалось получить сведения', sub: (e && e.message) || '', wrap: true }));
  });

  return sec;
}
