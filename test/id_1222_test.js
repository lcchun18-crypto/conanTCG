// v1.17.8 id_1222 赤井秀一 (신규 카드): 突撃[キャラ] / 【自分ターン中】【登場時】【発動時】상대 캐릭터 레벨-1 / 【起殺】【事件(赤)】【FILE6】(변장과 같은 교체)
const U = require('./mz_util'); const { G, real, dummy, field, hand, req, FX, S } = U; const H = require('./helpers'); const { act } = H;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const card = real('id_1222', { color: 'red' });
ok(card.n === '赤井秀一' && card.lv === '6' && card.ap === '6000' && /assault-char/.test(card.kw), '카드 데이터: 赤井秀一 Lv6 AP6000 突撃[キャラ]');
ok(card.ab.some(a => a.ic === 'onplay' && a.cond && a.cond.turn === 'self') && card.ab.some(a => a.ic === 'ondisguise' && a.cond && a.cond.turn === 'self') && card.ab.some(a => a.ic === 'disguise' && a.cond.ccolor === 'red' && a.cond.fileMin === 6), '능력 3종(登場時/発動時/起殺) 구조화됨 (manual 없음)');
ok(!card.ab.some(a => a.ic === 'manual'), 'manual 능력 없음');
const BS = c => ({ p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3' } });
const fillFile = (R, s, n) => { const P = R.P[s]; while (P.file.length < n) { const i = P.deck.findIndex(id => /^f\d*$|filler/.test(U.keyOf ? U.keyOf(R, id) : '') || true); P.file.push(P.deck.splice(i, 1)[0]); } };
// 1) 내 턴에 등장 → 상대 캐릭터 Lv-1
{ const R = G({ x: card, v: dummy('상대', { color: 'red', lv: '3' }), a: dummy('아군', { color: 'red' }) }, ['x', 'a'], ['v'], BS('red')); const s = R.turn, o = 1 - s; const v = field(R, o, 'v'); const x = H.give(R, s, 'x', 'hand');
  fillFile(R, s, 6); const lv0 = FX.lvOf(R, v); const e = act(R, s, { a: 'play', id: x }); ok(!e, '登場: 사용 가능 ' + (e || '')); FX.pump(R); let q = req(R); ok(q && q.kind === 'pick' && q.sel.includes(v), '登場時: 상대 캐릭터 선택 질의'); if (q) U.ans(R, [v]); FX.pump(R);
  ok(FX.lvOf(R, v) === lv0 - 1, `상대 캐릭터 Lv ${lv0}→${FX.lvOf(R, v)} (-1)`); }
// 2) 起殺 조건: 사건 赤 + FILE 6
const run = (kc, file, defTurn) => { const R = G({ x: card, a: dummy('공격', { color: 'red', ap: '5000' }), d: dummy('방어', { color: 'red', ap: '1000' }), v: dummy('상대', { color: 'red', lv: '3' }) }, ['a', 'v'], ['d', 'x'], BS(kc)); const s = R.turn, o = 1 - s;
  const atk = field(R, s, 'a'); const d = field(R, o, 'd', 's'); const x = H.give(R, o, 'x', 'hand'); fillFile(R, o, file); R.cards[atk].sum = 0; R.cards[atk].st = 'a';
  let e = act(R, s, { a: 'action', id: atk, k: 'char', tid: d }); if (e) throw new Error('action: ' + e); act(R, o, { a: 'guard', id: null }); if (R.sub.who === s) act(R, s, { a: 'pass' });
  return { R, s, o, x, d, atk, e: act(R, o, { a: 'dis', id: x }) }; };
let r = run('red', 5); ok(r.e && /변장 조건/.test(r.e), 'FILE 5장: 起殺 불가 (' + r.e + ')');
r = run('blue', 6); ok(r.e && /변장 조건/.test(r.e), '사건이 赤이 아니면 불가 (' + r.e + ')');
r = run('red', 6); ok(!r.e, '사건 赤 + FILE 6: 起殺 가능 ' + (r.e || '')); FX.pump(r.R);
ok(r.R.P[r.o].field.includes(r.x), '赤井秀一이 현장에 (교체)'); const deck = r.R.P[r.o].deck; ok(deck[deck.length - 1] === r.d || deck.includes(r.d), '교체된 캐릭터는 덱 아래로');
ok(!req(r.R) || !(req(r.R).sel || []).length, '상대 턴에 교체되었으므로 [自分ターン中] 発動時 효과는 발동하지 않음');
console.log(`\nid_1222_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
