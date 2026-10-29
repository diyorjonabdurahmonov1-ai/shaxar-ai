/* City Jam — xarita ustidagi kamera devori (boshqaruv markazi uslubi).
   Avval Samarqand atrofidagi ochiq kameralar; ular yoʻq boʻlsa — NAMUNA sifatida Finlyandiya yoʻl kameralari (aniq belgilangan). */
(function () {
  'use strict';
  const NX = window.NX;
  let el = null, items = [], sample = false, collapsed = false, timer = null, clock = null;

  const E = s => NX.esc(String(s == null ? '' : s));
  const hhmm = t => (t ? new Date(t).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Samarkand' }) : '—');

  function render() {
    if (!el) return;
    const now = new Date().toLocaleTimeString('uz-UZ', { hour12: false, timeZone: 'Asia/Samarkand' });
    el.classList.toggle('min', collapsed);
    el.innerHTML = `<div class="cw-h"><span class="cw-dot"></span><b>KAMERALAR</b><span class="cw-n">${items.length}</span>${sample ? '<span class="cw-sample">NAMUNA · Finlyandiya yoʻl kameralari</span>' : '<span class="cw-live">SAMARQAND</span>'}<span class="cw-clock">${now}</span><button type="button" class="cw-btn" data-cw="toggle" aria-label="${collapsed ? 'Ochish' : 'Yigʻish'}">${collapsed ? '▢' : '—'}</button></div>
      ${collapsed ? '' : `<div class="cw-grid">${items.map((c, i) => `<button type="button" class="cw-cam" data-cw="open" data-i="${i}" title="${E(c.title)}"><img src="${E(c.preview)}" alt="" loading="lazy"><span class="cw-rec">● ${hhmm(c.updated)}</span><span class="cw-name">CAM-${String(i + 1).padStart(2, '0')} · ${E(c.title)}</span></button>`).join('')}</div>
      <div class="cw-f">${sample ? 'Samarqand kameralari ulanmaguncha — namuna. ' : ''}Suratlar har bir necha daqiqada yangilanadi · ${E(sample ? 'Fintraffic Digitraffic, CC BY 4.0' : 'Windy.com')}</div>`}`;
  }

  async function load() {
    try {
      let l = await NX.webcams.load(60);
      sample = false;
      if (!l.length) { l = await NX.webcams.load(60, 'fi'); sample = true; }
      items = l.filter(c => c.preview).slice(0, 8);
    } catch (e) { items = []; }
    if (!items.length) { if (el) el.hidden = true; return; }
    if (el) { el.hidden = false; render(); }
  }

  // Katta koʻrinish + AI tahlil
  function open(i) {
    const c = items[i]; if (!c) return;
    let d = document.getElementById('camDlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'camDlg'; d.className = 'cam-dlg'; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-cw=close]')) d.close(); }); }
    const paint = (ai) => {
      d.innerHTML = `<div class="cw-h"><span class="cw-dot"></span><b>CAM-${String(i + 1).padStart(2, '0')}</b><span class="cw-name2">${E(c.title)}${c.city ? ' · ' + E(c.city) : ''}</span>${sample ? '<span class="cw-sample">NAMUNA</span>' : ''}<button type="button" class="cw-btn" data-cw="close" aria-label="Yopish">✕</button></div>
        <img class="cw-big" src="${E(c.preview)}" alt="${E(c.title)}">
        <div class="cw-dlg-f"><a href="${E(c.detail)}" target="_blank" rel="noopener">${E(sample ? 'Fintraffic Digitraffic (CC BY 4.0)' : 'Windy.com')} ↗</a> · ${hhmm(c.updated)}
          <button type="button" class="btn xs" data-cw="ai" ${ai && ai.busy ? 'disabled' : ''}>🤖 AI tahlil</button></div>
        ${ai ? `<div class="cw-ai">${ai.busy ? '<span class="spinner sm"></span> AI kadrni koʻrmoqda…' : ai.err ? '⚠️ ' + E(ai.err) : NX.ai.render(ai.text)}</div>` : ''}`;
      const b = d.querySelector('[data-cw=ai]');
      if (b) b.onclick = () => { paint({ busy: true }); NX.ai.webcamCheck(c).then(t => paint({ text: t }), e => paint({ err: e.message })); };
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
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-cw]'); if (!b) return;
      e.stopPropagation();
      if (b.dataset.cw === 'toggle') { collapsed = !collapsed; NX.store.set('cw:min', collapsed); render(); }
      if (b.dataset.cw === 'open') open(+b.dataset.i);
    });
    ['mousedown', 'dblclick', 'wheel', 'touchstart', 'pointerdown'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
    load();
    timer = setInterval(load, 5 * 60e3);          // roʻyxat va suratlar
    clock = setInterval(() => { const c = el.querySelector('.cw-clock'); if (c) c.textContent = new Date().toLocaleTimeString('uz-UZ', { hour12: false, timeZone: 'Asia/Samarkand' }); }, 1000);
  }
  const show = on => { if (el) el.style.display = on ? '' : 'none'; };

  NX.camwall = { init, load, show, items: () => items, isSample: () => sample };
})();
