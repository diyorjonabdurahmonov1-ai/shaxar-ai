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
    verify: {}, verifyOpen: null, verifyBatch: null, area: null,
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
      NX.view.drawFixes(NX.fixes.list());
      setStatus(res.source, res.data.ts);
      render();
      if (res.warning) toast(res.warning, 'warn');
      else if (res.source === 'network') toast('Maʼlumot yangilandi: ' + M.namedStreets.length + ' ta koʻcha, ' + M.routes.length + ' ta yoʻnalish.', 'ok');
      NX.sim.init(M).then(info => { S.simInfo = info; }).catch(e => console.error(e));
      startLive();
      // Boshqa foydalanuvchilar saqlagan tuzatishlar (svetofor bor, muammo emas…) serverdan olinadi
      NX.fixes.loadShared().then(() => { if (NX.fixes.list().length) rebuildModel(); });
      // Asosiy xarita — Yandex (real tirbandlik + tahlil). Ishlamasa — zaxira xarita va probkalar tugmasi
      if (S.yandexOn == null) setYandex(true);
      else if (S.yandexMain) NX.view.syncYandex(M, NX.fixes.list());
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
    else if (S.tab === 'problems') html = V.problems(S);
    else if (S.tab === 'ai') html = V.aiChat(S);
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

  function setTab(t) {
    if (t !== 'map') ensureLeaflet();
    if (S.segPick) { NX.view.cancelPick(); S.segPick = null; }
    // Bashorat boʻlimida xarita bashorat boʻyicha boʻyaladi — eski simulyatsiya qatlami olib tashlanadi
    if ((t === 'forecast' || t === 'problems') && S.tab !== t) NX.view.clearDeltas(false);
    S.tab = t;
    if (t !== 'routes') { if (S.route != null) NX.view.highlightRoute(null); S.route = null; }
    render();
    panel.scrollTop = 0;
  }

  function focusPanel() {
    if (window.matchMedia('(max-width: 820px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else panel.scrollTop = 0;
  }

  // ---------- Belgilangan hudud (mahalla) ----------
  function drawArea() {
    if (!S.model) return;
    if (S.tab !== 'map') setTab('map');
    NX.view.cancelPick();
    if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    NX.draw.start(poly => {
      const st = NX.area.stats(S.model, poly);
      if (st.areaHa < 0.2) { toast('Hudud juda kichik — kattaroq chizing.', 'warn'); return; }
      const A0 = {};
      Object.keys(NX.area.ASSUME).forEach(k => { A0[k] = NX.area.ASSUME[k].v; });
      const prev = S.area;
      S.area = { st, spec: prev ? prev.spec : { flats: 500, floors: 9 }, A: prev ? prev.A : A0, res: null, busy: null, qa: [], qaBusy: null };
      S.street = null; NX.view.selectStreet(null); setSegment(null);
      NX.view.clearDeltas();
      NX.view.drawArea(poly, null, true);
      render(); focusPanel();
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
    A.qaBusy = 'AI javob yozmoqda…';
    renderKeepScroll();
    const r = await NX.ai.areaAsk(q, A, prev);
    A.qa.push({ role: 'ai', text: r.text, src: r.src, error: r.error });
    A.qaBusy = null;
    if (S.tab === 'map' && S.area === A) { renderKeepScroll(); const c = $('#areaChat'); if (c) c.scrollIntoView({ block: 'end' }); }
  }

  // ---------- Muammoni real surat bilan tekshirish ----------
  const probById = pid => S.model && S.model.problems.find(x => x.id === pid);
  function renderRow(pid) {
    if (S.tab !== 'problems') return;
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
    if (S.tab === 'problems') { const p = nearestProblem(lat, lon, 150); if (p) focusProblem(p); return; }
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
    NX.view.drawFixes(NX.fixes.list());
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
        NX.view.syncYandex(S.model, NX.fixes.list());
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
      const r = await NX.ai.areaAsk(q, S.area, S.chat.msgs.slice(-3, -1));
      S.chat.msgs.push({ role: 'ai', text: r.text, src: r.src, error: r.error });
      S.chat.busy = null; renderChat();
      return;
    }
    const prev = S.chat.msgs.slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    S.chat.msgs.push({ role: 'user', text: q });
    S.chat.busy = 'Oʻylayapman…';
    renderChat();
    const TYPE = { oneway: d => 'oneway-' + (d || 'A'), close: () => 'close', buslane: () => 'buslane', signal: () => 'signal', demand: () => 'demand' };
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
    (focus === 'tomtom' ? $('#keyTomtom') : $('#keyTomtom')).focus();
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
        case 'problem': {
          const p = M.problems.find(x => x.id === b.dataset.id);
          if (!p) break;
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
        case 'verify-all': if (!(S.verifyBatch && S.verifyBatch.busy)) verifyAll(b.dataset.type); break;
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
      else if (f.dataset.form === 'build' && S.area) {
        S.area.spec = { flats: Math.max(10, Math.min(5000, +f.flats.value || 500)), floors: Math.max(1, Math.min(40, +f.floors.value || 9)) };
        runBuild();
      }
    });
    panel.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && e.target.name === 'aq') { e.preventDefault(); areaAsk(e.target.value); return; }
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
      } else if (t.dataset.input === 'fc-hour') {
        S.fc.h = +t.value;
        panel.querySelector('[data-out=fc-hour]').textContent = F.hour(S.fc.h);
        NX.view.clearDeltas(false);
        NX.view.setColorMode({ mode: 'forecast', d: S.fc.d, h: S.fc.h });
      }
    });
    panel.addEventListener('change', e => {
      const t = e.target;
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
