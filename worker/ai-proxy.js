/* City Jam — AI proksi va xarita tuzatishlari (Cloudflare Worker).
   /corrections — foydalanuvchilar “svetofor bor”, “muammo emas” kabi tuzatishlari (KV: CORRECTIONS, yozish ADMIN_PIN bilan).
   /reports — odamlarning “hozir bu yerda tirbandlik” xabarlari (KV: CORRECTIONS, kalit "reports"; PINsiz, IP boʻyicha limit).
   /photo-check — muammo joyining real suratini (Mapillary) AI koʻradi: svetofor / piyoda oʻtish bormi. Natija KV’da saqlanadi —
                  har bir joy faqat bir marta tekshiriladi (pul bir marta sarflanadi), natijani hamma foydalanuvchi koʻradi.
   /photo-checks — saqlangan barcha natijalar (GET).
   /webcams — ochiq vebkameralar (Windy Webcams API; kalit — WINDY_KEY maxfiy oʻzgaruvchisida). Faqat egalari hammaga eʼlon qilgan kameralar.
   /layers — shahar tizimlari xaritalari (kameralar, elektr, gaz, suv, kanalizatsiya; GeoJSON). Oʻqish — hamma xodimlar,
             yuklash/oʻchirish — xodim kodi bilan (ADMIN_PIN maxfiy oʻzgaruvchisi).
   Muhim: bu xizmat hokimiyat xodimlari uchun. Sayt va Worker’ni Cloudflare Access (kirish faqat xodimlar emaili bilan) ortiga qoʻyish tavsiya etiladi.
   /traffic — tirbandlik kuzatuvi: yirik chorrahalarga kiruvchi yoʻllarda Yandex marshrut vaqti (probkali / probkasiz).
              Sayt ochiq turgan brauzer (yoki kuzatuv ekrani) har 15 daqiqada oʻlchab POST qiladi; Worker tarixni KV’da
              (kalit "trf:state") yigʻadi: oxirgi oʻlchov, 60 kunlik qatorlar, har kun xulosasi (doimiy), kun arxivi trf:day:YYYY-MM-DD (doimiy), haftaning ish/dam kunlari boʻyicha har 30 daqiqalik oʻrtacha.
   /stt — ovozni matnga (oʻzbekcha; OpenAI gpt-4o-mini-transcribe, zaxira whisper-1), IP boʻyicha 120/soat.
   /feedback — AI javoblariga xodimlar bahosi (👍/👎 + izoh), KV "feedback"; sayt salbiy baholarni keyingi promptlarga “oldingi xatolar” qilib qoʻshadi.
   /search — internetdan ochiq maʼlumot qidirish (OpenAI web_search), manba havolalari bilan.
   /image  — taklif qilingan yechimning AI rasmi (gpt-image); real surat (Mapillary) berilsa, shu surat ustiga chiziladi.
   Asosiy manzil (/) — chat; xabarda Mapillary surati (rasm havolasi) boʻlishi mumkin — AI suratni koʻrib tahlil qiladi.
   OpenAI kaliti shu yerda YOZILMAYDI: u Cloudflare panelida “OPENAI_API_KEY” nomli maxfiy (Secret) oʻzgaruvchida turadi.
   Sayt savolni shu Worker’ga yuboradi, Worker esa OpenAI’ga kalit bilan soʻraydi — kalit hech qachon brauzerga chiqmaydi.
   Himoya: faqat sayt domenidan soʻrov, faqat ruxsat etilgan modellar, soʻrov hajmi va javob uzunligi cheklangan,
   bir IP manzildan soatiga cheklangan miqdordagi savol. Qoʻshimcha himoya uchun OpenAI panelida oylik budjet limitini qoʻying. */
const ALLOWED_ORIGINS = ['https://diyorjonabdurahmonov1-ai.github.io'];
// Ruxsat etilgan modellar. GPT-6 Sol — asosiy, Luna — arzon (koʻp sonli oddiy soʻrovlar), qolganlari — zaxira
const MODELS = ['gpt-6-sol', 'gpt-6-luna', 'gpt-5.4-mini', 'gpt-5.5', 'gpt-4.1-mini',
  // Ixtiyoriy: Claude (maxfiy ANTHROPIC_API_KEY) va Gemini (maxfiy GEMINI_API_KEY). Kalit qoʻyilmasa — 503, sayt OpenAI’ga qaytadi.
  'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const LIGHT = ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-4.1-mini'];
let PER_IP_PER_HOUR = 300;   // hokimiyat xodimlari bitta umumiy IP (NAT) orqali chiqadi; bir savol 2–3 AI soʻrovi (javob + tekshiruv); env PER_IP_PER_HOUR bilan oʻzgartiriladi
let ALL_PER_HOUR = 900;      // butun sayt boʻyicha soatlik chegara (Worker nusxasi ichida, eng yaxshi harakat) — kutilmagan xarajatdan himoya; env ALL_PER_HOUR
const MAX_BODY_CHARS = 60000;
const SEARCH_PER_IP_HOUR = 8, IMAGES_PER_IP_HOUR = 4, IMAGES_PER_DAY = 40;
const IMAGE_MODELS = ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'];
// Faqat Mapillary suratlari (Meta CDN) AI’ga koʻrsatiladi
const PHOTO_OK = u => { try { const h = new URL(u); return h.protocol === 'https:' && /(^|\.)(fbcdn\.net|mapillary\.com|windy\.com|digitraffic\.fi)$/.test(h.hostname); } catch (e) { return false; } };
const limit = (key, max) => { const k = key + ':' + Math.floor(Date.now() / 3600000); const n = (hits.get(k) || 0) + 1; hits.set(k, n); if (hits.size > 5000) hits.clear(); return n > max; };
// Xabar matni yoki [matn, surat] qismlari
function cleanContent(c) {
  if (!Array.isArray(c)) return String(c || '');
  const parts = [];
  let imgs = 0;
  c.slice(0, 8).forEach(x => {
    if (x && x.type === 'text') parts.push({ type: 'text', text: String(x.text || '') });
    else if (x && x.type === 'image_url' && x.image_url && PHOTO_OK(x.image_url.url) && imgs < 4) { imgs++; parts.push({ type: 'image_url', image_url: { url: String(x.image_url.url), detail: 'low' } }); }
  });
  return parts;
}
const hits = new Map(); // Worker nusxasi ichidagi oddiy hisoblagich (eng yaxshi harakat)

// Xodim kodi: hozircha OCHIQ (foydalanuvchi talabi — hamma bemalol ishlatsin). Yoqish: Cloudflare’da oʻzgaruvchi REQUIRE_PIN=1 (+ ADMIN_PIN)
const pinOk = (env, code) => env.REQUIRE_PIN !== '1' || (!!env.ADMIN_PIN && String(code || '') === String(env.ADMIN_PIN));
const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) });

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(trafficCron(env)); },
  async fetch(req, env) {
    if (env.PER_IP_PER_HOUR) PER_IP_PER_HOUR = +env.PER_IP_PER_HOUR || PER_IP_PER_HOUR;
    if (env.ALL_PER_HOUR) ALL_PER_HOUR = +env.ALL_PER_HOUR || ALL_PER_HOUR;
    const origin = req.headers.get('Origin') || '';
    const okOrigin = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Staff-Code',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (path === '/webcams') return webcams(req, env, cors);
    if (path === '/version') return json({ v: 13, features: ['vision', 'search', 'image', 'photo-check', 'image-multi', 'layers', 'traffic', 'feedback', 'effort', 'osm', 'limits-env', 'stt'] }, 200, cors);
    if (path === '/layers' || path.startsWith('/layers/')) return layers(req, env, cors, okOrigin, path);
    if (path === '/photo-checks' || path === '/photo-check') return photoChecks(req, env, cors, okOrigin, path);
    if (path === '/corrections') return corrections(req, env, cors, okOrigin);
    if (path === '/reports') return reports(req, env, cors, okOrigin);
    if (path === '/traffic') return traffic(req, env, cors, okOrigin);
    if (path === '/feedback') return feedback(req, env, cors, okOrigin);
    if (path === '/osm') return osmSnapshot(req, env, cors, okOrigin);
    if (path === '/stt') return stt(req, env, cors, okOrigin);
    if (path === '/search' || path === '/image') {
      if (req.method !== 'POST') return json({ error: { code: 'method', message: 'Faqat POST' } }, 405, cors);
      if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
      if (!env.OPENAI_API_KEY) return json({ error: { code: 'no_server_key', message: 'Serverda OpenAI kaliti sozlanmagan' } }, 500, cors);
      const raw = await req.text();
      if (raw.length > (path === '/image' ? 1500000 : 8000)) return json({ error: { code: 'too_large', message: 'Soʻrov juda katta' } }, 413, cors);
      let b;
      try { b = JSON.parse(raw); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
      const ip = req.headers.get('CF-Connecting-IP') || 'x';
      return path === '/search' ? search(b, env, cors, ip) : image(b, env, cors, ip);
    }
    if (req.method !== 'POST') return json({ error: { code: 'method', message: 'Faqat POST' } }, 405, cors);
    if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
    if (!env.OPENAI_API_KEY) return json({ error: { code: 'no_server_key', message: 'Serverda OpenAI kaliti sozlanmagan' } }, 500, cors);

    // Soatlik limit
    const ip = req.headers.get('CF-Connecting-IP') || 'x';
    const hour = Math.floor(Date.now() / 3600000);
    const k = ip + ':' + hour;
    const n = (hits.get(k) || 0) + 1;
    hits.set(k, n);
    if (hits.size > 5000) hits.clear();
    if (n > PER_IP_PER_HOUR) return json({ error: { code: 'proxy_rate_limit', message: 'Soatlik savollar limiti tugadi' } }, 429, cors);
    if (limit('all', ALL_PER_HOUR)) return json({ error: { code: 'proxy_rate_limit', message: 'Soatlik umumiy limit tugadi' } }, 429, cors);

    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return json({ error: { code: 'too_large', message: 'Soʻrov juda katta' } }, 413, cors);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
    if (!MODELS.includes(body.model) || !Array.isArray(body.messages) || body.messages.length > 4) {
      return json({ error: { code: 'model_not_found', message: 'Model yoki xabarlar ruxsat etilmagan' } }, 400, cors);
    }
    const out = { model: body.model, messages: body.messages.map(m => ({ role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user', content: cleanContent(m.content) })) };
    out.max_completion_tokens = Math.min(+body.max_completion_tokens || 900, 4000);
    if (/^gpt-[56]/.test(body.model)) out.reasoning_effort = body.reasoning_effort === 'medium' ? 'medium' : 'low'; else if (/^gpt-/.test(body.model)) out.temperature = 0.3;
    // Prompt caching: bir turdagi soʻrovlar bitta kalit bilan (oʻzgarmas system prompt boshida)
    if (typeof body.prompt_cache_key === 'string') out.prompt_cache_key = body.prompt_cache_key.slice(0, 64);

    if (/^claude-/.test(body.model)) return anthropic(out, env, cors);
    if (/^gemini-/.test(body.model)) return gemini(out, env, cors);
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY },
      body: JSON.stringify(out),
    });
    return new Response(await r.text(), { status: r.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
  },
};

// ---------- Boshqa AI provayderlari (javob OpenAI “choices” shakliga keltiriladi — sayt oʻzgarmaydi) ----------
const asOpenAI = (text, model, cors) => json({ model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] }, 200, cors);
async function anthropic(out, env, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: { code: 'provider_off', message: 'Claude kaliti qoʻyilmagan' } }, 503, cors);
  const sys = out.messages.filter(m => m.role === 'system').map(m => (typeof m.content === 'string' ? m.content : m.content.map(x => x.text || '').join('\n'))).join('\n\n');
  const msgs = out.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map(x => (x.type === 'text' ? { type: 'text', text: x.text } : { type: 'image', source: { type: 'url', url: x.image_url.url } })) }));
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: out.model, system: sys ? [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }] : undefined, messages: msgs, max_tokens: 8000, output_config: { effort: 'low' } }),
  });
  const d = await r.json().catch(() => null);
  // Claude 5.5 da temperature yoʻq, fikrlash doim yoqiq — chuqurlik effort bilan; javob max_tokens’ga sigʻmasa ham matn qaytariladi
  if (!r.ok || !d) return json({ error: { code: 'provider_error', message: (d && d.error && d.error.message) || 'Claude javob bermadi' } }, r.status || 502, cors);
  return asOpenAI((d.content || []).filter(x => x.type === 'text').map(x => x.text).join(''), out.model, cors);
}
async function gemini(out, env, cors) {
  if (!env.GEMINI_API_KEY) return json({ error: { code: 'provider_off', message: 'Gemini kaliti qoʻyilmagan' } }, 503, cors);
  // Gemini OpenAI-mos manzili; suratlar faqat matn sifatida (tashqi URL qoʻllanmaydi)
  const messages = out.messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.filter(x => x.type === 'text').map(x => x.text).join('\n') }));
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GEMINI_API_KEY },
    body: JSON.stringify({ model: out.model, messages, max_tokens: out.max_completion_tokens, temperature: 0.3 }),
  });
  return new Response(await r.text(), { status: r.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
}

// ---------- Xarita tuzatishlari ----------
const KINDS = ['signal', 'crossing', 'stop', 'dismiss'];
async function corrections(req, env, cors, okOrigin) {
  if (!env.CORRECTIONS) return json({ error: { code: 'no_kv', message: 'Tuzatishlar ombori ulanmagan' } }, 501, cors);
  const list = JSON.parse((await env.CORRECTIONS.get('list')) || '[]');
  if (req.method === 'GET') return json({ items: list }, 200, Object.assign({ 'Cache-Control': 'no-store' }, cors));
  if (req.method !== 'POST') return json({ error: { code: 'method', message: 'GET yoki POST' } }, 405, cors);
  if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
  let body;
  try { body = JSON.parse(await req.text()); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
  if (!pinOk(env, body.pin)) return json({ error: { code: 'bad_pin', message: 'PIN-kod notoʻgʻri' } }, 403, cors);
  let out = list;
  if (body.action === 'remove') out = list.filter(x => x.id !== body.id);
  else if (body.action === 'add') {
    const it = body.item || {};
    const lat = +it.lat, lon = +it.lon;
    if (!KINDS.includes(it.kind) || !isFinite(lat) || !isFinite(lon)) return json({ error: { code: 'bad_item', message: 'Notoʻgʻri tuzatish' } }, 400, cors);
    const clean = { id: String(it.id || Date.now()).slice(0, 40), kind: it.kind, lat: +lat.toFixed(6), lon: +lon.toFixed(6), key: String(it.key || '').slice(0, 80), note: String(it.note || '').slice(0, 200), ts: Date.now() };
    out = list.filter(x => x.id !== clean.id).concat([clean]).slice(-3000);
  } else return json({ error: { code: 'bad_action', message: 'add yoki remove' } }, 400, cors);
  await env.CORRECTIONS.put('list', JSON.stringify(out));
  return json({ items: out }, 200, cors);
}

// ---------- Tirbandlik xabarlari (real kuzatuv, odamlardan) ----------
const REPORT_DAYS = 60, REPORTS_PER_IP_HOUR = 12;
async function reports(req, env, cors, okOrigin) {
  if (!env.CORRECTIONS) return json({ error: { code: 'no_kv', message: 'Ombor ulanmagan' } }, 501, cors);
  const cutoff = Date.now() - REPORT_DAYS * 86400e3;
  const list = JSON.parse((await env.CORRECTIONS.get('reports')) || '[]').filter(r => r.ts > cutoff);
  if (req.method === 'GET') return json({ items: list }, 200, Object.assign({ 'Cache-Control': 'no-store' }, cors));
  if (req.method !== 'POST') return json({ error: { code: 'method', message: 'GET yoki POST' } }, 405, cors);
  if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
  const ip = req.headers.get('CF-Connecting-IP') || 'x', k = 'r:' + ip + ':' + Math.floor(Date.now() / 3600000);
  const n = (hits.get(k) || 0) + 1; hits.set(k, n);
  if (n > REPORTS_PER_IP_HOUR) return json({ error: { code: 'proxy_rate_limit', message: 'Bir soatda juda koʻp xabar' } }, 429, cors);
  let b;
  try { b = JSON.parse(await req.text()); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
  const lat = +b.lat, lon = +b.lon, level = +b.level;
  if (!isFinite(lat) || !isFinite(lon) || ![1, 2, 3].includes(level) || Math.abs(lat - 39.655) > 0.2 || Math.abs(lon - 66.975) > 0.2) {
    return json({ error: { code: 'bad_item', message: 'Notoʻgʻri xabar' } }, 400, cors);
  }
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), lat: +lat.toFixed(5), lon: +lon.toFixed(5), level, street: String(b.street || '').slice(0, 80), name: String(b.name || '').slice(0, 80) };
  const out = list.concat([item]).slice(-20000);
  await env.CORRECTIONS.put('reports', JSON.stringify(out));
  return json({ item }, 200, cors);
}

// ---------- Ovozni matnga (oʻzbekcha): brauzer yozgan audio → OpenAI transcription ----------
async function stt(req, env, cors, okOrigin) {
  if (req.method !== 'POST') return json({ error: { code: 'method', message: 'Faqat POST' } }, 405, cors);
  if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
  if (!env.OPENAI_API_KEY) return json({ error: { code: 'no_server_key', message: 'Serverda OpenAI kaliti sozlanmagan' } }, 500, cors);
  if (limit('stt:' + (req.headers.get('CF-Connecting-IP') || 'x'), 120)) return json({ error: { code: 'proxy_rate_limit', message: 'Bir soatda juda koʻp ovozli soʻrov' } }, 429, cors);
  const buf = await req.arrayBuffer();
  if (buf.byteLength < 800) return json({ error: { code: 'empty', message: 'Ovoz yozilmadi' } }, 400, cors);
  if (buf.byteLength > 6e6) return json({ error: { code: 'too_large', message: 'Ovoz juda uzun (≤ 60 soniya)' } }, 413, cors);
  const type = (req.headers.get('Content-Type') || 'audio/webm').split(';')[0], ext = /ogg/.test(type) ? 'ogg' : /mp4|m4a|aac/.test(type) ? 'm4a' : /wav/.test(type) ? 'wav' : 'webm';
  const prompt = 'Samarqand shahar hokimiyati. City Jam. Oʻzbek tili, lotin yozuvi. Registon, Rudakiy, Daxbet, Ibn Sino, Amir Temur koʻchasi, mahalla, tirbandlik, probka, zilzila, suv toshqini, evakuatsiya, 3D egizak, xarita, hisobot.';
  for (const model of ['gpt-4o-mini-transcribe', 'whisper-1']) {
    const f = new FormData();
    f.append('file', new Blob([buf], { type }), 'ovoz.' + ext); f.append('model', model); f.append('language', 'uz'); f.append('prompt', prompt);
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: f });
    if (r.ok) { const d = await r.json(); return json({ text: String(d.text || '').trim(), model }, 200, cors); }
    if (r.status !== 404 && r.status !== 400) return json({ error: { code: 'stt_error', message: 'Ovozni tanish xatosi: HTTP ' + r.status } }, 502, cors);
  }
  return json({ error: { code: 'stt_error', message: 'Ovozni tanish modeli topilmadi' } }, 502, cors);
}

// ---------- Xarita maʼlumotining umumiy nusxasi (koʻchalar, bekatlar, avtobus yoʻnalishlari) ----------
// Overpass ishlamasa yoki hamkasbning kompyuterida kesh boʻlmasa, sayt shu nusxani oladi. Yuklash — xodim kodi bilan
// (sayt jonli maʼlumotni olganda, xodim kodi kiritilgan brauzer oʻzi yuboradi, 3 kunda bir marta).
async function osmSnapshot(req, env, cors, okOrigin) {
  if (!env.CORRECTIONS) return json({ error: { code: 'no_kv', message: 'Ombor ulanmagan' } }, 501, cors);
  if (req.method === 'GET') {
    const raw = await env.CORRECTIONS.get('osm:snapshot');
    if (!raw) return json({ error: { code: 'none', message: 'Nusxa yoʻq' } }, 404, cors);
    if (new URL(req.url).searchParams.get('meta') === '1') { const d = JSON.parse(raw); return json({ ts: d.ts, routes: (d.routes || []).length }, 200, Object.assign({ 'Cache-Control': 'no-store' }, cors)); }
    return new Response(raw, { status: 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, cors) });
  }
  if (req.method !== 'POST') return json({ error: { code: 'method', message: 'GET yoki POST' } }, 405, cors);
  if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
  if (!pinOk(env, req.headers.get('X-Staff-Code'))) return json({ error: { code: 'bad_pin', message: 'Xodim kodi notoʻgʻri' } }, 403, cors);
  const raw = await req.text();
  if (raw.length > 6000000) return json({ error: { code: 'too_large', message: 'Nusxa juda katta' } }, 413, cors);
  let d; try { d = JSON.parse(raw); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri nusxa' } }, 400, cors); }
  if (!d || d.v !== 1 || !Array.isArray(d.ways) || d.ways.length < 500 || !Array.isArray(d.pts) || !Array.isArray(d.routes) || d.routes.length < 3) return json({ error: { code: 'bad_item', message: 'Nusxa toʻliq emas' } }, 400, cors);
  await env.CORRECTIONS.put('osm:snapshot', JSON.stringify({ v: 1, ts: d.ts || Date.now(), mirror: 'umumiy nusxa', ways: d.ways, pts: d.pts, routes: d.routes, routesTs: d.routesTs || d.ts }));
  return json({ ok: true }, 200, cors);
}

// ---------- AI javoblariga xodimlar bahosi (👍/👎 + izoh) — AI keyingi javoblarda oldingi xatolarni hisobga oladi ----------
async function feedback(req, env, cors, okOrigin) {
  if (!env.CORRECTIONS) return json({ error: { code: 'no_kv', message: 'Ombor ulanmagan' } }, 501, cors);
  const list = JSON.parse((await env.CORRECTIONS.get('feedback')) || '[]');
  if (req.method === 'GET') return json({ items: list.slice(-200) }, 200, Object.assign({ 'Cache-Control': 'no-store' }, cors));
  if (req.method !== 'POST') return json({ error: { code: 'method', message: 'GET yoki POST' } }, 405, cors);
  if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
  if (limit('fb:' + (req.headers.get('CF-Connecting-IP') || 'x'), 40)) return json({ error: { code: 'proxy_rate_limit', message: 'Bir soatda juda koʻp baho' } }, 429, cors);
  let b;
  try { b = JSON.parse((await req.text()).slice(0, 6000)); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
  const item = { ts: Date.now(), ok: !!b.ok, q: String(b.q || '').slice(0, 300), a: String(b.a || '').slice(0, 700), note: String(b.note || '').slice(0, 400), kind: String(b.kind || '').slice(0, 20) };
  if (!item.q) return json({ error: { code: 'bad_item', message: 'Savol yoʻq' } }, 400, cors);
  await env.CORRECTIONS.put('feedback', JSON.stringify(list.concat([item]).slice(-500)));
  return json({ ok: true }, 200, cors);
}

// ---------- Tirbandlik kuzatuvi (Yandex marshrut vaqtlari, sayt brauzeridan) ----------
// Holat: { latest:{ts,v:{id:[jams,free]}}, rows:[[ts,{id:ratio*100}]] (14 kun), prof:{id:{wd:[48×[n,sum]],we:[48×[n,sum]]}}, n, since }
const TRF_MIN_GAP = 10 * 60e3, TRF_DAYS = 60;
// Oʻlchovni tarixga qoʻshish (POST va cron uchun umumiy)
function trfAdd(st, ts, v, r) {
  const loc = new Date(ts + 5 * 3600e3), slot = loc.getUTCHours() * 2 + (loc.getUTCMinutes() >= 30 ? 1 : 0), we = loc.getUTCDay() === 0 || loc.getUTCDay() === 6 ? 'we' : 'wd';
  st.latest = { ts, v };
  st.rows = st.rows.filter(x => x[0] > ts - TRF_DAYS * 86400e3).concat([[ts, r]]);
  Object.keys(r).forEach(id => {
    const P = st.prof[id] || (st.prof[id] = { wd: Array.from({ length: 48 }, () => [0, 0]), we: Array.from({ length: 48 }, () => [0, 0]) });
    P[we][slot][0]++; P[we][slot][1] += r[id];
  });
  st.n = (st.n || 0) + 1; st.since = st.since || ts;
  // Kunlik xulosa — DOIM saqlanadi: har yoʻl uchun kunning eng yomon nisbati, uning yarim soati, kunlik oʻrtacha, oʻlchovlar soni
  const day = loc.toISOString().slice(0, 10), DS = (st.daysum = st.daysum || {}), d = (DS[day] = DS[day] || {});
  Object.keys(r).forEach(id => { const x = d[id] || (d[id] = [0, 0, 0, 0]); if (r[id] > x[0]) { x[0] = r[id]; x[1] = slot; } x[2] += r[id]; x[3]++; });
  return day;
}
// Kunning xom oʻlchovlari — alohida kalitda, muddatsiz (tarixni keyin qayta tahlil qilish uchun)
async function trfArchive(env, st, day) {
  const rows = st.rows.filter(x => new Date(x[0] + 5 * 3600e3).toISOString().slice(0, 10) === day);
  await env.CORRECTIONS.put('trf:day:' + day, JSON.stringify(rows));
}
// Cron (Cloudflare Triggers, masalan har 15 daqiqa): Yandex “API Матрицы расстояний” (maxfiy YANDEX_MATRIX_KEY) — sayt ochiq boʻlmasa ham.
// Har chorraha: kiruvchi yoʻllar boshlari (origins) → chorraha (destination), avtomobil, joriy probkalar bilan.
// Probkasiz vaqt = shu yoʻlda kuzatilgan eng tez vaqt (odatda kechasi), lekin 30 km/soatdan sekin emas.
const SITE = 'https://diyorjonabdurahmonov1-ai.github.io/shaxar-ai/';
async function trafficCron(env, force) {
  if (!env.YANDEX_MATRIX_KEY || !env.CORRECTIONS) return { err: 'YANDEX_MATRIX_KEY qoʻyilmagan' };
  const st = JSON.parse((await env.CORRECTIONS.get('trf:state')) || 'null') || { latest: null, rows: [], prof: {}, n: 0, since: null };
  if (st.latest && Date.now() - st.latest.ts < TRF_MIN_GAP) return { skipped: true };
  // Soʻrovlarni tejash: faqat TRF_FROM–TRF_TO soatlarda (Samarqand vaqti, odatiy 6–23) + kechasi 3:00 da bitta (probkasiz vaqt uchun)
  const lh = new Date(Date.now() + 5 * 3600e3), hh = lh.getUTCHours(), from = +(env.TRF_FROM || 6), to = +(env.TRF_TO || 23);
  if (!force && (hh < from || hh >= to) && !(hh === 3 && lh.getUTCMinutes() < 30)) return { skipped: true };
  // fv=2: eski formula (30 km/soat asos) bilan yozilgan tarix tozalanadi, oʻlchangan vaqtlar probkasiz asos sifatida qoladi
  if (st.fv !== 2) { st.base = st.base || {}; if (st.latest) Object.keys(st.latest.v).forEach(id => { const j = st.latest.v[id][0]; st.base[id] = Math.min(st.base[id] || Infinity, j); }); Object.assign(st, { latest: null, rows: [], prof: {}, daysum: {}, n: 0, since: null, fv: 2 }); }
  const D = await (await fetch(SITE + 'data/traffic-corridors.json', { cf: { cacheTtl: 86400 } })).json();
  const byJ = {}; D.corridors.forEach(c => { (byJ[c.j] = byJ[c.j] || []).push(c); });
  const v = {}, r = {}; st.base = st.base || {};
  let err = null;
  for (const j of Object.keys(byJ)) {
    const cs = byJ[j], dst = cs[0].path[cs[0].path.length - 1];
    const url = 'https://api.routing.yandex.net/v2/distancematrix?mode=driving&origins=' + cs.map(c => c.path[0].join(',')).join('|') + '&destinations=' + dst.join(',') + '&apikey=' + encodeURIComponent(env.YANDEX_MATRIX_KEY);
    try {
      const res = await fetch(url), d = await res.json();
      if (!res.ok) { err = res.status + ' ' + JSON.stringify(d).slice(0, 200); if (res.status === 401 || res.status === 403 || res.status === 429) break; continue; }
      (d.rows || []).forEach((row, i) => {
        const e = row.elements && row.elements[0], c = cs[i];
        if (!c || !e || e.status !== 'OK' || !e.duration) return;
        const dur = e.duration.value, dist = e.distance ? e.distance.value : c.len;
        if (!(dur > 5) || dist > c.len * 2.2 + 150) return;   // aylanib oʻtadi (bir tomonlama) — olinmaydi
        st.base[c.id] = Math.min(st.base[c.id] || Infinity, dur);
        const free = st.base[c.id];   // probkasiz vaqt = shu yoʻlda kuzatilgan eng tez vaqt (kechasi 3:00 oʻlchovi); Yandex vaqti chorraha/burilishni ham oʻz ichiga oladi
        v[c.id] = [dur, Math.round(Math.max(5, free))]; r[c.id] = Math.round(dur / Math.max(5, free) * 100);
      });
    } catch (e) { err = String(e.message || e); }
  }
  st.cronErr = Object.keys(v).length < 5 ? { ts: Date.now(), err } : null;
  const day = Object.keys(v).length >= 5 ? trfAdd(st, Date.now(), v, r) : null;
  st.src = 'Yandex API Матрицы расстояний (Worker cron)';
  await env.CORRECTIONS.put('trf:state', JSON.stringify(st));
  if (day) await trfArchive(env, st, day);
  return { n: Object.keys(v).length, err };
}
async function traffic(req, env, cors, okOrigin) {
  if (!env.CORRECTIONS) return json({ error: { code: 'no_kv', message: 'Ombor ulanmagan' } }, 501, cors);
  const st = JSON.parse((await env.CORRECTIONS.get('trf:state')) || 'null') || { latest: null, rows: [], prof: {}, n: 0, since: null };
  if (req.method === 'GET') {
    const dq = new URL(req.url).searchParams.get('day');
    if (dq && /^\d{4}-\d{2}-\d{2}$/.test(dq)) return new Response((await env.CORRECTIONS.get('trf:day:' + dq)) || '[]', { status: 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors) });
    const full = new URL(req.url).searchParams.get('full') === '1';
    const out = full ? st : Object.assign({}, st, { rows: st.rows.filter(r => r[0] > Date.now() - 2 * 86400e3) });
    return json(out, 200, Object.assign({ 'Cache-Control': 'no-store' }, cors));
  }
  if (req.method !== 'POST') return json({ error: { code: 'method', message: 'GET yoki POST' } }, 405, cors);
  if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
  // Hozir oʻlchash (server, Yandex Матрица расстояний) — xodim kodi bilan
  if (new URL(req.url).searchParams.get('run') === '1') {
    if (!pinOk(env, req.headers.get('X-Staff-Code'))) return json({ error: { code: 'bad_pin', message: 'Xodim kodi notoʻgʻri' } }, 403, cors);
    const res = await trafficCron(env, true);
    return json(res || {}, 200, cors);
  }
  if (st.latest && Date.now() - st.latest.ts < TRF_MIN_GAP) return json({ skipped: true, latest: st.latest.ts }, 200, cors);
  let b;
  try { b = JSON.parse((await req.text()).slice(0, 60000)); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
  const v = {}, r = {};
  Object.keys(b.v || {}).slice(0, 200).forEach(id => {
    if (!/^J\d{1,3}[a-d]$/.test(id)) return;
    const [jams, free] = (b.v[id] || []).map(Number);
    if (!(free > 5 && free < 3600 && jams >= free * 0.8 && jams < free * 15)) return;
    v[id] = [Math.round(jams), Math.round(free)]; r[id] = Math.round(jams / free * 100);
  });
  if (Object.keys(v).length < 5) return json({ error: { code: 'bad_item', message: 'Oʻlchov yetarli emas' } }, 400, cors);
  const ts = Date.now();
  const day = trfAdd(st, ts, v, r);
  await env.CORRECTIONS.put('trf:state', JSON.stringify(st));
  await trfArchive(env, st, day);
  return json({ ok: true, ts, n: st.n }, 200, cors);
}

// ---------- Internetdan qidirish (OpenAI Responses API + web_search) ----------
async function search(b, env, cors, ip) {
  if (limit('s:' + ip, SEARCH_PER_IP_HOUR)) return json({ error: { code: 'proxy_rate_limit', message: 'Soatlik qidiruv limiti tugadi' } }, 429, cors);
  const q = String(b.q || '').slice(0, 600), context = String(b.context || '').slice(0, 3000);
  if (!q) return json({ error: { code: 'bad_item', message: 'Savol yoʻq' } }, 400, cors);
  const instructions = 'Sen Samarqand shahri hokimiyati uchun transport tahlilchisisan. Internetdan faqat ochiq, ishonchli manbalarni qidir (yangiliklar, hokimiyat va vazirlik saytlari, OpenStreetMap, ilmiy ishlar). '
    + 'Javobni oʻzbek tilida (lotin), qisqa (3–6 gap yoki nuqtalar) yoz. Faqat manbada bor narsani yoz, oʻylab topma; topilmasa “Ochiq manbalarda topilmadi” de. Har bir faktdan keyin manbani koʻrsat.';
  let last = null;
  for (const model of LIGHT) {
    const body = { model, instructions, input: q + (context ? '\n\nJoy haqida maʼlumot:\n' + context : ''), tools: [{ type: 'web_search' }], max_output_tokens: 1500 };
    if (/^gpt-[56]/.test(model)) body.reasoning = { effort: 'low' };
    body.prompt_cache_key = 'cityjam-search';
    const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => null);
    if (!r.ok) { last = { status: r.status, d }; if (r.status === 400 || r.status === 404) continue; break; }
    let text = '';
    const sources = [];
    (d.output || []).forEach(o => (o.content || []).forEach(c => {
      if (c.type !== 'output_text') return;
      text += c.text || '';
      (c.annotations || []).forEach(a => { if (a.type === 'url_citation' && a.url && !sources.some(x => x.url === a.url)) sources.push({ url: a.url, title: a.title || a.url }); });
    }));
    return json({ text, sources: sources.slice(0, 8), model }, 200, cors);
  }
  return json({ error: (last && last.d && last.d.error) || { message: 'Qidiruv ishlamadi' } }, (last && last.status) || 500, cors);
}

// ---------- Yechimning AI rasmi ----------
async function image(b, env, cors, ip) {
  if (limit('i:' + ip, IMAGES_PER_IP_HOUR)) return json({ error: { code: 'proxy_rate_limit', message: 'Soatlik rasm limiti tugadi' } }, 429, cors);
  // Kunlik umumiy limit (KV boʻlsa) — xarajat nazorati
  if (env.CORRECTIONS) {
    const dk = 'img:' + new Date().toISOString().slice(0, 10), used = +((await env.CORRECTIONS.get(dk)) || 0);
    if (used >= IMAGES_PER_DAY) return json({ error: { code: 'proxy_rate_limit', message: 'Bugungi rasm limiti tugadi' } }, 429, cors);
    await env.CORRECTIONS.put(dk, String(used + 1), { expirationTtl: 3 * 86400 });
  }
  const prompt = String(b.prompt || '').slice(0, 3000);
  if (!prompt) return json({ error: { code: 'bad_item', message: 'Tavsif yoʻq' } }, 400, cors);
  // Kirish rasmlari: reja (PNG, sayt chizgan) + Mapillary suratlari (4 tagacha)
  const inputs = [];
  if (typeof b.plan === 'string' && /^data:image\/png;base64,/.test(b.plan) && b.plan.length < 1400000) {
    const bin = atob(b.plan.split(',')[1]), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    inputs.push(new Blob([u8], { type: 'image/png' }));
  }
  const urls = (Array.isArray(b.photos) ? b.photos : b.photo ? [b.photo] : []).filter(PHOTO_OK).slice(0, 4);
  for (const u of urls) { const pr = await fetch(u); if (pr.ok) inputs.push(await pr.blob()); }
  const photo = inputs.length ? inputs : null;
  let last = null;
  for (const model of IMAGE_MODELS) {
    let r;
    if (photo) {
      const f = new FormData();
      f.append('model', model); f.append('prompt', prompt); f.append('size', '1024x1024'); f.append('quality', b.quality === 'medium' ? 'medium' : 'low');
      photo.forEach((im, i) => f.append(photo.length > 1 ? 'image[]' : 'image', im, (im.type === 'image/png' ? 'plan' : 'photo') + i + (im.type === 'image/png' ? '.png' : '.jpg')));
      r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: f });
    } else {
      r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: JSON.stringify({ model, prompt, size: '1024x1024', quality: 'low' }) });
    }
    const d = await r.json().catch(() => null);
    if (r.ok && d && d.data && d.data[0] && d.data[0].b64_json) return json({ b64: d.data[0].b64_json, model, edited: !!photo }, 200, cors);
    last = { status: r.status, d };
    if (!(r.status === 400 || r.status === 404) || !/model/i.test(JSON.stringify((d && d.error) || ''))) break;
  }
  return json({ error: (last && last.d && last.d.error) || { message: 'Rasm chizilmadi' } }, (last && last.status) || 500, cors);
}

// ---------- Muammo joyining surati: svetofor / piyoda oʻtish bormi (AI, natija umumiy) ----------
const PC_PER_IP_HOUR = 80, PC_PER_DAY = 400;
const PC_PROMPT = `Senga chorraha yoki maktab yonidagi real koʻcha surati (1–2 ta, Mapillary) beriladi.
Faqat JSON qaytar, boshqa hech narsa yozma: {"svetofor":"bor|yoq|noaniq","piyoda_otish":"bor|yoq|noaniq","izoh":"oʻzbekcha 1 qisqa gap"}
“bor” — faqat suratda aniq koʻrinsa (svetofor chirogʻi yoki ustuni; oq-qora zebra chiziqlari). Koʻrinmasa yoki surat boshqa tomonga qaragan boʻlsa — “noaniq”.
“yoq” — chorraha/yoʻl aniq koʻrinib turibdi, lekin svetofor (yoki zebra) yoʻq.`;
async function photoChecks(req, env, cors, okOrigin, path) {
  if (!env.CORRECTIONS) return json({ error: { code: 'no_kv', message: 'Ombor ulanmagan' } }, 501, cors);
  const all = JSON.parse((await env.CORRECTIONS.get('photochecks')) || '{}');
  if (path === '/photo-checks') return json({ items: all }, 200, Object.assign({ 'Cache-Control': 'no-store' }, cors));
  if (req.method !== 'POST') return json({ error: { code: 'method', message: 'Faqat POST' } }, 405, cors);
  if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
  if (!env.OPENAI_API_KEY) return json({ error: { code: 'no_server_key', message: 'Serverda OpenAI kaliti sozlanmagan' } }, 500, cors);
  let b;
  try { b = JSON.parse(await req.text()); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
  const key = String(b.key || '').slice(0, 80), photos = (Array.isArray(b.photos) ? b.photos : []).filter(PHOTO_OK).slice(0, 2);
  const pid = String(b.photoId || '').slice(0, 40);
  if (!/^(junction|school):/.test(key) || !photos.length) return json({ error: { code: 'bad_item', message: 'Notoʻgʻri soʻrov' } }, 400, cors);
  // Shu joy shu surat bilan avval tekshirilgan boʻlsa — saqlangan natija (pul sarflanmaydi)
  if (all[key] && all[key].photoId === pid) return json(Object.assign({ cached: true }, all[key]), 200, cors);
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (limit('pc:' + ip, PC_PER_IP_HOUR)) return json({ error: { code: 'proxy_rate_limit', message: 'Soatlik limit tugadi' } }, 429, cors);
  const dk = 'pcday:' + new Date().toISOString().slice(0, 10), used = +((await env.CORRECTIONS.get(dk)) || 0);
  if (used >= PC_PER_DAY) return json({ error: { code: 'proxy_rate_limit', message: 'Bugungi limit tugadi' } }, 429, cors);
  await env.CORRECTIONS.put(dk, String(used + 1), { expirationTtl: 3 * 86400 });
  const content = [{ type: 'text', text: 'Joy: ' + String(b.title || '').slice(0, 120) + '. Muammo: ' + (key.startsWith('junction') ? 'svetoforsiz chorraha' : 'maktab oldida xavfsiz oʻtish yoʻq') + '.' }]
    .concat(photos.map(u => ({ type: 'image_url', image_url: { url: u, detail: 'low' } })));
  let last = null;
  for (const model of LIGHT) {
    const body = { model, messages: [{ role: 'system', content: PC_PROMPT }, { role: 'user', content }], max_completion_tokens: 600 };
    if (/^gpt-[56]/.test(model)) body.reasoning_effort = 'low'; else body.temperature = 0;
    body.prompt_cache_key = 'cityjam-photo';
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => null);
    if (!r.ok) { last = { status: r.status, d }; if (r.status === 400 || r.status === 404) continue; break; }
    const t = (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    let j = null;
    try { j = JSON.parse((t.match(/\{[\s\S]*\}/) || [''])[0]); } catch (e) { j = null; }
    if (!j) { last = { status: 502, d: { error: { message: 'AI javobi tushunarsiz' } } }; continue; }
    const v = x => (/^bor/i.test(x || '') ? 'bor' : /^yo/i.test(x || '') ? 'yoq' : 'noaniq');
    const item = { signal: v(j.svetofor), crossing: v(j.piyoda_otish), note: String(j.izoh || '').slice(0, 200), photoId: pid, ts: Date.now() };
    const fresh = JSON.parse((await env.CORRECTIONS.get('photochecks')) || '{}');
    fresh[key] = item;
    await env.CORRECTIONS.put('photochecks', JSON.stringify(fresh));
    return json(item, 200, cors);
  }
  return json({ error: (last && last.d && last.d.error) || { message: 'Tekshiruv ishlamadi' } }, (last && last.status) || 500, cors);
}

// ---------- Shahar tizimlari xaritalari (GeoJSON) ----------
const SYSTEMS = ['camera', 'power', 'gas', 'water', 'sewer', 'masterplan'];
async function layers(req, env, cors, okOrigin, path) {
  if (!env.CORRECTIONS) return json({ error: { code: 'no_kv', message: 'Ombor ulanmagan' } }, 501, cors);
  const meta = JSON.parse((await env.CORRECTIONS.get('layers:meta')) || '{}');
  const sys = path.split('/')[2] || '';
  if (req.method === 'GET') {
    if (!sys) return json({ items: meta }, 200, Object.assign({ 'Cache-Control': 'no-store' }, cors));
    if (!SYSTEMS.includes(sys) || !meta[sys]) return json({ error: { code: 'not_found', message: 'Topilmadi' } }, 404, cors);
    return new Response((await env.CORRECTIONS.get('layer:' + sys)) || '{"type":"FeatureCollection","features":[]}', { status: 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors) });
  }
  if (!okOrigin) return json({ error: { code: 'forbidden_origin', message: 'Bu manzildan ruxsat yoʻq' } }, 403, cors);
  if (!pinOk(env, req.headers.get('X-Staff-Code'))) return json({ error: { code: 'bad_pin', message: 'Xodim kodi notoʻgʻri' } }, 403, cors);
  if (!SYSTEMS.includes(sys)) return json({ error: { code: 'bad_item', message: 'Nomaʼlum tizim' } }, 400, cors);
  if (req.method === 'DELETE') {
    delete meta[sys];
    await env.CORRECTIONS.delete('layer:' + sys);
    await env.CORRECTIONS.put('layers:meta', JSON.stringify(meta));
    return json({ items: meta }, 200, cors);
  }
  if (req.method !== 'POST') return json({ error: { code: 'method', message: 'GET, POST yoki DELETE' } }, 405, cors);
  const raw = await req.text();
  if (raw.length > 24 * 1024 * 1024) return json({ error: { code: 'too_large', message: 'Fayl 24 MB dan katta' } }, 413, cors);
  let b;
  try { b = JSON.parse(raw); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
  if (!b.geojson || !Array.isArray(b.geojson.features)) return json({ error: { code: 'bad_item', message: 'GeoJSON emas' } }, 400, cors);
  await env.CORRECTIONS.put('layer:' + sys, JSON.stringify(b.geojson));
  meta[sys] = { name: String(b.name || sys).slice(0, 120), n: b.geojson.features.length, ts: Date.now() };
  await env.CORRECTIONS.put('layers:meta', JSON.stringify(meta));
  return json({ items: meta }, 200, cors);
}

// ---------- Ochiq vebkameralar (Windy Webcams API v3) ----------
let camCache = { ts: 0, key: '', body: null };
async function webcams(req, env, cors) {
  const u = new URL(req.url), mode = u.searchParams.get('mode') || '';
  if (mode === 'fi') return digitraffic(cors, Math.max(4, Math.min(40, +u.searchParams.get('n') || 12)));
  if (!env.WINDY_KEY) return json({ error: { code: 'no_windy_key', message: 'Serverda Windy kaliti (WINDY_KEY) sozlanmagan' } }, 501, cors);
  const lat = +u.searchParams.get('lat') || 39.6547, lon = +u.searchParams.get('lon') || 66.9757, r = Math.min(250, +u.searchParams.get('r') || 60);
  if (Math.abs(lat - 39.65) > 3 || Math.abs(lon - 66.97) > 3) return json({ error: { code: 'bad_item', message: 'Faqat Samarqand atrofi' } }, 400, cors);
  const key = mode + lat.toFixed(2) + ',' + lon.toFixed(2) + ',' + r;
  // Windy bepul tarifida rasm havolalari ~10 daqiqa amal qiladi — 5 daqiqa kesh
  if (camCache.body && camCache.key === key && Date.now() - camCache.ts < 5 * 60e3) return json(camCache.body, 200, cors);
  // mode=uz — test uchun butun Oʻzbekiston boʻyicha
  const api = mode === 'uz' ? 'https://api.windy.com/webcams/api/v3/webcams?countries=UZ&include=location,images,urls,player&limit=50&lang=en'
    : `https://api.windy.com/webcams/api/v3/webcams?nearby=${lat},${lon},${r}&include=location,images,urls,player&limit=50&lang=en`;
  const w = await fetch(api, { headers: { 'x-windy-api-key': env.WINDY_KEY } });
  const d = await w.json().catch(() => null);
  if (!w.ok || !d) return json({ error: { code: 'windy_error', message: 'Windy javob bermadi (HTTP ' + w.status + ')' } }, 502, cors);
  const list = (d.webcams || []).map(c => ({
    id: c.webcamId, title: c.title, status: c.status, updated: c.lastUpdatedOn,
    lat: c.location && c.location.latitude, lon: c.location && c.location.longitude, city: c.location && c.location.city,
    preview: c.images && c.images.current && (c.images.current.preview || c.images.current.thumbnail),
    detail: (c.urls && c.urls.detail) || ('https://www.windy.com/webcams/' + c.webcamId),
    live: c.player && (c.player.live || c.player.day) || null,
  })).filter(c => isFinite(c.lat) && isFinite(c.lon));
  const body = { total: d.total || list.length, items: list, source: 'Windy.com' };
  camCache = { ts: Date.now(), key, body };
  return json(body, 200, cors);
}

// Test manbasi: Finlyandiya yoʻl ob-havo kameralari (Fintraffic Digitraffic, ochiq maʼlumot, CC BY 4.0)
let fiCache = { ts: 0, body: null, n: 0 };
async function digitraffic(cors, n) {
  if (fiCache.body && fiCache.n === n && Date.now() - fiCache.ts < 10 * 60e3) return json(fiCache.body, 200, cors);
  const r = await fetch('https://tie.digitraffic.fi/api/weathercam/v1/stations', { headers: { 'Digitraffic-User': 'CityJam/1.0', 'Accept-Encoding': 'gzip' } });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !Array.isArray(d.features)) return json({ error: { code: 'fi_error', message: 'Digitraffic javob bermadi (HTTP ' + r.status + ')' } }, 502, cors);
  // Helsinki atrofidagi n ta kamera (har biridan birinchi koʻrinish)
  const items = d.features.filter(f => f.geometry && f.properties && (f.properties.presets || []).length)
    .map(f => ({ f, dd: Math.hypot(f.geometry.coordinates[1] - 60.2, (f.geometry.coordinates[0] - 24.9) * 0.5) })).sort((a, b) => a.dd - b.dd).slice(0, n)
    .map(({ f }) => { const p = f.properties.presets[0].id; return { id: p, title: f.properties.name || p, city: 'Finlyandiya (test)', lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], updated: f.properties.dataUpdatedTime || null, preview: 'https://weathercam.digitraffic.fi/' + p + '.jpg', detail: 'https://www.liikennetilanne.fi/en', test: true }; });
  const body = { total: items.length, items, source: 'Fintraffic Digitraffic (CC BY 4.0)' };
  fiCache = { ts: Date.now(), body, n };
  return json(body, 200, cors);
}
