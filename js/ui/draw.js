/* City Jam — xaritada sichqoncha (yoki barmoq) bilan erkin hudud chizish.
   Xarita ustiga shaffof qatlam qoʻyiladi: chizish paytida xarita surilmaydi; tugagach nuqtalar lat/lon ga aylanadi. */
(function () {
  'use strict';
  const NX = window.NX;
  let ov = null;

  function stop() {
    if (!ov) return;
    ov.remove(); ov = null;
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') { const c = ov && ov.onCancel; stop(); if (c) c(); } }

  // Nuqtalar sonini kamaytirish (piksellarda 4 px dan yaqinlarini tashlab)
  function thin(pts, minPx) {
    const out = [pts[0]];
    for (const p of pts) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= minPx) out.push(p); }
    return out;
  }

  function start(onDone, onCancel) {
    stop();
    const wrap = document.querySelector('.map-wrap');
    ov = document.createElement('div');
    ov.className = 'draw-ov';
    ov.onCancel = onCancel;
    ov.innerHTML = `<svg><polyline points="" /></svg><div class="nx-pickbar draw-bar"><span>✏️ Sichqoncha bilan hudud chegarasini <b>chizing</b> (bosib turib aylantiring)</span><button type="button">Bekor qilish</button></div>`;
    wrap.appendChild(ov);
    const svg = ov.querySelector('svg'), pl = ov.querySelector('polyline');
    ov.querySelector('button').addEventListener('click', e => { e.stopPropagation(); stop(); if (onCancel) onCancel(); });
    document.addEventListener('keydown', onKey);
    let pts = null;
    const rel = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY]; };
    svg.addEventListener('pointerdown', e => {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      pts = [rel(e)];
    });
    svg.addEventListener('pointermove', e => {
      if (!pts) return;
      const p = rel(e), q = pts[pts.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 3) return;
      pts.push(p);
      pl.setAttribute('points', pts.map(x => x[0] + ',' + x[1]).join(' '));
    });
    const finish = () => {
      if (!pts) return;
      const raw = thin(pts, 6);
      pts = null;
      if (raw.length < 4) { pl.setAttribute('points', ''); return; } // juda kichik — qayta chizsin
      const poly = raw.map(p => NX.view.pxToLL(p[2], p[3])).filter(Boolean);
      stop();
      if (poly.length >= 3) onDone(poly); else if (onCancel) onCancel();
    };
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
  }

  // Koʻcha (chiziq) chizish: bosib nuqta qoʻyiladi yoki bosib turib erkin chiziladi; ✓ Tayyor yoki ikki marta bosish — tugatadi
  function startLine(onDone, onCancel) {
    stop();
    const wrap = document.querySelector('.map-wrap');
    ov = document.createElement('div');
    ov.className = 'draw-ov line';
    ov.onCancel = onCancel;
    ov.innerHTML = `<svg><polyline points="" /><g class="v"></g></svg><div class="nx-pickbar draw-bar"><span>🛣 Koʻcha yoʻnalishini <b>bosib-bosib</b> belgilang (yoki bosib turib chizing)</span><button type="button" data-k="undo" title="Oxirgi nuqtani olib tashlash">↶</button><button type="button" class="ok" data-k="ok">✓ Tayyor</button><button type="button" data-k="x">✕</button></div>`;
    wrap.appendChild(ov);
    const svg = ov.querySelector('svg'), pl = ov.querySelector('polyline'), vg = ov.querySelector('g.v');
    let pts = [], down = null, moved = false;
    const draw = () => { pl.setAttribute('points', pts.map(x => x[0] + ',' + x[1]).join(' ')); vg.innerHTML = pts.filter((p, i) => p.v || i === 0 || i === pts.length - 1).map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="6"/>`).join(''); };
    const done = () => {
      const raw = thin(pts, 4);
      if (raw.length < 2) return;
      const line = raw.map(p => NX.view.pxToLL(p[2], p[3])).filter(Boolean);
      stop();
      if (line.length >= 2) onDone(line); else if (onCancel) onCancel();
    };
    ov.querySelector('.draw-bar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
      if (b.dataset.k === 'undo') { pts.pop(); draw(); }
      else if (b.dataset.k === 'ok') done();
      else { stop(); if (onCancel) onCancel(); }
    });
    document.addEventListener('keydown', onKey);
    const rel = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY]; };
    svg.addEventListener('pointerdown', e => { e.preventDefault(); svg.setPointerCapture(e.pointerId); down = rel(e); moved = false; });
    svg.addEventListener('pointermove', e => {
      if (!down) return;
      const p = rel(e), q = pts[pts.length - 1] || down;
      if (!moved && Math.hypot(p[0] - down[0], p[1] - down[1]) > 8) { moved = true; if (!pts.length || Math.hypot(pts[pts.length - 1][0] - down[0], pts[pts.length - 1][1] - down[1]) > 4) pts.push(Object.assign(down, { v: 1 })); }
      if (moved && Math.hypot(p[0] - q[0], p[1] - q[1]) >= 5) { pts.push(p); draw(); }
    });
    const up = e => { if (!down) return; if (!moved) { const p = down; p.v = 1; pts.push(p); draw(); } else if (pts.length) pts[pts.length - 1].v = 1; down = null; draw(); void e; };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('dblclick', e => { e.preventDefault(); done(); });
  }

  NX.draw = { start, startLine, stop, active: () => !!ov };
})();
