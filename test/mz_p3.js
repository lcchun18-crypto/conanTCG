process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, pa, play, auto, ok, eq, has, FX, S, req, ans, fillFile, pump, act, toContact, endContact, give, top } = U;
const EV = (n, lv, color = 'blue', ab) => ({ n, type: 'event', color, lv: String(lv), ab: ab || [{ ic: 'event', ops: [{ op: 'draw', n: 1 }] }] });
const BS = c => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3' } });
const di = (R, id, ic = 'declare') => (R.defs[R.cards[id].d].ab || []).findIndex(a => a.ic === ic);
// 상대가 내 캐릭터를 대상으로 하는 효과(이벤트) 를 쓰게 하는 도구: 상대 손패에 sleep 이벤트
const OPPEV = ab => ({ n: 'OPP', type: 'event', color: 'blue', lv: '0', ab: [{ ic: 'event', ops: [ab] }] });
t('id_0033', '세트된 캐릭터가 상대 효과로 리무브되려 하면 이벤트를 리무브하고 현장에 남는다 / 내 효과엔 적용 안 됨', () => {
  const R = G({ e: real('id_0033', { type: 'event', lv: '0' }), v: dummy('V'), x: OPPEV({ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }) }, ['e'], ['x']); fillFile(R, 1, 9); fillFile(R, 0, 9);
  const s = R.turn, o = 1 - s; const v = field(R, s, 'v'); const e = give(R, s, 'e', 'rem'); R.P[s].rem = R.P[s].rem.filter(x => x !== e); R.cards[v].sets = [e]; R.cards[e].setOn = v;
  const x = hand(R, o, 'x'); R.turn = o; R.fl = {}; play(R, o, x); auto(R, { pref: [v] }); pump(R); ok(has(R, s, 'field', v), '현장에 남음'); ok(has(R, s, 'rem', e), '이벤트 리무브'); eq((R.cards[v].sets || []).length, 0, '세트 해제'); });
t('id_0213', '変装時: LP2 이상 【白】 과 교체하면 이 컨택트로 리무브되지 않음 (조건 불충족이면 리무브)', () => {
  const run = (lp, col) => { const R = G({ c: real('id_0213', { color: 'white', lv: '0' }), w: dummy('W', { color: col, lp: String(lp), ap: '1000' }), a: dummy('A', { ap: '9000' }) }, ['c'], ['c'], BS('white')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
    const a = field(R, o, 'a'); const w = field(R, s, 'w', 's'); const c = hand(R, s, 'c'); U.attack(R, a, w); U.finishContact(R, [{ s, m: { a: 'dis', id: c } }]); return { R, c, s }; };
  let r = run(2, 'white'); ok(has(r.R, r.s, 'field', r.c), 'LP2 白 → 리무브 안 됨'); r = run(1, 'white'); ok(!has(r.R, r.s, 'field', r.c), 'LP1 → 리무브됨'); r = run(2, 'red'); ok(!has(r.R, r.s, 'field', r.c), '白 아님 → 리무브됨'); });
t('id_0247', '変装時: 상대가 손패 1장 리무브하지 않으면 이 컨택트로 리무브되지 않음', () => {
  const run = pay => { const R = G({ c: real('id_0247', { lv: '0', color: 'black' }), w: dummy('W', { color: 'black' }), a: dummy('A', { ap: '9000', color: 'black' }), h: dummy('H', { color: 'black' }) }, ['c'], ['h'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
    const a = field(R, o, 'a'); const w = field(R, s, 'w', 's'); const c = hand(R, s, 'c'); const hh = hand(R, o, 'h'); U.attack(R, a, w); U.finishContact(R, [{ s, m: { a: 'dis', id: c } }], { pref: pay ? [hh] : [] }); return { R, c, s }; };
  let r = run(false); ok(has(r.R, r.s, 'field', r.c), '안 내면 보호'); r = run(true); ok(!has(r.R, r.s, 'field', r.c), '손패를 리무브하면 보호 안 됨'); });
t('id_0435', '京極真 컨택트: 手札 鈴木園子 리무브 시 그 캐릭터는 이 컨택트로 리무브되지 않음', () => {
  const run = pay => { const R = G({ c: real('id_0435'), kk: dummy('京極真', { ap: '1000' }), a: dummy('A', { ap: '9000' }), z: dummy('鈴木園子') }, ['c']); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
    field(R, s, 'c'); const k = field(R, s, 'kk', 's'); const a = field(R, o, 'a'); const z = hand(R, s, 'z'); U.attack(R, a, k); U.finishContact(R, [], { pref: pay ? [z] : [], yn: pay }); return { R, k, s, z }; };
  let r = run(true); ok(has(r.R, r.s, 'field', r.k), '보호됨'); ok(has(r.R, r.s, 'rem', r.z), '鈴木園子 리무브'); r = run(false); ok(!has(r.R, r.s, 'field', r.k), '안 내면 리무브됨'); });
t('id_0200', '服部平蔵: 상대 컷인 시 세트 카드 2장 리무브 → 컷인 AP 증가가 무효', () => {
  const run = pay => { const R = G({ c: real('id_0200'), x: dummy('X', { ap: '1000' }), y: dummy('Y', { ap: '500' }), cut: { n: 'CUT', type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', kw: 'cutin:3000', ab: [{ ic: 'cutin', v: 3000 }] }, s1: EV('S1', 0), s2: EV('S2', 0) }, ['c'], ['cut']); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
    field(R, s, 'c'); const x = field(R, s, 'x', 's'); const e1 = give(R, s, 's1', 'rem'), e2 = give(R, s, 's2', 'rem'); R.P[s].rem = R.P[s].rem.filter(z => z !== e1 && z !== e2); R.cards[x].sets = [e1, e2]; R.cards[e1].setOn = x; R.cards[e2].setOn = x;
    const y = field(R, o, 'y'); const cut = hand(R, o, 'cut'); U.attack(R, y, x); const before = FX.hasKwTk ? 0 : 0; U.finishContact(R, [{ s: o, m: { a: 'cin', id: cut } }], { yn: pay, pref: pay ? [e1, e2] : [] }); return { R, x, y, s, o, cut }; };
  let r = run(true); eq((r.R.cards[r.x].sets || []).length, 0, '세트 2장 리무브'); ok(has(r.R, r.s, 'field', r.x), '컷인 무효 → AP 500 < 1000 → 방어 성공'); r = run(false); ok(!has(r.R, r.s, 'field', r.x), '무효 안 하면 컷인 3000 으로 리무브'); });
const OPPSEL = (op = 'sleep') => OPPEV({ op: 'select', n: 1, filter: { own: 'opp' }, do: op });
const oppUse = (R, o, x, v) => { R.turn = o; R.fl = {}; play(R, o, x); auto(R, { pref: [v], yn: false }); pump(R); };
t('id_0230', '변성기: 세트된 캐릭터가 상대 효과로 선택되면(ターン1) 무효 — 두 번째는 유효', () => {
  const R = G({ e: real('id_0230', { type: 'event', lv: '0' }), v: dummy('V'), x: OPPSEL(), y: OPPSEL() }, ['e'], ['x', 'y']); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const v = field(R, s, 'v'); const e = give(R, s, 'e', 'rem'); R.P[s].rem = R.P[s].rem.filter(z => z !== e); R.cards[v].sets = [e]; R.cards[e].setOn = v; const x = hand(R, o, 'x'); const y = hand(R, o, 'y');
  oppUse(R, o, x, v); eq(R.cards[v].st, 'a', '첫 선택은 무효 → 슬립 안 됨'); R.fl = {}; R.cards[x] && 0; play2(R, o, y, v); eq(R.cards[v].st, 's', '(ターン1) 두 번째는 유효'); });
function play2(R, o, y, v) { R.turn = o; R.fl = {}; R.fl.played = 0; play(R, o, y); auto(R, { pref: [v], yn: false }); pump(R); }
t('id_0408', '絆毛利蘭 상대 턴: 毛利蘭 선택 시 상대가 손패 1장 리무브(하면 유효 / 안 하면 무효)', () => {
  const run = pay => { const R = G({ c: real('id_0408'), r: dummy('毛利蘭'), b: dummy('B'), x: OPPSEL(), h: dummy('H') }, ['c'], ['x', 'h']); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; field(R, s, 'c'); const r = field(R, s, 'r');
    const x = hand(R, o, 'x'); const h = hand(R, o, 'h'); R.turn = o; R.fl = {}; play(R, o, x); auto(R, { pref: pay ? [r, h] : [r], yn: pay }); pump(R); return { R, r }; };
  let q = run(true); eq(q.R.cards[q.r].st, 's', '손패를 리무브하면 효과 유효'); q = run(false); eq(q.R.cards[q.r].st, 'a', '안 하면 무효'); });
t('id_0917', '広田雅美: 다른 캐릭터가 선택되면 상대가 손패 리무브(안 하면 무효), 【黒】 이외 색 캐릭터가 있을 때만', () => {
  const run = (pay, col) => { const R = G({ c: real('id_0917', { color: 'black' }), v: dummy('V', { color: col }), x: OPPSEL(), h: dummy('H') }, ['c'], ['x', 'h']); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; field(R, s, 'c'); const v = field(R, s, 'v');
    const x = hand(R, o, 'x'); const h = hand(R, o, 'h'); R.turn = o; R.fl = {}; play(R, o, x); auto(R, { pref: pay ? [v, h] : [v], yn: pay }); pump(R); return { R, v }; };
  let q = run(false, 'blue'); eq(q.R.cards[q.v].st, 'a', '【黒】 이외 캐릭터 있음 + 안 냄 → 무효'); q = run(true, 'blue'); eq(q.R.cards[q.v].st, 's', '냄 → 유효'); q = run(false, 'black'); eq(q.R.cards[q.v].st, 's', '【黒】 이외 색 캐릭터가 없으면 발동 안 함 → 유효'); });
t('id_0070', '榎本梓: 파트너(黄) 일 때 액션/가드 불가·지정 불가 + 登場時 Lv7 이하 슬립, 오토 페이즈에 액티브 안 됨', () => {
  const R = G({ c: real('id_0070', { color: 'yellow' }), v: dummy('V', { lv: '7' }), w: dummy('W', { lv: '8' }) }, ['c'], ['c'], BS('yellow')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const v = field(R, o, 'v'), w = field(R, o, 'w'); const c = hand(R, s, 'c'); play(R, s, c); const q = req(R); ok(q.sel.includes(v) && !q.sel.includes(w), 'Lv7 이하만'); ans(R, [v]); eq(R.cards[v].st, 's', '슬립');
  ok(FX.hasKwTk(R, c, 'cantact') && FX.hasKwTk(R, c, 'cantguard') && FX.hasKwTk(R, c, 'noact'), '액션/가드 불가 + 지정 불가');
  U.endTurn(R); pump(R); eq(R.turn, o, '상대 턴'); eq(R.cards[v].st, 's', '오토 페이즈에 액티브가 되지 않음'); eq(R.cards[w].st, 'a', '다른 캐릭터는 액티브');
  R.cards[c].st = 's'; const tm = R.P[s].field.indexOf(c); R.P[s].field.splice(tm, 1); U.endTurn(R); U.endTurn(R); eq(R.cards[v].st, 'a', '이 캐릭터가 현장을 떠나면 다음 오토 페이즈에 액티브'); });
t('id_0217', 'トランプ銃: 상대 턴, 세트가 리무브 에리어에 놓이면 怪盗 캐릭터에 다시 세트(ターン1)', () => {
  const R = G({ e: real('id_0217', { type: 'event', lv: '0' }), v: dummy('V'), t: dummy('怪盗X', { trait: '怪盗' }), x: OPPSEL('remove') }, ['e'], ['x']); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const v = field(R, s, 'v'), th = field(R, s, 't'); const e = give(R, s, 'e', 'rem'); R.P[s].rem = R.P[s].rem.filter(z => z !== e); R.cards[v].sets = [e]; R.cards[e].setOn = v; const x = hand(R, o, 'x');
  R.turn = o; R.fl = {}; play(R, o, x); auto(R, { pref: [v], yn: true }); pump(R); ok(!has(R, s, 'field', v), 'V 리무브'); ok(R.cards[th].sets && R.cards[th].sets.includes(e), '怪盗 캐릭터에 세트됨'); ok(!has(R, s, 'rem', e), '리무브 에리어에 남지 않음'); });
t('id_0545', 'オレのそばから離れんなや: 세트된 캐릭터는 상대 효과로 리무브/슬립/스턴되지 않음, 내 효과는 가능', () => {
  const R = G({ e: real('id_0545', { type: 'event', lv: '0' }), v: dummy('V'), x: OPPSEL('remove'), y: OPPSEL('sleep'), z: OPPSEL('stun') }, ['e'], ['x', 'y', 'z']); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const v = field(R, s, 'v'); const e = give(R, s, 'e', 'rem'); R.P[s].rem = R.P[s].rem.filter(z => z !== e); R.cards[v].sets = [e]; R.cards[e].setOn = v;
  for (const k of ['x', 'y', 'z']) { const c = hand(R, o, k); R.turn = o; R.fl = {}; play(R, o, c); auto(R, { pref: [v], yn: false }); pump(R); } ok(has(R, s, 'field', v), '리무브 안 됨'); eq(R.cards[v].st, 'a', '슬립/스턴 안 됨'); });
t('id_0892', '広田正巳: 상대 효과/컨택트로 떠날 때 뒷면 세트 카드는 리무브 대신 손패로', () => {
  const R = G({ c: real('id_0892'), x: OPPSEL('remove'), f1: dummy('F1') }, ['c'], ['x']); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const f1 = give(R, s, 'f1', 'deck'); R.P[s].deck = R.P[s].deck.filter(z => z !== f1); R.cards[c].fd = [f1]; R.cards[f1].fdOn = c;
  const x = hand(R, o, 'x'); R.turn = o; R.fl = {}; play(R, o, x); auto(R, { pref: [c] }); pump(R); ok(!has(R, s, 'field', c), '리무브됨'); ok(has(R, s, 'hand', f1), '뒷면 세트 카드가 손패로'); ok(!has(R, s, 'rem', f1), '리무브 에리어에 없음'); });
module.exports = {}; if (require.main === module) U.runAll('mz_p3');
