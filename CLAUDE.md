# City Jam — Samarqand shahar hokimiyati uchun “virtual shahar” (raqamli egizak)

Foydalanuvchi oʻzbek tilida (lotin) yozadi. Javoblar oʻzbekcha, qisqa va aniq boʻlsin. Loyiha Prezidentga koʻrsatiladi — “uyaltirmaydigan”, real ishlaydigan MVP boʻlishi shart.

## Nima bu
- Statik sayt: GitHub Pages — https://diyorjonabdurahmonov1-ai.github.io/shaxar-ai/ (repo `diyorjonabdurahmonov1-ai/shaxar-ai`, `main` ga push = deploy, 1–6 daqiqa).
- Build yoʻq, oddiy `<script>` lar, hammasi `window.NX` ostida. `index.html` dagi barcha lokal fayllarda `?v=...` versiya — har oʻzgarishda versiyani oshiring (brauzer keshi).
- Foydalanuvchilar — faqat hokimiyat xodimlari (oddiy aholi emas), admin/foydalanuvchi boʻlinishi yoʻq; umumiy “xodim kodi” (`ADMIN_PIN`).
- Boʻlimlar: Xarita, Muammolar, Tizimlar, 3D egizak, AI yordamchi, Hisobot.

## Asosiy fayllar
- `js/app.js` — asosiy mantiq: `twinAsk` (3D egizak chati, favqulodda savollar), `hazardRun`/`showHazard` (natija xaritada), `areaAsk` (hudud chati), `chatSend` (AI yordamchi), `loadTwin`, `twinFlood2d`.
- `js/data/questions.js` — savollar katalogi (`NX.QUESTIONS`, 200+ savol, 11 guruh) va `NX.intent(q)` (savol turi: quake/flood/fire/ambulance/police/evac/road/plan/needs/build/traffic/climate/solar + belgilar evac/blocked/critical/city/mahalla/image). Regexlar template literal ichida — `\\s` ikki teskari chiziq bilan yozilsin! Katalog 200+ savol (11 guruh); yangi savol qoʻshilsa test har birining turini tekshiradi.
- `js/analysis/hazard.js` — zilzila zonalari (bino shaklida, 40 m kataklar), evakuatsiya (Dijkstra, sigʻim boʻyicha taqsimot, zaxira yoʻl, vaqt; hudud / har bir mahalla / butun shahar `cityPlan`), suv toshqinida baland joylar, yongʻin/tez yordam qamrovi, `waterItems`, `reportItems` (OAV real hodisalari), `summary` (AI ishlamasa ham toʻliq javob). Aholi 560 mingga kalibrlangan.
- `js/analysis/twin.js` — relyef (AWS Terrarium), `ground()` (SRTM→yer sathi filtri), `flood2d` (LISFLOOD-FP worker `js/sim/flood2d.js`), `CURB=0.15` (yoʻl chetidan oshgan suv = koʻchani bosgan), koʻchalar (`roadsStatic` → `data/roads-samarqand.json`).
- `js/analysis/area.js` — hudud statistikasi, nomzod joylar, `needs` (xizmatlar qamrovi meʼyor boʻyicha).
- `js/data/masterplan.js` — Bosh reja 2045 (loyiha 8969: 2-versiya zonalari/UMN/QMN, 3-versiya yakuniy koʻrsatkichlari), UNESCO muhofaza zonalari RASMIY chegarasi (VM 119-son 9-ilova xaritasidan raqamlashtirilgan: Temuriylar qismi, Yevropa qismi, Afrosiyob, bufer), `zoneAt()`; bosh reja zonalari (konservatsiya/rekonstruksiya/renovatsiya) — `data/masterplan-samarqand.png` (dshk.shaffofqurilish.uz geoportali ekran tasvirlaridan raqamlashtirilgan 15 m rastr, ±30 m; geoportal faqat Oʻzbekiston IP’laridan ochiladi), `planZoneAt()`; `check()` — hudud tahlilida va AI’da. Qaror lex.uz’da chiqsa — matnini solishtirish.
- `js/analysis/roadcheck.js` — xaritada chizilgan yangi koʻcha (“🛣 Koʻcha chizish”, `NX.draw.startLine`): har 10 m da UNESCO zonasi, bosh reja zonasi, mavjud koʻcha ustidami; buziladigan binolar (yoʻl kengligi), yodgorliklar, mavjud yoʻllar orqali muqobil (Dijkstra); xulosa mumkin / shartli / kelishuv / mumkin emas. Xaritada `NX.map.showRoad` (SVG qatlam, CSS animatsiya, yorliqlar ustma-ust tushmaydi), panelda `V.road`, AI `NX.ai.roadAsk` (+ internet, Mapillary suratlari). Bosh reja/UNESCO savollari — `planAsk` (joy aniqlanadi, zonalar xaritada, `NX.map.showPlace`).
- `js/analysis/drainfix.js` — suv toʻplanadigan koʻcha uchun muhandislik yechimi: mahalliy havza (D8, 1.5 km), ratsional formula, kerakli sigʻim = 2D modeldagi hajm / 1 soat, chiqish joyi (OSM ariq/kanal yoki relyef, Afrosiyobni chetlab), quvur (Manning), rezervuar, quduqlar, A/B/C/D variantlar, bosh reja/UNESCO cheklovlari, loyiha sxemasi (SVG). Chaqirish: natijalar roʻyxatidagi “🛠 Yechim”, xarita popup’i, chatda “… suv muammosini qanday hal qilamiz” (`NX.intent(q).fix`).
- `js/analysis/streetaudit.js` — koʻcha auditi (🚗 avtomobil / 🚶 piyoda / ♿ nogironlar): savolda koʻcha boʻlsa — shu koʻcha har 20 m da: tezlik/qoplama (`roads-samarqand.json` v2: `sp`, `sf`), trotuar va oʻtish joylari (`data/walk-samarqand.json` — Overture footway/sidewalk/crosswalk/steps), bordyur/taktil plitka/svetofor/turargoh (Overpass, brauzerda), qiyalik (relyef, ≥120 m oraliq), maktab/bekat oldida oʻtish joyi, yangi oʻtish joylari (P), Mapillary aniqlashlari + `NX.ai.streetVision` (suratlar AI koʻrigi), ballar, koʻndalang kesim SVG. Koʻcha boʻlmasa — `rank()` shahar asosiy koʻchalari yoki belgilangan hudud reytingi (eng yomon 10 tasi raqamli, “🔍 Batafsil”). Intent `access` (+ `focus` car/ped/acc), `auditRun` (app.js), fx/3D `style:'seg'`, legend `.au-scores`. “Maʼlumot yoʻq” ≠ “yoʻq”. Oʻtish imkoniyatlari: zebra + svetofor + yirik chorraha (`junctions`); takliflar mavjudlaridan ≥120 m, Mapillary bilan tekshiriladi (`verifyProposals`), “nomzod” deb yoziladi. 3D belgilar popup’i — `NX.place.html` (real surat).
- Maktab muammolari: OSM’da faqat nuqta (bino yoʻq) boʻlsa — “tasdiqlanmagan” (sev 1, ogohlantirish); real surat/panorama `p.view` — maktab yonidagi koʻcha nuqtasi, kamera shu nuqtaga qaratiladi (`NX.mly.best`, `player.lookAt`).
- Zilzila + “tez yordam/qutqaruv/oʻt oʻchirish” (`intent.resp`) — `NX.hazard.rescueRoutes` (stansiyadan zonaga, `sg.blk` toʻsiladigan koʻchalar chetlab), `style:'rescue'`; yoʻnalish: 2D oʻqlar/○ boshlanish/🏁, 3D `hz-arrows`, `hz-rstart/rend`; legenda “🧭 Xaritada nima va qayoqqa”.
- `js/ui/place.js` — xaritadagi belgi popup’i: izoh, koʻcha nomi, Mapillary real surati, Yandex panorama; rasmlar lightbox.
- `js/data/buildings.js` — `data/buildings-samarqand.json` (v3: Overture OSM + Microsoft ~123 ming + Microsoft Global ML Buildings 2026-02-03 dan Overture’da yoʻq 12.9 ming = ~136 ming; `h` — ichki hovlilar). Google Open Buildings Oʻzbekistonni qamramaydi. Har bir uyni aniq olish uchun — hokimiyat kadastr GIS fayli kerak (sunʼiy yoʻldosh suratlaridan oʻzimiz ajratish Esri/Google ToS’ga zid). Binolar yuklanganda `nx:buildings` hodisasi.
- `js/ui/map3d.js` — MapLibre 3D: fon — Esri raster (har biri oʻz `maxzoom`i: sat 18, street 17, twin 16 — undan yuqorida Esri Samarqand uchun “Map data not yet available” beradi) + OpenFreeMap vektor (`omt`: koʻchalar, suv, bogʻlar, nomlar — har zoomda tiniq; testda rad etiladi), binolar ichki hovlilari (`buildings-samarqand.json` v2 `h` — teshiklar), tarixiy obidalar oltin (`lm`), bino konturlari nuri (`bld-foot`), “Raqamli egizak” uslubi, derazalar, realistik suv (tekstura), yomgʻir, zilzila silkinishi, hazard qatlamlari va oqim nuqtalari (`hz-dots`).
- `js/ui/fx.js` — 2D xaritadagi jonli simulyatsiya canvas’i (3D da oʻchadi). `js/ui/backdrop.js` — orqa fon animatsiyasi.
- `js/ai.js` — AI promptlari (SYSTEM, TWIN, AREA, DEEP…), `callOpenAI` Worker orqali.
- `worker/ai-proxy.js` — Cloudflare Worker `cityjam-ai` (foydalanuvchi oʻzi deploy qiladi).
- `data/*.json` — tayyor fayllar (binolar, koʻchalar, ochiq joylar/xizmatlar, OAV toshqin xabarlari).

## Testlar
- `(python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &); sleep 2; timeout 1750 node tests/e2e.cjs` — Playwright, ~12 daqiqa, hozir 185/185. Testda tashqi xizmatlar va `data/*-samarqand.json` mock qilinadi (`walk-samarqand.json` — kichik sintetik trotuar/zebra/zinapoya).
- `node tests/real-data.cjs` — haqiqiy relyef/koʻchalar/binolar bilan qoʻlda tekshiruv (internet kerak).
- Har oʻzgarishdan keyin testlarni yurgizing; vizual ishlarda skrinshot olib koʻring.

## Foydalanuvchi talablari (muhim)
- Hamma narsa real maʼlumot boʻlsin; taxminiy boʻlsa — halol “taxminiy” deb yozilsin. Tayyor shablon/chip savollar kerak emas (faqat yopiq “Nimalarni soʻrash mumkin” roʻyxati).
- Har savolga AYNAN mos javob va mos xarita/animatsiya: “qaysi koʻchani suv bosadi” → suv; “evakuatsiya” → yoʻllar; zilzila “qayer zaif” → zonalar; “qaysi koʻchadan oʻtib boʻlmaydi” → toʻsiladigan koʻchalar.
- Natija xaritada eng birinchi oʻrinda: chiroyli, zamonaviy, harakatli (jonli) dizayn. Orqa fon doim qorongʻi; panel kartochkalari qora shisha.
- AI javobida manba/usulni yozmaydi; yuklanishda faqat “Tahlil qilinmoqda” animatsiyasi.
- Bosh rejaga zid tavsiya berilmasin.

## Xavfsizlik (buzilmasin)
- OpenAI kaliti faqat Cloudflare secret `OPENAI_API_KEY`; Windy kaliti faqat `WINDY_KEY`; `ADMIN_PIN` oshkor qilinmasin. Kalitlar repoga yozilmaydi.
- Ruxsatsiz/himoyasiz kameralarga ulanmaslik (Shodan/insecam yoʻq). Fin kameralari “NAMUNA” belgisi bilan.
- Yandex panoramalarini AI tahlilida ishlatmaslik (ToS).
- Maxfiy infratuzilma maʼlumotlari ulanishidan oldin sayt Cloudflare Access yoki davlat serveri orqasiga oʻtishi kerak.

## Ochiq ishlar
- Bosh reja: qaror lex.uz’da eʼlon qilinsa — yakuniy matnni `PLAN` bilan solishtirish; zonalar raqamlashtirilgan (±30 m) — aniq vektor fayl va UMN/QMN, qavat cheklovlari uchun hokimiyatdan GIS fayl soʻralsin (geoportalda faqat “Funksiya” maydoni koʻrinadi). Bufer zonadagi aniq balandlik raqamlari ochiq hujjatlarda yoʻq (qoʻriqlanadigan tegra loyihasida — Madaniy meros agentligidan soʻralsin).
- Hokimiyatdan soʻraladigan maʼlumotlar: bosh reja GIS fayli, kadastr (bino yili/materiali), mahalla chegaralari, kanalizatsiya/ariqlar, FVV yigʻilish joylari va stansiyalar.
- Oʻt oʻchirish qismlari Overture’da yoʻq — Overpass orqali; tayyor faylga qoʻshish kerak.
- Worker oxirgi versiyasini foydalanuvchi deploy qilishi kerak (`masterplan` qatlami qoʻshilgan).
