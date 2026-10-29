/* City Jam — raqamli egizak hisoblari: suv toshqini xavfi, tomdagi quyosh energiyasi, yangi bino soyasi.
   Real maʼlumot: relyef (Open-Meteo Elevation, Copernicus DEM ~90 m), yogʻin prognozi va yillik quyosh nurlanishi (Open-Meteo).
   Natijalar — shu maʼlumotlar asosidagi hisob; aniqligi relyef aniqligi (~90 m) bilan cheklangan. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;
  const STEP = 60;                       // relyef tarmogʻi, m

  // ---------- Relyef: AWS Terrain Tiles (Terrarium PNG, SRTM ~30 m), butun shahar; zaxira — Open-Meteo (~90 m) ----------
  const CITY = { s: 39.60, w: 66.88, n: 39.71, e: 67.04 };
  const TZ = 13;
  const tileXY = (lat, lon, z) => { const n = 2 ** z, r = (lat * Math.PI) / 180; return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n]; };
  async function terrarium(onStep) {
    const [tx0, ty0] = tileXY(CITY.n, CITY.w, TZ), [tx1, ty1] = tileXY(CITY.s, CITY.e, TZ), tiles = new Map();
    const list = [];
    for (let x = Math.floor(tx0); x <= Math.floor(tx1); x++) for (let y = Math.floor(ty0); y <= Math.floor(ty1); y++) list.push([x, y]);
    let done = 0;
    await Promise.all(list.map(([x, y]) => new Promise((res, rej) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.drawImage(im, 0, 0); tiles.set(x + ':' + y, g.getImageData(0, 0, 256, 256).data); } catch (e) { return rej(e); } onStep && onStep(`Relyef yuklanmoqda: ${++done}/${list.length}`); res(); };
      im.onerror = () => rej(new Error('Relyef plitasi yuklanmadi'));
      im.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TZ}/${x}/${y}.png`;
    })));
    return (lat, lon) => {
      const [fx, fy] = tileXY(lat, lon, TZ), x = Math.floor(fx), y = Math.floor(fy), d = tiles.get(x + ':' + y);
      if (!d) return NaN;
      const k = (Math.min(255, Math.floor((fy - y) * 256)) * 256 + Math.min(255, Math.floor((fx - x) * 256))) * 4;
      return d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768;
    };
  }
  async function openMeteo(pts, onStep) {
    const elev = [];
    for (let k = 0; k < pts.length; k += 100) {
      onStep && onStep(`Relyef (Open-Meteo): ${Math.min(k + 100, pts.length)}/${pts.length}`);
      const chunk = pts.slice(k, k + 100);
      let r = null;
      for (let t = 0; t < 3; t++) {
        r = await NX.fetchJSON(`https://api.open-meteo.com/v1/elevation?latitude=${chunk.map(p => p[0].toFixed(5)).join(',')}&longitude=${chunk.map(p => p[1].toFixed(5)).join(',')}`, {}, 20000);
        if (r.ok && r.data && Array.isArray(r.data.elevation)) break;
        await NX.sleep(1500 * (t + 1));
      }
      if (!r || !r.ok || !r.data || !Array.isArray(r.data.elevation)) throw new Error(`Relyef maʼlumoti olinmadi (Open-Meteo: HTTP ${r ? r.status : '—'}).`);
      elev.push(...r.data.elevation);
    }
    return elev;
  }
  async function dem(onStep) {
    const hit = await NX.bigStore.get('dem:v2');
    if (hit && hit.z && hit.z.length) return hit;
    const [x0, y0] = G.xy(CITY.s, CITY.w), [x1, y1] = G.xy(CITY.n, CITY.e);
    const nx = Math.ceil((x1 - x0) / STEP), ny = Math.ceil((y1 - y0) / STEP), pts = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push(G.ll(x0 + (i + 0.5) * STEP, y0 + (j + 0.5) * STEP));
    let z, src;
    try {
      const f = await terrarium(onStep);
      // Har bir katakda 3×3 nuqta oʻrtachasi — bino va daraxt shovqini kamayadi
      const q = STEP / 3;
      z = pts.map(([la, lo]) => { let s = 0, n = 0; [-1, 0, 1].forEach(a => [-1, 0, 1].forEach(b => { const ll = G.ll(...G.xy(la, lo).map((v, i) => v + (i ? b : a) * q)); const e = f(ll[0], ll[1]); if (isFinite(e)) { s += e; n++; } })); return n ? s / n : NaN; });
      src = 'AWS Terrain Tiles (SRTM ~30 m)';
    } catch (e) {
      // Zaxira: faqat tahlil hududi (Open-Meteo, ~90 m)
      z = await openMeteo(pts, onStep);
      src = 'Open-Meteo (Copernicus ~90 m)';
    }
    const out = { nx, ny, step: STEP, x0, y0, z: Float32Array.from(z), src };
    NX.bigStore.set('dem:v2', out);
    return out;
  }
  const cellLL = (D, k) => G.ll(D.x0 + ((k % D.nx) + 0.5) * D.step, D.y0 + (Math.floor(k / D.nx) + 0.5) * D.step);

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

  // ---------- Suv toshqini: yomgʻir suvi relyef boʻylab qayerga oqib, qayerda chuqurlashadi ----------
  // 1) Relyef chuqurlari toʻldiriladi (Priority-flood + epsilon, Barnes 2014) — SRTM’dagi soxta chuqurlar yoʻqoladi, suv oqib ketadi.
  // 2) Har katakdan suv eng tik pastga oqadi (D8) → har katakka qancha maydondan suv keladi (oqim yigʻilishi).
  // 3) “N mm yomgʻir 1 soatda”: kanalizatsiya olib keta olmagan qismi (70% asfalt/tomdan oqadi) oqim yoʻllarida yigʻiladi;
  //    chuqurlik — Manning formulasi (koʻcha kengligi 20 m, n = 0.016): h = (Q·n / (W·√S))^0.6.
  const NB = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  function hydro(D) {
    if (D._h) return D._h;
    const { nx, ny, z } = D, N = nx * ny, F = new Float64Array(N), done = new Uint8Array(N), EPS = 1e-3;
    const hk = [], hv = [];
    const push = (k, v) => { let i = hk.length; hk.push(k); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
    const pop = () => { const v = hv[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hk.length) break; if (c + 1 < hk.length && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = lk; hv[i] = lv; } return v; };
    const zz = k => (isFinite(z[k]) ? z[k] : 0);
    const seed = k => { if (!done[k]) { done[k] = 1; F[k] = zz(k); push(F[k], k); } };
    for (let i = 0; i < nx; i++) { seed(i); seed((ny - 1) * nx + i); }
    for (let j = 0; j < ny; j++) { seed(j * nx); seed(j * nx + nx - 1); }
    const order = [];
    while (hk.length) {
      const k = pop(), i = k % nx, j = (k - i) / nx; order.push(k);
      for (const [di, dj] of NB) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const q = b * nx + a; if (done[q]) continue; done[q] = 1; F[q] = Math.max(zz(q), F[k] + EPS); push(F[q], q); }
    }
    // D8 yoʻnalish (toʻldirilgan relyefda) va qiyalik
    const down = new Int32Array(N).fill(-1), slope = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const i = k % nx, j = (k - i) / nx; let best = -1, bs = 0;
      for (const [di, dj] of NB) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const q = b * nx + a, sl = (F[k] - F[q]) / (Math.hypot(di, dj) * D.step); if (sl > bs) { bs = sl; best = q; } }
      down[k] = best; slope[k] = Math.max(0.002, (best >= 0 ? zz(k) - zz(best) : 0) / D.step, bs > EPS * 2 ? 0 : 0.002);
    }
    // Oqim yigʻilishi: balanddan pastga (toʻldirish tartibining teskarisi)
    const acc = new Float64Array(N).fill(D.step * D.step);
    for (let t = order.length - 1; t >= 0; t--) { const k = order[t]; if (down[k] >= 0) acc[down[k]] += acc[k]; }
    D._h = { F, down, slope, acc };
    return D._h;
  }

  // rainMm — 1 soatdagi yomgʻir; drainMm — kanalizatsiya/ariqlar soatiga olib keta oladigani; runoff — asfalt/tomdan oqadigan ulush
  function scenario(D, M, rainMm, opt) {
    const o = Object.assign({ drainMm: 10, runoff: 0.7, width: 20, n: 0.016, minDepth: 0.1, riverHa: 1500 }, opt || {});
    const { slope, acc } = hydro(D), A = D.step * D.step, eff = Math.max(0, rainMm - o.drainMm) / 1000 * o.runoff;   // m (1 soatda)
    const wet = [];
    let river = 0;
    if (eff > 0) for (let k = 0; k < acc.length; k++) {
      if (acc[k] > o.riverHa * 1e4) { river++; continue; }                     // daryo/kanal oʻzani — koʻcha toshqini emas
      const Q = (eff * acc[k]) / 3600;                                         // m³/s
      const h = Math.pow((Q * o.n) / (o.width * Math.sqrt(slope[k])), 0.6);
      if (h >= o.minDepth) wet.push({ k, d: Math.min(h, 2) });
    }
    const cells = wet.map(w => { const ll = cellLL(D, w.k); return { lat: ll[0], lon: ll[1], depth: +w.d.toFixed(2) }; });
    // Suv ostidagi koʻchalar va binolar
    const key = (x, y) => Math.floor((x - D.x0) / D.step) + Math.floor((y - D.y0) / D.step) * D.nx, depthAt = new Map(wet.map(w => [w.k, w.d]));
    const st = new Map();
    M.ways.forEach(w => G.sample(w.xy, 20, (x, y) => { const d = depthAt.get(key(x, y)); if (d) { const o2 = st.get(w.street) || { len: 0, max: 0 }; o2.len += 20; o2.max = Math.max(o2.max, d); st.set(w.street, o2); } }));
    const streets = [...st.entries()].map(([s, v]) => ({ s, name: M.streets[s].name, len: v.len, max: +v.max.toFixed(2) })).filter(x => x.name).sort((a, b) => b.max * b.len - a.max * a.len);
    const blds = (NX.buildings.get() || []).filter(b => { const [x, y] = G.xy(b.c[0], b.c[1]); return (depthAt.get(key(x, y)) || 0) >= 0.2; });
    return { rain: rainMm, drain: o.drainMm, cells, streets, buildings: blds.length, critical: blds.filter(b => /school|kindergarten|hospital|clinic/.test(b.kind)).map(b => b.name || b.kind).slice(0, 10), areaHa: +(cells.length * D.step * o.width / 1e4).toFixed(1), river, step: D.step };
  }

  // Doimiy xavf xaritasi: katta maydondan suv yigʻiladigan va qiyaligi kam (sekin oqadigan) joylar
  function flood(D, M) {
    const { slope, acc } = hydro(D), hot = [];
    for (let k = 0; k < acc.length; k++) if (acc[k] >= 40 * 1e4 && acc[k] <= 1500 * 1e4 && slope[k] <= 0.01) { const ll = cellLL(D, k); hot.push({ lat: ll[0], lon: ll[1], risk: Math.min(1, Math.log10(acc[k] / 1e5) / 2 + 0.3) }); }
    const s50 = scenario(D, M, 50);
    const zs = Array.from(D.z).filter(isFinite).sort((a, b) => a - b);
    return { cells: hot, hot, basins: hot.length, streets: s50.streets, zmin: zs[0], zmax: zs[zs.length - 1], step: D.step, src: D.src };
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

  NX.twin = { dem, rain, solarYear, flood, scenario, hydro, cellPoly, roofKwh, SOLAR, sunPos, shadows, CITY };
})();
