/* City Jam — binolar (OpenStreetMap): shakli, qavatlar soni, balandligi.
   3D koʻrinish, tomdagi quyosh salohiyati va yangi bino soyasi uchun. Katta maʼlumot — IndexedDB’da 30 kun saqlanadi. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;
  const TTL = 30 * 86400e3;
  // Qavat balandligi ~3.2 m. OSM’da qavat yoʻq boʻlsa — bino turiga qarab oʻrtacha (taxminiy deb belgilanadi)
  const DEF_LEVELS = { house: 1, detached: 1, residential: 2, apartments: 5, school: 3, kindergarten: 2, hospital: 4, commercial: 2, retail: 1, office: 4, mosque: 1, religious: 1, garage: 1, shed: 1, roof: 1, industrial: 1, warehouse: 1, university: 4, public: 3, government: 3, hotel: 4, yes: 2 };

  function query() {
    const b = NX.config.bbox;
    return `[out:json][timeout:120];way["building"](${b.s},${b.w},${b.n},${b.e});out tags geom qt;`;
  }

  function compact(json) {
    const out = [];
    (json.elements || []).forEach(el => {
      if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) return;
      const t = el.tags || {};
      if (!t.building) return;
      const ring = el.geometry.map(g => [+g.lon.toFixed(6), +g.lat.toFixed(6)]);
      const xy = ring.map(c => G.xy(c[1], c[0]));
      let A = 0, cx = 0, cy = 0;
      for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) { const f = xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1]; A += f; cx += (xy[j][0] + xy[i][0]) * f; cy += (xy[j][1] + xy[i][1]) * f; }
      A /= 2;
      if (Math.abs(A) < 8) return;
      const lv = parseFloat(t['building:levels']), h = parseFloat(t.height);
      const kind = t.building || 'yes';
      // OSM’dagi xato qiymatlar (masalan 90 qavat) — Samarqand uchun real chegara: 30 qavat / 100 m
      const levels0 = isFinite(lv) && lv > 0 ? lv : isFinite(h) && h > 0 ? Math.max(1, Math.round(h / 3.2)) : null, levels = levels0 && levels0 > 30 ? null : levels0;
      out.push({
        id: el.id, ring, kind, name: t['name:uz'] || t.name || '',
        levels: levels || DEF_LEVELS[kind] || 2, est: !levels,
        height: isFinite(h) && h > 0 && h <= 100 ? h : (levels || DEF_LEVELS[kind] || 2) * 3.2,
        area: Math.abs(A), c: G.ll(cx / (6 * A), cy / (6 * A)), roof: t['roof:shape'] || '',
      });
    });
    return out;
  }

  // Butun shahar binolari — tayyor fayl (Overture Maps: OpenStreetMap + Microsoft ML Buildings + Microsoft 2026 qoʻshimcha, ~136 ming bino).
  // OSM’da chizilmagan uylar ham bor (Microsoft sunʼiy yoʻldosh suratlaridan aniqlagan). Overpass’ga bogʻliq emas, tez.
  const STATIC_URL = 'data/buildings-samarqand.json?v=3';   // v2: ichki hovlilar, v3: Microsoft 2026 qoʻshimcha uylar
  // Qavat nomaʼlum boʻlsa: kichik uy — 1, oʻrtacha — 2, katta bino — 3 qavat (taxminiy)
  const byArea = A => (A < 180 ? 1 : A < 1200 ? 2 : 3);
  function decodeStatic(doc) {
    const out = [], S = doc.scale, [lon0, lat0] = doc.base;
    doc.b.forEach((a, i) => {
      const kind = doc.cls[a[0]] || 'yes', lv0 = a[1], name = doc.names[a[2]] || '';
      let x = a[4], y = a[5];
      const ring = [[+(lon0 + x / S).toFixed(6), +(lat0 + y / S).toFixed(6)]];
      for (let k = 6; k < a.length; k += 2) { x += a[k]; y += a[k + 1]; ring.push([+(lon0 + x / S).toFixed(6), +(lat0 + y / S).toFixed(6)]); }
      ring.push(ring[0]);
      const xy = ring.map(c => G.xy(c[1], c[0]));
      let A = 0, cx = 0, cy = 0;
      for (let p = 0, q = xy.length - 1; p < xy.length; q = p++) { const f = xy[q][0] * xy[p][1] - xy[p][0] * xy[q][1]; A += f; cx += (xy[q][0] + xy[p][0]) * f; cy += (xy[q][1] + xy[p][1]) * f; }
      A /= 2;
      if (Math.abs(A) < 8) return;
      const known = lv0 > 0 && lv0 <= 30, levels = known ? lv0 : (kind !== 'yes' && DEF_LEVELS[kind]) || byArea(Math.abs(A));
      // Ichki hovli (perimetr binolar): teshik halqalari — 3D da usti ochiq, maydondan ayiriladi
      const holes = (doc.h && doc.h[i] || []).map(h => { let hx = h[0], hy = h[1]; const r = [[+(lon0 + hx / S).toFixed(6), +(lat0 + hy / S).toFixed(6)]]; for (let k = 2; k < h.length; k += 2) { hx += h[k]; hy += h[k + 1]; r.push([+(lon0 + hx / S).toFixed(6), +(lat0 + hy / S).toFixed(6)]); } r.push(r[0]); return r; });
      let hA = 0; holes.forEach(r => { const q = r.map(c => G.xy(c[1], c[0])); let a2 = 0; for (let p = 0, t = q.length - 1; p < q.length; t = p++) a2 += q[t][0] * q[p][1] - q[p][0] * q[t][1]; hA += Math.abs(a2 / 2); });
      const o = { id: i + 1, ring, kind, name, levels, est: !known, height: levels * 3.2, area: Math.max(8, Math.abs(A) - hA), c: G.ll(cx / (6 * A), cy / (6 * A)), roof: '', ml: a[3] === 1 };
      if (holes.length) o.holes = holes;
      out.push(o);
    });
    return out;
  }
  // Tarixiy obidalar va diniy binolar: OSM’da balandlik yozilmagan boʻlsa — ochiq manbalardagi haqiqiy balandliklar (taxminiy, oʻrtacha massa;
  // peshtoq va minoralar bundan baland). Aks holda masjid/madrasa “1 qavatli uy” boʻlib qoladi.
  const LM = [
    { c: [39.6547, 66.9757], r: 140, h: 26, n: 'Registon madrasalari (peshtoq ~35 m)' },
    { c: [39.6606, 66.9794], r: 110, h: 30, n: 'Bibixonim (peshtoq ~35 m, gumbaz ~40 m)' },
    { c: [39.6485, 66.9690], r: 70, h: 28, n: 'Goʻri Amir (gumbaz ~34 m)' },
    { c: [39.6628, 66.9880], r: 220, h: 13, n: 'Shohi Zinda maqbaralari' },
    { c: [39.6591, 66.9745], r: 60, h: 14, n: 'Hazrati Xizr masjidi' },
  ];
  const LM_KIND = /mosque|religious|cathedral|church|temple|shrine/, LM_NAME = /madras|masjid|maqbara|mausole|registon|bibixonim|go.?ri.?amir|shohi.?zinda|xonaqoh|мадраса|мечеть|мавзолей/i;
  function refine(list) {
    list.forEach(b => {
      const lmk = LM_KIND.test(b.kind) || (b.name && LM_NAME.test(b.name));
      const [x, y] = G.xy(b.c[0], b.c[1]);
      const spot = LM.find(l => { const [lx, ly] = G.xy(l.c[0], l.c[1]); return Math.hypot(lx - x, ly - y) < l.r; });
      if (spot && (lmk || b.area > 600) && b.est) { b.height = spot.h; b.levels = Math.round(spot.h / 3.2); b.lmH = spot.n; }
      else if (lmk && b.est && b.area > 150) { b.height = Math.max(b.height, b.area > 800 ? 14 : 10); b.levels = Math.round(b.height / 3.2); }
    });
    return list;
  }
  let staticBox = null;
  async function loadStatic() {
    const r = await fetch(STATIC_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const doc = await r.json();
    const l = refine(decodeStatic(doc));
    if (l.length < 1000) throw new Error('fayl toʻliq emas');
    return { list: l, src: doc.src };
  }

  // IndexedDB (localStorage bunday hajmga yetmaydi)
  function idb() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB yoʻq'));
      const r = indexedDB.open('cityjam-big', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function kv(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
  }
  NX.bigStore = { get: k => kv('readonly', s => s.get(k)).catch(() => null), set: (k, v) => kv('readwrite', s => s.put(v, k)).catch(() => null) };

  let list = null, loading = null, srcName = 'OpenStreetMap';
  async function load(onStep) {
    if (list) return list;
    if (loading) return loading;
    loading = (async () => {
      // 1) Butun shahar fayli (brauzer keshida; har ochilishda ~1 soniyada oʻqiladi)
      try {
        onStep && onStep('Shahar binolari yuklanmoqda (~136 ming bino)');
        const st = await loadStatic();
        staticBox = NX.twin ? NX.twin.CITY : null; srcName = st.src;
        list = st.list;
        setTimeout(() => document.dispatchEvent(new Event('nx:buildings')), 0);   // maktablar tasdigʻi qayta tekshiriladi
        return list;
      } catch (e) { console.warn('Binolar fayli:', e.message); }
      // 2) Zaxira — OpenStreetMap (Overpass), markaz
      const hit = await NX.bigStore.get('buildings:v1');
      if (hit && Date.now() - hit.ts < TTL && hit.list && hit.list.length) return (list = hit.list);
      onStep && onStep('OpenStreetMap’dan binolar yuklanmoqda (bir marta, 10–60 soniya)');
      const body = 'data=' + encodeURIComponent(query());
      let lastErr = null;
      for (const url of NX.config.overpassMirrors) {
        try {
          const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 120000);
          if (r.ok && r.data && r.data.elements) {
            list = compact(r.data);
            NX.bigStore.set('buildings:v1', { ts: Date.now(), list });
            return list;
          }
          lastErr = new Error('HTTP ' + r.status);
        } catch (e) { lastErr = e; }
      }
      throw new Error('Binolar yuklanmadi: ' + ((lastErr && lastErr.message) || 'server javob bermadi'));
    })();
    try { return await loading; } finally { loading = null; }
  }

  // Tahlil hududidan tashqarida — xarita qayerga surilsa, oʻsha joyning binolari (0.01° plitalar, har biri bir marta)
  const TILE = 0.01, tilesDone = new Set(), tileBusy = new Set();
  async function loadView(bb, onStep) {
    if (!list) return 0;
    const B = staticBox || NX.config.bbox, need = [];
    for (let a = Math.floor(bb.s / TILE); a <= Math.floor(bb.n / TILE); a++) for (let o = Math.floor(bb.w / TILE); o <= Math.floor(bb.e / TILE); o++) {
      const s = a * TILE, w = o * TILE, k = a + ':' + o;
      if (s >= B.s && s + TILE <= B.n && w >= B.w && w + TILE <= B.e) continue;   // asosiy yuklamada bor
      if (!tilesDone.has(k) && !tileBusy.has(k)) need.push({ k, s, w });
    }
    let added = 0;
    for (const t of need.slice(0, 6)) {
      tileBusy.add(t.k);
      try {
        let part = await NX.bigStore.get('bt:' + t.k);
        if (!part || Date.now() - part.ts > TTL) {
          onStep && onStep('Binolar yuklanmoqda');
          const q = `[out:json][timeout:60];way["building"](${t.s.toFixed(4)},${t.w.toFixed(4)},${(t.s + TILE).toFixed(4)},${(t.w + TILE).toFixed(4)});out tags geom qt;`;
          let got = null;
          for (const url of NX.config.overpassMirrors) { try { const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 60000); if (r.ok && r.data && r.data.elements) { got = r.data; break; } } catch (e) { /* keyingi */ } }
          if (!got) continue;
          part = { ts: Date.now(), list: compact(got) };
          NX.bigStore.set('bt:' + t.k, part);
        }
        const seen = new Set(list.map(b => b.id));
        part.list.forEach(b => { if (!seen.has(b.id)) { list.push(b); added++; } });
        tilesDone.add(t.k);
      } finally { tileBusy.delete(t.k); }
    }
    return added;
  }

  // Nuqta koʻpburchak ichidami (lon/lat)
  const inRing = (ring, lon, lat) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };

  NX.buildings = { load, loadView, get: () => list, src: () => srcName, inRing, DEF_LEVELS, _compact: compact, _decode: decodeStatic };
})();
