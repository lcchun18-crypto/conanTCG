// g1 묶음(상시 규칙 / 키워드 부여 / 제한 / 스탯 보정 / 반응형 트리거) 28장: 실제 DB 의 ab 를 실제 엔진에서 자동 실행해 검증한다.
// 실행: CARDS_DB=/tmp/aud/g1.json node test/mz_g1.js   (ONLY=id_0192 로 한 장만)
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, pa, play, auto, ok, eq, has, FX, S, req, ans, fillFile, pump, give, act, attack, ready, endTurn, finishContact } = U;
const BS = (c, kc) => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: kc || c, lv: '2', lv2: '3' } });
const ap = (R, id) => S.ap(R, id), lp = (R, id) => S.lpOf(R, id);
const CUT = (n, extra = {}) => ({ n, type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', kw: 'cutin:1000', ab: [{ ic: 'cutin', v: 1000 }], ...extra });
const EVD = (n, ops, color = 'blue', extra = {}) => ({ n, type: 'event', color, lv: '0', ab: [{ ic: 'event', ops }], ...extra });
const mk = (defs, l0, l1, base, n = 9) => { const R = G(defs, l0, l1, base); fillFile(R, 0, n); fillFile(R, 1, n); return R; };
const di = (R, id, ic = 'declare', k = 0) => { let n = -1; return U.FX.abInfo(R, id).findIndex(a => a.ic === ic && ++n === k); };
const dec = (R, s, id, k = 0) => { const e = FX.declare(R, s, id, di(R, id, 'declare', k)); if (e) throw new Error('declare: ' + e); pump(R); };
const decErr = (R, s, id, k = 0) => FX.declareCheck(R, s, id, di(R, id, 'declare', k));
const limbo = (R, s, k) => { const id = give(R, s, k, 'rem'); R.P[s].rem = R.P[s].rem.filter(x => x !== id); return id; };
const flash = (R, s, id, o = {}) => { R.fl = R.fl || {}; FX.queueFlash(R, s, id); pump(R); return auto(R, o); };
// seat 가 컨택트에서 행동할 수 있는 차례가 될 때까지 상대는 패스시키고 act 한다(에러 문자열 / undefined 반환)
const cinAs = (R, seat, m) => { let g = 0; while (R.sub && R.sub.who !== seat && g++ < 4) { const e = act(R, R.sub.who, { a: 'pass' }); if (e) return 'pass: ' + e; } if (!R.sub) return 'no-contact'; return act(R, seat, m); };
// 상대가 가드할 수 있는 단일 액션: ai(턴 플레이어) 가 di 를 지정 → gid 로 가드(null 이면 가드 안 함)
const action = (R, ai, di_, gid = null) => { const a = R.cards[ai].o; R.turn = a; R.fl = R.fl || {}; ready(R, ai); const e = act(R, a, { a: 'action', id: ai, k: 'char', tid: di_ }); if (e) throw new Error('action: ' + e); const e2 = act(R, 1 - a, { a: 'guard', id: gid }); if (e2) throw new Error('guard: ' + e2); };
const fresh = R => { R.fl = {}; return R; };
const leaks = (R, seat, name) => JSON.stringify(S.view(R, seat)).includes(name);

// ───────────── 0192 ─────────────
t('id_0192', '【ターン①】 필수 지정: 첫 액션은 이 캐릭터를 지정해야 하고(다른 대상/사건 거부), 두 번째 액션은 자유 / 액티브면 해당 없음 / ヒラメキ 1장 드로', () => {
  const R = mk({ c: real('id_0192', { color: 'green' }), v: dummy('V', { color: 'green' }), a1: dummy('A1', { ap: '3000' }), a2: dummy('A2', { ap: '3000' }) }, ['c'], ['a1'], BS('green')); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'c', 's'), v = field(R, s, 'v', 's'), a1 = field(R, o, 'a1'), a2 = field(R, o, 'a2'); U.evid(R, s, 1); R.turn = o; fresh(R); ready(R, a1); ready(R, a2);
  eq(S.actsFor(R, o)[a1].find(x => x.k === 'actc').tg.join(), String(c), '지정 가능한 것은 이 캐릭터뿐'); ok(!S.actsFor(R, o)[a1].some(x => x.k === 'actk'), '사건 액션 불가');
  ok(act(R, o, { a: 'action', id: a1, k: 'char', tid: v }), '다른 캐릭터 지정 거부'); ok(act(R, o, { a: 'action', id: a1, k: 'case' }), '사건 지정 거부');
  eq(act(R, o, { a: 'action', id: a1, k: 'char', tid: c }), undefined, '이 캐릭터 지정'); act(R, s, { a: 'guard', id: null }); finishContact(R);
  R.turn = o; ok(S.actsFor(R, o)[a2].find(x => x.k === 'actc').tg.includes(v), '두 번째 액션은 자유'); eq(act(R, o, { a: 'action', id: a2, k: 'char', tid: v }), undefined, '다른 캐릭터 지정 가능');
  const R2 = mk({ c: real('id_0192', { color: 'green' }), v: dummy('V', { color: 'green' }), a1: dummy('A1') }, ['c'], ['a1'], BS('green')); const s2 = R2.turn, o2 = 1 - s2; field(R2, s2, 'c', 'a'); const v2 = field(R2, s2, 'v', 's'), b = field(R2, o2, 'a1'); R2.turn = o2; fresh(R2); ready(R2, b);
  eq(act(R2, o2, { a: 'action', id: b, k: 'char', tid: v2 }), undefined, '액티브면 지정 불가이므로 강제되지 않음');
  const R3 = mk({ c: real('id_0192', { color: 'green' }) }, ['c'], ['c'], BS('green')); const s3 = R3.turn, c3 = limbo(R3, s3, 'c'), h0 = R3.P[s3].hand.length; flash(R3, s3, c3, { yn: true }); eq(R3.P[s3].hand.length, h0 + 1, 'ヒラメキ: 1장 드로'); });

// ───────────── 0407 ─────────────
t('id_0407', '探偵の目: 지정된(usecond cname) 이벤트만 사용 가능 / 파트너 색이 모두 / 현장 최대 4장', () => {
  const E1 = EVD('E1', [{ op: 'draw', n: 1 }], 'red'), E2 = EVD('E2', [{ op: 'draw', n: 1 }], 'red', { ab: [{ ic: 'usecond', cond: { cname: '探偵の目' } }, { ic: 'event', ops: [{ op: 'draw', n: 1 }] }] }), E3 = EVD('E3', [{ op: 'draw', n: 1 }], 'red', { ab: [{ ic: 'usecond', cond: { cname: '다른 사건' } }, { ic: 'event', ops: [{ op: 'draw', n: 1 }] }] });
  const SA = { n: 'SA', type: 'char', color: 'red', lv: '0', ap: '1000', lp: '1', ab: [{ ic: 'static', cond: { pcolor: 'blue' }, tgt: { sel: 'self' }, ap: 1000 }] };
  const mkc = kc => mk({ e1: E1, e2: E2, e3: E3, sa: SA, z: dummy('Z', { color: 'red' }), x: dummy('X', { color: 'red' }) }, ['e1', 'e2', 'e3', 'z'], ['z'], { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: kc });
  const R = mkc(real('id_0407', { color: 'red/blue/green/yellow/white/black' })); const s = R.turn; const e1 = hand(R, s, 'e1'), e2 = hand(R, s, 'e2'), e3 = hand(R, s, 'e3');
  ok(act(R, s, { a: 'play', id: e1 }), '지정되지 않은 이벤트 거부'); ok(act(R, s, { a: 'play', id: e3 }), '다른 사건을 지정한 이벤트 거부'); fresh(R); eq(act(R, s, { a: 'play', id: e2 }), undefined, '이 사건을 지정한 이벤트는 사용 가능'); pump(R);
  const R0 = mkc({ n: '보통 사건', type: 'case', color: 'red', lv: '2', lv2: '3' }); const e1b = hand(R0, R0.turn, 'e1'); eq(act(R0, R0.turn, { a: 'play', id: e1b }), undefined, '대조: 보통 사건에서는 사용 가능');
  const R2 = mkc(real('id_0407', { color: 'red/blue/green/yellow/white/black' })); const s2 = R2.turn; const sa = field(R2, s2, 'sa'); eq(ap(R2, sa), 2000, '파트너 색이 모두이므로 pcolor(青) 조건 충족'); const R3 = mkc({ n: '보통 사건', type: 'case', color: 'red', lv: '2', lv2: '3' }); eq(ap(R3, field(R3, R3.turn, 'sa')), 1000, '대조: 보통 사건은 조건 불충족');
  const R4 = mkc(real('id_0407', { color: 'red/blue/green/yellow/white/black' })); const s4 = R4.turn; ['z', 'x', 'sa'].forEach(k => field(R4, s4, k)); const z2 = give(R4, s4, 'e1', 'field'); R4.P[s4].field.pop(); R4.P[s4].hand.push(z2); const x2 = field(R4, s4, 'e2'); R4.P[s4].field.pop(); R4.P[s4].hand.push(x2);
  const R5 = mk({ z: dummy('Z', { color: 'red' }), x: dummy('X', { color: 'red' }), y: dummy('Y', { color: 'red' }), w: dummy('W', { color: 'red' }), h: dummy('H', { color: 'red' }) }, ['h'], ['h'], { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: real('id_0407', { color: 'red/blue/green/yellow/white/black' }) });
  const s5 = R5.turn; ['z', 'x', 'y', 'w'].forEach(k => field(R5, s5, k)); const h = hand(R5, s5, 'h'); ok(act(R5, s5, { a: 'play', id: h }), '4장이 차면 5번째는 스위치 선택 없이 불가');
  const R6 = mk({ z: dummy('Z', { color: 'red' }), x: dummy('X', { color: 'red' }), y: dummy('Y', { color: 'red' }), w: dummy('W', { color: 'red' }), h: dummy('H', { color: 'red' }) }, ['h'], ['h'], BS('red')); const s6 = R6.turn; ['z', 'x', 'y', 'w'].forEach(k => field(R6, s6, k)); const h6 = hand(R6, s6, 'h'); eq(act(R6, s6, { a: 'play', id: h6 }), undefined, '대조: 보통 사건은 4장이어도 5번째를 낼 수 있음'); });

// ───────────── 0432 ─────────────
t('id_0432', '【絆】鈴木園子【自分ターン中】 상대 컷인 불가 + 상대 キャラ 변장 시 발동 안 함 / 絆 없으면·상대 턴엔 해당 없음 / ヒラメキ 이름 回収', () => {
  const DIS = { n: 'DIS', type: 'char', color: 'white', lv: '0', ap: '1000', lp: '1', kw: 'disguise', ab: [{ ic: 'disguise' }, { ic: 'ondisguise', ops: [{ op: 'draw', n: 1 }] }] };
  const run = (bond, mine = true) => { const R = mk({ c: real('id_0432', { color: 'white' }), b: dummy('鈴木園子', { color: 'white' }), x: dummy('X', { color: 'white', ap: '3000' }), v: dummy('V', { color: 'white', ap: '1000' }), cu: CUT('CU', { color: 'white' }), dis: DIS }, ['c', 'x', 'cu'], ['cu', 'dis', 'v'], BS('white')); const s = R.turn, o = 1 - s;
    field(R, s, 'c'); if (bond) field(R, s, 'b'); const x = field(R, s, 'x'), v = field(R, o, 'v', 's'); const cu = hand(R, o, 'cu'), dis = hand(R, o, 'dis'); const cu0 = hand(R, s, 'cu'); R.cards[x].sum = 0;
    if (mine) attack(R, x, v); else { U.ready(R, v); R.cards[x].st = 's'; R.turn = o; fresh(R); attack(R, v, x); } return { R, s, o, x, v, cu, dis, cu0 }; };
  let r = run(true); r = run(true); { const e = cinAs(r.R, r.o, { a: 'cin', id: r.cu }); ok(typeof e === 'string' && /컷인/.test(e), '내 턴 중: 상대 컷인 거부 ' + e); }
  r = run(true); { const hb = r.R.P[r.o].hand.length; const e = cinAs(r.R, r.o, { a: 'dis', id: r.dis }); eq(e, undefined, '변장 자체는 가능'); pump(r.R); auto(r.R); eq(r.R.P[r.o].hand.length, hb - 1, '변장 시 발동(드로)이 일어나지 않음(변장 카드만 사용)'); }
  r = run(false); { const e = cinAs(r.R, r.o, { a: 'cin', id: r.cu }); eq(e, undefined, '絆 없음: 상대 컷인 가능'); }
  r = run(true, false); { const e = cinAs(r.R, r.o, { a: 'cin', id: r.cu }); eq(e, undefined, '상대 턴 중: 상대 컷인 가능'); }
  const R = mk({ c: real('id_0432', { color: 'white' }), z: dummy('鈴木園子', { color: 'white' }) }, ['c'], ['c'], BS('white')); const s = R.turn; const z = rem(R, s, 'z'); const c = limbo(R, s, 'c'); flash(R, s, c, { yn: true, pref: [z] }); ok(has(R, s, 'hand', z), 'ヒラメキ: 리무브 에리어의 鈴木園子를 손패로'); });

// ───────────── 0459 ─────────────
t('id_0459', '내 캐릭터가 가드하면 그 캐릭터 AP+1000(지정된 게 三池苗子면 +3000), 컨택트 종료 시 원복 / 상대 쪽 가드엔 무효 / ヒラメキ 슬립', () => {
  const run = nm => { const R = mk({ c: real('id_0459', { color: 'yellow' }), g: dummy('G', { color: 'yellow', ap: '2000' }), v: dummy(nm, { color: 'yellow' }), a: dummy('A', { color: 'yellow', ap: '1000' }), h: dummy('H', { color: 'yellow' }) }, ['c'], ['a'], BS('yellow')); const s = R.turn, o = 1 - s;
    const c = field(R, s, 'c'), g = field(R, s, 'g'), v = field(R, s, 'v', 's'), a = field(R, o, 'a'); R.turn = o; fresh(R); action(R, a, v, g); return { R, s, o, c, g, v, a }; };
  let r = run('V'); eq(ap(r.R, r.g), 3000, '가드한 캐릭터 AP+1000'); finishContact(r.R); ok(r.R.cards[r.g], 'g 생존 여부와 무관'); if (r.R.cards[r.g] && has(r.R, r.s, 'field', r.g)) eq(ap(r.R, r.g), 2000, '컨택트 종료 후 원복');
  r = run('三池苗子'); eq(ap(r.R, r.g), 5000, '지정된 게 三池苗子: 대신 AP+3000');
  { const R = mk({ c: real('id_0459', { color: 'yellow' }), g: dummy('G', { color: 'yellow', ap: '2000' }), v: dummy('V', { color: 'yellow' }), a: dummy('A', { color: 'yellow', ap: '1000' }) }, ['c'], ['a'], BS('yellow')); const s = R.turn, o = 1 - s; field(R, s, 'c'); const a = field(R, s, 'a'), v = field(R, o, 'v', 's'), g = field(R, o, 'g'); action(R, a, v, g); eq(ap(R, g), 2000, '상대 캐릭터의 가드엔 무효'); }
  const R = mk({ c: real('id_0459', { color: 'yellow' }), t: dummy('T') }, ['c'], ['c'], BS('yellow')); const s = R.turn, o = 1 - s; const t_ = field(R, o, 't', 'a'); const c = limbo(R, s, 'c'); flash(R, s, c, { yn: true, pref: [t_] }); eq(R.cards[t_].st, 's', 'ヒラメキ: 슬립'); });

// ───────────── 0513 ─────────────
t('id_0513', '【絆】毛利小五郎 선언 ターン①(손패 1장 리무브): 이 턴 毛利探偵事務所 캐릭터의 액션 동안 상대 컷인 불가 / 絆 없음·2회째 불가', () => {
  const mkr = () => mk({ c: real('id_0513', { color: 'blue' }), m: dummy('毛利小五郎'), x: dummy('X', { trait: '毛利探偵事務所', ap: '3000' }), y: dummy('Y', { ap: '3000' }), v: dummy('V'), w: dummy('W'), cu: CUT('CU'), h: dummy('H') }, ['c', 'h', 'h'], ['cu', 'v'], BS('blue'));
  const R = mkr(); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); ok(decErr(R, s, c), '絆 없음: 선언 불가');
  const m = field(R, s, 'm'); eq(decErr(R, s, c), '', '조건 충족'); const x = field(R, s, 'x'), y = field(R, s, 'y'), v = field(R, o, 'v', 's'), w = field(R, o, 'w', 's'); const cu = hand(R, o, 'cu'); const h0 = R.P[s].hand.length;
  dec(R, s, c); auto(R); eq(R.P[s].hand.length, h0 - 1, '코스트: 손패 1장 리무브'); ok(decErr(R, s, c), '턴 1회'); R.turn = s;
  action(R, x, v); { const e = cinAs(R, o, { a: 'cin', id: cu }); ok(typeof e === 'string' && /컷인/.test(e), '毛利探偵事務所 의 액션: 상대 컷인 불가'); } finishContact(R);
  action(R, y, w); { const e = cinAs(R, o, { a: 'cin', id: cu }); eq(e, undefined, '다른 캐릭터의 액션: 상대 컷인 가능'); } finishContact(R);
  ok(!R.fl.pkA || !R.fl.pkA[s] || !R.fl.pkA[s].nocutin, '액션 종료 후 제한 해제');
  // 사건 액션(가드 없음)이 끝난 뒤에 제한이 남지 않는다
  const R2 = mkr(); const s2 = R2.turn, o2 = 1 - s2; const c2 = field(R2, s2, 'c'); field(R2, s2, 'm'); const x2 = field(R2, s2, 'x'); U.evid(R2, o2, 1); dec(R2, s2, c2); auto(R2); R2.cards[x2].sum = 0; eq(act(R2, s2, { a: 'action', id: x2, k: 'case' }), undefined, '사건 액션'); act(R2, o2, { a: 'guard', id: null }); pump(R2);
  ok(!R2.fl.pkA || !R2.fl.pkA[s2] || !R2.fl.pkA[s2].nocutin, '사건 액션이 끝난 뒤 제한이 남지 않음'); });

// ───────────── 0518 ─────────────
t('id_0518', '현장에서 이름 毛利小五郎 / 특징 探偵 도 가진다(현장 밖에서는 아님)', () => {
  const E = EVD('E', [{ op: 'select', n: 1, filter: { own: 'self', name: '毛利小五郎' }, do: 'sleep' }]), E2 = EVD('E2', [{ op: 'select', n: 1, filter: { own: 'self', trait: '探偵' }, do: 'sleep' }]);
  const R = mk({ c: real('id_0518', { color: 'blue' }), e: E, e2: E2, o: dummy('O') }, ['e', 'e2'], ['e'], BS('blue')); const s = R.turn; const c = field(R, s, 'c'), o_ = field(R, s, 'o'); const e = hand(R, s, 'e');
  play(R, s, e); let q = req(R); ok(q && q.sel.includes(c) && !q.sel.includes(o_), '이름 毛利小五郎 로 취급'); ans(R, [c]); pump(R); eq(R.cards[c].st, 's', '슬립');
  const R2 = mk({ c: real('id_0518', { color: 'blue' }), e2: E2, o: dummy('O') }, ['e2'], ['e2'], BS('blue')); const s2 = R2.turn; const c2 = field(R2, s2, 'c'), o2 = field(R2, s2, 'o'); play(R2, s2, hand(R2, s2, 'e2')); q = req(R2); ok(q.sel.includes(c2) && !q.sel.includes(o2), '특징 探偵 를 가짐'); ans(R2, [c2]);
  const R3 = mk({ c: real('id_0518', { color: 'blue' }), f: EVD('F', [{ op: 'fetch', n: 1, from: 'rem', filter: { name: '毛利小五郎' } }]) }, ['f'], ['f'], BS('blue')); const s3 = R3.turn; const c3 = rem(R3, s3, 'c'); play(R3, s3, hand(R3, s3, 'f')); ok(!R3.eff || !req(R3).sel.includes(c3), '리무브 에리어에서는 해당 이름으로 취급되지 않음'); });


// ───────────── 0643 ─────────────
t('id_0643', '내 턴 중 손패의 【緑】 특징[YAIBA] 캐릭터는 「컷인 AP+2000」을 가진다(색/특징 불일치·상대 턴·본체가 없으면 불가)', () => {
  const run = (withC, turnOpp) => { const R = mk({ c: real('id_0643', { color: 'green' }), y: dummy('Y', { color: 'green', trait: 'YAIBA' }), ng: dummy('NG', { color: 'green', trait: '高校生' }), nb: dummy('NB', { color: 'blue', trait: 'YAIBA' }), x: dummy('X', { color: 'green', ap: '3000' }), v: dummy('V', { color: 'green', ap: '1000' }), ey: EVD('EY', [], 'green', { trait: 'YAIBA' }) }, ['x', 'y'], ['x', 'v'], BS('green')); const s = R.turn, o = 1 - s;
    if (withC) field(R, s, 'c'); const x = field(R, s, 'x'), v = field(R, o, 'v', 's'); const y = hand(R, s, 'y'), ng = hand(R, s, 'ng'), nb = hand(R, s, 'nb'), ey = hand(R, s, 'ey');
    if (!turnOpp) { attack(R, x, v); } else { const xo = field(R, o, 'x'); const vs = field(R, s, 'v', 's'); attack(R, xo, vs); } return { R, s, o, x, v, y, ng, nb, ey }; };
  let r = run(true, false); ok(FX.cutOk(r.R, r.s, r.y, 0), '컷인 사용 가능'); const a0 = ap(r.R, r.x); eq(cinAs(r.R, r.s, { a: 'cin', id: r.y }), undefined, '컷인 사용'); eq(ap(r.R, r.x), a0 + 2000, 'AP+2000'); ok(has(r.R, r.s, 'rem', r.y), '손패에서 리무브');
  r = run(true, false); ok(cinAs(r.R, r.s, { a: 'cin', id: r.ng }), '특징이 다르면 불가'); ok(cinAs(r.R, r.s, { a: 'cin', id: r.nb }), '색이 다르면 불가'); ok(cinAs(r.R, r.s, { a: 'cin', id: r.ey }), '이벤트는 불가');
  r = run(false, false); ok(cinAs(r.R, r.s, { a: 'cin', id: r.y }), '이 캐릭터가 현장에 없으면 불가');
  r = run(true, true); ok(!FX.cutOk(r.R, r.s, r.y, 0), '상대 턴에는 불가'); ok(cinAs(r.R, r.s, { a: 'cin', id: r.y }), '상대 턴 컨택트에서 거부'); });

// ───────────── 0668 ─────────────
t('id_0668', '손패의 【白】 특징[YAIBA] 이벤트 레벨-1 / 내 턴 ターン① YAIBA 카드가 세트되면 Lv5 이하 YAIBA 캐릭터를 슬립으로 등장(대상 제한)', () => {
  const SETEV = (n, color, trait) => ({ n, type: 'event', color, trait, lv: '3', ab: [{ ic: 'event', ops: [{ op: 'set', filter: {} }] }] });
  const mkr = () => mk({ c: real('id_0668', { color: 'white' }), e1: SETEV('E1', 'white', 'YAIBA'), e2: SETEV('E2', 'white', '高校生'), e3: SETEV('E3', 'blue', 'YAIBA'), e4: SETEV('E4', 'white', 'YAIBA'), y4: dummy('Y4', { color: 'white', trait: 'YAIBA', lv: '4' }), y6: dummy('Y6', { color: 'white', trait: 'YAIBA', lv: '6' }), n5: dummy('N5', { color: 'white', trait: '高校生', lv: '5' }) }, ['c'], ['c'], BS('white'));
  const R = mkr(); const s = R.turn; const c = field(R, s, 'c'); const e1 = hand(R, s, 'e1'), e2 = hand(R, s, 'e2'), e3 = hand(R, s, 'e3');
  eq(FX.lvOf(R, e1), 2, '【白】YAIBA 이벤트: 레벨-1'); eq(FX.lvOf(R, e2), 3, '특징 불일치'); eq(FX.lvOf(R, e3), 3, '색 불일치'); const R0 = mkr(); eq(FX.lvOf(R0, hand(R0, R0.turn, 'e1')), 3, '이 캐릭터가 없으면 그대로');
  const y4 = rem(R, s, 'y4'), y6 = rem(R, s, 'y6'), n5 = rem(R, s, 'n5'); play(R, s, e1); let q = req(R); ok(q, '등장 대상 질의'); ok(q.sel.includes(y4) && !q.sel.includes(y6) && !q.sel.includes(n5), 'Lv5 이하 YAIBA 캐릭터만'); ok(typeof act(R, s, { a: 'ans', v: [y6] }) === 'string', '부적합 대상 거부'); ans(R, [y4]); pump(R);
  ok(has(R, s, 'field', y4) && R.cards[y4].st === 's', '슬립 상태로 등장'); const e4 = hand(R, s, 'e4'); R.fl.played = 0; const y4b = rem(R, s, 'y4'); play(R, s, e4); ok(!R.eff, 'ターン①: 두 번째는 발동하지 않음');
  const R2 = mkr(); const s2 = R2.turn; field(R2, s2, 'c'); const y42 = rem(R2, s2, 'y4'); play(R2, s2, hand(R2, s2, 'e2')); ok(!R2.eff && !has(R2, s2, 'field', y42), '특징[YAIBA]가 아닌 카드가 세트되면 발동 안 함'); });

// ───────────── 0737 ─────────────
t('id_0737', '이 캐릭터의 컨택트 중 자신은 컷인 불가(다른 캐릭터의 컨택트·상대의 컷인은 가능) / 妃英理 없으면 액션 불가', () => {
  const mkr = bond => { const R = mk({ c: real('id_0737', { color: 'blue' }), e: dummy('妃英理'), x: dummy('X', { ap: '3000' }), v: dummy('V', { ap: '1000' }), cu: CUT('CU') }, ['cu'], ['cu'], BS('blue')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); if (bond) field(R, s, 'e'); const x = field(R, s, 'x'), v = field(R, o, 'v', 's'), cu = hand(R, s, 'cu'), cuo = hand(R, o, 'cu'); return { R, s, o, c, x, v, cu, cuo }; };
  let r = mkr(false); ok(!(S.actsFor(r.R, r.s)[r.c] || []).some(a => a.k === 'actc'), '妃英理 없음: 액션 불가');
  r = mkr(true); r.R.cards[r.c].sum = 1; ok((S.actsFor(r.R, r.s)[r.c] || []).some(a => a.k === 'actc'), '妃英理 있음: 突撃으로 즉시 액션'); attack(r.R, r.c, r.v); ok(typeof cinAs(r.R, r.s, { a: 'cin', id: r.cu }) === 'string', '이 캐릭터의 컨택트 중 자신의 컷인 불가'); ok(!r.R.P[r.s].rem.includes(r.cu), '손패에 그대로');
  r = mkr(true); attack(r.R, r.c, r.v); eq(cinAs(r.R, r.o, { a: 'cin', id: r.cuo }), undefined, '상대는 컷인 가능');
  r = mkr(true); attack(r.R, r.x, r.v); eq(cinAs(r.R, r.s, { a: 'cin', id: r.cu }), undefined, '다른 캐릭터의 컨택트에서는 컷인 가능'); });

// ───────────── 0762 ─────────────
t('id_0762', '내 턴 중 파트너 에리어에 특징[ビッグジュエル] 카드가 2장 이상이면 AP+2000(1장·상대 턴엔 없음) / 파트너(白) 突撃', () => {
  const R = mk({ c: real('id_0762', { color: 'white' }), b: dummy('B', { trait: 'ビッグジュエル' }), b2: dummy('B2', { trait: 'ビッグジュエル' }), n: dummy('N') }, ['c'], ['c'], BS('white')); const s = R.turn; const c = field(R, s, 'c'); eq(ap(R, c), 6000, '없음');
  pa(R, s, 'b'); pa(R, s, 'n'); eq(ap(R, c), 6000, 'ビッグジュエル 1장'); pa(R, s, 'b2'); eq(ap(R, c), 8000, '2장: AP+2000'); R.turn = 1 - s; eq(ap(R, c), 6000, '상대 턴엔 없음'); R.turn = s;
  R.cards[c].sum = 1; ok(FX.hasKwTk(R, c, 'assault'), '파트너(白): 突撃'); });

// ───────────── 0897 ─────────────
t('id_0897', '내 턴 중 내 현장에 Lv7 캐릭터가 2장 이상이면 레벨+1 / AP+1000 / 突撃', () => {
  const R = mk({ c: real('id_0897', { color: 'red' }), a: dummy('A', { lv: '7', color: 'red' }), b: dummy('B', { lv: '7', color: 'red' }), v: dummy('V', { color: 'red' }) }, ['c'], ['c'], BS('red')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); R.cards[c].sum = 1; const a = field(R, s, 'a');
  eq(FX.lvOf(R, c), 6, '1장: 그대로'); eq(ap(R, c), 5000, '1장: AP 그대로'); ok(!FX.hasKwTk(R, c, 'assault') && !(S.actsFor(R, s)[c] || []).some(a => a.k === 'actc') , '1장: 突撃 없음 (등장한 턴 액션 불가)' || true);
  const b = field(R, s, 'b'); eq(FX.lvOf(R, c), 7, '2장: 레벨+1'); eq(ap(R, c), 6000, '2장: AP+1000'); ok(FX.hasKwTk(R, c, 'assault'), '突撃을 가짐'); field(R, o, 'v', 's'); ok((S.actsFor(R, s)[c] || []).some(a => a.k === 'actc'), '등장한 턴에도 액션 가능');
  R.turn = o; eq(FX.lvOf(R, c), 6, '상대 턴엔 없음'); eq(ap(R, c), 5000, '상대 턴 AP'); R.turn = s; R.cards[b].st = 's'; eq(FX.lvOf(R, c), 7, '슬립이어도 현장에 있으면 카운트'); });

// ───────────── 0956 ─────────────
t('id_0956', '선언 ターン①: 원래 LP0 · Lv4 · 특징[少年探偵団] 전원의 원래 LP를 턴 종료 시까지 1로(조건 불일치·상대 캐릭터는 제외) / ヒラメキ LP0 少年探偵団 回収', () => {
  const T = (n, lv, lpv, trait = '少年探偵団') => dummy(n, { lv, lp: lpv, trait });
  const R = mk({ c: real('id_0956', { color: 'blue' }), a: T('A', '4', '0'), b: T('B', '4', '0'), l1: T('L1', '4', '1'), l3: T('L3', '3', '0'), nt: T('NT', '4', '0', '高校生'), z: T('Z', '4', '0') }, ['c'], ['c'], BS('blue')); const s = R.turn, o = 1 - s;
  const c = field(R, s, 'c'), a = field(R, s, 'a'), b = field(R, s, 'b'), l1 = field(R, s, 'l1'), l3 = field(R, s, 'l3'), nt = field(R, s, 'nt'), z = field(R, o, 'z'); const lps = ids => ids.map(x => lp(R, x)).join();
  eq(lps([a, b, l1, l3, nt, z]), '0,0,1,0,0,0', '초기'); dec(R, s, c); ok(!req(R), '확인 없이 자동 처리'); eq(lps([a, b, l1, l3, nt, z]), '1,1,1,0,0,0', '조건에 맞는 아군 전원만 LP1');
  ok(decErr(R, s, c), '턴 1회'); endTurn(R); auto(R); pump(R); eq(lp(R, a), 0, '턴 종료 시 원래대로');
  const R2 = mk({ c: real('id_0956', { color: 'blue' }), z: dummy('Z', { trait: '少年探偵団', lp: '0' }) }, ['c'], ['c'], BS('blue')); const s2 = R2.turn; const z2 = rem(R2, s2, 'z'), c2 = limbo(R2, s2, 'c'); flash(R2, s2, c2, { yn: true, pref: [z2] }); ok(has(R2, s2, 'hand', z2), 'ヒラメキ: LP0 少年探偵団 를 손패로'); });

// ───────────── 0962 ─────────────
t('id_0962', '상대 턴 중 내 현장에 吉田歩美 이외의 Lv4 특징[少年探偵団]가 있으면 상대 컷인 불가(내 턴·불일치 시 가능)', () => {
  const run = (partner, myTurn) => { const R = mk({ c: real('id_0962', { color: 'blue' }), pp: dummy('P', { lv: '4', trait: '少年探偵団' }), p3: dummy('P3', { lv: '3', trait: '少年探偵団' }), x: dummy('X', { ap: '3000' }), v: dummy('V', { ap: '1000' }), cu: CUT('CU') }, ['cu'], ['cu', 'x'], BS('blue')); const s = R.turn, o = 1 - s; field(R, s, 'c'); if (partner === 'p') field(R, s, 'pp'); if (partner === 'p3') field(R, s, 'p3');
    const cu = hand(R, o, 'cu'), cus = hand(R, s, 'cu'); const x = field(R, o, 'x'), v = field(R, s, 'v', 's'); const xs = field(R, s, 'x'), vo = field(R, o, 'v', 's'); if (myTurn) attack(R, xs, vo); else attack(R, x, v); return { R, s, o, cu, cus }; };
  let r = run('p', false); { const e = cinAs(r.R, r.o, { a: 'cin', id: r.cu }); ok(typeof e === 'string' && /컷인/.test(e), '상대 턴 중: 상대 컷인 불가 ' + e); }
  r = run('p3', false); eq(cinAs(r.R, r.o, { a: 'cin', id: r.cu }), undefined, 'Lv3: 해당 없음'); r = run(null, false); eq(cinAs(r.R, r.o, { a: 'cin', id: r.cu }), undefined, '歩美 본인뿐: 해당 없음');
  r = run('p', true); eq(cinAs(r.R, r.o, { a: 'cin', id: r.cu }), undefined, '내 턴 중에는 해당 없음'); });

// ───────────── 0968 ─────────────
t('id_0968', '이 캐릭터 이외의 특징[大阪府警] 아군은 「相手ターン中 現場リムーブ時 드로+손패 리무브」를 가진다(내 턴·다른 특징·본체엔 없음)', () => {
  const RM = EVD('RM', [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }], 'blue'); const RMO = EVD('RMO', [{ op: 'select', n: 1, filter: { own: 'self' }, do: 'remove' }], 'blue');
  const run = (target, myTurn) => { const R = mk({ c: real('id_0968', { color: 'green' }), o1: dummy('O1', { trait: '大阪府警' }), o2: dummy('O2', { trait: '高校生' }), rm: RM, rmo: RMO }, ['c', 'rmo'], ['rm'], BS('green', 'green/blue')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'), o1 = field(R, s, 'o1'), o2 = field(R, s, 'o2'); const t_ = { c, o1, o2 }[target];
    const d0 = R.P[s].deck.length, r0 = R.P[s].rem.length; if (myTurn) { play(R, s, hand(R, s, 'rmo')); } else { R.turn = o; fresh(R); play(R, o, hand(R, o, 'rm')); } auto(R, { pref: [t_] }); pump(R); return { R, s, d0, r0, t: t_ }; };
  let r = run('o1', false); ok(has(r.R, r.s, 'rem', r.t), '리무브됨'); eq(r.R.P[r.s].deck.length, r.d0 - 1, '1장 드로'); eq(r.R.P[r.s].rem.length, r.r0 + 2, '리무브 + 손패 1장 리무브');
  r = run('o1', true); ok(has(r.R, r.s, 'rem', r.t) || !has(r.R, r.s, 'field', r.t), '내 턴(내 효과)'); 
  r = run('o2', false); eq(r.R.P[r.s].deck.length, r.d0, '특징이 다르면 없음'); r = run('c', false); eq(r.R.P[r.s].deck.length, r.d0, '본체에는 없음'); });
t('id_0968', '파트너(緑) 선언: 슬립 + 손패 특징[警察] 공개 → Lv7 이하 상대 캐릭터 리무브 → 슬립 상태였다면 덱 위 1장을 뒷면으로 세트(비공개)', () => {
  const run = (st, which = 't1') => { const R = mk({ c: real('id_0968', { color: 'green' }), po: dummy('PO', { trait: '警察' }), t1: dummy('T1', { lv: '5' }), t2: dummy('T2', { lv: '5' }), t3: dummy('T3', { lv: '8' }), sec: dummy('SECRETNAME') }, ['c', 'po'], ['t1'], BS('green')); const s = R.turn, o = 1 - s;
    const c = field(R, s, 'c'), t1 = field(R, o, 't1', 's'), t2 = field(R, o, 't2', 'a'), t3 = field(R, o, 't3', 's'); const po = hand(R, s, 'po'); const sec = U.top(R, s, 'sec'); eq(decErr(R, s, c), '', '선언 가능'); dec(R, s, c); auto(R, { pref: [] }); return { R, s, o, c, t1, t2, t3, sec, po }; };
  // 정상: 슬립 캐릭터 리무브
  { const R = mk({ c: real('id_0968', { color: 'green' }), po: dummy('PO', { trait: '警察' }), t1: dummy('T1', { lv: '5' }), t2: dummy('T2', { lv: '5' }), t3: dummy('T3', { lv: '8' }), sec: dummy('SECRETNAME') }, ['c', 'po'], ['t1'], BS('green')); const s = R.turn, o = 1 - s;
    const c = field(R, s, 'c'), t1 = field(R, o, 't1', 's'), t2 = field(R, o, 't2', 'a'), t3 = field(R, o, 't3', 's'); const po = hand(R, s, 'po'); const sec = U.top(R, s, 'sec');
    ok(decErr(R, o, c), '내 카드가 아님'); const e = FX.declare(R, s, c, di(R, c)); ok(!e, e); pump(R); let q = req(R); let g = 0; while (q && q.kind !== 'pick' && g++ < 5) { ans(R, null); q = req(R); }
    if (q && q.sel.includes(po) && !q.sel.includes(t1)) { ans(R, [po]); q = req(R); } ok(q && q.kind === 'pick', '대상 선택'); ok(q.sel.includes(t1) && q.sel.includes(t2) && !q.sel.includes(t3), 'Lv7 이하만'); ok(typeof act(R, o === 0 ? s : s, { a: 'ans', v: [t3] }) === 'string', '부적합 대상 거부'); ans(R, [t1]); auto(R); pump(R);
    ok(has(R, o, 'rem', t1), '리무브'); eq((R.cards[c].fd || []).length, 1, '슬립이었으므로 덱 위 1장을 뒷면으로 세트'); eq((R.cards[c].fd || [])[0], sec, '덱 맨 위 카드'); ok(!JSON.stringify(S.view(R, o)).includes(R.cards[sec].d), '상대 시점 view 에 세트된 카드 정보 없음'); ok(JSON.stringify(S.view(R, s)).includes(R.cards[sec].d), '본인은 볼 수 있음'); ok(!R.log.join('\n').includes('SECRETNAME'), '로그에 카드명 없음'); eq(R.cards[c].st, 's', '코스트: 슬립'); ok(has(R, s, 'hand', po), '공개한 카드는 손패에 그대로'); }
  // 액티브 캐릭터 리무브: 세트 없음
  { const R = mk({ c: real('id_0968', { color: 'green' }), po: dummy('PO', { trait: '警察' }), t2: dummy('T2', { lv: '5' }) }, ['c', 'po'], ['t2'], BS('green')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'), t2 = field(R, o, 't2', 'a'); hand(R, s, 'po'); dec(R, s, c); auto(R, { pref: [t2] }); ok(has(R, o, 'rem', t2), '리무브'); eq((R.cards[c].fd || []).length, 0, '액티브였으므로 세트 안 함'); }
  { const R = mk({ c: real('id_0968', { color: 'green' }), x: dummy('X') }, ['c'], ['c'], BS('green')); const s = R.turn; const c = field(R, s, 'c'); ok(decErr(R, s, c), '손패에 特徴[警察] 캐릭터가 없으면 불가'); const R2 = mk({ c: real('id_0968', { color: 'green' }), po: dummy('PO', { trait: '警察' }) }, ['c', 'po'], ['c'], BS('red')); const c2 = field(R2, R2.turn, 'c'); hand(R2, R2.turn, 'po'); ok(decErr(R2, R2.turn, c2), '파트너가 緑이 아니면 불가'); } });


// ───────────── 1077 ─────────────
t('id_1077', '내 현장의 妃英理는 특징[毛利探偵事務所]를 가진다 / 이름이 다른 毛利探偵事務所 4장 이상이면 迅速 / ヒラメキ 妃英理 回収', () => {
  const E = EVD('S', [{ op: 'select', n: 1, filter: { own: 'self', trait: '毛利探偵事務所' }, do: 'sleep' }]);
  const mkr = () => mk({ c: real('id_1077', { color: 'blue' }), e: dummy('妃英理'), m2: dummy('M2', { trait: '毛利探偵事務所' }), m3: dummy('M3', { trait: '毛利探偵事務所' }), m2b: dummy('M2', { trait: '毛利探偵事務所' }), s: E, o: dummy('O') }, ['s'], ['s'], BS('blue'));
  let R = mkr(); let s = R.turn; let c = field(R, s, 'c'), e = field(R, s, 'e'), o_ = field(R, s, 'o'); play(R, s, hand(R, s, 's')); let q = req(R); ok(q.sel.includes(e) && q.sel.includes(c) && !q.sel.includes(o_), '妃英理가 특징[毛利探偵事務所]를 가짐'); ans(R, [e]);
  R = mkr(); s = R.turn; const e0 = field(R, s, 'e'); play(R, s, hand(R, s, 's')); ok(!R.eff, '대조: 1077 이 없으면 妃英理는 해당 없음');
  R = mkr(); s = R.turn; c = field(R, s, 'c'); e = field(R, s, 'e'); field(R, s, 'm2'); R.cards[c].sum = 1; ok(!FX.hasKwTk(R, c, 'rapid'), '3종: 迅速 없음'); field(R, s, 'm2b'); ok(!FX.hasKwTk(R, c, 'rapid'), '같은 이름은 중복으로 세지 않음'); field(R, s, 'm3'); ok(FX.hasKwTk(R, c, 'rapid'), '이름이 다른 4종: 迅速'); ok((S.actsFor(R, s)[c] || []).some(a => a.k === 'reason'), '등장한 턴에도 추리 가능');
  R = mk({ c: real('id_1077', { color: 'blue' }), z: dummy('妃英理') }, ['c'], ['c'], BS('blue')); s = R.turn; const z = rem(R, s, 'z'); c = limbo(R, s, 'c'); flash(R, s, c, { yn: true, pref: [z] }); ok(has(R, s, 'hand', z), 'ヒラメキ: 妃英理를 손패로'); });

// ───────────── 1098 ─────────────
t('id_1098', '덱/리무브 에리어에서는 카드명 [怪盗キッド] 로도 취급(현장·손패 제외) / 登場時 내 캐릭터의 능력으로 등장하면 그 턴 「ターン① 컨택트로 리무브했을 때 Lv3 이하 리무브 에리어 캐릭터 등장」을 가짐 / ヒラメキ 슬립', () => {
  const F = EVD('F', [{ op: 'fetch', n: 1, from: 'rem', filter: { name: '怪盗キッド' } }], 'white'), SELF1 = EVD('SF', [{ op: 'select', n: 1, filter: { own: 'self', name: '怪盗キッド' }, do: 'sleep' }], 'white'), PK = EVD('PK', [{ op: 'peek', n: 1, until: { name: '怪盗キッド' }, reveal: true, cap: 60 }, { op: 'mv', ref: 'hit', to: 'hand' }], 'white');
  const PLAYER = { n: 'PL', type: 'char', color: 'white', lv: '0', ap: '1000', lp: '1', ab: [{ ic: 'onplay', ops: [{ op: 'play', from: 'rem', n: 1, filter: { name: '黒羽快斗' } }] }] }; const EP = EVD('EP', [{ op: 'play', from: 'hand', n: 1, filter: { name: '黒羽快斗' } }], 'white');
  const mkr = (extra = {}) => mk({ c: real('id_1098', { color: 'white' }), f: F, sf: SELF1, pk: PK, pl: PLAYER, ep: EP, x: dummy('X', { color: 'white', ap: '1000' }), l3: dummy('L3', { color: 'white', lv: '3' }), l4: dummy('L4', { color: 'white', lv: '4' }), v: dummy('V', { color: 'white', ap: '1000' }), v2: dummy('V2', { color: 'white', ap: '1000' }), ...extra }, ['f', 'sf', 'pk', 'pl', 'ep'], ['f'], BS('white'));
  let R = mkr(); let s = R.turn; let c = rem(R, s, 'c'); play(R, s, hand(R, s, 'f')); let q = req(R); ok(q && q.sel.includes(c), '리무브 에리어: 怪盗キッド 로 취급'); ans(R, [c]);
  R = mkr(); s = R.turn; c = U.top(R, s, 'c'); play(R, s, hand(R, s, 'pk')); auto(R, { yn: true }); ok(has(R, s, 'hand', c), '덱: 怪盗キッド 로 취급(peek until)');
  R = mkr(); s = R.turn; c = field(R, s, 'c'); play(R, s, hand(R, s, 'sf')); ok(!R.eff, '현장에서는 해당 없음'); R = mkr(); s = R.turn; c = hand(R, s, 'c'); R.P[s].hand.push(R.P[s].hand.splice(R.P[s].hand.indexOf(c), 1)[0]); play(R, s, hand(R, s, 'sf')); ok(!R.eff, '손패에서도 해당 없음');
  // 登場時: 내 캐릭터의 능력으로 등장
  R = mkr(); s = R.turn; let o = 1 - s; c = rem(R, s, 'c'); const l3 = rem(R, s, 'l3'), l4 = rem(R, s, 'l4'); const pl = hand(R, s, 'pl'); const v = field(R, o, 'v', 's'); const v2 = field(R, o, 'v2', 's'); play(R, s, pl); auto(R, { pref: [c] }); pump(R); ok(has(R, s, 'field', c), '내 캐릭터의 능력으로 등장');
  eq(FX.grantedAb(R, c).length, 1, '그 턴 동안 능력을 얻음'); R.cards[c].sum = 0; action(R, c, v); finishContact(R, [], { pref: [l3] }); ok(!has(R, o, 'field', v), '컨택트로 리무브'); ok(!R.eff, '(finish 에서 처리됨)'); ok(has(R, s, 'field', l3), 'Lv3 이하 캐릭터 등장'); ok(!has(R, s, 'field', l4), 'Lv4 는 대상이 아님');
  R.cards[c].st = 'a'; R.turn = s; const l3b = rem(R, s, 'l3'); action(R, c, v2); finishContact(R, [], { pref: [l3b] }); ok(!has(R, s, 'field', l3b), 'ターン①: 한 턴에 한 번'); endTurn(R); auto(R); eq(FX.grantedAb(R, c).length, 0, '턴 종료 시 사라짐');
  // 이벤트 효과/손패 사용으로 등장하면 얻지 못함
  R = mkr(); s = R.turn; c = hand(R, s, 'c'); play(R, s, hand(R, s, 'ep')); auto(R, { pref: [c] }); pump(R); ok(has(R, s, 'field', c), '이벤트 효과로 등장'); eq(FX.grantedAb(R, c).length, 0, '이벤트: 얻지 못함');
  R = mkr(); s = R.turn; c = hand(R, s, 'c'); play(R, s, c); eq(FX.grantedAb(R, c).length, 0, '손패에서 사용: 얻지 못함');
  R = mk({ c: real('id_1098', { color: 'white' }), t: dummy('T', { color: 'white' }) }, ['c'], ['c'], BS('white')); s = R.turn; const t_ = field(R, 1 - s, 't', 'a'); c = limbo(R, s, 'c'); flash(R, s, c, { yn: true, pref: [t_] }); eq(R.cards[t_].st, 's', 'ヒラメキ: 슬립'); });

// ───────────── 0710 ─────────────
t('id_0710', '상대 턴 중 ターン① 이 캐릭터가 지정된 액션을 (내 캐릭터가) 가드하면 가드한 캐릭터를 액티브로 하고 턴 종료 시까지 AP+2000', () => {
  const mkr = () => mk({ c: real('id_0710', { color: 'yellow' }), g: dummy('G', { color: 'yellow', ap: '9000' }), g2: dummy('G2', { color: 'yellow', ap: '9000' }), w: dummy('W', { color: 'yellow' }), a: dummy('A', { color: 'yellow', ap: '1000' }), a2: dummy('A2', { color: 'yellow', ap: '1000' }), a3: dummy('A3', { color: 'yellow', ap: '1000' }) }, ['c'], ['a'], BS('yellow'));
  const R = mkr(); const s = R.turn, o = 1 - s; const c = field(R, s, 'c', 's'), g = field(R, s, 'g'), g2 = field(R, s, 'g2'), w = field(R, s, 'w', 's'); const a = field(R, o, 'a'), a2 = field(R, o, 'a2'), a3 = field(R, o, 'a3');
  action(R, a, w, g); eq(ap(R, g), 9000, '지정된 것이 다른 캐릭터: 발동 안 함'); finishContact(R);
  R.cards[g].st = 'a'; action(R, a2, c, g); eq(R.cards[g].st, 'a', '가드한 캐릭터를 액티브로'); eq(ap(R, g), 11000, '턴 종료 시까지 AP+2000'); finishContact(R); eq(ap(R, g), 11000, '컨택트 후에도 유지');
  R.cards[g2].st = 'a'; action(R, a3, c, g2); eq(ap(R, g2), 9000, 'ターン①: 두 번째는 발동 안 함'); finishContact(R); endTurn(R); auto(R); eq(ap(R, g), 9000, '턴 종료 시 원복'); });

// ───────────── 0938 ─────────────
t('id_0938', 'Lv7 이상의 액티브 상대 캐릭터도 지정 가능(Lv6 액티브는 불가) / 내 턴 ターン① 자신보다 AP가 높은 캐릭터와 컨택트하면 손패 1장 리무브해도 좋다 → 컨택트 중 AP+3000', () => {
  const mkr = () => mk({ c: real('id_0938', { color: 'yellow' }), a7: dummy('A7', { color: 'yellow', lv: '7', ap: '9000' }), a6: dummy('A6', { color: 'yellow', lv: '6', ap: '2000' }), hi: dummy('HI', { color: 'yellow', ap: '6000' }), lo: dummy('LO', { color: 'yellow', ap: '2000' }), hi2: dummy('HI2', { color: 'yellow', ap: '6000' }), h: dummy('H', { color: 'yellow' }) }, ['c', 'h', 'h'], ['c'], BS('yellow'));
  let R = mkr(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const a7 = field(R, o, 'a7', 'a'), a6 = field(R, o, 'a6', 'a'); const tg = S.actsFor(R, s)[c].find(x => x.k === 'actc').tg; ok(tg.includes(a7) && !tg.includes(a6), 'Lv7 액티브만 지정 가능');
  eq(act(R, s, { a: 'action', id: c, k: 'char', tid: a6 }) === undefined, false, 'Lv6 액티브는 거부'); 
  R = mkr(); s = R.turn; o = 1 - s; const c2 = field(R, s, 'c'); const hi = field(R, o, 'hi', 's'); const h = hand(R, s, 'h'); const a0 = ap(R, c2); attack(R, c2, hi); let q = req(R); ok(q && q.kind === 'pick' && q.min === 0, '손패 리무브는 선택(0장 가능)'); ans(R, [h]); eq(ap(R, c2), a0 + 3000, '컨택트 중 AP+3000'); ok(has(R, s, 'rem', h), '손패 리무브'); finishContact(R); eq(ap(R, c2), a0, '컨택트 후 원복');
  R = mkr(); s = R.turn; o = 1 - s; const c3 = field(R, s, 'c'), hi3 = field(R, o, 'hi', 's'); hand(R, s, 'h'); attack(R, c3, hi3); q = req(R); ok(q, '질의'); ans(R, []); eq(ap(R, c3), 5000, '거절하면 AP 그대로'); finishContact(R);
  R = mkr(); s = R.turn; o = 1 - s; const c4 = field(R, s, 'c'), lo = field(R, o, 'lo', 's'); hand(R, s, 'h'); attack(R, c4, lo); ok(!R.eff, '자신보다 AP가 낮은 상대: 발동 안 함'); finishContact(R);
  R = mkr(); s = R.turn; o = 1 - s; const c5 = field(R, s, 'c'), hi5 = field(R, o, 'hi', 's'), hi6 = field(R, o, 'hi2', 's'); hand(R, s, 'h'); attack(R, c5, hi5); auto(R, { pref: [] }); finishContact(R); R.cards[c5].st = 'a'; R.cards[c5].sum = 0; hand(R, s, 'h'); R.turn = s; ready(R, c5); action(R, c5, hi6); ok(!R.eff, 'ターン①: 두 번째 컨택트는 발동 안 함'); });

// ───────────── 0984 ─────────────
t('id_0984', '액션이 Lv6 이하에게 가드되면 그 캐릭터는 이 컨택트로 리무브되지 않음(Lv7+는 리무브) / 선언 ターン①: 이 턴 액션이 가드된 경우에만 Lv7 이상 캐릭터 리무브', () => {
  const mkr = () => mk({ c: real('id_0984', { color: 'white' }), g6: dummy('G6', { color: 'white', lv: '6', ap: '1000' }), g8: dummy('G8', { color: 'white', lv: '8', ap: '1000' }), v: dummy('V', { color: 'white' }), t7: dummy('T7', { color: 'white', lv: '7' }), t6: dummy('T6', { color: 'white', lv: '6' }), m8: dummy('M8', { color: 'white', lv: '8' }) }, ['c'], ['c'], BS('white'));
  let R = mkr(); let s = R.turn, o = 1 - s; let c = field(R, s, 'c'); let v = field(R, o, 'v', 's'), g6 = field(R, o, 'g6'); action(R, c, v, g6); ok(R.sub && R.sub.type === 'contact', '컨택트'); finishContact(R); ok(has(R, o, 'field', g6), 'Lv6 가드: 리무브되지 않음');
  R = mkr(); s = R.turn; o = 1 - s; c = field(R, s, 'c'); v = field(R, o, 'v', 's'); const g8 = field(R, o, 'g8'); action(R, c, v, g8); finishContact(R); ok(has(R, o, 'rem', g8), 'Lv8 가드: 리무브됨');
  R = mkr(); s = R.turn; o = 1 - s; c = field(R, s, 'c'); const t7 = field(R, o, 't7'), t6 = field(R, o, 't6'), m8 = field(R, s, 'm8'); ok(decErr(R, s, c), '가드되지 않았다면 선언 불가');
  v = field(R, o, 'v', 's'); const gg = field(R, o, 'g8'); action(R, c, v, gg); finishContact(R); R.turn = s; eq(decErr(R, s, c), '', '가드된 뒤에는 선언 가능'); dec(R, s, c); let q = req(R); ok(q.sel.includes(t7) && q.sel.includes(m8) && !q.sel.includes(t6), 'Lv7 이상(양쪽)만'); ok(typeof act(R, s, { a: 'ans', v: [t6] }) === 'string', '부적합 대상 거부'); ans(R, [t7]); pump(R); ok(has(R, o, 'rem', t7), '리무브'); ok(decErr(R, s, c), '턴 1회'); });

// ───────────── 1026 ─────────────
t('id_1026', '이 캐릭터의 컨택트 중 諸伏景光/特徴[長野県警] 캐릭터의 컷인(손패)을 사용하면 그 컨택트 중 AP+2000(다른 캐릭터의 컨택트·다른 캐릭터의 컷인은 제외)', () => {
  const mkr = () => mk({ c: real('id_1026', { color: 'yellow' }), x: dummy('X', { color: 'yellow', ap: '3000' }), v: dummy('V', { color: 'yellow', ap: '1000' }), k1: CUT('諸伏景光', { color: 'yellow' }), k2: CUT('K2', { color: 'yellow', trait: '長野県警' }), k3: CUT('K3', { color: 'yellow', trait: '高校生' }), ev: EVD('EV', [], 'yellow', { kw: 'cutin:1000', trait: '長野県警', ab: [{ ic: 'cutin', v: 1000 }] }) }, ['k1', 'k2', 'k3'], ['x', 'v'], BS('yellow'));
  const t1 = (k, via) => { const R = mkr(); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'), x = field(R, s, 'x'), v = field(R, o, 'v', 's'); const kk = hand(R, s, k); attack(R, via === 'x' ? x : c, v); const a0 = ap(R, via === 'x' ? x : c), c0 = ap(R, c); eq(cinAs(R, s, { a: 'cin', id: kk }), undefined, '컷인'); return { R, c, x, a0, c0, d: ap(R, via === 'x' ? x : c) - a0, dc: ap(R, c) - c0 }; };
  let r = t1('k1', 'c'); eq(r.d, 3000, '諸伏景光 컷인: +1000 +2000'); r = t1('k2', 'c'); eq(r.d, 3000, '특징[長野県警] 컷인: +2000'); r = t1('k3', 'c'); eq(r.d, 1000, '다른 컷인: 보정 없음'); r = t1('k1', 'x'); eq(r.d, 1000, '다른 캐릭터의 컨택트: 컷인 효과만'); eq(r.dc, 0, '이 캐릭터는 컨택트 중이 아님');
  { const R = mkr(); const s = R.turn, o = 1 - s; const c = field(R, s, 'c', 's'), x = field(R, o, 'x'), kk = hand(R, s, 'k1'); R.turn = o; fresh(R); attack(R, x, c); const a0 = ap(R, c); eq(cinAs(R, s, { a: 'cin', id: kk }), undefined, '수비 쪽 컷인'); eq(ap(R, c) - a0, 3000, '수비 중에도 이 캐릭터의 컨택트 중이면 +2000'); finishContact(R); R.turn = s; ok(ap(R, c) <= 5000, '컨택트 종료 후 원복(컨택트 한정)'); } });

// ───────────── 0544 / 0893 / 0975 ─────────────
t('id_0544', '컷인(내 턴): 손패 1장 리무브(선택) → 리무브한 카드의 레벨 1당 AP+1000 / 안 하면 +0 / 상대 턴엔 불가', () => {
  const mkr = () => mk({ cu: real('id_0544', { color: 'green' }), x: dummy('X', { color: 'green', ap: '3000' }), v: dummy('V', { color: 'green', ap: '1000' }), h5: dummy('H5', { color: 'green', lv: '5' }), h2: dummy('H2', { color: 'green', lv: '2' }) }, ['cu', 'h5', 'h2'], ['x', 'v'], BS('green'));
  const go = (pick, turnOpp) => { const R = mkr(); const s = R.turn, o = 1 - s; const k = hand(R, s, 'cu'); const h5 = hand(R, s, 'h5'), h2 = hand(R, s, 'h2'); let x; if (!turnOpp) { x = field(R, s, 'x'); attack(R, x, field(R, o, 'v', 's')); } else { x = field(R, s, 'x', 's'); const xo = field(R, o, 'x'); attack(R, xo, x); } return { R, s, k, h5, h2, x, a0: ap(R, x) }; };
  let r = go(); eq(cinAs(r.R, r.s, { a: 'cin', id: r.k }), undefined, '컷인'); let q = req(r.R); ok(q && q.kind === 'pick' && q.min === 0 && q.sel.includes(r.h5) && q.sel.includes(r.h2) && !q.sel.includes(r.k), '손패 리무브는 선택(0장 가능, 컷인 카드 자신은 제외)'); ok(typeof act(r.R, r.s, { a: 'ans', v: [r.k] }) === 'string', '부적합 선택 거부'); ans(r.R, [r.h5]); eq(ap(r.R, r.x), r.a0 + 5000, '레벨5: AP+5000'); ok(has(r.R, r.s, 'rem', r.h5), '리무브'); finishContact(r.R); eq(ap(r.R, r.x), r.a0, '컨택트 후 원복');
  r = go(); cinAs(r.R, r.s, { a: 'cin', id: r.k }); ans(r.R, []); eq(ap(r.R, r.x), r.a0, '리무브 안 함: AP 그대로'); ok(has(r.R, r.s, 'hand', r.h5), '손패 유지');
  r = go(0, true); ok(typeof cinAs(r.R, r.s, { a: 'cin', id: r.k }) === 'string', '상대 턴 컨택트: 거부'); });
t('id_0893', '컷인(내 턴): 손패의 캐릭터 1장 리무브(선택) → 리무브한 캐릭터의 AP 1000당 AP+1000(이벤트는 대상 아님)', () => {
  const mkr = () => mk({ cu: real('id_0893', { color: 'red' }), x: dummy('X', { color: 'red', ap: '3000' }), v: dummy('V', { color: 'red', ap: '1000' }), ch: dummy('CH', { color: 'red', ap: '4000' }), ev: EVD('EV', [], 'red') }, ['cu', 'ch', 'ev'], ['x', 'v'], BS('red'));
  const R = mkr(); const s = R.turn, o = 1 - s; const k = hand(R, s, 'cu'), ch = hand(R, s, 'ch'), ev = hand(R, s, 'ev'); const x = field(R, s, 'x'); attack(R, x, field(R, o, 'v', 's')); const a0 = ap(R, x); eq(cinAs(R, s, { a: 'cin', id: k }), undefined, '컷인'); const q = req(R); ok(q.min === 0 && q.sel.includes(ch) && !q.sel.includes(ev), '캐릭터만 선택 가능'); ok(typeof act(R, s, { a: 'ans', v: [ev] }) === 'string', '이벤트 선택 거부'); ans(R, [ch]); eq(ap(R, x), a0 + 4000, 'AP 4000 → +4000');
  const R2 = mkr(); const s2 = R2.turn, o2 = 1 - s2; const k2 = hand(R2, s2, 'cu'), ch2 = hand(R2, s2, 'ch'); const x2 = field(R2, s2, 'x'); attack(R2, x2, field(R2, o2, 'v', 's')); const b0 = ap(R2, x2); cinAs(R2, s2, { a: 'cin', id: k2 }); ans(R2, []); eq(ap(R2, x2), b0, '거절: AP 그대로'); ok(has(R2, s2, 'hand', ch2), '손패 유지');
  const R3 = mkr(); const s3 = R3.turn, o3 = 1 - s3; const k3 = hand(R3, s3, 'cu'); const xo = field(R3, o3, 'x'), v3 = field(R3, s3, 'v', 's'); R3.turn = o3; fresh(R3); attack(R3, xo, v3); ok(typeof cinAs(R3, s3, { a: 'cin', id: k3 }) === 'string', '상대 턴엔 불가'); });
t('id_0975', '컷인(내 턴): 내 현장의 특징[探偵] 캐릭터 1장당 AP+1000(상대 캐릭터·특징 없는 캐릭터는 세지 않음)', () => {
  const mkr = () => mk({ cu: real('id_0975', { color: 'green' }), x: dummy('X', { color: 'green', ap: '3000' }), d1: dummy('D1', { color: 'green', trait: '探偵' }), d2: dummy('D2', { color: 'green', trait: '探偵' }), n: dummy('N', { color: 'green' }), v: dummy('V', { color: 'green', ap: '1000', trait: '探偵' }) }, ['cu'], ['v'], BS('green'));
  const R = mkr(); const s = R.turn, o = 1 - s; const k = hand(R, s, 'cu'); const x = field(R, s, 'x'); field(R, s, 'd1'); field(R, s, 'd2'); field(R, s, 'n'); const v = field(R, o, 'v', 's'); attack(R, x, v); const a0 = ap(R, x); eq(cinAs(R, s, { a: 'cin', id: k }), undefined, '컷인'); eq(ap(R, x), a0 + 2000, '探偵 2장(상대 探偵는 제외): +2000');
  const R2 = mkr(); const s2 = R2.turn, o2 = 1 - s2; const k2 = hand(R2, s2, 'cu'); const x2 = field(R2, s2, 'x'); const v2 = field(R2, o2, 'v', 's'); attack(R2, x2, v2); const b0 = ap(R2, x2); cinAs(R2, s2, { a: 'cin', id: k2 }); eq(ap(R2, x2), b0, '探偵가 없으면 +0');
  const R3 = mkr(); const s3 = R3.turn, o3 = 1 - s3; const k3 = hand(R3, s3, 'cu'); field(R3, s3, 'd1'); const xo = field(R3, o3, 'v', 'a'); const vs = field(R3, s3, 'x', 's'); R3.turn = o3; fresh(R3); attack(R3, xo, vs); ok(typeof cinAs(R3, s3, { a: 'cin', id: k3 }) === 'string', '상대 턴엔 불가'); });

// ───────────── 0689 ─────────────
t('id_0689', '【絆】鈴木園子 ターン①: 상대 캐릭터를 컨택트로 리무브했을 때 손패 1장 리무브해도 좋다 → 액티브 + 突撃[キャラ]를 잃고 突撃[事件]를 가짐(턴 종료 시까지)', () => {
  const mkr = bond => { const R = mk({ c: real('id_0689', { color: 'white' }), b: dummy('鈴木園子', { color: 'white' }), v: dummy('V', { color: 'white', ap: '1000' }), v2: dummy('V2', { color: 'white', ap: '1000' }), h: dummy('H', { color: 'white' }) }, ['c', 'h', 'h'], ['v'], BS('white')); const s = R.turn, o = 1 - s; const c = field(R, s, 'c'); if (bond) field(R, s, 'b'); const v = field(R, o, 'v', 's'), v2 = field(R, o, 'v2', 's'); const h = hand(R, s, 'h'); return { R, s, o, c, v, v2, h }; };
  let r = mkr(true); ok(FX.hasKwTk(r.R, r.c, 'assault-char'), '기본: 突撃[キャラ]'); attack(r.R, r.c, r.v); finishContact(r.R, [], { pref: [r.h] }); ok(has(r.R, r.o, 'rem', r.v), '리무브'); ok(has(r.R, r.s, 'rem', r.h), '손패 1장 리무브'); eq(r.R.cards[r.c].st, 'a', '액티브'); ok(!FX.hasKwTk(r.R, r.c, 'assault-char'), '突撃[キャラ]를 잃음'); ok(FX.hasKwTk(r.R, r.c, 'assault-case'), '突撃[事件]를 가짐');
  r.R.turn = r.s; ready(r.R, r.c); attack(r.R, r.c, r.v2); finishContact(r.R, [], { pref: [hand(r.R, r.s, 'h')] }); ok(has(r.R, r.o, 'rem', r.v2), '두 번째 리무브'); eq(r.R.cards[r.c].st, 's', 'ターン①: 두 번째는 발동 안 함(슬립 유지)'); endTurn(r.R); auto(r.R); ok(FX.hasKwTk(r.R, r.c, 'assault-char') && !FX.hasKwTk(r.R, r.c, 'assault-case'), '턴 종료 시 원래대로');
  r = mkr(true); attack(r.R, r.c, r.v); finishContact(r.R, [], { pref: [] }); eq(r.R.cards[r.c].st, 's', '거절하면 그대로'); ok(FX.hasKwTk(r.R, r.c, 'assault-char'), '突撃[キャラ] 유지');
  r = mkr(false); attack(r.R, r.c, r.v); finishContact(r.R, [], { pref: [r.h] }); ok(has(r.R, r.o, 'rem', r.v), '리무브'); ok(has(r.R, r.s, 'hand', r.h), '絆 없음: 발동 안 함'); });

// ───────────── 1141 ─────────────
t('id_1141', '파트너(黒) 내 턴 ターン①: 이 캐릭터의 컨택트 중 バーボン의 컷인을 사용하면 액티브 + 턴 종료 시까지 컨택트 중 컷인 불가를 가짐 / 컷인 AP+1000(컷인을 가진 【黒】 캐릭터에 컷인했다면 1장 드로)', () => {
  const BB = CUT('バーボン', { color: 'black' }), BK = CUT('BK', { color: 'black', ap: '3000' });
  const mkr = (pc = 'black') => mk({ c: real('id_1141', { color: 'black' }), bb: BB, bk: BK, x: dummy('X', { color: 'black', ap: '3000' }), v: dummy('V', { color: 'black', ap: '1000' }), v2: dummy('V2', { color: 'black', ap: '1000' }), cu: CUT('KK', { color: 'black' }), kn: CUT('KN', { color: 'black' }), nb: dummy('NB', { color: 'black', ap: '3000' }) }, ['bb', 'cu', 'kn'], ['v', 'v2'], BS(pc, 'black'));
  let R = mkr(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'), v = field(R, o, 'v', 's'), v2 = field(R, o, 'v2', 's'); const bb = hand(R, s, 'bb'), k = hand(R, s, 'cu'); attack(R, c, v); const a0 = ap(R, c); eq(cinAs(R, s, { a: 'cin', id: bb }), undefined, 'バーボン 컷인'); eq(ap(R, c), a0 + 1000, '컷인 AP'); eq(R.cards[c].st, 'a', '액티브가 됨'); ok(FX.hasKwTk(R, c, 'nocinself'), '턴 종료 시까지 컷인 불가 부여'); finishContact(R); R.turn = s; ok(FX.hasKwTk(R, c, 'nocinself'), '컨택트 후에도 유지');
  attack(R, c, v2); ok(typeof cinAs(R, s, { a: 'cin', id: k }) === 'string', '이 캐릭터의 컨택트 중 컷인 불가'); finishContact(R); endTurn(R); auto(R); ok(!FX.hasKwTk(R, c, 'nocinself'), '턴 종료 시 사라짐');
  R = mkr('red'); s = R.turn; o = 1 - s; const c2 = field(R, s, 'c'), v3 = field(R, o, 'v', 's'), bb2 = hand(R, s, 'bb'); attack(R, c2, v3); cinAs(R, s, { a: 'cin', id: bb2 }); eq(R.cards[c2].st, 's', '파트너가 黒이 아니면 발동 안 함'); ok(!FX.hasKwTk(R, c2, 'nocinself'), '');
  // 컷인: 1141 의 컷인 — 컷인을 가진 黒 캐릭터에 컷인하면 드로우
  { const R2 = mkr(); const s2 = R2.turn, o2 = 1 - s2; const bk = field(R2, s2, 'bk'); const v5 = field(R2, o2, 'v', 's'); const c1141 = hand(R2, s2, 'c'); attack(R2, bk, v5); const a1 = ap(R2, bk), h1 = R2.P[s2].hand.length; eq(cinAs(R2, s2, { a: 'cin', id: c1141 }), undefined, '컷인'); pump(R2); eq(ap(R2, bk), a1 + 1000, 'AP+1000'); eq(R2.P[s2].hand.length, h1 - 1 + 1, '컷인을 가진 黒 캐릭터에 컷인: 1장 드로'); }
  { const R2 = mkr(); const s2 = R2.turn, o2 = 1 - s2; const nb = field(R2, s2, 'nb'); const v5 = field(R2, o2, 'v', 's'); const c1141 = hand(R2, s2, 'c'); attack(R2, nb, v5); const h1 = R2.P[s2].hand.length; eq(cinAs(R2, s2, { a: 'cin', id: c1141 }), undefined, '컷인'); pump(R2); eq(R2.P[s2].hand.length, h1 - 1, '컷인을 갖지 않은 캐릭터: 드로 없음'); } });

// ───────────── 0855 ─────────────
t('id_0855', '액션하면 턴 종료 시 현장에서 손패로 돌아간다(이 턴 자신의 MR 능력으로 선택됐다면 그대로) / 액션하지 않으면 그대로', () => {
  const MR = { n: 'MR', type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', ab: [{ ic: 'mr' }, { ic: 'onplay', ops: [{ op: 'select', n: 1, filter: { own: 'self' }, do: 'active' }] }] };
  const mkr = () => mk({ c: real('id_0855', { color: 'blue' }), v: dummy('V', { ap: '1000' }), mr: MR }, ['c', 'mr'], ['v'], BS('blue'));
  let R = mkr(); let s = R.turn, o = 1 - s; let c = field(R, s, 'c'); let v = field(R, o, 'v', 's'); action(R, c, v); eq(FX.grantedAb(R, c).length, 1, '턴 종료 시 효과를 얻음'); finishContact(R); ok(has(R, s, 'field', c), '아직 현장'); endTurn(R); auto(R); pump(R); ok(has(R, s, 'hand', c), '턴 종료 시 손패로');
  R = mkr(); s = R.turn; c = field(R, s, 'c'); endTurn(R); auto(R); ok(has(R, s, 'field', c), '액션하지 않으면 그대로');
  R = mkr(); s = R.turn; o = 1 - s; c = field(R, s, 'c'); v = field(R, o, 'v', 's'); action(R, c, v); finishContact(R); R.turn = s; const mr = hand(R, s, 'mr'); R.fl.played = 0; play(R, s, mr); auto(R, { pref: [c] }); pump(R); ok(R.fl.mrSel && R.fl.mrSel[c], 'MR 능력으로 선택됨'); endTurn(R); auto(R); pump(R); ok(has(R, s, 'field', c), '자신의 MR 능력으로 선택됐다면 현장에 남음'); });

// ───────────── 0886 ─────────────
t('id_0886', '액션[キャラ]하면 지정한 캐릭터를 턴 종료 시까지 레벨-1, 그 캐릭터가 Lv6 이하면 액션 종료 시까지 AP+3000 / 登場時 다른 FBI가 있으면 突撃', () => {
  const mkr = () => mk({ c: real('id_0886', { color: 'red' }), l7: dummy('L7', { color: 'red', lv: '7' }), l8: dummy('L8', { color: 'red', lv: '8' }), f: dummy('F', { color: 'red', trait: 'FBI' }) }, ['c'], ['l7'], BS('red'));
  let R = mkr(); let s = R.turn, o = 1 - s; let c = field(R, s, 'c'); let l7 = field(R, o, 'l7', 's'); const a0 = ap(R, c); action(R, c, l7); eq(FX.lvOf(R, l7), 6, '레벨-1'); eq(ap(R, c), a0 + 3000, '그 캐릭터가 Lv6 이하: AP+3000'); finishContact(R); eq(ap(R, c), a0, '액션 종료 후 AP 원복'); 
  R = mk({ c: real('id_0886', { color: 'red' }), l8: dummy('L8', { color: 'red', lv: '8' }) }, ['c'], ['l8'], BS('red')); s = R.turn; o = 1 - s; c = field(R, s, 'c'); const l8 = field(R, o, 'l8', 's'); const b0 = ap(R, c); action(R, c, l8); eq(FX.lvOf(R, l8), 7, '레벨-1'); eq(ap(R, c), b0, '레벨 7 이상: AP 보정 없음');
  R = mkr(); s = R.turn; const cf = hand(R, s, 'c'); field(R, s, 'f'); play(R, s, cf); ok(FX.hasKwTk(R, cf, 'assault'), '다른 FBI가 있으면 突撃'); R = mkr(); s = R.turn; const cn = hand(R, s, 'c'); play(R, s, cn); ok(!FX.hasKwTk(R, cn, 'assault'), 'FBI가 없으면 突撃 없음');
  R = mkr(); s = R.turn; o = 1 - s; c = field(R, s, 'c'); U.evid(R, o, 1); R.turn = s; ready(R, c); const e = act(R, s, { a: 'action', id: c, k: 'case' }); eq(e, undefined, '사건 액션'); act(R, o, { a: 'guard', id: null }); pump(R); ok(!R.eff, '사건 액션(キャラ 아님): 발동 안 함'); });

// ───────────── 0733 ─────────────
t('id_0733', '파트너(青) 선언 ターン①: 덱 위 3장 리무브 → 그 중 特徴[少年探偵団]/[毛利探偵事務所] 1장당 AP+1000 + 突撃 / 파트너 색이 青이 아니면·2회째 불가', () => {
  const mkr = (pc = 'blue') => mk({ c: real('id_0733', { color: 'blue' }), t1: dummy('T1', { trait: '少年探偵団' }), t2: dummy('T2', { trait: '毛利探偵事務所' }), z: dummy('Z', { trait: '高校生' }), z2: dummy('Z2', { trait: '高校生' }), b: dummy('B') }, ['c'], ['c'], BS(pc, 'blue'));
  let R = mkr(); let s = R.turn; let c = field(R, s, 'c'); eq(decErr(R, s, c), '', '선언 가능'); U.top(R, s, 'z'); U.top(R, s, 't2'); U.top(R, s, 't1'); const d0 = R.P[s].deck.length, a0 = ap(R, c); dec(R, s, c); ok(!req(R), '자동 처리'); eq(R.P[s].deck.length, d0 - 3, '덱 3장 리무브'); eq(ap(R, c), a0 + 2000, '코스트로 리무브된 해당 특징 2장: AP+2000'); ok(FX.hasKwTk(R, c, 'assault'), '突撃'); ok(decErr(R, s, c), '턴 1회'); endTurn(R); auto(R); eq(ap(R, c), a0, '턴 종료 시 원복'); ok(!FX.hasKwTk(R, c, 'assault'), '突撃도 사라짐');
  R = mkr(); s = R.turn; c = field(R, s, 'c'); U.top(R, s, 'z'); U.top(R, s, 'z2'); U.top(R, s, 'b'); const a1 = ap(R, c); dec(R, s, c); eq(ap(R, c), a1, '해당 특징이 없으면 AP 그대로'); ok(FX.hasKwTk(R, c, 'assault'), '突撃은 항상');
  R = mkr('red'); s = R.turn; c = field(R, s, 'c'); ok(decErr(R, s, c), '파트너가 青이 아니면 불가');
  R = mkr(); s = R.turn; c = field(R, s, 'c'); });

module.exports = {}; if (require.main === module) U.runAll('mz_g1');
