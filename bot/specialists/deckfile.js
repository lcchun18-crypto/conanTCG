// 덱 파일(JSON) 읽기/검증. 입력 형식은 덱 빌더의 "덱 파일 내보내기"가 만드는 JSON 그대로입니다:
//   { "format": "conan-deck", "version": 1, "name": "...", "case": "id_xxxx", "partner": "id_Pxxx", "main": [ { "id": "id_0001", "n": 3 }, ... ] }
// 검증에 실패하면 "무엇이 잘못됐는지"만 돌려줍니다. 카드를 바꾸거나 장수를 고치는 자동 보정은 절대 하지 않습니다.
const MAX_COPIES = 3, DECK_SIZE = 40;

// 구조 검사 (카드 DB 없이 가능)
function parseDeckFile(input) {
  const errors = []; let j = input;
  if (typeof input === 'string') { try { j = JSON.parse(input); } catch (e) { return { ok: false, errors: ['JSON 을 읽을 수 없습니다: ' + e.message] }; } }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, errors: ['덱 파일의 최상위가 객체가 아닙니다'] };
  if (j.format !== 'conan-deck') errors.push(`format 이 "conan-deck" 이 아닙니다 (현재: ${JSON.stringify(j.format)}) — 덱 빌더의 "덱 파일 내보내기"로 만든 파일이 아닙니다`);
  if (j.version !== 1) errors.push(`지원하지 않는 version 입니다 (현재: ${JSON.stringify(j.version)}, 지원: 1)`);
  const name = typeof j.name === 'string' ? j.name.trim() : ''; if (!name) errors.push('덱 이름(name)이 비어 있습니다');
  const kase = typeof j.case === 'string' ? j.case.trim() : '', partner = typeof j.partner === 'string' ? j.partner.trim() : '';
  if (!kase) errors.push('사건 카드(case)가 정확히 1장 지정되어야 합니다 (비어 있음)');
  if (!partner) errors.push('파트너 카드(partner)가 정확히 1장 지정되어야 합니다 (비어 있음)');
  const cards = {}, list = [];
  if (!Array.isArray(j.main)) errors.push('메인덱(main) 배열이 없습니다');
  else j.main.forEach((e, i) => {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id.trim()) return errors.push(`main[${i}] 항목에 카드 id 가 없습니다`);
    const id = e.id.trim(), n = e.n;
    if (!Number.isInteger(n) || n < 1) return errors.push(`main[${i}] ${id}: 장수(n)가 1 이상의 정수가 아닙니다 (${JSON.stringify(n)})`);
    if (cards[id] != null) return errors.push(`main[${i}] ${id}: 같은 카드가 main 에 두 번 나옵니다 (합쳐서 계산하지 않습니다 — 파일을 확인하세요)`);
    cards[id] = n; for (let k = 0; k < n; k++) list.push(id);
  });
  const deck = { name, kase, partner, cards, list, total: list.length };
  return { ok: !errors.length, errors, deck };
}

// 카드 DB(data/cards.json 의 cards 객체)와 대조
function validateDeck(deck, DB) {
  const errors = [], has = id => Object.prototype.hasOwnProperty.call(DB, id), nm = id => (DB[id] && DB[id].n) ? `${id} (${DB[id].n})` : id;
  const unknown = Object.keys(deck.cards).filter(id => !has(id)); if (unknown.length) errors.push(`카드 DB 에 없는 카드 ID: ${unknown.join(', ')}`);
  if (deck.kase && !has(deck.kase)) errors.push(`카드 DB 에 없는 사건 카드 ID: ${deck.kase}`); else if (deck.kase && DB[deck.kase].type !== 'case') errors.push(`사건 자리에 사건 카드가 아닌 카드가 있습니다: ${nm(deck.kase)} (type=${DB[deck.kase].type})`);
  if (deck.partner && !has(deck.partner)) errors.push(`카드 DB 에 없는 파트너 카드 ID: ${deck.partner}`); else if (deck.partner && DB[deck.partner].type !== 'partner') errors.push(`파트너 자리에 파트너 카드가 아닌 카드가 있습니다: ${nm(deck.partner)} (type=${DB[deck.partner].type})`);
  for (const [id, n] of Object.entries(deck.cards)) { if (!has(id)) continue; const d = DB[id];
    if (!['char', 'event'].includes(d.type)) errors.push(`메인덱에는 캐릭터/이벤트만 넣을 수 있습니다: ${nm(id)} (type=${d.type})`);
    const free = Array.isArray(d.ab) && d.ab.some(a => a && a.ic === 'deckfree'); if (n > MAX_COPIES && !free) errors.push(`같은 카드는 최대 ${MAX_COPIES}장입니다: ${nm(id)} ×${n}`); }
  if (deck.total !== DECK_SIZE) errors.push(`메인덱은 정확히 ${DECK_SIZE}장이어야 합니다 (현재 ${deck.total}장)`);
  return { ok: !errors.length, errors };
}
// 한 번에: 파일(문자열/객체) → 구조 검사 → DB 검사. 실패 시 errors 에 모두 모아서 반환.
function loadDeck(input, DB) {
  const p = parseDeckFile(input); if (!p.deck) return { ok: false, errors: p.errors, deck: null };
  const errors = [...p.errors]; if (DB) errors.push(...validateDeck(p.deck, DB).errors);
  return { ok: !errors.length, errors, deck: p.deck };
}
// 게임 서버가 쓰는 형태 ({cards:{id:n}, partner, kase}) 로 변환
const toBotDeck = deck => ({ cards: { ...deck.cards }, partner: deck.partner, kase: deck.kase, name: deck.name });
// 덱의 대표 색: 사건 카드의 color (없으면 메인덱 다수 색)
function deckColors(deck, DB) {
  const c = DB && DB[deck.kase] && DB[deck.kase].color; if (c) return String(c).toLowerCase().split(/[\/,&\s]+/).filter(Boolean);
  const cnt = {}; for (const [id, n] of Object.entries(deck.cards)) { const col = DB && DB[id] && DB[id].color; if (col) cnt[col] = (cnt[col] || 0) + n; }
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; return best ? [best[0]] : [];
}
module.exports = { parseDeckFile, validateDeck, loadDeck, toBotDeck, deckColors, MAX_COPIES, DECK_SIZE };
