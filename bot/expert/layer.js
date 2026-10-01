// Expert Knowledge Layer — 기존 정책(PRO / 전문 봇) 위에 "고수의 판단 기준"을 얹는다.
// 강제 스크립트가 아니다: 지식은 ① 평가 특징(evaluation feature) ② 행동 prior(탐색 순서) ③ 소프트 pruning ④ 멀리건 계산 으로만 들어가고,
// 최종 선택은 언제나 탐색(search)이 한다. 소프트 pruning 으로 미룬 루트 행동도 탐색이 다시 검증해 더 좋으면 뒤집는다(search.js overrideCheck).
//
// policy 인터페이스(search/evaluate/decide 가 쓰는 것): { seat, W, score(R), parts(R), moveBonus(R,mv), prune(R,mv,moves), ban, softBan,
//   lineBonus(R0,R1,mv,mover), mulAdjust(R,s,rep), mulValue, analyze(R), knowledge }
'use strict';
const SIM = require('../simulate.js'), EV = require('../evaluate.js'), F = require('./features.js'), XP = require('./fx_profile.js'), KB = require('./knowledge.js'), MUL = require('./mulligan.js');
const { S } = SIM, { FX, D, fcount } = S;

// 특징의 기본 크기 (knowledge feature scale 1.0 일 때). 단위: 손패 1장 ≈ 1.0
const BASE = { ttw: 4.0, race: 1.6, raceCap: 12, evidenceTempo: 1.5, leak: 0.5, cleanup: 0.35, fileNext: 1.2, fileLethal: 1.5, fileLethalSoft: 0.35, fileDef: 0.8, fileFloor: 1.0, fileSpent: 0.8,
  ae: 0.5, aeCapMove: 2, aeCapLine: 3, handCurve: 0.4, formationW: 3, formationComplete: 1.5, lethalPkg: 2.0, harmless: 0.5, harmlessClear: 0.7 };
const PRO_K = require('../pro.js').K;
const keyOf = (R, id) => { const d = R.cards[id].d; return d.slice(d.indexOf(':') + 1); };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

function attach(base, o) {
  const { seat, R } = o, bot = o.bot || 'pro', profile = o.profile || {}, isFirst = R.first === seat;
  const plan = { ...(profile[isFirst ? 'firstPlayerPlan' : 'secondPlayerPlan'] || {}) };
  const ctx = KB.contextOf(R, seat, { bot, archetype: profile.archetype });
  const K = KB.compile(ctx, { knowledge: profile.knowledge, kb: o.kb });
  const f = K.feat, P = K.prior, W = base && base.W ? base.W : null, w = W || EV.W;
  const formation = plan.formation || profile.formation || null, packages = (profile.lethal && profile.lethal.packages) || [], roles = profile.roles || {}, cardsP = profile.cards || {};
  const preserve = clamp(+((plan.partner && plan.partner.preserveDeduction) ?? (profile.partner && profile.partner.preserveDeduction) ?? (K.partner && K.partner.preserveDeduction) ?? 0) || 0, 0, 1);
  const floorDef = plan.fileFloor || profile.fileFloor || K.fileFloor || null, floorW = (plan.fileFloor || profile.fileFloor) ? 1 : f.fileFloor;   // 프로필이 직접 정한 FILE 하한은 기본 크기
  const mulPlan = { requiredEarlyPlays: plan.requiredEarlyPlays || profile.requiredEarlyPlays || (K.mulligan.requiredEarlyPlays && K.mulligan.requiredEarlyPlays.v),
    mulliganKeepGroups: [...(plan.mulliganKeepGroups || profile.mulliganKeepGroups || []), ...((K.mulligan.mulliganKeepGroups && K.mulligan.mulliganKeepGroups.v) || [])],
    curveFailurePenalty: plan.curveFailurePenalty ?? profile.curveFailurePenalty ?? (K.mulligan.curveFailurePenalty && K.mulligan.curveFailurePenalty.v) };

  // ── formation / lethal package (전문 봇 프로필)
  const roleOf = k => cardsP[k] && cardsP[k].role;
  const slotMatch = (slot, R_, id) => { const k = keyOf(R_, id), d = D(R_, id); if (slot.cards && !slot.cards.includes(k)) return false; if (slot.role && roleOf(k) !== slot.role) return false; if (slot.type && d.type !== slot.type) return false; const lv = FX.lvOf(R_, id); if (slot.lvMin != null && lv < slot.lvMin) return false; if (slot.lvMax != null && lv > slot.lvMax) return false; return true; };
  const fill = (slots, R_, ids) => { if (!slots || !slots.length) return 1; let got = 0, tot = 0; const used = new Set(); for (const sl of slots) { const n = sl.n || 1, wt = sl.weight || 1; let h = 0; for (const id of ids) { if (h >= n) break; if (used.has(id)) continue; if (slotMatch(sl, R_, id)) { used.add(id); h++; } } got += wt * h / n; tot += wt; } return tot ? got / tot : 1; };
  function formationState(R_) {
    const Pm = R_.P[seat], out = { formation: null, packages: [] };
    if (formation) { const fp = fill(formation.field, R_, Pm.field), hp = fill(formation.hand, R_, Pm.hand), fo = formation.file ? Math.min(1, fcount(R_, seat) / formation.file) : 1, eo = formation.evidence ? Math.min(1, Pm.evid.length / formation.evidence) : 1;
      out.formation = { name: formation.name || 'formation', fieldProgress: fp, comboPiecesReady: hp, fileOk: fo, evidenceOk: eo, progress: (fp * 0.6 + hp * 0.25 + fo * 0.075 + eo * 0.075) }; }
    for (const pk of packages) { const fp = fill(pk.field, R_, Pm.field), hp = fill(pk.hand, R_, Pm.hand), fo = pk.file ? Math.min(1, fcount(R_, seat) / pk.file) : 1, eo = pk.evidence ? Math.min(1, Pm.evid.length / pk.evidence) : 1, so = pk.solved ? (R_.cards[Pm.kase].solved ? 1 : 0) : 1;
      out.packages.push({ name: pk.name || 'lethal', ready: (fp + hp + fo + eo + so) / 5, parts: { field: fp, hand: hp, file: fo, evidence: eo, solved: so }, sequence: pk.sequence || [] }); }
    return out;
  }
  const formationIds = R_ => { if (!formation || !formation.field) return null; const s = new Set(); for (const id of R_.P[seat].field) if (formation.field.some(sl => slotMatch(sl, R_, id))) s.add(id); return s; };

  // ── 평가 특징 (score/parts 공용). out 이 있으면 항목별로 기록한다.
  function terms(R_, out) {
    if (R_.phase !== 'play') return 0;
    const A = F.side(R_, seat), B = F.side(R_, 1 - seat), evW = w.ev; let v = 0;
    const add = (cat, term, x) => { if (!x || !Number.isFinite(x)) return; v += x; if (out) out.push({ cat, term, v: x }); };
    const ta = F.turnsToSolve(R_, A, B), tb = F.turnsToSolve(R_, B, A);
    if (f.turnsToWin) {
      const L = (X, t) => BASE.ttw / (1 + t.t) + BASE.race * (BASE.raceCap - Math.min(F.winPly(X, t.t), BASE.raceCap)) / 2;
      add('lethalDistance', 'expert:turnsToWin', f.turnsToWin * L(A, ta)); add('oppLethalThreat', 'expert:oppTurnsToWin', -f.turnsToWin * L(B, tb));
    }
    if (f.evidenceTempo) { const et = (X, t) => Math.min(1.25, (X.E + t.gainNext) / Math.max(1, X.need)); add('evidenceTempo', 'expert:evidenceTempo', f.evidenceTempo * BASE.evidenceTempo * (et(A, ta) - et(B, tb))); }
    if (f.boardLeakRisk) add('boardValue', 'expert:boardLeakRisk', f.boardLeakRisk * BASE.leak * (F.threat(R_, A, B, evW) - F.threat(R_, B, A, evW)));
    if (f.futureCleanupValue) add('boardValue', 'expert:futureCleanupValue', f.futureCleanupValue * BASE.cleanup * (F.cleanup(R_, A, B) - F.cleanup(R_, B, A)));
    // boardRemovalValue 보정: 무해한 캐릭터는 남아 있어도 상대에게 주는 것이 적다 → 기본 평가의 필드 가치를 절반 할인, (PRO) 상대 필드가 무해한 캐릭터뿐이면 '전멸 보너스'도 대부분 인정
    if (f.boardLeakRisk) { const ha = F.harmlessValue(R_, A, B), hb = F.harmlessValue(R_, B, A), clr = bot === 'pro' ? PRO_K.oppClear : 0;
      add('boardValue', 'expert:boardRemovalValue(무해 캐릭터 할인)', f.boardLeakRisk * (BASE.harmless * (hb.v - ha.v) + BASE.harmlessClear * clr * ((hb.all ? 1 : 0) - (ha.all ? 1 : 0)))); }
    if (f.nextTurnFileRequirement || f.lethalFileRequirement || f.defensiveFileRequirement) {
      const pen = (X, t, Y) => { const n = F.fileNeeds(R_, X, { t: t.t, tE: F.turnsToSolve(R_, X, Y, { solved: true }).t });
        return f.nextTurnFileRequirement * BASE.fileNext * n.shortNext + f.lethalFileRequirement * (n.lethalCritical ? BASE.fileLethal : BASE.fileLethalSoft) * n.shortLethal + f.defensiveFileRequirement * BASE.fileDef * n.shortDef; };
      add('filePreservation', 'expert:fileRequirement', -(pen(A, ta, B) - pen(B, tb, A)));
      // 쓴 FILE: 자연적으로 쌓였을 FILE 보다 적은 만큼(넥스트 힌트·코스트로 소비) — FILE 은 다음 턴 최대 전개/해결편 시점을 늦춘다
      const spent = X => Math.min(3, Math.max(0, F.naturalFile(R_, X.s) - X.fileLen));
      add('filePreservation', 'expert:fileSpent', -f.nextTurnFileRequirement * BASE.fileSpent * (spent(A) - spent(B)));
    }
    if (floorDef && floorW) { const fl = floorDef.floor, from = floorDef.fromTurn || 5, sh = X => R_.n >= from && F.naturalFile(R_, X.s) >= fl ? clamp(fl - X.fileLen, 0, 2) : 0; add('filePreservation', 'expert:fileFloor', -floorW * BASE.fileFloor * (sh(A) - sh(B))); }
    if (f.assistResidual) { const fd = X => X.fc <= 7 ? w.file : w.fileOver, r = X => X.onTurn ? 0 : (X.pIn ? fd(X) + w.pIn : 0) + (X.pAct ? w.partnerA : 0); add('filePreservation', 'expert:assistResidual(임시 FILE·파트너 보정)', -f.assistResidual * (r(A) - r(B))); }
    if (f.handCurve) add('handQuality', 'expert:handCurve', f.handCurve * BASE.handCurve * (F.handCurve(R_, A) - F.handCurve(R_, B)));
    if ((formation || packages.length) && f.formation) { const st = formationState(R_);
      if (st.formation) { const x = st.formation, wt = formation.weight != null ? formation.weight : BASE.formationW; add('formation', 'expert:formationProgress', f.formation * (wt * x.progress * x.progress + (x.fieldProgress >= 1 && x.comboPiecesReady >= 1 ? (formation.completeBonus != null ? formation.completeBonus : BASE.formationComplete) : 0))); }
      for (let i = 0; i < st.packages.length; i++) { const x = st.packages[i], b = packages[i].bonus != null ? packages[i].bonus : BASE.lethalPkg; add('formation', 'expert:lethalPackage', f.formation * (b * Math.pow(x.ready, 3) + (x.ready >= 1 ? b : 0))); } }
    return v;
  }

  // ── 행동 prior (탐색 순서만). 상태별 캐시
  const pc = new WeakMap();
  function priorCtx(R_) {
    let c = pc.get(R_); if (c) return c;
    const A = F.side(R_, seat), B = F.side(R_, 1 - seat), def = { guards: 0, cut: F.maxCut(R_, 1 - seat) };
    for (const x of B.chars) if ((x.st === 'a' || (x.st === 's' && x.sleepGuard)) && !x.noGuard) def.guards++;
    const atk = A.chars.filter(x => x.st === 'a' && !x.noAct && (!x.sum || x.rapid || x.asC || x.asE)).sort((a, b) => F.cv(A, a) - F.cv(A, b));
    const rs = A.chars.filter(x => x.st === 'a' && !x.noReason && (!x.sum || x.rapid)).sort((a, b) => a.ap - b.ap);
    const pa = F.partnerAssist(R_, A, B, w.ev), lean = pa.available ? clamp((pa.partnerDeductionValue - pa.assistValue) / 3, -1, 1) : 0;
    const assistNeeded = pa.available && pa.assistValue > 0.5;
    const hintAvail = !R_.fl.hw && !R_.fl.nh && R_.P[seat].file.length > 0;
    let hintBreaks = false; if (hintAvail) { const t = F.turnsToSolve(R_, A, B), tE = F.turnsToSolve(R_, A, B, { solved: true }).t, n0 = F.fileNeeds(R_, A, { t: t.t, tE }), n1 = F.fileNeeds(R_, { ...A, fileLen: A.fileLen - 1, fc: A.fc - 1 }, { t: t.t, tE }); hintBreaks = n1.shortNext > n0.shortNext || n1.shortLethal > n0.shortLethal; }
    c = { bait: atk.length >= 2 && (def.guards > 0 || def.cut > 0), weak: atk.length ? atk[0].id : null, strong: atk.length ? atk[atk.length - 1].id : null,
      mis: B.chars.some(x => x.st === 'a' && x.mis > 0), lowAp: rs.length ? rs[0].id : null, pa, lean, assistNeeded, hintAvail, hintBreaks, fIds: formationIds(R_) };
    pc.set(R_, c); return c;
  }
  function prior(R_, mv) {
    if (mv.seat !== seat) return 0;
    const m = mv.m; let b = 0;
    if (mv.tag === 'play' || mv.tag === 'ability') {
      const d = D(R_, m.id), z = mv.tag === 'play' ? XP.playZones(d).zones : XP.abilityZones(d, m.i).zones; if (P.multiZone && z > 1) b += P.multiZone * Math.min(2, z - 1);
      if (mv.tag === 'play' && m.rep != null && P.formationBreak) { const c = priorCtx(R_); if (c.fIds && c.fIds.has(m.rep)) b -= P.formationBreak; }
      return b;
    }
    const c = priorCtx(R_);
    switch (mv.tag) {
      case 'atkc': case 'atkk': if (P.baitAttack && c.bait) { if (m.id === c.weak) b += P.baitAttack; else if (m.id === c.strong) b -= P.baitAttack * 0.5; } break;
      case 'reason': if (P.lowApReasonFirst && c.mis && m.who !== 'p' && m.who === c.lowAp) b += P.lowApReasonFirst; if (P.reasonBeforeHint && c.hintAvail && R_.fl.played) b += P.reasonBeforeHint;
        if (m.who === 'p' && P.partnerChoice) b += P.partnerChoice * c.lean; break;
      case 'assist': if (P.partnerChoice) b -= P.partnerChoice * c.lean; if (preserve && !c.assistNeeded) b -= 8 * preserve; break;
      case 'hint': if (P.protectFileRoute && c.hintBreaks) b -= P.protectFileRoute; break;
    }
    return b;
  }

  // ── 소프트 pruning: 메인 계획 탐색에서 뒤로 미룬다. 반환값 = 근거 entry id (없으면 null)
  function prune(R_, mv, moves) {
    if (mv.seat !== seat || R_.turn !== seat) return null;
    if (mv.tag === 'hint') {
      if (K.prune.proHintTiming && K.prune.proHintTiming.on && base && base.ban && base.ban(R_, mv, moves)) return K.prune.proHintTiming.ids[0];
      const hp = K.prune.hintFileFloor; if (hp && hp.on) { const floor = hp.params.floor != null ? hp.params.floor : 5; if (R_.P[seat].file.length - 1 < floor && !(R_.cards[R_.P[seat].kase].solved)) return hp.ids[0]; }
    }
    if (mv.tag === 'end' && K.prune.proCharEveryTurn && K.prune.proCharEveryTurn.on && base && base.ban && base.ban(R_, mv, moves)) return K.prune.proCharEveryTurn.ids[0];
    return null;
  }

  // ── Action Economy (매크로 행동 하나의 경로 가산): 한 장/한 행동이 2개 이상 영역에 영향을 줬으면 가산
  function lineBonus(R0, R1, mv, mover) {
    if (!f.actionEconomy || R0.phase !== 'play' || R1.phase !== 'play') return { v: 0, tr: null };
    const tr = F.transition(R0, R1, mover), eff = Math.min(1, tr.actionsGenerated / Math.max(1, tr.cardsSpent + tr.fileSpent));
    const v = f.actionEconomy * BASE.ae * Math.min(BASE.aeCapMove, Math.max(0, tr.zonesAffected - 1)) * eff;
    return { v, tr, cap: f.actionEconomy * BASE.ae * BASE.aeCapLine };
  }

  // ── 멀리건: 초동 실패 확률 모델 + (전문 봇) 강제 유지/교체
  let lastMul = null;
  function mulAdjust(R_, s, rep) {
    if (s !== seat) return base && base.mulAdjust ? base.mulAdjust(R_, s, rep) : rep;
    const r = MUL.choose(R_, s, { plan: mulPlan, mulValue: base && base.mulValue, seed: (R_.P[s].hand.length * 31 + R_.P[s].deck.length) });
    let out = r.ids; lastMul = r.analysis;
    if (bot !== 'pro' && base && base.mulAdjust) { const fixed = base.mulAdjust(R_, s, out); if (Array.isArray(fixed)) out = fixed; }
    return out;
  }

  function analyze(R_) {
    if (R_.phase !== 'play') return null;
    const A = F.side(R_, seat), B = F.side(R_, 1 - seat), ta = F.turnsToSolve(R_, A, B), tb = F.turnsToSolve(R_, B, A);
    const tEa = F.turnsToSolve(R_, A, B, { solved: true }).t, tEb = F.turnsToSolve(R_, B, A, { solved: true }).t, na = F.fileNeeds(R_, A, { t: ta.t, tE: tEa }), nb = F.fileNeeds(R_, B, { t: tb.t, tE: tEb });
    const fs = (formation || packages.length) ? formationState(R_) : null, r2 = x => Math.round(x * 100) / 100;
    return { myTurnsToWin: ta.t, oppTurnsToWin: tb.t, turnsToSolve: { me: ta.t, opp: tb.t, mySolvedAt: ta.solvedAt, oppSolvedAt: tb.solvedAt, myEvidenceOnlyTurns: tEa }, winPly: { me: F.winPly(A, ta.t), opp: F.winPly(B, tb.t) },
      evidence: { me: A.E, need: A.need, oppE: B.E, oppNeed: B.need, myNextGain: ta.gainNext, oppNextGain: tb.gainNext },
      file: { fileNow: na.fileNow, fileLen: na.fileLen, nextTurnFile: na.nextTurnFile, nextTurnFileRequirement: na.nextTurnFileRequirement, lethalFileRequirement: na.lethalFileRequirement, defensiveFileRequirement: na.defensiveFileRequirement, shortNext: na.shortNext, shortLethal: na.shortLethal, shortDef: na.shortDef, oppShort: { next: nb.shortNext, lethal: nb.shortLethal } },
      board: { boardLeakRisk_me: r2(F.threat(R_, B, A, w.ev)), boardLeakRisk_opp: r2(F.threat(R_, A, B, w.ev)), futureCleanupValue: r2(F.cleanup(R_, A, B)), oppFieldCondition: F.oppFieldNeed(R_, A, B) },
      partner: F.partnerAssist(R_, A, B, w.ev), formation: fs && fs.formation ? { name: fs.formation.name, setupProgress: r2(fs.formation.progress), fieldProgress: r2(fs.formation.fieldProgress), comboPiecesReady: r2(fs.formation.comboPiecesReady) } : null,
      lethalPackages: fs ? fs.packages.map(p => ({ name: p.name, lethalPackageReady: r2(p.ready), parts: p.parts, sequence: p.sequence })) : [] };
  }

  const pol = {
    id: (base && base.id) || bot, seat, W, expert: true, softBan: true, base,
    knowledge: { bot, side: ctx.side, archetype: { colors: ctx.deck.colors, mono: ctx.deck.mono, maxLv: ctx.deck.maxLv, tags: ctx.tags }, env: K.env, applied: K.applied, skipped: K.skipped, features: K.feat, priors: K.prior,
      prunes: Object.fromEntries(Object.entries(K.prune).map(([k, v]) => [k, { on: v.on, ids: v.ids, params: v.params }])), fileFloor: floorDef, preserveDeduction: preserve, mulligan: mulPlan, problems: K.problems },
    score(R_) { return (base && base.score ? base.score(R_) : 0) + terms(R_, null); },
    parts(R_) { const out = []; if (base && base.score) { if (base.parts) out.push(...base.parts(R_)); else out.push({ cat: 'other', term: 'policy:base', v: base.score(R_) }); } terms(R_, out); return out; },
    moveBonus(R_, mv) { return (base && base.moveBonus ? base.moveBonus(R_, mv) : 0) + prior(R_, mv); },
    priorOf: prior, prune, pruneConf: id => { for (const v of Object.values(K.prune)) if (v.ids.includes(id)) return Math.min(1, v.conf); return 0; },
    ban: base && base.ban ? base.ban : undefined, lineBonus, mulAdjust, mulValue: base && base.mulValue, analyze, formationState,
    get lastMulligan() { return lastMul; },
    explain: base && base.explain ? base.explain : undefined,
  };
  return pol;
}
module.exports = { attach, BASE };
