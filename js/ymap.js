/* City Jam — bitta asosiy xarita: Yandex (probkalar) ustida tahlil qatlamlari.
   NX.view — ilova chaqiradigan yagona xarita interfeysi. Leaflet (NX.map) orqa fonda zaxira sifatida
   doim yangilanib turadi; Yandex xaritasi ishlayotgan boʻlsa, xuddi shu chizmalar Yandex’da ham chiziladi. */
(function () {
  'use strict';
  const NX = window.NX;
  const COL = { green: '#16a34a', amber: '#f59e0b', red: '#dc2626' };
  let M = null, colorMode = { mode: 'now' }, showProb = false, pieces = null;
  const G = { sel: null, delta: null, prob: null, fixes: null, route: null, fc: null };
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
  const line = (ll, o) => new window.ymaps.Polyline(ll, {}, o);
  function iconLayout() {
    if (!layoutCache) layoutCache = window.ymaps.templateLayoutFactory.createClass('<div class="pmk ymk"><span style="--c:{{ properties.color }}">{{ properties.icon }}</span></div>');
    return layoutCache;
  }
  function mark(lat, lon, icon, color, html, hint, size) {
    const r = (size || 30) / 2;
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
      M.streets[id].ways.forEach(i => { const ll = M.ways[i].ll; lls.push(...ll); c.add(line(ll, { strokeColor: '#06b6d4', strokeWidth: 8, strokeOpacity: 0.9 })); });
      if (fit !== false) fitTo(lls, 17);
    },
    showDeltas(res, pcs) {
      if (!Y() || !M) return;
      pieces = pcs;
      const c = coll('delta'), d = res.deltas, max = Math.max(1, res.maxAbsDelta);
      for (let k = 0; k < d.length; k += 2) {
        const [wi, i0, i1] = pcs[d[k]], v = d[k + 1];
        c.add(line(M.ways[wi].ll.slice(i0, i1 + 1), { strokeColor: v > 0 ? COL.red : COL.green, strokeWidth: 3 + (9 * Math.abs(v)) / max, strokeOpacity: 0.9 }));
      }
    },
    clearDeltas() { drop('delta'); },
    drawProblems() {
      if (!Y() || !M) return;
      const c = coll('prob');
      M.problems.forEach(p => {
        const meta = NX.PROBLEM[p.type];
        c.add(mark(p.lat, p.lon, meta.icon, meta.color, NX.map.problemPopup(p), meta.short));
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
      const k = NX.fixes.KIND[kind], wrap = document.querySelector('.map-wrap');
      Ymap.cancelPick();
      const bar = document.createElement('div');
      bar.className = 'nx-pickbar ypick';
      bar.innerHTML = `<span>${k.icon} <b>${k.uz}</b> joyini xaritada bosing</span><button type="button">Bekor qilish</button>`;
      bar.querySelector('button').addEventListener('click', Ymap.cancelPick);
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
  ['setModel', 'restyle', 'setColorMode', 'selectStreet', 'highlightRoute', 'showDeltas', 'clearDeltas', 'drawProblems', 'showProblems',
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
  NX.view.syncYandex = (model, fixes) => { Ymap.setModel(model); Ymap.drawFixes(fixes); };
})();
