// v1.7.2: id_0884 「手札から FBI キャラをリムーブ: 1ドロー、そのコストでレベル8以上をリムーブしたらさらに1ドロー」 — 손패 리무브(discard 코스트)도 costHas 로 인식
const U = require('./mz_util'); const { G, real, dummy, field, hand, fillFile, pump, FX, ok, eq, auto, S } = U;
const BS = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } };
const run = lv => { const R = G({ c: real('id_0884', { color: 'red' }), f: dummy('FBIC', { color: 'red', lv: String(lv), trait: 'FBI' }) }, ['c', 'f', 'f'], ['c'], BS); fillFile(R, 0, 9); const s = R.turn;
  const c = field(R, s, 'c'), f = hand(R, s, 'f'), h0 = R.P[s].hand.length; const idx = R.defs[R.cards[c].d].ab.findIndex((a, i) => a.ic === 'declare' && a.pa);
  const e = FX.declare(R, s, c, idx); if (e) throw new Error(e); pump(R); auto(R, { pref: [f] }); pump(R); return R.P[s].hand.length - h0; };
// 손패 1장을 리무브(-1) 하고 드로우: 레벨 5 → +1 (순 0), 레벨 8 이상 → +2 (순 +1)
eq(run(5), 0, '레벨 5 FBI 리무브 → 1장 드로우 (손패 순증 0)');
eq(run(8), 1, '레벨 8 FBI 리무브 → 2장 드로우 (손패 순증 +1)');
eq(run(9), 1, '레벨 9 FBI 리무브 → 2장 드로우');
console.log('costHas 테스트 통과 (id_0884)');
