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
      // 1) Tayyor fayl (Overture: OSM ariq, zovur, kanal, soy, daryo) — Overpass’ga bogʻliq emas
      try { const r = await fetch('data/places-samarqand.json'); if (r.ok) { const d = await r.json(); if (d.waterways && d.waterways.length) return d.waterways; } } catch (e) { /* zaxira — Overpass */ }
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
    // Koʻcha nomi: tugmadan yoki savol matnidan (2D natijadagi barcha koʻcha nomlari bilan solishtiriladi). Topilmasa — boshqa joy KOʻRSATILMAYDI.
    const core = t => nm(t).replace(/[-–]/g, ' ').replace(/\s+(kochasi|koʻchasi|shoh kochasi|yoli|mavzesi|massivi|tor kochasi)\b.*$/, '').replace(/\s+/g, ' ').trim();
    let want = o.name ? core(o.name) : null;
    if (!want && o.q) { const qn = nm(o.q); const c = [...new Set(R.segs.map(s2 => s2.name).filter(Boolean))].map(n => ({ n, c: core(n) })).filter(x => x.c.length >= 4 && qn.includes(x.c)).sort((a, b) => b.c.length - a.c.length)[0]; if (c) want = c.c; }
    if (want) {
      const f = pick.filter(x => { const c = core(x.sg.name); return c && (c === want || c.includes(want) || want.includes(c)); });
      if (!f.length) return { notFound: true, asked: o.name || want, suggest: (R.streets || []).slice(0, 6).map(x => x.name) };
      pick = f;
    }
    if (o.poly) { const f = pick.filter(x => NX.area.inside(o.poly, x.sg.mid[0], x.sg.mid[1])); if (f.length) pick = f; }
    if (o.point) { const [px, py] = G.xy(o.point[0], o.point[1]); pick = pick.map(x => { const [sx, sy] = G.xy(x.sg.mid[0], x.sg.mid[1]); return Object.assign(x, { dd: Math.hypot(sx - px, sy - py) }); }).filter(x => x.dd < 400); }
    if (!pick.length) return null;
    const top = pick.reduce((b, x) => (x.d > b.d ? x : b), pick[0]);
    const name = top.sg.name || o.name || 'nomsiz koʻcha', site = top.sg.mid;
    // Shu koʻchaning suvli boʻlaklari (bir xil nom, 600 m ichida)
    const [sx0, sy0] = G.xy(site[0], site[1]);
    const segs = R.segs.map((sg, i) => ({ sg, d: maxD[i] })).filter(x => x.d >= 0.05 && (x.sg.name || '') === (top.sg.name || '') && (() => { const [px, py] = G.xy(x.sg.mid[0], x.sg.mid[1]); return Math.hypot(px - sx0, py - sy0) < 600; })());
    const segsW = segs;
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
    // Mavjud ariq/kanallar: shu koʻcha boʻyida (25 m) va atrofda (800 m)
    const dPt = (a, b) => { const [ax, ay] = G.xy(a[0], a[1]), [bx, by] = G.xy(b[0], b[1]); return Math.hypot(ax - bx, ay - by); };
    const nearWW = ww.map(w => { let dmin = Infinity, onStreet = 0; w.pts.forEach(p => { const d = dPt(p, site); if (d < dmin) dmin = d; }); segsW.forEach(x => { if (w.pts.some(p => dPt(p, x.sg.mid) < 25)) onStreet++; }); return { name: w.name, kind: WW_UZ[w.kind] || 'ariq', d: Math.round(dmin), onStreet, pts: w.pts }; }).filter(w => w.d < 800).sort((a, b) => a.d - b.d).slice(0, 8);
    const streetDitch = nearWW.filter(w => w.onStreet >= 2);
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
    for (const c of cands.slice(0, 15)) { const t = nearNode(c.c[0], c.c[1], 700); if (!t || seenNode.has(t)) continue; seenNode.add(t); const r = route(src, t); if (r && r.L >= 30 && r.L <= 6000 && (!outlet || r.L < outlet.route.L)) outlet = Object.assign(c, { route: r }); }
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
    // E — ochiq betonli lotok (ariq) koʻcha cheti boʻylab: UNESCO hududidan tashqarida va gravitatsion chiqish boʻlsa — eng arzon va tez
    let lotok = null;
    if (outlet && pipe && pipe.gravitatsion) {
      const S = pipe.qiyalik_promille / 1000, h = 0.6, nC = 0.015;
      let b = 0.4; while (b < 4 && (1 / nC) * (b * h) * Math.pow((b * h) / (b + 2 * h), 2 / 3) * Math.sqrt(S) < Qneed) b += 0.1;
      lotok = { kenglik_m: +b.toFixed(1), chuqurlik_m: h, uzunlik_m: outlet.route.L, qazish_m3: Math.round(outlet.route.L * (b + 0.4) * (h + 0.3)) };
    }
    const unescoRoute = zRoute.some(z => z === 'temur' || z === 'yevropa' || z === 'afrosiyob') || zSite === 'temur' || zSite === 'yevropa' || zSite === 'afrosiyob';
    if (lotok) opts.push({ id: 'E', nomi: 'Ochiq betonli lotok (ariq) koʻcha cheti boʻylab', mos: !unescoRoute && lotok.kenglik_m <= 2, izoh: `${lotok.kenglik_m} m × ${lotok.chuqurlik_m} m, ${F(lotok.uzunlik_m)} m, ustiga panjarali qopqoq`, samara: unescoRoute ? 'UNESCO hududida ochiq ariq mumkin emas' : lotok.kenglik_m > 2 ? 'juda keng — quvur yaxshiroq' : 'eng arzon va tez quriladi' });
    const pumpN = Math.max(1, Math.ceil(vol / (300 * 2)));    // 300 m³/soat koʻchma nasos, 2 soatda
    opts.unshift({ id: 'P', nomi: 'Tezkor: koʻchma nasoslar (yomgʻir paytida)', mos: true, izoh: `${pumpN} ta × 300 m³/soat nasos, ${outlet ? 'shlang/quvur bilan ⬇ chiqish joyiga' : 'suv tashuvchi mashinalarga'}`, samara: `~${F(vol)} m³ suvni ~2 soatda olib chiqadi` });
    // Tavsiya va ish tartibi: ① tezkor nasos → ② quduqlar (+ariq tozalash) → ③ asosiy inshoot (E/A/B/D) → ④ chiqish
    const o_ = id => opts.find(x => x.id === id), C0 = o_('C');
    const main = C0.mos ? null : o_('E') && o_('E').mos ? o_('E') : o_('A') && o_('A').mos ? o_('A') : o_('B') && o_('B').mos ? o_('B') : o_('D') || o_('B');
    const chosen = [o_('P'), C0, main].filter(Boolean);
    return {
      name, site, depth: top.d, wetLen, vol, zPit: Math.round(zPit), zTop: Math.round(zTop), basin, Aha: +Aha.toFixed(1), tc, Q: +Q.toFixed(2), Qex: +Qex.toFixed(2), Qneed: +Qneed.toFixed(2),
      outlet, pipe, lotok, pumpN, nearWW, streetDitch, retV, tankArea, basinSite, inlets, segs, lim, opts, best: chosen.map(x => x.id), main: main ? main.id : null, zones: { joy: zSite, yoʻl: zRoute, rezervuar: zBasin, rezervuar_bosh_reja: pzBasin }, rain: i, drain: o.drainMm || 10,
      cellLL, step,
    };
  }
  const F = v => NX.fmt.int(v);

  // Ish tartibi (xaritadagi raqamlar bilan bir xil): ① nasos, ② quduqlar, ③ asosiy inshoot yoʻli, ④ chiqish, ⑤ rezervuar
  const MAINC = { E: '#2dd4bf', A: '#22d3ee', B: '#a855f7', D: '#f97316' };
  function steps(X) {
    const S = [];
    const dep = Math.round(Math.min(1.2, X.depth) * 100);
    S.push({ n: 1, col: '#ef4444', belgi: '①', nima: `Muammo joyi — ${X.name}`, qilish: `Yomgʻir paytida ${X.pumpN} ta koʻchma nasos (300 m³/soat) qoʻyiladi`, olcham: `${dep} sm suv, ~${F(X.vol)} m³` });
    S.push({ n: 2, col: '#f59e0b', belgi: '② (sariq nuqtalar)', nima: 'Panjarali quduqlar', qilish: `${X.inlets} ta quduq har ~45 m${X.streetDitch.length ? `; mavjud ariq (“${X.streetDitch[0].name || X.streetDitch[0].kind}”) tozalanadi` : '; koʻchada ariq yoʻq — quduqlar quvurga ulanadi'}`, olcham: `${F(X.wetLen)} m koʻcha` });
    if (X.main && X.outlet && (X.main === 'E' || X.main === 'A')) {
      const E_ = X.main === 'E';
      S.push({ n: 3, col: MAINC[X.main], belgi: '③ (chiziq, oqim bilan)', nima: E_ ? 'Ochiq betonli lotok (ariq)' : 'Yer osti kollektor (quvur)', qilish: `${X.outlet.route.streets.join(' → ')} boʻylab ${E_ ? 'koʻcha chetidan ariq qaziladi' : 'koʻcha ostidan quvur yotqiziladi'}`, olcham: E_ ? `${X.lotok.kenglik_m} × ${X.lotok.chuqurlik_m} m, ${F(X.outlet.route.L)} m, ~${F(X.lotok.qazish_m3)} m³ qazish` : `${X.pipe.soni > 1 ? X.pipe.soni + ' × ' : ''}Ø${X.pipe.diametr_mm} mm, ${F(X.outlet.route.L)} m, qiyalik ${X.pipe.qiyalik_promille}‰` });
    }
    if (X.outlet) S.push({ n: 4, col: '#0ea5e9', belgi: '④', nima: `Chiqish — ${X.outlet.kind}${X.outlet.name ? ' “' + X.outlet.name + '”' : ''}`, qilish: 'Suv shu yerga tushiriladi (oʻz oqimi bilan)', olcham: `${Math.round(X.zPit - X.outlet.z)} m pastda` });
    if (X.main === 'B' && X.basinSite) S.push({ n: 5, col: MAINC.B, belgi: '⑤', nima: `Yer osti rezervuari — ${X.basinSite.name}`, qilish: 'Yomgʻir choʻqqisini ushlab, keyin sekin chiqaradi; yuzasi park sifatida tiklanadi', olcham: `${F(X.retV)} m³ (~${F(X.tankArea)} m² × 2.5 m)` });
    if (X.main === 'D') S.push({ n: 5, col: MAINC.D, belgi: '⑤', nima: 'Nasos stansiyasi', qilish: 'Doimiy nasos stansiyasi muammo joyi yonida', olcham: `≥ ${X.Qneed} m³/s` });
    return S;
  }

  // Xarita: havza, mavjud ariqlar, ① muammo/nasos, ② quduqlar, ③ yoʻl (oqim bilan), ④ chiqish, ⑤ rezervuar
  function items(X) {
    const out = [], st = steps(X), mid = p => p[Math.floor(p.length / 2)];
    const sk = Math.max(1, Math.ceil(X.basin.length / 4000));
    out.push({ kind: 'zone', id: 'HAVZA', cells: X.basin.filter((k, j) => j % sk === 0).map(k => { const ll = X.cellLL(k); return [ll[0], ll[1], 0.06]; }), lat: X.site[0], lon: X.site[1], color: '#38bdf8', list: false, title: `🌊 Suv yigʻish havzasi — ${X.Aha} ga`, note: `Yomgʻir suvi shu hududdan ${X.name} tomon oqadi.` });
    X.nearWW.forEach((w, k) => out.push({ kind: 'line', id: 'AR' + (k + 1), path: w.pts, lat: w.pts[0][0], lon: w.pts[0][1], color: '#14b8a6', dash: true, list: k < 3, title: `〰 Mavjud ${w.kind}${w.name ? ' “' + w.name + '”' : ''}`, note: `${w.onStreet >= 2 ? 'Shu koʻcha boʻyida' : `Muammo joyidan ${w.d} m`} (OpenStreetMap).` }));
    const s1 = st.find(x => x.n === 1);
    out.push({ kind: 'point', id: '1', lat: X.site[0], lon: X.site[1], color: s1.col, title: `① ${s1.nima}`, note: `${s1.olcham}. ${s1.qilish}.` });
    const s3 = st.find(x => x.n === 3);
    if (X.outlet) {
      out.push({ kind: 'line', id: '3', path: X.outlet.route.pts, lat: mid(X.outlet.route.pts)[0], lon: mid(X.outlet.route.pts)[1], color: s3 ? s3.col : '#64748b', dash: !s3, ppl: 600, title: s3 ? `③ ${s3.nima}` : '③ Mumkin boʻlgan quvur yoʻli (tavsiya etilmaydi)', note: s3 ? `${s3.olcham}. ${s3.qilish}.` : '' });
      const s4 = st.find(x => x.n === 4);
      out.push({ kind: 'point', id: '4', lat: X.outlet.c[0], lon: X.outlet.c[1], color: s4.col, title: `④ ${s4.nima}`, note: `${s4.olcham}. ${s4.qilish}.` });
    }
    const s5 = st.find(x => x.n === 5);
    if (s5 && X.main === 'B' && X.basinSite) out.push({ kind: 'point', id: '5', lat: X.basinSite.c[0], lon: X.basinSite.c[1], color: s5.col, title: `⑤ ${s5.nima}`, note: `${s5.olcham}. ${s5.qilish}.` });
    if (s5 && X.main === 'D') out.push({ kind: 'point', id: '5', lat: X.site[0] + 0.0004, lon: X.site[1] + 0.0004, color: s5.col, title: `⑤ ${s5.nima}`, note: `${s5.olcham}.` });
    let acc = 0, n = 0;
    X.segs.slice().sort((a, b) => b.d - a.d).forEach(x => { acc += x.sg.len; if (acc >= 45 && n < 14) { acc = 0; n++; out.push({ kind: 'point', id: 'Q' + n, lat: x.sg.mid[0], lon: x.sg.mid[1], color: '#f59e0b', list: false, title: `② Panjarali quduq ${n}`, note: 'Yomgʻir suvini qabul qiluvchi quduq.' }); } });
    return out;
  }
  function facts(X) {
    return {
      muammo: { koʻcha: X.name, chuqurlik_sm: Math.round(Math.min(1.2, X.depth) * 100), suvli_uzunlik_m: X.wetLen, toʻplanadigan_hajm_m3: X.vol, balandlik_m: X.zPit },
      sabab: { havza_ga: X.Aha, havza_eng_baland_m: X.zTop, oqim_toʻplanish_vaqti_daq: X.tc, yomgir_mm_soat: X.rain, eng_yuqori_oqim_m3s: X.Q, mavjud_tizim_oladi_m3s: X.Qex, qoʻshimcha_kerak_m3s: X.Qneed },
      mavjud_ariqlar: { shu_koʻchada: X.streetDitch.length ? [...new Set(X.streetDitch.map(w => (w.kind + ' ' + (w.name || '')).trim()))] : 'shu koʻcha boʻyida ariq ochiq xaritada (OSM) belgilanmagan — joyida tekshirish kerak', atrofda: [...new Map(X.nearWW.map(w => [w.kind + '|' + w.name, { turi: w.kind, nomi: w.name, masofa_m: w.d }])).values()] },
      chiqish_joyi: X.outlet ? { turi: X.outlet.kind, nomi: X.outlet.name, balandligi_m: Math.round(X.outlet.z), masofa_koʻcha_boʻylab_m: X.outlet.route.L, koʻchalar: X.outlet.route.streets } : 'yaqin atrofda pastroq ariq/kanal topilmadi',
      quvur: X.pipe, lotok: X.lotok, rezervuar: { hajm_m3: X.retV, maydon_m2: X.tankArea, joy: X.basinSite }, panjarali_quduqlar: X.inlets, koʻchma_nasoslar: X.pumpN,
      cheklovlar_bosh_reja_unesco: X.lim.length ? X.lim : ['muammo joyi va yoʻl UNESCO hududidan tashqarida'], zonalar: X.zones,
      variantlar: X.opts, tavsiya: X.best,
      ish_tartibi_xaritadagi_raqamlar: steps(X).map(x => ({ raqam: x.belgi, nima: x.nima, nima_qilinadi: x.qilish, olcham: x.olcham })),
      ogohlantirish: 'TAXMINIY muhandislik hisobi (relyef SRTM ~30 m, ratsional formula, Manning). Loyiha uchun geodezik syomka va mavjud kanalizatsiya xaritasi kerak.',
    };
  }
  function summary(X) {
    const L = [`**${X.name}: ${Math.round(Math.min(1.2, X.depth) * 100)} sm suv, ~${F(X.vol)} m³.** ${X.Aha} ga havzadan ${X.rain} mm/soat yomgʻirda ${X.Q} m³/s oqim keladi; mavjud tizim ~${X.Qex} m³/s oladi — yana ${X.Qneed} m³/s sigʻim kerak.`];
    L.push('', '**Sabab**', `- Koʻcha havzaning eng past joyida (${X.zPit} m; havzaning eng balandi ${X.zTop} m) — suv ~${X.tc} daqiqada shu yerga yigʻiladi.`, `- ${X.streetDitch.length ? `Koʻcha boʻyida ${X.streetDitch[0].kind} bor, lekin sigʻimi yetmaydi yoki tiqilgan.` : 'Koʻcha boʻyida ariq ochiq xaritada (OpenStreetMap) belgilanmagan — joyida tekshirish kerak; belgilangan suv chiqish yoʻli yoʻq.'}`);
    L.push('', '**Nima qilish kerak (xaritadagi raqamlar)**', ...steps(X).map(x => `- **${x.belgi} ${x.nima}** — ${x.qilish}; ${x.olcham}.`));
    const rej = X.opts.filter(o => !X.best.includes(o.id) && o.id !== 'P');
    if (rej.length) L.push('', '**Boshqa variantlar**', ...rej.map(o => `- ${o.nomi} — ${o.izoh}${o.samara ? '; ' + o.samara : ''} ${o.mos ? '' : '⛔'}`));
    if (X.lim.length) L.push('', '**Bosh reja / UNESCO**', ...X.lim.map(t => '- ⚠️ ' + t));
    return L.join('\n');
  }

  // Sunʼiy yoʻldosh surati (Esri) ustida loyiha: suv, havza chegarasi, ariqlar, ③ yoʻl, raqamli belgilar
  function satImage(X, water) {
    const pts = [X.site]; if (X.outlet) X.outlet.route.pts.forEach(p => pts.push(p)); if (X.basinSite && X.main === 'B') pts.push(X.basinSite.c);
    let s0 = 90, w0 = 180, n0 = -90, e0 = -180; pts.forEach(p => { s0 = Math.min(s0, p[0]); n0 = Math.max(n0, p[0]); w0 = Math.min(w0, p[1]); e0 = Math.max(e0, p[1]); });
    const padLat = Math.max(0.0012, (n0 - s0) * 0.15), padLon = Math.max(0.0016, (e0 - w0) * 0.15);
    s0 -= padLat; n0 += padLat; w0 -= padLon; e0 += padLon;
    const wx = (lon, z) => ((lon + 180) / 360) * 256 * Math.pow(2, z), wy = (lat, z) => { const r = lat * Math.PI / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * Math.pow(2, z); };
    let z = 18; while (z > 12 && (wx(e0, z) - wx(w0, z) > 1100 || wy(s0, z) - wy(n0, z) > 800)) z--;
    const X0 = wx(w0, z), Y0 = wy(n0, z), W = Math.round(wx(e0, z) - X0), H = Math.round(wy(s0, z) - Y0);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), P = p => [wx(p[1], z) - X0, wy(p[0], z) - Y0];
    const tiles = [];
    for (let tx = Math.floor(X0 / 256); tx <= Math.floor((X0 + W) / 256); tx++) for (let ty = Math.floor(Y0 / 256); ty <= Math.floor((Y0 + H) / 256); ty++) tiles.push({ tx, ty });
    return new Promise(resolve => {
      let left = tiles.length, bad = 0;
      const draw = () => {
        g.fillStyle = 'rgba(2,6,16,.18)'; g.fillRect(0, 0, W, H);
        g.lineCap = 'round'; g.lineJoin = 'round';
        // Mavjud ariqlar
        X.nearWW.forEach(w => { g.setLineDash([6, 5]); g.strokeStyle = '#2dd4bf'; g.lineWidth = 2.5; g.beginPath(); w.pts.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.setLineDash([]); });
        // Suv
        (water || []).forEach(sg => { const a = P(sg.a), b = P(sg.b); g.strokeStyle = sg.d >= 0.3 ? 'rgba(37,99,235,.9)' : 'rgba(96,165,250,.85)'; g.lineWidth = sg.d >= 0.3 ? 7 : 4; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
        // ③ yoʻl
        const st = steps(X), s3 = st.find(x => x.n === 3);
        if (X.outlet) { const col = s3 ? s3.col : '#94a3b8'; g.strokeStyle = 'rgba(2,6,16,.75)'; g.lineWidth = 10; g.beginPath(); X.outlet.route.pts.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.strokeStyle = col; g.lineWidth = 5; if (!s3) g.setLineDash([10, 8]); g.stroke(); g.setLineDash([]);
          // yoʻnalish oʻqlari
          const rp = X.outlet.route.pts; for (let i = 2; i < rp.length; i += Math.max(2, Math.floor(rp.length / 8))) { const a = P(rp[i - 1]), b = P(rp[i]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]); g.save(); g.translate(b[0], b[1]); g.rotate(ang); g.fillStyle = '#ecfeff'; g.beginPath(); g.moveTo(6, 0); g.lineTo(-5, -5); g.lineTo(-5, 5); g.fill(); g.restore(); } }
        // Quduqlar
        let acc = 0, n = 0; X.segs.slice().sort((a, b) => b.d - a.d).forEach(x => { acc += x.sg.len; if (acc >= 45 && n < 14) { acc = 0; n++; const q = P(x.sg.mid); g.fillStyle = '#f59e0b'; g.strokeStyle = '#fff7ed'; g.lineWidth = 1.5; g.fillRect(q[0] - 4, q[1] - 4, 8, 8); g.strokeRect(q[0] - 4, q[1] - 4, 8, 8); } });
        // Raqamli belgilar
        const pin = (p, t, col) => { const q = P(p); g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(q[0], q[1], 13, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 14px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, q[0], q[1] + 1); };
        pin(X.site, '1', '#ef4444');
        if (X.outlet) { pin(X.outlet.route.pts[Math.floor(X.outlet.route.pts.length / 2)], '3', s3 ? s3.col : '#64748b'); pin(X.outlet.c, '4', '#0ea5e9'); }
        if (X.main === 'B' && X.basinSite) pin(X.basinSite.c, '5', '#a855f7');
        // Izoh
        g.fillStyle = 'rgba(2,6,16,.82)'; g.fillRect(8, H - 30, Math.min(W - 16, 520), 22); g.fillStyle = '#e2e8f0'; g.font = '11px system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText('Sunʼiy yoʻldosh: Esri, Maxar · ko‘k — suv, ▪ quduq, 〰 mavjud ariq, raqamlar — ish tartibi (taxminiy)', 14, H - 15);
        let url = null; try { url = c.toDataURL('image/jpeg', 0.86); } catch (e) { url = null; }
        resolve(bad === tiles.length ? null : url);
      };
      tiles.forEach(t => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { g.drawImage(im, t.tx * 256 - X0, t.ty * 256 - Y0); if (--left === 0) draw(); }; im.onerror = () => { bad++; if (--left === 0) draw(); }; im.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${t.ty}/${t.tx}`; });
      setTimeout(() => { if (left > 0) { left = 0; draw(); } }, 12000);
    });
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

  NX.drainfix = { solve, items, facts, summary, steps, svg, satImage, waterways, pipeD };
})();
