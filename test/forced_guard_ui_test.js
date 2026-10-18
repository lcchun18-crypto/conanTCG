// v1.17.30: 강제 가드(必ずガード/forceguard) 가 부여/적용된 상태를 화면에서 알 수 있다
const path = require('path'), fs = require('fs'); const S = require('../server.js'); const U = require('./mz_util'); const { G, real, field } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const R = G({ a: real('id_0001', { color: 'blue' }), b: real('id_0002', { color: 'blue' }), c: real('id_0003', { color: 'blue' }) }, ['a', 'b', 'c'], []); const s = R.turn, o = 1 - s;
const a = field(R, s, 'a'), b = field(R, o, 'b'), c = field(R, o, 'c'); R.cards[b].tkw = ' mustguard'; R.cards[a].tkw = ' forceguard';
R.sub = { type: 'guard', who: o, atk: a, def: null, tk: 'char', tid: b };
const v = JSON.parse(JSON.stringify(S.view(R, o))); const f = id => [...v.P[0].field, ...v.P[1].field].find(x => x.id === id);
ok(f(b).mg === 1 && f(a).fg === 1 && !f(c).mg, '1 뷰: 카드별 mg/fg 표시'); ok(v.sub.mg && v.sub.mg.length >= 1 && v.sub.mg.includes(b), '2 가드 요청에 강제 가드 대상 목록: ' + JSON.stringify(v.sub.mg));
let chromium; try { ({ chromium } = require('playwright')); } catch (e) {}
(async () => { if (chromium) { const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await br.newPage({ viewport: { width: 1366, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
  await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), R.defs); await pg.evaluate(vv => window.__ws.onmessage({ data: JSON.stringify(vv) }), v);
  const kws = await pg.evaluate(() => [...document.querySelectorAll('.mods i.kw')].map(e => e.textContent)); ok(kws.some(t => /강제$/.test(t)) && kws.some(t => /강제유발/.test(t)), '3 카드 배지: ' + kws.join(','));
  ok(await pg.locator('.card.fgd').count() >= 1, '4 강제 가드 대상 카드 강조'); const txt = await pg.evaluate(() => document.body.innerText); ok(/강제 가드: 반드시/.test(txt) && !(await pg.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '가드 안 함'))), '5 안내 문구 + "가드 안 함" 버튼 없음'); ok(!errs.length, '6 오류 없음 ' + errs.join('|')); await br.close(); }
  console.log(`\nforced_guard_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })();
