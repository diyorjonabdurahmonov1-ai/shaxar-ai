/* City Jam — hokimiyat xodimlari soʻrashi mumkin boʻlgan savollar katalogi va savol turini aniqlash.
   Har bir savol turi uchun sayt oʻz hisobini qiladi (koʻcha tarmogʻi, relyef, binolar, harakat modeli) va natijani XARITADA chizadi;
   AI shu hisob asosida javob yozadi. “rasm chiz” qoʻshilsa — javob rasmi ham chiziladi. */
(function () {
  'use strict';
  const NX = window.NX;
  const A = '[ʻ\'‘’`]?';
  const R = {
    quake: /zilzila|yer\s*qimirla|silkin|seysm/i,
    flood: new RegExp(`yomg${A}ir|jala|\\bsel\\b|sel\\s|toshqin|suv\\s*bos|suv\\s*tosh|\\d+\\s*mm`, 'i'),
    fire: new RegExp(`yong${A}in|o${A}t\\s*o${A}chir|o${A}t\\s*ketsa|olov`, 'i'),
    ambulance: /tez\s*yordam|ambulans|skoraya|kasalxona(ga)?\s*(qancha|nech|yet)|shifoxona(ga)?\s*(qancha|nech|yet)/i,
    police: /politsiya|militsiya|\biiv\b|patrul/i,
    evac: new RegExp(`evaku|avaku|xa[f]?vsiz\\s*(yo${A}l|joy)|qayerga\\s*qoch|boshpana|panoh|yig${A}ilish\\s*joy|chiqarib\\s*yubor|ko${A}chir`, 'i'),
    needs: /nima\s*qur|nima\s*quril|nima\s*qo[ʻ'‘`]?y|nima\s*och|nima\s*yetishma|yetishmay|qanday\s*obyekt|foydali|ehtiyoj/i,
    build: /(\d{2,5})\s*(ta\s*)?(xonadon|kvartira|honadon)|(\d{1,2})\s*-?\s*(qavat|etaj)|\bdom\b|uy-joy|turar\s*joy\s*qur/i,
    traffic: /prop|probk|tirban|tiqil|tig[ʻ'‘`]?iz|navbat|oqim|bir\s*tomon|yops|svetofor|polosa|yo[ʻ'‘`]?lak|chorraha|bekat|avtobus|marshrut/i,
    climate: /iqlim|harorat|isish|issiq|qurg[ʻ'‘`]?oqchilik|o[ʻ'‘`]?zgidromet/i,
    solar: /quyosh|panel|energiya|tom(lar)?ga/i,
    image: /rasm|chiz|surat|tasvir|vizual|ko[ʻ'‘`]?rinishini/i,
    mahalla: /mahalla|har\s*bir|aholi\s*uchun|hudud(lar)?\s*uchun/i,
    // Qoʻshimcha belgilar — bir xil hodisa uchun nimani koʻrsatish kerakligi
    blocked: new RegExp(`to${A}sil|yopilib|yopiladi|vayrona|bloklan|o${A}tib\\s*bo${A}lmay|o${A}ta\\s*olma|o${A}tolma|kira\\s*olma`, 'i'),
    critical: new RegExp(`maktab|shifoxona|bog${A}cha|kasalxona|poliklinika`, 'i'),
    rescue: new RegExp(`baland\\s*(joy|nuqta)|eng\\s*baland|olib\\s*chiq|chiqarib|xavfsiz\\s*joy|qayerga\\s*(bor|ket|qoch)`, 'i'),
  };
  const HAZARD = ['quake', 'flood', 'fire', 'ambulance', 'police', 'evac'];
  // Asosiy tur (birinchi mos kelgani) + qoʻshimcha belgilar
  function intent(q) {
    const t = String(q || '');
    const main = ['quake', 'flood', 'fire', 'ambulance', 'police', 'evac', 'climate', 'solar', 'needs', 'build', 'traffic'].find(k => R[k].test(t)) || 'general';
    return { main, hazard: HAZARD.includes(main), image: R.image.test(t), mahalla: R.mahalla.test(t), evac: R.evac.test(t) || R.rescue.test(t), blocked: R.blocked.test(t), critical: R.critical.test(t) };
  }

  // Katalog: [savol, kutilgan tur]
  const QUESTIONS = [
    { g: '🏚 Zilzila', q: [
      ['9 balli zilzila boʻlsa qayer koʻp zarar koʻradi?', 'quake'],
      ['Zilzilada har bir mahalla aholisini qaysi yoʻldan qayerga evakuatsiya qilamiz?', 'quake'],
      ['8 balli zilzilada qaysi maktab va shifoxonalar xavf ostida?', 'quake'],
      ['Zilziladan keyin odamlar yigʻiladigan xavfsiz joylar qayerda va ular sigʻadimi?', 'quake'],
      ['7 magnitudali zilzila boʻlsa nechta bino ogʻir shikastlanadi?', 'quake'],
      ['Zilzilada belgilangan hududdan eng xavfsiz yoʻl qaysi? Rasmini chiz', 'quake'],
      ['Zilzilada qaysi koʻchalar vayronalar bilan toʻsilib qolishi mumkin, zaxira yoʻl qaysi?', 'quake'],
      ['Yer qimirlasa qaysi mahallalar eng koʻp zarar koʻradi?', 'quake'],
      ['Zilziladan keyin qutqaruvchilar qaysi koʻchalardan oʻta olmaydi?', 'quake'],
      ['Seysmik xavf boʻyicha eng zaif binolar qayerda?', 'quake'],
    ] },
    { g: '🌧 Suv toshqini', q: [
      ['50 mm yomgʻir yogʻsa qaysi koʻchalarni suv bosadi?', 'flood'],
      ['Suv toshsa evakuatsiya uchun eng baland xavfsiz joy qayer?', 'flood'],
      ['Kuchli jala boʻlsa suv bosgan koʻchalardan odamlarni qaysi yoʻldan olib chiqamiz?', 'flood'],
      ['Ertaga yomgʻir kutilyaptimi, qayerda suv toʻplanadi?', 'flood'],
      ['100 mm sel kelsa qaysi maktab va binolarga suv kiradi?', 'flood'],
      ['Ariqlar tiqilgan boʻlsa 30 mm yomgʻirda nima boʻladi?', 'flood'],
      ['Suv bosgan mahallalardan aholini qayerga koʻchiramiz?', 'flood'],
      ['Jala quysa qayerda suv toʻplanadi?', 'flood'],
      ['80 mm yomgʻirda qaysi uylarga suv kiradi?', 'flood'],
      ['Kuchli yomgʻirdan keyin suv qancha vaqtda ketadi?', 'flood'],
      ['Toshqin boʻlsa qaysi maktablarga suv yetadi?', 'flood'],
    ] },
    { g: '🚒 Yongʻin, tez yordam, politsiya', q: [
      ['Yongʻin boʻlsa oʻt oʻchiruvchilar qaysi hududlarga 10 daqiqada yetib bora olmaydi?', 'fire'],
      ['Belgilangan hududga oʻt oʻchirish mashinasi qaysi yoʻldan necha daqiqada keladi?', 'fire'],
      ['Tez yordam qayerga kech yetib boradi?', 'ambulance'],
      ['Tez yordam Registon koʻchasiga necha daqiqada yetib keladi?', 'ambulance'],
      ['Olov chiqsa belgilangan hududga eng yaqin oʻt oʻchirish qismi qaysi?', 'fire'],
      ['Politsiya patrul xizmati qaysi hududlarga uzoq?', 'police'],
      ['Yangi oʻt oʻchirish qismini qayerga qurish kerak?', 'fire'],
    ] },
    { g: '🚦 Transport', q: [
      ['Eng tirband koʻchalar qaysi va nima qilish kerak?', 'traffic'],
      ['Registon koʻchasini bir tomonlama qilsak nima boʻladi?', 'traffic'],
      ['Qaysi chorrahaga svetofor kerak?', 'traffic'],
      ['Qayerga yangi avtobus bekati kerak?', 'traffic'],
      ['Qaysi chorrahalarda piyodalar oʻtish yoʻlagi kam?', 'traffic'],
      ['Ertalab tigʻiz soatda qayerda navbat hosil boʻladi?', 'traffic'],
    ] },
    { g: '🏗 Qurilish va hudud (xaritada hudud belgilang)', q: [
      ['Bu yerga 500 xonadonli 9 qavatli dom qursam nima boʻladi?', 'build'],
      ['Shu yerga nima qursam foydali boʻladi?', 'needs'],
      ['Bu mahallada nima yetishmaydi — maktab, bogʻcha, poliklinika?', 'needs'],
      ['Bu yerga bogʻcha qursam foydalimi, qayer mos?', 'needs'],
    ] },
    { g: '☀️ Iqlim va energiya', q: [
      ['Samarqand iqlimi qanday oʻzgaryapti?', 'climate'],
      ['Qaysi binolar tomiga quyosh paneli qoʻyish foydali?', 'solar'],
    ] },
  ];

  NX.intent = intent;
  NX.intent.R = R;
  NX.QUESTIONS = QUESTIONS;
})();
