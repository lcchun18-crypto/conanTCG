process.env.BOT_ENGINE = process.env.BOT_ENGINE || 'expert'; // v1.8.0: 기본 봇은 규칙 스크립트. 이 테스트는 이전 탐색 엔진을 검증한다
// 봇 상황별 회귀 테스트 러너.
// "이 상황에서는 이런 수를 둬야 하는데 봇이 잘못 뒀다" 사례를 test/bot_cases/*.js 에 파일 하나로 추가하면 여기서 자동 실행됩니다.
// 케이스 파일 형식:  module.exports = { name: '설명', setup(H) { /* H = 헬퍼(game/give/find/fill ...) 로 R 을 만들어 반환 */ return R; }, seat: 생략 시 R.turn, expect(res, R, H) { /* res = decide() 결과 {mv, info} ; 조건이 틀리면 throw */ }, budget: { maxNodes: 4000 } }
// 사용:  node test/bot_regress.js            범용 Expert 로 실행
//        node test/bot_regress.js --spec <id>   같은 케이스를 전문 봇(<id>)의 정책을 붙여 실행 — 전문 프로필이 기본 전술(리살/전투 계산/멀리건)을 망가뜨리지 않는지 확인
const fs = require('fs'), path = require('path');
const H = require('./helpers.js'), SIM = require('../bot/simulate.js'), { decide } = require('../bot/decide.js'), { Searcher } = require('../bot/search.js');
const DIR = path.join(__dirname, 'bot_cases');
function runCases(dir, o = {}) {
  let pass = 0, fail = 0; const tag = o.spec ? `[${o.spec}] ` : '';
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) {
    const cs = require(path.join(dir, f)); for (const c of [].concat(cs)) {
      try { const R = c.setup(H), d = SIM.who(R), seat = c.seat != null ? c.seat : d.seat;
        const policy = o.spec ? require('../bot/specialists/registry.js').policyFor(o.spec, seat, R) : null;
        const res = decide({ R, seat, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 6000, seed: 3, ...(c.budget || {}) } }, new Searcher({ seed: 3, policy }));
        if (res.err) throw new Error('decide: ' + res.err); c.expect(res, R, H, SIM); console.log('✓', tag + f, '—', c.name); pass++;
      } catch (e) { fail++; console.log('✗', tag + f, '—', c.name, '\n    ', String(e.message || e).slice(0, 400)); } } }
  return { pass, fail };
}
module.exports = { runCases, DIR };
if (require.main === module) {
  const i = process.argv.indexOf('--spec'), spec = i > 0 ? process.argv[i + 1] : null, { pass, fail } = runCases(DIR, { spec });
  console.log(fail ? `\n봇 회귀 ${fail}건 실패 (통과 ${pass})` : `\n봇 회귀 테스트 통과 (${pass}개 케이스)`); process.exit(fail ? 1 : 0);
}
