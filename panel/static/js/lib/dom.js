// DOM-утилиты: построитель элементов h(), экранирование, хелперы.

const SEL_RE = /([.#]?[^\s.#[\]]+)/g;

/**
 * h('div.card#main', {props}, ...children)
 * props: class/className, text, html (доверенный), style (объект/строка),
 *        dataset (объект), attrs (объект), on* (обработчики), прочее → setAttribute.
 */
export function h(sel, props, ...children) {
  let tag = 'div';
  const classes = [];
  let id = '';
  const parts = String(sel).match(SEL_RE) || [];
  parts.forEach((p, i) => {
    if (p[0] === '.') classes.push(p.slice(1));
    else if (p[0] === '#') id = p.slice(1);
    else if (i === 0) tag = p;
  });

  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  if (id) el.id = id;

  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  if (props) {
    for (const key of Object.keys(props)) {
      const v = props[key];
      if (v === null || v === undefined || v === false) continue;
      if (key === 'class' || key === 'className') {
        el.className = (el.className ? el.className + ' ' : '') + v;
      } else if (key === 'text') {
        el.textContent = String(v);
      } else if (key === 'html') {
        el.innerHTML = String(v);
      } else if (key === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else Object.assign(el.style, v);
      } else if (key === 'dataset') {
        Object.assign(el.dataset, v);
      } else if (key === 'attrs') {
        for (const a of Object.keys(v)) {
          if (v[a] !== null && v[a] !== undefined && v[a] !== false) el.setAttribute(a, String(v[a]));
        }
      } else if (key.slice(0, 2) === 'on' && typeof v === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), v);
      } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') {
        el[key] = v;
      } else {
        el.setAttribute(key, v === true ? '' : String(v));
      }
    }
  }

  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === '') continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  return el;
}

/** Экранирование для вставки в innerHTML. */
export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function qs(sel, root) { return (root || document).querySelector(sel); }
export function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/** Инлайновый SVG из доверенной строки разметки (иконки панели). */
export function svgIcon(markup, cls) {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  const node = wrap.firstElementChild;
  if (!node) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (cls) node.setAttribute('class', cls);
  return node;
}

export function onTap(el, fn) {
  el.addEventListener('click', (e) => { e.preventDefault(); fn(e); });
  return el;
}

/** Копирование в буфер с запасным вариантом для http:// и старых Safari. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* падаем в запасной путь */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

export function nextFrame(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

export function debounce(fn, ms) {
  let t = 0;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
