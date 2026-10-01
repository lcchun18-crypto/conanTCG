// 전문 봇 회귀 러너.  "이 상황에서 ○○ 봇이 A 를 했는데 고수라면 B" 피드백 → test/specialist_cases/<봇id>/NN_설명.js 한 파일로 고정.
//   node test/specialist_regress.js                 모든 전문 봇의 케이스 + 각 봇 정책을 붙인 "범용 전술 케이스(test/bot_cases)"
//   node test/specialist_regress.js --id fbi_red    한 봇만
//   node test/specialist_regress.js --strict        카드 DB 가 없어 건너뛴 케이스가 있으면 실패 처리
// 케이스 파일:  module.exports = { name, snapshot?: {...결정 로그의 snap...}, setup?(H, ctx) → R, seat?, needs?: ['id_0133'], budget?, expect(res, R, H, SIM, ctx) }
//   · snapshot 이 있으면 카드 DB 로 그 시점을 그대로 복원한다 (bot/snapshot.js).  · ctx = { DB, SIM, S, U, X(=specialist_util), restore }
//   · 카드 DB 에 없는 카드가 필요한 케이스는 "SKIP (DB 에 없음)" 으로 표시한다 (실제 DB 가 없는 환경).
const fs = require('fs'), path = require('path');
const H = require('./helpers.js'), SIM = require('../bot/simulate.js'), { decide } = require('../bot/decide.js'), { Searcher } = require('../bot/search.js');
const REG = require('../bot/specialists/registry.js'), SN = require('../bot/snapshot.js'), X = require('./specialist_util.js'), U = X.U, RG = require('./bot_regress.js');
const arg = k => { const i = process.argv.indexOf('--' + k); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const DIR = process.env.SPECIALIST_CASES_DIR || path.join(__dirname, 'specialist_cases');
function runSpecialist(id, DB, o = {}) {
  let pass = 0, fail = 0, skip = 0; const dir = path.join(o.dir || DIR, id); if (!fs.existsSync(dir)) return { pass, fail, skip, none: true };
  const ctx = { DB, SIM, S: U.S, U, X, restore: snap => SN.restore(snap, DB, U.S) };
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) for (const c of [].concat(require(path.join(dir, f)))) {
    const need = [...(c.needs || []), ...(c.snapshot ? c.snapshot.P.flatMap(p => [...p.hand, ...p.deck, ...p.file, ...p.rem, p.partner.k, p.kase.k, ...p.field.map(x => x.k), ...p.evid.map(x => x.k)]) : [])];
    const miss = [...new Set(need.filter(k => !DB[k]))]; if (miss.length) { skip++; console.log('− SKIP', `[${id}]`, f, '—', c.name, `(DB 에 없음: ${miss.slice(0, 3).join(', ')}${miss.length > 3 ? ' …' : ''})`); continue; }
    try { const R = c.snapshot ? ctx.restore(c.snapshot) : c.setup(H, ctx), d = SIM.who(R), seat = c.seat != null ? c.seat : d.seat, policy = REG.policyFor(id, seat, R);
      const res = decide({ R, seat, cfg: { timeMs: 1e9, microMs: 1e9, maxNodes: 8000, seed: 3, ...(c.budget || {}) } }, new Searcher({ seed: 3, policy }));
      if (res.err) throw new Error('decide: ' + res.err); c.expect(res, R, H, SIM, ctx); console.log('✓', `[${id}]`, f, '—', c.name); pass++;
    } catch (e) { fail++; console.log('✗', `[${id}]`, f, '—', c.name, '\n    ', String(e.message || e).slice(0, 500)); } }
  return { pass, fail, skip };
}
module.exports = { runSpecialist };
if (require.main === module) {
  let DB; try { DB = JSON.parse(fs.readFileSync(process.env.BOT_TEST_DB || path.join(__dirname, '../data/cards.json'), 'utf8')).cards; } catch (e) { console.log('카드 DB 를 읽을 수 없습니다:', e.message); process.exit(2); }
  const only = arg('id'), ids = [...REG.load().keys()].filter(x => !only || x === only); let P = 0, F = 0, S_ = 0;
  if (only && !ids.length) { console.log('등록되지 않은 전문 봇:', only); process.exit(2); }
  if (!ids.length) console.log('등록된 전문 봇이 없습니다 (bot/specialists/cli.js add 로 추가).');
  for (const id of ids) {
    const ck = REG.check(REG.get(id), DB); if (!ck.ok) { console.log(`✗ [${id}] 덱/프로필 검증 실패`); ck.errors.forEach(e => console.log('    ' + e)); F++; continue; }
    const r = runSpecialist(id, DB); P += r.pass; F += r.fail; S_ += r.skip; if (r.none) console.log(`· [${id}] 전용 회귀 케이스 없음 (test/specialist_cases/${id}/)`);
    const core = RG.runCases(RG.DIR, { spec: id }); P += core.pass; F += core.fail; }
  console.log(F ? `\n전문 봇 회귀 ${F}건 실패 (통과 ${P}, 건너뜀 ${S_})` : `\n전문 봇 회귀 통과 (${P}개 케이스, 건너뜀 ${S_})`); process.exit(F || (S_ && arg('strict')) ? 1 : 0);
}
