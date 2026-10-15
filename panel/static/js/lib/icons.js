// Инлайновые SVG-иконки (строки доверенной разметки).
const S = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  // --- оформление ---
  sun: `<svg ${S}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>`,
  moon: `<svg ${S}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`,
  monitor: `<svg ${S}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`,
  palette: `<svg ${S}><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2Z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  // --- таб-бар ---
  overview: `<svg ${S}><path d="M12 4a8 8 0 0 1 8 8M12 4a8 8 0 0 0-8 8"/><path d="M4 12h2M18 12h2M12 20v-6"/><path d="m15.5 8.5-3.1 4.1"/><circle cx="12" cy="13.6" r="1.4" fill="currentColor" stroke="none"/><path d="M4 12a8 8 0 0 0 1.6 4.8M20 12a8 8 0 0 1-1.6 4.8"/></svg>`,
  groups: `<svg ${S}><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r="1" fill="currentColor" stroke="none"/></svg>`,
  nodes: `<svg ${S}><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.6 5.4 3.6 8.5s-1.2 6-3.6 8.5c-2.4-2.5-3.6-5.4-3.6-8.5S9.6 6 12 3.5Z"/></svg>`,
  traffic: `<svg ${S}><path d="M3 17.5 8.5 11l4 3.5L21 6"/><path d="M21 6h-4.5M21 6v4.5"/><path d="M3 21h18"/></svg>`,
  logs: `<svg ${S}><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
  settings: `<svg ${S}><circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z"/></svg>`,

  // --- навигация ---
  chevron: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m1.5 1 5.2 6-5.2 6"/></svg>`,
  back: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 2-8 8 8 8"/></svg>`,
  plus: `<svg ${S} stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
  minus: `<svg ${S} stroke-width="2.6"><path d="M6 12h12"/></svg>`,
  close: `<svg ${S} stroke-width="2.4"><path d="m6 6 12 12M18 6 6 18"/></svg>`,
  check: `<svg ${S} stroke-width="2.4"><path d="m4.5 12.5 5 5 10-11"/></svg>`,
  checkCircle: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.6"/></svg>`,
  xCircle: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>`,
  infoCircle: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>`,
  warnTriangle: `<svg ${S}><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><circle cx="12" cy="16.4" r="1" fill="currentColor" stroke="none"/></svg>`,

  // --- действия ---
  handle: `<svg ${S} stroke-width="1.9"><path d="M4 8h16M4 12h16M4 16h16"/></svg>`,
  pin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M14.2 2.6a1 1 0 0 0-1.5 1.3l.3.4-4.4 3.3-2.9-.4a1 1 0 0 0-.8 1.7l3.4 3.4-4 5.6a.6.6 0 0 0 .8.8l5.6-4 3.4 3.4a1 1 0 0 0 1.7-.8l-.4-2.9 3.3-4.4.4.3a1 1 0 0 0 1.3-1.5Z"/></svg>`,
  copy: `<svg ${S}><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/></svg>`,
  search: `<svg ${S} stroke-width="2"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>`,
  trash: `<svg ${S}><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12.2A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.8L18 7"/><path d="M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4A1.3 1.3 0 0 1 14.5 4.8V7"/></svg>`,
  arrowUp: `<svg ${S} stroke-width="2.4"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
  arrowDown: `<svg ${S} stroke-width="2.4"><path d="M12 5v14M6 13l6 6 6-6"/></svg>`,
  restart: `<svg ${S}><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>`,
  download: `<svg ${S}><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`,
  upload: `<svg ${S}><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`,
  link: `<svg ${S}><path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4"/></svg>`,
  shield: `<svg ${S}><path d="M12 3 20 6v6c0 4.6-3.3 7.6-8 9-4.7-1.4-8-4.4-8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  globe: `<svg ${S}><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.6 5.4 3.6 8.5s-1.2 6-3.6 8.5c-2.4-2.5-3.6-5.4-3.6-8.5S9.6 6 12 3.5Z"/></svg>`,
  bolt: `<svg ${S}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z"/></svg>`,
  route: `<svg ${S}><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 15.5V9a3 3 0 0 1 3-3h3.5"/><path d="M18 8.5V15a3 3 0 0 1-3 3h-3.5"/></svg>`,
  play: `<svg ${S}><path d="M7 4.5 19 12 7 19.5Z"/></svg>`,
  pause: `<svg ${S} stroke-width="2"><path d="M9 5v14M15 5v14"/></svg>`,
  clock: `<svg ${S}><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/></svg>`,
  server: `<svg ${S}><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>`,
  key: `<svg ${S}><circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15.5 12v2.2"/></svg>`,
  doc: `<svg ${S}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>`,
  exit: `<svg ${S}><path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2"/><path d="M20 12H9M17 9l3 3-3 3"/></svg>`,
  inbox: `<svg ${S}><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 4.5h13l2.5 8.5v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4Z"/></svg>`,
  tspu: `<svg ${S}><path d="M12 3 20 6v6c0 4.6-3.3 7.6-8 9-4.7-1.4-8-4.4-8-9V6Z"/><path d="M12 8.5v4"/><circle cx="12" cy="15.6" r="1" fill="currentColor" stroke="none"/></svg>`,
  palette: `<svg ${S}><path d="M12 3a9 9 0 1 0 0 18c1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2a1.7 1.7 0 0 1 1.2-2.9h2A4.5 4.5 0 0 0 21 10.6C21 6.4 16.9 3 12 3Z"/><circle cx="7.5" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="8" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  users: `<svg ${S}><circle cx="9" cy="8" r="3.4"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 20a6 6 0 0 0-2.2-4.6"/></svg>`,
  layers: `<svg ${S}><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3.5 12.5 8.5 4.7 8.5-4.7"/><path d="m3.5 16.5 8.5 4.7 8.5-4.7"/></svg>`,
};

/** Элемент иконки. */
export function icon(name, cls) {
  const markup = ICONS[name] || ICONS.infoCircle;
  const wrap = document.createElement('div');
  wrap.innerHTML = markup;
  const node = wrap.firstElementChild;
  if (cls) node.setAttribute('class', cls);
  return node;
}
