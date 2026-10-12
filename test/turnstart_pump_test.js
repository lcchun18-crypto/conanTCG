// v1.17.15 턴 시작 시(상대 턴 메인 페이즈 시작 시) 효과는 턴이 넘어간 즉시 처리되어, 턴 플레이어(봇 포함)가 먼저 행동하지 못한다 (id_1263)
const U = require('./mz_util'); const { G, real, dummy, hand, has, req, ans, auto, pump, endTurn, solve, fillFile, FX, give } = U; const SIM = require('../bot/simulate.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const HAY = [{ ic: 'onplay', cond: { nth: 1 }, ops: [], hay: true, txt: '【疾風】' }];
for (const yes of [true, false]) {
  const R = G({ h: dummy('손패', { color: 'yellow' }), y: dummy('疾風Lv5', { color: 'yellow', lv: '5' }), f: dummy('필러', { color: 'yellow' }), o: dummy('상대', { color: 'yellow' }) }, ['h', 'y', 'f'], ['o', 'o', 'o'], { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: real('id_1263', { color: 'yellow/black' }) }); const s = R.turn, o = 1 - s; fillFile(R, s, 6);
  const h = hand(R, s, 'h'); solve(R, s); const q0 = req(R); if (q0) { ans(R, [h]); pump(R); } auto(R);
  const y = hand(R, s, 'y'); R.defs[R.cards[y].d].ab = HAY; const kid = R.P[s].kase; const i = R.defs[R.cards[kid].d].ab.findIndex(a => a.ic === 'declare'); FX.declare(R, s, kid, i); pump(R); const q = req(R); if (q) { ans(R, [y]); pump(R); } auto(R);
  ok(R.P[s].pa.includes(y), `[${yes}] 파트너 에리어에 있음`);
  endTurn(R);   // 펌프 없이: 턴이 넘어간 직후 상태
  const q3 = req(R); ok(R.turn === o && q3 && q3.kind === 'yn' && q3.who === s, `[${yes}] 턴 시작 직후 곧바로 효과 질문이 대기 (펌프 없이)`); const d = SIM.who(R); ok(d && d.kind === 'eff' && d.seat === s, `[${yes}] 결정 주체 = 효과 주인(턴 플레이어가 먼저 행동하지 못함)`);
  ans(R, yes); pump(R); ok(yes ? R.P[s].field.includes(y) : R.P[s].rem.includes(y), `[${yes}] 응답 처리`); ok(!R.eff, `[${yes}] 이후 정상 진행`); }
console.log(`\nturnstart_pump_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
