// v1.17.26 덱 3장 + "덱 위 4장 확인 → 남은 카드 리무브": 리프레시는 3장이 모두 리무브 에리어로 간 뒤에 일어나야 한다(마지막 1장이 리무브에 남던 버그)
const U = require('./mz_util'); const { G, real, dummy, field, give, req, ans, pump, FX } = U; const S = require('../server.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const ab = JSON.parse(JSON.stringify(require('../data/cards.json').cards['id_0747'].ab[1].ops));
const mk = (deckN, remN) => { const defs = { x: dummy('효과캐릭', { color: 'blue', ab: [{ ic: 'onplay', ops: ab }] }), ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['f' + i, dummy('f' + i, { color: 'blue' })])) };
  const R = G(defs, ['x', ...Array.from({ length: 12 }, (_, i) => 'f' + i)], ['f0']); const s = R.turn, P = R.P[s], o = 1 - s; const x = field(R, s, 'x');
  const all = [...P.deck, ...P.hand, ...P.file, ...P.rem].filter(i => i !== x); P.deck = []; P.hand = []; P.file = []; P.rem = []; const nn = R.P[o]; 
  P.deck.push(...all.slice(0, deckN)); P.rem.push(...all.slice(deckN, deckN + remN)); P.evid = []; R.P[o].evid = []; return { R, s, o, P, x, total: deckN + remN }; };
const run = ({ R, s, x }) => { FX.fire(R, 'onplay', x, { by: 'hand' }); pump(R); for (let g = 0; g < 10; g++) { const q = req(R); if (!q) break; ans(R, q.kind === 'yn' ? true : q.kind === 'pick' ? q.sel.slice(0, q.min) : undefined); pump(R); } };
// 1) 덱 3장 / 리무브 2장: 3장이 리무브로 간 뒤 리프레시 → 리무브 0장, 덱 = 나머지, 상대 증거 +1
{ const t = mk(3, 2); const before = t.P.deck.length + t.P.rem.length; run(t); const P = t.P;
  ok(P.rem.length === 0, `1 리프레시 후 리무브 에리어가 비어 있음 (rem ${P.rem.length}장)`); ok(P.deck.length + P.hand.length + P.rem.length === before, `1 내 카드 총수 보존 (덱 ${P.deck.length} 손패 ${P.hand.length} 리무브 ${P.rem.length}; 상대 증거는 상대 덱에서)`); ok(t.R.P[t.o].evid.length === 1, '1 리프레시로 상대가 증거 1장 획득'); }
// 2) 리무브 0장(덱 3장만): 3장 이동 후 리무브 3장 → 리프레시
{ const t = mk(3, 0); run(t); ok(t.R.phase === 'play' && t.P.rem.length === 0, `2 리무브가 비어 있었어도 이동 후 3장으로 리프레시 (rem ${t.P.rem.length}, 게임 ${t.R.phase})`); }
console.log(`\nrefresh_after_mv_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
