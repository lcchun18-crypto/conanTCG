// v1.8.4: [상대] 지정이 없는 대상은 아군만 (기본 own = self). 명시(opp / any)는 그대로.
// v1.11.0: (fallback) 끝까지 확정 못한 미지정 target 은 제한 없이(양쪽) 처리 + 경고. 이 기본값은 '굵은 조건/코스트'에만 룰로 적용된다. 실제 효과 target 은 데이터의 own 이 정하며(미지정=마이그레이션 잔여), remove 같은 op 이름 예외는 없다 — 자세한 문맥별 검증은 test/ownership_contexts_test.js.
delete process.env.CONAN_DEFAULT_OWN;
const U = require('./mz_util'); const { G, real, dummy, field, hand, fillFile, pump, req, FX, S } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const ev = filter => ({ n: 'EV', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, do: 'remove', filter }] }] });
const BS = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
const run = filter => { const R = G({ EV: ev(filter), M1: dummy('M1', { lv: '2' }), M2: dummy('M2', { lv: '3' }), O1: dummy('O1', { lv: '2' }), O2: dummy('O2', { lv: '4' }) }, ['EV', 'M1', 'M2', 'O1', 'O2'], ['EV', 'M1', 'M2', 'O1', 'O2'], BS); fillFile(R, 0, 6); fillFile(R, 1, 6);
  const s = R.turn, o = 1 - s, mine = [field(R, s, 'M1'), field(R, s, 'M2')], opp = [field(R, o, 'O1'), field(R, o, 'O2')]; U.play(R, s, hand(R, s, 'EV')); pump(R); const q = req(R); return { q, mine, opp, R, s }; };
{ const { q, mine, opp } = run({ lvMax: 7 }); ok(q && q.kind === 'pick' && q.sel.length === 4 && mine.every(id => q.sel.includes(id)) && opp.every(id => q.sel.includes(id)), `v1.11.0: 끝까지 확정 못한 미지정 target 은 플레이를 막지 않음(제한 없음, 양쪽) + 검증에 잡힘 — op 이름(remove)으로 추측하지 않음 (${q && JSON.stringify(q.sel)})`); }
{ const ev2 = f => ({ n: 'EV2', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, do: 'sleep', filter: f }] }] }); const R = G({ EV: ev2({ lvMax: 7 }), M1: dummy('M1', { lv: '2' }), O1: dummy('O1', { lv: '2' }) }, ['EV', 'M1', 'O1'], ['EV', 'M1', 'O1'], BS); fillFile(R, 0, 6); fillFile(R, 1, 6); const s = R.turn; const m = field(R, s, 'M1'); field(R, 1 - s, 'O1'); U.play(R, s, hand(R, s, 'EV')); pump(R); const q = req(R); ok(q && q.sel.length === 2 && q.sel.includes(m), '미지정은 효과 종류(sleep)와 무관하게 remove 와 같은 fallback(제한 없음)'); }
{ const { q, mine, opp } = run({ lvMax: 7, own: 'opp' }); ok(q && q.sel.length === 2 && q.sel.every(id => opp.includes(id)), '[상대] 명시 → 상대 캐릭터만'); }
{ const { q, mine, opp } = run({ lvMax: 7, own: 'any' }); ok(q && q.sel.length === 4, '명시적으로 양쪽(any) → 4장 모두'); }
{ const R = G({ H: real('id_0808', { color: 'yellow' }) }, ['H'], ['H'], BS); const d = R.defs[R.cards[R.P[R.turn].hand[0] != null ? R.P[R.turn].hand[0] : 0].d] || null; const defs = Object.values(R.defs).find(x => x.n && x.ab && x.ab.length === 2 && x.ab[1].ic === 'declare');
  const ab = defs && defs.ab[1]; ok(ab && ab.cost.find(c => c.c === 'fieldBottom').filter.own === 'self' && ab.ops[0].filter.own === 'any', 'id_0808: 덱 아래 비용은 아군(self), 리무브 대상은 양쪽(any)'); }
{ const R = G({ H: real('id_0721', { color: 'black' }) }, ['H'], ['H'], BS); const defs = Object.values(R.defs).find(x => x.ab && x.ab.some(a => JSON.stringify(a).includes('"own":"any"'))); ok(!!defs, '“모든 캐릭터” 카드(id_0721)는 양쪽(any) 유지'); }
console.log(`own_default_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
