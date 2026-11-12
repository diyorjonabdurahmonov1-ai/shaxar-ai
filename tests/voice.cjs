/* Ovoz zanjiri testi: Chromium’ning soxta mikrofoni ovozli fayldan oʻqiydi (haqiqiy MediaRecorder + ovoz oʻlchagich + jimlikda toʻxtash),
   Worker /stt mock qilinadi. Talab: ffmpeg. Ishga tushirish: (sayt serveri 8765 da) node tests/voice.cjs */
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cj-voice-'));
const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch (e) { console.log('SKIP ffmpeg yoʻq'); process.exit(0); }
ff('-f', 'lavfi', '-i', 'sine=frequency=220:duration=1.2', '-f', 'lavfi', '-i', 'anoisesrc=d=1.2:c=pink:a=0.3', '-filter_complex', '[0:a][1:a]amix=inputs=2,volume=2', '-ar', '48000', '-ac', '1', path.join(D, 'sp.wav'));
ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '6', path.join(D, 'q.wav'));
ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '0.7', path.join(D, 'q0.wav'));
ff('-i', path.join(D, 'q0.wav'), '-i', path.join(D, 'sp.wav'), '-i', path.join(D, 'q.wav'), '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1', '-ar', '48000', '-ac', '1', path.join(D, 'speech.wav'));
const results = []; const ok = (n, c, x) => { results.push([c ? 'OK  ' : 'FAIL', n, x || '']); if (!c) process.exitCode = 1; };
async function run(file, text, until, awake, mobile, holdMs) {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + path.join(D, file)] });
  const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] }, mobile ? { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', hasTouch: true } : {}));
  const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  let stt = 0;
  await ctx.route(/\/js\/keys\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CITYJAM_KEYS = { tomtom: '', aiProxy: 'https://cityjam-ai.example.workers.dev' };" }));
  await ctx.route(/cityjam-ai\.example\.workers\.dev/, r => { const u = r.request().url(); if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: H }); if (/\/version/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: '{"v":13}' }); if (/\/stt/.test(u)) { stt++; return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ text }) }); } return r.fulfill({ status: 404, headers: H, body: '{}' }); });
  await ctx.route(/overpass|maps\.mail/, r => r.abort('failed'));
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForSelector('#panel .live', { timeout: 90000 }); await p.waitForTimeout(1500);
  const t0 = Date.now(); if (awake) await p.evaluate(() => { NX.awakeLoop(); }); else if (holdMs) { const bb = await p.locator('#btnVoice').boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(holdMs); await p.mouse.up(); } else await p.click('#btnVoice');
  let last = null;
  for (let i = 0; i < 80; i++) { last = await p.evaluate(() => { const e = document.getElementById('voiceHud'); return e ? { st: e.className.replace('show', '').trim(), t: e.querySelector('b').textContent, tab: NX.state.tab } : null; }); if (last && until(last)) break; await p.waitForTimeout(250); }
  let aw = null; if (awake) { await p.waitForTimeout(9000); aw = await p.evaluate(() => ({ on: NX.awakeOn(), pill: (document.getElementById('wakeBadge') || {}).className || '' })); }
  const sec = (Date.now() - t0) / 1000; await b.close(); return { last, stt, sec, aw };
}
(async () => {
  let r = await run('speech.wav', 'Xisobot bo‘limini och', h => h.tab === 'report');
  ok('Ovoz zanjiri: yozish → jimlikda oʻzi toʻxtash → /stt → “xisobot” buyrugʻi Hisobotni ochadi', r.last && r.last.tab === 'report' && r.stt === 1 && r.sec < 10, JSON.stringify(r));
  r = await run('q.wav', 'Xisobot bo‘limini och', h => h.st === 'warn');
  ok('Jim mikrofon: serverga yuborilmaydi, “ovoz kelmayapti” deyiladi', r.last && r.last.st === 'warn' && r.stt === 0, JSON.stringify(r));
  r = await run('speech.wav', 'Xisobot bo‘limini och', h => h.tab === 'report', true);
  ok('Uygʻoq rejim: buyruqdan keyin ham tinglab turadi, uygʻoq turadi (soxta mikrofon faylni takrorlaydi)', r.last && r.last.tab === 'report' && r.stt >= 1 && r.aw && r.aw.on && /awake/.test(r.aw.pill), JSON.stringify(r));
  r = await run('speech.wav', 'Xisobot bo‘limini och', h => h.tab === 'report', false, true);
  ok('Telefon: brauzer nutq tanishi (tovush chiqaradigan) ishlatilmaydi, faqat jim yozuv + server — buyruq bajariladi', r.last && r.last.tab === 'report' && r.stt === 1, JSON.stringify(r));
  r = await run('speech.wav', 'Xisobot bo‘limini och', h => h.tab === 'report', false, false, 2300);
  ok('Bosib turib gapirish: qoʻyvorilganda darrov yuboriladi va buyruq bajariladi', r.last && r.last.tab === 'report' && r.stt === 1 && r.sec < 9, JSON.stringify(r));
  console.log(results.map(x => x.join('  ')).join('\n'));
  fs.rmSync(D, { recursive: true, force: true });
})();
