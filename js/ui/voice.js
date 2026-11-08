/* City Jam — ovoz: yozib olish (MediaRecorder) → Worker /stt (OpenAI, oʻzbekcha) → matn.
   Gapirib boʻlgach 1.6 s jimlikda oʻzi toʻxtaydi (yoki tugmani qayta bosish; ≤ 40 s).
   Worker eski boʻlsa — brauzerning Web Speech (uz-UZ) zaxira sifatida. */
(function () {
  'use strict';
  const NX = window.NX;
  const base = () => ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim().replace(/\/+$/, '');
  let ver = null, cur = null, sttOff = false, held = null;
  async function serverOk() {
    if (ver != null) return ver >= 13;
    if (!base()) return false;
    try { const r = await NX.fetchJSON(base() + '/version', {}, 8000); ver = r.ok && r.data ? +r.data.v || 0 : 0; } catch (e) { ver = 0; }
    return ver >= 13;
  }
  const serverVer = async () => { await serverOk(); return ver || 0; };
  // Yozuv (webm/opus) → 16 kHz mono WAV (base64): AI audio kirishi shuni qabul qiladi
  async function toWav(blob) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error('AudioContext yoʻq');
    const ac = new AC(); let buf;
    try { buf = await ac.decodeAudioData(await blob.arrayBuffer()); } finally { ac.close().catch(() => {}); }
    const sec = Math.min(buf.duration, 20), n = Math.round(sec * 16000), oc = new OfflineAudioContext(1, n, 16000), src = oc.createBufferSource();
    src.buffer = buf; src.connect(oc.destination); src.start(); const out = (await oc.startRendering()).getChannelData(0);
    const pcm = new DataView(new ArrayBuffer(44 + n * 2)), W = (o, s) => { for (let i = 0; i < s.length; i++) pcm.setUint8(o + i, s.charCodeAt(i)); };
    W(0, 'RIFF'); pcm.setUint32(4, 36 + n * 2, true); W(8, 'WAVE'); W(12, 'fmt '); pcm.setUint32(16, 16, true); pcm.setUint16(20, 1, true); pcm.setUint16(22, 1, true); pcm.setUint32(24, 16000, true); pcm.setUint32(28, 32000, true); pcm.setUint16(32, 2, true); pcm.setUint16(34, 16, true); W(36, 'data'); pcm.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) pcm.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 32767, true);
    const u8 = new Uint8Array(pcm.buffer); let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    return btoa(bin);
  }
  // Kirill → lotin (katta-kichik harf saqlanadi)
  const CY = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: 'ʼ', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h' };
  const toLatin = s => String(s || '').replace(/[А-Яа-яЁёЎўҚқҒғҲҳ]/g, c => { const l = c.toLowerCase(), t = CY[l] != null ? CY[l] : c; return c === l ? t : t.charAt(0).toUpperCase() + t.slice(1); });

  // Uygʻoq rejimda mikrofon bir marta ochiladi (har gapda qayta ochish ogʻir va ruxsat soʻrashi mumkin)
  async function hold(on) {
    if (!on) { if (held) { try { held.stream.getTracks().forEach(t => t.stop()); held.ac && held.ac.close().catch(() => {}); } catch (e) { /* */ } held = null; } return; }
    if (held && held.stream.active) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AC = window.AudioContext || window.webkitAudioContext, ac = AC ? new AC() : null, an = ac ? ac.createAnalyser() : null;
    if (ac) { ac.createMediaStreamSource(stream).connect(an); an.fftSize = 1024; }
    held = { stream, ac, an };
  }
  // Yozib olish: Promise<Blob>; onLevel(0..1) — tugma animatsiyasi uchun
  async function record(onLevel, ui) {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('Bu brauzer ovoz yozishni qoʻllamaydi (Chrome yoki Edge’ning yangi versiyasi kerak).');
    let stream, ac, an, own = true;
    if (held && held.stream.active) { stream = held.stream; ac = held.ac; an = held.an; own = false; if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); }
    else {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Mikrofonga ruxsat berilmagan — manzil satridagi 🔒 belgisidan mikrofonga ruxsat bering.' : 'Mikrofon topilmadi yoki band.'); }
      const AC = window.AudioContext || window.webkitAudioContext; ac = AC ? new AC() : null; an = ac ? ac.createAnalyser() : null;
      if (ac) { ac.createMediaStreamSource(stream).connect(an); an.fftSize = 1024; if (ac.state === 'suspended') ac.resume().catch(() => {}); }
    }
    const micLabel = (stream.getAudioTracks()[0] || {}).label || ''; ui && ui.onMic && ui.onMic(micLabel);
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const buf = an ? new Uint8Array(an.fftSize) : null;
    let spoke = false, quietAt = 0, t0 = Date.now(), raf = 0, floor = 0, nF = 0, peak = 0, quietWarned = false;
    const done = new Promise(res => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); });
    let acOk = false;
    const stop = () => { acOk = !!(ac && ac.state === 'running'); if (rec.state !== 'inactive') rec.stop(); clearTimeout(raf); if (own) { stream.getTracks().forEach(t => t.stop()); if (ac) ac.close().catch(() => {}); } };
    let voicedMs = 0, lastT = 0, lvT = 0;
    const tick = () => {
      const now = Date.now();
      if (an) {
        an.getByteTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i] - 128));
        const lv = m / 128; if (onLevel && now - lvT > 100) { lvT = now; onLevel(lv); }
        peak = Math.max(peak, lv);
        // Xona shovqini birinchi 0.4 s da oʻlchanadi; gap — shovqindan 2.5 baravar baland (kamida 0.02)
        if (Date.now() - t0 < 400) { floor = (floor * nF + lv) / (++nF); }
        else { const th = Math.max(0.02, Math.min(0.1, floor * 2.5)); /* gap shovqin oʻlchovi vaqtida boshlangan boʻlsa ham chegara haddan oshmaydi */ if (lv > th) { spoke = true; quietAt = 0; voicedMs += Math.min(100, now - (lastT || now)); } else if (spoke) { quietAt = quietAt || Date.now(); if (Date.now() - quietAt > 1000) return stop(); } }
      }
      lastT = now;
      if (!quietWarned && !spoke && Date.now() - t0 > 2500 && peak < 0.004) { quietWarned = true; ui && ui.onQuiet && ui.onQuiet(micLabel); }
      if (Date.now() - t0 > 40000 || (!spoke && Date.now() - t0 > (peak < 0.004 ? 4500 : 8000))) return stop();
      raf = setTimeout(tick, 50);
    };
    rec.start(250); tick();
    cur = { stop };
    const blob = await done; cur = null;
    if ((!spoke || voicedMs < 350) && ui && ui.silentOk) return null;   // qisqa shovqin (shaqillash, ovoz) gap emas   // uygʻoq rejim: hech kim gapirmadi — serverga yuborilmaydi
    // Oʻlchagich gapni sezmagan boʻlsa ham (baʼzi mikrofonlar / uxlagan AudioContext) — yozuv baribir matnga oʻgiriladi; butunlay jim boʻlsa xabar
    if (!spoke && an && peak < 0.004 && acOk) throw new Error('Mikrofondan ovoz kelmayapti — Windows ovoz sozlamalarida toʻgʻri mikrofon tanlanganini va brauzerga ruxsat berilganini tekshiring.');
    return blob;
  }
  async function transcribe(blob) {
    const r = await NX.fetchJSON(base() + '/stt', { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob }, 15000);
    if (!r.ok || !r.data || r.data.error) throw new Error((r.data && r.data.error && r.data.error.message) || 'Ovozni matnga oʻgirib boʻlmadi (HTTP ' + r.status + ')');
    let t = toLatin(r.data.text || '').trim();
    // Model eshitmay qolsa kontekst matnini qaytaradi — bunday “javob” buyruq emas (eski Worker’ning uzun promptini ham taniydi)
    if (/lotin yozuv|oʻzbek tili, lotin|o‘zbek tili, lotin|shahar hokimiyati, o|3d egizak, xarita, hisobot|oʻzbekcha gap/i.test(t)) t = '';
    // Nutq modellari jim/xira ovozda oʻzidan gap oʻylab topadi — buyruq emas
    if (/субтитр|thank you|thanks for watching|спасибо за просмотр|продолжение следует|amara\.org|dimatorzok|bu video|obuna bo/i.test(t) && t.split(/\s+/).length < 9) t = '';
    if (!t) throw new Error('Gap tanilmadi — biroz balandroq va aniqroq qayta ayting.');
    return t;
  }
  // Brauzer tanishi yozib olish bilan BIR VAQTDA ishlaydi — ikki tanishdan ikki variant (server + brauzer), keyin buyruq ikkalasidan taxminiy moslanadi
  function webCapture(onPart, onSpeechEnd) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const out = { text: '', done: Promise.resolve(''), stop() {} };
    if (!SR) return out;
    let finish; out.done = new Promise(r => { finish = r; });
    const tryLang = lang => {
      let r; try { r = new SR(); } catch (e) { finish(''); return; }
      r.lang = lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 3;
      r.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + ' '; out.text = toLatin(t).trim(); if (onPart) onPart(out.text); };
      r.onerror = e => { if (e.error === 'language-not-supported' && lang === 'uz-UZ') tryLang('ru-RU'); else finish(out.text); };
      r.onend = () => { finish(out.text); if (out.text && onSpeechEnd) onSpeechEnd(); };
      out.stop = () => { try { r.stop(); } catch (e) { /* */ } };
      try { r.start(); } catch (e) { finish(''); }
    };
    tryLang('uz-UZ');
    return out;
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
    NX.voice.cands = []; NX.voice.later = null;
    // Doim tinglash yoqilgan boʻlsa — buyruq yozilayotganda chaqiruv tinglovchisi toʻxtab turadi
    const wkWas = typeof wk !== 'undefined' && wk && !wk.paused; if (wkWas) { wk.paused = true; try { wk.r && wk.r.abort(); } catch (e) { /* */ } }
    try {
      if (await serverOk() && !sttOff) {
        ui.onState && ui.onState('rec');
        // Brauzer gap tugaganini sezsa (1 s jimlik) — yozuv ham darrov toʻxtaydi: javob tezroq
        const wc = webCapture(ui.onPart, () => setTimeout(() => cur && cur.stop && cur.stop(), 250));
        let blob;
        try { blob = await record(ui.onLevel, ui); } finally { wc.stop(); }
        if (!blob) return null;
        ui.onState && ui.onState('busy');
        // Tezlik: brauzer matni allaqachon tayyor va oddiy buyruqqa aniq mos kelsa — serverni kutmaymiz
        const w0 = wc.text;
        if (w0 && ui.quick && ui.quick(w0)) { NX.voice.cands = [w0]; return w0; }
        NX.voice.lastBlob = blob;
        let srvP = null; const srv$ = () => (srvP = srvP || transcribe(blob));   // server faqat kerak boʻlganda chaqiriladi (tushunilmasa)
        NX.voice.later = () => srv$().then(x => x, () => '');
        // Eng tez yoʻl: brauzer matni bor — darrov tahlilga beriladi; tushunilmasa server matni bilan qayta uriniladi
        if (ui.early && w0 && w0.length > 1) { NX.voice.cands = [w0]; return w0; }
        const webT = await Promise.race([wc.done, new Promise(r => setTimeout(() => r(wc.text), 250))]);
        try { const srv = await srv$().catch(e => { const w = wc.text || webT; if (w) return ''; throw e; }); const wt = wc.text || webT; NX.voice.cands = [srv, wt].filter((x, i, a) => x && a.indexOf(x) === i); return srv || wt; }
        catch (e) {
          // Server ovoz modeliga kira olmasa (OpenAI loyihasida ruxsat yoʻq) — bu sessiyada brauzerning oʻz tanishi ishlatiladi
          if (!/tanib boʻlmadi|modeli|HTTP 4\d\d/.test(e.message) || !(window.SpeechRecognition || window.webkitSpeechRecognition)) throw e;
          sttOff = true; console.warn('STT server:', e.message);
          if (NX.toast) NX.toast('Server ovozni tanimadi — brauzer tanishiga oʻtildi, qayta ayting…', 'warn');
        }
      }
      ui.onState && ui.onState('rec');
      return await webSpeech(ui.onPart);
    } finally { cur = null; ui.onState && ui.onState('idle'); if (wkWas && wk) { wk.paused = false; setTimeout(() => wk && wk.on && !wk.hold && wake.restart && wake.restart(), 400); } }
  }
  // ---------- “Alisa” kabi: doim tinglash — chaqiruv soʻzi (“City Jam”) eshitilsa, buyruq yoziladi ----------
  // Brauzerning nutq tanishi (Chrome/Edge) uzluksiz ishlaydi va faqat chaqiruv soʻzini qidiradi; buyruqning oʻzi — listen() (oʻzbekcha STT).
  const WAKE = /(сити|сіті|ситі|сіти|ситти|сыти|цити|city|citi|siti|sity)[\s-]*(д?ж[еэаёи]м|jam|djem|jem|j[ae]m|гем|джей?м|gem)|ситиджем|ситижам|citijam|sitijam|city\s*gym/i;
  let wk = null;
  function beep(f, d) { try { const A = window.AudioContext || window.webkitAudioContext, ac = new A(); if (ac.state === 'suspended') ac.resume(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f || 880; g.gain.value = 0.08; o.connect(g); g.connect(ac.destination); o.start(); setTimeout(() => { o.stop(); ac.close(); }, d || 160); } catch (e) { /* */ } }
  function wake(onWake, onState) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error('Doim tinglash uchun Chrome yoki Edge brauzeri kerak.');
    if (wk && wk.on) return;
    wk = { on: true, paused: false, r: null, fails: 0 };
    const start = () => {
      if (!wk || !wk.on || wk.paused || wk.hold || cur) return;
      if (wk.r) { const o = wk.r; wk.r = null; try { o.onend = o.onerror = o.onresult = null; o.abort(); } catch (x) { /* */ } }   // bitta nusxa: eskisi toʻxtatiladi
      const r = new SR(); r.lang = 'ru-RU'; r.continuous = true; r.interimResults = true; wk.r = r;
      r.onresult = e => {
        if (!wk || wk.r !== r) return;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (onState) onState('heard', t);
          const wm = t.match(WAKE);
          if (wm) { const rest = toLatin(t.slice(wm.index + wm[0].length)).replace(/^[\s,.!:-]+/, '').trim(); wk.paused = true; try { r.abort(); } catch (x) { /* */ } onWake(rest).finally(() => { if (wk) { wk.paused = false; setTimeout(start, 400); } }); return; }
        }
      };
      r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wk.on = false; onState && onState('denied'); } else { wk.fails++; if (e.error !== 'no-speech' && e.error !== 'aborted') onState && onState('error', e.error); } };
      r.onstart = () => { wk.fails = 0; };
      r.onend = () => { if (wk && wk.r === r && wk.on && !wk.paused && !wk.hold) setTimeout(start, wk.fails > 5 ? 3000 : 300); };
      try { r.start(); onState && onState('on'); } catch (x) { setTimeout(start, 1000); }
    };
    wake.restart = start;
    start();
  }
  function wakeHold(h) { if (!wk) return; wk.hold = !!h; if (h) { try { wk.r && wk.r.abort(); } catch (e) { /* */ } } else setTimeout(() => wk && wk.on && !wk.hold && wake.restart && wake.restart(), 300); }
  function wakeStop() { if (!wk) return; wk.on = false; try { wk.r && wk.r.abort(); } catch (e) { /* */ } wk = null; }
  NX.voice = { serverVer, toWav, lastBlob: null, cands: [], listen, stop: () => cur && cur.stop(), active: () => !!cur, toLatin, serverOk, wake, wakeHold, hold, wakeStop, waking: () => !!(wk && wk.on), beep };
})();
