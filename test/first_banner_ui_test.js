// v1.17.33: 멀리건 진입 시 선후공 추첨 결과 배너
const path = require('path'); const U = require('./mz_util'); const S = U.S; const { G } = U; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const R = G({}, [], []); ok(R.first === 0 || R.first === 1, '1 서버: first 가 0/1 로 정해짐 (' + R.first + ')');
(async () => { const { chromium } = require('playwright'); const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [seat, exp] of [[R.first, /당신이 선공/], [1 - R.first, /후공/]]) { const pg = await br.newPage({ viewport: { width: 1200, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), R.defs);
    const v = JSON.parse(JSON.stringify(U.S.view(R, seat))); v.phase = 'mull'; await pg.evaluate(vv => window.__ws.onmessage({ data: JSON.stringify(vv) }), v); await pg.waitForTimeout(300);
    const t1 = await pg.evaluate(() => (document.getElementById('firstbn') || {}).innerText || ''); ok(exp.test(t1), `2 좌석${seat}: 배너 "${t1.replace(/\n/g, ' ')}"`);
    await pg.evaluate(vv => window.__ws.onmessage({ data: JSON.stringify(vv) }), v); await pg.waitForTimeout(100); ok(await pg.locator('#firstbn').count() === 1, '3 같은 단계 재렌더에서 배너 중복 없음');
    await pg.waitForTimeout(3600); ok(await pg.locator('#firstbn').count() === 0, '4 잠시 뒤 자동으로 사라짐'); ok(!errs.length, '5 오류 없음 ' + errs.join('|')); await pg.close(); }
  await br.close(); console.log(`\nfirst_banner_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })();
