// Форматтеры: байты, скорости, длительности, относительное время.

const NBSP = '\u00a0';

function num(v, digits) {
  const s = v.toFixed(digits);
  return s.replace('.', ',');
}

/** 1536 → "1,5 КБ" */
export function fmtBytes(n) {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return '0' + NBSP + 'Б';
  if (v < 1024) return Math.round(v) + NBSP + 'Б';
  if (v < 1024 * 1024) return num(v / 1024, v / 1024 < 10 ? 1 : 0) + NBSP + 'КБ';
  if (v < 1024 * 1024 * 1024) return num(v / 1048576, v / 1048576 < 10 ? 1 : 0) + NBSP + 'МБ';
  if (v < 1024 * 1024 * 1024 * 1024) return num(v / 1073741824, 2) + NBSP + 'ГБ';
  return num(v / 1099511627776, 2) + NBSP + 'ТБ';
}

/** 1536 → "1,5 КБ/с" */
export function fmtRate(n) {
  return fmtBytes(n) + '/с';
}

/** Короткая подпись оси: "КБ/с" */
export function rateUnit(n) {
  const v = Math.abs(Number(n) || 0);
  if (v < 1024) return 'Б/с';
  if (v < 1048576) return 'КБ/с';
  if (v < 1073741824) return 'МБ/с';
  return 'ГБ/с';
}

export function rateScaled(n, unit) {
  const v = Number(n) || 0;
  const div = unit === 'Б/с' ? 1 : unit === 'КБ/с' ? 1024 : unit === 'МБ/с' ? 1048576 : 1073741824;
  const r = v / div;
  return num(r, r < 10 ? 1 : 0);
}

/** 11520 сек → "3 ч 12 мин" */
export function fmtDuration(sec) {
  let s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return s + ' с';
  const d = Math.floor(s / 86400); s -= d * 86400;
  const hh = Math.floor(s / 3600); s -= hh * 3600;
  const mm = Math.floor(s / 60);
  const out = [];
  if (d) out.push(d + ' д');
  if (hh) out.push(hh + ' ч');
  if (mm && !d) out.push(mm + ' мин');
  if (!out.length) out.push('менее минуты');
  return out.join(' ');
}

/** unix-секунды → "12 с назад" */
export function fmtRel(ts) {
  const t = Number(ts) || 0;
  if (!t) return 'никогда';
  const diff = Math.floor(Date.now() / 1000) - t;
  if (diff < 0) return 'только что';
  if (diff < 5) return 'только что';
  if (diff < 60) return diff + ' с назад';
  const m = Math.floor(diff / 60);
  if (m < 60) return m + ' мин назад';
  const hh = Math.floor(m / 60);
  if (hh < 24) return hh + ' ч назад';
  const d = Math.floor(hh / 24);
  if (d < 31) return d + ' д назад';
  return fmtDate(t);
}

function pad(n) { return n < 10 ? '0' + n : String(n); }

/** unix-секунды → "14:05:09" */
export function fmtTime(ts, withSec) {
  const d = new Date((Number(ts) || 0) * 1000);
  const s = pad(d.getHours()) + ':' + pad(d.getMinutes());
  return withSec === false ? s : s + ':' + pad(d.getSeconds());
}

/** unix-секунды → "14.10.2026" */
export function fmtDate(ts) {
  const d = new Date((Number(ts) || 0) * 1000);
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
}

/** "2026-10-14" → "14 октября" */
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function fmtDayLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const day = parseInt(m[3], 10);
  const mon = MONTHS[parseInt(m[2], 10) - 1] || '';
  const today = new Date();
  const isoToday = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  if (iso === isoToday) return 'Сегодня';
  const y = new Date(today.getTime() - 86400000);
  const isoY = y.getFullYear() + '-' + pad(y.getMonth() + 1) + '-' + pad(y.getDate());
  if (iso === isoY) return 'Вчера';
  return day + ' ' + mon;
}

/** Класс для окраски задержки. */
export function delayClass(ms) {
  const v = Number(ms);
  if (!v || v <= 0) return 'none';
  if (v < 300) return 'fast';
  if (v < 800) return 'mid';
  return 'slow';
}

export function fmtDelay(ms) {
  const v = Number(ms);
  if (!v || v <= 0) return '—';
  return v + ' мс';
}

/** alive: true|false|null → класс точки */
export function aliveClass(alive) {
  if (alive === true) return 'alive';
  if (alive === false) return 'dead';
  return 'unknown';
}

export const STRATEGY_LABELS = {
  priority: 'По приоритету',
  leastPing: 'Быстрейший',
  random: 'Случайный',
};

export const STATE_LABELS = {
  ok: { text: 'Работает', cls: 'green' },
  degraded: { text: 'Резерв', cls: 'orange' },
  down: { text: 'Не работает', cls: 'red' },
  disabled: { text: 'Выключена', cls: 'gray' },
};

export const PROTOCOL_LABELS = {
  vless: 'VLESS', vmess: 'VMess', trojan: 'Trojan',
  shadowsocks: 'Shadowsocks', socks: 'SOCKS', http: 'HTTP',
};

export const SECURITY_LABELS = { none: 'Без TLS', tls: 'TLS', reality: 'Reality' };
export const NETWORK_LABELS = { tcp: 'TCP', ws: 'WebSocket', grpc: 'gRPC', xhttp: 'XHTTP', httpupgrade: 'HTTPUpgrade' };

/** "VLESS · Reality · TCP" */
export function nodeSubtitle(node) {
  const parts = [];
  parts.push(PROTOCOL_LABELS[node.protocol] || String(node.protocol || '').toUpperCase() || '—');
  const sec = node.security || 'none';
  if (sec === 'reality') parts.push('Reality');
  else if (sec === 'tls') parts.push('TLS');
  else parts.push('без TLS');
  parts.push(NETWORK_LABELS[node.network] || String(node.network || 'tcp').toUpperCase());
  return parts.join(' · ');
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
