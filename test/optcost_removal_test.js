// v1.17.14 AI: "손패를 리무브해도 좋다. 그렇게 한 경우 AP n 이하 제거" (id_0133 등) — 제거할 합법 상대가 있으면 반드시 비용을 내고 제거, 없으면 비용을 내지 않는다
process.env.BOT_ENGINE = 'rule';
const U = require('./mz_util'); const { G, real, dummy, field, hand, req, act } = U; const SIM = require('../bot/simulate.js'), { decide } = require('../bot/decide.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const nm = (R, id) => R.defs[R.cards[id].d].n;
function run(opps, partnerColor = 'red') { const R = G({ x: real('id_0133', { color: 'red' }), h: dummy('손패', { color: 'red' }), h2: dummy('손패2', { color: 'red' }), ...Object.fromEntries(opps.map(([n, lv, ap]) => [n, dummy(n, { color: 'red', lv: String(lv), ap: String(ap) })])) }, ['x', 'h', 'h2'], [opps[0][0]], { p: { n: 'P', type: 'partner', color: partnerColor, lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } });
  const s = R.turn, o = 1 - s; for (const [n] of opps) field(R, o, n); const x = hand(R, s, 'x'); hand(R, s, 'h'); hand(R, s, 'h2'); R.P[s].file.push(...U.filler(R, s, 8)); const h0 = R.P[s].hand.length;
  act(R, s, { a: 'play', id: x }); const log = []; let g = 0; while (R.eff && g++ < 8) { const r = decide({ R, seat: s, cfg: { lethal: false } }); log.push(r.info.why); if (SIM.applyMove(R, r.mv, 5)) break; } return { R, s, o, log, h0 }; }
{ const { R, o, s, log, h0 } = run([['A', 3, 5000], ['B', 5, 7000], ['C', 2, 9000]]); ok(R.P[o].rem.length === 1 && nm(R, R.P[o].rem[0]) === 'B', `1 제거 가능한 후보(AP≤8000) 중 최고 AP B 제거: ${R.P[o].rem.map(i => nm(R, i))}`); ok(R.P[s].hand.length === h0 - 2 + 0 || R.P[s].rem.length >= 1, '2 손패 1장을 비용으로 리무브'); ok(/비용을 내고/.test(log[0]), '3 판단 로그: ' + log[0]); }
{ const { R, o, log } = run([['A', 3, 9000], ['B', 5, 12000]]); ok(R.P[o].rem.length === 0 && /지불 안 함|없음/.test(log[0] || ''), '4 합법 타겟 없음(AP>8000) → 비용 안 냄: ' + log[0]); }
{ const { R, o } = run([['A', 3, 5000]], 'blue'); ok(R.P[o].rem.length === 0, '5 파트너 색 조건 불충족이면 효과 자체가 없음'); }
console.log(`\noptcost_removal_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
