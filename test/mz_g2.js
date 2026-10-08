process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
// g2 묶음 검증: 다단계 이벤트/모달 선택/덱 공개·탐색/능력 부여 카드를 실제 DB 의 ab 로 실제 엔진에서 실행한다.
//  실행: CARDS_DB=/tmp/aud/g2.json node test/mz_g2.js
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, pa, play, auto, ok, eq, has, req, ans, fillFile, pump, give, S, FX, act, top, evid, endTurn } = U;
const BS = (c, extra = {}) => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3', ...extra } });
const mk = (defs, l0, l1, base) => { const R = G(defs, l0, l1, base); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
// 불법 응답은 서버가 거절해야 한다(질의는 그대로 남는다)
const refuse = (R, v, why) => { const q = R.eff && R.eff.req; ok(q, '질의가 와야 함'); const e = act(R, q.who, { a: 'ans', v }); ok(e, (why || '불법 응답') + ': 거절되어야 함'); ok(R.eff && R.eff.req === q, '질의 유지'); return e; };
const CUT = (n, color, lv, extra = {}) => ({ n, type: 'char', color, lv: String(lv), ap: '1000', lp: '1', kw: 'cutin:1000', ab: [{ ic: 'cutin', v: 1000 }], ...extra });
const logs = R => R.log.join('\n');
const viewStr = (R, s) => JSON.stringify(S.view(R, s));
const sameSet = (a, b, m) => eq(JSON.stringify(a.slice().sort((x, y) => x - y)), JSON.stringify(b.slice().sort((x, y) => x - y)), m);
const declare = (R, s, id, lab) => { const ab = R.defs[R.cards[id].d].ab, i = ab.findIndex(a => a.ic === 'declare'); const e = FX.declareCheck(R, s, id, i); if (e) return e; const r = FX.declare(R, s, id, i); pump(R); return r || ''; };

t('id_0382', '리무브 에리어의 컷인 黒 Lv6↓ 2장까지 손패 → 손패의 컷인 黒 Lv6↓ 1장 등장 + 突撃[キャラ](턴 종료까지) / 불법 대상 거절', () => {
  const R = mk({ e: real('id_0382', { color: 'black', lv: '0' }), a: CUT('A', 'black', 5), b: CUT('B', 'black', 6), c7: CUT('C7', 'black', 7), d: dummy('D', { color: 'black', lv: '3' }), bl: CUT('BL', 'blue', 3), x: CUT('X', 'black', 4), hx: CUT('HX', 'black', 7) }, ['e', 'x'], ['x'], BS('black'));
  const s = R.turn, e = hand(R, s, 'e'), x = hand(R, s, 'x'), hx = hand(R, s, 'hx'); const a = rem(R, s, 'a'), b = rem(R, s, 'b'), c7 = rem(R, s, 'c7'), d = rem(R, s, 'd'), bl = rem(R, s, 'bl');
  play(R, s, e); let q = req(R); eq(q.kind, 'pick', '리무브 에리어에서 고르기'); sameSet(q.sel, [a, b], '합법: 컷인 黒 Lv6 이하만'); eq(q.max, 2, '2장까지');
  refuse(R, [c7], 'Lv7'); refuse(R, [d], '컷인 없음'); refuse(R, [bl], '청색'); refuse(R, [a, b, c7], '3장');
  ans(R, [a, b]); ok(has(R, s, 'hand', a) && has(R, s, 'hand', b) && has(R, s, 'rem', c7), '2장 손패로');
  q = req(R); eq(q.kind, 'pick', '손패에서 등장'); sameSet(q.sel, [a, b, x], '손패의 컷인 黒 Lv6 이하(방금 가져온 카드 포함, Lv7 제외)'); refuse(R, [hx], 'Lv7 손패');
  ans(R, [b]); pump(R); ok(has(R, s, 'field', b), '등장'); ok(R.cards[b].tkw.includes('assault-char'), '突撃[キャラ] 부여'); ok(!R.cards[b].tkw.includes('assault-case'), '事件에는 突撃 아님');
  eq(FX.hasKwTk(R, b, 'assault'), true, '突撃 보유');
  endTurn(R); auto(R); eq(R.cards[b].tkw, '', '턴 종료 시 突撃 소멸'); });
t('id_0382', '손패에 등장시킬 카드가 없으면 등장은 건너뛴다(강제 아님) / 2장까지 중 0장 선택 가능', () => {
  const R = mk({ e: real('id_0382', { color: 'black', lv: '0' }), a: CUT('A', 'black', 5) }, ['e'], ['e'], BS('black')); const s = R.turn, e = hand(R, s, 'e'); const a = rem(R, s, 'a');
  play(R, s, e); ans(R, []); ok(has(R, s, 'rem', a), '선택하지 않으면 그대로'); const q = req(R); ok(!q || q.kind === 'pick', '등장 후보 없음이면 질의 자체 없음'); });

// 손패를 비우고(덱 아래로) 원하는 카드만 손패에 둔다
const clearHand = (R, s) => { R.P[s].deck.unshift(...R.P[s].hand.splice(0)); };
const W = (n, extra = {}) => dummy(n, { color: 'white', ...extra });

t('id_0783', '파트너(白) 3택1 — 각 선택지의 합법 대상만 / 불법 대상 거절 / 효과 결과 / 턴 종료 시 소멸', () => {
  const mkr = (names = []) => { const defs = { e: real('id_0783', { color: 'white', lv: '0' }), w1: W('W1', { ap: '3000' }), w2: W('W2'), bl: dummy('BL'), sl: W('SL', { lv: '7' }), s8: W('S8', { lv: '8' }), ac: W('AC', { lv: '3' }) };
    names.forEach((n, i) => { defs['n' + i] = W(n); }); return mk(defs, ['e'], ['e'], BS('white')); };
  let R = mkr(); let s = R.turn, o = 1 - s; const w1 = field(R, s, 'w1'), bl = field(R, s, 'bl'); const sl = field(R, o, 'sl', 's'), s8 = field(R, o, 's8', 's'), ac = field(R, o, 'ac', 'a'); const e = hand(R, s, 'e');
  play(R, s, e); let q = req(R); eq(q.kind, 'opt', '3택1 은 opt 질의'); eq(q.labels.length, 3, '선택지 3개'); ans(R, 0); q = req(R); eq(q.kind, 'pick', '대상 선택');
  ok(q.sel.includes(w1) && q.sel.includes(sl) && !q.sel.includes(bl), '【白】 캐릭터만(양측 현장)'); refuse(R, [bl], '청색 캐릭터'); ans(R, [w1]); pump(R);
  eq(R.cards[w1].apm, 2000, 'AP+2000'); ok(FX.hasKwTk(R, w1, 'assault'), '突撃'); eq(R.cards[sl].st, 's', '다른 선택지는 실행 안 됨'); eq(R.eff, null, '질의 종료');
  endTurn(R); auto(R); eq(R.cards[w1].apm, 0, '턴 종료 시 AP 소멸'); eq(R.cards[w1].tkw, '', '突撃 소멸');
  // 선택지 2: Lv7 이하 슬립 → 스턴
  R = mkr(); s = R.turn; o = 1 - s; const sl2 = field(R, o, 'sl', 's'), s82 = field(R, o, 's8', 's'), ac2 = field(R, o, 'ac', 'a'); const e2 = hand(R, s, 'e'); play(R, s, e2); ans(R, 1); q = req(R);
  sameSet(q.sel, [sl2], 'Lv7 이하의 슬립 상태만(Lv8·액티브 제외)'); refuse(R, [s82], 'Lv8'); refuse(R, [ac2], '액티브'); ans(R, [sl2]); pump(R); eq(R.cards[sl2].st, 'x', '스턴'); eq(R.cards[s82].st, 's', 'Lv8 그대로');
  // 선택지 3: 상대 현장의 액티브 캐릭터 지정 액션 가능(턴 종료까지)
  R = mkr(); s = R.turn; o = 1 - s; const w3 = field(R, s, 'w1'); const ac3 = field(R, o, 'ac', 'a'); const e3 = hand(R, s, 'e'); play(R, s, e3); ans(R, 2); q = req(R); ok(q.sel.includes(w3), '【白】 캐릭터'); ans(R, [w3]); pump(R);
  ok(FX.hasKwTk(R, w3, 'actactive'), '액티브 지정 가능 키워드'); eq(act(R, s, { a: 'action', id: w3, k: 'char', tid: ac3 }), undefined, '액티브 상태의 상대 캐릭터를 지정해 액션 가능'); });
t('id_0783', '黒羽快斗와 中森青子가 모두 현장에 있으면 3개 모두(질의 없이 위에서부터) / 한 명뿐이면 3택1 / 파트너 색 불일치면 불발', () => {
  const mkr = (names, pc = 'white') => { const defs = { e: real('id_0783', { color: 'white', lv: '0' }), w1: W('W1'), sl: W('SL', { lv: '3' }) }; names.forEach((n, i) => { defs['n' + i] = W(n); });
    return mk(defs, ['e'], ['e'], { p: { n: 'P', type: 'partner', color: pc, lp: '1' }, k: { n: 'K', type: 'case', color: 'white', lv: '2', lv2: '3' } }); };
  let R = mkr(['黒羽快斗', '中森青子']); let s = R.turn, o = 1 - s; const n0 = field(R, s, 'n0'), n1 = field(R, s, 'n1'); const sl = field(R, o, 'sl', 's'); const e = hand(R, s, 'e'); play(R, s, e);
  let q = req(R); eq(q.kind, 'pick', '질의 없이 첫 효과 대상 선택(opt 없음)'); ans(R, [n0]); q = req(R); eq(q.kind, 'pick', '두 번째'); sameSet(q.sel, [sl], '슬립 대상'); ans(R, [sl]); q = req(R); eq(q.kind, 'pick', '세 번째'); ans(R, [n1]); pump(R);
  eq(R.cards[n0].apm, 2000, '①'); eq(R.cards[sl].st, 'x', '②'); ok(FX.hasKwTk(R, n1, 'actactive'), '③');
  R = mkr(['黒羽快斗']); s = R.turn; field(R, s, 'n0'); const e2 = hand(R, s, 'e'); play(R, s, e2); eq(req(R).kind, 'opt', '한 명뿐: 3택1');
  R = mkr(['黒羽快斗', '中森青子'], 'red'); s = R.turn; field(R, s, 'n0'); field(R, s, 'n1'); const e3 = hand(R, s, 'e'); play(R, s, e3); ok(!R.eff, '파트너 색 불일치: 효과 없음'); });

t('id_0805', '파트너(赤) 2택1 — ① 손패 2장이 될 때까지 리무브 → 레벨 합계 이하 캐릭터 2장까지 리무브(합계 초과 거절)', () => {
  const R = mk({ e: real('id_0805', { color: 'red', lv: '0' }), h1: dummy('H1', { color: 'red', lv: '3' }), h2: dummy('H2', { color: 'red', lv: '2' }), h3: dummy('H3', { color: 'red', lv: '4' }), h4: dummy('H4', { color: 'red', lv: '0' }),
    c1: dummy('C1', { color: 'red', lv: '4' }), c2: dummy('C2', { color: 'red', lv: '3' }), c3: dummy('C3', { color: 'red', lv: '5' }) }, ['e'], ['e'], BS('red'));
  const s = R.turn, o = 1 - s; clearHand(R, s); const e = hand(R, s, 'e'); const h1 = hand(R, s, 'h1'), h2 = hand(R, s, 'h2'), h3 = hand(R, s, 'h3'), h4 = hand(R, s, 'h4');
  const c1 = field(R, s, 'c1'), c2 = field(R, o, 'c2'), c3 = field(R, o, 'c3'); play(R, s, e); eq(req(R).kind, 'opt', '2택1'); ans(R, 0);
  let q = req(R); eq(q.kind, 'pick', '손패 리무브'); eq(q.min, 2, '손패 4장 → 2장이 될 때까지 = 정확히 2장'); eq(q.max, 2, '정확히 2장'); refuse(R, [h1], '1장'); refuse(R, [h1, h2, h3], '3장'); ans(R, [h1, h3]);
  ok(has(R, s, 'rem', h1) && has(R, s, 'rem', h3), '리무브'); eq(R.P[s].hand.length, 2, '손패 2장'); q = req(R); eq(q.kind, 'pick', '캐릭터 선택'); eq(q.sumLv, 7, '리무브한 카드(Lv3+Lv4)의 레벨 합계');
  refuse(R, [c1, c3], 'Lv4+Lv5=9 > 7'); refuse(R, [c1, c2, c3], '3장'); ans(R, [c1, c2]); pump(R); ok(has(R, s, 'rem', c1) && has(R, o, 'rem', c2), '합계 7 이하 2장 리무브'); ok(has(R, o, 'field', c3), 'c3 그대로'); });
t('id_0805', '② 손패를 모두 리무브하고 4장 드로우, 이번 턴 상대는 컷인/변장 불가(다음 턴에 해제) / 파트너 색 불일치면 불발', () => {
  const R = mk({ e: real('id_0805', { color: 'red', lv: '0' }), h1: dummy('H1', { color: 'red' }), h2: dummy('H2', { color: 'red' }), a: dummy('A', { color: 'red', ap: '1000' }), d: dummy('D', { color: 'red', ap: '1000' }), x: CUT('X', 'red', 3), z: CUT('Z', 'red', 3) }, ['e'], ['x'], BS('red'));
  const s = R.turn, o = 1 - s; clearHand(R, s); const e = hand(R, s, 'e'), h1 = hand(R, s, 'h1'), h2 = hand(R, s, 'h2'); const a = field(R, s, 'a'), d = field(R, o, 'd', 's'); const x = hand(R, o, 'x'); const dk = R.P[s].deck.length;
  play(R, s, e); ans(R, 1); pump(R); ok(has(R, s, 'rem', h1) && has(R, s, 'rem', h2), '손패 전부 리무브'); eq(R.P[s].hand.length, 4, '4장 드로우'); eq(R.P[s].deck.length, dk - 4, '덱 -4');
  ok(FX.pk(R, s, 'nocutin') && FX.pk(R, s, 'nodisguise'), '상대 컷인/변장 불가 플래그');
  U.toContact(R, s, a, d); const e1 = act(R, o, { a: 'cin', id: x }); ok(e1 && /컷인/.test(e1), '상대는 컷인 사용 불가: ' + e1); U.finishContact(R, []);
  endTurn(R); auto(R); ok(!FX.pk(R, s, 'nocutin'), '다음 턴에 해제'); });
t('id_0805', '② 손패가 0장이어도 4장 드로우 / 파트너 색 불일치면 아무 일도 없다', () => {
  const R = mk({ e: real('id_0805', { color: 'red', lv: '0' }) }, ['e'], ['e'], { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } });
  const s = R.turn; clearHand(R, s); const e = hand(R, s, 'e'); play(R, s, e); ok(!R.eff, '파트너 색(청) 불일치: 선택 질의 없음'); eq(R.P[s].hand.length, 0, '손패 변화 없음'); });

t('id_0829', '登場時: 컷인 黒 카드를 원하는 장수(0장 포함) 리무브 → 같은 장수 드로우 / 불법 카드 거절', () => {
  const mkr = () => mk({ c: real('id_0829', { color: 'black', lv: '0' }), a: CUT('A', 'black', 3), b: CUT('B', 'black', 6), bl: CUT('BL', 'blue', 3), pl: dummy('P', { color: 'black' }) }, ['c'], ['c'], BS('black'));
  let R = mkr(); let s = R.turn; clearHand(R, s); const c = hand(R, s, 'c'), a = hand(R, s, 'a'), b = hand(R, s, 'b'), bl = hand(R, s, 'bl'), p = hand(R, s, 'pl'); play(R, s, c);
  let q = req(R); eq(q.kind, 'pick', '선택 질의'); sameSet(q.sel, [a, b], '컷인을 가진 黒 카드만'); eq(q.min, 0, '0장 허용'); refuse(R, [bl], '청색'); refuse(R, [p], '컷인 없음'); ans(R, [a, b]); pump(R);
  ok(has(R, s, 'rem', a) && has(R, s, 'rem', b), '리무브'); eq(R.P[s].hand.length, 2 + 2 - 0, '손패: 남은 2장 + 드로우 2장'); 
  R = mkr(); s = R.turn; clearHand(R, s); const c2 = hand(R, s, 'c'); hand(R, s, 'a'); play(R, s, c2); ans(R, []); pump(R); eq(R.P[s].hand.length, 1, '0장 리무브: 드로우 없음');
  R = mkr(); s = R.turn; clearHand(R, s); const c3 = hand(R, s, 'c'); const a3 = hand(R, s, 'a'); play(R, s, c3); ans(R, [a3]); pump(R); eq(R.P[s].hand.length, 1, '1장 리무브 → 1장 드로우'); });

t('id_0831', '파트너 黒: 캐릭터 1장 리무브 → 캐릭터 1장 突撃 → 양측 현장 캐릭터 1장당 덱 위 2장 리무브', () => {
  const R = mk({ e: real('id_0831', { color: 'black', lv: '0' }), a: dummy('A', { color: 'black' }), a2: dummy('A2', { color: 'black' }), b: dummy('B', { color: 'black' }) }, ['e'], ['e'], BS('black'));
  const s = R.turn, o = 1 - s; const a = field(R, s, 'a'), a2 = field(R, s, 'a2'), b = field(R, o, 'b'); const e = hand(R, s, 'e'); const dk = R.P[s].deck.length, rm = R.P[s].rem.length;
  play(R, s, e); let q = req(R); eq(q.kind, 'pick', '리무브 대상'); sameSet(q.sel, [a, a2, b], '양측 현장의 캐릭터'); ans(R, [b]); ok(has(R, o, 'rem', b), '리무브'); q = req(R); eq(q.kind, 'pick', '突撃 대상'); refuse(R, [b], '이미 리무브된 캐릭터'); ans(R, [a]); pump(R);
  ok(FX.hasKwTk(R, a, 'assault'), '突撃'); eq(R.P[s].deck.length, dk - 4, '남은 현장 캐릭터 2장 × 2 = 덱 위 4장 리무브'); ok(R.P[s].rem.length >= rm + 4, '리무브 에리어 증가');
  endTurn(R); auto(R); eq(R.cards[a].tkw, '', '턴 종료 시 突撃 소멸'); });
t('id_0831', '파트너 색 불일치면 불발 / 아무것도 선택하지 않아도(1枚まで) 덱 리무브는 처리', () => {
  let R = mk({ e: real('id_0831', { color: 'black', lv: '0' }) }, ['e'], ['e'], { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'black', lv: '2', lv2: '3' } }); let s = R.turn; const e = hand(R, s, 'e'); play(R, s, e); ok(!R.eff, '불발');
  R = mk({ e: real('id_0831', { color: 'black', lv: '0' }), a: dummy('A', { color: 'black' }) }, ['e'], ['e'], BS('black')); s = R.turn; field(R, s, 'a'); const e2 = hand(R, s, 'e'); const dk = R.P[s].deck.length; play(R, s, e2); ans(R, []); ans(R, []); pump(R); eq(R.P[s].deck.length, dk - 2, '현장 1장 → 덱 2장'); });

// 질의를 fn(q) 의 답으로 끝까지 진행한다(fn 이 undefined 를 돌려주면 기본 응답: ack→null, yn→예, pick→최소 장수, opt→0)
const drive = (R, fn = () => undefined) => { let g = 0; const seen = []; while (R.eff && g++ < 60) { const q = req(R); seen.push(q.kind); let a = fn(q);
  if (a === undefined) a = q.kind === 'ack' ? null : q.kind === 'yn' ? true : q.kind === 'pick' ? (q.ordered ? q.ids : q.sel.slice(0, q.min)) : q.kind === 'opt' ? 0 : q.kind === 'optm' ? [] : 'x'; ans(R, a); } return seen; };
const KID = n => dummy(n, { color: 'blue', trait: '少年探偵団', lv: '3' });

t('id_0964', 'FILE 위 1장 + 현장의 [結成 少年探偵団] 리무브(해도 된다) → 이름이 다른 少年探偵団 Lv4↓ 5장까지 슬립 등장 → 5장이면 캐릭터 1장 리무브 / 넥스트 힌트 불가', () => {
  const defs = { e: real('id_0964', { color: 'blue', lv: '0' }), kn: dummy('結成 少年探偵団', { color: 'blue' }), r1: KID('R1'), r1b: KID('R1'), r2: KID('R2'), r3: KID('R3'), r4: KID('R4'), r5: KID('R5'), r6: KID('R6'), big: KID('BIG'), no: dummy('NO', { color: 'blue', lv: '1' }), v: dummy('V', { color: 'blue' }) };
  defs.big.lv = '5'; const R = mk(defs, ['e'], ['e'], BS('blue')); const s = R.turn, o = 1 - s; const kn = field(R, s, 'kn'); const v = field(R, o, 'v'); const e = hand(R, s, 'e');
  const rs = ['r1', 'r1b', 'r2', 'r3', 'r4', 'r5', 'r6', 'big', 'no'].map(k => rem(R, s, k)); const [r1, r1b, r2, r3, r4, r5, r6, big, no] = rs; const f0 = R.P[s].file.length;
  play(R, s, e); let q = req(R); eq(q.kind, 'yn', '코스트 지불 확인'); ans(R, true); ok(has(R, s, 'rem', kn), '[結成 少年探偵団] 리무브'); eq(R.P[s].file.length, f0 - 1, 'FILE 위 1장 리무브');
  q = req(R); eq(q.kind, 'pick', '등장'); eq(q.max, 5, '5장까지'); ok(q.distinct, '이름이 서로 달라야 함'); sameSet(q.sel, [r1, r1b, r2, r3, r4, r5, r6], 'Lv4 이하 少年探偵団만(Lv5·특징 없음 제외)');
  refuse(R, [big], 'Lv5'); refuse(R, [no], '특징 없음'); refuse(R, [r1, r1b], '같은 카드명'); ans(R, [r1, r2, r3, r4, r5]); ok(R.cards[r1].st === 's' && R.cards[r5].st === 's', '슬립 상태 등장');
  q = req(R); eq(q.kind, 'pick', '5장 등장했으므로 캐릭터 1장 리무브'); ok(q.sel.includes(v), '상대 캐릭터 포함'); ans(R, [v]); pump(R); ok(has(R, o, 'rem', v), '리무브'); ok(R.fl.nh, '이번 턴 넥스트 힌트 불가'); });
t('id_0964', '4장 이하 등장 시 추가 리무브 없음 / 코스트를 내지 않으면 등장 없음(넥스트 힌트 불가는 유지) / 현장에 [結成 少年探偵団]이 없으면 질의 없음', () => {
  const mkr = (withKn = true) => { const R = mk({ e: real('id_0964', { color: 'blue', lv: '0' }), kn: dummy('結成 少年探偵団', { color: 'blue' }), r1: KID('R1'), r2: KID('R2'), r3: KID('R3'), v: dummy('V', { color: 'blue' }) }, ['e'], ['e'], BS('blue')); const s = R.turn;
    const kn = withKn ? field(R, s, 'kn') : null; rem(R, s, 'r1'); rem(R, s, 'r2'); rem(R, s, 'r3'); field(R, 1 - s, 'v'); return { R, s, kn, e: hand(R, s, 'e') }; };
  let { R, s, e } = mkr(); play(R, s, e); ans(R, true); let q = req(R); eq(q.kind, 'pick', '등장'); ans(R, q.sel.slice(0, 3)); pump(R); ok(!R.eff, '3장 등장: 캐릭터 리무브 선택 없음'); eq(R.P[s].field.length, 3, '3장 등장'); ok(R.fl.nh, '넥스트 힌트 불가');
  let kn; ({ R, s, kn, e } = mkr()); play(R, s, e); ans(R, false); ok(!R.eff, '거절: 추가 질의 없음'); ok(has(R, s, 'field', kn) && R.P[s].field.length === 1, '등장 없음'); ok(R.fl.nh, '넥스트 힌트 불가는 별도 문장이므로 유지');
  ({ R, s, e } = mkr(false)); play(R, s, e); ok(!R.eff, '[結成 少年探偵団]이 없으면 코스트 지불 불가 → 질의 없음'); eq(R.P[s].field.length, 0, '등장 없음'); });

t('id_0977', '解決編: 덱 위 4장 공개 → 高校生 Lv6↓ 1장 등장 → FILE 위 1장 리무브로 3회까지 반복 → 남은 공개 카드 덱 아래(원하는 순서)', () => {
  const HS = (n, lv) => dummy(n, { color: 'green', trait: '高校生', lv: String(lv) });
  const R = mk({ e: real('id_0977', { color: 'green', lv: '0' }), h1: HS('H1', 5), x: dummy('X', { color: 'green', lv: '1' }) }, ['e'], ['e'], BS('green')); const s = R.turn; const e = hand(R, s, 'e'); const dd1 = top(R, s, 'h1'); const dl0 = R.P[s].deck.length;
  play(R, s, e); ok(!R.eff, '해결편 전에는 사용 조건 미충족(공개 없음)'); eq(R.P[s].deck.length, dl0, '덱 변화 없음'); ok(!has(R, s, 'field', dd1), '등장 없음');
  const R2 = mk({ e: real('id_0977', { color: 'green', lv: '0' }), h1: HS('H1', 5), h2: HS('H2', 7), h3: HS('H3', 3), x: dummy('X', { color: 'green', lv: '1' }), h4: HS('H4', 2) }, ['e'], ['e'], BS('green')); const s2 = R2.turn;
  U.solve(R2, s2); const e3 = hand(R2, s2, 'e'); const d4 = top(R2, s2, 'h4'); const dx = top(R2, s2, 'x'), d3 = top(R2, s2, 'h3'), d2 = top(R2, s2, 'h2'), d1 = top(R2, s2, 'h1'); const ff = R2.P[s2].file.length; const dl = R2.P[s2].deck.length;
  play(R2, s2, e3); let q = req(R2); eq(q.kind, 'ack', '본인 확인'); eq(q.who, s2, '본인'); sameSet(q.ids, [d1, d2, d3, dx], '위 4장'); ans(R2, null); q = req(R2); eq(q.kind, 'ack', '상대에게도 공개'); eq(q.who, 1 - s2, '상대'); ans(R2, null);
  q = req(R2); eq(q.kind, 'pick', '1장 등장'); sameSet(q.sel, [d1, d3], '高校生 Lv6 이하만(Lv7·특징 없음 제외)'); refuse(R2, [d2], 'Lv7'); refuse(R2, [dx], '특징 없음'); ans(R2, [d1]); ok(has(R2, s2, 'field', d1), '등장');
  q = req(R2); eq(q.kind, 'yn', '반복 확인(1/3)'); ans(R2, true); eq(R2.P[s2].file.length, ff - 1, 'FILE 위 1장 리무브'); q = req(R2); eq(q.kind, 'pick', '2번째 등장'); sameSet(q.sel, [d3], '남은 공개 카드 중에서'); ans(R2, [d3]);
  q = req(R2); eq(q.kind, 'yn', '반복 확인(2/3)'); ans(R2, false); q = req(R2); eq(q.kind, 'pick', '남은 카드를 덱 아래로 — 순서 지정'); ok(q.ordered, '순서 지정'); sameSet(q.ids, [d2, dx], '남은 공개 카드'); ans(R2, [dx, d2]); pump(R2);
  eq(R2.P[s2].deck.length, dl - 2, '덱: 등장한 2장 감소'); const bot = R2.P[s2].deck.slice(0, 2); sameSet(bot, [d2, dx], '남은 2장이 덱 아래'); ok(has(R2, s2, 'field', d3), '두 번째 등장'); });
t('id_0977', '반복은 3회까지 / FILE 이 부족하면 더 못 한다', () => {
  const HS = (n, lv) => dummy(n, { color: 'green', trait: '高校生', lv: String(lv) });
  const R = mk({ e: real('id_0977', { color: 'green', lv: '0' }), h1: HS('H1', 1), h2: HS('H2', 1), h3: HS('H3', 1), h4: HS('H4', 1), h5: HS('H5', 1) }, ['e'], ['e'], BS('green')); const s = R.turn; U.solve(R, s); const e = hand(R, s, 'e');
  ['h5', 'h4', 'h3', 'h2', 'h1'].forEach(k => top(R, s, k)); const f0 = R.P[s].file.length; play(R, s, e); const seen = drive(R, q => q.kind === 'pick' ? q.sel.slice(0, q.max) : undefined); eq(seen.filter(k => k === 'yn').length, 3, '반복 확인은 3번'); eq(R.P[s].field.length, 4, '1 + 3회 = 4장 등장'); eq(R.P[s].file.length, f0 - 3, 'FILE 3장 리무브'); });

t('id_0990', '추리/액션했을 때 2택1: ① 리무브 에리어의 Lv4↓ 青/白 캐릭터 등장(합법 대상·불법 거절)', () => {
  const mkr = () => mk({ c: real('id_0990', { color: 'white', lv: '0' }), a: dummy('A', { color: 'blue', lv: '4' }), b: dummy('B', { color: 'white', lv: '2' }), r: dummy('R', { color: 'red', lv: '2' }), big: dummy('BIG', { color: 'blue', lv: '5' }), d: dummy('D', { color: 'white' }) }, ['c'], ['c'], BS('white'));
  for (const how of ['reason', 'action']) { const R = mkr(); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const a = rem(R, s, 'a'), b = rem(R, s, 'b'), r = rem(R, s, 'r'), big = rem(R, s, 'big'); const d = field(R, o, 'd', 's');
    if (how === 'reason') { eq(act(R, s, { a: 'reason', who: c }), undefined, '추리'); if (R.sub) U.endContact(R); } else { U.attack(R, c, d); }
    let q = req(R); ok(q, how + ': 효과 질의'); eq(q.kind, 'opt', '2택1'); ans(R, 0); q = req(R); eq(q.kind, 'pick', '등장 선택'); sameSet(q.sel, [a, b], 'Lv4 이하의 青/白만'); refuse(R, [r], '적색'); refuse(R, [big], 'Lv5'); ans(R, [a]); ok(has(R, s, 'field', a), how + ': 등장'); } });
t('id_0990', '② 파트너 에리어에 색 2개 이상의 MR이 있으면 캐릭터 스턴 + 1장 드로우 / 없으면 아무 일 없음', () => {
  const mkr = (mr) => { const R = mk({ c: real('id_0990', { color: 'white', lv: '0' }), mr: dummy('MR', { color: 'blue/white', ab: [{ ic: 'mr' }] }), mr1: dummy('MR1', { color: 'blue', ab: [{ ic: 'mr' }] }), d: dummy('D', { color: 'white' }) }, ['c'], ['c'], BS('white')); const s = R.turn;
    const c = field(R, s, 'c'); if (mr) pa(R, s, mr); const d = field(R, 1 - s, 'd', 's'); U.attack(R, c, d); return { R, s, c, d }; };
  let { R, s, d } = mkr('mr'); let q = req(R); eq(q.kind, 'opt', '2택1'); const h0 = R.P[s].hand.length; ans(R, 1); q = req(R); eq(q.kind, 'pick', '대상'); ok(q.sel.includes(d), '대상'); ans(R, [d]); pump(R); eq(R.cards[d].st, 'x', '스턴'); eq(R.P[s].hand.length, h0 + 1, '1장 드로우');
  ({ R, s, d } = mkr('mr1')); ans(R, 1); pump(R); ok(!R.eff, '색 1개의 MR: 불발'); eq(R.cards[d].st, 's', '변화 없음'); ({ R, s, d } = mkr(null)); const h1 = R.P[s].hand.length; ans(R, 1); pump(R); ok(!R.eff, 'MR 없음: 불발'); eq(R.P[s].hand.length, h1, '드로우 없음'); });

t('id_1044', '【事件犯人】 파트너 슬립 + 손패 1장 + FILE 2장 리무브(해도 된다) → 레벨이 모두 다른 犯人 Lv8↓ 5장까지 등장 / 넥스트 힌트 불가', () => {
  const CR = (n, lv) => dummy(n, { color: 'black', trait: '犯人', lv: String(lv) });
  const R = mk({ e: real('id_1044', { color: 'black', lv: '0' }), c1: CR('C1', 1), c2: CR('C2', 2), c3: CR('C3', 3), c3b: CR('C3B', 3), c5: CR('C5', 5), c8: CR('C8', 8), c9: CR('C9', 9), c4: CR('C4', 4), no: dummy('NO', { color: 'black', lv: '6' }), hh: dummy('HH', { color: 'black' }) }, ['e'], ['e'], BS('black', { trait: '犯人' }));
  const s = R.turn; clearHand(R, s); const e = hand(R, s, 'e'), hh = hand(R, s, 'hh'); const rs = ['c1', 'c2', 'c3', 'c3b', 'c4', 'c5', 'c8', 'c9', 'no'].map(k => rem(R, s, k)); const [c1, c2, c3, c3b, c4, c5, c8, c9, no] = rs; const f0 = R.P[s].file.length;
  play(R, s, e); let q = req(R); eq(q.kind, 'yn', '코스트 확인'); ans(R, true); eq(R.cards[R.P[s].partner].st, 's', '파트너 슬립'); ok(has(R, s, 'rem', hh), '손패 1장 리무브'); eq(R.P[s].file.length, f0 - 2, 'FILE 2장 리무브');
  q = req(R); eq(q.kind, 'pick', '등장'); ok(q.dlv, '레벨이 서로 달라야 함'); eq(q.max, 5, '5장까지'); sameSet(q.sel, [c1, c2, c3, c3b, c4, c5, c8], '犯人 Lv8 이하'); refuse(R, [c9], 'Lv9'); refuse(R, [no], '犯人 아님'); refuse(R, [c3, c3b], '같은 레벨');
  ans(R, [c1, c2, c3, c4, c8]); pump(R); eq(R.P[s].field.length, 5, '5장 등장'); ok(R.cards[c8].st === 'a', '통상 상태로 등장'); ok(R.fl.nh, '넥스트 힌트 불가'); });
t('id_1044', '사건에 特徴[犯人]이 없으면 사용 불가 / 코스트를 내지 않으면 등장 없음(넥스트 힌트 불가는 유지) / 파트너가 슬립이면 코스트 불가', () => {
  const mkr = (kex, slept) => { const R = mk({ e: real('id_1044', { color: 'black', lv: '0' }), c1: dummy('C1', { color: 'black', trait: '犯人', lv: '1' }), hh: dummy('HH', { color: 'black' }) }, ['e'], ['e'], BS('black', kex)); const s = R.turn; clearHand(R, s); const e = hand(R, s, 'e'); hand(R, s, 'hh'); rem(R, s, 'c1'); if (slept) R.cards[R.P[s].partner].st = 's'; return { R, s, e }; };
  let { R, s, e } = mkr({}); play(R, s, e); ok(!R.eff, '犯人 사건이 아니면 효과 없음'); ok(!R.fl.nh, '넥스트 힌트 가능(능력 자체가 불발)');
  ({ R, s, e } = mkr({ trait: '犯人' })); play(R, s, e); ans(R, false); ok(!R.eff, '거절'); eq(R.P[s].field.length, 0, '등장 없음'); eq(R.cards[R.P[s].partner].st, 'a', '파트너 슬립 안 됨'); ok(R.fl.nh, '넥스트 힌트 불가');
  ({ R, s, e } = mkr({ trait: '犯人' }, true)); play(R, s, e); ok(!R.eff, '파트너가 이미 슬립: 코스트 불가라 질의 없음'); eq(R.P[s].field.length, 0, '등장 없음'); });

const toEff = R => { let g = 0; while (!R.eff && R.sub && g++ < 12) { const e = act(R, R.sub.who, { a: 'pass' }); if (e) throw new Error('pass: ' + e); } pump(R); };

t('id_1046', '자신은 【事件解決】할 수 없다 (같은 조건의 일반 사건에서는 가능) / 상대는 영향 없음', () => {
  const mkr = (kase) => { const R = mk({ f: dummy('F', { color: 'black' }) }, [], [], { p: { n: 'P', type: 'partner', color: 'black', lp: '1' }, k: kase }); const s = R.turn; U.solve(R, s); U.solve(R, 1 - s); return { R, s }; };
  const sc = pk => ({ n: 'K', type: 'case', color: 'black', lv: '0', lv2: '0', ...pk });
  let { R, s } = mkr(real('id_1046', { color: 'black', lv: '0', lv2: '0' })); ok(R.cards[R.P[s].kase].solved, '해결편'); eq(act(R, s, { a: 'solve' }), '카드 효과로 인해 사건 해결을 할 수 없습니다', '사건 해결 불가'); ok(!(S.actsFor(R, s)[R.P[s].partner] || []).some(a => a.k === 'solve'), '해결 행동이 목록에 없음');
  ({ R, s } = mkr(sc({}))); ok((S.actsFor(R, s)[R.P[s].partner] || []).some(a => a.k === 'solve'), '대조군: 일반 사건에서는 해결 가능'); });
t('id_1046', '【解決編】【宣言】【ターン①】덱 전부 리무브(코스트) → 증거 전부 표향 → 犯人 증거 8장 이상이면 상대 패배(7장이면 패배 아님) / 해결편 전·2번째 선언 불가', () => {
  const defs = { f: dummy('F', { color: 'black' }) }; for (let i = 0; i < 9; i++) defs['z' + i] = dummy('Z' + i, { color: 'black', trait: '犯人' });
  const mkr = n => { const R = mk(defs, [], [], { p: { n: 'P', type: 'partner', color: 'black', lp: '1' }, k: real('id_1046', { color: 'black', lv: '0', lv2: '0' }) }); const s = R.turn; for (let i = 0; i < n; i++) { const id = give(R, s, 'z' + i, 'evid'); R.cards[id].up = false; } evid(R, s, 1, false); return { R, s, k: R.P[s].kase }; };
  let { R, s, k } = mkr(8); ok(declare(R, s, k), '해결편 전에는 선언 불가'); U.solve(R, s); const dl = R.P[s].deck.length; const opp0 = R.P[1 - s].evid.length; eq(declare(R, s, k), '', '선언'); auto(R); pump(R);
  ok(R.P[s].evid.every(x => R.cards[x].up), '증거 전부 표향'); eq(R.phase, 'over', '게임 종료'); eq(R.winner, s, '내가 승리(상대 패배)'); ok(dl > 0, '덱이 있었음');
  ({ R, s, k } = mkr(7)); U.solve(R, s); eq(declare(R, s, k), '', '선언'); auto(R); pump(R); ok(R.P[s].evid.every(x => R.cards[x].up), '증거 전부 표향'); eq(R.phase, 'play', '犯人 7장: 승부 안 남'); ok(R.P[s].deck.length > 0, '리프레시로 덱 재구성'); ok(declare(R, s, k), '【ターン①】 두 번째 선언 불가'); });

t('id_1086', '登場時: ヒラメキ(【!】)를 가진 Lv7 緑 이벤트가 나올 때까지 1장씩 공개 → 손패 / 나머지는 덱 아래 → 셔플 / 파트너(緑)면 突撃', () => {
  const EVT = (n, color, lv, bang) => ({ n, type: 'event', color, lv: String(lv), ab: [{ ic: 'flash', bang, ops: [{ op: 'draw', n: 1 }] }] });
  const R = mk({ c: real('id_1086', { color: 'green', lv: '0' }), t: EVT('T', 'green', 7, undefined), nb: { n: 'NB', type: 'event', color: 'green', lv: '7', ab: [] }, l6: EVT('L6', 'green', 6, true), bl: EVT('BL', 'blue', 7, true) }, ['c'], ['c'], BS('green')); const s = R.turn, o = 1 - s;
  const c = hand(R, s, 'c'); const tt = top(R, s, 't'); const bl = top(R, s, 'bl'), l6 = top(R, s, 'l6'), nb = top(R, s, 'nb'); const dl = R.P[s].deck.length, h0 = R.P[s].hand.length;
  play(R, s, c); ok(FX.hasKwTk(R, c, 'assault'), '【パートナー(緑)】 突撃'); let q = req(R); eq(q.kind, 'ack', '공개 확인(본인)'); sameSet(q.ids, [nb, l6, bl, tt], '조건에 맞는 카드가 나올 때까지의 카드 전부'); ans(R, null); q = req(R); eq(q.who, o, '상대에게도 공개'); ans(R, null); pump(R);
  ok(has(R, s, 'hand', tt), '발견한 카드는 손패'); eq(R.P[s].hand.length, h0 - 1 + 1, '손패 +1(등장으로 -1)'); eq(R.P[s].deck.length, dl - 1, '발견한 1장만 덱에서 빠짐'); ok([nb, l6, bl].every(x => has(R, s, 'deck', x)), '나머지는 덱에 있음(아래→셔플)'); ok(!R.eff, '질의 종료'); });
t('id_1086', '해당 카드가 없으면 덱 전부 공개 후 덱 아래 → 셔플(리프레시 발생 안 함)', () => {
  const R = mk({ c: real('id_1086', { color: 'green', lv: '0' }) }, ['c'], ['c'], BS('green')); const s = R.turn, o = 1 - s; const c = hand(R, s, 'c'); const dl = R.P[s].deck.length, rm = R.P[s].rem.length, ev = R.P[o].evid.length, h0 = R.P[s].hand.length;
  play(R, s, c); drive(R); eq(R.P[s].deck.length, dl, '덱 장수 그대로'); eq(R.P[s].rem.length, rm, '리무브 에리어 그대로(리프레시 없음)'); eq(R.P[o].evid.length, ev, '상대 증거 변화 없음'); eq(R.P[s].hand.length, h0 - 1, '손패: 등장한 1장만 감소'); });
t('id_1086', '【解決編】【自分ターン中】【ターン①】증거를 얻었을 때 캐릭터 슬립(기존 규칙 유지)', () => {
  const R = mk({ c: real('id_1086', { color: 'green', lv: '0' }), v: dummy('V', { color: 'green' }) }, ['c'], ['c'], BS('green')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const v = field(R, o, 'v'); U.solve(R, s);
  const ab = R.defs[R.cards[c].d].ab; ok(!JSON.stringify(ab).includes('manual'), 'manual 없음'); ok(ab.some(a => a.ic === 'ontrig' && a.evs.includes('evgain')), '증거 획득 트리거'); });

t('id_1108', '현장의 캐릭터를 원하는 수만큼 선택 → (턴 종료까지) 컨택트했을 때 1장 드로우 + 그 컨택트 중 AP+1000 / 상대 캐릭터는 대상 아님', () => {
  const R = mk({ e: real('id_1108', { color: 'white', lv: '0' }), a: W('A', { ap: '1000' }), b: W('B', { ap: '1000' }), c: W('C'), d: W('D', { ap: '1500' }), d2: W('D2', { ap: '1500' }) }, ['e'], ['e'], BS('white')); const s = R.turn, o = 1 - s;
  const a = field(R, s, 'a'), b = field(R, s, 'b'), c = field(R, s, 'c'); const d = field(R, o, 'd', 's'), d2 = field(R, o, 'd2', 's'); const e = hand(R, s, 'e'); play(R, s, e); let q = req(R); eq(q.kind, 'pick', '선택'); sameSet(q.sel, [a, b, c], '내 현장만'); ok(q.max >= 3, '원하는 수만큼'); eq(q.min, 0, '0장도 허용');
  refuse(R, [d], '상대 캐릭터'); ans(R, [a, b]); pump(R); ok(R.cards[a].tab.length === 1 && R.cards[b].tab.length === 1 && !(R.cards[c].tab || []).length, '선택한 캐릭터에만 능력 부여');
  const h0 = R.P[s].hand.length; U.attack(R, a, d); U.finishContact(R, []); eq(R.P[s].hand.length, h0 + 1, '컨택트했을 때 1장 드로우'); ok(has(R, o, 'rem', d), '컨택트 중 AP+1000(1000→2000 ≥ 1500)으로 상대 리무브'); eq(R.cards[a].cm, 0, '컨택트가 끝나면 AP 증가 소멸');
  const h1 = R.P[s].hand.length; U.attack(R, c, d2); U.finishContact(R, []); eq(R.P[s].hand.length, h1, '능력이 없는 캐릭터는 드로우 없음'); ok(has(R, o, 'field', d2), 'AP 부족: 리무브 안 됨');
  endTurn(R); auto(R); ok(!(R.cards[a].tab || []).length, '턴 종료 시 부여 능력 소멸'); });
t('id_1108', '아무것도 선택하지 않아도 된다 / 선택 후 상대 턴에 상대가 컨택트해도 같은 능력은 이미 소멸', () => {
  const R = mk({ e: real('id_1108', { color: 'white', lv: '0' }), a: W('A') }, ['e'], ['e'], BS('white')); const s = R.turn; field(R, s, 'a'); const e = hand(R, s, 'e'); play(R, s, e); ans(R, []); pump(R); ok(!R.eff, '선택 없음: 종료'); });

t('id_1119', '【事件】【赤&黄】 리무브 에리어의 (컷인/ヒラメキ 이외의 원래 능력이 없는) 赤か黄 캐릭터 1장 등장 → ① 슬립 → 그 레벨 이하 캐릭터 리무브', () => {
  const mkr = (kcolor = 'red&yellow') => { const defs = { e: real('id_1119', { color: 'red', lv: '0' }), p1: dummy('P1', { color: 'red', lv: '3' }), p2: { n: 'P2', type: 'char', color: 'yellow', lv: '4', ap: '1000', lp: '1', kw: 'cutin:1000', ab: [{ ic: 'cutin', v: 1000 }] },
      p3: { n: 'P3', type: 'char', color: 'yellow', lv: '2', ap: '1000', lp: '1', ab: [{ ic: 'flash', ops: [{ op: 'draw', n: 1 }] }] }, y: dummy('Y', { color: 'red/yellow', lv: '1' }), x1: dummy('X1', { color: 'red', ab: [{ ic: 'onplay', ops: [] }] }), x2: dummy('X2', { color: 'red', kw: 'assault' }), x3: dummy('X3', { color: 'blue' }),
      t4: dummy('T4', { color: 'red', lv: '4' }), t5: dummy('T5', { color: 'red', lv: '5' }) };
    return mk(defs, ['e'], ['e'], { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: kcolor, lv: '2', lv2: '3' } }); };
  let R = mkr(); const s = R.turn, o = 1 - s; const ids = ['p1', 'p2', 'p3', 'y', 'x1', 'x2', 'x3'].map(k => rem(R, s, k)); const [p1, p2, p3, y, x1, x2, x3] = ids; const t4 = field(R, o, 't4'), t5 = field(R, o, 't5'); const e = hand(R, s, 'e');
  play(R, s, e); let q = req(R); eq(q.kind, 'pick', '등장 선택'); sameSet(q.sel, [p1, p2, p3, y], '컷인/ヒラメキ 이외의 원래 능력이 없는 赤か黄만'); refuse(R, [x1], '다른 능력 있음'); refuse(R, [x2], '키워드 있음'); refuse(R, [x3], '청색'); ans(R, [p2]); ok(has(R, s, 'field', p2), '등장'); eq(R.cards[p2].st, 'a', '통상 상태');
  q = req(R); eq(q.kind, 'opt', '2택1'); ans(R, 0); q = req(R); eq(q.kind, 'yn', '슬립은 해도 된다'); ans(R, true); eq(R.cards[p2].st, 's', '슬립'); q = req(R); eq(q.kind, 'pick', '그 캐릭터의 레벨(4) 이하'); sameSet(q.sel, [t4, p2], '레벨 4 이하: 상대 T4와 등장한 캐릭터 자신(Lv5는 제외)'); refuse(R, [t5], 'Lv5'); ans(R, [t4]); pump(R); ok(has(R, o, 'rem', t4), '리무브'); ok(has(R, o, 'field', t5), 'T5 그대로'); });
t('id_1119', '② 突撃[事件] 부여(턴 종료까지) / ①에서 슬립을 거절하면 리무브 없음 / 사건 색이 赤&黄이 아니면 불발 / ヒラメキ(증거에서 리무브 시 1장 드로우)', () => {
  const mkr = (kcolor = 'red&yellow') => mk({ e: real('id_1119', { color: 'red', lv: '0' }), p1: dummy('P1', { color: 'red', lv: '3' }), t3: dummy('T3', { color: 'red', lv: '3' }) }, ['e'], ['e'], { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: kcolor, lv: '2', lv2: '3' } });
  let R = mkr(); let s = R.turn, o = 1 - s; const p1 = rem(R, s, 'p1'); let e = hand(R, s, 'e'); play(R, s, e); ans(R, [p1]); ans(R, 1); pump(R); ok(R.cards[p1].tkw.includes('assault-case'), '突撃[事件]'); endTurn(R); auto(R); eq(R.cards[p1].tkw, '', '턴 종료 시 소멸');
  R = mkr(); s = R.turn; o = 1 - s; const q1 = rem(R, s, 'p1'); const t3 = field(R, o, 't3'); e = hand(R, s, 'e'); play(R, s, e); ans(R, [q1]); ans(R, 0); ans(R, false); pump(R); ok(!R.eff, '슬립 거절: 이후 질의 없음'); eq(R.cards[q1].st, 'a', '슬립 안 됨'); ok(has(R, o, 'field', t3), '리무브 없음');
  R = mkr('red'); s = R.turn; rem(R, s, 'p1'); e = hand(R, s, 'e'); play(R, s, e); ok(!R.eff, '사건 색이 赤&黄이 아니면 불발'); const fl = R.defs[R.cards[e].d].ab.find(a => a.ic === 'flash'); ok(fl && fl.ops[0].op === 'draw', 'ヒラメキ: 1장 드로우 유지'); });

t('id_1151', '파트너 黒: 덱 위 3장 리무브(해도 된다) → 컷인 黒이 있으면 3장 이상이므로 둘 다: 덱 위 4장 확인→【カットイン】黒 1장 공개해 손패, 나머지 덱 아래 / 손패의 FILE 장수 이하 컷인 黒 캐릭터 등장 / 비공개 정보 비누설', () => {
  const R = mk({ e: real('id_1151', { color: 'black', lv: '0' }), r1: CUT('R1', 'black', 2), r2: dummy('R2', { color: 'black' }), r3: dummy('R3', { color: 'black' }), p1: dummy('SECRETP1', { color: 'black' }), bc: CUT('BC', 'black', 3), p2: dummy('SECRETP2', { color: 'black' }), cb: CUT('SECRETCB', 'blue', 3),
    h3: CUT('H3', 'black', 3), h4: CUT('H4', 'black', 4), hb: CUT('HB', 'blue', 1) }, ['e'], ['e'], BS('black')); const s = R.turn, o = 1 - s;
  R.P[s].deck.unshift(...R.P[s].file.splice(3)); eq(R.P[s].file.length, 3, 'FILE 3장'); clearHand(R, s); const e = hand(R, s, 'e'), h3 = hand(R, s, 'h3'), h4 = hand(R, s, 'h4'), hb = hand(R, s, 'hb');
  const cb = top(R, s, 'cb'), p2 = top(R, s, 'p2'), bc = top(R, s, 'bc'), p1 = top(R, s, 'p1'), r3 = top(R, s, 'r3'), r2 = top(R, s, 'r2'), r1 = top(R, s, 'r1'); const dl = R.P[s].deck.length;
  play(R, s, e); let q = req(R); eq(q.kind, 'yn', '리무브는 해도 된다'); ans(R, true); sameSet([r1, r2, r3].filter(x => has(R, s, 'rem', x)), [r1, r2, r3], '위 3장 리무브');
  q = req(R); eq(q.kind, 'ack', '위 4장 확인(본인에게만)'); sameSet(q.ids, [p1, bc, p2, cb], '다음 4장'); ok(!viewStr(R, o).includes('SECRET'), '상대 화면에 확인한 카드명이 없음'); ok(!logs(R).includes('SECRET'), '로그에 확인한 카드명이 없음'); ans(R, null);
  q = req(R); eq(q.kind, 'pick', '공개해 손패에 가져올 카드'); sameSet(q.sel, [bc], '【カットイン】을 가진 黒만'); refuse(R, [p1], '컷인 없음'); refuse(R, [cb], '청색 컷인'); ok(!viewStr(R, o).includes('SECRET'), '선택 중에도 상대에게 비공개'); ans(R, [bc]);
  q = req(R); eq(q.kind, 'ack', '고른 카드는 상대에게 공개'); eq(q.who, o, '상대'); ok(q.ids.includes(bc), '공개된 카드'); ans(R, null); q = req(R); eq(q.kind, 'pick', '나머지 순서 지정'); ok(q.ordered, '순서 지정'); sameSet(q.ids, [p1, p2, cb], '나머지 3장'); ans(R, [p2, cb, p1]);
  ok(has(R, s, 'hand', bc), '손패로'); const bot = R.P[s].deck.slice(0, 3); sameSet(bot, [p1, p2, cb], '나머지는 덱 아래'); ok(!viewStr(R, o).includes('SECRET'), '덱 아래로 간 카드명이 상대에게 노출되지 않음');
  q = req(R); eq(q.kind, 'pick', '손패에서 등장'); sameSet(q.sel, [h3, bc], 'FILE(3) 이하의 【カットイン】 黒 캐릭터만'); refuse(R, [h4], 'Lv4 > FILE 3'); refuse(R, [hb], '청색'); ans(R, [h3]); pump(R); ok(has(R, s, 'field', h3), '등장'); eq(R.P[s].deck.length, dl - 3 - 1, '덱: -3(리무브) -1(손패로)'); ok(!logs(R).includes('SECRET'), '최종 로그에도 비공개 카드명 없음'); });
t('id_1151', '리무브한 3장에 컷인 黒이 없으면 추가 효과 없음 / 리무브를 거절하면 아무 일 없음 / 파트너 색 불일치면 불발', () => {
  const mkr = (pc = 'black') => { const R = mk({ e: real('id_1151', { color: 'black', lv: '0' }), a: dummy('A', { color: 'black' }), b: dummy('B', { color: 'black' }), c: dummy('C', { color: 'black' }) }, ['e'], ['e'], { p: { n: 'P', type: 'partner', color: pc, lp: '1' }, k: { n: 'K', type: 'case', color: 'black', lv: '2', lv2: '3' } }); const s = R.turn; ['a', 'b', 'c'].forEach(k => top(R, s, k)); return { R, s, e: hand(R, s, 'e') }; };
  let { R, s, e } = mkr(); const dl = R.P[s].deck.length; play(R, s, e); ans(R, true); ok(!R.eff, '컷인 黒 없음: 추가 질의 없음'); eq(R.P[s].deck.length, dl - 3, '3장 리무브');
  ({ R, s, e } = mkr()); const d2 = R.P[s].deck.length; play(R, s, e); ans(R, false); ok(!R.eff, '거절'); eq(R.P[s].deck.length, d2, '덱 변화 없음');
  ({ R, s, e } = mkr('red')); const d3 = R.P[s].deck.length; play(R, s, e); ok(!R.eff, '불발'); eq(R.P[s].deck.length, d3, '덱 변화 없음'); });
t('id_1151', '덱이 2장뿐이면 2장만 리무브(3장 미만) → 컷인 黒이 있으면 2택1 중 하나만', () => {
  const R = mk({ e: real('id_1151', { color: 'black', lv: '0' }), a: CUT('A', 'black', 1), b: dummy('B', { color: 'black' }), h1: CUT('H1', 'black', 2) }, ['e'], ['e'], BS('black')); const s = R.turn; clearHand(R, s); const e = hand(R, s, 'e'), h1 = hand(R, s, 'h1');
  R.P[s].rem.push(...R.P[s].deck.splice(0, R.P[s].deck.length)); const a = give(R, s, 'a', 'deck'), b = give(R, s, 'b', 'deck'); R.P[s].deck.length === 2 || (() => { throw new Error('덱 2장 구성 실패 ' + R.P[s].deck.length); })();
  const hist = R.P[s].rem.length; play(R, s, e); ans(R, true); const q = req(R); eq(q.kind, 'opt', '3장 미만이므로 2택1'); eq(q.labels.length, 2, '2개 중 선택'); ans(R, 1); const q2 = req(R); eq(q2.kind, 'pick', '등장 선택'); ok(q2.sel.includes(h1), '손패의 카드'); ans(R, [h1]); pump(R); ok(has(R, s, 'field', h1), '손패에서 등장'); ok(hist >= 0, 'ok'); });

t('id_1156', '해결편이 되었을 때 손패 1장 리무브(강제) / 【解決編】【宣言】 뒷면 증거 2개 표향 → 緑か白 캐릭터에 (이번 턴 1회) 컨택트로 상대 캐릭터 리무브 시 덱 위 4장 → 돌격 캐릭터 1장 공개 손패 / 비공개 정보', () => {
  const AS = (n, kw = 'assault', type = 'char') => ({ n, type, color: 'green', lv: '1', ap: '1000', lp: '1', kw });
  const R = mk({ g1: dummy('G1', { color: 'green', ap: '3000' }), w1: W('W1'), b1: dummy('B1'), og: dummy('OG', { color: 'green' }), d: dummy('D', { color: 'green', ap: '1000' }), d2: dummy('D2', { color: 'green', ap: '1000' }), hh: dummy('HH', { color: 'green' }),
    a1: AS('SECRETA1'), a2: dummy('SECRETA2', { color: 'green' }), a3: AS('SECRETA3', 'assault-case'), a4: dummy('SECRETA4', { color: 'green' }) }, ['hh'], ['hh'], { p: { n: 'P', type: 'partner', color: 'green', lp: '1' }, k: real('id_1156', { color: 'green', lv: '0', lv2: '0' }) });
  const s = R.turn, o = 1 - s; const k = R.P[s].kase; const g1 = field(R, s, 'g1'), w1 = field(R, s, 'w1'), b1 = field(R, s, 'b1'), og = field(R, o, 'og'); const d = field(R, o, 'd', 's'), d2 = field(R, o, 'd2', 's'); const hh = hand(R, s, 'hh');
  ok(declare(R, s, k), '해결편 전: 선언 불가'); const h0 = R.P[s].hand.length; U.solve(R, s); ok(R.eff, '해결편이 되었을 때 효과 질의'); drive(R); eq(R.P[s].hand.length, h0 - 1, '손패 1장 리무브');
  ok(declare(R, s, k), '뒷면 증거 2개가 없으면 선언 불가'); evid(R, s, 3, false); eq(declare(R, s, k), '', '선언'); let q = req(R); eq(q.kind, 'pick', '대상 선택'); sameSet(q.sel, [g1, w1], '내 현장의 緑か白 캐릭터만'); refuse(R, [b1], '청색'); refuse(R, [og], '상대 캐릭터'); ans(R, [g1]); pump(R);
  eq(R.P[s].evid.filter(x => R.cards[x].up).length, 2, '뒷면 증거 2개를 표향으로'); ok(R.cards[g1].tab.length === 1, '능력 부여'); ok(declare(R, s, k), '【ターン①】: 두 번째 선언 불가');
  const a4 = top(R, s, 'a4'), a3 = top(R, s, 'a3'), a2 = top(R, s, 'a2'), a1 = top(R, s, 'a1'); U.attack(R, g1, d); toEff(R); q = req(R); eq(q.kind, 'ack', '위 4장 확인'); ok(!viewStr(R, o).includes('SECRET'), '상대에게 비공개'); ans(R, null);
  q = req(R); eq(q.kind, 'pick', '돌격 캐릭터 선택'); sameSet(q.sel, [a1, a3], '突撃을 가진 캐릭터만'); refuse(R, [a2], '突撃 없음'); ok(!viewStr(R, o).includes('SECRET'), '선택 중에도 비공개'); ans(R, [a1]); q = req(R); eq(q.kind, 'ack', '공개'); eq(q.who, o, '상대에게 공개'); ans(R, null);
  q = req(R); eq(q.kind, 'pick', '나머지 순서'); ok(q.ordered, '순서 지정'); sameSet(q.ids, [a2, a3, a4], '나머지'); ans(R, [a3, a2, a4]); U.finishContact(R, []); ok(has(R, s, 'hand', a1), '손패로'); sameSet(R.P[s].deck.slice(0, 3), [a2, a3, a4], '나머지는 덱 아래'); ok(has(R, o, 'rem', d), '컨택트로 리무브'); ok(!viewStr(R, o).replace('SECRETA1', '').includes('SECRET'), '비공개 카드명 비누설(공개한 1장 제외)');
  const dl = R.P[s].deck.length; U.attack(R, g1, d2); U.finishContact(R, []); ok(has(R, o, 'rem', d2), '2번째 리무브'); eq(R.P[s].deck.length, dl, '【ターン①】: 두 번째는 발동 안 함'); eq(R.eff, null, '질의 없음');
  endTurn(R); auto(R); ok(!(R.cards[g1].tab || []).length, '턴 종료 시 부여 능력 소멸'); });

t('id_1155', '해결편 선언 — 뒷면 증거 1개 표향 + 손패 1장 리무브(코스트) → 工藤新一/毛利蘭에 Lv6↑ 액티브 지정 액션 + 컨택트로 리무브 시 1장 드로우 / 이 사건이 해결편이 되면 손패 1장 리무브', () => {
  const R = mk({ s1: dummy('工藤新一', { color: 'blue', ap: '3000' }), r1: dummy('毛利蘭', { color: 'blue' }), x: dummy('X', { color: 'blue' }), a6: dummy('A6', { color: 'blue', lv: '6', ap: '1000' }), a5: dummy('A5', { color: 'blue', lv: '5', ap: '1000' }), hh: dummy('HH', { color: 'blue' }) }, ['hh', 'hh'], ['hh'],
    { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: real('id_1155', { color: 'blue', lv: '0', lv2: '0' }) });
  const s = R.turn, o = 1 - s; const k = R.P[s].kase; const s1 = field(R, s, 's1'), r1 = field(R, s, 'r1'), x = field(R, s, 'x'); const a6 = field(R, o, 'a6', 'a'), a5 = field(R, o, 'a5', 'a'); const h0 = R.P[s].hand.length;
  U.solve(R, s); drive(R); eq(R.P[s].hand.length, h0 - 1, '해결편이 되었을 때 손패 1장 리무브'); ok(declare(R, s, k), '뒷면 증거가 없으면 선언 불가'); evid(R, s, 2, false); const h1 = R.P[s].hand.length; eq(declare(R, s, k), '', '선언 시작');
  let q = req(R); ok(q, '코스트(손패 리무브) 또는 대상 질의'); while (q && q.kind === 'pick' && !q.sel.includes(s1)) { ans(R, q.sel.slice(0, q.min)); q = req(R); }
  sameSet(q.sel, [s1, r1], '카드명 [工藤新一]か[毛利蘭]만'); refuse(R, [x], '다른 이름'); ans(R, [s1]); pump(R); eq(R.P[s].hand.length, h1 - 1, '손패 1장 리무브(코스트)'); eq(R.P[s].evid.filter(x => R.cards[x].up).length, 1, '증거 1개 표향'); ok(declare(R, s, k), '【ターン①】');
  R.cards[s1].sum = 0; R.cards[s1].st = 'a'; eq(act(R, s, { a: 'action', id: s1, k: 'char', tid: a5 }) ? 'err' : 'ok', 'err', 'Lv5 액티브 캐릭터는 지정 불가'); eq(act(R, s, { a: 'action', id: s1, k: 'char', tid: a6 }), undefined, 'Lv6 이상 액티브 캐릭터를 지정해 액션 가능');
  act(R, o, { a: 'guard', id: null }); const hh = R.P[s].hand.length; U.finishContact(R, []); ok(has(R, o, 'rem', a6), '컨택트로 리무브'); eq(R.P[s].hand.length, hh + 1, '컨택트로 리무브되었을 때 1장 드로우'); endTurn(R); auto(R); ok(!(R.cards[s1].tab || []).length && R.cards[s1].tkw === '', '턴 종료 시 소멸'); });

t('id_0341', '宣言: 降谷零·諸伏景光·伊達航·萩原研二가 모두 현장에 있을 때만 / Lv7 이하 캐릭터 액티브+AP+1000+突撃 + 1장 드로우 / ターン①', () => {
  const NM = ['降谷零', '諸伏景光', '伊達航', '萩原研二']; const defs = { c: real('id_0341', { color: 'yellow', lv: '0' }), v: dummy('V', { color: 'yellow', lv: '7', ap: '1000' }), big: dummy('BIG', { color: 'yellow', lv: '8' }) }; NM.forEach((n, i) => { defs['n' + i] = dummy(n, { color: 'yellow' }); });
  const R = mk(defs, ['c'], ['c'], BS('yellow')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const v = field(R, o, 'v', 's'), big = field(R, o, 'big', 's'); const i = R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare');
  NM.slice(0, 3).forEach((n, j) => field(R, s, 'n' + j)); ok(FX.declareCheck(R, s, c, i), '3명뿐: 선언 불가'); field(R, o, 'n3'); ok(FX.declareCheck(R, s, c, i), '상대 현장의 이름은 불인정(자신의 현장)'); const n3 = field(R, s, 'n3'); eq(FX.declareCheck(R, s, c, i), '', '4명 모두: 선언 가능');
  const h0 = R.P[s].hand.length; ok(!FX.declare(R, s, c, i), '선언'); pump(R); const q = req(R); eq(q.kind, 'pick', '대상'); ok(q.sel.includes(v) && !q.sel.includes(big), 'Lv7 이하'); refuse(R, [big], 'Lv8'); ans(R, [v]); pump(R);
  eq(R.cards[v].st, 'a', '액티브'); eq(R.cards[v].apm, 1000, 'AP+1000'); ok(FX.hasKwTk(R, v, 'assault'), '突撃'); eq(R.P[s].hand.length, h0 + 1, '1장 드로우'); ok(FX.declareCheck(R, s, c, i), '【ターン①】'); endTurn(R); auto(R); eq(R.cards[v].apm, 0, '턴 종료 시 소멸'); });

t('id_0599', '【相手ターン中】【現場リムーブ時】特徴[警察]이면 리무브 에리어에서 슬립으로 등장+1장 드로우(해도 된다) → 특징을 警察/警視庁→探偵으로(턴 종료로 끝나지 않음) / 두 번째부터는 불발', () => {
  const EV = own => ({ n: 'E' + own, type: 'event', color: 'yellow', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, filter: { own }, do: 'remove' }] }] });
  const R = mk({ c: real('id_0599', { color: 'yellow', lv: '0' }), x: EV('self'), y: EV('opp') }, [], [], BS('yellow')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const h0 = R.P[s].hand.length;
  const oppRemove = () => { R.turn = o; R.fl = {}; const y = give(R, o, 'y', 'hand'); play(R, o, y); ans(R, [c]); };
  oppRemove(); let q = req(R); eq(q.kind, 'yn', '재등장 확인'); eq(q.who, s, '카드 주인이 결정'); ans(R, true); pump(R);
  ok(has(R, s, 'field', c), '리무브 에리어에서 등장'); eq(R.cards[c].st, 's', '슬립 상태'); eq(R.P[s].hand.length, h0 + 1, '1장 드로우'); const tr = FX.traitsId(R, c); ok(!tr.includes('警察') && !tr.includes('警視庁') && tr.includes('探偵'), '특징: 警察/警視庁을 잃고 探偵: ' + tr);
  endTurn(R); auto(R); ok(FX.traitsId(R, c).includes('探偵') && !FX.traitsId(R, c).includes('警察'), '턴 종료로 끝나지 않음(현장에 있는 동안 유지)');
  R.cards[c].st = 'a'; oppRemove(); pump(R); ok(!R.eff && has(R, s, 'rem', c), '이제 警察이 아니므로 다시 등장하지 않음(질의도 없음)'); });
t('id_0599', '거절하면 리무브 에리어에 남고 특징도 그대로 / 내 턴에 리무브되면 불발 / 특징[警察]이 아니면 불발', () => {
  const EV = own => ({ n: 'E' + own, type: 'event', color: 'yellow', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, filter: { own }, do: 'remove' }] }] });
  const mkr = over => mk({ c: real('id_0599', { color: 'yellow', lv: '0', ...over }), x: EV('self'), y: EV('opp') }, [], [], BS('yellow'));
  let R = mkr(); let s = R.turn, o = 1 - s; let c = field(R, s, 'c'); R.turn = o; R.fl = {}; play(R, o, give(R, o, 'y', 'hand')); ans(R, [c]); ans(R, false); pump(R); ok(has(R, s, 'rem', c), '거절: 리무브 에리어에 남음'); ok(FX.traitsId(R, c).includes('警察'), '특징 변화 없음');
  R = mkr(); s = R.turn; c = field(R, s, 'c'); R.turn = s; R.fl = {}; play(R, s, give(R, s, 'x', 'hand')); ans(R, [c]); pump(R); ok(!R.eff && has(R, s, 'rem', c), '내 턴에 리무브: 불발');
  R = mkr({ trait: '探偵' }); s = R.turn; o = 1 - s; c = field(R, s, 'c'); R.turn = o; R.fl = {}; play(R, o, give(R, o, 'y', 'hand')); ans(R, [c]); pump(R); ok(!R.eff && has(R, s, 'rem', c), '특징[警察]이 아니면 불발'); });

t('id_0914', '【相手ターン中】【現場リムーブ時】손패의 【現場リムーブ時】 보유 Lv7↓ 青/黒 캐릭터 1장 리무브(해도 된다) → 1장 드로우 + 그 카드의 【現場リムーブ時】 발동(해도 된다) / 선언 능력(기존)', () => {
  const RM = (n, color, lv, extra = {}) => ({ n, type: 'char', color, lv: String(lv), ap: '1000', lp: '1', ab: [{ ic: 'onremoved', ops: [{ op: 'draw', n: 1 }] }], ...extra });
  const EV = { n: 'EY', type: 'event', color: 'black', lv: '0', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }] }] }, EX = { ...EV, n: 'EX', ab: [{ ic: 'event', ops: [{ op: 'select', n: 1, filter: { own: 'self' }, do: 'remove' }] }] };
  const mkr = () => mk({ c: real('id_0914', { color: 'black', lv: '0' }), y: EV, x: EX, h1: RM('H1', 'blue', 5), h8: RM('H8', 'black', 8), hr: RM('HR', 'red', 3), hp: dummy('HP', { color: 'black', lv: '3' }) }, [], [], BS('black'));
  const go = (R, s, c, f) => { const o = 1 - s; R.turn = o; R.fl = {}; play(R, o, give(R, o, 'y', 'hand')); ans(R, [c]); f(); };
  let R = mkr(); let s = R.turn; clearHand(R, s); let c = field(R, s, 'c'); let h1 = hand(R, s, 'h1'), h8 = hand(R, s, 'h8'), hr = hand(R, s, 'hr'), hp = hand(R, s, 'hp');
  go(R, s, c, () => { const q = req(R); eq(q.kind, 'pick', '리무브할 카드 선택'); sameSet(q.sel, [h1], '【現場リムーブ時】를 가진 Lv7 이하의 青/黒만'); refuse(R, [h8], 'Lv8'); refuse(R, [hr], '적색'); refuse(R, [hp], '능력 없음'); ans(R, [h1]); });
  let q = req(R); eq(q.kind, 'yn', '리무브한 카드의 효과 발동 확인'); ok(has(R, s, 'rem', h1), '손패에서 리무브'); eq(R.P[s].hand.length, 3 + 1, '손패: 3장 남음 + 드로우 1'); ans(R, true); pump(R); eq(R.P[s].hand.length, 3 + 1 + 1, '리무브한 카드의 효과로 1장 더 드로우');
  R = mkr(); s = R.turn; clearHand(R, s); c = field(R, s, 'c'); h1 = hand(R, s, 'h1'); go(R, s, c, () => ans(R, [h1])); ans(R, false); pump(R); eq(R.P[s].hand.length, 1, '효과 발동 거절: 드로우 1장만(손패 0 + 1)');
  R = mkr(); s = R.turn; clearHand(R, s); c = field(R, s, 'c'); h1 = hand(R, s, 'h1'); go(R, s, c, () => ans(R, [])); pump(R); ok(!R.eff, '선택 안 함: 아무 일 없음'); eq(R.P[s].hand.length, 1, '손패 그대로(드로우 없음)');
  R = mkr(); s = R.turn; clearHand(R, s); c = field(R, s, 'c'); h1 = hand(R, s, 'h1'); R.turn = s; R.fl = {}; play(R, s, give(R, s, 'x', 'hand')); ans(R, [c]); pump(R); ok(!R.eff && has(R, s, 'rem', c), '내 턴에 리무브: 불발(질의 없음)'); });
t('id_0914', '선언(기존 규칙): 리무브 에리어에 【現場リムーブ時】 캐릭터가 2장 이상 + 사건 青&黒 + 슬립 → 캐릭터 1장 리무브', () => {
  const RMC = n => ({ n, type: 'char', color: 'blue', lv: '1', ap: '1000', lp: '1', ab: [{ ic: 'onremoved', ops: [] }] });
  const R = mk({ c: real('id_0914', { color: 'black', lv: '0' }), r1: RMC('R1'), r2: RMC('R2'), v: dummy('V', { color: 'black' }) }, [], [], { p: { n: 'P', type: 'partner', color: 'black', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue/black', lv: '2', lv2: '3' } }); const s = R.turn; const c = field(R, s, 'c'); const v = field(R, 1 - s, 'v');
  const i = R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare'); ok(FX.declareCheck(R, s, c, i), '2장 미만: 불가'); rem(R, s, 'r1'); rem(R, s, 'r2'); eq(FX.declareCheck(R, s, c, i), '', '가능'); ok(!FX.declare(R, s, c, i), '선언'); pump(R); ans(R, [v]); pump(R); ok(has(R, 1 - s, 'rem', v), '리무브'); eq(R.cards[c].st, 's', '슬립 코스트'); });

t('id_0915', '【宣言】【スリープ⑦】 자신의 사건이 黒 이외의 색을 가진 경우 AP8000 이하 캐릭터 1장 리무브 / 黒 단색 사건이면 선언 불가 / 선언 시 슬립', () => {
  const mkr = kc => mk({ c: real('id_0915', { color: 'black', lv: '0' }), a: dummy('A', { color: 'black', ap: '8000' }), b: dummy('B', { color: 'black', ap: '9000' }) }, [], [], { p: { n: 'P', type: 'partner', color: 'black', lp: '1' }, k: { n: 'K', type: 'case', color: kc, lv: '2', lv2: '3' } });
  let R = mkr('black'); let s = R.turn; let c = field(R, s, 'c'); const i = R.defs[R.cards[c].d].ab.findIndex(a => a.ic === 'declare'); ok(FX.declareCheck(R, s, c, i), '黒 단색 사건: 선언 불가');
  R = mkr('black/blue'); s = R.turn; c = field(R, s, 'c'); const a = field(R, 1 - s, 'a'), b = field(R, 1 - s, 'b'); eq(FX.declareCheck(R, s, c, i), '', '黒 이외의 색을 가진 사건: 선언 가능'); ok(!FX.declare(R, s, c, i), '선언'); pump(R); eq(R.cards[c].st, 's', '슬립'); const q = req(R); sameSet(q.sel.filter(x => x !== c), [a], 'AP8000 이하(AP9000 제외; 자신(AP7000)은 합법 대상)'); ok(q.sel.includes(c), '자신 AP7000 도 합법');
  refuse(R, [b], 'AP9000'); ans(R, [a]); pump(R); ok(has(R, 1 - s, 'rem', a), '리무브'); ok(FX.declareCheck(R, s, c, i), '슬립 상태라 다시 선언 불가'); });
module.exports = {}; if (require.main === module) U.runAll('mz_g2');
