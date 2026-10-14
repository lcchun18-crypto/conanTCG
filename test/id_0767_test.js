// v1.17.22 id_0767 紅子の執事: 「카드명 小泉紅子 또는 특징 赤魔術 의 이벤트」 — AND 로 걸려 어떤 카드도 못 찾던 버그 (OR: reveal.alt)
const U = require('./mz_util'); const { G, real, dummy, give, req, ans, pump, FX, DB } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
// 덱을 원하는 순서(위 → 아래)로 직접 구성
const run = (order) => { const defs = { x: real('id_0767', { color: 'white' }), ev: real('id_0784', { color: 'white' }), ak: dummy('小泉紅子', { color: 'white', type: 'char', ap: '3000' }), oth: dummy('다른이벤트', { color: 'white', type: 'event', trait: '青魔術' }), ch: dummy('캐릭터', { color: 'white', ap: '2000', trait: '赤魔術' }), d1: dummy('d1', { color: 'white' }) };
  const R = G(defs, ['x', 'd1', 'ev', 'ak', 'oth', 'ch'], ['d1']); const s = R.turn, P = R.P[s]; const all = [...P.deck, ...P.hand, ...P.file, ...P.rem]; const byN = n => all.find(i => R.defs[R.cards[i].d].n === n);
  const x = P.hand.includes(byN('紅子の執事')) ? byN('紅子の執事') : byN('紅子の執事'); for (const z of ['deck', 'hand', 'file', 'rem']) P[z] = P[z].filter(i => i !== x);
  const ids = order.map(n => byN(n)); for (const z of ['deck', 'hand', 'file', 'rem']) P[z] = P[z].filter(i => !ids.includes(i));
  P.deck.push(...ids.slice().reverse()); P.hand.push(x); P.hand.push(P.deck.shift()); return { R, s, P, x, ids }; };
const play = (R, s, x) => { console.log('  deck(top→):', R.P[s].deck.slice().reverse().slice(0,6).map(i => R.defs[R.cards[i].d].n).join(','));  R.P[s].hand = R.P[s].hand.concat([]); FX.fire(R, 'onplay', x, { by: 'hand' }); pump(R); for (let g = 0; g < 8; g++) { const q = req(R); if (!q) break; console.log('  req:', q.kind, (q.msg || '').slice(0, 40)); ans(R, q.kind === 'pick' ? [q.sel[0]] : q.kind === 'yn' ? true : undefined); pump(R); } console.log('  hand:', R.P[s].hand.map(i => R.defs[R.cards[i].d].n).join(','), '| log:', R.log.slice(-2).join(' / ')); };
// 1) 위에서부터 [다른이벤트, 캐릭터(赤魔術), 紅の盟約(이벤트·赤魔術)] → 紅の盟約 발견
{ const { R, s, P, x, ids } = run(['다른이벤트', '캐릭터', '紅の盟約']); P.field.push(x); R.cards[x].st = 'a'; const before = P.hand.length; play(R, s, x); const q = req(R);
  ok(P.hand.some(i => R.defs[R.cards[i].d].n === '紅の盟約'), '1 특징[赤魔術] 이벤트(紅の盟約)를 찾아 손패에 넣음'); ok(!P.hand.some(i => ['다른이벤트', '캐릭터'].includes(R.defs[R.cards[i].d].n)), '1 특징이 다른 이벤트/이벤트가 아닌 카드는 손패로 가지 않음'); }
// 2) 카드명 小泉紅子 (캐릭터)도 적중
{ const { R, s, P, x } = run(['다른이벤트', '小泉紅子', '紅の盟約']); P.field.push(x); R.cards[x].st = 'a'; play(R, s, x); ok(P.hand.some(i => R.defs[R.cards[i].d].n === '小泉紅子') && !P.hand.some(i => R.defs[R.cards[i].d].n === '紅の盟約'), '2 카드명 小泉紅子 에서 멈춤(그 뒤 카드는 안 가져옴)'); }
const c = DB()['id_0767'].ab[0].ops[0]; ok(c.alt && c.alt.length === 1 && c.alt[0].type === 'event' && c.alt[0].trait === '赤魔術' && c.filter.name === '小泉紅子' && !c.filter.type, '4 cards.json: 이름 OR (이벤트 AND 특징) 로 정의됨');
console.log(`\nid_0767_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
