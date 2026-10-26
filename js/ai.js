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
- Agar savol “koʻchani oʻzgartirsak nima boʻladi?” turida boʻlsa va JSON’da “simulyatsiya” berilgan boʻlsa:
  avval bir gapda xulosa, keyin qaysi koʻchalar koʻproq yuklanadi va qaysi avtobuslarga taʼsir qiladi, oxirida 1–2 ta amaliy maslahat.`;

  function streetFacts(s, M) {
    return {
      nomi: s.name, turi: NX.HW[s.hw].uz, uzunlik_m: Math.round(s.length),
      harakat: s.oneway === 'yes' ? 'bir tomonlama' : s.oneway === 'mixed' ? 'qisman bir tomonlama' : 'ikki tomonlama',
      polosalar_osm: s.lanes || null, polosa_bir_tomonga_hisob: s.lanesPerDir, tezlik_chegarasi_kmh: s.maxspeed || null,
      avtobus_liniyalari: s.busRefs, bekatlar_soni: s.stops.length, svetoforlar: s.signals.length, piyoda_otishlar: s.crossings.length,
      yaqin_maktab_bogcha: s.schools.length, tirbandlik_xavfi_hisob_0_100: s.risk.value,
      tomtom: s.tomtom ? { joriy_tezlik_kmh: Math.round(s.tomtom.currentSpeed), erkin_tezlik_kmh: Math.round(s.tomtom.freeFlowSpeed), tirbandlik_foiz: Math.round(s.tomtom.congestion), vaqt: NX.fmt.time(s.tomtom.ts) } : 'oʻlchanmagan',
    };
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

  async function callOpenAI(key, ctx, onModel, history) {
    let lastErr = null;
    for (const model of NX.config.openaiModels) {
      onModel && onModel(model);
      // Oldingi bitta savol-javob ham beriladi — “u-chi?” kabi davomli savollar tushunilishi uchun
      const prev = (history || []).slice(-2).map(m => ({ role: m.role, content: String(m.content).slice(0, 1200) }));
      const body = { model, messages: [{ role: 'system', content: SYSTEM }].concat(prev, [{ role: 'user', content: 'Savol: ' + ctx.savol + '\n\nSayt maʼlumotlari (JSON):\n' + JSON.stringify(ctx) }]) };
      if (/^gpt-5/.test(model)) { body.max_completion_tokens = 2500; body.reasoning_effort = 'low'; } else { body.max_completion_tokens = 900; body.temperature = 0.3; }
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
      if (r.status === 404 || code === 'model_not_found' || (r.status === 400 && /model/i.test((err && err.message) || ''))) { lastErr = new Error(`“${model}” modeli mavjud emas.`); continue; }
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
      hozirgi_tirbandlik: fresh.slice(0, 10).map(s => ({ koʻcha: s.name || 'nomsiz', tezlik_kmh: Math.round(s.tomtom.currentSpeed), odatdagi_kmh: Math.round(s.tomtom.freeFlowSpeed), tirbandlik_foiz: Math.round(s.tomtom.congestion), manba: 'TomTom (real)' })),
      muammolar: Object.keys(groups).map(t => ({ turi: NX.PROBLEM[t].short, soni: groups[t].length, misollar: groups[t].slice(0, 3), yechim: NX.PROBLEM[t].fix })),
      avtobus_liniyalari: [...lines.values()].slice(0, 25),
      umumiy: { liniyalar_soni: M.kpi.lines, bekat_400m_qamrovi_foiz: M.kpi.coverage != null ? Math.round(M.kpi.coverage) : null, svetoforsiz_katta_chorrahalar: M.kpi.unsignalised, maktab_bogcha: M.kpi.schools },
    };
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
      koʻcha: street ? streetFacts(street, M) : null,
      ikkinchi_koʻcha: found[1] ? streetFacts(found[1].s, M) : null,
      odatdagi_tirbandlik_taxmini: street ? forecastFacts(street) : null,
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
    return NX.esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  NX.ai = { ask, available: aiAvailable, detectStreets, detectScenario, render, _core: core };
})();
