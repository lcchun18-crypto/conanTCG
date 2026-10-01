// Action Economy: 한 장으로 전개 + 제거 + 증거 → AP 가 높은 단순 캐릭터보다 우선
const { ch, field, clearHand, make } = require('./_util.js');
module.exports = {
  name: '등장 + 상대 제거 + 증거 1 (AP3000) vs 단순 AP6000 → 다면 카드',
  reason: '한 장/한 행동으로 3개 영역(내 필드, 상대 필드, 증거)에 영향 — 수치만 높은 캐릭터보다 템포가 훨씬 크다.',
  source: 'user-action-economy / donka-min-cards-removal', tags: ['action-economy'], expert: 'A',
  candidates: { A: 'play:Y3', B: 'play:X6' },
  setup(H, ctx) { return make(ctx, () => { const R = H.game({ X6: ch('X6', 4, 6000, 1), Y3: ch('Y3', 4, 3000, 1, { ab: [{ ic: 'onplay', ops: [{ op: 'select', n: 1, do: 'remove', filter: { own: 'opp' } }, { op: 'gain', n: 1 }] }] }), Z: ch('Z', 2, 2000, 1) }), s = R.turn, o = 1 - s;
    clearHand(R, s); H.give(R, s, 'X6', 'hand'); H.give(R, s, 'Y3', 'hand'); H.fill(R, s, 4); field(H, R, o, 'Z', 's'); return R; }); },
};
