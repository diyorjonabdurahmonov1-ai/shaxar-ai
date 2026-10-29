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
      const levels = isFinite(lv) && lv > 0 ? lv : isFinite(h) && h > 0 ? Math.max(1, Math.round(h / 3.2)) : null;
      out.push({
        id: el.id, ring, kind, name: t['name:uz'] || t.name || '',
        levels: levels || DEF_LEVELS[kind] || 2, est: !levels,
        height: isFinite(h) && h > 0 ? h : (levels || DEF_LEVELS[kind] || 2) * 3.2,
        area: Math.abs(A), c: G.ll(cx / (6 * A), cy / (6 * A)), roof: t['roof:shape'] || '',
      });
    });
    return out;
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

  let list = null, loading = null;
  async function load(onStep) {
    if (list) return list;
    if (loading) return loading;
    loading = (async () => {
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

  // Nuqta koʻpburchak ichidami (lon/lat)
  const inRing = (ring, lon, lat) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };

  NX.buildings = { load, get: () => list, inRing, DEF_LEVELS, _compact: compact };
})();
