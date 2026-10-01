// expert_cases 공용 도우미 (파일 이름이 '_' 로 시작하면 케이스로 읽지 않는다)
const ch = (n, lv, ap, lp, e = {}) => ({ n, type: 'char', color: 'red', lv: String(lv), ap: String(ap), lp: String(lp), ...e });
const field = (H, R, s, k, st = 'a') => { const id = H.give(R, s, k, 'field'); R.cards[id].st = st; R.cards[id].sum = 0; return id; };
const clearHand = (R, s) => { R.P[s].deck.push(...R.P[s].hand); R.P[s].hand = []; };
const caseK = (lv, lv2 = lv) => ({ k: { n: 'K', type: 'case', color: 'red', lv: String(lv), lv2: String(lv2) } });
// 결정적(시드 고정) 상태 만들기
const make = (ctx, fn) => ctx.SIM.withRng(42, fn);
module.exports = { ch, field, clearHand, caseK, make };
