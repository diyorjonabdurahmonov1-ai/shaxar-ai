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
    const hours = [];
    t.forEach((ts, i) => { const dt = ts - now; if (dt < -3600e3 || dt > 48 * 3600e3) return; if (dt >= 0 && dt <= 24 * 3600e3) d24 += p[i] || 0; if (dt >= 0) d48 += p[i] || 0; if ((p[i] || 0) > maxH) { maxH = p[i]; maxAt = ts; } if (dt <= 24 * 3600e3) hours.push({ ts, mm: p[i] || 0 }); });
    rainCache = { ts: now, d24: +d24.toFixed(1), d48: +d48.toFixed(1), maxH: +maxH.toFixed(1), maxAt, hours };
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

  // ---------- Iqlim: 1991–oʻtgan yil (Open-Meteo arxivi, ERA5 qayta tahlili) + Oʻzgidromet sharhi ----------
  // Oʻzgidromet, “Oʻzbekiston iqlimi” (2024-yil yakunlari, 2025-yil yanvar): grafiklardan oʻqilgan qiymatlar — taxminiy
  const UZHYDROMET = {
    manba: 'Oʻzgidromet, “Oʻzbekiston iqlimi” sharhi (2024-yil yakunlari)',
    samarqand_harorat_meyori_c: 14.7, samarqand_yogin_meyori_mm: 380, meyor_davri: '1991–2020',
    yil2024: 'Oʻrtacha yillik harorat meʼyordan 0,6–1,1° yuqori; Samarqand viloyatining ayrim hududlarida yogʻin meʼyorning 124–184% i',
    sel: 'Togʻ oldi hududlarida jadal yomgʻirlar sel toshqinlarini keltirib chiqaradi; bahorda qor koʻchkilari boʻlishi mumkin',
    eslatma: 'meʼyor qiymatlari hujjatdagi grafikdan oʻqilgan (taxminan)',
  };
  // Oʻzgidromet ochiq maʼlumoti: data.egov.uz, 4-006-0012 “Pastliklardagi oʻrtacha yogʻingarchilik”, Samarqand, oylar boʻyicha (mm)
  const EGOV_RAIN = {
    manba: 'data.egov.uz, 4-006-0012 (Gidrometeorologiya xizmati agentligi)', yil: null,
    samarqand: [19.3, 34.5, 69.1, 35.5, 0.7, 5, 0, 0, 0, 2.9, 19.4, 97.8],
  };
  async function climate() {
    const hit = await NX.bigStore.get('climate:v2');
    if (hit && Date.now() - hit.ts < 30 * 86400e3) return hit;
    const y1 = new Date().getFullYear() - 1, [la, lo] = NX.config.center;
    const r = await NX.fetchJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${la}&longitude=${lo}&start_date=1991-01-01&end_date=${y1}-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=Asia%2FSamarkand`, {}, 60000);
    if (!r.ok || !r.data || !r.data.daily) throw new Error('Iqlim arxivi olinmadi.');
    const d = r.data.daily, years = new Map(), days = [];
    d.time.forEach((t, i) => {
      const y = +t.slice(0, 4), o = years.get(y) || { y, ts: 0, n: 0, p: 0, pmax: 0, pmaxAt: '', wet20: 0 };
      const T = d.temperature_2m_mean[i], P = d.precipitation_sum[i] || 0;
      if (T != null) { o.ts += T; o.n++; }
      o.p += P; if (P > o.pmax) { o.pmax = P; o.pmaxAt = t; } if (P >= 20) o.wet20++;
      years.set(y, o); days.push({ t, p: P });
    });
    const list = [...years.values()].map(o => ({ y: o.y, t: +(o.ts / Math.max(1, o.n)).toFixed(2), p: Math.round(o.p), pmax: +o.pmax.toFixed(1), pmaxAt: o.pmaxAt, wet20: o.wet20 }));
    const norm = list.filter(o => o.y >= 1991 && o.y <= 2020), mean = a => a.reduce((t, v) => t + v, 0) / a.length;
    const tN = mean(norm.map(o => o.t)), pN = mean(norm.map(o => o.p));
    // Isish tezligi: chiziqli regressiya, °C / 10 yil
    const xs = list.map(o => o.y), ys = list.map(o => o.t), mx = mean(xs), my = mean(ys);
    const slope = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / xs.reduce((t, x) => t + (x - mx) ** 2, 0);
    const top = days.sort((a, b) => b.p - a.p).slice(0, 8).map(x => ({ t: x.t, p: +x.p.toFixed(1) }));
    // Oylik yogʻin meʼyori (1991–2020)
    const mon = Array.from({ length: 12 }, () => []), acc = new Map();
    d.time.forEach((t, i) => { const y = +t.slice(0, 4), m = +t.slice(5, 7) - 1; if (y < 1991 || y > 2020) return; const k = y * 12 + m; acc.set(k, (acc.get(k) || 0) + (d.precipitation_sum[i] || 0)); });
    acc.forEach((v, k) => mon[k % 12].push(v));
    const monthNorm = mon.map(a => (a.length ? +(a.reduce((t, v) => t + v, 0) / a.length).toFixed(1) : 0));
    const out = { ts: Date.now(), years: list, tNorm: +tN.toFixed(2), pNorm: Math.round(pN), trend10: +(slope * 10).toFixed(2), top, monthNorm, src: 'Open-Meteo arxivi (ERA5 qayta tahlili)', doc: UZHYDROMET };
    NX.bigStore.set('climate:v2', out);
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
  // ---------- 2D fizik model (LISFLOOD-FP) uchun tayyorlash va natijani koʻchalarga bogʻlash ----------
  async function grid40(onStep) {
    const hit = await NX.bigStore.get('dem40:v1');
    if (hit && hit.z && hit.z.length) return hit;
    const step = 40, [x0, y0] = G.xy(CITY.s, CITY.w), [x1, y1] = G.xy(CITY.n, CITY.e);
    const nx = Math.ceil((x1 - x0) / step), ny = Math.ceil((y1 - y0) / step), f = await terrarium(onStep), z = new Float32Array(nx * ny), q = step / 3;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) { const ll = G.ll(x0 + (i + 0.5) * step + a * q, y0 + (j + 0.5) * step + b * q), e = f(ll[0], ll[1]); if (isFinite(e)) { s += e; n++; } }
      z[j * nx + i] = n ? s / n : NaN;
    }
    // Boʻsh qiymatlar — qoʻshnidan
    for (let k = 0; k < z.length; k++) if (!isFinite(z[k])) z[k] = z[k - 1] || z[k + 1] || 700;
    const out = { nx, ny, step, x0, y0, z, src: 'AWS Terrain Tiles (SRTM ~30 m)' };
    NX.bigStore.set('dem40:v1', out);
    return out;
  }
  // rain: [{ t0, t1 (soniya), mmh }]; drainMm — soatiga kanalizatsiya/ariqlar olib ketadigan
  async function flood2d(D, roadList, rain, opt, onProgress) {
    const o = Object.assign({ drainMm: 10, infilMm: 8, after: 2 * 3600, snapMin: 10 }, opt || {});
    // SRTM’dagi soxta chuqurlar (bino, daraxt, koʻprik izlari) — 2 m dan sayozlari toʻldiriladi; chuqurroqlari (karyer, jar) qoladi
    const Fh = hydro(D).F;
    const N = D.nx * D.ny, z = Float32Array.from(D.z, (v, k) => (Fh[k] - v < 2 ? Fh[k] : v)), nArr = new Float32Array(N).fill(0.05), loss = new Float32Array(N).fill(o.infilMm / 1000 / 3600);
    const cellOf = (lat, lon) => { const [x, y] = G.xy(lat, lon), i = Math.floor((x - D.x0) / D.step), j = Math.floor((y - D.y0) / D.step); return i < 0 || j < 0 || i >= D.nx || j >= D.ny ? -1 : j * D.nx + i; };
    // Binolar — gʻadir-budir (suv sekin oʻtadi), oʻtkazmaydigan sirt
    (NX.buildings.get() || []).forEach(b => { const k = cellOf(b.c[0], b.c[1]); if (k >= 0) { nArr[k] = 0.08; loss[k] = o.drainMm / 1000 / 3600; } });
    // Koʻchalar — silliq kanal (n = 0.016), relyefga 15 sm “oʻyilgan”; har segment qaysi kataklardan oʻtishi
    const segs = [], roadCell = new Uint8Array(N);
    (roadList || []).forEach(w => { for (let i = 1; i < w.ll.length; i++) {
      const a = w.ll[i - 1], b = w.ll[i], [ax, ay] = G.xy(a[0], a[1]), [bx, by] = G.xy(b[0], b[1]), len = Math.hypot(bx - ax, by - ay), st = Math.max(1, Math.round(len / 15)), cells = new Set();
      for (let t = 0; t <= st; t++) { const ll = G.ll(ax + (bx - ax) * t / st, ay + (by - ay) * t / st), k = cellOf(ll[0], ll[1]); if (k >= 0) cells.add(k); }
      if (!cells.size) continue;
      cells.forEach(k => { if (!roadCell[k]) { roadCell[k] = 1; z[k] -= 0.15; } nArr[k] = 0.016; loss[k] = o.drainMm / 1000 / 3600; });
      const za = zAt(D, a[0], a[1]), zb = zAt(D, b[0], b[1]);
      segs.push({ c: za >= zb ? [[a[1], a[0]], [b[1], b[0]]] : [[b[1], b[0]], [a[1], a[0]]], cells: [...cells], name: w.name, len, w: ROAD_W[w.hw] || 8, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
    } });
    const tEnd = Math.max(...rain.map(r => r.t1), 0);
    const res = await NX.flood2d.run({ nx: D.nx, ny: D.ny, dx: D.step, z, n: nArr, loss, rain, duration: tEnd + o.after, snapEvery: o.snapMin * 60 }, onProgress);
    // Har bir vaqt qadamida har bir koʻcha segmentidagi eng katta chuqurlik
    const frames = res.snaps.map(sn => {
      const m = new Map(); for (let i = 0; i < sn.idx.length; i++) m.set(sn.idx[i], sn.d[i]);
      const d = new Float32Array(segs.length);
      segs.forEach((sg, i) => { let x = 0; sg.cells.forEach(k => { const v = m.get(k) || 0; if (v > x) x = v; }); d[i] = x; });
      const km = segs.reduce((t2, sg, i) => t2 + (d[i] >= 0.1 ? sg.len : 0), 0) / 1000;
      return { t: sn.t, d, km: +km.toFixed(1) };
    });
    // Koʻchalar boʻyicha: eng chuqur va qachon
    const byName = new Map();
    segs.forEach((sg, i) => {
      if (!sg.name) return;
      let best = 0, bt = 0; frames.forEach(f => { if (f.d[i] > best) { best = f.d[i]; bt = f.t; } });
      if (best < 0.1) return;
      const v = byName.get(sg.name) || { name: sg.name, max: 0, at: null, t: 0, len: 0 };
      v.len += sg.len; if (best > v.max) { v.max = best; v.at = sg.mid; v.t = bt; }
      byName.set(sg.name, v);
    });
    const streets = [...byName.values()].map(v => Object.assign(v, { max: +v.max.toFixed(2), len: Math.round(v.len) })).sort((a, b) => b.max * Math.sqrt(b.len) - a.max * Math.sqrt(a.len));
    const peak = frames.reduce((b, f) => (f.km > b.km ? f : b), frames[0] || { km: 0, t: 0 });
    // Eng yuqori nuqtada suv yetadigan binolar
    const hmax = res.hmax, wetB = (NX.buildings.get() || []).filter(b => { const k = cellOf(b.c[0], b.c[1]); return k >= 0 && hmax[k] >= 0.2; });
    return { mode: 'dynamic', rain, drain: o.drainMm, segs, frames, streets, peak, steps: res.steps, buildings: wetB.length, wetIds: new Set(wetB.map(b => b.id)), critical: wetB.filter(b => /school|kindergarten|hospital|clinic/.test(b.kind)).map(b => b.name || ({ school: 'maktab', kindergarten: 'bogʻcha', hospital: 'shifoxona', clinic: 'poliklinika' })[b.kind]).slice(0, 10) };
  }
  // Vaqt qadami → xarita uchun koʻcha segmentlari (≥ 5 sm)
  function frameSegs(R, fi) {
    const f = R.frames[Math.max(0, Math.min(R.frames.length - 1, fi))], out = [];
    R.segs.forEach((sg, i) => { if (f.d[i] >= 0.05) out.push({ c: sg.c, d: +Math.min(1.5, f.d[i]).toFixed(2), w: sg.w }); });
    return out;
  }

  // ---------- Koʻchalar boʻylab suv (shahar suvi asosan koʻchalar orqali oqadi) ----------
  const ROAD_W = { trunk: 22, primary: 20, secondary: 16, tertiary: 12, unclassified: 9, residential: 8, living_street: 6 };
  // Butun shahar koʻchalari — 4 qismga boʻlib (katta soʻrov serverda vaqt tugashi bilan uzilmasin); “out body” — tugun raqamlari bilan (tarmoq uchun shart)
  async function roads(onStep) {
    const hit = await NX.bigStore.get('roads:v2');
    if (hit && hit.list && hit.list.length && Date.now() - hit.ts < 30 * 86400e3) return hit.list;
    const mlat = (CITY.s + CITY.n) / 2, mlon = (CITY.w + CITY.e) / 2, parts = [[CITY.s, CITY.w, mlat, mlon], [CITY.s, mlon, mlat, CITY.e], [mlat, CITY.w, CITY.n, mlon], [mlat, mlon, CITY.n, CITY.e]];
    const seen = new Set(), list = [];
    for (let k = 0; k < parts.length; k++) {
      onStep && onStep(`Butun shahar koʻchalari yuklanmoqda (bir marta): ${k + 1}/4`);
      const [s, w, n, e] = parts[k];
      const q = `[out:json][timeout:90];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"](${s},${w},${n},${e});out body geom qt;`;
      let got = null;
      for (const url of NX.config.overpassMirrors) {
        try {
          const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 100000);
          if (r.ok && r.data && r.data.elements) { got = r.data.elements; break; }
        } catch (err) { /* keyingi server */ }
      }
      if (!got) throw new Error(`Shahar koʻchalari yuklanmadi (Overpass, ${k + 1}/4 qism). Keyinroq qayta urinib koʻring.`);
      got.forEach(e => {
        if (e.type !== 'way' || !e.geometry || e.geometry.length < 2 || seen.has(e.id)) return;
        seen.add(e.id);
        const ll = e.geometry.map(g => [+g.lat.toFixed(6), +g.lon.toFixed(6)]);
        // Tugun raqami boʻlmasa — koordinatadan (chorrahalarda bir xil chiqadi)
        const nodes = Array.isArray(e.nodes) && e.nodes.length === ll.length ? e.nodes : ll.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5));
        list.push({ id: e.id, hw: e.tags && e.tags.highway, name: (e.tags && (e.tags['name:uz'] || e.tags.name)) || '', nodes, ll });
      });
    }
    NX.bigStore.set('roads:v2', { ts: Date.now(), list });
    return list;
  }
  // Relyef qiymati nuqtada (bilinear)
  function zAt(D, lat, lon) {
    const [x, y] = G.xy(lat, lon), fx = (x - D.x0) / D.step - 0.5, fy = (y - D.y0) / D.step - 0.5;
    const i = Math.max(0, Math.min(D.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(D.ny - 2, Math.floor(fy))), a = Math.max(0, Math.min(1, fx - i)), b = Math.max(0, Math.min(1, fy - j));
    const z = (ii, jj) => D.z[jj * D.nx + ii];
    return z(i, j) * (1 - a) * (1 - b) + z(i + 1, j) * a * (1 - b) + z(i, j + 1) * (1 - a) * b + z(i + 1, j + 1) * a * b;
  }
  // Koʻcha tarmogʻi: tugunlar (balandligi bilan), qoʻshnilar; har relyef katagining suvi eng yaqin tugunga tushadi; suv pastga oqadi
  function streetNet(D, list) {
    if (D._net && D._net.list === list) return D._net;
    const nodes = new Map(), segs = [];
    const node = (id, ll) => { let n = nodes.get(id); if (!n) { n = { id, lat: ll[0], lon: ll[1], z: zAt(D, ll[0], ll[1]), nb: [], area: 0, acc: 0, down: null, dseg: null }; nodes.set(id, n); } return n; };
    list.forEach(w => {
      for (let i = 1; i < w.ll.length; i++) {
        const a = node(w.nodes[i - 1], w.ll[i - 1]), b = node(w.nodes[i], w.ll[i]);
        const len = G.d(...G.xy(a.lat, a.lon), ...G.xy(b.lat, b.lon));
        if (len < 0.5) continue;
        const sg = { a, b, len, w: ROAD_W[w.hw] || 8, name: w.name, hw: w.hw };
        segs.push(sg); a.nb.push({ n: b, sg }); b.nb.push({ n: a, sg });
      }
    });
    const arr = [...nodes.values()];
    // Relyef shovqini (bino, daraxt) — tugun balandligi qoʻshnilari bilan silliqlanadi
    for (let it = 0; it < 2; it++) { const nz = arr.map(n => (n.z * 2 + n.nb.reduce((t, q) => t + q.n.z, 0)) / (2 + n.nb.length)); arr.forEach((n, i) => { n.z = nz[i]; }); }
    // Suv yigʻish: har relyef katagi → eng yaqin tugun (150 m gacha)
    const grid = new Map(), gk = (x, y) => Math.floor(x / 100) + ':' + Math.floor(y / 100);
    arr.forEach(n => { const [x, y] = G.xy(n.lat, n.lon); n.x = x; n.y = y; const k = gk(x, y); (grid.get(k) || grid.set(k, []).get(k)).push(n); });
    const A = D.step * D.step;
    for (let k = 0; k < D.z.length; k++) {
      const x = D.x0 + ((k % D.nx) + 0.5) * D.step, y = D.y0 + (Math.floor(k / D.nx) + 0.5) * D.step;
      let best = null, bd = 150;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) (grid.get((Math.floor(x / 100) + di) + ':' + (Math.floor(y / 100) + dj)) || []).forEach(n => { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } });
      if (best) best.area += A;
    }
    // Oqim: har tugundan eng tik pastga ketadigan qoʻshniga; balanddan pastga yigʻiladi
    arr.forEach(n => { let bs = 0; n.nb.forEach(q => { const sl = (n.z - q.n.z) / q.sg.len; if (sl > bs) { bs = sl; n.down = q.n; n.dseg = q.sg; } }); n.acc = n.area; });
    arr.slice().sort((p, q) => q.z - p.z).forEach(n => { if (n.down) n.down.acc += n.acc; });
    D._net = { list, nodes: arr, segs };
    return D._net;
  }
  // N mm yomgʻir 1 soatda: koʻchalarda oqim chuqurligi (Manning) va past joylarda (chiqishi yoʻq tugun) toʻplanish
  function streetScenario(D, list, rainMm, opt) {
    const o = Object.assign({ drainMm: 10, runoff: 0.7, n: 0.016 }, opt || {});
    const net = streetNet(D, list), eff = Math.max(0, rainMm - o.drainMm) / 1000 * o.runoff;
    const depth = new Map();                                                  // segment → chuqurlik, m
    const put = (sg, h) => { if (h > (depth.get(sg) || 0)) depth.set(sg, h); };
    if (eff > 0) net.nodes.forEach(n => {
      const Q = (eff * n.acc) / 3600;
      if (n.dseg) {
        const S = Math.max(0.003, (n.z - n.down.z) / n.dseg.len);
        put(n.dseg, Math.min(1.2, Math.pow((Q * o.n) / (n.dseg.w * Math.sqrt(S)), 0.6)));
      } else if (n.nb.length) {
        // Past joy: suv hajmi atrofdagi koʻcha boʻlaklariga yoyiladi (1 soat ichida)
        const V = eff * n.acc, areaS = n.nb.reduce((t, q) => t + q.sg.len * q.sg.w, 0);
        const h = Math.min(1.2, V / Math.max(1, areaS) * 0.35);
        n.nb.forEach(q => put(q.sg, h));
      }
    });
    const segs = [], byName = new Map();
    depth.forEach((h, sg) => {
      if (h < 0.05) return;
      const fromA = sg.a.z >= sg.b.z;                                         // chiziq oqim yoʻnalishida
      segs.push({ c: fromA ? [[sg.a.lon, sg.a.lat], [sg.b.lon, sg.b.lat]] : [[sg.b.lon, sg.b.lat], [sg.a.lon, sg.a.lat]], d: +h.toFixed(2), w: sg.w });
      if (h >= 0.1 && sg.name) { const v = byName.get(sg.name) || { name: sg.name, len: 0, max: 0, at: null }; v.len += sg.len; if (h > v.max) { v.max = h; v.at = [(sg.a.lat + sg.b.lat) / 2, (sg.a.lon + sg.b.lon) / 2]; } byName.set(sg.name, v); }
    });
    const streets = [...byName.values()].map(v => Object.assign(v, { len: Math.round(v.len), max: +v.max.toFixed(2) })).sort((a, b) => b.max * Math.sqrt(b.len) - a.max * Math.sqrt(a.len));
    // Suv yetadigan binolar: 20 sm+ suvli koʻchadan 20 m gacha
    const wetGrid = new Map(), k20 = (x, y) => Math.floor(x / 40) + ':' + Math.floor(y / 40);
    depth.forEach((h, sg) => { if (h < 0.2) return; const steps = Math.max(1, Math.round(sg.len / 15)); for (let t = 0; t <= steps; t++) { const x = sg.a.x + (sg.b.x - sg.a.x) * t / steps, y = sg.a.y + (sg.b.y - sg.a.y) * t / steps; const k = k20(x, y); (wetGrid.get(k) || wetGrid.set(k, []).get(k)).push([x, y]); } });
    const near = (x, y) => { for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const L = wetGrid.get((Math.floor(x / 40) + di) + ':' + (Math.floor(y / 40) + dj)); if (L && L.some(q => Math.hypot(q[0] - x, q[1] - y) < 20)) return true; } return false; };
    const blds = (NX.buildings.get() || []).filter(b => { const [x, y] = G.xy(b.c[0], b.c[1]); return near(x, y); });
    const len10 = [...depth.entries()].filter(([, h]) => h >= 0.1).reduce((t, [sg]) => t + sg.len, 0);
    return { rain: rainMm, drain: o.drainMm, segs, streets, km: +(len10 / 1000).toFixed(1), buildings: blds.length, wetIds: new Set(blds.map(b => b.id)), critical: blds.filter(b => /school|kindergarten|hospital|clinic/.test(b.kind)).map(b => b.name || ({ school: 'maktab', kindergarten: 'bogʻcha', hospital: 'shifoxona', clinic: 'poliklinika' })[b.kind]).slice(0, 10), mode: 'street' };
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

  NX.twin = { climate, UZHYDROMET, EGOV_RAIN, dem, grid40, flood2d, frameSegs, rain, solarYear, flood, scenario, hydro, roads, streetNet, streetScenario, zAt, cellPoly, roofKwh, SOLAR, sunPos, shadows, CITY };
})();
