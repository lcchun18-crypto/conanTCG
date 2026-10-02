// v1.9.0 UI (Playwright, PC+모바일): 공개 팝업 / 다시하기 / 이번 턴 다시시작 확인창
const path = require('path'), fs = require('fs'); let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('SKIP'); process.exit(0); }
const U = require('./mz_util'); const { G, dummy, field, fillFile, S } = U; const OUT = process.env.UI_SHOTS || '/tmp/ui_v19'; fs.mkdirSync(OUT, { recursive: true });
const BS = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } };
const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><rect width="280" height="400" fill="${c}"/><text x="20" y="200" font-size="40" fill="#111">${t}</text></svg>`);
const defs = { a: dummy('ALPHA', { color: 'yellow', ap: '3000' }), b: dummy('BRAVO', { color: 'yellow', ap: '4000' }), c: dummy('CHARLIE', { color: 'yellow' }) };
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
(async () => {
  const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  for (const mobile of [false, true]) { const T = mobile ? '모바일' : 'PC';
    const R = G(defs, ['a', 'b', 'c'], [], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); for (const k of Object.keys(R.defs)) R.defs[k].img = svg(R.defs[k].n, '#dcb'); const s = R.turn, o = 1 - s; S.snapTake(R);
    const hv = JSON.parse(JSON.stringify(S.view(R, s))), ov = JSON.parse(JSON.stringify(S.view(R, o))); ok(hv.rt === 1 && ov.rt === 0, `${T}: 서버 view.rt 현재 턴만`);
    const cards = [R.P[s].hand[0], R.P[s].hand[1], R.P[s].hand[2]].map(id => JSON.parse(JSON.stringify(require('../server.js').FX && hv.P[s].hand.find(c => c.id === id)))).filter(Boolean);
    const ctx = await br.newContext(mobile ? { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } }); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(d) { window.__sent.push(JSON.parse(d)); } close() {} }; });
    await pg.goto('file://' + path.resolve(__dirname, '../index.html')); const feed = (m) => pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), m);
    await feed({ t: 'defs', defs: R.defs }); await feed(hv); const vis = id => pg.evaluate(id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, id);
    // 다시하기 / 로비로 버튼
    if (mobile) await pg.evaluate(() => document.body.classList.add('topopen'));
    const order = await pg.evaluate(() => { const a = document.getElementById('restartBtn'), b = document.getElementById('leaveBtn'); return a && b && (a.compareDocumentPosition(b) & 4) ? [a.textContent, b.textContent, a.getBoundingClientRect().height, getComputedStyle(a).display] : null; });
    ok(order && /다시하기/.test(order[0]) && /로비로/.test(order[1]) && order[3] !== 'none', `${T}: [다시하기] [로비로] 순서로 표시 (${order && order.slice(0, 2)})`);
    await pg.evaluate(() => document.getElementById('restartBtn').click()); ok(await vis('yn') && /초기화하고 다시 시작/.test(await pg.evaluate(() => document.querySelector('#yn .ym').textContent)), `${T}: 다시하기 확인창 표시`);
    await pg.evaluate(() => document.getElementById('ynN').click()); ok(!(await vis('yn')) && !(await pg.evaluate(() => window.__sent.some(m => m.t === 'restartGame'))), `${T}: [아니오] → 요청 안 보냄`);
    await pg.evaluate(() => document.getElementById('restartBtn').click()); await pg.evaluate(() => document.getElementById('ynY').click()); ok(await pg.evaluate(() => window.__sent.filter(m => m.t === 'restartGame').length === 1), `${T}: [예] → restartGame 전송`);
    if (mobile) await pg.evaluate(() => document.body.classList.remove('topopen'));
    // 이번 턴 다시시작 버튼
    const rt = await pg.evaluate(() => { const b = document.getElementById('rtBtn'); return b ? b.textContent : null; }); ok(rt === '이번 턴 다시시작', `${T}: 내 턴에 [이번 턴 다시시작] 버튼 (${rt})`);
    await pg.evaluate(() => document.getElementById('rtBtn').click()); ok(await vis('yn') && /턴 시작 상태로 돌아가시겠습니까/.test(await pg.evaluate(() => document.querySelector('#yn .ym').textContent)), `${T}: 확인창 문구`);
    await pg.evaluate(() => document.getElementById('ynN').click()); ok(!(await pg.evaluate(() => window.__sent.some(m => m.t === 'restartTurn'))), `${T}: [아니오] → 요청 안 보냄`);
    await pg.evaluate(() => document.getElementById('rtBtn').click()); await pg.evaluate(() => document.getElementById('ynY').click()); ok(await pg.evaluate(() => window.__sent.some(m => m.t === 'restartTurn')), `${T}: [예] → restartTurn 전송`);
    await feed(ov); ok(!(await pg.evaluate(() => !!document.getElementById('rtBtn'))), `${T}: 상대 턴에는 다시시작 버튼 없음`); await feed(hv);
    // 공개 팝업
    await feed({ t: 'reveal', id: 1, by: o, to: [s], ack: o, msg: '상대가 공개', src: 'TESTCARD', cards }); await pg.waitForTimeout(100);
    const rv = await pg.evaluate(() => ({ on: document.getElementById('rvl').classList.contains('on'), n: document.querySelectorAll('#rvl .ri .card').length, names: [...document.querySelectorAll('#rvl .ri b')].map(x => x.textContent), ids: [...document.querySelectorAll('#rvl .ri small')].map(x => x.textContent), bg: [...document.querySelectorAll('#rvl .ri .card')].map(x => x.style.backgroundImage || getComputedStyle(x).backgroundImage).every(x => /svg|url/.test(x)), box: (() => { const r = document.querySelector('#rvl .rb').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; })() }));
    ok(rv.on && rv.n === cards.length && rv.names.length === cards.length && rv.names.every(x => x && x !== '?') && rv.bg, `${T}: 공개 팝업 — 실제 앞면 ${rv.n}장·이름 ${rv.names} 표시`); ok(rv.box[0] >= 0 && rv.box[2] <= rv.box[4] + 1 && rv.box[3] <= rv.box[5] + 1, `${T}: 팝업이 화면 안에 들어옴 (${rv.box.map(Math.round)})`);
    await pg.screenshot({ path: `${OUT}/reveal_${mobile ? 'm' : 'pc'}.png` }); await pg.evaluate(() => document.getElementById('rvOk').click()); ok(!(await vis('rvl')), `${T}: [확인] → 팝업 닫힘`);
    // 내가 공개한 것은 상대에게만: to 에 내가 없으면 표시 안 함
    await feed({ t: 'reveal', id: 2, by: s, to: [o], ack: s, msg: 'x', src: 'X', cards }); await pg.waitForTimeout(50); ok(!(await vis('rvl')), `${T}: to 에 내가 없는 공개는 팝업 없음 (공개자는 자기 카드를 팝업으로 보지 않음)`);
    // ack 대기 중 확인 → 효과 확인 응답 전송
    { const v3 = JSON.parse(JSON.stringify(hv)); v3.eff = { kind: 'ack', msg: '공개', reveal: 1, cards, src: 'TESTCARD', srcD: '', abI: -1, abN: 0, abLab: '', itK: '' }; await feed(v3); await feed({ t: 'reveal', id: 3, by: o, to: [s], ack: s, msg: '상대 손패 공개', src: 'TESTCARD', cards }); await pg.waitForTimeout(50);
      const n0 = await pg.evaluate(() => window.__sent.filter(m => m.t === 'act' && m.a === 'ans').length); await pg.evaluate(() => document.getElementById('rvOk').click()); const n1 = await pg.evaluate(() => window.__sent.filter(m => m.t === 'act' && m.a === 'ans').length); ok(n1 === n0 + 1, `${T}: 확인 대기 중이던 공개 → [확인] 이 효과 응답도 전송`); }
    // reset 메시지: 팝업/대화상자 정리
    await feed({ t: 'reveal', id: 4, by: o, to: [s], ack: o, msg: '', src: '', cards }); await feed({ t: 'reset', kind: 'game', by: o }); ok(!(await vis('rvl')) && !(await vis('yn')), `${T}: 초기화 메시지 → 팝업/확인창 정리`);
    ok(!pg.errs.length, `${T}: JS 오류 없음 ${pg.errs}`); await ctx.close(); }
  console.log(`ui_v19_test: ${pass} 통과, ${fail} 실패`); await br.close(); process.exit(fail ? 1 : 0); })();
