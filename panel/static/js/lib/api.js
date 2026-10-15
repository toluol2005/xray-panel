// Обёртка fetch для API панели.

let unauthorizedHandler = null;

export function setUnauthorizedHandler(fn) { unauthorizedHandler = fn; }

export class ApiError extends Error {
  constructor(message, detail, status) {
    super(message || 'Ошибка запроса');
    this.name = 'ApiError';
    this.detail = detail || '';
    this.status = status || 0;
  }
}

/**
 * api('GET', '/api/status') | api('POST', '/api/groups', body)
 * Бросает ApiError(message = server.error, detail = server.detail).
 */
export async function api(method, path, body) {
  const opts = {
    method: method || 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  };
  if (body !== undefined && body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new ApiError('Нет связи с панелью', String((e && e.message) || e), 0);
  }

  if (res.status === 401) {
    const err = new ApiError('Требуется вход', '', 401);
    if (unauthorizedHandler) unauthorizedHandler();
    throw err;
  }

  const ctype = res.headers.get('Content-Type') || '';
  let data = null;
  let raw = '';
  if (res.status !== 204) {
    raw = await res.text();
    if (raw && ctype.indexOf('json') >= 0) {
      try { data = JSON.parse(raw); } catch (e) { data = null; }
    } else if (raw) {
      try { data = JSON.parse(raw); } catch (e) { data = raw; }
    }
  }

  if (!res.ok) {
    const msg = (data && typeof data === 'object' && data.error) || 'Ошибка ' + res.status;
    const detail = (data && typeof data === 'object' && data.detail) ||
      (typeof data === 'string' ? data : '') || '';
    throw new ApiError(msg, detail, res.status);
  }
  return data;
}

export const apiGet = (p) => api('GET', p);
export const apiPost = (p, b) => api('POST', p, b);
export const apiPut = (p, b) => api('PUT', p, b);
export const apiDelete = (p) => api('DELETE', p);

/** Получение сырого текста (для /api/xray/config и /api/export). */
export async function apiText(path) {
  let res;
  try {
    res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
  } catch (e) {
    throw new ApiError('Нет связи с панелью', String((e && e.message) || e), 0);
  }
  if (res.status === 401) {
    if (unauthorizedHandler) unauthorizedHandler();
    throw new ApiError('Требуется вход', '', 401);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = 'Ошибка ' + res.status;
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (j && j.error) { msg = j.error; detail = j.detail || ''; }
    } catch (e) { /* не JSON */ }
    throw new ApiError(msg, detail, res.status);
  }
  return text;
}
