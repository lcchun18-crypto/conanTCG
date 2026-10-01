// 덱 파일(덱 빌더 "덱 파일 내보내기" JSON) 읽기/검증 테스트. 사용자가 준 실제 우승덱 JSON(test/fixtures/decks)을 입력 형식 그대로 사용한다.
// 이 픽스처는 "파서 검증용" 이며 전문 봇으로 등록하지 않는다.
const fs = require('fs'), path = require('path'), DF = require('../bot/specialists/deckfile.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); c ? pass++ : fail++; };
const FX = path.join(__dirname, 'fixtures/decks'), read = f => fs.readFileSync(path.join(FX, f), 'utf8');
// 카드 DB 대역: 픽스처의 ID 를 타입에 맞게 채운 가짜 DB (실제 1,251장 DB 는 샌드박스에 없음 — 실제 DB 검증은 `cli.js validate` 로)
function dbFor(deck, extra = {}) { const db = {}; for (const id of Object.keys(deck.cards)) db[id] = { id, n: id, type: 'char', color: 'red' }; db[deck.kase] = { id: deck.kase, n: 'K', type: 'case', color: 'red' }; db[deck.partner] = { id: deck.partner, n: 'P', type: 'partner', color: 'red' }; return Object.assign(db, extra); }
for (const [f, name, kase, partner, kinds] of [['conan-deck_green.json', 'green', 'id_0666', 'id_P010', 18], ['conan-deck_fbi.json', 'fbi', 'id_0806', 'id_P012', 15]]) {
  const r = DF.parseDeckFile(read(f)); ok(r.ok && r.deck.name === name && r.deck.kase === kase && r.deck.partner === partner, `${f}: 이름/사건/파트너 자동 인식 (${r.deck.name}, ${r.deck.kase}, ${r.deck.partner})`);
  ok(r.deck.total === 40 && Object.keys(r.deck.cards).length === kinds && r.deck.list.length === 40, `${f}: 메인덱 40장, ${kinds}종, 장수 합산 ${r.deck.total}`);
  ok(Object.values(r.deck.cards).every(n => n >= 1 && n <= 3), `${f}: 각 카드 1~3장`);
  const db = dbFor(r.deck), v = DF.loadDeck(read(f), db); ok(v.ok, `${f}: (가짜 DB 대조) 규칙 검증 통과`);
  const bd = DF.toBotDeck(r.deck); ok(Object.values(bd.cards).reduce((a, b) => a + b, 0) === 40 && bd.kase === kase && bd.partner === partner, `${f}: 게임 서버용 덱 형식 변환`);
}
// 샌드박스 DB(117장 샘플)에는 이 덱의 카드가 없다 → "DB 에 없는 ID" 로 정확히 보고하고, 덱을 고치지 않는다
try { const DB = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).cards; const r = DF.loadDeck(read('conan-deck_fbi.json'), DB);
  if (!DB.id_0133) { ok(!r.ok && r.errors.some(e => /카드 DB 에 없는 카드 ID/.test(e)) && r.deck.total === 40, '작은 샘플 DB 에서는 없는 카드 ID 를 보고하고 덱 내용은 그대로 (자동 보정 없음)'); } else ok(r.ok, '실제 DB: fbi 덱 검증 통과'); } catch (e) { console.log('(DB 없음 — 건너뜀)'); }
// 오류 사례 — 각각 "무엇이 잘못됐는지" 를 알려야 하고 임의 보정이 없어야 한다
const base = () => JSON.parse(read('conan-deck_fbi.json')), p = base(), db0 = dbFor(DF.parseDeckFile(p).deck);
const bad = (mut, re, msg, dbm) => { const j = base(); mut(j); const db = dbFor(DF.parseDeckFile(base()).deck); if (dbm) dbm(db, j); const r = DF.loadDeck(j, db); ok(!r.ok && r.errors.some(e => re.test(e)), `${msg} → ${r.errors.find(e => re.test(e)) || r.errors[0] || '(오류 없음!)'}`); return r; };
bad(j => { j.main.push({ id: 'id_9999', n: 1 }); j.main[0].n = 2; }, /DB 에 없는 카드 ID: id_9999/, '존재하지 않는 카드 ID', null);
bad(j => { j.main[0].n = 4; }, /최대 3장/, '같은 카드 4장');
bad(j => { j.main[0].n = 2; }, /정확히 40장.*현재 39장/, '메인덱 39장');
bad(j => { j.main[0].n = 3; j.main[1].n = 3; }, /정확히 40장.*현재 42장|현재 4\d장/, '메인덱 40장 초과');
bad(j => { j.case = ''; }, /사건 카드\(case\)/, '사건 없음'); bad(j => { delete j.partner; }, /파트너 카드\(partner\)/, '파트너 없음');
bad(j => { j.case = 'id_0133'; }, /사건 자리에 사건 카드가 아닌 카드/, '사건 자리에 캐릭터 카드');
bad(j => { j.partner = 'id_0806'; }, /파트너 자리에 파트너 카드가 아닌 카드|DB 에 없는 파트너/, '파트너 자리에 사건 카드', (db, j) => {});
bad(j => { j.main.push({ id: 'id_0133', n: 1 }); }, /두 번 나옵니다/, 'main 에 같은 카드 중복 항목 (합산하지 않음)');
bad(j => { j.main[0].n = 0; }, /장수\(n\)/, '장수 0'); bad(j => { j.main[0].n = '3'; }, /장수\(n\)/, '장수가 문자열');
bad(j => { j.format = 'other'; }, /format/, '다른 형식 파일'); bad(j => { j.version = 2; }, /version/, '지원하지 않는 버전'); bad(j => { j.name = ' '; }, /덱 이름/, '덱 이름 없음'); bad(j => { delete j.main; }, /main/, 'main 없음');
bad(j => { j.main = [{ id: 'id_0133', n: 3 }, { id: 'id_9', n: 'x' }]; }, /장수\(n\)/, '일부 항목 깨짐');
bad(j => { j.main[0].n = 4; }, /최대 3장/, 'deckfree 아닌 카드 4장', (db) => { });
{ const j = base(); j.main[0].n = 4; j.main[1].n = 1; /* 총 40 유지 불가능해도 deckfree 예외만 본다 */ const db = dbFor(DF.parseDeckFile(j).deck); db[j.main[0].id].ab = [{ ic: 'deckfree' }]; const r = DF.validateDeck(DF.parseDeckFile(j).deck, db); ok(!r.errors.some(e => /최대 3장/.test(e)), 'deckfree 카드는 3장 초과 허용 (게임 규칙과 동일)'); }
{ const r = DF.loadDeck('{oops', null); ok(!r.ok && /JSON/.test(r.errors[0]), '깨진 JSON → ' + r.errors[0]); }
{ const j = base(), before = JSON.stringify(j); const r = DF.loadDeck(j, dbFor(DF.parseDeckFile(j).deck)); ok(JSON.stringify(j) === before, '입력 객체를 수정하지 않음'); }
console.log(fail ? `\n덱 파일 테스트 ${fail}건 실패` : `\n덱 파일 테스트 통과 (${pass}개 검사)`); process.exit(fail ? 1 : 0);
