/* City Jam — “hozir bu yerda tirbandlik” xabarlari: real kuzatuv (odamlardan) va undan statistika. */
(function () {
  'use strict';
  const NX = window.NX;
  const CACHE = 'reports:v1', MINE = 'reports:mine';
  const LEVEL = { 1: { uz: 'Sekin', icon: '🟨', color: '#f59e0b' }, 2: { uz: 'Tirband', icon: '🟥', color: '#dc2626' }, 3: { uz: 'Toʻxtab qolgan', icon: '⛔', color: '#7f1d1d' } };
  const base = () => ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim().replace(/\/+$/, '');
  let items = NX.store.get(CACHE, []);
  let ok = null;

  async function load() {
    if (!base()) { ok = false; return items; }
    try {
      const r = await NX.fetchJSON(base() + '/reports', {}, 10000);
      if (r.ok && r.data && Array.isArray(r.data.items)) { items = r.data.items; NX.store.set(CACHE, items.slice(-5000)); ok = true; } else ok = false;
    } catch (e) { ok = false; }
    return items;
  }

  async function send(street, level, lat, lon) {
    if (!base()) throw new Error('Xabar serveri ulanmagan.');
    const body = { lat, lon, level, street: street ? street.key : '', name: street ? street.name : '' };
    const r = await NX.fetchJSON(base() + '/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
    if (!r.ok) throw new Error(r.status === 429 ? 'Bir soatda juda koʻp xabar yubordingiz.' : r.status === 501 ? 'Xabar ombori hali ulanmagan.' : 'Xabar yuborilmadi (' + r.status + ').');
    items = items.concat([r.data.item]);
    NX.store.set(CACHE, items.slice(-5000));
    const mine = NX.store.get(MINE, []); mine.push(r.data.item.id); NX.store.set(MINE, mine.slice(-200));
    return r.data.item;
  }

  // Soʻnggi daqiqalardagi xabarlar, joy boʻyicha guruhlangan (150 m)
  function recent(minutes = 60) {
    const t = Date.now() - minutes * 60e3, out = [];
    items.filter(x => x.ts > t).sort((a, b) => b.ts - a.ts).forEach(x => {
      const [px, py] = NX.geo.xy(x.lat, x.lon);
      const g = out.find(o => (x.street && o.street === x.street) || Math.hypot(o.x - px, o.y - py) < 150);
      if (g) { g.n++; g.level = Math.max(g.level, x.level); return; }
      out.push({ street: x.street, name: x.name, lat: x.lat, lon: x.lon, x: px, y: py, level: x.level, n: 1, ts: x.ts });
    });
    return out.sort((a, b) => b.level - a.level || b.n - a.n);
  }

  // Koʻchalar boʻyicha: necha marta xabar qilingan, eng koʻp qaysi soatda
  function byStreet(days = 30) {
    const t = Date.now() - days * 86400e3, m = new Map();
    items.filter(x => x.ts > t && x.street).forEach(x => {
      let g = m.get(x.street);
      if (!g) m.set(x.street, (g = { street: x.street, name: x.name, n: 0, hours: new Array(24).fill(0), days: new Set(), last: 0 }));
      g.n++; g.hours[new Date(x.ts).getHours()]++; g.days.add(new Date(x.ts).toDateString()); g.last = Math.max(g.last, x.ts);
    });
    return [...m.values()].map(g => Object.assign(g, { peak: g.hours.indexOf(Math.max(...g.hours)), dayCount: g.days.size })).sort((a, b) => b.n - a.n);
  }
  function hours(streetKey, days = 30) {
    const t = Date.now() - days * 86400e3, h = new Array(24).fill(0);
    items.filter(x => x.ts > t && (!streetKey || x.street === streetKey)).forEach(x => { h[new Date(x.ts).getHours()]++; });
    return h;
  }
  const total = (days = 30) => items.filter(x => x.ts > Date.now() - days * 86400e3).length;

  NX.reports = { LEVEL, load, send, recent, byStreet, hours, total, status: () => ok, hasServer: () => !!base() };
})();
