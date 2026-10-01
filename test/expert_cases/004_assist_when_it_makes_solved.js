// 파트너 추리 vs 어시스트: FILE 6 → 어시스트로 해결편 이행이 리살 루트 → 어시스트
const { ch, field, clearHand, make } = require('./_util.js');
module.exports = {
  name: 'FILE 6 + 어시스트 = 7 → 해결편 이행 (파트너 추리보다 어시스트)',
  reason: '이번 어시스트가 해결편을 만들어 다음 턴 해결이 가능해진다(승리 턴 단축). 파트너 추리 1장보다 크다.',
  source: 'user-partner-deduction-vs-assist / user-turns-to-win', tags: ['partner-vs-assist', 'race'], expert: 'A',
  candidates: { A: 'assist', B: 'reason:p' },
  setup(H, ctx) { return make(ctx, () => { const R = H.game({ A: ch('A', 5, 5000, 2) }), s = R.turn; clearHand(R, s); H.fill(R, s, 6); field(H, R, s, 'A'); return R; }); },
};
