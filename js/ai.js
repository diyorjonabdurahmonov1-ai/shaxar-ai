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
  Kerakli maʼlumot boʻlmasa, “Bu haqda saytda maʼlumot yoʻq” deb ayt va saytning qaysi boʻlimida koʻrish mumkinligini qisqa ayt.
- “real” (TomTom yoki Open-Meteo oʻlchovi) va “taxmin”ni (model hisobi) farqla: taxminni oʻlchov deb atama.
- Odatda 2–6 gap yetarli. Roʻyxat kerak boʻlsa — qisqa nuqtalar bilan.
- Sen hokimiyat va shahar xizmatlari xodimlari bilan gaplashyapsan: aniq, amaliy, qaror qabul qilishga yordam beradigan javob ber.
- Agar savol “koʻchani oʻzgartirsak nima boʻladi?” turida boʻlsa va JSON’da “simulyatsiya” berilgan boʻlsa:
  avval bir gapda xulosa, keyin qaysi koʻchalar koʻproq yuklanadi (ular xaritada qizil koʻrsatilgan) va qaysi avtobuslarga taʼsir qiladi, keyin 1–2 ta amaliy maslahat.
- Agar koʻchada “tanlangan_qism” berilgan boʻlsa — gap butun koʻcha emas, faqat shu qism (qayerdan–qayergacha) haqida; javobda buni aniq ayt va “qismdagi_muammolar”ga tayan.
- Agar savol “bu koʻchani nima qilish kerak?” turida boʻlsa — koʻchaning “muammolar” roʻyxati va yechimlariga tayan, ustuvorlik tartibida ayt.
- Mos boʻlsa, javob oxirida “Kelajakda:” deb bitta gap yoz: transport oqimi oshsa (masalan, turistik mavsumda) qaysi joy birinchi boʻlib tirband boʻlishi mumkin — faqat “sigim_toʻlishi” raqamlariga tayanib.`;

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
  async function callOpenAI(key, ctx, onModel, history, messages, models, cacheKey) {
    let lastErr = null;
    const bad = badModels(), list = (models || NX.config.openaiModels).filter(m => !bad[m]);
    for (const model of (list.length ? list : NX.config.openaiModels)) {
      onModel && onModel(model);
      // Oldingi bitta savol-javob ham beriladi — “u-chi?” kabi davomli savollar tushunilishi uchun
      const prev = (history || []).slice(-2).map(m => ({ role: m.role, content: String(m.content).slice(0, 1200) }));
      const body = { model, messages: messages || [{ role: 'system', content: SYSTEM }].concat(prev, [{ role: 'user', content: 'Savol: ' + ctx.savol + '\n\nSayt maʼlumotlari (JSON):\n' + JSON.stringify(ctx) }]) };
      if (/^gpt-[56]/.test(model)) { body.max_completion_tokens = 2500; body.reasoning_effort = 'low'; } else { body.max_completion_tokens = 900; body.temperature = 0.3; }
      // Prompt caching: oʻzgarmas qism (system) boshida turadi; bir xil turdagi soʻrovlar bitta kalit bilan — takroriy kirish arzonroq
      body.prompt_cache_key = 'cityjam-' + (cacheKey || 'chat');
      let r;
      try {
        r = key
          ? await NX.fetchJSON(NX.config.openaiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) }, 60000)
          : await NX.fetchJSON(proxyUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 60000);
      } catch (e) { throw new Error(e.timeout ? 'OpenAI javob bermadi (vaqt tugadi). Qayta urinib koʻring.' : 'OpenAI serveriga ulanib boʻlmadi. Internet aloqasini tekshiring.'); }
      const err = r.data && r.data.error;
      if (r.ok && r.data && r.data.choices && r.data.choices[0]) {
        const text = (r.data.choices[0].message && r.data.choices[0].message.content) || '';
        if (text.trim()) return { text, model };
        lastErr = new Error('Model boʻsh javob qaytardi.');
        continue;
      }
      const code = err && (err.code || err.type);
      if (code === 'proxy_rate_limit') throw new Error('Bir soatda juda koʻp savol berildi. Birozdan keyin qayta urinib koʻring.');
      if (code === 'forbidden_origin' || code === 'no_server_key') throw new Error('AI xizmati hozircha sozlanmagan.');
      if (r.status === 401 && !key) throw new Error('AI xizmati hozircha ishlamayapti (server kaliti notoʻgʻri).');
      if (r.status === 401) throw new Error('OpenAI kaliti notoʻgʻri yoki bekor qilingan. Sozlamalarda kalitni tekshiring.');
      if (code === 'insufficient_quota') throw new Error('OpenAI hisobingizda kredit qolmagan (insufficient_quota). Balansni toʻldiring.');
      if (r.status === 429) throw new Error('OpenAI soʻrovlar limiti oshdi. Birozdan keyin qayta urinib koʻring.');
      if (r.status === 404 || code === 'model_not_found' || (r.status === 400 && /model/i.test((err && err.message) || ''))) { markBad(model); lastErr = new Error(`“${model}” modeli mavjud emas.`); continue; }
      if (r.status === 400 && /reasoning_effort|max_completion_tokens|temperature/.test((err && err.message) || '')) { lastErr = new Error('Parametr mos kelmadi'); continue; }
      lastErr = new Error('OpenAI xatosi: ' + ((err && err.message) || 'HTTP ' + r.status));
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
    if (s) {
      const t = s.tomtom && s.tomtom.tirbandlik_foiz != null ? `Hozir: ${s.tomtom.joriy_tezlik_kmh} km/soat (odatda ${s.tomtom.erkin_tezlik_kmh}).` : 'Hozirgi tirbandligi oʻlchanmagan.';
      return `${s.nomi}: ${s.harakat}, ${NX.fmt.km(s.uzunlik_m)}. Avtobuslar: ${s.avtobus_liniyalari.length ? s.avtobus_liniyalari.join(', ') : 'yoʻq'}. ${t}`;
    }
    if (/tirband|tiqilin|probka/.test(n)) {
      const t = ctx.hozirgi_tirbandlik;
      return t && t.length ? t.slice(0, 5).map(x => `- ${x.koʻcha}: ${x.tezlik_kmh} km/soat (odatda ${x.odatdagi_kmh})`).join('\n') : 'Hozircha oʻlchangan koʻcha yoʻq. Xaritadagi ranglar — real tirbandlik; koʻchani bossangiz, uning tezligi oʻlchanadi.';
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
      return Object.assign({ text: r.text, src: 'ai', model: r.model }, meta);
    } catch (e) {
      return Object.assign({ text: localAnswer(q, ctx), src: 'hisob', error: e.message }, meta);
    }
  }

  // **qalin** va qatorlarni xavfsiz HTML ga aylantirish
  function render(text) {
    return NX.esc(text).replace(/^\s*[-*] /gm, '• ').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
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
  const MAPRULE = `- “nomzod_joylar” berilgan boʻlsa — javobni ALBATTA xaritadagi belgilar bilan bogʻla. Agar tavsiyangizda joy boʻlsa (bogʻcha/maktab qurish, yangi yoʻl ochish, svetofor/belgi qoʻyish, bekat), javobda joyni nomzod raqami bilan ayt (masalan “1-belgi: L2 — 3 200 m² boʻsh yer”) va javob OXIRIDA quyidagi blokni qoʻsh (faqat berilgan id lardan, 1–6 ta):
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
- Saytda yoʻq maʼlumot (maktab sigʻimi, suv, elektr, kanalizatsiya, yer egaligi) kerak boʻlsa — “maʼlumot yoʻq, … dan soʻrash kerak” deb ayt.
- Agar “internet” maʼlumoti berilgan boʻlsa — tegishlisini qisqa, manbasi bilan ayt.
- “ehtiyojlar” berilgan boʻlsa (savol: “bu yerga nima qursam/ochsam foydali”) — dom hisobini YOZMA. Tuzilma:
  1-qator: eng kerakli 1–2 obyekt va asosiy sabab raqam bilan (masalan: “Eng kerakli — bogʻcha: uylarning faqat 20% i 300 m meʼyorda, ~180 oʻrin kerak”).
  **Nima yetishmaydi** — yetishmovchilik balli boʻyicha 3–5 ta: qamrov foizi, eng yaqini qancha uzoqda (nomi bilan), meʼyor radiusi, nechta oʻrin kerak.
  **Qayerga** — “tavsiya_joy” dan: L id va maydoni bilan (xaritada shu raqam). Mos yer yoʻq boʻlsa — buni ochiq ayt va kichik obyekt (dorixona, doʻkon) uchun turar joy 1-qavati yoki pavilyonni tavsiya qil.
  **Yetarli boʻlganlar** — bir qatorda (qamrovi ≥ 80%).
  **Tekshirish kerak** — yer egaligi (kadastr), mavjud maktab/bogʻcha sigʻimi (taʼlim boʻlimi) — bir gapda.
  Sport maydoni, park — mavjud obyekt, ularni “boʻsh yer” dema va ustiga qurishni tavsiya qilma.
${MAPRULE}`;

  function areaFacts(A, extra) {
    const X = extra || {}, st = A.st, R = X.needs ? null : A.res, g = {};
    st.problems.forEach(p => { const k = NX.PROBLEM[p.type].short; g[k] = (g[k] || 0) + 1; });
    const sim = r => r ? { shahar_boʻyicha_yol_vaqti_ozgarishi_foiz: +r.ttChangePct.toFixed(1), koproq_yuklanadigan_koʻchalar: r.affected.filter(x => x.dv > 0 && x.name).slice(0, 6).map(x => ({ koʻcha: x.name, qoʻshimcha_mashina_soat: Math.round(x.dv), toʻlishi_foiz: Math.round(x.scenVC * 100) })), sigmay_qoladigan_koʻchalar: r.overloaded.slice(0, 6).map(x => x.name || 'nomsiz yoʻl'), binodan_yoʻlgacha_m: r.build && r.build.dist } : null;
    return {
      hudud_osm: {
        maydon_ga: +st.areaHa.toFixed(1), koʻchalar: st.streets.filter(s => s.name).slice(0, 10).map(s => s.name), koʻcha_km: +st.streetKm.toFixed(1),
        muammolar: g, bekatlar_ichida: st.stops, bekat_400m_qamrovi_foiz: st.coverage != null ? Math.round(st.coverage) : null,
        eng_yaqin_bekat_m: st.nearestStop && st.nearestStop.d, avtobus_liniyalari_400m: st.lines.slice(0, 12),
        svetoforlar: st.signals, piyoda_otishlar: st.crossings, maktab_bogcha_ichida: st.schoolsIn.length, maktab_bogcha_500m: st.schoolsNear.length, registondan_m: st.distCenter,
      },
      hozirgi_harakat_yandex: A.live && A.live.list && A.live.list.length ? A.live.list.map(r => ({ qayerga: r.name, hozir_daqiqa: Math.round(r.jams / 60), probkasiz_daqiqa: Math.round(r.free / 60), km: +(r.len / 1000).toFixed(1) })) : 'olinmadi',
      shahar_tirbandligi_yandex_ball: X.level != null ? X.level : null,
      qurilish_hisobi: R ? Object.assign({ ishlatilgan_raqamlar: A.A }, R.b) : 'hali hisoblanmagan',
      harakat_hisobi_ertalab: R ? sim(R.sim) : null,
      kelajak_5_yil_oqim_15foiz: R ? sim(R.fut) : null,
      sayt_bahosi: R ? R.ev : null,
      nomzod_joylar: X.cand || null,
      ehtiyojlar: X.needs || null,
      internet: X.internet || null,
      soya_qishda: R && R.shadow ? { soyada_qoladigan_binolar: R.shadow.shaded.length, quyosh: R.shadow.list.filter(s => s.sun.alt > 2).map(s => `${s.label} ${s.hour}:00 — ${Math.round(s.sun.alt)}°`) } : null,
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
  async function deepAsk(q, facts, history) {
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1500) }));
    const messages = [{ role: 'system', content: DEEP }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) }]);
    const r = await callOpenAI(userKey(), null, null, null, messages, NX.config.openaiDeep, 'deep');
    return { text: r.text, src: 'ai', model: r.model };
  }
  // 3D egizak: suv toshqini, zilzila, quyosh — stsenariy natijalari asosida
  const TWIN = `Sen Samarqand shahar hokimiyati uchun favqulodda vaziyatlar va shahar infratuzilmasi boʻyicha bosh tahlilchisan. Javobing rahbariyatga koʻrsatiladi.
Senga beriladi: savol; real maʼlumot (yogʻin prognozi, yillik quyosh nurlanishi — Open-Meteo; relyef — SRTM ~30 m; binolar — OpenStreetMap); stsenariy hisobi (N mm yomgʻir 1 soat ichida yogʻsa: relyef boʻylab oqim yigʻilishi va Manning formulasi bilan qaysi koʻchalarda qancha chuqur suv, nechta bino, qaysi maktab/shifoxona).
Qoidalar:
- Faqat savolga javob ber. 1-qator: aniq xulosa raqam bilan (masalan: “50 mm yomgʻirda ~12 ga suv ostida qoladi, eng xavfli — X koʻchasi, 60 sm gacha”).
- Keyin: **Xavfli joylar** (koʻcha — chuqurlik, uzunlik), **Odamlar va binolar** (nechta bino, qaysi maktab/shifoxona), **Hozir nima qilish kerak** (ariq va kollektorlarni tozalash, nasoslar, ogohlantirish, yoʻl yopish — qayerda), **Uzoq muddatli yechim**.
- Bir nechta stsenariy berilgan boʻlsa — farqini raqamlar bilan solishtir.
- “internet” berilgan boʻlsa (oʻtgan haqiqiy hodisalar) — model natijasini shu real hodisalar bilan solishtir: mos kelgan va kelmagan joylarni ayt, manba bilan.
- “real_hodisalar_oav” berilgan boʻlsa (Samarqandda haqiqatda suv bosgan koʻchalar, OAV): **Real hodisalar bilan solishtirish** — har biri uchun bir qator: koʻcha, sana, model ham koʻrsatdimi. Model koʻrsatmagan joyda sabab odatda ariq/kanal tiqilishi ekanini ayt (xaritada 📰 H belgilar).
- “ariqlar_tiqilgan_holat” berilgan boʻlsa: avval kanalizatsiya ishlaganda (asosiy hisob), keyin ariq va kollektorlar tiqilgan boʻlsa qaysi koʻchalarda suv toʻplanishini ayt — xaritada shu holat koʻrsatilgan.
- Zilzila soʻralsa: “xavf_xaritasi” dagi zonalar va raqamlar asosida javob ber; bino mustahkamligi (material, yil) maʼlumoti yoʻqligini bir gapda ayt. Raqam oʻylab topma.
- “xavf_xaritasi” berilgan boʻlsa — bu koʻcha tarmogʻida hisoblangan va XARITADA CHIZILGAN natija. Javobni shunga qur va id lar bilan ayt (Z1, R1, S1, H1 — xaritadagi belgilar shu nomda):
  • Zilzila: **Eng koʻp zarar koʻrishi mumkin joylar** — Z1…Z6: joy nomi, nechta odam xavf ostida, nega (past paxsa/gʻisht uylar, zichlik, 5+ qavat, maktab/shifoxona).
    **Evakuatsiya rejasi** (“evakuatsiya_rejasi” dan, har bir zona yoki mahalla uchun alohida qator): “Z1 (joy) — 1 200 kishi → R1: X → Y koʻchalari, 650 m, piyoda ~10 daq., hammasi chiqib boʻlishi ~25 daq. → S1 (nomi, sigʻimi). Zaxira: R1z (Z → W koʻchalari, 800 m)”. Agar bir zona ikki joyga boʻlingan boʻlsa (birinchisi toʻlgan) — ikkalasini ham ayt. Sigʻim yetmasa yoki eng tor joy 4 m dan tor boʻlsa — ogohlantir.
    **Birinchi soatda nima qilish kerak** — qisqa, joylar bilan (qaysi yoʻllarni boʻshatish, qayerga tibbiy punkt, qaysi maktab/shifoxonani birinchi tekshirish).
  • Suv toshqini: **Suvdan chiqish** — har bir suvli koʻcha uchun: “X koʻchasi (40 sm) → R1 yoʻli (koʻchalar, N m, ~M daq.) → H1 (nomi, balandligi, necha m yuqori); zaxira R1z”. **Eng baland xavfsiz joylar** — roʻyxat.
- “xizmatlar_xaritasi” berilgan boʻlsa (yongʻin, tez yordam, politsiya): 1-qator — shahar koʻchalarining necha foiziga meʼyor (daqiqa) ichida yetib boriladi. **Uzoq hududlar** — T1…: joy, necha daqiqa, qaysi stansiyadan. **Yoʻl** (Y1 boʻlsa): qaysi stansiyadan, qaysi koʻchalar orqali, necha daqiqa. **Tavsiya** — yangi stansiya/post qayerga kerak (eng uzoq hududlar oraligʻi), yoʻllarni boʻshatish.
- ENG MUHIM: aynan berilgan savolga javob ber. Oldingi javobni takrorlama — har savol uchun yangi hisob berilgan, faqat shuni ishlat.
- “savol_doirasi” = “FAQAT belgilangan hudud” boʻlsa: javob FAQAT shu hudud haqida. 1-qator: hududda nechta odam, nechta bino xavf ostida. Keyin har bir uy guruhi (A1, A2…) uchun: “A1 (~400 kishi) → R1: X → Y koʻchalari, 350 m, ~5 daq. → S1 (nomi, sigʻimi); zaxira R1z”. Butun shahar zonalarini (boshqa Z lar) yozma.
- Maʼlumot qayerdan olinganini, qanday hisoblanganini, manbalar roʻyxatini matnda yozma (ular alohida koʻrsatiladi). Faqat natija va tavsiya.
  • Hisob taxminiy ekanini bir marta ayt (bino materiali/yili yoʻq — qurilish inspeksiyasi va kadastrdan olinsa aniqlashadi). Raqamlarni faqat JSON’dan ol.
- Xaritada nima koʻrsatilganini bir gapda ayt (koʻk — suv; qizil kataklar — xavfli zonalar; yashil chiziqlar — evakuatsiya yoʻllari; yashil belgilar — yigʻilish/baland joylar).
- JSON kalit nomlarini, texnik soʻzlarni yozma. Cheklovlarni faqat bir gapda ayt (relyef ~30 m, kanalizatsiya sigʻimi taxminiy).
- Oʻzbek tilida (lotin), aniq va londa.`;
  async function twinAsk(q, facts, history) {
    const prev = (history || []).slice(-2).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 1500) }));
    const messages = [{ role: 'system', content: TWIN }].concat(prev, [{ role: 'user', content: 'Savol: ' + q + '\n\nMaʼlumot (JSON):\n' + JSON.stringify(facts) }]);
    const r = await callOpenAI(userKey(), null, null, null, messages, NX.config.openaiDeep, 'twin');
    return { text: r.text, src: 'ai' };
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
    try { const r = await callOpenAI(userKey(), null, null, null, messages); return { text: r.text, src: 'ai' }; }
    catch (e) { return { text: local(), src: 'hisob', error: e.message }; }
  }

  NX.ai = { ask, available: aiAvailable, detectStreets, detectScenario, render, vision, webcamCheck, photoCheck, photoChecksAll, proxyReady, webSearch, webSearchQ, deepAsk, twinAsk, chatImage, systemsFacts, solutionImage, areaAsk, areaFacts, _core: core };
})();
