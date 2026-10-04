// v1.12.2: (1) 동적 레벨 변경 후 조건 판정(id_0886 + id_0438), (2) 복수 legal target 선택(id_0321), (3) 제거 시 MR/파트너 에리어 이동(id_0884)
delete process.env.CONAN_DEFAULT_OWN;
const U = require('./mz_util'); const { G, real, dummy, field, fillFile, pump, S, FX, auto } = U; const SIM = require('../bot/simulate.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const RED = { p: { n: 'P', type: 'partner', color: 'red', lp: '1' }, k: { n: 'K', type: 'case', color: 'red', lv: '2', lv2: '3' } };
const where = (R, s, id) => ['rem', 'pa', 'hand', 'deck', 'field'].filter(z => R.P[s][z].includes(id));
// ── 1. id_0886: 상대 캐릭터를 id_0438(자기 턴 상대 현장 레벨-1)이 먼저 -1 한 뒤, 0886 의 액션(-1)으로 6 이하가 되면 AP+3000
for (const [lv, with438, want] of [['8', true, 8000], ['7', true, 8000], ['9', true, 5000], ['8', false, 5000], ['7', false, 8000]]) {
  const defs = { C: real('id_0886'), D: dummy('D', { lv, ap: '7500', lp: '2' }) }, keys = ['C', 'D']; if (with438) { defs.A = real('id_0438'); keys.push('A'); }
  const R = G(defs, keys, keys); fillFile(R, 0, 6); fillFile(R, 1, 6);
  const s = R.turn, o = 1 - s, c = field(R, s, 'C'), d = field(R, o, 'D'); if (with438) field(R, s, 'A'); R.cards[d].st = 's';
  const pre = FX.lvOf(R, d); U.attack(R, c, d); pump(R); const post = FX.lvOf(R, d), ap = S.ap(R, c);
  const view = S.view(R, s), shown = JSON.stringify(view).includes('"lv"');
  ok(ap === want, `인쇄 Lv${lv}${with438 ? ' + 0438(-1)' : ''}: 액션 전 Lv${pre} → 후 Lv${post}, 0886 AP ${ap} (기대 ${want}) — 전투 AP 계산 자체가 ${ap === want ? '정상' : '오류'}`);
  U.finishContact(R); const survived = R.P[o].field.includes(d); ok(survived === (want === 5000), `  컨택트 결과: ${want === 8000 ? 'AP 8000 > 7500 → 상대 리무브' : 'AP 5000 < 7500 → 상대 생존'} (생존 ${survived})`);
}
// ── 2. id_0321: 조건에 맞는 7코 이상 赤井秀一/ライ 가 2장 이상이면 반드시 직접 선택 (임의/첫 카드 자동 선택 금지)
function use0321(others) { const defs = { X: real('id_0321') }, keys = ['X', ...others]; others.forEach(i => defs[i] = real(i)); const R = G(defs, keys, keys, RED); fillFile(R, 0, 6); fillFile(R, 1, 6);
  const s = R.turn, x = field(R, s, 'X'); R.cards[x].st = 's'; const ids = {}; others.forEach(i => ids[i] = field(R, s, i)); const e = S.act(R, s, { a: 'ability', id: x, i: 2 }); return { R, s, x, ids, e }; }
{ const { R, s, x, ids, e } = use0321(['id_0884', 'id_0052']); const q = R.eff && R.eff.req;
  ok(!e && q && q.kind === 'pick' && eq2(q.sel, [ids.id_0884, ids.id_0052]) && q.min === 1 && q.max === 1, `후보 2장(0884 Lv9, 0052 Lv8) → 선택 UI (sel=${q && q.sel}) — 자동 처리 안 됨`);
  ok(S.act(R, s, { a: 'ans', v: [x] }) === '선택할 수 없는 카드가 있습니다' && R.eff, '서버 legality: 후보 밖 카드(자기 자신) 선택은 거부');
  ok(S.act(R, s, { a: 'ans', v: [ids.id_0884, ids.id_0052] }) && R.eff, '서버 legality: 2장 선택은 거부(1장만)');
  const bm = SIM.genMoves(R, () => 0).filter(m => m.seat === s); ok(bm.length >= 2 && bm.every(m => m.m.v && m.m.v.every(t => q.sel.includes(t))), `봇 후보: 모든 합법 수가 legal target 안에서만 선택 (${bm.length}개)`);
  ok(!S.act(R, s, { a: 'ans', v: [ids.id_0052] }), '직접 선택 처리'); pump(R);
  ok(where(R, s, ids.id_0052).join() === 'rem' && where(R, s, ids.id_0884).join() === 'field', '고른 0052 만 리무브, 0884 는 그대로 (특정 ID 자동 선택 없음)'); }
{ const { R, s, ids } = use0321(['id_0884', 'id_0438']); const q = R.eff && R.eff.req;
  ok(q && q.kind === 'pick' && eq2(q.sel, [ids.id_0884, ids.id_0438]), `영문 인쇄명 'SHUICHI AKAI'(id_0438 Lv8)도 「赤井秀一」 후보 → 선택 UI (sel=${q && q.sel}) — 원인: 이름 불일치로 0884 만 후보라 자동 리무브되던 것`);
  auto(R, { pref: [ids.id_0438] }); pump(R); ok(where(R, s, ids.id_0438).join() === 'rem' && where(R, s, ids.id_0884).join() === 'field', '0438 선택 → 0438 만 리무브'); }
{ const { R, s, ids, e } = use0321(['id_0884', 'id_0054']); ok(!e && !R.eff && where(R, s, ids.id_0884).join() === 'rem' && where(R, s, ids.id_0054).join() === 'field', '후보 1장(0884 Lv9; 0054 는 Lv5 라 조건 밖)이면 자동 선택'); }
{ const { R, s, ids } = use0321(['id_0884', 'id_0052']); auto(R, { pref: [ids.id_0884] }); pump(R); ok(where(R, s, ids.id_0884).join() === 'rem', '0321 코스트로 0884 를 고른 경우(자기 턴): 「相手ターン中」 한정 MR 이므로 리무브 에리어 (규칙대로)'); }
// ── 3. id_0884 MR: 상대 턴에 현장을 떠나면 어떤 제거 경로든 파트너 에리어
const kill = d => ({ n: 'KILLER', type: 'char', color: 'blue', lv: '1', ap: '1000', lp: '1', ab: [{ ic: 'declare', lim: 1, ops: [{ op: 'select', n: 1, filter: { own: 'opp', lvMax: 9 }, do: d }], txt: 'x' }] });
const setup = () => { const R = G({ V: real('id_0884'), K1: kill('remove'), K2: kill('hand'), K3: kill('deckBottom'), A: dummy('A', { ap: '9000' }) }, ['V', 'K1', 'K2', 'K3', 'A'], ['V', 'K1', 'K2', 'K3', 'A'], RED); fillFile(R, 0, 6); fillFile(R, 1, 6); return R; };
for (const [k, label] of [['K1', '효과로 리무브'], ['K2', '효과로 손패로'], ['K3', '효과로 덱 아래로']]) { const R = setup(), o = R.turn, s = 1 - o, v = field(R, s, 'V'), kk = field(R, o, k); R.cards[v].st = 's';
  S.act(R, o, { a: 'ability', id: kk, i: 0 }); auto(R, { pref: [v] }); pump(R); ok(where(R, s, v).join() === 'pa', `상대 턴 ${label} → 파트너 에리어 (${where(R, s, v)})`); }
{ const R = setup(), o = R.turn, s = 1 - o, v = field(R, s, 'V'), a = field(R, o, 'A'); R.cards[v].st = 's'; U.attack(R, a, v); U.finishContact(R); ok(where(R, s, v).join() === 'pa', `상대 턴 컨택트 패배 → 파트너 에리어 (${where(R, s, v)})`); }
{ const R = setup(), o = R.turn, s = 1 - o, v = field(R, s, 'V'); FX.rmChar(R, v, 'training'); ok(where(R, s, v).join() === 'pa', `연습 모드 시스템 제거(rmChar, 상대 턴) → 파트너 에리어`); }
{ const R = setup(), o = R.turn, v = field(R, o, 'V'); FX.rmChar(R, v, 'effect'); ok(where(R, o, v).join() === 'rem', '자기 턴에 제거되면 리무브 에리어 (MR 은 「相手ターン中」 한정)'); }
function eq2(a, b) { return JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y)); }
console.log(`dynlv_pick_mr_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
