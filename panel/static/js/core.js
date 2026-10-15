// core.js — единая точка доступа к утилитам панели.
// Реэкспорт: api-обёртка, экранирование, форматтеры, HUD/алерты/листы, построитель h().

export { h, append, esc, clear, qs, qsa, frag, svgIcon, onTap, copyText, nextFrame, debounce } from './lib/dom.js';
export { api, apiGet, apiPost, apiPut, apiDelete, apiText, ApiError, setUnauthorizedHandler } from './lib/api.js';
export {
  fmtBytes, fmtRate, rateUnit, rateScaled, fmtDuration, fmtRel, fmtTime, fmtDate, fmtDayLabel,
  delayClass, fmtDelay, aliveClass, nodeSubtitle, plural,
  STRATEGY_LABELS, STATE_LABELS, PROTOCOL_LABELS, SECURITY_LABELS, NETWORK_LABELS,
} from './lib/fmt.js';
export { toast, busy, iosAlert, alertError, actionSheet, confirmAction, openSheet } from './lib/ui.js';
export { ICONS, icon } from './lib/icons.js';
export {
  section, plainSection, tile, row, switchRow, inputRow, selectRow, segmented, segmentedRow,
  textArea, dot, pill, delayEl, tspuBadge, emptyState, skeleton, copyRow, spinnerRow,
} from './lib/widgets.js';
export {
  store, onStatus, onState, emitStatus, emitState, loadState, refreshState, invalidateState,
  nodeById, groupById, nodeName, nodeStatus, groupsOfNode, loadSystem,
} from './lib/store.js';

/** Разбор строк «по одной в строке» в массив. */
export function linesToList(text) {
  return String(text || '')
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Массив → текст по строкам. */
export function listToLines(list) {
  return (list || []).join('\n');
}

/** Безопасный разбор целого числа. */
export function toInt(v, def) {
  const n = parseInt(String(v).replace(/\s+/g, ''), 10);
  return isFinite(n) ? n : (def === undefined ? 0 : def);
}

/** Навигация по хэш-роутеру. */
export function go(path) {
  if (location.hash === '#' + path) return;
  location.hash = '#' + path;
}

export function goBack(fallback) {
  if (history.length > 1) history.back();
  else go(fallback || '/overview');
}
