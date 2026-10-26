/* City Jam — panel koʻrinishlari (HTML shablonlar) */
(function () {
  'use strict';
  const NX = window.NX;
  const E = NX.esc, F = NX.fmt, B = NX.badge;

  const COST = { stop: 35e6, signal: 600e6, crossing: 20e6, schoolCrossing: 80e6, signalOpt: 30e6 };
  const DISCLAIMER = 'Bu taxminiy hisob. Aniq natija uchun chorrahalarda mashinalarni sanash kerak.';
  const VERDICT_CLS = ['ok', 'warn', 'bad'];

  const refBadges = (M, refs, routesSet) => {
    if (!refs.length) return '<span class="muted">yoʻq</span>';
    const byLabel = new Map();
    [...(routesSet || [])].forEach(i => { const r = M.routes[i]; if (!byLabel.has(r.label)) byLabel.set(r.label, r); });
    return refs.map(ref => { const r = byLabel.get(ref); return `<button class="ref" data-act="route" data-id="${r ? r.i : ''}" style="--c:${r ? r.color : '#64748b'}">${E(ref)}</button>`; }).join('');
  };
  const streetName = s => (s.name ? E(s.name) : '<span class="muted">Nomsiz yoʻl</span>');
  const congCls = v => (v == null ? '' : v < 15 ? 'g' : v < 30 ? 'a' : 'r');

  function loading(text) {
    return `<div class="state"><div class="spinner" aria-hidden="true"></div><p>${E(text || 'Maʼlumot yuklanmoqda…')}</p><p class="muted small">Birinchi yuklash 10–60 soniya davom etishi mumkin. Keyingi safar maʼlumot keshdan darhol ochiladi.</p></div>`;
  }

  function error(err) {
    const det = err && err.details && err.details.length ? `<details class="small"><summary>Tafsilotlar</summary><ul>${err.details.map(d => `<li>${E(d)}</li>`).join('')}</ul></details>` : '';
    return `<div class="state error"><div class="state-ico" aria-hidden="true">!</div><h3>Maʼlumot yuklanmadi</h3><p>${E((err && err.message) || 'Nomaʼlum xato')}</p>
      <p class="muted small">Internet aloqasini tekshiring. Overpass serverlari band boʻlishi mumkin — bir necha soniyadan keyin qayta urinib koʻring.</p>${det}
      <button class="btn primary" data-act="retry">Qayta urinish</button></div>`;
  }

  // ---------- Oddiy til yordamchilari ----------
  const trafficWord = v => (v < 15 ? 'erkin' : v < 30 ? 'oʻrtacha' : 'tirband');
  const riskWord = v => (v < 35 ? 'past' : v < 60 ? 'oʻrtacha' : 'yuqori');
  const plural = (n, w) => `${F.int(n)} ta ${w}`;

  // ---------- Umumiy koʻrinish (Xarita) ----------
  function home(S) {
    const M = S.model, k = M.kpi, ix = M.index;
    const groups = Object.keys(NX.PROBLEM).map(t => ({ t, items: M.problems.filter(p => p.type === t) })).filter(g => g.items.length)
      .sort((a, b) => NX.PROBLEM[b.t].weight - NX.PROBLEM[a.t].weight);
    const ixWord = ix.value == null ? '' : ix.value >= 70 ? 'yaxshi' : ix.value >= 45 ? 'oʻrtacha' : 'past';
    return `
    ${nowCard(S)}
    <section class="card hint-card">
      <p class="small"><b>Koʻchani bosing</b> yoki xaritadagi qidiruvga nomini yozing — uning hozirgi holatini koʻrasiz va “nima boʻladi?” deb sinab koʻrasiz.</p>
    </section>
    <section class="card index-card">
      <div class="ring" style="--v:${ix.value || 0}"><b>${ix.value != null ? ix.value : '—'}</b><small>/100</small></div>
      <div><h2>Transport holati: ${ixWord} ${B('hisob')}</h2>
      <p class="small">Bekatlar yetarliligi, chorrahalar, maktablar xavfsizligi asosida hisoblangan umumiy baho.</p>
      <details class="more"><summary>Baho nimadan tuzilgan?</summary>${NX.chart.bars(ix.parts.map(p => ({ k: p.k, v: p.v, t: F.num(p.v, 0) })))}</details></div>
    </section>
    <section class="kpis">
      ${kpi('Avtobus liniyalari', F.int(k.lines), '', 'osm')}
      ${kpi('Bekat 400 m ichida', F.pct(k.coverage), 'koʻchalar ulushi', 'hisob')}
      ${kpi('Svetoforsiz chorrahalar', F.int(k.unsignalised), `${k.majorJunctions} tadan`, 'hisob')}
      ${kpi('Bekatlar orasi', F.km(k.avgSpacing), 'oʻrtacha', 'hisob')}
    </section>
    <section class="card prob-link">
      <div><b>${M.problems.length ? `${groups.length} xil muammo topildi` : 'Muammo topilmadi'}</b>
      <p class="small muted">${groups.slice(0, 3).map(g => NX.PROBLEM[g.t].icon + ' ' + E(NX.PROBLEM[g.t].short)).join(' · ')}</p></div>
      <button class="btn primary" data-act="tab" data-tab="problems">Koʻrish va yechimlar</button>
    </section>
    ${aiBox(S, null)}
    <p class="center"><button class="btn" data-act="how">Qanday ishlaydi?</button></p>`;
  }

  const kpi = (t, v, sub, src) => `<div class="kpi"><span class="kpi-t">${t}</span><b class="kpi-v">${v}</b>${sub ? `<span class="kpi-s">${E(sub)}</span>` : ''}${B(src)}</div>`;

  function exampleQuestions(M, s) {
    if (s && s.name) return [
      `${s.name}ni bir tomonlama qilsak nima boʻladi?`,
      `${s.name} yopilsa qaysi koʻchalar tirbandlashadi?`,
      `${s.name}da avtobus yoʻlagi ajratsak-chi?`,
    ];
    const named = M.namedStreets.filter(x => x.rank >= 4);
    const byRisk = named.slice().sort((a, b) => b.risk.value - a.risk.value);
    const out = [];
    const dag = M.namedStreets.find(x => /dagbit|дагбит/i.test(x.name + ' ' + x.alt.join(' ')));
    if (dag) out.push(`${dag.name}ni bir tomonlama qilsak nima boʻladi?`);
    if (byRisk[0] && byRisk[0] !== dag) out.push(`${byRisk[0].name}ni bir tomonlama qilsak nima boʻladi?`);
    if (byRisk[1]) out.push(`${byRisk[1].name} yopilsa nima boʻladi?`);
    return out.slice(0, 3);
  }

  // AI / erkin savol qutisi. s berilsa — shu koʻcha kontekstida
  function aiBox(S, s) {
    const a = S.ai;
    const hasKey = NX.ai.available();
    let out = '';
    if (a.busy) out = `<div class="ai-out"><div class="spinner sm"></div> ${E(a.busy)}</div>`;
    else if (a.answer) {
      const r = a.answer;
      const head = r.src === 'ai'
        ? `<div class="ai-src ok">✅ <b>AI javobi</b><small>saytdagi real maʼlumotlar asosida</small></div>`
        : `<div class="ai-src warn">⚠️ <b>AI ishlamadi</b><small>${E(r.error || '')} Quyida — saytning oʻz maʼlumotlari.</small></div>`;
      out = `<div class="ai-out">
        ${r.q ? `<p class="ai-q">“${E(r.q)}”</p>` : ''}
        ${head}
        <div class="ai-text">${NX.ai.render(r.text)}</div>
        ${r.sim ? `<p class="muted small">Natija xaritada ham koʻrsatildi.</p>` : ''}</div>`;
    }
    const examples = exampleQuestions(S.model, s);
    return `<section class="card" id="aiBox">
      <h3>${s ? 'Yoki oʻz soʻzingiz bilan soʻrang' : 'Savol bering'} ${B('ai')}</h3>
      <p class="muted small">${s ? `Masalan: “bir tomonlama qilsak?”, “yopsak?”, “svetofor qoʻysak?”. Koʻcha nomini yozish shart emas.` : 'Koʻcha nomi va nima qilmoqchi ekaningizni yozing.'}${hasKey ? '' : ' (OpenAI kaliti yoʻq — javob hisoblangan raqamlardan tuziladi.)'}</p>
      <form data-form="ai" class="ai-form">
        <textarea name="q" rows="2" placeholder="${s ? 'Masalan: bir tomonlama qilsak nima boʻladi?' : 'Masalan: Registon koʻchasini yopsak nima boʻladi?'}" aria-label="Savol">${E(a.q || '')}</textarea>
        <button class="btn primary" ${a.busy ? 'disabled' : ''}>Soʻrash</button>
      </form>
      <div class="chips">${examples.map(q => `<button class="chip" data-act="ask" data-q="${E(q)}">${E(q)}</button>`).join('')}</div>
      ${out}
    </section>`;
  }

  // ---------- Koʻcha paneli ----------
  function streetSummary(S, s) {
    const tt = s.tomtom;
    const dir = s.oneway === 'yes' ? 'bir tomonlama' : s.oneway === 'mixed' ? 'qisman bir tomonlama' : 'ikki tomonlama';
    const bits = [dir, F.km(s.length), s.busRefs.length ? plural(s.busRefs.length, 'avtobus liniyasi') : 'avtobus yoʻq', plural(s.stops.length, 'bekat')];
    const hasKey = !!NX.tomtom.key();
    const status = tt
      ? `<div class="status-line ${congCls(tt.congestion)}"><b>Hozir: ${trafficWord(tt.congestion)}</b> ${B('tomtom')}
          <span>${E(speedLine(tt))}${tt.freeFlowSpeed ? ` (odatda ${F.num(tt.freeFlowSpeed, 0)} km/soat)` : ''}</span>
          ${tt.delay >= 30 ? `<span>Kechikish: <b>+${Math.round(tt.delay / 60) || 1} daqiqa</b></span>` : ''}<small>Oʻlchandi: ${ago(tt.ts)}</small></div>`
      : `<div class="status-line"><b>Hozirgi holat nomaʼlum</b><small>${hasKey ? 'Pastdagi tugma bilan oʻlchang.' : 'Real maʼlumot uchun TomTom kaliti kerak.'}</small></div>`;
    return `<section class="card">
      <h2>${streetName(s)}</h2>
      <p class="muted">${E(NX.HW[s.hw].uz)} · ${bits.join(' · ')} ${B('osm')}</p>
      ${status}
      <div class="row-btns">${hasKey ? `<button class="btn sm" data-act="measure" data-id="${s.id}" ${S.measuring ? 'disabled' : ''}>${S.measuring === s.id ? 'Oʻlchanmoqda…' : tt ? 'Yangilash' : 'Hozir oʻlchash'}</button>` : '<button class="btn sm" data-act="settings">TomTom kalitini kiritish</button>'}</div>
      ${S.measureErr ? `<p class="alert">${E(S.measureErr)}</p>` : ''}
    </section>`;
  }

  function streetDetails(S, s) {
    const M = S.model, tt = s.tomtom, km = s.length / 1000, rp = s.risk.parts;
    const stopNames = [...new Set(s.stops.map(x => x.name).filter(Boolean))];
    return `<details class="card more-card"><summary>Batafsil maʼlumot ${B('osm')}</summary>
      <dl class="facts">
        <dt>Polosalar</dt><dd>${s.lanes ? s.lanes : 'xaritada belgilanmagan'}</dd>
        <dt>Tezlik chegarasi</dt><dd>${s.maxspeed ? s.maxspeed + ' km/soat' : 'belgilanmagan'}</dd>
        <dt>Avtobus liniyalari</dt><dd class="refs">${refBadges(M, s.busRefs, s.routes)}</dd>
        <dt>Bekatlar</dt><dd>${s.stops.length}${stopNames.length ? ` — ${E(stopNames.slice(0, 6).join(', '))}${stopNames.length > 6 ? '…' : ''}` : ''}</dd>
        <dt>Svetoforlar</dt><dd>${s.signals.length} (${F.num(s.signals.length / Math.max(km, 0.01), 1)}/km)</dd>
        <dt>Piyoda oʻtishlar</dt><dd>${s.crossings.length}</dd>
        <dt>Yaqin maktab/bogʻcha</dt><dd>${s.schools.length ? s.schools.map(o => E(o.name || (o.kind === 'kindergarten' ? 'Bogʻcha' : 'Maktab')) + (o.safe ? '' : ' <span class="tag r">xavfsiz oʻtish yoʻq</span>')).join('<br>') : '0'}</dd>
        <dt>Tirbandlik xavfi</dt><dd>${riskWord(s.risk.value)} (${s.risk.value}/100) ${B('hisob')}<br><small class="muted">Koʻcha turi, avtobuslar, svetofor va bekatlar soniga qarab baholangan. Bu oʻlchov emas.</small></dd>
      </dl></details>`;
  }

  function forecastCard(s, title) {
    const fc = NX.forecast.next24(s);
    const peak = fc.reduce((a, b) => (b.value > a.value ? b : a)), calm = fc.reduce((a, b) => (b.value < a.value ? b : a));
    const low = fc.some(p => p.low);
    return `<section class="card">
      <h3>${title || 'Odatda qachon tirband?'} ${B('bashorat')}</h3>
      <p>Eng tirband — <b>${peak.label}</b> atrofida, eng boʻsh — <b>${calm.label}</b>.</p>
      ${NX.chart.forecastChart(fc, { now: 0, title: 'Keyingi 24 soat' })}
      ${low ? '<p class="lowconf">Bu taxmin: real oʻlchovlar hali kam.</p><p class="muted small">Koʻcha har gal oʻlchanganda natija saqlanadi va taxmin real maʼlumotga yaqinlashadi.</p>' : '<p class="muted small ok-text">Shu koʻchaning real TomTom oʻlchovlari asosida.</p>'}
    </section>`;
  }

  function street(S, s) {
    return `
    <button class="back" data-act="home">← Orqaga</button>
    ${streetSummary(S, s)}
    ${actions(S, s)}
    ${aiBox(S, s)}
    ${forecastCard(s)}
    ${streetDetails(S, s)}`;
  }

  function directionLabels(s) {
    const [ux, uy] = s.axis;
    return { A: NX.geo.compass(ux, uy), B: NX.geo.compass(-ux, -uy) };
  }

  // “Bu koʻchaga nima qilmoqchisiz?” — bitta bosish bilan simulyatsiya
  function actions(S, s) {
    const d = directionLabels(s), busy = S.sim.busy;
    const cur = S.sim.last && S.sim.last.street === s.id ? S.sim.last.type : null;
    const btn = (type, ico, t, sub) => `<button class="act ${cur === type ? 'on' : ''}" data-act="sim" data-id="${s.id}" data-type="${type}" ${busy ? 'disabled' : ''}>
      <span class="act-ico" aria-hidden="true">${ico}</span><span><b>${t}</b><small>${sub}</small></span></button>`;
    const ow = s.oneway === 'yes';
    const res = S.sim.last && S.sim.last.street === s.id ? simResult(S, S.sim.last) : '';
    return `<section class="card" id="whatif">
      <h3>Bu koʻchaga nima qilmoqchisiz? ${B('bashorat')}</h3>
      <p class="muted small">Variantni bosing — dastur boshqa koʻchalarga taʼsirini hisoblaydi.</p>
      <div class="act-grid">
        ${btn('oneway-A', '→', ow ? `Faqat ${d.A}ga yurish` : 'Bir tomonlama qilish', `faqat ${d.A} tomonga`)}
        ${btn('oneway-B', '←', ow ? `Faqat ${d.B}ga yurish` : 'Bir tomonlama (teskari)', `faqat ${d.B} tomonga`)}
        ${btn('close', '⛔', 'Mashinalarga yopish', 'piyodalar koʻchasi')}
        ${btn('buslane', '🚌', 'Avtobus yoʻlagi', '1 polosa faqat avtobusga')}
        ${btn('signal', '🚦', 'Svetofor qoʻyish', 'yoki sozlash')}
        ${btn('demand', '👥', 'Turistlar koʻpaysa', 'talab +20%')}
      </div>
      <details class="more"><summary>Qoʻshimcha sozlama: transport oqimi</summary>${demandSlider(S)}</details>
      <div id="simOut">${busy ? progress(S.sim.progress) : res}</div>
    </section>`;
  }

  function demandSlider(S) {
    const c = NX.config.demand;
    return `<label class="slider"><span>Hududdagi harakat: <b data-out="demand">${F.int(S.demand)}</b> safar/soat ${B('hisob')}</span>
      <input type="range" name="demand" min="${c.min}" max="${Math.max(c.max, S.demand)}" step="${c.step}" value="${S.demand}" aria-label="Talab, safar/soat">
      <small class="muted">${S.calib ? `TomTom boʻyicha moslangan: ${F.int(S.calib.best.demand)} (xato ±${F.num(S.calib.best.rmse, 1)} p.p.)` : 'Koʻproq — tigʻiz soat, kamroq — tinch vaqt. Keyin variantni qayta bosing.'}</small></label>`;
  }

  const progress = p => `<div class="progress"><div class="spinner sm"></div><span>${E((p && p.label) || 'Hisoblanmoqda')}… ${p ? Math.round(p.p * 100) : 0}%</span><div class="pbar"><i style="width:${p ? Math.round(p.p * 100) : 0}%"></i></div></div>`;

  function simResult(S, last) {
    const r = last.result, v = last.verdict, t = r.target;
    const tt = r.ttChangePct;
    const ttText = Math.abs(tt) < 1 ? 'Umumiy yoʻl vaqti <b>deyarli oʻzgarmaydi</b>' : tt > 0 ? `Umumiy yoʻl vaqti <b>${F.num(tt, 1)}% oshadi</b>` : `Umumiy yoʻl vaqti <b>${F.num(-tt, 1)}% kamayadi</b>`;
    const nm = x => (x.name ? E(x.name) : 'nomsiz yoʻl');
    const worse = r.affected.filter(x => x.dv > 0).slice(0, 3), better = r.affected.filter(x => x.dv < 0).slice(0, 3);
    const items = [`<li>${ttText} (${tt >= 0 ? '+' : ''}${F.num(tt, 1)}%).</li>`];
    if (t && last.type !== 'demand') items.push(`<li>Shu koʻchada: <b>${F.int(t.baseVol)} → ${F.int(t.scenVol)}</b> mashina/soat.</li>`);
    if (worse.length) items.push(`<li class="up">Koʻproq yuklanadi: ${worse.map(x => `<b>${nm(x)}</b> (+${F.int(x.dv)})`).join(', ')}.</li>`);
    if (better.length) items.push(`<li class="down">Yengillashadi: ${better.map(x => `<b>${nm(x)}</b> (${F.signed(x.dv)})`).join(', ')}.</li>`);
    if (r.overloadedCount) items.push(`<li class="up">${plural(r.overloadedCount, 'koʻcha')} sigʻimidan oshib ketadi.</li>`);
    if (v.busLines.length) items.push(`<li>Avtobus liniyalari yoʻnalishini oʻzgartiradi: <b>${v.busLines.map(E).join(', ')}</b>.</li>`);
    const row = x => `<tr><td>${nm(x)}</td><td class="n">${F.int(x.baseVol)}</td><td class="n">${F.int(x.scenVol)}</td><td class="n ${x.dv > 0 ? 'up' : 'down'}">${F.signed(x.dv)}</td><td class="n">${F.pct(x.baseVC * 100)}→${F.pct(x.scenVC * 100)}</td></tr>`;
    return `<div class="sim">
      <div class="verdict ${VERDICT_CLS[v.level]}"><b>${E(v.label)}</b><span>${E(last.label)}</span></div>
      <ul class="simple">${items.join('')}</ul>
      <p class="muted small">Xaritada: <span class="sw r"></span> qizil — yuklama oshadi, <span class="sw g"></span> yashil — kamayadi.</p>
      <details class="more"><summary>Batafsil (jadval va sabablar)</summary>
        <ul class="reasons">${v.reasons.map(x => `<li>${E(x)}</li>`).join('')}</ul>
        ${r.affected.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Koʻcha</th><th class="n">Oldin</th><th class="n">Keyin</th><th class="n">Farq</th><th class="n">Toʻlishi</th></tr></thead><tbody>${r.affected.map(row).join('')}</tbody></table></div>` : ''}
        <p class="muted small">Raqamlar — bir soatda oʻtadigan mashinalar soni. “Toʻlishi” 100% dan oshsa — koʻcha sigʻmaydi, tirbandlik boʻladi.</p>
      </details>
      <p class="disclaimer">${E(DISCLAIMER)}</p>
      <div class="row-btns"><button class="btn sm" data-act="show-sim">Xaritada koʻrsatish</button><button class="btn sm" data-act="clear-sim">Xaritadan olib tashlash</button></div>
    </div>`;
  }

  // ---------- Muammolar (jonli kuzatuv + oddiy tilda yechimlar) ----------
  // ---------- “Hozir Samarqandda”: faqat real maʼlumot (ob-havo, tirbandlik, yoʻl hodisalari) ----------
  const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'hozirgina' : m < 60 ? `${m} daqiqa oldin` : F.time(ts).slice(-5); };
  function speedLine(t) {
    const ratio = t.currentSpeed > 0 ? t.freeFlowSpeed / t.currentSpeed : null;
    if (t.closed) return 'Yoʻl yopiq';
    if (!ratio || ratio < 1.15) return `${F.num(t.currentSpeed, 0)} km/soat — odatdagidek`;
    return `${F.num(t.currentSpeed, 0)} km/soat — odatdagidan ${F.num(ratio, 1)} baravar sekin`;
  }
  function nowCard(S) {
    const M = S.model, L = S.live, W = S.weather, inc = S.incidents;
    const hasKey = !!NX.tomtom.key();
    const freshMs = 45 * 60 * 1000;
    const measured = M.streets.filter(s => s.tomtom && Date.now() - s.tomtom.ts < freshMs).sort((a, b) => b.tomtom.congestion - a.tomtom.congestion);
    let weather = '<p class="muted small">Ob-havo yuklanmoqda…</p>';
    if (W && W.err) weather = `<p class="muted small">${E(W.err)}</p>`;
    else if (W && W.data) {
      const w = W.data, [t, ic] = NX.weather.codeText(w.code);
      weather = `<div class="wx"><span class="wx-ico" aria-hidden="true">${ic}</span><div><b>${F.num(w.temp, 0)}°C · ${E(t)}</b>
        <small>Shamol ${F.num(w.wind, 0)} km/soat${w.precip > 0 ? ` · yogʻin ${F.num(w.precip, 1)} mm` : ''} · ${w.stale ? 'oxirgi maʼlumot ' : ''}${ago(w.ts)}</small></div>${B('meteo')}</div>
        <p class="small">${NX.weather.roadAdvice(w).map(E).join(' ')}</p>`;
    }
    let traffic;
    if (!hasKey) traffic = `<p class="small"><b>Real tirbandlik ulanmagan.</b> TomTom kaliti kiritilsa, xarita real vaqtda boʻyaladi va avariya, yoʻl taʼmiri koʻrinadi.</p><button class="btn sm" data-act="settings">TomTom kalitini kiritish</button>`;
    else {
      const incList = inc && inc.list ? inc.list : null;
      traffic = `<p class="small">Xaritadagi ranglar — <b>hozirgi real tirbandlik</b> (TomTom).</p>
        ${measured.length ? `<ul class="live-list">${measured.slice(0, 4).map(s => `<li><button class="link" data-act="street" data-id="${s.id}">${E(s.name || 'Nomsiz yoʻl')}</button><span class="tag ${congCls(s.tomtom.congestion)}">${E(speedLine(s.tomtom))}</span></li>`).join('')}</ul>` : ''}
        <h4>Yoʻl hodisalari ${B('tomtom')}</h4>
        ${inc && inc.err ? `<p class="muted small">${E(inc.err)}</p>` : !incList ? '<p class="muted small">Yuklanmoqda…</p>' : !incList.length ? '<p class="small ok-text">Hozir hududda avariya, taʼmir yoki yopiq yoʻl qayd etilmagan.</p>'
          : `<ul class="live-list">${incList.slice(0, 6).map(it => `<li><button class="link" data-act="incident" data-id="${it.id}">${it.icon} ${E(it.name)}</button><small class="muted">${E([it.from, it.to].filter(Boolean).join(' → ') || '')}${it.delay ? ` · +${Math.max(1, Math.round(it.delay / 60))} daq` : ''}</small></li>`).join('')}</ul>`}`;
    }
    return `<section class="card live">
      <div class="live-h"><span class="live-dot ${L.busy ? 'busy' : ''}" aria-hidden="true"></span><b>Hozir Samarqandda</b>
        <small>${L.busy ? E(L.busy) : `Yangilandi: ${L.last ? F.time(L.last).slice(-5) : '—'} · har 5 daqiqada avtomatik`}</small></div>
      ${weather}
      ${traffic}
    </section>`;
  }


  function problems(S) {
    const M = S.model;
    const groups = Object.keys(NX.PROBLEM).map(t => ({ t, meta: NX.PROBLEM[t], items: M.problems.filter(p => p.type === t) })).filter(g => g.items.length)
      .sort((a, b) => b.meta.weight - a.meta.weight);
    const total = groups.reduce((t, g) => t + g.items.length, 0);
    return `
    ${nowCard(S)}
    <section class="card">
      <h2>Shaharda nima muammo bor?</h2>
      <p class="small">${total ? `Tahlil <b>${groups.length} xil</b> muammoni topdi (${total} joyda). Eng muhimlari tepada. Joy nomini bossangiz, xaritada koʻrsatiladi.` : 'Qoidalar boʻyicha muammo topilmadi.'}</p>
    </section>
    ${groups.map(g => {
      const qty = g.items.reduce((t, p) => t + (p.qty || 1), 0);
      const list = g.items.map(p => `<li><button class="loc" data-act="problem" data-id="${p.id}"><span aria-hidden="true">📍</span>${E(p.title)}</button></li>`);
      return `<section class="card prob" style="--c:${g.meta.color}">
        <div class="prob-h"><span class="prob-ico" aria-hidden="true">${g.meta.icon}</span><div><b>${E(g.meta.short)}</b><small>${g.items.length} ta joy</small></div></div>
        <p><b>Muammo:</b> ${E(g.meta.what)}</p>
        <p class="fix"><b>Nima qilish kerak:</b> ${E(g.meta.fix)}</p>
        <p class="muted small">Taxminiy narx: ${F.uzs(qty * g.meta.cost)} (${F.int(qty)} ${E(g.meta.unit)}) <span class="tag">taxminiy</span> ${B('hisob')}</p>
        <ul class="locs">${list.slice(0, 4).join('')}</ul>
        ${list.length > 4 ? `<details class="more"><summary>Yana ${list.length - 4} ta joy</summary><ul class="locs">${list.slice(4, 60).join('')}</ul></details>` : ''}
      </section>`;
    }).join('')}
    <p class="muted small center">Manba: ${B('osm')} ${B('hisob')} — narxlar umumiy baholar, aniq qiymat smeta bilan belgilanadi.</p>`;
  }

  // ---------- Yoʻnalishlar ----------
  function routes(S) {
    return `<section class="card"><h2>Avtobus yoʻnalishlari ${B('osm')}</h2>
      <input type="search" class="search" data-input="route-q" placeholder="Raqam, nom yoki bekat boʻyicha qidirish" value="${E(S.routeQ)}" aria-label="Yoʻnalish qidirish">
      <div id="routeList">${routeList(S)}</div></section>`;
  }

  function routeList(S) {
    const M = S.model, q = NX.analysis.norm(S.routeQ || '');
    const list = M.routes.filter(r => !q || NX.analysis.norm([r.ref, r.name, r.from, r.to].concat(r.stops.map(s => s.name)).join(' ')).includes(q))
      .sort((a, b) => (parseInt(a.ref, 10) || 1e9) - (parseInt(b.ref, 10) || 1e9) || a.label.localeCompare(b.label));
    if (!M.routes.length) return '<div class="state small"><p>OpenStreetMap’da bu hudud uchun avtobus yoʻnalishi topilmadi yoki yuklanmadi.</p><button class="btn" data-act="retry">Qayta urinish</button></div>';
    if (!list.length) return '<p class="muted">Hech narsa topilmadi.</p>';
    return `<p class="muted small">${list.length} ta yoʻnalish (har bir yoʻnalish tomoni alohida OSM relation)</p><ul class="rlist">${list.map(r => {
      const open = S.route === r.i;
      return `<li class="${open ? 'open' : ''}"><button class="rhead" data-act="route" data-id="${r.i}" aria-expanded="${open}">
        <span class="ref big" style="--c:${r.color}">${E(r.label)}</span>
        <span class="rtitle"><b>${E(r.from && r.to ? r.from + ' → ' + r.to : r.name || r.modeUz)}</b><small>${E(r.modeUz)} · ${r.stops.length} bekat · ${F.km(r.length)}</small></span></button>
        ${open ? routeDetail(S, r) : ''}</li>`;
    }).join('')}</ul>`;
  }

  function routeDetail(S, r) {
    const M = S.model;
    const streets = r.streets.map(i => M.streets[i]).filter(s => s.name).sort((a, b) => b.rank - a.rank);
    return `<div class="rbody">
      <dl class="facts">
        <dt>Hududdagi bekatlar</dt><dd>${r.stops.length} ${B('osm')}</dd>
        <dt>Hududdagi uzunlik</dt><dd>${F.km(r.length)} ${B('osm')}</dd>
        <dt>Bekatlar oʻrtacha oraligʻi</dt><dd>${F.km(r.spacing.avg)} ${B('hisob')}</dd>
        <dt>Maksimal oraliq</dt><dd>${F.km(r.spacing.max)} ${r.spacing.max > NX.RULES.spacingMax ? '<span class="tag r">900 m dan katta</span>' : ''} ${B('hisob')}</dd>
        ${r.op ? `<dt>Tashuvchi</dt><dd>${E(r.op)}</dd>` : ''}
      </dl>
      <p class="small"><b>Koʻchalar:</b> ${streets.length ? streets.map(s => `<button class="link" data-act="street" data-id="${s.id}">${E(s.name)}</button>`).join(', ') : '<span class="muted">aniqlanmadi</span>'}</p>
      ${r.stops.length ? `<ol class="stops">${r.stops.map((s, k) => { const g = r.gaps.find(x => x.to === k); return `<li>${E(s.name || 'Nomsiz bekat')}${g ? ` <small class="${g.d > NX.RULES.spacingMax ? 'tag r' : 'muted'}">${F.km(g.d)}</small>` : ''}</li>`; }).join('')}</ol>` : ''}
      <p class="muted small">Oraliqlar toʻgʻri chiziq boʻyicha hisoblangan; marshrut hududdan chiqib qaytgan joylar hisobga olinmagan.</p>
    </div>`;
  }

  // ---------- Bashorat ----------
  function forecast(S) {
    const M = S.model, s = M.streets[S.fc.street];
    const st = NX.forecast.stats();
    const day = NX.forecast.dayCurve(s, S.fc.d);
    const options = M.namedStreets.slice().sort((a, b) => a.name.localeCompare(b.name, 'uz')).map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${E(x.name)}</option>`).join('');
    const main = mainStreets(M);
    return `
    <section class="card">
      <h2>Bashorat</h2>
      <p class="small"><b>1.</b> Koʻchani tanlang (yoki xaritada bosing). <b>2.</b> Uning kun davomidagi holatini koʻring. <b>3.</b> Pastda nima qilmoqchi ekaningizni tanlang.</p>
      <label class="field"><span>Koʻcha</span><select data-input="fc-street">${options}</select></label>
    </section>
    ${forecastCard(s, `${E(s.name)}: keyingi 24 soat`)}
    ${actions(S, s)}
    ${aiBox(S, s)}
    <details class="card more-card">
      <summary>Xaritani boshqa kun va soat uchun koʻrish</summary>
      <div class="row2">
        <label class="field"><span>Kun</span><select data-input="fc-day">${NX.days.map((d, i) => `<option value="${i}" ${i === S.fc.d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="field"><span>Soat: <b data-out="fc-hour">${F.hour(S.fc.h)}</b></span><input type="range" min="0" max="23" step="1" value="${S.fc.h}" data-input="fc-hour" aria-label="Soat"></label>
      </div>
      <p class="muted small">Xaritadagi koʻchalar tanlangan vaqt uchun bashorat boʻyicha boʻyaladi.</p>
      <h4>${E(s.name)} — ${NX.days[S.fc.d]}, soatbay</h4>
      ${NX.chart.forecastChart(day, { now: S.fc.h })}
    </details>
    <details class="card more-card">
      <summary>Mutaxassislar uchun: TomTom oʻlchovlari va kalibrlash</summary>
      <h4>Oʻlchovlar tarixi ${B('tomtom')}</h4>
      <p class="small">Namunalar: <b>${st.samples}</b> · koʻchalar: <b>${st.streets}</b>${st.last ? ` · oxirgisi: ${F.time(st.last)}` : ''}</p>
      <button class="btn" data-act="measure-main" ${S.batch ? 'disabled' : ''}>Asosiy ${main.length} ta koʻchani oʻlchash</button>
      ${S.batch ? `<p class="small">${E(S.batch)}</p>` : ''}
      ${S.batchErr ? `<p class="alert">${E(S.batchErr)}</p>` : ''}
      <div class="row-btns"><button class="btn sm" data-act="hist-export">Eksport (JSON)</button><label class="btn sm file">Import<input type="file" accept="application/json,.json" data-input="hist-import" hidden></label></div>
      <h4>Modelni kalibrlash ${B('hisob')}</h4>
      <p class="muted small">Oʻlchangan koʻchalarda model tezligi TomTom’ga eng yaqin boʻladigan harakat darajasi tanlanadi.</p>
      ${demandSlider(S)}
      <button class="btn" data-act="calibrate" ${S.sim.busy || M.kpi.measured === 0 ? 'disabled' : ''}>${M.kpi.measured ? `Kalibrlash (${M.kpi.measured} ta oʻlchov)` : 'Avval TomTom bilan oʻlchang'}</button>
      ${S.calibBusy ? progress(S.calibBusy) : ''}
      ${S.calib ? calibView(S) : ''}
    </details>`;
  }

  function calibView(S) {
    const c = S.calib;
    return `<div class="calib"><p>Model real TomTom oʻlchovlariga moslandi. Hozir model va real tirbandlik orasidagi oʻrtacha farq: <b>±${F.num(c.best.rmse, 0)}%</b>${c.base && c.base.rmse != null ? ` (oldin ±${F.num(c.base.rmse, 0)}%)` : ''}.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Koʻcha</th><th class="n">Real</th><th class="n">Model</th></tr></thead><tbody>${c.best.rows.map(r => `<tr><td>${E(S.model.streets[r.street].name || 'nomsiz')}</td><td class="n">${F.pct(r.measured)}</td><td class="n">${F.pct(r.model)}</td></tr>`).join('')}</tbody></table></div>
      ${c.best.rows.length < 5 ? '<p class="lowconf">Oʻlchangan koʻchalar kam — koʻproq koʻchani oʻlchang.</p>' : ''}</div>`;
  }

  function mainStreets(M) {
    return M.namedStreets.filter(s => s.rank >= 5).sort((a, b) => b.risk.value - a.risk.value).slice(0, 12);
  }

  // ---------- Hisobot ----------
  function recommendations(M) {
    const out = [];
    const unsafe = M.schools.filter(o => !o.safe);
    if (unsafe.length) out.push({ pr: 100, t: 'Maktab va bogʻchalar oldida xavfsiz piyoda oʻtish joylari', why: `${unsafe.length} ta muassasa yonida 150 m ichida oʻtish joyi/svetofor yoʻq.`, qty: unsafe.length, unit: 'koʻtarilgan oʻtish + belgilar', cost: COST.schoolCrossing, items: unsafe.slice(0, 8).map(o => o.name || (o.kind === 'kindergarten' ? 'Bogʻcha' : 'Maktab')) });
    const uj = M.junctions.filter(j => !j.signalised).sort((a, b) => Math.max(...b.streets.map(s => M.streets[s].rank)) - Math.max(...a.streets.map(s => M.streets[s].rank)));
    if (uj.length) out.push({ pr: 80, t: 'Svetoforsiz yirik chorrahalarni tartibga solish', why: `${uj.length} ta yirik koʻchalar kesishmasida 40 m ichida svetofor yoʻq. Avval transport sanogʻi bilan zarurati tekshiriladi.`, qty: uj.length, unit: 'svetofor obyekti', cost: COST.signal, items: uj.slice(0, 8).map(j => j.name) });
    const cong = M.streets.filter(s => s.tomtom && s.tomtom.congestion >= NX.RULES.congestion);
    if (cong.length) out.push({ pr: 75, t: 'Tirband koʻchalarda svetofor fazalarini optimallashtirish va avtobus ustuvorligi', why: `TomTom oʻlchovi boʻyicha ${cong.length} ta koʻchada tirbandlik 30% dan yuqori.`, qty: cong.length, unit: 'koʻcha', cost: COST.signalOpt, items: cong.map(s => s.name || 'nomsiz').slice(0, 8) });
    if (M.gapClusters.length) {
      const qty = M.gapClusters.reduce((t, c) => t + Math.ceil(c.cells.length / 6), 0);
      out.push({ pr: 50, t: 'Bekat qamrovi yoʻq hududlarga yangi bekatlar', why: `${M.gapCells.length} ta 250×250 m katakda 400 m ichida bekat yoʻq (${M.gapClusters.length} ta hudud).`, qty, unit: 'bekat (pavilon + belgi)', cost: COST.stop, items: [] });
    }
    const gaps = M.routes.flatMap(r => r.gaps.filter(g => g.d > NX.RULES.spacingMax).map(g => ({ r, g })));
    if (gaps.length) out.push({ pr: 40, t: 'Uzun oraliqlarga oraliq bekat qoʻshish', why: `${gaps.length} ta oraliq 900 m dan uzun.`, qty: gaps.reduce((t, x) => t + Math.max(1, Math.ceil(x.g.d / 600) - 1), 0), unit: 'bekat', cost: COST.stop, items: [...new Set(gaps.map(x => x.r.label))].slice(0, 10).map(l => 'Liniya ' + l) });
    const fc = M.problems.filter(p => p.type === 'crossings');
    if (fc.length) out.push({ pr: 30, t: 'Asosiy koʻchalarda piyoda oʻtish joylarini koʻpaytirish', why: `${fc.length} ta asosiy koʻchada 1 km ga 2 tadan kam oʻtish joyi.`, qty: fc.reduce((t, p) => { const s = M.streets[p.street]; return t + Math.max(1, Math.ceil(2 * s.length / 1000 - p.perKm * s.length / 1000)); }, 0), unit: 'oʻtish joyi (zebra + belgi + yoritish)', cost: COST.crossing, items: fc.map(p => p.title).slice(0, 8) });
    out.sort((a, b) => b.pr - a.pr);
    out.forEach(r => (r.total = r.qty * r.cost));
    return out;
  }

  function report(S) {
    const M = S.model, k = M.kpi;
    const recs = recommendations(M);
    const measured = M.streets.filter(s => s.tomtom).sort((a, b) => b.tomtom.congestion - a.tomtom.congestion).slice(0, 10);
    const risky = M.namedStreets.slice().sort((a, b) => b.risk.value - a.risk.value).slice(0, 10);
    const total = recs.reduce((t, r) => t + r.total, 0);
    return `
    <section class="card">
      <h2>Hisobot</h2>
      <p class="muted small">Hudud: Samarqand tarixiy markazi, ${E(bboxText())}. OSM maʼlumoti: ${F.time(M.ts)}.</p>
      <div class="tbl-wrap"><table class="tbl">
        <tbody>
          ${ind('Transport indeksi', (M.index.value != null ? M.index.value : '—') + '/100', 'hisob')}
          ${ind('Nomli koʻchalar', F.int(k.streets), 'osm')}
          ${ind('Yoʻllar uzunligi', F.num(k.roadKm, 1) + ' km', 'osm')}
          ${ind('Avtobus liniyalari / yoʻnalishlar', `${k.lines} / ${k.relations}`, 'osm')}
          ${ind('Hududdagi bekatlar', F.int(k.stopsInArea), 'osm')}
          ${ind('Bekat qamrovi (400 m)', F.pct(k.coverage), 'hisob')}
          ${ind('Bekatlar oʻrtacha oraligʻi', F.km(k.avgSpacing), 'hisob')}
          ${ind('Yirik chorrahalar / svetoforsiz', `${k.majorJunctions} / ${k.unsignalised}`, 'hisob')}
          ${ind('Maktab va bogʻchalar / xavfsiz oʻtishsiz', `${k.schools} / ${k.unsafeSchools}`, 'hisob')}
          ${ind('TomTom bilan oʻlchangan koʻchalar', F.int(k.measured), 'tomtom')}
          ${k.avgCongestion != null ? ind('Oʻrtacha tirbandlik (oʻlchanganlar)', F.pct(k.avgCongestion), 'tomtom') : ''}
        </tbody></table></div>
    </section>
    <section class="card">
      <h3>Eng tirband koʻchalar</h3>
      ${measured.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Koʻcha</th><th class="n">Tirbandlik</th><th class="n">Tezlik</th><th>Vaqt</th></tr></thead><tbody>${measured.map(s => `<tr><td><button class="link" data-act="street" data-id="${s.id}">${streetName(s)}</button></td><td class="n"><span class="tag ${congCls(s.tomtom.congestion)}">${F.pct(s.tomtom.congestion)}</span></td><td class="n">${F.num(s.tomtom.currentSpeed, 0)}/${F.num(s.tomtom.freeFlowSpeed, 0)}</td><td class="small">${F.time(s.tomtom.ts)}</td></tr>`).join('')}</tbody></table></div><p class="src-line">${B('tomtom')}</p>` : '<p class="muted small">TomTom oʻlchovlari yoʻq. Quyida qoidaga asoslangan tirbandlik <b>xavfi</b> (oʻlchov emas) koʻrsatilgan.</p>'}
      ${!measured.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Koʻcha</th><th class="n">Xavf</th><th>Liniyalar</th></tr></thead><tbody>${risky.map(s => `<tr><td><button class="link" data-act="street" data-id="${s.id}">${streetName(s)}</button></td><td class="n">${s.risk.value}</td><td class="small">${E(s.busRefs.join(', ') || '—')}</td></tr>`).join('')}</tbody></table></div><p class="src-line">${B('hisob')}</p>` : ''}
    </section>
    <section class="card">
      <h3>Tavsiyalar (ustuvorlik boʻyicha)</h3>
      ${recs.length ? `<ol class="recs">${recs.map(r => `<li><b>${E(r.t)}</b><p class="small">${E(r.why)}</p>
        <p class="small">Miqdor: ${F.int(r.qty)} × ${E(r.unit)} · <b>${F.uzs(r.total)}</b> <span class="tag">taxminiy</span> ${B('hisob')}</p>
        ${r.items.length ? `<p class="muted small">${E(r.items.join('; '))}</p>` : ''}</li>`).join('')}</ol>
        <p class="small">Jami: <b>${F.uzs(total)}</b> <span class="tag">taxminiy</span></p>
        <p class="muted small">Narxlar — umumiy bozor baholari asosidagi taxminiy birlik narxlar (bekat ${F.uzs(COST.stop)}, svetofor obyekti ${F.uzs(COST.signal)}, oʻtish joyi ${F.uzs(COST.crossing)}, maktab oldidagi koʻtarilgan oʻtish ${F.uzs(COST.schoolCrossing)}, faza optimallashtirish ${F.uzs(COST.signalOpt)}). Aniq qiymat loyiha-smeta hujjati bilan belgilanadi.</p>` : '<p class="muted">Tavsiya yoʻq.</p>'}
    </section>
    <section class="card">
      <h3>Maʼlumot manbalari</h3>
      <ul class="small sources">
        <li>${B('osm')} Koʻchalar, bekatlar, svetoforlar, piyoda oʻtishlar, maktab/bogʻchalar, avtobus yoʻnalishlari — Overpass API (${E(M.mirror || 'kesh')}), ${F.time(M.ts)}. © OpenStreetMap hissadorlari, ODbL.</li>
        <li>${B('tomtom')} Traffic Flow API — joriy va erkin oqim tezligi (foydalanuvchi kaliti bilan).</li>
        <li>${B('hisob')} Qoidalar asosidagi hisob-kitoblar (quyida).</li>
        <li>${B('bashorat')} Soatbay bashorat va “Agar…?” simulyatsiyasi — model natijasi, oʻlchov emas.</li>
        <li>${B('ai')} OpenAI modeli — faqat yuqoridagi raqamlar asosida matn tuzadi.</li>
      </ul>
      <button class="btn primary" data-act="export">Hisobotni JSON formatida yuklab olish</button>
    </section>
    ${how()}`;
  }

  const ind = (k, v, src) => `<tr><td>${k}</td><td class="n"><b>${v}</b></td><td>${B(src)}</td></tr>`;
  const bboxText = () => { const b = NX.config.bbox; return `${b.s}–${b.n} shm. k., ${b.w}–${b.e} shq. u.`; };

  function how() {
    return `<section class="card" id="how">
      <h3>Qanday ishlaydi</h3>
      <div class="how small">
        <p><b>Real maʼlumot.</b> Koʻchalar, bekatlar, avtobus yoʻnalishlari, svetoforlar va maktablar — OpenStreetMap xaritasidan. Hozirgi tirbandlik va yoʻl hodisalari — TomTom’dan. Ob-havo — Open-Meteo’dan. Sayt bularni har 5 daqiqada yangilab turadi.</p>
        <p><b>Muammolar.</b> Sayt xaritani tekshirib, quyidagilarni topadi: bekatdan 400 m dan uzoq hududlar; bekatlari 900 m dan uzoq yoʻnalishlar; svetoforsiz katta chorrahalar; yonida piyoda oʻtish joyi yoʻq maktab va bogʻchalar; oʻtish joylari kam katta koʻchalar; hozir 30% dan koʻproq sekinlashgan koʻchalar.</p>
        <p><b>“Nima boʻladi?”</b> Koʻchani bir tomonlama qilsangiz yoki yopsangiz, mashinalar boshqa yoʻllarni tanlaydi. Sayt butun koʻcha tarmogʻida shuni hisoblab, qaysi koʻchalar yuklanishini koʻrsatadi. Bu — taxmin; aniq natija uchun chorrahalarda mashinalarni sanash kerak.</p>
        <p><b>Taxmin (bashorat).</b> Koʻcha har gal oʻlchanganda natija saqlanadi. Oʻlchovlar koʻpaygan sari “odatda qachon tirband” degan taxmin real maʼlumotga asoslanadi. Oʻlchov kam boʻlsa, sayt buni ochiq yozadi.</p>
        <p><b>Belgilar.</b> Har bir raqam yonida qayerdan olingani yozilgan: <i>real</i> — oʻlchangan, <i>Hisob</i> — xarita asosida sanalgan, <i>Taxmin</i> — oldindan baholangan.</p>
      </div></section>`;
  }

  NX.views = { loading, error, home, problems, nowCard, street, aiBox, actions, routes, routeList, forecast, report, simResult, progress, recommendations, mainStreets, directionLabels, DISCLAIMER };
})();
