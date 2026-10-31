/* City Jam — Samarqand bosh rejasi va UNESCO himoya zonalari: qurilish yoki oʻzgartirish bosh rejaga zid emasmi.
   Manbalar (ochiq): Bosh reja 2045 loyihasi (regulation.adliya.uz, loyiha 8969), Kun.uz / UzDaily (2026-may),
   UNESCO WHC 603 (“Samarqand — madaniyatlar chorrahasi”: hudud 1 123 ga, bufer zona 1 369 ga).
   Bosh rejaning GIS xaritasi ochiq eʼlon qilinmagan: rasmiy zonalar fayli “Tizimlar → Bosh reja” orqali yuklanadi.
   UNESCO chegarasi — OpenStreetMap’dan (boʻlsa); boʻlmasa — asosiy yodgorliklar atrofida TAXMINIY zona. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;

  // Bosh reja 2045 (loyiha) — asosiy koʻrsatkichlar
  const PLAN = {
    nomi: 'Samarqand shahrining 2045-yilgacha bosh rejasi (Vazirlar Mahkamasi qarori loyihasi)',
    holati: 'loyiha — jamoatchilik muhokamasida (2026-may); birinchi bosqich 2030-yilgacha',
    maydon_ga: { hozir: 11272, reja_2045: 28415 },
    aholi: { hozir: 560000, reja_2045: '1–1.2 mln' },
    yollar_km: { hozir: 527, yangi: 837, kengaytiriladi: 160 },
    tramvay: '27 yoʻnalish',
    yashil_hudud_ga: { hozir: 9461, qoʻshimcha: 11000, yashil_kamar: '18 000 ga (boshqa manbada 3 532 ga, Yangi Katta halqa yoʻli boʻylab 102.7 km)' },
    zonalar: {
      konservatsiya: 'yangi qurilish TAQIQLANADI; tarixiy-madaniy meros va noyob yashil hududlar alohida himoyada',
      rekonstruksiya: 'mavjud binolarni taʼmirlash va shaharsozlik talablariga moslashtirish',
      renovatsiya: 'eski fondni yangilash — yangi qurilish mumkin (loyiha va ruxsat bilan)',
    },
    unesco: 'Tarixiy markazdagi har qanday oʻzgarish xalqaro ekspertlar bilan kelishiladi; UNESCO hududi va bufer zonasida qurilish/buzish Madaniy meros agentligi ruxsati bilan',
    manbalar: [
      { title: 'Kun.uz — Samarqand 2045 bosh rejasi (2026-05-14)', url: 'https://kun.uz/en/news/2026/05/14/samarkand-to-triple-in-size-and-double-population-under-new-master-plan-through-2045' },
      { title: 'UzDaily — Samarkand Master Plan to 2045', url: 'https://www.uzdaily.uz/en/uzbekistan-publishes-samarkand-master-plan-to-2045/' },
      { title: 'NHH loyihalari portali — loyiha 8969', url: 'https://regulation.adliya.uz/project/8969/29309?contentLang=uz' },
      { title: 'UNESCO — Samarkand, Crossroad of Cultures (603)', url: 'https://whc.unesco.org/en/list/603/' },
    ],
  };

  // Asosiy yodgorliklar (UNESCO tarkibi) — OSM chegarasi topilmasa, taxminiy zona shular atrofida
  const MONUMENTS = [
    { name: 'Registon maydoni', c: [39.6547, 66.9757], r: 350 },
    { name: 'Bibixonim masjidi', c: [39.6606, 66.9796], r: 300 },
    { name: 'Shohi Zinda', c: [39.6627, 66.9878], r: 300 },
    { name: 'Goʻri Amir maqbarasi', c: [39.6484, 66.9690], r: 250 },
    { name: 'Afrosiyob shahar xarobalari', c: [39.6700, 66.9940], r: 900 },
    { name: 'Ulugʻbek rasadxonasi', c: [39.6747, 67.0054], r: 250 },
    { name: 'Hazrati Xizr masjidi', c: [39.6625, 66.9853], r: 150 },
  ];
  const BUFFER_M = 500;   // taxminiy bufer: yodgorlik zonasi chetidan 500 m

  // UNESCO / muhofaza chegarasi — OpenStreetMap (bir marta, 30 kun saqlanadi)
  let unescoP = null;
  function unesco() {
    if (unescoP) return unescoP;
    unescoP = (async () => {
      const hit = await NX.bigStore.get('unesco:v1');
      if (hit && Date.now() - hit.ts < 30 * 86400e3) return hit;
      const C = NX.twin.CITY, bb = `${C.s},${C.w},${C.n},${C.e}`;
      const q = `[out:json][timeout:40];(relation["heritage"="1"](${bb});way["heritage"="1"](${bb});relation["heritage:operator"="whc"](${bb});way["heritage:operator"="whc"](${bb});relation["boundary"="protected_area"]["protect_class"="22"](${bb});way["boundary"="protected_area"]["protect_class"="22"](${bb}););out geom;`;
      for (const url of NX.config.overpassMirrors) {
        try {
          const r = await NX.fetchJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 45000);
          if (!r.ok || !r.data || !r.data.elements) continue;
          const polys = [];
          r.data.elements.forEach(e => {
            const name = (e.tags && (e.tags['name:uz'] || e.tags.name)) || 'Muhofaza hududi';
            const rings = e.type === 'way' ? [e.geometry] : (e.members || []).filter(m => m.role !== 'inner' && m.geometry).map(m => m.geometry);
            rings.forEach(g => { if (g && g.length > 3) polys.push({ name, ring: g.map(p => [p.lat, p.lon]) }); });
          });
          const out = { ts: Date.now(), polys, src: polys.length ? 'OpenStreetMap' : null };
          NX.bigStore.set('unesco:v1', out);
          return out;
        } catch (e) { /* keyingi server */ }
      }
      return { ts: 0, polys: [], src: null };
    })().catch(() => ({ polys: [], src: null }));
    return unescoP;
  }

  const inside = (ring, lat, lon) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [yi, xi] = ring[i], [yj, xj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const dist = (a, b) => { const [ax, ay] = G.xy(a[0], a[1]), [bx, by] = G.xy(b[0], b[1]); return Math.hypot(ax - bx, ay - by); };
  // Hudud (poligon) yoki nuqta uchun tekshiruv nuqtalari: markaz + chegara nuqtalari
  const probes = (poly, center) => (poly && poly.length ? poly.concat([center]) : [center]);

  // Yuklangan rasmiy bosh reja qatlamidan zona turi va ruxsat etilgan qavat
  const zoneType = p => {
    const t = String(p.zona || p.zone || p.tur || p.type || p.kind || p.landuse || p.name || '').toLowerCase();
    if (/konserv|conserv|muhofaza|himoya|meros|heritage/.test(t)) return 'konservatsiya';
    if (/rekonstr|reconstr/.test(t)) return 'rekonstruksiya';
    if (/renov|redevelop|yangilan/.test(t)) return 'renovatsiya';
    if (/yashil|green|park|bog/.test(t)) return 'yashil hudud';
    if (/sanoat|industr|ishlab/.test(t)) return 'sanoat';
    if (/turar|resid|uy-joy|housing/.test(t)) return 'turar joy';
    if (/yo.l|road|transport|koʻcha/.test(t)) return 'yoʻl / transport';
    return t || 'zona';
  };
  const maxFloors = p => { const v = parseFloat(p.max_floors || p.maxFloors || p.qavat || p.max_qavat || p.etaj || p.floors); return isFinite(v) ? v : null; };

  // Asosiy tekshiruv: { center, poly, floors } → zonalar, UNESCO, ziddiyatlar, qoidalar
  async function check(opt) {
    const center = opt.center, poly = opt.poly, P = probes(poly, center), out = { zonalar: [], unesco: null, ziddiyatlar: [], qoidalar: [], manba: [] };
    // 1) Rasmiy bosh reja qatlami (yuklangan boʻlsa)
    const mp = NX.systems.get('masterplan');
    if (mp) {
      out.manba.push('rasmiy bosh reja qatlami (yuklangan: ' + (mp.name || 'fayl') + ')');
      mp.gj.features.forEach(f => {
        const g = f.geometry; if (!g) return;
        const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
        rings.forEach(r => {
          const ring = r.map(c => [c[1], c[0]]);
          if (!P.some(p => inside(ring, p[0], p[1]))) return;
          const t = zoneType(f.properties || {}), mf = maxFloors(f.properties || {});
          out.zonalar.push({ zona: t, ruxsat_qavat: mf, nomi: (f.properties || {}).name || '' });
          if (t === 'konservatsiya') out.ziddiyatlar.push('Hudud bosh rejadagi KONSERVATSIYA zonasiga tushadi — yangi qurilish taqiqlanadi.');
          if (t === 'yashil hudud' && opt.build) out.ziddiyatlar.push('Bosh rejada bu yer yashil hudud — qurilish uchun emas.');
          if (t === 'sanoat' && opt.build) out.ziddiyatlar.push('Bosh rejada bu yer sanoat zonasi — turar joy qurilishi mos emas.');
          if (mf != null && opt.floors && opt.floors > mf) out.ziddiyatlar.push(`Bosh reja boʻyicha bu zonada ${mf} qavatgacha ruxsat — rejadagi ${opt.floors} qavat oshib ketadi.`);
        });
      });
    } else out.qoidalar.push('Rasmiy bosh reja zonalari fayli hali yuklanmagan (Tizimlar → Bosh reja) — zona turi va qavat cheklovi aniq tekshirilmadi.');
    // 2) UNESCO / muhofaza
    const U = await unesco();
    if (U.polys && U.polys.length) {
      const hit = U.polys.find(z => P.some(p => inside(z.ring, p[0], p[1])));
      let near = Infinity, nearName = '';
      U.polys.forEach(z => z.ring.forEach(q => { const d = dist(center, q); if (d < near) { near = d; nearName = z.name; } }));
      out.unesco = { manba: 'OpenStreetMap (muhofaza chegarasi)', ichida: !!hit, nomi: hit ? hit.name : nearName, chegaragacha_m: hit ? 0 : Math.round(near) };
      if (hit) out.ziddiyatlar.push(`Hudud muhofaza chegarasi ichida (${hit.name}) — qurilish/buzish Madaniy meros agentligi ruxsati va UNESCO bilan kelishuv talab qiladi.`);
      else if (near < BUFFER_M) out.qoidalar.push(`Muhofaza chegarasiga ${Math.round(near)} m — bufer zonada boʻlishi mumkin, balandlik va koʻrinish cheklovlarini tekshirish kerak.`);
    } else {
      const m = MONUMENTS.map(x => ({ x, d: dist(center, x.c) - x.r })).sort((a, b) => a.d - b.d)[0];
      const inCore = P.some(p => MONUMENTS.some(x => dist(p, x.c) <= x.r)), inBuf = !inCore && P.some(p => MONUMENTS.some(x => dist(p, x.c) <= x.r + BUFFER_M));
      out.unesco = { manba: 'TAXMINIY (yodgorliklar atrofi; rasmiy chegara emas)', eng_yaqin_yodgorlik: m.x.name, masofa_m: Math.max(0, Math.round(m.d + m.x.r)), yodgorlik_zonasida: inCore, bufer_zonada_taxminan: inBuf };
      if (inCore) out.ziddiyatlar.push(`Hudud ${m.x.name} yodgorligi muhofaza zonasida (taxminiy) — yangi qurilish deyarli mumkin emas, Madaniy meros agentligi ruxsati shart.`);
      else if (inBuf) out.qoidalar.push(`${m.x.name} yaqinida (taxminiy bufer zona) — balandlik va tashqi koʻrinish cheklovlari boʻlishi mumkin; Madaniy meros agentligidan soʻrash kerak.`);
    }
    out.qoidalar.push('Bosh reja 2045 (loyiha): konservatsiya zonasida yangi qurilish taqiqlanadi; rekonstruksiya — mavjudini taʼmirlash; renovatsiya — loyiha bilan yangilash.');
    return out;
  }

  // Xarita uchun: muhofaza zonalari (OSM yoki taxminiy doiralar) — GeoJSON
  async function geo() {
    const U = await unesco(), f = [];
    if (U.polys && U.polys.length) U.polys.forEach(z => f.push({ type: 'Feature', properties: { name: z.name + ' (OSM)', zona: 'muhofaza' }, geometry: { type: 'Polygon', coordinates: [z.ring.map(p => [p[1], p[0]])] } }));
    else MONUMENTS.forEach(m => {
      const [cx, cy] = G.xy(m.c[0], m.c[1]), ring = [];
      for (let k = 0; k <= 36; k++) { const a = k / 36 * Math.PI * 2, ll = G.ll(cx + Math.cos(a) * m.r, cy + Math.sin(a) * m.r); ring.push([ll[1], ll[0]]); }
      f.push({ type: 'Feature', properties: { name: m.name + ' — muhofaza (taxminiy)', zona: 'muhofaza' }, geometry: { type: 'Polygon', coordinates: [ring] } });
    });
    return { type: 'FeatureCollection', features: f };
  }

  NX.masterplan = { PLAN, MONUMENTS, unesco, check, geo, zoneType };
})();
