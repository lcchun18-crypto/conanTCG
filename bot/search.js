// 탐색 엔진: "턴 전체 계획"(매크로 행동 빔 서치 + 반복 심화) + "상대 반응 정확 계산"(컨택트/가드/미스리드 minimax) + "상대 다음 턴 반격 검증".
//
//  · 매크로 행동 = 메인 페이즈에서 내가 고른 행동 1개 + 그로 인해 생기는 모든 응답(상대의 가드/컷인/변장/미스리드, 효과 선택창)을 끝까지 해결한 결과.
//    → 노드는 항상 "내 메인 페이즈의 안정 상태"이고, 공격 하나가 곧 [공격 → 상대 가드 → 컨택트 컷인 공방 → AP 판정 → 효과] 전체의 정확한 minimax 결과다.
//  · 상대는 손패가 공개(Perfect Information)이므로 "막을 수 있는가"를 추정이 아니라 실제 가능한 응수 전체를 탐색해 계산한다.
//  · 전치표(상태 해시), 평가 캐시, 미시 탐색 메모, 행동 정렬/가지치기, 즉시 승리(lethal) 우선 탐색을 사용한다.
const SIM = require('./simulate.js');
const EV = require('./evaluate.js');
const { S, Node, who, genMoves, clone, cloneable, stateKey } = SIM;
const { D, fcount } = S;
const { evaluate, WIN, cardBase } = EV;

class Timeout extends Error {}
const T_OUT = new Timeout('timeout');
const val = (R, id) => cardBase(R, id);

// 행동 정렬용 우선순위 (큰 값 먼저). 상태를 바꾸지 않고 싸게 계산.
function priority(R, mv, pol) { const b = priorityBase(R, mv); return pol && pol.moveBonus && mv.seat === pol.seat ? b + pol.moveBonus(R, mv) : b; }
function priorityBase(R, mv) {
  const seat = mv.seat, P = R.P[seat], O = R.P[1 - seat], m = mv.m;
  switch (mv.tag) {
    case 'solve': return 1e6;
    case 'assist': return fcount(R, seat) + 1 >= 7 && !R.cards[P.kase].solved ? 60 : 4;
    case 'reason': { const lp = m.who === 'p' ? (+D(R, P.partner).lp || 0) : S.lpOf(R, m.who); return 10 + lp * 6; }
    case 'atkk': return 12 + O.evid.length * 2;
    case 'atkc': { const a = S.ap(R, m.id), t = S.ap(R, m.tid), hc = O.hand.some(x => S.FX.hasCut(R, x) || S.tok(D(R, x)).cut); return (a >= t ? 16 + EV.charValue(R, 1 - seat, m.tid) * 2 : 3) - (hc ? 3 : 0); }
    case 'play': return 14 + EV.handValue(R, seat, m.id) * 3;
    case 'hint': return 8;
    case 'ability': return 11;
    case 'skip': return 1;
    case 'end': return -1;
    default: return 5;
  }
}

class Searcher {
  constructor(o = {}) {
    this.deadline = o.deadline || Infinity; this.maxNodes = o.maxNodes || Infinity; this.nodes = 0; this.tick = 0;
    this.memo = o.memo || new Map(); this.replyCache = o.replyCache || new Map(); this.evalCache = new Map();
    this.microDepth = o.microDepth || 9; this.stats = { macro: 0, micro: 0, hits: 0, iters: 0, replies: 0 };
    this.seedBase = o.seed || 12345; this.policy = o.policy || null; // 전문 봇 정책(없으면 범용 Expert)
  }
  check() { if ((++this.tick & 31) === 0 && Date.now() > this.deadline) throw T_OUT; if (this.nodes > this.maxNodes) throw T_OUT; }
  ev(R, me) { return evaluate(R, me, this.policy); }

  // ── 미시 탐색: 결정 주체가 "내 메인이 아닌" 모든 상황(가드/컨택트/미스리드/효과 선택)의 정확한 minimax. 값은 항상 me 기준.
  micro(node, R, me, depth) {
    this.check();
    if (R.phase === 'over') return { v: this.ev(R, me) };
    const d = who(R); if (!d || d.kind === 'main') return { v: this.ev(R, me) };
    if (depth <= 0) return { v: this.ev(R, me) };
    const mk = node.key + '|' + me + '|' + depth; const hit = this.memo.get(mk); if (hit) { this.stats.hits++; return hit; }
    this.stats.micro++; this.nodes++;
    let moves = genMoves(R, val); if (moves.length > 28) moves = moves.slice(0, 28);
    const maxi = d.seat === me; let best = null;
    for (const mv of moves) {
      const c = node.child(mv); if (c.err) continue;
      const r = this.micro(c.node, c.pending || c.node.R, me, depth - 1);
      let v = r.v; if (maxi && this.policy && this.policy.microAdj) v += this.policy.microAdj(R, mv);   // v1.6.0 Tactical: MR 컷인·무의미한 가드 보정 (내 선택에만)
      if (best === null || (maxi ? v > best.v : v < best.v)) best = { v, mv };
    }
    if (!best) best = { v: this.ev(R, me), mv: moves[0] };
    if (this.memo.size > 80000) this.memo.clear();
    this.memo.set(mk, best); return best;
  }
  // 행동 적용 후 "다음 내 메인 안정 상태(또는 종료/턴 교체)"까지 주체별 최선 응수로 진행. 지나간 응수를 기록한다.
  settle(node, R, me) {
    const resp = []; let guard = 0;
    while (guard++ < 60) {
      if (R.phase === 'over') break; const d = who(R); if (!d || d.kind === 'main') break;
      const r = this.micro(node, R, me, this.microDepth); if (!r.mv) break;
      const c = node.child(r.mv); if (c.err) { // 드물게: 메모된 수가 거부되면 다른 수를 순서대로 시도
        let ok = false; for (const mv of genMoves(R, val)) { const c2 = node.child(mv); if (!c2.err) { resp.push(mv); node = c2.node; R = c2.pending || c2.node.R; ok = true; break; } } if (!ok) break; continue; }
      resp.push(r.mv); node = c.node; R = c.pending || c.node.R;
    }
    return { node, R, resp };
  }

  // ── 턴 계획: 내 메인 안정 상태 root 에서 "턴이 끝날 때까지의 행동열" 중 최선을 찾는다 (반복 심화: 빔 폭 확대)
  //  cfg.rootFilter(mv): 첫 행동을 제한 (전문가 회귀 케이스: "후보 A 로 시작하는 최선 라인"의 값)
  //  v1.5.0 소프트 pruning(정책 prune, Expert Knowledge): 루트에서 미룬 행동은 두 번째 반복 뒤 같은 예산으로 따로 탐색해, 최선보다 OVERRIDE 이상 좋으면 다시 허용한다(탐색이 지식을 이긴다).
  planTurn(rootR, me, cfg = {}) {
    const root = Node.root(rootR, this.seedBase), iters = cfg.iters || [{ W: 3, cap: 8, K: 2 }, { W: 6, cap: 14, K: 3 }, { W: 14, cap: 26, K: 4 }, { W: 30, cap: 48, K: 5 }, { W: 60, cap: 80, K: 6 }, { W: 120, cap: 120, K: 8 }, { W: 240, cap: 160, K: 10 }];
    const res = { best: null, iters: [], win: false, pruned: [], overrides: [] }; const t0 = Date.now(); const allow = new Set(); cfg = { ...cfg, allowRoot: allow };
    for (let i = 0; i < iters.length; i++) { const it = iters[i];
      try { const r = this.iteration(root, rootR, me, it, cfg); this.stats.iters++; res.iters.push({ W: it.W, cap: it.cap, ms: Date.now() - t0, value: r.best && r.best.value, nodes: this.nodes });
        if (r.best) { res.best = r.best; res.cands = r.cands; } res.rootCut = r.rootCut; if (r.best && r.best.win) { res.win = true; break; } if (cfg.singleIter) break;
        if ((i === 1 || (i === 0 && iters.length === 1)) && r.rootCut && r.rootCut.length && !cfg.noOverride && r.best) this.overrideCheck(root, rootR, me, it, cfg, r, res, allow); }
      catch (e) { if (e !== T_OUT) throw e; res.timedOut = true; break; }
    }
    if (!res.best && !cfg.prefix && !cfg.rootFilter) { // 시간/노드가 첫 반복도 끝내기 전에 소진된 경우: 탐욕(1수씩 정적 평가) 계획으로 반드시 "쓸 만한 턴"을 만든다 (아무것도 안 하고 턴을 넘기지 않도록)
      const g = new Searcher({ memo: this.memo, seed: this.seedBase, microDepth: 4, policy: this.policy }); res.best = g.greedy(root, rootR, me); res.fallback = 'greedy'; }
    res.nodes = this.nodes; res.stats = this.stats; res.ms = Date.now() - t0; return res;
  }
  // 소프트 pruning 으로 미룬 루트 행동을 같은 반복 설정으로 따로 탐색 → 최선보다 (OVERRIDE + 4×지식 confidence) 이상 좋으면 다시 허용(이후 반복에서 정상 경쟁)
  overrideCheck(root, rootR, me, it, cfg, r, res, allow) {
    const OVERRIDE = cfg.overrideMargin != null ? cfg.overrideMargin : 1.5, seenSig = new Set();
    for (const c of r.rootCut) { const sig = JSON.stringify(c.mv.m); if (seenSig.has(sig) || allow.has(sig)) continue; seenSig.add(sig); if (seenSig.size > 3) break;
      const x = this.iteration(root, rootR, me, it, { ...cfg, rootFilter: m => JSON.stringify(m.m) === sig, noOverride: true });
      const v = x.best ? x.best.value : null, gain = v == null ? null : v - r.best.value, need = OVERRIDE + (this.policy && this.policy.pruneConf ? this.policy.pruneConf(c.why) * 4 : 0);   // 확신이 큰 지식일수록 뒤집으려면 더 큰 차이가 필요
      res.pruned.push({ mv: c.mv, why: c.why, value: v, best: r.best.value, gain, need });
      if (x.best && (x.best.win || gain > need)) { allow.add(sig); res.overrides.push({ mv: c.mv, why: c.why, gain: x.best.win ? 'win' : Math.round(gain * 100) / 100 }); if (x.best.value > r.best.value) { r.best = x.best; res.best = x.best; if (x.best.win) res.win = true; } } }
  }
  greedy(root, rootR, me) {
    let node = root, R = rootR; const line = []; let cur = this.ev(R, me);
    for (let k = 0; k < 30; k++) {
      let best = null;
      for (const mv of genMoves(R, val)) { const c = node.child(mv); if (c.err) continue; const st = this.settle(c.node, c.pending || c.node.R, me), R2 = st.R;
        let v = R2.phase === 'over' ? (R2.winner === me ? WIN : -WIN) : this.ev(R2, me); if (mv.tag === 'end') v -= 0.0001; else if (R2.phase === 'play' && R2.turn === me) v += 0.0; // 행동 후에도 내 턴이면 계속 진행 가능
        if (!best || v > best.v) best = { mv, v, st, R2 }; }
      if (!best) break; const endNow = best.mv.tag === 'end';
      if (!endNow && best.v <= cur - 0.5 && line.length) { // 더 이상 이득이 없으면 종료
        const e = genMoves(R, val).find(m => m.tag === 'end'); if (e) { line.push({ mv: e, resp: [], key: null }); } break; }
      line.push({ mv: best.mv, resp: best.st.resp, key: null }); if (best.R2.phase === 'over' || best.R2.turn !== me || !cloneable(best.R2) || endNow) break;
      node = best.st.node; R = best.R2; cur = best.v;
    }
    if (!line.length) { const e = genMoves(rootR, val).find(m => m.tag === 'end'); if (e) line.push({ mv: e, resp: [], key: null }); }
    return { line, value: cur, static: cur, reply: 'greedy-fallback' };
  }
  iteration(root, rootR, me, it, cfg) {
    const pol = this.policy, hard = pol && pol.ban && !pol.softBan, soft = pol && pol.softBan && pol.prune && !cfg.noPrune, allow = cfg.allowRoot;
    let layer = [{ node: root, R: rootR, line: [], value: this.ev(rootR, me), lb: 0 }]; const leaves = []; const seen = new Map(); const rootCut = [];
    for (let depth = 0; depth < 22 && layer.length; depth++) {
      const next = new Map();
      for (const e of layer) {
        this.check();
        let moves = genMoves(e.R, val);
        const pf = depth === 0 && cfg.rootFilter ? cfg.rootFilter : cfg.prefix && depth < cfg.prefix.length ? cfg.prefix[depth] : null;   // 첫 행동(또는 앞 몇 행동) 고정: 전문가 회귀 케이스의 "후보 라인"
        if (pf) { moves = moves.filter(pf); if (!moves.length) { if (depth === 0) return { best: null, cands: [], rootCut }; continue; } }
        else if (hard) { const all = moves, f = all.filter(m => !pol.ban(e.R, m, all)); if (f.length) moves = f; }   // 정책이 금지한 행동(조기 힌트·낼 캐릭터가 있는데 턴 종료) 제외 (v1.2.0 방식)
        else if (soft) { const all = moves, keep = [], cut = []; for (const m of all) { const why = (depth === 0 && allow && allow.has(JSON.stringify(m.m))) ? null : pol.prune(e.R, m, all); if (why) cut.push({ mv: m, why }); else keep.push(m); }
          if (keep.length && cut.length) { moves = keep; if (depth === 0) rootCut.push(...cut); } }   // 소프트 pruning: 뒤로 미룸(루트는 overrideCheck 가 다시 검증)
        const endMv = moves.find(m => m.tag === 'end');
        if (moves.length > it.cap) { moves = moves.map(m => [priority(e.R, m, this.policy), m]).sort((a, b) => b[0] - a[0]).slice(0, it.cap).map(x => x[1]); if (endMv && !moves.includes(endMv)) moves.push(endMv); }
        else moves = moves.map(m => [priority(e.R, m, this.policy), m]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
        for (const mv of moves) {
          const c = e.node.child(mv); if (c.err) continue; this.nodes++; this.stats.macro++;
          const st = this.settle(c.node, c.pending || c.node.R, me), R2 = st.R;
          let lb = e.lb, tr = null; if (pol && pol.lineBonus && mv.seat === me) { const x = pol.lineBonus(e.R, R2, mv, me); if (x) { tr = x.tr; if (x.v) lb = Math.min(e.lb + x.v, x.cap != null ? x.cap : Infinity); } }   // Action Economy (경로 가산)
          const line = [...e.line, { mv, resp: st.resp, key: R2.phase === 'play' && R2.turn === me && cloneable(R2) ? st.node.key : null, tr }];
          if (R2.phase === 'over') { if (R2.winner === me) return { best: { line, value: WIN - line.length, win: true, R: R2, lb: 0, static: WIN - line.length }, cands: [], rootCut }; leaves.push({ line, value: -WIN, R: R2, key: 'loss', lb: 0 }); continue; }
          if (R2.turn !== me || R2.phase !== 'play') { leaves.push({ line, R: R2, node: st.node, key: stateKey(R2), value: null, lb }); continue; }
          if (!cloneable(R2)) continue; // 안정 상태가 아니면(드문 경우) 더 이어가지 않는다
          const key = st.node.key, v = this.evCached(key, R2, me) + lb, old = next.get(key);
          if (!old || v > old.value) next.set(key, { node: st.node, R: R2, line, value: v, key, lb });
        }
      }
      layer = [...next.values()].filter(x => { const k = x.key; if (seen.has(k)) return false; seen.set(k, 1); return true; }).sort((a, b) => b.value - a.value).slice(0, it.W);
    }
    // 잎(턴 종료 상태) 평가 + 상위 K 개는 상대의 다음 턴 반격까지 검증
    for (const l of leaves) if (l.value == null) l.value = this.evCached('L' + l.key, l.R, me) + l.lb;
    leaves.sort((a, b) => b.value - a.value);
    // 정적 평가 상위부터 반격 검증. 반격 검증값은 대개 정적값보다 낮으므로, 다음 후보의 정적값이 이미 검증된 최선값 이하가 되면 중단(가지치기).
    const K = Math.min((it.K || 3) * 3, leaves.length), Kmin = Math.min(it.K || 3, leaves.length); let best = null; const cands = [], verified = new Set();
    const sigOf = l => l.line.length ? JSON.stringify(l.line[0].mv.m) : '';
    const verifyLeaf = l => { const rep = this.oppReply(l.R, me, l.key); verified.add(l); return { v: rep.v + l.lb, note: rep.note }; };
    for (let i = 0; i < leaves.length; i++) { const l = leaves[i]; let v = l.value, rep = null;
      const verify = !cfg.noReply && l.key !== 'loss' && cloneable(l.R) && i < K && (i < Kmin || !best || l.value > best.value);
      if (verify) { rep = verifyLeaf(l); v = rep.v; }
      const cand = { line: l.line, value: v, static: l.value - l.lb, lb: l.lb, reply: rep && rep.note, verified: !!rep, R: l.R }; l.cand = cand; cands.push(cand);
      if ((verify || cfg.noReply || l.key === 'loss') && (!best || v > best.value)) best = cand; }
    // (Expert Knowledge 정책) 서로 다른 첫 행동의 최선 라인(상위 3개)은 반격까지 검증 → 설명 로그의 "차선"이 실제 비교 대상이 되도록 (더 좋으면 최선도 바뀐다)
    if (!cfg.noReply && this.policy && this.policy.expert) { const bySig = new Map(); for (const l of leaves) { const k = sigOf(l); if (!bySig.has(k)) bySig.set(k, l); }
      let n = 0; for (const l of bySig.values()) { if (n++ >= 3) break; if (verified.has(l) || l.key === 'loss' || !cloneable(l.R)) continue; const rep = verifyLeaf(l); l.cand.value = rep.v; l.cand.reply = rep.note; l.cand.verified = true; if (!best || rep.v > best.value) best = l.cand; } }
    if (!best && leaves.length) best = leaves[0].cand;
    // 후보 목록: 첫 행동이 서로 다른 라인들 (각 첫 행동의 최선), 값 순
    const bestBySig = new Map(); for (const c of cands) { const k = c.line.length ? JSON.stringify(c.line[0].mv.m) : ''; const o = bestBySig.get(k); if (!o || (c.verified && !o.verified) || (c.verified === o.verified && c.value > o.value)) bestBySig.set(k, c); }
    const out = [...bestBySig.values()].sort((a, b) => b.value - a.value);
    return { best, cands: out.slice(0, 6), rootCut };
  }
  evCached(key, R, me) { const k = key + '|' + me; let v = this.evalCache.get(k); if (v === undefined) { v = this.ev(R, me); if (this.evalCache.size > 100000) this.evalCache.clear(); this.evalCache.set(k, v); } return v; }

  // 상대의 다음 턴 최선 반격(얕은 빔)까지 본 가치 — "다음 턴 리살/큰 손해"를 피하기 위한 검증
  oppReply(R, me, key) {
    const ck = 'R|' + key + '|' + me; const hit = this.replyCache.get(ck); if (hit) return hit;
    this.stats.replies++;
    const opp = 1 - me; let out;
    if (R.phase !== 'play' || R.turn !== opp || SIM.who(R) == null || SIM.who(R).kind !== 'main') out = { v: this.ev(R, me), note: 'static' };
    else if (this.policy && this.policy.tacticsOn && this.policy.tactics.flags.lethal && cloneable(R) && (() => { const L = require('./tactics/lethal.js').solve(R, opp, { ms: 120, nodes: 350 }); return L.found; })()) out = { v: -WIN + 1, note: 'opp-lethal(solver)' };   // v1.6.0: 상대의 다음 턴 리살은 정확한 solver 로 먼저 확인
    else {
      const sub = new Searcher({ deadline: this.deadline, maxNodes: this.nodes + (this.replyNodes || 400), memo: this.memo, replyCache: this.replyCache, seed: this.seedBase + 1, microDepth: 6, policy: this.policy }); sub.nodes = this.nodes; sub.tick = this.tick;
      const r = sub.planTurn(clone(R), opp, { iters: [{ W: 3, cap: 10, K: 1 }], noReply: true, singleIter: true });
      this.nodes = sub.nodes; this.tick = sub.tick;
      if (r.timedOut && !r.best) out = { v: this.ev(R, me), note: 'static(timeout)' };
      else if (r.win) out = { v: -WIN + 1, note: 'opp-lethal' };
      else if (r.best) out = { v: -r.best.value, note: 'reply ' + Math.round(-r.best.value * 10) / 10 };
      else out = { v: this.ev(R, me), note: 'static' };
    }
    if (this.replyCache.size > 20000) this.replyCache.clear(); this.replyCache.set(ck, out); return out;
  }
}
module.exports = { Searcher, Timeout, priority, val, T_OUT };
