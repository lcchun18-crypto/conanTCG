// WhiteGreenStrategy self-play (AI A vs AI B) — 개발 과정에서 Claude 가 직접 돌리는 미러전.
// 실제 게임과 똑같은 룰 엔진(S.dispatch)과 똑같은 전략 클래스(WhiteGreenStrategy)를 쓴다. 이 파일은 "두 좌석 모두를 전략이 두는 진행 루프 + 기록(프레임/Decision Log)"만 한다.
const SIM = require('../simulate.js');
const { S, who, genMoves } = SIM;
const { WhiteGreenStrategy } = require('./strategy.js');
const REG = require('../specialists/registry.js');
const DB = () => { const j = require('../../data/cards.json'); return j.cards || j; };

// 확정 덱 (bot/specialists/baekrok.js 의 덱 파일) — 실제 백녹이기기 모드와 같은 덱
function deckSpec(cards = DB()) { const b = REG.botDeck('baekrok', cards).deck, list = [];
  for (const [id, n] of Object.entries(b.cards)) for (let i = 0; i < n; i++) list.push(id);
  const defs = {}; for (const id of [...new Set(list), b.partner, b.kase]) defs[id] = cards[id];
  return { defs, list, partner: b.partner, kase: b.kase }; }

// opts: { seed, first (0|1: 좌석 0 = AI A 가 선공이면 0), versionA, versionB, maxTurns, frames (bool), onStep }
function playMatch(opts = {}) {
  const seed = (opts.seed == null ? 1 : opts.seed) >>> 0, first = opts.first === 0 || opts.first === 1 ? opts.first : (SIM.mulberry32(seed)() < .5 ? 0 : 1), maxTurns = opts.maxTurns || 60;
  const stratA = new WhiteGreenStrategy({ version: opts.versionA }), stratB = new WhiteGreenStrategy({ version: opts.versionB || opts.versionA }), strat = [stratA, stratB];
  const spec = deckSpec(opts.cards), t0 = Date.now(), frames = [], decisions = [];
  return SIM.withRng(seed, () => {
    const R = S.mkR('WG' + seed); R.firstPref = first; R.ws = [{ readyState: 1, send() {} }, { readyState: 1, send() {} }]; R.selfplay = true;
    for (const s of [0, 1]) { const e = S.dispatch(R, s, { t: 'ready', defs: spec.defs, list: spec.list.slice(), partner: spec.partner, kase: spec.kase }); if (e) throw new Error('ready: ' + e); }
    const snap = cap => { if (opts.frames !== false) frames.push({ n: decisions.length, view: JSON.stringify(S.viewSpec(R)), cap }); try { S.flushReveal(R); } catch (e) {} };
    if (opts.frames !== false) frames.push({ n: 0, defs: R.defs }); snap(null);
    let steps = 0, illegal = 0, stuck = null;
    while (R.phase !== 'over' && steps < 6000) {
      if (R.phase === 'play' && R.n > maxTurns) { stuck = '턴 제한(' + maxTurns + ') 초과'; break; }
      const d = who(R); if (!d) { stuck = 'who=null (phase ' + R.phase + ')'; break; }
      const seat = d.seat, st = strat[seat]; let r;
      try { r = st.choose(R, seat, {}); } catch (e) { r = { err: 'exception: ' + (e && e.stack || e) }; }
      let mv = r.mv, why = r.why, rule = r.rule, wg = r.wg;
      let audit; try { if (mv.tag === 'atkc') audit = { atk: S.ap(R, mv.m.id), def: S.ap(R, mv.m.tid), blockers: R.P[1 - seat].field.filter(x => R.cards[x].st === 'a').map(x => S.ap(R, x)) }; } catch (e0) {}
      let e = r.err ? r.err : S.dispatch(R, seat, mv.m);
      if (e) { illegal++; const alt = genMoves(R, () => 0).find(m => !S.dispatch(R, seat, m.m)); if (!alt) { stuck = 'no legal move: ' + e; break; } mv = alt; why = '(전략 결정이 거부되어 합법 후보로 대체: ' + e + ')'; rule = 'fallback'; wg = wg || { chosen: '?' }; wg = { ...wg, fallback: String(e).slice(0, 160) }; }
      steps++; const rec = { ...wg, n: decisions.length + 1, seat, ai: seat === 0 ? 'A' : 'B', version: strat[seat].version.id, turn: R.n, kind: d.kind, rule, why, move: mv.m, audit };
      decisions.push(rec); snap({ n: rec.n, ai: rec.ai, seat, kind: wg && wg.kind, text: wg && wg.chosen, why });
      if (opts.onStep) opts.onStep(rec, R);
    }
    const res = result(R, { seed, first, stuck, illegal, steps, strat, ms: Date.now() - t0 });
    return { R, result: res, decisions, frames };
  });
}
function result(R, x) { const P = R.P, name = id => { try { return S.D(R, id).n; } catch (e) { return '?'; } };
  const winnerSeat = R.winner === 0 || R.winner === 1 ? R.winner : null;
  return { aiVersions: { A: x.strat[0].label, B: x.strat[1].label }, seed: x.seed, first: R.first === 0 ? 'A' : 'B', winner: winnerSeat == null ? null : winnerSeat === 0 ? 'A' : 'B', ended: R.phase === 'over', unfinished: x.stuck || undefined,
    turns: R.n, finalEvidence: { A: P[0].evid.length, B: P[1].evid.length }, finalFile: { A: P[0].file.length, B: P[1].file.length }, caseSolved: { A: !!(R.cards[P[0].kase] && R.cards[P[0].kase].solved), B: !!(R.cards[P[1].kase] && R.cards[P[1].kase].solved) },
    finalField: { A: P[0].field.map(name), B: P[1].field.map(name) }, illegalFallbacks: x.illegal, decisions: x.steps, elapsedMs: x.ms, endLog: R.log.slice(-6) }; }
module.exports = { playMatch, deckSpec };
