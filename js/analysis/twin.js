/* City Jam — raqamli egizak hisoblari: suv toshqini xavfi, tomdagi quyosh energiyasi, yangi bino soyasi.
   Real maʼlumot: relyef (Open-Meteo Elevation, Copernicus DEM ~90 m), yogʻin prognozi va yillik quyosh nurlanishi (Open-Meteo).
   Natijalar — shu maʼlumotlar asosidagi hisob; aniqligi relyef aniqligi (~90 m) bilan cheklangan. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;
  const STEP = 120;                      // relyef tarmogʻi, m

  // ---------- Relyef (bir marta yuklanadi, oʻzgarmaydi) ----------
  async function dem(onStep) {
    const hit = await NX.bigStore.get('dem:v1');
    if (hit && hit.cells && hit.cells.length) return hit;
    const b = NX.config.bbox, [x0, y0] = G.xy(b.s, b.w), [x1, y1] = G.xy(b.n, b.e);
    const nx = Math.ceil((x1 - x0) / STEP), ny = Math.ceil((y1 - y0) / STEP), pts = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push(G.ll(x0 + (i + 0.5) * STEP, y0 + (j + 0.5) * STEP));
    const elev = [];
    for (let k = 0; k < pts.length; k += 100) {
      onStep && onStep(`Relyef yuklanmoqda: ${Math.min(k + 100, pts.length)}/${pts.length}`);
      const chunk = pts.slice(k, k + 100);
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map(p => p[0].toFixed(5)).join(',')}&longitude=${chunk.map(p => p[1].toFixed(5)).join(',')}`;
      const r = await NX.fetchJSON(url, {}, 20000);
      if (!r.ok || !r.data || !Array.isArray(r.data.elevation)) throw new Error('Relyef maʼlumoti olinmadi (Open-Meteo).');
      elev.push(...r.data.elevation);
    }
    const out = { nx, ny, step: STEP, x0, y0, cells: pts.map((p, i) => ({ lat: p[0], lon: p[1], z: elev[i] })) };
    NX.bigStore.set('dem:v1', out);
    return out;
  }

  // ---------- Yogʻin prognozi (keyingi 48 soat) ----------
  let rainCache = null;
  async function rain() {
    if (rainCache && Date.now() - rainCache.ts < 30 * 60e3) return rainCache;
    const [la, lo] = NX.config.center;
    const r = await NX.fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=precipitation&forecast_days=3&timezone=Asia%2FSamarkand`, {}, 15000);
    if (!r.ok || !r.data || !r.data.hourly) throw new Error('Yogʻin prognozi olinmadi.');
    const now = Date.now(), t = r.data.hourly.time.map(x => new Date(x + ':00+05:00').getTime()), p = r.data.hourly.precipitation;
    let d24 = 0, d48 = 0, maxH = 0, maxAt = null;
    t.forEach((ts, i) => { const dt = ts - now; if (dt < 0 || dt > 48 * 3600e3) return; if (dt <= 24 * 3600e3) d24 += p[i] || 0; d48 += p[i] || 0; if ((p[i] || 0) > maxH) { maxH = p[i]; maxAt = ts; } });
    rainCache = { ts: now, d24: +d24.toFixed(1), d48: +d48.toFixed(1), maxH: +maxH.toFixed(1), maxAt };
    return rainCache;
  }

  // ---------- Yillik quyosh nurlanishi (oʻtgan toʻliq yil, real oʻlchov arxivi) ----------
  async function solarYear() {
    const hit = NX.store.get('ghi:v1', null);
    if (hit && Date.now() - hit.ts < 90 * 86400e3) return hit;
    const y = new Date().getFullYear() - 1, [la, lo] = NX.config.center;
    const r = await NX.fetchJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${la}&longitude=${lo}&start_date=${y}-01-01&end_date=${y}-12-31&daily=shortwave_radiation_sum&timezone=Asia%2FSamarkand`, {}, 20000);
    if (!r.ok || !r.data || !r.data.daily) throw new Error('Quyosh nurlanishi maʼlumoti olinmadi.');
    const mj = r.data.daily.shortwave_radiation_sum.reduce((t, v) => t + (v || 0), 0);
    const out = { ts: Date.now(), year: y, kwh: Math.round(mj / 3.6) };   // kVt·soat/m² yiliga
    NX.store.set('ghi:v1', out);
    return out;
  }

  // ---------- Suv toshqini: past (botiq) joylar ----------
  // Har bir katak atrofidagi (≈250 m) oʻrtacha balandlikdan pastligi — yomgʻir suvi oqib kelib toʻplanadigan joylar
  function flood(D, M) {
    const { nx, ny, cells } = D, at = (i, j) => cells[j * nx + i];
    const zs = cells.map(c => c.z).filter(isFinite).sort((a, b) => a - b), p10 = zs[Math.floor(zs.length * 0.1)] || 0;
    const out = cells.map((c, k) => {
      const i = k % nx, j = Math.floor(k / nx);
      let s = 0, n = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { if (!di && !dj) continue; const q = i + di >= 0 && i + di < nx && j + dj >= 0 && j + dj < ny ? at(i + di, j + dj) : null; if (q && isFinite(q.z)) { s += q.z; n++; } }
      const tpi = n ? c.z - s / n : 0;
      const risk = Math.max(0, Math.min(1, (-tpi - 0.5) / 3.5 + (c.z <= p10 ? 0.25 : 0)));
      return Object.assign({ tpi: +tpi.toFixed(1), risk: +risk.toFixed(2) }, c);
    });
    const hot = out.filter(c => c.risk >= 0.35).sort((a, b) => b.risk - a.risk);
    // Xavfli kataklardan oʻtadigan koʻchalar
    const half = STEP / 2, hotXY = hot.map(c => G.xy(c.lat, c.lon)), len = new Map();
    M.ways.forEach(w => G.sample(w.xy, 20, (x, y) => { if (hotXY.some(h => Math.abs(h[0] - x) <= half && Math.abs(h[1] - y) <= half)) len.set(w.street, (len.get(w.street) || 0) + 20); }));
    const streets = [...len.entries()].map(([s, l]) => ({ s, name: M.streets[s].name, len: l })).filter(x => x.name).sort((a, b) => b.len - a.len);
    return { cells: out, hot, streets, zmin: zs[0], zmax: zs[zs.length - 1], step: STEP };
  }
  const cellPoly = (c, step) => { const [x, y] = G.xy(c.lat, c.lon), h = step / 2; return [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]].map(q => { const ll = G.ll(q[0], q[1]); return [ll[1], ll[0]]; }); };

  // ---------- Quyosh energiyasi: tomlar ----------
  // Foydali tom ulushi 60%, panel FIK 18%, tizim yoʻqotishlari bilan 0.8
  const SOLAR = { usable: 0.6, eff: 0.18, pr: 0.8 };
  const roofKwh = (b, ghi) => Math.round(b.area * SOLAR.usable * ghi * SOLAR.eff * SOLAR.pr);

  // ---------- Quyosh holati va soya ----------
  function sunPos(date, lat, lon) {
    const rad = Math.PI / 180, d = date.getTime() / 86400000 - 10957.5;               // J2000 dan kunlar
    const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24, lst = (gmst * 15 + lon) * rad, H = lst - ra;
    const la = lat * rad, alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));  // shimoldan, soat yoʻnalishida
    return { alt: alt / rad, az: ((az / rad) + 360) % 360 };
  }
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    p.forEach(q => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    p.slice().reverse().forEach(q => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // Bino (xy kvadrat) soyasi — quyosh balandligi va azimuti boʻyicha
  function shadow(fp, height, sun) {
    if (sun.alt <= 2) return null;
    const L = Math.min(400, height / Math.tan((sun.alt * Math.PI) / 180)), a = (sun.az * Math.PI) / 180;
    const dx = -Math.sin(a) * L, dy = -Math.cos(a) * L;                       // quyoshga teskari tomonga
    return hull(fp.concat(fp.map(q => [q[0] + dx, q[1] + dy])));
  }
  // Rejalashtirilgan bino: markazda kvadrat, maydoni = bino osti maydoni
  function planned(center, footprint, floors) {
    const [x, y] = G.xy(center[0], center[1]), h = Math.sqrt(Math.max(100, footprint)) / 2;
    return { fp: [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]], height: floors * 3.2 };
  }
  // 21-dekabr (eng qisqa kun) va 21-iyun, 9:00 / 12:00 / 15:00 (Samarqand vaqti)
  function shadows(center, footprint, floors, buildings) {
    const pb = planned(center, footprint, floors), year = new Date().getFullYear(), res = [];
    [['Qishda (21-dekabr)', 11, 21], ['Yozda (21-iyun)', 5, 21]].forEach(([label, m, d]) => [9, 12, 15].forEach(hh => {
      const t = new Date(Date.UTC(year, m, d, hh - 5, 0)), sun = sunPos(t, center[0], center[1]), poly = shadow(pb.fp, pb.height, sun);
      res.push({ label, hour: hh, sun, poly });
    }));
    // Qishda soyada qoladigan binolar (kamida bir soatda)
    const winter = res.filter(r => r.label.startsWith('Qish') && r.poly), shaded = new Set();
    const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    (buildings || []).forEach(b => { const [x, y] = G.xy(b.c[0], b.c[1]); if (Math.hypot(x - pb.fp[0][0], y - pb.fp[0][1]) > 500) return; if (inPoly(pb.fp, x, y)) return; if (winter.some(w => inPoly(w.poly, x, y))) shaded.add(b); });
    const toLL = poly => poly.map(q => { const ll = G.ll(q[0], q[1]); return [ll[1], ll[0]]; });
    return { planned: Object.assign({ ring: toLL(pb.fp.concat([pb.fp[0]])) }, pb), list: res.map(r => Object.assign({}, r, { ring: r.poly ? toLL(r.poly.concat([r.poly[0]])) : null })), shaded: [...shaded] };
  }

  NX.twin = { dem, rain, solarYear, flood, cellPoly, roofKwh, SOLAR, sunPos, shadows };
})();
