const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, play, auto, ok, eq, has, FX, req, ans, fillFile, pump, give } = U;
const BS = c => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3' } });
const di = (R, id, ic = 'declare') => (R.defs[R.cards[id].d].ab || []).findIndex(a => a.ic === ic);
const dec = (R, s, id) => { eq(FX.declare(R, s, id, di(R, id)), undefined, '선언'); pump(R); };
t('id_0643', '佐々木小次郎 宣言: 덱 3장 리무브 → 상대 캐릭터 1장 지정, 컨택트 발생(이 캐릭터가 공격 쪽)', () => {
  const R = G({ c: real('id_0643', { color: 'green' }), v: dummy('V', { ap: '1000' }) }, ['c'], ['c'], BS('green')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const v = field(R, o, 'v', 'a'); const n0 = R.P[s].deck.length;
  dec(R, s, c); eq(R.P[s].deck.length, n0 - 3, '덱 3장'); eq(R.cards[c].st, 's', '슬립 코스트'); const q = req(R); ok(q.sel.includes(v), '상대 캐릭터(액티브도 가능)'); ans(R, [v]); ok(R.sub && R.sub.type === 'contact' && R.sub.atk === c && R.sub.def === v, '컨택트 발생');
  U.finishContact(R); ok(R.cards[c] && R.cards[v] && true, '진행 완료'); });
t('id_0665', 'ここで会うたが百年目: 내 캐릭터 AP+1000 + 「宣言 ターン1 컨택트 발생」 부여', () => {
  const R = G({ e: real('id_0665', { type: 'event', lv: '0', color: 'green' }), a: dummy('A', { ap: '3000' }), v: dummy('V') }, ['e'], ['e'], BS('green')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; const e = hand(R, s, 'e'); const a = field(R, s, 'a'); const v = field(R, o, 'v');
  play(R, s, e); pump(R); if (R.eff) ans(R, [a]); eq(S_ap(R, a), 4000, 'AP+1000'); const ga = FX.grantedAb(R, a); ok(ga.length === 1 && ga[0].ic === 'declare', '선언 능력 부여'); eq(FX.declare(R, s, a, ga[0].i), undefined, '선언'); pump(R); ans(R, [v]); ok(R.sub && R.sub.atk === a && R.sub.def === v, '컨택트'); });
const S_ap = (R, id) => require('../server.js').ap(R, id);
t('id_1096', '鈴木園子: 상대 캐릭터 지정 + 내 다른 슬립 캐릭터가 공격 쪽인 컨택트', () => {
  const R = G({ c: real('id_1096', { color: 'white' }), a: dummy('A', { color: 'white' }), b: dummy('B', { color: 'white' }), v: dummy('V', { color: 'white' }) }, ['c'], ['c'], { p: { n: 'P', type: 'partner', color: 'white', lp: '1' }, k: { n: 'K', type: 'case', color: 'green/white', lv: '2', lv2: '3' } }); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s; U.solve(R, s); auto(R);
  const c = field(R, s, 'c'); const a = field(R, s, 'a', 's'); const b = field(R, s, 'b', 'a'); const v = field(R, o, 'v');
  dec(R, s, c); let q = req(R); ok(q.sel.includes(v), '상대 지정'); ans(R, [v]); q = req(R); if (q) { ok(q.sel.includes(a) && !q.sel.includes(b) && !q.sel.includes(c), '슬립 상태 다른 캐릭터만'); ans(R, [a]); } ok(R.sub && R.sub.atk === a && R.sub.def === v, '컨택트'); });
t('id_1142', 'ジン: 덱 3장 리무브, 【カットイン】 持つ【黒】 3장이면 컨택트 / 2장이면 없음', () => {
  const run = n => { const R = G({ c: real('id_1142', { color: 'black' }), cb: { n: 'CB', type: 'char', color: 'black', lv: '0', ap: '1000', lp: '1', kw: 'cutin:1000', ab: [{ ic: 'cutin', v: 1000 }] }, z: dummy('Z', { color: 'black' }), v: dummy('V', { color: 'black' }) }, ['c', 'cb', 'cb', 'cb', 'z', 'z', 'z'], ['c'], BS('black')); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
    const v = field(R, o, 'v'); const c = hand(R, s, 'c');
    const dk = R.P[s].deck, want = []; R.P[s].hand.filter(x => ['cb', 'z'].includes(U.key(R, x))).forEach(x => { R.P[s].hand.splice(R.P[s].hand.indexOf(x), 1); dk.unshift(x); }); for (let i = 0; i < 3; i++) { const k = i < n ? 'cb' : 'z'; const id = dk.find(x => U.key(R, x) === k && !want.includes(x)); want.push(id); } want.forEach(x => dk.splice(dk.indexOf(x), 1)); want.forEach(x => dk.push(x)); play(R, s, c); auto(R, { yn: true, pref: [v] }); pump(R); return { R, c, v }; };
  let r = run(3); ok(R_sub(r), '3장 → 컨택트'); r = run(2); ok(!R_sub(r), '2장 → 컨택트 없음'); });
const R_sub = r => r.R.sub && r.R.sub.type === 'contact';
t('id_1160', '灰原哀: 손패1+Lv7↑ 슬립 코스트 → 드로우 + 컨택트', () => {
  const R = G({ c: real('id_1160', { color: 'blue' }), a: dummy('A', { lv: '7' }), h: dummy('H'), v: dummy('V') }, ['c'], ['c'], { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue/black', lv: '2', lv2: '3' } }); fillFile(R, 0, 9); fillFile(R, 1, 9); const s = R.turn, o = 1 - s;
  const a = field(R, s, 'a'); const hh = hand(R, s, 'h'); const v = field(R, o, 'v'); const c = hand(R, s, 'c'); play(R, s, c); auto(R, { yn: true, pref: [hh, a, v] }); pump(R); eq(R.cards[a].st, 's', 'Lv7 캐릭터 슬립'); ok(has(R, s, 'rem', hh), '손패 리무브'); ok(R.sub && R.sub.atk === c && R.sub.def === v, '컨택트'); });
module.exports = {}; if (require.main === module) U.runAll('mz_p4');
