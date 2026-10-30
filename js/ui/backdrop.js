/* City Jam — sayt orqa foni (doim qorongʻi, kunduzgi rejimda ham): “shahar boshqaruv markazi”.
   • Samarqandning haqiqiy koʻchalari — xira chiziqlar, asosiy yoʻllar yorqinroq;
   • koʻchalar boʻylab maʼlumot signallari oqadi (iz qoldirib);
   • sayt topgan haqiqiy muammoli joylar vaqti-vaqti bilan toʻlqin bilan “signal beradi” (eng jiddiylari qizil);
   • yuqoridan pastga sekin skaner chizigʻi; fonda sekin suzuvchi nur dogʻlari.
   Kam resurs: 30 kadr/s, tab yashirin boʻlsa toʻxtaydi; “kamroq harakat” sozlamasida — harakatsiz. */
(function () {
  'use strict';
  const NX = window.NX;
  const cv = document.createElement('canvas');
  cv.id = 'backdrop'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const g = cv.getContext('2d');
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = { bg0: '#050a14', bg1: '#08142a', grid: 'rgba(148,163,184,0.045)', street: 'rgba(94,234,212,0.13)', main: 'rgba(56,189,248,0.30)', pulse: ['#5eead4', '#38bdf8', '#fde68a'], warn: ['#fbbf24', '#f87171'] };
  let W = 0, H = 0, dpr = 1, lines = [], pulses = [], spots = [], layer = null, modelRef = null, last = 0;
  const t0 = performance.now();

  function geometry() {
    const M = NX.state && NX.state.model;
    modelRef = M || null;
    lines = []; spots = [];
    if (M && M.ways && M.ways.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      M.ways.forEach(w => w.xy.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
      const k = Math.max(W / (x1 - x0), H / (y1 - y0)) * 1.05, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const proj = p => [W / 2 + (p[0] - cx) * k, H / 2 - (p[1] - cy) * k];
      M.ways.forEach(w => { const rank = (NX.HW && NX.HW[w.hw] && NX.HW[w.hw].rank) || 4, pts = w.xy.map(proj); lines.push({ pts, main: rank <= 2, len: len(pts) }); });
      // Muammoli joylar — haqiqiy (roʻyxat jiddiyligi boʻyicha tartiblangan: birinchi 8 tasi qizil)
      (M.problems || []).slice(0, 40).forEach((p, i) => { const q = proj(NX.geo.xy(p.lat, p.lon)); if (q[0] > -20 && q[0] < W + 20 && q[1] > -20 && q[1] < H + 20) spots.push({ x: q[0], y: q[1], c: i < 8 ? 1 : 0, ph: (i * 1.7) % 6 }); });
    } else {
      for (let i = 0; i < 30; i++) { const vert = i % 2, a = Math.random() * (vert ? W : H), pts = []; for (let t = 0; t <= 12; t++) { const b = (t / 12) * (vert ? H : W), j = Math.sin(t * 0.7 + i) * 30; pts.push(vert ? [a + j, b] : [b, a + j]); } lines.push({ pts, main: i % 5 === 0, len: len(pts) }); }
    }
    // Statik qatlam: fon, toʻr, koʻchalar, vinyetka (har kadrda qayta chizilmaydi)
    layer = document.createElement('canvas'); layer.width = W * dpr; layer.height = H * dpr;
    const c = layer.getContext('2d');
    c.scale(dpr, dpr);
    const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, P.bg1); bg.addColorStop(1, P.bg0);
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let x = 0; x < W; x += 48) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y < H; y += 48) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    lines.filter(l => !l.main).forEach(l => draw(c, l, P.street, 0.9));
    c.shadowColor = '#38bdf8'; c.shadowBlur = 6;
    lines.filter(l => l.main).forEach(l => draw(c, l, P.main, 1.6));
    c.shadowBlur = 0;
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    const usable = lines.filter(l => l.len > 80);
    pulses = usable.length ? Array.from({ length: Math.min(110, usable.length * 2) }, () => spawn(usable)) : [];
  }
  const draw = (c, l, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); l.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); };
  const len = pts => pts.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  function spawn(usable) {
    const pool = usable || lines.filter(l => l.len > 80), l = pool[Math.floor(Math.random() * pool.length)];
    return { l, d: Math.random() * l.len, v: (l.main ? 55 : 26) * (0.6 + Math.random() * 0.8), c: l.main ? (Math.random() < 0.7 ? 1 : 2) : Math.floor(Math.random() * 3), dir: Math.random() < 0.5 ? 1 : -1 };
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
    const T = (now - t0) / 1000;
    if ((NX.state && NX.state.model) !== modelRef) geometry();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (layer) g.drawImage(layer, 0, 0, W, H);
    // Sekin suzuvchi nur dogʻlari
    [[0.25, 0.3, '45,212,191'], [0.75, 0.7, '56,189,248']].forEach(([fx, fy, rgb], i) => {
      const x = W * (fx + 0.08 * Math.sin(T * 0.07 + i * 2)), y = H * (fy + 0.08 * Math.cos(T * 0.05 + i)), r = Math.max(W, H) * 0.35;
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${rgb},0.07)`); rg.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    });
    // Skaner chizigʻi (12 soniyada yuqoridan pastga)
    if (!still) { const sy = ((T % 12) / 12) * (H + 160) - 80, sg = g.createLinearGradient(0, sy - 80, 0, sy + 2); sg.addColorStop(0, 'rgba(94,234,212,0)'); sg.addColorStop(1, 'rgba(94,234,212,0.07)'); g.fillStyle = sg; g.fillRect(0, sy - 80, W, 82); g.fillStyle = 'rgba(94,234,212,0.18)'; g.fillRect(0, sy, W, 1); }
    // Maʼlumot signallari
    g.lineCap = 'round';
    pulses.forEach((p, i) => {
      if (!still) p.d += p.v * dt * p.dir;
      if (p.d < 0 || p.d > p.l.len) { pulses[i] = spawn(); return; }
      const col = P.pulse[p.c];
      g.strokeStyle = col;
      for (let k = 0; k < 7; k++) { const a = at(p.l, p.d - p.dir * k * 5), b = at(p.l, p.d - p.dir * (k + 1) * 5); g.globalAlpha = 0.55 * (1 - k / 7); g.lineWidth = 2.2 - k * 0.22; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      const q = at(p.l, p.d);
      g.globalAlpha = 0.95; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10;
      g.beginPath(); g.arc(q[0], q[1], 1.9, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.globalAlpha = 1;
    });
    // Muammoli joylar: nuqta + kengayib yoʻqoladigan toʻlqin
    spots.forEach(s => {
      const ph = ((T + s.ph) % 6) / 6, col = P.warn[s.c];
      g.globalAlpha = 0.8; g.fillStyle = col; g.beginPath(); g.arc(s.x, s.y, 2.2, 0, Math.PI * 2); g.fill();
      if (ph < 0.5 && !still) { const r = 4 + ph * 2 * 26; g.globalAlpha = 0.5 * (1 - ph * 2); g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 1;
    });
  }
  function loop(now) { frame(now); if (!still) requestAnimationFrame(loop); }
  window.addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  resize();
  if (!still) requestAnimationFrame(loop);
  else setInterval(() => { if ((NX.state && NX.state.model) !== modelRef) frame(performance.now(), true); }, 3000);
  NX.backdrop = { redraw: () => { geometry(); frame(performance.now(), true); } };
})();
