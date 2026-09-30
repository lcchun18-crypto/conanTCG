// 파서가 만든 ab 를 엔진 정화기(cleanAb)에 통과시켜, 값이 조용히 사라지거나 바뀌는 필드가 없는지 검사한다.
// 사용: node test/roundtrip.js db.json   (db.json = {cards:{id:{ab:[...]}}})   → 손실이 있으면 종료코드 1
const fs = require('fs'); const S = require('../server.js');
const db = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).cards;
const empty = v => v == null || v === '' || v === 0 || v === false || (Array.isArray(v) && !v.length) || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
function lost(a, b, path, out) {
  if (Array.isArray(a)) { if (!Array.isArray(b)) return out.push(path + ' (배열 손실)'); a.forEach((x, i) => lost(x, b[i], path + '[' + i + ']', out)); return; }
  if (a && typeof a === 'object') { if (!b || typeof b !== 'object') return out.push(path + ' (객체 손실)');
    for (const [k, v] of Object.entries(a)) { if (k === 'txt' || k === 'lab' || empty(v) || (k === 'k' && v === 'atk')) continue; if (!(k in b) || empty(b[k])) out.push(path + '.' + k); else lost(v, b[k], path + '.' + k, out); } return; }
  if (a !== b) out.push(path + ` (${JSON.stringify(a)} → ${JSON.stringify(b)})`);
}
let bad = 0; const kinds = {};
for (const [id, c] of Object.entries(db)) { if (!c.ab) continue; const cl = S.FX.cleanAb(c.ab); const out = [];
  c.ab.forEach((a, i) => lost(a, cl[i], `ab[${i}]`, out));
  if (out.length) { bad++; out.forEach(o => { const k = o.replace(/\[\d+\]/g, '').replace(/ \(.*/, ''); kinds[k] = (kinds[k] || 0) + 1; }); if (bad <= 15) console.log(id, out.slice(0, 4).join('; ')); } }
console.log(`라운드트립 손실 카드 ${bad}장`, JSON.stringify(kinds)); process.exit(bad ? 1 : 0);
