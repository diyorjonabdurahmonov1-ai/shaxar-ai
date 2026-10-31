/* City Jam — xaritada chizilgan yangi koʻcha (yoki mavjud koʻchani kengaytirish) tekshiruvi.
   Chiziq har 10 m da tekshiriladi: UNESCO muhofaza zonasi (VM 119-son 9-ilova), bosh reja zonasi (geoportal),
   mavjud koʻcha ustidan oʻtadimi, qaysi binolar yoʻl kengligiga tushadi (buziladi), yodgorliklar yaqinmi,
   uchlari tarmoqqa ulanadimi va mavjud yoʻllar orqali aylanib oʻtish qancha uzun (Dijkstra).
   Natija — boʻlaklar (har biri: zona, holat, sabab), umumiy xulosa va xarita uchun geometriya. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;
  const MP = () => NX.masterplan;
  const STEP = 10;
  const LV = { mumkin: 0, shartli: 1, kelishuv: 2, taqiq: 3 };
  const LVUZ = { mumkin: 'Mumkin', shartli: 'Shartli (loyiha bilan)', kelishuv: 'Kelishuv kerak', taqiq: 'Mumkin emas' };
  const ICON = { mumkin: '✅', shartli: '🟡', kelishuv: '⚠️', taqiq: '⛔' };
  const COLOR = { mumkin: '#22c55e', shartli: '#eab308', kelishuv: '#f59e0b', taqiq: '#ef4444' };

  // Chiziqni teng qadamli nuqtalarga boʻlish
  function densify(line) {
    const xy = line.map(p => G.xy(p[0], p[1])), out = [];
    let acc = 0, next = 0;
    for (let i = 1; i < xy.length; i++) {
      const [ax, ay] = xy[i - 1], [bx, by] = xy[i], L = Math.hypot(bx - ax, by - ay);
      while (L > 0 && next <= acc + L) { const t = (next - acc) / L; out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, d: next }); next += STEP; }
      acc += L;
    }
    const last = xy[xy.length - 1];
    if (!out.length || out[out.length - 1].d < acc - 1) out.push({ x: last[0], y: last[1], d: acc });
    out.forEach(p => { const ll = G.ll(p.x, p.y); p.lat = ll[0]; p.lon = ll[1]; });
    return { pts: out, len: acc, xy };
  }

  // Nuqtadan chiziqqacha masofa (m)
  function distToLine(xy, x, y) {
    let b = Infinity;
    for (let i = 1; i < xy.length; i++) b = Math.min(b, G.segDist(x, y, xy[i - 1][0], xy[i - 1][1], xy[i][0], xy[i][1]));
    return b;
  }

  // Boʻlak holati va sababi
  function judge(k) {
    const Z = MP().ZONES;
    if (k.her === 'afrosiyob') return { lv: 'taqiq', why: 'Afrosiyob arxeologik yodgorligi (UNESCO asosiy hududi) — kapital qurilish va yer qazish taqiqlanadi (265-son nizom 17-band)', tur: 'unesco' };
    if ((k.her === 'temur' || k.her === 'yevropa') && !k.onRoad) return { lv: 'taqiq', why: `UNESCO asosiy hududi (${Z[k.her].qisqa}) — yangi koʻcha ochish tarixiy rejaviy tuzilmani va kvartal chegaralarini oʻzgartiradi; Madaniy meros agentligi va UNESCO Umumjahon merosi markazi kelishuvisiz, merosga taʼsirni baholashsiz mumkin emas (VM 119-son 1-band, 265-son nizom 17-band)`, tur: 'unesco' };
    if (k.plan === 'konservatsiya' && !k.onRoad) return { lv: 'taqiq', why: 'Bosh reja: konservatsiya zonasi (yashil hudud, suv yoki yoʻl boʻyi himoya hududi) — qoʻshimcha inshoot qurilishi taqiqlanadi', tur: 'reja' };
    if (k.her === 'temur' || k.her === 'yevropa') return { lv: 'kelishuv', why: `UNESCO asosiy hududi (${Z[k.her].qisqa}) — mavjud koʻchani oʻzgartirish ham Madaniy meros agentligi va UNESCO bilan kelishiladi`, tur: 'unesco' };
    if (k.her === 'bufer') return { lv: 'kelishuv', why: 'UNESCO bufer zonasi — yoʻl kengligi, balandlik va koʻrinish Madaniy meros agentligi bilan kelishiladi (265-son nizom 18-band)', tur: 'unesco' };
    if (k.plan === 'rekonstruksiya' && !k.onRoad) return { lv: 'shartli', why: 'Bosh reja: rekonstruksiya zonasi — mavjud uylar orasidan yangi koʻcha faqat batafsil rejalashtirish loyihasi va jamoatchilik fikri bilan', tur: 'reja' };
    if (k.plan === 'renovatsiya') return { lv: 'mumkin', why: 'Bosh reja: renovatsiya zonasi — master-reja asosida yangi koʻcha tarmogʻi shakllantiriladi', tur: 'reja' };
    if (k.plan == null) return { lv: 'shartli', why: 'Bosh reja chegarasidan (28 415 ga) tashqarida — avval shahar chegarasi va loyihani aniqlash kerak', tur: 'reja' };
    return { lv: 'mumkin', why: k.onRoad ? 'Mavjud koʻcha yoʻlagi ustidan — zona cheklovi yoʻq' : 'Zona cheklovi yoʻq', tur: 'reja' };
  }

  // Mavjud yoʻllar grafi (bir marta quriladi)
  function graph(M) {
    if (M._rg) return M._rg;
    const id = new Map(), X = [], Y = [], adj = [];
    const node = (nid, x, y) => { let i = id.get(nid); if (i == null) { i = X.length; id.set(nid, i); X.push(x); Y.push(y); adj.push([]); } return i; };
    M.ways.forEach(w => {
      if (!w.nodes || w.nodes.length !== w.xy.length) return;
      for (let k = 1; k < w.nodes.length; k++) {
        const a = node(w.nodes[k - 1], w.xy[k - 1][0], w.xy[k - 1][1]), b = node(w.nodes[k], w.xy[k][0], w.xy[k][1]);
        const L = Math.hypot(X[a] - X[b], Y[a] - Y[b]);
        adj[a].push(b, L); adj[b].push(a, L);
      }
    });
    return (M._rg = { X, Y, adj });
  }
  function nearestNode(g, x, y) {
    let b = -1, bd = Infinity;
    for (let i = 0; i < g.X.length; i++) { const d = (g.X[i] - x) ** 2 + (g.Y[i] - y) ** 2; if (d < bd) { bd = d; b = i; } }
    return { i: b, d: Math.sqrt(bd) };
  }
  // Dijkstra (ikkilik uyum) — eng qisqa yoʻl va uning nuqtalari
  function shortest(g, s, t) {
    const n = g.X.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), h = [];
    const push = (d, i) => { h.push([d, i]); let c = h.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (h[p][0] <= h[c][0]) break; [h[p], h[c]] = [h[c], h[p]]; c = p; } };
    const pop = () => { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === c) break; [h[m], h[c]] = [h[c], h[m]]; c = m; } } return top; };
    dist[s] = 0; push(0, s);
    while (h.length) {
      const [d, u] = pop();
      if (u === t) break;
      if (d > dist[u]) continue;
      const a = g.adj[u];
      for (let k = 0; k < a.length; k += 2) { const v = a[k], nd = d + a[k + 1]; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); } }
    }
    if (!isFinite(dist[t])) return null;
    const path = []; for (let v = t; v !== -1; v = prev[v]) path.push(G.ll(g.X[v], g.Y[v]));
    return { len: dist[t], path: path.reverse() };
  }

  async function analyze(M, line, opt) {
    opt = opt || {};
    const width = opt.width || 15, half = width / 2;
    if (!line || line.length < 2) throw new Error('Koʻcha chizigʻi kamida 2 nuqtadan iborat boʻlishi kerak.');
    await Promise.race([MP().planMap(), NX.sleep(8000)]);
    const D = densify(line);
    // 1) Har bir nuqta: zonalar va mavjud koʻcha
    const names = new Map();
    D.pts.forEach(p => {
      p.her = MP().zoneAt(p.lat, p.lon);
      p.plan = MP().planZoneSync(p.lat, p.lon);
      const near = M.streetsNear ? M.streetsNear(p.x, p.y, Math.max(8, half)) : new Map();
      p.onRoad = near.size > 0;
      near.forEach((d, sid) => { const s = M.streets[sid]; if (s && s.name) names.set(s.name, (names.get(s.name) || 0) + 1); });
    });
    // 2) Ketma-ket bir xil holatdagi nuqtalar — boʻlaklar
    const segs = [];
    D.pts.forEach(p => {
      const key = [p.her, p.plan, p.onRoad].join('|'), last = segs[segs.length - 1];
      if (last && last.key === key) { last.pts.push(p); return; }
      const j = judge(p);
      // boʻlaklar uzluksiz chizilishi uchun oldingi boʻlakning oxirgi nuqtasi ham olinadi
      segs.push({ key, her: p.her, plan: p.plan === undefined ? 'nomaʼlum' : p.plan, onRoad: p.onRoad, lv: j.lv, why: j.why, tur: j.tur, pts: last ? [last.pts[last.pts.length - 1], p] : [p] });
    });
    // Holati va sababi bir xil qoʻshni boʻlaklar birlashtiriladi (masalan, mavjud koʻcha ustida/yonida almashib turishi)
    for (let i = 1; i < segs.length; i++) if (segs[i].lv === segs[i - 1].lv && segs[i].why === segs[i - 1].why) { segs[i - 1].pts = segs[i - 1].pts.concat(segs[i].pts.slice(1)); segs.splice(i, 1); i--; }
    // Juda qisqa (<20 m) boʻlaklar qoʻshnisiga qoʻshiladi (zona chegarasidagi shovqin)
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], L = s.pts[s.pts.length - 1].d - s.pts[0].d;
      if (L < 20 && segs.length > 1) {
        const nb = segs[i - 1] && (!segs[i + 1] || LV[segs[i - 1].lv] >= LV[segs[i + 1].lv]) ? segs[i - 1] : segs[i + 1];
        if (nb && LV[nb.lv] >= LV[s.lv]) { if (nb === segs[i - 1]) nb.pts = nb.pts.concat(s.pts.slice(1)); else nb.pts = s.pts.concat(nb.pts.slice(1)); segs.splice(i, 1); i--; }
      }
    }
    segs.forEach((s, i) => {
      s.i = i; s.from = Math.round(s.pts[0].d); s.to = Math.round(s.pts[s.pts.length - 1].d); s.len = s.to - s.from;
      s.path = s.pts.map(p => [p.lat, p.lon]);
      const m = s.pts[Math.floor(s.pts.length / 2)]; s.mid = [m.lat, m.lon];
      delete s.pts; delete s.key;
    });
    // 3) Binolar: yoʻl kengligiga tushadiganlari buziladi
    const B = (NX.buildings && NX.buildings.get && NX.buildings.get()) || [];
    const xs = D.xy.map(p => p[0]), ys = D.xy.map(p => p[1]), pad = half + 60;
    const bx0 = Math.min(...xs) - pad, bx1 = Math.max(...xs) + pad, by0 = Math.min(...ys) - pad, by1 = Math.max(...ys) + pad;
    const hit = [];
    B.forEach(b => {
      if (!b.c) return;
      const [cx, cy] = G.xy(b.c[0], b.c[1]);
      if (cx < bx0 || cx > bx1 || cy < by0 || cy > by1) return;
      const r = Math.sqrt(b.area || 50) / 2;
      if (distToLine(D.xy, cx, cy) > half + r + 2) return;
      // aniqroq: bino burchaklaridan biri yoʻl kengligida yoki yoʻl bino ichidan oʻtadi
      const ring = (b.ring || []).map(q => G.xy(q[1], q[0]));
      const touches = ring.some(q => distToLine(D.xy, q[0], q[1]) <= half) || distToLine(D.xy, cx, cy) <= half;
      if (touches) hit.push({ c: b.c, ring: b.ring, levels: b.levels, est: b.est, area: Math.round(b.area || 0), name: b.name || '', kind: b.kind });
    });
    // 4) Yodgorliklar yaqinligi
    const mons = MP().MONUMENTS.map(m => { const [mx, my] = G.xy(m.c[0], m.c[1]); return { name: m.name, c: m.c, d: Math.round(distToLine(D.xy, mx, my)) }; }).filter(m => m.d < 200).sort((a, b) => a.d - b.d);
    // 5) Tarmoqqa ulanish va mavjud yoʻllar orqali aylanib oʻtish
    let net = null, ends = null;
    try {
      const g = graph(M);
      if (g.X.length) {
        const a = nearestNode(g, D.xy[0][0], D.xy[0][1]), b = nearestNode(g, D.xy[D.xy.length - 1][0], D.xy[D.xy.length - 1][1]);
        ends = { boshi_m: Math.round(a.d), oxiri_m: Math.round(b.d) };
        if (a.i !== b.i) { const sp = shortest(g, a.i, b.i); if (sp) net = { mavjud_yol_m: Math.round(sp.len), yangi_m: Math.round(D.len), qisqarish_m: Math.round(sp.len - D.len), path: sp.path }; }
      }
    } catch (e) { console.warn('Tarmoq:', e); }
    // 6) Xulosa
    const worst = segs.reduce((w, s) => (LV[s.lv] > LV[w] ? s.lv : w), 'mumkin');
    const byLv = {}; segs.forEach(s => { byLv[s.lv] = (byLv[s.lv] || 0) + s.len; });
    const her = {}; segs.forEach(s => { if (s.her) her[s.her] = (her[s.her] || 0) + s.len; });
    const plan = {}; segs.forEach(s => { plan[s.plan || 'tashqari'] = (plan[s.plan || 'tashqari'] || 0) + s.len; });
    const reasons = [];
    segs.filter(s => LV[s.lv] >= 1).sort((a, b) => LV[b.lv] - LV[a.lv] || b.len - a.len).forEach(s => {
      if (!reasons.some(r => r.why === s.why)) reasons.push({ lv: s.lv, why: s.why, len: s.len, lat: s.mid[0], lon: s.mid[1], tur: s.tur });
    });
    if (hit.length) reasons.push({ lv: hit.length > 20 ? 'kelishuv' : 'shartli', why: `${hit.length} ta bino yoʻl kengligiga (${width} m) tushadi — buzish va kompensatsiya kerak`, lat: hit[0].c[0], lon: hit[0].c[1], tur: 'bino' });
    mons.filter(m => m.d < 100).forEach(m => reasons.push({ lv: 'kelishuv', why: `${m.name} yodgorligiga ${m.d} m — tebranish va koʻrinishga taʼsir; Madaniy meros agentligi xulosasi kerak`, lat: m.c[0], lon: m.c[1], tur: 'unesco' }));
    const worstAll = reasons.reduce((w, r) => (LV[r.lv] > LV[w] ? r.lv : w), worst);
    return {
      line, width, uzunlik_m: Math.round(D.len), segs, binolar: hit, yodgorliklar: mons, ulanish: ends, tarmoq: net,
      koʻchalar: [...names.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 12),
      xulosa: { holat: worstAll, nomi: LVUZ[worstAll], belgi: ICON[worstAll], uzunlik_holat_boʻyicha_m: byLv, unesco_m: her, bosh_reja_m: plan, sabablar: reasons },
    };
  }

  // AI ishlamasa ham toʻliq javob
  function summary(R) {
    const X = R.xulosa, km = m => (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : m + ' m');
    const out = [`**Xulosa: ${X.belgi} ${X.nomi}** — ${km(R.uzunlik_m)} uzunlikdagi, ${R.width} m kenglikdagi koʻcha.`];
    if (X.sabablar.length) out.push('**Nega:**\n' + X.sabablar.slice(0, 6).map(r => `- ${ICON[r.lv]} ${r.why}${r.len ? ` (${km(r.len)})` : ''}`).join('\n'));
    const t = [];
    if (R.tarmoq) t.push(R.tarmoq.qisqarish_m > 50 ? `Hozir bu ikki nuqta orasi mavjud yoʻllar bilan ${km(R.tarmoq.mavjud_yol_m)} — yangi koʻcha yoʻlni ${km(R.tarmoq.qisqarish_m)} qisqartiradi.` : `Mavjud yoʻllar bilan ham deyarli shuncha (${km(R.tarmoq.mavjud_yol_m)}) — yangi koʻcha katta foyda bermaydi.`);
    if (R.ulanish) t.push(`Uchlari mavjud koʻchalarga ${R.ulanish.boshi_m} m va ${R.ulanish.oxiri_m} m${Math.max(R.ulanish.boshi_m, R.ulanish.oxiri_m) > 40 ? ' — tarmoqqa toʻliq ulanmagan uch bor' : ' — tarmoqqa ulanadi'}.`);
    t.push(R.binolar.length ? `Yoʻl yoʻlagiga ${R.binolar.length} ta bino tushadi (taxminan ${R.binolar.reduce((s, b) => s + (b.area || 0), 0).toLocaleString('ru-RU')} m² qurilish osti).` : 'Yoʻl yoʻlagida bino yoʻq.');
    if (R.koʻchalar.length) t.push(`Kesib oʻtadigan / ulanadigan koʻchalar: ${R.koʻchalar.slice(0, 6).join(', ')}.`);
    out.push('**Hisob:**\n' + t.map(x => '- ' + x).join('\n'));
    const todo = [];
    if (X.holat === 'taqiq') todo.push('Marshrutni xaritada qizil boʻlaklardan (UNESCO asosiy hududi, konservatsiya zonasi) tashqariga suring yoki mavjud koʻchalarni (yashil punktir) kengaytirish variantini koʻring.');
    if (Object.keys(X.unesco_m).length) todo.push('Madaniy meros agentligiga loyiha va merosga taʼsirni baholash (HIA) hisobotini kiriting.');
    if (R.binolar.length) todo.push('Buziladigan binolar roʻyxati va kompensatsiya hisobini tayyorlang.');
    todo.push('Bosh reja asosida batafsil rejalashtirish loyihasi va qizil chiziqlar bilan solishtiring.');
    out.push('**Nima qilish kerak:**\n' + todo.map(x => '- ' + x).join('\n'));
    return out.join('\n\n');
  }

  // AI uchun ixcham maʼlumot
  function facts(R) {
    return {
      uzunlik_m: R.uzunlik_m, kenglik_m: R.width, xulosa: { holat: R.xulosa.nomi, sabablar: R.xulosa.sabablar.map(r => ({ holat: LVUZ[r.lv], sabab: r.why, uzunlik_m: r.len || null })) },
      boʻlaklar: R.segs.map(s => ({ m: `${s.from}–${s.to}`, unesco: s.her ? MP().ZONES[s.her].qisqa : 'tashqarida', bosh_reja: s.plan, mavjud_koʻcha_ustida: s.onRoad, holat: LVUZ[s.lv] })),
      unesco_m: R.xulosa.unesco_m, bosh_reja_m: R.xulosa.bosh_reja_m,
      buziladigan_binolar: { soni: R.binolar.length, maydon_m2: R.binolar.reduce((s, b) => s + (b.area || 0), 0), nomlilari: R.binolar.filter(b => b.name).map(b => b.name).slice(0, 8) },
      yaqin_yodgorliklar: R.yodgorliklar.map(m => `${m.name} — ${m.d} m`), koʻchalar: R.koʻchalar, ulanish_m: R.ulanish,
      mavjud_yollar_orqali: R.tarmoq ? { masofa_m: R.tarmoq.mavjud_yol_m, qisqarish_m: R.tarmoq.qisqarish_m } : null,
      qoidalar: { konservatsiya: MP().PLAN.zonalar.konservatsiya, rekonstruksiya: MP().PLAN.zonalar.rekonstruksiya, renovatsiya: MP().PLAN.zonalar.renovatsiya, unesco: MP().PLAN.unesco, qizil_chiziq: MP().PLAN.talablar.qizil_chiziq },
    };
  }

  NX.roadcheck = { analyze, summary, facts, LV, LVUZ, ICON, COLOR };
})();
