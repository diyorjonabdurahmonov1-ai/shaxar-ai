/* City Jam — Yandex panoramalari: joyning real fotosurati (360°).
   Rasmiy Yandex JS API 2.1 (ymaps.panorama) orqali; API ishlamasa — Yandex Xaritalarda ochiladigan havola. */
(function () {
  'use strict';
  const NX = window.NX;
  let player = null;

  const yandexUrl = (lat, lon) => `https://yandex.uz/maps/?ll=${lon.toFixed(6)}%2C${lat.toFixed(6)}&z=18&l=stv%2Csta&panorama%5Bpoint%5D=${lon.toFixed(6)}%2C${lat.toFixed(6)}`;

  function dialog() {
    let dlg = document.getElementById('panoDlg');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'panoDlg';
    dlg.className = 'pano-dlg';
    dlg.innerHTML = `<div class="pano-h"><b id="panoTitle"></b><a id="panoLink" target="_blank" rel="noopener">Yandex’da ochish ↗</a><button type="button" class="icon-btn" data-pano-close aria-label="Yopish">✕</button></div>
      <div id="panoBox" class="pano-box"></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-pano-close]')) dlg.close(); });
    // “close” hodisasi kechikib keladi — shu orada yangi joy ochilgan boʻlsa, tegmaymiz
    dlg.addEventListener('close', () => { if (dlg.open) return; if (player) { player.destroy(); player = null; } document.getElementById('panoBox').innerHTML = ''; });
    return dlg;
  }

  const msg = (box, t) => { box.innerHTML = `<div class="pano-msg">${t}</div>`; };

  async function open(lat, lon, title) {
    const dlg = dialog(), box = document.getElementById('panoBox');
    document.getElementById('panoTitle').textContent = '📷 ' + (title || 'Real koʻrinish');
    document.getElementById('panoLink').href = yandexUrl(lat, lon);
    if (player) { player.destroy(); player = null; }
    msg(box, 'Surat qidirilmoqda…');
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    let ymaps;
    try { ymaps = await NX.yandex.load(); } catch (e) {
      msg(box, 'Yandex panoramasi yuklanmadi. Tepadagi “Yandex’da ochish” havolasini bosing.');
      return;
    }
    if (!ymaps.panorama || !ymaps.panorama.isSupported()) { msg(box, 'Bu brauzer panoramani qoʻllamaydi. “Yandex’da ochish” havolasini bosing.'); return; }
    try {
      const list = await ymaps.panorama.locate([lat, lon]);
      if (!dlg.open) return;
      if (!list.length) { msg(box, 'Bu joyda surat yoʻq. Yaqinroqdagi koʻchani tanlab koʻring.'); return; }
      box.innerHTML = '';
      player = new ymaps.panorama.Player(box, list[0], { direction: 'auto', controls: ['zoomControl'], suppressMapOpenBlock: true });
    } catch (e) {
      msg(box, 'Surat ochilmadi. “Yandex’da ochish” havolasini bosing.');
    }
  }

  // Har qanday joydagi [data-pano="lat,lon"] tugmasi (panel, Leaflet va Yandex balloonlari)
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pano]');
    if (!b) return;
    e.preventDefault();
    const [lat, lon] = b.dataset.pano.split(',').map(Number);
    if (isFinite(lat) && isFinite(lon)) open(lat, lon, b.dataset.panoTitle);
  });

  const btn = (lat, lon, title, cls, label) => `<button type="button" class="${cls || 'btn sm'}" data-pano="${lat.toFixed(6)},${lon.toFixed(6)}" data-pano-title="${NX.esc(title || '')}" title="Yandex panorama">${label || '📷 Real koʻrinish'}</button>`;

  NX.pano = { open, btn, yandexUrl };
})();
