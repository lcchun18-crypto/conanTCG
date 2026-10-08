// v1.17.3 동시에 발동하는 효과의 처리 순서를 해당 플레이어가 고른다 (턴 플레이어 먼저, 이어서 상대)
const U = require('./mz_util'); const { G, dummy, field, hand, act, req, S } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const K = { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' };
const trig = (name, ops, extra = {}) => dummy(name, { ab: [{ ic: 'ontrig', evs: ['enter'], ops, txt: name + ' 효과', ...extra }] });
const DRAW = [{ op: 'draw', n: 1 }], GAIN = [{ op: 'gain', n: 1, who: 'self' }], SHUF = [{ op: 'shuffle', who: 'self' }];
function setup(defs, own, opp) { const R = G({ k: K, h: dummy('등장'), ...defs }, [], []); const s = R.turn, o = 1 - s; for (const k of own) field(R, s, k); for (const k of (opp || [])) field(R, o, k); const h = hand(R, s, 'h'); R.P[s].file.push(...U.filler(R, s, 2)); return { R, s, o, h }; }
const idx = (L, t) => L.findIndex(x => x.includes(t));
// 1) 내 효과 2개 동시 → 선택지가 뜨고, 고른 쪽이 먼저
for (const [pick, first, second] of [[0, '가나', '다라'], [1, '다라', '가나']]) {
  const { R, s, h } = setup({ a: trig('가나', DRAW), b: trig('다라', GAIN) }, ['a', 'b']);
  const e = act(R, s, { a: 'play', id: h }); ok(!e, '등장 플레이 성공' + (e ? ' ' + e : ''));
  let q = req(R); ok(q && q.kind === 'opt' && q.who === s && q.labels.length === 2, `[선택 ${pick}] 순서 선택 질의(opt 2개)가 내 차례로 온다`);
  ok(q && q.labels.some(l => l.includes('가나')) && q.labels.some(l => l.includes('다라')), '선택지에 카드 이름이 보인다');
  const names = q.labels.map(l => l.split(' — ')[0]); const wantIdx = names.indexOf(first); U.ans(R, wantIdx);
  U.auto(R); const L = R.log; const f = idx(L, `${first} 먼저 처리`);
  ok(f >= 0, `로그에 "[발동 순서] … ${first} 먼저 처리"`); ok(idx(L, `발동: ${first}`) >= 0 && idx(L, `발동: ${second}`) > idx(L, `발동: ${first}`), `${first} → ${second} 순서로 처리된다`);
  ok(!R.eff && !R.q.length, '남은 하나는 추가 질문 없이 자동 처리'); }
// 2) 효과가 1개뿐이면 질문이 없다
{ const { R, s, h } = setup({ a: trig('가나', DRAW) }, ['a']); act(R, s, { a: 'play', id: h }); const q = req(R); ok(!q || q.itK !== 'ord', '1개뿐이면 순서 질문이 없다'); }
// 3) 같은 카드(같은 능력) 2장은 구분할 수 없으므로 질문하지 않는다
{ const { R, s, h } = setup({ a: trig('가나', DRAW) }, ['a', 'a']); act(R, s, { a: 'play', id: h }); const q = req(R); ok(!q || !(q.msg || '').includes('동시에'), '같은 카드 2장은 순서 질문이 없다'); }
// 4) 턴 플레이어가 먼저 고르고, 이어서 상대가 자기 효과 순서를 고른다
{ const { R, s, o, h } = setup({ a: trig('가나', DRAW), b: trig('다라', GAIN), c: trig('마바', DRAW), d: trig('사아', SHUF) }, ['a', 'b'], ['c', 'd']); act(R, s, { a: 'play', id: h });
  let q = req(R); ok(q && q.who === s && /동시에/.test(q.msg), '먼저 턴 플레이어에게 순서 질문');
  U.ans(R, 1); q = req(R); ok(q && q.who === o && /동시에/.test(q.msg), '턴 플레이어 효과가 끝난 뒤 상대에게 순서 질문');
  ok(idx(R.log, '발동: 가나') >= 0 && idx(R.log, '발동: 다라') >= 0 && idx(R.log, '발동: 마바') < 0, '상대 질문 시점에는 내 두 효과가 이미 처리됨');
  U.ans(R, 0); U.auto(R); ok(idx(R.log, '발동: 마바') >= 0 && idx(R.log, '발동: 사아') >= 0, '상대 효과도 모두 처리'); }
// 5) 뷰: 질문은 해당 플레이어에게만 보이고 효과 제목 정보 없이도 표시 가능
{ const { R, s, o, h } = setup({ a: trig('가나', DRAW), b: trig('다라', GAIN) }, ['a', 'b']); act(R, s, { a: 'play', id: h });
  const V = S.view(R, s), W = S.view(R, o); ok(V.eff && V.eff.kind === 'opt' && V.eff.labels.length === 2 && V.eff.itK === 'ord', '내 뷰에 순서 질문(eff)이 있다'); ok(W.eff && W.eff.wait === 1 && !W.eff.labels, '상대 뷰에는 선택지 대신 "처리 중" 대기 표시만 보인다'); }
// 6) 브라우저: 순서 선택 질문이 화면에 그려지고, 고른 번호가 서버로 전달된다
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
const fs = require('fs');
(async () => { if (chromium) { const { R, s, h } = setup({ a: trig('가나', DRAW), b: trig('다라', GAIN) }, ['a', 'b']); act(R, s, { a: 'play', id: h });
    const br = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}); const pg = await (await br.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.__sent = []; window.WebSocket = class { constructor() { this.readyState = 1; window.__ws = this; } send(d) { window.__sent.push(JSON.parse(d)); } close() {} }; });
    await pg.goto('file://' + require('path').resolve(__dirname, '../index.html')); const feed = m => pg.evaluate(m => window.__ws.onmessage({ data: JSON.stringify(m) }), m);
    await feed({ t: 'defs', defs: R.defs }); await feed(JSON.parse(JSON.stringify(S.view(R, s)))); await pg.waitForSelector('#effp .box'); await pg.waitForTimeout(150);
    const info = await pg.evaluate(() => ({ title: document.querySelector('#effp .fxh b').textContent, btns: [...document.querySelectorAll('button')].map(b => b.textContent).filter(t => /—/.test(t)) }));
    ok(info.title === '발동 순서 선택', `화면 제목 "${info.title}"`); ok(info.btns.length === 2 && info.btns[0].includes('가나') && info.btns[1].includes('다라'), `선택 버튼 2개 ${JSON.stringify(info.btns)}`);
    await pg.locator('button', { hasText: '다라' }).first().click(); await pg.waitForTimeout(100); const sent = await pg.evaluate(() => window.__sent.filter(x => x.a === 'ans'));
    ok(sent.length === 1 && sent[0].v === 1, `두 번째 버튼 클릭 → 번호 1 전송 ${JSON.stringify(sent)}`); ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|')); await br.close(); }
  console.log(`\ntrigger_order_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0); })();
