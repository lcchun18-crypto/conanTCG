// 효과가 다양한 테스트 전용 메모리 DB (색은 red 로 통일). data/cards.json 은 건드리지 않는다.
const fs = require('fs'), path = require('path');
const fx = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')).cards;
function buildStressDb() { const db = {}; for (const src of [fx('full_samples.json'), fx('sample100.json')]) for (const [k, c] of Object.entries(src)) { if (db[k]) continue; if (!c.id || !['char', 'event', 'case', 'partner'].includes(c.type)) continue; db[k] = { ...c, color: 'red', ab: typeof c.ab === 'string' ? JSON.parse(c.ab) : (c.ab || []) }; }
  for (const c of Object.values(db)) if (c.type === 'case') { c.lv = c.lv || '3'; c.lv2 = c.lv2 || '4'; } return db; }
module.exports = { buildStressDb };
