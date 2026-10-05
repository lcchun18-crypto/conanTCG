// v1.12.7: id_1068 (손패 공개 트리거 hrev) — 공개 경로가 달라도(효과 pick·revealHand op·코스트 revealHand/handDeckTop/stackCost) 같은 "공개" 로 트리거 → 사용 여부(yn) → 예/아니오
delete process.env.CONAN_DEFAULT_OWN; process.env.CONAN_DEFAULT_OWN = 'any';
const U = require('./mz_util'); const { G, real, dummy, field, hand, pump, S, FX, act, req, ans, fillFile, top } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const DBC = U.DB(); const BSK = (pc, kc) => ({ p: { n: 'P', type: 'partner', color: pc, lp: '1' }, k: { n: 'K', type: 'case', color: kc, lv: '2', lv2: '3' } });
const dIdx = (R, id, n) => { const ab = R.defs[R.cards[id].d].ab; for (let i = 0; i < ab.length; i++) if (ab[i].ic === 'declare' && n-- === 0) return i; return -1; };
const decl = (R, s, id, n) => { const e = FX.declare(R, s, id, dIdx(R, id, n)); if (e) throw new Error('declare: ' + e); pump(R); };
const NM = ['工藤新一', '毛利蘭'], F = { names: NM };
const RV = { n: '公開役', type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', ab: [
  { ic: 'declare', cost: [{ c: 'revealHand', n: 1, filter: F }], ops: [] },                                                     // 0 코스트 공개
  { ic: 'declare', cost: [], ops: [{ op: 'pick', from: 'hand', own: 'self', filter: { name: '工藤新一' }, n: 1, min: 1, as: 'chosen', reveal: true }] },   // 1 효과 pick 공개
  { ic: 'declare', cost: [], ops: [{ op: 'revealHand', who: 'self' }] },                                                          // 2 손패 전체 공개(효과)
  { ic: 'declare', cost: [{ c: 'handDeckTop', n: 1, filter: F }], ops: [] },                                                     // 3 공개해 덱 위로(코스트)
  { ic: 'declare', cost: [{ c: 'stackCost', from: 'hand', n: 1, filter: F }], ops: [] },                                          // 4 공개해 겹침(코스트)
  { ic: 'declare', cost: [], ops: [{ op: 'revealTop', n: 1 }] },                                                                  // 5 덱 위 공개(손패 아님)
] };
const mk = () => { const R = G({ c: real('id_1068', { color: 'blue', lv: '0' }), rv: RV, a: dummy('工藤新一', { color: 'blue' }), b: dummy('毛利蘭', { color: 'blue' }), z: dummy('他人', { color: 'blue' }) }, ['c', 'rv', 'a', 'b', 'z'], ['a', 'rv'], BSK('blue', 'blue/black')); fillFile(R, 0, 9); fillFile(R, 1, 9);
  const s = R.turn, c = field(R, s, 'c'); R.cards[c].st = 's'; const rv = field(R, s, 'rv'); return { R, s, c, rv }; };
const drain = R => { let g = 0; while (R.eff && R.eff.req.kind === 'ack' && g++ < 6) { act(R, R.eff.req.who, { a: 'ans', v: null }); pump(R); } };   // 확인(ack) 만 넘김
const toYn = (R, s, ci) => { drain(R); return R.eff && R.eff.req.kind === 'yn' && R.eff.req.who === s && R.eff.req.msg.includes('毛利蘭') ? R.eff.req : null; };
const names = ['코스트 revealHand', '효과 pick(reveal)', '효과 revealHand(손패 전체)', '코스트 handDeckTop(공개해 덱 위)', '코스트 stackCost(공개해 겹침)'];
for (let n = 0; n < 5; n++) {
  { const { R, s, c, rv } = mk(); const a = hand(R, s, 'a'); const b = hand(R, s, 'b'); void b; const ap0 = S.ap(R, c); decl(R, s, rv, n);
    if (R.eff && R.eff.req.kind === 'pick') { ans(R, [R.eff.req.sel.includes(a) ? a : R.eff.req.sel[0]]); pump(R); }
    const q = toYn(R, s); ok(!!q, `${names[n]}: id_1068 효과 사용 여부 팝업(yn) 발생`);
    if (q) { ok(q.msg.includes('사용하시겠습니까'), '  질문 문구: ' + q.msg); ans(R, true); pump(R); drain(R); ok(R.cards[c].st === 'a' && S.ap(R, c) === ap0 + 1000, '  예 → 액티브 + AP+1000 실행'); } }
  { const { R, s, c, rv } = mk(); const a = hand(R, s, 'a'); hand(R, s, 'b'); const ap0 = S.ap(R, c); decl(R, s, rv, n);
    if (R.eff && R.eff.req.kind === 'pick') { ans(R, [R.eff.req.sel.includes(a) ? a : R.eff.req.sel[0]]); pump(R); }
    let q = toYn(R, s), g = 0; while (q && g++ < 4) { ans(R, false); pump(R); q = toYn(R, s); q = q || null; } q = true;
    ok(q && R.cards[c].st === 's' && S.ap(R, c) === ap0 && !R.eff, `${names[n]}: 아니오 → 아무 효과 없이 진행`); }
}
// 아니오 후 같은 턴에 다시 공개하면 (턴② 횟수를 소모하지 않았으므로) 다시 물어본다
{ const { R, s, c, rv } = mk(); const a = hand(R, s, 'a'); hand(R, s, 'a'); decl(R, s, rv, 1); if (R.eff.req.kind === 'pick') { ans(R, [a]); pump(R); } let q = toYn(R, s); ans(R, false); pump(R); drain(R); R.cards[rv].u = {}; decl(R, s, rv, 1); if (R.eff && R.eff.req.kind === 'pick') { ans(R, [R.eff.req.sel[0]]); pump(R); } q = toYn(R, s); ok(!!q, '아니오는 턴② 횟수를 소모하지 않음 → 다시 공개하면 다시 물어봄'); if (q) { ans(R, true); pump(R); drain(R); } ok(R.cards[c].st === 'a', '  이번엔 예 → 발동'); void a; }
// 덱 위 공개 / 이름이 다른 카드 / 상대 턴 / 조건 불충족 은 물어보지 않음
{ const { R, s, c, rv } = mk(); decl(R, s, rv, 5); drain(R); ok(!R.eff && R.cards[c].st === 's', '덱 위를 공개했을 때(손패가 아님)는 트리거 아님'); }
{ const { R, s, c, rv } = mk(); hand(R, s, 'z'); const R2 = R; R2.P[s].hand = R2.P[s].hand.filter(x => R2.defs[R2.cards[x].d].n === '他人'); decl(R, s, rv, 2); drain(R); ok(!R.eff && R.cards[c].st === 's', '이름이 다른 카드(他人)만 공개하면 트리거 아님'); }
// 상대의 효과로 내 손패가 공개되는 경우는 "자신의 효과" 가 아니므로 트리거 아님 (기존 규칙 유지)
{ const { R, s, c } = mk(); const o = 1 - s; const R3 = R; hand(R3, s, 'a'); FX.bus(R3, 'hrev', { s: o, ent: hand(R3, o, 'a'), by: 'effect' }); pump(R3); drain(R3); ok(!R3.eff && R3.cards[c].st === 's', '상대가 공개한 경우는 트리거 아님'); }
{ const { R, s, c, rv } = mk(); R.cards[c].st = 's'; R.turn = 1 - s; R.fl = {}; FX.bus(R, 'hrev', { s, ent: hand(R, s, 'a'), by: 'effect' }); pump(R); drain(R); ok(!R.eff && R.cards[c].st === 's', '상대 턴에는 트리거 아님'); void rv; }
// 서버 뷰: 양쪽 상태 동기화 — 사용 여부 질의는 소유자에게만, 상대는 대기 상태
{ const { R, s, rv } = mk(); const a1 = hand(R, s, 'a'); decl(R, s, rv, 1); if (R.eff.req.kind === 'pick') { ans(R, [a1]); pump(R); } const q = toYn(R, s); const v0 = S.view(R, s), v1 = S.view(R, 1 - s); ok(q && v0.eff && v0.eff.kind === 'yn' && !!v0.eff.mine || (v0.eff && v0.eff.kind === 'yn'), '소유자 화면에 yn 질의 표시'); ok(!(v1.eff && v1.eff.kind === 'yn' && v1.eff.mine), '상대 화면에는 응답 권한 없는 대기 상태'); ans(R, true); pump(R); drain(R);
  const v2 = S.view(R, 1 - s); ok(!v2.eff, '응답 후 양쪽 질의 해제'); }
console.log(`reveal_trigger_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
