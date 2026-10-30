/* City Jam — sayt orqa foni: Samarqandning haqiqiy koʻchalari xira chiziqlar boʻlib turadi,
   ular boʻylab maʼlumot signallari (yorugʻ nuqtalar) oqadi — “shahar tirik, nazoratda”.
   Kam resurs: 30 kadr/s, tab yashirin boʻlsa toʻxtaydi; “kamroq harakat” sozlamasida — harakatsiz. */
(function () {
  'use strict';
  const NX = window.NX;
  const cv = document.createElement('canvas');
  cv.id = 'backdrop'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const g = cv.getContext('2d');
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, lines = [], pulses = [], layer = null, modelRef = null, last = 0;

  const dark = () => document.documentElement.dataset.theme === 'dark';
  const pal = () => (dark() ? { street: 'rgba(94,234,212,0.14)', grid: 'rgba(148,163,184,0.05)', pulse: ['#5eead4', '#38bdf8', '#fde68a'] } : { street: 'rgba(15,118,110,0.15)', grid: 'rgba(15,23,42,0.035)', pulse: ['#0f766e', '#0284c7', '#d97706'] });

  // Koʻchalar: model boʻlsa — haqiqiy; boʻlmasa — tasodifiy shahar toʻri
  function geometry() {
    const M = NX.state && NX.state.model;
    modelRef = M || null;
    lines = [];
    if (M && M.ways && M.ways.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      M.ways.forEach(w => w.xy.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
      const k = Math.max(W / (x1 - x0), H / (y1 - y0)) * 1.05, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      M.ways.forEach(w => { const pts = w.xy.map(p => [W / 2 + (p[0] - cx) * k, H / 2 - (p[1] - cy) * k]); const rank = (NX.HW && NX.HW[w.hw] && NX.HW[w.hw].rank) || 4; lines.push({ pts, main: rank <= 2, len: len(pts) }); });
    } else {
      for (let i = 0; i < 26; i++) { const vert = i % 2, a = Math.random() * (vert ? W : H), pts = []; for (let t = 0; t <= 10; t++) { const b = (t / 10) * (vert ? H : W), j = Math.sin(t * 0.7 + i) * 30; pts.push(vert ? [a + j, b] : [b, a + j]); } lines.push({ pts, main: i % 5 === 0, len: len(pts) }); }
    }
    // Statik qatlam: toʻr + koʻchalar (har kadrda qayta chizilmaydi)
    layer = document.createElement('canvas'); layer.width = W * dpr; layer.height = H * dpr;
    const c = layer.getContext('2d'), P = pal();
    c.scale(dpr, dpr);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let x = 0; x < W; x += 48) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y < H; y += 48) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    c.strokeStyle = P.street; c.lineCap = 'round';
    lines.forEach(l => { c.lineWidth = l.main ? 1.8 : 0.9; c.beginPath(); l.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); });
    const usable = lines.filter(l => l.len > 80);
    pulses = Array.from({ length: Math.min(90, usable.length * 2) }, () => spawn(usable));
  }
  const len = pts => pts.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  function spawn(usable) {
    const pool = usable || lines.filter(l => l.len > 80), l = pool[Math.floor(Math.random() * pool.length)];
    return { l, d: Math.random() * l.len, v: (l.main ? 40 : 22) * (0.6 + Math.random() * 0.8), c: Math.floor(Math.random() * 3), dir: Math.random() < 0.5 ? 1 : -1 };
  }
  function at(l, d) {
    let acc = 0;
    for (let i = 1; i < l.pts.length; i++) { const a = l.pts[i - 1], b = l.pts[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc + s >= d) { const t = s ? (d - acc) / s : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; } acc += s; }
    return l.pts[l.pts.length - 1];
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    geometry(); frame(performance.now(), true);
  }
  function frame(now, force) {
    if (!force && (document.hidden || now - last < 33)) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
    if ((NX.state && NX.state.model) !== modelRef) geometry();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (layer) g.drawImage(layer, 0, 0, W, H);
    const P = pal();
    pulses.forEach((p, i) => {
      if (!still) p.d += p.v * dt * p.dir;
      if (p.d < 0 || p.d > p.l.len) { pulses[i] = spawn(); return; }
      // Iz: oldingi nuqtalar xiralashib boradi
      g.strokeStyle = P.pulse[p.c]; g.lineCap = 'round';
      for (let k = 0; k < 6; k++) { const a = at(p.l, p.d - p.dir * k * 5), b = at(p.l, p.d - p.dir * (k + 1) * 5); g.globalAlpha = 0.5 * (1 - k / 6); g.lineWidth = 2.2 - k * 0.25; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      const q = at(p.l, p.d);
      g.globalAlpha = 0.9; g.fillStyle = P.pulse[p.c]; g.shadowColor = P.pulse[p.c]; g.shadowBlur = 8;
      g.beginPath(); g.arc(q[0], q[1], 1.8, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.globalAlpha = 1;
    });
  }
  function loop(now) { frame(now); if (!still) requestAnimationFrame(loop); }
  window.addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  // Mavzu (yorugʻ/qorongʻi) almashsa — ranglar yangilanadi
  new MutationObserver(() => { geometry(); frame(performance.now(), true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resize();
  if (!still) requestAnimationFrame(loop);
  else setInterval(() => { if ((NX.state && NX.state.model) !== modelRef) frame(performance.now(), true); }, 3000);
  NX.backdrop = { redraw: () => { geometry(); frame(performance.now(), true); } };
})();
