// Tactical Layer (v1.6.0) — 기존 정책(PRO / Expert Knowledge Layer / 전문 봇) 위에 얹는 "기본기 규칙".
//   · 리살은 lethal.js 가 탐색보다 먼저 처리한다 (decide.js).  여기는 리살이 없을 때의 평상시 운영 규칙이다.
//   · 규칙은 스크립트가 아니다: ① 행동 필터(소프트 pruning: 뒤로 미룸, 루트는 탐색이 더 좋다고 확인하면 되돌림) ② 행동 정렬(moveBonus)
//     ③ 평가 항(FILE 6 보존·고코스트 제거 가치) ④ 미시 결정 보정(microAdj: MR 컷인·무의미한 가드) 으로만 들어간다.
//   · 규칙에 위배되는 "초보도 안 하는 수"는 소프트 pruning 으로 탐색 트리에서 빠지므로, 탐색 평가가 그런 수를 높게 보더라도 선택되지 않는다
//     (루트에서 탐색이 이득 > 1.5 + 4×확신 으로 확인할 때만 다시 허용).
//
//   규칙 ID (prune 근거):  tac:hint-below-file6  tac:use-excess-file  tac:play-before-end  tac:skip-after-hint  tac:contact-ap  tac:evid-attack-blocked
//                          tac:assist-useless  tac:partner-for-assist
'use strict';
const F = require('./facts.js'), LETH = require('./lethal.js'), MUL = require('./mulligan.js'), FEAT = require('../expert/features.js');
const { EV, S, FX, D, fcount } = F;

const FLOOR = 6;          // FILE 최소 보존선
const ID = { hint6: 'tac:hint-below-file6', excess: 'tac:use-excess-file', playEnd: 'tac:play-before-end', skip: 'tac:skip-after-hint', contact: 'tac:contact-ap', blocked: 'tac:evid-attack-blocked', assistNo: 'tac:assist-useless', partnerKeep: 'tac:partner-for-assist' };
const CONF = { [ID.hint6]: 1.6, [ID.excess]: 0.4, [ID.playEnd]: 0.3, [ID.skip]: 0.5, [ID.contact]: 0.5, [ID.blocked]: 0.4, [ID.assistNo]: 0.3, [ID.partnerKeep]: 0.3 };
const W = { file6: 2.0, fieldCost: 0.16, removal: 26, disable: 12, favContact: 18, favAttackEvid: 14, noCharsAttack: 20, hintBase: 14, assistBase: 10, defenderKeep: 8, mrCut: 14, futileGuard: 4 };
const r2 = x => Math.round(x * 100) / 100;

function attach(base, o = {}) {
  const seat = o.seat, opp = 1 - seat, flags = { lethal: true, file6: true, charEveryTurn: true, contact: true, partner: true, defense: true, mulligan: true, ...(o.flags || {}) };
  const memo = new WeakMap(); let lastMul = null;
  const ctxOf = R => { let c = memo.get(R); if (!c) { c = { j: new Map() }; memo.set(R, c); } return c; };

  // ── 공용 계산 (상태별 캐시) ───────────────────────────────────────────────
  const handPlayable = (R, id, f) => { const d = D(R, id); if (!S.okc(R, seat, d, id) || FX.nameBanned(R, seat, id) || !FX.useOk(R, seat, id)) return false; if (d.type !== 'char' && FX.pk(R, seat, 'noevent')) return false; return FX.lvOf(R, id) <= f; };
  const canDeployAfterHint = R => { const P = R.P[seat], f = fcount(R, seat) - 1; if (!P.file.length) return false; const cand = [...P.hand, P.file[P.file.length - 1]]; return cand.some(id => D(R, id).type === 'char' && handPlayable(R, id, f)); };
  const charPlayable = R => R.P[seat].hand.some(id => D(R, id).type === 'char' && !S.playCheck(R, seat, id));
  const fieldFull = R => R.P[seat].field.length >= FX.fieldMax(R, seat);
  const playSlotFree = R => !!R.fl.hw || (!R.fl.played && !R.fl.hint);
  const charPlayValue = (R, id) => { const d = D(R, id), t = S.tok(d), lv = FX.lvOf(R, id); return 1.2 + 0.45 * lv + (+d.ap || 0) / 5000 + (+d.lp || 0) * 0.3 + (t.rapid ? 0.5 : 0); };
  // 이번 턴 "내가 방어를 맡을" 캐릭터: 액티브 상태에서 상대의 모든 액티브 캐릭터보다 AP 가 높은 가장 강한 캐릭터
  function defenderOf(R) { const c = ctxOf(R); if (c.def !== undefined) return c.def; const oppA = F.activeChars(R, opp); let best = null, bap = -1;
    for (const id of F.activeChars(R, seat)) { if (FX.hasKwTk(R, id, 'cantguard')) continue; const a = F.apOf(R, id); if (a > bap) { bap = a; best = id; } }
    c.def = best != null && oppA.length && oppA.every(x => bap > F.apOf(R, x)) ? best : null; return c.def; }
  function partnerCalc(R) { const c = ctxOf(R); if (c.pc) return c.pc;
    const P = R.P[seat], X = FEAT.side(R, seat), Y = FEAT.side(R, opp), pa = FEAT.partnerAssist(R, X, Y, EV.W.ev), f = fcount(R, seat);
    let gain = 0, why = ''; if (playSlotFree(R)) { let now = 0, with1 = 0, withId = null; for (const id of P.hand) { const d = D(R, id); if (d.type !== 'char' || !S.okc(R, seat, d, id)) continue; const lv = FX.lvOf(R, id), v = charPlayValue(R, id); if (lv <= f) now = Math.max(now, v); else if (lv === f + 1) { if (v > with1) { with1 = v; withId = id; } } }
      if (withId != null) { gain = (with1 - now + (now === 0 ? 1.0 : 0)) * 1.6; why = `어시스트로 FILE ${f}→${f + 1}: ${D(R, withId).n} (Lv${FX.lvOf(R, withId)}) 등장 가능`; } }
    const av = Math.max(pa.available ? pa.assistValue : 0, gain), pdv = pa.available ? pa.partnerDeductionValue : 0;
    c.pc = { available: pa.available, assistValue: r2(av), partnerDeductionValue: r2(pdv), assistWhy: [...(pa.assistWhy || []), ...(why ? [why] : [])], slotFree: playSlotFree(R) }; return c.pc; }

  // ── 행동 하나의 전술 판단 ────────────────────────────────────────────────
  function judge(R, mv) {
    if (R.phase !== 'play' || mv.seat !== seat || R.turn !== seat) return null;
    const c = ctxOf(R), m = mv.m, key = mv.tag + '|' + [m.id, m.tid, m.who, m.i, m.rep].join(','); let r = c.j.get(key); if (r) return r;
    r = judge0(R, mv, m) || { tags: [], prune: null, bonus: 0, note: '' }; c.j.set(key, r); return r;
  }
  function judge0(R, mv, m) {
    const P = R.P[seat], O = R.P[opp], oppChars = O.field, f = P.file.length, ex = f - FLOOR;
    switch (mv.tag) {
      case 'hint': { if (!flags.file6) return null;
        if (f - 1 < FLOOR) return { tags: ['file6'], prune: ID.hint6, bonus: -30, note: `넥스트 힌트 후 FILE ${f - 1} < ${FLOOR}: 리살이 아니면 FILE 보존` };
        return { tags: ['file>6'], prune: null, bonus: W.hintBase + Math.min(6, (ex - 1) * 2), note: `FILE ${f} > ${FLOOR}: 초과분 ${ex}장 적극 사용 (힌트 후 ${f - 1})` }; }
      case 'end': { const t = [];
        if (flags.charEveryTurn && playSlotFree(R) && !R.fl.hw && !fieldFull(R) && charPlayable(R)) return { tags: ['no-play'], prune: ID.playEnd, bonus: -20, note: '낼 수 있는 캐릭터가 있는데 이번 턴에 한 장도 내지 않고 종료' };
        if (flags.file6 && ex > 0 && !R.fl.nh && !R.fl.hw && canDeployAfterHint(R)) return { tags: ['file>6'], prune: ID.excess, bonus: -12, note: `FILE ${f} > ${FLOOR} 인데 넥스트 힌트로 전개하지 않고 종료` };
        return null; }
      case 'skip': { if (!flags.file6) return null; if (R.P[seat].hand.some(id => handPlayable(R, id, fcount(R, seat)) && D(R, id).type === 'char')) return { tags: ['wasted-hint'], prune: ID.skip, bonus: -10, note: '넥스트 힌트로 FILE 을 썼는데 낼 수 있는 캐릭터를 내지 않고 스킵' }; return null; }
      case 'play': case 'ability': { const d = D(R, m.id), z = mv.tag === 'play' ? F.XP.playZones(d).z : F.XP.abilityZones(d, m.i).z, tags = []; let bonus = 0, note = '';
        if (oppChars.length && z.removal > 0) { bonus += W.removal; tags.push('effect-removal'); note = '효과로 상대 캐릭터 제거 (제거 우선순위 1: 효과 제거)'; }
        else if (oppChars.length && z.disable > 0) { bonus += W.disable; tags.push('effect-disable'); note = '효과로 상대 캐릭터 슬립/스턴'; }
        return tags.length ? { tags, prune: null, bonus, note } : null; }
      case 'atkc': { if (!flags.contact) return null;
        const a = m.id, t = m.tid, myCut = F.maxCutNoMR(R, seat, a), tk = S.tk(R, a), apA = F.apOf(R, a), targets = [t]; if (!tk.bullet) for (const g of F.guardersOf(R, opp)) if (g !== t) targets.push(g);
        let minMargin = Infinity, worst = null; for (const u of targets) { const diff = apA - F.apOf(R, u), oc = F.maxCutAny(R, opp, u), mg = diff + myCut - oc; if (mg < minMargin) { minMargin = mg; worst = { u, diff, oc }; } }
        const diffT = apA - F.apOf(R, t), tgtLv = FX.lvOf(R, t), info = `내 AP ${apA} vs ${D(R, t).n} AP ${F.apOf(R, t)} (차 ${diffT >= 0 ? '+' : ''}${diffT}), 내 컷인(MR 제외) +${myCut}, 상대 컷인 +${worst ? worst.oc : 0}`;
        if (minMargin >= 0) return { tags: ['contact-ok'], prune: null, bonus: W.favContact + (diffT >= 2000 ? 4 : 0) + tgtLv * 1.2, note: `유리한 AP 컨택 — ${info}`, ap: { diff: diffT, myCut, oppCut: worst ? worst.oc : 0, margin: minMargin } };
        return { tags: ['contact-bad'], prune: ID.contact, bonus: -15, note: `불리/애매한 컨택 — ${info} (필요: 내 AP ≥ 상대 AP + 2000, 또는 AP 차 +1000 & 컷인 +1000↑, 같은 AP & 컷인 +2000)`, ap: { diff: diffT, myCut, oppCut: worst ? worst.oc : 0, margin: minMargin } }; }
      case 'atkk': { if (!flags.contact) return null;
        const a = m.id, tk = S.tk(R, a), apA = F.apOf(R, a), myCut = F.maxCutNoMR(R, seat, a), gs = tk.bullet ? [] : F.guardersOf(R, opp);
        if (!gs.length) return { tags: ['evid-attack'], prune: null, bonus: W.favAttackEvid + (oppChars.length ? 0 : W.noCharsAttack - W.favAttackEvid), note: oppChars.length ? '상대 가드 가능 캐릭터 없음 → 증거 공격' : '상대 캐릭터 없음 → 상대 증거 적극 공격', ap: { blockers: 0 } };
        const blockers = gs.filter(g => F.apOf(R, g) + F.maxCutAny(R, opp, g) > apA + myCut);
        if (blockers.length) return { tags: ['attack-blocked'], prune: ID.blocked, bonus: -12, note: `상대 ${D(R, blockers[0]).n}(AP ${F.apOf(R, blockers[0])}) 가 가드로 막는다 — 내 AP ${apA} (+컷인 ${myCut}) 로는 의미 없는 공격`, ap: { blockers: blockers.length, myAp: apA, myCut } };
        return { tags: ['evid-attack'], prune: null, bonus: W.favAttackEvid, note: `상대 블로커 ${gs.length}장 모두 AP 열세 → 막아도 블로커가 리무브되는 공격`, ap: { blockers: 0, weakGuards: gs.length } }; }
      case 'reason': { if (m.who === 'p') { if (!flags.partner) return null; const pc = partnerCalc(R); if (!pc.available) return null;
          if (pc.slotFree && pc.assistValue >= pc.partnerDeductionValue + 1.2) return { tags: ['partner-assist-better'], prune: ID.partnerKeep, bonus: -8, note: `어시스트 가치 ${pc.assistValue} > 파트너 추리 ${pc.partnerDeductionValue}: 파트너는 어시스트로 (${pc.assistWhy.join(', ')})` };
          if (pc.assistValue < 0.8) return { tags: ['partner-reason'], prune: null, bonus: 10, note: `어시스트로 얻는 전개 가치 ${pc.assistValue} < 0.8 → 파트너는 추리 (${pc.partnerDeductionValue})` };
          return null; }
        const def = defenderOf(R); if (def != null && m.who === def) return { tags: ['defender'], prune: null, bonus: -W.defenderKeep, note: '내 최강 액티브 캐릭터는 상대 AP 를 모두 앞서므로 방어 담당으로 남겨 둔다' };
        if (def != null) return { tags: ['reason-over-attack'], prune: null, bonus: 6, note: '방어 담당 캐릭터가 있으므로 나머지는 추리를 적극 선택' };
        return O.evid.length ? null : { tags: ['reason'], prune: null, bonus: 8, note: '상대 증거가 없으니 추리' }; }
      case 'assist': { if (!flags.partner) return null; const pc = partnerCalc(R); if (!pc.available) return null;
        if (pc.assistValue < 0.8 && pc.assistValue <= pc.partnerDeductionValue) return { tags: ['assist-useless'], prune: ID.assistNo, bonus: -14, note: `어시스트로 얻는 가치 ${pc.assistValue} < 파트너 추리 ${pc.partnerDeductionValue}: 어시스트를 낭비하지 않고 추리` };
        return { tags: ['assist'], prune: null, bonus: W.assistBase + 2 * pc.assistValue, note: `어시스트 가치 ${pc.assistValue} (${pc.assistWhy.join(', ') || '-'}) vs 파트너 추리 ${pc.partnerDeductionValue}` }; }
      default: return null;
    }
  }

  // ── 평가 항 ──────────────────────────────────────────────────────────────
  const shortfall = (R, s) => Math.max(0, Math.min(FEAT.naturalFile(R, s), FLOOR) - R.P[s].file.length);
  function tparts(R) {
    if (R.phase !== 'play') return [];
    const out = [], lvSum = s => { let t = 0; for (const id of R.P[s].field) t += FX.lvOf(R, id); return t; };
    if (flags.file6) out.push({ cat: 'filePreservation', term: 'tactic:file6(FILE 6 미만으로 쓴 만큼)', v: -W.file6 * (shortfall(R, seat) - shortfall(R, opp)) });
    out.push({ cat: 'boardValue', term: 'tactic:fieldCost(고코스트 캐릭터 가치)', v: W.fieldCost * (lvSum(seat) - lvSum(opp)) });
    return out;
  }
  const tscore = R => { let v = 0; for (const x of tparts(R)) v += x.v; return v; };

  // ── 미시 결정 보정(내 컨택트/가드 선택): MR 컷인 금지에 가까운 강한 보존, 의미 없는 가드 회피 ─────────────
  function microAdj(R, mv) {
    if (!flags.defense) return 0;
    if (mv.tag === 'cin') { const id = mv.m.id; return F.isMR(R, id) ? -W.mrCut : 0; }
    if (mv.tag === 'guard' && R.sub && R.sub.type === 'guard' && mv.m.id != null) { const diff = F.apOf(R, R.sub.atk) - F.apOf(R, mv.m.id); return diff >= 2000 ? -W.futileGuard : 0; }
    return 0;
  }
  function microNote(R, mv) {
    if (mv.tag === 'cin') return F.isMR(R, mv.m.id) ? 'MR 카드는 컷인 비용으로 쓰지 않는다 (큰 손해)' : `컷인 +${F.cutValue(R, seat, mv.m.id, null)}`;
    if (mv.tag === 'guard' && R.sub && R.sub.type === 'guard') { if (mv.m.id == null) return '가드 안 함'; const diff = F.apOf(R, R.sub.atk) - F.apOf(R, mv.m.id); return `가드: 상대 공격 AP ${F.apOf(R, R.sub.atk)} vs 내 ${D(R, mv.m.id).n} AP ${F.apOf(R, mv.m.id)} (차 ${diff >= 0 ? '+' : ''}${diff}) — ${diff >= 2000 ? '2000 이상 불리: 의미 없는 가드' : '가드 고려 가능'}`; }
    return '';
  }

  const w = Object.create(base || {});
  Object.assign(w, {
    id: (base && base.id) || 'pro', seat, tacticsOn: true,
    score(R) { return (base && base.score ? base.score(R) : 0) + tscore(R); },
    parts(R) { const out = []; if (base && base.parts) out.push(...base.parts(R)); else if (base && base.score) out.push({ cat: 'other', term: 'policy:base', v: base.score(R) }); out.push(...tparts(R)); return out; },
    moveBonus(R, mv) { const b = base && base.moveBonus ? base.moveBonus(R, mv) : 0; const j = judge(R, mv); return b + (j ? j.bonus : 0); },
    prune(R, mv, moves) { const j = judge(R, mv); if (j && j.prune) return j.prune; return base && base.prune ? base.prune(R, mv, moves) : null; },
    pruneConf(id) { return CONF[id] != null ? CONF[id] : (base && base.pruneConf ? base.pruneConf(id) : 0); },
    microAdj,
    mulAdjust(R, s, rep) { if (s === seat && flags.mulligan) { const r = MUL.choose(R, s); lastMul = { rule: 'tactics', plan: r.plan, why: r.why, hand: r.hand, replace: r.replace.map(id => D(R, id).n) }; return r.replace; } return base && base.mulAdjust ? base.mulAdjust(R, s, rep) : rep; },
    mulMax: flags.mulligan ? 5 : 4,
    tactics: { flags, ID, CONF, FLOOR, judge, partnerCalc, microNote, defenderOf, tparts,
      lethal(R, opt, who) { return LETH.solve(R, who == null ? seat : who, opt); }, report: R => LETH.report(R, seat), shortfall },
  });
  Object.defineProperty(w, 'lastMulligan', { get() { return lastMul || (base && base.lastMulligan) || undefined; }, configurable: true });
  return w;
}
module.exports = { attach, ID, CONF, FLOOR, W };
