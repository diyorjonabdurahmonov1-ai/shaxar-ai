/* City Jam — 3D shahar (MapLibre GL): binolar balandligi bilan, quyosh salohiyati, suv toshqini xavfi, yangi bino va uning soyasi. */
(function () {
  'use strict';
  const NX = window.NX;
  let map = null, ready = null, mode = 'height', data = { buildings: [], ghi: null, flood: null, plan: null };
  const BASE = {
    sat: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Surat: Esri, Maxar, Earthstar Geographics' },
    street: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'], attribution: '© Esri, OpenStreetMap hissadorlari' },
  };

  const colorHeight = lv => (lv >= 9 ? '#7c3aed' : lv >= 5 ? '#2563eb' : lv >= 3 ? '#0ea5e9' : lv >= 2 ? '#94a3b8' : '#cbd5e1');
  const colorSolar = kwh => (kwh >= 50000 ? '#b45309' : kwh >= 20000 ? '#f59e0b' : kwh >= 8000 ? '#fcd34d' : kwh >= 3000 ? '#fde68a' : '#e5e7eb');

  function buildingsGeo() {
    const fl = data.flood, ghi = data.ghi && data.ghi.kwh, G = NX.geo;
    const risky = fl ? fl.hot.map(c => G.xy(c.lat, c.lon)) : [];
    return { type: 'FeatureCollection', features: data.buildings.map(b => {
      const kwh = ghi ? NX.twin.roofKwh(b, ghi) : 0;
      let col = colorHeight(b.levels);
      if (mode === 'solar') col = colorSolar(kwh);
      if (mode === 'flood') { const [x, y] = G.xy(b.c[0], b.c[1]); col = risky.some(h => Math.abs(h[0] - x) <= 60 && Math.abs(h[1] - y) <= 60) ? '#1d4ed8' : '#e2e8f0'; }
      if (mode === 'plan' && data.plan && data.plan.shaded.includes(b)) col = '#475569';
      return { type: 'Feature', properties: { h: b.height, col, id: b.id, kwh }, geometry: { type: 'Polygon', coordinates: [b.ring] } };
    }) };
  }
  function floodGeo() {
    const fl = data.flood;
    if (!fl || mode !== 'flood') return { type: 'FeatureCollection', features: [] };
    return { type: 'FeatureCollection', features: fl.cells.filter(c => c.risk > 0.15).map(c => ({ type: 'Feature', properties: { r: c.risk }, geometry: { type: 'Polygon', coordinates: [NX.twin.cellPoly(c, fl.step)] } })) };
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
        map.addLayer({ id: 'flood', type: 'fill', source: 'flood', paint: { 'fill-color': '#2563eb', 'fill-opacity': ['*', 0.55, ['get', 'r']] } });
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
