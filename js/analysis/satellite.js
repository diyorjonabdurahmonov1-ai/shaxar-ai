/* City Jam — sunʼiy yoʻldosh tahlili (ochiq maʼlumot, oldindan hisoblangan: data/sat-samarqand.json va PNG qatlamlar).
   • Yer yuzasi harorati — Landsat 9 (USGS/NASA, Collection 2 Level-2), 2025-08-09 ~11:00: issiqlik orollari.
   • Yashillik (NDVI) — Sentinel-2 L2A (ESA Copernicus), 2019-08-28 va 2025-08-26: yashil hudud oʻzgarishi.
   • “Yangi qurilish” — 2019 da yashil boʻlib, 2025 da qurilgan joylar (NDVI tushgan, NDBI oshgan va hozir binolar bor) — TAXMINIY, joyida tekshiriladi.
   Litsenziya: Landsat — ochiq (public domain), Sentinel — Copernicus ochiq litsenziyasi (hosila yaratish mumkin). */
(function () {
  'use strict';
  const NX = window.NX;
  let P = null;
  const load = () => P || (P = fetch('data/sat-samarqand.json').then(r => (r.ok ? r.json() : null)).catch(() => null));
  const cell = (G, b, lat, lon) => { const i = Math.floor((lon - b[0]) / G.res), j = Math.floor((b[3] - lat) / G.res); return i < 0 || j < 0 || i >= G.w || j >= G.h ? null : j * G.w + i; };
  function heatAt(D, lat, lon) { const k = cell(D.heat, D.bbox, lat, lon); return k == null ? null : D.heat.g[k]; }
  function ndviAt(D, lat, lon) { const k = cell(D.green, D.bbox, lat, lon); return k == null ? null : { n19: D.green.n19[k], n25: D.green.n25[k] }; }
  // Mahallalar boʻyicha harorat va yashillik (OSM mahalla nomlari, 300 m atrofida oʻrtacha)
  function byPlace(D, places) {
    return (places || []).map(p => {
      let hs = 0, hn = 0, ns = 0, nn = 0;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const la = p.c[0] + a * 0.0015, lo = p.c[1] + b * 0.0019, h = heatAt(D, la, lo), n = ndviAt(D, la, lo); if (h != null) { hs += h; hn++; } if (n && n.n25 != null) { ns += n.n25; nn++; } }
      return hn ? { name: p.name, c: p.c, t: +(hs / hn).toFixed(1), ndvi: nn ? +(ns / nn).toFixed(2) : null } : null;
    }).filter(Boolean);
  }
  // Savolga mos tahlil: issiqlik / yashillik / yangi qurilish
  async function analyze(q, places) {
    const D = await load();
    if (!D) return null;
    const n = String(q || '').toLowerCase();
    const type = /qurilish/.test(n) ? 'build' : /daraxt|yashil|ko[ʻ'‘`]?kalamzor|park|ekolog|ndvi/.test(n) ? 'green' : 'heat';
    const B = D.bbox, pl = byPlace(D, places).filter(x => x.c[0] > B[1] && x.c[0] < B[3] && x.c[1] > B[0] && x.c[1] < B[2]);
    const hot = pl.slice().sort((a, b) => b.t - a.t), cool = pl.slice().sort((a, b) => a.t - b.t);
    // Daraxt ekish kerak joylar: issiq va yashilligi past mahallalar
    const plant = pl.filter(x => x.ndvi != null).map(x => Object.assign({ s: (x.t - D.heat.mean) - 20 * (x.ndvi - 0.2) }, x)).sort((a, b) => b.s - a.s);
    const items = [];
    const F = { manba: [D.heat.src + ', ' + D.heat.date, D.green.src + ', ' + D.green.dates.join(' va ')], ogohlantirish: 'Sunʼiy yoʻldosh oʻlchovi: harorat — yer YUZASI (tom, asfalt) harorati, havo harorati emas; yangi qurilish — taxminiy, joyida tekshiriladi.' };
    if (type === 'heat') {
      hot.slice(0, 6).forEach((x, i) => items.push({ kind: 'point', id: 'I' + (i + 1), lat: x.c[0], lon: x.c[1], color: '#ef4444', title: `🔥 I${i + 1}: ${x.name} — ${x.t}°C`, note: `Yer yuzasi harorati (2025-08-09, ~11:00). Shahar oʻrtachasidan ${(x.t - D.heat.mean).toFixed(1)}°C issiq. Yashillik (NDVI) ${x.ndvi}.` }));
      cool.slice(0, 3).forEach((x, i) => items.push({ kind: 'point', id: 'S' + (i + 1), lat: x.c[0], lon: x.c[1], color: '#38bdf8', title: `❄️ S${i + 1}: ${x.name} — ${x.t}°C`, note: 'Eng salqin mahallalardan biri (yashillik va suv taʼsiri).' }));
      Object.assign(F, { shahar_yuza_harorati_ortacha_c: D.heat.mean, eng_issiq_5foiz_c: D.heat.p95, eng_salqin_5foiz_c: D.heat.p5, eng_issiq_mahallalar: hot.slice(0, 8).map(x => ({ mahalla: x.name, harorat_c: x.t, yashillik_ndvi: x.ndvi })), eng_salqin_mahallalar: cool.slice(0, 4).map(x => ({ mahalla: x.name, harorat_c: x.t, yashillik_ndvi: x.ndvi })), daraxt_ekish_ustuvor: plant.slice(0, 6).map(x => x.name) });
    } else if (type === 'green') {
      plant.slice(0, 6).forEach((x, i) => items.push({ kind: 'point', id: 'D' + (i + 1), lat: x.c[0], lon: x.c[1], color: '#22c55e', title: `🌳 D${i + 1}: ${x.name}`, note: `Issiq (${x.t}°C) va yashilligi past (NDVI ${x.ndvi}) — daraxt ekish va soya birinchi navbatda.` }));
      D.spots.filter(s => s.t !== 'qurilish').slice(0, 10).forEach((s, i) => items.push({ kind: 'point', id: (s.t === 'yashil_paydo' ? 'G' : 'Y') + (i + 1), lat: s.c[0], lon: s.c[1], color: s.t === 'yashil_paydo' ? '#4ade80' : '#f97316', list: false, title: s.t === 'yashil_paydo' ? `🌱 Yashillik oshgan joy — ${(s.m2 / 1e4).toFixed(1)} ga` : `🍂 Yashillik yoʻqolgan joy — ${(s.m2 / 1e4).toFixed(1)} ga`, note: `NDVI oʻzgarishi ${s.dNdvi} (2019→2025).` }));
      Object.assign(F, { yashil_hudud_ga: { '2019': D.green.green19_ha, '2025': D.green.green25_ha, farq_ga: D.green.green25_ha - D.green.green19_ha }, ortacha_ndvi: { '2019': D.green.mean19, '2025': D.green.mean25 }, daraxt_ekish_ustuvor_mahallalar: plant.slice(0, 8).map(x => ({ mahalla: x.name, harorat_c: x.t, ndvi: x.ndvi })), yashillik_oshgan_joylar: D.spots.filter(s => s.t === 'yashil_paydo').length });
    } else {
      D.spots.filter(s => s.t === 'qurilish').forEach((s, i) => items.push({ kind: 'point', id: 'Q' + (i + 1), lat: s.c[0], lon: s.c[1], color: '#a855f7', title: `🏗 Q${i + 1}: yangi qurilish (2019→2025) — ${(s.m2 / 1e4).toFixed(1)} ga`, note: `2019 da yashil maydon edi, 2025 da qurilgan (NDVI ${s.dNdvi}); hozir ~${s.bld} ta bino. Taxminiy — ruxsatnoma bilan solishtiring.` }));
      Object.assign(F, { yangi_qurilish_joylari: D.spots.filter(s => s.t === 'qurilish').map((s, i) => ({ id: 'Q' + (i + 1), maydon_ga: +(s.m2 / 1e4).toFixed(1), binolar_hozir: s.bld, ndvi_ozgarishi: s.dNdvi })), izoh: 'Faqat avval yashil boʻlgan va hozir binolar turgan joylar; ekin dalalari chiqarib tashlangan. Ruxsatnomalar bazasi bilan solishtirish kerak.' });
    }
    return { type, items, facts: F, overlay: type === 'heat' ? 'data/heat-samarqand.png' : 'data/green-samarqand.png', bbox: B, D };
  }
  NX.sat = { load, analyze, heatAt, ndviAt };
})();
