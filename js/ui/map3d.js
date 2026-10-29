/* City Jam — 3D shahar (MapLibre GL): binolar balandligi bilan, quyosh salohiyati, suv toshqini xavfi, yangi bino va uning soyasi. */
(function () {
  'use strict';
  const NX = window.NX;
  let map = null, ready = null, mode = 'height', data = { buildings: [], ghi: null, flood: null, plan: null, scen: null, onView: null };
  const BASE = {
    sat: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Surat: Esri, Maxar, Earthstar Geographics' },
    street: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'], attribution: '© Esri, OpenStreetMap hissadorlari' },
  };

  const colorHeight = lv => (lv >= 9 ? '#7c3aed' : lv >= 5 ? '#2563eb' : lv >= 3 ? '#0ea5e9' : lv >= 2 ? '#94a3b8' : '#cbd5e1');
  const colorSolar = kwh => (kwh >= 50000 ? '#b45309' : kwh >= 20000 ? '#f59e0b' : kwh >= 8000 ? '#fcd34d' : kwh >= 3000 ? '#fde68a' : '#e5e7eb');

  // Suv ostidagi kataklar (stsenariy boʻlsa — undan, boʻlmasa doimiy xavf xaritasidan)
  let wetSet = null;
  const cellKey = ll => { const [x, y] = NX.geo.xy(ll[0], ll[1]); return Math.round(x / 60) + ':' + Math.round(y / 60); };
  const wetCells = () => (data.scen ? data.scen.cells : data.flood ? data.flood.hot : []);
  function buildingsGeo() {
    const ghi = data.ghi && data.ghi.kwh;
    const street = data.scen && data.scen.mode === 'street';
    wetSet = mode === 'flood' && !street ? new Set(wetCells().map(c => cellKey([c.lat, c.lon]))) : null;
    return { type: 'FeatureCollection', features: data.buildings.map(b => {
      const kwh = ghi ? NX.twin.roofKwh(b, ghi) : 0;
      let col = colorHeight(b.levels);
      if (mode === 'solar') col = colorSolar(kwh);
      if (mode === 'flood') col = street ? (data.scen.wetIds.has(b.id) ? '#60a5fa' : '#e2e8f0') : wetSet && wetSet.has(cellKey(b.c)) ? '#1d4ed8' : '#e2e8f0';
      if (mode === 'plan' && data.plan && data.plan.shaded.includes(b)) col = '#475569';
      if (mode === 'quake') col = /school|kindergarten|hospital|clinic/.test(b.kind) ? '#dc2626' : b.levels >= 5 ? '#f97316' : b.levels >= 3 ? '#fbbf24' : '#cbd5e1';
      return { type: 'Feature', properties: { h: b.height, col, id: b.id, kwh }, geometry: { type: 'Polygon', coordinates: [b.ring] } };
    }) };
  }
  // Suv chuqurligi rangi: <30 sm och, 30–60 sm, >60 sm toʻq koʻk
  const depthCol = d => (d >= 0.6 ? '#1e3a8a' : d >= 0.3 ? '#2563eb' : '#60a5fa');
  // Koʻchalardagi suv — chiziqlar (oqim yoʻnalishida), chuqurlik: d (m)
  function waterGeo() {
    if (mode !== 'flood' || !data.scen || data.scen.mode !== 'street') return { type: 'FeatureCollection', features: [] };
    return { type: 'FeatureCollection', features: data.scen.segs.map(s => ({ type: 'Feature', properties: { d: s.d, w: s.w }, geometry: { type: 'LineString', coordinates: s.c } })) };
  }
  function floodGeo() {
    if (mode !== 'flood' || !(data.scen || data.flood) || (data.scen && data.scen.mode === 'street')) return { type: 'FeatureCollection', features: [] };
    const step = (data.scen || data.flood).step;
    return { type: 'FeatureCollection', features: wetCells().map(c => ({ type: 'Feature', properties: { c: data.scen ? depthCol(c.depth) : '#3b82f6', o: data.scen ? 0.65 : 0.25 + 0.4 * (c.risk || 0) }, geometry: { type: 'Polygon', coordinates: [NX.twin.cellPoly(c, step)] } })) };
  }
  function planGeo() {
    const P = data.plan, f = [];
    if (P && mode === 'plan') {
      P.list.filter(s => s.ring && s.label.startsWith('Qish')).forEach(s => f.push({ type: 'Feature', properties: { kind: 'shadow', h: 0 }, geometry: { type: 'Polygon', coordinates: [s.ring] } }));
      f.push({ type: 'Feature', properties: { kind: 'plan', h: P.planned.height }, geometry: { type: 'Polygon', coordinates: [P.planned.ring] } });
    }
    return { type: 'FeatureCollection', features: f };
  }

  function init(el) {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      if (!window.maplibregl) return reject(new Error('3D kutubxonasi yuklanmadi.'));
      const c = NX.config.center;
      map = new window.maplibregl.Map({
        container: el, center: [c[1], c[0]], zoom: 15.6, pitch: 58, bearing: -20, maxPitch: 80, attributionControl: true,
        style: { version: 8, sources: { base: Object.assign({ type: 'raster', tileSize: 256, maxzoom: 19 }, BASE.sat) }, layers: [{ id: 'base', type: 'raster', source: 'base' }] },
      });
      map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.on('load', () => {
        map.addSource('flood', { type: 'geojson', data: floodGeo() });
        map.addLayer({ id: 'flood', type: 'fill', source: 'flood', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['get', 'o'] } });
        // Koʻchalardagi suv: yorugʻ yoyilish + chuqurlik rangidagi oʻzak + oqim yoʻnalishida harakatlanuvchi yaltirash
        map.addSource('water', { type: 'geojson', data: waterGeo() });
        const wz = (k) => ['interpolate', ['linear'], ['zoom'], 13, ['*', k * 0.35, ['+', 1, ['*', 6, ['get', 'd']]]], 17, ['*', k, ['+', 1, ['*', 6, ['get', 'd']]]]];
        map.addLayer({ id: 'water-glow', type: 'line', source: 'water', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#38bdf8', 'line-width': wz(5), 'line-blur': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 8], 'line-opacity': 0.45 } });
        map.addLayer({ id: 'water', type: 'line', source: 'water', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['interpolate', ['linear'], ['get', 'd'], 0.05, '#7dd3fc', 0.3, '#2563eb', 0.6, '#1e3a8a'], 'line-width': wz(2.4), 'line-opacity': 0.9 } });
        map.addLayer({ id: 'water-flow', type: 'line', source: 'water', paint: { 'line-color': '#e0f2fe', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2], 'line-opacity': 0.75, 'line-dasharray': [0, 4, 3] } });
        // Oqim effekti: shtrixlar oqim yoʻnalishida suriladi
        const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
        let di = 0;
        setInterval(() => { if (mode === 'flood' && map.getLayer('water-flow') && !document.getElementById('map3d').hidden) { di = (di + 1) % DASH.length; map.setPaintProperty('water-flow', 'line-dasharray', DASH[di]); } }, 90);
        map.on('moveend', () => { if (data.onView && map.getZoom() >= 14.3) { const b = map.getBounds(); data.onView({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }); } });
        map.addSource('bld', { type: 'geojson', data: buildingsGeo() });
        map.addLayer({ id: 'bld', type: 'fill-extrusion', source: 'bld', paint: { 'fill-extrusion-color': ['get', 'col'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.88 } });
        map.addSource('plan', { type: 'geojson', data: planGeo() });
        map.addLayer({ id: 'shadow', type: 'fill', source: 'plan', filter: ['==', ['get', 'kind'], 'shadow'], paint: { 'fill-color': '#0f172a', 'fill-opacity': 0.25 } });
        map.addLayer({ id: 'plan', type: 'fill-extrusion', source: 'plan', filter: ['==', ['get', 'kind'], 'plan'], paint: { 'fill-extrusion-color': '#a855f7', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.92 } });
        map.on('click', 'bld', e => {
          const id = e.features[0].properties.id, b = data.buildings.find(x => x.id === id);
          if (!b) return;
          const kwh = data.ghi ? NX.twin.roofKwh(b, data.ghi.kwh) : null;
          new window.maplibregl.Popup({ maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<div class="ppop"><b>🏢 ${NX.esc(b.name || KIND[b.kind] || 'Bino')}</b><div>${b.levels} qavat${b.est ? ' <small class="muted">(OSM’da yoʻq — oʻrtacha)</small>' : ''} · ~${Math.round(b.height)} m</div><div>Bino osti: ${NX.fmt.int(b.area)} m²</div>${kwh != null ? `<div>☀️ Tom quyosh salohiyati: ~${NX.fmt.int(kwh)} kVt·soat/yil</div>` : ''}</div>`).addTo(map);
        });
        map.on('mouseenter', 'bld', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'bld', () => { map.getCanvas().style.cursor = ''; });
        resolve(map);
      });
      map.on('error', e => console.warn('3D xarita:', e && e.error && e.error.message));
    });
    return ready;
  }
  const KIND = { house: 'Uy', apartments: 'Koʻp qavatli uy', school: 'Maktab', kindergarten: 'Bogʻcha', hospital: 'Shifoxona', mosque: 'Masjid', commercial: 'Savdo binosi', retail: 'Doʻkon', office: 'Ofis', university: 'Universitet', government: 'Davlat idorasi' };

  function refresh() {
    if (!map || !map.getSource('bld')) return;
    map.getSource('bld').setData(buildingsGeo());
    map.getSource('flood').setData(floodGeo());
    if (map.getSource('water')) map.getSource('water').setData(waterGeo());
    map.getSource('plan').setData(planGeo());
  }
  async function show(el, d) {
    Object.assign(data, d || {});
    await init(el);
    map.resize();
    refresh();
  }
  function setMode(m) { mode = m; refresh(); }
  function setBase(k) { if (!map) return; const src = map.getSource('base'); if (src && src.setTiles) src.setTiles(BASE[k].tiles); }
  function flyTo(lat, lon, z) { if (map) map.flyTo({ center: [lon, lat], zoom: z || 17, pitch: 60, duration: 900 }); }

  NX.map3d = { show, setMode, setBase, flyTo, mode: () => mode, map: () => map, refresh, set: d => { Object.assign(data, d); refresh(); } };
})();
