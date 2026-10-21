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
  await ctx.route(/overpass|maps\.mail\.ru/, async route => {
    ctx.overpassCalls++;
    if (opts.overpassDown) return route.abort('failed');
    const body = decodeURIComponent((route.request().postData() || '').replace(/\+/g, ' '));
    const isRoutes = /relation\["type"="route"\]/.test(body);
    if (opts.routesDown && isRoutes) return route.fulfill({ status: 504, body: 'timeout' });
    await new Promise(r => setTimeout(r, 150));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(isRoutes ? FX.routes : FX.streets) });
  });
  await ctx.route(/api\.tomtom\.com/, route => {
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

  // TomTom: kalitsiz → xato va sozlamalar
  await page.click('[data-act=measure]');
  await page.waitForSelector('#settingsDlg[open]', { timeout: 5000 });
  ok('Kalitsiz oʻlchashda sozlamalar ochiladi', true);
  await page.fill('#keyTomtom', 'TESTKEY');
  await page.click('#settingsForm button[type=submit]');
  await page.click('[data-act=measure]');
  await page.waitForSelector('.status-line b', { timeout: 10000 });
  await page.waitForFunction(() => /Hozir/.test(document.querySelector('.status-line').textContent), null, { timeout: 10000 });
  const meas = await page.textContent('.status-line');
  ok('TomTom oʻlchovi koʻrsatiladi', /45%/.test(meas), meas.trim());
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
  ok('Ogohlantirish matni bor', /soddalashtirilgan model bashorati/.test(disc));

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
  ok('Xarita bashorat rejimida', /Bashorat:/.test(legend), legend.slice(0, 40));
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
  ok('Bashorat boʻlimida koʻcha nomisiz savol', !!ctxAns.street && ctxAns.type === 'close', JSON.stringify(ctxAns));
  ok('Bashorat boʻlimida “nima qilmoqchisiz” tugmalari', (await page.$$('#whatif [data-act=sim]')).length === 6);
  await page.evaluate(() => { NX.state.ai.answer = null; NX.state.ai.q = ''; document.querySelectorAll('details').forEach(d => (d.open = true)); });

  // Kalibrlash
  await page.click('[data-act=calibrate]');
  await page.waitForSelector('.calib', { timeout: 90000 });
  const cal = await page.textContent('.calib');
  ok('Kalibrlash natijasi va xatosi', /RMSE/.test(cal), cal.trim().slice(0, 120));

  // Yoʻnalishlar
  await page.click('.tabs [data-tab=routes]');
  await page.fill('input[data-input=route-q]', 'Universitet');
  const nR = await page.$$eval('.rlist > li', l => l.length);
  ok('Yoʻnalish qidiruvi', nR === 1, 'topildi: ' + nR);
  await page.click('.rlist .rhead');
  const rb = await page.textContent('.rbody');
  ok('Yoʻnalish tafsilotlari (oraliq, koʻchalar)', /oʻrtacha oraligʻi/.test(rb) && /Toshkent/.test(rb));

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
  ok('AI javobi koʻrsatiladi', /Hozirgi holat/.test(aiTxt));
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
  ok('Konsolda xato yoʻq (telefon)', e4.length === 0, e4.join(' || '));

  await browser.close();
  console.log(results.map(r => r.join('  ')).join('\n'));
  console.log(`\n${results.filter(r => r[0] === 'OK  ').length}/${results.length} tekshiruv oʻtdi`);
})().catch(e => { console.error(e); process.exit(1); });
