// 반대 상황: 방치하면 상대가 다음 턴 사건 해결 → 증거보다 제거
const { ch, field, clearHand, make } = require('./_util.js');
module.exports = {
  name: '상대가 해결편 + 증거 1 부족, 슬립 캐릭터 X 가 다음 턴 추리하면 해결 → X 를 제거',
  reason: '상대 X(LP1)를 남기면 상대 턴에 추리로 증거가 채워져 바로 진다. 증거 2보다 상대 리살 차단이 우선.',
  source: 'user-evidence-vs-board (boardLeakRisk)', tags: ['evidence-vs-board', 'opp-lethal'], expert: 'A',
  candidates: { A: 'attack:A>X', B: 'reason:A' },
  setup(H, ctx) { return make(ctx, () => { const R = H.game({ A: ch('A', 5, 5000, 2), X: ch('X', 1, 1000, 1) }), s = R.turn, o = 1 - s; clearHand(R, s); H.fill(R, s, 4); field(H, R, s, 'A'); field(H, R, o, 'X', 's');
    R.cards[R.P[o].kase].solved = true; const need = +R.defs[R.cards[R.P[o].kase].d][o === R.first ? 'lv' : 'lv2']; while (R.P[o].evid.length < need - 1) R.P[o].evid.push(R.P[o].deck.pop()); H.fill(R, o, 6); return R; }); },
};
