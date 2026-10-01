// Tactical 판단 로그: 결정 하나에 대해 "리살 판정 / 선택한 행동 / 다른 주요 후보 / 이유 / FILE 변화 / 증거 변화 / AP·컷인 판단" 을 사람이 읽을 수 있게 만든다.
//   decide() 가 info.tactics 로 돌려주고, controller 가 AI 기록(botlog)에 넣고, test/tactics_test.js 가 출력한다.
'use strict';
const r2 = x => Math.round(x * 100) / 100;
function lethalSummary(L) {
  if (!L) return null; const r = L.report || {};
  return { found: !!L.found, kind: L.kind || null, line: (L.line || []).map(x => x.desc), skipped: L.skipped || null, fake: L.fake || null, nodes: L.nodes, ms: L.ms, potential: L.potential,
    calc: { need: r.need, solved: r.solved, partnerReady: r.partnerReady, state: r.state, evid: r.evid, fieldLP: r.fieldLP, handLP: r.handLP, handPlan: r.handPlan, A: r.A, B: r.B, C: r.C, oppBlockers: r.oppBlockers, attackSlots: r.attackSlots, steals: r.steals, removalsInHand: r.removalsInHand, fileNow: r.fileNow, fileLimited: r.fileLimited } };
}
function stateLine(R, seat) { const P = R.P[seat], O = R.P[1 - seat]; return { turn: R.n, file: P.file.length, evid: P.evid.length, need: require('../evaluate.js').need(R, seat), solved: !!R.cards[P.kase].solved, hand: P.hand.length, field: P.field.length, oppField: O.field.length, oppEvid: O.evid.length, oppFile: O.file.length }; }
function candOf(root, c, pol, seat, describe) {
  const first = c.line[0] && c.line[0].mv, j = first && pol.tactics ? pol.tactics.judge(root, first) : null, R2 = c.R;
  return { desc: c.line.map(l => describe(root, l.mv)).join(' → '), value: r2(c.value), first: first ? describe(root, first) : null, tags: j ? j.tags : [], prune: j ? j.prune : null, note: j ? j.note : '', ap: j && j.ap || undefined,
    file: R2 && R2.P ? { before: root.P[seat].file.length, after: R2.P[seat].file.length } : undefined, evidence: R2 && R2.P ? { me: [root.P[seat].evid.length, R2.P[seat].evid.length], opp: [root.P[1 - seat].evid.length, R2.P[1 - seat].evid.length] } : undefined,
    oppField: R2 && R2.P ? [root.P[1 - seat].field.length, R2.P[1 - seat].field.length] : undefined, reply: c.reply };
}
// 일반 탐색 결과(root: 결정 시점 상태, res: planTurn 결과)
function explainSearch(root, res, pol, seat, describe, lethal, extra = {}) {
  const cands = (res.cands && res.cands.length ? res.cands : [res.best]).slice(0, 4).map(c => candOf(root, c, pol, seat, describe));
  const best = candOf(root, res.best, pol, seat, describe), alt = cands.find(c => c.desc !== best.desc) || null;
  const why = []; if (best.note) why.push(best.note); if (best.tags.includes('file>6')) why.push('FILE 6 초과분 사용');
  if (alt) why.push(`차선 「${alt.desc}」 대비 탐색 값 ${best.value} vs ${alt.value}${alt.prune ? ` (차선은 규칙 ${alt.prune} 에 걸림)` : ''}`);
  if (res.overrides && res.overrides.length) why.push('탐색이 규칙을 뒤집은 수: ' + res.overrides.map(o => describe(root, o.mv) + ` (+${o.gain})`).join(', '));
  const pruned = (res.pruned || []).map(p => ({ desc: describe(root, p.mv), rule: p.why, searchGain: p.gain != null ? r2(p.gain) : null, need: r2(p.need), overridden: !!(res.overrides || []).find(o => o.mv === p.mv) }));
  return { state: stateLine(root, seat), lethal: lethalSummary(lethal), chosen: best, others: cands.filter(c => c.desc !== best.desc), why: why.join(' / '), prunedRoot: pruned, ...extra };
}
module.exports = { lethalSummary, explainSearch, stateLine, candOf };
