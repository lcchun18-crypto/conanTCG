// 카드 DB(JSON)의 효과 데이터를 "서버 엔진의 정화기(sanitizer)"로 통과시켜 실제로 자동 처리 가능한지 판정한다.
// 사용: node test/check_db.js conan-db.json [--json]   → 완전 자동 / manual 포함 카드 수와 이유
const fs = require('fs'); const S = require('../server.js');
const file = process.argv[2]; const db = JSON.parse(fs.readFileSync(file, 'utf8')).cards;
const res = { total: 0, withFx: 0, auto: 0, manual: 0, cards: {} };
const has = x => JSON.stringify(x).includes('"manual"');
for (const [id, c] of Object.entries(db)) { res.total++; if (c.type === 'partner' || !String(c.fx || '').trim()) { res.cards[id] = { st: 'no-text' }; continue; }
  res.withFx++; const ab = S.FX.cleanAb(c.ab || []); const man = []; (function w(x) { if (Array.isArray(x)) x.forEach(w); else if (x && typeof x === 'object') { if (x.op === 'manual' || x.ic === 'manual') man.push(x.txt || ''); Object.values(x).forEach(w); } })(ab);
  const empty = !ab.length; const st = empty ? 'no-data' : has(ab) ? 'manual' : 'auto'; res.cards[id] = { st, n: c.n, man: [...new Set(man.filter(Boolean))] }; if (st === 'auto') res.auto++; else res.manual++; }
if (process.argv.includes('--json')) console.log(JSON.stringify(res)); else { console.log(`효과 있는 카드 ${res.withFx}장 중 엔진 기준 완전 자동 ${res.auto}장, manual/데이터 없음 ${res.manual}장`);
  for (const [id, r] of Object.entries(res.cards)) if (r.st === 'manual' || r.st === 'no-data') console.log(' ', id, r.n, r.st, r.man.join(' | ')); }
