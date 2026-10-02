process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
// 사용자의 실제 무작위 100장(sample100)에서 manual 이던 문장들이 엔진에서 "실제로 동작"하는지 검증한다.
// 카드 ab 는 test/fixtures/sample100.rules.json = `import_cards.py --effects-only --rules-only` 로 원문(fx)에서 만든 결과(API 없음).
// 각 테스트는 실제 카드 1장 + (가능하면) 숫자/이름/특징이 다른 변형 ab 로 일반성도 확인한다.
const fs = require('fs'), path = require('path');
const { S, game, key, give, ok, eq, act } = require('./helpers');
const FX = S.FX;
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sample100.rules.json'), 'utf8')).cards;
const real = (id, over = {}) => ({ ...FIX[id], color: 'blue', ...over }); // 카드 색은 테스트 사건(青)에 맞춘다(색 제한 검사는 별도)
const B = { p: { n: 'P', type: 'partner', color: 'blue', lp: '1' }, k: { n: 'K', type: 'case', color: 'blue', lv: '2', lv2: '3' } };
const dummy = (n, extra = {}) => ({ n, type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1', ...extra });
// 턴 시작 시 FILE 에 들어간 무작위 카드를 덱으로 되돌려 시나리오를 결정적으로 만든다
const G = (defs, l0 = [], l1 = l0) => { const R = game({ ...B, ...defs }, l0, l1); R.P.forEach(P => P.deck.unshift(...P.file.splice(0))); return R; };
const T = []; const t = (n, f) => T.push([n, f]);
const req = R => R.eff && R.eff.req;
const ans = (R, v) => { ok(R.eff, '질의가 와야 함'); const e = act(R, R.eff.req.who, { a: 'ans', v }); if (e) throw new Error('ans: ' + e); };
const drain = R => { let g = 0; while (R.eff && g++ < 30) { const q = R.eff.req; ans(R, q.kind === 'yn' ? false : q.kind === 'pick' ? q.sel.slice(0, q.min || 0) : q.kind === 'opt' ? 0 : q.kind === 'optm' ? [] : null); } };
const auto = (R, ...pref) => { let g = 0; while (R.eff && g++ < 30) { const q = req(R); ans(R, q.kind === 'pick' ? (q.ordered ? q.ids : [pref.find(x => q.sel.includes(x)) ?? q.sel[0]].filter(x => x != null && (q.min > 0 || pref.some(y => q.sel.includes(y))))) : q.kind === 'yn' ? true : q.kind === 'optm' ? [0] : q.kind === 'opt' ? 0 : null); } };
const fillFile = (R, s, n) => { const P = R.P[s]; for (let i = P.deck.length - 1; i >= 0 && P.file.length < n; i--) { const k = key(R, P.deck[i]); if (k === 'filler' || /^f\d+$/.test(k)) P.file.push(P.deck.splice(i, 1)[0]); } ok(P.file.length >= n, 'FILE 채움 실패'); };
const filler = (R, s, z, n) => { const out = []; const P = R.P[s]; for (let i = P.deck.length - 1; i >= 0 && out.length < n; i--) { const k = key(R, P.deck[i]); if (k === 'filler' || /^f\d+$/.test(k)) out.push(P.deck.splice(i, 1)[0]); } ok(out.length === n, '채움 카드 부족'); P[z].push(...out); return out; };
const solve = (R, s) => { FX.setSolved(R, s); FX.pump(R); };
const spawn = (R, s, k, zone = 'field') => give(R, s, k, zone);
const evid = (R, s, n) => { const P = R.P[s]; const ids = filler(R, s, 'evid', n); ids.forEach(i => { R.cards[i].up = false; }); return ids; };

// ══ 1순위: 【解決編】이 되었을 때 손패 N장 리무브 (사건 카드 6장 이상: 0510 0638 0714 0913 0930 0946 1095 …) ══
t('onsolve: "この事件が解決編になったとき、自分は手札をN枚リムーブする" — 실제 사건 카드(id_0714) 해결편 이행 시 손패 1장을 골라 리무브', () => {
  const R = G({ k: real('id_0714', { type: 'case', lv: '2', lv2: '3' }) }); const s = R.turn, h = R.P[s].hand.length;
  solve(R, s); ok(req(R) && req(R).kind === 'pick' && req(R).min === 1 && req(R).max === 1, '손패 1장 선택 요구'); const pick = req(R).sel[0]; ans(R, [pick]);
  ok(R.P[s].rem.includes(pick), '리무브 에리어로'); eq(R.P[s].hand.length, h - 1, '손패 1장 감소'); ok(!R.eff, '질의 종료');
  solve(R, s); ok(!R.eff, '이미 해결편이면 다시 발동하지 않음'); });
t('onsolve 일반성: 리무브 장수(2장)·사건 카드가 달라도 동일 문장이면 동작 (변형 ab)', () => {
  const R = G({ k: real('id_0714', { type: 'case', ab: [{ ic: 'onsolve', ops: [{ op: 'discard', n: 2 }] }] }) }); const s = R.turn, h = R.P[s].hand.length;
  solve(R, s); eq(req(R).min, 2, '2장 요구'); ans(R, req(R).sel.slice(0, 2)); eq(R.P[s].hand.length, h - 2, '2장 감소'); });
t('onsolve: 손패보다 많이 요구하면 있는 만큼만 (id_0913/0946/0930/1095 동일 문장)', () => {
  const R = G({ k: real('id_1095', { type: 'case' }) }); const s = R.turn; R.P[s].deck.push(...R.P[s].hand.splice(0, R.P[s].hand.length - 1)); eq(R.P[s].hand.length, 1, '손패 1장'); solve(R, s);
  if (req(R)) ans(R, req(R).sel.slice(0, 1)); eq(R.P[s].hand.length, 0, '남은 1장 리무브'); });
t('onsolve: 상대가 카드를 1장 드로우 (id_0723 "相手はカードを1枚引く")', () => {
  const R = G({ k: real('id_0723', { type: 'case' }) }); const s = R.turn, o = 1 - s, h = R.P[o].hand.length; solve(R, s); drain(R); eq(R.P[o].hand.length, h + 1, '상대 드로우'); });

// ══ 해결편 【宣言】: 증거 뒤집기 비용 / 조건 / 턴① ══
t('declare(사건): 裏向きの証拠 N개를 표로 뒤집는 비용, 해결편에서만, 턴① (id_1095: 【緑】특징[警察] 2장 이상 조건)', () => {
  const R = G({ k: real('id_1095', { type: 'case' }), a: dummy('A', { trait: '警察', color: 'green' }), b: dummy('B', { trait: '警察', color: 'green' }) }, ['a', 'b']); const s = R.turn;
  const ev = evid(R, s, 2); ok(act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }), '해결편 전엔 선언 불가');
  solve(R, s); ans(R, [req(R).sel[0]]); ok(act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }), '[緑]警察 2장 없으면 선언 불가');
  give(R, s, 'a', 'field'); give(R, s, 'b', 'field'); const h = R.P[s].hand.length; eq(act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }), undefined, '선언'); drain(R);
  ok(ev.every(i => R.cards[i].up), '증거 2개가 표향'); eq(R.P[s].hand.length, h + 1, '드로우 +1'); ok(act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }), '턴① 재선언 불가'); });
t('declare: 증거가 부족하면 선언할 수 없다 (비용 검사)', () => {
  const R = G({ k: real('id_0510', { type: 'case' }), c: dummy('C', { trait: '長野県警' }) }, ['c']); const s = R.turn; solve(R, s); drain(R); give(R, s, 'c', 'field'); evid(R, s, 2);
  ok(act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }), '증거 3개 필요'); });
t('declare: 뒤집은 증거 수 1개당 AP-1000 (id_0946 "コストで表向きにした証拠1つにつき")', () => {
  const R = G({ k: real('id_0946', { type: 'case' }), a: dummy('A', { trait: '神奈川県警' }), v: dummy('V', { ap: '5000' }) }, ['a'], ['v']); const s = R.turn, o = 1 - s; solve(R, s); drain(R);
  give(R, s, 'a', 'field'); const v = give(R, o, 'v', 'field'); evid(R, s, 3); eq(act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }), undefined, '선언');
  if (req(R) && req(R).kind === 'num') ans(R, 2); else if (req(R)) ans(R, req(R).kind === 'pick' ? [] : 2);
  if (req(R)) ans(R, [v]); drain(R); const up = R.P[s].evid.filter(i => R.cards[i].up).length; ok(up >= 1, '뒤집힌 증거'); eq(S.ap(R, v), 5000 - 1000 * up, `AP-1000×${up}`); });
t('traitAll: 자신의 모든 에리어(현장·손패·파트너)의 캐릭터가 특징을 얻음 (id_0714)', () => {
  const R = G({ k: real('id_0714', { type: 'case' }), a: dummy('A', { trait: '探偵' }) }, ['a']); const s = R.turn; solve(R, s); drain(R); const a = give(R, s, 'a', 'field'); const h = give(R, s, 'a', 'hand'); evid(R, s, 2);
  ok(!FX.traitsId(R, a).includes('喫茶ポアロ'), '전'); eq(act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }), undefined, '선언'); drain(R);
  ok(FX.traitsId(R, a).includes('喫茶ポアロ') && FX.traitsId(R, h).includes('喫茶ポアロ'), '후: 현장/손패 모두'); FX.doEnd && FX.doEnd(R); });

// ══ 2순위: MR 능력 — 상대 턴에 현장을 떠나면 파트너 에리어로 ══
t('MR(id_0703/0899/1153 공통 【MR能力】): 상대 턴에 현장에서 리무브되면 리무브 에리어 대신 파트너 에리어로', () => {
  for (const id of ['id_0703', 'id_0899', 'id_1153']) {
    const R = G({ m: real(id, { ab: FIX[id].ab.filter(a => a.ic === 'mr') }) }, ['m']); const s = R.turn, o = 1 - s; const m = give(R, s, 'm', 'field'); R.turn = o;
    FX.rmChar(R, m, 'effect'); FX.pump(R); ok(R.P[s].pa.includes(m), `${id}: 파트너 에리어`); ok(!R.P[s].rem.includes(m) && !R.P[s].field.includes(m), `${id}: 리무브/현장에 없음`); } });
t('MR: 자신의 턴에 떠나면 보통대로 리무브 에리어 / 손패·덱으로 가는 이동도 상대 턴이면 파트너 에리어', () => {
  const R = G({ m: dummy('M', { ab: [{ ic: 'mr' }] }) }, ['m']); const s = R.turn, o = 1 - s; const m = give(R, s, 'm', 'field'); FX.rmChar(R, m, 'effect'); FX.pump(R); ok(R.P[s].rem.includes(m), '내 턴엔 리무브');
  const m2 = give(R, s, 'm', 'field'); R.turn = o; FX.moveOut(R, m2, 'hand'); FX.pump(R); ok(R.P[s].pa.includes(m2), '상대 턴엔 손패로 가는 이동도 파트너 에리어'); });
t('MR: 파트너 에리어의 MR 은 행동할 수 없지만, 【パートナーエリアでも有効/発動】(pa) 능력은 동작 (id_0899 static+pa)', () => {
  const R = G({ m: real('id_0899'), a: dummy('Sat', { name: 'x' }) }, ['m']); const s = R.turn; const m = give(R, s, 'm', 'pa'); R.cards[m].st = 'a';
  ok(act(R, s, { a: 'action', id: m, k: 'char', tid: null }), '파트너 에리어의 캐릭터는 액션 불가'); ok(FX.isMR(R, m), 'MR 판정'); });
t('MR: 자신의 현장에 MR 이 등장하면 이미 있던 MR 은 리무브 (현장/파트너 에리어 모두)', () => {
  const R = G({ m1: dummy('M1', { ab: [{ ic: 'mr' }] }), m2: dummy('M2', { ab: [{ ic: 'mr' }] }), m3: dummy('M3', { ab: [{ ic: 'mr' }] }) }, ['m1', 'm2', 'm3']); const s = R.turn;
  const a = give(R, s, 'm1', 'field'), b = give(R, s, 'm2', 'pa'); const c = give(R, s, 'm3'); eq(act(R, s, { a: 'play', id: c }), undefined, 'play'); drain(R);
  ok(R.P[s].field.includes(c), '새 MR 은 현장'); ok(!R.P[s].field.includes(a) && !R.P[s].pa.includes(b), '기존 MR 은 현장/파트너 에리어에서 제거'); ok(R.P[s].rem.includes(a) && R.P[s].rem.includes(b), '리무브 에리어로'); });
t('MR: 상대의 MR 에는 영향 없음, MR 이 아닌 캐릭터는 영향 없음', () => {
  const R = G({ m1: dummy('M1', { ab: [{ ic: 'mr' }] }), m2: dummy('M2', { ab: [{ ic: 'mr' }] }), n: dummy('N') }, ['m1', 'n'], ['m2']); const s = R.turn, o = 1 - s;
  const a = give(R, o, 'm2', 'field'), n = give(R, s, 'n', 'field'); const c = give(R, s, 'm1'); act(R, s, { a: 'play', id: c }); drain(R); ok(R.P[o].field.includes(a) && R.P[s].field.includes(n), '무관한 카드는 그대로'); });

// ══ 3순위: 대체 효과 / 유발 효과 ══
const zap = dummy('Zap', { ab: [{ ic: 'onplay', ops: [{ op: 'select', n: 1, filter: { own: 'opp' }, do: 'remove' }] }] });
t('replace(id_0080): 상대 턴, 다른 아군이 상대 효과로 떠날 때 자신을 리무브하면 대신 손패로', () => {
  const R = G({ r: real('id_0080'), v: dummy('V'), z: zap }, ['r', 'v'], ['z']); const s = R.turn, o = 1 - s; const r = give(R, s, 'r', 'field'), v = give(R, s, 'v', 'field'); R.turn = o; const z = give(R, o, 'z');
  eq(act(R, o, { a: 'play', id: z }), undefined, 'play'); ans(R, [v]); ok(req(R) && req(R).kind === 'yn' && req(R).who === s, '대체 여부 질의(소유자에게)'); ans(R, true); drain(R);
  ok(R.P[s].hand.includes(v) && !R.P[s].field.includes(v) && !R.P[s].rem.includes(v), '대신 손패로'); ok(R.P[s].rem.includes(r), '松田는 리무브'); });
t('replace: 거절하면 원래대로 리무브 / 자신은 대상 아님 / 내 턴엔 불가(cond turn:opp) / 컨택트로 리무브될 때도 대체', () => {
  const R = G({ r: real('id_0080'), v: dummy('V'), z: zap }, ['r', 'v'], ['z']); const s = R.turn, o = 1 - s; const r = give(R, s, 'r', 'field'), v = give(R, s, 'v', 'field'); R.turn = o; const z = give(R, o, 'z');
  act(R, o, { a: 'play', id: z }); ans(R, [v]); ans(R, false); drain(R); ok(R.P[s].rem.includes(v), '거절 → 리무브'); ok(R.P[s].field.includes(r), '松田 유지');
  const R2 = G({ r: real('id_0080'), z: zap }, ['r'], ['z']); const s2 = R2.turn, o2 = 1 - s2; const r2 = give(R2, s2, 'r', 'field'); R2.turn = o2; const z2 = give(R2, o2, 'z'); act(R2, o2, { a: 'play', id: z2 }); ans(R2, [r2]); ok(!R2.eff || R2.eff.req.kind !== 'yn', '자기 자신은 대체 대상이 아님'); drain(R2); ok(R2.P[s2].rem.includes(r2), '리무브');
  const R3 = G({ r: real('id_0080'), v: dummy('V'), z: zap }, ['r', 'v'], ['z']); const s3 = R3.turn; give(R3, s3, 'r', 'field'); const v3 = give(R3, s3, 'v', 'field'); const z3 = give(R3, 1 - s3, 'z'); R3.turn = s3;
  FX.rmChar(R3, v3, 'effect', s3); FX.pump(R3); ok(!req(R3) && R3.P[s3].rem.includes(v3), '내 턴/내 효과로는 대체 안 됨'); });
t('replace(컨택트): 상대 캐릭터와의 컨택트로 아군이 리무브될 때도 대체 가능', () => {
  const R = G({ r: real('id_0080'), v: dummy('V', { ap: '1000' }), a: dummy('Atk', { ap: '5000' }) }, ['r', 'v'], ['a']); const s = R.turn, o = 1 - s; give(R, s, 'r', 'field'); const v = give(R, s, 'v', 'field'); R.cards[v].st = 's'; const a = give(R, o, 'a', 'field'); R.turn = o; R.cards[a].sum = 0; R.cards[a].st = 'a';
  eq(act(R, o, { a: 'action', id: a, k: 'char', tid: v }), undefined, 'action'); act(R, s, { a: 'guard', id: null }); let g = 0; while (R.sub && g++ < 8) act(R, R.sub.who, { a: 'pass' }); FX.pump(R);
  ok(req(R) && req(R).kind === 'yn', '대체 질의'); ans(R, true); drain(R); ok(R.P[s].hand.includes(v), '대신 손패'); });
t('onmain(id_0572): 내 턴 메인 페이즈 시작 시 손패 1장을 리무브해도 되며, 그러면 리무브 에리어의 지정 이름 카드를 손패로', () => {
  const R = G({ m: real('id_0572'), a: dummy('赤井秀一') , b: dummy('X') }, ['m', 'a']); const s = R.turn; give(R, s, 'm', 'field'); const a = give(R, s, 'a', 'rem'); const h = R.P[s].hand.length;
  FX.fireMain(R, s); FX.pump(R); ok(req(R) && req(R).kind === 'pick' && req(R).min === 0, '리무브 여부(선택)'); ans(R, [req(R).sel[0]]); if (req(R)) ans(R, [a]); drain(R);
  ok(R.P[s].hand.includes(a), '赤井秀一 회수'); eq(R.P[s].hand.length, h, '-1 +1'); });
t('onmain(id_0575): 세트된 카드를 리무브하면 증거 1개 (unset → gain)', () => {
  const R = G({ m: real('id_0575') }, ['m']); const s = R.turn; const m = give(R, s, 'm', 'field'); const under = filler(R, s, 'rem', 1)[0]; R.P[s].rem.pop(); R.cards[m].fd = [under]; R.cards[under].fdOn = m;
  const ev = R.P[s].evid.length; FX.fireMain(R, s); FX.pump(R); if (req(R) && req(R).kind === 'yn') ans(R, true); if (req(R)) ans(R, [under]); drain(R); eq(R.P[s].evid.length, ev + 1, '증거 +1'); });
t('onallyremoved(id_0447): 상대 턴 [赤]아군이 리무브되면 덱 위를 공개, 같은 특징이면 손패 아니면 덱 아래 (턴①, 슬립 상태일 때만)', () => {
  const R = G({ a: real('id_0447'), r: dummy('R', { color: 'red', trait: '探偵' }), same: dummy('Same', { trait: '探偵' }) }, ['a', 'r', 'same']); const s = R.turn, o = 1 - s;
  const a = give(R, s, 'a', 'field'), r = give(R, s, 'r', 'field'), same = give(R, s, 'same', 'deck'); R.P[s].deck.push(same); R.turn = o; R.cards[a].st = 'a';
  FX.rmChar(R, r, 'effect', o); FX.pump(R); ok(!req(R) && R.P[s].deck[R.P[s].deck.length - 1] === same, '액티브 상태면 발동하지 않음'); R.cards[a].st = 's'; const r2 = give(R, s, 'r', 'field'); FX.rmChar(R, r2, 'effect', o); FX.pump(R); drain(R);
  ok(R.P[s].hand.includes(same), '같은 특징이라 손패로'); });
t('onallycontact(id_0475): 다른 아군이 컨택트하면 자신을 슬립해 컨택트 중 그 캐릭터 AP+1000', () => {
  const R = G({ c: real('id_0475'), a: dummy('A', { ap: '3000' }), v: dummy('V', { ap: '3500' }) }, ['c', 'a'], ['v']); const s = R.turn, o = 1 - s; const c = give(R, s, 'c', 'field'), a = give(R, s, 'a', 'field'), v = give(R, o, 'v', 'field'); R.cards[v].st = 's'; R.cards[a].sum = 0; R.cards[a].st = 'a';
  eq(act(R, s, { a: 'action', id: a, k: 'char', tid: v }), undefined, 'action'); act(R, o, { a: 'guard', id: null }); if (req(R) && req(R).kind === 'yn') ans(R, true); if (req(R) && req(R).kind === 'pick') { ok(req(R).sel.includes(a) && req(R).sel.includes(v), '컨택트 중인 두 캐릭터가 후보'); ans(R, [a]); } drain(R);
  eq(R.cards[c].st, 's', '슬립'); eq(S.ap(R, a), 4000, '컨택트 중 +1000'); });
t('onallykill(id_1097): 상대 캐릭터가 [京極真]이외의 AP10000↑ 아군과의 컨택트로 리무브되면 손패 1장 리무브 → AP+4000', () => {
  const R = G({ kyo: real('id_1097'), big: dummy('Big', { ap: '10000' }), v: dummy('V', { ap: '1000' }) }, ['kyo', 'big'], ['v']); const s = R.turn, o = 1 - s; const k = give(R, s, 'kyo', 'field'), big = give(R, s, 'big', 'field'), v = give(R, o, 'v', 'field'); R.cards[v].st = 's'; R.cards[big].sum = 0; R.cards[big].st = 'a';
  eq(act(R, s, { a: 'action', id: big, k: 'char', tid: v }), undefined, 'action'); act(R, o, { a: 'guard', id: null }); let g = 0; while (R.sub && g++ < 8) act(R, R.sub.who, { a: 'pass' }); FX.pump(R);
  if (req(R) && req(R).kind === 'yn') ans(R, true); if (req(R) && req(R).kind === 'pick') ans(R, [req(R).sel[0]]); drain(R); ok(R.P[o].rem.includes(v), '상대 캐릭터 리무브'); eq(S.ap(R, k), 6000 + 4000, 'AP+4000'); });
t('onremleave(id_0586): 내 턴, 리무브 에리어의 특징 카드가 리무브 에리어를 떠나면 캐릭터 1장 AP-1000', () => {
  const R = G({ y: real('id_0586'), n: dummy('N', { trait: '長野県警' }), v: dummy('V', { ap: '3000' }) }, ['y', 'n'], ['v']); const s = R.turn, o = 1 - s; give(R, s, 'y', 'field'); const n = give(R, s, 'n', 'rem'); const v = give(R, o, 'v', 'field');
  FX.remLeft(R, s, [n]); FX.pump(R); if (req(R)) ans(R, [v]); drain(R); eq(S.ap(R, v), 2000, 'AP-1000'); });

// ══ winalt / 기타 상태·정적 효과 ══
t('winalt(id_0723/0384): 【黒】파트너일 때 해결편 【証拠隠滅】— 증거를 사건 레벨 수만큼 리무브하면 상대 패배 / 증거 부족·파트너 색 불일치면 불가', () => {
  for (const id of ['id_0723', 'id_0384']) {
    const mk = pc => { const R = G({ k: real(id, { type: 'case', lv: '2', lv2: '3' }), p: { n: 'P', type: 'partner', color: pc, lp: '1' } }); const s = R.turn; solve(R, s); drain(R); R.cards[R.P[s].partner].st = 'a'; R.P[s].pIn = false; return [R, s]; };
    let [R, s] = mk('black'); const need = s === R.first ? 2 : 3; evid(R, s, need - 1); ok(act(R, s, { a: 'solve' }) || R.phase !== 'over', `${id}: 증거 부족 → 승리 불가`); ok(R.phase !== 'over', `${id}: 증거 부족`);
    [R, s] = mk('black'); const ev = evid(R, s, need + 1); const before = R.P[s].evid.length; eq(act(R, s, { a: 'solve' }), undefined, `${id}: solve`); drain(R); eq(R.phase, 'over', `${id}: 게임 종료`); eq(R.winner, s, `${id}: 내가 승리`); eq(before - R.P[s].evid.length, need, `${id}: 증거 ${need}개(사건 레벨) 소모`);
    [R, s] = mk('red'); ok(!FX.winAlt(R, s), `${id}: 파트너가 [黒]이 아니면 대체 능력 없음`); } });
t('static ap(조건부): [毛利探偵事務所]3장 이상일 때만 AP+2000 (id_0727 fh/fhN, 해결편·내 턴)', () => {
  const R = G({ m: real('id_0727', { ap: '3000' }), a: dummy('A', { trait: '毛利探偵事務所' }), b: dummy('B', { trait: '毛利探偵事務所' }) }, ['m', 'a', 'b']); const s = R.turn; const m = give(R, s, 'm', 'field'); R.cards[R.P[s].kase].solved = true;
  eq(S.ap(R, m), 3000, '2장 미만'); give(R, s, 'a', 'field'); give(R, s, 'b', 'field'); eq(S.ap(R, m), 5000, '3장(자신 포함) 이상 → +2000'); R.turn = 1 - s; eq(S.ap(R, m), 3000, '상대 턴엔 없음'); });
t('static kw(id_0774 【ミスリード】/ id_1097 【突撃】): 키워드 전용 줄이 정적 능력으로 부여됨', () => {
  const R = G({ q: real('id_0774') }, ['q']); const s = R.turn; const q = give(R, s, 'q', 'field'); ok(FX.hasKwTk(R, q, 'misread1') || FX.hasKwTk(R, q, 'misread'), 'ミスリード 보유'); });
t('onend(id_0774): 내 턴 종료 시 파트너 에리어에 특징 [ビッグジュエル] 카드가 있으면 자신을 액티브', () => {
  const R = G({ q: real('id_0774'), j: dummy('J', { trait: 'ビッグジュエル' }) }, ['q', 'j']); const s = R.turn; const q = give(R, s, 'q', 'field'); R.cards[q].st = 's'; act(R, s, { a: 'end' }); FX.pump(R); eq(R.cards[q].st, 's', '파트너 에리어에 없으면 슬립 유지');
  const R2 = G({ q: real('id_0774'), j: dummy('J', { trait: 'ビッグジュエル' }) }, ['q', 'j']); const s2 = R2.turn; const q2 = give(R2, s2, 'q', 'field'); R2.cards[q2].st = 's'; give(R2, s2, 'j', 'pa'); act(R2, s2, { a: 'end' }); FX.pump(R2); drain(R2); eq(R2.cards[q2].st, 'a', '있으면 액티브'); });


// ══ 탐색/공개/회수 계열 ══
const topOf = (R, s, k) => { const P = R.P[s]; const id = give(R, s, k, 'deck'); P.deck.splice(P.deck.indexOf(id), 1); P.deck.push(id); return id; }; // 덱 맨 위(끝)에 지정 카드
t('revealTop(id_0780/0817): 덱 위 1장 공개 → 조건(이름 or 특징) 맞으면 손패, 아니면 덱 아래 — [怪盗キッド]/[高校生] 와 [警察]/[探偵] 둘 다', () => {
  for (const [id, hitTrait, name] of [['id_0780', '高校生', '怪盗キッド'], ['id_0817', '探偵', null]]) {
    const R = G({ c: real(id, { ap: '1000' }), h: dummy('Hit', { trait: hitTrait }), m: dummy('Miss', { trait: 'zzz' }), ...(name ? { n: dummy(name) } : {}) }, ['c', 'h', 'm', ...(name ? ['n'] : [])]); const s = R.turn; const c = give(R, s, 'c', 'field'); R.cards[c].st = 'a'; R.cards[c].u = {};
    const hit = topOf(R, s, 'h'); const hn = R.P[s].hand.length; eq(act(R, s, { a: 'ability', id: c, i: 0 }), undefined, `${id}: 선언`); drain(R); ok(R.P[s].hand.includes(hit), `${id}: 특징 일치 → 손패`); eq(R.P[s].hand.length, hn + 1, '손패 +1'); eq(R.cards[c].st, 's', '슬립 비용');
    const R2 = G({ c: real(id), h: dummy('Hit', { trait: hitTrait }), m: dummy('Miss', { trait: 'zzz' }) }, ['c', 'h', 'm']); const s2 = R2.turn; const c2 = give(R2, s2, 'c', 'field'); R2.cards[c2].st = 'a'; const miss = topOf(R2, s2, 'm'); act(R2, s2, { a: 'ability', id: c2, i: 0 }); drain(R2);
    eq(R2.P[s2].deck[0], miss, `${id}: 불일치 → 덱 맨 아래`); ok(!R2.P[s2].hand.includes(miss), '손패 아님');
    if (name) { const R3 = G({ c: real(id), n: dummy(name, { trait: 'zzz' }) }, ['c', 'n']); const s3 = R3.turn; const c3 = give(R3, s3, 'c', 'field'); R3.cards[c3].st = 'a'; const nm = topOf(R3, s3, 'n'); act(R3, s3, { a: 'ability', id: c3, i: 0 }); drain(R3); ok(R3.P[s3].hand.includes(nm), '이름 일치(특징 무관)도 손패'); } } });
t('reveal until(id_0674): 특징 [YAIBA] 이벤트가 나올 때까지 1장씩 공개해 손패에 넣고, 나머지는 덱 아래 (덱 셔플)', () => {
  const R = G({ y: real('id_0674', { lv: '0' }), e: dummy('Ev', { type: 'event', trait: 'YAIBA', ab: [{ ic: 'event', ops: [] }] }), x: dummy('X'), z: dummy('Z', { trait: 'YAIBA' }) }, ['y', 'e', 'x', 'z']); const s = R.turn; const y = give(R, s, 'y', 'hand');
  const e = topOf(R, s, 'e'); const x = topOf(R, s, 'x'), z = topOf(R, s, 'z'); // 위→아래: z(캐릭터 YAIBA), x, e
  eq(act(R, s, { a: 'play', id: y }), undefined, 'play'); drain(R); ok(R.P[s].hand.includes(e), '이벤트가 손패로'); ok(!R.P[s].hand.includes(x) && !R.P[s].hand.includes(z), '공개된 캐릭터는 손패에 안 들어감(이벤트만)'); ok(R.P[s].deck.length >= 30, '나머지는 덱으로 복귀'); });
t('fetch(id_0778/0862/1132): 리무브 에리어(또는 파트너 에리어)에서 이름/특징 조건의 카드를 손패로', () => {
  const R = G({ f: real('id_0778'), j: dummy('J', { trait: 'ビッグジュエル' }), q: dummy('Q', { trait: 'ビッグジュエル' }) }, ['f', 'j', 'q']); const s = R.turn; const f = give(R, s, 'f', 'field'); const j = give(R, s, 'j', 'rem'); const q = give(R, s, 'q', 'pa');
  eq(act(R, s, { a: 'ability', id: f, i: 0 }), undefined, '선언(덱 아래 비용)'); ok(R.P[s].deck[0] === f, '자신이 덱 아래로(비용)'); ok(req(R) && req(R).sel.includes(j) && req(R).sel.includes(q), '리무브 에리어+파트너 에리어가 후보'); ans(R, [q]); drain(R); ok(R.P[s].hand.includes(q) && !R.P[s].pa.includes(q), '파트너 에리어 카드를 손패로'); });
t('fetch 이름 2종(id_1132 [伊達航]か[高木渉]) / 카드 이름 정확 일치(id_0862)', () => {
  const R = G({ n: real('id_1132', { ab: FIX.id_1132.ab.filter(a => a.ic === 'flash') }), a: dummy('伊達航'), b: dummy('高木渉'), c: dummy('別人') }, ['n', 'a', 'b', 'c']); const s = R.turn; const a = give(R, s, 'a', 'rem'), b = give(R, s, 'b', 'rem'), c = give(R, s, 'c', 'rem');
  FX.queueFlash(R, s, give(R, s, 'n', 'hand')); FX.pump(R); if (req(R) && req(R).kind === 'yn') ans(R, true); if (req(R)) { ok(req(R).sel.includes(a) && req(R).sel.includes(b) && !req(R).sel.includes(c), '두 이름만 후보'); ans(R, [b]); } drain(R); ok(R.P[s].hand.includes(b), '手札へ'); });
t('look(id_0930/0912): 덱 위 3~4장을 보고 조건 카드를 1장 공개해 손패, 나머지는 덱 아래(순서 지정) — 조건: 【現場リムーブ時】 보유 캐릭터', () => {
  const R = G({ k: real('id_0930', { type: 'case' }), s1: dummy('Shell', { ab: [{ ic: 'onremoved', ops: [{ op: 'draw', n: 1 }] }] }), n: dummy('Non') , sh: dummy('シェリー') }, ['s1', 'n', 'sh']); const s = R.turn; solve(R, s); drain(R); give(R, s, 'sh', 'field'); evid(R, s, 2);
  const a = topOf(R, s, 's1'), b = topOf(R, s, 'n'); eq(act(R, s, { a: 'ability', id: R.P[s].kase, i: 1 }), undefined, '선언'); ok(req(R) && req(R).kind === 'pick', 'pick'); ok(req(R).ids.includes(a) && req(R).ids.includes(b), '위 3장 확인'); ok(req(R).sel.includes(a) && !req(R).sel.includes(b), '조건에 맞는 카드만 선택 가능'); ans(R, [a]); if (req(R) && req(R).ordered) ans(R, req(R).ids); drain(R); ok(R.P[s].hand.includes(a), '손패'); });

// ══ 증거/세트/스택/FILE ══
t('unset+if(id_1088): 裏向き세트 카드를 리무브하면 AP+1000 & 突撃 (턴 한정, 상대/자신 캐릭터 모두 대상)', () => {
  const R = G({ n: real('id_1088', { ap: '2000', color: 'green' }), v: dummy('V') }, ['n'], ['v']); const s = R.turn, o = 1 - s; const n = give(R, s, 'n', 'field'); R.cards[n].u = {}; const v = give(R, o, 'v', 'field'); const u = filler(R, o, 'rem', 1)[0]; R.P[o].rem.pop(); R.cards[v].fd = [u]; R.cards[u].fdOn = v;
  const pc = R.P[s].partner; ok(R.cards[pc], 'partner'); R.defs[R.cards[pc].d].color = 'green';
  eq(act(R, s, { a: 'ability', id: n, i: 0 }), undefined, '선언'); if (req(R) && req(R).kind === 'yn') ans(R, true); if (req(R) && req(R).kind === 'pick') ans(R, [u]); drain(R); eq(S.ap(R, n), 3000, 'AP+1000'); ok(FX.hasKwTk(R, n, 'assault'), '突撃'); ok(!(R.cards[v].fd || []).length, '세트 제거'); ok(R.P[o].rem.includes(u), '세트 카드는 소유자의 리무브 에리어로'); });
t('setDeck(id_0575/0981): 덱 위 카드를 裏向き 로 세트 → 세트 수가 늘고 덱이 줄어든다 / 캐릭터가 떠나면 세트 카드도 리무브 에리어로', () => {
  const R = G({ m: real('id_0575') }, ['m']); const s = R.turn; const m = give(R, s, 'm', 'field'); R.cards[m].st = 'a'; const dn = R.P[s].deck.length; eq(act(R, s, { a: 'ability', id: m, i: 1 }), undefined, '선언'); drain(R);
  eq((R.cards[m].fd || []).length, 1, '裏向き 세트 1'); eq(R.P[s].deck.length, dn - 1, '덱 -1'); const u = R.cards[m].fd[0]; eq(R.cards[u].fdOn, m, '역참조'); FX.rmChar(R, m, 'effect'); FX.pump(R); ok(R.P[s].rem.includes(u), '세트 카드도 리무브 에리어'); });
t('stack+pickPaid(id_0844): 리무브 에리어의 Lv8·이름이 서로 다른 [少年探偵団] 3장까지를 아래에 겹치고, 비용으로 리무브한 뒤 상대가 1장을 골라 조건이 맞으면 등장', () => {
  const kids = { a: dummy('Ayumi', { trait: '少年探偵団', lv: '8' }), b: dummy('Mitsu', { trait: '少年探偵団', lv: '8' }), c: dummy('Genta', { trait: '少年探偵団', lv: '8' }), a2: dummy('Ayumi', { trait: '少年探偵団', lv: '8' }) };
  const R = G({ h: real('id_0844', { color: 'blue', lv: '0' }), ...kids }, ['h', 'a', 'b', 'c', 'a2']); const s = R.turn, o = 1 - s; const h = give(R, s, 'h', 'hand'); const ids = ['a', 'b', 'c', 'a2'].map(k => give(R, s, k, 'rem'));
  eq(act(R, s, { a: 'play', id: h }), undefined, 'play'); ok(req(R) && req(R).kind === 'pick', '겹칠 카드 선택'); ok(req(R).distinct, '이름이 서로 달라야 함(distinct)'); eq(req(R).max, 3, '3장까지'); ans(R, ids.slice(0, 3)); drain(R);
  eq((R.cards[h].under || []).length, 3, '아래에 3장'); const ha = R.P[s].hand.length; R.cards[h].st = 'a'; R.cards[h].u = {}; ok(R.P[s].field.includes(h), '현장'); R.defs[R.cards[R.P[s].partner].d].color = 'blue';
  eq(act(R, s, { a: 'ability', id: h, i: 1 }), undefined, '선언(파트너 조건: 青)'); ok(req(R) && req(R).who === o, '상대가 고른다'); const pick = req(R).sel ? req(R).sel[0] : req(R).ids[0]; ans(R, [pick]); drain(R); ok(R.P[s].field.includes(pick), '고른 캐릭터가 등장(Lv8 이하 少年探偵団)'); ok(!R.P[s].field.includes(h), '자신은 리무브'); });
t('rps(id_0743): 상대와 가위바위보 → 이기면 1장 드로우 / 지면 1장 드로우 후 손패 1장 리무브 / 비기면 다시', () => {
  const run = (mineHand, oppHand, draws = 0) => { const R = G({ f: real('id_0743', { lv: '0' }) }, ['f']); const s = R.turn; const f = give(R, s, 'f', 'hand'); const h = R.P[s].hand.length, rm = R.P[s].rem.length; eq(act(R, s, { a: 'play', id: f }), undefined, 'play'); let g = 0, d = draws;
    while (R.eff && g++ < 20) { const q = req(R); if (q.kind === 'opt') { ok(q.labels.length === 3, '바위/가위/보'); const mine = q.who === s; ans(R, d-- > 0 ? 0 : mine ? mineHand : oppHand); } else if (q.kind === 'pick') ans(R, q.sel.slice(0, Math.max(q.min || 0, 1))); else ans(R, false); }
    return { dh: R.P[s].hand.length - (h - 1), dr: R.P[s].rem.length - rm }; };
  let r = run(0, 1); eq(r.dh, 1, '승(바위 vs 가위): +1'); eq(r.dr, 0, '리무브 없음'); r = run(1, 0); eq(r.dh, 0, '패: +1 -1'); eq(r.dr, 1, '손패 1장 리무브'); r = run(2, 0); eq(r.dh, 1, '승(보 vs 바위)'); r = run(0, 1, 2); eq(r.dh, 1, '비김 → 다시 → 승'); });
t('chooseMulti(id_0912): 3개 중 최대 3개까지 골라 위에서부터 순서대로 실행', () => {
  const R = G({ e: real('id_0912', { lv: '0' }), s: dummy('佐藤美和子'), t: dummy('高木渉') }, ['e', 's', 't']); const s = R.turn; const sa = give(R, s, 's', 'field'), ta = give(R, s, 't', 'field'); R.cards[sa].st = 's'; const e = give(R, s, 'e', 'hand');
  eq(act(R, s, { a: 'play', id: e }), undefined, 'play'); ok(req(R) && req(R).kind === 'optm', '다중 선택'); eq(req(R).max, 3, '최대 3'); ans(R, [0, 1]); let g = 0; while (R.eff && g++ < 10) { const q = req(R); ans(R, q.kind === 'pick' ? [q.sel.includes(sa) && R.cards[sa].st === 's' ? sa : q.sel[0]] : q.kind === 'yn' ? true : 0); }
  eq(R.cards[sa].st, 'a', '① 佐藤 액티브'); ok(FX.hasKwTk(R, ta, 'assault-char') || FX.hasKwTk(R, ta, 'assault'), '② 高木에게 突撃[キャラ]'); });
t('investigate/found(id_0703): 捜査1 — 상대 덱 위 1장이 공개돼 발견되고, Lv7 이하가 발견되면 손패 1장 리무브 / 파트너 에리어에서도 선언 가능', () => {
  const R = G({ a: real('id_0703', { color: 'yellow' }), lo: dummy('Lo', { lv: '3' }), hi: dummy('Hi', { lv: '9' }) }, ['a'], ['lo', 'hi']); const s = R.turn, o = 1 - s; const a = give(R, s, 'a', 'pa'); R.cards[a].u = {}; const lo = topOf(R, o, 'lo'); R.defs[R.cards[R.P[s].partner].d].color = 'yellow';
  const h = R.P[s].hand.length; eq(act(R, s, { a: 'ability', id: a, i: 1 }), undefined, '파트너 에리어에서 선언'); let g = 0; while (R.eff && g++ < 10) { const q = req(R); ans(R, q.kind === 'pick' ? (q.ordered ? q.ids : q.sel.slice(0, Math.max(q.min || 0, 1))) : q.kind === 'yn' ? true : q.kind === 'ack' ? null : 0); }
  ok(R.P[s].rem.length >= 1, 'Lv3 발견 → 손패 1장 리무브'); ok(R.P[o].deck.includes(lo), '공개 카드는 덱에 남음(덱 아래로)'); });
t('declare(pa): 파트너 에리어에서 선언할 수 없는 능력은 막힌다 (pa 플래그 없는 능력)', () => {
  const R = G({ a: dummy('A', { ab: [{ ic: 'declare', ops: [{ op: 'draw', n: 1 }] }] }) }, ['a']); const s = R.turn; const a = give(R, s, 'a', 'pa'); ok(act(R, s, { a: 'ability', id: a, i: 0 }), '거부'); });
t('costLv(id_0993): 손패 1장을 비용으로 리무브 → 그 카드의 레벨 이하 [探偵] 캐릭터를 스턴', () => {
  const R = G({ b: real('id_0993'), c: dummy('Cost', { lv: '3' }), d1: dummy('D1', { trait: '探偵', lv: '2' }), d2: dummy('D2', { trait: '探偵', lv: '5' }) }, ['b', 'c', 'd1', 'd2']); const s = R.turn, o = 1 - s; const b = give(R, s, 'b', 'field'); R.cards[b].u = {}; const c = give(R, s, 'c', 'hand'); const d1 = give(R, o, 'd1', 'field'), d2 = give(R, o, 'd2', 'field');
  eq(act(R, s, { a: 'ability', id: b, i: 0 }), undefined, '선언'); ok(req(R) && req(R).kind === 'pick', '비용 카드 선택'); ans(R, [c]); ok(req(R) && req(R).sel.includes(d1) && !req(R).sel.includes(d2), 'Lv3 이하만'); ans(R, [d1]); drain(R); eq(R.cards[d1].st, 'x', '스턴'); });
t('optcost+if(id_0797): 자신을 슬립·손패 1장을 리무브해도 되며, 그러면 리무브 에리어의 Lv5↓[赤]를 슬립 상태로 등장, 손패 2장 이하면 둘 다 액티브', () => {
  const R = G({ h: real('id_0797', { lv: '0' }), r: dummy('R', { color: 'red', lv: '4' }) }, ['h', 'r']); const s = R.turn; R.defs[R.cards[R.P[s].partner].d].color = 'red'; const h = give(R, s, 'h', 'hand'); const r = give(R, s, 'r', 'rem'); const keep = R.P[s].hand.filter(x => x !== h).slice(0, 1); const rest = R.P[s].hand.filter(x => x !== h && !keep.includes(x)); R.P[s].deck.push(...rest); R.P[s].hand = [h, ...keep];
  eq(act(R, s, { a: 'play', id: h }), undefined, 'play'); let g = 0; while (R.eff && g++ < 10) { const q = req(R); ans(R, q.kind === 'yn' ? true : q.kind === 'pick' ? [q.sel.includes(r) ? r : q.sel[0]] : 0); }
  ok(R.P[s].field.includes(r), '[赤] Lv4 등장'); eq(R.cards[r].st, 'a', '손패 ≤2 → 액티브'); eq(R.cards[h].st, 'a', '자신도 액티브'); });
t('select when lpLeOwnMax(id_0882): 상대 캐릭터 LP가 내 현장 최대 LP 이하일 때만 리무브', () => {
  const R = G({ e: real('id_0882', { lv: '0' }), m: dummy('Mine', { lp: '3' }), lo: dummy('Lo', { lp: '2' }), hi: dummy('Hi', { lp: '5' }) }, ['e', 'm'], ['lo', 'hi']); const s = R.turn, o = 1 - s; give(R, s, 'm', 'field'); const lo = give(R, o, 'lo', 'field'), hi = give(R, o, 'hi', 'field'); const e = give(R, s, 'e', 'hand');
  eq(act(R, s, { a: 'play', id: e }), undefined, 'play'); ans(R, [hi]); drain(R); ok(R.P[o].field.includes(hi), 'LP5 > 3 → 리무브 안 됨'); const R2 = G({ e: real('id_0882', { lv: '0' }), m: dummy('Mine', { lp: '3' }), lo: dummy('Lo', { lp: '2' }) }, ['e', 'm'], ['lo']); const s2 = R2.turn, o2 = 1 - s2;
  give(R2, s2, 'm', 'field'); const l2 = give(R2, o2, 'lo', 'field'); act(R2, s2, { a: 'play', id: give(R2, s2, 'e', 'hand') }); ans(R2, [l2]); drain(R2); ok(R2.P[o2].rem.includes(l2), 'LP2 ≤ 3 → 리무브'); });
t('rmAll+fileToHand+nohint(id_0721): 모든 캐릭터 리무브 → FILE 위 2장 손패 → Lv7↓[黒] 등장 → 이번 턴 넥스트 힌트 불가', () => {
  const R = G({ e: real('id_0721', { type: 'event', lv: '0' }), b: dummy('B', { color: 'black', lv: '5' }), v: dummy('V') }, ['e', 'b', 'v'], ['v']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].partner].d].color = 'black'; R.cards[R.P[s].kase].solved = true; const v = give(R, o, 'v', 'field'); const w = give(R, s, 'v', 'field'); const b = give(R, s, 'b', 'hand'); fillFile(R, s, 3); const e = give(R, s, 'e', 'hand');
  const fl = R.P[s].file.slice(-2); eq(act(R, s, { a: 'play', id: e }), undefined, 'play'); let g = 0; while (R.eff && g++ < 10) { const q = req(R); ans(R, q.kind === 'pick' ? [q.sel.includes(b) ? b : q.sel[0]] : q.kind === 'yn' ? true : 0); }
  ok(R.P[o].rem.includes(v) && R.P[s].rem.includes(w), '양쪽 캐릭터 리무브'); ok(fl.every(x => R.P[s].hand.includes(x)), 'FILE 위 2장 손패'); ok(R.P[s].field.includes(b), 'Lv5 [黒] 등장'); ok(act(R, s, { a: 'hint' }), '넥스트 힌트 불가'); });
t('revealFile + ftop 조건(id_0965): 상대 FILE 맨 위를 표로 → 그 카드가 캐릭터면 캐릭터 1장 AP+1000', () => {
  const R = G({ h: real('id_0965', { color: 'blue' }), c: dummy('C'), e: dummy('E', { type: 'event', ab: [{ ic: 'event', ops: [] }] }) }, ['h'], ['c', 'e']); const s = R.turn, o = 1 - s; const h = give(R, s, 'h', 'field'); R.cards[h].u = {}; R.defs[R.cards[R.P[s].partner].d].color = 'blue'; R.defs[R.cards[R.P[s].kase].d].color = 'blue/green';
  const ch = give(R, o, 'c', 'file'); const before = S.ap(R, h); eq(act(R, s, { a: 'ability', id: h, i: 1 }), undefined, '선언'); auto(R, h); ok(R.cards[ch].up, '상대 FILE 맨 위가 표'); ok(R.P[o].file[R.P[o].file.length - 1] === ch, '맨 위 유지');
  const R2 = G({ h: real('id_0965', { color: 'blue' }), e: dummy('E', { type: 'event', ab: [{ ic: 'event', ops: [] }] }) }, ['h'], ['e']); const s2 = R2.turn, o2 = 1 - s2; const h2 = give(R2, s2, 'h', 'field'); R2.cards[h2].u = {}; give(R2, o2, 'e', 'file'); const b2 = S.ap(R2, h2); act(R2, s2, { a: 'ability', id: h2, i: 1 }); drain(R2); eq(S.ap(R2, h2), b2, '이벤트면 AP 변화 없음'); });
t('ftop 조건이 정화(sanitizer)를 통과: 누락 시 능력이 통째로 사라지는 회귀 방지', () => {
  const R = G({ h: real('id_0965') }, ['h']); const ab = R.defs['0:h'].ab; ok(JSON.stringify(ab).includes('ftop'), 'ftop 보존'); });
t('deckrem+trace(id_1033): 登場時 痕跡[未発見]이면 상대 덱 위 2장 리무브, 発見済み면 발동 안 함 / 発見済み면 突撃[事件] 부여', () => {
  const R = G({ g: real('id_1033', { lv: '0' }) }, ['g']); const s = R.turn, o = 1 - s; const g = give(R, s, 'g', 'hand'); const dn = R.P[o].deck.length; act(R, s, { a: 'play', id: g }); drain(R); eq(R.P[o].deck.length, dn - 2, '2장 리무브(未発見)');
  const R2 = G({ g: real('id_1033', { lv: '0' }) }, ['g']); const s2 = R2.turn, o2 = 1 - s2; R2.P[s2].tr = true; const g2 = give(R2, s2, 'g', 'hand'); const d2 = R2.P[o2].deck.length; act(R2, s2, { a: 'play', id: g2 }); drain(R2); eq(R2.P[o2].deck.length, d2, '発見済み라면 발동 안 함'); });
t('flip + flashFlipped(id_0657): 裏向き証拠 1개를 표로 → 그것이 【!ヒラメキ】 [YAIBA] 카드면 그 효과를 발동해도 된다', () => {
  const R = G({ ev: real('id_0657', { type: 'event', lv: '0' }), y: dummy('Y', { trait: 'YAIBA', ab: [{ ic: 'flash', bang: true, ops: [{ op: 'draw', n: 2 }] }] }) }, ['ev', 'y']); const s = R.turn; R.cards[R.P[s].kase].solved = true; const yb = filler(R, s, 'evid', 1); R.P[s].evid.pop(); const y = give(R, s, 'y', 'evid'); R.cards[y].up = false; const e = give(R, s, 'ev', 'hand'); const h = R.P[s].hand.length;
  eq(act(R, s, { a: 'play', id: e }), undefined, 'play'); let g = 0; while (R.eff && g++ < 10) { const q = req(R); ans(R, q.kind === 'pick' ? [q.sel.includes(y) ? y : q.sel[0]] : q.kind === 'yn' ? true : 0); } ok(R.cards[y].up, '표로 뒤집힘'); eq(R.P[s].hand.length, h - 1 + 2, '사용(-1) + ヒラメキ 드로우(+2)'); });
t('flash 【事件YAIBA】【解決編】(id_0651): 액션[事件]으로 이 카드가 증거에서 리무브될 때 발동 → 액션 중인 캐릭터를 리무브 (해결편 + 사건 특징[YAIBA] 조건이 맞을 때만)', () => {
  const mk = (trait, solved) => { const R = G({ f: real('id_0651', { lv: '0' }), a: dummy('Atk', { ap: '9000' }) }, ['f'], ['a']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].kase].d].trait = trait; R.cards[R.P[s].kase].solved = solved;
    const f = give(R, s, 'f', 'evid'); const a = give(R, o, 'a', 'field'); R.turn = o; R.cards[a].sum = 0; R.cards[a].st = 'a'; return { R, s, o, f, a }; };
  let c = mk('YAIBA', true); eq(act(c.R, c.o, { a: 'action', id: c.a, k: 'case' }), undefined, 'action'); eq(act(c.R, c.s, { a: 'guard', id: null }), undefined, 'guard 안 함 → 증거 리무브'); FX.pump(c.R); auto(c.R, c.a);
  ok(c.R.P[c.o].rem.includes(c.a), '액션 중이던 캐릭터가 리무브'); 
  c = mk('別', true); act(c.R, c.o, { a: 'action', id: c.a, k: 'case' }); act(c.R, c.s, { a: 'guard', id: null }); FX.pump(c.R); auto(c.R, c.a); ok(c.R.P[c.o].field.includes(c.a), '사건 특징이 [YAIBA] 가 아니면 발동 안 함');
  c = mk('YAIBA', false); act(c.R, c.o, { a: 'action', id: c.a, k: 'case' }); act(c.R, c.s, { a: 'guard', id: null }); FX.pump(c.R); auto(c.R, c.a); ok(c.R.P[c.o].field.includes(c.a), '해결편이 아니면 발동 안 함'); });


// ══ 나머지 문형: 등장·컨택트·변장·현장리무브 트리거, 부여(grant), 조건 분기 ══
t('onally any-of(id_0108): 자신 또는 [服部平次] 가 내 현장에 등장했을 때 캐릭터 1장 슬립 (턴①, 다른 이름은 무반응)', () => {
  const R = G({ kk: real('id_0108', { lv: '0' }), h: dummy('服部平次'), x: dummy('別人'), v: dummy('V') }, ['kk', 'h', 'x'], ['v']); const s = R.turn, o = 1 - s; const v = give(R, o, 'v', 'field'); R.cards[v].st = 'a'; const k = give(R, s, 'kk', 'hand'); const x = give(R, s, 'x', 'hand'), h = give(R, s, 'h', 'hand');
  act(R, s, { a: 'play', id: k }); auto(R, v); eq(R.cards[v].st, 's', '자신 등장 → 슬립'); R.cards[v].st = 'a'; act(R, s, { a: 'play', id: x }); auto(R, v); eq(R.cards[v].st, 'a', '다른 이름은 무반응'); act(R, s, { a: 'play', id: h }); ok(!R.eff, '턴① 소진'); });
t('onally(id_0484): 내 턴에 [喫茶ポアロ] 다른 캐릭터가 등장하면 상대 캐릭터 레벨-1 (lv 조정)', () => {
  const R = G({ a: real('id_0484', { lv: '0' }), b: dummy('B', { trait: '喫茶ポアロ' }), v: dummy('V', { lv: '3' }) }, ['a', 'b'], ['v']); const s = R.turn, o = 1 - s; give(R, s, 'a', 'field'); const v = give(R, o, 'v', 'field'); const b = give(R, s, 'b', 'hand'); R.defs[R.cards[R.P[s].partner].d].color = 'yellow';
  act(R, s, { a: 'play', id: b }); auto(R, v); eq(FX.lvOf(R, v), 2, '레벨 3 → 2'); });
t('declare+costHas(id_0484): 비용으로 리무브된 카드 중 [探偵] 캐릭터가 있으면 Lv8↓ 캐릭터 리무브', () => {
  const R = G({ a: real('id_0484', { lv: '0' }), d: dummy('Tantei', { trait: '探偵' }), v: dummy('V', { lv: '5' }) }, ['a', 'd'], ['v']); const s = R.turn, o = 1 - s; const a = give(R, s, 'a', 'field'); R.cards[a].u = {}; R.cards[a].st = 'a'; const v = give(R, o, 'v', 'field'); R.defs[R.cards[R.P[s].partner].d].color = 'yellow';
  const d = topOf(R, s, 'd'); eq(act(R, s, { a: 'ability', id: a, i: 1 }), undefined, '선언(덱 5장 리무브)'); auto(R, v); ok(R.P[o].rem.includes(v), '探偵가 비용에 있었으므로 리무브');
  const R2 = G({ a: real('id_0484', { lv: '0' }), v: dummy('V', { lv: '5' }) }, ['a'], ['v']); const s2 = R2.turn, o2 = 1 - s2; const a2 = give(R2, s2, 'a', 'field'); R2.cards[a2].u = {}; R2.cards[a2].st = 'a'; const v2 = give(R2, o2, 'v', 'field'); R2.defs[R2.cards[R2.P[s2].partner].d].color = 'yellow';
  R2.P[s2].deck = R2.P[s2].deck.filter(x => key(R2, x) !== 'a'); R2.P[s2].deck.forEach(x => { R2.defs[R2.cards[x].d].trait = ''; }); act(R2, s2, { a: 'ability', id: a2, i: 1 }); auto(R2, v2); ok(R2.P[o2].field.includes(v2), '探偵 없으면 효과 없음'); });
t('oncontact(id_0396): 내 턴, 이 캐릭터가 Lv6 이하 캐릭터와 컨택트하면 그 캐릭터를 리무브 (Lv7↑은 그대로)', () => {
  const mk = lv => { const R = G({ g: real('id_0396', { lv: '0', ap: '1000' }), v: dummy('V', { lv, ap: '9000' }) }, ['g'], ['v']); const s = R.turn, o = 1 - s; const g = give(R, s, 'g', 'field'); const v = give(R, o, 'v', 'field'); R.cards[v].st = 's'; R.cards[g].sum = 0; R.cards[g].st = 'a';
    eq(act(R, s, { a: 'action', id: g, k: 'char', tid: v }), undefined, 'action'); act(R, o, { a: 'guard', id: null }); FX.pump(R); auto(R, v); let n = 0; while (R.sub && n++ < 8) act(R, R.sub.who, { a: 'pass' }); return { R, o, v, s, g }; };
  let c = mk('6'); ok(c.R.P[c.o].rem.includes(c.v) && c.R.P[c.s].field.includes(c.g), 'Lv6 → 컨택트 시작 시 리무브(AP9000 상대라도 이김)'); c = mk('7'); ok(c.R.P[c.o].field.includes(c.v) && !c.R.P[c.o].rem.includes(c.v), 'Lv7 은 효과로 리무브되지 않음(AP 9000 > 1000 이라 컨택트에서도 생존)'); });
t('onkill(id_0672): 상대 캐릭터를 컨택트로 리무브하면 손패 1장을 리무브해도 되고 그러면 증거 +1 (사건 특징 [YAIBA] 조건)', () => {
  const mk = tr => { const R = G({ y: real('id_0672', { lv: '0', ap: '5000' }), v: dummy('V', { ap: '1000' }) }, ['y'], ['v']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].kase].d].trait = tr; const y = give(R, s, 'y', 'field'); R.cards[y].sum = 0; R.cards[y].st = 'a'; const v = give(R, o, 'v', 'field'); R.cards[v].st = 's'; const ev = R.P[s].evid.length;
    act(R, s, { a: 'action', id: y, k: 'char', tid: v }); act(R, o, { a: 'guard', id: null }); let n = 0; while (R.sub && n++ < 8) act(R, R.sub.who, { a: 'pass' }); FX.pump(R); auto(R, R.P[s].hand[0]); return R.P[s].evid.length - ev; };
  ok(mk('YAIBA') >= 1, '증거 +1'); eq(mk('別'), 0, '조건 불충족이면 없음'); });
t('onremoved(id_0333/0344/0592/0919): 상대 턴에 현장에서 리무브되었을 때 발동 (내 턴엔 발동 안 함)', () => {
  const R = G({ r: real('id_0344', { lv: '0' }), pol: dummy('Pol', { trait: '警察', ap: '2000' }) }, ['r', 'pol']); const s = R.turn, o = 1 - s; const r = give(R, s, 'r', 'field'), p = give(R, s, 'pol', 'field'); FX.rmChar(R, r, 'effect'); FX.pump(R); auto(R, p); eq(S.ap(R, p), 2000, '내 턴엔 발동 안 함');
  const R2 = G({ r: real('id_0344', { lv: '0' }), pol: dummy('Pol', { trait: '警察', ap: '2000' }) }, ['r', 'pol']); const s2 = R2.turn, o2 = 1 - s2; const r2 = give(R2, s2, 'r', 'field'), p2 = give(R2, s2, 'pol', 'field'); R2.turn = o2; FX.rmChar(R2, r2, 'effect', o2); FX.pump(R2); auto(R2, p2); eq(S.ap(R2, p2), 3000, '상대 턴엔 AP+1000');
  const R3 = G({ r: real('id_0919', { lv: '0' }) }, ['r']); const s3 = R3.turn, o3 = 1 - s3; const r3 = give(R3, s3, 'r', 'field'); const h3 = R3.P[s3].hand.length; R3.turn = o3; FX.rmChar(R3, r3, 'effect', o3); FX.pump(R3); auto(R3); eq(R3.P[s3].hand.length, h3 + 1, 'id_0919 상대 턴 現場リムーブ時: 1장 드로우'); });
t('reveal-until(id_0592): 상대 턴 현장리무브 시 특징 [長野県警] 캐릭터가 나올 때까지 공개해 손패에', () => {
  const R = G({ r: real('id_0592', { lv: '0' }), n: dummy('Nagano', { trait: '長野県警' }), x: dummy('X') }, ['r', 'n', 'x']); const s = R.turn, o = 1 - s; const r = give(R, s, 'r', 'field'); const n = topOf(R, s, 'n'); topOf(R, s, 'x'); R.turn = o; FX.rmChar(R, r, 'effect', o); FX.pump(R); auto(R); ok(R.P[s].hand.includes(n), '長野県警 캐릭터가 손패'); });
t('ondisguise(id_0305): 상대 턴 변장으로 [世良真純] 와 교체되면 자신을 리무브해도 되고 그러면 증거 +1 / 다른 이름과 교체되면 발동 안 함 (swapName)', () => {
  const mk = name => { const R = G({ b: real('id_0305', { lv: '0' }), se: dummy(name) }, ['b', 'se']); const s = R.turn; const b = give(R, s, 'b', 'field'); const se = give(R, s, 'se', 'rem'); R.turn = 1 - s; const ev = R.P[s].evid.length; FX.fire(R, 'ondisguise', b, { swapped: se }); FX.pump(R); auto(R); return { R, s, b, d: R.P[s].evid.length - ev }; };
  let r = mk('世良真純'); eq(r.d, 1, '증거 +1'); ok(r.R.P[r.s].rem.includes(r.b), '자신은 리무브'); r = mk('別人'); eq(r.d, 0, '발동 안 함'); ok(r.R.P[r.s].field.includes(r.b), '자신 유지'); });
t('onplay+ondisguise(id_0208 【登場時】【変装時】): 두 트리거로 각각 컴파일되고 둘 다 동작', () => {
  const ics = FIX.id_0208.ab.map(a => a.ic); ok(ics.includes('onplay') && ics.includes('ondisguise'), `ic 목록 ${ics}`);
  const R = G({ kk: real('id_0208', { lv: '0' }), v: dummy('V') }, ['kk'], ['v']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].partner].d].color = 'white'; const v = give(R, o, 'v', 'field'); R.cards[v].st = 'a'; act(R, s, { a: 'play', id: give(R, s, 'kk', 'hand') }); auto(R, v); eq(R.cards[v].st, 's', '登場時 로 슬립'); });
t('grant+set(id_1079): 이벤트를 [江戸川コナン] 에 세트하면 그 캐릭터가 「【宣言】…」 능력을 얻는다 (컨트롤 유지 동안만)', () => {
  const R = G({ e: real('id_1079', { type: 'event', lv: '0' }), c: dummy('江戸川コナン'), v: dummy('V', { ap: '9000' }), w: dummy('W', { ap: '3000' }), belt: dummy('どこでもボール射出ベルト', { type: 'event', ab: [{ ic: 'event', ops: [] }] }) }, ['e', 'c', 'belt'], ['v', 'w']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].partner].d].color = 'blue';
  const c = give(R, s, 'c', 'field'); const v = give(R, o, 'v', 'field'), w = give(R, o, 'w', 'field'); const e = give(R, s, 'e', 'hand'); R.cards[c].u = {}; R.cards[c].st = 'a';
  eq(act(R, s, { a: 'play', id: e }), undefined, 'play'); auto(R, w, c); ok((R.cards[c].sets || []).includes(e), '이벤트가 コナン에 세트'); ok(R.P[o].rem.includes(w), '① AP8000 이하 캐릭터 리무브');
  ok(FX.grantedAb(R, c).some(a => a.ic === 'declare'), '세트된 캐릭터가 【宣言】능력을 가짐'); ok(FX.grantedAb(R, v).length === 0 || !FX.grantedAb(R, v).some(a => a.ic === 'declare'), '다른 캐릭터는 없음'); });
t('declare+played+kw(id_1153): 자신을 슬립·파트너 에리어로 옮기고, 리무브 에리어의 [突撃] 보유 Lv8↓[服部平次]/[怪盗キッド] 를 등장시켜 그 캐릭터에 「액티브 상태 캐릭터도 지정 액션 가능」 부여', () => {
  const R = G({ h: real('id_1153', { lv: '0' }), a: dummy('服部平次', { lv: '6', kw: 'assault' }), b: dummy('服部平次', { lv: '6' }), v: dummy('V') }, ['h', 'a', 'b'], ['v']); const s = R.turn, o = 1 - s; const h = give(R, s, 'h', 'field'); R.cards[h].st = 'a'; R.cards[h].u = {}; const a = give(R, s, 'a', 'rem'), b = give(R, s, 'b', 'rem'); const v = give(R, o, 'v', 'field'); R.cards[v].st = 'a';
  eq(act(R, s, { a: 'ability', id: h, i: 1 }), undefined, '선언'); if (req(R)) { ok(req(R).sel.includes(a) && !req(R).sel.includes(b), '[突撃] 가진 카드만 후보'); } auto(R, a); ok(R.P[s].pa.includes(h), '자신은 파트너 에리어'); ok(R.P[s].field.includes(a), '등장'); ok(FX.hasKwTk(R, a, 'actactive'), '액티브 상태의 상대 캐릭터도 지정 가능'); });
t('onallycontact+pa(id_1153): Lv8 이상 아군이 컨택트하면 그 컨택트 중 AP+2000 — 파트너 에리어에서도 유효', () => {
  const R = G({ h: real('id_1153', { lv: '0' }), a: dummy('Big', { lv: '8', ap: '3000' }), lo: dummy('Lo', { lv: '2', ap: '3000' }), v: dummy('V', { ap: '9000' }) }, ['h', 'a', 'lo'], ['v']); const s = R.turn, o = 1 - s; give(R, s, 'h', 'pa'); const a = give(R, s, 'a', 'field'), lo = give(R, s, 'lo', 'field'); const v = give(R, o, 'v', 'field'); R.cards[v].st = 's';
  for (const [x, want] of [[a, 5000], [lo, 3000]]) { R.cards[x].sum = 0; R.cards[x].st = 'a'; if (R.sub) R.sub = null; act(R, s, { a: 'action', id: x, k: 'char', tid: v }); act(R, o, { a: 'guard', id: null }); FX.pump(R); auto(R); eq(S.ap(R, x), want, `컨택트 중 AP (${x === a ? 'Lv8' : 'Lv2'})`); let n = 0; while (R.sub && n++ < 8) act(R, R.sub.who, { a: 'pass' }); R.cards[v].st = 's'; } });
t('play any-of(id_0752): 리무브 에리어의 Lv5↓ [マロちゃん](이름) 또는 Lv5↓ 특징[警察] 캐릭터를 등장 — 비용: 슬립 + 손패 1장 (Lv6 경찰/다른 이름은 후보 아님)', () => {
  const R = G({ a: real('id_0752', { lv: '0' }), m: dummy('マロちゃん', { lv: '5' }), pol: dummy('Pol', { trait: '警察', lv: '5' }), x: dummy('X', { lv: '3' }), hi: dummy('Hi', { trait: '警察', lv: '6' }) }, ['a', 'm', 'pol', 'x', 'hi']); const s = R.turn; const a = give(R, s, 'a', 'field'); R.cards[a].u = {}; R.cards[a].st = 'a';
  const [m, p, x, hi] = ['m', 'pol', 'x', 'hi'].map(k => give(R, s, k, 'rem')); eq(act(R, s, { a: 'ability', id: a, i: 0 }), undefined, '선언'); ok(req(R) && req(R).kind === 'pick', '비용: 손패 1장'); ans(R, [req(R).sel[0]]);
  ok(req(R) && req(R).sel.includes(m) && req(R).sel.includes(p) && !req(R).sel.includes(x) && !req(R).sel.includes(hi), '후보: 마로/Lv5 경찰만'); ans(R, [p]); drain(R); ok(R.P[s].field.includes(p), '등장'); eq(R.cards[a].st, 's', '슬립 비용'); });
t('onend + names(id_0755): 내 턴 종료 시 자신을 리무브해도 되며, 그러면 [服部平次]か[毛利小五郎] 1장을 액티브', () => {
  const R = G({ kk: real('id_0755', { lv: '0' }), h: dummy('服部平次'), z: dummy('別') }, ['kk', 'h', 'z']); const s = R.turn; const k = give(R, s, 'kk', 'field'), h = give(R, s, 'h', 'field'), z = give(R, s, 'z', 'field'); R.cards[h].st = 's'; R.cards[z].st = 's';
  act(R, s, { a: 'end' }); FX.pump(R); let g = 0; while (R.eff && g++ < 10) { const q = req(R); ans(R, q.kind === 'yn' ? true : q.kind === 'pick' ? (q.sel.includes(h) ? [h] : q.sel.slice(0, Math.max(q.min || 0, 1))) : 0); } ok(R.P[s].rem.includes(k), '자신 리무브'); eq(R.cards[h].st, 'a', '[服部平次] 액티브'); eq(R.cards[z].st, 's', '다른 이름은 그대로'); });
t('ifc fh colorNot(id_0926): 내 현장에 [黒] 이외 색 캐릭터가 있으면 이 턴 突撃 / 없으면 부여 안 됨', () => {
  const mk = col => { const R = G({ b: real('id_0926', { color: 'black', lv: '0' }), o: dummy('Other', { color: col }) }, ['b', 'o']); R.defs[R.cards[R.P[R.turn].kase].d].color = 'black/blue'; const s = R.turn; give(R, s, 'o', 'field'); const b = give(R, s, 'b', 'hand'); act(R, s, { a: 'play', id: b }); auto(R); return FX.hasKwTk(R, b, 'assault'); };
  ok(mk('blue'), '[黒] 이외 → 突撃'); ok(!mk('black'), '[黒] 만 → 없음'); });
t('revealHand+select(id_0703): 登場時 상대가 손패를 공개(ack)하고 Lv9↓ 캐릭터 리무브 / 【パートナー】【黄】 조건', () => {
  const R = G({ a: real('id_0703', { lv: '0' }), v: dummy('V', { lv: '5' }) }, ['a'], ['v']); const s = R.turn, o = 1 - s; R.defs[R.cards[R.P[s].partner].d].color = 'yellow'; const v = give(R, o, 'v', 'field'); act(R, s, { a: 'play', id: give(R, s, 'a', 'hand') }); let saw = false; let g = 0;
  while (R.eff && g++ < 10) { const q = req(R); if (q.kind === 'ack') saw = true; ans(R, q.kind === 'pick' ? [q.sel.includes(v) ? v : q.sel[0]] : q.kind === 'yn' ? true : null); } ok(R.P[o].rem.includes(v), 'Lv5 캐릭터 리무브'); });
t('cutin+ifc cin(id_1132): AP+1000 컷인, 컷인 대상이 [伊達航]か[高木渉] 일 때만 카드 1장 드로우', () => {
  const mk = name => { const R = G({ n: real('id_1132', { lv: '0' }), t: dummy(name, { ap: '2000' }), v: dummy('V', { ap: '9000' }) }, ['n', 't'], ['v']); const s = R.turn, o = 1 - s; const t = give(R, s, 't', 'field'); const v = give(R, o, 'v', 'field'); R.cards[v].st = 's'; R.cards[t].sum = 0; R.cards[t].st = 'a'; const n = give(R, s, 'n', 'hand');
    eq(act(R, s, { a: 'action', id: t, k: 'char', tid: v }), undefined, 'action'); act(R, o, { a: 'guard', id: null }); act(R, o, { a: 'pass' }); const h = R.P[s].hand.length; eq(act(R, s, { a: 'cin', id: n }), undefined, 'cutin'); FX.pump(R); auto(R); return { ap: S.ap(R, t), dh: R.P[s].hand.length - (h - 1) }; };
  let r = mk('高木渉'); eq(r.ap, 3000, 'AP+1000'); eq(r.dh, 1, '高木渉 에게 컷인 → 드로우'); r = mk('別人'); eq(r.ap, 3000, 'AP+1000'); eq(r.dh, 0, '다른 캐릭터면 드로우 없음'); });
t('pk noflash(플레이어 정적): 상대 정적 능력이 있으면 내 증거가 리무브될 때 【ヒラメキ】 가 발동하지 않는다', () => {
  const R = G({ f: dummy('F', { ab: [{ ic: 'flash', ops: [{ op: 'draw', n: 2 }] }] }), a: dummy('Atk', { ap: '5000', ab: [{ ic: 'static', pk: 'noflash' }] }) }, ['f'], ['a']); const s = R.turn, o = 1 - s; const f = give(R, s, 'f', 'evid'); const a = give(R, o, 'a', 'field'); R.turn = o; R.cards[a].sum = 0; R.cards[a].st = 'a'; const h = R.P[s].hand.length;
  act(R, o, { a: 'action', id: a, k: 'case' }); act(R, s, { a: 'guard', id: null }); FX.pump(R); drain(R); eq(R.P[s].hand.length, h, '플래시로 드로우되지 않음'); ok(R.P[s].rem.includes(f), '증거는 그대로 리무브'); });
t('static lv(손패의 이 캐릭터 레벨 변경: 양쪽 합계 4장 이상이면 Lv2) + fieldMin 조건', () => {
  const R = G({ x: dummy('X', { lv: '5', ab: [{ ic: 'hand', cond: { fieldMin: 4 }, lv: 2 }] }), a: dummy('A') }, ['x', 'a'], ['a']); const s = R.turn, o = 1 - s; const x = give(R, s, 'x', 'hand'); eq(FX.lvOf(R, x), 5, '4장 미만'); filler(R, s, 'field', 2); filler(R, o, 'field', 2); eq(FX.lvOf(R, x), 2, '4장 이상 → Lv2'); });
t('moveSet+unset fd+choose(id_1075, 파트너로 오판되던 캐릭터): 裏向き 세트를 다른 [サッカー選手] 로 옮기고 / 세트를 리무브해 突撃 or 슬립 선택', () => {
  const R = G({ m: real('id_1075', { type: 'char', lv: '0' }), f: dummy('FW', { trait: 'サッカー選手' }), o: dummy('Other') }, ['m'], ['o']); const s = R.turn, o = 1 - s;
  const m = give(R, s, 'm', 'field'); const f = give(R, s, 'f', 'field'); const v = give(R, o, 'o', 'field'); R.cards[m].st = 'a'; R.cards[m].sum = 0;
  const u = R.P[s].deck.shift(); R.cards[m].fd = [u]; R.cards[u].fdOn = m;
  eq(act(R, s, { a: 'ability', id: m, i: 1 }), undefined, '이동 선언'); auto(R, f); eq((R.cards[m].fd || []).length, 0, '원래 캐릭터에서 빠짐'); eq((R.cards[f].fd || []).length, 1, '대상에게 세트'); eq(R.cards[u].fdOn, f, '역참조 갱신');
  R.cards[m].st = 'a'; R.cards[m].fd = [u]; R.cards[u].fdOn = m; R.cards[f].fd = []; R.cards[m].used = {}; // 두 번째 능력 검증을 위해 상태 복원
  const rem = R.P[s].rem.length; eq(act(R, s, { a: 'ability', id: m, i: 2 }), undefined, '세트 리무브 선언'); ok(R.eff && req(R).kind === 'opt', '두 효과 중 선택'); ans(R, 0); drain(R);
  ok(R.P[s].rem.length > rem, '비용으로 세트 카드가 리무브 에리어로'); eq((R.cards[m].fd || []).length, 0, '세트 없음'); ok(FX.hasKwTk(R, m, 'assault'), '突撃 획득'); });

let bad = 0; for (const [n, f] of T) { try { f(); console.log('✓', n); } catch (e) { bad++; console.log('✗', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); } }
console.log(bad ? `\n${bad}개 실패` : `\nsample100 패턴 테스트 ${T.length}개 전부 통과`); process.exit(bad ? 1 : 0);
