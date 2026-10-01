// 전문 봇 테스트 공용: mock specialist 만들기 / 내보내기 형식 덱 JSON 만들기 / 회귀 케이스용 작은 도우미
const U = require('./bot_util.js');
// 덱 빌더 "덱 파일 내보내기" 와 같은 모양의 JSON 객체
function exportDeck(name, d) { const cnt = {}; d.list.forEach(id => cnt[id] = (cnt[id] || 0) + 1); return { format: 'conan-deck', version: 1, name, case: d.kase, partner: d.partner, main: Object.entries(cnt).map(([id, n]) => ({ id, n })).sort((a, b) => a.id.localeCompare(b.id)) }; }
// 테스트 전용 mock specialist (실제 전문 봇은 아님) — deck: makeDeck 결과
const mockSpec = (id, deck, profile = {}, extra = {}) => ({ id, name: extra.name || ('Mock ' + id), desc: extra.desc || 'test', ...(extra.color ? { color: extra.color } : {}), deck: exportDeck(extra.deckName || ('deck_' + id), deck), profile });
// 회귀 케이스 expect 도우미
const moveOf = res => res.mv; const keyOfId = (R, id) => { const d = R.cards[id].d; return d.slice(d.indexOf(':') + 1); };
const plays = (R, res, k) => res.mv.tag === 'play' && keyOfId(R, res.mv.m.id) === k;
const attacks = (R, res, k, tk) => res.mv.tag === 'atkc' && keyOfId(R, res.mv.m.id) === k && (tk == null || keyOfId(R, res.mv.m.tid) === tk);
const ends = res => res.mv.tag === 'end';
module.exports = { U, exportDeck, mockSpec, moveOf, keyOfId, plays, attacks, ends };
