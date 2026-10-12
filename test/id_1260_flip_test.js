// v1.17.13 id_1260 【상대 턴 중】: 뒷면 증거가 2장 이상일 때만 뒤집을 수 있다 (뒷면 1장뿐/증거 1장뿐/0장이면 질문 없이 불가 → 기본 드로우 1장만)
const U = require('./mz_util'); const { G, real, dummy, field, give, req, auto, pump, evid, FX } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const kase = c => ({ p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3' } });
const HAY = [{ ic: 'onplay', cond: { nth: 1 }, ops: [], hay: true, txt: '【疾風】' }];
for (const [label, mk, flips, draws, ask] of [['증거 3장 중 뒷면 1장', (R, s) => { const ev = evid(R, s, 3, false); R.cards[ev[0]].up = true; R.cards[ev[1]].up = true; return ev }, 2, 1, null], ['증거 1장(뒷면)', (R, s) => evid(R, s, 1, false), 0, 1, null], ['증거 2장 모두 뒷면', (R, s) => evid(R, s, 2, false), 2, 2, /뒷면 증거 2장을/], ['증거 3장 모두 뒷면', (R, s) => evid(R, s, 3, false), 2, 2, /뒷면 증거 2장을/], ['증거 0장', () => [], 0, 1, null]]) {
  const R = G({ x: real('id_1260', { color: 'yellow' }), y: dummy('疾風', { color: 'yellow' }), d: dummy('덱', { color: 'yellow' }), d2: dummy('덱2', { color: 'yellow' }), d3: dummy('덱3', { color: 'yellow' }), d4: dummy('덱4', { color: 'yellow' }) }, ['x', 'y', 'd', 'd2', 'd3', 'd4'], ['d'], kase('yellow')); const o = R.turn, s = 1 - o;
  const x = give(R, s, 'x', 'field'); R.cards[x].st = 'a'; const y = field(R, s, 'y'); R.defs[R.cards[y].d].ab = HAY; const ev = mk(R, s); const dk = R.P[s].deck.length;
  FX.fireAlly(R, s, y, { by: 'effect' }); pump(R); const q = req(R); if (ask) ok(q && q.kind === 'yn' && ask.test(q.msg), `${label}: 질문 "${q && q.msg}"`); else ok(!q, `${label}: 질문 없이 사용 불가`); auto(R, { yn: true });
  ok(dk - R.P[s].deck.length === draws && ev.filter(i => R.cards[i].up).length === flips, `${label}: 뽑은 장수 ${dk - R.P[s].deck.length}=${draws}, 앞면 증거 ${ev.filter(i => R.cards[i].up).length}=${flips}`); }
console.log(`\nid_1260_flip_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
