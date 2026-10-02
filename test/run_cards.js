process.env.CONAN_DEFAULT_OWN = process.env.CONAN_DEFAULT_OWN || 'any'; // v1.8.4: 이 테스트는 "대상 미지정 = 양쪽" 이던 옛 규칙 기준 시나리오 (새 규칙은 own_default_test.js)
// 카드별 회귀 테스트 전체 실행기: 전체 카드 DB(data/cards.json 또는 CARDS_DB)로 mz_*.js 를 모두 돌리고 roundtrip/전수 검사까지 한다.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const DBP = path.resolve(process.env.CARDS_DB || path.join(__dirname, '../data/cards.json')); const env = { ...process.env, CARDS_DB: DBP };
const n = Object.keys(JSON.parse(fs.readFileSync(DBP, 'utf8')).cards).length;
if (n < 1200 && !process.env.CARDS_DB) { console.log(`SKIP: 전체 카드 DB 가 아님 (${n}장)`); process.exit(0); }
const jobs = [['all_cards_auto.js'], ['roundtrip.js', DBP], ...fs.readdirSync(__dirname).filter(f => /^mz_(?!util).*\.js$/.test(f)).sort().map(f => [f])]; let bad = 0;
for (const [f, ...a] of jobs) { const r = spawnSync('node', [path.join(__dirname, f), ...a], { env, encoding: 'utf8', timeout: 600000 }); const out = (r.stdout || '') + (r.stderr || ''); const last = out.trim().split('\n').filter(l => /통과|실패|loss|손실|SKIP|lost/.test(l)).slice(-1)[0] || out.trim().split('\n').slice(-1)[0];
  console.log(`${r.status === 0 ? '✓' : '✗'} ${f}: ${last}`); if (r.status !== 0) { bad++; console.log(out.split('\n').filter(l => /✗|FAIL|Error/.test(l)).slice(0, 12).join('\n')); } }
console.log(bad ? `카드 테스트 ${bad}개 파일 실패` : '카드 테스트 전부 통과'); if (bad) process.exitCode = 1;
