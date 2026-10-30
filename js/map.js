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
    L_.fixes = L.layerGroup().addTo(map);
    // Boʻsh joyni bosish (masalan, “Muammolar” boʻlimida eng yaqin muammoni ochish)
    map.on('click', e => { if (!picking && h.onMapClick) h.onMapClick(e.latlng); });
    // Popup ichidagi “Svetofor bor”, “Muammo emas” kabi tugmalar
    map.on('popupopen', e => {
      const el = e.popup.getElement();
      if (!el || el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', ev => {
        const b = ev.target.closest('[data-fix],[data-fix-remove]');
        if (!b) return;
        ev.preventDefault();
        map.closePopup();
        if (h.onFix) h.onFix(b.dataset.fix ? { action: b.dataset.fix, pid: b.dataset.pid } : { action: 'remove', id: b.dataset.fixRemove });
      });
    });
    L_.hover = L.layerGroup().addTo(map);
    L_.hl = L.layerGroup().addTo(map);
    L_.seg = L.layerGroup().addTo(map);
    L_.area = L.layerGroup().addTo(map);
    L_.sys = L.layerGroup().addTo(map);
    L_.ann = L.layerGroup().addTo(map);
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

  // “➕ Belgilash”: svetofor / piyoda oʻtish / bekatni xaritada joyini bosib qoʻshish
  function addMarkControl() {
    const Ctl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const d = L.DomUtil.create('div', 'nx-mark');
        d.innerHTML = `<button type="button" class="nx-mark-btn" aria-expanded="false">➕ Belgilash</button>
          <div class="nx-mark-list">${['signal', 'crossing', 'stop'].map(k => `<button type="button" data-kind="${k}">${NX.fixes.KIND[k].icon} ${NX.fixes.KIND[k].uz}</button>`).join('')}</div>`;
        L.DomEvent.disableClickPropagation(d);
        const btn = d.querySelector('.nx-mark-btn');
        btn.addEventListener('click', () => { const o = d.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
        d.querySelector('.nx-mark-list').addEventListener('click', e => {
          const b = e.target.closest('[data-kind]');
          if (!b) return;
          d.classList.remove('open');
          (NX.view ? NX.view.pickPoint : pickPoint)(b.dataset.kind, ll => h.onFix && h.onFix({ action: 'add', kind: b.dataset.kind, lat: ll.lat, lon: ll.lng }));
        });
        return d;
      },
    });
    new Ctl().addTo(map);
  }

  let picking = null;
  function pickPoint(kind, cb) {
    cancelPick();
    const k = typeof kind === 'string' ? NX.fixes.KIND[kind] : kind;
    const bar = L.DomUtil.create('div', 'nx-pickbar', map.getContainer());
    bar.innerHTML = `<span>${k.text || `${k.icon} <b>${k.uz}</b> joyini xaritada bosing`}</span><button type="button">Bekor qilish</button>`;
    L.DomEvent.disableClickPropagation(bar);
    bar.querySelector('button').addEventListener('click', () => { cancelPick(); if (k.onCancel) k.onCancel(); });
    map.getContainer().classList.add('picking');
    const onClick = e => { cancelPick(); cb(e.latlng); };
    picking = { bar, onClick };
    map.once('click', onClick);
    renderer._container && (renderer._container.style.pointerEvents = 'none');
  }
  function cancelPick() {
    if (!picking) return;
    map.off('click', picking.onClick);
    picking.bar.remove();
    map.getContainer().classList.remove('picking');
    renderer._container && (renderer._container.style.pointerEvents = '');
    picking = null;
  }

  // Foydalanuvchi qoʻshgan belgilar
  function drawFixes(list) {
    L_.fixes.clearLayers();
    (list || []).filter(x => x.kind !== 'dismiss').forEach(x => {
      const k = NX.fixes.KIND[x.kind];
      const icon = L.divIcon({ className: 'pmk fixmk', html: `<span style="--c:#16a34a">${k.icon}</span>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });
      L.marker([x.lat, x.lon], { icon, title: k.uz }).bindPopup(fixPopup(x)).addTo(L_.fixes);
    });
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
      const ya = NX.view && NX.view.yandexActive && NX.view.yandexActive();
      legendEl.innerHTML = `<b>Hisob natijasi</b>${sw(COL.red, 'Mashina koʻpayadi')}${sw(COL.green, 'Mashina kamayadi')}<small>Qalinlik va rang — oʻzgarish (mashina/soat): och — +15…60, toʻq sariq — 60…150, qizil — 150+${ya && !NX.yandex.trafficOn() ? '. Yandex probkalari vaqtincha yashirildi.' : ''}</small>${ya ? `<button type="button" class="btn xs" data-yatraffic>🚦 ${NX.yandex.trafficOn() ? 'Probkalarni yashirish' : 'Real probkalarni koʻrsatish'}</button>` : ''}`;
    } else if (!vis.traffic) {
      legendEl.innerHTML = '';
    } else if (colorMode.mode === 'forecast') {
      legendEl.innerHTML = `<b>Taxmin: ${NX.days[colorMode.d]}, ${NX.fmt.hour(colorMode.h)}</b>${sw(COL.green, 'Erkin')}${sw(COL.amber, 'Sekin')}${sw(COL.red, 'Tirband')}`;
    } else if (NX.view && NX.view.yandexActive && NX.view.yandexActive()) {
      legendEl.innerHTML = `<b>Hozirgi tirbandlik (Yandex)</b>${sw(COL.green, 'Erkin')}${sw(COL.amber, 'Sekin')}${sw(COL.red, 'Tirband')}${sw('#7f1d1d', 'Toʻxtab qolgan')}<span><i class="jam-sw">🚗</i>Odamlar xabari</span><small>Yandex, real vaqt. Kechasi deyarli hamma yoʻl yashil boʻladi.</small>`;
    } else if (realTiles) {
      legendEl.innerHTML = `<b>Hozirgi tirbandlik</b>${sw(COL.green, 'Erkin')}${sw(COL.amber, 'Sekin')}${sw(COL.red, 'Tirband')}<small>TomTom, real vaqt · ${tilesTs ? NX.fmt.time(tilesTs).slice(-5) : ''}</small>`;
    } else {
      legendEl.innerHTML = `<b>Tahlil xaritasi</b><small>Real tirbandlik — pastdagi “🚦 Yandex probkalar” tugmasida</small>`;
    }
    legendEl.style.display = legendEl.innerHTML ? '' : 'none';
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('[data-yatraffic]')) return;
    NX.yandex.setTraffic(!NX.yandex.trafficOn());
    updateLegend();
  });

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
      pl.on('click', e => h.onStreet && h.onStreet(w.street, e.latlng));
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

  function problemPopup(p) {
    const meta = NX.PROBLEM[p.type];
    const fixBtn = {
      junction: ['signal', '🚦 Bu yerda svetofor bor'], school: ['crossing', '🚶 Yaqinida oʻtish joyi bor'],
      crossings: ['pick-crossing', '🚶 Oʻtish joyini belgilash'], coverage: ['pick-stop', '🚏 Yaqinida bekat bor (joyini bosing)'],
    }[p.type];
    const fixes = `<div class="fix-row">${fixBtn ? `<button type="button" class="btn sm primary" data-fix="${fixBtn[0]}" data-pid="${p.id}">${fixBtn[1]}</button>` : ''}<button type="button" class="btn sm" data-fix="dismiss" data-pid="${p.id}">❌ Bu muammo emas</button></div>
      <a class="osm-edit" href="${NX.fixes.osmEditUrl(p.lat, p.lon)}" target="_blank" rel="noopener">✏️ OpenStreetMap’da ham tuzatish</a>`;
    return `<div class="ppop"><b>${meta.icon} ${NX.esc(meta.short)}</b><div>${NX.esc(p.title)}</div><p>${NX.esc(meta.what)}</p><p><b>Yechim:</b> ${NX.esc(meta.fix)}</p><div class="fix-row">${NX.pano.btn(p.lat, p.lon, p.title, 'btn sm')}</div><p class="muted small" style="margin-top:8px">Xarita notoʻgʻrimi? Oʻrgating:</p>${fixes}</div>`;
  }
  function fixPopup(x) {
    const k = NX.fixes.KIND[x.kind];
    return `<div class="ppop"><b>${k.icon} ${NX.esc(k.uz)}</b><div class="muted">Foydalanuvchi belgilagan · ${NX.fmt.time(x.ts)}</div><p>${x.shared ? 'Hamma uchun saqlangan.' : 'Faqat shu kompyuterda (xodim kodi kiritilmagan).'}</p><div class="fix-row"><button type="button" class="btn sm" data-fix-remove="${NX.esc(x.id)}">🗑 Oʻchirish</button></div></div>`;
  }

  function drawProblems() {
    L_.problems.clearLayers();
    probMarkers.clear();
    const cell = NX.RULES.cell;
    M.problems.forEach(p => {
      const meta = NX.PROBLEM[p.type];
      const popup = problemPopup(p);
      if (p.type === 'coverage') {
        const r = Math.sqrt((p.cluster.cells.length * cell * cell) / Math.PI);
        L.circle([p.lat, p.lon], { renderer, radius: Math.max(150, r), color: meta.color, weight: 1, dashArray: '4 4', fillOpacity: 0.08, interactive: false }).addTo(L_.problems);
      }
      const icon = L.divIcon({ className: 'pmk', html: `<span style="--c:${meta.color}">${meta.icon}</span>`, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16] });
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

  // AI tavsiyalari xaritada: nuqtalar (yorliq bilan) va yangi yoʻl chiziqlari
  function showActions(list) {
    L_.ann.clearLayers();
    (list || []).forEach((a, i) => {
      // Xaritada ixcham: raqam + belgi; toʻliq yozuv — sichqoncha ustida / bosilganda va chatdagi roʻyxatda
      const ico = (String(a.title).match(/^\p{Extended_Pictographic}\uFE0F?/u) || [''])[0] || (a.kind === 'line' ? '🛣' : '📍');
      const label = `<span class="ann-n">${i + 1}</span><span class="ann-i" title="${NX.esc(a.title)}">${ico}</span>`;
      if (a.kind === 'zone') L.polygon(a.ring, { renderer, color: a.color, weight: 2, fillColor: a.color, fillOpacity: 0.3, interactive: false }).addTo(L_.ann);
      if (a.kind === 'line' && a.path) {
        L.polyline(a.path, { renderer, color: '#ffffff', weight: 9, opacity: 0.85, interactive: false }).addTo(L_.ann);
        L.polyline(a.path, { renderer, color: a.color || '#16a34a', weight: 5, opacity: 0.95, interactive: false }).addTo(L_.ann);
        L.marker([a.lat, a.lon], { icon: L.divIcon({ className: 'ann', html: label, iconSize: null }) }).bindTooltip(NX.esc(a.title), { direction: 'top' }).bindPopup(`<b>${i + 1}. ${NX.esc(a.title)}</b><p>${NX.esc(a.note || '')}</p>`).addTo(L_.ann);
      } else if (a.kind === 'line') {
        L.polyline([a.from, a.to], { renderer, color: '#7c3aed', weight: 6, dashArray: '10 8', opacity: 0.95, interactive: false }).addTo(L_.ann);
        L.marker([(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2], { icon: L.divIcon({ className: 'ann', html: label, iconSize: null }) }).bindTooltip(NX.esc(a.title), { direction: 'top' }).bindPopup(`<b>${i + 1}. ${NX.esc(a.title)}</b><p>${NX.esc(a.note || '')}</p>`).addTo(L_.ann);
      } else L.marker([a.lat, a.lon], { icon: L.divIcon({ className: 'ann', html: label, iconSize: null }), riseOnHover: true }).bindTooltip(NX.esc(a.title), { direction: 'top' }).bindPopup(`<b>${i + 1}. ${NX.esc(a.title)}</b><p>${NX.esc(a.note || '')}</p>`).addTo(L_.ann);
    });
  }

  // Dinamik model: bir vaqt qadamidagi tezlik (sr) va navbat (ql, m) — koʻchalar boʻyalgan
  let dynLayer = null;
  function showDynamic(sr, ql, pieces) {
    clearDynamic();
    dynLayer = L.layerGroup();
    for (let p = 0; p < pieces.length; p++) {
      const r = sr[p], q = ql[p];
      if (r >= 0.85 && q < 5) continue;
      const [wi, i0, i1] = pieces[p];
      const col = r >= 0.75 ? COL.green : r >= 0.55 ? COL.amber : r >= 0.35 ? COL.red : '#7f1d1d';
      L.polyline(M.ways[wi].ll.slice(i0, i1 + 1), { renderer, color: col, weight: 3 + Math.min(9, q / 60), opacity: 0.9, interactive: false }).addTo(dynLayer);
    }
    dynLayer.addTo(map);
  }
  function clearDynamic() { if (dynLayer) { map.removeLayer(dynLayer); dynLayer = null; } }

  // Shahar tizimlari (kameralar, elektr, gaz, suv, kanalizatsiya) — yuklangan xaritalar
  function sysPopup(sys, f) {
    const S = NX.SYSTEMS[sys], p = f.properties || {};
    const url = p.url || p.stream || p.link || p.video || p.hls || '';
    const rows = Object.keys(p).filter(k => !/^(url|stream|link|video|hls)$/i.test(k)).slice(0, 8).map(k => `<tr><td>${NX.esc(k)}</td><td>${NX.esc(String(p[k]).slice(0, 120))}</td></tr>`).join('');
    return `<div class="ppop"><b>${S.icon} ${NX.esc(p.name || p.nomi || S.uz)}</b>${rows ? `<table class="sys-tbl">${rows}</table>` : ''}${url && /^https?:/i.test(url) ? `<p><a href="${NX.esc(url)}" target="_blank" rel="noopener">▶ Videoni ochish</a></p>` : ''}</div>`;
  }
  function drawSystems(list) {
    L_.sys.clearLayers();
    (list || []).forEach(({ sys, gj }) => {
      const c = NX.SYSTEMS[sys].color, ico = NX.SYSTEMS[sys].icon;
      L.geoJSON(gj, {
        style: () => ({ color: c, weight: 3, opacity: 0.85, fillOpacity: 0.12 }),
        pointToLayer: (f, ll) => sys === 'camera' || sys === 'power' || sys === 'webcam'
          ? L.marker(ll, { icon: L.divIcon({ className: 'pmk sysmk', html: `<span style="--c:${c}">${ico}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
          : L.circleMarker(ll, { renderer, radius: 5, color: c, weight: 2, fillOpacity: 0.7 }),
        onEachFeature: (f, l) => l.bindPopup(sysPopup(sys, f), { maxWidth: 280 }),
      }).addTo(L_.sys);
    });
  }

  // Belgilangan hudud (mahalla) va rejalashtirilgan bino
  function drawArea(poly, pt, fit) {
    L_.area.clearLayers();
    if (!poly) return;
    L.polygon(poly, { renderer, color: '#6366f1', weight: 3, fillColor: '#6366f1', fillOpacity: 0.12, interactive: false }).addTo(L_.area);
    if (pt) L.marker(pt, { icon: L.divIcon({ className: 'pmk', html: '<span style="--c:#6366f1">🏢</span>', iconSize: [36, 36], iconAnchor: [18, 18] }), interactive: false }).addTo(L_.area);
    if (fit) map.fitBounds(poly, { padding: [40, 40], maxZoom: 17 });
  }
  function pxToLL(cx, cy) {
    const r = map.getContainer().getBoundingClientRect(), ll = map.containerPointToLatLng([cx - r.left, cy - r.top]);
    return [ll.lat, ll.lng];
  }

  // Koʻchaning tanlangan qismi (toʻq sariq)
  function selectSegment(lines) {
    L_.seg.clearLayers();
    (lines || []).forEach(ll => L.polyline(ll, { renderer, color: '#f97316', weight: 10, opacity: 0.95, interactive: false }).addTo(L_.seg));
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
      const [wi, i0, i1] = pieces[d[k]], v = d[k + 1], st = NX.deltaStyle(v);
      if (!st) continue;
      deltaLayer.addLayer(L.polyline(M.ways[wi].ll.slice(i0, i1 + 1), { renderer, color: st.col, weight: st.w, opacity: 0.9, interactive: false }));
    }
    deltaLayer.addTo(map);
    restyle(); updateLegend();
  }
  function clearDeltas(redraw = true) {
    if (deltaLayer) { map.removeLayer(deltaLayer); deltaLayer = null; }
    if (redraw) { restyle(); updateLegend(); }
  }

  NX.map = {
    init, setModel, restyle, drawFixes, problemPopup, fixPopup, pickPoint, cancelPick, setRealTraffic, setIncidents, hasRealTiles: () => !!realTiles, setColorMode, selectStreet, selectSegment, drawArea, drawSystems, sysPopup, pxToLL, showDynamic, clearDynamic, showActions, hasDynamic: () => !!dynLayer, highlightRoute, showDeltas, clearDeltas, drawProblems, showProblems, focusProblem, updateLegend,
    flyTo: (lat, lon, z = 17) => map.flyTo([lat, lon], z, { duration: 0.6 }),
    invalidate: () => map && map.invalidateSize(),
    leaflet: () => map,
    hasDeltas: () => !!deltaLayer,
    colors: COL, col,
  };
})();
