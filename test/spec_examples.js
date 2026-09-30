// import_cards.py 프롬프트(SPEC)의 예시 8개가 엔진에서 그대로 유효한지 검증
const { S, game, give, ok, eq, act } = require('./helpers');
const ch = (n, extra = {}) => ({ n, type: 'char', color: 'red', lv: '0', ap: '3000', lp: '1', ...extra });
const EX = {
  1: { ic: 'onplay', ops: [{ op: 'look', n: 3, max: 1, then: 'hand', rest: 'bottom' }, { op: 'if', c: 'done', ops: [{ op: 'discard', n: 1 }] }] },
  2: { ic: 'flash', ops: [{ op: 'draw', n: 1 }] },
  3: { ic: 'cutin', v: 2000 },
  4: { ic: 'onact', on: { k: 'char' }, cond: { turn: 'self' }, lim: 1, ops: [{ op: 'self', do: 'ap', v: '2000' }] },
  5: { ic: 'declare', lim: 1, cost: [{ c: 'discard', n: 1 }], ops: [{ op: 'select', n: 1, do: 'sleep', filter: {} }] },
  6: { ic: 'onplay', ops: [{ op: 'select', n: 1, do: 'remove', filter: { apMax: 3000 } }, { op: 'if', c: 'done', ops: [{ op: 'draw', n: 1 }] }] },
  7: { ic: 'manual', cond: { cstate: 'solve' }, txt: '自分の裏向きの証拠を1つまで選び、表向きにする' },
  8: { ic: 'onplay', ops: [{ op: 'play', n: 1, from: 'hand', filter: { lvMax: 2, trait: '少年探偵団' }, asleep: true }] } };
for (const [k, a] of Object.entries(EX)) { const R = game({ a: ch('A', { ab: [a] }) }, ['a']); const ab = R.defs[R.cards[R.P[0].deck[0]].d.replace(/:.*/, '') + ':a'].ab[0];
  const json = JSON.stringify(ab); if (k != 7) ok(!json.includes('"manual"'), `예시 ${k}가 manual 로 강등됨`); else ok(ab.ic === 'manual' && ab.ops[0].op === 'manual', '예시 7'); eq(ab.ic, a.ic, `예시 ${k} ic`); }
// 동작 확인
{ const R = game({ a: ch('A', { ab: [EX[6]] }), v: ch('V', { ap: '1000' }) }); const s = R.turn; const v = give(R, 1 - s, 'v', 'field'); const id = give(R, s, 'a'); const h = R.P[s].hand.length; act(R, s, { a: 'play', id }); ok(R.eff.req.sel.includes(v), 'target'); act(R, s, { a: 'ans', v: [v] }); ok(R.P[1 - s].rem.includes(v), 'removed'); eq(R.P[s].hand.length, h - 1 + 1, 'drew after remove'); }
{ const R = game({ a: ch('A', { ab: [EX[8]] }), b: ch('B', { lv: '0', trait: '少年探偵団' }), c: ch('C', { lv: '0', trait: '高校生' }) }); const s = R.turn; const b = give(R, s, 'b'), c = give(R, s, 'c'), id = give(R, s, 'a'); act(R, s, { a: 'play', id });
  ok(R.eff.req.sel.includes(b) && !R.eff.req.sel.includes(c), '특징 필터(少年探偵団만)'); act(R, s, { a: 'ans', v: [b] }); eq(R.cards[b].st, 's', 'asleep'); ok(R.P[s].field.includes(b), 'on field'); }
{ const R = game({ a: ch('A', { ab: [EX[4]] }), v: ch('V', { ap: '1000' }) }); const s = R.turn; const a = give(R, s, 'a', 'field'); R.cards[a].sum = 0; const v = give(R, 1 - s, 'v', 'field'); R.cards[v].st = 's';
  act(R, s, { a: 'action', id: a, k: 'char', tid: v }); act(R, 1 - s, { a: 'guard', id: null }); eq(S.ap(R, a), 5000, 'onact AP+2000 (until turn end)'); act(R, s, { a: 'end' }); }
console.log('SPEC 예시 8개 검증 통과');
