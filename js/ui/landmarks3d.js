/* City Jam — tarixiy obidalarning batafsil 3D modellari (three.js, MapLibre custom layer).
   Joylashuv va oʻlcham — OSM’dagi haqiqiy bino konturlaridan (yoʻnaltirilgan toʻrtburchak); qismlar (peshtoq-arka, minoralar,
   qovurgʻali gumbazlar) ochiq manbalardagi taxminiy oʻlchamlar bilan: Ulugʻbek madrasasi peshtoqi ~35 m, minoralar ~33 m;
   Sherdor — ikki qovurgʻali gumbaz; Tillakori — katta moviy gumbaz; Bibixonim gumbazi ~40 m; Goʻri Amir — baland boʻgʻizli qovurgʻali gumbaz ~34 m.
   Bu “maket” emas, real kontur ustida qurilgan soddalashtirilgan model (taxminiy). */
(function () {
  'use strict';
  const NX = window.NX;
  const ORIGIN = [39.6550, 66.9760];                      // sahna markazi (Registon)
  const KX = 111320 * Math.cos(ORIGIN[0] * Math.PI / 180), KY = 110574;
  const loc = (lat, lon) => [(lon - ORIGIN[1]) * KX, (lat - ORIGIN[0]) * KY];
  const COL = { brick: 0xcdb08a, brickDark: 0xa98f6c, tile: 0x1f9fb8, tileDeep: 0x1b4f8f, niche: 0x123a66, gold: 0xd9b45a, cap: 0x2bb7c9 };
  let loaded = null;

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (loaded) return loaded;
    loaded = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/three/three.min.js'; s.onload = () => res(window.THREE); s.onerror = () => rej(new Error('three.js yuklanmadi')); document.head.appendChild(s); });
    return loaded;
  }

  // Bino kontur halqasi → mahalliy metrlar; minimal maydonli yoʻnaltirilgan toʻrtburchak (OBB)
  function obb(ring) {
    const P = ring.map(c => loc(c[1], c[0]));
    const hull = convex(P);
    let best = null;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      hull.forEach(p => { const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
      const area = (u1 - u0) * (v1 - v0);
      if (!best || area < best.area) best = { area, ux, uy, u0, u1, v0, v1 };
    }
    const cu = (best.u0 + best.u1) / 2, cv = (best.v0 + best.v1) / 2;
    const cx = cu * best.ux - cv * best.uy, cy = cu * best.uy + cv * best.ux;
    let hu = (best.u1 - best.u0) / 2, hv = (best.v1 - best.v0) / 2, ux = best.ux, uy = best.uy;
    if (hv > hu) { const t = hu; hu = hv; hv = t; const ox = ux; ux = -uy; uy = ox; }   // u — uzun oʻq
    return { cx, cy, ux, uy, vx: -uy, vy: ux, hu, hv };
  }
  function convex(P) {
    const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    p.forEach(q => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    p.slice().reverse().forEach(q => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // OBB tomonlari: tashqi normal, oʻrta nuqta, uzunlik, burchaklar
  function sides(o) {
    const S = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([su, sv]) => {
      const nx = su * o.ux + sv * o.vx, ny = su * o.uy + sv * o.vy, d = su ? o.hu : o.hv, L = su ? 2 * o.hv : 2 * o.hu;
      const mx = o.cx + nx * d, my = o.cy + ny * d, tx = -ny, ty = nx;
      S.push({ nx, ny, mx, my, L, tx, ty, c1: [mx + tx * L / 2, my + ty * L / 2], c2: [mx - tx * L / 2, my - ty * L / 2] });
    });
    return S;
  }
  const facing = (o, target) => { const dx = target[0] - o.cx, dy = target[1] - o.cy; return sides(o).reduce((b, s) => (s.nx * dx + s.ny * dy > b.nx * dx + b.ny * dy ? s : b)); };

  // ---------- Geometriya qismlari (Z — yuqoriga) ----------
  function build(THREE, scene, bl) {
    const M = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.75 : r, metalness: 0.05 });
    const mat = { brick: M(COL.brick), brickD: M(COL.brickDark), tile: M(COL.tile, 0.45), deep: M(COL.tileDeep, 0.5), niche: M(COL.niche, 0.6), gold: M(COL.gold, 0.4), cap: M(COL.cap, 0.4) };
    const place = (mesh, x, y, z, rotZ) => { const g = new THREE.Group(); mesh.rotation.x = Math.PI / 2; g.add(mesh); g.position.set(x, y, z || 0); g.rotation.z = rotZ || 0; scene.add(g); return g; };
    // Minora: pastdan torayib boruvchi ustun, yuqorida ayvon (balkon) va gumbazcha
    function minaret(x, y, h, r) {
      place(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r, h, 20), mat.brick), x, y, h / 2);
      for (let k = 1; k <= 3; k++) place(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.92, 0.9, 20), mat.tile), x, y, h * (0.25 * k));
      place(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 0.85, 1.6, 20), mat.tile), x, y, h + 0.4);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.cap); place(cap, x, y, h + 1.2);
    }
    // Qovurgʻali (“qovun”) gumbaz baland boʻgʻiz (baraban) ustida
    function dome(x, y, base, drumH, r, ribs, material) {
      place(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.95, drumH, 32), mat.brick), x, y, base + drumH / 2);
      place(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 1.2, 32), mat.tile), x, y, base + drumH - 0.6);
      const g = new THREE.SphereGeometry(r, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.62), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i), a = Math.atan2(vz, vx), k = 1 + (ribs ? 0.05 * Math.pow(Math.abs(Math.cos(a * ribs / 2)), 0.6) : 0);
        pos.setXYZ(i, vx * k, vy * 1.18, vz * k);   // biroz choʻzinchoq (Temuriylar gumbazlari kabi)
      }
      g.computeVertexNormals();
      place(new THREE.Mesh(g, material || mat.tile), x, y, base + drumH - r * 0.35);
      place(new THREE.Mesh(new THREE.ConeGeometry(r * 0.08, r * 0.5, 8), mat.gold), x, y, base + drumH - r * 0.35 + r * 1.18 + r * 0.2);
    }
    // Peshtoq: ichida arka (ravoq) va chuqur toqcha (moviy), atrofi koshin ramka
    function portal(side, w, h, d) {
      const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h); shape.lineTo(-w / 2, h); shape.lineTo(-w / 2, 0);
      const aw = w * 0.52, ah = h * 0.72, hole = new THREE.Path(); hole.moveTo(-aw / 2, 0); hole.lineTo(-aw / 2, ah - aw / 2); hole.absarc(0, ah - aw / 2, aw / 2, Math.PI, 0, true); hole.lineTo(aw / 2, 0); hole.lineTo(-aw / 2, 0); shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
      const rot = Math.atan2(side.ny, side.nx) - Math.PI / 2;      // old yuzi tashqariga qaraydi
      const g = new THREE.Group(); g.position.set(side.mx - side.nx * d * 0.5, side.my - side.ny * d * 0.5, 0); g.rotation.z = rot;
      const m = new THREE.Mesh(geo, mat.brick); m.rotation.x = Math.PI / 2; m.position.set(0, d / 2, 0); g.add(m);
      // Koshin ramka (old yuz) va toqcha devori
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 1.2, h * 0.08), mat.tile); frame.position.set(0, d / 2 + 0.2, h * 0.93); g.add(frame);
      const back = new THREE.Mesh(new THREE.BoxGeometry(aw, 0.6, ah), mat.niche); back.position.set(0, -d / 2 + 0.8, ah / 2); g.add(back);
      scene.add(g);
    }

    const T = loc(39.65485, 66.97575);   // Registon maydoni
    const byK = k => bl.filter(b => b.lmK === k && b.ring).sort((a, b) => b.area - a.area);
    // Registon: uchta madrasa — qaysi biri ekanini maydonga nisbatan joylashuvidan aniqlaymiz
    byK('registon').slice(0, 3).forEach(b => {
      const o = obb(b.ring), dx = o.cx - T[0], dy = o.cy - T[1], f = facing(o, T);
      const kind = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'ulugbek' : 'sherdor') : (dy > 0 ? 'tillakori' : 'ulugbek');
      portal(f, Math.min(34, f.L * 0.5), kind === 'tillakori' ? 30 : 35, 9);
      if (kind === 'ulugbek') { const c = sides(o); const corners = [c[0].c1, c[0].c2, c[1].c1, c[1].c2]; corners.forEach(p => minaret(p[0] - Math.sign(p[0] - o.cx) * 2, p[1] - Math.sign(p[1] - o.cy) * 2, 33, 2.7)); }
      if (kind === 'sherdor') {
        [f.c1, f.c2].forEach(p => minaret(p[0] - f.nx * 2.5, p[1] - f.ny * 2.5, 31, 2.6));
        [-0.28, 0.28].forEach(t => dome(f.mx - f.nx * 12 + f.tx * f.L * t, f.my - f.ny * 12 + f.ty * f.L * t, 14, 6, 6.5, 16));
      }
      if (kind === 'tillakori') {
        [f.c1, f.c2].forEach(p => minaret(p[0] - f.nx * 2, p[1] - f.ny * 2, 18, 2.2));
        // Masjid gumbazi — gʻarbiy qanot ichida
        const west = sides(o).reduce((bst, s) => (s.nx < bst.nx ? s : bst));
        dome(west.mx - west.nx * 16, west.my - west.ny * 16, 14, 7, 9, 0, mat.deep);
      }
    });
    // Bibixonim: shimoli-gʻarbiy uchida bosh gumbaz, sharqda kirish peshtoqi, uzun tomonlar oʻrtasida kichik gumbazlar, burchaklarda minoralar
    const bb = byK('bibixonim')[0];
    if (bb) {
      const o = obb(bb.ring), S = sides(o).filter(s => Math.abs(s.L - 2 * o.hv) < 1);   // qisqa tomonlar (u oʻqi uchlari)
      const west = S.reduce((a, s) => (s.mx < a.mx ? s : a)), east = S.reduce((a, s) => (s.mx > a.mx ? s : a));
      portal(east, Math.min(38, east.L * 0.42), 35, 10);
      const inner = { nx: -west.nx, ny: -west.ny, mx: west.mx - west.nx * 22, my: west.my - west.ny * 22, L: west.L, tx: west.tx, ty: west.ty };
      portal(inner, Math.min(36, west.L * 0.4), 33, 9);
      dome(west.mx - west.nx * 12, west.my - west.ny * 12, 18, 8, 13, 0, mat.tile);
      const long = sides(o).filter(s => Math.abs(s.L - 2 * o.hu) < 1);
      long.forEach(s => dome(s.mx - s.nx * 12, s.my - s.ny * 12, 14, 5, 7.5, 0, mat.tile));
      sides(o).slice(0, 2).forEach(s => [s.c1, s.c2].forEach(p => minaret(p[0] - Math.sign(p[0] - o.cx) * 3, p[1] - Math.sign(p[1] - o.cy) * 3, 30, 3)));
    }
    // Goʻri Amir: maqbara ustida baland boʻgʻiz va qovurgʻali gumbaz (64 qovurgʻa oʻrniga koʻrinish uchun 24)
    const ga = loc(39.64833, 66.96889);
    dome(ga[0], ga[1], 11, 11, 8.5, 24, mat.tile);
    // Shohi Zinda: xiyobon boʻylab kichik maqbaralar — har biriga kichik gumbaz (kontur kattaligiga mos)
    const A = loc(39.6612, 66.9866), B = loc(39.6641, 66.9894), ABx = B[0] - A[0], ABy = B[1] - A[1], ABL = Math.hypot(ABx, ABy);
    let n = 0;
    bl.forEach(b => {
      if (n > 40 || !b.ring || b.area < 25 || b.area > 450) return;
      const [x, y] = loc(b.c[0], b.c[1]), t = ((x - A[0]) * ABx + (y - A[1]) * ABy) / (ABL * ABL); if (t < 0 || t > 1) return;
      const d = Math.abs((x - A[0]) * ABy - (y - A[1]) * ABx) / ABL; if (d > 22) return;
      const o = obb(b.ring), r = Math.max(2.5, Math.min(6, o.hv * 0.85));
      dome(o.cx, o.cy, Math.max(6, b.height), 2.5, r, 0, n % 3 ? mat.tile : mat.deep); n++;
    });
  }

  // ---------- MapLibre custom layer ----------
  async function attach(map, buildings) {
    const THREE = await loadThree();
    const mc = window.maplibregl.MercatorCoordinate.fromLngLat([ORIGIN[1], ORIGIN[0]], 0), s = mc.meterInMercatorCoordinateUnits();
    const layer = {
      id: 'lm3d', type: 'custom', renderingMode: '3d',
      onAdd(m, gl) {
        this.camera = new THREE.Camera(); this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const sun = new THREE.DirectionalLight(0xfff1dc, 0.85); sun.position.set(-120, -200, 260); this.scene.add(sun);
        const fill = new THREE.DirectionalLight(0x9cc8ff, 0.35); fill.position.set(200, 150, 120); this.scene.add(fill);
        build(THREE, this.scene, buildings);
        this.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
        this.renderer.autoClear = false;
        this.l = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s));
      },
      render(gl, matrix) {
        if (map.getZoom() < 14) return;
        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(this.l);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
      },
    };
    if (map.getLayer('lm3d')) map.removeLayer('lm3d');
    map.addLayer(layer, map.getLayer('hz-zone') ? 'hz-zone' : undefined);
    return true;
  }

  NX.lm3d = { attach, _obb: obb };
})();
