// v1.8.6: ① FILE 개수 라벨이 파트너/카드에 가려지지 않는다 ② 카드 이동 애니메이션 뒤에도 파트너가 FILE 카드들 앞에 있다
const path = require('path'), fs = require('fs'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const U = require('./mz_util'); const { G, dummy, fillFile, S } = U;
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><rect width="280" height="400" fill="${c}"/><text x="20" y="200" font-size="40" fill="#111">${t}</text></svg>`);
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => { const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  for (const [T, vp, mob, n] of [['PC', { width: 1366, height: 768 }, false, 8], ['PC(14장)', { width: 1366, height: 768 }, false, 14], ['모바일', { width: 844, height: 390 }, true, 8]]) {
    const R = G({ c: dummy('C', { color: 'yellow' }) }, ['c'], ['c'], BS); fillFile(R, 0, n); fillFile(R, 1, n); for (const k of Object.keys(R.defs)) R.defs[k].img = svg(R.defs[k].n, '#dcb');
    const s = R.turn; const before = JSON.parse(JSON.stringify(S.view(R, s))); R.P[s].pIn = true; R.cards[R.P[s].partner].st = 's'; const after = JSON.parse(JSON.stringify(S.view(R, s)));
    const pg = await (await br.newContext(mob ? { viewport: vp, isMobile: true, hasTouch: true } : { viewport: vp })).newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send() {} close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); const push = v => pg.evaluate(x => window.__ws.onmessage({ data: JSON.stringify(x) }), v);
    await pg.evaluate(x => window.__ws.onmessage({ data: JSON.stringify({ t: 'defs', defs: x }) }), R.defs); await push(before); await pg.waitForTimeout(100); await push(after); await pg.waitForTimeout(900);   // 이동 애니메이션(0.44초)이 끝난 뒤
    const r = await pg.evaluate(() => { const f = document.querySelector('#me-file'), p = f.querySelector('.fp'), cs = [...f.querySelectorAll('.card.fl')].filter(c => c !== p), lab = f.querySelector('.lab'), lb = lab.getBoundingClientRect(), top = document.elementFromPoint(lb.left + lb.width / 2, lb.top + lb.height / 2);
      return { pz: p ? +p.style.zIndex : null, maxz: Math.max(...cs.map(c => +c.style.zIndex)), lab: lab.textContent, labTop: top === lab || lab.contains(top) }; });
    ok(r.pz != null && r.pz > r.maxz, `${T}: 이동 애니메이션 뒤에도 파트너가 FILE 카드보다 앞 (z ${r.pz} > ${r.maxz})`); ok(r.labTop, `${T}: FILE 개수 라벨(${r.lab})이 가려지지 않음`); ok(!pg.errs.length, `${T}: JS 오류 없음 ${pg.errs}`); await pg.context().close(); }
  console.log(`file_order_test: ${pass} 통과, ${fail} 실패`); await br.close(); process.exit(fail ? 1 : 0); })();
