/* City Jam — koʻcha auditi: 🚗 avtomobil, 🚶 piyoda, ♿ nogironligi bor odamlar uchun qulaylik.
   Maʼlumot (ochiq manbalar, hammasi real; boʻlmasa — “maʼlumot yoʻq” deb aytiladi, “yoʻq” deb emas):
   • koʻcha geometriyasi, sinfi, tezlik cheklovi, qoplama — Overture/OSM (data/roads-samarqand.json);
   • trotuar, piyoda yoʻlagi, oʻtish joyi, zinapoya — Overture/OSM (data/walk-samarqand.json);
   • bordyur (pastlatilgan), taktil plitka, svetofor, oʻtish joyi tugunlari, avtoturargoh — OSM (Overpass, brauzerda);
   • qiyalik — relyef (yer sathi modeli, 40 m);
   • Mapillary: koʻcha suratlaridan avtomatik aniqlangan zebra, svetofor, belgilar; suratlar AI’ga koʻrsatiladi.
   Meʼyorlar (taxminiy, ShNQ 2.07.01-03 va xalqaro amaliyot): oʻtish joylari oraligʻi ≤ 300 m (asosiy koʻcha),
   maktab/shifoxona/bekat yonida ≤ 60 m; boʻylama qiyalik ≤ 5% (aravacha), 8% dan ortigʻi — juda qiyin; trotuar kengligi ≥ 1.5–2 m. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;
  const ROAD_W = { trunk: 22, primary: 20, secondary: 16, tertiary: 12, unclassified: 9, residential: 8, living_street: 6 };
  const DEF_SPEED = { trunk: 70, primary: 70, secondary: 60, tertiary: 60, unclassified: 50, residential: 40, living_street: 20 };
  const MAIN = /trunk|primary|secondary|tertiary/;
  const SF_UZ = ['nomaʼlum', 'asfalt/beton', 'tosh plitka', 'qoplamasiz (shagʻal, tuproq)'];

  // ---------- Maʼlumotlar ----------
  let walkP = null;
  function walk() {
    if (walkP) return walkP;
    walkP = fetch('data/walk-samarqand.json').then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) return [];
      const S = d.scale, [lon0, lat0] = d.base;
      return d.fw.map(a => { let x = a[2], y = a[3]; const pts = [[lat0 + y / S, lon0 + x / S]]; for (let k = 4; k < a.length; k += 2) { x += a[k]; y += a[k + 1]; pts.push([lat0 + y / S, lon0 + x / S]); } return { kind: a[0], width: a[1], pts }; });
    }).catch(() => []);
    return walkP;
  }
  // OSM tugunlari (bordyur, plitka, oʻtish, svetofor) va avtoturargohlar — koʻcha atrofida (brauzerda Overpass)
  async function osmNodes(bb) {
    const k = 'an:' + bb.map(v => v.toFixed(3)).join(','), hit = NX.store.get(k, null);
    if (hit && Date.now() - hit.ts < 7 * 86400e3) return hit.list;
    const b = bb.join(',');
    const q = `[out:json][timeout:25];(node["highway"~"^(crossing|traffic_signals)$"](${b});node["kerb"](${b});node["tactile_paving"](${b});nwr["amenity"="parking"](${b});way["highway"]["sidewalk"](${b}););out tags center qt;`;
    for (const url of NX.config.overpassMirrors) {
      try {
        const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 25000);
        if (!r.ok || !r.data || !r.data.elements) continue;
        const list = r.data.elements.map(e => ({ t: e.tags || {}, c: e.lat != null ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null, type: e.type })).filter(e => e.c);
        try { NX.store.set(k, { ts: Date.now(), list }); } catch (e) { /* */ }
        return list;
      } catch (e) { /* keyingi */ }
    }
    return null;
  }

  // Yirik koʻchalar (magistral–3-darajali) tugunlari: koordinata → koʻcha nomlari (bir marta hisoblanadi)
  const jCache = new WeakMap();
  function junctions(roads) {
    if (jCache.has(roads)) return jCache.get(roads);
    const m = new Map();
    roads.forEach(w => { if (!MAIN.test(w.hw || '') || !w.ll) return; const nm = coreName(w.name) || ('#' + w.id); w.ll.forEach(p => { const k = p[0].toFixed(5) + ',' + p[1].toFixed(5); let v = m.get(k); if (!v) m.set(k, (v = new Set())); v.add(nm); }); });
    jCache.set(roads, m);
    return m;
  }
  // ---------- Geometriya ----------
  const xy = p => G.xy(p[0], p[1]);
  function grid(lines, cell) {
    const g = new Map();
    lines.forEach((l, li) => l.pts.forEach((p, i) => { if (!i) return; const a = xy(l.pts[i - 1]), b = xy(p); const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / cell)); for (let t = 0; t <= n; t++) { const x = a[0] + (b[0] - a[0]) * t / n, y = a[1] + (b[1] - a[1]) * t / n, k = Math.floor(x / cell) + ':' + Math.floor(y / cell); const v = g.get(k) || []; v.push({ li, a, b }); g.set(k, v); } }));
    return (p, r) => { const [x, y] = xy(p); let best = Infinity, bl = null; const c = Math.ceil(r / cell); for (let di = -c; di <= c; di++) for (let dj = -c; dj <= c; dj++) (g.get((Math.floor(x / cell) + di) + ':' + (Math.floor(y / cell) + dj)) || []).forEach(s => { const d = G.segDist(x, y, s.a[0], s.a[1], s.b[0], s.b[1]); if (d < best) { best = d; bl = s.li; } }); return best <= r ? { d: best, li: bl } : null; };
  }
  // Koʻchani bir chiziqqa: segmentlar boʻyicha 20 m da namunalar (masofa, nuqta, sinf, tezlik, qoplama)
  function samples(ways, step) {
    const out = []; let acc = 0;
    ways.forEach(w => { for (let i = 1; i < w.ll.length; i++) { const a = xy(w.ll[i - 1]), b = xy(w.ll[i]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step)); for (let t = 0; t < n; t++) { const ll = G.ll(a[0] + (b[0] - a[0]) * (t + 0.5) / n, a[1] + (b[1] - a[1]) * (t + 0.5) / n); out.push({ p: ll, s: acc + L * (t + 0.5) / n, w, seg: [w.ll[i - 1], w.ll[i]] }); } acc += L; } });
    return { list: out, L: acc };
  }

  // ---------- Asosiy audit ----------
  // o: { name, roads, D (yer sathi 40 m), M (sayt modeli), blds, stops }
  async function audit(o) {
    const nm = t => String(t || '').toLowerCase().replace(/[ʻ'‘’`ʼ]/g, '').replace(/[-–]/g, ' ');
    const core = t => nm(t).replace(/\s+(kochasi|shoh kochasi|tor kochasi|yoli|mavzesi|massivi|berk kochasi)\b.*$/, '').replace(/\s+/g, ' ').trim();
    const want = core(o.name);
    const ways = o.ways || (o.roads || []).filter(w => { const c = core(w.name); return c && want && (c === want || c.includes(want) || want.includes(c)); });
    if (!ways.length) return { notFound: true, asked: o.name };
    const name = ways[0].name;
    const S0 = samples(ways, 20), L = Math.round(S0.list.length * 20);
    let s = 90, w = 180, n = -90, e = -180; ways.forEach(x => x.ll.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }));
    const bb = [s - 0.0012, w - 0.0015, n + 0.0012, e + 0.0015];
    const [wk, osm] = await Promise.all([walk(), o.lite ? null : Promise.race([osmNodes(bb), NX.sleep(26000).then(() => null)])]);
    const inBB = p => p[0] >= bb[0] && p[0] <= bb[2] && p[1] >= bb[1] && p[1] <= bb[3];
    // Sinf, tezlik, qoplama (uzunlik boʻyicha)
    const byLen = f => { const m = new Map(); ways.forEach(x => { let l = 0; for (let i = 1; i < x.ll.length; i++) { const a = xy(x.ll[i - 1]), b = xy(x.ll[i]); l += Math.hypot(b[0] - a[0], b[1] - a[1]); } const k = f(x); m.set(k, (m.get(k) || 0) + l); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const hw = byLen(x => x.hw)[0][0], main = MAIN.test(hw);
    const spd = byLen(x => x.sp || 0), spKnown = spd.find(x => x[0] > 0), speed = spKnown ? spKnown[0] : DEF_SPEED[hw] || 60;
    const sfd = byLen(x => x.sf || 0), sfKnownLen = sfd.filter(x => x[0] > 0).reduce((t, x) => t + x[1], 0), unpaved = sfd.filter(x => x[0] === 3).reduce((t, x) => t + x[1], 0);
    // Trotuar dalili: OSM trotuar/piyoda yoʻlagi 18 m ichida yoki koʻchada sidewalk teg
    if (!wk._near) { wk._near = grid(wk.filter(x => x.kind !== 'crosswalk'), 40); wk._cross = wk.filter(x => x.kind === 'crosswalk').map(x => x.pts[Math.floor(x.pts.length / 2)]); wk._steps = wk.filter(x => x.kind === 'steps'); }
    const near = wk._near;
    let swHit = 0; S0.list.forEach(q => { if (near(q.p, 18)) swHit++; });
    const tagSw = osm ? osm.filter(x => x.type === 'way' && x.t.sidewalk && core(x.t.name || x.t['name:uz']) === core(name)) : [];
    const swTag = tagSw.length ? tagSw.map(x => x.t.sidewalk) : [];
    const swNo = swTag.filter(v => v === 'no' || v === 'none').length, swYes = swTag.filter(v => /both|left|right|separate|yes/.test(v)).length;
    const swCov = S0.list.length ? Math.round(swHit / S0.list.length * 100) : 0;
    // Oʻtish joylari: OSM chiziq (crosswalk) + tugunlar + sayt modeli; koʻcha boʻylab joylashuvi
    const crossPts = [];
    wk._cross.filter(inBB).forEach(c => crossPts.push({ c, src: 'OSM chiziq' }));
    if (osm) osm.filter(x => x.type === 'node' && (x.t.highway === 'crossing' || x.t.crossing)).forEach(x => crossPts.push({ c: x.c, src: 'OSM', sig: x.t.crossing === 'traffic_signals', kerb: x.t.kerb, tact: x.t.tactile_paving }));
    ((o.M && o.M.crossings) || []).forEach(x => { const c = [x.lat, x.lon]; if (inBB(c)) crossPts.push({ c, src: 'model' }); });
    const onStreet = p => { const [x, y] = xy(p); let best = null; S0.list.forEach(q => { const [qx, qy] = xy(q.p), d = Math.hypot(qx - x, qy - y); if (d < 25 && (!best || d < best.d)) best = { d, s: q.s, q }; }); return best; };
    // Svetoforlar (OSM tugunlari va sayt modeli) — svetoforli joyda piyoda oʻtishi bor deb hisoblanadi
    if (osm) osm.filter(x => x.t.highway === 'traffic_signals').forEach(x => crossPts.push({ c: x.c, src: 'svetofor', sig: true }));
    ((o.M && o.M.signals) || []).forEach(x => { const c = [x.lat, x.lon]; if (inBB(c)) crossPts.push({ c, src: 'svetofor', sig: true }); });
    // Yirik koʻchalar kesishgan chorrahalar — odamlar shu yerda kesib oʻtadi (oʻtish imkoniyati sifatida hisoblanadi, yangi taklif qoʻyilmaydi)
    const J = junctions(o.roads || ways), myCore = coreName(name);
    ways.forEach(w => w.ll.forEach(p => { if (!inBB(p)) return; const v = J.get(p[0].toFixed(5) + ',' + p[1].toFixed(5)); if (v && [...v].some(nm => nm !== myCore)) crossPts.push({ c: p, src: 'chorraha', junc: true }); }));
    (o.extraCross || []).forEach(c => crossPts.push(c));
    const cr = []; crossPts.forEach(c => { const h = onStreet(c.c); if (h && !cr.some(x => Math.abs(x.s - h.s) < 25)) cr.push(Object.assign({}, c, { s: h.s })); });
    cr.sort((a, b) => a.s - b.s);
    const gaps = []; let prev = 0; cr.concat([{ s: S0.L, end: true }]).forEach(c => { gaps.push({ from: prev, to: c.s, len: c.s - prev }); prev = c.s; });
    const maxGap = Math.round(Math.max(0, ...gaps.map(g => g.len)));
    // Bordyur va taktil plitka (oʻtish joylari yonida, OSM)
    const kerbNodes = osm ? osm.filter(x => x.t.kerb || x.t.tactile_paving).filter(x => onStreet(x.c)) : [];
    const kerbLow = kerbNodes.filter(x => /lowered|flush/.test(x.t.kerb || '')).length, kerbRaised = kerbNodes.filter(x => /raised|regular|rolled/.test(x.t.kerb || '')).length;
    const tactYes = kerbNodes.filter(x => x.t.tactile_paving === 'yes').length, tactNo = kerbNodes.filter(x => x.t.tactile_paving === 'no').length;
    const sigNodes = osm ? osm.filter(x => x.t.highway === 'traffic_signals' && onStreet(x.c)).length : o.M && o.M.signals ? o.M.signals.filter(x => inBB([x.lat, x.lon]) && onStreet([x.lat, x.lon])).length : null;
    const parking = osm ? osm.filter(x => x.t.amenity === 'parking').length : null;
    // Zinapoyalar (piyoda yoʻlagida) 30 m ichida
    const steps = wk._steps.filter(x => x.pts.some(p => inBB(p) && onStreet(p))).map(x => x.pts[Math.floor(x.pts.length / 2)]);
    // Qiyalik (yer sathi, 40 m): har namuna uchun ±30 m da balandlik farqi
    let steep5 = 0, steep8 = 0, maxSlope = 0; const steepSegs = [];
    if (o.D) {
      const D = o.D, zAt = p => { const [x, y] = xy(p), i = Math.floor((x - D.x0) / D.step), j = Math.floor((y - D.y0) / D.step); return i < 0 || j < 0 || i >= D.nx || j >= D.ny ? NaN : D.z[j * D.nx + i]; };
      const zs = S0.list.map(q => zAt(q.p));
      for (let i = 0; i < S0.list.length; i++) {
        const a = Math.max(0, i - 5), b = Math.min(S0.list.length - 1, i + 5), dz = zs[b] - zs[a], ds = S0.list[b].s - S0.list[a].s;
        if (!isFinite(dz) || ds < 120) continue;   // ≥ 120 m oraliq: relyef (~30 m) shovqini kamayadi
        const sl = Math.abs(dz / ds) * 100; maxSlope = Math.max(maxSlope, sl);
        if (sl > 5) { steep5++; steepSegs.push({ seg: S0.list[i].seg, sl }); } if (sl > 8) steep8++;
      }
    }
    // Muhim joylar: maktab/bogʻcha/shifoxona (binolar) va bekatlar — oʻtish joyi 60 m ichida bormi
    const pois = [];
    const blds = o.blds || []; if (!blds._poi) blds._poi = blds.filter(b => /school|kindergarten|hospital|clinic/.test(b.kind));
    blds._poi.filter(b => inBB(b.c)).forEach(b => { const h = onStreet(b.c); if (h || (() => { const [x, y] = xy(b.c); return S0.list.some(q => { const [qx, qy] = xy(q.p); return Math.hypot(qx - x, qy - y) < 60; }); })()) { const hh = h || (() => { const [x, y] = xy(b.c); let best = null; S0.list.forEach(q => { const [qx, qy] = xy(q.p), d = Math.hypot(qx - x, qy - y); if (!best || d < best.d) best = { d, s: q.s, q }; }); return best; })(); pois.push({ kind: { school: 'maktab', kindergarten: 'bogʻcha', hospital: 'shifoxona', clinic: 'poliklinika' }[b.kind], name: b.name || '', s: hh.s, p: hh.q.p }); } });
    ((o.M && o.M.stops) || []).forEach(st => { if (!inBB([st.lat, st.lon])) return; const h = onStreet([st.lat, st.lon]); if (h) pois.push({ kind: 'bekat', name: st.name || '', s: h.s, p: h.q.p }); });
    const poiUniq = []; pois.sort((a, b) => a.s - b.s).forEach(p => { if (!poiUniq.some(q => q.kind === p.kind && Math.abs(q.s - p.s) < 80)) poiUniq.push(p); });
    const poiNoCross = poiUniq.filter(p => !cr.some(c => Math.abs(c.s - p.s) <= 60));
    // Taklif qilinadigan yangi oʻtish joylari: muhim joylar oldida + katta oraliqlar oʻrtasida (asosiy koʻchada > 300 m)
    const at = sv => { let best = S0.list[0]; S0.list.forEach(q => { if (Math.abs(q.s - sv) < Math.abs(best.s - sv)) best = q; }); return best.p; };
    const proposals = [];
    poiNoCross.slice(0, 6).forEach(p => proposals.push({ s: p.s, p: p.p, why: `${p.kind}${p.name ? ' “' + p.name + '”' : ''} oldida oʻtish joyi yoʻq` }));
    // Mavjud oʻtish joyi / svetofor / chorrahadan 120 m ichida yangi oʻtish joyi taklif qilinmaydi
    if (main) gaps.filter(g => g.len > 300).forEach(g => { const k = Math.floor(g.len / 300); for (let j = 1; j <= k && proposals.length < 10; j++) { const sv = g.from + g.len * j / (k + 1); if (!proposals.some(x => Math.abs(x.s - sv) < 120)) proposals.push({ s: sv, p: at(sv), why: `${Math.round(g.len)} m oraliqda oʻtish joyi yoʻq (meʼyor ≤ 300 m)` }); } });
    for (let i = proposals.length - 1; i >= 0; i--) if (cr.some(c => Math.abs(c.s - proposals[i].s) < 120)) proposals.splice(i, 1);
    proposals.sort((a, b) => a.s - b.s);
    // Ballar (0–100); maʼlumot yoʻq boʻlsa — jarima yarmi, “?” bilan
    const pct = (a, b) => (b ? a / b : 0);
    const steepShare = pct(steep5, S0.list.length), steep8Share = pct(steep8, S0.list.length);
    const car = Math.round(Math.max(0, 100 - pct(unpaved, Math.max(1, S0.L)) * 60 - (main && sigNodes === 0 && cr.length < 2 ? 10 : 0) - (poiUniq.some(p => /maktab|bogʻcha/.test(p.kind)) && speed > 40 ? 15 : 0)));
    const swScore = swNo ? 0 : swYes || swCov >= 60 ? 1 : swCov >= 20 ? 0.6 : 0.5;  // 0.5 — maʼlumot yoʻq
    const ped = Math.round(100 * (0.35 * swScore + 0.35 * (main ? Math.max(0, 1 - Math.max(0, maxGap - 300) / 600) : Math.max(0.5, 1 - Math.max(0, maxGap - 500) / 800)) + 0.3 * (poiUniq.length ? 1 - poiNoCross.length / poiUniq.length : 1)));
    const kerbScore = kerbLow + kerbRaised ? kerbLow / (kerbLow + kerbRaised) : 0.5, tactScore = tactYes + tactNo ? tactYes / (tactYes + tactNo) : 0.4;
    const acc = Math.round(100 * (0.35 * (1 - Math.min(1, steepShare * 1.5 + steep8Share)) + 0.25 * kerbScore + 0.15 * tactScore + 0.1 * (steps.length ? Math.max(0, 1 - steps.length / 4) : 1) + 0.15 * swScore));
    // Muammolar va yechimlar
    const issues = [], fixes = [];
    if (unpaved > 30) { issues.push({ cat: 'car', t: `${F(unpaved)} m qoplamasiz` }); fixes.push({ cat: 'car', t: `${F(unpaved)} m asfalt qoplash`, q: Math.round(unpaved) }); }
    if (poiUniq.some(p => /maktab|bogʻcha/.test(p.kind)) && speed > 40) { issues.push({ cat: 'car', t: `maktab/bogʻcha yonida tezlik ${speed} km/soat` }); fixes.push({ cat: 'car', t: 'maktab yonida 30–40 km/soat cheklov, “Bolalar” belgisi va sunʼiy notekislik' }); }
    if (proposals.length) { issues.push({ cat: 'ped', t: `${proposals.length} joyda oʻtish joyi yetishmasligi mumkin (ochiq xarita boʻyicha)` }); fixes.push({ cat: 'ped', t: `${proposals.length} ta yangi piyoda oʻtish joyi (zebra + pastlatilgan bordyur + taktil plitka)${main ? ', asosiy koʻchada — svetofor yoki orol bilan' : ''}` }); }
    if (swNo) { issues.push({ cat: 'ped', t: `OSM boʻyicha ${swNo} ta qismda trotuar yoʻq` }); fixes.push({ cat: 'ped', t: 'trotuar qurish (kenglik ≥ 2 m, tekis, toʻsiqsiz)' }); }
    else if (swCov < 20 && !swYes) issues.push({ cat: 'ped', t: 'trotuar haqida ochiq maʼlumot yoʻq — suratlar boʻyicha tekshiriladi' });
    if (steep5) { issues.push({ cat: 'acc', t: `${F(steep5 * 20)} m qismda qiyalik 5% dan katta (eng koʻpi ~${maxSlope.toFixed(1)}%)` }); fixes.push({ cat: 'acc', t: `qiya qismlarda har 30 m da dam olish maydonchasi, tutqichlar; ${steep8 ? '8% dan qiya joylarda muqobil yoʻl yoki lift/pandus' : 'pandus qiyaligi ≤ 5%'}` }); }
    if (kerbRaised) { issues.push({ cat: 'acc', t: `${kerbRaised} ta oʻtish joyida baland bordyur` }); fixes.push({ cat: 'acc', t: `${kerbRaised} ta joyda bordyurni pastlatish (≤ 1.5 sm)` }); }
    if (!(kerbLow + kerbRaised)) issues.push({ cat: 'acc', t: 'bordyur va taktil plitka haqida ochiq maʼlumot yoʻq — suratlar boʻyicha tekshiriladi' });
    if (steps.length) { issues.push({ cat: 'acc', t: `${steps.length} ta zinapoya (aravacha oʻta olmaydi)` }); fixes.push({ cat: 'acc', t: `${steps.length} ta zinapoya yoniga pandus` }); }
    return {
      name, hw, main, L: Math.round(S0.L), width: ROAD_W[hw] || 8, speed, speedKnown: !!spKnown, surface: sfKnownLen ? SF_UZ[sfd.find(x => x[0] > 0)[0]] : 'nomaʼlum', unpaved: Math.round(unpaved),
      swCov, swYes, swNo, crossings: cr, gaps, maxGap, kerbLow, kerbRaised, tactYes, tactNo, signals: sigNodes, parking, steps, steep5: steep5 * 20, steep8: steep8 * 20, maxSlope: +maxSlope.toFixed(1), steepSegs,
      pois: poiUniq, poiNoCross, proposals, scores: { car, ped, acc }, issues, fixes, osmOk: !!osm, ways, samplePts: S0.list.filter((q, i) => i % Math.max(1, Math.floor(S0.list.length / 4)) === 0).slice(0, 4).map(q => q.p),
    };
  }
  const F = v => NX.fmt.int(v);

  // Mapillary: suratlardan aniqlangan obyektlar (zebra, svetofor, belgilar) va suratlar — koʻcha boʻylab 4 nuqtada
  async function mapillary(A) {
    if (!(NX.mly && NX.mly.available())) return null;
    const det = { crosswalk: 0, light: 0, ped_sign: 0, speed_sign: 0, other: 0 }, photos = [];
    for (const p of A.samplePts) {
      try {
        const [ft, ph] = await Promise.all([Promise.race([NX.mly.features(p[0], p[1], 70), NX.sleep(10000).then(() => [])]), Promise.race([NX.mly.photos(p[0], p[1], 60), NX.sleep(10000).then(() => [])])]);
        (ft || []).forEach(f => { const v = f.v || ''; if (/crosswalk/.test(v)) det.crosswalk++; else if (/traffic-light/.test(v)) det.light++; else if (/pedestrian/.test(v)) det.ped_sign++; else if (/maximum-speed|speed-limit/.test(v)) det.speed_sign++; else det.other++; });
        if (ph && ph[0] && !photos.some(x => x.id === ph[0].id)) photos.push({ id: ph[0].id, url: ph[0].url, link: NX.mly.link(ph[0].id), date: ph[0].date, d: Math.round(ph[0].d), at: p });
      } catch (e) { /* surat boʻlmasa ham */ }
    }
    return { det, photos };
  }

  // Taklif qilingan har bir yangi oʻtish joyini real suratlar bilan tekshirish: 60 m ichida Mapillary zebra yoki svetofor
  // aniqlagan boʻlsa — taklif olib tashlanadi (u yerda allaqachon bor). A.proposals oʻzgaradi, olib tashlanganlar A.dropped da
  async function verifyProposals(A) {
    if (!(NX.mly && NX.mly.available()) || !A.proposals.length) return A;
    const keep = [], dropped = [];
    for (const p of A.proposals) {
      let ft = [];
      try { ft = await Promise.race([NX.mly.features(p.p[0], p.p[1], 60), NX.sleep(8000).then(() => [])]); } catch (e) { ft = []; }
      const hit = (ft || []).find(f => /crosswalk|pedestrians-crossing|traffic-light/.test(f.v || '') && f.d <= 60);
      if (hit) dropped.push(Object.assign({}, p, { why2: /traffic-light/.test(hit.v) ? 'suratlarda svetofor bor' : 'suratlarda zebra bor', d: Math.round(hit.d) }));
      else keep.push(p);
    }
    A.proposals = keep; A.dropped = dropped;
    if (dropped.length) {
      A.issues = A.issues.map(x => (/oʻtish joyi yetishmasligi/.test(x.t) ? (keep.length ? Object.assign({}, x, { t: `${keep.length} joyda oʻtish joyi yetishmasligi mumkin (ochiq xarita boʻyicha)` }) : null) : x)).filter(Boolean);
      A.fixes = A.fixes.map(x => (/yangi piyoda oʻtish joyi/.test(x.t) ? (keep.length ? Object.assign({}, x, { t: x.t.replace(/^\d+/, keep.length) }) : null) : x)).filter(Boolean);
    }
    return A;
  }
  // ---------- Xarita ----------
  function items(A) {
    const out = [];
    // Koʻcha: qiyaligi 5%+ qismlar — toʻq sariq/qizil, qolgani — balliga qarab rang
    const col = A.scores.ped >= 70 && A.scores.acc >= 70 ? '#22c55e' : A.scores.ped >= 45 ? '#facc15' : '#f97316';
    A.ways.forEach((w, i) => out.push({ kind: 'line', style: 'seg', id: 'K' + i, path: w.ll, lat: w.ll[0][0], lon: w.ll[0][1], color: col, list: false, title: `🛣 ${A.name}`, note: '' }));
    A.steepSegs.forEach((x, i) => out.push({ kind: 'line', style: 'seg', id: 'Q' + i, path: x.seg, lat: x.seg[0][0], lon: x.seg[0][1], color: x.sl > 8 ? '#ef4444' : '#fb923c', list: false, title: `♿ Qiyalik ~${x.sl.toFixed(1)}%`, note: x.sl > 8 ? 'aravacha uchun juda qiyin' : 'aravacha uchun qiyin (> 5%)' }));
    A.crossings.forEach((c, i) => out.push({ kind: 'point', id: 'O' + (i + 1), lat: c.c[0], lon: c.c[1], color: c.kerb && /lowered|flush/.test(c.kerb) ? '#22c55e' : '#e2e8f0', list: false, title: c.junc ? '🔀 Yirik chorraha (oʻtish imkoniyati)' : `🚸 Mavjud oʻtish joyi${c.sig ? ' (svetofor)' : ''}`, note: c.kerb ? `bordyur: ${c.kerb}` : 'bordyur haqida maʼlumot yoʻq' }));
    A.proposals.forEach((p, i) => out.push({ kind: 'point', id: 'P' + (i + 1), lat: p.p[0], lon: p.p[1], color: '#a855f7', title: `➕ P${i + 1}: yangi oʻtish joyi (nomzod)`, note: `${p.why}. Real surat va panoramada tekshiring. Zebra + pastlatilgan bordyur + taktil plitka${A.main ? ' + svetofor/orol' : ''}.` }));
    A.steps.forEach((p, i) => out.push({ kind: 'point', id: 'Z' + (i + 1), lat: p[0], lon: p[1], color: '#ef4444', title: `⛔ Z${i + 1}: zinapoya`, note: 'Aravacha oʻta olmaydi — yoniga pandus kerak.' }));
    A.poiNoCross.slice(0, 6).forEach((p, i) => out.push({ kind: 'point', id: 'M' + (i + 1), lat: p.p[0], lon: p.p[1], color: '#f59e0b', list: false, title: `🏫 ${p.kind}${p.name ? ' ' + p.name : ''}`, note: '60 m ichida oʻtish joyi yoʻq' }));
    return out;
  }
  function facts(A, ml, vis) {
    return {
      koʻcha: A.name, sinfi: A.hw, uzunlik_m: A.L, qatnov_qismi_kengligi_m_taxminiy: A.width,
      ballar_100dan: { avtomobil: A.scores.car, piyoda: A.scores.ped, nogironlar_uchun: A.scores.acc },
      avtomobil: { tezlik_km_soat: A.speed, tezlik_manba: A.speedKnown ? 'OSM belgisi' : 'belgi yoʻq — shahar meʼyori', qoplama: A.surface, qoplamasiz_m: A.unpaved, svetoforlar_osm: A.signals, avtoturargohlar_atrofda_osm: A.parking },
      piyoda: { trotuar_osm: A.swNo ? `${A.swNo} qismda “yoʻq” deb belgilangan` : A.swYes ? `${A.swYes} qismda bor` : `trotuar/piyoda yoʻlagi 18 m ichida — uzunlikning ${A.swCov}% i (OSM toʻliq emas)`, oʻtish_joylari: A.crossings.length, eng_katta_oraliq_m: A.maxGap, meyor_m: A.main ? 300 : 500, muhim_joylar: A.pois.map(p => p.kind + (p.name ? ' ' + p.name : '')), oʻtish_joyi_yoʻq_muhim_joylar: A.poiNoCross.map(p => p.kind + (p.name ? ' ' + p.name : '')) },
      nogironlar: { qiyalik_5foizdan_m: A.steep5, qiyalik_8foizdan_m: A.steep8, eng_katta_qiyalik_foiz: A.maxSlope, qiyalik_izoh: 'relyef ~30 m boʻyicha taxminiy (≥120 m oraliqda oʻrtacha)', pastlatilgan_bordyur: A.kerbLow, baland_bordyur: A.kerbRaised, taktil_plitka_bor: A.tactYes, taktil_plitka_yoʻq: A.tactNo, zinapoyalar: A.steps.length, izoh: A.kerbLow + A.kerbRaised ? null : 'bordyur/plitka OSM’da belgilanmagan' },
      suratlardan_aniqlangan_mapillary: ml ? ml.det : 'Mapillary ulanmagan',
      ai_suratlar_tahlili: vis || null,
      muammolar: A.issues.map(x => ({ soha: { car: 'avtomobil', ped: 'piyoda', acc: 'nogironlar' }[x.cat], muammo: x.t })),
      yechimlar: A.fixes.map(x => ({ soha: { car: 'avtomobil', ped: 'piyoda', acc: 'nogironlar' }[x.cat], nima: x.t })),
      yangi_oʻtish_joylari: A.proposals.map((p, i) => ({ belgi: 'P' + (i + 1), sabab: p.why, holat: 'nomzod — joyida tekshirish kerak' })),
      suratlar_bilan_olib_tashlangan_takliflar: (A.dropped || []).map(p => `${p.why} — lekin ${p.why2} (${p.d} m)`),
      mavjud_oʻtish_imkoniyatlari: { zebra_osm: A.crossings.filter(c => /OSM|model/.test(c.src)).length, svetofor: A.crossings.filter(c => c.sig).length, yirik_chorrahalar: A.crossings.filter(c => c.junc).length },
      maʼlumot_holati: A.osmOk ? 'OSM tugunlari olindi' : 'OSM serveri javob bermadi — bordyur/svetofor/turargoh maʼlumotisiz',
      ogohlantirish: 'OSM’da trotuar va bordyur toʻliq chizilmagan: “maʼlumot yoʻq” — “yoʻq” degani emas. Suratlar boʻyicha tekshiruv va joyida koʻrik tavsiya etiladi.',
    };
  }
  function summary(A, ml, vis) {
    const sc = A.scores, bar = v => (v >= 70 ? '🟢' : v >= 45 ? '🟡' : '🔴');
    const L = [`**${A.name}** — ${F(A.L)} m: ${bar(sc.car)} avtomobil ${sc.car}/100 · ${bar(sc.ped)} piyoda ${sc.ped}/100 · ${bar(sc.acc)} nogironlar ${sc.acc}/100.`];
    L.push('', '**🚗 Avtomobil**', `- Tezlik ${A.speed} km/soat (${A.speedKnown ? 'belgi' : 'belgi yoʻq, shahar meʼyori'}), qoplama: ${A.surface}${A.unpaved ? `, ${F(A.unpaved)} m qoplamasiz` : ''}${A.signals != null ? `, svetofor ${A.signals}` : ''}${A.parking != null ? `, atrofda ${A.parking} ta turargoh` : ''}.`);
    L.push('', '**🚶 Piyoda**', `- Oʻtish imkoniyatlari: ${A.crossings.length} ta (zebra ${A.crossings.filter(c => !c.sig && !c.junc).length}, svetofor ${A.crossings.filter(c => c.sig).length}, yirik chorraha ${A.crossings.filter(c => c.junc).length}), eng katta oraliq ${F(A.maxGap)} m (meʼyor ≤ ${A.main ? 300 : 500} m).`, ...(A.dropped && A.dropped.length ? [`- Suratlar bilan tekshirildi: ${A.dropped.length} ta taklif olib tashlandi (${A.dropped.map(p => p.why2).join(', ')}).`] : []), `- Trotuar: ${A.swNo ? `${A.swNo} qismda yoʻq` : A.swYes ? 'bor (OSM)' : `ochiq maʼlumot ${A.swCov}% (to‘liq emas)`}.`, A.poiNoCross.length ? `- Oʻtish joyi yoʻq muhim joylar: ${A.poiNoCross.map(p => p.kind + (p.name ? ' ' + p.name : '')).join(', ')}.` : '- Maktab, bekat va shifoxonalar yonida oʻtish joyi bor yoki ular yoʻq.');
    L.push('', '**♿ Nogironlar uchun**', `- Qiyalik (taxminiy): ${A.steep5 ? `${F(A.steep5)} m da 5% dan katta (eng koʻpi ~${A.maxSlope}%)` : '5% dan oshmaydi'}.`, `- Bordyur: ${A.kerbLow + A.kerbRaised ? `${A.kerbLow} ta pastlatilgan, ${A.kerbRaised} ta baland` : 'maʼlumot yoʻq'}; taktil plitka: ${A.tactYes + A.tactNo ? `${A.tactYes} bor / ${A.tactNo} yoʻq` : 'maʼlumot yoʻq'}; zinapoya: ${A.steps.length}.`);
    if (ml) L.push('', `**📷 Suratlardan (Mapillary):** zebra ${ml.det.crosswalk}, svetofor ${ml.det.light}, piyoda belgisi ${ml.det.ped_sign}, tezlik belgisi ${ml.det.speed_sign}.`);
    if (vis && vis.length) L.push('', '**🤖 Suratlar tahlili**', ...vis.map(v => `- ${v}`));
    if (A.fixes.length) L.push('', '**Nima qilish kerak**', ...A.fixes.map((f, i) => `- ${i + 1}. ${{ car: '🚗', ped: '🚶', acc: '♿' }[f.cat]} ${f.t}`));
    if (A.proposals.length) L.push('', `Xaritada: ➕ P1–P${A.proposals.length} — yangi oʻtish joylari, ⛔ — zinapoya, toʻq sariq/qizil — qiya qismlar, 🚸 — mavjud oʻtish joylari.`);
    return L.join('\n');
  }
  // Koʻndalang kesim sxemasi: trotuar | qatnov qismi (polosalar) | trotuar; belgilar ✓/✗/?
  function svg(A) {
    const W = 560, H = 190, lanes = Math.max(1, Math.round(A.width / 3.5)), E = NX.esc;
    const sw = A.swNo ? '✗' : A.swYes || A.swCov >= 60 ? '✓' : '?', kerb = A.kerbLow + A.kerbRaised ? (A.kerbRaised ? '✗' : '✓') : '?';
    const tot = A.width + 6, sx = m => 30 + (m / tot) * (W - 60);
    const laneLines = Array.from({ length: lanes - 1 }, (_, i) => { const x = sx(3 + (A.width / lanes) * (i + 1)); return `<line x1="${x}" y1="98" x2="${x}" y2="142" stroke="#f8fafc" stroke-width="2" stroke-dasharray="10 9"><animate attributeName="stroke-dashoffset" from="0" to="38" dur="1.6s" repeatCount="indefinite"/></line>`; }).join('');
    const ok = v => (v === '✓' ? '#22c55e' : v === '✗' ? '#ef4444' : '#94a3b8');
    return `<svg class="fix-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" rx="12" fill="#06101f"/>
      <text x="16" y="20" fill="#5eead4" font-size="13" font-weight="700">${E(A.name)} — koʻndalang kesim (taxminiy)</text>
      <rect x="${sx(0)}" y="92" width="${sx(3) - sx(0)}" height="56" fill="#57534e"/><rect x="${sx(3 + A.width)}" y="92" width="${sx(tot) - sx(3 + A.width)}" height="56" fill="#57534e"/>
      <rect x="${sx(3)}" y="96" width="${sx(3 + A.width) - sx(3)}" height="48" fill="#1f2937"/>${laneLines}
      <text x="${(sx(3) + sx(3 + A.width)) / 2}" y="168" fill="#cbd5e1" font-size="11" text-anchor="middle">${lanes} polosa · ~${A.width} m · ${A.speed} km/soat · ${E(A.surface)}</text>
      <text x="${(sx(0) + sx(3)) / 2}" y="84" fill="${ok(sw)}" font-size="16" text-anchor="middle">${sw}</text><text x="${(sx(0) + sx(3)) / 2}" y="168" fill="#94a3b8" font-size="10" text-anchor="middle">trotuar</text>
      <text x="${(sx(3 + A.width) + sx(tot)) / 2}" y="84" fill="${ok(sw)}" font-size="16" text-anchor="middle">${sw}</text><text x="${(sx(3 + A.width) + sx(tot)) / 2}" y="168" fill="#94a3b8" font-size="10" text-anchor="middle">trotuar</text>
      <text x="${sx(3)}" y="84" fill="${ok(kerb)}" font-size="12" text-anchor="middle">♿${kerb}</text><text x="${sx(3 + A.width)}" y="84" fill="${ok(kerb)}" font-size="12" text-anchor="middle">♿${kerb}</text>
      <text x="16" y="44" fill="#e2e8f0" font-size="12">🚗 ${A.scores.car}/100   🚶 ${A.scores.ped}/100   ♿ ${A.scores.acc}/100</text>
      <text x="16" y="62" fill="#94a3b8" font-size="10">✓ bor · ✗ yoʻq · ? ochiq maʼlumot yoʻq · oʻtish joylari: ${A.crossings.length}, eng katta oraliq ${F(A.maxGap)} m · qiyalik maks. ${A.maxSlope}%</text>
    </svg>`;
  }

  // ---------- Shahar / hudud boʻyicha reyting: eng muammoli koʻchalar ----------
  const nm0 = t => String(t || '').toLowerCase().replace(/[ʻ'‘’`ʼ]/g, '').replace(/[-–]/g, ' ');
  const coreName = t => nm0(t).replace(/\s+(kochasi|shoh kochasi|tor kochasi|yoli|mavzesi|massivi|berk kochasi)\b.*$/, '').replace(/\s+/g, ' ').trim();
  const lenM = ll => { let l = 0; for (let i = 1; i < ll.length; i++) { const a = xy(ll[i - 1]), b = xy(ll[i]); l += Math.hypot(b[0] - a[0], b[1] - a[1]); } return l; };
  const FOCUS_UZ = { car: '🚗 avtomobil', ped: '🚶 piyoda', acc: '♿ nogironlar', all: 'umumiy' };
  // o: { roads, D, M, blds, poly (hudud), focus: car|ped|acc|null }
  async function rank(o) {
    const inP = o.poly ? p => NX.area.inside(o.poly, p[0], p[1]) : null, groups = new Map();
    (o.roads || []).forEach(w => {
      if (!w.name || !ROAD_W[w.hw] || !w.ll || w.ll.length < 2) return;
      let ll = w.ll;
      if (inP) { ll = w.ll.filter(inP); if (ll.length < 2) return; } else if (!MAIN.test(w.hw)) return;
      const k = coreName(w.name); if (!k) return;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(ll === w.ll ? w : Object.assign({}, w, { ll }));
    });
    const out = []; let i = 0;
    for (const ways of groups.values()) {
      const L = ways.reduce((t, w) => t + lenM(w.ll), 0);
      if (L < (inP ? 80 : 300)) continue;
      if (++i % 15 === 0) await NX.sleep(0);
      const A = await audit({ ways, D: o.D, M: o.M, blds: o.blds, lite: true });
      if (A && !A.notFound) out.push(A);
      if (out.length >= 220) break;
    }
    const f = o.focus || 'all', sc = A => (f === 'all' ? Math.round((A.scores.car + A.scores.ped + A.scores.acc) / 3) : A.scores[f]);
    out.forEach(A => { A.score = sc(A); });
    out.sort((a, b) => a.score - b.score || b.L - a.L);
    const km = out.reduce((t, A) => t + A.L, 0) / 1000;
    return { list: out, focus: f, area: !!inP, n: out.length, km: +km.toFixed(1), avg: out.length ? Math.round(out.reduce((t, A) => t + A.score, 0) / out.length) : 0,
      tot: { proposals: out.reduce((t, A) => t + A.proposals.length, 0), steps: out.reduce((t, A) => t + A.steps.length, 0), steepM: out.reduce((t, A) => t + A.steep5, 0), unpavedM: out.reduce((t, A) => t + A.unpaved, 0), poiNoCross: out.reduce((t, A) => t + A.poiNoCross.length, 0) } };
  }
  const scoreCol = v => (v >= 70 ? '#22c55e' : v >= 45 ? '#facc15' : v >= 25 ? '#f97316' : '#ef4444');
  const topIssue = (A, f) => { const l = A.issues.filter(x => f === 'all' || x.cat === f); return (l[0] || A.issues[0] || { t: 'jiddiy muammo topilmadi' }).t; };
  function rankItems(Rk) {
    const out = [], worst = Rk.list.slice(0, 10);
    // Barcha tekshirilgan koʻchalar — balliga qarab rang (yashil → qizil); eng yomon 10 tasi raqamli
    Rk.list.forEach((A, j) => A.ways.forEach((w, k) => out.push({ kind: 'line', style: 'seg', id: 'S' + j + '_' + k, path: w.ll, lat: w.ll[0][0], lon: w.ll[0][1], color: scoreCol(A.score), w: j < 10 ? 1 : 0.6, list: false, title: `${A.name} — ${A.score}/100`, note: '' })));
    worst.forEach((A, j) => { const mid = A.samplePts[Math.min(1, A.samplePts.length - 1)] || A.ways[0].ll[0]; out.push({ kind: 'point', id: String(j + 1), lat: mid[0], lon: mid[1], color: scoreCol(A.score), title: `${j + 1}. ${A.name} — ${FOCUS_UZ[Rk.focus]} ${A.score}/100`, note: `🚗 ${A.scores.car} · 🚶 ${A.scores.ped} · ♿ ${A.scores.acc}. ${topIssue(A, Rk.focus)}.`, street: A.name }); });
    // Eng yomon 5 koʻchada taklif qilinadigan oʻtish joylari va zinapoyalar — mayda nuqtalar
    worst.slice(0, 5).forEach((A, j) => { A.proposals.slice(0, 4).forEach((p, k) => out.push({ kind: 'point', id: `P${j + 1}.${k + 1}`, lat: p.p[0], lon: p.p[1], color: '#a855f7', list: false, title: `➕ Yangi oʻtish joyi — ${A.name}`, note: p.why })); A.steps.forEach((p, k) => out.push({ kind: 'point', id: `Z${j + 1}.${k + 1}`, lat: p[0], lon: p[1], color: '#ef4444', list: false, title: `⛔ Zinapoya — ${A.name}`, note: 'yoniga pandus kerak' })); });
    return out;
  }
  function rankFacts(Rk) {
    return {
      rejim: Rk.area ? 'belgilangan hudud koʻchalari' : 'shahar asosiy koʻchalari (magistral, 1–3-darajali)', yonalish: FOCUS_UZ[Rk.focus], tekshirilgan_koʻchalar: Rk.n, jami_km: Rk.km, ortacha_ball: Rk.avg,
      eng_muammoli_koʻchalar_xaritadagi_raqam_bilan: Rk.list.slice(0, 10).map((A, j) => ({ raqam: j + 1, koʻcha: A.name, uzunlik_m: A.L, ball: A.score, avtomobil: A.scores.car, piyoda: A.scores.ped, nogironlar: A.scores.acc, oʻtish_joylari: A.crossings.length, eng_katta_oraliq_m: A.maxGap, qiyalik_5foizdan_m: A.steep5, qoplamasiz_m: A.unpaved, oʻtish_joyi_yoʻq_muhim_joylar: A.poiNoCross.map(p => p.kind + (p.name ? ' ' + p.name : '')), muammolar: A.issues.map(x => x.t), yechimlar: A.fixes.map(x => x.t) })),
      eng_yaxshi_koʻchalar: Rk.list.slice(-3).reverse().map(A => ({ koʻcha: A.name, ball: A.score })),
      jami: { oʻtish_joyi_nomzodlari_tekshirish_kerak: Rk.tot.proposals, zinapoyalar: Rk.tot.steps, qiya_qismlar_m: Rk.tot.steepM, qoplamasiz_m: Rk.tot.unpavedM, oʻtish_joyi_yoʻq_maktab_bekat_shifoxona: Rk.tot.poiNoCross },
      ogohlantirish: 'Tezkor reyting statik ochiq maʼlumot (OSM/Overture, relyef) boʻyicha; bordyur, taktil plitka va suratlar bitta koʻcha tanlanganda tekshiriladi. “Maʼlumot yoʻq” — “yoʻq” degani emas.',
    };
  }
  function rankSummary(Rk) {
    const bar = v => (v >= 70 ? '🟢' : v >= 45 ? '🟡' : v >= 25 ? '🟠' : '🔴');
    const L = [`**${Rk.area ? 'Belgilangan hudud' : 'Shahar asosiy koʻchalari'} — ${FOCUS_UZ[Rk.focus]} boʻyicha:** ${Rk.n} ta koʻcha (${Rk.km} km), oʻrtacha ${Rk.avg}/100.`, '', '**Eng muammoli koʻchalar** (xaritadagi raqamlar):'];
    Rk.list.slice(0, 10).forEach((A, j) => L.push(`- ${j + 1}. ${bar(A.score)} **${A.name}** — ${A.score}/100 (🚗 ${A.scores.car} · 🚶 ${A.scores.ped} · ♿ ${A.scores.acc}): ${topIssue(A, Rk.focus)}.`));
    L.push('', `**Jami:** ${Rk.tot.proposals} ta nomzod joyda oʻtish joyi yetishmasligi mumkin (joyida/suratda tekshirish kerak), ${F(Rk.tot.steepM)} m qiya (> 5%) qism, ${Rk.tot.steps} ta zinapoya, ${F(Rk.tot.unpavedM)} m qoplamasiz yoʻl, ${Rk.tot.poiNoCross} ta maktab/bekat/shifoxona oldida oʻtish joyi yoʻq.`);
    L.push('', 'Batafsil tekshiruv (suratlar, bordyur, taktil plitka) uchun koʻcha nomini yozing: masalan “' + (Rk.list[0] ? Rk.list[0].name : 'Registon koʻchasi') + ' piyodalar va nogironlar uchun qulaymi?”');
    return L.join('\n');
  }

  // AI suratlar tahlili (JSON) → qisqa qatorlar
  function visLines(v) {
    if (!v) return null;
    const lab = { trotuar: 'trotuar', trotuar_holati: 'trotuar holati', qoplama: 'yoʻl qoplamasi', pandus_pastlatilgan_bordyur: 'pandus / pastlatilgan bordyur', zebra: 'zebra' }, L = [];
    Object.keys(lab).forEach(k => { if (v[k] && v[k] !== 'noaniq') L.push(`${lab[k]}: ${v[k]}`); });
    const ob = v['toʻsiqlar'] || v.tosiqlar; if (ob && !/^yo/i.test(ob)) L.push('toʻsiqlar: ' + ob);
    (Array.isArray(v.kuzatuvlar) ? v.kuzatuvlar : []).slice(0, 4).forEach(x => L.push(String(x)));
    return L.length ? L : null;
  }
  NX.audit = { verifyProposals, visLines, audit, rank, rankItems, rankFacts, rankSummary, scoreCol, mapillary, items, facts, summary, svg, walk, coreName, FOCUS_UZ };
})();
