// AI 설명 로그: 후보 행동(첫 행동이 서로 다른 최선 라인)마다 점수가 "어떤 판단 요소" 때문에 그렇게 나왔는지 분해한다.
//   factors(Δ, 지금 상태 대비 그 라인 끝 상태): evidenceTempo boardValue filePreservation lethalDistance oppLethalThreat actionEconomy formation handQuality other search
//     · actionEconomy = 라인의 Action Economy 경로 가산,  search = 상대 다음 턴 응수 검증으로 바뀐 값(탐색)
//     · Σ factors = (후보 값) − (지금 상태 정적 평가)   → "왜 캐릭터를 잡고 증거를 안 먹었어?" 를 항목 차이로 볼 수 있다
//   steps: 라인의 각 행동 → 상대(와 나)의 응수(가드/컷인/변장/미스리드) → 결과(Action Economy 특징)   (Perfect Information 시퀀스 분석)
'use strict';
const EV = require('../evaluate.js'), F = require('./features.js');
const LABEL = { evidenceTempo: '증거 템포', boardValue: '보드 가치', filePreservation: 'FILE 보존', lethalDistance: '리살 거리(내 승리 턴)', oppLethalThreat: '상대 리살 위협', actionEconomy: 'Action Economy', formation: '콤보/포메이션 진행', handQuality: '손패 품질', other: '기타', search: '상대 응수 검증(탐색)' };
const KEYS = [...EV.CATS, 'search'];
const r2 = x => Math.round(x * 100) / 100;

function factorsOf(p0, c, me, pol) {
  const leaf = c.R, out = {}, terms = {};
  if (!leaf) return null;
  const p = EV.evalParts(leaf, me, pol);
  for (const k of EV.CATS) out[k] = (p.cat[k] || 0) - (p0.cat[k] || 0);
  out.actionEconomy += c.lb || 0;
  out.search = c.value - (c.static != null ? c.static : p.total) - (c.lb || 0);
  if (Math.abs(p.total) >= EV.WIN / 2) { for (const k of KEYS) out[k] = 0; out[p.total > 0 ? 'lethalDistance' : 'oppLethalThreat'] = p.total > 0 ? 1000 : -1000; }
  const keys = new Set([...Object.keys(p.terms), ...Object.keys(p0.terms)]); for (const k of keys) { const d = (p.terms[k] || 0) - (p0.terms[k] || 0); if (Math.abs(d) > 0.05) terms[k] = r2(d); }
  for (const k of KEYS) out[k] = r2(out[k]);
  return { factors: out, terms: Object.fromEntries(Object.entries(terms).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8)) };
}
function stepsOf(root, c, describe) {
  return c.line.map(st => { const o = { act: describe(root, st.mv) };
    if (st.resp && st.resp.length) o.responses = st.resp.map(m => (m.seat !== st.mv.seat ? '상대 ' : '') + describe(root, m));
    if (st.tr) { const t = st.tr; o.economy = { actionsGenerated: t.actionsGenerated, zonesAffected: t.zonesAffected, cardsSpent: t.cardsSpent, fileSpent: t.fileSpent, evidenceGenerated: t.evidenceGenerated, removalGenerated: t.removalGenerated, boardCreated: t.boardCreated }; }
    return o; });
}
function whyText(a, b) {
  if (!a || !b) return null;
  const d = KEYS.map(k => [k, (a.factors[k] || 0) - (b.factors[k] || 0)]).filter(x => Math.abs(x[1]) >= 0.05).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  const plus = d.filter(x => x[1] > 0).slice(0, 3).map(x => `${LABEL[x[0]]} ${x[1] > 0 ? '+' : ''}${r2(x[1])}`), minus = d.filter(x => x[1] < 0).slice(0, 2).map(x => `${LABEL[x[0]]} ${r2(x[1])}`);
  return `「${a.desc}」 를 「${b.desc}」 보다 고른 이유: ${plus.join(', ') || '차이 작음'}${minus.length ? ` (대신 ${minus.join(', ')})` : ''} — 합계 ${r2(a.value - b.value) >= 0 ? '+' : ''}${r2(a.value - b.value)}`;
}
// root: 탐색에 쓴 루트 상태(결정 시점), res: planTurn 결과, describe(R, mv)
function explain(root, res, pol, me, describe, o = {}) {
  const p0 = EV.evalParts(root, me, pol), cands = (res.cands && res.cands.length ? res.cands : [res.best]).filter(Boolean);
  if (res.best && !cands.includes(res.best) && !cands.some(c => c.line[0] && res.best.line[0] && JSON.stringify(c.line[0].mv.m) === JSON.stringify(res.best.line[0].mv.m))) cands.unshift(res.best);
  const top = cands.slice(0, o.n || 4).map(c => { const f = factorsOf(p0, c, me, pol);
    const feat = pol && pol.analyze && c.R && c.R.phase === 'play' ? pol.analyze(c.R) : null;
    return { desc: c.line.map(l => describe(root, l.mv)).join(' → '), first: c.line[0] ? describe(root, c.line[0].mv) : '', value: r2(c.value), static: c.static != null ? r2(c.static) : null, verified: !!c.verified, reply: c.reply || null,
      factors: f && f.factors, terms: f && f.terms, after: feat && { myTurnsToWin: feat.myTurnsToWin, oppTurnsToWin: feat.oppTurnsToWin, evidence: feat.evidence, file: { fileAfterAction: feat.file.fileNow, nextTurnFile: feat.file.nextTurnFile, nextTurnFileRequirement: feat.file.nextTurnFileRequirement, lethalFileRequirement: feat.file.lethalFileRequirement, defensiveFileRequirement: feat.file.defensiveFileRequirement, shortNext: feat.file.shortNext, shortLethal: feat.file.shortLethal, shortDef: feat.file.shortDef }, formation: feat.formation, lethalPackages: feat.lethalPackages },
      steps: stepsOf(root, c, describe) }; });
  const chosen = top.find(t => res.best && t.first === describe(root, res.best.line[0].mv)) || top[0], alt = top.find(t => t !== chosen);
  if (chosen) chosen.chosen = true;
  for (const t of top) if (t !== chosen && chosen && t.factors && chosen.factors) { t.vsChosen = {}; for (const k of KEYS) { const d = r2((chosen.factors[k] || 0) - (t.factors[k] || 0)); if (d) t.vsChosen[k] = d; } t.why = whyText(chosen, t); }
  const now = pol && pol.analyze ? pol.analyze(root) : null;
  return { labels: LABEL, now: now && { myTurnsToWin: now.myTurnsToWin, oppTurnsToWin: now.oppTurnsToWin, turnsToSolve: now.turnsToSolve, evidence: now.evidence, file: now.file, board: now.board, partner: now.partner, formation: now.formation, lethalPackages: now.lethalPackages },
    nowFactors: Object.fromEntries(EV.CATS.map(k => [k, r2(p0.cat[k] || 0)])),
    defense: { opp: F.defense(root, 1 - me), me: F.defense(root, me) },
    candidates: top, why: whyText(chosen, alt),
    pruned: (res.pruned || []).map(x => ({ act: describe(root, x.mv), knowledge: x.why, value: x.value != null ? r2(x.value) : null, best: r2(x.best), gain: x.gain != null ? r2(x.gain) : null })),
    overrides: (res.overrides || []).map(x => ({ act: describe(root, x.mv), knowledge: x.why, gain: x.gain })) };
}
module.exports = { explain, factorsOf, whyText, LABEL, KEYS };
