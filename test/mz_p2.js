const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, pa, play, auto, ok, eq, has, FX, req, ans, fillFile, pump } = U;
const EV = (n, lv, color = 'green', extra = {}) => ({ n, type: 'event', color, lv: String(lv), ab: [{ ic: 'event', ops: [{ op: 'draw', n: 1 }] }], ...extra });
const BASE = c => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3' } });
const GG = (defs, l0, l1, c = 'green') => G(defs, l0, l1, BASE(c));
const declIdx = (R, id) => (R.defs[R.cards[id].d].ab || []).findIndex(a => a.ic === 'declare');
const doDecl = (R, s, id) => { eq(FX.declare(R, s, id, declIdx(R, id)), undefined, '선언'); pump(R); };
t('id_0286', '宣言: 리무브 에리어의 【緑】 이벤트 2장을 덱 아래로 → 손패의 Lv5/6 【緑】 이벤트 사용 (Lv7 불가)', () => {
  const R = GG({ c: real('id_0286', { color: 'green' }), e1: EV('E1', 4), e2: EV('E2', 3), ok5: EV('OK5', 5), no7: EV('NO7', 7) }, ['c']); const s = R.turn; fillFile(R, s, 9);
  const c = field(R, s, 'c'); rem(R, s, 'e1'); rem(R, s, 'e2'); const a = hand(R, s, 'ok5'), b = hand(R, s, 'no7'); const h0 = R.P[s].hand.length;
  doDecl(R, s, c); let q = req(R); ok(q.kind === 'pick', '코스트 선택'); ans(R, q.sel.slice(0, 2)); if (R.eff && req(R).ordered) ans(R, req(R).ids); q = req(R); ok(q.sel.includes(a) && !q.sel.includes(b), 'Lv7 은 사용 불가'); ans(R, [a]); pump(R);
  ok(has(R, s, 'rem', a), '이벤트 사용 → 리무브'); eq(R.P[s].hand.length, h0 - 1 + 1, '이벤트 효과(드로우) 해결'); eq(R.cards[c].st, 's', '스리프'); });
t('id_0546', 'ラブリースポット: 손패 Lv6 이하 【緑】 이벤트 사용 (같은 이름 불가)', () => {
  const R = GG({ e: real('id_0546', { type: 'event', lv: '0', color: 'green' }), x: EV('X', 6), same: EV('ラブリースポット', 2), hi: EV('HI', 7) }, ['e']); const s = R.turn; const e = hand(R, s, 'e'); const x = hand(R, s, 'x'), sm = hand(R, s, 'same'), hi = hand(R, s, 'hi'); const h0 = R.P[s].hand.length;
  play(R, s, e); let q = req(R); while (q && q.kind !== 'pick') { ans(R, null); q = req(R); } ok(q.sel.includes(x) && !q.sel.includes(sm) && !q.sel.includes(hi), '합법 대상만'); ans(R, [x]); auto(R); pump(R); ok(has(R, s, 'rem', x), '사용됨'); });
t('id_0747', 'パートナー(緑) 宣言: 손패 Lv5/6 【緑】 이벤트 사용', () => {
  const R = GG({ c: real('id_0747', { color: 'green' }), a: EV('A', 6) }, ['c']); const s = R.turn; fillFile(R, s, 9); const c = field(R, s, 'c'); const a = hand(R, s, 'a');
  doDecl(R, s, c); const q = req(R); ok(q.sel.includes(a), '대상'); ans(R, [a]); pump(R); ok(has(R, s, 'rem', a), '사용됨'); eq(R.cards[c].st, 's', '스리프'); });
t('id_0866', '宣言: 服部平次 가 있을 때만, 자신을 리무브 에리어로 → 손패 Lv6 이하 이벤트 사용', () => {
  const R = GG({ c: real('id_0866', { color: 'green' }), h: dummy('服部平次'), a: EV('A', 6, 'green') }, ['c']); const s = R.turn; fillFile(R, s, 9); const c = field(R, s, 'c'); const a = hand(R, s, 'a');
  ok(FX.declare(R, s, c, declIdx(R, c)), '服部平次 없으면 불가'); field(R, s, 'h'); doDecl(R, s, c); ok(has(R, s, 'rem', c), '자신 리무브'); ans(R, [a]); pump(R); ok(has(R, s, 'rem', a), '이벤트 사용'); });
t('id_0839', '絆工藤新一 宣言: 손패의 [シャッフルロマンス] 이벤트 사용', () => {
  const R = GG({ c: real('id_0839', { color: 'green' }), b: dummy('工藤新一'), sr: EV('シャッフルロマンス', 3), o: EV('他', 3) }, ['c']); const s = R.turn; fillFile(R, s, 9); const c = field(R, s, 'c'); ok(FX.declare(R, s, c, declIdx(R, c)), '絆 없으면 불가');
  field(R, s, 'b'); const a = hand(R, s, 'sr'), o = hand(R, s, 'o'); doDecl(R, s, c); const q = req(R); ok(q.sel.includes(a) && !q.sel.includes(o), '이름 제한'); ans(R, [a]); pump(R); ok(has(R, s, 'rem', a), '사용'); });
t('id_0842', 'The Black Knight: 증거 2장 표향 → [シャッフルロマンス] 회수 또는 사용 선택', () => {
  const run = choice => { const R = G({ sr: EV('シャッフルロマンス', 3), sr2: EV('シャッフルロマンス', 3) }, [], [], { p: { n: 'P', type: 'partner', color: 'green', lp: '1' }, k: real('id_0842', { type: 'case', color: 'green', lv: '2', lv2: '3' }) }); const s = R.turn; fillFile(R, s, 9); U.evid(R, s, 3); U.solve(R, s); auto(R);
    const a = rem(R, s, 'sr'), b = hand(R, s, 'sr2'); const k = R.P[s].kase; const di = (R.defs[R.cards[k].d].ab || []).findIndex(x => x.ic === 'declare'); eq(FX.declare(R, s, k, di), undefined, '선언'); pump(R); const q = req(R); eq(q.kind, 'opt', '선택'); ans(R, choice); return { R, s, a, b, ev: R.P[s].evid.filter(x => R.cards[x].up).length }; };
  let r = run(0); const q = req(r.R); ok(q.sel.includes(r.a), '회수 대상'); ans(r.R, [r.a]); ok(has(r.R, r.s, 'hand', r.a), '손패로');
  r = run(1); const q2 = req(r.R); ok(q2.sel.includes(r.b), '사용 대상'); ans(r.R, [r.b]); pump(r.R); ok(has(r.R, r.s, 'rem', r.b), '이벤트 사용'); });
t('id_0982', '登場時: 파트너/리무브 에리어의 [ビッグジュエル] 이벤트 회수 + 宣言: Lv5 사용 후 회수·리무브', () => {
  const R = GG({ c: real('id_0982', { color: 'green' }), bj: EV('BJ', 5, 'green', { trait: 'ビッグジュエル' }), w: dummy('W', { color: 'white', lv: '3' }), h: dummy('H') }, ['c']); const s = R.turn; fillFile(R, s, 9);
  const bjr = rem(R, s, 'bj'); const c = hand(R, s, 'c'); play(R, s, c); ok(req(R) || has(R, s, 'hand', bjr), '회수 질의'); auto(R, { pref: [bjr] }); ok(has(R, s, 'hand', bjr), '이벤트 회수');
  const w = rem(R, s, 'w'); hand(R, s, 'h'); doDecl(R, s, c); let q = req(R); ok(q.sel.includes(bjr), '이벤트 사용 선택'); ans(R, [bjr]); const q2 = req(R); ok(q2.sel.includes(w), 'Lv3 白 캐릭터 회수'); ans(R, [w]); auto(R); pump(R);
  ok(has(R, s, 'rem', bjr), '이벤트 사용됨'); ok(has(R, s, 'hand', w) || has(R, s, 'rem', w), '회수 후 손패 1장 리무브'); });
module.exports = {}; if (require.main === module) U.runAll('mz_p2');
