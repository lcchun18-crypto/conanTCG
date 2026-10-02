// v1.8.4: [상대] 지정이 없는 대상은 아군만 (기본 own = self). 명시(opp / any)는 그대로.
delete process.env.CONAN_DEFAULT_OWN;
const U = require('./mz_util'); const { G, real, dummy, field, hand, fillFile, pump, req, FX, S } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const ev = filter => ({ n: 'EV', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, do: 'remove', filter }] }] });
const BS = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
const run = filter => { const R = G({ EV: ev(filter), M1: dummy('M1', { lv: '2' }), M2: dummy('M2', { lv: '3' }), O1: dummy('O1', { lv: '2' }), O2: dummy('O2', { lv: '4' }) }, ['EV', 'M1', 'M2', 'O1', 'O2'], ['EV', 'M1', 'M2', 'O1', 'O2'], BS); fillFile(R, 0, 6); fillFile(R, 1, 6);
  const s = R.turn, o = 1 - s, mine = [field(R, s, 'M1'), field(R, s, 'M2')], opp = [field(R, o, 'O1'), field(R, o, 'O2')]; U.play(R, s, hand(R, s, 'EV')); pump(R); const q = req(R); return { q, mine, opp, R, s }; };
{ const { q, mine, opp } = run({ lvMax: 7 }); ok(q && q.kind === 'pick' && q.sel.length === 2 && q.sel.every(id => mine.includes(id)), `상대 지정 없는 select → 아군만 선택 가능 (${q && JSON.stringify(q.sel)})`); }
{ const { q, mine, opp } = run({ lvMax: 7, own: 'opp' }); ok(q && q.sel.length === 2 && q.sel.every(id => opp.includes(id)), '[상대] 명시 → 상대 캐릭터만'); }
{ const { q, mine, opp } = run({ lvMax: 7, own: 'any' }); ok(q && q.sel.length === 4, '명시적으로 양쪽(any) → 4장 모두'); }
{ const R = G({ H: real('id_0808', { color: 'yellow' }) }, ['H'], ['H'], BS); const d = R.defs[R.cards[R.P[R.turn].hand[0] != null ? R.P[R.turn].hand[0] : 0].d] || null; const defs = Object.values(R.defs).find(x => x.n && x.ab && x.ab.length === 2 && x.ab[1].ic === 'declare');
  const ab = defs && defs.ab[1]; ok(ab && ab.cost.find(c => c.c === 'fieldBottom').filter.own === 'self' && ab.ops[0].filter.own === 'self', 'id_0808: 덱 아래로 옮기는 비용·선택 모두 아군(self)으로 컴파일'); }
{ const R = G({ H: real('id_0721', { color: 'black' }) }, ['H'], ['H'], BS); const defs = Object.values(R.defs).find(x => x.ab && x.ab.some(a => JSON.stringify(a).includes('"own":"any"'))); ok(!!defs, '“모든 캐릭터” 카드(id_0721)는 양쪽(any) 유지'); }
console.log(`own_default_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
