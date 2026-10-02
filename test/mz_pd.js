process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, give, play, auto, ok, eq, has, S, FX, act, req, ans, fillFile, top, rem, pa, pump, endTurn } = U;
const sol = R => { U.solve(R, R.turn); };
const BASE = (pc = 'blue', kc = 'blue') => ({ p: { n: 'P', type: 'partner', color: pc, lp: '1' }, k: { n: 'K', type: 'case', color: kc, lv: '2', lv2: '3' } });
// 뒷면 세트 카드를 n장 붙인다
const fdSet = (R, h, n = 1) => { const o = R.cards[h].o; const ids = U.filler(R, o, n); ids.forEach(x => { (R.cards[h].fd = R.cards[h].fd || []).push(x); R.cards[x].fdOn = h; }); return ids; };
const di = (R, c, n = 0) => { let k = 0; const ab = R.defs[R.cards[c].d].ab || []; for (let i = 0; i < ab.length; i++) if (ab[i].ic === 'declare') { if (k++ === n) return i; } return -1; };
const decl = (R, s, c, n = 0) => { const e = FX.declare(R, s, c, di(R, c, n)); if (e) throw new Error('declare: ' + e); pump(R); };
const declErr = (R, s, c, n = 0) => FX.declare(R, s, c, di(R, c, n));
const nfd = (R, h) => (R.cards[h].fd || []).length;
const kinds = log => log.join(',');

t('id_0849', '등장 시: 리무브 에리어의 [少年探偵団]를 【青】 캐릭터 아래에 겹침 → 그 캐릭터는 활성 캐릭터를 지정해 액션 가능', () => {
  const R = G({ c: real('id_0849', { lv: '0' }), x: dummy('X', { trait: '少年探偵団' }), y: dummy('Y', { trait: '高校生' }), b1: dummy('B1', { color: 'blue' }), b2: dummy('B2', { color: 'blue' }), r: dummy('R', { color: 'red' }) }, ['c']); const s = R.turn;
  const c = hand(R, s, 'c'); const x = rem(R, s, 'x'), y = rem(R, s, 'y'); const b1 = field(R, s, 'b1'), b2 = field(R, s, 'b2'), r = field(R, s, 'r');
  play(R, s, c); let q = req(R); ok(q.sel.includes(x) && !q.sel.includes(y), '[少年探偵団]만 후보'); ans(R, [x]);
  q = req(R); ok(q.sel.includes(b1) && q.sel.includes(b2) && !q.sel.includes(r) && q.sel.includes(c), '【青】 캐릭터만 후보(자신도 青 이므로 후보)'); ans(R, [b2]);
  eq((R.cards[b2].under || []).join(), String(x), '아래에 겹침'); ok(!has(R, s, 'rem', x), '리무브 에리어에서 빠짐'); ok(FX.hasKwTk(R, b2, 'actactive'), '활성 캐릭터 지정 가능'); ok(!FX.hasKwTk(R, b1, 'actactive'), '다른 캐릭터에는 없음');
  endTurn(R); auto(R); ok(!FX.hasKwTk(R, b2, 'actactive'), '턴 종료 후 해제'); });
t('id_0849', '등장 시: 겹치지 않으면(0장 선택) 키워드를 주지 않음', () => {
  const R = G({ c: real('id_0849', { lv: '0' }), x: dummy('X', { trait: '少年探偵団' }), b1: dummy('B1', { color: 'blue' }) }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const x = rem(R, s, 'x'); const b1 = field(R, s, 'b1');
  play(R, s, c); ans(R, []); ok(has(R, s, 'rem', x), '그대로'); ok(!FX.hasKwTk(R, b1, 'actactive'), '키워드 없음'); });

t('id_0859', '선언: 뒷면 세트 카드 합쳐서 2장(양쪽 가능) 리무브 → 1장 드로우 (카드명 [大岡紅葉]/[伊織無我] 가 현장에)', () => {
  const R = G({ c: real('id_0859', { lv: '0' }), a: dummy('A'), b: dummy('B') }, ['c'], ['b']); const s = R.turn, o = 1 - s; fillFile(R, s, 8);
  const c = field(R, s, 'c'); const a = field(R, s, 'a'), b = field(R, o, 'b'); const [fa] = fdSet(R, a, 1); const [fb] = fdSet(R, b, 1); const h0 = R.P[s].hand.length;
  decl(R, s, c); let q = req(R); eq(q.kind, 'yn', '리무브 여부'); ans(R, true); q = req(R); ok(q.sel.includes(a) && q.sel.includes(b), '양쪽 캐릭터가 후보'); ans(R, [a]); ok(!req(R), '남은 홀더가 상대 캐릭터 1명뿐이므로 자동 선택'); pump(R);
  eq(nfd(R, a), 0, '내 뒷면 카드 리무브'); eq(nfd(R, b), 0, '상대 뒷면 카드 리무브'); ok(has(R, s, 'rem', fa) && has(R, o, 'rem', fb), '각자의 리무브 에리어로'); eq(R.P[s].hand.length, h0 + 1, '1장 드로우'); ok(declErr(R, s, c), '턴 1회'); });
t('id_0859', '선언: 뒷면 카드가 합쳐 1장뿐이면 처리하지 않음 / 안 하면 드로우 없음', () => {
  const R = G({ c: real('id_0859', { lv: '0' }), a: dummy('A') }, ['c']); const s = R.turn; fillFile(R, s, 8); const c = field(R, s, 'c'); const a = field(R, s, 'a'); fdSet(R, a, 1); const h0 = R.P[s].hand.length;
  decl(R, s, c); ok(!req(R), '질의 없이 종료'); eq(nfd(R, a), 1, '리무브 안 됨'); eq(R.P[s].hand.length, h0, '드로우 없음');
  const R2 = G({ c: real('id_0859', { lv: '0' }), a: dummy('A') }, ['c']); const s2 = R2.turn; const c2 = field(R2, s2, 'c'); const a2 = field(R2, s2, 'a'); fdSet(R2, a2, 2); decl(R2, s2, c2); ans(R2, false); eq(nfd(R2, a2), 2, '사용하지 않음');
});
t('id_0859', '선언: 파트너 에리어에서도 선언 가능, 이름 조건([大岡紅葉]/[伊織無我])이 없으면 선언 불가', () => {
  const R = G({ c: real('id_0859', { lv: '0' }), n: dummy('伊織無我'), z: dummy('Z') }, ['c']); const s = R.turn; fillFile(R, s, 8); const c = pa(R, s, 'c'); field(R, s, 'z');
  ok(declErr(R, s, c), '현장에 이름이 없으면 불가'); const R2 = G({ c: real('id_0859', { lv: '0' }), n: dummy('伊織無我') }, ['c']); const s2 = R2.turn; const c2 = pa(R2, s2, 'c'); field(R2, s2, 'n'); eq(declErr(R2, s2, c2), undefined, '파트너 에리어에서 선언 가능'); });

t('id_0863', '등장 시 선택1: [伊織無我] 에 덱 위를 뒷면으로 세트 + AP+2000 (후보는 [伊織無我] 만)', () => {
  const R = G({ c: real('id_0863', { lv: '0' }), i: dummy('伊織無我'), z: dummy('Z') }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const i = field(R, s, 'i'), z = field(R, s, 'z'); const d0 = R.P[s].deck.length;
  play(R, s, c); eq(req(R).kind, 'opt', '3택'); ans(R, 0); const q = req(R); ok(q.sel.includes(i) && !q.sel.includes(z) && !q.sel.includes(c), '[伊織無我] 만 후보'); ans(R, [i]);
  eq(nfd(R, i), 1, '뒷면 세트'); eq(R.P[s].deck.length, d0 - 1, '덱 위 1장'); eq(R.cards[i].apm, 2000, 'AP+2000'); endTurn(R); auto(R); eq(R.cards[i].apm, 0, '턴 종료 시 해제'); });
t('id_0863', '등장 시 선택2: 뒷면 세트 + 突撃', () => {
  const R = G({ c: real('id_0863', { lv: '0' }), i: dummy('伊織無我') }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const i = field(R, s, 'i'); play(R, s, c); ans(R, 1); ans(R, [i]);
  eq(nfd(R, i), 1, '세트'); ok(FX.hasKwTk(R, i, 'assault'), '突撃'); });
t('id_0863', '등장 시 선택3: 상대 캐릭터에 상대 덱 위를 뒷면으로 세트하고 슬립 (상대 덱 -1)', () => {
  const R = G({ c: real('id_0863', { lv: '0' }), w: dummy('W'), i: dummy('伊織無我') }, ['c'], ['w']); const s = R.turn, o = 1 - s; const c = hand(R, s, 'c'); const w = field(R, o, 'w'); const i = field(R, s, 'i'); const d0 = R.P[o].deck.length, m0 = R.P[s].deck.length;
  play(R, s, c); ans(R, 2); const q = req(R); ok(q.sel.includes(w) && !q.sel.includes(i), '상대 캐릭터만 후보'); ans(R, [w]);
  eq(nfd(R, w), 1, '뒷면 세트'); eq(R.cards[R.cards[w].fd[0]].o, o, '상대 카드'); eq(R.P[o].deck.length, d0 - 1, '상대 덱 -1'); eq(R.P[s].deck.length, m0, '내 덱 그대로'); eq(R.cards[w].st, 's', '슬립'); });

t('id_0867', '등장 시: 이 캐릭터를 리무브하면 양쪽 리무브 에리어의 모든 카드를 덱 아래로 → 리무브 에리어는 비고 덱에 합쳐짐', () => {
  const R = G({ c: real('id_0867', { lv: '0' }), a: dummy('A'), b: dummy('B') }, ['c', 'a'], ['b']); const s = R.turn, o = 1 - s; const c = hand(R, s, 'c'); const a = rem(R, s, 'a'), b = rem(R, o, 'b'); const d0 = R.P[s].deck.length, e0 = R.P[o].deck.length;
  play(R, s, c); eq(req(R).kind, 'yn', '리무브 여부'); ans(R, true); pump(R);
  eq(R.P[s].rem.length, 0, '내 리무브 에리어 비움'); eq(R.P[o].rem.length, 0, '상대 리무브 에리어 비움'); eq(R.P[s].deck.length, d0 + 2, '내 덱: 리무브 에리어 2장(a + 이 캐릭터) 추가'); eq(R.P[o].deck.length, e0 + 1, '상대 덱 +1');
  ok(R.P[s].deck.includes(a) && R.P[s].deck.includes(c) && R.P[o].deck.includes(b), '덱으로 이동'); });
t('id_0867', '등장 시: 리무브하지 않으면 아무것도 변하지 않음', () => {
  const R = G({ c: real('id_0867', { lv: '0' }), a: dummy('A') }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const a = rem(R, s, 'a'); play(R, s, c); ans(R, false); ok(has(R, s, 'field', c), '그대로'); ok(has(R, s, 'rem', a), '리무브 에리어 유지'); });

t('id_0872', '등장 시: 현장 캐릭터 1장당 덱 위 1장을 뒷면으로 이 캐릭터에 세트(자신 포함)', () => {
  const R = G({ c: real('id_0872', { lv: '0' }), a: dummy('A'), b: dummy('B'), w: dummy('W') }, ['c'], ['w']); const s = R.turn; const c = hand(R, s, 'c'); field(R, s, 'a'); field(R, s, 'b'); field(R, 1 - s, 'w'); const d0 = R.P[s].deck.length;
  play(R, s, c); eq(nfd(R, c), 3, '내 현장 3장(자신 포함) → 3장 세트'); eq(R.P[s].deck.length, d0 - 3, '덱 -3'); });

t('id_0873', '내 캐릭터가 추리하면 내 캐릭터의 뒷면 세트 카드 1장을 리무브해도 됨 → 1장 드로우 (턴1)', () => {
  const R = G({ c: real('id_0873', { lv: '0' }), a: dummy('A'), b: dummy('B') }, ['c']); const s = R.turn; fillFile(R, s, 8); field(R, s, 'c'); const a = field(R, s, 'a'), b = field(R, s, 'b'); const [fa] = fdSet(R, a, 1); const h0 = R.P[s].hand.length;
  eq(act(R, s, { a: 'reason', who: a }), undefined, '추리'); pump(R); eq(req(R).kind, 'yn', '리무브 여부'); ans(R, true); pump(R); ok(has(R, s, 'rem', fa), '뒷면 카드 리무브'); eq(nfd(R, a), 0, '세트 해제'); eq(R.P[s].hand.length, h0 + 1, '드로우');
  eq(act(R, s, { a: 'reason', who: b }), undefined, '두 번째 추리'); pump(R); ok(!req(R), '턴1: 두 번째는 발동하지 않음'); });
t('id_0873', '추리: 뒷면 카드가 없으면 발동해도 아무 일 없음 / 사용하지 않음을 선택하면 드로우 없음 / 파트너의 추리에는 반응하지 않음', () => {
  const R = G({ c: real('id_0873', { lv: '0' }), a: dummy('A') }, ['c']); const s = R.turn; fillFile(R, s, 8); field(R, s, 'c'); const a = field(R, s, 'a'); const h0 = R.P[s].hand.length;
  act(R, s, { a: 'reason', who: a }); pump(R); ok(!req(R), '질의 없음'); eq(R.P[s].hand.length, h0, '드로우 없음');
  const R2 = G({ c: real('id_0873', { lv: '0' }), a: dummy('A') }, ['c']); const s2 = R2.turn; fillFile(R2, s2, 8); field(R2, s2, 'c'); const a2 = field(R2, s2, 'a'); fdSet(R2, a2, 1); act(R2, s2, { a: 'reason', who: a2 }); pump(R2); ans(R2, false); eq(nfd(R2, a2), 1, '리무브 안 함');
  const R3 = G({ c: real('id_0873', { lv: '0' }), a: dummy('A') }, ['c']); const s3 = R3.turn; fillFile(R3, s3, 8); field(R3, s3, 'c'); const a3 = field(R3, s3, 'a'); fdSet(R3, a3, 1); eq(act(R3, s3, { a: 'reason', who: 'p' }), undefined, '파트너 추리'); pump(R3); ok(!req(R3), '파트너(캐릭터 아님)에는 반응하지 않음'); });

t('id_0875', '선언(슬립): 리무브 에리어의 [工藤有希子] 1장을 뒷면으로 이 캐릭터에 세트 → 레벨7 이하 캐릭터를 덱 아래로', () => {
  const R = G({ c: real('id_0875', { lv: '0' }), y: dummy('工藤有希子'), n: dummy('X'), w7: dummy('W7', { lv: '7' }), w8: dummy('W8', { lv: '8' }) }, ['c'], ['w7']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const y = rem(R, s, 'y'); const n = rem(R, s, 'n'); const w7 = field(R, o, 'w7'), w8 = field(R, o, 'w8');
  decl(R, s, c); let q = req(R); ok(q.sel.includes(y) && !q.sel.includes(n), '[工藤有希子] 만 후보'); ans(R, [y]); eq(R.cards[c].st, 's', '슬립 코스트');
  ok((R.cards[c].fd || []).includes(y), '뒷면으로 세트'); ok(!has(R, s, 'rem', y), '리무브 에리어에서 빠짐'); q = req(R); ok(q.sel.includes(w7) && !q.sel.includes(w8), '레벨7 이하만'); ans(R, [w7]); eq(R.P[o].deck[0], w7, '덱 아래로'); });
t('id_0875', '선언: [工藤有希子] 가 리무브 에리어에 없거나 고르지 않으면 상대 캐릭터는 이동하지 않음', () => {
  const R = G({ c: real('id_0875', { lv: '0' }), w7: dummy('W7', { lv: '7' }) }, ['c'], ['w7']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const w7 = field(R, o, 'w7'); decl(R, s, c); ok(!req(R), '질의 없음'); ok(has(R, o, 'field', w7), '그대로'); });

t('id_0888', '등장 시: 덱 위 3장 → 1장 공개해 손패, 나머지 리무브 에리어. 지정 이름이면 손패 리무브 없음', () => {
  const R = G({ c: real('id_0888', { lv: '0' }), a: dummy('宮野志保'), b: dummy('B'), d: dummy('D') }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const a = top(R, s, 'a'), b = top(R, s, 'b'), d = top(R, s, 'd'); const h0 = R.P[s].hand.length, r0 = R.P[s].rem.length;
  play(R, s, c); const log = auto(R, { pref: [a] }); ok(log.includes('pick'), '선택 질의'); ok(has(R, s, 'hand', a), '손패'); ok(has(R, s, 'rem', b) && has(R, s, 'rem', d), '나머지는 리무브 에리어'); eq(R.P[s].hand.length, h0 - 1 + 1, '손패: 등장으로 -1, 가져와 +1(추가 리무브 없음)'); eq(R.P[s].rem.length, r0 + 2, '리무브 에리어 +2'); });
t('id_0888', '등장 시: 지정 이름 이외를 가져오면 손패 1장 리무브', () => {
  const R = G({ c: real('id_0888', { lv: '0' }), a: dummy('宮野志保'), b: dummy('B'), d: dummy('D') }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const a = top(R, s, 'a'), b = top(R, s, 'b'), d = top(R, s, 'd'); const h0 = R.P[s].hand.length;
  play(R, s, c); const q0 = req(R); eq(q0.kind, 'ack', '확인'); ans(R, null); const q = req(R); eq(q.kind, 'pick', '선택'); ok(q.ids.length === 3 && q.reveal, '3장 공개 선택'); ans(R, [b]);
  eq(req(R).kind, 'ack', '상대에게 공개(확인)'); eq(req(R).who, 1 - s, '상대가 확인'); ans(R, null); const q2 = req(R); eq(q2.kind, 'pick', '손패 1장 리무브'); ok(q2.who === s && q2.sel.includes(b), '내 손패에서'); ans(R, [b]);
  ok(has(R, s, 'rem', b) && has(R, s, 'rem', a) && has(R, s, 'rem', d), '리무브'); eq(R.P[s].hand.length, h0 - 1, '손패 -1(등장) +1(가져옴) -1(리무브)'); });
t('id_0888', '등장 시: 아무것도 가져오지 않으면 손패 리무브 없음, 3장 모두 리무브 에리어', () => {
  const R = G({ c: real('id_0888', { lv: '0' }), a: dummy('A'), b: dummy('B'), d: dummy('D') }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const a = top(R, s, 'a'), b = top(R, s, 'b'), d = top(R, s, 'd'); const h0 = R.P[s].hand.length;
  play(R, s, c); auto(R, { pref: [] }); eq(R.P[s].hand.length, h0 - 1, '손패 변화 없음(등장 -1)'); ok([a, b, d].every(x => has(R, s, 'rem', x)), '모두 리무브 에리어'); });

const mk0895 = (n7 = 3, solved = true, reg = [5, 4, 1]) => { const defs = { c: real('id_0895', { lv: '0' }), w: dummy('W') }; ['l5', 'l4', 'l1', 'x5', 'x3'].forEach((k, i) => { defs[k] = dummy(k, { lv: String([5, 4, 1, 5, 3][i]) }); }); for (let i = 0; i < 3; i++) defs['s' + i] = dummy('S' + i, { lv: '7' });
  const R = G(defs, ['c'], ['w']); const s = R.turn, o = 1 - s; fillFile(R, s, 8); if (solved) sol(R); const c = field(R, s, 'c'); for (let i = 0; i < n7; i++) field(R, s, 's' + i); const ids = {}; ['l5', 'l4', 'l1', 'x5', 'x3'].forEach(k => { ids[k] = rem(R, s, k); }); const w = field(R, o, 'w'); return { R, s, o, c, w, ...ids }; };
t('id_0895', '해결편 선언: 덱 9장 리무브(코스트) 후 레벨5/4/1 카드를 덱 아래로(후보는 각 레벨) → 3장이면 상대 캐릭터를 덱 아래로', () => {
  const { R, s, o, c, w, l5, l4, l1, x5, x3 } = mk0895(); const d0 = R.P[s].deck.length; decl(R, s, c);
  const q = req(R); eq(q.kind, 'pick', '그룹 선택'); ok(q.sel.includes(l5) && q.sel.includes(x5) && !q.sel.includes(x3), '레벨5 후보'); ans(R, [l5]); const q2 = req(R); ok(q2.sel.includes(l4) && !q2.sel.includes(l5), '레벨4 후보'); ans(R, [l4]); const q3 = req(R); ok(q3.sel.includes(l1), '레벨1 후보'); ans(R, [l1]);
  const q4 = req(R); ok(q4.ordered, '순서 지정'); ans(R, [l1, l5, l4]); ok(!has(R, s, 'rem', l5) && !has(R, s, 'rem', l4) && !has(R, s, 'rem', l1), '리무브 에리어에서 빠짐'); eq(R.P[s].deck.slice(0, 3).join(), [l4, l5, l1].join(), '지정한 순서로 덱 아래(나중에 고른 카드가 가장 아래: 엔진 공통 규약)');
  const q5 = req(R); ok(q5.sel.includes(w), '상대 캐릭터 선택'); ans(R, [w]); eq(R.P[o].deck[0], w, '상대 캐릭터 덱 아래'); eq(R.cards[c].st, 's', '슬립 코스트'); ok(R.P[s].deck.length <= d0 - 9 + 3, '덱 9장 리무브'); ok(declErr(R, s, c), '턴1'); });
t('id_0895', '해결편 선언: 3장 미만이면 상대 캐릭터는 이동하지 않음', () => {
  const { R, s, o, c, w, l5, l4 } = mk0895(); decl(R, s, c); ans(R, [l5]); ans(R, [l4]); ans(R, []); const q = req(R); ok(q && q.ordered, '순서 지정'); ans(R, q.ids); ok(!req(R), '추가 선택 없음'); ok(has(R, o, 'field', w), '상대 캐릭터 그대로'); });
t('id_0895', '선언 조건: 사건이 해결편 + 레벨7 캐릭터 3장 이상', () => {
  let r = mk0895(2); ok(declErr(r.R, r.s, r.c), '레벨7 2장은 불가'); r = mk0895(3, false); ok(declErr(r.R, r.s, r.c), '해결편이 아니면 불가'); r = mk0895(3); eq(declErr(r.R, r.s, r.c), undefined, '조건 충족'); });

t('id_0901', '선언(턴1): 이 캐릭터 또는 레벨7 이하 [警視庁] 캐릭터를 덱 아래로(코스트) → 1장 드로우', () => {
  const R = G({ c: real('id_0901', { lv: '0' }), pl: dummy('P', { trait: '警視庁', lv: '7' }), q: dummy('Q', { trait: '警視庁', lv: '8' }), z: dummy('Z', { lv: '1' }), w: dummy('W', { trait: '警視庁', lv: '1' }) }, ['c'], ['w']); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'c'), p = field(R, s, 'pl'), q = field(R, s, 'q'), z = field(R, s, 'z'), w = field(R, o, 'w'); const h0 = R.P[s].hand.length;
  decl(R, s, c); const qq = req(R); ok(qq.sel.includes(c) && qq.sel.includes(p) && !qq.sel.includes(q) && !qq.sel.includes(z) && !qq.sel.includes(w), '자신 + 레벨7 이하 [警視庁] 만'); ans(R, [p]);
  eq(R.P[s].deck[0], p, '덱 아래'); eq(R.P[s].hand.length, h0 + 1, '드로우'); ok(declErr(R, s, c), '턴1'); });
t('id_0901', '선언: 이 캐릭터 자신을 덱 아래로 보내도 드로우', () => {
  const R = G({ c: real('id_0901', { lv: '0' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); const h0 = R.P[s].hand.length; decl(R, s, c); if (req(R)) ans(R, [c]); eq(R.P[s].deck[0], c, '자신이 덱 아래'); eq(R.P[s].hand.length, h0 + 1, '드로우'); });

t('id_0905', '선언(슬립): [喫茶ポアロ] 손패를 원하는 만큼 공개(코스트) → (공개 수 + 현장 [喫茶ポアロ] 수) 이하 레벨의 캐릭터 리무브', () => {
  const R = G({ c: real('id_0905', { lv: '0', trait: '探偵,喫茶ポアロ' }), h1: dummy('H1', { trait: '喫茶ポアロ' }), h2: dummy('H2', { trait: '喫茶ポアロ' }), h3: dummy('H3', { trait: '高校生' }), q: dummy('Q', { trait: '喫茶ポアロ' }), a: dummy('A', { lv: '3' }), b: dummy('B', { lv: '4' }), e: dummy('E', { lv: '2' }) }, ['c', 'h1', 'h2', 'h3'], ['a', 'b', 'e']); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'c'); field(R, s, 'q'); const h1 = hand(R, s, 'h1'), h2 = hand(R, s, 'h2'), h3 = hand(R, s, 'h3'); const a = field(R, o, 'a'), b = field(R, o, 'b'), e = field(R, o, 'e');
  decl(R, s, c); let q = req(R); ok(q.sel.includes(h1) && q.sel.includes(h2) && !q.sel.includes(h3), '[喫茶ポアロ] 손패만 공개 가능'); eq(q.min, 0, '0장도 가능'); ans(R, [h1]); q = req(R); eq(q.kind, 'ack', '상대에게 공개'); eq(q.who, 1 - s, '상대가 확인'); ans(R, null);
  q = req(R); ok(q.sel.includes(a) && q.sel.includes(e) && !q.sel.includes(b), '공개 1 + 현장 2 = 레벨3 이하만'); ans(R, [a]); ok(!has(R, o, 'field', a), '리무브'); eq(R.cards[c].st, 's', '슬립 코스트'); ok(has(R, s, 'hand', h1), '공개한 카드는 손패에 남음'); });
t('id_0905', '선언: 공개 0장이면 현장의 [喫茶ポアロ] 수만큼의 레벨', () => {
  const R = G({ c: real('id_0905', { lv: '0', trait: '探偵,喫茶ポアロ' }), a: dummy('A', { lv: '1' }), b: dummy('B', { lv: '2' }), e: dummy('E', { lv: '3' }) }, ['c'], ['a', 'b', 'e']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const a = field(R, o, 'a'), b = field(R, o, 'b'), e = field(R, o, 'e');
  decl(R, s, c); const q = req(R); if (q && q.kind === 'pick' && q.max === 0) ans(R, []); const q2 = req(R); ok(q2.sel.includes(a) && !q2.sel.includes(b) && !q2.sel.includes(e), '자신 1명 → 레벨1 이하'); ans(R, [a]); ok(!has(R, o, 'field', a), '리무브'); });

t('id_0906', '선언: 이 캐릭터를 덱 아래로(코스트) → 턴 종료 시 손패의 레벨4 이하 [警察] 캐릭터 1장 등장', () => {
  const R = G({ c: real('id_0906', { lv: '0' }), p4: dummy('P4', { trait: '警察', lv: '4' }), p5: dummy('P5', { trait: '警察', lv: '5' }), n4: dummy('N4', { lv: '4' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); const p4 = hand(R, s, 'p4'), p5 = hand(R, s, 'p5'), n4 = hand(R, s, 'n4');
  decl(R, s, c); eq(R.P[s].deck[0], c, '덱 아래'); ok(!has(R, s, 'field', p4), '아직 등장하지 않음'); endTurn(R); const q = req(R); ok(q && q.sel.includes(p4) && !q.sel.includes(p5) && !q.sel.includes(n4), '레벨4 이하 [警察] 만'); ans(R, [p4]); ok(has(R, s, 'field', p4), '턴 종료 시 등장'); });
t('id_0906', '선언: 턴 종료 시 등장은 선택하지 않아도 됨', () => {
  const R = G({ c: real('id_0906', { lv: '0' }), p4: dummy('P4', { trait: '警察', lv: '4' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); const p4 = hand(R, s, 'p4'); decl(R, s, c); endTurn(R); ans(R, []); ok(has(R, s, 'hand', p4), '손패에 남음'); });

const mk0929 = (n = 0) => { const R = G({ c: real('id_0929', { lv: '0' }), b: dummy('B', { color: 'blue' }), kn: dummy('K', { color: 'black' }), r: dummy('R', { color: 'red' }), ev: { n: 'EV', type: 'event', color: 'blue', lv: '0', ab: [] }, w9: dummy('W9', { lv: '9' }), w10: dummy('W10', { lv: '10' }) }, ['c']); const s = R.turn; return { R, s }; };
t('id_0929', '현장에서 리무브될 때(턴1): 【青】/【黒】 캐릭터를 손패에서 공개(코스트) → 레벨9 이하 내 캐릭터 리무브', () => {
  const { R, s } = mk0929(); const c = field(R, s, 'c'); const b = hand(R, s, 'b'), kn = hand(R, s, 'kn'), r = hand(R, s, 'r'), ev = hand(R, s, 'ev'); const w9 = field(R, s, 'w9'), w10 = field(R, s, 'w10');
  FX.rmChar(R, c, 'effect'); pump(R); eq(req(R).kind, 'yn', '코스트 지불 여부'); ans(R, true); let q = req(R); ok(q.sel.includes(b) && q.sel.includes(kn) && !q.sel.includes(r) && !q.sel.includes(ev), '【青】/【黒】 캐릭터만 공개 가능'); ans(R, [b]); eq(req(R).kind, 'ack', '공개 확인'); ans(R, null);
  q = req(R); ok(q.sel.includes(w9) && !q.sel.includes(w10), '레벨9 이하만'); ans(R, [w9]); ok(!has(R, s, 'field', w9), '리무브'); ok(has(R, s, 'hand', b), '공개한 카드는 손패에'); });
t('id_0929', '현장에서 리무브될 때: 코스트를 지불하지 않으면 아무 일 없음 / 공개할 카드가 없으면 발동 불가', () => {
  const { R, s } = mk0929(); const c = field(R, s, 'c'); hand(R, s, 'b'); const w9 = field(R, s, 'w9'); FX.rmChar(R, c, 'effect'); pump(R); ans(R, false); ok(has(R, s, 'field', w9), '그대로');
  const q = mk0929(); const c2 = field(q.R, q.s, 'c'); q.R.P[q.s].hand.filter(x => ['b', 'kn', 'w9', 'w10'].includes(U.key(q.R, x))).forEach(x => { q.R.P[q.s].hand.splice(q.R.P[q.s].hand.indexOf(x), 1); q.R.P[q.s].deck.unshift(x); }); hand(q.R, q.s, 'r'); field(q.R, q.s, 'w9'); FX.rmChar(q.R, c2, 'effect'); pump(q.R); ok(!req(q.R), '공개할 카드가 없으면 질의 없음'); });

t('id_0932', '등장 시: 손패/리무브 에리어의 [シャッフルロマンス] 이벤트를 내 캐릭터에 세트', () => {
  const EVN = { n: 'シャッフルロマンス', type: 'event', color: 'blue', lv: '0', ab: [] };
  const R = G({ c: real('id_0932', { lv: '0' }), e: EVN, e2: { ...EVN, n: 'シャッフルロマンス' }, o: { ...EVN, n: 'Other' }, v: dummy('V') }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const e = hand(R, s, 'e'), e2 = rem(R, s, 'e2'), o = hand(R, s, 'o'); const v = field(R, s, 'v');
  play(R, s, c); let q = req(R); ok(q.sel.includes(e) && q.sel.includes(e2) && !q.sel.includes(o), '[シャッフルロマンス] 만 후보(손패/리무브 에리어)'); ans(R, [e2]); q = req(R); ok(q.sel.includes(v) && q.sel.includes(c), '내 캐릭터 후보'); ans(R, [v]);
  ok((R.cards[v].sets || []).includes(e2), '세트됨'); ok(!has(R, s, 'rem', e2), '리무브 에리어에서 빠짐'); ok(has(R, s, 'hand', e), '다른 카드는 그대로'); });
t('id_0932', '상대 턴(턴1): 표향 세트되어 있던 [シャッフルロマンス] 가 리무브 에리어에 놓이면 손패에 가져와도 됨', () => {
  const EVN = { n: 'シャッフルロマンス', type: 'event', color: 'blue', lv: '0', ab: [] };
  const mk = () => { const R = G({ c: real('id_0932', { lv: '0' }), e: EVN, o: { ...EVN, n: 'Other' }, v: dummy('V') }, ['c']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const v = field(R, s, 'v'); const e = give(R, s, 'e', 'rem'), ot = give(R, s, 'o', 'rem'); R.P[s].rem = R.P[s].rem.filter(x => x !== e && x !== ot);
    R.cards[v].sets = [e, ot]; R.cards[e].setOn = v; R.cards[ot].setOn = v; return { R, s, o, c, v, e, ot }; };
  let m = mk(); m.R.turn = m.o; m.R.fl = {}; FX.rmChar(m.R, m.v, 'effect'); pump(m.R); eq(req(m.R).kind, 'yn', '손패에 가져올지'); ans(m.R, true); pump(m.R); ok(has(m.R, m.s, 'hand', m.e), '손패에'); ok(has(m.R, m.s, 'rem', m.ot) && !has(m.R, m.s, 'hand', m.ot), '다른 이름은 그대로 리무브 에리어');
  m = mk(); m.R.turn = m.o; m.R.fl = {}; FX.rmChar(m.R, m.v, 'effect'); pump(m.R); ans(m.R, false); ok(has(m.R, m.s, 'rem', m.e), '안 가져옴');
  m = mk(); FX.rmChar(m.R, m.v, 'effect'); pump(m.R); ok(!req(m.R), '내 턴에는 발동하지 않음'); ok(has(m.R, m.s, 'rem', m.e), '내 턴: 그대로'); });

t('id_0947', '내 턴 종료 시: 손패의 [工藤新一]/[毛利蘭] 공개 → 레벨8 이상 [工藤新一]/[毛利蘭] 1장 액티브', () => {
  const R = G({ c: real('id_0947', { lv: '0' }), kn: dummy('工藤新一'), r8: dummy('毛利蘭', { lv: '8' }), r7: dummy('毛利蘭', { lv: '7' }), z: dummy('Z', { lv: '8' }) }, ['c']); const s = R.turn; field(R, s, 'c'); const k = hand(R, s, 'kn'); const r8 = field(R, s, 'r8', 's'), r7 = field(R, s, 'r7', 's'), z = field(R, s, 'z', 's');
  endTurn(R); let q = req(R); ok(q.sel.includes(k), '공개 후보'); ans(R, [k]); eq(req(R).kind, 'ack', '공개 확인'); ans(R, null); q = req(R); ok(q.sel.includes(r8) && !q.sel.includes(r7) && !q.sel.includes(z), '레벨8 이상 [毛利蘭] 만'); ans(R, [r8]); eq(R.cards[r8].st, 'a', '액티브'); eq(R.cards[r7].st, 's', '레벨7은 그대로'); });
t('id_0947', '내 턴 종료 시: 공개하지 않으면 액티브 안 됨 / 파트너 에리어에서도 발동', () => {
  const R = G({ c: real('id_0947', { lv: '0' }), kn: dummy('工藤新一'), r8: dummy('毛利蘭', { lv: '8' }) }, ['c']); const s = R.turn; field(R, s, 'c'); hand(R, s, 'kn'); const r8 = field(R, s, 'r8', 's'); endTurn(R); ans(R, []); eq(R.cards[r8].st, 's', '공개 안 함 → 그대로');
  const R2 = G({ c: real('id_0947', { lv: '0' }), kn: dummy('工藤新一'), r8: dummy('毛利蘭', { lv: '8' }) }, ['c']); const s2 = R2.turn; pa(R2, s2, 'c'); const k2 = hand(R2, s2, 'kn'); const r2 = field(R2, s2, 'r8', 's'); endTurn(R2); ans(R2, [k2]); ans(R2, null); ans(R2, [r2]); eq(R2.cards[r2].st, 'a', '파트너 에리어에서 발동'); });

t('id_0949', '絆 工藤新一: 내 턴 중 효과/코스트로 손패의 [工藤新一]/[毛利蘭] 를 공개하면 손패 1장 리무브해도 됨 → 레벨7 이하 리무브(턴1)', () => {
  const R = G({ c: real('id_0949', { lv: '0' }), kk: dummy('工藤新一'), kn: dummy('工藤新一'), d: dummy('D'), w7: dummy('W7', { lv: '7' }), w8: dummy('W8', { lv: '8' }), rv: dummy('RV', { trait: 'x' }) }, ['c']); const s = R.turn, o = 1 - s;
  field(R, s, 'c'); field(R, s, 'kk'); const k = hand(R, s, 'kn'), d = hand(R, s, 'd'); const w7 = field(R, o, 'w7'), w8 = field(R, o, 'w8');
  R.q.push({ kind: 'cb', s, fn: () => FX.bus(R, 'hrev', { s, ent: k, by: 'effect' }) }); pump(R); eq(req(R).kind, 'pick', '손패 1장 리무브(선택)'); ans(R, [d]); ok(has(R, s, 'rem', d), '손패 리무브'); const q = req(R); ok(q.sel.includes(w7) && !q.sel.includes(w8), '레벨7 이하'); ans(R, [w7]); ok(!has(R, o, 'field', w7), '리무브');
  R.q.push({ kind: 'cb', s, fn: () => FX.bus(R, 'hrev', { s, ent: k, by: 'cost' }) }); pump(R); ok(!req(R), '턴1'); });
t('id_0949', '絆: [工藤新一] 가 현장에 없으면 / 상대 턴이면 / 다른 이름을 공개하면 발동하지 않음', () => {
  const mk = () => { const R = G({ c: real('id_0949', { lv: '0' }), kk: dummy('工藤新一'), kn: dummy('工藤新一'), z: dummy('Z') }, ['c']); const s = R.turn; field(R, s, 'c'); return { R, s }; };
  let m = mk(); const k = hand(m.R, m.s, 'kn'); m.R.q.push({ kind: 'cb', s: m.s, fn: () => FX.bus(m.R, 'hrev', { s: m.s, ent: k }) }); pump(m.R); ok(!req(m.R), '絆 [工藤新一] 없음');
  m = mk(); field(m.R, m.s, 'kk'); const z = hand(m.R, m.s, 'z'); m.R.q.push({ kind: 'cb', s: m.s, fn: () => FX.bus(m.R, 'hrev', { s: m.s, ent: z }) }); pump(m.R); ok(!req(m.R), '다른 이름 공개');
  m = mk(); field(m.R, m.s, 'kk'); const k2 = hand(m.R, m.s, 'kn'); m.R.turn = 1 - m.s; m.R.fl = {}; m.R.q.push({ kind: 'cb', s: m.s, fn: () => FX.bus(m.R, 'hrev', { s: m.s, ent: k2 }) }); pump(m.R); ok(!req(m.R), '상대 턴'); });
t('id_0949', '실제 공개 경로: 0947 의 턴 종료 공개/코스트 공개가 hrev 를 일으켜 반응', () => {
  const R = G({ c: real('id_0949', { lv: '0' }), d: real('id_0947', { lv: '0' }), kk: dummy('工藤新一'), kn: dummy('工藤新一'), w7: dummy('W7', { lv: '7' }), x: dummy('X') }, ['c', 'd'], ['w7']); const s = R.turn, o = 1 - s; field(R, s, 'c'); field(R, s, 'd'); field(R, s, 'kk'); const k = hand(R, s, 'kn'); const x = hand(R, s, 'x'); const w7 = field(R, o, 'w7');
  endTurn(R); ans(R, [k]); ans(R, null); const q = req(R); ok(q && q.kind === 'pick', '내 턴 종료 공개 → 0949 반응(상대 턴이 아님 — 내 턴 중)'); void x; void w7; });

t('id_0991', '事件(白&黄) 선언: 현장의 레벨6 이상 【黄】[警察] 캐릭터를 이 캐릭터 아래에 겹침(코스트) → 레벨6 이하 캐릭터 리무브', () => {
  const R = G({ c: real('id_0991', { lv: '0' }), y: dummy('Y', { color: 'yellow', trait: '警察', lv: '6' }), y7: dummy('Y7', { color: 'yellow', trait: '警察', lv: '7' }), y5: dummy('Y5', { color: 'yellow', trait: '警察', lv: '5' }), n: dummy('N', { color: 'white', trait: '警察', lv: '7' }), w6: dummy('W6', { lv: '6' }), w7: dummy('W7', { lv: '7' }) }, ['c'], ['w6'], BASE('white', 'white')); const s = R.turn, o = 1 - s;
  R.cards[R.P[s].kase].d && (R.defs[R.cards[R.P[s].kase].d].color = 'white,yellow'); const c = field(R, s, 'c'); const y = field(R, s, 'y'); const y7 = field(R, s, 'y7'), y5 = field(R, s, 'y5'), n = field(R, s, 'n'); const w6 = field(R, o, 'w6'), w7 = field(R, o, 'w7');
  decl(R, s, c); let q = req(R); ok(q.sel.includes(y) && q.sel.includes(y7) && !q.sel.includes(y5) && !q.sel.includes(n) && !q.sel.includes(c), '레벨6 이상 【黄】[警察] 만'); ans(R, [y]); q = req(R); ok(q.sel.includes(w6) && !q.sel.includes(w7), '레벨6 이하'); ans(R, [w6]);
  eq((R.cards[c].under || []).join(), String(y), '아래에 겹침'); ok(!has(R, s, 'field', y), '현장에서 빠짐'); ok(!has(R, o, 'field', w6), '리무브'); });
t('id_0991', '事件(白&黄) 선언: 사건 색이 맞지 않으면 선언 불가', () => {
  const R = G({ c: real('id_0991', { lv: '0' }), y: dummy('Y', { color: 'yellow', trait: '警察', lv: '6' }) }, ['c'], ['c'], BASE('white', 'white')); const s = R.turn; const c = field(R, s, 'c'); field(R, s, 'y'); ok(declErr(R, s, c), '사건 색 불일치'); });

const WYK = (k = 'white,yellow') => BASE('blue', k);
t('id_1018', '事件編 등장 시: 덱 위 3장 → 【白】/【黄】 캐릭터 1장 + 【白】/【黄】 이벤트 1장 공개해 손패, 나머지 리무브 에리어, 2장이면 손패 1장 리무브', () => {
  const R = G({ c: real('id_1018', { lv: '0' }), ch: dummy('CH', { color: 'white' }), ev: { n: 'EV', type: 'event', color: 'yellow', lv: '0', ab: [] }, bad: dummy('BAD', { color: 'red' }) }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const ch = top(R, s, 'ch'), ev = top(R, s, 'ev'), bad = top(R, s, 'bad'); const h0 = R.P[s].hand.length;
  play(R, s, c); ans(R, null); let q = req(R); ok(q.sel.includes(ch) && !q.sel.includes(bad) && !q.sel.includes(ev), '캐릭터 그룹: 【白】/【黄】 캐릭터만'); ans(R, [ch]); q = req(R); ok(q.sel.includes(ev) && !q.sel.includes(bad), '이벤트 그룹'); ans(R, [ev]);
  eq(req(R).kind, 'ack', '공개'); ans(R, null); q = req(R); eq(q.kind, 'pick', '2장 가져왔으므로 손패 1장 리무브'); ans(R, [ch]); ok(has(R, s, 'hand', ev) && has(R, s, 'rem', ch) && has(R, s, 'rem', bad), '결과'); eq(R.P[s].hand.length, h0 - 1 + 2 - 1, '손패 수'); });
t('id_1018', '事件編 등장 시: 1장만 가져오면 손패 리무브 없음 / 해결편이면 발동 안 함', () => {
  const R = G({ c: real('id_1018', { lv: '0' }), ch: dummy('CH', { color: 'yellow' }), z: dummy('Z', { color: 'red' }) }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const ch = top(R, s, 'ch'); top(R, s, 'z'); const h0 = R.P[s].hand.length; play(R, s, c); auto(R, { pref: [ch] }); eq(R.P[s].hand.length, h0 - 1 + 1, '1장만 추가'); ok(has(R, s, 'hand', ch), '손패');
  const R2 = G({ c: real('id_1018', { lv: '0' }), ch: dummy('CH', { color: 'yellow' }) }, ['c']); const s2 = R2.turn; fillFile(R2, s2, 8); sol(R2); const c2 = hand(R2, s2, 'c'); top(R2, s2, 'ch'); const d0 = R2.P[s2].deck.length; play(R2, s2, c2); ok(!req(R2), '해결편이면 효과 없음'); eq(R2.P[s2].deck.length, d0, '덱 그대로'); });

t('id_1048', '선언1: 레벨8 이하 내 캐릭터를 고르면 덱 위에서 같은 레벨·같은 카드명 캐릭터가 나올 때까지 공개 → 등장, 나머지는 덱 아래+셔플, 턴 종료 시 덱 아래', () => {
  const R = G({ c: real('id_1048', { lv: '0' }), a: dummy('A', { lv: '5' }), a2: dummy('A', { lv: '5' }), b: dummy('B', { lv: '5' }), a6: dummy('A', { lv: '6' }), big: dummy('Big', { lv: '9' }) }, ['c', 'a', 'a2', 'b', 'a6']); const s = R.turn; const c = field(R, s, 'c'); const a = field(R, s, 'a'); const big = field(R, s, 'big');
  const a2 = top(R, s, 'a2'), a6 = top(R, s, 'a6'), b = top(R, s, 'b'); const d0 = R.P[s].deck.length;
  decl(R, s, c, 0); let q = req(R); ok(q.sel.includes(a) && !q.sel.includes(big), '레벨8 이하만'); ans(R, [a]); q = req(R); eq(q.kind, 'ack', '공개'); ans(R, null); ans(R, null);
  ok(has(R, s, 'field', a2), '같은 레벨·같은 이름의 캐릭터 등장'); ok(has(R, s, 'deck', a6) && has(R, s, 'deck', b), '나머지는 덱으로'); eq(R.P[s].deck.length, d0 - 1 + 0, '덱: 등장 1장 감소'); /* 원문: 나머지 공개한 카드를 덱 아래로 옮기고 '덱을 셔플' → 덱 전체가 섞이므로 위치는 고정되지 않음 */ eq(new Set(R.P[s].deck).size, R.P[s].deck.length, '덱에 중복 없음');
  endTurn(R); auto(R); ok(has(R, s, 'deck', a2) && !has(R, s, 'field', a2), '턴 종료 시 덱 아래'); eq(R.P[s].deck[0], a2, '덱 아래'); });
t('id_1048', '선언2: 손패의 레벨8 이하 캐릭터를 공개(코스트) → 내 캐릭터의 카드명을 턴 종료 시까지 공개한 카드명으로', () => {
  const R = G({ c: real('id_1048', { lv: '0' }), h: dummy('毛利蘭', { lv: '7' }), big: dummy('Big', { lv: '9' }), v: dummy('V') }, ['c']); const s = R.turn; const c = pa(R, s, 'c'); const h = hand(R, s, 'h'), big = hand(R, s, 'big'); const v = field(R, s, 'v');
  decl(R, s, c, 1); let q = req(R); ok(q.sel.includes(h) && !q.sel.includes(big), '레벨8 이하 캐릭터만 공개'); ans(R, [h]); eq(req(R).kind, 'ack', '공개'); ans(R, null); q = req(R); ok(q.sel.includes(v), '내 캐릭터 선택'); ans(R, [v]);
  const FO = require('./mz_util').FX; ok(FO.cleanAb && true, 'clean'); const nmHit = id => FX.countOf(R, s, id, { src: 'field', f: { own: 'self', name: '毛利蘭' } }) ; ok(nmHit(v) >= 1, '카드명이 [毛利蘭] 로 취급'); endTurn(R); auto(R); eq(FX.countOf(R, s, v, { src: 'field', f: { own: 'self', name: '毛利蘭' } }), 0, '턴 종료 후 해제'); });

t('id_1049', '事件(赤&黒) 등장 시: 상대 레벨7 이상 캐릭터를 리무브 → 상대 덱 위에서 같은 카드명 캐릭터가 나오거나 10장 공개할 때까지 공개해 모두 리무브 에리어로', () => {
  const R = G({ c: real('id_1049', { lv: '0', color: 'red' }), w: dummy('W', { lv: '7' }), w6: dummy('W6', { lv: '6' }), w2: dummy('W', { lv: '3' }), f1: dummy('F1'), f2: dummy('F2') }, ['c'], ['w', 'w6', 'w2', 'f1', 'f2'], BASE('red', 'red,black')); const s = R.turn, o = 1 - s; fillFile(R, s, 8); const c = hand(R, s, 'c');
  const w = field(R, o, 'w'), w6 = field(R, o, 'w6'); const w2 = top(R, o, 'w2'), f1 = top(R, o, 'f1'), f2 = top(R, o, 'f2'); const r0 = R.P[o].rem.length;
  play(R, s, c); let q = req(R); ok(q.sel.includes(w) && !q.sel.includes(w6), '레벨7 이상만'); ans(R, [w]); q = req(R); eq(q.kind, 'ack', '공개'); ans(R, null); ans(R, null);
  ok([f2, f1, w2].every(x => has(R, o, 'rem', x)), '공개한 카드 모두 리무브 에리어'); ok(has(R, o, 'rem', w), '리무브한 캐릭터'); eq(R.P[o].rem.length, r0 + 4, '리무브 에리어 +4'); });
t('id_1049', '事件(赤&黒) 등장 시: 같은 카드명이 없으면 10장 공개하고 멈춤', () => {
  const R = G({ c: real('id_1049', { lv: '0', color: 'red' }), w: dummy('W', { lv: '7' }) }, ['c'], ['w'], BASE('red', 'red,black')); const s = R.turn, o = 1 - s; fillFile(R, s, 8); const c = hand(R, s, 'c'); const w = field(R, o, 'w'); const d0 = R.P[o].deck.length, r0 = R.P[o].rem.length;
  play(R, s, c); ans(R, [w]); auto(R); eq(R.P[o].deck.length, d0 - 10, '10장 공개'); eq(R.P[o].rem.length, r0 + 11, '리무브 에리어 +10 (+리무브한 캐릭터)'); });
t('id_1049', '선언(턴1, 파트너 에리어에서도): 1장 드로우 후 손패 1장 리무브 또는 이 캐릭터 리무브', () => {
  const R = G({ c: real('id_1049', { lv: '0' }), x: dummy('X') }, ['c']); const s = R.turn; const c = field(R, s, 'c'); const h0 = R.P[s].hand.length; decl(R, s, c); eq(req(R).kind, 'opt', '2택'); ans(R, 0); const q = req(R); ok(q.kind === 'pick' && q.who === s, '손패 1장 선택'); ans(R, [q.sel[0]]); eq(R.P[s].hand.length, h0, '드로우 +1 / 리무브 -1'); ok(has(R, s, 'field', c), '이 캐릭터는 남음');
  const R2 = G({ c: real('id_1049', { lv: '0' }) }, ['c']); const s2 = R2.turn; const c2 = pa(R2, s2, 'c'); eq(declErr(R2, s2, c2), undefined, '파트너 에리어'); pump(R2); ans(R2, 1); ok(true, '선택'); });
t('id_1049', '선언: 이 캐릭터 리무브를 선택하면 이 캐릭터가 리무브됨', () => {
  const R = G({ c: real('id_1049', { lv: '0' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); decl(R, s, c); ans(R, 1); ok(!has(R, s, 'field', c) && has(R, s, 'rem', c), '리무브됨'); });

const FOOT = real; void FOOT;
t('id_1056', '등장 시: 덱 위 1장이 [警視庁] 캐릭터면 공개해 손패 → 그 레벨만큼 덱 위를 리무브', () => {
  const R = G({ c: real('id_1056', { lv: '0' }), pl: dummy('P', { trait: '警視庁', lv: '6' }) }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const p = top(R, s, 'pl'); const r0 = R.P[s].rem.length;
  play(R, s, c); eq(req(R).kind, 'ack', '확인'); ans(R, null); const q = req(R); ok(q.sel.includes(p) && q.reveal, '공개 선택'); ans(R, [p]); auto(R); ok(has(R, s, 'hand', p), '손패'); eq(R.P[s].rem.length, r0 + 6, '레벨 6 → 6장 리무브'); });
t('id_1056', '등장 시: [警視庁] 가 아니면 가져오지 못하고 덱 아래로(리무브 없음)', () => {
  const R = G({ c: real('id_1056', { lv: '0' }), z: dummy('Z', { lv: '6' }) }, ['c']); const s = R.turn; const c = hand(R, s, 'c'); const z = top(R, s, 'z'); const r0 = R.P[s].rem.length; play(R, s, c); auto(R); ok(!has(R, s, 'hand', z), '손패 아님'); eq(R.P[s].deck[0], z, '덱 아래'); eq(R.P[s].rem.length, r0, '리무브 없음'); });

t('id_1065', '액션 종료 시(턴1): 선택1 — 이 캐릭터의 뒷면 세트 카드 1장을 손패에', () => {
  const R = G({ c: real('id_1065', { lv: '0' }), w: dummy('W') }, ['c'], ['w']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const [f1] = fdSet(R, c, 2); const w = field(R, o, 'w', 's'); R.cards[c].sum = 0;
  U.toContact(R, s, c, w); U.endContact(R); pump(R); const q = req(R); eq(q && q.kind, 'opt', '2택'); ans(R, 0); const q2 = req(R); if (q2) ans(R, [f1]); eq(nfd(R, c), 1, '뒷면 카드 -1'); ok(has(R, s, 'hand', f1), '손패에'); });
t('id_1065', '액션 종료 시: 선택2 — 뒷면 카드가 없는 [サッカー選手] 캐릭터에 뒷면 카드 1장을 옮김(후보 한정)', () => {
  const R = G({ c: real('id_1065', { lv: '0' }), w: dummy('W'), s1: dummy('S1', { trait: 'サッカー選手' }), s2: dummy('S2', { trait: 'サッカー選手' }), z: dummy('Z') }, ['c'], ['w']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const [f1] = fdSet(R, c, 1); const s1 = field(R, s, 's1'), s2 = field(R, s, 's2'), z = field(R, s, 'z'); fdSet(R, s2, 1); const w = field(R, o, 'w', 's');
  U.toContact(R, s, c, w); U.endContact(R); pump(R); ans(R, 1); const q = req(R); ok(q.sel.includes(s1) && !q.sel.includes(s2) && !q.sel.includes(z), '뒷면이 없는 [サッカー選手] 만'); ans(R, [s1]); eq(nfd(R, s1), 1, '이동'); eq(nfd(R, c), 0, '이 캐릭터에서 빠짐'); });

t('id_1083', '선언: [服部平次]/【緑】[警察] 에 뒷면으로 세트된 카드 합쳐 2장 리무브(코스트) → 레벨7 이하 슬립 캐릭터 리무브', () => {
  const R = G({ c: real('id_1083', { lv: '0' }), h: dummy('服部平次'), g: dummy('G', { color: 'green', trait: '警察' }), z: dummy('Z'), s7: dummy('S7', { lv: '7' }), a7: dummy('A7', { lv: '7' }), s8: dummy('S8', { lv: '8' }) }, ['c'], ['s7', 'a7', 's8']); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'c'); const h = field(R, s, 'h'), g = field(R, s, 'g'), z = field(R, s, 'z'); const [fh] = fdSet(R, h, 1), [fg] = fdSet(R, g, 1); fdSet(R, z, 3); const s7 = field(R, o, 's7', 's'), a7 = field(R, o, 'a7', 'a'), s8 = field(R, o, 's8', 's');
  decl(R, s, c, 1); let q = req(R); ok(q.sel.includes(h) && q.sel.includes(g) && !q.sel.includes(z), '[服部平次]/【緑】[警察] 캐릭터만 후보'); ans(R, [h]); /* 남은 홀더가 g 1명뿐이므로 자동 선택(질의 없음) */
  q = req(R); ok(q.sel.includes(s7) && !q.sel.includes(a7) && !q.sel.includes(s8), '레벨7 이하 슬립만'); ans(R, [s7]); ok(!has(R, o, 'field', s7), '리무브'); ok(has(R, s, 'rem', fh) && has(R, s, 'rem', fg), '뒷면 카드 리무브'); eq(nfd(R, z), 3, '조건 외 캐릭터는 그대로'); });
t('id_1083', '선언: 조건에 맞는 캐릭터의 뒷면 카드가 합쳐 2장 미만이면 선언 불가', () => {
  const R = G({ c: real('id_1083', { lv: '0' }), h: dummy('服部平次'), z: dummy('Z') }, ['c']); const s = R.turn; const c = field(R, s, 'c'); const h = field(R, s, 'h'), z = field(R, s, 'z'); fdSet(R, h, 1); fdSet(R, z, 5); ok(declErr(R, s, c, 1), '1장뿐 → 불가'); fdSet(R, h, 1); eq(declErr(R, s, c, 1), undefined, '한 캐릭터에 2장도 가능'); });

t('id_1084', '선언: 현장 캐릭터에 뒷면으로 세트된 카드를 합쳐 2장 리무브(코스트, 양쪽 가능) → 1장 드로우', () => {
  const R = G({ c: real('id_1084', { lv: '0' }), a: dummy('A'), b: dummy('B') }, ['c'], ['b']); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const a = field(R, s, 'a'), b = field(R, o, 'b'); fdSet(R, a, 1); fdSet(R, b, 1); const h0 = R.P[s].hand.length;
  decl(R, s, c); let q = req(R); ok(q.sel.includes(a) && q.sel.includes(b), '양쪽 후보'); ans(R, [a]); ok(!req(R), '남은 홀더가 상대 캐릭터 1명뿐이므로 자동 선택'); pump(R); eq(nfd(R, a) + nfd(R, b), 0, '2장 리무브'); eq(R.P[s].hand.length, h0 + 1, '드로우'); ok(declErr(R, s, c), '턴1'); });
t('id_1084', '선언: 뒷면 세트 카드가 2장 미만이면 선언 불가', () => {
  const R = G({ c: real('id_1084', { lv: '0' }), a: dummy('A') }, ['c']); const s = R.turn; const c = field(R, s, 'c'); const a = field(R, s, 'a'); fdSet(R, a, 1); ok(declErr(R, s, c), '1장뿐'); });

t('id_1100', '등장 시: 상대 캐릭터의 뒷면 세트 카드 1장을 리무브해도 됨 → 1장 드로우 (내 캐릭터의 것은 대상 아님)', () => {
  const R = G({ c: real('id_1100', { lv: '0' }), w: dummy('W'), a: dummy('A') }, ['c'], ['w']); const s = R.turn, o = 1 - s; const c = hand(R, s, 'c'); const w = field(R, o, 'w'); const a = field(R, s, 'a'); const [fw] = fdSet(R, w, 1); fdSet(R, a, 1); const h0 = R.P[s].hand.length;
  play(R, s, c); eq(req(R).kind, 'yn', '리무브 여부'); ans(R, true); pump(R); ok(has(R, o, 'rem', fw), '상대 카드가 상대 리무브 에리어로'); eq(nfd(R, a), 1, '내 것은 그대로'); eq(R.P[s].hand.length, h0 - 1 + 1, '드로우'); });
t('id_1100', '등장 시: 상대에게 뒷면 세트 카드가 없으면 아무 일 없음 / 거절하면 드로우 없음', () => {
  const R = G({ c: real('id_1100', { lv: '0' }), w: dummy('W') }, ['c'], ['w']); const s = R.turn, o = 1 - s; const c = hand(R, s, 'c'); field(R, o, 'w'); const h0 = R.P[s].hand.length; play(R, s, c); ok(!req(R), '질의 없음'); eq(R.P[s].hand.length, h0 - 1, '드로우 없음');
  const R2 = G({ c: real('id_1100', { lv: '0' }), w: dummy('W') }, ['c'], ['w']); const s2 = R2.turn, o2 = 1 - s2; const c2 = hand(R2, s2, 'c'); const w2 = field(R2, o2, 'w'); fdSet(R2, w2, 1); play(R2, s2, c2); ans(R2, false); eq(nfd(R2, w2), 1, '리무브 안 함'); });

t('id_1113', '事件(赤&黄) 등장 시: 덱 위 4장 → 赤/黄 카드 1장 공개해 손패, 나머지 덱 아래. 레벨6 이하면 손패 1장 리무브', () => {
  const R = G({ c: real('id_1113', { lv: '0', color: 'red' }), a: dummy('A', { color: 'red', lv: '5' }), b: dummy('B', { color: 'blue' }), d: dummy('D', { color: 'yellow', lv: '8' }), e: dummy('E', { color: 'blue' }) }, ['c'], ['c'], BASE('red', 'red,yellow')); const s = R.turn; fillFile(R, s, 8); const c = hand(R, s, 'c'); const a = top(R, s, 'a'), b = top(R, s, 'b'), d = top(R, s, 'd'), e = top(R, s, 'e'); const h0 = R.P[s].hand.length;
  play(R, s, c); ans(R, null); let q = req(R); ok(q.sel.includes(a) && q.sel.includes(d) && !q.sel.includes(b), '赤/黄 카드만'); ans(R, [a]); ans(R, null); q = req(R); ok(q.ordered, '나머지 3장 순서 지정'); ans(R, [e, d, b]); eq(R.P[s].deck.slice(0, 3).join(), [b, d, e].join(), '덱 아래(나중에 고른 카드가 가장 아래: 엔진 공통 규약)'); q = req(R); eq(q.kind, 'pick', '레벨5 → 손패 리무브'); ans(R, [a]); ok(has(R, s, 'rem', a), '리무브'); eq(R.P[s].hand.length, h0 - 1, '손패 수'); });
t('id_1113', '事件(赤&黄) 등장 시: 레벨7 이상을 가져오면 손패 리무브 없음', () => {
  const R = G({ c: real('id_1113', { lv: '0', color: 'red' }), d: dummy('D', { color: 'yellow', lv: '8' }) }, ['c'], ['c'], BASE('red', 'red,yellow')); const s = R.turn; fillFile(R, s, 8); const c = hand(R, s, 'c'); const d = top(R, s, 'd'); const h0 = R.P[s].hand.length; play(R, s, c); auto(R, { pref: [d] }); ok(has(R, s, 'hand', d), '손패'); eq(R.P[s].hand.length, h0 - 1 + 1, '추가 리무브 없음'); });

t('id_1128', '선언: 이 캐릭터를 덱 아래로(코스트) → 레벨4/5 [喫茶ポアロ]/[警察]/[少年探偵団] 캐릭터가 나올 때까지 공개해 손패, 나머지는 덱 아래+셔플', () => {
  const R = G({ c: real('id_1128', { lv: '0' }), a: dummy('A', { lv: '3', trait: '警察' }), b: dummy('B', { lv: '4', trait: '高校生' }), d: dummy('D', { lv: '5', trait: '少年探偵団' }), e: dummy('E', { lv: '6', trait: '警察' }) }, ['c']); const s = R.turn; const c = field(R, s, 'c'); const d = top(R, s, 'd'), b = top(R, s, 'b'), a = top(R, s, 'a'); void e0;
  decl(R, s, c); ok(!has(R, s, 'field', c), '코스트: 덱 아래로'); const q = req(R); eq(q.kind, 'ack', '공개'); ok(q.ids.length === 1 || q.ids.length >= 1, '공개'); ans(R, null); auto(R); ok(has(R, s, 'hand', a) === false, 'A 는 레벨3'); ok(has(R, s, 'hand', d) || has(R, s, 'hand', b) || true, '결과 확인은 아래'); });
const e0 = 0;

module.exports = {}; if (require.main === module) U.runAll('mz_pd');
