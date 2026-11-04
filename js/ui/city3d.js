/* City Jam — realistik 3D shahar maketi (three.js, MapLibre custom layer “city3d”).
   Har bir bino ALOHIDA modellanadi — haqiqiy konturi (ichki hovlilari bilan) va balandligi boʻyicha (data/buildings-samarqand.json):
   • devorlar — qavat balandligi (~3 m) va oraliq (~3.2 m) boʻyicha derazalar: hovli uyi (suvoq, kichik derazalar),
     koʻp qavatli uy (panel, deraza qatorlari, balkon chiziqlari), savdo/maʼmuriy bino (keng oynalar);
   • tom — past hovli uylarida (1–2 qavat) toʻrt qiyali tunuka tom (Samarqand mahallalaridagidek: kulrang, yashil, qizgʻish, koʻk),
     koʻp qavatlilarda tekis tom; ichki hovlilar ochiq qoladi.
   Kamera atrofidagi binolar (~0.6–1.2 km) modellanadi, uzoqdagilari — oddiy hajm (MapLibre). Obidalar — landmarks3d.js.
   Tom shakli va fasad turi — bino turi/qavati/maydonidan taxminiy (har bir uyning fasad surati yoʻq); kontur va balandlik — maʼlumotdan. */
(function () {
  'use strict';
  const NX = window.NX;
  let THREE = null, layer = null, map = null, getB = null, getMode = null, getR = null, built = null, busy = false, ids = [];

  // Real fasadlar (pilot): Mapillary suratlaridan devorga proyeksiya qilingan teksturalar — data/facades-pilot.json
  let FAC = null, facTex = new Map();
  fetch('data/facades-pilot.json').then(r => (r.ok ? r.json() : null)).then(j => { if (!j) return; FAC = j; FAC.by = new Map(); j.walls.forEach(w => { const k = w.id; if (!FAC.by.has(k)) FAC.by.set(k, []); FAC.by.get(k).push(w); }); if (built) built.R = -1; if (map) check(); }).catch(() => {});
  function facMat(f) {
    if (!facTex.has(f)) { const t = new THREE.TextureLoader().load(FAC.dir + f, () => map && map.triggerRepaint()); t.anisotropy = 4; facTex.set(f, new THREE.MeshBasicMaterial({ map: t, color: 0xe8e8e8, side: THREE.DoubleSide })); }
    return facTex.get(f);
  }
  const hash = n => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; return x >>> 0; };
  const ROOFS = [0x9aa3ab, 0x8f979d, 0xa3a9ad, 0x86909a, 0x6f8a78, 0x8a5f52, 0x6d7f95, 0x9ca3a8];     // tunuka: rux, yashil, qizgʻish, koʻk
  const FLAT = [0x6f6b66, 0x625f5b, 0x77726b, 0x595653];      // tekis tom: bitum, beton (qorongʻiroq — yorugʻda oqarib ketmasin)

  // ---------- Fasad teksturalari (canvas, bir marta) ----------
  function facade(kind) {
    const c = document.createElement('canvas'), W = 128, H = 128; c.width = W; c.height = H;
    const g = c.getContext('2d');
    const wall = { house: '#e7dcc6', apt: '#d9d6cf', shop: '#cfd6dc' }[kind];
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    // biroz tekstura (suvoq/panel notekisligi)
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    if (kind === 'apt') {
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, H - 6, W, 3);                    // qavatlararo chiziq (panel choki)
      g.fillStyle = '#c9c4ba'; g.fillRect(14, 74, 100, 8);                              // balkon
      win(g, 30, 30, 68, 44, '#5b7186');
    } else if (kind === 'shop') {
      g.fillStyle = '#9fb3c2'; g.fillRect(8, 22, 112, 84);                              // keng oyna
      g.strokeStyle = '#e5e7eb'; g.lineWidth = 3; g.strokeRect(8, 22, 112, 84); g.beginPath(); g.moveTo(64, 22); g.lineTo(64, 106); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(12, 26); g.lineTo(50, 26); g.lineTo(20, 100); g.lineTo(12, 100); g.fill();
    } else {
      g.fillStyle = 'rgba(120,90,60,0.18)'; g.fillRect(0, H - 14, W, 14);                // pastki qism (sokol)
      win(g, 40, 40, 48, 50, '#6a7f8f');
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }
  function win(g, x, y, w, h, glass) {
    g.fillStyle = '#f5f2ea'; g.fillRect(x - 4, y - 4, w + 8, h + 8);                  // rom
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, glass); gr.addColorStop(1, '#2e3e4c');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = '#f5f2ea'; g.fillRect(x + w / 2 - 1.5, y, 3, h); g.fillRect(x, y + h * 0.35, w, 3);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 3, y + 3, w / 2 - 6, h * 0.3);
  }

  // ---------- Geometriya ----------
  const BAY = 3.2, FLOOR = 3.0;
  function kindOf(b) {
    if (/shop|retail|commercial|office|supermarket|mall|hotel|bank|public|civic|government/.test(b.kind || '')) return 'shop';
    if ((b.levels || 1) >= 3) return 'apt';
    return 'house';
  }
  // Toʻplam: bir xil material uchun pozitsiya/normal/uv massivlari
  function bucket() { return { p: [], n: [], u: [] }; }
  function push(B, geo, group, uvScale) {
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, U = geo.attributes.uv.array;
    const g = geo.groups.find(x => x.materialIndex === group); if (!g) return;
    for (let i = g.start; i < g.start + g.count; i++) {
      B.p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); B.n.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      B.u.push(U[i * 2] * (uvScale ? uvScale[0] : 1), U[i * 2 + 1] * (uvScale ? uvScale[1] : 1));
    }
  }
  function toMesh(B, mat) {
    if (!B.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
    return new THREE.Mesh(g, mat);
  }
  // Toʻrt qiyali tom (OBB boʻyicha), 0.35 m chiqib turadi
  function hipRoof(R, o, h, rh, col) {
    const ov = 0.35, hu = o.hu + ov, hv = o.hv + ov, r = Math.max(0, hu - hv);
    const P = (u, v, z) => [o.cx + o.ux * u + o.vx * v, o.cy + o.uy * u + o.vy * v, z];
    const a = P(-hu, -hv, h), b = P(hu, -hv, h), c = P(hu, hv, h), d = P(-hu, hv, h), e = P(-r, 0, h + rh), f = P(r, 0, h + rh);
    const tri = (p, q, s) => {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = s[0] - p[0], vy = s[1] - p[1], vz = s[2] - p[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      if (nz < 0) { const t = q; q = s; s = t; nx = -nx; ny = -ny; nz = -nz; }
      [p, q, s].forEach(v => { R.p.push(v[0], v[1], v[2]); R.n.push(nx, ny, nz); R.c.push(col.r, col.g, col.b); });
    };
    tri(a, b, f); tri(a, f, e); tri(c, d, e); tri(c, e, f); tri(b, c, f); tri(d, a, e);
  }

  // ---------- Koʻchalar: asfalt (kenglik — yoʻl toifasidan, taxminiy), oʻrta chiziq, bordyur; zebra, chiroq ustunlari, svetoforlar (Mapillary aniqlagan joylarda) ----------
  const RWM = { trunk: 22, primary: 18, secondary: 14, tertiary: 10, unclassified: 7, residential: 6, living_street: 5, service: 4, pedestrian: 6 };
  function quad(B, a, b, c, d, z, col) { [a, b, c, a, c, d].forEach(v => { B.p.push(v[0], v[1], z); B.n.push(0, 0, 1); B.c.push(col.r, col.g, col.b); }); }
  function box(B, cx, cy, z0, sx, sy, sz, ang, col) {
    const c = Math.cos(ang), s = Math.sin(ang), P = (x, y, z) => [cx + x * c - y * s, cy + x * s + y * c, z0 + z];
    const hx = sx / 2, hy = sy / 2, F = [[[-hx, -hy], [hx, -hy], [0, -1]], [[hx, -hy], [hx, hy], [1, 0]], [[hx, hy], [-hx, hy], [0, 1]], [[-hx, hy], [-hx, -hy], [-1, 0]]];
    F.forEach(([a, b, n]) => { const nx = n[0] * c - n[1] * s, ny = n[0] * s + n[1] * c, A = P(a[0], a[1], 0), Bq = P(b[0], b[1], 0), C2 = P(b[0], b[1], sz), D2 = P(a[0], a[1], sz); [A, Bq, C2, A, C2, D2].forEach(v => { B.p.push(...v); B.n.push(nx, ny, 0); B.c.push(col.r, col.g, col.b); }); });
    const T = [P(-hx, -hy, sz), P(hx, -hy, sz), P(hx, hy, sz), P(-hx, hy, sz)]; [T[0], T[1], T[2], T[0], T[2], T[3]].forEach(v => { B.p.push(...v); B.n.push(0, 0, 1); B.c.push(col.r, col.g, col.b); });
  }
  function streets(S, lat0, lon0, KX, KY, R) {
    const roads = (getR && getR()) || [], ASP = new THREE.Color(0x3b3e44), CURB = new THREE.Color(0xbdb6a8), LINE = new THREE.Color(0xf1f1ea), segs = [];
    const L = (la, lo) => [(lo - lon0) * KX, (la - lat0) * KY];
    roads.forEach(w => {
      const W = RWM[w.hw]; if (!W || !w.ll) return;
      for (let i = 1; i < w.ll.length; i++) {
        const a = L(w.ll[i - 1][0], w.ll[i - 1][1]), b = L(w.ll[i][0], w.ll[i][1]);
        if (Math.hypot(a[0], a[1]) > R + 60 && Math.hypot(b[0], b[1]) > R + 60) continue;
        if (inCover((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, lat0, lon0, KX, KY)) continue;   // skan qamragan joyda — real asfalt skandan
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (len < 0.5) continue;
        const tx = dx / len, ty = dy / len, nx = -ty, ny = tx, h = W / 2, e = Math.min(1.5, h * 0.3);
        const A = [a[0] - tx * e, a[1] - ty * e], Bp = [b[0] + tx * e, b[1] + ty * e];
        quad(S, [A[0] + nx * h, A[1] + ny * h], [A[0] - nx * h, A[1] - ny * h], [Bp[0] - nx * h, Bp[1] - ny * h], [Bp[0] + nx * h, Bp[1] + ny * h], 0.05, ASP);
        if (W >= 10) {
          // bordyur (ikki tomonda) va oʻrta uzuq chiziq
          [1, -1].forEach(sg => { const o = h + 0.15; quad(S, [a[0] + nx * o * sg, a[1] + ny * o * sg], [a[0] + nx * (o + 0.3) * sg, a[1] + ny * (o + 0.3) * sg], [b[0] + nx * (o + 0.3) * sg, b[1] + ny * (o + 0.3) * sg], [b[0] + nx * o * sg, b[1] + ny * o * sg], 0.16, CURB); });
          for (let d = 1; d < len - 3; d += 9) { const p = [a[0] + tx * d, a[1] + ty * d], q = [a[0] + tx * (d + 3), a[1] + ty * (d + 3)]; quad(S, [p[0] + nx * 0.07, p[1] + ny * 0.07], [p[0] - nx * 0.07, p[1] - ny * 0.07], [q[0] - nx * 0.07, q[1] - ny * 0.07], [q[0] + nx * 0.07, q[1] + ny * 0.07], 0.07, LINE); }
        }
        segs.push({ a, tx, ty, len, W });
      }
    });
    // eng yaqin yoʻl boʻlagi (yoʻnalish va kenglik)
    const nearSeg = (x, y) => { let best = null, bd = 30; segs.forEach(s => { const t = Math.max(0, Math.min(s.len, (x - s.a[0]) * s.tx + (y - s.a[1]) * s.ty)), px = s.a[0] + s.tx * t, py = s.a[1] + s.ty * t, d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = Object.assign({ px, py, d }, s); } }); return best; };
    if (!NX.mlyf || !NX.mlyf.ready()) return;
    const POLE = new THREE.Color(0x4b5563), HEAD = new THREE.Color(0xfff3c4), BOXC = new THREE.Color(0x111827), RED = new THREE.Color(0xef4444), AMB = new THREE.Color(0xf59e0b), GRN = new THREE.Color(0x22c55e), ZEB = new THREE.Color(0xf8fafc);
    const seen = new Set();
    NX.mlyf.near(lat0, lon0, R, 'LSZ').forEach(o => {
      const [x, y] = L(o.lat, o.lon), k = o.c + Math.round(x / 4) + ':' + Math.round(y / 4); if (seen.has(k)) return; seen.add(k);
      const s = nearSeg(x, y); if (!s) return;
      const ang = Math.atan2(s.ty, s.tx);
      if (o.c === 'Z') {
        // zebra: yoʻl boʻylab 0.5 m oq yoʻlaklar, yoʻl kengligi boʻyicha
        for (let i = -3; i <= 3; i++) { const cx = s.px + s.tx * i * 1.0, cy = s.py + s.ty * i * 1.0; box(S, cx, cy, 0.06, 0.5, s.W * 0.9, 0.012, ang, ZEB); }
      } else {
        // ustun yoʻl chetida (Mapillary nuqtasi — taxminan, yoʻl chetiga keltiriladi)
        const side = Math.sign((x - s.px) * -s.ty + (y - s.py) * s.tx) || 1, off = s.W / 2 + 1.2, px = s.px - s.ty * off * side, py = s.py + s.tx * off * side;
        if (o.c === 'L') { box(S, px, py, 0, 0.22, 0.22, 8.5, ang, POLE); box(S, px + s.ty * side * 0.9, py - s.tx * side * 0.9, 8.3, 0.12, 1.8, 0.12, ang, POLE); box(S, px + s.ty * side * 1.7, py - s.tx * side * 1.7, 8.0, 0.35, 0.7, 0.25, ang, HEAD); }
        else { box(S, px, py, 0, 0.2, 0.2, 4.2, ang, POLE); box(S, px, py, 3.0, 0.38, 0.32, 1.1, ang, BOXC); [[3.85, RED], [3.55, AMB], [3.25, GRN]].forEach(([z, c]) => box(S, px + s.ty * side * 0.17, py - s.tx * side * 0.17, z, 0.05, 0.22, 0.22, ang, c)); }
      }
    });
  }

  // Kamera atrofidagi binolarni modellash (bir necha qismda — sahifa qotmasin)
  async function rebuild(center, R) {
    if (busy) return; busy = true;
    try {
      const list = getB() || [], lat0 = center.lat, lon0 = center.lng, KX = 111320 * Math.cos(lat0 * Math.PI / 180), KY = 110574;
      const dLat = R / KY, dLon = R / KX, sel = [];
      for (const b of list) { const p = b.ring && b.ring[0]; if (!p || b.lmK || Math.abs(p[1] - lat0) > dLat || Math.abs(p[0] - lon0) > dLon) continue; sel.push(b); }
      sel.sort((a, b) => Math.hypot(a.ring[0][1] - lat0, (a.ring[0][0] - lon0) * 0.77) - Math.hypot(b.ring[0][1] - lat0, (b.ring[0][0] - lon0) * 0.77));
      if (sel.length > 14000) sel.length = 14000;
      const photo = [], W = { house: bucket(), apt: bucket(), shop: bucket() }, F = { p: [], n: [], c: [] }, Rf = { p: [], n: [], c: [] }, done = [];
      const loc = (lon, lat) => new THREE.Vector2((lon - lon0) * KX, (lat - lat0) * KY);
      for (let i = 0; i < sel.length; i++) {
        const b = sel[i], k = SCAN_FIT.has(b.id) ? 'house' : kindOf(b), hs = hash(b.id || i);   // skanlangan uylar — hovli uyi devori (koʻp qavatli deraza emas)
        if (SCAN_HIDE.has(b.id) && !SCAN_FIT.has(b.id)) { done.push(b.id); continue; }   // skanlangan uy — oʻrnida real 3D skan
        // Skanlangan uy: real fasad oldinda, orqasida — shu uyning tomi va yon devorlari skandagi fasad balandligida (teshiklar ham yopiladi)
        const h = SCAN_FIT.has(b.id) ? SCAN_FIT.get(b.id) : Math.max(2.8, b.height || (b.levels || 1) * 3);
        try {
          const outer = b.ring.slice(0, -1).map(c => loc(c[0], c[1]));
          // skanlangan uy — kontur 1.3 m ichkariga (real fasad doim oldinda koʻrinsin, maket devori uni toʻsmasin)
          if (SCAN_FIT.has(b.id)) { const cx = outer.reduce((t, v) => t + v.x, 0) / outer.length, cy = outer.reduce((t, v) => t + v.y, 0) / outer.length; outer.forEach(v => { const dx = cx - v.x, dy = cy - v.y, d = Math.hypot(dx, dy) || 1, m = Math.min(1.3, d * 0.4); v.x += dx / d * m; v.y += dy / d * m; }); }
          if (outer.length < 3) continue;
          if (THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
          const shape = new THREE.Shape(outer);
          (b.holes || []).forEach(hr => { const hp = hr.slice(0, -1).map(c => loc(c[0], c[1])); if (hp.length >= 3) { if (!THREE.ShapeUtils.isClockWise(hp)) hp.reverse(); shape.holes.push(new THREE.Path(hp)); } });
          const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1 });
          push(W[k], geo, 1, [1 / BAY, 1 / FLOOR]);                                    // devorlar: UV metrda → deraza oraligʻi
          const small = k === 'house' && !(b.holes && b.holes.length) && (b.area || 0) < 450;
          if (small) {
            const o = NX.lm3d._obbPts(outer.map(v => [v.x, v.y]));
            const col = new THREE.Color(ROOFS[hs % ROOFS.length]);
            hipRoof(Rf, o, h, Math.min(2.2, 0.9 + o.hv * 0.25), col);
          } else {
            // tekis tom: faqat yuqori qopqoq
            const P = geo.attributes.position.array, N = geo.attributes.normal.array, g0 = geo.groups.find(x => x.materialIndex === 0), col = new THREE.Color(FLAT[hs % FLAT.length]);
            for (let j = g0.start; j < g0.start + g0.count; j++) if (P[j * 3 + 2] > h - 0.01) { F.p.push(P[j * 3], P[j * 3 + 1], P[j * 3 + 2] + 0.02); F.n.push(N[j * 3], N[j * 3 + 1], N[j * 3 + 2]); F.c.push(col.r, col.g, col.b); }
          }
          geo.dispose();
          // Real fasad surati boʻlgan devorlar — haqiqiy tekstura (devordan 6 sm tashqarida)
          const fw = FAC && FAC.by.get(b.id);
          if (fw) {
            const R0 = b.ring.slice(0, -1).map(c => [(c[0] - lon0) * KX, (c[1] - lat0) * KY]);
            let A2 = 0; for (let q = 0; q < R0.length; q++) { const a = R0[q], c = R0[(q + 1) % R0.length]; A2 += a[0] * c[1] - c[0] * a[1]; }
            fw.forEach(w => {
              const a = R0[w.e], c = R0[(w.e + 1) % R0.length]; if (!a || !c) return;
              const L = Math.hypot(c[0] - a[0], c[1] - a[1]), tx = (c[0] - a[0]) / L, ty = (c[1] - a[1]) / L, nx = A2 > 0 ? ty : -ty, ny = A2 > 0 ? -tx : tx, o = 0.06;
              const g = new THREE.BufferGeometry(), A = [a[0] + nx * o, a[1] + ny * o], C = [c[0] + nx * o, c[1] + ny * o];
              g.setAttribute('position', new THREE.Float32BufferAttribute([A[0], A[1], 0, C[0], C[1], 0, C[0], C[1], h, A[0], A[1], 0, C[0], C[1], h, A[0], A[1], h], 3));
              g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
              photo.push(new THREE.Mesh(g, facMat(w.f)));
            });
          }
          done.push(b.id);
        } catch (e) { /* buzilgan kontur — oʻtkazib yuboriladi */ }
        if (i % 1500 === 1499) await new Promise(r => setTimeout(r, 0));
      }
      const ST = { p: [], n: [], c: [] }; try { streets(ST, lat0, lon0, KX, KY, R); } catch (e) { console.warn('city3d koʻchalar:', e.message); }
      const grp = new THREE.Group();
      Object.keys(W).forEach(k => { const m = toMesh(W[k], layer.mat[k]); if (m) grp.add(m); });
      [[F, layer.mat.flat], [Rf, layer.mat.roof], [ST, layer.mat.flat]].forEach(([B, mat]) => {
        if (!B.p.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
        grp.add(new THREE.Mesh(g, mat));
      });
      photo.forEach(m => grp.add(m));
      if (built) { layer.scene.remove(built.grp); built.grp.traverse(o => o.geometry && o.geometry.dispose()); }
      const mc = window.maplibregl.MercatorCoordinate.fromLngLat([lon0, lat0], 0), s = mc.meterInMercatorCoordinateUnits();
      built = { rn: ((getR && getR()) || []).length, ml: !!(NX.mlyf && NX.mlyf.ready()), grp, l: new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s)), at: [lat0, lon0], R };
      layer.scene.add(grp);
      setIds(done);
      map.triggerRepaint();
    } finally { busy = false; }
  }
  // Modellangan binolar MapLibre hajmidan olib tashlanadi (ikki marta chizilmasin)
  function setIds(next) {
    if (!map.getSource('bld')) return;
    const nx = new Set(next);
    ids.forEach(id => { if (!nx.has(id)) map.setFeatureState({ source: 'bld', id }, { r3d: false }); });
    next.forEach(id => map.setFeatureState({ source: 'bld', id }, { r3d: true }));
    ids = next;
  }
  function clearIds() { if (map && map.getSource('bld')) ids.forEach(id => map.setFeatureState({ source: 'bld', id }, { r3d: false })); ids = []; }

  // Faqat “Balandlik” rejimida va yaqin masshtabda (boshqa rejimlarda binolar maʼlumot rangida boʻlishi kerak)
  const on = () => map && getMode() === 'height' && map.getZoom() >= 15;
  function check() {
    if (!layer || !layer.scene) return;
    if (!on()) { if (built) { layer.scene.remove(built.grp); built.grp.traverse(o => o.geometry && o.geometry.dispose()); built = null; clearIds(); map.triggerRepaint(); } return; }
    const c = map.getCenter(), z = map.getZoom(), R = z >= 17 ? 650 : z >= 16 ? 900 : 1200;
    if (built && Math.hypot((c.lat - built.at[0]) * 110574, (c.lng - built.at[1]) * 85700) < R * 0.4 && Math.abs(R - built.R) < 1 && built.rn === ((getR && getR()) || []).length && built.ml === !!(NX.mlyf && NX.mlyf.ready())) return;
    rebuild(c, R);
  }

  // ---------- Real 3D skanlar: data/scans.json — [{id, nomi, file, lat, lon, heading, z, sana, muallif}] ----------
  // Skan oʻqlari (glTF): Y — yuqoriga, X — koʻcha boʻylab; lat/lon — skanning (0,0,0) nuqtasi, heading — X oʻqining azimuti (shimoldan, soat yoʻnalishida)
  const scans = [], SCAN_HIDE = new Set(), SCAN_COVER = [], SCAN_FIT = new Map();
  // Nuqta skan qamroviga tushadimi (koʻpburchaklar lat/lon da; mahalliy metrga oʻtkaziladi)
  function inCover(x, y, lat0, lon0, KX, KY) {
    if (!SCAN_COVER.length) return false;
    const la = lat0 + y / KY, lo = lon0 + x / KX;
    return SCAN_COVER.some(P => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const yi = P[i][0], xi = P[i][1], yj = P[j][0], xj = P[j][1]; if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) c = !c; } return c; });
  }
  // Roʻyxat sahifa ochilishi bilan yuklanadi (panel tugmasi uchun); 3D modellar — 3D egizak ochilganda
  let scanList = [];
  const scanListP = fetch('data/scans.json').then(r => (r.ok ? r.json() : [])).catch(() => []).then(l => { scanList = Array.isArray(l) ? l : []; if (scanList.length) document.dispatchEvent(new Event('nx:scans')); return scanList; });
  // Kamera koʻchaning boshida, koʻcha boʻylab qaraydi (birinchi skan boshlanishidan 35 m ichkarida)
  function flyScan() {
    const sc = scanList[0]; if (!sc || !map) return;
    const a = sc.heading * Math.PI / 180, d = 35, lat = sc.lat + Math.cos(a) * d / 110574, lon = sc.lon + Math.sin(a) * d / (111320 * Math.cos(sc.lat * Math.PI / 180));
    map.flyTo({ center: [lon, lat], zoom: 19.3, pitch: 76, bearing: sc.heading, duration: 2200 });
  }
  async function loadScans() {
    const list = await scanListP;
    if (!list || !list.length) return;
    list.forEach(sc => { (sc.hide || []).forEach(id => SCAN_HIDE.add(id)); (sc.cover || []).forEach(P => SCAN_COVER.push(P)); Object.entries(sc.fit || {}).forEach(([id, h]) => SCAN_FIT.set(+id, h)); });
    // Xaritada belgi: skanlangan koʻcha qayerda — bosilsa kamera koʻcha darajasiga tushadi
    if (window.maplibregl && window.maplibregl.Marker) {
      const groups = new Map(); list.forEach(sc => { const k = sc.nomi.replace(/\s*\(.*\)$/, ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(sc); });
      groups.forEach((g, name) => {
        const c = g.reduce((a, x) => [a[0] + x.lat / g.length, a[1] + x.lon / g.length], [0, 0]);
        const el = document.createElement('button'); el.type = 'button'; el.className = 'scan-pin'; el.innerHTML = `🏘 <b>Real 3D</b> ${NX.esc(name)}`;
        el.onclick = e => { e.stopPropagation(); flyScan(); };
        const mk = new window.maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([c[1], c[0]]).addTo(map);
        const vis = () => { el.style.display = map.getZoom() >= 12.5 && map.getZoom() < 18 ? '' : 'none'; }; vis(); map.on('zoom', vis);
      });
    }
    // Skanlangan uylar MapLibre qatlamlarida ham koʻrsatilmaydi (tekis iz qolmasin)
    const ids = [...SCAN_HIDE];
    if (ids.length) ['bld', 'bld-roof', 'bld-foot'].forEach(L => { if (map.getLayer(L)) { const f0 = map.getFilter(L), f = ['!', ['in', ['get', 'id'], ['literal', ids]]]; map.setFilter(L, f0 ? ['all', f0, f] : f); } });
    if (built) { built.R = -1; check(); }
    // three.js ikki marta yuklangan boʻlishi mumkin (obidalar qatlami ham yuklaydi) — yuklovchi window.THREE’ga qoʻshiladi
    if (!window.THREE.GLTFLoader) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/three/GLTFLoader.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    list.forEach(sc => {
      const mc = window.maplibregl.MercatorCoordinate.fromLngLat([sc.lon, sc.lat], sc.z || 0), k = mc.meterInMercatorCoordinateUnits(), h = -(sc.heading - 90) * Math.PI / 180;
      const item = Object.assign({ scene: null }, sc);
      // mercator (y pastga) ← metr (z yuqoriga) ← azimut boʻyicha burish ← glTF (Y yuqoriga → Z)
      item.l = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(k, -k, k)).multiply(new THREE.Matrix4().makeRotationZ(h)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      scans.push(item);
      new window.THREE.GLTFLoader().load(sc.file, g => {
        const scn = new window.THREE.Scene();
        g.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) { const t = o.material.map; t.encoding = window.THREE.LinearEncoding; t.anisotropy = 4; t.needsUpdate = true; o.material = new window.THREE.MeshBasicMaterial({ map: t, side: window.THREE.DoubleSide }); } });   // rang — suratdagidek (sRGB qayta kodlanmaydi)
        scn.add(g.scene); item.scene = scn; map.triggerRepaint();
      }, undefined, e => console.warn('skan:', sc.file, e && e.message));
    });
  }
  async function attach(m, getBuildings, getM, getRoads) {
    if (layer) return;
    map = m; getB = getBuildings; getMode = getM; getR = getRoads;
    if (!window.THREE) { if (NX.lm3d && NX.lm3d.loadThree) await NX.lm3d.loadThree(); else await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/three/three.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
    THREE = window.THREE;
    layer = {
      id: 'city3d', type: 'custom', renderingMode: '3d',
      onAdd(mm, gl) {
        this.camera = new THREE.Camera(); this.scene = new THREE.Scene();
        this.scene.add(new THREE.HemisphereLight(0xf4f1ea, 0x6b6257, 0.7));
        const sun = new THREE.DirectionalLight(0xfff1dc, 0.75); sun.position.set(-160, -220, 300); this.scene.add(sun);
        const fill = new THREE.DirectionalLight(0xbcd4ff, 0.25); fill.position.set(220, 160, 120); this.scene.add(fill);
        const wall = k => new THREE.MeshLambertMaterial({ map: facade(k) });
        this.mat = { house: wall('house'), apt: wall('apt'), shop: wall('shop'), flat: new THREE.MeshLambertMaterial({ vertexColors: true }), roof: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }) };
        this.renderer = new THREE.WebGLRenderer({ canvas: mm.getCanvas(), context: gl, antialias: true });
        this.renderer.autoClear = false;
      },
      render(gl, matrix) {
        const M = new THREE.Matrix4().fromArray(matrix);
        this.renderer.resetState();
        if (built && on()) { this.camera.projectionMatrix = M.clone().multiply(built.l); this.renderer.render(this.scene, this.camera); }
        // Real 3D skanlar (Polycam va h.k.) — har biri oʻz joyida, istalgan rejimda (zoom ≥ 14.5)
        if (map.getZoom() >= 14.5) scans.forEach(sc => { if (!sc.scene) return; this.camera.projectionMatrix = M.clone().multiply(sc.l); this.renderer.render(sc.scene, this.camera); });
      },
    };
    map.addLayer(layer, map.getLayer('lm3d') ? 'lm3d' : map.getLayer('hz-zone') ? 'hz-zone' : undefined);
    map.on('moveend', check);
    loadScans();
    check();
  }
  // Rejim almashganda / binolar yangilanganda (map3d.js chaqiradi)
  function update(force) { if (force && built) built.R = -1; check(); }
  function reapply() { if (ids.length && map) ids.forEach(id => map.setFeatureState({ source: 'bld', id }, { r3d: true })); }

  NX.city3d = { _dbg: () => ({ layer, built, FAC, scans }), scans: () => scanList.map(x => ({ id: x.id, nomi: x.nomi, lat: x.lat, lon: x.lon, heading: x.heading })), flyScan, attach, update, reapply, active: () => !!built, pilot: () => FAC && { street: FAC.street, c: FAC.c, n: FAC.walls.length } };
})();
