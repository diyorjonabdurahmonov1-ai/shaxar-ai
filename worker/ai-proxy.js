/* City Jam — AI proksi va xarita tuzatishlari (Cloudflare Worker).
   /corrections — foydalanuvchilar “svetofor bor”, “muammo emas” kabi tuzatishlari (KV: CORRECTIONS, yozish ADMIN_PIN bilan).
   /reports — odamlarning “hozir bu yerda tirbandlik” xabarlari (KV: CORRECTIONS, kalit "reports"; PINsiz, IP boʻyicha limit).
   /photo-check — muammo joyining real suratini (Mapillary) AI koʻradi: svetofor / piyoda oʻtish bormi. Natija KV’da saqlanadi —
                  har bir joy faqat bir marta tekshiriladi (pul bir marta sarflanadi), natijani hamma foydalanuvchi koʻradi.
   /photo-checks — saqlangan barcha natijalar (GET).
   /search — internetdan ochiq maʼlumot qidirish (OpenAI web_search), manba havolalari bilan.
   /image  — taklif qilingan yechimning AI rasmi (gpt-image); real surat (Mapillary) berilsa, shu surat ustiga chiziladi.
   Asosiy manzil (/) — chat; xabarda Mapillary surati (rasm havolasi) boʻlishi mumkin — AI suratni koʻrib tahlil qiladi.
   OpenAI kaliti shu yerda YOZILMAYDI: u Cloudflare panelida “OPENAI_API_KEY” nomli maxfiy (Secret) oʻzgaruvchida turadi.
   Sayt savolni shu Worker’ga yuboradi, Worker esa OpenAI’ga kalit bilan soʻraydi — kalit hech qachon brauzerga chiqmaydi.
   Himoya: faqat sayt domenidan soʻrov, faqat ruxsat etilgan modellar, soʻrov hajmi va javob uzunligi cheklangan,
   bir IP manzildan soatiga cheklangan miqdordagi savol. Qoʻshimcha himoya uchun OpenAI panelida oylik budjet limitini qoʻying. */
const ALLOWED_ORIGINS = ['https://diyorjonabdurahmonov1-ai.github.io'];
const MODELS = ['gpt-5.4-mini', 'gpt-5.5', 'gpt-4.1-mini'];
const PER_IP_PER_HOUR = 20;
const MAX_BODY_CHARS = 30000;
const SEARCH_PER_IP_HOUR = 8, IMAGES_PER_IP_HOUR = 4, IMAGES_PER_DAY = 40;
const IMAGE_MODELS = ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'];
// Faqat Mapillary suratlari (Meta CDN) AI’ga koʻrsatiladi
const PHOTO_OK = u => { try { const h = new URL(u); return h.protocol === 'https:' && /(^|\.)(fbcdn\.net|mapillary\.com)$/.test(h.hostname); } catch (e) { return false; } };
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

const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) });

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const okOrigin = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (path === '/version') return json({ v: 4, features: ['vision', 'search', 'image', 'photo-check', 'image-multi'] }, 200, cors);
    if (path === '/photo-checks' || path === '/photo-check') return photoChecks(req, env, cors, okOrigin, path);
    if (path === '/corrections') return corrections(req, env, cors, okOrigin);
    if (path === '/reports') return reports(req, env, cors, okOrigin);
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

    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return json({ error: { code: 'too_large', message: 'Soʻrov juda katta' } }, 413, cors);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json({ error: { code: 'bad_json', message: 'Notoʻgʻri soʻrov' } }, 400, cors); }
    if (!MODELS.includes(body.model) || !Array.isArray(body.messages) || body.messages.length > 4) {
      return json({ error: { code: 'model_not_found', message: 'Model yoki xabarlar ruxsat etilmagan' } }, 400, cors);
    }
    const out = { model: body.model, messages: body.messages.map(m => ({ role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user', content: cleanContent(m.content) })) };
    out.max_completion_tokens = Math.min(+body.max_completion_tokens || 900, 2500);
    if (/^gpt-5/.test(body.model)) out.reasoning_effort = 'low'; else out.temperature = 0.3;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY },
      body: JSON.stringify(out),
    });
    return new Response(await r.text(), { status: r.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
  },
};

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
  if (!env.ADMIN_PIN || String(body.pin || '') !== String(env.ADMIN_PIN)) return json({ error: { code: 'bad_pin', message: 'PIN-kod notoʻgʻri' } }, 403, cors);
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

// ---------- Internetdan qidirish (OpenAI Responses API + web_search) ----------
async function search(b, env, cors, ip) {
  if (limit('s:' + ip, SEARCH_PER_IP_HOUR)) return json({ error: { code: 'proxy_rate_limit', message: 'Soatlik qidiruv limiti tugadi' } }, 429, cors);
  const q = String(b.q || '').slice(0, 600), context = String(b.context || '').slice(0, 3000);
  if (!q) return json({ error: { code: 'bad_item', message: 'Savol yoʻq' } }, 400, cors);
  const instructions = 'Sen Samarqand shahri hokimiyati uchun transport tahlilchisisan. Internetdan faqat ochiq, ishonchli manbalarni qidir (yangiliklar, hokimiyat va vazirlik saytlari, OpenStreetMap, ilmiy ishlar). '
    + 'Javobni oʻzbek tilida (lotin), qisqa (3–6 gap yoki nuqtalar) yoz. Faqat manbada bor narsani yoz, oʻylab topma; topilmasa “Ochiq manbalarda topilmadi” de. Har bir faktdan keyin manbani koʻrsat.';
  let last = null;
  for (const model of ['gpt-5.4-mini', 'gpt-4.1-mini']) {
    const body = { model, instructions, input: q + (context ? '\n\nJoy haqida maʼlumot:\n' + context : ''), tools: [{ type: 'web_search' }], max_output_tokens: 1500 };
    if (/^gpt-5/.test(model)) body.reasoning = { effort: 'low' };
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
  for (const model of MODELS) {
    const body = { model, messages: [{ role: 'system', content: PC_PROMPT }, { role: 'user', content }], max_completion_tokens: 600 };
    if (/^gpt-5/.test(model)) body.reasoning_effort = 'low'; else body.temperature = 0;
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
