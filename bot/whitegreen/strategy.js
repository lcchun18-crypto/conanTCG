// WhiteGreenStrategy — 백녹이기기 전용 전략 레이어.
//   · 실제 게임(백녹이기기 모드)과 Claude 의 self-play 가 "같은 이 클래스"를 쓴다 (bot/decide.js 가 호출).
//   · 공통 룰 엔진/카드 효과는 그대로 사용하고, 전략은 "합법 후보 중 무엇을 고를지"만 정한다(후보 밖의 수 불가).
//   · 판단은 관측 상태(observe.js: 상대 비공개 정보·내 덱 순서 제거)에서만 한다.
//   · 결정 지점마다 훅(versions/*.js hooks)이 있고, 훅이 없거나 null 이면 기본 규칙(rulebot)이 결정한다.
//   · 모든 결정은 Decision Log 레코드(wg)로 남는다: 상태·가능한 행동·선택·이유·전략 요소.
const SIM = require('../simulate.js');
const RB = require('../rulebot.js');
const KN = require('./knowledge.js');
const OBS = require('./observe.js');
const VERS = require('./versions/index.js');
const { S, who, genMoves } = SIM;
const { D, FX } = S;
const { cardBase } = require('../evaluate.js');
const val = (R, id) => cardBase(R, id);
const nm = (R, id) => { try { return D(R, id).n; } catch (e) { return '?'; } };
const lvOf = (R, id) => { try { return FX.lvOf(R, id); } catch (e) { return 0; } };
const apOf = (R, id) => { try { return S.ap(R, id); } catch (e) { return 0; } };

function describe(R, mv) { const base = require('../decide.js').describe(R, mv);
  if (mv.tag === 'ans' && mv.m && Array.isArray(mv.m.v) && mv.m.v.length && mv.m.v.every(x => Number.isInteger(x) && R.cards && R.cards[x])) { try { const SV = require('../simulate.js').S; return '선택: ' + mv.m.v.map(x => SV.D(R, x).n + '(#' + x + ')').join(', '); } catch (e) {} }
  return base; }

// 결정 종류(로그/훅 슬롯 이름): 사람이 읽는 분류
function classify(R, d, mv) {
  const t = mv.tag, k = d.kind;
  if (k === 'mull') return 'mulligan';
  if (k === 'sub:guard') return 'guard';
  if (k === 'sub:contact') return t === 'cin' ? 'cutin' : t === 'dis' ? 'disguise' : 'cutin-pass';
  if (k === 'sub:mis') return 'misread';
  if (k === 'eff') { const q = R.eff && R.eff.req; const ab = R.eff && R.eff.it && R.eff.it.ab; return q && q.kind === 'pick' && ab && RB.removeFilters(ab).is ? 'removeTarget' : 'effect'; }
  switch (t) { case 'play': return 'play'; case 'assist': return 'assist'; case 'hint': return 'hint'; case 'skip': return 'hint-skip'; case 'ability': return 'declare';
    case 'atkc': return 'attack'; case 'atkk': return 'evidence-attack'; case 'reason': return 'reason'; case 'solve': return 'solve'; case 'end': return 'end'; default: return t || 'other'; }
}
const HOOK_OF = { mulligan: 'mulligan', play: 'play', assist: 'play', declare: 'declare', removeTarget: 'removeTarget', attack: 'attack', 'evidence-attack': 'evidence', reason: 'reason', hint: 'hint', cutin: 'cutin', 'cutin-pass': 'cutin', guard: 'guard', effect: 'eff' };

function seedFor(R, seat) { return ((R.n || 0) * 2654435761 + seat * 40503 + (R.P[seat].deck.length * 97) + (R.P[seat].hand.length * 13) + (R.P[1 - seat].field.length * 7)) >>> 0; }

// 공개 정보 기반 상태 요약 (손패는 "내" 손패만, 상대는 공개 정보만) — Decision Log 용
function stateOf(R, seat) {
  const P = R.P[seat], O = R.P[1 - seat], f = id => `${nm(R, id)}(${R.cards[id].st === 'a' ? '액티브' : R.cards[id].st === 's' ? '슬립' : '스턴'} Lv${lvOf(R, id)} AP${apOf(R, id)})`;
  const need = (() => { try { return +(D(R, P.kase).lv) || 0; } catch (e) { return 0; } })();
  return { turn: R.n, turnSeat: R.turn, phase: R.phase, first: R.first === seat,
    me: { file: P.file.length, pIn: !!P.pIn, hand: P.hand.map(id => `${nm(R, id)}(Lv${lvOf(R, id)})`), field: P.field.map(f), evidence: P.evid.length, deck: P.deck.length, rem: P.rem.length, partner: R.cards[P.partner] ? `${nm(R, P.partner)}(${P.pIn ? '파트너 에리어 밖' : '대기'})` : null, caseSolved: !!(R.cards[P.kase] && R.cards[P.kase].solved) },
    opp: { file: O.file.length, pIn: !!O.pIn, handCount: O.hand.length, field: O.field.map(f), evidence: O.evid.length, deck: O.deck.length, rem: O.rem.length } };
}
// 가능했던 주요 행동 (합법 후보 요약)
function candidatesOf(R, moves, chosen, cap = 24) {
  const seen = new Set(), out = [];
  for (const m of moves) { const dsc = describe(R, m); if (seen.has(dsc)) continue; seen.add(dsc); out.push({ desc: dsc, chosen: JSON.stringify(m.m) === JSON.stringify(chosen.m) ? true : undefined }); if (out.length >= cap) break; }
  return { total: moves.length, shown: out };
}
// 결정 시점의 전략 요소(판단에 쓴 사실들)
function factorsOf(R, seat, d, kind, moves) {
  const P = R.P[seat], O = R.P[1 - seat], F = {};
  if (d.kind === 'main' || d.kind === 'hint') {
    F.file = P.file.length; F.fileSpendable = Math.max(0, P.file.length - 6);   // 룰 스크립트: FILE 6 초과분은 넥스트 힌트로
    F.playedThisTurn = !!R.fl.played; F.hintUsed = !!(R.fl.hint || R.fl.nh); F.partnerActive = R.cards[P.partner] && R.cards[P.partner].st === 'a' && !P.pIn;
    const plays = moves.filter(m => m.tag === 'play').map(m => m.m.id); const uniq = [...new Set(plays)];
    F.playable = uniq.map(id => ({ name: nm(R, id), lv: lvOf(R, id), tags: KN.tagsText(R, id) })).sort((a, b) => b.lv - a.lv).slice(0, 6);
    F.handRoles = P.hand.map(id => ({ name: nm(R, id), lv: lvOf(R, id), tags: KN.tagsText(R, id) }));
    F.myActive = P.field.filter(id => R.cards[id].st === 'a').map(id => `${nm(R, id)}(AP${apOf(R, id)})`);
    F.oppActive = O.field.filter(id => R.cards[id].st === 'a').map(id => `${nm(R, id)}(AP${apOf(R, id)})`);
    F.oppEvidence = O.evid.length; F.myEvidence = P.evid.length;
    const top = F.playable[0], same = top ? F.playable.filter(x => x.lv === top.lv).length : 0; if (same > 1) F.tie = `최고 레벨(Lv${top.lv}) 카드가 ${same}종 — 기본 규칙의 동률 처리(제거 효과 > 캐릭터 > 카드 가치)로 선택`;
  } else if (d.kind === 'sub:guard') { const u = R.sub; F.attacker = `${nm(R, u.atk)}(AP${apOf(R, u.atk)})`; F.myActive = P.field.filter(id => R.cards[id].st === 'a').map(id => `${nm(R, id)}(AP${apOf(R, id)})`); }
  else if (d.kind === 'sub:contact') { const u = R.sub, side = R.cards[u.atk].o === seat ? 'atk' : 'def'; F.mySide = side === 'atk' ? '공격' : '방어'; F.myAp = apOf(R, u[side]); F.oppAp = apOf(R, side === 'atk' ? u.def : u.atk); F.oppUsedCut = !!(u.used && u.used[1 - seat]); F.cutinsInHand = P.hand.filter(id => KN.rolesOf(R, id).includes('cutin')).map(id => nm(R, id)); }
  else if (d.kind === 'mull') { F.hand = P.hand.map(id => ({ name: nm(R, id), lv: lvOf(R, id), tags: KN.tagsText(R, id) })); F.first = R.first === seat; }
  else if (d.kind === 'eff') { const q = R.eff && R.eff.req; F.request = q ? `${q.kind}: ${String(q.msg || '').slice(0, 80)}` : ''; F.source = R.eff && R.eff.it && R.eff.it.src != null ? nm(R, R.eff.it.src) : ''; }
  return F;
}

class WhiteGreenStrategy {
  constructor(opt = {}) { this.version = VERS.get(opt.version); if (!this.version) throw new Error('알 수 없는 WG 전략 버전: ' + opt.version); this.label = this.version.label; this.hooks = this.version.hooks || {}; this.mem = {}; }
  // 진입점 (decide.js / self-play 공통).  반환: { mv, rule, why, notes, wg } 또는 { err }
  choose(R, seat, opt = {}) {
    const d = who(R); if (!d || d.seat !== seat) return { err: 'not my decision' };
    const Rv = OBS.observe(R, seat, seedFor(R, seat));   // 비공개 정보를 지운 관측 상태
    const moves = d.kind === 'mull' ? [] : genMoves(Rv, val);
    let res = null, hookName = null, hookErr = null;
    // 훅 시도: 결정 후보 종류는 "기본 규칙이 고를 수의 종류" 와 같다 → 먼저 기본 규칙으로 종류를 알아낸 뒤 해당 슬롯 훅이 있으면 덮어쓸 기회를 준다
    const base = RB.choose(Rv, seat, { lethal: opt.lethal, lethalMs: opt.lethalMs, lethalNodes: opt.lethalNodes });
    if (base.err) return base; res = base;
    const kind0 = classify(Rv, d, base.mv), slot = HOOK_OF[kind0], hook = slot && this.hooks[slot];
    const kslot = d.kind === 'main' || d.kind === 'hint' ? 'main' : d.kind === 'sub:contact' ? 'contact' : d.kind === 'sub:mis' ? 'misread' : null, mainHook = kslot && this.hooks[kslot], hk = typeof mainHook === 'function' ? { f: mainHook, slot: kslot } : null;
    for (const cand of [hk, typeof hook === 'function' ? { f: hook, slot } : null]) { if (!cand || hookName) continue; const hook = cand.f, slot = cand.slot;
      try { const h = hook({ R: Rv, seat, d, moves, base, kind: kind0, mem: this.mem, helpers: { nm, lvOf, apOf, val, describe: m => describe(Rv, m), KN } });
        if (h && h.mv) { const legal = moves.length ? moves.find(m => JSON.stringify(m.m) === JSON.stringify(h.mv.m)) : (d.kind === 'mull' ? h.mv : null);
          if (legal) { res = { mv: legal, rule: h.rule || 'wg', why: h.why || '', notes: h.notes, factors: h.factors }; hookName = slot; } else hookErr = '훅이 후보 밖의 수를 돌려줌 → 무시'; } }
      catch (e) { hookErr = '훅 오류 → 무시: ' + (e && e.message); } }
    const mv = res.mv, kind = classify(Rv, d, mv);
    const wg = { ai: 'WhiteGreenStrategy', version: this.version.id, label: this.label, seat, kind, decisionKind: d.kind, state: stateOf(Rv, seat),
      candidates: d.kind === 'mull' ? { total: 5, shown: [{ desc: '교체 없음' }, { desc: '1~4장 교체' }] } : candidatesOf(Rv, moves, mv),
      chosen: describe(Rv, mv), rule: res.rule, why: res.why, notes: res.notes && res.notes.length ? res.notes : undefined, hook: hookName || undefined, hookError: hookErr || undefined,
      factors: { ...factorsOf(Rv, seat, d, kind, moves), ...(res.factors || {}) }, involved: involvedCards(Rv, mv) };
    if (kind === 'mulligan') wg.mulligan = { replace: (mv.m.ids || []).map(id => nm(Rv, id)), keep: R.P[seat].hand.filter(id => !(mv.m.ids || []).includes(id)).map(id => nm(Rv, id)) };
    return { mv, rule: res.rule, why: res.why, notes: res.notes, wg };
  }
}
function involvedCards(R, mv) { const m = mv.m, ids = [m.id, m.tid, m.rep].filter(x => x != null && R.cards[x]); return [...new Set(ids)].map(id => ({ name: nm(R, id), lv: lvOf(R, id), tags: KN.tagsText(R, id) })); }

module.exports = { WhiteGreenStrategy, classify, stateOf, VERS };
