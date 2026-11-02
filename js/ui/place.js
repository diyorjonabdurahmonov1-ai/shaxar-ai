/* City Jam — xaritadagi belgi (AI tavsiyasi, muammo, natija) bosilganda: izoh, koʻcha nomi va shu joyning REAL surati.
   Surat — Mapillary ochiq koʻcha suratlari (eng yaqin va yangi); boʻlmasa — Yandex panorama tugmasi (koʻrish uchun).
   Leaflet popup va Yandex balloon ichidagi .ppop-photo elementlari avtomatik toʻldiriladi. */
(function () {
  'use strict';
  const NX = window.NX;

  // Eng yaqin nomli koʻcha (sayt modeli)
  function street(lat, lon) {
    const M = NX.state && NX.state.model;
    if (!M || !M.streetsNear) return '';
    const [x, y] = NX.geo.xy(lat, lon);
    let best = null, bd = Infinity;
    M.streetsNear(x, y, 120).forEach((d, s) => { const st = M.streets[s]; if (st && st.name && d < bd) { bd = d; best = st; } });
    return best ? best.name : '';
  }

  // Popup HTML: sarlavha, izoh, koʻcha, surat joyi, panorama tugmasi
  function html(a, n) {
    const st = street(a.lat, a.lon), E = NX.esc;
    return `<div class="ppop place"><b>${n ? n + '. ' : ''}${E(a.title || 'Joy')}</b>${a.note ? `<p>${E(a.note)}</p>` : ''}${st ? `<div class="place-st">📍 ${E(st)}</div>` : ''}
      <div class="ppop-photo" data-lat="${(+a.lat).toFixed(6)}" data-lon="${(+a.lon).toFixed(6)}" data-title="${E(st || a.title || '')}"><span class="small muted">📷 Real surat qidirilmoqda…</span></div>
      <div class="place-btns">${/^W\d/.test(a.id || '') || /suv/i.test(a.title || '') ? `<button type="button" class="btn xs" data-fix-street="${E((String(a.title).match(/:\s*([^—]+?)\s*—/) || [])[1] || st || '')}">🛠 Yechim</button>` : ''}${a.street ? `<button type="button" class="btn xs" data-audit-street="${E(a.street)}">🔍 Batafsil tekshirish</button>` : ''}</div></div>`;
  }

  const MON = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
  const cache = new Map(), used = new Map();   // used: surat id → qaysi nuqtada koʻrsatilgan (bir surat bir nechta belgiga qoʻyilmasin)
  // Kamera aynan shu nuqtaga qarab turibdimi: suratdan nuqtagacha yoʻnalish va kamera burchagi farqi
  function facing(p, lat, lon) {
    if (p.ca == null || p.d < 6) return 0;
    const [x0, y0] = NX.geo.xy(p.lat, p.lon), [x1, y1] = NX.geo.xy(lat, lon);
    const brg = (Math.atan2(x1 - x0, y1 - y0) * 180 / Math.PI + 360) % 360;
    return Math.abs(((brg - p.ca + 540) % 360) - 180);
  }
  // Nuqta uchun suratlar: masofa + kamera yoʻnalishi; yangilik — kichik ustunlik (eski suratdan 5 m gacha)
  function rankFor(list, lat, lon) {
    const now = Date.now();
    return list.map(p => { const f = facing(p, lat, lon), age = p.date ? (now - p.date) / (365 * 86400e3) : 5; return Object.assign({}, p, { f, sc: p.d + (f > 100 ? 30 : f > 60 ? 12 : 0) + Math.min(5, age) }); }).sort((x, y) => x.sc - y.sc);
  }
  async function fill(el) {
    el.dataset.done = '1';
    const lat = +el.dataset.lat, lon = +el.dataset.lon, k = lat.toFixed(5) + ',' + lon.toFixed(5);
    const t = el.dataset.title || '', pano = cls => NX.pano.btn(lat, lon, t, cls, '🌐 Panoramali surat');
    const none = why => { el.innerHTML = `<div class="pp-none"><span class="small muted">${why}</span>${pano('btn sm primary pp-pano-big')}</div>`; };
    if (!NX.mly || !NX.mly.available()) { none('Ochiq koʻcha surati ulanmagan.'); return; }
    try {
      let list = cache.get(k);
      if (!list) { list = await NX.mly.photos(lat, lon, 35); if (list.length < 2) list = await NX.mly.photos(lat, lon, 80); list = rankFor(list, lat, lon); cache.set(k, list); }
      if (!list.length) { none('Aynan shu nuqtada ochiq koʻcha surati yoʻq.'); return; }
      // Boshqa belgida koʻrsatilgan surat — imkon boʻlsa boshqasi (60 m ichida)
      let i = list.findIndex(p => { const u = used.get(p.id); return (!u || u === k) && p.d <= 60; });
      if (i < 0) i = 0;
      used.set(list[i].id, k);
      const show = j => {
        const p = list[j], d = p.date ? new Date(p.date) : null;
        const far = p.d > 40 ? `<div class="small warn-text">⚠️ Eng yaqin surat ${Math.round(p.d)} m uzoqda — muammo aynan koʻrinmasligi mumkin, panoramada tekshiring.</div>` : '';
        const dir = p.f != null && p.d >= 6 ? (p.f <= 60 ? ' · 🎯 nuqtaga qaragan' : ' · ↪ boshqa tomonga qaragan') : '';
        el.innerHTML = `<div class="pp-img"><a href="${NX.mly.link(p.id)}" target="_blank" rel="noopener"><img src="${p.url}" alt="Shu nuqtaning real surati" loading="lazy"></a>${pano('pp-pano')}</div><div class="small muted">📍 Shu nuqtadan ${Math.round(p.d)} m${dir}${d ? ` · ${d.getFullYear()}-yil ${MON[d.getMonth()]}` : ''} · Mapillary</div>${far}${list.length > 1 ? `<div class="pp-alt">${list.slice(0, 4).map((q, n) => `<button type="button" class="${n === j ? 'on' : ''}" data-n="${n}" title="${Math.round(q.d)} m"><img src="${q.url}" alt="" loading="lazy"><i>${Math.round(q.d)} m</i></button>`).join('')}</div>` : ''}`;
        el.querySelectorAll('.pp-alt button').forEach(b => { b.onclick = e => { e.preventDefault(); e.stopPropagation(); show(+b.dataset.n); }; });
      };
      show(i);
    } catch (e) { none(`Surat olinmadi (${NX.esc(e.message)}).`); }
  }
  // Popup/balloon ochilganda paydo boʻlgan surat joylari avtomatik toʻldiriladi
  new MutationObserver(() => document.querySelectorAll('.ppop-photo:not([data-done])').forEach(fill)).observe(document.body, { childList: true, subtree: true });

  // Rasmni katta koʻrish: AI rasmlari, real suratlar (chat, popup, koʻcha suratlari)
  let lb = null;
  function lightbox(src, caption, link) {
    if (!lb) {
      lb = document.createElement('div'); lb.className = 'lightbox'; lb.hidden = true;
      lb.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure><button type="button" class="lb-x" aria-label="Yopish">✕</button>';
      lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('.lb-x')) lb.hidden = true; });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && lb && !lb.hidden) lb.hidden = true; });
      document.body.appendChild(lb);
    }
    lb.querySelector('img').src = src;
    lb.querySelector('figcaption').innerHTML = NX.esc(caption || '') + (link ? ` · <a href="${link}" target="_blank" rel="noopener">manbada ochish ↗</a>` : '');
    lb.hidden = false;
  }
  document.addEventListener('click', e => {
    const img = e.target.closest('.vgen img, .ppop-photo img, .road-photos img, .vbox img, .msg-photos img, .chat-msg .bubble img');
    if (!img) return;
    e.preventDefault();
    const a = img.closest('a'), fig = img.closest('figure'), cap = fig && fig.querySelector('figcaption');
    lightbox(img.src, cap ? cap.textContent : img.alt, a && a.href);
  });

  NX.place = { html, street, lightbox };
})();
