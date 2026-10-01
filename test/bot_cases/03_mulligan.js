// 멀리건: 당장 못 쓰는 고레벨 카드 위주의 손패는 교체, 좋은 손패는 유지
const mkG = (H, hand) => { const defs = {}; for (let i = 0; i < 8; i++) { if (i < 6) defs['hi' + i] = { n: 'HI' + i, type: 'char', color: 'red', lv: '6', ap: '5000', lp: '2' }; defs['lo' + i] = { n: 'LO' + i, type: 'char', color: 'red', lv: '1', ap: '3000', lp: '1' }; }
  const S = H.S, R = S.mkR('M'), d = { ...{ p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } }, ...defs }, list = [];
  for (const k of Object.keys(defs)) for (let i = 0; i < 3; i++) list.push(k); list.length = 40; while (list.length < 40) list.push('lo0');
  for (let s = 0; s < 2; s++) { const l = []; for (const k of Object.keys(defs)) for (let i = 0; i < 3; i++) l.push(k); while (l.length > 40) l.pop(); const e = S.ready(R, s, { defs: d, list: l.slice(0, 40), partner: 'p', kase: 'k' }); if (e) throw new Error(e); }
  const P = R.P[R.mullSeat]; const all = P.hand.concat(P.deck); P.hand = []; P.deck = all; for (const k of hand) { const i = P.deck.findIndex(id => H.key(R, id) === k); P.hand.push(P.deck.splice(i, 1)[0]); } return R; };
module.exports = [
  { name: '레벨 6 카드 5장 손패 → 대부분 교체', setup: H => mkG(H, ['hi0', 'hi1', 'hi2', 'hi3', 'hi4']), expect(res) { if (res.mv.tag !== 'mull' || res.mv.m.ids.length < 3) throw new Error('교체 장수 ' + (res.mv.m.ids || []).length); } },
  { name: '레벨 1 카드 위주의 손패 → 그대로 유지', setup: H => mkG(H, ['lo0', 'lo1', 'lo2', 'lo3', 'lo4']), expect(res) { if (res.mv.m.ids.length > 1) throw new Error('좋은 손패를 교체함: ' + res.mv.m.ids.length); } },
];
