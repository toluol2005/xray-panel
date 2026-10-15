// Перетаскивание строк списка на Pointer Events (мышь + тач, без HTML5 DnD).
// makeSortable(listEl, onDrop) — строки = прямые потомки с data-id, ручка = .drag-handle.

const EDGE = 64;      // зона автопрокрутки у края
const MAX_SPEED = 16; // px за кадр

function scrollParent(el) {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
    p = p.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export function makeSortable(listEl, onDrop) {
  if (!listEl) return { destroy() {} };
  listEl.classList.add('sortable');

  let drag = null;

  function rowsOf() {
    return Array.prototype.filter.call(listEl.children, (c) => c.dataset && c.dataset.id !== undefined);
  }

  function onDown(e) {
    if (drag) return;
    if (e.button !== undefined && e.button !== 0) return;
    const handle = e.target.closest ? e.target.closest('.drag-handle') : null;
    if (!handle || !listEl.contains(handle)) return;
    const rowEl = handle.closest('[data-id]');
    if (!rowEl || rowEl.parentElement !== listEl) return;

    const items = rowsOf();
    const index = items.indexOf(rowEl);
    if (index < 0) return;

    e.preventDefault();
    const sc = scrollParent(listEl);

    drag = {
      items,
      index,
      target: index,
      el: rowEl,
      handle,
      startY: e.clientY,
      startScroll: sc.scrollTop,
      sc,
      pointerId: e.pointerId,
      rects: items.map((el) => ({ top: el.offsetTop, h: el.offsetHeight })),
      dy: 0,
      raf: 0,
      pointerY: e.clientY,
      moved: false,
    };

    try { handle.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }

    rowEl.classList.add('drag-ghost');
    items.forEach((el) => { if (el !== rowEl) el.classList.add('drag-shift'); });
    document.body.style.userSelect = 'none';
    tickScroll();
  }

  function apply() {
    if (!drag) return;
    const { items, index, rects } = drag;
    drag.el.style.transform = 'translateY(' + drag.dy + 'px) scale(1.02)';

    const center = rects[index].top + drag.dy + rects[index].h / 2;
    let target = index;
    for (let i = 0; i < items.length; i++) {
      if (i === index) continue;
      const c = rects[i].top + rects[i].h / 2;
      if (i < index && center < c) target = Math.min(target, i);
      if (i > index && center > c) target = Math.max(target, i);
    }
    drag.target = target;

    const dh = rects[index].h;
    for (let i = 0; i < items.length; i++) {
      if (i === index) continue;
      let shift = 0;
      if (target > index && i > index && i <= target) shift = -dh;
      else if (target < index && i >= target && i < index) shift = dh;
      items[i].style.transform = shift ? 'translateY(' + shift + 'px)' : '';
    }
  }

  function tickScroll() {
    if (!drag) return;
    drag.raf = requestAnimationFrame(tickScroll);
    const sc = drag.sc;
    const box = sc === document.scrollingElement || sc === document.documentElement
      ? { top: 0, bottom: window.innerHeight }
      : sc.getBoundingClientRect();
    let v = 0;
    if (drag.pointerY < box.top + EDGE) v = -Math.ceil((box.top + EDGE - drag.pointerY) / EDGE * MAX_SPEED);
    else if (drag.pointerY > box.bottom - EDGE) v = Math.ceil((drag.pointerY - (box.bottom - EDGE)) / EDGE * MAX_SPEED);
    if (!v) return;
    const before = sc.scrollTop;
    sc.scrollTop = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, before + v));
    if (sc.scrollTop !== before) {
      drag.dy = (drag.pointerY - drag.startY) + (sc.scrollTop - drag.startScroll);
      apply();
    }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    drag.pointerY = e.clientY;
    drag.dy = (e.clientY - drag.startY) + (drag.sc.scrollTop - drag.startScroll);
    if (Math.abs(drag.dy) > 3) drag.moved = true;
    apply();
  }

  function finish(cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    document.body.style.userSelect = '';
    try { d.handle.releasePointerCapture(d.pointerId); } catch (_) { /* ignore */ }

    d.items.forEach((el) => {
      el.style.transform = '';
      el.classList.remove('drag-shift', 'drag-ghost');
    });

    if (cancelled || d.target === d.index || !d.moved) return;

    const order = d.items.slice();
    const [moved] = order.splice(d.index, 1);
    order.splice(d.target, 0, moved);

    const anchor = order[d.target + 1] || null;
    listEl.insertBefore(moved, anchor);

    const ids = order.map((el) => el.dataset.id);
    if (onDrop) {
      Promise.resolve(onDrop(ids, order)).catch(() => { /* откат делает вызывающая сторона */ });
    }
  }

  function onUp(e) { if (drag && e.pointerId === drag.pointerId) finish(false); }
  function onCancel(e) { if (drag && e.pointerId === drag.pointerId) finish(true); }
  function onClickCapture(e) {
    if (e.target.closest && e.target.closest('.drag-handle')) { e.preventDefault(); e.stopPropagation(); }
  }

  listEl.addEventListener('pointerdown', onDown);
  listEl.addEventListener('pointermove', onMove);
  listEl.addEventListener('pointerup', onUp);
  listEl.addEventListener('pointercancel', onCancel);
  listEl.addEventListener('click', onClickCapture, true);

  return {
    destroy() {
      finish(true);
      listEl.removeEventListener('pointerdown', onDown);
      listEl.removeEventListener('pointermove', onMove);
      listEl.removeEventListener('pointerup', onUp);
      listEl.removeEventListener('pointercancel', onCancel);
      listEl.removeEventListener('click', onClickCapture, true);
      listEl.classList.remove('sortable');
    },
  };
}

/** Ручка перетаскивания (≡) для строки. */
export function dragHandle() {
  const el = document.createElement('button');
  el.className = 'drag-handle';
  el.type = 'button';
  el.setAttribute('aria-label', 'Перетащить');
  el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 8h16M4 12h16M4 16h16"/></svg>';
  return el;
}

/** Текущий порядок id в списке. */
export function orderOf(listEl) {
  return Array.prototype.filter.call(listEl.children, (c) => c.dataset && c.dataset.id !== undefined)
    .map((c) => c.dataset.id);
}

/** Расставить строки по массиву id (для отката при ошибке). */
export function applyOrder(listEl, ids) {
  const map = new Map();
  Array.prototype.forEach.call(listEl.children, (c) => { if (c.dataset && c.dataset.id) map.set(c.dataset.id, c); });
  ids.forEach((id) => { const el = map.get(id); if (el) listEl.appendChild(el); });
}
