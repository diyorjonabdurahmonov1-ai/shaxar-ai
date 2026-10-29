/* City Jam — ilova boshqaruvchisi: holat, hodisalar, ekranlar */
(function () {
  'use strict';
  const NX = window.NX, F = NX.fmt, V = NX.views;
  const $ = s => document.querySelector(s);
  const panel = $('#panel');
  const now = new Date();

  const S = {
    model: null, tab: 'map', street: null, route: null, routeQ: '',
    demand: clampDemand(NX.store.get('demand', NX.config.demand.def)),
    sim: { busy: false, progress: null, last: null }, whatif: { street: null, type: 'oneway-A' }, simInfo: null,
    ai: { q: '', busy: null, answer: null },
    fc: { street: null, d: now.getDay(), h: now.getHours() },
    measuring: null, measureErr: null, batch: null, batchErr: null,
    chat: { msgs: [], busy: null }, chatStreet: null, segment: null, segPick: null,
    verify: {}, verifyOpen: null, verifyBatch: null, area: null, review: null,
    calib: null, calibBusy: null, load: null, yandexOn: null, yandexMain: false, widgetOn: false, yandexState: null,
    live: { last: null, next: null, busy: null, err: null },
    weather: null, incidents: null,
  };
  const LIVE_EVERY = 5 * 60 * 1000;
  NX.state = S;

  function clampDemand(v) { const c = NX.config.demand; v = +v; return isFinite(v) ? Math.max(c.min, Math.min(40000, Math.round(v / c.step) * c.step)) : c.def; }

  // ---------- Toast ----------
  let toastT;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show ' + (kind || '');
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 4200);
  }

  // ---------- Yuklash ----------
  async function loadData(force) {
    S.load = 'loading';
    panel.innerHTML = V.loading('Maʼlumot yuklanmoqda…');
    setStatus('loading');
    try {
      const res = await NX.osm.load({ force, onStep: t => { panel.innerHTML = V.loading(t); } });
      S.raw = res.data;
      const M = NX.analysis.build(res.data, NX.fixes.asPoints());
      NX.analysis.applyTomTom(M, NX.tomtom.latest());
      NX.analysis.refresh(M);
      S.model = M; S.load = 'ok';
      if (S.street != null && !M.streets[S.street]) S.street = null;
      S.route = null; S.sim.last = null;
      S.fc.street = (M.namedStreets.slice().sort((a, b) => b.risk.value - a.risk.value)[0] || M.streets[0]).id;
      NX.view.clearDeltas();
      NX.view.setModel(M);
      NX.view.drawFixes(shownFixes());
      setStatus(res.source, res.data.ts);
      render();
      if (res.warning) toast(res.warning, 'warn');
      else if (res.source === 'network') toast('Maʼlumot yangilandi: ' + M.namedStreets.length + ' ta koʻcha, ' + M.routes.length + ' ta yoʻnalish.', 'ok');
      NX.sim.init(M).then(info => { S.simInfo = info; }).catch(e => console.error(e));
      startLive();
      // Boshqa foydalanuvchilar saqlagan tuzatishlar (svetofor bor, muammo emas…) serverdan olinadi
      NX.fixes.loadShared().then(() => { if (NX.fixes.list().length) rebuildModel(); }, () => {}).then(() => {
        // Muammolar real suratlar bilan avtomatik tekshiriladi (bir marta): Mapillary + AI
        if (!S.reviewStarted) { S.reviewStarted = true; review(); }
        // Yomgʻir prognozi (hodisalar uchun) va saqlangan relyef boʻlsa — toshqin xavfi
        // Prognozdagi yomgʻir boʻyicha qaysi koʻchalarda suv toʻplanishi (relyef saqlangan boʻlsa)
        const alertScen = () => { const T = twinState(); if (T.dem && T.rain && T.rain.d24 >= 8) T.alertScen = rainScen(T.rain.d24); if (S.tab === 'map') renderKeepScroll(); };
        NX.bigStore.get('roads:v2').then(R => { if (R && R.list) { twinState().roads = R.list; alertScen(); } });
        NX.twin.rain().then(r => { twinState().rain = r; alertScen(); }).catch(() => {});
        NX.bigStore.get('dem:v2').then(D => { if (D && D.z && !twinState().flood) { twinState().dem = D; twinState().flood = NX.twin.flood(D, S.model); alertScen(); } });
      });
      // Asosiy xarita — Yandex (real tirbandlik + tahlil). Ishlamasa — zaxira xarita va probkalar tugmasi
      if (S.yandexOn == null) setYandex(true);
      else if (S.yandexMain) { NX.view.syncYandex(M, shownFixes()); drawSys(); }
      NX.systems.load().then(() => { drawSys(); if (S.tab === 'map' || S.tab === 'systems') render(); });
    } catch (e) {
      console.warn(e);
      S.load = 'error';
      setStatus('error');
      panel.innerHTML = V.error(e);
    }
  }

  function setStatus(src, ts) {
    const el = $('#dataStatus');
    const txt = { loading: 'Yuklanmoqda…', error: 'Maʼlumot yoʻq', network: 'Yangi', cache: 'Kesh', stale: 'Eski kesh' }[src] || src;
    const cls = { loading: 'busy', error: 'bad', network: 'ok', cache: 'ok', stale: 'warn' }[src] || '';
    el.className = 'status ' + cls;
    el.innerHTML = `<i></i><span>${txt}${ts ? ' · ' + F.time(ts) : ''}</span>`;
    el.title = ts ? 'OpenStreetMap maʼlumoti vaqti: ' + F.time(ts) + (src === 'cache' || src === 'stale' ? ' (brauzer keshidan)' : '') : '';
    $('#btnRefresh').disabled = src === 'loading';
  }

  // ---------- Render ----------
  function render() {
    document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
    if (!S.model) return;
    // Taxminiy bashorat ranglari chizilmaydi — xaritada faqat real tirbandlik (Yandex) va odamlar xabarlari
    NX.view.setColorMode({ mode: 'now' });
    const M = S.model;
    let html;
    NX.view.showProblems(S.tab === 'problems');
    if (S.tab === 'map') html = S.area ? V.area(S) : S.street != null ? V.street(S, M.streets[S.street]) : V.home(S);
    else if (S.tab === 'problems') {
      const op = S.problemOpen && M.problems.find(x => x.id === S.problemOpen);
      if (!op) S.problemOpen = null;
      html = op ? V.problem(S, op) : V.problems(S);
    }
    else if (S.tab === 'ai') html = V.aiChat(S);
    else if (S.tab === 'systems') html = V.systems(S);
    else if (S.tab === 'twin') html = V.twin(S);
    else if (S.tab === 'routes') html = V.routes(S);
    else html = V.report(S);
    // Qayta chizishda foydalanuvchi ochgan “Batafsil” boʻlimlari ochiq qoladi
    const open = new Set([...panel.querySelectorAll('details[open] > summary')].map(x => x.textContent));
    panel.innerHTML = html;
    if (open.size) panel.querySelectorAll('details > summary').forEach(x => { if (open.has(x.textContent)) x.parentElement.open = true; });
  }

  // Panelda hozir koʻrsatilayotgan koʻcha (Xarita yoki Bashorat boʻlimida)
  const ctxStreet = () => {
    if (!S.model) return null;
    const id = S.tab === 'forecast' ? S.fc.street : S.tab === 'map' ? S.street : null;
    return id == null ? null : S.model.streets[id];
  };
  const swap = (sel, html) => {
    const el = $(sel);
    if (!el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    el.replaceWith(tmp.firstElementChild);
  };
  const renderSimOut = () => {
    const el = $('#simOut');
    if (el) el.innerHTML = S.sim.busy ? V.progress(S.sim.progress) : '';
  };
  const renderActions = () => { const s = ctxStreet(); if (s) swap('#whatif', V.actions(S, s)); };
  const renderAI = () => swap('#aiBox', V.aiBox(S, ctxStreet()));

  // Xaritada foydalanuvchi qoʻygan belgilar; Muammolar boʻlimida — faqat muammolar, avtomatik tekshiruv belgilari hech qachon
  const shownFixes = () => (S.tab === 'problems' ? [] : NX.fixes.list().filter(x => x.id[0] !== 'a'));
  // Shahar tizimlari xaritada (Muammolar boʻlimida yashiriladi)
  function drawSys() {
    if (S.tab === 'problems') return NX.view.drawSystems([]);
    const list = NX.systems.loaded().filter(k => !(S.sysOff || {})[k]).map(k => ({ sys: k, gj: NX.systems.get(k).gj }));
    if (NX.webcams.get() && NX.webcams.get().length) list.push({ sys: 'webcam', gj: NX.webcams.geo() });
    NX.view.drawSystems(list);
  }
  async function camLoad() {
    const W = S.webcams = S.webcams || {};
    W.busy = true; W.err = null; renderKeepScroll();
    try { W.list = await NX.webcams.load(60); drawSys(); } catch (e) { W.err = e.message; }
    W.busy = false; renderKeepScroll();
  }
  async function sysUpload(sys, file) {
    S.sysBusy = sys; render();
    try {
      if (file.size > 24 * 1024 * 1024) throw new Error('Fayl 24 MB dan katta.');
      const gj = NX.systems.parse(file.name, await file.text());
      if (!gj.features.length) throw new Error('Faylda obyekt topilmadi.');
      const r = await NX.systems.save(sys, file.name, gj);
      drawSys();
      toast(`${NX.SYSTEMS[sys].uz}: ${gj.features.length} ta obyekt yuklandi. ${r.shared ? 'Barcha xodimlarga koʻrinadi.' : 'Faqat shu kompyuterda (' + r.reason + ').'}`, r.shared ? 'ok' : 'warn');
    } catch (e) { toast(e.message, 'bad'); }
    S.sysBusy = null; render();
  }
  function sysShow(sys) {
    const d = NX.systems.get(sys); if (!d) return;
    (S.sysOff || {})[sys] = false; drawSys();
    let s = 90, w = 180, n = -90, e = -180;
    const walk = c => { if (typeof c[0] === 'number') { s = Math.min(s, c[1]); n = Math.max(n, c[1]); w = Math.min(w, c[0]); e = Math.max(e, c[0]); } else c.forEach(walk); };
    d.gj.features.forEach(f => walk(f.geometry.coordinates));
    NX.view.flyTo((s + n) / 2, (w + e) / 2, n - s > 0.05 ? 13 : n - s > 0.01 ? 15 : 16);
    if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function setTab(t) {
    if (t !== 'map') ensureLeaflet();
    if (S.segPick) { NX.view.cancelPick(); S.segPick = null; }
    // Bashorat boʻlimida xarita bashorat boʻyicha boʻyaladi — eski simulyatsiya qatlami olib tashlanadi
    if ((t === 'forecast' || t === 'problems') && S.tab !== t) NX.view.clearDeltas(false);
    const wasProblems = S.tab === 'problems';
    S.tab = t;
    // 3D egizak — xarita oʻrnida MapLibre 3D koʻrinishi
    const el3 = $('#map3d');
    el3.hidden = t !== 'twin';
    $('.map-wrap').classList.toggle('twin-on', t === 'twin');
    if (t === 'twin') loadTwin();
    if (t === 'systems' && !S.webcams && NX.ai.available()) camLoad();
    if (wasProblems !== (t === 'problems')) { NX.view.drawFixes(shownFixes()); drawSys(); }
    if (t !== 'routes') { if (S.route != null) NX.view.highlightRoute(null); S.route = null; }
    render();
    panel.scrollTop = 0;
  }

  function focusPanel() {
    if (window.matchMedia('(max-width: 820px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else panel.scrollTop = 0;
  }

  // ---------- 3D raqamli egizak: binolar, relyef (toshqin), quyosh, soya ----------
  const twinState = () => (S.twin = S.twin || {});
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('vaqt tugadi')), ms))]);
  async function loadTwin() {
    const T = twinState();
    const onView = async bb => { try { const n = await NX.buildings.loadView(bb); if (n) { T.buildings = NX.buildings.get(); NX.map3d.set({ buildings: T.buildings }); if (S.tab === 'twin') renderKeepScroll(); } } catch (e) { /* */ } };
    const draw = () => { if (S.tab === 'twin') { NX.map3d.show($('#map3d'), { buildings: T.buildings || [], ghi: T.ghi, flood: T.flood, scen: T.scen || null, onView }).catch(e => { T.err = e.message; renderKeepScroll(); }); renderKeepScroll(); } };
    draw();
    if (T.loading) return T.ready;
    if (T.ready && T.dem) return T.ready;
    T.loading = true; T.err = null;
    let fin; T.ready = new Promise(r => { fin = r; });
    const step = t => { T.busy = t; if (S.tab === 'twin') renderKeepScroll(); };
    const jobs = [
      NX.twin.solarYear().then(g => { T.ghi = g; }).catch(e => { T.err = e.message; }),
      NX.twin.rain().then(r => { T.rain = r; }).catch(() => {}),
      NX.twin.climate().then(c => { T.climate = c; }).catch(() => {}),
    ];
    try { T.buildings = await NX.buildings.load(step); } catch (e) { T.err = e.message; }
    draw();
    // Relyef binolardan keyin — suv ostidagi binolar ham hisoblansin
    try { T.dem = await NX.twin.dem(step); step('Suv oqimi hisoblanmoqda'); T.flood = NX.twin.flood(T.dem, S.model); } catch (e) { T.err = e.message; }
    // Butun shahar koʻchalari — suv koʻchalar boʻylab hisoblanadi va chiziladi
    try { T.roads = await NX.twin.roads(step); T.roadsErr = null; } catch (e) { T.roadsErr = e.message; }
    await Promise.all(jobs);
    T.busy = null; T.loading = false;
    draw(); fin();
  }
  // “N mm yomgʻir yogʻsa” — suv qayerda va qancha chuqurlikda toʻplanadi (xaritada)
  function twinRain(mm) {
    const T = twinState();
    if (!T.dem) return null;
    if (!T.roads) { toast(T.roadsErr || 'Shahar koʻchalari hali yuklanmadi.', 'warn'); return null; }
    T.scen = rainScen(mm);
    NX.map3d.setMode('flood'); NX.map3d.set({ scen: T.scen });
    const top = T.scen.streets && T.scen.streets[0];
    if (top && top.at) NX.map3d.flyTo(top.at[0], top.at[1], 15.5);
    return T.scen;
  }
  // ---------- Dinamik transport: tigʻiz soat 15 daqiqalik qadamlarda, navbatlar bilan ----------
  function dynSummary(res) {
    const M = S.model, pcs = S.simInfo.pieces, ps = pcs.map(([wi]) => M.ways[wi].street), P = res.P;
    const per = res.slices.map((sl, si) => {
      const m = new Map();
      for (let p = 0; p < P; p++) { const q = res.ql[si * P + p], r = res.sr[si * P + p]; if (q < 1 && r > 0.85) continue; const s = ps[p], o = m.get(s) || { s, q: 0, r: 1 }; o.q = Math.max(o.q, q); o.r = Math.min(o.r, r); m.set(s, o); }
      return [...m.values()].filter(o => M.streets[o.s].name).sort((a, b) => b.q - a.q || a.r - b.r);
    });
    // Har koʻcha: navbat qachon boshlanadi, eng uzun payti
    const st = new Map();
    per.forEach((list, si) => list.forEach(o => { const v = st.get(o.s) || { s: o.s, name: M.streets[o.s].name, start: null, peak: 0, peakAt: null, minR: 1 }; if (o.q >= 50 && v.start == null) v.start = res.slices[si].time; if (o.q > v.peak) { v.peak = o.q; v.peakAt = res.slices[si].time; } v.minR = Math.min(v.minR, o.r); st.set(o.s, v); }));
    const streets = [...st.values()].filter(v => v.peak >= 50 || v.minR < 0.55).sort((a, b) => b.peak - a.peak || a.minR - b.minR);
    const peakSi = res.slices.reduce((b, sl, i) => (sl.queueVeh > res.slices[b].queueVeh ? i : b), 0);
    return { per, streets, peakSi };
  }
  async function runDynamic(scenario, label) {
    const T = S.dynT = S.dynT || {};
    if (T.busy) return T;
    T.busy = 'Tarmoq tayyorlanmoqda'; renderKeepScroll();
    try {
      await NX.sim.whenReady(); S.simInfo = NX.sim.info();
      const res = await NX.sim.dynamic({ demand: S.demand, scenario: scenario || null, iters: 4 }, p => { T.busy = `Tigʻiz soat hisoblanmoqda ${Math.round(p * 100)}%`; const el = panel.querySelector('#dynTBusy'); if (el) el.textContent = T.busy + '…'; });
      T.res = res; T.sum = dynSummary(res); T.label = label || 'Hozirgi holat'; T.si = T.sum.peakSi;
      ensureLeaflet();
      showDynSlice(T.si);
    } catch (e) { console.error(e); toast('Dinamik model xatosi: ' + e.message, 'bad'); }
    T.busy = null; renderKeepScroll();
    return T;
  }
  function showDynSlice(si) {
    const T = S.dynT; if (!T || !T.res) return;
    T.si = Math.max(0, Math.min(T.res.slices.length - 1, si));
    const P = T.res.P, a = T.si * P;
    NX.view.clearDeltas(false);
    NX.view.showDynamic(T.res.sr.subarray(a, a + P), T.res.ql.subarray(a, a + P), S.simInfo.pieces);
    const el = panel.querySelector('#dynTInfo'); if (el) el.outerHTML = V.dynTInfo(S);
  }
  let dynTTimer = null;
  function dynTPlay() {
    const T = S.dynT; if (!T || !T.res) return;
    if (dynTTimer) { clearInterval(dynTTimer); dynTTimer = null; T.playing = false; renderKeepScroll(); return; }
    T.playing = true; if (T.si >= T.res.slices.length - 1) T.si = 0; renderKeepScroll();
    dynTTimer = setInterval(() => { if (T.si >= T.res.slices.length - 1) { clearInterval(dynTTimer); dynTTimer = null; T.playing = false; renderKeepScroll(); return; } showDynSlice(T.si + 1); }, 900);
  }
  const dynTFacts = (T, sid) => {
    const r = T.res, sm = T.sum, one = sid != null ? sm.streets.find(x => x.s === sid) : null;
    return { model: 'dinamik (15 daqiqalik qadamlar, navbatlar bilan, 07:00–10:00)', shahar_navbati_mashina: r.slices.map(s => ({ vaqt: s.time, navbat: s.queueVeh })), eng_yomon_payt: r.slices[sm.peakSi].time,
      navbatli_koʻchalar: sm.streets.slice(0, 8).map(v => ({ koʻcha: v.name, navbat_boshlanadi: v.start, eng_uzun_m: Math.round(v.peak), qachon: v.peakAt, eng_past_tezlik_foiz: Math.round(v.minR * 100) })),
      shu_koʻcha: one ? { navbat_boshlanadi: one.start, eng_uzun_m: Math.round(one.peak), qachon: one.peakAt, eng_past_tezlik_foiz: Math.round(one.minR * 100) } : 'navbat yoʻq' };
  };

  // ---------- 2D fizik model (LISFLOOD-FP): vaqt boʻyicha suv ----------
  // series: [{ t0, t1, mmh }] soniyalarda; label — “50 mm / 1 soat” yoki “Real prognoz”
  async function twinFlood2d(series, label, t0ms) {
    const T = twinState();
    if (T.dynBusy) return T.dyn;
    T.dynBusy = 'Relyef tayyorlanmoqda'; renderKeepScroll();
    try {
      await loadTwin();
      T.d40 = T.d40 || await NX.twin.grid40(t => { T.dynBusy = t; renderKeepScroll(); });
      T.dynBusy = 'Suv oqimi hisoblanmoqda (2D model) 0%'; renderKeepScroll();
      const R = await NX.twin.flood2d(T.d40, T.roads || [], series, { drainMm: NX.systems.get('sewer') ? 15 : 10 }, p => { T.dynBusy = `Suv oqimi hisoblanmoqda (2D model) ${Math.round(p * 100)}%`; const el = panel.querySelector('#dynBusy'); if (el) el.textContent = T.dynBusy + '…'; });
      R.label = label; R.t0ms = t0ms || null;
      T.dyn = R; T.dynFrame = R.frames.indexOf(R.peak);
      twinShowFrame(T.dynFrame, true);
    } catch (e) { console.error(e); toast('2D model xatosi: ' + e.message, 'bad'); }
    T.dynBusy = null; renderKeepScroll();
    return T.dyn;
  }
  function twinShowFrame(i, fly) {
    const T = twinState(), R = T.dyn; if (!R) return;
    T.dynFrame = Math.max(0, Math.min(R.frames.length - 1, i));
    NX.map3d.setMode('flood');
    NX.map3d.set({ scen: { mode: 'street', segs: NX.twin.frameSegs(R, T.dynFrame), wetIds: R.wetIds } });
    if (fly && R.streets[0] && R.streets[0].at) NX.map3d.flyTo(R.streets[0].at[0], R.streets[0].at[1], 15.3);
    const el = panel.querySelector('#dynInfo'); if (el) el.outerHTML = V.dynInfo(S); const rg = panel.querySelector('[data-input=twin-t]'); if (rg && +rg.value !== T.dynFrame) rg.value = T.dynFrame;
  }
  let dynTimer = null;
  function twinPlay() {
    const T = twinState();
    if (dynTimer) { clearInterval(dynTimer); dynTimer = null; T.playing = false; renderKeepScroll(); return; }
    if (!T.dyn) return;
    T.playing = true; if (T.dynFrame >= T.dyn.frames.length - 1) T.dynFrame = 0; renderKeepScroll();
    dynTimer = setInterval(() => { if (T.dynFrame >= T.dyn.frames.length - 1 || S.tab !== 'twin') { clearInterval(dynTimer); dynTimer = null; T.playing = false; renderKeepScroll(); return; } twinShowFrame(T.dynFrame + 1); }, 700);
  }
  const dynFacts = R => ({
    model: '2D fizik model (LISFLOOD-FP, 40 m katak, vaqt boʻyicha)', yomgir: R.label, kanalizatsiya_mm_soat: R.drain,
    eng_yuqori_payt: { vaqt: fmtT(R, R.peak.t), suvli_koʻchalar_km: R.peak.km },
    vaqt_boʻyicha_km: R.frames.filter((f, i) => i % 3 === 0).map(f => ({ vaqt: fmtT(R, f.t), km: f.km })),
    koʻchalar: R.streets.slice(0, 12).map(x => ({ koʻcha: x.name, eng_chuqur_sm: Math.round(x.max * 100), qachon: fmtT(R, x.t), suvli_qismi_m: x.len })),
    suv_yetadigan_binolar: R.buildings, maktab_shifoxona: R.critical,
  });
  const fmtT = (R, t) => (R.t0ms ? new Date(R.t0ms + t * 1000 + 5 * 3600e3).toISOString().slice(11, 16) : `+${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`);

  // Koʻchalar yuklangan boʻlsa — suv koʻchalar boʻylab; aks holda relyef kataklari boʻyicha
  function rainScen(mm) {
    const T = twinState(), drain = NX.systems.get('sewer') ? 15 : 10;
    return NX.twin.streetScenario(T.dem, T.roads || [], mm, { drainMm: drain });
  }
  function twinFacts(extra) {
    const T = twinState(), b = T.buildings || [], lv = n => b.filter(x => !x.est && x.levels >= n).length;
    return Object.assign({
      real_yogin_prognozi: T.rain ? { keyingi_24_soat_mm: T.rain.d24, keyingi_48_soat_mm: T.rain.d48, eng_kuchli_soat_mm: T.rain.maxH } : null,
      relyef: T.dem ? { manba: T.dem.src, katak_m: T.dem.step, shahar_balandligi_m: T.flood ? [Math.round(T.flood.zmin), Math.round(T.flood.zmax)] : null, botiqlar_soni: T.flood ? T.flood.basins : null } : 'yuklanmadi',
      binolar_osm: { jami: b.length, qavati_nomaʼlum_foiz: b.length ? Math.round(b.filter(x => x.est).length / b.length * 100) : null, qavat_5_va_yuqori: lv(5), qavat_9_va_yuqori: lv(9), maktab: b.filter(x => x.kind === 'school').length, bogcha: b.filter(x => x.kind === 'kindergarten').length, shifoxona: b.filter(x => /hospital|clinic/.test(x.kind)).length },
      quyosh_yillik_kvt_soat_m2: T.ghi ? T.ghi.kwh : null,
      kanalizatsiya_xaritasi: NX.systems.get('sewer') ? 'yuklangan' : 'yuklanmagan (sigʻim 10 mm deb olingan)',
      iqlim_samarqand: T.climate ? { manba: T.climate.src, harorat_meyori_1991_2020_c: T.climate.tNorm, yogin_meyori_mm: T.climate.pNorm, isish_c_10_yilda: T.climate.trend10,
        oxirgi_yillar: T.climate.years.slice(-5).map(o => ({ yil: o.y, harorat_c: o.t, yogin_mm: o.p, eng_kuchli_kun_mm: o.pmax })), eng_kuchli_kunlar_1991dan: T.climate.top.slice(0, 5), oylik_meyor_mm: T.climate.monthNorm, ozgidromet: T.climate.doc, ozgidromet_oylik_yogin_mm: NX.twin.EGOV_RAIN } : { ozgidromet: NX.twin.UZHYDROMET, ozgidromet_oylik_yogin_mm: NX.twin.EGOV_RAIN },
    }, extra || {});
  }
  const scenFacts = s => ({ yomgir_mm_1_soatda: s.rain, kanalizatsiya_olib_ketadi_mm_soat: s.drain, [s.mode === 'street' ? 'suv_10sm_dan_chuqur_koʻchalar_km' : 'suv_ostida_ga']: s.mode === 'street' ? s.km : s.areaHa, koʻchalar: s.streets.slice(0, 12).map(x => ({ koʻcha: x.name, eng_chuqur_sm: Math.round(x.max * 100), suvli_qismi_m: x.len })), suv_yetadigan_binolar: s.buildings, maktab_shifoxona: s.critical, hisob: s.mode === 'street' ? 'koʻchalar boʻylab oqim (OSM koʻchalari + SRTM relyef, Manning)' : 'relyef kataklari' });
  async function twinAsk(q) {
    q = (q || '').trim();
    const C = S.twinChat = S.twinChat || { msgs: [], busy: null };
    if (!q || C.busy) return;
    const prev = C.msgs.slice(-2);
    C.msgs.push({ role: 'user', text: q });
    C.busy = 'Maʼlumot tayyorlanmoqda'; renderKeepScroll();
    await loadTwin();
    const n = q.toLowerCase();
    const mmM = n.match(/(\d+(?:[.,]\d+)?)\s*(mm|millimetr)/);
    const rainQ = mmM || /yomg|jala|sel|toshqin|suv bos/.test(n);
    const quakeQ = /zilzila|yer qimirla|silkin|seysm/.test(n);
    let extra = {}, local = '';
    if (rainQ && twinState().dem) {
      const mm = mmM ? parseFloat(mmM[1].replace(',', '.')) : /sel|juda kuchli/.test(n) ? 80 : /kuchli|jala/.test(n) ? 50 : 30;
      C.busy = `${mm} mm yomgʻir hisoblanmoqda`; renderKeepScroll();
      const variants = [...new Set([Math.round(mm / 2), mm, mm * 2])].filter(x => x > 0).map(x => scenFacts(rainScen(x)));
      const sc = rainScen(mm);
      // Asosiy javob — 2D fizik model (vaqt boʻyicha); tez solishtirish — koʻchalar boʻylab barqaror hisob
      C.busy = `${mm} mm yomgʻir — 2D model hisoblanmoqda`; renderKeepScroll();
      const R = await twinFlood2d([{ t0: 0, t1: 3600, mmh: mm }], `${mm} mm, 1 soatda`);
      extra = { fizik_model_2d: R ? dynFacts(R) : 'hisoblanmadi', tez_solishtirish: variants };
      local = `**${mm} mm yomgʻirda** ${sc.mode === 'street' ? `${sc.km} km koʻchada 10 sm dan chuqur suv` : `~${sc.areaHa} ga suv ostida`}, ${sc.buildings} ta binoga suv yetadi.${sc.streets.length ? `\n\n**Xavfli koʻchalar:** ${sc.streets.slice(0, 6).map(x => `${x.name} (${Math.round(x.max * 100)} sm)`).join(', ')}.` : ''}${sc.critical.length ? `\n\n**Maktab/shifoxona:** ${sc.critical.join(', ')}.` : ''}`;
    }
    if (quakeQ) { NX.map3d.setMode('quake'); extra.zilzila_rejimi = 'xaritada: qizil — maktab/bogʻcha/shifoxona, toʻq sariq — 5+ qavat, sariq — 3–4 qavat'; }
    C.busy = 'AI tahlil qilmoqda'; renderKeepScroll();
    let r;
    try { r = NX.ai.available() ? await NX.ai.twinAsk(q, twinFacts(extra), prev) : { text: local || 'AI ulanmagan.', src: 'hisob', error: 'AI ulanmagan.' }; }
    catch (e) { r = { text: local || e.message, src: 'hisob', error: e.message }; }
    C.msgs.push({ role: 'ai', text: r.text, src: r.src, error: r.error });
    C.busy = null; renderKeepScroll();
  }

  // ---------- Belgilangan hudud (mahalla) ----------
  const DESTS = [{ name: 'Registon', ll: [39.6547, 66.9758] }, { name: 'Siyob bozori', ll: [39.6619, 66.9805] }, { name: 'Aeroport', ll: [39.7005, 66.9838] }];
  // Real vaqt: hududdan asosiy joylargacha hozirgi tirbandlik bilan yoʻl vaqti (Yandex)
  async function loadAreaLive(A) {
    if (!NX.view.yandexActive() || NX.yandex.mode() !== 'api') return;
    A.live = { busy: true };
    let list = null;
    try { list = await NX.yandex.routeTimes(A.st.center, DESTS); } catch (e) { list = null; }
    if (S.area !== A) return;
    A.live = { busy: false, list: list || [], ts: Date.now() };
    if (S.tab === 'map') renderKeepScroll();
  }
  const areaExtra = () => ({ level: S.yandexState && S.yandexState.level, weather: S.weather });
  function drawArea() {
    if (!S.model) return;
    if (S.tab !== 'map') setTab('map');
    NX.view.cancelPick();
    if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    NX.draw.start(poly => {
      const st = NX.area.stats(S.model, poly);
      st.systems = NX.systems.loaded().map(k => { const gj = NX.systems.get(k).gj; return Object.assign({ sys: k, nearest: NX.systems.nearest(gj, ...st.center) }, NX.systems.inArea(gj, poly)); });
      if (st.areaHa < 0.2) { toast('Hudud juda kichik — kattaroq chizing.', 'warn'); return; }
      const A0 = {};
      Object.keys(NX.area.ASSUME).forEach(k => { A0[k] = NX.area.ASSUME[k].v; });
      const prev = S.area;
      S.area = { st, spec: prev ? prev.spec : { flats: 500, floors: 9 }, A: prev ? prev.A : A0, res: null, busy: null, qa: [], qaBusy: null };
      S.street = null; NX.view.selectStreet(null); setSegment(null);
      NX.view.clearDeltas();
      NX.view.drawArea(poly, null, true);
      render(); focusPanel();
      loadAreaLive(S.area);
    });
  }
  function clearArea() {
    NX.draw.stop();
    S.area = null;
    NX.view.drawArea(null);
    NX.view.clearDeltas();
    render();
  }
  async function runBuild() {
    const A = S.area;
    if (!A || A.busy) return;
    A.busy = { p: 0, label: 'Tarmoq tayyorlanmoqda' }; A.res = null;
    renderKeepScroll();
    try {
      await NX.sim.whenReady();
      S.simInfo = NX.sim.info();
      const b = NX.area.buildFacts(A.spec, A.A);
      const sc = { type: 'build', at: NX.geo.xy(A.st.center[0], A.st.center[1]), trips: b.peak, outShare: 0.7 };
      const prog = (o, l) => (p, lab) => { if (S.area !== A) return; A.busy = { p: o + p / 2, label: l || lab }; const el = panel.querySelector('#areaBuild .progress'); if (el) el.outerHTML = V.progress(A.busy); };
      const sim = await NX.sim.run({ demand: S.demand, scenario: sc, iters: 10 }, prog(0, 'Bugungi holat'));
      const fut = await NX.sim.run({ demand: S.demand, scenario: Object.assign({ growth: 1.15 }, sc), iters: 10 }, prog(0.5, '5 yildan keyin'));
      if (S.area !== A) return;
      A.res = { b, sim, fut, ev: NX.area.assess(A.st, b, sim, fut) };
      // Yangi bino soyasi (qishda qaysi binolar soyada qoladi) — binolar xaritasi boʻyicha
      try {
        const bl = await withTimeout(NX.buildings.load(t => { A.busy = { p: 1, label: t }; }), 25000);
        const sh = NX.twin.shadows(A.st.center, b.footprint, A.spec.floors, bl);
        A.res.shadow = sh;
        if (sh.shaded.length) A.res.ev.cons.push(`Qishda (21-dekabr, 9:00–15:00) ${sh.shaded.length} ta qoʻshni bino ${A.spec.floors} qavatli bino soyasida qoladi — “3D egizak”da koʻring.`);
        else A.res.ev.pros.push('Qishda ham qoʻshni binolarga soya tushmaydi.');
        const inA = bl.filter(x => NX.area.inside(A.st.poly, x.c[0], x.c[1]));
        A.res.blds = { n: inA.length, area: Math.round(inA.reduce((t, x) => t + x.area, 0)), maxLv: inA.reduce((m, x) => Math.max(m, x.est ? 0 : x.levels), 0) };
        NX.map3d.set({ plan: sh });
      } catch (e) { /* binolar yuklanmadi — soya hisoblanmaydi */ }
      ensureLeaflet();
      NX.view.showDeltas(sim, S.simInfo.pieces);
      NX.view.drawArea(A.st.poly, A.st.center, false);
    } catch (e) {
      console.error(e);
      toast('Hisob xatosi: ' + e.message, 'bad');
    }
    A.busy = null;
    if (S.tab === 'map' && S.area === A) renderKeepScroll();
  }
  // ---------- Chuqur tahlil: hudud/koʻcha boʻyicha tirbandlik savollari ----------
  const TRAFFIC_Q = /prop|probk|tirban|tiqil|oqim|nima qils|yechim|hal qil|qanday qil|bir tomon|yops|svetofor|polosa|yoʻlak|yolak/i;
  // Koʻchaning hudud ichidagi qismi: boʻlaklar va ikki uchi (oʻq boʻyicha)
  function streetPart(sid, poly) {
    const M = S.model, s = M.streets[sid], pcs = [], pts = [];
    S.simInfo.pieces.forEach(([wi, i0, i1], idx) => {
      const w = M.ways[wi];
      if (w.street !== sid) return;
      const mid = w.ll[Math.floor((i0 + i1) / 2)];
      if (!poly || NX.area.inside(poly, mid[0], mid[1])) { pcs.push(idx); for (let k = i0; k <= i1; k++) pts.push(w.ll[k]); }
    });
    if (!pts.length) return null;
    const pr = ll => { const [x, y] = NX.geo.xy(ll[0], ll[1]); return x * s.axis[0] + y * s.axis[1]; };
    let a = pts[0], b = pts[0];
    pts.forEach(p => { if (pr(p) < pr(a)) a = p; if (pr(p) > pr(b)) b = p; });
    return { pieces: pcs, a, b, len: Math.round(NX.geo.d(...NX.geo.xy(a[0], a[1]), ...NX.geo.xy(b[0], b[1]))) };
  }
  // Real oʻlchovlar tarixi (shu kompyuterda): har ochilganda Yandex yoʻl vaqtlari yoziladi
  function yxHistory(sid, sample) {
    const k = 'yx:' + sid, h = NX.store.get(k, []);
    if (sample) { h.push(sample); NX.store.set(k, h.slice(-300)); }
    return h;
  }
  async function deepAnalyze(q, A, onStep) {
    const M = S.model, st = A ? A.st : null;
    const found = NX.ai.detectStreets(q, M);
    const sid = found.length ? found[0].s.id : st ? (st.streets.find(x => x.name) || st.streets[0] || {}).s : S.chatStreet;
    if (sid == null) return null;
    const s = M.streets[sid], d = V.directionLabels(s), scen = NX.ai.detectScenario(q);
    await NX.sim.whenReady(); S.simInfo = NX.sim.info();
    const part = streetPart(sid, st && st.poly) || streetPart(sid, null);
    // Variantlar: savolga qarab
    let types;
    if (scen && scen.type === 'oneway') types = ['oneway-A', 'oneway-B'];
    else if (scen && scen.type === 'close') types = ['close', 'oneway-A', 'oneway-B'];
    else if (scen && (scen.type === 'buslane' || scen.type === 'signal')) types = [scen.type];
    else types = ['oneway-A', 'oneway-B', 'signal'].concat(s.busRefs.length ? ['buslane'] : []);
    const opts = [];
    for (const type of types) {
      const { sc, label, dirSign } = scenarioFor(s, type);
      if (part && st) { sc.pieces = part.pieces; }
      const lab = label.replace(/^[^:]*:/, `${s.name || 'Koʻcha'}${part && st ? ` (hudud ichidagi ${part.len} m)` : ''}:`);
      onStep(`Hisoblanmoqda: ${lab}`);
      const r = await NX.sim.run({ demand: S.demand, scenario: sc, iters: 10 });
      opts.push({ type, label: lab, r, v: verdict(r, sc, s, type, dirSign || 1), pieces: sc.pieces });
    }
    const score = o => o.v.level * 10 + o.r.ttChangePct + o.r.overloadedCount * 2 - (o.r.target ? Math.max(0, o.r.target.baseVC - o.r.target.scenVC) * 20 : 0);
    const best = opts.slice().sort((x, y) => score(x) - score(y))[0];
    // Real: Yandex hozirgi yoʻl vaqtlari ikkala yoʻnalishda
    onStep('Yandex’dan real yoʻl vaqtlari olinmoqda');
    let live = null;
    if (part && NX.view.yandexActive() && NX.yandex.mode() === 'api') {
      try {
        const [ab, ba] = await Promise.all([NX.yandex.routeTimes(part.a, [{ name: d.B, ll: part.b }]), NX.yandex.routeTimes(part.b, [{ name: d.A, ll: part.a }])]);
        if (ab && ab[0] && ba && ba[0]) live = { ts: Date.now(), [d.A + 'dan ' + d.B + 'ga']: ab[0], [d.B + 'dan ' + d.A + 'ga']: ba[0] };
      } catch (e) { live = null; }
    }
    const hist = yxHistory(sid, live ? { ts: live.ts, ab: live[d.A + 'dan ' + d.B + 'ga'].jams / Math.max(1, live[d.A + 'dan ' + d.B + 'ga'].free), ba: live[d.B + 'dan ' + d.A + 'ga'].jams / Math.max(1, live[d.B + 'dan ' + d.A + 'ga'].free) } : null);
    // Internet
    onStep('Internetdan maʼlumot qidirilmoqda');
    let web = null;
    try { web = await NX.ai.webSearchQ(`Samarqand, ${s.name || 'koʻcha'}: tirbandlik, yoʻl taʼmiri, bir tomonlama harakat yoki svetofor boʻyicha yangiliklar va hokimiyat qarorlari (oxirgi 3 yil)`, `Koʻcha: ${s.name}. Yoʻnalishlar: ${d.A} — ${d.B}.`); } catch (e) { web = null; }
    // Dinamik: tigʻiz soatda navbat qachon boshlanib, qancha uzayadi — hozir va eng yaxshi variantda
    onStep('Tigʻiz soat (07:00–10:00) dinamik hisoblanmoqda');
    let dyn = null;
    try {
      const b0 = await NX.sim.dynamic({ demand: S.demand, iters: 3 }), b1 = await NX.sim.dynamic({ demand: S.demand, scenario: Object.assign({}, scenarioFor(s, best.type).sc, best.pieces ? { pieces: best.pieces } : {}), iters: 3 });
      const f = (r, lab) => dynTFacts({ res: r, sum: dynSummary(r), label: lab }, sid);
      dyn = { hozir: f(b0, 'hozir'), eng_yaxshi_variant: f(b1, best.label) };
    } catch (e) { dyn = null; }
    // Xaritada — eng yaxshi variant
    ensureLeaflet();
    NX.view.showDeltas(best.r, S.simInfo.pieces);
    NX.view.selectStreet(sid, false);
    if (A) NX.view.drawArea(A.st.poly, null, false);
    const row = x => ({ koʻcha: x.name || 'nomsiz yoʻl', mashina_soat: Math.round(x.dv) });
    const min = t => Math.round(t / 60 * 10) / 10;
    const facts = {
      koʻcha: { nomi: s.name, turi: NX.HW[s.hw].uz, polosalar: s.lanes || s.lanesPerDir * 2 || null, hozir: s.oneway === 'yes' ? 'bir tomonlama' : 'ikki tomonlama', uzunlik_m: Math.round(s.length), tahlil_qilingan_qism_m: part ? part.len : null, yonalishlar: `${d.A} ↔ ${d.B}`, avtobuslar: s.busRefs, svetoforlar: s.signals.length, piyoda_otish: s.crossings.length },
      real_yandex_hozir: live ? Object.keys(live).filter(k => k !== 'ts').map(k => ({ yonalish: k, hozir_daqiqa: min(live[k].jams), probkasiz_daqiqa: min(live[k].free), sekinlashish_marta: +(live[k].jams / Math.max(1, live[k].free)).toFixed(2) })) : 'olinmadi (Yandex xaritasi yoqilmagan)',
      real_yandex_vaqt: live ? new Date(live.ts).toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand' }) : null,
      shahar_tirbandligi_ball: S.yandexState && S.yandexState.level,
      oldingi_olchovlar: hist.length > 1 ? { soni: hist.length, davr: `${new Date(hist[0].ts).toLocaleDateString('uz-UZ')} — ${new Date(hist[hist.length - 1].ts).toLocaleDateString('uz-UZ')}`, soat_boyicha: Object.entries(hist.reduce((m, x) => { const h = new Date(x.ts).getHours(); (m[h] = m[h] || []).push(x); return m; }, {})).map(([h, a]) => ({ soat: +h, [d.A + '→' + d.B]: +(a.reduce((t, x) => t + x.ab, 0) / a.length).toFixed(2), [d.B + '→' + d.A]: +(a.reduce((t, x) => t + x.ba, 0) / a.length).toFixed(2) })) } : 'hali yoʻq (har safar tahlil qilinganda yoziladi)',
      variantlar_hisob: opts.map(o => ({ variant: o.label, baho: o.v.label, umumiy_yol_vaqti_foiz: +o.r.ttChangePct.toFixed(1), shu_koʻcha_toʻlishi_foiz: o.r.target ? { oldin: Math.round(o.r.target.baseVC * 100), keyin: Math.round(o.r.target.scenVC * 100) } : null, yuk_oshadigan: o.r.affected.filter(x => x.dv > 0).slice(0, 4).map(row), yuk_kamayadigan: o.r.affected.filter(x => x.dv < 0).slice(0, 3).map(row), sigmay_qoladigan: o.r.overloaded.slice(0, 4).map(x => x.name || 'nomsiz yoʻl'), avtobus_yonalishi_ozgaradi: o.v.busLines, sabablar: o.v.reasons })),
      xaritada_korsatilgan: best.label,
      dinamik_tigiz_soat: dyn || 'hisoblanmadi',
      internet: web && web.text ? { matn: web.text.slice(0, 2500), manbalar: web.sources.slice(0, 6) } : 'qidirilmadi yoki topilmadi',
      eslatma: 'variantlar_hisob — harakat modeli; real_yandex — real oʻlchov',
    };
    return { facts, opts, best, sid, web };
  }

  async function areaAsk(q) {
    const A = S.area;
    q = (q || '').trim();
    if (!A || !q || A.qaBusy) return;
    const prev = A.qa.slice(-2);
    A.qa.push({ role: 'user', text: q });
    // Savolda xonadon/qavat boʻlsa — avval qurilish hisoblanadi
    const pb = NX.area.parseBuild(q);
    if (pb && (pb.flats || pb.floors || !A.res)) {
      if (pb.flats) A.spec.flats = pb.flats;
      if (pb.floors) A.spec.floors = pb.floors;
      A.qaBusy = 'Qurilish taʼsiri hisoblanmoqda — natija xaritada…';
      renderKeepScroll();
      await runBuild();
    }
    // Tirbandlik / bir tomonlama / svetofor savoli — chuqur tahlil (variantlar, Yandex real vaqt, internet, xarita)
    let r = null;
    if (!pb && TRAFFIC_Q.test(q) && NX.ai.available()) {
      try {
        const step = t => { A.qaBusy = t + '…'; renderKeepScroll(); };
        const dp = await deepAnalyze(q, A, step);
        if (dp) {
          A.deep = dp;
          step('AI xulosa yozmoqda (chuqur tahlil)');
          r = await NX.ai.deepAsk(q, Object.assign({ hudud: NX.ai.areaFacts(A, areaExtra()).hudud_osm, shahar_tizimlari: NX.ai.systemsFacts(A.st) }, dp.facts), prev);
          r.opts = dp.opts.map((o, i) => ({ i, label: o.label, tt: o.r.ttChangePct, vc: o.r.target ? [o.r.target.baseVC, o.r.target.scenVC] : null, over: o.r.overloadedCount, level: o.v.level, best: o === dp.best }));
          r.sources = dp.web && dp.web.sources ? dp.web.sources.slice(0, 5) : [];
        }
      } catch (e) { console.warn(e); r = null; }
    }
    if (!r) {
      A.qaBusy = 'AI javob yozmoqda…';
      renderKeepScroll();
      r = await NX.ai.areaAsk(q, A, prev, areaExtra());
    }
    A.qa.push({ role: 'ai', text: r.text, src: r.src, error: r.error, opts: r.opts, sources: r.sources });
    A.qaBusy = null;
    if (S.tab === 'map' && S.area === A) { renderKeepScroll(); const c = $('#areaChat'); if (c) c.scrollIntoView({ block: 'end' }); }
  }

  // ---------- Muammoni real surat bilan tekshirish ----------
  const probById = pid => S.model && S.model.problems.find(x => x.id === pid);
  function renderRow(pid) {
    if (S.tab !== 'problems') return;
    if (S.problemOpen) { if (S.problemOpen === pid) renderKeepScroll(); return; }
    const p = probById(pid), li = p && panel.querySelector(`li[data-row="${CSS.escape(pid)}"]`);
    if (li) li.outerHTML = V.locRow(S, p);
  }
  function renderKeepScroll() { const y = panel.scrollTop, wy = window.scrollY; render(); panel.scrollTop = y; window.scrollTo(0, wy); }
  async function verifyCheck(p) {
    const v = S.verify[p.id] = Object.assign(S.verify[p.id] || {}, { busy: true, err: null });
    renderRow(p.id);
    try { v.res = await NX.mly.check(p); } catch (e) { v.err = e.message; }
    v.busy = false;
    renderRow(p.id);
    return v;
  }
  async function verifyPart(pid, k, fn) {
    const p = probById(pid), v = S.verify[pid];
    if (!p || !v || (v[k] && v[k].busy)) return;
    v[k] = { busy: true };
    renderRow(pid);
    try { v[k] = Object.assign({ busy: false }, await fn(p, v.res)); } catch (e) { v[k] = { busy: false, err: e.message }; }
    renderRow(pid);
  }
  // Muammo bosilganda — panelda faqat shu muammo: holati, nima qilish kerak, reja, 4 tomondan suratlar, AI xulosasi
  async function openProblem(p) {
    S.problemOpen = p.id;
    ensureLeaflet();
    focusProblem(p);
    render(); panel.scrollTop = 0;
    const v = S.verify[p.id] = S.verify[p.id] || {};
    // Chorrahadagi har bir koʻcha oqimi (harakat modeli, tigʻiz soat) va real sunʼiy yoʻldosh surati
    if (p.streets && !v.flows) {
      try {
        await NX.sim.whenReady(); S.simInfo = NX.sim.info();
        const fl = await NX.sim.flows({ demand: S.demand, iters: 10 }), [cx, cy] = NX.geo.xy(p.lat, p.lon), M = S.model;
        v.flows = p.streets.map(sid => {
          let sum = 0, n = 0;
          S.simInfo.pieces.forEach(([wi, i0, i1], idx) => { const w = M.ways[wi]; if (w.street !== sid) return; const a = w.xy[i0], c = w.xy[i1]; if (Math.min(Math.hypot(a[0] - cx, a[1] - cy), Math.hypot(c[0] - cx, c[1] - cy)) < 40) { sum += fl[idx]; n++; } });   // chorrahaga tutashgan boʻlaklar
          return { street: sid, name: M.streets[sid].name || 'nomsiz yoʻl', hw: M.streets[sid].hw, flow: n ? Math.round(sum / n) : null };
        });
      } catch (e) { v.flows = null; }
      renderRow(p.id);
    }
    if (!v.sat && (p.type === 'junction' || p.type === 'priority' || p.type === 'school')) {
      v.sat = { busy: true }; renderRow(p.id);
      try { v.sat = await NX.plan.satellite(S.model, V.effP(S, p)); } catch (e) { v.sat = { err: e.message }; }
      renderRow(p.id);
    }
    if (!NX.mly.available()) return;
    if (!v.res && !v.busy) await verifyCheck(p);
    if (!v.views) {
      v.views = { busy: true }; renderRow(p.id);
      const onRoad = (lat, lon) => { const [x, y] = NX.geo.xy(lat, lon); let best = null, bd = 10; S.model.streetsNear(x, y, 10).forEach((d, sid) => { if (d < bd) { bd = d; best = sid; } }); return best; };
      try { v.views = { list: await NX.mly.views4(p, onRoad, [p.major, p.street].filter(x => x != null)) }; } catch (e) { v.views = { err: e.message, list: [] }; }
      renderRow(p.id);
    }
    // AI xulosasi — avtomatik; bir marta koʻrilgan suratlar uchun saqlanadi
    const list = v.views.list && v.views.list.length ? v.views.list : null;
    if (!v.ai && NX.ai.available() && (list || (v.res && v.res.photo))) {
      const ck = 'pvai2:' + p.key + ':' + (list || [v.res.photo]).map(x => x.id).join(',');
      const hit = NX.store.get(ck, null);
      if (hit) { v.ai = { text: hit }; renderRow(p.id); }
      else verifyPart(p.id, 'ai', async () => { const text = await NX.ai.vision(V.effP(S, p), S.model, v.res, list, { flows: v.flows }); NX.store.set(ck, text); return { text }; });
    }
  }

  // ---------- Avtomatik tekshiruv: muammolar real suratlar bilan (Mapillary + AI) ----------
  const REVIEW_TYPES = ['junction', 'school'];
  const keepKeys = () => new Set(NX.store.get('review:keep', []));
  function renderReview() { if (S.tab === 'problems') swap('#reviewCard', V.reviewCard(S)); }
  async function review(opt) {
    opt = opt || {};
    if (!S.model || !NX.mly.available() || (S.review && S.review.busy)) return;
    const keep = keepKeys();
    const items = S.model.problems.filter(p => REVIEW_TYPES.includes(p.type) && !keep.has(p.key)).slice(0, 150);
    const R = S.review = Object.assign(S.review || { fixed: [] }, { busy: true, stage: 'Mapillary suratlari tekshirilmoqda', done: 0, total: items.length, err: null });
    renderReview();
    // 1) Mapillary suratlaridan avtomatik topilgan svetofor/zebra (bepul)
    let i = 0;
    const run = async () => { while (i < items.length) { const p = items[i++]; await verifyCheck(p); R.done++; if (R.done % 5 === 0) renderReview(); } };
    await Promise.all([run(), run(), run()]);
    const resolved = items.filter(p => S.verify[p.id] && S.verify[p.id].res && S.verify[p.id].res.status === 'ok').map(p => ({ p, by: 'Mapillary', r: S.verify[p.id].res }));
    // 2) AI suratni koʻradi — obyekt topilmagan, lekin surati bor joylar
    if (opt.ai !== false) {
      if (!(await NX.ai.proxyReady())) R.err = 'AI tekshiruvi ishlamayapti: Cloudflare’dagi Worker kodi eski — yangisini qoʻyish kerak (worker/ai-proxy.js).';
      else {
        let shared = {};
        try { shared = (await NX.ai.photoChecksAll()) || {}; } catch (e) { shared = {}; }
        const todo = items.filter(p => { const v = S.verify[p.id]; return v && v.res && v.res.status === 'bad' && v.res.photo; }).slice(0, opt.aiMax || 80);
        Object.assign(R, { stage: 'AI suratlarni koʻrib chiqmoqda', done: 0, total: todo.length });
        renderReview();
        let k = 0;
        const runAI = async () => {
          while (k < todo.length) {
            const p = todo[k++], v = S.verify[p.id];
            let a = shared[p.key] || NX.mly.aiGet(p, v.res);
            if (!a) {
              try { a = await NX.ai.photoCheck(p, v.res); NX.mly.aiSet(p, v.res, a); }
              catch (e) { R.err = e.message; if (/Worker|limit|kalit|kredit|quota/i.test(e.message)) k = todo.length; a = null; }
            }
            if (a) {
              const what = p.type === 'junction' ? 'svetofor' : 'piyoda oʻtish joyi';
              const seen = p.type === 'junction' ? a.signal : (a.crossing === 'bor' || a.signal === 'bor' ? 'bor' : a.crossing);
              if (seen === 'bor') { v.res = Object.assign({}, v.res, { status: 'ok', by: 'ai', text: `AI suratda ${what} borligini koʻrdi: ${a.note}` }); resolved.push({ p, by: 'AI', r: v.res }); }
              else if (seen === 'yoq') v.res = Object.assign({}, v.res, { by: 'ai', text: `AI ham tasdiqladi — suratda ${what} yoʻq: ${a.note}` });
              else v.res = Object.assign({}, v.res, { status: 'unknown', by: 'ai', text: `Suratdan aniqlab boʻlmadi: ${a.note}` });
            }
            R.done++; renderRow(p.id); if (R.done % 3 === 0) renderReview();
          }
        };
        await Promise.all([runAI(), runAI()]);
      }
    }
    // 3) Suratda svetofor/oʻtish bor joylar — xaritaga belgi qoʻyiladi va muammolar roʻyxatidan olinadi
    if (resolved.length) {
      const added = NX.fixes.addLocal(resolved.map(x => ({ kind: x.p.type === 'junction' ? 'signal' : 'crossing', lat: x.p.lat, lon: x.p.lon, key: x.p.key, note: `${x.p.title} — ${x.by} surati${x.r.photo ? ' (' + x.r.photo.when + ')' : ''}` })));
      added.forEach((f, n) => R.fixed.push({ id: f.id, key: resolved[n].p.key, title: resolved[n].p.title, by: resolved[n].by, photo: resolved[n].r.photo, kind: f.kind }));
      rebuildModel();
    }
    R.busy = false; R.ts = Date.now();
    renderReview();
    if (resolved.length) toast(`Real suratlarda ${resolved.length} ta joyda ${resolved.some(x => x.p.type === 'junction') ? 'svetofor' : 'oʻtish joyi'} bor ekan — muammolar roʻyxatidan olindi.`, 'ok');
  }
  async function reviewUndo(id) {
    const R = S.review, f = R && R.fixed.find(x => x.id === id);
    if (!f) return;
    try { await NX.fixes.remove(id); } catch (e) { toast(e.message, 'bad'); return; }
    NX.store.set('review:keep', [...keepKeys().add(f.key)]);
    R.fixed = R.fixed.filter(x => x.id !== id);
    rebuildModel();
    toast('Qaytarildi — bu joy yana muammo sifatida koʻrsatiladi.', 'ok');
  }
  async function reviewShare() {
    try { const n = await NX.fixes.syncLocal(); await NX.fixes.loadShared(); S.review.shared = true; rebuildModel(); toast(`${n} ta tuzatish hamma uchun saqlandi.`, 'ok'); }
    catch (e) { toast('Saqlanmadi: ' + e.message, 'bad'); }
  }

  async function verifyAll(type) {
    const items = S.model.problems.filter(p => p.type === type).slice(0, 60);
    const b = S.verifyBatch = { type, busy: true, done: 0, total: items.length };
    renderKeepScroll();
    let i = 0;
    const worker = async () => { while (i < items.length) { const p = items[i++]; await verifyCheck(p); b.done++; const el = panel.querySelector('.vsum'); if (el && S.tab === 'problems' && b.done % 5 === 0) renderKeepScroll(); } };
    await Promise.all([worker(), worker(), worker()]);
    b.busy = false;
    renderKeepScroll();
    const ok = items.filter(p => S.verify[p.id] && S.verify[p.id].res && S.verify[p.id].res.status === 'ok').length;
    toast(`Tekshirildi: ${items.length} ta joy. ${ok ? ok + ' tasida suratda bor — xaritani tuzatish mumkin.' : ''}`, 'ok');
  }

  // ---------- Koʻchaning bir qismi ----------
  const segOf = sid => (S.segment && S.segment.street === sid ? S.segment : null);
  function setSegment(seg) {
    S.segment = seg;
    NX.view.selectSegment(seg ? seg.lines : null);
  }
  function refreshSeg() { if (S.tab === 'ai') renderChat(); else renderActions(); }
  async function pickSegment(sid) {
    NX.view.cancelPick();
    setSegment(null);
    const s = S.model.streets[sid];
    await NX.sim.whenReady();
    S.simInfo = NX.sim.info();
    const cancel = () => { S.segPick = null; refreshSeg(); };
    const step = (n, cb) => {
      S.segPick = { street: sid, step: n }; refreshSeg();
      NX.view.pickPoint({ text: n === 1 ? `✂️ <b>${NX.esc(s.name || 'Koʻcha')}</b>: qism <b>boshini</b> bosing` : '✂️ Endi qism <b>oxirini</b> bosing', onCancel: cancel }, ll => cb([ll.lat, ll.lng]));
    };
    step(1, A => step(2, B => {
      S.segPick = null;
      const seg = NX.segment.build(S.model, S.simInfo.pieces, sid, A, B);
      if (!seg) { toast('Qism topilmadi: ikki nuqtani koʻchaning turli joylarida bosing.', 'warn'); refreshSeg(); return; }
      setSegment(seg);
      toast(`Tanlandi: ${NX.segment.label(seg)} · ${F.km(seg.len)}`, 'ok');
      refreshSeg();
    }));
  }
  function dropSegmentUnless(sid) {
    if (S.segPick && S.segPick.street !== sid) { NX.view.cancelPick(); S.segPick = null; }
    if (S.segment && S.segment.street !== sid) setSegment(null);
  }

  function openStreet(id, opt) {
    dropSegmentUnless(id);
    S.tab = 'map'; S.street = id; S.measureErr = null;
    ensureLeaflet();
    NX.view.selectStreet(id, true);
    render(); focusPanel();
    // Kalit boʻlsa — koʻcha ochilganda real holati avtomatik oʻlchanadi (10 daqiqadan eski boʻlsa)
    const s = S.model.streets[id];
    if (NX.tomtom.key() && !S.measuring && (!s.tomtom || Date.now() - s.tomtom.ts > 10 * 60 * 1000)) measure(id);
  }

  // ---------- Simulyatsiya ----------
  function scenarioFor(s, type) {
    const r = scenarioWhole(s, type), seg = segOf(s.id);
    if (!seg || r.sc.type === 'demand') return r;
    r.sc.pieces = seg.pieces;
    r.label = r.label.replace(/^[^:]*:/, `${s.name || 'Nomsiz yoʻl'} (${NX.segment.label(seg)}, ${F.km(seg.len)}):`);
    return r;
  }
  function scenarioWhole(s, type) {
    const d = V.directionLabels(s), nm = s.name || 'Nomsiz yoʻl';
    switch (type) {
      case 'oneway-A': return { sc: { type: 'oneway', street: s.id, axis: s.axis }, label: `${nm}: bir tomonlama (${d.A} tomonga)`, dirSign: 1 };
      case 'oneway-B': return { sc: { type: 'oneway', street: s.id, axis: [-s.axis[0], -s.axis[1]] }, label: `${nm}: bir tomonlama (${d.B} tomonga)`, dirSign: -1 };
      case 'close': return { sc: { type: 'close', street: s.id }, label: `${nm}: avtomobillar uchun yopiladi` };
      case 'buslane': return { sc: { type: 'buslane', street: s.id }, label: `${nm}: bitta polosa avtobusga` };
      case 'signal': return { sc: { type: 'signal', street: s.id }, label: `${nm}: svetofor qoʻshish/optimallashtirish (+15%)` };
      default: return { sc: { type: 'demand', factor: 1.2, street: s.id }, label: 'Talab +20% (turistik mavsum)' };
    }
  }

  // Bir tomonlama qilinganda qaysi liniyalar (relation) teskari yoʻnalishda yuradi
  function linesToReroute(s, type, dirSign) {
    const M = S.model;
    if (type === 'close') return s.busRefs.slice();
    if (!type.startsWith('oneway')) return [];
    const ax = [s.axis[0] * dirSign, s.axis[1] * dirSign], out = new Set();
    [...s.routes].forEach(i => {
      const r = M.routes[i];
      const on = r.stops.filter(st => M.streetsNear(st.x, st.y, 30).has(s.id));
      if (on.length >= 2) {
        const a = on[0], b = on[on.length - 1];
        if ((b.x - a.x) * ax[0] + (b.y - a.y) * ax[1] < 0) out.add(r.label);
      } else out.add(r.label + ' (?)');
    });
    return [...out].sort((a, b) => (parseInt(a, 10) || 1e9) - (parseInt(b, 10) || 1e9));
  }

  function verdict(r, sc, s, type, dirSign) {
    let lv = 0; const why = [];
    const up = x => { lv = Math.max(lv, x); };
    const tt = r.ttChangePct;
    if (tt > 8) { up(2); why.push(`Hammaning yoʻlda yuradigan vaqti ${F.num(tt, 1)}% ga koʻpayadi — bu juda koʻp.`); }
    else if (tt > 2) { up(1); why.push(`Hammaning yoʻlda yuradigan vaqti ${F.num(tt, 1)}% ga koʻpayadi.`); }
    else why.push(tt < -0.5 ? `Yoʻlda yuradigan vaqt ${F.num(-tt, 1)}% ga kamayadi.` : 'Yoʻlda yuradigan vaqt deyarli oʻzgarmaydi.');
    if (r.overloadedCount >= 3) { up(2); why.push(`${r.overloadedCount} ta koʻchaga mashinalar sigʻmay qoladi.`); }
    else if (r.overloadedCount >= 1) { up(1); why.push(`${r.overloadedCount} ta koʻchaga mashinalar sigʻmay qoladi.`); }
    if (r.relievedCount) why.push(`${r.relievedCount} ta koʻchada tirbandlik yoʻqoladi.`);
    const dUn = r.scen.unassigned - r.base.unassigned * (r.scen.demand / Math.max(1, r.base.demand));
    if (dUn > 0.01 * r.scen.demand) { up(2); why.push(`Ayrim joylarga mashinada borib boʻlmay qoladi (soatiga ${F.int(dUn)} ta safar).`); }
    const lines = linesToReroute(s, type, dirSign);
    if (lines.length >= 3) { up(1); why.push(`${lines.length} ta avtobus liniyasi yoʻnalishini oʻzgartirishi kerak.`); }
    else if (lines.length) why.push(`${lines.length} ta avtobus liniyasi yoʻnalishini oʻzgartirishi kerak.`);
    if (type === 'buslane') {
      if (s.busRefs.length) why.push(`${s.busRefs.length} ta liniya (${s.busRefs.join(', ')}) alohida polosadan foydalanadi — avtobuslar tezligi va qatnov barqarorligi oshadi.`);
      else { up(1); why.push('Bu koʻchada avtobus liniyasi yoʻq — alohida polosa foyda bermaydi.'); }
      if ((r.notes || []).includes('single-lane')) { up(1); why.push('Koʻchada har tomonga 1 polosa: polosa ajratilsa avtomobillar sigʻimi ikki baravar kamayadi.'); }
    }
    if (r.target && sc.type !== 'close' && r.target.scenVC > 1.1) { up(1); why.push(`Bu koʻchaning oʻzi ham sigʻmay qoladi (${F.pct(r.target.scenVC * 100)} toʻladi).`); }
    const labels = sc.type === 'demand' ? ['Tarmoq bardosh beradi', 'Chegarada', 'Tarmoq bardosh bermaydi'] : ['Mos keladi', 'Ehtiyotkorlik bilan', 'Tavsiya etilmaydi'];
    return { level: lv, label: labels[lv], reasons: why, busLines: lines };
  }

  async function runWhatIf(streetId, type) {
    const s = S.model.streets[streetId];
    const { sc, label, dirSign } = scenarioFor(s, type);
    S.whatif = { street: streetId, type };
    S.sim.busy = true; S.sim.progress = { p: 0, label: 'Tarmoq tayyorlanmoqda' };
    renderActions();
    try {
      await NX.sim.whenReady();
      S.simInfo = NX.sim.info();
      const iters = 10;
      const r = await NX.sim.run({ demand: S.demand, scenario: sc, iters }, (p, l) => { S.sim.progress = { p, label: l }; renderSimOut(); });
      S.sim.last = { street: streetId, type, label, demand: S.demand, result: r, verdict: verdict(r, sc, s, type, dirSign || 1), iters };
      ensureLeaflet();
      NX.view.showDeltas(r, S.simInfo.pieces);
      NX.view.selectStreet(streetId, false);
      if (segOf(streetId)) NX.view.selectSegment(S.segment.lines);
    } catch (e) {
      console.error(e);
      toast('Simulyatsiya xatosi: ' + e.message, 'bad');
    } finally {
      S.sim.busy = false;
    }
    renderActions();
    const w = $('#whatif');
    if (w && window.matchMedia('(max-width: 820px)').matches) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return S.sim.last;
  }

  async function calibrate() {
    const M = S.model;
    const meas = M.streets.filter(s => s.tomtom).map(s => ({ street: s.id, congestion: s.tomtom.congestion }));
    if (!meas.length) return;
    S.calibBusy = { p: 0, label: 'Kalibrlash' }; render();
    try {
      await NX.sim.whenReady();
      const res = await NX.sim.calibrate({ demand: S.demand, meas }, (p, l) => {
        S.calibBusy = { p, label: l };
        const el = panel.querySelector('.progress'); if (el) el.outerHTML = V.progress(S.calibBusy);
      });
      if (res.ok) { S.calib = res; S.demand = clampDemand(res.best.demand); NX.store.set('demand', S.demand); toast('Kalibrlandi: talab ' + F.int(S.demand) + ' reys/soat.', 'ok'); }
      else toast('Oʻlchangan koʻchalar tarmoqda topilmadi.', 'warn');
    } catch (e) { toast('Kalibrlash xatosi: ' + e.message, 'bad'); }
    S.calibBusy = null; render();
  }

  // ---------- TomTom ----------
  async function measure(id) {
    const M = S.model, s = M.streets[id];
    S.measuring = id; S.measureErr = null; render();
    try {
      s.tomtom = await NX.tomtom.measureStreet(s, M);
      NX.analysis.refresh(M); NX.view.restyle(); NX.view.drawProblems();
      toast(`${s.name || 'Koʻcha'}: tirbandlik ${F.pct(s.tomtom.congestion)} (TomTom).`, 'ok');
    } catch (e) {
      S.measureErr = e.message;
      if (e.noKey) openSettings('tomtom');
    }
    S.measuring = null; render();
  }

  async function measureMain() {
    const M = S.model, list = V.mainStreets(M);
    if (!NX.tomtom.key()) { S.batchErr = 'TomTom kaliti kiritilmagan. Sozlamalarda kalitni kiriting.'; render(); openSettings('tomtom'); return; }
    S.batchErr = null;
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      S.batch = `Oʻlchanmoqda: ${i + 1}/${list.length} — ${list[i].name}`; render();
      try { list[i].tomtom = await NX.tomtom.measureStreet(list[i], M); ok++; } catch (e) {
        S.batchErr = e.message;
        if (e.status === 401 || e.status === 403 || e.status === 429 || e.noKey) break;
      }
      await NX.sleep(250);
    }
    S.batch = null;
    NX.analysis.refresh(M); NX.view.restyle(); NX.view.drawProblems();
    toast(`${ok} ta koʻcha oʻlchandi.`, ok ? 'ok' : 'warn');
    render();
  }

  // ---------- Xaritani bosish: boʻlimga qarab ----------
  function nearestProblem(lat, lon, r) {
    const [x, y] = NX.geo.xy(lat, lon);
    let best = null, bd = r;
    S.model.problems.forEach(p => { const [px, py] = NX.geo.xy(p.lat, p.lon); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = p; } });
    return best;
  }
  function nearestStreet(lat, lon) {
    const [x, y] = NX.geo.xy(lat, lon);
    let best = null, bd = Infinity;
    S.model.streetsNear(x, y, 40).forEach((d, id) => { if (d < bd) { bd = d; best = id; } });
    return best;
  }
  function focusProblem(p) {
    S.focusPid = p.id;
    NX.view.focusProblem(p);
    document.querySelectorAll('.locrow').forEach(li => li.classList.toggle('on', !!li.querySelector(`[data-id="${p.id}"]`)));
    const row = document.querySelector(`.locrow [data-id="${p.id}"]`);
    if (row && !window.matchMedia('(max-width: 820px)').matches) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function mapClick(lat, lon, streetId) {
    if (!S.model) return;
    // AI boʻlimida — bosilgan koʻcha suhbatga biriktiriladi
    if (S.tab === 'ai') {
      const id = streetId != null ? streetId : nearestStreet(lat, lon);
      if (id == null) return;
      S.chatStreet = S.chatStreet === id ? null : id;
      dropSegmentUnless(S.chatStreet);
      NX.view.selectStreet(S.chatStreet, false);
      renderChat();
      return;
    }
    // Hudud panelida xaritani bosish hududni yopib yubormaydi
    if (S.tab === 'map' && S.area) return;
    // Muammolar boʻlimida — eng yaqin muammo ochiladi, boshqa boʻlimga oʻtib ketmaydi
    if (S.tab === 'problems') { const p = nearestProblem(lat, lon, 150); if (p) openProblem(p); return; }
    const id = streetId != null ? streetId : nearestStreet(lat, lon);
    if (id == null) return;
    if (S.tab === 'forecast') { S.fc.street = id; NX.view.selectStreet(id, false); render(); focusPanel(); return; }
    // Ajratilgan koʻchani qayta bosish — ajratish olib tashlanadi
    if (S.tab === 'map' && S.street === id) { clearStreet(); return; }
    openStreet(id);
  }
  function clearStreet() {
    dropSegmentUnless(null);
    S.street = null;
    NX.view.selectStreet(null);
    if (S.tab === 'map') render();
  }

  // ---------- Xaritani oʻrgatish: tuzatishlar ----------
  function rebuildModel() {
    if (!S.raw) return;
    const M = NX.analysis.build(S.raw, NX.fixes.asPoints());
    NX.analysis.applyTomTom(M, NX.tomtom.latest());
    NX.analysis.refresh(M);
    S.model = M;
    NX.view.setModel(M);
    NX.view.drawFixes(shownFixes());
    if (S.street != null) NX.view.selectStreet(S.street, false);
    render();
  }
  async function onFix(f) {
    const M = S.model;
    const p = f.pid ? M.problems.find(x => x.id === f.pid) : null;
    let item = null;
    if (f.action === 'remove') {
      try { await NX.fixes.remove(f.id); toast('Belgi oʻchirildi.', 'ok'); } catch (e) { toast(e.message, 'bad'); }
      rebuildModel(); return;
    }
    if (f.action === 'pick-crossing' || f.action === 'pick-stop') {
      ensureLeaflet();
      NX.view.pickPoint(f.action.slice(5), ll => onFix({ action: 'add', kind: f.action.slice(5), lat: ll.lat, lon: ll.lng, key: p && p.key }));
      return;
    }
    if (f.action === 'add') item = { kind: f.kind, lat: f.lat, lon: f.lon, key: f.key || '' };
    else if (p && (f.action === 'signal' || f.action === 'crossing')) item = { kind: f.action, lat: p.lat, lon: p.lon, key: p.key, note: p.title };
    else if (p && f.action === 'dismiss') item = { kind: 'dismiss', lat: p.lat, lon: p.lon, key: p.key, note: p.title };
    if (!item) return;
    const before = M.problems.length;
    const r = await NX.fixes.add(item);
    rebuildModel();
    const gone = before - S.model.problems.length;
    const k = NX.fixes.KIND[item.kind];
    toast(`${k.icon} ${k.uz === 'Muammo emas' ? 'Muammo yopildi' : k.uz + ' belgilandi'}${gone > 0 ? ` — ${gone} ta muammo yoʻqoldi` : ''}. ${r.shared ? 'Hamma uchun saqlandi.' : 'Faqat shu brauzerda saqlandi (' + r.reason + ').'}`, r.shared ? 'ok' : 'warn');
  }

  // ---------- Yandex probkalar (real tirbandlik) ----------
  // Asosiy xarita — Yandex (probkalar + tahlil qatlamlari). Yandex JS API ishlamasa: Leaflet tahlil xaritasi,
  // probkalar esa kalitsiz Yandex vidjetida (pastdagi tugma) koʻriladi.
  async function setYandex(on) {
    const btn = $('#btnYandex'), L = NX.map.leaflet();
    if (on === S.yandexOn) return;
    S.yandexOn = on;
    if (on) {
      const c = L.getCenter();
      try {
        if (!NX.yandex.key() || NX.yandex.mode() === 'widget') throw new Error('kalit yoʻq');
        await NX.yandex.show([c.lat, c.lng], L.getZoom(), {
          onClick: (lat, lon) => mapClick(lat, lon),
          onState: st => { S.yandexState = st; renderLive(); },
        });
        S.yandexMain = true;
        $('.map-wrap').classList.add('ya-on');
        btn.hidden = true;
        NX.view.syncYandex(S.model, shownFixes()); drawSys();
        NX.view.showProblems(S.tab === 'problems');
        if (S.street != null) NX.view.selectStreet(S.street, false);
        NX.map.updateLegend();
      } catch (e) {
        console.warn('Yandex JS API:', e.message);
        NX.yandex.hide();
        S.yandexMain = false; S.yandexOn = false;
        $('.map-wrap').classList.remove('ya-on');
        btn.hidden = false;
        if (!/kalit yoʻq/.test(e.message)) toast('Yandex xaritasi ochilmadi — oddiy xarita koʻrsatilmoqda. Probkalar: pastdagi tugma.', 'warn');
      }
    } else NX.yandex.hide();
    renderLive();
  }
  // Zaxira rejim: probkalarni kalitsiz Yandex vidjetida koʻrsatish/yopish
  async function toggleWidget() {
    const btn = $('#btnYandex'), L = NX.map.leaflet();
    S.widgetOn = !S.widgetOn;
    btn.classList.toggle('on', S.widgetOn);
    btn.textContent = S.widgetOn ? '🗺 Tahlil xaritasi' : '🚦 Yandex probkalar';
    if (S.widgetOn) { const c = L.getCenter(); await NX.yandex.show([c.lat, c.lng], L.getZoom(), {}, { widget: true }); }
    else { NX.yandex.hide(); NX.map.invalidate(); }
  }
  const ensureLeaflet = () => { if (S.widgetOn) toggleWidget(); };

  // ---------- Jonli kuzatuv: har 5 daqiqada real maʼlumot (ob-havo, tirbandlik, yoʻl hodisalari) ----------
  let liveTimer = null;
  function startLive() {
    S.live.next = Date.now();
    if (!liveTimer) liveTimer = setInterval(liveTick, 30000);
    liveTick();
  }
  function liveTick() {
    if (!S.model || document.hidden) return;
    if (Date.now() >= S.live.next && !S.live.busy) liveCycle();
  }
  const renderLive = () => { if (S.tab === 'problems' || (S.tab === 'map' && S.street == null)) swap('.live', V.nowCard(S)); };
  async function liveCycle() {
    const M = S.model;
    S.live.busy = 'Yangilanmoqda…'; renderLive();
    // TomTom kvotasini tejash: butun shahar uchun bitta plita qatlami + bitta hodisalar soʻrovi
    // TomTom plitalari Samarqandda deyarli boʻsh — real tirbandlik Yandex orqali koʻrsatiladi
    NX.view.setRealTraffic(null);
    const jobs = [
      NX.weather.load().then(d => { S.weather = { data: d }; }).catch(e => { S.weather = { err: e.message }; }),
    ];
    if (NX.tomtom.key()) jobs.push(NX.tomtom.incidents().then(list => { S.incidents = { list, ts: Date.now() }; NX.view.setIncidents(list); }).catch(e => { S.incidents = { err: e.message }; }));
    else { S.incidents = null; NX.view.setIncidents([]); }
    await Promise.all(jobs);
    if (S.model !== M) return;
    NX.analysis.refresh(M); NX.view.restyle(); NX.view.drawProblems(); NX.map.updateLegend();
    S.live.busy = null; S.live.last = Date.now(); S.live.next = Date.now() + LIVE_EVERY;
    renderLive();
  }
  // Kalit oʻzgarganda darhol yangilash
  function refreshLiveNow() { S.live.next = 0; liveTick(); }

  // ---------- AI yordamchi (chat) ----------
  function renderChat() {
    if (S.tab !== 'ai') return;
    swap('#chat', V.aiChat(S));
    const chat = $('#chat');
    if (!chat) return;
    if (window.matchMedia('(max-width: 820px)').matches) { const f = chat.querySelector('.chat-form'); if (f) f.scrollIntoView({ block: 'nearest' }); }
    else panel.scrollTop = panel.scrollHeight;
  }
  function simSummary(last) {
    if (!last) return null;
    const r = last.result, row = x => ({ s: x.s, name: x.name, dv: x.dv });
    return {
      verdict: last.verdict.label, level: last.verdict.level, tt: r.ttChangePct,
      up: r.affected.filter(x => x.dv > 0).slice(0, 4).map(row), down: r.affected.filter(x => x.dv < 0).slice(0, 3).map(row),
      lines: last.verdict.busLines,
    };
  }
  async function chatSend(q) {
    q = (q || '').trim();
    if (!q || S.chat.busy || !S.model) return;
    // Belgilangan hudud bor va savol hudud yoki qurilish haqida — hudud tahliliga
    if (S.area && S.chatStreet == null && (NX.area.parseBuild(q) || /hudud|mahalla|bu yer/i.test(q))) {
      S.chat.msgs.push({ role: 'user', text: q });
      S.chat.busy = 'Hudud tahlil qilinmoqda…'; renderChat();
      const pb = NX.area.parseBuild(q);
      if (pb) { if (pb.flats) S.area.spec.flats = pb.flats; if (pb.floors) S.area.spec.floors = pb.floors; await runBuild(); }
      const r = await NX.ai.areaAsk(q, S.area, S.chat.msgs.slice(-3, -1), areaExtra());
      S.chat.msgs.push({ role: 'ai', text: r.text, src: r.src, error: r.error });
      S.chat.busy = null; renderChat();
      return;
    }
    const prev = S.chat.msgs.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    S.chat.msgs.push({ role: 'user', text: q });
    S.chat.busy = 'Oʻylayapman…';
    renderChat();
    const TYPE = { oneway: d => 'oneway-' + (d || 'A'), close: () => 'close', buslane: () => 'buslane', signal: () => 'signal', demand: () => 'demand' };
    // Koʻcha boʻyicha tirbandlik savoli — chuqur tahlil (bir nechta variant, Yandex real vaqt, internet, xarita)
    if (TRAFFIC_Q.test(q) && NX.ai.available() && (NX.ai.detectStreets(q, S.model).length || (S.chatStreet != null && /nima qils|yechim|hal qil|bir tomon|yops|svetofor|polosa|shu koʻcha|bu koʻcha|shu yer|bu yer/i.test(q)))) {
      try {
        const dp = await deepAnalyze(q, null, t => { S.chat.busy = t + '…'; renderChat(); });
        if (dp) {
          S.chatStreet = dp.sid;
          S.chat.busy = 'AI xulosa yozmoqda (chuqur tahlil)…'; renderChat();
          const r = await NX.ai.deepAsk(q, Object.assign({ shahar_tizimlari: NX.ai.systemsFacts() }, dp.facts), prev.map(m => ({ role: m.role, text: m.content })));
          S.sim.last = { street: dp.sid, type: dp.best.type, label: dp.best.label, demand: S.demand, result: dp.best.r, verdict: dp.best.v, iters: 10 };
          S.chat.msgs.push({ role: 'ai', text: r.text, src: 'ai', sim: simSummary(S.sim.last) });
          S.chat.busy = null; renderChat();
          return;
        }
      } catch (e) { console.warn(e); }
    }
    try {
      const res = await NX.ai.ask(q, S.model, {
        defaultStreet: S.chatStreet != null ? S.model.streets[S.chatStreet] : null,
        segment: S.segment,
        simulate: async (street, scen) => {
          S.chat.busy = `“${street.name}” boʻyicha hisoblanmoqda — natija xaritada chiziladi…`; renderChat();
          S.chatStreet = street.id;
          return runWhatIf(street.id, TYPE[scen.type](scen.dir));
        },
        onModel: () => { S.chat.busy = 'AI javob yozmoqda…'; renderChat(); },
        state: S, history: prev,
      });
      if (res.street && S.chatStreet == null) S.chatStreet = res.street.id;
      S.chat.msgs.push({ role: 'ai', text: res.text, src: res.src, error: res.error, sim: res.sim ? simSummary(res.sim) : null });
    } catch (e) {
      S.chat.msgs.push({ role: 'ai', text: 'Xato: ' + e.message, src: 'hisob' });
    }
    S.chat.busy = null;
    renderChat();
  }

  // ---------- AI ----------
  async function askAI(q) {
    q = (q || '').trim();
    if (!q || S.ai.busy) return;
    S.ai.q = q; S.ai.busy = 'Koʻcha va stsenariy aniqlanmoqda…'; S.ai.answer = null;
    renderAI();
    const TYPE = { oneway: d => 'oneway-' + (d || 'A'), close: () => 'close', buslane: () => 'buslane', signal: () => 'signal', demand: () => 'demand' };
    try {
      const res = await NX.ai.ask(q, S.model, {
        defaultStreet: ctxStreet(),
        simulate: async (street, scen) => {
          S.ai.busy = `“${street.name}” uchun simulyatsiya hisoblanmoqda…`; renderAI();
          NX.view.selectStreet(street.id);
          return runWhatIf(street.id, TYPE[scen.type](scen.dir));
        },
        onModel: () => { S.ai.busy = 'AI javob yozmoqda…'; renderAI(); },
        state: S, history: S.ai.history || [],
      });
      S.ai.answer = Object.assign({ q }, res);
      if (res.src === 'ai') S.ai.history = (S.ai.history || []).concat([{ role: 'user', content: q }, { role: 'assistant', content: res.text }]).slice(-2);
    } catch (e) {
      S.ai.answer = { text: '**Xato**\n' + e.message, src: 'hisob' };
    }
    S.ai.busy = null;
    renderAI();
  }

  // ---------- Eksport / import ----------
  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  function reportJSON() {
    const M = S.model;
    const last = S.sim.last;
    return {
      title: 'City Jam — Samarqand: hisobot', generated: new Date().toISOString(),
      area: { bbox: NX.config.bbox, center: NX.config.center },
      sources: { openstreetmap: { time: new Date(M.ts).toISOString(), server: M.mirror, licence: 'ODbL © OpenStreetMap hissadorlari' }, tomtom: { measuredStreets: M.kpi.measured } },
      note: 'manba: osm — OpenStreetMap; tomtom — TomTom oʻlchovi; hisob — qoida asosidagi hisob; bashorat — model bashorati (oʻlchov emas).',
      transportIndex: { value: M.index.value, source: 'hisob', parts: M.index.parts.map(p => ({ name: p.k, value: Math.round(p.v * 10) / 10, weight: Math.round(p.w * 100) / 100 })) },
      kpi: Object.assign({ source: 'osm/hisob' }, M.kpi),
      problems: M.problems.map(p => ({ type: p.type, title: p.title, detail: p.detail, lat: p.lat, lon: p.lon, severity: p.sev, source: p.type === 'congestion' ? 'tomtom' : 'osm+hisob' })),
      recommendations: V.recommendations(M).map(r => ({ title: r.t, reason: r.why, quantity: r.qty, unit: r.unit, unitCostUZS: r.cost, totalCostUZS: r.total, costNote: 'taxminiy', items: r.items })),
      streets: M.namedStreets.map(s => ({
        name: s.name, type: s.hw, lengthM: Math.round(s.length), oneway: s.oneway, lanes: s.lanes, maxspeed: s.maxspeed,
        busLines: s.busRefs, stops: s.stops.length, signals: s.signals.length, crossings: s.crossings.length, schoolsNearby: s.schools.length,
        riskScore: { value: s.risk.value, source: 'hisob' },
        tomtom: s.tomtom ? { congestionPct: Math.round(s.tomtom.congestion * 10) / 10, currentSpeed: s.tomtom.currentSpeed, freeFlowSpeed: s.tomtom.freeFlowSpeed, time: new Date(s.tomtom.ts).toISOString(), source: 'tomtom' } : null,
      })),
      routes: M.routes.map(r => ({ ref: r.ref, name: r.name, from: r.from, to: r.to, mode: r.mode, stopsInArea: r.stops.length, lengthInAreaM: Math.round(r.length), avgSpacingM: r.spacing.avg && Math.round(r.spacing.avg), maxSpacingM: r.spacing.max && Math.round(r.spacing.max), streets: r.streets.map(i => M.streets[i].name).filter(Boolean) })),
      lastSimulation: last ? { scenario: last.label, demandTripsPerHour: last.demand, source: 'bashorat', verdict: last.verdict.label, reasons: last.verdict.reasons, totalTravelTimeChangePct: Math.round(last.result.ttChangePct * 10) / 10, busLinesToReroute: last.verdict.busLines, affectedStreets: last.result.affected.map(x => ({ name: x.name, volumeBefore: Math.round(x.baseVol), volumeAfter: Math.round(x.scenVol), vcBefore: +x.baseVC.toFixed(2), vcAfter: +x.scenVC.toFixed(2) })), disclaimer: V.DISCLAIMER } : null,
      calibration: S.calib ? { demand: S.calib.best.demand, rmsePct: S.calib.best.rmse } : null,
      tomtomHistory: NX.forecast.stats(),
    };
  }

  // ---------- Sozlamalar ----------
  const dlg = $('#settingsDlg');
  function openSettings(focus) {
    $('#keyTomtom').value = NX.store.get('key:tomtom', '');
    $('#keyOpenai').value = NX.store.get('key:openai', '');
    $('#fixPin').value = NX.store.get('fixes:pin', '');
    const fl = NX.fixes.list();
    $('#fixInfo').textContent = `Xaritaga ${fl.length} ta tuzatish kiritilgan (${fl.filter(x => x.shared).length} tasi hamma uchun).` + (NX.fixes.status() === false ? ' Server ombori hali ulanmagan.' : '');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('#fixPin').focus();
  }
  function closeSettings() { if (dlg.open) dlg.close ? dlg.close() : dlg.removeAttribute('open'); }

  // ---------- Hodisalar ----------
  function bind() {
    document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#btnRefresh').addEventListener('click', () => loadData(true));
    $('#btnDraw').addEventListener('click', drawArea);
    $('#btnSettings').addEventListener('click', () => openSettings());
    $('#btnTheme').addEventListener('click', () => {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t; NX.store.set('theme', t);
    });
    $('#settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      NX.store.set('key:tomtom', $('#keyTomtom').value.trim());
      NX.store.set('key:openai', $('#keyOpenai').value.trim());
      NX.store.set('fixes:pin', $('#fixPin').value.trim());
      if ($('#fixPin').value.trim()) NX.fixes.syncLocal().then(n => { if (n) { toast(`${n} ta tuzatish hamma uchun saqlandi.`, 'ok'); NX.fixes.loadShared().then(rebuildModel); } });
      closeSettings(); toast('Sozlamalar saqlandi (faqat shu brauzerda).', 'ok');
      if (S.model) { render(); refreshLiveNow(); }
    });
    $('#btnCloseSettings').addEventListener('click', closeSettings);
    $('#btnClearCache').addEventListener('click', () => { NX.osm.clearCache(); toast('OSM keshi tozalandi. “Yangilash” bilan qayta yuklang.', 'ok'); });
    $('#btnClearHistory').addEventListener('click', () => {
      if (!confirm('TomTom oʻlchovlari tarixi va oxirgi oʻlchovlar oʻchirilsinmi?')) return;
      NX.forecast.clear(); NX.tomtom.clear();
      if (S.model) { S.model.streets.forEach(s => (s.tomtom = null)); NX.analysis.refresh(S.model); NX.view.restyle(); NX.view.drawProblems(); render(); }
      toast('Tarix tozalandi.', 'ok');
    });
    dlg.querySelectorAll('[data-toggle-pass]').forEach(b => b.addEventListener('click', () => {
      const i = $(b.dataset.togglePass); i.type = i.type === 'password' ? 'text' : 'password';
    }));

    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || !S.model && b.dataset.act !== 'retry') return;
      const id = b.dataset.id !== undefined && b.dataset.id !== '' ? +b.dataset.id : null;
      const M = S.model;
      switch (b.dataset.act) {
        case 'retry': loadData(!!(S.model || S.load === 'error')); break;
        case 'home': clearStreet(); break;
        case 'street': if (id != null) { openStreet(id); } break;
        case 'problem-close': S.problemOpen = null; render(); break;
        case 'pimg': {
          const pid = b.dataset.pid, mode = b.dataset.mode, v = S.verify[pid] || {};
          verifyPart(pid, mode === 'top' ? 'top' : 'photo', async (p, r) => NX.ai.solutionImage(V.effP(S, p), r, { mode, views: v.views && v.views.list, sat: mode === 'top' && v.sat && v.sat.ok ? v.sat.data : null, plan: mode === 'top' ? await NX.plan.png(S.model, V.effP(S, p)) : null }));
          break;
        }
        case 'problem': {
          const p = M.problems.find(x => x.id === b.dataset.id);
          if (!p) break;
          if (S.tab === 'problems') { openProblem(p); break; }
          ensureLeaflet();
          focusProblem(p);
          if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
        case 'tab': setTab(b.dataset.tab); break;
        case 'chat-ask': chatSend(b.dataset.q); break;
        case 'chat-clear': S.chatStreet = null; dropSegmentUnless(null); NX.view.selectStreet(null); renderChat(); break;
        case 'seg-pick': if (id != null) pickSegment(id); break;
        case 'seg-clear': NX.view.cancelPick(); S.segPick = null; setSegment(null); refreshSeg(); break;
        case 'chat-reset': S.chat.msgs = []; renderChat(); break;
        case 'chat-street-open': S.chatStreet = id; setTab('ai'); NX.view.selectStreet(id, false); if (S.segment) NX.view.selectSegment(S.segment.lines); break;
        case 'chat-street':
          NX.view.selectStreet(id, true);
          if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        case 'verify': {
          const p = probById(b.dataset.pid);
          if (!p) break;
          const prev = S.verifyOpen;
          S.verifyOpen = prev === p.id && S.verify[p.id] && S.verify[p.id].res ? null : p.id;
          if (prev && prev !== p.id) renderRow(prev);
          renderRow(p.id);
          if (S.verifyOpen && !(S.verify[p.id] && S.verify[p.id].res)) verifyCheck(p);
          break;
        }
        case 'area-clear': clearArea(); break;
        case 'area-redraw': drawArea(); break;
        case 'area-ask': areaAsk(b.dataset.q); break;
        case 'area-opt': {
          const o = S.area && S.area.deep && S.area.deep.opts[+b.dataset.i];
          if (o) { ensureLeaflet(); NX.view.showDeltas(o.r, S.simInfo.pieces); NX.view.selectStreet(S.area.deep.sid, false); NX.view.drawArea(S.area.st.poly, null, false); S.area.deep.shown = +b.dataset.i; renderKeepScroll(); }
          break;
        }
        case 'verify-all': if (!(S.verifyBatch && S.verifyBatch.busy)) verifyAll(b.dataset.type); break;
        case 'review-ai': review({ ai: true }); break;
        case 'sys-show': sysShow(b.dataset.sys); break;
        case 'cam-load': camLoad(); break;
        case 'cam-test': {
          const W = S.webcams = S.webcams || {};
          W.testBusy = b.dataset.mode; W.testErr = null; renderKeepScroll();
          NX.webcams.load(60, b.dataset.mode).then(l => { W.test = l; W.testMode = b.dataset.mode; }, e => { W.testErr = e.message; }).then(() => { W.testBusy = null; renderKeepScroll(); });
          break;
        }
        case 'cam-fly': NX.view.flyTo(+b.dataset.lat, +b.dataset.lon, 16); if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
        case 'cam-ai': {
          const W = S.webcams || {}, cam = (W.list || []).concat(W.test || []).find(c => String(c.id) === b.dataset.id);
          if (!cam) break;
          W.ai = W.ai || {}; W.ai[cam.id] = { busy: true }; renderKeepScroll();
          NX.ai.webcamCheck(cam).then(t => { W.ai[cam.id] = { text: t }; }, e => { W.ai[cam.id] = { err: e.message }; }).then(renderKeepScroll);
          break;
        }
        case 'twin-mode': NX.map3d.setMode(b.dataset.mode); if (b.dataset.mode === 'flood' && twinState().dyn) twinShowFrame(twinState().dynFrame); if (b.dataset.mode === 'plan' && S.area && S.area.res && S.area.res.shadow) NX.map3d.flyTo(S.area.st.center[0], S.area.st.center[1], 16.5); renderKeepScroll(); break;
        case 'twin-base': NX.map3d.setBase(b.dataset.base); break;
        case 'twin-rain': twinFlood2d([{ t0: 0, t1: 3600, mmh: +b.dataset.mm }], `${b.dataset.mm} mm, 1 soatda`); break;
        case 'twin-forecast': {
          const R0 = twinState().rain;
          if (!R0 || !R0.hours || !R0.hours.length) { toast('Prognoz hali olinmadi.', 'warn'); break; }
          const t0 = R0.hours[0].ts;
          twinFlood2d(R0.hours.filter(h => h.mm > 0).map(h => ({ t0: (h.ts - t0) / 1000, t1: (h.ts - t0) / 1000 + 3600, mmh: h.mm })), 'Real prognoz (Open-Meteo, 24 soat)', t0);
          break;
        }
        case 'twin-play': twinPlay(); break;
        case 'dyn-run': runDynamic(null, 'Hozirgi holat'); break;
        case 'dyn-sim': if (S.sim.last) { const s0 = S.model.streets[S.sim.last.street]; runDynamic(scenarioFor(s0, S.sim.last.type).sc, S.sim.last.label); setTab('map'); clearStreet(); } break;
        case 'dyn-play': dynTPlay(); break;
        case 'dyn-clear': NX.view.clearDynamic(); S.dynT = null; render(); break;
        case 'twin-ask': twinAsk(b.dataset.q); break;
        case 'twin-fly': NX.map3d.flyTo(+b.dataset.lat, +b.dataset.lon, 18); break;
        case 'sys-remove': if (confirm(NX.SYSTEMS[b.dataset.sys].uz + ' xaritasini oʻchirasizmi?')) NX.systems.remove(b.dataset.sys).then(() => { drawSys(); render(); toast('Oʻchirildi.', 'ok'); }, e => toast(e.message, 'bad')); break;
        case 'review-undo': reviewUndo(b.dataset.fid); break;
        case 'review-share': reviewShare(); break;
        case 'verify-ai': verifyPart(b.dataset.pid, 'ai', async (p, r) => ({ text: await NX.ai.vision(p, S.model, r) })); break;
        case 'verify-web': verifyPart(b.dataset.pid, 'web', (p, r) => NX.ai.webSearch(p, S.model, r)); break;
        case 'verify-img': verifyPart(b.dataset.pid, 'img', (p, r) => NX.ai.solutionImage(p, r)); break;
        case 'fix':
          onFix({ action: b.dataset.fix, pid: b.dataset.pid });
          if (/^pick-/.test(b.dataset.fix) && window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        case 'incident': {
          const it = S.incidents && S.incidents.list && S.incidents.list.find(x => x.id === b.dataset.id);
          if (it) { NX.view.flyTo(it.lat, it.lon, 17); if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          break;
        }
        case 'settings': openSettings('tomtom'); break;
        case 'yandex': if (!S.yandexMain) toggleWidget(); if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
        case 'route': {
          // Avtobus yoʻnalishi shu xaritada ajratiladi (alohida boʻlimga oʻtmaydi)
          if (id == null) break;
          S.route = S.route === id ? null : id;
          NX.view.highlightRoute(S.route);
          const r = S.model.routes[id];
          if (S.route != null) toast(`${r.modeUz} ${r.label}${r.from && r.to ? `: ${r.from} → ${r.to}` : ''} · ${r.stops.length} bekat`, 'ok');
          break;
        }
        case 'sim': if (id != null && !S.sim.busy) runWhatIf(id, b.dataset.type); break;
        case 'measure': measure(id); break;
        case 'measure-main': measureMain(); break;
        case 'clear-sim': NX.view.clearDeltas(); break;
        case 'show-sim': if (S.sim.last) NX.view.showDeltas(S.sim.last.result, S.simInfo.pieces); break;
        case 'ask': askAI(b.dataset.q); break;
        case 'how': setTab('report'); setTimeout(() => { const h = $('#how'); if (h) h.scrollIntoView({ behavior: 'smooth' }); }, 50); break;
        case 'export': download(`cityjam-hisobot-${stamp()}.json`, reportJSON()); toast('Hisobot yuklab olindi.', 'ok'); break;
        case 'hist-export': download(`cityjam-tomtom-tarix-${stamp()}.json`, NX.forecast.exportJSON()); break;
        case 'calibrate': calibrate(); break;
      }
    });

    panel.addEventListener('submit', e => {
      const f = e.target;
      e.preventDefault();
      if (f.dataset.form === 'ai') askAI(f.q.value);
      else if (f.dataset.form === 'chat') chatSend(f.q.value);
      else if (f.dataset.form === 'area-q') areaAsk(f.aq.value);
      else if (f.dataset.form === 'twin-q') twinAsk(f.tq.value);
      else if (f.dataset.form === 'build' && S.area) {
        S.area.spec = { flats: Math.max(10, Math.min(5000, +f.flats.value || 500)), floors: Math.max(1, Math.min(40, +f.floors.value || 9)) };
        runBuild();
      }
    });
    panel.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && e.target.name === 'aq') { e.preventDefault(); areaAsk(e.target.value); return; }
      if (e.key === 'Enter' && !e.shiftKey && e.target.name === 'tq') { e.preventDefault(); twinAsk(e.target.value); return; }
      if (e.key === 'Enter' && !e.shiftKey && e.target.name === 'q') {
        e.preventDefault();
        if (e.target.closest('#chat')) chatSend(e.target.value); else askAI(e.target.value);
      }
    });

    panel.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.assume && S.area) { const v = parseFloat(t.value); if (isFinite(v) && v >= 0) S.area.A[t.dataset.assume] = v; return; }
      if (t.name === 'demand') {
        S.demand = clampDemand(t.value); NX.store.set('demand', S.demand);
        panel.querySelectorAll('[data-out=demand]').forEach(o => (o.textContent = F.int(S.demand)));
      } else if (t.dataset.input === 'route-q') {
        S.routeQ = t.value; $('#routeList').innerHTML = V.routeList(S);
      } else if (t.dataset.input === 'dyn-t') {
        showDynSlice(+t.value);
      } else if (t.dataset.input === 'twin-t') {
        twinShowFrame(+t.value);
      } else if (t.dataset.input === 'fc-hour') {
        S.fc.h = +t.value;
        panel.querySelector('[data-out=fc-hour]').textContent = F.hour(S.fc.h);
        NX.view.clearDeltas(false);
        NX.view.setColorMode({ mode: 'forecast', d: S.fc.d, h: S.fc.h });
      }
    });
    panel.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.sysfile && t.files && t.files[0]) { sysUpload(t.dataset.sysfile, t.files[0]); return; }
      if (t.dataset.input === 'fc-street') { S.fc.street = +t.value; NX.view.selectStreet(S.fc.street); render(); }
      else if (t.dataset.input === 'fc-day') { S.fc.d = +t.value; render(); }
      else if (t.dataset.input === 'fc-hour') { render(); }
      else if (t.dataset.input === 'hist-import' && t.files[0]) {
        const fr = new FileReader();
        fr.onload = () => {
          try {
            const r = NX.forecast.importJSON(JSON.parse(fr.result));
            toast(`${r.added} ta namuna qoʻshildi${r.bad ? `, ${r.bad} tasi notoʻgʻri` : ''}.`, 'ok');
            NX.view.restyle(); render();
          } catch (err) { toast('Import xatosi: ' + err.message, 'bad'); }
        };
        fr.readAsText(t.files[0]);
      }
    });

    window.addEventListener('offline', () => toast('Internet uzildi — keshdagi maʼlumot bilan ishlash davom etadi.', 'warn'));
    window.addEventListener('online', () => toast('Internet tiklandi.', 'ok'));
    window.addEventListener('resize', () => NX.map.invalidate());
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
      NX.view.cancelPick();
      if (S.segPick) { S.segPick = null; refreshSeg(); return; }
      if (S.street != null) clearStreet();
    });
  }

  function start() {
    document.documentElement.dataset.theme = NX.store.get('theme', 'light');
    NX.map.init('map', {
      onStreet: (id, ll) => mapClick(ll ? ll.lat : null, ll ? ll.lng : null, id),
      onMapClick: ll => { if (S.tab === 'problems') mapClick(ll.lat, ll.lng); },
      onFix: f => { if (S.model) onFix(f); },
      onRoute: i => { S.route = i; NX.view.highlightRoute(i); },
    });
    bind();
    $('#btnYandex').addEventListener('click', toggleWidget);
    NX.view.onFix = f => { if (S.model) onFix(f); };
    NX.view.onSelClick = () => { if (S.tab === 'map') clearStreet(); };
    loadData(false);
  }

  NX.app = { state: S, runWhatIf, reportJSON, loadData };
  start();
})();
