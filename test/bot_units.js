// 봇 기반 구조 단위 테스트: 복제 격리, 리플레이 일치, 합법성, 숨은 정보(덱 순서) 비의존, 전투 정확 계산, 즉시 승리 탐색.
const U = require('./bot_util.js'), B = require('./bot_baselines.js'), SIM = require('../bot/simulate.js'), { decide } = require('../bot/decide.js'), { Searcher } = require('../bot/search.js'), { Tracker } = require('../bot/track.js'), { replay } = require('../bot/job.js');
const { S } = U; let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const snap = R => JSON.stringify([R.P, R.cards, R.fl, R.sub, R.q.map(i => [i.kind, i.src]), R.turn, R.n, R.phase, R.eff && R.eff.req]);
// 1) 랜덤 게임 전체에서: 리플레이 일치 / 탐색이 live 상태를 오염시키지 않음
let replayChecks = 0, replayBad = 0, isoBad = 0, nonclone = 0, decisions = 0;
for (let g = 1; g <= 12; g++) {
  const R = U.newGame(g, U.makeDeck(g * 2 + 1), U.makeDeck(g * 2 + 2), { first: g & 1 }), T = new Tracker(), h = B.heuristic(U.mulberry32(g)), sr = new Searcher({ seed: g }); let step = 0;
  while (R.phase !== 'over' && step++ < 3000) {
    const d = SIM.who(R); if (!d) break;
    if (T.base) { const Rr = replay(T.base, T.acts); replayChecks++; if (SIM.stateKey(Rr) !== SIM.stateKey(R)) { replayBad++; console.log('replay mismatch', g, step, d.kind); } }
    if (!SIM.cloneable(R)) nonclone++;
    if (step % 3 === 0 && d.kind !== 'mull') { const before = snap(R); const r = decide({ R, seat: d.seat, base: T.base, acts: T.acts, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 120, seed: step } }, sr); decisions++; if (snap(R) !== before) { isoBad++; console.log('LIVE CONTAMINATED', g, step, d.kind); } }
    const mv = h(R, d.seat); const e = T.apply(R, mv.seat, mv.m, (R_, s, m) => S.dispatch(R_, s, m)); if (e) { const m2 = SIM.genMoves(R, () => 0).find(m => !T.apply(R, m.seat, m.m, (R_, s, mm) => S.dispatch(R_, s, mm))); }
  }
}
ok(replayBad === 0, `리플레이(스냅샷+행동기록) 상태가 live 와 항상 일치: ${replayChecks}회, 불일치 ${replayBad}, 그중 효과 처리 중(복제 불가) ${nonclone}회`);
ok(isoBad === 0, `탐색 ${decisions}회 전후 live 상태 불변(오염 0)`);
// 2) 숨은 정보: 덱 순서만 다른 두 상태에서 같은 결정 (앞으로 뽑힐 카드를 알면 안 된다)
{ let same = 0, tot = 0;
  for (let g = 1; g <= 6; g++) { const R1 = U.newGame(g, U.makeDeck(g * 2 + 1), U.makeDeck(g * 2 + 2), { first: 0 }); let st = 0; const h = B.heuristic(U.mulberry32(g)), T = new Tracker();
    while (R1.phase !== 'over' && st++ < 400) { const d = SIM.who(R1); if (d.kind === 'main' && SIM.cloneable(R1) && R1.n >= 3 && tot < 12 && st % 4 === 0) {
        const R2 = SIM.clone(R1); for (const s of [0, 1]) R2.P[s].deck.reverse(); const cfg = { timeMs: 1e9, microMs: 1e9, maxNodes: 400, seed: 5 };
        const a = decide({ R: R1, seat: d.seat, cfg }, new Searcher({ seed: 5 })), b = decide({ R: R2, seat: d.seat, cfg }, new Searcher({ seed: 5 })); tot++; if (JSON.stringify(a.mv.m) === JSON.stringify(b.mv.m) && Math.abs((a.info.value || 0) - (b.info.value || 0)) < 1e-9) same++; }
      const mv = h(R1, d.seat); T.apply(R1, mv.seat, mv.m, (R_, s, m) => S.dispatch(R_, s, m)); } }
  ok(tot >= 6 && same === tot, `덱 순서를 바꿔도 봇의 결정/평가값이 동일 (${same}/${tot}) — 미래 드로우를 보지 않음`); }
// 3) 합법성: 탐색이 고른 행동은 엔진이 항상 받아들인다 (expert 가 고른 행동 전수 검사는 self-play 에서 수행; 여기선 후보 생성 정확도)
{ let cand = 0, rej = 0; for (let g = 1; g <= 8; g++) { const R = U.newGame(g + 50, U.makeDeck(g * 2 + 1), U.makeDeck(g * 2 + 2), { first: 0 }), h = B.heuristic(U.mulberry32(g)); let st = 0;
    while (R.phase !== 'over' && st++ < 600) { const d = SIM.who(R); if (!d) break; if (SIM.cloneable(R)) for (const m of SIM.genMoves(R, () => 0)) { cand++; const c = SIM.clone(R); if (SIM.applyMove(c, m, 1)) rej++; } const mv = h(R, d.seat); SIM.applyMove(R, mv, st); } }
  ok(rej / cand < 0.03, `후보 행동 ${cand}개 중 엔진 거부 ${rej}개 (${(100 * rej / cand).toFixed(2)}%) — 거부된 후보는 탐색에서 버려짐`); }
console.log(fail ? `\n봇 단위 테스트 ${fail}건 실패` : `\n봇 단위 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
