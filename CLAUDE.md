# City Jam — Samarqand shahar hokimiyati uchun “virtual shahar” (raqamli egizak)

Foydalanuvchi oʻzbek tilida (lotin) yozadi. Javoblar oʻzbekcha, qisqa va aniq boʻlsin. Loyiha Prezidentga koʻrsatiladi — “uyaltirmaydigan”, real ishlaydigan MVP boʻlishi shart.

## Nima bu
- Statik sayt: GitHub Pages — https://diyorjonabdurahmonov1-ai.github.io/shaxar-ai/ (repo `diyorjonabdurahmonov1-ai/shaxar-ai`, `main` ga push = deploy, 1–6 daqiqa).
- Build yoʻq, oddiy `<script>` lar, hammasi `window.NX` ostida. `index.html` dagi barcha lokal fayllarda `?v=...` versiya — har oʻzgarishda versiyani oshiring (brauzer keshi).
- Foydalanuvchilar — faqat hokimiyat xodimlari (oddiy aholi emas), admin/foydalanuvchi boʻlinishi yoʻq; umumiy “xodim kodi” (`ADMIN_PIN`).
- Boʻlimlar: Xarita, Muammolar, Tizimlar, 3D egizak, AI yordamchi, Hisobot.

## Asosiy fayllar
- `js/app.js` — asosiy mantiq: `twinAsk` (3D egizak chati, favqulodda savollar), `hazardRun`/`showHazard` (natija xaritada), `areaAsk` (hudud chati), `chatSend` (AI yordamchi), `loadTwin`, `twinFlood2d`.
- `js/data/questions.js` — savollar katalogi (`NX.QUESTIONS`, 40+) va `NX.intent(q)` (savol turi: quake/flood/fire/ambulance/police/evac/needs/build/traffic/climate/solar + belgilar evac/blocked/critical/city/mahalla/image). Regexlar template literal ichida — `\\s` ikki teskari chiziq bilan yozilsin!
- `js/analysis/hazard.js` — zilzila zonalari (bino shaklida, 40 m kataklar), evakuatsiya (Dijkstra, sigʻim boʻyicha taqsimot, zaxira yoʻl, vaqt; hudud / har bir mahalla / butun shahar `cityPlan`), suv toshqinida baland joylar, yongʻin/tez yordam qamrovi, `waterItems`, `reportItems` (OAV real hodisalari), `summary` (AI ishlamasa ham toʻliq javob). Aholi 560 mingga kalibrlangan.
- `js/analysis/twin.js` — relyef (AWS Terrarium), `ground()` (SRTM→yer sathi filtri), `flood2d` (LISFLOOD-FP worker `js/sim/flood2d.js`), `CURB=0.15` (yoʻl chetidan oshgan suv = koʻchani bosgan), koʻchalar (`roadsStatic` → `data/roads-samarqand.json`).
- `js/analysis/area.js` — hudud statistikasi, nomzod joylar, `needs` (xizmatlar qamrovi meʼyor boʻyicha).
- `js/data/masterplan.js` — Bosh reja 2045 (loyiha) koʻrsatkichlari, zona qoidalari, UNESCO zonasi (OSM yoki taxminiy), `check()` — hudud tahlilida va AI’da.
- `js/data/buildings.js` — `data/buildings-samarqand.json` (Overture: OSM + Microsoft, ~123 ming bino).
- `js/ui/map3d.js` — MapLibre 3D: “Raqamli egizak” uslubi, derazalar, realistik suv (tekstura), yomgʻir, zilzila silkinishi, hazard qatlamlari va oqim nuqtalari (`hz-dots`).
- `js/ui/fx.js` — 2D xaritadagi jonli simulyatsiya canvas’i (3D da oʻchadi). `js/ui/backdrop.js` — orqa fon animatsiyasi.
- `js/ai.js` — AI promptlari (SYSTEM, TWIN, AREA, DEEP…), `callOpenAI` Worker orqali.
- `worker/ai-proxy.js` — Cloudflare Worker `cityjam-ai` (foydalanuvchi oʻzi deploy qiladi).
- `data/*.json` — tayyor fayllar (binolar, koʻchalar, ochiq joylar/xizmatlar, OAV toshqin xabarlari).

## Testlar
- `(python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &); sleep 2; timeout 1750 node tests/e2e.cjs` — Playwright, ~12 daqiqa, hozir 165/165. Testda tashqi xizmatlar va `data/*-samarqand.json` mock qilinadi.
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
- Bosh reja 2045 qaror loyihasi (regulation.adliya.uz, loyiha 8969) va lex.uz’dagi qarorlar matnini toʻliq oʻqib, zonalar jadvali, balandlik cheklovlari, UNESCO bufer zona qoidalarini `js/data/masterplan.js` ga aniq kiritish (oldingi sessiyada tarmoq bloklangan edi).
- Hokimiyatdan soʻraladigan maʼlumotlar: bosh reja GIS fayli, kadastr (bino yili/materiali), mahalla chegaralari, kanalizatsiya/ariqlar, FVV yigʻilish joylari va stansiyalar.
- Oʻt oʻchirish qismlari Overture’da yoʻq — Overpass orqali; tayyor faylga qoʻshish kerak.
- Worker oxirgi versiyasini foydalanuvchi deploy qilishi kerak (`masterplan` qatlami qoʻshilgan).
