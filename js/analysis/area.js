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
