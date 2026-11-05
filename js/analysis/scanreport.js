/* City Jam — real 3D skan qilingan koʻcha hisoboti (data/scan-*-metrics.json).
   Oʻlchovlar skandan (Polycam LiDAR, ±10–20 sm): har 5 m da fasadlar orasidagi eni, yer balandligi (nisbiy), qiyalik, uylar balandligi.
   Kamerchiliklar — oddiy, tushunarli qoidalar bilan (har birida: nima, qayerda, qanday hisoblandi, meʼyor). Meʼyorlar — odatiy shaharsozlik
   qiymatlari (taxminiy; aniq loyiha uchun amaldagi ShNQ bilan tekshiriladi). */
(function () {
  'use strict';
  const NX = window.NX;
  const FILES = { angren: 'data/scan-angren-metrics.json' };
  const cache = {};
  const core = s => String(s || '').toLowerCase().replace(/[ʻ'‘’`ʼ]/g, '').replace(/\s+(kochasi|koʻchasi|ko'chasi|tor kochasi|shoh kochasi)\b.*$/, '').trim();
  // Savolda skan qilingan koʻcha bormi
  function match(q) { const n = core(q).replace(/[ʻ'‘’`ʼ]/g, ''); return Object.keys(FILES).find(k => n.includes(k)) || null; }
  async function load(k) {
    if (!FILES[k]) return null;
    if (!cache[k]) cache[k] = fetch(FILES[k]).then(r => (r.ok ? r.json() : null)).catch(() => null);
    return cache[k];
  }
  // Ketma-ket nuqtalarni bitta joy (oraliq) qilib birlashtirish
  function runs(P, test) {
    const out = []; let cur = null;
    P.forEach(p => { if (test(p)) { if (!cur) cur = { a: p, b: p, pts: [] }; cur.b = p; cur.pts.push(p); } else if (cur) { out.push(cur); cur = null; } });
    if (cur) out.push(cur);
    return out;
  }
  function analyze(D) {
    const P = D.profil.filter(p => p.eni != null), X = D.xulosa, issues = [], items = [];
    const at = p => `${Math.round(p.s)} m`;
    // 1) Tor joylar: oʻt oʻchirish mashinasi uchun kamida 3.5 m oʻtish; ikki tomonlama harakat ~5.5 m; turgan mashina bilan — +2 m
    runs(P, p => p.eni < 5.0).forEach(r => {
      const m = r.pts.reduce((a, b) => (b.eni < a.eni ? b : a));
      const sev = m.eni < 4.0 ? 3 : 2;
      issues.push({ tur: 'tor joy', joy: `${at(r.a)}–${at(r.b)}`, qiymat: `eni ${m.eni} m`, nima: sev === 3 ? 'Ikki mashina sigʻmaydi; bitta mashina turib qolsa — oʻt oʻchirish va tez yordam mashinasi (kamida 3.5 m) oʻta olmaydi' : 'Ikki tomonlama harakat qiyin (meʼyor ~5.5 m); mashina turganda bir yoʻlak qoladi', hisob: 'Skandagi ikki tomondagi devorlar orasidagi masofa (yerdan 1–3 m balandlikdagi devor nuqtalari, 25-persentil)', taklif: 'Shu oraliqda mashina toʻxtashini taqiqlash (belgi 3.27, 1–2 mln soʻm); bir tomonlama harakat', sev });
      items.push({ kind: 'point', id: 'T' + (items.filter(x => /^T/.test(x.id)).length + 1), lat: m.lat, lon: m.lon, color: sev === 3 ? '#ef4444' : '#f59e0b', title: `↔ Tor joy: ${m.eni} m (${at(r.a)}–${at(r.b)})`, note: issues[issues.length - 1].nima });
    });
    // 2) Suv toʻplanadigan past joylar: atrofidan ≥5 sm past mahalliy minimum
    const Z = D.profil;
    for (let i = 2; i < Z.length - 2; i++) {
      const z = Z[i].z, around = Math.min(Z[i - 2].z, Z[i + 2].z);
      if (z <= Z[i - 1].z && z <= Z[i + 1].z && around - z >= 0.05) {
        issues.push({ tur: 'past joy (suv toʻplanishi mumkin)', joy: at(Z[i]), qiymat: `atrofidan ${Math.round((around - z) * 100)} sm past`, nima: 'Yomgʻir suvi shu nuqtaga oqib keladi va turib qolishi mumkin', hisob: 'Skandagi koʻcha yuzasi balandligi (har 5 m, 25 m silliqlangan) — mahalliy eng past nuqta', taklif: 'Panjarali quduq yoki ariqqa qisqa tarnov (eng arzon yechim)', sev: 2 });
        items.push({ kind: 'point', id: 'S' + (items.filter(x => /^S/.test(x.id)).length + 1), lat: Z[i].lat, lon: Z[i].lon, color: '#0ea5e9', title: `💧 Past joy (${at(Z[i])})`, note: 'Suv toʻplanishi mumkin — quduq/tarnov' });
      }
    }
    // Koʻcha oxiri eng past boʻlsa — suv shu tomonga oqadi
    const lo = X.past_nuqta;
    if (lo) issues.push({ tur: 'suv oqimi', joy: `${Math.round(lo.s)} m (koʻchaning ${lo.s > X.uzunlik_m / 2 ? 'shimoliy' : 'janubiy'} uchi)`, qiymat: `koʻcha boʻyi balandlik farqi ${X.balandlik_farqi_m} m`, nima: 'Butun koʻchadan yomgʻir suvi shu tomonga oqadi', hisob: 'Skandagi yer balandligi profili', taklif: 'Koʻcha oxirida suv qabul qiluvchi quduq va ariqqa ulanish', sev: 1 });
    // 3) Qiyalik: piyoda/aravacha uchun boʻylama qiyalik >5% — qiyin
    runs(D.profil, p => Math.abs(p.qiyalik_foiz) > 5).forEach(r => issues.push({ tur: 'qiyalik', joy: `${at(r.a)}–${at(r.b)}`, qiymat: `${Math.max(...r.pts.map(p => Math.abs(p.qiyalik_foiz)))}%`, nima: 'Nogironlar aravachasi uchun qiyin (tavsiya ≤5%)', hisob: 'Yer balandligi farqi / masofa (20 m oraliq)', taklif: 'Trotuarda dam olish maydonchasi, tutqich', sev: 1 }));
    issues.sort((a, b) => b.sev - a.sev);
    return { issues, items };
  }
  // Profil sxemasi: eni (yuqorida) va yer balandligi (pastda)
  function svg(D) {
    const P = D.profil, W = 340, H = 150, s0 = P[0].s, s1 = P[P.length - 1].s, sx = s => 30 + (s - s0) / (s1 - s0) * (W - 40);
    const wmax = 10, ey = w => 12 + (1 - w / wmax) * 60;
    const zs = P.map(p => p.z), z0 = Math.min(...zs), z1 = Math.max(...zs) + 0.01, zy = z => 140 - (z - z0) / (z1 - z0) * 45;
    const wl = P.filter(p => p.eni != null).map(p => `${sx(p.s).toFixed(1)},${ey(p.eni).toFixed(1)}`).join(' ');
    const zl = P.map(p => `${sx(p.s).toFixed(1)},${zy(p.z).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="scan-prof" role="img" aria-label="Koʻcha eni va balandlik profili">
      <rect x="0" y="0" width="${W}" height="${H}" rx="10" fill="#0b1220"/>
      <line x1="30" x2="${W - 10}" y1="${ey(5.5)}" y2="${ey(5.5)}" stroke="#f59e0b" stroke-dasharray="4 4" stroke-width="1"/><text x="${W - 12}" y="${ey(5.5) - 3}" fill="#fbbf24" font-size="9" text-anchor="end">5.5 m (ikki tomonlama)</text>
      <line x1="30" x2="${W - 10}" y1="${ey(3.5)}" y2="${ey(3.5)}" stroke="#ef4444" stroke-dasharray="4 4" stroke-width="1"/><text x="${W - 12}" y="${ey(3.5) - 3}" fill="#f87171" font-size="9" text-anchor="end">3.5 m (oʻt oʻchirish)</text>
      <polyline points="${wl}" fill="none" stroke="#5eead4" stroke-width="2"/>
      <text x="4" y="20" fill="#5eead4" font-size="10">eni</text>
      <polyline points="${zl}" fill="none" stroke="#60a5fa" stroke-width="2"/>
      <text x="4" y="128" fill="#60a5fa" font-size="10">yer</text>
      <text x="30" y="${H - 2}" fill="#94a3b8" font-size="9">0 m</text><text x="${W - 10}" y="${H - 2}" fill="#94a3b8" font-size="9" text-anchor="end">${Math.round(s1 - s0)} m</text>
    </svg>`;
  }
  // Fakt (AI uchun) va mahalliy matn
  function facts(D, A) {
    const X = D.xulosa;
    return {
      izoh: 'Bu koʻcha hokimiyat xodimi tomonidan telefon LiDAR (Polycam) bilan skan qilingan — oʻlchovlar real, ±10–20 sm. Javobda: koʻcha haqida toʻliq maʼlumot, oʻlchovlar, KAMCHILIKLAR (har biri: nima, qayerda — koʻcha boshidan metr, raqami, qanday hisoblangan, qayerdan maʼlumot), takliflar eng arzondan. Bu savolda manba va hisob usulini aytish MUMKIN va KERAK.',
      manba: D.manba,
      uzunlik_m: X.uzunlik_m, eni_m: { oʻrtacha: X.eni_med, eng_tor: X.eni_min, eng_keng: X.eni_max }, balandlik_farqi_m: X.balandlik_farqi_m, oʻrtacha_qiyalik_foiz: X.qiyalik_orta_foiz, eng_katta_qiyalik_foiz: X.qiyalik_max_foiz,
      uylar_balandligi_m: { oʻng: median(D.profil.map(p => p.oʻng_uy_m)), chap: median(D.profil.map(p => p.chap_uy_m)) },
      kamchiliklar: A.issues.map(i => ({ tur: i.tur, joy: i.joy, qiymat: i.qiymat, nima: i.nima, qanday_hisoblandi: i.hisob, taklif: i.taklif })),
      ochiq_maʼlumot_izohi: 'Koʻcha auditidagi “trotuar 0%”, “zebra 0” — ochiq xaritada (OSM) belgilanmaganini bildiradi, yoʻqligini emas; trotuar va ariq real skanda koʻrinadi — buni ayt.',
      meʼyorlar_taxminiy: { oʻt_oʻchirish_mashinasi_oʻtishi_m: 3.5, ikki_tomonlama_harakat_m: 5.5, aravacha_uchun_qiyalik_foiz: 5 },
    };
  }
  const median = a => { const v = a.filter(x => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
  function summary(D, A) {
    const X = D.xulosa, L = [];
    L.push(`**${D.koʻcha} — real 3D skan boʻyicha.** Uzunligi ${X.uzunlik_m} m, eni oʻrtacha ${X.eni_med} m (eng tor ${X.eni_min} m, eng keng ${X.eni_max} m), balandlik farqi ${X.balandlik_farqi_m} m.`);
    if (A.issues.length) { L.push('', '**Kamchiliklar**'); A.issues.forEach((i, k) => L.push(`${k + 1}. **${i.tur}** — ${i.joy}, ${i.qiymat}. ${i.nima}. Qanday hisoblandi: ${i.hisob}. **Taklif:** ${i.taklif}.`)); }
    else L.push('', 'Skan boʻyicha jiddiy kamchilik topilmadi.');
    L.push('', `Maʼlumot: ${D.manba}.`);
    return L.join('\n');
  }
  async function report(q) {
    const k = match(q); if (!k) return null;
    const D = await load(k); if (!D) return null;
    const A = analyze(D);
    return { key: k, D, A, items: A.items, facts: facts(D, A), svg: svg(D), local: summary(D, A) };
  }
  NX.scanReport = { match, report, load };
})();
