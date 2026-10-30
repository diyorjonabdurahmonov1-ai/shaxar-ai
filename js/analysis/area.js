/* City Jam — xaritada erkin belgilangan hudud (mahalla) tahlili va “bu yerga bino qursak?” baholash.
   Hudud maʼlumotlari — OpenStreetMap (real); bino taʼsiri — ochiq farazlar asosidagi hisob va simulyatsiya (taxmin). */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;

  // Farazlar (oʻrtacha qiymatlar; panelda koʻrsatiladi va oʻzgartirish mumkin)
  const ASSUME = {
    perFlat: { v: 4, uz: 'Bir xonadonda odam', unit: 'kishi' },
    carsPerFlat: { v: 0.5, uz: 'Bir xonadonga mashina', unit: 'ta' },
    peakPerFlat: { v: 0.3, uz: 'Ertalabki tigʻiz soatda bir xonadondan safar', unit: 'mashina/soat' },
    schoolShare: { v: 0.18, uz: 'Aholida maktab yoshidagi bolalar ulushi', unit: '' },
    kgShare: { v: 0.08, uz: 'Aholida bogʻcha yoshidagi bolalar ulushi', unit: '' },
    flatArea: { v: 65, uz: 'Bir xonadon maydoni', unit: 'm²' },
  };

  function inside(poly, lat, lon) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ai, bi] = poly[i], [aj, bj] = poly[j];
      if ((ai > lat) !== (aj > lat) && lon < ((bj - bi) * (lat - ai)) / (aj - ai) + bi) c = !c;
    }
    return c;
  }

  function stats(M, poly) {
    const xy = poly.map(p => G.xy(p[0], p[1]));
    let A = 0, cx = 0, cy = 0;
    for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
      const f = xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
      A += f; cx += (xy[j][0] + xy[i][0]) * f; cy += (xy[j][1] + xy[i][1]) * f;
    }
    A /= 2;
    const c = Math.abs(A) > 1 ? [cx / (6 * A), cy / (6 * A)] : xy[0];
    const center = G.ll(c[0], c[1]);
    const inP = (lat, lon) => inside(poly, lat, lon);
    // Koʻchalar: har 20 m da nuqta, hudud ichidagi uzunlik
    const len = new Map();
    M.ways.forEach(w => { G.sample(w.xy, 20, (x, y) => { const ll = G.ll(x, y); if (inP(ll[0], ll[1])) len.set(w.street, (len.get(w.street) || 0) + 20); }); });
    const streets = [...len.entries()].map(([s, l]) => ({ s, name: M.streets[s].name, len: l })).sort((a, b) => b.len - a.len);
    const problems = M.problems.filter(p => inP(p.lat, p.lon));
    const stops = M.stops.filter(s => inP(s.lat, s.lon));
    const near = (arr, r) => arr.map(o => ({ o, d: G.d(c[0], c[1], o.x, o.y) })).filter(x => x.d <= r).sort((a, b) => a.d - b.d);
    const nearestStop = M.stops.reduce((b, s) => { const d = G.d(c[0], c[1], s.x, s.y); return d < b.d ? { s, d } : b; }, { s: null, d: Infinity });
    // Bekatdan 400 m qamrov: hudud ichidagi 40 m tarmoq nuqtalari
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    xy.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const step = Math.max(40, Math.sqrt(((x1 - x0) * (y1 - y0)) / 1500));
    let tot = 0, cov = 0;
    for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
      const ll = G.ll(x, y);
      if (!inP(ll[0], ll[1])) continue;
      tot++;
      let ok = false;
      M.stopGrid.near(x, y, 400, s => { if (!ok && G.d(x, y, s.x, s.y) <= 400) ok = true; });
      if (ok) cov++;
    }
    const lines = new Set();
    near(M.stops, 400).forEach(({ o }) => o.routes.forEach(i => lines.add(M.routes[i].label)));
    return {
      poly, center, areaHa: Math.abs(A) / 1e4,
      streets, streetKm: streets.reduce((t, s) => t + s.len, 0) / 1000,
      problems, stops: stops.length,
      signals: M.signals.filter(s => inP(s.lat, s.lon)).length,
      crossings: M.crossings.filter(s => inP(s.lat, s.lon)).length,
      schoolsIn: M.schools.filter(s => inP(s.lat, s.lon)),
      schoolsNear: near(M.schools, 500).map(x => ({ name: x.o.name, kind: x.o.kind, d: Math.round(x.d) })),
      nearestStop: nearestStop.s ? { name: nearestStop.s.name, d: Math.round(nearestStop.d) } : null,
      coverage: tot ? (cov / tot) * 100 : null,
      lines: [...lines].sort((a, b) => (parseInt(a, 10) || 1e9) - (parseInt(b, 10) || 1e9)),
      distCenter: Math.round(G.d(c[0], c[1], 0, 0)),
    };
  }

  // “500 xonadonli 9 qavatli dom” → { flats, floors }
  function parseBuild(q) {
    const n = String(q || '').toLowerCase().replace(/[’'ʻʼ`]/g, '');
    const flats = n.match(/(\d{2,5})\s*(ta\s*)?(xonadon|kvartira|honadon|oila|uy\b|xonali)/);
    const floors = n.match(/(\d{1,2})\s*(-?\s*)?(qavat|etaj|etj|etaj|qavatli)/);
    if (!flats && !floors && !/(dom|bino|uy-joy|uy joy|turar|qursa|qurilish|kvartal)/.test(n)) return null;
    return { flats: flats ? +flats[1] : null, floors: floors ? +floors[1] : null };
  }

  function buildFacts(spec, A) {
    const a = k => (A && A[k] != null ? A[k] : ASSUME[k].v);
    const flats = spec.flats, floors = Math.max(1, spec.floors);
    const residents = Math.round(flats * a('perFlat')), cars = Math.round(flats * a('carsPerFlat'));
    const gross = flats * a('flatArea') * 1.25;
    return {
      flats, floors, residents, cars, parking: cars,
      peak: Math.round(flats * a('peakPerFlat')), peakOut: Math.round(flats * a('peakPerFlat') * 0.7),
      pupils: Math.round(residents * a('schoolShare')), kids: Math.round(residents * a('kgShare')),
      gross: Math.round(gross), footprint: Math.round(gross / floors),
    };
  }

  // Yutuq va muammolar — faqat hisoblangan raqamlardan
  function assess(st, b, sim, fut) {
    const pros = [], cons = [], todo = [];
    const fmt = NX.fmt;
    pros.push(`${fmt.int(b.residents)} kishi uchun yangi uy-joy (${b.flats} xonadon).`);
    if (st.nearestStop && st.nearestStop.d <= 300) pros.push(`Avtobus bekati yaqin — ${st.nearestStop.d} m${st.lines.length ? ` (${st.lines.slice(0, 5).join(', ')})` : ''}. Aholining bir qismi jamoat transportida yuradi.`);
    else if (st.nearestStop) { cons.push(`Eng yaqin bekat ${st.nearestStop.d} m uzoqda — odamlar mashinaga koʻproq tayanadi.`); todo.push('Yaqin atrofga avtobus bekati qoʻyish yoki yoʻnalishni shu yerdan oʻtkazish.'); }
    else cons.push('Atrofda avtobus bekati topilmadi.');
    if (st.schoolsNear.length) pros.push(`500 m ichida ${st.schoolsNear.length} ta maktab/bogʻcha bor.`);
    else { cons.push('500 m ichida maktab yoki bogʻcha yoʻq.'); todo.push(`~${b.pupils} oʻquvchi va ~${b.kids} bogʻcha yoshidagi bola uchun joy rejalashtirish.`); }
    if (st.schoolsNear.length) cons.push(`~${b.pupils} yangi oʻquvchi va ~${b.kids} bogʻcha yoshidagi bola paydo boʻladi — yaqin maktablarda joy bormi, taʼlim boʻlimidan aniqlash kerak (sigʻim maʼlumoti saytda yoʻq).`);
    cons.push(`~${b.cars} ta mashina uchun turar joy kerak (hovlida yoki yer ostida), aks holda koʻcha chetlari band boʻladi.`);
    todo.push(`Kamida ${b.parking} ta avtoturargoh (yer osti yoki koʻp qavatli) loyihaga kiritish.`);
    if (sim) {
      const tt = sim.ttChangePct;
      if (tt > 2) cons.push(`Shahar boʻyicha yoʻlda yurish vaqti ${fmt.num(tt, 1)}% ga oshadi.`);
      else pros.push(`Shahar umumiy harakatiga taʼsiri kichik (${fmt.signed(tt, 1)}%).`);
      const up = sim.affected.filter(x => x.dv > 0 && x.name).slice(0, 4).map(x => x.name);
      if (up.length) cons.push(`Ertalab koʻproq yuklanadi: ${up.join(', ')}.`);
      if (sim.overloadedCount) { cons.push(`${sim.overloadedCount} ta koʻchaga mashinalar sigʻmay qoladi: ${sim.overloaded.slice(0, 4).map(x => x.name || 'nomsiz yoʻl').join(', ')}.`); todo.push('Bino chiqishini katta koʻchaga emas, ikkinchi darajali yoʻlga qaratish; chorrahada svetofor.'); }
      if (sim.build && sim.build.dist > 150) cons.push(`Eng yaqin yoʻl ${sim.build.dist} m uzoqda — kirish yoʻli qurish kerak.`);
    }
    // Yer osti va havo tarmoqlari (yuklangan xaritalar boʻyicha)
    (st.systems || []).forEach(x => {
      const T = NX.SYSTEMS[x.sys];
      if (x.sys === 'camera') { if (!x.points) todo.push('Hududda kamera yoʻq — kirish yoʻllariga kamera qoʻyish.'); return; }
      if (x.km > 0.01) { cons.push(`Hududdan ${fmt.num(x.km, 2)} km ${T.uz.toLowerCase()} liniyasi oʻtadi — qurilishda himoya zonasi; tegishli tashkilot bilan kelishish kerak.`); todo.push(`${T.uz}: liniyalarni koʻchirish yoki himoya zonasini loyihaga kiritish.`); }
      else if (isFinite(x.nearest) && x.nearest < 400) pros.push(`${T.uz}: eng yaqin liniya ${Math.round(x.nearest)} m da — ulanish oson.`);
      else if (isFinite(x.nearest)) cons.push(`${T.uz}: eng yaqin liniya ${fmt.km(x.nearest)} uzoqda — yangi tarmoq tortish kerak.`);
    });
    const jn = st.problems.filter(p => p.type === 'junction').length, sc = st.problems.filter(p => p.type === 'school').length;
    if (jn) { cons.push(`Hududda ${jn} ta svetoforsiz katta chorraha bor — yangi mashinalar shu yerlardan oʻtadi.`); todo.push('Svetoforsiz chorrahalarda oqimni sanash va svetofor qoʻyish.'); }
    if (sc) { cons.push(`${sc} ta maktab/bogʻcha oldida xavfsiz oʻtish yoʻq — bolalar soni ortadi.`); todo.push('Maktab oldiga koʻtarilgan piyoda oʻtish joyi va 30 km/soat belgisi.'); }
    if (b.floors >= 5 && st.distCenter < 2000) cons.push(`Tarixiy markazga (Registon) ${fmt.km(st.distCenter)} — UNESCO himoya hududida qavatlar soniga cheklov boʻlishi mumkin. Madaniy meros boshqarmasidan tekshirish kerak.`);
    const future = [];
    if (fut) {
      future.push(`5 yildan keyin (shahar oqimi +15%) yoʻlda yurish vaqti ${fmt.signed(fut.ttChangePct, 1)}% oʻzgaradi.`);
      if (fut.overloadedCount) future.push(`Unda ${fut.overloadedCount} ta koʻcha sigʻmay qoladi: ${fut.overloaded.slice(0, 5).map(x => x.name || 'nomsiz yoʻl').join(', ')}.`);
      else future.push('Unda ham koʻchalar oqimni koʻtaradi.');
    }
    return { pros, cons, todo, future };
  }

  NX.area = { ASSUME, inside, stats, parseBuild, buildFacts, assess };
})();

/* Xaritada koʻrsatiladigan tavsiyalar uchun REAL nomzod joylar (AI faqat shulardan tanlaydi):
   P — hududdagi muammolar, C — berk koʻchani eng yaqin koʻchaga ulash (yangi yoʻl), L — boʻsh/qurilish yerlari (OSM), S — asosiy koʻchalar. */
(function () {
  'use strict';
  const NX = window.NX, G = NX.geo;
  async function candidates(M, st) {
    const poly = st.poly, inP = (la, lo) => NX.area.inside(poly, la, lo), out = { P: [], C: [], L: [], S: [] };
    st.problems.slice(0, 12).forEach((p, i) => out.P.push({ id: 'P' + (i + 1), lat: p.lat, lon: p.lon, nima: NX.PROBLEM[p.type].short, joy: p.title }));
    // Berk koʻchalar: faqat bitta yoʻlga tegishli va way oxiri boʻlgan tugunlar
    const deg = new Map();
    M.ways.forEach(w => w.nodes.forEach((n, k) => deg.set(n, (deg.get(n) || 0) + (k === 0 || k === w.nodes.length - 1 ? 1 : 2))));
    const ends = [];
    M.ways.forEach(w => [0, w.nodes.length - 1].forEach(k => { const ll = w.ll[k]; if (deg.get(w.nodes[k]) === 1 && inP(ll[0], ll[1])) ends.push({ w, ll, xy: w.xy[k] }); }));
    ends.slice(0, 40).forEach(e => {
      let best = null;
      M.ways.forEach(w2 => { if (w2.street === e.w.street) return; for (let i = 1; i < w2.xy.length; i++) { const a = w2.xy[i - 1], b = w2.xy[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1; let t = ((e.xy[0] - a[0]) * dx + (e.xy[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0] - e.xy[0], q[1] - e.xy[1]); if (d > 15 && d < 250 && (!best || d < best.d)) best = { d, q, name: M.streets[w2.street].name }; } });
      if (best) out.C.push({ id: 'C' + (out.C.length + 1), from: e.ll, to: G.ll(best.q[0], best.q[1]), uzunlik_m: Math.round(best.d), qaysi: `${M.streets[e.w.street].name || 'nomsiz yoʻl'} → ${best.name || 'nomsiz yoʻl'}` });
    });
    out.C = out.C.sort((a, b) => a.uzunlik_m - b.uzunlik_m).slice(0, 10).map((c, i) => Object.assign(c, { id: 'C' + (i + 1) }));
    st.streets.filter(s => s.name).slice(0, 8).forEach((s, i) => { const S = M.streets[s.s]; out.S.push({ id: 'S' + (i + 1), lat: S.center[0], lon: S.center[1], nomi: s.name, turi: NX.HW[S.hw].uz }); });
    // Boʻsh yerlar — OpenStreetMap (hudud chegarasi boʻyicha)
    try {
      let s = 90, w = 180, n = -90, e = -180; poly.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
      const q = `[out:json][timeout:25];(way["landuse"~"^(grass|meadow|brownfield|greenfield|construction|vacant|farmland|orchard|allotments)$"](${s},${w},${n},${e});way["building"="construction"](${s},${w},${n},${e}););out tags geom qt;`;
      const r = await Promise.any(NX.config.overpassMirrors.map(url => NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 30000).then(x => { if (x.ok && x.data && x.data.elements) return x.data.elements; throw new Error(); })));
      r.filter(el => el.geometry && el.geometry.length > 3).map(el => {
        const xy = el.geometry.map(g => G.xy(g.lat, g.lon)); let A = 0, cx = 0, cy = 0;
        for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) { const f = xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1]; A += f; cx += (xy[j][0] + xy[i][0]) * f; cy += (xy[j][1] + xy[i][1]) * f; }
        A /= 2; if (Math.abs(A) < 400) return null;
        const c = G.ll(cx / (6 * A), cy / (6 * A)), t = el.tags || {};
        return inP(c[0], c[1]) ? { lat: c[0], lon: c[1], turi: LAND_UZ[t.landuse] || (t.building ? 'qurilish maydoni' : 'yer'), maydon_m2: Math.round(Math.abs(A)), nomi: t.name || '' } : null;
      }).filter(Boolean).sort((a, b) => b.maydon_m2 - a.maydon_m2).slice(0, 10).forEach((l, i) => out.L.push(Object.assign({ id: 'L' + (i + 1) }, l)));
    } catch (e) { /* boʻsh yer maʼlumoti olinmadi */ }
    return out;
  }
  const LAND_UZ = { grass: 'maysazor', meadow: 'ochiq yer', brownfield: 'boʻshagan sanoat yeri', greenfield: 'qurilmagan yer', construction: 'qurilish maydoni', vacant: 'boʻsh yer', farmland: 'ekin yeri', orchard: 'bogʻ (mevali)', allotments: 'tomorqa' };

  // ---------- “Bu yerga nima qursam foydali?” — xizmatlar qamrovi meʼyorga nisbatan ----------
  // Xizmat koʻrsatish radiusi (SNiP 2.07.01-89 / ShNQ 2.07.01-03 asosida, mikrorayon uchun), 1000 aholiga sigʻim va kerakli yer
  const NEEDS = [
    { k: 'kindergarten', uz: 'Bogʻcha', icon: '🧒', r: 300, per1000: 55, perUnit: 'oʻrin', landM2: 2500, q: 'amenity=kindergarten' },
    { k: 'school', uz: 'Maktab', icon: '🏫', r: 500, per1000: 120, perUnit: 'oʻquvchi oʻrni', landM2: 15000, q: 'amenity=school' },
    { k: 'clinic', uz: 'Poliklinika / oilaviy shifokor punkti', icon: '🏥', r: 1000, landM2: 2000, q: 'amenity~clinic|doctors|hospital' },
    { k: 'pharmacy', uz: 'Dorixona', icon: '💊', r: 500, landM2: 0, q: 'amenity=pharmacy' },
    { k: 'shop', uz: 'Kundalik oziq-ovqat doʻkoni', icon: '🛒', r: 500, landM2: 0, q: 'shop~supermarket|convenience|greengrocer|marketplace' },
    { k: 'playground', uz: 'Bolalar maydonchasi', icon: '🛝', r: 300, landM2: 300, q: 'leisure=playground' },
    { k: 'park', uz: 'Sayr joyi / xiyobon', icon: '🌳', r: 800, landM2: 5000, q: 'leisure~park|garden' },
    { k: 'sport', uz: 'Sport maydoni', icon: '⚽', r: 800, landM2: 800, q: 'leisure~pitch|sports_centre|stadium' },
    { k: 'stop', uz: 'Jamoat transporti bekati', icon: '🚏', r: 500, landM2: 0 },
  ];
  const kindOf = t => (t.amenity === 'kindergarten' ? 'kindergarten' : t.amenity === 'school' ? 'school' : /^(clinic|doctors|hospital)$/.test(t.amenity) ? 'clinic' : t.amenity === 'pharmacy' ? 'pharmacy' : t.shop || t.amenity === 'marketplace' ? 'shop' : t.leisure === 'playground' ? 'playground' : /^(park|garden)$/.test(t.leisure) ? 'park' : /^(pitch|sports_centre|stadium)$/.test(t.leisure) ? 'sport' : null);
  async function needs(M, st) {
    const poly = st.poly, inP = (la, lo) => NX.area.inside(poly, la, lo);
    let s = 90, w = 180, n = -90, e = -180; poly.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
    const pad = 0.011, bb = `${s - pad},${w - pad * 1.3},${n + pad},${e + pad * 1.3}`;
    const q = `[out:json][timeout:25];(nwr["amenity"~"^(kindergarten|school|clinic|doctors|hospital|pharmacy|marketplace)$"](${bb});nwr["shop"~"^(supermarket|convenience|greengrocer)$"](${bb});nwr["leisure"~"^(playground|park|garden|pitch|sports_centre|stadium)$"](${bb}););out tags center qt;`;
    const els = await Promise.any(NX.config.overpassMirrors.map(url => NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 30000).then(x => { if (x.ok && x.data && x.data.elements) return x.data.elements; throw new Error(); })));
    const pts = {}; NEEDS.forEach(d => { pts[d.k] = []; });
    els.forEach(el => { const t = el.tags || {}, k = kindOf(t), la = el.lat != null ? el.lat : el.center && el.center.lat, lo = el.lon != null ? el.lon : el.center && el.center.lon; if (!k || la == null) return; const [x, y] = G.xy(la, lo); pts[k].push({ lat: la, lon: lo, x, y, name: t['name:uz'] || t.name || '' }); });
    M.stops.forEach(o => pts.stop.push({ lat: o.lat, lon: o.lon, x: o.x, y: o.y, name: o.name || '' }));
    // Aholi: hududdagi turar joy binolari (OSM), boʻlmasa — maydon × 120 kishi/ga (oʻrtacha zichlik)
    const blds = (NX.buildings.get() || []).filter(b => inP(b.c[0], b.c[1]));
    const RES = /^(house|detached|residential|apartments|yes|terrace|semidetached_house|dormitory)$/;
    const resid = blds.filter(b => RES.test(b.kind));
    const pop = resid.length ? Math.round(resid.reduce((t, b) => t + (b.area * b.levels * 0.8) / 25, 0)) : Math.round(st.areaHa * 120);
    // Qamrov: hudud ichidagi turar joylar (boʻlmasa — tarmoq nuqtalari) necha foizi meʼyoriy radiusda
    let homes = resid.map(b => G.xy(b.c[0], b.c[1]));
    if (homes.length < 5) { const xy = poly.map(p => G.xy(p[0], p[1])); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; xy.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }); homes = []; for (let x = x0 + 20; x < x1; x += 40) for (let y = y0 + 20; y < y1; y += 40) { const ll = G.ll(x, y); if (inP(ll[0], ll[1])) homes.push([x, y]); } }
    const [cx, cy] = G.xy(st.center[0], st.center[1]);
    const list = NEEDS.map(d => {
      const P = pts[d.k];
      const covered = homes.filter(h => P.some(p => Math.hypot(p.x - h[0], p.y - h[1]) <= d.r)).length;
      const near = P.map(p => ({ p, d: Math.hypot(p.x - cx, p.y - cy) })).sort((a, b) => a.d - b.d)[0];
      return { k: d.k, uz: d.uz, icon: d.icon, meyor_radius_m: d.r, qamrov_foiz: homes.length ? Math.round(covered / homes.length * 100) : null, hudud_ichida: P.filter(p => inP(p.lat, p.lon)).length,
        eng_yaqini: near ? { m: Math.round(near.d), nomi: near.p.name, lat: near.p.lat, lon: near.p.lon } : null, kerak_orin: d.per1000 ? Math.round(pop * d.per1000 / 1000) : null, birlik: d.perUnit || null, kerakli_yer_m2: d.landM2 };
    });
    // Ustuvorlik: qamrov past va meʼyordan uzoq boʻlganlar birinchi
    const gap = x => (x.qamrov_foiz == null ? 50 : 100 - x.qamrov_foiz) + (x.eng_yaqini ? Math.max(0, x.eng_yaqini.m / x.meyor_radius_m - 1) * 20 : 40);
    list.forEach(x => { x.yetishmovchilik = Math.round(gap(x)); });
    list.sort((a, b) => b.yetishmovchilik - a.yetishmovchilik);
    return { aholi: pop, aholi_manba: resid.length ? `OSM binolari (${resid.length} ta turar joy)` : 'maydon × oʻrtacha zichlik', list };
  }
  // Mos yer: xizmatga kerakli maydonga sigʻadigan eng yaqin boʻsh yer (L) — har yer bitta xizmatga
  function matchSites(nd, cand) {
    const L = ((cand && cand.L) || []).slice(), used = new Set(), out = [];
    nd.list.filter(x => x.yetishmovchilik >= 30).forEach(x => {
      if (!x.kerakli_yer_m2) { out.push({ need: x, site: null }); return; }
      const site = L.filter(l => !used.has(l.id) && l.maydon_m2 >= x.kerakli_yer_m2 * 0.8).sort((a, b) => a.maydon_m2 - b.maydon_m2)[0];
      if (site) used.add(site.id);
      out.push({ need: x, site: site || null });
    });
    return out;
  }
  NX.area.needs = needs;
  NX.area.matchSites = matchSites;
  NX.area.NEEDS = NEEDS;
  NX.area.NEED_Q = /nima\s*qur|nima\s*quril|nima\s*qo[ʻ'‘`]?y|nima\s*och|nima\s*yetishma|yetishmay|nima\s*kerak|qanday\s*obyekt|foydali|ehtiyoj|nima\s*bo[ʻ'‘`]?lsa/i;

  // AI javobi oxiridagi ```json {"belgilar":[...]} ``` — nomzod id lari boʻyicha xaritadagi belgilarga
  function actionsFrom(text, cand) {
    const m = String(text || '').match(/```(?:json)?\s*(\{[\s\S]*?"belgilar"[\s\S]*?\})\s*```/);
    if (!m) return { text, actions: [] };
    let j = null; try { j = JSON.parse(m[1]); } catch (e) { j = null; }
    const all = {}; Object.values(cand || {}).forEach(arr => arr.forEach(c => { all[c.id] = c; }));
    const actions = ((j && j.belgilar) || []).map(b => { const c = all[String(b.id || '').toUpperCase()]; if (!c) return null; return c.from ? { kind: 'line', from: c.from, to: c.to, title: b.nima || 'Yangi yoʻl', note: b.izoh || c.qaysi, id: c.id } : { kind: 'point', lat: c.lat, lon: c.lon, title: b.nima || c.nima || c.nomi || 'Tavsiya', note: b.izoh || '', id: c.id }; }).filter(Boolean).slice(0, 12);
    return { text: text.replace(m[0], '').trim(), actions };
  }
  NX.area.candidates = candidates;
  NX.area.actionsFrom = actionsFrom;
})();
