/* City Jam — bitta asosiy xarita: Yandex (probkalar) ustida tahlil qatlamlari.
   NX.view — ilova chaqiradigan yagona xarita interfeysi. Leaflet (NX.map) orqa fonda zaxira sifatida
   doim yangilanib turadi; Yandex xaritasi ishlayotgan boʻlsa, xuddi shu chizmalar Yandex’da ham chiziladi. */
(function () {
  'use strict';
  const NX = window.NX;
  const COL = { green: '#16a34a', amber: '#f59e0b', red: '#dc2626' };
  let M = null, colorMode = { mode: 'now' }, showProb = false, pieces = null;
  const G = { ann: null, dyn: null, sys: null, area: null, seg: null, sel: null, delta: null, prob: null, fixes: null, route: null, fc: null, rep: null };
  const Y = () => NX.yandex && NX.yandex.getMap && NX.yandex.getMap();
  let layoutCache = null;

  function coll(name) {
    const map = Y();
    if (!map) return null;
    if (G[name]) map.geoObjects.remove(G[name]);
    G[name] = new window.ymaps.GeoObjectCollection();
    map.geoObjects.add(G[name]);
    return G[name];
  }
  function drop(name) { const map = Y(); if (map && G[name]) map.geoObjects.remove(G[name]); G[name] = null; }
  // Chiziqlar odatda bosishni oʻtkazib yuboradi (“silent”) — ostidagi koʻchani yoki xaritani bosish mumkin boʻlsin
  const line = (ll, o) => new window.ymaps.Polyline(ll, {}, Object.assign({ interactivityModel: 'default#silent' }, o));
  function iconLayout() {
    if (!layoutCache) layoutCache = window.ymaps.templateLayoutFactory.createClass('<div class="pmk ymk"><span style="--c:{{ properties.color }}">{{ properties.icon }}</span></div>');
    return layoutCache;
  }
  function mark(lat, lon, icon, color, html, hint, size) {
    const r = (size || 34) / 2;
    return new window.ymaps.Placemark([lat, lon], { icon, color, balloonContent: html, hintContent: hint }, {
      iconLayout: iconLayout(), iconShape: { type: 'Circle', coordinates: [0, 0], radius: r }, iconOffset: [-r, -r], hideIconOnBalloonOpen: false,
    });
  }
  function fitTo(lls, maxZoom) {
    const map = Y(); if (!map || !lls.length) return;
    let s = 90, w = 180, n = -90, e = -180;
    lls.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
    map.setBounds([[s, w], [n, e]], { checkZoomRange: true, zoomMargin: 40, duration: 300 }).then(() => { if (map.getZoom() > maxZoom) map.setZoom(maxZoom); });
  }

  const Ymap = {
    setModel(model) { M = model; this.drawProblems(); this.restyle(); },
    selectStreet(id, fit) {
      if (!Y() || !M) return;
      const c = coll('sel');
      if (id == null) return;
      const lls = [];
      M.streets[id].ways.forEach(i => { const ll = M.ways[i].ll; lls.push(...ll); c.add(line(ll, { strokeColor: '#06b6d4', strokeWidth: 8, strokeOpacity: 0.9, interactivityModel: 'default#geoObject', cursor: 'pointer' })); });
      // Ajratilgan koʻchani qayta bosish — ajratishni olib tashlash
      if (c.events) c.events.add('click', e => { const p = e.get && e.get('coords'); if (p && NX.yandex.takePick(p[0], p[1])) return; if (NX.view.onSelClick) NX.view.onSelClick(); });
      if (fit !== false) fitTo(lls, 17);
    },
    showDeltas(res, pcs) {
      if (!Y() || !M) return;
      pieces = pcs;
      NX.yandex.setTraffic(false);
      NX.map.updateLegend();
      const c = coll('delta'), d = res.deltas, max = Math.max(1, res.maxAbsDelta);
      for (let k = 0; k < d.length; k += 2) {
        const [wi, i0, i1] = pcs[d[k]], v = d[k + 1], st = NX.deltaStyle(v);
        if (st) c.add(line(M.ways[wi].ll.slice(i0, i1 + 1), { strokeColor: st.col, strokeWidth: st.w + 1, strokeOpacity: 0.9 }));
      }
    },
    clearDeltas() { drop('delta'); NX.yandex.setTraffic(true); NX.map.updateLegend(); },
    showDynamic(sr, ql, pcs) {
      if (!Y() || !M) return;
      NX.yandex.setTraffic(false);
      const c = coll('dyn');
      for (let p = 0; p < pcs.length; p++) {
        const r = sr[p], q = ql[p];
        if (r >= 0.85 && q < 5) continue;
        const [wi, i0, i1] = pcs[p];
        c.add(line(M.ways[wi].ll.slice(i0, i1 + 1), { strokeColor: r >= 0.75 ? COL.green : r >= 0.55 ? COL.amber : r >= 0.35 ? COL.red : '#7f1d1d', strokeWidth: 3 + Math.min(9, q / 60), strokeOpacity: 0.9 }));
      }
    },
    showActions(list) {
      if (!Y()) return;
      if (!list || !list.length) { drop('ann'); return; }
      const c = coll('ann');
      list.forEach((a, i) => {
        const bal = { balloonContent: `<b>${NX.esc(a.title)}</b><p>${NX.esc(a.note || '')}</p>` };
        if (a.fx) {
          if (a.kind === 'line') return;
          c.add(new window.ymaps.Placemark([a.lat, a.lon], { iconContent: a.id || String(i + 1), hintContent: a.title, balloonContent: bal.balloonContent }, { preset: 'islands#circleIcon', iconColor: a.color || '#16a34a', zIndex: 1000 }));
          return;
        }
        if (a.kind === 'zone') c.add(new window.ymaps.Polygon([a.ring], bal, { strokeColor: a.color, strokeWidth: 2, fillColor: a.color, fillOpacity: 0.3 }));
        if (a.kind === 'line' && a.path) c.add(new window.ymaps.Polyline(a.path, bal, { strokeColor: a.color || '#16a34a', strokeWidth: a.dash ? 4 : 6, strokeStyle: a.dash ? 'dash' : 'solid', strokeOpacity: 0.95 }));
        if (a.dash) return;
        else if (a.kind === 'line') c.add(new window.ymaps.Polyline([a.from, a.to], bal, { strokeColor: '#7c3aed', strokeWidth: 6, strokeStyle: 'dash', strokeOpacity: 0.95 }));
        const p = a.kind === 'line' && !a.path ? [(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2] : [a.lat, a.lon];
        c.add(new window.ymaps.Placemark(p, { iconContent: String(i + 1), hintContent: a.title, balloonContent: `<b>${i + 1}. ${NX.esc(a.title)}</b><p>${NX.esc(a.note || '')}</p>` }, { preset: 'islands#violetCircleIcon' }));
      });
    },
    clearDynamic() { drop('dyn'); NX.yandex.setTraffic(true); },
    drawSystems(list) {
      if (!Y()) return;
      if (!list || !list.length) { drop('sys'); return; }
      const c = coll('sys');
      list.forEach(({ sys, gj }) => {
        const col = NX.SYSTEMS[sys].color, ico = NX.SYSTEMS[sys].icon;
        gj.features.forEach(f => {
          const g = f.geometry, html = NX.map.sysPopup(sys, f), sw = (a) => a.map(q => [q[1], q[0]]);
          if (g.type === 'Point') c.add(mark(g.coordinates[1], g.coordinates[0], ico, col, html, NX.SYSTEMS[sys].uz, 24));
          else if (g.type === 'LineString') c.add(new window.ymaps.Polyline(sw(g.coordinates), { balloonContent: html }, { strokeColor: col, strokeWidth: 3, strokeOpacity: 0.85 }));
          else if (g.type === 'MultiLineString') g.coordinates.forEach(l => c.add(new window.ymaps.Polyline(sw(l), { balloonContent: html }, { strokeColor: col, strokeWidth: 3, strokeOpacity: 0.85 })));
          else if (g.type === 'Polygon') c.add(new window.ymaps.Polygon(g.coordinates.map(sw), { balloonContent: html }, { strokeColor: col, strokeWidth: 2, fillColor: col, fillOpacity: 0.12 }));
        });
      });
    },
    drawArea(poly, pt, fit) {
      if (!Y()) return;
      if (!poly) { drop('area'); return; }
      const c = coll('area');
      const ring = poly.map(p => [+p[0], +p[1]]);
      c.add(new window.ymaps.Polygon([ring.concat([ring[0]])], {}, { fillColor: '#6366f1', fillOpacity: 0.14, strokeWidth: 0, interactivityModel: 'default#silent' }));
      // Chegara — alohida yopiq chiziq (Polygon chegarasi baʼzan chizilmaydi)
      c.add(line(ring.concat([ring[0]]), { strokeColor: '#4f46e5', strokeWidth: 4, strokeOpacity: 0.95, strokeStyle: 'shortdash' }));
      if (pt) c.add(mark(pt[0], pt[1], '🏢', '#6366f1', '', 'Rejalashtirilgan bino', 36));
      if (fit) fitTo(poly, 17);
    },
    fitPoints(pts) {
      const map = Y(); if (!map || !pts || !pts.length) return;
      try { map.setBounds(window.ymaps.util.bounds.fromPoints(pts), { checkZoomRange: true, zoomMargin: 60, duration: 600 }); } catch (e) { /* */ }
    },
    llToPx(lat, lon) {
      const map = Y(); if (!map) return null;
      const gp = map.options.get('projection').toGlobalPixels([lat, lon], map.getZoom()), pp = map.converter.globalToPage(gp);
      return [pp[0] - window.scrollX, pp[1] - window.scrollY];
    },
    pxToLL(cx, cy) {
      const map = Y(); if (!map) return null;
      const gp = map.converter.pageToGlobal([cx + window.scrollX, cy + window.scrollY]);
      return map.options.get('projection').fromGlobalPixels(gp, map.getZoom());
    },
    selectSegment(lines) {
      if (!Y()) return;
      if (!lines) { drop('seg'); return; }
      const c = coll('seg');
      lines.forEach(ll => c.add(line(ll, { strokeColor: '#f97316', strokeWidth: 11, strokeOpacity: 0.95 })));
    },
    drawProblems() {
      if (!Y() || !M) return;
      const c = coll('prob');
      M.problems.forEach(p => {
        const meta = NX.PROBLEM[p.type];
        c.add(mark(p.lat, p.lon, meta.icon, meta.color, NX.map.problemPopup(p), meta.short, 38));
      });
      if (!showProb) Y().geoObjects.remove(c);
    },
    showProblems(on) {
      showProb = on;
      const map = Y(); if (!map || !G.prob) return;
      map.geoObjects.remove(G.prob);
      if (on) map.geoObjects.add(G.prob);
    },
    focusProblem(p) {
      const map = Y(); if (!map) return;
      this.showProblems(true);
      map.setCenter([p.lat, p.lon], p.type === 'coverage' ? 16 : 17, { duration: 300 }).then(() => {
        G.prob && G.prob.each(o => { const c = o.geometry.getCoordinates(); if (Math.abs(c[0] - p.lat) < 1e-7 && Math.abs(c[1] - p.lon) < 1e-7) o.balloon.open(); });
      });
    },
    drawFixes(list) {
      if (!Y()) return;
      const c = coll('fixes');
      (list || []).filter(x => x.kind !== 'dismiss').forEach(x => {
        const k = NX.fixes.KIND[x.kind];
        c.add(mark(x.lat, x.lon, k.icon, '#16a34a', NX.map.fixPopup(x), k.uz, 26));
      });
    },
    highlightRoute(i) {
      if (!Y() || !M) return;
      if (i == null) { drop('route'); return; }
      const r = M.routes[i], c = coll('route'), lls = [];
      r.segsLL.forEach(seg => { lls.push(...seg); c.add(line(seg, { strokeColor: r.color, strokeWidth: 6, strokeOpacity: 0.95 })); });
      fitTo(lls, 16);
    },
    setColorMode(m) { colorMode = m; this.restyle(); },
    // Bashorat boʻlimi: asosiy koʻchalar taxminiy tirbandlik rangida
    restyle() {
      if (!Y() || !M) return;
      if (colorMode.mode !== 'forecast') { drop('fc'); return; }
      const c = coll('fc');
      M.ways.forEach(w => {
        const s = M.streets[w.street];
        if (s.rank < 3) return;
        const v = NX.forecast.predict(s, colorMode.d, colorMode.h).value;
        c.add(line(w.ll, { strokeColor: v < 15 ? COL.green : v < 30 ? COL.amber : COL.red, strokeWidth: NX.HW[w.hw].w + 1, strokeOpacity: 0.85 }));
      });
    },
    flyTo(lat, lon, z) { const map = Y(); if (map) map.setCenter([lat, lon], z || 17, { duration: 300 }); },
    pickPoint(kind, cb) {
      const k = typeof kind === 'string' ? NX.fixes.KIND[kind] : kind, wrap = document.querySelector('.map-wrap');
      Ymap.cancelPick();
      const bar = document.createElement('div');
      bar.className = 'nx-pickbar ypick';
      bar.innerHTML = `<span>${k.text || `${k.icon} <b>${k.uz}</b> joyini xaritada bosing`}</span><button type="button">Bekor qilish</button>`;
      bar.querySelector('button').addEventListener('click', () => { Ymap.cancelPick(); if (k.onCancel) k.onCancel(); });
      wrap.appendChild(bar);
      NX.yandex.setPicker((lat, lon) => { Ymap.cancelPick(); cb({ lat, lng: lon }); });
    },
    cancelPick() { NX.yandex.setPicker(null); document.querySelectorAll('.ypick').forEach(b => b.remove()); },
  };
  NX.ymapView = Ymap;

  // Yandex balloonlaridagi “Svetofor bor”, “Muammo emas”, “Oʻchirish” tugmalari
  document.addEventListener('click', e => {
    const b = e.target.closest('#ymap [data-fix], #ymap [data-fix-remove]');
    if (!b) return;
    e.preventDefault();
    const map = Y(); if (map) map.balloon.close();
    if (NX.view.onFix) NX.view.onFix(b.dataset.fix ? { action: b.dataset.fix, pid: b.dataset.pid } : { action: 'remove', id: b.dataset.fixRemove });
  });

  // Yagona interfeys: Leaflet doim (zaxira), Yandex — faol boʻlsa
  const ONLY_ACTIVE = { pickPoint: 1, cancelPick: 1 };
  const yOn = () => !!Y();
  NX.view = { onFix: null, yandexActive: yOn };
  ['setModel', 'restyle', 'setColorMode', 'selectStreet', 'highlightRoute', 'showDeltas', 'clearDeltas', 'selectSegment', 'drawArea', 'drawSystems', 'showDynamic', 'clearDynamic', 'showActions', 'fitPoints', 'drawProblems', 'showProblems',
    'focusProblem', 'updateLegend', 'drawFixes', 'pickPoint', 'cancelPick', 'setRealTraffic', 'setIncidents', 'flyTo'].forEach(fn => {
    NX.view[fn] = function () {
      const args = arguments;
      if (ONLY_ACTIVE[fn] && yOn()) return Ymap[fn].apply(Ymap, args);
      const r = NX.map[fn] ? NX.map[fn].apply(NX.map, args) : undefined;
      if (yOn() && Ymap[fn]) { try { Ymap[fn].apply(Ymap, args); } catch (err) { console.warn('Yandex qatlami:', err); } }
      return r;
    };
  });
  NX.view.hasDeltas = () => NX.map.hasDeltas();
  NX.view.pxToLL = (x, y) => (yOn() ? Ymap.pxToLL(x, y) : NX.map.pxToLL(x, y));
  NX.view.llToPx = (lat, lon) => (yOn() ? Ymap.llToPx(lat, lon) : NX.map.llToPx(lat, lon));
  NX.view.syncYandex = (model, fixes) => { Ymap.setModel(model); Ymap.drawFixes(fixes);  };
})();
