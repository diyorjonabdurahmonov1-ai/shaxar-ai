/* City Jam — xaritani “oʻrgatish”: foydalanuvchi tuzatishlari (svetofor bor, oʻtish joyi bor, bekat bor, muammo emas).
   Tuzatish darhol shu brauzerda qoʻllanadi; PIN-kod kiritilgan boʻlsa, Worker orqali hamma uchun saqlanadi. */
(function () {
  'use strict';
  const NX = window.NX;
  const LOCAL = 'fixes:local', SHARED = 'fixes:shared';
  const KIND = {
    signal: { uz: 'Svetofor', icon: '🚦' },
    crossing: { uz: 'Piyoda oʻtish joyi', icon: '🚶' },
    stop: { uz: 'Avtobus bekati', icon: '🚏' },
    dismiss: { uz: 'Muammo emas', icon: '✅' },
  };

  const base = () => ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim().replace(/\/+$/, '');
  const pin = () => (NX.store.get('fixes:pin', '') || '').trim();
  let shared = NX.store.get(SHARED, []);
  let sharedOk = null; // null — tekshirilmagan, true — server ishlayapti, false — ulanmagan

  function list() {
    const m = new Map();
    shared.forEach(x => m.set(x.id, Object.assign({ shared: true }, x)));
    NX.store.get(LOCAL, []).forEach(x => { if (!m.has(x.id)) m.set(x.id, Object.assign({ shared: false }, x)); });
    return [...m.values()];
  }

  async function loadShared() {
    if (!base()) { sharedOk = false; return list(); }
    try {
      const r = await NX.fetchJSON(base() + '/corrections', {}, 10000);
      if (r.ok && r.data && Array.isArray(r.data.items)) { shared = r.data.items; NX.store.set(SHARED, shared); sharedOk = true; }
      else sharedOk = false;
    } catch (e) { sharedOk = false; }
    return list();
  }

  async function post(body) {
    const r = await NX.fetchJSON(base() + '/corrections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ pin: pin() }, body)) }, 10000);
    if (!r.ok) { const e = new Error(r.data && r.data.error ? r.data.error.message : 'HTTP ' + r.status); e.code = r.data && r.data.error && r.data.error.code; throw e; }
    shared = r.data.items; NX.store.set(SHARED, shared);
  }

  // Qoʻshish: avval mahalliy (darhol), keyin PIN boʻlsa — hamma uchun
  async function add(item) {
    const it = Object.assign({ id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now() }, item);
    it.lat = +(+it.lat).toFixed(6); it.lon = +(+it.lon).toFixed(6);
    const local = NX.store.get(LOCAL, []);
    local.push(it); NX.store.set(LOCAL, local);
    if (!pin() || !base()) return { item: it, shared: false, reason: !base() ? 'server yoʻq' : 'PIN kiritilmagan' };
    try {
      await post({ action: 'add', item: it });
      NX.store.set(LOCAL, NX.store.get(LOCAL, []).filter(x => x.id !== it.id));
      return { item: it, shared: true };
    } catch (e) { return { item: it, shared: false, reason: e.message }; }
  }

  // Faqat shu brauzerga (avtomatik tekshiruv natijalari; PIN bilan keyin “hamma uchun” yuboriladi)
  function addLocal(items) {
    const local = NX.store.get(LOCAL, []);
    const out = items.map(item => Object.assign({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now() }, item, { lat: +(+item.lat).toFixed(6), lon: +(+item.lon).toFixed(6) }));
    NX.store.set(LOCAL, local.concat(out));
    return out;
  }

  async function remove(id) {
    NX.store.set(LOCAL, NX.store.get(LOCAL, []).filter(x => x.id !== id));
    if (shared.some(x => x.id === id)) {
      if (!pin()) throw new Error('Hamma uchun saqlangan tuzatishni oʻchirish uchun PIN-kod kerak (Sozlamalar).');
      await post({ action: 'remove', id });
    }
  }

  // Mahalliy tuzatishlarni serverga yuborish (PIN keyinroq kiritilganda)
  async function syncLocal() {
    if (!pin() || !base()) return 0;
    let n = 0;
    for (const it of NX.store.get(LOCAL, [])) {
      try { await post({ action: 'add', item: it }); NX.store.set(LOCAL, NX.store.get(LOCAL, []).filter(x => x.id !== it.id)); n++; } catch (e) { break; }
    }
    return n;
  }

  // OSM nuqtalariga qoʻshiladigan foydalanuvchi nuqtalari va “muammo emas” kalitlari
  function asPoints() {
    return list().filter(x => x.kind !== 'dismiss').map(x => ({ id: 'fix-' + x.id, k: x.kind, lat: x.lat, lon: x.lon, name: x.note || '', p: 1, fix: x.id, sig: x.kind === 'signal' ? 1 : 0 }));
  }
  const dismissed = () => new Set(list().filter(x => x.kind === 'dismiss' && x.key).map(x => x.key));
  const osmEditUrl = (lat, lon) => `https://www.openstreetmap.org/edit?editor=id#map=19/${lat.toFixed(6)}/${lon.toFixed(6)}`;

  NX.fixes = { KIND, list, loadShared, add, addLocal, remove, syncLocal, asPoints, dismissed, osmEditUrl, pin, status: () => sharedOk, hasServer: () => !!base() };
})();
