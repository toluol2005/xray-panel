// Экран входа в панель.
import { h, api, alertError } from './core.js';

/**
 * showLogin(rootEl, onSuccess)
 */
export function showLogin(rootEl, onSuccess) {
  const user = h('input', {
    attrs: { type: 'text', placeholder: 'Логин', autocapitalize: 'none', autocorrect: 'off', autocomplete: 'username' },
  });
  const pass = h('input', {
    attrs: { type: 'password', placeholder: 'Пароль', autocomplete: 'current-password' },
  });
  const err = h('div.login-err');
  const btn = h('button.btn', { type: 'button', text: 'Войти' });

  const card = h('div.login-card',
    h('img', { attrs: { src: '/static/icon.svg', alt: '' } }),
    h('h1', { text: 'Xray Panel' }),
    h('div.login-sub', { text: 'Управление прокси-группами' }),
    h('div.login-fields', user, pass),
    err,
    btn);

  const screen = h('div.login-screen', card);

  let busyFlag = false;

  async function submit() {
    if (busyFlag) return;
    const u = user.value.trim();
    const p = pass.value;
    if (!u || !p) {
      fail('Введите логин и пароль');
      return;
    }
    busyFlag = true;
    err.textContent = '';
    btn.textContent = '';
    btn.appendChild(h('div.spinner.spinner-white'));
    try {
      await api('POST', '/api/auth/login', { username: u, password: p });
      busyFlag = false;
      btn.textContent = 'Войти';
      onSuccess();
    } catch (e) {
      busyFlag = false;
      btn.textContent = 'Войти';
      if (e && e.status === 401) fail('Неверный логин или пароль');
      else if (e && e.status === 0) fail('Нет связи с панелью');
      else { fail(e && e.message ? e.message : 'Ошибка входа'); if (e && e.detail) alertError(e, 'Не удалось войти'); }
    }
  }

  function fail(msg) {
    err.textContent = msg;
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    pass.value = '';
    pass.focus();
  }

  btn.addEventListener('click', submit);
  [user, pass].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));

  rootEl.textContent = '';
  rootEl.appendChild(screen);
  setTimeout(() => user.focus(), 60);
}
