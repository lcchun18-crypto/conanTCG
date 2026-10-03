#!/usr/bin/env node
// own(소유자) 검증 (v1.11.0): cards.json 의 모든 능력을 실제 엔진으로 정리하면서, target / 트리거 주체 필터 중 own 이 비어 있는 것을 모아 보여 준다.
//   node tools/ownership_audit.js [cards.json] [--strict] [--json]
//   --strict : 하나라도 있으면 종료코드 1 (기본은 경고만, 종료코드 0)
// 비어 있는 target/subject 는 엔진이 플레이를 막지 않도록 제한 없이(양쪽) 처리하므로, 의도한 소유자를 data 에 명시하거나 data/ownership_review.csv 로 확인하세요.
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--')) || path.join(__dirname, '../data/cards.json');
const strict = args.includes('--strict'), asJson = args.includes('--json');
delete process.env.CONAN_DEFAULT_OWN;
const FX = require(path.join(__dirname, '../fx'))({ contact() {}, okc() {}, win() {}, D() {}, say() {}, shuf() {}, pull() {}, chk() {}, gain() {}, nm() {}, fcount() {}, cols() {}, ap() {}, lpOf() {} });
const db = JSON.parse(fs.readFileSync(file, 'utf8')).cards, out = [];
for (const [id, c] of Object.entries(db)) for (const x of FX.auditOwn(c.ab || [])) out.push({ card_id: id, card_name: c.n, ability_index: x.ab, ctx: x.ctx, op: x.op });
if (asJson) console.log(JSON.stringify(out)); else {
  const by = {}; out.forEach(x => { const k = `${x.ctx}:${x.op || '(ability)'}`; by[k] = (by[k] || 0) + 1; });
  console.log(`own 미지정 target/주체 필터: ${out.length}개 (카드 ${new Set(out.map(x => x.card_id)).size}장)`); Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ', k, n));
  if (out.length && !strict) console.log('  → 위 항목은 엔진이 제한 없이(양쪽) 처리합니다(fallback). 원문을 확인해 own 을 명시하세요.');
}
process.exit(strict && out.length ? 1 : 0);
