# NEXUS Transport — Samarqand

Samarqand tarixiy markazi uchun koʻcha harakati va jamoat transportini **tahlil qiluvchi va bashorat qiluvchi** xaritaga asoslangan veb-ilova. Barcha maʼlumot ochiq manbalardan brauzerning oʻzida yuklanadi. Ilova uchun server yoki pullik xizmat kerak emas.

**Pilot hudud:** 39.640–39.670 shm. k., 66.950–67.000 shq. u. (markaz — Registon).

## Imkoniyatlar

| Boʻlim | Nima qiladi |
|---|---|
| **Xarita** | Tirbandlik ranglari, avtobus yoʻnalishlari, bekatlar, muammolar va maktablar qatlamlari. Istalgan koʻchani bosib, uning toʻliq maʼlumotini, TomTom oʻlchovini, xavf indeksini, 24 soatlik bashoratini koʻrish va “Agar…?” simulyatsiyasini ishga tushirish mumkin. |
| **Yoʻnalishlar** | Avtobus yoʻnalishlarini qidirish. Har bir yoʻnalish uchun bekatlar, bekatlar oraligʻi va oʻtadigan koʻchalar koʻrsatiladi, yoʻnalish xaritada ajratib koʻrsatiladi. |
| **Bashorat** | Soatbay tirbandlik bashorati va uning ishonch oraligʻi. Xaritani kun va soat boʻyicha bashoratga koʻra boʻyash mumkin. TomTom tarixini import/eksport qilish va modelni kalibrlash ham shu yerda. |
| **Hisobot** | Koʻrsatkichlar, eng tirband koʻchalar, ustuvorlik boʻyicha tavsiyalar (taxminiy narxlari soʻmda), maʼlumot manbalari, “Qanday ishlaydi” boʻlimi va JSON eksport. |
| **AI tahlilchi** | Oʻzbekcha savoldan koʻcha nomi va stsenariyni aniqlaydi, simulyatsiyani ishga tushiradi va natijani OpenAI’ga faqat haqiqiy raqamlar bilan yuboradi. Kalit kiritilmagan boʻlsa, javob hisoblangan raqamlardan avtomatik tuziladi. |

Har bir raqam yonida manba belgisi turadi: **OpenStreetMap**, **TomTom**, **Hisob** (qoidaga asoslangan hisob), **Bashorat** (model natijasi) yoki **AI**.

## Ishga tushirish

Ilova oddiy statik saytdan iborat, build bosqichi yoʻq.

```bash
npx http-server -p 8080 .     # yoki: python3 -m http.server 8080
# brauzerda: http://localhost:8080
```

`index.html` faylini toʻgʻridan-toʻgʻri ochsa ham (`file://`) ishlaydi. Bunda asos xarita sifatida Esri World Street Map ishlatiladi.

**GitHub Pages:** repo sozlamalarida *Settings → Pages → Deploy from a branch → `main` / root* ni tanlang.

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
