// v1.17.7 id_0885 沖矢昴 【宣言】【スリープ】手札が2枚になるまで手札をリムーブする: 손패가 이미 2장 이하(0장 포함)여도 사용 가능
const U = require('./mz_util'); const { G, real, dummy, field, hand, req, FX, S } = U; const H = require('./helpers');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const BS = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } };
const ALLK = ['x', 'v', 'h', 'h1', 'h2', 'h3', 'h4'];
for (const hn of [0, 1, 2, 3, 5]) {
  const R = G({ x: real('id_0885', { color: 'red' }), v: dummy('상대캐릭터', { color: 'red' }), h: dummy('손패', { color: 'red' }), h1: dummy('손패1', { color: 'red' }), h2: dummy('손패2', { color: 'red' }), h3: dummy('손패3', { color: 'red' }), h4: dummy('손패4', { color: 'red' }) }, ALLK, ALLK, BS);
  const s = R.turn, o = 1 - s; const x = field(R, s, 'x'); const v = field(R, o, 'v');
  R.P[s].hand.splice(0); const keys = ['h', 'h1', 'h2', 'h3', 'h4']; for (let i = 0; i < hn; i++) H.give(R, s, keys[i], 'hand');
  const i = R.defs[R.cards[x].d].ab.findIndex(a => a.ic === 'declare'); const chk = FX.declareCheck(R, s, x, i);
  ok(!chk, `손패 ${hn}장: 선언 사용 가능${chk ? ' (거부: ' + chk + ')' : ''}`);
  const e = FX.declare(R, s, x, i); FX.pump(R); let q = R.eff && req(R); const need = Math.max(0, hn - 2);
  if (need > 0) { ok(q && q.kind === 'pick' && q.min === need && q.max === need, `손패 ${hn}장: ${need}장 리무브 선택 질의`); U.ans(R, q.sel.slice(0, need)); q = R.eff && req(R); }
  else ok(!q || q.msg === undefined || !/손패가/.test(q.msg || ''), `손패 ${hn}장: 리무브할 손패 질의 없음(0장 지불)`);
  ok(q && q.kind === 'pick' && q.sel.includes(v), `손패 ${hn}장: 이어서 캐릭터 선택(리무브 대상)`); if (q) U.ans(R, [v]); FX.pump(R);
  ok(R.P[o].rem.includes(v) && R.P[s].hand.length === Math.min(hn, 2) && R.cards[x].st === 's', `손패 ${hn}장: 상대 캐릭터 리무브, 손패 ${Math.min(hn, 2)}장, 슬립 상태`); }
console.log(`\nid_0885_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
