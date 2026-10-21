/* City Jam — yengil SVG grafik (bashorat chizigʻi + ishonch oraligʻi) */
(function () {
  'use strict';
  const NX = window.NX;

  // pts: [{value, lo, hi, label, low}], opts: {now: index, yMax, title}
  function forecastChart(pts, opts = {}) {
    const W = 360, H = 180, L = 34, R = 8, T = 12, B = 22;
    const yMax = Math.max(opts.yMax || 0, 40, Math.ceil(Math.max(...pts.map(p => p.hi)) / 10) * 10);
    const x = i => L + (i * (W - L - R)) / Math.max(1, pts.length - 1);
    const y = v => T + (1 - v / yMax) * (H - T - B);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    const band = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.hi).toFixed(1)}`).join('') +
      pts.slice().reverse().map((p, k) => `L${x(pts.length - 1 - k).toFixed(1)},${y(p.lo).toFixed(1)}`).join('') + 'Z';
    const grid = [];
    for (let v = 0; v <= yMax; v += yMax > 60 ? 20 : 10) grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="ch-grid"/><text x="${L - 5}" y="${y(v) + 3.5}" class="ch-ax" text-anchor="end">${v}%</text>`);
    const xl = pts.map((p, i) => (i % 3 === 0 ? `<text x="${x(i)}" y="${H - 6}" class="ch-ax" text-anchor="middle">${p.label.slice(0, 2)}</text>` : '')).join('');
    const thr = [15, 30].filter(v => v < yMax).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="ch-thr ${v === 30 ? 'red' : 'amber'}"/>`).join('');
    const dots = pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="${p.low ? 2 : 3}" class="${p.low ? 'ch-dot low' : 'ch-dot'}"><title>${p.label}: ${NX.fmt.num(p.value, 0)}% (${NX.fmt.num(p.lo, 0)}–${NX.fmt.num(p.hi, 0)}%), oʻlchovlar: ${p.n}</title></circle>`).join('');
    const now = opts.now != null ? `<line x1="${x(opts.now)}" x2="${x(opts.now)}" y1="${T}" y2="${H - B}" class="ch-now"/>` : '';
    const day = opts.dayBreaks ? opts.dayBreaks.map(i => `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}" class="ch-day"/>`).join('') : '';
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${NX.esc(opts.title || 'Tirbandlik bashorati')}">
      ${grid.join('')}${thr}${day}<path d="${band}" class="ch-band"/>${now}<path d="${line}" class="ch-line"/>${dots}${xl}
      </svg><p class="ch-cap">Gorizontal oʻq — soat, vertikal — tirbandlik (%). Soyali soha — ishonch oraligʻi; ochiq nuqtalar — maʼlumot kam.</p>`;
  }

  // Oddiy gorizontal ustunlar
  function bars(rows, opts = {}) {
    const max = Math.max(1, ...rows.map(r => Math.abs(r.v)));
    return `<div class="bars">${rows.map(r => `<div class="bar-row"><span class="bar-k">${NX.esc(r.k)}</span><span class="bar-t"><i style="width:${(100 * Math.abs(r.v)) / max}%;background:${r.c || 'var(--accent)'}"></i></span><span class="bar-v">${r.t != null ? r.t : NX.fmt.num(r.v, opts.d || 0)}</span></div>`).join('')}</div>`;
  }

  NX.chart = { forecastChart, bars };
})();
