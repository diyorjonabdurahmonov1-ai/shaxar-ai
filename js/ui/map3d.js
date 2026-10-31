/* City Jam — 3D shahar (MapLibre GL): binolar balandligi bilan, quyosh salohiyati, suv toshqini xavfi, yangi bino va uning soyasi. */
(function () {
  'use strict';
  const NX = window.NX;
  let map = null, ready = null, mode = 'height', data = { buildings: [], ghi: null, flood: null, plan: null, scen: null, hz: null, onView: null };
  let hzMarks = [];
  const BASE = {
    sat: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Surat: Esri, Maxar, Earthstar Geographics' },
    street: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'], attribution: '© Esri, OpenStreetMap hissadorlari' },
    // “Raqamli egizak” — qorongʻi fon, binolar balandligi boʻyicha yorugʻ, koʻchalar nur kabi
    twin: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'], attribution: 'Fon: Esri, HERE, Garmin, © OpenStreetMap', maxzoom: 16 },
  };
  let base = 'twin';
  try { base = localStorage.getItem('m3d:base') || 'twin'; } catch (e) { /* */ }
  if (!BASE[base]) base = 'twin';

  // Binolar rangi — xususiyatlar boʻyicha ifoda (xarita qayta chizilmaydi, rejim almashsa darhol)
  // Balandlik: sunʼiy yoʻldoshda — iliq qum/tosh tuslari; “Raqamli egizak”da — balandlik oshgani sari yorugʻroq zumrad-moviy (suv rangi emas)
  const H_SAT = ['interpolate', ['linear'], ['get', 'lv'], 1, '#f3ead9', 2, '#e6d5bb', 4, '#cdb594', 6, '#a8927a', 9, '#7c6f66', 14, '#5b524d'];
  const H_TWIN = ['interpolate', ['linear'], ['get', 'lv'], 1, '#1f3b4d', 2, '#24566a', 4, '#1f7f86', 6, '#22a39a', 9, '#5eead4', 14, '#ccfbf1'];
  function colorExpr() {
    const hgt = base === 'twin' ? H_TWIN : H_SAT;
    if (mode === 'solar') return ['interpolate', ['linear'], ['get', 'kwh'], 0, '#e5e7eb', 3000, '#fde68a', 8000, '#fcd34d', 20000, '#f59e0b', 50000, '#b45309'];
    if (mode === 'flood') return ['case', ['boolean', ['feature-state', 'wet'], false], '#60a5fa', base === 'twin' ? '#334155' : '#e2e8f0'];
    if (mode === 'plan') return ['case', ['boolean', ['feature-state', 'shade'], false], '#475569', hgt];
    if (mode === 'quake') return ['case', ['==', ['get', 'cr'], 1], '#dc2626', ['>=', ['get', 'lv'], 5], '#f97316', ['>=', ['get', 'lv'], 3], '#fbbf24', base === 'twin' ? '#475569' : '#cbd5e1'];
    return hgt;
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
    // Har necha soniyada bir devor turi yangilanadi — kimdir chiroq yoqadi, kimdir oʻchiradi
    let t = 0;
    setInterval(() => { if (!windowsOn() || document.hidden || document.getElementById('map3d').hidden) return; const k = Object.keys(WIN)[t++ % 3]; try { map.updateImage(k, winImage(k)); } catch (e) { /* */ } }, 2500);
  }
  function applyWindows() {
    if (!map || !map.getLayer('bld')) return;
    const on = windowsOn();
    map.setPaintProperty('bld', 'fill-extrusion-pattern', on ? ['step', ['get', 'lv'], 'w1', 3, 'w2', 7, 'w3'] : undefined);
    map.setLayoutProperty('bld-roof', 'visibility', on ? 'visible' : 'none');
  }

  const CRIT = /school|kindergarten|hospital|clinic/;
  let geoKey = '', geoCache = null;
  function buildingsGeo() {
    const ghi = data.ghi && data.ghi.kwh, lite = isLite(), key = data.buildings.length + ':' + (ghi || 0) + ':' + (data.buildings[0] && data.buildings[0].id) + ':' + lite;
    if (geoCache && key === geoKey) return geoCache;
    geoKey = key;
    geoCache = { type: 'FeatureCollection', features: (lite ? data.buildings.filter(b => b.area >= 60 || b.levels >= 3) : data.buildings).map(b => ({ type: 'Feature', id: b.id, properties: { h: b.height, lv: b.levels, id: b.id, cr: CRIT.test(b.kind) ? 1 : 0, kwh: ghi ? NX.twin.roofKwh(b, ghi) : 0 }, geometry: { type: 'Polygon', coordinates: [b.ring] } })) };
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
    if (P && mode === 'plan') {
      P.list.filter(s => s.ring && s.label.startsWith('Qish')).forEach(s => f.push({ type: 'Feature', properties: { kind: 'shadow', h: 0 }, geometry: { type: 'Polygon', coordinates: [s.ring] } }));
      f.push({ type: 'Feature', properties: { kind: 'plan', h: P.planned.height }, geometry: { type: 'Polygon', coordinates: [P.planned.ring] } });
    }
    return { type: 'FeatureCollection', features: f };
  }

  // Favqulodda vaziyat qatlami: xavf zonalari (qizil), evakuatsiya yoʻllari (yashil), yigʻilish/baland joylar (raqamli belgilar)
  function hzGeo() {
    const f = [];
    (data.hz || []).forEach(a => {
      if (a.kind === 'zone' && a.cells && a.cells.length) {
        // Haqiqiy binolar kataklari (40 m) — xavf darajasiga qarab shaffoflik
        const dLat = 20 / 111320, dLon = 20 / (111320 * Math.cos(a.lat * Math.PI / 180));
        a.cells.forEach(c => f.push({ type: 'Feature', properties: { t: 'zone', col: a.color, o: 0.25 + 0.5 * c[2] }, geometry: { type: 'Polygon', coordinates: [[[c[1] - dLon, c[0] - dLat], [c[1] + dLon, c[0] - dLat], [c[1] + dLon, c[0] + dLat], [c[1] - dLon, c[0] + dLat], [c[1] - dLon, c[0] - dLat]]] } }));
      } else if (a.kind === 'zone' && a.ring) f.push({ type: 'Feature', properties: { t: 'zone', col: a.color, o: 0.32 }, geometry: { type: 'Polygon', coordinates: [a.ring.map(p => [p[1], p[0]])] } });
      else if (a.kind === 'line' && a.paths) f.push({ type: 'Feature', properties: { t: a.style === 'blocked' ? 'blocked' : 'route', col: a.color }, geometry: { type: 'MultiLineString', coordinates: a.paths.map(p => p.map(q => [q[1], q[0]])) } });
      else if (a.kind === 'line') f.push({ type: 'Feature', properties: { t: a.dash ? 'alt' : 'route', col: a.color || '#16a34a' }, geometry: { type: 'LineString', coordinates: (a.path || [a.from, a.to]).map(p => [p[1], p[0]]) } });
    });
    return { type: 'FeatureCollection', features: f };
  }
  function hzMarkers() {
    hzMarks.forEach(m => m.remove()); hzMarks = [];
    if (!map || !window.maplibregl.Marker) return;
    (data.hz || []).forEach((a, i) => {
      if (a.dash || a.kind === 'water' || a.style === 'blocked') return;
      const el = document.createElement('div');
      el.className = 'hz-pin hz-' + a.kind; el.style.background = a.color || '#7c3aed'; el.textContent = a.id || String(i + 1); el.title = a.title;
      const m = new window.maplibregl.Marker({ element: el }).setLngLat([a.lon, a.lat]);
      if (window.maplibregl.Popup) m.setPopup(new window.maplibregl.Popup({ maxWidth: '260px' }).setHTML(`<div class="ppop"><b>${NX.esc(a.title)}</b><p>${NX.esc(a.note || '')}</p></div>`));
      m.addTo(map); hzMarks.push(m);
    });
  }

  function init(el) {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      if (!window.maplibregl) return reject(new Error('3D kutubxonasi yuklanmadi.'));
      const c = NX.config.center;
      map = new window.maplibregl.Map({
        container: el, center: [c[1], c[0]], zoom: 15.6, pitch: 58, bearing: -20, maxPitch: 80, attributionControl: true, preserveDrawingBuffer: true, canvasContextAttributes: { preserveDrawingBuffer: true },
        style: { version: 8, sources: { base: Object.assign({ type: 'raster', tileSize: 256, maxzoom: 19 }, BASE[base]) }, layers: [{ id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': base === 'sat' ? 0.15 : 0 } }] },
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
          if (mode !== 'flood' || !map.getLayer('water-vol') || document.getElementById('map3d').hidden || document.hidden) return;
          wt++;
          WATER.forEach(w => { try { map.updateImage(w.id, waterFrame(w, wt)); } catch (e) { /* */ } });
        }, 110);
        map.addLayer({ id: 'water-flow', type: 'line', source: 'water', paint: { 'line-color': '#e0f2fe', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2], 'line-opacity': 0.75, 'line-dasharray': [0, 4, 3] } });
        // Oqim effekti: shtrixlar oqim yoʻnalishida suriladi
        const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
        let di = 0;
        setInterval(() => { if (mode === 'flood' && map.getLayer('water-flow') && !document.getElementById('map3d').hidden) { di = (di + 1) % DASH.length; map.setPaintProperty('water-flow', 'line-dasharray', DASH[di]); } }, 90);
        map.on('moveend', () => { if (data.onView && map.getZoom() >= 14.3) { const b = map.getBounds(); data.onView({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }); } });
        // Koʻchalar nuri (faqat “Raqamli egizak” fonida)
        map.addSource('roads', { type: 'geojson', data: roadsGeo() });
        map.addLayer({ id: 'roads-glow', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: base === 'twin' ? 'visible' : 'none' }, paint: { 'line-color': '#38bdf8', 'line-opacity': 0.25, 'line-blur': 4, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['*', 2, ['get', 'w']], 17, ['*', 8, ['get', 'w']]] } });
        map.addLayer({ id: 'roads-core', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: base === 'twin' ? 'visible' : 'none' }, paint: { 'line-color': '#7dd3fc', 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['*', 0.4, ['get', 'w']], 17, ['*', 1.6, ['get', 'w']]] } });
        map.addSource('bld', { type: 'geojson', data: buildingsGeo() });
        // Binolar: vertikal gradient (pastda qoraroq) + yorugʻlik; balandlik zoom bilan silliq oʻsadi
        map.addLayer({ id: 'bld', type: 'fill-extrusion', source: 'bld', paint: { 'fill-extrusion-color': colorExpr(), 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, ['get', 'h']], 'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true } });
        // Tomlar — derazali devorlar ustida balandlik rangidagi yupqa qatlam
        map.addLayer({ id: 'bld-roof', type: 'fill-extrusion', source: 'bld', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': H_TWIN, 'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, ['get', 'h']], 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, ['+', ['get', 'h'], 0.6]], 'fill-extrusion-opacity': 0.92 } });
        addWindows(); applyWindows();
        try { map.setLight({ anchor: 'map', color: '#ffffff', intensity: 0.45, position: [1.3, 210, 35] }); } catch (e) { /* */ }
        sky();
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
        setInterval(() => { if (data.hz && map.getLayer('hz-flow') && !document.getElementById('map3d').hidden) { hi = (hi + 1) % HD.length; map.setPaintProperty('hz-flow', 'line-dasharray', HD[hi]); } }, 80);
        map.addLayer({ id: 'hz-blocked', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'blocked'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ef4444', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 17, 7], 'line-opacity': 0.9, 'line-blur': 1 } });
        map.addLayer({ id: 'hz-alt', type: 'line', source: 'hz', filter: ['==', ['get', 't'], 'alt'], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 5], 'line-dasharray': [2, 1.5] } });
        hzMarkers();
        map.on('click', 'bld', e => {
          const id = e.features[0].properties.id, b = data.buildings.find(x => x.id === id);
          if (!b) return;
          const kwh = data.ghi ? NX.twin.roofKwh(b, data.ghi.kwh) : null;
          new window.maplibregl.Popup({ maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<div class="ppop"><b>🏢 ${NX.esc(b.name || KIND[b.kind] || 'Bino')}</b><div>${b.levels} qavat${b.est ? ' <small class="muted">(qavati nomaʼlum — oʻlchamiga qarab)</small>' : ''} · ~${Math.round(b.height)} m</div><div>Bino osti: ${NX.fmt.int(b.area)} m²</div><div class="small muted">${b.ml ? 'Manba: sunʼiy yoʻldosh surati (Microsoft ML Buildings)' : 'Manba: OpenStreetMap'}</div>${kwh != null ? `<div>☀️ Tom quyosh salohiyati: ~${NX.fmt.int(kwh)} kVt·soat/yil</div>` : ''}</div>`).addTo(map);
        });
        map.on('mouseenter', 'bld', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'bld', () => { map.getCanvas().style.cursor = ''; });
        resolve(map);
        // Birinchi ochilishda — shahar ustidan sekin aylanib koʻrsatish
        mapReady = true;
        if (pendingFit) { const p = pendingFit; pendingFit = null; setTimeout(() => fitTo(p), 50); }
        else if (!data.hz) map.easeTo({ bearing: 25, pitch: 62, zoom: 15.9, duration: 7000, easing: t => t * (2 - t) });
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
      map.setSky(base === 'twin' ? { 'sky-color': '#020617', 'horizon-color': '#0e7490', 'fog-color': '#0b1220', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.85 }
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
  function setHazard(list) {
    data.hz = list && list.length ? list : null; refresh(); hzMarkers();
    // Yoʻllar koʻrsatilganda binolar shaffofroq — yoʻl va oqim binolar ortida yoʻqolmasin
    const routes = data.hz && data.hz.some(a => a.kind === 'line' && !a.style);
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
    try { map.fitBounds([[w, s], [e, n]], { padding: 70, pitch: 50, bearing: map.getBearing(), duration: 1200, maxZoom: 16 }); }
    catch (err) { try { map.fitBounds([[w, s], [e, n]], { padding: 70, duration: 1200, maxZoom: 16 }); } catch (e2) { /* */ } }
  }
  function setBase(k) {
    if (!BASE[k]) return;
    base = k; try { localStorage.setItem('m3d:base', k); } catch (e) { /* */ }
    if (!map) return;
    const src = map.getSource('base'); if (src && src.setTiles) src.setTiles(BASE[k].tiles);
    map.setPaintProperty('base', 'raster-saturation', k === 'sat' ? 0.15 : 0);
    ['roads-glow', 'roads-core'].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', k === 'twin' ? 'visible' : 'none'));
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
  NX.map3d = { show, snapshot, setMode, setHazard, shake, fitTo, base: () => base, raining: () => rainOn, setBase, flyTo, mode: () => mode, map: () => map, refresh, set: d => { Object.assign(data, d); refresh(); } };
})();
