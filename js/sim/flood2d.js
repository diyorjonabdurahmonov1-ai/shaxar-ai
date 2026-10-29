/* City Jam — 2D suv toshqini modeli: LISFLOOD-FP “local inertial” usuli (Bates, Horritt, Fewtrell, 2010).
   Har bir katakda suv chuqurligi va kataklar orasidagi oqim vaqt boʻyicha (soniyalar qadamida) hisoblanadi:
     q⁽ⁿ⁺¹⁾ = (q − g·h_f·Δt·∂η/∂x) / (1 + g·Δt·n²·|q| / h_f^(7/3)),   h += Δt·(Σq_kirish − Σq_chiqish)/Δx + (yomgʻir − yoʻqotish)·Δt
   Koʻchalar (silliq, n = 0.016) va binolar (gʻadir-budir, n = 0.08) alohida; chegaradan suv erkin chiqib ketadi.
   Web Worker’da ishlaydi. */
(function () {
  'use strict';
  const NX = window.NX;

  function core() {
    const G = 9.81;
    return function run(p, progress) {
      const { nx, ny, dx, z, n, loss } = p, N = nx * ny;
      const h = new Float32Array(N), qx = new Float32Array((nx + 1) * ny), qy = new Float32Array(nx * (ny + 1)), hmax = new Float32Array(N), tmax = new Float32Array(N);
      const rain = p.rain;                       // [{t0, t1, mmh}] — soniyalarda
      const T = p.duration, snapEvery = p.snapEvery, snaps = [];
      let t = 0, nextSnap = 0, steps = 0;
      const rainAt = tt => { let r = 0; for (const s of rain) if (tt >= s.t0 && tt < s.t1) r += s.mmh; return r / 1000 / 3600; };   // m/s
      while (t < T) {
        let hm = 0.01;
        for (let k = 0; k < N; k++) if (h[k] > hm) hm = h[k];
        const dt = Math.min(30, Math.max(0.5, 0.7 * dx / Math.sqrt(G * hm)), T - t);
        // x yoʻnalishidagi oqimlar (ichki yuzalar)
        for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
          const a = j * nx + i - 1, b = a + 1, ea = z[a] + h[a], eb = z[b] + h[b], hf = Math.max(ea, eb) - Math.max(z[a], z[b]), f = j * (nx + 1) + i;
          if (hf <= 1e-3) { qx[f] = 0; continue; }
          const nn = (n[a] + n[b]) / 2, q0 = qx[f];
          let q = (q0 - G * hf * dt * (eb - ea) / dx) / (1 + G * dt * nn * nn * Math.abs(q0) / Math.pow(hf, 7 / 3));
          const lim = hf * dx / dt / 4; if (q > lim) q = lim; else if (q < -lim) q = -lim;     // barqarorlik
          qx[f] = q;
        }
        for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = (j - 1) * nx + i, b = a + nx, ea = z[a] + h[a], eb = z[b] + h[b], hf = Math.max(ea, eb) - Math.max(z[a], z[b]), f = j * nx + i;
          if (hf <= 1e-3) { qy[f] = 0; continue; }
          const nn = (n[a] + n[b]) / 2, q0 = qy[f];
          let q = (q0 - G * hf * dt * (eb - ea) / dx) / (1 + G * dt * nn * nn * Math.abs(q0) / Math.pow(hf, 7 / 3));
          const lim = hf * dx / dt / 4; if (q > lim) q = lim; else if (q < -lim) q = -lim;
          qy[f] = q;
        }
        // Chegaralar: suv erkin chiqib ketadi (qiyalik — relyef boʻyicha)
        for (let j = 0; j < ny; j++) { const a = j * nx, b = j * nx + nx - 1; qx[j * (nx + 1)] = -Math.min(h[a] * Math.sqrt(G * h[a]), h[a] * dx / dt / 4); qx[j * (nx + 1) + nx] = Math.min(h[b] * Math.sqrt(G * h[b]), h[b] * dx / dt / 4); }
        for (let i = 0; i < nx; i++) { const a = i, b = (ny - 1) * nx + i; qy[i] = -Math.min(h[a] * Math.sqrt(G * h[a]), h[a] * dx / dt / 4); qy[ny * nx + i] = Math.min(h[b] * Math.sqrt(G * h[b]), h[b] * dx / dt / 4); }
        // Massa saqlanishi + yomgʻir − yoʻqotish (kanalizatsiya/shimilish)
        const r = rainAt(t);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          const div = (qx[j * (nx + 1) + i] - qx[j * (nx + 1) + i + 1] + qy[j * nx + i] - qy[(j + 1) * nx + i]) / dx;
          let v = h[k] + dt * (div + r) - dt * Math.min(loss[k], (h[k] / dt) + r);
          if (v < 0) v = 0;
          h[k] = v;
          if (v > hmax[k]) { hmax[k] = v; tmax[k] = t; }
        }
        t += dt; steps++;
        if (t >= nextSnap) {
          // Siyrak surat: faqat 3 sm dan chuqur kataklar
          const idx = [], dep = [];
          for (let k = 0; k < N; k++) if (h[k] >= 0.03) { idx.push(k); dep.push(h[k]); }
          snaps.push({ t: Math.round(t), idx: Int32Array.from(idx), d: Float32Array.from(dep) });
          nextSnap += snapEvery;
          if (progress) progress(t / T);
        }
      }
      return { snaps, hmax, tmax, steps };
    };
  }

  const BOOT = `const RUN = (${core.toString()})();
self.onmessage = e => { try { const r = RUN(e.data, p => self.postMessage({ type: 'progress', p })); self.postMessage({ type: 'done', r }, [r.hmax.buffer, r.tmax.buffer]); } catch (err) { self.postMessage({ type: 'error', error: String(err && err.message || err) }); } };`;

  let url = null;
  function run(p, onProgress) {
    return new Promise((resolve, reject) => {
      let w = null;
      try { url = url || URL.createObjectURL(new Blob([BOOT], { type: 'text/javascript' })); w = new Worker(url); } catch (e) { w = null; }
      if (!w) { try { resolve(core()(p, onProgress)); } catch (e) { reject(e); } return; }
      w.onmessage = e => { const m = e.data; if (m.type === 'progress') onProgress && onProgress(m.p); else { w.terminate(); if (m.type === 'done') resolve(m.r); else reject(new Error(m.error)); } };
      w.onerror = e => { w.terminate(); reject(new Error(e.message || 'Worker xatosi')); };
      w.postMessage(p);
    });
  }

  NX.flood2d = { run, core };
})();
