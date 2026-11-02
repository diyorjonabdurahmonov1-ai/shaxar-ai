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
  let THREE = null, layer = null, map = null, getB = null, getMode = null, built = null, busy = false, ids = [];

  const hash = n => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; return x; };
  const ROOFS = [0x9aa3ab, 0x8b9399, 0x5f7f6a, 0x9c5b4a, 0x50739a, 0xa7adb2, 0x7d868c];     // tunuka: rux, yashil, qizgʻish, koʻk
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

  // Kamera atrofidagi binolarni modellash (bir necha qismda — sahifa qotmasin)
  async function rebuild(center, R) {
    if (busy) return; busy = true;
    try {
      const list = getB() || [], lat0 = center.lat, lon0 = center.lng, KX = 111320 * Math.cos(lat0 * Math.PI / 180), KY = 110574;
      const dLat = R / KY, dLon = R / KX, sel = [];
      for (const b of list) { const p = b.ring && b.ring[0]; if (!p || b.lmK || Math.abs(p[1] - lat0) > dLat || Math.abs(p[0] - lon0) > dLon) continue; sel.push(b); }
      sel.sort((a, b) => Math.hypot(a.ring[0][1] - lat0, (a.ring[0][0] - lon0) * 0.77) - Math.hypot(b.ring[0][1] - lat0, (b.ring[0][0] - lon0) * 0.77));
      if (sel.length > 14000) sel.length = 14000;
      const W = { house: bucket(), apt: bucket(), shop: bucket() }, F = { p: [], n: [], c: [] }, Rf = { p: [], n: [], c: [] }, done = [];
      const loc = (lon, lat) => new THREE.Vector2((lon - lon0) * KX, (lat - lat0) * KY);
      for (let i = 0; i < sel.length; i++) {
        const b = sel[i], k = kindOf(b), h = Math.max(2.8, b.height || (b.levels || 1) * 3), hs = hash(b.id || i);
        try {
          const outer = b.ring.slice(0, -1).map(c => loc(c[0], c[1]));
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
          done.push(b.id);
        } catch (e) { /* buzilgan kontur — oʻtkazib yuboriladi */ }
        if (i % 1500 === 1499) await new Promise(r => setTimeout(r, 0));
      }
      const grp = new THREE.Group();
      Object.keys(W).forEach(k => { const m = toMesh(W[k], layer.mat[k]); if (m) grp.add(m); });
      [[F, layer.mat.flat], [Rf, layer.mat.roof]].forEach(([B, mat]) => {
        if (!B.p.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
        grp.add(new THREE.Mesh(g, mat));
      });
      if (built) { layer.scene.remove(built.grp); built.grp.traverse(o => o.geometry && o.geometry.dispose()); }
      const mc = window.maplibregl.MercatorCoordinate.fromLngLat([lon0, lat0], 0), s = mc.meterInMercatorCoordinateUnits();
      built = { grp, l: new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s)), at: [lat0, lon0], R };
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
    if (built && Math.hypot((c.lat - built.at[0]) * 110574, (c.lng - built.at[1]) * 85700) < R * 0.4 && Math.abs(R - built.R) < 1) return;
    rebuild(c, R);
  }

  async function attach(m, getBuildings, getM) {
    if (layer) return;
    map = m; getB = getBuildings; getMode = getM;
    if (!window.THREE) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/three/three.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
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
        if (!built || !on()) return;
        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(built.l);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
      },
    };
    map.addLayer(layer, map.getLayer('lm3d') ? 'lm3d' : map.getLayer('hz-zone') ? 'hz-zone' : undefined);
    map.on('moveend', check);
    check();
  }
  // Rejim almashganda / binolar yangilanganda (map3d.js chaqiradi)
  function update(force) { if (force && built) built.R = -1; check(); }
  function reapply() { if (ids.length && map) ids.forEach(id => map.setFeatureState({ source: 'bld', id }, { r3d: true })); }

  NX.city3d = { attach, update, reapply, active: () => !!built };
})();
