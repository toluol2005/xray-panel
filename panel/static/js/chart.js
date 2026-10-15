// Простой линейный график на canvas: две линии (↑/↓), градиентная заливка,
// подписи осей в человеческих единицах, перекрестие с подсказкой.
import { rateUnit, rateScaled, fmtRate, fmtTime } from './lib/fmt.js';

const PAD = { l: 46, r: 10, t: 12, b: 20 };

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function niceMax(v) {
  if (v <= 0) return 1024;
  const pow = Math.pow(2, Math.floor(Math.log2(v)));
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const s of steps) if (pow * s >= v) return pow * s;
  return pow * 10;
}

/**
 * createChart(canvas, {tip}) → {setData(points), redraw(), destroy()}
 * points: [[tsSec, upRate, downRate], ...]
 */
export function createChart(canvas, opts) {
  const o = opts || {};
  const tip = o.tip || null;
  let data = [];
  let hoverIdx = -1;
  let ro = null;
  let rafId = 0;

  function sizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = canvas.clientWidth || 300;
    const hgt = canvas.clientHeight || 180;
    const nw = Math.round(w * dpr);
    const nh = Math.round(hgt * dpr);
    if (canvas.width !== nw || canvas.height !== nh) { canvas.width = nw; canvas.height = nh; }
    return { w, h: hgt, dpr };
  }

  function path(ctx, pts, geom, maxV, idx) {
    const { w, h } = geom;
    const iw = w - PAD.l - PAD.r;
    const ih = h - PAD.t - PAD.b;
    const n = pts.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = PAD.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = PAD.t + ih - Math.min(1, (pts[i][idx] || 0) / maxV) * ih;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  function xAt(i, geom) {
    const iw = geom.w - PAD.l - PAD.r;
    const n = data.length;
    return PAD.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  }

  function yAt(v, geom, maxV) {
    const ih = geom.h - PAD.t - PAD.b;
    return PAD.t + ih - Math.min(1, (v || 0) / maxV) * ih;
  }

  function draw() {
    const geom = sizeCanvas();
    const ctx = canvas.getContext('2d');
    ctx.setTransform(geom.dpr, 0, 0, geom.dpr, 0, 0);
    ctx.clearRect(0, 0, geom.w, geom.h);
    if (!data.length) return;

    const label2 = cssVar('--label2', '#8e8e93');
    const label3 = cssVar('--label3', '#c7c7cc');
    const green = cssVar('--green', '#34c759');
    const blue = cssVar('--blue', '#007aff');
    const sep = cssVar('--sep', 'rgba(60,60,67,.29)');

    let peak = 0;
    for (const p of data) { peak = Math.max(peak, p[1] || 0, p[2] || 0); }
    const maxV = niceMax(peak * 1.12);
    const unit = rateUnit(maxV);

    // сетка + подписи Y
    ctx.lineWidth = 1;
    ctx.strokeStyle = sep;
    ctx.fillStyle = label2;
    ctx.font = '10px ' + cssVar('--font-num', 'ui-monospace, monospace');
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let k = 0; k <= 2; k++) {
      const v = (maxV / 2) * k;
      const y = Math.round(yAt(v, geom, maxV)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y); ctx.lineTo(geom.w - PAD.r, y);
      ctx.stroke();
      ctx.fillText(rateScaled(v, unit) + ' ' + unit, PAD.l - 6, y);
    }

    // подписи X
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = label3;
    const marks = data.length > 2 ? [0, Math.floor(data.length / 2), data.length - 1] : [0, data.length - 1];
    marks.forEach((i, k) => {
      const x = xAt(i, geom);
      const tx = Math.max(PAD.l + 16, Math.min(geom.w - PAD.r - 16, x));
      ctx.fillText(fmtTime(data[i][0], false), tx, geom.h - 5);
      void k;
    });

    // линии + заливка
    const series = [
      { idx: 2, color: blue },
      { idx: 1, color: green },
    ];
    const ih = geom.h - PAD.t - PAD.b;
    series.forEach((s) => {
      path(ctx, data, geom, maxV, s.idx);
      const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + ih);
      grad.addColorStop(0, hexA(s.color, 0.26));
      grad.addColorStop(1, hexA(s.color, 0));
      ctx.save();
      ctx.lineTo(xAt(data.length - 1, geom), PAD.t + ih);
      ctx.lineTo(xAt(0, geom), PAD.t + ih);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      path(ctx, data, geom, maxV, s.idx);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    });

    // перекрестие
    if (hoverIdx >= 0 && hoverIdx < data.length) {
      const x = Math.round(xAt(hoverIdx, geom)) + 0.5;
      ctx.strokeStyle = label3;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + ih); ctx.stroke();
      ctx.setLineDash([]);
      series.forEach((s) => {
        ctx.beginPath();
        ctx.arc(x, yAt(data[hoverIdx][s.idx], geom, maxV), 3.2, 0, Math.PI * 2);
        ctx.fillStyle = s.color; ctx.fill();
        ctx.strokeStyle = cssVar('--card', '#fff'); ctx.lineWidth = 1.5; ctx.stroke();
      });
      showTip(hoverIdx, x, geom);
    } else if (tip) {
      tip.classList.remove('show');
    }
  }

  function hexA(color, a) {
    const c = color.trim();
    if (c[0] === '#') {
      const hex = c.length === 4
        ? c.slice(1).split('').map((ch) => ch + ch).join('')
        : c.slice(1, 7);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) {
      const parts = m[1].split(',').map((s) => s.trim());
      return 'rgba(' + parts[0] + ',' + parts[1] + ',' + parts[2] + ',' + a + ')';
    }
    return 'rgba(0,122,255,' + a + ')';
  }

  function showTip(i, x, geom) {
    if (!tip) return;
    const p = data[i];
    tip.textContent = '';
    const t = document.createElement('div');
    t.textContent = fmtTime(p[0]);
    const d = document.createElement('div');
    d.textContent = '↓ ' + fmtRate(p[2] || 0);
    const u = document.createElement('div');
    u.textContent = '↑ ' + fmtRate(p[1] || 0);
    tip.appendChild(t); tip.appendChild(d); tip.appendChild(u);
    tip.classList.add('show');
    const tw = tip.offsetWidth || 90;
    let left = x + 10;
    if (left + tw > geom.w - 4) left = x - tw - 10;
    if (left < 4) left = 4;
    tip.style.left = left + 'px';
    tip.style.top = '14px';
  }

  function indexAt(clientX) {
    const r = canvas.getBoundingClientRect();
    const w = r.width;
    const iw = w - PAD.l - PAD.r;
    const rel = clientX - r.left - PAD.l;
    if (data.length <= 1) return data.length - 1;
    const i = Math.round((rel / iw) * (data.length - 1));
    return Math.max(0, Math.min(data.length - 1, i));
  }

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; draw(); });
  }

  function onMove(e) { hoverIdx = indexAt(e.clientX); schedule(); }
  function onLeave() { hoverIdx = -1; schedule(); }
  function onTouch(e) {
    if (!e.touches || !e.touches.length) return;
    hoverIdx = indexAt(e.touches[0].clientX);
    schedule();
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('touchstart', onTouch, { passive: true });
  canvas.addEventListener('touchmove', onTouch, { passive: true });
  canvas.addEventListener('touchend', onLeave, { passive: true });

  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => schedule());
    ro.observe(canvas);
  } else {
    window.addEventListener('resize', schedule);
  }

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => schedule();
  if (mq.addEventListener) mq.addEventListener('change', onScheme);
  // смена стиля/темы панели — перерисовываем с новыми CSS-переменными
  window.addEventListener('xp-theme', onScheme);

  return {
    setData(points) { data = Array.isArray(points) ? points : []; schedule(); },
    redraw: schedule,
    destroy() {
      if (ro) ro.disconnect(); else window.removeEventListener('resize', schedule);
      if (mq.removeEventListener) mq.removeEventListener('change', onScheme);
      window.removeEventListener('xp-theme', onScheme);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchmove', onTouch);
      canvas.removeEventListener('touchend', onLeave);
      cancelAnimationFrame(rafId);
    },
  };
}
