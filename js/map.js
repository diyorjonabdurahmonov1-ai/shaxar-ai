/* City Jam — Leaflet xaritasi va qatlamlar */
(function () {
  'use strict';
  const NX = window.NX;
  const COL = { green: '#16a34a', amber: '#f59e0b', red: '#dc2626', grey: '#94a3b8' };
  const col = (v, a, b) => (v == null ? COL.grey : v < a ? COL.green : v < b ? COL.amber : COL.red);

  let map, M, renderer, h = {};
  const L_ = {};             // qatlam guruhlari
  let wayLines = [];         // har bir yoʻl uchun polyline
  let selected = null, selLayer = null, routeHi = null, deltaLayer = null;
  let colorMode = { mode: 'now' };
  let forcedProblems = false, hoverId = null, realTiles = null, tilesTs = null;
  const probMarkers = new Map();
  // Odatiy holatda xarita toza: faqat koʻchalar (tirbandlik rangida)
  const vis = NX.store.get('layers2', { traffic: true, routes: false, stops: false, problems: false, schools: false });
  const FRESH_MS = 45 * 60 * 1000; // TomTom oʻlchovi shu muddat “hozirgi” hisoblanadi

  function init(el, handlers) {
    h = handlers || {};
    const c = NX.config;
    map = L.map(el, { zoomControl: false, preferCanvas: true, minZoom: 13, maxZoom: 19 })
      .setView(c.center, 15);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Yaqinlashtirish', zoomOutTitle: 'Uzoqlashtirish' }).addTo(map);
    // Katta “tolerance” — koʻchani barmoq bilan bosish oson boʻlishi uchun
    renderer = L.canvas({ tolerance: 12, padding: 0.3 });
    map.setMaxBounds([[c.bbox.s - 0.03, c.bbox.w - 0.05], [c.bbox.n + 0.03, c.bbox.e + 0.05]]);
    addBasemap();
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    ['traffic', 'routes', 'stops', 'problems', 'schools'].forEach(k => (L_[k] = L.layerGroup()));
    L_.incidents = L.layerGroup().addTo(map);
    L_.hover = L.layerGroup().addTo(map);
    L_.hl = L.layerGroup().addTo(map);
    addSearch();
    addLayerControl();
    addLegend();
    // Hudud chegarasi
    L.rectangle([[c.bbox.s, c.bbox.w], [c.bbox.n, c.bbox.e]], { color: '#0f766e', weight: 1.5, dashArray: '6 6', fill: false, interactive: false }).addTo(map);
    return map;
  }

  function addBasemap() {
    const osm = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> hissadorlari',
    });
    const esri = () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Asos xarita &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap hissadorlari',
    });
    // file:// dan ochilganda OSM plitalari Referer talab qilgani uchun Esri ishlatiladi
    let layer = location.protocol === 'file:' ? esri() : osm();
    let errors = 0, switched = location.protocol === 'file:';
    layer.on('tileerror', () => {
      if (switched || ++errors < 6) return;
      switched = true; map.removeLayer(layer); layer = esri().addTo(map);
    });
    layer.addTo(map);
  }

  function addLayerControl() {
    const Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const d = L.DomUtil.create('div', 'nx-layers leaflet-bar');
        const items = [['traffic', 'Tirbandlik ranglari'], ['routes', 'Avtobus yoʻnalishlari'], ['stops', 'Bekatlar'], ['problems', 'Muammolar'], ['schools', 'Maktab va bogʻchalar']];
        d.innerHTML = `<button type="button" class="nx-layers-btn" aria-expanded="false" aria-label="Qatlamlar"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>Qatlamlar</span></button>
          <div class="nx-layers-list">${items.map(([k, t]) => `<label><input type="checkbox" data-layer="${k}" ${vis[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>`;
        L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        const btn = d.querySelector('button');
        btn.addEventListener('click', () => { const o = d.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
        d.addEventListener('change', e => { const k = e.target.dataset.layer; if (k) setVisible(k, e.target.checked); });
        return d;
      },
    });
    new Ctl().addTo(map);
  }

  // Koʻcha nomi boʻyicha qidiruv (xarita ustida)
  function addSearch() {
    const Ctl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const d = L.DomUtil.create('div', 'nx-search');
        d.innerHTML = `<input type="search" placeholder="Koʻcha qidirish…" aria-label="Koʻcha qidirish" autocomplete="off"><ul role="listbox"></ul>`;
        L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        const inp = d.querySelector('input'), ul = d.querySelector('ul');
        const pick = id => { inp.value = ''; ul.innerHTML = ''; inp.blur(); h.onStreet && h.onStreet(+id); };
        inp.addEventListener('input', () => {
          if (!M || !inp.value.trim()) { ul.innerHTML = ''; return; }
          const res = NX.analysis.searchStreets(M, inp.value).slice(0, 8);
          ul.innerHTML = res.length ? res.map(s => `<li><button type="button" data-id="${s.id}">${NX.esc(s.name)}<small>${NX.esc(NX.HW[s.hw].uz)}</small></button></li>`).join('') : '<li class="empty">Topilmadi</li>';
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = ul.querySelector('button'); if (b) pick(b.dataset.id); } if (e.key === 'Escape') { inp.value = ''; ul.innerHTML = ''; } });
        ul.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(b.dataset.id); });
        return d;
      },
    });
    new Ctl().addTo(map);
  }

  let legendEl;
  function addLegend() {
    const Ctl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd() { legendEl = L.DomUtil.create('div', 'nx-legend'); L.DomEvent.disableClickPropagation(legendEl); return legendEl; },
    });
    new Ctl().addTo(map);
    updateLegend();
  }

  function updateLegend() {
    if (!legendEl) return;
    const sw = (c, t) => `<span><i style="background:${c}"></i>${t}</span>`;
    if (deltaLayer) {
      legendEl.innerHTML = `<b>Stsenariy taʼsiri ${NX.badge('bashorat')}</b>${sw(COL.red, 'Yuklama oshadi')}${sw(COL.green, 'Yuklama kamayadi')}<small>Qalinlik — oʻzgarish hajmi</small>`;
    } else if (!vis.traffic) {
      legendEl.innerHTML = '';
    } else if (colorMode.mode === 'forecast') {
      legendEl.innerHTML = `<b>Taxmin: ${NX.days[colorMode.d]}, ${NX.fmt.hour(colorMode.h)}</b>${sw(COL.green, 'Erkin')}${sw(COL.amber, 'Sekin')}${sw(COL.red, 'Tirband')}`;
    } else if (realTiles) {
      legendEl.innerHTML = `<b>Hozirgi tirbandlik</b>${sw(COL.green, 'Erkin')}${sw(COL.amber, 'Sekin')}${sw(COL.red, 'Tirband')}<small>TomTom, real vaqt · ${tilesTs ? NX.fmt.time(tilesTs).slice(-5) : ''}</small>`;
    } else {
      legendEl.innerHTML = `<b>Tahlil xaritasi</b><small>Real tirbandlik — pastdagi “🚦 Yandex probkalar” tugmasida</small>`;
    }
    legendEl.style.display = legendEl.innerHTML ? '' : 'none';
  }

  function setVisible(k, on) {
    vis[k] = on;
    NX.store.set('layers2', vis);
    if (k === 'traffic') { restyle(); updateLegend(); return; }
    applyVis(k);
  }
  function applyVis(k) {
    const on = vis[k] || (k === 'problems' && forcedProblems);
    if (on) L_[k].addTo(map); else map.removeLayer(L_[k]);
  }
  const fresh = s => s.tomtom && Date.now() - s.tomtom.ts < FRESH_MS;

  function styleFor(w) {
    const s = M.streets[w.street], H = NX.HW[w.hw];
    if (deltaLayer) return { color: COL.grey, weight: H.w * 0.7, opacity: 0.35 };
    if (!vis.traffic) return { color: COL.grey, weight: H.w * 0.8, opacity: 0.6 };
    if (colorMode.mode === 'forecast') {
      const p = NX.forecast.predict(s, colorMode.d, colorMode.h);
      return { color: col(p.value, 15, 30), weight: H.w, opacity: p.low ? 0.65 : 0.95 };
    }
    if (realTiles) return { color: '#0f172a', weight: H.w + 2, opacity: 0.04 };
    if (fresh(s)) return { color: col(s.tomtom.congestion, 15, 30), weight: H.w + 2, opacity: 1 };
    return { color: COL.grey, weight: H.w * 0.8, opacity: 0.5 };
  }

  function setModel(model) {
    M = model;
    Object.values(L_).forEach(g => g.clearLayers());
    wayLines = M.ways.map(w => {
      const pl = L.polyline(w.ll, Object.assign({ renderer, bubblingMouseEvents: false }, styleFor(w)));
      pl.on('click', () => h.onStreet && h.onStreet(w.street));
      pl.on('mouseover', () => hover(w.street));
      pl.on('mouseout', () => hover(null));
      pl.bindTooltip(() => (M.streets[w.street].name || 'Nomsiz yoʻl') + ' — bosing', { sticky: true, direction: 'top', opacity: 0.9 });
      L_.traffic.addLayer(pl);
      return pl;
    });
    // Avtobus yoʻnalishlari
    M.routes.forEach(r => {
      r.layers = r.segsLL.map(seg => {
        const pl = L.polyline(seg, { renderer, color: r.color, weight: 2.5, opacity: 0.75, bubblingMouseEvents: false });
        pl.bindTooltip(`${NX.esc(r.modeUz)} ${NX.esc(r.label)}`, { sticky: true });
        pl.on('click', () => h.onRoute && h.onRoute(r.i));
        L_.routes.addLayer(pl);
        return pl;
      });
    });
    // Bekatlar
    M.stops.filter(s => s.inArea).forEach(s => {
      const lines = [...s.routes].map(i => M.routes[i].label);
      L.circleMarker([s.lat, s.lon], { renderer, radius: 4.5, color: '#1d4ed8', weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .bindPopup(`<b>${NX.esc(s.name || 'Bekat')}</b><br>${lines.length ? 'Liniyalar: ' + NX.esc([...new Set(lines)].join(', ')) : 'Liniya biriktirilmagan'}<br>${NX.badge('osm')}`)
        .addTo(L_.stops);
    });
    // Maktablar
    M.schools.forEach(o => {
      L.circleMarker([o.lat, o.lon], { renderer, radius: 6, color: '#6d28d9', weight: 2, fillColor: o.safe ? '#ddd6fe' : '#7c3aed', fillOpacity: 0.9 })
        .bindPopup(`<b>${o.kind === 'kindergarten' ? 'Bogʻcha' : 'Maktab'}${o.name ? ': ' + NX.esc(o.name) : ''}</b><br>${o.safe ? '150 m ichida piyoda oʻtish/svetofor bor' : '150 m ichida xavfsiz oʻtish belgilanmagan'}<br>${NX.badge('osm')} ${NX.badge('hisob')}`)
        .addTo(L_.schools);
    });
    drawProblems();
    Object.keys(vis).forEach(k => { if (k !== 'traffic') applyVis(k); });
    L_.traffic.addTo(map);
    updateLegend();
  }

  // Sichqoncha ustiga kelgan koʻcha butunligicha ajratiladi
  function hover(id) {
    if (id === hoverId) return;
    hoverId = id;
    L_.hover.clearLayers();
    if (id == null || id === selected) return;
    M.streets[id].ways.forEach(i => {
      const w = M.ways[i];
      L.polyline(w.ll, { renderer, color: '#0f172a', weight: NX.HW[w.hw].w + 6, opacity: 0.25, interactive: false }).addTo(L_.hover);
    });
  }

  function drawProblems() {
    L_.problems.clearLayers();
    probMarkers.clear();
    const cell = NX.RULES.cell;
    M.problems.forEach(p => {
      const meta = NX.PROBLEM[p.type];
      const popup = `<div class="ppop"><b>${meta.icon} ${NX.esc(meta.short)}</b><div>${NX.esc(p.title)}</div><p>${NX.esc(meta.what)}</p><p><b>Yechim:</b> ${NX.esc(meta.fix)}</p>${NX.badge(p.type === 'congestion' ? 'tomtom' : 'osm')} ${NX.badge('hisob')}</div>`;
      if (p.type === 'coverage') {
        const r = Math.sqrt((p.cluster.cells.length * cell * cell) / Math.PI);
        L.circle([p.lat, p.lon], { renderer, radius: Math.max(150, r), color: meta.color, weight: 1, dashArray: '4 4', fillOpacity: 0.08, interactive: false }).addTo(L_.problems);
      }
      const icon = L.divIcon({ className: 'pmk', html: `<span style="--c:${meta.color}">${meta.icon}</span>`, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] });
      const mk = L.marker([p.lat, p.lon], { icon, title: meta.short, riseOnHover: true }).bindPopup(popup, { maxWidth: 260, autoPanPaddingTopLeft: [10, 60] });
      mk.addTo(L_.problems);
      probMarkers.set(p.id, mk);
    });
  }

  // TomTom real vaqt tirbandlik plitalari (butun shahar, har 2 daqiqada yangilanadi)
  function setRealTraffic(url) {
    if (!url) { if (realTiles) { map.removeLayer(realTiles); realTiles = null; restyle(); updateLegend(); } return; }
    if (!realTiles) {
      realTiles = L.tileLayer(url, { maxZoom: 19, opacity: 0.95, zIndex: 5, attribution: 'Tirbandlik &copy; TomTom' }).addTo(map);
      realTiles.on('tileerror', () => { if (h.onTilesError) h.onTilesError(); });
      restyle();
    } else realTiles.setUrl(url);
    tilesTs = Date.now();
    updateLegend();
  }

  // Yoʻl hodisalari (avariya, taʼmir, yopiq yoʻl) — real vaqt
  function setIncidents(list) {
    L_.incidents.clearLayers();
    (list || []).forEach(it => {
      if (it.line.length > 1) L.polyline(it.line, { renderer, color: COL.red, weight: 5, opacity: 0.55, dashArray: '6 6', interactive: false }).addTo(L_.incidents);
      const icon = L.divIcon({ className: 'pmk inc', html: `<span style="--c:#dc2626">${it.icon}</span>`, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] });
      const where = [it.from, it.to].filter(Boolean).join(' → ');
      L.marker([it.lat, it.lon], { icon, title: it.name, zIndexOffset: 500 }).bindPopup(`<div class="ppop"><b>${it.icon} ${NX.esc(it.name)}</b>${where ? `<div>${NX.esc(where)}</div>` : ''}<p>${it.delay ? `Kechikish: <b>+${Math.max(1, Math.round(it.delay / 60))} daqiqa</b>` : NX.esc(it.magText)}${it.start ? `<br>Boshlangan: ${NX.fmt.time(Date.parse(it.start))}` : ''}</p>${NX.badge('tomtom')}</div>`, { maxWidth: 240 }).addTo(L_.incidents);
    });
  }

  function showProblems(on) { forcedProblems = on; applyVis('problems'); }

  function focusProblem(p) {
    forcedProblems = true; applyVis('problems');
    map.flyTo([p.lat, p.lon], p.type === 'coverage' ? 16 : 17, { duration: 0.6 });
    const mk = probMarkers.get(p.id);
    if (mk) map.once('moveend', () => { mk.openPopup(); const el = mk.getElement(); if (el) { el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 2400); } });
  }

  function restyle() {
    if (!M) return;
    wayLines.forEach((pl, i) => pl.setStyle(styleFor(M.ways[i])));
    if (selected != null) selectStreet(selected, false);
  }

  function setColorMode(m) { colorMode = m; restyle(); updateLegend(); }

  function selectStreet(id, fit = true) {
    selected = id;
    L_.hl.clearLayers();
    L_.hover.clearLayers(); hoverId = null;
    if (id == null) return;
    const s = M.streets[id];
    s.ways.forEach(i => {
      const w = M.ways[i];
      L.polyline(w.ll, { renderer, color: '#0f172a', weight: NX.HW[w.hw].w + 7, opacity: 0.35, interactive: false }).addTo(L_.hl);
      L.polyline(w.ll, { renderer, color: '#22d3ee', weight: NX.HW[w.hw].w + 2, opacity: 1, interactive: false }).addTo(L_.hl);
    });
    if (fit) map.fitBounds(s.bounds, { padding: [40, 40], maxZoom: 17 });
  }

  function highlightRoute(i) {
    routeHi = i;
    M.routes.forEach(r => r.layers.forEach(pl => pl.setStyle(i == null ? { weight: 2.5, opacity: 0.75 } : r.i === i ? { weight: 6, opacity: 1 } : { weight: 1.5, opacity: 0.2 })));
    if (i != null) {
      if (!vis.routes) { vis.routes = true; L_.routes.addTo(map); syncChecks(); }
      const r = M.routes[i];
      r.layers.forEach(pl => pl.bringToFront());
      const all = r.segsLL.flat();
      if (all.length) map.fitBounds(all, { padding: [30, 30], maxZoom: 16 });
    }
  }

  function syncChecks() { document.querySelectorAll('.nx-layers input').forEach(cb => { cb.checked = !!vis[cb.dataset.layer]; }); }

  function showDeltas(res, pieces) {
    clearDeltas(false);
    deltaLayer = L.layerGroup();
    const d = res.deltas, max = Math.max(1, res.maxAbsDelta);
    for (let k = 0; k < d.length; k += 2) {
      const [wi, i0, i1] = pieces[d[k]], v = d[k + 1];
      const pl = L.polyline(M.ways[wi].ll.slice(i0, i1 + 1), { renderer, color: v > 0 ? COL.red : COL.green, weight: 2 + (9 * Math.abs(v)) / max, opacity: 0.9, interactive: false });
      deltaLayer.addLayer(pl);
    }
    deltaLayer.addTo(map);
    restyle(); updateLegend();
  }
  function clearDeltas(redraw = true) {
    if (deltaLayer) { map.removeLayer(deltaLayer); deltaLayer = null; }
    if (redraw) { restyle(); updateLegend(); }
  }

  NX.map = {
    init, setModel, restyle, setRealTraffic, setIncidents, hasRealTiles: () => !!realTiles, setColorMode, selectStreet, highlightRoute, showDeltas, clearDeltas, drawProblems, showProblems, focusProblem, updateLegend,
    flyTo: (lat, lon, z = 17) => map.flyTo([lat, lon], z, { duration: 0.6 }),
    invalidate: () => map && map.invalidateSize(),
    leaflet: () => map,
    hasDeltas: () => !!deltaLayer,
    colors: COL, col,
  };
})();
