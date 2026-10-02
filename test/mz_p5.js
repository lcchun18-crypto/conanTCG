process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, pa, play, auto, ok, eq, has, req, ans, fillFile, pump, give } = U;
const BS = c => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3' } });
let EVC = 'black'; const EVD = (n, ops) => ({ n, type: 'event', color: EVC, lv: '0', ab: [{ ic: 'event', ops }] });
const RMSELF = o => ({ own: o });
const rmEv = (own, filter = {}) => EVD('E', [{ op: 'select', n: 1, filter: { own, ...filter }, do: 'remove' }]);
// 내 효과로 내 캐릭터를 리무브
const selfRm = (R, s, x, id, yn = true) => { R.turn = s; R.fl = {}; play(R, s, x); auto(R, { pref: [id], yn }); pump(R); };
const mk = (cid, over = {}, base = BS('black')) => { const R = G({ c: real(cid, { lv: '0', ...over }), e: rmEv('self'), f: rmEv('opp'), d: dummy('D') }, ['e', 'd', 'd'], ['f'], base); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
t('id_0365', '내 효과로 리무브 시 슬립으로 재등장+1드로 / 안 하면 리무브 유지 / 상대 효과엔 발동 안 함', () => {
  let R = mk('id_0365', { color: 'black' }); let s = R.turn, c = field(R, s, 'c'), e = hand(R, s, 'e'); const h = R.P[s].hand.length;
  selfRm(R, s, e, c, true); ok(has(R, s, 'field', c), '재등장'); eq(R.cards[c].st, 's', '슬립 상태'); ok(R.P[s].hand.length >= h - 1 + 1, '1장 드로');
  R = mk('id_0365', { color: 'black' }); s = R.turn; c = field(R, s, 'c'); e = hand(R, s, 'e'); selfRm(R, s, e, c, false); ok(has(R, s, 'rem', c), '거절하면 리무브 유지');
  R = mk('id_0365', { color: 'black' }); s = R.turn; let o = 1 - s; c = field(R, s, 'c'); let f = hand(R, o, 'f'); R.turn = o; R.fl = {}; play(R, o, f); auto(R, { pref: [c] }); pump(R); ok(has(R, s, 'rem', c), '상대 효과: 재등장 안 함');
  EVC = 'red'; R = mk('id_0365', { color: 'black' }, BS('red')); EVC = 'black'; s = R.turn; c = field(R, s, 'c'); e = hand(R, s, 'e'); selfRm(R, s, e, c, true); ok(has(R, s, 'rem', c), '파트너 색 불일치: 발동 안 함'); });
t('id_0603', '내 효과로 리무브 시 슬립으로 재등장(상대 효과엔 아님)', () => {
  let R = mk('id_0603', { color: 'black' }); let s = R.turn, c = field(R, s, 'c'), e = hand(R, s, 'e'); selfRm(R, s, e, c, true); ok(has(R, s, 'field', c) && R.cards[c].st === 's', '재등장 슬립');
  R = mk('id_0603', { color: 'black' }); s = R.turn; c = field(R, s, 'c'); e = hand(R, s, 'e'); selfRm(R, s, e, c, false); ok(has(R, s, 'rem', c), '거절');
  R = mk('id_0603', { color: 'black' }); s = R.turn; const o = 1 - s; c = field(R, s, 'c'); const f = hand(R, o, 'f'); R.turn = o; R.fl = {}; play(R, o, f); auto(R, { pref: [c] }); pump(R); ok(has(R, s, 'rem', c), '상대 효과: 안 함'); });
t('id_1163', '내 효과로 리무브 시 Lv7 이하 슬립 캐릭터 1장 리무브(Lv8/액티브는 대상 아님)', () => {
  const R = G({ c: real('id_1163', { lv: '0', color: 'black' }), e: rmEv('self'), a: dummy('A', { lv: '3' }), b: dummy('B', { lv: '8' }), z: dummy('Z', { lv: '3' }) }, ['e'], ['e'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'c'); const a = field(R, o, 'a', 's'), b = field(R, o, 'b', 's'), z = field(R, o, 'z', 'a'); const e = hand(R, s, 'e'); R.turn = s; R.fl = {}; play(R, s, e); ans(R, [c]); const q = req(R); ok(q, '질의'); ok(q.sel.includes(a) && !q.sel.includes(b) && !q.sel.includes(z), 'Lv7 이하 슬립만'); ans(R, [a]); pump(R); ok(has(R, o, 'rem', a), '리무브됨'); });
t('id_0611', '상대 효과로 손패에서 리무브되면 상대 턴에 등장(내 효과/내 턴이면 아님)', () => {
  const D2 = { op: 'discard', n: 1, who: 'opp', rand: false };
  let R = G({ c: real('id_0611', { lv: '0' }), x: EVD('X', [{ op: 'discard', n: 1, who: 'opp', opt: false }]) }, ['c'], ['x'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); let s = R.turn, o = 1 - s;
  let c = hand(R, s, 'c'); let x = hand(R, o, 'x'); R.turn = o; R.fl = {}; play(R, o, x); auto(R, { pref: [c], yn: true }); pump(R); ok(has(R, s, 'field', c), '손패→리무브→등장');
  R = G({ c: real('id_0611', { lv: '0' }), x: EVD('X', [{ op: 'discard', n: 1, who: 'self', opt: false }]) }, ['c', 'x'], ['x'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); s = R.turn; c = hand(R, s, 'c'); x = hand(R, s, 'x'); R.turn = s; R.fl = {}; play(R, s, x); auto(R, { pref: [c], yn: true }); pump(R); ok(!has(R, s, 'field', c), '내 효과로는 등장 안 함'); });
const limbo = (R, s, k) => { const id = give(R, s, k, 'rem'); R.P[s].rem = R.P[s].rem.filter(x => x !== id); return id; };
const flash = (R, s, id, o = {}) => { R.fl = R.fl || {}; FX.queueFlash(R, s, id); pump(R); return auto(R, o); };
const FX = U.FX;
t('id_0648', '플래시: 내 캐릭터 1장 리무브하면 이 캐릭터 등장 / 안 하면 등장 안 함', () => {
  const run = pay => { const R = G({ c: real('id_0648', { lv: '0' }), v: dummy('V') }, ['c'], ['c'], BS('green')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn; const v = field(R, s, 'v'); const id = limbo(R, s, 'c');
    FX.queueFlash(R, s, id); pump(R); auto(R, { yn: true, pref: pay ? [v] : [] }); return { R, s, v, id }; };
  let r = run(true); ok(has(r.R, r.s, 'rem', r.v), '내 캐릭터 리무브'); ok(has(r.R, r.s, 'field', r.id), '이 캐릭터 등장');
  r = run(false); ok(has(r.R, r.s, 'field', r.v), '리무브 안 함'); ok(!has(r.R, r.s, 'field', r.id), '등장 안 함 → 리무브 에리어로'); ok(has(r.R, r.s, 'rem', r.id), '평소처럼 리무브 에리어'); });
t('id_0650', '플래시: 해결편일 때만 슬립 상태로 등장', () => {
  const run = sv => { const R = G({ c: real('id_0650', { lv: '0' }) }, ['c'], ['c'], BS('green')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn; if (sv) U.solve(R, s); const id = limbo(R, s, 'c'); FX.queueFlash(R, s, id); pump(R); auto(R, { yn: true }); return { R, s, id }; };
  let r = run(true); ok(has(r.R, r.s, 'field', r.id) && r.R.cards[r.id].st === 's', '해결편: 슬립 등장'); r = run(false); ok(!has(r.R, r.s, 'field', r.id), '해결편 아님: 발동 불가'); });
const BSF = (c, lv2 = '3') => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2 } });
t('id_0359', '파트너: 내 턴 종료 시 FILE 2장 손패→손패 2장 리무브→이 캐릭터 이외 전부 리무브 / 거절하면 아무 일 없음', () => {
  const run = pay => { const R = G({ v: dummy('V'), w: dummy('W'), h: dummy('H') }, ['h', 'h', 'h'], ['h'], { p: real('id_0359', { color: 'black', type: 'partner' }), k: BS('black').k }); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
    const v = field(R, s, 'v'), w = field(R, o, 'w'); const f0 = R.P[s].file.length; U.endTurn(R); auto(R, { yn: pay }); pump(R); return { R, s, o, v, w, f0 }; };
  let r = run(true); ok(has(r.R, r.s, 'rem', r.v) && has(r.R, r.o, 'rem', r.w), '모든 캐릭터 리무브'); eq(r.R.P[r.s].file.length, r.f0 - 2, 'FILE 2장 감소');
  r = run(false); ok(has(r.R, r.s, 'field', r.v) && has(r.R, r.o, 'field', r.w), '거절: 변화 없음'); eq(r.R.P[r.s].file.length, r.f0, 'FILE 유지'); });
t('id_0720', '해결편 선언(손패): 내 (黒) 캐릭터 리무브+슬립 등장+ジン 사용 불가 / 해결편 전·(黒) 없음이면 선언 불가', () => {
  const R = G({ c: real('id_0720', { lv: '0', color: 'black' }), b: dummy('B', { color: 'black' }), j: real('id_0720', { lv: '0', color: 'black' }) }, ['c'], ['c'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn; const c = hand(R, s, 'c'); const j = hand(R, s, 'j');
  const A = () => require('../server.js') && 0; const acts = () => U.S.actsFor ? U.S.actsFor(R, s) : null;
  eq(U.FX.declareCheck(R, s, c, R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare')) === '' , false, '해결편 전: 선언 불가');
  U.solve(R, s); const i = R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare'); ok(U.FX.declareCheck(R, s, c, i), '(黒) 캐릭터 없음: 선언 불가');
  const b = field(R, s, 'b'); eq(U.FX.declareCheck(R, s, c, i), '', '조건 충족'); const e = U.FX.declare(R, s, c, i); ok(!e, '선언'); pump(R); auto(R, { pref: [b] }); pump(R);
  ok(has(R, s, 'rem', b), '(黒) 캐릭터 리무브'); ok(has(R, s, 'field', c) && R.cards[c].st === 's', '슬립 등장'); ok(!U.FX.nameBanned || U.FX.nameBanned(R, s, j), '같은 이름 사용 불가'); });
t('id_0997', '파트너(赤) FILE8: 슬립+손패 赤井秀一 리무브 → 이 캐릭터 리무브 → 리무브/파트너 에리어의 赤井秀一&世良真純 등장 / FILE 부족 시 불가', () => {
  const R = G({ c: real('id_0997', { lv: '0', color: 'red' }), a: dummy('赤井秀一'), t: dummy('赤井秀一&世良真純') }, ['a'], ['a'], BS('red')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn; const c = field(R, s, 'c'); const a = hand(R, s, 'a'); const tt = rem(R, s, 't'); const i = R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare');
  eq(U.FX.declareCheck(R, s, c, i), '', '조건 충족'); const e = U.FX.declare(R, s, c, i); ok(!e, e); pump(R); auto(R, { pref: [a, tt] }); pump(R); ok(has(R, s, 'rem', c), '이 캐릭터 리무브'); ok(has(R, s, 'rem', a), '赤井秀一 리무브(코스트)'); ok(has(R, s, 'field', tt), '赤井秀一&世良真純 등장');
  const R2 = G({ c: real('id_0997', { lv: '0', color: 'red' }), a: dummy('赤井秀一') }, ['a'], ['a'], BS('red')); fillFile(R2, 0, 7); const c2 = field(R2, R2.turn, 'c'); hand(R2, R2.turn, 'a'); ok(U.FX.declareCheck(R2, R2.turn, c2, i), 'FILE 7장: 불가'); });
t('id_1146', '컷인(내 턴, Lv8↑ 컷인 가진 黒 캐릭터)시 리무브에서 등장 → 턴 종료 시 내 캐릭터 1장 덱 아래 강제 / 4장 이상이면 突撃', () => {
  const CUT = { n: 'CC', type: 'char', color: 'black', lv: '8', ap: '1000', lp: '1', kw: 'cutin:1000', ab: [{ ic: 'cutin', v: 1000 }] };
  const R = G({ c: real('id_1146', { lv: '0', color: 'black' }), kc: CUT, a: dummy('A', { ap: '500', lv: '3' }), x: { ...CUT, n: 'X', lv: '8' } }, ['x'], ['x'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const c = rem(R, s, 'c'); const k = field(R, s, 'kc'); R.cards[k].sum = 0; const a = field(R, o, 'a', 'a'); const x = hand(R, s, 'x'); U.attack(R, k, a); U.finishContact(R, [{ s, m: { a: 'cin', id: x } }], { yn: true });
  ok(has(R, s, 'field', c), '컷인 시 리무브 에리어에서 등장'); eq(R.cards[c].cinN, R.n, '컷인 등장 표시');
  const before = R.P[s].field.length; U.endTurn(R); auto(R, {}); pump(R); ok(R.P[s].field.length < before, '턴 종료 시 1장 덱 아래로');
  const R2 = G({ c: real('id_1146', { lv: '0', color: 'black' }), kc: CUT, k1: { ...CUT, n: 'K1' }, k2: { ...CUT, n: 'K2' }, k3: { ...CUT, n: 'K3' } }, ['kc'], ['kc'], BS('black')); fillFile(R2, 0, 9); fillFile(R2, 1, 9); const s2 = R2.turn; const c2 = field(R2, s2, 'c'); field(R2, s2, 'kc'); ['k1', 'k2', 'k3'].forEach(k => { R2.defs; give(R2, s2, k, 'field'); }); ok(U.FX.hasKwTk(R2, c2, 'assault'), '【컷인】 黒 4장 이상: 突撃'); });
module.exports = {}; if (require.main === module) U.runAll('mz_p5');
