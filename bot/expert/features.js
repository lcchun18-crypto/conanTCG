// Expert Knowledge Layer — 상태 특징(feature) 추출.  모든 값은 "좌석 s 기준의 절대값"이고, 평가에서는 f(나) − f(상대) 로만 쓴다(반대칭 유지).
// 카드 이름/ID 를 모른다. 엔진 규칙(FILE/증거/추리/어시스트/해결편/컨택트)과 카드 수치(AP/LP/레벨)·효과 구조(fx_profile)만 본다.
//
//   side(R,s)            좌석 요약 (증거·필요 증거·해결편·FILE·파트너·캐릭터 스탯)
//   turnsToSolve(R,X,Y)  "몇 번째 내 턴에 사건 해결이 가능한가" (0 = 지금 이 턴) + 해결편 이행 턴 + 다음 턴 증거 획득량
//   threat(R,X,Y)        X 가 이번 턴(진행 중일 때만)에 Y 의 노출된(슬립/스턴) 캐릭터·증거에서 뽑아낼 수 있는 기대 이득 = Y 의 boardLeakRisk
//   cleanup(R,X,Y)       X 손패의 다면 제거(2장 이상/전체)가 다음 턴 함께 처리할 수 있는 Y 캐릭터 가치 = futureCleanupValue
//   fileNeeds(R,X,T)     fileNow / fileAfter / nextTurnFileRequirement / lethalFileRequirement / defensiveFileRequirement 와 부족분
//   partnerAssist(R,X,Y) partnerDeductionValue / assistValue / assistOpportunityCost (행동 순서·설명용)
//   transition(A,B,s)    행동 하나(매크로 행동)의 Action Economy: actionsGenerated zonesAffected cardsSpent fileSpent evidenceGenerated removalGenerated boardCreated
//   defense(R,s)         s 가 쓸 수 있는 방어 자원(가드 가능 캐릭터·컷인·변장·미스리드) — Perfect Information 시퀀스 분석용
'use strict';
const SIM = require('../simulate.js'), EV = require('../evaluate.js'), XP = require('./fx_profile.js');
const { S } = SIM, { FX, D, fcount, tok } = S;
const num = x => +x || 0;
const MAXT = 8;

function side(R, s) {
  const P = R.P[s], pc = R.cards[P.partner], chars = [];
  for (const id of P.field) {
    const c = R.cards[id], st = EV.cstat(R, id), t = st.t;
    chars.push({ id, st: c.st || 'a', sum: !!c.sum, rapid: !!t.rapid, asC: !!t.asC, asE: !!t.asE, ap: st.ap, lp: Math.max(0, st.lp), mis: t.mis || 0,
      noReason: EV.hasKw(R, id, 'cantreason'), noAct: EV.hasKw(R, id, 'cantact'), noGuard: EV.hasKw(R, id, 'cantguard'), sleepGuard: EV.hasKw(R, id, 'sleepguard'), _v: null });
  }
  const pd = D(R, P.partner);
  return { s, P, R, E: P.evid.length, need: EV.need(R, s), solved: !!R.cards[P.kase].solved, fileLen: P.file.length, pIn: !!P.pIn, fc: fcount(R, s),
    pLP: Math.max(0, num(pd.lp)), pAct: pc.st === 'a' && !P.pIn, pNoReason: EV.hasKw(R, P.partner, 'cantreason'), chars, onTurn: R.turn === s && R.phase === 'play' };
}
const cv = (X, c) => c._v == null ? (c._v = EV.charValue(X.R, X.s, c.id)) : c._v;

// ── 승리까지 남은 턴 (내 페이스만 본다: 상대의 방해는 threat/leak 이 따로 본다)
// 규칙: 해결편 = (FILE + 어시스트) ≥ 7 에서 어시스트할 때. 해결 = 해결편 + 파트너 액티브 + 증거 ≥ 사건 레벨 (같은 턴 어시스트 불가).
function turnsToSolve(R, X, Y, o = {}) {
  let E = X.E + (o.dE || 0), fileLen = X.fileLen + (o.dFile || 0), solved = X.solved || !!o.solved; const need = X.need, first = X.onTurn ? 1 : 0;
  let solvedAt = solved ? 0 : -1, gain0 = null;
  for (let k = 0; k < MAXT; k++) {
    const cur = k === 0 && X.onTurn;
    if (!cur) fileLen += 2;
    let gain = 0;
    for (const c of X.chars) {
      if (c.noReason) continue;
      const can = cur ? c.st === 'a' && (!c.sum || c.rapid) : k === first ? c.st !== 'x' : true;
      if (!can) continue;
      gain += c.lp > 0 ? c.lp : (Y.E > 0 && !c.noAct ? 0.5 : 0);   // LP 0 캐릭터는 사건 액션(증거 1)을 기대
    }
    const pFree = cur ? X.pAct : true, pGain = pFree && !X.pNoReason ? X.pLP : 0;
    if (gain0 == null) gain0 = gain + pGain;
    if (solved && pFree && E + gain >= need - 1e-9) return { t: k, solvedAt, gainNext: gain0 };
    if (!solved && pFree && fileLen + 1 >= 7) { solved = true; solvedAt = k; E += gain; }
    else E += gain + pGain;
  }
  return { t: MAXT, solvedAt, gainNext: gain0 || 0 };
}
const winPly = (X, t) => 2 * t + (X.onTurn ? 0 : 1);

// ── 컷인 최대치 (손패 공개 정보: Perfect Information)
const cutCache = new WeakMap();
const cutOfDef = d => { let v = cutCache.get(d); if (v == null) { const p = XP.card(d); v = Math.max(tok(d).cut, p.cutV, (Array.isArray(d.ab) && d.ab.some(a => a.ic === 'cutin')) ? 1000 : 0); cutCache.set(d, v); } return v; };
function maxCut(R, s) { let m = 0; for (const id of R.P[s].hand) { const v = cutOfDef(D(R, id)); if (v > m) m = v; } return m; }
// ── X 의 위협(= Y 의 boardLeakRisk): X 가 지금 자기 턴이면, 남은 공격으로 Y 의 노출된 캐릭터/증거에서 뽑아낼 기대 이득
function threat(R, X, Y, evW) {
  if (!X.onTurn) return 0;
  const atk = []; for (const c of X.chars) if (c.st === 'a' && !c.noAct && (!c.sum || c.rapid || c.asC || c.asE)) atk.push(c.ap);
  if (!atk.length) return 0; atk.sort((a, b) => a - b);
  const cutX = maxCut(R, X.s), cutY = maxCut(R, Y.s);
  let guards = 0; for (const c of Y.chars) if ((c.st === 'a' || (c.st === 's' && c.sleepGuard)) && !c.noGuard) guards++;
  const tg = Y.chars.filter(c => c.st !== 'a').sort((a, b) => cv(Y, b) - cv(Y, a)), used = atk.map(() => false); let v = 0;
  for (const t of tg) {
    let j = -1; for (let i = 0; i < atk.length; i++) if (!used[i] && atk[i] + cutX >= t.ap + (cutY ? cutY * 0.5 : 0)) { j = i; break; }
    if (j < 0) continue; used[j] = true; const p = guards > 0 ? 0.5 : 0.85; if (guards > 0) guards--; v += p * cv(Y, t);
  }
  const left = used.filter(u => !u).length;
  if (left && Y.E > 0) v += Math.min(left, Y.E) * (guards > 0 ? 0.45 : 0.8) * evW;
  return v;
}
// ── 무해한 캐릭터(제거 가치 할인): 증거를 못 만들고(LP 0), 효과가 거의 없고, 상대 캐릭터를 잡지도 막지도 못하는(AP < 상대 최대 AP 의 절반) 캐릭터.
//    사건 공격으로 증거를 훔칠 가능성은 turnsToSolve/threat 가 따로 본다. 반환: X 의 무해한 캐릭터 가치 합 (평가에서 일부 할인)
function harmlessValue(R, X, Y) {
  if (!X.chars.length) return { v: 0, all: false };
  let maxY = 0; for (const c of Y.chars) if (c.ap > maxY) maxY = c.ap;
  let v = 0, n = 0;
  for (const c of X.chars) { if (c.lp > 0) continue; const p = EV.profile(D(R, c.id)); if (p.val > 0.3 || p.cut || p.flash) continue; if (maxY && c.ap >= maxY * 0.5) continue; if (!maxY && c.ap >= 3000) continue; v += cv(X, c); n++; }
  return { v, all: n === X.chars.length };
}
// ── 다면 제거 보존 가치: X 손패에 2장 이상(또는 전체)을 처리하는 제거가 있고 다음 턴 쓸 수 있으면, Y 캐릭터는 "이미 처리 예정"
function cleanup(R, X, Y) {
  if (Y.chars.length < 2) return 0;
  const reach = X.fileLen + 2 + 1; let n = 0;
  for (const id of X.P.hand) { const h = EV.hstat(R, X.s, id); if (!h.ok) continue; const p = XP.card(D(R, id)); if (p.mass >= 2 && h.lv <= reach) n = Math.max(n, p.mass); }
  if (!n) return 0;
  const vs = Y.chars.map(c => cv(Y, c)).sort((a, b) => b - a), k = Math.min(n, vs.length); let v = 0; for (let i = 0; i < k; i++) v += vs[i];
  return v;
}
// ── 상대 캐릭터 수 조건(oppField ≥ n)을 요구하는 내 카드: 남겨 두면 조건 충족 → 지금 제거 가치 감소
function oppFieldNeed(R, X, Y) {
  let need = 0; for (const id of [...X.P.hand, ...X.P.field]) { const p = XP.card(D(R, id)); if (p.oppFieldMin > need) need = p.oppFieldMin; }
  return need && Y.chars.length >= need ? 1 : 0;
}
// ── FILE 요구치 (FILE 은 마나가 아니다: 남은 FILE 이 다음 턴 최대 전개/리살 루트/돌발 대응을 정한다)
function fileNeeds(R, X, T) {
  const nf = X.fileLen + 2, avail = nf + 1;                       // 다음 내 턴 FILE (+어시스트)
  // 다음 턴 핵심 전개: 손패에서 가치 상위 2장 중 "곧 닿는" 카드의 레벨
  const cards = []; for (const id of X.P.hand) { const d = D(R, id); if (d.type !== 'char' && d.type !== 'event') continue; const h = EV.hstat(R, X.s, id); if (!h.ok) continue; cards.push({ lv: h.lv, v: h.base }); }
  cards.sort((a, b) => b.v - a.v); let nextReq = 0; for (const c of cards.slice(0, 2)) if (c.lv <= nf + 3 && c.lv > nextReq) nextReq = c.lv;
  for (const id of X.P.field) { const p = XP.card(D(R, id)); if (p.fileMin && p.fileMin <= nf + 3 && p.fileMin > nextReq) nextReq = p.fileMin; }
  // 리살 루트: 해결편이 아니면 어시스트 시점에 FILE 6 이 필요하다. 증거만 보면 tE 번째 턴에 해결 가능 → 그 전 턴까지 해결편이 되도록 하는 최소 FILE
  let lethalReq = 0, lethalCritical = false;
  if (!X.solved && T) { const tE = T.tE; lethalReq = Math.max(0, 6 - 2 * Math.max(0, tE - 1) - (X.onTurn ? 0 : 2)); lethalCritical = T.t > tE; }
  // 돌발 대응(상대 턴 중): 손패 변장 카드의 FILE 조건
  let defReq = 0; for (const id of X.P.hand) { const p = XP.card(D(R, id)); if (p.disguiseFileMin > defReq) defReq = p.disguiseFileMin; }
  const defHave = X.fileLen + (X.pIn ? 1 : 0);
  return { fileNow: X.fc, fileLen: X.fileLen, nextTurnFile: nf, nextTurnFileRequirement: nextReq, lethalFileRequirement: lethalReq, defensiveFileRequirement: defReq,
    shortNext: Math.max(0, Math.min(2, nextReq - avail)), shortLethal: Math.max(0, Math.min(2, lethalReq - X.fileLen)), shortDef: Math.max(0, Math.min(2, defReq - defHave)), lethalCritical };
}
// FILE 이 자연적으로 쌓였을 장수(이 이하로 내려갔다면 사용/파괴된 것)
function naturalFile(R, s) { const t = s === R.first ? Math.ceil(R.n / 2) : Math.floor(R.n / 2); return s === R.first ? Math.max(0, 2 * t - 1) : 2 * t; }
// ── 손패 곡선: 다음 내 턴에 낼 수 있는 캐릭터가 있는가
function handCurve(R, X) {
  const avail = X.fileLen + 2 + 1; let next = 0;
  for (const id of X.P.hand) { if (D(R, id).type !== 'char') continue; const h = EV.hstat(R, X.s, id); if (h.ok && h.lv <= avail) { next = 1; break; } }
  return next;
}
// ── 파트너 추리 vs 어시스트 (루트 상태에서 비교, 행동 순서 prior 와 설명에 쓴다)
function partnerAssist(R, X, Y, evW) {
  if (!X.onTurn || !X.pAct) return { available: false, partnerDeductionValue: 0, assistValue: 0, assistOpportunityCost: 0 };
  const base = turnsToSolve(R, X, Y), withP = X.pNoReason ? base : turnsToSolve(R, { ...X, E: X.E + X.pLP, pAct: false }, Y);
  const evMarg = X.E < X.need ? evW : evW * 0.16;
  const pdv = X.pNoReason ? 0 : Math.min(X.pLP, Math.max(0, X.need - X.E)) * evMarg + Math.max(0, X.pLP - Math.max(0, X.need - X.E)) * evW * 0.16 + Math.max(0, base.t - withP.t) * 2.0;
  let av = 0; const why = [];
  if (!X.solved && X.fileLen + 1 >= 7) { const aft = turnsToSolve(R, { ...X, solved: true, pAct: false }, Y); av += 2.5 + Math.max(0, base.t - aft.t) * 2.0; why.push('해결편 이행'); }
  if (!R.fl.played && !R.fl.hint) {
    let withAssist = 0, now = 0;
    for (const id of X.P.hand) { const d = D(R, id); if (!S.okc(R, X.s, d, id)) continue; const lv = FX.lvOf(R, id), v = EV.cardBase(R, id); if (lv <= X.fc) now = Math.max(now, v); else if (lv === X.fc + 1) withAssist = Math.max(withAssist, v); }
    if (withAssist > now) { av += (withAssist - now) * 1.2; why.push('레벨 +1 카드 사용'); }
  }
  return { available: true, partnerDeductionValue: Math.round(pdv * 100) / 100, assistValue: Math.round(av * 100) / 100, assistOpportunityCost: Math.round(pdv * 100) / 100, assistWhy: why };
}
// ── 방어 자원 (Perfect Information: 손패 공개)
function defense(R, s) {
  const P = R.P[s], n = id => D(R, id).n, out = { guards: [], cutins: [], disguises: [], misdirect: [] };
  for (const id of P.field) { const c = R.cards[id]; if ((c.st === 'a' || (c.st === 's' && FX.hasKwTk(R, id, 'sleepguard'))) && !FX.hasKwTk(R, id, 'cantguard')) out.guards.push({ id, name: n(id), ap: S.ap(R, id) });
    const t = S.tk(R, id); if (c.st === 'a' && t.mis > 0) out.misdirect.push({ id, name: n(id), mis: t.mis }); }
  for (const id of P.hand) { const d = D(R, id), t = tok(d); if (FX.hasCut(R, id) || t.cut > 0) out.cutins.push({ id, name: n(id), v: Math.max(t.cut, XP.card(d).cutV) || null });
    if (d.type === 'char' && (t.dis || FX.disAbs(R, id).length)) out.disguises.push({ id, name: n(id) }); }
  return out;
}
// ── 매크로 행동 하나의 Action Economy (행동 전 상태 A → 응수까지 끝난 상태 B, 행동 주체 s)
function transition(A, B, s) {
  const o = 1 - s, PA = A.P[s], PB = B.P[s], OA = A.P[o], OB = B.P[o];
  const inA = new Set(PA.hand), inB = new Set(PB.hand), fileA = new Set(PA.file), fileB = new Set(PB.file);
  let cardsSpent = 0; for (const id of PA.hand) if (!inB.has(id)) cardsSpent++;
  let handGain = 0; for (const id of PB.hand) if (!inA.has(id) && !fileA.has(id)) handGain++;          // 덱/리무브 등에서 손패로 (FILE→손패는 '획득'이 아니라 FILE 사용)
  let fileSpent = 0; for (const id of PA.file) if (!fileB.has(id)) fileSpent++;
  const fieldA = new Set(PA.field), fieldB = new Set(PB.field), ofB = new Set(OB.field);
  let entered = 0; for (const id of PB.field) if (!fieldA.has(id)) entered++;
  let lost = 0; for (const id of PA.field) if (!fieldB.has(id)) lost++;
  let removalGenerated = 0; for (const id of OA.field) if (!ofB.has(id)) removalGenerated++;
  const myEv = PB.evid.length - PA.evid.length, oppEvLoss = Math.max(0, OA.evid.length - OB.evid.length), oppHandLoss = Math.max(0, OA.hand.length - OB.hand.length);
  const boardCreated = entered - lost, evidenceGenerated = Math.max(0, myEv) + oppEvLoss;
  const zones = (entered > 0 ? 1 : 0) + (removalGenerated > 0 ? 1 : 0) + (myEv > 0 ? 1 : 0) + (oppEvLoss > 0 ? 1 : 0) + (handGain > 0 ? 1 : 0) + (oppHandLoss > 0 ? 1 : 0);
  const actionsGenerated = entered + removalGenerated + evidenceGenerated + handGain + oppHandLoss;
  return { actionsGenerated, zonesAffected: zones, cardsSpent, fileSpent, evidenceGenerated, removalGenerated, boardCreated, handGain, oppHandLoss };
}
module.exports = { side, cv, turnsToSolve, winPly, maxCut, threat, cleanup, harmlessValue, oppFieldNeed, fileNeeds, naturalFile, handCurve, partnerAssist, defense, transition, MAXT };
