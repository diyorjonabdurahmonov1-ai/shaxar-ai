/* City Jam — tirbandlik kuzatuvi (doimiy).
   Yirik chorrahalarga kiruvchi yoʻllar (data/traffic-corridors.json, ~400 m har biri) boʻyicha Yandex marshrut vaqti:
   probkali (getJamsTime) va probkasiz (getTime); nisbat = qanchaga sekin. Sayt ochiq turgan har qanday brauzer
   (yoki kuzatuv ekrani) har 15 daqiqada oʻlchaydi va Worker’ga (/traffic) yuboradi — tarix hamma uchun umumiy.
   Worker boʻlmasa — tarix shu brauzerda (localStorage). Natija: “soat 8 da qaysi chorraha”, “qachon eng tirband”, “hozir”. */
(function () {
  'use strict';
  const NX = window.NX;
  const GAP = 15 * 60e3, LOCAL = 'trf:local', DAYS = 14;
  const base = () => ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim().replace(/\/+$/, '');
  let C = null, St = null, stTs = 0, remote = null, busy = false, timer = null, lastErr = null, denied = 0, nErr = 0;
  const NO_ROUTE = 'Yandex kaliti marshrut xizmatiga ruxsat bermaydi (Yandex javobi: “Invalid api key”) — probka qatlami koʻrinadi, lekin yoʻl vaqtini oʻlchab boʻlmaydi. Yandex kabinetida (developer.tech.yandex.ru) marshrutlash yoqilgan kalit kerak.';

  const corridors = () => C || (C = fetch('data/traffic-corridors.json').then(r => (r.ok ? r.json() : null)).catch(() => null));
  const empty = () => ({ latest: null, rows: [], prof: {}, n: 0, since: null });
  const slotOf = ts => { const d = new Date(ts + 5 * 3600e3); return { slot: d.getUTCHours() * 2 + (d.getUTCMinutes() >= 30 ? 1 : 0), we: d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 'we' : 'wd' }; };
  const slotLabel = s => `${Math.floor(s / 2)}:${s % 2 ? '30' : '00'}`;
  // Worker bilan bir xil yigʻish (Worker boʻlmaganda shu brauzerda)
  function addSample(st, ts, v) {
    const r = {}; Object.keys(v).forEach(id => { r[id] = Math.round(v[id][0] / v[id][1] * 100); });
    const { slot, we } = slotOf(ts);
    st.latest = { ts, v };
    st.rows = st.rows.filter(x => x[0] > ts - DAYS * 86400e3).concat([[ts, r]]);
    Object.keys(r).forEach(id => { const P = st.prof[id] || (st.prof[id] = { wd: Array.from({ length: 48 }, () => [0, 0]), we: Array.from({ length: 48 }, () => [0, 0]) }); P[we][slot][0]++; P[we][slot][1] += r[id]; });
    st.n = (st.n || 0) + 1; st.since = st.since || ts;
    const day = new Date(ts + 5 * 3600e3).toISOString().slice(0, 10), d = ((st.daysum = st.daysum || {})[day] = (st.daysum[day] || {}));
    Object.keys(r).forEach(id => { const x = d[id] || (d[id] = [0, 0, 0, 0]); if (r[id] > x[0]) { x[0] = r[id]; x[1] = slot; } x[2] += r[id]; x[3]++; });
    return st;
  }
  async function state(force) {
    if (!force && St && Date.now() - stTs < 3 * 60e3) return St;
    let s = null;
    if (base()) {
      try { const r = await NX.fetchJSON(base() + '/traffic', {}, 15000); if (r.ok && r.data && !r.data.error && Array.isArray(r.data.rows)) { s = r.data; remote = true; } else if (r.status === 404 || r.status === 405 || (r.data && r.data.error)) remote = false; } catch (e) { /* tarmoq */ }
    }
    if (!s) { s = NX.store.get(LOCAL, null) || empty(); if (remote == null) remote = false; }
    St = s; stTs = Date.now();
    return St;
  }
  const canMeasure = () => !!(window.ymaps && window.ymaps.route && NX.yandex && NX.yandex.mode() === 'api');

  // Bitta oʻlchov: har yoʻl — boshidan (≈400 m oldin) chorrahagacha, oʻrta nuqta orqali (yoʻl boʻylab)
  async function measure(onStep) {
    if (!canMeasure()) throw new Error('Yandex xaritasi (API kaliti bilan) yuklanmagan — oʻlchab boʻlmaydi.');
    const D = await corridors(); if (!D) throw new Error('Chorrahalar fayli yuklanmadi.');
    const list = D.corridors, v = {};
    let i = 0, done = 0; nErr = 0;
    const one = async c => {
      const P = c.path, pts = [P[0], P[Math.floor(P.length / 2)], P[P.length - 1]];
      try {
        const r = await Promise.race([window.ymaps.route(pts, { avoidTrafficJams: false }), NX.sleep(15000).then(() => null)]);
        if (!r) return;
        const jams = r.getJamsTime(), free = r.getTime(), len = r.getLength();
        if (free > 5 && len < c.len * 2.2 + 150) v[c.id] = [Math.round(Math.max(jams, free)), Math.round(free)];   // aylanib oʻtsa (bir tomonlama) — olinmaydi
      } catch (e) { nErr++; if (/scriptError|Invalid api key|Unauthorized|403|401/i.test(String((e && (e.message || e)) || ''))) denied = Date.now(); }
      done++; if (onStep) onStep(done, list.length);
    };
    const worker = async () => { while (i < list.length) await one(list[i++]); };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return v;
  }
  // Oʻlchab, umumiy tarixga qoʻshish (Worker, boʻlmasa shu brauzer)
  // Server oʻlchovi (Worker cron funksiyasi, Yandex “Матрица расстояний”) — xodim kodi bilan
  async function serverRun() {
    const pin = NX.fixes && NX.fixes.pin && NX.fixes.pin();
    if (!base() || !pin) return null;
    const r = await NX.fetchJSON(base() + '/traffic?run=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Staff-Code': pin }, body: '{}' }, 60000);
    if (!r.ok) throw new Error(r.data && r.data.error ? r.data.error.message : 'Server oʻlchovi: HTTP ' + r.status);
    if (r.data && r.data.err && !r.data.n) throw new Error('Yandex (server): ' + r.data.err);
    remote = true; await state(true); window.dispatchEvent(new CustomEvent('nx:traffic'));
    return r.data;
  }
  async function sampleNow(onStep) {
    if (busy) return null;
    // Brauzerda Yandex marshrutga ruxsat yoʻq boʻlsa — server (Worker) oʻlchaydi
    if (denied || !canMeasure()) { busy = true; try { const d = await serverRun(); if (d) { lastErr = null; return d; } } catch (e) { lastErr = e.message; throw e; } finally { busy = false; } }
    busy = true;
    try {
      const v = await measure(onStep), ts = Date.now();
      if (Object.keys(v).length < 5) throw new Error(denied && nErr > 3 ? NO_ROUTE : 'Yandex marshrut vaqtlarini qaytarmadi.');
      let sent = false;
      if (base() && remote !== false) {
        try { const r = await NX.fetchJSON(base() + '/traffic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v }) }, 15000); sent = r.ok && r.data && (r.data.ok || r.data.skipped); if (!sent && r.status >= 400) remote = false; } catch (e) { /* */ }
      }
      if (!sent) NX.store.set(LOCAL, addSample(NX.store.get(LOCAL, null) || empty(), ts, v));
      lastErr = null;
      await state(true);
      if (St && (!St.latest || St.latest.ts < ts - 60e3)) St = addSample(JSON.parse(JSON.stringify(St)), ts, v);   // Worker hali yangilamagan boʻlsa ham javob hozirgi oʻlchov bilan
      window.dispatchEvent(new CustomEvent('nx:traffic'));
      return v;
    } catch (e) {
      if (denied) { try { const d = await serverRun(); if (d) { lastErr = null; return d; } } catch (e2) { lastErr = e2.message; throw e2; } }
      lastErr = e.message; throw e;
    } finally { busy = false; }
  }
  // Avtomatik: har 2 daqiqada tekshiradi — oxirgi umumiy oʻlchov 15 daqiqadan eski boʻlsa, oʻlchaydi
  function start() {
    if (timer || navigator.webdriver) return;
    const tick = async () => { try { if (!canMeasure() || busy || (denied && Date.now() - denied < 3600e3)) return; const s = await state(true); if (!s.latest || Date.now() - s.latest.ts > GAP) await sampleNow(); } catch (e) { /* keyingi safar */ } };
    timer = setInterval(tick, 120e3); setTimeout(tick, 20e3);
  }

  // ---------- Tahlil ----------
  const lvl = r => (r >= 250 ? ['qattiq tirbandlik', '#7f1d1d'] : r >= 180 ? ['tirband', '#ef4444'] : r >= 130 ? ['sekin', '#f59e0b'] : ['erkin', '#22c55e']);
  // Savoldan vaqt: “ertalab 8 da”, “soat 18:30”, “kechqurun”, “hozir”; dam olish kunlari
  function parseTime(q) {
    const t = String(q || '').toLowerCase(), we = /dam\s*olish|shanba|yakshanba|weekend|выходн/.test(t) ? 'we' : 'wd';
    if (/hozir|ayni\s*paytda|shu\s*payt|сейчас/.test(t)) return { now: true, we };
    if (/qachon|kunlar|kunlik|hafta|oxirgi|tarix|qaysi\s*(soat|vaqt|payt)|eng\s*(ko.?p\s*)?tirband\s*(payt|vaqt|soat)|kun\s*davomida|soatlar\s*bo.?yicha/.test(t) && !/soat\s*\d|\d{1,2}\s*(:\d\d)?\s*(da|ga|lar)/.test(t)) return { peaks: true, we };
    let m = t.match(/(\d{1,2})[:.](\d{2})/) || t.match(/soat\s*(\d{1,2})/) || t.match(/\b(\d{1,2})\s*(?:da|ga|larda|dagi|-?\s*soat)\b/);
    let h = m ? +m[1] : null, mm = m && m[2] ? +m[2] : 0;
    const kech = /kechqurun|kechki|oqshom|вечер/.test(t), ert = /ertalab|tong|ertalabki|утр/.test(t), tush = /tush(da|dan|ki)|обед/.test(t), tun = /kechasi|tunda|ночь/.test(t);
    if (h != null && h < 12 && (kech || (tush && h < 6))) h += 12;
    if (h == null) h = ert ? 8 : tush ? 13 : kech ? 18 : tun ? 22 : null;
    if (h == null || h > 23) return { now: true, we, guess: true };
    return { slot: h * 2 + (mm >= 30 ? 1 : 0), we };
  }
  const normName = s => String(s || '').toLowerCase().replace(/[ʻ'‘’`ʼ]/g, '').replace(/\s*(kochasi|shoh|yoli|street)\b.*$/, '').trim();
  async function query(q, opts) {
    const D = await corridors(), s = await state();
    if (!D) return null;
    const tm = parseTime(q), J = D.junctions, CR = D.corridors;
    const streets = (opts && opts.streets || []).map(normName).filter(Boolean);
    const okC = c => !streets.length || streets.some(n => normName(c.road).includes(n) || normName(c.jname).includes(n));
    const at = (id, slot, we) => { const P = s.prof[id]; if (!P) return null; const x = P[we][slot]; return x && x[0] ? { r: x[1] / x[0], n: x[0] } : null; };
    const nowR = id => (s.latest && s.latest.v[id] ? { r: s.latest.v[id][0] / s.latest.v[id][1] * 100, n: 1, d: s.latest.v[id][0] - s.latest.v[id][1] } : null);
    const val = c => (tm.now ? nowR(c.id) : tm.peaks ? null : at(c.id, tm.slot, tm.we));
    // Har chorraha: eng sekin kiruvchi yoʻl
    const rows = J.map(j => {
      const cs = CR.filter(c => c.j === j.id && okC(c)).map(c => Object.assign({ c }, val(c) || {})).filter(x => x.r != null);
      // kun davomida eng tirband 3 ta yarim soat (ish kunlari)
      const peaks = [];
      for (let k = 12; k < 46; k++) { let best = 0, n = 0; CR.filter(c => c.j === j.id && okC(c)).forEach(c => { const a = at(c.id, k, tm.we); if (a && a.r > best) { best = a.r; n = a.n; } }); if (n) peaks.push({ slot: k, r: best, n }); }
      peaks.sort((a, b) => b.r - a.r);
      while (peaks.length && peaks[peaks.length - 1].r < 115) peaks.pop();   // erkin paytlar “tirband payt” emas
      const top = cs.sort((a, b) => b.r - a.r)[0];
      return { j, top, apps: cs, peaks: peaks.slice(0, 3), r: tm.peaks ? (peaks[0] ? peaks[0].r : null) : top ? top.r : null };
    }).filter(x => x.r != null && (!streets.length || x.apps.length || x.peaks.length)).sort((a, b) => b.r - a.r);
    const days = s.since ? Math.max(1, Math.round((Date.now() - s.since) / 86400e3)) : 0;
    const nAt = tm.now ? (s.latest ? 1 : 0) : tm.peaks ? s.n : Math.max(0, ...Object.keys(s.prof).map(id => (s.prof[id][tm.we][tm.slot] || [0])[0]));
    // Kunma-kun (doimiy xulosalar): har kun eng tirband chorrahalar; oxirgi 7 kun va undan oldingi 7 kun solishtirish
    const DS = s.daysum || {}, dayKeys = Object.keys(DS).sort(), WD = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
    const jDay = (day, j) => { let best = null; CR.filter(c => c.j === j.id && okC(c)).forEach(c => { const x = DS[day][c.id]; if (x && x[3] && (!best || x[0] > best.max)) best = { max: x[0], slot: x[1], avg: x[2] / x[3], n: x[3], road: c.road, side: c.side }; }); return best; };
    const daily = dayKeys.slice(-30).map(day => ({ day, wd: WD[new Date(day + 'T12:00:00Z').getUTCDay()], top: J.map(j => Object.assign({ j }, jDay(day, j) || {})).filter(x => x.max).sort((a, b) => b.max - a.max).slice(0, 5) }));
    const mean = a => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : null);
    const last7 = dayKeys.slice(-7), prev7 = dayKeys.slice(-14, -7);
    const trend = J.map(j => { const a = mean(last7.map(d => jDay(d, j)).filter(Boolean).map(x => x.avg)), b = mean(prev7.map(d => jDay(d, j)).filter(Boolean).map(x => x.avg)), pk = mean(last7.map(d => jDay(d, j)).filter(Boolean).map(x => x.max)); return { j, a, b, pk, ch: a && b ? (a / b - 1) * 100 : null, every: last7.filter(d => { const x = jDay(d, j); return x && x.max >= 150; }).length }; }).filter(x => x.a != null).sort((x, y) => (y.pk || 0) - (x.pk || 0));
    return { daily, trend, nDays: dayKeys.length, tm, rows, n: s.n || 0, nAt, days, since: s.since, latestTs: s.latest && s.latest.ts, remote, label: tm.now ? 'hozir' : tm.peaks ? 'kun davomida' : slotLabel(tm.slot), we: tm.we, total: J.length, streets };
  }
  // Xarita: chorrahalar (rangi — tirbandlik), kiruvchi yoʻllar (chiziq, rangi va qalinligi — qanchaga sekin)
  function items(R) {
    const out = [];
    R.rows.slice(0, 12).forEach((x, i) => {
      const [t, col] = lvl(x.r);
      const pk = x.peaks.length ? ' Eng tirband payti: ' + x.peaks.map(p => `${slotLabel(p.slot)} (${(p.r / 100).toFixed(1)}×)`).join(', ') + '.' : '';
      x.apps.filter(a => a.r >= 115).forEach(a => { const [, c2] = lvl(a.r); out.push({ kind: 'line', style: 'seg', path: a.c.path, w: Math.min(2.5, 0.8 + (a.r - 100) / 80), color: c2, lat: a.c.path[0][0], lon: a.c.path[0][1], id: 'T' + (i + 1), title: `🚗 ${a.c.road} (${a.c.side} tomondan) → ${x.j.name}: ${(a.r / 100).toFixed(1)}× sekin`, note: `${a.c.len} m kirish yoʻli.` }); });
      out.push({ kind: 'point', id: 'T' + (i + 1), lat: x.j.lat, lon: x.j.lon, color: col, title: `🚦 T${i + 1}: ${x.j.name} — ${R.label}: ${(x.r / 100).toFixed(1)}× sekin (${t})`, note: `${x.top ? `Eng sekin kirish: ${x.top.c.road} (${x.top.c.side} tomondan)${x.top.d ? `, +${Math.round(x.top.d / 60 * 10) / 10} daqiqa` : ''}.` : ''}${pk} Oʻlchov: Yandex marshrut vaqti (probkali/probkasiz).` });
    });
    return out;
  }
  function facts(R) {
    return {
      izoh: 'Yirik chorrahalarga kiruvchi yoʻllarda (~400 m) Yandex marshrut vaqti har 15 daqiqada oʻlchanadi (sayt ochiq turgan brauzer orqali); “marta_sekin” = probkali vaqt / probkasiz vaqt (1.0 — erkin, 1.3+ sekin, 1.8+ tirband, 2.5+ qattiq). Soat boʻyicha qiymat — shu yarim soatdagi barcha kunlar oʻrtachasi.',
      vaqt: R.label, kunlar: R.we === 'we' ? 'dam olish kunlari' : 'ish kunlari',
      kuzatuv: { jami_olchovlar: R.n, shu_vaqtdagi_olchovlar: R.nAt, kuzatuv_kunlari: R.days, boshlangan: R.since ? new Date(R.since).toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand' }) : null, oxirgi_olchov: R.latestTs ? new Date(R.latestTs).toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand' }) : null, umumiy_tarix: R.remote ? 'ha (Worker, hamma xodimlar uchun)' : 'faqat shu brauzerda' },
      chorrahalar: R.rows.slice(0, 10).map((x, i) => ({ id: 'T' + (i + 1), chorraha: x.j.name, marta_sekin: +(x.r / 100).toFixed(2), eng_sekin_kirish: x.top ? `${x.top.c.road} (${x.top.c.side} tomondan)` : null, qoʻshimcha_daqiqa: x.top && x.top.d ? +(x.top.d / 60).toFixed(1) : null, eng_tirband_paytlar: x.peaks.map(p => `${slotLabel(p.slot)} — ${(p.r / 100).toFixed(1)}×`) })),
      kuzatiladigan_chorrahalar: R.total,
      kunlar_boʻyicha: R.daily.map(d => ({ sana: d.day, hafta_kuni: d.wd, eng_tirband: d.top.slice(0, 3).map(x => `${x.j.name} — ${(x.max / 100).toFixed(1)}× (${slotLabel(x.slot)}, ${x.road})`) })),
      oxirgi_7_kun: R.trend.slice(0, 10).map(x => ({ chorraha: x.j.name, kunlik_eng_yomon_oʻrtacha: +((x.pk || 0) / 100).toFixed(2), kun_oʻrtacha: +(x.a / 100).toFixed(2), oldingi_7_kunga_nisbatan_foiz: x.ch != null ? Math.round(x.ch) : null, nechta_kun_1_5x_dan_oshdi: x.every })),
      saqlangan_kunlar: R.nDays,
    };
  }
  function summary(R) {
    const L = [], wd = R.we === 'we' ? 'dam olish kunlari' : 'ish kunlari';
    if (!R.rows.length) return null;
    L.push(R.tm.now ? `**Hozir eng sekin chorrahalar** (Yandex, ${R.latestTs ? new Date(R.latestTs).toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Samarkand', hour: '2-digit', minute: '2-digit' }) : ''} oʻlchovi):`
      : R.tm.peaks ? `**Kun davomida eng tirband chorrahalar va soatlari** (${wd}, ${R.days} kunlik kuzatuv, ${R.n} ta oʻlchov):`
      : `**Soat ${R.label} (${wd}) — eng tirband chorrahalar** (${R.nAt} kunlik oʻlchov oʻrtachasi):`);
    const busyRows = R.rows.filter(x => x.r >= 115), show = (busyRows.length ? busyRows : R.rows.slice(0, 3)).slice(0, 7);
    if (!busyRows.length) L.push(R.tm.now ? 'Hozir kuzatiladigan chorrahalarning hammasida harakat deyarli erkin (1.15× dan kam).' : 'Bu vaqtda kuzatiladigan chorrahalarning hammasida harakat deyarli erkin (1.15× dan kam).');
    show.forEach((x, i) => {
      const [t] = lvl(x.r);
      L.push(`${i + 1}. **T${i + 1} ${x.j.name}** — ${(x.r / 100).toFixed(1)}× sekin (${t})${x.top ? `; eng sekin kirish — ${x.top.c.road}, ${x.top.c.side} tomondan${x.top.d ? ` (+${(x.top.d / 60).toFixed(1)} daqiqa)` : ''}` : ''}${!R.tm.now && x.peaks.length ? `; eng tirband payti ${x.peaks.slice(0, 2).map(p => slotLabel(p.slot)).join(', ')}` : ''}.`);
    });
    const free = R.rows.filter(x => x.r < 115).length;
    if (free && busyRows.length) L.push('', `Qolgan ${free} ta chorrahada harakat erkin.`);
    if (R.nDays >= 2) {
      L.push('', `**Kunlar boʻyicha** (${R.nDays} kun saqlangan):`);
      R.daily.slice(-7).forEach(d => { if (d.top.length) L.push(`- ${d.day} (${d.wd}): ${d.top.slice(0, 2).map(x => `${x.j.name} ${(x.max / 100).toFixed(1)}× ${slotLabel(x.slot)} da`).join('; ')}`); });
      const reg = R.trend.filter(x => x.every >= 3).slice(0, 3);
      if (reg.length) L.push(`Har kuni deyarli takrorlanadi: ${reg.map(x => `${x.j.name} (${x.every} kunda 1.5× dan oshdi)`).join(', ')}.`);
      const up = R.trend.filter(x => x.ch != null && x.ch > 10).slice(0, 2);
      if (up.length) L.push(`Oldingi haftaga nisbatan yomonlashgan: ${up.map(x => `${x.j.name} +${Math.round(x.ch)}%`).join(', ')}.`);
    }
    L.push('', `Xaritada: chorrahalar raqam bilan, sekin kirish yoʻllari rangli chiziq (sariq — sekin, qizil — tirband). Kuzatuv: ${R.total} ta yirik chorraha, tarix doimiy saqlanadi${R.remote ? '' : ' (hozircha faqat shu brauzerda)'}.`);
    return L.join('\n');
  }
  function status() { return { n: St ? St.n : 0, since: St && St.since, latest: St && St.latest && St.latest.ts, remote, busy, err: lastErr, can: canMeasure(), denied: !!denied, noRoute: NO_ROUTE }; }

  NX.trafficWatch = { corridors, state, measure, sampleNow, serverRun, start, query, items, facts, summary, parseTime, status, slotLabel, _addSample: addSample };
})();
