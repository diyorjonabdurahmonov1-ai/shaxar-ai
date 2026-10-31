// Qoʻlda ishlatiladigan tekshiruv: HAQIQIY relyef, koʻchalar va binolar bilan suv modeli (internet kerak). node tests/real-data.cjs
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
  if (!opts.realBuildings) await ctx.route(/data\/(buildings|roads|places)-samarqand\.json/, route => route.abort('failed'));
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
  if (!opts.realTerrain) await ctx.route(/elevation-tiles-prod\/terrarium/, route => { const m = route.request().url().match(/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/); route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: terrTile(+m[1], +m[2], +m[3]) }); });
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

  const ctxR = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await setupRoutes(ctxR, { realBuildings: true, realTerrain: true });
  const pR = await ctxR.newPage();
  await pR.goto(BASE); await pR.waitForSelector('#panel .live', { timeout: 30000 });
  await pR.click('.tabs [data-tab=twin]');
  await pR.waitForFunction(() => NX.state.twin && NX.state.twin.dem && NX.state.twin.buildings && NX.state.twin.buildings.length > 100000, null, { timeout: 240000 });
  const res = await pR.evaluate(async () => {
    const T = NX.state.twin, roads = await NX.twin.roads(), d40 = await NX.twin.grid40();
    const run = async raw => {
      const R = await NX.twin.flood2d(d40, roads, [{ t0: 0, t1: 3600, mmh: 30 }], { drainMm: 10, raw }, () => {});
      // har segment eng katta chuqurligi; “yolg‘iz ko‘lmak” — ≥10 sm, lekin ikkala uchidagi qo‘shni segmentlar <2 sm
      const mx = R.segs.map((sg, i) => R.frames.reduce((m, f) => Math.max(m, f.d[i]), 0));
      const key = c => c[0].toFixed(5) + ',' + c[1].toFixed(5), ends = new Map();
      R.segs.forEach((sg, i) => sg.c.forEach(c => { const k = key(c); (ends.get(k) || ends.set(k, []).get(k)).push(i); }));
      let wet = 0, iso = 0;
      R.segs.forEach((sg, i) => { if (mx[i] < 0.1) return; wet++; const nb = sg.c.flatMap(c => ends.get(key(c)) || []).filter(j => j !== i); if (nb.length && nb.every(j => mx[j] < 0.02)) iso++; });
      const rep = await NX.hazard.reportItems(roads, R); return { rep: rep.facts.map(f => f.koʻcha + ': ' + f.model_natijasi), wetSegs: wet, isolated: iso, isoPct: wet ? Math.round(iso / wet * 100) : 0, km: R.peak.km, top: R.streets.slice(0, 8).map(x => x.name + ' ' + Math.round(x.max * 100)) };
    };
    return { ground: await run(false) };
  });
  console.log('REAL', JSON.stringify(res));
  await pR.fill('#twinChat textarea[name=tq]', '30 mm yomgʻir yogʻsa qaysi koʻchalarni suv bosadi?');
  await pR.click('#twinChat form button');
  await pR.waitForFunction(() => !NX.state.twinChat.busy && NX.state.twinChat.msgs.length === 2, null, { timeout: 400000 });
  await pR.waitForTimeout(2500);
  await pR.evaluate(() => { const T = NX.state.twin; if (T.playing) document.querySelector('[data-act=twin-play]').click(); });
  await pR.fill('[data-input=twin-t]', '4'); await pR.dispatchEvent('[data-input=twin-t]', 'input');
  await pR.evaluate(() => { const s = NX.state.twin.dyn.streets.find(x => /Muqimiy/.test(x.name)) || NX.state.twin.dyn.streets[0]; NX.map3d.map().jumpTo({ center: [s.at[1], s.at[0]], zoom: 16.6, pitch: 62, bearing: 30 }); });
  await pR.waitForTimeout(5000);
  await pR.screenshot({ path: '/tmp/claude-0/-home-user-shaxar-ai/2e10871e-d616-57e0-8d14-bfda0c5d9866/scratchpad/real3d.png' });
  await pR.fill('[data-input=twin-t]', '7'); await pR.dispatchEvent('[data-input=twin-t]', 'input');
  await pR.waitForTimeout(4000);
  await pR.screenshot({ path: '/tmp/claude-0/-home-user-shaxar-ai/2e10871e-d616-57e0-8d14-bfda0c5d9866/scratchpad/real3d_b.png' });
  await pR.click('.tabs [data-tab=map]'); await pR.waitForTimeout(1500);
  await pR.evaluate(() => { const s = NX.state.twin.dyn.streets.find(x => /Muqimiy/.test(x.name)) || NX.state.twin.dyn.streets[0]; NX.map.leaflet().setView([s.at[0], s.at[1]], 15); });
  await pR.waitForTimeout(2500);
  await pR.screenshot({ path: '/tmp/claude-0/-home-user-shaxar-ai/2e10871e-d616-57e0-8d14-bfda0c5d9866/scratchpad/real2d.png' });
  await browser.close();
  console.log(results.map(r => r.join('  ')).join('\n'));
  console.log(`\n${results.filter(r => r[0] === 'OK  ').length}/${results.length} tekshiruv oʻtdi`);
})().catch(e => { console.error(e); process.exit(1); });
