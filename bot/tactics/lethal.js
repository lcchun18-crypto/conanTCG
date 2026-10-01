// 리살(Lethal) solver — 매 턴, 그리고 내 메인 행동 때마다 "일반 탐색보다 먼저" 이번 턴 승리 시퀀스가 있는지 정확하게 찾는다.
//
//  report(R,seat)  빠른 해석 (탐색 없음): 사용자가 정한 1-A/1-B/1-C/1-D 계산 그대로 — 사설 계산이라 로그/가짜 리살 판별에 쓴다.
//     1-A 추리만:      증거 + (이번 턴 추리 가능한 현장 캐릭터 LP) + (손에서 등장 직후 추리 가능한 신속 캐릭터 LP)
//     1-B 공격 포함:   1-A + 사건 공격으로 빼앗을 수 있는 증거 (공격 가능한 캐릭터 수 − 상대 가드 가능 캐릭터 수, 상대 증거 수 이하)
//     1-C 블로커 제거: 효과(제거/슬립)로 상대 가드 가능 캐릭터를 줄인 뒤의 1-B
//     1-D FILE 포함:   손에서 낼 캐릭터는 FILE 레벨 조건·넥스트 힌트 횟수·여러 장의 합계 비용까지 계산해 "실제로 낼 수 있는 조합"만 인정
//  solve(R,seat)   정확한 AND-OR 탐색: 내 행동(OR: 하나라도 승리) × 상대의 응수(AND: 모든 가드/컷인/변장/미스리드에서 승리).
//     엔진의 act()/dispatch 로만 상태를 바꾸므로(복제본 위) 규칙상 불가능한 행동은 절대 나오지 않는다 — FILE 부족·액티브 아닌 파트너·등장한 턴 추리 불가 등이 자동으로 걸러진다.
//     해결 조건(해결편 + 액티브 파트너 + 증거 ≥ 사건 레벨, 같은 턴 어시스트 불가)이 안 되면 탐색하지 않는다. 상한(optimistic bound)이 모자라면 탐색하지 않는다.
'use strict';
const F = require('./facts.js');
const { SIM, EV, S, FX, D, fcount } = F;
const { who, genMoves, clone, cloneable, determinize, Node, isMainKind } = SIM;
const val = (R, id) => EV.cardBase(R, id);
class OutOfBudget extends Error {}
const OUT = new OutOfBudget('lethal budget');
const num = x => +x || 0;

// 손에서 낼 수 있는 캐릭터 후보 (FILE 레벨 조건은 따로 본다)
function handChars(R, seat) {
  const P = R.P[seat], out = [];
  for (const id of P.hand) { const d = D(R, id); if (d.type !== 'char') continue;
    if (!S.okc(R, seat, d, id) || FX.nameBanned(R, seat, id) || !FX.useOk(R, seat, id)) continue;
    const t = S.tok(d); out.push({ id, lv: FX.lvOf(R, id), lp: Math.max(0, num(d.lp)), rapid: !!t.rapid, asE: !!t.asE, asC: !!t.asC, ap: num(d.ap) }); }
  return out;
}
// 손에서 낼 조합 선택(1-D): 각 캐릭터를 내는 시점의 FILE 로 레벨 조건을 만족해야 하고, 두 번째부터는 넥스트 힌트(FILE −1)가 필요하다.
function bestHandPlan(R, seat, score, ignoreFile) {
  const P = R.P[seat], items = handChars(R, seat).filter(x => score(x) > 0); if (!items.length) return { value: 0, picks: [], order: [] };
  const f0 = fcount(R, seat), baseHints = R.fl && !R.fl.hw && (R.fl.played || R.fl.hint) ? 1 : 0, maxH = P.file.length; let best = { value: 0, picks: [], order: [] };
  const n = Math.min(items.length, 8);
  for (let mask = 1; mask < (1 << n); mask++) {
    const sub = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(items[i]);
    sub.sort((a, b) => b.lv - a.lv); let ok = true, hints = 0;
    if (!ignoreFile) for (let i = 0; i < sub.length; i++) { const need = i + baseHints; hints = Math.max(hints, need); if (need > maxH || sub[i].lv > f0 - need) { ok = false; break; } }
    if (!ok) continue; const v = sub.reduce((t, x) => t + score(x), 0);
    if (v > best.value || (v === best.value && sub.length < best.picks.length)) best = { value: v, picks: sub.map(x => x.id), order: sub.map(x => x.id), hints: ignoreFile ? 0 : hints };
  }
  return best;
}
// 상대 가드 가능 캐릭터를 줄일 수 있는 손패 카드(제거/슬립 효과) 수
function removersInHand(R, seat) { let n = 0; const P = R.P[seat]; for (const id of P.hand) { const d = D(R, id), z = F.XP.playZones(d).z, h = EV.hstat ? EV.hstat(R, seat, id) : { ok: true, lv: FX.lvOf(R, id) }; if ((z.removal > 0 || z.disable > 0) && S.okc(R, seat, d, id) && FX.lvOf(R, id) <= fcount(R, seat)) n += Math.max(1, Math.min(2, z.removal + z.disable)); } return n; }

function report(R, seat) {
  const P = R.P[seat], O = R.P[1 - seat], st = F.solveState(R, seat), r = { seat, need: st.need, solved: st.solved, partnerReady: st.partnerReady, evid: st.evid, fileNow: st.fc, oppEvid: O.evid.length };
  // 이번 턴 현장에서 추리/공격할 수 있는 캐릭터
  let fieldLP = 0; const reasoners = [], atkOnly = []; for (const id of P.field) { const lp = F.lpOf(R, id); if (F.canReason(R, id) && lp > 0) { fieldLP += lp; reasoners.push({ id, lp }); } else if (F.canActCase(R, id)) atkOnly.push(id); }
  r.fieldLP = fieldLP; r.fieldReasoners = reasoners; r.fieldAttackers = atkOnly.length;
  const planA = bestHandPlan(R, seat, x => x.rapid ? x.lp : 0, false), planANoFile = bestHandPlan(R, seat, x => x.rapid ? x.lp : 0, true);
  r.handLP = planA.value; r.handPlan = planA.picks.map(id => F.nm(R, id)); r.handHints = planA.hints || 0;
  const guarders = F.guardersOf(R, 1 - seat).length, removers = removersInHand(R, seat);
  r.oppBlockers = guarders; r.removalsInHand = removers;
  // 공격 슬롯: LP 0 현장 캐릭터 + 손에서 내서 바로 공격 가능한(신속/돌격-사건) LP 0 캐릭터
  const planB = bestHandPlan(R, seat, x => (x.rapid ? Math.max(x.lp, 1) : 0) + (!x.rapid && x.asE ? 1 : 0), false);
  let atkSlots = atkOnly.length; for (const id of planB.picks) { const x = handChars(R, seat).find(y => y.id === id); if (x && (!x.rapid || x.lp === 0) && (x.rapid || x.asE)) atkSlots++; }
  const hand2 = planB.value;   // 신속+LP / 돌격 슬롯 가치 (대략)
  r.A = st.evid + fieldLP + planA.value;
  r.attackSlots = atkSlots; r.steals = Math.max(0, Math.min(O.evid.length, atkSlots - guarders)); r.stealsAfterRemoval = Math.max(0, Math.min(O.evid.length, atkSlots - Math.max(0, guarders - removers)));
  r.B = r.A + r.steals; r.C = r.A + r.stealsAfterRemoval;
  r.A_noFile = st.evid + fieldLP + planANoFile.value;
  r.fileLimited = planANoFile.value > planA.value;   // FILE 때문에 못 내는 신속 캐릭터가 있다
  r.verdict = { A: r.A >= st.need, B: r.B >= st.need, C: r.C >= st.need, A_ifFileFree: r.A_noFile >= st.need };
  r.state = !st.solved ? '사건이 해결편이 아님(이번 턴 어시스트로 해결편이 되어도 같은 턴 해결 불가)' : !st.partnerReady ? '파트너가 액티브가 아님/어시스트함' : 'ok';
  r.hand2 = hand2;
  return r;
}
// 최적 상한(optimistic): 어떤 탐색보다 크거나 같다 — 이 값이 필요 증거에 못 미치면 정확한 탐색은 시간 낭비
function potential(R, seat) {
  const P = R.P[seat]; let pot = P.evid.length, slack = 0; const pool = [];
  for (const id of P.field) { pot += Math.max(1, F.lpOf(R, id)); slack += F.fxFlags(D(R, id)).evid; if (F.fxFlags(D(R, id)).wake) slack += Math.max(1, F.lpOf(R, id)); }
  for (const id of [...P.hand, ...P.file]) { const d = D(R, id), fl = F.fxFlags(d); slack += fl.evid; if (fl.wake) slack += 1; if (d.type === 'char') pool.push(Math.max(1, num(d.lp))); }
  for (const id of [P.partner, P.kase, ...P.pa]) if (id != null) slack += F.fxFlags(D(R, id)).evid;
  pool.sort((a, b) => b - a); const plays = 1 + Math.min(P.file.length, 6); for (let i = 0; i < Math.min(plays, pool.length); i++) pot += pool[i];
  return pot + slack;
}
const anySolveFx = (R, seat) => { const P = R.P[seat]; for (const id of [...P.hand, ...P.field, P.partner, P.kase, ...P.pa, ...P.file.filter(x => R.cards[x].up)]) if (id != null && F.fxFlags(D(R, id)).solve) return true; return false; };

// 리살 탐색용 행동 필터/정렬: 승리와 무관한 행동(턴 종료·어시스트·파트너 추리 …)은 처음부터 후보에서 뺀다
function lethalMoves(R, seat, moves) {
  const P = R.P[seat], out = [];
  for (const m of moves) {
    let s = null;
    switch (m.tag) {
      case 'solve': s = 1e6; break;
      case 'reason': if (m.m.who === 'p') break; s = 200 + F.lpOf(R, m.m.who) * 10; break;
      case 'atkk': s = 150; break;
      case 'atkc': { const t = R.cards[m.m.tid]; if (t && t.st === 'a') s = 90; break; }   // 액티브(블로커)를 직접 지정해 제거할 수 있는 경우만
      case 'play': { const d = D(R, m.m.id), t = S.tok(d), z = F.XP.playZones(d).z; if (d.type === 'char') s = (t.rapid ? 120 + num(d.lp) * 5 : t.asE ? 100 : 60) + (z.removal || z.disable ? 15 : 0) + (z.evid ? 15 : 0); else s = (z.evid ? 110 : 0) + (z.removal || z.disable ? 95 : 40); break; }
      case 'ability': s = 80; break;
      case 'hint': s = 20; break;
      case 'skip': s = 5; break;
      default: break;   // assist / end / pass …
    }
    if (s != null) out.push([s, m]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}
const oppOrder = ms => ms.slice().sort((a, b) => { const w = m => m.tag === 'noguard' || m.tag === 'pass' ? 1 : 0; return w(a) - w(b); });   // 막으려는 응수를 먼저 시험(빨리 실패)

function classify(R, line) {
  const tags = line.map(x => x.tag), has = t => tags.includes(t), P = R.P[R.turn];
  if (has('atkk')) { const pre = line.slice(0, line.findIndex(x => x.tag === 'atkk')); const removed = pre.some(x => x.tag === 'ability' || x.tag === 'atkc' || (x.tag === 'play' && (x.rem || x.dis)));
    return removed ? '1-C 블로커 제거 후 공격 리살' : '1-B 상대 증거 공격 + 추리 리살'; }
  if (line.some(x => x.rem || x.dis || x.tag === 'ability')) return '1-C 블로커 제거 후 공격 리살';
  if (line.some(x => x.tag === 'play')) return '1-A 등장 + 추리 리살';
  return '1-A 추리만으로 리살';
}

function solve(R, seat, opt = {}) {
  const t0 = Date.now(), deadline = t0 + (opt.ms || 700), maxN = opt.nodes || 3500, depthMax = opt.depth || 14;
  const out = { found: false, nodes: 0, ms: 0, skipped: null, report: null, line: [], kind: null, mv: null, fake: null };
  try { out.report = report(R, seat); } catch (e) { out.skipped = 'report-error:' + (e && e.message); return out; }
  const rep = out.report;
  if (R.phase !== 'play') { out.skipped = 'not-playing'; return out; }
  const d = who(R); if (!d || d.seat !== seat || !isMainKind(d.kind)) { out.skipped = '내 메인 결정이 아님'; return out; }
  const solveFx = anySolveFx(R, seat);
  if (!rep.solved && !solveFx) { out.skipped = rep.state; return out; }
  if (!rep.partnerReady && !solveFx) { out.skipped = rep.state; return out; }
  const pot = potential(R, seat); out.potential = pot; if (pot < rep.need) { out.skipped = `상한 ${pot} < 필요 증거 ${rep.need}`; return out; }
  if (!cloneable(R)) { out.skipped = '복제 불가 상태'; return out; }
  const root = Node.root(determinize(clone(R), ((R.n || 0) * 2654435761 + seat * 97 + R.P[seat].deck.length) >>> 0));
  const memo = new Map(), bestMove = new Map(); let nodes = 0;
  const check = () => { if (++nodes > maxN || ((nodes & 15) === 0 && Date.now() > deadline)) throw OUT; };
  function win(node, Rr, depth) {
    if (Rr.phase === 'over') return Rr.winner === seat;
    if (depth <= 0) return false;
    const dd = who(Rr); if (!dd) return false; const mine = dd.seat === seat, mainish = isMainKind(dd.kind);
    if (mainish && !mine) return false;                                  // 턴이 상대에게 넘어감 = 이번 턴 리살 실패
    let key = null;
    if (mainish) { key = node.key; const h = memo.get(key); if (h && (h.r || h.depth >= depth)) return h.r; if (potential(Rr, seat) < rep.need) { memo.set(key, { r: false, depth: 99 }); return false; } }
    let moves = genMoves(Rr, val); if (mainish) moves = lethalMoves(Rr, seat, moves); else { if (moves.length > 28) moves = moves.slice(0, 28); if (!mine) moves = oppOrder(moves); }
    let res = mine ? false : true, any = false, first = null;
    for (const mv of moves) {
      check(); const c = node.child(mv); if (c.err) continue; any = true;
      const r = win(c.node, c.pending || c.node.R, depth - 1);
      if (mine) { if (r) { res = true; first = mv; break; } } else if (!r) { res = false; break; }
    }
    if (!any) res = false;
    if (mainish) { memo.set(key, { r: res, depth }); if (res && first) bestMove.set(key, first); }
    return res;
  }
  try {
    // 루트: 첫 행동을 직접 순회 (어떤 행동으로 시작하는 승리 라인인지 알아야 하므로)
    const moves = lethalMoves(R, seat, genMoves(R, val)); let first = null;
    if (potential(R, seat) >= rep.need) for (const mv of moves) { check(); const cc = root.child(mv); if (cc.err) continue; if (win(cc.node, cc.pending || cc.node.R, depthMax - 1)) { first = mv; break; } }
    if (first) {
      // 설명용 라인 복원: 내 행동은 증명된 최선 수, 상대 응수는 첫 합법 응수를 따라간다 (로그/테스트 표시용)
      const line = []; let node = root, Rr = root.R, mv = first, guard = 0;
      while (mv && guard++ < 30) {
        const z = mv.tag === 'play' ? F.XP.playZones(D(Rr, mv.m.id)).z : mv.tag === 'ability' ? F.XP.abilityZones(D(Rr, mv.m.id), mv.m.i).z : null;
        line.push({ tag: mv.tag, m: mv.m, rem: !!(z && z.removal), dis: !!(z && z.disable), desc: require('../decide.js').describe(Rr, mv) });
        const c = node.child(mv); if (c.err) break; node = c.node; Rr = c.pending || c.node.R;
        let g2 = 0; while (Rr.phase !== 'over' && who(Rr) && !isMainKind(who(Rr).kind) && g2++ < 12) { const ms = genMoves(Rr, val); let nx = null; for (const m2 of (who(Rr).seat === seat ? ms : oppOrder(ms))) { const c2 = node.child(m2); if (!c2.err) { nx = c2; break; } } if (!nx) break; node = nx.node; Rr = nx.pending || nx.node.R; }
        if (Rr.phase === 'over') break; const d2 = who(Rr); if (!d2 || d2.seat !== seat || !isMainKind(d2.kind)) break;
        mv = bestMove.get(node.key) || null;
      }
      out.found = true; out.mv = first; out.line = line; out.kind = classify(R, line);
    }
  } catch (e) { if (e !== OUT) throw e; out.skipped = '탐색 예산 소진(리살 없음으로 간주하고 일반 탐색 진행)'; out.budget = true; }
  out.nodes = nodes; out.ms = Date.now() - t0;
  if (!out.found && (rep.verdict.B || rep.verdict.C || rep.verdict.A || (rep.fileLimited && rep.verdict.A_ifFileFree)) && !out.budget) out.fake = rep.fileLimited && rep.verdict.A_ifFileFree && !rep.verdict.A ? 'FILE 부족: 손의 신속 캐릭터를 FILE/힌트 비용상 다 낼 수 없어 가짜 리살' : '단순 계산으로는 리살이지만 상대 가드/컷인 또는 규칙상 불가능한 가짜 리살';
  return out;
}
module.exports = { solve, report, potential, lethalMoves, bestHandPlan, classify };
