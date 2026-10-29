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

  NX.draw = { start, stop, active: () => !!ov };
})();
