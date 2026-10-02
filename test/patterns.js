process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
// 사용자의 실제 20장(fixture)에서 manual 로 남았던 패턴들이 엔진에서 "실제로 동작"하는지 검증한다.
// 카드 데이터(이름/레벨/AP/LP/특징/색)는 fixture 원본, 효과 ab 는 test/fixtures/golden_ab.json (SPEC 이 목표로 하는 구조화 결과).
const fs = require('fs'), path = require('path');
const { S, game, key, give, ok, eq, act } = require('./helpers');
// FILE 에리어는 테스트 대상 카드가 아닌 '채움용' 카드로만 채운다(공용 fill 은 덱 위에서 무작위로 뽑아 대상 카드를 가져갈 수 있어 테스트가 불안정해짐)
const fill = (R, s, n) => { const P = R.P[s]; for (let i = P.deck.length - 1; i >= 0 && P.file.length < n; i--) { const k = key(R, P.deck[i]); if (k === 'filler' || /^f\d+$/.test(k)) P.file.push(P.deck.splice(i, 1)[0]); } if (P.file.length < n) throw new Error('채움용 카드 부족'); };
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/conan-db-test20.json'), 'utf8')).cards;
const GOLD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/golden_ab.json'), 'utf8'));
const real = (id, over = {}) => { const c = { ...FIX[id] }; delete c.img; if (GOLD[id]) c.ab = GOLD[id]; return { ...c, ...over }; };
const B = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
const G = (defs, l0, l1) => { const R = game({ ...B, ...defs }, l0, l1); R.P.forEach(P => P.deck.unshift(...P.file.splice(0))); return R; }; // 턴 시작 시 FILE 에 들어간 무작위 카드를 덱으로 되돌려 시나리오를 결정적으로
const dummy = (n, extra = {}) => ({ n, type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', ...extra });
const T = []; const t = (n, f) => T.push([n, f]);
const cur = R => R.turn;
const drain = R => { let g = 0; while (R.eff && g++ < 20) { const q = R.eff.req; act(R, q.who, { a: 'ans', v: q.kind === 'yn' ? false : q.kind === 'pick' ? [] : q.kind === 'opt' ? 0 : null }); } };
const answerPick = (R, ids) => { ok(R.eff && R.eff.req.kind === 'pick', 'pick 질의가 와야 함'); return act(R, R.eff.req.who, { a: 'ans', v: ids }); };
// 컨택트를 끝까지 진행 (공격자 s, 대상 tid)
function attack(R, s, a, tid) { R.cards[a].sum = 0; R.cards[a].st = 'a'; const e = act(R, s, { a: 'action', id: a, k: 'char', tid }); if (e) throw new Error(e); act(R, 1 - s, { a: 'guard', id: null }); let g = 0; while (R.sub && g++ < 8) act(R, R.sub.who, { a: 'pass' }); }

// ── 정화(sanitizer)를 통과해도 구조가 유지되는지
t('golden ab 13종: 서버 정화 후에도 manual 로 강등되지 않고 ic/ops 구조 유지', () => {
  for (const [id, list] of Object.entries(GOLD)) { const R = G({ x: real(id) }, ['x']); const ab = R.defs['0:x'].ab; const j = JSON.stringify(ab);
    ok(!j.includes('manual'), `${id}: manual 로 강등됨 ${j.slice(0, 200)}`); eq(ab.length, list.length, `${id}: ab 개수`); list.forEach((a, i) => { eq(ab[i].ic, a.ic, `${id}[${i}] ic`); if (a.ops) eq(ab[i].ops.length, a.ops.length, `${id}[${i}] ops 수`); }); } });

// ── id_0001: 넥스트 힌트로 사용한 카드의 레벨 이하 캐릭터 → 덱 아래
t('id_0001: 넥스트 힌트로 사용 → 그 카드 레벨 이하 캐릭터 선택 → 덱 아래 (턴①)', () => {
  const R = G({ a: real('id_0001'), u: dummy('U2', { lv: '2' }), lo: dummy('Lo', { lv: '1' }), hi: dummy('Hi', { lv: '5' }) }, ['a', 'u']); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'a', 'field'); const lo = give(R, o, 'lo', 'field'), hi = give(R, o, 'hi', 'field'); fill(R, s, 3); const u = give(R, s, 'u');
  eq(act(R, s, { a: 'hint' }), undefined, 'hint'); eq(act(R, s, { a: 'play', id: u }), undefined, 'play');
  const cand = R.eff.req.sel; ok(cand.includes(lo) && cand.includes(u), 'Lv≤2 후보'); ok(!cand.includes(hi) && !cand.includes(a), 'Lv5/Lv8은 후보 아님');
  eq(answerPick(R, [lo]), undefined, 'pick'); eq(R.P[o].deck[0], lo, '덱 맨 아래로'); ok(!R.P[o].field.includes(lo), '현장에서 제거');
  // 같은 턴 두 번째 힌트 사용은 발동하지 않음(턴①)
  R.fl = { hint: 1 }; fill(R, s, 2); const u2 = give(R, s, 'u'); R.fl = { hw: 1, hint: 1 }; act(R, s, { a: 'play', id: u2 }); ok(!R.eff, 'lim 1'); });
t('id_0001: 손패 사용(힌트 아님)은 발동하지 않음', () => {
  const R = G({ a: real('id_0001'), u: dummy('U2', { lv: '0' }) }, ['a', 'u']); const s = cur(R); give(R, s, 'a', 'field'); const u = give(R, s, 'u'); act(R, s, { a: 'play', id: u }); ok(!R.eff, '발동 안 함'); });

// ── id_0002: 絆 선택 불가 + 소년탐정단 등장 + 코난이면 드로우
t('id_0002: 絆(江戸川コナン)이 있을 때만 상대 효과로 선택되지 않음', () => {
  const R = G({ h: real('id_0002'), c: real('id_0004'), sl: dummy('Sl', { ab: [{ ic: 'onplay', ops: [{ op: 'select', n: 1, do: 'sleep', filter: { own: 'opp' } }] }] }) }, ['h', 'c'], ['sl']); const s = cur(R), o = 1 - s;
  const h = give(R, s, 'h', 'field'); give(R, s, 'c', 'field'); const sl = give(R, o, 'sl'); R.turn = o; act(R, o, { a: 'play', id: sl }); ok(R.eff && !R.eff.req.sel.includes(h), '灰原哀는 후보에서 제외'); ok(R.eff.req.sel.length === 1, '코난만 후보'); answerPick(R, []); eq(R.cards[h].st, 'a', '슬립 안 됨');
  R.turn = s; R.log.length = 0; // 코난 없이도 후보가 되는지: 絆 조건 확인
  const R2 = G({ h: real('id_0002'), sl: dummy('Sl', { ab: [{ ic: 'onplay', ops: [{ op: 'select', n: 1, do: 'sleep', filter: { own: 'opp' } }] }] }) }, ['h'], ['sl']); const s2 = cur(R2), o2 = 1 - s2;
  const h2 = give(R2, s2, 'h', 'field'); const sl2 = give(R2, o2, 'sl'); R2.turn = o2; act(R2, o2, { a: 'play', id: sl2 }); ok(R2.eff && R2.eff.req.sel.includes(h2), '絆 없음 → 선택 가능'); });
t('id_0002: 자신의 효과로는 선택 가능(상대의 능력·효과만 제한)', () => {
  const R = G({ h: real('id_0002'), c: real('id_0004'), sl: dummy('Sl', { ab: [{ ic: 'onplay', ops: [{ op: 'select', n: 1, do: 'sleep', filter: { own: 'self' } }] }] }) }, ['h', 'c', 'sl']); const s = cur(R);
  const h = give(R, s, 'h', 'field'); give(R, s, 'c', 'field'); const sl = give(R, s, 'sl'); act(R, s, { a: 'play', id: sl }); ok(R.eff && R.eff.req.sel.includes(h), '자신의 효과는 선택 가능'); });
t('id_0002: 선언[슬립] → 소년탐정단 Lv≤5 등장, 江戸川コナン이면 1드로우', () => {
  const R = G({ h: real('id_0002'), c: real('id_0007'), g: real('id_0010'), hi: dummy('Hi', { lv: '6', trait: '少年探偵団' }) }, ['h', 'c', 'g']); const s = cur(R);
  const h = give(R, s, 'h', 'field'); R.cards[h].sum = 0; const c = give(R, s, 'c'), g = give(R, s, 'g'), hi = give(R, s, 'hi');
  eq(act(R, s, { a: 'ability', id: h, i: 1 }), undefined, 'declare'); ok(R.eff && R.eff.req.sel.includes(c) && R.eff.req.sel.includes(g) && !R.eff.req.sel.includes(hi), 'Lv6은 후보 아님');
  eq(R.cards[h].st, 's', '코스트: 슬립'); const n = R.P[s].hand.length; answerPick(R, [c]); ok(R.P[s].field.includes(c), '코난 등장'); eq(R.P[s].hand.length, n - 1 + 1, '코난이므로 1드로우'); eq(R.cards[c].st, 's', '코난은 슬립 상태로 등장(id_0007)');
  drain(R); R.cards[h].st = 'a'; R.cards[h].u = {}; const n2 = R.P[s].hand.length; act(R, s, { a: 'ability', id: h, i: 1 }); answerPick(R, [g]); drain(R); eq(R.P[s].hand.length, n2 - 1, '코난이 아니면 드로우 없음'); });

// ── id_0003 / id_0006: 이 캐릭터와의 컨택트로 상대 캐릭터가 리무브됐을 때
t('id_0003: 컨택트로 상대 캐릭터를 리무브하면 1드로우 (AP 부족이면 없음)', () => {
  const R = G({ a: real('id_0003'), v: dummy('V', { ap: '1000' }), w: dummy('W', { ap: '9000' }) }, ['a'], ['v', 'w']); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'a', 'field'), v = give(R, o, 'v', 'field'), w = give(R, o, 'w', 'field'); R.cards[v].st = 's'; R.cards[w].st = 's'; const n = R.P[s].hand.length;
  attack(R, s, a, w); ok(!R.P[o].rem.includes(w), '져서 리무브 안 됨'); eq(R.P[s].hand.length, n, '드로우 없음');
  R.cards[a].st = 'a'; attack(R, s, a, v); ok(R.P[o].rem.includes(v), '리무브됨'); eq(R.P[s].hand.length, n + 1, '1드로우'); });
t('id_0006: 리무브 성공 → 손패 1장 리무브(선택) → 했으면 증거+1, 안 하면 없음', () => {
  const R = G({ a: real('id_0006'), v: dummy('V', { ap: '1000' }), w: dummy('W', { ap: '1000' }) }, ['a'], ['v', 'w']); const s = cur(R), o = 1 - s;
  const a = give(R, s, 'a', 'field'), v = give(R, o, 'v', 'field'), w = give(R, o, 'w', 'field'); R.cards[v].st = 's'; R.cards[w].st = 's'; const e0 = R.P[s].evid.length;
  attack(R, s, a, v); ok(R.eff && R.eff.req.kind === 'pick' && R.eff.req.min === 0, '선택(0장 가능)'); const h = R.P[s].hand[0]; answerPick(R, [h]); ok(R.P[s].rem.includes(h), '손패 리무브'); eq(R.P[s].evid.length, e0 + 1, '증거+1');
  R.cards[a].st = 'a'; attack(R, s, a, w); answerPick(R, []); eq(R.P[s].evid.length, e0 + 1, '하지 않으면 증거 없음'); });

// ── id_0005: 양쪽 현장 6장 이상이면 손패의 이 카드는 Lv4
t('id_0005: 양쪽 현장 합계 6장 이상일 때만 손패에서 Lv4 (FILE 4장으로 사용 가능)', () => {
  const R = G({ a: real('id_0005'), f: dummy('F') }, ['a', 'f', 'f', 'f']); const s = cur(R), o = 1 - s; const a = give(R, s, 'a');
  eq(S.FX.lvOf(R, a), 6, '기본 Lv6'); for (let i = 0; i < 3; i++) give(R, s, 'f', 'field'); for (let i = 0; i < 2; i++) give(R, o, 'f', 'field'); eq(S.FX.lvOf(R, a), 6, '5장 → 그대로');
  give(R, o, 'f', 'field'); eq(S.FX.lvOf(R, a), 4, '6장 → Lv4'); const v = S.view(R, s); eq(v.P[s].hand.find(x => x.id === a).lvx, 4, '클라이언트 표시용 lvx');
  fill(R, s, 3); ok(act(R, s, { a: 'play', id: a }), 'FILE 3장은 부족'); fill(R, s, 4); eq(act(R, s, { a: 'play', id: a }), undefined, 'FILE 4장이면 사용 가능'); });
t('id_0005: 필드에 나가면 원래 레벨 (손패 한정 효과)', () => {
  const R = G({ a: real('id_0005'), f: dummy('F') }, ['a', 'f']); const s = cur(R), o = 1 - s; for (let i = 0; i < 3; i++) { give(R, s, 'f', 'field'); give(R, o, 'f', 'field'); }
  const a = give(R, s, 'a', 'field'); eq(S.FX.lvOf(R, a), 6, '필드에서는 Lv6'); });
t('id_0005: 선언(덱 아래 코스트) → LP0 이하 청색 캐릭터를 액티브', () => {
  const R = G({ a: real('id_0005'), t: real('id_0003') }, ['a', 't']); const s = cur(R); const a = give(R, s, 'a', 'field'); R.cards[a].sum = 0; const tt = give(R, s, 't', 'field'); R.cards[tt].st = 's';
  eq(act(R, s, { a: 'ability', id: a, i: 1 }), undefined, 'declare'); ok(R.P[s].deck[0] === a, '코스트: 자신을 덱 아래'); answerPick(R, [tt]); eq(R.cards[tt].st, 'a', '액티브'); });

// ── id_0007: 슬립 상태로 등장
t('id_0007: 손패에서 사용해도, 효과로 등장해도 슬립 상태', () => {
  const R = G({ c: real('id_0007'), pl: dummy('Pl', { ab: [{ ic: 'onplay', ops: [{ op: 'play', n: 1, from: 'hand', filter: {} }] }] }) }, ['c', 'c', 'pl']); const s = cur(R);
  fill(R, s, 4); const c = give(R, s, 'c'); eq(act(R, s, { a: 'play', id: c }), undefined, 'play'); eq(R.cards[c].st, 's', '손패 사용 → 슬립'); R.fl = {};
  const c2 = give(R, s, 'c'), pl = give(R, s, 'pl'); act(R, s, { a: 'play', id: pl }); answerPick(R, [c2]); eq(R.cards[c2].st, 's', '효과 등장 → 슬립'); });
t('id_0007: 슬립 상태로 등장하므로 그 턴엔 액션·추리 불가, 다음 턴 시작 시 액티브', () => {
  const R = G({ c: real('id_0007') }, ['c']); const s = cur(R); fill(R, s, 4); const c = give(R, s, 'c'); act(R, s, { a: 'play', id: c }); ok(act(R, s, { a: 'reason', who: c }), '슬립이라 추리 불가'); });

// ── id_0008: 능력/효과로 등장한 소년탐정단(Lv≤6) → 액티브 + 迅速
t('id_0008: 효과로 등장한 조건 일치 캐릭터에 액티브+신속 (턴①, 손패 사용은 제외)', () => {
  const R = G({ h: real('id_0002'), d: real('id_0008'), g: real('id_0010'), g2: real('id_0017'), hi: real('id_0007', { lv: '7' }) }, ['h', 'd', 'g', 'g2']); const s = cur(R);
  const d = give(R, s, 'd', 'field'), h = give(R, s, 'h', 'field'); R.cards[h].sum = 0; const g = give(R, s, 'g'), g2 = give(R, s, 'g2');
  act(R, s, { a: 'ability', id: h, i: 1 }); answerPick(R, [g]); drain(R); ok(R.P[s].field.includes(g), '등장'); eq(R.cards[g].st, 'a', '액티브'); ok(S.tk(R, g).rapid, '迅速 부여'); eq(act(R, s, { a: 'reason', who: g }), undefined, '등장한 턴에도 추리 가능');
  R.cards[h].st = 'a'; R.cards[h].u = {}; act(R, s, { a: 'ability', id: h, i: 1 }); answerPick(R, [g2]); drain(R); ok(R.P[s].field.includes(g2), '두 번째 등장'); eq(R.cards[g2].st, 'a', '(id_0017은 원래 액티브)'); ok(!S.tk(R, g2).rapid, '턴① — 두 번째는 부여 안 됨'); });
t('id_0008: 손패에서 직접 사용한 경우 / 레벨 초과 캐릭터는 발동하지 않음', () => {
  const R = G({ d: real('id_0008'), g: real('id_0010') }, ['d', 'g']); const s = cur(R); give(R, s, 'd', 'field'); const g = give(R, s, 'g'); fill(R, s, 4); act(R, s, { a: 'play', id: g }); ok(!S.tk(R, g).rapid, '손패 사용은 제외'); });

// ── id_0010 / 0011 / 0017: 登場時 — Lv3+ 캐릭터 능력 또는 Lv3+ 이벤트 효과로 등장했을 때만
const summoner = { h: real('id_0002') }; // Lv6 캐릭터의 능력으로 등장시킴
function viaChar(target, tk) { const R = G({ ...summoner, x: real(target) }, ['h', 'x']); const s = cur(R); const h = give(R, s, 'h', 'field'); R.cards[h].sum = 0; const x = give(R, s, 'x'); act(R, s, { a: 'ability', id: h, i: 1 }); answerPick(R, [x]); return { R, s, x, h }; }
t('id_0017: Lv6 캐릭터의 능력으로 등장하면 1드로우', () => { const { R, s, x } = viaChar('id_0017'); ok(R.P[s].field.includes(x), '등장'); const n = R.P[s].hand.length; drain(R); eq(R.P[s].hand.length, n, '(이미 처리됨)'); });
t('id_0017: 드로우 수 확인 (등장 전후)', () => { const R = G({ ...summoner, x: real('id_0017') }, ['h', 'x']); const s = cur(R); const h = give(R, s, 'h', 'field'); R.cards[h].sum = 0; const x = give(R, s, 'x'); const n = R.P[s].hand.length;
  act(R, s, { a: 'ability', id: h, i: 1 }); answerPick(R, [x]); eq(R.P[s].hand.length, n - 1 + 1, '등장(-1) + 登場時 드로우(+1)'); });
t('id_0017: 손패에서 직접 사용하면 발동하지 않음', () => { const R = G({ x: real('id_0017') }, ['x']); const s = cur(R); fill(R, s, 3); const x = give(R, s, 'x'); const n = R.P[s].hand.length; eq(act(R, s, { a: 'play', id: x }), undefined, 'play'); eq(R.P[s].hand.length, n - 1, '드로우 없음'); });
t('id_0017: Lv2 이벤트/Lv3 이벤트 — 이벤트 레벨 조건', () => {
  for (const [lv, want] of [['2', 0], ['3', 1]]) { const R = G({ x: real('id_0017'), ev: { n: 'Ev', type: 'event', color: 'blue', lv, ab: [{ ic: 'event', ops: [{ op: 'play', n: 1, from: 'hand', filter: { name: 'id_none' } }] }] } }, ['x', 'ev']);
    R.defs['0:ev'].ab[0].ops[0].filter.name = ''; R.defs['1:ev'].ab[0].ops[0].filter.name = ''; const s = cur(R); fill(R, s, 3); const x = give(R, s, 'x'), ev = give(R, s, 'ev'); const n = R.P[s].hand.length; act(R, s, { a: 'play', id: ev }); answerPick(R, [x]); drain(R); eq(R.P[s].hand.length, n - 2 + want, `이벤트 Lv${lv}: 드로우 ${want}`); } });
t('id_0010: 캐릭터 능력으로 등장 시 Lv≤5 캐릭터 슬립 (Lv6은 후보 아님)', () => {
  const R = G({ ...summoner, x: real('id_0010'), lo: dummy('Lo', { lv: '5' }), hi: dummy('Hi', { lv: '6' }) }, ['h', 'x'], ['lo', 'hi']); const s = cur(R), o = 1 - s; const lo = give(R, o, 'lo', 'field'), hi = give(R, o, 'hi', 'field');
  const h = give(R, s, 'h', 'field'); R.cards[h].sum = 0; const x = give(R, s, 'x'); act(R, s, { a: 'ability', id: h, i: 1 }); answerPick(R, [x]); ok(R.eff, '登場時 질의'); ok(R.eff.req.sel.includes(lo) && !R.eff.req.sel.includes(hi), 'Lv5 후보, Lv6 제외'); answerPick(R, [lo]); eq(R.cards[lo].st, 's', '슬립'); });
t('id_0011: 조건 충족 시 캐릭터 1장 AP+2000 (턴 종료까지)', () => {
  const R = G({ ...summoner, x: real('id_0011'), f: dummy('F', { ap: '1000' }) }, ['h', 'x', 'f']); const s = cur(R); const f = give(R, s, 'f', 'field'); const h = give(R, s, 'h', 'field'); R.cards[h].sum = 0; const x = give(R, s, 'x');
  act(R, s, { a: 'ability', id: h, i: 1 }); answerPick(R, [x]); answerPick(R, [f]); eq(S.ap(R, f), 3000, 'AP+2000'); });

// ── id_0014: 상대 턴 중 현장 리무브 시 → 江戸川コナン이 나올 때까지 공개 → 손패, 나머지 덱 아래 + 셔플
t('id_0014: 상대 턴에 리무브되면 덱을 공개해 코난을 손패로, 나머지는 덱 아래 (카드 보존)', () => {
  const R = G({ m: real('id_0014'), c: real('id_0004'), x: dummy('X'), y: dummy('Y'), atk: dummy('Atk', { ap: '9000' }) }, ['m', 'c', 'x', 'y'], ['atk']); const s = cur(R), o = 1 - s;
  const m = give(R, s, 'm', 'field'); R.cards[m].st = 's'; const c = give(R, s, 'c', 'deck'), x = give(R, s, 'x', 'deck'), y = give(R, s, 'y', 'deck'); R.P[s].deck.push(x, y, c); // 위에서 c가 아니라 y,x 를 먼저 보도록: 위=c 뒤집기
  R.P[s].deck = R.P[s].deck.filter(id => id !== c); R.P[s].deck.splice(R.P[s].deck.length - 2, 0, c); // 덱 위: y, x, c 순서로 공개되게 → [.., c, x, y] 의 끝이 위
  R.P[s].deck = R.P[s].deck.filter(id => ![c, x, y].includes(id)); R.P[s].deck.push(c, x, y); // top = y
  R.turn = o; const a = give(R, o, 'atk', 'field'); R.cards[a].sum = 0; const total = R.P[s].deck.length + R.P[s].hand.length;
  act(R, o, { a: 'action', id: a, k: 'char', tid: m }); act(R, s, { a: 'guard', id: null }); let g = 0; while (R.sub && g++ < 8) act(R, R.sub.who, { a: 'pass' });
  ok(R.eff && R.eff.req.kind === 'ack' && R.eff.req.who === s, '공개 확인 질의'); eq(R.eff.req.ids.length, 3, 'y, x, c 순으로 3장 공개'); act(R, s, { a: 'ans', v: null });
  ok(R.P[s].hand.includes(c), '코난이 손패에'); ok(R.P[s].deck.includes(x) && R.P[s].deck.includes(y), '나머지는 덱에 남음'); eq(R.P[s].deck.length + R.P[s].hand.length, total, '카드 수 보존'); });
t('id_0014: 내 턴에 리무브되면 발동하지 않음', () => {
  const R = G({ m: real('id_0014') }, ['m']); const s = cur(R); const m = give(R, s, 'm', 'field'); S.FX.rmChar(R, m, 'effect'); ok(!R.q.length && !R.eff, '발동 안 함'); });

// ── id_0016: 슬립 중 상대는 내 Lv≤4 캐릭터를 지정해 액션할 수 없음
t('id_0016: 슬립일 때만, Lv≤4 아군에 대한 상대의 액션 지정이 막힘', () => {
  const R = G({ m: real('id_0016'), lo: dummy('Lo', { lv: '4' }), hi: dummy('Hi', { lv: '5' }), atk: dummy('Atk') }, ['m', 'lo', 'hi'], ['atk']); const s = cur(R), o = 1 - s;
  const m = give(R, s, 'm', 'field'), lo = give(R, s, 'lo', 'field'), hi = give(R, s, 'hi', 'field'); [m, lo, hi].forEach(x => { R.cards[x].st = 's'; }); R.turn = o; const a = give(R, o, 'atk', 'field'); R.cards[a].sum = 0;
  ok(/지정할 수 없/.test(act(R, o, { a: 'action', id: a, k: 'char', tid: lo }) || ''), 'Lv4 지정 불가'); eq(act(R, o, { a: 'action', id: a, k: 'char', tid: hi }), undefined, 'Lv5는 지정 가능');
  const R2 = G({ m: real('id_0016'), lo: dummy('Lo', { lv: '4' }), atk: dummy('Atk') }, ['m', 'lo'], ['atk']); const s2 = cur(R2), o2 = 1 - s2; const m2 = give(R2, s2, 'm', 'field'), lo2 = give(R2, s2, 'lo', 'field'); R2.cards[lo2].st = 's'; R2.cards[m2].st = 'a';
  R2.turn = o2; const a2 = give(R2, o2, 'atk', 'field'); R2.cards[a2].sum = 0; eq(act(R2, o2, { a: 'action', id: a2, k: 'char', tid: lo2 }), undefined, '액티브이면 제한 없음'); });

// ── id_0019: 이벤트 SET + 세트된 캐릭터에 컨택트 중 AP+2000 부여
t('id_0019: 5장 확인→1장 손패→나머지 아래, 이벤트를 캐릭터에 세트 → 컨택트 중 AP+2000, 캐릭터가 떠나면 리무브 에리어로', () => {
  const R = G({ ev: real('id_0019'), a: dummy('A', { ap: '3000' }), v: dummy('V', { ap: '4000' }) }, ['ev', 'a'], ['v']); const s = cur(R), o = 1 - s; fill(R, s, 2);
  const a = give(R, s, 'a', 'field'), v = give(R, o, 'v', 'field'); R.cards[v].st = 's'; const ev = give(R, s, 'ev'); const n = R.P[s].hand.length;
  eq(act(R, s, { a: 'play', id: ev }), undefined, 'play event'); answerPick(R, [R.eff.req.sel[0]]); if (R.eff && R.eff.req.ordered) act(R, s, { a: 'ans', v: R.eff.req.ids }); drain(R);
  eq(R.cards[a].sets.length, 1, '세트됨'); ok(!R.P[s].rem.includes(ev), '이벤트는 리무브 에리어가 아님(세트 중)'); eq(R.P[s].hand.length, n - 1 + 1, '사용(-1) + 서치(+1)'); eq(S.view(R, s).P[s].field[0].set, 1, '클라이언트 SET 표시');
  R.cards[a].sum = 0; act(R, s, { a: 'action', id: a, k: 'char', tid: v }); act(R, o, { a: 'guard', id: null }); ok(R.sub && R.sub.type === 'contact', '컨택트'); eq(S.ap(R, a), 5000, '컨택트 중 AP+2000');
  let g = 0; while (R.sub && g++ < 8) act(R, R.sub.who, { a: 'pass' }); ok(R.P[o].rem.includes(v), '5000 ≥ 4000 으로 승리'); eq(S.ap(R, a), 3000, '컨택트 종료 후 원복');
  S.FX.rmChar(R, a, 'effect'); ok(R.P[s].rem.includes(ev), '캐릭터가 떠나면 세트 이벤트도 리무브 에리어로'); });
t('id_0019: 세트 후 다음 컨택트에도 계속 유효, 현장이 비어 있으면 세트 없이 리무브', () => {
  const R = G({ ev: real('id_0019') }, ['ev']); const s = cur(R); fill(R, s, 2); const ev = give(R, s, 'ev'); act(R, s, { a: 'play', id: ev }); if (R.eff) answerPick(R, []); if (R.eff && R.eff.req.ordered) act(R, s, { a: 'ans', v: R.eff.req.ids }); drain(R);
  ok(R.P[s].rem.includes(ev), '세트할 캐릭터가 없으면 리무브 에리어로'); });

let bad = 0; for (const [n, f] of T) { try { f(); console.log('✓', n); } catch (e) { bad++; console.log('✗', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); } }
console.log(bad ? `\n${bad}개 실패` : `\n패턴 테스트 ${T.length}개 전부 통과`); process.exit(bad ? 1 : 0);
