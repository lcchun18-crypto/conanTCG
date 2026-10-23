// 백녹이기기 전략 진입점 (bot/strategies.js 가 'whitegreen' 으로 등록)
const { WhiteGreenStrategy, classify, stateOf } = require('./strategy.js');
const VERS = require('./versions/index.js');
// decide.js 가 부르는 함수: (R, seat, cfg) → { mv, info }  (규칙 엔진과 같은 반환형)
function decide(R, seat, cfg = {}) {
  const st = new WhiteGreenStrategy({ version: cfg.strategyVersion });
  const r = st.choose(R, seat, { lethal: cfg.lethal, lethalMs: cfg.lethalMs, lethalNodes: cfg.lethalNodes });
  if (r.err) return r;
  return { mv: r.mv, info: { engine: 'wg', strategy: 'WhiteGreenStrategy', version: st.version.id, label: st.label, rule: r.rule, why: r.why, notes: r.notes, wg: r.wg, top: [{ desc: r.wg.chosen, value: null, rule: r.rule, why: r.why }] } };
}
module.exports = { WhiteGreenStrategy, decide, classify, stateOf, VERS, LATEST: VERS.LATEST };
