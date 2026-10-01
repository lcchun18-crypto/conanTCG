// 증거 vs 무해한 캐릭터 제거: 방치해도 상대의 즉시 해결/치명적 이득으로 이어지지 않으면, 승리 턴을 앞당기는 증거가 더 강하다
const { ch, field, clearHand, caseK, make } = require('./_util.js');
module.exports = {
  name: '무해한 상대 캐릭터(AP1000·LP0)를 잡기보다 LP2 추리로 승리 턴을 1턴 앞당긴다',
  reason: '상대 X 는 증거도 못 만들고 내 캐릭터도 못 잡는다. 지금 A 로 추리하면 해결까지 2턴(공격하면 3턴) — 필드 하나보다 승리 턴 1턴이 크다.',
  source: 'user-evidence-vs-board / user-turns-to-win', tags: ['evidence-vs-board', 'race'], expert: 'A',
  candidates: { A: 'reason:A', B: 'attack:A>X' },
  setup(H, ctx) { return make(ctx, () => { const R = H.game({ A: ch('A', 5, 5000, 2), X: ch('X', 1, 1000, 0), ...caseK(6) }), s = R.turn, o = 1 - s; clearHand(R, s); H.fill(R, s, 4); field(H, R, s, 'A'); field(H, R, o, 'X', 's'); H.fill(R, o, 3); return R; }); },
};
