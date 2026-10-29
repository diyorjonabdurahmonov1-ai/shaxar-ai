# City Jam — Samarqand shahar boshqaruv markazi

Samarqand tarixiy markazi uchun koʻcha harakati va jamoat transportini **tahlil qiluvchi va bashorat qiluvchi** xaritaga asoslangan veb-ilova. Barcha maʼlumot ochiq manbalardan brauzerning oʻzida yuklanadi. Ilova uchun server yoki pullik xizmat kerak emas.

**Pilot hudud:** 39.640–39.670 shm. k., 66.950–67.000 shq. u. (markaz — Registon).

## Imkoniyatlar

Loyiha **Samarqand shahar hokimiyati xodimlari** uchun “virtual shahar” (raqamli egizak): shahar ustidan nazoratni kuchaytirish, muammolarni AI bilan topish va tez hal qilish. Oddiy aholi uchun emas.

Tizimlar: 🚦 transport (ulangan, real vaqt) · 📹 kameralar · ⚡ elektr · 🔥 gaz · 💧 ichimlik suvi · 🚰 kanalizatsiya — “Tizimlar” boʻlimida har birining xaritasi (GeoJSON / KML / CSV) yuklanadi; real vaqt datchik va video maʼlumotlari tashkilotlar API bergach ulanadi.

**3D egizak** (Virtual Singapore yoʻnalishida): binolar 3D (OpenStreetMap), tomlardagi quyosh energiyasi salohiyati (Open-Meteo yillik nurlanish arxivi), suv toshqini xavfi (Copernicus DEM relyefi + 48 soatlik yogʻin prognozi), rejadagi yangi binoning qish/yoz soyasi va soyada qoladigan qoʻshni binolar. 3D — MapLibre GL (vendor/maplibre, BSD).

**Xavfsizlik:** kameralar va yer osti tarmoqlari maxfiy maʼlumot. Ularni ulashdan oldin sayt va Worker faqat xodimlar kira oladigan joyda boʻlishi kerak (masalan, Cloudflare Pages + Cloudflare Access — xodimlar emaili bilan kirish) yoki hokimiyat serverida.

| Boʻlim | Nima qiladi |
|---|---|
| **Xarita** | Yandex real tirbandligi (probkalar). Koʻchani bosganda: qisqa maʼlumot, shu koʻchadagi muammolar va **“Nima qilsak?”** — bir tomonlama qilish, yopish, avtobus yoʻlagi, svetofor, talab oshishi oqibatlari butun tarmoq boʻyicha hisoblanadi. |
| **Muammolar** | Avtomatik topilgan muammolar (svetoforsiz chorrahalar, maktab oldida oʻtish yoʻqligi, bekatdan uzoq hududlar…), yechimi va taxminiy narxi. Xato boʻlsa — “Muammo emas” / “Svetofor bor” (PIN bilan hamma uchun saqlanadi). |
| **AI yordamchi** | Chat: xaritada koʻchani belgilang va soʻrang (“yopsak nima boʻladi?”, “nima qilish kerak?”). Simulyatsiya avtomatik ishlaydi — yuklama oshadigan yoʻllar xaritada qizil, yengillashadiganlari yashil boʻladi; AI kelajakdagi xavflarni aytadi. “✂️ Bir qismini tanlash” — koʻchada ikki nuqtani bosib, faqat shu qismini (chorrahadan chorrahagacha) tahlil qilish. |
| **📷 Real koʻrinish** | Koʻcha yoki muammo yonidagi tugma — oʻsha joyning Yandex panoramasi (360° real fotosurat). Surat boʻlmasa yoki Yandex ishlamasa — Yandex Xaritalarda ochish havolasi. |
| **🔎 Tekshirish** | Sahifa ochilganda svetoforsiz chorrahalar va maktablar Mapillary suratlarida avtomatik tekshiriladi — svetofor/zebra topilgan joylar roʻyxatdan olinadi (xaritada 🚦). “🤖 AI suratlarni koʻrib chiqsin” — qolganlarini AI suratdan koʻradi (PIN bor brauzerda avtomatik). Har bir joyda: joyning ochiq koʻcha surati (Mapillary) va undan avtomatik topilgan svetofor/zebra — ✅ bor, ❌ koʻrinmadi, ❔ surat yoʻq. “🤖 AI suratni tahlil qilsin”, “🌐 Internetdan qidirish” (manbalar bilan), “🎨 Yechim rasmi” (AI rasm — haqiqiy emas). Oxirgi uchtasi uchun Worker yangi versiyasi kerak. |
| **✏️ Hudud belgilash** | Xaritada sichqoncha bilan mahallani erkin chizing: hududdagi muammolar, bekatlar, svetofor, maktablar (OSM). “Bu yerga bino qursak?” — xonadon va qavat kiriting: aholi, mashinalar, koʻchalarga yuklama (xaritada qizil/yashil), yutuqlar, muammolar, tavsiyalar va 5 yildan keyingi holat (taxmin). AI bilan hudud haqida savol-javob. |
| **Hisobot** | Koʻrsatkichlar, tavsiyalar (soʻmda, taxminiy), JSON eksport. |
| **AI savol** | Oʻzbekcha savolga sayt maʼlumotlari asosida qisqa javob (OpenAI, Cloudflare Worker orqali, kalit yashirin). |

## Ishga tushirish

Ilova oddiy statik saytdan iborat, build bosqichi yoʻq.

```bash
npx http-server -p 8080 .     # yoki: python3 -m http.server 8080
# brauzerda: http://localhost:8080
```

`index.html` faylini toʻgʻridan-toʻgʻri ochsa ham (`file://`) ishlaydi. Bunda asos xarita sifatida Esri World Street Map ishlatiladi.

**GitHub Pages:** repo sozlamalarida *Settings → Pages → Deploy from a branch → `main` / root* ni tanlang.

### Real maʼlumot manbalari
- **Ob-havo** — Open-Meteo, kalitsiz, har 10 daqiqada.
- **Real tirbandlik (butun shahar xaritasi), yoʻl hodisalari va koʻcha tezligi** — TomTom. Hamma tashrif buyuruvchilar koʻrishi uchun sayt egasi `js/keys.js` fayliga TomTom kalitini yozadi va TomTom panelida kalitni faqat sayt domeniga cheklaydi.
- Real maʼlumot boʻlmagan joyda sayt taxminiy rang chizmaydi — “ulanmagan” deb yozadi.

### Kalitlar (ixtiyoriy)
“Sozlamalar” (⚙) oynasida kiritiladi va **faqat shu brauzerda** saqlanadi:
- **TomTom** — [developer.tomtom.com](https://developer.tomtom.com/) saytida bepul kalit olish mumkin (Traffic Flow API). Kalit bilan koʻchalarning haqiqiy tirbandligi oʻlchanadi, bashorat uchun tarix toʻplanadi va model kalibrlanadi.
- **OpenAI** — AI tahlilchi uchun. Modellar quyidagi tartibda sinab koʻriladi: `gpt-5.4-mini` → `gpt-5.5` → `gpt-4.1-mini`.

## Tuzilma

```
index.html
css/app.css
js/core.js              sozlamalar, geometriya, fazoviy indeks, kesh, formatlash
js/data/osm.js          Overpass (4 ta server parallel, qayta urinish, localStorage kesh)
js/data/tomtom.js       TomTom Traffic Flow
js/analysis/model.js    koʻchalar, yoʻnalishlar, muammolar, KPI, transport indeksi
js/analysis/forecast.js soatbay bashorat va TomTom tarixi
js/sim/simcore.js       graf + gravitatsion talab + MSA/BPR muvozanati (Web Worker’da ishlaydi)
js/sim/client.js        Worker (Blob) va zaxira rejim
js/map.js               Leaflet qatlamlari
js/ai.js                AI tahlilchi
js/ui/                  panel koʻrinishlari va SVG grafik
vendor/leaflet/         Leaflet 1.9.4 (BSD-2)
tests/                  Playwright testi (sintetik maʼlumot bilan)
```

Shahar maʼlumotlarini (masalan, avtobus GPS yoki chorrahalardagi sanoqlar) ulash uchun `js/data/` papkasiga yangi yuklovchi qoʻshib, `NX.analysis.refresh` va `NX.forecast.addSample` funksiyalarini ishlatish mumkin.

## Test

```bash
npx http-server -p 8765 -s . &
NODE_PATH=$(npm root -g) node tests/e2e.cjs
```

Testda Overpass, TomTom va OpenAI javoblari **sintetik** maʼlumot bilan almashtiriladi (`tests/fixture.cjs`, faqat test uchun). Quyidagilar tekshiriladi:
- maʼlumot yuklanishi va koʻchani bosish;
- TomTom oʻlchovi, bir tomonlama va yopish stsenariylari, avtobus liniyalarini qayta yoʻnaltirish;
- bashorat grafigi va kalibrlash;
- JSON eksport va AI soʻrovi;
- kesh/oflayn rejim va xato holati;
- 390 px kenglikda gorizontal aylantirish yoʻqligi va konsol xatolari.

## Cheklovlar

- Simulyatsiya — soddalashtirilgan model: talab matritsasi oʻlchanmagan, u koʻcha va bekatlar zichligidan taxmin qilinadi. Aniq natija olish uchun model chorraha sanoqlari bilan kalibrlanishi kerak.
- TomTom tarixi boʻlmasa, bashorat tipik shahar profiliga asoslanadi va bu ilovada “ishonch past” deb belgilanadi.
- Bekatlar oraligʻi toʻgʻri chiziq boʻyicha hisoblanadi.
- Tavsiyalardagi narxlar taxminiy. Aniq qiymat loyiha-smeta hujjati bilan belgilanadi.

Maʼlumot: © OpenStreetMap hissadorlari (ODbL).
