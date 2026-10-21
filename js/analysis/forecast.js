/* City Jam — soatbay tirbandlik bashorati (TomTom tarixi + tipik shahar profili) */
(function () {
  'use strict';
  const NX = window.NX;
  const KEY = 'tt:history';
  const MIN_SAMPLES = 3;

  let history = NX.store.get(KEY, []);
  if (!Array.isArray(history)) history = [];

  // Koʻcha boʻyicha indeks (xaritani butunlay qayta boʻyashda tez ishlashi uchun)
  let idx = null;
  function byStreet(key) {
    if (!idx) { idx = new Map(); history.forEach(x => { let a = idx.get(x.s); if (!a) idx.set(x.s, (a = [])); a.push(x); }); }
    return idx.get(key) || [];
  }
  function save() { idx = null; return NX.store.set(KEY, history); }

  // {s: koʻcha kaliti, d: hafta kuni (0=Yakshanba), h: soat, cs: joriy tezlik, ff: erkin oqim tezligi, t: vaqt}
  function addSample(streetKey, cs, ff, date) {
    history.push({ s: streetKey, d: date.getDay(), h: date.getHours(), cs: round1(cs), ff: round1(ff), t: date.getTime() });
    if (history.length > 20000) history = history.slice(-20000);
    save();
  }
  const round1 = v => Math.round(v * 10) / 10;
  const cong = x => (x.ff > 0 ? Math.max(0, (1 - x.cs / x.ff) * 100) : 0);

  // Tipik shahar kunlik profili (0..1): ertalab 07:30–09:30 va kechqurun 17:00–19:30 choʻqqilari
  function profile(d, h) {
    const t = h + 0.5;
    const g = (mu, sd) => Math.exp(-0.5 * ((t - mu) / sd) ** 2);
    const weekend = d === 0 || d === 6;
    const am = weekend ? (d === 6 ? 0.55 : 0.3) : 1;
    const pm = weekend ? (d === 6 ? 0.85 : 0.65) : 1;
    const mid = weekend ? 0.55 : 0.45;
    const v = 0.06 + am * 0.94 * g(8.5, 0.85) + pm * 0.94 * g(18.25, 1.0) + mid * g(13.5, 2.6);
    return Math.min(1, v);
  }

  // Koʻchaning choʻqqi soatidagi taxminiy tirbandligi (%), xavf indeksiga mutanosib
  const peakOf = risk => Math.max(8, Math.min(60, 8 + 0.5 * risk));

  function predict(street, d, h) {
    const all = byStreet(street.key);
    const prior0 = peakOf(street.risk.value) * profile(d, h);
    // Koʻchaning boshqa soatlardagi oʻlchovlari boʻlsa — profil koʻchaga moslab masshtablanadi
    let k = 1;
    if (all.length) {
      const m = all.reduce((t, x) => t + cong(x), 0), p = all.reduce((t, x) => t + peakOf(street.risk.value) * profile(x.d, x.h), 0);
      if (p > 0) k = Math.max(0.25, Math.min(4, m / p));
    }
    const prior = Math.min(95, prior0 * k);
    const match = all.filter(x => x.d === d && x.h === h).map(cong);
    const n = match.length;
    const mean = n ? match.reduce((a, b) => a + b, 0) / n : 0;
    const sd = n > 1 ? Math.sqrt(match.reduce((t, v) => t + (v - mean) ** 2, 0) / (n - 1)) : 0;
    let value, half;
    if (n >= MIN_SAMPLES) { value = mean; half = Math.max(3, sd); } else {
      const w = n / MIN_SAMPLES;
      value = w * mean + (1 - w) * prior;
      half = (1 - w) * Math.max(10, 0.6 * value) + w * Math.max(4, sd);
    }
    return { d, h, value, lo: Math.max(0, value - half), hi: Math.min(100, value + half), n, total: all.length, low: n < MIN_SAMPLES, scaled: all.length > 0 && k !== 1 };
  }

  function next24(street, now = new Date()) {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const t = new Date(now.getTime() + i * 3600e3);
      out.push(Object.assign(predict(street, t.getDay(), t.getHours()), { label: NX.fmt.hour(t.getHours()), day: t.getDay() }));
    }
    return out;
  }
  const dayCurve = (street, d) => Array.from({ length: 24 }, (_, h) => Object.assign(predict(street, d, h), { label: NX.fmt.hour(h) }));

  function stats() {
    const streets = new Set(history.map(x => x.s));
    return { samples: history.length, streets: streets.size, first: history.length ? history[0].t : null, last: history.length ? history[history.length - 1].t : null };
  }
  const forStreet = key => byStreet(key).slice();

  function exportJSON() {
    return { format: 'cityjam-tomtom-history', version: 1, exported: new Date().toISOString(), bbox: NX.config.bbox, samples: history };
  }
  // Import: takrorlanuvchi yozuvlar (koʻcha+vaqt) qoʻshilmaydi
  function importJSON(obj) {
    const arr = Array.isArray(obj) ? obj : obj && obj.samples;
    if (!Array.isArray(arr)) throw new Error('Fayl formati notoʻgʻri: “samples” roʻyxati topilmadi.');
    const seen = new Set(history.map(x => x.s + '|' + x.t));
    let added = 0, bad = 0;
    for (const x of arr) {
      const ok = x && typeof x.s === 'string' && x.d >= 0 && x.d <= 6 && x.h >= 0 && x.h <= 23 && isFinite(x.cs) && isFinite(x.ff) && x.ff > 0 && isFinite(x.t);
      if (!ok) { bad++; continue; }
      const k = x.s + '|' + x.t;
      if (seen.has(k)) continue;
      seen.add(k);
      history.push({ s: x.s, d: +x.d, h: +x.h, cs: +x.cs, ff: +x.ff, t: +x.t });
      added++;
    }
    history.sort((a, b) => a.t - b.t);
    if (!save()) throw new Error('Brauzer xotirasi yetmadi.');
    return { added, bad };
  }
  function clear() { history = []; save(); }

  NX.forecast = { addSample, predict, next24, dayCurve, profile, peakOf, stats, forStreet, exportJSON, importJSON, clear, MIN_SAMPLES, cong };
})();
