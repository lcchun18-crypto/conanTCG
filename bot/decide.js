// 결정 함수 (입출력 없음): 현재 상태 → 봇이 할 행동 1개 + 고려한 후보/탐색 통계. controller(라이브), worker(스레드), 테스트(self-play)가 모두 이걸 쓴다.
const SIM = require('./simulate.js');
const EV = require('./evaluate.js');
const { Searcher, T_OUT, val } = require('./search.js');
const { S, who, genMoves, clone, cloneable, determinize, Node, stateKey } = SIM;
const { D } = S;

const DEFAULTS = { timeMs: 3000, microMs: 1200, maxNodes: 4e6 };
function describe(R, mv) {
  const n = id => { try { return D(R, id).n; } catch { return '?'; } }, m = mv.m;
  switch (mv.tag) {
    case 'play': return `사용: ${n(m.id)}` + (m.rep != null ? ` (스위치: ${n(m.rep)})` : '');
    case 'atkc': return `공격: ${n(m.id)} → ${n(m.tid)}`; case 'atkk': return `사건 공격: ${n(m.id)}`;
    case 'reason': return m.who === 'p' ? '추리: 파트너' : `추리: ${n(m.who)}`; case 'assist': return '어시스트'; case 'solve': return '사건 해결';
    case 'hint': return '넥스트 힌트'; case 'skip': return '스킵'; case 'end': return '턴 종료'; case 'ability': return `능력: ${n(m.id)}#${m.i}`;
    case 'guard': return `가드: ${n(m.id)}`; case 'noguard': return '가드 안 함'; case 'pass': return '패스'; case 'cin': return `컷인: ${n(m.id)}`; case 'dis': return `변장: ${n(m.id)}`;
    case 'mis': return `미스리드: ${(m.ids || []).length}장`; case 'ans': return '선택: ' + JSON.stringify(m.v);
    default: if (m.a === 'mull') return `멀리건: ${(m.ids || []).length}장 교체`; return mv.tag; }
}
// 멀리건: 남길 카드 가치 vs 덱에서 새로 받을 카드의 기대 가치 (덱 구성은 공개 정보, 순서는 모름)
function mulliganChoice(R, seat, pol) {
  const P = R.P[seat], pv = pol && pol.mulValue ? id => pol.mulValue(R, id) : () => 0; // 전문 봇: 카드별 보정치(가산)
  const hv = id => { const d = D(R, id), lv = S.FX.lvOf(R, id); let v = EV.cardBase(R, id); if (!S.okc(R, seat, d, id)) v *= 0.15; v *= lv <= 1 ? 1 : lv <= 3 ? 0.95 : lv <= 4 ? 0.8 : lv <= 5 ? 0.6 : 0.42; return v + pv(id); };
  const deckVals = P.deck.map(hv), mean = deckVals.length ? deckVals.reduce((a, b) => a + b, 0) / deckVals.length : 1;
  const ranked = P.hand.map(id => [id, hv(id)]).sort((a, b) => a[1] - b[1]);
  let rep = ranked.filter(([, v]) => v < mean * 0.92).slice(0, 4).map(x => x[0]);
  const low = P.hand.filter(id => !rep.includes(id) && S.FX.lvOf(R, id) <= 2 && S.okc(R, seat, D(R, id), id)).length; // 초반에 낼 수 있는 카드가 하나도 안 남으면 가장 낮은 카드도 교체
  if (!low && rep.length < 4) { const nx = ranked.find(([id]) => !rep.includes(id)); if (nx && P.hand.length - rep.length > 1) rep.push(nx[0]); }
  if (pol && pol.mulAdjust) { const adj = pol.mulAdjust(R, seat, rep.slice()); if (Array.isArray(adj)) rep = adj.filter(id => P.hand.includes(id)).slice(0, pol.mulMax || 4); } // 덱 전용 규칙(킵/교체 지정, 콤보 유지)은 최종 조정으로만 적용 — 손패에 있는 카드만, 최대 4장
  return { t: 'act', a: 'mull', ids: rep };
}

// spec: { R (live 상태, 읽기 전용), seat, base?, acts?, cfg }  — base/acts: 효과 처리 중 상태 재구성용(복제 가능한 조상 + 행동 경로)
function decide(spec, searcher) {
  const { R, seat } = spec, cfg = { ...DEFAULTS, ...(spec.cfg || {}) }, t0 = Date.now(), d = who(R);
  if (!d || d.seat !== seat) return { err: 'not my decision' };
  const info = { kind: d.kind, ms: 0, nodes: 0 }; if (cfg.specialist) info.specialist = cfg.specialist;
  // 전문 봇: cfg.specialist(id) 가 있으면 registry 가 만든 "정책"(평가 보정/행동 순서/멀리건)을 탐색기에 붙인다. 없으면 범용 Expert 그대로.
  const pol = searcher ? searcher.policy : (spec.policy || (cfg.specialist ? require('./specialists/registry.js').policyFor(cfg.specialist, seat, R) : null));
  const S_ = searcher || new Searcher({ seed: cfg.seed, policy: pol });
  const fin = (mv, extra) => { info.ms = Date.now() - t0; info.nodes = S_.nodes; return { mv, info: { ...info, ...extra } }; };
  if (d.kind === 'mull') { const mv = { seat, m: mulliganChoice(R, seat, pol), tag: 'mull' }; return fin(mv, { top: [{ desc: describe(R, mv), value: null }], mulligan: pol && pol.lastMulligan ? pol.lastMulligan : undefined }); }
  const moves = genMoves(R, val);
  if (!moves.length) return { err: 'no moves' };
  if (moves.length === 1) return fin(moves[0], { forced: true, top: [{ desc: describe(R, moves[0]), value: null }] });
  S_.deadline = t0 + (d.kind === 'main' || (d.kind === 'hint' && pol && pol.tactics) ? cfg.timeMs : cfg.microMs); S_.maxNodes = S_.nodes + cfg.maxNodes; S_.tick = 0;
  const detSeed = (cfg.seed || 1) * 2654435761 + R.n * 97 + (R.log ? 0 : 0);
  try {
    // ── v1.6.0 Tactical Layer 1단계: 내 메인 결정마다 "일반 탐색보다 먼저" 이번 턴 리살(승리 시퀀스)이 있는지 정확하게 검사 (bot/tactics/lethal.js)
    const tp = pol && pol.tactics; let lethal = null;
    if (tp && tp.flags.lethal && cfg.lethal !== false && (d.kind === 'main' || d.kind === 'hint') && cloneable(R)) {
      lethal = tp.lethal(R, { ms: cfg.lethalMs || 700, nodes: cfg.lethalNodes || 3500 });
      if (lethal.found) { const TX = require('./tactics/explain.js'), ln = lethal.line.map(x => x.desc);
        return fin(lethal.mv, { value: EV.WIN, win: true, tactic: 'lethal', lineDesc: ln, top: [{ desc: ln.join(' → '), value: 'WIN' }], tactics: { decision: 'lethal', state: TX.stateLine(R, seat), lethal: TX.lethalSummary(lethal), chosen: { desc: ln.join(' → '), first: ln[0], note: `${lethal.kind} — 상대의 모든 가드/컷인 응수에서 승리` }, why: `리살 최우선: ${lethal.kind}` }, explain: undefined }); } }
    if (d.kind === 'main' || (d.kind === 'hint' && tp)) {
      if (!cloneable(R)) return { err: 'main state not cloneable' };
      // 2단계: 전술 후보 필터 — 규칙(소프트 pruning)으로 걸러진 뒤 남은 수가 하나뿐이면 깊은 탐색 없이 바로 둔다. 쉬운 상황은 예산을 줄인다.
      let tfast = null;
      if (tp && cfg.tactics !== false) { const kept = [], cut = []; for (const m of moves) { const j = tp.judge(R, m); (j && j.prune ? cut : kept).push(m); }
        const nonEnd = kept.filter(m => m.tag !== 'end'); tfast = { kept: kept.length, pruned: cut.length, nonEnd: nonEnd.length };
        if (kept.length === 1 && nonEnd.length === 1) { const TX = require('./tactics/explain.js'), j = tp.judge(R, kept[0]); const o = { desc: describe(R, kept[0]), first: describe(R, kept[0]), tags: j ? j.tags : [], note: j ? j.note : '' };
          return fin(kept[0], { forced: false, tactic: 'only-kept', top: [{ desc: o.desc, value: null }], tactics: { decision: 'only-kept', state: TX.stateLine(R, seat), lethal: TX.lethalSummary(lethal), chosen: o, why: `전술 규칙으로 걸러내고 남은 유일한 행동 (걸러진 수 ${cut.length}개: ${cut.slice(0, 4).map(m => describe(R, m) + ' ← ' + tp.judge(R, m).prune).join(', ')})`, fast: tfast } }); }
        if (nonEnd.length <= 2) S_.deadline = Math.min(S_.deadline, t0 + Math.max(400, cfg.timeMs * 0.5)); }
      const root = determinize(clone(R), detSeed >>> 0);
      const res = S_.planTurn(root, seat, { iters: cfg.iters, noReply: cfg.noReply, rootFilter: cfg.rootFilter, overrideMargin: cfg.overrideMargin });
      if (!res.best || !res.best.line.length) return fin(moves[moves.length - 1], { fallback: 'no line' });
      const first = res.best.line[0].mv;
      const plan = res.best.line.map(l => ({ mv: l.mv, key: l.key }));
      // v1.5.0 설명 로그: 후보마다 판단 요소별 점수 분해 + 시퀀스(상대 응수 소비) + 소프트 pruning/override 기록 (Expert Knowledge Layer 정책일 때)
      let explain; if (pol && pol.expert && cfg.explain !== false) { try { explain = require('./expert/explain.js').explain(root, res, pol, seat, describe); } catch (e) { explain = { error: String(e && e.message || e) }; } }
      let tactics; if (tp) { try { tactics = require('./tactics/explain.js').explainSearch(root, res, pol, seat, describe, lethal, { fast: tfast }); } catch (e) { tactics = { error: String(e && e.message || e) }; } }
      return fin(first, { value: res.best.value, win: !!res.win, iters: res.iters, reply: res.best.reply, plan, lineDesc: res.best.line.map(l => describe(root, l.mv)),
        top: (res.cands && res.cands.length ? res.cands : [res.best]).slice(0, 5).map(c => ({ desc: c.line.map(l => describe(root, l.mv)).join(' → '), value: Math.round(c.value * 100) / 100, reply: c.reply })),
        explain, tactics, pruned: res.pruned && res.pruned.length ? res.pruned.length : undefined, overrides: res.overrides && res.overrides.length ? res.overrides : undefined });
    }
    // 미시 결정(가드/컨택트/미스리드/효과 선택/힌트 창)
    let node, R0 = R;
    if (cloneable(R)) node = Node.root(determinize(clone(R), detSeed >>> 0));
    else if (spec.base) { const path = (spec.acts || []).map(a => ({ mv: { seat: a.seat, m: a.m, tag: a.m.a }, seed: a.seed }));
      // 미래 덱 순서를 모르는 채로 재구성: 스냅샷의 덱을 섞어 리플레이해 보고, 지금 떠 있는 선택창과 같으면 그 (섞인) 상태를 쓴다. 덱 위 카드를 보는 효과처럼 달라지면 실제 스냅샷을 쓴다(이미 공개된 정보).
      const sig = q => JSON.stringify([q.kind, q.who, q.ids || q.sel || null, q.labels || null, q.min, q.max]);
      let anc = determinize(clone(spec.base), detSeed >>> 0), ok = false;
      try { const Rr = clone(anc); for (const p of path) { const e = SIM.applyMove(Rr, p.mv, p.seed); if (e) throw new Error(e); } ok = !!Rr.eff && sig(Rr.eff.req) === sig(R.eff.req); } catch { ok = false; }
      if (!ok) anc = spec.base; node = new Node(null, anc, path, detSeed >>> 0); info.exact = !ok; }
    else return fin(moves[0], { fallback: 'no base' });
    if (node.R) R0 = node.R;
    const scored = [];
    const defTurn = tp && tp.flags.defense && R0.turn !== seat && String(d.kind).startsWith('sub:'), prevented = [];
    for (const mv of moves.slice(0, 28)) { const c = node.child(mv); if (c.err) continue; const r = S_.micro(c.node, c.pending || c.node.R, seat, S_.microDepth); let v = r.v, adj = 0, note = '';
      if (tp && pol.microAdj) { adj = pol.microAdj(R0, mv); v += adj; if (adj) note = tp.microNote(R0, mv); }
      // v1.6.0 방어: 이 응수 뒤 상대가 같은 턴에 리살할 수 있으면(정확한 solver) 최악으로 본다 — "이 공격을 통과시키면 리살을 당한다" 는 상황의 예외적 가드/컷인
      if (defTurn && v > -EV.WIN / 2) { try { const st = S_.settle(c.node, c.pending || c.node.R, seat), Rs = st.R; if (Rs.phase === 'play' && Rs.turn === 1 - seat && cloneable(Rs) && who(Rs) && who(Rs).kind === 'main') { const L = tp.lethal(Rs, { ms: 150, nodes: 400 }, 1 - seat); if (L.found) { v = -EV.WIN / 2; prevented.push(describe(R, mv)); note = '이 응수 뒤 상대 리살(' + L.kind + ')'; } } } catch (e) { if (e === T_OUT) throw e; } }
      scored.push({ mv, v, adj, note }); }
    if (!scored.length) return fin(moves[0], { fallback: 'all rejected' });
    scored.sort((a, b) => b.v - a.v);
    return fin(scored[0].mv, { value: scored[0].v, top: scored.slice(0, 5).map(x => ({ desc: describe(R, x.mv), value: Math.round(x.v * 100) / 100, tactic: x.note || undefined })),
      tactics: tp ? { decision: 'micro', kind: d.kind, chosen: { desc: describe(R, scored[0].mv), note: scored[0].note || '', value: Math.round(scored[0].v * 100) / 100 }, others: scored.slice(1, 4).map(x => ({ desc: describe(R, x.mv), value: Math.round(x.v * 100) / 100, note: x.note || '' })), oppLethalAvoided: prevented.length ? prevented : undefined } : undefined });
  } catch (e) {
    if (e !== T_OUT) throw e;
    return fin(genMoves(R, val)[0], { fallback: 'timeout' });
  }
}
module.exports = { decide, describe, mulliganChoice, DEFAULTS };
