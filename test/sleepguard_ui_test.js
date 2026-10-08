// v1.17.8 슬립 가드 UI 표시: 서버 view(sg) + 카드 위 배지(💤 슬립 가드) + 미리보기 chip
process.chdir(__dirname + '/..');
const U = require('./mz_util'); const { G, real, dummy, field, S } = U; let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break } catch (e) { } }
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const defs = { k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' }, p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, g: real('id_0332', { color: 'red' }), n: dummy('일반', { color: 'red' }) };
const R = G(defs, ['g', 'n'], ['n'], { p: defs.p, k: defs.k }); const s = R.turn; const g = field(R, s, 'g', 's'); const n = field(R, s, 'n', 's');
const v = JSON.parse(JSON.stringify(S.view(R, s))); const cs = v.P[s].field; const cg = cs.find(c => c.id === g), cn = cs.find(c => c.id === n);
ok(cg && cg.sg === 1, '서버 view: 슬립 가드 카드 sg=1'); ok(cn && !cn.sg, '서버 view: 일반 카드 sg 없음');
(async () => { const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
  await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this } send() { } close() { } } });
  await pg.goto('file://' + process.cwd() + '/index.html'); await pg.evaluate(x => window.__ws.onmessage({ data: JSON.stringify(x) }), { t: 'defs', defs: R.defs }); await pg.evaluate(x => window.__ws.onmessage({ data: JSON.stringify(x) }), v); await pg.waitForTimeout(300);
  const info = await pg.evaluate(([g, n]) => ({ g: !!document.querySelector(`.card[data-id="${g}"] .mods i.kw`), n: !!document.querySelector(`.card[data-id="${n}"] .mods i.kw`), t: (document.querySelector('.mods i.kw') || {}).title }), [g, n]);
  ok(info.g && /슬립 가드/.test(info.t), '카드 위에 슬립 가드 배지 표시'); ok(!info.n, '일반 카드에는 배지 없음');
  await pg.evaluate(id => document.querySelector(`.card[data-id="${id}"]`).dispatchEvent(new MouseEvent('mouseenter')), g); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => /슬립 가드/.test(document.getElementById('pv').textContent)), '미리보기 패널 chip 표시');
  await pg.screenshot({ path: '/tmp/sg.png' }); await br.close(); console.log(`\nsleepguard_ui_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0) })();
