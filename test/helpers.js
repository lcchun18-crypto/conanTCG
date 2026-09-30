const S = require('../server.js');
const base = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } };
// defs: {key:{...card}}, decks: [list0, list1] (키 배열, 40장 미만이면 c0로 채움)
function game(defs, l0 = [], l1 = l0) {
  const R = S.mkR('T'); const d = { ...base, ...defs, filler: { n: 'F', type: 'char', color: 'red', lv: '0', ap: '1000', lp: '1' } };
  [l0, l1].forEach((l, s) => { const list = []; l.forEach(k => list.push(k)); Object.keys(defs).forEach(k => { if (!list.includes(k) && !['p', 'k'].includes(k)) list.push(k); }); let i = 0;
    while (list.length < 40) { const k = 'filler'; const cnt = list.filter(x => x === k).length; if (cnt >= 3) { const kk = 'f' + (i++); d[kk] = { ...d.filler, n: kk }; list.push(kk); } else list.push(k); }
    const e = S.ready(R, s, { defs: d, list, partner: 'p', kase: 'k' }); if (e) throw new Error(e); });
  for (let i = 0; i < 2; i++) S.act(R, R.mullSeat, { a: 'mull', ids: [] });
  if (R.phase !== 'play') throw new Error('not play ' + R.phase); return R; }
const key = (R, id) => R.defs[R.cards[id].d] && R.cards[id].d.split(':')[1];
const find = (R, s, k, zone = 'deck') => R.P[s][zone].find(id => key(R, id) === k);
function give(R, s, k, zone = 'hand') { for (const z of ['deck', 'hand', 'file', 'evid', 'rem', 'field']) { const i = R.P[s][z].findIndex(id => key(R, id) === k); if (i >= 0) { const id = R.P[s][z].splice(i, 1)[0]; R.P[s][zone].push(id); return id; } } throw new Error('no ' + k); }
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`FAIL: ${m} (got ${a}, want ${b})`); };
const act = (R, s, m) => S.act(R, s, m);
const fill = (R, s, n) => { while (R.P[s].file.length < n) R.P[s].file.push(R.P[s].deck.pop()); };
module.exports = { S, game, key, find, give, ok, eq, act, fill };
