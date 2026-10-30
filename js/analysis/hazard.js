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
    const hit = await NX.bigStore.get('open:v2');
    if (hit && hit.spaces && Date.now() - hit.ts < 30 * 86400e3) return (osCache = hit);
    const C = NX.twin.CITY, bb = `${C.s},${C.w},${C.n},${C.e}`;
    const q = `[out:json][timeout:90];(way["leisure"~"^(park|garden|pitch|stadium|recreation_ground|playground)$"](${bb});way["landuse"~"^(grass|recreation_ground|meadow)$"](${bb});way["place"="square"](${bb});way["highway"="pedestrian"]["area"="yes"](${bb});way["amenity"~"^(school|university|college)$"](${bb});node["place"~"^(neighbourhood|quarter|suburb)$"](${bb}););out tags bb center qt;`;
    for (const url of NX.config.overpassMirrors) {
      try {
        const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 60000);
        if (!r.ok || !r.data || !r.data.elements) continue;
        const spaces = [], places = [];
        r.data.elements.forEach(e => {
          const t = e.tags || {}, name = t['name:uz'] || t.name || '';
          if (e.type === 'node') { if (name) places.push({ name, c: [e.lat, e.lon] }); return; }
          // Maydon — chegaraviy toʻrtburchakdan (×0.7); maktab/OTM hovlisi — maydonning 40% i ochiq deb olinadi
          const B = e.bounds, c = e.center;
          if (!B || !c) return;
          const [x0, y0] = G.xy(B.minlat, B.minlon), [x1, y1] = G.xy(B.maxlat, B.maxlon), school = /^(school|university|college)$/.test(t.amenity || '');
          const area = Math.abs((x1 - x0) * (y1 - y0)) * 0.7 * (school ? 0.4 : 1);
          if (area < 1500) return;
          const kind = school ? (t.amenity === 'school' ? 'maktab hovlisi' : 'oliy taʼlim hovlisi') : OS_KIND[t.leisure || t.landuse || t.place || t.highway] || 'ochiq joy';
          spaces.push({ name, kind, area: Math.round(area), c: [c.lat, c.lon] });
        });
        osCache = { ts: Date.now(), spaces, places };
        NX.bigStore.set('open:v2', osCache);
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
      if (stop(n, len[i])) return Object.assign(path(net, i, prev, pseg, len, seen), { dist });
      if (len[i] > maxM) continue;
      n.nb.forEach(({ n: m, sg }) => { const nd = d + sg.len * cost(sg); if (nd < dist[m.ix]) { dist[m.ix] = nd; len[m.ix] = len[i] + sg.len; prev[m.ix] = i; pseg[m.ix] = sg; push(nd, m.ix); } });
    }
    return { end: null, seen, len, dist };
  }
  function path(net, i, prev, pseg, len, seen) {
    const pts = [], names = [], segs = [];
    let k = i;
    while (k >= 0) { const n = net.nodes[k]; pts.push([n.lat, n.lon]); const sg = pseg[k]; if (sg) segs.push(sg); if (sg && sg.name && names[names.length - 1] !== sg.name) names.push(sg.name); k = prev[k]; }
    pts.reverse(); names.reverse();
    // Xarita uchun ixchamlashtirish (≤ 160 nuqta)
    const st = Math.max(1, Math.ceil(pts.length / 160));
    return { end: net.nodes[i], path: pts.filter((p, j) => j % st === 0 || j === pts.length - 1), len: Math.round(len[i]), streets: [...new Set(names)].slice(0, 6), segs, seen, lenArr: len };
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
    top.forEach((c, i) => { c.id = 'Z' + (i + 1); c.name = placeName(places, c.c) || (hz && hz.street(c.c[0], c.c[1], 400)) || ''; Object.assign(c, region(blds, I, c.c, 360)); });
    const tot = list.reduce((t, c) => ({ hb: t.hb + c.hb, hp: t.hp + c.hp, ppl: t.ppl + c.ppl, n: t.n + c.n, A: t.A + c.A }), { hb: 0, hp: 0, ppl: 0, n: 0, A: 0 });
    return { top, tot, I };
  }

  // Xavfli hudud aniq shakli: faqat turar joy va jamoat binolari (katta past omborlar/zavodlar emas) — 40 m kataklar.
  // Zavod, ochiq maydon, yoʻl ustiga qizil tushmaydi; raqamlar ham shu binolardan.
  const WORKS = b => (b.area > 800 && b.levels <= 2 && !CRIT.test(b.kind) && !/apartments|residential|school|university|hospital/.test(b.kind)) || /industrial|warehouse|garage|shed|greenhouse|roof|construction/.test(b.kind);
  function region(blds, I, c0, R, inside) {
    const [cx, cy] = G.xy(c0[0], c0[1]), cells = new Map(), st = { n: 0, A: 0, B: 0, C: 0, ppl: 0, hp: 0, hb: 0, tall: 0, crit: [] };
    blds.forEach(b => {
      if (WORKS(b)) return;
      const [x, y] = G.xy(b.c[0], b.c[1]);
      if (inside ? !inside(b.c[0], b.c[1]) : Math.hypot(x - cx, y - cy) > R) return;
      const cls = vclass(b), h = heavy(cls, I), p = people(b);
      st.n++; st[cls]++; st.ppl += p; st.hp += p * h; st.hb += h; if (b.levels >= 5) st.tall++;
      if (CRIT.test(b.kind)) { st.crit.push(b.name || KIND_UZ[b.kind] || b.kind); st.hp += 150 * h; }
      const k = Math.floor(x / 40) + ':' + Math.floor(y / 40), v = cells.get(k) || { x: Math.floor(x / 40) * 40 + 20, y: Math.floor(y / 40) * 40 + 20, r: 0 };
      v.r += h; cells.set(k, v);
    });
    // Kataklar: markaz (lat, lon) va xavf darajasi (0..1)
    const mx = Math.max(0.01, ...[...cells.values()].map(v => v.r));
    return Object.assign(st, { cells: [...cells.values()].map(v => { const ll = G.ll(v.x, v.y); return [+ll[0].toFixed(6), +ll[1].toFixed(6), +(v.r / mx).toFixed(2)]; }), cover: st.n ? Math.min(1, st.n * 120 / (Math.PI * (R || 300) ** 2)) : 0 });
  }

  // Belgilangan hudud: ichidagi turar joylar 150 m guruhlarga — har guruh oʻz eng yaqin chiqish yoʻli bilan (ichki ham evakuatsiya qilinadi)
  function areaOrigins(blds, inside) {
    const g = new Map();
    blds.forEach(b => { if (WORKS(b) || !inside(b.c[0], b.c[1])) return; const p = people(b); if (p <= 0) return; const [x, y] = G.xy(b.c[0], b.c[1]), k = Math.floor(x / 150) + ':' + Math.floor(y / 150), v = g.get(k) || { x: 0, y: 0, w: 0, ppl: 0 }; v.x += x * p; v.y += y * p; v.w += p; v.ppl += p; g.set(k, v); });
    let list = [...g.values()].map(v => ({ x: v.x / v.w, y: v.y / v.w, ppl: v.ppl })).sort((a, b) => b.ppl - a.ppl);
    // Eng koʻpi 8 guruh; qolganlari eng yaqin guruhga qoʻshiladi
    const keep = list.slice(0, 8);
    list.slice(8).forEach(v => { const t = keep.reduce((b, q) => (Math.hypot(q.x - v.x, q.y - v.y) < Math.hypot(b.x - v.x, b.y - v.y) ? q : b), keep[0]); t.ppl += v.ppl; });
    return keep.map((v, i) => ({ id: 'A' + (i + 1), name: `${i + 1}-guruh`, c: G.ll(v.x, v.y), ppl: Math.round(v.ppl) }));
  }

  // Yigʻilish joylari: ochiq joylar (≥ 3 000 m²); boʻlmasa — keng koʻchalar (baland binolardan uzoq)
  function shelters(os, net, tallNear) {
    const hz = index(net), out = [];
    (os.spaces || []).filter(s => s.area >= 2000).forEach(s => { const n = hz.node(s.c[0], s.c[1], 300); if (n) out.push({ name: s.name || OS_KIND_CAP(s.kind), kind: s.kind, area: s.area, cap: Math.round(s.area / 2), c: s.c, node: n }); });
    if (out.length < 3) {
      // Zaxira: magistral koʻchalar tugunlari, 60 m ichida 5+ qavatli bino yoʻq, bir-biridan ≥ 700 m
      net.nodes.forEach(n => {
        if (!n.nb.some(q => q.sg.w >= 16) || tallNear(n.x, n.y, 60)) return;
        if (out.some(o => Math.hypot(o.node.x - n.x, o.node.y - n.y) < 700)) return;
        const nm = (n.nb.find(q => q.sg.name) || { sg: {} }).sg.name || 'keng koʻcha';
        // ~100 m × koʻcha kengligi, kishiga 1 m² — vaqtincha yigʻilish
        const w = Math.max(...n.nb.map(q => q.sg.w));
        out.push({ name: nm, kind: 'keng koʻcha (vaqtincha yigʻilish)', area: Math.round(100 * w), cap: Math.round(100 * w), road: true, c: [n.lat, n.lon], node: n });
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
    const real = new Map(SH.filter(s => !s.road).map(s => [s.node.ix, s])), any = new Map(SH.map(s => [s.node.ix, s]));
    const cost = quakeCost(net, tallNear);
    // Kimni evakuatsiya qilamiz: belgilangan hudud (soʻralsa — faqat shu), har bir mahalla yoki shahar boʻyicha eng xavfli zonalar
    if (o.area) {
      const inside = (la, lo) => NX.area.inside(o.area.poly, la, lo);
      const zone = Object.assign({ id: 'Z1', name: o.area.name || 'belgilangan hudud', c: o.area.center }, region(blds, I, o.area.center, 0, inside));
      // Hudud ichidagi yigʻilish joylari ham, tashqaridagilar ham; ichkaridagisi baland binolardan uzoq boʻlsa — afzal
      const origins = areaOrigins(blds, inside);
      if (!origins.length) origins.push({ id: 'A1', name: 'hudud markazi', c: o.area.center, ppl: Math.round(zone.ppl) || 1 });
      const P = evacPlan(net, hz, origins, SH, cost, real);
      return { kind: 'quake', scope: 'area', I, zones: [zone], tot: { hb: zone.hb, hp: zone.hp, ppl: zone.ppl, n: zone.n, A: zone.A }, shelters: P.shelters, allShelters: SH.length, routes: P.routes, total: P.total, epicenter: o.area.center };
    }
    const mh = o.mahalla ? mahallaOrigins(os.places, blds, net) : [];
    const origins = (mh.length ? mh : Z.top.map(z => ({ id: z.id, name: z.name, c: z.c, ppl: z.ppl }))).concat(o.extraOrigins || []);
    const P = evacPlan(net, hz, origins, SH, cost, real);
    return { kind: 'quake', scope: mh.length ? 'mahalla' : 'city', I, zones: Z.top, tot: Z.tot, shelters: P.shelters, allShelters: SH.length, routes: P.routes, byMahalla: !!mh.length, total: P.total, epicenter: Z.top[0] ? Z.top[0].c : null };
  }

  // Mahallalar (OSM nomlari) — har biriga aholisi (500 m ichidagi turar joylar), eng koʻp aholili 12 tasi, bir-biridan ≥ 700 m
  function mahallaOrigins(places, blds, net) {
    if (!places || !places.length) return [];
    const C = NX.twin.CITY, inC = p => p.c[0] > C.s && p.c[0] < C.n && p.c[1] > C.w && p.c[1] < C.e;
    const bg = bgrid(blds, 100), out = [];
    places.filter(inC).map(p => { const [x, y] = G.xy(p.c[0], p.c[1]); let ppl = 0; bg(x, y, 500, b => { ppl += people(b); }); return { name: p.name, c: p.c, ppl, x, y }; })
      .sort((a, b) => b.ppl - a.ppl)
      .forEach(p => { if (out.length < 12 && p.ppl > 0 && out.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 700)) out.push(p); });
    return out.map((p, i) => ({ id: 'M' + (i + 1), name: p.name, c: p.c, ppl: p.ppl }));
  }

  // Evakuatsiya rejasi:
  // 1) har bir manbadan barcha yigʻilish joylarigacha masofa (Dijkstra, 4 km gacha);
  // 2) odamlar sigʻim boʻyicha taqsimlanadi (eng yaqin juftliklar birinchi — ochkoʻz taqsimot), bitta joy toʻlsa — keyingisiga;
  // 3) har bir oqim uchun yoʻl; asosiy yoʻlga — zaxira yoʻl (asosiy koʻchalar 6 baravar “qimmat” qilinib qayta hisoblanadi);
  // 4) vaqt = piyoda yurish + eng tor joydan oʻtish (1.3 kishi/m/s, koʻchaning 60% i piyodaga).
  function evacPlan(net, hz, origins, SH, cost, real) {
    const srcs = origins.map(z => Object.assign({}, z, { src: hz.node(z.c[0], z.c[1], 400), left: Math.max(1, Math.round(z.ppl || 0)) })).filter(z => z.src);
    const cap = new Map(SH.map(s => [s, Math.max(300, s.cap || 0)]));
    const pairs = [];
    srcs.forEach(z => { const r = search(net, z.src, cost, () => false, 4000); SH.forEach(s => { const d = r.dist[s.node.ix]; if (isFinite(d)) pairs.push({ z, s, d: d * (real.has(s.node.ix) ? 1 : 1.6) }); }); });
    pairs.sort((a, b) => a.d - b.d);
    const flows = new Map();
    pairs.forEach(p => { if (p.z.left <= 0) return; const c = cap.get(p.s); if (c <= 0) return; const n = Math.min(p.z.left, c); p.z.left -= n; cap.set(p.s, c - n); (flows.get(p.z) || flows.set(p.z, []).get(p.z)).push({ s: p.s, n }); });
    // Sigʻim yetmasa — qolganlar eng yaqin joyga (ortiqcha yuk bilan)
    srcs.forEach(z => { if (z.left > 0) { const p = pairs.find(q => q.z === z); if (p) { const f = (flows.get(z) || flows.set(z, []).get(z)); const e = f.find(x => x.s === p.s); if (e) e.n += z.left; else f.push({ s: p.s, n: z.left }); z.over = z.left; z.left = 0; } } });
    const routes = [], load = new Map();
    let k = 0;
    srcs.forEach(z => {
      (flows.get(z) || []).sort((a, b) => b.n - a.n).slice(0, 2).forEach((f, fi) => {
        const r = search(net, z.src, cost, n => n === f.s.node, 6000);
        if (!r.end) return;
        load.set(f.s, (load.get(f.s) || 0) + f.n);
        const wmin = Math.max(3, Math.min(...r.segs.map(sg => sg.w), 30)), flow = 1.3 * wmin * 0.6, clear = Math.round(f.n / flow / 60);
        const R = { id: 'R' + (++k), from: z.id, fromName: z.name, sh: f.s, path: r.path, len: r.len, min: walkMin(r.len), streets: r.streets, ppl: Math.round(f.n), part: fi, clearMin: clear, totalMin: walkMin(r.len) + clear, narrowM: Math.round(wmin), over: fi === 0 && z.over ? Math.round(z.over) : 0 };
        // Zaxira yoʻl (asosiy yoʻl toʻsilsa)
        if (fi === 0) {
          const used = new Set(r.segs), c2 = sg => cost(sg) * (used.has(sg) ? 6 : 1);
          const b = search(net, z.src, c2, n => n === f.s.node, 7000);
          if (b.end) { const same = b.segs.filter(sg => used.has(sg)).reduce((t, sg) => t + sg.len, 0) / Math.max(1, b.len); if (same < 0.6) R.backup = { path: b.path, len: b.len, min: walkMin(b.len), streets: b.streets }; }
        }
        routes.push(R);
      });
    });
    const shelters = [...load.keys()].map((s, i) => Object.assign(s, { id: 'S' + (i + 1), assigned: Math.round(load.get(s)) }));
    const total = { odamlar: Math.round(srcs.reduce((t, z) => t + (z.ppl || 0), 0)), eng_uzoq_daqiqa: routes.length ? Math.max(...routes.map(r => r.totalMin)) : 0 };
    return { routes, shelters, total };
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
    const inA = o.area ? (la, lo) => NX.area.inside(o.area.poly, la, lo) : null;
    if (inA) {
      // Belgilangan hudud: ichidagi suvli koʻchalar; boʻlmasa — hududdagi turar joy guruhlari
      (o.streets || []).filter(s2 => s2.at && inA(s2.at[0], s2.at[1])).slice(0, 6).forEach(s2 => { const [x, y] = G.xy(s2.at[0], s2.at[1]); origins.push({ name: s2.name, c: s2.at, d: s2.max, x, y }); });
      if (!origins.length) areaOrigins(blds, inA).slice(0, 5).forEach(a => { const [x, y] = G.xy(a.c[0], a.c[1]); origins.push({ name: 'hudud ' + a.name, c: a.c, d: 0, x, y }); });
    }
    (inA ? [] : o.streets || []).forEach(s => { if (!s.at || origins.length >= 6) return; const [x, y] = G.xy(s.at[0], s.at[1]); if (origins.every(q => Math.hypot(q.x - x, q.y - y) >= 400)) origins.push({ name: s.name, c: s.at, d: s.max, x, y }); });
    (inA ? [] : o.extraOrigins || []).forEach(e => origins.push(e));
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
      const R = { id: 'R' + (i + 1), fromName: z.name, fromD: z.d, from: z.c, z0: Math.round(z0), to: t, up: Math.round(end.z - z0), path: pth.path, len: pth.len, min: walkMin(pth.len), streets: pth.streets, wetM: Math.round((pth.segs || []).filter(sg => sg.dw >= 0.1).reduce((a, sg) => a + sg.len, 0)) };
      // Zaxira yoʻl — asosiy yoʻl suv bilan toʻsilsa
      const used = new Set(pth.segs || []), b = search(net, src, sg => cost(sg) * (used.has(sg) ? 6 : 1), n => n === end, 4500);
      if (b.end) { const same = b.segs.filter(sg => used.has(sg)).reduce((a, sg) => a + sg.len, 0) / Math.max(1, b.len); if (same < 0.6) R.backup = { path: b.path, len: b.len, min: walkMin(b.len), streets: b.streets }; }
      routes.push(R);
    });
    // Shahar boʻyicha eng baland quruq joylar (1 km bloklarda eng balandi)
    const blocks = new Map();
    net.nodes.forEach(n => { if (!n.nb.length || !dry(n)) return; const kk = Math.floor(n.x / 1000) + ':' + Math.floor(n.y / 1000), b = blocks.get(kk); if (!b || n.z > b.z) blocks.set(kk, n); });
    const high = [...blocks.values()].sort((a, b) => b.z - a.z).slice(0, 5).map(n => ({ c: [n.lat, n.lon], z: Math.round(n.z), name: label(n).name }));
    return { kind: 'flood', scope: inA ? 'area' : 'city', routes, targets: [...targets.values()], high };
  }

  // ---------- Favqulodda xizmatlar: yongʻin, tez yordam, politsiya — qayerga necha daqiqada yetib boradi ----------
  let svcCache = null;
  async function services() {
    if (svcCache) return svcCache;
    const hit = await NX.bigStore.get('svc:v1');
    if (hit && hit.list && Date.now() - hit.ts < 30 * 86400e3) return (svcCache = hit);
    const C = NX.twin.CITY, bb = `${C.s - 0.03},${C.w - 0.04},${C.n + 0.03},${C.e + 0.04}`;
    const q = `[out:json][timeout:40];(nwr["amenity"~"^(fire_station|hospital|police|ambulance_station)$"](${bb});nwr["emergency"="ambulance_station"](${bb}););out tags center qt;`;
    for (const url of NX.config.overpassMirrors) {
      try {
        const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 45000);
        if (!r.ok || !r.data || !r.data.elements) continue;
        const list = r.data.elements.map(e => { const t = e.tags || {}, la = e.lat != null ? e.lat : e.center && e.center.lat, lo = e.lon != null ? e.lon : e.center && e.center.lon; const k = t.amenity === 'fire_station' ? 'fire' : t.amenity === 'police' ? 'police' : 'ambulance'; return la == null ? null : { k, name: t['name:uz'] || t.name || '', c: [la, lo] }; }).filter(Boolean);
        svcCache = { ts: Date.now(), list };
        NX.bigStore.set('svc:v1', svcCache);
        return svcCache;
      } catch (e) { /* keyingi server */ }
    }
    throw new Error('Xizmatlar roʻyxati yuklanmadi');
  }
  const SVC = { fire: { uz: 'Oʻt oʻchirish', icon: '🚒', norm: 10 }, ambulance: { uz: 'Tez yordam / shifoxona', icon: '🚑', norm: 15 }, police: { uz: 'Politsiya', icon: '🚓', norm: 10 } };
  // Favqulodda mashina tezligi: magistral 45, katta koʻcha 35, mahalla 20 km/soat (+1 daqiqa chiqish)
  const driveCost = sg => 3.6 / (sg.w >= 16 ? 45 : sg.w >= 12 ? 35 : sg.w >= 9 ? 28 : 20);   // soniya / m
  function responders(o) {
    const { net, svc, kind } = o, hz = index(net), S0 = SVC[kind];
    const st = svc.list.filter(x => x.k === kind).map(x => Object.assign({}, x, { node: hz.node(x.c[0], x.c[1], 500) })).filter(x => x.node);
    if (!st.length) return { kind: 'svc', svc: kind, stations: [], slow: [], route: null, cover: null };
    // Koʻp manbali Dijkstra: barcha stansiyalardan bir vaqtda
    const N = net.nodes.length, T = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
    const H = [], push = (d, i) => { H.push([d, i]); let c = H.length - 1; while (c) { const p = (c - 1) >> 1; if (H[p][0] <= H[c][0]) break; [H[p], H[c]] = [H[c], H[p]]; c = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === c) break; [H[m], H[c]] = [H[c], H[m]]; c = m; } } return top; };
    st.forEach((x, si) => { if (60 < T[x.node.ix]) { T[x.node.ix] = 60; from[x.node.ix] = si; push(60, x.node.ix); } });
    while (H.length) { const [d, i] = pop(); if (d > T[i]) continue; net.nodes[i].nb.forEach(({ n, sg }) => { const nd = d + sg.len * driveCost(sg); if (nd < T[n.ix]) { T[n.ix] = nd; from[n.ix] = from[i]; push(nd, n.ix); } }); }
    // Shahar ichidagi tugunlar: meʼyorda yetib boriladiganlar ulushi; sekin hududlar (500 m kataklar, bir-biridan ≥ 900 m)
    const C = NX.twin.CITY, inC = n => n.lat > C.s && n.lat < C.n && n.lon > C.w && n.lon < C.e && n.nb.length;
    const nodes = net.nodes.filter(inC), ok = nodes.filter(n => T[n.ix] <= S0.norm * 60).length;
    const cells = new Map();
    nodes.forEach(n => { const k = Math.floor(n.x / 500) + ':' + Math.floor(n.y / 500), c = cells.get(k); if (!c || T[n.ix] > T[c.ix]) cells.set(k, n); });
    const slow = [];
    [...cells.values()].filter(n => isFinite(T[n.ix]) && T[n.ix] > S0.norm * 60).sort((a, b) => T[b.ix] - T[a.ix]).forEach(n => { if (slow.length < 6 && slow.every(q => Math.hypot(q.x - n.x, q.y - n.y) >= 900)) slow.push(n); });
    const slowOut = slow.map((n, i) => ({ id: 'T' + (i + 1), c: [n.lat, n.lon], min: Math.round(T[n.ix] / 60), name: hz.street(n.lat, n.lon, 300) || '', st: st[from[n.ix]] && (st[from[n.ix]].name || S0.uz) }));
    // Aniq manzilga (belgilangan hudud yoki eng uzoq joy) — eng tez stansiyadan yoʻl
    const tgt = o.target ? hz.node(o.target[0], o.target[1], 500) : slow[0];
    let route = null;
    if (tgt && from[tgt.ix] >= 0) {
      const s0 = st[from[tgt.ix]], r = search(net, s0.node, driveCost, n => n === tgt, 30000);
      if (r.end) route = { from: s0, path: r.path, len: r.len, min: Math.round(T[tgt.ix] / 60), streets: r.streets, to: o.targetName || hz.street(tgt.lat, tgt.lon, 300) || 'manzil' };
    }
    return { kind: 'svc', svc: kind, norm: S0.norm, stations: st.map((x, i) => ({ id: 'X' + (i + 1), name: x.name || S0.uz, c: x.c })), slow: slowOut, route, cover: nodes.length ? Math.round(ok / nodes.length * 100) : null };
  }

  // ---------- Xarita va AI uchun ----------
  const ZCOL = ['#7f1d1d', '#b91c1c', '#dc2626', '#ea580c', '#f97316', '#fb923c'];
  function items(H) {
    const out = [];
    const mid = p => p[Math.floor(p.length / 2)];
    if (H.kind === 'quake') {
      H.zones.forEach((z, i) => out.push({ kind: 'zone', id: z.id, ring: z.ring || null, cells: z.cells, lat: z.c[0], lon: z.c[1], color: ZCOL[i] || '#f97316', title: `⚠️ ${z.id}: ${z.name || 'xavfli hudud'}`, note: `~${NX.fmt.int(z.hp)} kishi ogʻir shikastlangan binolarda boʻlishi mumkin (${H.I} ball, taxminiy). ${z.n} bino, ${z.A} tasi past (paxsa/gʻisht), ${z.tall} tasi 5+ qavat.${z.crit.length ? ' ' + z.crit.slice(0, 3).join(', ') + '.' : ''}` }));
      H.routes.forEach(r => {
        out.push({ kind: 'line', id: r.id, ppl: r.ppl, path: r.path, from: r.path[0], to: r.path[r.path.length - 1], lat: mid(r.path)[0], lon: mid(r.path)[1], color: r.part ? '#0d9488' : '#22c55e', title: `🚶 ${r.id}: ${r.fromName || r.from} → ${r.sh.id} (${NX.fmt.int(r.ppl)} kishi)`, note: `${NX.fmt.int(r.len)} m, piyoda ~${r.min} daq.; hammasi chiqib boʻlishi ~${r.totalMin} daq. (eng tor joy ${r.narrowM} m).${r.streets.length ? ' ' + r.streets.join(' → ') + '.' : ''}` });
        if (r.backup) out.push({ kind: 'line', id: r.id + 'z', path: r.backup.path, from: r.backup.path[0], to: r.backup.path[r.backup.path.length - 1], lat: mid(r.backup.path)[0], lon: mid(r.backup.path)[1], color: '#38bdf8', dash: true, title: `↪ ${r.id} zaxira yoʻli`, note: `${NX.fmt.int(r.backup.len)} m, ~${r.backup.min} daq.${r.backup.streets.length ? ' ' + r.backup.streets.join(' → ') + '.' : ''} Asosiy yoʻl toʻsilsa.` });
      });
      H.shelters.forEach(s => out.push({ kind: 'point', id: s.id, lat: s.c[0], lon: s.c[1], color: '#16a34a', title: `🟢 ${s.id}: ${s.name}`, note: `${s.kind}${s.area ? `, ${NX.fmt.int(s.area)} m² — ~${NX.fmt.int(s.cap)} kishi sigʻadi` : ''}; bu yerga ~${NX.fmt.int(s.assigned)} kishi yoʻnaltirilgan.` }));
    } else if (H.kind === 'svc') {
      const S0 = SVC[H.svc];
      H.slow.forEach(t => out.push({ kind: 'point', id: t.id, lat: t.c[0], lon: t.c[1], color: '#f97316', title: `⏱ ${t.id}: ${t.name || 'uzoq hudud'} — ~${t.min} daq.`, note: `${S0.uz} meʼyori ${S0.norm} daqiqa; eng yaqini: ${t.st}.` }));
      if (H.route) out.push({ kind: 'line', id: 'Y1', path: H.route.path, from: H.route.path[0], to: H.route.path[H.route.path.length - 1], lat: mid(H.route.path)[0], lon: mid(H.route.path)[1], color: '#dc2626', title: `${S0.icon} ${H.route.from.name || S0.uz} → ${H.route.to}: ~${H.route.min} daq.`, note: `${NX.fmt.int(H.route.len)} m.${H.route.streets.length ? ' ' + H.route.streets.join(' → ') + '.' : ''}` });
      H.stations.slice(0, 12).forEach(x => out.push({ kind: 'point', id: x.id, lat: x.c[0], lon: x.c[1], color: '#dc2626', title: `${S0.icon} ${x.name}`, note: S0.uz }));
    } else {
      H.routes.forEach(r => {
        out.push({ kind: 'line', id: r.id, path: r.path, from: r.path[0], to: r.path[r.path.length - 1], lat: r.from[0], lon: r.from[1], color: '#16a34a', title: `🚶 ${r.id}: ${r.fromName || 'suvli koʻcha'} → ${r.to.id}`, note: `${NX.fmt.int(r.len)} m, ~${r.min} daq., ${r.up} m yuqoriga${r.wetM ? `; ${r.wetM} m yoʻl sayoz suvdan oʻtadi` : ''}.${r.streets.length ? ' ' + r.streets.join(' → ') + '.' : ''}` });
        if (r.backup) out.push({ kind: 'line', id: r.id + 'z', path: r.backup.path, from: r.backup.path[0], to: r.backup.path[r.backup.path.length - 1], lat: mid(r.backup.path)[0], lon: mid(r.backup.path)[1], color: '#38bdf8', dash: true, title: `↪ ${r.id} zaxira yoʻli`, note: `${NX.fmt.int(r.backup.len)} m, ~${r.backup.min} daq. Asosiy yoʻl suv bilan toʻsilsa.` });
      });
      H.targets.forEach(t => out.push({ kind: 'point', id: t.id, lat: t.c[0], lon: t.c[1], color: '#0d9488', title: `⛰ ${t.id}: ${t.name}`, note: `${t.z} m balandlikda, quruq; ${t.how}.` }));
    }
    return out;
  }
  function facts(H) {
    if (H.kind === 'svc') { const S0 = SVC[H.svc]; return {
      xizmat: S0.uz, meyor_daqiqa: S0.norm, stansiyalar_osm: H.stations.length, stansiyalar: H.stations.slice(0, 12).map(x => ({ id: x.id, nomi: x.name })),
      shahar_koʻchalarining_meyorda_yetiladigan_foizi: H.cover,
      uzoq_hududlar: H.slow.map(t => ({ id: t.id, joy: t.name, daqiqa: t.min, eng_yaqin_stansiya: t.st })),
      yoʻl: H.route ? { id: 'Y1', qayerdan: H.route.from.name || S0.uz, qayerga: H.route.to, daqiqa: H.route.min, uzunlik_m: H.route.len, koʻchalar: H.route.streets } : null,
      ogohlantirish: 'TAXMINIY: tezlik koʻcha turiga qarab (45/35/28/20 km/soat, tirbandliksiz), stansiyalar — OSM; haqiqiy chaqiruv vaqti FVV/IIV maʼlumotidan olinadi.',
    }; }
    if (H.kind === 'quake') return {
      ogohlantirish: 'TAXMINIY: bino materiali/yili maʼlumoti yoʻq — zaiflik qavat va turiga qarab olindi (EMS-98 ga yaqin jadval). Xaritada hammasi chizilgan.',
      savol_doirasi: H.scope === 'area' ? 'FAQAT belgilangan hudud (foydalanuvchi xaritada chizgan): zona Z1 — shu hudud, A1… — hududdagi uy guruhlari' : H.scope === 'mahalla' ? 'har bir mahalla' : 'butun shahar — eng xavfli zonalar',
      ball: H.I, [H.scope === 'area' ? 'hudud_boʻyicha' : 'shahar_boʻyicha']: { binolar: H.tot.n, past_uylar_paxsa_gisht: H.tot.A, ogʻir_shikastlanishi_mumkin_binolar: Math.round(H.tot.hb), shu_binolardagi_odamlar_tunda: Math.round(H.tot.hp), aholi_taxmin_osm: Math.round(H.tot.ppl) },
      xavfli_zonalar: H.zones.map(z => ({ id: z.id, joy: z.name, binolar: z.n, past_uylar: z.A, qavat5_plus: z.tall, zichlik_foiz: Math.round(z.cover * 100), aholi: Math.round(z.ppl), xavf_ostidagi_odamlar: Math.round(z.hp), maktab_shifoxona: z.crit.slice(0, 4) })),
      yigʻilish_joylari: H.shelters.map(s => ({ id: s.id, nomi: s.name, turi: s.kind, maydon_m2: s.area, sigʻim_kishi: s.cap, yoʻnaltirilgan_kishi: s.assigned })),
      kimlar_uchun: H.byMahalla ? 'har bir mahalla (OSM nomlari, aholisi 500 m ichidagi turar joylardan)' : 'eng xavfli zonalar',
      evakuatsiya_rejasi: H.routes.map(r => ({ id: r.id, qayerdan: r.from + (r.fromName ? ' (' + r.fromName + ')' : ''), qayerga: r.sh.id + ' ' + r.sh.name, odamlar: r.ppl, qism: r.part ? 'qolganlar (birinchi joy toʻldi)' : 'asosiy', uzunlik_m: r.len, piyoda_daqiqa: r.min, hammasi_chiqib_boʻlishi_daqiqa: r.totalMin, eng_tor_joy_m: r.narrowM, koʻchalar: r.streets, sigʻim_yetmaydi_kishi: r.over || undefined, zaxira_yoʻl: r.backup ? { id: r.id + 'z', uzunlik_m: r.backup.len, daqiqa: r.backup.min, koʻchalar: r.backup.streets } : 'yoʻq (muqobil koʻcha topilmadi)' })),
      jami: H.total,
      algoritm: 'Dijkstra (koʻcha tarmogʻi) + sigʻim boʻyicha taqsimot (eng yaqin juftliklar birinchi); zaxira yoʻl — asosiy koʻchalar 6 baravar qimmatlashtirilib qayta hisob; vaqt = piyoda 4 km/soat + eng tor joydan oʻtish 1.3 kishi/m/s',
      yoʻl_tanlash_qoidasi: 'keng koʻchalar afzal; 5+ qavatli binolar yonidan va tor koʻchalardan qochilgan (vayronalar)',
    };
    return {
      savol_doirasi: H.scope === 'area' ? 'FAQAT belgilangan hudud (foydalanuvchi xaritada chizgan)' : 'butun shahar',
      ogohlantirish: 'TAXMINIY: relyef SRTM ~30 m; suv chuqurligi — fizik model natijasi. Xaritada yoʻllar va baland joylar chizilgan.',
      evakuatsiya_yoʻllari: H.routes.map(r => ({ id: r.id, qayerdan: r.fromName, u_yerdagi_suv_sm: Math.round((r.fromD || 0) * 100), qayerga: r.to.id + ' ' + r.to.name, balandlik_farqi_m: r.up, uzunlik_m: r.len, piyoda_daqiqa: r.min, sayoz_suvdan_m: r.wetM, koʻchalar: r.streets, zaxira_yoʻl: r.backup ? { id: r.id + 'z', uzunlik_m: r.backup.len, daqiqa: r.backup.min } : 'yoʻq' })),
      baland_xavfsiz_joylar: H.targets.map(t => ({ id: t.id, nomi: t.name, balandlik_m: t.z, izoh: t.how })),
      shahar_eng_baland_quruq_joylari: H.high.map(h => ({ nomi: h.name, balandlik_m: h.z })),
      yoʻl_tanlash_qoidasi: '30 sm+ suvli koʻchalardan oʻtilmaydi; 3 m+ balandroq va quruq joygacha eng qisqa yoʻl',
    };
  }

  // AI ishlamasa ham toʻliq javob — hisob natijasidan matn (zilzila / suv / xizmatlar)
  function summary(H) {
    const F = NX.fmt, L = [];
    if (H.kind === 'quake') {
      const z = H.zones, area = H.scope === 'area';
      L.push(area ? `**${H.I} balli zilzilada belgilangan hududda** ~${F.int(H.tot.ppl)} kishi yashaydi; ~${F.int(H.tot.hp)} kishi ogʻir shikastlanishi mumkin boʻlgan binolarda (${F.int(H.tot.n)} bino, ${F.int(H.tot.A)} tasi past paxsa/gʻisht uy).`
        : `**${H.I} balli zilzilada eng koʻp zarar koʻradigan joylar** — xaritada qizil (${z.length} ta hudud).`);
      if (!area) L.push('', '**Xavfli hududlar**', ...z.map(x => `- **${x.id} ${x.name || ''}** — ~${F.int(x.hp)} kishi xavf ostida, ${x.n} bino (${x.A} past uy, ${x.tall} ta 5+ qavat)${x.crit.length ? '; ' + x.crit.slice(0, 2).join(', ') : ''}.`));
      if (H.routes.length) L.push('', '**Evakuatsiya rejasi**', ...H.routes.map(r => `- **${r.fromName || r.from}** (~${F.int(r.ppl)} kishi) → **${r.id}**: ${r.streets.length ? r.streets.join(' → ') + ', ' : ''}${F.int(r.len)} m, piyoda ~${r.min} daq., hammasi ~${r.totalMin} daq. → **${r.sh.id} ${r.sh.name}**${r.backup ? `; zaxira ${r.id}z (${F.int(r.backup.len)} m)` : ''}.`));
      const over = H.shelters.filter(x => x.assigned > x.cap);
      if (over.length) L.push('', `⚠️ Sigʻim yetmaydi: ${over.map(x => `${x.id} ${x.name} (${F.int(x.assigned)} / ${F.int(x.cap)})`).join(', ')} — qoʻshimcha yigʻilish joyi kerak.`);
      L.push('', '**Birinchi soatda**', '- Yashil yoʻllarni transportdan boʻshatish, yigʻilish joylariga tibbiy punkt va suv.', `- Avval tekshiriladi: ${(z[0] && z[0].crit.length ? z[0].crit.slice(0, 3).join(', ') : 'maktab, bogʻcha va shifoxonalar')}.`);
    } else if (H.kind === 'flood') {
      L.push(`**Suv bosgan koʻchalardan chiqish** — ${H.routes.length} ta yoʻl, xaritada yashil.`, '', ...H.routes.map(r => `- **${r.fromName || 'suvli koʻcha'}**${r.fromD ? ` (${Math.round(r.fromD * 100)} sm)` : ''} → **${r.id}**: ${r.streets.length ? r.streets.join(' → ') + ', ' : ''}${F.int(r.len)} m, ~${r.min} daq. → **${r.to.id} ${r.to.name}** (${r.to.z} m, ${r.up} m yuqori)${r.backup ? `; zaxira ${r.id}z` : ''}.`));
      if (H.high.length) L.push('', '**Eng baland quruq joylar**', ...H.high.map(h => `- ${h.name} — ${h.z} m`));
    } else if (H.kind === 'svc') {
      const S0 = SVC[H.svc];
      L.push(`**${S0.uz}: shahar koʻchalarining ${H.cover != null ? H.cover + '%' : '—'} iga ${S0.norm} daqiqada yetib boriladi** (${H.stations.length} ta stansiya).`);
      if (H.slow.length) L.push('', '**Uzoq hududlar**', ...H.slow.map(t => `- **${t.id} ${t.name || ''}** — ~${t.min} daq. (${t.st})`));
      if (H.route) L.push('', `**Yoʻl:** ${H.route.from.name || S0.uz} → ${H.route.to}: ${H.route.streets.join(' → ')}, ~${H.route.min} daq.`);
      if (H.slow.length) L.push('', `**Tavsiya:** ${H.slow[0].name || H.slow[0].id} atrofiga yangi post/stansiya.`);
    }
    return L.join('\n');
  }

  NX.hazard = { summary, intensity, openSpaces, services, responders, SVC, quake, flood, items, facts, vclass, heavy, _search: search };
})();
