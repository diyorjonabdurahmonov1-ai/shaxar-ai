/* City Jam — favqulodda vaziyatlar: zilzila xavf zonalari, yigʻilish joylari, evakuatsiya yoʻllari, suv toshqinida baland joylar.
   Hammasi TAXMINIY: OSM binolari (qavat, turi), SRTM relyefi, OSM koʻchalari va ochiq joylari asosida.
   Bino materiali va qurilgan yili maʼlumoti yoʻq — zaiflik sinfi qavat va turiga qarab olinadi. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;

  // EMS-98 ga yaqin: zaiflik sinfi → shu ballda ogʻir shikastlanadigan (4–5 daraja) binolar ulushi
  // A — paxsa/guvala, xom gʻisht, eski past uylar; B — oddiy gʻisht (seysmik kamarsiz); C — panel/temirbeton; D — seysmik loyihalangan
  const HEAVY = { A: [0.01, 0.08, 0.3, 0.6, 0.85], B: [0, 0.03, 0.15, 0.35, 0.65], C: [0, 0.01, 0.05, 0.15, 0.4], D: [0, 0, 0.01, 0.05, 0.15] };
  const heavy = (cls, I) => HEAVY[cls][Math.max(0, Math.min(4, Math.round(I) - 6))];
  const RESID = /^(house|detached|residential|apartments|yes|terrace|semidetached_house|dormitory)$/;
  const CRIT = /school|kindergarten|hospital|clinic/;
  const KIND_UZ = { school: 'maktab', kindergarten: 'bogʻcha', hospital: 'shifoxona', clinic: 'poliklinika' };
  function vclass(b) {
    if (/mosque|religious|church|temple|ruins/.test(b.kind)) return 'A';
    if (CRIT.test(b.kind)) return 'B';
    if (b.levels <= 2) return RESID.test(b.kind) ? 'A' : 'B';
    if (b.levels <= 4) return 'B';
    return 'C';
  }
  // Tunda uyda boʻlganlar: turar joy maydoni × 0.8 / 25 m² kishiga
  const people = b => (RESID.test(b.kind) ? (b.area * b.levels * 0.8) / 25 : 0);

  // Magnituda berilsa — epitsentr yaqinidagi ball (MSK-64, ~10 km chuqurlik, taxminiy)
  function intensity(text) {
    const n = String(text || '').toLowerCase();
    const m = n.match(/(\d+(?:[.,]\d)?)\s*(?:-?\s*)?(ball|bal\b|balli|magnitud|richter|rixter)/);
    if (!m) return { I: 8, given: false };
    const v = parseFloat(m[1].replace(',', '.'));
    if (/magnitud|richter|rixter/.test(m[2])) return { I: Math.max(6, Math.min(10, Math.round(1.5 * v - 0.5))), given: true, mag: v };
    return { I: Math.max(6, Math.min(10, Math.round(v))), given: true };
  }

  // ---------- Ochiq joylar (yigʻilish joylari) va mahalla nomlari — OSM ----------
  const polyArea = ring => { const p = ring.map(c => G.xy(c[0], c[1])); let A = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) A += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return Math.abs(A / 2); };
  const OS_KIND = { park: 'park', garden: 'bogʻ', pitch: 'sport maydoni', stadium: 'stadion', recreation_ground: 'dam olish maydoni', playground: 'bolalar maydonchasi', square: 'maydon', grass: 'maysazor', meadow: 'ochiq maydon', pedestrian: 'piyodalar maydoni' };
  let osCache = null;
  async function openSpaces() {
    if (osCache) return osCache;
    const hit = await NX.bigStore.get('open:v1');
    if (hit && hit.spaces && Date.now() - hit.ts < 30 * 86400e3) return (osCache = hit);
    const C = NX.twin.CITY, bb = `${C.s},${C.w},${C.n},${C.e}`;
    const q = `[out:json][timeout:60];(way["leisure"~"^(park|garden|pitch|stadium|recreation_ground|playground)$"](${bb});way["landuse"~"^(grass|recreation_ground|meadow)$"](${bb});way["place"="square"](${bb});way["highway"="pedestrian"]["area"="yes"](${bb});node["place"~"^(neighbourhood|quarter|suburb)$"](${bb}););out tags geom qt;`;
    for (const url of NX.config.overpassMirrors) {
      try {
        const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 60000);
        if (!r.ok || !r.data || !r.data.elements) continue;
        const spaces = [], places = [];
        r.data.elements.forEach(e => {
          const t = e.tags || {}, name = t['name:uz'] || t.name || '';
          if (e.type === 'node') { if (name) places.push({ name, c: [e.lat, e.lon] }); return; }
          if (!e.geometry || e.geometry.length < 4) return;
          const ring = e.geometry.map(g => [g.lat, g.lon]), area = polyArea(ring);
          if (area < 1500) return;
          const kind = t.leisure || t.landuse || t.place || t.highway;
          spaces.push({ name, kind: OS_KIND[kind] || 'ochiq joy', area: Math.round(area), c: [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length] });
        });
        osCache = { ts: Date.now(), spaces, places };
        NX.bigStore.set('open:v1', osCache);
        return osCache;
      } catch (e) { /* keyingi server */ }
    }
    throw new Error('Ochiq joylar yuklanmadi');
  }

  // ---------- Yordamchi: tarmoq tugunlari va nomlar boʻyicha tez qidiruv ----------
  function index(net) {
    if (net._hz) return net._hz;
    const g = new Map(), ng = new Map(), k = (x, y) => Math.floor(x / 100) + ':' + Math.floor(y / 100);
    net.nodes.forEach((n, i) => { n.ix = i; if (!n.nb.length) return; const kk = k(n.x, n.y); (g.get(kk) || g.set(kk, []).get(kk)).push(n); });
    net.segs.forEach(sg => { if (!sg.name) return; const x = (sg.a.x + sg.b.x) / 2, y = (sg.a.y + sg.b.y) / 2, kk = k(x, y); (ng.get(kk) || ng.set(kk, []).get(kk)).push({ x, y, name: sg.name, w: sg.w }); });
    const near = (grid, x, y, maxM, ok) => { let best = null, bd = maxM; const r = Math.ceil(maxM / 100); for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) (grid.get((Math.floor(x / 100) + di) + ':' + (Math.floor(y / 100) + dj)) || []).forEach(p => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd && (!ok || ok(p))) { bd = d; best = p; } }); return best; };
    net._hz = { node: (lat, lon, maxM, ok) => { const [x, y] = G.xy(lat, lon); return near(g, x, y, maxM || 400, ok); }, street: (lat, lon, maxM) => { const [x, y] = G.xy(lat, lon), p = near(ng, x, y, maxM || 300); return p ? p.name : ''; } };
    return net._hz;
  }
  function bgrid(list, cell) {
    const g = new Map();
    list.forEach(b => { const [x, y] = G.xy(b.c[0], b.c[1]), k = Math.floor(x / cell) + ':' + Math.floor(y / cell); (g.get(k) || g.set(k, []).get(k)).push({ b, x, y }); });
    return (x, y, r, fn) => { const s = Math.ceil(r / cell); for (let di = -s; di <= s; di++) for (let dj = -s; dj <= s; dj++) (g.get((Math.floor(x / cell) + di) + ':' + (Math.floor(y / cell) + dj)) || []).forEach(p => { if (Math.hypot(p.x - x, p.y - y) <= r) fn(p.b); }); };
  }
  const placeName = (places, c, maxM) => { let best = null, bd = maxM || 900; const [x, y] = G.xy(c[0], c[1]); (places || []).forEach(p => { const [px, py] = G.xy(p.c[0], p.c[1]), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = p; } }); return best ? best.name : ''; };

  // Dijkstra: src tugundan, “stop” shartiga mos birinchi tugungacha (yoki maxM gacha); cost(sg) — 1 m narxi
  function search(net, src, cost, stop, maxM) {
    const N = net.nodes.length, dist = new Float64Array(N).fill(Infinity), len = new Float64Array(N), prev = new Int32Array(N).fill(-1), pseg = new Array(N), done = new Uint8Array(N);
    const H = [], push = (d, i) => { H.push([d, i]); let c = H.length - 1; while (c) { const p = (c - 1) >> 1; if (H[p][0] <= H[c][0]) break; [H[p], H[c]] = [H[c], H[p]]; c = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === c) break; [H[m], H[c]] = [H[c], H[m]]; c = m; } } return top; };
    dist[src.ix] = 0; push(0, src.ix);
    const seen = [];
    while (H.length) {
      const [d, i] = pop();
      if (done[i]) continue; done[i] = 1;
      const n = net.nodes[i];
      seen.push(i);
      if (stop(n, len[i])) return path(net, i, prev, pseg, len, seen);
      if (len[i] > maxM) continue;
      n.nb.forEach(({ n: m, sg }) => { const nd = d + sg.len * cost(sg); if (nd < dist[m.ix]) { dist[m.ix] = nd; len[m.ix] = len[i] + sg.len; prev[m.ix] = i; pseg[m.ix] = sg; push(nd, m.ix); } });
    }
    return { end: null, seen, len };
  }
  function path(net, i, prev, pseg, len, seen) {
    const pts = [], names = [];
    let k = i;
    while (k >= 0) { const n = net.nodes[k]; pts.push([n.lat, n.lon]); const sg = pseg[k]; if (sg && sg.name && names[names.length - 1] !== sg.name) names.push(sg.name); k = prev[k]; }
    pts.reverse(); names.reverse();
    // Xarita uchun ixchamlashtirish (≤ 160 nuqta)
    const st = Math.max(1, Math.ceil(pts.length / 160));
    return { end: net.nodes[i], path: pts.filter((p, j) => j % st === 0 || j === pts.length - 1), len: Math.round(len[i]), streets: [...new Set(names)].slice(0, 6), seen, lenArr: len };
  }
  const walkMin = m => Math.max(1, Math.round(m / 67));     // ~4 km/soat (keksalar, bolalar bilan)

  // ---------- Zilzila ----------
  // Shahar 300 m kataklarga boʻlinadi; har katakda: ogʻir shikastlanishi mumkin binolar va ulardagi odamlar (taxminiy)
  function quakeZones(blds, I, places, net) {
    const cell = 300, cells = new Map();
    blds.forEach(b => {
      const [x, y] = G.xy(b.c[0], b.c[1]), k = Math.floor(x / cell) + ':' + Math.floor(y / cell);
      let c = cells.get(k);
      if (!c) { c = { i: Math.floor(x / cell), j: Math.floor(y / cell), n: 0, A: 0, B: 0, C: 0, ppl: 0, hp: 0, hb: 0, foot: 0, tall: 0, crit: [] }; cells.set(k, c); }
      const cls = vclass(b), h = heavy(cls, I), p = people(b);
      c.n++; c[cls]++; c.ppl += p; c.hp += p * h; c.hb += h; c.foot += b.area;
      if (b.levels >= 5) c.tall++;
      if (CRIT.test(b.kind)) { c.crit.push(b.name || KIND_UZ[b.kind] || b.kind); c.hp += 150 * h; }
    });
    const list = [...cells.values()].filter(c => c.n >= 5).map(c => {
      const cover = c.foot / (cell * cell);
      // Zich qurilgan joyda tor koʻchalar vayronalar bilan toʻsiladi — qutqaruv qiyinlashadi
      c.score = c.hp * (1 + cover);
      c.cover = cover;
      const x0 = c.i * cell, y0 = c.j * cell, ll = (x, y) => G.ll(x, y);
      c.ring = [[x0, y0], [x0 + cell, y0], [x0 + cell, y0 + cell], [x0, y0 + cell], [x0, y0]].map(q => ll(q[0], q[1]));
      c.c = ll(x0 + cell / 2, y0 + cell / 2);
      return c;
    }).sort((a, b) => b.score - a.score);
    // Bir-biridan ≥ 600 m — shahar boʻylab tarqalgan eng xavfli 6 joy
    const top = [];
    list.forEach(c => { if (top.length < 6 && top.every(t => Math.hypot((t.i - c.i) * cell, (t.j - c.j) * cell) >= 600)) top.push(c); });
    const hz = net ? index(net) : null;
    top.forEach((c, i) => { c.id = 'Z' + (i + 1); c.name = placeName(places, c.c) || (hz && hz.street(c.c[0], c.c[1], 400)) || ''; });
    const tot = list.reduce((t, c) => ({ hb: t.hb + c.hb, hp: t.hp + c.hp, ppl: t.ppl + c.ppl, n: t.n + c.n, A: t.A + c.A }), { hb: 0, hp: 0, ppl: 0, n: 0, A: 0 });
    return { top, tot, I };
  }

  // Yigʻilish joylari: ochiq joylar (≥ 3 000 m²); boʻlmasa — keng koʻchalar (baland binolardan uzoq)
  function shelters(os, net, tallNear) {
    const hz = index(net), out = [];
    (os.spaces || []).filter(s => s.area >= 3000).forEach(s => { const n = hz.node(s.c[0], s.c[1], 300); if (n) out.push({ name: s.name || OS_KIND_CAP(s.kind), kind: s.kind, area: s.area, cap: Math.round(s.area / 2), c: s.c, node: n }); });
    if (out.length < 3) {
      // Zaxira: magistral koʻchalar tugunlari, 60 m ichida 5+ qavatli bino yoʻq, bir-biridan ≥ 700 m
      net.nodes.forEach(n => {
        if (!n.nb.some(q => q.sg.w >= 16) || tallNear(n.x, n.y, 60)) return;
        if (out.some(o => Math.hypot(o.node.x - n.x, o.node.y - n.y) < 700)) return;
        const nm = (n.nb.find(q => q.sg.name) || { sg: {} }).sg.name || 'keng koʻcha';
        out.push({ name: nm, kind: 'keng koʻcha (ochiq joy topilmadi)', area: 0, cap: 0, c: [n.lat, n.lon], node: n });
      });
    }
    return out;
  }
  const OS_KIND_CAP = k => (k ? k[0].toUpperCase() + k.slice(1) : 'Ochiq joy');

  // Zilzilada xavfsiz yoʻl: keng koʻchalar afzal; 5+ qavatli binolar yonidan va tor koʻchalardan qochiladi (vayronalar)
  function quakeCost(net, tallNear) {
    net.segs.forEach(sg => {
      const x = (sg.a.x + sg.b.x) / 2, y = (sg.a.y + sg.b.y) / 2, t = tallNear(x, y, 40);
      const wf = sg.w >= 16 ? 0.85 : sg.w >= 12 ? 0.95 : sg.w <= 6 ? 1.8 : 1.3;
      sg.cq = wf * (1 + Math.min(3, 0.6 * t));
      sg.tq = t;
    });
    return sg => sg.cq;
  }

  function quake(o) {
    const { net, blds, os, I } = o;
    const tallG = bgrid(blds.filter(b => b.levels >= 5), 60);
    const tallNear = (x, y, r) => { let n = 0; tallG(x, y, r, () => { n++; }); return n; };
    const Z = quakeZones(blds, I, os.places, net), hz = index(net);
    const SH = shelters(os, net, tallNear);
    // Avval haqiqiy ochiq joylar (park, maydon) — 2.5 km ichida boʻlmasa, keng koʻchalar
    const real = new Map(SH.filter(s => s.area).map(s => [s.node.ix, s])), any = new Map(SH.map(s => [s.node.ix, s]));
    const cost = quakeCost(net, tallNear);
    const origins = Z.top.map(z => ({ id: z.id, name: z.name, c: z.c, ppl: z.ppl })).concat(o.extraOrigins || []);
    const routes = [];
    origins.forEach((z, i) => {
      const src = hz.node(z.c[0], z.c[1], 400);
      if (!src) return;
      let r = real.size ? search(net, src, cost, n => real.has(n.ix), 2500) : { end: null };
      if (!r.end) r = search(net, src, cost, n => any.has(n.ix), 6000);
      if (!r.end) return;
      const sh = any.get(r.end.ix);
      routes.push({ id: 'R' + (i + 1), from: z.id, fromName: z.name, sh, path: r.path, len: r.len, min: walkMin(r.len), streets: r.streets, ppl: Math.round(z.ppl || 0) });
    });
    // Har bir yigʻilish joyiga yoʻnaltirilgan odamlar — sigʻimi bilan solishtiriladi
    const load = new Map(); routes.forEach(r => load.set(r.sh, (load.get(r.sh) || 0) + r.ppl));
    const usedSh = [...load.keys()].map((s, i) => Object.assign(s, { id: 'S' + (i + 1), assigned: Math.round(load.get(s)) }));
    return { kind: 'quake', I, zones: Z.top, tot: Z.tot, shelters: usedSh, allShelters: SH.length, routes };
  }

  // ---------- Suv toshqini: suv bosgan koʻchalardan eng yaqin quruq va baland joyga ----------
  // wet: [{ lat, lon, d }] — suv chuqurligi (m) koʻcha boʻlaklarida
  function flood(o) {
    const { net, blds, os, wet } = o, hz = index(net);
    const wg = new Map(), k = (x, y) => Math.floor(x / 50) + ':' + Math.floor(y / 50);
    wet.forEach(w => { const [x, y] = G.xy(w.lat, w.lon), kk = k(x, y); (wg.get(kk) || wg.set(kk, []).get(kk)).push({ x, y, d: w.d }); });
    const depthAt = (x, y, r) => { let m = 0; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) (wg.get((Math.floor(x / 50) + di) + ':' + (Math.floor(y / 50) + dj)) || []).forEach(p => { if (p.d > m && Math.hypot(p.x - x, p.y - y) <= r) m = p.d; }); return m; };
    net.segs.forEach(sg => { sg.dw = depthAt((sg.a.x + sg.b.x) / 2, (sg.a.y + sg.b.y) / 2, 35); });
    const dry = n => n.nb.every(q => q.sg.dw < 0.1);
    // Suvli koʻchadan oʻtish: 10 sm — sekin, 30 sm+ — deyarli yopiq (piyoda va mashina uchun xavfli)
    const cost = sg => (sg.dw >= 0.3 ? 40 : sg.dw >= 0.1 ? 5 : 1) * (sg.w <= 6 ? 1.2 : 1);
    const pub = bgrid(blds.filter(b => b.levels >= 3 && /school|university|hospital|government|public|office|apartments/.test(b.kind)), 80);
    const spaces = (os.spaces || []).filter(s => s.area >= 1500);
    const label = n => {
      let best = null, bd = 250;
      spaces.forEach(s => { const [x, y] = G.xy(s.c[0], s.c[1]), d = Math.hypot(x - n.x, y - n.y); if (d < bd) { bd = d; best = { name: s.name || OS_KIND_CAP(s.kind), how: s.kind + (s.area ? `, ${Math.round(s.area)} m²` : '') }; } });
      if (best) return best;
      let b0 = null, d0 = 200; pub(n.x, n.y, 200, b => { const [x, y] = G.xy(b.c[0], b.c[1]), d = Math.hypot(x - n.x, y - n.y); if (d < d0) { d0 = d; b0 = b; } });
      if (b0) return { name: b0.name || ({ school: 'Maktab', university: 'Oliy taʼlim binosi', hospital: 'Shifoxona', apartments: 'Koʻp qavatli uy' })[b0.kind] || 'Jamoat binosi', how: `${b0.levels} qavatli bino — yuqori qavatlarga chiqish mumkin` };
      return { name: hz.street(n.lat, n.lon, 200) || 'Baland joy', how: 'koʻcha' };
    };
    // Boshlanish nuqtalari: eng chuqur suv toʻplangan koʻchalar (bir-biridan ≥ 400 m)
    const origins = [];
    (o.streets || []).forEach(s => { if (!s.at || origins.length >= 6) return; const [x, y] = G.xy(s.at[0], s.at[1]); if (origins.every(q => Math.hypot(q.x - x, q.y - y) >= 400)) origins.push({ name: s.name, c: s.at, d: s.max, x, y }); });
    (o.extraOrigins || []).forEach(e => origins.push(e));
    const routes = [], targets = new Map();
    origins.forEach((z, i) => {
      const src = hz.node(z.c[0], z.c[1], 300);
      if (!src) return;
      const z0 = src.z;
      let best = null;
      const r = search(net, src, cost, (n, L) => { if (L < 100 || !dry(n)) return false; if (!best || n.z > best.z) best = n; return n.z >= z0 + 3; }, 3000);
      let end = r.end, pth = r;
      if (!end && best) { pth = search(net, src, cost, n => n === best, 3500); end = pth.end; }
      if (!end) return;
      const key = end.ix;
      let t = targets.get(key);
      if (!t) { const lb = label(end); t = { id: 'H' + (targets.size + 1), c: [end.lat, end.lon], z: Math.round(end.z), name: lb.name, how: lb.how }; targets.set(key, t); }
      routes.push({ id: 'R' + (i + 1), fromName: z.name, fromD: z.d, from: z.c, z0: Math.round(z0), to: t, up: Math.round(end.z - z0), path: pth.path, len: pth.len, min: walkMin(pth.len), streets: pth.streets });
    });
    // Shahar boʻyicha eng baland quruq joylar (1 km bloklarda eng balandi)
    const blocks = new Map();
    net.nodes.forEach(n => { if (!n.nb.length || !dry(n)) return; const kk = Math.floor(n.x / 1000) + ':' + Math.floor(n.y / 1000), b = blocks.get(kk); if (!b || n.z > b.z) blocks.set(kk, n); });
    const high = [...blocks.values()].sort((a, b) => b.z - a.z).slice(0, 5).map(n => ({ c: [n.lat, n.lon], z: Math.round(n.z), name: label(n).name }));
    return { kind: 'flood', routes, targets: [...targets.values()], high };
  }

  // ---------- Xarita va AI uchun ----------
  const ZCOL = ['#7f1d1d', '#b91c1c', '#dc2626', '#ea580c', '#f97316', '#fb923c'];
  function items(H) {
    const out = [];
    const mid = p => p[Math.floor(p.length / 2)];
    if (H.kind === 'quake') {
      H.zones.forEach((z, i) => out.push({ kind: 'zone', id: z.id, ring: z.ring, lat: z.c[0], lon: z.c[1], color: ZCOL[i] || '#f97316', title: `⚠️ ${z.id}: ${z.name || 'xavfli hudud'}`, note: `~${NX.fmt.int(z.hp)} kishi ogʻir shikastlangan binolarda boʻlishi mumkin (${H.I} ball, taxminiy). ${z.n} bino, ${z.A} tasi past (paxsa/gʻisht), ${z.tall} tasi 5+ qavat.${z.crit.length ? ' ' + z.crit.slice(0, 3).join(', ') + '.' : ''}` }));
      H.routes.forEach(r => out.push({ kind: 'line', id: r.id, path: r.path, from: r.path[0], to: r.path[r.path.length - 1], lat: mid(r.path)[0], lon: mid(r.path)[1], color: '#16a34a', title: `🚶 ${r.id}: ${r.from} → ${r.sh.id}`, note: `${NX.fmt.int(r.len)} m, piyoda ~${r.min} daq.${r.streets.length ? ' ' + r.streets.join(' → ') + '.' : ''}` }));
      H.shelters.forEach(s => out.push({ kind: 'point', id: s.id, lat: s.c[0], lon: s.c[1], color: '#16a34a', title: `🟢 ${s.id}: ${s.name}`, note: `${s.kind}${s.area ? `, ${NX.fmt.int(s.area)} m² — ~${NX.fmt.int(s.cap)} kishi sigʻadi` : ''}; bu yerga ~${NX.fmt.int(s.assigned)} kishi yoʻnaltirilgan.` }));
    } else {
      H.routes.forEach(r => out.push({ kind: 'line', id: r.id, path: r.path, from: r.path[0], to: r.path[r.path.length - 1], lat: r.from[0], lon: r.from[1], color: '#16a34a', title: `🚶 ${r.id}: ${r.fromName || 'suvli koʻcha'} → ${r.to.id}`, note: `${NX.fmt.int(r.len)} m, ~${r.min} daq., ${r.up} m yuqoriga.${r.streets.length ? ' ' + r.streets.join(' → ') + '.' : ''}` }));
      H.targets.forEach(t => out.push({ kind: 'point', id: t.id, lat: t.c[0], lon: t.c[1], color: '#0d9488', title: `⛰ ${t.id}: ${t.name}`, note: `${t.z} m balandlikda, quruq; ${t.how}.` }));
    }
    return out;
  }
  function facts(H) {
    if (H.kind === 'quake') return {
      ogohlantirish: 'TAXMINIY: bino materiali/yili maʼlumoti yoʻq — zaiflik qavat va turiga qarab olindi (EMS-98 ga yaqin jadval). Xaritada hammasi chizilgan.',
      ball: H.I, shahar_boʻyicha: { binolar: H.tot.n, past_uylar_paxsa_gisht: H.tot.A, ogʻir_shikastlanishi_mumkin_binolar: Math.round(H.tot.hb), shu_binolardagi_odamlar_tunda: Math.round(H.tot.hp), aholi_taxmin_osm: Math.round(H.tot.ppl) },
      xavfli_zonalar: H.zones.map(z => ({ id: z.id, joy: z.name, binolar: z.n, past_uylar: z.A, qavat5_plus: z.tall, zichlik_foiz: Math.round(z.cover * 100), aholi: Math.round(z.ppl), xavf_ostidagi_odamlar: Math.round(z.hp), maktab_shifoxona: z.crit.slice(0, 4) })),
      yigʻilish_joylari: H.shelters.map(s => ({ id: s.id, nomi: s.name, turi: s.kind, maydon_m2: s.area, sigʻim_kishi: s.cap, yoʻnaltirilgan_kishi: s.assigned })),
      evakuatsiya_yoʻllari: H.routes.map(r => ({ id: r.id, qayerdan: r.from + (r.fromName ? ' (' + r.fromName + ')' : ''), qayerga: r.sh.id + ' ' + r.sh.name, uzunlik_m: r.len, piyoda_daqiqa: r.min, koʻchalar: r.streets, odamlar: r.ppl })),
      yoʻl_tanlash_qoidasi: 'keng koʻchalar afzal; 5+ qavatli binolar yonidan va tor koʻchalardan qochilgan (vayronalar)',
    };
    return {
      ogohlantirish: 'TAXMINIY: relyef SRTM ~30 m; suv chuqurligi — fizik model natijasi. Xaritada yoʻllar va baland joylar chizilgan.',
      evakuatsiya_yoʻllari: H.routes.map(r => ({ id: r.id, qayerdan: r.fromName, u_yerdagi_suv_sm: Math.round((r.fromD || 0) * 100), qayerga: r.to.id + ' ' + r.to.name, balandlik_farqi_m: r.up, uzunlik_m: r.len, piyoda_daqiqa: r.min, koʻchalar: r.streets })),
      baland_xavfsiz_joylar: H.targets.map(t => ({ id: t.id, nomi: t.name, balandlik_m: t.z, izoh: t.how })),
      shahar_eng_baland_quruq_joylari: H.high.map(h => ({ nomi: h.name, balandlik_m: h.z })),
      yoʻl_tanlash_qoidasi: '30 sm+ suvli koʻchalardan oʻtilmaydi; 3 m+ balandroq va quruq joygacha eng qisqa yoʻl',
    };
  }

  NX.hazard = { intensity, openSpaces, quake, flood, items, facts, vclass, heavy, _search: search };
})();
