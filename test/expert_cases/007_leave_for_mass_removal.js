// futureCleanupValue: 다음 턴 다면 제거(상대 캐릭터 전부)로 함께 처리할 수 있으면, 지금 하나를 잡기보다 추리
const { ch, field, clearHand, caseK, make } = require('./_util.js');
module.exports = {
  name: '손패에 "상대 캐릭터 전부 리무브"(다음 턴 사용 가능) → 지금 X1 공격 대신 추리',
  reason: '상대 X1·X2 는 다음 턴 전체 제거로 함께 처리된다. 지금 하나를 잡는 행동은 그 가치가 낮고, 추리 증거는 그대로 남는다.',
  source: 'user-evidence-vs-board (futureCleanupValue) / sumomo-green-evidence-first', tags: ['evidence-vs-board', 'cleanup'], expert: 'A',
  candidates: { A: 'reason:A', B: 'attack:A>X1' },
  setup(H, ctx) { return make(ctx, () => { const R = H.game({ A: ch('A', 5, 5000, 1), X1: ch('X1', 1, 1000, 1), X2: ch('X2', 2, 2000, 1), M: { n: 'M', type: 'event', color: 'red', lv: '5', ab: [{ ic: 'event', ops: [{ op: 'select', all: true, do: 'remove', filter: { own: 'opp' } }] }] }, ...caseK(5) }), s = R.turn, o = 1 - s;
    clearHand(R, s); H.give(R, s, 'M', 'hand'); H.fill(R, s, 4); field(H, R, s, 'A'); field(H, R, o, 'X1', 's'); field(H, R, o, 'X2', 's'); H.fill(R, o, 3); return R; }); },
};
