// Настройки: маршрутизация, проверка узлов, инструменты, оформление, о панели.
import {
  h, clear, api, store, loadState, refreshState,
  section, row, inputRow, textArea, switchRow, skeleton,
  toast, alertError, confirmAction, linesToList, listToLines, toInt,
} from '../core.js';
import { createPageEl, appearancePicker } from '../shell.js';
import { STYLE_HINTS, getStyle } from '../theme.js';
import { tspuToolSection, xraySection, backupSection, aboutSection } from './settings-tools.js';

const SYNTAX_HELP = 'Форматы строк xray: example.com (подстрока), domain:example.com, ' +
  'full:example.com, keyword:ads, regexp:^ad\\., geosite:category-ru.';

/* ---------------- Маршрутизация ---------------- */

function routingSection(routing) {
  const r = routing || {};
  const direct = textArea(listToLines(r.directDomains), 'example.ru\ndomain:yandex.ru', 4);
  const proxy = textArea(listToLines(r.proxyDomains), 'youtube.com\ndomain:openai.com', 4);
  const block = textArea(listToLines(r.blockDomains), 'keyword:doubleclick', 3);
  const ips = textArea(listToLines(r.directIPs), '10.0.0.0/8\n192.168.0.0/16', 3);
  const ads = switchRow('Блокировать рекламу', !!r.blockAds, null,
    { icon: 'shield', color: 'var(--red)' });

  const saveBtn = h('button.btn', { type: 'button', text: 'Сохранить правила' });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await api('PUT', '/api/routing', {
        directDomains: linesToList(direct.value),
        proxyDomains: linesToList(proxy.value),
        blockDomains: linesToList(block.value),
        directIPs: linesToList(ips.value),
        blockAds: ads.getValue(),
      });
      await refreshState();
      toast('Применено');
    } catch (e) {
      alertError(e, 'Не удалось сохранить правила');
    } finally {
      saveBtn.disabled = false;
    }
  });

  const wrap = h('div.section');
  wrap.appendChild(h('div.section-head', { text: 'Маршрутизация' }));

  const mk = (label, ta, hint) => {
    const card = h('div.card', { style: 'margin-bottom:14px' },
      h('div.row.no-sep', h('div.row-main', h('div.row-title', { text: label }))),
      h('div', { style: 'border-top:.5px solid var(--sep)' }, ta));
    const box = h('div');
    box.appendChild(card);
    if (hint) box.appendChild(h('div.section-foot', { text: hint, style: 'margin-top:-10px;margin-bottom:12px' }));
    return box;
  };

  wrap.appendChild(mk('Всегда напрямую', direct));
  wrap.appendChild(mk('Всегда через прокси', proxy));
  wrap.appendChild(mk('Блокировать', block));
  wrap.appendChild(mk('IP напрямую', ips));
  wrap.appendChild(h('div.card', ads));
  wrap.appendChild(h('div.section-foot', { text: SYNTAX_HELP }));
  wrap.appendChild(h('div.btn-row', { style: 'margin-top:14px' }, saveBtn));
  return wrap;
}

/* ---------------- Проверка узлов ---------------- */

function probeSection(ctx) {
  const urlR = inputRow('URL проверки', ctx.settings.probeURL || '', { placeholder: 'https://www.gstatic.com/generate_204' });
  const intR = inputRow('Интервал, с', ctx.settings.probeInterval || 30, { type: 'number', inputmode: 'numeric' });
  const tspuR = inputRow('ТСПУ, мин', ctx.settings.tspuInterval || 360, { type: 'number', inputmode: 'numeric' });
  ctx.rows.probeURL = urlR;
  ctx.rows.probeInterval = intR;
  ctx.rows.tspuInterval = tspuR;

  const saveBtn = h('button.btn', { type: 'button', text: 'Сохранить' });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try { await ctx.save(); toast('Применено'); } catch (e) { alertError(e, 'Не удалось сохранить'); } finally { saveBtn.disabled = false; }
  });

  const refreshRow = row({
    icon: 'tspu', color: 'var(--purple)', title: 'Перепроверить ТСПУ всех узлов', chevron: true,
    onClick: async () => {
      const ok = await confirmAction({
        title: 'Перепроверить все узлы?',
        message: 'Запросы уйдут на cheburcheck.ru, это может занять время.',
        confirmText: 'Перепроверить',
        destructive: false,
      });
      if (!ok) return;
      try { await api('POST', '/api/tspu/refresh'); toast('Проверка запущена'); } catch (e) { alertError(e, 'Не удалось запустить'); }
    },
  });

  const sec = section('Проверка узлов', [urlR, intR, tspuR],
    'Интервал — как часто панель измеряет задержку узлов. ТСПУ — как часто проверяется реестр РКН.');
  sec.appendChild(h('div.btn-row', { style: 'margin-top:14px' }, saveBtn));
  sec.appendChild(h('div.card', { style: 'margin-top:14px' }, refreshRow));
  return sec;
}

/* ---------------- Оформление ---------------- */

function appearanceSection(reg) {
  const autoHint = '\n«Авто» следует настройкам системы.';
  const foot = h('div.section-foot', { text: STYLE_HINTS[getStyle()] + autoHint });
  const picker = appearancePicker({ onChange: () => { foot.textContent = STYLE_HINTS[getStyle()] + autoHint; } });
  picker.classList.add('wide');
  if (reg) reg(picker);
  return h('div.section',
    h('div.section-head', { text: 'Оформление' }),
    h('div.card', picker),
    foot);
}

/* ---------------- Страница ---------------- */

export function createPage() {
  const page = createPageEl({ title: 'Настройки' });
  const body = h('div');
  page.content.appendChild(body);
  body.appendChild(skeleton(4));

  const pickers = [];
  const regPicker = (el) => pickers.push(el);

  const ctx = {
    settings: {},
    rows: {},
    collect() {
      const out = Object.assign({}, ctx.settings);
      if (ctx.rows.probeURL) out.probeURL = ctx.rows.probeURL.getValue();
      if (ctx.rows.probeInterval) out.probeInterval = toInt(ctx.rows.probeInterval.getValue(), 30);
      if (ctx.rows.tspuInterval) out.tspuInterval = toInt(ctx.rows.tspuInterval.getValue(), 360);
      if (ctx.rows.logLevel) out.logLevel = ctx.rows.logLevel.getValue();
      if (ctx.rows.dns) out.dns = ctx.rows.dns.getValue();
      if (ctx.rows.dnsDirect) out.dnsDirect = ctx.rows.dnsDirect.getValue();
      if (ctx.rows.dnsGroup) out.dnsGroup = ctx.rows.dnsGroup.getValue();
      if (ctx.rows.dnsPort) out.dnsPort = toInt(ctx.rows.dnsPort.getValue(), 0);
      return out;
    },
    async save() {
      const payload = ctx.collect();
      const saved = await api('PUT', '/api/settings', payload);
      ctx.settings = (saved && typeof saved === 'object') ? saved : payload;
      await refreshState();
    },
  };

  function render() {
    clear(body);
    const st = store.state || {};
    ctx.settings = Object.assign({}, st.settings || {});
    ctx.rows = {};
    body.appendChild(routingSection(st.routing || {}));
    body.appendChild(probeSection(ctx));
    body.appendChild(tspuToolSection());
    body.appendChild(xraySection(ctx));
    body.appendChild(backupSection());
    body.appendChild(appearanceSection(regPicker));
    body.appendChild(aboutSection());
  }

  loadState().then(render).catch((e) => {
    clear(body);
    body.appendChild(section('', [row({ title: 'Не удалось загрузить настройки', sub: (e && e.message) || '', wrap: true })]));
    body.appendChild(appearanceSection(regPicker));
    body.appendChild(aboutSection());
  });

  return {
    el: page.el,
    destroy() { pickers.forEach((p) => { if (p.destroy) p.destroy(); }); },
  };
}
