// v1.17.28 리무브 에리어(트레쉬) 팝업: 클릭하면 팝업이 보이고(화면만 어두워지고 팝업이 안 뜨던 맥 Safari 문제 대응: :has()/거대 box-shadow 제거), 닫기로 닫힌다
const path = require('path'), fs = require('fs'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP: playwright 없음'); process.exit(0); }
const U = require('./mz_util'); const { G, dummy, give } = U; const S = require('../server.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const R = G({ a: dummy('A', { color: 'blue' }), b: dummy('B', { color: 'blue' }), c: dummy('C', { color: 'blue' }) }, ['a', 'b', 'c', 'a', 'b', 'c'], ['a']); const s = R.turn;
for (let i = 0; i < 4; i++) R.P[s].rem.push(R.P[s].deck.pop());
const view = JSON.parse(JSON.stringify(S.view(R, s))), DEF = R.defs; const css = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
ok(!/:has\(/.test(css), '1 index.html 에 :has() 선택자 없음(구형 Safari 호환)'); ok(!/9999px/.test(css), '1 거대한 box-shadow 퍼짐(9999px) 없음');
(async () => {
  const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p)); const br = await chromium.launch(exe ? { executablePath: exe } : {});
  for (const [w, h] of [[1440, 900], [1280, 720], [1024, 700]]) { const pg = await br.newPage({ viewport: { width: w, height: h } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(dd => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: dd }) }), DEF); await pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), view);
    const T = `${w}x${h}`; const hidden0 = await pg.evaluate(() => getComputedStyle(document.getElementById('ovl')).display); ok(hidden0 === 'none', `${T} 평소에는 오버레이 숨김`);
    await pg.locator('.dk.rm').filter({ visible: true }).last().click(); await pg.waitForTimeout(150);
    const st = await pg.evaluate(() => { const o = document.getElementById('ovl'), b = document.querySelector('#remp .box'), r = b && b.getBoundingClientRect(), bd = document.getElementById('board'); return { disp: getComputedStyle(o).display, dim: bd.classList.contains('dimov'), box: r ? [r.width, r.height] : null, cards: document.querySelectorAll('#remp .box .card').length, btn: !!document.querySelector('#remp .box button') }; });
    ok(st.disp === 'flex' && st.dim && st.box && st.box[0] > 200 && st.box[1] > 100, `${T} 클릭하면 팝업이 보임 (${JSON.stringify(st)})`); ok(st.cards === 4 && st.btn, `${T} 카드 4장 + 닫기 버튼`);
    await pg.locator('#remp .box button').click(); await pg.waitForTimeout(100); const after = await pg.evaluate(() => ({ d: getComputedStyle(document.getElementById('ovl')).display, dim: document.getElementById('board').classList.contains('dimov') })); ok(after.d === 'none' && !after.dim, `${T} 닫기 → 팝업·어둡게 모두 해제`); ok(!errs.length, `${T} 페이지 오류 없음 ${errs.join('|')}`); await pg.close(); }
  await br.close(); console.log(`\nremove_popup_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
