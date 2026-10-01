// v1.4.0: 모바일도 PC 와 동일한 UI. 해상도(뷰포트 맞춤)와 터치 조작만 다르다.
const path = require('path'), fs = require('fs'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP: playwright 없음'); process.exit(0); }
const U = require('./mz_util'); const { G, real, dummy, field, fillFile, S } = U;
const OUT = process.env.UI_SHOTS || '/tmp/ui_v14'; fs.mkdirSync(OUT, { recursive: true });
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><rect width="200" height="280" fill="${c}"/><text x="20" y="140" font-size="40" fill="#111">${t}</text></svg>`);
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
const defs = {}; for (let i = 0; i < 6; i++) defs['e' + i] = dummy('EV' + i);
const R = G(defs, ['e0', 'e1', 'e2', 'e3', 'e4', 'e5'], ['e0', 'e1', 'e2', 'e3'], BS); fillFile(R, 0, 9); fillFile(R, 1, 9);
for (const k of Object.keys(R.defs)) { R.defs[k].img = svg(R.defs[k].n, '#dcb'); R.defs[k].extra = '효과 ' + R.defs[k].n; }
const s = R.turn; U.give(R, s, 'e4', 'field'); U.give(R, 1 - s, 'e5', 'field');
const view = JSON.parse(JSON.stringify(S.view(R, s))); let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => {
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}; const br = await chromium.launch(exe);
  const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
  const open = async (o) => { const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.dpr || 1, isMobile: !!o.m, hasTouch: !!o.m, userAgent: o.m ? UA : undefined });
    const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); await pg.emulateMedia({ reducedMotion: 'reduce' });
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(m) { window.__sent.push(JSON.parse(m)); } close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); await pg.evaluate(d => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: d }) }), R.defs);
    await pg.evaluate(v => window.__ws.onmessage({ data: JSON.stringify(v) }), view); await pg.waitForTimeout(150); return pg; };
  const geo = pg => pg.evaluate(() => { const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const hand = document.querySelector('#hand .card'); return { W: innerWidth, H: innerHeight, m: document.body.classList.contains('m'), ls: document.body.className, cw: hand ? hand.offsetWidth : 0, side: r('side'), top: r('top'), board: r('board'), hasDock: getComputedStyle(document.getElementById('dock')).display !== 'none', pvInSide: !!document.querySelector('#side #pv'), over: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1 }; });
  const phones = [['폰 가로 844x390', 844, 390], ['폰 가로 932x430', 932, 430], ['폰 세로 390x844', 390, 844], ['태블릿 가로 1180x820', 1180, 820]];
  for (const [nm, w, h] of phones) {
    const pg = await open({ w, h, m: true, dpr: 3 }); const g = await geo(pg);
    ok(!g.m && !/\b(ls|pt|tab)\b/.test(g.ls), `${nm}: 모바일 전용 클래스 없음 (body.class="${g.ls}")`);
    ok(g.W >= 1280, `${nm}: 가상 화면 폭 ≥1280 (innerWidth=${g.W})`);
    ok(g.pvInSide && !g.hasDock, `${nm}: PC 와 같은 우측 패널/미리보기 구조`);
    ok(!g.over, `${nm}: 화면 밖으로 넘치지 않음 (스크롤 없음)`);
    const pc = await open({ w: g.W, h: g.H }); const p = await geo(pc);
    const near = (a, b) => JSON.stringify(a.map((x, i) => i < 3 ? x : 0)) === JSON.stringify(b.map((x, i) => i < 3 ? x : 0)) && Math.abs(a[3] - b[3]) <= 2; ok(near(g.side, p.side) && near(g.top, p.top) && near(g.board, p.board) && g.cw === p.cw, `${nm}: 같은 가상 크기 PC 와 레이아웃 좌표 동일 (카드폭 ${g.cw}=${p.cw}) ${JSON.stringify([g.side,g.top,g.board])} vs ${JSON.stringify([p.side,p.top,p.board])}`);
    await pg.screenshot({ path: OUT + `/${nm.replace(/\W+/g, '_')}.png` }); await pc.context().close();
    // 터치: 손패 탭 = 클릭(선택), 길게 누르기 = PC 미리보기 패널 갱신(+클릭 억제)
    const hc = pg.locator('#hand .card').first(); const before = await pg.evaluate(() => document.getElementById('pv').innerText);
    await hc.tap(); await pg.waitForTimeout(80); const selected = await pg.evaluate(() => !!document.querySelector('#hand .card.sel, #hand .card.on, #hand .card.picked') || !!document.querySelector('#act button:not([disabled])'));
    ok(selected, `${nm}: 손패 탭 → 선택/행동 버튼 활성(클릭과 동일)`);
    const fc = pg.locator('#me-lp .card, #mid .card, .z-char .card').first(); const tgt = (await pg.locator('#opp-lp .card, .card').evaluateAll(es => es.filter(e => e._pv).length)) > 0;
    const el = pg.locator('.card').filter({ has: pg.locator('xpath=self::*') }); void el; void fc;
    const pt = await pg.evaluate(() => { const e = [...document.querySelectorAll('.card')].find(x => x._pv && x.closest('#hand')); const b = e.getBoundingClientRect(); return { x: b.left + b.width * .3, y: b.top + b.height / 2 }; });
    const c = await pg.context().newCDPSession(pg); await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] }); await pg.waitForTimeout(700);
    const pvTxt = await pg.evaluate(() => document.getElementById('pv').innerText); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    ok(/EV\d|효과/.test(pvTxt) && pvTxt !== before && tgt, `${nm}: 길게 누르기 → PC 미리보기 패널에 카드 상세 표시`);
    ok(pg.errs.length === 0, `${nm}: JS 오류 없음 ${pg.errs.join('|')}`); await pg.context().close();
  }
  // 회전: 세로→가로로 바꿔도 PC UI 유지
  { const pg = await open({ w: 390, h: 844, m: true, dpr: 3 }); await pg.setViewportSize({ width: 844, height: 390 }); await pg.waitForTimeout(500); const g = await geo(pg); ok(!g.m && g.W >= 1280 && !g.over, `회전 후에도 PC UI·넘침 없음 (innerWidth=${g.W})`); await pg.context().close(); }
  // PC 마우스는 기존과 동일(?m=1 같은 강제 옵션도 PC UI 유지)
  { const pg = await open({ w: 1366, h: 768 }); const g = await geo(pg); ok(!g.m && g.W === 1366 && g.pvInSide, 'PC 1366x768: 변화 없음'); await pg.goto('file://' + path.resolve(__dirname, '../index.html') + '?m=1'); ok(!(await geo(pg)).m, '?m=1 로도 모바일 UI 안 켜짐'); await pg.context().close(); }
  await br.close(); console.log(`\n${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
