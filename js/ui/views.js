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

  // ---------- 3D raqamli egizak ----------
  function twin(S) {
    const T = S.twin || {}, b = T.buildings || [], est = b.length ? Math.round((b.filter(x => x.est).length / b.length) * 100) : 0;
    const mode = NX.map3d.mode(), chip = (m, t) => `<button class="chip${mode === m ? ' on' : ''}" data-act="twin-mode" data-mode="${m}">${t}</button>`;
    const ghi = T.ghi && T.ghi.kwh, fl = T.flood, rain = T.rain;
    const solarTotal = ghi ? b.reduce((t, x) => t + NX.twin.roofKwh(x, ghi), 0) : 0;
    const big = ghi ? b.filter(x => /school|kindergarten|university|hospital|public|government|commercial|retail|office/.test(x.kind) || x.area > 1500).map(x => ({ x, k: NX.twin.roofKwh(x, ghi) })).sort((p, q) => q.k - p.k).slice(0, 8) : [];
    const K = { school: 'Maktab', kindergarten: 'Bogʻcha', university: 'Universitet', hospital: 'Shifoxona', public: 'Jamoat binosi', government: 'Davlat idorasi', commercial: 'Savdo', retail: 'Doʻkon', office: 'Ofis', apartments: 'Koʻp qavatli uy' };
    return `
    <section class="card">
      <h2>🏙 Raqamli egizak — 3D shahar</h2>
      <p class="small muted">Binolar OpenStreetMap’dan, balandligi qavatlar soni boʻyicha. Sichqoncha: oʻng tugma — aylantirish, gʻildirak — yaqinlashtirish.</p>
      ${T.busy ? `<p class="small"><span class="spinner sm"></span> ${E(T.busy)}…</p>` : ''}
      ${T.err ? `<p class="small bad-text">⚠️ ${E(T.err)}</p>` : ''}
      ${b.length ? `<div class="atiles">${[[F.int(b.length), 'bino'], [est + '%', 'qavati nomaʼlum'], [ghi ? F.int(ghi) : '—', 'kVt·soat/m² yiliga quyosh'], [rain ? rain.d24 + ' mm' : '—', 'yomgʻir, 24 soat']].map(([v, l]) => `<div class="atile"><b>${v}</b><small>${l}</small></div>`).join('')}</div>` : ''}
      <div class="chips">${chip('height', '🏢 Balandlik')}${chip('solar', '☀️ Quyosh')}${chip('flood', '🌧 Suv toshqini')}${chip('quake', '🏚 Zilzila')}${chip('plan', '🏗 Yangi bino va soya')}</div>
      <div class="row-btns"><button class="btn xs" data-act="twin-base" data-base="sat">🛰 Sunʼiy yoʻldosh</button><button class="btn xs" data-act="twin-base" data-base="street">🗺 Xarita</button></div>
    </section>
    ${twinChat(S)}
    <section class="card">
      <h3>🌧 Suv toshqini xavfi ${B('meteo')}</h3>
      ${rain ? `<p>${rain.d24 >= 20 ? '🔴' : rain.d24 >= 8 ? '🟠' : '🟢'} Keyingi 24 soatda <b>${rain.d24} mm</b>, 48 soatda ${rain.d48} mm yogʻin kutilmoqda${rain.maxH ? ` (eng kuchlisi soatiga ${rain.maxH} mm, ${(d => ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'][d.getUTCDay()] + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':00')(new Date(rain.maxAt + 5 * 3600e3))})` : ''}.</p>` : '<p class="small muted">Yogʻin prognozi olinmoqda…</p>'}
      ${fl ? `<p class="small">Relyef boʻyicha katta maydondan suv oqib keladigan va sekin oqadigan <b>${fl.basins}</b> ta joy bor. Shahar balandligi ${Math.round(fl.zmin)}–${Math.round(fl.zmax)} m.</p>
        <h4>⏱ 2D fizik model — suv vaqt boʻyicha</h4>
        ${T.climate ? `<p class="small muted">Taqqoslash uchun: 1991-yildan beri Samarqanddagi eng kuchli kunlik yogʻin — <b>${T.climate.top[0].p} mm</b> (${T.climate.top[0].t}); 20 mm dan koʻp yomgʻirli kunlar yiliga oʻrtacha ${F.num(T.climate.years.reduce((t, o) => t + o.wet20, 0) / T.climate.years.length, 1)} ta (ERA5).</p>` : ''}
        <p class="small"><b>Agar 1 soat ichida shuncha yomgʻir yogʻsa</b> (bosing — suv qanday tarqalishi soatma-soat hisoblanadi, ~10 soniya):</p>
        <div class="chips">${[10, 30, 50, 80, 120].map(mm => `<button class="chip${T.dyn && T.dyn.label === mm + ' mm, 1 soatda' ? ' on' : ''}" data-act="twin-rain" data-mm="${mm}" ${T.dynBusy ? 'disabled' : ''}>${mm} mm</button>`).join('')}<button class="chip" data-act="twin-forecast" ${T.dynBusy ? 'disabled' : ''}>🌦 Real prognoz boʻyicha (24 soat)</button></div>
        ${T.dynBusy ? `<p class="small"><span class="spinner sm"></span> <span id="dynBusy">${E(T.dynBusy)}…</span></p>` : ''}
        ${T.dyn ? dynInfo(S) : ''}
        ${T.scen && !T.dyn ? `<p><b>${T.scen.rain} mm</b> yomgʻirda (1 soatda): ${T.scen.mode === 'street' ? `<b>${T.scen.km} km</b> koʻchada 10 sm dan chuqur suv` : `~<b>${T.scen.areaHa} ga</b> da 10 sm+ suv`}, <b>${T.scen.buildings}</b> ta bino oldida 20 sm+${T.scen.critical.length ? `, shu jumladan: ${T.scen.critical.map(E).join(', ')}` : ''}.</p>
          ${T.scen.streets.length ? `<ul class="locs">${T.scen.streets.slice(0, 10).map(x => `<li class="locrow"><button class="loc" ${x.at ? `data-act="twin-fly" data-lat="${x.at[0]}" data-lon="${x.at[1]}"` : ''}>💧 <b>${E(x.name)}</b> <small class="muted">— ${Math.round(x.max * 100)} sm gacha, ${F.int(x.len)} m</small></button></li>`).join('')}</ul>` : '<p class="small ok-text">Koʻchalarda suv toʻplanmaydi.</p>'}
          <p class="plan-leg small"><span><i style="background:#7dd3fc"></i>&lt;30 sm</span><span><i style="background:#2563eb"></i>30–60 sm</span><span><i style="background:#1e3a8a"></i>&gt;60 sm</span><span><i style="background:#60a5fa;border-radius:2px"></i>suv yetadigan bino</span></p>
          ${T.scen.mode !== 'street' ? '<p class="small warn-line">⚠️ Shahar koʻchalari hali yuklanmadi — natija relyef kataklari boʻyicha.</p>' : ''}` : ''}
        <p class="small muted">Relyef: ${E(fl.src || '')}, 60 m katak. Model: soatiga ${NX.systems.get('sewer') ? 15 : 10} mm ni kanalizatsiya olib ketadi, qolganining 70% i asfalt va tomlardan oqib, relyef boʻylab past koʻchalarga yigʻiladi; chuqurlik — Manning formulasi (koʻcha 20 m). Daryo va kanal oʻzanlari hisobga kirmaydi. Kanalizatsiya xaritasi “Tizimlar”da yuklansa, aniqroq boʻladi.</p>` : ''}
    </section>
    ${climateCard(T)}
    <section class="card">
      <h3>☀️ Tomlardagi quyosh energiyasi ${B('meteo')}</h3>
      ${ghi ? `<p>Samarqandda ${T.ghi.year}-yilda 1 m² ga <b>${F.int(ghi)} kVt·soat</b> quyosh nuri tushgan (oʻlchov arxivi).</p>
        <p>Barcha tomlarga panel qoʻyilsa: <b>~${F.num(solarTotal / 1e6, 1)} mln kVt·soat/yil</b> (${F.int(solarTotal / 2500)} ta xonadonning yillik isteʼmoli, 2 500 kVt·soat deb).</p>
        ${big.length ? `<h4>Eng katta tomlar (davlat va jamoat binolari)</h4><ul class="locs">${big.map(({ x, k }) => `<li class="locrow"><button class="loc" data-act="twin-fly" data-lat="${x.c[0]}" data-lon="${x.c[1]}">☀️ ${E(x.name || K[x.kind] || 'Bino')} <small class="muted">— ~${F.int(k)} kVt·soat/yil, ${F.int(x.area)} m²</small></button></li>`).join('')}</ul>` : ''}
        <p class="small muted">Hisob: tomning 60% i foydali, panel FIK 18%, yoʻqotishlar 20%. Tom qiyaligi va soyasi hisobga olinmagan.</p>` : '<p class="small muted">Quyosh nurlanishi maʼlumoti olinmoqda…</p>'}
    </section>
    <section class="card">
      <h3>🏗 Yangi bino va uning soyasi</h3>
      ${S.area && S.area.res && S.area.res.shadow ? `<p>Rejadagi bino: ${S.area.spec.flats} xonadon, ${S.area.spec.floors} qavat (~${Math.round(S.area.spec.floors * 3.2)} m). Qishda (21-dekabr, 9:00–15:00) <b>${S.area.res.shadow.shaded.length}</b> ta qoʻshni bino soyada qoladi.</p>
        <ul class="small">${S.area.res.shadow.list.filter(s => s.sun.alt > 2).map(s => `<li>${E(s.label)}, ${s.hour}:00 — quyosh ${Math.round(s.sun.alt)}°, soya ~${Math.round(Math.min(400, S.area.spec.floors * 3.2 / Math.tan(s.sun.alt * Math.PI / 180)))} m</li>`).join('')}</ul>
        <p class="small muted">Binafsha — rejadagi bino, kulrang — qishki soya va soyada qoladigan binolar (“🏗 Yangi bino va soya” rejimi).</p>`
        : '<p class="small muted">Xarita boʻlimida “✏️ Hudud belgilash” → AI’ga “… xonadonli … qavatli dom qursam?” deb yozing — bino va soyasi shu yerda 3D koʻrinadi.</p>'}
    </section>`;
  }

  // Oylar boʻyicha yogʻin: ERA5 meʼyori (ustun) va Oʻzgidromet ochiq maʼlumoti (nuqta, data.egov.uz)
  function monthChart(C) {
    const G = NX.twin.EGOV_RAIN, a = C.monthNorm || [], b = G.samarqand, W = 320, H = 120, mx = Math.max(...a, ...b, 10) * 1.1, bw = (W - 30) / 12;
    const Y = v => H - 18 - (v / mx) * (H - 28), M = ['Ya', 'F', 'Mr', 'Ap', 'My', 'Iy', 'Il', 'Av', 'S', 'O', 'N', 'D'];
    let g = `<svg viewBox="0 0 ${W} ${H}" class="clim-svg" role="img">`;
    a.forEach((v, i) => { g += `<rect x="${24 + i * bw + 3}" y="${Y(v)}" width="${bw - 6}" height="${Math.max(0, H - 18 - Y(v))}" fill="#16a34a" opacity=".55"/>`; });
    b.forEach((v, i) => { g += `<circle cx="${24 + i * bw + bw / 2}" cy="${Y(v)}" r="3.5" fill="#7c3aed"/>`; });
    g += M.map((m, i) => `<text x="${24 + i * bw + bw / 2}" y="${H - 5}" font-size="9" text-anchor="middle" fill="#64748b">${m}</text>`).join('') + `<text x="2" y="10" font-size="9" fill="#64748b">${Math.round(mx)} mm</text></svg>`;
    const sum = b.reduce((t, v) => t + v, 0), wet = ['dekabr–mart'];
    return `<p class="small"><b>Oylar boʻyicha yogʻin</b></p>${g}
      <p class="plan-leg small"><span><i style="background:#16a34a;opacity:.6;border-radius:0"></i>meʼyor 1991–2020 (ERA5)</span><span><i style="background:#7c3aed"></i>Oʻzgidromet${G.yil ? ', ' + G.yil : ''} (data.egov.uz)</span></p>
      <p class="small">Oʻzgidromet maʼlumotida yil boʻyi ${F.num(sum, 0)} mm; eng koʻp — dekabr (${b[11]} mm) va mart (${b[2]} mm), iyul–sentabr — 0 mm. Toshqin xavfi asosan ${wet[0]} oylarida.</p>`;
  }

  // Iqlim kartasi: yillik harorat va yogʻin (ERA5) + Oʻzgidromet meʼyori
  function climateCard(T) {
    const C = T.climate, D = NX.twin.UZHYDROMET;
    const chart = (vals, norm, docNorm, color, bars, unit) => {
      const W = 320, H = 110, pad = 22, n = vals.length, mn = Math.min(...vals, norm, docNorm) * (bars ? 0 : 0.98), mxv = Math.max(...vals, norm, docNorm) * 1.02;
      const X = i => pad + (i * (W - pad - 4)) / Math.max(1, n - 1), Y = v => H - 16 - ((v - mn) / (mxv - mn || 1)) * (H - 26);
      let g = `<svg viewBox="0 0 ${W} ${H}" class="clim-svg" role="img">`;
      if (bars) vals.forEach((v, i) => { g += `<rect x="${X(i) - 3}" y="${Y(v)}" width="6" height="${Math.max(0, H - 16 - Y(v))}" fill="${color}" opacity=".85"/>`; });
      else g += `<polyline points="${vals.map((v, i) => X(i) + ',' + Y(v)).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>` + vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="2" fill="${color}"/>`).join('');
      g += `<line x1="${pad}" x2="${W - 4}" y1="${Y(norm)}" y2="${Y(norm)}" stroke="#dc2626" stroke-width="1.5"/><line x1="${pad}" x2="${W - 4}" y1="${Y(docNorm)}" y2="${Y(docNorm)}" stroke="#7c3aed" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      g += `<text x="${pad}" y="${H - 3}" font-size="9" fill="#64748b">${C.years[0].y}</text><text x="${W - 26}" y="${H - 3}" font-size="9" fill="#64748b">${C.years[n - 1].y}</text><text x="2" y="10" font-size="9" fill="#64748b">${Math.round(mxv)}${unit}</text></svg>`;
      return g;
    };
    return `<section class="card">
      <h3>🌡 Samarqand iqlimi (1991–${C ? C.years[C.years.length - 1].y : '…'})</h3>
      ${C ? `<p class="small">Oʻrtacha harorat har 10 yilda <b>${C.trend10 > 0 ? '+' : ''}${C.trend10}°C</b> ga oʻzgarmoqda. Meʼyor (1991–2020): ${C.tNorm}°C, yogʻin ${C.pNorm} mm (ERA5).</p>
        <p class="small"><b>Yillik harorat</b></p>${chart(C.years.map(o => o.t), C.tNorm, D.samarqand_harorat_meyori_c, '#ea580c', false, '°')}
        <p class="small"><b>Yillik yogʻin</b></p>${chart(C.years.map(o => o.p), C.pNorm, D.samarqand_yogin_meyori_mm, '#16a34a', true, ' mm')}
        <p class="plan-leg small"><span><i style="background:#dc2626;border-radius:0;height:3px"></i>meʼyor (ERA5)</span><span><i style="background:#7c3aed;border-radius:0;height:3px"></i>meʼyor (Oʻzgidromet)</span></p>
        ${monthChart(C)}
        <p class="small"><b>Eng kuchli yomgʻirli kunlar:</b> ${C.top.slice(0, 5).map(x => `${x.t} — ${x.p} mm`).join('; ')}</p>` : '<p class="small muted">Iqlim arxivi yuklanmoqda…</p>'}
      <p class="small"><b>Oʻzgidromet (2024-yil):</b> ${E(D.yil2024)}. ${E(D.sel)}.</p>
      <p class="small muted">Manba: Open-Meteo arxivi (ERA5 qayta tahlili, ~25 km — kuchli jalalarni biroz kamaytirib koʻrsatadi); ${E(D.manba)} — meʼyorlar hujjat grafigidan taxminan oʻqilgan.</p>
    </section>`;
  }

  // 2D model natijasi: vaqt shkalasi, ▶, shu paytdagi holat va koʻchalar (eng chuqur payti bilan)
  function dynInfo(S) {
    const T = S.twin, R = T.dyn, f = R.frames[T.dynFrame] || R.frames[0];
    const tl = t => (R.t0ms ? new Date(R.t0ms + t * 1000 + 5 * 3600e3).toISOString().slice(11, 16) : `+${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`);
    return `<div id="dynInfo" class="dyn">
      <p class="small"><b>${E(R.label)}</b> · eng yuqori payt: <b>${tl(R.peak.t)}</b> — ${R.peak.km} km koʻchada 10 sm+ suv · ${R.buildings} ta binoga suv yetadi${R.critical.length ? ` (${R.critical.map(E).join(', ')})` : ''}</p>
      <div class="dyn-bar"><button class="btn xs" data-act="twin-play">${T.playing ? '⏸' : '▶'}</button><input type="range" min="0" max="${R.frames.length - 1}" value="${T.dynFrame}" data-input="twin-t" aria-label="Vaqt"><b>${tl(f.t)}</b></div>
      <p class="small">Shu paytda: <b>${f.km} km</b> koʻchada 10 sm dan chuqur suv.</p>
      ${R.streets.length ? `<ul class="locs">${R.streets.slice(0, 10).map(x => `<li class="locrow"><button class="loc" ${x.at ? `data-act="twin-fly" data-lat="${x.at[0]}" data-lon="${x.at[1]}"` : ''}>💧 <b>${E(x.name)}</b> <small class="muted">— ${Math.round(x.max * 100)} sm gacha, ${tl(x.t)} da, ${F.int(x.len)} m</small></button></li>`).join('')}</ul>` : '<p class="small ok-text">Koʻchalarda suv toʻplanmaydi.</p>'}
      <p class="plan-leg small"><span><i style="background:#7dd3fc"></i>&lt;30 sm</span><span><i style="background:#2563eb"></i>30–60 sm</span><span><i style="background:#1e3a8a"></i>&gt;60 sm</span><span><i style="background:#60a5fa;border-radius:2px"></i>suv yetadigan bino</span></p>
      <p class="small muted">LISFLOOD-FP usuli: har ${R.steps ? Math.round((R.frames[R.frames.length - 1].t) / R.steps) : '—'} soniyada suv sathi va oqim hisoblandi (${F.int(R.steps)} qadam), relyef 40 m katak, koʻchalar silliq kanal, binolar toʻsiq.</p>
    </div>`;
  }

  function twinChat(S) {
    const C = S.twinChat || { msgs: [], busy: null };
    const sugg = ['50 mm kuchli yomgʻir yogʻsa qaysi koʻchalarni suv bosadi?', 'Sel boʻlsa (100 mm) qaysi maktab va shifoxonalar xavf ostida?', '8 balli zilzila boʻlsa qaysi binolar koʻproq xavf ostida?'];
    return `<section class="card chat" id="twinChat">
      <h3>🤖 AI tahlil — favqulodda vaziyatlar</h3>
      <p class="small muted">Soʻrang: “… mm yomgʻir yogʻsa?”, “zilzila boʻlsa?” — AI hisoblaydi, natija 3D xaritada koʻrinadi.</p>
      <div class="chat-log">${C.msgs.map(m => m.role === 'user' ? `<div class="chat-msg user"><div class="bubble">${E(m.text)}</div></div>` : `<div class="chat-msg ai"><div class="bubble">${m.src === 'ai' ? '' : `<div class="ai-src warn small">⚠️ AI ishlamadi${m.error ? ': ' + E(m.error) : ''} — saytning oʻz hisobi.</div>`}<div class="ai-text">${NX.ai.render(m.text)}</div></div></div>`).join('')}${C.busy ? `<div class="chat-msg ai"><div class="bubble"><div class="spinner sm"></div> ${E(C.busy)}…</div></div>` : ''}</div>
      <div class="chips">${sugg.map(q => `<button class="chip" data-act="twin-ask" data-q="${E(q)}">${E(q)}</button>`).join('')}</div>
      <form data-form="twin-q" class="chat-form"><textarea name="tq" rows="2" placeholder="Masalan: 70 mm yomgʻir yogʻsa qayerni suv bosadi?" aria-label="Savol" ${C.busy ? 'disabled' : ''}></textarea><button class="btn primary" ${C.busy ? 'disabled' : ''}>Yuborish</button></form>
    </section>`;
  }

  // ---------- Hodisalar (real vaqt) ----------
  function alerts(S) {
    const M = S.model, out = [], W = S.weather && S.weather.data, lvl = S.yandexState && S.yandexState.level;
    if (lvl != null) out.push(lvl >= 7 ? { l: 'r', t: `Shaharda kuchli tirbandlik — ${lvl} ball`, s: 'Yandex' } : lvl >= 5 ? { l: 'a', t: `Tirbandlik oshgan — ${lvl} ball`, s: 'Yandex' } : { l: 'i', t: `Harakat normal — ${lvl} ball`, s: 'Yandex' });
    if (W) NX.weather.roadAdvice(W).filter(a => !/xalal bermaydi/.test(a)).slice(0, 1).forEach(a => out.push({ l: 'a', t: a, s: 'Open-Meteo' }));
    const sc = M.problems.filter(p => p.type === 'school').length, jn = M.problems.filter(p => p.type === 'junction').length;
    const conf = M.problems.filter(p => S.verify[p.id] && S.verify[p.id].res && S.verify[p.id].res.status === 'bad').length;
    const R = S.twin && S.twin.rain;
    if (R && R.d24 >= 8) out.push({ l: R.d24 >= 20 ? 'r' : 'a', t: `24 soatda ${R.d24} mm yomgʻir kutilmoqda — past joylarda suv toʻplanishi mumkin${S.twin.alertScen && S.twin.alertScen.streets.length ? `: ${S.twin.alertScen.streets.slice(0, 3).map(x => x.name).join(', ')} (hisob)` : ''}`, s: 'Open-Meteo', act: 'twin' });
    if (sc) out.push({ l: 'r', t: `${sc} ta maktab/bogʻcha oldida xavfsiz oʻtish yoʻq`, s: 'OSM', act: 'problems' });
    if (jn) out.push({ l: 'a', t: `${jn} ta yirik chorrahada svetofor yoʻq${conf ? ` (${conf} tasi suratda tasdiqlandi)` : ''}`, s: conf ? 'Mapillary + AI' : 'OSM', act: 'problems' });
    if (S.review && S.review.fixed.length) out.push({ l: 'i', t: `${S.review.fixed.length} ta joy suratda tekshirildi — muammo emas, roʻyxatdan olindi`, s: 'Mapillary + AI' });
    NX.systems.loaded().forEach(k => { const d = NX.systems.get(k); out.push({ l: 'i', t: `${NX.SYSTEMS[k].icon} ${NX.SYSTEMS[k].uz}: ${d.stats.features} ta obyekt xaritada`, s: d.shared ? 'umumiy' : 'shu kompyuter' }); });
    return out;
  }
  function alertsCard(S) {
    const a = alerts(S);
    return `<section class="card alerts" id="alerts"><h3>🔔 Hozirgi holat <small class="muted">${S.live && S.live.last ? NX.fmt.time(S.live.last).slice(-5) : ''}</small></h3>
      <ul class="alist2">${a.map(x => `<li class="al-${x.l}">${x.act ? `<button class="link" data-act="tab" data-tab="${x.act}">${E(x.t)}</button>` : E(x.t)} <small class="muted">· ${E(x.s)}</small></li>`).join('') || '<li class="al-i">Hodisa yoʻq.</li>'}</ul>
    </section>`;
  }
  const sysTiles = () => Object.keys(NX.SYSTEMS).filter(k => !NX.SYSTEMS[k].hidden);
  const sysState = k => (k === 'camera' && !NX.systems.get(k) && NX.webcams.get() && NX.webcams.get().length ? ['map', `${NX.webcams.get().length} ta ochiq vebkamera`] : k === 'transport' ? ['on', 'Ulangan · real vaqt'] : NX.systems.get(k) ? ['map', `Xarita: ${NX.systems.get(k).stats.features} ta obyekt`] : ['off', 'Ulanmagan']);
  function systemsGrid() {
    return `<section class="card"><h3>🏙 Shahar tizimlari</h3><div class="sys-grid">${sysTiles().map(k => {
      const S = NX.SYSTEMS[k], st = sysState(k);
      return `<button class="sys-tile ${st[0]}" data-act="tab" data-tab="systems" style="--c:${S.color}"><span class="sys-ico">${S.icon}</span><b>${E(S.uz)}</b><small>${st[1]}</small></button>`;
    }).join('')}</div></section>`;
  }

  // Ochiq vebkameralar (Windy): suratlar va AI tahlili
  function webcamBox(S) {
    const W = S.webcams || {}, list = W.list || [];
    return `<div class="vpart"><b>🌐 Ochiq vebkameralar (Windy.com)</b>
      ${W.busy ? '<p class="small muted"><span class="spinner sm"></span> Qidirilmoqda…</p>' : W.err ? `<p class="small bad-text">⚠️ ${E(W.err)}</p>` : W.list ? (list.length ? '' : '<p class="small">Samarqand atrofida (60 km) ochiq vebkamera topilmadi.</p>') : ''}
      ${list.length ? `<p class="small">${list.length} ta kamera topildi (Samarqanddan 60 km gacha).</p><div class="cams">${list.map(c => { const a = (W.ai || {})[c.id] || {}; return `<div class="cam">
        ${c.preview ? `<a href="${E(c.detail)}" target="_blank" rel="noopener"><img src="${E(c.preview)}" alt="${E(c.title)}" loading="lazy"></a>` : ''}
        <div class="small"><b>${E(c.title)}</b>${c.city ? ` · ${E(c.city)}` : ''}<br><a href="${E(c.detail)}" target="_blank" rel="noopener">Windy.com ↗</a>${c.updated ? ` · <span class="muted">${E(new Date(c.updated).toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand' }))}</span>` : ''}</div>
        <div class="row-btns"><button class="btn xs" data-act="cam-fly" data-lat="${c.lat}" data-lon="${c.lon}">🗺 Xaritada</button>${c.preview ? `<button class="btn xs" data-act="cam-ai" data-id="${E(String(c.id))}" ${a.busy ? 'disabled' : ''}>🤖 Hozirgi kadrni tahlil qil</button>` : ''}</div>
        ${a.busy ? '<p class="small muted"><span class="spinner sm"></span> AI koʻrmoqda…</p>' : a.err ? `<p class="small bad-text">⚠️ ${E(a.err)}</p>` : a.text ? `<div class="ai-text small">${NX.ai.render(a.text)}</div>` : ''}
      </div>`; }).join('')}</div>` : ''}
      <button class="btn xs" data-act="cam-load" ${W.busy ? 'disabled' : ''}>${W.list ? '🔄 Yangilash' : '🔍 Ochiq vebkameralarni topish'}</button>
      <p class="small muted">Faqat egalari hammaga eʼlon qilgan kameralar (Windy katalogi). “Xavfsiz shahar” kameralari — rasmiy ruxsat bilan ulanadi.</p>
    </div>`;
  }

  // ---------- Tizimlar boʻlimi ----------
  function systems(S) {
    const busy = S.sysBusy;
    return `
    <section class="card">
      <h2>🏙 Shahar tizimlari</h2>
      <p class="small muted">Har bir tizim xaritasini bir marta yuklang (GeoJSON, KML yoki CSV) — u xaritada koʻrinadi, AI hudud tahlilida va savollarga javobda foydalanadi. Xodim kodi kiritilgan boʻlsa — barcha xodimlarga koʻrinadi.</p>
    </section>
    ${sysTiles().map(k => {
      const T = NX.SYSTEMS[k], d = NX.systems.get(k), st = sysState(k);
      if (k === 'transport') return `<section class="card sys-card" style="--c:${T.color}"><div class="prob-h"><span class="prob-ico">${T.icon}</span><div><b>${E(T.uz)}</b><small class="ok-text">✅ ${st[1]}</small></div></div>
        <p class="small"><b>Manbalar:</b> ${E(T.sources)}</p><p class="small"><b>AI nima qiladi:</b> ${E(T.ai)}</p></section>`;
      return `<section class="card sys-card" style="--c:${T.color}">
        <div class="prob-h"><span class="prob-ico">${T.icon}</span><div><b>${E(T.uz)}</b><small class="${d ? 'ok-text' : 'muted'}">${d ? `🗺 ${E(d.name)} · ${d.stats.features} ta obyekt${d.stats.km ? ` · ${F.num(d.stats.km, 1)} km` : ''} · ${d.shared ? 'barcha xodimlarga' : 'faqat shu kompyuterda'}` : '⏳ Maʼlumot ulanmagan'}</small></div></div>
        <p class="small"><b>Kerak:</b> ${E(T.need)}</p>
        <p class="small"><b>AI nima qiladi:</b> ${E(T.ai)}</p>
        ${busy === k ? '<p class="small muted"><span class="spinner sm"></span> Yuklanmoqda…</p>' : `<div class="row-btns">
          <label class="btn xs primary file-btn">📂 ${d ? 'Yangilash' : 'Xaritani yuklash'}<input type="file" data-sysfile="${k}" accept=".geojson,.json,.kml,.csv" hidden></label>
          ${d ? `<button class="btn xs" data-act="sys-show" data-sys="${k}">🗺 Xaritada koʻrsatish</button><button class="btn xs" data-act="sys-remove" data-sys="${k}">🗑 Oʻchirish</button>` : ''}</div>`}
        <p class="small muted">Real vaqt (datchiklar, ${k === 'camera' ? 'video oqimi' : 'oʻchishlar, bosim'}): tashkilot API bergach ulanadi.</p>
        ${k === 'camera' ? webcamBox(S) : ''}
      </section>`;
    }).join('')}`;
  }

  // ---------- Dinamik transport: tigʻiz soat ----------
  function dynTInfo(S) {
    const T = S.dynT, r = T.res, sl = r.slices[T.si], list = T.sum.per[T.si].slice(0, 8);
    return `<div id="dynTInfo">
      <div class="dyn-bar"><button class="btn xs" data-act="dyn-play">${T.playing ? '⏸' : '▶'}</button><input type="range" min="0" max="${r.slices.length - 1}" value="${T.si}" data-input="dyn-t" aria-label="Vaqt"><b>${sl.time}</b></div>
      <p class="small">${sl.time} da: talab ${F.int(sl.demand)} mashina/soat, shahar boʻyicha navbatda <b>${F.int(sl.queueVeh)}</b> ta mashina. Eng yomon payt: <b>${r.slices[T.sum.peakSi].time}</b>.</p>
      ${list.length ? `<ul class="small">${list.map(o => `<li><b>${E(S.model.streets[o.s].name)}</b> — ${o.q >= 10 ? `navbat ~${F.int(o.q)} m, ` : ''}tezlik ${Math.round(o.r * 100)}%</li>`).join('')}</ul>` : '<p class="small ok-text">Bu paytda tirbandlik yoʻq.</p>'}
      ${T.sum.streets.length ? `<details class="more"><summary>Navbat qachon boshlanadi (koʻchalar)</summary><ul class="small">${T.sum.streets.slice(0, 12).map(v => `<li><b>${E(v.name)}</b>: ${v.start ? `${v.start} da boshlanadi, ` : ''}eng uzun ${F.int(v.peak)} m — ${v.peakAt}</li>`).join('')}</ul></details>` : ''}
      <p class="plan-leg small"><span><i style="background:#16a34a"></i>erkin</span><span><i style="background:#f59e0b"></i>sekin</span><span><i style="background:#dc2626"></i>tirband</span><span><i style="background:#7f1d1d"></i>toʻxtab qolgan</span><span>qalin — navbat</span></p>
    </div>`;
  }
  function dynCard(S) {
    const T = S.dynT || {};
    return `<section class="card">
      <h3>⏱ Ertalabki tigʻiz soat (07:00–10:00) ${B('bashorat')}</h3>
      <p class="small muted">Dinamik model: har 15 daqiqada haydovchilar yoʻl tanlaydi, sigʻimdan oshgan mashinalar navbatga turadi — tirbandlik qayerda boshlanib, qanday tarqalishi koʻrinadi.</p>
      ${T.busy ? `<p class="small"><span class="spinner sm"></span> <span id="dynTBusy">${E(T.busy)}…</span></p>` : ''}
      ${T.res ? `<p class="small"><b>${E(T.label)}</b> <button class="link" data-act="dyn-clear">✕ yopish</button></p>${dynTInfo(S)}` : `<button class="btn primary wide" data-act="dyn-run" ${T.busy ? 'disabled' : ''}>▶ Tigʻiz soatni hisoblash</button>`}
    </section>`;
  }

  // ---------- Umumiy koʻrinish (Xarita) ----------
  function home(S) {
    const M = S.model;
    const groups = Object.keys(NX.PROBLEM).map(t => ({ t, items: M.problems.filter(p => p.type === t) })).filter(g => g.items.length)
      .sort((a, b) => NX.PROBLEM[b.t].weight - NX.PROBLEM[a.t].weight);
    return `
    ${nowCard(S)}
    ${alertsCard(S)}
    ${systemsGrid()}
    <section class="card">
      <h3>Asosiy muammolar</h3>
      ${groups.length ? `<ul class="top-probs">${groups.slice(0, 4).map(g => `<li><span>${NX.PROBLEM[g.t].icon} ${E(NX.PROBLEM[g.t].short)}</span><b>${g.items.length}</b></li>`).join('')}</ul>
        <button class="btn primary wide" data-act="tab" data-tab="problems">Muammolar va yechimlar →</button>` : '<p class="muted">Muammo topilmadi.</p>'}
    </section>
    ${dynCard(S)}
    <p class="hint-line">👆 Koʻchani bosing → <b>“Nima qilsak?”</b> → oqibatini koʻring.</p>
    <button class="btn wide ai-cta" data-act="tab" data-tab="ai">🤖 AI yordamchi bilan gaplashish</button>`;
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
      : `<div class="status-line"><b>Real tirbandlik — Yandex xaritasida</b> ${B('yandex')}<small>${S.yandexOn ? 'Koʻcha rangiga qarang: yashil — erkin, sariq — sekin, qizil — tirband.' : 'Pastdagi tugma bilan probkalarni oching.'}</small></div>`;
    return `<section class="card">
      <h2>${streetName(s)}</h2>
      <p class="muted">${E(NX.HW[s.hw].uz)} · ${bits.join(' · ')}</p>
      ${status}
      ${hasKey ? `<div class="row-btns"><button class="btn sm" data-act="measure" data-id="${s.id}" ${S.measuring ? 'disabled' : ''}>${S.measuring === s.id ? 'Oʻlchanmoqda…' : tt ? 'Yangilash' : 'Tezligini oʻlchash (TomTom)'}</button></div>` : ''}
      ${S.measureErr && hasKey ? `<p class="alert">${E(S.measureErr)}</p>` : ''}
      ${!S.yandexOn ? '<button class="btn sm primary" data-act="yandex">🚦 Bu koʻchani Yandex probkalarida koʻrish</button>' : ''}
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
    const M = S.model, [sx, sy] = [s.center[0], s.center[1]];
    // Shu koʻchaga tegishli muammolar
    const mine = M.problems.filter(p => p.street === s.id || (p.streets && p.streets.includes(s.id)) || (p.type === 'school' && s.schools.some(o => Math.abs(o.lat - p.lat) < 1e-6 && Math.abs(o.lon - p.lon) < 1e-6)));
    return `
    <button class="back" data-act="home">← Orqaga</button>
    <section class="card">
      <h2>${streetName(s)}</h2>
      <p class="muted">${E(NX.HW[s.hw].uz)} · ${F.km(s.length)} · ${s.oneway === 'yes' ? 'bir tomonlama' : 'ikki tomonlama'}${s.busRefs.length ? ` · ${s.busRefs.length} avtobus liniyasi` : ''}</p>
      ${mine.length ? `<h4>Muammolar</h4><ul class="street-probs">${[...new Set(mine.map(p => p.type))].map(t => { const ps = mine.filter(p => p.type === t); return `<li><button class="link" data-act="problem" data-id="${ps[0].id}">${NX.PROBLEM[t].icon} ${E(NX.PROBLEM[t].short)}${ps.length > 1 ? ` — ${ps.length} ta joy` : ''}</button><small>${E(NX.PROBLEM[t].fix)}</small></li>`; }).join('')}</ul>` : '<p class="small ok-text">Bu koʻchada muammo topilmadi.</p>'}
    </section>
    ${actions(S, s)}
    ${NX.pano.btn(s.center[0], s.center[1], s.name || 'Koʻcha', 'btn wide pano-cta')}
    <button class="btn wide ai-cta" data-act="chat-street-open" data-id="${s.id}">🤖 Bu koʻcha haqida AI bilan gaplashish</button>
    ${streetDetails(S, s)}`;
  }

  // Butun koʻcha yoki uning bir qismi
  function segBar(S, s) {
    const seg = S.segment && S.segment.street === s.id ? S.segment : null, pick = S.segPick && S.segPick.street === s.id ? S.segPick : null;
    if (pick) return `<div class="seg-bar picking">✂️ Xaritada qism <b>${pick.step === 1 ? 'boshini' : 'oxirini'}</b> bosing <span class="muted small">(${pick.step}/2)</span><button class="link" data-act="seg-clear">Bekor qilish</button></div>`;
    if (seg) return `<div class="seg-bar on">✂️ Qism: <b>${E(NX.segment.label(seg))}</b> · ${F.km(seg.len)}<button class="link" data-act="seg-pick" data-id="${s.id}">Qayta tanlash</button><button class="link" data-act="seg-clear">Butun koʻcha</button></div>`;
    return `<div class="seg-bar"><span>Butun koʻcha · ${F.km(s.length)}</span><button class="btn xs" data-act="seg-pick" data-id="${s.id}">✂️ Bir qismini tanlash</button></div>`;
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
      <h3>Nima qilsak? ${B('bashorat')}</h3>
      ${segBar(S, s)}
      <p class="muted small">Variantni bosing — oqibati hisoblanadi.</p>
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
      <div class="row-btns"><button class="btn sm" data-act="show-sim">Xaritada koʻrsatish</button><button class="btn sm" data-act="clear-sim">Xaritadan olib tashlash</button><button class="btn sm" data-act="dyn-sim">⏱ Tigʻiz soatda (dinamik)</button></div>
    </div>`;
  }

  // ---------- Muammolar (jonli kuzatuv + oddiy tilda yechimlar) ----------
  // ---------- “Hozir”: qisqa holat (real: Yandex tirbandlik, ob-havo) ----------
  const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'hozirgina' : m < 60 ? `${m} daqiqa oldin` : F.time(ts).slice(-5); };
  function nowCard(S) {
    const M = S.model, W = S.weather && S.weather.data, yst = S.yandexState;
    const lvl = yst && yst.level != null ? yst.level : null;
    const lvlTxt = lvl == null ? 'xaritada' : `${lvl} ball`;
    const wx = W ? `${NX.weather.codeText(W.code)[1]} ${F.num(W.temp, 0)}°C` : '—';
    return `<section class="card live">
      <div class="now-row">
        <div><small>Tirbandlik</small><b>${lvlTxt}</b></div>
        <div><small>Ob-havo</small><b>${wx}</b></div>
        <div><small>Muammolar</small><b>${M.problems.length}</b></div>
      </div>
    </section>`;
  }

  // ---------- Real surat bilan tekshiruv (Mapillary + AI) ----------
  const VST = { ok: ['✅', 'ok'], bad: ['❌', 'bad'], unknown: ['❔', 'unk'], info: ['📷', 'info'] };
  const FIXBTN = { junction: ['signal', '🚦 Svetofor bor'], school: ['crossing', '🚶 Oʻtish bor'] };
  function verifyBox(S, p) {
    const v = S.verify[p.id] || {}, r = v.res, FIX = FIXBTN[p.type];
    if (v.busy) return `<div class="vbox"><div class="spinner sm"></div> Real suratlar tekshirilmoqda…</div>`;
    if (v.err) return `<div class="vbox"><p class="small bad-text">⚠️ ${E(v.err)}</p><button class="btn xs" data-act="verify" data-pid="${p.id}">Qayta urinish</button></div>`;
    if (!r) return '';
    const st = VST[r.status] || VST.info;
    const sub = (k, label) => {
      const x = v[k] || {};
      if (x.busy) return `<div class="vpart"><div class="spinner sm"></div> ${label}…</div>`;
      if (x.err) return `<div class="vpart small bad-text">⚠️ ${E(x.err)}</div>`;
      return '';
    };
    return `<div class="vbox">
      <p class="vverdict ${st[1]}">${st[0]} ${E(r.text)}</p>
      ${r.photo ? `<a class="vphoto" href="${E(r.photo.link)}" target="_blank" rel="noopener"><img src="${E(r.photo.url)}" alt="Joyning real surati" loading="lazy"><span>📷 Real surat · ${E(r.photo.when)} · ${r.photo.d} m · Mapillary ↗</span></a>` : ''}
      ${r.status === 'ok' && FIX ? `<button class="btn xs primary" data-act="fix" data-fix="${FIX[0]}" data-pid="${p.id}">${FIX[1]} — xaritani tuzatish</button>` : ''}
      <div class="vacts">
        ${r.photo ? `<button class="btn xs" data-act="verify-ai" data-pid="${p.id}" ${v.ai && v.ai.busy ? 'disabled' : ''}>🤖 AI suratni tahlil qilsin</button>` : ''}
        <button class="btn xs" data-act="verify-web" data-pid="${p.id}" ${v.web && v.web.busy ? 'disabled' : ''}>🌐 Internetdan qidirish</button>
        <button class="btn xs" data-act="verify-img" data-pid="${p.id}" ${v.img && v.img.busy ? 'disabled' : ''}>🎨 Yechim rasmi (AI)</button>
      </div>
      ${sub('ai', 'AI suratni koʻrmoqda')}${v.ai && v.ai.text ? `<div class="vpart"><b>🤖 AI tahlili</b><div class="ai-text">${NX.ai.render(v.ai.text)}</div></div>` : ''}
      ${sub('web', 'Internetdan qidirilmoqda')}${v.web && v.web.text != null ? `<div class="vpart"><b>🌐 Ochiq manbalar</b><div class="ai-text">${NX.ai.render(v.web.text || 'Hech narsa topilmadi.')}</div>${v.web.sources.length ? `<ul class="vsrc">${v.web.sources.map(x => `<li><a href="${E(x.url)}" target="_blank" rel="noopener">${E(x.title)}</a></li>`).join('')}</ul>` : ''}</div>` : ''}
      ${sub('img', 'AI rasm chizmoqda (1 daqiqagacha)')}${v.img && v.img.src ? `<figure class="vgen"><img src="${v.img.src}" alt="AI chizgan yechim"><figcaption>🎨 <b>AI rasm — haqiqiy emas.</b> ${v.img.edited ? 'Real surat ustiga taklif qilingan yechim chizilgan.' : 'Taklif qilingan yechimning taxminiy koʻrinishi.'}</figcaption></figure>` : ''}
    </div>`;
  }
  function locRow(S, p) {
    const FIX = FIXBTN[p.type], v = S.verify[p.id], st = v && v.res ? VST[v.res.status] : null, open = S.verifyOpen === p.id;
    return `<li class="locrow${S.focusPid === p.id ? ' on' : ''}${open ? ' open' : ''}" data-row="${p.id}"><button class="loc" data-act="problem" data-id="${p.id}"><span aria-hidden="true">${st ? st[0] : '📍'}</span>${E(p.title)}</button>
        <div class="loc-acts">${NX.mly.available() ? `<button class="btn xs${open ? ' primary' : ''}" data-act="verify" data-pid="${p.id}">🔎 Tekshirish</button>` : ''}${NX.pano.btn(p.lat, p.lon, p.title, 'btn xs', '📷')}${FIX ? `<button class="btn xs" data-act="fix" data-fix="${FIX[0]}" data-pid="${p.id}">${FIX[1]}</button>` : ''}<button class="btn xs" data-act="fix" data-fix="dismiss" data-pid="${p.id}">Muammo emas</button></div>
        ${open ? verifyBox(S, p) : ''}</li>`;
  }
  function verifySummary(S, items) {
    const b = S.verifyBatch && S.verifyBatch.type === items[0].type ? S.verifyBatch : null;
    const done = items.filter(p => S.verify[p.id] && S.verify[p.id].res);
    if (!b && !done.length) return '';
    const n = k => done.filter(p => S.verify[p.id].res.status === k).length;
    return `<p class="vsum small">${b && b.busy ? `<span class="spinner sm"></span> Tekshirilmoqda: ${b.done}/${b.total} · ` : ''}✅ ${n('ok')} ta joyda bor · ❌ ${n('bad')} ta tasdiqlandi · ❔ ${n('unknown')} ta surat yoʻq</p>`;
  }

  // Koʻchalar darajasi teng boʻlsa — oqimi kattasi asosiy yoʻl
  function effP(S, p) {
    const v = S.verify[p.id] || {}, M = S.model;
    if (!v.flows || p.major == null || p.minor == null || M.streets[p.major].rank !== M.streets[p.minor].rank) return p;
    const f = sid => (v.flows.find(x => x.street === sid) || {}).flow || 0;
    return f(p.minor) > f(p.major) * 1.3 ? Object.assign({}, p, { major: p.minor, minor: p.major }) : p;
  }

  // ---------- Bitta muammo: faqat shu joy haqida ----------
  function problem(S, p0) {
    const p = effP(S, p0);
    const meta = NX.PROBLEM[p.type], v = S.verify[p.id] || {}, r = v.res, FIX = FIXBTN[p.type];
    const st = r ? VST[r.status] || VST.info : null;
    const busy = (x, t) => (x && x.busy ? `<p class="small muted"><span class="spinner sm"></span> ${t}…</p>` : x && x.err ? `<p class="small bad-text">⚠️ ${E(x.err)}</p>` : '');
    const plan = (p.type === 'junction' || p.type === 'priority' || p.type === 'school') ? NX.plan.svg(S.model, p) : null;
    const M = S.model, nm = sid => (sid != null && M.streets[sid] ? M.streets[sid].name || 'nomsiz yoʻl' : '');
    const fl = sid => { const f = v.flows && v.flows.find(x => x.street === sid); return f && f.flow != null ? f.flow : null; };
    const fq = sid => (fl(sid) != null ? ` (hisob: ~${F.int(fl(sid))} mashina/soat)` : '');
    // Shu chorrahaga xos qadamlar — koʻcha nomlari va oqim bilan
    let steps = meta.steps || [meta.fix];
    if (p.type === 'priority' && p.major != null) steps = [`“Asosiy yoʻl” (2.1) — ${nm(p.major)} boʻylab, chorrahadan oldin har ikki tomonda${fq(p.major)}.`, `“Yoʻl bering” (2.4) va toʻxtash chizigʻi — ${nm(p.minor)} chiqishida${fq(p.minor)}.`, 'Burchakda koʻrinish yopilgan boʻlsa — “STOP” (2.5) va qavariq koʻzgu.', 'Svetofor kerak emas — kichik koʻcha ulanishi.'];
    if (p.type === 'junction' && p.major != null) {
      const a = fl(p.major), b = fl(p.minor), big = a != null && b != null && a >= 600 && b >= 150;
      steps = [`Tigʻiz soatda (8:00–9:00, 17:00–19:00) sanoq: ${nm(p.major)}${fq(p.major)} va ${nm(p.minor)}${fq(p.minor)}.`,
        big ? `Hisob boʻyicha ikkala koʻchada ham oqim katta — svetofor nomzodi: ${p.kind === 'T' ? '2 fazali (asosiy yoʻl / burilish)' : 'har bir tarmoqda'}, toʻxtash chiziqlari va zebra.` : `Hisob boʻyicha ${nm(p.minor)} dan oqim kichik — avval ustuvorlik belgilari: ${nm(p.major)} ga “Asosiy yoʻl” (2.1), ${nm(p.minor)} ga “Yoʻl bering” (2.4). Svetofor sanoq natijasiga koʻra.`,
        p.kind === 'X' ? 'Joy keng boʻlsa — svetofor oʻrniga aylanma harakat (halqa) varianti.' : 'T-shaklida: burilish uchun alohida polosa boʻlsa, tirbandlik kamayadi.'];
    }
    const views = v.views && v.views.list ? v.views.list : [];
    const fig = (x, cap) => x && x.src ? `<figure class="vgen"><img src="${x.src}" alt="AI chizgan yechim"><figcaption>🎨 <b>AI rasm — haqiqiy emas.</b> ${cap}</figcaption></figure>` : '';
    return `
    <button class="back" data-act="problem-close">← Barcha muammolar</button>
    <section class="card prob" style="--c:${meta.color}">
      <div class="prob-h"><span class="prob-ico" aria-hidden="true">${meta.icon}</span><div><b>${E(meta.short)}</b><small>${E(p.title)}</small></div></div>
      ${st ? `<p class="vverdict ${st[1]}">${st[0]} ${E(r.text)}</p>` : v.busy ? '<p class="small muted"><span class="spinner sm"></span> Real suratlar tekshirilmoqda…</p>' : ''}
      <h4>Muammo</h4>
      <p>${E(meta.what)}</p>${p.detail ? `<p class="small muted">${E(p.detail)}</p>` : ''}
      <h4>Nima qilish kerak</h4>
      <ol class="steps">${steps.map(x => `<li>${E(x)}</li>`).join('')}</ol>
      <p class="small muted">Oʻrtacha narxi: ~${F.uzs((p.qty || 1) * meta.cost)}</p>
      <div class="row-btns">${FIX ? `<button class="btn xs" data-act="fix" data-fix="${FIX[0]}" data-pid="${p.id}">${FIX[1]}</button>` : ''}<button class="btn xs" data-act="fix" data-fix="dismiss" data-pid="${p.id}">Muammo emas</button>${NX.pano.btn(p.lat, p.lon, p.title, 'btn xs', '📷 Yandex panorama')}</div>
    </section>
    ${v.sat ? `<section class="card">
      <h3>🛰 Tepadan — real sunʼiy yoʻldosh surati</h3>
      ${v.sat.busy ? '<p class="small muted"><span class="spinner sm"></span> Surat yuklanmoqda…</p>' : v.sat.ok ? `<img class="sat-img" src="${v.sat.data}" alt="Sunʼiy yoʻldosh surati va yechim">` : v.sat.tiles ? `<div class="sat-wrap">${v.sat.tiles.map(t => `<img src="${E(t.url)}" alt="" style="left:${t.left}%;top:${t.top}%;width:${t.size}%;height:${t.size}%">`).join('')}${v.sat.overlay}</div>` : '<p class="small muted">Surat yuklanmadi.</p>'}
      ${v.sat.note ? `<p class="small">${E(v.sat.note)}</p>` : ''}
      <p class="small muted">Surat: Esri World Imagery (real). Belgilar — saytning taklifi. Surat bir necha oy yoki yil oldin olingan boʻlishi mumkin.</p>
    </section>` : ''}
    ${plan ? `<section class="card">
      <h3>📐 Qanday boʻlishi kerak — sxema ${B('osm')}</h3>
      <div class="plan-wrap">${plan.svg}</div>
      <p class="small">${E(plan.note)}</p>
      <p class="plan-leg small">${p.type === 'priority' ? '<span><i class="lg-yd"></i>“Yoʻl bering” (2.4)</span><span><i class="lg-m"></i>“Asosiy yoʻl” (2.1)</span><span><i class="lg-z"></i>toʻxtash chizigʻi</span>' : '<span><i class="lg-y"></i>yangi svetofor</span><span><i class="lg-z"></i>yangi zebra va toʻxtash chizigʻi</span>'}<span><i class="lg-s"></i>mavjud svetofor</span><span><i class="lg-c"></i>mavjud oʻtish</span></p>
      <p class="small muted">Yoʻllar OpenStreetMap’dagi real geometriya va polosalar soni boʻyicha, masshtabda.</p>
    </section>` : ''}
    ${NX.mly.available() ? `<section class="card">
      <h3>📷 Real suratlar — ${views.length ? views.length + ' tomondan' : 'joyning oʻzi'}</h3>
      ${busy(v.views, 'Suratlar olinmoqda')}
      ${views.length ? `<div class="views4">${views.map(x => `<a href="${E(x.link)}" target="_blank" rel="noopener"><img src="${E(x.url)}" alt="${E(x.side)}" loading="lazy"><span>${E(x.side)} · ${E(x.when)}</span></a>`).join('')}</div>`
        : r && r.photo ? `<a class="vphoto" href="${E(r.photo.link)}" target="_blank" rel="noopener"><img src="${E(r.photo.url)}" alt="Real surat" loading="lazy"><span>📷 ${E(r.photo.when)} · Mapillary ↗</span></a>`
        : v.views && !v.views.busy ? '<p class="small muted">Bu joyda Mapillary surati yoʻq.</p>' : ''}
    </section>` : ''}
    ${views.length || (r && r.photo) ? `<section class="card">
      <h3>🤖 AI xulosasi ${B('ai')}</h3>
      ${busy(v.ai, 'AI suratlarni koʻrmoqda')}${v.ai && v.ai.text ? `<div class="ai-text">${NX.ai.render(v.ai.text)}</div>` : ''}
      ${busy(v.web, 'Internetdan qidirilmoqda')}${v.web && v.web.text != null ? `<div class="vpart"><b>🌐 Ochiq manbalar</b><div class="ai-text">${NX.ai.render(v.web.text || 'Hech narsa topilmadi.')}</div>${v.web.sources.length ? `<ul class="vsrc">${v.web.sources.map(x => `<li><a href="${E(x.url)}" target="_blank" rel="noopener">${E(x.title)}</a></li>`).join('')}</ul>` : ''}</div>` : ''}
      ${!v.web ? `<button class="btn xs" data-act="verify-web" data-pid="${p.id}">🌐 Internetdan ham qidirish</button>` : ''}
    </section>` : ''}
    ${NX.ai.available() ? `<section class="card">
      <h3>🎨 Yechim rasmi (AI)</h3>
      <p class="small muted">AI real suratlar${plan ? ' va yuqoridagi reja' : ''} asosida chizadi. ~1 daqiqa.</p>
      <div class="row-btns">${plan ? `<button class="btn xs primary" data-act="pimg" data-mode="top" data-pid="${p.id}" ${v.top && v.top.busy ? 'disabled' : ''}>🛰 Tepadan koʻrinish</button>` : ''}${views.length || (r && r.photo) ? `<button class="btn xs" data-act="pimg" data-mode="photo" data-pid="${p.id}" ${v.photo && v.photo.busy ? 'disabled' : ''}>📷 Real suratga chizish</button>` : ''}</div>
      ${busy(v.top, 'Tepadan koʻrinish chizilmoqda')}${fig(v.top, 'Real yoʻllar rejasi va suratlar asosida, tepadan.')}
      ${busy(v.photo, 'Real suratga chizilmoqda')}${fig(v.photo, `Real surat${views[0] ? ' (' + E(views[0].side) + ')' : ''} ustiga yechim chizilgan.`)}
    </section>` : ''}`;
  }

  // Muammolarni real suratlar bilan avtomatik tekshiruv natijasi
  function reviewCard(S) {
    if (!NX.mly.available()) return '<div id="reviewCard"></div>';
    const R = S.review, M = S.model;
    const items = M.problems.filter(p => p.type === 'junction' || p.type === 'school');
    const n = k => items.filter(p => S.verify[p.id] && S.verify[p.id].res && S.verify[p.id].res.status === k).length;
    const fixed = R ? R.fixed : [];
    return `<section class="card review" id="reviewCard">
      <h3>🔎 Real suratlar bilan tekshiruv</h3>
      ${R && R.busy ? progress({ p: R.total ? R.done / R.total : 0, label: `${R.stage}: ${R.done}/${R.total}` }) : ''}
      ${R ? `<ul class="rv-sum">
        <li>🗑 <b>${fixed.length}</b> ta joy muammo emas ekan (suratda svetofor yoki piyoda oʻtish bor) — olib tashlandi.</li>
        <li>❌ <b>${n('bad')}</b> ta joyda suratda ham yoʻq — muammo tasdiqlandi.</li>
        <li>❔ <b>${n('unknown')}</b> ta joyda surat yoʻq yoki aniq emas — xarita maʼlumotiga koʻra koʻrsatilmoqda.</li></ul>` : '<p class="small muted">Tekshiruv boshlanmoqda…</p>'}
      ${R && R.err ? `<p class="small warn-line">⚠️ ${E(R.err)}</p>` : ''}

      ${fixed.length ? `<details class="more"><summary>Olib tashlanganlar (${fixed.length})</summary><ul class="locs">${fixed.map(f => `<li class="locrow"><span>${f.kind === 'signal' ? '🚦' : '🚶'} ${E(f.title)} <small class="muted">— ${E(f.by)}</small></span><div class="loc-acts">${f.photo ? `<a class="btn xs" href="${E(f.photo.link)}" target="_blank" rel="noopener">📷 Surat</a>` : ''}<button class="btn xs" data-act="review-undo" data-fid="${E(f.id)}">Baribir muammo</button></div></li>`).join('')}</ul></details>` : ''}
      <p class="small muted">Har gal sayt ochilganda avtomatik: Mapillary ochiq koʻcha suratlari + AI. Surat eski boʻlishi mumkin.</p>
    </section>`;
  }

  function problems(S) {
    const M = S.model;
    const groups = Object.keys(NX.PROBLEM).map(t => ({ t, meta: NX.PROBLEM[t], items: M.problems.filter(p => p.type === t) })).filter(g => g.items.length)
      .sort((a, b) => b.meta.weight - a.meta.weight);
    return `
    <section class="card">
      <h2>Muammolar va yechimlar</h2>
      <p class="small muted">Joy nomini bosing — xaritada koʻrsatiladi. “🔎 Tekshirish” — joyning real surati: svetofor, zebra bormi; AI tahlili va maslahat.</p>
    </section>
    ${reviewCard(S)}
    ${groups.map(g => {
      const qty = g.items.reduce((t, p) => t + (p.qty || 1), 0);
      const list = g.items.map(p => locRow(S, p));
      const canBatch = NX.mly.available() && (g.t === 'junction' || g.t === 'school' || g.t === 'crossings');
      return `<section class="card prob" style="--c:${g.meta.color}">
        <div class="prob-h"><span class="prob-ico" aria-hidden="true">${g.meta.icon}</span><div><b>${E(g.meta.short)}</b><small>${g.items.length} ta joy · ~${F.uzs(qty * g.meta.cost)}</small></div></div>
        <p class="fix"><b>Yechim:</b> ${E(g.meta.fix)}</p>
        ${canBatch && g.t === 'crossings' ? `<button class="btn xs" data-act="verify-all" data-type="${g.t}" ${S.verifyBatch && S.verifyBatch.busy ? 'disabled' : ''}>🔎 Hammasini real surat bilan tekshirish</button>${verifySummary(S, g.items)}` : ''}
        <ul class="locs">${list.slice(0, 3).join('')}</ul>
        ${list.length > 3 ? `<details class="more"><summary>Yana ${list.length - 3} ta joy</summary><ul class="locs">${list.slice(3, 60).join('')}</ul></details>` : ''}
      </section>`;
    }).join('') || '<section class="card"><p>Muammo topilmadi.</p></section>'}`;
  }

  // Chuqur tahlil variantlari: raqamlar (sayt hisobi) va xaritada koʻrsatish tugmasi
  function deepOpts(A, m) {
    if (!m.opts || !m.opts.length) return '';
    const shown = A.deep && A.deep.shown != null ? A.deep.shown : (m.opts.find(o => o.best) || {}).i;
    return `<div class="deep-opts"><b class="small">Variantlar (hisob) — bosing, xaritada koʻrinadi:</b>${m.opts.map(o => `<button class="dopt${o.i === shown ? ' on' : ''} lv${o.level}" data-act="area-opt" data-i="${o.i}">${o.best ? '⭐ ' : ''}${E(o.label.replace(/^[^:]*:\s*/, ''))}<small>yoʻl vaqti ${F.signed(o.tt, 1)}%${o.vc ? ` · koʻcha toʻlishi ${Math.round(o.vc[0] * 100)}→${Math.round(o.vc[1] * 100)}%` : ''}${o.over ? ` · ${o.over} koʻcha sigʻmaydi` : ''}</small></button>`).join('')}</div>
      ${m.sources && m.sources.length ? `<ul class="vsrc">${m.sources.map(x => `<li><a href="${E(x.url)}" target="_blank" rel="noopener">${E(x.title)}</a></li>`).join('')}</ul>` : ''}`;
  }

  // ---------- Belgilangan hudud (mahalla) ----------
  function area(S) {
    const A = S.area, st = A.st;
    const groups = {};
    st.problems.forEach(p => { (groups[p.type] = groups[p.type] || []).push(p); });
    const tile = (v, l, warn) => `<div class="atile${warn ? ' warn' : ''}"><b>${v}</b><small>${l}</small></div>`;
    const qa = A.qa.map(m => m.role === 'user' ? `<div class="chat-msg user"><div class="bubble">${E(m.text)}</div></div>`
      : `<div class="chat-msg ai"><div class="bubble">${m.src === 'ai' ? '' : `<div class="ai-src warn small">⚠️ AI ishlamadi${m.error ? ': ' + E(m.error) : ''} — saytning oʻz hisobi.</div>`}<div class="ai-text">${NX.ai.render(m.text)}</div>${deepOpts(A, m)}</div></div>`).join('');
    const sugg = ['Bu yerda doim tirbandlik — nima qilsak boʻladi?', 'Soatbay bir tomonlama qilsak-chi?', 'Bu yerga 500 xonadonli 9 qavatli dom qursam nima boʻladi?'];
    const L = A.live, min = s => Math.max(1, Math.round(s / 60));
    const live = !L ? '' : L.busy ? '<p class="small muted"><span class="spinner sm"></span> Yandex’dan hozirgi yoʻl vaqtlari olinmoqda…</p>'
      : L.list && L.list.length ? `<h4>🚦 Hozir bu yerdan ${B('yandex')}</h4><ul class="live-routes">${L.list.map(r => `<li><b>${E(r.name)}gacha</b> ${min(r.jams)} daq <small class="muted">(probkasiz ${min(r.free)} daq · ${F.km(r.len)})</small>${r.jams > r.free * 1.3 ? ' <span class="tag r">tirband</span>' : ''}</li>`).join('')}</ul>` : '';
    return `
    <button class="back" data-act="area-clear">← Hududni olib tashlash</button>
    <section class="card">
      <h2>📐 Belgilangan hudud ${B('osm')}</h2>
      <p class="muted small">${F.num(st.areaHa, 1)} ga · ${F.num(st.streetKm, 1)} km koʻcha · Registondan ${F.km(st.distCenter)}</p>
      <div class="atiles">
        ${tile(st.problems.length, 'muammo', st.problems.length > 0)}
        ${tile(st.stops, `bekat${st.coverage != null ? ` · qamrov ${F.pct(st.coverage)}` : ''}`, st.coverage != null && st.coverage < 70)}
        ${tile(st.signals, 'svetofor')}
        ${tile(st.crossings, 'piyoda oʻtish')}
        ${tile(st.schoolsIn.length, 'maktab/bogʻcha')}
      </div>
      ${Object.keys(groups).length ? `<ul class="street-probs">${Object.keys(groups).sort((a, b) => NX.PROBLEM[b].weight - NX.PROBLEM[a].weight).map(t => `<li><button class="link" data-act="problem" data-id="${groups[t][0].id}">${NX.PROBLEM[t].icon} ${E(NX.PROBLEM[t].short)} — ${groups[t].length} ta</button><small>${E(NX.PROBLEM[t].fix)}</small></li>`).join('')}</ul>` : '<p class="small ok-text">Hududda avtomatik topilgan muammo yoʻq.</p>'}
      ${live}
      <h4>🏙 Shahar tizimlari</h4>
      <ul class="sys-area">${NX.systems.KEYS.map(k => { const T = NX.SYSTEMS[k], x = (st.systems || []).find(y => y.sys === k);
        return `<li>${T.icon} ${E(T.uz)}: ${!x ? '<span class="muted">maʼlumot ulanmagan</span>' : k === 'camera' ? `<b>${x.points}</b> ta kamera` : `${x.km > 0.01 ? `<b>${F.num(x.km, 2)} km</b> liniya` : 'hududda liniya yoʻq'}${x.points ? `, ${x.points} ta obyekt` : ''}${isFinite(x.nearest) && !(x.km > 0.01) ? ` · eng yaqini ${F.km(x.nearest)}` : ''}`}</li>`; }).join('')}</ul>
      <button class="btn xs" data-act="area-redraw">✏️ Qayta chizish</button>
    </section>
    <section class="card chat" id="areaChat">
      <h3>🤖 AI tahlil</h3>
      <p class="small muted">Nima qurmoqchisiz yoki nimani bilmoqchisiz — yozing. AI hisoblaydi, natija xaritada koʻrinadi.</p>
      <div class="chat-log">${qa}${A.qaBusy ? `<div class="chat-msg ai"><div class="bubble"><div class="spinner sm"></div> ${E(A.qaBusy)}</div></div>` : ''}</div>
      ${A.res ? '<p class="small muted">Xaritada: <span class="tag r">qizil</span> — shu bino sabab mashina koʻpayadigan koʻchalar, <span class="tag g">yashil</span> — kamayadigan. 🏢 — bino joyi.</p>' : ''}
      <div class="chips">${sugg.map(q => `<button class="chip" data-act="area-ask" data-q="${E(q)}">${E(q)}</button>`).join('')}</div>
      <form data-form="area-q" class="chat-form">
        <textarea name="aq" rows="2" placeholder="Masalan: 300 xonadonli 12 qavatli dom qursam nima boʻladi?" aria-label="Savol" ${A.qaBusy ? 'disabled' : ''}></textarea>
        <button class="btn primary" ${A.qaBusy ? 'disabled' : ''}>Yuborish</button>
      </form>
      <details class="more"><summary>Hisobda ishlatilgan raqamlar</summary>
        <p class="small muted">Bino hali qurilmagan, shuning uchun uning taʼsiri shu raqamlar bilan hisoblanadi. Samarqand uchun aniq raqamingiz boʻlsa — almashtiring.</p>
        <div class="assume">${Object.keys(NX.area.ASSUME).map(k => `<label>${E(NX.area.ASSUME[k].uz)}${NX.area.ASSUME[k].unit ? ` (${NX.area.ASSUME[k].unit})` : ''} <input data-assume="${k}" type="number" step="any" value="${A.A[k]}"></label>`).join('')}</div>
      </details>
    </section>`;
  }

  // ---------- AI yordamchi (chat) ----------
  function chatSuggestions(S) {
    const M = S.model, s = S.chatStreet != null ? M.streets[S.chatStreet] : null;
    if (s && S.segment && S.segment.street === s.id) return ['Shu qismini yopsak nima boʻladi?', 'Shu qismini bir tomonlama qilsak-chi?', 'Shu qismida nima qilish kerak?'];
    if (s && s.name) return [`${s.name}ni yopsak nima boʻladi?`, `${s.name}ni bir tomonlama qilsak-chi?`, `${s.name} bilan nima qilish kerak?`];
    return ['Qaysi chorrahaga birinchi navbatda svetofor kerak?', 'Turistlar 20% koʻpaysa qayerda tirbandlik boʻladi?', 'Maktablar atrofida qanday xavf bor?'];
  }
  function chatSim(m) {
    const x = m.sim;
    if (!x) return '';
    const chip = r => `<button class="chip sm ${r.dv > 0 ? 'up' : 'down'}" data-act="chat-street" data-id="${r.s}">${E(r.name || 'nomsiz')} ${r.dv > 0 ? '▲' : '▼'}</button>`;
    return `<div class="chat-sim">
      <div><span class="pill v-${x.level}">${E(x.verdict)}</span> <span class="small">Yoʻlda yurish vaqti ${x.tt >= 0 ? '+' : ''}${F.num(x.tt, 1)}%</span></div>
      ${x.up.length ? `<div class="small"><b>Yuklama oshadi (qizil):</b> ${x.up.map(chip).join('')}</div>` : ''}
      ${x.down.length ? `<div class="small"><b>Yengillashadi (yashil):</b> ${x.down.map(chip).join('')}</div>` : ''}
      ${x.lines.length ? `<div class="small"><b>Avtobuslar:</b> ${x.lines.map(E).join(', ')}</div>` : ''}
      <button class="btn xs" data-act="show-sim">🗺 Xaritada koʻrsatish</button>
    </div>`;
  }
  function aiChat(S) {
    const M = S.model, C = S.chat, s = S.chatStreet != null ? M.streets[S.chatStreet] : null;
    const msgs = C.msgs.length ? C.msgs.map(m => m.role === 'user'
      ? `<div class="chat-msg user"><div class="bubble">${E(m.text)}</div></div>`
      : `<div class="chat-msg ai"><div class="bubble">
          ${m.src === 'ai' ? '' : `<div class="ai-src warn small">⚠️ AI ishlamadi${m.error ? ': ' + E(m.error) : ''} — saytning oʻz hisobi.</div>`}
          <div class="ai-text">${NX.ai.render(m.text)}</div>${chatSim(m)}</div></div>`).join('')
      : `<div class="chat-msg ai"><div class="bubble"><p><b>Salom!</b> Men Samarqand koʻchalari boʻyicha yordamchiman.</p>
          <p>Xaritada koʻchani bosing va soʻrang: <i>“yopsak nima boʻladi?”</i>, <i>“bir tomonlama qilsak?”</i>, <i>“nima qilish kerak?”</i>.</p>
          <p>Natija xaritada koʻrinadi: <span class="tag r">qizil</span> — yuklama oshadi, <span class="tag g">yashil</span> — kamayadi.</p></div></div>`;
    return `<section class="card chat" id="chat">
      <div class="chat-h"><b>🤖 AI yordamchi</b>${NX.ai.available() ? '' : '<small class="muted">AI ulanmagan — sayt hisobi bilan javob beradi</small>'}</div>
      ${s ? `<div class="chat-ctx">📍 Tanlangan: <b>${streetName(s)}</b><button class="link" data-act="chat-clear" aria-label="Tanlovni olib tashlash">✕</button></div>${segBar(S, s)}` : '<div class="chat-ctx muted">📍 Koʻchani xaritada bosing — u suhbatga biriktiriladi</div>'}
      <div class="chat-log">${msgs}${C.busy ? `<div class="chat-msg ai"><div class="bubble"><div class="spinner sm"></div> ${E(C.busy)}</div></div>` : ''}</div>
      <div class="chips">${chatSuggestions(S).map(q => `<button class="chip" data-act="chat-ask" data-q="${E(q)}">${E(q)}</button>`).join('')}</div>
      <form data-form="chat" class="chat-form">
        <textarea name="q" rows="2" placeholder="${s ? 'Masalan: yopsak nima boʻladi?' : 'Savolingizni yozing…'}" aria-label="Savol" ${C.busy ? 'disabled' : ''}></textarea>
        <button class="btn primary" ${C.busy ? 'disabled' : ''}>Yuborish</button>
      </form>
      ${C.msgs.length ? '<button class="link small" data-act="chat-reset">Yangi suhbat</button>' : ''}
    </section>`;
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
    if (uj.length) out.push({ pr: 80, t: 'Svetoforsiz yirik chorrahalarni tartibga solish', why: `${uj.length} ta yirik koʻchalar kesishmasida ${NX.RULES.junctionSignal} m ichida svetofor yoʻq. Avval transport sanogʻi bilan zarurati tekshiriladi.`, qty: uj.length, unit: 'svetofor obyekti', cost: COST.signal, items: uj.slice(0, 8).map(j => j.name) });
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
      <ul class="small how-list">
        <li><b>Tirbandlik</b> — Yandex xaritasi, real vaqtda.</li>
        <li><b>Koʻchalar, bekatlar, svetoforlar</b> — OpenStreetMap xaritasidan; xato boʻlsa “Muammo emas” bilan tuzatiladi.</li>
        <li><b>Muammolar</b> — xarita boʻyicha avtomatik topiladi: svetoforsiz katta chorrahalar, maktab oldida oʻtish yoʻqligi, bekatdan uzoq hududlar va h.k.</li>
        <li><b>“Nima qilsak?”</b> — butun koʻcha tarmogʻida mashinalar qayta taqsimlanishi hisoblanadi. Bu taxmin; aniq natija uchun chorrahalarda sanoq kerak.</li>
      </ul></section>`;
  }

  NX.views = { loading, error, home, alertsCard, systems, twin, dynInfo, dynTInfo, area, problems, problem, effP, locRow, reviewCard, nowCard, aiChat, street, aiBox, actions, routes, routeList, report, simResult, progress, recommendations, mainStreets, directionLabels, DISCLAIMER };
})();
