// v1.10.1: id_0886 — 액션으로 지정한 (상대) 캐릭터의 레벨이 6 이하이면 이 캐릭터 AP+3000 (대상 필터에 '아군만' 기본값이 걸리던 버그)
delete process.env.CONAN_DEFAULT_OWN;
const U = require('./mz_util'); const { G, real, dummy, field, fillFile, pump, S, FX } = U;
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
for (const [lv, want] of [['7', 8000], ['6', 8000], ['8', 5000], ['5', 8000]]) {
  const R = G({ C: real('id_0886'), D: dummy('D', { lv, ap: '3000', lp: '2' }) }, ['C', 'D'], ['C', 'D']); fillFile(R, 0, 6); fillFile(R, 1, 6);
  const s = R.turn, o = 1 - s, c = field(R, s, 'C'), d = field(R, o, 'D'); R.cards[d].st = 's'; U.attack(R, c, d); pump(R);
  ok(S.ap(R, c) === want, `상대 Lv${lv} 캐릭터에 액션 → 레벨 -1 후 ${Number(lv) - 1 <= 6 ? '6 이하' : '7 이상'} → 내 AP ${S.ap(R, c)} (기대 ${want})`); }
console.log(`id0886_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
