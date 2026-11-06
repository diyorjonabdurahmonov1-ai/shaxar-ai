/* Zaxira xarita maʼlumoti (Overpass ishlamasa va brauzerda kesh boʻlmasa): data/roads-samarqand.json + data/pois-samarqand.json
   → data/osm-fallback.json (js/data/osm.js dagi kesh bilan bir xil shakl). Avtobus yoʻnalishlari yoʻq (faqat jonli Overpass/Worker nusxasida). */
const fs = require('fs');
const B = { s: 39.640, w: 66.950, n: 39.670, e: 67.000 }, SB = { s: 39.6355, w: 66.9440, n: 39.6745, e: 67.0060 };
const inB = (la, lo, b) => la >= b.s && la <= b.n && lo >= b.w && lo <= b.e;
const R = JSON.parse(fs.readFileSync('data/roads-samarqand.json')), P = JSON.parse(fs.readFileSync('data/pois-samarqand.json'));
const S = R.scale, [lon0, lat0] = R.base, r6 = v => Math.round(v * 1e6) / 1e6;
const ids = new Map(); const nid = (la, lo) => { const k = la.toFixed(5) + ',' + lo.toFixed(5); let v = ids.get(k); if (!v) { v = ids.size + 1; ids.set(k, v); } return v; };
const ways = [];
R.w.forEach((a, i) => {
  let x = a[2], y = a[3]; const pts = [[lat0 + y / S, lon0 + x / S]];
  for (let k = 4; k < a.length; k += 2) { x += a[k]; y += a[k + 1]; pts.push([lat0 + y / S, lon0 + x / S]); }
  if (!pts.some(p => inB(p[0], p[1], B))) return;
  const t = { highway: R.hw[a[0]] }, nm = R.names[a[1]]; if (nm) t.name = nm;
  if (R.sp && R.sp[i]) t.maxspeed = String(R.sp[i]);
  ways.push({ id: 9e9 + i, t, n: pts.map(p => nid(p[0], p[1])), g: pts.flatMap(p => [r6(p[0]), r6(p[1])]) });
});
const pts = []; let pid = 8e9;
const add = (arr, b, o) => (arr || []).forEach(p => { if (inB(p[0], p[1], b)) pts.push(Object.assign({ id: pid++, lat: r6(p[0]), lon: r6(p[1]), name: p[2] || '' }, o)); });
add(P.stop, SB, { k: 'stop', p: 1 }); add(P.signal, B, { k: 'signal' });
add(P.crossing, B, { k: 'crossing', sig: 0 }); add(P.school, B, { k: 'school', ot: 'n' }); add(P.kindergarten, B, { k: 'kindergarten', ot: 'n' });
const out = { v: 1, ts: Date.now(), mirror: 'zaxira fayl', fallback: true, ways, pts, routes: [], routesTs: 0, src: 'roads-samarqand.json (Overture/OSM) + pois-samarqand.json (OSM)' };
fs.writeFileSync('data/osm-fallback.json', JSON.stringify(out));
console.log('ways', ways.length, 'pts', pts.length, (fs.statSync('data/osm-fallback.json').size / 1024).toFixed(0) + ' KB');
