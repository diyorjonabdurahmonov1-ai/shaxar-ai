/* City Jam — Fotoreal 3D egizak (CesiumJS): 3D egizak boʻlimining ASOSIY koʻrinishi (token/kalit boʻlsa).
   Manba: Cesium ion tokeni → Google Photorealistic 3D Tiles (ion Asset Depot’dan “My Assets”ga qoʻshilgan boʻlsa),
   boʻlmasa Cesium OSM Buildings + World Terrain + sunʼiy yoʻldosh fon; yoki Google Maps API kaliti (Map Tiles API).
   MapLibre (map3d.js) ostida turadi va barcha natijalarni shu yerga uzatadi (map3d.js oxiridagi koʻprik):
   xavf zonalari, yoʻllar, belgilar, suv toshqini (koʻchalardagi suv chuqurligi), rejadagi yangi bino va qishki soya,
   belgilangan hudud va 3D da hudud chizish. “🧊 Sxematik 3D” — MapLibre koʻrinishiga qaytish.
   ToS: Google 3D plitalari faqat KOʻRSATILADI — undan bino/geometriya ajratib olinmaydi, keshlanmaydi. */
(function () {
  'use strict';
  const NX = window.NX;
  const VER = '1.123.0', BASE = `https://cdn.jsdelivr.net/npm/cesium@${VER}/Build/Cesium/`;
  const K = () => window.CITYJAM_KEYS || {};
  const gkey = () => (NX.store.get('key:google3d', '') || K().google3d || '').trim();
  const ion = () => (NX.store.get('key:cesiumIon', '') || K().cesiumIon || '').trim();
  const pref = () => NX.store.get('g3d:on', true) !== false;
  let viewer = null, loading = null, box = null, src = '', tiles = null, osm = null, failed = false, host = null;
  const D = { hz: null, scen: null, plan: null, mode: 'height', area: null, ov: null };
  let hzPrims = [], waterPrim = null, ovLayer = null, drawSt = null;

  function loadCesium() {
    if (window.Cesium) return Promise.resolve(window.Cesium);
    if (loading) return loading;
    window.CESIUM_BASE_URL = BASE;
    loading = new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = BASE + 'Widgets/widgets.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = BASE + 'Cesium.js'; s.async = true;
      s.onload = () => (window.Cesium ? res(window.Cesium) : rej(new Error('Cesium yuklanmadi')));
      s.onerror = () => { loading = null; rej(new Error('Cesium kutubxonasi yuklanmadi (internet?)')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function overlay(el) {
    if (box) { if (el && box.parentNode !== el) el.appendChild(box); return box; }
    box = document.createElement('div'); box.id = 'g3d'; box.hidden = true;
    box.innerHTML = `<div id="g3dView"></div>
      <div class="g3d-top"><span class="g3d-src"></span><span class="g3d-st small">Yuklanmoqda…</span></div>
      <div class="g3d-hz" hidden></div><div class="g3d-pop" hidden></div>`;
    (el || document.getElementById('map3d')).appendChild(box);
    box.querySelector('.g3d-src').addEventListener('click', e => { const b = e.target.closest('[data-src]'); if (!b) return; if (b.dataset.src === 'schema') hide(true); else setSource(b.dataset.src).catch(err => status('⚠️ ' + err.message)); });
    box.querySelector('.g3d-pop').addEventListener('click', e => { if (e.target.closest('.g3d-pop-x')) hidePop(); });
    return box;
  }
  const status = t => { if (!box) return; const e = box.querySelector('.g3d-st'); e.textContent = t || ''; e.hidden = !t; };
  function srcButtons() {
    if (!box) return;
    const can = { google: !!(gkey() || ion()), osm: !!ion(), schema: true };
    box.querySelector('.g3d-src').innerHTML = [['google', '📸 Fotoreal'], ['osm', '🏙 OSM binolar'], ['schema', '🧊 Sxema']].filter(x => can[x[0]]).map(x => `<button type="button" data-src="${x[0]}" class="${src === x[0] ? 'on' : ''}">${x[1]}</button>`).join('');
  }
  // Kamera: markaz (lat, lon) atrofida, MapLibre zoom’iga mos masofa
  function look(lat, lon, range, heading, pitch, instant) {
    if (!viewer) return;
    const C = window.Cesium, c = C.Cartesian3.fromDegrees(lon, lat, 700);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(c, 40), { offset: new C.HeadingPitchRange(C.Math.toRadians(heading == null ? 20 : heading), C.Math.toRadians(pitch == null ? -38 : pitch), range), duration: instant ? 0 : 1.6 });
  }
  const zoomRange = z => Math.max(180, Math.min(9000, 156543 * 0.77 / Math.pow(2, z) * 900));   // MapLibre zoom → kamera masofasi (m)

  async function setSource(want) {
    const C = window.Cesium;
    if (!viewer) return;
    if (want === 'google') {
      try {
        if (!tiles) {
          status('Fotoreal 3D plitalar yuklanmoqda…');
          C.GoogleMaps.defaultApiKey = gkey() || undefined;    // kalit boʻlmasa — Cesium ion orqali
          tiles = await C.createGooglePhotorealistic3DTileset(undefined, { maximumScreenSpaceError: 12 });
          tiles.tileFailed.addEventListener(e => status('Plita yuklanmadi: ' + ((e && e.message) || 'kalitni tekshiring')));
          viewer.scene.primitives.add(tiles);
        }
        tiles.show = true; if (osm) osm.show = false;
        viewer.scene.globe.show = false;
        src = 'google'; srcButtons(); redraw();
        status('');
        return;
      } catch (e) {
        console.warn('Google 3D: ' + ((e && (e.statusCode || e.message)) || '') + ' ' + ((e && e.response) || ''), e);
        if (ion()) { status('Fotoreal ochilmadi (ion’da “Google Photorealistic 3D Tiles” My Assets’ga qoʻshilmagan boʻlishi mumkin) — OSM binolari.'); return setSource('osm'); }
        throw e;
      }
    }
    status('OSM binolari va relyef yuklanmoqda…');
    if (!osm) {
      viewer.scene.setTerrain(C.Terrain.fromWorldTerrain());
      osm = await C.createOsmBuildingsAsync({
        style: new C.Cesium3DTileStyle({ color: { conditions: [["${feature['cesium#estimatedHeight']} >= 30", "color('#fbbf24', 0.95)"], ["${feature['cesium#estimatedHeight']} >= 15", "color('#5eead4', 0.92)"], ['true', "color('#cbd5e1', 0.9)"]] } }),
      });
      viewer.scene.primitives.add(osm);
    }
    osm.show = true; if (tiles) tiles.show = false;
    viewer.scene.globe.show = true;
    src = 'osm'; srcButtons(); redraw();
    status('');
  }

  async function init() {
    status('3D shahar yuklanmoqda…');
    const C = await loadCesium();
    if (ion()) C.Ion.defaultAccessToken = ion();
    const imagery = ion() ? C.ImageryLayer.fromWorldImagery({ style: C.IonWorldImageryStyle.AERIAL }) : false;
    viewer = new C.Viewer('g3dView', { baseLayer: imagery, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, timeline: false, animation: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, requestRenderMode: true, maximumRenderTimeChange: Infinity });
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.clock.currentTime = C.JulianDate.now(); viewer.clock.shouldAnimate = false;   // quyosh — hozirgi vaqt
    viewer.shadows = true; viewer.shadowMap.softShadows = true; viewer.shadowMap.size = 2048;
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    const h = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    h.setInputAction(m => {
      if (drawSt) { const ll = pickLL(m.position); if (ll) { drawSt.pts.push(ll); drawTmp(); } return; }
      const p = viewer.scene.pick(m.position), a = p && p.id && p.id.nxItem;
      if (a) showPop(a, m.position); else hidePop();
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    h.setInputAction(() => { if (drawSt) drawFinish(); }, C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    viewer.camera.changed.addEventListener(hidePop);
    await setSource(gkey() || ion() ? 'google' : 'osm');
  }
  // 3D egizak boʻlimi ochilganda: token boʻlsa va foydalanuvchi “Sxema”ni tanlamagan boʻlsa — fotoreal
  function autoEmbed(el) { host = el || host; if (available() && pref() && !failed) embed(); }
  let initP = null, embedding = false;
  const btnSync = () => { const b = document.querySelector('[data-act=g3d]'); if (b) { b.classList.toggle('primary', !box.hidden); b.textContent = box.hidden ? '📸 Fotoreal 3D' : '🧊 Sxematik 3D'; } if (box.parentNode) box.parentNode.classList.toggle('g3d-on', !box.hidden); };
  async function embed() {
    overlay(host).hidden = false; btnSync();
    if (embedding) return;                       // 3D boʻlimi qayta chizilganda bir necha marta chaqiriladi — bitta yuklash
    NX.store.set('g3d:on', true);
    embedding = true;
    try {
      if (!viewer || initP) {
        if (!initP) initP = init();
        await initP;
        const m = NX.map3d.map && NX.map3d.map(), c = m && m.getCenter();
        if (D.hz) fitHz(); else if (c) look(c.lat, c.lng, zoomRange(m.getZoom()), m.getBearing(), -38, true); else look(39.6547, 66.9757, 650, 200, -28, true);
      } else { viewer.resize(); redraw(); }
    } catch (e) {
      failed = true;
      const code = e && (e.statusCode || (e.response && e.response.status)), msg = (e && (e.message || '')) || '';
      status('⚠️ ' + (code === 401 || /token/i.test(msg) ? 'Cesium ion tokeni ishlamadi — Sozlamalarda tekshiring.' : code === 400 || code === 403 ? 'Google kaliti ishlamadi — Map Tiles API va kalit cheklovlarini tekshiring.' : 'Fotoreal 3D ochilmadi' + (msg ? ': ' + msg : '')) + ' Sxematik 3D koʻrsatiladi.');
      console.warn('Fotoreal 3D:', e);
      setTimeout(() => hide(false), 5000);
    } finally { embedding = false; initP = null; }
  }
  // Sxemaga qaytish: MapLibre kamerasi fotoreal kamerasi joyiga oʻtadi
  function hide(user) {
    if (user) NX.store.set('g3d:on', false);
    hidePop(); if (drawSt) drawStop();
    if (viewer && box && !box.hidden) {
      try {
        const C = window.Cesium, r = viewer.camera.pickEllipsoid(new C.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2));
        const m = NX.map3d.map && NX.map3d.map();
        if (r && m) { const g = C.Cartographic.fromCartesian(r); m.jumpTo({ center: [C.Math.toDegrees(g.longitude), C.Math.toDegrees(g.latitude)], bearing: C.Math.toDegrees(viewer.camera.heading) }); }
      } catch (e) { /* */ }
    }
    if (box) { box.hidden = true; btnSync(); }
  }
  function toggle() { failed = false; if (active()) hide(true); else embed(); }
  const active = () => !!(box && !box.hidden && viewer);
  const available = () => !!(gkey() || ion());

  // ---------- Natijalar (map3d.js koʻprigi orqali) ----------
  const col = (c, a) => window.Cesium.Color.fromCssColorString(c || '#7c3aed').withAlpha(a == null ? 1 : a);
  function pinImage(text, color) {
    const c = document.createElement('canvas'), s = 2, w = Math.max(30, 12 + String(text).length * 9);
    c.width = w * s; c.height = 40 * s; const g = c.getContext('2d'); g.scale(s, s);
    g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(1, 1, w - 2, 26, 13); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 6, 26); g.lineTo(w / 2, 38); g.lineTo(w / 2 + 6, 26); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.font = '700 13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 14);
    return c;
  }
  function redraw() {
    if (!viewer) return;
    const C = window.Cesium, cls = C.ClassificationType.BOTH, CLAMP = C.HeightReference.CLAMP_TO_GROUND, INF = Number.POSITIVE_INFINITY;
    viewer.entities.removeAll();
    hzPrims.forEach(p => viewer.scene.primitives.remove(p)); hzPrims = [];
    const ground = inst => { if (!inst.length) return; const gp = new C.GroundPrimitive({ geometryInstances: inst, appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true }), classificationType: cls }); viewer.scene.primitives.add(gp); hzPrims.push(gp); };
    // Suv toshqini: koʻchalardagi suv — chuqurlikka qarab rang va kenglik (2D model natijasi)
    if (D.mode === 'flood' && D.scen && D.scen.mode === 'street' && D.scen.segs) {
      const inst = [];
      D.scen.segs.forEach(sg => {
        if (!sg.c || sg.c.length < 2 || sg.d < 0.02) return;
        const lat = sg.c[0][1], hw = Math.min(12, (sg.w || 8) * 0.5 + Math.min(2, sg.d * 3)), dLat = 0, k = 111320 * Math.cos(lat * Math.PI / 180);
        const [a, b] = sg.c, dx = (b[0] - a[0]) * k, dy = (b[1] - a[1]) * 111320, L = Math.hypot(dx, dy); if (L < 1) return;
        const nx = -dy / L * hw / k, ny = dx / L * hw / 111320 + dLat;
        inst.push(new C.GeometryInstance({ geometry: new C.PolygonGeometry({ polygonHierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray([a[0] + nx, a[1] + ny, b[0] + nx, b[1] + ny, b[0] - nx, b[1] - ny, a[0] - nx, a[1] - ny])) }), attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(col(sg.d >= 0.6 ? '#1e3a8a' : sg.d >= 0.3 ? '#2563eb' : '#60a5fa', 0.78)) } }));
      });
      ground(inst);
    }
    // Rejadagi yangi bino (aytilgan balandlikda) va qishki soya
    const P = D.plan;
    if (P && P.planned && P.planned.ring) {
      if (D.mode === 'plan') (P.list || []).filter(x => x.ring && /^Qish/.test(x.label || '')).forEach(x => viewer.entities.add({ polygon: { hierarchy: C.Cartesian3.fromDegreesArray(x.ring.flat()), material: col('#0f172a', 0.45), classificationType: cls } }));
      viewer.entities.add({ polygon: { hierarchy: C.Cartesian3.fromDegreesArray(P.planned.ring.flat()), heightReference: C.HeightReference.RELATIVE_TO_GROUND, height: 0, extrudedHeightReference: C.HeightReference.RELATIVE_TO_GROUND, extrudedHeight: P.planned.height, material: col('#f59e0b', 0.85), outline: true, outlineColor: col('#fff7ed') } });
    }
    // Belgilangan hudud
    if (D.area && D.area.length >= 3) {
      const pos = C.Cartesian3.fromDegreesArray(D.area.flatMap(p => [p[1], p[0]]));
      viewer.entities.add({ polygon: { hierarchy: pos, material: col('#a855f7', 0.18), classificationType: cls } });
      viewer.entities.add({ polyline: { positions: pos.concat([pos[0]]), width: 4, material: new C.PolylineDashMaterialProperty({ color: col('#c084fc') }), clampToGround: true } });
    }
    // Tahlil natijasi: zonalar, yoʻllar, belgilar
    const items = D.hz || [], inst = [];
    items.forEach((a, i) => {
      if (a.kind === 'zone' && a.cells && a.cells.length) {
        const dLat = 20 / 111320, dLon = 20 / (111320 * Math.cos(a.lat * Math.PI / 180));
        a.cells.forEach(c => inst.push(new C.GeometryInstance({ geometry: new C.RectangleGeometry({ rectangle: C.Rectangle.fromDegrees(c[1] - dLon, c[0] - dLat, c[1] + dLon, c[0] + dLat) }), attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(col(a.color, 0.3 + 0.45 * c[2])) } })));
      } else if (a.kind === 'zone' && a.ring) {
        viewer.entities.add({ polygon: { hierarchy: C.Cartesian3.fromDegreesArray(a.ring.flatMap(p => [p[1], p[0]])), material: col(a.color, 0.35), classificationType: cls } });
      } else if (a.kind === 'line') {
        const st = a.style === 'blocked' ? 'blocked' : a.dash ? 'alt' : a.style === 'seg' ? 'seg' : 'route';
        (a.paths || [a.path || [a.from, a.to]]).forEach(pp => {
          if (!pp || pp.length < 2 || !pp[0] || !pp[pp.length - 1]) return;
          const material = st === 'blocked' ? new C.PolylineDashMaterialProperty({ color: col('#ef4444'), gapColor: col('#111827', 0.6), dashLength: 18 })
            : st === 'alt' ? new C.PolylineDashMaterialProperty({ color: col(a.color, 0.9), dashLength: 14 })
              : new C.PolylineGlowMaterialProperty({ color: col(a.color || '#16a34a'), glowPower: 0.25, taperPower: 1 });
          viewer.entities.add({ polyline: { positions: C.Cartesian3.fromDegreesArray(pp.flatMap(p => [p[1], p[0]])), width: st === 'seg' ? 6 + 6 * (a.w != null ? a.w : 1) : st === 'route' ? 9 : 7, material, clampToGround: true, classificationType: cls } });
        });
        if (a.path && a.path.length > 1 && st === 'route' && items.length <= 60) {
          const p0 = a.path[0], p1 = a.path[a.path.length - 1];
          viewer.entities.add({ position: C.Cartesian3.fromDegrees(p0[1], p0[0]), point: { pixelSize: 9, color: col('#ffffff'), outlineColor: col(a.color), outlineWidth: 3, heightReference: CLAMP, disableDepthTestDistance: INF } });
          viewer.entities.add({ position: C.Cartesian3.fromDegrees(p1[1], p1[0]), label: { text: '🏁', font: '20px sans-serif', heightReference: CLAMP, verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: INF } });
        }
      }
      if (a.kind === 'line' || a.kind === 'water' || a.lat == null) return;
      const e = a.list === false || a.dash
        ? viewer.entities.add({ position: C.Cartesian3.fromDegrees(a.lon, a.lat), point: { pixelSize: 8, color: col(a.color || '#f59e0b'), outlineColor: col('#fff7ed'), outlineWidth: 1.5, heightReference: CLAMP, disableDepthTestDistance: INF } })
        : viewer.entities.add({ position: C.Cartesian3.fromDegrees(a.lon, a.lat), billboard: { image: pinImage(a.id || String(i + 1), a.color || '#7c3aed'), scale: 0.5, verticalOrigin: C.VerticalOrigin.BOTTOM, heightReference: CLAMP, disableDepthTestDistance: INF } });
      e.nxItem = a;
    });
    ground(inst);
    // Sunʼiy yoʻldosh qatlami (issiqlik/yashillik) — yer sirtida (OSM rejimida toʻliq; fotorealda belgilar bilan)
    if (ovLayer) { viewer.imageryLayers.remove(ovLayer, true); ovLayer = null; }
    if (D.ov && src === 'osm') { const [w, s, e, n] = D.ov.bbox; ovLayer = viewer.imageryLayers.addImageryProvider(new C.SingleTileImageryProvider({ url: D.ov.url, rectangle: C.Rectangle.fromDegrees(w, s, e, n), tileWidth: 256, tileHeight: 256 })); ovLayer.alpha = 0.72; }
    const leg = box && box.querySelector('.g3d-hz');
    if (leg) {
      const n = items.filter(a => a.kind !== 'water').length;
      leg.innerHTML = n ? `<b>Natija real shahar ustida</b><span class="small">${n} ta obyekt · belgini bosing — surat va panorama${D.ov && src !== 'osm' ? ' · issiqlik xaritasi — “🏙 OSM binolar”da' : ''}</span>` : '';
      leg.hidden = !n;
    }
    viewer.scene.requestRender();
  }
  function fitPts(pts) {
    if (!viewer || !pts.length) return;
    let s = 90, w = 180, n = -90, e = -180; pts.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
    look((s + n) / 2, (w + e) / 2, Math.max(260, Math.hypot((n - s) * 111320, (e - w) * 85000) * 0.95), 20, -40);
  }
  function fitHz() { const pts = []; (D.hz || []).forEach(a => { if (a.lat != null) pts.push([a.lat, a.lon]); (a.path || []).forEach(p => p && pts.push(p)); }); fitPts(pts); }

  // Koʻprik (map3d.js): maʼlumot doim saqlanadi, fotoreal ochiq boʻlsa — chiziladi
  const live = () => { if (active()) redraw(); };
  function setHazard(list) { D.hz = list && list.length ? list : null; live(); }
  function set(d) { if (!d) return; if ('scen' in d) D.scen = d.scen; if ('plan' in d) D.plan = d.plan; if ('scen' in d || 'plan' in d) live(); }
  function setMode(m) { D.mode = m; live(); }
  function showArea(poly) { D.area = poly && poly.length ? poly : null; live(); }
  function setOverlay(url, bbox) { D.ov = url ? { url, bbox } : null; live(); }
  function fitTo(pts) { if (pts && pts.length) fitPts(pts); }
  function flyTo(lat, lon, z) { look(lat, lon, zoomRange(z || 17)); }

  // ---------- 3D sirtda hudud chizish ----------
  function pickLL(pos) {
    const C = window.Cesium;
    let c = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(pos) : null;
    if (!c) c = viewer.camera.pickEllipsoid(pos);
    if (!c) return null;
    const g = C.Cartographic.fromCartesian(c);
    return [C.Math.toDegrees(g.latitude), C.Math.toDegrees(g.longitude)];
  }
  function drawTmp() {
    const C = window.Cesium;
    drawSt.ents.forEach(e => viewer.entities.remove(e)); drawSt.ents = [];
    const pts = drawSt.pts;
    pts.forEach(p => drawSt.ents.push(viewer.entities.add({ position: C.Cartesian3.fromDegrees(p[1], p[0]), point: { pixelSize: 10, color: col('#f5d0fe'), outlineColor: col('#7e22ce'), outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } })));
    if (pts.length >= 2) drawSt.ents.push(viewer.entities.add({ polyline: { positions: C.Cartesian3.fromDegreesArray(pts.flatMap(p => [p[1], p[0]])), width: 4, material: col('#c084fc'), clampToGround: true } }));
    viewer.scene.requestRender();
  }
  function drawPoly(done) {
    if (!viewer) return;
    if (drawSt) drawStop();
    const bar = document.createElement('div'); bar.className = 'draw3d-bar';
    bar.innerHTML = '<span>✏️ Hudud chegarasini bosib-bosib belgilang (kamida 3 nuqta)</span><button type="button" data-d="ok" class="primary">✓ Tayyor</button><button type="button" data-d="undo">↶</button><button type="button" data-d="x">✕</button>';
    box.appendChild(bar);
    bar.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; if (b.dataset.d === 'ok') drawFinish(); if (b.dataset.d === 'undo') { drawSt.pts.pop(); drawTmp(); } if (b.dataset.d === 'x') drawStop(); });
    viewer.canvas.style.cursor = 'crosshair';
    drawSt = { pts: [], ents: [], bar, done };
  }
  function drawFinish() { if (!drawSt || drawSt.pts.length < 3) return; const poly = drawSt.pts.slice(), done = drawSt.done; drawStop(); D.area = poly; redraw(); done && done(poly); }
  function drawStop() { if (!drawSt) return; drawSt.ents.forEach(e => viewer.entities.remove(e)); drawSt.bar.remove(); viewer.canvas.style.cursor = ''; drawSt = null; viewer.scene.requestRender(); }

  function showPop(a, pos) {
    const el = box.querySelector('.g3d-pop');
    el.innerHTML = `<button type="button" class="g3d-pop-x" aria-label="Yopish">✕</button>${NX.place ? NX.place.html(a) : `<b>${NX.esc(a.title)}</b>`}`;
    el.style.left = Math.max(8, Math.min(pos.x + 14, box.clientWidth - 340)) + 'px'; el.style.top = Math.max(60, Math.min(pos.y - 40, box.clientHeight - 420)) + 'px';
    el.hidden = false;
  }
  function hidePop() { const el = box && box.querySelector('.g3d-pop'); if (el && !el.hidden) el.hidden = true; }

  NX.g3d = { _dbg: () => ({ viewer, tiles, osm }), available, active, autoEmbed, embed, hide, toggle, setHazard, set, setMode, showArea, setOverlay, fitTo, flyTo, drawPoly };
})();
