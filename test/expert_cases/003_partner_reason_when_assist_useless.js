// 파트너 추리 vs 어시스트: 어시스트가 아무것도 만들지 않으면(해결편도, 레벨+1 카드도 없음) 파트너는 추리
const { ch, clearHand, make } = require('./_util.js');
module.exports = {
  name: 'FILE 3, 레벨 4 카드 없음, 증거 충분 → 어시스트(임시 FILE+1) 대신 파트너 추리',
  reason: '이번 어시스트로 생기는 가치가 없다(해결편 불가, 낼 카드 변화 없음, 턴이 끝나면 사라짐). 파트너 추리 증거는 상대 사건 공격에 대한 여유가 된다.',
  source: 'user-partner-deduction-vs-assist / kazamona-partner-reason-when-file-enough', tags: ['partner-vs-assist'], expert: 'A',
  candidates: { A: 'reason:p', B: 'assist' },
  setup(H, ctx) { return make(ctx, () => { const R = H.game({ L1: ch('L1', 1, 2000, 1) }), s = R.turn; clearHand(R, s); H.give(R, s, 'L1', 'hand'); H.fill(R, s, 3); const need = +R.defs[R.cards[R.P[s].kase].d].lv; while (R.P[s].evid.length < need) R.P[s].evid.push(R.P[s].deck.pop()); return R; }); },
};
