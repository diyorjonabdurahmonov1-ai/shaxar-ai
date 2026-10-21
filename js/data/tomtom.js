/* City Jam — TomTom Traffic Flow: koʻchadagi joriy tezlik va erkin oqim tezligi */
(function () {
  'use strict';
  const NX = window.NX;
  const LATEST_KEY = 'tt:latest';

  const key = () => (NX.store.get('key:tomtom', '') || '').trim();

  function errText(r) {
    if (r.status === 403 || r.status === 401) return 'TomTom kaliti notoʻgʻri yoki Traffic API uchun ruxsat berilmagan.';
    if (r.status === 429) return 'TomTom soʻrovlar limiti tugadi. Birozdan keyin urinib koʻring.';
    if (r.status === 400) return 'Bu nuqtada TomTom yoʻl maʼlumoti topilmadi.';
    return 'TomTom xatosi: HTTP ' + r.status;
  }

  async function measurePoint(lat, lon, k) {
    const url = `${NX.config.tomtomUrl}?point=${lat.toFixed(6)},${lon.toFixed(6)}&unit=KMPH&openLr=false&key=${encodeURIComponent(k)}`;
    let r;
    try { r = await NX.fetchJSON(url, {}, NX.config.tomtomTimeoutMs); } catch (e) {
      throw new Error(e.timeout ? 'TomTom javob bermadi (vaqt tugadi).' : 'TomTom serveriga ulanib boʻlmadi. Internetni tekshiring.');
    }
    if (!r.ok || !r.data || !r.data.flowSegmentData) { const e = new Error(errText(r)); e.status = r.status; throw e; }
    const f = r.data.flowSegmentData;
    const c0 = f.coordinates && f.coordinates.coordinate && f.coordinates.coordinate[0];
    return {
      cs: f.currentSpeed, ff: f.freeFlowSpeed, conf: f.confidence, closed: !!f.roadClosure, frc: f.frc,
      seg: c0 ? `${f.frc}:${c0.latitude.toFixed(5)},${c0.longitude.toFixed(5)}` : `${lat},${lon}`,
    };
  }

  // Koʻchaning eng uzun boʻlaklari oʻrtasidan 1–3 nuqta oʻlchanadi
  async function measureStreet(street, model) {
    const k = key();
    if (!k) { const e = new Error('TomTom kaliti kiritilmagan. Sozlamalarda kalitni kiriting.'); e.noKey = true; throw e; }
    const ways = street.ways.map(i => model.ways[i]).sort((a, b) => b.len - a.len);
    const pts = [];
    if (ways.length === 1 && ways[0].len > 600) [0.25, 0.5, 0.75].forEach(f => pts.push(NX.geo.pointAlong(ways[0].xy, f)));
    else ways.slice(0, 3).forEach(w => pts.push(NX.geo.pointAlong(w.xy, 0.5)));

    const seen = new Set(), res = [];
    let lastErr = null;
    for (const p of pts) {
      const [lat, lon] = NX.geo.ll(p[0], p[1]);
      try {
        const m = await measurePoint(lat, lon, k);
        if (seen.has(m.seg)) continue;
        seen.add(m.seg); res.push(m);
      } catch (e) {
        lastErr = e;
        if (e.status === 403 || e.status === 401 || e.status === 429) throw e;
      }
    }
    if (!res.length) throw lastErr || new Error('TomTom maʼlumot qaytarmadi.');
    const cs = res.reduce((s, m) => s + m.cs, 0) / res.length;
    const ff = res.reduce((s, m) => s + m.ff, 0) / res.length;
    const meas = {
      ts: Date.now(), currentSpeed: cs, freeFlowSpeed: ff,
      congestion: ff > 0 ? Math.max(0, (1 - cs / ff) * 100) : 0,
      confidence: res.reduce((s, m) => s + (m.conf || 0), 0) / res.length,
      closed: res.some(m => m.closed), points: res.length,
    };
    const all = NX.store.get(LATEST_KEY, {});
    all[street.key] = meas;
    NX.store.set(LATEST_KEY, all);
    NX.forecast.addSample(street.key, cs, ff, new Date(meas.ts));
    return meas;
  }

  NX.tomtom = { key, measureStreet, latest: () => NX.store.get(LATEST_KEY, {}), clear: () => NX.store.del(LATEST_KEY) };
})();
