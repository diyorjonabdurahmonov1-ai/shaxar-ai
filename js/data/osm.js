/* City Jam — OpenStreetMap maʼlumotlarini Overpass API orqali yuklash */
(function () {
  'use strict';
  const NX = window.NX;
  const cfg = NX.config;
  const CACHE_KEY = 'osm:v2';
  const HW_RE = 'trunk|primary|secondary|tertiary|unclassified|residential|living_street';
  const WAY_TAGS = ['highway', 'name', 'name:uz', 'name:ru', 'name:en', 'oneway', 'junction', 'lanes', 'lanes:forward', 'lanes:backward', 'maxspeed'];

  const bb = b => `${b.s},${b.w},${b.n},${b.e}`;

  function qStreets() {
    const a = bb(cfg.bbox), s = bb(cfg.stopBbox);
    return `[out:json][timeout:60];
way["highway"~"^(${HW_RE})$"](${a});
out body geom;
(
  node["highway"="bus_stop"](${s});
  node["public_transport"="platform"]["bus"="yes"](${s});
  node["public_transport"="stop_position"]["bus"="yes"](${s});
  node["highway"="traffic_signals"](${a});
  node["highway"="crossing"](${a});
  node["highway"~"^(give_way|stop)$"](${a});
  nwr["amenity"="school"](${a});
  nwr["amenity"="kindergarten"](${a});
);
out center tags;`;
  }

  function qRoutes() {
    const a = bb(cfg.bbox);
    return `[out:json][timeout:90];
relation["type"="route"]["route"~"^(bus|minibus|trolleybus|share_taxi)$"](${a});
out body geom(${a});`;
  }

  // Bir nechta oynaga (mirror) parallel soʻrov — birinchi toʻgʻri javob olinadi
  async function raceMirrors(q, validate) {
    const outer = new AbortController();
    const body = 'data=' + encodeURIComponent(q);
    const tries = cfg.overpassMirrors.map(async url => {
      const r = await NX.fetchJSON(url, {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      }, cfg.overpassTimeoutMs, outer.signal);
      if (!r.ok) throw new Error(`${host(url)}: HTTP ${r.status}`);
      if (!r.data || !Array.isArray(r.data.elements)) throw new Error(`${host(url)}: notoʻgʻri javob`);
      if (r.data.remark && /runtime error|timed out|out of memory/i.test(r.data.remark)) throw new Error(`${host(url)}: ${r.data.remark}`);
      if (validate && !validate(r.data)) throw new Error(`${host(url)}: boʻsh javob`);
      return { json: r.data, mirror: url };
    });
    try {
      const w = await Promise.any(tries);
      outer.abort();
      return w;
    } catch (e) {
      const err = new Error('Overpass serverlarining hech biri javob bermadi.');
      err.details = (e.errors || []).map(x => x.message);
      throw err;
    }
  }

  async function query(q, validate) {
    let last;
    for (let round = 0; round < cfg.overpassRounds; round++) {
      try { return await raceMirrors(q, validate); } catch (e) {
        last = e;
        if (round < cfg.overpassRounds - 1) await NX.sleep(2500 * (round + 1));
      }
    }
    throw last;
  }

  const host = u => { try { return new URL(u).host; } catch (e) { return u; } };
  const r6 = v => Math.round(v * 1e6) / 1e6;

  function pick(tags, keys) {
    const o = {};
    for (const k of keys) if (tags[k] != null) o[k] = tags[k];
    return o;
  }

  // Overpass javobini ixcham shaklga keltirish (kesh hajmi kichik boʻlishi uchun)
  function compactStreets(json) {
    const ways = [], pts = [];
    for (const el of json.elements) {
      const t = el.tags || {};
      if (el.type === 'way' && el.geometry && t.highway && NX.HW[t.highway]) {
        const g = [], n = [];
        el.geometry.forEach((p, i) => {
          if (!p || p.lat == null) return;
          g.push(r6(p.lat), r6(p.lon));
          n.push(el.nodes ? el.nodes[i] : -(el.id * 1000 + i));
        });
        if (n.length >= 2) ways.push({ id: el.id, t: pick(t, WAY_TAGS), n, g });
        continue;
      }
      const lat = el.lat != null ? el.lat : el.center && el.center.lat;
      const lon = el.lon != null ? el.lon : el.center && el.center.lon;
      if (lat == null) continue;
      const base = { id: el.id, lat: r6(lat), lon: r6(lon), name: t['name:uz'] || t.name || '' };
      if (t.amenity === 'school') pts.push(Object.assign({ k: 'school' }, base));
      else if (t.amenity === 'kindergarten') pts.push(Object.assign({ k: 'kindergarten' }, base));
      if (t.highway === 'traffic_signals') pts.push(Object.assign({ k: 'signal' }, base));
      if (t.highway === 'crossing' || (t.highway === 'traffic_signals' && t.crossing)) pts.push(Object.assign({ k: 'crossing', sig: t.crossing === 'traffic_signals' || t.highway === 'traffic_signals' ? 1 : 0 }, base));
      if (t.highway === 'crossing' && t.crossing === 'traffic_signals') pts.push(Object.assign({ k: 'signal' }, base));
      if (t.highway === 'give_way' || t.highway === 'stop') pts.push(Object.assign({ k: 'priority', sign: t.highway }, base));
      if (t.highway === 'bus_stop' || (t.public_transport === 'platform' && t.bus === 'yes')) pts.push(Object.assign({ k: 'stop', p: 1 }, base));
      else if (t.public_transport === 'stop_position' && t.bus === 'yes') pts.push(Object.assign({ k: 'stop', p: 0 }, base));
    }
    return { ways, pts };
  }

  function compactRoutes(json) {
    const out = [];
    for (const el of json.elements) {
      if (el.type !== 'relation') continue;
      const t = el.tags || {};
      const segs = [], stops = [], wayIds = [];
      for (const m of el.members || []) {
        const role = m.role || '';
        if (m.type === 'way') {
          if (/platform/.test(role)) continue;
          wayIds.push(m.ref);
          if (!m.geometry) continue;
          let cur = [];
          for (const p of m.geometry) {
            if (!p || p.lat == null) { if (cur.length >= 4) segs.push(cur); cur = []; continue; }
            cur.push(r6(p.lat), r6(p.lon));
          }
          if (cur.length >= 4) segs.push(cur);
        } else if (m.type === 'node' && /^(stop|platform)/.test(role) && m.lat != null) {
          stops.push({ id: m.ref, lat: r6(m.lat), lon: r6(m.lon) });
        }
      }
      if (!segs.length && !stops.length) continue;
      out.push({
        id: el.id, ref: t.ref || '', name: t['name:uz'] || t.name || '', from: t.from || '', to: t.to || '',
        mode: t.route, op: t.operator || '', segs, stops, wayIds,
      });
    }
    return out;
  }

  // Asosiy yuklovchi: avval kesh, eskirgan boʻlsa — tarmoq; tarmoq ishlamasa — eski kesh
  async function load({ force = false, onStep } = {}) {
    const cache = NX.store.get(CACHE_KEY, null);
    const valid = cache && cache.v === 1 && Array.isArray(cache.ways) && cache.ways.length;
    if (valid && !force && Date.now() - cache.ts < cfg.osmCacheMaxAgeMs) return { data: cache, source: 'cache' };

    onStep && onStep('Koʻchalar, bekatlar va avtobus yoʻnalishlari Overpass serverlaridan soʻralmoqda…');
    const [sr, rr] = await Promise.allSettled([
      query(qStreets(), d => d.elements.some(e => e.type === 'way')),
      query(qRoutes()),
    ]);
    if (sr.status === 'rejected') {
      if (valid) return { data: cache, source: 'stale', warning: 'Overpass javob bermadi — keshdagi maʼlumot (' + NX.fmt.time(cache.ts) + ') koʻrsatilmoqda.' };
      throw sr.reason;
    }
    onStep && onStep('Maʼlumot qayta ishlanmoqda…');
    const s = compactStreets(sr.value.json);
    let routes, warning = null, routesTs = Date.now();
    if (rr.status === 'fulfilled') routes = compactRoutes(rr.value.json);
    else if (valid) { routes = cache.routes; routesTs = cache.routesTs; warning = 'Avtobus yoʻnalishlari yangilanmadi — keshdagisi ishlatildi.'; }
    else { routes = []; warning = 'Avtobus yoʻnalishlari yuklanmadi. “Yangilash” tugmasi bilan qayta urinib koʻring.'; }

    const data = { v: 1, ts: Date.now(), mirror: host(sr.value.mirror), ways: s.ways, pts: s.pts, routes, routesTs };
    if (!NX.store.set(CACHE_KEY, data)) warning = (warning ? warning + ' ' : '') + 'Brauzer xotirasi yetmadi — oflayn kesh saqlanmadi.';
    return { data, source: 'network', warning };
  }

  NX.osm = { load, qStreets, qRoutes, clearCache: () => NX.store.del(CACHE_KEY), _compactStreets: compactStreets, _compactRoutes: compactRoutes };
})();
