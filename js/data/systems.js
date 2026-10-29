/* City Jam — shahar tizimlari: transport, kameralar, elektr, gaz, suv, kanalizatsiya.
   Har bir tizim maʼlumoti — xarita qatlami (GeoJSON / KML / CSV). Fayl bir marta yuklanadi va Worker orqali
   barcha xodimlarga koʻrinadi (Worker eski boʻlsa yoki xodim kodi kiritilmagan boʻlsa — shu kompyuterda saqlanadi).
   Real vaqt maʼlumoti (datchiklar, oqim, video) — tashkilotlar API bergach, shu tizimlarga ulanadi. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;

  NX.SYSTEMS = {
    transport: { icon: '🚦', uz: 'Transport va yoʻllar', color: '#0f766e', live: true,
      sources: 'Yandex probkalar (real vaqt), OpenStreetMap, Mapillary suratlari, Open-Meteo ob-havo',
      ai: 'Muammoli chorrahalar, maktab oldidagi xavf, bekat yetishmasligi, “agar…?” simulyatsiyasi' },
    camera: { icon: '📹', uz: 'Kameralar', color: '#0ea5e9',
      need: 'Kameralar roʻyxati: joylashuvi va video havolasi (HLS yoki RTSP) — “Xavfsiz shahar” tizimidan',
      ai: 'Mashinalar soni, tirbandlik, avariya va notoʻgʻri toʻxtashni avtomatik aniqlash' },
    power: { icon: '⚡', uz: 'Elektr tarmoqlari', color: '#ca8a04',
      need: 'Liniyalar, transformatorlar va podstansiyalar xaritasi; oʻchishlar va yuklama (API) — Hududiy elektr tarmoqlari',
      ai: 'Oʻchish joylari, ortiqcha yuklama, yangi qurilishga quvvat yetadimi' },
    gas: { icon: '🔥', uz: 'Gaz tarmoqlari', color: '#ea580c',
      need: 'Quvurlar va GTP xaritasi; bosim datchiklari (API) — Hududgaztaʼminot',
      ai: 'Bosim pasayishi (sizib chiqish), qurilish quvur himoya zonasiga tushadimi' },
    water: { icon: '💧', uz: 'Ichimlik suvi', color: '#2563eb',
      need: 'Quvurlar, nasos stansiyalari xaritasi; bosim va sarf datchiklari (API) — Suvoqova',
      ai: 'Avariya va sizib chiqish, suv yetmaydigan hududlar' },
    sewer: { icon: '🚰', uz: 'Kanalizatsiya', color: '#7c3aed',
      need: 'Kollektorlar va nasos stansiyalari xaritasi; toʻlish datchiklari (API)',
      ai: 'Toʻlib ketish xavfi, yomgʻirda suv bosishi' },
  };
  const KEYS = Object.keys(NX.SYSTEMS).filter(k => k !== 'transport');

  // ---------- Fayllarni oʻqish: GeoJSON, KML, CSV ----------
  function fromKML(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('KML fayl buzilgan.');
    const coords = el => el.textContent.trim().split(/\s+/).map(c => c.split(',').map(Number)).filter(c => c.length >= 2 && isFinite(c[0]) && isFinite(c[1])).map(c => [c[0], c[1]]);
    const feats = [];
    [...doc.getElementsByTagName('Placemark')].forEach(pm => {
      const props = {};
      const nm = pm.getElementsByTagName('name')[0]; if (nm) props.name = nm.textContent.trim();
      const ds = pm.getElementsByTagName('description')[0]; if (ds) props.description = ds.textContent.trim().slice(0, 500);
      [...pm.getElementsByTagName('Data')].forEach(d => { const v = d.getElementsByTagName('value')[0]; if (v) props[d.getAttribute('name')] = v.textContent.trim(); });
      [...pm.getElementsByTagName('SimpleData')].forEach(d => { props[d.getAttribute('name')] = d.textContent.trim(); });
      const add = geometry => feats.push({ type: 'Feature', properties: props, geometry });
      [...pm.getElementsByTagName('Point')].forEach(p => { const c = coords(p.getElementsByTagName('coordinates')[0]); if (c[0]) add({ type: 'Point', coordinates: c[0] }); });
      [...pm.getElementsByTagName('LineString')].forEach(l => { const c = coords(l.getElementsByTagName('coordinates')[0]); if (c.length > 1) add({ type: 'LineString', coordinates: c }); });
      [...pm.getElementsByTagName('Polygon')].forEach(p => { const o = p.getElementsByTagName('outerBoundaryIs')[0] || p; const c = coords(o.getElementsByTagName('coordinates')[0]); if (c.length > 2) add({ type: 'Polygon', coordinates: [c] }); });
    });
    return { type: 'FeatureCollection', features: feats };
  }
  function fromCSV(text) {
    const rows = text.split(/\r?\n/).filter(r => r.trim());
    const sep = (rows[0].match(/;/g) || []).length > (rows[0].match(/,/g) || []).length ? ';' : ',';
    const head = rows[0].split(sep).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const li = head.findIndex(h => /^(lat|latitude|kenglik|shirota)/.test(h)), lo = head.findIndex(h => /^(lon|lng|long|longitude|uzunlik|dolgota)/.test(h));
    if (li < 0 || lo < 0) throw new Error('CSV’da “lat” va “lon” ustunlari boʻlishi kerak.');
    return { type: 'FeatureCollection', features: rows.slice(1).map(r => {
      const c = r.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
      const lat = parseFloat(c[li].replace(',', '.')), lon = parseFloat(c[lo].replace(',', '.'));
      if (!isFinite(lat) || !isFinite(lon)) return null;
      const props = {}; head.forEach((h, i) => { if (i !== li && i !== lo && c[i]) props[h] = c[i]; });
      return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } };
    }).filter(Boolean) };
  }
  function parse(name, text) {
    const n = name.toLowerCase();
    let gj;
    if (/\.kml$/.test(n)) gj = fromKML(text);
    else if (/\.csv$/.test(n)) gj = fromCSV(text);
    else { try { gj = JSON.parse(text); } catch (e) { throw new Error('Fayl oʻqilmadi: GeoJSON, KML yoki CSV boʻlishi kerak.'); } }
    if (gj.type === 'Feature') gj = { type: 'FeatureCollection', features: [gj] };
    if (!gj || !Array.isArray(gj.features)) throw new Error('GeoJSON’da “features” yoʻq.');
    // Koordinatalar WGS84 (lon, lat) boʻlishi kerak — Samarqand atrofida
    const first = [];
    const walk = c => { if (typeof c[0] === 'number') first.push(c); else c.forEach(walk); };
    gj.features.slice(0, 50).forEach(f => f.geometry && walk(f.geometry.coordinates));
    if (first.length && !first.some(c => Math.abs(c[0] - 66.97) < 1.5 && Math.abs(c[1] - 39.65) < 1.5)) {
      throw new Error('Koordinatalar Samarqandga toʻgʻri kelmayapti. Fayl WGS84 (EPSG:4326, kenglik/uzunlik) da boʻlishi kerak — QGIS’da “Export → GeoJSON, EPSG:4326”.');
    }
    gj.features = gj.features.filter(f => f && f.geometry && f.geometry.coordinates);
    return gj;
  }

  // ---------- Hisob: obyektlar soni, liniyalar uzunligi ----------
  function lines(gj) {
    const out = [];
    gj.features.forEach(f => {
      const g = f.geometry;
      if (g.type === 'LineString') out.push(g.coordinates);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(l => out.push(l));
      else if (g.type === 'Polygon') out.push(g.coordinates[0]);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => out.push(p[0]));
    });
    return out;
  }
  function points(gj) {
    const out = [];
    gj.features.forEach(f => { const g = f.geometry; if (g.type === 'Point') out.push(g.coordinates); else if (g.type === 'MultiPoint') g.coordinates.forEach(c => out.push(c)); });
    return out;
  }
  const lenKm = l => G.len(l.map(c => G.xy(c[1], c[0]))) / 1000;
  function stats(gj) {
    const L = lines(gj), P = points(gj);
    return { features: gj.features.length, points: P.length, km: L.reduce((t, l) => t + lenKm(l), 0) };
  }
  // Belgilangan hudud ichida: nuqtalar soni va liniyalar uzunligi (har 10 m da tekshiriladi)
  function inArea(gj, poly) {
    const inside = NX.area.inside;
    let m = 0;
    lines(gj).forEach(l => G.sample(l.map(c => G.xy(c[1], c[0])), 10, (x, y) => { const ll = G.ll(x, y); if (inside(poly, ll[0], ll[1])) m += 10; }));
    return { points: points(gj).filter(c => inside(poly, c[1], c[0])).length, km: m / 1000 };
  }
  // Nuqtaga eng yaqin obyekt (m)
  function nearest(gj, lat, lon) {
    const [x, y] = G.xy(lat, lon);
    let best = Infinity;
    points(gj).forEach(c => { const q = G.xy(c[1], c[0]); best = Math.min(best, Math.hypot(q[0] - x, q[1] - y)); });
    lines(gj).forEach(l => { const q = l.map(c => G.xy(c[1], c[0])); for (let i = 1; i < q.length; i++) best = Math.min(best, G.segDist(x, y, q[i - 1][0], q[i - 1][1], q[i][0], q[i][1])); });
    return best;
  }

  // ---------- Saqlash: Worker (hamma xodimlar uchun) yoki shu kompyuter (IndexedDB) ----------
  const data = {};      // sys → { name, gj, stats, ts, shared }
  const base = () => ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim().replace(/\/+$/, '');
  function idb() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB yoʻq'));
      const r = indexedDB.open('cityjam', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('layers');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction('layers', mode), st = tx.objectStore('layers'), q = fn(st); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
  }

  async function load() {
    // Avval umumiy (Worker), keyin shu kompyuterdagilar
    try {
      if (base()) {
        const r = await NX.fetchJSON(base() + '/layers', {}, 15000);
        if (r.ok && r.data && r.data.items) {
          for (const sys of Object.keys(r.data.items)) {
            if (!NX.SYSTEMS[sys]) continue;
            const d = await NX.fetchJSON(base() + '/layers/' + sys, {}, 60000);
            if (d.ok && d.data && d.data.features) data[sys] = { name: r.data.items[sys].name, gj: d.data, stats: stats(d.data), ts: r.data.items[sys].ts, shared: true };
          }
        }
      }
    } catch (e) { /* Worker eski — faqat mahalliy */ }
    try {
      for (const sys of KEYS) {
        if (data[sys]) continue;
        const v = await idbDo('readonly', st => st.get(sys));
        if (v && v.gj) data[sys] = Object.assign(v, { stats: stats(v.gj), shared: false });
      }
    } catch (e) { /* xotira yopiq */ }
    return data;
  }

  async function save(sys, name, gj) {
    const item = { name, gj, ts: Date.now() };
    const pin = NX.fixes.pin();
    if (base() && pin) {
      const r = await NX.fetchJSON(base() + '/layers/' + sys, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Staff-Code': pin }, body: JSON.stringify({ name, geojson: gj }) }, 120000);
      if (r.ok) { data[sys] = Object.assign(item, { stats: stats(gj), shared: true }); try { await idbDo('readwrite', st => st.delete(sys)); } catch (e) { /* */ } return { shared: true }; }
      if (r.status !== 404 && r.status !== 405) {
        const e = r.data && r.data.error;
        if (e && e.code === 'bad_pin') throw new Error('Xodim kodi notoʻgʻri (Sozlamalar).');
      }
    }
    try { await idbDo('readwrite', st => st.put(item, sys)); } catch (e) { /* xotira yopiq */ }
    data[sys] = Object.assign(item, { stats: stats(gj), shared: false });
    return { shared: false, reason: !pin ? 'xodim kodi kiritilmagan' : 'server bu funksiyani hali qoʻllamaydi (Worker’ni yangilang)' };
  }
  async function remove(sys) {
    const d = data[sys];
    if (d && d.shared) {
      const r = await NX.fetchJSON(base() + '/layers/' + sys, { method: 'DELETE', headers: { 'X-Staff-Code': NX.fixes.pin() } }, 30000);
      if (!r.ok) throw new Error('Oʻchirib boʻlmadi: ' + ((r.data && r.data.error && r.data.error.message) || 'HTTP ' + r.status));
    }
    try { await idbDo('readwrite', st => st.delete(sys)); } catch (e) { /* */ }
    delete data[sys];
  }

  NX.systems = { KEYS, parse, stats, inArea, nearest, load, save, remove, get: sys => data[sys] || null, loaded: () => KEYS.filter(k => data[k]) };
})();
