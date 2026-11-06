/* City Jam — ovoz: yozib olish (MediaRecorder) → Worker /stt (OpenAI, oʻzbekcha) → matn.
   Gapirib boʻlgach 1.6 s jimlikda oʻzi toʻxtaydi (yoki tugmani qayta bosish; ≤ 40 s).
   Worker eski boʻlsa — brauzerning Web Speech (uz-UZ) zaxira sifatida. */
(function () {
  'use strict';
  const NX = window.NX;
  const base = () => ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim().replace(/\/+$/, '');
  let ver = null, cur = null;
  async function serverOk() {
    if (ver != null) return ver >= 13;
    if (!base()) return false;
    try { const r = await NX.fetchJSON(base() + '/version', {}, 8000); ver = r.ok && r.data ? +r.data.v || 0 : 0; } catch (e) { ver = 0; }
    return ver >= 13;
  }
  // Kirill → lotin (katta-kichik harf saqlanadi)
  const CY = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: 'ʼ', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h' };
  const toLatin = s => String(s || '').replace(/[А-Яа-яЁёЎўҚқҒғҲҳ]/g, c => { const l = c.toLowerCase(), t = CY[l] != null ? CY[l] : c; return c === l ? t : t.charAt(0).toUpperCase() + t.slice(1); });

  // Yozib olish: Promise<Blob>; onLevel(0..1) — tugma animatsiyasi uchun
  async function record(onLevel) {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('Bu brauzer ovoz yozishni qoʻllamaydi (Chrome yoki Edge’ning yangi versiyasi kerak).');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Mikrofonga ruxsat berilmagan — manzil satridagi 🔒 belgisidan mikrofonga ruxsat bering.' : 'Mikrofon topilmadi yoki band.'); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const AC = window.AudioContext || window.webkitAudioContext, ac = AC ? new AC() : null, an = ac ? ac.createAnalyser() : null;
    if (ac) { ac.createMediaStreamSource(stream).connect(an); an.fftSize = 512; }
    const buf = an ? new Uint8Array(an.fftSize) : null;
    let spoke = false, quietAt = 0, t0 = Date.now(), raf = 0;
    const done = new Promise(res => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); });
    const stop = () => { if (rec.state !== 'inactive') rec.stop(); cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); if (ac) ac.close().catch(() => {}); };
    const tick = () => {
      if (an) {
        an.getByteTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i] - 128));
        const lv = m / 128; if (onLevel) onLevel(lv);
        if (lv > 0.08) { spoke = true; quietAt = 0; } else if (spoke) { quietAt = quietAt || Date.now(); if (Date.now() - quietAt > 1600) return stop(); }
      }
      if (Date.now() - t0 > 40000 || (!spoke && Date.now() - t0 > 9000)) return stop();
      raf = requestAnimationFrame(tick);
    };
    rec.start(250); tick();
    cur = { stop };
    const blob = await done; cur = null;
    if (!spoke && an) throw new Error('Ovoz eshitilmadi — mikrofonga yaqinroq gapiring.');
    return blob;
  }
  async function transcribe(blob) {
    const r = await NX.fetchJSON(base() + '/stt', { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob }, 60000);
    if (!r.ok || !r.data || r.data.error) throw new Error((r.data && r.data.error && r.data.error.message) || 'Ovozni matnga oʻgirib boʻlmadi (HTTP ' + r.status + ')');
    return toLatin(r.data.text || '').trim();
  }
  // Brauzerning oʻz tanishi (zaxira)
  function webSpeech(onPart) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return Promise.reject(new Error('Ovoz xizmati ishlamayapti: Worker’ni yangilang (ovoz moduli) yoki Chrome ishlating.'));
    return new Promise((res, rej) => {
      const r = new SR(); r.lang = 'uz-UZ'; r.interimResults = true; r.continuous = false; let text = '';
      r.onresult = e => { text = ''; for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript; if (onPart) onPart(text); };
      r.onerror = e => rej(new Error(e.error === 'not-allowed' ? 'Mikrofonga ruxsat berilmagan.' : e.error === 'language-not-supported' ? 'Brauzer oʻzbek tilini tanimadi.' : 'Ovoz tanilmadi (' + e.error + ').'));
      r.onend = () => res(toLatin(text).trim());
      cur = { stop: () => r.stop() }; r.start();
    });
  }
  // Asosiy: tinglash → matn. ui: { onState(state: 'rec'|'busy'|'idle'), onLevel, onPart }
  async function listen(ui) {
    ui = ui || {};
    if (cur) { cur.stop(); return null; }
    try {
      if (await serverOk()) {
        ui.onState && ui.onState('rec');
        const blob = await record(ui.onLevel);
        ui.onState && ui.onState('busy');
        return await transcribe(blob);
      }
      ui.onState && ui.onState('rec');
      return await webSpeech(ui.onPart);
    } finally { cur = null; ui.onState && ui.onState('idle'); }
  }
  NX.voice = { listen, stop: () => cur && cur.stop(), active: () => !!cur, toLatin, serverOk };
})();
