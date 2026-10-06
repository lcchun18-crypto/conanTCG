// v1.16.2: "액션했을 때" 효과(act 트리거, 예: id_1189 AP 4000 이상 낮은 캐릭터를 지정해 액션했을 때)는 상대가 가드(블록)를 고르기 전에 바로 발동한다.
const U = require('./mz_util'); const { G, real, dummy, field, rem, act, pump, ok } = U;
let pass = 0, fail = 0; const chk = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const mk = (extra = {}) => { const defs = { A: real('id_1189'), T: dummy('T', { ap: '1000' }), T5: dummy('T5', { ap: '3000' }), BL: dummy('BL', { ap: '5000' }), BLL: dummy('BLL', { ap: '1000' }), R2: dummy('R2', { lv: '2', color: 'green', ap: '1000' }), k: { n: 'K', type: 'case', color: 'green/red', lv: '2', lv2: '3' }, ...extra };
  const R = G(defs, [], []); R.turn = 0; R.fl = {}; const a = field(R, 0, 'A'); R.cards[a].sum = 0; return { R, a }; };
for (const mode of ['가드 안 함', '조건에 안 맞는 캐릭터로 가드(AP 5000, 차이 1000)', '조건에 안 맞는 캐릭터로 가드(AP 1000 — 차이 5000이지만 다른 캐릭터)']) {
  const { R, a } = mk(); const t = field(R, 1, 'T', 's'), bl = field(R, 1, 'BL', 'a'), bll = field(R, 1, 'BLL', 'a'); const r2 = rem(R, 0, 'R2');
  const e = act(R, 0, { a: 'action', id: a, k: 'char', tid: t });
  chk(!e && R.sub && R.sub.type === 'guard' && R.eff && R.eff.req.who === 0 && R.eff.req.sel.includes(r2), `[${mode}] 액션 선언 직후(상대 가드 전) 내 쪽에 효과 선택이 바로 뜸`);
  const g0 = act(R, 1, { a: 'guard', id: null }); chk(!!g0 && R.sub.type === 'guard', `[${mode}] 효과 처리 중에는 상대가 가드를 고를 수 없음 (${g0})`);
  chk(R.eff && R.eff.req.who === 0 && U.S.view(R, 1).eff && U.S.view(R, 1).eff.wait === 1, `[${mode}] 상대 화면에는 "효과 처리 중" 대기 표시 (카드 정보 없음)`);
  const e2 = act(R, 0, { a: 'ans', v: [r2] }); chk(!e2 && R.P[0].field.includes(r2) && R.cards[r2].st === 's' && !R.eff, `[${mode}] 효과 해결: 리무브의 Lv2 캐릭터가 슬립 상태로 등장 (가드 전)`);
  chk(R.sub && R.sub.type === 'guard' && R.sub.who === 1, `[${mode}] 그 다음에야 상대의 가드 선택 차례`);
  const gid = mode.startsWith('가드 안') ? null : mode.includes('AP 5000') ? bl : bll; const e3 = act(R, 1, { a: 'guard', id: gid });
  chk(!e3 && R.sub && R.sub.type === 'contact', `[${mode}] 가드 후 컨택트로 정상 진행`); U.endContact(R);
  chk(R.P[0].field.includes(r2) && R.log.filter(x => x.includes('효과 발동: 遠山和葉')).length === 1, `[${mode}] 효과는 정확히 1번만 발동 (턴①), 등장시킨 캐릭터 유지`);
}
// 조건 불충족: AP 차이 4000 미만(6000 vs 3000)이면 발동하지 않는다
{ const { R, a } = mk(); const t = field(R, 1, 'T5', 's'); rem(R, 0, 'R2'); act(R, 0, { a: 'action', id: a, k: 'char', tid: t }); chk(!R.eff && R.sub.type === 'guard' && R.sub.who === 1, 'AP 차이 3000(<4000) 대상 지정 → 효과 없음, 바로 상대 가드 차례'); }
// 효과를 거절(선택 0장)해도 액션은 계속된다
{ const { R, a } = mk(); const t = field(R, 1, 'T', 's'); rem(R, 0, 'R2'); act(R, 0, { a: 'action', id: a, k: 'char', tid: t }); const e = act(R, 0, { a: 'ans', v: [] }); chk(!e && !R.eff && R.sub.type === 'guard' && R.P[0].field.length === 1, '0장 선택(안 쓰기) → 액션 계속, 상대 가드 차례'); }
// 사건 지정 액션(캐릭터 지정이 아님)에는 발동하지 않는다
{ const { R, a } = mk(); R.P[1].evid.push(...U.evid(R, 1, 1)); rem(R, 0, 'R2'); const e = act(R, 0, { a: 'action', id: a, k: 'case' }); chk(!e && !R.eff, '사건을 지정한 액션에는 이 효과가 발동하지 않음'); }
// 상대 쪽: 가드 전 효과가 상대 캐릭터(방어자) 소유 카드일 때도(예: id_0348) 방어자에게 먼저 질의된다 — 가드 전에 처리
{ const defs = { c: real('id_0348'), pl: dummy('P', { trait: '警察' }), n: dummy('N'), k: { n: 'K', type: 'case', color: 'yellow', lv: '2', lv2: '3' } }; const R = G(defs, [], []); R.turn = 0; R.fl = {};
  const n = field(R, 0, 'n'); R.cards[n].sum = 0; const c = field(R, 1, 'c', 's'); const pl = field(R, 1, 'pl', 's'); const e = act(R, 0, { a: 'action', id: n, k: 'char', tid: c });
  chk(!e && ((R.eff && R.eff.req.who === 1) || (R.sub && R.sub.who === 1)), '상대 캐릭터 액션 시 방어 쪽 효과(id_0348)도 가드 선택 전에 처리/질의됨'); }
console.log(`\nact_before_guard_test: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
