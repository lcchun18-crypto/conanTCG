// 보조: CARDS_DB 의 id_0284(이벤트 "카드를 N장 뽑는다")를 실제 엔진에서 사용하고 손패 증가량을 출력한다. (cards_xlsx_test.py 가 호출)
const U = require('./mz_util'); const { G, real, fillFile, hand, S, pump } = U;
const R = G({ E: real('id_0284') }, ['E'], ['E']); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn; const id = hand(R, s, 'E'); const before = R.P[s].hand.length;
U.play(R, s, id); pump(R); let g = 0; while (R.eff && g++ < 5) { const q = R.eff.req; require('./helpers').act(R, q.who, { a: 'ans', v: q.kind === 'yn' ? true : null }); pump(R); }
console.log(JSON.stringify({ delta: R.P[s].hand.length - before + 1 }));
