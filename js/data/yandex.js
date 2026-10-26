/* City Jam — Yandex Xaritalar: real vaqt tirbandligi (Probkalar).
   Yandex shartlariga koʻra tirbandlik qatlami faqat Yandex’ning rasmiy JS API xaritasida koʻrsatiladi,
   shuning uchun u Leaflet ustida alohida qatlam-xarita sifatida ochiladi. */
(function () {
  'use strict';
  const NX = window.NX;
  let ymap = null, provider = null, loading = null, active = false, hl = null, h = {};

  const key = () => (NX.store.get('key:yandex', '') || (window.CITYJAM_KEYS && window.CITYJAM_KEYS.yandex) || '').trim();

  function load() {
    if (window.ymaps && window.ymaps.Map) return Promise.resolve(window.ymaps);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key())}&lang=ru_RU`;
      const t = setTimeout(() => { loading = null; reject(new Error('Yandex xaritasi javob bermadi.')); }, 20000);
      s.onload = () => {
        if (!window.ymaps) { clearTimeout(t); loading = null; reject(new Error('Yandex xaritasi yuklanmadi (kalitni tekshiring).')); return; }
        window.ymaps.ready(() => { clearTimeout(t); resolve(window.ymaps); });
      };
      s.onerror = () => { clearTimeout(t); loading = null; reject(new Error('Yandex xaritasi yuklanmadi. Internetni tekshiring.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function state() {
    if (!provider) return null;
    const st = provider.state;
    return { level: st.get('level'), localtime: st.get('localtime'), ts: Date.now() };
  }

  async function show(center, zoom, handlers) {
    h = handlers || {};
    active = true;
    document.getElementById('ymap').hidden = false;
    const ymaps = await load();
    if (!active) return;
    if (!ymap) {
      ymap = new ymaps.Map('ymap', { center, zoom, controls: ['zoomControl'] }, { suppressMapOpenBlock: true });
      provider = new ymaps.traffic.provider.Actual({}, { infoLayerShown: true });
      provider.setMap(ymap);
      ymap.events.add('click', e => { const c = e.get('coords'); if (h.onClick) h.onClick(c[0], c[1]); });
      provider.state.events.add('change', () => { if (h.onState) h.onState(state()); });
    } else {
      ymap.setCenter(center, zoom);
      if (ymap.container && ymap.container.fitToViewport) ymap.container.fitToViewport();
    }
    if (h.onState) h.onState(state());
  }

  function hide() {
    active = false;
    document.getElementById('ymap').hidden = true;
    return ymap ? { center: ymap.getCenter(), zoom: ymap.getZoom() } : null;
  }

  // Tanlangan koʻchani Yandex xaritasida ajratib koʻrsatish
  function highlight(lines) {
    if (!ymap || !window.ymaps) return;
    if (hl) { hl.forEach(p => ymap.geoObjects.remove(p)); hl = null; }
    if (!lines) return;
    hl = lines.map(ll => new window.ymaps.Polyline(ll, {}, { strokeColor: '#06b6d4', strokeWidth: 7, strokeOpacity: 0.85 }));
    hl.forEach(p => ymap.geoObjects.add(p));
  }

  NX.yandex = { key, show, hide, highlight, state, isActive: () => active };
})();
