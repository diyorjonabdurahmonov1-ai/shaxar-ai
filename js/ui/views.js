/* NEXUS Transport — panel koʻrinishlari (HTML shablonlar) */
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

  // ---------- Umumiy koʻrinish (Xarita) ----------
  function home(S) {
    const M = S.model, k = M.kpi, ix = M.index;
    const groups = Object.keys(NX.PROBLEM).map(t => ({ t, items: M.problems.filter(p => p.type === t) })).filter(g => g.items.length)
      .sort((a, b) => NX.PROBLEM[b.t].weight - NX.PROBLEM[a.t].weight);
    const examples = exampleQuestions(M);
    return `
    <section class="card index-card">
      <div class="ring" style="--v:${ix.value || 0}"><b>${ix.value != null ? ix.value : '—'}</b><small>/100</small></div>
      <div><h2>Transport indeksi ${B('hisob')}</h2><p class="muted small">Bekat qamrovi, svetoforli chorrahalar, maktablar xavfsizligi, bekat oraligʻi${k.measured >= 3 ? ' va TomTom tirbandligi' : ''} asosida.</p>
      ${NX.chart.bars(ix.parts.map(p => ({ k: p.k, v: p.v, t: F.num(p.v, 0) + ' · ' + Math.round(p.w * 100) + '% vazn' })))}</div>
    </section>
    <section class="kpis">
      ${kpi('Avtobus liniyalari', F.int(k.lines), `${k.relations} ta yoʻnalish (relation)`, 'osm')}
      ${kpi('Bekat qamrovi (400 m)', F.pct(k.coverage), `${k.stopsInArea} ta bekat hududda`, 'hisob')}
      ${kpi('Svetoforsiz yirik chorrahalar', F.int(k.unsignalised), `jami ${k.majorJunctions} ta yirik chorraha`, 'hisob')}
      ${kpi('Bekatlar oʻrtacha oraligʻi', F.km(k.avgSpacing), 'toʻgʻri chiziq boʻyicha', 'hisob')}
    </section>
    <section class="card">
      <h3>Asosiy muammolar <span class="muted small">(${M.problems.length})</span></h3>
      ${groups.length ? groups.map(g => `<div class="pgroup">
        <div class="pgroup-h"><i style="background:${NX.PROBLEM[g.t].color}"></i><b>${E(NX.PROBLEM[g.t].uz)}</b><span class="pill">${g.items.length}</span></div>
        <ul class="plist">${g.items.slice(0, 3).map(p => `<li><button class="link" data-act="problem" data-id="${p.id}">${E(p.title)}</button><small>${E(p.detail)}</small></li>`).join('')}</ul>
        ${g.items.length > 3 ? `<p class="muted small">yana ${g.items.length - 3} ta — xaritada “Muammolar” qatlamida</p>` : ''}</div>`).join('') : '<p class="muted">Qoidalar boʻyicha muammo topilmadi.</p>'}
      <p class="src-line">${B('osm')} ${B('hisob')} ${k.measured ? B('tomtom') : ''}</p>
    </section>
    ${aiBox(S, examples)}
    <section class="card subtle">
      <p class="small">Koʻcha haqida batafsil maʼlumot va “Agar…?” simulyatsiyasi uchun xaritada istalgan koʻchani bosing.</p>
      <button class="btn" data-act="how">Qanday ishlaydi?</button>
    </section>`;
  }

  const kpi = (t, v, sub, src) => `<div class="kpi"><span class="kpi-t">${t}</span><b class="kpi-v">${v}</b><span class="kpi-s">${E(sub)}</span>${B(src)}</div>`;

  function exampleQuestions(M) {
    const named = M.namedStreets.filter(s => s.rank >= 4);
    const byRisk = named.slice().sort((a, b) => b.risk.value - a.risk.value);
    const byBus = named.slice().sort((a, b) => b.busRefs.length - a.busRefs.length);
    const out = [];
    const dag = M.namedStreets.find(s => /dagbit|дагбит/i.test(s.name + ' ' + s.alt.join(' ')));
    if (dag) out.push(`${dag.name.replace(/koʻchasi$/i, 'koʻchasini').replace(/ko'chasi$/i, "ko'chasini")} bir tomonlama qilsak nima boʻladi?`);
    if (byRisk[0] && byRisk[0] !== dag) out.push(`“${byRisk[0].name}” bir tomonlama qilinsa nima boʻladi?`);
    if (byBus[0] && byBus[0].busRefs.length) out.push(`“${byBus[0].name}”da avtobus polosasi ajratilsa nima boʻladi?`);
    if (byRisk[1]) out.push(`“${byRisk[1].name}” avtomobillar uchun yopilsa qaysi koʻchalar tirbandlashadi?`);
    return out.slice(0, 3);
  }

  function aiBox(S, examples) {
    const a = S.ai;
    const hasKey = !!(NX.store.get('key:openai', '') || '').trim();
    let out = '';
    if (a.busy) out = `<div class="ai-out"><div class="spinner sm"></div> ${E(a.busy)}</div>`;
    else if (a.answer) {
      const r = a.answer;
      out = `<div class="ai-out">
        <div class="ai-meta">${B(r.src)} ${r.model ? `<span class="muted small">${E(r.model)}</span>` : ''}${r.street ? ` <span class="muted small">Aniqlangan koʻcha: <b>${E(r.street.name)}</b></span>` : ''}</div>
        ${r.error ? `<p class="alert">${E(r.error)} Quyida hisoblangan raqamlardan tuzilgan javob.</p>` : ''}
        ${r.note ? `<p class="muted small">${E(r.note)}</p>` : ''}
        <div class="ai-text">${NX.ai.render(r.text)}</div>
        ${r.sim ? `<p class="muted small">${E(DISCLAIMER)}</p>` : ''}</div>`;
    }
    return `<section class="card" id="aiBox">
      <h3>AI tahlilchi ${B('ai')}</h3>
      <p class="muted small">${hasKey ? 'Savolingizni oʻzbek tilida yozing. Koʻcha nomi va oʻzgarish turi aniqlansa, avval simulyatsiya ishga tushadi.' : 'OpenAI kaliti kiritilmagan: javob faqat hisoblangan raqamlardan avtomatik tuziladi. Kalitni “Sozlamalar”da kiritishingiz mumkin.'}</p>
      <form data-form="ai" class="ai-form">
        <textarea name="q" rows="2" placeholder="Masalan: … koʻchasini bir tomonlama qilsak nima boʻladi?" aria-label="Savol">${E(a.q || '')}</textarea>
        <button class="btn primary" ${a.busy ? 'disabled' : ''}>Soʻrash</button>
      </form>
      <div class="chips">${examples.map(q => `<button class="chip" data-act="ask" data-q="${E(q)}">${E(q)}</button>`).join('')}</div>
      ${out}
    </section>`;
  }

  // ---------- Koʻcha paneli ----------
  function street(S, s) {
    const M = S.model, H = NX.HW[s.hw], tt = s.tomtom;
    const km = s.length / 1000;
    const stopNames = [...new Set(s.stops.map(x => x.name).filter(Boolean))];
    const oneLbl = s.oneway === 'yes' ? 'Bir tomonlama' : s.oneway === 'mixed' ? 'Qisman bir tomonlama' : 'Ikki tomonlama';
    const lanes = s.lanes ? `${s.lanes} ${B('osm')}` : `belgilanmagan; modelda ${s.lanesPerDir} ta/tomon ${B('hisob')}`;
    const fc = NX.forecast.next24(s);
    const lowShare = fc.filter(p => p.low).length;
    const rp = s.risk.parts;
    return `
    <button class="back" data-act="home">← Umumiy koʻrinish</button>
    <section class="card">
      <h2>${streetName(s)}</h2>
      <p class="muted">${E(H.uz)} · ${F.km(s.length)} ${B('osm')}</p>
      <dl class="facts">
        <dt>Harakat</dt><dd>${oneLbl} ${B('osm')}</dd>
        <dt>Polosalar</dt><dd>${lanes}</dd>
        <dt>Tezlik chegarasi</dt><dd>${s.maxspeed ? s.maxspeed + ' km/soat ' + B('osm') : '<span class="muted">belgilanmagan</span>'}</dd>
        <dt>Avtobus liniyalari</dt><dd class="refs">${refBadges(M, s.busRefs, s.routes)}</dd>
        <dt>Bekatlar</dt><dd>${s.stops.length} ta${stopNames.length ? `<br><small class="muted">${E(stopNames.slice(0, 6).join(', '))}${stopNames.length > 6 ? '…' : ''}</small>` : ''}</dd>
        <dt>Svetoforlar</dt><dd>${s.signals.length} ta (${F.num(s.signals.length / Math.max(km, 0.01), 1)}/km)</dd>
        <dt>Piyoda oʻtishlar</dt><dd>${s.crossings.length} ta</dd>
        <dt>Yaqin maktab/bogʻcha (150 m)</dt><dd>${s.schools.length ? s.schools.map(o => E(o.name || (o.kind === 'kindergarten' ? 'Bogʻcha' : 'Maktab')) + (o.safe ? '' : ' <span class="tag r">xavfsiz oʻtish yoʻq</span>')).join('<br>') : '0'}</dd>
      </dl>
    </section>
    <section class="card">
      <h3>Joriy tirbandlik ${B('tomtom')}</h3>
      ${tt ? `<div class="meas ${congCls(tt.congestion)}"><b>${F.pct(tt.congestion)}</b><span>tirbandlik</span></div>
        <p class="small">Joriy tezlik: <b>${F.num(tt.currentSpeed, 0)} km/soat</b> · erkin oqim: <b>${F.num(tt.freeFlowSpeed, 0)} km/soat</b><br>
        <span class="muted">Oʻlchangan: ${F.time(tt.ts)} · ${tt.points} nuqta · ishonch ${F.num((tt.confidence || 0) * 100, 0)}%${tt.closed ? ' · <b>yoʻl yopiq</b>' : ''}</span></p>`
        : '<p class="muted small">Bu koʻcha hali oʻlchanmagan.</p>'}
      <button class="btn" data-act="measure" data-id="${s.id}" ${S.measuring ? 'disabled' : ''}>${S.measuring === s.id ? 'Oʻlchanmoqda…' : 'Hozir oʻlchash (TomTom)'}</button>
      ${S.measureErr ? `<p class="alert">${E(S.measureErr)}</p>` : ''}
    </section>
    <section class="card">
      <h3>Tirbandlik xavfi ${B('hisob')}</h3>
      <div class="risk"><div class="risk-bar"><i style="width:${s.risk.value}%;background:${NX.map.col(s.risk.value, 35, 60)}"></i></div><b>${s.risk.value}/100</b></div>
      <p class="muted small">Bu oʻlchov emas, qoidaga asoslangan taxmin: koʻcha turi ${rp.turi} + avtobus liniyalari ${rp.avtobus} + svetofor zichligi ${F.num(rp.svetofor, 0)} + 1 polosa/tomon ${rp.polosa} + bekatlar ${F.num(rp.bekat, 0)}.${tt ? ' Xaritada TomTom oʻlchovi koʻrsatiladi.' : ''}</p>
    </section>
    <section class="card">
      <h3>Keyingi 24 soat bashorati ${B('bashorat')}</h3>
      ${NX.chart.forecastChart(fc, { now: 0, title: 'Keyingi 24 soat' })}
      ${lowShare ? `<p class="lowconf">maʼlumot kam → ishonch past <span class="muted">(${lowShare}/24 soatda TomTom namunasi 3 tadan kam; tipik profil ishlatildi)</span></p>` : ''}
    </section>
    ${whatIf(S, s)}`;
  }

  function directionLabels(s) {
    const [ux, uy] = s.axis;
    return { A: NX.geo.compass(ux, uy), B: NX.geo.compass(-ux, -uy) };
  }

  function whatIf(S, s) {
    const d = directionLabels(s), w = S.whatif;
    const sel = w.street === s.id ? w.type : 'oneway-A';
    const opt = (v, t, sub) => `<label class="opt"><input type="radio" name="sc" value="${v}" ${sel === v ? 'checked' : ''}><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;
    const ow = s.oneway === 'yes' ? 'Yoʻnalishni belgilash' : 'Bir tomonlama';
    const res = S.sim.last && S.sim.last.street === s.id ? simResult(S, S.sim.last) : '';
    return `<section class="card" id="whatif">
      <h3>Agar…? ${B('bashorat')}</h3>
      <form data-form="whatif" data-id="${s.id}">
        <div class="opts">
          ${opt('oneway-A', `${ow}: ${d.A} tomonga`, 'qarama-qarshi harakat taqiqlanadi')}
          ${opt('oneway-B', `${ow}: ${d.B} tomonga`, '')}
          ${opt('close', 'Avtomobillar uchun yopish', 'piyoda koʻchasiga aylantirish')}
          ${opt('buslane', 'Bitta polosani avtobusga ajratish', 'avtomobil sigʻimi 1 polosaga kamayadi')}
          ${opt('signal', 'Svetoforni qoʻshish/optimallashtirish', 'sigʻim +15%')}
          ${opt('demand', 'Talab +20% (turistik mavsum)', 'butun hudud boʻyicha')}
        </div>
        ${demandSlider(S)}
        <button class="btn primary" ${S.sim.busy ? 'disabled' : ''}>Hisoblash</button>
      </form>
      <div id="simOut">${S.sim.busy ? progress(S.sim.progress) : res}</div>
    </section>`;
  }

  function demandSlider(S) {
    const c = NX.config.demand;
    return `<label class="slider"><span>Talab: <b data-out="demand">${F.int(S.demand)}</b> reys/soat ${B('hisob')}</span>
      <input type="range" name="demand" min="${c.min}" max="${Math.max(c.max, S.demand)}" step="${c.step}" value="${S.demand}" aria-label="Talab, reys/soat">
      <small class="muted">${S.calib ? `Kalibrlangan qiymat: ${F.int(S.calib.best.demand)} (xato ±${F.num(S.calib.best.rmse, 1)} p.p.)` : 'Kalibrlanmagan: natijaning talabga sezgirligini koʻrish uchun surib koʻring.'}</small></label>`;
  }

  const progress = p => `<div class="progress"><div class="spinner sm"></div><span>${E((p && p.label) || 'Hisoblanmoqda')}… ${p ? Math.round(p.p * 100) : 0}%</span><div class="pbar"><i style="width:${p ? Math.round(p.p * 100) : 0}%"></i></div></div>`;

  function simResult(S, last) {
    const r = last.result, v = last.verdict;
    const row = x => `<tr><td>${x.name ? E(x.name) : '<span class="muted">nomsiz yoʻl</span>'}</td><td class="n">${F.int(x.baseVol)}</td><td class="n">${F.int(x.scenVol)}</td><td class="n ${x.dv > 0 ? 'up' : 'down'}">${F.signed(x.dv)}</td><td class="n">${F.num(x.baseVC, 2)}→${F.num(x.scenVC, 2)}</td></tr>`;
    const t = r.target;
    return `<div class="sim">
      <div class="verdict ${VERDICT_CLS[v.level]}"><b>${E(v.label)}</b><span>${E(last.label)} · talab ${F.int(last.demand)} reys/soat</span></div>
      <ul class="reasons">${v.reasons.map(x => `<li>${E(x)}</li>`).join('')}</ul>
      <div class="kpis two">
        ${kpi('Umumiy yoʻl vaqti', F.signed(r.ttChangePct, 1) + '%', `${F.int(r.base.TT)} → ${F.int(r.scen.TT)} avto·soat`, 'bashorat')}
        ${t ? kpi('Shu koʻchada hajm', F.int(t.scenVol), `oldin ${F.int(t.baseVol)} avto/soat · V/C ${F.num(t.baseVC, 2)}→${F.num(t.scenVC, 2)}`, 'bashorat') : kpi('Oʻrtacha tezlik', F.num(r.scen.avgSpeed, 1) + ' km/soat', `oldin ${F.num(r.base.avgSpeed, 1)}`, 'bashorat')}
      </div>
      <h4>Eng koʻp taʼsirlangan koʻchalar</h4>
      ${r.affected.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Koʻcha</th><th class="n">Oldin</th><th class="n">Keyin</th><th class="n">Δ</th><th class="n">V/C</th></tr></thead><tbody>${r.affected.map(row).join('')}</tbody></table></div><p class="muted small">Hajm — avtomobil/soat (ikki yoʻnalish yigʻindisi, koʻcha boʻyicha oʻrtacha). V/C — hajm/sigʻim (eng yuklangan boʻlak).</p>` : '<p class="muted">Sezilarli oʻzgarish yoʻq.</p>'}
      ${r.overloaded.length ? `<p><b>Sigʻimidan oshadigan koʻchalar (${r.overloadedCount}):</b> ${r.overloaded.slice(0, 8).map(x => E(x.name || 'nomsiz yoʻl')).join(', ')}</p>` : ''}
      <p><b>Yoʻnalishi oʻzgarishi kerak boʻlgan liniyalar:</b> ${v.busLines.length ? v.busLines.map(E).join(', ') : 'yoʻq'}</p>
      <p class="muted small">Tarmoq: ${F.int(S.simInfo ? S.simInfo.nodes : 0)} tugun, ${F.int(S.simInfo ? S.simInfo.edges : 0)} qirra, ${S.simInfo ? S.simInfo.zones : 0} zona; MSA ${last.iters} iteratsiya, nisbiy farq ${r.scen.gap != null ? F.num(r.scen.gap * 100, 1) + '%' : '—'}. Taqsimlanmagan reyslar: ${F.int(r.base.unassigned)} → ${F.int(r.scen.unassigned)}.</p>
      <p class="disclaimer">${E(DISCLAIMER)}</p>
      <div class="row-btns"><button class="btn" data-act="clear-sim">Xaritadan tozalash</button><button class="btn" data-act="show-sim">Xaritada koʻrsatish</button></div>
    </div>`;
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
    const fc = NX.forecast.next24(s), day = NX.forecast.dayCurve(s, S.fc.d);
    const n = NX.forecast.forStreet(s.key).length;
    const lowShare = fc.filter(p => p.low).length;
    const options = M.namedStreets.slice().sort((a, b) => a.name.localeCompare(b.name, 'uz')).map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${E(x.name)}</option>`).join('');
    const main = mainStreets(M);
    return `
    <section class="card">
      <h2>Tirbandlik bashorati ${B('bashorat')}</h2>
      <label class="field"><span>Koʻcha</span><select data-input="fc-street">${options}</select></label>
      <p class="muted small">${E(NX.HW[s.hw].uz)} · xavf ${s.risk.value}/100 · TomTom namunalari: <b>${n}</b></p>
      <h4>Keyingi 24 soat</h4>
      ${NX.chart.forecastChart(fc, { now: 0 })}
      ${lowShare ? `<p class="lowconf">maʼlumot kam → ishonch past <span class="muted">(${lowShare}/24 soat)</span></p>` : '<p class="small ok-text">Barcha soatlar uchun kamida 3 ta TomTom namunasi bor.</p>'}
      <h4>${NX.days[S.fc.d]} kuni, soatbay</h4>
      ${NX.chart.forecastChart(day, { now: S.fc.h })}
    </section>
    <section class="card">
      <h3>Xaritada bashorat</h3>
      <div class="row2">
        <label class="field"><span>Kun</span><select data-input="fc-day">${NX.days.map((d, i) => `<option value="${i}" ${i === S.fc.d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="field"><span>Soat: <b data-out="fc-hour">${F.hour(S.fc.h)}</b></span><input type="range" min="0" max="23" step="1" value="${S.fc.h}" data-input="fc-hour" aria-label="Soat"></label>
      </div>
      <p class="muted small">Bu tab ochiq turganda xaritadagi barcha koʻchalar tanlangan kun va soat uchun bashorat qilingan tirbandlik boʻyicha boʻyaladi. Xira chiziqlar — ishonch past.</p>
    </section>
    <section class="card">
      <h3>TomTom oʻlchovlari tarixi ${B('tomtom')}</h3>
      <p class="small">Jami namunalar: <b>${st.samples}</b> · koʻchalar: <b>${st.streets}</b>${st.last ? ` · oxirgisi: ${F.time(st.last)}` : ''}</p>
      <p class="muted small">Har bir oʻlchov {koʻcha, hafta kuni, soat, joriy tezlik, erkin tezlik} koʻrinishida brauzerda saqlanadi. Turli kun va soatlarda oʻlchab borsangiz, bashorat aniqlashadi.</p>
      <button class="btn" data-act="measure-main" ${S.batch ? 'disabled' : ''}>Asosiy ${main.length} ta koʻchani oʻlchash</button>
      ${S.batch ? `<p class="small">${E(S.batch)}</p>` : ''}
      ${S.batchErr ? `<p class="alert">${E(S.batchErr)}</p>` : ''}
      <div class="row-btns"><button class="btn" data-act="hist-export">Tarixni eksport (JSON)</button><label class="btn file">Tarixni import<input type="file" accept="application/json,.json" data-input="hist-import" hidden></label></div>
    </section>
    <section class="card">
      <h3>Modelni kalibrlash ${B('hisob')}</h3>
      <p class="muted small">TomTom bilan oʻlchangan koʻchalarda modeldagi tezlik oʻlchangan tezlikka eng yaqin boʻlishi uchun talab darajasi tanlanadi.</p>
      ${demandSlider(S)}
      <button class="btn" data-act="calibrate" ${S.sim.busy || M.kpi.measured === 0 ? 'disabled' : ''}>${M.kpi.measured ? `Kalibrlash (${M.kpi.measured} ta oʻlchov)` : 'Kalibrlash uchun avval TomTom bilan oʻlchang'}</button>
      ${S.calibBusy ? progress(S.calibBusy) : ''}
      ${S.calib ? calibView(S) : ''}
    </section>`;
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

  NX.views = { loading, error, home, street, routes, routeList, forecast, report, simResult, progress, recommendations, mainStreets, directionLabels, DISCLAIMER };
})();
