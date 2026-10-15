// Готовые элементы списков в стиле «Настройки» iOS.
import { h, copyText } from './dom.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { delayClass, fmtDelay, aliveClass } from './fmt.js';

/** Секция: заголовок + карточка + подпись. */
export function section(title, children, footer) {
  const card = h('div.card');
  (Array.isArray(children) ? children : [children]).forEach((c) => { if (c) card.appendChild(c); });
  return h('div.section',
    title ? h('div.section-head', { text: title }) : null,
    card,
    footer ? h('div.section-foot', typeof footer === 'string' ? { text: footer } : null,
      typeof footer === 'string' ? null : footer) : null);
}

/** Произвольный блок без карточки. */
export function plainSection(title, children, footer) {
  const wrap = h('div.section');
  if (title) wrap.appendChild(h('div.section-head', { text: title }));
  (Array.isArray(children) ? children : [children]).forEach((c) => { if (c) wrap.appendChild(c); });
  if (footer) wrap.appendChild(h('div.section-foot', { text: footer }));
  return wrap;
}

/** Цветная плитка-иконка слева. */
export function tile(iconName, color) {
  return h('div.row-icon', { style: { '--tile': color || 'var(--gray)' } }, icon(iconName));
}

/**
 * row({icon, color, title, sub, value, chevron, onClick, aside, checked, destructive, action})
 */
export function row(o) {
  const opts = o || {};
  const tag = opts.onClick ? 'button.row' : 'div.row';
  const el = h(tag + (opts.destructive ? '.row-destructive' : '') + (opts.action ? '.row-action' : ''));
  if (opts.onClick) el.setAttribute('type', 'button');
  if (opts.id) el.dataset.id = opts.id;
  if (opts.icon) { el.appendChild(tile(opts.icon, opts.color)); el.classList.add('with-icon'); }
  if (opts.lead) { el.appendChild(opts.lead); }
  if (opts.title !== undefined || opts.sub !== undefined) {
    const main = h('div.row-main');
    if (opts.title !== undefined) main.appendChild(h('div.row-title' + (opts.wrap ? '.wrap' : ''), { text: String(opts.title) }));
    if (opts.sub) main.appendChild(h('div.row-sub' + (opts.wrap ? '.wrap' : ''), { text: String(opts.sub) }));
    el.appendChild(main);
  }
  if (opts.aside) el.appendChild(opts.aside);
  if (opts.value !== undefined && opts.value !== null && opts.value !== '') {
    el.appendChild(h('div.row-value', { text: String(opts.value) }));
  }
  if (opts.checked) el.appendChild(icon('check', 'checkmark'));
  if (opts.chevron) el.appendChild(icon('chevron', 'chevron'));
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

/** Переключатель-строка. */
export function switchRow(title, value, onChange, opts) {
  const o = opts || {};
  const sw = h('button.switch' + (value ? '.on' : ''), {
    attrs: { type: 'button', 'aria-pressed': value ? 'true' : 'false', 'aria-label': String(title || '') },
  });
  sw.addEventListener('click', () => {
    const on = !sw.classList.contains('on');
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (onChange) onChange(on, sw);
  });
  const el = row({ title, sub: o.sub, icon: o.icon, color: o.color, aside: sw });
  el.switchEl = sw;
  el.getValue = () => sw.classList.contains('on');
  el.setValue = (v) => sw.classList.toggle('on', !!v);
  return el;
}

/** Строка с текстовым полем. */
export function inputRow(label, value, opts) {
  const o = opts || {};
  const inp = h('input.inp', {
    value: value === null || value === undefined ? '' : String(value),
    attrs: {
      type: o.type || 'text',
      placeholder: o.placeholder || '',
      inputmode: o.inputmode || '',
      'aria-label': String(label || ''),
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
    },
  });
  if (o.mono) inp.classList.add('mono');
  if (o.onInput) inp.addEventListener('input', () => o.onInput(inp.value, inp));
  const el = h('div.row', h('div.row-main', h('div.row-title', { text: label })), inp);
  el.input = inp;
  el.getValue = () => inp.value.trim();
  el.setValue = (v) => { inp.value = v === null || v === undefined ? '' : String(v); };
  return el;
}

/** Строка с выпадающим списком. options: [[value, label], ...] */
export function selectRow(label, value, options, onChange) {
  const sel = h('select.sel', { attrs: { 'aria-label': String(label || '') } });
  options.forEach(([v, t]) => {
    sel.appendChild(h('option', { value: v, text: t, selected: String(v) === String(value) }));
  });
  sel.value = value === null || value === undefined ? '' : String(value);
  if (onChange) sel.addEventListener('change', () => onChange(sel.value, sel));
  const el = h('div.row', h('div.row-main', h('div.row-title', { text: label })), sel);
  el.select = sel;
  el.getValue = () => sel.value;
  el.setValue = (v) => { sel.value = String(v); };
  return el;
}

/** Сегментированный контрол. options: [[value, label], ...] */
export function segmented(value, options, onChange) {
  const el = h('div.segmented');
  let cur = value;
  options.forEach(([v, t]) => {
    const b = h('button.seg' + (String(v) === String(cur) ? '.active' : ''), { text: t, type: 'button' });
    b.dataset.v = v;
    b.addEventListener('click', () => {
      if (String(cur) === String(v)) return;
      cur = v;
      Array.prototype.forEach.call(el.children, (c) => c.classList.toggle('active', c.dataset.v === String(v)));
      if (onChange) onChange(v);
    });
    el.appendChild(b);
  });
  el.getValue = () => cur;
  el.setValue = (v) => {
    cur = v;
    Array.prototype.forEach.call(el.children, (c) => c.classList.toggle('active', c.dataset.v === String(v)));
  };
  return el;
}

/** Строка с сегментированным контролом справа. */
export function segmentedRow(label, value, options, onChange) {
  const seg = segmented(value, options, onChange);
  const el = h('div.row', h('div.row-main', h('div.row-title', { text: label })), seg);
  el.seg = seg;
  el.getValue = () => seg.getValue();
  el.setValue = (v) => seg.setValue(v);
  return el;
}

/** Многострочное поле внутри карточки. */
export function textArea(value, placeholder, rows) {
  const ta = h('textarea.ta', {
    attrs: { placeholder: placeholder || '', rows: rows || 4, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' },
  });
  ta.value = value === null || value === undefined ? '' : String(value);
  return ta;
}

export function dot(alive, extraCls) {
  return h('span.dot.' + aliveClass(alive) + (extraCls ? '.' + extraCls : ''));
}

export function pill(text, cls) {
  return h('span.pill' + (cls ? '.' + cls : ''), { text });
}

export function delayEl(ms) {
  return h('span.delay.' + delayClass(ms), { text: fmtDelay(ms) });
}

/** Бейдж ТСПУ/РКН по объекту status.nodes[id].tspu */
export function tspuBadge(tspu) {
  if (!tspu) return h('span.pill.gray.sm', { text: 'ТСПУ: ?' });
  if (tspu.error) return h('span.pill.gray.sm', { text: 'ТСПУ: ?' });
  if (tspu.blocked) return h('span.pill.red.sm', { text: 'В реестре РКН' });
  return h('span.pill.green.sm', { text: 'ТСПУ: чисто' });
}

/** Пустое состояние. */
export function emptyState(title, text, iconName) {
  return h('div.empty',
    h('div.empty-icon', icon(iconName || 'inbox')),
    h('b', { text: title }),
    text ? h('div', { text }) : null);
}

/** Скелетон-заглушка на время загрузки. */
export function skeleton(count) {
  const wrap = h('div');
  for (let i = 0; i < (count || 3); i++) wrap.appendChild(h('div.skeleton.skeleton-card'));
  return wrap;
}

/** Строка со значением и кнопкой копирования. */
export function copyRow(label, value, iconName, color) {
  const btn = h('button.copy-btn', { attrs: { title: 'Скопировать' } }, icon('copy'));
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await copyText(value);
    toast(ok ? 'Скопировано' : 'Не удалось скопировать', ok ? 'ok' : 'err');
  });
  const el = row({ icon: iconName, color, title: label, sub: value, wrap: true, aside: btn });
  el.classList.add('tappable');
  return el;
}

export function spinnerRow(text) {
  return h('div.row.row-center', h('div.spinner'), h('span.muted', { text: text || 'Загрузка…', style: 'margin-left:10px' }));
}
