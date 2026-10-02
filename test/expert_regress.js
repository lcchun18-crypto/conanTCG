process.env.BOT_ENGINE = process.env.BOT_ENGINE || 'expert'; // v1.8.0: 기본 봇은 규칙 스크립트. 이 테스트는 이전 탐색 엔진을 검증한다
// Expert Decision Regression 러너: test/expert_cases/ 의 "고수 판단" 케이스를 다시 판단시켜, 이미 배운 고수 판단을 잃지 않았는지 검사한다.
//   node test/expert_regress.js                    기본 봇(케이스의 bot, 없으면 'pro' = 범용 Expert + knowledge)
//   node test/expert_regress.js --bot <id>         다른 봇으로 (예: 전문 봇 id, 'pro_v12' = v1.2 PRO)
//   node test/expert_regress.js --compare pro_v12  비교용으로 다른 봇의 판정도 함께 표시(통과/실패에는 영향 없음)
//   node test/expert_regress.js --file 003         파일 이름 일부로 골라 실행      --v  자세히(라인/요소 차이)
//   EXPERT_CASES_DIR=다른/폴더  로 추가 폴더도 실행
// 케이스 형식은 bot/expert/cases.js 상단 주석 참고. 새 케이스: node bot/expert/cli.js case add …
const fs = require('fs'), path = require('path');
const H = require('./helpers.js'), SIM = require('../bot/simulate.js'), REG = require('../bot/specialists/registry.js'), C = require('../bot/expert/cases.js'), EX = require('../bot/expert/explain.js');
const arg = k => { const i = process.argv.indexOf('--' + k); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const DIRS = [path.join(__dirname, 'expert_cases'), ...(process.env.EXPERT_CASES_DIR ? [path.resolve(process.env.EXPERT_CASES_DIR)] : [])];
let DB = null; const db = () => { if (!DB) DB = JSON.parse(fs.readFileSync(process.env.BOT_TEST_DB || path.join(__dirname, '../data/cards.json'), 'utf8')).cards; return DB; };

function runOne(item, botOverride, o = {}) {
  const c = item.c, errs = C.validateCase(c); if (errs.length) return { ok: false, err: errs.join('; ') };
  const ctx = { H, SIM, S: SIM.S, get DB() { return db(); }, base: path.dirname(item.path) };
  const R = C.buildState(c, ctx), d = SIM.who(R), seat = c.seat != null ? c.seat : d.seat, bot = botOverride || c.bot || 'pro';
  const pol = REG.policyFor(bot, seat, R), r = C.judge(R, seat, c, { policy: pol });
  return { ...r, bot };
}
function fmt(c, r) {
  const ks = Object.keys(r.values), e = c.expert;
  return ks.map(k => `${k}${k === e ? '★' : ''}=${r.values[k]}`).join(' ') + (r.chosen != null ? ` | 자유 선택: ${r.chosen}` : '');
}
function factorDiff(r, e, k) {
  const a = r.factors[e], b = r.factors[k]; if (!a || !b) return '';
  return EX.KEYS.map(x => [x, (a[x] || 0) - (b[x] || 0)]).filter(x => Math.abs(x[1]) >= 0.05).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 6).map(([x, v]) => `${EX.LABEL[x]} ${v > 0 ? '+' : ''}${Math.round(v * 100) / 100}`).join(', ');
}
function run(o = {}) {
  let pass = 0, fail = 0; const only = o.file, results = [];
  for (const dir of DIRS) for (const item of C.loadCases(dir)) {
    if (only && !item.file.includes(only)) continue;
    let r; try { r = runOne(item, o.bot); } catch (e) { r = { ok: false, err: String(e && e.message || e) }; }
    const c = item.c, tag = `[${r.bot || o.bot || c.bot || 'pro'}]`;
    if (r.err) { fail++; console.log('✗', tag, item.file, '—', c.name, '\n     오류:', r.err.slice(0, 400)); results.push({ file: item.file, ok: false }); continue; }
    if (r.ok) pass++; else fail++;
    console.log(r.ok ? '✓' : '✗', tag, item.file, '—', c.name, `(${fmt(c, r)})`);
    if (!r.ok || o.verbose) { for (const k of Object.keys(r.lines)) console.log(`     ${k}${k === c.expert ? '★' : ' '} ${r.lines[k]}`); for (const k of Object.keys(r.values)) if (k !== c.expert) { const fd = factorDiff(r, c.expert, k); if (fd) console.log(`     ${c.expert}−${k}: ${fd}`); } if (!r.ok) console.log('     고수 판단 이유:', c.reason); }
    if (o.compare) { try { const r2 = runOne(item, o.compare); console.log(`     비교 [${o.compare}]: ${r2.ok ? '고수와 같은 판단' : '다른 판단'} (${fmt(c, r2)})`); } catch (e) { console.log(`     비교 [${o.compare}] 오류: ${e.message}`); } }
    results.push({ file: item.file, ok: r.ok });
  }
  return { pass, fail, results };
}
module.exports = { run, runOne, DIRS };
if (require.main === module) {
  const r = run({ bot: arg('bot') === true ? null : arg('bot'), compare: arg('compare') === true ? null : arg('compare'), file: arg('file') === true ? null : arg('file'), verbose: !!arg('v') });
  console.log(r.fail ? `\n고수 판단 회귀 ${r.fail}건 실패 (통과 ${r.pass})` : `\n고수 판단 회귀 통과 (${r.pass}개 케이스)`); process.exit(r.fail ? 1 : 0);
}
