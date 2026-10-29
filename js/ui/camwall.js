/* City Jam — xarita ustidagi kamera devori (boshqaruv markazi uslubi).
   Sarlavhadan ushlab koʻchiriladi, burchagidan chozib kattalashtiriladi — kattalashgani sari koʻproq kamera chiqadi.
   Avval Samarqand atrofidagi ochiq kameralar; ular yoʻq boʻlsa — NAMUNA sifatida Finlyandiya yoʻl kameralari (aniq belgilangan).
   Ochiq kameralar video emas, surat beradi: suratlar har daqiqada tekshiriladi, yangisi kelsa almashadi. */
(function () {
  'use strict';
  const NX = window.NX;
  const REFRESH = 60e3;
  let el = null, items = [], sample = false, collapsed = false, lastTick = Date.now();
  let box = NX.store.get('cw:box', null);                // { x, y, w, h } — map-wrap ichida, px

  const E = s => NX.esc(String(s == null ? '' : s));
  const hhmm = t => (t ? new Date(t).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Samarkand' }) : '—');
  const fresh = u => (sample ? u + (u.includes('?') ? '&' : '?') + 't=' + Math.floor(lastTick / REFRESH) : u);   // Digitraffic: yangi surat

  // Nechta kadr sigʻadi (kenglik va balandlikka qarab)
  // Kadr oʻlchami CSS bilan bir xil: ustun ≥ 104 px, 4 px oraliq, 16:10; sarlavha ~30 px, pastki yozuv ~24 px
  function capacity() {
    if (!box) return 8;
    const inner = box.w - 12, cols = Math.max(1, Math.floor((inner + 4) / 108)), colW = (inner - 4 * (cols - 1)) / cols;
    const rows = Math.max(1, Math.floor((box.h - 66 + 4) / (colW * 0.625 + 4)));
    return cols * rows;
  }
  function place() {
    if (!el) return;
    if (box && !collapsed) { el.style.left = box.x + 'px'; el.style.top = box.y + 'px'; el.style.right = 'auto'; el.style.width = box.w + 'px'; el.style.height = box.h + 'px'; }
    else if (box) { el.style.left = box.x + 'px'; el.style.top = box.y + 'px'; el.style.right = 'auto'; el.style.width = ''; el.style.height = ''; }
  }
  function render() {
    if (!el) return;
    const now = new Date().toLocaleTimeString('uz-UZ', { hour12: false, timeZone: 'Asia/Samarkand' }), show = items.slice(0, capacity());
    el.classList.toggle('min', collapsed);
    el.innerHTML = `<div class="cw-h" data-cw="drag"><span class="cw-dot"></span><b>KAMERALAR</b><span class="cw-n">${show.length}/${items.length}</span>${sample ? '<span class="cw-sample">NAMUNA · Finlyandiya yoʻl kameralari</span>' : '<span class="cw-live">SAMARQAND</span>'}<span class="cw-clock">${now}</span><button type="button" class="cw-btn" data-cw="toggle" aria-label="${collapsed ? 'Ochish' : 'Yigʻish'}">${collapsed ? '▢' : '—'}</button></div>
      ${collapsed ? '' : `<div class="cw-grid">${show.map((c, i) => `<button type="button" class="cw-cam" data-cw="open" data-i="${i}" title="${E(c.title)}"><img src="${E(fresh(c.preview))}" alt="" loading="lazy"><span class="cw-rec">● ${hhmm(c.updated)}</span><span class="cw-name">CAM-${String(i + 1).padStart(2, '0')} · ${E(c.title)}</span><span class="cw-prog"></span></button>`).join('')}</div>
      <div class="cw-f">${sample ? 'Samarqand kameralari ulanmaguncha — namuna. ' : ''}Surat · har daqiqada tekshiriladi · ${E(sample ? 'Fintraffic Digitraffic, CC BY 4.0' : 'Windy.com')} · burchakdan choʻzing — koʻproq kamera</div>
      <div class="cw-resize" data-cw="resize" title="Kattalashtirish"></div>`}`;
    place();
  }

  async function load() {
    try {
      let l = await NX.webcams.load(60);
      sample = false;
      if (!l.length) { l = await NX.webcams.load(60, 'fi', 40); sample = true; }
      items = l.filter(c => c.preview).slice(0, 40);
    } catch (e) { items = []; }
    if (!items.length) { if (el) el.hidden = true; return; }
    if (el) { el.hidden = false; render(); }
  }
  // Har daqiqada: Digitraffic suratlari yangilanadi (rasm manzili oʻzgarmaydi — yangi surat soʻraladi)
  function tick() {
    lastTick = Date.now();
    if (!el || collapsed || el.hidden) return;
    el.querySelectorAll('.cw-cam img').forEach((im, i) => { const c = items[i]; if (c && sample) { const n = new Image(); n.onload = () => { im.src = n.src; }; n.src = fresh(c.preview); } });
    el.querySelectorAll('.cw-prog').forEach(p => { p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; });
  }

  // Sudrash (koʻchirish) va choʻzish (kattalashtirish)
  function drag(e, kind) {
    const wrap = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const start = { x: r.left - wrap.left, y: r.top - wrap.top, w: r.width, h: r.height };
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    el.classList.add('moving');
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (kind === 'drag') box = Object.assign({}, start, { x: Math.max(0, Math.min(wrap.width - 120, start.x + dx)), y: Math.max(0, Math.min(wrap.height - 30, start.y + dy)) });
      else box = Object.assign({}, start, { w: Math.max(250, Math.min(wrap.width - start.x - 4, start.w + dx)), h: Math.max(140, Math.min(wrap.height - start.y - 4, start.h + dy)) });
      if (kind === 'resize') { const before = el.querySelectorAll('.cw-cam').length; place(); if (capacity() !== before) render(); } else place();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.classList.remove('moving'); NX.store.set('cw:box', box); render(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    e.preventDefault();
  }

  // Katta koʻrinish + AI tahlil; Windy’da jonli efir/timelapse boʻlsa — oʻshani koʻrsatadi
  function open(i) {
    const c = items[i]; if (!c) return;
    let d = document.getElementById('camDlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'camDlg'; d.className = 'cam-dlg'; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-cw=close]')) d.close(); }); }
    const paint = (ai) => {
      d.innerHTML = `<div class="cw-h"><span class="cw-dot"></span><b>CAM-${String(i + 1).padStart(2, '0')}</b><span class="cw-name2">${E(c.title)}${c.city ? ' · ' + E(c.city) : ''}</span>${sample ? '<span class="cw-sample">NAMUNA</span>' : ''}<button type="button" class="cw-btn" data-cw="close" aria-label="Yopish">✕</button></div>
        ${c.live && /^https:\/\/(webcams\.windy\.com|www\.windy\.com)\//.test(c.live) ? `<iframe class="cw-big cw-live-frame" src="${E(c.live)}" title="${E(c.title)}" allow="autoplay; fullscreen" referrerpolicy="no-referrer"></iframe>` : `<img class="cw-big" src="${E(fresh(c.preview))}" alt="${E(c.title)}">`}
        <div class="cw-dlg-f"><a href="${E(c.detail)}" target="_blank" rel="noopener">${E(sample ? 'Fintraffic Digitraffic (CC BY 4.0)' : 'Windy.com')} ↗</a> · ${hhmm(c.updated)}${c.live ? ' · <b>jonli / timelapse</b>' : ' · surat'}
          <button type="button" class="btn xs" data-cw="ai" ${ai && ai.busy ? 'disabled' : ''}>🤖 AI tahlil</button></div>
        ${ai ? `<div class="cw-ai">${ai.busy ? '<span class="spinner sm"></span> AI kadrni koʻrmoqda…' : ai.err ? '⚠️ ' + E(ai.err) : NX.ai.render(ai.text)}</div>` : ''}`;
      const b = d.querySelector('[data-cw=ai]');
      if (b) b.onclick = () => { paint({ busy: true }); NX.ai.webcamCheck(Object.assign({}, c, { preview: fresh(c.preview) })).then(t => paint({ text: t }), e => paint({ err: e.message })); };
    };
    paint(null);
    if (!d.open) d.showModal ? d.showModal() : d.setAttribute('open', '');
  }

  function init() {
    if (el || !NX.ai.available()) return;
    el = document.createElement('div');
    el.className = 'cam-wall'; el.id = 'camWall'; el.hidden = true;
    collapsed = window.matchMedia('(max-width: 820px)').matches || NX.store.get('cw:min', false);
    document.querySelector('.map-wrap').appendChild(el);
    el.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-cw]'); if (!b) return;
      if (b.dataset.cw === 'resize') { e.stopPropagation(); drag(e, 'resize'); }
      else if (b.dataset.cw === 'drag' && !e.target.closest('button')) { e.stopPropagation(); drag(e, 'drag'); }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-cw]'); if (!b) return;
      e.stopPropagation();
      if (b.dataset.cw === 'toggle') { collapsed = !collapsed; NX.store.set('cw:min', collapsed); render(); }
      if (b.dataset.cw === 'open') open(+b.dataset.i);
    });
    ['mousedown', 'dblclick', 'wheel', 'touchstart', 'pointerdown'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
    load();
    setInterval(load, 5 * 60e3);          // roʻyxat (Windy havolalari ~10 daqiqa amal qiladi)
    setInterval(tick, REFRESH);           // suratlar
    setInterval(() => { const c = el.querySelector('.cw-clock'); if (c) c.textContent = new Date().toLocaleTimeString('uz-UZ', { hour12: false, timeZone: 'Asia/Samarkand' }); }, 1000);
    window.addEventListener('resize', () => { if (box) { const w = el.parentElement.getBoundingClientRect(); box.x = Math.min(box.x, Math.max(0, w.width - 120)); box.y = Math.min(box.y, Math.max(0, w.height - 30)); place(); } });
  }
  const show = on => { if (el) el.style.display = on ? '' : 'none'; };

  NX.camwall = { init, load, show, items: () => items, isSample: () => sample, capacity };
})();
