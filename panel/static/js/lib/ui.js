// Оверлеи в стиле iOS: HUD-тост, алерт, лист действий, нижний лист, индикатор занятости.
import { h, clear } from './dom.js';
import { icon } from './icons.js';

function layer() {
  let l = document.getElementById('overlays');
  if (!l) {
    l = h('div#overlays');
    document.body.appendChild(l);
  }
  return l;
}

const esc_stack = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && esc_stack.length) {
    const fn = esc_stack[esc_stack.length - 1];
    fn();
  }
});

function pushEsc(fn) { esc_stack.push(fn); return () => { const i = esc_stack.indexOf(fn); if (i >= 0) esc_stack.splice(i, 1); }; }

/* ---------------- HUD-тост ---------------- */
let hudEl = null;
let hudTimer = 0;

export function toast(text, kind) {
  const l = layer();
  if (hudEl) { hudEl.remove(); hudEl = null; }
  clearTimeout(hudTimer);
  const ico = kind === 'err' ? icon('xCircle') : kind === 'none' ? null : icon('checkCircle');
  hudEl = h('div.hud' + (kind === 'err' ? '.err' : '.ok'), ico, h('span', { text: String(text) }));
  l.appendChild(hudEl);
  requestAnimationFrame(() => hudEl && hudEl.classList.add('show'));
  hudTimer = setTimeout(() => {
    if (!hudEl) return;
    const el = hudEl;
    hudEl = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }, kind === 'err' ? 2600 : 1600);
}

/* ---------------- Индикатор занятости ---------------- */
export function busy(text) {
  const l = layer();
  const back = h('div.backdrop');
  const hud = h('div.busy-hud', h('div.spinner.spinner-lg.spinner-white'), text ? h('div', { text }) : null);
  l.appendChild(back); l.appendChild(hud);
  requestAnimationFrame(() => back.classList.add('show'));
  let closed = false;
  return {
    setText(t) { const d = hud.querySelector('div:not(.spinner)'); if (d) d.textContent = t; },
    close() {
      if (closed) return;
      closed = true;
      back.classList.remove('show');
      setTimeout(() => { back.remove(); hud.remove(); }, 250);
    },
  };
}

/* ---------------- Алерт ---------------- */
export function iosAlert(opts) {
  const o = opts || {};
  const buttons = o.buttons && o.buttons.length ? o.buttons : [{ text: 'OK', style: 'bold', value: true }];
  return new Promise((resolve) => {
    const l = layer();
    const back = h('div.backdrop');
    const box = h('div.alert' + (o.detail ? '.wide' : ''));
    const body = h('div.alert-body');
    if (o.title) body.appendChild(h('div.alert-title', { text: o.title }));
    if (o.message) body.appendChild(h('div.alert-msg', { text: o.message }));
    if (o.detail) body.appendChild(h('div.alert-detail', { text: String(o.detail) }));
    box.appendChild(body);

    const btnWrap = h('div.alert-btns' + (buttons.length > 2 ? '.vertical' : ''));
    let done = false;
    const finish = (v) => {
      if (done) return; done = true;
      popEsc();
      back.classList.remove('show'); box.classList.remove('show');
      setTimeout(() => { back.remove(); wrap.remove(); }, 220);
      resolve(v);
    };
    buttons.forEach((b) => {
      btnWrap.appendChild(h('button.alert-btn' + (b.style === 'bold' ? '.bold' : '') +
        (b.style === 'destructive' ? '.destructive' : ''), {
        text: b.text,
        onClick: () => finish(b.value === undefined ? b.text : b.value),
      }));
    });
    box.appendChild(btnWrap);
    const wrap = h('div.alert-wrap', box);
    const popEsc = pushEsc(() => finish(null));
    l.appendChild(back); l.appendChild(wrap);
    requestAnimationFrame(() => { back.classList.add('show'); box.classList.add('show'); });
  });
}

/** Показать ошибку (ApiError или Error). */
export function alertError(err, title) {
  const e = err || {};
  const msg = e.message || String(err) || 'Неизвестная ошибка';
  return iosAlert({
    title: title || 'Ошибка',
    message: msg,
    detail: e.detail || '',
    buttons: [{ text: 'OK', style: 'bold', value: true }],
  });
}

/* ---------------- Лист действий ---------------- */
export function actionSheet(opts) {
  const o = opts || {};
  const actions = o.actions || [];
  return new Promise((resolve) => {
    const l = layer();
    const back = h('div.backdrop');
    const sheet = h('div.actionsheet');
    const group = h('div.as-group');
    if (o.title || o.message) {
      group.appendChild(h('div.as-title',
        o.title ? h('b', { text: o.title }) : null,
        o.message ? document.createTextNode(o.message) : null));
    }
    let done = false;
    const finish = (v) => {
      if (done) return; done = true;
      popEsc();
      back.classList.remove('show'); sheet.classList.remove('show');
      setTimeout(() => { back.remove(); wrap.remove(); }, 280);
      resolve(v);
    };
    actions.forEach((a) => {
      group.appendChild(h('button.as-btn' + (a.style === 'destructive' ? '.destructive' : ''), {
        text: a.text,
        onClick: () => finish(a.value === undefined ? a.text : a.value),
      }));
    });
    sheet.appendChild(group);
    const cancelGroup = h('div.as-group',
      h('button.as-btn.cancel', { text: o.cancelText || 'Отмена', onClick: () => finish(null) }));
    sheet.appendChild(cancelGroup);
    const wrap = h('div.actionsheet-wrap', sheet);
    back.addEventListener('click', () => finish(null));
    const popEsc = pushEsc(() => finish(null));
    l.appendChild(back); l.appendChild(wrap);
    requestAnimationFrame(() => { back.classList.add('show'); sheet.classList.add('show'); });
  });
}

/** Подтверждение действия (лист действий). */
export async function confirmAction(opts) {
  const o = opts || {};
  const v = await actionSheet({
    title: o.title || '',
    message: o.message || '',
    actions: [{ text: o.confirmText || 'Подтвердить', style: o.destructive === false ? '' : 'destructive', value: 'yes' }],
    cancelText: o.cancelText || 'Отмена',
  });
  return v === 'yes';
}

/* ---------------- Нижний лист ---------------- */
/**
 * openSheet({title, doneText, cancelText, build(body, ctl), onDone(ctl)})
 * → ctl {close(), body, setDoneEnabled(b), setBusy(b)}
 */
export function openSheet(opts) {
  const o = opts || {};
  const l = layer();
  const back = h('div.backdrop');
  const body = h('div.sheet-body');
  const doneBtn = h('button.sh-btn.right', { text: o.doneText || 'Готово' });
  const cancelBtn = h('button.sh-btn', { text: o.cancelText || 'Отмена' });
  const head = h('div.sheet-head', cancelBtn, h('div.sh-title', { text: o.title || '' }), doneBtn);
  if (o.doneText === null) doneBtn.classList.add('hidden');
  const sheet = h('div.sheet', h('div.sheet-grabber'), head, body);
  const wrap = h('div.sheet-wrap', sheet);

  let closed = false;
  const ctl = {
    body,
    el: sheet,
    close(result) {
      if (closed) return;
      closed = true;
      popEsc();
      back.classList.remove('show');
      sheet.classList.remove('show');
      setTimeout(() => { back.remove(); wrap.remove(); }, 340);
      if (o.onClose) o.onClose(result);
    },
    setDoneEnabled(b) { doneBtn.disabled = !b; },
    setBusy(b) {
      doneBtn.disabled = !!b;
      clear(doneBtn);
      if (b) doneBtn.appendChild(h('div.spinner'));
      else doneBtn.textContent = o.doneText || 'Готово';
    },
    setTitle(t) { head.querySelector('.sh-title').textContent = t; },
  };

  cancelBtn.addEventListener('click', () => { if (o.onCancel) o.onCancel(ctl); else ctl.close(null); });
  doneBtn.addEventListener('click', () => { if (o.onDone) o.onDone(ctl); else ctl.close(true); });
  back.addEventListener('click', () => { if (o.dismissible === false) return; if (o.onCancel) o.onCancel(ctl); else ctl.close(null); });
  const popEsc = pushEsc(() => { if (o.dismissible === false) return; ctl.close(null); });

  l.appendChild(back); l.appendChild(wrap);
  if (o.build) o.build(body, ctl);
  requestAnimationFrame(() => { back.classList.add('show'); sheet.classList.add('show'); });
  return ctl;
}
