// v1.8.6: 개별 색 지정(data/color_overrides.json) + id_0548 / id_0930 색
const fs = require('fs'), os = require('os'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards;
ok(real.id_0548.color === 'white', 'cards.json: id_0548 = 백색 (' + real.id_0548.color + ')'); ok(real.id_0930.color === 'blue/black' && real.id_0930.type === 'case', 'cards.json: id_0930 = 청색/흑색 사건 (' + real.id_0930.color + ')');
// 옛 값이 들어 있는 cards.json 이어도 overrides 파일이 우선
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-')); const old = JSON.parse(JSON.stringify({ cards: { id_0548: { ...real.id_0548, color: 'yellow' }, id_0930: { ...real.id_0930, color: 'blue' } } }));
fs.writeFileSync(path.join(tmp, 'cards.json'), JSON.stringify(old)); fs.writeFileSync(path.join(tmp, 'color_overrides.json'), JSON.stringify({ id_0548: 'white', id_0930: 'blue/black', id_nope: 'red' }));
process.env.CARDS_JSON = path.join(tmp, 'cards.json'); const S = require('../server.js'); const c = JSON.parse(S.loadCards().body).cards;
ok(c.id_0548.color === 'white' && c.id_0930.color === 'blue/black', 'overrides 가 cards.json 의 옛 색을 덮어씀'); ok(!c.id_nope, '없는 카드 id 는 무시');
console.log(`color_override_test: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
