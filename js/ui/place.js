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
      <div class="ppop-photo" data-lat="${(+a.lat).toFixed(6)}" data-lon="${(+a.lon).toFixed(6)}"><span class="small muted">📷 Real surat qidirilmoqda…</span></div>
      <div class="place-btns">${NX.pano.btn(+a.lat, +a.lon, st || a.title, 'btn xs', '🌐 Panorama (Yandex)')}${/^W\d/.test(a.id || '') || /suv/i.test(a.title || '') ? `<button type="button" class="btn xs" data-fix-street="${E((String(a.title).match(/:\s*([^—]+?)\s*—/) || [])[1] || st || '')}">🛠 Yechim</button>` : ''}${a.street ? `<button type="button" class="btn xs" data-audit-street="${E(a.street)}">🔍 Batafsil tekshirish</button>` : ''}</div></div>`;
  }

  const MON = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
  const cache = new Map();
  async function fill(el) {
    el.dataset.done = '1';
    const lat = +el.dataset.lat, lon = +el.dataset.lon, k = lat.toFixed(4) + ',' + lon.toFixed(4);
    if (!NX.mly || !NX.mly.available()) { el.innerHTML = '<span class="small muted">Ochiq koʻcha surati ulanmagan — panoramani bosing.</span>'; return; }
    try {
      let list = cache.get(k);
      if (!list) { list = await NX.mly.photos(lat, lon, 60); if (!list.length) list = await NX.mly.photos(lat, lon, 160); cache.set(k, list); }
      const p = list[0];
      if (!p) { el.innerHTML = '<span class="small muted">Bu joyda ochiq koʻcha surati yoʻq — 🌐 panoramani bosing.</span>'; return; }
      const d = p.date ? new Date(p.date) : null;
      el.innerHTML = `<a href="${NX.mly.link(p.id)}" target="_blank" rel="noopener"><img src="${p.url}" alt="Real surat" loading="lazy"></a><div class="small muted">Real surat (Mapillary)${d ? ` · ${d.getFullYear()}-yil ${MON[d.getMonth()]}` : ''} · ${Math.round(p.d)} m${list.length > 1 ? ` · yana ${list.length - 1} ta` : ''}</div>`;
    } catch (e) { el.innerHTML = `<span class="small muted">Surat olinmadi (${NX.esc(e.message)}).</span>`; }
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
