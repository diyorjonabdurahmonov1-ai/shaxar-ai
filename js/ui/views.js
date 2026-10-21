/* City Jam — panel koʻrinishlari (HTML shablonlar) */
(function () {
  'use strict';
  const NX = window.NX;
  const E = NX.esc, F = NX.fmt, B = NX.badge;

  const COST = { stop: 35e6, signal: 600e6, crossing: 20e6, schoolCrossing: 80e6, signalOpt: 30e6 };
  const DISCLAIMER = 'Bu soddalashtirilgan model bashorati; aniq natija uchun chorraha sanogʻi bilan kalibrlash kerak.';
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
    <section class="card hint-card">
      <b>Qanday boshlash kerak?</b>
      <p class="small">Xaritada istalgan <b>koʻchani bosing</b> — keyin “Bu koʻchaga nima qilmoqchisiz?” tugmalaridan birini tanlang. Dastur oqibatini hisoblab beradi.</p>
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
    const hasKey = !!(NX.store.get('key:openai', '') || '').trim();
    let out = '';
    if (a.busy) out = `<div class="ai-out"><div class="spinner sm"></div> ${E(a.busy)}</div>`;
    else if (a.answer) {
      const r = a.answer;
      out = `<div class="ai-out">
        <div class="ai-meta">${B(r.src)}${r.street ? ` <span class="muted small">Koʻcha: <b>${E(r.street.name)}</b></span>` : ''}</div>
        ${r.error ? `<p class="alert">${E(r.error)}</p>` : ''}
        <div class="ai-text">${NX.ai.render(r.text)}</div></div>`;
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
    const status = tt
      ? `<div class="status-line ${congCls(tt.congestion)}"><b>Hozir: ${trafficWord(tt.congestion)}</b> — tirbandlik ${F.pct(tt.congestion)} ${B('tomtom')}<small>${F.time(tt.ts)}</small></div>`
      : `<div class="status-line ${s.risk.value < 35 ? 'g' : s.risk.value < 60 ? 'a' : 'r'}"><b>Tirbandlik xavfi: ${riskWord(s.risk.value)}</b> ${B('hisob')}<small>taxmin, oʻlchov emas</small></div>`;
    return `<section class="card">
      <h2>${streetName(s)}</h2>
      <p class="muted">${E(NX.HW[s.hw].uz)} · ${bits.join(' · ')} ${B('osm')}</p>
      ${status}
      <div class="row-btns"><button class="btn sm" data-act="measure" data-id="${s.id}" ${S.measuring ? 'disabled' : ''}>${S.measuring === s.id ? 'Oʻlchanmoqda…' : tt ? 'Qayta oʻlchash' : 'Hozirgi tirbandlikni oʻlchash'}</button></div>
      ${S.measureErr ? `<p class="alert">${E(S.measureErr)}</p>` : ''}
    </section>`;
  }

  function streetDetails(S, s) {
    const M = S.model, tt = s.tomtom, km = s.length / 1000, rp = s.risk.parts;
    const stopNames = [...new Set(s.stops.map(x => x.name).filter(Boolean))];
    return `<details class="card more-card"><summary>Batafsil maʼlumot ${B('osm')}</summary>
      <dl class="facts">
        <dt>Polosalar</dt><dd>${s.lanes ? s.lanes : `belgilanmagan (modelda ${s.lanesPerDir} ta/tomon)`}</dd>
        <dt>Tezlik chegarasi</dt><dd>${s.maxspeed ? s.maxspeed + ' km/soat' : 'belgilanmagan'}</dd>
        <dt>Avtobus liniyalari</dt><dd class="refs">${refBadges(M, s.busRefs, s.routes)}</dd>
        <dt>Bekatlar</dt><dd>${s.stops.length}${stopNames.length ? ` — ${E(stopNames.slice(0, 6).join(', '))}${stopNames.length > 6 ? '…' : ''}` : ''}</dd>
        <dt>Svetoforlar</dt><dd>${s.signals.length} (${F.num(s.signals.length / Math.max(km, 0.01), 1)}/km)</dd>
        <dt>Piyoda oʻtishlar</dt><dd>${s.crossings.length}</dd>
        <dt>Yaqin maktab/bogʻcha</dt><dd>${s.schools.length ? s.schools.map(o => E(o.name || (o.kind === 'kindergarten' ? 'Bogʻcha' : 'Maktab')) + (o.safe ? '' : ' <span class="tag r">xavfsiz oʻtish yoʻq</span>')).join('<br>') : '0'}</dd>
        ${tt ? `<dt>TomTom</dt><dd>${F.num(tt.currentSpeed, 0)} / ${F.num(tt.freeFlowSpeed, 0)} km/soat (joriy / erkin) ${B('tomtom')}</dd>` : ''}
        <dt>Xavf indeksi</dt><dd>${s.risk.value}/100 ${B('hisob')}<br><small class="muted">turi ${rp.turi} + avtobus ${rp.avtobus} + svetofor ${F.num(rp.svetofor, 0)} + polosa ${rp.polosa} + bekat ${F.num(rp.bekat, 0)}</small></dd>
      </dl></details>`;
  }

  function forecastCard(s, title) {
    const fc = NX.forecast.next24(s);
    const peak = fc.reduce((a, b) => (b.value > a.value ? b : a)), calm = fc.reduce((a, b) => (b.value < a.value ? b : a));
    const low = fc.some(p => p.low);
    return `<section class="card">
      <h3>${title || 'Kun davomida qanday boʻladi?'} ${B('bashorat')}</h3>
      <p>Eng tirband vaqt — <b>${peak.label}</b> (~${F.num(peak.value, 0)}%), eng boʻsh — <b>${calm.label}</b>.</p>
      ${NX.chart.forecastChart(fc, { now: 0, title: 'Keyingi 24 soat' })}
      ${low ? '<p class="lowconf">maʼlumot kam → ishonch past</p><p class="muted small">TomTom oʻlchovlari hali kam, shuning uchun bu tipik shahar kunining taxmini. Turli soatlarda “oʻlchash”ni bossangiz, bashorat aniqlashadi.</p>' : ''}
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
    const row = x => `<tr><td>${nm(x)}</td><td class="n">${F.int(x.baseVol)}</td><td class="n">${F.int(x.scenVol)}</td><td class="n ${x.dv > 0 ? 'up' : 'down'}">${F.signed(x.dv)}</td><td class="n">${F.num(x.baseVC, 2)}→${F.num(x.scenVC, 2)}</td></tr>`;
    return `<div class="sim">
      <div class="verdict ${VERDICT_CLS[v.level]}"><b>${E(v.label)}</b><span>${E(last.label)}</span></div>
      <ul class="simple">${items.join('')}</ul>
      <p class="muted small">Xaritada: <span class="sw r"></span> qizil — yuklama oshadi, <span class="sw g"></span> yashil — kamayadi.</p>
      <details class="more"><summary>Batafsil (jadval va sabablar)</summary>
        <ul class="reasons">${v.reasons.map(x => `<li>${E(x)}</li>`).join('')}</ul>
        ${r.affected.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Koʻcha</th><th class="n">Oldin</th><th class="n">Keyin</th><th class="n">Δ</th><th class="n">V/C</th></tr></thead><tbody>${r.affected.map(row).join('')}</tbody></table></div>` : ''}
        <p class="muted small">Hajm — mashina/soat (ikki yoʻnalish yigʻindisi). V/C — yuklama/sigʻim; 1 dan katta — tirbandlik. Talab ${F.int(last.demand)} safar/soat; tarmoq ${S.simInfo ? `${F.int(S.simInfo.nodes)} tugun, ${S.simInfo.zones} zona` : ''}; ${last.iters} iteratsiya.</p>
      </details>
      <p class="disclaimer">${E(DISCLAIMER)}</p>
      <div class="row-btns"><button class="btn sm" data-act="show-sim">Xaritada koʻrsatish</button><button class="btn sm" data-act="clear-sim">Xaritadan olib tashlash</button></div>
    </div>`;
  }

  // ---------- Muammolar (jonli kuzatuv + oddiy tilda yechimlar) ----------
  function liveCard(S) {
    const M = S.model, L = S.live, now = new Date();
    const hasKey = !!NX.tomtom.key();
    const freshMs = 45 * 60 * 1000;
    const measured = M.streets.filter(s => s.tomtom && Date.now() - s.tomtom.ts < freshMs).sort((a, b) => b.tomtom.congestion - a.tomtom.congestion);
    const expected = M.namedStreets.filter(s => s.rank >= 4).map(s => ({ s, p: NX.forecast.predict(s, now.getDay(), now.getHours()) }))
      .sort((a, b) => b.p.value - a.p.value).slice(0, 4);
    const nextMin = L.next ? Math.max(0, Math.round((L.next - Date.now()) / 60000)) : null;
    const line = (s, v, src) => `<li><button class="link" data-act="street" data-id="${s.id}">${E(s.name || 'Nomsiz yoʻl')}</button><span class="tag ${congCls(v)}">${trafficWord(v)} · ${F.pct(v)}</span>${B(src)}</li>`;
    return `<section class="card live">
      <div class="live-h"><span class="live-dot ${L.busy ? 'busy' : ''}" aria-hidden="true"></span><b>Jonli kuzatuv</b>
        <small>${L.busy ? E(L.busy) : `Oxirgi tahlil: ${L.last ? F.time(L.last).slice(-5) : '—'}${nextMin != null ? ` · keyingisi ${nextMin} daqiqadan keyin` : ''}`}</small></div>
      ${measured.length ? `<h4>Hozir eng tirband koʻchalar</h4><ul class="live-list">${measured.slice(0, 5).map(s => line(s, s.tomtom.congestion, 'tomtom')).join('')}</ul>` : ''}
      ${!measured.length ? `<h4>Shu soatda (${F.hour(now.getHours())}) tirband boʻlishi kutilayotgan koʻchalar</h4><ul class="live-list">${expected.map(x => line(x.s, x.p.value, 'bashorat')).join('')}</ul>` : ''}
      ${hasKey ? `<p class="muted small">Har 10 daqiqada ${LIVE_BATCH} ta asosiy koʻcha navbatma-navbat TomTom bilan oʻlchanadi va muammolar qayta hisoblanadi.</p>`
        : `<p class="small">Hozircha bu <b>bashorat</b>. Real vaqtdagi tirbandlikni koʻrish uchun bepul TomTom kalitini kiriting — sayt koʻchalarni oʻzi oʻlchab turadi.</p><button class="btn sm" data-act="settings">TomTom kalitini kiritish</button>`}
    </section>`;
  }
  const LIVE_BATCH = 4;

  function problems(S) {
    const M = S.model;
    const groups = Object.keys(NX.PROBLEM).map(t => ({ t, meta: NX.PROBLEM[t], items: M.problems.filter(p => p.type === t) })).filter(g => g.items.length)
      .sort((a, b) => b.meta.weight - a.meta.weight);
    const total = groups.reduce((t, g) => t + g.items.length, 0);
    return `
    ${liveCard(S)}
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
    return `<div class="calib"><p>Eng mos talab: <b>${F.int(c.best.demand)} reys/soat</b> (koeffitsient ×${F.num(c.best.factor, 2)}). Kalibrlash xatosi (RMSE): <b>±${F.num(c.best.rmse, 1)} foiz punkti</b>${c.base && c.base.rmse != null ? `; kalibrlashdan oldin ±${F.num(c.base.rmse, 1)}` : ''}.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Koʻcha</th><th class="n">TomTom</th><th class="n">Model</th></tr></thead><tbody>${c.best.rows.map(r => `<tr><td>${E(S.model.streets[r.street].name || 'nomsiz')}</td><td class="n">${F.pct(r.measured)}</td><td class="n">${F.pct(r.model)}</td></tr>`).join('')}</tbody></table></div>
      ${c.best.rows.length < 5 ? '<p class="lowconf">Oʻlchovlar kam — kalibrlash ishonchi past.</p>' : ''}</div>`;
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
    const R = NX.RULES;
    return `<section class="card" id="how">
      <h3>Qanday ishlaydi</h3>
      <div class="how small">
        <p><b>Maʼlumot.</b> OpenStreetMap maʼlumoti brauzerda Overpass API’ning 4 ta serveriga parallel soʻrov bilan olinadi (birinchi javob qabul qilinadi, xato boʻlsa qayta urinadi) va brauzer xotirasida 24 soat saqlanadi — sekin internetda va oflaynda ham ishlaydi.</p>
        <p><b>Koʻchalar.</b> OSM yoʻllari nomi boʻyicha koʻchalarga birlashtiriladi; tez qidirish uchun 60 m li fazoviy toʻr indeksi ishlatiladi. Koʻchadagi avtobus liniyasi — marshrut nuqtalari koʻchadan ${R.routeToStreet} m ichida (kamida ${R.routeMinSamples} nuqta) yoki marshrut aʼzosi shu koʻcha yoʻli boʻlsa.</p>
        <p><b>Muammolar.</b> (1) Koʻchasi bor, lekin markazidan ${R.coverage} m ichida bekat yoʻq ${R.cell}×${R.cell} m kataklar; (2) bir liniyadagi ketma-ket bekatlar orasi ${R.spacingMax} m dan katta; (3) ikki yirik koʻcha (3-darajali va yuqori) kesishmasida ${R.junctionSignal} m ichida svetofor yoʻq; (4) maktab/bogʻchadan ${R.schoolSafe} m ichida piyoda oʻtish yoki svetofor yoʻq; (5) asosiy koʻchada 1 km ga ${R.crossingsPerKm} tadan kam oʻtish joyi; (6) TomTom tirbandligi ${R.congestion}% va undan yuqori.</p>
        <p><b>Tirbandlik xavfi (taxmin).</b> Koʻcha turi (2–30) + avtobus liniyalari (×5, max 25) + svetofor/km (×3, max 15) + har tomonga 1 polosa (10) + bekat/km (×2, max 15). TomTom oʻlchovi boʻlsa, xaritada oʻlchov koʻrsatiladi.</p>
        <p><b>Bashorat.</b> Har bir TomTom oʻlchovi {koʻcha, hafta kuni, soat, joriy tezlik, erkin tezlik} sifatida saqlanadi. Bashorat — shu kun va soatdagi namunalar oʻrtachasi. Namuna 3 tadan kam boʻlsa, tipik shahar profili (choʻqqilar 07:30–09:30 va 17:00–19:30; dam olish kunlari pastroq) koʻchaning xavf indeksiga koʻra masshtablanib aralashtiriladi; koʻchaning boshqa soatlardagi oʻlchovlari profilni koʻchaga moslaydi. Ishonch oraligʻi namunalar kam boʻlsa kengayadi.</p>
        <p><b>“Agar…?” simulyatsiyasi.</b> OSM koʻchalaridan yoʻnaltirilgan graf quriladi (bir tomonlama harakat hisobga olinadi). Sigʻim — polosaga 900 avto/soat (polosa belgilanmagan boʻlsa, koʻcha turiga koʻra standart). Erkin tezlik — tezlik chegarasi yoki standart qiymatning 80%. Hudud 500×500 m zonalarga boʻlinadi; zona “ogʻirligi” koʻchalar uzunligi (asosiy koʻchalar koʻproq) va bekatlar soniga, markazga yaqinlik esa jalb qilishga bogʻliq; gravitatsion model reyslarni taqsimlaydi. Oqim MSA usulida (10 iteratsiya) foydalanuvchi muvozanatiga keltiriladi, vaqt BPR funksiyasi bilan: t = t₀·(1 + 0,15·(V/C)⁴). Hisob Web Worker’da bajariladi.</p>
        <p><b>Xulosa qoidalari.</b> Umumiy yoʻl vaqti ≤ 2% oshsa va yangi haddan oshgan koʻcha boʻlmasa — “Mos keladi”; ≤ 8% va 1–2 koʻcha — “Ehtiyotkorlik bilan”; aks holda yoki tarmoq uzilsa — “Tavsiya etilmaydi”. 3 va undan koʻp avtobus liniyasi yoʻnalishini oʻzgartirish kerak boʻlsa, xulosa kamida “Ehtiyotkorlik bilan”.</p>
        <p><b>Kalibrlash.</b> TomTom oʻlchangan koʻchalarda model tezlik nisbati (t₀/t) oʻlchangan nisbatga eng yaqin boʻladigan talab koeffitsienti tanlanadi va xatosi (RMSE) koʻrsatiladi.</p>
        <p><b>Kelajakda.</b> Modullar alohida: <code>js/data</code> (yuklovchilar), <code>js/analysis</code>, <code>js/sim</code>, <code>js/map.js</code>, <code>js/ui</code>. Avtobus GPS maʼlumoti yoki chorraha sanoqlarini yangi yuklovchi sifatida qoʻshish mumkin.</p>
        <p class="disclaimer">${E(DISCLAIMER)}</p>
      </div></section>`;
  }

  NX.views = { loading, error, home, problems, street, aiBox, actions, routes, routeList, forecast, report, simResult, progress, recommendations, mainStreets, directionLabels, DISCLAIMER };
})();
