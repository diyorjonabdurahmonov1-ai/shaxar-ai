/* NEXUS Transport — Leaflet xaritasi va qatlamlar */
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
  const vis = NX.store.get('layers', { traffic: true, routes: true, stops: true, problems: true, schools: false });

  function init(el, handlers) {
    h = handlers || {};
    const c = NX.config;
    map = L.map(el, { zoomControl: true, preferCanvas: true, minZoom: 13, maxZoom: 19 })
      .setView(c.center, 15);
    renderer = L.canvas({ tolerance: 7, padding: 0.3 });
    map.setMaxBounds([[c.bbox.s - 0.03, c.bbox.w - 0.05], [c.bbox.n + 0.03, c.bbox.e + 0.05]]);
    addBasemap();
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    ['traffic', 'routes', 'stops', 'problems', 'schools'].forEach(k => (L_[k] = L.layerGroup()));
    L_.hl = L.layerGroup().addTo(map);
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
        const items = [['traffic', 'Tirbandlik'], ['routes', 'Avtobus yoʻnalishlari'], ['stops', 'Bekatlar'], ['problems', 'Muammolar'], ['schools', 'Maktab va bogʻchalar']];
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
      legendEl.innerHTML = `<b>Bashorat: ${NX.days[colorMode.d]}, ${NX.fmt.hour(colorMode.h)} ${NX.badge('bashorat')}</b>${sw(COL.green, '< 15%')}${sw(COL.amber, '15–30%')}${sw(COL.red, '≥ 30%')}`;
    } else {
      legendEl.innerHTML = `<b>Tirbandlik</b>${sw(COL.green, 'Erkin / past xavf')}${sw(COL.amber, 'Oʻrtacha')}${sw(COL.red, 'Tirband / yuqori xavf')}<small>Qalin chiziq — TomTom oʻlchovi; xira — xavf taxmini (Hisob)</small>`;
    }
    legendEl.style.display = legendEl.innerHTML ? '' : 'none';
  }

  function setVisible(k, on) {
    vis[k] = on;
    NX.store.set('layers', vis);
    if (k === 'traffic') { restyle(); updateLegend(); return; }
    if (on) L_[k].addTo(map); else map.removeLayer(L_[k]);
  }

  function styleFor(w) {
    const s = M.streets[w.street], H = NX.HW[w.hw];
    if (deltaLayer) return { color: COL.grey, weight: H.w * 0.7, opacity: 0.35 };
    if (!vis.traffic) return { color: COL.grey, weight: H.w * 0.8, opacity: 0.6 };
    if (colorMode.mode === 'forecast') {
      const p = NX.forecast.predict(s, colorMode.d, colorMode.h);
      return { color: col(p.value, 15, 30), weight: H.w, opacity: p.low ? 0.65 : 0.95 };
    }
    if (s.tomtom) return { color: col(s.tomtom.congestion, 15, 30), weight: H.w + 2, opacity: 1 };
    return { color: col(s.risk.value, 35, 60), weight: H.w, opacity: 0.5 };
  }

  function setModel(model) {
    M = model;
    Object.values(L_).forEach(g => g.clearLayers());
    wayLines = M.ways.map(w => {
      const pl = L.polyline(w.ll, Object.assign({ renderer, bubblingMouseEvents: false }, styleFor(w)));
      pl.on('click', () => h.onStreet && h.onStreet(w.street));
      pl.bindTooltip(() => M.streets[w.street].name || 'Nomsiz yoʻl', { sticky: true, direction: 'top', opacity: 0.9 });
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
    Object.keys(vis).forEach(k => { if (k !== 'traffic') { if (vis[k]) L_[k].addTo(map); else map.removeLayer(L_[k]); } });
    L_.traffic.addTo(map);
  }

  function drawProblems() {
    L_.problems.clearLayers();
    const G = NX.geo, cell = NX.RULES.cell;
    M.problems.forEach(p => {
      const meta = NX.PROBLEM[p.type];
      const popup = `<b>${NX.esc(meta.uz)}</b><br>${NX.esc(p.title)}<br><small>${NX.esc(p.detail)}</small><br>${NX.badge(p.type === 'congestion' ? 'tomtom' : 'osm')} ${NX.badge('hisob')}`;
      if (p.type === 'coverage') {
        const c = p.cell, a = G.ll(c.cy - cell / 2, c.cx - cell / 2), b = G.ll(c.cy + cell / 2, c.cx + cell / 2);
        L.rectangle([[a[0], a[1]], [b[0], b[1]]], { renderer, color: meta.color, weight: 0.5, fillOpacity: 0.12, opacity: 0.5 }).bindPopup(popup).addTo(L_.problems);
        return;
      }
      L.circleMarker([p.lat, p.lon], { renderer, radius: 7 + p.sev, color: '#fff', weight: 2, fillColor: meta.color, fillOpacity: 0.95 }).bindPopup(popup).addTo(L_.problems);
    });
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
    init, setModel, restyle, setColorMode, selectStreet, highlightRoute, showDeltas, clearDeltas, drawProblems,
    flyTo: (lat, lon, z = 17) => map.flyTo([lat, lon], z, { duration: 0.6 }),
    invalidate: () => map && map.invalidateSize(),
    leaflet: () => map,
    hasDeltas: () => !!deltaLayer,
    colors: COL, col,
  };
})();
