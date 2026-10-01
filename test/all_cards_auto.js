// "실제 플레이 효과 구현률 100%" 검증 (전체 카드 DB 필요: data/cards.json 또는 CARDS_DB)
//  1) 효과 문구가 있는 모든 카드는 엔진 정화기(cleanAb)를 통과한 뒤에도 ab 가 남고 manual 이 0건이다.
//  2) 이전에 manual 이었던 229장은 모두 mz_*.js 에 카드별 회귀 테스트(t('id_xxxx', ...))가 1개 이상 있다.
//  3) 수동 효과 도구(a:'fx' / 'peekclose') 는 서버가 받아주지 않는다(조작 불가).
//  4) 일반 화면(index.html)에는 수동/개발자 UI 가 없다.
const fs = require('fs'), path = require('path');
const S = require('../server.js'); const H = require('./helpers');
const DBP = process.env.CARDS_DB || path.join(__dirname, '../data/cards.json');
const db = JSON.parse(fs.readFileSync(DBP, 'utf8')).cards; const ids = Object.keys(db);
if (ids.length < 1200 && !process.env.CARDS_DB) { console.log(`SKIP: 전체 카드 DB(1,251장) 가 아님 (${ids.length}장) — data/cards.json 에 전체 DB 를 넣거나 CARDS_DB=... 로 지정하세요`); process.exit(0); }
let bad = 0; const fail = m => { bad++; console.log('  ✗ ' + m); };
let withFx = 0, auto = 0; const has = x => JSON.stringify(x).includes('"manual"');
for (const [id, c] of Object.entries(db)) { if (c.type === 'partner' || !String(c.fx || '').trim()) continue; withFx++; const ab = S.FX.cleanAb(c.ab || []);
  if (!ab.length) fail(`${id} ${c.n}: 효과 데이터 없음`); else if (has(ab)) fail(`${id} ${c.n}: manual 포함`); else auto++; }
console.log(`효과 카드 ${withFx}장 중 완전 자동 ${auto}장 (${(100 * auto / withFx).toFixed(1)}%)`);
const prev = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/prev_manual_229.json'), 'utf8')); const tested = new Set();
for (const f of fs.readdirSync(__dirname).filter(x => /^mz_.*\.js$/.test(x))) for (const m of fs.readFileSync(path.join(__dirname, f), 'utf8').matchAll(/^t\('(id_\d+)'/gm)) tested.add(m[1]);
const missing = prev.filter(x => !tested.has(x)); console.log(`이전 manual ${prev.length}장 중 카드별 테스트 보유 ${prev.length - missing.length}장`); missing.forEach(x => fail(`${x}: 카드별 테스트 없음`));
{ const R = H.game({ a: { n: 'A', type: 'char', color: 'blue', lv: '0', ap: '1000', lp: '1' } }, ['a'], ['a']); const s = R.turn; const id = H.give(R, s, 'a', 'hand'); const before = JSON.stringify(R.P[s].hand);
  for (const m of [{ a: 'fx', op: 'draw', n: 5 }, { a: 'fx', op: 'gain', n: 3 }, { a: 'fx', op: 'mv', id, to: 'rem' }, { a: 'peekclose' }]) { const e = H.act(R, s, m); if (!e) fail(`수동 도구 ${m.a}/${m.op || ''} 가 받아들여짐`); }
  if (JSON.stringify(R.P[s].hand) !== before) fail('수동 도구로 상태가 바뀜'); }
{ const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'); for (const w of ['id="devp"', 'cmenu', 'shMan', 'dev=1', "A('fx'", '수동 효과', '효과 도구', '직접 처리']) if (html.includes(w)) fail(`index.html 에 수동/개발자 UI 잔재: ${w}`); }
console.log(bad ? `all_cards_auto: ${bad}건 실패` : 'all_cards_auto: 통과'); if (bad) process.exitCode = 1;
