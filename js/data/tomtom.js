/* City Jam — TomTom Traffic Flow: koʻchadagi joriy tezlik va erkin oqim tezligi */
(function () {
  'use strict';
  const NX = window.NX;
  const LATEST_KEY = 'tt:latest';

  // Foydalanuvchi kaliti ustun; boʻlmasa — sayt egasining umumiy kaliti (js/keys.js)
  const key = () => (NX.store.get('key:tomtom', '') || (window.CITYJAM_KEYS && window.CITYJAM_KEYS.tomtom) || '').trim();

  function errText(r) {
    if (r.status === 403 || r.status === 401) return 'TomTom kaliti notoʻgʻri yoki Traffic API uchun ruxsat berilmagan.';
    if (r.status === 429) return 'TomTom soʻrovlar limiti tugadi. Birozdan keyin urinib koʻring.';
    if (r.status === 400) return 'TomTom’da bu koʻcha boʻyicha maʼlumot yoʻq (Samarqandda TomTom qamrovi kam).';
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
      tt: f.currentTravelTime, ftt: f.freeFlowTravelTime,
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
      // Oʻlchangan boʻlaklardan oʻtishdagi qoʻshimcha vaqt (soniya)
      delay: res.reduce((t, m) => t + (m.tt != null && m.ftt != null ? Math.max(0, m.tt - m.ftt) : 0), 0),
    };
    const all = NX.store.get(LATEST_KEY, {});
    all[street.key] = meas;
    NX.store.set(LATEST_KEY, all);
    NX.forecast.addSample(street.key, cs, ff, new Date(meas.ts));
    return meas;
  }

  // Yoʻl hodisalari: avariya, taʼmir, yopiq yoʻl va h.k. (hozir amalda boʻlganlari)
  const INC = {
    0: ['Nomaʼlum hodisa', '⚠️'], 1: ['Avariya', '💥'], 2: ['Tuman', '🌫️'], 3: ['Xavfli holat', '⚠️'], 4: ['Yomgʻir', '🌧️'],
    5: ['Muzlagan yoʻl', '🧊'], 6: ['Tirbandlik', '🚗'], 7: ['Polosa yopilgan', '🚧'], 8: ['Yoʻl yopiq', '⛔'], 9: ['Yoʻl taʼmiri', '🚧'],
    10: ['Kuchli shamol', '💨'], 11: ['Suv bosgan', '🌊'], 14: ['Buzilgan mashina', '🚙'],
  };
  const MAG = { 0: '', 1: 'kichik kechikish', 2: 'oʻrtacha kechikish', 3: 'katta kechikish', 4: 'harakat toʻxtagan' };
  async function incidents() {
    const k = key();
    if (!k) return null;
    const b = NX.config.bbox;
    const fields = '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,length,delay}}}';
    const url = `${NX.config.tomtomIncidentsUrl}?key=${encodeURIComponent(k)}&bbox=${b.w},${b.s},${b.e},${b.n}&fields=${encodeURIComponent(fields)}&language=en-GB&timeValidityFilter=present`;
    let r;
    try { r = await NX.fetchJSON(url, {}, NX.config.tomtomTimeoutMs); } catch (e) { throw new Error('Yoʻl hodisalari yuklanmadi: internet aloqasini tekshiring.'); }
    if (!r.ok || !r.data) { const e = new Error(errText(r)); e.status = r.status; throw e; }
    return (r.data.incidents || []).map((it, i) => {
      const p = it.properties || {}, g = it.geometry || {};
      const pts = g.type === 'Point' ? [g.coordinates] : g.type === 'LineString' ? g.coordinates : [];
      const mid = pts[Math.floor(pts.length / 2)] || null;
      const [name, icon] = INC[p.iconCategory] || INC[0];
      return {
        id: 'inc' + i, cat: p.iconCategory, name, icon, mag: p.magnitudeOfDelay, magText: MAG[p.magnitudeOfDelay] || '',
        from: p.from || '', to: p.to || '', delay: p.delay || 0, length: p.length || 0, start: p.startTime || null, end: p.endTime || null,
        lat: mid ? mid[1] : null, lon: mid ? mid[0] : null, line: pts.map(c => [c[1], c[0]]),
      };
    }).filter(x => x.lat != null);
  }
  const flowTileUrl = () => (key() ? `${NX.config.tomtomFlowTiles}?key=${encodeURIComponent(key())}&tileSize=256&t=${Math.floor(Date.now() / 120000)}` : null);

  NX.tomtom = {
    incidents, flowTileUrl, key, measureStreet, latest: () => NX.store.get(LATEST_KEY, {}), clear: () => NX.store.del(LATEST_KEY) };
})();
