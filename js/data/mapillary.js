/* City Jam — Mapillary: ochiq koʻcha suratlari va ulardan avtomatik topilgan obyektlar
   (svetofor, zebra, “piyoda oʻtish” belgisi). Muammoni joyidagi real surat bilan tekshirish uchun.
   Maʼlumot: graph.mapillary.com (CC BY-SA), client token keys.js da. */
(function () {
  'use strict';
  const NX = window.NX;
  const API = 'https://graph.mapillary.com';
  const DAY = 86400e3;
  const token = () => (NX.store.get('key:mapillary', '') || (window.CITYJAM_KEYS && window.CITYJAM_KEYS.mapillary) || '').trim();

  const isSignal = v => /^object--traffic-light/.test(v);
  const isCrossing = v => /crosswalk|pedestrians-crossing/.test(v);

  function bbox(lat, lon, r) {
    const dl = r / 110574, dn = r / (111320 * Math.cos((lat * Math.PI) / 180));
    return [lon - dn, lat - dl, lon + dn, lat + dl].map(v => v.toFixed(6)).join(',');
  }
  const dist = (lat, lon, c) => NX.geo.d(...NX.geo.xy(lat, lon), ...NX.geo.xy(c[1], c[0]));

  async function get(path, params) {
    const q = new URLSearchParams(Object.assign({ access_token: token() }, params));
    const r = await NX.fetchJSON(`${API}/${path}?${q}`, {}, 20000);
    if (!r.ok) {
      const m = (r.data && r.data.error && r.data.error.message) || 'HTTP ' + r.status;
      throw new Error(r.status === 401 || r.status === 403 ? 'Mapillary kaliti ishlamadi.' : 'Mapillary: ' + m);
    }
    return (r.data && r.data.data) || [];
  }

  // Yaqin atrofdagi suratlar — eng yaqini (yangi suratlar ustun)
  async function photos(lat, lon, r) {
    const list = await get('images', { bbox: bbox(lat, lon, r), limit: 50, fields: 'id,captured_at,thumb_1024_url,computed_geometry,geometry,compass_angle' });
    return list.map(x => {
      const g = (x.computed_geometry || x.geometry || {}).coordinates;
      return g ? { id: x.id, url: x.thumb_1024_url, date: x.captured_at, d: dist(lat, lon, g) } : null;
    }).filter(x => x && x.url).sort((a, b) => (a.d - b.d) - (b.date - a.date) / (365 * DAY) * 20);
  }
  async function features(lat, lon, r) {
    const list = await get('map_features', { bbox: bbox(lat, lon, r), limit: 500, fields: 'id,object_value,geometry,last_seen_at' });
    return list.map(x => ({ id: x.id, v: x.object_value, seen: x.last_seen_at, d: x.geometry ? dist(lat, lon, x.geometry.coordinates) : Infinity }));
  }

  const link = id => `https://www.mapillary.com/app/?pKey=${encodeURIComponent(id)}&focus=photo`;
  const MON = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  const when = t => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-yil ${MON[d.getMonth()]}`; };

  // Muammo turi boʻyicha nima izlanadi
  const RULE = {
    junction: { r: 45, want: 'signal', yes: 'Suratlarda svetofor bor', no: 'Suratlarda svetofor koʻrinmadi' },
    school: { r: 150, want: 'crossing', yes: 'Yaqinida piyoda oʻtish joyi yoki svetofor bor', no: 'Yaqinida zebra ham, svetofor ham koʻrinmadi' },
    crossings: { r: 150, want: 'crossing', count: true },
  };

  async function check(p) {
    const ck = 'mly:' + p.key, hit = NX.store.get(ck, null);
    if (hit && Date.now() - hit.ts < DAY) return hit;
    const rule = RULE[p.type];
    const [ph, ft] = await Promise.all([photos(p.lat, p.lon, rule ? Math.min(rule.r, 80) : 80), rule ? features(p.lat, p.lon, rule.r) : Promise.resolve([])]);
    const sig = ft.filter(f => isSignal(f.v)), cro = ft.filter(f => isCrossing(f.v));
    const photo = ph[0] ? { id: ph[0].id, url: ph[0].url, date: ph[0].date, when: when(ph[0].date), d: Math.round(ph[0].d), link: link(ph[0].id) } : null;
    const res = { ts: Date.now(), photo, photos: ph.length, signals: sig.length, crossings: cro.length, status: 'info', text: '' };
    const near = a => (a.length ? Math.round(Math.min(...a.map(f => f.d))) : null);
    if (rule && rule.count) {
      res.text = cro.length ? `Atrofda (150 m) suratlarda ${cro.length} ta piyoda oʻtish joyi topildi.` : ph.length ? 'Atrofdagi suratlarda piyoda oʻtish joyi koʻrinmadi.' : 'Bu joyda Mapillary surati yoʻq.';
      res.status = ph.length || cro.length ? (cro.length ? 'info' : 'bad') : 'unknown';
    } else if (rule) {
      const found = rule.want === 'signal' ? sig : cro.concat(p.type === 'school' ? sig : []);
      if (found.length) { res.status = 'ok'; res.text = `${rule.yes} (${near(found)} m da). Xaritani tuzatish kerak boʻlishi mumkin.`; }
      else if (ph.length) { res.status = 'bad'; res.text = `${rule.no} — muammo tasdiqlanmoqda.`; }
      else { res.status = 'unknown'; res.text = 'Bu joyda Mapillary surati yoʻq — tekshirib boʻlmadi.'; }
    } else {
      res.status = photo ? 'info' : 'unknown';
      res.text = photo ? 'Joyning real surati.' : 'Bu joyda Mapillary surati yoʻq.';
    }
    NX.store.set(ck, res);
    return res;
  }

  NX.mly = { token, available: () => !!token(), check, photos, features, link };
})();
