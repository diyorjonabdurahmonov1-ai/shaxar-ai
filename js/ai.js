/* City Jam — AI tahlilchi: savoldan koʻcha va stsenariyni aniqlash, simulyatsiya, OpenAI javobi */
(function () {
  'use strict';
  const NX = window.NX;
  const norm = s => NX.translit(s).replace(/[ʻʼ'`’‘ʹ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const SUFFIX = /\b(kochasi|kuchasi|ulitsa|ulica|shoh kochasi|prospekti|prospekt|shoh|tor kochasi|berk kochasi|street|avenue|maydoni|kochasi)\b/g;
  const core = s => norm(s).replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();

  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // Soʻz qoʻshimchalari (-ni, -da, -ga…) hisobga olinadi: savoldagi soʻz boshi koʻcha nomiga solishtiriladi
  function wordSim(w, c) {
    if (w.startsWith(c)) return 1;
    const head = w.slice(0, c.length + 1);
    const d = Math.min(lev(head, c), lev(w.slice(0, c.length), c));
    return Math.max(0, 1 - d / Math.max(3, c.length));
  }

  const GENERIC = /^(chorra[hx]a|bozor|markaz|yangi|bog|maktab|ko.?prik|vokzal|aeroport|stadion|park|masjid|bekat|xiyobon|maydon|shahar|mahalla)/i;
  function detectStreets(q, M) {
    const words = norm(q).split(' ').filter(Boolean);
    const found = [];
    M.namedStreets.forEach(s => {
      let best = 0;
      [s.name].concat(s.alt).forEach(nm => {
        const cw = core(nm).split(' ').filter(w => w.length >= 3);
        if (!cw.length) return;
        for (let i = 0; i + cw.length <= words.length; i++) {
          let sim = 0;
          for (let k = 0; k < cw.length; k++) sim += wordSim(words[i + k], cw[k]);
          best = Math.max(best, sim / cw.length);
        }
      });
      // Umumiy soʻzga oʻxshash nomlar (Chorraxa, Bozor, Markaz…) — faqat savolda yonida “koʻcha” soʻzi boʻlsa
      const c1 = core(s.name).split(' ').filter(w => w.length >= 3);
      if (best >= 0.8 && c1.length === 1 && GENERIC.test(c1[0]) && !new RegExp(c1[0].slice(0, 5) + '\\S*\\s+(ko.?ch|kuch|yo.?l)', 'i').test(norm(q))) best = 0;
      if (best >= 0.8) found.push({ s, score: best });
    });
    found.sort((a, b) => b.score - a.score || b.s.rank - a.s.rank);
    const seen = new Set();
    return found.filter(f => (seen.has(f.s.name) ? false : seen.add(f.s.name))).slice(0, 2);
  }

  function detectScenario(q) {
    const n = norm(q);
    if (/bir tomonlama|bir yonalishli|bir tomonli|odnostoron/.test(n)) return { type: 'oneway', dir: /teskari|qarama|ikkinchi/.test(n) ? 'B' : 'A' };
    if (/yops|yopil|yopish|piyoda|avtomobilsiz|mashinasiz/.test(n)) return { type: 'close' };
    if (/avtobus polosa|avtobus yolak|bus lane|avtobus uchun polosa|alohida polosa/.test(n)) return { type: 'buslane' };
    if (/svetofor|signal/.test(n)) return { type: 'signal' };
    if (/turist|mavsum|talab oshsa|20/.test(n)) return { type: 'demand', factor: 1.2 };
    return null;
  }

  const SYSTEM = `Sen Samarqand shahri tarixiy markazining transport yordamchisisan.
Qoidalar:
- Faqat oʻzbek tilida (lotin yozuvi) yoz. Oddiy, qisqa, tushunarli yoz — ilmiy soʻz va formulalarsiz.
- Foydalanuvchining SAVOLIGA AYNAN javob ber. Savolga aloqasi yoʻq narsani yozma.
- Faqat berilgan JSON maʼlumotdan foydalan. Maʼlumotda yoʻq raqam, koʻcha yoki hodisani oʻylab topma.
- Ochiq xaritada (OSM) belgilanmagan narsa (zebra, svetofor, maktab, ariq) haqiqatda boʻlishi mumkin: “yoʻq” dema — “ochiq maʼlumotda belgilanmagan” de. Mavjud svetofor, zebra yoki chorraha yonida yangi oʻtish joyi yoki svetofor taklif qilma.
- Yechim taklif qilganda eng oddiy, arzon va yaqin variantdan boshla (mavjud inshootni tozalash/ulash, belgi, tashkiliy chora), keyin kerak boʻlsa qimmatrogʻini; har taklifni masofa/oʻlcham va (berilgan boʻlsa) narx bilan asosla. Butun shahar boʻyicha takrorlab boʻlmaydigan ulkan yoki uzoq inshootni oddiyroq yoʻl bor joyda tavsiya qilma.
  Kerakli maʼlumot boʻlmasa, “Bu haqda saytda maʼlumot yoʻq” deb ayt va saytning qaysi boʻlimida koʻrish mumkinligini qisqa ayt.
- “real” (TomTom yoki Open-Meteo oʻlchovi) va “taxmin”ni (model hisobi) farqla: taxminni oʻlchov deb atama.
- Odatda 2–6 gap yetarli. Roʻyxat kerak boʻlsa — qisqa nuqtalar bilan.
- Sen hokimiyat va shahar xizmatlari xodimlari bilan gaplashyapsan: aniq, amaliy, qaror qabul qilishga yordam beradigan javob ber.
- Agar savol “koʻchani oʻzgartirsak nima boʻladi?” turida boʻlsa va JSON’da “simulyatsiya” berilgan boʻlsa:
  avval bir gapda xulosa, keyin qaysi koʻchalar koʻproq yuklanadi (ular xaritada qizil koʻrsatilgan) va qaysi avtobuslarga taʼsir qiladi, keyin 1–2 ta amaliy maslahat.
- Agar koʻchada “tanlangan_qism” berilgan boʻlsa — gap butun koʻcha emas, faqat shu qism (qayerdan–qayergacha) haqida; javobda buni aniq ayt va “qismdagi_muammolar”ga tayan.
- Agar savol “bu koʻchani nima qilish kerak?” turida boʻlsa — koʻchaning “muammolar” roʻyxati va yechimlariga tayan, ustuvorlik tartibida ayt.
- Mos boʻlsa, javob oxirida “Kelajakda:” deb bitta gap yoz: transport oqimi oshsa (masalan, turistik mavsumda) qaysi joy birinchi boʻlib tirband boʻlishi mumkin — faqat “sigim_toʻlishi” raqamlariga tayanib.
- Bosh rejaga va UNESCO muhofaza talablariga zid tavsiya berma (tarixiy markazda yangi keng yoʻl, baland bino va h.k.). Eng oddiy, arzon chora (belgi, svetofor rejimi, tashkiliy) dan boshla.`;

  function streetFacts(s, M) {
    return {
      nomi: s.name, turi: NX.HW[s.hw].uz, uzunlik_m: Math.round(s.length),
      harakat: s.oneway === 'yes' ? 'bir tomonlama' : s.oneway === 'mixed' ? 'qisman bir tomonlama' : 'ikki tomonlama',
      polosalar_osm: s.lanes || null, polosa_bir_tomonga_hisob: s.lanesPerDir, tezlik_chegarasi_kmh: s.maxspeed || null,
      avtobus_liniyalari: s.busRefs, bekatlar_soni: s.stops.length, svetoforlar: s.signals.length, piyoda_otishlar: s.crossings.length,
      yaqin_maktab_bogcha: s.schools.length, tirbandlik_xavfi_hisob_0_100: s.risk.value,
      muammolar: M.problems.filter(p => p.street === s.id || (p.streets && p.streets.includes(s.id))).slice(0, 6).map(p => ({ turi: NX.PROBLEM[p.type].short, joy: p.title, yechim: NX.PROBLEM[p.type].fix })),
      tomtom: s.tomtom ? { joriy_tezlik_kmh: Math.round(s.tomtom.currentSpeed), erkin_tezlik_kmh: Math.round(s.tomtom.freeFlowSpeed), tirbandlik_foiz: Math.round(s.tomtom.congestion), vaqt: NX.fmt.time(s.tomtom.ts) } : 'oʻlchanmagan',
    };
  }

  // Foydalanuvchi koʻchaning faqat bir qismini tanlagan boʻlsa
  function segFacts(seg, s, M) {
    if (!seg || seg.street !== s.id) return {};
    return { tanlangan_qism: {
      qayerdan: seg.from.name ? seg.from.name + ' bilan kesishma' : 'koʻcha boshi', qayergacha: seg.to.name ? seg.to.name + ' bilan kesishma' : 'koʻcha oxiri',
      uzunlik_m: Math.round(seg.len), butun_koʻcha_m: Math.round(s.length),
      qismdagi_muammolar: NX.segment.problems(M, seg).slice(0, 6).map(p => ({ turi: NX.PROBLEM[p.type].short, joy: p.title, yechim: NX.PROBLEM[p.type].fix })),
      izoh: 'Savol va simulyatsiya faqat shu qism haqida.',
    } };
  }

  function simFacts(res, M) {
    if (!res) return null;
    const r = res.result;
    const row = x => ({ koʻcha: x.name || 'nomsiz yoʻl', hajm_oldin: Math.round(x.baseVol), hajm_keyin: Math.round(x.scenVol), sigim_toʻlishi_oldin_foiz: Math.round(x.baseVC * 100), sigim_toʻlishi_keyin_foiz: Math.round(x.scenVC * 100) });
    return {
      stsenariy: res.label, talab_reys_soat: res.demand,
      umumiy_yol_vaqti_ozgarishi_foiz: +r.ttChangePct.toFixed(1),
      maqsadli_koʻcha: r.target ? row(r.target) : null,
      eng_kop_taʼsirlangan_koʻchalar: r.affected.slice(0, 6).map(row),
      yangi_haddan_oshgan_koʻchalar: r.overloaded.slice(0, 6).map(x => x.name || 'nomsiz yoʻl'),
      yonalishi_ozgarishi_kerak_liniyalar: res.verdict.busLines,
      xulosa: res.verdict.label, sabablar: res.verdict.reasons,
      eslatma: 'Soddalashtirilgan model bashorati; kalibrlanmagan boʻlishi mumkin.',
    };
  }

  function forecastFacts(s) {
    const n = NX.forecast.next24(s);
    const peak = n.reduce((a, b) => (b.value > a.value ? b : a));
    return { keyingi_24_soat_eng_yuqori: { soat: peak.label, tirbandlik_foiz: Math.round(peak.value) }, ishonch: peak.low ? 'past (TomTom tarixi kam)' : 'yetarli', tomtom_namunalar: peak.total };
  }

  // Foydalanuvchining oʻz kaliti boʻlsa — toʻgʻridan-toʻgʻri OpenAI; boʻlmasa — sayt egasining yashirin proksisi
  const userKey = () => (NX.store.get('key:openai', '') || '').trim();
  const proxyUrl = () => ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim();
  const aiAvailable = () => !!(userKey() || proxyUrl());

  // Mavjud emas deb javob bergan modellar 1 kun qayta soʻralmaydi (har safar ortiqcha kutish boʻlmasin)
  const badModels = () => { const b = NX.store.get('ai:bad', {}); Object.keys(b).forEach(k => { if (Date.now() - b[k] > 86400e3) delete b[k]; }); return b; };
  const markBad = m => { const b = badModels(); b[m] = Date.now(); NX.store.set('ai:bad', b); };
  // ---------- Soʻrov hajmi: Worker chegarasi (eski versiya 30 ming, yangisi 60 ming belgi) ----------
  // Maʼlumot (JSON) juda katta boʻlsa — roʻyxatlar qisqartiriladi, uzun matnlar kesiladi (eng muhim birinchi elementlar qoladi).
  const BODY_SOFT = 56000, BODY_OLD = 28500;
  function shrinkObj(o, n, sl, depth) {
    if (Array.isArray(o)) { const a = o.slice(0, n).map(x => shrinkObj(x, n, sl, depth + 1)); if (o.length > n) a.push(`… yana ${o.length - n} ta`); return a; }
    if (o && typeof o === 'object') { const r = {}; Object.keys(o).forEach(k => { r[k] = depth > 6 ? (typeof o[k] === 'object' ? '…' : o[k]) : shrinkObj(o[k], n, sl, depth + 1); }); return r; }
    if (typeof o === 'string' && o.length > sl) return o.slice(0, sl) + '…';
    return o;
  }
  const MARK = 'JSON):\n';
  function fitMessages(messages, max) {
    const size = () => JSON.stringify({ messages }).length + 300;
    if (size() <= max) return messages;
    messages = messages.map(m => Object.assign({}, m));
    // 1) avvalgi suhbat qisqartiriladi
    messages.forEach((m, i) => { if (i > 0 && i < messages.length - 1 && typeof m.content === 'string') m.content = m.content.slice(0, 500); });
    const last = messages[messages.length - 1];
    if (typeof last.content !== 'string' || last.content.indexOf(MARK) < 0) return messages;
    const at = last.content.indexOf(MARK) + MARK.length, head = last.content.slice(0, at);
    let facts; try { facts = JSON.parse(last.content.slice(at)); } catch (e) { last.content = last.content.slice(0, Math.max(2000, max - 16000)); return messages; }
    for (const [n, sl] of [[40, 600], [25, 400], [15, 300], [10, 200], [6, 150], [4, 100], [2, 80]]) {
      last.content = head + JSON.stringify(shrinkObj(facts, n, sl, 0));
      if (size() <= max) break;
    }
    return messages;
  }
  // ---------- Barcha tahlil promptlariga umumiy qoidalar va xodimlar koʻrsatgan oldingi xatolar ----------
  const ANALYST = `
UMUMIY TAHLIL QOIDALARI (har javobda):
1) Avval savolni aniqla: nima soʻralgan (joy, vaqt, son, “nega”, “nima qilish kerak”). Birinchi gap — shu savolga toʻgʻridan-toʻgʻri javob (raqam va nom bilan).
2) Har xulosani sabab → oqibat bilan ayt (masalan: “Daxbet tomondan kirish 2.1 marta sekin → ertalab maktabga va bozorga oqim”). Umumiy, hamma joyga mos gaplar (“tirbandlik muammo”, “kompleks yondashuv”) YOZMA.
3) Raqam, nom, masofa — faqat berilgan JSON’dan. JSON’da yoʻq narsani bilmasang — “maʼlumot yoʻq: … dan soʻrash kerak” de, oʻylab topma. “Yoʻq” va “maʼlumotda belgilanmagan” — har xil narsa.
4) Bir nechta variant yoki joy boʻlsa — solishtir va eng yaxshisini tanla, nega ekanini bir gapda ayt.
5) Takliflar: eng arzon va tez bajariladigandan boshlab, har biri aniq joyga (koʻcha, chorraha, belgi raqami) bogʻlangan; bosh rejaga zid taklif berma.
6) Xaritada koʻrsatilgan belgilar (raqamlar, ranglar) boʻlsa — javobda shu raqamlar bilan ayt, foydalanuvchi xaritadan topa olsin.
7) Taxminiy hisob — bir marta qisqa “taxminiy” de; ishonch past boʻlsa sababini ayt (masalan, oʻlchov kam).
8) TUZILMA: avval QISQA javob (3–7 qator: xulosa, eng muhim raqamlar, asosiy taklif). Keyin alohida qatorda faqat **Batafsil** deb yoz va undan keyin qolgan tafsilotlarni ber (u yigʻiq koʻrinadi).
9) Xaritada yechim/bosqichlar raqamlari (①②③④, Y1, T1…) berilgan boʻlsa — javobdagi yechim AYNAN shu bosqichlar boʻlsin (bir xil tartib, bir xil oʻlcham va narx); boshqa yechim oʻylab topma.`;
  let lessons = null, lessonsTs = 0;
  async function loadLessons() {
    if (lessons && Date.now() - lessonsTs < 10 * 60e3) return lessons;
    let items = NX.store.get('ai:fb', []);
    if (proxyUrl()) { try { const r = await NX.fetchJSON(proxyUrl().replace(/\/+$/, '') + '/feedback', {}, 8000); if (r.ok && r.data && Array.isArray(r.data.items)) items = r.data.items.concat(items.filter(x => x.local)); } catch (e) { /* */ } }
    lessons = items.filter(x => !x.ok && (x.note || x.q)).slice(-10); lessonsTs = Date.now();
    return lessons;
  }
  const lessonText = () => (lessons && lessons.length ? '\n\nXODIMLAR OLDINGI JAVOBLARDA KOʻRSATGAN XATOLAR (bularni takrorlama, oʻxshash savolda eʼtibor ber):\n' + lessons.map(x => `- Savol: “${x.q.slice(0, 160)}”${x.note ? ` — izoh: ${x.note.slice(0, 200)}` : ' — javob notoʻgʻri deb baholangan'}`).join('\n').slice(0, 1800) : '');
  async function feedback(f) {
    const it = Object.assign({ ts: Date.now() }, f);
    if (!it.ok) { const L = NX.store.get('ai:fb', []); L.push(Object.assign({ local: true }, it)); NX.store.set('ai:fb', L.slice(-30)); }
    lessonsTs = 0;
    if (!proxyUrl()) return false;
    try { const r = await NX.fetchJSON(proxyUrl().replace(/\/+$/, '') + '/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it) }, 10000); return r.ok; } catch (e) { return false; }
  }
  async function callOpenAI(key, ctx, onModel, history, messages, models, cacheKey) {
    let lastErr = null, down = 0;
    if (!/^(router|imgprompt)$/.test(cacheKey || '')) await loadLessons().catch(() => null);
    // Sozlamalarda tanlangan model (Claude/Gemini — faqat sayt Worker’i orqali) birinchi sinab koʻriladi
    const pref = NX.store.get('ai:pref', ''), base = (models || NX.config.openaiModels).slice();
    if (pref && (!key || /^gpt-/.test(pref)) && (models === NX.config.openaiDeep || /^gpt-/.test(pref))) { const i = base.indexOf(pref); if (i >= 0) base.splice(i, 1); base.unshift(pref); }
    const bad = badModels(), list = base.filter(m => !bad[m]);
    for (const model of (list.length ? list : NX.config.openaiModels)) {
      onModel && onModel(model);
      // Oldingi bitta savol-javob ham beriladi — “u-chi?” kabi davomli savollar tushunilishi uchun
      const prev = (history || []).slice(-2).map(m => ({ role: m.role, content: String(m.content).slice(0, 1200) }));
      const body = { model, messages: messages || [{ role: 'system', content: SYSTEM }].concat(prev, [{ role: 'user', content: 'Savol: ' + ctx.savol + '\n\nSayt maʼlumotlari (JSON):\n' + JSON.stringify(ctx) }]) };
      // Tahlil soʻrovlariga: umumiy qoidalar + oldingi xatolar (yoʻnaltiruvchi/rasm/tekshiruvchiga emas)
      const tech = /^(router|imgprompt|verify)$/.test(cacheKey || '');
      if (!tech && body.messages[0] && body.messages[0].role === 'system') body.messages = [Object.assign({}, body.messages[0], { content: body.messages[0].content + ANALYST + lessonText() })].concat(body.messages.slice(1));
      if (/^gpt-[56]/.test(model)) { body.max_completion_tokens = 4000; body.reasoning_effort = models === NX.config.openaiDeep && cacheKey !== 'verify' ? 'medium' : 'low'; } else if (!/^gpt-/.test(model)) body.max_completion_tokens = 4000; else { body.max_completion_tokens = 900; body.temperature = 0.3; }
      // Prompt caching: oʻzgarmas qism (system) boshida turadi; bir xil turdagi soʻrovlar bitta kalit bilan — takroriy kirish arzonroq
      body.prompt_cache_key = 'cityjam-' + (cacheKey || 'chat');
      if (!key) body.messages = fitMessages(body.messages, BODY_SOFT);
      let r, tries = 0;
      const send = async () => { try {
        r = key
          ? await NX.fetchJSON(NX.config.openaiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) }, body.reasoning_effort === 'medium' ? 120000 : 60000)
          : await NX.fetchJSON(proxyUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, body.reasoning_effort === 'medium' ? 120000 : 60000);
      } catch (e) { throw new Error(e.timeout ? 'AI javob bermadi (vaqt tugadi). Qayta urinib koʻring.' : 'AI serveriga ulanib boʻlmadi. Internet aloqasini tekshiring.'); } };
      await send();
      // Worker eski versiyasi (30 ming belgi): maʼlumot qisqartirilib qayta yuboriladi
      if (!key && (r.status === 413 || (r.data && r.data.error && r.data.error.code === 'too_large'))) { body.messages = fitMessages(body.messages, BODY_OLD); await send(); }
      // Server vaqtincha xatosi (502/503/504) — 1.5 s dan keyin bir marta qayta
      while (r.status >= 500 && r.status !== 501 && tries++ < 1) { await new Promise(res => setTimeout(res, 1500)); await send(); }
      const err = r.data && r.data.error;
      if (r.ok && r.data && r.data.choices && r.data.choices[0]) {
        let text = (r.data.choices[0].message && r.data.choices[0].message.content) || '';
        // Javob uzunlik chegarasida kesilgan — oxirgi chala gap olib tashlanadi va belgi qoʻyiladi
        if (text.trim() && r.data.choices[0].finish_reason === 'length') { const cut = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('. ')); if (cut > text.length * 0.6) text = text.slice(0, cut + 1); text += '\n\n⚠️ Javob qisqartirildi — batafsilroq kerak boʻlsa, savolni aniqroq bering.'; }
        if (text.trim()) return { text, model };
        lastErr = new Error('Model boʻsh javob qaytardi.');
        continue;
      }
      const code = err && (err.code || err.type);
      // Worker’ning oʻzi ishlamayapti (5xx, xato kodi yoʻq) — boshqa modellarni sinab vaqt yoʻqotilmaydi: 2 marta shunday boʻlsa — zaxira javob
      if (!key && r.status >= 500 && !code && ++down >= 2) { lastErr = new Error('AI xizmati vaqtincha javob bermadi'); break; }
      if (code === 'provider_off' || code === 'provider_error') { if (code === 'provider_off') markBad(model); lastErr = new Error(`“${model}” ishlamadi.`); continue; }
      if (code === 'proxy_rate_limit') throw new Error('Bir soatda juda koʻp savol berildi. Birozdan keyin qayta urinib koʻring.');
      if (code === 'forbidden_origin' || code === 'no_server_key') throw new Error('AI xizmati hozircha sozlanmagan.');
      if (r.status === 401 && !key) throw new Error('AI xizmati hozircha ishlamayapti (server kaliti notoʻgʻri).');
      if (r.status === 401) throw new Error('OpenAI kaliti notoʻgʻri yoki bekor qilingan. Sozlamalarda kalitni tekshiring.');
      if (code === 'insufficient_quota') throw new Error('OpenAI hisobingizda kredit qolmagan (insufficient_quota). Balansni toʻldiring.');
      if (r.status === 429) throw new Error('OpenAI soʻrovlar limiti oshdi. Birozdan keyin qayta urinib koʻring.');
      if (r.status === 404 || code === 'model_not_found' || (r.status === 400 && /model/i.test((err && err.message) || ''))) { markBad(model); lastErr = new Error(`“${model}” modeli mavjud emas.`); continue; }
      if (r.status === 400 && /reasoning_effort|max_completion_tokens|temperature/.test((err && err.message) || '')) { lastErr = new Error('Parametr mos kelmadi'); continue; }
      lastErr = new Error(r.status >= 500 ? 'AI xizmati vaqtincha javob bermadi' : r.status === 413 ? 'Soʻrov juda katta' : 'AI xatosi: ' + ((err && err.message) || 'HTTP ' + r.status));
    }
    throw lastErr || new Error('Mos OpenAI modeli topilmadi.');
  }

  // Kalitsiz yoki AI ishlamaganda: faqat hisoblangan raqamlardan tuzilgan javob
  // AI ishlamaganda: saytning oʻz maʼlumotlaridan qisqa, savolga mos maʼlumot (AI deb koʻrsatilmaydi)
  function localAnswer(q, ctx) {
    const n = norm(q), out = [];
    const w = ctx.ob_havo, sim = ctx.simulyatsiya, s = ctx.koʻcha;
    if (sim) {
      out.push(`**${sim.xulosa}** — ${sim.stsenariy}.`);
      out.push(`Yoʻlda yuradigan umumiy vaqt: ${NX.fmt.signed(sim.umumiy_yol_vaqti_ozgarishi_foiz, 1)}% (taxmin).`);
      const up = sim.eng_kop_taʼsirlangan_koʻchalar.filter(r => r.hajm_keyin > r.hajm_oldin).slice(0, 3).map(r => r.koʻcha);
      if (up.length) out.push(`Koʻproq yuklanadi: ${up.join(', ')}.`);
      if (sim.yonalishi_ozgarishi_kerak_liniyalar.length) out.push(`Avtobuslar: ${sim.yonalishi_ozgarishi_kerak_liniyalar.join(', ')} yoʻnalishini oʻzgartiradi.`);
      return out.join('\n');
    }
    if (/ob ?havo|harorat|yomg|qor|shamol|issiq|sovuq/.test(n) && w) return `Hozir ${w.harorat_c}°C, ${w.holat}. ${w.yolga_tasiri}`;
    if (/hodisa|avariya|tamir|yopiq/.test(n)) {
      const h = ctx.yol_hodisalari;
      if (!h) return 'Yoʻl hodisalari haqida maʼlumot yoʻq (TomTom ulanmagan).';
      return h.length ? h.slice(0, 5).map(x => `- ${x.turi}: ${x.joy || 'hudud ichida'}${x.kechikish_daqiqa ? `, +${x.kechikish_daqiqa} daqiqa` : ''}`).join('\n') : 'Hozir hududda avariya, taʼmir yoki yopiq yoʻl qayd etilmagan.';
    }
    // Saytda maʼlumoti yoʻq infratuzilma mavzulari — halol javob (oldingi koʻcha haqida emas)
    if (/kanaliz|ichimlik|suv\s*(tarmog|quvur|taʼminot|ta.?minot)|elektr|gaz\s*(tarmog|quvur)|issiqlik\s*(tarmog|taʼminot)|chiroq|yoritish|havo\s*(iflos|sifat)|chang|shovqin|chiqindi|axlat/.test(n)) {
      const sys = ctx.shahar_tizimlari, loaded = sys && Array.isArray(sys) ? sys.filter(x => x.yuklangan || x.loaded) : [];
      return `Bu mavzu boʻyicha saytda hali real maʼlumot yoʻq: ${/kanaliz/.test(n) ? 'kanalizatsiya tarmogʻi' : /ichimlik|suv/.test(n) ? 'suv taʼminoti tarmogʻi' : /elektr/.test(n) ? 'elektr tarmogʻi' : /gaz/.test(n) ? 'gaz tarmogʻi' : /chiroq|yoritish/.test(n) ? 'koʻcha yoritish' : /chiqindi|axlat/.test(n) ? 'chiqindi tashish' : 'havo sifati va shovqin oʻlchovlari'} xaritasi ulanmagan${loaded.length ? '' : ''}.\n\n**Nima qilish mumkin:** “Tizimlar” boʻlimiga tegishli xizmatdan olingan GeoJSON/KML/CSV faylni yuklang — shundan keyin AI shu tarmoq boʻyicha xaritada tahlil qiladi (eski quvurlar, qamrov, muammoli joylar).`;
    }
    if (s && !/qaysi\s*(kocha|yol)lar|eng\s*(xavfli|yomon|muammoli|katta)|shahar\s*boyicha/.test(n) && (/shu|bu|ushbu|koʻcha|ko'cha|kocha|yoʻl|yo'l|yol/.test(n) || (NX.state && NX.state.model && detectStreets(q, NX.state.model).length))) {
      const t = s.tomtom && s.tomtom.tirbandlik_foiz != null ? `Hozir: ${s.tomtom.joriy_tezlik_kmh} km/soat (odatda ${s.tomtom.erkin_tezlik_kmh}).` : 'Hozirgi tirbandligi oʻlchanmagan.';
      return `${s.nomi}: ${s.harakat}, ${NX.fmt.km(s.uzunlik_m)}. Avtobuslar: ${s.avtobus_liniyalari.length ? s.avtobus_liniyalari.join(', ') : 'yoʻq'}. ${t}`;
    }
    if (/tirband|tiqilin|probka/.test(n)) {
      const t = ctx.hozirgi_tirbandlik;
      return t && t.length ? t.slice(0, 5).map(x => `- ${x.koʻcha}: ${x.tezlik_kmh} km/soat (odatda ${x.odatdagi_kmh})`).join('\n') : 'Hozircha oʻlchangan koʻcha yoʻq. Xaritadagi ranglar — real tirbandlik; koʻchani bossangiz, uning tezligi oʻlchanadi.';
    }
    // Savolda koʻcha nomi bor, lekin xaritada topilmadi — buni ochiq aytish (boshqa koʻcha haqida gapirmaslik)
    const askedSt = (String(q).match(/([A-Za-zʻ'‘’`ʼА-Яа-яЁёЎўҚқҒғҲҳ-]{3,}(?:\s+[A-Za-zʻ'‘’`ʼА-Яа-яЁёЎўҚқҒғҲҳ-]{3,})?)\s+(?:ko[ʻ'‘’`ʼ]?cha|kucha|улиц)/i) || [])[1];
    if (askedSt && !/^(bu|shu|ushbu|qaysi|eng|har|bir|katta|tor|asosiy)$/i.test(askedSt.split(/\s+/).pop()) && NX.state && NX.state.model && !detectStreets(q, NX.state.model).length) return `**“${askedSt} koʻchasi” xaritadagi maʼlumotda topilmadi** (shahar markazi modeli: ${NX.state.model.namedStreets.length} ta nomli koʻcha). OSM’da nomi boshqacha yozilgan boʻlishi mumkin (masalan, ruscha) — koʻchani xaritada bosing yoki qidiruvda nomini yozib tanlang, keyin savolni qayta bering.`;
    // Umumiy savol (“eng katta muammo”, “qaysi koʻchalar xavfli”) — saytning oʻz hisobidan qisqa sharh
    const M0 = NX.state && NX.state.model;
    if (M0 && (/muammo|xavfli|eng yomon|eng katta|asosiy|holat|ahvol|qanday|nima qilish/.test(n) || true)) {
      const out2 = [];
      const groups = (ctx.muammolar || []).slice().sort((a, b) => b.soni - a.soni);
      const risky = M0.namedStreets.slice().sort((a, b) => b.risk.value - a.risk.value).slice(0, 5);
      if (groups.length) out2.push('**Shahar markazidagi asosiy muammolar** (ochiq xarita + hisob):', ...groups.slice(0, 5).map(g => `- **${g.turi}** — ${g.soni} ta joy${g.misollar && g.misollar.length ? ` (masalan: ${g.misollar.slice(0, 2).join('; ')})` : ''}. Yechim: ${g.yechim}`));
      if (risky.length) out2.push('', '**Xavf boʻyicha eng muammoli koʻchalar:** ' + risky.map(x => `${x.name} (${Math.round(x.risk.value)} ball)`).join(', ') + '.');
      const u = ctx.umumiy;
      if (u) out2.push('', `Umumiy: ${u.liniyalar_soni} ta avtobus liniyasi, bekatlar 400 m qamrovi ${u.bekat_400m_qamrovi_foiz != null ? u.bekat_400m_qamrovi_foiz + '%' : '—'}, svetoforsiz katta chorrahalar — ${u.svetoforsiz_katta_chorrahalar}.`);
      out2.push('', 'Aniqroq tahlil uchun: koʻcha nomi bilan soʻrang (“Rudakiy koʻchasida tirbandlikni qanday kamaytiramiz?”), xaritada hudud belgilang yoki “Muammolar” boʻlimini oching.');
      if (out2.length > 2) return out2.join('\n');
    }
    return 'Bu savolga AI’siz javob bera olmayman. Koʻcha nomi bilan “yopsak nima boʻladi?”, “bir tomonlama qilsak?” kabi savol bering yoki koʻchani xaritada bosing.';
  }

  // AI ga beriladigan umumiy kontekst: hozirgi real holat + xarita tahlili (ixcham)
  function cityFacts(M, S) {
    const W = S && S.weather && S.weather.data, inc = S && S.incidents;
    const fresh = M.streets.filter(s => s.tomtom && Date.now() - s.tomtom.ts < 3600e3).sort((a, b) => b.tomtom.congestion - a.tomtom.congestion);
    const groups = {};
    M.problems.forEach(p => { (groups[p.type] = groups[p.type] || []).push(p.title); });
    const lines = new Map();
    M.routes.forEach(r => { if (!lines.has(r.label)) lines.set(r.label, { raqam: r.label, turi: r.modeUz, qayerdan: r.from, qayerga: r.to, koʻchalar: r.streets.map(i => M.streets[i].name).filter(Boolean).slice(0, 6) }); });
    return {
      vaqt: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand' }),
      ob_havo: W ? { harorat_c: Math.round(W.temp), holat: NX.weather.codeText(W.code)[0], shamol_kmh: Math.round(W.wind), yogin_mm: W.precip, yolga_tasiri: NX.weather.roadAdvice(W).join(' '), manba: 'Open-Meteo (real)' } : null,
      yol_hodisalari: inc && inc.list ? inc.list.slice(0, 8).map(x => ({ turi: x.name, joy: [x.from, x.to].filter(Boolean).join(' → '), kechikish_daqiqa: x.delay ? Math.round(x.delay / 60) : null, manba: 'TomTom (real)' })) : null,
      real_vaqt_xaritasi: 'Yandex probkalar (faqat rang; koʻchalar boʻyicha raqam yoʻq)',
      hozirgi_tirbandlik: fresh.slice(0, 10).map(s => ({ koʻcha: s.name || 'nomsiz', tezlik_kmh: Math.round(s.tomtom.currentSpeed), odatdagi_kmh: Math.round(s.tomtom.freeFlowSpeed), tirbandlik_foiz: Math.round(s.tomtom.congestion), manba: 'TomTom (real)' })),
      muammolar: Object.keys(groups).map(t => ({ turi: NX.PROBLEM[t].short, soni: groups[t].length, misollar: groups[t].slice(0, 3), yechim: NX.PROBLEM[t].fix })),
      avtobus_liniyalari: [...lines.values()].slice(0, 25),
      umumiy: { liniyalar_soni: M.kpi.lines, bekat_400m_qamrovi_foiz: M.kpi.coverage != null ? Math.round(M.kpi.coverage) : null, svetoforsiz_katta_chorrahalar: M.kpi.unsignalised, maktab_bogcha: M.kpi.schools },
      shahar_tizimlari: systemsFacts(),
    };
  }
  // Ulangan va ulanmagan shahar tizimlari (kameralar, elektr, gaz, suv, kanalizatsiya)
  function systemsFacts(area) {
    const out = { transport: 'ulangan (Yandex real vaqt, OSM, Mapillary)', ochiq_vebkameralar_windy: NX.webcams.get() ? NX.webcams.get().length + ' ta' : 'yuklanmagan' };
    NX.systems.KEYS.forEach(k => {
      const d = NX.systems.get(k), T = NX.SYSTEMS[k];
      if (!d) { out[T.uz] = 'ulanmagan — maʼlumot yoʻq'; return; }
      const a = area && area.systems && area.systems.find(x => x.sys === k);
      out[T.uz] = Object.assign({ xarita: d.name, obyektlar: d.stats.features, liniyalar_km: +d.stats.km.toFixed(1), real_vaqt: 'ulanmagan (faqat xarita)' },
        a ? { hududda_obyekt: a.points, hududda_liniya_km: +a.km.toFixed(2), markazdan_eng_yaqin_m: isFinite(a.nearest) ? Math.round(a.nearest) : null } : {});
    });
    return out;
  }

  async function ask(q, M, opts) {
    const found = detectStreets(q, M);
    const scen = detectScenario(q);
    // Savolda koʻcha nomi boʻlmasa — panelda tanlangan koʻcha olinadi
    const street = found.length ? found[0].s : opts.defaultStreet || null;
    let sim = null;
    if (street && scen) sim = await opts.simulate(street, scen);
    const ctx = Object.assign({
      savol: q, hudud: 'Samarqand tarixiy markazi',
      koʻcha: street ? Object.assign(streetFacts(street, M), segFacts(opts.segment, street, M)) : null,
      ikkinchi_koʻcha: found[1] ? streetFacts(found[1].s, M) : null,
      simulyatsiya: simFacts(sim, M),
    }, cityFacts(M, opts.state));
    // Proksi limiti (30 000 belgi) dan oshmasligi uchun kam muhim qismlar qisqartiriladi
    if (JSON.stringify(ctx).length > 20000) ctx.avtobus_liniyalari = ctx.avtobus_liniyalari.map(l => ({ raqam: l.raqam, qayerdan: l.qayerdan, qayerga: l.qayerga }));
    if (JSON.stringify(ctx).length > 20000) ctx.muammolar = ctx.muammolar.map(m => ({ turi: m.turi, soni: m.soni }));
    const key = userKey();
    const meta = { street, scen, sim, found };
    if (!aiAvailable()) return Object.assign({ text: localAnswer(q, ctx), src: 'hisob', error: 'AI ulanmagan.' }, meta);
    try {
      const r = await callOpenAI(key, ctx, opts.onModel, opts.history || []);
      return Object.assign(await verify(q, ctx, { text: r.text, src: 'ai', model: r.model }), meta);
    } catch (e) {
      return Object.assign({ text: localAnswer(q, ctx), src: 'hisob', error: e.message }, meta);
    }
  }

  // **qalin** va qatorlarni xavfsiz HTML ga aylantirish
  // Javob: qisqa qism koʻrinadi, qolgani “Batafsil” ostida (AI “**Batafsil**” qatorini yozadi; yozmasa — uzun javob avtomatik boʻlinadi)
  function render(text, opt) {
    const fmt = t => NX.esc(t).replace(/^\s*#{1,4}\s*(.+)$/gm, '**$1**').replace(/^\s*[-*] /gm, '• ').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    const t = String(text || '');
    if (opt && opt.full) return fmt(t);
    const m = t.match(/^\s*(?:#{1,4}\s*)?\**\s*Batafsil(?:roq)?\s*\**\s*:?\s*\**\s*$/im);
    let head = t, rest = '';
    if (m) { head = t.slice(0, m.index); rest = t.slice(m.index + m[0].length); }
    else if (t.length > 1100) {
      const ps = t.split(/\n{2,}/); let n = 0, k = 0;
      while (k < ps.length && (k < 2 || n < 500)) { n += ps[k].length; k++; }
      if (k < ps.length - 1) { head = ps.slice(0, k).join('\n\n'); rest = ps.slice(k).join('\n\n'); }
    }
    return rest.trim() ? fmt(head.trim()) + `<details class="ai-more"><summary>Batafsil</summary>${fmt(rest.trim())}</details>` : fmt(t);
  }

  // ---------- Muammoni real surat bilan tekshirish ----------
  // Worker yangi versiyadami (surat, qidiruv, rasm)? Eski Worker /version ga javob bermaydi.
  let proxyV = null;
  async function proxyReady() {
    if (userKey()) return true;
    if (!proxyUrl()) return false;
    if (proxyV == null) {
      try { const r = await NX.fetchJSON(proxyUrl() + '/version', {}, 10000); proxyV = r.ok && r.data && r.data.v >= 2 ? r.data.v : 0; } catch (e) { proxyV = null; return false; }
    }
    return proxyV >= 2;
  }
  const OLD_WORKER = 'AI tekshiruvi ishlamayapti: Cloudflare’dagi Worker kodi eski — yangisini qoʻyish kerak (worker/ai-proxy.js).';

  function problemFacts(p, M, chk, extra) {
    const meta = NX.PROBLEM[p.type], s = p.street != null ? M.streets[p.street] : null, X = extra || {};
    const st = sid => { const q = M.streets[sid]; return q ? { nomi: q.name || 'nomsiz yoʻl', turi: NX.HW[q.hw].uz, polosalar_osm: q.lanes || null, harakat: q.oneway === 'yes' ? 'bir tomonlama' : 'ikki tomonlama', avtobuslar: q.busRefs, tezlik_chegarasi: q.maxspeed || null } : null; };
    return {
      chorraha: p.streets ? {
        shakli: p.kind === 'T' ? 'T-shaklida (bir koʻcha ikkinchisiga ulanadi, 3 tarmoq)' : p.kind === 'X' ? `${p.legs} tarmoqli (kesishma)` : 'boshqa',
        asosiy_koʻcha: st(p.major), ulanadigan_koʻcha: st(p.minor),
        oqim_hisob_mashina_soat: X.flows ? X.flows.map(f => ({ koʻcha: f.name, oqim: f.flow })) : null,
        sayt_tavsiyasi: p.type === 'priority' ? 'ustuvorlik belgilari (svetofor emas)' : 'svetofor nomzodi — avval sanoq',
      } : null,
      muammo: meta.short, joy: p.title, tavsif: meta.what, taklif_yechim: meta.fix, tafsilot: p.detail || null,
      koʻcha: s ? { nomi: s.name, turi: NX.HW[s.hw].uz, polosalar_osm: s.lanes || null, harakat: s.oneway === 'yes' ? 'bir tomonlama' : 'ikki tomonlama', avtobus_liniyalari: s.busRefs } : null,
      mapillary: chk ? { xulosa: chk.text, svetoforlar_topildi: chk.signals, piyoda_otish_topildi: chk.crossings, surat_sanasi: chk.photo && chk.photo.when, surat_masofa_m: chk.photo && chk.photo.d } : null,
    };
  }
  const VISION = `Sen Samarqand hokimiyati uchun yoʻl harakatini tashkil etish muhandisisan. Senga shu joyning real koʻcha suratlari (Mapillary, turli tomonlardan) va xarita maʼlumoti (chorraha shakli, koʻchalar turi, polosalar, oqim hisobi) beriladi.
Oʻzbek tilida (lotin), londa yoz. Faqat suratda KOʻRINGAN narsani “suratda” deb yoz; koʻrinmasa — “suratda koʻrinmayapti” de.
Muhandislik qoidalari:
- Svetofor — faqat ikki katta koʻcha (2-darajali va yuqori) kesishib, ikkala yoʻnalishda ham oqim katta boʻlsa (asosiy ~600+, ulanadigan ~150–200+ mashina/soat).
- Kichik koʻcha katta koʻchaga ulansa (ayniqsa T-shaklida) — svetofor emas: asosiy koʻchaga “Asosiy yoʻl” (2.1), ulanadigan koʻchaga “Yoʻl bering” (2.4), koʻrinish yomon boʻlsa “STOP” (2.5) va toʻxtash chizigʻi. Qaysi koʻchaga qaysi belgi — nomi bilan ayt.
- Turar-joy ichki yoʻllarida svetofor tavsiya qilma.
- Suratdagi holat xarita maʼlumotiga mos kelmasa (masalan, xaritada chorraha, suratda oddiy yoʻl) — buni aniq ayt.
Tuzilma (har biri 1–2 qator):
**Joy:** chorraha shakli va koʻchalar (asosiy / ulanadigan), suratda koʻringani
**Hozir:** svetofor, belgilar, zebra, polosalar, yoʻl holati, harakat (surat olingan paytda)
**Xulosa:** muammo bormi va qanchalik jiddiy
**Yechim:** aniq — qaysi koʻchaga qanday belgi / chiziq / svetofor, nechta, qayerga (masalan: “Universitet bulvari chiqishida 2.4 va toʻxtash chizigʻi”)
**Svetofor kerakmi:** ha / yoʻq va bir gapda nega
Oxirida: “Surat ${'$'}{sana} da olingan — hozirgi holat farq qilishi mumkin.”`;

  // views — 4 tomondan suratlar (boʻlmasa — eng yaqin surat)
  async function vision(p, M, chk, views, extra) {
    const list = views && views.length ? views : chk && chk.photo ? [Object.assign({ side: '' }, chk.photo)] : [];
    if (!list.length) throw new Error('Bu joyda surat yoʻq.');
    if (!(await proxyReady())) throw new Error(OLD_WORKER);
    const n = proxyV >= 4 || userKey() ? 4 : 2;
    const facts = Object.assign(problemFacts(p, M, chk, extra), { suratlar: list.slice(0, n).map((x, i) => `${i + 1}-surat: ${x.side || 'yaqin'} (${x.d} m, ${x.when})`) });
    const messages = [{ role: 'system', content: VISION.replace('${sana}', list[0].when || 'nomaʼlum sana') + '\nBir nechta surat boʻlsa — ular bitta joyning turli tomonlari; hammasiga qarab xulosa qil.' },
      { role: 'user', content: [{ type: 'text', text: 'Joy haqida maʼlumot (JSON):\n' + JSON.stringify(facts) }].concat(list.slice(0, n).map(x => ({ type: 'image_url', image_url: { url: x.url, detail: 'low' } }))) }];
    const r = await callOpenAI(userKey(), null, null, null, messages);
    return r.text;
  }

  // Ochiq vebkamera kadri: hozirgi holat
  const CAM = `Senga shahar vebkamerasidan olingan HOZIRGI kadr beriladi (Samarqand yoki uning atrofi). Oʻzbek tilida (lotin), 3–5 qisqa qatorda, faqat KOʻRINGAN narsani yoz:
**Harakat:** mashinalar kam / oʻrtacha / koʻp; tirbandlik bormi
**Ob-havo va yoʻl:** quruq / hoʻl / qor / suv toʻplangan; koʻrinish
**Odamlar:** kam / oʻrtacha / gavjum
**Favqulodda:** avariya, yongʻin, suv bosishi, yoʻl yopilgan — koʻrinsa ayt, boʻlmasa “koʻrinmayapti”
Agar kadrda shahar koʻchasi koʻrinmasa (masalan, togʻ manzarasi) — shuni ayt.`;
  async function webcamCheck(cam) {
    if (!(await proxyReady())) throw new Error(OLD_WORKER);
    const messages = [{ role: 'system', content: CAM }, { role: 'user', content: [{ type: 'text', text: `Kamera: ${cam.title}${cam.city ? ', ' + cam.city : ''}. Vaqt: ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand' })}.` }, { type: 'image_url', image_url: { url: cam.preview, detail: 'low' } }] }];
    const r = await callOpenAI(userKey(), null, null, null, messages, NX.config.openaiLight, 'webcam');
    return r.text;
  }

  // Tezkor koʻrik: suratda svetofor / piyoda oʻtish bormi (qisqa JSON javob)
  const PHOTO_CHECK = `Senga chorraha yoki maktab yonidagi real koʻcha surati (1–2 ta, Mapillary) beriladi.
Faqat JSON qaytar, boshqa hech narsa yozma: {"svetofor":"bor|yoq|noaniq","piyoda_otish":"bor|yoq|noaniq","izoh":"oʻzbekcha 1 qisqa gap"}
“bor” — faqat suratda aniq koʻrinsa (svetofor chirogʻi yoki ustuni; oq-qora zebra chiziqlari). Koʻrinmasa yoki surat boshqa tomonga qaragan boʻlsa — “noaniq”.
“yoq” — chorraha/yoʻl aniq koʻrinib turibdi, lekin svetofor (yoki zebra) yoʻq.`;
  // Worker v3: natijalar umumiy (har bir joy bir marta tekshiriladi, hamma koʻradi)
  const sharedChecks = async () => proxyUrl() && (await proxyReady()) && proxyV >= 3;
  async function photoChecksAll() {
    if (!(await sharedChecks())) return null;
    const r = await NX.fetchJSON(proxyUrl() + '/photo-checks', {}, 15000);
    return r.ok && r.data ? r.data.items || {} : null;
  }
  async function photoCheck(p, chk) {
    if (!(chk && chk.photo)) throw new Error('Surat yoʻq.');
    if (await sharedChecks()) {
      const r = await NX.fetchJSON(proxyUrl() + '/photo-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: p.key, title: p.title, photoId: chk.photo.id, photos: [chk.photo, chk.photo2].filter(Boolean).map(x => x.url) }) }, 60000);
      if (r.ok && r.data && r.data.signal) return r.data;
      const e = r.data && r.data.error;
      throw new Error(r.status === 429 ? 'AI tekshiruv limiti tugadi (keyinroq davom etadi).' : 'AI tekshiruvi: ' + ((e && e.message) || 'HTTP ' + r.status));
    }
    if (!(await proxyReady())) throw new Error(OLD_WORKER);
    const imgs = [chk.photo, chk.photo2].filter(Boolean).map(x => ({ type: 'image_url', image_url: { url: x.url, detail: 'low' } }));
    const messages = [{ role: 'system', content: PHOTO_CHECK }, { role: 'user', content: [{ type: 'text', text: `Joy: ${p.title}. Muammo: ${NX.PROBLEM[p.type].short}.` }].concat(imgs) }];
    const r = await callOpenAI(userKey(), null, null, null, messages, NX.config.openaiLight, 'photo');
    const m = r.text.match(/\{[\s\S]*\}/);
    let j = null;
    try { j = m && JSON.parse(m[0]); } catch (e) { j = null; }
    if (!j) throw new Error('AI javobi tushunarsiz.');
    const v = x => (/^bor/i.test(x || '') ? 'bor' : /^yo/i.test(x || '') ? 'yoq' : 'noaniq');
    return { signal: v(j.svetofor), crossing: v(j.piyoda_otish), note: String(j.izoh || '').slice(0, 200) };
  }

  async function webSearch(p, M, chk) {
    if (!(await proxyReady())) throw new Error(OLD_WORKER);
    const meta = NX.PROBLEM[p.type];
    const q = `Samarqand: ${p.title} — “${meta.short}”. Ochiq manbalarda bu joy haqida nima bor: svetofor yoki piyoda oʻtish joyi oʻrnatish rejalari, taʼmir ishlari, yoʻl-transport hodisalari, hokimiyat qarorlari, aholining shikoyatlari? Oxirgi 3 yil.`;
    const ctx = JSON.stringify(problemFacts(p, M, chk));
    const key = userKey();
    let r;
    if (key) {
      const body = { model: 'gpt-6-luna', instructions: 'Oʻzbek tilida (lotin), qisqa yoz. Faqat manbada bor narsani yoz; topilmasa “Ochiq manbalarda topilmadi” de.', input: q + '\n\n' + ctx, tools: [{ type: 'web_search' }], reasoning: { effort: 'low' } };
      r = await NX.fetchJSON('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) }, 90000);
      if (r.ok && r.data) {
        let text = ''; const sources = [];
        (r.data.output || []).forEach(o => (o.content || []).forEach(c => { if (c.type === 'output_text') { text += c.text; (c.annotations || []).forEach(a => a.url && !sources.some(x => x.url === a.url) && sources.push({ url: a.url, title: a.title || a.url })); } }));
        return { text, sources };
      }
    } else {
      r = await NX.fetchJSON(proxyUrl() + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, context: ctx }) }, 90000);
      if (r.ok && r.data) return { text: r.data.text || '', sources: r.data.sources || [] };
    }
    const e = r.data && r.data.error;
    throw new Error(r.status === 429 ? 'Qidiruv limiti tugadi, keyinroq urinib koʻring.' : 'Qidiruv ishlamadi: ' + ((e && e.message) || 'HTTP ' + r.status));
  }

  // Yechimning AI rasmi (rasm modeli uchun inglizcha tavsif)
  const IMG = {
    junction: 'Add a modern traffic light (signal heads on poles at the corners) and white zebra pedestrian crossings at this intersection.',
    school: 'Add a raised zebra pedestrian crossing with yellow-green "children" warning signs and a 30 km/h speed limit sign in front of the school entrance.',
    crossings: 'Add clearly marked white zebra pedestrian crossings with pedestrian crossing signs along this street.',
    congestion: 'Add a dedicated red-painted bus lane, no-parking signs along the curb and smoothly flowing traffic.',
    coverage: 'Add a modern covered bus stop shelter with a bench, a bus stop sign and a small bus pull-in bay.',
    spacing: 'Add a modern covered bus stop shelter with a bench and a bus stop sign at the curb.',
  };
  // Real surat ustiga aniq, kichik oʻzgarish (svetofor ustuni, zebra) — qolgan hamma narsa oʻzgarmaydi
  const EDIT = {
    priority: 'Add ONE standard "Yield / Give way" traffic sign (white inverted triangle with a thick red border, about 70 cm, on a grey steel pole 2.2 m high) at the right edge of the side road where it joins the main road, facing drivers on the side road, plus a white dashed give-way line across the side road. On the main road add a "Priority road" sign (yellow diamond with white border) on a pole. Correct perspective and real-world scale.',
    junction: 'Add ONE standard vehicle traffic signal (three-section red-yellow-green head, black housing) on a grey steel pole about 3 m high at the near corner of the intersection on the right side of the road, facing oncoming traffic, with correct perspective and real-world scale. Paint white zebra crossing stripes across the road at the intersection entrance and a solid white stop line 2 m before it.',
    school: 'Paint a white zebra pedestrian crossing across the road in front of the school entrance on a slightly raised speed table (yellow edge markings), add a blue square "pedestrian crossing" sign on each side and a round "30" speed limit sign, with correct perspective and real-world scale.',
    crossings: 'Paint a white zebra pedestrian crossing across the road with a blue square "pedestrian crossing" sign on each side, correct perspective and scale.',
  };
  // mode: 'photo' — eng yaxshi real suratga chizish; 'top' — reja (OSM) + 4 surat asosida tepadan koʻrinish
  async function solutionImage(p, chk, opt) {
    opt = opt || {};
    if (userKey() && !proxyUrl()) throw new Error('AI rasm faqat sayt serveri (Worker) orqali ishlaydi.');
    if (!(await proxyReady())) throw new Error(OLD_WORKER);
    const views = (opt.views || []).slice(0, proxyV >= 4 ? 4 : 1);
    const best = views[0] || (chk && chk.photo) || null;
    let body;
    if (opt.mode === 'top' && opt.sat) {
      if (proxyV < 4) throw new Error(OLD_WORKER);
      const what = p.type === 'priority' ? 'a "Yield" sign at each red triangle, a "Priority road" sign at each yellow diamond and a white give-way line where shown — NO traffic lights'
        : p.type === 'school' ? 'a raised zebra crossing (yellow edges) where the white stripes are, with signs' : 'a traffic signal pole at every red/yellow light marker, white stop lines and zebra crossings where drawn';
      body = {
        plan: opt.sat, quality: 'medium',
        prompt: `Image 1 is a REAL satellite photo (top-down, north up) of this exact place in Samarkand, Uzbekistan, with the proposed changes drawn on it as simple symbols.
Produce the SAME satellite image, photorealistic, with the proposed changes actually built: ${what}.
Keep EVERYTHING else exactly as in the photo: the same roads and their shape (do not add or remove roads or turn a T-junction into a crossroads), buildings, roofs, trees, cars, shadows, colours and scale. Remove the drawn symbols and the caption; show the real objects instead. No text, no labels.`,
      };
    } else if (opt.mode === 'top') {
      if (proxyV < 4) throw new Error(OLD_WORKER);
      const what = p.type === 'school' ? 'a raised zebra crossing (yellow edges) in front of the school, "children" signs and 30 km/h signs' : p.type === 'priority' ? '"Yield" signs and give-way lines on the side road, a "Priority road" sign on the main road — no traffic lights' : 'a traffic signal at every red marker, a solid white stop line and a white zebra crossing on every approach';
      body = {
        plan: opt.plan, photos: views.map(x => x.url), quality: 'medium',
        prompt: `Create a photorealistic aerial top-down view (satellite style, camera straight down, north up) of THIS real place in Samarkand, Uzbekistan.
Image 1 is an exact to-scale plan of the real roads from OpenStreetMap: dark grey = asphalt, light grey = curbs, red markers = proposed traffic signals, white stripes = proposed zebra crossings, purple square "M" = school.
${views.length ? `Images 2–${views.length + 1} are real street photos of the same place from different sides — use them for road surface, curbs, trees, building roofs and colours.` : ''}
Keep the road geometry, widths and directions EXACTLY as in the plan. Show the proposed solution: ${what}. Realistic small cars on the roads. No text, no labels, no arrows, no markers in the final image.`,
      };
    } else {
      const what = EDIT[p.type] || IMG[p.type] || 'Show the proposed road safety improvement.';
      body = best
        ? { photo: best.url, prompt: `Photorealistic edit of this exact real photo from Samarkand, Uzbekistan. ${what} Do NOT change anything else: same camera position, road layout, buildings, trees, sky, light and weather. No text, no people added, no extra cars.` }
        : { prompt: `Photorealistic street-level view of a street in the historic center of Samarkand, Uzbekistan (low buildings, plane trees). ${IMG[p.type] || ''}` };
    }
    const r = await NX.fetchJSON(proxyUrl() + '/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 240000);
    if (r.ok && r.data && r.data.b64) return { src: 'data:image/png;base64,' + r.data.b64, edited: !!r.data.edited, mode: opt.mode || 'photo' };
    const e = r.data && r.data.error;
    throw new Error(r.status === 429 ? ((e && e.message) || 'Rasm limiti tugadi.') : 'Rasm chizilmadi: ' + ((e && e.message) || 'HTTP ' + r.status));
  }

  // ---------- Belgilangan hudud (mahalla) va qurilish ----------
  // Tavsiyani xaritada koʻrsatish: faqat berilgan REAL nomzod joylar (id) dan
  const MAPRULE = `- Yechim taklif qilganda eng oddiy, arzon va yaqin variantdan boshla (mavjud inshootni tozalash/ulash, belgi, tashkiliy chora), keyin kerak boʻlsa qimmatrogʻini; har taklifni masofa/oʻlcham va (berilgan boʻlsa) narx bilan asosla. Butun shahar boʻyicha takrorlab boʻlmaydigan ulkan yoki uzoq inshootni oddiyroq yoʻl bor joyda tavsiya qilma.
- Ochiq xaritada (OSM) belgilanmagan narsa (zebra, svetofor, maktab, ariq) haqiqatda boʻlishi mumkin: “yoʻq” dema — “ochiq maʼlumotda belgilanmagan” de. Mavjud svetofor, zebra yoki chorraha yonida yangi oʻtish joyi, svetofor yoki bekat taklif qilma.
- “nomzod_joylar” berilgan boʻlsa — javobni ALBATTA xaritadagi belgilar bilan bogʻla. Agar tavsiyangizda joy boʻlsa (bogʻcha/maktab qurish, yangi yoʻl ochish, svetofor/belgi qoʻyish, bekat), javobda joyni nomzod raqami bilan ayt (masalan “1-belgi: L2 — 3 200 m² boʻsh yer”) va javob OXIRIDA quyidagi blokni qoʻsh (faqat berilgan id lardan, 1–6 ta):
\`\`\`json
{"belgilar":[{"id":"L2","nima":"Bogʻcha","izoh":"qisqa sabab"},{"id":"C1","nima":"Yangi yoʻl","izoh":"…"}]}
\`\`\`
  L — boʻsh/qurilish yerlari, C — berk koʻchani ulash (yangi yoʻl), P — muammo nuqtalari, S — koʻchalar. Nomzodda yoʻq joyni oʻylab topma.`;
  const AREA = `Sen Samarqand hokimiyati uchun shaharsozlik va transport tahlilchisisan. Senga xaritada belgilangan hudud haqida maʼlumot beriladi:
“hudud_osm” — OpenStreetMap (real), “hozirgi_harakat_yandex” — Yandex’ning hozirgi tirbandlik bilan yoʻl vaqtlari (real, hozir),
“qurilish_hisobi” va “harakat_hisobi” — rejalashtirilgan bino uchun harakat modeli hisobi (bino hali yoʻq, shuning uchun bu oʻlchov emas, hisob).
Qoidalar:
- Oʻzbek tilida (lotin), sodda va qisqa yoz. Savolga aniq javob ber. “Taxmin” soʻzini takrorlama; faqat bir marta qisqa ayt: hisob modelga asoslangan.
- Faqat JSON’dagi raqam va nomlardan foydalan; yoʻq narsani oʻylab topma. Avval real holatni ayt (OSM va Yandex), keyin hisob natijasini.
- Foydalanuvchi xonadon yoki qavat sonini aytmagan boʻlsa — hisobda qaysi raqam olinganini ayt.
- Faqat soʻralgan savolga javob ber; soʻralmagan boʻlim yozma. JSON kalit nomlarini, “null” kabi texnik soʻzlarni hech qachon yozma.
- FAQAT qurilish (dom, bino) soʻralganda tuzilma: **Hozir**, **Dom qurilsa** (aholi, mashinalar, qaysi koʻchalarga qancha yuk — xaritada qizil), **Yutuqlar**, **Muammolar**, **Nima qilish kerak**, **Kelajakda (5 yil)**. Har biri 2–4 nuqta, raqamlar bilan.
- “harakat_hisobi_ertalab.yoʻnalishlar” yoki “chiqish_yoʻnalishlari” berilgan boʻlsa — **Dom qurilsa** boʻlimida HAR yoʻnalishni yoz: Y raqami, qaysi koʻchalar orqali qaysi asosiy yoʻlga (C raqami — chiqish chorrahasi), necha mashina/soat va ulushi, NEGA u yoqqa (eng tez yoʻl, necha daqiqa/metr — yaqinroq va tezroq asosiy yoʻlga koʻproq mashina ketadi). Eng tor joy va toʻlish foizi; tor koʻchalar; chiqishda svetofor yoʻqligi; chiqish yonidagi bekat (avtobus toʻxtashi yoʻlni toraytiradi); yoʻl boʻyidagi maktab/bogʻcha — bolalar xavfsizligi. “eng_yaqin_maktab_bogcha” va “eng_yaqin_bekat_m/nomi” dagi nom va masofalarni aniq ayt (maktab bor boʻlsa “belgilanmagan” DEMA). Takliflar shu joylarga bogʻlangan boʻlsin (masalan: C1 da svetofor/burilish yoʻlagi, maktab oldida zebra va 20 km/soat).
- “soya” berilgan boʻlsa (qurilish savolida yoki soya soʻralsa) — soatma-soat ayt: qishda soat nechadan nechagacha soya uylarga tushadi, eng koʻp qaysi soatda (necha uy, soya necha metr), nechta uy 3+ soat soyada qoladi; yozda qisqa. Xaritada soya ranglari va uylar ranglarini tushuntir. Taklif: bino joyini/qavatini oʻzgartirish, shimol tomonga surish.
- Saytda yoʻq maʼlumot (maktab sigʻimi, suv, elektr, kanalizatsiya, yer egaligi) kerak boʻlsa — “maʼlumot yoʻq, … dan soʻrash kerak” deb ayt.
- Agar “internet” maʼlumoti berilgan boʻlsa — tegishlisini qisqa, manbasi bilan ayt.
- “bosh_reja” berilgan boʻlsa — qurilish yoki oʻzgartirish tavsiyasidan OLDIN tekshir: “ziddiyatlar” boʻlsa, javob boshida ⚠️ bilan aniq ayt (konservatsiya zonasi, UNESCO asosiy hududi yoki bufer zonasi, Afrosiyob, qavat cheklovi) va u yerda qurishni TAVSIYA QILMA — muqobil (rekonstruksiya, yashil hudud) taklif qil. Ziddiyat yoʻq boʻlsa — bir qatorda “Bosh reja: …” (UNESCO yodgorligigacha masofa, rasmiy zonalar fayli yuklanganmi). UNESCO maʼlumoti “TAXMINIY” boʻlsa, buni ayt va Madaniy meros agentligidan tasdiqlashni tavsiya qil.
- “ehtiyojlar” berilgan boʻlsa (savol: “bu yerga nima qursam/ochsam foydali”) — dom hisobini YOZMA. Tuzilma:
  1-qator: eng kerakli 1–2 obyekt va asosiy sabab raqam bilan (masalan: “Eng kerakli — bogʻcha: uylarning faqat 20% i 300 m meʼyorda, ~180 oʻrin kerak”).
  **Nima yetishmaydi** — yetishmovchilik balli boʻyicha 3–5 ta: qamrov foizi, eng yaqini qancha uzoqda (nomi bilan), meʼyor radiusi, nechta oʻrin kerak.
  **Qayerga** — “tavsiya_joy” dan: L id va maydoni bilan (xaritada shu raqam). Mos yer yoʻq boʻlsa — buni ochiq ayt va kichik obyekt (dorixona, doʻkon) uchun turar joy 1-qavati yoki pavilyonni tavsiya qil.
  **Yetarli boʻlganlar** — bir qatorda (qamrovi ≥ 80%).
  **Tekshirish kerak** — yer egaligi (kadastr), mavjud maktab/bogʻcha sigʻimi (taʼlim boʻlimi) — bir gapda.
  Obyektlar roʻyxati ochiq xaritadan (OpenStreetMap): xaritada chizilmagan maktab, bogʻcha, dorixona boʻlishi mumkin — “yoʻq” dema, “ochiq xaritada belgilanmagan” de va tasdiqlashni tavsiya qil.
  Sport maydoni, park — mavjud obyekt, ularni “boʻsh yer” dema va ustiga qurishni tavsiya qilma.
${MAPRULE}`;

  function areaFacts(A, extra) {
    const X = extra || {}, st = A.st, R = X.needs ? null : A.res, g = {};
    st.problems.forEach(p => { const k = NX.PROBLEM[p.type].short; g[k] = (g[k] || 0) + 1; });
    const sim = r => r ? { shahar_boʻyicha_yol_vaqti_ozgarishi_foiz: +r.ttChangePct.toFixed(1), koproq_yuklanadigan_koʻchalar: r.affected.filter(x => x.dv > 0 && x.name).slice(0, 6).map(x => ({ koʻcha: x.name, qoʻshimcha_mashina_soat: Math.round(x.dv), toʻlishi_foiz: Math.round(x.scenVC * 100) })), sigmay_qoladigan_koʻchalar: r.overloaded.slice(0, 6).map(x => x.name || 'nomsiz yoʻl'), binodan_yoʻlgacha_m: r.build && r.build.dist } : null;
    return {
      hudud_osm: {
        model_chegarasi: st.outside ? 'hudud transport modeli (tarixiy markaz) dan tashqarida — yuklama butun shahar koʻchalar tarmogʻi boʻyicha alohida hisoblangan (harakat_hisobi_ertalab: yoʻnalishlar Y1…, chiqish chorrahalari C1…); bekat/maktab — saytning shahar fayli (OSM)' : 'transport modeli ichida',
        maydon_ga: +st.areaHa.toFixed(1), koʻchalar: st.streets.filter(s => s.name).slice(0, 10).map(s => s.name), koʻcha_km: +st.streetKm.toFixed(1),
        muammolar: g, bekatlar_ichida: st.stops, bekat_400m_qamrovi_foiz: st.coverage != null ? Math.round(st.coverage) : null,
        eng_yaqin_bekat_m: st.nearestStop && st.nearestStop.d, eng_yaqin_bekat_nomi: st.nearestStop && st.nearestStop.name, avtobus_liniyalari_400m: st.lines.slice(0, 12),
        svetoforlar: st.signals, piyoda_otishlar: st.crossings, maktab_bogcha_ichida: st.schoolsIn.length, maktab_bogcha_500m: st.schoolsNear.length, registondan_m: st.distCenter,
      },
      hozirgi_harakat_yandex: A.live && A.live.list && A.live.list.length ? A.live.list.map(r => ({ qayerga: r.name, hozir_daqiqa: Math.round(r.jams / 60), probkasiz_daqiqa: Math.round(r.free / 60), km: +(r.len / 1000).toFixed(1) })) : 'olinmadi',
      shahar_tirbandligi_yandex_ball: X.level != null ? X.level : null,
      qurilish_hisobi: R ? Object.assign({ ishlatilgan_raqamlar: A.A }, R.b) : 'hali hisoblanmagan',
      harakat_hisobi_ertalab: R ? (st.outside ? (R.out ? NX.outload.facts(R.out) : null) : sim(R.sim)) : null,
      chiqish_yoʻnalishlari: R && R.out && !st.outside ? NX.outload.facts(R.out) : null,
      kelajak_5_yil_oqim_15foiz: R && !st.outside ? sim(R.fut) : null,
      eng_yaqin_maktab_bogcha: st.schoolsNear ? st.schoolsNear.slice(0, 6).map(x => ({ tur: x.kind === 'school' ? 'maktab' : 'bogʻcha', nomi: x.name, masofa_m: x.d })) : null,
      sayt_bahosi: R ? R.ev : null,
      nomzod_joylar: X.cand || null,
      ehtiyojlar: X.needs || null,
      bosh_reja: X.plan || null,
      internet: X.internet || null,
      soya: R && R.shadow ? {
        izoh: 'Yangi bino soyasi har soat (8:00–17:00) 3 kun uchun: soya uzunligi = bino balandligi / tan(quyosh balandligi); uy soyada — konturi soya ichida. Relyef va boshqa binolar soyasi hisobga olinmagan. Xaritada: qishki soya har soat oʻz rangida (yorligʻi “9:00”), uylar: qizil 3+ soat, sariq 2, och sariq 1 soat.',
        bino_balandligi_m: Math.round(R.shadow.planned.height),
        qishda_soya_tushadigan_uylar: R.shadow.shaded.length, qishda_3_soatdan_koʻp_soyada: R.shadow.blds.filter(x => x.lost >= 3).length, qishda_quyoshli_soatlar: R.shadow.sunH,
        soatlar: ['qish', 'bahor', 'yoz'].map(k => ({ kun: k === 'qish' ? '21-dekabr' : k === 'bahor' ? '21-mart' : '21-iyun', soatlar: R.shadow.list.filter(r => r.key === k && r.sun.alt > 2).map(r => ({ soat: r.hour + ':00', quyosh_balandligi: Math.round(r.sun.alt), soya_m: r.len, uylar: r.ids.length })) })),
        eng_koʻp_soyada_qoladigan_uylar: R.shadow.blds.slice(0, 8).map(x => ({ qavat: x.levels, qishda_soatlar: x.hours.qish.map(h => h + ':00'), yozda_soatlar: x.hours.yoz.map(h => h + ':00') })),
      } : null,
      hududdagi_binolar_osm: R && R.blds ? R.blds : null,
      shahar_tizimlari: systemsFacts(st),
    };
  }

  // Chuqur tahlil (tirbandlik, bir tomonlama, svetofor…): bir nechta variant simulyatsiyasi, Yandex real yoʻl vaqtlari, internet
  const DEEP = `Sen Samarqand shahar hokimiyati rahbariyati uchun yoʻl harakati boʻyicha bosh tahlilchisan. Javobing davlat rahbariyatiga koʻrsatiladi.
Senga beriladi: savol; hududning real maʼlumoti (OpenStreetMap); Yandex’dan HOZIR oʻlchangan real yoʻl vaqtlari ikkala yoʻnalishda (va oldingi oʻlchovlar tarixi, boʻlsa);
bir nechta variant boʻyicha harakat modeli hisobi (har birida: umumiy yoʻl vaqti oʻzgarishi, shu koʻchaning toʻlishi, qaysi koʻchalarga yuk oshadi/kamayadi, avtobuslar); internet manbalari (boʻlsa).
Qoidalar:
- Faqat savolga javob ber. Soʻralmagan mavzu (qurilish, maktab va h.k.) haqida yozma.
- 1-qator: aniq tavsiya bitta gapda (masalan: “7:30–10:00 da faqat shimolga bir tomonlama, qolgan vaqtda ikki tomonlama”).
- Keyin **Asos**: real oʻlchov (qaysi yoʻnalish hozir sekin, necha daqiqa, oʻlchov vaqti) va variantlar solishtiruvi — har variant bir qatorda raqamlar bilan. Eng yaxshisini nega tanlaganingni ayt.
- **Sxema**: aniq vaqt oraliqlari, yoʻnalish, qaysi chorrahalarda qanday belgi/svetofor, aylanib oʻtish yoʻli (yuk oshadigan koʻchalar), avtobuslar.
- **Sinov va nazorat**: necha kun, nimani oʻlchash, qaysi raqamda bekor qilish.
- **Xaritada**: xaritada qaysi variant koʻrsatilganini bir gapda ayt (qizil — yuk oshadi, yashil — kamayadi).
- Internet manbalari boʻlsa — faqat shu koʻchaga tegishlisini qisqa, havolasi bilan. Boʻlmasa — yozma.
- Hech qachon JSON kalit nomlarini, “null”, “hisoblanmagan” kabi texnik soʻzlarni yozma. Umumiy, mazmunsiz gaplar yozma. Maʼlumot yetishmasa — bitta gapda nima yetishmaydi va qanday olinadi.
- Raqamlarni faqat berilgan maʼlumotdan ol. Real oʻlchov va model hisobini aralashtirma: hisobni “hisob boʻyicha” deb ayt.
${MAPRULE}
- Oʻzbek tilida (lotin), aniq va londa.`;
  // Umumiy: saytning hisobi (JSON) asosida javob — har qanday maxsus tahlil uchun (mahallalar qamrovi va h.k.)
  const FACTS = `Sen Samarqand shahar hokimiyati uchun shaharsozlik va ijtimoiy infratuzilma tahlilchisisan. Senga saytning real maʼlumotdan hisobi (JSON) beriladi.
Oʻzbek tilida (lotin), qisqa va aniq yoz. Savolga AYNAN javob ber: 1-qator — eng muhim xulosa raqam va nom bilan; keyin roʻyxat (xaritadagi raqamlar bilan); oxirida eng arzon va tez amaliy taklif (mavjud binoning 1-qavati, maktab qoshidagi guruh, mobil xizmat) va qaysi idoradan aniq maʼlumot soʻrash kerak (taʼlim boʻlimi — bolalar soni va sigʻim, tibbiyot boshqarmasi). JSON kalit nomlarini yozma.`;
  async function factsAsk(q, facts, history) {
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1200) }));
    const r = await callOpenAI(userKey(), null, null, null, [{ role: 'system', content: FACTS }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) }]), NX.config.openaiDeep, 'facts');
    return verify(q, facts, { text: r.text, src: 'ai', model: r.model });
  }
  // Tirbandlik kuzatuvi (Yandex marshrut vaqtlari tarixi): vaqt boʻyicha eng tirband chorrahalar
  const TRAFFIC = `Sen Samarqand hokimiyati uchun transport tahlilchisisan. Senga yirik chorrahalarga kiruvchi yoʻllardagi REAL oʻlchovlar beriladi (Yandex marshrut vaqti probkali / probkasiz, har 15 daqiqada; soat boʻyicha — shu vaqtdagi barcha kunlar oʻrtachasi).
Oʻzbek tilida (lotin), qisqa va aniq yoz. Savolga AYNAN javob ber:
1-qator: soʻralgan vaqtda eng tirband 1–3 chorraha va qanchaga sekin (masalan “Rudakiy × Daxbet — 2.1 marta sekin”).
**Chorrahalar** — 5–7 tasi raqami (T1…) bilan: necha marta sekin, qaysi tomondan kirish eng sekin, qoʻshimcha daqiqa (boʻlsa), shu chorrahaning eng tirband paytlari.
**Nima qilish mumkin** — eng arzon va tez yechimdan: svetofor fazasini shu soatga moslash, burilish choʻntagi, chorraha yonida toʻxtashni taqiqlash, YPX nazoratchisi tirband soatda; har biri aniq chorrahaga bogʻlangan.
Tarix (“kunlar_boʻyicha”, “oxirgi_7_kun”) boʻlsa — **Kunlar boʻyicha** qisqa boʻlim: qaysi chorrahalar har kuni takrorlanadi (nechta kunda), qaysi kun eng yomon boʻldi, oldingi haftaga nisbatan yomonlashgan/yaxshilangan chorrahalar (foiz). Bir martalik va doimiy tirbandlikni ajrat: doimiy — svetofor/chorraha yechimi, bir martalik — hodisa/taʼmir boʻlishi mumkin.
Agar oʻlchovlar kam boʻlsa (kuzatuv kunlari 1–2, shu vaqtdagi oʻlchovlar 1–2) — bir gapda ayt: “kuzatuv yangi, kunlar oʻtgan sari aniqlashadi”. “eslatma” boʻlsa — boshida ayt.
Faqat JSON’dagi raqam va nomlardan foydalan, yoʻqini oʻylab topma. JSON kalit nomlarini yozma. Xaritada T raqamlari bilan koʻrsatilganini ayt.`;
  async function trafficAsk(q, facts, history) {
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1200) }));
    const r = await callOpenAI(userKey(), null, null, null, [{ role: 'system', content: TRAFFIC }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) }]), NX.config.openaiDeep, 'traffic');
    return verify(q, facts, { text: r.text, src: 'ai', model: r.model });
  }
  async function deepAsk(q, facts, history) {
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1500) }));
    const messages = [{ role: 'system', content: DEEP }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) }]);
    const r = await callOpenAI(userKey(), null, null, null, messages, NX.config.openaiDeep, 'deep');
    return verify(q, facts, { text: r.text, src: 'ai', model: r.model });
  }
  // 3D egizak: suv toshqini, zilzila, quyosh — stsenariy natijalari asosida
  const TWIN = `Sen Samarqand shahar hokimiyati uchun favqulodda vaziyatlar va shahar infratuzilmasi boʻyicha bosh tahlilchisan. Javobing rahbariyatga koʻrsatiladi.
Senga beriladi: savol; real maʼlumot (yogʻin prognozi, yillik quyosh nurlanishi — Open-Meteo; relyef — SRTM ~30 m; binolar — OpenStreetMap); stsenariy hisobi (N mm yomgʻir 1 soat ichida yogʻsa: relyef boʻylab oqim yigʻilishi va Manning formulasi bilan qaysi koʻchalarda qancha chuqur suv, nechta bino, qaysi maktab/shifoxona).
Qoidalar:
- Faqat savolga javob ber. 1-qator: aniq xulosa raqam bilan (masalan: “50 mm yomgʻirda ~12 ga suv ostida qoladi, eng xavfli — X koʻchasi, 60 sm gacha”).
- Keyin: **Xavfli joylar** (koʻcha — chuqurlik, uzunlik), **Odamlar va binolar** (nechta bino, qaysi maktab/shifoxona), **Hozir nima qilish kerak** (ariq va kollektorlarni tozalash, nasoslar, ogohlantirish, yoʻl yopish — qayerda), **Uzoq muddatli yechim**.
- Bir nechta stsenariy berilgan boʻlsa — farqini raqamlar bilan solishtir.
- “muhofaza” berilgan boʻlsa va koʻcha UNESCO zonasida — kengaytirish, yangi polosa, buzish kabi yechimlarda Madaniy meros agentligi kelishuvi kerakligini ayt; UNESCO asosiy hududida (Temuriylar, Yevropa qismi, Afrosiyob) koʻchani kengaytirish yoki binolarni buzishni tavsiya qilma — tashkiliy yechimlarni (svetofor, bir tomonlama, jamoat transporti) taklif qil.
- “internet” berilgan boʻlsa (oʻtgan haqiqiy hodisalar) — model natijasini shu real hodisalar bilan solishtir: mos kelgan va kelmagan joylarni ayt, manba bilan.
- “real_hodisalar_oav” berilgan boʻlsa (Samarqandda haqiqatda suv bosgan koʻchalar, OAV): **Real hodisalar bilan solishtirish** — har biri uchun bir qator: koʻcha, sana, model ham koʻrsatdimi. Model koʻrsatmagan joyda sabab odatda ariq/kanal tiqilishi ekanini ayt (xaritada 📰 H belgilar).
- “real_3d_skan” berilgan boʻlsa (telefon LiDAR bilan skan qilingan koʻcha): koʻcha haqida TOʻLIQ hisobot ber — 1) umumiy (uzunlik, eni oʻrtacha/eng tor/eng keng, balandlik farqi, qiyalik, uylar balandligi); 2) KAMCHILIKLAR roʻyxati — har biri: nima, qayerda (koʻcha boshidan metr, xaritadagi belgi T1/S1…), qiymati, oqibati (oʻt oʻchirish/tez yordam, suv, nogironlar), QANDAY HISOBLANGANI va QAYERDAN olingani (bu savolda manba va usulni yozish shart); 3) koʻcha_auditi berilgan boʻlsa — trotuar, oʻtish joylari, chiroqlar; 4) takliflar eng arzondan, narxi bilan; 5) oʻlchov aniqligi (±10–20 sm) va meʼyorlar taxminiy ekanini bir gapda ayt. Raqamlarni faqat faktlardan ol.
- “sunʼiy_yoʻldosh” berilgan boʻlsa (Landsat yer yuzasi harorati, Sentinel-2 yashillik): raqamlar bilan javob ber — eng issiq mahallalar (I1…), salqinlari (S…), daraxt ekish ustuvor joylar (D1…), yashil hudud gektari 2019 va 2025, yangi qurilish joylari (Q1…). Harorat — YUZA harorati ekanini, yangi qurilish — taxminiy ekanini bir gapda ayt. Yechim: daraxt, soya, favvora/suv, oq tom, yashil botiq — aniq mahallalar bilan.
- “havo_sifati” berilgan boʻlsa: AQI va PM2.5 raqamlari, daraja, keyingi 24 soat; bu model ekani (oʻlchov stansiyasi emas).
- “murakkab_savol” berilgan boʻlsa — savolda bir nechta xavf bor (masalan zilzila VA yomgʻir): har bir qism uchun alohida hisob berilgan. Javobni BIRLASHTIRIB yoz: 1-qator — umumiy xulosa; keyin har bir xavf qisqa (raqamlar bilan); eng muhimi — **Ikkalasi birga boʻlsa**: qaysi joylar ikki marta xavfli (bir xil koʻcha/mahalla ikkala roʻyxatda boʻlsa — nomi bilan), evakuatsiya yoʻli suv bosgan koʻchadan oʻtmasligi, xizmatlar qaysi yoʻldan borishi; ustuvorlik tartibi.
- “belgilangan_hudud_suv” berilgan boʻlsa — savol foydalanuvchi chizgan hudud haqida: javobni FAQAT shu hududdagi koʻchalar bilan boshla (roʻyxat shu yerda); shahar boʻyicha raqamlarni bir gapda qoʻsh.
- “ariqlar_tiqilgan_holat” berilgan boʻlsa: avval kanalizatsiya ishlaganda (asosiy hisob), keyin ariq va kollektorlar tiqilgan boʻlsa qaysi koʻchalarda suv toʻplanishini ayt — xaritada shu holat koʻrsatilgan.
- Zilzila soʻralsa: “xavf_xaritasi” dagi zonalar va raqamlar asosida javob ber; bino mustahkamligi (material, yil) maʼlumoti yoʻqligini bir gapda ayt. Raqam oʻylab topma.
- “xavf_xaritasi” berilgan boʻlsa — bu koʻcha tarmogʻida hisoblangan va XARITADA CHIZILGAN natija. Javobni shunga qur va id lar bilan ayt (Z1, R1, S1, H1 — xaritadagi belgilar shu nomda):
  • Zilzila: **Eng koʻp zarar koʻrishi mumkin joylar** — Z1…Z6: joy nomi, nechta odam xavf ostida, nega (past paxsa/gʻisht uylar, zichlik, 5+ qavat, maktab/shifoxona).
    **Evakuatsiya rejasi** (“evakuatsiya_rejasi” dan, har bir zona yoki mahalla uchun alohida qator): “Z1 (joy) — 1 200 kishi → R1: X → Y koʻchalari, 650 m, piyoda ~10 daq., hammasi chiqib boʻlishi ~25 daq. → S1 (nomi, sigʻimi). Zaxira: R1z (Z → W koʻchalari, 800 m)”. Agar bir zona ikki joyga boʻlingan boʻlsa (birinchisi toʻlgan) — ikkalasini ham ayt. Sigʻim yetmasa yoki eng tor joy 4 m dan tor boʻlsa — ogohlantir.
    **Birinchi soatda nima qilish kerak** — qisqa, joylar bilan (qaysi yoʻllarni boʻshatish, qayerga tibbiy punkt, qaysi maktab/shifoxonani birinchi tekshirish).
  • Suv toshqini: **Suvdan chiqish** — har bir suvli koʻcha uchun: “X koʻchasi (40 sm) → R1 yoʻli (koʻchalar, N m, ~M daq.) → H1 (nomi, balandligi, necha m yuqori); zaxira R1z”. **Eng baland xavfsiz joylar** — roʻyxat.
- “xavf_xaritasi.qutqaruv_yoʻllari” berilgan boʻlsa — alohida **🚑 Qutqaruv mashinalari yoʻllari** boʻlimi: har biri “TY1 (tez yordam): X shifoxonasi → Z1, A → B koʻchalari, ~N m, ~M daq.” yoki “OT1 (oʻt oʻchirish): …”; toʻsilishi mumkin koʻchalar chetlab oʻtilganini, agar “toʻsilishi_mumkin_qism_m” > 0 boʻlsa — ogohlantir. Piyoda evakuatsiya (yashil, R) va mashina yoʻllari (qizil/toʻq sariq, TY/OT) farqini va xaritada oʻqlar harakat yoʻnalishini koʻrsatishini bir gapda ayt: piyodalar ○ boshlanishdan ● yigʻilish joyiga, mashinalar stansiyadan zonaga.
- “xizmatlar_xaritasi” berilgan boʻlsa (yongʻin, tez yordam, politsiya): 1-qator — shahar koʻchalarining necha foiziga meʼyor (daqiqa) ichida yetib boriladi. **Uzoq hududlar** — T1…: joy, necha daqiqa, qaysi stansiyadan. **Yoʻl** (Y1 boʻlsa): qaysi stansiyadan, qaysi koʻchalar orqali, necha daqiqa. **Tavsiya** — yangi stansiya/post qayerga kerak (eng uzoq hududlar oraligʻi), yoʻllarni boʻshatish.
- “suv_yechimi.topilmadi” boʻlsa — soʻralgan koʻchada suv toʻplanmasligini ayt, boshqa joy uchun yechim YOZMA; suv toʻplanadigan koʻchalarni sanab, ulardan birini tanlashni taklif qil.
- “suv_yechimi” da “ish_tartibi_xaritadagi_raqamlar” boʻlsa — “Nima qilish kerak” boʻlimini AYNAN shu raqamlar (①②③④⑤) bilan yoz: har qadam — qayerda (koʻcha nomlari), nima qilinadi (nasos, quduq, ariq/lotok qazish, quvur yotqizish), oʻlchami (dona, m, Ø mm, m³). “mavjud_ariqlar” ni ayt: koʻchada ariq bormi, atrofdagi ariq/kanallar. Javobdagi sunʼiy yoʻldosh rasmi va sxemadagi raqamlar xaritadagi bilan bir xil ekanini ayt.
- “suv_yechimi” da “tanlov_sababi”, “variantlar[].narx_taxminiy”, “hisobiy_yomgir” boʻlsa: tavsiyani ENG ARZON yetarli variant asosida yoz va narxini ayt; avval eng oddiy choralar (tozalash, quduqlar, eng yaqin ariqqa ulash), keyin kerak boʻlsa kattaroq inshoot. Doimiy inshoot meʼyoriy yomgʻirga hisoblanganini, favqulodda jalada esa koʻchma nasoslar ishlatilishini bir gapda ayt. Uzoq (km lab) quvur yoki ulkan diametrni faqat “variantlar” da boshqa yetarli yoʻl boʻlmasa tavsiya qil. “boshqa_chiqish_joylari” — qisqa solishtirish.
- “suv_yechimi” berilgan boʻlsa (suv toʻplanadigan joyni hal qilish): tuzilma — 1-qator: muammo raqamlarda (koʻcha, chuqurlik, hajm m³). **Sabab** — havza (ga), eng yuqori oqim va mavjud tizim sigʻimi (m³/s), nega aynan shu joy (havzaning eng past nuqtasi). **Variantlar** — A/B/C/D har biri: nima qilinadi (diametr, uzunlik, hajm, quduqlar soni), samarasi, mos/mos emas va nega (bosh reja, UNESCO, gravitatsion chiqish bormi). **Tavsiya** — eng yaxshisi va ketma-ketligi (avval tezkor: tozalash/quduqlar, keyin asosiy). **Xaritada** — moviy kataklar havza, havorang chiziq kollektor yoʻli, ⬇ chiqish, 🛢 rezervuar, ▦ quduqlar. “cheklovlar_bosh_reja_unesco” ni albatta ayt. “real_suratlar” boʻlsa — joy suratlari chatda koʻrsatilganini ayt.
- “savol_doirasi” = BUTUN SHAHAR boʻlsa: 1-qator — jami odam, nechta mavze, nechta yigʻilish joyi, oʻrtacha va eng uzoq vaqt. Keyin **Eng koʻp odam boradigan joylar** (sigʻim bilan, sigʻmaydiganlarini ogohlantir), **Eng uzoq yuradigan mavzelar**, **Xavfli zonalar (Z)** qisqa, **Birinchi soatda**. Xaritada har bir mavzedan yoʻl chizilgan — buni ayt.
- Savol “belgilangan hudud” haqida, lekin “savol_doirasi” FAQAT belgilangan hudud EMAS boʻlsa (hudud chizilmagan): qayta soʻrama — barcha zonalar uchun rejani ber, eng xavflisidan (Z1) boshla; oxirida bir gap: “Boshqa hudud uchun xaritada ✏️ Hudud belgilang.”
- ENG MUHIM: aynan berilgan savolga javob ber. Oldingi javobni takrorlama — har savol uchun yangi hisob berilgan, faqat shuni ishlat.
- “savol_doirasi” = “FAQAT belgilangan hudud” boʻlsa: javob FAQAT shu hudud haqida. 1-qator: hududda nechta odam, nechta bino xavf ostida. Keyin har bir uy guruhi (A1, A2…) uchun: “A1 (~400 kishi) → R1: X → Y koʻchalari, 350 m, ~5 daq. → S1 (nomi, sigʻimi); zaxira R1z”. Butun shahar zonalarini (boshqa Z lar) yozma.
- “koʻcha_auditi” berilgan boʻlsa (bitta koʻcha: avtomobil, piyoda, nogironlar): 1-qator — koʻcha, uzunlik va uchta ball (🚗/🚶/♿ /100). Savol qaysi yoʻnalish haqida boʻlsa (masalan faqat nogironlar) — shu boʻlimni birinchi va batafsil yoz, qolganlarini 1–2 qatorda. Boʻlimlar: **🚗 Avtomobil** (tezlik, qoplama, svetofor, turargoh), **🚶 Piyoda** (trotuar, oʻtish joylari soni va eng katta oraliq — meʼyor bilan, maktab/bekat oldida oʻtish joyi), **♿ Nogironlar** (qiyalik %, bordyur, taktil plitka, zinapoya). “ai_suratlar_tahlili” boʻlsa — **📷 Real suratlarda** boʻlimi: suratda nima koʻringanini ayt (trotuar, chuqurlar, mashina trotuarda) va OSM bilan farq qilsa — ayt. **Nima qilish kerak** — “yechimlar” dan, aniq joy va oʻlcham bilan; yangi oʻtish joylari (P) — “nomzod”, joyida tekshirish kerakligini ayt; svetoforli chorraha yoki mavjud zebra yonida yangi oʻtish joyi TAVSIYA QILMA; “suratlar_bilan_olib_tashlangan_takliflar” boʻlsa — ular olib tashlanganini ayt; xaritadagi ➕ P1… yangi oʻtish joylari, ⛔ Z zinapoya, toʻq sariq/qizil — qiya qismlar. “maʼlumot yoʻq” ni “yoʻq” deb yozma — “ochiq maʼlumotda belgilanmagan, joyida tekshirish kerak” de.
- “koʻchalar_reytingi” berilgan boʻlsa (shahar yoki hudud koʻchalari): 1-qator — nechta koʻcha, oʻrtacha ball, eng yomoni. **Eng muammoli koʻchalar** — 1…10 (xaritadagi raqamlar): koʻcha — ball — asosiy muammo. **Umumiy muammolar** (jami raqamlar). **Nima qilish kerak** — birinchi navbatda qaysi koʻchalarda nima (oʻtish joyi, pandus, qoplama). Oxirida: batafsil tekshiruv uchun koʻcha nomini yozish mumkinligini ayt.
- Ochiq xaritada (OSM) belgilanmagan narsa (zebra, svetofor, ariq, maktab, bordyur) haqiqatda boʻlishi mumkin: “yoʻq” dema — “ochiq maʼlumotda belgilanmagan” de; real suratlar tahlili berilgan boʻlsa — suratga ishon. Mavjud svetofor, zebra yoki chorraha yonida yangi oʻtish joyi, svetofor yoki bekat taklif qilma.
- Kod bloki, ASCII sxema ishlatma — oddiy matn va roʻyxat.
- Yechim taklif qilganda eng oddiy, arzon va yaqin variantdan boshla (mavjud inshootni tozalash/ulash, belgi, tashkiliy chora), keyin kerak boʻlsa qimmatrogʻini; har taklifni masofa/oʻlcham va (berilgan boʻlsa) narx bilan asosla. Butun shahar boʻyicha takrorlab boʻlmaydigan ulkan yoki uzoq inshootni oddiyroq yoʻl bor joyda tavsiya qilma.
- Maʼlumot qayerdan olinganini, qanday hisoblanganini, manbalar roʻyxatini matnda yozma (ular alohida koʻrsatiladi). Faqat natija va tavsiya.
  • Hisob taxminiy ekanini bir marta ayt (bino materiali/yili yoʻq — qurilish inspeksiyasi va kadastrdan olinsa aniqlashadi). Raqamlarni faqat JSON’dan ol.
- Xaritada nima koʻrsatilganini bir gapda ayt (koʻk — suv; qizil kataklar — xavfli zonalar; yashil chiziqlar — evakuatsiya yoʻllari; yashil belgilar — yigʻilish/baland joylar).
- JSON kalit nomlarini, texnik soʻzlarni yozma. Cheklovlarni faqat bir gapda ayt (relyef ~30 m, kanalizatsiya sigʻimi taxminiy).
- Oʻzbek tilida (lotin), aniq va londa.`;
  // Koʻcha auditi: real koʻcha suratlari (Mapillary) — trotuar, qoplama, pandus, oʻtish joyi, toʻsiqlar (JSON)
  const STREET_VISION = `Senga bitta koʻchaning turli joylaridan olingan real suratlar (Mapillary, 1–4 ta) beriladi. Avtomobil, piyoda va nogironligi bor odamlar (aravacha, koʻzi ojiz) nuqtai nazaridan baholang.
Faqat JSON qaytar: {"trotuar":"bor|yoq|qisman|noaniq","trotuar_holati":"yaxshi|oʻrtacha|yomon|noaniq","qoplama":"yaxshi|chuqurlar bor|yomon|noaniq","pandus_pastlatilgan_bordyur":"bor|yoq|noaniq","zebra":"bor|yoq|noaniq","toʻsiqlar":"trotuarda mashina, ustun, savdo, daraxt, zinapoya — koʻringanini yoz yoki yoʻq","kuzatuvlar":["har biri oʻzbekcha 1 qisqa gap: n-suratda nima koʻrindi"]}
Faqat aniq koʻringan narsani yoz; koʻrinmasa — “noaniq”. Taxmin qilma.`;
  async function streetVision(photos, A) {
    if (!photos || !photos.length) return null;
    if (!(await proxyReady())) return null;
    const imgs = photos.slice(0, proxyV >= 4 || userKey() ? 4 : 2).map(x => ({ type: 'image_url', image_url: { url: x.url, detail: 'low' } }));
    const messages = [{ role: 'system', content: STREET_VISION }, { role: 'user', content: [{ type: 'text', text: `Koʻcha: ${A.name}, ${A.L} m, ${A.hw}. Suratlar: ${photos.slice(0, imgs.length).map((p, i) => `${i + 1}) ${p.date ? new Date(p.date).toISOString().slice(0, 10) : '?'}`).join('; ')}` }].concat(imgs) }];
    const r = await callOpenAI(userKey(), null, null, null, messages, NX.config.openaiLight, 'streetvision');
    const m = r.text.match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]) : null; } catch (e) { return null; }
  }
  // ---------- AI javobini tekshirish: javobdagi har bir raqam hisob natijalarida (facts) bormi ----------
  // Belgi raqamlari (Z1, R12, I3), roʻyxat tartibi (1., 2.) va kichik sonlar (≤ 12) hisobga olinmaydi; 2% yoki yaxlitlash farqi — mos.
  function checkNums(text, facts) {
    if (!text || !facts) return null;
    const pool = [];
    const walk = v => { if (v == null) return; if (typeof v === 'number') { if (isFinite(v)) pool.push(v); return; } if (typeof v === 'string') { (v.match(/-?\d[\d\s ]*(?:[.,]\d+)?/g) || []).forEach(t => { const x = parseFloat(t.replace(/[\s ]/g, '').replace(',', '.')); if (isFinite(x)) pool.push(x); }); return; } if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'object') Object.values(v).forEach(walk); };
    walk(facts);
    const clean = String(text).replace(/\b[A-Za-zʻ]{1,3}\d+[a-z]?\b/g, ' ').replace(/^\s*[-•]?\s*\d+[.)]\s/gm, ' ').replace(/[①②③④⑤]/g, ' ');
    const toks = clean.match(/-?\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g) || [];
    const nums = [...new Set(toks.map(t => parseFloat(t.replace(/[\s\u00a0]/g, '').replace(',', '.'))).filter(x => isFinite(x) && Math.abs(x) > 12))];
    if (!nums.length) return null;
    const near = x => pool.some(p => Math.abs(p - x) <= Math.max(1, Math.abs(p) * 0.02) || Math.abs(p * 100 - x) <= 1 || Math.abs(Math.round(p) - x) < 0.6 || Math.abs(p / 1000 - x) <= Math.max(0.1, Math.abs(p / 1000) * 0.02) || Math.abs(p / 1e4 - x) <= Math.max(0.1, Math.abs(p / 1e4) * 0.03));
    const bad = nums.filter(x => !near(x));
    return { n: nums.length, ok: nums.length - bad.length, bad: bad.slice(0, 6) };
  }
  // Tekshiruvchi (2-bosqich, kuchli model): javobdagi har bir raqam va daʼvo faktlar bilan solishtiriladi.
  // Ishga tushadi: (a) faktlarda yoʻq raqam bor; (b) javob “yoʻq/belgilanmagan/topilmadi” deydi, lekin faktlarda shu narsa bor (maktab, bekat, svetofor…).
  const VERIFY = `Sen qatʼiy tekshiruvchisan. Senga savol, saytning REAL maʼlumotlari (JSON) va boshqa model yozgan javob beriladi.
Vazifa: javobni JSON bilan solishtir va TUZATILGAN javobni yoz (oʻsha tuzilma, oʻsha til, oʻsha uslub, qisqa).
- JSON’da yoʻq yoki undan farq qiladigan har bir raqam/nom — JSON’dagi toʻgʻrisi bilan almashtir; JSON’da umuman yoʻq boʻlsa — olib tashla.
- “yoʻq”, “belgilanmagan”, “topilmadi” degan gap JSON’da bor narsaga zid boʻlsa (masalan maktab/bogʻcha, bekat, svetofor roʻyxati bor) — aniq nomi va masofasi bilan toʻgʻrila.
- Javobda savolga kerakli muhim fakt tushib qolgan boʻlsa (masalan yuklama qaysi yoʻlga qancha ketadi va nega, soya qaysi soatda nechta uyga tushadi) — qisqa qoʻsh.
- Taxminiy hisoblar “taxminiy” boʻlib qolsin. Yangi narsa oʻylab topma. Faqat tuzatilgan javob matnini yoz — izoh, “tuzatdim” kabi soʻzlarsiz.`;
  const CLAIM_NO = /(maktab|bogʻcha|bog'cha|bekat|svetofor|oʻtish joy|o'tish joy)[^.\n]{0,60}(yoʻq|yo'q|belgilanmagan|topilmadi)|(yoʻq|belgilanmagan|topilmadi)[^.\n]{0,30}(maktab|bogʻcha|bekat|svetofor)/i;
  function factsHave(facts, re) { let hit = false; const walk = (v, k) => { if (hit || v == null) return; if (Array.isArray(v)) { if (v.length && re.test(k || '')) hit = true; else v.forEach(x => walk(x, k)); } else if (typeof v === 'object') Object.keys(v).forEach(kk => walk(v[kk], kk)); else if (typeof v === 'number' && v > 0 && re.test(k || '')) hit = true; }; walk(facts, ''); return hit; }
  async function verify(q, facts, r) {
    if (!r || !r.text || !facts) return r;
    const chk = checkNums(r.text, facts), m = r.text.match(CLAIM_NO);
    const contra = !!m && ((/maktab|bog/i.test(m[0]) && factsHave(facts, /maktab|bogcha|bogʻcha|school/i)) || (/bekat/i.test(m[0]) && factsHave(facts, /bekat|stop/i)) || (/svetofor/i.test(m[0]) && factsHave(facts, /svetofor|signal/i)));
    if (!((chk && chk.bad.length) || contra)) return Object.assign({}, r, { check: chk });
    try {
      const v = await callOpenAI(userKey(), null, null, null, [{ role: 'system', content: VERIFY }, { role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) + '\n\nTekshiriladigan javob:\n' + r.text }], NX.config.openaiDeep, 'verify');
      const c2 = checkNums(v.text, facts);
      // Tuzatilgani yaxshiroq boʻlsa (faktlarda yoʻq raqamlar kamaygan) — shu olinadi
      if (v.text && v.text.trim().length > 40 && (!c2 || !chk || c2.bad.length <= chk.bad.length)) return Object.assign({}, r, { text: v.text, check: c2, verified: true });
    } catch (e) { /* tekshiruvchi ishlamadi — birinchi javob qoladi */ }
    return Object.assign({}, r, { check: chk });
  }
  // Savol turini aniqlash (regex topa olmaganda): engil model, faqat bitta soʻz qaytaradi
  const ROUTE_TYPES = ['quake', 'flood', 'evac', 'fire', 'ambulance', 'police', 'access', 'traffic', 'needs', 'build', 'plan', 'road', 'climate', 'solar', 'general'];
  const ROUTER = `Sen Samarqand hokimiyati saytining savol yoʻnaltiruvchisisan. Savol oʻzbek, rus yoki aralash tilda, imlo xatolari bilan boʻlishi mumkin.
Savolni quyidagi turlardan BIRIGA ajrat va FAQAT tur nomini yoz (boshqa hech narsa yozma):
quake — zilzila, yer silkinishi, binolar zaifligi; flood — yomgʻir, sel, suv bosishi, koʻlmak; evac — evakuatsiya, qochish, yigʻilish joyi;
fire — yongʻin, oʻt oʻchirish; ambulance — tez yordam, shifoxonaga yetib borish; police — politsiya, patrul;
access — koʻcha holati, trotuar, piyoda oʻtish joyi, nogironlar, pandus, asfalt, qoplama, avtoturargoh, koʻcha chiroqlari;
traffic — tirbandlik, svetofor, avtobus, bekat, marshrut, avariya, chorraha; needs — hududda nima yetishmaydi, qayerga maktab/bogʻcha/park kerak;
build — aniq bino qurish (qavat, xonadon); plan — bosh reja, UNESCO, qurilish ruxsati, muhofaza zonasi; road — yangi koʻcha/yoʻl, koʻprik loyihasi;
climate — iqlim, issiqlik, daraxt, havo, ekologiya; solar — quyosh paneli, energiya; general — boshqa.
Oldingi savol berilgan boʻlsa va yangi savol uning davomi boʻlsa (“u-chi?”, “endi…”) — oldingi savol turini hisobga ol.`;
  // Ovozli buyruq: oʻzbekcha gap notoʻgʻri eshitilgan boʻlishi mumkin — AI qaysi buyruq ekanini aniqlaydi (bitta kalit soʻz)
  const VOICE_KEYS = ['map', 'problems', 'systems', 'twin', 'ai', 'report', 'clear', 'measure', 'tour', 'fotoreal', 'maket', 'area', 'refresh', 'traffic', 'question'];
  const VOICE_SYS = `Sen ovozli buyruq yoʻnaltiruvchisisan. Foydalanuvchi Samarqand shahri raqamli egizagi saytiga oʻzbekcha (baʼzan ruscha aralash) gapirgan; nutq tanish xato qilgan boʻlishi mumkin (soʻzlar buzilgan) — bir nechta variant beriladi, maʼnosiga qarab aniqla.
Faqat BITTA kalit soʻz yoz:
map — xaritaga oʻtish; problems — muammolar boʻlimi; systems — shahar tizimlari; twin — 3D egizak boʻlimi; ai — AI yordamchi/suhbat; report — hisobot/brifing boʻlimi; clear — natijani yopish/tozalash; measure — oʻlchash; tour — obidalar boʻylab sayohat; fotoreal — fotoreal 3D; maket — sxema/maket 3D; area — hudud belgilash; refresh — maʼlumotni yangilash; traffic — jonli probka xaritasi; question — buyruq emas, shahar haqida savol yoki tushunarsiz.`;
  async function voiceIntent(list) {
    const r = await callOpenAI(userKey(), null, null, null, [{ role: 'system', content: VOICE_SYS }, { role: 'user', content: 'Variantlar:\n' + list.slice(0, 3).map((x, i) => (i + 1) + ') ' + x).join('\n') }], NX.config.openaiLight, 'router');
    const w = (r.text || '').toLowerCase().match(/[a-z]+/);
    return w && VOICE_KEYS.includes(w[0]) && w[0] !== 'question' ? w[0] : null;
  }
  // Ovoz tushunuvchi: nutq tanish xatolarini domen lugʻati (buyruqlar, joy/koʻcha nomlari, katalog savollari) bilan tuzatadi
  const VRES_CMDS = { map: 'Xarita boʻlimiga oʻtish', problems: 'Muammolar boʻlimi', systems: 'Shahar tizimlari boʻlimi', twin: '3D egizak boʻlimi', ai: 'AI yordamchi boʻlimi', report: 'Hisobot boʻlimi', clear: 'natijani yopish/tozalash', measure: 'oʻlchash rejimi', tour: 'obidalar boʻylab sayohat', fotoreal: 'fotoreal 3D', maket: 'maket/sxema koʻrinishi', area: 'hudud belgilash', refresh: 'maʼlumotni yangilash', traffic: 'jonli probka qatlami', zoomin: 'xaritani yaqinlashtirish (kattalashtir)', zoomout: 'xaritani uzoqlashtirish (kichraytir)', panleft: 'xaritani chapga surish', panright: 'xaritani oʻngga surish', panup: 'xaritani yuqoriga (shimolga) surish', pandown: 'xaritani pastga (janubga) surish', scan3d: '3D real koʻcha (skanlangan koʻcha)ga oborish', top: 'tepadan koʻrinish', side: 'yon tomondan koʻrinish', rotate: 'aylantirish/burish', labelsoff: 'obidalar yozuvlarini oʻchirish', labelson: 'yozuvlarni yoqish', lite: 'yengil rejim', settings: 'sozlamalar', stop: 'toʻxtatish', theme: 'qorongʻi/yorugʻ rejim', wakeon: 'doim tinglashni yoqish', wakeoff: 'doim tinglashni oʻchirish' };
  const VRES_SYS = `Sen Samarqand shahri raqamli egizagi saytining ovozli agentisan: foydalanuvchi odam bilan gaplashgandek erkin gapiradi (hazil, soʻzlashuv, “bitta yaqinlashtirib yubor”, “endi…”, “yana”), sen uni tushunib ishni bajarasan. Bir gapda bir necha ish soʻralsa — act ichida qadamlarni ketma-ket yoz. Foydalanuvchi oʻzbekcha (baʼzan ruscha aralash) gapirgan; nutq tanish bir nechta variantda xato qilgan: soʻzlar buzilgan, qoʻshilgan yoki tushib qolgan. Maʼnosiga va fonetik oʻxshashlikka qarab aslida nima deyilganini aniqla.
Faqat bitta JSON qaytar (boshqa matn yoʻq):
{"t":"cmd","k":"<buyruq kaliti>"} | {"t":"place","n":"<joy nomi>"} | {"t":"street","n":"<koʻcha nomi>"} | {"t":"q","text":"<toʻgʻrilangan savol>"} | {"t":"geo","q":"<xaritadan qidiriladigan joy/koʻcha nomi>"} | {"t":"chat","say":"<1 gaplik doʻstona javob>"} | {"t":"act","say":"<qisqa oʻzbekcha tasdiq>","steps":[...],"more":false} | {"t":"unclear"}
Qoidalar:
1) Buyruq kalitlari faqat berilgan roʻyxatdan. Qisqa gap (1–3 soʻz) koʻpincha buyruq; “yaqin/uzoq” aniq boʻlmasa — unclear.
2) Joy va koʻcha nomi FAQAT berilgan nomzodlar roʻyxatidan (nusxa koʻchir); roʻyxatda mos nom yoʻq boʻlsa uydirma.
3) Savol — shahar haqida (suv toshqini, zilzila, tirbandlik, qurilish, xizmatlar…): imlo/eshitish xatolarini tuzat, maʼnoni OʻZGARTIRMA. Katalogdagi oʻxshash savol berilgan boʻlsa va gap shuni nazarda tutsa — oʻsha savol matnini ol.
4) Maʼnosiz yoki tushunarsiz gap (“men namazaman”, tasodifiy soʻzlar) — unclear. Taxmin qilib savol uydirma.
5) Hozirgi boʻlim va oldingi buyruq berilgan: kontekstga qara.
6) Agar foydalanuvchi ekrandagi biror tugma/maydon/roʻyxat bandini bosish, ochish, yoqish/oʻchirish, tanlash, matn yozish yoki bir necha qadamli ish soʻrasa — "act": steps ichida qadamlar: {"a":"click","id":N} (N — «Ekrandagi elementlar» roʻyxatidagi raqam), {"a":"type","id":N,"text":"...","enter":true}, {"a":"select","id":N,"v":"..."}, {"a":"scroll","dir":"down|up"}, {"a":"cmd","k":"<buyruq kaliti>"}, {"a":"place","n":"<joy>"}, {"a":"street","n":"<koʻcha>"}, {"a":"ask","text":"<savol>"}, {"a":"wait","ms":600}. Faqat roʻyxatdagi elementlarni ishlat, raqamni uydirma. Oddiy buyruq (cmd) yoki savol (q) yetarli boʻlsa act ishlatma. Qadamlar 1–6 ta. Bosgandan keyin yangi element chiqishi kerak boʻlsa (menyu/dialog ochiladi) va davomi kerak boʻlsa "more":true qoʻy — yangi ekran suratini berib davom ettiramiz.
7) Tozalash/oʻchirish/reset tugmalarini bosma.
7b) Foydalanuvchi shaharning istalgan koʻcha/joy/bino/obyektini koʻrsatishni soʻrasa va u nomzodlar roʻyxatida YOʻQ boʻlsa — {"t":"geo","q":"nom"} (act ichida: {"a":"geo","q":"nom"}); nomni lotin yoki kirillda toʻgʻri yoz. Nomzodlarda aniq mos nom boʻlsa — place/street.
7a) Sayt imkoniyatlari (hammasini ovoz bilan bajar): Muammolar boʻlimida roʻyxat qatorlari (har bir qator — tugma): bosilsa muammo ochiladi; ochilgan muammoda “yechim”, “rasm”, “xaritada koʻrsat”, “hal qilish yoʻli” tugmalari bor — foydalanuvchi “shu muammoni hal qil/yechimini koʻrsat” desa shu tugmalarni bos (kerak boʻlsa avval qatorni och, more:true). “Birinchi/eng xavfli muammo” — roʻyxatdagi birinchi qator. Xarita boʻlimi: koʻcha/hudud tahlili; 3D egizak: savol (ask) orqali zilzila/suv/yongʻin tahlili; Hisobot: brifing/aniqlik tugmalari; Sozlamalar: katakchalar. Roʻyxat ekranga sigʻmasa — scroll. Noaniq boʻlsa eng mantiqiy birinchi qadamni qil.
8) Hazil, salomlashish, minnatdorchilik kabi ishga aloqasiz gap — "chat" (qisqa, iliq javob). Ishga oid boʻlsa avval ishni bajar.
9) “bitta/ozgina yaqinlashtir”, “endi uzoqlashtir” — cmd zoomin/zoomout; “3D real koʻcha”ga oborish — cmd scan3d. Joy/koʻcha nomini nomzodlardan tanla.`;
  // Ovoz bevosita AI ga (Worker /voice): audio + sayt konteksti → shu JSON, matnga oʻgirish alohida bosqich emas
  async function voiceAudio(blob, list, extra) {
    const wav = await NX.voice.toWav(blob), base = ((window.CITYJAM_KEYS && window.CITYJAM_KEYS.aiProxy) || '').trim().replace(/\/+$/, '');
    const msg = voiceMsg(list, extra) + '\n\nAUDIO ham berilgan: foydalanuvchining oʻzbekcha gapini oʻzing tingla (matn variantlari xato boʻlishi mumkin). JSONga "heard" maydoni qoʻsh — eshitgan gapingni lotin yozuvida.';
    const r = await NX.fetchJSON(base + '/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: wav, sys: VRES_SYS, msg }) }, 20000);
    if (!r.ok || !r.data || r.data.error) return null;
    const m = String(r.data.text || '').match(/\{[\s\S]*\}/); if (!m) return null;
    try { const j = JSON.parse(m[0]); if (j.t === 'cmd' && !VRES_CMDS[j.k]) return null; if (j.t === 'act' && !Array.isArray(j.steps)) return null; return j; } catch (e) { return null; }
  }
  function voiceMsg(list, x0) {
    const x = x0 || {};
    return 'Variantlar:\n' + list.slice(0, 3).map((q, i) => (i + 1) + ') ' + q).join('\n') + '\n\nHozirgi boʻlim: ' + (x.tab || '?') + (x.state ? '\nHolat: ' + x.state : '') + (x.prev ? '\nOldingi buyruq: ' + x.prev : '') + ((x.hist || []).length ? '\nOxirgi gaplar: ' + x.hist.join(' | ') : '') +
      '\n\nBuyruqlar:\n' + Object.keys(VRES_CMDS).map(k => k + ' — ' + VRES_CMDS[k]).join('\n') +
      '\n\nJoy nomzodlari: ' + JSON.stringify(x.places || []) + '\nKoʻcha nomzodlari: ' + JSON.stringify(x.streets || []) + '\nKatalog savollari (oʻxshash): ' + JSON.stringify(x.questions || []);
  }
  async function voiceResolve(list, extra) {
    const msg = voiceMsg(list, extra);
    const r = await callOpenAI(userKey(), null, null, null, [{ role: 'system', content: VRES_SYS }, { role: 'user', content: msg }], NX.config.openaiLight, 'router');
    const m = String(r.text || '').match(/\{[\s\S]*\}/); if (!m) return null;
    try { const j = JSON.parse(m[0]); if (j.t === 'cmd' && !VRES_CMDS[j.k]) return null; if (j.t === 'act' && !Array.isArray(j.steps)) return null; return j; } catch (e) { return null; }
  }
  async function route(q, prevQ) {
    if (!aiAvailable()) return null;
    const r = await callOpenAI(userKey(), null, null, null, [{ role: 'system', content: ROUTER }, { role: 'user', content: (prevQ ? `Oldingi savol: ${prevQ}\n` : '') + `Savol: ${q}` }], NX.config.openaiLight, 'router');
    const w = (r.text || '').toLowerCase().match(/[a-z]+/);
    return w && ROUTE_TYPES.includes(w[0]) && w[0] !== 'general' ? w[0] : null;
  }
  async function twinAsk(q, facts, history) {
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1500) }));
    const messages = [{ role: 'system', content: TWIN }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) }]);
    const r = await callOpenAI(userKey(), null, null, null, messages, NX.config.openaiDeep, 'twin');
    return verify(q, facts, { text: r.text, src: 'ai' });
  }

  // Chatdan rasm: savol + natijalar → rasm modeli uchun inglizcha tavsif → rasm (3D koʻrinish asos boʻlishi mumkin)
  const IMG_PROMPT = `You write prompts for an image generation model. Input: an Uzbek request from city officials of Samarkand, Uzbekistan, plus analysis facts (JSON).
Write ONE English prompt (max 120 words) for a photorealistic image that shows exactly what is asked, using the concrete facts (street names are context only — do not render text).
If a base image is provided it is a real 3D view of the city: say "Edit the provided 3D city view: keep the same buildings, streets and camera angle" and describe only the changes (e.g. flood water depth in streets, new building, traffic lights).
No text, no labels, no logos. Output only the prompt.`;
  async function chatImage(q, facts, baseImg) {
    if (!(await proxyReady())) throw new Error(OLD_WORKER);
    const r = await callOpenAI(userKey(), null, null, null, [{ role: 'system', content: IMG_PROMPT }, { role: 'user', content: `Soʻrov: ${q}\nAsos rasm: ${baseImg ? 'bor (3D koʻrinish)' : 'yoʻq'}\nFaktlar: ${JSON.stringify(facts).slice(0, 6000)}` }], NX.config.openaiLight, 'imgprompt');
    const prompt = r.text.trim().slice(0, 1500);
    const body = baseImg && proxyV >= 4 ? { prompt, plan: baseImg, quality: 'medium' } : { prompt };
    const res = await NX.fetchJSON(proxyUrl() + '/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 240000);
    if (res.ok && res.data && res.data.b64) return { src: 'data:image/png;base64,' + res.data.b64, edited: !!res.data.edited };
    const e = res.data && res.data.error;
    throw new Error(res.status === 429 ? ((e && e.message) || 'Rasm limiti tugadi.') : 'Rasm chizilmadi: ' + ((e && e.message) || 'HTTP ' + res.status));
  }

  // Erkin internet qidiruvi (koʻcha yoki hudud boʻyicha)
  async function webSearchQ(q, context) {
    if (!proxyUrl()) {
      const key = userKey(); if (!key) return null;
      const r = await NX.fetchJSON('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ model: 'gpt-5.4-mini', input: q + '\n\n' + String(context || '').slice(0, 2500), tools: [{ type: 'web_search' }], reasoning: { effort: 'low' } }) }, 90000);
      if (!r.ok || !r.data) return null;
      let text = ''; const sources = [];
      (r.data.output || []).forEach(o => (o.content || []).forEach(c => { if (c.type === 'output_text') { text += c.text; (c.annotations || []).forEach(a => a.url && !sources.some(x => x.url === a.url) && sources.push({ url: a.url, title: a.title || a.url })); } }));
      return { text, sources };
    }
    if (!(await proxyReady())) return null;
    const r = await NX.fetchJSON(proxyUrl() + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, context: String(context || '').slice(0, 2500) }) }, 90000);
    return r.ok && r.data ? { text: r.data.text || '', sources: r.data.sources || [] } : null;
  }

  async function areaAsk(q, A, history, extra) {
    const facts = areaFacts(A, extra);
    const local = () => {
      // “Nima qursam foydali” — xizmatlar qamrovi meʼyorga nisbatan (hisob natijasi)
      if (A.needs && A.needs.list && A.needs.list.length && (NX.area.NEED_Q.test(q) || !A.res)) {
        const L = A.needs.list.slice().sort((a, b) => (b.yetishmovchilik || 0) - (a.yetishmovchilik || 0));
        const bad = L.filter(x => (x.qamrov_foiz ?? 100) < 80).slice(0, 4), okL = L.filter(x => (x.qamrov_foiz ?? 0) >= 80);
        const site = n => { const m = (A.match || []).find(z => z.need === n && z.site); return m ? ` — mos joy: ${m.site.id} (${NX.fmt.int(m.site.maydon_m2)} m²)` : ''; };
        return [bad.length ? `**Eng kerakli — ${bad[0].uz}:** uylarning ${bad[0].qamrov_foiz}% i ${bad[0].meyor_radius_m} m meʼyorida${bad[0].kerak_orin ? `, ~${NX.fmt.int(bad[0].kerak_orin)} ${bad[0].birlik || ''} kerak` : ''}.` : '**Hududda asosiy xizmatlar meʼyor ichida.**',
          bad.length ? `**Nima yetishmaydi**\n${bad.map(x => `- ${x.uz}: qamrov ${x.qamrov_foiz}% (meʼyor ${x.meyor_radius_m} m)${x.eng_yaqini ? `, eng yaqini ${NX.fmt.int(x.eng_yaqini.m)} m — ${x.eng_yaqini.nomi || 'nomsiz'}` : ''}${site(x)}`).join('\n')}` : '',
          okL.length ? `**Yetarli:** ${okL.map(x => x.uz).join(', ')}.` : '',
          'Obyektlar ochiq xaritadan (OSM) — chizilmaganlari boʻlishi mumkin; yer egaligi va mavjud sigʻimni tegishli boʻlimdan tasdiqlang.'].filter(Boolean).join('\n\n');
      }
      if (!A.res) {
        const h = facts.hudud_osm, m = Object.keys(h.muammolar);
        return [`**Hozir:** ${h.maydon_ga} ga, ${h.koʻcha_km} km koʻcha, ${h.bekatlar_ichida} ta bekat, ${h.svetoforlar} ta svetofor, ${h.maktab_bogcha_ichida} ta maktab/bogʻcha.`,
          m.length ? `**Muammolar:** ${m.map(k => `${k} — ${h.muammolar[k]} ta`).join('; ')}.` : 'Avtomatik topilgan muammo yoʻq.',
          'Bino taʼsirini bilish uchun yozing, masalan: “500 xonadonli 9 qavatli dom qursam?”'].join('\n\n');
      }
      const ev = A.res.ev, sec = (t, a) => (a.length ? `**${t}**\n${a.map(x => '- ' + x).join('\n')}` : '');
      return [sec('Yutuqlar', ev.pros), sec('Muammolar', ev.cons), sec('Nima qilish kerak', ev.todo), sec('Kelajakda (5 yil)', ev.future)].filter(Boolean).join('\n\n');
    };
    if (!aiAvailable()) return { text: local(), src: 'hisob', error: 'AI ulanmagan.' };
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1200) }));
    const messages = [{ role: 'system', content: AREA }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) }]);
    try { const r = await callOpenAI(userKey(), null, null, null, messages); return await verify(q, facts, { text: r.text, src: 'ai' }); }
    catch (e) { return { text: local(), src: 'hisob', error: e.message }; }
  }

  // Xaritada chizilgan koʻcha: UNESCO, bosh reja, binolar, tarmoq hisobi + internet → har taraflama xulosa
  const ROAD = `Sen Samarqand shahar hokimligi uchun shaharsozlik, transport va madaniy meros ekspertisan. Senga xaritada chizilgan yangi koʻcha (yoki mavjud koʻchani kengaytirish) boʻyicha saytning hisobi beriladi: har bir boʻlak qaysi UNESCO muhofaza zonasida va bosh rejaning qaysi zonasida, holati, buziladigan binolar, yaqin yodgorliklar, tarmoqqa ulanish, mavjud yoʻllar bilan solishtirish, qoidalar; baʼzan internetdagi maʼlumot.
Oʻzbek tilida (lotin), aniq va qisqa yoz.
Tuzilma:
1-qator: **Xulosa:** ✅ Mumkin / 🟡 Shartli / ⚠️ Kelishuv kerak / ⛔ Mumkin emas — va eng asosiy sabab bir gap bilan.
**Nega** — har bir sabab: qaysi metrlar (masalan “120–340 m”), qaysi zona, qaysi qoida (VM 119-son qarori, 265-son nizom, bosh reja loyihasi). Xaritada qizil — mumkin emas, toʻq sariq — kelishuv, sariq — shartli, yashil — mumkin.
**Nima beradi** — yoʻl qisqarishi, ulanish, qaysi koʻchalarni bogʻlaydi.
**Narxi va taʼsiri** — buziladigan binolar soni va maydoni, yodgorliklar, aholi.
**Muqobil** — mumkin boʻlmasa: xaritadagi yashil punktir (mavjud koʻchalar orqali) yoki qizil zonalarni aylanib oʻtish; konservatsiya va UNESCO hududidan tashqari.
**Keyingi qadamlar** — 2–4 ta aniq ish.
- Faqat berilgan raqamlardan foydalan; yoʻq narsani oʻylab topma. Bosh rejaga yoki UNESCO talablariga zid tavsiya berma.
- “internet” berilgan boʻlsa — tegishlisini qisqa ayt (qaysi manbada nima deyilgan).
- JSON, model, hisob usuli haqida yozma.
${MAPRULE}`;
  async function roadAsk(q, facts, history, extra) {
    const local = () => NX.roadcheck.summary(facts._R);
    const F = Object.assign({}, facts); delete F._R;
    if (extra && extra.internet) F.internet = extra.internet;
    if (!aiAvailable()) return { text: local(), src: 'hisob', error: 'AI ulanmagan.' };
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1200) }));
    const messages = [{ role: 'system', content: ROAD }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(F) }]);
    try { const r = await callOpenAI(userKey(), null, null, null, messages); return { text: r.text, src: 'ai' }; }
    catch (e) { return { text: local(), src: 'hisob', error: e.message }; }
  }
  // Bosh reja / UNESCO savoli (joy boʻyicha yoki butun shahar)
  const PLANQ = `Sen Samarqand shahar hokimligi uchun shaharsozlik va madaniy meros ekspertisan. Senga Samarqand bosh rejasi 2045 (loyiha) koʻrsatkichlari, zonalar qoidalari, UNESCO muhofaza zonalari (Temuriylar qismi, Yevropa qismi, Afrosiyob, bufer) va — joy aytilgan boʻlsa — shu joyning tekshiruvi (zona, ziddiyatlar, qoidalar) beriladi; baʼzan internetdagi maʼlumot.
Oʻzbek tilida (lotin), aniq yoz. 1-qator — savolga toʻgʻridan-toʻgʻri javob (mumkin / mumkin emas / kelishuv kerak) va sababi. Keyin **Xaritada** — qaysi zona qayerda (rangi bilan: sariq — konservatsiya, toʻq sariq — rekonstruksiya, binafsha — renovatsiya; UNESCO: pushti — Temuriylar qismi, koʻk — Yevropa qismi, toʻq sariq — Afrosiyob, sariq — bufer). **Qoidalar** — tegishli qoidalar qisqa. **Nima qilish kerak** — 2–3 qadam.
Faqat berilgan maʼlumotdan foydalan; yoʻq raqamni (masalan aniq qavat cheklovi) oʻylab topma — boʻlmasa “ochiq hujjatlarda yoʻq, Madaniy meros agentligi / hokimiyatdan soʻrash kerak” de. Bosh rejaga zid tavsiya berma. JSON va usul haqida yozma.`;
  async function planAsk(q, facts, history, localText) {
    if (!aiAvailable()) return { text: localText, src: 'hisob', error: 'AI ulanmagan.' };
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1200) }));
    const messages = [{ role: 'system', content: PLANQ }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) }]);
    try { const r = await callOpenAI(userKey(), null, null, null, messages); return { text: r.text, src: 'ai' }; }
    catch (e) { return { text: localText, src: 'hisob', error: e.message }; }
  }

  NX.ai = { checkNums, verify, trafficAsk, factsAsk, voiceIntent, voiceResolve, voiceAudio, feedback, loadLessons, route, streetVision, roadAsk, planAsk, ask, available: aiAvailable, detectStreets, detectScenario, render, vision, webcamCheck, photoCheck, photoChecksAll, proxyReady, webSearch, webSearchQ, deepAsk, twinAsk, chatImage, systemsFacts, solutionImage, areaAsk, areaFacts, _core: core };
})();
