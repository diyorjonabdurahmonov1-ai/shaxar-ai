/* FAQAT TEST UCHUN: sintetik Overpass javoblari (haqiqiy maʼlumot emas).
   Ilova haqiqiy rejimda bu fayldan foydalanmaydi — u faqat tests/e2e.cjs da tarmoq soʻrovlarini almashtirish uchun. */
'use strict';

const LATS = [39.6430, 39.6460, 39.6490, 39.6520, 39.6550, 39.6580, 39.6610, 39.6640, 39.6670 - 0.0005];
const LONS = [66.9530, 66.9570, 66.9610, 66.9650, 66.9690, 66.9730, 66.9770, 66.9810, 66.9850, 66.9890, 66.9930, 66.9970];
const EW = [
  ['Gagarin koʻchasi', 'residential'], ['Bobur koʻchasi', 'tertiary'], ['Shohizinda koʻchasi', 'secondary'],
  ['Toshkent koʻchasi', 'primary'], ['Registon koʻchasi', 'primary'], ['Dagbitskiy koʻchasi', 'secondary'],
  ['Amir Temur koʻchasi', 'tertiary'], ['Mirzo Ulugʻbek koʻchasi', 'residential'], ['Navoiy shoh koʻchasi', 'secondary'],
];
const nid = (i, j) => 1000000 + i * 100 + j;
const mid = (i, j, k) => 2000000 + i * 1000 + j * 10 + k;

function build() {
  const ways = [], nodes = new Map();
  let wid = 5000;
  const nodeLL = (id, lat, lon) => { nodes.set(id, { lat, lon }); return id; };
  // Sharq-gʻarb koʻchalari: har 3 kvartalda yangi way
  EW.forEach(([name, hw], i) => {
    for (let j0 = 0; j0 < LONS.length - 1; j0 += 3) {
      const ids = [], geom = [];
      for (let j = j0; j <= Math.min(j0 + 3, LONS.length - 1); j++) {
        if (j > j0) { const mlon = (LONS[j - 1] + LONS[j]) / 2; ids.push(nodeLL(mid(i, j, 1), LATS[i], mlon)); }
        ids.push(nodeLL(nid(i, j), LATS[i], LONS[j]));
      }
      ids.forEach(id => geom.push(nodes.get(id)));
      const tags = { highway: hw, name };
      if (hw === 'primary') { tags.lanes = '4'; tags.maxspeed = '60'; }
      if (name === 'Dagbitskiy koʻchasi') tags.lanes = '2';
      if (name === 'Bobur koʻchasi') tags.oneway = 'yes';
      ways.push({ type: 'way', id: wid++, nodes: ids, geometry: geom, tags });
    }
  });
  // Shimol-janub koʻchalari
  LONS.forEach((lon, j) => {
    const ids = [], geom = [];
    for (let i = 0; i < LATS.length; i++) {
      if (i > 0) ids.push(nodeLL(mid(i, j, 2), (LATS[i - 1] + LATS[i]) / 2, lon));
      ids.push(nid(i, j));
    }
    ids.forEach(id => geom.push(nodes.get(id)));
    const hw = j === 5 || j === 9 ? 'secondary' : j % 4 === 1 ? 'tertiary' : j % 4 === 3 ? 'unclassified' : 'residential';
    const tags = { highway: hw };
    if (j !== 10) tags.name = `Sinov tor koʻchasi ${j + 1}`;
    ways.push({ type: 'way', id: wid++, nodes: ids, geometry: geom, tags });
  });

  const pts = [];
  let pid = 9000000;
  const pt = (lat, lon, tags) => pts.push({ type: 'node', id: pid++, lat, lon, tags });
  // Bekatlar (Registon va Toshkent koʻchalarida)
  const stopIds = [];
  [3, 4].forEach(i => [1, 3, 5, 7, 9, 11].forEach(j => { stopIds.push({ id: pid, lat: LATS[i] + 0.00012, lon: LONS[j] - 0.0006, i, j }); pt(LATS[i] + 0.00012, LONS[j] - 0.0006, { highway: 'bus_stop', name: `Bekat ${i}-${j}` }); }));
  // Svetoforlar
  [[3, 3], [3, 6], [4, 6], [4, 9], [5, 6]].forEach(([i, j]) => pt(LATS[i], LONS[j], { highway: 'traffic_signals' }));
  // Piyoda oʻtishlar
  [[4, 2], [4, 4], [2, 5]].forEach(([i, j]) => pt(LATS[i], LONS[j] + 0.0003, { highway: 'crossing', crossing: 'marked' }));
  // Maktab va bogʻcha
  pt(LATS[4] + 0.0008, LONS[4] + 0.0005, { amenity: 'school', name: '12-maktab' });
  pt(LATS[7] + 0.0008, LONS[10], { amenity: 'kindergarten', name: '5-bogʻcha' });

  const streets = { version: 0.6, elements: ways.concat(pts) };

  // Avtobus yoʻnalishlari
  const waysOf = name => ways.filter(w => w.tags.name === name);
  const rel = (id, ref, from, to, name, rev) => {
    const ws = waysOf(name);
    const st = stopIds.filter(s => LATS[s.i] === ws[0].geometry[0].lat);
    const ordered = rev ? st.slice().reverse() : st;
    return {
      type: 'relation', id, tags: { type: 'route', route: 'bus', ref, from, to, name: `Avtobus ${ref}` },
      members: (rev ? ws.slice().reverse() : ws).map(w => ({ type: 'way', ref: w.id, role: '', geometry: w.geometry }))
        .concat(ordered.map(s => ({ type: 'node', ref: s.id, role: 'platform', lat: s.lat, lon: s.lon }))),
    };
  };
  const routes = { version: 0.6, elements: [
    rel(7001, '3', 'Vokzal', 'Registon', 'Registon koʻchasi', false),
    rel(7002, '3', 'Registon', 'Vokzal', 'Registon koʻchasi', true),
    rel(7003, '10', 'Bozor', 'Universitet', 'Toshkent koʻchasi', false),
    rel(7004, '45', 'Siyob', 'Afrosiyob', 'Registon koʻchasi', false),
  ] };
  return { streets, routes };
}

module.exports = { build };
