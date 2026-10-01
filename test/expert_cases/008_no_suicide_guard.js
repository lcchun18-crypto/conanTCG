// 가드 판단(미시 결정): 서 있는(액티브) 캐릭터가 가드하다 죽는 것은 손해 → 가드하지 않는다
const { ch, field, clearHand, make } = require('./_util.js');
module.exports = {
  name: '상대 AP8000 이 내 슬립 L(AP1000) 을 공격 — AP5000 G 로 가드하면 G 가 대신 죽는다 → 가드 안 함',
  reason: '가드해도 G(AP5000)가 AP8000 에 리무브될 뿐, 더 가치 있는 액티브 캐릭터를 잃는다(v1.2 원칙 1).',
  source: 'pro-v12 원칙 1 (사용자 제공)', tags: ['guard'], expert: 'A',
  candidates: { A: 'noguard', B: 'guard:G' },
  setup(H, ctx) { return make(ctx, () => { const R = H.game({ BIG: ch('BIG', 7, 8000, 1), G: ch('G', 5, 5000, 2), L: ch('L', 1, 1000, 1) }), s = R.turn, o = 1 - s;
    clearHand(R, o); field(H, R, s, 'BIG'); field(H, R, o, 'G', 'a'); const l = field(H, R, o, 'L', 's'); H.fill(R, s, 5); H.fill(R, o, 4);
    const big = R.P[s].field.find(id => H.key(R, id) === 'BIG'); const e = H.act(R, s, { a: 'action', id: big, k: 'char', tid: l }); if (e) throw new Error(e); return R; }); },
};
