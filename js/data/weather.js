/* City Jam — Samarqand ob-havosi (Open-Meteo, kalitsiz, real vaqt) */
(function () {
  'use strict';
  const NX = window.NX;
  const KEY = 'weather:v1';

  // WMO ob-havo kodlari → oddiy oʻzbekcha
  function codeText(c) {
    if (c === 0) return ['Ochiq osmon', '☀️'];
    if (c <= 2) return ['Biroz bulutli', '🌤️'];
    if (c === 3) return ['Bulutli', '☁️'];
    if (c === 45 || c === 48) return ['Tuman', '🌫️'];
    if (c >= 51 && c <= 57) return ['Shivalama yomgʻir', '🌦️'];
    if (c >= 61 && c <= 67) return ['Yomgʻir', '🌧️'];
    if (c >= 71 && c <= 77) return ['Qor', '🌨️'];
    if (c >= 80 && c <= 82) return ['Jala', '🌧️'];
    if (c >= 85 && c <= 86) return ['Qor yogʻmoqda', '🌨️'];
    if (c >= 95) return ['Momaqaldiroq', '⛈️'];
    return ['—', '🌡️'];
  }

  // Ob-havoning yoʻlga taʼsiri — faqat haqiqiy koʻrsatkichlarga qarab, oddiy tilda
  function roadAdvice(w) {
    const out = [];
    if (w.snow > 0 || (w.temp <= 0 && w.precip > 0)) out.push('Yoʻl sirpanchiq boʻlishi mumkin — sekin yuring.');
    else if (w.precip > 0) out.push('Yoʻl hoʻl — tormoz masofasi uzayadi, harakat sekinlashishi mumkin.');
    if (w.code === 45 || w.code === 48 || (w.visibility != null && w.visibility < 1000)) out.push('Koʻrinish yomon — faralarni yoqing.');
    if (w.wind >= 40) out.push('Kuchli shamol.');
    if (w.temp >= 38) out.push('Juda issiq — bekatlarda soyabon zarur.');
    if (!out.length) out.push('Ob-havo harakatga xalal bermaydi.');
    return out;
  }

  async function load(force) {
    const c = NX.store.get(KEY, null);
    if (!force && c && Date.now() - c.ts < 10 * 60 * 1000) return c;
    const [lat, lon] = NX.config.center;
    const url = `${NX.config.weatherUrl}?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_speed_10m,visibility&timezone=Asia%2FSamarkand`;
    let r;
    try { r = await NX.fetchJSON(url, {}, 12000); } catch (e) { if (c) return Object.assign({}, c, { stale: true }); throw new Error('Ob-havo yuklanmadi.'); }
    if (!r.ok || !r.data || !r.data.current) { if (c) return Object.assign({}, c, { stale: true }); throw new Error('Ob-havo yuklanmadi.'); }
    const cur = r.data.current;
    const w = {
      ts: Date.now(), time: cur.time, temp: cur.temperature_2m, feels: cur.apparent_temperature, precip: cur.precipitation || 0,
      snow: cur.snowfall || 0, code: cur.weather_code, wind: cur.wind_speed_10m, visibility: cur.visibility,
    };
    NX.store.set(KEY, w);
    return w;
  }

  NX.weather = { load, codeText, roadAdvice };
})();
