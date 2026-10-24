// 백녹이기기 전략 진입점 (bot/strategies.js 가 'whitegreen' 으로 등록)
const { WhiteGreenStrategy, classify, stateOf } = require('./strategy.js');
const VERS = require('./versions/index.js');
// decide.js 가 부르는 함수: (R, seat, cfg) → { mv, info }  (규칙 엔진과 같은 반환형)
// v0.17: 방·좌석별로 전략 인스턴스를 유지한다 — 턴 계획(mem.plan)이 결정 사이에 이어져야 하므로 (worker/메인 스레드 각각 자기 캐시를 가진다)
const INST = new Map(); const MAX_INST = 64;
function instanceFor(R, seat, cfg) { const key = `${R.code || '?'}:${seat}:${cfg.strategyVersion || ''}`; let st = INST.get(key);
  if (!st) { st = new WhiteGreenStrategy({ version: cfg.strategyVersion }); INST.set(key, st); if (INST.size > MAX_INST) INST.delete(INST.keys().next().value); }
  if (R.phase === 'over') INST.delete(key); return st; }
function decide(R, seat, cfg = {}) {
  const st = instanceFor(R, seat, cfg);
  const r = st.choose(R, seat, { lethal: cfg.lethal, lethalMs: cfg.lethalMs, lethalNodes: cfg.lethalNodes });
  if (r.err) return r;
  return { mv: r.mv, info: { engine: 'wg', strategy: 'WhiteGreenStrategy', version: st.version.id, label: st.label, rule: r.rule, why: r.why, notes: r.notes, wg: r.wg, top: [{ desc: r.wg.chosen, value: null, rule: r.rule, why: r.why }] } };
}
module.exports = { WhiteGreenStrategy, decide, classify, stateOf, VERS, LATEST: VERS.LATEST, instanceFor };
