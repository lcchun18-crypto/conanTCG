// FILE 은 마나가 아니다 — 하지만 FILE 8 에서는 8→7 (넥스트 힌트) 연속 행동이 강하다 (힌트 후에도 FILE 7, 다음 턴 9)
const { ch, clearHand, make } = require('./_util.js');
module.exports = {
  name: 'FILE 8: 레벨 8 사용 뒤 넥스트 힌트로 레벨 7 까지 (8→7) — FILE 7 이 남아 다음 턴 루트도 유지',
  reason: '같은 턴에 강한 행동 2번(8→7). 힌트 후 FILE 7 이라 다음 턴 FILE 9(어시스트 10)로 최대 전개도 그대로다.',
  source: 'kazamona-file-output (8→7→6 > 7→6→5) / user-file-not-mana', tags: ['file', 'next-hint'], expert: 'A',
  candidates: { A: ['play:C8', 'hint'], B: ['play:C8', 'end'] },
  setup(H, ctx) { return make(ctx, () => { const R = H.game({ C8: ch('C8', 8, 8000, 1), C7: ch('C7', 7, 7000, 1) }), s = R.turn; clearHand(R, s); H.give(R, s, 'C8', 'hand'); H.give(R, s, 'C7', 'hand'); H.fill(R, s, 8); return R; }); },
};
