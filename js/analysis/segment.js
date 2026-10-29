/* City Jam — koʻchaning bir qismi (A nuqtadan B nuqtagacha).
   Koʻcha simulyatsiya tarmogʻidagi boʻlaklarga (chorrahadan chorrahagacha) boʻlinadi;
   bosilgan ikki nuqtaga eng yaqin chorrahalar orasidagi eng qisqa yoʻl tanlanadi. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;

  // Koʻchaning boʻlaklari: { idx, a, b (OSM tugun), xy, ll, len }
  function streetPieces(M, pieces, sid) {
    const out = [];
    pieces.forEach(([wi, i0, i1], idx) => {
      const w = M.ways[wi];
      if (w.street !== sid) return;
      const xy = w.xy.slice(i0, i1 + 1);
      out.push({ idx, a: w.nodes[i0], b: w.nodes[i1], xy, ll: w.ll.slice(i0, i1 + 1), len: G.len(xy) });
    });
    return out;
  }

  function nodeXY(ps) {
    const m = new Map();
    ps.forEach(p => { m.set(p.a, p.xy[0]); m.set(p.b, p.xy[p.xy.length - 1]); });
    return m;
  }
  function nearestNode(nodes, x, y, only) {
    let best = null, bd = Infinity;
    nodes.forEach((q, id) => { if (only && !only.has(id)) return; const d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = id; } });
    return best;
  }

  // Dijkstra (koʻcha ichida, yoʻnalishsiz) — {dist, prev}
  function paths(ps, from) {
    const adj = new Map();
    ps.forEach(p => { [[p.a, p.b], [p.b, p.a]].forEach(([u, v]) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, p]); }); });
    const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
    for (;;) {
      let u = null, du = Infinity;
      dist.forEach((d, id) => { if (!done.has(id) && d < du) { du = d; u = id; } });
      if (u == null) break;
      done.add(u);
      (adj.get(u) || []).forEach(([v, p]) => { const d = du + p.len; if (d < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, d); prev.set(v, [u, p]); } });
    }
    return { dist, prev };
  }

  // Tugunda kesishgan boshqa nomli koʻcha — “X bilan kesishma”
  function crossName(M, node, sid) {
    for (const w of M.ways) {
      if (w.street === sid || !w.nodes.includes(node)) continue;
      const s = M.streets[w.street];
      if (s && s.name) return s.name;
    }
    return null;
  }

  function build(M, pieces, sid, A, B) {
    const ps = streetPieces(M, pieces, sid);
    if (!ps.length) return null;
    const nodes = nodeXY(ps);
    const [ax, ay] = G.xy(A[0], A[1]), [bx, by] = G.xy(B[0], B[1]);
    const na = nearestNode(nodes, ax, ay);
    const { dist, prev } = paths(ps, na);
    // B nuqta A bilan bogʻlangan tugunlar orasidan tanlanadi (ikki qatorli yoʻlda boshqa qatorga “sakrab” ketmasin)
    const nb = nearestNode(nodes, bx, by, new Set(dist.keys()));
    if (nb == null || nb === na) return null;
    const sel = new Set(), path = [];
    for (let v = nb; v !== na;) { const [u, p] = prev.get(v); sel.add(p.idx); path.push(p); v = u; }
    // Parallel qator (dual carriageway): yoʻlga 30 m dan yaqin, shu koʻchaning boshqa boʻlaklari ham qoʻshiladi
    const near = (x, y) => path.some(p => { for (let i = 1; i < p.xy.length; i++) if (G.segDist(x, y, p.xy[i - 1][0], p.xy[i - 1][1], p.xy[i][0], p.xy[i][1]) < 30) return true; return false; });
    ps.forEach(p => {
      if (sel.has(p.idx)) return;
      const m = G.pointAlong(p.xy, 0.5);
      if (near(m[0], m[1]) && near(p.xy[0][0], p.xy[0][1]) && near(p.xy[p.xy.length - 1][0], p.xy[p.xy.length - 1][1])) sel.add(p.idx);
    });
    const chosen = ps.filter(p => sel.has(p.idx));
    const pa = nodes.get(na), pb = nodes.get(nb);
    return {
      street: sid, pieces: [...sel],
      lines: chosen.map(p => p.ll),
      len: path.reduce((t, p) => t + p.len, 0),
      from: { ll: G.ll(pa[0], pa[1]), name: crossName(M, na, sid) },
      to: { ll: G.ll(pb[0], pb[1]), name: crossName(M, nb, sid) },
    };
  }

  // Qism yonidagi muammolar (40 m)
  function problems(M, seg) {
    const xy = seg.lines.map(l => l.map(p => G.xy(p[0], p[1])));
    return M.problems.filter(p => {
      const [x, y] = G.xy(p.lat, p.lon);
      return xy.some(l => l.some((q, i) => i > 0 && G.segDist(x, y, l[i - 1][0], l[i - 1][1], q[0], q[1]) < 40));
    });
  }

  const label = seg => `${seg.from.name || 'boshi'} → ${seg.to.name || 'oxiri'}`;

  NX.segment = { build, problems, label };
})();
