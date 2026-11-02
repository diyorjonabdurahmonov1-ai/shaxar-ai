/* City Jam — Mapillary koʻcha suratlaridan avtomatik aniqlangan obyektlar (oldindan yigʻilgan: data/mly-samarqand.json, CC BY-SA).
   L — koʻcha chirogʻi, S — svetofor, Z — piyoda oʻtish (zebra/belgi), C — yomgʻir suvi qudugʻi, M — lyuk, V — tezlik cheklovi,
   P — ustuvorlik belgisi, K — bolalar/maktab belgisi, N — toʻxtash taqiqlangan, B — bekat belgisi.
   Diqqat: surat yoʻq koʻchada obyekt ham “yoʻq” chiqadi — shuning uchun “suratlar bor joyda” deb ishlatiladi. */
(function () {
  'use strict';
  const NX = window.NX, G = NX.geo, CELL = 100;
  let idx = null, P = null;
  function load() {
    if (P) return P;
    P = fetch('data/mly-samarqand.json').then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d || !d.f) return null;
      const g = new Map();
      d.f.forEach(a => { const [x, y] = G.xy(a[1], a[2]), k = Math.floor(x / CELL) + ':' + Math.floor(y / CELL); let v = g.get(k); if (!v) g.set(k, (v = [])); v.push({ c: a[0], x, y, lat: a[1], lon: a[2], v: a[3] }); });
      idx = { g, n: d.f.length, date: d.date, src: d.src };
      document.dispatchEvent(new Event('nx:mly'));
      return idx;
    }).catch(() => null);
    return P;
  }
  // r metr ichidagi obyektlar (codes — 'SZ' kabi satr yoki null — hammasi)
  function near(lat, lon, r, codes) {
    if (!idx) return [];
    const [x, y] = G.xy(lat, lon), s = Math.ceil(r / CELL), out = [];
    for (let i = -s; i <= s; i++) for (let j = -s; j <= s; j++) (idx.g.get((Math.floor(x / CELL) + i) + ':' + (Math.floor(y / CELL) + j)) || []).forEach(o => { if ((!codes || codes.includes(o.c)) && Math.hypot(o.x - x, o.y - y) <= r) out.push(Object.assign({ d: Math.hypot(o.x - x, o.y - y) }, o)); });
    return out.sort((a, b) => a.d - b.d);
  }
  // Chiziq (koʻcha) boʻylab: har nuqtadan r m ichidagi obyektlar (takrorsiz)
  function alongLine(ll, r, codes) {
    if (!idx) return [];
    const seen = new Set(), out = [];
    for (let i = 0; i < ll.length; i++) {
      const pts = [ll[i]];
      if (i) { const [ax, ay] = G.xy(ll[i - 1][0], ll[i - 1][1]), [bx, by] = G.xy(ll[i][0], ll[i][1]), L = Math.hypot(bx - ax, by - ay), n = Math.floor(L / 40); for (let t = 1; t <= n; t++) pts.push(G.ll(ax + (bx - ax) * t / (n + 1), ay + (by - ay) * t / (n + 1))); }
      pts.forEach(p => near(p[0], p[1], r, codes).forEach(o => { const k = o.c + o.x.toFixed(0) + o.y.toFixed(0); if (!seen.has(k)) { seen.add(k); out.push(o); } }));
    }
    return out;
  }
  NX.mlyf = { load, near, alongLine, ready: () => !!idx, info: () => idx && { n: idx.n, date: idx.date, src: idx.src } };
  load();
})();
