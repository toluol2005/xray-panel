// Пункт «VPN» в боковом меню Home Assistant: xray-panel в iframe (?embed=1).
// Тема «Авто» в панели следует теме HA — передаём её в ?theme= и затем через postMessage.
class XrayPanelFrame extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._panel = null;
    this._dark = null;
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    if (this._menu) this._menu.hass = hass;
    const dark = !!(hass && hass.themes && hass.themes.darkMode);
    if (this._frame && dark !== this._dark) {
      this._dark = dark;
      this._post();
    }
    this._render();
  }

  set narrow(v) {
    this._narrow = !!v;
    if (this._menu) this._menu.narrow = this._narrow;
    if (this._bar) this._bar.hidden = !this._narrow;
  }

  set panel(p) {
    this._panel = p;
    this._render();
  }

  _post() {
    try {
      this._frame.contentWindow.postMessage({ type: 'xp-host-theme', theme: this._dark ? 'dark' : 'light' }, '*');
    } catch (e) { /* iframe ещё грузится */ }
  }

  _render() {
    if (this._frame || !this._hass || !this._panel) return;
    const url = String((this._panel.config || {}).url || '').replace(/\/+$/, '');
    this._dark = !!(this._hass.themes && this._hass.themes.darkMode);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; height: 100vh; height: 100dvh;
                background: var(--primary-background-color); overflow: hidden; }
        .bar { display: flex; align-items: center; gap: 4px; height: var(--header-height, 56px); flex: none;
               padding: 0 4px; padding-top: env(safe-area-inset-top);
               background: var(--app-header-background-color, var(--primary-color));
               color: var(--app-header-text-color, #fff); font-size: 20px; }
        .bar[hidden] { display: none; }
        .title { margin-left: 8px; }
        iframe { flex: 1 1 auto; min-height: 0; width: 100%; border: 0; display: block; background: transparent; }
      </style>
      <div class="bar"><ha-menu-button></ha-menu-button><span class="title"></span></div>
      <iframe allow="clipboard-write" referrerpolicy="no-referrer"></iframe>`;
    this._bar = this.shadowRoot.querySelector('.bar');
    this._menu = this.shadowRoot.querySelector('ha-menu-button');
    this._menu.hass = this._hass;
    this._menu.narrow = this._narrow;
    this._bar.hidden = !this._narrow;
    this.shadowRoot.querySelector('.title').textContent = this._panel.title || 'VPN';
    this._frame = this.shadowRoot.querySelector('iframe');
    this._frame.addEventListener('load', () => this._post());
    this._frame.src = `${url}/?embed=1&theme=${this._dark ? 'dark' : 'light'}#/overview`;
  }
}

if (!customElements.get('xray-panel-frame')) customElements.define('xray-panel-frame', XrayPanelFrame);
