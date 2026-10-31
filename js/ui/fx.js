/* City Jam — xaritadagi jonli simulyatsiya qatlami (Yandex va Leaflet ustida bitta canvas):
   • xavfli hudud — haqiqiy binolar shaklida (40 m kataklar), xavf darajasiga qarab qizil, “nafas olib” turadi;
   • zilzila — epitsentrdan seysmik toʻlqinlar tarqaladi;
   • evakuatsiya yoʻllari — yorugʻ chiziq, ustida odamlar oqimi (zarrachalar, soni odamlar soniga mos) va yoʻnalish oʻqlari;
   • zaxira yoʻllar — punktir, sekin oqim; yigʻilish va baland joylar — pulsatsiyalanuvchi halqa.
   Xarita surilsa/kattalashsa — har kadrda qayta hisoblanadi; tab yashirin boʻlsa toʻxtaydi. */
(function () {
  'use strict';
  const NX = window.NX;
  let cv = null, g = null, data = null, t0 = 0, raf = 0, cache = null;
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensure() {
    if (cv) return;
    const wrap = document.querySelector('.map-wrap');
    if (!wrap) return;
    cv = document.createElement('canvas'); cv.className = 'fx-layer'; cv.setAttribute('aria-hidden', 'true');
    wrap.appendChild(cv); g = cv.getContext('2d');
  }
  // 3D egizak ochiq boʻlsa — 3D kamera proyeksiyasi (qiyalik, burilish bilan): yoʻllar va oqim binolar ustida koʻrinadi
  let in3d = false;
  const proj = (lat, lon, r) => {
    if (in3d) { const m = NX.map3d.map(); if (!m) return null; const q = m.project([lon, lat]); return [q.x, q.y]; }
    const p = NX.view.llToPx && NX.view.llToPx(lat, lon); return p ? [p[0] - r.left, p[1] - r.top] : null;
  };

  // Proyeksiya keshi: xarita oʻzgarmasa qayta hisoblanmaydi
  function project(r) {
    const a = proj(data.ref[0], data.ref[1], r), b = proj(data.ref[0] + 0.01, data.ref[1] + 0.01, r);
    if (!a || !b) return null;
    const m3 = in3d && NX.map3d.map(), cam = m3 ? [m3.getZoom().toFixed(3), m3.getPitch().toFixed(1), m3.getBearing().toFixed(1)].join() : '';
    const key = a.map(Math.round).join() + ':' + b.map(Math.round).join() + ':' + r.width + 'x' + r.height + ':' + in3d + cam;
    if (cache && cache.key === key) return cache;
    const P = (la, lo) => proj(la, lo, r);
    const mPerPx = 1113 / Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.SQRT2);  // ~0.01° ≈ 1113 m (lat)
    const zones = data.zones.map(z => ({ color: z.color, cells: (z.cells || []).map(c => { const p = P(c[0], c[1]); return p && [p[0], p[1], c[2]]; }).filter(Boolean), ring: z.ring ? z.ring.map(q => P(q[0], q[1])) : null, c: P(z.lat, z.lon) }));
    const water = data.water.map(w => { const a = P(w.a[0], w.a[1]), b = P(w.b[0], w.b[1]); return a && b ? [a[0], a[1], b[0], b[1], w.d] : null; }).filter(Boolean);
    const routes = data.routes.map(rt => { const pts = rt.path.map(q => P(q[0], q[1])); const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return Object.assign({}, rt, { pts, cum, L: cum[cum.length - 1] }); });
    const points = data.points.map(p => Object.assign({}, p, { p: P(p.lat, p.lon) }));
    cache = { key, zones, water, routes, points, epi: data.epi ? P(data.epi[0], data.epi[1]) : null, cellPx: 40 / mPerPx };
    return cache;
  }
  function at(rt, d) {
    let i = 1; while (i < rt.cum.length && rt.cum[i] < d) i++;
    if (i >= rt.pts.length) return rt.pts[rt.pts.length - 1];
    const a = rt.pts[i - 1], b = rt.pts[i], s = rt.cum[i] - rt.cum[i - 1] || 1, t = (d - rt.cum[i - 1]) / s;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function frame() {
    raf = 0;
    if (!data || !cv) return;
    const wrap = cv.parentElement, r = wrap.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; cache = null; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    const was = in3d;
    in3d = wrap.classList.contains('twin-on');
    if (was !== in3d) cache = null;
    const hidden = document.hidden;
    const C = hidden ? null : project(r);
    if (C) {
      const T = (performance.now() - t0) / 1000;
      // 1) Xavfli hudud — haqiqiy binolar kataklari, nafas olayotgan qizil
      const breathe = 0.75 + 0.25 * Math.sin(T * 2.2);
      if (!in3d) C.zones.forEach(z => {
        const s = Math.max(2.5, C.cellPx * 1.12);
        g.shadowColor = z.color; g.shadowBlur = 6;
        z.cells.forEach(c => { g.fillStyle = rgba(z.color, (0.22 + 0.45 * c[2]) * breathe); g.fillRect(c[0] - s / 2, c[1] - s / 2, s, s); });
        g.shadowBlur = 0;
        if (!z.cells.length && z.ring) { g.fillStyle = rgba(z.color, 0.3 * breathe); g.beginPath(); z.ring.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); }
      });
      // 2) Zilzila to‘lqinlari — epitsentrdan
      if (C.epi && data.kind === 'quake') for (let k = 0; k < 3; k++) {
        const ph = ((T * 0.45 + k / 3) % 1), rad = 20 + ph * Math.max(r.width, r.height) * 0.6;
        g.strokeStyle = rgba('#f97316', 0.55 * (1 - ph)); g.lineWidth = 3 * (1 - ph) + 1; g.beginPath(); g.arc(C.epi[0], C.epi[1], rad, 0, Math.PI * 2); g.stroke();
      }
      // 2b) Koʻchalardagi suv: yorugʻ yoyilish + chuqurlik rangidagi oʻzak + oqim yoʻnalishida yaltirash
      if (C.water.length && !in3d) {
        const zw = Math.max(1, Math.min(2.4, C.cellPx / 10));
        g.lineCap = 'round';
        [[0.10, 0.3, '#7dd3fc'], [0.3, 0.6, '#2563eb'], [0.6, 9, '#1e3a8a']].forEach(([lo, hi, col]) => {
          const L = C.water.filter(w => w[4] >= lo && w[4] < hi); if (!L.length) return;
          g.beginPath(); L.forEach(w => { g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); });
          g.strokeStyle = 'rgba(56,189,248,0.28)'; g.lineWidth = (6 + lo * 14) * zw; g.stroke();
          g.strokeStyle = col; g.lineWidth = (2.4 + lo * 6) * zw; g.globalAlpha = 0.9; g.stroke(); g.globalAlpha = 1;
        });
        const thin = C.water.filter(w => w[4] < 0.1);
        if (thin.length) { g.beginPath(); thin.forEach(w => { g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); }); g.strokeStyle = 'rgba(125,211,252,0.55)'; g.lineWidth = 2 * zw; g.stroke(); }
        // Oqim: oq shtrixlar pastga qarab siljiydi
        g.setLineDash([3, 9]); g.lineDashOffset = -T * 24;
        g.beginPath(); C.water.forEach(w => { if (w[4] >= 0.15) { g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); } });
        g.strokeStyle = 'rgba(224,242,254,0.85)'; g.lineWidth = 1.4 * zw; g.stroke(); g.setLineDash([]);
      }
      // 3) Yoʻllar: qorongʻi asos + yorugʻ chiziq; ustida oqim
      g.lineCap = 'round'; g.lineJoin = 'round';
      C.routes.forEach(rt => {
        if (rt.style === 'traffic') {
          // Tirbandlik: rangli koʻcha + mashinalar (tezligi real tezlik nisbatiga mos)
          g.beginPath(); rt.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          g.strokeStyle = rgba(rt.color, 0.55); g.lineWidth = 4; g.stroke();
          if (rt.L < 12) return;
          const n = Math.max(1, Math.min(14, Math.round(rt.L / 28 * (1.4 - rt.v)))), sp = 8 + 70 * rt.v;
          g.fillStyle = '#fef9c3'; g.shadowColor = rt.color; g.shadowBlur = 6;
          for (let k = 0; k < n; k++) { const q = at(rt, (T * sp + (k / n) * rt.L) % rt.L); g.beginPath(); g.arc(q[0], q[1], 1.9, 0, Math.PI * 2); g.fill(); }
          g.shadowBlur = 0;
          return;
        }
        if (rt.style === 'blocked') {
          // Toʻsilishi mumkin koʻcha: qizil, miltillaydi, ustida “×” belgilar
          const a = 0.55 + 0.45 * Math.sin(T * 4);
          g.beginPath(); rt.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          g.strokeStyle = `rgba(239,68,68,${0.85 * a})`; g.lineWidth = 5; g.shadowColor = '#ef4444'; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0;
          if (rt.L > 30) { const q = at(rt, rt.L / 2); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(q[0] - 4, q[1] - 4); g.lineTo(q[0] + 4, q[1] + 4); g.moveTo(q[0] + 4, q[1] - 4); g.lineTo(q[0] - 4, q[1] + 4); g.stroke(); }
          return;
        }
        const path = () => { g.beginPath(); rt.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
        g.setLineDash(rt.dash ? [10, 8] : []);
        g.lineDashOffset = rt.dash ? -T * 20 : 0;
        path(); g.strokeStyle = 'rgba(2,6,16,0.55)'; g.lineWidth = rt.dash ? 6 : 10; g.stroke();
        path(); g.strokeStyle = rgba(rt.color, rt.dash ? 0.85 : 0.95); g.lineWidth = rt.dash ? 3 : 5; g.shadowColor = rt.color; g.shadowBlur = rt.dash ? 0 : 12; g.stroke(); g.shadowBlur = 0;
        g.setLineDash([]);
        if (rt.L < 8) return;
        // Yoʻnalish oʻqlari (chevron) — har 70 px, siljib boradi
        if (!rt.dash) for (let d = (T * 40) % 70; d < rt.L; d += 70) { const q = at(rt, d); if (q.length < 3) continue; g.save(); g.translate(q[0], q[1]); g.rotate(q[2]); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-4, -4); g.lineTo(1, 0); g.lineTo(-4, 4); g.stroke(); g.restore(); }
        // Odamlar oqimi — zarrachalar (soni odamlar soniga mos)
        const n = rt.dash ? 4 : Math.max(6, Math.min(36, Math.round((rt.ppl || 300) / 120))), v = rt.dash ? 18 : 55;
        for (let k = 0; k < n; k++) {
          const d = ((T * v + (k / n) * rt.L) % rt.L), q = at(rt, d);
          g.fillStyle = '#ffffff'; g.shadowColor = rt.color; g.shadowBlur = 10;
          g.beginPath(); g.arc(q[0], q[1], rt.dash ? 1.8 : 2.6, 0, Math.PI * 2); g.fill();
        }
        g.shadowBlur = 0;
      });
      // 4) Joylar: yigʻilish (yashil), baland joy (moviy-yashil), stansiya (qizil), uzoq hudud (toʻq sariq)
      C.points.forEach((p, i) => {
        if (!p.p) return;
        const ph = ((T * 0.8 + i * 0.37) % 1);
        g.strokeStyle = rgba(p.color, 0.8 * (1 - ph)); g.lineWidth = 2.5; g.beginPath(); g.arc(p.p[0], p.p[1], 8 + ph * 26, 0, Math.PI * 2); g.stroke();
        g.fillStyle = rgba(p.color, 0.95); g.shadowColor = p.color; g.shadowBlur = 16; g.beginPath(); g.arc(p.p[0], p.p[1], 7, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
        g.fillStyle = '#fff'; g.beginPath(); g.arc(p.p[0], p.p[1], 2.6, 0, Math.PI * 2); g.fill();
      });
    }
    if (!still) raf = requestAnimationFrame(frame);
    else setTimeout(() => { if (data && !raf) raf = requestAnimationFrame(frame); }, 400);
  }

  function show(items, kind, epi) {
    ensure();
    if (!cv) return;
    const list = items || [];
    data = {
      kind,
      zones: list.filter(a => a.kind === 'zone'),
      routes: list.filter(a => a.kind === 'line' && (a.paths || (a.path && a.path.length > 1))).flatMap(a => (a.paths || [a.path]).map(p => ({ path: p, color: a.color || '#16a34a', dash: !!a.dash, ppl: a.ppl, style: a.style, v: a.v != null ? a.v : 1 }))),
      water: list.filter(a => a.kind === 'water').flatMap(a => a.segs),
      points: list.filter(a => a.kind === 'point'),
      epi: epi || null,
    };
    const any = list.find(a => a.lat != null);
    data.ref = any ? [any.lat, any.lon] : NX.config.center;
    t0 = performance.now(); cache = null;
    cv.hidden = false;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  // Suv simulyatsiyasi vaqt boʻyicha: har kadrda koʻchalardagi suv yangilanadi
  function setWater(list) { if (!data) return; data.water = list || []; cache = null; }
  function clear() { data = null; cache = null; if (cv) { g.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; } if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  NX.fx = { canvas: () => cv, show, clear, setWater, active: () => !!data, kind: () => data && data.kind };
})();
