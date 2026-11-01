/* City Jam — suv toʻplanadigan koʻcha uchun MUHANDISLIK YECHIMI (taxminiy hisob, loyiha emas).
   1) Suv yigʻish havzasi: yer sathi relyefida (40 m) D8 oqim yoʻnalishi — muammo nuqtasiga qaysi kataklardan suv keladi.
   2) Eng yuqori oqim: ratsional formula Q = C·i·A (C = 0.75 shahar sirti); mavjud kanalizatsiya/ariq sigʻimi ayiriladi.
   3) Toʻplanadigan hajm: 2D fizik model (shu koʻcha boʻlaklari: chuqurlik × uzunlik × kenglik).
   4) Chiqish joyi: eng yaqin ariq/kanal/daryo (OSM) yoki relyef boʻyicha 3 m+ pastdagi joy; quvur yoʻli — mavjud koʻchalar ostidan (Dijkstra).
   5) Quvur diametri: Manning (toʻla quvur, n = 0.013), qiyalik = balandlik farqi / yoʻl uzunligi.
   6) Variantlar: A — yomgʻir suvi kollektori; B — yer osti saqlash rezervuari; C — panjarali quduqlar + ariq tozalash; D — nasos stansiyasi.
   Bosh reja va UNESCO zonalari hisobga olinadi (Afrosiyob — qazish taqiqlangan; Temuriylar qismi — faqat mavjud koʻcha ostidan, arxeologik nazorat bilan). */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;
  const C_RUN = 0.75, N_PIPE = 0.013;
  const SIZES = [300, 400, 500, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000];

  // Ariq/kanal/daryolar — OSM (brauzerda, bir marta)
  let wwP = null;
  function waterways() {
    if (wwP) return wwP;
    wwP = (async () => {
      const hit = await NX.bigStore.get('ww:v1');
      if (hit && Date.now() - hit.ts < 30 * 86400e3) return hit.list;
      const C = NX.twin.CITY, bb = `${C.s - 0.02},${C.w - 0.03},${C.n + 0.02},${C.e + 0.03}`;
      const q = `[out:json][timeout:40];way["waterway"~"^(river|canal|stream|ditch|drain)$"](${bb});out tags geom qt;`;
      for (const url of NX.config.overpassMirrors) {
        try {
          const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 45000);
          if (!r.ok || !r.data || !r.data.elements) continue;
          const list = r.data.elements.filter(e => e.geometry && e.geometry.length > 1).map(e => ({ name: (e.tags && (e.tags['name:uz'] || e.tags.name)) || '', kind: e.tags && e.tags.waterway, pts: e.geometry.map(g => [g.lat, g.lon]) }));
          NX.bigStore.set('ww:v1', { ts: Date.now(), list });
          return list;
        } catch (e) { /* keyingi server */ }
      }
      return [];
    })().catch(() => []);
    return wwP;
  }
  const WW_UZ = { river: 'daryo', canal: 'kanal', stream: 'soy', ditch: 'ariq', drain: 'zovur' };

  const pipeD = (Q, S) => { const d = Math.pow((Q * N_PIPE * Math.pow(4, 5 / 3)) / (Math.PI * Math.sqrt(Math.max(0.002, S))), 3 / 8) * 1000; return { raw: Math.round(d), std: SIZES.find(x => x >= d) || Math.ceil(d / 100) * 100 }; };
  const qFull = (Dmm, S) => { const D = Dmm / 1000; return (1 / N_PIPE) * (Math.PI * D * D / 4) * Math.pow(D / 4, 2 / 3) * Math.sqrt(Math.max(0.002, S)); };

  // Asosiy hisob. o: { R (2D natija), D (yer sathi 40 m), net (koʻcha tarmogʻi), name | point, poly, rainMm, drainMm, spaces }
  async function solve(o) {
    const { R, D, net } = o, H = NX.twin.hydro(D), nx = D.nx, ny = D.ny, step = D.step;
    const cellOf = (lat, lon) => { const [x, y] = G.xy(lat, lon), i = Math.floor((x - D.x0) / step), j = Math.floor((y - D.y0) / step); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
    const cellLL = k => G.ll(D.x0 + ((k % nx) + 0.5) * step, D.y0 + (Math.floor(k / nx) + 0.5) * step);
    // 1) Muammo joyi: koʻcha nomi, hudud yoki nuqta → shu yerdagi eng chuqur suvli boʻlak
    const maxD = R.segs.map((sg, i) => R.frames.reduce((m, f) => Math.max(m, f.d[i]), 0));
    let pick = R.segs.map((sg, i) => ({ sg, i, d: maxD[i] })).filter(x => x.d >= 0.05);
    const nm = s => String(s || '').toLowerCase().replace(/[ʻ'‘’`ʼ]/g, '');
    if (o.name) { const k = nm(o.name).replace(/\s*(koʻchasi|kochasi|ko'chasi).*$/, ''); const f = pick.filter(x => nm(x.sg.name).includes(k)); if (f.length) pick = f; }
    if (o.poly) { const f = pick.filter(x => NX.area.inside(o.poly, x.sg.mid[0], x.sg.mid[1])); if (f.length) pick = f; }
    if (o.point) { const [px, py] = G.xy(o.point[0], o.point[1]); pick = pick.map(x => { const [sx, sy] = G.xy(x.sg.mid[0], x.sg.mid[1]); return Object.assign(x, { dd: Math.hypot(sx - px, sy - py) }); }).filter(x => x.dd < 400); }
    if (!pick.length) return null;
    const top = pick.reduce((b, x) => (x.d > b.d ? x : b), pick[0]);
    const name = top.sg.name || o.name || 'nomsiz koʻcha', site = top.sg.mid;
    // Shu koʻchaning suvli boʻlaklari (bir xil nom, 600 m ichida)
    const [sx0, sy0] = G.xy(site[0], site[1]);
    const segs = R.segs.map((sg, i) => ({ sg, d: maxD[i] })).filter(x => x.d >= 0.05 && (x.sg.name || '') === (top.sg.name || '') && (() => { const [px, py] = G.xy(x.sg.mid[0], x.sg.mid[1]); return Math.hypot(px - sx0, py - sy0) < 600; })());
    const vol = Math.round(segs.reduce((t, x) => t + x.d * x.sg.len * Math.min(x.sg.w, 20) * 0.6, 0));
    const wetLen = Math.round(segs.reduce((t, x) => t + x.sg.len, 0));
    // 2) Havza: muammo katagiga oqib keladigan kataklar (D8, yer sathi)
    const k0 = cellOf(site[0], site[1]);
    const up = Array.from({ length: nx * ny }, () => null);
    for (let k = 0; k < nx * ny; k++) { const d = H.down[k]; if (d >= 0) (up[d] || (up[d] = [])).push(k); }
    const basin = [], seen = new Uint8Array(nx * ny);
    // Muammo atrofidagi 3×3 kataklar — koʻcha 40 m katakning chetida boʻlishi mumkin
    const seeds = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const k = k0 + dj * nx + di; if (k >= 0 && k < nx * ny && Math.abs(D.z[k] - D.z[k0]) < 1.5) seeds.push(k); }
    // Mahalliy havza: oqim yoʻli boʻyicha 1.5 km ichidagi kataklar (uzoqdagi suv shahar ariq/kanallari orqali boshqa joyga ketadi)
    const LOCAL = 1500, dd = new Float32Array(nx * ny);
    const stack = seeds.slice(); seeds.forEach(k => { seen[k] = 1; dd[k] = 0; });
    while (stack.length && basin.length < 20000) { const k = stack.pop(); basin.push(k); (up[k] || []).forEach(q => { if (seen[q]) return; const dq = dd[k] + step * (Math.abs((q % nx) - (k % nx)) + Math.abs(Math.floor(q / nx) - Math.floor(k / nx)) > 1 ? 1.414 : 1); if (dq > LOCAL) return; seen[q] = 1; dd[q] = dq; stack.push(q); }); }
    const A = basin.length * step * step, Aha = A / 1e4;
    const zs = basin.map(k => D.z[k]).sort((a, b) => a - b), zPit = D.z[k0], zTop = zs[Math.floor(zs.length * 0.95)] || zPit;
    // Havza uzunligi va oʻrtacha qiyalik (oqim vaqti — Kirpich formulasi)
    let far = 0; basin.forEach(k => { const ll = cellLL(k), [x, y] = G.xy(ll[0], ll[1]); far = Math.max(far, Math.hypot(x - sx0, y - sy0)); });
    const Sb = Math.max(0.003, (zTop - zPit) / Math.max(100, far)), tc = Math.max(5, Math.round(0.0195 * Math.pow(far, 0.77) * Math.pow(Sb, -0.385)));
    // 3) Oqim: ratsional formula; mavjud tizim (ariq/kanalizatsiya) sigʻimi
    // Oqim: ratsional formula (mahalliy havza); kerakli qoʻshimcha sigʻim — 2D modeldagi toʻplanadigan suvni 1 soatda olib ketish
    const i = o.rainMm, Q = C_RUN * (i / 3.6e6) * A, Qex = C_RUN * ((o.drainMm || 10) / 3.6e6) * A, Qneed = Math.max(0.02, Math.min(Math.max(0, Q - Qex), vol / 3600));
    // 4) Chiqish joyi: ariq/kanal (pastroq) yoki relyef boʻyicha 3 m pastdagi joy; quvur — koʻchalar ostidan
    const ww = await waterways();
    const zAt = (lat, lon) => { const k = cellOf(lat, lon); return k >= 0 ? D.z[k] : NaN; };
    const nodes = net.nodes.filter(n => n.nb.length);
    const nearNode = (lat, lon, maxM) => { const [x, y] = G.xy(lat, lon); let b = null, bd = maxM || 300; nodes.forEach(n => { const [nxx, nyy] = G.xy(n.lat, n.lon), d = Math.hypot(nxx - x, nyy - y); if (d < bd) { bd = d; b = n; } }); return b; };
    const src = nearNode(site[0], site[1], 250);
    let outlet = null;
    const cands = [];
    // Har ariq/kanaldan bitta — eng yaqin mos nuqta (nomzodlar turli suv yoʻllaridan boʻlsin)
    ww.forEach(w => { let bestP = null; w.pts.forEach((p, j) => { if (j % 2) return; const z = zAt(p[0], p[1]); const [x, y] = G.xy(p[0], p[1]), dd = Math.hypot(x - sx0, y - sy0); if (NX.masterplan && NX.masterplan.zoneAt(p[0], p[1]) === 'afrosiyob') return; if (dd < 3500 && isFinite(z) && z < zPit - 1 && (!bestP || dd < bestP.dd)) bestP = { c: p, z, dd, name: w.name, kind: WW_UZ[w.kind] || 'ariq' }; }); if (bestP) cands.push(bestP); });
    cands.sort((a, b) => a.dd - b.dd);   // eng yaqinlari birinchi
    // Relyef boʻyicha pastga (D8) — ariq topilmasa
    { let k = k0, g = 0; while (k >= 0 && g++ < 200) { if (D.z[k] < zPit - 3) { const c = cellLL(k), [x, y] = G.xy(c[0], c[1]); cands.push({ c, z: D.z[k], dd: Math.hypot(x - sx0, y - sy0) + 500, name: '', kind: 'past joy (relyef boʻyicha)' }); break; } k = H.down[k]; } }
    // Koʻcha tarmogʻi boʻylab eng qisqa yoʻl (birinchi 6 nomzoddan eng yaqini)
    const route = (a, b) => {
      if (!a || !b) return null;
      const dist = new Map([[a, 0]]), prev = new Map(), Q2 = [], done = new Set();
      const push = (d, n) => { Q2.push([d, n]); let c = Q2.length - 1; while (c) { const p = (c - 1) >> 1; if (Q2[p][0] <= Q2[c][0]) break; [Q2[p], Q2[c]] = [Q2[c], Q2[p]]; c = p; } };
      const pop = () => { const t = Q2[0], l = Q2.pop(); if (Q2.length) { Q2[0] = l; let c = 0; for (;;) { const a1 = 2 * c + 1, b1 = a1 + 1; let m = c; if (a1 < Q2.length && Q2[a1][0] < Q2[m][0]) m = a1; if (b1 < Q2.length && Q2[b1][0] < Q2[m][0]) m = b1; if (m === c) break; [Q2[m], Q2[c]] = [Q2[c], Q2[m]]; c = m; } } return t; };
      push(0, a);
      const zc = new Map(), zoneOf = m => { if (!NX.masterplan) return null; if (!zc.has(m)) zc.set(m, NX.masterplan.zoneAt(m.lat, m.lon)); return zc.get(m); };
      while (Q2.length) { const [d, n] = pop(); if (done.has(n)) continue; done.add(n); if (n === b) break; if (d > 9000) break; n.nb.forEach(({ n: m, sg }) => { const zm = zoneOf(m); if (zm === 'afrosiyob') return; const nd = d + sg.len * (zm === 'temur' ? 2.5 : 1); if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, [n, sg]); push(nd, m); } }); }
      if (!prev.has(b) && a !== b) return null;
      const pts = [], names = []; let n = b, L = 0;
      while (n && n !== a) { pts.push([n.lat, n.lon]); const [p, sg] = prev.get(n); L += sg.len; if (sg.name && names[names.length - 1] !== sg.name) names.push(sg.name); n = p; }
      pts.push([a.lat, a.lon]); pts.reverse(); names.reverse();
      return { pts, L: Math.round(L), streets: [...new Set(names)].slice(0, 5) };
    };
    // Bir nechta nomzod — koʻcha boʻylab eng qisqa yoʻl tanlanadi (5 km gacha)
    const seenNode = new Set();
    for (const c of cands.slice(0, 15)) { const t = nearNode(c.c[0], c.c[1], 700); if (!t || seenNode.has(t)) continue; seenNode.add(t); const r = route(src, t); if (r && r.L <= 6000 && (!outlet || r.L < outlet.route.L)) outlet = Object.assign(c, { route: r }); }
    // Boʻylama profil (sxema uchun): yoʻl boʻylab yer sathi
    if (outlet) { let acc = 0; outlet.profile = outlet.route.pts.map((p, j) => { if (j) { const [ax, ay] = G.xy(outlet.route.pts[j - 1][0], outlet.route.pts[j - 1][1]), [bx, by] = G.xy(p[0], p[1]); acc += Math.hypot(bx - ax, by - ay); } return [Math.round(acc), +zAt(p[0], p[1]).toFixed(1)]; }).filter(q => isFinite(q[1])); }
    // 5) Quvur
    let pipe = null;
    if (outlet && Qneed > 0.01) {
      const S = Math.max(0.002, (zPit - 1.5 - (outlet.z + 0.5)) / Math.max(50, outlet.route.L));   // 1.5 m chuqurlikda yotqiziladi
      // Juda katta oqim — bir nechta parallel quvur (eng kattasi Ø2000) yoki yopiq kanal
      let k = 1, d = pipeD(Qneed, S);
      while (d.raw > 2000 && k < 6) { k++; d = pipeD(Qneed / k, S); }
      pipe = { qiyalik_promille: +(S * 1000).toFixed(1), diametr_mm: d.std, soni: k, hisobiy_mm: d.raw, oʻtkazish_m3s: +(qFull(d.std, S) * k).toFixed(2), uzunlik_m: outlet.route.L, gravitatsion: zPit - 1.5 > outlet.z + 0.5, izoh: k > 1 ? `${k} ta parallel quvur yoki ${k > 3 ? 'yopiq toʻrtburchak kanal (box-culvert)' : 'katta kollektor'}` : null };
    }
    // 6) Saqlash rezervuari: yaqin (600 m) ochiq joy — park/maydon/sport (maktab hovlisi emas), muammo joyidan pastroq yoki teng
    const retV = Math.round(Math.max(vol, Qneed * 3600 * 0.5));
    let basinSite = null;
    (o.spaces || []).forEach(s => { if (/hovli/.test(s.kind)) return; const zs0 = NX.masterplan ? NX.masterplan.zoneAt(s.c[0], s.c[1]) : null; if (zs0 === 'afrosiyob' || zs0 === 'temur') return; const [x, y] = G.xy(s.c[0], s.c[1]), dd = Math.hypot(x - sx0, y - sy0), z = zAt(s.c[0], s.c[1]); if (dd < 1200 && s.area >= retV / 2.5 * 0.6 && (!isFinite(z) || z <= zPit + 3) && (!basinSite || dd < basinSite.dd)) basinSite = { name: s.name || s.kind, kind: s.kind, area: s.area, c: s.c, dd: Math.round(dd) }; });
    const tankArea = Math.round(retV / 2.5);   // 2.5 m chuqur yer osti rezervuari
    // 7) Panjarali quduqlar (dojdepriyomnik): har 40–50 m, bittasi ~0.03 m³/s
    const inlets = Math.max(2, Math.ceil(wetLen / 45));
    // 8) Bosh reja va UNESCO cheklovlari (muammo joyi, chiqish yoʻli, rezervuar)
    const P = NX.masterplan, zSite = P ? P.zoneAt(site[0], site[1]) : null;
    // Yoʻl zonalari (muammo joyining oʻzidan 150 m keyin — boshlanish nuqtasi zonasi alohida hisobga olingan)
    const zRoute = outlet && P ? [...new Set(outlet.route.pts.filter((p, j) => { if (j % 3) return false; const [x, y] = G.xy(p[0], p[1]); return Math.hypot(x - sx0, y - sy0) > 150; }).map(p => P.zoneAt(p[0], p[1])).filter(Boolean))] : [];
    const zBasin = basinSite && P ? P.zoneAt(basinSite.c[0], basinSite.c[1]) : null;
    const pzBasin = basinSite && P && P.planZoneAt ? await P.planZoneAt(basinSite.c[0], basinSite.c[1]) : null;
    const lim = [];
    if (zSite === 'afrosiyob' || zRoute.includes('afrosiyob')) lim.push('Afrosiyob arxeologik qoʻriqxonasi — yer qazish taqiqlangan: quvur yoʻli uni chetlab oʻtishi kerak.');
    if (zSite === 'temur' || zRoute.includes('temur')) lim.push('Temuriylar davri tarixiy qismi (UNESCO) — faqat mavjud koʻcha ostidan, arxeologik nazorat va Madaniy meros agentligi ruxsati bilan; ochiq kanal mumkin emas.');
    if (zSite === 'yevropa' || zRoute.includes('yevropa')) lim.push('Yevropa qismi (UNESCO) — tarixiy koʻchalar qoplamasi va daraxtlar saqlanadi; ishlar kelishuv bilan.');
    if (zBasin === 'afrosiyob' || zBasin === 'temur') lim.push('Tanlangan rezervuar joyi UNESCO hududida — u yerda qazish mumkin emas, boshqa joy kerak.');
    if (pzBasin === 'konservatsiya') lim.push('Rezervuar joyi bosh rejada konservatsiya zonasi (yashil hudud) — faqat yer osti, yuzasi park sifatida tiklanadi.');
    // 9) Variantlar va tavsiya
    const opts = [];
    opts.push({ id: 'C', nomi: 'Panjarali quduqlar + ariq/kollektorni tozalash', mos: Qneed < 0.3, izoh: `${inlets} ta panjarali quduq (har ~45 m), mavjud ariq va quvurlarni tozalash`, samara: Qneed < 0.3 ? 'yetarli' : `oʻzi yetarli emas — ${Qneed.toFixed(2)} m³/s qoʻshimcha sigʻim kerak` });
    if (outlet) opts.push({ id: 'A', nomi: 'Yomgʻir suvi kollektori (yer osti quvur)', mos: !!pipe && pipe.gravitatsion && !(zRoute.includes('afrosiyob')), izoh: pipe ? `${pipe.soni > 1 ? pipe.soni + ' × ' : ''}Ø${pipe.diametr_mm} mm, ${F(outlet.route.L)} m, qiyalik ${pipe.qiyalik_promille}‰ → ${outlet.kind}${outlet.name ? ' “' + outlet.name + '”' : ''}` : 'oqim kichik — kollektor shart emas', samara: pipe ? `${pipe.oʻtkazish_m3s} m³/s oʻtkazadi (kerak ${Qneed.toFixed(2)})` : '' });
    opts.push({ id: 'B', nomi: 'Yer osti saqlash rezervuari', mos: !!basinSite && !(zBasin === 'afrosiyob' || zBasin === 'temur'), izoh: `${F(retV)} m³ (≈ ${F(tankArea)} m², 2.5 m chuqur)${basinSite ? ` — ${basinSite.name}, ${basinSite.dd} m` : ' — yaqinda mos ochiq joy topilmadi'}`, samara: 'yomgʻir choʻqqisini ushlab, keyin sekin chiqaradi' });
    if (!outlet || (pipe && !pipe.gravitatsion)) opts.push({ id: 'D', nomi: 'Nasos stansiyasi', mos: true, izoh: `≥ ${Math.max(0.05, Qneed).toFixed(2)} m³/s — tabiiy (gravitatsion) chiqish yoʻq`, samara: 'elektr va xizmat koʻrsatish kerak' });
    // Tavsiya: oqim kichik — C yetarli; aks holda A (gravitatsion kollektor) → B (rezervuar) → D (nasos), har doim C bilan birga
    const o_ = id => opts.find(x => x.id === id), C0 = o_('C');
    const chosen = C0.mos ? [C0] : o_('A') && o_('A').mos ? [o_('A'), C0] : o_('B') && o_('B').mos ? [o_('B'), C0] : [o_('D') || o_('B'), C0].filter(Boolean);
    return {
      name, site, depth: top.d, wetLen, vol, zPit: Math.round(zPit), zTop: Math.round(zTop), basin, Aha: +Aha.toFixed(1), tc, Q: +Q.toFixed(2), Qex: +Qex.toFixed(2), Qneed: +Qneed.toFixed(2),
      outlet, pipe, retV, tankArea, basinSite, inlets, segs, lim, opts, best: chosen.map(x => x.id), zones: { joy: zSite, yoʻl: zRoute, rezervuar: zBasin, rezervuar_bosh_reja: pzBasin }, rain: i, drain: o.drainMm || 10,
      cellLL, step,
    };
  }
  const F = v => NX.fmt.int(v);

  // Xarita: havza (moviy kataklar), muammo joyi, kollektor yoʻli (oqim bilan), chiqish, rezervuar, quduqlar
  function items(X) {
    const out = [];
    const sk = Math.max(1, Math.ceil(X.basin.length / 4000));
    out.push({ kind: 'zone', id: 'HAVZA', cells: X.basin.filter((k, j) => j % sk === 0).map(k => { const ll = X.cellLL(k); return [ll[0], ll[1], 0.08]; }), lat: X.site[0], lon: X.site[1], color: '#38bdf8', list: false, title: `🌊 Suv yigʻish havzasi — ${X.Aha} ga`, note: `Yomgʻir suvi shu hududdan ${X.name} tomon oqadi.` });
    out.push({ kind: 'point', id: 'M', lat: X.site[0], lon: X.site[1], color: '#ef4444', title: `💧 Muammo: ${X.name} — ${Math.round(Math.min(1.2, X.depth) * 100)} sm`, note: `${F(X.wetLen)} m koʻchada suv, ~${F(X.vol)} m³ toʻplanadi.` });
    if (X.outlet) {
      const best = X.best.includes('A');
      out.push({ kind: 'line', id: 'K1', path: X.outlet.route.pts, lat: X.outlet.route.pts[Math.floor(X.outlet.route.pts.length / 2)][0], lon: X.outlet.route.pts[Math.floor(X.outlet.route.pts.length / 2)][1], color: best ? '#22d3ee' : '#94a3b8', dash: !best, ppl: 600, title: `🛠 Kollektor: ${X.pipe ? 'Ø' + X.pipe.diametr_mm + ' mm, ' : ''}${F(X.outlet.route.L)} m`, note: `${X.outlet.route.streets.join(' → ')} koʻchalari ostidan → ${X.outlet.kind}${X.outlet.name ? ' “' + X.outlet.name + '”' : ''}.` });
      out.push({ kind: 'point', id: 'CH', lat: X.outlet.c[0], lon: X.outlet.c[1], color: '#0ea5e9', title: `⬇ Chiqish: ${X.outlet.kind}${X.outlet.name ? ' “' + X.outlet.name + '”' : ''}`, note: `${X.outlet.z} m balandlikda (muammo joyidan ${Math.round(X.zPit - X.outlet.z)} m past).` });
    }
    if (X.basinSite) out.push({ kind: 'point', id: 'RZ', lat: X.basinSite.c[0], lon: X.basinSite.c[1], color: X.best.includes('B') ? '#a855f7' : '#64748b', title: `🛢 Rezervuar joyi: ${X.basinSite.name}`, note: `${F(X.retV)} m³ yer osti rezervuari (~${F(X.tankArea)} m²), muammodan ${X.basinSite.dd} m.` });
    // Panjarali quduqlar: suvli koʻcha boʻylab har ~45 m
    let acc = 0, n = 0;
    X.segs.slice().sort((a, b) => b.d - a.d).forEach(x => { acc += x.sg.len; if (acc >= 45 && n < 12) { acc = 0; n++; out.push({ kind: 'point', id: 'Q' + n, lat: x.sg.mid[0], lon: x.sg.mid[1], color: '#f59e0b', list: false, title: `▦ Panjarali quduq ${n}`, note: 'Yomgʻir suvi qabul qiluvchi quduq (dojdepriyomnik).' }); } });
    return out;
  }
  function facts(X) {
    return {
      muammo: { koʻcha: X.name, chuqurlik_sm: Math.round(Math.min(1.2, X.depth) * 100), suvli_uzunlik_m: X.wetLen, toʻplanadigan_hajm_m3: X.vol, balandlik_m: X.zPit },
      sabab: { havza_ga: X.Aha, havza_eng_baland_m: X.zTop, oqim_toʻplanish_vaqti_daq: X.tc, yomgir_mm_soat: X.rain, eng_yuqori_oqim_m3s: X.Q, mavjud_tizim_oladi_m3s: X.Qex, yetishmaydi_m3s: X.Qneed, izoh: 'havzadagi asfalt/tomlardan suv shu koʻchaning eng past joyiga oqadi; mavjud ariq/kanalizatsiya sigʻimi yetmaydi' },
      chiqish_joyi: X.outlet ? { turi: X.outlet.kind, nomi: X.outlet.name, balandligi_m: Math.round(X.outlet.z), masofa_koʻcha_boʻylab_m: X.outlet.route.L, koʻchalar: X.outlet.route.streets } : 'yaqin atrofda pastroq ariq/kanal topilmadi',
      quvur: X.pipe, rezervuar: { hajm_m3: X.retV, maydon_m2: X.tankArea, joy: X.basinSite }, panjarali_quduqlar: X.inlets,
      cheklovlar_bosh_reja_unesco: X.lim.length ? X.lim : ['muammo joyi va quvur yoʻli UNESCO hududidan tashqarida'], zonalar: X.zones,
      variantlar: X.opts, tavsiya: X.best,
      ogohlantirish: 'TAXMINIY muhandislik hisobi (relyef SRTM ~30 m, ratsional formula, Manning). Loyiha uchun geodezik syomka va mavjud kanalizatsiya xaritasi kerak.',
    };
  }
  function summary(X) {
    const L = [`**${X.name}: ${Math.round(Math.min(1.2, X.depth) * 100)} sm suv, ~${F(X.vol)} m³** — ${X.Aha} ga havzadan ${X.rain} mm/soat yomgʻirda ${X.Q} m³/s oqim keladi, mavjud tizim ~${X.Qex} m³/s oladi (yetishmaydi ${X.Qneed} m³/s).`];
    L.push('', '**Sabab**', `- Koʻcha havzaning eng past joyida (havza ${X.Aha} ga, eng balandi ${X.zTop} m, bu yer ${X.zPit} m); suv ~${X.tc} daqiqada yigʻiladi.`);
    L.push('', '**Variantlar**', ...X.opts.map(o => `- **${o.id}. ${o.nomi}** — ${o.izoh}${o.samara ? '; ' + o.samara : ''} ${o.mos ? '✅' : '⛔'}`));
    if (X.lim.length) L.push('', '**Bosh reja / UNESCO**', ...X.lim.map(t => '- ⚠️ ' + t));
    L.push('', `**Tavsiya:** ${X.best.map(id => X.opts.find(o => o.id === id).nomi).join(' + ')}. Xaritada: moviy — havza, havorang chiziq — kollektor, sariq — quduqlar.`);
    return L.join('\n');
  }

  // Loyiha sxemasi (SVG): boʻylama kesim — yer sathi, suv toʻplanadigan joy, quvur (1.5 m chuqurlikda, qiyalik), chiqish
  function svg(X) {
    const W = 560, Hh = 230, pad = { l: 46, r: 16, t: 26, b: 34 };
    const prof = X.outlet && X.outlet.profile && X.outlet.profile.length > 1 ? X.outlet.profile : null;
    const E = NX.esc;
    if (!prof) {
      // Chiqish yoʻq — rezervuar sxemasi
      return `<svg class="fix-svg" viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${Hh}" rx="12" fill="#06101f"/><text x="16" y="22" fill="#5eead4" font-size="13" font-weight="700">Loyiha sxemasi — yer osti rezervuari</text>
        <rect x="40" y="70" width="200" height="22" fill="#1e3a8a" opacity=".85"/><text x="140" y="62" fill="#cbd5e1" font-size="11" text-anchor="middle">${E(X.name)} — ${Math.round(Math.min(1.2, X.depth) * 100)} sm suv</text>
        <path d="M240 81 H330" stroke="#22d3ee" stroke-width="5"/><text x="285" y="74" fill="#a5f3fc" font-size="10" text-anchor="middle">quvur</text>
        <rect x="330" y="96" width="190" height="80" rx="6" fill="#0e7490" opacity=".55" stroke="#22d3ee"/><text x="425" y="140" fill="#ecfeff" font-size="12" text-anchor="middle">${F(X.retV)} m³</text><text x="425" y="158" fill="#a5f3fc" font-size="10" text-anchor="middle">~${F(X.tankArea)} m² × 2.5 m</text>
        <line x1="20" y1="94" x2="${W - 20}" y2="94" stroke="#a8a29e" stroke-width="2"/><text x="20" y="${Hh - 12}" fill="#64748b" font-size="10">Taxminiy sxema · loyiha uchun geodezik syomka kerak</text></svg>`;
    }
    const L = prof[prof.length - 1][0] || 1, zs = prof.map(p => p[1]);
    const pipeA = X.zPit - 1.5, pipeB = X.outlet.z + 0.5;
    const zmin = Math.min(...zs, pipeB) - 2, zmax = Math.max(...zs, X.zPit + 1.5) + 1;
    const sx = d => pad.l + (d / L) * (W - pad.l - pad.r), sy = z => pad.t + (1 - (z - zmin) / (zmax - zmin)) * (Hh - pad.t - pad.b);
    const ground = prof.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(' ');
    const fill = ground + ` L${sx(L).toFixed(1)} ${Hh - pad.b} L${pad.l} ${Hh - pad.b} Z`;
    const pond = Math.min(1.2, X.depth);
    const P0 = `M${sx(0)} ${sy(pipeA)} L${sx(L)} ${sy(pipeB)}`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => `<text x="${sx(L * t)}" y="${Hh - pad.b + 14}" fill="#64748b" font-size="9" text-anchor="middle">${F(L * t)} m</text>`).join('');
    const zt = [zmin + 1, (zmin + zmax) / 2, zmax - 1].map(z => `<text x="${pad.l - 6}" y="${sy(z) + 3}" fill="#64748b" font-size="9" text-anchor="end">${Math.round(z)}</text>`).join('');
    return `<svg class="fix-svg" viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#78716c" stop-opacity=".55"/><stop offset="1" stop-color="#1c1917" stop-opacity=".2"/></linearGradient>
      <linearGradient id="gP" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs>
      <rect width="${W}" height="${Hh}" rx="12" fill="#06101f"/>
      <text x="16" y="18" fill="#5eead4" font-size="13" font-weight="700">Loyiha sxemasi — boʻylama kesim (taxminiy)</text>
      ${zt}${ticks}
      <path d="${fill}" fill="url(#gS)"/><path d="${ground}" fill="none" stroke="#d6d3d1" stroke-width="2"/>
      <rect x="${sx(0) - 2}" y="${sy(X.zPit + pond)}" width="${Math.max(14, sx(Math.min(L * 0.12, X.wetLen)) - sx(0))}" height="${sy(X.zPit) - sy(X.zPit + pond)}" fill="#2563eb" opacity=".8"><animate attributeName="opacity" values=".55;.9;.55" dur="2.4s" repeatCount="indefinite"/></rect>
      <path d="${P0}" stroke="url(#gP)" stroke-width="7" stroke-linecap="round"/>
      <path d="${P0}" stroke="#ecfeff" stroke-width="2" stroke-dasharray="6 10"><animate attributeName="stroke-dashoffset" from="32" to="0" dur="1s" repeatCount="indefinite"/></path>
      <circle cx="${sx(L)}" cy="${sy(X.outlet.z)}" r="7" fill="#0ea5e9" stroke="#e0f2fe" stroke-width="2"/>
      <text x="${sx(0) + 4}" y="${sy(X.zPit + pond) - 8}" fill="#93c5fd" font-size="11">💧 ${E(X.name)} · ${Math.round(pond * 100)} sm</text>
      <text x="${sx(L) - 4}" y="${sy(X.outlet.z) - 12}" fill="#7dd3fc" font-size="11" text-anchor="end">⬇ ${E(X.outlet.kind)}${X.outlet.name ? ' “' + E(X.outlet.name) + '”' : ''}</text>
      <text x="${sx(L / 2)}" y="${(sy(pipeA) + sy(pipeB)) / 2 + 20}" fill="#a5f3fc" font-size="11" text-anchor="middle">${X.pipe ? `${X.pipe.soni > 1 ? X.pipe.soni + ' × ' : ''}Ø${X.pipe.diametr_mm} mm · ${X.pipe.qiyalik_promille}‰ · ${F(L)} m` : 'quvur'}</text>
      <text x="16" y="${Hh - 6}" fill="#64748b" font-size="9">Gorizontal ${F(L)} m · vertikal masshtab kattalashtirilgan · relyef SRTM ~30 m</text></svg>`;
  }

  NX.drainfix = { solve, items, facts, summary, svg, waterways, pipeD };
})();
