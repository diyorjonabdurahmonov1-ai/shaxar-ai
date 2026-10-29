/* City Jam — “Agar…?” simulyatsiyasi yadrosi.
   Bu funksiya toʻliq mustaqil: Web Worker ichida (Blob orqali) yoki zaxira sifatida asosiy oqimda ishlaydi.
   Model: yoʻnaltirilgan graf (OSM), gravitatsion talab matritsasi, MSA foydalanuvchi muvozanati, BPR funksiyasi. */
function NXSimFactory() {
  'use strict';
  const DEF = {
    trunk: { v: 60, l2: 4, l1: 2, w: 3 }, primary: { v: 50, l2: 4, l1: 2, w: 3 }, secondary: { v: 50, l2: 2, l1: 2, w: 2.5 },
    tertiary: { v: 40, l2: 2, l1: 1, w: 2 }, unclassified: { v: 30, l2: 2, l1: 1, w: 1 }, residential: { v: 30, l2: 2, l1: 1, w: 1 },
    living_street: { v: 20, l2: 2, l1: 1, w: 0.5 },
  };
  const LANE_CAP = 900;     // avtomobil/soat bir polosaga
  const ZONE = 500;         // zona katagi, m
  const BETA = 1500;        // gravitatsiya: masofa pasayishi, m
  const SPEED_F = 0.8;      // shahar sharoitida chorraha kechikishlari uchun tezlik koeffitsienti
  const BPR_A = 0.15, BPR_B = 4;

  let N = null;
  const baseCache = new Map();

  function lanesDir(w, fwd) {
    const df = DEF[w.hw] || DEF.residential;
    if (w.oneway !== 0) return Math.max(1, w.lanes || df.l1);
    const t = fwd ? w.lanesF : w.lanesB;
    if (t) return t;
    return Math.max(1, Math.round((w.lanes || df.l2) / 2));
  }

  function csr(n, keyArr) {
    const E = keyArr.length, start = new Int32Array(n + 1);
    for (let e = 0; e < E; e++) start[keyArr[e] + 1]++;
    for (let i = 0; i < n; i++) start[i + 1] += start[i];
    const fill = start.slice(0, n), list = new Int32Array(E);
    for (let e = 0; e < E; e++) list[fill[keyArr[e]]++] = e;
    return { start, list };
  }

  function build(net) {
    baseCache.clear();
    // 1. Tugunlar: yoʻl uchlari va bir nechta yoʻl kesishgan nuqtalar — graf tugunlari
    const use = new Map();
    net.ways.forEach(w => w.nodes.forEach((id, k) => use.set(id, (use.get(id) || 0) + (k === 0 || k === w.nodes.length - 1 ? 2 : 1))));
    const nodeIdx = new Map(), nx = [], ny = [];
    const nodeOf = (id, p) => { let i = nodeIdx.get(id); if (i == null) { i = nx.length; nodeIdx.set(id, i); nx.push(p[0]); ny.push(p[1]); } return i; };
    const pieces = [];
    net.ways.forEach((w, wi) => {
      let i0 = 0;
      for (let k = 1; k < w.nodes.length; k++) {
        if (k !== w.nodes.length - 1 && use.get(w.nodes[k]) < 2) continue;
        let len = 0;
        for (let j = i0; j < k; j++) len += Math.hypot(w.xy[j + 1][0] - w.xy[j][0], w.xy[j + 1][1] - w.xy[j][1]);
        const a = nodeOf(w.nodes[i0], w.xy[i0]), b = nodeOf(w.nodes[k], w.xy[k]);
        if (len > 0.5 && a !== b) pieces.push({ w: wi, i0, i1: k, a, b, len });
        i0 = k;
      }
    });
    const nN = nx.length, P = pieces.length, E = P * 2;
    // 2. Har bir boʻlak uchun ikki yoʻnalishli qirra; bazaviy holatda OSM oneway boʻyicha yoqiladi
    const eFrom = new Int32Array(E), eTo = new Int32Array(E), eLen = new Float64Array(E), eT0 = new Float64Array(E);
    const eCap = new Float64Array(E), eOn = new Uint8Array(E), pStreet = new Int32Array(P), pLen = new Float64Array(P);
    pieces.forEach((p, pi) => {
      const w = net.ways[p.w], df = DEF[w.hw] || DEF.residential;
      const v = (w.maxspeed && w.maxspeed >= 5 ? Math.min(w.maxspeed, 90) : df.v) * SPEED_F;
      const t0 = p.len / 1000 / v;
      const living = w.hw === 'living_street' ? 0.5 : 1;
      pStreet[pi] = w.street; pLen[pi] = p.len;
      for (let dir = 0; dir < 2; dir++) {
        const e = 2 * pi + dir, fwd = dir === 0;
        eFrom[e] = fwd ? p.a : p.b; eTo[e] = fwd ? p.b : p.a;
        eLen[e] = p.len; eT0[e] = t0;
        eCap[e] = lanesDir(w, fwd) * LANE_CAP * living;
        eOn[e] = w.oneway === 0 ? 1 : w.oneway === 1 ? (fwd ? 1 : 0) : (fwd ? 0 : 1);
      }
    });
    const out = csr(nN, eFrom), inn = csr(nN, eTo);
    N = { nN, P, E, nx: Float64Array.from(nx), ny: Float64Array.from(ny), pieces, eFrom, eTo, eLen, eT0, eCap, eOn, pStreet, pLen, out, inn, nStreets: net.nStreets, names: net.names };

    // Koʻcha → boʻlaklar
    N.streetPieces = new Map();
    for (let p = 0; p < P; p++) { const s = pStreet[p]; let a = N.streetPieces.get(s); if (!a) N.streetPieces.set(s, (a = [])); a.push(p); }

    // 3. Eng katta kuchli bogʻlangan komponent (Kosaraju)
    const comp = scc(eOn);
    N.compId = comp.id; N.compBest = comp.best;
    // 4. Zonalar (500×500 m) va talab
    const b = net.bounds, zx = Math.max(1, Math.ceil((b.x1 - b.x0) / ZONE)), zy = Math.max(1, Math.ceil((b.y1 - b.y0) / ZONE));
    const cellOf = (x, y) => { const i = Math.floor((x - b.x0) / ZONE), j = Math.floor((y - b.y0) / ZONE); return i < 0 || j < 0 || i >= zx || j >= zy ? -1 : j * zx + i; };
    const wgt = new Float64Array(zx * zy);
    pieces.forEach(p => {
      const w = net.ways[p.w], c = cellOf((N.nx[p.a] + N.nx[p.b]) / 2, (N.ny[p.a] + N.ny[p.b]) / 2);
      if (c >= 0) wgt[c] += (p.len / 1000) * (DEF[w.hw] || DEF.residential).w;
    });
    net.stops.forEach(s => { const c = cellOf(s[0], s[1]); if (c >= 0) wgt[c] += 0.3; });
    const cand = Array.from({ length: zx * zy }, () => []);
    for (let v = 0; v < nN; v++) {
      if (comp.id[v] !== comp.best) continue;
      const c = cellOf(N.nx[v], N.ny[v]);
      if (c < 0) continue;
      let sc = 0;
      for (let it = out.start[v]; it < out.start[v + 1]; it++) { const e = out.list[it]; if (eOn[e]) sc += eCap[e]; }
      cand[c].push([v, sc]);
    }
    const zones = [];
    for (let c = 0; c < zx * zy; c++) {
      if (wgt[c] < 0.05 || !cand[c].length) continue;
      const cx = b.x0 + ((c % zx) + 0.5) * ZONE, cy = b.y0 + (Math.floor(c / zx) + 0.5) * ZONE;
      const list = cand[c].sort((p, q) => q[1] - p[1] || Math.hypot(N.nx[p[0]] - cx, N.ny[p[0]] - cy) - Math.hypot(N.nx[q[0]] - cx, N.ny[q[0]] - cy)).slice(0, 4).map(p => p[0]);
      const dc = Math.hypot(cx - net.center[0], cy - net.center[1]);
      zones.push({ cx, cy, P: wgt[c], A: wgt[c] * (1 + 1.5 * Math.exp(-dc / 1000)), cand: list });
    }
    const Z = zones.length, M = new Float64Array(Z * Z);
    let sum = 0;
    for (let i = 0; i < Z; i++) for (let j = 0; j < Z; j++) {
      if (i === j) continue;
      const d = Math.max(250, Math.hypot(zones[i].cx - zones[j].cx, zones[i].cy - zones[j].cy));
      const v = zones[i].P * zones[j].A * Math.exp(-d / BETA);
      M[i * Z + j] = v; sum += v;
    }
    if (sum > 0) for (let k = 0; k < M.length; k++) M[k] /= sum;
    N.zones = zones; N.Z = Z; N.M = M;
    // Dijkstra uchun ishchi massivlar
    N.dist = new Float64Array(nN); N.pred = new Int32Array(nN); N.done = new Int32Array(nN); N.stamp = 0;
    N.order = new Int32Array(nN); N.flow = new Float64Array(nN);
    N.hk = new Float64Array(E + nN + 1); N.hv = new Int32Array(E + nN + 1);
    return {
      nodes: nN, pieces: P, edges: E, zones: Z, sccShare: comp.size / Math.max(1, nN),
      pieceRefs: Int32Array.from(pieces.flatMap(p => [p.w, p.i0, p.i1])),
    };
  }

  function scc(on) {
    const { nN, out, inn, eTo, eFrom } = N;
    const visited = new Uint8Array(nN), order = new Int32Array(nN), stack = new Int32Array(nN), its = new Int32Array(nN);
    let oc = 0;
    for (let s = 0; s < nN; s++) {
      if (visited[s]) continue;
      let sp = 0; stack[0] = s; its[0] = out.start[s]; visited[s] = 1; sp = 1;
      while (sp) {
        const v = stack[sp - 1]; let it = its[sp - 1], pushed = false;
        while (it < out.start[v + 1]) {
          const e = out.list[it++];
          if (!on[e]) continue;
          const u = eTo[e];
          if (!visited[u]) { its[sp - 1] = it; visited[u] = 1; stack[sp] = u; its[sp] = out.start[u]; sp++; pushed = true; break; }
        }
        if (!pushed) { sp--; order[oc++] = v; }
      }
    }
    const id = new Int32Array(nN).fill(-1);
    let c = 0, best = -1, bestSize = 0;
    for (let k = nN - 1; k >= 0; k--) {
      const s = order[k];
      if (id[s] >= 0) continue;
      let sp = 0, size = 0; stack[sp++] = s; id[s] = c;
      while (sp) {
        const v = stack[--sp]; size++;
        for (let it = inn.start[v]; it < inn.start[v + 1]; it++) {
          const e = inn.list[it]; if (!on[e]) continue;
          const u = eFrom[e]; if (id[u] < 0) { id[u] = c; stack[sp++] = u; }
        }
      }
      if (size > bestSize) { bestSize = size; best = c; }
      c++;
    }
    return { id, best, size: bestSize };
  }

  function dijkstra(src, t, on) {
    const { dist, pred, done, order, hk, hv, out, eTo } = N;
    const stamp = ++N.stamp;
    dist.fill(Infinity); dist[src] = 0; pred[src] = -1;
    let hs = 0, cnt = 0;
    const push = (k, v) => { let i = hs++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
    push(0, src);
    while (hs) {
      const d = hk[0], v = hv[0];
      const lk = hk[--hs], lv = hv[hs];
      let i = 0;
      while (true) { let c = 2 * i + 1; if (c >= hs) break; if (c + 1 < hs && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; }
      if (hs) { hk[i] = lk; hv[i] = lv; }
      if (done[v] === stamp || d > dist[v]) continue;
      done[v] = stamp; order[cnt++] = v;
      for (let it = out.start[v]; it < out.start[v + 1]; it++) {
        const e = out.list[it]; if (!on[e]) continue;
        const u = eTo[e], nd = d + t[e];
        if (nd < dist[u]) { dist[u] = nd; pred[u] = e; push(nd, u); }
      }
    }
    return cnt;
  }

  // Hammasi-yoki-hech narsa (all-or-nothing) taqsimoti
  function aon(t, on, zn, D, y, ex) {
    y.fill(0);
    const { Z, M, dist, pred, order, flow, eFrom } = N;
    let unassigned = 0;
    const back = (o, cnt) => {
      for (let k = cnt - 1; k > 0; k--) {
        const v = order[k], f = flow[v];
        if (f > 0) { const e = pred[v]; y[e] += f; flow[eFrom[e]] += f; }
        flow[v] = 0;
      }
      flow[o] = 0;
    };
    for (let i = 0; i < Z; i++) {
      const o = zn[i];
      if (o < 0) { for (let j = 0; j < Z; j++) unassigned += D * M[i * Z + j]; if (ex) ex.list.forEach(b => { unassigned += b.inQ[i]; }); continue; }
      const cnt = dijkstra(o, t, on);
      for (let j = 0; j < Z; j++) {
        if (i === j) continue;
        const q = D * M[i * Z + j]; if (q <= 0) continue;
        const dd = zn[j];
        if (dd < 0 || dist[dd] === Infinity) { unassigned += q; continue; }
        flow[dd] += q;
      }
      // Yangi binoga keladigan safarlar
      if (ex) ex.list.forEach(b => { if (b.inQ[i] <= 0) return; if (dist[b.node] === Infinity) unassigned += b.inQ[i]; else if (b.node !== o) flow[b.node] += b.inQ[i]; });
      back(o, cnt);
    }
    // Yangi binodan chiqadigan safarlar
    if (ex) ex.list.forEach(b => {
      const cnt = dijkstra(b.node, t, on);
      for (let j = 0; j < Z; j++) {
        const q = b.outQ[j], dd = zn[j]; if (q <= 0) continue;
        if (dd < 0 || dist[dd] === Infinity) { unassigned += q; continue; }
        if (dd !== b.node) flow[dd] += q;
      }
      back(b.node, cnt);
    });
    return unassigned;
  }

  // Yangi bino: atrofdagi yoʻl tugunlari (4 tagacha, 300 m ichida) va safarlarning zonalar boʻyicha taqsimoti (gravitatsiya)
  function buildExtra(sc, on, zn) {
    const { out, inn, nx, ny, zones, Z } = N;
    const has = (adj, v) => { for (let it = adj.start[v]; it < adj.start[v + 1]; it++) if (on[adj.list[it]]) return true; return false; };
    const cand = [];
    for (let v = 0; v < N.nN; v++) {
      if (N.compId[v] !== N.compBest || !has(out, v) || !has(inn, v)) continue;
      cand.push([v, Math.hypot(nx[v] - sc.at[0], ny[v] - sc.at[1])]);
    }
    if (!cand.length) return null;
    cand.sort((a, b) => a[1] - b[1]);
    // Bir-biridan kamida 60 m uzoq tugunlar — safarlar bir nechta chiqish yoʻliga boʻlinadi
    const pick = [cand[0]];
    for (const c of cand) {
      if (pick.length >= 4 || c[1] > Math.max(300, cand[0][1] + 100)) break;
      if (pick.every(p => Math.hypot(nx[p[0]] - nx[c[0]], ny[p[0]] - ny[c[0]]) >= 60)) pick.push(c);
    }
    const trips = Math.max(0, sc.trips || 0), outShare = sc.outShare == null ? 0.7 : sc.outShare, share = trips / pick.length;
    const list = pick.map(([node]) => {
      const wo = new Float64Array(Z), wi = new Float64Array(Z);
      let so = 0, si = 0;
      for (let j = 0; j < Z; j++) {
        if (zn[j] < 0) continue;
        const d = Math.max(250, Math.hypot(zones[j].cx - nx[node], zones[j].cy - ny[node])), k = Math.exp(-d / BETA);
        wo[j] = zones[j].A * k; wi[j] = zones[j].P * k; so += wo[j]; si += wi[j];
      }
      for (let j = 0; j < Z; j++) { wo[j] = so > 0 ? (wo[j] / so) * share * outShare : 0; wi[j] = si > 0 ? (wi[j] / si) * share * (1 - outShare) : 0; }
      return { node, outQ: wo, inQ: wi };
    });
    return { list, node: pick[0][0], dist: cand[0][1], trips };
  }

  function times(t, x, cap, on) {
    const { eT0, E } = N;
    for (let e = 0; e < E; e++) t[e] = on[e] ? eT0[e] * (1 + BPR_A * Math.pow(x[e] / cap[e], BPR_B)) : Infinity;
  }

  function applyScenario(sc, on, cap) {
    const notes = [];
    if (!sc || sc.type === 'none') return { factor: 1, notes };
    if (sc.type === 'demand') return { factor: sc.factor || 1.2, notes };
    if (sc.type === 'build') return { factor: sc.growth || 1, notes };
    // sc.pieces — koʻchaning faqat tanlangan qismi
    const ps = sc.pieces ? sc.pieces.filter(p => p >= 0 && p < N.P && N.pStreet[p] === sc.street) : N.streetPieces.get(sc.street) || [];
    const { pieces, nx, ny, eOn } = N;
    let single = 0;
    for (const p of ps) {
      const ef = 2 * p, eb = ef + 1;
      if (sc.type === 'close') { on[ef] = 0; on[eb] = 0; }
      else if (sc.type === 'oneway') {
        const pc = pieces[p], vx = nx[pc.b] - nx[pc.a], vy = ny[pc.b] - ny[pc.a];
        const fwdOK = vx * sc.axis[0] + vy * sc.axis[1] >= 0;
        const total = (eOn[ef] ? cap[ef] : 0) + (eOn[eb] ? cap[eb] : 0) || Math.max(cap[ef], cap[eb]);
        if (fwdOK) { on[ef] = 1; on[eb] = 0; cap[ef] = total; } else { on[eb] = 1; on[ef] = 0; cap[eb] = total; }
      } else if (sc.type === 'buslane') {
        for (const e of [ef, eb]) {
          if (!on[e]) continue;
          if (Math.round(cap[e] / LANE_CAP) >= 2) cap[e] -= LANE_CAP; else { cap[e] *= 0.5; single++; }
        }
      } else if (sc.type === 'signal') { cap[ef] *= 1.15; cap[eb] *= 1.15; }
    }
    if (single) notes.push('single-lane');
    return { factor: 1, notes, pieces: ps.length };
  }

  function zoneNodes(on) {
    const { out, inn } = N;
    const has = (adj, v) => { for (let it = adj.start[v]; it < adj.start[v + 1]; it++) if (on[adj.list[it]]) return true; return false; };
    return N.zones.map(z => { for (const v of z.cand) if (has(out, v) && has(inn, v)) return v; return -1; });
  }

  function assign(demand, sc, iters, progress) {
    const on = Uint8Array.from(N.eOn), cap = Float64Array.from(N.eCap);
    const ap = applyScenario(sc, on, cap);
    const D = demand * ap.factor;
    const zn = zoneNodes(on);
    const ex = sc && sc.type === 'build' ? buildExtra(sc, on, zn) : null;
    const E = N.E, x = new Float64Array(E), y = new Float64Array(E), t = new Float64Array(E);
    times(t, x, cap, on);
    let un = aon(t, on, zn, D, y, ex);
    x.set(y);
    let gap = null;
    for (let k = 1; k < iters; k++) {
      times(t, x, cap, on);
      un = aon(t, on, zn, D, y, ex);
      let cx = 0, cy = 0;
      for (let e = 0; e < E; e++) if (on[e]) { cx += x[e] * t[e]; cy += y[e] * t[e]; }
      gap = cx > 0 ? (cx - cy) / cx : 0;
      const a = 1 / (k + 1);
      for (let e = 0; e < E; e++) x[e] += a * (y[e] - x[e]);
      if (progress) progress(k / iters);
    }
    times(t, x, cap, on);
    let TT = 0, VKT = 0, TT0 = 0;
    for (let e = 0; e < E; e++) if (on[e] && x[e] > 0) { TT += x[e] * t[e]; TT0 += x[e] * N.eT0[e]; VKT += (x[e] * N.eLen[e]) / 1000; }
    return { x, t, cap, on, D, TT, TT0, VKT, unassigned: un, gap, notes: ap.notes, build: ex ? { dist: Math.round(ex.dist), trips: ex.trips, x: N.nx[ex.node], y: N.ny[ex.node] } : null };
  }

  function baseline(demand, iters, progress) {
    const k = demand + '|' + iters;
    if (!baseCache.has(k)) { if (baseCache.size > 6) baseCache.clear(); baseCache.set(k, assign(demand, null, iters, progress)); }
    return baseCache.get(k);
  }

  // Koʻchalar boʻyicha jamlash: oʻrtacha hajm (ikki tomon yigʻindisi, uzunlik boʻyicha), maksimal V/C, tezlik nisbati
  function streetStats(r) {
    const S = N.nStreets, vol = new Float64Array(S), len = new Float64Array(S), vc = new Float64Array(S), sl = new Float64Array(S), st = new Float64Array(S);
    for (let p = 0; p < N.P; p++) {
      const s = N.pStreet[p], L = N.pLen[p];
      len[s] += L;
      vol[s] += (r.x[2 * p] + r.x[2 * p + 1]) * L;
      for (let d = 0; d < 2; d++) {
        const e = 2 * p + d;
        if (!r.on[e]) continue;
        const v = r.x[e] / r.cap[e];
        if (v > vc[s]) vc[s] = v;
        sl[s] += L; st[s] += (L * r.t[e]) / N.eT0[e];
      }
    }
    for (let s = 0; s < S; s++) if (len[s] > 0) vol[s] /= len[s];
    return { vol, vc, speedRatio: Array.from(sl, (v, s) => (st[s] > 0 ? v / st[s] : 1)) };
  }

  function compare(base, scen, sc) {
    const bs = streetStats(base), ss = streetStats(scen), names = N.names;
    const rows = [];
    for (let s = 0; s < N.nStreets; s++) {
      if (!N.streetPieces.has(s)) continue;
      const dv = ss.vol[s] - bs.vol[s];
      rows.push({ s, name: names[s] || '', baseVol: bs.vol[s], scenVol: ss.vol[s], dv, baseVC: bs.vc[s], scenVC: ss.vc[s] });
    }
    const target = sc && sc.street != null ? rows.find(r => r.s === sc.street) || null : null;
    const top = rows.filter(r => r.s !== (sc && sc.street) && Math.abs(r.dv) >= 1).sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0) || Math.abs(b.dv) - Math.abs(a.dv));
    const named = top.filter(r => r.name).slice(0, 10);
    const affected = named.length >= 10 ? named : named.concat(top.filter(r => !r.name).slice(0, 10 - named.length));
    affected.sort((a, b) => Math.abs(b.dv) - Math.abs(a.dv));
    const overloaded = rows.filter(r => r.scenVC > 1 && r.baseVC <= 1).sort((a, b) => b.scenVC - a.scenVC);
    const relieved = rows.filter(r => r.baseVC > 1 && r.scenVC <= 1);
    let maxAbs = 0;
    const deltas = [];
    for (let p = 0; p < N.P; p++) {
      const d = scen.x[2 * p] + scen.x[2 * p + 1] - (base.x[2 * p] + base.x[2 * p + 1]);
      // Yangi bino safarlari mahalla koʻchalariga ham tarqaladi — kichik oʻzgarishlar ham koʻrsatiladi
      if (Math.abs(d) >= (sc && sc.type === 'build' ? 4 : 25)) { deltas.push(p, Math.round(d)); maxAbs = Math.max(maxAbs, Math.abs(d)); }
    }
    const pctTT = base.TT > 0 ? ((scen.TT - base.TT) / base.TT) * 100 : 0;
    return {
      base: summary(base), scen: summary(scen), ttChangePct: pctTT,
      target, affected, overloaded: overloaded.slice(0, 12), overloadedCount: overloaded.length, relievedCount: relieved.length,
      deltas: Int32Array.from(deltas), maxAbsDelta: maxAbs, notes: scen.notes, build: scen.build,
    };
  }
  const summary = r => ({ demand: r.D, TT: r.TT, TT0: r.TT0, VKT: r.VKT, avgSpeed: r.TT > 0 ? r.VKT / r.TT : null, unassigned: r.unassigned, gap: r.gap });

  function run(opt, progress) {
    const iters = opt.iters || 10;
    const base = baseline(opt.demand, iters, p => progress && progress(p * 0.5, 'Bazaviy holat'));
    const scen = assign(opt.demand, opt.scenario, iters, p => progress && progress(0.5 + p * 0.5, 'Stsenariy'));
    return compare(base, scen, opt.scenario);
  }

  // Kalibrlash: oʻlchangan koʻchalarda modeldagi tezlik nisbati TomTom bilan eng yaqin boʻladigan talab koeffitsienti
  function calibrate(opt, progress) {
    const factors = opt.factors || [0.4, 0.55, 0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1, 2.5];
    const table = [];
    factors.forEach((f, i) => {
      const r = baseline(Math.round(opt.demand * f), 6);
      const ss = streetStats(r);
      let se = 0, n = 0;
      const rows = opt.meas.filter(m => N.streetPieces.has(m.street)).map(m => {
        const model = (1 - ss.speedRatio[m.street]) * 100;
        se += (model - m.congestion) ** 2; n++;
        return { street: m.street, measured: m.congestion, model };
      });
      table.push({ factor: f, demand: Math.round(opt.demand * f), rmse: n ? Math.sqrt(se / n) : null, rows });
      if (progress) progress((i + 1) / factors.length, 'Kalibrlash');
    });
    const valid = table.filter(t => t.rmse != null);
    if (!valid.length) return { ok: false, table };
    const best = valid.reduce((a, b) => (b.rmse < a.rmse ? b : a));
    return { ok: true, best, table: table.map(t => ({ factor: t.factor, demand: t.demand, rmse: t.rmse })), base: table.find(t => t.factor === 1) || null };
  }

  // Bazaviy holatdagi oqim: har bir boʻlak uchun ikki yoʻnalish yigʻindisi (mashina/soat)
  function flows(opt) {
    const b = baseline(opt.demand, opt.iters || 10);
    const out = new Float32Array(N.P);
    for (let p = 0; p < N.P; p++) out[p] = b.x[2 * p] + b.x[2 * p + 1];
    return out;
  }

  return { build, run, calibrate, flows };
}
