/* City Jam — sayt egasining umumiy kalitlari (ixtiyoriy).
   TomTom kaliti shu yerga yozilsa, saytga kirgan HAR BIR kishi real tirbandlik va yoʻl hodisalarini koʻradi.
   Muhim: developer.tomtom.com → kalit sozlamalarida faqat sayt domenini (masalan, *.github.io) ruxsat eting —
   shunda kalitni boshqa saytlar ishlata olmaydi. Foydalanuvchi “Sozlamalar”da oʻz kalitini kiritsa, u ustun turadi. */
/* aiProxy — AI proksi manzili (worker/ai-proxy.js, Cloudflare Worker). Bu sir emas: OpenAI kaliti Worker ichida yashirin turadi. */
/* mapillary — Mapillary “Client Token” (brauzer uchun moʻljallangan, sir emas). */
/* yandex — Yandex JavaScript API kaliti (developer.tech.yandex.ru). Kalit sozlamasida “HTTP Referer” ga sayt domenini yozing. */
window.CITYJAM_KEYS = {
  yandex: 'cac5c421-e0f9-4d7e-875c-f112c310a77c',
  aiProxy: 'https://cityjam-ai.diyorjonabdurahmonov1.workers.dev',
  tomtom: '', // Samarqandda TomTom maʼlumoti yoʻq — real tirbandlik Yandex orqali
  mapillary: 'MLY|28796677959995776|79ec8ab3d093cdbb110d09705d3c6149', // Mapillary client token — ochiq koʻcha suratlari (svetofor/zebra tekshiruvi)
};
