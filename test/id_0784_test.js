// v1.17.23 id_0784 紅の盟約 / id_0203: 「세트된 카드를 합쳐서 2장 리무브」 — 1장만 리무브하고 "그렇게 한 경우"로 진행하던 버그, 상대 현장 세트까지 대상이던 버그
const U = require('./mz_util'); const { G, real, dummy, field, give, req, ans, pump } = U; const S = require('../server.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const W = { p: { n: 'P', type: 'partner', color: 'white', lp: '1' }, k: { n: 'K', type: 'case', color: 'white', lv: '2', lv2: '3' } };
const nm = (R, i) => R.defs[R.cards[i].d].n;
const mk = (fdMine, fdOpp, extraMine) => { const R = G({ ev: real('id_0784', { color: 'white' }), h: dummy('내A', { color: 'white', ap: '3000' }), h2: dummy('내B', { color: 'white', ap: '3000' }), b: dummy('적7000', { color: 'red', ap: '7000' }), c: dummy('적5000', { color: 'red', ap: '5000' }), d1: dummy('d1', { color: 'white' }), d2: dummy('d2', { color: 'white' }), d3: dummy('d3', { color: 'white' }) }, ['ev', 'h', 'h2', 'd1', 'd2', 'd3'], ['d1'], W);
  const s = R.turn, P = R.P[s]; const h = field(R, s, 'h'), h2 = field(R, s, 'h2'), b = field(R, 1 - s, 'b'), c = field(R, 1 - s, 'c');
  const setFd = (holder, k) => { const id = give(R, s, k, 'deck'); P.deck.splice(P.deck.indexOf(id), 1); (R.cards[holder].fd = R.cards[holder].fd || []).push(id); R.cards[id].fdOn = holder; return id; };
  const ks = ['d1', 'd2', 'd3']; let n = 0; for (let i = 0; i < fdMine[0]; i++) setFd(h, ks[n++]); for (let i = 0; i < fdMine[1]; i++) setFd(h2, ks[n++]);
  const ev = give(R, s, 'ev', 'hand'); for (let i = 0; i < 8; i++) P.file.push(P.deck.pop());
  return { R, s, P, h, h2, b, c, ev }; };
const play = (R, s, ev, pickFn) => { const e = S.act(R, s, { t: 'act', a: 'play', id: ev }); if (e) return e; pump(R); const seen = []; for (let g = 0; g < 12; g++) { const q = req(R); if (!q) break; seen.push(q.msg); ans(R, q.kind === 'yn' ? true : pickFn(q)); pump(R); } return seen; };
const target = (R, name) => q => [q.sel.find(i => nm(R, i) === name) ?? q.sel[0]];
// 1) 내A 에 세트 2장: 적7000 제거 → 세트 2장 모두 리무브 → AP6000 이하(적5000) 추가 제거
{ const { R, s, P, h, b, c, ev } = mk([2, 0]); const seen = play(R, s, ev, q => /세트된/.test(q.msg) ? [q.sel[0]] : [q.sel.find(i => nm(R, i) === (R.P[1 - s].field.includes(b) ? '적7000' : '적5000')) ?? q.sel[0]]);
  ok((R.cards[h].fd || []).length === 0 && P.field.includes(h), `1 세트 2장 모두 리무브, 내 캐릭터(내A)는 현장에 남음 (fd ${(R.cards[h].fd || []).length})`); ok(!R.P[1 - s].field.includes(b) && !R.P[1 - s].field.includes(c), '1 적7000·적5000 모두 리무브'); }
// 2) 세트가 1장뿐이면 "2장 리무브" 불가 → 세트 카드는 그대로, 두 번째 리무브 없음
{ const { R, s, P, h, b, c, ev } = mk([1, 0]); play(R, s, ev, q => target(R, '적7000')(q));
  ok((R.cards[h].fd || []).length === 1, `2 세트 1장뿐: 세트 카드를 건드리지 않음 (fd ${(R.cards[h].fd || []).length})`); ok(!R.P[1 - s].field.includes(b) && R.P[1 - s].field.includes(c), '2 두 번째 리무브(AP6000 이하)는 일어나지 않음'); }
// 3) 2장이 서로 다른 캐릭터에 1장씩: 합쳐서 2장
{ const { R, s, P, h, h2, b, c, ev } = mk([1, 1]); play(R, s, ev, q => /세트된/.test(q.msg) ? [q.sel[0]] : [q.sel.find(i => nm(R, i) === (R.P[1 - s].field.includes(b) ? '적7000' : '적5000')) ?? q.sel[0]]);
  ok((R.cards[h].fd || []).length === 0 && (R.cards[h2].fd || []).length === 0 && P.field.includes(h) && P.field.includes(h2), '3 두 캐릭터의 세트 1장씩 모두 리무브, 캐릭터는 현장에 남음'); ok(!R.P[1 - s].field.includes(c), '3 이어서 적5000 리무브'); }
// 4) 상대 현장의 세트 카드는 대상이 아님
{ const { R, s, P, h, b, ev } = mk([1, 0]); const o = 1 - s; const id = give(R, o, 'd1', 'deck') ; const Po = R.P[o]; Po.deck.splice(Po.deck.indexOf(id), 1); (R.cards[b].fd = R.cards[b].fd || []).push(id); R.cards[id].fdOn = b;
  play(R, s, ev, q => target(R, '적5000')(q)); ok((R.cards[b].fd || []).length === 1 || !R.P[o].field.includes(b), '4 상대 캐릭터의 세트 카드는 세트 2장으로 세지 않음'); }
const D = U.DB(); ok(['id_0784', 'id_0203'].every(k => JSON.stringify(D[k].ab).includes('"op":"unset"') && JSON.stringify(D[k].ab).match(/"op":"unset"[^}]*"scope":"mine"/)), '5 cards.json: 두 카드 모두 scope=mine(자신의 현장)');
console.log(`\nid_0784_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
