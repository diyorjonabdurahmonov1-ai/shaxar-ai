/* City Jam — transport modeli (tarixiy markaz) dan tashqaridagi hudud uchun yangi qurilish yuklamasi.
   Butun shahar koʻchalar tarmogʻi (data/roads-samarqand.json) boʻyicha: hududdan eng yaqin asosiy yoʻllarga (trunk/primary/secondary)
   har tomonga eng tez yoʻl (Dijkstra, tezlik — yoʻl toifasidan, taxminiy), mashinalar yoʻllarga tortishish modeli (1/vaqt²) bilan taqsimlanadi.
   Yoʻl boʻyidagi maktab/bogʻcha, bekat, svetofor — data/pois-samarqand.json (OSM). Natija — taxminiy, joyida sanash bilan tekshiriladi. */
(function () {
  'use strict';
  const NX = window.NX, G = NX.geo;
  const SPEED = { trunk: 50, primary: 45, secondary: 40, tertiary: 30, unclassified: 25, residential: 20, living_street: 12, service: 10, pedestrian: 5 };   // km/soat
  const CAP = { trunk: 1600, primary: 1200, secondary: 900, tertiary: 700, unclassified: 500, residential: 400, living_street: 250, service: 200 };       // mashina/soat bir yoʻnalishda (taxminiy)
  const MAJOR = /^(trunk|primary|secondary)$/;
  const UZ = { trunk: 'magistral', primary: 'asosiy', secondary: 'ikkinchi darajali', tertiary: 'uchinchi darajali', residential: 'mahalla koʻchasi', living_street: 'tor mahalla koʻchasi', service: 'xizmat yoʻli', unclassified: 'oddiy koʻcha' };
  let poisP = null;
  const pois = () => poisP || (poisP = fetch('data/pois-samarqand.json').then(r => (r.ok ? r.json() : null)).catch(() => null));

  function graph(roads) {
    const nodes = new Map(), key = p => p[0].toFixed(5) + ',' + p[1].toFixed(5);
    const node = p => { const k = key(p); let n = nodes.get(k); if (!n) { n = { k, lat: p[0], lon: p[1], xy: G.xy(p[0], p[1]), e: [], major: false }; nodes.set(k, n); } return n; };
    roads.forEach(w => {
      const sp = SPEED[w.hw]; if (!sp || !w.ll) return;
      for (let i = 1; i < w.ll.length; i++) {
        const a = node(w.ll[i - 1]), b = node(w.ll[i]), L = Math.hypot(b.xy[0] - a.xy[0], b.xy[1] - a.xy[1]); if (L < 0.5) continue;
        const t = L / (sp / 3.6), e = { w, L, t };
        a.e.push(Object.assign({ n: b }, e)); b.e.push(Object.assign({ n: a }, e));
        if (MAJOR.test(w.hw)) a.major = b.major = true;
      }
    });
    return [...nodes.values()];
  }
  function dijkstra(src, maxT) {
    const dist = new Map([[src, 0]]), prev = new Map(), Q = [[0, src]], done = new Set();
    const push = x => { Q.push(x); let c = Q.length - 1; while (c) { const p = (c - 1) >> 1; if (Q[p][0] <= Q[c][0]) break; [Q[p], Q[c]] = [Q[c], Q[p]]; c = p; } };
    const pop = () => { const t = Q[0], l = Q.pop(); if (Q.length) { Q[0] = l; let c = 0; for (;;) { const a = 2 * c + 1, b = a + 1; let m = c; if (a < Q.length && Q[a][0] < Q[m][0]) m = a; if (b < Q.length && Q[b][0] < Q[m][0]) m = b; if (m === c) break; [Q[m], Q[c]] = [Q[c], Q[m]]; c = m; } } return t; };
    while (Q.length) {
      const [d, n] = pop(); if (done.has(n)) continue; done.add(n); if (d > maxT) break;
      n.e.forEach(e => { const nd = d + e.t; if (nd < (dist.get(e.n) ?? Infinity)) { dist.set(e.n, nd); prev.set(e.n, [n, e]); push([nd, e.n]); } });
    }
    return { dist, prev };
  }
  function path(prev, src, dst) { const P = [], E = []; let n = dst; while (n && n !== src) { const pe = prev.get(n); if (!pe) return null; P.push(n); E.push(pe[1]); n = pe[0]; } P.push(src); return { P: P.reverse(), E: E.reverse() }; }

  // Asosiy hisob: hudud markazi, eng koʻp yuklanish soatidagi qatnov (mashina/soat), roads (butun shahar)
  async function run(center, trips, roads) {
    const N = graph(roads), [cx, cy] = G.xy(center[0], center[1]);
    let src = null, bd = Infinity; N.forEach(n => { if (!n.e.length) return; const d = Math.hypot(n.xy[0] - cx, n.xy[1] - cy); if (d < bd) { bd = d; src = n; } });
    if (!src || bd > 600) return null;
    const { dist, prev } = dijkstra(src, 900);
    // Har tomondan (8 sektor) eng tez yetiladigan asosiy yoʻl tuguni
    const best = new Map();
    dist.forEach((t, n) => { if (!n.major) return; const a = Math.atan2(n.xy[0] - cx, n.xy[1] - cy), sec = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; const b = best.get(sec); if (!b || t < b.t) best.set(sec, { n, t }); });
    // Yoʻlida avval boshqa asosiy yoʻl uchrasa — bu alohida chiqish emas (oʻsha yoʻl orqali ketadi)
    let exits = [...best.values()].sort((a, b) => a.t - b.t).filter(x => { const pp = path(prev, src, x.n); return pp && !pp.P.slice(0, -1).some(n => n.major && n !== src); });
    // Bir xil asosiy yoʻlga chiqadiganlar birlashtiriladi; eng tez 4 tasi
    const seen = new Set(); exits = exits.filter(x => { const nm = (x.n.e.find(e => MAJOR.test(e.w.hw)) || {}).w; const k = (nm && nm.name) || x.n.k; if (seen.has(k)) return false; seen.add(k); x.road = nm; return true; }).slice(0, 4);
    if (!exits.length) return null;
    const wsum = exits.reduce((s, x) => s + 1 / Math.pow(Math.max(30, x.t), 2), 0);
    const P = await pois(), near = (arr, lat, lon, r) => (arr || []).filter(p => { const [px, py] = G.xy(p[0], p[1]), [qx, qy] = G.xy(lat, lon); return Math.hypot(px - qx, py - qy) <= r; });
    const segLoad = new Map(), routes = [];
    exits.forEach(x => {
      const pp = path(prev, src, x.n); if (!pp) return;
      const share = (1 / Math.pow(Math.max(30, x.t), 2)) / wsum, v = Math.round(trips * share);
      let L = 0; const streets = []; pp.E.forEach(e => { L += e.L; const k = e.w.name || UZ[e.w.hw] || e.w.hw; if (streets[streets.length - 1] !== k) streets.push(k); const sk = e.w.id + ':' + e.n.k; segLoad.set(e, (segLoad.get(e) || 0) + v); });
      const ll = pp.P.map(n => [n.lat, n.lon]);
      // yoʻl boʻyida (50 m) maktab/bogʻcha va tor koʻchalar; chiqish chorrahasi yonida (150 m) bekat va svetofor
      const schools = new Map(); ll.forEach((p, i) => { if (i % 2) return; ['school', 'kindergarten'].forEach(k => near(P && P[k], p[0], p[1], 60).forEach(s => schools.set(s[0] + ',' + s[1], { tur: k === 'school' ? 'maktab' : 'bogʻcha', nomi: s[2] || '', lat: s[0], lon: s[1] }))); });
      const narrow = [...new Set(pp.E.filter(e => /living_street|service/.test(e.w.hw)).map(e => e.w.name || UZ[e.w.hw]))];
      const minCap = Math.min(...pp.E.map(e => CAP[e.w.hw] || 400)), weak = pp.E.find(e => (CAP[e.w.hw] || 400) === minCap);
      routes.push({ ll, v, share, min: +(x.t / 60).toFixed(1), L: Math.round(L), streets: streets.slice(0, 6), exit: { lat: x.n.lat, lon: x.n.lon, yoʻl: (x.road && x.road.name) || UZ[(x.road || {}).hw] || 'asosiy yoʻl', tur: UZ[(x.road || {}).hw] },
        stops: [...new Set(near(P && P.stop, x.n.lat, x.n.lon, 200).map(s => s[2] || 'bekat'))], signal: near(P && P.signal, x.n.lat, x.n.lon, 80).length > 0, schools: [...schools.values()], narrow, weak: { koʻcha: weak.w.name || UZ[weak.w.hw], sigʻim: minCap, toʻlish_foiz: Math.round(v / minCap * 100) } });
    });
    return { src: [src.lat, src.lon], routes: routes.sort((a, b) => b.v - a.v), trips };
  }
  // Xarita belgilari: yoʻllar (qalinligi — mashina soni), chiqish chorrahalari, yoʻl boʻyidagi maktablar
  function items(R) {
    const out = [], col = r => (r.weak.toʻlish_foiz > 80 ? '#ef4444' : r.weak.toʻlish_foiz > 50 ? '#f59e0b' : '#22c55e');
    R.routes.forEach((r, i) => {
      out.push({ kind: 'line', style: 'seg', path: r.ll, w: Math.min(2.5, 0.8 + r.v / 60), color: col(r), lat: r.ll[Math.floor(r.ll.length / 2)][0], lon: r.ll[Math.floor(r.ll.length / 2)][1], id: 'Y' + (i + 1), title: `🚗 Y${i + 1}: +${r.v} mashina/soat → ${r.exit.yoʻl} (${Math.round(r.share * 100)}%)`, note: `${r.streets.join(' → ')}; ${r.L} m, ~${r.min} daqiqa. Eng tor joy: ${r.weak.koʻcha} (sigʻimi ~${r.weak.sigʻim}, toʻladi ${r.weak.toʻlish_foiz}%).` });
      out.push({ kind: 'point', id: 'C' + (i + 1), lat: r.exit.lat, lon: r.exit.lon, color: col(r), title: `⛳ C${i + 1}: ${r.exit.yoʻl}ga chiqish`, note: `${r.signal ? 'Svetofor bor (OSM). ' : 'Svetofor belgilanmagan. '}${r.stops.length ? 'Yaqin bekat: ' + r.stops.slice(0, 2).join(', ') + '.' : 'Yaqinda bekat belgilanmagan.'}` });
      r.schools.slice(0, 2).forEach(s => out.push({ kind: 'point', id: 'M', list: false, lat: s.lat, lon: s.lon, color: '#a855f7', title: `🏫 ${s.tur}${s.nomi ? ': ' + s.nomi : ''} — Y${i + 1} yoʻli boʻyida`, note: 'Bolalar xavfsizligi: oʻtish joyi, tezlik 20 km/soat' }));
    });
    return out;
  }
  function facts(R) {
    return {
      izoh: 'Hudud transport modeli (tarixiy markaz) dan tashqarida — yuklama butun shahar koʻchalar tarmogʻi boʻyicha alohida hisoblandi: eng tez yoʻl (yoʻl toifasi tezligi), taqsimot — tortishish modeli (1/vaqt²). Taxminiy; sigʻim — toifa boʻyicha odatiy qiymat.',
      ertalabki_soat_chiqadigan_mashina: R.trips,
      yoʻnalishlar: R.routes.map((r, i) => ({ id: 'Y' + (i + 1), qayerga: r.exit.yoʻl + (r.exit.tur && r.exit.tur !== r.exit.yoʻl ? ` (${r.exit.tur})` : ''), mashina_soat: r.v, ulush_foiz: Math.round(r.share * 100), koʻchalar: r.streets, uzunlik_m: r.L, vaqt_daqiqa: r.min, eng_tor_joy: r.weak, tor_koʻchalar: r.narrow, chiqishda_svetofor: r.signal, chiqish_yonida_bekatlar: r.stops, yoʻl_boʻyidagi_maktab_bogʻcha: r.schools.map(s => s.tur + (s.nomi ? ' ' + s.nomi : '')) })),
    };
  }
  NX.outload = { run, items, facts, pois };
})();
