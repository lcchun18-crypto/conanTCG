// BOT vs BOT 자동 대전 (시드 재현 가능). 사용: node test/bot_selfplay.js --games 40 --a expert --b heuristic --nodes 3000 --seed 1
// 출력: 승률, 불법 행동 수, 정지/무한루프/상태 손상 검사 결과.
const U = require('./bot_util.js'), B = require('./bot_baselines.js'), SIM = require('../bot/simulate.js'), { decide } = require('../bot/decide.js'), { Searcher } = require('../bot/search.js'), { Tracker } = require('../bot/track.js');
const { S } = U; const EVW = require('../bot/evaluate.js').W;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const WA = JSON.parse(arg('wA', '{}')), WB = JSON.parse(arg('wB', '{}')), NODES_A = +arg('nodesA', 0), NODES_B = +arg('nodesB', 0), GAMES = +arg('games', 20), SEED0 = +arg('seed', 1), NODES = +arg('nodes', 4000), TIME = +arg('ms', 1e9), A = arg('a', 'expert'), Bn = arg('b', 'heuristic'), TURNCAP = +arg('turncap', 120), VERBOSE = process.argv.includes('--v');
function makeStrategy(kind, seat, seed) {
  const rnd = U.mulberry32(seed * 131 + seat);
  if (kind === 'random') return { f: B.random(rnd) };
  if (kind === 'heuristic') return { f: B.heuristic(rnd) };
  if (kind.startsWith('spec:')) return { expert: true, sr: null, spec: kind.slice(5), seed, f: null }; // 전문 봇: 정책은 첫 결정 때(선공/상대 덱을 알 수 있을 때) 만든다
  if (kind === 'expert') { const sr = new Searcher({ seed }); return { expert: true, sr, f: null }; }
  throw new Error('unknown bot ' + kind);
}
function playGame(seed, deckA, deckB, kinds, firstSeat, hooks = {}) {
  const R = U.newGame(seed, deckA, deckB, { first: firstSeat }), T = new Tracker(), strat = kinds.map((k, s) => makeStrategy(k, s, seed * 10 + s)), st = { illegal: 0, steps: 0, errors: [], decisions: 0, ms: [0, 0] };
  let step = 0; const cfg = { timeMs: TIME, microMs: TIME, maxNodes: NODES };
  while (R.phase !== 'over') {
    if (++step > 8000) { st.stall = 'steps'; break; }
    if (R.phase === 'play' && R.n > TURNCAP) { st.stall = 'turncap'; break; }
    const d = SIM.who(R); if (!d) { st.stall = 'nodecider:' + R.phase; break; }
    const s = strat[d.seat]; let mv, info;
    const t0 = Date.now();
    if (s.expert && s.spec && !s.sr) s.sr = new Searcher({ seed: s.seed, policy: require('../bot/specialists/registry.js').policyFor(s.spec, d.seat, R) });
    if (s.expert) { const nn = d.seat === 0 ? NODES_A : NODES_B; const ov = d.seat === 0 ? WA : WB, sv = {}; for (const k in ov) { sv[k] = EVW[k]; EVW[k] = ov[k]; } let r; try { r = decide({ R, seat: d.seat, base: T.base, acts: T.acts, cfg: { ...cfg, ...(nn ? { maxNodes: nn } : {}), seed: seed * 7 + step } }, s.sr); } finally { for (const k in sv) EVW[k] = sv[k]; } if (r.err) { st.errors.push(r.err); st.stall = 'decide:' + r.err; break; } mv = r.mv; info = r.info; st.ms[d.seat] += Date.now() - t0; st.decisions++; }
    else mv = s.f(R, d.seat);
    if (!mv) { st.stall = 'nomove'; break; }
    if (hooks.onDecision) hooks.onDecision(R, d, mv, info, s); // 분석용(전문 봇 평가 도구): 행동 적용 전 상태
    const e = T.apply(R, mv.seat, mv.m, (R_, se, m) => S.dispatch(R_, se, m)); // 사람과 같은 dispatch 경로
    if (e) { if (s.expert) st.illegal++; else st.baseIllegal = (st.baseIllegal || 0) + 1; st.errors.push(`${s.expert ? 'EXPERT' : 'base'}:${d.kind}:${mv.tag}:${e}`); if (s.expert) { // 불법이면 첫 합법 행동으로 대체(실제 봇 컨트롤러와 같은 방식) — 그래도 "불법 시도"로 집계
        let ok = false; for (const m2 of SIM.genMoves(R, () => 0)) { if (!T.apply(R, m2.seat, m2.m, (R_, se, m) => S.dispatch(R_, se, m))) { ok = true; break; } } if (!ok) { st.stall = 'illegal-stuck'; break; } }
      else { let ok = false; for (const m2 of SIM.genMoves(R, () => 0)) { if (!T.apply(R, m2.seat, m2.m, (R_, se, m) => S.dispatch(R_, se, m))) { ok = true; break; } } if (!ok) { st.stall = 'stuck'; break; } } }
    // 상태 손상 검사: 카드가 정확히 한 곳에 있는가
    if (step % 25 === 0 || R.phase === 'over') { const c = cardCheck(R); if (c) { st.errors.push('corrupt:' + c); st.corrupt = c; break; } }
  }
  st.steps = step; st.winner = R.phase === 'over' ? R.winner : null; st.turns = R.n; st.why = R.phase === 'over' ? (R.log.filter(l => l.includes('승리')).pop() || '') : ''; return st;
}
function cardCheck(R) {
  const seen = new Map();
  for (const s of [0, 1]) { const P = R.P[s]; for (const z of ['deck', 'hand', 'file', 'evid', 'rem', 'field', 'pa']) for (const id of P[z]) { if (seen.has(id)) return `dup ${id} in ${seen.get(id)} & ${s}:${z}`; seen.set(id, s + ':' + z); }
    for (const id of [P.partner, P.kase]) { if (id != null) { if (seen.has(id) && !P.pa.includes(id)) return `dup ${id} in ${seen.get(id)}`; seen.set(id, s + ':pk'); } }
    for (const id of P.field) { const c = R.cards[id]; for (const y of [...(c.sets || []), ...(c.fd || []), ...(c.under || [])]) { if (seen.has(y)) return `dup set ${y}`; seen.set(y, 'set'); } } }
  for (const s of [0, 1]) if (R.P[s].field.length > 5) return 'field>5';
  return null;
}
if (require.main === module) {
  const res = { a: 0, b: 0, draw: 0, illegal: 0, stall: 0, corrupt: 0, turns: 0, games: 0, ms: 0, dec: 0 }, t0 = Date.now(), fails = [];
  for (let g = 0; g < GAMES; g++) {
    const seed = SEED0 + (g >> 1), dA = U.makeDeck(seed * 2 + 1), dB = U.makeDeck(seed * 2 + 2), swap = g & 1; // 같은 덱 쌍으로 선후공/좌석을 바꿔가며
    // 좌석 0 = A봇(덱 A), 좌석 1 = B봇; swap 이면 선공을 바꾼다 (덱 쌍 고정, 선공 교대)
    const st = playGame(seed * 100 + g, dA, dB, [A, Bn], swap ? 1 : 0); res.games++; res.turns += st.turns; res.illegal += st.illegal; res.ms += st.ms[0] + st.ms[1]; res.dec += st.decisions;
    if (st.stall) { res.stall++; fails.push({ g, seed, stall: st.stall, errors: st.errors.slice(0, 3) }); } else if (st.winner === 0) res.a++; else res.b++;
    if (st.corrupt) res.corrupt++; if (VERBOSE) console.log(g, st.winner, st.turns, st.why, st.stall || '', st.errors.slice(0, 2));
  }
  console.log(JSON.stringify({ ...res, a_name: A, b_name: Bn, winrate_a: res.a / Math.max(1, res.a + res.b), sec: (Date.now() - t0) / 1000, msPerDecision: res.dec ? res.ms / res.dec : 0, fails: fails.slice(0, 5) }));
}
module.exports = { playGame, cardCheck };
