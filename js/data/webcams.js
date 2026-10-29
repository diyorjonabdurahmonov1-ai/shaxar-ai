/* City Jam — ochiq vebkameralar (Windy.com katalogi, Worker orqali; Windy kaliti Worker’da yashirin).
   Faqat egalari hammaga eʼlon qilgan kameralar. Windy shartlari: har bir rasm yonida Windy.com havolasi. */
(function () {
  'use strict';
  const NX = window.NX;
  const base = () => ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim().replace(/\/+$/, '');
  let list = null;
  // mode: '' — Samarqand atrofi; 'uz' — butun Oʻzbekiston (test); 'fi' — Finlyandiya yoʻl kameralari (test, ochiq maʼlumot)
  async function load(r, mode) {
    if (!base()) throw new Error('Sayt serveri (Worker) ulanmagan.');
    const [la, lo] = NX.config.center;
    const res = await NX.fetchJSON(`${base()}/webcams?lat=${la}&lon=${lo}&r=${r || 60}${mode ? '&mode=' + mode : ''}`, {}, 25000);
    if (!res.ok || !res.data || !Array.isArray(res.data.items)) {
      const e = res.data && res.data.error;
      throw new Error(e && e.code === 'no_windy_key' ? 'Windy kaliti Worker’ga qoʻyilmagan (WINDY_KEY).' : res.status === 404 || res.status === 405 ? 'Worker eski — yangi versiyani qoʻyish kerak.' : 'Vebkameralar olinmadi: ' + ((e && e.message) || 'HTTP ' + res.status));
    }
    if (mode) return res.data.items.map(c => Object.assign({ test: true, src: res.data.source }, c));   // test roʻyxati xaritaga qoʻshilmaydi
    list = res.data.items;
    return list;
  }
  // Xarita qatlami (Tizimlar → kameralar bilan bir xil koʻrinishda)
  const geo = () => ({ type: 'FeatureCollection', features: (list || []).map(c => ({ type: 'Feature', properties: { name: c.title, url: c.detail, manba: 'Windy.com (ochiq vebkamera)', yangilangan: c.updated ? new Date(c.updated).toLocaleString('uz-UZ') : '' }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) });
  NX.webcams = { load, get: () => list, geo };
})();
