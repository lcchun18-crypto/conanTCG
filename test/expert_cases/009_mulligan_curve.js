// 멀리건: 초동 실패(패스) 확률까지 — 선공 손패 [1,3,5,7,9] → 9 만 교체(1·3·5·7 곡선 유지)가 전부 유지/곡선 카드까지 교체보다 낫다
const { ch, make } = require('./_util.js');
module.exports = {
  name: '선공 멀리건: 레벨 1·3·5·7 곡선 유지, 레벨 9 교체',
  reason: '선공 1~4턴 FILE 1·3·5·7 에 맞는 카드가 이미 다 있다(패스 확률 최소). 레벨 9 는 5턴 이후 카드라 교체하고, 곡선 카드를 바꾸면 초동 실패 확률만 오른다.',
  source: 'user-mulligan-curve-failure', tags: ['mulligan'], expert: 'A',
  candidates: { A: 'mull:c9', B: 'mull:', C: 'mull:c5,c7,c9' },
  setup(H, ctx) { return make(ctx, () => { const S = H.S, R = S.mkR('M'); R.firstPref = 0; const d = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } }, l = [];
    for (let lv = 0; lv <= 9; lv++) { d['c' + lv] = ch('C' + lv, lv, 1000 + lv * 1000, 1); d['e' + lv] = ch('E' + lv, lv, 1000 + lv * 1000, 1); for (let i = 0; i < 3; i++) l.push('c' + lv); l.push('e' + lv); }
    for (let s = 0; s < 2; s++) { const e = S.ready(R, s, { defs: d, list: l, partner: 'p', kase: 'k' }); if (e) throw new Error(e); }
    const P = R.P[R.mullSeat], all = P.hand.concat(P.deck); P.hand = []; P.deck = all; for (const k of ['c1', 'c3', 'c5', 'c7', 'c9']) { const i = P.deck.findIndex(id => H.key(R, id) === k); P.hand.push(P.deck.splice(i, 1)[0]); } return R; }); },
};
