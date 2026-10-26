/* City Jam — AI proksi va xarita tuzatishlari (Cloudflare Worker).
   /corrections — foydalanuvchilar “svetofor bor”, “muammo emas” kabi tuzatishlari (KV: CORRECTIONS, yozish ADMIN_PIN bilan).
   OpenAI kaliti shu yerda YOZILMAYDI: u Cloudflare panelida “OPENAI_API_KEY” nomli maxfiy (Secret) oʻzgaruvchida turadi.
   Sayt savolni shu Worker’ga yuboradi, Worker esa OpenAI’ga kalit bilan soʻraydi — kalit hech qachon brauzerga chiqmaydi.
   Himoya: faqat sayt domenidan soʻrov, faqat ruxsat etilgan modellar, soʻrov hajmi va javob uzunligi cheklangan,
   bir IP manzildan soatiga cheklangan miqdordagi savol. Qoʻshimcha himoya uchun OpenAI panelida oylik budjet limitini qoʻying. */
const ALLOWED_ORIGINS = ['https://diyorjonabdurahmonov1-ai.github.io'];
const MODELS = ['gpt-5.4-mini', 'gpt-5.5', 'gpt-4.1-mini'];
const PER_IP_PER_HOUR = 20;
const MAX_BODY_CHARS = 30000;
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
    if (new URL(req.url).pathname.replace(/\/+$/, '') === '/corrections') return corrections(req, env, cors, okOrigin);
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
    const out = { model: body.model, messages: body.messages.map(m => ({ role: m.role === 'system' ? 'system' : 'user', content: String(m.content || '') })) };
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
