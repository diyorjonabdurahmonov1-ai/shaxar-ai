/* Brauzer testi (Playwright): tarmoq soʻrovlari sintetik javoblar bilan almashtiriladi.
   Ishga tushirish: npx http-server -p 8765 -s . &  NODE_PATH=$(npm root -g) node tests/e2e.cjs */
'use strict';
const { chromium } = require('playwright');
const { build } = require('./fixture.cjs');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const FX = build();
// Sintetik relyef plitasi (Terrarium PNG, faqat test): shimolga koʻtarilgan tekislik + (39.650, 66.980) da botiq
const zlib = require('zlib');
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function terrTile(z, x, y) {
  const n = 2 ** z, buf = Buffer.alloc(256 * 256 * 4);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const lon = ((x + (i + 0.5) / 256) / n) * 360 - 180, lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (j + 0.5) / 256)) / n))) * 180) / Math.PI;
    const e = 700 + (lat - 39.60) * 1500 - 6 * Math.exp(-(((lat - 39.650) / 0.0025) ** 2 + ((lon - 66.980) / 0.0032) ** 2)), v = e + 32768, k = (j * 256 + i) * 4;
    buf[k] = Math.floor(v / 256); buf[k + 1] = Math.floor(v) % 256; buf[k + 2] = Math.floor((v % 1) * 256); buf[k + 3] = 255;
  }
  return png(256, 256, buf);
}
// Sintetik binolar (faqat test): markaz atrofida 12×12 kvadrat, baʼzilarida qavatlar soni bor
const BLD = { elements: [] };
for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
  const la = 39.6460 + i * 0.0012, lo = 66.9600 + j * 0.0016, d = 0.00012;
  const geometry = [[la, lo], [la, lo + d * 1.3], [la + d, lo + d * 1.3], [la + d, lo], [la, lo]].map(([lat, lon]) => ({ lat, lon }));
  const tags = { building: (i + j) % 7 === 0 ? 'school' : (i + j) % 3 === 0 ? 'apartments' : 'house' };
  if ((i + j) % 3 === 0) tags['building:levels'] = String(4 + (i % 5));
  BLD.elements.push({ type: 'way', id: 800000 + i * 100 + j, geometry, tags });
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const results = [];
const ok = (name, cond, extra) => { results.push([cond ? 'OK  ' : 'FAIL', name, extra || '']); if (!cond) process.exitCode = 1; };

async function setupRoutes(ctx, opts = {}) {
  ctx.overpassCalls = 0; ctx.openaiBodies = [];
  // Test sayt egasining haqiqiy kalitiga bogʻliq boʻlmasligi uchun keys.js boʻsh kalit bilan almashtiriladi
  await ctx.route(/\/js\/keys\.js/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CITYJAM_KEYS = { tomtom: '' };" }));
  // Butun shahar binolari fayli: testda — OSM mock (alohida test haqiqiy faylni tekshiradi)
  if (!opts.realBuildings) await ctx.route(/data\/buildings-samarqand\.json/, route => route.abort('failed'));
  await ctx.route(/overpass|maps\.mail\.ru/, async route => {
    ctx.overpassCalls++;
    if (opts.overpassDown) return route.abort('failed');
    const body = decodeURIComponent((route.request().postData() || '').replace(/\+/g, ' '));
    const isRoutes = /relation\["type"="route"\]/.test(body);
    // Ochiq joylar (yigʻilish joylari) va mahalla nomi; hudud atrofidagi xizmatlar (maktab, dorixona…)
    if (/"leisure"~"\^\(park\|garden\|pitch\|stadium/.test(body)) { const sq = (la, lo, d, tags) => ({ type: 'way', id: Math.round(la * 1e5 + lo), tags, bounds: { minlat: la, minlon: lo, maxlat: la + d, maxlon: lo + d * 1.3 }, center: { lat: la + d / 2, lon: lo + d * 0.65 } });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements: [sq(39.6520, 66.9700, 0.0010, { leisure: 'park', name: 'Sinov bogʻi' }), sq(39.6620, 66.9620, 0.0008, { place: 'square', name: 'Sinov maydoni' }), { type: 'node', id: 5, lat: 39.6500, lon: 66.9700, tags: { place: 'neighbourhood', name: 'Sinov mahallasi' } }] }) }); }
    if (/fire_station/.test(body)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements: [{ type: 'node', id: 11, lat: 39.6470, lon: 66.9610, tags: { amenity: 'fire_station', name: 'Sinov oʻt oʻchirish qismi' } }, { type: 'node', id: 12, lat: 39.6560, lon: 66.9760, tags: { amenity: 'hospital', name: 'Sinov shifoxonasi' } }] }) });
    if (/"amenity"~"\^\(kindergarten/.test(body)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements: [{ type: 'node', id: 1, lat: 39.6465, lon: 66.9605, tags: { amenity: 'school', name: 'Sinov maktabi' } }, { type: 'node', id: 2, lat: 39.6700, lon: 66.9950, tags: { amenity: 'pharmacy' } }] }) });
    if (/way\["building"\]/.test(body)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(BLD) });
    if (opts.routesDown && isRoutes) return route.fulfill({ status: 504, body: 'timeout' });
    await new Promise(r => setTimeout(r, 150));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(isRoutes ? FX.routes : FX.streets) });
  });
  // Relyef: sintetik — markazdan janubi-sharqda botiq joy; quyosh arxivi; soatlik yogʻin
  await ctx.route(/elevation-tiles-prod\/terrarium/, route => { const m = route.request().url().match(/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/); route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: terrTile(+m[1], +m[2], +m[3]) }); });
  await ctx.route(/archive-api\.open-meteo\.com/, route => {
    if (!/temperature_2m_mean/.test(route.request().url())) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ daily: { time: [], shortwave_radiation_sum: Array(365).fill(18) } }) });
    // Sintetik iqlim (faqat test): isish 0.3°C/10 yil, yogʻin ~1 mm/kun, har yili bitta kuchli kun
    const time = [], T = [], P = [], y1 = new Date().getFullYear() - 1;
    for (let d = Date.UTC(1991, 0, 1); d <= Date.UTC(y1, 11, 31); d += 86400e3) { const dt = new Date(d), y = dt.getUTCFullYear(), doy = (d - Date.UTC(y, 0, 1)) / 86400e3; time.push(dt.toISOString().slice(0, 10)); T.push(14.5 + 0.03 * (y - 1991) - 12 * Math.cos((2 * Math.PI * (doy - 15)) / 365)); P.push(doy === 100 ? 20 + (y % 7) * 3 : doy % 9 === 0 ? 8 : 0); }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ daily: { time, temperature_2m_mean: T, precipitation_sum: P } }) });
  });
  await ctx.route(/api\.open-meteo\.com\/v1\/elevation/, route => {
    const u = new URL(route.request().url()), la = u.searchParams.get('latitude').split(',').map(Number), lo = u.searchParams.get('longitude').split(',').map(Number);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elevation: la.map((a, i) => 700 + (a - 39.64) * 2000 - 8 * Math.exp(-(((a - 39.650) / 0.002) ** 2 + ((lo[i] - 66.980) / 0.003) ** 2))) }) });
  });
  await ctx.route(/api\.open-meteo\.com\/v1\/forecast.*hourly=precipitation/, route => {
    const t0 = Date.now(), time = [], precipitation = [];
    for (let h = 0; h < 72; h++) { const d = new Date(t0 + h * 3600e3 + 5 * 3600e3); time.push(d.toISOString().slice(0, 13) + ':00'); precipitation.push(h > 2 && h < 10 ? 2.5 : 0); }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ hourly: { time, precipitation } }) });
  });
  await ctx.route(/api\.open-meteo\.com\/v1\/forecast(?!.*hourly=precipitation)/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ current: { time: '2026-10-26T12:00', temperature_2m: 17.4, apparent_temperature: 16.1, precipitation: 0.6, rain: 0.6, snowfall: 0, weather_code: 61, wind_speed_10m: 12, visibility: 9000 } }) }));
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
    if (b.model === 'gpt-5.4-mini' || /^gpt-6/.test(b.model || '')) return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: { code: 'model_not_found', message: 'The model does not exist' } }) });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: '**Hozirgi holat**\nSinov javobi.\n\n**Nima boʻladi**\n…\n\n**Xavflar**\n…\n\n**Eng yaxshi yechim**\n1. …' } }] }) });
  });
  await ctx.route(/yandex\.uz\/map-widget/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Yandex</body></html>' }));
  await ctx.route(/tile\.openstreetmap\.org|arcgisonline/, route => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG }));
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
  ok('6 ta boʻlim: Xarita, Muammolar, Tizimlar, 3D egizak, AI yordamchi, Hisobot', tabs.join(',') === 'Xarita,Muammolar,Tizimlar,3D egizak,AI yordamchi,Hisobot', tabs.join(','));
  if (process.env.SHOT4) await page.screenshot({ path: process.env.SHOT4 });
  // 3D egizak: binolar 3D da, quyosh salohiyati, suv toshqini (relyef + yogʻin)
  await page.click('.tabs [data-tab=twin]');
  await page.waitForFunction(() => NX.state.twin && !NX.state.twin.loading && NX.state.twin.buildings && NX.state.twin.flood && NX.state.twin.ghi, null, { timeout: 30000 });
  await page.waitForFunction(() => NX.map3d.map() && NX.map3d.map().getSource('bld'), null, { timeout: 20000 });
  const tw = await page.evaluate(() => ({ n: NX.state.twin.buildings.length, est: NX.state.twin.buildings.filter(b => b.est).length, ghi: NX.state.twin.ghi.kwh, hot: NX.state.twin.flood.hot.length, rain: NX.state.twin.rain && NX.state.twin.rain.d24, vis: !document.getElementById('map3d').hidden }));
  ok('3D egizak: binolar (OSM) 3D xaritada, qavati yoʻqlari belgilanadi', tw.n === 144 && tw.est > 0 && tw.vis, JSON.stringify(tw));
  await page.waitForFunction(() => NX.state.twin.climate, null, { timeout: 20000 });
  const cl = await page.evaluate(() => ({ n: NX.state.twin.climate.years.length, tr: NX.state.twin.climate.trend10, top: NX.state.twin.climate.top[0].p }));
  if (process.env.SHOT10) await page.locator('#panel section:has(.clim-svg)').screenshot({ path: process.env.SHOT10 });
  ok('Iqlim: 1991-yildan yillik harorat/yogʻin (arxiv), isish tezligi, eng kuchli kunlar, Oʻzgidromet meʼyori', cl.n >= 34 && Math.abs(cl.tr - 0.3) < 0.05 && cl.top >= 20 && /Oʻzgidromet/.test(await page.textContent('#panel')) && (await page.$$('#panel .clim-svg')).length === 3 && /data\.egov\.uz/.test(await page.textContent('#panel')), JSON.stringify(cl));
  ok('Quyosh: real yillik nurlanish va tomlar salohiyati', tw.ghi === 1825 && /mln kVt·soat\/yil/.test(await page.textContent('#panel')));
  ok('Suv toshqini: real relyef (Terrarium) botiqlari va yogʻin prognozi', tw.hot > 0 && tw.rain >= 15 && /Keyingi 24 soatda/.test(await page.textContent('#panel')) && /AWS Terrain/.test(await page.textContent('#panel')), JSON.stringify({ hot: tw.hot, rain: tw.rain, t24: /Keyingi 24 soatda/.test(await page.textContent('#panel')), aws: /AWS Terrain/.test(await page.textContent('#panel')) }));
  await page.click('[data-act=twin-mode][data-mode=flood]');
  ok('Toshqin rejimi: yomgʻir tanlanmaguncha xaritada kvadrat ham, suv ham yoʻq', await page.evaluate(() => NX.map3d.mode() === 'flood' && NX.map3d.map().getSource('water')._data.features.length === 0 && NX.map3d.map().getSource('flood')._data.features.length === 0));
  const noNodes = await page.evaluate(() => { const T = NX.state.twin, R = T.roads.map(w => Object.assign({}, w, { nodes: w.ll.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)) })); const sc = NX.twin.streetScenario(T.dem, R, 80); return sc.segs.length; });
  ok('Koʻchalar tarmogʻi tugun raqamlarisiz ham tuziladi (koordinata boʻyicha)', noNodes > 0, String(noNodes));
  // 2D fizik model (LISFLOOD-FP): vaqt boʻyicha, koʻchalar boʻylab (tugmalar “Qoʻshimcha maʼlumot” ichida)
  ok('3D egizak: asosiy oynada AI chat; qoʻshimcha maʼlumot yopiq; tayyor savollar yoʻq', !(await page.$eval('details.extra', d => d.open)) && (await page.isVisible('#twinChat textarea')) && !(await page.$('#twinChat .chip')));
  await page.click('details.extra > summary');
  await page.click('[data-act=twin-rain][data-mm="80"]');
  await page.waitForFunction(() => NX.state.twin.dyn && !NX.state.twin.dynBusy, null, { timeout: 180000 });
  const d80 = await page.evaluate(() => { const R = NX.state.twin.dyn; return { frames: R.frames.length, peak: R.peak.km, steps: R.steps, st: R.streets.length, top: R.streets[0] && R.streets[0].name, lines: NX.map3d.map().getSource('water')._data.features.length, sq: NX.map3d.map().getSource('flood')._data.features.length }; });
  ok('2D fizik model: suv vaqt boʻyicha (LISFLOOD-FP), real koʻchalar boʻylab, kvadratsiz', d80.frames > 5 && d80.steps > 50 && d80.peak > 0 && d80.st > 0 && d80.lines > 0 && d80.sq === 0 && /koʻchasi/.test(d80.top), JSON.stringify(d80));
  await page.fill('[data-input=twin-t]', '1');
  await page.dispatchEvent('[data-input=twin-t]', 'input');
  const early = await page.evaluate(() => ({ f: NX.state.twin.dynFrame, n: NX.map3d.map().getSource('water')._data.features.length }));
  ok('Vaqt shkalasi: boshida suv kam, eng yuqori paytda koʻp; ▶ tugmasi bor', early.f === 1 && early.n <= d80.lines && !!(await page.$('[data-act=twin-play]')), JSON.stringify(early));
  if (process.env.SHOT9) { await page.evaluate(() => document.querySelector('#dynInfo').scrollIntoView()); await page.fill('[data-input=twin-t]', '7'); await page.dispatchEvent('[data-input=twin-t]', 'input'); await page.waitForTimeout(2500); await page.screenshot({ path: process.env.SHOT9 }); }
  await page.click('[data-act=twin-rain][data-mm="10"]');
  await page.waitForFunction(() => NX.state.twin.dyn && NX.state.twin.dyn.label === '10 mm, 1 soatda' && !NX.state.twin.dynBusy, null, { timeout: 180000 });
  ok('Kam yomgʻir — kamroq suvli koʻcha', await page.evaluate(p => NX.state.twin.dyn.peak.km < p, d80.peak));
  await page.fill('#twinChat textarea[name=tq]', '50 mm kuchli yomgʻir yogʻsa qaysi koʻchalarni suv bosadi?');
  await page.click('#twinChat form button');
  await page.waitForFunction(() => NX.state.twinChat && !NX.state.twinChat.busy && NX.state.twinChat.msgs.length === 2, null, { timeout: 180000 });
  ok('3D egizak chati: savoldagi 50 mm hisoblanadi, xaritada koʻrinadi (AI ulanmagan — sayt hisobi)', /50 mm yomgʻirda/.test(await page.textContent('#twinChat .chat-msg.ai .ai-text')) && (await page.evaluate(() => NX.state.twin.dyn.label === '50 mm, 1 soatda' && NX.map3d.mode() === 'flood')));
  // Favqulodda vaziyat: zarar zonalari va evakuatsiya yoʻllari koʻcha tarmogʻida hisoblanib, xaritada chiziladi
  await page.fill('#twinChat textarea[name=tq]', '9 ballik zilzila boʻlsa qayer koʻp zarar koʻradi va evakuatsiya uchun qaysi yoʻl xavfsiz?');
  await page.click('#twinChat form button');
  await page.waitForFunction(() => !NX.state.twinChat.busy && NX.state.twinChat.msgs.length === 4, null, { timeout: 180000 });
  const hz = await page.evaluate(() => { const H = NX.state.twin.hz; return { kind: H.kind, I: H.I, z: H.zones.length, r: H.routes.length, pl: H.routes[0] && H.routes[0].path.length, sh: H.shelters.map(s => s.name), f3: NX.map3d.map().getSource('hz')._data.features.length, pins: document.querySelectorAll('.hz-pin').length, list: document.querySelectorAll('#twinChat .hz-list li').length, mode: NX.map3d.mode() }; });
  ok('Zilzila: xavfli zonalar, xavfsiz yoʻllar (koʻchalar boʻylab) va yigʻilish joylari xaritada', hz.kind === 'quake' && hz.I === 9 && hz.z > 0 && hz.r > 0 && hz.pl > 2 && hz.f3 >= hz.z + hz.r && hz.pins > 0 && hz.list > 0 && hz.mode === 'quake' && hz.sh.some(n => /Sinov/.test(n)), JSON.stringify(hz));
  await page.fill('#twinChat textarea[name=tq]', '50 mm yomgʻirda suv toshsa evakuatsiya uchun eng baland joy qayer?');
  await page.click('#twinChat form button');
  await page.waitForFunction(() => !NX.state.twinChat.busy && NX.state.twinChat.msgs.length === 6, null, { timeout: 240000 });
  const hf = await page.evaluate(() => { const H = NX.state.twin.hz; return { kind: H.kind, r: H.routes.length, up: H.routes.map(r => r.up), t: H.targets.length, high: H.high.length, f3: NX.map3d.map().getSource('hz')._data.features.length }; });
  ok('Suv toshqini: suvli koʻchadan quruq va baland joyga yoʻl, eng baland joylar xaritada', hf.kind === 'flood' && hf.r > 0 && hf.t > 0 && hf.high > 0 && hf.f3 > 0 && hf.up.every(u => u >= 0), JSON.stringify(hf));
  // Savollar katalogi: har bir savol toʻgʻri hisobga yoʻnaltiriladi
  const cat = await page.evaluate(() => NX.QUESTIONS.flatMap(g => g.q).map(([q, k]) => ({ q, k, got: NX.intent(q).main })).filter(x => x.got !== x.k));
  ok('Savollar katalogi (30+ savol): har biri oʻz hisobiga yoʻnaltiriladi; “Nimalarni soʻrash mumkin” roʻyxati chatda', cat.length === 0 && (await page.evaluate(() => NX.QUESTIONS.flatMap(g => g.q).length)) >= 30 && !!(await page.$('#twinChat .ask-help')), JSON.stringify(cat));
  // Har bir mahalla uchun evakuatsiya rejasi: sigʻim boʻyicha taqsimot, vaqt, zaxira yoʻl
  await page.fill('#twinChat textarea[name=tq]', 'Zilzilada har bir mahalla aholisini qaysi yoʻldan qayerga evakuatsiya qilamiz?');
  await page.click('#twinChat form button');
  await page.waitForFunction(() => !NX.state.twinChat.busy && NX.state.twinChat.msgs.length === 8, null, { timeout: 240000 });
  const hm = await page.evaluate(() => { const H = NX.state.twin.hz; return { kind: H.kind, mh: H.byMahalla, r: H.routes.map(r => ({ from: r.fromName, ppl: r.ppl, min: r.min, tot: r.totalMin, nar: r.narrowM, bk: !!r.backup })), sh: H.shelters.map(x => ({ n: x.name, a: x.assigned, c: x.cap })), facts: !!H.facts.evakuatsiya_rejasi }; });
  ok('Mahallalar boʻyicha evakuatsiya rejasi: odamlar sigʻim boʻyicha taqsimlanadi, chiqib ketish vaqti va eng tor joy hisoblanadi', hm.kind === 'quake' && hm.mh && hm.r.length > 0 && hm.r.some(r => /Sinov mahallasi/.test(r.from)) && hm.r.every(r => r.tot >= r.min && r.nar > 0 && r.ppl > 0) && hm.facts, JSON.stringify(hm));
  // Yongʻin: oʻt oʻchiruvchilar qayerga necha daqiqada yetadi (koʻp manbali Dijkstra)
  await page.fill('#twinChat textarea[name=tq]', 'Yongʻin boʻlsa oʻt oʻchiruvchilar qaysi hududlarga 10 daqiqada yetib bora olmaydi?');
  await page.click('#twinChat form button');
  await page.waitForFunction(() => !NX.state.twinChat.busy && NX.state.twinChat.msgs.length === 10, null, { timeout: 180000 });
  const fsv = await page.evaluate(() => { const H = NX.state.twin.hz; return { kind: H.kind, svc: H.svc, st: H.stations.length, cover: H.cover, route: H.route && H.route.min, pins: document.querySelectorAll('.hz-pin').length }; });
  ok('Yongʻin xizmati: stansiyalar, meʼyorda (10 daq.) yetiladigan foiz, uzoq hududlar va yoʻl xaritada', fsv.kind === 'svc' && fsv.svc === 'fire' && fsv.st === 1 && fsv.cover != null && fsv.pins > 0, JSON.stringify(fsv));
  // AI yordamchi (asosiy chat) ham shu hisobga ulanadi — javob 2D xaritada
  await page.click('.tabs [data-tab=ai]');
  await page.fill('#chat textarea[name=q]', 'Suv toshsa odamlarni qaysi yoʻldan baland joyga olib chiqamiz?');
  await page.click('#chat form button');
  await page.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length >= 2 && NX.state.chat.msgs[NX.state.chat.msgs.length - 1].role === 'ai', null, { timeout: 240000 });
  const mc = await page.evaluate(() => { const m = NX.state.chat.msgs[NX.state.chat.msgs.length - 1]; return { hz: m.hz ? m.hz.length : 0, list: document.querySelectorAll('#chat .hz-list li').length, ann: document.querySelectorAll('.leaflet-marker-icon.ann').length, kind: NX.state.twin.hz.kind }; });
  ok('AI yordamchi chatida ham: favqulodda savol hisoblanadi, yoʻllar 2D xaritada va roʻyxatda', mc.hz > 0 && mc.list > 0 && mc.ann > 0 && mc.kind === 'flood', JSON.stringify(mc));
  await page.click('#chat [data-act=chat-reset]');
  await page.click('.tabs [data-tab=map]');
  ok('Favqulodda vaziyat natijasi 2D xaritada ham', (await page.$$('.leaflet-marker-icon.ann')).length > 0);
  ok('Yogʻin xavfi “Hozirgi holat”da', /mm yomgʻir kutilmoqda/.test(await page.textContent('#alerts')) && (await page.evaluate(() => document.getElementById('map3d').hidden)));
  ok('Bosh sahifa — boshqaruv markazi: hozirgi holat va shahar tizimlari', (await page.$$('#alerts .alist2 li')).length >= 2 && (await page.$$('.sys-grid .sys-tile')).length === 6 && /Ulanmagan/.test(await page.textContent('.sys-grid')));
  // Dinamik transport: tigʻiz soat 07:00–10:00, 15 daqiqalik qadamlar
  await page.click('[data-act=dyn-run]');
  await page.waitForFunction(() => NX.state.dynT && NX.state.dynT.res && !NX.state.dynT.busy, null, { timeout: 120000 });
  const dy = await page.evaluate(() => { const r = NX.state.dynT.res; return { n: r.slices.length, t0: r.slices[0].time, t1: r.slices[r.slices.length - 1].time, peak: r.slices[NX.state.dynT.sum.peakSi].time, q0: r.slices[0].queueVeh, qp: r.slices[NX.state.dynT.sum.peakSi].queueVeh, map: NX.map.hasDynamic() }; });
  ok('Dinamik transport: 07:00–09:45, 12 qadam, navbat tigʻiz paytda koʻproq, xaritada', dy.n === 12 && dy.t0 === '07:00' && dy.t1 === '09:45' && dy.qp >= dy.q0 && dy.map, JSON.stringify(dy));
  const hq = await page.evaluate(async () => { const r = await NX.sim.dynamic({ demand: NX.state.demand * 6, iters: 3 }); return r.slices.map(s => s.queueVeh); });
  const pk = hq.indexOf(Math.max(...hq));
  ok('Dinamik: talab oshsa navbat paydo boʻlib oʻsadi, tigʻiz oʻtgach kamayadi', hq[pk] > 0 && pk > 0 && hq[hq.length - 1] < hq[pk] && hq[0] <= hq[pk], hq.join(','));
  await page.fill('[data-input=dyn-t]', '0'); await page.dispatchEvent('[data-input=dyn-t]', 'input');
  ok('Dinamik: vaqt shkalasi ishlaydi', /07:00 da/.test(await page.textContent('#dynTInfo')));
  await page.click('[data-act=dyn-clear]');
  ok('Keraksiz funksiyalar yoʻq (Belgilash, tirbandlik xabari)', !(await page.$('.nx-mark')) && !(await page.$('#reportCard')));
  await page.waitForFunction(() => /17°C/.test(document.querySelector('.live').textContent), null, { timeout: 10000 });
  ok('Ob-havo va yoʻlga taʼsiri qisqa (hozirgi holatda)', /Yoʻl hoʻl/.test(await page.textContent('#alerts')));
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
  await page.evaluate(() => { const s = NX.state.model.streets[NX.state.chatStreet]; document.querySelector('#chat textarea[name=q]').value = NX.state.segment && NX.state.segment.street === s.id ? 'Shu qismini yopsak nima boʻladi?' : s.name + 'ni yopsak nima boʻladi?'; }); await page.click('#chat form button');
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
  await page.evaluate(() => { const s = NX.state.model.streets[NX.state.chatStreet]; document.querySelector('#chat textarea[name=q]').value = NX.state.segment && NX.state.segment.street === s.id ? 'Shu qismini yopsak nima boʻladi?' : s.name + 'ni yopsak nima boʻladi?'; }); await page.click('#chat form button');
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
  ok('Muammolar boʻlimida xarita bosilsa boʻlim oʻzgarmaydi, yaqin muammo ochiladi', await page.evaluate(() => NX.state.tab === 'problems' && !!NX.state.focusPid && NX.state.problemOpen === NX.state.focusPid));
  ok('Muammo paneli: faqat shu muammo — nima qilish kerak (qadamlar) va tepadan reja', (await page.$$('#panel .prob')).length === 1 && (await page.$$('#panel .steps li')).length >= 3 && !!(await page.$('#panel .plan-svg path')) && /svetofor/.test(await page.textContent('#panel .plan-wrap + p')));
  await page.click('[data-act=problem-close]');
  ok('“Barcha muammolar” — roʻyxatga qaytadi', (await page.$$('#panel .prob')).length > 1);
  // Kichik koʻcha katta koʻchaga ulanadigan joy — svetofor emas, ustuvorlik belgilari
  const cls = await page.evaluate(() => { const M = NX.state.model, R = s => M.streets[s].rank; return { j: M.problems.filter(p => p.type === 'junction').every(p => R(p.major) >= 5 && R(p.minor) >= 5), pr: M.problems.filter(p => p.type === 'priority').length, minor: M.problems.filter(p => p.type === 'priority').every(p => R(p.minor) < 5) }; });
  ok('Chorrahalar ajratiladi: svetofor — faqat ikki katta koʻcha; kichik koʻcha ulanishi — ustuvorlik belgilari', cls.j && cls.pr > 0 && cls.minor, JSON.stringify(cls));
  await page.click('.prob:has-text("Ustuvorlik belgisi yoʻq") .loc >> nth=0');
  await page.waitForSelector('#panel .plan-svg', { timeout: 5000 });
  const prTxt = await page.textContent('#panel .steps');
  if (process.env.SHOT7) { await page.locator('#panel .plan-wrap').screenshot({ path: process.env.SHOT7 }); await page.locator('#panel .steps').screenshot({ path: process.env.SHOT7.replace('.png', '-s.png') }); }
  ok('Ustuvorlik paneli: “Asosiy yoʻl” va “Yoʻl bering” koʻcha nomlari bilan, svetofor kerak emas', /Asosiy yoʻl/.test(prTxt) && /Yoʻl bering/.test(prTxt) && /Svetofor kerak emas/.test(prTxt) && (await page.$$('#panel .plan-svg path[stroke="#dc2626"]')).length > 0);
  await page.click('[data-act=problem-close]');
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
  ok('AI: koʻcha aniqlanadi, variantlar hisoblanib JSON yuboriladi (chuqur tahlil)', /Dagbitskiy/.test(userMsg) && /variantlar_hisob/.test(userMsg) && /umumiy_yol_vaqti/.test(userMsg) && body.model === 'gpt-5.5', 'model: ' + body.model);
  ok('AI javobi koʻrsatiladi (ogohlantirishsiz)', /Hozirgi holat/.test(aiTxt) && !(await page.$('#chat .ai-src')));
  // Umumiy savol (koʻcha va stsenariysiz): AI ga real holat beriladi
  await page.fill('#chat textarea[name=q]', 'Hozir qaysi koʻchalar tirband va ob-havo qanday?');
  await page.click('#chat form button');
  await page.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length === 4, null, { timeout: 60000 });
  const gen = ctx.openaiBodies[ctx.openaiBodies.length - 1];
  const genMsg = gen.messages[gen.messages.length - 1].content;
  ok('Umumiy savolda AI ga ob-havo, tirbandlik, hodisalar, avtobuslar beriladi', /ob_havo/.test(genMsg) && /hozirgi_tirbandlik/.test(genMsg) && /avtobus_liniyalari/.test(genMsg) && /muammolar/.test(genMsg), 'xabarlar: ' + gen.messages.length);
  ok('AI: model ketma-ketligi (404 → keyingisi)', ctx.openaiBodies.some(b => b.model === 'gpt-5.4-mini') && gen.model === 'gpt-5.5');
  ok('AI: avval GPT-6 Sol soʻraladi; mavjud boʻlmasa — keyin qayta soʻralmaydi; prompt caching kaliti', ctx.openaiBodies.filter(b => b.messages)[0].model === 'gpt-6-sol' && ctx.openaiBodies.filter(b => b.model === 'gpt-6-sol').length === 1 && /^cityjam-/.test(gen.prompt_cache_key || ''), ctx.openaiBodies.map(b => b.model).join(','));
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

  // Oldingi boʻlimlar sahifalari yopiladi (animatsiyalar CPU ni band qilmasin)
  for (const c of browser.contexts()) await c.close();
  // ---------- 5. AI proksi: brauzerda kalit yoʻq, savol Worker orqali ----------
  const ctx5 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await setupRoutes(ctx5);
  await ctx5.route(/\/js\/keys\.js/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CITYJAM_KEYS = { tomtom: '', aiProxy: 'https://cityjam-ai.example.workers.dev/' };" }));
  const proxyReqs = [];
  await ctx5.route(/cityjam-ai\.example\.workers\.dev/, route => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
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
    if (/\/images/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ data: [[0.0001, 0, 270], [0, 0.00027, 180], [0, -0.00027, 0], [-0.00035, 0, 90]].map(([dx, dy, ca], i) => ({ id: '12' + i, captured_at: Date.UTC(2025, 5, 1), thumb_1024_url: 'https://scontent.example.fbcdn.net/t' + i + '.jpg', compass_angle: ca, computed_geometry: { type: 'Point', coordinates: [c[0] + dx, c[1] + dy] } })) }) });
    featCalls++;
    route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ data: (Math.round(c[0] * 1e4) + Math.round(c[1] * 1e4)) % 3 === 0 ? [{ id: 'f1', object_value: 'object--traffic-light--general-upright', geometry: { type: 'Point', coordinates: c }, last_seen_at: Date.UTC(2025, 5, 1) }] : [] }) });
  });
  await ctx8.route(/fbcdn\.net/, route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const px = { chat: [], search: 0, image: [] };
  const pc = { store: {}, posts: 0 };
  const lay = { meta: {}, data: {} };
  await ctx8.route(/cityjam-ai\.example\.workers\.dev/, route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/version') return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ v: 4 }) });
    if (path === '/webcams' && /mode=fi/.test(req.url())) return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ total: 1, source: 'Fintraffic Digitraffic (CC BY 4.0)', items: [{ id: 'C0150200', title: 'Tie 1 Helsinki', city: 'Finlyandiya (test)', lat: 60.2, lon: 24.9, preview: 'https://weathercam.digitraffic.fi/C0150200.jpg', detail: 'https://www.liikennetilanne.fi/en', test: true }] }) });
    if (path === '/webcams') return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ total: 2, source: 'Windy.com', items: [{ id: 101, title: 'Samarkand - Registan', city: 'Samarkand', lat: 39.6547, lon: 66.9757, updated: Date.now(), preview: 'https://imgproxy.windy.com/cam/101.jpg', detail: 'https://www.windy.com/webcams/101' }, { id: 102, title: 'Samarkand - Siab', city: 'Samarkand', lat: 39.6620, lon: 66.9810, updated: Date.now(), preview: 'https://imgproxy.windy.com/cam/102.jpg', detail: 'https://www.windy.com/webcams/102' }] }) });
    if (path.startsWith('/layers')) {
      const sys = path.split('/')[2];
      if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(sys ? lay.data[sys] : { items: lay.meta }) });
      if (req.headers()['x-staff-code'] !== '4321') return route.fulfill({ status: 403, contentType: 'application/json', headers: H, body: JSON.stringify({ error: { code: 'bad_pin', message: 'Xodim kodi notoʻgʻri' } }) });
      const q = JSON.parse(req.postData()); lay.data[sys] = q.geojson; lay.meta[sys] = { name: q.name, n: q.geojson.features.length, ts: Date.now() };
      return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ items: lay.meta }) });
    }
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
    if (/nomzod_joylar/.test(b.messages[0].content) && /S_koʻchalar/.test(JSON.stringify(b.messages[b.messages.length - 1].content))) return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ choices: [{ message: { content: 'Tavsiya: S1 koʻchasida belgi.\n```json\n{"belgilar":[{"id":"S1","nima":"Asosiy yoʻl belgisi","izoh":"sinov"},{"id":"X9","nima":"oʻylab topilgan","izoh":"qabul qilinmasligi kerak"}]}\n```' } }] }) });
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
  ok('🔎 Tekshirish: xulosa va real surat', !!(await p8.$(`${jCard} .vphoto img`)) && /Mapillary/.test(await p8.textContent(`${jCard} .vphoto`)) && mly.tokens.has('MLY|TEST'), await p8.textContent(`${jCard} .vverdict`));
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
  // Bitta muammo paneli: 4 tomondan suratlar, AI xulosasi avtomatik, tepadan koʻrinish (reja + suratlar)
  const chatBefore = px.chat.length;
  await p8.click(`${jCard} .loc >> nth=1`);
  await p8.waitForSelector('#panel .views4 img', { timeout: 15000 });
  await p8.waitForSelector('#panel .ai-text', { timeout: 15000 });
  const vis = px.chat.slice(chatBefore).find(b => /muhandis/.test(b.messages[0].content));
  ok('Muammo paneli: 4 tomondan real suratlar va AI xulosasi (avtomatik)', (await p8.$$('#panel .views4 img')).length >= 2 && vis && vis.messages[1].content.filter(x => x.type === 'image_url').length >= 2, 'suratlar: ' + (await p8.$$('#panel .views4 img')).length);
  await p8.click('#panel [data-act=pimg][data-mode=top]');
  await p8.waitForSelector('#panel .vgen img', { timeout: 20000 });
  const topReq = px.image[px.image.length - 1];
  ok('🛰 Tepadan koʻrinish: AI’ga real sunʼiy yoʻldosh surati (yechim belgilari bilan) yuboriladi', /^data:image\/png;base64,/.test(topReq.plan || '') && /REAL satellite/.test(topReq.prompt) && /haqiqiy emas/.test(await p8.textContent('#panel .vgen')));
  ok('Muammo paneli: real sunʼiy yoʻldosh surati va chorrahaga xos qadamlar (koʻcha nomlari, oqim)', !!(await p8.$('#panel .sat-img')) && /mashina\/soat/.test(await p8.textContent('#panel .steps')), JSON.stringify({ sat: !!(await p8.$('#panel .sat-img')), sw: !!(await p8.$('#panel .sat-wrap')), steps: (await p8.textContent('#panel .steps')).slice(0, 200), fl: await p8.evaluate(() => NX.sim.flows({ demand: NX.state.demand, iters: 10 }).then(x => x.length + ' ' + x[0]).catch(e => 'ERR ' + e.message)), vf: await p8.evaluate(() => JSON.stringify(NX.state.verify[NX.state.problemOpen].flows)) }));
  if (process.env.SHOT) { await p8.evaluate(() => { document.getElementById('panel').scrollTop = 0; }); await p8.screenshot({ path: process.env.SHOT }); }
  if (process.env.SHOT3) await p8.locator('#panel .plan-wrap').screenshot({ path: process.env.SHOT3 });
  await p8.click('[data-act=problem-close]');
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
  // Chuqur tahlil: “doim tirbandlik — nima qilsak?” → bir nechta variant hisoblanadi, internet qidiriladi, eng yaxshisi xaritada
  await p8.click('.tabs [data-tab=ai]');
  const srch0 = px.search, chat0 = px.chat.length;
  await p8.fill('#chat textarea[name=q]', 'Registon koʻchasida doim tirbandlik, nima qilsak boʻladi? Soatbay bir tomonlama qilsak-chi?');
  await p8.click('#chat form button');
  await p8.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.some(m => m.role === 'ai'), null, { timeout: 120000 });
  const deepReq = px.chat.slice(chat0).find(b => /bosh tahlilchisan/.test(b.messages[0].content));
  const deepFacts = deepReq && JSON.parse(deepReq.messages[deepReq.messages.length - 1].content.split('(JSON):\n')[1]);
  ok('Chuqur tahlil: variantlar hisoblanadi, internet qidiriladi, kuchli model', deepReq && deepReq.model === 'gpt-6-sol' && deepReq.prompt_cache_key === 'cityjam-deep' && deepFacts.variantlar_hisob.length >= 2 && px.search > srch0 && (await p8.evaluate(() => NX.map.hasDeltas())), deepFacts ? deepFacts.variantlar_hisob.map(v => v.variant + ' ' + v.umumiy_yol_vaqti_foiz).join(' | ') : 'yoʻq');
  // Hudud chatida chuqur tahlil: variantlar tugmalari (xaritada koʻrsatish)
  await p8.click('.tabs [data-tab=map]');
  await p8.evaluate(c => { const poly = [[c[0] - 0.002, c[1] - 0.002], [c[0] - 0.002, c[1] + 0.002], [c[0] + 0.002, c[1] + 0.002], [c[0] + 0.002, c[1] - 0.002]]; const st = NX.area.stats(NX.state.model, poly); st.systems = []; const A0 = {}; Object.keys(NX.area.ASSUME).forEach(k => { A0[k] = NX.area.ASSUME[k].v; }); NX.state.area = { st, spec: { flats: 500, floors: 9 }, A: A0, res: null, busy: null, qa: [], qaBusy: null }; }, await p8.evaluate(() => NX.state.model.streets.find(x => x.name === 'Registon koʻchasi').center));
  await p8.click('.tabs [data-tab=map]');
  await p8.fill('#areaChat textarea[name=aq]', 'Bu yerda doim tirbandlik — nima qilsak boʻladi?'); await p8.click('#areaChat form button');
  await p8.waitForFunction(() => NX.state.area.qa.length === 2 && !NX.state.area.qaBusy, null, { timeout: 120000 });
  const nOpt = (await p8.$$('#areaChat .dopt[data-act=area-opt]')).length;
  await p8.click('#areaChat .dopt[data-act=area-opt] >> nth=1');
  const ann = await p8.evaluate(() => { const m = NX.state.area.qa[1]; return { n: (m.actions || []).length, ids: (m.actions || []).map(a => a.id), dom: document.querySelectorAll('.leaflet-marker-icon.ann').length, json: /belgilar/.test(m.text) }; });
  ok('AI tavsiyasi xaritada: faqat real nomzod joylardan (oʻylab topilgan id rad etiladi), JSON matndan olib tashlanadi', ann.n === 1 && ann.ids[0] === 'S1' && ann.dom === 1 && !ann.json, JSON.stringify(ann));
  ok('Hudud: chuqur tahlil variantlari raqamlar bilan, bosilsa xaritada koʻrinadi', nOpt >= 3 && (await p8.evaluate(() => NX.state.area.deep.shown === 1 && NX.map.hasDeltas())), 'variantlar: ' + nOpt);
  if (process.env.SHOT6) { await p8.evaluate(() => document.querySelector('#areaChat').scrollIntoView()); await p8.screenshot({ path: process.env.SHOT6 }); }
  await p8.click('[data-act=area-clear]');
  // Shahar tizimlari: xaritani yuklash (barcha xodimlarga), xaritada koʻrinadi, hudud tahliliga qoʻshiladi
  await p8.evaluate(() => localStorage.setItem('nx:fixes:pin', JSON.stringify('4321')));
  await p8.click('.tabs [data-tab=systems]');
  // Kamera devori (xarita ustida): Samarqand kameralari bor — namuna belgisi yoʻq
  await p8.click('.tabs [data-tab=map]');
  await p8.waitForFunction(() => NX.camwall.items().length > 0, null, { timeout: 15000 });
  ok('Kamera devori xaritada: Samarqand kameralari, namuna belgisisiz', (await p8.isVisible('#camWall')) && (await p8.$$('#camWall .cw-cam')).length === 2 && !(await p8.$('#camWall .cw-sample')) && /SAMARQAND/.test(await p8.textContent('#camWall')));
  if (process.env.SHOT12) await p8.screenshot({ path: process.env.SHOT12 });
  await p8.click('.tabs [data-tab=ai]');
  await p8.fill('#chat textarea[name=q]', 'yarim yozilgan savol');
  await p8.evaluate(() => document.querySelector('.tabs [data-tab=ai]').click());
  ok('Panel qayta chizilganda yozilayotgan matn oʻchmaydi', (await p8.inputValue('#chat textarea[name=q]')) === 'yarim yozilgan savol');
  await p8.fill('#chat textarea[name=q]', '');
  await p8.click('.tabs [data-tab=map]');
  // Sudrab koʻchirish va burchakdan choʻzish
  const b0 = await p8.locator('#camWall').boundingBox(), h0 = await p8.locator('#camWall .cw-h').boundingBox();
  await p8.mouse.move(h0.x + 60, h0.y + h0.height / 2); await p8.mouse.down(); await p8.mouse.move(h0.x - 140, h0.y + 150, { steps: 6 }); await p8.mouse.up();
  const b1 = await p8.locator('#camWall').boundingBox();
  const cap0 = await p8.evaluate(() => NX.camwall.capacity());
  const rz = await p8.locator('#camWall .cw-resize').boundingBox();
  await p8.mouse.move(rz.x + 8, rz.y + 8); await p8.mouse.down(); await p8.mouse.move(rz.x + 120, rz.y + 220, { steps: 6 }); await p8.mouse.up();
  const b2 = await p8.locator('#camWall').boundingBox(), cap1 = await p8.evaluate(() => NX.camwall.capacity());
  ok('Kamera devori: sudrab koʻchiriladi, choʻzilsa kattalashadi va koʻproq kamera sigʻadi; joyi eslab qolinadi', b1.x < b0.x - 100 && b1.y > b0.y + 100 && b2.width > b1.width + 80 && b2.height > b1.height + 150 && cap1 > cap0 && (await p8.evaluate(() => !!localStorage.getItem('nx:cw:box'))), JSON.stringify({ b0: [b0.x, b0.y], b1: [b1.x, b1.y, b1.width, b1.height], b2: [b2.width, b2.height], cap0, cap1 }));
  await p8.click('#camWall .cw-cam >> nth=0');
  await p8.waitForSelector('#camDlg .cw-big', { timeout: 5000 });
  ok('Kamera bosilsa kattalashadi, AI tahlil tugmasi bor', !!(await p8.$('#camDlg [data-cw=ai]')));
  await p8.click('#camDlg [data-cw=close]');
  await p8.click('.tabs [data-tab=systems]');
  ok('Kamera devori boshqa boʻlimlarda yashiriladi', !(await p8.isVisible('#camWall')));
  // Ochiq vebkameralar (Windy) — avtomatik topiladi, xaritada, AI kadrni koʻradi
  await p8.waitForFunction(() => NX.state.webcams && NX.state.webcams.list && !NX.state.webcams.busy, null, { timeout: 15000 });
  await p8.waitForFunction(() => document.querySelectorAll('.leaflet-marker-icon.sysmk').length >= 2, null, { timeout: 5000 }).catch(() => {});
  ok('Ochiq vebkameralar (Windy): topiladi, xaritada, Windy.com havolasi bilan', (await p8.$$('.cam img')).length === 2 && /Windy\.com/.test(await p8.textContent('.cams')) && (await p8.$$('.leaflet-marker-icon.sysmk')).length >= 2);
  const camChat0 = px.chat.length;
  await p8.click('[data-act=cam-ai] >> nth=0');
  await p8.waitForFunction(() => NX.state.webcams.ai && NX.state.webcams.ai[101] && !NX.state.webcams.ai[101].busy, null, { timeout: 15000 });
  const camReq = px.chat.slice(camChat0).find(b => /vebkamera/.test(b.messages[0].content));
  const fi = await p8.evaluate(() => NX.webcams.load(60, 'fi').then(l => ({ n: l.length, test: l[0].test, keep: NX.webcams.get().length })));
  ok('Test kameralar (Finlyandiya, ochiq maʼlumot): alohida roʻyxat, Samarqand xaritasiga qoʻshilmaydi', fi.n === 1 && fi.test && fi.keep === 2, JSON.stringify(fi));
  ok('🤖 Vebkamera kadri AI’ga yuboriladi (arzon model)', camReq && camReq.model === 'gpt-6-luna' && camReq.messages[1].content.some(x => x.type === 'image_url' && /windy\.com/.test(x.image_url.url)));
  const c0 = await p8.evaluate(() => NX.state.model.streets.find(x => x.name === 'Registon koʻchasi').center);
  const gas = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Gaz quvuri 1', diametr: '159 mm' }, geometry: { type: 'LineString', coordinates: [[c0[1] - 0.003, c0[0]], [c0[1] + 0.003, c0[0]]] } }] };
  await p8.setInputFiles('[data-sysfile=gas]', { name: 'gaz.geojson', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(gas)) });
  await p8.waitForFunction(() => NX.systems.get('gas'), null, { timeout: 10000 });
  ok('Gaz xaritasi yuklandi va barcha xodimlarga saqlandi', lay.meta.gas && (await p8.evaluate(() => NX.systems.get('gas').shared)) && /barcha xodimlarga/.test(await p8.textContent('#panel')));
  const csv = 'nomi,lat,lon,url\nKamera 1,' + c0[0] + ',' + c0[1] + ',https://example.com/cam1\nKamera 2,' + (c0[0] + 0.001) + ',' + c0[1] + ',https://example.com/cam2';
  await p8.setInputFiles('[data-sysfile=camera]', { name: 'kameralar.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await p8.waitForFunction(() => NX.systems.get('camera'), null, { timeout: 10000 });
  if (process.env.SHOT5) await p8.screenshot({ path: process.env.SHOT5 });
  await p8.waitForFunction(() => document.querySelectorAll('.leaflet-marker-icon.sysmk').length === 4, null, { timeout: 5000 }).catch(() => {});
  ok('Kameralar CSV’dan yuklandi va xaritada koʻrinadi', (await p8.$$('.leaflet-marker-icon.sysmk')).length === 4);
  await p8.setInputFiles('[data-sysfile=water]', { name: 'suv.geojson', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [500000, 4400000] } }] })) });
  await p8.waitForFunction(() => /WGS84/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  ok('Notoʻgʻri koordinatali fayl — tushunarli xato', !(await p8.evaluate(() => NX.systems.get('water'))));
  const ar = await p8.evaluate(c => { const poly = [[c[0] - 0.001, c[1] - 0.001], [c[0] - 0.001, c[1] + 0.001], [c[0] + 0.001, c[1] + 0.001], [c[0] + 0.001, c[1] - 0.001]]; return NX.systems.inArea(NX.systems.get('gas').gj, poly); }, c0);
  ok('Hudud tahlili: hududdan oʻtadigan quvur uzunligi', ar.km > 0.1 && ar.km < 0.3, JSON.stringify(ar));
  await p8.click('.tabs [data-tab=problems]');
  ok('Muammolar xaritasida tizimlar koʻrinmaydi (faqat muammolar)', (await p8.$$('.leaflet-marker-icon.sysmk')).length === 0);
  // 3D egizak chati: “rasm chiz” — 3D koʻrinish asosida AI rasm
  await p8.click('.tabs [data-tab=twin]');
  await p8.waitForFunction(() => NX.map3d.map() && NX.map3d.map().getSource('bld'), null, { timeout: 60000 });
  if (process.env.SHOT11) await p8.screenshot({ path: process.env.SHOT11 });
  const img0 = px.image.length;
  await p8.fill('#twinChat textarea[name=tq]', 'Shu koʻrinishda 50 mm yomgʻir yogʻsa qanday boʻlishini rasmini chiz');
  await p8.click('#twinChat form button');
  await p8.waitForFunction(() => NX.state.twinChat && !NX.state.twinChat.busy && NX.state.twinChat.msgs.length >= 2, null, { timeout: 240000 }).catch(async e => { console.log('DBG', await p8.evaluate(() => JSON.stringify({ c: NX.state.twinChat, open: !!document.querySelector('dialog[open]'), dlg: [...document.querySelectorAll('dialog[open]')].map(d => d.id) }))); throw e; });
  const im = px.image.slice(img0)[0];
  ok('3D egizak chati: “rasm chiz” — 3D koʻrinish asosida AI rasm chatda', im && /^data:image\/png/.test(im.plan || '') && !!(await p8.$('#twinChat .vgen img')), im ? 'prompt: ' + String(im.prompt).slice(0, 60) : 'soʻrov yoʻq');
  await p8.click('.tabs [data-tab=map]');
  ok('Konsolda xato yoʻq (Mapillary)', e8.length === 0, e8.join(' || '));

  // Oldingi boʻlimlar sahifalari yopiladi (animatsiyalar CPU ni band qilmasin)
  for (const c of browser.contexts()) await c.close();
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
  await p9.fill('#areaChat textarea[name=aq]', 'Bu yerga 500 xonadonli 9 qavatli dom qursam nima boʻladi?'); await p9.click('#areaChat form button');
  await p9.waitForFunction(() => NX.state.area.res && !NX.state.area.busy && NX.state.area.qa.length === 2 && !NX.state.area.qaBusy, null, { timeout: 90000 });
  const r9 = await p9.evaluate(() => ({ res: NX.state.area.res.b.residents, trips: NX.state.area.res.sim.build && NX.state.area.res.sim.build.trips, deltas: NX.map.hasDeltas() }));
  ok('500 xonadon: aholi, mashinalar, yuklama xaritada', r9.res === 2000 && r9.trips === 150 && r9.deltas, JSON.stringify(r9));
  const aTxt = await p9.textContent('#areaChat .chat-msg.ai .ai-text');
  ok('Javob: yutuqlar, muammolar, tavsiyalar va kelajak (5 yil)', /Yutuqlar/.test(aTxt) && /Muammolar/.test(aTxt) && /Nima qilish kerak/.test(aTxt) && /5 yildan keyin/.test(aTxt));
  const sh9 = await p9.evaluate(() => NX.state.area.res.shadow && { n: NX.state.area.res.shadow.shaded.length, rings: NX.state.area.res.shadow.list.filter(x => x.ring).length });
  ok('Yangi bino soyasi: qish/yoz, 9–15 soat; soyada qoladigan binolar hisoblanadi', sh9 && sh9.rings >= 5, JSON.stringify(sh9));
  await p9.click('.tabs [data-tab=twin]');
  await p9.waitForFunction(() => NX.map3d.map() && NX.map3d.map().getSource('plan'), null, { timeout: 30000 });
  await p9.click('[data-act=twin-mode][data-mode=plan]');
  await p9.waitForTimeout(1500);
  ok('3D: rejadagi bino va qishki soya', await p9.evaluate(() => NX.map3d.map().getSource('plan')._data.features.some(f => f.properties.kind === 'plan')) && /soyada qoladi/.test(await p9.textContent('#panel')));
  if (process.env.SHOT8) await p9.screenshot({ path: process.env.SHOT8 });
  await p9.click('.tabs [data-tab=map]');
  const anns = await p9.evaluate(() => [...document.querySelectorAll('.leaflet-marker-icon.ann')].map(x => x.textContent));
  if (process.env.SHOT13) await p9.screenshot({ path: process.env.SHOT13 });
  ok('Qurilish natijasi xaritada belgilanadi: bino, yuklanadigan koʻchalar, bekat, maktab', anns.length >= 3 && anns.some(t => /🏢/.test(t)) && anns.some(t => /🚏/.test(t)) && anns.some(t => /🏫/.test(t)), anns.join(' | '));
  ok('Bino safarlari mahalla koʻchalariga ham tarqaladi (bir nechta chiqish)', await p9.evaluate(() => NX.state.area.res.sim.deltas.length / 2 >= 6), await p9.evaluate(() => String(NX.state.area.res.sim.deltas.length / 2)));
  if (process.env.SHOT2) { await p9.evaluate(() => document.querySelector('#areaChat').scrollIntoView()); await p9.screenshot({ path: process.env.SHOT2 }); }
  // “Nima qursam foydali?” — dom hisobi emas: xizmatlar qamrovi meʼyorga nisbatan, xaritada
  await p9.fill('#areaChat textarea[name=aq]', 'Shu yerga nima qursam foydali boʻladi?'); await p9.click('#areaChat form button');
  await p9.waitForFunction(() => NX.state.area.qa.length === 4 && !NX.state.area.qaBusy, null, { timeout: 90000 });
  const nd = await p9.evaluate(() => { const A = NX.state.area; return { n: A.needs && A.needs.list.length, pop: A.needs && A.needs.aholi, school: A.needs && A.needs.list.find(x => x.k === 'school').eng_yaqini, flats: A.spec.flats, acts: A.qa[3].actions.map(a => a.title) }; });
  ok('“Nima qursam foydali”: yetishmaydigan xizmatlar (meʼyoriy radius, qamrov), dom hisobi qayta qilinmaydi, xaritada', nd.n === 9 && nd.pop > 0 && nd.school && nd.school.nomi === 'Sinov maktabi' && nd.flats === 500 && nd.acts.length > 0 && !nd.acts.some(t => /🏢/.test(t)), JSON.stringify(nd));
  // Hudud chatida favqulodda savol — FAQAT shu hudud uchun reja (shahar boʻyicha tayyor javob emas), jonli simulyatsiya xaritada
  await p9.fill('#areaChat textarea[name=aq]', 'Shu yerdagi odamlarni zilzila vaqtida qayerga evakuatsiya qilsa boʻladi?'); await p9.click('#areaChat form button');
  await p9.waitForFunction(() => NX.state.area.qa.length === 6 && !NX.state.area.qaBusy, null, { timeout: 240000 });
  const arq = await p9.evaluate(() => { const H = NX.state.twin.hz, A = NX.state.area; return { scope: H.scope, zones: H.zones.length, cells: H.zones[0].cells.length, inside: H.zones[0].cells.every(c => NX.area.inside(A.st.poly, c[0], c[1])), routes: H.routes.map(r => r.from), facts: H.facts.savol_doirasi, fx: NX.fx.active(), close: !!document.querySelector('.hz-close'), cap: H.shelters.every(x => x.cap > 0), acts: A.qa[5].actions.length }; });
  ok('Hudud chatida zilzila: faqat shu hudud (uy guruhlari → yigʻilish joylari), xavfli joy — hudud ichidagi binolar shaklida, jonli simulyatsiya', arq.scope === 'area' && arq.zones === 1 && arq.cells > 0 && arq.inside && arq.routes.length > 0 && arq.routes.every(f => /^A\d/.test(f)) && /FAQAT/.test(arq.facts) && arq.fx && arq.close && arq.cap && arq.acts > 0 && /Evakuatsiya rejasi/.test(await p9.evaluate(() => NX.state.area.qa[5].text)), JSON.stringify(arq));
  if (process.env.SHOT14) { await p9.waitForTimeout(1500); await p9.screenshot({ path: process.env.SHOT14 }); }
  await p9.click('.hz-close');
  ok('“Natijani yopish” — simulyatsiya va belgilar olib tashlanadi', await p9.evaluate(() => !NX.fx.active() && !document.querySelector('.hz-close')));
  await p9.click('.tabs [data-tab=ai]');
  await p9.fill('#chat textarea[name=q]', 'Bu hududga 300 xonadonli 12 qavatli dom qursak nima boʻladi?');
  await p9.click('#chat form button');
  await p9.waitForFunction(() => !NX.state.chat.busy && NX.state.chat.msgs.length === 2, null, { timeout: 90000 });
  ok('AI yordamchi chatida ham hudud va qurilish tahlili', await p9.evaluate(() => NX.state.area.spec.flats === 300 && NX.state.area.spec.floors === 12 && NX.state.area.res.b.residents === 1200));
  await p9.click('.tabs [data-tab=map]');
  await p9.click('[data-act=area-clear]');
  ok('Hududni olib tashlash', await p9.evaluate(() => NX.state.area === null && !NX.map.hasDeltas()));
  ok('Konsolda xato yoʻq (hudud)', e9.length === 0, e9.join(' || '));

  // Oldingi boʻlimlar sahifalari yopiladi (animatsiyalar CPU ni band qilmasin)
  for (const c of browser.contexts()) await c.close();
  // ---------- 10. OpenStreetMap koʻchalar soʻrovi qotib qolsa — chat baribir javob beradi ----------
  const ctx10 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setupRoutes(ctx10);
  await ctx10.route(/overpass|maps\.mail\.ru/, async route => {
    const body = decodeURIComponent((route.request().postData() || '').replace(/\+/g, ' '));
    if (/out body geom qt/.test(body) && /trunk\|primary/.test(body)) { await new Promise(r => setTimeout(r, 90000)); return route.abort('timedout').catch(() => {}); }
    return route.fallback();
  });
  const p10 = await ctx10.newPage();
  await p10.goto(BASE);
  await p10.waitForSelector('#panel .live', { timeout: 30000 });
  await p10.click('.tabs [data-tab=twin]');
  const t10 = Date.now();
  await p10.fill('#twinChat textarea[name=tq]', '30 mm yomgʻir yogʻsa qayerni suv bosadi?');
  await p10.click('#twinChat form button');
  await p10.waitForFunction(() => NX.state.twinChat && !NX.state.twinChat.busy && NX.state.twinChat.msgs.length === 2, null, { timeout: 150000 });
  const dt10 = Math.round((Date.now() - t10) / 1000);
  ok('Koʻchalar serveri javob bermasa ham chat ~1 daqiqada javob beradi; markaz koʻchalari darhol ishlatiladi', dt10 < 110 && (await p10.evaluate(() => NX.state.twin.roads && NX.state.twin.roads.length > 0 && String(NX.state.twin.roads[0].id)[0] === 'm')), dt10 + ' s');
  await ctx10.close();

  // ---------- 11. Butun shahar binolari (Overture: OSM + Microsoft) — 3D da hammasi ----------
  const ctx11 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setupRoutes(ctx11, { realBuildings: true });
  const p11 = await ctx11.newPage(); const e11 = watchErrors(p11);
  await p11.goto(BASE);
  await p11.waitForSelector('#panel .live', { timeout: 30000 });
  await p11.click('.tabs [data-tab=twin]');
  await p11.waitForFunction(() => NX.state.twin && NX.state.twin.buildings && NX.state.twin.buildings.length > 100000 && NX.map3d.map() && NX.map3d.map().getSource('bld'), null, { timeout: 90000 });
  await p11.waitForTimeout(1500);
  const b11 = await p11.evaluate(() => { const b = NX.state.twin.buildings; return { n: b.length, ml: b.filter(x => x.ml).length, f: NX.map3d.map().getSource('bld')._data.features.length, base: NX.map3d.base(), sky: !!NX.map3d.map().getSky && !!NX.map3d.map().getSky(), ring: b[0].ring.length >= 4 && b[0].ring[0][0] === b[0].ring[b[0].ring.length - 1][0] }; });
  ok('Butun shahar binolari 3D da (~123 ming: OSM + sunʼiy yoʻldoshdan Microsoft), “Raqamli egizak” koʻrinishi, osmon', b11.n > 100000 && b11.ml > 20000 && b11.f === b11.n && b11.base === 'twin' && b11.sky && b11.ring && /sunʼiy yoʻldosh/.test(await p11.textContent('#panel')), JSON.stringify(b11));
  const w11 = await p11.evaluate(() => { const m = NX.map3d.map(); return { pat: JSON.stringify(m.getPaintProperty('bld', 'fill-extrusion-pattern') || null), roof: m.getLayoutProperty('bld-roof', 'visibility'), img: ['w1', 'w2', 'w3'].every(k => m.hasImage(k)), bg: !!document.getElementById('backdrop') && document.getElementById('backdrop').width > 0 }; });
  ok('Kechki shahar: binolar derazalari yonib turadi (3 xil devor), tomlar rangli; sayt orqa fonida jonli koʻchalar tarmogʻi', /w1/.test(w11.pat) && w11.roof === 'visible' && w11.img && w11.bg, JSON.stringify(w11));
  const tm = await p11.evaluate(() => { const t = performance.now(); NX.map3d.setMode('quake'); NX.map3d.setMode('height'); return Math.round(performance.now() - t); });
  ok('Rejim almashishi tez (binolar qayta chizilmaydi)', tm < 300, tm + ' ms');
  await p11.click('[data-act=twin-base][data-base=sat]');
  ok('Fon almashadi va eslab qolinadi', await p11.evaluate(() => NX.map3d.base() === 'sat' && localStorage.getItem('m3d:base') === 'sat' && NX.map3d.map().getLayoutProperty('roads-core', 'visibility') === 'none' && !NX.map3d.map().getPaintProperty('bld', 'fill-extrusion-pattern') && NX.map3d.map().getLayoutProperty('bld-roof', 'visibility') === 'none'));
  if (process.env.SHOT11) { await p11.click('[data-act=twin-base][data-base=twin]'); await p11.waitForTimeout(9000); await p11.evaluate(() => NX.map3d.map().jumpTo({ zoom: 16.8, pitch: 68 })); await p11.waitForTimeout(4000); await p11.screenshot({ path: process.env.SHOT11 }); }
  ok('Konsolda xato yoʻq (butun shahar binolari)', e11.length === 0, e11.join(' || '));
  await ctx11.close();

  await browser.close();
  console.log(results.map(r => r.join('  ')).join('\n'));
  console.log(`\n${results.filter(r => r[0] === 'OK  ').length}/${results.length} tekshiruv oʻtdi`);
})().catch(e => { console.error(e); process.exit(1); });
