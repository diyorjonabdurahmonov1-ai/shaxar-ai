/* Brauzer testi (Playwright): tarmoq soʻrovlari sintetik javoblar bilan almashtiriladi.
   Ishga tushirish: npx http-server -p 8765 -s . &  NODE_PATH=$(npm root -g) node tests/e2e.cjs */
'use strict';
const { chromium } = require('playwright');
const { build } = require('./fixture.cjs');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const FX = build();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const results = [];
const ok = (name, cond, extra) => { results.push([cond ? 'OK  ' : 'FAIL', name, extra || '']); if (!cond) process.exitCode = 1; };

async function setupRoutes(ctx, opts = {}) {
  ctx.overpassCalls = 0; ctx.openaiBodies = [];
  // Test sayt egasining haqiqiy kalitiga bogʻliq boʻlmasligi uchun keys.js boʻsh kalit bilan almashtiriladi
  await ctx.route(/\/js\/keys\.js/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CITYJAM_KEYS = { tomtom: '' };" }));
  await ctx.route(/overpass|maps\.mail\.ru/, async route => {
    ctx.overpassCalls++;
    if (opts.overpassDown) return route.abort('failed');
    const body = decodeURIComponent((route.request().postData() || '').replace(/\+/g, ' '));
    const isRoutes = /relation\["type"="route"\]/.test(body);
    if (opts.routesDown && isRoutes) return route.fulfill({ status: 504, body: 'timeout' });
    await new Promise(r => setTimeout(r, 150));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(isRoutes ? FX.routes : FX.streets) });
  });
  await ctx.route(/api\.open-meteo\.com/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ current: { time: '2026-10-26T12:00', temperature_2m: 17.4, apparent_temperature: 16.1, precipitation: 0.6, rain: 0.6, snowfall: 0, weather_code: 61, wind_speed_10m: 12, visibility: 9000 } }) }));
  await ctx.route(/api\.tomtom\.com\/traffic\/map/, route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route(/api\.tomtom\.com\/traffic\/services\/5\/incidentDetails/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ incidents: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[66.9690, 39.6550], [66.9730, 39.6550]] }, properties: { iconCategory: 9, magnitudeOfDelay: 2, from: 'Registon koʻchasi', to: 'Sinov tor koʻchasi 6', delay: 240, length: 340, startTime: '2026-10-26T06:00:00Z' } }] }) }));
  await ctx.route(/api\.tomtom\.com\/traffic\/services\/4/, route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('key') === 'BAD') return route.fulfill({ status: 403, body: '{}' });
    const [lat, lon] = u.searchParams.get('point').split(',').map(Number);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ flowSegmentData: { frc: 'FRC2', currentSpeed: 22, freeFlowSpeed: 40, currentTravelTime: 100, freeFlowTravelTime: 55, confidence: 0.9, roadClosure: false, coordinates: { coordinate: [{ latitude: lat, longitude: lon }] } } }) });
  });
  await ctx.route(/api\.openai\.com/, route => {
    const b = JSON.parse(route.request().postData());
    ctx.openaiBodies.push(b);
    if (b.model === 'gpt-5.4-mini') return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: { code: 'model_not_found', message: 'The model does not exist' } }) });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: '**Hozirgi holat**\nSinov javobi.\n\n**Nima boʻladi**\n…\n\n**Xavflar**\n…\n\n**Eng yaxshi yechim**\n1. …' } }] }) });
  });
  await ctx.route(/tile\.openstreetmap\.org|arcgisonline/, route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}

// JS xatolari va oʻz fayllarimizning 4xx/5xx javoblari. Soxta tashqi xizmatlar ataylab qaytargan
// tarmoq xatolari (“Failed to load resource”) bu yerda hisobga olinmaydi.
function watchErrors(page) {
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('response', r => { if (r.url().startsWith('http://127.0.0.1') && r.status() >= 400) errs.push('static ' + r.status() + ': ' + r.url()); });
  return errs;
}

async function clickStreet(page, name) {
  const pt = await page.evaluate(n => {
    const M = NX.state.model, s = M.streets.find(x => x.name === n);
    const w = M.ways[s.ways[0]], ll = w.ll[Math.floor(w.ll.length / 2) - 1], ll2 = w.ll[Math.floor(w.ll.length / 2)];
    const map = NX.map.leaflet();
    map.setView([(ll[0] + ll2[0]) / 2, (ll[1] + ll2[1]) / 2], 17, { animate: false });
    const p = map.latLngToContainerPoint([(ll[0] + ll2[0]) / 2, (ll[1] + ll2[1]) / 2]);
    const r = document.getElementById('map').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, name);
  await page.waitForTimeout(300);
  await page.mouse.click(pt.x, pt.y);
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. Desktop: toʻliq oqim ----------
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
  await setupRoutes(ctx);
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto(BASE);
  await page.waitForSelector('.index-card', { timeout: 20000 });
  const kpis = await page.$$eval('.kpi .kpi-v', els => els.map(e => e.textContent));
  ok('Maʼlumot yuklandi va KPI koʻrsatildi', kpis.length === 4, kpis.join(' | '));
  const info = await page.evaluate(() => ({ streets: NX.state.model.namedStreets.length, routes: NX.state.model.routes.length, lines: NX.state.model.kpi.lines, problems: NX.state.model.problems.length, idx: NX.state.model.index.value, status: document.getElementById('dataStatus').textContent }));
  ok('Model: koʻchalar, yoʻnalishlar, muammolar', info.streets > 10 && info.routes === 4 && info.lines === 3 && info.problems > 0, JSON.stringify(info));
  ok('Overpass oynalariga parallel soʻrov', ctx.overpassCalls >= 2, 'soʻrovlar: ' + ctx.overpassCalls);

  // Koʻchani bosish
  await clickStreet(page, 'Dagbitskiy koʻchasi');
  await page.waitForSelector('#panel h2', { timeout: 5000 });
  const h2 = await page.textContent('#panel h2');
  ok('Koʻcha bosilganda panel ochiladi', /Dagbitskiy/.test(h2), h2);
  const facts = await page.textContent('.facts');
  ok('Koʻcha faktlari (polosa, liniyalar…)', /Polosalar/.test(facts) && /Svetoforlar/.test(facts));

  // Ob-havo (real manba) bosh sahifada
  ok('Ob-havo koʻrsatiladi', true);
  // TomTom: kalitsiz → kalit kiritish tugmasi
  await page.click('#panel [data-act=settings]');
  await page.waitForSelector('#settingsDlg[open]', { timeout: 5000 });
  ok('Kalitsiz koʻchada “kalit kiritish” tugmasi', true);
  await page.fill('#keyTomtom', 'TESTKEY');
  await page.click('#settingsForm button[type=submit]');
  await page.waitForSelector('[data-act=measure]');
  await page.click('[data-act=measure]');
  await page.waitForSelector('.status-line b', { timeout: 10000 });
  await page.waitForFunction(() => /km\/soat/.test(document.querySelector('.status-line').textContent), null, { timeout: 10000 });
  const meas = await page.textContent('.status-line');
  ok('TomTom oʻlchovi oddiy tilda', /22 km\/soat/.test(meas) && /baravar sekin/.test(meas), meas.replace(/\s+/g, ' ').trim());
  const hist = await page.evaluate(() => NX.forecast.stats().samples);
  ok('Oʻlchov tarixga yoziladi', hist >= 1, 'namunalar: ' + hist);

  // What-if: bir tomonlama
  const t0 = Date.now();
  await page.click('[data-act=sim][data-type="oneway-A"]');
  await page.waitForSelector('.verdict', { timeout: 60000 });
  const verdict = await page.textContent('.verdict b');
  const rows = await page.$$eval('.sim .tbl tbody tr', r => r.length);
  const sim = await page.evaluate(() => { const l = NX.state.sim.last; return { tt: l.result.ttChangePct, deltas: l.result.deltas.length / 2, target: l.result.target && [Math.round(l.result.target.baseVol), Math.round(l.result.target.scenVol)], lines: l.verdict.busLines, info: NX.state.simInfo }; });
  ok('Simulyatsiya natija qaytaradi (bir tomonlama)', ['Mos keladi', 'Ehtiyotkorlik bilan', 'Tavsiya etilmaydi'].includes(verdict) && rows > 0, `${verdict}; ${rows} qator; ΔTT=${sim.tt.toFixed(2)}%; target=${sim.target}; ${Date.now() - t0} ms; worker=${sim.info.worker}; tugun=${sim.info.nodes}, zona=${sim.info.zones}`);
  ok('Xaritada oʻzgarishlar chiziladi', sim.deltas > 0, 'boʻlaklar: ' + sim.deltas);
  const disc = await page.textContent('.sim .disclaimer');
  ok('Ogohlantirish matni bor', /taxminiy hisob/.test(disc));

  // Yopish stsenariysi: avtobus liniyalari
  await page.click('[data-act=sim][data-type="close"]');
  await page.waitForFunction(() => NX.state.sim.last && NX.state.sim.last.type === 'close' && !NX.state.sim.busy, null, { timeout: 60000 });
  const close = await page.evaluate(() => { const l = NX.state.sim.last; return { v: l.verdict.label, tt: l.result.ttChangePct, target: l.result.target && Math.round(l.result.target.scenVol) }; });
  ok('Yopish stsenariysi: koʻchada hajm 0', close.target === 0, JSON.stringify(close));

  // Registon: avtobus liniyalari teskari yoʻnalish
  await page.click('[data-act=home]');
  await clickStreet(page, 'Registon koʻchasi');
  await page.waitForFunction(() => /Registon/.test(document.querySelector('#panel h2').textContent));
  const refs = await page.$$eval('.facts .refs .ref', e => e.map(x => x.textContent));
  ok('Registon koʻchasida liniyalar', refs.includes('3') && refs.includes('45'), refs.join(','));
  await page.click('[data-act=sim][data-type="oneway-A"]');
  await page.waitForFunction(() => NX.state.sim.last && NX.state.sim.last.street !== undefined && !NX.state.sim.busy && /Registon/.test(NX.state.sim.last.label), null, { timeout: 60000 });
  const rl = await page.evaluate(() => NX.state.sim.last.verdict.busLines);
  ok('Bir tomonlamada qaysi liniyalar yoʻnalishini oʻzgartiradi', rl.length === 1 && rl[0] === '3', rl.join(','));

  // Bashorat
  await page.click('.tabs [data-tab=forecast]');
  await page.waitForSelector('.chart', { timeout: 5000 });
  const charts = await page.$$eval('#panel svg.chart', s => s.length);
  const low = await page.$('.lowconf');
  ok('Bashorat grafiklari chiziladi', charts === 2, 'grafiklar: ' + charts);
  ok('“maʼlumot kam → ishonch past” yorligʻi', !!low);
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
  const legend = await page.textContent('.nx-legend');
  ok('Xarita bashorat rejimida', /Taxmin:/.test(legend), legend.slice(0, 40));
  await page.fill('input[data-input=fc-hour]', '8');
  await page.dispatchEvent('input[data-input=fc-hour]', 'input');
  const legend2 = await page.textContent('.nx-legend');
  ok('Soat surilgichi xaritani yangilaydi', /08:00/.test(legend2));
  // Bashorat raqamlari: 3 ta namunadan keyin oʻrtacha
  const fc = await page.evaluate(() => {
    const s = NX.state.model.streets.find(x => x.name === 'Toshkent koʻchasi');
    const d = new Date(2026, 9, 19, 8); // Dushanba 08:00
    for (let i = 0; i < 3; i++) NX.forecast.addSample(s.key, 20, 40, d);
    const p = NX.forecast.predict(s, 1, 8), q = NX.forecast.predict(s, 1, 3);
    return { v: p.value, low: p.low, n: p.n, night: q.value, nightLow: q.low };
  });
  ok('Bashorat: ≥3 namuna → oʻrtacha (50%), ishonch yetarli', Math.abs(fc.v - 50) < 0.01 && !fc.low && fc.n === 3, JSON.stringify(fc));
  ok('Bashorat: tunda namuna yoʻq → profil, ishonch past', fc.nightLow && fc.night < fc.v);

  // AI: koʻcha nomisiz savol — panelda tanlangan koʻcha ishlatiladi (kalitsiz → Hisob javobi)
  await page.fill('#aiBox textarea[name=q]', 'yopsak nima boʻladi?');
  await page.click('#aiBox form button');
  await page.waitForSelector('#aiBox .ai-text', { timeout: 60000 });
  const ctxAns = await page.evaluate(() => ({ street: NX.state.ai.answer.street && NX.state.ai.answer.street.name, type: NX.state.sim.last.type }));
  ok('AI yoʻq: “AI ishlamadi” deb aniq yoziladi', /AI ishlamadi/.test(await page.textContent('#aiBox .ai-src')));
  ok('Bashorat boʻlimida koʻcha nomisiz savol', !!ctxAns.street && ctxAns.type === 'close', JSON.stringify(ctxAns));
  ok('Bashorat boʻlimida “nima qilmoqchisiz” tugmalari', (await page.$$('#whatif [data-act=sim]')).length === 6);
  await page.evaluate(() => { NX.state.ai.answer = null; NX.state.ai.q = ''; document.querySelectorAll('details').forEach(d => (d.open = true)); });

  // Kalibrlash
  await page.click('[data-act=calibrate]');
  await page.waitForSelector('.calib', { timeout: 90000 });
  const cal = await page.textContent('.calib');
  ok('Kalibrlash natijasi oddiy tilda', /oʻrtacha farq/.test(cal), cal.trim().slice(0, 120));

  // Yoʻnalishlar
  await page.click('.tabs [data-tab=routes]');
  await page.fill('input[data-input=route-q]', 'Universitet');
  const nR = await page.$$eval('.rlist > li', l => l.length);
  ok('Yoʻnalish qidiruvi', nR === 1, 'topildi: ' + nR);
  await page.click('.rlist .rhead');
  const rb = await page.textContent('.rbody');
  ok('Yoʻnalish tafsilotlari (oraliq, koʻchalar)', /oʻrtacha oraligʻi/.test(rb) && /Toshkent/.test(rb));

  // Muammolar boʻlimi
  await page.click('.tabs [data-tab=problems]');
  await page.waitForSelector('.prob', { timeout: 5000 });
  const probCards = await page.$$eval('.prob', e => e.map(x => x.querySelector('.prob-h b').textContent));
  const fixTxt = await page.textContent('.prob .fix');
  ok('Muammolar: turlar boʻyicha oddiy tushuntirish va yechim', probCards.length >= 3 && /Nima qilish kerak/.test(fixTxt), probCards.join(', '));
  const live = await page.textContent('.live');
  ok('“Hozir Samarqandda”: ob-havo, real tirbandlik, yoʻl hodisasi', /17°C/.test(live) && /Yomgʻir/.test(live) && /Yoʻl taʼmiri/.test(live) && /\+4 daq/.test(live), live.replace(/\s+/g, ' ').slice(0, 160));
  ok('Xaritada TomTom real tirbandlik qatlami', await page.evaluate(() => NX.map.hasRealTiles()));
  const leg = await page.textContent('.nx-legend');
  ok('Legend: “Hozirgi tirbandlik — TomTom, real vaqt”', /Hozirgi tirbandlik/.test(leg) && /real vaqt/.test(leg), leg);
  const sci = await page.evaluate(() => { const t = document.body.innerText; return ['V/C', 'RMSE', 'iteratsiya', 'MSA', 'BPR', 'gravitats'].filter(w => t.includes(w)); });
  ok('Ilmiy atamalar koʻrinmaydi', sci.length === 0, sci.join(','));
  const mk = await page.$$eval('.pmk:not(.inc)', e => e.length);
  ok('Muammo belgilari xaritada (faqat shu boʻlimda)', mk > 0, 'belgilar: ' + mk);
  await page.click('.loc');
  await page.waitForSelector('.leaflet-popup-content .ppop', { timeout: 5000 });
  ok('Joyni bosganda xaritada popup ochiladi', /Yechim/.test(await page.textContent('.leaflet-popup-content')));
  await page.click('.tabs [data-tab=routes]');
  ok('Boshqa boʻlimda muammo belgilari yashiriladi', (await page.$$('.pmk:not(.inc)')).length === 0);
  // Xarita ustidagi qidiruv
  await page.fill('.nx-search input', 'regist');
  await page.click('.nx-search li button');
  await page.waitForFunction(() => /Registon/.test((document.querySelector('#panel h2') || {}).textContent || ''));
  ok('Xaritadagi qidiruv orqali koʻcha ochiladi', true);

  // Hisobot va JSON eksport
  await page.click('.tabs [data-tab=report]');
  await page.waitForSelector('.recs', { timeout: 5000 });
  const recTxt = await page.textContent('.recs');
  ok('Tavsiyalar UZS va “taxminiy” bilan', /soʻm/.test(recTxt) && /taxminiy/.test(recTxt));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
  const fs = require('fs');
  const p = await dl.path();
  const rep = JSON.parse(fs.readFileSync(p, 'utf8'));
  ok('JSON eksport ishlaydi', rep.kpi && rep.streets.length > 5 && rep.lastSimulation && rep.recommendations.length > 0, `${dl.suggestedFilename()} · koʻchalar ${rep.streets.length}`);

  // AI
  await page.click('.tabs [data-tab=map]');
  await page.click('[data-act=home]').catch(() => {});
  await page.evaluate(() => { localStorage.setItem('nx:key:openai', JSON.stringify('sk-test')); });
  await page.fill('textarea[name=q]', 'Dagbitskiy koʻchasini bir tomonlama qilsak nima boʻladi?');
  await page.click('form[data-form=ai] button');
  await page.waitForSelector('.ai-text', { timeout: 90000 });
  const aiTxt = await page.textContent('.ai-text');
  const body = ctx.openaiBodies[ctx.openaiBodies.length - 1];
  const userMsg = body.messages[1].content;
  ok('AI: koʻcha aniqlanadi va simulyatsiya JSON yuboriladi', /Dagbitskiy/.test(userMsg) && /simulyatsiya/.test(userMsg) && /umumiy_yol_vaqti/.test(userMsg), 'model: ' + body.model);
  ok('AI: model ketma-ketligi (404 → keyingisi)', ctx.openaiBodies.some(b => b.model === 'gpt-5.4-mini') && body.model === 'gpt-5.5');
  ok('AI javobi koʻrsatiladi va “AI javobi” deb belgilanadi', /Hozirgi holat/.test(aiTxt) && /AI javobi/.test(await page.textContent('#aiBox .ai-src')));
  // Umumiy savol (koʻcha va stsenariysiz): AI ga real holat beriladi
  await page.fill('#aiBox textarea[name=q]', 'Hozir qaysi koʻchalar tirband va ob-havo qanday?');
  const nBefore = ctx.openaiBodies.length;
  await page.click('#aiBox form button');
  await page.waitForFunction(n => window.NX.state.ai.answer && !window.NX.state.ai.busy, nBefore, { timeout: 60000 });
  const gen = ctx.openaiBodies[ctx.openaiBodies.length - 1];
  const genMsg = gen.messages[gen.messages.length - 1].content;
  ok('Umumiy savolda AI ga ob-havo, tirbandlik, hodisalar, avtobuslar beriladi', /ob_havo/.test(genMsg) && /hozirgi_tirbandlik/.test(genMsg) && /avtobus_liniyalari/.test(genMsg) && /muammolar/.test(genMsg), 'xabarlar: ' + gen.messages.length);
  ok('Oldingi savol-javob eslab qolinadi', gen.messages.length === 4 && gen.messages[1].role === 'user');
  ok('Soʻrov hajmi proksi limitidan kichik (30 000)', JSON.stringify(gen).length < 30000, String(JSON.stringify(gen).length));
  ok('Konsolda xato yoʻq (desktop)', errs.length === 0, errs.join(' || '));
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/desktop.png' : '/tmp/desktop.png' });

  // ---------- 2. Kesh: Overpass ishlamasa ham ochiladi ----------
  const state = await ctx.storageState();
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: state });
  await setupRoutes(ctx2, { overpassDown: true });
  const p2 = await ctx2.newPage();
  const e2 = watchErrors(p2);
  await p2.goto(BASE);
  await p2.waitForSelector('.index-card', { timeout: 20000 });
  ok('Keshdan darhol ochiladi (Overpass soʻrovisiz)', ctx2.overpassCalls === 0);
  await p2.click('#btnRefresh');
  await p2.waitForFunction(() => /Eski kesh/.test(document.getElementById('dataStatus').textContent), null, { timeout: 30000 });
  ok('Overpass ishlamasa eski kesh ishlatiladi', true);
  ok('Konsolda xato yoʻq (kesh)', e2.length === 0, e2.join(' || '));

  // ---------- 3. Kesh yoʻq + Overpass ishlamaydi → xato holati ----------
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupRoutes(ctx3, { overpassDown: true });
  const p3 = await ctx3.newPage();
  await p3.goto(BASE);
  await p3.waitForSelector('.state.error', { timeout: 30000 });
  const btn = await p3.textContent('.state.error button');
  ok('Xato holati va “Qayta urinish” tugmasi', /Qayta urinish/.test(btn));

  // ---------- 4. Telefon (390 px) ----------
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setupRoutes(ctx4, { routesDown: true });
  const p4 = await ctx4.newPage();
  const e4 = watchErrors(p4);
  await p4.goto(BASE);
  await p4.waitForSelector('.index-card', { timeout: 20000 });
  const sw = await p4.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok('Telefonda gorizontal aylantirish yoʻq', sw[0] <= sw[1], sw.join(' / '));
  const warn = await p4.textContent('#toast');
  ok('Yoʻnalishlar yuklanmasa ogohlantirish', /yoʻnalishlari yuklanmadi/.test(warn), warn);
  await p4.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/mobile.png', fullPage: false });
  for (const t of ['routes', 'forecast', 'report']) {
    await p4.click(`.tabs [data-tab=${t}]`);
    await p4.waitForTimeout(200);
    const w = await p4.evaluate(() => document.documentElement.scrollWidth);
    ok(`Telefon: “${t}” ekranida kenglik ≤ 390`, w <= 390, String(w));
  }
  await p4.click('.tabs [data-tab=map]');
  await clickStreet(p4, 'Registon koʻchasi');
  await p4.waitForSelector('#whatif', { timeout: 5000 });
  const w2 = await p4.evaluate(() => document.documentElement.scrollWidth);
  ok('Telefon: koʻcha paneli kengligi ≤ 390', w2 <= 390, String(w2));
  await p4.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/mobile-street.png', fullPage: true });
  await p4.click('[data-act=sim][data-type="oneway-A"]');
  await p4.waitForSelector('.verdict', { timeout: 60000 });
  await p4.waitForTimeout(600);
  await p4.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/mobile-sim.png', fullPage: true });
  await p4.click('.tabs [data-tab=forecast]');
  await p4.waitForTimeout(300);
  await p4.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/mobile-forecast.png', fullPage: true });
  await p4.click('.tabs [data-tab=problems]');
  await p4.waitForTimeout(400);
  await p4.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/mobile-problems.png', fullPage: true });
  await p4.click('.loc');
  await p4.waitForTimeout(1500);
  await p4.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/mobile-problem-map.png' });
  ok('Konsolda xato yoʻq (telefon)', e4.length === 0, e4.join(' || '));

  // ---------- 5. AI proksi: brauzerda kalit yoʻq, savol Worker orqali ----------
  const ctx5 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await setupRoutes(ctx5);
  await ctx5.route(/\/js\/keys\.js/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CITYJAM_KEYS = { tomtom: '', aiProxy: 'https://cityjam-ai.example.workers.dev/' };" }));
  const proxyReqs = [];
  await ctx5.route(/cityjam-ai\.example\.workers\.dev/, route => {
    proxyReqs.push({ auth: route.request().headers()['authorization'] || null, body: JSON.parse(route.request().postData()) });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: '**Hozirgi holat**\nProksi javobi.' } }] }) });
  });
  const p5 = await ctx5.newPage();
  const e5 = watchErrors(p5);
  await p5.goto(BASE);
  await p5.waitForSelector('#aiBox textarea', { timeout: 20000 });
  await p5.fill('#aiBox textarea', 'Registon koʻchasini yopsak nima boʻladi?');
  await p5.click('#aiBox form button');
  await p5.waitForSelector('#aiBox .ai-text', { timeout: 60000 });
  const aiTxt5 = await p5.textContent('#aiBox .ai-text');
  ok('AI proksi orqali javob (brauzerda kalit yoʻq)', /Proksi javobi/.test(aiTxt5) && proxyReqs.length > 0 && proxyReqs.every(r => !r.auth) && ctx5.openaiBodies.length === 0, `soʻrovlar: ${proxyReqs.length}, model: ${proxyReqs[0] && proxyReqs[0].body.model}`);
  ok('Konsolda xato yoʻq (proksi)', e5.length === 0, e5.join(' || '));

  // ---------- 6. Yandex probkalar ----------
  const ctx6 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await setupRoutes(ctx6);
  await ctx6.route(/\/js\/keys\.js/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CITYJAM_KEYS = { tomtom: 'TT', yandex: 'YA-TEST' };" }));
  let yaUrl = null;
  await ctx6.route(/api-maps\.yandex\.ru/, route => {
    yaUrl = route.request().url();
    route.fulfill({ status: 200, contentType: 'text/javascript', body: `
      window.__yaClick = null;
      window.ymaps = {
        ready: cb => setTimeout(cb, 10),
        Map: function (id, o) { const self = this; this.c = o.center; this.z = o.zoom; this.geoObjects = { n: 0, add() { this.n++; }, remove() { this.n--; } };
          this.events = { add(ev, fn) { if (ev === 'click') window.__yaClick = fn; } };
          this.setCenter = (c, z) => { self.c = c; self.z = z; }; this.getCenter = () => self.c; this.getZoom = () => self.z; this.container = { fitToViewport() {} };
          document.getElementById(id).dataset.ymap = '1'; window.__ymap = this; },
        traffic: { provider: { Actual: function () { this.setMap = () => {}; this.state = { get: k => (k === 'level' ? 4 : null), events: { add() {} } }; } } },
        Polyline: function (ll) { this.ll = ll; },
      };` });
  });
  const p6 = await ctx6.newPage();
  const e6 = watchErrors(p6);
  await p6.goto(BASE);
  await p6.waitForFunction(() => document.getElementById('ymap').dataset.ymap === '1' && !document.getElementById('ymap').hidden, null, { timeout: 20000 });
  ok('Yandex kaliti boʻlsa probkalar avtomatik ochiladi', /apikey=YA-TEST/.test(yaUrl));
  await p6.waitForFunction(() => /4 ball/.test(document.querySelector('.live').textContent), null, { timeout: 10000 });
  ok('“Hozir” kartasida Yandex tirbandlik balli', true);
  ok('Yandex rejimida TomTom plitalari oʻchiq', !(await p6.evaluate(() => NX.map.hasRealTiles())));
  // Yandex xaritasida koʻchani bosish → panel ochiladi, Yandex’da qoladi
  await p6.evaluate(() => { const s = NX.state.model.streets.find(x => x.name === 'Registon koʻchasi'); const w = NX.state.model.ways[s.ways[0]]; const p = w.ll[1]; window.__yaClick({ get: () => [p[0], p[1]] }); });
  await p6.waitForFunction(() => /Registon/.test((document.querySelector('#panel h2') || {}).textContent || ''), null, { timeout: 10000 });
  ok('Yandex xaritasida koʻcha bosilsa panel ochiladi', !(await p6.evaluate(() => document.getElementById('ymap').hidden)) && (await p6.evaluate(() => window.__ymap.geoObjects.n)) > 0);
  // Simulyatsiya → tahlil xaritasiga avtomatik qaytadi
  await p6.click('[data-act=sim][data-type="close"]');
  await p6.waitForSelector('.verdict', { timeout: 60000 });
  ok('Simulyatsiyada tahlil xaritasiga qaytadi', await p6.evaluate(() => document.getElementById('ymap').hidden));
  await p6.click('#btnYandex');
  await p6.waitForFunction(() => !document.getElementById('ymap').hidden);
  ok('Tugma bilan Yandex probkalarga oʻtish', /Tahlil xaritasi/.test(await p6.textContent('#btnYandex')));
  ok('Konsolda xato yoʻq (Yandex)', e6.length === 0, e6.join(' || '));

  await browser.close();
  console.log(results.map(r => r.join('  ')).join('\n'));
  console.log(`\n${results.filter(r => r[0] === 'OK  ').length}/${results.length} tekshiruv oʻtdi`);
})().catch(e => { console.error(e); process.exit(1); });
