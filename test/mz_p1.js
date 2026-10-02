process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, give, play, auto, ok, eq, has, S, FX, act, req, ans, fillFile, top, evid, rem, pump, endTurn } = U;
const sol = R => { U.solve(R, R.turn); };
const prep = (R, s) => { fillFile(R, s, 8); return R.turn; };
t('id_0067', 'パートナー(赤) 이벤트: 상대 손패 랜덤1장 리무브 + 대상에 バレット', () => {
  const R = G({ e: real('id_0067', { type: 'event', color: 'red', lv: '0' }), v: dummy('V'), h: dummy('H') }, ['e'], ['h'], { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } });
  const s = R.turn, o = 1 - s; const e = hand(R, s, 'e'); const v = field(R, s, 'v'); const n0 = R.P[o].hand.length, r0 = R.P[o].rem.length; play(R, s, e); auto(R, { pref: [v] });
  eq(R.P[o].hand.length, n0 - 1, '상대 손패 -1'); eq(R.P[o].rem.length, r0 + 1, '상대 리무브 +1'); ok(FX.hasKwTk(R, v, 'bullet'), 'バレット'); });
t('id_0262', '解決編 登場時: 손패 1장 리무브 → LP0 毛利蘭 액티브 (LP1 이상은 대상 아님)', () => {
  const R = G({ c: real('id_0262'), r0: dummy('毛利蘭', { lp: '0' }), r1: dummy('毛利蘭', { lp: '2' }), h: dummy('H') }, ['c']); const s = R.turn; fillFile(R, s, 8); sol(R);
  const c = hand(R, s, 'c'); const a = field(R, s, 'r0', 's'), b = field(R, s, 'r1', 's'); const hh = hand(R, s, 'h'); play(R, s, c);
  const q = req(R); ok(q.kind === 'pick', '질의'); auto(R, { pref: [hh, a] }); eq(R.cards[a].st, 'a', 'LP0 毛利蘭 액티브'); eq(R.cards[b].st, 's', 'LP2 는 그대로'); });
t('id_0320', '登場時: 상대에게 증거 1장 → 레벨7 이하 리무브', () => {
  const R = G({ c: real('id_0320'), t: dummy('T', { lv: '7' }), big: dummy('B', { lv: '8' }) }, ['c']); const s = R.turn, o = 1 - s; fillFile(R, s, 8); const c = hand(R, s, 'c');
  const tt = field(R, o, 't'), bb = field(R, o, 'big'); const e0 = R.P[o].evid.length; play(R, s, c);
  const q = req(R); ok(q.kind === 'yn', '증거를 줄지 질의'); ans(R, true); const q2 = req(R); ok(q2.sel.includes(tt) && !q2.sel.includes(bb), '레벨8 은 대상 아님'); ans(R, [tt]);
  eq(R.P[o].evid.length, e0 + 1, '상대 증거 +1'); ok(!has(R, o, 'field', tt), '리무브'); });
t('id_0220', '宣言: 자신의 레벨7 이하 【赤】 캐릭터에 バレット / 突撃[事件] 선택', () => {
  const R = G({ c: real('id_0220', { color: 'blue' }), a: dummy('A', { color: 'red', lv: '7' }), b: dummy('B', { color: 'red', lv: '8' }), z: dummy('Z', { color: 'blue' }) }, ['c']); const s = R.turn;
  const c = field(R, s, 'c'); const a = field(R, s, 'a'), b = field(R, s, 'b'), z = field(R, s, 'z');
  const di = (R.defs[R.cards[c].d].ab || []).findIndex(a => a.ic === 'declare'); eq(FX.declare(R, s, c, di), undefined, '선언'); pump(R); const q = req(R); eq(q.kind, 'opt', '선택'); ans(R, 1); const q2 = req(R); ok(q2.sel.includes(a) && !q2.sel.includes(b) && !q2.sel.includes(z), '합법 대상만'); ans(R, [a]);
  ok(FX.hasKwTk(R, a, 'assault-case'), '突撃[事件]'); eq(R.cards[c].st, 's', '스리프 코스트'); ok(!FX.hasKwTk(R, a, 'bullet'), 'バレット 아님'); });
t('id_0244', '「オトリはなしだ」: 상대 스턴 1장당 드로우 / 0장이면 스턴', () => {
  const mk = n => { const R = G({ e: real('id_0244', { type: 'event', lv: '0' }), x: dummy('X'), y: dummy('Y') }, ['e']); const s = R.turn, o = 1 - s; const e = hand(R, s, 'e'); for (let i = 0; i < n; i++) field(R, o, i ? 'y' : 'x', 'x'); return { R, s, o, e }; };
  U.B; const base = { p: { n: 'P', type: 'partner', color: 'yellow', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
  const run = n => { const R = G({ e: real('id_0244', { type: 'event', lv: '0' }), x: dummy('X'), y: dummy('Y'), w: dummy('W') }, ['e'], ['x', 'y', 'w'], base); const s = R.turn, o = 1 - s; const e = hand(R, s, 'e'); const w = field(R, o, 'w', 's'); for (let i = 0; i < n; i++) field(R, o, i ? 'y' : 'x', 'x'); const h0 = R.P[s].hand.length; play(R, s, e); return { R, s, o, w, h0 }; };
  let r = run(2); eq(r.R.P[r.s].hand.length, r.h0 - 1 + 2, '스턴 2장 → 2장 드로우'); ok(!r.R.eff, '추가 질의 없음');
  r = run(0); ok(req(r.R) && req(r.R).sel.includes(r.w), '0장 → 스턴 대상 선택'); ans(r.R, [r.w]); eq(r.R.cards[r.w].st, 'x', '스턴'); });
t('id_0245', '安室の愛車: Lv6 이상 캐릭터에 세트 → Lv6 이하 리무브', () => {
  const R = G({ e: real('id_0245', { type: 'event', lv: '0' }), a: dummy('A', { lv: '6' }), lo: dummy('L', { lv: '5' }), v: dummy('V', { lv: '6' }), hi: dummy('H', { lv: '7' }) }, ['e']); const s = R.turn, o = 1 - s; const e = hand(R, s, 'e');
  const a = field(R, s, 'a'); field(R, s, 'lo'); const v = field(R, o, 'v'), hi = field(R, o, 'hi'); play(R, s, e);
  ok(R.cards[a].sets.includes(e), '세트됨'); const q2 = req(R); ok(q2.sel.includes(v) && !q2.sel.includes(hi), 'Lv7 은 대상 아님'); ans(R, [v]); ok(!has(R, o, 'field', v), '리무브'); });
t('id_0512', '宣言: 액티브면 突撃, 슬립이면 AP8000 이하 리무브+드로우 (조건: 妃英理 등)', () => {
  const mk = st => { const R = G({ c: real('id_0512', { color: 'blue' }), j: dummy('妃英理'), v: dummy('V', { ap: '8000' }), w: dummy('W', { ap: '9000' }) }, ['c']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c', st); const v = field(R, o, 'v'), w = field(R, o, 'w'); return { R, s, o, c, v, w }; };
  let m = mk('s'); ok(FX.declare(m.R, m.s, m.c, 0), '妃英理 없으면 선언 불가');
  m = mk('s'); field(m.R, m.s, 'j'); eq(FX.declare(m.R, m.s, m.c, 0), undefined, '선언'); pump(m.R); const q = req(m.R); ok(q.sel.includes(m.v) && !q.sel.includes(m.w), 'AP9000 제외'); const h0 = m.R.P[m.s].hand.length; ans(m.R, [m.v]); eq(m.R.P[m.s].hand.length, h0 + 1, '드로우'); ok(!has(m.R, m.o, 'field', m.v), '리무브');
  m = mk('a'); field(m.R, m.s, 'j'); FX.declare(m.R, m.s, m.c, 0); pump(m.R); ok(FX.hasKwTk(m.R, m.c, 'assault'), '액티브 → 突撃'); ok(!m.R.eff, '질의 없음'); });
module.exports = {};
if (require.main === module) U.runAll('mz_p1');
