/* NEXUS Transport — AI tahlilchi: savoldan koʻcha va stsenariyni aniqlash, simulyatsiya, OpenAI javobi */
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

  const SYSTEM = `Siz Samarqand shahri transport tahlilchisisiz. Faqat oʻzbek tilida (lotin yozuvi, oʻ/gʻ/ʼ belgilari bilan) javob bering.
Qoidalar:
- Faqat foydalanuvchi bergan JSON dagi raqam va faktlardan foydalaning. Hech qanday maʼlumot, raqam yoki koʻcha nomini oʻylab topmang.
- Maʼlumot yetishmasa, buni ochiq ayting.
- Bashorat va hisob natijalarini oʻlchov deb atamang: ular "model bashorati" yoki "taxmin".
- Javob tuzilishi aynan shunday boʻlsin (qalin sarlavhalar bilan):
**Hozirgi holat**
**Nima boʻladi** (qaysi koʻchalar va avtobus liniyalari taʼsirlanadi)
**Xavflar**
**Eng yaxshi yechim** (1–3 ta aniq qadam)
- Hajmi 120–220 soʻz.`;

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
    const row = x => ({ koʻcha: x.name || 'nomsiz yoʻl', hajm_oldin: Math.round(x.baseVol), hajm_keyin: Math.round(x.scenVol), vc_oldin: +x.baseVC.toFixed(2), vc_keyin: +x.scenVC.toFixed(2) });
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

  async function callOpenAI(key, ctx, onModel) {
    let lastErr = null;
    for (const model of NX.config.openaiModels) {
      onModel && onModel(model);
      const body = { model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Savol: ' + ctx.savol + '\n\nMaʼlumotlar (JSON):\n' + JSON.stringify(ctx) }] };
      if (/^gpt-5/.test(model)) { body.max_completion_tokens = 2500; body.reasoning_effort = 'low'; } else { body.max_completion_tokens = 900; body.temperature = 0.3; }
      let r;
      try {
        r = await NX.fetchJSON(NX.config.openaiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) }, 60000);
      } catch (e) { throw new Error(e.timeout ? 'OpenAI javob bermadi (vaqt tugadi). Qayta urinib koʻring.' : 'OpenAI serveriga ulanib boʻlmadi. Internet aloqasini tekshiring.'); }
      const err = r.data && r.data.error;
      if (r.ok && r.data && r.data.choices && r.data.choices[0]) {
        const text = (r.data.choices[0].message && r.data.choices[0].message.content) || '';
        if (text.trim()) return { text, model };
        lastErr = new Error('Model boʻsh javob qaytardi.');
        continue;
      }
      const code = err && (err.code || err.type);
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
  function localAnswer(ctx) {
    const s = ctx.koʻcha, sim = ctx.simulyatsiya, lines = [];
    if (!s) {
      const k = ctx.umumiy;
      return `**Hozirgi holat**\nHudud boʻyicha: ${k.liniyalar} ta avtobus liniyasi, bekat qamrovi ${NX.fmt.pct(k.bekat_qamrovi_foiz)}, svetoforsiz yirik chorrahalar: ${k.svetoforsiz_chorrahalar} ta.\n\n**Nima boʻladi**\nSavolda koʻcha nomi aniqlanmadi, shuning uchun simulyatsiya ishga tushmadi. Koʻcha nomini va oʻzgarishni yozing (masalan, “… koʻchasini bir tomonlama qilsak”).\n\n**Xavflar**\n—\n\n**Eng yaxshi yechim**\n1. Xaritada koʻchani tanlab “Agar…?” vositasidan foydalaning.`;
    }
    lines.push('**Hozirgi holat**');
    lines.push(`${s.nomi}: ${s.turi.toLowerCase()}, ${NX.fmt.km(s.uzunlik_m)}, ${s.harakat}. Avtobus liniyalari: ${s.avtobus_liniyalari.length ? s.avtobus_liniyalari.join(', ') : 'yoʻq'}; bekatlar: ${s.bekatlar_soni}, svetoforlar: ${s.svetoforlar}. Tirbandlik xavfi (taxmin): ${s.tirbandlik_xavfi_hisob_0_100}/100.` + (s.tomtom && s.tomtom.tirbandlik_foiz != null ? ` TomTom: ${s.tomtom.tirbandlik_foiz}% (${s.tomtom.vaqt}).` : ''));
    lines.push('', '**Nima boʻladi**');
    if (sim) {
      lines.push(`Model bashorati (${sim.stsenariy}): umumiy yoʻl vaqti ${NX.fmt.signed(sim.umumiy_yol_vaqti_ozgarishi_foiz, 1)}%.`);
      sim.eng_kop_taʼsirlangan_koʻchalar.slice(0, 4).forEach(r => lines.push(`- ${r.koʻcha}: ${r.hajm_oldin} → ${r.hajm_keyin} avto/soat (V/C ${r.vc_oldin} → ${r.vc_keyin})`));
      if (sim.yonalishi_ozgarishi_kerak_liniyalar.length) lines.push(`Yoʻnalishi oʻzgarishi kerak boʻlgan liniyalar: ${sim.yonalishi_ozgarishi_kerak_liniyalar.join(', ')}.`);
    } else lines.push('Savolda oʻzgarish turi aniqlanmadi — simulyatsiya ishga tushmadi.');
    lines.push('', '**Xavflar**');
    if (sim && sim.yangi_haddan_oshgan_koʻchalar.length) lines.push(`Sigʻimidan oshadigan koʻchalar: ${sim.yangi_haddan_oshgan_koʻchalar.join(', ')}.`);
    if (sim) sim.sabablar.forEach(r => lines.push('- ' + r)); else lines.push('—');
    lines.push('', '**Eng yaxshi yechim**');
    lines.push(sim ? `Xulosa: ${sim.xulosa}. 1. Chorrahalarda transport sanogʻini oʻtkazib modelni kalibrlang. 2. Oʻzgarishni avval sinov rejimida joriy qiling.` : '1. Xaritada koʻchani tanlab “Agar…?” vositasida stsenariy tanlang.');
    return lines.join('\n');
  }

  async function ask(q, M, opts) {
    const found = detectStreets(q, M);
    const scen = detectScenario(q);
    // Savolda koʻcha nomi boʻlmasa — panelda tanlangan koʻcha olinadi
    const street = found.length ? found[0].s : opts.defaultStreet || null;
    let sim = null;
    if (street && scen) sim = await opts.simulate(street, scen);
    const ctx = {
      savol: q, hudud: 'Samarqand tarixiy markazi (39.640–39.670 N, 66.950–67.000 E)',
      koʻcha: street ? streetFacts(street, M) : null,
      ikkinchi_koʻcha: found[1] ? streetFacts(found[1].s, M) : null,
      bashorat: street ? forecastFacts(street) : null,
      simulyatsiya: simFacts(sim, M),
      umumiy: { liniyalar: M.kpi.lines, bekat_qamrovi_foiz: M.kpi.coverage != null ? Math.round(M.kpi.coverage) : null, svetoforsiz_chorrahalar: M.kpi.unsignalised, transport_indeksi: M.index.value, tomtom_olchangan_koʻchalar: M.kpi.measured },
      manbalar: 'OpenStreetMap (koʻchalar, bekatlar), TomTom (agar oʻlchangan boʻlsa), Hisob/Bashorat (model)',
    };
    const key = (NX.store.get('key:openai', '') || '').trim();
    const meta = { street, scen, sim, found };
    if (!key) return Object.assign({ text: localAnswer(ctx), src: 'hisob', note: 'OpenAI kaliti kiritilmagan — javob hisoblangan raqamlardan avtomatik tuzildi.' }, meta);
    try {
      const r = await callOpenAI(key, ctx, opts.onModel);
      return Object.assign({ text: r.text, src: 'ai', model: r.model }, meta);
    } catch (e) {
      return Object.assign({ text: localAnswer(ctx), src: 'hisob', error: e.message }, meta);
    }
  }

  // **qalin** va qatorlarni xavfsiz HTML ga aylantirish
  function render(text) {
    return NX.esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  NX.ai = { ask, detectStreets, detectScenario, render, _core: core };
})();
