// v1.17.25 id_0533 大岡紅葉 외 세트 카드 리무브(unset/unsetPick): "자신이나 상대의 현장" — 상대 캐릭터에 세트된 (상대 소유) 카드가 후보에서 빠지던 버그
const U = require('./mz_util'); const { G, real, dummy, field, give, req, ans, pump, FX } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const W = { p: { ...real('id_0533', { color: 'green' }), type: 'partner', lp: '1' }, k: { n: 'K', type: 'case', color: 'green', lv: '2', lv2: '3' } };
const mk = (mine, opp) => { const defs = { a: dummy('내A', { color: 'green', ap: '3000' }), b: dummy('적B', { color: 'red', ap: '3000' }), c: dummy('적C', { color: 'red', ap: '9000', lv: '9' }), d1: dummy('d1', { color: 'green' }), d2: dummy('d2', { color: 'green' }), d3: dummy('d3', { color: 'green' }) };
  const R = G(defs, ['a', 'd1', 'd2', 'd3'], ['d1', 'd2', 'd3'], W); const s = R.turn, o = 1 - s, P = R.P[s]; const a = field(R, s, 'a'), b = field(R, o, 'b'), c = field(R, o, 'c');
  const setFd = (holder, own) => { const k = ['d1', 'd2', 'd3'].find(k => R.P[own].deck.some(i => R.defs[R.cards[i].d].n === k)); const id = R.P[own].deck.find(i => R.defs[R.cards[i].d].n === k); R.P[own].deck.splice(R.P[own].deck.indexOf(id), 1); (R.cards[holder].fd = R.cards[holder].fd || []).push(id); R.cards[id].fdOn = holder; };
  for (let i = 0; i < mine; i++) setFd(a, s); for (let i = 0; i < opp; i++) setFd(b, o); return { R, s, o, P, a, b, c }; };
const nm = (R, i) => R.defs[R.cards[i].d].n;
const run = (t, pick) => { const { R, s, P } = t; const pid = P.partner, i = R.defs[R.cards[pid].d].ab.findIndex(x => x.lim === 1); const err = FX.declareCheck(R, s, pid, i); FX.declare(R, s, pid, i); pump(R); const qs = []; for (let g = 0; g < 8; g++) { const q = req(R); if (!q) break; qs.push(q); ans(R, q.kind === 'yn' ? true : pick(q)); pump(R); } return { err, qs }; };
const opp = (t, q) => [q.sel.find(x => t.R.cards[x].o !== t.s) ?? q.sel[0]];
// 1) 내 세트 1장 + 상대 세트 1장 → 합쳐서 2장 리무브 후 Lv7 이하 캐릭터 리무브
{ const t = mk(1, 1); const r = run(t, q => /세트된/.test(q.msg) ? [q.sel[0]] : [q.sel.find(x => nm(t.R, x) === '적B') ?? q.sel[0]]);
  ok((t.R.cards[t.a].fd || []).length === 0 && (t.R.cards[t.b].fd || []).length === 0, '1 내 세트 1장 + 상대 세트 1장 모두 리무브'); ok(!t.R.P[t.o].field.includes(t.b) && t.R.P[t.o].field.includes(t.c), '1 이어서 Lv7 이하(적B) 리무브, Lv9(적C)는 그대로'); }
// 2) 상대 세트 2장(한 캐릭터) 도 가능
{ const t = mk(0, 2); const r = run(t, q => /세트된/.test(q.msg) ? [q.sel[0]] : [q.sel.find(x => nm(t.R, x) === '적B') ?? q.sel[0]]); ok((t.R.cards[t.b].fd || []).length === 0, '2 상대 캐릭터의 세트 2장도 리무브'); }
// 3) 합계 1장뿐이면 불가 (내 1장, 상대 0)
{ const t = mk(1, 0); run(t, q => [q.sel[0]]); ok((t.R.cards[t.a].fd || []).length === 1, '3 세트 합계 1장이면 효과 불가(세트 카드 그대로)'); }
// 4) 선언 가능 판정에도 상대 세트가 반영된다 (declareCheck 가 비어 있음 = 가능)
{ const t = mk(1, 1); const pid = t.P.partner, i = t.R.defs[t.R.cards[pid].d].ab.findIndex(x => x.lim === 1); ok(!FX.declareCheck(t.R, t.s, pid, i), '4 내 1 + 상대 1 → 선언 가능'); }
console.log(`\nid_0533_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
