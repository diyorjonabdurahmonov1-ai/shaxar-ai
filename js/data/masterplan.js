/* City Jam — Samarqand bosh rejasi va UNESCO muhofaza hududi: qurilish yoki oʻzgartirish bosh rejaga zid emasmi.
   Manbalar (rasmiy, toʻliq oʻqilgan):
   • “Samarqand shahrining bosh rejasini tasdiqlash toʻgʻrisida” VM qarori loyihasi — regulation.adliya.uz, loyiha 8969:
     2-versiya (jamoatchilik muhokamasi 12–27.05.2026) — zonalar, funksional hududlar, UMN/QMN talablari;
     3-versiya (Adliya vazirligi ekspertizasi, 10.08.2026 da VM ga tasdiqlashga yuborilgan) — yakuniy matn, 1-ilova
     “asosiy yechimlar”, 2-ilova “texnik-iqtisodiy koʻrsatkichlar”. 2026-10-31 holatiga lex.uz’da qabul qilingan qaror yoʻq.
   • VM 2021-yil 3-martdagi 119-son qarori (lex.uz/docs/-5320217): UNESCO hududlari — alohida muhofaza qilinadigan
     tarixiy-madaniy hudud; 9-ilova — “Samarqand” davlat muzey-qoʻriqxonasi qoʻriqlanadigan tegrasi CHEGARASI (xarita).
   • VM 2019-yil 30-martdagi 265-son qarori 9-ilova — qoʻriqlanadigan tegralar nizomi (lex.uz/docs/-4262171), 17–19-bandlar.
   • Prezidentning 2026-yil 10-iyundagi PQ-219-son qarori 24-band va 2-ilova (lex.uz/docs/-8263374) — “eski shahar” 13 koʻchasi.
   Zonalar chegarasi 119-son qaror 9-ilova xaritasidan raqamlashtirildi: xarita OSM/Overture koʻchalari bilan avtomatik
   moslashtirildi (1 piksel ≈ 10.7 m, aniqlik taxminan ±20–30 m). Asosiy hudud 1 137 ga (UNESCO: 1 123 ga),
   bufer zona 1 470 ga (UNESCO 2001: 1 369 ga).
   • Bosh reja zonalari (konservatsiya / rekonstruksiya / renovatsiya) — Davlat shaharsozlik kadastri geoportali
     (dshk.shaffofqurilish.uz, “Bosh rejalar” qatlami, obyekt “Funksiya” maydoni) ekran tasvirlaridan raqamlashtirildi
     (2026-10-31): koʻchalar bilan moslashtirilgan, 15 m katakli rastr `data/masterplan-samarqand.png`, aniqlik ±30 m.
     Jami 28 498 ga (bosh rejada 28 415 ga). Rasmiy GIS fayli “Tizimlar → Bosh reja” orqali yuklansa — u ustun turadi. */
(function () {
  'use strict';
  const NX = window.NX;
  const G = NX.geo;

  const SRC = {
    reja: { title: 'NHH loyihalari portali — loyiha 8969 (Samarqand bosh rejasi)', url: 'https://regulation.adliya.uz/project/8969/29309?contentLang=uz' },
    vm119: { title: 'VM 03.03.2021 119-son qarori (9-ilova — “Samarqand” muzey-qoʻriqxonasi qoʻriqlanadigan tegrasi)', url: 'https://lex.uz/uz/docs/-5320217' },
    vm265: { title: 'VM 30.03.2019 265-son qarori, 9-ilova — qoʻriqlanadigan tegralar nizomi', url: 'https://lex.uz/uz/docs/-4262171' },
    pq219: { title: 'PQ-219 (10.06.2026) — Samarqand “eski shahar” 13 koʻchasi', url: 'https://lex.uz/uz/docs/-8263374' },
    unesco: { title: 'UNESCO — Samarkand, Crossroad of Cultures (603)', url: 'https://whc.unesco.org/en/list/603/' },
  };

  // Bosh reja 2045 — loyiha matnidan (raqamlar 3-versiya, 2-ilova; zonalar va talablar 2-versiya ilovasi)
  const PLAN = {
    nomi: 'Samarqand shahrining 2045-yilgacha boʻlgan davrga moʻljallangan bosh rejasi (VM qarori loyihasi, ID 8969)',
    holati: 'loyiha: jamoatchilik muhokamasi 12–27.05.2026 yakunlangan, Adliya vazirligi ekspertizasidan oʻtgan va 10.08.2026 da VM ga tasdiqlashga yuborilgan; 2026-10-31 holatiga lex.uz’da qabul qilingan qaror yoʻq',
    ishlab_chiquvchi: '“ToshkentboshplanLITI” bosh loyiha instituti; Respublika arxitektura-shaharsozlik kengashi 20.11.2025 (7-son bayon) maʼqullagan',
    bosqichlar: 'birinchi navbat — 2030-yilgacha; hisob davri — 2045-yilgacha',
    aholi: { y2025: 585232, y2045: 1209000, qoshiladigan_qishloqlar: 232502 },
    maydon_ga: { y2025: 11194.2, y2045: 28415 },
    zichlik_kishi_ga: { shahar: [24.7, 25.9], turar_joy: [26.9, 28.1] },
    uy_joy_ming_m2: { y2025: 13760, y2045: 22000, kishi_boshiga_m2: [16, 20] },
    qavatlilik_2045: { '1–2 qavatli yakka uylar': '13 200 ming m² (60%)', '3–5 qavatli': '6 600 ming m² (30%)', '6–9 qavatli': '2 200 ming m² (10%)' },
    maks_qavat_rejada: 9,
    magistral_km: [377, 568],
    yollar: '527 km mavjud; 837 km yangi yoʻl, 160 km kengaytiriladi; 27 ta transport tarmogʻi markazi, yangi tramvay yoʻllari; jamoat transporti ulushi 2045-yilgacha 60% gacha',
    yashil: '9 461 ga mavjud (1 136 ga umumiy foydalanish, 6 960 ga cheklangan, 1 365 ga maxsus); +11 000 ga; shahar atrofida 18 000 ga yashil belbogʻ; jon boshiga 5 → 10 m²',
    ijtimoiy_2045: { bogcha_orin: 77000, maktab_orin: 198000, shifoxona_orin: 9900, mehmonxona_orin: 6600 },
    tarixiy_yodgorliklar_ga: [168.4, 190],
    zonalar: {
      konservatsiya: 'yashil hududlar, suv va yoʻl boʻyi himoya hududlari hamda madaniy meros maydonlari muhofaza qilinadi — qoʻshimcha turar va noturar bino hamda inshootlar qurilishi TAQIQLANADI',
      rekonstruksiya: 'shakllangan hududlar (soʻnggi 5 yilda qurilgan) — zarurat boʻlsa, jamoatchilik fikri asosida; takomillashtiriladigan hududlarda aholi zichligi saqlanadi, dizayn kodi, ijtimoiy obyektlarga ruxsat; zichlashtiriladigan hududlarda infratuzilmani hisobga olib koʻp qavatli qurilishga ruxsat',
      renovatsiya: 'qayta shakllantiriladigan hudud (boʻsh yerlar, sanoat, kam qavatli uylar) — yaroqsiz, zilzilabardosh boʻlmagan binolar oʻrniga master-reja va batafsil rejalashtirish loyihasi asosida; kengaytiriladigan hudud — yangi yerlar bosh rejaga muvofiq oʻzlashtiriladi',
    },
    funksional: ['turar joy', 'jamoat binolari', 'sanoat', 'shahar tarixiy hududi', 'rekreatsiya', 'transport tarmoqlari'],
    turar_joy_guruhlari: ['1 — yakka tartibdagi uylar', '2 — koʻp xonadonli uylar', '3 — yotoqxonalar, davolanish muassasalari, mehmonxonalar, xizmat uylari'],
    talablar: {
      UMN: 'umumiy maydon nisbati = bino umumiy maydoni / hudud maydoni; bosh rejada 0–18 (B = A × UMN, yer osti maydoni kirmaydi)',
      QMN: 'qurilish maydoni nisbati = bino osti maydoni / hudud maydoni; bosh rejada 0–80% (Q = A × QMN/100)',
      qavat: 'oʻrtacha qavatlar soni N = B / Q = UMN / (QMN/100); eng zich hududlarda yangi binolar qavatiga cheklov',
      sanoat: 'sanoat, kommunal va omborxona obyektlarining sanitariya-muhofaza zonasida uy, taʼlim, sogʻliqni saqlash, dam olish, sport obyektlari joylashtirilmaydi',
      rekreatsiya: 'rekreatsiya hududida unga bogʻliq boʻlmagan sanoat, kommunal, omborxona obyektlari qurilmaydi',
      qizil_chiziq: 'koʻchalarning qizil chiziqlari ichidagi yerlarni bosh rejaga zid egallash cheklanadi; yoʻl, sanoat, savdo, rekreatsiya uchun moʻljallangan hududlarda boshqa maqsadda qurilishga yoʻl qoʻyilmaydi',
      tartib: 'har qanday qurilish bosh reja asosida tasdiqlangan master-reja, batafsil rejalashtirish loyihasi yoki qurilish loyihasi bilan; investorlar takliflari viloyat arxitektura-shaharsozlik kengashida kelishiladi',
    },
    unesco: 'Tarixiy markaz va uning muhofaza hududida shaharning tarixiy qiyofasiga taʼsir qiladigan oʻzgartirish kiritilmaydi; ayrim oʻzgarishlar nazarda tutilsa — oldindan YUNESKO bilan oʻrnatilgan tartibda hisobot (merosga taʼsirni baholash) tayyorlanib kelishiladi; bosh reja va unga qoʻshimchalar Madaniy meros agentligi va YUNESKO milliy komissiyasi orqali Umumjahon merosi markazi bilan kelishiladi',
    eski_shahar_kochalari: ['Zargaron', 'Qoʻshhovuz', '8-mart (Namuna)', 'Islom Karimov', 'Koʻkmasjit', 'Imom al-Buxoriy', 'Bibixonim', 'Chorraha', 'Muborak', 'Buxoro', 'Vobkent', 'Akademik Valixoʻjayev', 'Gʻijduvon'],
    manbalar: [SRC.reja, SRC.vm119, SRC.vm265, SRC.pq219, SRC.unesco],
  };

  // “Samarqand” muzey-qoʻriqxonasi qoʻriqlanadigan tegrasi — VM 119-son qaror 9-ilova xaritasidan ([lat, lon])
  const RINGS = {
    chegara: [[39.67592,67.01269],[39.67631,67.00745],[39.67696,67.00632],[39.67772,67.00580],[39.67771,67.00543],[39.67819,67.00516],[39.67857,67.00453],[39.67843,67.00255],[39.67708,67.00234],[39.67640,67.00198],[39.67601,67.00150],[39.67597,66.99951],[39.67887,66.99495],[39.67895,66.99371],[39.67931,66.99258],[39.68095,66.99253],[39.68105,66.99290],[39.68288,66.99285],[39.68491,66.99317],[39.68529,66.98793],[39.68471,66.98783],[39.68441,66.98684],[39.68039,66.98322],[39.67832,66.98080],[39.67429,66.97084],[39.67378,66.96924],[39.67304,66.96566],[39.67244,66.96480],[39.67031,66.96399],[39.66992,66.96363],[39.66988,66.96164],[39.67231,66.95772],[39.67537,66.95105],[39.67569,66.94768],[39.67642,66.94530],[39.67641,66.94443],[39.67475,66.94323],[39.67166,66.94282],[39.67155,66.94258],[39.67107,66.94247],[39.67097,66.94210],[39.67048,66.94198],[39.66912,66.94090],[39.66854,66.94129],[39.66790,66.94268],[39.66558,66.94274],[39.66548,66.94225],[39.66500,66.94214],[39.66489,66.94140],[39.66401,66.94105],[39.66371,66.94056],[39.66265,66.94034],[39.66253,66.93923],[39.66234,66.93923],[39.66214,66.93874],[39.66098,66.93840],[39.66057,66.93704],[39.65650,66.93591],[39.65129,66.93569],[39.64785,66.93678],[39.64766,66.93703],[39.64718,66.93705],[39.64574,66.93771],[39.64566,66.93846],[39.64229,66.93843],[39.64113,66.93821],[39.64008,66.93874],[39.63970,66.93925],[39.63816,66.93929],[39.63708,66.93808],[39.63515,66.93788],[39.63441,66.93964],[39.63338,66.94141],[39.63339,66.94203],[39.63301,66.94217],[39.62976,66.94897],[39.62941,66.95085],[39.62759,66.95102],[39.62661,66.95055],[39.62623,66.95069],[39.62577,66.95717],[39.62558,66.95730],[39.62555,66.96103],[39.62588,66.96300],[39.62627,66.96337],[39.63089,66.96336],[39.63103,66.96572],[39.63084,66.96585],[39.63086,66.96659],[39.63067,66.96672],[39.63068,66.96722],[39.63030,66.96785],[39.62995,66.96948],[39.63189,66.97029],[39.63209,66.97054],[39.63212,66.97215],[39.63317,66.97212],[39.63328,66.97262],[39.63357,66.97286],[39.63569,66.97267],[39.63580,66.97354],[39.63619,66.97390],[39.63640,66.97477],[39.63698,66.97487],[39.63740,66.97673],[39.63862,66.98030],[39.63920,66.98041],[39.63923,66.98177],[39.63952,66.98214],[39.63954,66.98301],[39.63983,66.98312],[39.63984,66.98387],[39.64066,66.98608],[39.64070,66.98832],[39.64022,66.98883],[39.63936,66.98910],[39.63927,66.98960],[39.63969,66.99108],[39.63974,66.99382],[39.63993,66.99393],[39.63994,66.99456],[39.64024,66.99480],[39.64195,66.99375],[39.64359,66.99371],[39.64468,66.99542],[39.64605,66.99637],[39.64634,66.99636],[39.64692,66.99697],[39.64769,66.99695],[39.64780,66.99757],[39.64995,66.99900],[39.65586,67.00070],[39.65865,67.00087],[39.65876,67.00124],[39.65982,67.00145],[39.65996,67.00381],[39.65969,67.00506],[39.65999,67.00555],[39.66144,67.00588],[39.66154,67.00613],[39.66597,67.00576],[39.66627,67.00637],[39.66713,67.00635],[39.66725,67.00746],[39.66744,67.00746],[39.66755,67.00783],[39.66803,67.00781],[39.66833,67.00842],[39.66836,67.01041],[39.66819,67.01116],[39.66886,67.01139],[39.66955,67.01224],[39.67110,67.01232],[39.67123,67.01419],[39.67142,67.01443],[39.67144,67.01530],[39.67250,67.01552],[39.67269,67.01489],[39.67336,67.01475],[39.67400,67.01286],[39.67592,67.01269]],
    temur: [[39.66224,66.99132],[39.66221,66.99020],[39.66163,66.98972],[39.66123,66.98898],[39.66112,66.98824],[39.66126,66.98538],[39.66171,66.98387],[39.66179,66.98275],[39.66198,66.98237],[39.66246,66.98236],[39.66255,66.98211],[39.66303,66.98210],[39.66331,66.98184],[39.66415,66.98008],[39.66463,66.97981],[39.66519,66.97905],[39.66567,66.97904],[39.66624,66.97853],[39.66601,66.97654],[39.66539,66.97445],[39.66401,66.97250],[39.66370,66.97139],[39.66356,66.96903],[39.66374,66.96803],[39.66411,66.96740],[39.66409,66.96653],[39.66379,66.96592],[39.66320,66.96531],[39.66282,66.96520],[39.66153,66.96349],[39.65950,66.96318],[39.65912,66.96344],[39.65913,66.96381],[39.65885,66.96419],[39.65887,66.96543],[39.65917,66.96580],[39.65910,66.96766],[39.65808,66.96931],[39.65618,66.97123],[39.65503,66.97113],[39.65405,66.97042],[39.65357,66.97043],[39.65298,66.97007],[39.65192,66.97010],[39.65182,66.96948],[39.65152,66.96924],[39.65132,66.96863],[39.65129,66.96726],[39.65100,66.96690],[39.65089,66.96628],[39.65010,66.96518],[39.64276,66.95868],[39.64151,66.95884],[39.64095,66.95985],[39.64059,66.96122],[39.64002,66.96186],[39.63919,66.96412],[39.63920,66.96462],[39.63892,66.96500],[39.63894,66.96587],[39.64108,66.96742],[39.64283,66.96800],[39.64313,66.96849],[39.64478,66.96931],[39.64528,66.97004],[39.64539,66.97078],[39.64436,66.97268],[39.64438,66.97367],[39.64458,66.97429],[39.64507,66.97477],[39.64568,66.97625],[39.64571,66.97811],[39.64544,66.97899],[39.64546,66.98035],[39.64658,66.98355],[39.64767,66.98502],[39.64844,66.98524],[39.64914,66.98647],[39.65060,66.98717],[39.65314,66.98934],[39.65509,66.99028],[39.65645,66.99123],[39.65742,66.99145],[39.65820,66.99205],[39.66128,66.99184],[39.66224,66.99132]],
    yevropa: [[39.66521,66.94847],[39.66491,66.94798],[39.66366,66.94790],[39.66258,66.94718],[39.66094,66.94698],[39.66007,66.94663],[39.65958,66.94615],[39.65919,66.94616],[39.65870,66.94542],[39.65752,66.94446],[39.65694,66.94435],[39.65502,66.94453],[39.65339,66.94508],[39.65099,66.94539],[39.64994,66.94617],[39.64985,66.94654],[39.64919,66.94718],[39.64824,66.94771],[39.64727,66.94761],[39.64659,66.94713],[39.64597,66.94504],[39.64568,66.94480],[39.64375,66.94460],[39.64216,66.94216],[39.64138,66.94169],[39.64023,66.94172],[39.63966,66.94198],[39.63909,66.94262],[39.63797,66.94464],[39.63808,66.94563],[39.63858,66.94636],[39.63926,66.94684],[39.63946,66.94733],[39.63948,66.94833],[39.63893,66.94996],[39.63877,66.95158],[39.63821,66.95271],[39.63804,66.95396],[39.63749,66.95547],[39.63723,66.95709],[39.63659,66.95848],[39.63624,66.96085],[39.63589,66.96235],[39.63551,66.96273],[39.63533,66.96336],[39.63534,66.96411],[39.63603,66.96496],[39.63661,66.96494],[39.63671,66.96519],[39.63758,66.96566],[39.63864,66.96563],[39.63992,66.96186],[39.64049,66.96123],[39.64085,66.95985],[39.64150,66.95871],[39.64256,66.95843],[39.64462,66.96036],[39.64530,66.96072],[39.64599,66.96157],[39.64647,66.96168],[39.64677,66.96217],[39.64823,66.96325],[39.64941,66.96458],[39.65105,66.96466],[39.65116,66.96528],[39.65164,66.96539],[39.65195,66.96625],[39.65254,66.96685],[39.65259,66.96959],[39.65288,66.96995],[39.65434,66.97041],[39.65502,66.97101],[39.65618,66.97110],[39.65807,66.96918],[39.65901,66.96767],[39.65907,66.96580],[39.65877,66.96544],[39.65875,66.96419],[39.65903,66.96381],[39.65903,66.96344],[39.65950,66.96305],[39.66153,66.96324],[39.66152,66.96262],[39.66171,66.96249],[39.66189,66.96174],[39.66273,66.96072],[39.66369,66.96020],[39.66416,66.95944],[39.66423,66.95807],[39.66403,66.95770],[39.66354,66.95747],[39.66296,66.95749],[39.66230,66.95788],[39.66104,66.95779],[39.66026,66.95706],[39.66023,66.95557],[39.66080,66.95494],[39.66098,66.95431],[39.66295,66.95127],[39.66504,66.94972],[39.66521,66.94847]],
    afrosiyob: [[39.67804,66.98105],[39.67764,66.98007],[39.67705,66.97946],[39.67694,66.97909],[39.67548,66.97814],[39.67279,66.97834],[39.67009,66.97817],[39.66808,66.97922],[39.66702,66.97925],[39.66673,66.97901],[39.66519,66.97918],[39.66463,66.97994],[39.66415,66.98020],[39.66406,66.98070],[39.66369,66.98108],[39.66332,66.98196],[39.66265,66.98248],[39.66198,66.98250],[39.66199,66.98312],[39.66171,66.98363],[39.66163,66.98462],[39.66144,66.98475],[39.66127,66.98575],[39.66122,66.98874],[39.66172,66.98972],[39.66192,66.98971],[39.66261,66.99081],[39.66329,66.99092],[39.66407,66.99139],[39.66496,66.99261],[39.66662,66.99393],[39.66780,66.99539],[39.66910,66.99796],[39.66999,66.99918],[39.67116,67.00014],[39.67174,67.00012],[39.67288,66.99922],[39.67295,66.99798],[39.67379,66.99634],[39.67553,66.99119],[39.67712,66.98866],[39.67777,66.98715],[39.67816,66.98229],[39.67804,66.98105]],
  };
  // Bosh reja zonalari rastri (geoportaldan raqamlashtirilgan): 0 — reja hududidan tashqari, 1/2/3 — zonalar
  const PLANMAP = {
    url: 'data/masterplan-samarqand.png?v=20261031', n: 39.750253, s: 39.566575, w: 66.834548, e: 67.079223, cell: 15,
    ha: { konservatsiya: 12200, rekonstruksiya: 15231, renovatsiya: 1067 },
    manba: 'Bosh reja zonalari: Davlat shaharsozlik kadastri geoportali (dshk.shaffofqurilish.uz), ekran tasvirlaridan raqamlashtirilgan, aniqlik ±30 m',
  };
  const PZ = [null, 'konservatsiya', 'rekonstruksiya', 'renovatsiya'];
  let pmP = null;
  function planMap() {
    if (pmP) return pmP;
    pmP = new Promise(res => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height);
          // palitra: konservatsiya (250,240,90), rekonstruksiya (240,150,110), renovatsiya (200,110,240)
          for (let i = 0; i < a.length; i++) { const g = d[i * 4 + 1], b = d[i * 4 + 2]; a[i] = d[i * 4 + 3] < 128 ? 0 : b > 180 ? 3 : g > 200 ? 1 : 2; }
          pmReady = { w: c.width, h: c.height, a }; res(pmReady);
        } catch (e) { res(null); }
      };
      img.onerror = () => res(null);
      img.src = PLANMAP.url;
    });
    return pmP;
  }
  const pmAt = (pm, lat, lon) => {
    const i = Math.floor((PLANMAP.n - lat) / (PLANMAP.n - PLANMAP.s) * pm.h), j = Math.floor((lon - PLANMAP.w) / (PLANMAP.e - PLANMAP.w) * pm.w);
    return i < 0 || j < 0 || i >= pm.h || j >= pm.w ? null : PZ[pm.a[i * pm.w + j]];
  };
  async function planZoneAt(lat, lon) { const pm = await planMap(); return pm ? pmAt(pm, lat, lon) : undefined; }
  let pmReady = null;
  // Yuklangandan keyin sinxron soʻrov (koʻp nuqtali tekshiruvlar uchun); yuklanmagan boʻlsa — undefined
  function planZoneSync(lat, lon) { return pmReady ? pmAt(pmReady, lat, lon) : undefined; }
  // Hudud boʻyicha zonalar ulushi (30 m qadam bilan namunalar)
  function planShare(pm, poly, center) {
    const cnt = { konservatsiya: 0, rekonstruksiya: 0, renovatsiya: 0, tashqari: 0 };
    let n = 0;
    if (poly && poly.length > 2) {
      const la = poly.map(p => p[0]), lo = poly.map(p => p[1]), s = Math.min(...la), N = Math.max(...la), w = Math.min(...lo), e = Math.max(...lo);
      const dLa = 30 / 110574, dLo = 30 / (111320 * Math.cos(center[0] * Math.PI / 180));
      for (let y = s + dLa / 2; y < N; y += dLa) for (let x = w + dLo / 2; x < e; x += dLo) { if (!inside(poly, y, x)) continue; const z = pmAt(pm, y, x); cnt[z || 'tashqari']++; n++; }
    }
    if (!n) { cnt[pmAt(pm, center[0], center[1]) || 'tashqari'] = 1; n = 1; }
    const ul = {}; Object.keys(cnt).forEach(k => { ul[k] = Math.round(cnt[k] / n * 100); });
    return { markaz: pmAt(pm, center[0], center[1]), ulush: ul };
  }

  // Zonalar va ularning huquqiy rejimi (qatʼiyligi boʻyicha)
  const ZONES = {
    afrosiyob: {
      nomi: 'Afrosiyob — tarixiy hududning arxeologik qismi (UNESCO asosiy hududi)', qisqa: 'Afrosiyob arxeologik qismi', color: '#f97316', ha: 236.5, daraja: 3,
      rejim: 'Arxeologik yodgorlik — muhofaza tegrasi: obyektni asrash va tiklashga qaratilgan maxsus ishlardan tashqari kapital qurilish TAQIQLANADI; yer qazish ishlari faqat Madaniy meros agentligi ruxsati bilan (265-son nizom 17-band).',
    },
    temur: {
      nomi: 'Tarixiy hududning XIV–XX asr Temuriylar davriga oid qismi (UNESCO asosiy hududi)', qisqa: 'Temuriylar davri tarixiy qismi', color: '#db2777', ha: 431.8, daraja: 2,
      rejim: 'Alohida muhofaza qilinadigan tarixiy-madaniy hudud: qurilish va obodonlashtirish loyihalari Madaniy meros agentligi hamda UNESCO Umumjahon merosi markazi bilan MAJBURIY kelishiladi (VM 119-son 1-band); tarixiy qiyofaga taʼsir qiladigan oʻzgartirish kiritilmaydi, ayrimlari — oldindan merosga taʼsirni baholash hisoboti bilan (bosh reja qarori loyihasi).',
    },
    yevropa: {
      nomi: 'Tarixiy hududning XIX–XX asr Yevropa davriga oid qismi (UNESCO asosiy hududi)', qisqa: 'Yevropa davri tarixiy qismi', color: '#2563eb', ha: 469.1, daraja: 2,
      rejim: 'Alohida muhofaza qilinadigan tarixiy-madaniy hudud: qurilish va obodonlashtirish loyihalari Madaniy meros agentligi hamda UNESCO Umumjahon merosi markazi bilan MAJBURIY kelishiladi (VM 119-son 1-band); koʻchalarning radial rejasi, kvartal chegaralari va tarixiy binolar oʻlchami saqlanadi (265-son nizom 17–18-band).',
    },
    bufer: {
      nomi: 'UNESCO roʻyxatidagi tarixiy-meʼmoriy qoʻriqxonaning bufer zonasi', qisqa: 'UNESCO bufer zonasi', color: '#eab308', ha: 1469.7, daraja: 1,
      rejim: 'Imoratlar qurish va xoʻjalik faoliyatini tartibga solish tegrasi: qurilish cheklanadi — bino oʻlchami, nisbati, balandligi, materiali va rangi Madaniy meros agentligi bilan kelishiladi, tarixiy muhitning vizual idroki saqlanadi (265-son nizom 18-band); ruxsatsiz qurish yoki buzish — maʼmuriy va jinoiy javobgarlik (VM 119-son 1-band).',
    },
  };
  const MANBA_ZONA = 'Rasmiy: VM 119-son qarori 9-ilova xaritasi (raqamlashtirilgan, aniqlik ±20–30 m)';
  const NEAR_M = 300;   // chegaradan tashqarida — panoramaga taʼsir boʻyicha ogohlantirish (taxminiy tavsiya)

  // Asosiy yodgorliklar — “eng yaqin yodgorlik” maʼlumoti uchun
  const MONUMENTS = [
    { name: 'Registon maydoni', c: [39.6547, 66.9757] },
    { name: 'Bibixonim masjidi', c: [39.6606, 66.9796] },
    { name: 'Shohi Zinda', c: [39.6627, 66.9878] },
    { name: 'Goʻri Amir maqbarasi', c: [39.6484, 66.9690] },
    { name: 'Afrosiyob shaharchasi', c: [39.6684, 66.9906] },
    { name: 'Ulugʻbek rasadxonasi', c: [39.6747, 67.0054] },
    { name: 'Hazrati Xizr masjidi', c: [39.6625, 66.9853] },
  ];

  const inside = (ring, lat, lon) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [yi, xi] = ring[i], [yj, xj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const dist = (a, b) => { const [ax, ay] = G.xy(a[0], a[1]), [bx, by] = G.xy(b[0], b[1]); return Math.hypot(ax - bx, ay - by); };
  // Nuqtadan halqa chizigʻigacha masofa (m)
  function ringDist(ring, p) {
    const [px, py] = G.xy(p[0], p[1]); let best = Infinity;
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = G.xy(ring[i - 1][0], ring[i - 1][1]), [bx, by] = G.xy(ring[i][0], ring[i][1]);
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    return best;
  }
  // Nuqta qaysi muhofaza zonasida: 'afrosiyob' | 'temur' | 'yevropa' | 'bufer' | null
  function zoneAt(lat, lon) {
    if (!inside(RINGS.chegara, lat, lon)) return null;
    for (const k of ['afrosiyob', 'temur', 'yevropa']) if (inside(RINGS[k], lat, lon)) return k;
    return 'bufer';
  }
  const probes = (poly, center) => (poly && poly.length ? poly.concat([center]) : [center]);

  // Atrofdagi binolar qavati (yuklangan boʻlsa) — tarixiy muhit miqyosi
  function contextFloors(center, R) {
    const list = NX.buildings && NX.buildings.get ? NX.buildings.get() || [] : [];
    const near = list.filter(b => b.c && Math.abs(b.c[0] - center[0]) < 0.004 && Math.abs(b.c[1] - center[1]) < 0.005 && dist(b.c, center) <= R);
    if (near.length < 5) return null;
    const real = near.filter(b => !b.est), use = real.length >= 5 ? real : near;
    const lv = use.map(b => b.levels).sort((a, b) => a - b), p90 = lv[Math.min(lv.length - 1, Math.floor(lv.length * 0.9))];
    return { p90, max: lv[lv.length - 1], n: use.length, taxminiy: use !== real };
  }

  // Yuklangan rasmiy bosh reja qatlamidan zona turi va ruxsat etilgan qavat / UMN / QMN
  const zoneType = p => {
    const t = String(p.zona || p.zone || p.tur || p.type || p.kind || p.landuse || p.name || '').toLowerCase();
    if (/konserv|conserv|muhofaza|himoya|meros|heritage/.test(t)) return 'konservatsiya';
    if (/rekonstr|reconstr/.test(t)) return 'rekonstruksiya';
    if (/renov|redevelop|yangilan/.test(t)) return 'renovatsiya';
    if (/yashil|green|park|bog|rekreats|recreat/.test(t)) return 'yashil hudud';
    if (/sanoat|industr|ishlab|kommunal|ombor/.test(t)) return 'sanoat';
    if (/turar|resid|uy-joy|housing/.test(t)) return 'turar joy';
    if (/yo.l|road|transport|koʻcha/.test(t)) return 'yoʻl / transport';
    return t || 'zona';
  };
  const num = (p, keys) => { for (const k of keys) { const v = parseFloat(p[k]); if (isFinite(v)) return v; } return null; };
  const maxFloors = p => num(p, ['max_floors', 'maxFloors', 'qavat', 'max_qavat', 'etaj', 'floors']);
  const umnOf = p => num(p, ['UMN', 'umn', 'FAR', 'far', 'kmn']);
  const qmnOf = p => { const v = num(p, ['QMN', 'qmn', 'BCR', 'bcr', 'coverage']); return v == null ? null : v <= 1 ? v * 100 : v; };

  // Asosiy tekshiruv: { center, poly, floors, build } → zonalar, UNESCO, ziddiyatlar, qoidalar
  async function check(opt) {
    const center = opt.center, poly = opt.poly, P = probes(poly, center), build = !!opt.build, floors = opt.floors || null;
    const out = { zonalar: [], unesco: null, ziddiyatlar: [], qoidalar: [], manba: [] };
    // 1) Rasmiy bosh reja qatlami (yuklangan boʻlsa)
    const mp = NX.systems && NX.systems.get('masterplan');
    if (mp) {
      out.manba.push('rasmiy bosh reja qatlami (yuklangan: ' + (mp.name || 'fayl') + ')');
      mp.gj.features.forEach(f => {
        const g = f.geometry; if (!g) return;
        const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
        rings.forEach(r => {
          const ring = r.map(c => [c[1], c[0]]);
          if (!P.some(p => inside(ring, p[0], p[1]))) return;
          const pr = f.properties || {}, t = zoneType(pr), mf = maxFloors(pr), umn = umnOf(pr), qmn = qmnOf(pr);
          const nAvg = umn != null && qmn ? Math.round(umn / (qmn / 100) * 10) / 10 : null;
          out.zonalar.push({ zona: t, ruxsat_qavat: mf, UMN: umn, QMN: qmn, ortacha_qavat: nAvg, nomi: pr.name || '' });
          if (t === 'konservatsiya' && build) out.ziddiyatlar.push('Hudud bosh rejadagi KONSERVATSIYA zonasiga tushadi — qoʻshimcha turar va noturar bino qurilishi taqiqlanadi.');
          if (t === 'yashil hudud' && build) out.ziddiyatlar.push('Bosh rejada bu yer yashil (rekreatsiya) hudud — unga bogʻliq boʻlmagan qurilish uchun emas.');
          if (t === 'sanoat' && build) out.ziddiyatlar.push('Bosh rejada bu yer sanoat hududi — sanitariya-muhofaza zonasida uy, maktab, shifoxona, sport obyektlari joylashtirilmaydi.');
          if (mf != null && floors && floors > mf) out.ziddiyatlar.push(`Bosh reja boʻyicha bu zonada ${mf} qavatgacha ruxsat — rejadagi ${floors} qavat oshib ketadi.`);
          else if (mf == null && nAvg != null && floors && floors > Math.ceil(nAvg)) out.ziddiyatlar.push(`Bosh reja zonasida UMN ${umn} va QMN ${qmn}% — oʻrtacha ${nAvg} qavat (N = UMN / QMN); rejadagi ${floors} qavat bu zichlikdan oshadi.`);
        });
      });
    } else {
      // Geoportaldan raqamlashtirilgan bosh reja zonalari
      const pm = await planMap();
      if (pm) {
        const sh = planShare(pm, poly, center), u = sh.ulush, mz = sh.markaz;
        out.manba.push(PLANMAP.manba);
        out.reja_zonasi = { markaz: mz, ulush_foiz: u, manba: PLANMAP.manba };
        ['konservatsiya', 'rekonstruksiya', 'renovatsiya'].filter(k => u[k] > 0).sort((a, b) => u[b] - u[a]).forEach(k => out.zonalar.push({ zona: k, ulush_foiz: u[k], ruxsat_qavat: null, nomi: '' }));
        if ((mz === 'konservatsiya' || u.konservatsiya >= 50) && build) out.ziddiyatlar.push(`Bosh reja: hudud${u.konservatsiya < 100 && poly ? ` (${u.konservatsiya}%)` : ''} KONSERVATSIYA zonasida — yashil hudud, suv yoki yoʻl boʻyi himoya hududi yoxud madaniy meros maydoni; qoʻshimcha turar va noturar bino qurilishi taqiqlanadi.`);
        else if (u.konservatsiya >= 10 && build) out.qoidalar.push(`Hududning ~${u.konservatsiya}% qismi bosh rejada konservatsiya zonasi (yoʻl/suv boʻyi yoki yashil) — shu qismida bino qurilmaydi.`);
        if (mz === 'rekonstruksiya') out.qoidalar.push('Bosh reja: REKONSTRUKSIYA zonasi — ' + PLAN.zonalar.rekonstruksiya + '.' + (build && floors >= 5 ? ` ${floors} qavatli bino faqat “zichlashtiriladigan” hududda mumkin; hudud turi batafsil rejalashtirish loyihasida aniqlanadi.` : ''));
        if (mz === 'renovatsiya') out.qoidalar.push('Bosh reja: RENOVATSIYA zonasi — ' + PLAN.zonalar.renovatsiya + '.');
        if (!mz && build) out.qoidalar.push('Hudud markazi bosh reja chegarasidan (28 415 ga) tashqarida — avval shahar chegarasi va batafsil rejalashtirish loyihasini aniqlash kerak.');
        out.qoidalar.push('Zonalar boʻyicha UMN/QMN va ruxsat etilgan qavat geoportalda koʻrsatilmagan — aniq raqamlar uchun hokimiyatdan GIS fayl soʻralsin (Tizimlar → Bosh reja).');
      } else out.qoidalar.push('Bosh reja zonalari xaritasi yuklanmadi — zona turi tekshirilmadi.');
    }

    // 2) UNESCO / “Samarqand” muzey-qoʻriqxonasi qoʻriqlanadigan tegrasi (rasmiy xarita)
    const hits = P.map(p => zoneAt(p[0], p[1])), main = zoneAt(center[0], center[1]);
    const worst = hits.filter(Boolean).sort((a, b) => ZONES[b].daraja - ZONES[a].daraja)[0] || null;
    const mon = MONUMENTS.map(m => ({ m, d: dist(center, m.c) })).sort((a, b) => a.d - b.d)[0];
    const toEdge = Math.round(ringDist(RINGS.chegara, center));
    out.manba.push(MANBA_ZONA);
    out.unesco = {
      manba: MANBA_ZONA,
      zona: worst, nomi: worst ? ZONES[worst].qisqa : 'muhofaza hududidan tashqarida',
      markaz_zonasi: main ? ZONES[main].qisqa : null,
      ichida: worst === 'afrosiyob' || worst === 'temur' || worst === 'yevropa',
      bufer_zonada: worst === 'bufer',
      chegaragacha_m: worst ? 0 : toEdge,
      eng_yaqin_yodgorlik: mon.m.name, masofa_m: Math.round(mon.d),
      rejim: worst ? ZONES[worst].rejim : null,
    };
    if (worst) out.qoidalar.unshift(ZONES[worst].nomi + ': ' + ZONES[worst].rejim);
    if (worst === 'afrosiyob' && build) out.ziddiyatlar.push('Hudud Afrosiyob arxeologik yodgorligi hududida (UNESCO asosiy hududi) — kapital qurilish taqiqlanadi (265-son nizom 17-band).');
    else if ((worst === 'temur' || worst === 'yevropa') && build) out.ziddiyatlar.push(`Hudud UNESCO asosiy hududida (${ZONES[worst].qisqa}) — yangi qurilish tarixiy qiyofani oʻzgartirmasligi shart; loyiha Madaniy meros agentligi va UNESCO Umumjahon merosi markazi bilan kelishilmasdan va merosga taʼsirni baholash hisobotisiz amalga oshirilmaydi.`);
    if (worst && worst !== 'afrosiyob' && build && floors) {
      const cf = contextFloors(center, 250);
      if (cf && floors > Math.max(cf.p90, 2)) out.ziddiyatlar.push(`Rejadagi ${floors} qavat atrofdagi binolardan baland (250 m ichida ${cf.n} ta binoning 90 foizi ≤ ${cf.p90} qavat${cf.taxminiy ? ', qavatlar qisman taxminiy' : ''}) — ${ZONES[worst].qisqa}da tarixiy muhitning vizual idrokiga taʼsir qiladi; bino oʻlchami va balandligi Madaniy meros agentligi bilan kelishilishi shart.`);
      else if (cf) out.qoidalar.push(`Atrofdagi binolar (250 m): 90 foizi ≤ ${cf.p90} qavat — muhofaza hududida yangi bino shu miqyosdan oshmasligi maqsadga muvofiq.`);
    }
    if (worst === 'bufer' && build) out.qoidalar.push('UNESCO bufer zonasida qurilish taqiqlanmagan, lekin cheklangan: balandlik, oʻlcham, material va rang Madaniy meros agentligi bilan kelishiladi.');
    if (!worst && toEdge < NEAR_M && build && floors && floors >= 5) out.qoidalar.push(`Muhofaza hududi chegarasiga ${toEdge} m — ${floors} qavatli bino tarixiy markaz panoramasiga koʻrinishi mumkin; merosga taʼsirni baholash tavsiya etiladi (taxminiy tavsiya).`);
    if (hits.includes('temur')) out.qoidalar.push('PQ-219 (10.06.2026): “eski shahar” 13 koʻchasi (' + PLAN.eski_shahar_kochalari.slice(0, 6).join(', ') + ' va boshqalar) milliy-tarixiy qiyofasi saqlanib, piyodalar hududiga aylantiriladi.');

    // 3) Bosh reja 2045 umumiy talablari
    if (build && floors && floors > PLAN.maks_qavat_rejada) out.qoidalar.push(`Bosh reja (2-ilova) 2045-yilgacha uy-joy fondini 1–2 qavatli (60%), 3–5 qavatli (30%) va 6–9 qavatli (10%) uylar bilan rejalashtiradi — ${floors} qavatli uy bu tarkibda nazarda tutilmagan; zichlik UMN/QMN boʻyicha batafsil rejalashtirish loyihasida asoslanishi kerak.`);
    out.qoidalar.push('Bosh reja 2045 (loyiha): konservatsiya zonasida qoʻshimcha qurilish taqiqlanadi; rekonstruksiya — shakllangan hududni takomillashtirish yoki zichlashtirish; renovatsiya — yaroqsiz binolar oʻrniga master-reja asosida qayta qurish. Zichlik UMN (0–18) va QMN (0–80%) bilan belgilanadi.');
    out.qoidalar.push('Har qanday qurilish bosh reja asosida tasdiqlangan master-reja, batafsil rejalashtirish loyihasi yoki qurilish loyihasi bilan; koʻchalarning qizil chiziqlari ichida qurilishga yoʻl qoʻyilmaydi.');
    return out;
  }

  // Xarita uchun: rasmiy muhofaza zonalari (bufer — teshikli poligon) — GeoJSON
  function geo() {
    const ring = r => r.map(p => [p[1], p[0]]);
    const f = [{ type: 'Feature', properties: { name: ZONES.bufer.nomi, zona: 'muhofaza', tur: 'bufer', color: ZONES.bufer.color, maydon_ga: ZONES.bufer.ha, manba: 'VM 119-son, 9-ilova' },
      geometry: { type: 'Polygon', coordinates: [ring(RINGS.chegara), ring(RINGS.temur), ring(RINGS.yevropa), ring(RINGS.afrosiyob)] } }];
    ['temur', 'yevropa', 'afrosiyob'].forEach(k => f.push({ type: 'Feature', properties: { name: ZONES[k].nomi, zona: 'muhofaza', tur: k, color: ZONES[k].color, maydon_ga: ZONES[k].ha, manba: 'VM 119-son, 9-ilova' },
      geometry: { type: 'Polygon', coordinates: [ring(RINGS[k])] } }));
    return Promise.resolve({ type: 'FeatureCollection', features: f });
  }

  NX.masterplan = { PLAN, ZONES, RINGS, MONUMENTS, PLANMAP, zoneAt, planZoneAt, planZoneSync, planMap, check, geo, zoneType };
})();
