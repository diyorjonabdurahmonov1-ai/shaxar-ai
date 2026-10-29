/* City Jam — umumiy sozlamalar, geometriya, kesh va yordamchi funksiyalar */
(function () {
  'use strict';
  const NX = (window.NX = window.NX || {});

  NX.config = {
    // Pilot hudud: Samarqand tarixiy markazi
    bbox: { s: 39.640, w: 66.950, n: 39.670, e: 67.000 },
    // Bekatlar chegaradan ~500 m kengroq olinadi: chekkadagi koʻchalarning qamrovi toʻgʻri hisoblanishi uchun
    stopBbox: { s: 39.6355, w: 66.9440, n: 39.6745, e: 67.0060 },
    center: [39.6547, 66.9757], // Registon
    overpassMirrors: [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
    ],
    overpassTimeoutMs: 45000,
    overpassRounds: 2,
    osmCacheMaxAgeMs: 24 * 3600 * 1000,
    tomtomUrl: 'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json',
    tomtomTimeoutMs: 15000,
    openaiUrl: 'https://api.openai.com/v1/chat/completions',
    // Asosiy — GPT-6 Sol (kuchli, Astra’dan 5 baravar arzon); mavjud boʻlmasa — eski modellar
    openaiModels: ['gpt-6-sol', 'gpt-5.4-mini', 'gpt-5.5', 'gpt-4.1-mini'],
    openaiDeep: ['gpt-6-sol', 'gpt-5.5', 'gpt-5.4-mini', 'gpt-4.1-mini'],
    openaiLight: ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-4.1-mini'],   // koʻp sonli oddiy soʻrovlar (suratda svetofor bormi)
    weatherUrl: 'https://api.open-meteo.com/v1/forecast',
    tomtomIncidentsUrl: 'https://api.tomtom.com/traffic/services/5/incidentDetails',
    tomtomFlowTiles: 'https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png',
    demand: { min: 3000, max: 20000, step: 500, def: 8000 },
  };

  // Koʻcha turlari: daraja, nom, chiziq qalinligi, standart polosalar (ikki tomonga jami)
  NX.HW = {
    trunk: { rank: 7, uz: 'Magistral yoʻl', w: 6, lanes2: 4, lanes1: 2, risk: 30 },
    primary: { rank: 6, uz: 'Asosiy koʻcha (1-darajali)', w: 5, lanes2: 4, lanes1: 2, risk: 25 },
    secondary: { rank: 5, uz: '2-darajali koʻcha', w: 4.2, lanes2: 2, lanes1: 2, risk: 18 },
    tertiary: { rank: 4, uz: '3-darajali koʻcha', w: 3.4, lanes2: 2, lanes1: 1, risk: 12 },
    unclassified: { rank: 3, uz: 'Tasniflanmagan yoʻl', w: 2.4, lanes2: 2, lanes1: 1, risk: 6 },
    residential: { rank: 2, uz: 'Turar-joy koʻchasi', w: 2, lanes2: 2, lanes1: 1, risk: 4 },
    living_street: { rank: 1, uz: 'Yashash zonasi koʻchasi', w: 1.6, lanes2: 2, lanes1: 1, risk: 2 },
  };
  NX.MAJOR_RANK = 4; // tertiary va undan yuqori — “yirik” koʻcha

  // ---------- Geometriya: Registon atrofida tekis proyeksiya (metr) ----------
  const LAT0 = NX.config.center[0], LON0 = NX.config.center[1];
  const KY = 110574, KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
  const COMPASS = ['shimol', 'shimoli-sharq', 'sharq', 'janubi-sharq', 'janub', 'janubi-gʻarb', 'gʻarb', 'shimoli-gʻarb'];

  NX.geo = {
    xy(lat, lon) { return [(lon - LON0) * KX, (lat - LAT0) * KY]; },
    ll(x, y) { return [LAT0 + y / KY, LON0 + x / KX]; },
    d(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
    segDist(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    },
    len(pts) {
      let s = 0;
      for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return s;
    },
    // Chiziq boʻylab har `step` metrda nuqta
    sample(pts, step, cb) {
      if (!pts.length) return;
      cb(pts[0][0], pts[0][1]);
      let carry = 0;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
        const L = Math.hypot(bx - ax, by - ay);
        let pos = step - carry;
        while (pos <= L) { const t = pos / L; cb(ax + t * (bx - ax), ay + t * (by - ay)); pos += step; }
        carry = L - (pos - step);
      }
    },
    pointAlong(pts, frac) {
      const total = NX.geo.len(pts); let target = total * frac;
      for (let i = 1; i < pts.length; i++) {
        const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (target <= L && L > 0) { const t = target / L; return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])]; }
        target -= L;
      }
      return pts[pts.length - 1].slice();
    },
    // vektor (dx,dy) uchun kompas yoʻnalishi (y — shimol)
    compass(dx, dy) {
      const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      return COMPASS[Math.round(deg / 45) % 8];
    },
  };

  // ---------- Fazoviy indeks (toʻr) ----------
  class Grid {
    constructor(cell) { this.c = cell; this.m = new Map(); }
    _k(i, j) { return (i + 50000) * 100000 + (j + 50000); }
    _push(i, j, it) { const k = this._k(i, j); let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(it); }
    addPoint(x, y, it) { this._push(Math.floor(x / this.c), Math.floor(y / this.c), it); }
    addSeg(ax, ay, bx, by, it) {
      const c = this.c;
      const i0 = Math.floor(Math.min(ax, bx) / c), i1 = Math.floor(Math.max(ax, bx) / c);
      const j0 = Math.floor(Math.min(ay, by) / c), j1 = Math.floor(Math.max(ay, by) / c);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this._push(i, j, it);
    }
    // r radiusdagi kataklardagi barcha elementlar (takrorlanishi mumkin; masofani chaqiruvchi tekshiradi)
    near(x, y, r, cb) {
      const c = this.c;
      const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c);
      const j0 = Math.floor((y - r) / c), j1 = Math.floor((y + r) / c);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = this.m.get(this._k(i, j));
        if (a) for (let n = 0; n < a.length; n++) cb(a[n]);
      }
    }
  }
  NX.Grid = Grid;

  // ---------- Brauzer xotirasi (localStorage) ----------
  NX.store = {
    get(k, def) {
      try { const v = localStorage.getItem('nx:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(k, v) {
      try { localStorage.setItem('nx:' + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del(k) { try { localStorage.removeItem('nx:' + k); } catch (e) { /* xotira yopiq */ } },
  };

  // ---------- Tarmoq: vaqt chegarasi bilan soʻrov ----------
  NX.sleep = ms => new Promise(r => setTimeout(r, ms));
  NX.fetchJSON = async function (url, opts, ms, outer) {
    const ctl = new AbortController();
    let timedOut = false;
    const onAbort = () => ctl.abort();
    if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', onAbort, { once: true }); }
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, ms);
    try {
      const res = await fetch(url, Object.assign({}, opts, { signal: ctl.signal }));
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (e) { /* JSON emas */ }
      return { ok: res.ok, status: res.status, data, text };
    } catch (e) {
      const err = new Error(timedOut ? 'Vaqt tugadi' : outer && outer.aborted ? 'Bekor qilindi' : 'Tarmoq xatosi');
      err.network = true; err.timeout = timedOut;
      throw err;
    } finally {
      clearTimeout(timer);
      if (outer) outer.removeEventListener('abort', onAbort);
    }
  };

  // ---------- Formatlash ----------
  const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  NX.fmt = {
    int(n) { return n == null || !isFinite(n) ? '—' : (n < 0 ? '−' : '') + group(String(Math.round(Math.abs(n)))); },
    num(n, d = 1) {
      if (n == null || !isFinite(n)) return '—';
      const s = Math.abs(n).toFixed(d).split('.');
      return (n < 0 ? '−' : '') + group(s[0]) + (s[1] ? ',' + s[1] : '');
    },
    signed(n, d = 0) { return n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + NX.fmt.num(n, d); },
    km(m) { return m == null ? '—' : m >= 1000 ? NX.fmt.num(m / 1000, 2) + ' km' : Math.round(m) + ' m'; },
    pct(p, d = 0) { return p == null || !isFinite(p) ? '—' : NX.fmt.num(p, d) + '%'; },
    time(ts) {
      if (!ts) return '—';
      const d = new Date(ts), z = n => String(n).padStart(2, '0');
      return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
    },
    hour(h) { return String(h).padStart(2, '0') + ':00'; },
    uzs(n) { return NX.fmt.int(n) + ' soʻm'; },
  };
  NX.days = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  NX.daysShort = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

  NX.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const SRC = {
    osm: ['OpenStreetMap', 'b-osm'], tomtom: ['TomTom · real', 'b-tt'], hisob: ['Hisob', 'b-calc'],
    bashorat: ['Taxmin', 'b-pred'], ai: ['AI', 'b-ai'], meteo: ['Open-Meteo · real', 'b-osm'], yandex: ['Yandex · real', 'b-tt'], crowd: ['Odamlar xabari · real', 'b-ai'],
  };
  NX.badge = k => `<span class="badge ${SRC[k][1]}" title="Manba: ${SRC[k][0]}">${SRC[k][0]}</span>`;

  // Kirill → lotin (koʻcha nomlarini moslashtirish uchun)
  const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
  NX.translit = s => String(s || '').toLowerCase().replace(/[а-яёўқғҳ]/g, c => (CYR[c] != null ? CYR[c] : c));

  // Oddiy hodisalar shinasi
  const handlers = {};
  NX.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  NX.emit = (ev, data) => { (handlers[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };
})();
