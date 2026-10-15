// Кэш состояния панели и подписка на опрос /api/status.
import { api } from './api.js';

const listeners = new Set();
const stateListeners = new Set();

export const store = {
  status: null,   // последний ответ /api/status
  state: null,    // последний ответ /api/state
  system: null,   // последний ответ /api/system
  auth: null,     // последний ответ /api/auth/status
  lastStatusAt: 0,
  statusError: null,
};

/** Подписка на обновления статуса. Возвращает функцию отписки. */
export function onStatus(fn) {
  listeners.add(fn);
  if (store.status) { try { fn(store.status); } catch (e) { console.error(e); } }
  return () => listeners.delete(fn);
}

/** Подписка на обновления полного состояния (/api/state). */
export function onState(fn) {
  stateListeners.add(fn);
  if (store.state) { try { fn(store.state); } catch (e) { console.error(e); } }
  return () => stateListeners.delete(fn);
}

export function emitStatus(status) {
  store.status = status;
  store.lastStatusAt = Date.now();
  listeners.forEach((fn) => { try { fn(status); } catch (e) { console.error(e); } });
}

export function emitState(state) {
  store.state = state;
  stateListeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
}

/** Загрузить /api/state (с кэшем, force — принудительно). */
export async function loadState(force) {
  if (store.state && !force) return store.state;
  const st = await api('GET', '/api/state');
  emitState(st);
  return st;
}

export function invalidateState() { store.state = null; }

/** Перезагрузить состояние и уведомить подписчиков. */
export async function refreshState() {
  return loadState(true);
}

export function nodeById(id) {
  const st = store.state;
  if (!st || !st.nodes) return null;
  for (const n of st.nodes) if (n.id === id) return n;
  return null;
}

export function groupById(id) {
  const st = store.state;
  if (!st || !st.groups) return null;
  for (const g of st.groups) if (g.id === id) return g;
  return null;
}

/** Имя узла по id, с поддержкой "direct"/"block". */
export function nodeName(id) {
  if (!id) return '—';
  if (id === 'direct') return 'Напрямую';
  if (id === 'block') return 'Блокировка';
  const n = nodeById(id);
  return n ? n.name : id;
}

/** Статус узла из последнего /api/status. */
export function nodeStatus(id) {
  const s = store.status;
  if (!s || !s.nodes) return null;
  return s.nodes[id] || null;
}

/** Имена групп, в которые входит узел. */
export function groupsOfNode(id) {
  const st = store.state;
  if (!st || !st.groups) return [];
  return st.groups.filter((g) => (g.nodes || []).indexOf(id) >= 0);
}

export async function loadSystem(force) {
  if (store.system && !force) return store.system;
  store.system = await api('GET', '/api/system');
  return store.system;
}
