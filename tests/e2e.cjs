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
  await ctx.route(/yandex\.uz\/map-widget/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Yandex</body></html>' }));
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
  // Asosiy ekranda Yandex probkalar ochiq — tahlil xaritasiga oʻtiladi
  await page.evaluate(() => { if (NX.state.widgetOn) document.getElementById('btnYandex').click(); });
  await page.waitForFunction(() => document.getElementById('ymap').hidden);
  await page.waitForTimeout(700); // oldingi xarita animatsiyasi tugashi
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
  await page.waitForSelector('#panel .live', { timeout: 20000 });
  ok('Yandex kaliti yoʻq: zaxira xarita va “Yandex probkalar” tugmasi', await page.isVisible('#btnYandex') && (await page.evaluate(() => document.getElementById('ymap').hidden)));
  const homeTxt = await page.textContent('#panel');
  ok('Bosh panel qisqa: holat, asosiy muammolar, yoʻriqnoma', /Tirbandlik/.test(homeTxt) && /Asosiy muammolar/.test(homeTxt) && /Nima qilsak/.test(homeTxt) && !(await page.$('.kpi')) && !(await page.$('.index-card')));
  const tabs = await page.$$eval('.tabs [data-tab]', e => e.map(x => x.textContent));
  ok('4 ta boʻlim: Xarita, Muammolar, AI yordamchi, Hisobot', tabs.join(',') === 'Xarita,Muammolar,AI yordamchi,Hisobot', tabs.join(','));
  ok('Keraksiz funksiyalar yoʻq (Belgilash, tirbandlik xabari)', !(await page.$('.nx-mark')) && !(await page.$('#reportCard')));
  await page.waitForFunction(() => /17°C/.test(document.querySelector('.live').textContent), null, { timeout: 10000 });
  ok('Ob-havo va yoʻlga taʼsiri qisqa', /Yoʻl hoʻl/.test(await page.textContent('.live')));
  const info = await page.evaluate(() => ({ streets: NX.state.model.namedStreets.length, routes: NX.state.model.routes.length, lines: NX.state.model.kpi.lines, problems: NX.state.model.problems.length }));
  ok('Model: koʻchalar, yoʻnalishlar, muammolar', info.streets > 10 && info.routes === 4 && info.lines === 3 && info.problems > 0, JSON.stringify(info));
  ok('Overpass oynalariga parallel soʻrov', ctx.overpassCalls >= 2, 'soʻrovlar: ' + ctx.overpassCalls);

  // Koʻchani bosish
  await clickStreet(page, 'Dagbitskiy koʻchasi');
  await page.waitForSelector('#panel h2', { timeout: 5000 });
  const h2 = await page.textContent('#panel h2');
  ok('Koʻcha bosilganda panel ochiladi', /Dagbitskiy/.test(h2), h2);
  ok('Koʻcha panelida “Nima qilsak?” va qisqa maʼlumot', /Nima qilsak/.test(await page.textContent('#whatif')) && /Polosalar/.test(await page.textContent('.facts')));

  // What-if: bir tomonlama
  const t0 = Date.now();
  await page.click('[data-act=sim][data-type="oneway-A"]');
  await page.waitForSelector('.verdict', { timeout: 60000 });
  const verdict = await page.textContent('.verdict b');
  const rows = await page.$$eval('.sim .tbl tbody tr', r => r.length);
  const sim = await page.evaluate(() => { const l = NX.state.sim.last; return { tt: l.result.ttChangePct, deltas: l.result.deltas.length / 2, target: l.result.target && [Math.round(l.result.target.baseVol), Math.round(l.result.target.scenVol)], info: NX.state.simInfo }; });
  ok('Simulyatsiya natija qaytaradi (bir tomonlama)', ['Mos keladi', 'Ehtiyotkorlik bilan', 'Tavsiya etilmaydi'].includes(verdict) && rows > 0, `${verdict}; ${rows} qator; ΔTT=${sim.tt.toFixed(2)}%; target=${sim.target}; ${Date.now() - t0} ms; worker=${sim.info.worker}`);
  ok('Xaritada oʻzgarishlar chiziladi', sim.deltas > 0, 'boʻlaklar: ' + sim.deltas);
  ok('Ogohlantirish matni bor', /taxminiy hisob/.test(await page.textContent('.sim .disclaimer')));

  // Yopish stsenariysi
  await page.click('[data-act=sim][data-type="close"]');
  await page.waitForFunction(() => NX.state.sim.last && NX.state.sim.last.type === 'close' && !NX.state.sim.busy, null, { timeout: 60000 });
  const close = await page.evaluate(() => { const l = NX.state.sim.last; return { v: l.verdict.label, target: l.result.target && Math.round(l.result.target.scenVol) }; });
  ok('Yopish stsenariysi: koʻchada hajm 0', close.target === 0, JSON.stringify(close));

  // Ajratilgan koʻchani qayta bosish — ajratish olib tashlanadi
  await clickStreet(page, 'Dagbitskiy koʻchasi');
  await page.waitForTimeout(300);
  ok('Ajratilgan koʻchani qayta bosish ajratishni olib tashlaydi', await page.evaluate(() => NX.state.street === null));
  await clickStreet(page, 'Dagbitskiy koʻchasi');
  await page.waitForFunction(() => NX.state.street !== null);
  await page.keyboard.press('Escape');
  ok('Esc tugmasi ham ajratishni olib tashlaydi', await page.evaluate(() => NX.state.street === null));
  // Registon: avtobus liniyalari teskari yoʻnalish
  await clickStreet(page, 'Registon koʻchasi');
  await page.waitForFunction(() => /Registon/.test(document.querySelector('#panel h2').textContent));
  const refs = await page.$$eval('.facts .refs .ref', e => e.map(x => x.textContent));
  ok('Registon koʻchasida liniyalar', refs.includes('3') && refs.includes('45'), refs.join(','));
  await page.click('[data-act=sim][data-type="oneway-A"]');
  await page.waitForFunction(() => NX.state.sim.last && !NX.state.sim.busy && /Registon/.test(NX.state.sim.last.label), null, { timeout: 60000 });
  const rl = await page.evaluate(() => NX.state.sim.last.verdict.busLines);
  ok('Bir tomonlamada qaysi liniyalar yoʻnalishini oʻzgartiradi', rl.length === 1 && rl[0] === '3', rl.join(','));
  // Avtobus liniyasini bosish — shu xaritada ajratiladi, boʻlim oʻzgarmaydi
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
  await page.click('.facts .refs .ref');
  ok('Avtobus liniyasi shu xaritada koʻrsatiladi', await page.evaluate(() => NX.state.tab === 'map' && NX.state.route != null) && /bekat/.test(await page.textContent('#toast')));

  // AI yordamchi (chat, kalitsiz): savoldan koʻcha va stsenariy aniqlanadi, natija xaritada
  await page.click('[data-act=home]');
  await page.click('.ai-cta');
  await page.waitForSelector('#chat', { timeout: 5000 });
  ok('“AI yordamchi” boʻlimi va kirish tugmasi', await page.evaluate(() => NX.state.tab === 'ai'));
  await page.evaluate(() => NX.view.clearDeltas());
  await page.fill('#chat textarea[name=q]', 'Registon koʻchasini yopsak nima boʻladi?');
  await page.click('#chat form button');
  await page.waitForSelector('#chat .chat-sim', { timeout: 60000 });
  ok('Chat: “yopsak” → hisob, natija xaritada qizil/yashil', await page.evaluate(() => NX.state.sim.last.type === 'close' && NX.map.hasDeltas()) && /AI ishlamadi/.test(await page.textContent('#chat .ai-src')));
  ok('Chat: taʼsirlangan koʻchalar tugma sifatida', (await page.$$('#chat .chat-sim [data-act=chat-street]')).length > 0);
  // Xaritada koʻchani bosish — suhbatga biriktiriladi, boʻlim oʻzgarmaydi
  await clickStreet(page, 'Dagbitskiy koʻchasi');
  await page.waitForFunction(() => /Dagbitskiy/.test(document.querySelector('#chat .chat-ctx').textContent), null, { timeout: 5000 });
  ok('Chat: xaritada bosilgan koʻcha “Tanlangan” boʻladi', await page.evaluate(() => NX.state.tab === 'ai'));
  await page.click('#chat [data-act=chat-ask]');
  await page.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length === 4, null, { timeout: 60000 });
  ok('Chat: tanlangan koʻcha uchun tayyor savol (yopish)', await page.evaluate(() => /Dagbitskiy/.test(NX.state.sim.last.label) && NX.state.sim.last.type === 'close'));
  // Koʻchaning bir qismini tanlash: ikki nuqta → faqat shu qism tahlil qilinadi
  await page.click('#chat [data-act=seg-pick]');
  await page.waitForFunction(() => NX.state.segPick && NX.state.segPick.step === 1 && document.querySelector('.nx-pickbar'), null, { timeout: 10000 });
  const segPts = await page.evaluate(() => {
    const M = NX.state.model, s = M.streets.find(x => x.name === 'Dagbitskiy koʻchasi');
    const pcs = NX.state.simInfo.pieces.map((p, i) => [p, i]).filter(([p]) => M.ways[p[0]].street === s.id);
    const A = M.ways[pcs[0][0][0]].ll[pcs[0][0][1]], last = pcs[Math.max(1, Math.floor(pcs.length / 2))][0], B = M.ways[last[0]].ll[last[2]];
    const map = NX.map.leaflet();
    map.fitBounds([A, B], { padding: [60, 60], animate: false });
    const r = document.getElementById('map').getBoundingClientRect();
    const px = ll => { const p = map.latLngToContainerPoint(ll); return { x: r.left + p.x + 2, y: r.top + p.y + 2 }; };
    return { a: px(A), b: px(B), total: pcs.length };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(segPts.a.x, segPts.a.y);
  await page.waitForFunction(() => NX.state.segPick && NX.state.segPick.step === 2, null, { timeout: 5000 });
  ok('Qism: birinchi nuqtadan keyin “oxirini bosing”', /oxirini/.test(await page.textContent('.nx-pickbar')) && (await page.isVisible('#chat .seg-bar.picking')));
  await page.mouse.click(segPts.b.x, segPts.b.y);
  await page.waitForFunction(() => NX.state.segment, null, { timeout: 5000 });
  const segN = await page.evaluate(() => NX.state.segment.pieces.length);
  ok('Qism tanlandi: koʻchaning faqat bir boʻlagi', segN > 0 && segN < segPts.total && (await page.isVisible('#chat .seg-bar.on')) && (await page.evaluate(() => NX.state.tab)) === 'ai', `${segN}/${segPts.total}`);
  ok('Qism uchun tayyor savollar', /Shu qismini/.test(await page.textContent('#chat .chips')));
  await page.click('#chat [data-act=chat-ask]');
  await page.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length === 6, null, { timeout: 60000 });
  ok('Simulyatsiya faqat tanlangan qism uchun', await page.evaluate(() => NX.state.sim.last.type === 'close' && /→/.test(NX.state.sim.last.label) && / m\)|km\)/.test(NX.state.sim.last.label) && NX.map.hasDeltas()), await page.evaluate(() => NX.state.sim.last.label));
  await page.click('#chat [data-act=seg-clear]');
  ok('“Butun koʻcha” — qism bekor qilinadi', await page.evaluate(() => NX.state.segment === null) && /Butun koʻcha/.test(await page.textContent('#chat .seg-bar')));

  // Muammolar boʻlimi
  await page.click('.tabs [data-tab=problems]');
  await page.waitForSelector('.prob', { timeout: 5000 });
  const probCards = await page.$$eval('.prob', e => e.map(x => x.querySelector('.prob-h b').textContent));
  ok('Muammolar: tur, joylar soni, yechim, narx', probCards.length >= 3 && /Yechim/.test(await page.textContent('.prob .fix')) && /soʻm/.test(await page.textContent('.prob .prob-h')), probCards.join(', '));
  const sci = await page.evaluate(() => { const t = document.body.innerText; return ['V/C', 'RMSE', 'iteratsiya', 'MSA', 'BPR', 'gravitats'].filter(w => t.includes(w)); });
  ok('Ilmiy atamalar koʻrinmaydi', sci.length === 0, sci.join(','));
  const mk = await page.$$eval('.pmk:not(.inc)', e => e.length);
  ok('Muammo belgilari xaritada (faqat shu boʻlimda)', mk > 0, 'belgilar: ' + mk);
  await page.click('.loc');
  await page.waitForSelector('.leaflet-popup-content .ppop', { timeout: 5000 });
  await page.waitForTimeout(800);
  ok('Joyni bosganda xaritada popup ochiladi', /Yechim/.test(await page.textContent('.leaflet-popup-content')));
  const nProb0 = await page.evaluate(() => NX.state.model.problems.length);
  const schoolBefore = await page.evaluate(() => NX.state.model.problems.filter(p => p.type === 'school').length);
  await page.click('.leaflet-popup-content [data-fix="crossing"]');
  await page.waitForFunction(n => NX.state.model.problems.length < n, nProb0, { timeout: 10000 });
  const schoolAfter = await page.evaluate(() => NX.state.model.problems.filter(p => p.type === 'school').length);
  ok('“Oʻtish joyi bor” bosilsa maktab muammosi yoʻqoladi', schoolAfter === schoolBefore - 1, `${schoolBefore} → ${schoolAfter}`);
  const nL = await page.evaluate(() => NX.state.model.problems.length);
  await page.click('.locrow [data-act=fix][data-fix=dismiss]');
  await page.waitForFunction(n => NX.state.model.problems.length < n, nL, { timeout: 10000 });
  ok('Roʻyxatdagi “Muammo emas” tugmasi ishlaydi', await page.evaluate(() => NX.state.tab === 'problems'));
  await page.evaluate(() => { const p = NX.state.model.problems.find(x => x.type === 'junction'); NX.map.leaflet().setView([p.lat, p.lon], 17, { animate: false }); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const p = NX.state.model.problems.find(x => x.type === 'junction'); NX.map.leaflet().fire('click', { latlng: L.latLng(p.lat + 0.0002, p.lon + 0.0002) }); });
  await page.waitForTimeout(900);
  ok('Muammolar boʻlimida xarita bosilsa boʻlim oʻzgarmaydi, yaqin muammo ochiladi', await page.evaluate(() => NX.state.tab === 'problems' && !!NX.state.focusPid) && !!(await page.$('.locrow.on')));
  await page.click('.tabs [data-tab=report]');
  ok('Boshqa boʻlimda muammo belgilari yashiriladi', (await page.$$('.pmk:not(.inc):not(.fixmk)')).length === 0);
  // Kalitsiz Yandex vidjeti: probkalar + yoʻl hodisalari
  await page.click('#btnYandex');
  await page.waitForSelector('#ymap iframe', { timeout: 5000 });
  const ysrc = await page.getAttribute('#ymap iframe', 'src');
  ok('Yandex vidjeti probkalar bilan ochiladi (kalitsiz)', /map-widget\/v1/.test(ysrc) && /trf/.test(ysrc) && /trfe/.test(ysrc), ysrc);
  await page.click('#btnYandex');
  ok('Tahlil xaritasiga qaytish', await page.evaluate(() => document.getElementById('ymap').hidden));

  // Xarita ustidagi qidiruv
  await page.click('.tabs [data-tab=map]');
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

  // AI (kalit bilan) — chat
  await page.evaluate(() => { localStorage.setItem('nx:key:openai', JSON.stringify('sk-test')); });
  await page.click('.tabs [data-tab=ai]');
  await page.click('#chat [data-act=chat-reset]');
  await page.fill('#chat textarea[name=q]', 'Dagbitskiy koʻchasini bir tomonlama qilsak nima boʻladi?');
  await page.click('#chat form button');
  await page.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length === 2, null, { timeout: 90000 });
  const aiTxt = await page.textContent('#chat .chat-msg.ai .ai-text');
  const body = ctx.openaiBodies[ctx.openaiBodies.length - 1];
  const userMsg = body.messages[body.messages.length - 1].content;
  ok('AI: koʻcha aniqlanadi va simulyatsiya JSON yuboriladi', /Dagbitskiy/.test(userMsg) && /simulyatsiya/.test(userMsg) && /umumiy_yol_vaqti/.test(userMsg), 'model: ' + body.model);
  ok('AI: model ketma-ketligi (404 → keyingisi)', ctx.openaiBodies.some(b => b.model === 'gpt-5.4-mini') && body.model === 'gpt-5.5');
  ok('AI javobi koʻrsatiladi (ogohlantirishsiz)', /Hozirgi holat/.test(aiTxt) && !(await page.$('#chat .ai-src')));
  // Umumiy savol (koʻcha va stsenariysiz): AI ga real holat beriladi
  await page.fill('#chat textarea[name=q]', 'Hozir qaysi koʻchalar tirband va ob-havo qanday?');
  await page.click('#chat form button');
  await page.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length === 4, null, { timeout: 60000 });
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
  await p2.waitForSelector('#panel .live', { timeout: 20000 });
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
  await p4.waitForSelector('#panel .live', { timeout: 20000 });
  const sw = await p4.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok('Telefonda gorizontal aylantirish yoʻq', sw[0] <= sw[1], sw.join(' / '));
  const warn = await p4.textContent('#toast');
  ok('Yoʻnalishlar yuklanmasa ogohlantirish', /yoʻnalishlari yuklanmadi/.test(warn), warn);
  await p4.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/mobile.png', fullPage: false });
  for (const t of ['problems', 'report']) {
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
  const corr = { items: [], posts: [] };
  await ctx5.route(/cityjam-ai\.example\.workers\.dev\/corrections/, route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const b = JSON.parse(req.postData()); corr.posts.push(b);
      if (b.pin !== '4321') return route.fulfill({ status: 403, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: { code: 'bad_pin', message: 'PIN-kod notoʻgʻri' } }) });
      if (b.action === 'add') corr.items.push(Object.assign({ ts: Date.now() }, b.item));
    }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ items: corr.items }) });
  });
  const repStore = { items: [] };
  await ctx5.route(/cityjam-ai\.example\.workers\.dev\/reports/, route => {
    const req = route.request();
    if (req.method() === 'POST') { const b = JSON.parse(req.postData()); const item = Object.assign({ id: 'r' + repStore.items.length, ts: Date.now() }, b); repStore.items.push(item); return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ item }) }); }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ items: repStore.items }) });
  });
  const p5 = await ctx5.newPage();
  const e5 = watchErrors(p5);
  await p5.goto(BASE);
  await p5.waitForSelector('#panel .live', { timeout: 20000 });
  await p5.click('.tabs [data-tab=ai]');
  await p5.fill('#chat textarea', 'Registon koʻchasini yopsak nima boʻladi?');
  await p5.click('#chat form button');
  await p5.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length === 2, null, { timeout: 60000 });
  const aiTxt5 = await p5.textContent('#chat .chat-msg.ai .ai-text');
  ok('AI proksi orqali javob (brauzerda kalit yoʻq)', /Proksi javobi/.test(aiTxt5) && proxyReqs.length > 0 && proxyReqs.every(r => !r.auth) && ctx5.openaiBodies.length === 0, `soʻrovlar: ${proxyReqs.length}, model: ${proxyReqs[0] && proxyReqs[0].body.model}`);
  // PIN bilan tuzatish hamma uchun saqlanadi
  await p5.evaluate(() => localStorage.setItem('nx:fixes:pin', JSON.stringify('4321')));
  await p5.click('.tabs [data-tab=problems]');
  await p5.click('.prob .loc');
  await p5.waitForSelector('.leaflet-popup-content [data-fix="dismiss"]', { timeout: 5000 });
  await p5.waitForTimeout(800);
  await p5.click('.leaflet-popup-content [data-fix="dismiss"]');
  await p5.waitForFunction(() => /Hamma uchun saqlandi/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
  ok('PIN bilan tuzatish serverga (hamma uchun) saqlanadi', corr.items.length === 1 && corr.posts[0].pin === '4321' && corr.items[0].kind === 'dismiss');
  // Boshqa brauzer (yangi foydalanuvchi) ham shu tuzatishni koʻradi
  const p5b = await ctx5.newPage();
  await p5b.evaluate(() => localStorage.clear()).catch(() => {});
  await p5b.goto(BASE);
  await p5b.waitForFunction(k => NX.state.model && NX.fixes.list().some(x => x.key === k), corr.items[0].key, { timeout: 20000 });
  const hidden = await p5b.evaluate(k => !NX.state.model.problems.some(p => p.key === k), corr.items[0].key);
  ok('Boshqa foydalanuvchida ham muammo yopilgan koʻrinadi', hidden);
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
      const Coll = function () { this.items = []; this.add = o => this.items.push(o); this.each = f => this.items.forEach(f); };
      window.__balloon = 0;
      window.ymaps = {
        ready: cb => setTimeout(cb, 10),
        Map: function (id, o) { const self = this; this.c = o.center; this.z = o.zoom;
          this.geoObjects = { list: [], add(x) { this.list.push(x); }, remove(x) { this.list = this.list.filter(y => y !== x); }, get n() { return this.list.length; } };
          this.events = { add(ev, fn) { if (ev === 'click') window.__yaClick = fn; } };
          this.setCenter = (c, z) => { self.c = c; self.z = z || self.z; return Promise.resolve(); }; this.getCenter = () => self.c; this.getZoom = () => self.z; this.setZoom = z => { self.z = z; };
          this.setBounds = () => Promise.resolve(); this.balloon = { close() {} }; this.container = { fitToViewport() {} };
          document.getElementById(id).dataset.ymap = '1'; window.__ymap = this; },
        traffic: { provider: { Actual: function () { this.setMap = () => {}; this.state = { get: k => (k === 'level' ? 4 : null), events: { add() {} } }; } } },
        Polyline: function (ll, p, o) { this.ll = ll; this.o = o; },
        GeoObjectCollection: Coll,
        Placemark: function (c, p) { this.p = p; this.geometry = { getCoordinates: () => c }; this.balloon = { open() { window.__balloon++; } }; },
        templateLayoutFactory: { createClass: () => function () {} },
        panorama: { isSupported: () => true, locate: c => Promise.resolve(c[0] > 39 ? [{ c }] : []),
          Player: function (el, p) { el.dataset.pano = String(p.c[0]); this.destroy = () => { window.__panoDestroyed = true; }; } },
      };` });
  });
  const p6 = await ctx6.newPage();
  const e6 = watchErrors(p6);
  await p6.goto(BASE);
  await p6.waitForFunction(() => document.getElementById('ymap').dataset.ymap === '1' && !document.getElementById('ymap').hidden, null, { timeout: 20000 });
  ok('Yandex kaliti boʻlsa probkalar avtomatik ochiladi', /apikey=YA-TEST/.test(yaUrl));
  ok('Bitta xarita: Yandex ustida qidiruv va legend; almashtirish tugmasi yoʻq', /Yandex, real vaqt/.test(await p6.textContent('.nx-legend')) && (await p6.isVisible('.nx-search input')) && !(await p6.isVisible('#btnYandex')) && !(await p6.isVisible('.leaflet-control-layers, .nx-layers')));
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
  const deltaLines = await p6.evaluate(() => window.__ymap.geoObjects.list.reduce((t, c) => t + (c.items ? c.items.filter(x => x.o && (x.o.strokeColor === '#dc2626' || x.o.strokeColor === '#16a34a')).length : 0), 0));
  ok('Simulyatsiya natijasi Yandex xaritasining oʻzida chiziladi', !(await p6.evaluate(() => document.getElementById('ymap').hidden)) && deltaLines > 0, 'chiziqlar: ' + deltaLines);
  ok('Natija chiqqanda Yandex probkalari yashiriladi (yashil chiziqlar chalkashtirmaydi)', await p6.evaluate(() => !NX.yandex.trafficOn() && !!document.querySelector('.nx-legend [data-yatraffic]')));
  await p6.click('.nx-legend [data-yatraffic]');
  ok('Legenddagi tugma bilan real probkalar qaytadi', await p6.evaluate(() => NX.yandex.trafficOn()));
  // Muammolar Yandex’da: belgi + balloon + “Muammo emas” tugmasi
  await p6.click('.tabs [data-tab=problems]');
  const probMarks = await p6.evaluate(() => window.__ymap.geoObjects.list.reduce((t, c) => t + (c.items ? c.items.filter(x => x.p && x.p.balloonContent).length : 0), 0));
  ok('Muammo belgilari Yandex xaritasida', probMarks > 0 && !(await p6.evaluate(() => document.getElementById('ymap').hidden)), 'belgilar: ' + probMarks);
  await p6.click('.prob .loc');
  await p6.waitForFunction(() => window.__balloon > 0, null, { timeout: 5000 });
  const n6 = await p6.evaluate(() => NX.state.model.problems.length);
  await p6.evaluate(() => { const p = NX.state.model.problems[0]; const b = document.createElement('button'); b.dataset.fix = 'dismiss'; b.dataset.pid = p.id; document.getElementById('ymap').appendChild(b); b.click(); });
  await p6.waitForFunction(n => NX.state.model.problems.length < n, n6, { timeout: 10000 });
  ok('Yandex balloonidagi “Bu muammo emas” ishlaydi', true);
  // Real koʻrinish (Yandex panorama)
  await p6.click('.prob [data-pano]');
  await p6.waitForFunction(() => (document.getElementById('panoBox') || {}).dataset && document.getElementById('panoBox').dataset.pano, null, { timeout: 10000 });
  ok('“📷 Real koʻrinish” Yandex panoramasini ochadi', (await p6.isVisible('#panoDlg')) && /yandex\.uz\/maps.*panorama/.test(await p6.getAttribute('#panoLink', 'href')));
  await p6.click('[data-pano-close]');
  await p6.waitForFunction(() => window.__panoDestroyed === true && !document.getElementById('panoDlg').open, null, { timeout: 5000 });
  ok('Panorama yopilsa oʻyinchi tozalanadi', true);
  await p6.evaluate(() => NX.pano.open(1, 1, 'Boʻsh joy'));
  await p6.waitForFunction(() => /surat yoʻq/.test(document.getElementById('panoBox').textContent), null, { timeout: 5000 });
  ok('Surat boʻlmagan joyda tushunarli xabar', true);
  await p6.click('[data-pano-close]');
  await p6.click('.tabs [data-tab=map]');
  if (await p6.isVisible('#panel .back')) await p6.click('#panel .back');
  await p6.evaluate(() => { const s = NX.state.model.streets.find(x => x.name === 'Registon koʻchasi'); const w = NX.state.model.ways[s.ways[0]]; const p = w.ll[1]; window.__yaClick({ get: () => [p[0], p[1]] }); });
  await p6.waitForSelector('#panel .pano-cta', { timeout: 10000 });
  ok('Koʻcha panelida “Real koʻrinish” tugmasi', true);
  ok('Konsolda xato yoʻq (Yandex)', e6.length === 0, e6.join(' || '));

  // ---------- 7. Yandex kaliti ishlamasa → kalitsiz vidjet ----------
  const ctx7 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await setupRoutes(ctx7);
  await ctx7.route(/\/js\/keys\.js/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CITYJAM_KEYS = { yandex: 'LIMIT-TUGAGAN' };" }));
  await ctx7.route(/api-maps\.yandex\.ru/, route => route.abort('failed'));
  const p7 = await ctx7.newPage();
  await p7.goto(BASE);
  await p7.waitForSelector('#btnYandex:not([hidden])', { timeout: 30000 });
  await p7.click('#btnYandex');
  await p7.waitForSelector('#ymap iframe', { timeout: 10000 });
  ok('Yandex kaliti ishlamasa: zaxira xarita + tugma bilan kalitsiz probkalar', /map-widget/.test(await p7.getAttribute('#ymap iframe', 'src')));
  await p7.evaluate(() => NX.pano.open(39.65, 66.97, 'Test'));
  await p7.waitForFunction(() => /yuklanmadi/.test(document.getElementById('panoBox').textContent), null, { timeout: 10000 });
  ok('Yandex ishlamasa panorama oʻrniga Yandex havolasi taklif qilinadi', /yandex\.uz\/maps/.test(await p7.getAttribute('#panoLink', 'href')));

  // ---------- 8. Real surat bilan tekshiruv: Mapillary + AI (surat, internet, rasm) ----------
  const ctx8 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setupRoutes(ctx8);
  await ctx8.route(/\/js\/keys\.js/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CITYJAM_KEYS = { tomtom: '', mapillary: 'MLY|TEST', aiProxy: 'https://cityjam-ai.example.workers.dev' };" }));
  const H = { 'Access-Control-Allow-Origin': '*' };
  let featCalls = 0;
  const mly = { tokens: new Set() };
  await ctx8.route(/graph\.mapillary\.com/, route => {
    const u = new URL(route.request().url());
    mly.tokens.add(u.searchParams.get('access_token'));
    const [w, so, e, n] = u.searchParams.get('bbox').split(',').map(Number), c = [(w + e) / 2, (so + n) / 2];
    if (/\/images/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ data: [{ id: '123', captured_at: Date.UTC(2025, 5, 1), thumb_1024_url: 'https://scontent.example.fbcdn.net/t.jpg', computed_geometry: { type: 'Point', coordinates: [c[0] + 0.0001, c[1]] } }] }) });
    featCalls++;
    route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ data: (Math.round(c[0] * 1e4) + Math.round(c[1] * 1e4)) % 3 === 0 ? [{ id: 'f1', object_value: 'object--traffic-light--general-upright', geometry: { type: 'Point', coordinates: c }, last_seen_at: Date.UTC(2025, 5, 1) }] : [] }) });
  });
  await ctx8.route(/fbcdn\.net/, route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const px = { chat: [], search: 0, image: [] };
  const pc = { store: {}, posts: 0 };
  await ctx8.route(/cityjam-ai\.example\.workers\.dev/, route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/version') return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ v: 3 }) });
    if (path === '/photo-checks') return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ items: pc.store }) });
    if (path === '/photo-check') {
      const q = JSON.parse(req.postData()); pc.posts++;
      const it = { signal: pc.posts % 2 ? 'bor' : 'yoq', crossing: 'noaniq', note: 'Sinov.', photoId: q.photoId };
      pc.store[q.key] = it;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(it) });
    }
    if (path === '/corrections' || path === '/reports') return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: '{"items":[]}' });
    const b = JSON.parse(req.postData() || '{}');
    if (path === '/search') { px.search++; return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ text: 'Hokimiyat 2026-yilda svetofor qoʻyishni rejalashtirgan.', sources: [{ url: 'https://samarkand.uz/news/1', title: 'Samarqand hokimligi' }] }) }); }
    if (path === '/image') { px.image.push(b); return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ b64: PNG.toString('base64'), edited: !!b.photo }) }); }
    px.chat.push(b);
    if (/Faqat JSON/.test(b.messages[0].content)) return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ choices: [{ message: { content: '{"svetofor":"bor","piyoda_otish":"noaniq","izoh":"Chorrahada svetofor ustuni koʻrinadi."}' } }] }) });
    route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ choices: [{ message: { content: '**Svetofor:** suratda koʻrinmayapti\n**Nima qilish kerak:** sanash.' } }] }) });
  });
  const p8 = await ctx8.newPage();
  const e8 = watchErrors(p8);
  await p8.goto(BASE);
  await p8.waitForSelector('#panel .live', { timeout: 20000 });
  await p8.click('.tabs [data-tab=problems]');
  // Avtomatik tekshiruv: sahifa ochilganda Mapillary + AI; muammo emaslari olib tashlanadi
  await p8.waitForFunction(() => NX.state.review && !NX.state.review.busy, null, { timeout: 60000 });
  const rv = await p8.evaluate(() => ({ fixed: NX.state.review.fixed.length, by: [...new Set(NX.state.review.fixed.map(f => f.by))], keys: NX.state.review.fixed.map(f => f.key), left: NX.state.model.problems.filter(p => p.type === 'junction').length }));
  const gone = await p8.evaluate(keys => keys.every(k => !NX.state.model.problems.some(p => p.key === k)), rv.keys);
  ok('Avtomatik (tugmasiz): Mapillary va AI suratda svetofor koʻrgan joylar olib tashlanadi', rv.fixed > 0 && gone && rv.by.includes('Mapillary') && rv.by.includes('AI') && rv.left > 0 && pc.posts > 0, JSON.stringify(rv.by) + ' qoldi: ' + rv.left);
  ok('Olib tashlangan joylar xaritada yashil belgi boʻlib qolmaydi', (await p8.$$('.leaflet-marker-icon.fixmk')).length === 0);
  ok('Tekshiruv kartasida soʻrovchi tugma yoʻq', !(await p8.$('#reviewCard [data-act=review-ai]')) && /olib tashlandi/.test(await p8.textContent('#reviewCard')));
  const jCard = '.prob:has-text("Svetoforsiz chorraha")';
  await p8.click(`${jCard} [data-act=verify] >> nth=0`);
  await p8.waitForSelector(`${jCard} .vbox .vverdict`, { timeout: 15000 });
  ok('🔎 Tekshirish: xulosa va real surat', (await p8.isVisible(`${jCard} .vphoto img`)) && /Mapillary/.test(await p8.textContent(`${jCard} .vphoto`)) && mly.tokens.has('MLY|TEST'), await p8.textContent(`${jCard} .vverdict`));
  await p8.click(`${jCard} [data-act=verify-ai]`);
  await p8.waitForSelector(`${jCard} .vpart .ai-text`, { timeout: 15000 });
  const vb = px.chat[px.chat.length - 1];
  const parts = vb && vb.messages[1].content;
  ok('🤖 AI suratni koʻradi (rasm havolasi Worker’ga yuboriladi)', Array.isArray(parts) && parts.some(x => x.type === 'image_url' && /fbcdn/.test(x.image_url.url)) && /Svetofor/.test(await p8.textContent(`${jCard} .vpart`)));
  await p8.click(`${jCard} [data-act=verify-web]`);
  await p8.waitForSelector(`${jCard} .vsrc a`, { timeout: 15000 });
  ok('🌐 Internetdan qidiruv: javob va manba havolasi', px.search === 1 && /samarkand\.uz/.test(await p8.getAttribute(`${jCard} .vsrc a`, 'href')));
  await p8.click(`${jCard} [data-act=verify-img]`);
  await p8.waitForSelector(`${jCard} .vgen img`, { timeout: 15000 });
  ok('🎨 AI rasm: real surat ustiga, “haqiqiy emas” belgisi bilan', /haqiqiy emas/.test(await p8.textContent(`${jCard} .vgen`)) && px.image[0] && /fbcdn/.test(px.image[0].photo));
  if (process.env.SHOT) { await p8.evaluate(() => document.querySelector('#reviewCard').scrollIntoView()); await p8.screenshot({ path: process.env.SHOT }); }
  await p8.click('#reviewCard details summary');
  await p8.click('#reviewCard [data-act=review-undo] >> nth=0');
  await p8.waitForTimeout(500);
  const und = await p8.evaluate(() => { const keep = JSON.parse(localStorage.getItem('nx:review:keep') || '[]'); return { keep, back: keep.filter(k => NX.state.model.problems.some(p => p.key === k)).length }; });
  ok('“Baribir muammo” — joy qaytariladi', und.back === 1, JSON.stringify(und));
  // Ikkinchi foydalanuvchi: AI natijalari umumiy — qayta pul sarflanmaydi
  const postsBefore = pc.posts;
  const p8b = await ctx8.newPage();
  await p8b.addInitScript(() => localStorage.clear());
  await p8b.goto(BASE);
  await p8b.waitForFunction(() => NX.state.review && !NX.state.review.busy && NX.state.review.ts, null, { timeout: 60000 });
  ok('AI natijasi umumiy: boshqa foydalanuvchida qayta soʻralmaydi', pc.posts === postsBefore && (await p8b.evaluate(() => NX.state.review.fixed.some(f => f.by === 'AI'))), `yangi soʻrovlar: ${pc.posts - postsBefore}`);
  await p8b.close();
  ok('Konsolda xato yoʻq (Mapillary)', e8.length === 0, e8.join(' || '));

  // ---------- 9. Hududni erkin chizish va “bu yerga dom qursak?” ----------
  const ctx9 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setupRoutes(ctx9);
  const p9 = await ctx9.newPage();
  const e9 = watchErrors(p9);
  await p9.goto(BASE);
  await p9.waitForSelector('#panel .live', { timeout: 20000 });
  await p9.evaluate(() => { if (NX.state.widgetOn) document.getElementById('btnYandex').click(); });
  ok('parseBuild: “300 xonadonli 12 etajli dom”', await p9.evaluate(() => { const r = NX.area.parseBuild('300 xonadonli 12 etajli dom qursak'); return r.flats === 300 && r.floors === 12; }));
  await p9.click('#btnDraw');
  await p9.waitForSelector('.draw-ov svg', { timeout: 5000 });
  const c9 = await p9.evaluate(() => { const M = NX.state.model, s = M.streets.find(x => x.name === 'Registon koʻchasi'); const map = NX.map.leaflet(); map.setView(s.center, 16, { animate: false }); const r = document.getElementById('map').getBoundingClientRect(); const p = map.latLngToContainerPoint(s.center); return { x: r.left + p.x, y: r.top + p.y }; });
  await p9.mouse.move(c9.x + 160, c9.y);
  await p9.mouse.down();
  for (let k = 1; k <= 40; k++) { const t = (k / 40) * Math.PI * 2; await p9.mouse.move(c9.x + 160 * Math.cos(t), c9.y + 130 * Math.sin(t)); }
  await p9.mouse.up();
  await p9.waitForFunction(() => NX.state.area, null, { timeout: 5000 });
  const st9 = await p9.evaluate(() => ({ ha: NX.state.area.st.areaHa, streets: NX.state.area.st.streets.length, probs: NX.state.area.st.problems.length }));
  ok('Sichqoncha bilan erkin chizilgan hudud tahlil qilinadi', st9.ha > 1 && st9.streets > 0 && /Belgilangan hudud/.test(await p9.textContent('#panel h2')) && !(await p9.$('.draw-ov')), JSON.stringify(st9));
  ok('Hudud panelida AI tahlil asosiy (alohida “Taxmin” boʻlimi yoʻq)', (await p9.isVisible('#areaChat textarea')) && !(await p9.$('#areaBuild')));
  await p9.click('#areaChat [data-act=area-ask] >> nth=0');
  await p9.waitForFunction(() => NX.state.area.res && !NX.state.area.busy && NX.state.area.qa.length === 2 && !NX.state.area.qaBusy, null, { timeout: 90000 });
  const r9 = await p9.evaluate(() => ({ res: NX.state.area.res.b.residents, trips: NX.state.area.res.sim.build && NX.state.area.res.sim.build.trips, deltas: NX.map.hasDeltas() }));
  ok('500 xonadon: aholi, mashinalar, yuklama xaritada', r9.res === 2000 && r9.trips === 150 && r9.deltas, JSON.stringify(r9));
  const aTxt = await p9.textContent('#areaChat .chat-msg.ai .ai-text');
  ok('Javob: yutuqlar, muammolar, tavsiyalar va kelajak (5 yil)', /Yutuqlar/.test(aTxt) && /Muammolar/.test(aTxt) && /Nima qilish kerak/.test(aTxt) && /5 yildan keyin/.test(aTxt));
  ok('Bino safarlari mahalla koʻchalariga ham tarqaladi (bir nechta chiqish)', await p9.evaluate(() => NX.state.area.res.sim.deltas.length / 2 >= 6), await p9.evaluate(() => String(NX.state.area.res.sim.deltas.length / 2)));
  if (process.env.SHOT2) { await p9.evaluate(() => document.querySelector('#areaChat').scrollIntoView()); await p9.screenshot({ path: process.env.SHOT2 }); }
  await p9.click('.tabs [data-tab=ai]');
  await p9.fill('#chat textarea[name=q]', 'Bu hududga 300 xonadonli 12 qavatli dom qursak nima boʻladi?');
  await p9.click('#chat form button');
  await p9.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length === 2, null, { timeout: 90000 });
  ok('AI yordamchi chatida ham hudud va qurilish tahlili', await p9.evaluate(() => NX.state.area.spec.flats === 300 && NX.state.area.spec.floors === 12 && NX.state.area.res.b.residents === 1200));
  await p9.click('.tabs [data-tab=map]');
  await p9.click('[data-act=area-clear]');
  ok('Hududni olib tashlash', await p9.evaluate(() => NX.state.area === null && !NX.map.hasDeltas()));
  ok('Konsolda xato yoʻq (hudud)', e9.length === 0, e9.join(' || '));

  await browser.close();
  console.log(results.map(r => r.join('  ')).join('\n'));
  console.log(`\n${results.filter(r => r[0] === 'OK  ').length}/${results.length} tekshiruv oʻtdi`);
})().catch(e => { console.error(e); process.exit(1); });
