// v1.17.27 손패에서 선언하는 능력(fromHand — id_0720 ジン 등): 손패 카드를 선택하면 '등장' 옆에 능력 버튼이 떠야 하고, 누르면 ability 로 전송된다
const path = require('path'), fs = require('fs'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP: playwright 없음'); process.exit(0); }
const U = require('./mz_util'); const { G, real, dummy, field, give } = U; const S = require('../server.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const W = { p: { n: 'P', type: 'partner', color: 'black', lp: '1' }, k: { n: 'K', type: 'case', color: 'black', lv: '2', lv2: '3' } };
const R = G({ j: real('id_0720', { color: 'black' }), b: dummy('흑캐', { color: 'black', ap: '3000' }), d1: dummy('d1', { color: 'black' }) }, ['j', 'b', 'd1'], ['d1'], W); const s = R.turn, P = R.P[s];
field(R, s, 'b'); const j = give(R, s, 'j', 'hand'); for (let i = 0; i < 8; i++) P.file.push(P.deck.pop()); R.cards[P.kase].solved = true;
const view = JSON.parse(JSON.stringify(S.view(R, s))); const DEF = R.defs;
(async () => {
  const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p)); const br = await chromium.launch(exe ? { executablePath: exe } : {}); const pg = await br.newPage({ viewport: { width: 1366, height: 768 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(m) { window.__sent.push(JSON.parse(m)); } close() {} }; });
  await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(dd => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: dd }) }), DEF); await pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), view);
  ok(!!(view.acts || {})[j] && view.acts[j].some(x => x.k === 'ab'), '서버 뷰: 손패 ジン 에 선언 능력 행동이 있음');
  const hc = pg.locator('#hand .card').filter({ has: pg.locator('*') }); const n = await hc.count(); let clicked = false;
  let found = null; for (let i = 0; i < n; i++) { await hc.nth(i).click(); const t = await pg.locator('#act button').allInnerTexts(); if (t.some(x => /등장/.test(x))) clicked = true; if (t.some(x => /선언|능력/.test(x))) { found = t; break; } }
  ok(!!found, '손패 ジン 선택: 등장 + 능력 버튼 — ' + JSON.stringify((found || []).map(x => x.slice(0, 22))));
  if (found) { await pg.locator('#act button').filter({ hasText: /선언|능력/ }).first().click(); const sent = await pg.evaluate(() => window.__sent); ok(sent.some(m => (m.a === 'ability' || m.t === 'ability') && m.id === j && m.i === 0), '능력 버튼 → ability 전송: ' + JSON.stringify(sent.slice(-1))); }
  ok(clicked, '손패 카드 선택 UI 도달'); ok(!errs.length, '페이지 오류 없음 ' + errs.join('|'));
  await br.close(); console.log(`\nhand_declare_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
