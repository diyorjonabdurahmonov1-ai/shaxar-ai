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
    calib: null, calibBusy: null, load: null,
    live: { last: null, next: null, busy: null, cursor: 0, err: null },
  };
  const LIVE_EVERY = 10 * 60 * 1000, LIVE_BATCH = 4;
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
      const M = NX.analysis.build(res.data);
      NX.analysis.applyTomTom(M, NX.tomtom.latest());
      NX.analysis.refresh(M);
      S.model = M; S.load = 'ok';
      if (S.street != null && !M.streets[S.street]) S.street = null;
      S.route = null; S.sim.last = null;
      S.fc.street = (M.namedStreets.slice().sort((a, b) => b.risk.value - a.risk.value)[0] || M.streets[0]).id;
      NX.map.clearDeltas();
      NX.map.setModel(M);
      setStatus(res.source, res.data.ts);
      render();
      if (res.warning) toast(res.warning, 'warn');
      else if (res.source === 'network') toast('Maʼlumot yangilandi: ' + M.namedStreets.length + ' ta koʻcha, ' + M.routes.length + ' ta yoʻnalish.', 'ok');
      NX.sim.init(M).then(info => { S.simInfo = info; }).catch(e => console.error(e));
      startLive();
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
    NX.map.setColorMode(S.tab === 'forecast' ? { mode: 'forecast', d: S.fc.d, h: S.fc.h } : { mode: 'now' });
    const M = S.model;
    let html;
    NX.map.showProblems(S.tab === 'problems');
    if (S.tab === 'map') html = S.street != null ? V.street(S, M.streets[S.street]) : V.home(S);
    else if (S.tab === 'problems') html = V.problems(S);
    else if (S.tab === 'routes') html = V.routes(S);
    else if (S.tab === 'forecast') html = V.forecast(S);
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
    // Bashorat boʻlimida xarita bashorat boʻyicha boʻyaladi — eski simulyatsiya qatlami olib tashlanadi
    if (t === 'forecast' && S.tab !== 'forecast') NX.map.clearDeltas(false);
    S.tab = t;
    if (t !== 'routes') { if (S.route != null) NX.map.highlightRoute(null); S.route = null; }
    render();
    panel.scrollTop = 0;
  }

  function focusPanel() {
    if (window.matchMedia('(max-width: 820px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else panel.scrollTop = 0;
  }

  function openStreet(id) {
    S.tab = 'map'; S.street = id; S.measureErr = null;
    NX.map.selectStreet(id);
    render(); focusPanel();
  }

  // ---------- Simulyatsiya ----------
  function scenarioFor(s, type) {
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
    if (tt > 8) { up(2); why.push(`Umumiy yoʻl vaqti ${F.signed(tt, 1)}% ga oshadi (chegara: 8%).`); }
    else if (tt > 2) { up(1); why.push(`Umumiy yoʻl vaqti ${F.signed(tt, 1)}% ga oshadi.`); }
    else why.push(`Umumiy yoʻl vaqti oʻzgarishi ${F.signed(tt, 1)}% — ${tt < -0.5 ? 'ijobiy' : 'sezilarli emas'}.`);
    if (r.overloadedCount >= 3) { up(2); why.push(`${r.overloadedCount} ta koʻcha sigʻimidan oshib ketadi (V/C > 1).`); }
    else if (r.overloadedCount >= 1) { up(1); why.push(`${r.overloadedCount} ta koʻcha sigʻimidan oshib ketadi (V/C > 1).`); }
    if (r.relievedCount) why.push(`${r.relievedCount} ta koʻchada ortiqcha yuklama yoʻqoladi.`);
    const dUn = r.scen.unassigned - r.base.unassigned * (r.scen.demand / Math.max(1, r.base.demand));
    if (dUn > 0.01 * r.scen.demand) { up(2); why.push(`Tarmoq bogʻlanishi buziladi: ${F.int(dUn)} reys/soat manziliga yeta olmaydi.`); }
    const lines = linesToReroute(s, type, dirSign);
    if (lines.length >= 3) { up(1); why.push(`${lines.length} ta avtobus liniyasi yoʻnalishini oʻzgartirishi kerak.`); }
    else if (lines.length) why.push(`${lines.length} ta avtobus liniyasi yoʻnalishini oʻzgartirishi kerak.`);
    if (type === 'buslane') {
      if (s.busRefs.length) why.push(`${s.busRefs.length} ta liniya (${s.busRefs.join(', ')}) alohida polosadan foydalanadi — avtobuslar tezligi va qatnov barqarorligi oshadi.`);
      else { up(1); why.push('Bu koʻchada avtobus liniyasi yoʻq — alohida polosa foyda bermaydi.'); }
      if ((r.notes || []).includes('single-lane')) { up(1); why.push('Koʻchada har tomonga 1 polosa: polosa ajratilsa avtomobillar sigʻimi ikki baravar kamayadi.'); }
    }
    if (r.target && sc.type !== 'close' && r.target.scenVC > 1.1) { up(1); why.push(`Koʻchaning oʻzida V/C ${F.num(r.target.scenVC, 2)} ga yetadi.`); }
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
      NX.map.showDeltas(r, S.simInfo.pieces);
      NX.map.selectStreet(streetId, false);
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
      NX.analysis.refresh(M); NX.map.restyle(); NX.map.drawProblems();
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
    NX.analysis.refresh(M); NX.map.restyle(); NX.map.drawProblems();
    toast(`${ok} ta koʻcha oʻlchandi.`, ok ? 'ok' : 'warn');
    render();
  }

  // ---------- Jonli kuzatuv: har 10 daqiqada qayta tahlil ----------
  let liveTimer = null, lastHour = new Date().getHours();
  function startLive() {
    S.live.next = Date.now();
    if (!liveTimer) liveTimer = setInterval(liveTick, 30000);
    liveTick();
  }
  function liveTick() {
    if (!S.model || document.hidden) return;
    const h = new Date().getHours();
    if (h !== lastHour) { lastHour = h; NX.map.restyle(); NX.map.updateLegend(); }
    if (Date.now() >= S.live.next && !S.live.busy) liveCycle();
    else renderLive();
  }
  const renderLive = () => { if (S.tab === 'problems') swap('.live', V.problems(S)); };
  async function liveCycle() {
    const M = S.model;
    S.live.err = null;
    if (NX.tomtom.key()) {
      const list = V.mainStreets(M);
      for (let k = 0; k < Math.min(LIVE_BATCH, list.length); k++) {
        const s = list[(S.live.cursor + k) % list.length];
        S.live.busy = `TomTom oʻlchamoqda: ${s.name} (${k + 1}/${Math.min(LIVE_BATCH, list.length)})`;
        renderLive();
        try { s.tomtom = await NX.tomtom.measureStreet(s, M); } catch (e) {
          S.live.err = e.message;
          if (e.status === 401 || e.status === 403 || e.status === 429 || e.noKey) break;
        }
        if (S.model !== M) return;
      }
      S.live.cursor = (S.live.cursor + LIVE_BATCH) % Math.max(1, list.length);
    }
    NX.analysis.refresh(M); NX.map.restyle(); NX.map.drawProblems(); NX.map.updateLegend();
    S.live.busy = null; S.live.last = Date.now(); S.live.next = Date.now() + LIVE_EVERY;
    if (S.tab === 'problems') render(); else renderLive();
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
          NX.map.selectStreet(street.id);
          return runWhatIf(street.id, TYPE[scen.type](scen.dir));
        },
        onModel: m => { S.ai.busy = `AI javob yozmoqda (${m})…`; renderAI(); },
      });
      S.ai.answer = res;
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
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    (focus === 'tomtom' ? $('#keyTomtom') : $('#keyTomtom')).focus();
  }
  function closeSettings() { if (dlg.open) dlg.close ? dlg.close() : dlg.removeAttribute('open'); }

  // ---------- Hodisalar ----------
  function bind() {
    document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#btnRefresh').addEventListener('click', () => loadData(true));
    $('#btnSettings').addEventListener('click', () => openSettings());
    $('#btnTheme').addEventListener('click', () => {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t; NX.store.set('theme', t);
    });
    $('#settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      NX.store.set('key:tomtom', $('#keyTomtom').value.trim());
      NX.store.set('key:openai', $('#keyOpenai').value.trim());
      closeSettings(); toast('Sozlamalar saqlandi (faqat shu brauzerda).', 'ok');
      if (S.model) render();
    });
    $('#btnCloseSettings').addEventListener('click', closeSettings);
    $('#btnClearCache').addEventListener('click', () => { NX.osm.clearCache(); toast('OSM keshi tozalandi. “Yangilash” bilan qayta yuklang.', 'ok'); });
    $('#btnClearHistory').addEventListener('click', () => {
      if (!confirm('TomTom oʻlchovlari tarixi va oxirgi oʻlchovlar oʻchirilsinmi?')) return;
      NX.forecast.clear(); NX.tomtom.clear();
      if (S.model) { S.model.streets.forEach(s => (s.tomtom = null)); NX.analysis.refresh(S.model); NX.map.restyle(); NX.map.drawProblems(); render(); }
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
        case 'home': S.street = null; NX.map.selectStreet(null); render(); break;
        case 'street': if (id != null) { openStreet(id); } break;
        case 'problem': {
          const p = M.problems.find(x => x.id === b.dataset.id);
          if (!p) break;
          NX.map.focusProblem(p);
          if (window.matchMedia('(max-width: 820px)').matches) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
        case 'tab': setTab(b.dataset.tab); break;
        case 'settings': openSettings('tomtom'); break;
        case 'route':
          if (id == null) break;
          S.tab = 'routes'; S.route = S.route === id ? null : id;
          NX.map.highlightRoute(S.route); render();
          break;
        case 'sim': if (id != null && !S.sim.busy) runWhatIf(id, b.dataset.type); break;
        case 'measure': measure(id); break;
        case 'measure-main': measureMain(); break;
        case 'clear-sim': NX.map.clearDeltas(); break;
        case 'show-sim': if (S.sim.last) NX.map.showDeltas(S.sim.last.result, S.simInfo.pieces); break;
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
    });
    panel.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && e.target.name === 'q') { e.preventDefault(); askAI(e.target.value); }
    });

    panel.addEventListener('input', e => {
      const t = e.target;
      if (t.name === 'demand') {
        S.demand = clampDemand(t.value); NX.store.set('demand', S.demand);
        panel.querySelectorAll('[data-out=demand]').forEach(o => (o.textContent = F.int(S.demand)));
      } else if (t.dataset.input === 'route-q') {
        S.routeQ = t.value; $('#routeList').innerHTML = V.routeList(S);
      } else if (t.dataset.input === 'fc-hour') {
        S.fc.h = +t.value;
        panel.querySelector('[data-out=fc-hour]').textContent = F.hour(S.fc.h);
        NX.map.clearDeltas(false);
        NX.map.setColorMode({ mode: 'forecast', d: S.fc.d, h: S.fc.h });
      }
    });
    panel.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.input === 'fc-street') { S.fc.street = +t.value; NX.map.selectStreet(S.fc.street); render(); }
      else if (t.dataset.input === 'fc-day') { S.fc.d = +t.value; render(); }
      else if (t.dataset.input === 'fc-hour') { render(); }
      else if (t.dataset.input === 'hist-import' && t.files[0]) {
        const fr = new FileReader();
        fr.onload = () => {
          try {
            const r = NX.forecast.importJSON(JSON.parse(fr.result));
            toast(`${r.added} ta namuna qoʻshildi${r.bad ? `, ${r.bad} tasi notoʻgʻri` : ''}.`, 'ok');
            NX.map.restyle(); render();
          } catch (err) { toast('Import xatosi: ' + err.message, 'bad'); }
        };
        fr.readAsText(t.files[0]);
      }
    });

    window.addEventListener('offline', () => toast('Internet uzildi — keshdagi maʼlumot bilan ishlash davom etadi.', 'warn'));
    window.addEventListener('online', () => toast('Internet tiklandi.', 'ok'));
    window.addEventListener('resize', () => NX.map.invalidate());
  }

  function start() {
    document.documentElement.dataset.theme = NX.store.get('theme', 'light');
    NX.map.init('map', {
      onStreet: id => {
        if (!S.model) return;
        if (S.tab === 'forecast') { S.fc.street = id; NX.map.selectStreet(id, false); render(); focusPanel(); return; }
        openStreet(id);
      },
      onRoute: i => { S.tab = 'routes'; S.route = i; NX.map.highlightRoute(i); render(); focusPanel(); },
    });
    bind();
    loadData(false);
  }

  NX.app = { state: S, runWhatIf, reportJSON, loadData };
  start();
})();
