/* City Jam — muammo joyining tepadan koʻrinishdagi rejasi (OpenStreetMap geometriyasi, masshtabda).
   Mavjud svetofor/oʻtish joylari va taklif qilinayotgan yechim (svetofor, zebra, toʻxtash chizigʻi) chiziladi.
   Bu sxema AI rasm uchun ham asos boʻladi — AI yoʻllarni oʻylab topmasin. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;
  const R = 75, SIZE = 360;                    // atrofi, m; rasm oʻlchami, px
  const LANE = 3.3;                            // polosa kengligi, m
  const DEFLANES = { trunk: 4, primary: 4, secondary: 2, tertiary: 2, unclassified: 2, residential: 2, living_street: 1, service: 1 };

  const widthOf = w => {
    const n = w.lanes || (w.lanesF || 0) + (w.lanesB || 0) || DEFLANES[w.hw] || 2;
    return Math.max(1, Math.min(8, n)) * LANE + 1.5;
  };

  // Joy atrofidagi yoʻllar va chorrahadan chiqadigan tarmoqlar (yoʻnalish, kenglik)
  function geometry(M, p) {
    const [cx, cy] = G.xy(p.lat, p.lon);
    const roads = [], legs = [];
    M.ways.forEach(w => {
      if (!w.xy.some(q => Math.hypot(q[0] - cx, q[1] - cy) < R * 1.6)) return;
      const width = widthOf(w);
      roads.push({ pts: w.xy.map(q => [q[0] - cx, q[1] - cy]), width, name: M.streets[w.street] && M.streets[w.street].name, oneway: w.oneway, street: w.street });
      // Chorrahaga 18 m dan yaqin oʻtsa — undan chiqadigan tarmoqlar
      let bi = -1, bd = 18;
      w.xy.forEach((q, i) => { const d = Math.hypot(q[0] - cx, q[1] - cy); if (d < bd) { bd = d; bi = i; } });
      if (bi < 0) return;
      const along = (dir) => {
        let acc = 0, i = bi;
        while (i + dir >= 0 && i + dir < w.xy.length) {
          const a = w.xy[i], b = w.xy[i + dir];
          acc += Math.hypot(b[0] - a[0], b[1] - a[1]); i += dir;
          if (acc >= 20) break;
        }
        if (i === bi) return null;
        const v = [w.xy[i][0] - cx, w.xy[i][1] - cy], l = Math.hypot(v[0], v[1]);
        return l > 4 ? { d: [v[0] / l, v[1] / l], width, name: M.streets[w.street] && M.streets[w.street].name, street: w.street, rank: NX.HW[w.hw] ? NX.HW[w.hw].rank : 2 } : null;
      };
      [along(1), along(-1)].forEach(l => { if (l && !legs.some(o => o.d[0] * l.d[0] + o.d[1] * l.d[1] > 0.87)) legs.push(l); });
    });
    const near = (arr, r) => arr.filter(o => Math.hypot(o.x - cx, o.y - cy) < r).map(o => [o.x - cx, o.y - cy]);
    return { roads, legs, signals: near(M.signals, R * 1.4), crossings: near(M.crossings, R * 1.4), schools: near(M.schools, R * 1.4) };
  }

  // Taklif: har bir tarmoqda zebra + toʻxtash chizigʻi + svetofor (oʻng tomonda)
  function proposal(p, g) {
    const out = { zebras: [], signals: [], stops: [], yields: [], mains: [], note: '' };
    if (p.type === 'priority') {
      // Asosiy koʻcha tarmoqlari — “Asosiy yoʻl” (romb), qolganlari — “Yoʻl bering” (uchburchak) + toʻxtash chizigʻi
      const maxW = Math.max(8, ...g.legs.map(l => l.width));
      const major = p.major != null ? p.major : (g.legs.slice().sort((a, b) => b.rank - a.rank)[0] || {}).street;
      g.legs.forEach(l => {
        const off = maxW / 2 + 4, n = [l.d[1], -l.d[0]], at = [l.d[0] * (off + 5) + n[0] * (l.width / 2 + 2), l.d[1] * (off + 5) + n[1] * (l.width / 2 + 2)];
        if (l.street === major) out.mains.push(at);
        else { out.yields.push(at); out.stops.push({ c: [l.d[0] * (off + 2), l.d[1] * (off + 2)], d: l.d, w: l.width }); }
      });
      const mj = S_name(major, g), mn = [...new Set(g.legs.filter(l => l.street !== major).map(l => l.name || 'nomsiz yoʻl'))].join(', ');
      out.note = `${g.legs.length === 3 ? 'T-shaklidagi chorraha' : g.legs.length + ' tarmoqli chorraha'}: ${mj} — asosiy yoʻl (sariq romb), ${mn} — “Yoʻl bering” (qizil uchburchak) va toʻxtash chizigʻi. Svetofor kerak emas.`;
    } else if (p.type === 'junction') {
      const maxW = Math.max(8, ...g.legs.map(l => l.width));
      g.legs.forEach(l => {
        const off = maxW / 2 + 4, n = [l.d[1], -l.d[0]];         // oʻng tomon (yoʻnalishga nisbatan)
        out.zebras.push({ c: [l.d[0] * off, l.d[1] * off], d: l.d, w: l.width });
        out.stops.push({ c: [l.d[0] * (off + 4), l.d[1] * (off + 4)], d: l.d, w: l.width });
        out.signals.push([l.d[0] * (off + 5) + n[0] * (l.width / 2 + 1.8), l.d[1] * (off + 5) + n[1] * (l.width / 2 + 1.8)]);
      });
      out.note = `${g.legs.length} ta yoʻnalish: har birida svetofor, toʻxtash chizigʻi va piyoda oʻtish joyi.`;
    } else if (p.type === 'school') {
      // Maktabga eng yaqin yoʻl nuqtasi — koʻtarilgan piyoda oʻtish joyi
      let best = null;
      g.roads.forEach(r => { for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        let t = (-a[0] * dx - a[1] * dy) / L2; t = Math.max(0, Math.min(1, t));
        const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0], q[1]);
        if (!best || d < best.dist) { const l = Math.sqrt(L2); best = { c: q, d: [dx / l, dy / l], w: r.width, dist: d }; }
      } });
      if (best) {
        out.zebras.push({ c: best.c, d: [-best.d[1], best.d[0]], w: best.w, raised: true });
        out.note = `Maktab kirishiga eng yaqin joyda (${Math.round(best.dist)} m) koʻtarilgan piyoda oʻtish joyi, “Bolalar” belgisi, 30 km/soat.`;
      }
    }
    return out;
  }

  function S_name(sid, g) { const l = g.legs.find(x => x.street === sid); return (l && l.name) || 'nomsiz yoʻl'; }

  function svg(M, p, opt) {
    const g = geometry(M, p), pr = proposal(p, g), s = SIZE / (2 * R), C = SIZE / 2;
    const X = q => (C + q[0] * s).toFixed(1), Y = q => (C - q[1] * s).toFixed(1);
    const line = (pts) => pts.map((q, i) => (i ? 'L' : 'M') + X(q) + ' ' + Y(q)).join(' ');
    const forAI = opt && opt.forAI;
    const overlay = opt && opt.overlay;
    let h = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" class="plan-svg" role="img" aria-label="Joy rejasi">`;
    if (!overlay) h += `<rect width="${SIZE}" height="${SIZE}" fill="#e7ecd9"/>`;
    // Yoʻllar: chekka (bordyur) → asfalt → oʻrta chiziq (sunʼiy yoʻldosh suratida chizilmaydi — u yerda real yoʻl bor)
    if (!overlay) g.roads.forEach(r => { h += `<path d="${line(r.pts)}" stroke="#9aa1a8" stroke-width="${(r.width + 2) * s}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; });
    if (!overlay) g.roads.forEach(r => { h += `<path d="${line(r.pts)}" stroke="#4b5158" stroke-width="${r.width * s}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; });
    if (!overlay) g.roads.forEach(r => { if (!r.oneway && r.width > 6) h += `<path d="${line(r.pts)}" stroke="#f8fafc" stroke-width="1.2" stroke-dasharray="6 6" fill="none"/>`; });
    const zebra = (z, color) => {
      const n = [-z.d[1], z.d[0]], half = z.w / 2, stripes = Math.max(3, Math.round(z.w / 1.2));
      let o = '';
      for (let k = 0; k < stripes; k++) {
        const t = -half + (k + 0.5) * (z.w / stripes), c = [z.c[0] + n[0] * t, z.c[1] + n[1] * t];
        const a = [c[0] - z.d[0] * 1.5, c[1] - z.d[1] * 1.5], b = [c[0] + z.d[0] * 1.5, c[1] + z.d[1] * 1.5];
        o += `<path d="M${X(a)} ${Y(a)} L${X(b)} ${Y(b)}" stroke="${color}" stroke-width="${0.6 * s}" />`;
      }
      if (z.raised) o += `<circle cx="${X(z.c)}" cy="${Y(z.c)}" r="${(half + 2) * s}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3 3"/>`;
      return o;
    };
    const stop = z => { const n = [-z.d[1], z.d[0]], a = [z.c[0] + n[0] * z.w / 2, z.c[1] + n[1] * z.w / 2], b = [z.c[0] - n[0] * z.w / 2, z.c[1] - n[1] * z.w / 2]; return `<path d="M${X(a)} ${Y(a)} L${X(b)} ${Y(b)}" stroke="#fff" stroke-width="${0.5 * s}"/>`; };
    const light = (q, color, ring) => `<g><circle cx="${X(q)}" cy="${Y(q)}" r="7" fill="${ring}" stroke="#111" stroke-width="1"/><rect x="${+X(q) - 3}" y="${+Y(q) - 5}" width="6" height="10" rx="1.5" fill="#111"/><circle cx="${X(q)}" cy="${+Y(q) - 2.5}" r="1.4" fill="${color}"/><circle cx="${X(q)}" cy="${+Y(q) + 2.5}" r="1.4" fill="#22c55e"/></g>`;
    // Mavjud
    g.crossings.forEach(q => { h += `<rect x="${+X(q) - 4}" y="${+Y(q) - 4}" width="8" height="8" fill="#fff" stroke="#0ea5e9" stroke-width="1.5"/>`; });
    g.signals.forEach(q => { h += light(q, '#ef4444', '#cbd5e1'); });
    g.schools.forEach(q => { h += `<g><rect x="${+X(q) - 10}" y="${+Y(q) - 10}" width="20" height="20" rx="4" fill="#7c3aed"/><text x="${X(q)}" y="${+Y(q) + 5}" font-size="13" text-anchor="middle" fill="#fff" font-family="sans-serif">M</text></g>`; });
    // Taklif
    pr.zebras.forEach(z => { h += zebra(z, '#ffffff'); });
    pr.stops.forEach(z => { h += stop(z); });
    pr.signals.forEach(q => { h += light(q, '#ef4444', forAI ? '#ef4444' : '#fde047'); });
    // “Yoʻl bering” (2.4) — qizil chetli uchburchak (uchi pastga); “Asosiy yoʻl” (2.1) — sariq romb
    pr.yields.forEach(q => { const x = +X(q), y = +Y(q); h += `<path d="M${x - 8} ${y - 6} L${x + 8} ${y - 6} L${x} ${y + 8} Z" fill="#fff" stroke="#dc2626" stroke-width="3" stroke-linejoin="round"/>`; });
    pr.mains.forEach(q => { const x = +X(q), y = +Y(q); h += `<path d="M${x} ${y - 9} L${x + 9} ${y} L${x} ${y + 9} L${x - 9} ${y} Z" fill="#facc15" stroke="#fff" stroke-width="2.5"/><path d="M${x} ${y - 9} L${x + 9} ${y} L${x} ${y + 9} L${x - 9} ${y} Z" fill="none" stroke="#111" stroke-width=".8"/>`; });
    if (p.type === 'junction') h += `<circle cx="${C}" cy="${C}" r="5" fill="none" stroke="#dc2626" stroke-width="2"/>`;
    if (!forAI && !overlay) {
      h += `<g font-family="sans-serif" font-size="11"><rect x="6" y="6" width="22" height="22" rx="4" fill="#fff" opacity=".9"/><path d="M17 10 L22 22 L17 19 L12 22 Z" fill="#111"/><text x="17" y="36" text-anchor="middle" fill="#111">N</text></g>`;
      const bar = 20 * s;
      h += `<g font-family="sans-serif" font-size="10"><rect x="${SIZE - bar - 16}" y="${SIZE - 22}" width="${bar + 10}" height="16" rx="3" fill="#fff" opacity=".9"/><path d="M${SIZE - bar - 11} ${SIZE - 10} h${bar}" stroke="#111" stroke-width="2"/><text x="${SIZE - bar / 2 - 11}" y="${SIZE - 12}" text-anchor="middle">20 m</text></g>`;
    }
    h += '</svg>';
    return { svg: h, note: pr.note, legs: g.legs.length, names: [...new Set(g.legs.map(l => l.name).filter(Boolean))] };
  }

  // AI uchun PNG (data URL) — yorliqsiz, taklif belgilari qizil
  function png(M, p) {
    const { svg: h } = svg(M, p, { forAI: true });
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 768; c.height = 768;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 768, 768);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Reja rasmga aylanmadi'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(h);
    });
  }

  // Real sunʼiy yoʻldosh surati (Esri World Imagery) + yechim belgilari — tepadan haqiqiy koʻrinish
  const Z = 19, PX = 640;
  function satellite(M, p) {
    const n = 256 * Math.pow(2, Z), lat = (p.lat * Math.PI) / 180;
    const wx = ((p.lon + 180) / 360) * n, wy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
    const mpp = (156543.03392 * Math.cos(lat)) / Math.pow(2, Z), size = Math.round((2 * R) / mpp);   // 150 m
    const x0 = wx - size / 2, y0 = wy - size / 2, tiles = [];
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + size) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + size) / 256); ty++) tiles.push({ tx, ty, dx: tx * 256 - x0, dy: ty * 256 - y0 });
    const url = t => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${t.ty}/${t.tx}`;
    const over = svg(M, p, { overlay: true });
    return new Promise(resolve => {
      const c = document.createElement('canvas'); c.width = PX; c.height = PX;
      const x = c.getContext('2d'), k = PX / size;
      let left = tiles.length, failed = false;
      const done = () => {
        if (--left > 0) return;
        const img = new Image();
        img.onload = () => {
          x.drawImage(img, 0, 0, PX, PX);
          x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(PX - 190, PX - 18, 190, 18);
          x.fillStyle = '#111'; x.font = '11px sans-serif'; x.fillText('Surat: Esri, Maxar, Earthstar Geographics', PX - 186, PX - 5);
          let data = null;
          try { data = c.toDataURL('image/png'); } catch (e) { data = null; }
          resolve({ ok: !failed && !!data, data, note: over.note, tiles: tiles.map(t => ({ url: url(t), left: (t.dx * k) / PX * 100, top: (t.dy * k) / PX * 100, size: (256 * k) / PX * 100 })), overlay: over.svg });
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(over.svg);
      };
      tiles.forEach(t => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => { x.drawImage(im, t.dx * k, t.dy * k, 256 * k, 256 * k); done(); };
        im.onerror = () => { failed = true; done(); };
        im.src = url(t);
      });
    });
  }

  NX.plan = { svg, png, geometry, satellite };
})();
