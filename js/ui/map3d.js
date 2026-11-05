/* City Jam — 3D shahar (MapLibre GL): binolar balandligi bilan, quyosh salohiyati, suv toshqini xavfi, yangi bino va uning soyasi. */
(function () {
  'use strict';
  const NX = window.NX;
  // 3D koʻrinishi yashirin yoki ustida fotoreal (Cesium) — animatsiyalar toʻxtaydi
  const m3off = () => { const e = document.getElementById('map3d'); return !e || e.hidden || e.classList.contains('g3d-on'); };
  let map = null, ready = null, mode = 'height', data = { buildings: [], ghi: null, flood: null, plan: null, scen: null, hz: null, onView: null };
  let hzMarks = [];
  const BASE = {
    sat: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Surat: Esri, Maxar, Earthstar Geographics', maxzoom: 18 },
    street: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'], attribution: '© Esri, OpenStreetMap hissadorlari', maxzoom: 17 },
    // “Raqamli egizak” — qorongʻi fon, binolar balandligi boʻyicha yorugʻ, koʻchalar nur kabi
    twin: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'], attribution: 'Fon: Esri, HERE, Garmin, © OpenStreetMap', maxzoom: 16 },
  };
  // Esri plitalari Samarqand uchun maʼlum zoomdan keyin “Map data not yet available” qaytaradi — shundan yuqorida MapLibre
  // oxirgi plitani kattalashtiradi (maxzoom). Ustidan OpenFreeMap vektor xaritasi (OSM): koʻchalar, suv, bogʻlar va nomlar har zoomda tiniq.
  const OMT = 'https://tiles.openfreemap.org/planet', GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
  const NAME = ['coalesce', ['get', 'name:uz'], ['get', 'name:latin'], ['get', 'name']];
  const LINE = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
  const VEC = [
    { id: 'v-tint', type: 'background', paint: { 'background-color': '#03122a', 'background-opacity': 0.5 } },
    { id: 'v-park', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['match', ['get', 'class'], ['park', 'cemetery', 'grass', 'recreation_ground', 'pitch', 'stadium'], true, false], paint: { 'fill-color': '#0b3b33', 'fill-opacity': 0.55 } },
    { id: 'v-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'grass', 'farmland', 'wetland'], true, false], paint: { 'fill-color': '#0a3a2c', 'fill-opacity': 0.4 } },
    { id: 'v-water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#0b3d63', 'fill-opacity': 0.9 } },
    { id: 'v-waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': '#1f78b4', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 18, 3] } },
    { id: 'v-path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 15, filter: ['all', LINE, ['match', ['get', 'class'], ['path', 'track'], true, false]], paint: { 'line-color': '#2a5675', 'line-dasharray': [1.5, 1.5], 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 19, 2] } },
    { id: 'v-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12, filter: ['all', LINE, ['match', ['get', 'class'], ['minor', 'service'], true, false]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#173650', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 1, 19, 14] } },
    { id: 'v-major', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', LINE, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1d4767', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 1.2, 19, 26] } },
  ];
  // Nomlar — binolar ustida (keyin qoʻshiladi)
  const LABELS = [
    { id: 'v-street-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14.5, filter: LINE, layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 19, 14], 'text-max-angle': 30, 'symbol-spacing': 320 }, paint: { 'text-color': '#a5d8f0', 'text-halo-color': '#020817', 'text-halo-width': 1.6 } },
    { id: 'v-poi', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 16.8, filter: ['<=', ['coalesce', ['get', 'rank'], 99], 14], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-max-width': 8, 'text-offset': [0, 0.6], 'text-anchor': 'top' }, paint: { 'text-color': '#cbd5e1', 'text-halo-color': '#020817', 'text-halo-width': 1.4 } },
    { id: 'v-place', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 12, maxzoom: 16.5, filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 14], 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 9 }, paint: { 'text-color': '#5eead4', 'text-halo-color': '#020817', 'text-halo-width': 1.8, 'text-opacity': 0.85 } },
  ];
  // Vektor fon xarita yuklangandan keyin qoʻshiladi: server javob bermasa ham 3D ochiladi (raster fon qoladi)
  async function addVector() {
    let tj = null;
    try { const r = await NX.fetchJSON(OMT, {}, 8000); tj = r.ok && r.data && r.data.tiles ? r.data : null; } catch (e) { tj = null; }
    if (!tj || !map || map.getSource('omt')) return;
    try {
      map.addSource('omt', { type: 'vector', tiles: tj.tiles, minzoom: tj.minzoom || 0, maxzoom: tj.maxzoom || 14, attribution: '© OpenFreeMap, © OpenStreetMap' });
      const vis = v => (v ? 'visible' : 'none');
      VEC.forEach(l => map.addLayer(Object.assign({}, l, { layout: Object.assign({}, l.layout, { visibility: vis(base === 'twin') }) }), 'roads-glow'));
      LABELS.forEach(l => map.addLayer(Object.assign({}, l, { layout: Object.assign({}, l.layout, { visibility: vis(base !== 'street') }) }), 'hz-zone'));
    } catch (e) { console.warn('Vektor fon:', e.message); }
  }
  // Fon turiga qarab: Raqamli egizak — vektor qatlamlar hammasi; sunʼiy yoʻldosh — faqat nomlar; xarita — hech biri
  function applyBase() {
    if (!map || !map.getLayer('base-twin')) return;
    Object.keys(BASE).forEach(k => map.setLayoutProperty('base-' + k, 'visibility', k === base ? 'visible' : 'none'));
    VEC.forEach(l => map.getLayer(l.id) && map.setLayoutProperty(l.id, 'visibility', base === 'twin' ? 'visible' : 'none'));
    LABELS.forEach(l => map.getLayer(l.id) && map.setLayoutProperty(l.id, 'visibility', base === 'street' ? 'none' : 'visible'));
  }
  let base = 'twin';
  try { base = localStorage.getItem('m3d:base') || 'twin'; } catch (e) { /* */ }
  if (!BASE[base]) base = 'twin';

  // Binolar rangi — xususiyatlar boʻyicha ifoda (xarita qayta chizilmaydi, rejim almashsa darhol)
  // Balandlik: sunʼiy yoʻldoshda — iliq qum/tosh tuslari; “Raqamli egizak”da — balandlik oshgani sari yorugʻroq zumrad-moviy (suv rangi emas)
  const H_SAT = ['interpolate', ['linear'], ['get', 'lv'], 1, '#f3ead9', 2, '#e6d5bb', 4, '#cdb594', 6, '#a8927a', 9, '#7c6f66', 14, '#5b524d'];
  const H_TWIN = ['interpolate', ['linear'], ['get', 'lv'], 1, '#1f3b4d', 2, '#24566a', 4, '#1f7f86', 6, '#22a39a', 9, '#5eead4', 14, '#ccfbf1'];
  // Sunʼiy yoʻldosh fonida past uylar bir xil “kubik” boʻlmasin — devor tuslari biroz farqli (faqat koʻrinish uchun, maʼlumot emas)
  const H_SAT_V = ['case', ['<=', ['get', 'lv'], 2], ['match', ['%', ['get', 'id'], 5], 0, '#efe5d2', 1, '#e6d9c0', 2, '#f4eee3', 3, '#dccdb1', '#e9dfcc'], H_SAT];
  function colorExpr() {
    const hgt = base === 'twin' ? H_TWIN : H_SAT_V;
    if (mode === 'solar') return ['interpolate', ['linear'], ['get', 'kwh'], 0, '#e5e7eb', 3000, '#fde68a', 8000, '#fcd34d', 20000, '#f59e0b', 50000, '#b45309'];
    if (mode === 'flood') return ['case', ['boolean', ['feature-state', 'wet'], false], '#60a5fa', base === 'twin' ? '#334155' : '#e2e8f0'];
    if (mode === 'plan') return ['case', ['boolean', ['feature-state', 'shade'], false], '#475569', hgt];
    if (mode === 'quake') return ['case', ['==', ['get', 'cr'], 1], '#dc2626', ['>=', ['get', 'lv'], 5], '#f97316', ['>=', ['get', 'lv'], 3], '#fbbf24', base === 'twin' ? '#475569' : '#cbd5e1'];
    return base === 'twin' ? ['case', ['==', ['get', 'dl'], 1], '#d8bd93', ['==', ['get', 'lm'], 1], '#fbbf24', hgt] : ['case', ['==', ['get', 'dl'], 1], '#d8bd93', hgt];
  }
  // ---------- Kechki shahar: binolar derazalari yonib turadi (“Raqamli egizak”, balandlik rejimi) ----------
  // Uch xil devor: past uy — iliq chiroqlar kam; oʻrta — koʻp qavatli turar joy; baland — ofis oynalari (oq-moviy)
  const WIN = {
    w1: { cols: 3, rows: 3, wall: '#16222e', on: ['#fcd34d', '#fde68a', '#fbbf24'], p: 0.35 },
    w2: { cols: 4, rows: 4, wall: '#132433', on: ['#fde68a', '#fcd34d', '#fef3c7', '#a5f3fc'], p: 0.45 },
    w3: { cols: 5, rows: 6, wall: '#0f2236', on: ['#e0f2fe', '#a5f3fc', '#bae6fd', '#fde68a'], p: 0.55 },
  };
  const WSZ = 32;
  function winImage(k) {
    const o = WIN[k], c = document.createElement('canvas'); c.width = c.height = WSZ;
    const g = c.getContext('2d');
    g.fillStyle = o.wall; g.fillRect(0, 0, WSZ, WSZ);
    const cw = WSZ / o.cols, ch = WSZ / o.rows;
    for (let i = 0; i < o.cols; i++) for (let j = 0; j < o.rows; j++) {
      const lit = Math.random() < o.p, x = i * cw + cw * 0.22, y = j * ch + ch * 0.25, w = cw * 0.56, h = ch * 0.5;
      g.fillStyle = lit ? o.on[Math.floor(Math.random() * o.on.length)] : '#0b1320';
      g.globalAlpha = lit ? 0.75 + Math.random() * 0.25 : 1;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
    }
    return g.getImageData(0, 0, WSZ, WSZ);
  }
  const isLite = () => document.documentElement.classList.contains('lite');
  const windowsOn = () => base === 'twin' && mode === 'height' && !isLite();
  function addWindows() {
    Object.keys(WIN).forEach(k => { if (!map.hasImage(k)) map.addImage(k, winImage(k)); });
    // Obidalar devori: pishgan gʻisht va koshin chiziqlari (derazasiz)
    if (!map.hasImage('wlm')) { const c = document.createElement('canvas'); c.width = c.height = WSZ; const g = c.getContext('2d'); g.fillStyle = '#cdb08a'; g.fillRect(0, 0, WSZ, WSZ); g.fillStyle = 'rgba(120,90,60,.25)'; for (let y = 0; y < WSZ; y += 4) g.fillRect(0, y, WSZ, 1); g.fillStyle = '#1f9fb8'; g.fillRect(0, WSZ - 5, WSZ, 3); map.addImage('wlm', g.getImageData(0, 0, WSZ, WSZ)); }
    // Har necha soniyada bir devor turi yangilanadi — kimdir chiroq yoqadi, kimdir oʻchiradi
    let t = 0;
    setInterval(() => { if (!windowsOn() || document.hidden || m3off()) return; const k = Object.keys(WIN)[t++ % 3]; try { map.updateImage(k, winImage(k)); } catch (e) { /* */ } }, 2500);
  }
  function applyWindows() {
    if (!map || !map.getLayer('bld')) return;
    const on = windowsOn();
    map.setPaintProperty('bld', 'fill-extrusion-pattern', on ? ['case', ['==', ['get', 'dl'], 1], 'wlm', ['step', ['get', 'lv'], 'w1', 3, 'w2', 7, 'w3']] : undefined);
    map.setLayoutProperty('bld-roof', 'visibility', on ? 'visible' : 'none');
  }

  const CRIT = /school|kindergarten|hospital|clinic/;
  // Tarixiy obidalar va masjidlar — “Raqamli egizak”da oltin rang bilan ajralib turadi
  const LANDMARK = /mosque|religious|cathedral|church|temple|shrine/, LM_NAME = /madras|masjid|maqbara|mausole|registon|bibixonim|bibi.?xonim|go.?ri.?amir|gur.?emir|shohi.?zinda|shah.?i.?zinda|ulug.?bek|observator|xonaqoh|maqbarasi|мадраса|мечеть|мавзолей/i;
  let geoKey = '', geoCache = null;
  function buildingsGeo() {
    const ghi = data.ghi && data.ghi.kwh, lite = isLite(), key = data.buildings.length + ':' + (ghi || 0) + ':' + (data.buildings[0] && data.buildings[0].id) + ':' + lite;
    if (geoCache && key === geoKey) return geoCache;
    geoKey = key;
    geoCache = { type: 'FeatureCollection', features: (lite ? data.buildings.filter(b => b.area >= 60 || b.levels >= 3) : data.buildings).map(b => ({ type: 'Feature', id: b.id, properties: { h: b.height, lv: b.levels, id: b.id, cr: CRIT.test(b.kind) ? 1 : 0, lm: LANDMARK.test(b.kind) || (b.name && LM_NAME.test(b.name)) ? 1 : 0, dl: b.lmK ? 1 : 0, kwh: ghi ? NX.twin.roofKwh(b, ghi) : 0 }, geometry: { type: 'Polygon', coordinates: b.holes ? [b.ring].concat(b.holes) : [b.ring] } })) };
    return geoCache;
  }
  // Suv yetgan / soyada qolgan binolar — feature-state (minglab binoni qayta chizmasdan)
  let stateKey = '';
  function applyStates() {
    if (!map || !map.getSource('bld')) return;
    const wet = mode === 'flood' && data.scen && data.scen.mode === 'street' && data.scen.wetIds ? data.scen.wetIds : null;
    const shade = mode === 'plan' && data.plan ? data.plan.shaded : null;
    const key = mode + ':' + (wet ? wet.size + ':' + data.scen.rain + ':' + (data.scen.segs ? data.scen.segs.length : 0) : '') + ':' + (shade ? shade.length : '');
    if (key === stateKey) return;
    stateKey = key;
    map.removeFeatureState({ source: 'bld' });
    if (wet) wet.forEach(id => map.setFeatureState({ source: 'bld', id }, { wet: true }));
    if (shade) shade.forEach(b => map.setFeatureState({ source: 'bld', id: b.id }, { shade: true }));
    if (NX.city3d) NX.city3d.reapply();
  }
  // Suv chuqurligi rangi: <30 sm och, 30–60 sm, >60 sm toʻq koʻk
  const depthCol = d => (d >= 0.6 ? '#1e3a8a' : d >= 0.3 ? '#2563eb' : '#60a5fa');
  // Koʻchalardagi suv — chiziqlar (oqim yoʻnalishida), chuqurlik: d (m)
  function waterGeo() {
    if (mode !== 'flood' || !data.scen || data.scen.mode !== 'street') return { type: 'FeatureCollection', features: [] };
    // Chiziq: koʻchani bosgan suv (d) yoki ariq/chetdagi sayoz oqim (r) — oqim yoʻnalishida
    return { type: 'FeatureCollection', features: data.scen.segs.map(s => ({ type: 'Feature', properties: { d: s.d >= 0.02 ? s.d : 0.02, w: s.w }, geometry: { type: 'LineString', coordinates: s.c } })) };
  }
  // Hajmli suv: har koʻcha boʻlagi — kengligi koʻcha + yoyilish, balandligi chuqurlikka mos (koʻrinishi uchun ×1.6, kamida 0.35 m)
  function waterVolGeo() {
    if (mode !== 'flood' || !data.scen || data.scen.mode !== 'street') return { type: 'FeatureCollection', features: [] };
    const f = [];
    data.scen.segs.forEach(s => {
      if (s.d < 0.05) return;            // sayoz oqim — faqat chiziq (oqim yoʻnalishi bilan), hajm emas
      const [a, b] = s.c, lat = (a[1] + b[1]) / 2, kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 111320;
      const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky, L = Math.hypot(dx, dy);
      if (L < 1) return;
      // Haqiqiy oʻlcham: koʻcha kengligi (chuqur suv yoʻlakka ham chiqadi — +2 m gacha), balandligi = chuqurlik
      const hw = Math.min(12, (s.w || 8) * 0.5 + Math.min(2, s.d * 3)), nx = -dy / L * hw / kx, ny = dx / L * hw / ky;
      // Uchlari biroz uzaytiriladi — boʻlaklar orasida tirqish qolmasin
      const ex = dx / L * 2 / kx, ey = dy / L * 2 / ky;
      f.push({ type: 'Feature', properties: { d: s.d, h: Math.max(0.12, s.d), k: s.d >= 0.6 ? 'wv3' : s.d >= 0.3 ? 'wv2' : 'wv1' }, geometry: { type: 'Polygon', coordinates: [[[a[0] - ex + nx, a[1] - ey + ny], [b[0] + ex + nx, b[1] + ey + ny], [b[0] + ex - nx, b[1] + ey - ny], [a[0] - ex - nx, a[1] - ey - ny], [a[0] - ex + nx, a[1] - ey + ny]]] } });
    });
    return { type: 'FeatureCollection', features: f };
  }
  // Suv teksturasi: toshqin suvi (loyqa moviy), bir nechta toʻlqin yigʻindisi — choʻqqilarida quyosh yaltirashi
  const WATER = [
    { id: 'wv1', a: [96, 150, 168], b: [150, 196, 210] },     // sayoz: tiniqroq, yerga yaqin rang
    { id: 'wv2', a: [52, 104, 140], b: [110, 160, 190] },
    { id: 'wv3', a: [26, 62, 104], b: [70, 118, 160] },        // chuqur: toʻq
  ];
  const WSZ2 = 64;
  function waterFrame(w, t) {
    const c = document.createElement('canvas'); c.width = c.height = WSZ2;
    const g = c.getContext('2d'), img = g.createImageData(WSZ2, WSZ2), T = t * 0.35, P = Math.PI * 2 / WSZ2;
    for (let y = 0; y < WSZ2; y++) for (let x = 0; x < WSZ2; x++) {
      // Plitka chegarasida uzilmasin — butun davrli toʻlqinlar
      const v = Math.sin(x * P * 2 + T) + Math.sin(y * P * 3 - T * 1.3) + Math.sin((x + y) * P * 1 + T * 0.7) + 0.6 * Math.sin((x - 2 * y) * P * 2 - T * 1.7);
      const n = (v + 3.6) / 7.2, glint = Math.max(0, n - 0.82) * 5.5;
      const i = (y * WSZ2 + x) * 4;
      img.data[i] = Math.min(255, w.a[0] + (w.b[0] - w.a[0]) * n + 255 * glint * 0.8);
      img.data[i + 1] = Math.min(255, w.a[1] + (w.b[1] - w.a[1]) * n + 255 * glint * 0.85);
      img.data[i + 2] = Math.min(255, w.a[2] + (w.b[2] - w.a[2]) * n + 255 * glint);
      img.data[i + 3] = 235;
    }
    return img;
  }
  // Eski katak koʻrinishi olib tashlangan — suv faqat koʻchalar boʻylab
  const floodGeo = () => ({ type: 'FeatureCollection', features: [] });
  // Koʻchalar (butun shahar) — “Raqamli egizak” rejimida nur chiziqlar
  const RW = { trunk: 3, primary: 3, secondary: 2.4, tertiary: 1.8, unclassified: 1.2, residential: 1, living_street: 0.8 };
  let roadsKey = '';
  function roadsGeo() {
    return { type: 'FeatureCollection', features: (data.roads || []).filter(w => RW[w.hw]).map(w => ({ type: 'Feature', properties: { w: RW[w.hw] }, geometry: { type: 'LineString', coordinates: w.ll.map(p => [p[1], p[0]]) } })) };
  }
  function planGeo() {
    const P = data.plan, f = [];
    // Rejadagi yangi bino har doim koʻrinadi (aytilgan qavat balandligida); qishki soya — “Yangi bino va soya” rejimida
    if (P && P.planned) {
      if (mode === 'plan') P.list.filter(s => s.ring && s.label.startsWith('Qish')).forEach(s => f.push({ type: 'Feature', properties: { kind: 'shadow', h: 0 }, geometry: { type: 'Polygon', coordinates: [s.ring] } }));
      f.push({ type: 'Feature', properties: { kind: 'plan', h: P.planned.height }, geometry: { type: 'Polygon', coordinates: [P.planned.ring] } });
    }
    return { type: 'FeatureCollection', features: f };
  }

  // Favqulodda vaziyat qatlami: xavf zonalari (qizil), evakuatsiya yoʻllari (yashil), yigʻilish/baland joylar (raqamli belgilar)
  function hzGeo() {
    const f = [];
    (data.hz || []).forEach(a => {
      if (a.kind === 'point' && a.list === false) f.push({ type: 'Feature', properties: { t: 'dot', col: a.color || '#f59e0b' }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } });
      if (a.kind === 'zone' && a.cells && a.cells.length) {
        // Haqiqiy binolar kataklari (40 m) — xavf darajasiga qarab shaffoflik
        const dLat = 20 / 111320, dLon = 20 / (111320 * Math.cos(a.lat * Math.PI / 180));
        a.cells.forEach(c => f.push({ type: 'Feature', properties: { t: 'zone', col: a.color, o: 0.25 + 0.5 * c[2] }, geometry: { type: 'Polygon', coordinates: [[[c[1] - dLon, c[0] - dLat], [c[1] + dLon, c[0] - dLat], [c[1] + dLon, c[0] + dLat], [c[1] - dLon, c[0] + dLat], [c[1] - dLon, c[0] - dLat]]] } }));
      } else if (a.kind === 'zone' && a.ring) f.push({ type: 'Feature', properties: { t: 'zone', col: a.color, o: 0.32 }, geometry: { type: 'Polygon', coordinates: [a.ring.map(p => [p[1], p[0]])] } });
      else if (a.kind === 'line' && a.paths) f.push({ type: 'Feature', properties: { t: a.style === 'blocked' ? 'blocked' : 'route', col: a.color }, geometry: { type: 'MultiLineString', coordinates: a.paths.map(p => p.map(q => [q[1], q[0]])) } });
      else if (a.kind === 'line' && a.style === 'rescue') f.push({ type: 'Feature', properties: { t: 'rescue', col: a.color }, geometry: { type: 'LineString', coordinates: a.path.map(p => [p[1], p[0]]) } });
      else if (a.kind === 'line' && a.style === 'seg') f.push({ type: 'Feature', properties: { t: 'seg', col: a.color, w: a.w != null ? a.w : 1 }, geometry: { type: 'LineString', coordinates: a.path.map(p => [p[1], p[0]]) } });
      else if (a.kind === 'line') f.push({ type: 'Feature', properties: { t: a.dash ? 'alt' : 'route', col: a.color || '#16a34a' }, geometry: { type: 'LineString', coordinates: (a.path || [a.from, a.to]).map(p => [p[1], p[0]]) } });
    });
    // Yoʻl boshlanishi (○) va manzili (●) — yoʻllar kam boʻlsa (yoʻnalish aniq boʻlsin)
    const rl = (data.hz || []).filter(a => a.kind === 'line' && a.path && a.path.length > 1 && (!a.style || a.style === 'rescue') && !a.dash);
    if (rl.length <= 20) rl.forEach(a => { const p0 = a.path[0], p1 = a.path[a.path.length - 1]; f.push({ type: 'Feature', properties: { t: 'rstart', col: a.color }, geometry: { type: 'Point', coordinates: [p0[1], p0[0]] } }); f.push({ type: 'Feature', properties: { t: 'rend', col: a.color }, geometry: { type: 'Point', coordinates: [p1[1], p1[0]] } }); });
    return { type: 'FeatureCollection', features: f };
  }
  // Yoʻnalish oʻqi (chiziq boʻylab takrorlanadi; chiziq yoʻnalishi = harakat yoʻnalishi)
  function arrowImage(col) {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    g.fillStyle = col; g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(28, 16); g.lineTo(8, 5); g.lineTo(13, 16); g.lineTo(8, 27); g.closePath(); g.fill(); g.stroke();
    return g.getImageData(0, 0, 32, 32);
  }
  function hzMarkers() {
    hzMarks.forEach(m => m.remove()); hzMarks = [];
    if (!map || !window.maplibregl.Marker) return;
    (data.hz || []).forEach((a, i) => {
      if (a.dash || a.kind === 'water' || a.kind === 'line' || a.list === false) return;   // mayda obyektlar (quduqlar) — faqat nuqta   // yoʻllar — chiziq va oqim; belgilar faqat joylar va zonalarga
      const el = document.createElement('div');
      el.className = 'hz-pin hz-' + a.kind; el.style.background = a.color || '#7c3aed'; el.textContent = a.id || String(i + 1); el.title = a.title;
      const m = new window.maplibregl.Marker({ element: el }).setLngLat([a.lon, a.lat]);
      // Toʻliq popup: izoh, koʻcha nomi, shu nuqtaning real surati (Mapillary) va Yandex panorama — 2D dagi bilan bir xil
      if (window.maplibregl.Popup) m.setPopup(new window.maplibregl.Popup({ maxWidth: '320px' }).setHTML(NX.place ? NX.place.html(a) : `<div class="ppop"><b>${NX.esc(a.title)}</b><p>${NX.esc(a.note || '')}</p></div>`));
      m.addTo(map); hzMarks.push(m);
    });
  }

  // ---------- Quyosh: hozirgi vaqtdagi haqiqiy holati (azimut, balandlik) boʻyicha yorugʻlik; kechasi — oy nuri ----------
  let sunNow = null;
  function applySun() {
    if (!map || !NX.twin || !NX.twin.sunPos) return;
    const c = NX.config.center, sp = NX.twin.sunPos(new Date(), c[0], c[1]); sunNow = sp;
    try {
      if (sp.alt > 0) map.setLight({ anchor: 'map', color: sp.alt < 12 ? '#ffd7a0' : '#fff8ec', intensity: 0.35 + Math.min(0.25, sp.alt / 200), position: [1.4, sp.az, Math.max(15, Math.min(80, 90 - sp.alt))] });
      else map.setLight({ anchor: 'map', color: '#a9c8ff', intensity: 0.3, position: [1.3, 210, 40] });
    } catch (e) { /* eski versiya */ }
  }
  // ---------- Obidalar: 3D yorliqlar va kinematik sayohat ----------
  // Yorliqlar — OSM’dagi haqiqiy kontur markazlari
  const LANDMARKS = [
    { n: 'Registon', c: [39.6550, 66.9757], b: 200, z: 17.2 },
    { n: 'Chorsu', c: [39.65632, 66.97812], b: 230, z: 17.6 },
    { n: 'Bibixonim masjidi', c: [39.6607, 66.9808], b: 100, z: 17.1 },
    { n: 'Siyob bozori', c: [39.6614, 66.9800], b: 60, z: 17 },
    { n: 'Hazrati Xizr', c: [39.66345, 66.98336], b: 300, z: 17.5 },
    { n: 'Shohi Zinda', c: [39.6625, 66.9880], b: 330, z: 17.4 },
    { n: 'Afrosiyob muzeyi', c: [39.66941, 66.99334], b: 20, z: 16.4 },
    { n: 'Ulugʻbek rasadxonasi', c: [39.67523, 67.00552], b: 250, z: 17.2 },
    { n: 'Goʻri Amir', c: [39.64865, 66.96915], b: 160, z: 17.4 },
    { n: 'Ruhobod', c: [39.65085, 66.96819], b: 40, z: 17.6 },
    { n: 'Viloyat hokimligi', c: [39.65585, 66.96543], b: 200, z: 17 },
    { n: 'Shahar hokimligi', c: [39.64666, 66.95989], b: 200, z: 17 },
  ];
  let lmMarks = [];
  function landmarks() {
    if (!window.maplibregl.Marker) return;
    lmMarks = LANDMARKS.map(l => { const el = document.createElement('div'); el.className = 'lm-tag'; el.innerHTML = `<i></i><span>${NX.esc(l.n)}</span>`; el.onclick = () => map.flyTo({ center: [l.c[1], l.c[0]], zoom: l.z, pitch: 65, bearing: l.b, duration: 2500 }); return new window.maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([l.c[1], l.c[0]]).addTo(map); });
    const vis = () => { const show = map.getZoom() >= 13.8 && !data.hz; lmMarks.forEach(m => { m.getElement().style.display = show ? '' : 'none'; }); };
    map.on('zoomend', vis); vis(); landmarks.vis = vis;
  }
  let tourOn = false, tourT = null;
  function tourStop() { tourOn = false; clearTimeout(tourT); if (map) map.stop(); document.dispatchEvent(new Event('nx:tour')); }
  function tour() {
    if (!map) return;
    if (tourOn) { tourStop(); return; }
    tourOn = true; document.dispatchEvent(new Event('nx:tour'));
    let i = 0;
    const step = () => {
      if (!tourOn) return;
      const l = LANDMARKS[i % LANDMARKS.length]; i++;
      map.flyTo({ center: [l.c[1], l.c[0]], zoom: l.z, pitch: 66, bearing: l.b, duration: 6000, curve: 1.3, essential: true });
      map.once('moveend', () => { if (!tourOn) return; map.easeTo({ bearing: l.b + 70, duration: 6000, easing: t => t }); tourT = setTimeout(step, 6200); });
    };
    step();
  }
  // Balandlik masshtabi (↕): binolar baland/past farqi yaqqolroq koʻrinsin (×1 — haqiqiy)
  const hScale = 1;
  // Realistik model chizilgan binolar (city3d.js, feature-state r3d) — MapLibre hajmi 0 (ikki marta chizilmasin)
  const HX = () => ['case', ['boolean', ['feature-state', 'r3d'], false], 0, ['*', ['get', 'h'], hScale]];
  function applyHeight() {
    if (!map || !map.getLayer('bld')) return;
    map.setPaintProperty('bld', 'fill-extrusion-height', ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, HX()]);
    map.setPaintProperty('bld-roof', 'fill-extrusion-base', ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, HX()]);
    map.setPaintProperty('bld-roof', 'fill-extrusion-height', ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, ['+', HX(), 0.6]]);
  }
  // ---------- 3D boshqaruv paneli (xarita ustida): katta ekran, kamera burchaklari, balandlik legendasi ----------
  function controls(el) {
    const box = document.createElement('div'); box.className = 'tw-ctl';
    box.innerHTML = '';
    const leg = document.createElement('div'); leg.className = 'tw-leg'; leg.innerHTML = '<b>Qavatlar</b><i></i><span><em>1</em><em>3</em><em>6</em><em>9</em><em>14+</em></span><small>oltin — tarixiy obidalar</small>'; el.appendChild(leg);
    const legVis = () => { leg.hidden = !(mode === 'height' && base === 'twin'); };
    controls.legVis = legVis; legVis();
  }
  // ---------- 3D xaritada hudud chizish: bosib-bosib nuqta qoʻyiladi, “✓ Tayyor” yoki ikki marta bosish bilan tugaydi ----------
  let drawSt = null;
  function areaGeo(pts, closed) {
    const f = [];
    if (pts.length >= 3 && closed) f.push({ type: 'Feature', properties: { t: 'fill' }, geometry: { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(p => [p[1], p[0]])] } });
    if (pts.length >= 2) f.push({ type: 'Feature', properties: { t: 'line' }, geometry: { type: 'LineString', coordinates: (closed ? pts.concat([pts[0]]) : pts).map(p => [p[1], p[0]]) } });
    pts.forEach(p => f.push({ type: 'Feature', properties: { t: 'pt' }, geometry: { type: 'Point', coordinates: [p[1], p[0]] } }));
    return { type: 'FeatureCollection', features: f };
  }
  function ensureAreaLayers() {
    if (map.getSource('area3d')) return;
    map.addSource('area3d', { type: 'geojson', data: areaGeo([], false) });
    map.addLayer({ id: 'area3d-fill', type: 'fill', source: 'area3d', filter: ['==', ['get', 't'], 'fill'], paint: { 'fill-color': '#a855f7', 'fill-opacity': 0.16 } }, 'bld');
    map.addLayer({ id: 'area3d-line', type: 'line', source: 'area3d', filter: ['==', ['get', 't'], 'line'], paint: { 'line-color': '#c084fc', 'line-width': 3, 'line-dasharray': [2, 1.2] } });
    map.addLayer({ id: 'area3d-pt', type: 'circle', source: 'area3d', filter: ['==', ['get', 't'], 'pt'], paint: { 'circle-radius': 5, 'circle-color': '#f5d0fe', 'circle-stroke-color': '#7e22ce', 'circle-stroke-width': 2 } });
  }
  function showArea(poly) { if (!map || !map.getSource) return; ensureAreaLayers(); map.getSource('area3d').setData(areaGeo(poly || [], true)); }
  function drawPoly(done) {
    if (!map) return;
    ensureAreaLayers();
    if (drawSt) drawStop();
    const pts = [], host = map.getContainer();
    const bar = document.createElement('div'); bar.className = 'draw3d-bar';
    bar.innerHTML = '<span>✏️ Hudud chegarasini bosib-bosib belgilang (kamida 3 nuqta)</span><button type="button" data-d="ok" class="primary">✓ Tayyor</button><button type="button" data-d="undo">↶</button><button type="button" data-d="x">✕</button>';
    host.appendChild(bar);
    const upd = () => map.getSource('area3d').setData(areaGeo(pts, false));
    const click = e => { pts.push([e.lngLat.lat, e.lngLat.lng]); upd(); };
    const finish = () => { if (pts.length < 3) return; const poly = pts.slice(); drawStop(); map.getSource('area3d').setData(areaGeo(poly, true)); done && done(poly); };
    const dbl = e => { e.preventDefault(); finish(); };
    const key = e => { if (e.key === 'Escape') { drawStop(); showArea(null); } };
    bar.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; if (b.dataset.d === 'ok') finish(); if (b.dataset.d === 'undo') { pts.pop(); upd(); } if (b.dataset.d === 'x') { drawStop(); showArea(null); } });
    map.on('click', click); map.on('dblclick', dbl); document.addEventListener('keydown', key);
    map.doubleClickZoom.disable(); map.getCanvas().style.cursor = 'crosshair';
    drawSt = { bar, click, dbl, key };
  }
  function drawStop() {
    if (!drawSt) return;
    map.off('click', drawSt.click); map.off('dblclick', drawSt.dbl); document.removeEventListener('keydown', drawSt.key);
    drawSt.bar.remove(); map.getCanvas().style.cursor = ''; setTimeout(() => map.doubleClickZoom.enable(), 300);
    drawSt = null;
  }
  // Sunʼiy yoʻldosh qatlami (issiqlik / yashillik) — rasm manbasi, binolar ostida
  let ovUrl = null;
  function setOverlay(url, bbox) {
    ovUrl = url || null;
    if (!map || !map.getStyle) return;
    if (map.getLayer('satov')) map.removeLayer('satov');
    if (map.getSource('satov')) map.removeSource('satov');
    if (!url) return;
    const [w, s, e, n] = bbox;
    map.addSource('satov', { type: 'image', url, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
    map.addLayer({ id: 'satov', type: 'raster', source: 'satov', paint: { 'raster-opacity': 0.72, 'raster-resampling': 'linear' } }, map.getLayer('roads-glow') ? 'roads-glow' : 'bld');
  }
  function init(el) {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      if (!window.maplibregl) return reject(new Error('3D kutubxonasi yuklanmadi.'));
      const c = NX.config.center;
      map = new window.maplibregl.Map({
        container: el, center: [66.9757, 39.6545], zoom: 16.6, pitch: 62, bearing: -20, maxPitch: 80, maxZoom: 23.5, attributionControl: true, preserveDrawingBuffer: true, canvasContextAttributes: { preserveDrawingBuffer: true },
        style: (() => {
          const sources = {}, layers = [];
          Object.keys(BASE).forEach(k => { sources['base-' + k] = Object.assign({ type: 'raster', tileSize: 256 }, BASE[k]); layers.push({ id: 'base-' + k, type: 'raster', source: 'base-' + k, layout: { visibility: k === base ? 'visible' : 'none' }, paint: k === 'sat' ? { 'raster-saturation': 0.15 } : k === 'twin' ? { 'raster-brightness-max': 0.8, 'raster-contrast': 0.15 } : {} }); });
          return { version: 8, glyphs: GLYPHS, sources, layers };
        })(),
      });
      map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.on('load', () => {
        map.addSource('flood', { type: 'geojson', data: floodGeo() });
        map.addLayer({ id: 'flood', type: 'fill', source: 'flood', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['get', 'o'] } });
        // Koʻchalardagi suv: yorugʻ yoyilish + chuqurlik rangidagi oʻzak + oqim yoʻnalishida harakatlanuvchi yaltirash
        map.addSource('water', { type: 'geojson', data: waterGeo() });
        const wz = (k) => ['interpolate', ['linear'], ['zoom'], 13, ['*', k * 0.35, ['+', 1, ['*', 6, ['get', 'd']]]], 17, ['*', k, ['+', 1, ['*', 6, ['get', 'd']]]]];
        map.addLayer({ id: 'water-glow', type: 'line', source: 'water', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#38bdf8', 'line-width': wz(3), 'line-blur': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 6], 'line-opacity': 0.3 } });
        map.addLayer({ id: 'water', type: 'line', source: 'water', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['interpolate', ['linear'], ['get', 'd'], 0.05, '#7dd3fc', 0.3, '#2563eb', 0.6, '#1e3a8a'], 'line-width': wz(2.4), 'line-opacity': 0.9 } });
        map.addSource('water-vol', { type: 'geojson', data: waterVolGeo() });
        // Suv yuzasi: harakatlanuvchi mavj va yaltirash teksturasi (3 xil chuqurlik rangi), haqiqiy chuqurlik balandligida
        WATER.forEach((w, i) => map.addImage(w.id, waterFrame(w, 0)));
        map.addLayer({ id: 'water-vol', type: 'fill-extrusion', source: 'water-vol', paint: { 'fill-extrusion-pattern': ['get', 'k'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.86, 'fill-extrusion-vertical-gradient': false } });
        let wt = 0;
        setInterval(() => {
          if (mode !== 'flood' || !map.getLayer('water-vol') || m3off() || document.hidden) return;
          wt++;
          WATER.forEach(w => { try { map.updateImage(w.id, waterFrame(w, wt)); } catch (e) { /* */ } });
        }, 110);
        map.addLayer({ id: 'water-flow', type: 'line', source: 'water', paint: { 'line-color': '#e0f2fe', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2], 'line-opacity': 0.75, 'line-dasharray': [0, 4, 3] } });
        // Oqim effekti: shtrixlar oqim yoʻnalishida suriladi
        const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
        let di = 0;
        setInterval(() => { if (mode === 'flood' && map.getLayer('water-flow') && !m3off()) { di = (di + 1) % DASH.length; map.setPaintProperty('water-flow', 'line-dasharray', DASH[di]); } }, 90);
        map.on('moveend', () => { if (data.onView && map.getZoom() >= 14.3) { const b = map.getBounds(); data.onView({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }); } });
        // Koʻchalar nuri (faqat “Raqamli egizak” fonida)
        map.addSource('roads', { type: 'geojson', data: roadsGeo() });
        map.addLayer({ id: 'roads-glow', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: base === 'twin' ? 'visible' : 'none' }, paint: { 'line-color': '#38bdf8', 'line-opacity': 0.25, 'line-blur': 4, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['*', 2, ['get', 'w']], 17, ['*', 8, ['get', 'w']]] } });
        map.addLayer({ id: 'roads-core', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: base === 'twin' ? 'visible' : 'none' }, paint: { 'line-color': '#7dd3fc', 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['*', 0.4, ['get', 'w']], 17, ['*', 1.6, ['get', 'w']]] } });
        map.addSource('bld', { type: 'geojson', data: buildingsGeo() });
        // Binolar: vertikal gradient (pastda qoraroq) + yorugʻlik; balandlik zoom bilan silliq oʻsadi
        map.addLayer({ id: 'bld', type: 'fill-extrusion', source: 'bld', paint: { 'fill-extrusion-color': colorExpr(), 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, HX()], 'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true } });
        // Tomlar — derazali devorlar ustida balandlik rangidagi yupqa qatlam
        map.addLayer({ id: 'bld-roof', type: 'fill-extrusion', source: 'bld', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': ['case', ['==', ['get', 'lm'], 1], '#fde68a', H_TWIN], 'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, HX()], 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, ['+', HX(), 0.6]], 'fill-extrusion-opacity': 0.92 } });
        // Bino konturlari yerda yupqa nur — “gologramma” koʻrinishi (yaqinlashganda)
        map.addLayer({ id: 'bld-foot', type: 'line', source: 'bld', minzoom: 15, paint: { 'line-color': base === 'twin' ? ['case', ['==', ['get', 'lm'], 1], '#fde68a', '#22d3ee'] : '#3f3428', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16.5, 0.35], 'line-width': 1, 'line-blur': 0.6 } });
        addWindows(); applyWindows();
        applySun(); setInterval(applySun, 5 * 60000);
        sky();
        landmarks();
        controls(el); applyHeight();
        ['dragstart', 'wheel', 'touchstart'].forEach(ev => map.on(ev, () => { if (tourOn) tourStop(); }));
        map.addSource('plan', { type: 'geojson', data: planGeo() });
        map.addLayer({ id: 'shadow', type: 'fill', source: 'plan', filter: ['==', ['get', 'kind'], 'shadow'], paint: { 'fill-color': '#0f172a', 'fill-opacity': 0.25 } });
        map.addLayer({ id: 'plan', type: 'fill-extrusion', source: 'plan', filter: ['==', ['get', 'kind'], 'plan'], paint: { 'fill-extrusion-color': '#a855f7', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.92 } });
        map.addSource('hz', { type: 'geojson', data: hzGeo() });
        map.addLayer({ id: 'hz-zone', type: 'fill', source: 'hz', filter: ['==', ['get', 't'], 'zone'], paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['get', 'o'], 'fill-antialias': false } });
        map.addLayer({ id: 'hz-route-case', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'route'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 11], 'line-opacity': 0.9 } });
        map.addLayer({ id: 'hz-route', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'route'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 17, 7] } });
        // Yoʻl ustida oqim (oq shtrixlar harakatlanadi)
        map.addLayer({ id: 'hz-flow', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'route'], paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 17, 3], 'line-opacity': 0.9, 'line-dasharray': [0, 4, 3] } });
        let hi = 0;
        const HD = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
        setInterval(() => { if (data.hz && map.getLayer('hz-flow') && !m3off()) { hi = (hi + 1) % HD.length; map.setPaintProperty('hz-flow', 'line-dasharray', HD[hi]); } }, 80);
        map.addLayer({ id: 'hz-dot', type: 'circle', source: 'hz', filter: ['==', ['get', 't'], 'dot'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 17, 6], 'circle-color': ['get', 'col'], 'circle-stroke-color': '#fff7ed', 'circle-stroke-width': 1.5, 'circle-pitch-alignment': 'map' } });
        map.addLayer({ id: 'hz-seg-glow', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'seg'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['*', 7, ['get', 'w']], 17, ['*', 18, ['get', 'w']]], 'line-opacity': 0.35, 'line-blur': 4 } });
        map.addLayer({ id: 'hz-seg', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'seg'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['*', 2.5, ['get', 'w']], 17, ['*', 7, ['get', 'w']]], 'line-opacity': 0.95 } });
        map.addLayer({ id: 'hz-blocked', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'blocked'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ef4444', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 17, 7], 'line-opacity': 0.9, 'line-blur': 1 } });
        // Odamlar oqimi — yoʻllar boʻylab harakatlanuvchi nuqtalar (3D da yerga yopishgan)
        map.addSource('hz-dots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'hz-dots-glow', type: 'circle', source: 'hz-dots', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 9], 'circle-color': ['get', 'col'], 'circle-opacity': 0.35, 'circle-blur': 1, 'circle-pitch-alignment': 'map' } });
        map.addLayer({ id: 'hz-dots', type: 'circle', source: 'hz-dots', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 4], 'circle-color': '#ffffff', 'circle-pitch-alignment': 'map' } });
        setInterval(dotsTick, 70);
        // Qutqaruv mashinalari yoʻli: qalin rangli chiziq + oq shtrix (yoʻl chizigʻi kabi)
        map.addLayer({ id: 'hz-rescue', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'rescue'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 11], 'line-opacity': 0.95 } });
        map.addLayer({ id: 'hz-rescue-dash', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'rescue'], paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 17, 3], 'line-dasharray': [2, 2] } });
        // Yoʻnalish oʻqlari: piyoda yoʻllarida oq-yashil, mashina yoʻllarida oq-qizil
        map.addImage('arr-walk', arrowImage('#16a34a')); map.addImage('arr-car', arrowImage('#e11d48')); map.addImage('arr-fire', arrowImage('#ea580c'));
        map.addLayer({ id: 'hz-arrows', type: 'symbol', source: 'hz', filter: ['match', ['get', 't'], ['route', 'rescue'], true, false], layout: { 'symbol-placement': 'line', 'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 12, 60, 17, 110], 'icon-image': ['case', ['==', ['get', 't'], 'rescue'], ['case', ['==', ['get', 'col'], '#f97316'], 'arr-fire', 'arr-car'], 'arr-walk'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.45, 17, 0.8], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
        map.addLayer({ id: 'hz-rstart', type: 'circle', source: 'hz', filter: ['==', ['get', 't'], 'rstart'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 9], 'circle-color': '#020617', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3, 'circle-pitch-alignment': 'map' } });
        map.addLayer({ id: 'hz-rend', type: 'circle', source: 'hz', filter: ['==', ['get', 't'], 'rend'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 17, 13], 'circle-color': ['get', 'col'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3, 'circle-pitch-alignment': 'map' } });
        map.addLayer({ id: 'hz-alt', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'alt'], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 5], 'line-dasharray': [2, 1.5] } });
        hzMarkers();
        addVector();
        map.on('click', 'bld', e => {
          const id = e.features[0].properties.id, b = data.buildings.find(x => x.id === id);
          if (!b) return;
          const kwh = data.ghi ? NX.twin.roofKwh(b, data.ghi.kwh) : null;
          new window.maplibregl.Popup({ maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<div class="ppop"><b>🏢 ${NX.esc(b.name || KIND[b.kind] || 'Bino')}</b><div>${b.lmH ? `~${Math.round(b.height)} m — ${NX.esc(b.lmH)} <small class="muted">(ochiq manbalar, taxminiy)</small>` : `${b.levels} qavat${b.est ? ' <small class="muted">(qavati nomaʼlum — oʻlchamiga qarab)</small>' : ''} · ~${Math.round(b.height)} m`}</div><div>Bino osti: ${NX.fmt.int(b.area)} m²</div><div class="small muted">${b.ml ? 'Manba: sunʼiy yoʻldosh surati (Microsoft ML Buildings)' : 'Manba: OpenStreetMap'}</div>${kwh != null ? `<div>☀️ Tom quyosh salohiyati: ~${NX.fmt.int(kwh)} kVt·soat/yil</div>` : ''}</div>`).addTo(map);
        });
        map.on('mouseenter', 'bld', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'bld', () => { map.getCanvas().style.cursor = ''; });
        resolve(map);
        // Birinchi ochilishda — shahar ustidan sekin aylanib koʻrsatish
        mapReady = true;
        if (pendingFit) { const p = pendingFit; pendingFit = null; setTimeout(() => fitTo(p), 50); }
        else if (!data.hz) map.easeTo({ bearing: 25, pitch: 64, zoom: 17.2, duration: 7000, easing: t => t * (2 - t) });
      });
      map.on('error', e => console.warn('3D xarita:', e && e.error && e.error.message));
    });
    return ready;
  }
  const KIND = { house: 'Uy', apartments: 'Koʻp qavatli uy', school: 'Maktab', kindergarten: 'Bogʻcha', hospital: 'Shifoxona', mosque: 'Masjid', commercial: 'Savdo binosi', retail: 'Doʻkon', office: 'Ofis', university: 'Universitet', government: 'Davlat idorasi' };

  // Osmon va ufq tumani — qiyalab qaralganda shahar chiroyli “ufqqa” cho‘ziladi
  // ---------- Yomgʻir: tomchilar, bulutli osmon, kuchli jalada chaqmoq (faqat suv rejimida, yomgʻir yogʻayotgan paytda) ----------
  let rainCv = null, rainG = null, drops = [], rainRaf = 0, flashAt = 0, flash = -1e9, rainOn = false;
  function rainLoop() {
    rainRaf = 0;
    const mm = mode === 'flood' ? (data.rainMm || 0) : 0, host = document.getElementById('map3d');
    if (!rainCv || !mm || !host || host.hidden) { if (rainCv) rainG.clearRect(0, 0, rainCv.width, rainCv.height); if (rainOn) { rainOn = false; sky(); } return; }
    if (!rainOn) { rainOn = true; sky(); }
    const W = host.clientWidth, H = host.clientHeight;
    if (rainCv.width !== W || rainCv.height !== H) { rainCv.width = W; rainCv.height = H; }
    const n = Math.min(isLite() ? 250 : 1100, Math.round(mm * (isLite() ? 4 : 14)));
    while (drops.length < n) drops.push({ x: Math.random() * W, y: Math.random() * H, v: 900 + Math.random() * 500, l: 10 + Math.random() * 16 });
    drops.length = n;
    rainG.clearRect(0, 0, W, H);
    rainG.strokeStyle = 'rgba(210,225,245,0.38)'; rainG.lineWidth = 1.1; rainG.beginPath();
    drops.forEach(d => { d.y += d.v / 60; d.x += d.v / 60 * 0.18; if (d.y > H) { d.y = -d.l; d.x = Math.random() * W; } rainG.moveTo(d.x, d.y); rainG.lineTo(d.x - d.l * 0.18, d.y - d.l); });
    rainG.stroke();
    // Kuchli jala (≥ 40 mm/soat) — vaqti-vaqti bilan chaqmoq
    const now = performance.now();
    if (mm >= 40 && now > flashAt) { flashAt = now + 6000 + Math.random() * 8000; flash = now; }
    if (now - flash < 140) { rainG.fillStyle = `rgba(235,240,255,${0.4 * (1 - (now - flash) / 140)})`; rainG.fillRect(0, 0, W, H); }
    rainRaf = requestAnimationFrame(rainLoop);
  }
  function rainStart() {
    const host = document.getElementById('map3d');
    if (!rainCv && host) { rainCv = document.createElement('canvas'); rainCv.className = 'rain-layer'; rainCv.setAttribute('aria-hidden', 'true'); host.appendChild(rainCv); rainG = rainCv.getContext('2d'); }
    if (!rainRaf) rainRaf = requestAnimationFrame(rainLoop);
  }
  function sky() {
    if (!map || !map.setSky) return;
    try {
      // Yomgʻir paytida — qorongʻi bulutli osmon va qalin tuman
      if (rainOn) { map.setSky({ 'sky-color': '#3b4656', 'horizon-color': '#6b7787', 'fog-color': '#5b6573', 'sky-horizon-blend': 0.8, 'horizon-fog-blend': 0.9, 'fog-ground-blend': 0.55 }); return; }
      map.setSky(base === 'twin' ? { 'sky-color': '#020617', 'horizon-color': '#0e7490', 'fog-color': '#06142a', 'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.35 }
        : { 'sky-color': '#7cb4e6', 'horizon-color': '#e8f0f8', 'fog-color': '#eef3f8', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.9 });
    } catch (e) { /* eski versiya */ }
  }
  let bldKey = '';
  function refresh() {
    if (!map || !map.getSource('bld')) return;
    const g = buildingsGeo();
    if (g !== bldKey) { bldKey = g; stateKey = ''; map.getSource('bld').setData(g); }
    map.setPaintProperty('bld', 'fill-extrusion-color', colorExpr());
    applyWindows();
    applyStates();
    const rk = (data.roads || []).length + ':' + base;
    if (map.getSource('roads') && rk !== roadsKey) { roadsKey = rk; map.getSource('roads').setData(base === 'twin' ? roadsGeo() : { type: 'FeatureCollection', features: [] }); }
    map.getSource('flood').setData(floodGeo());
    if (map.getSource('water')) map.getSource('water').setData(waterGeo());
    if (map.getSource('water-vol')) map.getSource('water-vol').setData(waterVolGeo());
    if (mode === 'flood' && data.rainMm) rainStart();
    if (controls.legVis) controls.legVis();
    // Obidalarning batafsil 3D modellari (bir marta, binolar va obida belgilari tayyor boʻlganda)
    if (!refresh.lm && NX.lm3d && mapReady && data.buildings.some(b => b.lmK)) { refresh.lm = true; NX.lm3d.attach(map, data.buildings).catch(e => { refresh.lm = false; console.warn('obidalar 3D:', e.message); }); }
    // Realistik bino modellari (har bir bino: kontur, balandlik, derazalar, tom) — “Balandlik” rejimida, yaqin masshtabda
    if (!refresh.c3 && NX.city3d && NX.lm3d && mapReady && data.buildings.length) { refresh.c3 = true; NX.city3d.attach(map, () => data.buildings, () => mode, () => data.roads).catch(e => { refresh.c3 = false; console.warn('city3d:', e.message); }); }
    else if (refresh.c3 && NX.city3d) NX.city3d.update();
    // Suv rejimida koʻchalar nuri oʻchadi (suv bilan chalkashmasin)
    ['roads-glow', 'roads-core'].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', base === 'twin' && mode !== 'flood' ? 'visible' : 'none'));
    map.getSource('plan').setData(planGeo());
    if (map.getSource('hz')) map.getSource('hz').setData(hzGeo());
  }
  async function show(el, d) {
    Object.assign(data, d || {});
    await init(el);
    map.resize();
    refresh();
  }
  function setMode(m) { mode = m; refresh(); }
  // Yer qimirlashi: kamera 2.5 s davomida titraydi, soʻng joyiga qaytadi
  function shake() {
    if (!map) return;
    const c0 = map.getCenter(), b0 = map.getBearing(), t0 = performance.now();
    const step = () => { const t = (performance.now() - t0) / 2500; if (t >= 1) { map.jumpTo({ center: c0, bearing: b0 }); return; } const a = (1 - t) * 0.00025; map.jumpTo({ center: [c0.lng + a * Math.sin(t * 90), c0.lat + a * Math.cos(t * 73)], bearing: b0 + (1 - t) * 1.2 * Math.sin(t * 60) }); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  // Oqim nuqtalari: har yoʻl uchun metrda kumulyativ uzunlik; har kadrda nuqtalar yoʻl boʻylab siljiydi
  let dotRoutes = [], dotT0 = performance.now();
  function prepDots() {
    dotRoutes = (data.hz || []).filter(a => a.kind === 'line' && a.path && a.path.length > 1 && (!a.style || a.style === 'rescue') && !a.dash).map(a => {
      const p = a.path, cum = [0];
      for (let i = 1; i < p.length; i++) { const k = 111320 * Math.cos(p[i][0] * Math.PI / 180); cum.push(cum[i - 1] + Math.hypot((p[i][1] - p[i - 1][1]) * k, (p[i][0] - p[i - 1][0]) * 111320)); }
      return { p, cum, L: cum[cum.length - 1], n: Math.max(5, Math.min(24, Math.round((a.ppl || 300) / 150))), col: a.color || '#22c55e' };
    }).filter(r => r.L > 20);
    // Koʻp yoʻl (butun shahar) — jami ~1500 nuqta
    const per = Math.max(2, Math.floor(1500 / Math.max(1, dotRoutes.length)));
    dotRoutes.forEach(r => { r.n = Math.min(r.n, per); });
    dotT0 = performance.now();
  }
  function dotsTick() {
    if (!map || !map.getSource('hz-dots') || document.hidden) return;
    const host = document.getElementById('map3d');
    if (!host || m3off()) return;
    if (!dotRoutes.length) { if (dotsTick.had) { map.getSource('hz-dots').setData({ type: 'FeatureCollection', features: [] }); dotsTick.had = false; } return; }
    const T = (performance.now() - dotT0) / 1000, f = [];
    dotRoutes.forEach(r => {
      for (let k = 0; k < r.n; k++) {
        const d = (T * 14 + (k / r.n) * r.L) % r.L;     // ~14 m/s — koʻrinishi uchun tezlashtirilgan
        let i = 1; while (i < r.cum.length && r.cum[i] < d) i++;
        const a = r.p[i - 1], b = r.p[Math.min(i, r.p.length - 1)], s = (r.cum[i] - r.cum[i - 1]) || 1, t = Math.min(1, (d - r.cum[i - 1]) / s);
        f.push({ type: 'Feature', properties: { col: r.col }, geometry: { type: 'Point', coordinates: [a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t] } });
      }
    });
    map.getSource('hz-dots').setData({ type: 'FeatureCollection', features: f });
    dotsTick.had = true;
  }
  function setHazard(list) {
    data.hz = list && list.length ? list : null; refresh(); hzMarkers(); prepDots(); if (landmarks.vis) landmarks.vis(); if (data.hz && tourOn) tourStop();
    // Yoʻllar koʻrsatilganda binolar shaffofroq — yoʻl va oqim binolar ortida yoʻqolmasin
    const routes = data.hz && data.hz.some(a => a.kind === 'line' && (!a.style || a.style === 'seg'));
    if (map && map.getLayer('bld')) map.setPaintProperty('bld', 'fill-extrusion-opacity', routes ? 0.5 : 0.92);
  }
  // Hamma belgilar koʻrinadigan qilib
  // Natijaga uchish; 3D hali ochilmagan boʻlsa — ochilganda uchadi (kirish animatsiyasi bekor qilinadi)
  let pendingFit = null, mapReady = false;
  function fitTo(pts) {
    if (!pts || !pts.length) return;
    if (!map || !mapReady) { pendingFit = pts; return; }
    let s = 90, w = 180, n = -90, e = -180; pts.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
    map.stop();
    const W = map.getContainer().clientWidth, pad = W > 700 ? { top: 70, left: 60, bottom: 90, right: Math.min(360, W * 0.38) } : 50;   // oʻngda legenda — natija uning ostida qolmasin
    try { map.fitBounds([[w, s], [e, n]], { padding: pad, pitch: 50, bearing: map.getBearing(), duration: 1200, maxZoom: 16 }); }
    catch (err) { try { map.fitBounds([[w, s], [e, n]], { padding: 70, duration: 1200, maxZoom: 16 }); } catch (e2) { /* */ } }
  }
  function setBase(k) {
    if (!BASE[k]) return;
    base = k; try { localStorage.setItem('m3d:base', k); } catch (e) { /* */ }
    if (!map) return;
    applyBase();
    ['roads-glow', 'roads-core'].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', k === 'twin' ? 'visible' : 'none'));
    // Bino konturlari: egizakda nur, sunʼiy yoʻldosh/xaritada — toʻq chiziq (uylar bir-biridan ajralib koʻrinadi)
    if (map.getLayer('bld-foot')) map.setPaintProperty('bld-foot', 'line-color', k === 'twin' ? ['case', ['==', ['get', 'lm'], 1], '#fde68a', '#22d3ee'] : '#3f3428');
    sky(); refresh();
  }
  function flyTo(lat, lon, z) { if (map) map.flyTo({ center: [lon, lat], zoom: z || 17, pitch: 60, duration: 900 }); }

  // Hozirgi 3D koʻrinish rasmi (AI rasm uchun asos) — kichraytirilgan PNG
  function snapshot(maxW) {
    if (!map) return null;
    try {
      const src = map.getCanvas(), k = Math.min(1, (maxW || 640) / src.width), c = document.createElement('canvas');
      c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      // Jonli qatlam (evakuatsiya yoʻllari, oqim) ham rasmga tushadi — AI rasm shu asosda chiziladi
      const fx = NX.fx && NX.fx.active() && NX.fx.canvas();
      if (fx && fx.width) c.getContext('2d').drawImage(fx, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  }
  // ---------- 📏 Oʻlchash: xaritada nuqtalarni bosib masofa (koʻcha eni, uy uzunligi, ariqgacha) ----------
  let meas = null;
  function measure() {
    if (!map) return;
    if (meas) { measureStop(); return; }
    const src = { type: 'FeatureCollection', features: [] };
    if (!map.getSource('meas')) { map.addSource('meas', { type: 'geojson', data: src }); map.addLayer({ id: 'meas-line', type: 'line', source: 'meas', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#fde047', 'line-width': 3, 'line-dasharray': [2, 1] } }); map.addLayer({ id: 'meas-pt', type: 'circle', source: 'meas', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#fde047', 'circle-stroke-color': '#111827', 'circle-stroke-width': 2 } }); }
    const pts = [], host = map.getContainer(), bar = document.createElement('div'); bar.className = 'draw3d-bar meas-bar';
    bar.innerHTML = '<span>📏 Nuqtalarni bosing — masofa: <b class="meas-v">0 m</b></span><button type="button" data-d="undo">↶</button><button type="button" data-d="x">✕</button>';
    host.appendChild(bar);
    const dist = (a, b) => Math.hypot((b[0] - a[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (b[1] - a[1]) * 110574);
    const upd = () => {
      let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
      const seg = pts.length > 1 ? dist(pts[pts.length - 2], pts[pts.length - 1]) : 0;
      bar.querySelector('.meas-v').textContent = pts.length > 2 ? `${L.toFixed(2)} m (oxirgi ${seg.toFixed(2)} m)` : `${L.toFixed(2)} m`;
      map.getSource('meas').setData({ type: 'FeatureCollection', features: pts.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p } })).concat(pts.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: pts } }] : []) });
    };
    const click = e => { pts.push([e.lngLat.lng, e.lngLat.lat]); upd(); };
    bar.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; if (b.dataset.d === 'undo') { pts.pop(); upd(); } else measureStop(); });
    map.on('click', click); map.getCanvas().style.cursor = 'crosshair';
    meas = { bar, click };
  }
  function measureStop() { if (!meas) return; map.off('click', meas.click); meas.bar.remove(); map.getCanvas().style.cursor = ''; if (map.getSource('meas')) map.getSource('meas').setData({ type: 'FeatureCollection', features: [] }); meas = null; }
  NX.map3d = { measure, measuring: () => !!meas, setOverlay, drawPoly, drawStop, showArea, tour, touring: () => tourOn, sun: () => sunNow, show, snapshot, setMode, setHazard, shake, fitTo, base: () => base, raining: () => rainOn, setBase, flyTo, mode: () => mode, map: () => map, refresh, set: d => { Object.assign(data, d); refresh(); } };

  // ---------- Fotoreal 3D (Cesium, js/ui/google3d.js) — 3D egizakning asosiy koʻrinishi (token boʻlsa) ----------
  // Barcha natijalar ikkala koʻrinishga beriladi: fotoreal ochiq boʻlsa — u yerda, “🧊 Sxema” da — MapLibre’da.
  const M3 = NX.map3d, G3 = () => NX.g3d, on3 = () => G3() && G3().active();
  ['setHazard', 'setOverlay', 'showArea', 'setMode'].forEach(k => { const f = M3[k]; M3[k] = function () { const r = f.apply(null, arguments); if (G3() && G3()[k]) G3()[k].apply(null, arguments); return r; }; });
  const set0 = M3.set; M3.set = d => { set0(d); if (G3()) G3().set(d); };
  ['fitTo', 'flyTo'].forEach(k => { const f = M3[k]; M3[k] = function () { if (on3()) G3()[k].apply(null, arguments); return f.apply(null, arguments); }; });
  const draw0 = M3.drawPoly; M3.drawPoly = done => (on3() ? G3().drawPoly(done) : draw0(done));
  const show0 = M3.show; M3.show = async (el, d) => { const r = await show0(el, d); if (G3()) { G3().set(data); G3().autoEmbed(el); } return r; };
})();
