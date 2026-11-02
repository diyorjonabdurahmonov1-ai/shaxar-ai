/* City Jam — Fotoreal 3D egizak (CesiumJS): real binolar, daraxtlar, ranglar + saytning tahlil natijalari ustida.
   Manba (kalitga qarab):
   • Cesium ion tokeni (bepul hisob, ion.cesium.com) — “Google Photorealistic 3D Tiles” (ion Asset Depot’dan “My Assets”ga qoʻshilgan boʻlsa)
     yoki zaxira: Cesium OSM Buildings + Cesium World Terrain + sunʼiy yoʻldosh fon.
   • Google Maps API kaliti (Map Tiles API) — Google 3D toʻgʻridan-toʻgʻri.
   Natijalar (xavf zonalari, evakuatsiya/qutqaruv yoʻllari, toʻsiladigan koʻchalar, belgilar) 3D sirt ustiga “yopishtirib” chiziladi;
   belgini bossangiz — izoh, real surat va panorama (NX.place.html).
   ToS: Google 3D plitalari faqat KOʻRSATILADI — undan bino/geometriya ajratib olinmaydi, keshlanmaydi. Atributsiya Cesium tomonidan koʻrsatiladi.
   Kalitlar — faqat shu brauzerda (Sozlamalar) yoki keys.js da (sayt manziliga cheklangan brauzer kaliti/tokeni). */
(function () {
  'use strict';
  const NX = window.NX;
  const VER = '1.123.0', BASE = `https://cdn.jsdelivr.net/npm/cesium@${VER}/Build/Cesium/`;
  const K = window.CITYJAM_KEYS || {};
  const gkey = () => (NX.store.get('key:google3d', '') || K.google3d || '').trim();
  const ion = () => (NX.store.get('key:cesiumIon', '') || K.cesiumIon || '').trim();
  const SPOTS = [
    { n: 'Registon', c: [39.6547, 66.9757], h: 200, p: -28, r: 650 },
    { n: 'Bibixonim', c: [39.6606, 66.9794], h: 120, p: -30, r: 500 },
    { n: 'Shohi Zinda', c: [39.6628, 66.9880], h: 330, p: -32, r: 450 },
    { n: 'Goʻri Amir', c: [39.6485, 66.9690], h: 160, p: -30, r: 420 },
    { n: 'Siyob bozori', c: [39.6620, 66.9818], h: 60, p: -32, r: 500 },
    { n: 'Shahar', c: [39.6542, 66.9597], h: 30, p: -35, r: 4200 },
  ];
  let viewer = null, loading = null, box = null, src = '', tiles = null, osm = null, hzItems = null, hzPrims = [], pop = null;

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
  function overlay() {
    if (box) return box;
    box = document.createElement('div'); box.id = 'g3d'; box.hidden = true;
    box.innerHTML = `<div id="g3dView"></div>
      <div class="g3d-top"><b>🌐 Fotoreal 3D egizak</b><span class="g3d-src"></span><span class="g3d-st small">Yuklanmoqda…</span><button type="button" class="g3d-x" aria-label="Yopish">✕ Yopish</button></div>
      <div class="g3d-spots">${SPOTS.map((s, i) => `<button type="button" data-i="${i}">${NX.esc(s.n)}</button>`).join('')}</div>
      <div class="g3d-hz" hidden></div><div class="g3d-pop" hidden></div>`;
    document.querySelector('.map-wrap').appendChild(box);
    box.querySelector('.g3d-x').onclick = close;
    box.querySelector('.g3d-spots').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) fly(SPOTS[+b.dataset.i]); });
    box.querySelector('.g3d-src').addEventListener('click', e => { const b = e.target.closest('[data-src]'); if (b) setSource(b.dataset.src); });
    box.querySelector('.g3d-pop').addEventListener('click', e => { if (e.target.closest('.g3d-pop-x')) hidePop(); });
    return box;
  }
  const status = t => { if (box) box.querySelector('.g3d-st').textContent = t; };
  function fly(sp, instant) {
    if (!viewer) return;
    const C = window.Cesium, center = C.Cartesian3.fromDegrees(sp.c[1], sp.c[0], 720);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(center, 60), { offset: new C.HeadingPitchRange(C.Math.toRadians(sp.h), C.Math.toRadians(sp.p), sp.r), duration: instant ? 0 : 3 });
  }
  function srcButtons() {
    if (!box) return;
    const can = { google: !!(gkey() || ion()), osm: !!ion() };
    box.querySelector('.g3d-src').innerHTML = [['google', '📸 Fotoreal'], ['osm', '🏙 OSM binolar']].filter(x => can[x[0]]).map(x => `<button type="button" data-src="${x[0]}" class="${src === x[0] ? 'on' : ''}">${x[1]}</button>`).join('');
  }

  // Manba: Google fotoreal (ion yoki Google kaliti) yoki Cesium OSM Buildings (ion)
  async function setSource(want) {
    const C = window.Cesium;
    if (!viewer) return;
    if (want === 'google') {
      try {
        if (!tiles) {
          status('Google fotoreal 3D plitalari yuklanmoqda…');
          // Google kaliti boʻlsa — toʻgʻridan-toʻgʻri; boʻlmasa Cesium ion (asset 2275207) orqali
          C.GoogleMaps.defaultApiKey = gkey() || undefined;
          tiles = await C.createGooglePhotorealistic3DTileset(undefined, { maximumScreenSpaceError: 12 });
          tiles.tileFailed.addEventListener(e => status('Plita yuklanmadi: ' + ((e && e.message) || 'kalitni tekshiring')));
          viewer.scene.primitives.add(tiles);
        }
        tiles.show = true; if (osm) osm.show = false;
        viewer.scene.globe.show = false;
        src = 'google'; srcButtons(); redraw();
        status('Real 3D model — sichqoncha bilan aylantiring, gʻildirak bilan yaqinlashtiring');
        return;
      } catch (e) {
        console.warn('Google 3D:', e);
        if (ion()) { status('⚠️ Google 3D ochilmadi (ion’da “Google Photorealistic 3D Tiles” My Assets’ga qoʻshilmagan boʻlishi mumkin) — OSM binolarga oʻtildi.'); return setSource('osm'); }
        throw e;
      }
    }
    status('Cesium OSM binolari va relyef yuklanmoqda…');
    if (!osm) {
      viewer.scene.setTerrain(C.Terrain.fromWorldTerrain());
      osm = await C.createOsmBuildingsAsync({
        style: new C.Cesium3DTileStyle({
          // “Raqamli egizak” uslubi: balandlikka qarab rang (past — koʻkimtir, baland — oltin)
          color: { conditions: [["${feature['cesium#estimatedHeight']} >= 30", "color('#fbbf24', 0.95)"], ["${feature['cesium#estimatedHeight']} >= 15", "color('#5eead4', 0.92)"], ['true', "color('#cbd5e1', 0.9)"]] },
        }),
      });
      viewer.scene.primitives.add(osm);
    }
    osm.show = true; if (tiles) tiles.show = false;
    viewer.scene.globe.show = true;
    src = 'osm'; srcButtons(); redraw();
    status('Cesium OSM binolari + relyef (OpenStreetMap). Fotoreal uchun ion’da Google 3D ni yoqing.');
  }

  async function open() {
    overlay().hidden = false;
    if (viewer) { viewer.resize(); redraw(); return; }
    status('CesiumJS yuklanmoqda…');
    try {
      const C = await loadCesium();
      if (ion()) C.Ion.defaultAccessToken = ion();
      const imagery = ion() ? C.ImageryLayer.fromWorldImagery({ style: C.IonWorldImageryStyle.AERIAL }) : false;
      viewer = new C.Viewer('g3dView', { baseLayer: imagery, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, timeline: false, animation: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, requestRenderMode: true, maximumRenderTimeChange: Infinity });
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.globe.depthTestAgainstTerrain = true;
      // Quyosh real vaqtda (soyalar)
      viewer.clock.currentTime = C.JulianDate.now(); viewer.clock.shouldAnimate = false;
      viewer.shadows = true; viewer.shadowMap.softShadows = true; viewer.shadowMap.size = 2048;
      // Belgini bosish — oʻz popup’imiz (real surat, panorama)
      new C.ScreenSpaceEventHandler(viewer.scene.canvas).setInputAction(m => {
        const p = viewer.scene.pick(m.position), a = p && p.id && p.id.nxItem;
        if (a) showPop(a, m.position); else hidePop();
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      viewer.camera.changed.addEventListener(hidePop);
      await setSource(gkey() || ion() ? 'google' : 'osm');
      fly(SPOTS[0], true);
      if (hzItems) fitHz();
    } catch (e) {
      const code = e && (e.statusCode || (e.response && e.response.status)), msg = (e && (e.message || e.error || (typeof e.response === 'string' ? e.response : ''))) || '';
      status('⚠️ ' + (code === 401 || /ion|token/i.test(msg) ? 'Cesium ion tokeni ishlamadi — Sozlamalarda tokenni tekshiring.' : code === 400 || code === 403 || /403|key|API/i.test(msg) ? `Google kaliti ishlamadi (${code || 'xato'}) — Map Tiles API, billing va kalit cheklovlarini tekshiring.` : code === 404 ? 'Bu hudud uchun 3D model topilmadi.' : `Yuklab boʻlmadi${code ? ' (' + code + ')' : ''}${msg ? ': ' + msg : ''}.`));
      console.warn('Fotoreal 3D:', e);
    }
  }
  function close() { if (box) box.hidden = true; hidePop(); }

  // ---------- Tahlil natijasi 3D sirt ustida ----------
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
  function clearHz() {
    if (!viewer) return;
    viewer.entities.removeAll();
    hzPrims.forEach(p => viewer.scene.primitives.remove(p)); hzPrims = [];
  }
  function redraw() {
    if (!viewer) return;
    const C = window.Cesium;
    clearHz();
    const leg = box && box.querySelector('.g3d-hz');
    if (!hzItems || !hzItems.length) { if (leg) leg.hidden = true; viewer.scene.requestRender(); return; }
    const cls = C.ClassificationType.BOTH, inst = [];
    hzItems.forEach((a, i) => {
      // Zonalar: 40 m kataklar (xavf darajasi — shaffoflik) yoki halqa
      if (a.kind === 'zone' && a.cells && a.cells.length) {
        const dLat = 20 / 111320, dLon = 20 / (111320 * Math.cos(a.lat * Math.PI / 180));
        a.cells.forEach(c => inst.push(new C.GeometryInstance({ geometry: new C.RectangleGeometry({ rectangle: C.Rectangle.fromDegrees(c[1] - dLon, c[0] - dLat, c[1] + dLon, c[0] + dLat) }), attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(col(a.color, 0.3 + 0.45 * c[2])) } })));
      } else if (a.kind === 'zone' && a.ring) {
        viewer.entities.add({ polygon: { hierarchy: C.Cartesian3.fromDegreesArray(a.ring.flatMap(p => [p[1], p[0]])), material: col(a.color, 0.35), classificationType: cls } });
      } else if (a.kind === 'line') {
        const paths = a.paths || [a.path || [a.from, a.to]];
        const st = a.style === 'blocked' ? 'blocked' : a.dash ? 'alt' : a.style === 'seg' ? 'seg' : 'route';
        paths.forEach(pp => {
          if (!pp || pp.length < 2 || !pp[0]) return;
          const positions = C.Cartesian3.fromDegreesArray(pp.flatMap(p => [p[1], p[0]]));
          const width = st === 'seg' ? 6 + 6 * (a.w != null ? a.w : 1) : st === 'route' ? 9 : 7;
          const material = st === 'blocked' ? new C.PolylineDashMaterialProperty({ color: col('#ef4444'), gapColor: col('#111827', 0.6), dashLength: 18 })
            : st === 'alt' ? new C.PolylineDashMaterialProperty({ color: col(a.color, 0.9), dashLength: 14 })
              : new C.PolylineGlowMaterialProperty({ color: col(a.color || '#16a34a'), glowPower: 0.25, taperPower: 1 });
          viewer.entities.add({ polyline: { positions, width, material, clampToGround: true, classificationType: cls } });
        });
        // Yoʻl boshi (○) va oxiri (🏁) — yoʻnalish aniq boʻlsin
        if (a.path && a.path.length > 1 && st === 'route' && hzItems.length <= 60) {
          const p0 = a.path[0], p1 = a.path[a.path.length - 1];
          viewer.entities.add({ position: C.Cartesian3.fromDegrees(p0[1], p0[0]), point: { pixelSize: 9, color: col('#ffffff'), outlineColor: col(a.color), outlineWidth: 3, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
          viewer.entities.add({ position: C.Cartesian3.fromDegrees(p1[1], p1[0]), label: { text: '🏁', font: '20px sans-serif', heightReference: C.HeightReference.CLAMP_TO_GROUND, verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
        }
      }
      // Belgilar: joylar, zonalar markazi (raqamli), mayda nuqtalar
      if (a.kind === 'line' || a.kind === 'water' || a.lat == null) return;
      const e = a.list === false || a.dash
        ? viewer.entities.add({ position: C.Cartesian3.fromDegrees(a.lon, a.lat), point: { pixelSize: 8, color: col(a.color || '#f59e0b'), outlineColor: col('#fff7ed'), outlineWidth: 1.5, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } })
        : viewer.entities.add({ position: C.Cartesian3.fromDegrees(a.lon, a.lat), billboard: { image: pinImage(a.id || String(i + 1), a.color || '#7c3aed'), scale: 0.5, verticalOrigin: C.VerticalOrigin.BOTTOM, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
      e.nxItem = a;
    });
    if (inst.length) {
      const gp = new C.GroundPrimitive({ geometryInstances: inst, appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true }), classificationType: cls, asynchronous: true });
      viewer.scene.primitives.add(gp); hzPrims.push(gp);
    }
    if (leg) { const n = hzItems.filter(a => a.kind !== 'water').length; leg.innerHTML = `<b>Tahlil natijasi 3D da</b><span class="small">${n} ta obyekt · belgini bosing — real surat va panorama</span>`; leg.hidden = false; }
    viewer.scene.requestRender();
  }
  function fitHz() {
    if (!viewer || !hzItems) return;
    const pts = []; hzItems.forEach(a => { if (a.lat != null) pts.push([a.lat, a.lon]); (a.path || []).forEach(p => p && pts.push(p)); });
    if (!pts.length) return;
    let s = 90, w = 180, n = -90, e = -180; pts.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
    const C = window.Cesium, c = C.Cartesian3.fromDegrees((w + e) / 2, (s + n) / 2, 720), r = Math.max(250, Math.hypot((n - s) * 111320, (e - w) * 85000) * 0.9);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(c, 50), { offset: new C.HeadingPitchRange(C.Math.toRadians(20), C.Math.toRadians(-40), r), duration: 2 });
  }
  // Tahlil natijasini berish (app.js showHazard / hazardClear dan)
  function setHazard(items) { hzItems = items && items.length ? items : null; if (viewer && box && !box.hidden) { redraw(); if (hzItems) fitHz(); } }

  function showPop(a, pos) {
    const el = box.querySelector('.g3d-pop');
    el.innerHTML = `<button type="button" class="g3d-pop-x" aria-label="Yopish">✕</button>${NX.place ? NX.place.html(a) : `<b>${NX.esc(a.title)}</b>`}`;
    el.style.left = Math.min(pos.x + 14, box.clientWidth - 340) + 'px'; el.style.top = Math.max(60, Math.min(pos.y - 40, box.clientHeight - 420)) + 'px';
    el.hidden = false;
  }
  function hidePop() { const el = box && box.querySelector('.g3d-pop'); if (el && !el.hidden) el.hidden = true; }

  NX.g3d = { available: () => !!(gkey() || ion()), open, close, fly, setHazard, isOpen: () => !!(box && !box.hidden) };
})();
