/* City Jam — OSM maʼlumotidan koʻcha/yoʻnalish modeli, muammolar va koʻrsatkichlar */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;

  const R = {
    stopToStreet: 30, signalToStreet: 12, crossingToStreet: 12, schoolToStreet: 150,
    routeToStreet: 15, routeMinSamples: 4, routeSampleStep: 15,
    cell: 250, coverage: 400, spacingMax: 900,
    junctionMerge: 35, junctionSignal: 60, schoolSafe: 150, crossingsPerKm: 2, congestion: 30,
  };
  NX.RULES = R;

  // Har bir muammo turi: oddiy tilda tushuntirish (what), yechim (fix) va birlik narxi (cost, soʻm, taxminiy)
  NX.PROBLEM = {
    school: {
      uz: 'Maktab/bogʻcha yonida xavfsiz oʻtish yoʻq', short: 'Maktab oldida xavf', icon: '🏫', color: '#7c3aed', weight: 100, cost: 80e6, unit: 'joy',
      what: 'Maktab yoki bogʻchaning 150 m atrofida belgilangan piyoda oʻtish joyi ham, svetofor ham yoʻq. Bolalar yoʻlni xavfli joydan kesib oʻtadi.',
      fix: 'Kirish oldiga koʻtarilgan piyoda oʻtish joyi (“lejachiy” bilan), “Bolalar” belgisi va 30 km/soat tezlik cheklovi qoʻyish.',
      steps: ['Joyni koʻrish: bolalar yoʻlni qayerdan kesib oʻtadi (ertalab 7:30–8:30).', 'Kirish oldiga koʻtarilgan piyoda oʻtish joyi (“lejachiy” bilan) va zebra chizish.', '“Bolalar” (1.23) belgisi va 30 km/soat tezlik cheklovi; kechasi yoritish.', 'Agar yoʻl 4 polosali boʻlsa — tugmali piyoda svetofori.'],
    },
    junction: {
      uz: 'Svetoforsiz yirik chorraha', short: 'Svetoforsiz chorraha', icon: '🚦', color: '#dc2626', weight: 80, cost: 600e6, unit: 'chorraha',
      what: 'Ikki katta koʻcha kesishadi, lekin svetofor yoʻq. Tigʻiz soatlarda tiqilinch va avariya xavfi yuqori.',
      fix: 'Avval chorrahada mashinalar sonini sanash. Oqim katta boʻlsa — svetofor yoki aylanma harakat (halqa) qurish.',
      steps: ['Tigʻiz soatda (8:00–9:00, 17:00–19:00) har yoʻnalishdan oʻtadigan mashinalarni sanash.', 'Oqim kichik boʻlsa — “Asosiy yoʻl / Yoʻl bering” belgilari va zebra yetarli.', 'Oqim katta boʻlsa — har bir yoʻnalishga svetofor, toʻxtash chizigʻi va piyoda oʻtish joyi (rejada sariq).', 'Joy keng boʻlsa — svetofor oʻrniga aylanma harakat (halqa) varianti.'],
    },
    congestion: {
      uz: 'Hozir tirbandlik (TomTom)', short: 'Hozirgi tirbandlik', icon: '🚗', color: '#b91c1c', weight: 75, cost: 30e6, unit: 'koʻcha',
      what: 'TomTom oʻlchoviga koʻra mashinalar odatdagidan kamida 30% sekin yurmoqda.',
      fix: 'Svetofor vaqtlarini sozlash, koʻcha chetida toʻxtashni taqiqlash, avtobusga alohida yoʻlak ajratish.',
      steps: ['Tirbandlik qaysi soatda boʻlishini kuzatish.', 'Svetofor fazalarini sozlash.', 'Koʻcha chetida toʻxtashni taqiqlash.', 'Avtobusga alohida yoʻlak.'],
    },
    coverage: {
      uz: '400 m ichida bekat yoʻq hudud', short: 'Bekat uzoq', icon: '🚏', color: '#e11d48', weight: 50, cost: 35e6, unit: 'bekat',
      what: 'Bu hududdan eng yaqin avtobus bekatigacha 400 m dan koʻp. Odamlar, ayniqsa keksalar, uzoq piyoda yurishga majbur.',
      fix: 'Hududga yangi bekat qoʻyish yoki yaqin avtobus yoʻnalishini shu yerdan oʻtkazish.',
      steps: ['Hududda odamlar qayerdan koʻp yuradi — aniqlash.', 'Eng yaqin avtobus yoʻnalishini shu yerdan oʻtkazish yoki yangi bekat qoʻyish.', 'Bekatga soyabon, oʻrindiq va piyoda yoʻlak.'],
    },
    spacing: {
      uz: 'Bekatlar oraligʻi 900 m dan katta', short: 'Bekatlar orasi uzoq', icon: '↔', color: '#d97706', weight: 40, cost: 35e6, unit: 'bekat',
      what: 'Bitta avtobus yoʻnalishidagi ikki qoʻshni bekat orasi 900 m dan uzun.',
      fix: 'Ikki bekat oraligʻiga yangi bekat qoʻshish.',
      steps: ['Ikki bekat oʻrtasidagi eng gavjum joyni tanlash (maktab, bozor, poliklinika yonida).', 'Yangi bekat: soyabon, oʻrindiq, bekat belgisi.'],
    },
    crossings: {
      uz: 'Piyoda oʻtish joylari kam (< 2 ta/km)', short: 'Oʻtish joyi kam', icon: '🚶', color: '#0284c7', weight: 30, cost: 20e6, unit: 'oʻtish joyi',
      what: 'Katta koʻchada piyoda oʻtish joylari juda kam. Odamlar yoʻlni xohlagan joydan kesib oʻtadi.',
      fix: 'Har 300–500 m da “zebra”, belgi va yoritish qoʻyish.',
      steps: ['Odamlar koʻchani qayerdan koʻp kesib oʻtishini kuzatish.', 'Har 300–500 m da zebra, “Piyoda oʻtish joyi” belgisi va yoritish.', 'Keng koʻchada — oʻrtada piyoda “orolcha”.'],
    },
  };

  const ROUTE_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#c026d3', '#ea580c', '#0d9488', '#4f46e5'];
  const MODE_UZ = { bus: 'Avtobus', minibus: 'Mikroavtobus', trolleybus: 'Trolleybus', share_taxi: 'Yoʻnalishli taksi' };

  const num = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
  const speed = v => { if (!v) return null; const n = parseFloat(v); if (!isFinite(n)) return null; return /mph/.test(v) ? Math.round(n * 1.609) : n; };
  function mode(arr) {
    const m = new Map(); let best = null, bc = 0;
    for (const v of arr) { if (v == null) continue; const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bc) { bc = c; best = v; } }
    return best;
  }

  function build(raw0, extraPts) {
    // Foydalanuvchi tuzatishlari (svetofor/oʻtish joyi/bekat) OSM nuqtalariga qoʻshiladi
    const raw = extraPts && extraPts.length ? Object.assign({}, raw0, { pts: raw0.pts.concat(extraPts) }) : raw0;
    const bb = NX.config.bbox;
    const inArea = (lat, lon) => lat >= bb.s && lat <= bb.n && lon >= bb.w && lon <= bb.e;
    const M = { ts: raw.ts, mirror: raw.mirror, routesTs: raw.routesTs };

    // ---- 1. Yoʻllar ----
    const ways = raw.ways.map((w, i) => {
      const t = w.t, ll = [], xy = [];
      for (let k = 0; k < w.g.length; k += 2) { ll.push([w.g[k], w.g[k + 1]]); xy.push(G.xy(w.g[k], w.g[k + 1])); }
      const ow = String(t.oneway || '').toLowerCase();
      let oneway = 0;
      if (ow === 'yes' || ow === '1' || ow === 'true' || t.junction === 'roundabout' || t.junction === 'circular') oneway = 1;
      if (ow === '-1' || ow === 'reverse') oneway = -1;
      if (ow === 'no') oneway = 0;
      const nm = (t.name || t['name:uz'] || '').trim();
      return {
        i, id: w.id, hw: t.highway, nameKey: nm.toLowerCase(), disp: (t['name:uz'] || t.name || '').trim(),
        alt: [t.name, t['name:uz'], t['name:ru'], t['name:en']].filter(Boolean),
        oneway, lanes: num(t.lanes), lanesF: num(t['lanes:forward']), lanesB: num(t['lanes:backward']),
        maxspeed: speed(t.maxspeed), nodes: w.n, ll, xy, len: G.len(xy), street: -1,
      };
    });
    M.ways = ways;

    // ---- 2. Koʻchalar: yoʻllar nom boʻyicha guruhlanadi ----
    const byKey = new Map(), streets = [];
    for (const w of ways) {
      const key = w.nameKey ? 'n:' + w.nameKey : 'w:' + w.id;
      let s = byKey.get(key);
      if (!s) { s = { id: streets.length, key, name: w.disp, alt: new Set(), ways: [] }; byKey.set(key, s); streets.push(s); }
      if (!s.name && w.disp) s.name = w.disp;
      w.alt.forEach(a => s.alt.add(a));
      s.ways.push(w.i); w.street = s.id;
    }
    M.streets = streets;
    M.streetByKey = byKey;

    // ---- 3. Fazoviy indeks (yoʻl segmentlari) ----
    const segGrid = new NX.Grid(60);
    ways.forEach(w => { for (let k = 0; k < w.xy.length - 1; k++) segGrid.addSeg(w.xy[k][0], w.xy[k][1], w.xy[k + 1][0], w.xy[k + 1][1], [w.i, k]); });
    M.segGrid = segGrid;
    M.streetsNear = function (x, y, r) {
      const out = new Map();
      segGrid.near(x, y, r, it => {
        const w = ways[it[0]], a = w.xy[it[1]], b = w.xy[it[1] + 1];
        const d = G.segDist(x, y, a[0], a[1], b[0], b[1]);
        if (d <= r) { const p = out.get(w.street); if (p == null || d < p) out.set(w.street, d); }
      });
      return out;
    };
    const nearestStreet = (x, y, r) => { let best = -1, bd = Infinity; M.streetsNear(x, y, r).forEach((d, s) => { if (d < bd) { bd = d; best = s; } }); return best; };

    // ---- 4. Nuqtali obyektlar ----
    const P = { stop: [], signal: [], crossing: [], school: [] };
    const stopGrid = new NX.Grid(200);
    const stopById = new Map();
    const rawStops = raw.pts.filter(p => p.k === 'stop').sort((a, b) => (b.p || 0) - (a.p || 0));
    for (const p of rawStops) {
      const [x, y] = G.xy(p.lat, p.lon);
      let found = null;
      stopGrid.near(x, y, 25, s => { if (!found && G.d(x, y, s.x, s.y) < 25) found = s; });
      if (found) { if (!found.name && p.name) found.name = p.name; stopById.set(p.id, found); continue; }
      const s = { id: p.id, name: p.name, lat: p.lat, lon: p.lon, x, y, inArea: inArea(p.lat, p.lon), routes: new Set(), street: -1, fix: p.fix };
      P.stop.push(s); stopGrid.addPoint(x, y, s); stopById.set(p.id, s);
    }
    const seenPt = new Set();
    for (const p of raw.pts) {
      if (p.k === 'stop' || !P[p.k === 'kindergarten' ? 'school' : p.k]) continue;
      const k = p.k === 'kindergarten' ? 'school' : p.k;
      const uid = k + p.id;
      if (seenPt.has(uid)) continue;
      seenPt.add(uid);
      const [x, y] = G.xy(p.lat, p.lon);
      P[k].push({ id: p.id, kind: p.k, name: p.name, lat: p.lat, lon: p.lon, x, y, sig: p.sig, fix: p.fix });
    }
    M.stops = P.stop; M.signals = P.signal; M.crossings = P.crossing; M.schools = P.school;
    M.stopGrid = stopGrid;
    const sigGrid = new NX.Grid(100); P.signal.forEach(s => sigGrid.addPoint(s.x, s.y, s));
    const safeGrid = new NX.Grid(100); P.signal.concat(P.crossing).forEach(s => safeGrid.addPoint(s.x, s.y, s));
    const anyWithin = (grid, x, y, r) => { let hit = false; grid.near(x, y, r, s => { if (!hit && G.d(x, y, s.x, s.y) <= r) hit = true; }); return hit; };

    streets.forEach(s => { s.stops = []; s.signals = []; s.crossings = []; s.schools = []; s.routes = new Set(); });
    P.stop.forEach(st => { if (!st.inArea) return; const s = nearestStreet(st.x, st.y, R.stopToStreet); if (s >= 0) { st.street = s; streets[s].stops.push(st); } });
    P.signal.forEach(o => M.streetsNear(o.x, o.y, R.signalToStreet).forEach((d, s) => streets[s].signals.push(o)));
    P.crossing.forEach(o => M.streetsNear(o.x, o.y, R.crossingToStreet).forEach((d, s) => streets[s].crossings.push(o)));
    P.school.forEach(o => {
      o.safe = anyWithin(safeGrid, o.x, o.y, R.schoolSafe);
      M.streetsNear(o.x, o.y, R.schoolToStreet).forEach((d, s) => streets[s].schools.push(o));
    });

    // ---- 5. Avtobus yoʻnalishlari ----
    const wayIdToStreet = new Map(ways.map(w => [w.id, w.street]));
    M.routes = raw.routes.map((r, i) => {
      const segsLL = r.segs.map(g => { const a = []; for (let k = 0; k < g.length; k += 2) a.push([g[k], g[k + 1]]); return a; });
      const segsXY = segsLL.map(s => s.map(p => G.xy(p[0], p[1])));
      const length = segsXY.reduce((t, s) => t + G.len(s), 0);
      // Koʻchalar: aʼzo yoʻl ID si mos kelsa yoki marshrut nuqtalari 15 m ichida (kamida 4 ta) boʻlsa
      const counts = new Map(), samples = [];
      segsXY.forEach(s => G.sample(s, R.routeSampleStep, (x, y) => {
        samples.push([x, y]);
        M.streetsNear(x, y, R.routeToStreet).forEach((d, sid) => counts.set(sid, (counts.get(sid) || 0) + 1));
      }));
      const st = new Set();
      counts.forEach((c, sid) => { if (c >= R.routeMinSamples) st.add(sid); });
      r.wayIds.forEach(id => { const sid = wayIdToStreet.get(id); if (sid != null) st.add(sid); });
      // Bekatlar: hudud ichidagilar, ketma-ket 40 m dan yaqinlari birlashtiriladi
      const stops = [];
      for (const s of r.stops) {
        if (!inArea(s.lat, s.lon)) continue;
        const [x, y] = G.xy(s.lat, s.lon);
        const known = stopById.get(s.id);
        const last = stops[stops.length - 1];
        if (last && G.d(x, y, last.x, last.y) < 40) { if (!last.name && known && known.name) last.name = known.name; continue; }
        let name = known ? known.name : '';
        if (!name) stopGrid.near(x, y, 40, o => { if (!name && o.name && G.d(x, y, o.x, o.y) < 40) name = o.name; });
        stops.push({ x, y, lat: s.lat, lon: s.lon, name, ref: known || null });
      }
      // Oraliqlar (toʻgʻri chiziq boʻyicha); marshrut hududdan chiqib qaytgan oraliqlar hisobga olinmaydi
      const gaps = [];
      for (let k = 1; k < stops.length; k++) {
        const a = stops[k - 1], b = stops[k];
        const d = G.d(a.x, a.y, b.x, b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        let ok = samples.length === 0;
        for (let q = 0; q < samples.length && !ok; q += 2) if (G.d(mx, my, samples[q][0], samples[q][1]) < 250) ok = true;
        if (ok) gaps.push({ from: k - 1, to: k, d });
      }
      const spacing = gaps.length ? { avg: gaps.reduce((t, g) => t + g.d, 0) / gaps.length, max: Math.max(...gaps.map(g => g.d)) } : { avg: null, max: null };
      const route = {
        i, id: r.id, ref: r.ref, name: r.name, from: r.from, to: r.to, mode: r.mode, modeUz: MODE_UZ[r.mode] || r.mode, op: r.op,
        label: r.ref || r.name || String(r.id), color: ROUTE_COLORS[i % ROUTE_COLORS.length],
        segsLL, length, stops, gaps, spacing, streets: [...st],
      };
      route.streets.forEach(sid => streets[sid].routes.add(i));
      stops.forEach(s => { if (s.ref) s.ref.routes.add(i); });
      return route;
    });
    M.lineCount = new Set(M.routes.map(r => r.mode + ':' + (r.ref || r.name))).size;

    // ---- 6. Koʻcha xususiyatlari ----
    streets.forEach(s => {
      const ws = s.ways.map(i => ways[i]);
      s.length = ws.reduce((t, w) => t + w.len, 0);
      s.hw = ws.reduce((b, w) => (NX.HW[w.hw].rank > NX.HW[b].rank ? w.hw : b), ws[0].hw);
      s.rank = NX.HW[s.hw].rank;
      const ow = ws.filter(w => w.oneway !== 0).length;
      s.oneway = ow === 0 ? 'no' : ow === ws.length ? 'yes' : 'mixed';
      s.lanes = mode(ws.map(w => w.lanes));
      s.maxspeed = mode(ws.map(w => w.maxspeed));
      s.signals = uniq(s.signals); s.crossings = uniq(s.crossings); s.schools = uniq(s.schools);
      const longest = ws.reduce((b, w) => (w.len > b.len ? w : b), ws[0]);
      const c = G.pointAlong(longest.xy, 0.5);
      s.center = G.ll(c[0], c[1]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      ws.forEach(w => w.ll.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
      s.bounds = [[x0, y0], [x1, y1]];
      s.axis = principalAxis(ws);
      s.busRefs = [...new Set([...s.routes].map(i => M.routes[i].label))].sort(byRef);
      s.lanesPerDir = lanesPerDir(s);
      s.risk = riskOf(s);
      s.tomtom = null;
      s.alt = [...s.alt];
    });
    M.namedStreets = streets.filter(s => s.name).sort((a, b) => b.rank - a.rank || b.length - a.length);

    // ---- 7. Yirik chorrahalar ----
    const nodeSt = new Map(), nodeXY = new Map();
    ways.forEach(w => {
      if (NX.HW[w.hw].rank < NX.MAJOR_RANK) return;
      w.nodes.forEach((id, k) => {
        let set = nodeSt.get(id); if (!set) { nodeSt.set(id, (set = new Set())); nodeXY.set(id, w.xy[k]); }
        set.add(w.street);
      });
    });
    const jGrid = new NX.Grid(50), junctions = [];
    nodeSt.forEach((set, id) => {
      if (set.size < 2) return;
      const [x, y] = nodeXY.get(id);
      let j = null;
      jGrid.near(x, y, R.junctionMerge, o => { if (!j && G.d(x, y, o.x, o.y) <= R.junctionMerge) j = o; });
      if (j) { set.forEach(s => j.streets.add(s)); return; }
      j = { x, y, streets: new Set(set) };
      junctions.push(j); jGrid.addPoint(x, y, j);
    });
    junctions.forEach(j => {
      [j.lat, j.lon] = G.ll(j.x, j.y);
      j.signalised = anyWithin(sigGrid, j.x, j.y, R.junctionSignal);
      j.streets = [...j.streets];
      j.name = j.streets.map(s => streets[s].name || 'nomsiz yoʻl').join(' × ');
    });
    M.junctions = junctions;

    // ---- 8. Bekat qamrovi (250×250 m kataklar) ----
    const [ax0, ay0] = G.xy(bb.s, bb.w), [ax1, ay1] = G.xy(bb.n, bb.e);
    const nx = Math.ceil((ax1 - ax0) / R.cell), ny = Math.ceil((ay1 - ay0) / R.cell);
    const hasStreet = new Uint8Array(nx * ny);
    let tot = 0, cov = 0;
    const nearStop = (x, y, r) => anyWithin(stopGrid, x, y, r);
    ways.forEach(w => G.sample(w.xy, 25, (x, y) => {
      const i = Math.floor((x - ax0) / R.cell), j = Math.floor((y - ay0) / R.cell);
      if (i >= 0 && j >= 0 && i < nx && j < ny) hasStreet[j * nx + i] = 1;
      tot++; if (nearStop(x, y, R.coverage)) cov++;
    }));
    const gapCells = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!hasStreet[j * nx + i]) continue;
      const cx = ax0 + (i + 0.5) * R.cell, cy = ay0 + (j + 0.5) * R.cell;
      if (!nearStop(cx, cy, R.coverage)) gapCells.push({ i, j, cx, cy });
    }
    M.grid = { x0: ax0, y0: ay0, nx, ny };
    M.coverage = tot ? (cov / tot) * 100 : null;
    M.gapCells = gapCells;
    M.gapClusters = clusterCells(gapCells);

    refresh(M);
    return M;
  }

  const uniq = a => [...new Set(a)];
  const byRef = (a, b) => (parseInt(a, 10) || 1e9) - (parseInt(b, 10) || 1e9) || String(a).localeCompare(String(b));

  function lanesPerDir(s) {
    const H = NX.HW[s.hw];
    if (s.lanes) return s.oneway === 'yes' ? s.lanes : Math.max(1, Math.round(s.lanes / 2));
    return s.oneway === 'yes' ? H.lanes1 : Math.max(1, Math.round(H.lanes2 / 2));
  }

  // Tirbandlik xavfi (taxmin, oʻlchov emas): koʻcha darajasi + avtobus liniyalari + svetofor zichligi + 1 polosa + bekatlar
  function riskOf(s) {
    const km = Math.max(s.length / 1000, 0.15);
    const parts = {
      turi: NX.HW[s.hw].risk,
      avtobus: Math.min(25, s.busRefs.length * 5),
      svetofor: Math.min(15, (s.signals.length / km) * 3),
      polosa: s.lanesPerDir <= 1 && s.rank >= 3 ? 10 : 0,
      bekat: Math.min(15, (s.stops.length / km) * 2),
    };
    const value = Math.min(100, Math.round(Object.values(parts).reduce((a, b) => a + b, 0)));
    return { value, parts };
  }

  // Koʻchaning asosiy yoʻnalishi (PCA) — “bir tomonlama” stsenariysi uchun
  function principalAxis(ws) {
    let n = 0, mx = 0, my = 0;
    ws.forEach(w => w.xy.forEach(p => { n++; mx += p[0]; my += p[1]; }));
    mx /= n; my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    ws.forEach(w => w.xy.forEach(p => { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }));
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let ux = Math.cos(ang), uy = Math.sin(ang);
    if (ux < -1e-9 || (Math.abs(ux) < 1e-9 && uy < 0)) { ux = -ux; uy = -uy; }
    return [ux, uy];
  }

  function clusterCells(cells) {
    const key = c => c.i + ',' + c.j, map = new Map(cells.map(c => [key(c), c])), seen = new Set(), out = [];
    for (const c of cells) {
      if (seen.has(key(c))) continue;
      const q = [c], grp = []; seen.add(key(c));
      while (q.length) {
        const a = q.pop(); grp.push(a);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (a.i + di) + ',' + (a.j + dj);
          if (map.has(k) && !seen.has(k)) { seen.add(k); q.push(map.get(k)); }
        }
      }
      const cx = grp.reduce((t, g) => t + g.cx, 0) / grp.length, cy = grp.reduce((t, g) => t + g.cy, 0) / grp.length;
      out.push({ cells: grp, cx, cy, ll: G.ll(cx, cy) });
    }
    return out.sort((a, b) => b.cells.length - a.cells.length);
  }

  // Muammolar, KPI va indeksni qayta hisoblash (TomTom oʻlchovidan keyin ham chaqiriladi)
  function refresh(M) {
    const probs = [];
    const add = (type, o) => probs.push(Object.assign({ type, id: type + probs.length }, o));
    const nameOf = s => s.name || 'Nomsiz yoʻl';

    M.schools.forEach(o => {
      if (o.safe) return;
      add('school', { lat: o.lat, lon: o.lon, sev: 3, title: (o.kind === 'kindergarten' ? 'Bogʻcha' : 'Maktab') + (o.name ? ': ' + o.name : ''), detail: `${R.schoolSafe} m ichida piyoda oʻtish joyi yoki svetofor belgilanmagan.` });
    });
    M.junctions.forEach(j => {
      if (j.signalised) return;
      const top = Math.max(...j.streets.map(s => M.streets[s].rank));
      add('junction', { lat: j.lat, lon: j.lon, sev: top >= 6 ? 3 : 2, title: j.name, detail: `${R.junctionSignal} m ichida svetofor yoʻq.`, streets: j.streets });
    });
    M.streets.forEach(s => {
      if (s.tomtom && s.tomtom.congestion >= R.congestion) add('congestion', { lat: s.center[0], lon: s.center[1], sev: s.tomtom.congestion >= 50 ? 3 : 2, title: nameOf(s), detail: `TomTom: tirbandlik ${NX.fmt.pct(s.tomtom.congestion)} (${NX.fmt.time(s.tomtom.ts)}).`, street: s.id });
    });
    // Bekatsiz kataklar qoʻshni kataklar bilan bitta hududga birlashtiriladi
    M.gapClusters.forEach(c => {
      const near = M.streetsNear(c.cx, c.cy, 200);
      let best = null, bd = Infinity;
      near.forEach((d, sid) => { if (M.streets[sid].name && d < bd) { bd = d; best = M.streets[sid]; } });
      const km2 = (c.cells.length * R.cell * R.cell) / 1e6;
      add('coverage', { lat: c.ll[0], lon: c.ll[1], sev: c.cells.length >= 6 ? 2 : 1, title: (best ? best.name + ' atrofi' : 'Hudud') + ` (~${NX.fmt.num(km2, 2)} km²)`, detail: `${c.cells.length} ta 250×250 m katakda ${R.coverage} m ichida bekat yoʻq.`, cluster: c, qty: Math.ceil(c.cells.length / 6) });
    });
    M.routes.forEach(r => r.gaps.forEach(g => {
      if (g.d <= R.spacingMax) return;
      const a = r.stops[g.from], b = r.stops[g.to];
      add('spacing', { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2, sev: g.d > 1300 ? 2 : 1, title: `${r.modeUz} ${r.label}: ${a.name || 'bekat'} → ${b.name || 'bekat'}`, detail: `Bekatlar orasi ${NX.fmt.km(g.d)} (toʻgʻri chiziq boʻyicha).`, route: r.i, d: g.d });
    }));
    M.streets.forEach(s => {
      if (s.rank < 5 || s.length < 300) return;
      const n = new Set(s.crossings.concat(s.signals).map(o => Math.round(o.x / 15) + ',' + Math.round(o.y / 15))).size;
      const perKm = n / (s.length / 1000);
      if (perKm < R.crossingsPerKm) add('crossings', { lat: s.center[0], lon: s.center[1], sev: perKm < 1 ? 2 : 1, title: nameOf(s), detail: `${NX.fmt.num(perKm, 1)} ta oʻtish joyi/km (${n} ta, ${NX.fmt.km(s.length)}).`, street: s.id, perKm });
    });
    // id — barqaror (qayta hisoblashda ham oʻzgarmaydi): tur va joy boʻyicha
    const seen = new Map();
    probs.forEach(p => {
      p.score = NX.PROBLEM[p.type].weight + p.sev * 10; p.key = p.type + ':' + p.lat.toFixed(4) + ':' + p.lon.toFixed(4);
      const n = seen.get(p.key) || 0; seen.set(p.key, n + 1);
      p.id = n ? p.key + ':' + n : p.key;
    });
    probs.sort((a, b) => b.score - a.score);
    // “Bu muammo emas” deb belgilanganlar chiqarib tashlanadi
    const dis = NX.fixes ? NX.fixes.dismissed() : new Set();
    M.dismissedCount = probs.filter(p => dis.has(p.key)).length;
    M.problems = probs.filter(p => !dis.has(p.key));

    // KPI
    const allGaps = M.routes.flatMap(r => r.gaps.map(g => g.d));
    const majorJ = M.junctions.length, unsigJ = M.junctions.filter(j => !j.signalised).length;
    const measured = M.streets.filter(s => s.tomtom);
    M.kpi = {
      lines: M.lineCount, relations: M.routes.length,
      stopsInArea: M.stops.filter(s => s.inArea).length,
      coverage: M.coverage,
      majorJunctions: majorJ, unsignalised: unsigJ,
      avgSpacing: allGaps.length ? allGaps.reduce((a, b) => a + b, 0) / allGaps.length : null,
      schools: M.schools.length, unsafeSchools: M.schools.filter(s => !s.safe).length,
      streets: M.namedStreets.length,
      roadKm: M.ways.reduce((t, w) => t + w.len, 0) / 1000,
      measured: measured.length,
      avgCongestion: measured.length ? measured.reduce((t, s) => t + s.tomtom.congestion, 0) / measured.length : null,
    };

    // Transport indeksi (0–100)
    const parts = [];
    if (M.coverage != null) parts.push({ k: 'Bekat qamrovi (400 m)', v: M.coverage, w: 0.35 });
    if (majorJ) parts.push({ k: 'Svetoforli yirik chorrahalar', v: (100 * (majorJ - unsigJ)) / majorJ, w: 0.2 });
    if (M.schools.length) parts.push({ k: 'Xavfsiz oʻtishli maktab/bogʻchalar', v: (100 * (M.schools.length - M.kpi.unsafeSchools)) / M.schools.length, w: 0.2 });
    if (allGaps.length) parts.push({ k: 'Bekat oraligʻi ≤ 600 m ulushi', v: (100 * allGaps.filter(d => d <= 600).length) / allGaps.length, w: 0.15 });
    if (measured.length >= 3) parts.push({ k: 'Harakat ravonligi (TomTom)', v: Math.max(0, 100 - 2 * M.kpi.avgCongestion), w: 0.1 });
    const W = parts.reduce((t, p) => t + p.w, 0);
    M.index = { value: W ? Math.round(parts.reduce((t, p) => t + p.v * p.w, 0) / W) : null, parts: parts.map(p => Object.assign(p, { w: p.w / W })) };
    return M;
  }

  // TomTom oʻlchovlarini modelga qoʻllash
  function applyTomTom(M, latest) {
    Object.keys(latest || {}).forEach(k => { const s = M.streetByKey.get(k); if (s) s.tomtom = latest[k]; });
  }

  // Koʻcha boʻyicha qidirish (nom va muqobil nomlar)
  function searchStreets(M, q) {
    const n = norm(q);
    if (!n) return M.namedStreets.slice(0, 30);
    return M.namedStreets.filter(s => [s.name].concat(s.alt).some(a => norm(a).includes(n))).slice(0, 30);
  }
  const norm = s => NX.translit(s).replace(/[ʻʼ'`’‘ʹ]/g, '').replace(/\s+/g, ' ').trim();

  NX.analysis = { build, refresh, applyTomTom, searchStreets, norm, riskOf };
})();
