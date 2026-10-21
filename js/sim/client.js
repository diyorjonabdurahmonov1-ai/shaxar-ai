/* City Jam — simulyatsiya mijoz qismi: Web Worker (Blob) va zaxira rejim */
(function () {
  'use strict';
  const NX = window.NX;

  const BOOT = `
const SIM = NXSimFactory();
self.onmessage = function (ev) {
  const { id, cmd, payload } = ev.data;
  const progress = (p, label) => self.postMessage({ id, type: 'progress', p, label });
  try {
    let result;
    if (cmd === 'build') result = SIM.build(payload);
    else if (cmd === 'run') result = SIM.run(payload, progress);
    else if (cmd === 'calibrate') result = SIM.calibrate(payload, progress);
    self.postMessage({ id, type: 'done', result });
  } catch (e) { self.postMessage({ id, type: 'error', error: String((e && e.message) || e) }); }
};`;

  let worker = null, local = null, seq = 0, ready = null, info = null;
  const pending = new Map();

  function makeWorker() {
    try {
      // Blob orqali — sahifa file:// dan ochilganda ham ishlaydi
      const src = NXSimFactory.toString() + '\n' + BOOT;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = ev => {
        const m = ev.data, p = pending.get(m.id);
        if (!p) return;
        if (m.type === 'progress') { p.onProgress && p.onProgress(m.p, m.label); return; }
        pending.delete(m.id);
        if (m.type === 'done') p.resolve(m.result); else p.reject(new Error(m.error));
      };
      w.onerror = e => { console.error('Simulyatsiya worker xatosi', e); pending.forEach(p => p.reject(new Error('Simulyatsiya xatosi'))); pending.clear(); };
      return w;
    } catch (e) {
      console.warn('Web Worker yaratilmadi, asosiy oqimda hisoblanadi', e);
      return null;
    }
  }

  function call(cmd, payload, onProgress) {
    if (worker) {
      const id = ++seq;
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ id, cmd, payload }); });
    }
    // Zaxira: asosiy oqimda (sekinroq, lekin ishlaydi)
    return new Promise((resolve, reject) => setTimeout(() => {
      try { resolve(local[cmd](payload, (p, l) => onProgress && onProgress(p, l))); } catch (e) { reject(e); }
    }, 30));
  }

  function netFromModel(M) {
    const bb = NX.config.bbox;
    const [x0, y0] = NX.geo.xy(bb.s, bb.w), [x1, y1] = NX.geo.xy(bb.n, bb.e);
    return {
      ways: M.ways.map(w => ({ nodes: w.nodes, xy: w.xy, hw: w.hw, oneway: w.oneway, lanes: w.lanes, lanesF: w.lanesF, lanesB: w.lanesB, maxspeed: w.maxspeed, street: w.street })),
      stops: M.stops.filter(s => s.inArea).map(s => [s.x, s.y]),
      bounds: { x0, y0, x1, y1 }, center: [0, 0],
      nStreets: M.streets.length, names: M.streets.map(s => s.name),
    };
  }

  function init(M) {
    if (worker) { worker.terminate(); worker = null; }
    pending.clear();
    worker = makeWorker();
    if (!worker) local = NXSimFactory();
    ready = call('build', netFromModel(M)).then(r => {
      const refs = r.pieceRefs, pieces = [];
      for (let i = 0; i < refs.length; i += 3) pieces.push([refs[i], refs[i + 1], refs[i + 2]]);
      info = { nodes: r.nodes, edges: r.edges, zones: r.zones, sccShare: r.sccShare, pieces, worker: !!worker };
      return info;
    });
    return ready;
  }

  async function run(opt, onProgress) { await ready; return call('run', opt, onProgress); }
  async function calibrate(opt, onProgress) { await ready; return call('calibrate', opt, onProgress); }

  NX.sim = { init, run, calibrate, info: () => info, whenReady: () => ready };
})();
