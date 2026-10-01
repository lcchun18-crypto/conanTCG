// 전투 계산: 상대 손패의 컷인으로 공격이 막히는지 "정확히" 계산한다 (Perfect Information)
const { Searcher } = require('../../bot/search.js');
const base = (H, oppHand) => { const defs = { atk: { n: 'ATK', type: 'char', color: 'red', lv: '1', ap: '3000', lp: '1' }, tgt: { n: 'TGT', type: 'char', color: 'red', lv: '1', ap: '3000', lp: '1' }, cut: { n: 'CUT', type: 'char', color: 'red', lv: '1', ap: '1000', lp: '1', kw: 'cutin2000' }, dud: { n: 'DUD', type: 'char', color: 'red', lv: '1', ap: '1000', lp: '1' } };
  const R = H.game(defs), s = R.turn, o = 1 - s; const a = H.give(R, s, 'atk', 'field'); R.cards[a].st = 'a'; R.cards[a].sum = 0; const t = H.give(R, o, 'tgt', 'field'); R.cards[t].st = 's'; R.cards[t].sum = 0;
  R.P[o].deck.push(...R.P[o].hand.splice(0, R.P[o].hand.length)); for (const k of oppHand) H.give(R, o, k, 'hand'); R.P[s].deck.push(...R.P[s].hand.splice(0, R.P[s].hand.length)); return { R, a, t, s, o }; };
const attack = (SIM, R, a, t, s) => { const sr = new Searcher({ seed: 1 }), node = SIM.Node.root(SIM.clone(R)), mv = SIM.genMoves(R, () => 0).find(m => m.tag === 'atkc' && m.m.id === a && m.m.tid === t), c = node.child(mv), st = sr.settle(c.node, c.pending || c.node.R, s); return st; };
module.exports = [
  { name: '상대 손패에 +2000 컷인이 있으면 AP 3000 공격은 막힌다 (상대는 컷인을 사용)', setup: H => { const x = base(H, ['cut']); H._x = x; return x.R; }, expect(res, R, H, SIM) { const { a, t, s } = H._x, st = attack(SIM, R, a, t, s);
      if (!st.resp.some(m => m.tag === 'cin')) throw new Error('상대 컷인 응수를 계산하지 못함: ' + st.resp.map(m => m.tag)); if (!st.R.P[1 - s].field.includes(t)) throw new Error('컷인을 썼는데 대상이 제거됨(AP 계산 오류)'); } },
  { name: '상대 손패에 컷인이 없으면 같은 공격이 성공한다 (상대 캐릭터 리무브)', setup: H => { const x = base(H, ['dud']); H._x = x; return x.R; }, expect(res, R, H, SIM) { const { a, t, s } = H._x, st = attack(SIM, R, a, t, s);
      if (st.resp.some(m => m.tag === 'cin')) throw new Error('없는 컷인을 계산함'); if (st.R.P[1 - s].field.includes(t)) throw new Error('공격이 성공해야 하는데 대상이 남아 있음'); } },
];
