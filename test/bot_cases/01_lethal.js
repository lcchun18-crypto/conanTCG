// 확정 승리가 있으면 반드시 찾는다 (즉시 해결 / 추리 후 해결)
const mk = (H, evidN, withChar) => { const R = H.game({ a: { n: 'A', type: 'char', color: 'red', lv: '1', ap: '3000', lp: '1' } }), s = R.turn, P = R.P[s];
  R.cards[P.kase].solved = true; for (let i = 0; i < evidN; i++) P.evid.push(P.deck.pop());
  if (withChar) { const id = H.give(R, s, 'a', 'field'); R.cards[id].st = 'a'; R.cards[id].sum = 0; } return R; };
module.exports = [
  { name: '해결편 + 증거 충분 → 사건 해결을 즉시 선택', setup: H => mk(H, 2, false), expect(res) { if (res.mv.tag !== 'solve') throw new Error('solve 가 아님: ' + res.mv.tag); } },
  { name: '증거 1장 부족, 액티브 캐릭터 → 추리한 뒤 해결하는 2수 라인을 찾는다', setup: H => mk(H, 1, true), expect(res) { if (!res.info.win) throw new Error('승리 라인을 못 찾음 ' + JSON.stringify(res.info.lineDesc)); if (!res.info.lineDesc.includes('사건 해결')) throw new Error('라인에 해결이 없음'); } },
];
