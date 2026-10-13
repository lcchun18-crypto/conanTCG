// v1.17.18 id_0872 工藤有希子: 【宣言】 세트 2장 리무브 → 【白】 캐릭터 AP+2000 + 突撃[キャラ] (AP 가 안 오르던 버그), acts 에 기본 do 가 빠져도 보정
const U = require('./mz_util'); const { G, real, dummy, field, give, req, ans, pump, FX, DB } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const R = G({ x: real('id_0872', { color: 'white' }), w: dummy('백', { color: 'white', ap: '3000' }), r: dummy('적', { color: 'red', ap: '3000' }), d1: dummy('d1', { color: 'white' }), d2: dummy('d2', { color: 'white' }) }, ['x', 'w', 'd1', 'd2'], ['d1'], { p: { n: 'P', type: 'partner', color: 'white', lp: '1' }, k: { n: 'K', type: 'case', color: 'white', lv: '2', lv2: '3' } });
const s = R.turn; const x = field(R, s, 'x'), w = field(R, s, 'w'), r = field(R, s, 'r');
for (const k of ['d1', 'd2']) { const id = give(R, s, k, 'deck'); const d = R.P[s].deck; d.splice(d.indexOf(id), 1); (R.cards[x].fd = R.cards[x].fd || []).push(id); R.cards[id].fdOn = x; }
const i = R.defs[R.cards[x].d].ab.findIndex(a => a.ic === 'declare'); ok(!FX.declareCheck(R, s, x, i), '선언 가능(세트 2장)');
FX.declare(R, s, x, i); pump(R); const q = req(R); ok(q && q.kind === 'pick' && q.sel.includes(w) && !q.sel.includes(r), '【白】 캐릭터만 후보'); ans(R, [w]); pump(R);
ok(R.cards[w].apm === 2000, `AP+2000 적용 (apm=${R.cards[w].apm})`); ok((R.cards[w].tkw || '').includes('assault-char'), '突撃[キャラ] 부여'); ok((R.cards[x].fd || []).length === 0, '세트 2장 리무브(비용)');
// 엔진 보정: acts 에 기본 do 가 없어도 기본 효과를 포함
const c = FX.cleanAb([{ ic: 'declare', ops: [{ op: 'select', n: 1, filter: { own: 'any' }, do: 'ap', v: '2000', until: 'turn', acts: [{ do: 'kw', v: 'assault-char' }] }] }])[0].ops[0];
ok(c.acts.length === 2 && c.acts[0].do === 'ap' && c.acts[0].v === '2000' && c.acts[1].do === 'kw', 'cleanActs: 기본 do(ap) + acts(kw) 모두 유지');
const cards = DB(); let bad = 0; (function w_(o) { if (Array.isArray(o)) o.forEach(w_); else if (o && typeof o === 'object') { if (o.acts && o.acts.length && o.do && !o.acts.some(a => a.do === o.do)) bad++; Object.values(o).forEach(w_); } })(Object.values(cards).map(c => c.ab)); ok(bad === 0, 'DB 에 기본 do 가 빠진 acts 없음');
console.log(`\nid_0872_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
