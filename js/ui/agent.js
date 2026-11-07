/* Veb-agent: ekrandagi tugma/maydonlarni koʻradi (DOM surati), AI aytgan qadamlarni bajaradi — kursor tugmaga uchib borib bosadi.
   Faqat koʻrinib turgan elementlar; xavfli tugmalar (tozalash/oʻchirish) bosilmaydi. */
(function () {
  'use strict';
  const NX = window.NX = window.NX || {};
  let EL = [];
  const SEL = 'button, a[href], input, select, textarea, summary, [role=button], [role=tab], [data-tab], label.check, .chip, .btn, [data-act], .prob-item, .problem, .sys-card, li[tabindex], div[tabindex]';
  const RISKY = /tozalash|ochirish|oʻchirish|o‘chirish|delete|reset|clear/i;
  const txt = el => String(el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.placeholder || el.value || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  function visible(el) {
    if (el.closest('#voiceHud, #wakePill, .ag-ptr')) return false;
    const r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0' || cs.pointerEvents === 'none') return false;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), top = document.elementFromPoint(cx, cy);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  }
  function snapshot() {
    const dlg = document.querySelector('dialog[open]');
    const root = dlg || document;
    const list = [...root.querySelectorAll(SEL)].filter(visible);
    const rank = el => (el.closest('#panel') ? 0 : el.closest('header, .tabs') ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b));
    EL = []; const out = [];
    const seen = new Set();
    for (const el of list) {
      if (EL.length >= 90) break;
      if (el.tagName === 'DIV' && !el.getAttribute('tabindex')) continue;
      const t = txt(el); const kind = el.tagName === 'INPUT' ? (el.type === 'checkbox' ? 'checkbox' : 'input') : el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'input' : el.getAttribute('role') === 'tab' ? 'tab' : el.tagName === 'A' ? 'link' : 'button';
      if (!t && kind !== 'input') continue;
      const key = kind + '|' + t + '|' + Math.round(el.getBoundingClientRect().left / 20); if (seen.has(key)) continue; seen.add(key);
      const id = EL.length; EL.push(el);
      const o = { id, k: kind, t };
      if (kind === 'checkbox') o.on = !!el.checked; if (kind === 'tab') o.on = el.getAttribute('aria-selected') === 'true'; if (kind === 'input' && el.value) o.v = String(el.value).slice(0, 40);
      out.push(o);
    }
    const st = (window.NX.state || {});
    return { tab: st.tab, dialog: !!dlg, items: out };
  }
  const compact = s => s.items.map(o => o.id + ' ' + o.k + ' «' + o.t + '»' + (o.on != null ? (o.on ? ' [yoniq]' : ' [oʻchiq]') : '') + (o.v ? ' =' + o.v : '')).join('\n');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function pointer() {
    let p = document.querySelector('.ag-ptr'); if (!p) { p = document.createElement('div'); p.className = 'ag-ptr'; p.innerHTML = '<i></i>'; document.body.appendChild(p); }
    return p;
  }
  async function fly(el) {
    const r = el.getBoundingClientRect(), p = pointer(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    p.style.opacity = '1'; p.style.transform = `translate(${x}px, ${y}px)`; await sleep(520);
    p.classList.add('tap'); await sleep(180); p.classList.remove('tap');
  }
  const hide = () => { const p = document.querySelector('.ag-ptr'); if (p) setTimeout(() => { p.style.opacity = '0'; }, 500); };
  // Bitta qadam. h — ilova beradigan ishlovchilar: cmd, place, street, ask
  async function step(s, h) {
    const a = s.a;
    if (a === 'cmd' && h.cmd) return h.cmd(s.k);
    if (a === 'place' && h.place) return h.place(s.n);
    if (a === 'street' && h.street) return h.street(s.n);
    if (a === 'ask' && h.ask) return h.ask(s.text);
    if (a === 'wait') return sleep(Math.min(2000, +s.ms || 600));
    if (a === 'scroll') { const el = document.querySelector('#panel') || document.scrollingElement; if (el) el.scrollBy({ top: s.dir === 'up' ? -420 : 420, behavior: 'smooth' }); return sleep(350); }
    const el = EL[s.id]; if (!el || !document.contains(el)) return 'yoʻq';
    if (a === 'click') {
      if (RISKY.test(txt(el)) && !/yangila/i.test(txt(el))) return 'xavfli';
      await fly(el); el.click(); return 'ok';
    }
    if (a === 'type') { await fly(el); el.focus(); el.value = s.text || ''; el.dispatchEvent(new Event('input', { bubbles: true })); if (s.enter) { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); const f = el.closest('form'); if (f) { const b = f.querySelector('button[type=submit], button:not([type])'); b ? b.click() : f.requestSubmit && f.requestSubmit(); } } return 'ok'; }
    if (a === 'select') { await fly(el); el.value = s.v; el.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; }
    return 'nomaʼlum';
  }
  async function run(steps, h) {
    const log = [];
    for (const s of (steps || []).slice(0, 8)) { try { log.push(await step(s, h || {})); } catch (e) { log.push('xato'); } await sleep(380); }
    hide(); return log;
  }
  NX.agent = { snapshot, compact, run };
})();
