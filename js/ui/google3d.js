/* City Jam — Google Photorealistic 3D Tiles (fotorealistik 3D shahar: real binolar, daraxtlar, ranglar).
   CesiumJS faqat tugma bosilganda yuklanadi. Kalit — foydalanuvchining Google Maps Platform kaliti (Map Tiles API),
   faqat shu brauzerda saqlanadi (Sozlamalar) yoki keys.js da (sayt manziliga cheklangan brauzer kaliti). Google atributsiyasi Cesium tomonidan koʻrsatiladi. */
(function () {
  'use strict';
  const NX = window.NX;
  const VER = '1.123.0', BASE = `https://cdn.jsdelivr.net/npm/cesium@${VER}/Build/Cesium/`;
  const key = () => (NX.store.get('key:google3d', '') || (window.CITYJAM_KEYS && window.CITYJAM_KEYS.google3d) || '').trim();
  const SPOTS = [
    { n: 'Registon', c: [39.6547, 66.9757], h: 200, p: -28, r: 650 },
    { n: 'Bibixonim', c: [39.6606, 66.9794], h: 120, p: -30, r: 500 },
    { n: 'Shohi Zinda', c: [39.6628, 66.9880], h: 330, p: -32, r: 450 },
    { n: 'Goʻri Amir', c: [39.6485, 66.9690], h: 160, p: -30, r: 420 },
    { n: 'Siyob bozori', c: [39.6620, 66.9818], h: 60, p: -32, r: 500 },
    { n: 'Shahar', c: [39.6542, 66.9597], h: 30, p: -35, r: 4200 },
  ];
  let viewer = null, loading = null, box = null;

  function loadCesium() {
    if (window.Cesium) return Promise.resolve(window.Cesium);
    if (loading) return loading;
    window.CESIUM_BASE_URL = BASE;
    loading = new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = BASE + 'Widgets/widgets.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = BASE + 'Cesium.js'; s.async = true;
      s.onload = () => (window.Cesium ? res(window.Cesium) : rej(new Error('Cesium yuklanmadi')));
      s.onerror = () => rej(new Error('Cesium kutubxonasi yuklanmadi (internet?)'));
      document.head.appendChild(s);
    });
    return loading;
  }
  function overlay() {
    if (box) return box;
    box = document.createElement('div'); box.id = 'g3d'; box.hidden = true;
    box.innerHTML = `<div id="g3dView"></div>
      <div class="g3d-top"><b>🌐 Google fotoreal 3D</b><span class="g3d-st small">Yuklanmoqda…</span><button type="button" class="g3d-x" aria-label="Yopish">✕ Yopish</button></div>
      <div class="g3d-spots">${SPOTS.map((s, i) => `<button type="button" data-i="${i}">${NX.esc(s.n)}</button>`).join('')}</div>`;
    document.querySelector('.map-wrap').appendChild(box);
    box.querySelector('.g3d-x').onclick = close;
    box.querySelector('.g3d-spots').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) fly(SPOTS[+b.dataset.i]); });
    return box;
  }
  const status = t => { if (box) box.querySelector('.g3d-st').textContent = t; };
  function fly(sp, instant) {
    if (!viewer) return;
    const C = window.Cesium, center = C.Cartesian3.fromDegrees(sp.c[1], sp.c[0], 720);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(center, 60), { offset: new C.HeadingPitchRange(C.Math.toRadians(sp.h), C.Math.toRadians(sp.p), sp.r), duration: instant ? 0 : 3 });
  }
  async function open() {
    overlay().hidden = false;
    if (viewer) { viewer.resize(); return; }
    status('CesiumJS yuklanmoqda…');
    try {
      const C = await loadCesium();
      C.GoogleMaps.defaultApiKey = key();
      viewer = new C.Viewer('g3dView', { baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, timeline: false, animation: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, requestRenderMode: true });
      viewer.scene.globe.show = false;
      viewer.scene.skyAtmosphere.show = true;
      status('Google 3D plitalari yuklanmoqda…');
      const ts = await C.createGooglePhotorealistic3DTileset();
      viewer.scene.primitives.add(ts);
      ts.tileFailed.addEventListener(e => { status('Plita yuklanmadi: ' + ((e && e.message) || 'kalit yoki Map Tiles API ni tekshiring')); });
      fly(SPOTS[0], true);
      status('Real 3D model (Google) — sichqoncha bilan aylantiring, gʻildirak bilan yaqinlashtiring');
    } catch (e) {
      const code = e && (e.statusCode || (e.response && e.response.status)), msg = (e && (e.message || e.error || (typeof e.response === 'string' ? e.response : ''))) || '';
      status('⚠️ ' + (code === 400 || code === 403 || /403|key|API/i.test(msg) ? `Google kaliti ishlamadi (${code || 'xato'}) — Google Cloud’da Map Tiles API yoqilganini, billing va kalit cheklovlarini (sayt manzili) tekshiring.` : code === 404 ? 'Bu hudud uchun Google 3D model topilmadi.' : `Yuklab boʻlmadi${code ? ' (' + code + ')' : ''}${msg ? ': ' + msg : ''}.`));
      console.warn('Google 3D:', e);
    }
  }
  function close() { if (box) box.hidden = true; }

  NX.g3d = { available: () => !!key(), open, close, fly };
})();
