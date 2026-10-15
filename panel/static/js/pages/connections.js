// Вкладки «Подключения» и «События» раздела Журнал.
import {
  h, clear, api, fmtTime, fmtRel, icon, section, row, pill, emptyState, spinnerRow,
} from '../core.js';

function routePill(route) {
  if (route === 'direct') return pill('напрямую', 'gray');
  if (route === 'block') return pill('блок', 'red');
  return pill(route || '—', 'blue');
}

function connRow(c) {
  return h('div.conn-row',
    h('div.cr-main',
      h('div.cr-dest', { text: c.dest || '' }),
      h('div.cr-sub', { text: fmtTime(c.ts) + ' · ' + (c.src || '') + ' · ' + (c.net || '') + ' · ' + (c.inbound || '') })),
    routePill(c.route));
}

/** Вкладка «Подключения». */
export async function renderConnections(host) {
  clear(host);
  host.appendChild(h('div.card', { style: 'margin:0 16px' }, spinnerRow('Загрузка подключений…')));

  const data = await api('GET', '/api/connections');
  clear(host);

  const recent = (data && data.recent) || [];
  const clients = (data && data.clients) || [];
  const domains = (data && data.domains) || [];

  let query = '';
  const recentCard = h('div.card');
  const domainsCard = h('div.card');

  function fillRecent() {
    clear(recentCard);
    const list = recent.filter((c) => !query ||
      String(c.dest || '').toLowerCase().indexOf(query) >= 0 ||
      String(c.src || '').toLowerCase().indexOf(query) >= 0);
    if (!list.length) { recentCard.appendChild(emptyState('Нет подключений', 'Пока нет записей access-журнала.', 'route')); return; }
    list.slice(0, 200).forEach((c) => recentCard.appendChild(connRow(c)));
  }

  function fillDomains() {
    clear(domainsCard);
    const list = domains.filter((d) => !query || String(d.domain || '').toLowerCase().indexOf(query) >= 0);
    if (!list.length) { domainsCard.appendChild(emptyState('Нет данных', '', 'globe')); return; }
    list.slice(0, 100).forEach((d) => {
      domainsCard.appendChild(h('div.conn-row',
        h('div.cr-main',
          h('div.cr-dest', { text: d.domain || '' }),
          h('div.cr-sub', { text: d.count + ' запр. · ' + fmtRel(d.lastSeen) })),
        routePill(d.route)));
    });
  }

  const input = h('input', { attrs: { type: 'search', placeholder: 'Поиск по домену или IP', autocapitalize: 'off' } });
  const clearBtn = h('button.sb-clear.hidden', { type: 'button' }, icon('xCircle'));
  clearBtn.addEventListener('click', () => { input.value = ''; query = ''; clearBtn.classList.add('hidden'); fillRecent(); fillDomains(); });
  input.addEventListener('input', () => {
    query = input.value.trim().toLowerCase();
    clearBtn.classList.toggle('hidden', !query);
    fillRecent(); fillDomains();
  });
  host.appendChild(h('div.searchbar', icon('search'), input, clearBtn));

  fillRecent();
  host.appendChild(h('div.section',
    h('div.section-head', { text: 'Последние подключения' }), recentCard));

  host.appendChild(section('Клиенты', clients.length
    ? clients.map((c) => row({
      icon: 'users', color: 'var(--indigo)', title: c.ip,
      sub: c.count + ' подкл. · ' + fmtRel(c.lastSeen),
    }))
    : [emptyState('Нет клиентов', '', 'users')]));

  fillDomains();
  host.appendChild(h('div.section',
    h('div.section-head', { text: 'Топ доменов' }), domainsCard));
}

/** Вкладка «События». */
export async function renderEvents(host) {
  clear(host);
  host.appendChild(h('div.card', { style: 'margin:0 16px' }, spinnerRow('Загрузка событий…')));

  const list = await api('GET', '/api/events?limit=200');
  clear(host);
  const events = Array.isArray(list) ? list : (list && list.events) || [];
  if (!events.length) {
    host.appendChild(section('', emptyState('Нет событий', 'Здесь появятся переключения узлов и ошибки.', 'inbox')));
    return;
  }
  const card = h('div.card');
  events.forEach((ev) => {
    const lvl = ev.level || 'info';
    const ico = lvl === 'error' ? icon('xCircle', 'ev-ico c-red')
      : (lvl === 'warn' || lvl === 'warning') ? icon('warnTriangle', 'ev-ico c-orange')
        : icon('infoCircle', 'ev-ico c-blue');
    card.appendChild(h('div.event-row', ico,
      h('div.ev-txt', { text: ev.text || '' }),
      h('div.ev-ts', { text: fmtTime(ev.ts) })));
  });
  host.appendChild(h('div.section', h('div.section-head', { text: 'События' }), card));
}
