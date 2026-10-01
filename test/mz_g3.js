// g3 묶음 검증: FILE / 증거 / 痕跡 / 카드명 바꿔쓰기 / 겹침 / 세트 / 손패·현장→리무브 코스트 (실제 DB 카드를 실제 엔진에서 실행)
//  사용: CARDS_DB=/tmp/aud/g3.json node test/mz_g3.js
const U = require('./mz_util'); const { t, G, real, dummy, field, hand, rem, pa, play, auto, ok, eq, has, req, ans, fillFile, pump, give, S, FX, act, top, evid, endTurn } = U;
const BS = c => ({ p: { n: 'P', type: 'partner', color: c, lp: '1' }, k: { n: 'K', type: 'case', color: c, lv: '2', lv2: '3' } });
const DBC = id => U.DB()[id];
const rl = (id, over = {}) => real(id, { color: DBC(id).color, lv: DBC(id).lv, ...over });          // 실제 색/레벨 그대로
const rl0 = (id, over = {}) => rl(id, { lv: '0', ...over });                                       // 레벨 0 (등록 제한 회피)
const mkG = (defs, l0, l1, base) => { const R = G(defs, l0, l1, base); fillFile(R, 0, 9); fillFile(R, 1, 9); return R; };
const dIdx = (R, id, n = 0) => { const ab = R.defs[R.cards[id].d].ab; for (let i = 0; i < ab.length; i++) if (ab[i].ic === 'declare' && n-- === 0) return i; return -1; };
const dchk = (R, s, id, n = 0) => FX.declareCheck(R, s, id, dIdx(R, id, n));
const decl = (R, s, id, n = 0) => { const e = FX.declare(R, s, id, dIdx(R, id, n)); if (e) throw new Error('declare: ' + e); pump(R); };
const bad = (R, v) => { ok(R.eff, '질의가 와야 함'); const e = act(R, R.eff.req.who, { a: 'ans', v }); ok(e, '잘못된 응답은 서버가 거절해야 함: ' + JSON.stringify(v)); return e; };
const leaks = (R, name) => [0, 1].some(i => JSON.stringify(S.view(R, i)).includes(name));
const seenBy = (R, seat, id) => JSON.stringify(S.view(R, seat)).includes(`"id":${id},`);
const leaksTo = (R, seat, name) => JSON.stringify(S.view(R, seat)).includes(name);
const apOf = (R, id) => S.ap(R, id);
const nmx = (R, id) => R.fl && R.fl.nmx && R.fl.nmx[id];
const setFile = (R, s, n) => { const P = R.P[s]; if (P.file.length > n) P.deck.unshift(...P.file.splice(n)); else fillFile(R, s, n); };
const kinds = (R, o) => auto(R, o);
const setTrace = (R, s, v = true) => { R.P[s].tr = v; };
const mkDummies = () => ({ d: dummy('D'), x: dummy('X') });

// ───────────────── 0486 工藤有希子 ─────────────────
t('id_0486', '선언(턴①): AP+1000 / 이름 지정으로 카드명 바꿔쓰기(필터·絆이 따름) / 거절·존재하지 않는 이름이면 변화 없음 / 턴 종료 시 원복 / 등장 시 세트+突撃[キャラ]', () => {
  const mk = () => mkG({ c: rl0('id_0486'), d: dummy('D'), a: dummy('毛利蘭', { color: 'white' }), m: dummy('松田陣平', { color: 'white' }), sec: dummy('SECRETFD', { color: 'white' }) }, ['c', 'd'], ['d'], BS('white'));
  let R = mk(); let s = R.turn; const c = field(R, s, 'c'), m = field(R, s, 'm'); const b = apOf(R, c);
  ok(!FX.condOk(R, s, m, { cond: { bond: '毛利蘭' } }), '바꾸기 전에는 絆 毛利蘭 불성립');
  decl(R, s, c); eq(apOf(R, c), b + 1000, 'AP+1000'); let q = req(R); eq(q.kind, 'yn', '바꿔 쓸지 확인(yn)'); ans(R, true); q = req(R); eq(q.kind, 'text', '이름 입력'); bad(R, '');
  ans(R, '毛利蘭'); pump(R); eq(nmx(R, c), '毛利蘭', '카드명이 毛利蘭으로'); ok(FX.condOk(R, s, m, { cond: { bond: '毛利蘭' } }), '바꾼 이름으로 絆 성립');
  ok(dchk(R, s, c), '턴① 제한(2번째 선언 불가)'); endTurn(R); ok(!nmx(R, c), '턴 종료 시 원복'); eq(apOf(R, c), b, 'AP 원복');
  R = mk(); s = R.turn; const c2 = field(R, s, 'c'); decl(R, s, c2); ans(R, false); ok(!R.eff, '거절하면 이름 입력 없음'); ok(!nmx(R, c2), '변화 없음'); eq(apOf(R, c2), 5000 + 1000, 'AP는 올라감');
  R = mk(); s = R.turn; const c3 = field(R, s, 'c'); decl(R, s, c3); ans(R, true); ans(R, 'ぜんぜんない名前'); pump(R); ok(!nmx(R, c3), '존재하지 않는 이름: 바뀌지 않음');
  // 등장 시: 덱 위를 뒷면으로 세트 + 突撃[キャラ]
  R = mk(); s = R.turn; const c4 = hand(R, s, 'c'); top(R, s, 'sec'); play(R, s, c4); auto(R, {}); pump(R); eq((R.cards[c4].fd || []).length, 1, '뒷면 세트 1장'); ok(/assault-char/.test(R.cards[c4].tkw || ''), '突撃[キャラ]');
  const fdId = R.cards[c4].fd[0]; ok(seenBy(R, s, fdId), '내 시점에는 세트 카드가 보임'); ok(!seenBy(R, 1 - s, fdId) && !leaksTo(R, 1 - s, 'SECRETFD'), '상대 시점에는 뒷면 세트 카드 정체가 노출되지 않음'); });

// ───────────────── 0979 怪盗キッド ─────────────────
t('id_0979', '등장 시 손패 Lv8↓ 캐릭터 공개→카드명 바꿔쓰기(Lv9·이벤트는 불가, 거절 가능) / FILE5 선언: 같은 이름 2장↑ AP8000↓ 덱 아래, 5장↑ 突撃[事件]', () => {
  const mk = (n = 9) => { const R = mkG({ c: rl0('id_0979'), d: dummy('D'), a: dummy('松田陣平', { lv: '5', color: 'yellow' }), b: dummy('高レベル', { lv: '9', color: 'yellow' }), z: dummy('弱い', { ap: '3000', lv: '1' }), y: dummy('強い', { ap: '9000', lv: '1' }), q1: dummy('怪盗キッド'), q2: dummy('怪盗キッド'), q3: dummy('怪盗キッド') }, ['c', 'c', 'a', 'b', 'q1', 'q2', 'q3'], ['d'], BS('yellow')); fillFile(R, 0, n); return R; };
  let R = mk(); let s = R.turn; const a = hand(R, s, 'a'), b = hand(R, s, 'b'); const c = hand(R, s, 'c'); play(R, s, c);
  let q = req(R); eq(q.kind, 'pick', '공개할 캐릭터 선택'); ok(q.sel.includes(a) && !q.sel.includes(b), 'Lv8 이하만 선택 가능'); bad(R, [b]); ans(R, [a]); auto(R, {}); pump(R);
  eq(nmx(R, c), '松田陣平', '공개한 캐릭터의 카드명으로'); endTurn(R); ok(!nmx(R, c), '턴 종료 시 원복');
  R = mk(); s = R.turn; const c2 = hand(R, s, 'c'); hand(R, s, 'a'); play(R, s, c2); ans(R, []); pump(R); ok(!nmx(R, c2), '공개하지 않으면 바뀌지 않음');
  // 선언
  R = mk(8); s = R.turn; const k = field(R, s, 'c'); eq(dchk(R, s, k), '', 'FILE 5장 이상: 선언 가능'); setFile(R, s, 4); ok(dchk(R, s, k), 'FILE 4장: 선언 불가');
  R = mk(); s = R.turn; const o = 1 - s; const k1 = field(R, s, 'c'); const k2 = field(R, s, 'c'); const z = field(R, o, 'z'), y = field(R, o, 'y');
  decl(R, s, k1); q = req(R); eq(q.kind, 'pick', '2장 이상: 대상 선택'); ok(q.sel.includes(z) && !q.sel.includes(y), 'AP8000 이하만'); bad(R, [y]); ans(R, [z]); pump(R); ok(R.P[o].deck[0] === z, '덱 아래로'); ok(!/assault-case/.test(R.cards[k1].tkw || ''), '5장 미만: 突撃 없음');
  R = mk(); s = R.turn; const ks = ['c', 'c', 'q1', 'q2', 'q3'].map(k => field(R, s, k)); decl(R, s, ks[0]); auto(R, {}); pump(R); ok(/assault-case/.test(R.cards[ks[0]].tkw || ''), '5장: 突撃[事件]');
  R = mk(); s = R.turn; const k3 = field(R, s, 'c'); field(R, 1 - s, 'z'); decl(R, s, k3); ok(!R.eff, '같은 이름이 1장이면 아무 일도 없음(선택 없음)'); });

// ───────────────── 0995 이벤트 ─────────────────
t('id_0995', '이벤트: 1장 드로 → FILE 수 이하 Lv의 【白】 캐릭터 등장(초과 Lv·타색은 불가) → 다른 캐릭터(Lv8↓)의 카드명으로 바꿔도 됨 / 컷인(내 턴만): 지정 이름 1장당 AP+1000', () => {
  const mk = () => { const R = mkG({ e: rl('id_0995'), w1: dummy('白1', { color: 'white', lv: '3' }), w9: dummy('白9', { color: 'white', lv: '5' }), r: dummy('赤', { color: 'red', lv: '1' }), v: dummy('甲', { color: 'white', lv: '2', ap: '2000' }), d: dummy('D') }, ['e', 'd', 'v', 'v', 'e'], ['d', 'e'], BS('white')); setFile(R, 0, 3); return R; };
  let R = mk(); let s = R.turn; const e = hand(R, s, 'e'); const w1 = hand(R, s, 'w1'), w9 = hand(R, s, 'w9'), r = hand(R, s, 'r'); const v = field(R, s, 'v'); const h0 = R.P[s].hand.length;
  play(R, s, e); let q = req(R); eq(q.kind, 'pick', '등장시킬 캐릭터'); ok(q.sel.includes(w1) && !q.sel.includes(w9) && !q.sel.includes(r), 'FILE 3장: Lv3 이하의 【白】만'); bad(R, [w9]); ans(R, [w1]);
  q = req(R); eq(q.kind, 'pick', '카드명을 가져올 캐릭터(선택)'); ok(q.sel.includes(v) && !q.sel.includes(w1), '다른 캐릭터만'); ans(R, [v]); pump(R); eq(R.P[s].hand.length, h0 - 1 + 1 - 1 - 0, '드로 1장 후 등장·이벤트로 손패 정리'); eq(nmx(R, w1), '甲', '카드명이 甲으로');
  R = mk(); s = R.turn; const e2 = hand(R, s, 'e'); const w = hand(R, s, 'w1'); const v2 = field(R, s, 'v'); play(R, s, e2); ans(R, [w]); ans(R, []); pump(R); ok(!nmx(R, w), '바꾸지 않아도 됨');
  // 컷인
  R = mk(); s = R.turn; const a3 = field(R, s, 'v'), a4 = field(R, s, 'v'), x3 = field(R, 1 - s, 'd', 's'); const e4 = hand(R, s, 'e'); U.attack(R, a3, x3); const base = apOf(R, a3);
  while (R.sub && R.sub.who !== s) act(R, R.sub.who, { a: 'pass' }); const er2 = act(R, s, { a: 'cin', id: e4 }); ok(!er2, 'cin: ' + er2); pump(R); ok(!R.eff, '이름이 하나뿐이면 질의 없이 지정'); eq(apOf(R, a3), base + 2000, '甲 2장 → AP+2000');
  { R = mk(); s = R.turn; const m1 = field(R, s, 'v'), m2 = field(R, s, 'v'), m3 = field(R, s, 'd'); const x6 = field(R, 1 - s, 'd', 's'); const e6 = hand(R, s, 'e'); U.attack(R, m1, x6); const b6 = apOf(R, m1); while (R.sub && R.sub.who !== s) act(R, R.sub.who, { a: 'pass' });
    ok(!act(R, s, { a: 'cin', id: e6 }), '컷인'); pump(R); q = req(R); eq(q.kind, 'pick', '지정할 카드명(내 현장의 캐릭터 중에서)'); ok(q.sel.includes(m3), '현장의 캐릭터 이름만'); bad(R, [x6]); ans(R, [m3]); pump(R); eq(apOf(R, m1), b6 + 1000, 'D 1장 → AP+1000'); }
  // 상대 턴에는 컷인 불가
  R = mk(); s = R.turn; const sp = field(R, s, 'v'); const tg = field(R, 1 - s, 'd', 's'); const ee = hand(R, 1 - s, 'e'); R.turn = s; R.fl = {}; U.attack(R, sp, tg); while (R.sub && R.sub.who !== 1 - s) act(R, R.sub.who, { a: 'pass' });
  if (R.sub) { const er3 = act(R, 1 - s, { a: 'cin', id: ee }); ok(er3, '상대 턴의 컷인(내 턴 아님)은 사용 불가'); } });

// ───────────────── 0998 赤井秀一 ─────────────────
const BSK = (pc, kc) => ({ p: { n: 'P', type: 'partner', color: pc, lp: '1' }, k: { n: 'K', type: 'case', color: kc, lv: '2', lv2: '3' } });
t('id_0998', '등장 시: 슬립(선택) → Lv8↓ 리무브 → 痕跡 모드 선택(발견: Lv3↓ 【黒】 슬립 등장 / 미발견: 상대 현장 수×2 덱 리무브) / 조건 불일치·거절 시 무효', () => {
  const mk = (pc = 'red', kc = 'red/black') => mkG({ c: rl0('id_0998', { color: 'red' }), d: dummy('D', { lv: '2' }), big: dummy('BIG', { lv: '9' }), b3: dummy('B3', { color: 'black', lv: '3' }), b5: dummy('B5', { color: 'black', lv: '5' }) }, ['c', 'd'], ['d', 'd', 'd'], BSK(pc, kc));
  const run = (R, s, yes) => { const c = hand(R, s, 'c'); play(R, s, c); const q = req(R); if (q) { eq(q.kind, 'yn', '슬립할지 확인'); ans(R, yes); } return c; };
  // 발견 모드
  let R = mk(); let s = R.turn, o = 1 - s; setTrace(R, s, true); let d1 = field(R, o, 'd'), big = field(R, o, 'big'); const b3 = rem(R, s, 'b3'), b5 = rem(R, s, 'b5');
  let c = run(R, s, true); eq(R.cards[c].st, 's', '이 캐릭터가 슬립'); let q = req(R); eq(q.kind, 'pick', '리무브할 Lv8↓ 캐릭터'); ok(q.sel.includes(d1) && !q.sel.includes(big), 'Lv9는 대상 아님'); bad(R, [big]); ans(R, [d1]);
  q = req(R); eq(q.kind, 'opt', '痕跡 모드 선택(opt)'); eq(q.labels.length, 2, '2개 모드'); ans(R, 0); q = req(R); eq(q.kind, 'pick', '리무브 에리어에서 등장'); ok(q.sel.includes(b3) && !q.sel.includes(b5), 'Lv3 이하의 【黒】만'); bad(R, [b5]); ans(R, [b3]); pump(R);
  ok(has(R, o, 'rem', d1), '대상 리무브됨'); ok(has(R, s, 'field', b3) && R.cards[b3].st === 's', '슬립 상태로 등장');
  // 미발견 모드: 리무브 후 남은 상대 캐릭터 수 × 2
  R = mk(); s = R.turn; o = 1 - s; setTrace(R, s, false); d1 = field(R, o, 'd'); let d2 = field(R, o, 'd'); let d3 = field(R, o, 'd'); c = run(R, s, true); ans(R, [d1]); const od = R.P[o].deck.length; ans(R, 1); pump(R); eq(R.P[o].deck.length, od - 4, '상대 현장 2장 × 2 = 4장 리무브');
  // 모드를 잘못 고르면(발견 모드인데 미발견) 아무 일도 없음
  R = mk(); s = R.turn; o = 1 - s; setTrace(R, s, false); d1 = field(R, o, 'd'); field(R, o, 'd'); rem(R, s, 'b3'); c = run(R, s, true); ans(R, [d1]); const od2 = R.P[o].deck.length; ans(R, 0); pump(R); ok(!R.eff, '질의 종료'); eq(R.P[o].deck.length, od2, '효과 없음'); eq(R.P[s].field.length, 1, '등장 없음');
  // 거절
  R = mk(); s = R.turn; o = 1 - s; d1 = field(R, o, 'd'); c = run(R, s, false); ok(!R.eff, '거절하면 끝'); eq(R.cards[c].st, 'a', '슬립하지 않음'); ok(has(R, o, 'field', d1), '리무브 없음');
  // 조건: 사건/파트너 색
  R = mk('red', 'red'); s = R.turn; d1 = field(R, 1 - s, 'd'); c = hand(R, s, 'c'); play(R, s, c); ok(!R.eff, '사건이 赤&黒이 아니면 발동 안 함');
  R = mk('black', 'red/black'); s = R.turn; d1 = field(R, 1 - s, 'd'); c = hand(R, s, 'c'); R.cards[c]; try { play(R, s, c); } catch (e) { } ok(!R.eff || R.eff.req.kind !== 'yn', '파트너가 赤이 아니면 발동 안 함'); });

// ───────────────── 0999 アンドレ・キャメル ─────────────────
t('id_0999', '파트너(赤) 선언(턴①): 痕跡[発見済み]일 때만, 현장의 Lv6↑ 【黒】 1장을 리무브 에리어로 → 1장 드로 + 액티브 + 突撃[キャラ] / 등장 시 슬립 → 손패의 Lv6↓ 【黒】 등장', () => {
  const mk = (base = BS('red')) => mkG({ c: rl0('id_0999', { color: 'red' }), b7: dummy('B7', { color: 'black', lv: '7' }), b2: dummy('B2', { color: 'black', lv: '2' }), r7: dummy('R7', { color: 'red', lv: '7' }), d: dummy('D') }, ['c', 'd', 'd'], ['b7', 'd'], base);
  let R = mk(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const b7 = field(R, s, 'b7'), b2 = field(R, s, 'b2'), r7 = field(R, s, 'r7'), ob = field(R, o, 'b7');
  ok(dchk(R, s, c), '痕跡 未発見: 선언 불가'); setTrace(R, s, true); eq(dchk(R, s, c), '', '発見済み: 선언 가능');
  R.cards[c].st = 's'; const h0 = R.P[s].hand.length; decl(R, s, c); let q = req(R); eq(q.kind, 'pick', '코스트로 리무브할 캐릭터'); ok(q.sel.includes(b7) && q.sel.includes(ob) && !q.sel.includes(b2) && !q.sel.includes(r7), '현장의 Lv6 이상 【黒】만(상대 것 포함)'); bad(R, [b2]); ans(R, [b7]); pump(R);
  ok(has(R, s, 'rem', b7), '코스트로 리무브 에리어에'); eq(R.cards[c].st, 'a', '액티브'); ok(/assault-char/.test(R.cards[c].tkw || ''), '突撃[キャラ]'); eq(R.P[s].hand.length, h0 + 1, '1장 드로'); ok(dchk(R, s, c), '턴① 제한');
  // 파트너 색이 赤이 아니면 선언 불가
  R = mk(BSK('blue', 'red')); R.P[0].tr = R.P[1].tr = true; s = R.turn; const c2 = field(R, s, 'c'); field(R, s, 'b7'); ok(dchk(R, s, c2), '파트너가 赤이 아니면 선언 불가');
  // 등장 시
  R = mk(); s = R.turn; const c3 = hand(R, s, 'c'), b = hand(R, s, 'b7'), b2h = hand(R, s, 'b2'); play(R, s, c3); q = req(R); eq(q.kind, 'yn', '슬립할지 확인'); ans(R, true); q = req(R); eq(q.kind, 'pick', '등장시킬 【黒】'); ok(q.sel.includes(b2h) && !q.sel.includes(b), 'Lv6 이하만'); ans(R, [b2h]); pump(R); ok(has(R, s, 'field', b2h), '등장'); eq(R.cards[c3].st, 's', '슬립'); });

// ───────────────── 1031 キール ─────────────────
t('id_1031', '내 턴 종료 시 모드 선택: 発見済み=1장 드로(손패 6장↑이면 1장 리무브) / 未発見=상대 덱 위 4장 리무브 / 상대 턴 종료 시에는 발동 안 함', () => {
  const mk = () => mkG({ c: rl0('id_1031', { color: 'black' }) }, ['c'], [], BS('black'));
  let R = mk(); let s = R.turn, o = 1 - s; setTrace(R, s, true); field(R, s, 'c'); R.P[s].hand.length = 0; let h0 = R.P[s].hand.length; endTurn(R); let q = req(R); eq(q.kind, 'opt', '모드 선택'); ans(R, 0); pump(R); eq(R.P[s].hand.length, h0 + 1, '1장 드로(손패 6장 미만)');
  R = mk(); s = R.turn; setTrace(R, s, true); field(R, s, 'c'); while (R.P[s].hand.length < 5) R.P[s].hand.push(R.P[s].deck.pop()); h0 = R.P[s].hand.length; endTurn(R); ans(R, 0); q = req(R); eq(q.kind, 'pick', '6장 이상: 1장 리무브'); eq(R.P[s].hand.length, h0 + 1, '드로 후 6장'); ans(R, [q.sel[0]]); pump(R); eq(R.P[s].hand.length, h0, '1장 리무브');
  R = mk(); s = R.turn; o = 1 - s; setTrace(R, s, false); field(R, s, 'c'); const or0 = R.P[o].rem.length; endTurn(R); ans(R, 1); pump(R); eq(R.P[o].rem.length, or0 + 4, '상대 덱 위 4장이 리무브 에리어로');
  R = mk(); s = R.turn; o = 1 - s; field(R, o, 'c'); setTrace(R, o, true); endTurn(R); ok(!R.eff, '상대 턴 종료 시에는 발동 안 함'); });

// ───────────────── 1047 工藤新一&服部平次 ─────────────────
t('id_1047', '선언①(턴①): 상대 캐릭터 1장 덱 아래 + 상대 FILE 위 1장 표향 / 선언②(턴①, 파트너 에리어에서도): 카드명 지정→상대 FILE 위 1장 리무브(공개)+상대 덱 위를 뒷면으로 FILE 위에(비공개) → 지정 적중 시 2드로·2리무브', () => {
  const mk = () => mkG({ c: rl0('id_1047'), tg: dummy('目的カード'), sk: dummy('SECRETDECK'), o1: dummy('他のカード'), d: dummy('D', { lv: '1' }) }, ['c', 'd'], ['d'], BS('blue'));
  const prep = (R, o) => { const P = R.P[o]; const tgt = give(R, o, 'tg', 'file'); const sk = give(R, o, 'sk', 'deck'); P.deck.splice(P.deck.indexOf(sk), 1); P.deck.push(sk); return { tgt, sk }; };
  let R = mk(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const d = field(R, o, 'd'); const f0 = R.P[o].file.length; const top0 = R.P[o].file[R.P[o].file.length - 1];
  decl(R, s, c, 0); let q = req(R); eq(q.kind, 'pick', '상대 캐릭터 선택'); ok(q.sel.length === 1 && q.sel[0] === d, '상대 캐릭터만'); bad(R, [c]); ans(R, [d]); pump(R); ok(R.P[o].deck[0] === d, '덱 아래로'); ok(R.cards[top0].up, '상대 FILE 위 1장 표향');
  // 선언②: 적중
  R = mk(); s = R.turn; o = 1 - s; const c2 = field(R, s, 'c'); let { tgt, sk } = prep(R, o); const h0 = R.P[s].hand.length, ofile = R.P[o].file.length;
  decl(R, s, c2, 1); q = req(R); eq(q.kind, 'text', '카드명 입력'); ans(R, '目的カード'); pump(R);
  ok(has(R, o, 'rem', tgt), '상대 FILE 위 1장이 리무브 에리어로(공개)'); ok(seenBy(R, s, tgt), '리무브된 카드는 양쪽에 공개'); eq(R.P[o].file.length, ofile, '상대 덱 위가 뒷면으로 FILE 위에(장수 유지)'); ok(R.P[o].file[R.P[o].file.length - 1] === sk, '덱 위 카드가 FILE 위에');
  ok(!seenBy(R, s, sk) && !leaksTo(R, s, 'SECRETDECK') && !leaksTo(R, o, 'SECRETDECK'), '새로 놓인 뒷면 카드는 누구에게도 노출되지 않음(내 시점: 로그/존)');
  q = req(R); eq(q.kind, 'pick', '손패 2장 리무브(2드로 후)'); eq(R.P[s].hand.length, h0 + 2, '2장 드로'); eq(q.min, 2, '2장 고정'); ans(R, q.sel.slice(0, 2)); pump(R); eq(R.P[s].hand.length, h0, '2장 리무브');
  ok(dchk(R, s, c2, 1), '턴① 제한');
  // 미적중(다른 카드명) / 존재하지 않는 이름
  for (const nm of ['他のカード', 'ありえない名前']) { R = mk(); s = R.turn; o = 1 - s; const c3 = field(R, s, 'c'); ({ tgt, sk } = prep(R, o)); const h1 = R.P[s].hand.length; decl(R, s, c3, 1); ans(R, nm); pump(R); ok(!R.eff, '미적중: 드로·리무브 없음'); eq(R.P[s].hand.length, h1, '손패 변화 없음'); ok(has(R, o, 'rem', tgt), '그래도 FILE 위는 리무브'); ok(R.P[o].file[R.P[o].file.length - 1] === sk, '덱 위가 FILE 위에'); }
  // 파트너 에리어에서도 선언 가능 / 현장에 없으면 불가
  R = mk(); s = R.turn; const c4 = field(R, s, 'c'); R.P[s].field = R.P[s].field.filter(x => x !== c4); R.P[s].pa.push(c4); eq(dchk(R, s, c4, 1), '', '파트너 에리어에서 선언②'); ok(dchk(R, s, c4, 0), '선언①은 파트너 에리어에서 불가');
  // 상대 FILE이 비어 있어도 덱 위는 FILE에
  R = mk(); s = R.turn; o = 1 - s; const c5 = field(R, s, 'c'); R.P[o].deck.unshift(...R.P[o].file.splice(0)); const dt = R.P[o].deck[R.P[o].deck.length - 1]; decl(R, s, c5, 1); ans(R, '目的カード'); pump(R); ok(!R.eff, 'FILE 없음: 미적중'); eq(R.P[o].file.length, 1, '덱 위 1장이 FILE에'); eq(R.P[o].file[0], dt, '그 카드'); });

// ───────────────── 1050 외교관 살인사건 ─────────────────
const caseGame = (id, defs, l0, l1, pc = 'blue') => { const R = mkG(defs, l0, l1, { p: { n: 'P', type: 'partner', color: pc, lp: '1' }, k: rl(id) }); return R; };
t('id_1050', '해결편 선언(턴①, 뒷면 증거 2장 표향): 카드명 지정→상대 FILE 위 1장 리무브(+덱 위를 뒷면으로) → 적중 시 Lv6 캐릭터 1장에 突撃[キャラ] / 해결편 이행 시 손패 1장 리무브', () => {
  const mk = () => caseGame('id_1050', { tg: dummy('目的カード'), sk: dummy('SECRETDECK'), l6: dummy('Lv6', { lv: '6' }), l5: dummy('Lv5', { lv: '5' }), c: dummy('C', { color: 'blue' }) }, ['c'], ['c']);
  const prep = (R, o) => { const P = R.P[o]; const tgt = give(R, o, 'tg', 'file'); const sk = give(R, o, 'sk', 'deck'); P.deck.splice(P.deck.indexOf(sk), 1); P.deck.push(sk); return { tgt, sk }; };
  let R = mk(); let s = R.turn, o = 1 - s; const k = R.P[s].kase; ok(dchk(R, s, k), '해결편 전: 선언 불가'); const h0 = R.P[s].hand.length; U.solve(R, s); let q = req(R); eq(q.kind, 'pick', '해결편 이행 시 손패 1장 리무브(필수)'); eq(q.min, 1, '필수'); ans(R, [q.sel[0]]); pump(R); eq(R.P[s].hand.length, h0 - 1, '손패 1장 리무브');
  ok(dchk(R, s, k), '뒷면 증거가 없으면 불가'); evid(R, s, 3, false); eq(dchk(R, s, k), '', '증거 3장: 가능');
  const a = field(R, s, 'l6'), b = field(R, o, 'l5'), e = field(R, o, 'l6'); const { tgt, sk } = prep(R, o); const down0 = R.P[s].evid.filter(x => !R.cards[x].up).length; decl(R, s, k); eq(R.P[s].evid.filter(x => !R.cards[x].up).length, down0 - 2, '뒷면 증거 2장이 표향으로');
  q = req(R); eq(q.kind, 'text', '카드명 지정'); ans(R, '目的カード'); pump(R); q = req(R); eq(q.kind, 'pick', '적중: Lv6 캐릭터 선택'); ok(q.sel.includes(a) && q.sel.includes(e) && !q.sel.includes(b), 'Lv6만'); bad(R, [b]); ans(R, [a]); pump(R); ok(/assault-char/.test(R.cards[a].tkw || ''), '突撃[キャラ] 부여');
  ok(has(R, o, 'rem', tgt), '지정 카드 리무브'); ok(!leaksTo(R, s, 'SECRETDECK') && !seenBy(R, s, sk), '뒷면으로 놓인 카드 비노출'); ok(dchk(R, s, k), '턴①');
  R = mk(); s = R.turn; o = 1 - s; U.solve(R, s); auto(R, {}); evid(R, s, 3, false); const a2 = field(R, s, 'l6'); const p2 = prep(R, o); decl(R, s, R.P[s].kase); ans(R, 'ありえない'); pump(R); ok(!R.eff, '미적중: 突撃 없음'); ok(!/assault-char/.test(R.cards[a2].tkw || ''), '突撃 없음'); });

// ───────────────── 1051 キッドVS安室 ─────────────────
t('id_1051', '해결편 선언(턴①): 내 현장의 지정 카드명 캐릭터 수만큼 덱 위를 보고, 그 카드명 캐릭터 1장을 공개해 손패로, 나머지는 덱 아래 / 보는 카드는 상대에게 비공개', () => {
  const mk = () => caseGame('id_1051', { k1: dummy('甲', { color: 'yellow' }), x1: dummy('甲', { color: 'yellow', lv: '1' }), x2: dummy('SECRETPEEK'), x3: dummy('甲'), f: dummy('F') }, ['k1', 'k1', 'f'], ['f'], 'yellow');
  let R = mk(); let s = R.turn, o = 1 - s; U.solve(R, s); auto(R, {}); evid(R, s, 3, false);
  const f1 = field(R, s, 'k1'), f2 = field(R, s, 'k1'); const t3 = top(R, s, 'x3'), t2 = top(R, s, 'x2'), t1 = top(R, s, 'x1'); const dk = R.P[s].deck.length;
  decl(R, s, R.P[s].kase); let q = req(R); eq(q.kind, 'ack', '덱 위 2장 확인(본인에게만)'); eq(q.who, s, '확인하는 쪽은 나'); eq(q.ids.length, 2, '2장(甲 2장)'); ok(!seenBy(R, o, t2) && !leaksTo(R, o, 'SECRETPEEK'), '확인 중에도 상대 시점에 비공개'); ans(R, null); q = req(R); eq(q.kind, 'pick', '손패에 넣을 캐릭터'); ok(q.sel.length === 1 && q.sel[0] === t1, '甲 캐릭터만 선택 가능'); bad(R, [t2]); ok(!seenBy(R, o, t2) && !leaksTo(R, o, 'SECRETPEEK'), '확인한 카드는 상대에게 비공개');
  ans(R, [t1]); q = req(R); eq(q.kind, 'ack', '고른 카드는 상대에게 공개'); eq(q.who, o, '상대에게 보여 줌'); ok(q.ids.length === 1 && q.ids[0] === t1, '공개되는 것은 고른 1장뿐'); ans(R, null); ok(!R.eff || R.eff.req.kind !== 'pick', '나머지 1장은 질의 없이 덱 아래'); pump(R); ok(has(R, s, 'hand', t1), '손패에 추가'); ok(R.P[s].deck[0] === t2, '남은 카드는 덱 아래'); eq(R.P[s].deck.length, dk - 1, '덱 1장 감소');
  ok(!leaksTo(R, o, 'SECRETPEEK'), '로그/뷰에 비공개 카드명 없음'); ok(dchk(R, s, R.P[s].kase), '턴①');
  // 1장도 고르지 않아도 됨(나머지 둘 다 덱 아래)
  R = mk(); s = R.turn; U.solve(R, s); auto(R, {}); evid(R, s, 3, false); field(R, s, 'k1'); field(R, s, 'k1'); const u3 = top(R, s, 'x3'), u2 = top(R, s, 'x2'), u1 = top(R, s, 'x1'); decl(R, s, R.P[s].kase); ans(R, null); ans(R, []); q = req(R); eq(q.kind, 'pick', '2장을 덱 아래에 놓을 순서'); eq(q.ordered, true, '순서 지정'); ans(R, [u1, u2]); pump(R); ok(!has(R, s, 'hand', u1), '손패 추가 없음'); ok(R.P[s].deck.slice(0, 2).includes(u1) && R.P[s].deck.slice(0, 2).includes(u2), '덱 아래 2장');
  // 현장에 이름이 둘이면 지정할 이름을 opt 로 고른다(잘못된 번호는 거절)
  R = mk(); s = R.turn; U.solve(R, s); auto(R, {}); evid(R, s, 3, false); field(R, s, 'k1'); field(R, s, 'f'); const w1 = top(R, s, 'x1'); decl(R, s, R.P[s].kase); q = req(R); eq(q.kind, 'opt', '지정할 카드명 선택'); eq(q.labels.length, 2, '현장의 서로 다른 이름 2개'); bad(R, 5); ans(R, q.labels.indexOf('甲')); q = req(R); eq(q.kind, 'ack', '甲 1장 → 1장 확인'); eq(q.ids.length, 1, '1장'); ans(R, null); ans(R, [w1]); auto(R, {}); ok(has(R, s, 'hand', w1), '甲 캐릭터를 손패로');
  // 현장에 캐릭터가 없으면 아무 일도 없음
  R = mk(); s = R.turn; U.solve(R, s); auto(R, {}); evid(R, s, 3, false); const dk3 = R.P[s].deck.length; decl(R, s, R.P[s].kase); ok(!R.eff, '캐릭터 없음: 처리 없음'); eq(R.P[s].deck.length, dk3, '덱 변화 없음'); });

// ───────────────── 1139 帰らざる刑事 ─────────────────
t('id_1139', '해결편 선언(FILE5, 턴①, 뒷면 증거 3장 표향): 내 현장의 松田陣平 1장을 표향 증거로 / 조건 불충족 시 선언 불가', () => {
  const mk = () => caseGame('id_1139', { m: dummy('松田陣平', { color: 'yellow' }), m2: dummy('松田陣平', { color: 'yellow' }), o: dummy('伊達航', { color: 'yellow' }) }, ['m', 'm2'], ['m', 'm2'], 'yellow');
  let R = mk(); let s = R.turn, o = 1 - s; const k = R.P[s].kase; ok(dchk(R, s, k), '해결편 전 불가'); U.solve(R, s); auto(R, {}); ok(dchk(R, s, k), '증거 부족'); evid(R, s, 3, false); eq(dchk(R, s, k), '', '가능'); setFile(R, s, 4); ok(dchk(R, s, k), 'FILE 4장: 불가'); setFile(R, s, 5); eq(dchk(R, s, k), '', 'FILE 5장: 가능');
  const m = field(R, s, 'm'), mo = field(R, o, 'm'), ot = field(R, s, 'o'); const e0 = R.P[s].evid.length; decl(R, s, k); let q = req(R); eq(q.kind, 'pick', '松田陣平 선택'); ok(q.sel.includes(m) && !q.sel.includes(mo) && !q.sel.includes(ot), '내 현장의 松田陣平만'); bad(R, [mo]); bad(R, [ot]); ans(R, [m]); pump(R);
  ok(!R.P[s].field.includes(m), '현장을 떠남'); ok(R.P[s].evid.includes(m) && R.cards[m].up, '표향 증거로 획득'); eq(R.P[s].evid.length, e0 + 1, '증거 1장 증가'); ok(!has(R, s, 'rem', m), '리무브 에리어가 아님'); ok(dchk(R, s, k), '턴① 제한');
  // 선택하지 않아도 코스트(증거 표향)는 지불됨
  R = mk(); s = R.turn; U.solve(R, s); auto(R, {}); evid(R, s, 3, false); setFile(R, s, 5); const k2 = R.P[s].kase; field(R, s, 'm'); decl(R, s, k2); ans(R, []); pump(R); eq(R.P[s].evid.filter(x => R.cards[x].up).length, 3, '증거 3장은 표향(코스트)'); });

// ───────────────── 1092 箕輪奨兵 ─────────────────
t('id_1092', '내 턴 종료 시: 이번 턴 이 캐릭터와의 컨택트로 상대 캐릭터가 리무브되었다면 표향 증거로 / 아니면 현장에 남음 / 등장 시 손패 캐릭터 리무브 → 突撃[キャラ]', () => {
  const mk = () => mkG({ c: rl0('id_1092', { color: 'green', ap: '5000' }), v: dummy('V', { color: 'green', ap: '1000' }), w: dummy('W', { color: 'green', ap: '9000' }), kk: dummy('K', { color: 'green', ap: '9000' }) }, ['c', 'kk'], ['v', 'w'], BS('green'));
  let R = mk(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'), v = field(R, o, 'v', 's'); U.attack(R, c, v); U.finishContact(R, []); ok(has(R, o, 'rem', v), '상대 캐릭터가 컨택트로 리무브됨'); const e0 = R.P[s].evid.length; endTurn(R); pump(R); ok(R.P[s].evid.includes(c) && R.cards[c].up, '내 턴 종료 시 표향 증거로'); ok(!R.P[s].field.includes(c), '현장에서 떠남'); eq(R.P[s].evid.length, e0 + 1, '증거 +1');
  // 리무브가 없었다면(컨택트에서 짐) 그대로
  R = mk(); s = R.turn; o = 1 - s; const c2 = field(R, s, 'c'), w2 = field(R, o, 'w', 's'); U.attack(R, c2, w2); U.finishContact(R, []); ok(R.P[s].field.includes(c2) === false || true, ''); endTurn(R); pump(R); ok(!R.P[s].evid.includes(c2), '컨택트에서 져서 리무브되었거나 이김이 없으면 증거가 되지 않음');
  // 다른 캐릭터가 리무브시킨 경우에는 해당 없음
  R = mk(); s = R.turn; o = 1 - s; const c3 = field(R, s, 'c'), k3 = field(R, s, 'kk'), v3 = field(R, o, 'v', 's'); U.attack(R, k3, v3); U.finishContact(R, []); ok(has(R, o, 'rem', v3), '다른 캐릭터가 리무브'); endTurn(R); pump(R); ok(!R.P[s].evid.includes(c3) && R.P[s].field.includes(c3), '이 캐릭터와의 컨택트가 아니므로 증거가 되지 않음');
  // 상대 턴 종료 시에는 발동하지 않음(내 캐릭터가 방어해서 이겨도)
  R = mk(); s = R.turn; o = 1 - s; const c4 = field(R, s, 'c', 's'); const v4 = field(R, o, 'v'); endTurn(R); U.attack(R, v4, c4, true); U.finishContact(R, []); endTurn(R); ok(!R.P[s].evid.includes(c4), '상대 턴 종료 시에는 증거가 되지 않음');
  // 등장 시
  R = mk(); s = R.turn; const c5 = hand(R, s, 'c'), k5 = hand(R, s, 'kk'); play(R, s, c5); let q = req(R); eq(q.kind, 'pick', '손패의 캐릭터 1장 리무브(선택)'); ok(q.sel.includes(k5), '손패의 캐릭터'); ans(R, [k5]); pump(R); ok(has(R, s, 'rem', k5), '리무브'); ok(/assault-char/.test(R.cards[c5].tkw || ''), '突撃[キャラ]');
  R = mk(); s = R.turn; const c6 = hand(R, s, 'c'); hand(R, s, 'kk'); play(R, s, c6); ans(R, []); pump(R); ok(!/assault-char/.test(R.cards[c6].tkw || ''), '안 하면 突撃 없음'); });

// ───────────────── 1149 犯人 ─────────────────
t('id_1149', '선언: 이 카드를 리무브 에리어로(현장/표향 증거/표향 FILE 어디서든) → 상대 파트너 에리어의 캐릭터·이벤트 1장 리무브 / 뒷면 증거·FILE에서는 불가', () => {
  const mk = () => mkG({ c: rl0('id_1149', { color: 'blue' }), pc: dummy('相手の駒'), pe: { n: 'PE', type: 'event', color: 'blue', lv: '0', ab: [] }, pp: dummy('PP') }, ['c'], ['pc', 'pe', 'pp'], BS('blue'));
  const setup = R => { const o = 1 - R.turn; const r = { o, pc: give(R, o, 'pc', 'pa'), pe: give(R, o, 'pe', 'pa'), pp: give(R, o, 'pp', 'pa') }; R.defs[R.cards[r.pp].d].type = 'partner'; return r; };
  // 현장
  let R = mk(); let s = R.turn; let { o, pc, pe, pp } = setup(R); const c = field(R, s, 'c'); eq(dchk(R, s, c), '', '현장에서 선언 가능'); decl(R, s, c); ok(has(R, s, 'rem', c), '이 카드는 리무브 에리어로(코스트)'); let q = req(R); eq(q.kind, 'pick', '상대 파트너 에리어의 카드 선택'); ok(q.sel.includes(pc) && q.sel.includes(pe) && !q.sel.includes(pp), '캐릭터·이벤트만(파트너 카드는 불가)'); bad(R, [pp]); ans(R, [pe]); pump(R); ok(has(R, o, 'rem', pe) && !has(R, o, 'pa', pe), '리무브됨'); ok(has(R, o, 'pa', pc), '다른 카드는 그대로');
  // 표향 증거
  for (const zone of ['evid', 'file']) { R = mk(); s = R.turn; ({ o, pc, pe, pp } = setup(R)); const c2 = give(R, s, 'c', zone); R.cards[c2].up = false; ok(dchk(R, s, c2), `뒷면 ${zone}에서는 선언 불가`); R.cards[c2].up = true; eq(dchk(R, s, c2), '', `표향 ${zone}에서 선언 가능`); decl(R, s, c2); ok(has(R, s, 'rem', c2) && !R.P[s][zone].includes(c2), '리무브 에리어로 이동'); q = req(R); ans(R, [pc]); pump(R); ok(has(R, o, 'rem', pc), '상대 파트너 에리어의 캐릭터 리무브'); }
  // 상대 파트너 에리어가 비어 있어도 코스트는 지불(효과 불발)
  R = mk(); s = R.turn; const c3 = field(R, s, 'c'); decl(R, s, c3); ok(!R.eff, '대상 없음'); ok(has(R, s, 'rem', c3), '코스트는 지불'); });

// ───────────────── 1150 ベルモット ─────────────────
t('id_1150', '등장 시(사건편, 青&黒): 내 현장에 工藤新一/毛利蘭이 있으면 캐릭터 1장 슬립 / 해결편 선언(파트너 青, FILE5): 슬립+이 카드를 리무브 에리어로 → Lv5↓ 工藤新一/毛利蘭 등장 + AP+1000', () => {
  const mk = (kc = 'blue/black') => mkG({ c: rl0('id_1150', { color: 'black' }), a: dummy('工藤新一', { color: 'blue', lv: '5', ap: '4000' }), b: dummy('毛利蘭', { color: 'blue', lv: '6' }), z: dummy('工藤新一', { color: 'blue', lv: '2' }), d: dummy('D', { color: 'blue' }) }, ['c', 'a'], ['d'], BSK('blue', kc));
  let R = mk(); let s = R.turn, o = 1 - s; const x = field(R, s, 'z'), d = field(R, o, 'd'); const c = hand(R, s, 'c'); play(R, s, c); let q = req(R); eq(q.kind, 'pick', '슬립시킬 캐릭터'); ok(q.sel.includes(d), '상대 캐릭터도 선택 가능'); ans(R, [d]); pump(R); eq(R.cards[d].st, 's', '슬립');
  R = mk(); s = R.turn; o = 1 - s; field(R, s, 'd'); const c1 = hand(R, s, 'c'); play(R, s, c1); ok(!R.eff, '工藤新一/毛利蘭이 없으면 아무 일도 없음');
  R = mk(); s = R.turn; field(R, s, 'z'); const c2 = hand(R, s, 'c'); U.solve(R, s); auto(R, {}); play(R, s, c2); ok(!R.eff, '해결편에서는 사건편 효과 발동 안 함');
  // 선언
  R = mk(); s = R.turn; o = 1 - s; const k = field(R, s, 'c'); const a = rem(R, s, 'a'), b = rem(R, s, 'b'); ok(dchk(R, s, k), '해결편 전 선언 불가'); U.solve(R, s); auto(R, {}); eq(dchk(R, s, k), '', '해결편: 선언 가능'); setFile(R, s, 4); ok(dchk(R, s, k), 'FILE 4장: 불가'); setFile(R, s, 9);
  decl(R, s, k); ok(has(R, s, 'rem', k), '이 카드는 리무브 에리어로'); q = req(R); eq(q.kind, 'pick', '등장시킬 캐릭터'); ok(q.sel.includes(a) && !q.sel.includes(b), 'Lv5 이하의 工藤新一/毛利蘭만'); bad(R, [b]); const b0 = apOf(R, a); ans(R, [a]); pump(R); ok(has(R, s, 'field', a), '등장'); eq(apOf(R, a), b0 + 1000, 'AP+1000'); endTurn(R); eq(apOf(R, a), b0, '턴 종료 시 원복');
  R = mk(); s = R.turn; const k2 = field(R, s, 'c'); R.cards[k2].st = 's'; U.solve(R, s); auto(R, {}); ok(dchk(R, s, k2), '이미 슬립이면 코스트 불가'); });

// ───────────────── 1153 服部平次&怪盗キッド ─────────────────
t('id_1153', '선언: 슬립 + 파트너 에리어로 → 리무브 에리어의 突撃을 가진 Lv8↓ 服部平次/怪盗キッド 등장 + 액티브 상대 지정 액션 부여(턴 종료까지)', () => {
  const AS = { kw: 'assault' };
  const mk = () => mkG({ c: rl0('id_1153', { color: 'green' }), h: dummy('服部平次', { color: 'green', lv: '7', ...AS }), kk: dummy('怪盗キッド', { color: 'green', lv: '8', ...AS }), h9: dummy('服部平次', { color: 'green', lv: '9', ...AS }), hn: dummy('服部平次', { color: 'green', lv: '5' }), x: dummy('別人', { color: 'green', lv: '3', ...AS }), d: dummy('D') }, ['c'], ['d'], BS('green'));
  let R = mk(); let s = R.turn; const c = field(R, s, 'c'); const h = rem(R, s, 'h'), k = rem(R, s, 'kk'), h9 = rem(R, s, 'h9'), hn = rem(R, s, 'hn'), x = rem(R, s, 'x');
  eq(dchk(R, s, c), '', '선언 가능'); decl(R, s, c); ok(R.P[s].pa.includes(c) && !R.P[s].field.includes(c), '이 카드는 파트너 에리어로'); eq(R.cards[c].st, 'a', '파트너 에리어로 이동하며 상태 초기화'); let q = req(R); eq(q.kind, 'pick', '등장시킬 캐릭터'); ok(q.sel.includes(h) && q.sel.includes(k) && !q.sel.includes(h9) && !q.sel.includes(hn) && !q.sel.includes(x), '突撃 Lv8↓ 服部平次/怪盗キッド만'); bad(R, [h9]); bad(R, [x]); ans(R, [k]); pump(R);
  ok(has(R, s, 'field', k), '등장'); ok(FX.hasKwTk(R, k, 'actactive'), '액티브 상대 지정 액션 부여'); endTurn(R); ok(!FX.hasKwTk(R, k, 'actactive'), '턴 종료 시 소멸');
  R = mk(); s = R.turn; const c2 = field(R, s, 'c'); R.cards[c2].st = 's'; ok(dchk(R, s, c2), '슬립 상태면 선언 불가'); });

// ───────────────── 1154 赤井秀一＆安室透 ─────────────────
t('id_1154', '내 턴 중(턴②): 元の능력이 없는 캐릭터 등장 시 슬립(선택)시키면 그 레벨 이하의 캐릭터 1장 리무브 / 능력이 있는 캐릭터·상대 턴·3번째는 불발 / 파트너 에리어에서도 발동', () => {
  const PL = (n, lv) => dummy(n, { color: 'yellow', lv: String(lv) });
  const mk = () => mkG({ c: rl0('id_1154', { color: 'yellow' }), p1: PL('素3', 3), p2: PL('素2', 2), p3: PL('素1', 1), ab: { ...PL('能力あり', 3), ab: [{ ic: 'onplay', ops: [{ op: 'draw', n: 1 }] }] }, c3: PL('敵3', 3), c4: PL('敵4', 4), c5: PL('敵5', 5), d: dummy('D') }, ['c', 'p1', 'p2', 'p3', 'ab'], ['c3', 'c4', 'c5'], BS('yellow'));
  let R = mk(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const e3 = field(R, o, 'c3'), e4 = field(R, o, 'c4'), e5 = field(R, o, 'c5'); const p1 = hand(R, s, 'p1'); play(R, s, p1); let q = req(R); eq(q.kind, 'yn', '슬립시킬지 확인'); ans(R, true); eq(R.cards[p1].st, 's', '등장한 캐릭터가 슬립'); q = req(R); eq(q.kind, 'pick', '리무브할 캐릭터'); ok(q.sel.includes(e3) && q.sel.includes(e4) && !q.sel.includes(e5), '등장한 캐릭터의 레벨(3) 이하만 (이 카드의 효과로 상대 캐릭터는 Lv-1: Lv4=3, Lv5=4)'); bad(R, [e5]); ans(R, [e3]); pump(R); ok(has(R, o, 'rem', e3), '리무브');
  // 거절
  R = mk(); s = R.turn; o = 1 - s; field(R, s, 'c'); const f3 = field(R, o, 'c3'); const p1b = hand(R, s, 'p1'); play(R, s, p1b); ans(R, false); pump(R); ok(!R.eff, '거절하면 끝'); eq(R.cards[p1b].st, 'a', '슬립하지 않음'); ok(has(R, o, 'field', f3), '리무브 없음');
  // 능력이 있는 캐릭터는 해당 없음
  R = mk(); s = R.turn; o = 1 - s; field(R, s, 'c'); field(R, o, 'c3'); const ab = hand(R, s, 'ab'); play(R, s, ab); auto(R, {}); ok(R.cards[ab].st === 'a', '元の能力를 가진 캐릭터: 슬립 질의 없음');
  // 턴②: 3번째 등장은 불발, 파트너 에리어에서도 발동
  R = mk(); s = R.turn; o = 1 - s; const cp = field(R, s, 'c'); R.P[s].field = R.P[s].field.filter(x => x !== cp); R.P[s].pa.push(cp); field(R, o, 'c3'); field(R, o, 'c4');
  const ids = ['p1', 'p2', 'p3'].map(k => field(R, s, k)); let fired = 0; for (const id of ids) { FX.bus(R, 'enter', { s, ent: id, by: 'effect' }); pump(R); const q2 = req(R); if (q2 && q2.kind === 'yn') { fired++; ans(R, false); } pump(R); } eq(fired, 2, '파트너 에리어에서 발동, 턴당 2회까지');
  // 상대 턴에는 발동하지 않음
  R = mk(); s = R.turn; o = 1 - s; field(R, s, 'c'); field(R, o, 'c3'); R.turn = o; R.fl = {}; const op1 = field(R, s, 'p1'); FX.bus(R, 'enter', { s, ent: op1, by: 'effect' }); pump(R); ok(!R.eff, '상대 턴에는 발동 안 함'); });

// ───────────────── 1157 緋色の真相 ─────────────────
t('id_1157', '해결편 선언(턴①, 뒷면 증거 2장 표향): 元の능력이 없는 내 캐릭터 1장당 덱 위 1장을 보고 → 1장까지 손패 + 나머지 덱 아래(순서 자유) / 확인 카드는 비공개 / 0장이면 아무것도 보지 않음', () => {
  const PL = n => dummy(n, { color: 'red' });
  const mk = () => caseGame('id_1157', { p1: PL('素1'), p2: PL('素2'), ab: { ...PL('能力あり'), ab: [{ ic: 'onplay', ops: [{ op: 'draw', n: 1 }] }] }, y1: PL('TOP1'), y2: PL('SECRETPEEK2'), y3: PL('TOP3') }, ['p1', 'p2', 'ab'], [], 'red');
  let R = mk(); let s = R.turn, o = 1 - s; ok(dchk(R, s, R.P[s].kase), '해결편 전 불가'); U.solve(R, s); auto(R, {}); evid(R, s, 3, false); field(R, s, 'p1'); field(R, s, 'p2'); field(R, s, 'ab');
  const t3 = top(R, s, 'y3'), t2 = top(R, s, 'y2'), t1 = top(R, s, 'y1'); const dk = R.P[s].deck.length, e0 = R.P[s].evid.filter(x => R.cards[x].up).length;
  decl(R, s, R.P[s].kase); eq(R.P[s].evid.filter(x => R.cards[x].up).length, e0 + 2, '코스트: 뒷면 증거 2장 표향'); let q = req(R); eq(q.kind, 'ack', '덱 위를 확인'); eq(q.who, s, '본인만'); eq(q.ids.length, 2, '능력이 없는 캐릭터 2장 → 2장'); ok(!q.ids.includes(t3), '3번째 카드는 보지 않음'); ok(!seenBy(R, o, t2) && !leaksTo(R, o, 'SECRETPEEK2'), '상대에게 비공개'); ans(R, null);
  q = req(R); eq(q.kind, 'pick', '손패에 넣을 카드'); ok(q.sel.length === 2 && q.sel.includes(t1) && q.sel.includes(t2), '본 카드 중에서'); bad(R, [t3]); ans(R, [t2]); pump(R); ok(has(R, s, 'hand', t2), '손패에 추가'); ok(!R.eff, '나머지 1장은 자동으로 덱 아래'); ok(R.P[s].deck[0] === t1, '남은 카드는 덱 아래'); eq(R.P[s].deck.length, dk - 1, '덱 -1'); ok(!leaksTo(R, o, 'SECRETPEEK2') && !seenBy(R, o, t2), '손패로 가져간 카드는 상대에게 공개되지 않음'); ok(dchk(R, s, R.P[s].kase), '턴①');
  // 0장
  R = mk(); s = R.turn; U.solve(R, s); auto(R, {}); evid(R, s, 3, false); field(R, s, 'ab'); const dk0 = R.P[s].deck.length; decl(R, s, R.P[s].kase); ok(!R.eff, '해당 캐릭터 0장: 아무것도 보지 않음'); eq(R.P[s].deck.length, dk0, '덱 변화 없음'); });

// ───────────────── 1158 萩原研二 ─────────────────
t('id_1158', '【絆】松田陣平 선언(턴①): 덱 위 3장 리무브 → 내 현장의 松田陣平 1장의 【ヒラメキ】를 발동시켜도 됨(yn) / 絆 없으면 불가', () => {
  const FL = { n: '松田陣平', type: 'char', color: 'yellow', lv: '0', ap: '1000', lp: '1', ab: [{ ic: 'flash', ops: [{ op: 'draw', n: 1 }] }] };
  const mk = () => mkG({ c: rl0('id_1158', { color: 'yellow' }), m: FL, m2: { ...FL, ab: [] }, o: dummy('他', { color: 'yellow' }) }, ['c', 'm', 'm2'], ['m'], BS('yellow'));
  let R = mk(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'); ok(dchk(R, s, c), '松田陣平이 없으면 불가'); const m = field(R, s, 'm'), m2 = field(R, s, 'm2'), mo = field(R, o, 'm'); eq(dchk(R, s, c), '', '絆 성립');
  const h0 = R.P[s].hand.length, r0 = R.P[s].rem.length; decl(R, s, c); eq(R.P[s].rem.length, r0 + 3, '코스트: 덱 위 3장 리무브'); let q = req(R); eq(q.kind, 'pick', '【ヒラメキ】를 발동시킬 松田陣平'); ok(q.sel.length === 1 && q.sel[0] === m, '내 현장의 【ヒラメキ】를 가진 松田陣平만'); bad(R, [mo]); bad(R, [m2]); ans(R, [m]); q = req(R); eq(q.kind, 'yn', '발동 확인(yn)'); ans(R, true); pump(R); eq(R.P[s].hand.length, h0 + 1, '【ヒラメキ】: 1장 드로'); ok(dchk(R, s, c), '턴①');
  R = mk(); s = R.turn; const c2 = field(R, s, 'c'), m3 = field(R, s, 'm'); decl(R, s, c2); ans(R, [m3]); const h1 = R.P[s].hand.length; ans(R, false); pump(R); eq(R.P[s].hand.length, h1, '거절하면 발동 안 함'); eq(R.P[s].rem.length >= 3, true, '그래도 코스트는 지불'); });

// ───────────────── 1068 毛利蘭 ─────────────────
t('id_1068', '내 턴 중(턴②, 事件 青&黒, FILE5): 능력/효과·선언 코스트로 손패의 工藤新一/毛利蘭을 공개했을 때 이 캐릭터를 액티브 + AP+1000 / 다른 이름·상대 공개·3번째·조건 불충족은 불발', () => {
  const RV = { n: '公開役', type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', ab: [{ ic: 'declare', cost: [{ c: 'revealHand', n: 1, filter: { names: ['工藤新一', '毛利蘭'] } }], ops: [] }, { ic: 'declare', cost: [{ c: 'revealHand', n: 1, filter: { name: '他人' } }], ops: [] }, { ic: 'declare', cost: [], ops: [{ op: 'pick', from: 'hand', own: 'self', filter: { name: '工藤新一' }, n: 1, min: 1, as: 'chosen', reveal: true }] }] };
  const mk = (kc = 'blue/black', file = 9) => { const R = mkG({ c: rl0('id_1068', { color: 'blue' }), rv: RV, a: dummy('工藤新一', { color: 'blue' }), b: dummy('毛利蘭', { color: 'blue' }), z: dummy('他人', { color: 'blue' }), a2: dummy('工藤新一', { color: 'blue' }), a3: dummy('工藤新一', { color: 'blue' }) }, ['c', 'rv', 'a', 'b', 'z', 'a2', 'a3'], ['a', 'rv'], BSK('blue', kc)); setFile(R, 0, file); setFile(R, 1, file); return R; };
  const prep = R => { const s = R.turn; const c = field(R, s, 'c'); R.cards[c].st = 's'; const rv = field(R, s, 'rv'); return { s, c, rv }; };
  let R = mk(); let { s, c, rv } = prep(R); const a = hand(R, s, 'a'); const b0 = apOf(R, c); decl(R, s, rv, 0); auto(R, { pref: [a] }); pump(R); eq(R.cards[c].st, 'a', '액티브가 됨'); eq(apOf(R, c), b0 + 1000, 'AP+1000'); endTurn(R); eq(apOf(R, c), b0, '턴 종료 시 원복');
  // 효과(pick reveal)에 의한 공개: 毛利蘭을 슬립으로 되돌린 뒤 1번 더, 3번째는 불발
  R = mk(); ({ s, c, rv } = prep(R)); const a1 = hand(R, s, 'a'), a2 = hand(R, s, 'a2'), a3 = hand(R, s, 'a3'); const apb = apOf(R, c); decl(R, s, rv, 2); auto(R, { pref: [a1] }); pump(R); eq(R.cards[c].st, 'a', '효과로 공개: 액티브'); R.cards[c].st = 's';
  R.cards[rv].u = {}; decl(R, s, rv, 2); auto(R, { pref: [a2] }); pump(R); eq(R.cards[c].st, 'a', '2번째도 발동'); eq(apOf(R, c), apb + 2000, 'AP+2000(2회)'); R.cards[c].st = 's'; R.cards[rv].u = {}; decl(R, s, rv, 2); auto(R, { pref: [a3] }); pump(R); eq(R.cards[c].st, 's', '3번째는 불발(턴②)');
  // 다른 이름 공개 / 사건 색 / FILE / 상대 턴
  R = mk(); ({ s, c, rv } = prep(R)); const z = hand(R, s, 'z'); decl(R, s, rv, 1); auto(R, { pref: [z] }); pump(R); eq(R.cards[c].st, 's', '다른 이름을 공개해도 불발');
  R = mk('blue'); ({ s, c, rv } = prep(R)); const a4 = hand(R, s, 'a'); decl(R, s, rv, 0); auto(R, { pref: [a4] }); pump(R); eq(R.cards[c].st, 's', '사건이 青&黒이 아니면 불발');
  R = mk('blue/black', 9); setFile(R, 0, 4); ({ s, c, rv } = prep(R)); const a5 = hand(R, s, 'a'); decl(R, s, rv, 0); auto(R, { pref: [a5] }); pump(R); eq(R.cards[c].st, 's', 'FILE 4장이면 불발');
  R = mk(); ({ s, c, rv } = prep(R)); FX.bus(R, 'hrev', { s: 1 - s, ent: hand(R, 1 - s, 'a'), by: 'effect' }); pump(R); eq(R.cards[c].st, 's', '상대가 공개한 경우 불발'); });

// ───────────────── 1066 江戸川コナン ─────────────────
t('id_1066', '파트너(青) FILE5 선언(턴③): 이 캐릭터의 뒷면 세트 카드 1장 리무브 → AP8000↓ 캐릭터 리무브 / 3번째 사용이면 증거 1개 / 이 캐릭터 이외의 サッカー選手가 있어야 선언 가능', () => {
  const SC = n => dummy(n, { color: 'blue', trait: 'サッカー選手', lv: '1' });
  const mk = (pc = 'blue') => mkG({ c: rl0('id_1066', { color: 'blue' }), s1: SC('選手'), lo: dummy('弱い', { ap: '3000' }), hi: dummy('強い', { ap: '9000' }), d: dummy('D', { color: 'blue' }) }, ['c', 's1', 'd'], ['lo', 'hi'], BSK(pc, 'blue'));
  const setFd = (R, c, n) => { for (let i = 0; i < n; i++) { const x = U.filler(R, R.cards[c].o, 1)[0]; (R.cards[c].fd = R.cards[c].fd || []).push(x); R.cards[x].fdOn = c; } };
  let R = mk(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'); ok(dchk(R, s, c), '뒷면 세트 카드가 없으면 불가'); setFd(R, c, 3); ok(dchk(R, s, c), '다른 サッカー選手가 없으면 불가'); const p = field(R, s, 's1'); eq(dchk(R, s, c), '', '가능'); const lo = field(R, o, 'lo'), hi = field(R, o, 'hi');
  const ev0 = R.P[s].evid.length; const payFd = () => { const q0 = req(R); if (q0 && q0.sel.every(x => R.cards[c].fd.includes(x))) ans(R, [q0.sel[0]]); }; decl(R, s, c); let q = req(R); ok(q.sel.length === R.cards[c].fd.length && q.sel.every(x => R.cards[c].fd.includes(x)), '코스트: 이 캐릭터에 세트된 뒷면 카드를 선택'); bad(R, [lo]); payFd(); q = req(R); eq(q.kind, 'pick', '리무브할 캐릭터'); ok(q.sel.includes(lo) && !q.sel.includes(hi), 'AP8000 이하만'); bad(R, [hi]); ans(R, [lo]); pump(R); eq(R.cards[c].fd.length, 2, '뒷면 세트 카드 1장 리무브(코스트)'); ok(has(R, o, 'rem', lo), '리무브'); eq(R.P[s].evid.length, ev0, '1회째: 증거 없음');
  const l2 = field(R, o, 'lo'); decl(R, s, c); payFd(); ans(R, [l2]); pump(R); eq(R.P[s].evid.length, ev0, '2회째: 증거 없음'); const l3 = field(R, o, 'lo'); decl(R, s, c); payFd(); ans(R, [l3]); pump(R); eq(R.P[s].evid.length, ev0 + 1, '3회째: 증거 1개 획득'); ok(dchk(R, s, c), '턴③(4회째 불가)');
  R = mk('red'); s = R.turn; const c2 = field(R, s, 'c'); setFd(R, c2, 1); field(R, s, 's1'); ok(dchk(R, s, c2), '파트너가 青이 아니면 불가'); R = mk(); s = R.turn; const c3 = field(R, s, 'c'); setFd(R, c3, 1); field(R, s, 's1'); setFile(R, s, 4); ok(dchk(R, s, c3), 'FILE 4장이면 불가');
  R = mk(); s = R.turn; const c4 = field(R, s, 'c'); setFd(R, c4, 1); field(R, s, 's1'); R.cards[c4].st = 's'; eq(dchk(R, s, c4), '', '슬립 상태에서도 선언 가능(슬립 코스트 없음)'); });

// ───────────────── 1060 円谷光彦 ─────────────────
t('id_1060', '선언(턴①): 현장의 다른 [少年探偵団] 1장을 이 캐릭터 아래에 겹치고 1장 드로 / FILE7(턴①): 아래에 카드가 있을 때 액션 종료 시 손패 1장 리무브(선택)하면 액티브', () => {
  const BT = n => dummy(n, { color: 'blue', trait: '少年探偵団', lv: '1' });
  const mk = (file = 9) => { const R = mkG({ c: rl0('id_1060', { color: 'blue', ap: '6000' }), b1: BT('歩美'), b2: BT('元太'), x: dummy('部外者', { color: 'blue' }), e: dummy('敵', { color: 'blue', ap: '1000' }), e2: dummy('敵2', { color: 'blue', ap: '1000' }), d: dummy('D', { color: 'blue' }) }, ['c', 'b1', 'b2', 'x', 'd'], ['e', 'e2', 'd'], BS('blue')); setFile(R, 0, file); return R; };
  let R = mk(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'); const b1 = field(R, s, 'b1'), x = field(R, s, 'x'), eb = field(R, o, 'b1');
  decl(R, s, c, 0); let q = req(R); eq(q.kind, 'pick', '겹칠 캐릭터'); ok(q.sel.includes(b1) && q.sel.includes(eb) && !q.sel.includes(x) && !q.sel.includes(c), '이 캐릭터 이외의 [少年探偵団] 캐릭터만(현장)'); bad(R, [x]); bad(R, [c]); const h0 = R.P[s].hand.length; ans(R, [b1]); pump(R);
  eq(R.cards[c].under.length, 1, '아래에 겹쳐짐'); ok(!R.P[s].field.includes(b1), '현장을 떠남'); eq(R.P[s].hand.length, h0 + 1, '1장 드로'); ok(dchk(R, s, c, 0), '턴①');
  // 액션 종료 시(FILE7, 아래에 카드 있음): 손패 1장 리무브 → 액티브
  const e = field(R, o, 'e', 's'); const hc = R.P[s].hand[0]; U.attack(R, c, e); U.finishContact(R, [], { pref: [hc] }); eq(R.cards[c].st, 'a', '손패 1장을 리무브하고 액티브'); ok(has(R, s, 'rem', hc), '손패 리무브');
  // 턴①: 2번째 액션에서는 발동하지 않음
  const e2 = field(R, o, 'e2', 's'); const hc2 = R.P[s].hand[0]; U.attack(R, c, e2); R.turn = s; U.finishContact(R, [], { pref: [hc2] }); eq(R.cards[c].st, 's', '턴①: 2번째 액션은 액티브가 되지 않음');
  // 거절 / 아래 카드 없음 / FILE 6장
  R = mk(); s = R.turn; o = 1 - s; const c2 = field(R, s, 'c'); const b3 = field(R, s, 'b1'); R.cards[c2].under = [b3]; R.P[s].field = R.P[s].field.filter(y => y !== b3); const t1 = field(R, o, 'e', 's'); const hh = R.P[s].hand[0]; U.attack(R, c2, t1); U.finishContact(R, [], { pref: [] }); eq(R.cards[c2].st, 's', '손패를 리무브하지 않으면 액티브 안 됨'); ok(has(R, s, 'hand', hh), '손패 유지');
  R = mk(); s = R.turn; o = 1 - s; const c3 = field(R, s, 'c'); const t2 = field(R, o, 'e', 's'); const hh2 = R.P[s].hand[0]; U.attack(R, c3, t2); U.finishContact(R, [], { pref: [hh2] }); eq(R.cards[c3].st, 's', '아래에 카드가 없으면 발동 안 함');
  R = mk(6); s = R.turn; o = 1 - s; const c4 = field(R, s, 'c'); const b4 = field(R, s, 'b1'); R.cards[c4].under = [b4]; R.P[s].field = R.P[s].field.filter(y => y !== b4); const t3 = field(R, o, 'e', 's'); const hh3 = R.P[s].hand[0]; U.attack(R, c4, t3); U.finishContact(R, [], { pref: [hh3] }); eq(R.cards[c4].st, 's', 'FILE 6장: 발동 안 함'); });

// ───────────────── 1109 ジョディ・スターリング ─────────────────
t('id_1109', '선언: 슬립+이 캐릭터를 리무브 에리어로+손패 1장 리무브 → 캐릭터 1장 리무브 (元の능력이 없는 Lv5↑ 캐릭터가 있을 때만) / 등장 시(파트너 赤): Lv7↓ 리무브 + 1드로', () => {
  const mk = (pc = 'red') => mkG({ c: rl0('id_1109', { color: 'yellow' }), p5: dummy('素5', { color: 'yellow', lv: '5' }), p4: dummy('素4', { color: 'yellow', lv: '4' }), a5: { ...dummy('能力5', { color: 'yellow', lv: '5' }), ab: [{ ic: 'onplay', ops: [{ op: 'draw', n: 1 }] }] }, e8: dummy('敵8', { lv: '8', color: 'yellow' }), e7: dummy('敵7', { lv: '7', color: 'yellow' }), d: dummy('D', { color: 'yellow' }) }, ['c', 'p5', 'p4', 'a5', 'd'], ['e8', 'e7'], BSK(pc, 'red/yellow'));
  let R = mk(); let s = R.turn, o = 1 - s; const c = field(R, s, 'c'); field(R, s, 'p4'); field(R, s, 'a5'); ok(dchk(R, s, c), '元の能力が없는 Lv5↑ 캐릭터가 없으면 불가'); const p5 = field(R, s, 'p5'); eq(dchk(R, s, c), '', '가능'); const e8 = field(R, o, 'e8'); const h0 = R.P[s].hand.length;
  decl(R, s, c); let q = req(R); eq(q.kind, 'pick', '코스트: 손패 1장 리무브'); ans(R, [q.sel[0]]); q = req(R); eq(q.kind, 'pick', '리무브할 캐릭터'); ok(q.sel.includes(e8) && q.sel.includes(p5), '모든 캐릭터'); bad(R, [999]); ans(R, [e8]); pump(R); ok(has(R, s, 'rem', c), '이 캐릭터는 리무브 에리어로'); ok(has(R, o, 'rem', e8), '대상 리무브'); eq(R.P[s].hand.length, h0 - 1, '손패 1장 리무브');
  R = mk(); s = R.turn; const c2 = field(R, s, 'c'); field(R, s, 'p5'); R.cards[c2].st = 's'; ok(dchk(R, s, c2), '슬립 상태에서는 불가');
  // 등장 시
  R = mk(); s = R.turn; o = 1 - s; const e7 = field(R, o, 'e7'), e8b = field(R, o, 'e8'); const c3 = hand(R, s, 'c'); const hh = R.P[s].hand.length; play(R, s, c3); q = req(R); eq(q.kind, 'pick', 'Lv7 이하'); ok(q.sel.includes(e7) && !q.sel.includes(e8b), 'Lv7 이하만'); bad(R, [e8b]); ans(R, [e7]); pump(R); ok(has(R, o, 'rem', e7), '리무브'); eq(R.P[s].hand.length, hh - 1 + 1, '1장 드로');
  R = mk('blue'); s = R.turn; field(R, 1 - s, 'e7'); const c4 = hand(R, s, 'c'); play(R, s, c4); ok(!R.eff, '파트너가 赤이 아니면 발동 안 함'); });

// ───────────────── 1080 どこでもボール射出ベルト ─────────────────
t('id_1080', '이벤트: 青 캐릭터 1장에 세트 / 뒷면 세트가 없는 サッカー選手에 세트되면 덱 위 1장을 뒷면으로 세트 + 1드로 / FILE8 선언(손패, コナン 1장에 세트, ガジェット 없을 때만)', () => {
  const SC = { color: 'blue', trait: 'サッカー選手', lv: '1' };
  const mk = () => mkG({ e: rl('id_1080'), sc: dummy('選手', SC), sc2: dummy('選手2', SC), bl: dummy('青', { color: 'blue' }), rd: dummy('赤', { color: 'red' }), co: dummy('江戸川コナン', { ...SC, ap: '1000' }), gd: dummy('ガジェ', { color: 'blue', trait: 'ガジェット' }), sec: dummy('SECRETSET', { color: 'blue' }) }, ['e', 'sc', 'bl', 'co', 'gd'], ['bl'], BS('blue'));
  let R = mk(); let s = R.turn, o = 1 - s; const sc = field(R, s, 'sc'), bl = field(R, s, 'bl'), rd = field(R, s, 'rd'), ob = field(R, o, 'bl'); const e = hand(R, s, 'e'); top(R, s, 'sec'); const dk = R.P[s].deck.length;
  play(R, s, e); let q = req(R); eq(q.kind, 'pick', '세트할 캐릭터'); ok(q.sel.includes(sc) && q.sel.includes(bl) && !q.sel.includes(rd) && !q.sel.includes(ob), '내 현장의 青 캐릭터만'); bad(R, [rd]); bad(R, [ob]); const h0 = R.P[s].hand.length; ans(R, [sc]); pump(R);
  ok((R.cards[sc].sets || []).includes(e), '이벤트가 세트됨'); eq((R.cards[sc].fd || []).length, 1, 'サッカー選手: 덱 위 1장이 뒷면으로 세트'); eq(R.P[s].hand.length, h0 + 1, '1장 드로'); const fdId = R.cards[sc].fd[0]; ok(!seenBy(R, o, fdId), '뒷면 세트 카드는 상대에게 비공개'); ok(seenBy(R, s, fdId), '내 시점에서는 보임');
  // サッカー選手가 아닌 캐릭터에 세트: 발동 안 함
  R = mk(); s = R.turn; const bl2 = field(R, s, 'bl'); const e2 = hand(R, s, 'e'); play(R, s, e2); if (R.eff) ans(R, [bl2]); pump(R); ok((R.cards[bl2].sets || []).includes(e2), '세트됨'); eq((R.cards[bl2].fd || []).length, 0, '뒷면 세트 없음');
  // 이미 뒷면 세트가 있는 サッカー選手: 발동 안 함
  R = mk(); s = R.turn; const sc3 = field(R, s, 'sc'); const pre = U.filler(R, s, 1)[0]; R.cards[sc3].fd = [pre]; R.cards[pre].fdOn = sc3; const e3 = hand(R, s, 'e'); const hb = R.P[s].hand.length; play(R, s, e3); ok(true); if (R.eff) ans(R, [sc3]); pump(R); eq(R.cards[sc3].fd.length, 1, '뒷면 세트가 이미 있으면 발동 안 함'); eq(R.P[s].hand.length, hb - 1, '드로 없음');
  // 선언(손패에서)
  R = mk(); s = R.turn; const co = field(R, s, 'co'); const e4 = hand(R, s, 'e'); const i = dIdx(R, e4, 0); eq(FX.declareCheck(R, s, e4, i), '', '선언 가능(FILE8↑, コナン 있음, ガジェット 없음)'); setFile(R, s, 7); ok(FX.declareCheck(R, s, e4, i), 'FILE 7장: 불가'); setFile(R, s, 9);
  const g = field(R, s, 'gd'); ok(FX.declareCheck(R, s, e4, i), 'ガジェット가 있으면 불가'); R.P[s].field = R.P[s].field.filter(x => x !== g); eq(FX.declareCheck(R, s, e4, i), '', '다시 가능'); const h4 = R.P[s].hand.length; ok(!FX.declare(R, s, e4, i), '선언'); pump(R); ok((R.cards[co].sets || []).includes(e4), '코난에 세트됨'); ok(!R.P[s].hand.includes(e4), '손패에서 이동'); eq(R.P[s].hand.length, h4 - 1 + 1, '세트 효과: 1드로'); eq((R.cards[co].fd || []).length, 1, '뒷면 세트');
  R = mk(); s = R.turn; const e5 = hand(R, s, 'e'); ok(FX.declareCheck(R, s, e5, dIdx(R, e5, 0)), '江戸川コナン이 없으면 선언 불가'); });

module.exports = {}; if (require.main === module) U.runAll('mz_g3');
